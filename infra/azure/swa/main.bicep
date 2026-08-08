/*
  The viewer's hosting, and the identity that deploys it.

  Implements `docs/16-static-site-deployment.md`. That document is what this is judged against and
  wins any disagreement with the comments here.

  ## Scope, and the coupling this lane HAS — which an earlier draft of this file denied

  This began as a separate lane from `infra/azure/main.bicep`, and the sentence it carried was
  *"the two share a cloud and nothing else"*. That was true when it was written and is **not true
  now**, so it is corrected here rather than quietly replaced: the resource groups and lifecycles
  are still separate, and the two deployments now share **one value in three places** — this site's
  origin, which the app template takes as `viewerOrigin` and the deploy workflow takes as
  `ELEVATOR_SIM_API_ORIGIN` in the other direction. `docs/16-static-site-deployment.md` § 3 is the
  order they are set in, and it is an order because the site's hostname does not exist until this
  template has run.

  Deleting this group still does nothing to the app's group — but it leaves the app configured to
  mail sign-in links at a site that is gone, which § 8 says how to undo.

  ## Why a Static Web App and not a server, and the premise that changed

  An earlier revision of this file argued the platform from *"`packages/viz` has no server half"*.
  That was a fact about the repository when it was written and **stopped being one**: `packages/server`
  ships accounts, a leaderboard and a magic-link sign-in, and the viewer contacts it. Keeping the
  old sentence would have been the stale-premise failure this repository has a standing rule about,
  so here is the argument that survives the change.

  The *bundle* still has no server half — `core` publishes an fs-free `browser` export condition,
  the simulation runs in the page and in a Web Worker, and the reference data is JSON copied out of
  `data/`. What moves here is the **page**, and only the page. The API stays on the Container App
  that already runs it.

  The reason to move the page is measured rather than argued. The Container App runs at
  `minReplicas: 0`, and `serve.ts` serves everything outside `/api/` from the bundle **in that same
  container** — so a cold first load waits for the container to start before a single byte of HTML
  arrives. Measured on the live deployment: **32.2 s cold, 0.13 s warm.** `GET /api/wake` fixes the
  API's cold start and cannot fix this one, because the page is the thing being waited on. A CDN
  serves the page while the container is still asleep, for $0. See `docs/16` § 1 for the priced
  comparison, including the two options that were not chosen and what they would have bought.

  ## What this creates

  | Resource | Why |
  |---|---|
  | Static Web App, **Free** SKU | $0. Managed TLS, global distribution, PR preview environments. |
  | User-assigned managed identity | The identity GitHub Actions federates into. No client secret exists to leak or rotate. |
  | 2 federated identity credentials | One for pushes to the production branch, one for pull requests. Both pinned to this repository. |
  | Custom role + assignment, scoped to the site | Exactly `listSecrets` and `read`, on this one resource. Not Contributor, not on the group. |

  Nothing here holds a secret, and nothing here writes one to the repository.
*/

targetScope = 'resourceGroup'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

@description('''
Region for the Static Web App. Static Web Apps is available in a SHORT list of regions and this is
not the usual "any region" parameter — an unlisted region fails the deployment rather than falling
back. Valid at time of writing: westus2, centralus, eastus2, westeurope, eastasia.
The content is served from Azure's global edge regardless, so this choice is about where the
control-plane resource lives, not about latency for readers.
''')
@allowed([
  'westus2'
  'centralus'
  'eastus2'
  'westeurope'
  'eastasia'
])
param location string = 'eastus2'

@description('Name of the Static Web App. Must be unique within the resource group.')
@minLength(2)
@maxLength(40)
param siteName string = 'elevator-sim-viz'

@description('''
The repository GitHub Actions will deploy from, as `owner/repo`. This is the subject of the
federated credential: a workflow in any OTHER repository presenting a token for this identity is
rejected by Entra, not by anything in the workflow. Getting this wrong is the whole security
boundary, so it has no default.
''')
param githubRepository string

@description('''
Branch whose pushes deploy to production. Pull requests get preview environments regardless.

This is **not** part of any federated credential's subject, and it used to be. See the credentials
below: because the deploy job declares `environment:`, GitHub replaces the ref-based subject with an
environment-based one, and a credential naming a branch is never presented. The branch restriction
is real and it lives on the GitHub environment instead, as a deployment branch policy — which
`provision.sh` sets, so that it is provisioned rather than remembered.
''')
param productionBranch string = 'main'

@description('''
The GitHub environment the production deploy runs in. Must equal the `environment.name` that
`.github/workflows/deploy-viz.yml` gives the deploy job for a non-pull-request event, because that
string is half of the federated credential's subject.
''')
param productionEnvironment string = 'viz-production'

@description('''
The GitHub environment a pull request's preview deploy runs in. Same requirement as above, for the
`pull_request` branch of the same expression.
''')
param previewEnvironment string = 'viz-preview'

