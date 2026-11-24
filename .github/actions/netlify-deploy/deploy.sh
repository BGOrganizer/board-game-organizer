#!/usr/bin/env bash
set -euo pipefail

team=${NETLIFY_TEAM_SLUG:-board-game-organizer}
[[ "$team" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]

target=$BGO_NETLIFY_STAGE
component=$BGO_NETLIFY_COMPONENT
isolated=${BGO_NETLIFY_ISOLATED:-false}
checkout_sha=${RELEASE_SHA:-$SOURCE_SHA}
ci_database=''

case "$component" in
  api|web|site|mcp) ;;
  *) printf 'Invalid Netlify component.\n' >&2; exit 1 ;;
esac
[[ "$isolated" = false || ( "$isolated" = true && "$target" = development && ( "$component" = api || "$component" = web ) ) ]] || {
  printf 'Isolated Netlify deployments require the Development API or Web.\n' >&2
  exit 1
}
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ && "$checkout_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$GITHUB_RUN_ID" =~ ^[1-9][0-9]*$ && "$GITHUB_RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]]
test -n "$NETLIFY_AUTH_TOKEN"
test "$(git rev-parse HEAD)" = "$checkout_sha"

case "$target" in
  development)
    test "$GITHUB_EVENT_NAME" = pull_request
    test "$checkout_sha" = "$SOURCE_SHA"
    test "$(git rev-parse HEAD^2)" = "$PR_HEAD_SHA"
    [[ "$PR_NUMBER" =~ ^[1-9][0-9]*$ ]]
    if [ "$component" = mcp ] && [ "${GATEWAY_PR:-}" != "$PR_NUMBER" ]; then
      printf 'This PR is not authorized to publish the stable Netlify Development MCP gateway.\n' >&2
      exit 1
    fi
    clerk_target=preview
    clerk_secret_prefix=sk_test_
    clerk_public_prefix=pk_test_
    ;;
  production)
    test "$GITHUB_EVENT_NAME" = push
    test "$GITHUB_REF" = refs/heads/main
    clerk_target=production
    clerk_secret_prefix=sk_live_
    clerk_public_prefix=pk_live_
    ;;
  *) exit 1 ;;
esac

# Keep the key used for API runtime attestation out of CLI and build child environments.
clerk_attestation_key=${CLERK_SECRET_KEY:-}
unset CLERK_SECRET_KEY
if [ "$component" = api ]; then
  [[ "$clerk_attestation_key" = "$clerk_secret_prefix"* && "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" = "$clerk_public_prefix"* ]]
elif [ "$component" = web ] && [ -n "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" ]; then
  [[ "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" = "$clerk_public_prefix"* ]]
fi

