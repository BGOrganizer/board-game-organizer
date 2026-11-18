#!/usr/bin/env bash
set -euo pipefail
# Reviewed release asset; never execute a moving remote installer.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$(cat "$repo_root/.maestro-version")"
install_dir="${1:-$HOME/.maestro}"
archive_dir="$(mktemp -d)"
trap 'rm -rf "$archive_dir"' EXIT
curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --max-time 120 \
  "https://github.com/mobile-dev-inc/Maestro/releases/download/cli-$version/maestro.zip" \
  -o "$archive_dir/maestro.zip"
printf '%s  %s\n' 5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a "$archive_dir/maestro.zip" | sha256sum --check --status
python3 -m zipfile -e "$archive_dir/maestro.zip" "$archive_dir"
chmod +x "$archive_dir/maestro/bin/maestro"
mkdir -p "$install_dir"
cp -R "$archive_dir/maestro/." "$install_dir/"
if [ -n "${GITHUB_PATH:-}" ]; then
  printf '%s\n' "$install_dir/bin" >> "$GITHUB_PATH"
fi
"$install_dir/bin/maestro" --version
