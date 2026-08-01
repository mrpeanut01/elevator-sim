# Compute offload — Phase A deployment runbook

Self-hosted Azure runners for the Linux leg of CI. This directory is the implementation of
[`docs/15-compute-offload-contract.md`](../docs/15-compute-offload-contract.md) § 2; the contract is
what the work is judged against, and it wins any disagreement with this file.

---

## 0. Read this first: nothing here is switched on

**Merging this changes nothing about how CI runs.** The Linux leg's runner label is

```yaml
runner: ${{ vars.CI_LINUX_RUNNER_LABEL || 'ubuntu-latest' }}
```

and with the repository variable unset — which is the shipped state — that resolves to
`ubuntu-latest`. No job asks for a self-hosted runner, so no job queues for one. The macOS leg is a
literal `macos-latest` and cannot be retargeted at all.

That claim is not left as an assertion. `infra/checks/workflowMatrix.test.mjs` evaluates the
expression under an empty variable set and requires `ubuntu-latest`, evaluates it under a populated
one and requires the variable's value, and then mutates the shipped `ci.yml` nine ways — deleting
the macOS leg, making it configurable, removing the fallback, pointing the default at a self-hosted
label, flipping `fail-fast`, adding a Node axis, collapsing both legs onto one platform, moving the
guard job onto the fleet it guards — and requires the guard to reject every one. It runs as the
`matrix shape` job in `.github/workflows/ci.yml`, on a GitHub-hosted runner, with no `npm ci`.

Run it yourself:

```sh
node --test 'infra/checks/*.test.mjs'
```

It is **not** part of `npm test`: `vitest.config.ts` scopes its projects to `packages/*`, and this
lane does not own that file. The `matrix shape` job is the non-test caller.

---

## 1. What gets deployed

| Resource | Why |
|---|---|
| VM scale set, `Standard_D8ds_v5`, Ubuntu 24.04, **x86-64** | Contract § 0.2. An ARM pool would be a *third pin environment*, not a cheaper Linux one — § D201 found the § D196 pin set exactly inverted between Linux and darwin/arm64. `ci.yml` also fails the leg at runtime if `uname -m` is not `x86_64`. |
| Ephemeral OS disk on local NVMe | Contract § 2: one job per runner. There is nothing durable to reuse. |
| User-assigned managed identity | Reads the GitHub credential from Key Vault at boot; reimages its own instance afterwards. Scoped to those two things and nothing else. |
| Key Vault (created **empty**) | Holds the GitHub credential. This template never writes a secret and the repository never holds one. |
| VNet + NSG, no inbound rules | The runner dials out. Debugging is `az vmss run-command`, not SSH. |
| Consumption budget (optional) | Alerts. **It does not cap** — see § 6. |

**The ephemerality mechanism.** `cloud-init.yaml` registers the runner with `--ephemeral`, runs
exactly one job, and then POSTs a **reimage** for its own instance. Reimage restores the platform
image from local NVMe and re-runs cloud-init, so the next job gets a genuinely clean tree — not a
restarted process on the same filesystem, which would leave `node_modules`, `dist/` and the npm
cache behind. A stale `dist/` produced 5 spurious failures during the § D201 investigation and
`ci.yml` already has a comment about it; this is the same defect closed structurally.

The reimage is unconditional. A *failed* job leaves exactly the dirty tree the next one must not
inherit.

---

## 2. Prerequisites

- An Azure subscription you can create resource groups in, and `Owner` or
  `User Access Administrator` on it (the template creates two role assignments).
- `az` ≥ 2.60 with the Bicep CLI (`az bicep install`).
- `gh` CLI, authenticated, with admin on the repository.
- An SSH public key. It is a public key, but pass it at deploy time rather than committing it.

---

## 3. Deploy

```sh
# 1. Group. One group, so teardown is one command.
az group create --name elevator-sim-ci --location eastus

# 2. Parameters. The example file has no secrets in it; your filled-in copy is gitignored.
cp infra/azure/main.parameters.example.json infra/azure/main.parameters.json
$EDITOR infra/azure/main.parameters.json     # githubRepositoryUrl, adminSshPublicKey

# 3. What-if first. Read it. This is the only preview you get.
az deployment group what-if \
  --resource-group elevator-sim-ci \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/main.parameters.json

# 4. Deploy.
az deployment group create \
  --resource-group elevator-sim-ci \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/main.parameters.json
```

