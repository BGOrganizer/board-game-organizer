#!/usr/bin/env bash
set -euo pipefail

target=$BGO_NETLIFY_STAGE
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]
test -n "$NETLIFY_AUTH_TOKEN"
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
    flags=(--context deploy-preview --alias "$alias")
    domain_prefix="$alias--"
    ;;
  production)
    test "$GITHUB_EVENT_NAME" = push
    test "$GITHUB_REF" = refs/heads/main
    test "$(git rev-parse HEAD)" = "${RELEASE_SHA:-$SOURCE_SHA}"
    [[ "$CLERK_SECRET_KEY" = sk_live_* && "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" = pk_live_* ]]
    flags=(--context production --prod)
    domain_prefix=''
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
info_id=$(site_id "$site_site")
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
  local result=$1 expected_site=$2 draft=$3 deploy_id
  deploy_id=$(jq -er --arg site "$expected_site" \
    'select(.site_id == $site) | .deploy_id | select(test("^[0-9a-f]{24}$"))' <<<"$result")
  netlify_api "deploys/$deploy_id" | jq -er --arg site "$expected_site" --arg id "$deploy_id" \
    --argjson draft "$draft" 'select(.id == $id and .site_id == $site and .state == "ready" and .draft == $draft)
    | .deploy_ssl_url | select(test("^https://" + $id + "--[a-z0-9-]+[.]netlify[.]app$"))'
}

function deploy_next() {
  local app=$1 project_id=$2 draft=false
  shift 2
  require_current_source >&2 || return "$?"
  if [ "$target" = development ]; then draft=true; fi
  netlify deploy --filter "apps/$app" --site "$project_id" \
    --message "$SOURCE_SHA" --json "${flags[@]}" "$@" |
    { response=$(cat); attest_deploy "$response" "$project_id" "$draft"; }
}

# Scope browser origins to this Web deploy. Keep the existing application origins from Infisical.
api_deploy=$(deploy_next api "$api_id" \
  --env "BGO_NETLIFY_STAGE=$target" --env "BGO_NETLIFY_WEB_ORIGIN=$web_origin" \
  --env "MCP_RESOURCE_URL=https://$gateway_site.netlify.app/mcp")
curl --fail --silent --show-error --retry 3 --max-time 30 "$api_deploy/api/health" |
  jq -e '.ok == true and .service == "board-game-organizer-api"' >/dev/null
curl --fail --silent --show-error --max-time 30 "$api_deploy/api/admin/sync-user" \
  --header "Authorization: Bearer $clerk_attestation_key" |
  jq -e --arg target "$target" '.databaseName as $db |
    ($db | type == "string" and length > 0 and (startswith("bgo_ci_") | not)) and
    ((.webhookDatabaseName // $db) == $db) and
    ($target == "production" or .webhookDbReady == true)' >/dev/null

web_deploy=$(deploy_next web "$web_id")
site_deploy=$(deploy_next site "$info_id")
for url in "$web_deploy/" "$site_deploy/" "$web_origin/" "$site_origin/" "$api_origin/api/health"; do
  curl --fail --silent --show-error --retry 3 --max-time 30 "$url" -o /dev/null
done
{
  printf '### Netlify %s\n\n' "$target"
  printf -- '- [API](%s) · [Deploy](%s)\n' "$api_origin" "$api_deploy"
  printf -- '- [Web](%s) · [Deploy](%s)\n' "$web_origin" "$web_deploy"
  printf -- '- [Site](%s) · [Deploy](%s)\n' "$site_origin" "$site_deploy"
} >>"$GITHUB_STEP_SUMMARY"

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
gateway_deploy=$(attest_deploy "$gateway_result" "$gateway_id" false)
curl --fail --silent --show-error --retry 3 --max-time 30 \
  "$gateway_deploy/.well-known/oauth-protected-resource/mcp" |
  jq -e --arg endpoint "https://$gateway_site.netlify.app/mcp" '.resource == $endpoint' >/dev/null
printf -- '- [MCP](https://%s.netlify.app/mcp) · [Deploy](%s)\n' \
  "$gateway_site" "$gateway_deploy" >>"$GITHUB_STEP_SUMMARY"
