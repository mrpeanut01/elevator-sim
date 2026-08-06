# Deploying the simulator to Azure

One Container App serving the viewer and the API from a single origin, a PostgreSQL flexible server
behind it, and Communication Services for the one mail this product sends.

> **There is now a second, optional lane.** The page can be served from a CDN instead of from this
> container, which removes a **32.2 s** cold first load — see
> [`docs/16-static-site-deployment.md`](../docs/16-static-site-deployment.md) and
> `infra/azure/swa/`. **It is not switched on**, nothing in it has ever been deployed, and this
> document describes the deployment that exists. The one thing it adds here is the `viewerOrigin`
> parameter in § 3.5, which is empty by default and changes nothing when it is.

---

## 0. Read this first: what has and has not been verified

**Deployed 2026-08-05** to `Rene Family` / `elevator-sim` / **eastus2**, serving at
`https://elevsim-app.salmonstone-4576d6f7.eastus2.azurecontainerapps.io`.

That sentence replaces an earlier one saying this had never been deployed. It is worth keeping the
distinction sharp, because the last `infra/` in this repository published a figure that did not
reproduce from its own template, and what let that survive review was that its untested parts read
exactly like its tested ones. **One thing on this page is still in that category and it is named in
§ 0.2.**

### 0.1 What the first deployment cost, in findings

Four failures, none of which the `az bicep build` that "compiled clean" could have caught. They are
recorded because each one is a class, not an incident:

| Failure | What it actually was |
|---|---|
| `RoleDefinitionDoesNotExist` | The Communication and Email Service Owner role id was wrong in its last segment. A built-in role id is a fact to look up — both are now confirmed with `az role definition list`, and the command sits in the comment beside each |
| `ParameterOutOfRange` on `Version`, allowed list `[]` | **PostgreSQL flexible server is restricted in East US on this subscription.** An empty list of allowed versions is what a blocked region looks like; the capability API says so outright. Hence `eastus2` |
| `did not issue a challenge` from `az acr login` | The registry name was derived from the subscription id, so tearing the group down and redeploying recreated the *same* name. ARM said `Succeeded`, DNS resolved, and the data plane answered `GET /v2/` with a bare 404 instead of a 401 challenge. Registry names are now discovered, or created fresh and random |
| `ResourceNotFound` on resources the template creates | ARM racing its own creates on a first pass. The resources existed on completion and a re-run converged — which is why the script is safe to re-run and says so |

### 0.2 Still not verified

**No mail has ever been sent.** `AcsMailer` is unit-tested for *selection* — which credential it
picks and what it refuses — and has never reached Azure. `linkedDomains` on the Communication
Service is the line most likely to be wrong, and its failure mode is a deployment that succeeds and
a send that fails at run time. Registering an account is the test; § 4 has it.

Also unverified: **scaling past one replica**. The store is PostgreSQL so concurrent replicas are
sound in principle, but nothing has run two.

**And the whole of the static-hosting lane.** `viewerOrigin` (§ 3.5) has never been set on a real
deployment, no Static Web App has been created, and **no page has ever been served cross-origin** —
so the CORS round trip, the preflight and a real sign-in against two origins are unit-tested and
have never met a browser. `docs/16-static-site-deployment.md` § 9 itemises that lane's verified and
unverified halves separately; it is longer than this paragraph because the lane is entirely
unrun.

**Verified, by running it:**

