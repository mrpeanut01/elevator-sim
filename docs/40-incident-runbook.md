# The incident runbook — what is watched, what it means, and what to do about it

GitHub issue **#242**, AC4. Written to be read **during** an incident, so the procedures come before
the reasoning and every step names the file it is derived from.

> **Read § 0 first if you have never used this.** Two of the five things below are not armed yet, and
> a runbook that let you find that out mid-incident would be worse than none.

---

## 0. What is actually watched today, and what is not

This section is in [`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 9's voice,
which exists because a previous `infra/` in this repository published a figure that did not reproduce
from its own template, and what let it survive review was that its untested parts read exactly like
its tested ones.

| # | The instrument | State | Where it lives |
|---|---|---|---|
| 1 | **The server writes a fault line on every failure it survives or dies of** | **Armed and tested by a run.** `boot.test.ts` spawns the built entry point, makes it fail for real, and asserts the exact line on standard error | `packages/server/src/errors/faults.ts`, `http/serve.ts`, `main.ts` |
| 2 | **The deployed page is probed after every upload** | **Armed.** A step in the deploy job, failing the run when the served page is not usable | `scripts/dead-page.mjs`, `.github/workflows/deploy-viz.yml` |
| 3 | **A player can send a report that names how many faults the page hit** | **Armed.** The count travels with the problem report the player composes | `packages/viz/src/everyday/faults.ts`, `everyday/support.ts` |
| 4 | **An alert rule that reads (1) and tells a person** | **NOT ARMED.** Nothing in this repository creates one, and nothing here has credentials to. § 4 is what a human has to do | — |
| 5 | **Client faults reaching a server at all** | **NOT BUILT, and deliberately.** § 5 is why | — |

**So the honest summary is: two automatic detections, one player-driven one, and no page.** Item 4 is
the gap that matters most, and the reason it is a gap is that creating it needs a subscription rather
than a commit.

---

## 1. Severity

Three levels. The test is **what a player can still do**, never how alarming the cause looks.

| | Name | The test | Response time | Examples |
|---|---|---|---|---|
| **S1** | **The page is dead** | A player who loads the site cannot reach a playable screen at all | Start now. Do not wait for a diagnosis | The deployed bundle does not load; the data manifest is not served; the boot throws |
| **S2** | **A route is dead** | The page works and one thing on it does not | Same day | Sign-in fails; the board does not load; posting a run is refused for everybody |
| **S3** | **Something is wrong and everything works** | A number looks off, a screen is ugly, a refusal fires when it should not | Next working session. It is an issue, not an incident | A figure disagrees between two screens; a stale sentence |

**Two rules that stop this being three names for the same thing.**

- **S1 is decided by loading the site, not by reading a log.** A run that went green can still have
  put a dead page up — that is the whole reason § 0's item 2 exists — and a stream full of fault
  lines can sit under a site that is working perfectly for everybody, because a fault line is one
  request failing.
- **Nothing is S1 because it is frightening.** A database outage is S1 only if the page dies with it,
  and it does not: the page is a static bundle on a CDN and the API is a separate deployment, so an
  API that is entirely down is **S2** — every account, board and challenge surface dead-ends, and
  the game still plays. That split is the deployment's whole shape
  ([`docs/16`](16-static-site-deployment.md) § 1) and it is the most common way this table gets read
  wrongly.

---

## 2. First response

**The order is fixed and the first step is not a diagnosis.**

### Step 1 — Establish what a player sees. One command.

```sh
site="https://$(az staticwebapp show -n elevator-sim-viz -g elevator-sim-viz \
  --query defaultHostname -o tsv)"
api=$(gh variable list --json name,value -q '.[] | select(.name=="ELEVATOR_SIM_API_ORIGIN").value')

node scripts/dead-page.mjs "$site" "$api"
```

That is the same check the deploy job runs, pointed at production by hand. It prints either *the
served page is alive* or a list of everything wrong with it, and it exits non-zero on the second.
**Its answer is the severity call**: issues reported means **S1**; nothing reported means the page is
alive and you are looking at S2 or S3.

It does not catch a bundle that is served correctly and throws — no HTTP probe can. If it reports
nothing and players still say the page is dead, load the site in a browser and read the console; that
is the one case in this document with no instrument.

### Step 2 — Establish what changed. Two commands.

```sh
gh run list --workflow=deploy-viz.yml --branch main --limit 10 \
  --json createdAt,headSha,conclusion,databaseId
gh run list --workflow=ci.yml --branch main --limit 5 \
  --json createdAt,headSha,conclusion
```

Almost every S1 in a product shaped like this one is *the last deploy*. If the newest deploy is
minutes old, § 3 is the response and the diagnosis can wait until the page is back.

### Step 3 — Read the API's own account of itself.

```sh
az containerapp logs show -n elevsim-app -g elevator-sim --tail 200 \
  | grep elevator-sim-fault
```

`elevator-sim-fault` is the marker every fault line begins with. What a line carries and what it
deliberately does not:

```
elevator-sim-fault at=request kind=TypeError method=GET route=/api/board
elevator-sim-fault at=boot kind=Error
```

- `at` is one of `request`, `boot`, `unhandled-rejection`, `uncaught-exception`.
- `kind` is the error's class and nothing else. **There is no message and no stack**, on purpose — a
  thrown message here is often built out of what the request carried, and this line is written to a
  log a person will paste into an issue. `packages/server/src/errors/faults.ts` has the argument.
- `route` is the shape of the path, with anything that is not one of this API's own route words
  reduced. So a probe hitting `/wp-admin/setup-config.php` reads `route=/wp-admin/:v`.

**What this means for reading a stream.** `at=boot` is the loud one: the process did not come up, and
on this deployment there is no process left to ask afterwards. A burst of `at=request` on one `route`
is a broken route (S2). A scattering across many routes is usually the store.

Beside that stream, the one ordinary line a healthy start writes is
`elevator-sim listening on … — serving its own page`. It is deliberately not matched by the fault
marker; on a deployment at `minReplicas: 0` it appears constantly and means nothing is wrong.

### Step 4 — Decide, and say so where the next person will look.

If it is S1 and a recent deploy is the plausible cause, go to § 3 **before** finishing the diagnosis.
Putting the previous build back takes minutes and does not destroy any evidence: the commit you are
reverting is still in the history and the run is still in the log.

---

## 3. Rollback

> **The rollback is [`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 11 and is
> not repeated here.** That section is the procedure; this one exists to say three things about it
> that an operator needs before they open it.

**One — the disarm command is not the rollback, and reaching for it makes an incident permanent.**
`gh variable delete AZURE_SWA_NAME` stops every *future* deploy. The page a player is loading is
unchanged by it and stays unchanged — and the only job that can write to the site is gated on that
variable, so deleting it switches off the one mechanism that could replace the bad page. Four places
in this repository called that command *the rollback* until § 11 was written.

**Two — a revert is a revert *forward*.** The production environment accepts only `main`, and the
deploy job builds `main`'s tip, so putting an older tree back means committing a revert onto `main`
and dispatching the workflow. § 11.2 is the exact sequence.

**Three — one step of it is irreversible, and it is not the obvious one.** If the target commit
predates a bump in the saved-session schema version, a player who loads the reverted build **once**
has their saved week cleared, and reverting forward again does not bring it back. § 11.2 carries the
command that checks for this. That is a decision for a human, and it is why the procedure does not
end in a single command.

**And the thing an operator should know before they rely on any of it: no step of § 11 has ever been
run.** § 11.5 says so in terms — it is derived from the workflows and the scripts and from nothing
observed, including the time it takes. An incident procedure whose duration is unknown is a procedure
nobody can plan around. Rehearsing it is #241 AC2, #242 AC4 and #243 AC4, and it needs the live
resources; **this document does not close that, and says so rather than reading as though it had.**

### The API side

A page revert does not move the API, and nothing in `.github/workflows/` deploys the API at all —
that is `scripts/deploy-azure.sh`, run by hand from a checkout of the target commit. § 11.4 is the
procedure and the five properties of that script that decide whether it is safe. Which half goes
first, when both are needed, **is not settled by anything in this tree**.

---

## 4. What a human has to do, and it cannot be done from a checkout

**The alert rule does not exist.** Everything above produces a line in a log; nothing turns that line
into somebody's notification. `.github/workflows/seed-boards.yml` has said so in its own header since
it was written — a failed run is a red workflow *"until #242 gives alerts a destination"*.

What is needed, and it is one rule:

- **Source**: the Container App's log stream (`elevsim-app`, resource group `elevator-sim`).
- **Condition**: any line containing `elevator-sim-fault`. That literal is the whole contract; it is
  asserted as a literal by `packages/server/src/errors/faults.test.ts` and by a spawned process in
  `packages/server/src/http/boot.test.ts`, precisely so that a rule written against the text cannot
  be silently broken by a refactor.
- **A second, tighter rule is worth having**: `elevator-sim-fault at=boot`, at any count above zero.
  A boot fault means the revision did not come up.
- **Destination**: a human. This repository has no opinion about which channel, and no credentials
  to create one.

**Two things this document will not do.** It will not put a subscription id, a workspace id or a
connection string in the tree — there are none here today and none may be added. And it will not
pretend the rule exists: § 0's table says NOT ARMED, and when somebody creates it, that row and this
section are what they update.

**How to verify it once it exists**, without waiting for a real incident: the failure `boot.test.ts`
uses is available in production terms — a revision started with a bad configuration exits 1 and
writes `elevator-sim-fault at=boot kind=Error` before it goes. That is a real error, triggered on
purpose, and it is what AC3's *verified alert path* means once there is a path to verify.

---

## 5. Why client errors are not sent anywhere, and what that costs

**The decision, stated rather than implied.** A fault in a player's browser is counted on the page
and travels only in a report **the player composes and sends**. Nothing is transmitted
automatically, to this project's API or to anywhere else.

**It is not the CSP that stops it.** The deployed page ships `connect-src 'self'`, widened at build
time to exactly one origin — the API's — and the deploy workflow compares that list for equality. So
a **third-party** monitor is blocked by the page's own policy before any code runs, and adding one
means editing that allowlist in the workflow, which is a deliberate reviewable diff and a policy
decision the product owner has flagged and not made. But the **first-party** route is permitted and
reachable today. The transport was never the blocker.

**What stops it is that nobody has decided on what basis it may be collected.**
[`docs/26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) § 14.2 lists four options for error
reports and chooses none, marked for professional review; § 16.2's retention row for them is
**DRAFTED** and blank; and § 13.4's second obligation requires a horizon *before* the feature ships.
Sending would mean answering, by writing code, a question this repository has written down as not its
own to answer.

**And the consent next door is not a way round it.** The telemetry recorder has a transport, a
batcher and a consent slot. Routing error reports through them would be quiet in the worst way: a
player who agreed to *measurement* did not agree to *crash reports*, and § 14.2's option C exists
because those two are one row only because they share a transport. There is also a decisive
engineering reason — the recorder mints its session at shell mount and refuses to send without an
answer, so on the failure this whole issue is about, a page that died before it mounted, **the
instrument would be absent at exactly the moment it is needed.**

**What that costs, said plainly.** A player who hits an error and says nothing is a player nobody
hears about. That case is open, it is the larger half of #242's *"nobody finds out"*, and closing it
needs a ruling rather than a commit.

**What is bought instead.** A player who does say something sends a report that already carries the
crowd number, the building, the dispatcher, the day, the build, the browser — and now how many faults
the page hit and whether they landed while it was starting up. A report from a dead page is
distinguishable from a report about a lift going to the wrong floor, which it was not before.

---

## 6. Reading a fault count in a report

The report line reads, for example:

```
Problems this page hit: 3 while the game was starting up
```

- **while the game was starting up** — faults before the shell mounted. This is the dead-page family,
  and it is the strongest signal in the whole document that what you are reading is #242's own class
  of defect. Pair it with § 2 step 1 against the build named in the same report.
- **after it had started** — the page came up and something failed while it was being played.
- **99 or more** — the counter stopped there. A fault inside a render loop fires every frame, so this
  means *constantly* rather than *ninety-nine*.
- **none** — the page counted and found nothing.
- **the line is absent** — nothing was counting. Not the same claim as *none*, and the report
  deliberately does not conflate them.

There is no error class and no stack in that line, for the reason § 5 gives and one more: the report
becomes a **public issue in a public repository**, and the surface promises the player that nothing
about them is attached. A class name would also be internal notation on a screen a player reads,
which the charter's own gate forbids. The cost is real — a maintainer gets a count rather than a
classification — and it is the price of the destination.

---

## 7. What this document does not cover

Named rather than left to be discovered.

1. **The alert rule** (§ 4). Not armed, needs a subscription.
2. **A rehearsal of the rollback** (§ 3). No step of `docs/16` § 11 has been run, including its
   duration.
3. **Client faults reaching a server** (§ 5). Needs a ruling, not a commit.
4. **A page for the API's own health** beyond the fault lines. No uptime check, no synthetic request,
   no dashboard. `GET /api/wake` exists and nothing calls it on a schedule except a player's browser.
5. **The database.** Nothing here reads its metrics, and a store that is slow rather than down
   produces no fault line at all — the request succeeds.
6. **A severity for data loss.** § 1 grades by what a player can do, and a silent corruption is worse
   than an outage by every measure except that one. It has no row because nothing detects it.

---

## Sources

- [`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 11 — the revert procedure this
  document points at rather than restates, and § 11.5's account of what has been run.
- [`docs/26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) § 13.4, § 14.2, § 16.2 — the
  obligations and the undecided basis that § 5 turns on.
- [`docs/27-flow-maps.md`](27-flow-maps.md) § 3 F0 — the dead-page state as a player meets it.
- [`docs/05-roadmap.md`](05-roadmap.md) — the boot failure with 2 100 tests green over it.
- `packages/server/src/errors/faults.ts` — what a fault line carries and what it refuses to.
- `packages/viz/src/everyday/faults.ts` — the same argument on the client, and what it costs.
- `scripts/dead-page.mjs` — the probe § 2 step 1 runs, and its own account of what it cannot see.
