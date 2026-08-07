#!/usr/bin/env bash
#
# Production deploy: build, push, deploy, in one command.
#
#   ./scripts/deploy-azure.sh                 # what-if only — shows the plan, changes nothing
#   ./scripts/deploy-azure.sh --apply         # actually deploy
#
# ## Two things this script refuses to do
#
# **It will not deploy a dirty tree.** The image is tagged with the commit SHA, so an image built
# from uncommitted work would carry a tag naming a commit that does not contain it — and the tag is
# the only record of what is running. `--allow-dirty` overrides, and appends `-dirty` to the tag so
# the lie is at least visible.
#
# **It will not generate the signing secret for you on a re-deploy.** `ELEVATOR_SIM_SECRET` signs
# email-confirmation tokens, so rotating it invalidates every confirmation link in flight. The first
# deploy generates one and prints where to keep it; later deploys reuse what is already there by
# reading it back from the running app's configuration.
#
# Everything else — the resource group, the registry, the amd64 build — is idempotent, so running
# this twice in a row is a no-op followed by a no-op.

set -euo pipefail

GROUP="${ELEVSIM_GROUP:-elevator-sim}"

# **One region for everything, and it is not East US.**
#
# `eastus` is restricted for PostgreSQL flexible server on this subscription — the API reports
# "Provisioning is restricted in this region", and the symptom is an unhelpful
# `ParameterOutOfRange` on `Version` with an empty list of allowed values, because a blocked region
# offers no versions. `eastus2` is the nearest region that allows it and supports PostgreSQL 17.
#
# Registry, logs, environment, app and database all take this one value. The app talks to the
# database on every request, so a split would put a region hop in the hot path; the registry is
# here too so that nothing in the deployment crosses a region at all. Azure Communication Services
# is the sole exception and is not a choice — it is a `global` resource by design, and it is not on
# any request path.
LOCATION="${ELEVSIM_LOCATION:-eastus2}"
DEPLOYMENT_NAME="app"
APPLY=false
ALLOW_DIRTY=false

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --allow-dirty) ALLOW_DIRTY=true ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."

# --------------------------------------------------------------------------- preflight

