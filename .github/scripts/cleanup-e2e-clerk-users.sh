#!/usr/bin/env bash
# Stable entrypoint for per-run recovery and verified orphan cleanup.
set -euo pipefail
exec node "$(dirname "$0")/cleanup-e2e-clerk-users.mjs" "$@"
