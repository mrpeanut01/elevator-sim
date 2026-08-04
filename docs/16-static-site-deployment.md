# Deploying the viewer — platform, path, and what it costs

How `packages/viz` gets hosted on Azure, why the platform is the cheapest one that can host it
rather than the cheapest one Azure sells, and how a deployment authenticates without this
repository holding a secret.

This document is the contract. `infra/azure/swa/main.bicep` and `.github/workflows/deploy-viz.yml`
are the implementation, and this file wins any disagreement with them.

**Not to be confused with [`docs/15-compute-offload-contract.md`](15-compute-offload-contract.md)
and `infra/azure/main.bicep`.** That lane puts *CI runners* on Azure VMs so the test matrix has
cores. This lane puts the *viewer* on a CDN so a person can open it. Separate resource groups,
separate lifecycles, no shared outputs; deleting either does nothing to the other. They are both in
`infra/azure/` and that is the whole of their relationship.

---

## 0. Read this first: nothing here is switched on

**Merging this deploys nothing and bills nothing.** Every deploying job in `deploy-viz.yml` is
guarded by

```yaml
if: vars.AZURE_SWA_NAME != ''
```

and no repository variable is set, which is the shipped state. What the workflow *does* do from the
first commit is build the site on every push and pull request, assert the artifact is complete, and
upload it as a build artifact you can download. Turning the deployment on is § 3; turning it off is
one command and is also the rollback.

The split is on purpose, and it is the same shape `infra/README.md` § 0 uses: the half that catches
regressions runs immediately, the half that spends money and touches an external system waits for a
human. It also means the deploy path is exercised while unarmed, so it cannot quietly rot — the
failure mode a `workflow_dispatch`-only job would have had.

---

## 1. The platform, and why the comparison is short

### What is actually being hosted

`packages/viz` has **no server half** — *as of this commit*, and the qualifier is load-bearing: a
concurrent lane is reportedly adding a database and a login framework, which is the premise below
expiring rather than a detail. Read "What would change the answer" at the end of this section before
quoting anything here. For the tree as it stands, the claim is a property of the codebase rather
than a simplification made here:

- `core` publishes a `browser` export condition resolving to `core/src/browser.ts`, an fs-free
  barrel, and `core/src/browser.test.ts` walks its transitive import graph and fails if a `node:`
  import returns to it. The simulation runs in the page.
- Batch and campaign runs go to a Web Worker (`dev/batchWorker.ts`), which is still the browser.
- The reference data is five JSON files plus `data/buildings/`, copied into the output by Vite's
  `publicDir`.

So `npm run build:web` produces the entire product: **1.6 MB on disk, 283.3 KiB transferred on a
cold load** (measured — § 9). Nothing needs to execute on a server to serve it.

That collapses the platform question. Every compute-bearing Azure service is priced for a process
that runs; here there is no process, so anything with one is paying for idle time to hand back
files that a static host hands back for nothing.

### The comparison

> These are derived from Azure's published list prices and quota documentation, **not a quote**.
> Verify against the pricing calculator for your subscription, region and agreement before
> deploying. The same caveat `infra/README.md` § 6 carries, for the same reason.

| Option | Monthly | Why not |
|---|---|---|
| **Static Web Apps, Free** | **$0** | — **chosen** |
| Blob Storage static website | ~$0 alone | Storage for 1.6 MB rounds to nothing, but **custom-domain HTTPS requires Front Door or CDN in front** (Front Door Standard ≈ $35/month base). No preview environments, no managed certificate, no SPA fallback without writing one. Cheaper only if you never want a domain. |
| App Service, Free F1 | $0 | 60 CPU-minutes/day, the app sleeps, and **Free tier has no custom-domain TLS at all**. You are also running a web server process to serve static files. Worse on every axis that matters here. |
| Container Apps, consumption | low, not $0 | Scale-to-zero still means cold starts, a container image to build and store, and per-request billing — to serve a directory. It buys a server this product does not have. |
| VM (as the CI lane uses) | ≈ $330 | `D8ds_v5` at ≈ $0.452/h. Correct for a CI runner that needs 8 cores; absurd for 1.6 MB of static files. |

