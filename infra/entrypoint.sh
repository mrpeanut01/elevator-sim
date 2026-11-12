#!/bin/sh
# The container's first process — DECISIONS.md § D1630.
#
# PostgreSQL (`ELEVATOR_SIM_DB=postgres://…`): run the server, exactly as before this file existed.
#
# SQLite (`ELEVATOR_SIM_DB=file:/data/elevator-sim.db`) with Blob settings present:
#   1. Restore the newest replica, if there is one. A storage or auth error stops the container,
#      so Container Apps keeps the previous revision serving instead of booting an empty store.
#   2. Refuse to start empty unless that is intended. No replica and no file means either a brand
#      new deployment or a lost replica, and only the operator can tell which: the cutover sets
#      ELEVATOR_SIM_IMPORT_FROM (the server then copies PostgreSQL in, `store/importer.ts`), and a
#      genuinely new deployment sets ELEVATOR_SIM_ALLOW_EMPTY_DB=1. Neither set is a refusal.
#   3. Run the server as Litestream's child, so Litestream replicates every write and does a final
#      sync when the server exits.
#
# SQLite with no Blob settings (a laptop, a test container) runs the server on the file directly.
set -eu

SERVER="node packages/server/dist/main.js"
CONFIG="${LITESTREAM_CONFIG:-/etc/litestream.yml}"

case "${ELEVATOR_SIM_DB:-}" in
  file:*) ELEVATOR_SIM_DB_PATH="${ELEVATOR_SIM_DB#file:}" ;;
  *) exec $SERVER ;;
esac
export ELEVATOR_SIM_DB_PATH

if [ -z "${AZURE_STORAGE_ACCOUNT:-}" ] || [ -z "${AZURE_BLOB_CONTAINER:-}" ]; then
  echo "[entrypoint] SQLite at ${ELEVATOR_SIM_DB_PATH} with no replica configured"
  exec $SERVER
fi

mkdir -p "$(dirname "$ELEVATOR_SIM_DB_PATH")"
for f in "$ELEVATOR_SIM_DB_PATH" "$ELEVATOR_SIM_DB_PATH-wal" "$ELEVATOR_SIM_DB_PATH-shm"; do
  if [ -e "$f" ]; then mv "$f" "$f.stale-$(date +%s)"; fi
done

echo "[entrypoint] litestream restore (if a replica exists)"
if ! litestream restore -if-replica-exists -config "$CONFIG" "$ELEVATOR_SIM_DB_PATH"; then
  echo "[entrypoint] FATAL: litestream restore failed; refusing to start on an empty store"
  exit 1
fi

if [ ! -e "$ELEVATOR_SIM_DB_PATH" ] && [ -z "${ELEVATOR_SIM_IMPORT_FROM:-}" ] && [ "${ELEVATOR_SIM_ALLOW_EMPTY_DB:-}" != "1" ]; then
  echo "[entrypoint] FATAL: no replica to restore. Set ELEVATOR_SIM_IMPORT_FROM to copy PostgreSQL in,"
  echo "[entrypoint] or ELEVATOR_SIM_ALLOW_EMPTY_DB=1 for a new deployment (infra/README.md § 8)"
  exit 1
fi

echo "[entrypoint] starting litestream replicate -> server"
exec litestream replicate -config "$CONFIG" -exec "$SERVER"
