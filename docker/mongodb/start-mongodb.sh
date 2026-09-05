#!/usr/bin/env bash
set -euo pipefail

rm -f /tmp/bgg-import-complete
/usr/local/bin/docker-entrypoint.sh "$@" &
mongo_pid=$!

cleanup() {
  kill -TERM "$mongo_pid" 2>/dev/null || true
  wait "$mongo_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' INT TERM

admin_uri="mongodb://localhost:27017/admin?directConnection=true"
until mongosh "$admin_uri" --quiet --eval 'quit(db.adminCommand({ ping: 1 }).ok ? 0 : 1)'; do
  sleep 1
done

mongosh "$admin_uri" --quiet --eval '
  try {
    rs.status();
  } catch (error) {
    if (error.codeName !== "NotYetInitialized") throw error;
    rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });
  }
'

until mongosh "$admin_uri" --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)'; do
  sleep 1
done

bash /scripts/import-bgg.sh
touch /tmp/bgg-import-complete
echo "MongoDB replica set rs0 and BGG catalog are ready."

wait "$mongo_pid"
