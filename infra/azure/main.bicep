// Hosting the elevator simulator on Azure: one Container App serving the viewer and the API, a
// PostgreSQL flexible server behind it, and Communication Services for the one mail this product
// sends.
//
// ## What this is not
//
// This is **not** the withdrawn Phase A CI-runner template. That one provisioned a VM scale set of
// self-hosted GitHub runners, was never deployed, and was removed on 2026-08-05 along with its
// runbook and its workflow guard (docs/15 § 2). Its defect is worth restating here because this
// file is written against it: the runbook published an expected cost of ~$5/month that **did not
// reproduce from the template**, which set fixed capacity with no autoscale. The real figure was
// ≈ $212/month.
//
// So the cost model here is derived from parameters that are actually in this file, and
// `minReplicas` defaults to **0**. Scale-to-zero is the difference between the two designs: this
// app genuinely bills only while somebody is using it, and that is a property of
// `scale.minReplicas` below rather than a claim in prose. See `infra/README.md` § 5, which derives
// its figures from these defaults and names each one.

targetScope = 'resourceGroup'

// --------------------------------------------------------------------------- parameters

@description('Short name stem for every resource. Lower-case letters and digits.')
@minLength(3)
@maxLength(17)
param namePrefix string = 'elevsim'

@description('Where everything goes. Must be a region offering Container Apps and PostgreSQL flexible server.')
param location string = resourceGroup().location

@description('Container image, e.g. myregistry.azurecr.io/elevator-sim:2026-08-05. Built by the Dockerfile at the repository root.')
param containerImage string

@description('The registry the image is pulled from. Leave empty for a public image.')
param containerRegistryServer string = ''

@description('''
Signs email-confirmation tokens. 32 characters minimum — `requireSecret` refuses anything shorter,
because a secret short enough to guess is not improved by being stretched. There is deliberately no
default: a placeholder is how a development secret reaches production.
Generate one with: openssl rand -base64 48
''')
@secure()
@minLength(32)
param appSecret string

@description('PostgreSQL administrator login.')
param databaseAdminUser string = 'elevsimadmin'

@description('PostgreSQL administrator password.')
@secure()
@minLength(12)
param databaseAdminPassword string

@description('''
The address confirmation mail is sent from.

Empty means "use the free azurecomm.net test subdomain this template provisions", which works
immediately and is rate-limited. Set it to an address on your own verified domain for real use —
connecting a custom domain to a Communication Service is a manual, DNS-verified step that a
template cannot do for you.
''')
param senderAddress string = ''

@description('''
Where the **viewer** is served from, when that is not this app.

Empty — the default and the shipped state — means the container serves the page and the API from one
origin, which is what it has always done. Everything below is unchanged in that case: sign-in links
point at this app, and CORS permits nobody, because there is nothing cross-origin to permit.

Set it to a static host's origin (e.g. `https://elevator-sim-viz.azurestaticapps.net`, no trailing
slash) and **two** environment variables move together: `ELEVATOR_SIM_ORIGIN`, because a sign-in link
resolves to a page and the page is now over there (§ D241 § 4), and `ELEVATOR_SIM_ALLOW_ORIGIN`,
because the page's `fetch` is now cross-origin. They are one parameter precisely so they cannot
disagree — `main.ts` refuses to start if they do, and the failure mode they produce apart is a site
that loads and a client that reports a server which is in fact fine.

The static site must be built with `ELEVATOR_SIM_API_ORIGIN` set to **this app's** origin. That is
the third value, it lives in GitHub rather than in ARM, and `docs/16-static-site-deployment.md` § 3
is the order the three are set in.
''')
param viewerOrigin string = ''

@description('Replicas at rest. 0 is scale-to-zero and is the reason this deployment is cheap; 1 removes cold starts and bills continuously.')
@minValue(0)
@maxValue(5)
param minReplicas int = 0

@description('Ceiling on replicas. Also the ceiling on the compute bill — see infra/README.md § 5.')
@minValue(1)
@maxValue(10)
param maxReplicas int = 2

