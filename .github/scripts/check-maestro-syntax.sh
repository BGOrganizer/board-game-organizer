#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
mapfile -d '' flows < <(find apps/mobile/.maestro/flows -type f \( -name '*.yaml' -o -name '*.yml' \) -print0 | sort -z)
if [ "${#flows[@]}" -eq 0 ]; then
  printf 'No Maestro flows found; refusing an empty syntax check.\n' >&2
  exit 1
fi
result=0
for flow in "${flows[@]}"; do
  printf 'Checking Maestro syntax: %s\n' "$flow"
  if ! bash scripts/maestro.sh check-syntax "$flow"; then
    result=1
  fi
done
exit "$result"