| Claim | How |
|---|---|
| The image builds | `docker build` on `node:26-slim`, 488 MB |
| The container boots in production mode | `NODE_ENV=production` against a real PostgreSQL 17 container |
| The production `pg` driver works | It created all five tables and wrote a challenge row. The test suite uses PGlite, so this is the only thing that has exercised `PgSql` |
| The dialect port is right | `bigint` for every `_ms` column — the row written holds `1785715200000`, which `integer` could not — `double precision` for metrics, `boolean` for `confirmed`, and the unique index on `lower(display_name)` |
| The viewer builds and runs | `npm run build:web`, served by the server, driven in a browser: all 8 buildings and 5 traffic profiles load, and a 30-minute shift simulates |
| Viewer and API share one origin | `/` serves HTML, `/api/*` serves JSON, `/no/such/page` is a 404 and **not** a rewrite to `index.html` |
| The template compiles | `az bicep build`, clean, no warnings — and § 0.1 is the list of things that passed this and still failed |
| **The deployed app serves** | Live over TLS: `/` returns HTML, `/api/*` JSON, `http://` 301s to `https://`, `/no/such/page` is a 404. The viewer renders and its console is clean |
| **Azure PostgreSQL is reached and written** | `/api/challenges` issues a challenge, which is an insert followed by a read, against the flexible server |
| **Nothing crosses a region** | Registry, identity, logs, environment, app and database are all `eastus2`. Communication Services is `global`, which is inherent to it and not on any request path |

**The cost figures in § 5 remain derived from published list prices, not from a bill.**

---

## 1. What gets deployed

| Resource | Why |
|---|---|
| Container App, 0.5 vCPU / 1 GiB, **scale-to-zero** | The viewer and the API in one process, one origin. `minReplicas: 0` is what makes it cheap |
| Container Apps environment + Log Analytics | Where the app runs, and where its logs go |
| PostgreSQL flexible server, `Standard_B1ms`, 32 GiB | Accounts and leaderboard entries. **Cannot scale to zero** — see § 5 |
| Communication Services + Email + `AzureManagedDomain` | Confirmation mail, from the free `azurecomm.net` subdomain |
| User-assigned managed identity | Sends mail with **no credential**: it holds the *Communication and Email Service Owner* role, and revocation is deleting the assignment |

**What is not here.** No container registry: the app cannot deploy until an image exists to pull, so
the registry has to be created and filled before this template runs. The *grant* is here — the
template assigns `AcrPull` on it to the app's identity. No custom domain either: connecting one to a
Communication Service is a DNS-verified manual step a template cannot perform.

---

## 2. Prerequisites

- An Azure subscription you can create resource groups in, and `Owner` or `User Access
  Administrator` on it (the template creates a role assignment).
- `az` ≥ 2.60 with the Bicep CLI (`az bicep install`).
- Somewhere to push a container image.

---

## 3. Deploy

```sh
az group create --name elevator-sim --location eastus
```

Build and push the image. Any registry works; ACR is the one that needs no extra credential
handling, because the identity can pull with `AcrPull`:

```sh
az acr create --resource-group elevator-sim --name elevsimacr --sku Basic --admin-enabled false
az acr login --name elevsimacr
docker build -t elevsimacr.azurecr.io/elevator-sim:$(git rev-parse --short HEAD) .
docker push elevsimacr.azurecr.io/elevator-sim:$(git rev-parse --short HEAD)
```

Then the parameters. **The two secrets are passed on the command line rather than written into a
file**, so neither ever rests on disk:

```sh
cp infra/azure/main.parameters.example.json infra/azure/main.parameters.json
$EDITOR infra/azure/main.parameters.json     # containerImage, containerRegistryServer
```

**What-if first. Read it.** This is the only preview there is, and given § 0 it is the closest thing
to evidence this template has:

```sh
az deployment group what-if \
  --resource-group elevator-sim \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/main.parameters.json \
  --parameters appSecret="$(openssl rand -base64 48)" \
               databaseAdminPassword="$(openssl rand -base64 24)"
```

Deploy. Generate each secret **once** and keep it — regenerating `appSecret` on a later deployment
invalidates every confirmation link already in flight:

```sh
APP_SECRET="$(openssl rand -base64 48)"
DB_PASSWORD="$(openssl rand -base64 24)"

az deployment group create \
  --resource-group elevator-sim \
  --name app \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/main.parameters.json \
  --parameters appSecret="$APP_SECRET" databaseAdminPassword="$DB_PASSWORD"
```

