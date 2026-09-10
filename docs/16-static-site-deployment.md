# Hosting the viewer on a CDN, and the three values that then have to agree

The page moves to Azure Static Web Apps. The API stays on the Container App. That split is the whole
of this document, and § 2 is the honest account of what it costs.

> **Naming.** There is already a `docs/16-change-scope-contract.md`. Two documents share the number
> because two lanes reached it concurrently; the filenames differ and neither reference is
> ambiguous. Not tidied here, because renumbering a document breaks every reference to it in
> `DECISIONS.md` for the sake of a filename.

---

## 0. Read this first: this is armed, and running it corrected two things reading it did not

**This section said the opposite until 2026-08-08, and it was the accurate statement of the day it
was written.** It read *"No Azure resource has been created by this lane… no page has ever been
served from a CDN."* That is now false in every clause, and a refusal that has gone stale is worse
than a figure that has, because it tells the reader not to touch a control that is live (§ D227).

What is true now:

| | |
|---|---|
| Static Web App | `elevator-sim-viz`, Free SKU, resource group `elevator-sim-viz` |
| Site | `https://yellow-glacier-0ff81230f.7.azurestaticapps.net` |
| API | unchanged, `https://elevsim-app.salmonstone-4576d6f7.eastus2.azurecontainerapps.io` |
| The app's `viewerOrigin` | set to the site; `ELEVATOR_SIM_ORIGIN` and `ELEVATOR_SIM_ALLOW_ORIGIN` both name it |
| The six repository variables | set, `AZURE_SWA_NAME` last |
| Production deploys | from `main` only, enforced by the `viz-production` environment's branch policy |
| The API's own page requests | **302 to the site** since [§ D339](../DECISIONS.md) — see below |

**The split left a second copy of the page on the internet, and it served the previous product for
five days.** Arming this moved the page to the CDN; it did not stop the Container App serving one.
`serve.ts` serves everything outside `/api/` from the bundle baked into the image, that image is
deployed by hand, and nothing rebuilds it on a push to `main` — so the API's hostname answered `GET /`
with a working viewer from commit `53be9c8`, 238 commits and four days behind, while the CDN served
the current one. Two hostnames, two `200`s, two different products, and no status code anywhere that
distinguishes them. **It was found by a player**, who reported the old main menu and asked how to
reach the new one.

The fix is not a rebuild — that fixes today and reintroduces it on the next wave, because the cause
is not that the bundle was old but that a second copy existed at all. In a split deployment the API
now refuses to be a page: every non-`/api/` `GET` is a 302 to the site, carrying path and query, and
the bundle in the image is never consulted. It is **derived** from the two origin variables this
document's § 3 already requires, so it is not a fourth value that can disagree with the other three.
[§ D339](../DECISIONS.md) has the whole account, including the loop guard, why it is a 302 rather
than a 301, and the unauthenticated request hang found one line above it.

**Arming it found two defects that reading it had not**, both in the provisioning path and both
fatal: two federated credentials cannot be written concurrently under one managed identity, and the
credential subjects named a ref where GitHub sends an environment — so *neither* credential could
ever have matched, and a push to `main` would have failed exactly as the dispatch that found it did.
[§ D308](../DECISIONS.md) is the full account. § 9 below is the itemised list of what is now
verified by running it and what is still only reasoned about, in the voice `infra/README.md` § 0
already uses — because that section exists precisely because a previous `infra/` in this repository
published a figure that did not reproduce from its own template, and what let it survive review was
that its untested parts read exactly like its tested ones. That is the sentence this lane went on to
demonstrate about itself.

The switch has not moved. Every deploying job in `.github/workflows/deploy-viz.yml` is still guarded
by `vars.AZURE_SWA_NAME != ''`; what changed is that the variable is now set. Unarmed, the workflow
builds the site on every push and pull request, asserts the artifact, and deploys nothing. Arming is
`./infra/azure/swa/provision.sh`; **disarming is `gh variable delete AZURE_SWA_NAME`** — instant, and
it puts the workflow back to building only.

**Disarming is not a rollback, and this paragraph called it one until § 11 was written.** It stops
*future* deploys; the page a player loads is untouched by it and stays untouched. Worse, it makes a
revert impossible rather than easier: `jobs.deploy` is gated on `vars.AZURE_SWA_NAME != ''`, so with
the variable deleted the only job that can write to the site never runs. **§ 11 is the procedure that
actually puts a previous build back on the live site**, and it is what GitHub issue #355's three
dependent acceptance criteria mean by *rollback*.

Disarming also does **not** put the API back to serving its own page: `ELEVATOR_SIM_ALLOW_ORIGIN`
stays set, and the app keeps mailing sign-in links to the static site. § 7 is the command for that
half — and note that § 7 is **tear down**, where the site stops existing, not a revert, where it
keeps existing and stays the right destination (§ 11.4).

---

## 1. The problem, measured

`packages/server/src/http/serve.ts` serves everything outside `/api/` from the built bundle **in the
same container**, and `infra/azure/main.bicep` runs that container at `minReplicas: 0`.

Measured against the live deployment:

| | Time |
|---|---|
| Cold first page load (container asleep) | **32.2 s** |
| Warm page load | **0.13 s** |
| Cold `GET /api/challenges`, measured separately for § D241 | 28.7 s |

A tester opening the link cold gets around half a minute of blank browser **before any app exists to
apologise**. `GET /api/wake` — already merged — fixes the *API*'s cold start, and it cannot fix this
one, because the page is the thing being waited on: nothing can call `/api/wake` until the page that
would call it has arrived.

The bundle is a few hundred kilobytes of static files. A CDN serves them while the container is
still asleep, and the container then wakes up in the background of a page the player can already
read.

---

## 2. The platform decision, and the trade it actually is

Three options were weighed. All three fix the 32 seconds; they differ in what they cost and in what
architectural property they keep.

