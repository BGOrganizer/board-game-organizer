#!/usr/bin/env bash
set -euo pipefail

target=$BGO_NETLIFY_STAGE
isolated=${BGO_NETLIFY_ISOLATED:-false}
ci_database=''
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]
test -n "$NETLIFY_AUTH_TOKEN"
[[ "$isolated" = false || ( "$isolated" = true && "$target" = development ) ]] || {
  printf 'Isolated Netlify deployments require the Development target.\n' >&2
  exit 1
}
case "$target" in
  development)
    test "$GITHUB_EVENT_NAME" = pull_request
    test "$(git rev-parse HEAD)" = "$SOURCE_SHA"
    test "$(git rev-parse HEAD^2)" = "$PR_HEAD_SHA"
    [[ "$PR_NUMBER" =~ ^[1-9][0-9]*$ ]]
    [[ "$GITHUB_RUN_ID" =~ ^[1-9][0-9]*$ ]]
    [[ "$GITHUB_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]]
    [[ "$CLERK_SECRET_KEY" = sk_test_* && "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" = pk_test_* ]]
    alias="pr-$PR_NUMBER-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
    if [ "$isolated" = true ]; then
      alias="ci-$alias"
      ci_database="bgo_ci_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}"
    fi
    flags=(--context branch-deploy --alias "$alias")
    domain_prefix="$alias--"
    deploy_context=branch-deploy
    clerk_target=preview
    ;;
  production)
    test "$GITHUB_EVENT_NAME" = push
    test "$GITHUB_REF" = refs/heads/main
    test "$(git rev-parse HEAD)" = "${RELEASE_SHA:-$SOURCE_SHA}"
    [[ "$CLERK_SECRET_KEY" = sk_live_* && "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" = pk_live_* ]]
    flags=(--context production --prod)
    domain_prefix=''
    deploy_context=production
    clerk_target=production
    ;;
  *) exit 1 ;;
esac

function require_current_source() {
  if [ "$target" = development ]; then
    node .github/scripts/ci-current-pr.mjs
  elif [ -n "$RELEASE_SHA" ]; then
    git fetch --no-tags origin main || return "$?"
    test "$(git rev-parse origin/main)" = "$RELEASE_SHA"
  else
    node .github/scripts/check-site-main.mjs "$GITHUB_REF" "$SOURCE_SHA"
  fi
}

function netlify_api() {
  curl --fail --silent --show-error --max-time 30 \
    --header "Authorization: Bearer $NETLIFY_AUTH_TOKEN" "https://api.netlify.com/api/v1/$1"
}

# Resolve only projects belonging to the operator's team. The deploy may never create or relink a site.
sites=$(netlify_api 'board-game-organizer/sites?per_page=100')
function site_id() {
  jq -er --arg name "$1" '[.[] | select(.name == $name and .account_slug == "board-game-organizer")] |
    if length == 1 then .[0].id else empty end | select(test("^[0-9a-f-]{36}$"))' <<<"$sites"
}

api_site="bgo-api-$target"
web_site="bgo-web-$target"
site_site="bgo-site-$target"
api_id=$(site_id "$api_site")
web_id=$(site_id "$web_site")
api_origin="https://$domain_prefix$api_site.netlify.app"
web_origin="https://$domain_prefix$web_site.netlify.app"
site_origin="https://$domain_prefix$site_site.netlify.app"
gateway_site="bgo-mcp-$target"

# Keep the Clerk secret used for attestation out of the CLI and build child environments.
clerk_attestation_key=$CLERK_SECRET_KEY
unset CLERK_SECRET_KEY
export BGO_NETLIFY_API_ORIGIN="$api_origin"
if [ "$target" = production ]; then
  export BGO_NETLIFY_SITE_WEB_ORIGIN=https://app.board-game-organizer.com
else
  export BGO_NETLIFY_SITE_WEB_ORIGIN="$web_origin"
fi

function attest_deploy() {
  local result=$1 expected_site=$2 name=$3 context=$4 deploy_id
  if ! deploy_id=$(jq -er --arg site "$expected_site" \
    'select(.site_id == $site) | .deploy_id | select(test("^[0-9a-f]{24}$"))' <<<"$result"); then
    printf 'Netlify CLI returned no verified deploy ID for %s.\n' "$name" >&2
    return 1
  fi
  if ! netlify_api "deploys/$deploy_id" | jq -er --arg site "$expected_site" --arg id "$deploy_id" \
    --arg name "$name" --arg context "$context" --arg alias "${alias:-}" \
    -f .github/actions/netlify-deploy/permalink.jq; then
    printf 'Netlify deploy %s did not match the ready %s deployment for %s.\n' \
      "$deploy_id" "$context" "$name" >&2
    return 1
  fi
}

