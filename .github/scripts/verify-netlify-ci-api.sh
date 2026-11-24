#!/usr/bin/env bash
set -euo pipefail

API_URL=${1:?immutable API URL required}
RUN_ID=${2:?CI run ID required}
DB_NAME=${3:?CI database name required}
: "${NETLIFY_AUTH_TOKEN:?Netlify token required}"
TEAM=${NETLIFY_TEAM_SLUG:-board-game-organizer}
[[ "$TEAM" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || exit 1

[[ "$RUN_ID" =~ ^[1-9][0-9]*$ && "$DB_NAME" =~ ^bgo_ci_${RUN_ID}_([1-9][0-9]*)$ ]] || exit 1
DB_ATTEMPT=${BASH_REMATCH[1]}
[[ "$API_URL" =~ ^https://([a-f0-9]{24})--bgo-api-development[.]netlify[.]app$ ]] || exit 1
DEPLOY_ID=${BASH_REMATCH[1]}

netlify_api() {
  curl -fsS --retry 3 --max-time 30 -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
    "https://api.netlify.com/api/v1/$1"
}

# Artifacts and selected job outputs are untrusted. Authorize the exact deploy at the provider.
SITE_ID=$(netlify_api "$TEAM/sites?name=bgo-api-development&per_page=100" |
  jq -er --arg team "$TEAM" '[.[] | select(.name == "bgo-api-development" and .account_slug == $team)] |
    if length == 1 then .[0].id else empty end | select(test("^[0-9a-f-]{36}$"))')
DEPLOYMENT=$(netlify_api "deploys/$DEPLOY_ID")
ALIAS=$(jq -er --arg pattern "^ci-pr-[1-9][0-9]*-$RUN_ID-$DB_ATTEMPT$" \
  '.branch | select(type == "string" and test($pattern))' <<<"$DEPLOYMENT")
URL=$(jq -er --arg id "$DEPLOY_ID" --arg site "$SITE_ID" --arg name bgo-api-development \
  --arg context branch-deploy --arg alias "$ALIAS" -f .github/actions/netlify-deploy/permalink.jq \
  <<<"$DEPLOYMENT")
test "$URL" = "$API_URL"
