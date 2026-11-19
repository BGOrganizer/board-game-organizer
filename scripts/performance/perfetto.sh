#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version=59.1
install_dir="$repo_root/.tools/perfetto/$version"
if [ "${1:-}" = --install ]; then
  case "$(uname -s)/$(uname -m)" in
    Linux/aarch64|Linux/arm64) arch=linux-arm64; checksum=8f59e2cf7197c8de388ab4765a650eaf1774a405b1753c54a9741910b6f11350 ;;
    Linux/x86_64) arch=linux-amd64; checksum=7deb8c2572c6ae7ec80cd719d388041079827b0c44a1659694d5d88faa4f501e ;;
    *) printf 'The pinned Perfetto installer supports Linux ARM64 and AMD64 only.\n' >&2; exit 2 ;;
  esac
  mkdir -p "$install_dir"
  stage="$(mktemp -d "$install_dir/.install.XXXXXX")"
  trap 'rm -rf "$stage"' EXIT
  curl -fsSL --proto '=https' --proto-redir '=https' --retry 2 --max-time 180 \
    "https://github.com/google/perfetto/releases/download/v$version/$arch.zip" -o "$stage/tools.zip"
  printf '%s  %s\n' "$checksum" "$stage/tools.zip" | sha256sum --check --status
  python3 - "$stage/tools.zip" "$stage/trace_processor_shell" <<'PY'
import pathlib, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    entries = [n for n in archive.namelist() if n.split('/')[-1] == 'trace_processor_shell']
    if len(entries) != 1:
        raise SystemExit('Expected exactly one official trace_processor_shell')
    pathlib.Path(sys.argv[2]).write_bytes(archive.read(entries[0]))
PY
  curl -fsSL --proto '=https' --proto-redir '=https' --retry 2 --max-time 60 \
    "https://raw.githubusercontent.com/google/perfetto/v$version/tools/record_android_trace" -o "$stage/record_android_trace"
  printf '%s  %s\n' 3ddaeac2c8071e079f7f76e002a880e0fc44a13a4d710817081e7223c9693388 "$stage/record_android_trace" | sha256sum --check --status
  chmod +x "$stage/trace_processor_shell"
  mv -f "$stage/trace_processor_shell" "$stage/record_android_trace" "$install_dir/"
  "$install_dir/trace_processor_shell" --version
  exit
fi
if [ ! -x "$install_dir/trace_processor_shell" ] || [ ! -f "$install_dir/record_android_trace" ]; then
  printf 'Install the pinned Perfetto tools first: bun run perfetto:install\n' >&2
  exit 1
fi
if [ "${1:-}" = --record ]; then
  shift
  exec python3 "$install_dir/record_android_trace" "$@"
fi
exec "$install_dir/trace_processor_shell" "$@"