@description('PostgreSQL SKU. B1ms is the burstable entry tier and is what the cost figures assume.')
@allowed([
  'Standard_B1ms'
  'Standard_B2s'
  'Standard_D2ds_v5'
])
param databaseSku string = 'Standard_B1ms'

@description('Database storage. 32 GiB is the floor the service allows.')
@minValue(32)
param databaseStorageGb int = 32

@description('Log Analytics retention, in days.')
@minValue(30)
@maxValue(730)
param logRetentionDays int = 30

// --------------------------------------------------------------------------- names

var uniqueSuffix = uniqueString(resourceGroup().id)
var databaseName = 'elevator_sim'
var postgresName = '${namePrefix}-pg-${uniqueSuffix}'
var identityName = '${namePrefix}-identity'
var commsName = '${namePrefix}-comms-${uniqueSuffix}'

// --------------------------------------------------------------------------- identity

// User-assigned rather than system-assigned, because the Communication Services role assignment
// has to exist before the app can send mail, and a system-assigned identity does not exist until
// the app does. Splitting it out means the grant and the app deploy in one pass rather than two.
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

// The registry is created outside this template — by `az acr create`, before the image is pushed —
// because the app cannot deploy until an image exists to pull, and a registry declared here would
// not exist until the same deployment that needs to pull from it.
//
// The **grant** belongs here even though the registry does not. Without it the Container App has an
// identity that cannot read the registry it is pointed at, and the first revision fails to pull
// with an error that names authentication rather than authorization. Deriving the registry's name
// from the login server keeps it to one parameter; it requires the registry to be in this resource
// group, which is what § 3 of the runbook does.
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = if (!empty(containerRegistryServer)) {
  name: split(containerRegistryServer, '.')[0]
}

// Likewise confirmed with `az role definition list --name AcrPull`, rather than trusted because it
// looked familiar.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource registryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(containerRegistryServer)) {
  scope: registry
  name: guid(resourceGroup().id, containerRegistryServer, identity.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// --------------------------------------------------------------------------- observability

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: logRetentionDays
  }
}

// --------------------------------------------------------------------------- mail

// Communication Services is global; the data location governs where message metadata rests.
//
// `linkedDomains` is the load-bearing line. A Communication Service can only send from a domain
// that has been linked to it, and the link is *not* implied by the two resources living in the
// same resource group — without it every send fails authorization at run time, which is the worst
// place to discover it because the deployment itself succeeds.
resource comms 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: commsName
  location: 'global'
  properties: {
    dataLocation: 'United States'
    linkedDomains: [
      azureManagedDomain.id
    ]
  }
}

// The free `<guid>.azurecomm.net` subdomain: no DNS to configure, rate-limited, and enough to prove
// the confirmation flow works end to end. A custom domain is a manual verification step and is
// deliberately not attempted here.
resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = {
  name: '${namePrefix}-email-${uniqueSuffix}'
  location: 'global'
  properties: {
    dataLocation: 'United States'
  }
}

resource azureManagedDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

// The sender is a child of the **domain**, not of the Communication Service — the address belongs
// to the domain that vouches for it. `AzureManagedDomain` provisions `DoNotReply` on its own, so
// this is declaring the same value rather than adding one; it is here so the address the app is
// configured with appears in the template that creates it, instead of being folklore.
resource sender 'Microsoft.Communication/emailServices/domains/senderUsernames@2023-04-01' = {
  parent: azureManagedDomain
  name: 'donotreply'
  properties: {
    username: 'DoNotReply'
    displayName: 'Elevator Sim'
  }
}

// `Communication and Email Service Owner`. This is what lets the container send mail with **no
// secret at all** — no connection string in the image, in the environment, or in a vault, and
// revocation is deleting this assignment rather than rotating a key.
//
// Confirmed against the subscription, not remembered:
//   az role definition list --name "Communication and Email Service Owner" --query "[0].name" -o tsv
// The first deploy failed on `RoleDefinitionDoesNotExist` because this constant was wrong in its
// last segment. A built-in role id is a fact to look up, not one to recall.
var emailSenderRoleId = '09976791-48a7-449e-bb21-39d1a415f350'