### What the Free plan includes

Free hosting, a **managed TLS certificate**, **2 custom domains per app**, **100 GB egress per
month**, **3 concurrent pre-production (preview) environments**, and global distribution.
Storage is capped at **250 MB per app** and 500 MB across all environments.

Two of those numbers are worth holding against the measurements in § 9: the artifact is **1.6 MB
against a 250 MB cap** (0.6 %), and a cold load is **283.3 KiB against 100 GB/month**, which is
**≈ 370 000 cold loads per month** before the free egress is spent.

**The Free plan carries no SLA**, and when the bandwidth quota is exhausted **the site stops being
served** rather than being billed for overage. For a project viewer that is the right failure — it
cannot produce a surprise invoice. If this ever needs an SLA, a fourth custom domain, or more than
three previews at once, the answer is the Standard plan and this document's § 1 needs re-running,
not patching.

### What would change the answer — and something already is

The verdict "static host" holds exactly as long as the viewer keeps running its own simulation. It
stops holding the day something needs a server: a shared recording store, a hosted batch runner for
the Phase B measurement fan-out, an authenticated API.

**One of those is reportedly being built right now.** A concurrent lane is implementing a SQL Server
database and a login framework. **This is second-hand and unverified** — it was not on `main` and no
part of it was visible in this tree when this document was written, so nothing below is a reading of
that design. It is recorded here because whoever lands it will hit this file, and the collisions are
cheaper to name now than to debug later.

**What does not change.** The viewer is still static, and a static host is still the right way to
serve it. The build, the manifest fix and the artifact guard are orthogonal to whether a database
exists.

**What does change, specifically:**

1. **The `$0` headline stops being true of the system.** It remains true of *hosting the viewer*.
   Azure SQL Database is not free — serverless has a monthly free vCore-second allowance and the
   cheapest provisioned tiers are a few dollars a month, and a SQL Server *instance* (rather than
   Azure SQL Database) is materially more than that. § 1's table prices a static site; it does not
   price a database, and it must not be quoted as if it did.
2. **Free plan or Standard becomes a real question.** A managed Azure Functions API is supported on
   Free. **Linked ("bring your own") backends are a Standard-plan feature**, so pointing the site at
   a separately deployed App Service or Functions app moves this off Free. Which one applies depends
   on the shape of their API, which is not visible from here.
3. **Three lines of `staticwebapp.config.json` will actively break a login flow**, and they are the
   most likely thing to cost someone an afternoon. All three are in the CSP:
   - `form-action 'none'` — blocks **every** form submission. A POST login form fails outright.
   - `connect-src 'self'` — blocks `fetch`/XHR to any other origin. A same-origin `/api/*` backend
     is fine; an API on its own hostname is blocked by the browser.
   - `script-src 'self'` — blocks a third-party auth SDK loaded from a CDN (MSAL, for instance).

   These were chosen for a page that talks to nobody, and they were **measured** rather than
   guessed — § 4 records `worker-src` being tightened after a browser run proved the hedge
   unnecessary. Widening them for an auth flow is legitimate; widening them *by guess* is not. Drive
   the flow and open only what it actually requires.
4. **`navigationFallback.exclude` has no API prefix.** Static Web Apps routes `/api/*` ahead of the
   fallback, so a managed backend is unaffected — but an API on any other prefix would have its 404s
   answered with `index.html` and a **200**, which is precisely the silent failure § 4 exists to
   describe. If the prefix is not `/api`, add it to the exclusion list and the guard in
   `buildingsManifest.test.ts`.
5. **Static Web Apps already has authentication**, via `/.auth/*` with Entra ID/GitHub providers and
   role-based routing in `staticwebapp.config.json`. That may make a hand-rolled login framework
   partly redundant, or may conflict with it. Worth one look before the two are wired together.

**None of this is a reason to hold this lane.** Everything here is inert (§ 0) and the viewer's
hosting is decided independently of whether a database exists. But the *system's* platform answer is
no longer the viewer's platform answer, and whoever owns the database gets to make it — with § 1's
table as an input rather than as the verdict.

---

## 2. Prerequisites

