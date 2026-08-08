#!/usr/bin/env bash
#
# One entry point for the three places this project runs.
#
#   ./scripts/deploy.sh status     # what is actually deployed where, read from the live resources
#   ./scripts/deploy.sh local      # the production image, on this machine
#   ./scripts/deploy.sh api        # the Container App — what-if by default; add --apply
#   ./scripts/deploy.sh site       # provision the static host and arm its workflow
#
# ## Why there are two hosts, and what goes on each
#
# `serve.ts` can serve the page and the API from one origin, and that is what is deployed today.
# The problem is that the Container App runs at `minReplicas: 0` — which is what makes it bill
# nothing at rest — so a cold visitor waits for a container to start **before any app exists to
# say so**. Measured on the live deployment (§ D257):
#
#     cold first page load, container asleep    32.2 s
#     warm page load                             0.13 s
#
# `GET /api/wake` fixes the API's cold start and cannot fix this one: nothing can call it until the
# page that would call it has arrived. So the split is:
#
#     the page  ->  Static Web Apps (Free)      a CDN; no cold start; £0
#     the API   ->  Container App               scale-to-zero, unchanged; £0 at rest
#
# The alternative — `minReplicas: 1` — costs about £26/month and changes not one line of code.
# Standard-tier Static Web Apps with a linked backend costs about £9/month and keeps one origin.
# Both were considered and § D257 records why the free path won and what it costs: same-origin is
# genuinely lost, and a misconfiguration becomes possible where it used to be impossible.
#
# ## Which of these is live right now
#
# **Only the Container App.** `provision.sh` has never been run, no Static Web App exists, and the
# deploy workflow is unarmed (`vars.AZURE_SWA_NAME` is unset, and every deploying job is guarded on
# it). So the page is still served by the container, and the 32.2 s cold load above is still real.
# `status` is the command that tells you this rather than this comment going stale — run it.
#
# ## What each subcommand delegates to
#
# Nothing here reimplements a deploy. `local` runs `docker-local.sh`, `api` runs
# `deploy-azure.sh`, `site` runs `infra/azure/swa/provision.sh`. This file exists so there is one
# name to remember and one place that says which is which.

set -euo pipefail

cd "$(dirname "$0")/.."

GROUP="${ELEVSIM_GROUP:-elevator-sim}"
APP="${ELEVSIM_APP:-elevsim-app}"

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; }

status() {
  command -v az >/dev/null || { echo "az is not installed — cannot read live state" >&2; exit 1; }
  az account get-access-token >/dev/null 2>&1 || { echo "not signed in: az login" >&2; exit 1; }

  echo "API — Azure Container App"
  local image fqdn revision
  image="$(az containerapp show -g "$GROUP" -n "$APP" \
    --query "properties.template.containers[0].image" -o tsv 2>/dev/null || true)"
  if [ -z "$image" ]; then
    echo "  not deployed in resource group '${GROUP}'"
  else
    fqdn="$(az containerapp show -g "$GROUP" -n "$APP" \
      --query "properties.configuration.ingress.fqdn" -o tsv)"
    revision="$(az containerapp show -g "$GROUP" -n "$APP" \
      --query "properties.latestRevisionName" -o tsv)"
    echo "  image     ${image}"
    # The tag IS the record of what is running — `deploy-azure.sh` tags with the commit SHA and
    # refuses a dirty tree so the tag cannot name a commit that does not contain the code.
    echo "  commit    $(printf '%s' "${image##*:}" | sed 's/-amd64$//')"
    echo "  revision  ${revision}"
    echo "  url       https://${fqdn}"
  fi

  echo
  echo "Page — Azure Static Web Apps"
  local swa armed
  swa="$(az staticwebapp list -g "${ELEVSIM_VIZ_GROUP:-elevator-sim-viz}" \
    --query "[0].defaultHostname" -o tsv 2>/dev/null || true)"
  armed="$(gh variable list 2>/dev/null | awk '$1=="AZURE_SWA_NAME"{print $2}' || true)"
  if [ -z "$swa" ]; then
    echo "  not provisioned — the container is serving the page, cold loads included"
    echo "  provision it: ./scripts/deploy.sh site"
  else
    echo "  url       https://${swa}"
  fi
  echo "  workflow  $([ -n "$armed" ] && echo "armed (AZURE_SWA_NAME=${armed})" \
    || echo "unarmed — deploy-viz.yml builds an artifact and deploys nothing")"

  echo
  echo "Local — the production image on this machine"
  if docker info >/dev/null 2>&1 && [ -n "$(docker ps -q -f name=elevsim-local 2>/dev/null)" ]; then
    echo "  running   http://localhost:${ELEVSIM_LOCAL_PORT:-8787}"
  else
    echo "  not running — ./scripts/deploy.sh local"
  fi

  echo
  echo "Nothing deploys automatically. deploy-viz.yml triggers on main and on pull requests,"
  echo "and is guarded on AZURE_SWA_NAME; the Container App has no workflow at all."
}

case "${1:-}" in
  status)     status ;;
  local)      shift; exec ./scripts/docker-local.sh "$@" ;;
  api)        shift; exec ./scripts/deploy-azure.sh "$@" ;;
  site)       shift; exec ./infra/azure/swa/provision.sh "$@" ;;
  ''|-h|--help) usage ;;
  *) echo "unknown command: ${1}" >&2; echo >&2; usage >&2; exit 2 ;;
esac
