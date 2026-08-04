#!/usr/bin/env bash
#
# Provision the viewer's hosting and arm the deploy workflow. One command, idempotent.
#
#   ./infra/azure/swa/provision.sh                 # provision + arm
#   ./infra/azure/swa/provision.sh --deploy-now    # ...and dispatch a deploy of the current branch
#   ./infra/azure/swa/provision.sh --yes           # skip the confirmation prompt
#
# This is `docs/16-static-site-deployment.md` § 3 and § 4 made executable. The document is the
# contract and wins any disagreement with this file.
#
# ## Why this exists as a script rather than as steps in a runbook
#
# The runbook is nine commands across two tools, four of which pass an output of one into an input
# of another. That is a shape people get wrong once and then debug for an hour — and the specific
# way they get it wrong here is arming `AZURE_SWA_NAME` before the other four variables exist, so
# the first deploy fails on a null resource group with an error that names neither.
#
# So the ordering is enforced rather than described: the arming variable is set LAST, and only
# after every other value has been read back from the deployment.
#
# It is safe to re-run. `az group create` and `az deployment group create` are both idempotent
# (incremental mode), and `gh variable set` overwrites.

set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-elevator-sim-viz}"
LOCATION="${LOCATION:-eastus2}"
DEPLOYMENT_NAME=main
TEMPLATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/main.bicep"
PARAMETERS="$(dirname "$TEMPLATE")/main.parameters.json"

ASSUME_YES=false
DEPLOY_NOW=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=true ;;
    --deploy-now) DEPLOY_NOW=true ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Preflight. Every one of these fails later and more confusingly if not checked here.
# ---------------------------------------------------------------------------
say "Preflight"

command -v az >/dev/null || fail "az not found. https://learn.microsoft.com/cli/azure/install-azure-cli"
command -v gh >/dev/null || fail "gh not found. https://cli.github.com"

az account show >/dev/null 2>&1 || fail "not logged in to Azure. Run: az login"
gh auth status  >/dev/null 2>&1 || fail "not logged in to GitHub. Run: gh auth login"

# Bicep is a separate component of az and its absence is reported as a confusing template error.
az bicep version >/dev/null 2>&1 || {
  echo "installing the Bicep CLI (az bicep install)..."
  az bicep install >/dev/null
}

[ -f "$TEMPLATE" ] || fail "template not found: $TEMPLATE"

if [ ! -f "$PARAMETERS" ]; then
  fail "$(printf '%s\n' \
    "no parameter file. Create one:" \
    "  cp ${PARAMETERS%.json}.example.json $PARAMETERS" \
    "  \$EDITOR $PARAMETERS      # set githubRepository to OWNER/REPO")"
fi

# The federated credential's subject is built from this, and a wrong value produces AADSTS70021 on
# the first deploy rather than an error here. So it is checked here.
REPO_IN_PARAMS=$(python3 -c "
import json,sys
p=json.load(open('$PARAMETERS'))['parameters']
sys.stdout.write(p.get('githubRepository',{}).get('value',''))
" 2>/dev/null || true)
[ -n "$REPO_IN_PARAMS" ] || fail "githubRepository is not set in $PARAMETERS"
[ "$REPO_IN_PARAMS" != "OWNER/elevator-sim" ] || fail "githubRepository is still the example placeholder in $PARAMETERS"

REPO_ACTUAL=$(gh repo view --json nameWithOwner -q .nameWithOwner)
if [ "$REPO_IN_PARAMS" != "$REPO_ACTUAL" ]; then
  fail "$(printf '%s\n' \
    "githubRepository mismatch — the federated credential would trust the wrong repository." \
    "  $PARAMETERS says : $REPO_IN_PARAMS" \
    "  this checkout is : $REPO_ACTUAL")"
fi

SUBSCRIPTION=$(az account show --query name -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

cat <<SUMMARY

  Subscription   : $SUBSCRIPTION ($SUBSCRIPTION_ID)
  Resource group : $RESOURCE_GROUP  (region $LOCATION)
  Repository     : $REPO_ACTUAL
  Template       : $TEMPLATE

  Creates: a Static Web App on the FREE plan (\$0), a user-assigned managed identity,
  two federated credentials scoped to $REPO_ACTUAL, and a custom role with two
  actions on the one site. See docs/16 § 1 for what is and is not free.

SUMMARY

if [ "$ASSUME_YES" != true ]; then
  read -r -p "Proceed? [y/N] " reply
  case "$reply" in [yY]*) ;; *) echo "aborted."; exit 0 ;; esac