- An Azure subscription you can create resource groups in, and **`Owner`** or
  **`User Access Administrator`** on it. The template creates a custom role definition and a role
  assignment, which `Contributor` cannot do.
- `az` ≥ 2.60 with the Bicep CLI (`az bicep install`).
- `gh` CLI, authenticated, with admin on the repository.

No SSH key, no PAT, no secret of any kind. There is nothing to hold.

---

## 3. Deploy

```sh
# 1. Its own resource group, separate from the CI-runner lane. Teardown is then one command.
az group create --name elevator-sim-viz --location eastus2

# 2. Parameters. The example file has nothing sensitive in it; your copy is gitignored.
cp infra/azure/swa/main.parameters.example.json infra/azure/swa/main.parameters.json
$EDITOR infra/azure/swa/main.parameters.json        # githubRepository: OWNER/elevator-sim

# 3. What-if first. Read it. This is the only preview you get.
az deployment group what-if \
  --resource-group elevator-sim-viz \
  --template-file infra/azure/swa/main.bicep \
  --parameters @infra/azure/swa/main.parameters.json

# 4. Deploy.
az deployment group create \
  --resource-group elevator-sim-viz \
  --template-file infra/azure/swa/main.bicep \
  --parameters @infra/azure/swa/main.parameters.json
```

**Region.** Static Web Apps exists in a short list of control-plane regions, so `location` is
`@allowed`-constrained in the template rather than free text — an unlisted region fails the
deployment instead of falling back to something. Content is served from the global edge either way,
so this is about where the resource lives, not about reader latency.

### Then arm the workflow

Every value below is an output of the deployment. **None of them is a secret** — a client id, a
tenant id and a subscription id are identifiers, worthless without the federated trust relationship
that names this repository and this branch. They are repository *variables* rather than secrets
precisely so that a reader of a failed run can see which identity it tried to be.

```sh
RG=elevator-sim-viz
out() { az deployment group show -g "$RG" -n main --query "properties.outputs.$1.value" -o tsv; }

gh variable set AZURE_CLIENT_ID       --body "$(out deployClientId)"
gh variable set AZURE_TENANT_ID       --body "$(out tenantId)"
gh variable set AZURE_SUBSCRIPTION_ID --body "$(out subscriptionId)"
gh variable set AZURE_RESOURCE_GROUP  --body "$RG"

# Set LAST. This is the arming switch — the other four do nothing on their own.
gh variable set AZURE_SWA_NAME        --body "$(out staticWebAppName)"

echo "site: $(out defaultHostname)"
```

Disarm — instantly, and this is also the rollback:

```sh
gh variable delete AZURE_SWA_NAME
```

The next run builds the site, checks it, uploads the artifact, and deploys nothing. The already-
deployed site stays up and stops receiving updates; nothing 404s and no check goes red.

---

## 4. What gets deployed

`npm run build:web` → `packages/viz/dist-web/`:

| Path | Where it comes from |
|---|---|
| `index.html`, `assets/*.js` | Vite. Content-hashed, cached immutably for a year. |
| `elevator-specs.json`, `traffic-profiles.json`, `dispatcher-profiles.json`, `campaign.json`, `scenario-goals.json`, `buildings/` | `publicDir` copies `data/` wholesale. The deployed site reads the same reference data the repository holds. |
| `__buildings.json` | **Generated** — see below. |
| `staticwebapp.config.json` | Copied from `packages/viz/`. Routing and headers travel with the artifact rather than living in the portal. |

### The generated manifest, and the bug that was there to find

`dev/data.ts` boots by fetching four documents. Three are files. The fourth, `/__buildings.json`,
is the list of `data/buildings/*.json` — HTTP has no directory listing — and **it was produced by a
`vite dev` middleware and by nothing else**.

That was correct while the package had no production build, and wrong the instant it had one:
`vite build` copies all five buildings into the output and then the viewer asks for the manifest
tying them together, gets the SPA fallback, and dies in `fetchJson` with *"did not parse as JSON"*.
Every asset present, page blank, no failing status code anywhere.