| Option | Δ standing cost | What it keeps | What it costs |
|---|---|---|---|
| **Static Web Apps Free + cross-origin API** ← **chosen** | **£0** | Scale-to-zero, unchanged | Two extra deploy parameters, and same-origin stops being true |
| Static Web Apps **Standard** + linked backend | **≈ £9 / month** | One browser-visible origin; § D243's reasoning intact | A standing bill on a deployment designed to bill nothing at rest, and a proxy in front of a 32 s cold start |
| `minReplicas: 1` on the existing app | **≈ £26 / month** (≈ $34) | Everything — not one line of code changes | The most expensive of the three, and the app stops being free at rest |

### Why the free path, and where the brief's framing was too pessimistic

The case for Standard is real and it is § D243's own: an absolute origin *"goes stale the moment a
custom domain is put in front"*, and CORS is *"a question with a wrong answer that looks exactly like
a working one"*. Neither of those stops being true here. What decided it is that **two of the four
moving parts move under Standard as well**, so the free path's marginal cost is smaller than it
first looks:

1. **The tag has to be declared at build time either way.** Under Standard the page is still served
   by the CDN, not by `loadStaticBundle` — so a Standard deployment with no build-time tag
   dead-ends every social surface exactly as a Free one does. What Standard changes is the tag's
   *value* (`"/"` instead of an absolute origin), not whether it has to exist.
2. **The magic-link origin moves either way.** `ELEVATOR_SIM_ORIGIN` is where the mailed link points
   (§ D241 § 4), and under both options the page is at the static host. Both options must move it.

That leaves two genuine differences: an absolute origin instead of `"/"`, and one CORS value. Both
are set from **one** deploy parameter, and the server refuses to boot if they disagree (§ 3). Against
that, Standard buys a £9/month standing charge on a deployment whose entire design principle is that
the app bills nothing at rest — the database's ≈ $17 floor is already the whole bill, and this would
add roughly half again.

There is also a point **against** Standard that is not about money, and it is stated as reasoning
rather than as measurement because nothing here has run it: a linked backend puts an Azure proxy in
front of a request that already takes 32 seconds cold. Static Web Apps documents a response timeout
on proxied backend requests, and a cold start measured at 32.2 s is uncomfortably close to it. Under
the cross-origin design the browser waits as long as it likes and nothing in between can give up
first. **This has not been tested against a real linked backend and would need to be before Standard
were adopted.**

### What is *not* claimed

That cross-origin is as good a property as same-origin. It is not, and § D243's objection is not
dodged — it is *answered with configuration* (§ 3) and *checked by tests* (§ 4), which is a weaker
guarantee than not having the problem. The specific thing that is lost: with one origin, a
misconfiguration is impossible; with two, it is possible and made loud. Three separate mechanisms
have to fail before it is silent again.

The set of browser origins that can call the API is **the same under both options** — exactly one,
the viewer's. Under Standard that is enforced by the same-origin policy; here by an explicit
allowlist naming one origin. `*` is refused outright at boot (§ 3.4), and there is no
`Access-Control-Allow-Credentials` anywhere in this server: the session is a bearer token in an
`Authorization` header, never a cookie.

### The Free plan, and what would change the answer

Free gives 100 GB/month egress, managed TLS, 2 custom domains, 3 preview environments, and a 250 MB
app-size cap the artifact uses under 1 % of. Past quota the site stops being served rather than
billing overage — for a project viewer that is the right failure, since it cannot produce a surprise
invoice. There is no SLA.

What would move the decision to Standard: wanting private endpoints or an SLA; a custom domain
count above two; or measuring that the cross-origin preflight materially hurts a real session. The
last one is the only one that is about this lane's specific trade, and it is measurable rather than
arguable.

---

## 3. Deploy — the three values, and the order

**One value in three places, and they are set in an order because each depends on the previous
one's output.**

| # | Value | Where it lives | What it does |
|---|---|---|---|
| 1 | The **API's** origin | GitHub variable `ELEVATOR_SIM_API_ORIGIN` | Built into `index.html` as `<meta name="elevator-sim-api">`, and into the CSP's `connect-src` |
| 2 | The **site's** origin | `viewerOrigin` on `infra/azure/main.bicep` → `ELEVATOR_SIM_ORIGIN` | Where sign-in links point (§ D241 § 4) |
| 3 | The **site's** origin, again | the same `viewerOrigin` → `ELEVATOR_SIM_ALLOW_ORIGIN` | Which origins may call the API from a browser |

2 and 3 are **one parameter**, so they cannot drift; `main.ts` refuses to start if 2 is not a member
of 3, because a rule that holds for one of two values that must match is not a rule.

Since [§ D469](../DECISIONS.md), 3 may carry a second entry: the word `previews`, which admits this
same Static Web App's per-pull-request hostnames. It names no hostname, because it is expanded from
2 at boot. A pattern an operator could write is a pattern that can go stale against the site, and a
stale allowlist fails closed and looks exactly like issue #123 again.

### 3.1 The one-command form

```sh
cp infra/azure/swa/main.parameters.example.json infra/azure/swa/main.parameters.json
$EDITOR infra/azure/swa/main.parameters.json      # githubRepository = OWNER/REPO

./infra/azure/swa/provision.sh
```

It will provision the site, discover the API's origin from the Container App, then **refuse to arm**
and print the one command it cannot run itself — see § 3.3. Run that, re-run the script, and it
arms.

### 3.2 What the script does and does not do

It creates the resource group, deploys `infra/azure/swa/main.bicep`, reads back every output, sets
five identifying variables plus `ELEVATOR_SIM_API_ORIGIN`, and sets `AZURE_SWA_NAME` **last**,
because that is the switch.

It cannot set `viewerOrigin` on the app, and the reason is structural rather than an omission:
`infra/azure/main.bicep` takes `appSecret` and `databaseAdminPassword` as required `@secure()`
parameters with no defaults, so re-running it means re-supplying both. The script does not have them
and must not ask for them.