**The registry grant is part of the template, not a step here.** Passing `containerRegistryServer`
makes it assign `AcrPull` on that registry to the app's identity, and the Container App explicitly
depends on the assignment — so the app is never created before it can pull. The registry has to be
in this resource group for that to resolve.

### 3.5 `viewerOrigin`, and what it moves

Empty is the default and the shipped state: the container serves the page and the API from one
origin, sign-in links point at this app, and `ELEVATOR_SIM_ALLOW_ORIGIN` is empty, meaning **no page
may call this API cross-origin**. That is what has been deployed and what § 0 describes.

Set it — to a static host's origin, no trailing slash — and two environment variables move together:

| | Becomes | Because |
|---|---|---|
| `ELEVATOR_SIM_ORIGIN` | the site's origin | A sign-in link resolves to a *page* (§ D241 § 4), and the page is now over there |
| `ELEVATOR_SIM_ALLOW_ORIGIN` | the site's origin | The page's `fetch` is now cross-origin |

One parameter for both, so they cannot drift — and `main.ts` refuses to start if they somehow do.
**`*` is refused outright**: the API answers session-bearing requests and a verification is a whole
simulation, so a wildcard publishes both to every page on the web.

A **third** value has to agree and does not live here: the static site must be *built* with
`ELEVATOR_SIM_API_ORIGIN` set to this app's `apiOrigin` output. It is a GitHub variable rather than
an ARM parameter, and `docs/16-static-site-deployment.md` § 3 is the order all three are set in — an
order, because the site's hostname does not exist until its own template has run.

**None of this has been deployed.** See § 0.2.

---

## 4. Verify

```sh
az deployment group show -g elevator-sim -n app --query properties.outputs.appUrl.value -o tsv
```

Open it. The menu should render, and Free play should list eight buildings — if the buildings are
missing, `__buildings.json` did not make it into the image, which means the Vite build was skipped.

```sh
# The API answers, and the database is reachable: this route reads and writes.
curl -s "$(az deployment group show -g elevator-sim -n app --query properties.outputs.appUrl.value -o tsv)/api/challenges" | head -c 200

# Logs. The startup line says "viewer and API" when the bundle loaded, and "API" when it did not.
az containerapp logs show -g elevator-sim -n elevsim-app --tail 50
```

**Then test the one path nothing has ever exercised**: register an account and confirm that mail
arrives. Per § 0 item 2, this is the most likely thing to be broken, and the failure surfaces as a
registration that returns 500 with `Azure Communication Services did not accept the message` in the
logs.

---

## 5. Cost

> Derived from Azure's published pay-as-you-go list prices for **East US**, at the **shipped
> parameter defaults**. Not a quote. Verify against the Azure pricing calculator for your
> subscription and agreement.

**The app scales to zero. The database does not, and that is the whole bill.** Saying only the
first half is precisely the overstatement that got the previous `infra/` withdrawn.

| Line item | Rate | At rest |
|---|---|---|
| PostgreSQL `Standard_B1ms`, 730 h | ≈ $0.018 / h | **≈ $13.14 / month** |
| PostgreSQL storage, 32 GiB | ≈ $0.115 / GiB | **≈ $3.68 / month** |
| Container App at `minReplicas: 0` | consumption | **$0** |
| Log Analytics | first 5 GiB free | ≈ $0 |
| ACS email | $0.25 / 1 000 messages | ≈ $0 |

**Floor: ≈ $17 / month**, and it is all database. Add ≈ $5 for an ACR Basic registry if you use one.

### Active compute, and why it is usually free

Container Apps bills $0.000024 per vCPU-second and $0.000003 per GiB-second, and the free grant is
180 000 vCPU-seconds and 360 000 GiB-seconds a month. At the shipped `0.5` vCPU and `1` GiB, one
replica-hour costs 1 800 vCPU-seconds and 3 600 GiB-seconds — so **the first ~100 replica-hours each
month are free**, and a simulator nobody is using bills nothing above the database floor.

### The ceiling, derived from the parameters