This is the repository's standing defect — a behaviour with no non-test caller on the shipped path
— wearing hosting configuration as a hat. The fix is not "also emit it in the build"; it is that
the manifest has **one** implementation, `packages/viz/buildingsManifest.mjs`, which owns both of
its producers: `buildingsManifestPlugin` (dev middleware) and `emitStaticDataPlugin` (build
emitter). `vite.config.ts` registers them and formats nothing itself.

`packages/viz/src/dev/buildingsManifest.test.ts` is the guard. It **invokes both hooks and compares
their output** rather than asserting that they share a helper, and it checks registration by
reading `vite.config.ts` as *text*.

That last part is not fussiness. The first draft had the test `import()` the config to inspect its
plugin array, and `tsc -b` refused it — TS6059 *"not under rootDir"* and TS6307 *"not listed within
the file list"* — because importing the config compiles it into the package, which is exactly the
property the config's docstring claims it does not have. **A test may not drag its subject into a
compilation by the act of testing it.** So the plugins moved into an importable module, and the
config is read the way this repository already reads config it cannot import: `elementMap.test.ts`
against `index.html`, `infra/checks/workflowMatrix.mjs` against `ci.yml`.

Verified by mutation — four independent ways of breaking this, each caught (§ 9).

### Hosting rules

`staticwebapp.config.json` sets a SPA fallback with `/assets/*`, `/buildings/*`, `/*.json` and
`/*.md` **excluded** — an unexcluded fallback answers every data fetch with HTML and a 200, which
is the exact failure above. It also sets `Cache-Control: immutable` on hashed assets and
`no-cache` on the unhashed JSON (so adding a building is visible on the next load, not after a
cache expiry), and a content security policy of `default-src 'self'` with `'unsafe-inline'` for
styles only — the page has one inline `<style>` block and no inline script.

`worker-src` is `'self'` with **no `blob:`**. It was drafted with `blob:` as a hedge; driving the
built site in Chromium showed the worker loading from a same-origin file URL with no violation, so
the hedge was removed. Measured, then tightened.

---

## 5. The deployment path

### Authentication: no secret in this repository

`azure/login@v2` exchanges GitHub's OIDC token for an Azure one against a **federated identity
credential on a user-assigned managed identity**. There is no client secret in existence, so there
is none to leak, rotate, or forget to rotate.

Two credentials are provisioned, both pinned to this repository:

| Subject | Covers |
|---|---|
| `repo:OWNER/elevator-sim:ref:refs/heads/main` | pushes to the production branch |
| `repo:OWNER/elevator-sim:pull_request` | pull request previews |

A token from another branch or another repository does not match the subject and is refused at
token exchange, before any Azure permission is consulted.

**Why a managed identity rather than an app registration.** Both work. The app registration is the
more commonly documented one and is not what ships, because creating it is a Microsoft Graph call
(`az ad app create`) that cannot be expressed in a template — half the provisioning would then live
in the Bicep and half in a shell command in this file, and the half in this file is the half that
drifts.

### The deployment token, which is the awkward part