So it checks instead, against the **deployed revision** rather than against a template, and refuses
to arm until the app has been pointed at the site. Half-armed is the worst of the three states: the
site loads, the page knows where the API is, and every request is refused by CORS — which `fetch`
reports as a `TypeError`, so the client says the server is down and the reader goes looking at a
server that is fine.

**That check is still an equality, and [§ D469](../DECISIONS.md) did not change it.** `provision.sh`
compares the deployed `ELEVATOR_SIM_ALLOW_ORIGIN` against the site's origin string, and
`infra/azure/main.bicep` sets that variable to `viewerOrigin` alone, so both still describe the
one-origin form. Nothing regresses: the API accepts a one-entry allowlist exactly as it did before.
What it means is that appending `previews` to the variable would make this script refuse to arm, so
turning previews on takes an `infra/` change as well as the server one. That is deliberately not
done here, because the lane that implemented the server rule does not own `infra/` and a
provisioning path changed without being run is the kind of claim § 9 exists to keep separate.

### 3.3 The step the script prints

You kept both secrets from the first deployment (`infra/README.md` § 3 says to, because regenerating
`appSecret` invalidates every sign-in link in flight). This needs them again:

```sh
az deployment group create \
  --resource-group elevator-sim \
  --name app \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/main.parameters.json \
  --parameters viewerOrigin="https://<site>.azurestaticapps.net" \
               appSecret="$APP_SECRET" databaseAdminPassword="$DB_PASSWORD"
```

`az containerapp update --set-env-vars` would also work and is **not** what this recommends: it
edits a revision the template then owns and disagrees with, and the next template deploy silently
reverts it. Named here so the choice is deliberate rather than unnoticed.

### 3.4 What the API refuses

`main.ts` will not start if:

- `ELEVATOR_SIM_ALLOW_ORIGIN` is `*`. The API answers session-bearing requests and a verification is
  a whole simulation; a wildcard publishes both to every page on the web. It is refused rather than
  warned about, because it is the value somebody reaches for at 2 a.m. when CORS is in the way.
- `ELEVATOR_SIM_ALLOW_ORIGIN` does not contain `ELEVATOR_SIM_ORIGIN`. Membership since
  [§ D469](../DECISIONS.md), and the argument under it is unchanged: the page a sign-in link opens
  is the page that then calls this API.
- `ELEVATOR_SIM_ALLOW_ORIGIN` names an origin this deployment cannot mint. The list may hold the
  site's own origin and the entry `previews`, and nothing else. A preview hostname written out by
  hand is refused too, with a message naming the entry that replaces it.
- `ELEVATOR_SIM_ALLOW_ORIGIN` says `previews` where `ELEVATOR_SIM_ORIGIN` is not a Static Web App
  default hostname, so the entry would expand to the empty set. Permitting nothing and saying
  nothing is issue #123's own shape, so it stops instead.
- Any entry is blank, which a stray comma produces. An entry dropped for being blank is an origin
  somebody meant to permit and a refusal nobody sees.
- Either is not an *exact* origin — a trailing slash, a path, a query string, an uppercase scheme.
  `https://api.example/` and `https://api.example` are the same origin to a browser and different
  strings to the header comparison a CORS check performs.

The startup line now names both, because a split deployment and a same-origin one answer identically
to every request you can make by hand and disagree only in a browser:

```
elevator-sim viewer and API listening on 8787 — viewer origin https://…, cross-origin callers …
```

### 3.5 A custom domain is one variable, not a footnote

§ D243 rejected an absolute origin partly because it *"goes stale the moment a custom domain is put
in front"*. That objection is real and it is answered by making the origin a **deploy parameter that
lives in exactly two places**, neither of them the repository:

```sh
# 1. Attach the domain to the Static Web App (portal or `az staticwebapp hostname set`), then:
gh variable set ELEVATOR_SIM_API_ORIGIN --body "https://api.elevator-sim.example"   # if the API moved too
az deployment group create -g elevator-sim -n app \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/main.parameters.json \
  --parameters viewerOrigin="https://elevator-sim.example" \
               appSecret="$APP_SECRET" databaseAdminPassword="$DB_PASSWORD"
# 2. Push, or re-dispatch the workflow. The next build bakes the new origin in.
```

No file in this repository names a hostname. `packages/viz/index.html` in particular does not, and
`static.test.ts` asserts that it does not — a hostname committed there would point a *local
development build* at production, and because both producers of the tag are idempotent it would
silently suppress both.

---

## 4. How the page is told where the API is

`viz/src/dev/main.ts` builds its API client from `<meta name="elevator-sim-api">` and has **no
default origin** (§ D215 § 4). With no tag the client is `undefined` and every account, leaderboard
and challenge screen dead-ends. That is not hypothetical: it shipped, and it is play-tester issues
**#21, #28, #29, #30, #32 and #34** (§ D243).

There are now **two producers of that one tag, and exactly one fires**:

| Build | `ELEVATOR_SIM_API_ORIGIN` | The build emits | The server injects |
|---|---|---|---|
| `vite dev` | unset | nothing | not involved |
| the container image (`Dockerfile`) | unset | nothing | `"/"` — § D243, unchanged |
| the static host (`deploy-viz.yml`) | `https://…` | an absolute tag | never sees it |

`packages/viz/apiOrigin.mjs` is the second producer. `withApiOriginTag` is idempotent, so even a
static bundle handed to the container keeps its absolute origin rather than acquiring a second,
contradictory tag.

**The CSP moves with the tag, in the same decision.** `staticwebapp.config.json` ships
`connect-src 'self'`, which is correct for a page that contacts nothing else and forbids exactly the
request this deployment exists to make. The emitter widens it to `'self' <origin>` when — and only
when — an origin is declared, and throws if there is no `connect-src 'self'` to widen. A page that
knows where its API is, served by a policy that forbids reaching it, is a site that loads perfectly
and does nothing.