### The GitHub credential

The runners need a repository-admin credential to mint their own short-lived registration tokens.
Create a **fine-grained personal access token**, scoped to this one repository, with
**`Administration: Read and write`** (the permission the `actions/runners/registration-token`
endpoint requires) and a 90-day expiry. Then:

```sh
VAULT=$(az deployment group show -g elevator-sim-ci -n main --query properties.outputs.keyVaultName.value -o tsv)
SECRET=$(az deployment group show -g elevator-sim-ci -n main --query properties.outputs.githubCredentialSecretName.value -o tsv)

# Read from stdin so the token is not in your shell history.
az keyvault secret set --vault-name "$VAULT" --name "$SECRET" --file /dev/stdin
```

**Why Key Vault rather than the scale set's `customData`.** `customData` is stored on the scale set
model and is readable by anyone with `Reader` on the resource group. Via Key Vault the credential
exists on the VM only as a shell variable, for the seconds between the fetch and the exchange for a
registration token, and is `unset` immediately after. Nothing writes it to disk.

**Why a PAT rather than a GitHub App.** A GitHub App is the better credential — no expiry to
babysit, installation tokens live an hour, revocation is one click. It is not what ships here
because minting an installation token requires signing an RS256 JWT at boot, which is another
moving part in a shell script whose failure mode is a silently unregistered runner. The App is the
upgrade; the PAT is one `curl`. If you rotate the PAT, no redeployment is needed — the VMs read the
vault on every boot.

**Why OIDC is named here but not used.** OIDC federated credentials are the right answer for the
*other* direction — a workflow that deploys or manages this Azure estate should authenticate with a
federated credential on a Microsoft Entra app (`subject: repo:OWNER/elevator-sim:ref:refs/heads/main`)
rather than a stored `AZURE_CREDENTIALS`, because there is then no long-lived client secret in the
repository, tokens are minted per run and bound to an audience and a subject, and revocation is
deleting the federated credential rather than rotating something you hope nobody copied. **Phase A
ships no such workflow.** You deploy from your own machine with `az login`, so there is no secret in
this repository because there is no automation here to hold one. Add the federated credential when
you automate the deployment, not before.

---

## 4. Turn it on

```sh
LABEL=$(az deployment group show -g elevator-sim-ci -n main --query properties.outputs.ciLinuxRunnerLabel.value -o tsv)
gh variable set CI_LINUX_RUNNER_LABEL --body "$LABEL"
```

Turn it off — instantly, and this is also the rollback:

```sh
gh variable delete CI_LINUX_RUNNER_LABEL
```

The next workflow run falls back to `ubuntu-latest`. Nothing else changes: the job is still named
`suite (linux)`, so a required status check keeps its name across the switch in both directions.

---

## 5. Verify the runner is live

```sh
# The VMs exist and are running.
az vmss list-instances -g elevator-sim-ci -n elevsimci-vmss -o table

# GitHub can see them, idle, with the right labels.
gh api repos/OWNER/elevator-sim/actions/runners \
  --jq '.runners[] | {name, status, busy, labels: [.labels[].name]}'

# What a specific instance is doing. There is no inbound SSH; this goes through the VM agent.
az vmss run-command invoke -g elevator-sim-ci -n elevsimci-vmss --instance-id 0 \
  --command-id RunShellScript --scripts "journalctl -u gh-runner -n 80 --no-pager"
```

Expect `status: online`, `busy: false`, and labels including `self-hosted`, `linux`, `x64` and
`elevator-sim-linux-x64`. A runner that appears and disappears every couple of minutes is normal —
that is the ephemeral cycle. A runner that never appears is almost always the Key Vault secret
(check the journal for a 403 from `vault.azure.net`, which usually means the role assignment had
not propagated on first boot; the systemd unit retries every 30 s).

Then run CI once and read the **"Record the environment the pins are being judged against"** step.
It prints the runner label, the runner *name*, `uname -m` and the kernel. § D201's standing rule is
that a run is a machine as well as a commit, and on a self-hosted leg that block is the only thing
that says which machine.

### What must not move

Contract criterion 4: **no pinned estimate and no identity digest moves.** Phase A changes where the
suite runs, not what it computes, and § D202 established that every discrete decision this simulator
makes is bit-portable across architectures. If a pin moves on the first self-hosted run, that is a
**finding about the runner** — report it and stop. It is not a value to edit. § D196/§ D201 cost
this repository a wave over precisely that mistake.