resource commsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: comms
  name: guid(comms.id, identity.id, emailSenderRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', emailSenderRoleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// --------------------------------------------------------------------------- database

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: postgresName
  location: location
  sku: {
    name: databaseSku
    tier: startsWith(databaseSku, 'Standard_B') ? 'Burstable' : 'GeneralPurpose'
  }
  properties: {
    version: '17'
    administratorLogin: databaseAdminUser
    administratorLoginPassword: databaseAdminPassword
    storage: {
      storageSizeGB: databaseStorageGb
    }
    backup: {
      // The service floor. Longer retention is a real cost and this is a leaderboard for a
      // simulator, not a system of record.
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Container Apps egress from a shared pool of addresses that is not knowable in advance, so the
// database is reachable from Azure services rather than from one address.
//
// **This is the weakest control in this template and it is stated rather than buried.** It permits
// any Azure-hosted resource — including ones in other subscriptions — to *reach* the server; the
// password is then the only thing between that reachability and the data. The fix is VNet
// integration with a private endpoint, which is a larger topology (a VNet, two delegated subnets, a
// private DNS zone) and roughly doubles the standing cost. See infra/README.md § 7.
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgres
  name: 'allow-azure-services'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// `sslmode=require`: the server accepts TLS and this makes the client insist on it. Without it a
// driver that silently fell back to plaintext would carry the password across in the clear.
var databaseUrl = 'postgres://${databaseAdminUser}:${uriComponent(databaseAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'

// --------------------------------------------------------------------------- the app

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-app'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8787
        // The platform terminates TLS and redirects; nothing in the app has to know about a
        // certificate, and there is no plaintext path left open beside the encrypted one.
        allowInsecure: false
        transport: 'auto'
      }
      secrets: [
        { name: 'app-secret', value: appSecret }
        { name: 'database-url', value: databaseUrl }
      ]
      registries: empty(containerRegistryServer) ? [] : [
        {
          server: containerRegistryServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'elevator-sim'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '8787' }
            { name: 'ELEVATOR_SIM_SECRET', secretRef: 'app-secret' }
            { name: 'ELEVATOR_SIM_DB', secretRef: 'database-url' }
            // Keyless: the endpoint plus the managed identity above. No ACS connection string
            // exists anywhere in this deployment.
            { name: 'ELEVATOR_SIM_ACS_ENDPOINT', value: 'https://${comms.name}.communication.azure.com' }
            {
              name: 'ELEVATOR_SIM_MAIL_FROM'
              value: empty(senderAddress)
                ? 'DoNotReply@${azureManagedDomain.properties.mailFromSenderDomain}'
                : senderAddress
            }
            // Sign-in links must point at the public origin of **the viewer**, not at localhost and
            // not necessarily at this app. This is the one value that is wrong by default in every
            // deployment that forgets it, and the failure is silent: mail arrives carrying a link
            // nobody outside the container can open. Since § D257 it is also the value that moves
            // when the page is hosted elsewhere — see `viewerOrigin`.
            {
              name: 'ELEVATOR_SIM_ORIGIN'
              value: empty(viewerOrigin)
                ? 'https://${namePrefix}-app.${environment.properties.defaultDomain}'
                : viewerOrigin
            }
            // Which origin a browser may call this API from. Empty is "none", which is what a
            // same-origin deployment needs and what this has always effectively had — the variable
            // is declared unconditionally rather than added conditionally so that a reader of the
            // deployed revision can see the answer instead of inferring it from an absence.
            //
            // **Never `*`.** `main.ts` refuses to start on it (§ D257): the API answers
            // session-bearing requests, and a verification is a whole simulation, so a wildcard
            // publishes both to every page on the web. The value here is a single exact origin, and
            // it is the same `viewerOrigin` that set `ELEVATOR_SIM_ORIGIN` above — the server
            // cross-checks the two and refuses a deployment where they have drifted apart.
            { name: 'ELEVATOR_SIM_ALLOW_ORIGIN', value: viewerOrigin }
            // **One trusted hop: this environment's ingress, and nothing else.** § D242's
            // per-caller budget keys on the caller's address, and a process behind Container Apps
            // sees the ingress as its socket peer — so at zero hops every caller on the internet
            // shares one bucket and one abuser exhausts the sign-in budget for everybody.
            //
            // `1` rather than a guess. Measured against this environment's own ingress on
            // 2026-08-14 with a throwaway app (§ D341), which **appends** the peer it saw to
            // whatever the caller sent:
            //
            //     sent nothing              ->  x-forwarded-for: 143.105.1.202
            //     sent "9.9.9.9"            ->  x-forwarded-for: 9.9.9.9,143.105.1.202
            //     sent three addresses      ->  x-forwarded-for: 9.9.9.9, 8.8.8.8, 7.7.7.7,143.105.1.202
            //
            // so the real client is the **right-most** entry and everything left of it is the
            // caller's own text. `serve.ts#clientIpOf` counts from the right for that reason.
            //
            // **A literal, deliberately — not a parameter.** § D340 is the defect where a deploy
            // that passed no `viewerOrigin` silently reset a split deployment to same-origin,
            // because a template default is a decision and passing nothing chooses it. A value with
            // no parameter has nothing to omit. It is also correct for every deployment this
            // template produces, since the template *is* the one ingress it is measured against.
            { name: 'ELEVATOR_SIM_TRUSTED_HOPS', value: '1' }
            // The identity the ACS SDK's DefaultAzureCredential must choose. Without it, a
            // container carrying exactly one user-assigned identity still has to be told which.
            { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: { path: '/api/boards', port: 8787 }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        // **The cost model lives here.** At 0, the app bills nothing at rest — this is exactly what
        // the withdrawn Phase A template claimed and did not do.
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: { concurrentRequests: '40' }
            }
          }
        ]
      }
    }
  }
  // `registryPull` is in here for a reason a reader should not have to reconstruct: without the
  // explicit edge, Bicep sees no dependency between the role assignment and the app — the app
  // references the *identity*, not the assignment — and is free to create the app first, which
  // fails to pull.
  dependsOn: [database, allowAzure, commsRole, registryPull]
}

