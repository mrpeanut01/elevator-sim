# The launch record — 2026-09-15, and it is a dress rehearsal rather than a launch

**Nothing was launched, deployed or touched in production to produce this document.** It is what
[`docs/41-launch-checklist.md`](41-launch-checklist.md) produced when somebody with a checkout and no
credentials ran every item they could reach, on `fb15704` **plus this lane's own changes**, and wrote
down the answer to each — including *not executable here*, with the reason, for the ones they could not.

GitHub issue **#243** AC2 asks for *every item executed and recorded before launch*. **This does not
discharge it**, for two reasons that are worth stating before the table rather than after it:

1. **An answer is a fact about a day.** These were taken on 2026-09-15 against one commit. AC2's
   *before launch* means the launch's own commit, on the launch's own day.
2. **The items a checkout cannot reach are the ones that carry the launch risk** — the browsers
   nobody has opened the page in, the deployed page, the API, and putting a previous build back.
   **Thirty-two rows below: fifteen executed, twelve not executable here, five not built.** The
   twelve are not the cheap ones.

What it is for: the apparatus has now been **run** rather than described, so a launch operator
inherits a list of which instruments work, what they print, and which of them go red when they
should. Every row names the command, so any row can be re-run rather than believed.

---

## 0. What the three verdicts mean

| | meaning |
|---|---|
| **EXECUTED** | Run here, on this tree, on 2026-09-15. The command is in the row and the result is what it printed |
| **NOT EXECUTABLE HERE** | The apparatus exists and this environment cannot point it at its subject. The reason is in the row, and it is a **measured** reason wherever one was available |
| **NOT BUILT** | There is no apparatus. `docs/41` says what building one would mean; this document does not repeat it |

**No row is marked EXECUTED on the strength of a test that exists.** A file that would have decided
the item, had it been run, is not an execution — that distinction is the reason this document exists
rather than a set of ticks on the checklist.

---

## 1. The environment this was run in, because two of its properties decided two rows

| | |
|---|---|
| Tree | `fb15704` (wave Z integrated) **with this lane's working tree on top** — the runs were taken before the commit that carries them, which is the only order in which a record can report its own suite |
| Checkout | **shallow — 51 commits, oldest `479116e` (2026-09-10)**, measured with `git rev-parse --is-shallow-repository` and `git rev-list --count HEAD` |
| Credentials | none, and this is measured rather than assumed: `command -v az` and `command -v gh` both find **nothing installed**. So `$site` and `$api` — which § 0.1 of the checklist reads back off the live resources rather than typing — cannot be resolved at all, and every row that needs either is unreachable before any question of permission arises |
| Rule in force | this lane must not touch a live deployment, so no row was attempted against production even where a command would have run |

The shallow checkout decides § 8 step 2 below, and the absent credentials decide every row that
needs `$site` or `$api`. Both are recorded as measurements rather than as *could not*.

---

## 2. The record

### The browser matrix (`docs/41` § 2)

| item | verdict | evidence |
|---|---|---|
| § 2.1 Tier 1 — Chromium | **EXECUTED** — **48 files, 306 tests, 0 failures, exit 0** in 803 s, against a real `vite build` served by `preview()` in the Chromium headless shell | `npx vitest run --project viz-browser` |
| § 2.2 Tiers 2 and 3 — every other browser | **NOT EXECUTABLE HERE** | No Firefox, Safari, Edge or mobile browser exists in this container, and the deployed `$site` is unreachable without `az`. `docs/31-support-matrix.md` § 1's tier-2 table wants a browser, a version and a date against each row, and a launch that has not opened the page on an iPhone once is launching on an untested platform |
| § 2.3 The viewport floor at 360 px | **EXECUTED** — inside the browser tier above, which is green | `packages/viz/src/everyday/viewportGates.browser.test.ts` and `smallScreen.browser.test.ts`, in the browser tier |

### Save migration (`docs/41` § 3)

| item | verdict | evidence |
|---|---|---|
| § 3 The migration matrix | **EXECUTED** — 1 file, **23 tests, 0 failures** | `npx vitest run --project viz packages/viz/src/persist/migrationMatrix.test.ts` |
| § 3.5 A real player's upgrade, by hand in a browser | **NOT EXECUTABLE HERE** | Needs `$site` and a browser with a real saved week in its storage. `docs/41` § 9 item 6 already records that no save has been migrated out of a real browser's storage by any check in the repository |
| § 8 step 2 The **exact** deployed version set | **NOT EXECUTABLE HERE, and this one is measured** | `git log --follow -S 'SESSION_SCHEMA_VERSION =' -- packages/viz/src/persist/types.ts` walks history this checkout does not hold: it is shallow at 51 commits, and the walk stops at the boundary commit `479116e` with `error: Could not read …` rather than with an empty result. § 3.2's superset stands, and narrowing it is a one-command job **on a full clone** |

### The cold-load budget (`docs/41` § 4)