fi

# ---------------------------------------------------------------------------
# Provision
# ---------------------------------------------------------------------------
say "Resource group"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
echo "ok: $RESOURCE_GROUP"

say "What-if (read this)"
az deployment group what-if \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file "$TEMPLATE" \
  --parameters "@$PARAMETERS" || fail "what-if failed — nothing has been created"

if [ "$ASSUME_YES" != true ]; then
  read -r -p "Apply the above? [y/N] " reply
  case "$reply" in [yY]*) ;; *) echo "aborted — nothing created."; exit 0 ;; esac
fi

say "Deploying"
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file "$TEMPLATE" \
  --parameters "@$PARAMETERS" \
  --output none
echo "ok"

out() {
  az deployment group show -g "$RESOURCE_GROUP" -n "$DEPLOYMENT_NAME" \
    --query "properties.outputs.$1.value" -o tsv
}

SWA_NAME=$(out staticWebAppName)
CLIENT_ID=$(out deployClientId)
TENANT_ID=$(out tenantId)
SUB_ID=$(out subscriptionId)
HOSTNAME=$(out defaultHostname)

[ -n "$SWA_NAME" ] || fail "deployment produced no staticWebAppName — nothing was armed"

# ---------------------------------------------------------------------------
# Arm. Order matters: AZURE_SWA_NAME last, because it is the switch.
# ---------------------------------------------------------------------------
say "Arming the workflow"
gh variable set AZURE_CLIENT_ID       --body "$CLIENT_ID"
gh variable set AZURE_TENANT_ID       --body "$TENANT_ID"
gh variable set AZURE_SUBSCRIPTION_ID --body "$SUB_ID"
gh variable set AZURE_RESOURCE_GROUP  --body "$RESOURCE_GROUP"
gh variable set AZURE_SWA_NAME        --body "$SWA_NAME"     # the switch — last on purpose
echo "ok: 5 variables set"

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$DEPLOY_NOW" = true ]; then
  say "Dispatching a deploy of '$BRANCH'"
  gh workflow run deploy-viz.yml --ref "$BRANCH"
  echo "watching (ctrl-c is safe — it does not cancel the run)..."
  sleep 8
  RUN_ID=$(gh run list --workflow=deploy-viz.yml --branch "$BRANCH" --limit 1 --json databaseId -q '.[0].databaseId')
  gh run watch "$RUN_ID" --exit-status || fail "the deploy run failed — see: gh run view $RUN_ID --log-failed"

  say "Verifying the deployed site"
  # The same two things checked locally in docs/16 § 9: the page is served, and the generated
  # manifest is JSON rather than the SPA fallback. A fallback answering here is a 200 with HTML,
  # which is exactly the silent failure this lane exists to prevent.
  code=$(curl -s -o /dev/null -w '%{http_code}' "$HOSTNAME/")
  [ "$code" = "200" ] || fail "$HOSTNAME/ answered $code"
  ctype=$(curl -s -o /dev/null -w '%{content_type}' "$HOSTNAME/__buildings.json")
  case "$ctype" in
    application/json*) ;;
    *) fail "__buildings.json served as '$ctype' — the SPA fallback is swallowing it (docs/16 § 4)" ;;
  esac
  count=$(curl -s "$HOSTNAME/__buildings.json" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["files"]))')
  echo "ok: $HOSTNAME serves $count buildings"
fi

cat <<DONE

$(printf '\033[32m✓ provisioned and armed\033[0m')

  Site        : $HOSTNAME
  Identity    : $CLIENT_ID
  Turn it off : gh variable delete AZURE_SWA_NAME
  Tear it down: gh variable delete AZURE_SWA_NAME && az group delete -n $RESOURCE_GROUP --yes

DONE

if [ "$DEPLOY_NOW" != true ]; then
  cat <<NEXT
Nothing has been deployed yet. Either:
  * merge the pull request — a push to main deploys automatically; or
  * re-run with --deploy-now to dispatch a deploy of '$BRANCH' now.
NEXT
fi
