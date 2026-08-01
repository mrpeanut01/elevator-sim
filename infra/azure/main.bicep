/*
  An ephemeral, x86-64 Linux, self-hosted GitHub Actions runner pool for elevator-sim.

  Deploys nothing that changes what CI measures, and nothing that CI depends on. The workflow's
  Linux leg falls back to `ubuntu-latest` until the repository variable `CI_LINUX_RUNNER_LABEL` is
  set to `runnerLabel` below — see `.github/workflows/ci.yml` and `infra/README.md`.

  ## The three decisions that are measurement decisions, not infrastructure ones

  1. **x86-64.** `docs/15-compute-offload-contract.md` § 0.2: an Ampere/ARM pool would be a THIRD
     pin environment, and § D201 found the § D196 pin set exactly inverted between Linux and
     darwin/arm64. `vmSize` is constrained to x86-64 SKUs by the `@allowed` list, and `ci.yml`
     fails the leg at runtime if `uname -m` is not `x86_64` — belt and braces, because the
     `@allowed` list is a thing a future edit can widen and the runtime check is not.
  2. **Ephemeral.** One job per machine, and the machine is reimaged afterwards rather than reused.
     See `cloud-init.yaml`.
  3. **The image version is part of the environment.** `imageVersion` defaults to `latest`, which
     means Canonical rolling a new 24.04 image is an uncontrolled change to the machine the Linux
     pins are judged on. That is stated rather than hidden: if a pin splits the matrix the week
     after this pool goes live, pin `imageVersion` first and re-run before touching a value.

  ## What is deliberately NOT here

  Any secret. The GitHub credential the runners need lives in the Key Vault this creates, put there
  by the owner with `az keyvault secret set` after deployment; the VMs read it with a managed
  identity at boot. Nothing in this repository holds it, and nothing in the deployment output
  reveals it.

  targetScope is the resource group: the owner creates and can delete one group, which is the whole
  teardown story.
*/

targetScope = 'resourceGroup'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

@description('Azure region. The cost figures in infra/README.md assume eastus.')
param location string = resourceGroup().location

@description('Prefix for every resource name. Keep it short; the VMSS name feeds computer names.')
@minLength(3)
@maxLength(12)
param namePrefix string = 'elevsimci'

@description('Full HTTPS URL of the repository the runners register against, e.g. https://github.com/owner/elevator-sim')
param githubRepositoryUrl string

@description('The runner label ci.yml will ask for. This is the value of the CI_LINUX_RUNNER_LABEL repository variable.')
param runnerLabel string = 'elevator-sim-linux-x64'

@description('How many runner VMs exist. This is the real cost ceiling: worst-case spend is this number times the hourly rate, all month. See infra/README.md.')
@minValue(0)
@maxValue(8)
param runnerCount int = 2

@description('x86-64 only, per contract § 0.2. Every SKU here has a local resource disk, which the ephemeral OS disk needs.')
@allowed([
  'Standard_D4ds_v5'
  'Standard_D8ds_v5'
  'Standard_D16ds_v5'
  'Standard_D8ads_v5'
  'Standard_D16ads_v5'
])
param vmSize string = 'Standard_D8ds_v5'

@description('Spot instances cost roughly 60-90% less and can be evicted mid-job. An eviction surfaces as a failed job that is not a test failure, which is the ambiguity this repository is worst served by — but at CI utilisation it is a handful of re-runs a month against a 3-5x bill. See infra/README.md § The spot trade-off.')
param useSpot bool = true

@description('instancePublicIp bills only while an instance exists (~$0.005/h each). natGateway costs ~$32.85/month standing whether anything runs or not, and buys one stable egress IP you can allowlist. At CI utilisation the NAT gateway is about 80% of the bill.')
@allowed([
  'instancePublicIp'
  'natGateway'
])
param egressMode string = 'instancePublicIp'

@description('Marketplace image version. "latest" means Canonical decides when the environment changes — see the header.')
param imageVersion string = 'latest'

@description('actions/runner release to install, or "latest" to resolve at boot.')
param runnerVersion string = 'latest'

@description('Admin user for the VMs. No inbound port is opened for it; use `az vmss run-command` to debug.')
param adminUsername string = 'azureuser'

@description('SSH public key for the admin user. Azure requires one for a password-less Linux VM. It is a PUBLIC key, but pass it at deploy time rather than committing it.')
param adminSshPublicKey string

