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
# The runbook is a dozen commands across two tools, several of which pass an output of one into an
# input of another. That is a shape people get wrong once and then debug for an hour — and the
# specific way they get it wrong here is arming `AZURE_SWA_NAME` before the other variables exist,
# so the first deploy fails on a null resource group with an error that names neither.
#
# So the ordering is enforced rather than described: the arming variable is set LAST, and only
# after every other value has been read back from a deployment.
#
# ## The one thing this script cannot finish, and why
#
# Three values have to agree (docs/16 § 3). This script sets two of them — the site's own variables,
# and `ELEVATOR_SIM_API_ORIGIN`, which it reads out of the API's deployment rather than asking you
# to paste. It **cannot** set the third, which is the app's `viewerOrigin`, because updating that
# means re-running `infra/azure/main.bicep` and that template takes `appSecret` and
# `databaseAdminPassword` as required `@secure()` parameters with no defaults. This script does not
# have them and must not ask for them.
#
# So it prints the exact command instead, and — the part that matters — it **refuses to arm** if the
# app is not already configured for this site. Arming without that step produces a deployment where
# the site loads, the page knows where the API is, and every request is refused by CORS, which the
# client reports as a server that is down. Half-done is the worst of the three states, so it is the
# one state this script will not leave you in.
#
# It is safe to re-run. `az group create` and `az deployment group create` are both idempotent
# (incremental mode), and `gh variable set` overwrites.

set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-elevator-sim-viz}"
# The API's group and app, so the site can be told where the API is and the app can be checked for
# whether it has been told where the site is. Defaults match `infra/README.md` § 3.
API_RESOURCE_GROUP="${API_RESOURCE_GROUP:-elevator-sim}"
API_APP_NAME="${API_APP_NAME:-elevsim-app}"
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

# The literal prefix GitHub puts in the token's `sub` claim. Read rather than constructed, because
# it is NOT `repo:OWNER/REPO` — GitHub issues an immutable subject carrying the numeric account and
# repository ids (`repo:owner@123/repo@456`), so that renaming a repository cannot hand a trust
# relationship to whoever claims the old name. Nothing you would copy from a tutorial contains those
# ids, and a credential built the documented way is refused with AADSTS700213 — which reads as a
# propagation delay and is not one. Falls back to the documented form if the endpoint says nothing.
SUBJECT_PREFIX=$(gh api "repos/$REPO_ACTUAL/actions/oidc/customization/sub" \
  --jq '.sub_claim_prefix // empty' 2>/dev/null || true)
[ -n "$SUBJECT_PREFIX" ] || SUBJECT_PREFIX="repo:$REPO_ACTUAL"

SUBSCRIPTION=$(az account show --query name -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

cat <<SUMMARY

  Subscription   : $SUBSCRIPTION ($SUBSCRIPTION_ID)
  Resource group : $RESOURCE_GROUP  (region $LOCATION)
  Repository     : $REPO_ACTUAL
  Token subject  : $SUBJECT_PREFIX:environment:… (read from GitHub, not constructed — see § D308)
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
  --parameters "@$PARAMETERS" \
  --parameters githubSubjectPrefix="$SUBJECT_PREFIX" || fail "what-if failed — nothing has been created"

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
  --parameters githubSubjectPrefix="$SUBJECT_PREFIX" \
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
SITE_ORIGIN=$(out defaultHostname)

[ -n "$SWA_NAME" ] || fail "deployment produced no staticWebAppName — nothing was armed"

# ---------------------------------------------------------------------------
# The other two thirds of the configuration.
#
# The site is now provisioned and its hostname is known for the first time, which is why this could
# not have happened earlier. Two things follow, and neither is optional:
#
#   1. The page has to be built knowing where the API is. Read from the API's own deployment rather
#      than pasted, because a hostname typed twice is a hostname wrong once.
#   2. The API has to be told where the page is — `viewerOrigin`, which moves ELEVATOR_SIM_ORIGIN
#      and ELEVATOR_SIM_ALLOW_ORIGIN together. This script cannot do it (see the header) so it
#      checks it instead, and refuses to arm until it has been done.
# ---------------------------------------------------------------------------
say "The API's origin"

API_ORIGIN="${API_ORIGIN:-}"
if [ -z "$API_ORIGIN" ]; then
  API_FQDN=$(az containerapp show -g "$API_RESOURCE_GROUP" -n "$API_APP_NAME" \
    --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || true)
  [ -n "$API_FQDN" ] || fail "$(printf '%s\n' \
    "could not find the API's Container App: $API_APP_NAME in $API_RESOURCE_GROUP." \
    "Deploy it first (infra/README.md § 3), or pass the origin explicitly:" \
    "  API_ORIGIN=https://… $0")"
  API_ORIGIN="https://$API_FQDN"
fi
case "$API_ORIGIN" in
  https://*/ | http://*/) fail "API_ORIGIN has a trailing slash ($API_ORIGIN). The build refuses it — an origin has no path." ;;
  https://*|http://*) ;;
  *) fail "API_ORIGIN is not an absolute origin: $API_ORIGIN" ;;