### The comment that broke it, which is worth reading

`packages/viz/index.html` now carries a comment telling the next reader not to write this tag by
hand. Both producers detected an existing tag with a regex over the whole document — and that
comment necessarily contains the attribute it warns about. The comment matched, both producers
concluded the page had already been told its origin, and neither emitted anything. **The prose
written to prevent a dead-ending viewer produced one.**

Found by a test, not by reasoning. The fix is that both detectors strip HTML comments first, which
is also what makes them agree with `querySelector` — what the page itself runs, and which has never
seen a comment. The literal stays in `index.html` deliberately: it is the live case, and deleting
either strip reddens `static.test.ts` against the document that actually ships.

### What the tests assert

`packages/server/src/http/static.test.ts` drives **both** modules in one file, because neither can
see the other:

- the two name the same tag;
- with no parameter the build emits nothing and the server's `"/"` still applies;
- with a parameter the build emits an absolute tag and the server leaves it alone;
- both origin validators agree, driven over one table of 14 cases rather than compared as text;
- the CSP is widened iff the tag is declared, read from the **committed** config on disk;
- the plugin is **registered** in `vite.config.ts` — read as text, because importing that file
  compiles it into the package, which is the one property its own docstring claims;
- `index.html` mentions the tag in prose and declares none;
- and the two end-to-end statements, against the **real shipped `index.html`** rather than a
  fixture: the server's path yields `content="/"` and the build's yields the absolute origin, and
  concatenating either gives the URL the API answers.

The workflow then asserts the built artifact **in both directions** — armed, the tag and the CSP
must name the origin; unarmed, neither may name anything.

---

## 5. What gets deployed

| Resource | Why |
|---|---|
| Static Web App, **Free** SKU | £0. Managed TLS, global distribution, preview environments |
| User-assigned managed identity | The identity GitHub Actions federates into. No client secret exists to leak or rotate |
| 2 federated identity credentials | One for pushes to the production branch, one for pull requests. Both pinned to this repository |
| Custom role + assignment, scoped to the site | Exactly `read` and `listSecrets`, on this one resource. Not `Website Contributor` |

Nothing holds a secret, and nothing writes one into this repository.

**`skip_app_build: true`**, so the artifact that was checked is the artifact that ships. Left to
itself the deploy action runs its own Oryx build inside its own container with its own toolchain — a
second build of the same commit that nothing here controls, has ever tested, or would have given
`ELEVATOR_SIM_API_ORIGIN` to.

**No `navigationFallback`**, which is a deviation from the usual single-page-app template and is
deliberate: the viewer has no client-side router, every real request names a file, and a catch-all
rewrite turns a mistyped asset URL into a 200 carrying HTML — the browser then reports a syntax
error inside what it was told was JavaScript. `assetFor` in `static.ts` refuses a catch-all for
exactly that reason, so the two hosts now have one 404 policy. **Verified against a live Static Web
App** (2026-08-08): `/no/such/page` answers 404 and `__buildings.json` is served as
`application/json` rather than swallowed. This paragraph said *"Unverified"* until it was run.

**A preview environment could not reach the API**, and that was a consequence of § 3 rather than a
defect in it: the allowlist held exactly one origin and a preview gets a per-pull-request hostname.
Previews were therefore good for layout and useless for accounts, the leaderboard, challenges and
sign-in.

**That is implemented now, and the sentences above are kept in the past tense rather than deleted.**
[§ D330](../DECISIONS.md) took the decision on 2026-08-09 and it went twenty-six days without a
consumer, which is the whole of [`RISKS.md`](../RISKS.md) R42; [§ D469](../DECISIONS.md) is the
implementation. `ELEVATOR_SIM_ALLOW_ORIGIN` is a comma-separated allowlist, the viewer's origin must
be a **member** of it, and the one entry that is not an origin is the word `previews`, which
`packages/server/src/http/static.ts#previewOriginsFor` expands from `ELEVATOR_SIM_ORIGIN` rather than
from anything an operator types. Every other member is refused at boot, so an allowlist can permit
this site and this site's own pull request previews and nothing else.

**What is implemented is not what is verified.** No preview has yet called the API from a browser
under the new rule, and nothing in § 9's verified column moves on this account. What is pinned is
the refusal, by a run rather than by an argument: `packages/server/src/http/boot.test.ts` starts the
built server with a wrong allowlist and requires the process to stop without binding a port. See
§ 3.4.

One thing has moved under it and narrows the blast radius rather than the argument: since
[§ D335](../DECISIONS.md) the page opens on Everyday Mode, which reads no API at all — the only
reader of the API meta tag in `packages/viz` is `dev/main.ts:1119` — so a preview reviewer now
reaches the blocked surfaces only by crossing the door to Engineer.

---

## 6. Fork pull requests

`deploy` and `close-preview` are excluded for pull requests whose head repository is not this one.
That is not belt-and-braces: GitHub issues no OIDC token to a fork's `pull_request` workflow, so the
job cannot authenticate and would fail on every external contribution — a permanently red check that
means nothing.

The preview federated credential's subject (`repo:OWNER/REPO:environment:viz-preview` — § D308 for
why it is not `:pull_request`) does **not** distinguish a fork's pull request from a branch's. On a
public repository, before arming, set *Settings → Actions → Fork pull request workflows* to require
approval for all outside collaborators. That repository setting is the control that matters, not the
`if:` above it.

**Set on this repository, 2026-08-08**, at the same time as arming:

```sh
gh api -X PUT repos/OWNER/REPO/actions/permissions/fork-pr-contributor-approval \
  -f approval_policy=all_external_contributors
```

It was `first_time_contributors`, which is GitHub's default and is not what this asks for.

---

## 7. Tear down