| item | verdict | evidence |
|---|---|---|
| § 4.1 Page weight under 1 240 kB gzipped | **EXECUTED** — inside the browser tier above, which is green, so the gzipped artifact is at or under the 1 240 kB bar **and under the 90 % line at 1 116 kB**, since the tighter assertion is in the same file. **The measured figure is not published here**: the test asserts and does not print one a reader could quote, and `console.log` is intercepted on this toolchain (`CLAUDE.md`, the same trap that made `honesty/measure.corpus.test.ts` necessary) | `packages/viz/src/everyday/builtBundle.browser.test.ts`, in the browser tier |
| § 4.2 Time to interactive, main-thread blocking | **NOT BUILT** | Unchanged by this run. `docs/41` § 4.2 says what building it would mean |
| § 4.3 The API's own cold start | **NOT EXECUTABLE HERE** | Needs `$api`, which needs `az`, and a container that has scaled to zero |

### The leaderboard (`docs/41` § 5)

| item | verdict | evidence |
|---|---|---|
| § 5.1 The verifier's correctness | **EXECUTED** — green inside the four-project run, and re-run by name together with `errors/faults.test.ts`, `http/boot.test.ts`, `store/migrations.test.ts` and `leaderboard/verify.test.ts`: **4 files, 99 tests, 0 failures** | `npx vitest run --project server` |
| § 5.2 Behaviour under real load | **NOT BUILT** | There is no load harness. The cooldown's per-process scope is still unexercised against more than one replica |
| § 5.3 The store's own migrations | **EXECUTED** — green inside the four-project run, and re-run by name together with `errors/faults.test.ts`, `http/boot.test.ts`, `store/migrations.test.ts` and `leaderboard/verify.test.ts`: **4 files, 99 tests, 0 failures** | `packages/server/src/store/migrations.test.ts`, inside the server project. **The other half of § 5.3 — a green 00:10 UTC run of `seed-boards.yml` and its log — is NOT EXECUTABLE HERE**: it needs the workflow's run history and the Container App's log stream |

### Deploy, and putting a previous build back (`docs/41` § 6)

| item | verdict | evidence |
|---|---|---|
| § 6.1 The deploy path | **NOT EXECUTABLE HERE** | It is a push to `main` and a run of `deploy-viz.yml`. This lane does not push, and the run needs the repository's own Actions |
| § 6.2 The dead-page probe, pointed at production | **NOT EXECUTABLE HERE** | `node scripts/dead-page.mjs "$site" "$api"` needs both origins. Its decision half **was** executed — see the row below |
| § 6.2 The dead-page probe's decisions | **EXECUTED** — green inside the four-project run, and re-run by name: 0 failures | `packages/experiments/src/validation/deadPage.test.ts`, inside the experiments project |
| § 6.3 Reverting the live site — **the git half** | **EXECUTED** | `node scripts/rehearse-revert.mjs HEAD~4`, `HEAD~20`, `HEAD~50`: each reverts clean, and the tree comparison `docs/16` § 11.2 step 2 requires prints nothing. A fourth run against a ref that is not an ancestor **exits 1** with four failed observations, which is the control that makes the other three mean something. Two failure modes were found — see § 3 below |
| § 6.3 Reverting the live site — **the production half** | **NOT EXECUTABLE HERE** | The upload, the branch policy, the propagation time and the save-clearing in a browser need the Static Web App, its federated identity and the Container App. `docs/16` § 11.5 lists them. **#241 AC2, #242 AC4 and #243 AC4 stay open on this row** |
| § 6.4 The API half | **NOT EXECUTABLE HERE** | `scripts/deploy-azure.sh` even in its what-if form reads the running app |
| § 6.5 Alerting | **NOT BUILT** | The alert rule does not exist and nothing in this repository can create one. [`docs/40-incident-runbook.md`](40-incident-runbook.md) § 4 is its whole specification, and § 0's table marks it NOT ARMED |

### The API origin configuration (`docs/41` § 7)

| item | verdict | evidence |
|---|---|---|
| § 7.1 What the API refuses at boot | **EXECUTED** — green inside the four-project run, and re-run by name together with `errors/faults.test.ts`, `http/boot.test.ts`, `store/migrations.test.ts` and `leaderboard/verify.test.ts`: **4 files, 99 tests, 0 failures** | `packages/server/src/http/boot.test.ts`, inside the server project — it starts the **built** server with a wrong allowlist and requires the process to stop without binding a port |
| § 7.2 Previews reaching the API | **NOT EXECUTABLE HERE** | Implemented and unverified, unchanged by this run. It needs an Azure operator, and `provision.sh`'s equality check has to move in the same change |
| § 7.3 The second copy of the page | **NOT EXECUTABLE HERE** | `curl "$api/"` needs `$api`. This is the row that was found by a player, so it is worth a launch operator's minute |

### The suite (`docs/41` § 8 step 1)

