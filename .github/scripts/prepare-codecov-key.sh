#!/usr/bin/env bash
set -euo pipefail

# The upstream Keybase endpoint returns 404. Fetch the same pinned Codecov identity
# from a public keyserver; fingerprint validation, not the server, establishes trust.
expected=27034E7FDB850E0BBC2C62FF806BB28AED779869
key_file=$(mktemp)
trap 'rm -f "$key_file"' EXIT

for attempt in 1 2 3; do
  if curl --fail --silent --show-error --location --retry 2 --retry-delay 2 \
    --retry-all-errors --connect-timeout 10 --max-time 20 \
    "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x${expected}" --output "$key_file"; then
    # Exactly one primary key; do not import additional attacker-supplied signing identities.
    if fingerprints=$(gpg --batch --with-colons --show-keys "$key_file"); then
      primary=$(printf '%s\n' "$fingerprints" | awk -F: '
        $1 == "pub" { primary = 1; next }
        primary && $1 == "fpr" { print $10; primary = 0 }
      ')
      if [[ "$primary" != "$expected" ]]; then
        echo "Unexpected Codecov signing-key fingerprint" >&2
        exit 1
      fi
      gpg --batch --import "$key_file"
      exit 0
    fi
  fi
  if [[ "$attempt" != 3 ]]; then sleep 2; fi
done

echo "Could not obtain a verified Codecov signing key" >&2
exit 1
