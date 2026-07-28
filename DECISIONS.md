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
