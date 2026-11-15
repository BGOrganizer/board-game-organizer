#!/usr/bin/env bash
set -euo pipefail
# Reviewed Maestro 2.11.0 release asset; never execute a moving remote installer.
archive_dir="$(mktemp -d)"
trap 'rm -rf "$archive_dir"' EXIT
curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --max-time 120 \
  https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.11.0/maestro.zip \
  -o "$archive_dir/maestro.zip"
printf '%s  %s\n' 5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a "$archive_dir/maestro.zip" | sha256sum --check --status
unzip -q "$archive_dir/maestro.zip" -d "$archive_dir"
mkdir -p "$HOME/.maestro"
cp -R "$archive_dir/maestro/." "$HOME/.maestro/"
printf '%s\n' "$HOME/.maestro/bin" >> "$GITHUB_PATH"
"$HOME/.maestro/bin/maestro" --version