`maxReplicas` is the only thing bounding compute, exactly as `runnerCount` was in the withdrawn
template — the difference is that here the floor really is zero:

```
compute ceiling ≈ maxReplicas × 730 h × (1800 × $0.000024 + 3600 × $0.000003) − free grant
                ≈ maxReplicas × 730 × $0.0540 − $5.40
total ceiling   ≈ compute ceiling + $16.82   (the database floor above)
```

| Configuration | Absolute ceiling / month |
|---|---|
| **`maxReplicas: 2` (the default), both pinned busy every hour** | **≈ $90** |
| `maxReplicas: 1` | ≈ $51 |
| `maxReplicas: 10` | ≈ $407 |

**Declared ceiling: $90 / month at the shipped defaults.** Expected: **≈ $17**, because reaching the
ceiling means two replicas saturated continuously for a month.

That expected figure **reproduces from this template**: `minReplicas` is `0` in `main.bicep`, so the
app bills only while serving, and the $17 is the database — which is a resource in the same file at
a SKU named in the same file. That is the criterion `docs/15` § 4 says the compute-offload contract
should have had and did not.

### There is no budget alert here, deliberately

An Azure budget notifies and does not cap, and the previous template's § 6 said so correctly in one
paragraph and then contradicted it in the next by presenting the alert as a ceiling. `maxReplicas`
and the database SKU are the ceiling. Add a budget if you want the email — just do not mistake it
for a limit.

---

## 6. Tear it down

```sh
az group delete --name elevator-sim --yes --no-wait
```

One group, one command, and the role assignment goes with it. Nothing outside the group is touched.

---

## 7. Known limitations

Stated rather than discovered later. § 0's *"none of this has been deployed"* is the first one and
is not repeated here.

1. **The database firewall permits all Azure services.** `allow-azure-services` is the
   `0.0.0.0`-`0.0.0.0` rule, which means any Azure-hosted resource — including in other
   subscriptions — can *reach* the server, leaving the password as the only control. Container Apps
   egress from a shared address pool, so a narrower rule is not available without VNet integration
   and a private endpoint. That is the right fix, and it roughly doubles the standing cost.
2. **The database password is a template parameter**, so it appears in the deployment history.
   `az deployment group delete` removes that record; Key Vault references are the better answer and
   are not what this ships.
3. **No custom domain and no rate limiting at the edge.** The app's own per-account submission
   cooldown is in memory (`chargeCooldown`), so it bounds one replica rather than the deployment —
   at `maxReplicas: 2` a determined client gets two.
4. **No backup of anything but the database**, whose retention is the 7-day service floor.
5. **`AzureManagedDomain` is rate-limited** and its `azurecomm.net` sender is likelier to be
   filtered than a verified custom domain. It is the right choice for proving the flow and the wrong
   one for real users.
6. **Scaling past one replica has never been tested.** The store is PostgreSQL so concurrent
   replicas are sound in principle, but nothing has run two.
7. **No CI deploys this.** Deployment is `az` from your own machine with `az login`, so there is no
   stored credential in this repository because there is no automation to hold one. When that
   changes, the right credential is a federated one on a Microsoft Entra app
   (`subject: repo:OWNER/elevator-sim:ref:refs/heads/main`) rather than a stored secret — add it
   when you automate the deployment, not before. *(The **viewer's** deployment is automated:
   `.github/workflows/deploy-viz.yml` federates into a user-assigned managed identity and stores no
   secret. It is inert until armed, and it deploys the page only — never this app or this
   database.)*
8. **A cold first page load takes 32.2 seconds**, measured on the live deployment against 0.13 s
   warm. `minReplicas: 0` is what makes this deployment cheap and it is also what makes the first
   visitor wait, because `serve.ts` serves the page out of the container that is asleep.
   `GET /api/wake` does not help: the page is the thing being waited on. Two fixes, and neither is
   free of a trade — `minReplicas: 1` costs roughly $34/month, and moving the page to a CDN costs
   nothing and splits the origin (`docs/16-static-site-deployment.md` § 2).
