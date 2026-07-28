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