// --------------------------------------------------------------------------- outputs

@description('The API. Also the viewer, unless viewerOrigin is set — in which case open that instead.')
output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'

@description('Set this as the repository variable ELEVATOR_SIM_API_ORIGIN, so the static site is built knowing where the API is. docs/16-static-site-deployment.md § 3.')
output apiOrigin string = 'https://${app.properties.configuration.ingress.fqdn}'

@description('Set ELEVATOR_SIM_ORIGIN to this if you put a custom domain in front.')
output appFqdn string = app.properties.configuration.ingress.fqdn

@description('Where the page is served from, and the only origin permitted to call this API from a browser. Equal to appUrl unless viewerOrigin was set.')
output viewerUrl string = empty(viewerOrigin) ? 'https://${app.properties.configuration.ingress.fqdn}' : viewerOrigin

@description('Whether the page and the API are on one origin. False means three values have to agree — see docs/16 § 3.')
output sameOrigin bool = empty(viewerOrigin)

@description('The PostgreSQL host, for psql or a migration.')
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName

@description('The verified sender the app is configured to send from.')
output mailFromDomain string = azureManagedDomain.properties.mailFromSenderDomain

@description('The identity holding the mail-sending role. Grant it AcrPull if your registry is private.')
output identityPrincipalId string = identity.properties.principalId

@description('Whether this deployment bills at rest. False is the cheap default.')
output billsAtRest bool = minReplicas > 0