@description('''
Name for the user-assigned managed identity GitHub Actions authenticates as.
''')
param deployIdentityName string = '${siteName}-deployer'

// ---------------------------------------------------------------------------
// The site
// ---------------------------------------------------------------------------

resource site 'Microsoft.Web/staticSites@2024-04-01' = {
  name: siteName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // `Custom` means "this app's CI/CD lives outside Azure". Without it, creating a Static Web App
    // against a repository makes Azure generate and commit its own GitHub Actions workflow — which
    // would be a second, unreviewed deploy path writing to this repository. The workflow this
    // project deploys with is `.github/workflows/deploy-viz.yml`, which is in review like every
    // other file. No `repositoryUrl` or `branch` is set here for the same reason.
    provider: 'Custom'

    // The build artifact carries its own `staticwebapp.config.json` (emitted by
    // `packages/viz/vite.config.ts`), so routing and headers are versioned with the code that
    // needs them rather than configured in the portal where a reviewer never sees them.
    allowConfigFileUpdates: true

    // Preview environments per pull request. Free allows 3 concurrent; see `docs/16` § 5 for what
    // happens on the fourth.
    stagingEnvironmentPolicy: 'Enabled'

    // The paid CDN tier. Explicitly off — it is a Standard-plan feature and turning it on is the
    // single easiest way to convert a $0 deployment into a billed one.
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

// ---------------------------------------------------------------------------
// The deploying identity
// ---------------------------------------------------------------------------

resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: deployIdentityName
  location: location
}

/*
  Why a user-assigned managed identity rather than an Entra app registration.

  Both work with GitHub's OIDC. The app registration is the more commonly documented one and it is
  NOT what ships here, because creating it is a Microsoft Graph call — `az ad app create` — which
  cannot be expressed in a template. Half the deployment would then live in this file and half in a
  shell command in a runbook, and the half in the runbook is the half that drifts. A user-assigned
  identity and its federated credentials are ARM resources, so `az deployment group create` is the
  whole of the provisioning and `what-if` shows the whole of the change.
*/

/*
  The subject is the ENVIRONMENT, not the branch, and that correction was made by a run.

  These two credentials named `ref:refs/heads/main` and `pull_request` until the first real deploy
  presented a token and Entra refused it:

      AADSTS700213: No matching federated identity record found for presented assertion subject
      'repo:mrpeanut01/elevator-sim:environment:viz-production'

  The deploy job declares `environment:` (deploy-viz.yml — it is how the deployment URL and the
  protection rules work at all), and when a job references an environment GitHub *replaces* the
  ref-based subject with `repo:OWNER/REPO:environment:NAME` rather than adding to it. So neither
  credential could ever have matched, and the failure was not specific to the `workflow_dispatch`
  that found it: a push to `main` would have been refused with the same message.

  What this costs, stated rather than implied. A branch-pinned subject would not match a deploy
  dispatched from any other branch; an environment-pinned one does, because the subject carries no
  ref at all. The branch restriction is therefore no longer enforced by Entra and has moved to the
  GitHub environment's deployment branch policy, which `provision.sh` sets to exactly
  `productionBranch`. Two mechanisms became two mechanisms in different places — it is not a
  weakening, but it is a MOVE, and the half that now lives in GitHub is the half that can be
  changed without touching this file.
*/

resource pushCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deployIdentity
  name: 'github-${productionEnvironment}'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    // The exact subject GitHub puts in the token for a job running in this environment. A token
    // from another repository, or from a job in no environment at all, does not match and is
    // refused at token exchange — before any Azure permission is consulted.
    subject: 'repo:${githubRepository}:environment:${productionEnvironment}'
    audiences: ['api://AzureADTokenExchange']
  }
}

resource pullRequestCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deployIdentity
  name: 'github-${previewEnvironment}'
  // Serialised against the credential above, and this is a correctness requirement rather than a
  // preference. `parent` makes both depend on the identity and neither on each other, so ARM writes
  // them concurrently — and the resource provider refuses that outright:
  //
  //   ConcurrentFederatedIdentityCredentialsWritesForSingleManagedIdentity
  //   "Concurrent Federated Identity Credentials writes under the same managed identity are not
  //    supported."
  //
  // That is not a race that sometimes loses. It failed on the first real run of this template
  // (docs/16 § 9 listed "no Azure resource has been created" as the most likely first failure, and
  // this was it), and it failed at `what-if`-approved deploy time with six resources to create and
  // zero created. `dependsOn` is the documented remedy; there is no batching or retry option on the
  // credential resource itself.
  dependsOn: [pushCredential]
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    // Covers every pull request against this repository, which is what a preview environment per PR
    // requires. Read `docs/16` § 6 before enabling this on a public repository: this subject does
    // not distinguish a fork's pull request from a branch's, and the environment form does not
    // change that — what does is the repository's fork-pull-request approval setting, plus the
    // `if:` in deploy-viz.yml that excludes a head repository other than this one.
    subject: 'repo:${githubRepository}:environment:${previewEnvironment}'
    audiences: ['api://AzureADTokenExchange']
  }
}

