# Decision log

Decisions made during orchestrated delivery, with the alternatives considered. Project-technical
decisions that belong to a doc are recorded there as well, per
[`CLAUDE.md` § Working agreements](CLAUDE.md).

---

## D1 — Work the review register before any tuning or measurement campaign

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** [`docs/08-review-findings.md`](docs/08-review-findings.md) carries 21 open findings.
Three of them (#9/#10 predictor horizon, #12/#13 late-arrival reopen, #21 overload threshold) are
declared Phase 7 search dimensions that provably cannot move any objective, and one (#14) means
every published interval past n=25 uses the normal quantile while being labelled paired-t.

**Alternatives.** (a) Start Phase 6/8 immediately and fix findings opportunistically.
(b) Fix the register first. (c) Fix only the critical finding.

**Chosen:** (b). **Why:** a tuning campaign run against the current tree spends 50–200 replications
per evaluation on at least three exactly-flat dimensions and reports whichever value the draw held
as a tuned result — and every interval it publishes is anticonservative. Fixing afterwards means
re-running the campaign. `docs/07-handoff.md` states this ordering explicitly.

**Impact.** Wave 1 is register work plus the Phase 7 seam. Phases 6 and 8 move to waves 3 and 4.

---

## D2 — Phase 4 (visualization) runs in parallel with wave 1, not after it

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** Phase 4 creates a new `packages/viz` and consumes `core`'s public API. The roadmap's
sequencing notes say Phase 4 can run in parallel once Phase 2 is complete; Phase 2 landed.

**Alternatives.** (a) Serialize after the register. (b) Parallelize now.

**Chosen:** (b), scoped to a foundation task (T5) rather than a fan-out. **Why:** the file set is
disjoint from every other wave-1 task (a new package plus three root config files), so it carries
no merge risk, and it is the longest-lead item with a UX cycle attached. Fanning out UI features
before the contract is locked is exactly what the plan's planning-first rule forbids, so T5
delivers the contract and skeleton and wave 2 fans out against it.

**Impact.** `tsconfig.json`, root `package.json` and `vitest.config.ts` are owned by T5 for wave 1.

---

## D3 — `sim/simulation.ts` has a single named owner per wave

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** The roadmap records that Phase 5 shipped four dead seams simultaneously because work
was partitioned by module directory and `sim/simulation.ts` appeared in no agent's ownership list.

**Alternatives.** (a) Let any task edit it and resolve conflicts at merge. (b) Assign it to one
task per wave. (c) Orchestrator owns it and applies wiring edits itself.

**Chosen:** (b) — T3 owns it for wave 1. **Why:** (a) reproduces the documented root cause; (c)
puts the orchestrator in the critical path of every task. Naming an owner makes the seam somebody's
definition of done, which is the fix the roadmap asks for.

**Impact.** T1, T2, T4 and T5 may not write `sim/simulation.ts`. Any wiring they need is requested
from T3.

---

## D4 — Worktrees get a `node_modules` symlink rather than their own install

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** Concurrent tasks run in git worktrees, which have no `node_modules`. The repo is an
npm workspace whose `vitest.config.ts` aliases cross-package specifiers to package *source*, and
`packages/*/node_modules` hold nothing but a `.vite` cache.

**Alternatives.** (a) `npm install` per worktree. (b) Symlink the root `node_modules`.

**Chosen:** (b). **Why:** the alias config means no worktree needs a built `dist` of a sibling
package to run tests, so a shared dependency tree is sufficient and avoids five redundant installs.

**Impact.** Any task that needs to run the *built* CLI (`node packages/cli/dist/index.js`) must run
`npx tsc -b` in its own worktree first; `dist/` is gitignored so it will not conflict at merge.

---

## D5 — The Phase 4 renderer consumes a *recorded* run, not a live `Simulation`

**Date:** 2026-07-27 · **Owner:** T5 · **Ratified by:** orchestrator

**Context.** Phase 4's renderer must sample `Car.positionAt(t)` at display framerate *between*
kernel events. That needs a time source. `Simulation.run()` is one synchronous call with no live
clock to sample, and `CLAUDE.md` invariant 3 forbids adding one to `core/`.

**Alternatives.** (a) Invert control — a tick loop or wall clock driving the simulation.
(b) Render a finished, serialisable, seed-bearing `VizRecording`. (c) Support both.

**Chosen:** (b). **Why:** (a) puts a clock in `core` and breaks invariant 3. A shipped building
simulates in milliseconds, so running first and sampling afterwards costs nothing perceptible, and
it is what makes Phase 4's acceptance criterion — "a stored run replays visually identically" —
mechanically checkable in Node without a browser.

**Impact.** Wave 2's live metrics overlay reads from the recording's folded step series rather than
from a running simulation. The building editor is unaffected (it operates on config, not runs).
Long runs hold all frames in memory; streaming is wave-2 work. Recorded runs are `postMessage`-able,
so moving simulation off the main thread stays open.

---

## D6 — `npm install` is deferred until wave 1's builders finish

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** `packages/viz` declares `vite` as a devDependency and `package-lock.json` is stale, so
`npm ci` would fail. The obvious fix is to run `npm install` immediately.

**Alternatives.** (a) Run it now. (b) Defer to the end of the wave.

**Chosen:** (b). **Why:** per D4 the root `node_modules` is symlinked into every live worktree.
Reinstalling while three builders are running their suites against it would mutate their dependency
tree mid-run and produce failures that look like defects in their work. The tree already contains
vite 8.1.5 (vitest brings it), so nothing is blocked until the lock is regenerated.

**Impact.** Tracked as C1 in `AGENT_STATUS.md`. Wave 1 does not close until it is done and the
suite is re-run against the refreshed lock.
## D7 — The search-space liveness sweep is a permanent guard in `core`, derived rather than listed

**Date:** 2026-07-27 · **Owner:** T3 (`fix/inert-tunables`)

**Context.** Findings #9, #10, #12, #13 and #21 are the same defect five times: a knob that is
schema-validated, profile-authorable, optimizer-searchable, unit-tested — and unable to move any
decision in any shipped run. Every one of them names the same missing test.

**Alternatives.** (a) Fix the five knobs and move on. (b) Add a per-knob liveness assertion to
`sim/seam.test.ts` for each. (c) Build one exhaustive sweep over every dimension the search space
carries, iterated from the schema rather than from a list.

**Chosen:** (c), as `packages/core/src/sim/searchSpaceLiveness.test.ts`, with (b) added for the
one finding whose remedy is a new behaviour. **Why:** (a) and (b) both leave the *49th* dimension
uncovered, which is the same defect in miniature — the roadmap's Standing Requirement is explicit
that a hand-written list passes every check anyone runs right up to the moment it goes stale. The
sweep discovers the space the way `collectSearchSpace()` does (every `*_PARAMETERS` export off
the barrel, narrowed by trying to author each id through the real `parseDispatcherProfiles`), so
a new dimension is covered with no edit. It asserts on **passenger-record trajectories**, not
summary metrics, for the reason `seam.test.ts` states: a mean is exactly the statistic that hides
a structural difference.

It is written in `core` rather than beside `collectSearchSpace()` in `experiments` because `core`
may not depend on `experiments`; a test that reached across would invert the package graph to
check a property of `core`.

**Impact.** 48 dimensions: 44 live, 4 declared inert with a machine-readable reason and an
executed proof that each is live under the condition its reason names. The allowlist is asserted
in both directions, like `dispatch/deadCode.test.ts`'s, so it cannot become the place dead
configuration goes to be forgotten. Verified failing: reverting any of the three fixes below
turns it red and names the dimension.

---

## D8 — `idle.predictorHorizonS` is **gated**, not implemented differently (findings #9, #10)

**Date:** 2026-07-27 · **Owner:** T3

**Context.** The forecast integrates to exactly `rate x horizon` while no bucket-of-day recurs
inside a replication, and all three consumers reduce it to a scale-invariant statistic (two
demand-weighted means and an argmax). At the shipped `predictorCycleS: 86400` the whole declared
`[30, 3600]` log range — a factor of 120 — is one bit-identical run.

**Alternatives.** (a) Make the consumers scale-sensitive. (b) Narrow the range. (c) Gate it.
(d) Remove it.

**Chosen:** (c) — `activeWhen: { 'idle.predictorCycleS': { max: 1800 } }`. **Why:** (a) would be
inventing a behaviour to justify a knob; the three consumers are scale-invariant because that is
what they should be. (b) has no non-flat sub-range to narrow to — the plateau is the whole range,
and what changes it is a *different* parameter. (d) hides a dimension that is genuinely live
below the bound (measured: 1 distinct trajectory at cycle 86 400, 2 at 1 800, 4 at cycle 600 with
a 120 s bucket). A gate is the machine-readable form of "inert here", which is exactly what
CLAUDE.md invariant 8 asks for, and 1 800 s is the replication length this project reports
against — the real condition is "the cycle is shorter than the run", and `activeWhen` cannot name
the run length.

`PREDICTOR_PARAMETERS`' module docstring positively asserted that all six rows are live whenever
`parkingStrategy: predicted-demand` **or** `weights.predictedDemand > 0` — both true of the
shipped `predictive-balanced`, and the claim was false for this row. Corrected, with the
mechanism and the measurement.

**Impact.** No shipped run moves. A search that leaves the cycle at a day now skips the horizon.

---

## D9 — The late-arrival courtesy hold is **implemented**, and ships **off by default** (findings #12, #13)

**Date:** 2026-07-27 · **Owner:** T3

**Context.** The only non-test caller of `Car.requestReopen` hardcoded `'obstruction'`, and
`answer.reopenOnLateArrival` gates only `cause === 'lateArrival'`. So the knob could not move any
run, `DoorAccounting.lateArrivals` was structurally 0 on every run this project can produce, and
`DOOR_REOPEN_REFUSALS.policyDisabled` was an unreachable verdict.

**Alternatives.** (a) Implement the behaviour with the declared default (`true`). (b) Implement
it and ship it off. (c) Gate it. (d) Remove the knob, the cause and the counter.

**Chosen:** (b). **Why:** (c) has nothing honest to gate on — there is no parameter whose value
decides whether passengers arrive late; "nobody implemented it" is not an `activeWhen`. (d) would
break `packages/experiments/src/tuning/space/collect.test.ts`, which is not this task's to edit,
and would delete a real modelling capability rather than connect it. (a) is what the declared
default asked for and is **not acceptable as a side effect**: measured across the five shipped
buildings x ten shipped profiles at seed 20260726, turning the hold on moves **41 of the 50**
passenger-record trajectories and shifts AWT by up to 30 % on `secure-tower` — and it broke nine
tests in `packages/experiments`, including Phase 5's own acceptance criteria, by revaluing the
runs those verdicts were measured on. Turning it on is a deliberate re-measurement, not a
by-product of wiring it.

So the behaviour exists, the request site runs on every stop, and `DOOR_DEFAULTS.reopenOnLateArrival`
is now `false`. Verified: all 50 shipped building x profile cells are **bit-identical** to the
pre-change tree on the full run fingerprint (record, summary, conservation, warnings).

The behaviour: when the doors start closing on a landing that still holds a passenger this car
could carry, and the car is below its design load, the run requests a `lateArrival` reopen. No
random draw — unlike the photo-eye this is a deterministic consequence of the trace, and a
probability here would spend a stream on something the passenger population already decides
(invariant 2). `#transferAtStop` now replays only its **boarding** half on a granted reopen; a
separate `alighted` flag stops the alighting cohort being alighted twice.

**Second-order.** `analytical/types.ts`'s `no-door-interference` assumption claimed the simulator
models "photo-eye obstruction and late-arrival reopens", so the RTT reconciliation was charging a
divergence source that did not exist. Corrected to state that **both are off at the shipped
defaults** and contribute exactly zero divergence to every number this project publishes. It stays
in `CLOSED_FORM_COMPARISON_RULE.oneSidedUnderIds`, which remains correct: a reopen can only ever
push the simulator above the closed form, and zero is one-sided too.

---

## D10 — `answer.overloadThreshold`'s declared range is **narrowed down to the design load factor** (finding #21)

**Date:** 2026-07-27 · **Owner:** T3

**Context.** Declared over `[1, 1.5]`, and flat over all of it: boarding stops at
`car.designLoadFactor x rated` (0.8 — CLAUDE.md § modelling rules), so a threshold at or above
1.0 can only reject a candidate heavier than `0.2 x rated`. That is 146 kg on the lightest
shipped car against N(75, 15), at least 4.7 sigma. `Car.isOverloaded`, `doorsHeldByOverload` and
the overload-alarm path were dead in every shipped run.

**Alternatives.** (a) Let cars board past the design load so the interlock can trip. (b) Gate it.
(c) Move the range floor to the design load factor. (d) Remove it.

**Chosen:** (c) — `range: [LOAD_SENSOR_DEFAULTS.designLoadFactor, 1.5]`, which is what finding
#21's own "missing test" prescribes. **Why:** (a) violates the modelling rule that makes every
result honest. (b) has no in-space gate: the condition is a comparison against
`car.designLoadFactor`, which is not profile-authorable and therefore not a dimension, and the
search space requires every gate to be one of its own. (d) would break `collect.test.ts` in a
package this task does not own, and would delete a knob the engine really does read.

The interlock is **one-sided**, not dead: it starts biting as the threshold approaches the
boarding cap from above, because the last boarder is the one that carries the load across.
`loadSensor.test.ts` now asserts the invariant that keeps this honest — *the range must start at
or below the design load factor, or the dimension has no reachable effect.*

**Impact.** The default is unchanged at EN 81's 110 %, so no shipped run moves; only the interval
a search may explore does. An optimizer may now drive the interlock down to the boarding cap,
which is a real and modelled configuration (a conservative overload device), not a plateau.

---

## D11 — Double-deck operation is **disclaimed on every run**, not implemented (finding #11)

**Date:** 2026-07-27 · **Owner:** T3

**Context.** `doubleDeck`, `deckSeparationM`, `ratedLoadLbPerDeck`, `servesFloorPairs` and the
whole `Bank` deck index are parsed, cross-validated with two dedicated warning codes, resolved
onto `ResolvedCar` and unit-tested, with zero runtime consumers.
`data/buildings/vertical-city.json` declares eight such shuttles and `loadConfig` said nothing at
all, so every RTT, interval and handling-capacity number reported for that bank is for hardware
nobody configured.

**Alternatives.** (a) Implement double-deck dispatch. (b) Emit a warning naming the building and
carry it into every run. (c) Delete the config surface.

**Chosen:** (b), which is option (b) of the finding. **Why:** (a) is Phase 6 by the handoff's own
scoping (`docs/07-handoff.md:217`) and is a dispatch problem, not a config one. (c) would throw
away a validated surface Phase 6 needs and would make `vertical-city` unauthorable. The defect
was never that decks are unimplemented — it is that the config layer validated the pairing
carefully enough to *look* wired and then went silent, and silence reads as "modelled".

So `loadConfig` raises `double-deck-not-simulated` naming the building and the bank, and the
`Simulation` raises the same statement into `result.warnings`, where a stored record and every
report can see it. `config/doubleDeck.test.ts` walks `data/buildings/` and asserts it in both
directions, so the day a `Car` learns about decks the disclaimer has to be revisited rather than
quietly outliving its truth.

**Impact.** Vertical City's config now carries a third advisory and every run of every
double-deck building carries one warning. No simulated number moves.

---

## D12 — `patternSwitching` is recorded as **deliberately unimplemented**, and the roadmap bullet is not done (finding #5)

**Date:** 2026-07-27 · **Owner:** T3

**Context.** `data/dispatcher-profiles.json:163-178` authors a complete fuzzy pattern-detector
block — four inputs, five patterns, `hysteresisS: 120`, a `weightSetsByPattern` map. It is
schema-validated, typed on the public core barrel, and cross-checked for dangling profile names.
Nothing reads it. `docs/05-roadmap.md:481` nonetheless lists "Fuzzy traffic-pattern detector with
hysteresis, driving per-pattern weight sets" as a delivered Phase 7 bullet.

**Alternatives.** (a) Implement the detector. (b) Record it as unimplemented scope and have the
roadmap bullet marked not-done. (c) Delete the config block.

**Chosen:** (b). **Why:** a fuzzy detector with hysteresis driving per-pattern weight sets is a
genuinely new *behaviour* — a controller that switches the dispatcher's whole weight vector
mid-run — with its own acceptance question (does switching beat the best single vector, at a
paired-t interval that excludes zero?) and its own risk to CRN, because two arms that switch at
different times see different weight vectors at the same instant. It is a phase of work, not a
finding fix, and doing it inside a defect-clearing wave is how a behaviour ships configured,
tested in isolation and unmeasured. (c) throws away authored intent that is otherwise correct.

**Impact.** **The roadmap bullet at `docs/05-roadmap.md:481` must be marked not-done** — this
task does not own `docs/`, so it is reported to the orchestrator instead. `config/parse.ts`'s
comment, which still described `patternSwitching` as "a Phase 7 controller", now states plainly
that the controller does not exist and that the validation must not be read as evidence that it
drives anything.

---

## D13 — Two wall-clock-bound `sim/` tests get an explicit timeout, and no assertion is relaxed

**Date:** 2026-07-27 · **Owner:** T3

**Context.** `sim/determinism.test.ts` "is bit-identical across twenty runs of Midtown Office" and
`sim/conservation.test.ts` "holds on vertical-city across 5 seeds" are ~3 s and ~4 s of pure
arithmetic against vitest's **5 s default**, on a runner with 117 files in flight. Measured on the
pristine `integration` tree, before any of this task's changes, the first of the two **already
fails** the full suite on this machine.

**Alternatives.** (a) Leave them. (b) Shrink the tests (fewer replications, fewer seeds).
(c) Give each an explicit timeout.

**Chosen:** (c), 60 s each. **Why:** (a) leaves a suite that is red for a reason unrelated to any
assertion in it, which trains readers to ignore red. (b) is the one option that *would* weaken an
acceptance criterion — twenty replications and five seeds are the sample sizes those two
properties are asserted at. A timeout is the runner's budget, not the property: with it, red means
nondeterminism or a lost passenger, which is what both tests exist to detect.

The liveness sweep this task adds is ~40 s of CPU and contributes to the contention, so the cost
was reduced first — three probe values per numeric dimension rather than four, one run memo for
the whole file, `vertical-city` out of the probe set (it saturates, and every live dimension
resolves without it), and a `queueLength` guard before the queue copy in `#reopenForLateArrival`.

---

## D14 — The sequential stopping rule uses the published estimator; `halfWidthQuantile` is deleted

**Date:** 2026-07-27 · **Owner:** T6

**Context.** Review finding #14 moved published intervals to Student-t at `n − 1` at every `n`.
That took `reports/statistics.ts`'s `halfWidthQuantile` — the `t` (n ≤ 25) / `z` (n > 25) crossover
that [`docs/03-traffic-and-statistics.md`](docs/03-traffic-and-statistics.md) § Part 3 states as the
*sequential stopping rule's* rule — off the published path. Afterwards it had **no non-test
production caller**: `validation/harness.ts:176` builds `productionStoppingRule` by injecting
`estimateMean` (t-always), and the only other reference was a fallback label at
`reports/compare.ts:607` for a family `formatConvergence` never prints. Its own docstring claimed
"Callers: the runner's injected `HalfWidthEstimator`, and the convergence report's fallback label";
nothing injected it. That is the shape [`docs/05-roadmap.md`](docs/05-roadmap.md)'s **Standing
requirement — the integration seam has an owner** exists to catch, arriving for the seventh time and
created by a fix.

**Alternatives.** (a) Inject a crossover estimator built on `halfWidthQuantile` into
`productionStoppingRule`, so § Part 3's rule is implemented in the loop control where it belongs
while published intervals stay t-always. (b) Delete `halfWidthQuantile` and stop claiming the
crossover is implemented, which makes § Part 3 wrong as written. (c) Leave it exported and unused.

**Chosen:** (b). **Why:**

1. **The two rules share a target, so they cannot use different quantiles.** `acceptableRange` is a
   half-width target, and `ConvergenceReport.status` decides `converged` from the *published*
   half-width. Under (a) the runner stops on a half-width 2–5 % narrower than the one the page
   prints, so a cell can stop while its own report says `IN PROGRESS`. Two numbers for the same
   quantity on the same cell is the mislabelling class of finding #14, one layer down.
2. **(a) stops earlier, which is the unsafe direction.** `runner/stopping.ts` states it: "an
   experiment that runs too long wastes CPU, and one that stops too early publishes a number it did
   not earn." (b) is the conservative option *and* the smaller diff; it was chosen for the first
   reason, and the second is noted so it cannot be mistaken for the motive.
3. **§ Part 3's own justification does not survive.** The doc allows the stopping rule to be
   approximate because "being 5 % optimistic about when to stop costs replications, not
   correctness". That holds only while the stopping half-width is never published. It is published:
   the runner records it on `StoppingVerdict` and a cell's replication count is explained from it.
4. **(c) is the defect itself.** A symbol may have no caller only with a recorded reason
   (`tuning/deadCode.test.ts` § `PUBLIC_API_ONLY`); "the doc mentions a crossover" is not one.

`T_DISTRIBUTION_MAX_N` goes with it: after (b) it had no code use, and an exported constant
documenting a crossover nothing implements is the same defect in a smaller package.

**Impact.**

- Deleted: `halfWidthQuantile`, `T_DISTRIBUTION_MAX_N` (from `reports/statistics.ts` and the
  `packages/experiments` barrel). Nothing outside `packages/experiments` referenced either.
- `reports/compare.ts:607` now defaults `ConvergenceReport.method` to `'t'`, so a suppressed
  headline metric past n = 25 can no longer stamp `'z'` on a serialized report.
- `runner/stopping.test.ts` gains a `productionStoppingRule` block asserting that the loop control's
  half-width equals the published one at n = 10, 25, 26 and 200, and that it is strictly wider than
  the doc's crossover past 25. That block, not a docstring, is now what owns the decision.
- `runner/fixtures.test-helper.ts`'s `docHalfWidth` double keeps the crossover **on purpose** — an
  estimator whose family differs from the shipped one is what proves `halfWidthStoppingRule` records
  the estimate verbatim instead of re-deriving it. Its docstring now says so.
- **Hand-back to the orchestrator:** `docs/03-traffic-and-statistics.md` § Part 3's four-line rule
  still reads `t[n-1]` for `n ≤ 25` and `z[conf]` above. It must become `t[n-1]` at every `n`, or
  state that the crossover is a description of the literature and not of this simulator. `docs/` is
  not T6's to edit.
- **`normalQuantile` is left exported with no production caller, and that is now a stated claim.**
  Deleting `halfWidthQuantile` removed its last one. It is kept because it is the reference
  `studentTQuantile` is validated against (`studentTQuantile(p, 1e6)` must converge on it, and the
  published interval must stay strictly wider than it past n = 25) and because
  `statistics.test.ts` pins it against the `Z_95 = 1.959963984540054` literal
  `benchmark/verdict.ts` hard-codes for replication planning — the one `z` left in the repository.
  Both reasons are in its docstring, with an instruction to delete rather than widen them.
- No replication count in the suite changed: `productionStoppingRule` already injected
  `estimateMean` before this change. This decision removes a dead alternative, it does not alter
  behaviour.

---

Staged here rather than in the repository's `DECISIONS.md` because another builder is appending
to that file in the same wave. **The orchestrator should fold these entries in and delete this
file.** Nothing outside `packages/viz/` was touched.

---

## D15 — The Phase 4 recording schema is not frozen; UX.md § 7 said more than it meant

**Decision.** `UX.md` § 7 is restated. The four structural decisions it lists stay frozen. The
**field set of `VizRecording` is explicitly not frozen**, and growing it is a deliberate
`VIZ_SCHEMA_VERSION` bump rather than a contract violation.

**Why.** Read as a shape freeze, § 7 made two of this project's own commitments unreachable:

1. `foldPassengers` discards `PassengerRecord.carId` and `bankId`. UX.md `RV-T3` — hovering a
   landing highlights the car assigned to it, and the assignment shown matches the record —
   cannot be built from a recording under any amount of cleverness, because the data is gone.
2. The roadmap's **live metrics overlay** can show exactly the three cumulative counters in
   `VizProgress`. Every windowed figure the project actually reports — rolling AWT, peak-5-minute
   AWT, a per-bank split — needs per-leg data the fold drops.

A freeze that forbids the fix to its own gaps is not a contract, it is a trap. Wave 2 would have
had to break it in its first week and would have been right to.

**What was widened now, and what was not.**

| Change | Done? | Reason |
|---|---|---|
| `buildLayout` narrowed from `readonly VizShaft[]` to `readonly ShaftGeometry[]` (carId, bankId, label, servedFloorIds) | **yes** | Costs nothing — `VizShaft` satisfies it structurally, so no caller changed — and it removes a hard blocker: `ED-01`/`ED-02` promise a live editor preview with **no run**, and the old signature demanded motions, door marks, occupancy series and a capacity, all of which only a finished run has. |
| `VizProgress.served` / `Frame.served` renamed `boardedLegs`; `VIZ_SCHEMA_VERSION` 1 → 2 | **yes** | The counter counts **leg boardings** and the header drew it as people. On a sky-lobby building that overstates the population served by exactly the transfer rate. Both counters in the frame are now in the same unit as `waiting`, which was always legs. |
| Adding the per-leg array `RV-T3` and a windowed overlay need | **no** | Nothing in wave 1 would read it. A configurable, unit-tested field with no consumer is the exact defect class this repository has shipped five times; shipping one here to be helpful would make it six. Wave 2 adds it **with its first consumer** and bumps to 3. |

**Consequence for the version number.** `VIZ_SCHEMA_VERSION` is stamped on every recording and
currently read by nothing — see D16. It is carried because a wave-2 file-load path will check
it, and bumping it now is how a deliberate shape change is recorded rather than discovered.

---

## D16 — Two dead exports deleted, not wired

**`isSupportedRecording`** (was `frame/frameAt.ts`): deleted. It compared a recording's
`schemaVersion` with the constant compiled into the same bundle. In the shipped path the only
producer of a recording is `recordRun` from that same bundle, so the comparison could not fail —
a guard that guards nothing. Wiring it into `dev/main.ts` would have made the tautology look
like a check. The version check belongs with the wave-2 load path (`PB-07`/`PB-15`), where a
recording arrives from a file and the versions can genuinely differ.

**`displayMsAt`** (was `playback/mapping.ts`): deleted, with its test. `Playback` uses
`simTimeAt` and `reanchor`; the inverse had no caller but its own test. Wave 2's click-to-seek
on a timeline is where an inverse acquires one.

**`loadResources`** (was `fixtures.test-helper.ts`): deleted. Zero callers, tests included. A
test helper whose only defensible caller is a test, with no test calling it, is dead.

---

## D17 — `frameTimes` refuses to truncate rather than truncating in silence

`maxFrames` used to clip: the grid stopped at `maxFrames - 1` points and jumped to `endedAt`, so
a caller asking for a long run at a slow speed silently received the head of the replay plus one
final instant. A comparison over such a sequence is not evidence about the span it never
sampled — a truncated replay could report "identical" about a tail it never looked at, in the
one harness whose entire job is to detect divergence.

It now throws a `RangeError` naming the requested count, the ceiling and the three ways out;
`truncate: true` is the explicit opt-in for a caller who has decided it does not need the tail.
Memory is still bounded. The cap is no longer silent.

---

## D18 — `KB-15` re-marked rather than papered over

The row claimed "colour is never the only signal — door state, direction and overload each carry
a glyph as well as a colour ✅ w1". Direction does (▲/▼). Door state is a fill-width gap and
overload is `theme.carHeavy` — colour, and only colour. Worse, that colour changes at load factor
0.8, which is the 80 % fill rule, not the 1.1 overload alarm `RV-14` describes.

The row is split into `KB-15` (direction, ✅ w1) and `KB-15a`/`KB-15b` (door state, overload,
🔲 w2). Adding the two glyphs is renderer work with its own tests and belongs with `RV-14`;
claiming them was the defect, not lacking them.

---

## Handed back — things T8 could not change

- **`docs/05-roadmap.md` § Phase 4.** Its acceptance criterion is "a stored run replays
  identically". That criterion was satisfied, in full, by a recorder that drew every car at its
  final position on three of four buildings — because a wrong picture replays exactly as
  faithfully as a right one. The criterion needs a second clause: *and the first frame places
  every car where the run says it started.* T8 does not own `docs/`.
- **`DECISIONS.md`.** These four entries.
- **A finding for whoever owns the runner seam.** `recordRun` inherits `onTimeout: 'throw'`, so
  a shipped building that ends a run with people still in the system produces **no recording at
  all** — `Simulation` throws and there is nothing to draw. At the shipped traffic rates that is
  Mixed-Use High-Rise, Secure Tower and Vertical City at 900 s on ordinary seeds. Statistically
  the throw is right; a *viewer* still has to be able to draw that run, and `UX.md` `RV-16` says
  so. The viz breadth suites pass `onTimeout: 'report'` and record the `timed-out` status. Wave 2
  should decide whether the dev viewer does the same rather than showing an error for a run the
  user can see is interesting.
## D19 — A reopen **revises** the dwell; it does not re-grant the stop's (T7, review finding: courtesy hold)

**Date:** 2026-07-27 · **Owner:** T7

**Context.** `Simulation.#reopenForLateArrival` called `car.requestReopen('lateArrival', at)` with no
revised `DoorStopReason`, so `applyReopen` sized the reversed open period off `door.reason` — the
cumulative stop reason, which `mergeStopReasons` holds at the **larger** transfer of everything the
stop has answered. A door reversing for one late passenger was therefore re-granted the whole
cohort's transfer, `(alighting + boardingAtOpen) × tp` bounded only by `maxTransferSeconds`, once
per honoured reopen and up to `maxReopensPerStop` times. `Car.requestReopen(cause, at, reason?)`
had accepted a revised reason since it was written; nothing passed one.

Measured with the defect in place, the largest dwell granted to any single hold reaches **40.0 s on
`vertical-city` — exactly `maxTransferSeconds`** — against a largest hold cohort of 17 passengers,
worth 29.75 s. On `secure-tower` it reaches 14.4 s against a largest cohort of 7, worth 8.4 s.

**Alternatives.** (a) Pass a revised reason and let `mergeStopReasons` combine it. (b) Give the
machine a separate basis for the current open period. (c) Leave it and document the overstatement.

**Chosen:** (b). **Why:** (a) does not work — the merge takes the **maximum** transfer, which is
correct for an `open` that widens a growing stop and is exactly what has to be avoided here, so a
smaller revision has no effect at all. (c) is not available: the number is not a rounding, it is a
dwell nobody boards against, and Phase 7 would optimise the knob against it.

`DoorMachineState` gains `dwellReason`, the basis for the **current open period**, alongside the
cumulative `reason`. An `open` widens it (`mergeStopReasons`), and a `reopen` carrying a revised
reason **replaces** it. A reopen with no revised reason leaves it at `reason`, so the photo-eye —
a safety reopen nobody can size, because nobody knows who is in the doorway — is bit-identical to
before.

**One restriction, found by an existing test rather than by inspection.** Narrowing is allowed
**only from the `closing` state**. A door reaches `closing` on its own by serving its granted dwell
in full, so the declared cohort really has transferred; while `opening` or `open` it has not, and
narrowing there lets a caller cut short a dwell the stop was granted and never served — which made
`totalS - nominalStopSeconds(config, reason)` go negative and turned
`doorMachine.test.ts`'s randomized "never ends a stop below its own nominal duration" red. That is
also the only state `#reopenForLateArrival` requests a hold from, so the sim behaviour is
unaffected by the restriction. A forced `close` can also reach `closing` early; that case is
already the documented exception on `DoorTimeAccounting`.

**The test whose absence allowed this.** Two, at the two levels. `doorMachine.test.ts` asserts
per-hold that a revised reopen is granted exactly `dwellSecondsFor` of *its own* cohort across
`served ∈ {6, 12, 20}` × `late ∈ {1, 2, 3}`, and that an unrevised reopen still gets the stop's.
`sim/seam.test.ts` asserts the same bound through real runs, rebuilt from the fleet's own resolved
door configs. Both were confirmed to **fail** with the fix reverted before being accepted.

---

## D20 — The room check for a courtesy hold *is* the boarding predicate, computed by one function

**Date:** 2026-07-27 · **Owner:** T7

**Context.** `#reopenForLateArrival` tested `massKg >= designLoadKg` plus `#carCanCarry`;
`#boardFrom` admits on `massKg + candidate.massKg < overloadKg` as well. The two agree only while
`answer.overloadThreshold` sits well above `car.designLoadFactor`, which D10 stopped guaranteeing
when it moved the declared range's floor down to the design load factor. At the floor, the hold was
granted, the door reversed, and the boarding loop took nobody — precisely the *"delay with no
boarding to pay for it"* the docstring claims is excluded.

**Alternatives.** (a) Copy the missing clause into the room check. (b) Ask `#projectedBoarding`,
and fix `#projectedBoarding` to be clause-for-clause identical to `#boardFrom`.

**Chosen:** (b). **Why:** (a) is a third copy of a predicate that already had two, and the defect
is that they drifted. `#projectedBoarding` was *also* missing the overload clause — it is the
projection `#beginStop` sizes the initial dwell from, so the same drift was mis-sizing ordinary
stops in exactly the configurations D10 opened up. One function now answers "who boards", and both
the dwell and the hold decision are derived from it. A hold is requested only when it answers with
at least one passenger, which makes "a hold buys boarding" true by construction rather than by
claim.

**Impact.** No shipped run moves: at the default `overloadThreshold` of 1.1 against a design load
factor of 0.8, the missing clause could only reject a candidate heavier than `0.3 × rated` — at
least 4.7σ on N(75, 15) for the lightest shipped car, which is D10's own arithmetic.

---

## D21 — `idle.predictorHorizonS` is **ungated and allowlisted**, and every gate now has a proof obligation

**Date:** 2026-07-27 · **Owner:** T7 · **Supersedes the remedy chosen in D8**

**Context.** D8 gated the row on `{ 'idle.predictorCycleS': { max: 1800 } }`. Re-measured at seed
20260726 over horizons {30, 120, 300, 900, 3600} against `predictive-balanced`, counting distinct
passenger-record trajectories:

```
                  cycle 86 400   3 600   1 800    900    600
garden-apartments            1       1       1      1      1
secure-tower                 1       2       4      3      2
midtown-office               1       1       1      1      1
```

Two of D8's statements are wrong. It named **garden-apartments** as producing 2 distinct
trajectories at cycle 1 800; garden-apartments produces **1** at every cycle tried, and the building
on which this dimension is live is **secure-tower**. And, decisively, at cycle 3 600 — *outside* the
gate, where a generic optimizer was told not to look — the horizon still produces 2 distinct
trajectories. The gate skipped a live dimension, which `PREDICTOR_PARAMETERS`' own docstring calls
the worse of the two errors: *"one that skips a live dimension reports a winner that is only
optimal at whatever the default happened to be."* 1 800 s was neither necessary nor sufficient; it
was correct only for the shipped `cycle: 86 400`, where the row is inert.

**Alternatives.** (a) Keep a gate and make the bound sound. (b) Remove the gate, state the
condition in the row's `description`, and declare the dimension inert-at-shipped-defaults through
`DECLARED_INERT`.

**Chosen:** (b). **Why:** (a) is not available. The true condition is **relational** — a
bucket-of-day has to recur inside the window, roughly `horizon >= cycle` — and `activeWhen` compares
a parameter against constants, so no bound is correct for more than the single cycle it is fitted
to. Fitting one anyway is how the unsound gate got there. The other five predictor rows already
state their condition in prose for the same reason (theirs is a disjunction `activeWhen` cannot
express), so this is the file's existing answer rather than a new one.

`DECLARED_INERT` is a **stronger** claim than a gate, not a weaker one: an entry names the condition
under which the dimension *is* live and the test executes it, so the entry fails if the condition
stops producing a difference and fails if the dimension becomes live under the plain sweep. The
gate carried no obligation at all.

**And that is the structural half.** `activeWhen`-gated regions were the one unfalsifiable escape
hatch in a file built to eliminate exactly that: the sweep satisfied a gate, confirmed the
dimension live inside it, and never probed outside. So a gate whose condition was simply *wrong*
passed silently — which is what happened here for a whole wave. `searchSpaceLiveness.test.ts` now
asserts the contrapositive for **every** `activeWhen`-gated dimension: outside the gate's
condition, the dimension must be **flat**. Confirmed to fail, naming the dimension and the region
(`idle.predictorCycleS=3601 … it still moves a run (30 vs 3600 on secure-tower)`), by restoring the
shipped gate before being accepted.

The first version of that probe reported **all 13** gated dimensions as unsound, because
`sweepDimension` re-satisfies the spec's own gates and wrote the violating value straight back. The
sweep now takes a `satisfyOwnGates` switch, and the non-vacuity assertion (`gatesChecked > 0`) is
there because a probe that silently matches nothing is the same defect one level up.

**Impact.** No shipped run moves. A search that leaves the cycle at a day now skips the horizon
because this repository's own test says it is inert there, rather than because a bound nobody
checked said so — and a search at any *other* cycle is no longer told to skip a live dimension.

---

## D22 — `RunRecord` carries its run's warnings, and disclaimers are ordered ahead of advisories

**Date:** 2026-07-27 · **Owner:** T7 · **Corrects a claim in D11**

**Context.** D11 states that the double-deck disclaimer is raised into `result.warnings` *"where a
stored record and every report can see it"*. A stored record could not: `RunRecord` had no
`warnings` field and `serializeRunRecord` is `JSON.stringify(record)`, so the statement reached
`SimulationResult.warnings` in memory and the CLI's printout and nothing that outlived the process.
The CLI's printout truncated at 6 and survived only because the disclaimer happened to be warning
#1 on the one building that raises it.

**Alternatives.** (a) Correct D11's claim. (b) Add `warnings` to `RunRecord`.

**Chosen:** (b), because D11's *intent* is right and only its mechanism was missing. Optional, so a
run with nothing to say adds no key and its record is byte-identical to one written before the
field existed; `runRecordSchema` accepts it, so the round trip and `parseRunRecord`'s refusal to
load a seedless record (invariant 5) are untouched.

Attached by `Simulation.#finish` **after** the conservation audit rather than by `RunRecorder`,
because `#diagnoseStuckCalls` and `#reconcile` both raise warnings and the list is not final until
they have run. The recorder records what the run *did*; these are what the run has to *say* about
the configuration it did it under, and it should not grow a view of them.

Ordering is now deliberate: `Simulation` keeps a separate `#disclaimers` list — statements that a
number describes *different hardware or a different building* (double-deck cars run single-deck, a
car with no resolved `passengerTransferS` runs at the office value) — and emits it ahead of the
advisories. The CLI's truncation is also raised from 6 to 12. Either alone would have done; both
cost one line each and remove the coincidence.

**Impact on the fingerprint comparison.** Ten cells move — `vertical-city` × all ten profiles — in
the `record` field, which previously moved in `warnings` only. That is the intended effect and the
only cell movement in this task's whole change set.

---

## D23 — The late-arrival counters are surfaced on `SimulationResult`, and the double-deck warning code gets a reader

**Date:** 2026-07-27 · **Owner:** T7

**Context.** Two new instances of the standing requirement's own pattern.
`StageActivity.lateArrivalHoldsRequested/Granted/Refused` were on the `Simulation` instance only —
not on `SimulationResult`, not on `RunRecord` — and `runSimulation()` returns the result and
discards the instance, so no non-test caller could read them; only `seam.test.ts` did. And
`WARNING_CODES.doubleDeckNotSimulated` was raised by `resolveBuilding` and asserted in both
directions by `config/doubleDeck.test.ts`, while no shipped path branched on the code: the CLI
printed the `Simulation`-side string and never looked at `ResolvedBuilding.warnings`.

**Alternatives, for each.** (a) Delete. (b) Give it a non-test caller.

**Chosen:** (b) for both, because both are genuinely valuable and neither is speculative.

The counters exist to separate *"the profile declined every hold"* from *"nothing ever calls
`requestReopen('lateArrival')`"* — the state the knob spent its entire life in — and that
distinction is worth nothing to a reader who cannot reach it. `StageActivity` moves to
`sim/types.ts` next to `SimulationResult`, is carried on the result, and
`packages/cli/src/commands/run.ts` prints `requested · granted · refused` whenever a hold was asked
for. **Named non-test caller: `printRunReport` in `packages/cli/src/commands/run.ts`.** On
`vertical-city` at the shipped defaults it prints `169 requested · 0 granted · 169 refused`, which
is the distinction, visible.

Three counters are added for the same reason the first three exist — `lateArrivalHoldsProjected`,
`lateArrivalHoldsBoarded`, `lateArrivalHoldDwellS`, plus the two extrema
`lateArrivalHoldMaxDwellS` / `lateArrivalHoldMaxCohort` that D19's bound is checkable on. Run
totals were tried first and are too blunt: a hold's dwell is `max(base hall dwell, cohort × tp)`,
the base term dominates on the shipped buildings, and summing hides one 40 s re-grant among two
hundred 5 s holds.

For the warning code, `RunPlan` gains `configDisclaimers`, selected from
`ResolvedBuilding.warnings` **by code** rather than by matching on prose, and printed under
`Configuration`. **Named non-test caller: `planRun` in `packages/cli/src/commands/run.ts`.**

---

## D24 — D13's justification does not reproduce; the timeouts stay, the reason is corrected

**Date:** 2026-07-27 · **Owner:** T7 · **Corrects a claim in D13**

**Context.** D13 states that, measured on pristine `integration`, `sim/determinism.test.ts` *"is
bit-identical across twenty runs of Midtown Office"* **already fails** the full suite at vitest's
5 s default. It does not. The whole-system review ran the pristine baseline at the default timeout
and got **126/126 files, 2578/2578 tests, zero failures**, with the two named tests at 2316 ms and
1965 ms. Re-timed here, they are **2640 ms** and **2253 ms** — roughly half the default budget.

**Chosen:** keep the explicit 60 s timeouts, and delete the justification. **Why:** a timeout
relaxes no assertion — twenty replications and five seeds are still the sample sizes those two
properties are asserted at — so the timeouts are harmless and give headroom on a contended runner.
But "it already fails" was the stated reason, and a decision log that keeps a reason which does not
reproduce is worse than one that says "headroom on a shared runner", which is what this is.

---

## D25 — The courtesy hold's published cost was never quotable, for a reason neither D9 nor the review caught

**Date:** 2026-07-27 · **Owner:** T7 · **Corrects D9, `DOOR_DEFAULTS` and `DOOR_PARAMETERS`**

**Context.** D9 records that enabling `answer.reopenOnLateArrival` *"shifts AWT by up to 30 % on
`secure-tower`"*; the same figure is in `DOOR_DEFAULTS.reopenOnLateArrival`'s docstring and in
`DOOR_PARAMETERS`' `answer.reopenOnLateArrival` description. The whole-system review corrected the
maximum to **+59.1 %** (reproduced here exactly, on `secure-tower|auction-multi-round` at seed
20260726) and inferred from a `maxTransferSeconds: 0` run that the hold might be a net *benefit*.

Both are built on the same unnoticed floor. Every one of those figures is a percentage change in
the mean waiting time of a configuration that **saturates**: at seed 20260726 `secure-tower` reports
`saturation: { saturated: true, verdict: 'diverging-queue' }` under the shipped profiles. CLAUDE.md
§ Statistical discipline: *"If a configuration saturates, flag it and suppress the AWT interval. Do
not report a mean for a system whose queues grow without bound."* They are also single-replication
point estimates with no confidence interval, against a rule that says no comparison may be declared
without a paired-t interval that excludes zero.

The review's inference has a second problem of its own: `maxTransferSeconds: 0` removes the
transfer-driven dwell from **every stop in the run**, not just from reopens, so the sign flip it
produced is not a measurement of this defect.

**Chosen:** re-measure under the project's own rules — paired arms on common random numbers, 50
replications, a paired-t 95 % interval, and AWT suppressed wherever either arm saturates — and
replace the figure in all three shipped locations with what that produces. Where a cell has no
quotable mean, the effect is reported as what it demonstrably is: the knob still moves the run, and
the trajectory count says so.

**Impact.** No shipped run moves; the default is still `false`. What changes is that the price on
the knob is now a measurement rather than a number taken from a diverging queue.

**The re-measurement.** 50 replications per cell, paired arms on common random numbers (seeds
20260726–20260775), paired-t 95 % interval, AWT suppressed wherever either arm reports
`saturation.saturated`:

| | quotable cells | significantly worse | significantly better | no significant difference |
|---|---|---|---|---|
| 5 buildings × 10 profiles | 34 of 50 | **0** | 2 | 32 |

The two significant cells are both *improvements*: `secure-tower|auction-multi-round` −13.2 %
(−7.66 s, CI [−12.72, −2.60]) and `vertical-city|predictive-balanced` −14.4 % (−6.80 s,
CI [−11.36, −2.23]). The remaining 16 cells saturate in nearly every replication — `midtown-office`
on all ten profiles, and most of `mixed-use-high-rise` and `vertical-city` — and are suppressed
rather than quoted.

Note what this does **not** say. The review's inference that the hold *"may be a net benefit"*
lands on the right side, but not by the route it took: `maxTransferSeconds: 0` strips the
transfer-driven dwell from every stop in the run, not just from reopens, so the sign flip it
produced measured something else. And "no measured AWT cost" is not "no effect" — the hold moves
**41 of the 50** passenger-record trajectories at seed 20260726, on every building but
`garden-apartments`, which is exactly why the default stays `false`.

---

## D26 — Phase 7 is accepted; Phase 4 is recorded as a foundation; four doc claims become tests

**Date:** 2026-07-27 · **Owner:** T4 · **Corrects the impact line of D22**

**Context.** Ten of the review register's twenty-one findings were documentation drift, and the
register itself did not say which findings survived the wave. Two phase verdicts were also stale in
opposite directions: Phase 7 was recorded NOT ACCEPTED after T1 closed all three of its stated
blockers, and Phase 4 carried no status line at all while `packages/viz` existed on disk.

### Phase 7 — ACCEPTED

**Alternatives.** (a) Accept. (b) Withhold acceptance because the fuzzy pattern-detector scope
bullet is unbuilt. (c) Accept and quietly drop the bullet.

**Chosen:** (a), with the bullet marked **⬜ NOT DONE** in the roadmap. **Why:** the phase's stated
acceptance criteria are two — a tuned vector beating `predictive-balanced` on held-out seeds with a
paired-t interval excluding zero, and candidates below the half-width reported as indistinguishable
rather than ranked — and both are met, at `−1.288 s [−2.277, −0.298]` on the holdout set and through
`pareto.ts`'s dominance rule. The three "to accept this phase" requirements this document set are
each met by code, not by wording: `tuning/index.ts`, the package re-export, `tuneCommand` as the
**named non-test caller**, and `tuning/deadCode.test.ts`. The known-answer test was passed blind —
`tune` returned **2.582 s** against the shipped 8 s, seed sets `DISJOINT`, holdout `GENERALIZES`.
(b) would be inventing a criterion after the fact, which `CLAUDE.md` § Working agreements forbids as
firmly as it forbids weakening one; (c) would hide undelivered scope inside a green tick, which is
the register's own finding #5.

### Phase 4 — FOUNDATION LANDED, NOT COMPLETE

**Alternatives.** (a) Mark it complete: both acceptance clauses pass. (b) Record it as a foundation
with the unbuilt bullets named. (c) Leave it with no status.

**Chosen:** (b). **Why:** (a) is available on the acceptance criteria alone and is wrong — two of
the four scope bullets, the building editor and the live metrics overlay, are not built, and a phase
is done when its scope is delivered and its criteria pass, not when the criteria pass. (c) is the
state that let the register go a whole wave without anyone noticing `viz/` had appeared. The
criterion itself is **raised**, per C16: *"and the first frame places every car where the run says
it started"*, because the original was satisfied in full by a recorder wrong on 4 of 5 buildings — a
wrong picture replays as faithfully as a right one.

### Four documentation claims become tests

**Alternatives.** (a) Fix the ten drift findings and move on. (b) Fix them and guard the ones with a
cheap mechanical form.

**Chosen:** (b). Built, each watched failing against the drift it targets and then restored:

| guard | asserts |
|---|---|
| `experiments/src/validation/documentation.test.ts` | the phase set agrees across `CLAUDE.md`, `README.md` and `docs/07`; `docs/07`'s opening sentence does not contradict its own table; every `docs/*.md` appears in README's documentation **table**; every study entry point the roadmap names is exported by `@elevator-sim/experiments` |
| `experiments/src/tuning/space/docExamples.test.ts` | every fenced `json` block in `docs/06` is classified — profile, parameter declarations, or declared-other with a reason — profiles load through `parseDispatcherProfiles` and weight no gated-off term, and every declared id and gate key is in `collectSearchSpace().ids` |
| `core/src/sim/moduleTree.test.ts` | `docs/01`'s module tree and the directories under `packages/*/src` are the same set, **in both directions** |
| `core/src/analytical/docFormula.test.ts` | the formulas in `docs/03` Part 2 are parsed, evaluated, and compared against `roundTripTime()` on Secure Tower's high bank, where `tx = 14.025 s` |

Findings **#3** and **#20** are closed without a guard, stated rather than glossed: #3's prescribed
per-building `buildProfile(...).kind` assertion and #20's `contiguousZones` band-count assertion are
not built, so both documents can drift again.

**Impact.** No simulated number moves. The suite grows by four files and thirteen tests.

### Correction to D22

D22 records the merged-state fingerprint as *"Ten cells move — `vertical-city` × all ten profiles —
in the `record` field"*. On the merged `integration` tree the figure reported is **30 of 50 cells,
`record` field only**, the movement coming from `RunRecord.warnings` on every building that raises
one rather than on `vertical-city` alone. **NOT RE-MEASURED by T4** — closing it would need a
fingerprint of the pre-merge tree, which this worktree does not have built. Recorded with its
provenance rather than transcribed as a measurement. No simulated number moves either way.

---

## D27 — Phase 6's acceptance criterion is **raised**, because its stated metrics stop being comparable (OQ-7)

**Date:** 2026-07-27 · **Owner:** orchestrator · **Escalated by:** T14

**Context.** `docs/05-roadmap.md` states Phase 6's gate as *"a learned dispatcher beats the naive
baselines on **AWT and WT95** on the Mixed-Use High-Rise, with paired-t intervals excluding zero."*
T14 measured that AWT and WT95 are two of the **nine** metrics Level 1 makes non-comparable, and
that they are the two whose **sign flips**: at Midtown interfloor-mix, n=40 under CRN, ΔAWT is
`+0.355 ± 0.337` (worse) while ΔTTD is `−1.821 ± 0.738` (better). Both exclude zero, in opposite
directions, from the same runs.

So the phase's gate, as written, would reject a genuine improvement — or, worse, be quietly
reinterpreted by whoever runs it.

**Alternatives.** (a) Keep the criterion and let the phase fail on a metric that penalises it by
construction. (b) Replace AWT/WT95 with TTD — a **weakening**, since it drops the metrics on which
destination dispatch looks worst. (c) Gate on TTD **and** require AWT and WT95 to be reported with
explicit verdicts.

**Chosen:** (c). **Why:** `CLAUDE.md` forbids weakening a criterion and requires raising it instead.
(b) is the comfortable move and hides the honest cost of the approach — `docs/07-handoff.md` says
that cost "is a documented cost of the approach and this simulator can quantify it", so hiding it
would discard the point. (c) is strictly stronger than the original: it adds a metric the phase must
win on and keeps both metrics it might lose on, in public, with verdicts rather than silence.

**Impact.** Phase 6's gate becomes: beat the baseline on **TTD** with a paired-t interval excluding
zero, **and** report AWT and WT95 with explicit BETTER / WORSE / INDISTINGUISHABLE / IDENTICAL
verdicts. A WORSE verdict on AWT does not fail the phase; **omitting it does.**

---

## D28 — Phase 6 splits into 6a and 6b; learned control (6c) leaves the phase

**Date:** 2026-07-27 · **Owner:** orchestrator · **Recommended by:** T14

**Context.** T14 established that "Phase 6" is two unrelated bodies of work plus a third that shares
no interface with either.

**Chosen.**
- **6a — destination *disclosure*.** `dispatch.callType: destination-entry` is already wired end to
  end. Needs profiles in `data/` and a study, **no `core` change**. Ships two real measured results.
- **6b — destination *dispatch*.** Per-passenger car assignment: the passenger-model change, and
  where R9 actually lives. **Strictly serial on `sim/simulation.ts`** — B1–B5 all edit overlapping
  methods of one 2,765-line file.
- **6c — learned control.** Deferred out of Phase 6. It shares no interface with 6a or 6b, it
  strains invariant 8 (is a 400-parameter policy vector a declarable tunable?), and decisively its
  acceptance criterion is stated in the metrics 6b makes non-comparable.

**Why not one wave:** four owners against one 2,765-line file, with OQ-1 unanswered and an
acceptance criterion contradicting the phase's own comparison metric, is the Phase 5 configuration
with a larger blast radius. Splitting by method inside `simulation.ts` reproduces the documented
root cause exactly.

**Impact.** Wave 3 is 6a. 6b follows with a single named seam owner. 6c is recorded as deferred
scope in the roadmap, not silently dropped.

---

## D29 — A destination assignment is **write-once**; a bumped passenger is recorded, not re-assigned (OQ-1)

**Date:** 2026-07-27 · **Owner:** orchestrator · **Escalated by:** T14

**Context.** When a car fills and leaves promised passengers behind, either their `assignedCarId`
stands, or the system re-offers the call to the group. `#reofferCall` currently re-offers, which is
the destination panel silently changing its mind.

**Alternatives.** (a) Write-once — the passenger waits for the car they were told. (b) Re-offer.
(c) Make it a tunable.

**Chosen:** (a), with an explicit **broken-promise** counter, and re-assignment recorded as
out-of-scope for 6b rather than built. **Why:** committing at call time **is** destination
dispatch's cost, and `docs/07-handoff.md` says this simulator exists to quantify it. (b) quietly
recovers the deferral advantage Level 1 is supposed to surrender, which flatters the thing being
measured — the failure mode this project's statistical discipline exists to prevent. (c) invents a
knob nobody has asked for, and an unrequested tunable is this repository's documented defect class;
if re-assignment is later wanted it arrives with its own liveness proof and its own study.

**Impact.** 6b must override `#reofferCall` for assigned passengers and add the broken-promise
count to the recorded metrics. A non-zero count is a *result*, not a failure.

---

## D30 — A destination-entry kiosk **authorizes** (OQ-3)

**Date:** 2026-07-27 · **Owner:** orchestrator · **Escalated by:** T14

**Context.** Does entering a destination at a kiosk perform the access check? T14 measured that
`destination-entry` without a credential breaks `secure-tower` outright — undelivered 0 → 43.2,
5/5 replications timed out — because `estimateCost` checks destination access against
`request.credentialGroup`, which `costRequestFor` drops under `destination-entry`.

**Chosen:** panel-stage authorization (T14's option (b)). **Why:** option (a) makes the roadmap's
own sentence — that destination dispatch does better under access control *because* authorization
and optimization happen in the same step — vacuous, and an unfalsifiable hypothesis is not one.

**Note, and it matters:** T14's pilot has already **refuted** that mechanism claim. Given the
credential, disclosure helps *less* on the access-controlled building (−0.455 ± 0.328 on
`secure-tower` against −0.962 ± 0.651 on `midtown-office`). The saving is real and it is entirely in
the credential. Three documents plus a `core` docstring
(`packages/core/src/dispatch/lifecycle.ts:100-104`) assert the mechanism as fact; all four need
correcting once the confirmatory study lands. A docstring asserting an unmeasured mechanism is the
same species of defect as a published number nothing re-derives.

---

Decision record for `fix/core-browser-entry`. Fixes wave-1 finding **C2**.

## The defect

`packages/core/src/index.ts` re-exported `loadConfig`; `loadConfig` lives in
`config/loader.ts`, which imports `node:fs/promises` and `node:path`. A bundler replaces a
Node builtin with a stub that throws **at module evaluation**, so *any* browser import of
`@elevator-sim/core` died before running a line. Phase 4's viewer worked around it by
aliasing the two builtins to a throwing shim in `packages/viz/dev-shims/`.

Three docstrings — `config/loader.ts`, `config/index.ts` and the old `src/index.ts` — each
asserted that a browser build could take the pure parsing path "without pulling `node:fs`
into its module graph". All three were wrong for the whole of Phase 4, and each of them
reads as correct in isolation. Only the *graph* showed it. That fact set the shape of the
guard below.

Reproduced before the fix, with the Node builtins a browser lacks made unresolvable:

```
THROW packages/core/dist/index.js
      BROWSER-UNSAFE: node:fs/promises is not available in this environment
      (imported by …/packages/core/dist/config/loader.js)
```

## D31 — `core` restructures into a browser barrel and a Node entry, routed by an export condition

The brief offered two shapes: add an `@elevator-sim/core/config` subpath beside the existing
default barrel, or move `loadConfig` off the default barrel. **Neither in its pure form was
available**, and the reason is worth recording because it drove the answer.

- *Subpath beside the barrel* leaves the default specifier broken. `packages/viz/src/frame/
  frameAt.ts` and `dev/main.ts` import values from `@elevator-sim/core`, so deleting
  `dev-shims/` would break the dev server until `viz/src` migrated — and `viz/src` belongs to
  another builder this wave. It also loses on the "who re-breaks it" test: the barrel that
  everyone reaches for by default stays the unsafe one, and the safe one is opt-in.
- *Removing `loadConfig` from `.` outright* is the right long-run API, but `loadConfig` is
  imported from `@elevator-sim/core` by `experiments` (5 files), `cli/src/data.ts` and four
  `viz` test files. All three packages are out of this task's ownership, and `npx tsc -b`
  must stay clean.

The shape that satisfies both: **`src/browser.ts` becomes the whole barrel, `src/index.ts`
becomes `export * from './browser.js'` plus `loadConfig`, and `package.json` routes the two
apart with an export condition.**

```jsonc
".": {
  "types":   "./dist/index.d.ts",
  "browser": { "types": "./dist/browser.d.ts", "default": "./dist/browser.js" },
  "default": "./dist/index.js"
},
"./browser": { "types": "./dist/browser.d.ts", "default": "./dist/browser.js" }
```

| specifier | environment | resolves to | `loadConfig`? |
|---|---|---|---|
| `@elevator-sim/core` | Node | `dist/index.js` | yes — 388 exports |
| `@elevator-sim/core` | bundler, `browser` condition | `dist/browser.js` | no — 387 exports |
| `@elevator-sim/core/browser` | any | `dist/browser.js` | no — 387 exports |

Why this and not a `browser` field, or a lazy `await import('./loader.js')` inside
`loadConfig`:

- The `browser` **condition** (not the legacy `browser` field) is the standard mechanism and
  is what Vite already resolves for a client build. No aliasing, no stub, no bundler-specific
  configuration. Measured: Vite loaded `dist/browser.js` and never requested
  `dist/config/loader.js`.
- A dynamic `import()` would have kept one barrel, but it is not a fix. Rollup and Vite
  follow a dynamic import into a chunk, so `node:fs` would still be in the build — the
  failure would move from load time to build time, not disappear. The guard treats
  `import()` as a graph edge for exactly this reason.
- Zero blast radius outside `core`: no consumer's import specifier changes, and the Node
  entry's public surface is byte-for-byte what it was.

**Direction of the default matters.** The *unsafe* export now needs a deliberate act — it can
only be added to `src/index.ts`, a 48-line file whose entire subject is that it is the Node
side of a split. The *safe* barrel is where every ordinary export goes, and it is the one the
guard walks. Before, the polarity was reversed: the safe path was the opt-in one and nobody
opted in.

## D32 — the browser guard walks the import graph, and its complement is asserted

`src/browser.test.ts` does a breadth-first walk of the real static import graph from
`src/browser.ts`, resolving `./x.js → x.ts` the way `tsc` emits, and asserts:

1. no `node:` specifier — and no bare builtin name (`fs`, `path`, …) — anywhere in the graph,
   reported as `<file> imports <specifier>` so a failure names the edge;
2. `config/loader.ts` is not reachable, and `config/parse.ts` still is;
3. the external packages in the graph are **exactly** `['zod']` — an asserted equality, so
   dragging a new npm dependency into the browser bundle is a deliberate edit to that line;
4. every relative specifier resolves (a broken import is also a failure);
5. **the complement is exactly `['config/loader.ts', 'index.ts']`** — of the package's 88
   non-test modules, the walk reaches 86, and the two it misses are the two that make up the
   Node side. This is the assertion that would catch the *extractor* silently missing an
   import form, which is the real failure mode of a guard like this;
6. the two barrels differ by exactly `loadConfig`, in both directions, with identical
   bindings;
7. `package.json` names both entry points and every target has a source file.

Dynamic `import()` and `require()` count as edges. Type-only imports count too: the rule is
cheap to keep and the alternative is a test that has to reason about what erases, which is
the kind of subtlety that let the original defect hide behind three correct docstrings.

The `import`/`export` patterns are anchored at a statement boundary rather than matched on a
bare `from`, because `config/resolveCar.ts` builds the message ``cannot read a … divisor from
"${…}"`` and an unanchored pattern reads that template literal as an import.

The guard was watched failing three ways before being trusted — see the delivery report.

## D33 — the browser guard lives in `core`, not in `viz`

In `core`, not in `viz/src/boundaries.test.ts`. Invariant 6 runs one way: `core` must build
and test with `viz` absent, so a `core` invariant cannot be enforced from `viz`.
`boundaries.test.ts` supplied the technique and keeps its own four rules unchanged.

## One thing the split nearly broke, silently

`dispatch/deadCode.test.ts` distinguishes a *caller* from a *barrel re-export*, and it
identified barrels by `basename(path) === 'index.ts'`. `src/browser.ts` is a barrel by role
and not by name, so the first green build after the split counted the 950-line barrel as a
real consumer of everything it re-exports — and all fourteen `PUBLIC_API_ONLY` entries
reported "now has a caller". The audit that exists to stop dead code reading as live had
been made to read everything as live.

It failed loudly, which is the point: the test asserts its allowlist in both directions, so
the regression surfaced as fourteen named entries rather than as a quietly weaker check.
`isBarrel` now recognises `core/src/browser.ts` as well, with the reason recorded inline.

## Consequences and limitations

- **TypeScript does not apply the `browser` condition.** Under `moduleResolution: NodeNext`,
  a browser-only file importing `@elevator-sim/core` still sees `loadConfig` in the types
  even though the bundle will not contain it. Calling it would typecheck and fail at runtime.
  The mitigation is the explicit `@elevator-sim/core/browser` subpath, whose types are
  `dist/browser.d.ts` and therefore match the runtime. Browser-only code should use it; the
  request to `packages/viz/src/` is in the delivery report.
- `vitest.config.ts` gained an alias for `@elevator-sim/core/browser` ahead of the existing
  `@elevator-sim/core` entry — these are prefix matches, so the shorter key would otherwise
  swallow the subpath and resolve it to `…/src/index.ts/browser`.
- `config/index.ts` no longer re-exports `loadConfig`. Inside `core`, tests already imported
  it from `../config/loader.js`; the one exception (`analytical/docFormula.test.ts`) was
  updated. `index.test.ts` gained `config/loader` as a submodule of its own so its
  "re-exports everything / invents nothing" pair stays total.
- `packages/viz/dev-shims/` and the `resolve.alias` block in `packages/viz/vite.config.ts`
  are deleted.

---

Phase 8, analytical cross-validation and physics-verification tracks. Every decision here is one
the existing docs did not cover; `CLAUDE.md` § Working agreements asks for those to be written down
rather than left in a commit message, and this task may not edit `docs/`.

---

## D34 — The simulated side runs **one bank at a time**, as an isolated building

**Decision.** `upPeakCase.ts`'s `isolateBank` rebuilds a bank as a building of its own — its served
floors at their authored heights and populations, its cars verbatim, its terminal flagged
`isEntrance` with its population zeroed — through `parseBuilding`/`resolveBuilding`. The
reconciliation simulates that.

**Why not simulate the whole tower.** The closed form describes *one group, one zone, every
passenger boarding at one terminal*. On Midtown Office and Garden Apartments the building is the
bank and the question does not arise. On the three new buildings it does, and on one of them there
is no answer:

- **Measured**: Vertical City, whole building, pure up-peak, offered at the rate that saturates
  `zone-1-local` (≈23 % of population per 5 min) — `SimulationError: did not deliver everybody:
  55 of 4907 journeys were still in the system` at the drain deadline. The shuttle saturates far
  harder than the local banks, so there is **no rate** at which the whole tower reproduces the
  closed form's operating point for any one of its banks.
- Mixed-Use High-Rise has the same shape one degree less severely: a residential journey is two
  legs through a sky lobby, and the shuttle is the binding constraint on both.

**Why it is not a fudge.** Three checks:

1. It is a **no-op on the two buildings whose answers are known**. Midtown's isolated closed form
   is bit-for-bit the whole building's: RTT 149.543 s, INT 37.386 s, %POP 6.007.
2. It uses **no code path the shipped loader does not have**. Same technique as the Phase 2 gate's
   knock-out arms, which impose the closed form's simplifications through per-car config.
3. The reconciliation **reproduces the two published residuals** (D8 below). If isolation had
   changed the question, those would have moved.

**Cost, stated.** The isolated building has no inter-bank contention, so the measurement is of the
group rather than of the tower. That is the closed form's own scope, and the tower-level question
— what a sky-lobby transfer costs end to end — is a Phase 6 destination-dispatch question that no
round-trip formula answers.

---

## D35 — `tp` for a `mixed-use` bank is the mean of that bank's own cars

`elevator-specs.json → timing.passengerTransferS` has office, residential and hotel rows and
deliberately **no** `mixed-use` row; `analytical/upPeak.ts` explains why. Every car of both
mixed-use towers declares `passengerTransferS` for exactly this reason, and `resolveCar` refuses to
default it. So the fallback reads the answer the reference data gives rather than inventing one.

Measured: Mixed-Use High-Rise runs 1.75 / 1.20 / 1.75 s across its three banks; Vertical City spans
{1.2, 1.5, 1.75} across seven. A building-wide figure would be wrong on most of them, which is the
defect the Phase 2 gate found on Garden Apartments — reported there as *systematically optimistic*.

---

## D36 — `U` follows onward traffic, but **not** through a bank that also serves the terminal

A shuttle's destinations are handovers: the people it lifts live beyond them. `onwardPopulationOf`
therefore adds the population of every other bank reachable through a destination floor.

The condition that is **not** obvious, and that this task added: a bank which also serves *this
bank's terminal* is skipped. Sharing a destination is not enough to make one group feed another.

- Vertical City's `zone-1-local` opens on the upper ground lobby (floor 2), which is also a shuttle
  stop — but its passengers board at G alongside everyone else and the shuttle lifts none of them.
  Without the condition the shuttle's `U` comes out **4887** (the whole building) instead of
  **2872** (zones 3–6): a 41 % understatement of `%POP`.
- The same condition keeps Secure Tower's two lobby banks independent of each other.

**Validation that this is a derivation and not a transcription:** `analytical/upPeak.ts` works
Mixed-Use High-Rise's shuttle by hand and states *"a true `U` of 1014"*. The rule is not told that
number and reaches it (260 at the sky lobby + 754 on floors 32–60). Pinned in
`bankCensus.test.ts`.

**Scope limit, checked rather than assumed:** the rule follows **one** handover.
`bankCensus.test.ts` iterates it to a fixpoint on every bank and asserts the answer does not
change, so a two-transfer building would fail there rather than be silently understated.

---

## D37 — The departure-gap bracket is computed **per bank**, not per terminal

`metrics/summarize.ts` derives one threshold across every bank serving the terminal, because it
publishes one achieved interval for the building. That is why both mixed-use towers report their
terminals `unmeasurable`: at Mixed-Use's ground lobby a shuttle can hold its doors 41.2 s while an
office-local car completes a whole round trip in 31.3 s.

A per-bank reconciliation does not need one threshold for both. Both bounds are properties of the
bank being measured, and trips are reconstructed per car anyway. So `bankDepartureBracket` uses the
bank's own cars, and a building whose *terminal* is unmeasurable is not thereby unmeasurable bank
by bank. **This is what makes Mixed-Use High-Rise reconcilable at all.**

It does not rescue the three banks whose own bracket is empty. Those stay unmeasurable, and the
mechanism is recorded rather than worked around — see D6.

---

## D38 — Every run in the oracle saturates on purpose, and no waiting time is published

Demand is offered at **1.3 × the closed form's own `%POP`**, the factor the Phase 2 gate settled on
after sweeping 1.0–2.0×. The closed form describes a group that is the constraint; below capacity
the achieved interval is set by the arrival rate and agreement would be an artefact of the demand
knob.

Consequence: replications come back `saturated`, and that is **asserted** rather than tolerated — a
replication that did not saturate would be measuring the wrong thing. `CLAUDE.md` § Statistical
discipline forbids publishing a mean waiting time for a system whose queues grow without bound, so
`UpPeakMeasurement` carries none. Round-trip time, achieved interval and handling capacity are
exactly the quantities that stay well-defined when the queue does not.

**Saturation is a count, not a flag, and 1.3× does not guarantee 100 %.** Measured: the always-on
seed set (810 000 + i, n = 64) gives 64/64 on all five buildings, and that is asserted exactly. The
deep campaign's seed set (820 000 + i, n = 128) gives 128/128 on ten of eleven banks and **127/128
on Garden Apartments**. 1.3× is a mean over a Poisson arrival process, so one 1800 s window in a
hundred happens not to diverge; that is sampling, not a drift in the operating point. The deep
campaign therefore bounds the *fraction* at 95 % and prints the counts, and the always-on file
still asserts its exact 64/64. Neither is a loosened tolerance: the round trip is measured over
departures that left **full**, and a car that left full completed a full round trip whether or not
the building-wide queue diverged in that particular window.

---

## D39 — Three banks are recorded as unmeasurable, with mechanisms, rather than reconciled

Re-derived from the reference data in `bankCensus.test.ts` rather than taken from
`metrics/summarize.ts`'s prose:

| bank | max reopen | min round trip | mechanism |
|---|---|---|---|
| `mixed-use-high-rise/residential-local` | 32.80 s | 31.33 s | 20-person car at the residential 1.75 s; first served floor 3.2 m up |
| `vertical-city/shuttle` | 41.20 s | 30.03 s | 26-person car at 1.75 s; first served floor 4.5 m up |
| `vertical-city/zone-6-local` | 32.80 s | 30.03 s | as the first, at a 3.4 m pitch |

An empty bracket means **no** threshold separates a door reopen from a car that left and came back.
It is a limit of reconstructing departures from boarding times, not a tolerance and not a defect in
the simulator; the fix is a car-position series, which no run record carries.

**Vertical City's shuttle is blocked three further ways**, and any figure published for it must
carry all four:

1. **Double-deck hardware the runtime does not model.** `loadConfig` raises
   `double-deck-not-simulated`; the disclaimer travels in `RunRecord.warnings`. Every round-trip,
   interval and handling-capacity figure for that bank — including the closed form printed in
   `bankCensus.test.ts` — is a **single-deck figure for double-deck hardware**.
2. **No population of its own.** All eight served floors declare `population: 0`; its `U` is
   entirely onward. Isolated, it is a building with nobody in it, and the measurement refuses
   rather than computing `%POP` against zero.
3. **`N` is not the number of destination floors the model means.** Its eight floors are four
   *pairs* 4.5 m apart, and deck assignment at sky lobby A is binding (zone 3 boards only at 26,
   zone 4 only at 27). A single-deck round trip over seven destinations is not the trip that bank
   makes, whatever the timings say.

---

## D40 — The principal bank per building, and why the table has one row per building

The reconciliation table reports the group that carries the building's up-peak from its street
entrance — the bank a reader means when they ask whether the building agrees with the closed form.

| building | principal bank | why |
|---|---|---|
| Midtown Office | `main` | the only bank |
| Garden Apartments | `main` | the only bank |
| Secure Tower | `low` | the larger of two lobby banks by served population (546 vs 446) |
| Mixed-Use High-Rise | `office-local` | the only one of three that both starts at the street entrance and has a measurable bracket |
| Vertical City | `zone-1-local` | the lowest bank starting at the street entrance; the shuttle is blocked four ways |

The other nine banks are enumerated by name in `fiveBuildings.test.ts` — six measurable and covered
by the deep campaign, three unmeasurable — so the gap is stated rather than implied.

---

## D41 — The residual tolerance is unchanged at 4 %, and the two known answers are the check

`DEFAULT_RESIDUAL_TOLERANCE` stays 4 %. It was not widened for the three new buildings and did not
need to be: the worst residual across the five is **1.02 %**.

The load-bearing check is that Midtown Office and Garden Apartments come back where
`docs/07-handoff.md` § 5 left them, measured through the new generic apparatus at a different `n`:

| | handoff § 5 (n=128, whole building) | T13 (n=64, isolated bank, per-bank bracket) |
|---|---|---|
| Midtown Office | +27.5 % INT / −23.2 % %POP → 0.001 % | **+27.6 % / −24.2 % → −0.195 %** |
| Garden Apartments | +7.5 % / −7.1 % → 0.69 % | **+7.3 % / −7.8 % → +1.021 %** |

If the three new buildings had agreed and these two had not, the agreement would have been an
artefact of the new apparatus rather than evidence about the simulator.

---

## D42 — The always-on budget is n = 64; the full budget is moved, not reduced

`docs/03-traffic-and-statistics.md` budgets 50–200 replications. The always-on oracle runs the five
principal banks at **n = 64** — inside that band, at its economical end — for a measured **≈24 s**.
`deepCampaign.test.ts` runs **all eleven measurable banks at n = 128** behind
`ELEVATOR_SIM_DEEP=1`, measured at **111.8 s**. All eleven reconcile; the worst residual in the
whole shipped set is **−1.42 %** (Secure Tower's `high` bank, the one with a 54.7 m express run
below its served zone) and the median is 0.14 %.

The split is deliberate and the reason is `CLAUDE.md` § Working agreements: a budget quietly cut to
fit a CI window is a criterion weakened to make a phase pass, and the number would still be
published, just measured worse. So the budget is *moved* rather than reduced, both files state
their own `n` in a named constant, and the skipped campaign prints that it was skipped.

---

## D43 — `v²/a` understates the acceleration distance; the honest figure is `dRated`

`docs/07-handoff.md` § 5 uses `v²/a` for "the distance needed to reach rated speed" — 6.25 m for
Midtown, 0.66 m for Garden. That expression ignores the jerk ramps. The distance the seven-phase
profile actually consumes is

```text
dRated = v · (2·Tj* + Ta*)     Tj* = a/j, Ta* = v/a − a/j   (when v ≥ a²/j)
```

which is **8.04 m** for Midtown and **1.13 m** for Garden. Both conclusions in the handoff survive
and one gets stronger: Midtown's car misses rated speed by a wider margin than stated (8.04 m
against a 3.8 m pitch, not 6.25 m), and Garden's still reaches it comfortably (1.13 m against
3.0 m). Recorded here because the doc's figure is a lower bound on the real one, so anyone using it
to argue *for* reaching rated speed would be arguing from the wrong side.

---

## Defects found in code this task may not edit

### F1 — `packages/core/src/analytical/upPeak.ts`, two published figures that do not reproduce

In the docstring of `deriveUpPeakTerms`, § *"`U` is a default, and for a shuttle it is the wrong
one"*:

> The default reports 102.8 % of population per five minutes instead of 26.3 %.

Neither figure reproduces at the transfer time Mixed-Use High-Rise's shuttle cars actually declare
(1.75 s). Both reproduce **exactly** at `tp = 1.2 s`, the office value — the transfer time the
runner charged every building before the Phase 2 gate's defect 2 was fixed, and which no car of
that bank declares.

| | at `tp = 1.2 s` (stale) | at `tp = 1.75 s` (declared) |
|---|---|---|
| `%POP` against the sky lobby's own `U = 260` | **102.8 %** | 82.5 % |
| `%POP` against the true `U = 1014` | **26.3 %** | 21.2 % |

The prose was measured before the fix and never regenerated — `CLAUDE.md` § *"A published number
goes stale the same way"*. The 1014 in the same paragraph is correct and is the number D3's
derivation reproduces.

**Not fixed here** (this task may not edit `core`). All four arithmetics are pinned in
`bankCensus.test.ts` § "U follows onward traffic", so a later correction has a checked number to
correct *to*.

### F2 — `packages/core/src/metrics/summarize.ts`, an incomplete bracket census

The `DepartureGapBracket` docstring lists the three banks whose bracket is empty. It does not
mention that a **fourth** is within 1.23 s of joining them: `vertical-city/zone-5-local`, whose
20-person car at the hotel 1.5 s holds its doors 28.80 s against a 30.03 s shortest round trip. The
next-narrowest band is 6.63 s and the widest is 35.43 s, so it is an order of magnitude tighter than
anything else in the set.

Not a wrong number — the bank *is* measurable — but a fragility nothing in the repository watches:
one slower door, one larger car or one upward revision of the hotel transfer time and it becomes
unmeasurable silently. Pinned in `bankCensus.test.ts`; a suggested docstring line is the fix.

### F3 — `docs/07-handoff.md` § 4, the replication-budget table uses the removed quantile family

The table *"Replication budget by target precision"* is stated as being at 90 % confidence on
`s = 3.60 s`. Solved with the **normal** quantile `z(0.95) = 1.6449` it reproduces five of its six
rows exactly and the sixth to within one. Solved with `t[n−1]` — the family every published
interval in this project now uses, after review finding #14 removed the crossover
(`DECISIONS.md` § D7) — it does not:

| target | published | z | `t[n−1]` |
|---|---|---|---|
| ±2 s | 9 | 9 | **11** |
| ±1 s | 36 | 36 | **37** |
| ±0.8 s | 55 | 55 | **57** |
| ±0.5 s | 141 | 141 | **143** |
| ±0.4 s | 220 | 220 | **222** |
| ±0.25 s | 563 | 562 | 563 |

The magnitude is 0–2 replications and no conclusion in the repository changes; the doc's own
reading of the table ("50–200 corresponds to ±0.5–0.8 s") survives, because 57 and 143 are both
inside the band. The **direction** is the finding: the table understates the budget at every rung,
so a reader planning from it publishes a half-width slightly wider than claimed.

It survived because the relative error is largest where precision matters least — +22 % at ±2 s,
+0.2 % at ±0.25 s — so a spot check on the row anybody actually plans from is off by 2 in 143 and
reads as rounding.

**Not fixed here** (`docs/` is outside this task's ownership). Both derivations are pinned in
`validation/publishedFigures.test.ts`, along with the corrected column.

### F4 — Phase 3's published magnitudes were printed but not asserted

`docs/07-handoff.md` § 4 publishes ρ = 0.997 / 0.903 / 0.608 and variance reductions of 99.69 % /
89.77 % / 43.75 %. `crnVarianceReduction.test.ts` measured all six and asserted only that the
reduction was **positive** and that the correlation exceeded **0.3**. A change moving ρ from 0.608
to 0.31 would have passed while the handoff table rotted — the same failure that left the tail study
stale for three phases.

**Fixed in this task**, at zero marginal runtime: the magnitudes are now asserted in the suites
that already compute them.

---

Phase 8's highest-value track, per [`docs/07-handoff.md`](../../../../docs/07-handoff.md) § 7.
Everything here is a decision that shaped the code in this directory; the measurements are in
the task report and are reproduced by running the suites.

---

## D45 — Generate buildings, not just seeds

Re-seeding the five shipped buildings varies one thing: which passengers arrive. It cannot reach
a two-floor building, a single-car bank, a 12 m floor pitch, a shaft that skips floor 13, a
basement entrance, a sky lobby nobody authored, or a bank of six cars. Four of the six properties
are invisible without that variation.

So `generate.ts` produces the **configuration** and runs it through `parseBuilding` (the real
`buildingConfigSchema`) and `resolveBuilding` (the real cross-reference pass). Every case that
reaches the simulator is one `loadConfig` would accept. A fuzzer that emitted invalid configs
would be testing the validator and reporting the result as a simulator finding.

## D46 — Connectivity is a construction guarantee, not a filter

`RoutePlanner.requireRoute` throws when no chain of banks connects two floors. That is *correct*
behaviour for a building nobody could ride, and a **generator** defect rather than a simulator
one. Filtering such cases out after the fact would have hidden how often the generator emitted
them; instead all four topologies are connected by construction (`sky-lobby` and `shuttle` always
share a floor flagged `isTransferFloor`), `FuzzOutcome.skipped` records any that still occur, and
`corpus.test.ts` asserts the corpus produces zero.

The same rule constrains access zones: a zone never covers an entrance or a transfer floor,
because a restricted transfer floor makes a route no single credential can complete and the trace
generator correctly refuses to generate the trip — which would silently narrow the demand instead
of testing anything. `generate.test.ts` asserts it.

## D47 — No new dependency; the shrinker is hand-written

`fast-check` was considered and rejected. Dependency hygiene is part of it — `core` keeps exactly
one runtime dependency (`zod`), `experiments` keeps none beyond `core`, and adding one is a real
decision — but it is not the deciding part.

The deciding part is that a generic shrinker shrinks *values*, and a building config is a graph of
**cross-references**: `servesFloors` names floor ids, `accessZones.floors` names floor ids,
`servesFloorPairs` names pairs of them, and a transfer floor is meaningful only where two banks
meet. Removing a floor id from `floors` without removing it from the three places that name it
produces a config `parseBuilding` rejects, so a generic shrinker's candidates are almost all
invalid and it converges on nothing while burning a replication per attempt.

`shrink.ts`'s five reducers are therefore domain-aware — each removes one building element *and*
every reference to it — and each candidate is re-validated through the real schema before it is
run. Measured on a real counterexample (`fuzz-101`, deadlocked by an injected controller fault):
**11 floors and 2 banks reduce to 2 floors and 1 bank in 11 accepted steps over 20 candidate
evaluations**, a size measure of 815 down to 133. The reduced case still fails the same property,
still resolves through `resolveBuilding`, and still replays to the same verdict — all three
asserted in `shrink.test.ts`.

**The rule that keeps it honest:** a candidate is accepted only if it still violates a property
the *original* violated. A shrinker allowed to wander from a lost-passenger bug to an unrelated
starvation bound would report the wrong minimal case with total confidence.

## D48 — Every draw comes from a named stream (CLAUDE.md invariant 2)

`caseFromSeed` derives seven streams off an injected `StreamSet` — `fuzz.shape`, `fuzz.floors`,
`fuzz.banks`, `fuzz.cars`, `fuzz.access`, `fuzz.run` — one per generation concern. There is no
`Math.random()` anywhere in this directory and no wall clock. Separate streams are not ceremony:
with one stream, changing the floor count would shift every later decision, and a corpus pinned by
seed would reshuffle on any edit to the generator's draw order.

A **shrunk** case is not seed-derivable — `caseFromSeed` returns its unshrunk parent — so
`FuzzCase` is entirely JSON-serializable and `formatOutcome` prints the whole thing. Invariant 5's
spirit: a finding nobody can replay is a rumour.

## D49 — Two properties are stated in order-invariant form, because the record cannot support more

This is the one place a property was *weakened*, and it was weakened because the stronger form was
**wrong**, not because it was inconvenient.

A stop boards several people at one simulated instant, and the record does not preserve the order
they went in. `Simulation.#boardFrom` admits while `massBefore < designLoadKg`, so exactly one
boarder may cross the cap — but *which* one is an ordering fact. A first draft asserted "the mass
before this boarder was under the cap" against a reconstructed order, and reported a violation on
a run that had obeyed the rule perfectly (`fuzz-116`, car `high-high-1`, 1380.1 kg against a
1379.2 kg design load — the reconstruction had simply put a lighter passenger last).

What survives every reordering, and is implied by the model for all of them:

- `total < overloadKg` — the admission test is `massBefore + candidate < overloadKg`, and the
  final boarder's instance of it *is* this, whoever the final boarder was;
- `total − heaviest < designLoadKg` — boarding stops the moment the cap is crossed, so removing
  whoever crossed it leaves the car under the cap, and the heaviest occupant is at least as heavy
  as that person.

A car with one extra body in it fails both by a whole passenger, which the fault injection
demonstrates. The stronger per-boarder form would need the recorder to preserve intra-stop
boarding order; that is a `core` change and is not in this track's scope.

## D50 — Deadlock is measured against the deadline, not against `endedAt`

`docs/07-handoff.md` asks for "no state where calls exist, cars are idle, and nothing is
scheduled". *Nothing is scheduled* is precisely the case where the run **stops early**: the kernel
runs out of events and `endedAt` lands wherever the last one was, so `endedAt − lastActivity` is
zero however completely the group has stalled. A first draft used exactly that and measured
nothing — a run with 101 servable passengers still on the landings scored an idle time of 0.0 s.

`checkTermination` measures `deadlineS − lastActivity`, which is large for both shapes of stall:
the run that idles to its deadline, and the run that quietly runs dry with people waiting. A
legitimately truncated run — one whose next event would fall past the deadline, so it is not
scheduled — loses at most one car event, two orders of magnitude inside the 600 s bound.

## D51 — The two bounds are stated, and are discriminators rather than restatements

`PROPERTY_BOUNDS` carries two numbers and both are chosen so the property says something the run
does not already say about itself:

- **`deadlockIdleBoundS = 600`.** A saturated system is *not* idle — its cars board and alight
  continuously and only the queue grows — so an idle-time bound distinguishes deadlock from
  saturation instead of re-detecting it.
- **`starvationBoundS = 900`.** `docs/03-traffic-and-statistics.md` treats anything past 60 s as a
  bad wait and the shipped buildings run at 10–30 s AWT, so a quarter of an hour is two orders of
  magnitude out. The property fires **only if the run is not flagged** (`awtIsValid` and a
  `stable` saturation verdict), which is `CLAUDE.md` § Statistical discipline's own rule: a
  diverging queue must be flagged and its AWT suppressed, and a run that does so is reporting
  honestly however long the waits were.

Neither was moved to make a case pass. The starvation demonstration in `faults.test.ts` *searches*
for a (case, floor) pair rather than pinning one, and the search is the interesting half: on a
case already near capacity, starving a landing makes the queue diverge and the simulator correctly
flags the run, so the property does not fire — and should not.

## D52 — Always-on 64 cases, deep opt-in; what each covers is stated, never capped

The full suite is ~200 s of CI on an idle machine. A fuzz track that added ten minutes would be
turned off inside a week and would then protect nothing.

- **Always-on** (`corpus.test.ts`): 64 pinned seeds in `STANDARD_SPACE`, one replication each,
  about a second of wall clock. Pinned so it is a regression suite and a failure is a seed
  somebody can type. Its coverage claims — every topology, single-car banks, access zones with and
  without a credential at the landing, basements, two entrances, mixed-use, the two-floor
  building, and the declared ceilings — are **asserted** by `generate.test.ts`, because a
  generator edit that quietly narrowed the corpus would otherwise leave it green and the claim
  false.
- **Deep** (`deep.test.ts`): opt-in via `ELEVATOR_SIM_FUZZ=deep`, `ELEVATOR_SIM_FUZZ_CASES` cases
  (250 by default) in `DEEP_SPACE` — up to 40 floors, 6 cars a bank, 30-minute horizons, demand
  well past handling capacity, and the only place `constant-iso` is reachable.

## D53 — Faults are injected, not simulated

Four properties are predicates over a finished `SimulationResult`, so their faults are corrupted
results — and each corruption is built so the **simulator's own audit still says everything is
fine**. `withLostPassenger` deletes a leg *and decrements `conservation` to match*, leaving
`balanced: true`, so a property that merely echoed `result.conservation` would sail past it. That
is the point of the demonstration: the checks are independent re-derivations, not restatements.

Two properties are claims about behaviour and cannot be forged in a record, so they are injected
into a **real run** through `SimulationConfig.createPolicy` — the hook `sim/types.ts` documents
for instrumentation. The injected policy is a `Proxy` over the shipped one with stages 2–5
subverted for the calls a predicate names; a `Proxy` rather than a hand-written delegate because
the policies carry private fields, and every other method is the real one bound to the real
object. The physics, doors, trace and recorder are untouched, so the run really does deadlock.

## D54 — Exported from the package barrel, with two names renamed rather than omitted

`fuzz/` goes on `@elevator-sim/experiments`'s public surface for the reason `benchmark/` and
`tuning/` do and `validation/` does not: what a consumer needs from here is a **library** — a
generator, six predicates over a finished run, and a shrinker — not the gate. The gate stays in
`fuzz/*.test.ts`.

Two names collided with names the barrel already carries, and `tsc` found both, which is the whole
reason that barrel is written by hand rather than with `export *`:

- `simulationConfigFor` — `runner/`'s builds a *cell's* config from an experiment spec;
- `formatCase` — `benchmark/`'s formats a benchmark case.

Both are resolved by **renaming at the source** (`fuzzSimulationConfigFor`, `formatFuzzCase`)
rather than by omission, following `tuning/index.ts`'s `SearchCandidate` precedent: a consumer
gets both surfaces, and neither can silently shadow the other in a file that imports both. Nothing
is held back, so `index.test.ts`'s structural coverage check applies to the whole module — which
required registering `fuzz` in that test's `submodules` map, the one edit this track made outside
its own directory and the package barrel.

**On `docs/05-roadmap.md`'s standing requirement — name the non-test caller.** This track's
honest answer is weaker than `tune`'s answer for `tuning/`, and it is stated rather than dressed
up: the non-test consumer of `fuzz/` is `campaign.ts` itself, driven by `deep.test.ts` under
`ELEVATOR_SIM_FUZZ=deep`. What keeps the surface from being dead is not a CLI command — there
isn't one — but that `corpus.test.ts` executes `runCampaign` against the real `data/` directory on
every `vitest run`, and `generate.test.ts` fails when the corpus stops covering what it claims. A
CLI `fuzz` command would be a real improvement and is not built here.

---

## The campaign actually run

Measured on 2026-07-28 on the final code, on a machine running four other builds concurrently, so
the wall-clock figures are pessimistic.

| | always-on (`corpus.test.ts`) | deep (`ELEVATOR_SIM_FUZZ=deep`) |
|---|---|---|
| generated buildings | 64 | 2 000 |
| replications | 64 (one per case) | 2 000 |
| passengers generated | 7 889 | 1 396 887 |
| simulated time | 14.17 h | 1 217.27 h |
| wall clock | **≈1.0 s** | 568 s |
| run outcomes | 59 completed, 5 timed-out | 1 205 completed, 795 timed-out |
| topologies | single 24, parallel 17, sky-lobby 14, shuttle 9 | single 520, sky-lobby 505, shuttle 492, parallel 483 |
| property violations | **0** | **0** |
| unroutable / invalid generated | 0 | 0 |

The whole fuzz directory adds **≈3 s** to `vitest run` (six suites, 21 tests plus one skipped),
against a baseline suite of ~200 s. The always-on corpus is about a second of that; the rest is
the fault injections, the shrink demonstration and the determinism pass.

Zero failures is a claim about the *simulator*, not about the properties: all six are shown to
fire on injected faults in `faults.test.ts`, and the two false positives the campaign produced
against **first drafts of the properties** are recorded above as D5 and D6.

---

## What remains unfuzzed, and why

Stated rather than discovered later.

| Axis | Why not |
|---|---|
| **Double-deck banks** (`servesFloorPairs`, `deckSeparationM`, `ratedLoadLbPerDeck`) | The runtime does not simulate them — `WARNING_CODES.doubleDeckNotSimulated` says so out loud — so fuzzing them would fuzz the parser. Phase 6. |
| **Out-of-service cars** | Not authorable: `carConfigSchema` has no service-mode field, and `INELIGIBILITY_REASONS.serviceMode` is reachable only from a `CarSnapshot` a run constructs itself. Generating one needs a `core` change. |
| **`floorRanges`** (the compact floor form) | Generated buildings use the explicit `floors` form only. `expandFloors` has its own suite; what this track adds is variation the *simulator* sees, and both forms resolve to the same `ResolvedBuilding`. A generator that emitted both would be re-testing `expandFloors`. |
| **Mid-run mode changes** | No mechanism exists to change a dispatcher, a zone or a car's availability during a run. Listed in the Phase 8 table as its own adversarial-edge-case track. |
| **Dispatcher weight vectors** | Cases draw a *shipped* profile id. Fuzzing weights is Phase 7's search space (`tuning/space.ts`), which already samples them; fuzzing them here would duplicate it and make a counterexample two variables wide. |
| **Statistics** | One replication per case. Nothing here says a mean is right — only that the mechanics under it are sound. Phase 3's `validation/` suites own the statistical claims. |
| **`elevator-specs.json` and `traffic-profiles.json`** | Held fixed as reference data. Fuzzing the reference data tests the loader, and a counterexample against invented elevator classes tells an engineer nothing. |
| **Persistence and replay round-trips** | `reports/replay.test.ts` and `validation/storedRunReplay.test.ts` own that; a fuzz case is evaluated in memory. Feeding generated buildings through `serializeRunRecord`/`parseRunRecord` is a clear next step and is not done here. |
| **Multi-replication CRN alignment on generated buildings** | `runner/crn.test.ts` owns it for shipped buildings. A generated-building CRN check would be a strong addition to the deep campaign. |

---

Decisions taken while landing **Phase 6a — destination *disclosure*** (`feat/phase6a-disclosure`).
Recorded here rather than in the repository's `DECISIONS.md`, which this task does not own. Anything
below marked **HANDBACK** needs an owner outside `packages/experiments/src/benchmark/**` and `data/`.

Every number quoted is measured in this worktree, at seed `20260726`, against the real `data/`
directory. Nothing is transcribed from `docs/09-destination-dispatch-contract.md`; where a figure
agrees with the contract that is a reproduction on a different seed set, and where it disagrees the
disagreement is stated.

---

## D56 — The shipped destination profile authors `mobile-credential`, not `destination-entry`

**Context.** `DECISIONS.md` § D30 rules that a destination-entry kiosk **authorizes**. Implementing
that is panel-stage authorization in `Simulation.#openCalls` — a `core` change, and Phase 6b's. Until
it lands, `costRequestFor` (`core/src/dispatch/lifecycle.ts:106-134`) forwards the destination under
`destination-entry` and **drops the credential**, so `estimateCost` is asked whether an unbadged
passenger may reach a zoned floor.

**Measured, at the interfloor-mix operating point, 300 replications:**

| arm on `secure-tower` | replications with no quotable AWT | unserved |
|---|---|---|
| `eta`, `up-down-buttons` | 259 / 300 | 33.5 % |
| `eta`, `destination-entry` | 259 / 300, and **worse**: 51.7 % unserved | 51.7 % |
| `destination-eta`, `mobile-credential` | **0 / 300** | **0.00 %** |

**Chosen.** `data/dispatcher-profiles.json` ships one destination profile and it authors
`dispatch.callType: mobile-credential`. **Why:** a shipped profile that breaks one of the five
shipped buildings is not a dispatcher, it is a defect with a name; and on a building with no
`accessZones` the two call types are bit-identical, so nothing is given up. `destination-entry` is
still measured — as a derived arm in `accessControl.ts`, where its failure *is* the result that
justifies D30 rather than an inconvenience.

---

## D57 — The shipped profile does **not** weight `rideTime`, and that is a blocked promotion — **HANDBACK**

**Context.** The natural Phase 6a profile is `{waitTime: 1, rideTime: 1}` with
`callType: mobile-credential`. It cannot ship today.

**The blocker, precisely.** `packages/core/src/dispatch/policies/policies.test.ts`'s
*"has no weight that contributes nothing"* scores every shipped profile over
`contributionScenarios()` and requires every weighted term to reach a positive contribution in at
least one of them. All three scenarios build their call from
`packages/core/src/dispatch/policies/fixtures.test-helper.ts`'s `call(floorId, direction,
registeredAt)`, which sets **no `destinationFloorId`**. `costRequestFor` therefore forwards no
destination, and `rideTime` — the only term in the library with an `activeWhen` — returns 0 for
every car in every scenario **by construction**. Adding the weight makes that assertion fail with
`{ 'destination-eta': ['rideTime'] }`, and the failure is a fixture gap rather than a defect in the
profile.

That it is a fixture gap is provable from the file itself: the very next test,
*"makes a weight its stage settings gate off bite the moment the declared condition is met"*
(around line 459), takes `contributionScenarios()[1]` and spreads
`{ destinationFloorId: '19', destinationFloorIndex: 19 }` onto its call — and then measures
`rideTime` at 0 under `up-down-buttons` and above 0 under `destination-entry`. The apparatus already
exists; the contribution scenarios simply never had a destination on them, because until this branch
no shipped profile weighted the one term that needs one.

**The fix, for whoever owns `packages/core/**`.** Give the three scenarios a destination — either on
`call()` in `fixtures.test-helper.ts` or on the scenarios in `policies.test.ts` — and add a
`rideTime` row to that function's *"Each scenario exists for the terms it is the only one to feed"*
table. Then `data/dispatcher-profiles.json` can carry `weights.rideTime` on `destination-eta` and
this branch's derived `+ride1` arm becomes the shipped profile.

**Chosen until then.** The shipped profile authors the call type and no gated weight; the three
`rideTime` weights (0.3, 1.0, 2.0) are **derived profiles** built by `harness.derivedProfile`, which
is the mechanism this repository already uses for a study variant (`withoutReassignment`,
`parkingVariant`). Every measured result in Phase 6a is produced against them, so nothing is lost
except the promotion. **Why not ship it and leave the suite red:** a `data/` change that reddens a
`core` guard blocks integration for four concurrent branches, and the guard is not wrong — it simply
cannot see this configuration.

---

## D58 — Phase 6a's operating points are `DESTINATION_CASES`, not a fourth `BENCHMARK_CASES` row

**Context.** `arms.ts` needed a case for Midtown interfloor-mix. The obvious move is to append it to
`BENCHMARK_CASES`.

**Chosen.** A separate `DESTINATION_CASES`, same `BenchmarkCase` type, censused by the same suite.
**Why**, in the order it binds:

1. `BENCHMARK_CASES` is *Phase 5's* gate — its own docstring calls it "the three cases the acceptance
   criterion is argued on". A fourth row silently changes what a landed, accepted phase was argued
   on.
2. Its baseline is `nearest-car`; Phase 6a's reference arm is `eta`, for the reason docs/09 § 2.3
   gives — `nearest-car` is the only profile that saturates anywhere and it caps the budget.
3. On `secure-interfloor-mix` **both** conventional profiles are unquotable on every replication, so
   a Phase 5-shaped table there would have no cells at all rather than the categorical result that
   is the finding.

The shipped `destination-eta` **is** added to `ARM_PROFILES`, because
`dispatcherBenchmark.test.ts` requires every shipped profile to be the baseline or an arm and a
profile that escaped that gate would escape the whole Phase 5 table. It is bit-identical to `eta` on
all three Phase 5 cases, which is correct — none of them is access-zoned in a way the credential
changes — and its 12 new pins duplicate `eta`'s. **No existing pin moved**, verified by diffing the
regenerated table key by key before pasting it.

---

## D59 — OQ-5 settled: neither of `arms.ts`'s ceilings transfers, and one of the new points has none

**Measured** over 1000 replications at Midtown interfloor-mix, every Phase 6a arm plus `nearest-car`:
**no arm loses its AWT, at any index.** `nearest-car` first fails at replication 287 on the *same
building* at up-peak; at the interfloor point the lobby plateau never forms and it survives all 1000.
So `admissibleReplications` is `undefined` and `n` is a choice.

Over 300 replications at Secure Tower interfloor-mix: `nearest-car`, `eta` and the bare-kiosk arm are
invalid **from index 0**; every credentialled arm is clean throughout. `admissibleReplications` is
recorded as `0` — there is no budget at which that case's arm list is uniformly quotable, which is
why H-ACCESS-1 is counts and not an interval.

**Budget, re-derived rather than copied.** `sd(ΔTTD)` at the shipped weight is 2.195 s measured at
n = 150 here (the contract's pilot said 2.1–2.7 s on a different seed set). `n = 150` puts the
95 % half-width at 0.354 s against a 1.562 s effect — 4.4× margin — and is inside `CLAUDE.md`'s
50–200 band with no ceiling forcing it there. ±0.5 s on TTD would need n ≈ 75; ±0.5 s on **WT95**
would need n ≈ 305, which is why WT95's interval is the widest thing in the table and is reported
with its required `n` rather than narrowed by picking a budget after seeing it.

---

## D60 — H-ACCESS-2 is **refuted**, and *seven* places assert the refuted mechanism — **HANDBACK**

Measured at n = 150 per building under CRN, in both absolute and baseline-relative form, the
difference-of-differences `Δ_secure − Δ_midtown` excludes zero **on the positive side**: given the
credential, pricing the destination buys *less* on the access-controlled building than on the one
with no access zones. The saving is real and it is entirely in the credential (H-ACCESS-1), which is
a claim about **authorization** and not about **optimization**.

`DECISIONS.md` § D30 anticipated this and named four places needing correction. Grepped rather than
counted, there are **seven**, and none of them is this task's file:

| # | place | what it asserts |
|---|---|---|
| 1 | `docs/01-architecture.md:103-105` | "destination dispatch is *better* under access control, because … authorize and optimize in the same step" |
| 2 | `docs/05-roadmap.md:549-550` | "demonstrating that destination dispatch improves *because* authorization and optimization happen in the same step" |
| 3 | `docs/07-handoff.md:271-273` | "destination dispatch should be *better* under access control, because …" |
| 4 | `packages/core/src/dispatch/lifecycle.ts:100-104` | "which is precisely why destination dispatch does better under access control" |
| 5 | `packages/core/src/model/types.ts:122-124` | "destination dispatch does better under access control precisely because …" |
| 6 | `packages/core/src/model/car/types.ts:470-473` | the same sentence, on `CostRequest` |
| 7 | `packages/core/src/sim/simulation.ts:2020-2022` | "access control is cheaper when authorization and optimization happen in the same step" |

**Not** on the list, and correct as written: `packages/core/src/model/car/estimateCost.ts:123`, which
says only that the destination *lets* a dispatcher authorize and optimize in one step. That is a
description of the code and it is true; what is refuted is the performance claim built on it.

The correction each of the seven needs is the same sentence: *the credential is what makes an
access-controlled building servable at all — conventional dispatch cannot serve it under any budget;
the destination's contribution to **optimization** is smaller there than on an unzoned building,
because once the credential is present the access check has already passed and Secure Tower's three
identical cars per bank leave less for a destination to differentiate.*

Note also that `validation/documentation.test.ts` does **not** currently pin any of these seven
strings, so nothing goes red when they are corrected — and nothing went red while they were wrong,
which is the same defect class as a published number nothing re-derives.

---

## D61 — Negative controls are reported with an interval as well as a count

**Context.** docs/09 § 2.2 records the blind operating points as bit-identity counts (Garden 30/30,
Midtown down-peak 29/30). Reproduced here at `rideTime` 0.3, Garden is **exactly** 30/30 identical.
At the shipped-arm weight of 1.0 it is 29/30, and Midtown up-peak differs on 5 of 30 with individual
replications moving by up to 11.6 s in *both* directions.

**Chosen.** Each control reports its differing-replication count **and** a paired-t on TTD with a
verdict. **Why:** a count answers *"does anything change at all?"* and nothing else, and at
Midtown up-peak the honest answer to "how much" is *not resolvable at this budget* rather than
*nothing*. All four controls come back `INDISTINGUISHABLE` at n = 30 while the primary point is
`BETTER` by 4.4× its half-width at the same weight, on the same commit — which is what separates an
expected zero from a wiring zero. The predictions are stated in `NEGATIVE_CONTROLS` **before** the
run and are not edited to match the result; where the contract's 30/30 no longer holds at a higher
weight, that is recorded rather than smoothed.

---

## D62 — No new export from `benchmark/index.ts` — **HANDBACK**

`packages/experiments/src/index.test.ts` requires the package barrel to re-export **every** runtime
value from `benchmark/index.ts`, and `packages/experiments/src/index.ts` is not this task's file. So
the three new study entry points are deliberately **not** added to `benchmark/index.ts`; they are
reachable at `benchmark/destinationDisclosure.js`, `benchmark/accessControl.js` and
`benchmark/destinationLiveness.js`, and their non-test caller is `benchmark/regeneratePins.ts`,
exactly as `runTailStudy`'s is.

If the barrel owner wants them on the package surface, the names are:

```
runDestinationDisclosureStudy  runNegativeControls  formatDisclosureStudy  disclosureArm
disclosureProfiles  disclosureCase  rideArmId  replicationsForHalfWidth
DISCLOSURE_BASELINE  DISCLOSURE_PROFILE  DISCLOSURE_METRICS  DISCLOSURE_METRIC_LABELS
RIDE_TIME_WEIGHTS  DEFERRED_ARM  NEGATIVE_CONTROLS  MIDTOWN_DOWN_PEAK_1PCT
runAccessControlStudy  formatAccessControlStudy  accessControlProfiles  differenceOfDifferences
BARE_KIOSK_ARM  CREDENTIAL_ARM  CREDENTIAL_PLUS_DESTINATION_ARM
measureDestinationLiveness  formatDestinationLiveness  livenessCases
DESTINATION_CASES  destinationCase  MIDTOWN_INTERFLOOR_MIX  SECURE_INTERFLOOR_MIX
MIDTOWN_UP_PEAK_1PCT  GARDEN_RESIDENTIAL_2PCT  SECURE_UP_PEAK_2PCT
```

They must be added to `benchmark/index.ts` and `src/index.ts` **in the same commit**, or
`index.test.ts` goes red.

---

## D63 — Pre-existing failure this branch did not cause — **HANDBACK**

`packages/experiments/src/validation/documentation.test.ts` *"lists every docs/*.md on disk"* fails
on `integration` before any change on this branch: `docs/09-destination-dispatch-contract.md` landed
without a matching row in `README.md`'s documentation table. `README.md` and `docs/**` are not this
task's files. Verified as pre-existing by running the full suite at `09b486f` before touching
anything: **133 files / 2641 tests, 1 failed — that one.**

---

Decisions taken while completing Phase 4 (building editor, live metrics overlay, the UX cycle).
`DECISIONS.md` at the repository root is not mine to edit; these belong there and are recorded
here so the orchestrator can lift them.

---

## D63 — `VIZ_SCHEMA_VERSION` 2 → 3: `VizRecording.legs`

**Decision.** The recording grows one field, `legs: readonly VizLeg[]` — seven columns of
`PassengerRecord`: `passengerId`, `originFloorId`, `direction`, `arrivedAt`, `boardedAt?`,
`carId?`, `bankId?`. The version goes to **3**.

**Why now and not in wave 1.** `DECISIONS.md` D15 reserved exactly this change and made one
condition: it lands **with its first consumer**, because a configurable, unit-tested field with no
reader is the defect this repository has shipped eight times. Wave 2 is that wave. Both consumers
are in the same commit:

| Consumer | Reads | Row it makes reachable |
|---|---|---|
| `frame/overlay.ts` `overlayAt` | `arrivedAt`, `boardedAt`, `bankId` | the windowed figures of the live metrics overlay |
| `frame/overlay.ts` `landingAssignmentsAt` | `originFloorId`, `direction`, `arrivedAt`, `boardedAt`, `carId`, `bankId` | `RV-T3` — hovering a landing names the car that answers it, *from the record* |

`passengerId` is the tie-break that makes the array's order total; its consumer is the sort in
`describeLegs` and the ordering assertion in `recordRun.test.ts`.

**What was deliberately left out.** `massKg`, `journeyId`, `legIndex`, `credentialGroup`,
`destinationFloorId` and `alightedAt` are all on `PassengerRecord` and none is copied. Nothing here
reads them. Copying them "while we are in there" is how a contract acquires six fields and one
consumer.

**Why the fold was not replaced.** `VizProgress` stays. The two projections are built by different
code from the same passengers, and `recordRun.test.ts` compares them — agreement is evidence, and
would be unavailable if one were derived from the other.

**Consequence for `PB-15`.** Version 2 recordings are now genuinely unreadable by this build: they
have no `legs`, and the overlay would report an empty window on them rather than fail. That is why
`readRecordingDocument` refuses an *older* version as well as a newer one, which is the first time
the constant has had a reader that could disagree with it (D16's condition).

---

## D64 — the overlay suppresses estimates and keeps observations

**Decision.** `OverlayMetrics` splits its fields in two and suppresses only one half when
`recording.summary` says the run saturated:

| Kind | Fields | Suppressed? |
|---|---|---|
| Observation | `waitingNow`, `longestCurrentWaitS`, `boardedInWindow`, per-bank `boardedInWindow` | **no** |
| Estimate | `rollingMeanWaitS`, per-bank `meanWaitS` | **yes**, replaced by the reason |

**Why.** `CLAUDE.md` forbids reporting a mean for a system whose queues grow without bound, and a
*moving* line is more persuasive than a table, so the rule binds here harder than in the CLI. But
suppressing the counts as well would remove the only thing that lets a reader **see** the
divergence — on `midtown-office` the queue climbs to 140 people at a landing, and that number is an
observation about the recording, not an estimate of a steady state.

`suppressed` is copied from `summary.saturated || !summary.awtIsValid`, never recomputed. `UX.md`
§ 7.1 rule 4.

**Measured, not assumed.** At the shipped traffic rates over 900 s: `midtown-office`,
`mixed-use-high-rise` and `vertical-city` saturate; `garden-apartments` and `secure-tower` do not.
`frame/overlay.test.ts` asserts suppression on the first group and **reports the mean** on the
second — a suppression rule that fired everywhere would be indistinguishable from a module that
computes nothing.

**Not added:** a windowed `WT95`. A 95th percentile over a 300-second window of ~20 legs is not a
figure this project should draw, and adding it would have been the easy half of the same decision.

---

## D65 — three new modules, and why they are not in three new directories

**Decision.** `overlayAt` lives in `frame/overlay.ts`; the recording load path lives in
`record/document.ts`; the editor's four pure modules are **flat files at `packages/viz/src/`**
(`editorEdits.ts`, `editorValidate.ts`, `editorHistory.ts`, `editorPreview.ts`).

**Why.** They were written as `metrics/`, `recording/` and `editor/`, and `core`'s
`sim/moduleTree.test.ts` went red: it compares every source directory under `packages/*/src`, at
any depth, against the module tree in `docs/01-architecture.md`, **in both directions**. A new
directory here needs a line in that doc, and `docs/` is not this task's to edit.

Two of the three moves are homes rather than compromises — `overlayAt` is a pure
`(recording, t) → …` producer exactly like `frameAt`, and reading a recording belongs beside
writing one. The editor is the compromise.

**Handback.** `docs/01-architecture.md` should gain `viz/editor/` under `viz/`, and the four
`editor*.ts` files should move into it in the same change. Nothing else needs to move.

---

## D66 — the boundaries grep is about code, not about prose

**Decision.** `boundaries.test.ts` now strips **string literals** as well as comments before
applying the DOM rule, using a character scanner; template-literal `${…}` substitutions survive
because they are code. Two positive controls were added.

**Why.** The viewer prints `the document is not a JSON object` and draws
`showing 6 of 12 shafts — widen the window`, and under a raw grep for `\bdocument\b` / `\bwindow\b`
both are DOM access in modules that have none. The cheap fix — matching only `document.` and
`window.` — is the wrong one: it stops catching a bare `document` used as a value, which is exactly
the shape of the one **real** finding this rule produced (a method parameter named `document`,
shadowing the global, in what is now `editorHistory.ts`).

The rule's teeth are now asserted rather than assumed: `dev/main.ts` and `dev/editor.ts` genuinely
touch the DOM and **must still trip the pattern after stripping**. That control caught the first,
regex-based version of the stripper, which anchored on any `}` in the file and silenced
`dev/main.ts` entirely.

---

## D67 — the editor never renders a second opinion about legality

**Decision.** `editorValidate.ts` reports issues from `parseBuilding` / `resolveBuilding` and
computes none of its own. It reports **every** issue of the furthest stage reached, and says when
that stage was not the last one.

**Why the stage matters.** A document that fails the schema never reaches cross-referencing, so
schema issues and cross-reference issues cannot both be collected in one pass. The honest report is
"here is everything this stage found, and there may be more once these are fixed" — a list of five
that silently *becomes a different five* after a fix is `ED-20`'s defect with better manners.

`ED-T8`'s guarantee — one control from a valid edit to a run — holds because "valid" means
`resolveBuilding` accepted it, and the run uses the same call (`resolveEdited` in `dev/data.ts`).

---

## D68 — the load bar's track is scaled past 1

**Decision.** `loadTrackMax` returns `max(1.1, max loadFactor)`, and the panel draws a full mark at
`1.0` inside that track. Four colour bands: `< 0.5`, `< 0.8`, `≥ 0.8` (the fill rule), `≥ 1.1` (the
alarm), the last always accompanied by a `!` glyph.

**Why.** `RV-14` says the bar must not silently clip at 1, and `D18` recorded that the old renderer
changed colour at 0.8 — the 80 % *fill rule* — while calling it the overload state. They are
different facts about a car and now have different thresholds, different colours and, for the
alarm, a non-colour signal.

---

## D69 — four things found by running the UI, not by reading it

Recorded because each is the kind of defect a green suite does not see, and each now has a test.

1. **The landing selector was populated once, at `startedAt`**, where nobody is waiting — so it
   offered exactly one option for the whole run and `RV-T3` was unreachable through the shipped UI.
   Its "has the option set changed?" key started at `''`, which is also the key of an *empty* set.
2. **Floor labels overflowed the gutter.** `vertical-city` names floors `Zone 5 hotel`; right-
   aligned text loses its *start* when it overflows, so the identifying half vanished off the
   canvas. `fitLabel` now clips to the gutter.
3. **Forced reference labels collided with strided ones.** Thinning kept every sky lobby and then
   drew it on top of its neighbour. The rule now reserves room both behind and ahead.
4. **The overlay panel overran its box.** On `vertical-city` (7 banks) the bank list pushed the
   car-load section — the one carrying the overload alarm — off the bottom; on `midtown-office` the
   8-line suppression reason did the same. Both lists are now bounded, both say what they left out,
   and the reason is capped at a third of the room available.

A fifth and a sixth, in the same class:

5. **The import applied an invalid document.** `ED-06` says issues are shown *before* anything is
   applied; a file naming an unknown elevator class and two floors that do not exist silently
   replaced the open building, because the *schema* had accepted it. It now lists the issues and
   asks, with an affirmative button that says what it does.
6. **The confirm dialog could hang.** The promise behind it waited on `<dialog>`'s `close` event,
   and in the automation context this was driven through, a form submit closed the dialog and set
   `returnValue` **without firing `close`** — so Discard, Import and Open-another silently did
   nothing. It now settles on whichever of `close` / `cancel` / either button arrives first,
   latched so it settles once. Environment-specific in origin; the fix is not.

## Handed back — things T11 could not change

- **`docs/01-architecture.md` § Module layout** should gain `viz/editor/` under `viz/`, after which
  `editorEdits.ts`, `editorValidate.ts`, `editorHistory.ts` and `editorPreview.ts` move into it.
  See T11-3. `core`'s `sim/moduleTree.test.ts` enforces the doc in both directions, which is why
  the four files are flat today.
- **`docs/05-roadmap.md` § Phase 4** carries the per-bullet table (`⬜ not built` for the editor,
  `⚠️ half` for the overlay). Both bullets are now built; the table and the phase verdict are the
  orchestrator's to update.
- **`DECISIONS.md`** — the eight entries above.
- **`TEST_MATRIX.md` § 3** holds ten placeholder rows waiting for `UX.md`'s ids. Eighty-seven ids
  now carry a state and a means of verification (`UX.md` § 7.0); copying them across is a
  mechanical job outside this task's files.
- **`ED-12` is a `core` question.** The row wants a zero-car bank to be a *warning*;
  `bankConfigSchema` makes it an error (`a bank must have at least one car`). Whoever owns the
  schema should decide which is right — the editor must not be the place the two disagree.

## D70 — three things the mutation harness found that reading would not have

Forty-six mutations, each replacing one rendered value with a constant. Four survived the first
pass and one the second; every one was a real gap, and the third is the interesting one.

1. **The rolling mean could be the constant `12`** and the suite stayed green: every assertion
   about it was either a bound (`> 0`) or a comparison against a value the panel had itself taken
   from `overlayAt`. Now recomputed from `recording.legs` independently, on every shipped
   building, at three window lengths. The per-bank mean had the same hole.
2. **`serializeBuilding`'s field ordering could be deleted.** The test serialised the shipped
   file, whose keys are *already* canonical. It now starts from a shuffled document.
3. **The overlay's "no room for any car" branch could be replaced by a bare heading** — because
   no panel can reach it. With `MIN_PANEL_HEIGHT_PX` at 200 there is always room for one car row,
   and below 200 the panel is not drawn at all. It was unreachable code with a plausible-looking
   test; it was **deleted**, not given a test that constructs a panel the layout never produces.
   The bank list's equivalent line stays, because that one is reachable and was seen on screen.

---

Decisions taken while landing **Phase 6b** (`feat/phase6b-dispatch`). Recorded here rather than in
the repository's `DECISIONS.md`, which this task does not own. Anything marked **HANDBACK** needs an
owner outside `packages/core/**`.

Every number below was measured in this worktree at seed `20260726` against the real `data/`
directory, through `runSimulation`. Nothing is transcribed from
`docs/09-destination-dispatch-contract.md`; where a figure agrees with the contract that is a
reproduction, and where it disagrees the disagreement is stated.

---

## T16-D1 — Level 1 is a **declared tunable of its own**, not a consequence of `callType`

**Context.** `dispatch.callType: destination-entry | mobile-credential` moves the destination into
the cost request. Phase 6a shipped that (Level 0, "disclosure") and pinned twelve published figures
against it. Phase 6b is the *passenger-model* change (Level 1, "dispatch"): the passenger is told
which car to walk to and boards only that car. The two are separate systems — docs/09 § 1.1 — and
arms C and D of the contract's study differ in exactly this.

**Alternatives.** (a) Make a destination `callType` imply per-passenger assignment. (b) A new
declared categorical.

**Chosen:** (b) — `dispatch.passengerAssignment: 'none' | 'panel'`, default `none`, gated
`activeWhen: { 'dispatch.callType': ['destination-entry', 'mobile-credential'] }`.

**Why.** (a) would silently change the shipped `destination-eta` profile's behaviour and move every
Phase 6a pin, and worse, it would make arms C and D inexpressible — the contrast the phase exists to
measure would have no configuration. It would also conflate a change that keeps all nineteen
replication metrics comparable with one that breaks nine of them.

**Measured consequence:** with `none` as the default, **0 of 55 cells** (5 buildings × 11 shipped
profiles, seed 20260726) move — compared on status, events, AWT, WT95, TTD, ride, interval, handling
capacity, undelivered, legs, warning count, the full passenger-trajectory digest **and a SHA-256 of
the whole serialized `RunRecord`**. No pin moves.

A profile that authors `panel` under `up-down-buttons` is **refused** at policy construction, in the
same style as the existing `destination-entry` + `deferred` refusal: a panel that cannot ask for a
destination is an up/down button, and `tuning/space/encode.ts` runs the real `createPolicyFor` in
`validateValues`, so a sampler rejects the pair rather than handing a search a throw.

**Not** re-refused: `panel` + `deferred` under `mobile-credential`. The existing throw covers the
kiosk, which is the case docs/09 § 1.4 says must not be relaxed — a kiosk holds a person at a
screen. A `mobile-credential` assignment is delivered to the phone of somebody still walking in from
the street and can honestly wait out a defer window. Refusing that pair would also make
`dispatch.passengerAssignment` **unsweepable** by `sim/searchSpaceLiveness.test.ts`, whose base
profile (`predictive-balanced`) defers — the dimension would report `inadmissible`, which that file
requires be fixed rather than allowlisted.

---

## T16-D2 — The **panel** is what authorizes, so D30 lands with Level 1 and not before

**Context.** `DECISIONS.md` § D30 rules that a destination-entry kiosk authorizes. Phase 6a (§ D56)
measured that a bare kiosk breaks `secure-tower` outright — 51.7 % unserved against conventional's
33.5 % — because `costRequestFor` drops the credential under `destination-entry`, so `estimateCost`
is asked whether an *unbadged* passenger may reach a zoned floor.

**Alternatives.** (a) Forward the credential under `destination-entry` always. (b) A third knob.
(c) Tie panel-stage authorization to `passengerAssignment: 'panel'`.

**Chosen:** (c). `#callValue` sets `DispatchCall.panelAuthorized` only under a panel, and
`costRequestFor` forwards the credential for an authorized request.

**Why.** (a) changes `destination-entry`'s meaning and would move Phase 6a's `accessControl.ts`
bare-kiosk arm — whose *failure* is the published result that justifies D30. (b) invents an
unrequested knob, which is this repository's documented defect class. (c) is the semantically
correct reading: **the kiosk is Level 1's landing panel.** Level 0 does not model a kiosk at all; it
moves information the runner already honestly holds one field earlier. A panel is a physical thing
that a passenger stands at, states a destination to, and is answered by — and *that* is the thing
D30 says performs the access check.

**Measured**, `secure-tower` at the interfloor-mix operating point, seed 20260726:

| arm | status | undelivered |
|---|---|---|
| `eta`, `up-down-buttons` | **timed-out** | 22 |
| `eta`, `destination-entry` (bare kiosk) | **timed-out** | 38 |
| `eta`, `destination-entry` + `panel` | **completed** | **0** |
| `eta`, `mobile-credential` | completed | 0 |
| `eta`, `mobile-credential` + `panel` | completed | 0 |

The bare kiosk breaks the building *harder* than conventional dispatch, reproducing § D56's
direction on a different operating point. The authorizing panel serves it.

**There is deliberately no "rejected at the panel" accounting path.** A passenger the panel would
refuse cannot reach the code: `#openCalls` already throws for anybody no bank serving the floor can
carry, and the trace's route planner never generates one. Building a rejection branch nothing in
this simulator can reach would be a ninth dead seam — which is the defect this phase is most at risk
of shipping, so the branch is absent and the reason is in the code.

---

## T16-D3 — D29's write-once promise is enforced at the **candidate set**, not at `#reofferCall`

**Context.** `DECISIONS.md` § D29: when a car fills and leaves promised passengers behind, their
`assignedCarId` stands. `#reofferCall` puts a still-occupied landing back out to the group and
"must be overridden for assigned passengers".

**Chosen.** The override is `Simulation.#candidateCars`: a decision for a call whose remaining
passengers are already promised is scored over **only the promised car's snapshot**, so stage 4's
argmin cannot return anything else. `#reofferCall` is otherwise unchanged and simply counts.

**Why.** Three separate paths reach a re-offer — stage 6's `bypassing-load` / `direction-mismatch`
refusal, the `nobody-would-board` livelock guard, and `#finishStop`'s overflow case. Patching one
of them leaves the other two re-offering a promised passenger to whichever car scores best, which is
the panel silently changing its mind. Restricting the candidate set applies the rule where *every*
re-offer is eventually decided. If the promised car is full, no car is eligible, the call is retried
on the ordinary timer, and the passengers wait — which **is** the cost, and
`ConservationAudit.brokenPromises` counts how often it is paid.

`brokenPromises` is an **event count, not a headcount**: a passenger bumped from three successive
trips counts three times, because three times is what it cost them.

**Measured**, `midtown-office`, seed 20260726, `eta + rideTime 1.0`, `mobile-credential` + `panel`:

| operating point | legs | assigned | broken promises | wrong-car boardings |
|---|---|---|---|---|
| interfloor-mix 1.5 %, 1800 s | 96 | 96 | 4 | **0** |
| shipped default demand (saturated) | 660 | 660 | 2 584 | **0** |
| shipped default demand, `assignedWalkS: 10` | 660 | 660 | 3 131 | **0** |

Re-assignment is **out of scope and not built**, and no knob for it exists (§ D29).

---

## T16-D4 — A promise binds the **bank**, not only the car

**Context.** A landing served by two banks opens the same origin-destination request twice, once per
bank. Bank 1 wins it and promises car X. Bank 2 still counts the passenger as waiting.

**Chosen.** `#bankMayServe` — once the panel has named a car, only that car's bank still has
business with the passenger.

**Why.** Without it, bank 2 sends one of its own cars, which arrives, may board nobody (the boarding
predicate is per car), surrenders the call as *nobody would move*, and is sent straight back: a
livelock that burns events and would present as "the run was a bit slow". `secure-tower`'s screened
lobby, both of `mixed-use-high-rise`'s shared floors and all eight of `vertical-city`'s are
multi-bank, so this is a shipped configuration and not a hypothetical. All five buildings complete
under a panel at the interfloor-mix point with 0 wrong-car boardings.

---

## T16-D5 — The comparability list is **data on the run**, and the oracle pin is a **test helper**

**Context.** The contract identifies nine of the nineteen replication metrics as changing construct
under Level 1 and asks that this be machine-checkable rather than a doc note.
`REPLICATION_METRICS` lives in `packages/experiments`, which this task does not own, and `core`
cannot depend on it.

**Chosen.** `packages/core/src/metrics/comparability.ts` declares the nine **with a per-metric
reason and a dotted `summaryPath`**, plus the ten that survive. Its non-test callers are inside
`Simulation`: the constructor raises a **disclaimer** naming all nine into `result.warnings` (the
double-deck mechanism, § D11/§ D22), `#finish` attaches `result.comparability`, and the recorder
stamps `RunRecord.passengerModel`. `comparability.test.ts` walks every `summaryPath` into a summary
a real run produced and asserts the two lists partition the nineteen disjointly and exhaustively.

**Why not an exported `assertComparable(...)` guard:** it would have no non-test caller, which is
precisely the `tuning/report` defect — the fifth of the eight dead seams, and the one that shipped
*after* both guards were installed. A declaration every run carries, that a study can read off the
result it is already holding, is reachable by construction.

**The oracle pin is `packages/core/src/analytical/oraclePin.test-helper.ts`**, called from
`analytical/validation.test.ts` and `sim/oracle.test.ts` — which is what the contract's ownership
map (row 13) specifies, "called from themselves". It refuses **both** halves of destination dispatch
and carries the reasoning in its own docstring: `S = N(1 − (1 − 1/N)^P)` assumes independent uniform
destinations, destination dispatch exists to violate that, so a destination arm *should* disagree
with the closed form. This is the one place where `CLAUDE.md`'s *"assume the simulation is wrong
until proven otherwise"* gives the wrong answer, and the sentence is in the code where somebody
under pressure will read it. A `.test-helper.ts` rather than a runtime export, for the same
no-dead-seam reason as above.

---

## T16-D6 — `sim.assignedWalkS` is charged between `arrivedAt` and `boardedAt`, and is not
profile-authorable

Declared in `SIM_PARAMETERS` with `activeWhen: { 'dispatch.passengerAssignment': ['panel'] }`,
range `[0, 30]`, **default 0**. Implemented as a boarding predicate — a promised passenger may not
board before `assignedAt + assignedWalkS` — so `arrivedAt` never moves.

`arrivedAt` is the window-membership key: dispatcher-independent by contract, so the same passenger
falls in the same report window under every configuration compared. Charging the walk by moving it
later would change *which* passengers each arm reports on, and a paired-t over differently-populated
windows is not a paired-t — a failure that invalidates every interval in the phase and makes no test
go red.

**Measured**: on the single-leg buildings (`midtown-office`, `garden-apartments`) the `arrivedAt`
column is byte-identical between a Level-0 run and Level-1 runs at `assignedWalkS` ∈ {0, 5, 10, 30}.
On `secure-tower` it is **not**, and that is the pre-existing transfer asymmetry docs/09 § 2.4
records rather than this change: a second leg's arrival is the first leg's alighting time plus the
transfer walk, which is dispatcher-dependent today. Journey-level pairing (TTD) survives it;
leg-level pairing (AWT) does not — a second, independent reason TTD is the comparison metric.

It is **not** in `DISPATCH_PARAMETERS`: a dispatcher that could tune its own walk distance could
tune away its own cost, and the Pareto front would be a lie.
`searchSpaceLiveness.test.ts`'s authorability rule keeps it out of the dispatcher space by
construction, exactly as it does `sim.doorObstructionProbability`.

---

## T16-D7 — No new profile ships in `data/dispatcher-profiles.json` — **HANDBACK**

**Context.** The task grants `data/dispatcher-profiles.json` "to ship a destination-dispatch
profile". `packages/experiments/src/benchmark/dispatcherBenchmark.test.ts:301` asserts
`[BASELINE_PROFILE, ...ARM_PROFILES].sort()` equals the shipped profile set, and
`benchmark/arms.ts` is not this task's file.

**Chosen.** Ship no profile. Every measurement here is taken against profiles built in the test from
`eta` plus the two stage settings — the mechanism `harness.derivedProfile` already establishes
(§ D57's precedent).

**Why.** Shipping the profile reddens one assertion in a file this task may not edit, and acceptance
criterion 2 is a green suite. The alternative — shipping it and handing back the companion edit —
trades a real, verifiable green tree for a red one, and the liveness evidence is identical either
way because it comes from `runSimulation` over the real buildings.

**HANDBACK — the profile, ready to paste**, together with the two edits that must land in the same
commit:

```json
{
  "id": "destination-dispatch",
  "name": "Destination dispatch",
  "$comment": "Level 1. The landing panel names a car per passenger and boarding honours it. mobile-credential rather than destination-entry only because the shipped destination profile already is (D56); either works now that the panel authorizes (T16-D2).",
  "weights": { "waitTime": 1.0, "rideTime": 1.0 },
  "dispatch": { "callType": "mobile-credential", "passengerAssignment": "panel" }
}
```

1. add `'destination-dispatch'` to `ARM_PROFILES` in `packages/experiments/src/benchmark/arms.ts`;
2. regenerate the twelve `PINNED_ESTIMATES` rows it adds via `regeneratePins.ts` — they are *new*
   keys, so no existing pin moves; verify that by diffing key by key before pasting, as § D58 did.

---

## T16-D8 — C26 is fixed; Phase 6a's skipped regression test can be un-skipped — **HANDBACK**

`dispatch/policies/fixtures.test-helper.ts`'s `call()` takes an optional `destinationFloorId`, and
all three `contributionScenarios()` in `policies.test.ts` now carry one (different per scenario,
above the call floor). `rideTime` therefore prices something in the contribution sweep instead of
returning 0 by construction, and the *"has no weight that contributes nothing"* assertion no longer
fails a profile that legitimately weights it.

Proven both ways by a new test in the same file: a `{ waitTime: 1, rideTime: 1 }` profile under
`mobile-credential` prices exactly `['rideTime', 'waitTime']` across the three scenarios, and the
same profile under `up-down-buttons` prices `rideTime` at 0 — so the fixture is not smuggling a
destination into a conventional scenario.

**HANDBACK:** `packages/experiments/src/benchmark/destinationProfile.test.ts` carries a skipped,
documented regression test naming this one-line fix. It can be un-skipped. That file is not this
task's.

---

## T16-D9 — Four `core` docstrings asserting the refuted H-ACCESS-2 mechanism are corrected

`DECISIONS.md` § D60 lists seven places asserting that destination dispatch does better under access
control *because* authorization and optimization happen in the same step, and records that the
difference-of-differences at n = 150 per building **refutes** it. Four of the seven are in
`packages/core`, and all four are corrected here:

| place | what it now says |
|---|---|
| `dispatch/lifecycle.ts` (`costRequestFor`) | the one-step mechanism is a true statement about the function; the performance claim built on it is measured false |
| `model/types.ts` (`HallCall`) | the asymmetry is real; "better under access control because of it" is refuted |
| `model/car/types.ts` (`CostRequest`) | same |
| `sim/simulation.ts` (`#callValue`) | same |

The remaining three are `docs/01-architecture.md:103-105`, `docs/05-roadmap.md:549-550` and
`docs/07-handoff.md:271-273`, which are **HANDBACK** — `docs/**` is not this task's.
`validation/documentation.test.ts` pins none of the seven strings, so nothing goes red either when
they were wrong or when they are fixed, which is itself the defect class § D60 names.

---

## T16-D10 — One pinned count outside `packages/core` was updated, deliberately and visibly

`packages/experiments/src/tuning/space/collect.test.ts` pins the size of the declared parameter
space: `expect(rows).toBe(96)` and `expect(SPACE.parameters.length).toBe(48)`. Declaring two new
tunables moves both — to **98** and **49** — and the file is outside this task's ownership.

**Chosen.** Update the two numbers, with a comment naming the two rows and why only one of them is
searchable. **Why:** the assertion's stated purpose is *"pinned so a schema that stops being found …
fails rather than silently shrinking the space"* — it is a change detector, and a phase that adds a
declared tunable is expected to move it, exactly as the roadmap says extending `AUDITED_MODULES` is
a one-line change any phase adding a `dispatch/` module should make. Nothing is weakened: the new
numbers are the correct ones, and the asymmetry (2 declared, 1 searchable) is itself evidence that
`sim.assignedWalkS` is correctly **not** profile-authorable, which is the discrimination the
biconditional above it exists to prove. Leaving it red would block integration for four concurrent
branches over two integers.

It is **not** in either concurrent builder's area (`packages/viz/src/**`,
`packages/experiments/src/{validation,perf}/**`).

---

## What was measured, and where it is asserted

| claim | assertion |
|---|---|
| every leg is promised a car, and the promise reaches the record | `sim/destinationDispatch.test.ts`; `#reconcile` claims 5 and 6 |
| **zero** wrong-car boardings, 5 buildings | `sim/destinationDispatch.test.ts`; `#reconcile` claim 4 fails the run |
| the promise **bites**: 70 of 96 legs board a different car than under conventional dispatch | `sim/destinationDispatch.test.ts` (> 20 % required) |
| the call count rises: 25 → 70 on Midtown, 18 → 42 on Secure Tower (interfloor-mix) | `sim/destinationDispatch.test.ts`, counted through `createPolicy` |
| broken promises non-zero on a configuration that fills cars | `sim/destinationDispatch.test.ts` |
| `arrivedAt` byte-identical at walk ∈ {0, 5, 10, 30}, single-leg buildings | `sim/destinationDispatch.test.ts` |
| the four trace streams end where a conventional run leaves them; traces byte-identical | `sim/destinationDispatch.test.ts` |
| `passengerAssignment: 'none'` is trajectory-identical to the run before the knob existed | `sim/destinationDispatch.test.ts`, 5 buildings; and 0 of 55 shipped cells moved |
| the oracle refuses a destination arm with a named reason | `analytical/oraclePin.test-helper.ts`, called from both oracle suites |
| the nine non-comparable metrics partition the nineteen and resolve against a real summary | `metrics/comparability.test.ts` |
| C26: `rideTime` prices something in the contribution sweep | `dispatch/policies/policies.test.ts` |

---

Decisions taken while adding `CarConfig.mode` and `BuildingConfig.serviceEvents`. Recorded here
rather than in the repository-level `DECISIONS.md`, which this task does not own.

## D71 — T19-1 — the mid-run schedule is **authored data on the building**, not a `SimulationConfig` hook

Two forms were on the table:

| | authored `serviceEvents` on the building | `SimulationConfig.serviceSchedule`, beside `createPolicy` |
|---|---|---|
| survives `JSON.stringify` | yes | **no** — it is a function |
| in the persisted run envelope | yes, via `buildingId` | no |
| a stored run replays it | **yes** | **no** |
| widens the persisted config | no new envelope key | no new envelope key |
| validated, located, refusable | yes (`ConfigError` with a path) | no |
| CLAUDE.md invariant 7 | data | code |

The deciding fact is the replay. `experiments/src/reports/persistence.ts` records `buildingId`, not
the building, and a replay re-reads `data/buildings/<id>.json` and resolves it again. A schedule
authored *on the building* therefore replays with no change to the envelope schema at all — which
is why **no golden `envelopeKeys` list moves**, and why Phase 4's "any run replays exactly"
criterion and Phase 8's golden persistence contract both keep holding.

A hook could not be persisted. `createStoredRun` would drop it silently, the replay would run a
different experiment from the one that was stored, and nothing would say so. That is the failure
this repository's whole persistence contract exists to prevent, so the hook form was rejected even
though it is the smaller change.

Cost of the data form, accepted: the schedule is a property of the *building* rather than of the
*scenario*, which is a slight abuse of the noun. It is the same abuse `accessZones` already makes,
and the alternative is unreplayable.

## D72 — T19-2 — `mode`'s schema home is `config/schema.ts`, not `CAR_PARAMETERS`

Invariant 8 wants every tunable self-describing. `mode` is, and it is declared where every other
`carConfigSchema` enum is: as `z.enum(SERVICE_MODES)` in `config/schema.ts`, exactly as `doorType`
is.

A `car.mode` row was tried in `CAR_PARAMETERS` first and was wrong, on the module's own stated
rule: *"Rated speed, acceleration, jerk and the door timings are not here: they are already
declared by `config/schema.ts` and `DOOR_PARAMETERS`, and a second declaration would be a second
source of truth."* `car.test.ts` already guards that rule by name for four ids; `car.mode` and
`car.doorType` are now on that list, because a categorical is the easiest way to break it — neither
has a `range`, so a row for one also slips past the "fully specified" check beside it.

Two guards caught the mistake and both were right to:

- `core/src/model/car/car.test.ts` — every `CAR_PARAMETERS` row must carry a finite `range`. A
  categorical does not.
- `experiments/src/tuning/space/collect.test.ts` — `expect(rows).toBe(98)`, a deliberate pin on the
  number of declared parameter rows across `core`, so that a schema which stops being discovered
  fails loudly. The row took it to 99.

Neither was touched. The row was removed instead, and the count pin is back at 98.

`CAR_PARAMETERS` would also have been the wrong place on the merits: it is the optimizer's
discovery surface, and a search that took the fleet out of service to improve a dispatcher
objective would be tuning the ruler.

## D73 — T19-2b — `SERVICE_MODES` moved from `model/types.ts` to `config/types.ts`

`config/schema.ts` needs the four names at run time to build its `z.enum`. Importing them from
`model/types.ts` widened `parse.ts`'s static import graph to include `model/` and `kernel/`, which
`config/parse.test.ts` pins exactly — the pin encodes "`config/` depends on nothing outside
`config/`", and that is worth keeping.

The repository already has one direction for this: every closed set that appears in authored JSON —
`DOOR_TYPES`, `CALL_TYPES`, `PARKING_STRATEGIES`, `AGGREGATIONS`, `BUILDING_TYPES` — is declared in
`config/types.ts`, and `dispatch/` and `model/` import them from there. `SERVICE_MODES` became an
authored vocabulary the moment `CarConfig.mode` existed, so it moved to join them.
`model/types.ts` re-exports it, so no import path anywhere else changed, and
`acceptsHallCalls`/`acceptsCarCalls` — the predicates that give the modes their meaning — stay
where they were.

## D74 — T19-3 — `ResolvedBuilding.serviceEvents` is optional, and its absence is announced

Required would have been tidier. It would also have broken every hand-assembled `ResolvedBuilding`
in the repository at compile time — the fuzz generator, `experiments/validation/syntheticBuilding.ts`,
several fixtures — in packages this task does not own.

Optional buys one silent failure mode: a hand-built resolved building whose `config` declares a
schedule that was never located. So it is not silent. `Simulation`'s constructor compares
`resolved.config.serviceEvents` against `resolved.serviceEvents` and pushes a **disclaimer** (not an
advisory) when the first is non-empty and the second is not — "the model is not the configuration",
which is precisely what `#disclaimers` is for.

## D75 — T19-4 — authored order is preserved; the kernel is the only ordering authority

`resolveBuilding` does not sort the schedule. The kernel's total order is `(time, sequence)` and the
runner schedules entries in array order, so two entries at the same `atS` fire in authored order
(invariant 4). Sorting in the resolver would be a second authority stating the same rule, and two
authorities is how one of them drifts.

This is visible and asserted: two recalls authored at the same instant are two events, and the first
one's re-offer can legally land on the second car in the instant before that car's own event fires.

## D76 — T19-5 — `#carCanCarry` now checks service mode, and `#park` skips a car the group does not control

**This is the defect the feature exposed, and it is not cosmetic.** Every landing boarding in
`sim/simulation.ts` runs through `#boardFrom` → `Car.board` → `Car.registerCarCall`, which
**throws** a `ModelError` for a mode that does not honour car calls — and `run()` propagates a
`ModelError` unchanged. `#loadWhileIdle` boards a landing queue from a car already standing there
*without consulting the dispatcher*, deliberately. So the first out-of-service car parked at an
occupied landing crashed the run, and "all cars out of service" was not merely untested but
unrunnable.

It was unreachable before this change: the only previous way to produce a not-in-service car was
`experiments/validation/serviceMode.ts`'s `Proxy` over the dispatcher's *view*, which leaves the
physical car in service. That is why the adversarial campaign correctly asserts allocations rather
than boardings, and why **nothing about that campaign's results changes** — its cars really were in
service, and `#carCanCarry`'s new clause is inert for them.

`acceptsHallCalls` and not `acceptsCarCalls` is deliberate. The predicate answers "may this car take
somebody standing at a landing", and for `independent` the answer is no: an attendant-operated car
honours the buttons pressed inside it (which `Car` still allows) but is not under group control.
`#park` is gated on the same predicate for the same reason — stage 7 is the group placing its fleet,
and a recalled car driving itself to a lobby is the controller operating hardware that has been
taken away from it.

Both clauses are inert on every shipped configuration: every car of every building in
`data/buildings` is `in-service` for the whole run, so `car.acceptsHallCalls` is `true` at every
evaluation and both expressions reduce to exactly the code that was there.

## D77 — T19-6 — no shipped building was changed

`data/buildings/*.json` is untouched. Adding a `mode` or a `serviceEvents` entry to a shipped
building would move every published pin in `experiments/src/benchmark/published.ts` — files this
task does not own — for a demonstration that a fixture makes just as well. Reachability is proved
instead through `parseBuilding` + `resolveBuilding`, which is the exact path `loadConfig` takes.

## Known limitations, recorded rather than hidden

1. **A car recalled with passengers aboard strands them.** `setMode` clears its car calls, so it
   has no reason to move, and its passengers end the run as `undelivered: 'riding'` — named,
   counted, and the conservation audit still balances. A real Phase I recall discharges at the
   recall level. That is a *behaviour*, not a config field, and is out of scope here.
2. **Under destination dispatch, recalling a promised car strands its promises.**
   `Passenger.assign` is write-once, so `#candidateCars` keeps restricting those calls to the
   recalled car, which is permanently ineligible; the call retries until the drain deadline.
   `#reofferCall` counts each of them in `brokenPromises`, which is the honest reading. Fixing it
   means re-promising, which is a change to D29's write-once rule and belongs with Phase 6b.
3. **`independent` is modelled only as "outside group control".** No attendant drives it, so it
   answers the car calls of whoever is already aboard and then stands. That is what
   `acceptsCarCalls` already said; nothing new was invented for it.

---

Decisions taken while landing **Phase 6b's surface** (`feat/phase6b-surface`). Recorded here rather
than in the repository's `DECISIONS.md`, which this task does not own. Anything marked **HANDBACK**
needs an owner outside this task's files (`packages/viz/**`,
`packages/experiments/src/benchmark/**`, `data/dispatcher-profiles.json`, `packages/cli/src/**`).

Every number below was measured in this worktree against the real `data/` directory. Where a figure
disagrees with a shipped document, the disagreement is stated rather than smoothed.

---

## T18-D1 — `VIZ_SCHEMA_VERSION` bumps 3 → 4 and the panel is **rendered**

**Context.** `docs/09-destination-dispatch-contract.md` § 3.1 gives two admissible answers for a
Level-1 run and forbids a third: *"either bump and render, or make `recordRun` refuse a Level-1 run
outright. Do not do neither."*

### The predicted symptom does not reproduce, and the real one is worse

§ 3.1 predicted an **empty landing series**, because `VizLanding` is keyed `(floorId, direction)`
and a panel has no direction button. Measured — seed 20260727, 900 s, `eta` weights plus
`mobile-credential` + `panel`, through `recordRun`:

| building | landings a version-3 recording produced, conventional | …under a panel |
|---|---|---|
| Midtown Office | 28 | **28** |
| Vertical City | 102 | **102** |

Not empty, and not different. Phase 6b left `PassengerRecord.direction` populated under a panel, so
`foldPassengers` folds exactly as before. **The contract's stated symptom is wrong about this
tree.** What is actually wrong is one level subtler and was measured in the same runs:

| building | landings drawn | landing **calls** under a panel `(floor → destination)` | promise groups `(floor, destination, promised car)` |
|---|---|---|---|
| Midtown Office | 28 | 92 | **132** |
| Mixed-Use High-Rise | 48 | 93 | **230** |
| Secure Tower | 22 | 55 | **106** |
| Vertical City | 102 | 219 | **535** |

A version-3 recording collapses 132 promises into 28 direction buckets and **carries no field from
which the collapse could be undone**: `VizLeg` had seven fields and none of them was the assignment,
`VizRecording` had no `passengerModel`, so the viewer could not tell a Level-1 recording from a
Level-0 one and drew them identically. That is the same defect class as wave 1's
cars-at-their-final-position — deterministic, replay-identical, and a picture of a different
building.

**The falsehood it produced, quoted.** `describeSelection` said *"unassigned — no car answered this
call in this run"* whenever `answeredByCarId` was absent. Under a panel that is a dispatcher failure
reported where none happened: the panel named a car at the instant the passenger arrived. Measured
reachable on a shipped building — Vertical City at 20 % of population per 5 minutes, seed 20260727,
ends `timed-out` with **25** promised-but-never-boarded legs, every one of which the viewer called
unassignable.

### Chosen: bump and render

**Why not refuse.** Two reasons, one of them measured.

1. A refusal in `recordRun` would not fix the CLI. `packages/cli` does not depend on
   `packages/viz` at all (verified: no `@elevator-sim/viz` import anywhere under `packages/cli/src`)
   — `watch` reads the `RunRecord` through its own `QueueClock`. So "refuse in `viz`" leaves the
   other viewer rendering the same run with the same silence, which the task forbids.
2. Phase 6b's *whole deliverable* is the user-facing surface. A refusal removes the only way to look
   at the thing the phase built, and buys correctness by deletion.

**What version 4 adds**, each with its consumer in the same change (the rule version 3 was added
under):

| field | consumer |
|---|---|
| `VizRecording.passengerModel` | `landingAssignmentsAt`'s grouping key, `describeFrame`'s sentence |
| `VizLeg.destinationFloorId` | the call identity under a panel — docs/09 § 1.3 |
| `VizLeg.assignedCarId` | `LandingAssignment.promisedCarId`, `describeSelection`, `landingOptionLabel`, the shaft highlight |

`passengerModel` is **copied** from `RunRecord.passengerModel`, never re-derived from the profile:
`core` computes it from the resolved dispatch stage (`passengerModelOf`), and a viewer that read
`dispatcherProfile.dispatch.passengerAssignment` would be a second opinion about a question `core`
has already answered.

`landingAssignmentsAt` becomes model-aware. A row is a `(floorId, direction)` button under
`conventional` and a `(floorId, destinationFloorId, promisedCarId)` **promise group** under
`destination-dispatch` — the promise is part of the identity because two arrivals for the same
origin-destination pair outside `batchWindowS` are two calls and need not share a car (measured: 30
OD pairs on Midtown Office are promised more than one car over a 900 s run).

### Mutation evidence — 13 mutants, 13 killed

Each new rendered or recorded value was replaced by a constant, one at a time, and the whole `viz`
suite re-run:

| mutant | verdict | killed by |
|---|---|---|
| `recordRun`: `passengerModel` pinned to `'conventional'` | **KILLED** | promise-group partition ×5, `describeFrame` |
| `recordRun`: `leg.destinationFloorId` pinned to `'G'` | **KILLED** | partition ×3, leg copy ×3 |
| `recordRun`: `leg.assignedCarId` never copied | **KILLED** | partition ×5, leg copy |
| `overlay`: `callGroupOf` ignores the passenger model | **KILLED** | partition ×5, stranded-promise row |
| `overlay`: `promisedCarId` pinned to `undefined` | **KILLED** | partition ×5, stranded-promise row |
| `overlay`: `destinationFloorId` pinned to `undefined` | **KILLED** | partition ×5 |
| `canvas`: `describeSelection` drops the panel branch | **KILLED** | caption ×2 |
| `canvas`: `describeSelection` never shows the destination | **KILLED** | caption |
| `canvas`: `drawSelection` boxes the answering car | **KILLED** | shaft-highlight test |
| `canvas`: `landingOptionLabel` ignores the promise | **KILLED** | option-label test |
| `canvas`: `landingOptionLabel` ignores the destination | **KILLED** | option-label test |
| `describeFrame`: the model sentence is never said | **KILLED** | model-sentence test |
| `describeFrame`: the model sentence is always said | **KILLED** | model-sentence test |

The "always said" mutant is there for the reason the "never said" one is not enough: a sentence that
appears on every run is indistinguishable from a module that never looked at the field.

**HANDBACK.** `docs/09-destination-dispatch-contract.md` § 3.1's prediction of an *empty landing
series* is refuted by measurement and should be corrected to *a landing series that is populated,
identical to the conventional one, and wrong about what it counts*. `docs/**` is not this task's.

---

## T18-D2 — the shipped profile is `destination-panel`, not `destination-dispatch`

`packages/core/DECISIONS-T16.md` § T16-D7 handed back JSON with `"id": "destination-dispatch"`.
Shipping it under that id turns `core/src/dispatch/policies/policies.test.ts` red, and the failure
is legitimate: that suite asserts `sim/simulation.ts` contains no shipped profile id as a string
literal (invariant 7 — *nothing in the run loop branches on a profile id*), and `simulation.ts`
contains the `PassengerModel` literal `'destination-dispatch'` at
`this.#passengerModel === 'destination-dispatch'`.

A profile id that collides with a passenger-model name leaves the guard unable to tell a name clash
from a real branch. **Renaming the profile costs a word; relaxing the guard costs the invariant.**
Everything else is T16's JSON verbatim, plus `role: "destination"` and a `$comment` recording the
rename.

**`rideTime: 1.0` is on this profile and on no other**, which is the promotion C26 blocked — see
§ T18-D4.

### Liveness — evaluation counts with spread, seed 20260726

Counted through `runSimulation` by `destinationLiveness.ts`, which now measures the panel gate on
both sides:

| configuration | `rideTime` non-zero | cross-car spread | decisions | promised | wrong-car | broken |
|---|---|---|---|---|---|---|
| **`destination-panel`, Midtown interfloor-mix** (arm D) | **356 / 356** | **16 / 92** | 92 | **96 / 96** | **0** | 4 |
| the same profile without the panel (arm C) | 248 / 248 | 12 / 62 | 62 | **0 / 96** | 0 | 0 |
| `destination-panel`, Secure Tower interfloor-mix | 176 / 176 | 2 / 60 | 60 | **68 / 68** | **0** | 2 |

- **The decision count rises 62 → 92 on the same passenger trace.** That is docs/09 § 1.3's
  mechanical heart, counted: a landing under a panel is one call per origin-destination pair.
- **70 of 96 legs (72.9 %) board a different car than `eta` does on the same trace**, reproducing
  T16's measured shape exactly. 19 of 40 on Secure Tower.
- **Zero wrong-car boardings** on both buildings, counted independently of `#reconcile` — a claim
  checked only by the code that makes it is not checked.
- Broken promises are non-zero and are a *cost paid*, not a defect (T16-D3).

---

## T18-D3 — twelve new pins, zero moved, twice

Two regenerations, each verified by a key-by-key diff of the parsed pin table before pasting (§ D58's
method):

| regeneration | keys before | after | added | removed | **moved** |
|---|---|---|---|---|---|
| adding `destination-panel` to `ARM_PROFILES` | 305 | 317 | 12 | 0 | **0** |
| adding the `destination-dispatch` study (§ T18-D5) | 317 | 329 | 12 | 0 | **0** |

The `git diff` on `published.ts` for the first was `12 insertions(+), 0 deletions(-)`.

The twelve Phase 5 pins, `destination-panel` versus `nearest-car`, at the shipped operating points:

| case | AWT | WT95 | % > 60 s | TTD |
|---|---|---|---|---|
| Midtown up-peak, n = 250 | −6.38 | −23.26 | −7.34 | −10.44 |
| Garden residential, n = 500 | −1.23 | −4.09 | −0.36 | −1.87 |
| Secure up-peak, n = 150 | −5.52 | −19.53 | −4.43 | −8.03 |

Every one negative, so the new arm beats the baseline on every metric at every case. It forms no
identity class with any other arm at any case, measured — it is not the "ships and changes nothing"
seam.

---

## T18-D4 — Phase 6a's skipped test is un-skipped, and **not** by weighting `destination-eta`

`destinationProfile.test.ts` carried `it.skip('weights rideTime — BLOCKED on core/dispatch/policies
fixtures carrying a destination')`, asserting `destination-eta.weights.rideTime > 0`, with a
docstring instructing the next author to *"move the weight into `data/dispatcher-profiles.json` in
the same commit"*. T16 closed the fixture gap, so that is now possible.

**It is still the wrong thing to do, and the reason is a published result.**
`destinationDisclosure.test.ts:158-160` asserts that the shipped `destination-eta` arm is
`IDENTICAL` to `eta` on all four metrics at n = 150. *That* is the decomposition which makes Phase
6a's −1.562 s attributable to the **weight** rather than to the call type — the study's own
docstring calls it *"a decomposition rather than an inference"*. Weighting `rideTime` on
`destination-eta` deletes the control arm, turns that suite red, and moves twelve pinned estimates,
in order to make a fixture comment come true.

**Chosen.** Un-skip it against the profile where the claim is true and assert the exclusion beside
it: *some* shipped profile weights the gated term (C26 is really closed — it is `destination-panel`,
under `mobile-credential`, so the term is not dead weight), **and** `destination-eta` still weights
`waitTime` alone. That is strictly more than the skipped version checked, and it is the claim the
skip was actually about.

**HANDBACK.** If a later phase wants `destination-eta` itself to price the ride, Phase 6a's
decomposition needs a *separate* unweighted arm first. That is a change to
`destinationDisclosure.ts`'s arm list and to twelve pins, and it should be argued on its own rather
than smuggled in as a fixture fix.

---

## T18-D5 — the C→D contrast is **measured**, and T16's "trajectory-identical" does not survive

T16's stated limitation: at the contract's primary operating point arm D is trajectory-identical to
arm C, `sd(ΔTTD)` is unmeasured, and the contract's n = 150 is therefore unjustified for arm D.

`benchmark/destinationDispatchContrast.ts` measures it. Arm D is the **shipped** `destination-panel`;
arm C is that profile with `dispatch.passengerAssignment` **deleted** and nothing else touched — so
the contrast isolates the passenger model rather than the weight vector, which is the discrimination
`destinationDisclosure.ts` cannot make. Seed 20260726, n = 150, common random numbers, D − C:

| operating point | ΔTTD | ΔAWT | ΔWT95 | Δride | bit-identical |
|---|---|---|---|---|---|
| **Midtown interfloor-mix 1.5 %** (primary) | `+0.11 [−0.04, +0.25]` INDIST. | `−0.01 [−0.10, +0.08]` INDIST. | `+0.15 [−0.33, +0.64]` INDIST. | `+0.12 [−0.01, +0.25]` INDIST. | 27 / 150 |
| Secure Tower interfloor-mix 1.5 % | `−0.03 [−0.13, +0.08]` INDIST. | `−0.04 [−0.10, +0.01]` INDIST. | `−0.22 [−0.45, +0.02]` INDIST. | `+0.02 [−0.05, +0.09]` INDIST. | 41 / 150 |
| **Midtown interfloor-mix 4.5 %** (the promise binds) | `+5.94 [+4.42, +7.46]` **WORSE** | `+6.96 [+5.55, +8.38]` **WORSE** | `+37.34 [+29.37, +45.32]` **WORSE** | `−1.02 [−1.63, −0.41]` **BETTER** | 0 / 150 |

**Three findings.**

1. **`sd(ΔTTD)` for C→D is 0.908 s at the primary point.** The contract locked n = 150 with the
   caveat that it *"leaves headroom for an sd up to ~3.4 s at ±0.5 s"*. Measured, the sd is inside
   that headroom by a factor of 3.7, the achieved half-width is **±0.15 s** against a designed
   ±0.43 s, and 13 replications would have sufficed. **n = 150 is justified for arm D.**
2. **"Trajectory-identical" is a single-seed reading.** 27 of 150 replications are bit-identical;
   123 are not. The effect at the primary point is genuinely near zero *and* the arms are
   demonstrably wired — the two halves that together rule out the dead-seam reading.
3. **Where the promise binds, the panel is expensive, and the sign split is the mechanism.** At
   4.5 % the cars fill, the panel may not change its mind (§ D29), and a bumped passenger waits for
   *their* car: TTD 5.94 s worse, WT95 37 s worse, and in-car time **1.02 s better**. Destination
   grouping still does what it is for; the landing is where it is paid for. That is the "documented
   cost of the approach" as a measurement rather than an assumption.

The gate is **TTD** and AWT/WT95 are reported beside it with explicit verdicts. Here § D27 is forced
rather than preferred: `core`'s own `comparabilityOf('destination-dispatch')` lists AWT and WT95
among the nine metrics whose construct changes between the two models.

**4.5 % is censused, not chosen because it worked.** The test measures the neighbour above it: at
6 %, arm D loses its AWT on 9 of 60 replications while arm C stays clean. So 4.5 % is the edge, and
*which arm breaks first* is itself the finding.

---

## T18-D6 — `compare` was ranking two passenger models on AWT, silently

Not in the brief, found by driving the CLI. Before this change:

```
$ elevator-sim compare --building midtown-office --a eta --b destination-panel …
  VERDICT: INDISTINGUISHABLE on AWT at n = 8.
```

AWT is the **first** of the nine metrics `core`'s `comparabilityOf` says must not be paired across
the two passenger models, `Simulation` already raises a disclaimer naming all nine into
`result.warnings`, `run` already prints it — and `compare` read none of it and gated its headline
verdict on exactly the wrong metric.

**Chosen.** `compare` resolves each arm's passenger model through `passengerModelOf(
resolveDispatchConfig(profile).dispatch)` — the same two functions `Simulation` uses, so there is no
second opinion — and when they differ it prints a `THE TWO ARMS DO NOT SHARE A PASSENGER MODEL`
block naming both models and **`core`'s own list** of the nine, then moves the headline verdict to
**TTD**. Within one model nothing changes, which the negative-control test asserts.

`watch` gains the one-line version of the same disclosure, in both the full-frame and plain modes,
because the `waiting` column changes meaning under a panel even though its count stays true.

### `cli watch` on a Level-1 configuration — driven

`script -q /dev/null node packages/cli/dist/index.js watch --building midtown-office --dispatcher
destination-panel --speed 1000 --seed 20260727 --duration 600`, full-frame TTY mode:

```
 destination dispatch: the waiting column is a direction bucket, but each person there was already assigned one car at the panel
 ▲ waiting up   ▼ waiting down   doors: [███] shut  (███) moving  ]███[ open   bar = car load
 Midtown Office · destination-panel · office-standard   seed 20260727 · ×1000 speed
 11:52 / 22:12   waiting 79   served 183   mean wait so far 123.5 s
   …
    G 0.0 m     │     │     │     │     ▲8
   P1 -3.5 m  ]███[   │     │     │     ▲71
```

**The landing series is populated, not empty** — `▲71` and `▲8` summing to the header's 79. T16's
flag that `watch` renders an empty landing series under Level 1 is **not reproducible**, for the
same reason § 3.1's prediction is not: `PassengerRecord.direction` survives the panel. The
comparability disclaimer reaches the summary `printRunReport` prints when playback ends.

---

## T18-D8 — the new arm is the **third** dispatcher in the library that makes anybody wait a minute

`dispatcherBenchmark.test.ts` asserted that on the two up-peak cases every arm except
`zoned-uppeak` had a `pctOverLongWait` mean of **exactly zero** — the study's strongest single
sentence. Shipping `destination-panel` broke it, and the break is a **result**:

| cell | mean % > 60 s | baseline |
|---|---|---|
| `midtown-up-peak/destination-panel` | **0.01667** | 7.355 (−99.8 %) |
| `secure-up-peak/destination-panel` | **0** (exactly) | 4.430 |

That is the write-once promise (§ D29) visible at the shipped up-peak point: a passenger the panel
promised a car that then filled waits for *that* car rather than the next one, and on Midtown at
1 % that is one leg in six thousand. It is the same mechanism `destinationDispatchContrast.ts`
measures at scale — at 4.5 % of population per 5 minutes it costs 37 s of WT95.

**The assertion is raised, not loosened.** The exemption was a single arm id; it is now a set of
`caseId/armId` **cells**, so `secure-up-peak/destination-panel` is still held to exactly zero (and
is), and each exempt cell must still be *non-zero* — an exemption that outlives its finding now
fails. All four verdicts for `destination-panel` remain `BETTER` against the baseline at all three
cases.

---

## T18-D7 — one edit outside this task's ownership, made deliberately and visibly

`packages/experiments/src/fuzz/run.ts`'s `withCallType(profile, callType)` splices a generated call
type onto a shipped profile. `fuzz/generate.ts` picks that call type from
`['up-down-buttons', 'mobile-credential']` **without consulting the profile**, so the moment
`destination-panel` entered `data/`, every fuzz case naming it with `up-down-buttons` constructed
`panel` + `up-down-buttons` — a pair `resolveDispatchConfig` refuses outright, and correctly
(§ T16-D1: *a panel that cannot ask for a destination is an up/down button*).

Measured, before the fix: `fuzz/corpus.test.ts` reported **1 counterexample** (two throws) and
`fuzz/determinism.test.ts`'s trace-invariance test threw, because it pairs `profiles[0]` against
`profiles[profiles.length - 1]` and the last profile in the file is now the panel one.

**Chosen.** `withCallType` drops `passengerAssignment` when the new call type cannot carry a
destination. That is not a workaround: `passengerAssignment` declares
`activeWhen: { 'dispatch.callType': [...] }`, and a helper that *moves* a conditional dimension
while leaving its dependents behind produces a profile nobody could author. The fix states the same
rule `activeWhen` states, in the same direction, in the one function whose job is to move the gate.

**Why not handed back.** Three alternatives were considered and are worse:

- *Reorder `data/` so the panel profile is not last* — fixes one of the two tests by accident and
  leaves `fuzzSimulationConfigFor` broken for every case that names the profile.
- *Do not ship `passengerAssignment` in `data/`* — that is the task.
- *Hand it back red* — `DECISIONS-T16.md` § T16-D10 faced the same shape (two pinned integers in
  `tuning/space/collect.test.ts`) and made the same call: a mechanical companion edit is worth less
  than blocking integration for concurrent branches, provided it is visible. It is visible here and
  in the function's own docstring.

Nothing else under `packages/experiments/src/{fuzz,oracle,validation,tuning,reports,runner}/**` is
touched.

**HANDBACK.** `fuzz/generate.ts` still picks a call type blind to the profile, so a Level-1 profile
is fuzzed only at `mobile-credential`. Fuzzing the panel at `destination-entry` — and generating
`passengerAssignment` as a dimension of its own — is a real extension of the corpus and belongs to
whoever owns `fuzz/`.

---

## What was measured, and where it is asserted

| claim | assertion |
|---|---|
| the recording stamps the model `core` computed, both values reachable from `data/` | `record/recordRun.test.ts`, 5 buildings |
| every leg's destination and promise are copied, and zero wrong-car boardings | `record/recordRun.test.ts`, 5 buildings × 2 models |
| the direction bucket is a collapse of several calls | `record/recordRun.test.ts`, 3 buildings |
| a landing under a panel partitions into promise groups, exhaustively | `frame/overlay.test.ts`, 5 buildings × 11 instants |
| the row key is direction alone under the conventional model | `frame/overlay.test.ts`, 5 buildings |
| a promised passenger nobody served reads as promised, not unassignable | `frame/overlay.test.ts`; `render/overlayRender.test.ts` |
| the shaft highlight follows the promise, not the outcome | `render/overlayRender.test.ts` |
| the option label names the call rather than the floor | `render/overlayRender.test.ts` |
| the a11y sentence names the model, and only when it applies | `render/describeFrame.test.ts` |
| `watch` renders a populated landing column and discloses the model | `cli/src/cli.test.ts` |
| `compare` refuses to gate on AWT across models, and still does within one | `cli/src/cli.test.ts` |
| the shipped profile is one of two authoring a call type, and the only one with a panel | `benchmark/destinationProfile.test.ts` |
| a shipped profile weights `rideTime`, and it is not `destination-eta` | `benchmark/destinationProfile.test.ts` |
| every leg promised, promise kept, promise bites, decision count rises | `benchmark/destinationLiveness.test.ts` |
| C→D measured at three points, budget re-derived, binding point censused | `benchmark/destinationDispatchContrast.test.ts` |
| twelve new pins, no existing pin moved | key-by-key diff, § T18-D3; `published.test.ts` partition |
| the shipped panel profile survives the fuzz corpus at every generated call type | `fuzz/corpus.test.ts`, `fuzz/determinism.test.ts` (§ T18-D7) |

---

Decisions and measurements taken while collecting the coverage that `CarConfig.mode` and
`BuildingConfig.serviceEvents` (T19) unblocked. Recorded here rather than in the repository-level
`DECISIONS.md`, which this task does not own; anything marked **HANDBACK** needs an owner outside
`packages/experiments/src/{validation,fuzz}/**`.

Every number below is measured in this worktree, against the real `data/` directory.

---

## D85 — `validation/serviceMode.ts` keeps its `Proxy`, promoted from "the reachable half" to **the dispatcher-view control arm**

The module was written when nothing could set a car's mode from a configuration. Its "what is
missing" table and its three "does not reproduce" bullets described a gap that T19 closed, and both
are now gone. The `Proxy` is not.

It is kept because **the difference between the two arms is a property of the simulator**, not an
artefact of the instrument:

| | arm A — `seenAsMode` (Proxy) | arm B — authored `mode` / `serviceEvents` |
|---|---|---|
| what changes | the `mode` on every `CarSnapshot` the group is shown | the car's own `#mode` |
| `infeasibilityOf` answers `serviceMode` | yes | yes |
| hall calls **allocated** | 0 | 0 |
| committed hall calls released and re-offered | no — `Car.setMode` is never called | yes |
| **legs boarded** | **338 of 365** | **0 of 365** |

Measured on one synthetic building at one seed, both arms in one test
(`adversarial.test.ts`, "differ in exactly one place"). The cause is `sim/simulation.ts`
`#loadWhileIdle`, which opens a car already standing at an occupied landing **without consulting
the dispatcher**, deliberately — so a *dispatcher-blinded* fleet keeps collecting people while a
*physically recalled* one cannot, and `#carCanCarry` is what stops the second.

So `legsBoarded === 0` is the **wrong** assertion in arm A and the **right** one in arm B, from the
same reason code and the same zero allocation count. Deleting the `Proxy` would have lost the
ability to say that, and a change that made `#loadWhileIdle` consult the dispatcher would silently
collapse the two arms into one. Pinned, so it fails loudly instead.

---

## D86 — **FINDING.** P5 termination was blind to a fleet that never moves at all

**The most extreme corner in the adversarial suite passed all six properties.** An authored
all-out-of-service fleet delivered **0 of 365** journeys, boarded nobody, allocated nothing, and
`checkAll` returned an empty violation list.

The cause is one line. `checkTermination` measured the idle stretch once for the run:

```ts
let lastActivityAt = result.record.startedAt;   // ← the fallback
// … max over every boardedAt / alightedAt …
const idleSeconds = result.deadlineS - lastActivityAt;
if (idleSeconds <= bounds.deadlockIdleBoundS) return violations;
for (const journey of result.undelivered) {
  const waitingSince = …;
  if (waitingSince > lastActivityAt) continue;   // ← skips everybody
```

When the fleet does no work at all, `lastActivityAt` never leaves `record.startedAt`. Every
passenger arrives after the run starts, so `waitingSince > lastActivityAt` holds for *all* of them
and every candidate is skipped as "not yet waiting when the stall began". The deadest possible
building reported nothing.

**Fixed, by strengthening — never by relaxing.** The stretch is now measured per passenger, over
the overlap between the fleet's inactivity and that passenger's own wait:

```ts
const stallBeganAt = Math.max(lastActivityAt, waitingSince);
const idleSeconds = result.deadlineS - stallBeganAt;
if (idleSeconds <= bounds.deadlockIdleBoundS) continue;
```

This is **strictly stronger**: whenever `waitingSince <= lastActivityAt` the maximum *is*
`lastActivityAt` and the expression reduces to the original exactly, so nothing that fired before
stops firing. `PROPERTY_BOUNDS.deadlockIdleBoundS` is untouched at 600 s — the bound was never the
problem and moving it would have been the failure mode this whole track exists to prevent.

**Reproduce (no seed needed — it is a config, which is the point):** a two-car bank with both cars
authored `mode: "out-of-service"`; `adversarial.test.ts` → "boards nobody at all when every car is
authored out of service". Before the fix: `violations = []`. After: `violations = ['termination']`,
and that is now the assertion.

**Blast radius, measured:** zero new failures. 64/64 always-on cases and 2 000/2 000 deep cases
still hold all six; `faults.test.ts`'s P5 demonstration still fires; every adversarial corner is
unchanged except that the shrinker now reduces its counterexample further (815 → **49** units,
against 315 before), because a stronger property survives more reductions.

**How this went unnoticed:** the corner was unauthorable until T19, so no campaign could produce a
run in which the fleet did *literally nothing*. The property was demonstrated to fail
(`faults.test.ts` P5) against a controller that stalls **after t=60** — which leaves
`lastActivityAt` at a real boarding and therefore never exercises the fallback. A property
demonstrated to fail on one shape is not a property demonstrated to fail on every shape.

---

## D87 — the fuzz generator never withdraws every serving car from a bank, and that is a construction rule rather than a filter

`generate.ts` emits both new shapes. It also enforces, by construction, that **every bank holds at
least one `in-service` car at every instant of the run** — an initial degradation is drawn only for
a bank of two or more, and a scheduled withdrawal only when the bank would still have one left.

The reason is not squeamishness. `properties.ts` `isServable` reasons about topology and access
credentials; it does not know about service mode. A bank with no serving car therefore produces
passengers the property believes are servable and nobody can collect, and P5 fires — **correctly**.
That verdict would be a *generator* artefact rather than a simulator finding, exactly like the
`unroutable` skip reason it sits next to, and a campaign that reported it would drown its real
findings.

The corner is not lost. It is covered where the expected outcome can be asserted rather than
avoided: `adversarial.test.ts` (`status === 'timed-out'`, `violations === ['termination']`,
`legsBoarded === 0`, books balanced) and `core/src/sim/serviceMode.test.ts`.

The rule is re-checked in the **shrinker** as well (`shrink.ts` `everyBankAlwaysServes`), because a
reducer can break it where the generator cannot: dropping the other car of a two-car bank leaves
the degraded one alone. Under shrinking that failure would be indistinguishable from the one being
reduced — same property, different cause — so such a candidate is discarded.

---

## D88 — the service axis draws from its own `fuzz.service` stream, so no pinned building moved

A new named stream (CLAUDE.md invariant 2) rather than more draws on `fuzz.run`. The consequence is
that every building the corpus generated before this axis existed is **bit-identical apart from the
keys the axis adds** — same floors, same banks, same pitch, same access zones, same arrival rate,
same horizon — so `generate.test.ts`'s pinned coverage assertions did not have to move to
accommodate a widening that has nothing to do with them.

The three run scalars (`arrivalRatePctPop5min`, `durationS`, `doorObstructionProbability`) were
hoisted out of the returned object literal, because the schedule needs the horizon in hand. They
are drawn in **exactly the previous order**, which is why nothing moved.

---

## D89 — the shrinker carries `serviceEvents`, and reduces them on purpose

`draftOf` used to drop the schedule silently. A shrinker that did that would report a "minimal"
counterexample no longer containing the mid-run mode change the original was about, and the
reduction step that did it would look exactly like a legitimate one — the candidate still fails,
for a different reason.

So the schedule is carried; `dropServiceEvent` and `restoreCarMode` remove one entry / one
degraded mode at a time, so "the recall was not needed" is a *measured* reduction; entries naming a
car a reduction removed are dropped with it, the way `dropFloor` drops every reference to a floor;
and `sizeOf` weights both, or the size guard would reject every candidate the two new reducers
produce and neither would ever fire.

---

## D90 — **FINDING, HANDBACK.** The deep campaign is red on `fuzz-1001074`, and it is not a service-mode bug

> **RESOLVED in T21 — this section is kept as the record of the finding, not as an open item.**
> The handback was accepted. `RunSummary.awtIsValid` gained a **fourth** ground —
> `core/src/metrics/summarize.ts` § `diagnoseServiceLevel` — because the trend gate and the
> censoring gate are both proxies for *"did the backlog clear?"* and neither sees a backlog that
> cleared *late*. The deep tier is green: 0 failures in 250 and in 2,000 cases. Nothing in the
> fuzz package moved: `PROPERTY_BOUNDS.starvationBoundS` is still 900 s, `checkStarvation` is
> unchanged line for line, and the generator was not narrowed.


One counterexample in 2 000 deep cases. P6 starvation:

```
case      fuzz-1001074      simSeed 2110294577
topology  single-bank       tags: basement, mixed-use, initial-service-mode
dispatch  auction-multi-round / mobile-credential
demand    6.1 %pop/5min over 1433 s, drain 1800 s
service   initial: main/main-2 = independent      schedule: none
status    completed, 177 passengers
  [starvation] leg "p106" (13 to G) waited 922.7 s, past the 900 s bound,
               in a run reporting saturation verdict "stable" with a valid AWT
  [starvation] leg "p107" (13 to G) waited 922.7 s, …
```

Reproduce with `caseFromSeed(1001074, generateOptionsFrom(config, DEEP_SPACE))`.

**The service mode is only how the campaign reached it.** `main-2` is `independent`, so a
fourteen-floor building is served by one car for hall calls — and the **shrinker removed the
mode**, reducing in five steps to an eleven-floor, genuinely single-car, all-in-service building
that reproduces both violations exactly. The old corpus simply never drew a building of that shape
at that rate.

What disagrees is two definitions, both defensible. `metrics/summarize.ts` calls the run `stable`
because its queue does not *diverge* — it spikes under a transient overload one car cannot absorb,
then clears, and the run `completed` with nobody undelivered. `properties.ts` `checkStarvation`
calls it starvation because the run publishes an AWT while two people waited 15.4 minutes, which
is precisely the "statistics improve as the bug gets worse" failure `CLAUDE.md` is written
against. "The queue is not diverging" and "nobody was abandoned" are being treated as one claim
and are two.

The resolution belongs in `core/src/metrics/summarize.ts`, which this package does not own.
**HANDBACK.** A skipped, documented regression test naming it sits in `fuzz/deep.test.ts`.

`PROPERTY_BOUNDS.starvationBoundS` was **not** moved and the generator was **not** narrowed. 900 s
is two orders of magnitude past the 10–30 s AWT the shipped buildings run at; relaxing it to make
the case pass is the exact failure mode this track exists to prevent. The deep tier is therefore
red on this finding, on purpose, and `npx vitest run` is unaffected — the deep campaign is opt-in.

---

## D91 — `perfScaling.test.ts` splits by **what the number is made of**, not by grid size

Raised mid-task: the file flaked again on the integration branch —
`expected 0.8870047674272091 to be greater than 0.9` under concurrent load, 5/5 in isolation. Its
demand `R²` gate had already been loosened 0.9 → 0.75 and its exponent floor 0.6 → 0.5 for the same
reason. A threshold loosened three times asserts nothing.

**Not loosened a third time.** The always-on tier now asserts only quantities that are *simulation
outputs* — legs carried and kernel **events** — which are identical on every machine at every load,
because they are functions of the seed. Every wall-clock gate moved to `ELEVATOR_SIM_DEEP=1`,
where it reads the grid the always-on sweep already ran (so enabling it costs nothing but the
assertions). Timings are still printed in both tiers.

The scaling claim itself stays **asserted, not merely printed**, and the dominance finding survives
the change because the two rankings agree:

| axis | events exponent (asserted always-on) | seconds exponent (asserted deep only) |
|---|---|---|
| demand | **0.63** (R² 0.999), 8× axis → 3.65× events | 0.85, 6.09× cost |
| cars | 0.36 (R² 0.994), 4× axis → 1.66× events | 0.45, 1.86× cost |
| floors | 0.03 (R² 0.213), 4× axis → 1.04× events | 0.33, 1.59× cost |

Two new always-on assertions come free and are worth having on their own: `legRatio ∈ (0.9, 1.1)`
on the floor and car sweeps, which is the module's own "population held constant" confound stated
as a check rather than as prose.

**What the split costs, stated rather than glossed.** Event count catches a regression that creates
more *work* — an extra dispatch pass, a re-offer storm, a duplicated stop. It does **not** catch one
that makes each unit of work more expensive: a per-floor scan inside the per-event path, or a car
loop nested inside a car loop, leaves every count identical and moves only the milliseconds. That
guard is real and it now runs on request. The trade is deliberate — a guard that runs on request
and means something beats one that runs always and gets ignored.

Delta: 5 always-on tests (was 5), plus 4 tests that are skipped unless `ELEVATOR_SIM_DEEP=1`.
Verified green in both tiers: 5 passed / 4 skipped by default, 9 passed under `ELEVATOR_SIM_DEEP=1`.

---

## Campaign statistics

Measured on this code. The machine was running another builder's suite concurrently for part of
the time, so the wall-clock figures are pessimistic; every other number is deterministic.

| | always-on (`corpus.test.ts`) | deep (`ELEVATOR_SIM_FUZZ=deep`, 2 000 cases) |
|---|---|---|
| generated buildings | 64 | 2 000 |
| passengers generated | 7 889 | 1 396 887 |
| simulated time | 14.84 h (53 431 s) | 1 242.86 h (4 474 284 s) |
| wall clock | ≈1.1 s (whole `fuzz/` directory ≈2.4 s) | 358 s |
| run outcomes | 55 completed, 9 timed-out | 1 143 completed, 857 timed-out |
| topologies | single 24, parallel 17, sky-lobby 14, shuttle 9 | single 520, sky-lobby 505, shuttle 492, parallel 483 |
| unroutable / invalid generated | 0 | 0 |
| **property violations** | **0** | **1** (D83) |

Against the pre-task figures recorded in `DECISIONS.md`: always-on simulated time 14.17 → 14.84 h
and timed-out runs 5 → 9; deep simulated time 1 217.27 → 1 242.86 h and timed-out runs 795 → 857.
That is the axis biting — a bank one car short finishes less of its work inside the horizon.
Passenger counts are unchanged, because the trace is a function of the seed and the building
*shape*, and the service axis changes neither.

Passenger counts are unchanged from before this task (7 889), because the passenger trace is a
function of the seed and the building *shape*, and the service axis changes neither. Simulated time
rose from 14.17 h to 14.84 h and timed-out runs from 5 to 9: a bank one car short finishes less of
its work inside the horizon, which is the axis biting.

### Service-mode coverage of the pinned corpus

Asserted against exact seed lists in `generate.test.ts`, not sampled:

| shape | pinned seeds |
|---|---|
| a car starts the run out of group control | 101, 102, 107, 111, 116, 121, 128, 137, 181 (**9**) |
| a mid-run `serviceEvents` schedule | 101, 107, 108, 113, 129, 131, 141, 142, 144, 156, 193 (**11**) |
| …of which the car comes back | 101, 107, 113, 141, 144, 156, 193 (**7**) |
| …of which it does not | 108, 129, 131, 142 (**4**) |

All four `SERVICE_MODES` are reached, and both the `bankId`-qualified and unqualified event forms
(6 unqualified, 12 qualified), so both of `resolveBuilding`'s lookup paths are exercised.

---

## What is still unreachable, and which kind of gap each one is

Checked, not inherited. The three limitations T19 recorded:

1. **A car recalled with passengers aboard strands them** — `setMode` clears its car calls, so it
   has no reason to move and they end `undelivered: 'riding'`; the audit balances. A real Phase I
   recall discharges at the recall level.
   → **A modelled behaviour, not a coverage gap.** The simulator does something definite and says
   so; what is missing is a *different behaviour* (discharge-at-recall-level), which is a `core`
   change and not a config field. Reproduced incidentally by generated cases that withdraw a busy
   car, and it is why P1 conservation is checked on every one of them.
2. **Under destination dispatch, recalling a promised car strands its promises**, counted in
   `brokenPromises`, because `Passenger.assign` is write-once (**D29**).
   → **A modelled behaviour with an honest counter, and a blocked improvement.** Fixing it means
   re-promising, which changes D29's write-once rule and belongs with Phase 6b. **HANDBACK.**
   Not covered here: `runCorner` and `fuzzSimulationConfigFor` both drive conventional dispatch, so
   the interaction of `serviceEvents` with `passengerAssignment: 'destination'` is **untested in
   this package**. That *is* a coverage gap, and it is the clearest next step on this axis.
3. **`independent` is modelled only as "outside group control"** — no attendant drives it, so it
   answers the car calls of whoever is aboard and then stands.
   → **A modelled behaviour.** `acceptsCarCalls` already said exactly this and nothing new was
   invented. It is generated (it is one of the three degraded modes the fuzzer draws), so the
   branch that distinguishes it from `out-of-service` is visited rather than assumed.

Added by this task:

4. **A bank with no serving car is generated by neither corpus** — see D80. Covered by two named
   tests instead, which is the right place for a corner whose expected outcome is a violation.
5. **Multi-replication statistics over service-mode cases.** One replication per case, as
   everywhere in `fuzz/`. Nothing here says a mean under a degraded fleet is right, only that the
   mechanics under it are sound.
6. **A wall-clock regression that does not change the work done** — see D84. Reachable only under
   `ELEVATOR_SIM_DEEP=1` now, by choice.

---

## Records elsewhere that are now false — **HANDBACK**

`DECISIONS.md` § "What remains unfuzzed, and why" is not this task's file. Two of its rows no longer
describe the code:

| row | recorded | now |
|---|---|---|
| **Out-of-service cars** | *"Not authorable: `carConfigSchema` has no service-mode field … Generating one needs a `core` change."* | The `core` change landed (T19). Generated, from the `fuzz.service` stream, in 9 of the 64 pinned cases; all four modes reached. |
| **Mid-run mode changes** | *"No mechanism exists to change a dispatcher, a zone or a car's availability during a run."* | A car's availability does have a mechanism: `BuildingConfig.serviceEvents`, fired by the kernel at a simulated time. Generated in 11 of the 64 pinned cases. **A dispatcher and a zone still have none**, so the row should be narrowed rather than deleted. |

A third row is worth adding, and is stated in `campaign.ts` in the meantime: **a bank with no
serving car** is deliberately outside both corpora (D80).

---

The Phase 8 property campaign's deep tier was red on one counterexample, `fuzz-1001074`, handed
back to `core` by `packages/experiments/src/validation/DECISIONS-T20.md` § D83. Phase 8 findings
block release, so this is the resolution and the evidence behind it.

---

## The reproduction

`caseFromSeed(1001074, generateOptionsFrom(config, DEEP_SPACE))`, simSeed 2110294577, run through
`fuzzSimulationConfigFor` — which reports over `full-run`, deliberately, so that a starvation bound
computed over five minutes of a twenty-seven-minute run cannot exempt most of the passengers.

```
topology  single-bank, 15 floors, 2 cars (main-2 = independent)   status completed, 177 legs
window    full-run [0, 1616.02) = 1616.0 s                        undelivered 0

saturation  verdict stable      saturated false     source recorded, 120 samples
            slope     0.4159 persons/min   (gate 0.5)   →  FAILS gate 1
            growth   11.202 persons        (gate 8)     →  passes gate 2
            g2n       1.323                (gate 4)     →  FAILS gate 3
            t         3.711                (gate 2)     →  passes gate 4
            queue: mean 20.8, peak 41, first sample 0, last sample 0

waiting     n 177   arrivals 177   unserved 0
            mean 172.067 s   median 101.79 s   p90 450.46 s   p95 686.43 s   p99 897.52 s
            max 922.65 s     67.8 % of legs waited over 60 s

awtIsValid  true            ← the defect
```

The shrinker reduces it in five steps to an **eleven-floor, single-bank, single-car,
all-in-service** building — `main-2` was `independent`, so it never answered a hall call and
removing it changes nothing — and the reduced case reproduces every figure above to the last digit.
It is not a service-mode artefact and not an exotic corner.

Two legs waited **922.7 s** in a run publishing a mean.

### Little's Law says the model is internally consistent

`λ = 177 / 1433 s = 0.1235 legs/s`; `λ · W = 0.1235 × 172.07 = 21.2`, against a measured mean queue
of **20.8**. The simulator is not wrong about anything. The queue really is that long, the waits
really are that long, and the two agree. **What was wrong was the report.**

---

## T21-D1 — the finding is a defect, and it is a hole in `awtIsValid`'s coverage

`checkStarvation` and `summarize.ts` were each right about a different claim, and the claims were
being treated as one.

`awtIsValid` had three grounds, and the two substantive ones are **both proxies for a single
question — did the backlog clear? — detected in two specific shapes**:

| gate | the shape it sees |
|---|---|
| trend (`SaturationDiagnosis`) | a queue that never clears and is **still growing** at the horizon |
| censoring (`DEFAULT_MAX_UNSERVED_FRACTION`) | a queue that has not cleared **by** the horizon, so the people in it are unserved legs |

Neither sees the third shape: **a queue that grew enormously and then drained before the horizon.**
`fuzz-1001074` is exactly that. It escapes the trend gate because a hump fits a shallow line with
large residuals — `g2n` 1.32 against a gate of 4, which is the *false negative* twin of the false
positive `SaturationThresholds` already documents — and it escapes the censoring gate because
everybody was eventually collected, 177 of 177.

That the run *recovered just in time* is precisely what let it publish, and the passengers in the
backlog absorbed the whole cost. That is the "statistics improve as the bug gets worse" failure
`CLAUDE.md` § Statistical discipline is written against.

**So this is a defect, not a defensible report**, and the fix belongs in `core`.

---

## T21-D2 — the gate is a **fourth `awtIsValid` ground**, not a fourth `SaturationVerdict`

The handback offered "a distinct verdict between `stable` and `diverging-queue`". Rejected, for a
mechanical reason rather than a stylistic one.

`detectSaturation` takes `readonly QueueSample[]` and nothing else. To produce a
"bounded-but-unacceptable" verdict from inside it, the rule would have to threshold **queue level**,
and queue level cannot be made scale-free: Little's Law is `L = λW`, so forty people waiting is a
normal morning in a 4 000-person tower and a catastrophe in an eleven-floor building with one car.
The observable that is *already normalised by the arrival rate* is the **wait**, which is why the
gate is stated in seconds and lives where the other AWT gates live.

Two consequences, both deliberate:

- `saturation.verdict === 'stable'` still means exactly "the trend test said stable". Every
  consumer reads it that way — `benchmark/arms.ts`'s ceilings, `saturationCensus.test.ts`, the viz
  overlay, `reports/compare.ts` — and widening it would have quietly changed all of them.
- `SaturationDiagnosis.saturated` is untouched, so `stopOnSaturation`, `CellAggregate.saturated`
  and every early-stopping path behave identically. **This is why no pinned estimate moved.**

The evidence lands on a **second diagnosis**, `RunSummary.serviceLevel`, modelled on
`SaturationDiagnosis` for the reason that interface gives: *a flag with no evidence is
un-auditable*. It names the passenger, the floors, the seconds, the horizon and the count.

### Censoring runs in the safe direction

A leg that never boarded has no waiting time but does have a waiting time *so far*:
`record.endedAt - arrivedAt`, a **lower bound**. It counts at that bound, and
`longestWaitIsCensored` says when the reported figure is one. Excluding the unserved would put the
gate's blind spot exactly where service is worst — the same argument
`DEFAULT_MAX_UNSERVED_FRACTION` is built on, applied to the tail instead of to the mean. This is
also why the CLI reads `serviceLevel.longestWaitS` rather than `waiting.maxS`, which is computed
over the legs that **boarded** and is therefore blind to the worst passenger in the building.

### The horizon is 900 s, and it is measured against, not chosen

Not a service-quality target. It is the point past which a wait stops being a bad wait and becomes
evidence that a passenger was *forgotten*, fixed the way `DEFAULT_MAX_UNSERVED_FRACTION` is — by
distance from the regime the project publishes in. Measured at the budgets the benchmark actually
uses, over every shipped operating point at every shipped profile:

| operating point | n | longest single wait | margin under 900 s |
|---|---|---|---|
| Midtown Office, up-peak 1 % | 250 | 203.7 s (`destination-panel`) | 4.4× |
| Garden Apartments, residential 2 %, full run | 500 | 136.6 s (`destination-panel`) | 6.6× |
| Secure Tower, up-peak 2 % | 150 | 121.2 s (`nearest-car`) | 7.4× |
| Midtown Office, interfloor-mix 1.5 %, full run | 1000 | **344.8 s** (`nearest-car`) | **2.6×** |

Every replication of every one of those cells returns `serviceLevel.verdict: 'served'`. The gate
does not fire anywhere the project quotes a number.

The cells that *do* produce longer waits — Secure Tower interfloor-mix under the conventional arms,
where an access-restricted pickup carries no credential and the call is permanently unassignable —
already lose their AWT at replication index 0 on gates 1 and 2, and are published as counts rather
than as an interval (`arms.ts`, `admissibleReplications: 0`). So the horizon sits clear above
everything the project publishes and below everything it already refuses to.

`benchmark/saturationCensus.test.ts` **re-measures and asserts** all of it, at the same budgets, so
none of those figures can go stale. T17's rule cuts both ways and this is the half that answers it:
a suppression rule that fires everywhere computes nothing, and this one fires nowhere it should not.

### Gate ordering

Saturation → emptiness → censoring → starvation. A run tripping more than one reports the most
fundamental reason, so **every existing `awtInvalidReason` string is unchanged**; only runs that
tripped *nothing* before can acquire the new text.

---

## T21-D3 — `checkStarvation` is not touched, and what it still catches

`packages/experiments/src/fuzz/properties.ts` is **unchanged, line for line**, and
`PROPERTY_BOUNDS.starvationBoundS` is still 900 s. P6's escape clause already reads

```ts
const flagged = !result.summary.awtIsValid || result.summary.saturation.verdict !== 'stable';
```

and its docstring already says *"a fifteen-minute wait is legitimate in a run that says so"*. The
run now says so, so P6 passes **for the reason it was written to accept**, without the property, the
bound or the generator moving.

`DEFAULT_MAX_WAIT_HORIZON_S` is deliberately the same 900 s **and deliberately not imported from
`PROPERTY_BOUNDS`**. The project should state one abandonment horizon and it belongs in the model
rather than in a test bound — which is the handback D83 made — but a constant shared between a check
and the thing it checks makes the check vacuous.

**The honest cost, stated rather than discovered later.** For a run whose starved legs lie inside
the report window, the core gate is strictly stronger than P6's condition, so P6 can no longer be
the thing that fires. Under the fuzz harness's own `reportWindow: 'full-run'` that is every run.
What P6 still covers, and the core gate does not:

- **Legs outside the report window.** `serviceLevel` is a statement *about a window* — under
  `peak-5min` a passenger starved at minute 25 is outside the cohort by construction, and is not
  something `summarize` is lying about. P6 scans the **whole record**.
- **Servability.** P6 re-derives from the building whether the fleet could legally have carried the
  leg, and exempts an access lockout or an unreachable floor. `core` has no such notion, so the two
  computations genuinely differ.
- **The window bounds and the censoring instant themselves.** P6 uses `record.endedAt` and its own
  selection; a bug in either of `summarize`'s would show as a disagreement.

`fuzz/faults.test.ts`'s P6 demonstration was rewritten rather than weakened, and now asserts the
whole chain on one real faulted run (`fuzz-102`, floor 4 starved to t = 1896):

1. with the model gate **off** — `maxWaitHorizonS` past anything the run reaches, the gate's own off
   switch — `checkStarvation` fires on three legs (worst 1147.5 s), and P1–P4 stay quiet;
2. with the gate **on**, the same run reports `serviceLevel: 'starved'`, `awtIsValid: false`, leg
   `leg10` at 1147.5 s, and P6 is correctly silent.

A version of that test still demanding a P6 violation would have been demanding that the simulator
go back to publishing a mean beside an abandoned passenger.

---

## What moved, and what did not

**Pins: none moved.** `PINNED_ESTIMATES` records `(n, mean, standardError, lower, upper)` from
`aggregateMetric`, which reads `record.metrics[metric]` and never consults `awtIsValid`. The only
path from that flag to a number is `stopOnSaturation`, which keys on `saturated` — untouched by
T21. Verified by the whole suite running green, including every `assertPinned` call site.

**`validation/golden/manifest.json`: unmoved.** It carries no simulator output, and `envelopeKeys`
is derived from `summarizeOptionsOf`, which stores only `window` and `terminalFloorIds`. The new
option is optional and unset on every golden run.

**`METRICS_SCHEMA_VERSION`: not bumped.** It versions `RunRecord` on disk. `RunSummary` is derived,
never persisted; the one stored artefact about it is `summaryFingerprint`, which is computed and
re-derived in the same build.

**`VIZ_SCHEMA_VERSION`: not bumped.** `VizSummary` copies `awtIsValid` and `awtInvalidReason`
rather than recomputing them, so the overlay, the canvas banner and `describeFrame` all inherit the
new suppression with no contract change — which is the payoff of D64's rule that the viz never
holds a second opinion about a `core` verdict.

### Consumers of the verdict vocabulary, checked

| consumer | reads | effect |
|---|---|---|
| `cli/format.ts` · `renderAwt` | `awtIsValid`, `awtInvalidReason` | inherits; prints the new reason |
| `cli/format.ts` · `renderLongestWait` | `serviceLevel` | **new**, and the non-test caller for the diagnosis |
| `cli/commands/run.ts` | both of the above | `longest wait` is no longer suppressed — see below |
| `viz` overlay / canvas / `describeFrame` | `summary.saturated \|\| !summary.awtIsValid` | inherits |
| `runner/replicationRunner.ts` | `saturation.saturated`, `awtIsValid` | inherits; `saturated` unchanged, so stopping is unchanged |
| `reports/compare.ts`, `reanalyze.ts` | `awtIsValid` per replication | inherits |
| `tuning/search/objective.ts` | `cell.aggregate.awtIsValid` | inherits |
| `benchmark/saturationCensus.test.ts` | first invalid replication per arm | re-measured; every recorded ceiling holds |
| `reports/persistence.ts` | `StoredSummarizeOptions` | new optional key, added to the `rejectUnknownKeys` allowlist |
| `tuning/space/collect.ts` | `METRICS_PARAMETERS` | one new declared row; `metrics.*` is excluded from the searchable space, so `SPACE.parameters.length` is unmoved at 49 |

### One behaviour change outside the gate, deliberately

`cli/commands/run.ts` printed `longest wait: SUPPRESSED` whenever the AWT was suppressed, off
`waiting.maxS`. That was wrong twice over. The mean is an *estimate* and the suppression rules are
about estimates; the longest wait is an **observation**, and it is the observation a suppressed mean
is usually hiding — the same distinction `viz`'s D64 draws. And `waiting.maxS` covers only the legs
that **boarded**, so on a run whose worst passenger never boarded it reported the longest wait among
the people who *were* collected. It now reads `serviceLevel`, is never suppressed, names the leg,
and says when the figure is a lower bound.

---

## A separate finding, uncovered while verifying — **HANDBACK**

The deep tier is green at its own default budget (250 cases, 0 failures). At the 2 000-case
overnight budget — the one that originally found `fuzz-1001074` — it reports **one** failure, and it
is **not** this one:

```
case      fuzz-1000384      simSeed 205687583
topology  sky-lobby   tags: sky-lobby, access-zones, mixed-use, initial-service-mode, service-schedule
status    timed-out, 480 passengers
  [termination] deadlock: the last passenger boarded or alighted anywhere at t=1734.7, and
                nothing has happened for the 1694.3 s before this run's hard deadline of
                t=3429, while journey "j35" (G to 4, waiting) was servable and outstanding
                since t=152.9
```

**P5 termination, not P6 starvation, and proven pre-existing.** Re-run on `c072f97` — the branch
point, with every T21 change stashed — it produces the identical violation to the same decimal. It
is also mechanically untouchable by this change: `checkTermination` reads `result.status`,
`deadlineS`, the boarding and alighting timestamps and the servability of an undelivered journey,
and consults neither `awtIsValid` nor `serviceLevel`. The shrinker reduces it in 33 steps to a
29-passenger case that still deadlocks, on a bank whose remaining car is `mode: "independent"` —
the same family as `DECISIONS-T20.md` § D79. It belongs to `sim/` and `dispatch/`, not to the
metrics layer. Recorded in `fuzz/deep.test.ts`'s header rather than filtered out.

---

## Known limitations

1. **The gate is per-window, so a `peak-5min` report cannot see a passenger starved at minute 25.**
   That is correct — a window statistic is a statement about its window — but it means the gate's
   coverage depends on the analyst's window choice, and the fuzz harness's `full-run` choice is what
   makes it total there. P6's whole-record scan is the backstop.
2. **900 s is a stated horizon, not a derived one.** It is defended by distance from the shipped
   operating points (2.6× at the tightest) and by the 60 s long-wait metric being two orders of
   magnitude below it, but a project with a different service target would state a different number.
   It is declared in `METRICS_PARAMETERS` and settable per-summary for exactly that reason.
3. **The gate cannot distinguish an abandoned passenger from an unservable one.** `core` has no
   servability notion and acquiring one would mean `metrics/` importing the building model. A run
   with a permanent access lockout is therefore reported as `starved`, which is arguably the right
   answer for a report and is definitely not the same claim P6 makes.
4. **`overHorizonCount` is a count, not a rate.** A run with one abandoned passenger and a run with
   two hundred both come back `starved`. The count is on the diagnosis so a reader can tell them
   apart; the *flag* deliberately does not, because one abandoned passenger is already enough to
   make the mean a description of a system nobody experienced.

---

Decisions taken during the **closing documentation pass (T23)**, branch `docs/final-status`,
2026-07-28. This task owns `docs/**`, `README.md`, `CLAUDE.md` and the orchestration files, and no
file under `packages/**` or `data/**`. Anything marked **HANDBACK** needs an owner in code.

Baseline verified before any edit, in this worktree: `npx tsc -b` clean; `npx vitest run
--testTimeout=60000` → **167 files / 3,100 tests (3,092 passed, 8 skipped)**, 343 s. Delta after the
pass: zero.

## D92 — every figure this pass publishes names its source, and two were re-derived here

The standing rule for this pass was that no number may be written that cannot be traced. Three
classes were used and they are labelled differently in the documents:

| class | example | how it is written |
|---|---|---|
| **re-derived in this worktree** | the replication-budget table; the sequential rule's crossing | stated with the run that produced it |
| **pinned by a test that re-derives it** | `−1.562 [−1.916, −1.208] s`; `+0.982 [+0.584, +1.380] s` | stated with the study module that regenerates it |
| **transcribed from a decision record** | C20's 82.5 % / 21.2 %; C21's 1.23 s | stated **as transcribed**, and the doc says it was not re-measured here |

Two figures were re-derived rather than transcribed, because both were cheap and both were load
bearing:

- **The replication budget.** `studentTQuantile(0.95, n−1) · 3.60 / √n ≤ target`, smallest `n`:
  **11 / 37 / 57 / 143 / 222 / 563**. The published row was 9 / 36 / 55 / 141 / 220 / 563; the
  normal quantile gives 9 / 36 / 55 / 141 / 220 / **562**, so five of six published rows are `z`'s
  answer exactly. Since `t > z` at every finite `n`, the published table **understated the budget at
  every rung** — the optimistic direction. Corrected in `docs/07` § 4 **and** `docs/03`, which
  carried the same six numbers and which C19 did not mention.
- **The sequential rule's unconstrained crossing**, because correcting the projection from 9 to 11
  put it *above* the crossing and that needed checking rather than assuming. Measured through
  `runGateExperiment` with `productionStoppingRule`, `minReplications: 2`, `checkEvery: 1`,
  ±2 s at 90 % on Midtown up-peak `eta`: **n = 10**, `rule-satisfied`, half-width 1.8762 s, mean
  16.7797 s, s = 3.2366 s. Unchanged by D14. The projection and the crossing disagree because the
  crossing run's own sample sd (3.24 s) is smaller than the 3.60 s reference the table projects
  from, which is stated in the doc rather than smoothed over.

## D93 — C29 is refuted by disk, and the doc is **not** given the line it asked for

**C29 asks `docs/01-architecture.md`'s module tree to gain `viz/editor/`. There is no such
directory.** The editor's four pure modules are flat files at `packages/viz/src/`
(`editorEdits.ts`, `editorValidate.ts`, `editorHistory.ts`, `editorPreview.ts`) — § D65 records that
they were written as `editor/` and moved out precisely because `core/src/sim/moduleTree.test.ts`
compares the doc against disk **in both directions** and `docs/` was not that task's to edit.

Adding the line would therefore have made it a **phantom** and reddened the **core** suite — which
is the `experiments/stats/` error that guard exists to catch, committed deliberately this time.

**Chosen:** record it in `docs/01` as outstanding, with the constraint stated: the file move and the
doc line **must land in one commit**, because neither half is valid alone. **HANDBACK** —
`packages/viz/**` plus `docs/**`, which no single task in this wave owned.

This is also why C29's sibling **C28** is reported and not fixed: `moduleTree.test.ts` is a
`packages/core` file another builder owns this round. The precise defect and the precise remedy —
scope the guard's directory set to packages that exist on disk — are written into `docs/01` and
`docs/07` § 8 so the next owner does not have to rediscover them.

## D94 — Phase 8 is recorded as NOT ACCEPTED, over a finding it produced itself

`fuzz-1000384` is an open P5 termination violation and a fix is in flight in T22. Three shapes were
available: mark Phase 8 accepted with the finding as a footnote; withhold the phase status until
T22 lands; or record the tracks as landed and the phase as not accepted, with the finding stated in
full.

**Chosen: the third.** Phase 8's own acceptance rule — inherited from `docs/07` § 7 and written into
the roadmap section this pass created — is that *any Phase 8 failure is blocking*. A rule that is
suspended for the first finding it catches is not a rule, and this project's recorded history is of
acceptance criteria being satisfied in form while the thing they protect fails. Withholding the
status entirely was worse: `docs/05` had **no Phase 8 section at all** before this pass, and "no
status" is the state that let `packages/viz` appear on disk for a whole wave without the register
noticing (§ D26).

So every document records the finding with its seed, its characterisation, its shrink and its
**pre-existence proof** (it reproduces to the same decimal at `c072f97` with T21's changes stashed),
and none of them declares Phase 8 clean. The orchestrator finalises the verdict at merge.

**A corollary, recorded because it is the tempting move:** `deadlockIdleBoundS` is a single number
and raising it makes the red go away. R22 in `RISKS.md` names that explicitly. The precedent is D86,
which fixed a P5 blindness by making the property **strictly stronger** and left the bound at 600 s,
and D91, which refused a third threshold loosening.

## D95 — Phase 8's findings are published as findings, not folded into a green tick

The campaign's four defects are written up in `docs/05` § Phase 8 and `docs/07` § 7 with the
mechanism of each, not merely counted. **A testing campaign that reports only "all green" has hidden
its own value**, and three of these four are cases where every other check in the repository passed:

- `fuzz-1001074` — `awtIsValid: true` beside a 922.7 s wait, on a run that **completed with zero
  undelivered**. Little's Law confirms the simulator was right about all of it; the *report* was
  wrong. Only a randomly generated building produced the shape (a queue that grew enormously and
  drained just in time) that both existing gates miss.
- The out-of-service crash — unreachable until T19 made the corner authorable, and then reachable
  immediately. "Untested" and "unrunnable" looked identical from outside.
- P5's blindness — the most extreme corner in the adversarial suite **passed all six properties**. A
  property demonstrated to fail on one shape is not a property demonstrated to fail on every shape.

## D96 — the phase-status vocabulary is honoured and its limitation is disclosed — **HANDBACK**

`packages/experiments/src/validation/documentation.test.ts` recognises exactly three phase states in
prose: *landed and accepted*, *a foundation only*, *not started*. Neither Phase 6 (6a and 6b
accepted, 6c deferred out of the phase) nor Phase 8 (tracks landed, one finding open) is "a
foundation only".

**Alternatives.** (a) Edit the guard — not this task's file. (b) Round Phase 6 and Phase 8 to
*landed* or *not started* — both false. (c) Use the phrase the guard reads and put the accurate
statement immediately beside it, in all three documents.

**Chosen:** (c), with the limitation named in the text rather than left for a reader to trip over.
`CLAUDE.md`, `README.md` and `docs/07` each carry the guard's phrase and, directly under it, a
two-bullet statement of what is actually true of each phase. **HANDBACK:** add a fourth term
(`are partially complete` → `'partial'`) and migrate the three documents in one commit —
`AGENT_STATUS.md` § T23-R2.

## D97 — the refuted mechanism is corrected in prose and a guard is **specified, not built** — **HANDBACK**

§ D60 records that none of the seven mechanism sites was pinned by a test, so nothing went red while
they were wrong. The obvious response is a guard, and the obvious guard is a string assertion in
`validation/documentation.test.ts` — a `packages/experiments` file this task does not own.

Writing it anyway was not available; writing nothing would leave the correction exactly as
unprotected as the error was. **Chosen:** specify it precisely enough to be dropped in, including
the exclusion that makes it correct — `core/src/model/car/estimateCost.ts:123` says only that a
destination *lets* a dispatcher authorize and optimize in one step, which is a true description of
the code and must not be caught. Recorded as **T23-R1** with the falsification step named: re-insert
the old sentence in one file and watch it go red before trusting it. Also raised as **R23**.

**Verified rather than assumed:** all four `core` sites were read at their current line numbers and
carry the correction (`dispatch/lifecycle.ts:133`, `model/types.ts:122`, `model/car/types.ts:470`,
`sim/simulation.ts:2410`). C20 and C21 were checked the same way and are **still present**, so they
are recorded as open rather than closed — the brief said the concurrent builder "may have fixed"
them, and it had not.

## Known limitations of this pass

1. **Two figures are transcribed, not re-derived** — C20's 82.5 % / 21.2 % and C21's 1.23 s band.
   Both are stated as transcribed in `docs/07` § 8. Re-deriving them means running
   `deriveUpPeakTerms` and `departureGapBracket` over the shipped banks, which is cheap; it was not
   done because the correction lands in `core` files this task cannot edit, and a figure published
   here would be a second authority for a number that belongs in the docstring.
2. **`fuzz-1000384` has no verdict here**, by design. Its status in every document is *open*.
3. **The 87-row UX ledger's four ⚠️ rows are carried through as unverified**, not re-driven. This
   pass has no browser.
4. **Phase 6's acceptance is recorded as the criterion words it**, which at the primary operating
   point means 6b is accepted on INDISTINGUISHABLE metrics plus a reporting clause rather than on a
   win. The documents say that in those words rather than implying a gain.
5. **No test asserts any phase *status*.** The guards assert that the three documents *agree* about
   the phase set, not that the set is true. A wave that marks a phase landed in all three places
   passes every check in this repository.

## D98 — **FINDING (T23-F1).** Phase 6's criterion named a building; the raise dropped it, and nothing was measured there

`docs/05-roadmap.md`'s original Phase 6 gate read *"a learned dispatcher beats the naive baselines on
AWT and WT95 **on the Mixed-Use High-Rise**, with paired-t intervals excluding zero."* § D27 raised
the **metric** clause — gate on TTD, report AWT and WT95 with explicit verdicts — and did not carry
the **building** clause. Every Phase 6a and 6b result is measured on Midtown Office and Secure Tower
interfloor-mix. **None is on `mixed-use-high-rise`.**

The chosen operating points have stated reasons and they are good ones: Secure Tower is the only
building with `accessZones`, and Midtown is the unzoned control without which H-ACCESS-2's
difference-of-differences cannot be formed at all. What is missing is that the substitution was never
*argued*. A criterion that named a building was replaced by one that does not, and the replacement
is the document that records the raise.

**Recorded as a finding rather than repaired**, for two reasons that pull in opposite directions and
are both stated:

- Dropping a named building from an acceptance criterion is the shape of a weakening, and
  `CLAUDE.md` § Working agreements forbids weakening one. On that reading Phase 6's acceptance is
  incomplete rather than wrong.
- `mixed-use-high-rise` is separately the building whose achieved interval is reported
  `unmeasurable` **by design** — a shuttle holds its doors 39.8 s while an office-local car
  completes a whole round trip in 31.3 s, so no departure-gap threshold is valid there and refusing
  to report one is the correct answer. That is a real obstacle to running the original criterion as
  written, not an excuse for not having.

Neither reading is available to this pass to settle: choosing between them means running the
comparison, and this task owns no code. **Phase 8's full experiment matrix — every dispatcher ×
building × traffic — is where it closes**, and it is the same run that discharges Phase 7's
acceptance interval at a real budget. Recorded in `docs/05` § Phase 6, `docs/07` § 8 and
`AGENT_STATUS.md` § T23-F1.

---

## D99 — D27 dropped a named building from Phase 6's criterion; that was a weakening and it will be closed

**Date:** 2026-07-28 · **Owner:** orchestrator · **Raised by:** T23 (recorded there as T23-F1 / D98)

**Context.** Phase 6's roadmap criterion reads *"a learned dispatcher beats the naive baselines on
AWT and WT95 **on the Mixed-Use High-Rise**, with paired-t intervals excluding zero."* D27 raised the
metric clause — correctly, since AWT and WT95 are two of the nine metrics Level 1 makes
non-comparable and the two whose sign flips — but in doing so it **silently dropped the building
clause**, and no Phase 6 result is measured on Mixed-Use High-Rise. T23 caught it and recorded it
rather than letting it pass.

**This is my error, not a builder's.** `CLAUDE.md` says raise a criterion, never lower it. Replacing
a named building with a different one is exactly the shape of a weakening, and it is worse for having
been done inside a decision whose stated purpose was to *strengthen* the gate. It also matches the
pattern this project keeps finding: the substitution had good reasons and was never argued.

**Alternatives.** (a) Leave it — the metric raise is a net strengthening. (b) Argue the substitution
explicitly and amend the criterion. (c) Measure Phase 6 on Mixed-Use High-Rise and hold the original
building clause.

**Chosen:** (c), falling back to (b) only if the building is measurably unsuitable — and if so, the
reason must be a measurement, not a preference. Note there is a real candidate reason already on
record: T13 found Mixed-Use High-Rise reports its interval as `unmeasurable` **by design**, because a
shuttle holds doors 39.8 s while an office-local car completes a round trip in 31.3 s, so no
departure-gap threshold is valid there. That bears on the *oracle*, not obviously on a paired
dispatcher comparison, so it must be checked rather than cited.

**Impact.** Phase 6a and 6b are recorded ACCEPTED on their measured results; this decision does not
retract that. It says the **criterion** is not yet met as written, and until it is, the acceptance
carries the caveat. Assigned to the final task.
