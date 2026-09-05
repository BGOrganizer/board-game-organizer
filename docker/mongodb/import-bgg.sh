#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${BGG_CSV:?BGG_CSV is required}"

if [[ ! -s "$BGG_CSV" ]]; then
  echo "BGG CSV not found or empty: $BGG_CSV" >&2
  exit 1
fi

header="$(head -n 1 "$BGG_CSV" | tr -d '\r' | tr '[:upper:]' '[:lower:]')"
if [[ ",$header," != *",id,"* || ",$header," != *",name,"* || ",$header," != *",yearpublished,"* ]]; then
  echo "BGG CSV must contain id, name, and yearpublished columns." >&2
  exit 1
fi

echo "Loading BGG CSV into staging collection..."
mongoimport \
  --uri "$MONGODB_URI" \
  --collection _bggImport \
  --type csv \
  --headerline \
  --ignoreBlanks \
  --drop \
  --file "$BGG_CSV"

mongosh "$MONGODB_URI" --quiet --file /scripts/import-bgg.js