esac
echo "ok: $API_ORIGIN"

say "Checking the API knows where the site is"

# Read back what the app is actually running with, not what a template says it should be. The
# deployed revision is the thing that answers requests.
APP_ALLOW=$(az containerapp show -g "$API_RESOURCE_GROUP" -n "$API_APP_NAME" \
  --query "properties.template.containers[0].env[?name=='ELEVATOR_SIM_ALLOW_ORIGIN'].value | [0]" \
  -o tsv 2>/dev/null || true)

if [ "$APP_ALLOW" != "$SITE_ORIGIN" ]; then
  cat >&2 <<PENDING

  The API is not configured for this site yet.

    it permits : ${APP_ALLOW:-<nothing>}
    this site is: $SITE_ORIGIN

  Re-deploy the app with viewerOrigin set. You kept both secrets from the first deploy
  (infra/README.md § 3 says to); this needs them again because they are required @secure()
  parameters and passing them is the only way to re-run the template:

    az deployment group create \\
      --resource-group $API_RESOURCE_GROUP \\
      --name app \\
      --template-file infra/azure/main.bicep \\
      --parameters @infra/azure/main.parameters.json \\
      --parameters viewerOrigin="$SITE_ORIGIN" \\
                   appSecret="\$APP_SECRET" databaseAdminPassword="\$DB_PASSWORD"

  Then re-run this script. Nothing has been armed, which is deliberate: a site armed against
  an API that refuses it loads perfectly and cannot do anything, and the client reports a
  server that is in fact fine.

PENDING
  fail "not armed — the API has not been pointed at this site"
fi
echo "ok: the API permits $SITE_ORIGIN and mails sign-in links there"

# ---------------------------------------------------------------------------
# The GitHub environments, and the branch restriction that now lives on one of them.
#
# The federated credentials are keyed on `repo:OWNER/REPO:environment:NAME`, because a job that
# declares `environment:` gets that subject instead of a ref-based one (main.bicep says why, and it
# is a correction a failed run made). Two consequences, and neither is optional:
#
#   1. The environments have to EXIST with exactly these names, or the subject GitHub presents names
#      an environment Entra has never heard of.
#   2. The subject carries no ref, so Entra no longer pins production to a branch. That pin moves
#      here, as a deployment branch policy — set rather than documented, because a restriction in a
#      runbook is a restriction until the first person who has not read it.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Orphaned federated credentials.
#
# ARM's incremental mode does not delete what a template stops declaring, and a credential is
# addressed by NAME. So renaming one — which is exactly what moving the subject from a ref to an
# environment did (§ D308) — leaves the old one in place, trusted, and matching a subject GitHub no
# longer sends. That is dead configuration on the security boundary, which is the one place this
# repository's most-repeated defect is not merely untidy.
#
# Scoped to this identity, which exists for this workflow and nothing else, so "not declared by the
# template" and "should not exist" are the same statement here. What is removed is printed.
# ---------------------------------------------------------------------------
say "Federated credentials"