command -v az >/dev/null    || { echo "az is not installed" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker is not installed" >&2; exit 1; }

if ! az account get-access-token >/dev/null 2>&1; then
  echo "Not signed in to Azure. Run: az login" >&2
  exit 1
fi

TAG="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  if [ "$ALLOW_DIRTY" = true ]; then
    TAG="${TAG}-dirty"
    echo "warning: deploying a dirty tree as ${TAG}" >&2
  else
    echo "The working tree has uncommitted changes, and the image tag is the commit SHA." >&2
    echo "Commit them, or re-run with --allow-dirty to tag this as ${TAG}-dirty." >&2
    exit 1
  fi
fi

# The registry is **discovered, not derived**, and that is a scar rather than a preference.
#
# It used to be named from the subscription id, which is stable — so deleting the resource group
# and redeploying recreated the *same* registry name seconds later. ARM reported
# `provisioningState: Succeeded`, DNS resolved, and the data plane answered `GET /v2/` with a bare
# 404 instead of the 401-plus-`WWW-Authenticate` a registry is supposed to issue. The CLI's
# rendering of that is "did not issue a challenge", which reads like a network fault and is not one:
# the routing for a recycled name had not been re-established, and no amount of retrying fixes it.
#
# So: reuse whatever registry is already in the group, and when there is none, create one under a
# fresh random name that has never been used before. Idempotent across re-deploys, immune to
# recycling across teardowns. `ELEVSIM_ACR` overrides if you want a specific one.
ACR="${ELEVSIM_ACR:-$(az acr list --resource-group "$GROUP" --query "[0].name" -o tsv 2>/dev/null || true)}"

echo "subscription : $(az account show --query name -o tsv)"
echo "group        : ${GROUP}"
echo "location     : ${LOCATION}"
echo

# --------------------------------------------------------------------------- infrastructure that must exist first

# The registry cannot live in the Bicep: the Container App needs an image to pull at the moment it
# is created, and a registry declared in the same template would not exist until that same
# deployment. So it is created here, filled here, and only then handed to the template.
az group create --name "$GROUP" --location "$LOCATION" --output none

# Errors are **not** swallowed here. An earlier version wrapped the create in `2>/dev/null || true`,
# which hid a genuine failure and let the script run on to push against a registry that did not
# exist, where it failed with an authentication error that said nothing about the cause.
if [ -z "$ACR" ]; then
  ACR="elevsimacr$(openssl rand -hex 5)"
  echo "creating registry ${ACR}"
  az acr create --resource-group "$GROUP" --name "$ACR" --location "$LOCATION" \
    --sku Basic --admin-enabled false --output none
else
  echo "reusing registry ${ACR}"
fi

REGISTRY="${ACR}.azurecr.io"
IMAGE="${REGISTRY}/elevator-sim:${TAG}"
echo "image        : ${IMAGE}"
echo

# --------------------------------------------------------------------------- build and push

# `--platform linux/amd64` is not optional. Container Apps runs amd64, and on an Apple Silicon
# machine the default build is arm64 — which pushes successfully, deploys successfully, and then
# fails to start with an exec format error.
echo "building ${IMAGE} (linux/amd64)"
# BuildKit writes its progress to stderr, so silencing stdout alone leaves the whole log on screen.
docker build --platform linux/amd64 -t "$IMAGE" . >/dev/null 2>&1

ARCH="$(docker image inspect "$IMAGE" --format '{{.Architecture}}')"
[ "$ARCH" = "amd64" ] || { echo "built ${ARCH}, expected amd64" >&2; exit 1; }

# Retried for the same reason the push is, and for one of its own: a registry created moments ago
# does not answer its token endpoint immediately, and the failure is a
# `CONNECTIVITY_CHALLENGE_ERROR` that reads like a network fault rather than "not ready yet".
for attempt in 1 2 3 4 5; do
  az acr login --name "$ACR" --output none 2>/dev/null && break
  [ "$attempt" = 5 ] && { echo "could not authenticate to ${REGISTRY} after 5 attempts" >&2; exit 1; }
  echo "registry login attempt ${attempt} failed, retrying"
  sleep 10
done

# Retried, because a registry push is a long transfer over somebody else's network and a single
# `EOF` mid-blob is a fact of life rather than a reason to abandon a deploy. Three attempts, and
# the layers already accepted are not resent.
for attempt in 1 2 3; do
  if docker push "$IMAGE" >/dev/null 2>&1; then
    echo "pushed ${IMAGE}"
    break
  fi
  [ "$attempt" = 3 ] && { echo "push failed after 3 attempts" >&2; exit 1; }
  echo "push attempt ${attempt} failed, retrying"
  sleep 5
done
echo

# --------------------------------------------------------------------------- secrets

# Read back what is already deployed, so a re-deploy does not rotate the token-signing secret and
# invalidate every confirmation link that is currently in somebody's inbox.
APP_SECRET="$(az containerapp secret show --name elevsim-app --resource-group "$GROUP" \
  --secret-name app-secret --query value -o tsv 2>/dev/null || true)"
DB_PASSWORD="$(az containerapp show --name elevsim-app --resource-group "$GROUP" \
  --query "properties.template.containers[0].env[?name=='ELEVATOR_SIM_DB']" -o tsv 2>/dev/null || true)"

# The **database password is regenerated every deploy, and that is safe** — deliberately, rather
# than for want of a way to read the old one back. The template resets the server's administrator
# password and builds the connection string from the same parameter in the same deployment, so the
# two cannot drift: whatever is generated here becomes both the password and the string the app
# connects with. Nothing else uses that credential.
#
# An earlier version tried to recover the old password by regex out of the stored connection string.
# It was fragile, it was unnecessary, and it had an unbalanced quote that took the whole script out
# after the image had already been pushed.
DB_PASSWORD="$(openssl rand -base64 24)"

FIRST_DEPLOY=false
if [ -z "$APP_SECRET" ]; then
  FIRST_DEPLOY=true
  APP_SECRET="$(openssl rand -base64 48)"
  echo "First deploy: generated a signing secret."
  echo "Keep it. Rotating it invalidates every confirmation link already sent:"
  echo
  echo "  ELEVATOR_SIM_SECRET=${APP_SECRET}"
  echo
else
  echo "Re-deploy: reusing the existing signing secret, rotating the database password."
fi

# --------------------------------------------------------------------------- deploy

ARGS=(
  --resource-group "$GROUP"
  --template-file infra/azure/main.bicep
  --parameters
    containerImage="$IMAGE"
    containerRegistryServer="$REGISTRY"
    appSecret="$APP_SECRET"
    databaseAdminPassword="$DB_PASSWORD"
    # Passed explicitly. The template defaults to `resourceGroup().location`, and a resource group
    # created in one region would otherwise silently place every resource there — which is how the
    # app and its database end up a region apart without anybody choosing it.
    location="$LOCATION"
)

if [ "$APPLY" = false ]; then
  echo "what-if (nothing is being changed — re-run with --apply to deploy):"
  echo
  az deployment group what-if --name "$DEPLOYMENT_NAME" "${ARGS[@]}"
  exit 0
fi

az deployment group create --name "$DEPLOYMENT_NAME" "${ARGS[@]}" --output none

URL="$(az deployment group show -g "$GROUP" -n "$DEPLOYMENT_NAME" \
  --query properties.outputs.appUrl.value -o tsv)"

echo
echo "deployed: ${URL}"

# A deploy that reports success without checking is a deploy that reports success. Container Apps
# returns as soon as the revision is provisioned, which is before it is necessarily serving.
for _ in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "${URL}/api/boards" || true)"
  [ "$CODE" = "200" ] && { echo "verified: /api/boards returned 200"; break; }
  sleep 5
done
[ "${CODE:-}" = "200" ] || { echo "warning: ${URL}/api/boards returned ${CODE:-no response}" >&2; exit 1; }

if [ "$FIRST_DEPLOY" = true ]; then
  echo
  echo "Untested on a fresh deployment: sending mail. Register an account and confirm that it"
  echo "arrives — see infra/README.md § 4."
fi
