#!/usr/bin/env bash
# Cleans up Clerk E2E test users (Board Game Organizer CI).
#
# Usage:
#   cleanup-e2e-clerk-users.sh [user_id]
#
# 1. Deletes the user provisioned for THIS run (the user_id captured when it
#    was created), so one run = one user and they never accumulate.
# 2. Sweeps orphaned test users left behind by runs that were killed before
#    cleanup could run: any user flagged public_metadata.e2e == true and
#    created more than 24h ago. The age filter keeps concurrent PR runs safe
#    (their users are minutes old, so they are never touched).
#
# Requires CLERK_SECRET_KEY in the environment. Idempotent and safe to rerun.
set -euo pipefail

CLERK_SECRET_KEY="${CLERK_SECRET_KEY:?CLERK_SECRET_KEY is required}"
API="https://api.clerk.com/v1"
AUTH="Authorization: Bearer $CLERK_SECRET_KEY"
CUTOFF=$(( $(date +%s) - 86400 ))

delete_user() {
  local id="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/users/$id" -H "$AUTH")
  case "$code" in
    200 | 202 | 204 | 404) echo "  ✓ deleted $id (HTTP $code)" ;;
    *) echo "  ⚠ failed to delete $id (HTTP $code)" >&2 ;;
  esac
}

# 1) The user provisioned for this run (empty if provisioning failed earlier).
if [ -n "${1:-}" ]; then
  echo "Deleting this run's E2E user: $1"
  delete_user "$1"
fi

# 2) Orphan sweep: stale e2e users (>24h old) from interrupted runs.
echo "Sweeping stale E2E users (public_metadata.e2e == true, created >24h ago)..."
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
for offset in 0 100 200 300 400; do
  curl -s "$API/users?limit=100&offset=$offset" -H "$AUTH" \
    | jq -r '.[] | select(.public_metadata.e2e == true) | [.id, .created_at] | @tsv' >> "$TMP"
done

swept=0
while read -r id created_at; do
  [ -z "${id:-}" ] && continue
  created_epoch=$(date -d "$created_at" +%s 2>/dev/null || echo 0)
  if [ "$created_epoch" -gt 0 ] && [ "$created_epoch" -lt "$CUTOFF" ]; then
    delete_user "$id"
    swept=$((swept + 1))
    [ "$swept" -ge 100 ] && break
  fi
done < "$TMP"
echo "Sweep done: deleted $swept stale user(s)."