The first thing to check in that case is `imageVersion`, which defaults to `latest`.

---

## 6. Cost

> **These are estimates derived from Azure's published pay-as-you-go list prices, not a quote.**
> Verify against the Azure pricing calculator for your subscription, region and agreement before
> deploying. Spot prices are variable by definition and the figure below is a planning number, not
> a rate you are promised.

**Assumptions:** region **East US**; SKU **`Standard_D8ds_v5`** (8 vCPU, 32 GiB, x86-64); Linux, no
OS licence; ephemeral OS disk on the local resource disk, so **no managed disk charge**;
`egressMode: instancePublicIp`; `runnerCount: 2`; `useSpot: true`.

| Line item | Rate |
|---|---|
| `D8ds_v5`, Linux, pay-as-you-go | ≈ **$0.452** / hour |
| `D8ds_v5`, Linux, Spot (planning figure, ≈70 % off) | ≈ **$0.14** / hour |
| Standard public IP, per live instance | ≈ $0.005 / hour (≈ $3.65 / month) |
| NAT Gateway — *only* if `egressMode: natGateway` | ≈ $0.045 / hour (≈ **$32.85 / month, standing**) + $0.045 / GB |
| Key Vault, standard | $0.03 per 10 000 operations |
| Ephemeral OS disk | $0 |
| Egress bandwidth | first 100 GB / month free, then ≈ $0.087 / GB |

### The declared ceiling

Contract criterion 7 requires a ceiling declared before the first fan-out. **A budget alert is not a
ceiling** — Azure budgets notify and do not stop spend. The actual ceiling is `runnerCount`, because
that is the only thing that bounds the burn rate:

```
ceiling ≈ runnerCount × 730 h × (VM hourly rate + $0.005)   [+ $32.85 if egressMode = natGateway]
```

At the shipped defaults, with both VMs pinned busy every hour of a 730-hour month:

| Configuration | Absolute ceiling / month |
|---|---|
| **2 × `D8ds_v5`, Spot, instance IPs (the default)** | **≈ $212** |
| 2 × `D8ds_v5`, Regular, instance IPs | ≈ $667 |
| 2 × `D8ds_v5`, Spot, NAT Gateway | ≈ $245 |

**Declared ceiling: $250 / month** at the shipped defaults. That is also the default
`monthlyBudgetAmount`, so the alert and the ceiling are the same number rather than two numbers that
drift apart.

### Expected cost at a stated utilisation

**Utilisation assumed: 120 Linux CI jobs per month** (≈ 4 a day — a busy wave is more, a quiet week
much less), each **≈ 15 minutes of suite plus ≈ 2 minutes of provisioning and reimage** ≈ 0.28
runner-hours, so **≈ 34 runner-hours per month**.

| Configuration | Expected / month |
|---|---|
| **Spot + instance IPs (the default)** | **≈ $5** |
| Regular + instance IPs | ≈ $16 |
| Spot + NAT Gateway | ≈ $43 |