function deploy_next() {
  local app=$1 project_id=$2 name="bgo-$1-$target" response
  shift 2
  require_current_source >&2 || return "$?"
  if ! response=$(netlify deploy --filter "apps/$app" --site "$project_id" \
    --message "$SOURCE_SHA" --json "${flags[@]}" "$@"); then
    printf 'Netlify CLI could not build or deploy %s.\n' "$name" >&2
    return 1
  fi
  attest_deploy "$response" "$project_id" "$name" "$deploy_context"
}

# Keep browser access scoped to this Web deploy. Only isolated deploys override the database.
api_env=(--env "BGO_NETLIFY_STAGE=$target" --env "BGO_NETLIFY_WEB_ORIGIN=$web_origin")
if [ "$isolated" = true ]; then
  api_env+=(--env "MONGODB_DB_NAME=$ci_database")
else
  clerk_issuer=$(node --input-type=module - "$clerk_target" <<'JS'
import { clerkFrontendOrigin } from './.github/scripts/clerk-target.mjs';
console.log(clerkFrontendOrigin(process.argv[2], process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY));
JS
  )
  api_env+=(--env "MCP_RESOURCE_URL=https://$gateway_site.netlify.app/mcp" --env "MCP_CLERK_ISSUER=$clerk_issuer")
fi
api_deploy=$(BGO_CI_DB_NAME="$ci_database" deploy_next api "$api_id" "${api_env[@]}")
curl --fail --silent --show-error --retry 3 --max-time 30 "$api_deploy/api/health" |
  jq -e '.ok == true and .service == "board-game-organizer-api"' >/dev/null
curl --fail --silent --show-error --max-time 30 "$api_deploy/api/admin/sync-user" \
  --header "Authorization: Bearer $clerk_attestation_key" |
  jq -e --arg expected "$ci_database" -f .github/actions/netlify-deploy/database.jq >/dev/null || {
    printf 'Netlify API database attestation failed for %s.\n' "$api_site" >&2
    exit 1
  }

web_deploy=$(deploy_next web "$web_id")
for url in "$web_deploy/" "$web_origin/" "$api_origin/api/health"; do
  curl --fail --silent --show-error --retry 3 --max-time 30 "$url" -o /dev/null
done
{
  printf 'api-url=%s\napi-client-url=%s\n' "$api_deploy" "$api_origin"
  printf 'web-url=%s\nweb-client-url=%s\n' "$web_deploy" "$web_origin"
  printf 'ci-db-name=%s\n' "$ci_database"
} >>"$GITHUB_OUTPUT"
{
  if [ "$isolated" = true ]; then printf '### Netlify CI\n\n'; else printf '### Netlify %s\n\n' "$target"; fi
  printf -- '- [API](%s) · [Deploy](%s)\n' "$api_origin" "$api_deploy"
  printf -- '- [Web](%s) · [Deploy](%s)\n' "$web_origin" "$web_deploy"
} >>"$GITHUB_STEP_SUMMARY"

if [ "$isolated" = true ]; then exit 0; fi
info_id=$(site_id "$site_site")
site_deploy=$(deploy_next site "$info_id")
for url in "$site_deploy/" "$site_origin/"; do
  curl --fail --silent --show-error --retry 3 --max-time 30 "$url" -o /dev/null
done
printf 'site-url=%s\n' "$site_deploy" >>"$GITHUB_OUTPUT"
printf -- '- [Site](%s) · [Deploy](%s)\n' "$site_origin" "$site_deploy" >>"$GITHUB_STEP_SUMMARY"

if [ "$target" = development ] && [ "$GATEWAY_PR" != "$PR_NUMBER" ]; then
  exit 0
fi
gateway_id=$(site_id "$gateway_site")
gateway_stage=$(mktemp -d "$RUNNER_TEMP/bgo-netlify-gateway.XXXXXX")
trap 'rm -rf -- "$gateway_stage"' EXIT
mkdir -p "$gateway_stage/public" "$gateway_stage/functions"
bun build apps/mcp/netlify-gateway.mts --target=node --format=esm \
  --outfile="$gateway_stage/functions/mcp.mjs"
require_current_source
gateway_result=$(cd "$gateway_stage" && netlify deploy --no-build --dir public \
  --functions functions --site "$gateway_id" --prod --json --message "$SOURCE_SHA" \
  --env "BGO_NETLIFY_STAGE=$target" --env "BGO_MCP_UPSTREAM_URL=$api_origin")
gateway_deploy=$(attest_deploy "$gateway_result" "$gateway_id" "$gateway_site" production)
curl --fail --silent --show-error --retry 3 --max-time 30 \
  "$gateway_deploy/.well-known/oauth-protected-resource/mcp" |
  jq -e --arg endpoint "https://$gateway_site.netlify.app/mcp" '.resource == $endpoint' >/dev/null
printf 'gateway-url=https://%s.netlify.app/mcp\n' "$gateway_site" >>"$GITHUB_OUTPUT"
printf -- '- [MCP](https://%s.netlify.app/mcp) · [Deploy](%s)\n' \
  "$gateway_site" "$gateway_deploy" >>"$GITHUB_STEP_SUMMARY"
