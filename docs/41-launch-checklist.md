# The launch checklist — what is checked, what a pass looks like, and who can do it

GitHub issue **#243**. Written to be *executed*, so every item names an apparatus and a verdict
rather than a topic. *"Check the browser matrix"* is not an item; *"on these browsers, this page
reaches this state, verified by this command"* is.

> **Read § 0 before you run anything.** Only five of the items below can be discharged from a
> checkout — § 0.2 names them — and one of the rest, the rollback, has a written procedure that
> nothing has ever exercised. A checklist that reads as though it had been executed when it has not is worse than no
> checklist, so § 0 and § 9 keep the two apart in
> [`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 9's voice.

---

## 0. What this document is, and what it is not

**It is not a record of a launch.** Nothing here has been ticked. It is the list, the apparatus for
each item, and the honest state of each apparatus on the day it was written — 2026-09-10, against
the tree carrying `packages/viz/src/persist/migrationMatrix.test.ts`.

**One item on it is mechanised rather than described**, and that is deliberate: the product owner's
note on #243 asks for checks that are *mechanical over ones that are prose*, because *"a launch
checklist written long before a launch goes stale exactly like everything else in this repository
has"*. § 3 — save migration — is the one that could be turned into a run, and it was. Every other
item is prose with an apparatus named, and each says which.

**The three states an item can be in**, used consistently below:

| | meaning |
|---|---|
| **MECHANISED** | A run decides it. Named by path. A human reads an exit code, not a screen |
| **APPARATUS, DRIVEN BY HAND** | The instrument exists and somebody has to point it at production and read the answer |
| **NOT BUILT** | There is no instrument. The item says what building one would mean, and it is not built here |

**What is deliberately not in this document.** No subscription id, no workspace id, no hostname that
is not already read back from Azure by a command written here, and no credential. The two origins in
every command below are read from the live resources rather than typed, so a stale hostname in this
file cannot mislead an operator running it — the shape
[`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 11.2 sets.

### 0.1 The two commands every section assumes

Run these once, at the top of a launch session. Everything below refers to `$site` and `$api`.

```sh
site="https://$(az staticwebapp show -n elevator-sim-viz -g elevator-sim-viz \
  --query defaultHostname -o tsv)"
api=$(gh variable list --json name,value -q '.[] | select(.name=="ELEVATOR_SIM_API_ORIGIN").value')
```

### 0.2 Who can do what

Three roles, and the split is by credential rather than by seniority.

| role | holds | can discharge |
|---|---|---|
| **Anybody with a checkout** | nothing | § 2.1, § 3, § 4.1, § 5.1, § 7.1 |
| **A repository maintainer** | `gh` against this repository | § 6.1, § 6.2, § 8 steps 1–3 |
| **An Azure operator** | the subscription holding `elevator-sim` and `elevator-sim-viz` | § 2.2, § 4.2, § 5.2, § 6.3, § 6.4, § 7.2, § 10 AC4 |

A maintainer who is not an Azure operator cannot rehearse a rollback, cannot turn previews on, and
cannot create the alert rule [`docs/40-incident-runbook.md`](40-incident-runbook.md) § 4 asks for.
That is the whole reason three of #243's five acceptance criteria are still open, and § 10 says so
per criterion rather than in aggregate.

---

## 1. The order, and why it is this order

**Anything that can fail on a checkout fails first**, because a launch window spent discovering a
migration defect is a launch window wasted. Then the deployed page, then the API, then the
irreversible ones.

1. § 3 — save migration (**MECHANISED**; run it before anything else, it costs seconds).
2. § 4 — the cold-load budget (**MECHANISED** in one of its three parts; § 4.2 is the gap).
3. § 2 — the browser matrix.
4. § 5 — leaderboard verification.
5. § 7 — the API origin configuration.
6. § 6 — deploy and rollback, and § 6.4 last of all, because rehearsing a revert moves the live site.

---

## 2. The browser matrix

[`docs/31-support-matrix.md`](31-support-matrix.md) is the declaration; this section is what to run
against it. **Its § 1 says the honest thing about itself and it is repeated here rather than
softened: a tier nothing tests is a claim, and only tier 1 is a fact that a red run defends.**

### 2.1 Tier 1 — Chromium, the only browser CI drives — MECHANISED

- **What a pass looks like:** `npx vitest run --project viz-browser` is green, in a checkout, with
  Chromium available. On CI it is the `browser` leg of `.github/workflows/ci.yml`, and
  `packages/viz/src/dev/browserTier.test.ts` **fails the run** when `CI` is set and the browser is
  absent — so a skipped tier cannot masquerade as a passing one.
- **What it drives:** `packages/viz/src/**/*.browser.test.ts`, against a real `vite build` served by
  `preview()`, launched through `playwright-core`'s Chromium headless shell.
- **Who:** anybody with a checkout, or CI on every pull request.
- **What it is not:** a full Chrome. It is the headless shell, and its version floats with the
  `playwright-core` devDependency rather than being pinned.

### 2.2 Tiers 2 and 3 — everything else — NOT BUILT

**No browser other than Chromium has loaded this product**, which is `docs/31-support-matrix.md`
§ 7's first unsettled item. Firefox, Safari, Edge, Android Chrome and iOS Safari are declared in its
§ 1 as tier 3, best effort, and nothing tests any of them.

- **What a pass looks like, if somebody does it by hand:** on each browser, load `$site`, reach the
  Everyday main menu, start a Scenario, watch the stage draw a moving canvas, open Settings and read
  the build line. Record the browser, its version, the date and the build id — `docs/31` § 1's
  tier-2 table carries a date against every row for exactly that reason, and the one hand-driven
  Engineer row it names was last driven on 2026-07-30.
- **Who:** anybody with the browser. No credential is needed; only `$site`.
- **The one that matters most and is weakest:** iOS Safari. It is the row `docs/31` names as the
  weakest in the whole matrix, and a launch that has not opened the page on an iPhone once is
  launching on an untested platform.
- **Building an instrument for it** would mean adding `firefox` and `webkit` to the browser tier's
  launcher and a CI leg for each — `packages/viz/src/dev/browserTierSite.test-helper.ts` resolves
  exactly one executable today. That is not done here, and it is a real cost rather than a line:
  every one of the browser-tier files would then run three times.

### 2.3 The viewport floor

- **What a pass looks like:** at 360 px wide the Everyday shell draws without a horizontal scrollbar
  and the action bar stays pinned. Below 360 px is **not supported** — `docs/31` § 1's tier 4 says
  so, beside JavaScript disabled and Internet Explorer.
- **Who:** anybody, in a browser's device emulation.

---

## 3. Save migration — MECHANISED

**This is the item #243 names that could be turned into a run, and it is the most valuable thing on
this branch.** A player arriving on launch day has bytes in `localStorage` written by whatever build
they last loaded. If the new build refuses them, `dev/main.ts` clears the slot and their week is
gone — and reverting forward does not bring it back
([`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 11.3).

### 3.1 The slots, found rather than assumed

There are **seven** keys in this origin's `localStorage` and one server-side schema. Four carry a
version; two carry a bare string and cannot; one holds versioned bytes that are written and never
read. The set was derived rather than transcribed — every non-test caller of a storage read, write or
remove in `packages/viz/src`, and the key constant each one names — because the list this section was
commissioned from had already gone stale in three places, which this section's closing paragraph
records.

| slot | key | version constant | versions read | migrations |
|---|---|---|---|---|
| the week | `elevator-sim.session` | `persist/types.ts#SESSION_SCHEMA_VERSION` = **9** | 1–9 | four arms in `persist/session.ts` |
| the profile | `elevator-sim.everyday-profile` | `everyday/profile.ts#PROFILE_SCHEMA_VERSION` = **5** | 1–5 | four arms in the same file |
| the career | `elevator-sim:career` | `campaign/careerPersist.ts#CAREER_SCHEMA_VERSION` = **1** | 1 | none yet |
| the refused career | `elevator-sim:career:refused` | — | — | written by the load path, read by nobody |
| telemetry consent | `elevator-sim.telemetry` | `telemetry/consent.ts#CONSENT_SCHEMA_VERSION` = **1** | 1 | none; a mismatch reads as *unasked* |
| the Engineer view mode | `elevator-sim.viewMode` | none | — | a bare string; an unknown value falls back |
| the revealed tabs | `elevator-sim.revealedTabs` | none | — | as above |

**The server's store is versioned separately and is not a save slot**: `packages/server/src/store/store.ts`
carries a `schema_migrations` table and a `MIGRATIONS` list, applied at open, exercised against a
pre-`legs` database by `packages/server/src/store/migrations.test.ts`. It is in § 5.3 rather than
here, because a player's browser cannot hold a version of it.

**Three corrections to the list this section was commissioned from, recorded because they are the
point rather than as an aside.**

1. The profile slot was named as *versions 1 → 4*, with version 4 the chimes migration. It is at
   **5**, and version 5 is the sound preference; version 4 is the default speed.
2. There is no `packages/server/src/store/migrations.ts`. The runner and the migration list live in
   `store.ts`; only the test carries that name.
3. `packages/viz/src/gauntlet/rating.ts` was named as a save slot and is not one. It holds no key
   and no version — a `SavedRating` is declared in `gauntlet/ladder.ts` and travels **inside** the
   profile slot's `progress`, under that slot's version and that slot's budget.

A transcribed list of save slots had gone stale between being written and being read, which is the
whole argument for § 3.2 and is why this section derives its own.

### 3.2 How the deployed set is derived, and why it cannot go stale

**No version number is written down in the matrix.** The rows come from the constant the *writer*
stamps, counted down to 1:

```ts
versionsUpTo(SESSION_SCHEMA_VERSION)   //  [1, 2, … , SESSION_SCHEMA_VERSION]
```

**Why that is the right set.** The versions that have been *deployed* are a subset of the versions
that have ever been *written*, and for a counter incremented one at a time the second set is exactly
`1 … current`. Testing the superset cannot under-test the criterion; it can only do more work than
the criterion needs, on versions that may never have reached a browser. That trade is deliberately
in this direction.

**Why not `git log -S` bounded at the arming date**, which is the other obvious derivation and is
what #243's own analysis proposed. `actions/checkout@v4` clones to depth 1 and
`.github/workflows/ci.yml` sets no `fetch-depth`, so a history-based derivation would be green on a
developer's machine and **vacuous in CI** — a guard that cannot see what it is guarding, which is
worse than a superset. Deriving the exact deployed set is still worth doing **by hand**, once, and
§ 8 step 2 is that item.

**What makes the mechanism unable to go stale:** bumping a version constant adds a row to the matrix
on the same commit, and that row is **red** until somebody writes the migration and the step-down
for it. There is no list to forget to update.

**The vacuity guard is not decoration — it caught this file on its first run.** The profile
constants were module-private, `Array.from({ length: undefined })` is `[]`, and the profile matrix
produced *no rows at all* while its both-directions check compared two empty lists and passed. The
constants are exported now (`everyday/profile.ts`, for this and nothing else), and `versionsUpTo`
refuses a version that is not a positive integer, so the next such import is red rather than silent.

### 3.3 What each row asserts, and why *it parses* is not one of them

`packages/viz/src/persist/migrationMatrix.test.ts`, one row per version per slot:

1. **It migrates.** `loadSession` returns `ok` on an envelope shaped as that version wrote it.
2. **The completion fills the value the absence *determined*, not merely some value.**
   `windowStartS: null`, `parkedWeeks: []`, `record: null`, `recordRefusal: null`, `ruleRows: []`
   and a stored record's shape number moving to 2. A migration that filled a *different* value would
   still parse, and this is the assertion that tells the two apart.
3. **The current build takes the result back.** The restored snapshot goes into a real `ViewerState`
   and `MenuState` through the same constructors the shell uses, the real `saveSession` writes it,
   the bytes are read again, and the rewrite must stamp the **current** version. Then the week is
   *played* — `nextDay`, `closeDay`, save, load — because a week that parses and cannot be advanced
   is not a restored week, and a state that parses and cannot be written back is a player whose next
   autosave fails.
4. **Both directions on the read set.** Every version the build has ever written must be in
   `SESSION_SCHEMA_VERSIONS_READ`, *and* every entry of that set must be a version the build could
   have written. A number in one and not the other is red.
5. **A newer envelope is still refused.** `careerPersist.ts` documents that case for its own slot;
   the matrix checks it on all three rather than trusting the docstring, and requires the refusal to
   name the version it found and the one it supports.

- **What a pass looks like:** `npx vitest run --project viz packages/viz/src/persist/migrationMatrix.test.ts`
  → **23 passed**, exit 0.
- **Who:** anybody with a checkout. It needs no browser, no network and no credential, and it
  finishes in about a second.

### 3.4 The positive controls, and what each one turns red

A guard nobody has broken on purpose is a guard nobody has checked. All four were run against this
tree, and each is named below with the assertion message it actually produced rather than with a
description of one. Every break was reverted, and nothing in `persist/session.ts` or
`persist/types.ts` is changed by this branch at all — the product's migration code is exactly what it
was, and the matrix is the only thing added to it.

| control | what was broken | what went red |
|---|---|---|
| **1** | `persist/session.ts#withParkedWeeks` made to return its input — the real shape of a deleted migration arm | versions **1, 2, 3**, each naming *"the session is missing parkedWeeks"* |
| **2** | the version-6 step-down body replaced by `envelope => envelope` | the non-vacuity guard, and versions **1–5** with it |
| **3** | `SESSION_SCHEMA_VERSION` bumped to 10 and nothing else touched | **12 cases**, including the both-directions check reporting `[ 10 ]` |
| **4** | the envelope version refusal disabled in `readEnvelope` | the refusal row, *"version 10 must be refused"* |

**Control 3 found a real latent defect and it is worth stating separately.** With the constant at 10
and the read set left at 1–9, the build refuses **its own freshly-written session**, and tells the
player it *"was saved by an older version of the game"* — because the direction test is
`version > SESSION_SCHEMA_VERSION`, which is false when they are equal. The message is wrong in the
one case a bump makes reachable. The matrix catches the cause (item 4 above) before such a build
could ship, so nothing is changed in the product here; the sentence exists so the next person to bump
the constant knows what the wrong branch looks like.

**The boundary was checked against the value a defect would really have**, not a convenient one:
control 1 removes the completion rather than moving a bound, and the envelope that reaches the reader
is one with the key genuinely absent — which is what an older build actually wrote.

### 3.5 What a real player's upgrade looks like, by hand

- **What a pass looks like:** on `$site`, play a day, close it, reload, and read the same week back —
  streak, banked count and history intact — then open Settings and confirm the build line names the
  build you are on.
- **Who:** anybody with a browser.
- **Why it is still worth doing after § 3.3:** the matrix drives the injected `SessionStore` port,
  which is what makes the module testable at all. It does not touch a real browser's `localStorage`,
  and it cannot see a browser that blocks site data, an origin at its quota, or a second tab writing
  the slot underneath the first.

### 3.6 What § 3 does not cover, named rather than left to be discovered

1. **No version has been loaded out of a real browser's storage by this matrix.** § 3.5 is the
   manual half and it has not been run against production.
2. **The two unversioned slots have no matrix**, deliberately: `elevator-sim.viewMode` and
   `elevator-sim.revealedTabs` hold a bare string each and an unknown value falls back rather than
   refusing. If either ever grows a shape, it needs a version and a row here.
3. **The quarantine slot is written and never read.** That is its design — it exists so a player who
   downgraded a tab can return to the build that wrote it — so nothing can assert its contents are
   readable by anything, and nothing should.
4. **Cross-slot disagreement is not checked.** The week and the career carry independent versions and
   independent refusals, and `careerPersist.ts` records that a session bump can reset the week to day
   1 while a career restores at contract day 6. The product's answer is that the week is
   authoritative and the career withholds rather than fabricating; no row here drives that pair.

---

## 4. The cold-load budget

The number this deployment exists to remove is **32.2 s** — the cold first page load measured against
the live pre-CDN deployment, with a warm load at 0.13 s
([`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 1). Neither figure is a page-weight
measurement, and `docs/31-support-matrix.md` § 3 disqualifies both for that purpose in terms: the
first was container cold-start rather than page weight, and the second a warm *page load* rather than
time to interactive.

### 4.1 Page weight — MECHANISED

- **What a pass looks like:** the browser tier is green, which includes
  `packages/viz/src/everyday/builtBundle.browser.test.ts` asserting the whole of `dist-web`, gzipped
  at level 9, is at or under **1 160 kB**. There is a second, tighter assertion at 90 % of that, so
  the run goes red with headroom left rather than at the cliff.
- **Where the number comes from:** measured at 930.0 kB on 2026-09-07, plus 25 %.
- **Its own anti-vacuity control:** the test requires more than five files, an `index.html` and a
  `.js`, because an unbuilt directory reads as zero bytes and passes a budget.
- **Who:** anybody with a checkout; CI on every pull request.

### 4.2 Time to interactive, and main-thread blocking — NOT BUILT

- **`docs/31` § 3 asks for cold load to interactive under 3 s and a main-thread block under 800 ms**,
  against [`docs/22-charter.md`](22-charter.md)'s `charter S9`.
  Neither is instrumented. `builtBundle.browser.test.ts` says in its own docstring that it is the
  page-weight half **and only** that half: the first needs run history this repository does not keep,
  and the second needs a CPU-throttle factor calibrated against a real machine that does not exist
  here.
- **What a pass would look like if a human takes the measurement:** load `$site` cold in a fresh
  profile with the cache disabled, and record navigation-to-first-interaction. The one comparable
  figure this repository holds is the landing page's **370 ms from navigation to a moving canvas**,
  measured on the built bundle at 1440 × 900 — which is a floor for a warm local build rather than a
  cold-load figure from a CDN, and must not be quoted as one.
- **Who:** anybody with a browser and `$site`; no credential.
- **Building the instrument** would mean either a stored baseline the tier compares against, or a
  calibration step that measures the runner before it judges the page. Both are real work and neither
  is done here.

### 4.3 The API's own cold start

- **What a pass looks like:** `curl -s -o /dev/null -w '%{time_total}\n' "$api/api/wake"` on a
  container that has scaled to zero. The comparable figure is a cold `GET /api/challenges` at
  **28.7 s**, taken independently for § D241.
- **Why it is not a launch blocker:** the page is on the CDN and the API is a separate deployment, so
  an API that is entirely asleep — or entirely down — is **S2** in
  [`docs/40-incident-runbook.md`](40-incident-runbook.md) § 1, not S1. Every account, board and
  challenge surface dead-ends and the game still plays.
- **Who:** anybody with `$api`.

---

## 5. Leaderboard verification under load

**The server re-runs the run.** `packages/server/src/leaderboard/verify.ts` replays a submission and
compares its metrics exactly, so a verification costs a whole simulation of CPU. That is the design
and it is what makes this item about load rather than about correctness.

### 5.1 Correctness of the verifier — MECHANISED

- **What a pass looks like:** `npx vitest run --project server` is green, which includes
  `packages/server/src/leaderboard/verify.ts`'s own cases and the API route tests in
  `packages/server/src/http/api.test.ts`.
- **Who:** anybody with a checkout.

### 5.2 Behaviour under real load — NOT BUILT

**There is no load test in this repository.** No harness drives concurrent submissions, and the only
defence against a replay flood is a cooldown.

- **What exists:** `packages/server/src/http/api.ts` charges a cooldown proportional to the work a
  submission commands — a 5 s floor, scaled by seed count and by run length against a 7 200 s
  reference, so a whole day or a five-seed challenge is 25 s. Over it, the route answers **429**.
- **The property to know before launch:** that cooldown is a **per-process in-memory map**. It is not
  shared between replicas and a restart resets it. On a deployment at `minReplicas: 0` with one
  replica that is the same thing as a global limit; it stops being one the moment the app scales out,
  and nothing in the tree would notice.
- **What a pass looks like, driven by hand:** submit a run, submit the same run again inside the
  cooldown, and require a 429 naming `too-many-submissions`. Then read
  `az containerapp logs show -n elevsim-app -g elevator-sim --tail 200 | grep elevator-sim-fault` and
  require nothing.
- **The measured cost of one verification, so an operator can size the risk:** one replay of the
  daily fixture is **1.2 to 1.6 s** on the deployed container. The client-side table in
  `packages/viz/src/shift/dayLength.ts` measures a whole 36 000 s day at **9 200 ms** on
  `vertical-city` — taken in Node rather than on the server box, and quoted here as an order of
  magnitude rather than as a server figure.
- **Who:** an Azure operator, for the log half; anybody with an account, for the 429 half.
- **Building the instrument** would mean a harness that opens N sessions and submits concurrently
  while watching replica count and p95 latency. It is not built, and a launch can proceed without it
  only because the cooldown makes a single account's cost bounded — which is a different claim from
  *the service survives many accounts*.

### 5.3 The board seeding clock, and the store's own migrations

- **What a pass looks like:** `.github/workflows/seed-boards.yml` has a green run at 00:10 UTC, and
  its log shows the board key, the seed, every row seeded with its mean and count, and every
  dispatcher skipped with the verifier's own reason. A **404** from the route is an API image that
  predates it; a **503** is a deployment with no `ELEVATOR_SIM_SEED_TOKEN`.
- **The store's migrations:** applied at open by `packages/server/src/store/store.ts`, recorded in a
  `schema_migrations` table, and exercised against a database this code did not create by
  `packages/server/src/store/migrations.test.ts`. **What a pass looks like at launch** is the first
  container start after a deploy writing no `elevator-sim-fault at=boot` line.
- **Who:** a maintainer for the workflow; an Azure operator for the log.

---

## 6. Deploy, and putting a previous build back

### 6.1 The deploy path — MECHANISED

- **What a pass looks like:** a push to `main` that touches one of `deploy-viz.yml`'s `paths:`
  produces a green run of `.github/workflows/deploy-viz.yml`, in which `build site` asserts the
  artifact is complete and that the page's API tag and the CSP agree with `ELEVATOR_SIM_API_ORIGIN`
  **in both directions**, and `deploy` runs the dead-page probe against what was actually served.
- **Who:** a maintainer.

### 6.2 The dead-page probe — MECHANISED, and runnable against production by hand

- **What a pass looks like:** `node scripts/dead-page.mjs "$site" "$api"` prints that the served page
  is alive and exits 0. It probes `GET /`, every same-origin script and stylesheet the page
  references, `/__buildings.json`, and the five data documents; it fails on a non-200, on a script
  served with the wrong content type, on a manifest carrying no buildings, and on a declared API
  origin that disagrees with `$api`.
- **What it cannot see, in its own words:** a bundle that is served correctly and throws. No HTTP
  probe can. If it reports nothing and players still say the page is dead, load the site and read the
  console — the one case in the incident runbook with no instrument.
- **Who:** anybody with `$site` and `$api`; it installs nothing.
- **The trap:** this probe runs inside the `deploy` job, which is gated on `AZURE_SWA_NAME` being
  set. Disarming removes the check along with the deploys.

### 6.3 Reverting the live site — APPARATUS, DRIVEN BY HAND, AND NEVER REHEARSED

**[`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 11 is the procedure and this
section does not restate it.** Three things an operator needs before opening it:

- **`gh variable delete AZURE_SWA_NAME` is *not* the rollback**, and reaching for it during an
  incident makes the incident permanent: it disarms every future deploy, the bytes a player is
  loading are untouched by it, and the only job that can replace them is gated on that variable. Four
  places in this repository called it the rollback until § 11 was written.
- **A revert is a revert *forward*.** The production environment accepts only `main`, so putting an
  older tree back means committing a revert onto `main` and dispatching the workflow.
- **One step is irreversible and it is not the obvious one.** If the target commit predates a bump in
  `SESSION_SCHEMA_VERSION`, a player who loads the reverted build **once** has their week cleared,
  and reverting forward again does not bring it back. § 11.2 carries the command that checks for it.
  **§ 3 of this document is what makes that check cheap to reason about**, because the matrix says
  exactly which versions the current build can read.

- **What a pass looks like:** the six observations `docs/16` § 11.5 lists — a non-`main` dispatch
  really being refused at the environment, a revert-forward push really deploying with an empty tree
  diff, the wall-clock time from push to reverted page, an older page against the current API, the
  save-clearing on a real browser, and which half goes first when both are needed.
- **Who:** an Azure operator with a maintainer beside them.
- **State:** **no step of it has been run, against production or anywhere.** § 11.5 says so in terms
  and this section does not soften it.

### 6.4 The API half

- **A page revert does not move the API**, and nothing in `.github/workflows/` deploys the API at
  all — that is `scripts/deploy-azure.sh`, by hand, from a checkout of the target commit.
- **What a pass looks like:** `./scripts/deploy-azure.sh` prints a plan and changes nothing;
  `--apply` deploys and then polls `/api/boards` for a 200 before reporting success.
- **The one instruction that is easy to get wrong:** do **not** set `ELEVSIM_VIEWER_ORIGIN` during a
  revert. The script reads `viewerOrigin` back off the running app; a re-deploy on 2026-08-13 let
  that parameter default to empty, silently converted a split deployment back to same-origin, and
  broke every browser call while `curl` still got a 200.
- **Who:** an Azure operator.

### 6.5 Alerting

- **The alert rule does not exist**, and nothing in this repository can create one.
  [`docs/40-incident-runbook.md`](40-incident-runbook.md) § 4 is the specification: source is the
  Container App's log stream, condition is any line containing `elevator-sim-fault`, with a second
  tighter rule on `elevator-sim-fault at=boot`, destination is a human.
- **How to verify it once it exists**, without waiting for a real incident: a revision started with a
  bad configuration exits 1 and writes `elevator-sim-fault at=boot kind=Error` before it goes. That
  is a real error triggered on purpose, and it is what a verified alert path means.
- **Who:** an Azure operator with a notification channel. **State: NOT BUILT.**

---

## 7. The API origin configuration, and preview environments

### 7.1 What the API refuses at boot — MECHANISED

- **What a pass looks like:** `npx vitest run --project server` green, which includes
  `packages/server/src/http/boot.test.ts` starting the **built** server with a wrong allowlist and
  requiring the process to stop without binding a port.
- **The four refusals**, each with a message naming the fix: a blank entry from a stray comma; an
  allowlist that does not contain `ELEVATOR_SIM_ORIGIN`; the entry `previews` where the viewer origin
  mints none; and any entry this deployment cannot mint. A wildcard is refused outright.
- **Who:** anybody with a checkout.

### 7.2 Previews reaching the API — IMPLEMENTED, NOT VERIFIED

- **What is implemented:** `ELEVATOR_SIM_ALLOW_ORIGIN` is a comma-separated allowlist, the viewer's
  origin must be a **member** of it, and one entry is the word `previews`, which
  `packages/server/src/http/static.ts#previewOriginsFor` expands from `ELEVATOR_SIM_ORIGIN` rather
  than from anything an operator types.
- **What is not:** the deployed app still carries the one-origin form, and the permitted half of the
  cross-origin path has not met a browser from the production origin. The **refusal** half has: from a
  preview hostname, Chrome blocked the calls at preflight and the page said the leaderboard server
  could not be reached rather than claiming the server was down.
- **What a pass looks like:** re-run `docs/16` § 3.3 with `previews` appended to the allowlist, then
  open a pull request preview and sign in, load the board and post a run. **Note the ordering trap:**
  `infra/azure/swa/provision.sh` compares the deployed allowlist against the site's origin as an
  **equality**, so appending `previews` makes that script refuse to arm. Turning previews on takes an
  `infra/` change as well as the deploy.
- **Who:** an Azure operator.

### 7.3 The second copy of the page

- **What a pass looks like:** `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$api/"`
  answers **302** to `$site`. Every non-`/api/` `GET` on the API is a redirect, derived from the two
  origin variables rather than being a fourth value that can disagree with them.
- **Why this is on the list:** the split left a second copy of the page on the internet and it served
  the previous product for five days — two hostnames, two 200s, two different products, and no status
  code anywhere distinguishing them. **It was found by a player.**
- **Who:** anybody with `$api` and `$site`.

---

## 8. The day-of sequence

1. **Run everything in § 1's order that needs no credential.** `npm run typecheck` and
   `npx vitest run --project core --project viz --project experiments --project server` green, plus
   the browser tier.
2. **Take the exact deployed-version set, once, by hand.** § 3.2 explains why the matrix uses a
   superset instead. On a full clone:
   ```sh
   git log --follow -S 'SESSION_SCHEMA_VERSION =' --format='%H %ad %s' --date=short \
     -- packages/viz/src/persist/types.ts
   ```
   Bound it at the date the deploy switch was set — `.github/workflows/deploy-viz.yml`'s header
   carries it — and record the versions that were current while a deploy ran. Record the answer in
   the launch record, not in this file: it is a fact about a day, and a fact about a day written into
   a checklist is the next stale constant.
3. **Deploy from `main`** and watch the run to completion (§ 6.1).
4. **Probe what is served, not what the run said** (§ 6.2). A green run is a report about an upload.
5. **Load the page** on at least one browser from each of § 2.2's rows you intend to claim, and
   record the browser, the version and the date.
6. **Sign in, post a run, read the board** (§ 5.2's manual half).
7. **Read the API's own account of itself** — `az containerapp logs show … | grep elevator-sim-fault`
   — and require nothing.
8. **Record every answer beside its item**, with the date and the build id. An item recorded without
   a date is a claim; § 2's own matrix says the same thing about its tiers.

---

## 9. What has been verified by running it, and what has not

This section is the point of the document, and it holds to the standard
[`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 9 sets.

### Verified, by running it on this tree

| claim | how |
|---|---|
| Every version the session slot has ever written migrates, and the result survives a save, a reload and a played day | `packages/viz/src/persist/migrationMatrix.test.ts`, **23 passed** |
| The same for the profile slot's five versions and the career slot's one | Same file |
| A newer envelope is refused on all three slots, by version, naming what it found | Same file |
| The matrix goes red when a migration arm is deleted, when a step-down is neutered, when the version is bumped with nothing else, and when the refusal is disabled | § 3.4, four controls, output recorded there |
| The matrix's own row derivation cannot silently produce an empty set | `versionsUpTo`'s guard — added because it had already done so once |
| The workspace typechecks and the four node projects are green with this file in them | `npm run typecheck`, then `npx vitest run --project core --project viz --project experiments --project server`, on the commit that added this document |

### Not verified — reasoned about only

1. **No item in this document has been executed against a launch.** That is #243 AC2 and it is what
   § 10 says about it.
2. **No step of the revert procedure has been run** (§ 6.3). Its duration is unknown, which is what
   makes it a procedure nobody can plan around.
3. **No browser other than Chromium has loaded this product** (§ 2.2).
4. **No load harness has driven the leaderboard** (§ 5.2), and the cooldown's per-process scope has
   not been exercised against more than one replica.
5. **Time to interactive and main-thread blocking are uninstrumented** (§ 4.2). Page weight is not.
6. **No save has been migrated out of a real browser's storage by any check here** (§ 3.6 item 1).
7. **The alert rule does not exist** (§ 6.5), so every fault line this product writes is read only by
   somebody who goes looking.
8. **The permitted half of the cross-origin path has not met a browser from production** (§ 7.2), and
   nothing in this document moves it.

---

## 10. The acceptance criteria, one at a time

| # | criterion | state | what it still needs, and from whom |
|---|---|---|---|
| **AC1** | Checklist written and merged | **this document** | Nothing. It merges with the branch that carries § 3's matrix |
| **AC2** | Every item executed and recorded before launch | **open** | A launch. Somebody runs § 8 and records the answers with dates. No credential closes this from a checkout |
| **AC3** | Save migration verified from every schema version that has been deployed | **met, on a superset** | § 3 is mechanised and green. § 8 step 2 narrows the superset to the exact deployed set and is a one-command job for anybody with a full clone. § 3.5 is the manual browser half and needs `$site` |
| **AC4** | Rollback rehearsed on the production deployment | **open** | An Azure operator, the Static Web App, its federated identity and the Container App. The procedure is `docs/16` § 11 and its § 11.5 lists the six things a rehearsal has to observe. **The written procedure is not the rehearsal**, and this document does not claim otherwise |
| **AC5** | Preview environments can reach an API | **implemented, unverified** | An Azure operator. The server rule ships and its refusals are pinned by a run; the deployed app still carries the one-origin form, and `provision.sh`'s equality check has to move in the same change (§ 7.2) |

**AC4's framing is worth one sentence of correction, because the issue's own analysis flagged it.**
Until `docs/16` § 11 existed, four places in this repository called the disarm command *the
rollback*, and a rehearsal whose subject was that command would have recorded a recovery that
recovers nothing. The procedure had to be written before it could be rehearsed; it is written now,
and rehearsing it is what remains.

---

## Sources

- [`docs/16-static-site-deployment.md`](16-static-site-deployment.md) — § 1 the cold-load figures,
  § 3 the three origin values, § 9 the verified/unverified split this document holds to, § 11 the
  revert procedure and § 11.5 its account of what it has been through.
- [`docs/40-incident-runbook.md`](40-incident-runbook.md) — § 0 what is watched, § 1 severity, § 2
  first response, § 4 the alert rule that does not exist.
- [`docs/31-support-matrix.md`](31-support-matrix.md) — the four tiers, and § 7's account of which of
  them a red run defends.
- [`docs/22-charter.md`](22-charter.md) — the cold-load and blocking budgets § 4.2 measures one of.
- `packages/viz/src/persist/migrationMatrix.test.ts` — § 3's matrix, its derivation and its controls.
- `packages/viz/src/persist/types.ts`, `packages/viz/src/everyday/profile.ts`,
  `packages/viz/src/campaign/careerPersist.ts`, `packages/viz/src/telemetry/consent.ts` — the four
  versioned save slots. The matrix drives the first three; consent's single version is read by
  `readConsent`, which treats a mismatch as *unasked* rather than refusing, so it has no row.
- `scripts/dead-page.mjs` — § 6.2's probe, and its own account of what it cannot see.
- `packages/server/src/main.ts`, `packages/server/src/http/static.ts` — § 7's boot refusals.
- [§ D405](../DECISIONS.md) — why this document's own reasoning is recorded here rather than as a
  separate entry: it binds no code and moves nothing already recorded, so this file is the record.
