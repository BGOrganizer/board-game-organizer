#!/usr/bin/env bash
# Cleans up Clerk E2E test users (Board Game Organizer CI).
#
# Usage:
#   cleanup-e2e-clerk-users.sh [user_id ...]
#
# 1. Deletes the users provisioned for THIS run (the user_ids captured when
#    they were created), so one run = its users and they never accumulate.
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
MAX_AGE_SECONDS="${E2E_USER_MAX_AGE_SECONDS:-86400}"
CUTOFF=$(( $(date +%s) - MAX_AGE_SECONDS ))

delete_user() {
  local id="$1"
  local code
  for attempt in 1 2 3; do
    if ! code=$(curl -sS -o /dev/null -w "%{http_code}" -X DELETE "$API/users/$id" -H "$AUTH"); then
      code="network-error"
    fi
    case "$code" in
      200 | 202 | 204 | 404)
        echo "  ✓ deleted $id (HTTP $code)"
        return 0
        ;;
    esac
    echo "  ⚠ delete $id attempt $attempt failed (HTTP $code)" >&2
    sleep "$attempt"
  done
  return 1
}

failures=0

# 1) The users provisioned for this run (empty if provisioning failed earlier).
for id in "$@"; do
  if [ -n "${id:-}" ]; then
    echo "Deleting this run's E2E user: $id"
    delete_user "$id" || failures=$((failures + 1))
  fi
done

# 2) Orphan sweep: stale e2e users (>24h old) from interrupted runs.
echo "Sweeping E2E users older than ${MAX_AGE_SECONDS}s..."
TMP="$(mktemp)"
PAGE="$(mktemp)"
trap 'rm -f "$TMP" "$PAGE"' EXIT
for offset in $(seq 0 100 9900); do
  curl -fsS "$API/users?limit=100&offset=$offset" -H "$AUTH" -o "$PAGE"
  jq -r '.[] | select(.public_metadata.e2e == true) | [.id, .created_at] | @tsv' "$PAGE" \
    >> "$TMP"
  [ "$(jq 'length' "$PAGE")" -lt 100 ] && break
done

swept=0
while IFS=$'\t' read -r id created_at; do
  [ -z "${id:-}" ] && continue
  created_at=${created_at%$'\r'}
  if [[ "$created_at" =~ ^[0-9]+$ ]]; then
    created_epoch=$((created_at / 1000))
  else
    created_epoch=$(date -d "$created_at" +%s 2>/dev/null || echo 0)
  fi
  if [ "$created_epoch" -gt 0 ] && [ "$created_epoch" -lt "$CUTOFF" ]; then
    if delete_user "$id"; then
      swept=$((swept + 1))
    else
      failures=$((failures + 1))
    fi
  fi
done < "$TMP"
echo "Sweep done: deleted $swept stale user(s), $failures failure(s)."
[ "$failures" -eq 0 ]
