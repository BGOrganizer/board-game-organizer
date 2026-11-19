#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(cat "$repo_root/.maestro-version")"
install_dir="$repo_root/.tools/maestro/$version"
# Maestro unpacks native helpers under Java's user.home, even for --version.
runtime_dir="$repo_root/.tools/maestro/runtime"
mkdir -p "$runtime_dir"
export MAESTRO_OPTS="${MAESTRO_OPTS:-} \"-Duser.home=$runtime_dir\""
if [ "${1:-}" = --install ]; then
  exec bash "$repo_root/.github/scripts/install-maestro.sh" "$install_dir"
fi
if [ ! -x "$install_dir/bin/maestro" ] || [ ! -f "$install_dir/lib/maestro-cli-$version.jar" ]; then
  printf 'Maestro %s is not installed for this checkout. Run: bun run maestro:install\n' "$version" >&2
  exit 1
fi
exec "$install_dir/bin/maestro" "$@"
