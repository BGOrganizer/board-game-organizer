#!/usr/bin/env bash
# Trusted workflow_run cleanup after a failed/cancelled PR CI run.
set -euo pipefail

RUN_ID="${1:?run ID required}"
ATTEMPT="${2:?run attempt required}"
[[ "$RUN_ID" =~ ^[1-9][0-9]*$ && "$ATTEMPT" =~ ^[1-9][0-9]*$ ]] || exit 1
DB_NAME="bgo_ci_${RUN_ID}_${ATTEMPT}"
export E2E_RUN_KEY="${RUN_ID}_${ATTEMPT}"

ARTIFACT_NAME="ci-api-url-${ATTEMPT}"
ARTIFACT_ID=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$RUN_ID/artifacts?per_page=100" \
  --jq ".artifacts[] | select(.name == \"$ARTIFACT_NAME\" and .expired == false) | .id" | head -1) || exit 1
if [ -z "$ARTIFACT_ID" ]; then
  # The PR workflow uploads this URL before seeding or provisioning users.
  echo "No CI API URL artifact; no isolated CI resources were created."
  exit 0
fi

failures=0
# Username prefixes are generated from this run ID/attempt at provisioning time.
bash .github/scripts/cleanup-e2e-clerk-users.sh || failures=1

mkdir -p "$RUNNER_TEMP/ci-api-url"
GH_TOKEN="${GH_TOKEN:?GH_TOKEN required}" gh run download "$RUN_ID" \
  --name "$ARTIFACT_NAME" --dir "$RUNNER_TEMP/ci-api-url"
API_URL=$(cat "$RUNNER_TEMP/ci-api-url/ci-api-url.txt")
[[ "$API_URL" =~ ^https://[a-z0-9][a-z0-9-]*[.]vercel[.]app$ ]] || {
  echo "Invalid CI API URL artifact" >&2
  exit 1
}
HOST=${API_URL#https://}
: "${VERCEL_TOKEN:?}" "${VERCEL_ORG_ID:?}" "${VERCEL_API_PROJECT_ID:?}" \
  "${VERCEL_PROTECTION_BYPASS:?}" "${CLERK_SECRET_KEY:?}"

# workflow_run artifacts come from an untrusted PR: verify the deployment is
# owned by our API project before sending any credentials to its URL.
curl -fsS --retry 3 -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v13/deployments/$HOST?teamId=$VERCEL_ORG_ID" |
  jq -e --arg host "$HOST" --arg project "$VERCEL_API_PROJECT_ID" \
    '.url == $host and .projectId == $project and .target != "production"' > /dev/null

curl -fsS --retry 3 "$API_URL/api/admin/sync-user?x-vercel-protection-bypass=$VERCEL_PROTECTION_BYPASS" \
  -H "Authorization: Bearer $CLERK_SECRET_KEY" |
  jq -e --arg db "$DB_NAME" '.databaseName == $db' > /dev/null

curl -fsS --retry 3 -X POST \
  "$API_URL/api/admin/ci-db?x-vercel-protection-bypass=$VERCEL_PROTECTION_BYPASS" \
  -H "Authorization: Bearer $CLERK_SECRET_KEY" -H 'Content-Type: application/json' \
  -d "$(jq -cn --arg name "$DB_NAME" '{action:"cleanup",databaseName:$name}')" |
  jq -e '.ok == true' > /dev/null
exit "$failures"
