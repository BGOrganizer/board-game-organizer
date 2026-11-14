#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${BGG_CSV:?BGG_CSV is required}"

if [[ ! -f "$BGG_CSV" || ! -s "$BGG_CSV" ]]; then
  echo "BGG CSV not found, not a file, or empty: $BGG_CSV" >&2
  exit 1
fi

header="$(head -n 1 "$BGG_CSV" | tr -d '\r' | tr '[:upper:]' '[:lower:]')"
for column in id name yearpublished rank bayesaverage average usersrated is_expansion abstracts_rank cgs_rank childrensgames_rank familygames_rank partygames_rank strategygames_rank thematic_rank wargames_rank; do
  if [[ ",$header," != *",$column,"* ]]; then
    echo "BGG CSV missing column: $column" >&2
    exit 1
  fi
done

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