**The 15-minute figure is an extrapolation, not a measurement.** The suite takes ~35 minutes on
`ubuntu-latest` (`review.yml`'s header) and the contract § 1 puts it at roughly one CPU-hour at
5–6× parallelism; 8 vCPU should land somewhere in 12–18 minutes, and nothing here has measured it
because nothing has been provisioned. **The first real run replaces this number.** Until it does,
the cost figure is an estimate with a decimal point on it.

### Why the default is not the NAT Gateway

At this utilisation the NAT Gateway is **about 80 % of the bill** — $38 standing and metered against
$5 of compute — and it buys one stable, allowlistable egress IP that nothing in this repository has
asked for. That is why `egressMode` defaults to `instancePublicIp`, which bills only while an
instance exists. Switch to `natGateway` if your organisation requires egress from a known address;
it is one parameter, and it roughly ten-times the bill.

### The Spot trade-off

Spot instances cost roughly 60–90 % less and can be evicted with 30 seconds' notice. **An eviction
surfaces in GitHub as a failed job that is not a test failure** — the log says the runner received a
shutdown signal — and a red leg that does not mean what a red leg means is exactly the ambiguity
this repository is worst served by. Against that: at CI utilisation it is a handful of re-runs a
month against a 3× bill, `maxPrice: -1` means you never pay above the pay-as-you-go rate, and the
`suite` job's `fail-fast: false` means an evicted Linux leg does not take the macOS leg with it.

Set `useSpot: false` when a red leg has to be unambiguous — during a pin investigation, or for the
Phase B measurement fan-out where an evicted shard is a lost replication block. Phase B is a
separate lane and is out of scope here.

---

## 7. Tear it down

**Delete the repository variable first.** Deleting the infrastructure while `CI_LINUX_RUNNER_LABEL`
is still set leaves every Linux job queueing for a runner that no longer exists — and job queue time
is *not* bounded by `timeout-minutes`, so they sit for up to 24 hours before failing.

```sh
gh variable delete CI_LINUX_RUNNER_LABEL     # CI is back on ubuntu-latest from the next run
az group delete --name elevator-sim-ci --yes --no-wait
```

The Key Vault is soft-deleted for 7 days. If you want to redeploy with the same name inside that
window, purge it:

```sh
az keyvault purge --name <vault-name> --location eastus
```

Then revoke the fine-grained PAT in GitHub settings, and delete any offline runners left in
**Settings → Actions → Runners**.

---

## 8. Known limitations

Stated rather than discovered later.

1. **None of this has been deployed.** The template compiles clean under `az bicep build` (v0.46.1)
   and the cloud-config parses, and that is the whole of the evidence. No VM has booted, no runner
   has registered, and no job has run on one. Everything in § 5 and § 6 is a prediction. This is the
   most important limitation on the page.
2. **Queue time is unbounded.** GitHub does not let a workflow time out while *waiting* for a
   runner; `timeout-minutes` starts when the job does. If the pool is down and the variable is set,
   jobs queue for up to 24 hours. The mitigation is § 4's one-line rollback.
3. **`imageVersion` defaults to `latest`.** Canonical rolling a new 24.04 image is an uncontrolled
   change to the machine the Linux pins are judged on — which is precisely what contract § 0.2 is
   about. Pinning it is one parameter, and is the first thing to do if a pin ever splits the matrix
   after this pool goes live.
4. **The runner binary is resolved at boot** (`runnerVersion: latest`) and installed with
   `--disableupdate`, so it is stable *within* a job and not *between* jobs. Pin `runnerVersion` if
   that matters.
5. **No demand-driven autoscaling.** Capacity is fixed at `runnerCount`. Cost is bounded by that
   number, not by demand, and a burst of concurrent PRs queues rather than scaling out.
6. **Every job pays 60–120 s of re-provisioning**, because reimage restores the platform image and
   cloud-init runs again. A pre-baked image (Azure Image Builder) would remove it; that is future
   work, not Phase A.
7. **Uniform orchestration.** Chosen because per-instance self-reimage is the well-trodden path
   there. Flexible is Azure's forward direction and a later migration.
8. **The workflow guard models GitHub's `||`, it does not execute it.** The evaluator in
   `infra/checks/workflowMatrix.mjs` is deliberately tiny and throws on any expression shape it does
   not fully understand, so a rewrite cannot pass by being unrecognised — but it is a model, and the
   authority on GitHub expressions is GitHub.

---

## 9. The fork pull request problem

**Read this before setting the variable if this repository is public.**

`ci.yml` triggers on `pull_request`. A pull request from a fork therefore runs *that fork's code* on
your VM, inside your subscription, with your managed identity attached to the metadata endpoint.
GitHub's own documentation recommends against self-hosted runners on public repositories for exactly
this reason.

What is already in the design's favour, and what is not:

- **In its favour.** The VM is destroyed after every job, so nothing a malicious job leaves behind
  survives to the next one. The `runner` user has no `sudo`. The managed identity's only grants are
  *read one Key Vault secret* and *reimage this one scale set* — it cannot reach any other resource
  in the subscription. `suite` runs with `permissions: contents: read`.
- **Not in its favour.** A job that can reach the metadata endpoint can read that Key Vault secret,
  which is a repository-admin credential. That is the real exposure, and the mitigations above
  narrow it rather than close it.

**Before you turn this on for a public repository**, set
*Settings → Actions → General → Fork pull request workflows from outside collaborators* to
**"Require approval for all external contributors"**. That is the control that matters, it is a
repository setting rather than anything in this directory, and nothing here can assert that you have
set it.

The stronger fix, if forks ever become routine, is to stop putting the GitHub credential within
reach of a job at all — a just-in-time runner registration minted by a controller outside the VM,
rather than by the VM itself. That is a different design, not a parameter.