function require_current_source() {
  if [ "$target" = development ]; then
    node .github/scripts/ci-current-pr.mjs
  elif [ -n "${RELEASE_SHA:-}" ]; then
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
sites=$(netlify_api "$team/sites?per_page=100")
function site_id() {
  jq -er --arg name "$1" --arg team "$team" '[.[] | select(.name == $name and .account_slug == $team)] |
    if length == 1 then .[0].id else empty end | select(test("^[0-9a-f-]{36}$"))' <<<"$sites"
}

function branch_alias() {
  if [ "$target" = development ]; then
    local prefix=''
    if [ "$isolated" = true ]; then prefix='ci-'; fi
    printf '%spr-%s-%s-%s' "$prefix" "$PR_NUMBER" "$GITHUB_RUN_ID" "$1"
  fi
}

function client_origin() {
  local name=$1 deploy_alias=$2
  printf 'https://%s%s.netlify.app' "${deploy_alias:+$deploy_alias--}" "$name"
}

function verified_permalink() {
  local site=$1 id=$2 name=$3 context=$4 deploy_alias=$5
  jq -er --arg site "$site" --arg id "$id" --arg name "$name" --arg context "$context" \
    --arg alias "$deploy_alias" -f .github/actions/netlify-deploy/permalink.jq
}

function require_published_deploy() {
  local site=$1 id=$2 name=$3
  netlify_api "sites/$site" | jq -e --arg site "$site" --arg id "$id" --arg name "$name" --arg team "$team" '
    .id == $site and .name == $name and .account_slug == $team and .published_deploy.id == $id
  ' >/dev/null
}

# Netlify CLI stores --message as the deploy title. Bind downstream inputs to the tested
# source, release checkout and run while allowing a successful upstream job from an earlier attempt.
provenance="bgo:$SOURCE_SHA:$checkout_sha:$GITHUB_RUN_ID:"
attempt=$GITHUB_RUN_ATTEMPT
deploy_context=production
if [ "$target" = development ]; then deploy_context=branch-deploy; fi

function upstream_attempt() {
  local app=$1 url=$2 origin=$3
  local name="bgo-$app-$target" id site record title candidate deploy_alias permalink
  local pattern="^https://([0-9a-f]{24})--$name\.netlify\.app$"
  [[ "$url" =~ $pattern ]] || return 1
  id=${BASH_REMATCH[1]}
  site=$(site_id "$name") || return 1
  record=$(netlify_api "deploys/$id") || return 1
  title=$(jq -er '.title' <<<"$record") || return 1
  [[ "$title" = "$provenance"* ]] || return 1
  candidate=${title#"$provenance"}
  [[ "$candidate" =~ ^[1-9][0-9]*$ ]] || return 1
  if [[ ${#candidate} -gt ${#GITHUB_RUN_ATTEMPT} ||
        ( ${#candidate} -eq ${#GITHUB_RUN_ATTEMPT} && "$candidate" > "$GITHUB_RUN_ATTEMPT" ) ]]; then
    return 1
  fi

  deploy_alias=$(branch_alias "$candidate")
  permalink=$(verified_permalink "$site" "$id" "$name" "$deploy_context" "$deploy_alias" <<<"$record") || return 1
  [[ "$url" = "$permalink" && "$origin" = "$(client_origin "$name" "$deploy_alias")" ]] || return 1
  if [ "$target" = production ]; then
    require_published_deploy "$site" "$id" "$name" || return 1
  fi
  printf '%s' "$candidate"
}

upstream=''
case "$component" in
  web|mcp)
    upstream=api
    immutable_url=${API_URL:-}
    upstream_origin=${API_CLIENT_URL:-}
    ;;
  site)
    if [ "$target" = development ]; then
      upstream=web
      immutable_url=${WEB_URL:-}
      upstream_origin=${WEB_CLIENT_URL:-}
    fi
    ;;
esac
if [ -n "$upstream" ]; then
  if ! attempt=$(upstream_attempt "$upstream" "$immutable_url" "$upstream_origin"); then
    printf 'Netlify %s requires a verified same-run %s deployment.\n' "$component" "$upstream" >&2
    exit 1
  fi
fi

alias=$(branch_alias "$attempt")
if [ "$target" = development ]; then
  flags=(--context branch-deploy --alias "$alias")
else
  flags=(--context production --prod)
fi
deploy_title="$provenance$attempt"
project="bgo-$component-$target"
project_id=$(site_id "$project")
origin=$(client_origin "$project" "$alias")
gateway_site="bgo-mcp-$target"
canonical_api_origin=https://api.board-game-organizer.com
canonical_web_origin=https://app.board-game-organizer.com
mcp_resource="https://$gateway_site.netlify.app/mcp"
if [ "$target" = production ]; then mcp_resource="$canonical_api_origin/mcp"; fi

function attest_deploy() {
  local result=$1 name=$2 context=$3 deploy_id record permalink
  if ! deploy_id=$(jq -er --arg site "$project_id" \
    'select(.site_id == $site) | .deploy_id | select(test("^[0-9a-f]{24}$"))' <<<"$result"); then
    printf 'Netlify CLI returned no verified deploy ID for %s.\n' "$name" >&2
    return 1
  fi
  record=$(netlify_api "deploys/$deploy_id") || return "$?"
  if ! jq -e --arg title "$deploy_title" '.title == $title' <<<"$record" >/dev/null ||
     ! permalink=$(verified_permalink "$project_id" "$deploy_id" "$name" "$context" "$alias" <<<"$record"); then
    printf 'Netlify deploy %s did not match the ready %s deployment for %s.\n' \
      "$deploy_id" "$context" "$name" >&2
    return 1
  fi
  if [ "$context" = production ]; then
    require_published_deploy "$project_id" "$deploy_id" "$name" || return "$?"
  fi
  printf '%s' "$permalink"
}

function deploy_next() {
  local response
  require_current_source >&2 || return "$?"
  if ! response=$(netlify deploy --filter "apps/$component" --site "$project_id" \
    --message "$deploy_title" --json "${flags[@]}" "$@"); then
    printf 'Netlify CLI could not build or deploy %s.\n' "$project" >&2
    return 1
  fi
  attest_deploy "$response" "$project" "$deploy_context"
}

function smoke() {
  curl --fail --silent --show-error --retry 3 --max-time 30 "$1"
}

function verify_mcp_resource() {
  smoke "$1/.well-known/oauth-protected-resource/mcp" |
    jq -e --arg endpoint "$mcp_resource" '.resource == $endpoint' >/dev/null
}

case "$component" in
  api)
    web_origin=$(client_origin "bgo-web-$target" "$alias")
    if [ "$target" = production ]; then
      web_origin="$canonical_web_origin"
    fi
    export BGO_NETLIFY_SITE_WEB_ORIGIN="$web_origin"
    api_env=(--env "BGO_NETLIFY_STAGE=$target" --env "BGO_NETLIFY_WEB_ORIGIN=$web_origin")
    if [ "$isolated" = true ]; then
      ci_database="bgo_ci_${GITHUB_RUN_ID}_${attempt}"
      api_env+=(--env "MONGODB_DB_NAME=$ci_database")
    else
      clerk_issuer=$(node --input-type=module - "$clerk_target" <<'JS'
import { clerkFrontendOrigin } from './.github/scripts/clerk-target.mjs';
console.log(clerkFrontendOrigin(process.argv[2], process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY));
JS
      )
      api_env+=(--env "MCP_RESOURCE_URL=$mcp_resource" --env "MCP_CLERK_ISSUER=$clerk_issuer")
    fi
    deploy=$(BGO_CI_DB_NAME="$ci_database" deploy_next "${api_env[@]}")
    for url in "$deploy" "$origin"; do
      smoke "$url/api/health" | jq -e '.ok == true and .service == "board-game-organizer-api"' >/dev/null
    done
    if [ "$target" = production ]; then
      verify_mcp_resource "$deploy"
    fi
    curl --fail --silent --show-error --max-time 30 "$deploy/api/admin/sync-user" \
      --header "Authorization: Bearer $clerk_attestation_key" |
      jq -e --arg expected "$ci_database" -f .github/actions/netlify-deploy/database.jq >/dev/null || {
        printf 'Netlify API database attestation failed for %s.\n' "$project" >&2
        exit 1
      }
    printf 'api-url=%s\napi-client-url=%s\nci-db-name=%s\n' "$deploy" "$origin" "$ci_database" >>"$GITHUB_OUTPUT"
    ;;
  web)
    export BGO_NETLIFY_API_ORIGIN="$upstream_origin"
    api_health_origin="$upstream_origin"
    if [ "$target" = production ]; then
      export BGO_NETLIFY_API_ORIGIN="$canonical_api_origin"
      api_health_origin="$immutable_url"
    fi
    smoke "$api_health_origin/api/health" | jq -e '.ok == true and .service == "board-game-organizer-api"' >/dev/null
    deploy=$(deploy_next)
    smoke "$deploy/" >/dev/null
    smoke "$origin/" >/dev/null
    printf 'web-url=%s\nweb-client-url=%s\n' "$deploy" "$origin" >>"$GITHUB_OUTPUT"
    ;;
  site)
    if [ "$target" = production ]; then
      export BGO_NETLIFY_SITE_WEB_ORIGIN="$canonical_web_origin"
    else
      export BGO_NETLIFY_SITE_WEB_ORIGIN="$upstream_origin"
    fi
    deploy=$(deploy_next)
    smoke "$deploy/" >/dev/null
    smoke "$origin/" >/dev/null
    printf 'site-url=%s\n' "$deploy" >>"$GITHUB_OUTPUT"
    ;;
  mcp)
    gateway_stage=$(mktemp -d "$RUNNER_TEMP/bgo-netlify-gateway.XXXXXX")
    trap 'rm -rf -- "$gateway_stage"' EXIT
    mkdir -p "$gateway_stage/public" "$gateway_stage/functions"
    bun build apps/mcp/netlify-gateway.mts --target=node --format=esm \
      --outfile="$gateway_stage/functions/mcp.mjs"
    require_current_source
    gateway_result=$(cd "$gateway_stage" && netlify deploy --no-build --dir public \
      --functions functions --site "$project_id" --prod --json --message "$deploy_title" \
      --env "BGO_NETLIFY_STAGE=$target" --env "BGO_MCP_UPSTREAM_URL=$upstream_origin")
    gateway_deploy=$(attest_deploy "$gateway_result" "$project" production)
    deploy=$gateway_deploy
    origin="https://$gateway_site.netlify.app/mcp"
    for host in "$deploy" "${origin%/mcp}"; do
      verify_mcp_resource "$host"
    done
    printf 'gateway-url=%s\n' "$origin" >>"$GITHUB_OUTPUT"
    ;;
esac

printf -- '- [Netlify %s %s](%s) · [Deploy](%s)\n' \
  "$target" "$component" "$origin" "$deploy" >>"$GITHUB_STEP_SUMMARY"