| item | verdict | evidence |
|---|---|---|
| `npm run typecheck` | **EXECUTED** — `tsc -b`, **exit 0** | Run on this tree |
| The four node projects | **EXECUTED** — **284 files passed, 13 skipped; 5 101 tests passed, 185 skipped; exit 0**, in 3 552 s on a shared machine at load ~22 | `npx vitest run --project core --project server --project cli --project experiments` |
| The viz project | **EXECUTED** — **298 files passed, 9 skipped; 6 336 tests passed, 24 skipped; exit 0**, in 2 457 s. **The first attempt did not fail — it was killed**: the process was terminated at about 45 minutes with no summary line and no assertion, on a machine carrying forty `vitest` processes from other work. Re-run unchanged, it passed. A kill is not a red run and is not recorded as one | `npx vitest run --project viz` |
| The browser tier | **EXECUTED** — **48 files, 306 tests, 0 failures, exit 0** in 803 s, against a real `vite build` served by `preview()` in the Chromium headless shell | `npx vitest run --project viz-browser` |
| § 8 steps 3–7 — deploy, probe, load the page on real browsers, sign in and post a run, read the API's log | **NOT EXECUTABLE HERE** | All five need the live deployment. They are the day-of sequence and they are the point of AC2 |

### The incident instruments (`docs/40` § 0)

| item | verdict | evidence |
|---|---|---|
| The server writes a fault line on every failure it survives or dies of | **EXECUTED** — green inside the four-project run, and re-run by name together with `errors/faults.test.ts`, `http/boot.test.ts`, `store/migrations.test.ts` and `leaderboard/verify.test.ts`: **4 files, 99 tests, 0 failures** | `packages/server/src/errors/faults.test.ts` and `http/boot.test.ts`, inside the server project. The literal an alert rule keys on is asserted **as a literal**, by a spawned process that fails for real |
| The deployed page is probed after every upload | **NOT EXECUTABLE HERE** | The step exists in `deploy-viz.yml`'s `deploy` job; running it needs a deploy |
| A player can send a report naming how many faults the page hit | **EXECUTED** — **298 files passed, 9 skipped; 6 336 tests passed, 24 skipped; exit 0**, in 2 457 s. **The first attempt did not fail — it was killed**: the process was terminated at about 45 minutes with no summary line and no assertion, on a machine carrying forty `vitest` processes from other work. Re-run unchanged, it passed. A kill is not a red run and is not recorded as one | Inside the viz project |
| An alert rule that reads the fault lines and tells a person | **NOT BUILT** | § 4 of the runbook is the handover. No subscription id, workspace id or connection string may enter this tree, so it cannot be created from here even in principle |
| Client faults reaching a server at all | **NOT BUILT, deliberately** | [§ D588](../DECISIONS.md): refused pending `docs/26-telemetry-and-privacy.md` § 19 item 6, the lawful basis. It is a refusal with a reason and a dependency, not an omission |

---

## 3. What running it found, which is the part a second reader should keep

**Three things, and none of them was visible from reading the checklist.**

1. **The revert's range form can abort part-way, leaving a partial revert staged.**
   `git revert --no-commit <target>..<tip>` refuses a merge commit — and it refuses *at* the merge,
   having already reverted and staged every commit newer than it, with no sequencer state to
   `--continue` or `--abort`. The next command in `docs/16` § 11.2 is `git commit`. In an incident
   that is a green deploy of a half-reverted tree. Measured on a synthetic merge in a throwaway
   clone, because this repository's reachable history is linear and could not produce one.
2. **A shallow checkout cannot revert at all**, and git says so as *unknown revision*, which reads
   like a typo rather than a truncated history. `actions/checkout` defaults to depth 1.
3. **This checkout's shallowness is itself a checklist answer.** § 8 step 2 is the row that narrows
   the migration matrix's superset to the exact deployed set, and it is the cheapest item on the
   whole list — on a full clone. Here it fails on the history rather than on the code, which is a
   different answer from *it passed* and from *it failed*.

**And one non-finding worth recording.** Every mechanised item that could be run was run, and the
apparatus behaved: the rehearsal harness goes red on a bad range, and nothing in the checkout-side
list had to be repaired first. The list's weakness is not the instruments — it is how many of the
rows have none.

**One thing about the runs themselves, because a launch operator will meet it.** These took hours
rather than minutes — the four node projects 3 552 s, the viz project 2 457 s, the browser tier
803 s — on a machine carrying forty other `vitest` processes, and the viz project's **first** attempt
was killed part-way with no summary and no assertion. That is not a red run and is not recorded as
one; it was re-run unchanged and passed. § 8 step 1 is *"run everything that needs no credential"*,
and its cost on a contended machine is the better part of two hours, which is worth knowing before a
launch window is planned around it.

---

## Sources

- [`docs/41-launch-checklist.md`](41-launch-checklist.md) — the list these answers are against, and
  § 0.2's split by credential, which predicted exactly which rows would be unreachable here.
- [`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 9 and § 11.5 — the
  verified/unverified voice this document is written in, and the revert procedure's own split.
- [`docs/40-incident-runbook.md`](40-incident-runbook.md) § 0 — the instrument table these rows
  re-check.
- `scripts/rehearse-revert.mjs` — § 6.3's harness, and the register of what it does not rehearse.
- [§ D587](../DECISIONS.md) — why the revert is rehearsed in halves.
- [§ D588](../DECISIONS.md) — why client faults are sent nowhere, and what that refusal waits on.