`Azure/static-web-apps-deploy@v1` **cannot use a federated credential**
([Azure/static-web-apps#1304](https://github.com/Azure/static-web-apps/issues/1304), open since
2023). It takes a deployment token and nothing else. The default answer is to paste that token into
a repository secret, where it sits, long-lived, until someone remembers it.

Instead the workflow **fetches the token at run time** with the OIDC identity — `az staticwebapp
secrets list` — masks it with `::add-mask::` before writing it anywhere, and hands it to the action
through a masked step output. It exists for the length of one job.

The identity's entire permission is that one read. Not `Website Contributor`, which would also
carry write access to every App Service resource in scope; a **custom role with exactly
`Microsoft.Web/staticSites/read` and `Microsoft.Web/staticSites/listSecrets/action`, scoped to this
one site.** If the identity is ever abused from inside a workflow run, the whole of what it can do
is read the deployment token — which is what the attacker running in that job would already have.

**The residual exposure, stated rather than implied.** For the seconds it is in flight the token is
in the job's memory and in the action's container environment, and anything executing in that job
can read it. That is a smaller window than a stored secret and it is not zero. The issue thread's
own criticism of this pattern — that it "pipes secret tokens into `GITHUB_ENV`" — is answered by
using a masked step output and never `GITHUB_ENV`, which narrows it and does not close it. The
control that actually matters is § 6.

### `skip_app_build: true`, which is not a detail

The site is built in a separate job from a lockfile install on pinned Node, checked for
completeness, and uploaded. Left to itself the action runs **its own Oryx build** inside its own
container with its own toolchain — a second build of the same commit that nothing in this
repository controls or has ever tested. `skip_app_build` makes the artifact that was checked the
artifact that ships.

### Preview environments

Every pull request from a branch of this repository gets its own URL, and the action comments it on
the pull request. `close-preview` tears it down when the pull request closes — which fires on merge
too. Without that job the fourth open pull request fails with a quota error naming neither the
three environments holding the slots nor the fact that they belong to merged work.

---

## 6. Fork pull requests, and public repositories

The `deploy` job requires `github.event.pull_request.head.repo.full_name == github.repository`, so
**a pull request from a fork builds and is never deployed.**

That is not belt-and-braces. GitHub does not issue an OIDC token to a workflow triggered by a
fork's `pull_request` event, so the job could not authenticate; without the condition every
external contribution would carry a permanently red check that means nothing. Excluding it is what
keeps a red leg honest — the same reasoning `infra/README.md` § 6 applies to Spot evictions.

If fork previews are ever actually wanted, the mechanism is `pull_request_target` plus a manual
approval gate, and it deserves its own decision record: `pull_request_target` runs the *base*
repository's workflow with write-capable context against the *fork's* code, which is the
configuration most self-hosted CI compromises start from. Do not add it casually.

If this repository is public, also set **Settings → Actions → General → Fork pull request workflows
from outside collaborators** to **"Require approval for all external contributors"**. It is a
repository setting, nothing in this directory can assert you have set it, and it is the control that
matters.

---

## 7. Custom domain

Free includes two, with a managed certificate:

```sh
az staticwebapp hostname set -n elevator-sim-viz -g elevator-sim-viz \
  --hostname sim.example.com
```

Then add the CNAME it prints. An apex domain needs the `dns-txt-token` validation method rather
than a CNAME. Certificate issuance and renewal are managed; there is nothing to schedule.

---

## 8. Tear down

```sh
gh variable delete AZURE_SWA_NAME          # stop deploying first
az group delete --name elevator-sim-viz --yes --no-wait
```

Deleting the group removes the site, the identity and the federated credentials together. Unlike
the CI-runner lane there is no soft-deleted Key Vault to purge and no PAT to revoke, because
neither exists here. Order matters only in that deleting the site while the variable is still set
gives you a red deploy job on the next push — not a queue of jobs waiting 24 hours, which is the
compute lane's version of this mistake.

---

## 9. What has actually been verified, and what has not

The most important section, and it is deliberately specific about which claims are runs and which
are predictions.

**Run, on this tree:**

| Claim | Evidence |
|---|---|
| The site builds | `npm run build:web` → 1.6 MB, 5 buildings, exit 0 |
| The artifact is complete | The `build` job's check, executed locally: all 8 required files non-empty, `data/` and the manifest agree at 5 |
| **It boots** | Served under its own `staticwebapp.config.json` (CSP, fallback and all) and driven in Chromium: building name resolved to *Garden Apartments*, all five buildings in the selector, a simulation ran, **zero console errors, zero page errors, zero fallbacks, zero 404s** |
| The Web Worker loads under the CSP | `Run batch` in the Compare drawer spawned `assets/batchWorker-*.js`, no CSP violation — which is what allowed `worker-src` to be tightened from `'self' blob:` to `'self'` |
| The manifest guard bites | Four mutants, each caught: emitter unregistered in `vite.config.ts` → 1 fail; build path pretty-printed → 2; manifest silently drops a building → 1; SPA fallback exclusion removed → 1. Clean tree: 6 pass |
| The tree still typechecks | `tsc -b`, exit 0 — and it is what rejected the first draft of the test, § 4 |
| The template compiles | `bicep build` v0.46.1, exit 0, no warnings |
| The workflow parses, and breaks nothing | `yaml.safe_load` on both workflows; `node --test 'infra/checks/*.test.mjs'` 17/17 — the compute lane's guard reads `ci.yml` only and is untouched by a new file |
| The suite is unaffected | § 10 |

**Not run — no Azure resource has been created:**

1. **Nothing has been deployed.** No resource group, no Static Web App, no identity, no federated
   credential, no workflow run against a real subscription. Everything in § 3, § 5 and § 7 is a
   prediction from documented behaviour. **This is the most important limitation on the page**, and
   it is the same one `infra/README.md` § 8.1 opens with, for the same reason.
2. **The federated credential has never been exchanged.** The subject strings are constructed from
   GitHub's documented claim format; a typo in one surfaces as `AADSTS70021` on the first armed run
   and nothing here would have caught it.
3. **The custom role has never been assigned.** In particular, whether `listSecrets` alone suffices
   for `az staticwebapp secrets list` is read from the ARM action list, not measured. If the first
   armed run fails authorization, that is the line to widen — and widening it is a decision to
   record, not a quiet edit.
4. **The cost figures are list-price arithmetic**, and the Free plan's $0 is the only one of them
   that cannot be wrong by a factor.
5. **The 283.3 KiB cold load is `gzip -9` on this machine**, not what Azure's edge negotiates. Real
   transfer will differ — Brotli would be smaller, a warm cache much smaller — so treat it as the
   right order of magnitude for § 1's egress arithmetic and not as a measurement of the CDN.
6. **`chunkSizeWarningLimit` is raised to 900 kB.** The main chunk is ~780 kB raw / ~244 kB
   gzipped, which is the simulator plus the schema-generated editors in one page that has no
   routes. Raised deliberately so a real regression still has a threshold to cross; it is not
   code-splitting, and code-splitting is the actual fix if that number grows.

---

## 10. Effect on the existing suite

**⚠ NOT YET MEASURED — a full `npm test` had not completed when this landed.**

Stated that way on purpose. An earlier draft of this section carried a before/after test count that
was written from arithmetic rather than from a run, which is the defect
[`CLAUDE.md` § Statistical discipline](../CLAUDE.md) and the three stale published figures in this
repository's history are about. A number with no run behind it is worse than no number, because it
reads exactly like one that has been checked. So it is removed rather than rounded.

What **is** measured, and by what:

- `packages/viz/src/dev/buildingsManifest.test.ts` — **6 tests, all passing**, and each of the four
  mutants in § 9 fails it.
- `npm run typecheck` (`tsc -b`) — exit 0 over the whole workspace, which every existing test file
  is compiled by.
- `node --test 'infra/checks/*.test.mjs'` — **17/17**, unchanged.
- A full `tsc -b --clean && tsc -b` emits no stray files, confirming `vite.config.ts` is still
  outside the TypeScript project after this change.

What is expected but unconfirmed: that no existing test changes. The reasoning is that this work
adds files and touches no runtime source — the only edited runtime-adjacent file is
`vite.config.ts`, which nothing under `packages/*/src` imports. In particular
`packages/viz/src/deadCode.test.ts` (the § D192 audit deriving 19 directories from disk) should be
untouched, because `buildingsManifest.mjs` sits beside `vite.config.ts` **outside `src/`** for the
reason that file gives — no directory was added under `viz/src`, only a file in the existing
`src/dev/`.

**Replace this section with the run.** `npm test`, both counts, from one invocation.

---

## Sources

- Azure Static Web Apps hosting plans and quotas (Free plan: 100 GB/month egress, 250 MB per app,
  2 custom domains, 3 pre-production environments, no SLA, site not served past quota) —
  <https://learn.microsoft.com/azure/static-web-apps/plans>,
  <https://learn.microsoft.com/azure/static-web-apps/quotas>
- Static Web Apps pricing — <https://azure.microsoft.com/pricing/details/app-service/static/>
- Federated credentials unsupported by the deploy action —
  <https://github.com/Azure/static-web-apps/issues/1304>
- GitHub OIDC to Azure —
  <https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect>
- `az staticwebapp secrets list` —
  <https://learn.microsoft.com/cli/azure/staticwebapp/secrets>