**This section is not the rollback and said it was until § 11 was written.** Tear down removes the
site; a rollback puts an earlier build back on a site that stays. If what you want is the second one,
stop here and read **§ 11** — running the first command below during an incident disarms the only job
that could deploy the fix.

```sh
gh variable delete AZURE_SWA_NAME          # disarms future deploys; the live page is untouched
az group delete --name elevator-sim-viz --yes --no-wait
```

**Deleting the group does not undo the app's side.** Put the API back to serving its own page:

```sh
az deployment group create -g elevator-sim -n app \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/main.parameters.json \
  --parameters viewerOrigin="" appSecret="$APP_SECRET" databaseAdminPassword="$DB_PASSWORD"
```

Left as it is, the app keeps mailing sign-in links to a site that no longer exists — and that is a
failure nobody sees until somebody tries to sign in.

---

## 8. Cost

| Line item | Rate | At rest |
|---|---|---|
| Static Web App, Free | — | **£0** |
| Egress, 100 GB/month included | overage not billed; service stops | £0 |
| The existing app and database | unchanged | ≈ $17 / month (`infra/README.md` § 5) |

**This lane adds nothing to the bill.** It does not reduce it either: the app still runs, because it
is still the API. What it removes is 32 seconds, not a line item.

> Derived from Azure's published list prices, not from a bill — the same caveat `infra/README.md`
> § 5 carries.

---

## 9. What has been verified by running it, and what has not

This section is the point of the document. `infra/README.md` § 0.2 lists *"No mail has ever been
sent"* as still unverified after a successful deployment; this holds to that standard.

### Verified, by running it on this machine

| Claim | How |
|---|---|
| The unparameterised build emits no tag | `npm run build:web`; `index.html` declares none, `connect-src 'self'` |
| The parameterised build emits the tag and widens the CSP | Same, with `ELEVATOR_SIM_API_ORIGIN` set; both correct in the output |
| An armed build with no origin **fails** | `ELEVATOR_SIM_API_ORIGIN_REQUIRED=true` with no origin: exit 1, message names the six issues |
| A malformed origin fails the build | `https://api.example/` → *"it is not in canonical form"*, exit 1 |
| **The container path still works** | The real `dist-web`, the real `loadStaticBundle`, `serve()` on a real socket: `GET /` → 200 with `content="/"`, `__buildings.json` → 8 buildings, `/no/such/page` → 404, `access-control-allow-origin: null` |
| A static bundle handed to the container keeps its own origin | Same harness against the parameterised build: `content="https://api.example"`, not overwritten |
| The workflow's assertion bites | Its script extracted and run against both real artifacts in all four combinations: unarmed/unarmed passes, unarmed/armed fails, armed/armed passes, armed/unarmed fails |
| Both templates compile | `az bicep build`, Bicep 0.46.1, exit 0, no warnings |
| The provisioning script parses | `bash -n`. `shellcheck` is not installed here and it has **not** been run |
| The suite | `npm run typecheck` clean; `vitest --project server` **205 passed**, up from 199, +37 new assertions in `static.test.ts` |

### Also verified, by arming it — 2026-08-08

Items 1 and 3 of the list below used to sit under *not verified*. They were moved by a run, and the
run corrected both of them ([§ D308](../DECISIONS.md)):

| Claim | How |
|---|---|
| Both templates **deploy**, not merely compile | `provision.sh` creates all six resources; the app template re-deploys with `viewerOrigin` set |
| The concurrency limit on federated credentials | Found by failing: `ConcurrentFederatedIdentityCredentialsWritesForSingleManagedIdentity`, deterministic, zero of six resources created. Fixed with `dependsOn` |
| **The credential subject is the environment, not the ref** | Found by failing: `AADSTS700213 … 'repo:…:environment:viz-production'`. Both subjects were wrong; a push to `main` would have failed identically |
| **And the subject is immutable** | The same error survived that correction. GitHub issues `repo:owner@ID/repo@ID:environment:NAME`; `provision.sh` now reads the prefix from the API rather than constructing it. Diagnosed as propagation delay first, which it was not |
| The branch pin, in its new home | `viz-production`'s deployment branch policy names exactly `main`; the script reads it back and refuses to arm otherwise |
| The API boots with the two origins agreeing | `main.ts` refuses to start when they disagree, so `GET /api/wake` → **200 in 0.12 s** is the assertion |
| `provision.sh`'s refusal path | Reached for real: it refused to arm while `ELEVATOR_SIM_ALLOW_ORIGIN` was empty, and armed once it was not. The `az containerapp show --query` expression § 9 called *"the line most likely to be wrong"* is right |
| The armed build's assertion, on the runner | `build site` passed with `ELEVATOR_SIM_API_ORIGIN` set: the tag matches and the CSP permits it |
| **The whole authentication chain, end to end** | Run `31284407311`: OIDC token exchanged, `az staticwebapp secrets list` read the deployment token with `listSecrets` alone, and the artifact uploaded to a preview environment. This is what § 9 previously called *"the most likely first failure"*, and it took three corrections to reach |
| **The absent `navigationFallback`, on a live site** | Against the deployed preview: `/` → 200, `__buildings.json` → 200 `application/json` with all 8 buildings, `/no/such/page` → **404**. No catch-all rewrite, so a mistyped asset URL is a 404 rather than a 200 carrying HTML. § 5 reasoned this; it is now observed |
| The page names the right API, on a live site | The deployed document declares `content="https://elevsim-app.…azurecontainerapps.io"` — the failure mode of issues #21/#28/#29/#30/#32/#34, checked on the artifact that shipped rather than on the build that made it |

### Not verified — reasoned about only