PRODUCTION_ENVIRONMENT=$(out productionEnvironmentName)
PREVIEW_ENVIRONMENT=$(out previewEnvironmentName)
PRODUCTION_BRANCH=$(out productionBranchName)
IDENTITY_NAME=$(out deployIdentityName)

# All four come back from the deployment rather than from defaults here, and that is the point: two
# of them are literally half of a federated credential's subject, so a copy in this script is a
# second place for them to be wrong — and the failure that produces is an AADSTS700213 naming the
# string but not which of the two places authored it.
[ -n "$PRODUCTION_ENVIRONMENT" ] && [ -n "$PREVIEW_ENVIRONMENT" ] &&
  [ -n "$PRODUCTION_BRANCH" ] && [ -n "$IDENTITY_NAME" ] ||
  fail "the deployment did not return the environment names — is the template up to date?"

WANTED=$(printf '%s:environment:%s\n%s:environment:%s\n' \
  "$SUBJECT_PREFIX" "$PRODUCTION_ENVIRONMENT" "$SUBJECT_PREFIX" "$PREVIEW_ENVIRONMENT" | sort)

while IFS=$'\t' read -r fic_name fic_subject; do
  [ -n "$fic_name" ] || continue
  printf '%s\n' "$WANTED" | grep -Fqx "$fic_subject" && continue
  echo "removing orphan: $fic_name ($fic_subject)"
  az identity federated-credential delete \
    --identity-name "$IDENTITY_NAME" -g "$RESOURCE_GROUP" --name "$fic_name" --yes --output none
done < <(az identity federated-credential list --identity-name "$IDENTITY_NAME" \
           -g "$RESOURCE_GROUP" --query "[].[name,subject]" -o tsv)

ACTUAL=$(az identity federated-credential list --identity-name "$IDENTITY_NAME" \
  -g "$RESOURCE_GROUP" --query "[].subject" -o tsv | sort)
[ "$ACTUAL" = "$WANTED" ] || fail "$(printf '%s\n' \
  "the identity's federated credentials are not the two this template declares." \
  "  wanted: $(echo "$WANTED" | tr '\n' ' ')" \
  "  actual: $(echo "$ACTUAL" | tr '\n' ' ')")"
echo "ok: exactly 2 credentials, both environment-scoped"

# ---------------------------------------------------------------------------
# The workflow is the thing that presents a subject, so it is the thing that has to agree.
#
# A credential is trusted for `repo:OWNER/REPO:environment:NAME`, and NAME comes from a job's
# `environment:` key. A job that authenticates and declares no environment presents a ref-based
# subject instead, which nothing trusts — and this repository shipped exactly that: `close-preview`
# used `azure/login` with no `environment:`, so it would have failed on every pull request close,
# leaving preview environments standing until the fourth open pull request hit a quota error naming
# neither cause.
#
# The check below is a proxy rather than a parse — every `azure/login` step is matched against every
# job-level `environment:` key, and the two environment names must both appear. It is stated as a
# proxy because it is one: it counts rather than understands, and it would miss two logins in one
# job. It would have caught the defect that motivated it, which is the bar.
# ---------------------------------------------------------------------------
say "The workflow's environments agree with the credentials"

WORKFLOW="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/.github/workflows/deploy-viz.yml"
[ -f "$WORKFLOW" ] || fail "workflow not found: $WORKFLOW"

LOGINS=$(grep -c 'uses: azure/login@' "$WORKFLOW" || true)
ENVS=$(grep -cE '^    environment:' "$WORKFLOW" || true)
[ "$LOGINS" = "$ENVS" ] || fail "$(printf '%s\n' \
  "$WORKFLOW has $LOGINS azure/login steps and $ENVS jobs declaring an environment." \
  "A job that authenticates without one presents a ref-based subject, which no credential trusts.")"

