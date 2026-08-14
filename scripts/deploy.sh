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
# **Both, and the split above is the deployment rather than the plan.** This paragraph said the
# opposite — *"Only the Container App. `provision.sh` has never been run, no Static Web App exists,
# and the deploy workflow is unarmed"* — and every clause of it stopped being true on 2026-08-08,
# the day `provision.sh` ran and `AZURE_SWA_NAME` was set. It went on saying it for five days.
#
#     the page  ->  https://yellow-glacier-0ff81230f.7.azurestaticapps.net   (SWA Free, redeploys
#                                                                            on every push to main)
#     the API   ->  https://elevsim-app.salmonstone-4576d6f7.eastus2.azurecontainerapps.io
#
# **What that staleness cost is the reason the redirect below exists.** The container kept serving
# its own `dist-web` at `/`, and nothing redeploys that image automatically — so a visitor to the
# API's hostname got a complete, working viewer built from whatever commit was last deployed by
# hand, while the CDN served the current one. Two 200s, two different products, no failing status
# code anywhere. It ran that way from 2026-08-08 to 2026-08-13, across the whole Everyday Mode wave.
#
# The container no longer has an opinion about what the page looks like: in a split deployment
# `main.ts` derives `siteOrigin` from the two origin variables it already sets, and every non-`/api/`
# GET is a 302 to the site. So the stale copy is unreachable rather than merely out of date, and it
# cannot come back the next time an image lags behind `main` — which it will.
#
# `status` is the command that tells you what is actually deployed rather than this comment going
# stale a second time — run it. This paragraph is not evidence.
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
    local tag behind
    tag="$(printf '%s' "${image##*:}" | sed 's/-amd64$//')"
    # **How far behind, not just which commit.** The tag alone was never the missing information —
    # `status` printed it all along. What nobody had was the distance: this image sat 238 commits
    # back for five days, serving a viewer from before Everyday Mode existed, and a bare SHA gives a
    # reader no reason to look. A commit that is not in this clone is said to be unknown rather than
    # counted as zero, because "0 behind" is exactly the wrong thing to print about an image nobody
    # can locate.
    if git cat-file -e "${tag}^{commit}" 2>/dev/null; then
      behind="$(git rev-list --count "${tag}..HEAD" 2>/dev/null || echo '?')"
      if [ "$behind" = "0" ]; then
        echo "  commit    ${tag} — current with this checkout"
      else
        echo "  commit    ${tag} — ${behind} commits behind this checkout's HEAD"
      fi
    else
      echo "  commit    ${tag} — not a commit in this clone; cannot say how far behind"
    fi
    echo "  revision  ${revision}"
    echo "  url       https://${fqdn}"
    # What this origin does with a page request, which is the whole of the § D257 split from a
    # visitor's point of view and is invisible from every other line above.
    #
    # **Configured and observed are printed separately, and they can disagree.** The redirect ships
    # inside the image and the image is deployed by hand, so an image built before it serves its own
    # page however the environment is set — which is the same shape of defect as the tag above:
    # correct configuration, stale artifact, no failing status code anywhere. Printing only the
    # configuration would be this script asserting a behaviour it has not checked.
    local allow observed
    allow="$(az containerapp show -g "$GROUP" -n "$APP" \
      --query 'properties.template.containers[0].env[?name==`ELEVATOR_SIM_ALLOW_ORIGIN`].value | [0]' \
      -o tsv 2>/dev/null || true)"
    if [ -n "$allow" ] && [ "$allow" != "null" ]; then
      echo "  pages     configured to 302 -> ${allow}"
    else
      echo "  pages     configured to serve its own bundle (same-origin deployment)"
    fi
    # `--max-time` because the app is `minReplicas: 0` and a cold start was measured at 32.2 s.
    # A slow `status` would get this line skipped by whoever runs it, so it reports "asleep"
    # instead of waiting — an unmeasured answer said out loud beats a measured one nobody waits for.
    observed="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 12 \
      "https://${fqdn}/" 2>/dev/null || true)"
    case "$observed" in
      302*|301*|307*|308*) echo "  observed  ${observed}" ;;
      200*)
        if [ -n "$allow" ] && [ "$allow" != "null" ]; then
          echo "  observed  200 — it is serving a page of its own, against the line above."
          echo "            The running image predates the redirect; its bundle is as old as the"
          echo "            commit named above. Fix: ./scripts/deploy.sh api --apply"
        else
          echo "  observed  200 — serving its own page, as configured"
        fi
        ;;
      ''|000*) echo "  observed  no answer in 12 s — asleep at minReplicas: 0, or unreachable" ;;
      *) echo "  observed  ${observed}" ;;
    esac
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