1. **No page has ever been served cross-origin *to the permitted origin*.** The mechanism has now
   met a browser and behaves: from the **preview** hostname, Chrome blocked `/api/boards` and
   `/api/wake` at preflight and named the mismatch, and the page said *"The leaderboard server could
   not be reached"* rather than claiming the server was down. That verifies the **refusal** half.
   The **permitted** half — a preflight, an `Authorization` header and a real sign-in from the
   production origin — is still unrun, because production had no content until the first merge.
   `curl` shows the API answering a preflight from that origin with the right three headers and no
   `Access-Control-Allow-Credentials`, which is the protocol and not the product.

   That the preview origin was *never* permitted was a structural consequence of the one-origin
   allowlist, not a misconfiguration, and it was **issue #123**: every pull request preview loaded,
   drew, and dead-ended every account, leaderboard and challenge surface. [§ D469](../DECISIONS.md)
   implements § D330's membership rule, so the allowlist can now admit those hostnames. **That half
   is unverified in the same sense as this whole section**: no preview has called the API from a
   browser under it, and the deployed app still sets the one-origin form until somebody re-runs
   § 3.3 with `previews` appended.
2. **The absent `navigationFallback` is unverified against a live site.** The reasoning is § 5's;
   the behaviour has not been observed.
3. **The Standard-plan proxy timeout is documentation, not measurement.** § 2 uses it as an argument
   against Standard and says so there too.
4. **Still no mail has ever been sent** (`infra/README.md` § 0.2). This lane moves the origin that
   mail's link is built from, so it makes that unverified path *more* load-bearing rather than less.
5. **No build has ever been put back on the live site.** § 11 is the procedure and **every step of it
   is in this column** — it is derived from `deploy-viz.yml`, `provision.sh`, `deploy-azure.sh` and
   `packages/viz/src/persist/`, and from nothing observed. That is not a hedge on a written
   procedure: GitHub issues #241 (AC2), #242 (AC4) and #243 (AC4) ask for a rehearsal specifically,
   and § 11.5 lists the six things a rehearsal has to observe. A rehearsal needs the Static Web App,
   its federated identity and the Container App, so nothing that can be done from a checkout closes
   it.

---

## 10. Seeding the boards on a clock — GitHub issues #222 and #328

Since [§ D521](../DECISIONS.md) and [§ D522](../DECISIONS.md) a daily board opens with the house's
runs on it: one row per shipped dispatcher whose mean is quotable on the day's fixture, posted by the
reserved `house` account, marked on the row and counted by no ladder. Nothing on the server runs
between requests, so the clock is `.github/workflows/seed-boards.yml`, which fires at 00:10 UTC and
calls `POST /api/boards/seed` on the deployed API with a bearer token.

Two values arm it, and the workflow refuses to run without either:

| where | name | value |
|---|---|---|
| repository variable | `ELEVATOR_SIM_API_ORIGIN` | the API's origin, already set by § 3 |
| repository secret | `ELEVATOR_SIM_SEED_TOKEN` | at least 32 characters, and the same value the container holds in its environment |

Set the container's half the way § 3.3 sets the others. A deployment without the variable answers the
route with 503 (`seeding-not-configured`) to everyone; a mismatched bearer is 401; a token shorter
than 32 characters is refused at boot, because the route runs thirteen simulations and a guessable
token on it would be a denial-of-service invitation with a password on it.

What the workflow's log shows is the whole response: the board key, the seed, every row seeded with
its mean and count, and every dispatcher skipped with the verifier's own reason (`nearest-car` is
skipped on the daily fixture because its mean is not quotable there). A **404** from the route is an
API image that predates it, which is the lag § 0 warned about made visible; a **503** is a deployment
with no token. Re-running the workflow on the same date is safe: the store's conflict key updates the
rows in place. The `date` input on a manual dispatch seeds another day's board, which is how a missed
night is made good.

Measured on this container: one replay of the daily fixture is 1.2 to 1.6 s, so a seeding is about
twenty seconds and the route answers synchronously.

---

## 11. Putting a previous build back on the live site — GitHub issue #355

**This is not § 7 and it is not the disarm command.** Until this section existed, four places in this
repository called `gh variable delete AZURE_SWA_NAME` *the rollback* — this document's § 0 and § 7,
and `.github/workflows/deploy-viz.yml` at its header and at its arm/disarm pair. That command
disarms **future** deploys. The page a player loads is unchanged by it, and stays unchanged. Three
acceptance criteria ask for a rehearsed rollback (#241 AC2, #242 AC4, #243 AC4), and a rehearsal
whose subject is the disarm command would record a recovery that recovers nothing.

So there are two operations and they now have two names:

| | command | what it changes | what it does not change |
|---|---|---|---|
| **Disarm** | `gh variable delete AZURE_SWA_NAME` | every future run: `jobs.deploy` is skipped and the workflow goes back to building only | **the bytes currently being served** |
| **Revert** | § 11.2 below | the bytes currently being served | whether the workflow is armed |

**Disarming makes a revert impossible rather than easier, and that is the sharpest reason the
vocabulary mattered.** `jobs.deploy`'s `if:` requires `vars.AZURE_SWA_NAME != ''`. With the variable
deleted the only job that can write to the site never runs — so the bad page stays up *and* the one
mechanism that could replace it has been switched off. An operator who reached for "the rollback" in
an incident would have made the incident permanent until somebody re-armed.

### 11.1 What can write to the live site, read off the workflow rather than inferred

One thing, and it is `jobs.deploy`'s `Upload to Static Web Apps` step:
`Azure/static-web-apps-deploy@v1` with `action: upload`, `skip_app_build: true` and
`app_location: dist-web` — the artifact `jobs.build` produced **in the same run**. Three properties
of that job decide everything below:

1. **It is gated on `vars.AZURE_SWA_NAME != ''`** — see above.
2. **It runs in `viz-production` for every event that is not a `pull_request`**, and
   `viz-production`'s deployment branch policy names exactly `main` (`provision.sh` sets it with
   `custom_branch_policies` and reads it back, refusing to arm otherwise; § 9 records that pin as
   verified by arming).