for wanted_env in "$PRODUCTION_ENVIRONMENT" "$PREVIEW_ENVIRONMENT"; do
  grep -q "'$wanted_env'\|name: $wanted_env" "$WORKFLOW" ||
    fail "the template declares environment '$wanted_env' and the workflow never names it"
done
echo "ok: $LOGINS authenticating jobs, $ENVS environments, both names present"

say "GitHub environments"

# Preview takes any branch: a pull request's head is by definition not the production branch.
gh api -X PUT "repos/$REPO_ACTUAL/environments/$PREVIEW_ENVIRONMENT" --silent
echo "ok: $PREVIEW_ENVIRONMENT (any branch — a pull request head is never $PRODUCTION_BRANCH)"

# Production takes exactly one branch. `custom_branch_policies` rather than `protected_branches`,
# because the latter means "whatever happens to be protected right now" — which is a different rule
# on a repository that later protects a second branch.
#
# `--input -` rather than `-f`/`--raw-field`: `deployment_branch_policy` is a nested object and both
# of those send a string, which the API rejects with a 422 naming the type.
gh api -X PUT "repos/$REPO_ACTUAL/environments/$PRODUCTION_ENVIRONMENT" --input - --silent <<JSON
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
# Idempotent: the create 422s if the policy is already there, and that is a success for our purposes.
gh api -X POST "repos/$REPO_ACTUAL/environments/$PRODUCTION_ENVIRONMENT/deployment-branch-policies" \
  -f "name=$PRODUCTION_BRANCH" -f 'type=branch' --silent 2>/dev/null || true

POLICY=$(gh api "repos/$REPO_ACTUAL/environments/$PRODUCTION_ENVIRONMENT/deployment-branch-policies" \
  --jq '[.branch_policies[].name] | join(",")')
[ "$POLICY" = "$PRODUCTION_BRANCH" ] || fail "$(printf '%s\n' \
  "$PRODUCTION_ENVIRONMENT permits branches [$POLICY], expected exactly [$PRODUCTION_BRANCH]." \
  "The federated credential no longer pins a branch, so this policy is the only thing that does.")"
echo "ok: $PRODUCTION_ENVIRONMENT deploys from $POLICY and nothing else"

# ---------------------------------------------------------------------------
# Arm. Order matters: AZURE_SWA_NAME last, because it is the switch.
# ---------------------------------------------------------------------------
say "Arming the workflow"
gh variable set AZURE_CLIENT_ID           --body "$CLIENT_ID"
gh variable set AZURE_TENANT_ID           --body "$TENANT_ID"
gh variable set AZURE_SUBSCRIPTION_ID     --body "$SUB_ID"
gh variable set AZURE_RESOURCE_GROUP      --body "$RESOURCE_GROUP"
# Before the switch, because a build armed without it fails loudly by design — and a failing deploy
# on the first push would be a correct refusal presented as a broken pipeline.
gh variable set ELEVATOR_SIM_API_ORIGIN   --body "$API_ORIGIN"
gh variable set AZURE_SWA_NAME            --body "$SWA_NAME"     # the switch — last on purpose
echo "ok: 6 variables set"

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$DEPLOY_NOW" = true ] && [ "$BRANCH" != "$PRODUCTION_BRANCH" ]; then
  fail "$(printf '%s\n' \
    "--deploy-now can only deploy '$PRODUCTION_BRANCH', and this checkout is on '$BRANCH'." \
    "" \
    "$PRODUCTION_ENVIRONMENT's deployment branch policy permits one branch, and the deploy job runs" \
    "in that environment — so a dispatch from here is refused by GitHub before it authenticates," \
    "which reads as a failed deploy rather than as the restriction working." \
    "" \
    "Everything else is done: the site exists, the API permits it, and the workflow is armed." \
    "Merge to $PRODUCTION_BRANCH and the push deploys.")"