// ---------------------------------------------------------------------------
// Authorization — exactly one action, on exactly one resource
// ---------------------------------------------------------------------------

/*
  The deployment token is fetched at run time (`az staticwebapp secrets list`) instead of being
  stored as a GitHub secret, so the identity needs permission to read it. The built-in role that
  covers this is `Website Contributor`, which also carries write access to every App Service
  resource in scope — far more than "let a workflow publish a static site".

  So the permission is spelled out instead. Two actions, on this site and nothing else. If this
  identity's token is ever exfiltrated from a workflow run, the whole of what it can do is read
  this app's deployment token — which is the thing the attacker would already have.
*/
resource deploymentTokenReader 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(site.id, 'swa-deployment-token-reader')
  scope: site
  properties: {
    roleName: 'SWA deployment token reader (${siteName})'
    description: 'Read one Static Web App and list its deployment token. Nothing else, nowhere else.'
    type: 'CustomRole'
    permissions: [
      {
        actions: [
          'Microsoft.Web/staticSites/read'
          'Microsoft.Web/staticSites/listSecrets/action'
        ]
        notActions: []
        dataActions: []
        notDataActions: []
      }
    ]
    assignableScopes: [site.id]
  }
}

resource deploymentTokenAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(site.id, deployIdentity.id, deploymentTokenReader.id)
  scope: site
  properties: {
    roleDefinitionId: deploymentTokenReader.id
    principalId: deployIdentity.properties.principalId
    // Stated explicitly: without it the assignment can fail on a freshly created identity whose
    // principal has not yet replicated, and the error names neither cause nor fix.
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Outputs — every value § 3 of the runbook asks you to paste into GitHub
// ---------------------------------------------------------------------------

@description('Set as the repository variable AZURE_SWA_NAME. Its presence is what arms the deploy workflow.')
output staticWebAppName string = site.name

@description('Set as the repository variable AZURE_RESOURCE_GROUP.')
output resourceGroupName string = resourceGroup().name

@description('Set as the repository variable AZURE_CLIENT_ID. Not a secret — it is an identifier, useless without the federated trust above.')
output deployClientId string = deployIdentity.properties.clientId

@description('Set as the repository variable AZURE_TENANT_ID.')
output tenantId string = subscription().tenantId

@description('Set as the repository variable AZURE_SUBSCRIPTION_ID.')
output subscriptionId string = subscription().subscriptionId

@description('Where the site will answer once something has been deployed to it. Also the value the app template takes as `viewerOrigin`, and the origin its CORS will then permit.')
output defaultHostname string = 'https://${site.properties.defaultHostname}'

/*
  The three values below are outputs so that `provision.sh` reads them back rather than keeping its
  own copies, and that is not tidiness. Two of them are literally half of a federated credential's
  subject: if this template says `viz-production` and the script creates `viz-prod`, GitHub presents
  a subject for an environment Entra has never heard of, and the failure is an AADSTS700213 that
  names the string but not which of the two places is wrong.

  `productionBranchName` is here for the same reason and one more: it is the ONLY use of the
  `productionBranch` parameter, and it has to be. When the credential subject moved from a ref to an
  environment, that parameter stopped feeding any Azure resource and the linter said so
  (`no-unused-params`) — a parameter still declared, still documented, still in every example file,
  and reaching nothing. That is this repository's most-repeated defect wearing infrastructure
  clothes. It is not deleted, because the branch restriction is real; it is *routed* to the place
  that now enforces it.
*/

@description('The environment the production deploy job runs in. Half of the production federated credential subject; `provision.sh` creates it and pins its branch policy.')
output productionEnvironmentName string = productionEnvironment

@description('The environment a pull request preview runs in. Half of the preview federated credential subject.')
output previewEnvironmentName string = previewEnvironment

@description('The one branch `productionEnvironmentName` may deploy from. Enforced by a GitHub deployment branch policy, because the federated credential subject no longer carries a ref.')
output productionBranchName string = productionBranch

@description('''
The three values that have to agree, named in one place so a reader does not have to reconstruct
them. `docs/16-static-site-deployment.md` § 3 is the order; getting the order wrong is the failure
this list exists to make obvious.
''')
output originsThatMustAgree object = {
  // 1. Built into the page: where the API is. Set as the repository variable ELEVATOR_SIM_API_ORIGIN
  //    from the app deployment's `apiOrigin` output.
  apiOriginRepositoryVariable: 'ELEVATOR_SIM_API_ORIGIN'
  // 2 and 3. Given to the app template as `viewerOrigin`, which sets both ELEVATOR_SIM_ORIGIN (where
  //    sign-in links point) and ELEVATOR_SIM_ALLOW_ORIGIN (who may call the API from a browser).
  viewerOriginForAppTemplate: 'https://${site.properties.defaultHostname}'
}