3. **It uploads bytes `jobs.build` just made.** There is no promote step, no slot swap and no
   deployment-history call anywhere in `.github/workflows/` or `infra/` — nothing in this repository
   has ever asked Azure to re-serve a deployment it already holds, and this section does not invent
   one. The only way the served bytes change is another upload.

Put together: **a revert is a run whose build job produces the artifact you want, on a ref the
production environment permits — and that ref is `main`.** Everything in § 11.2 follows from that
one sentence.

### 11.2 The procedure

Set the two origins once. Both are read back rather than typed, so a stale hostname in this document
cannot mislead the operator running it:

```sh
site="https://$(az staticwebapp show -n elevator-sim-viz -g elevator-sim-viz \
  --query defaultHostname -o tsv)"
api=$(gh variable list --json name,value -q '.[] | select(.name=="ELEVATOR_SIM_API_ORIGIN").value')
```

**Step 0 — name the build that is live and the build you want.** Both are commits, and that is
GitHub issue #246's whole point: `deploy-viz.yml` sets `ELEVATOR_SIM_BUILD_VERSION: ${{ github.sha }}`,
`packages/viz/vite.config.ts#buildVersion` takes its first ten characters, and every bundle carries
it. Read what is live two ways and prefer the first, because it is the *page* rather than a record
of what was uploaded to it:

```sh
# From the site itself: Settings → the build-information panel draws
# `release/version.ts#buildVersionLineOf` — "Build <ten characters>."
# From the deploy history, newest first:
gh run list --workflow=deploy-viz.yml --branch main --limit 10 \
  --json createdAt,headSha,conclusion,databaseId