@description('Name of the Key Vault secret holding the GitHub repository-admin credential. Create it after deployment; this template never sets it.')
param githubCredentialSecretName string = 'github-runner-registration-credential'

@description('Optional. An email address to alert when the monthly budget threshold is crossed. Empty means no budget resource is created. NOTE: an Azure budget alerts, it does not cap — the cap is runnerCount.')
param budgetAlertEmail string = ''

@description('Monthly budget in the billing currency, for the alert only.')
param monthlyBudgetAmount int = 250

@description('First of the current month; Azure budgets require a month boundary.')
param budgetStartDate string = utcNow('yyyy-MM-01')

// ---------------------------------------------------------------------------
// Names and constants
// ---------------------------------------------------------------------------

var suffix = uniqueString(resourceGroup().id)
var vmssName = '${namePrefix}-vmss'
var vaultName = take('${namePrefix}kv${suffix}', 24)

// Built-in role definition ids, referenced by id rather than name because names are not stable.
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var virtualMachineContributorRoleId = '9980e02c-c2be-4d73-94e8-173b1dc7cf3c'

// The runner also carries `self-hosted`, `linux` and `x64` automatically; `runnerLabel` is the one
// ci.yml asks for, and it is deliberately specific enough that no other pool could answer to it.
var runnerLabels = '${runnerLabel},elevator-sim'

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-runner-identity'
  location: location
}

// ---------------------------------------------------------------------------
// Key Vault. Created empty on purpose — see the header.
// ---------------------------------------------------------------------------

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    // RBAC rather than access policies, so the grant below is a role assignment and shows up in
    // the same place as every other permission in the subscription.
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: null
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource vaultRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, keyVaultSecretsUserRoleId)
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
  }
}

// ---------------------------------------------------------------------------
// Network. Nothing inbound; the runner dials out and stays connected.
// ---------------------------------------------------------------------------

