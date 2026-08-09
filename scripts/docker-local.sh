#!/usr/bin/env bash
#
# Run the production image locally, against a throwaway PostgreSQL.
#
#   ./scripts/docker-local.sh              # build, run, wait for health, print the URL
#   ./scripts/docker-local.sh --no-build   # reuse the image already built
#   ./scripts/docker-local.sh --down       # stop and remove both containers and the network
#   ./scripts/docker-local.sh --logs       # follow the app's logs
#
# ## Why this exists
#
# `npm run dev` runs the viewer through Vite and the server from source, which is the right loop for
# writing code and the wrong one for answering *"does the thing we deploy work?"*. The image is a
# different artifact: two stages, `--omit=dev`, compiled output only, `USER node`. Three of the four
# defects `infra/README.md` § 1 records were only visible in the image — a wrong `--platform`, a
# path that resolved differently under `/app`, and a dependency that was a devDependency in
# development and absent in production.
#
# ## Why there is a second container
#
# The image installs with `--omit=dev`, and `@electric-sql/pglite` — the PostgreSQL-compiled-to-WASM
# that development uses — is a devDependency. That is deliberate (`Dockerfile` § "The layout is
# load-bearing"): an entire database engine has no business in a production image. So the deployed
# artifact has no in-process database and `main.ts` refuses to boot without `ELEVATOR_SIM_DB`.
#
# Running the image therefore means running a PostgreSQL beside it, which is the whole reason this
# is a script rather than a `docker run` line in the README. The database is **throwaway**: no
# volume, no persistence, dropped by `--down`. Nothing here is a development database you should
# keep state in.
#
# ## What this deliberately does NOT do
#
# **It does not build `--platform linux/amd64`.** That flag is required for Azure and wrong here —
# on Apple Silicon it forces emulation and makes the container several times slower for no local
# benefit. `scripts/deploy-azure.sh` sets it for the deployment, which is the only place it matters.
# The consequence is honest and worth knowing: **this script cannot catch an architecture fault.**
# `infra/README.md` § 1 records one that cost an outage, and only the deploy path can see it.
#
# **It does not send mail, and it runs with `NODE_ENV=development` to say so.**
#
# The image sets `NODE_ENV=production`, and `bootstrap.ts:102` refuses to boot in production with
# the development mailer — because that mailer writes sign-in links to a file **in the clear**, and
# since § D241 each link signs somebody in. The refusal is right, and the first run of this script
# hit it, which is the correct outcome for a container with no mail configured.
#
# The error names both remedies; this takes the second one, `NODE_ENV=development`. **That flag
# gates exactly one thing in the whole server** — `grep NODE_ENV packages/server/src` is that single
# guard and nothing else. Routes, database, static serving, simulation and replay verification are
# byte-identical to production.
#
# So the one thing this run cannot exercise is the production-mailer refusal itself. Sign-in links
# are written to `/tmp/outbox.jsonl` **inside the container** — not the working directory, which is
# root-owned and read-only to `USER node`:
#
#   docker exec elevsim-local cat /tmp/outbox.jsonl

set -euo pipefail

APP_NAME="elevsim-local"
DB_NAME="elevsim-local-db"
NET_NAME="elevsim-local-net"
IMAGE="elevator-sim:local"
PORT="${ELEVSIM_LOCAL_PORT:-8787}"
ORIGIN="http://localhost:${PORT}"

# Matches the production image's own database, so a query that works here works there. `infra/`
# provisions PostgreSQL 17 (`main.bicep`), and a local 16 would let a 17-only syntax through.
PG_IMAGE="postgres:17-alpine"
PG_PASSWORD="local-only-not-a-secret"
PG_DB="elevator_sim"

BUILD=true

cd "$(dirname "$0")/.."

down() {
  docker rm -f "$APP_NAME" "$DB_NAME" >/dev/null 2>&1 || true
  docker network rm "$NET_NAME" >/dev/null 2>&1 || true
}

for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=false ;;
    --down)     down; echo "stopped and removed: ${APP_NAME}, ${DB_NAME}, ${NET_NAME}"; exit 0 ;;
    --logs)     exec docker logs -f "$APP_NAME" ;;
    -h|--help)  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null || { echo "docker is not installed" >&2; exit 1; }
docker info >/dev/null 2>&1  || { echo "docker is installed but not running" >&2; exit 1; }

# --------------------------------------------------------------------------- build

if [ "$BUILD" = true ]; then
  echo "building ${IMAGE} (native platform — see the header for why this is not amd64)"
  docker build -t "$IMAGE" .
  echo
fi

docker image inspect "$IMAGE" >/dev/null 2>&1 || {
  echo "no image ${IMAGE} — run without --no-build" >&2; exit 1
}

# --------------------------------------------------------------------------- run

# Idempotent: a previous run is removed rather than colliding on the name or the port.
down
docker network create "$NET_NAME" >/dev/null

echo "starting PostgreSQL (throwaway — no volume, dropped on --down)"
docker run -d --name "$DB_NAME" --network "$NET_NAME" \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB="$PG_DB" \
  "$PG_IMAGE" >/dev/null

# `pg_isready` rather than a sleep. The first boot initialises a cluster, which is slower than any
# fixed wait anybody would guess, and a race here looks exactly like a connection-string fault.
printf "waiting for PostgreSQL"
for _ in $(seq 1 60); do
  if docker exec "$DB_NAME" pg_isready -U postgres -d "$PG_DB" >/dev/null 2>&1; then
    echo " ready"; break
  fi
  printf "."; sleep 1
done
docker exec "$DB_NAME" pg_isready -U postgres -d "$PG_DB" >/dev/null 2>&1 || {
  echo; echo "PostgreSQL did not become ready — 'docker logs ${DB_NAME}'" >&2; down; exit 1
}

echo "starting the app"
docker run -d --name "$APP_NAME" --network "$NET_NAME" \
  -p "${PORT}:8787" \
  -e ELEVATOR_SIM_DB="postgres://postgres:${PG_PASSWORD}@${DB_NAME}:5432/${PG_DB}" \
  -e ELEVATOR_SIM_SECRET="local-development-signing-key-not-for-any-deployment" \
  -e ELEVATOR_SIM_ORIGIN="$ORIGIN" \
  -e NODE_ENV=development \
  -e ELEVATOR_SIM_OUTBOX=/tmp/outbox.jsonl \
  "$IMAGE" >/dev/null

# --------------------------------------------------------------------------- verify
#
# `deploy-azure.sh`'s rule, for the same reason: a script that reports success without checking is a
# script that reports success. `/api/boards` is the cheapest endpoint that proves the server booted,
# reached its database and answered — a 200 here means all three.

printf "waiting for the app"
CODE=""
for _ in $(seq 1 60); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "${ORIGIN}/api/boards" || true)"
  [ "$CODE" = "200" ] && { echo " ready"; break; }
  printf "."; sleep 1
done

if [ "$CODE" != "200" ]; then
  echo
  echo "the app did not answer — /api/boards returned ${CODE:-no response}" >&2
  echo "logs:" >&2
  docker logs --tail 40 "$APP_NAME" >&2 || true
  exit 1
fi

cat <<EOF

  ${ORIGIN}

  This is the production image — the same artifact the deployment runs, minus the
  architecture and with NODE_ENV=development, which gates one guard and nothing else
  (see the header). Mail is not configured, so sign-in links are written to a file.

  logs    ./scripts/docker-local.sh --logs
  stop    ./scripts/docker-local.sh --down
  links   docker exec ${APP_NAME} cat /tmp/outbox.jsonl
EOF