fi

if [ "$DEPLOY_NOW" = true ]; then
  say "Dispatching a deploy of '$BRANCH'"
  gh workflow run deploy-viz.yml --ref "$BRANCH"
  echo "watching (ctrl-c is safe — it does not cancel the run)..."
  sleep 8
  RUN_ID=$(gh run list --workflow=deploy-viz.yml --branch "$BRANCH" --limit 1 --json databaseId -q '.[0].databaseId')
  gh run watch "$RUN_ID" --exit-status || fail "the deploy run failed — see: gh run view $RUN_ID --log-failed"

  say "Verifying the deployed site"
  # Four things, and the last two are the ones this lane exists for. The page is served; the
  # generated manifest is JSON rather than a fallback swallowing it; the document declares an API
  # origin at all; and it declares the RIGHT one. A site that passes the first two and fails the
  # third loads perfectly and dead-ends every account, leaderboard and challenge surface with no
  # failing status code anywhere — which is exactly how this shipped once already (§ D243).
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_ORIGIN/")
  [ "$code" = "200" ] || fail "$SITE_ORIGIN/ answered $code"
  ctype=$(curl -s -o /dev/null -w '%{content_type}' "$SITE_ORIGIN/__buildings.json")
  case "$ctype" in
    application/json*) ;;
    *) fail "__buildings.json served as '$ctype' — a fallback is swallowing it (docs/16 § 4)" ;;
  esac
  count=$(curl -s "$SITE_ORIGIN/__buildings.json" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["files"]))')

  # Comments stripped first: `index.html` carries a comment naming this tag to tell readers not to
  # write it by hand, and matching that comment is a bug this repository has already made once.
  declared=$(curl -s "$SITE_ORIGIN/" | python3 -c "
import re, sys
html = re.sub(r'<!--.*?-->', '', sys.stdin.read(), flags=re.S)
m = re.search(r'<meta[^>]*name=[\"\']elevator-sim-api[\"\'][^>]*content=[\"\']([^\"\']*)', html)
sys.stdout.write(m.group(1) if m else '')
")
  [ -n "$declared" ] || fail "$(printf '%s\n' \
    "the deployed page declares no API origin." \
    "It will load, draw, and dead-end every account, leaderboard and challenge surface." \
    "The build ran without ELEVATOR_SIM_API_ORIGIN — check the repository variable.")"
  [ "$declared" = "$API_ORIGIN" ] || fail "the deployed page points at $declared, not $API_ORIGIN"

  echo "ok: $SITE_ORIGIN serves $count buildings and points its API at $declared"
fi

cat <<DONE

$(printf '\033[32m✓ provisioned and armed\033[0m')

  Site        : $SITE_ORIGIN
  API         : $API_ORIGIN
  Identity    : $CLIENT_ID
  Turn it off : gh variable delete AZURE_SWA_NAME
  Tear it down: gh variable delete AZURE_SWA_NAME && az group delete -n $RESOURCE_GROUP --yes

  Tearing this group down does NOT undo the app's side. Put the API back to serving its own
  page with:

    az deployment group create -g $API_RESOURCE_GROUP -n app \\
      --template-file infra/azure/main.bicep \\
      --parameters @infra/azure/main.parameters.json \\
      --parameters viewerOrigin="" appSecret="\$APP_SECRET" databaseAdminPassword="\$DB_PASSWORD"

  Left as it is, the app keeps mailing sign-in links to a site that no longer exists.

DONE

if [ "$DEPLOY_NOW" != true ]; then
  cat <<NEXT
Nothing has been deployed yet. Either:
  * merge the pull request — a push to main deploys automatically; or
  * re-run with --deploy-now to dispatch a deploy of '$BRANCH' now.
NEXT
fi