resource nsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: '${namePrefix}-nsg'
  location: location
  properties: {
    securityRules: [
      {
        // Azure's default rules already deny inbound from the internet. This says so explicitly,
        // because "the default is fine" is the kind of claim that stops being true silently.
        name: 'deny-all-inbound'
        properties: {
          priority: 4000
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}

resource natPublicIp 'Microsoft.Network/publicIPAddresses@2023-11-01' = if (egressMode == 'natGateway') {
  name: '${namePrefix}-nat-ip'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource natGateway 'Microsoft.Network/natGateways@2023-11-01' = if (egressMode == 'natGateway') {
  name: '${namePrefix}-nat'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    idleTimeoutInMinutes: 10
    publicIpAddresses: [
      {
        id: natPublicIp.id
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: '${namePrefix}-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.42.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'runners'
        properties: union(
          {
            addressPrefix: '10.42.0.0/24'
            networkSecurityGroup: {
              id: nsg.id
            }
            // Opt out of Azure's implicit outbound access explicitly. It is being retired, and a
            // subnet that silently loses egress on a platform deadline is a CI outage nobody
            // scheduled.
            defaultOutboundAccess: false
          },
          egressMode == 'natGateway'
            ? {
                natGateway: {
                  id: natGateway.id
                }
              }
            : {}
        )
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// The runner pool
// ---------------------------------------------------------------------------

var cloudInit = replace(
  replace(
    replace(
      replace(
        replace(
          replace(loadTextContent('cloud-init.yaml'), '__REPO_URL__', githubRepositoryUrl),
          '__KEY_VAULT_NAME__',
          vaultName
        ),
        '__SECRET_NAME__',
        githubCredentialSecretName
      ),
      '__RUNNER_LABELS__',
      runnerLabels
    ),
    '__IDENTITY_CLIENT_ID__',
    identity.properties.clientId
  ),
  '__RUNNER_VERSION__',
  runnerVersion
)

resource vmss 'Microsoft.Compute/virtualMachineScaleSets@2024-07-01' = {
  name: vmssName
  location: location
  sku: {
    name: vmSize
    tier: 'Standard'
    capacity: runnerCount
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    // Uniform rather than Flexible: an instance reimaging *itself* is the ephemerality mechanism,
    // and Uniform's per-instance reimage is the well-trodden path for it.
    orchestrationMode: 'Uniform'
    overprovision: false
    singlePlacementGroup: true
    upgradePolicy: {
      // Manual. An automatic rolling upgrade would recycle instances mid-job; the runners recycle
      // themselves on a boundary they choose, which is the whole point.
      mode: 'Manual'
    }
    virtualMachineProfile: {
      priority: useSpot ? 'Spot' : 'Regular'
      evictionPolicy: useSpot ? 'Delete' : null
      billingProfile: useSpot
        ? {
            // -1 means "never pay more than the pay-as-you-go price", so spot is a discount with a
            // ceiling rather than an auction with an open one.
            maxPrice: -1
          }
        : null
      osProfile: {
        computerNamePrefix: take(replace(namePrefix, '-', ''), 9)
        adminUsername: adminUsername
        linuxConfiguration: {
          disablePasswordAuthentication: true
          provisionVMAgent: true
          ssh: {
            publicKeys: [
              {
                path: '/home/${adminUsername}/.ssh/authorized_keys'
                keyData: adminSshPublicKey
              }
            ]
          }
        }
        customData: base64(cloudInit)
      }
      storageProfile: {
        imageReference: {
          publisher: 'Canonical'
          offer: 'ubuntu-24_04-lts'
          sku: 'server'
          version: imageVersion
        }
        osDisk: {
          createOption: 'FromImage'
          // Ephemeral OS disk on the local resource disk: no managed disk to pay for, and a
          // reimage is a local NVMe restore rather than a storage round trip. It also makes
          // "reused runner" impossible by construction — there is nothing durable to reuse.
          caching: 'ReadOnly'
          diffDiskSettings: {
            option: 'Local'
            placement: 'ResourceDisk'
          }
          diskSizeGB: 64
        }
      }
      networkProfile: {
        networkInterfaceConfigurations: [
          {
            name: '${namePrefix}-nic'
            properties: {
              primary: true
              networkSecurityGroup: {
                id: nsg.id
              }
              ipConfigurations: [
                {
                  name: '${namePrefix}-ipcfg'
                  properties: union(
                    {
                      subnet: {
                        id: '${vnet.id}/subnets/runners'
                      }
                    },
                    egressMode == 'instancePublicIp'
                      ? {
                          publicIPAddressConfiguration: {
                            name: '${namePrefix}-pip'
                            sku: {
                              name: 'Standard'
                              tier: 'Regional'
                            }
                            properties: {
                              idleTimeoutInMinutes: 4
                            }
                          }
                        }
                      : {}
                  )
                }
              ]
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    vaultRead
  ]
}

// The instance's own identity needs to be able to reimage the instance. Scoped to this scale set
// and nothing else: the credential a workflow could reach cannot touch any other resource.
resource vmssSelfReimage 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vmss.id, identity.id, virtualMachineContributorRoleId)
  scope: vmss
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', virtualMachineContributorRoleId)
  }
}

// ---------------------------------------------------------------------------
// Cost observability. Contract criterion 7 asks for a declared ceiling; this is the alarm, and
// `runnerCount` is the actual ceiling. An Azure budget notifies. It does not stop anything.
// ---------------------------------------------------------------------------

resource budget 'Microsoft.Consumption/budgets@2023-05-01' = if (!empty(budgetAlertEmail)) {
  name: '${namePrefix}-monthly'
  properties: {
    category: 'Cost'
    amount: monthlyBudgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      atEightyPercent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        contactEmails: [
          budgetAlertEmail
        ]
        thresholdType: 'Actual'
      }
      forecastOverBudget: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        contactEmails: [
          budgetAlertEmail
        ]
        thresholdType: 'Forecasted'
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs. Nothing here is a secret.
// ---------------------------------------------------------------------------

@description('Set this as the repository variable CI_LINUX_RUNNER_LABEL to move the Linux leg. Until you do, nothing changes.')
output ciLinuxRunnerLabel string = runnerLabel

@description('Put the GitHub credential here: az keyvault secret set --vault-name <this> --name <secretName> --value <token>')
output keyVaultName string = vaultName

output githubCredentialSecretName string = githubCredentialSecretName
output scaleSetName string = vmssName
output resourceGroupName string = resourceGroup().name
output runnerCount int = runnerCount
output vmSize string = vmSize
output priority string = useSpot ? 'Spot' : 'Regular'
