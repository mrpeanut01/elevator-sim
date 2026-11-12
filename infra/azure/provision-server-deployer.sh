#!/usr/bin/env bash
# One-time setup for `.github/workflows/deploy-server.yml` — DECISIONS.md § D1631.
#
# Gives GitHub Actions a way into the `elevator-sim` resource group without a stored secret: a
# user-assigned managed identity that trusts this repository's `server-production` environment through
# a federated credential, the two roles a deployment of `infra/azure/main.bicep` needs on that group,
# the GitHub environment pinned to `main`, and the repository variable that arms the workflow.
#
#   ./infra/azure/provision-server-deployer.sh
#
# Needs `az` signed in as an Owner (or User Access Administrator) of the resource group, and `gh`
# signed in with admin on the repository. Safe to re-run: every step is a create-if-missing.
#
# ## The two roles, and why the second one is there
#
# Contributor builds the image (`az acr build`), reads the Container App's secrets so a deployment can
# carry them forward, and deploys the template. The template also writes two role assignments
# (AcrPull on the registry, the mail-sending role on Communication Services), and Contributor may not
# write role assignments, so the identity also holds User Access Administrator. Both are scoped to the
# one resource group and nothing above it.
#
# ## The subject is read, never built
#
# GitHub issues `repo:owner@ID/repo@ID:environment:NAME` for this repository, not the documented
# `repo:OWNER/REPO:…`, and a credential built the documented way is refused with AADSTS700213
# (§ D308). So the prefix comes from GitHub's own endpoint, exactly as `infra/azure/swa/provision.sh`
# reads it.
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-elevator-sim}"
IDENTITY_NAME="${IDENTITY_NAME:-elevsim-server-deployer}"
ENVIRONMENT="server-production"
BRANCH="main"
CREDENTIAL_NAME="github-server-production"

fail() { echo "provision-server-deployer: $*" >&2; exit 1; }
say() { printf '\n== %s\n' "$*"; }

command -v az >/dev/null || fail "az is not installed"
command -v gh >/dev/null || fail "gh is not installed (brew install gh, then gh auth login)"
az account show >/dev/null 2>&1 || fail "az is not signed in (az login)"
gh auth status >/dev/null 2>&1 || fail "gh is not signed in (gh auth login)"

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
LOCATION=$(az group show -n "$RESOURCE_GROUP" --query location -o tsv)
GROUP_ID=$(az group show -n "$RESOURCE_GROUP" --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
PREFIX=$(gh api "repos/$REPO/actions/oidc/customization/sub" --jq '.sub_claim_prefix // empty' 2>/dev/null || true)
[ -n "$PREFIX" ] || PREFIX="repo:$REPO"
SUBJECT="$PREFIX:environment:$ENVIRONMENT"

cat <<SUMMARY

  Repository     : $REPO
  Resource group : $RESOURCE_GROUP ($LOCATION)
  Identity       : $IDENTITY_NAME
  Token subject  : $SUBJECT
  Roles          : Contributor, User Access Administrator (this resource group only)
SUMMARY

say "identity"
az identity show -g "$RESOURCE_GROUP" -n "$IDENTITY_NAME" -o none 2>/dev/null ||
  az identity create -g "$RESOURCE_GROUP" -n "$IDENTITY_NAME" -l "$LOCATION" -o none
CLIENT_ID=$(az identity show -g "$RESOURCE_GROUP" -n "$IDENTITY_NAME" --query clientId -o tsv)
PRINCIPAL_ID=$(az identity show -g "$RESOURCE_GROUP" -n "$IDENTITY_NAME" --query principalId -o tsv)
echo "ok: $IDENTITY_NAME (client id $CLIENT_ID)"

say "federated credential"
EXISTING=$(az identity federated-credential list -g "$RESOURCE_GROUP" --identity-name "$IDENTITY_NAME" \
  --query "[?name=='$CREDENTIAL_NAME'].subject | [0]" -o tsv)
if [ "$EXISTING" != "$SUBJECT" ]; then
  [ -z "$EXISTING" ] || az identity federated-credential delete -g "$RESOURCE_GROUP" \
    --identity-name "$IDENTITY_NAME" -n "$CREDENTIAL_NAME" --yes
  az identity federated-credential create -g "$RESOURCE_GROUP" --identity-name "$IDENTITY_NAME" \
    -n "$CREDENTIAL_NAME" --issuer https://token.actions.githubusercontent.com \
    --subject "$SUBJECT" --audiences api://AzureADTokenExchange -o none
fi
echo "ok: trusts $SUBJECT"

say "roles on $RESOURCE_GROUP"
for role in "Contributor" "User Access Administrator"; do
  held=$(az role assignment list --assignee "$PRINCIPAL_ID" --scope "$GROUP_ID" --role "$role" --query "length(@)" -o tsv)
  if [ "$held" = "0" ]; then
    # A new identity's principal can take a few seconds to reach the directory the role API reads.
    for attempt in 1 2 3 4 5 6; do
      az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
        --role "$role" --scope "$GROUP_ID" -o none && break
      [ "$attempt" = 6 ] && fail "could not assign $role"
      sleep 10
    done
  fi
  echo "ok: $role"
done

say "GitHub environment and variables"
gh api -X PUT "repos/$REPO/environments/$ENVIRONMENT" --input - --silent <<JSON
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
gh api -X POST "repos/$REPO/environments/$ENVIRONMENT/deployment-branch-policies" \
  -f "name=$BRANCH" -f 'type=branch' --silent 2>/dev/null || true
echo "ok: $ENVIRONMENT deploys from $BRANCH only"
gh variable set AZURE_SERVER_CLIENT_ID --body "$CLIENT_ID"
gh variable set AZURE_TENANT_ID --body "$TENANT_ID"
gh variable set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID"
gh variable set AZURE_SERVER_RESOURCE_GROUP --body "$RESOURCE_GROUP"
echo "ok: AZURE_SERVER_CLIENT_ID set, so deploy-server.yml is armed"

cat <<DONE

Done. Every push to $BRANCH that touches the server now deploys it, and a manual run can switch the
store:  gh workflow run deploy-server.yml -f databaseEngine=sqlite -f importFromPostgres=true
To disarm: gh variable delete AZURE_SERVER_CLIENT_ID
DONE