```

Pick the target commit from that list — the newest `success` whose page was good — and keep its full
sha. Call it `$target`.

**Step 1 — decide whether the API also has to move (§ 11.4).** Do this before touching `main`, not
after: the page and the API are two independent deploys and only one of them is in this workflow.

**Step 2 — put the target tree on `main`.** `main` is the only ref the production environment
accepts, so the revert is a revert *forward*:

```sh
git switch main && git pull --ff-only
git revert --no-commit "$target"..main   # every commit after $target
# or, to undo one merge and nothing else:  git revert -m 1 <merge sha>
git commit
git push
```

Two things about this step that will otherwise be read as failures:

- **The deployed build version will name the revert commit, not `$target`.** The bytes match; the
  name does not, because `github.sha` is the commit being built. An operator comparing the page's
  build line against `$target` reads a correct revert as a failed one. Compare the **tree** instead,
  over exactly the paths the artifact is built from — this must print nothing:

  ```sh
  git diff --stat "$target" HEAD -- packages data package.json package-lock.json 'tsconfig*.json'
  ```

- **The push deploys only if the revert touches one of the workflow's `paths:`** — `packages/**`,
  `data/**`, `package.json`, `package-lock.json`, `tsconfig*.json`,
  `.github/workflows/deploy-viz.yml`. A revert that touches none of them starts no run, and nothing
  is wrong; step 3 is the trigger that always fires.

**Step 3 — make the run happen and watch it.**

```sh
gh workflow run deploy-viz.yml --ref main
sleep 8
gh run watch "$(gh run list --workflow=deploy-viz.yml --branch main --limit 1 \
  --json databaseId -q '.[0].databaseId')" --exit-status
```

`workflow_dispatch` carries **no `paths:` filter**, which is why it is the reliable trigger. It
builds `main`'s **tip** and cannot build an arbitrary commit — which is why step 2 exists and is not
optional. `--ref` must be `main`; see § 11.3.

**Step 4 — verify what is served, not what the run said.** A green run is a report about an upload.

```sh
curl -s -o /dev/null -w '%{http_code}\n'   "$site/"                  # 200
curl -s -o /dev/null -w '%{content_type}\n' "$site/__buildings.json" # application/json
curl -s "$site/" | grep -o 'elevator-sim-api[^>]*'                   # names $api
```

Then load the page and read the build line on Settings. It will say the revert commit (step 2), and
the tree comparison in step 2 is what says those bytes are `$target`'s.

`./infra/azure/swa/provision.sh --deploy-now` does steps 3 and 4 in one command, refuses on any
branch but `main`, and checks the deployed page's API tag as well as its status code. Its cost in an
incident is that it also re-runs provisioning: idempotent, but it re-reads six repository variables
off Azure and refuses to arm if the app is not pointed at the site, which is motion the revert does
not need.

### 11.3 The failure modes, and what each looks like from the outside

| symptom | cause | what to do |
|---|---|---|
| The run is green in `build` and deployed nothing | The dispatch named a ref that is not `main`. `viz-production`'s branch policy refuses the deployment before the job authenticates, so `jobs.build` still runs and passes and the run is *partly* green | Dispatch on `main`. `provision.sh --deploy-now` refuses this case itself rather than letting GitHub produce it |
| The push landed and no run appeared | The `paths:` filter (step 2) | `gh workflow run deploy-viz.yml --ref main` |
| The run never started, or a queued one vanished | `deploy-viz.yml`'s production concurrency group is the literal string `deploy-viz-production`, so every production run shares it. `cancel-in-progress` is false for a push, so a running deploy is not cancelled — but GitHub keeps at most one **pending** run per group, so a third arrival evicts the queued one whatever the flag says (`CLAUDE.md`'s working agreements; [`RISKS.md`](../RISKS.md) R46, which measured this on `ci.yml`). **Inferred here from the group name and unobserved on this workflow** | Push nothing else to `main` while the revert deploy is in flight |
| The page went back and every account surface dead-ends | `ELEVATOR_SIM_API_ORIGIN` is a repository variable read at **build** time, so rebuilding an old commit bakes in *today's* value, not the one that commit shipped against. Reverting the page does not revert the origin | Check `$api` before step 3. This is the failure mode of issues #21, #28, #29, #30, #32 and #34 (§ 4), and the workflow's own assertion catches only a build that disagrees with the variable, not a variable that has moved |
| Players report their saved week is gone | The page went back past a bump in `packages/viz/src/persist/types.ts#SESSION_SCHEMA_VERSION`. An older build finds a version outside its `SESSION_SCHEMA_VERSIONS_READ`, refuses the session as *newer* (`persist/session.ts`), and `dev/main.ts` then **clears the slot** so it cannot re-fail forever | Nothing. See the warning below — this one is not recoverable |
| The page went back and the behaviour did not | The bad change was server-side. Nothing in `.github/workflows/` deploys the API | § 11.4 |

**The save-data warning is the one irreversible step in this procedure, and it deserves its own
paragraph.** `dev/main.ts` calls `clearSession` on every restore failure that is not `absent`, so a
player who loads a reverted build once has their week cleared — and reverting *forward* again does
not bring it back, because the storage is already empty. Before step 2, check whether `$target`
predates the current `SESSION_SCHEMA_VERSION`:

```sh
git diff "$target" main -- packages/viz/src/persist/types.ts | grep SESSION_SCHEMA_VERSION
```

If that prints anything, the revert costs every affected player their saved week. That is a decision
for a human, and it is the reason this procedure does not end in a single command.

### 11.4 The API side, and the thing the issue's own framing gets slightly wrong

**A page revert does not move `ELEVATOR_SIM_ORIGIN` or `ELEVATOR_SIM_ALLOW_ORIGIN`, and must not.**
Both name the *site's origin*, and a revert changes what the site serves rather than where it is. The
sentence in § 0 that records those two staying set is about **tear down** (§ 7), where the site stops
existing and the app goes on mailing sign-in links to it; it is not about a revert, where the site is
still there and still the right destination. Issue #355 reads § 0 as though the two cases were one,
and they are not.

What a revert *can* need on the API side is the **image**, and nothing in `.github/workflows/`
deploys it. That is `scripts/deploy-azure.sh`, by hand, from a checkout of the target:

```sh
git switch --detach "$target"
./scripts/deploy-azure.sh            # what-if: prints the plan, changes nothing
./scripts/deploy-azure.sh --apply
```

Five properties of that script decide whether this is safe, and all five are in its own header:

- **It refuses a dirty tree**, because the image tag is `git rev-parse --short HEAD` and an image
  tagged with a commit it does not contain is the only record of what is running, lying.
- **It reads `viewerOrigin` back off the running app** rather than defaulting it. Do **not** set
  `ELEVSIM_VIEWER_ORIGIN` during a revert: the script's own scar is a re-deploy on 2026-08-13 that
  let the parameter default to `''`, silently converted a split deployment back to same-origin, and
  broke every browser call while `curl` still got a 200.
- **It rotates the database administrator password on every deploy.** By design, and safe — the
  template resets the server's password and builds the connection string from the same parameter —
  but it means an API revert is a real re-deploy rather than a swap.
- **It reuses the token-signing secret**, so sign-in links already in somebody's inbox survive.
- **It verifies `/api/boards` returns 200** before reporting success, polling that route thirty times at five-second intervals before giving up.

There is a faster path and it is **deliberately not recommended**. The image for `$target` is
probably still in the registry under its own short sha, so `az containerapp update --image` would
move the app without a rebuild. § 3.3 refuses the same shape for `--set-env-vars` and the reason
carries: it edits a revision the Bicep template then owns and disagrees with, and the next
`deploy-azure.sh` run silently reverts the revert. **Nothing in this repository has run it.**

**Which half goes first is not settled by anything in this tree, and saying so is the honest
answer.** The page and the API are independent deploys with no shared gate, nothing sequences them,
and the only ordering rule this document states — § 3's *"half-armed is the worst of the three
states"* — is about arming rather than reverting. A rehearsal is what would settle it; see § 11.5.

### 11.5 What this procedure has been through, in § 9's voice — and it is nothing

**No step of § 11 has been run against production, or against anything.** It is derived from
`.github/workflows/deploy-viz.yml`, `infra/azure/swa/provision.sh`, `scripts/deploy-azure.sh`,
`packages/viz/src/persist/` and `packages/viz/src/release/version.ts`, read at the commit that added
this section — and from nothing observed. Everything above is therefore in § 9's *reasoned about
only* column, and § 9 now carries it as item 5.

**#241 AC2, #242 AC4 and #243 AC4 are not met by this section existing.** They ask for a rehearsal,
and a procedure nobody has run is a draft. What a rehearsal has to observe, and what it would
correct if the reasoning above is wrong:

1. A dispatch on a non-`main` ref really is refused at the environment rather than at the job, and
   the run really does look partly green. This is `provision.sh`'s stated mechanism and § 9 records
   only the branch policy's *existence* as verified.
2. A revert-forward push really does deploy, and the tree comparison in step 2 really is empty while
   the build line names the revert commit.
3. The time from `git push` to the reverted page being served. Nothing in this repository has
   measured it, and an incident procedure whose duration is unknown is a procedure nobody can plan
   around.
4. Whether an older page against the current API actually works — a revert puts a page in front of an
   API that versions separately, and no test in this tree drives that pair.
5. The save-clearing above, on a real browser with a real saved week, so the cost is known rather
   than derived from `dev/main.ts`'s `clearSession` call on the restore path.
6. Whether the API half is needed at all in the common case, and if both halves run, which order
   leaves the shorter broken window.

A rehearsal needs the Static Web App, its federated identity and the Container App. Nothing that can
be done from a checkout closes these.

---

## Sources

- Azure Static Web Apps quotas and plan comparison, Microsoft Learn.
- `Azure/static-web-apps` issue #1304 — the deploy action cannot use a federated credential.
- Cold-start figures: measured against the live deployment at
  `https://elevsim-app.salmonstone-4576d6f7.eastus2.azurecontainerapps.io`; the 28.7 s API figure is
  § D241 § 3's and was taken independently.
