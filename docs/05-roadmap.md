# Roadmap

Phased build sequence. Each phase has explicit acceptance criteria so work can be
parallelized and verified independently.

**Assumed stack:** TypeScript monorepo, headless `core` package plus separate `viz` and
`cli`. Node for batch experiments, browser for visualization, one shared simulation core.
This is a [documented assumption](00-project-brief.md#key-design-assumptions) and can be
revisited before Phase 0 starts.

---

## Standing requirement — the integration seam has an owner, and it is audited

**Read this before planning any phase.** The most expensive defect this project has produced is
not a wrong number. It is a behaviour that is *configurable, unit-tested in isolation, and dead in
the shipped path* — and it has now happened **eleven times in code, plus twice in `data/`**. Four were
in Phase 5, all four
simultaneously: `prepositionPlan`, `CapacityReassignmentMonitor`, `createAuctionPolicy` and the
whole arrival-model predictor were built correctly, exported, weighted by a shipped profile, and
called by nothing outside their own module.

> **Two more since the count above was last written (2026-08-04/05), and they are the same shape at
> two different layers.** `BuildingConfig.serviceEvents` — a working mid-run service-mode scheduler,
> resolved in `config/parse.ts`, applied in `sim/`, tested, and called by **no shipped building** —
> got its first caller from `shift/incidents.ts`. And `patternSwitching`, the whole weight-set
> selector library, was **loaded, carried into `SimulationConfig`, resolved by `resolveWeightSets`,
> and writable by nothing in the viewer**; mounting a five-select editor over it would have been the
> defect with a control on top of it. Closed by `dispatcherProfilesWithSelector`
> ([§ D219](../DECISIONS.md)).
>
> **The existing ordinals do not move.** *The ninth*, *the eleventh* and the rest name specific
> instances elsewhere in these documents, and renumbering them would break every reference for the
> sake of a running total. The total is the sentence above; the ordinals are names.

**The fifth was Phase 7's `tuning/report`, and it is the instructive one** — because it happened
*after* both guards below were installed, in a module those guards do not audit. Every function in
it was exercised by its own suite, `seedSetFromReplications` existed precisely to be the integration
seam, and its only caller was a test. The lesson is that the question is not "is this symbol
reachable?" but **"name the non-test caller"** — and for a module whose product is a *measurement*,
the caller has to be something that actually performs the measurement. `report/holdoutRound.ts` is
that caller: it is the only code in the repository that runs the held-out seed set, which a search
structurally cannot do (every round a search runs shares one experiment seed, so the seeds it
optimizes against are the only seeds it has ever seen).

**The sixth was the whole of `tuning/` one level up, and it was asserted closed by this document.**
[Review finding #1](08-review-findings.md) found that `report/holdoutRound.ts` had only moved the
seam up one level: there was no `tuning/index.ts`, `packages/experiments/src/index.ts` exported
nothing from `tuning/`, and every importer of `randomSearch`, `successiveHalving`, `sepCmaEs`,
`runnerObjective` and `runHoldoutRound` was a `*.test.ts` in the same directory. This section
nonetheless read *"green. The machinery is complete and wired"*. All three are now closed — see
§ Phase 7 — and the **seventh and eighth** were found in the same wave and are recorded in
[`DECISIONS.md` § D23](../DECISIONS.md): `StageActivity`'s late-arrival counters lived on the
`Simulation` instance that `runSimulation()` discards, and `WARNING_CODES.doubleDeckNotSimulated`
was raised and asserted in both directions with no shipped path branching on the code. Both now name
a non-test caller (`printRunReport` and `planRun`, in `packages/cli/src/commands/run.ts`).

**The cause was structural, not careless.** Phase 5 partitioned work by module directory and
`sim/simulation.ts` — the file every one of those modules has to be called *from* — appeared in no
agent's ownership list. Each agent finished its directory and every check it could run passed. The
seam had no owner, so nobody's definition of done included it.

**Why nothing caught it.** Each failure mode below is individually reasonable and collectively
useless:

| check | why it passed anyway |
|---|---|
| the module's own suite | drives the behaviour directly, never through a run |
| the config schema | the knob is declared, in range, with a default — it just goes nowhere |
| the run itself | completes, books balance, conservation holds |
| the benchmark | reported a real interval: `[0, 0]` on 500 of 500 replications, which reads as "no effect" |
| a grep for the symbol | hits the barrels and the `{@link}` tags in its own docstrings |

The last row is the trap worth naming twice. A dead symbol *looks* connected: it is re-exported
from three barrels and cross-referenced from a dozen doc comments. Reachability is not use.

**So two guards are permanent, and neither may be deleted to make a phase pass:**

1. **`packages/core/src/sim/seam.test.ts` — behavioural.** Two configurations the docs say must
   differ are run through `runSimulation` on one seed, and their *car trajectories* must not be
   byte-identical. It asserts on trajectories rather than on summary metrics because two
   configurations can produce the same AWT from different journeys, and a mean is exactly the
   statistic that hides a structural difference. Where a categorical drives the behaviour it
   iterates the categorical's own domain (`PARKING_STRATEGIES`, `BUILDING_IDS`) rather than a
   hand-written list, so a new value cannot be added without being covered.
2. **`packages/core/src/dispatch/deadCode.test.ts` — mechanical.** Every export of
   `dispatch/policies/` and `dispatch/predictor/` must have a real importer — its own file, a
   sibling, or anything outside the module — or an entry in `PUBLIC_API_ONLY` **stating why it has
   no caller**. Barrel re-export is explicitly *not* a caller, and only `import`/`export … from`
   bindings count, never textual matches, so a `{@link}` cannot launder a dead symbol into a live
   one. The allowlist is asserted in both directions: an entry whose symbol has since acquired a
   caller, or has been deleted, fails too — otherwise the allowlist becomes the place dead code
   goes to be forgotten, which is this defect one step removed.

**The ninth was `measureEnergyLiveness`, and it was a class rather than a symbol.**
`benchmark/published.ts` § `STUDY_ENTRY_POINTS` splits `benchmark/` in two: everything mapped to a
`PublishedStudyId` publishes a confidence interval, and every one of those has a non-test caller,
because `regeneratePins.ts` runs them all — a pin table must be regenerable from the code that
produced it. Everything mapped to `'no-intervals'` publishes *counts*, and that half had **no driver
at all**, so **all five** of its members were dead by the repository's own measure:
`measureAuctionAggregation`, `measureDestinationLiveness`, `measureEnergyLiveness`,
`measureMultiRoundReachability`, `measurePredictorLag`. Two barrels, a string key and its own test is
what `measureEnergyLiveness` had, and the scanner reported `measureEnergyLiveness -> []`.

The fix is symmetric rather than special-cased: **`benchmark/livenessSuite.ts` is the categorical
half's `regeneratePins.ts`** (`node packages/experiments/dist/benchmark/livenessSuite.js [--fast]`).
It asserts nothing — each of the five already has a suite that asserts its own claim at its own
budget, and duplicating those thresholds would create a second place for them to drift. And
`experiments/src/index.test.ts`'s guard now iterates `Object.keys(STUDY_ENTRY_POINTS)` — a
categorical whose totality against the `benchmark/` directory `published.test.ts` already asserts in
both directions — instead of five hand-written names, so **a sixth categorical study added tomorrow
fails until it is wired in**. Watched failing on the pre-fix state and on a synthetic new study.
The block deliberately does *not* require barrel re-export: six live study entry points are on no
barrel, and `measureEnergyLiveness` was on two and dead.

**And once in `data/`, which is the instance to read if you only read one.** `destination-eta`
authored `dispatch.callType: mobile-credential` and `weights: { waitTime: 1.0 }` — a weight vector
identical to `eta`'s. Schema-valid, loaded by the real loader, exercised by its own tests, named
after the thing it did not do: the destination reached `estimateCost` and changed no decision, and
the full matrix measured it **bit-identical to `eta` at 8 of 8 cells**. Invariant 7 makes dispatch
strategy data; it does not put data outside the standing requirement. Closed by authoring
`weights.rideTime: 0.5` — see § *Phase 6a* and [`DECISIONS.md` § D112](../DECISIONS.md).

**A tenth candidate was assessed and is *not* a tenth instance — the sequential stopping rule.**
Nothing outside a test injects one; every shipped study fixes its budget. Assessed rather than
assumed ([`DECISIONS.md` § D125](../DECISIONS.md)), it resolved into three different things, which
is the transferable part: **the port is exempt** on a *statistical* ground, not a "nobody needed it
yet" one — a rule stops **cells**, so the two arms of a paired comparison would stop at different
`n` and the shorter arm's own realized variance would decide how many pairs survive, which is
selection on the outcome variable. A fixed budget is not a stopgap there; it is required.
`fixedBudgetStoppingRule` beside it **is** dead, and its docstring asserted the shipped role it does
not have — counted as a false claim rather than as a tenth seam, because it is a no-op whose absence
changes nothing, and the judgement is recorded so a later reader can disagree with it. And
`runner.acceptableRange` is an **inert tunable** of § D112's shape.

Two lessons for the guards themselves. **Liveness can be two hops long and die at the second:**
`halfWidthStoppingRule` scans green because `validation/harness.ts` imports it, and `harness.ts` is
genuinely live — but what it builds is `productionStoppingRule`, whose every importer is a test.
`verifyCrnAlignment` is the second instance, live only because the uncalled `assertCrnAligned` calls
it in the same file. *Name the non-test caller* means name one that is **itself** called. The scanner
is deliberately **not** widened into a reachability analysis to catch this — *reachable* was true of
all nine — so the first case is pinned as an assertion instead.

And **`runner/` was audited by neither guard** — `core`'s cannot see `packages/experiments`, and
`tuning/deadCode.test.ts`'s `AUDITED_MODULES` is the three Phase 7 modules. **A third guard now
exists**: `packages/experiments/src/runner/deadCode.test.ts`, 86 exports scanned, 7 allowlisted with
reasons, asserted in both directions, watched failing three ways. The scanner is **one copy** —
extracted to `tuning/callers.test-helper.ts` as `auditModules`, because § D114 records what two
copies of one audit cost and only the package dependency direction ever forced that.

**A weaker instance is recorded rather than hidden, and is not counted among the nine.** Phase 8's
`fuzz/` module has exactly one non-test caller and it is a test: `campaign.ts` is driven by
`corpus.test.ts`. The fuzz track flagged this itself rather than dressing it up, and it is
defensible — a fuzzer's *product* is a test — but it is not the answer `tune` gives `tuning/`, and a
CLI `fuzz` command would close it cleanly and put the deep campaign in a user's hands. Tracked as
**C24** in [`AGENT_STATUS.md`](../AGENT_STATUS.md), and **CLOSED by wave 5**: `elevator-sim fuzz`
gives `campaign.ts` a named non-test caller, verified with the repository's own scanner
([§ D118](../DECISIONS.md)). Three weaker instances of the same shape stand in its place and are
listed in [`docs/07`](07-handoff.md) § 3 — including one, `deepCampaignRequested`, *in the very file
that closed C24*.

**What a phase plan must therefore do:** name an owner for every file a new behaviour must be
*called from*, not merely for the directories it is implemented in. If a phase's work breakdown
does not mention `sim/simulation.ts` and the phase adds a dispatch behaviour, the breakdown is
wrong. Extending the dead-code audit to a new module is a one-line change to `AUDITED_MODULES`,
and any phase that adds a module under `dispatch/` should make it.

**A bit-identical result is a wiring bug until proven otherwise.** An interval of exactly `[0, 0]`
with `rho = 1` over hundreds of replications is not a small effect and no budget will resolve it
(§ Phase 7, the piecewise-constant objective). Two arms that are byte-identical are one dispatcher
under two names. Treat that reading as a defect report, not as a measurement.

---

## Phase 0 — Foundation

Scaffolding and the pieces everything else depends on.

- Monorepo setup, TypeScript config, test runner, lint
- `SimKernel`: discrete-event queue with deterministic tie-breaking by `(time, sequence)`
- `StreamSet`: per-source seeded RNG streams (`arrivals`, `origins`, `destinations`,
  `passengerMass`, `doorObstruction`, `policyNoise`)
- Config loading and validation for `data/*.json`, including `floorRanges` expansion
- Remaining building configs: Secure Tower, Mixed-Use High-Rise, Vertical City

**Acceptance:** kernel processes a scripted event sequence identically across 100 runs.
Two `StreamSet`s constructed from the same seed produce identical draws; consuming from
one stream does not perturb any other.

**Status: green.** The gate is `packages/core/src/kernel/kernel.test.ts` § *"processes a scripted
event sequence identically across 100 runs"* and § *"replays identically from `reset()` on a single
kernel, 100 times"*, plus `packages/core/src/kernel/eventQueue.test.ts` for the `(time, sequence)`
tie-break (invariant 4); `packages/core/src/random/streams.test.ts` §§ *reproducibility* and *stream
independence* for the second clause (invariant 2); and `packages/core/src/config/loader.test.ts`
with `packages/core/src/config/expandFloors.test.ts` for the config bullet.

<!-- This **Status:** line was written on 2026-07-28 so that the phase's verdict is stated in the
     document that carries its criterion, and so that it names the suites that answer it. The
     verdict itself is unchanged and was not decided here: CLAUDE.md's status line, README.md
     § Status and docs/07-handoff.md § 1 have all carried ✅ for this phase, and
     validation/documentation.test.ts already asserts those three agree. What is new is that the
     roadmap says it, with evidence — parsed by validation/phaseStatus.test.ts. -->

---

## Phase 1 — Physics and model

The car as an entity: motion, doors, load.

- S-curve motion profile (jerk-limited), with correct degenerate cases for short hops
  where cruise and constant-acceleration phases collapse
- `Car.positionAt(t)` analytic position for renderer interpolation
- Door state machine: opening, open/dwell, closing, obstruction reopen
- Load sensor: passenger mass distribution, 80% bypass threshold, 110% overload
- `Building`, `Bank`, `Floor`, `Passenger` model objects
- `Car.estimateCost()` — **pure**, no mutation

**Acceptance:** a car traversing 10 floors matches a hand-calculated S-curve travel time
within 1%. A short one-floor hop demonstrably never reaches rated speed. `estimateCost()`
called 10,000 times leaves simulation state bit-identical.

**Status: green.** The gate is `packages/core/src/physics/motion/sCurve.test.ts`, clause by clause:
§ *"roadmap acceptance: 10 floors of Midtown Office within 1% of hand calculation"* for the first,
and § *"a one-floor hop in a 2.5 m/s car peaks well below rated speed"* with § *"rated speed is
reached only once the trip exceeds the threshold distance"* for the second. The purity clause
(invariant 1) is `packages/core/src/model/car/estimateCost.test.ts` § *"leaves the car bit-identical
after 10,000 calls with the doors open and people aboard"* and its mid-flight sibling. The
remaining scope bullets are covered by `packages/core/src/physics/doors/doorMachine.test.ts`,
`packages/core/src/model/car/loadSensor.test.ts` and `packages/core/src/model/car/car.test.ts`.

<!-- Written on 2026-07-28 for the reason given under Phase 0: the verdict is the one the other
     three documents already carry, and what is new is that the roadmap states it and names the
     suites. No verdict was changed. -->

---

## Phase 2 — Traffic and baseline dispatch

First end-to-end simulation.

- Poisson batch arrival generator against `traffic-profiles.json`
- Rise-and-fall demand template with peak-5-minute reporting window
- `DispatchPolicy` interface
- **Weighted-cost scoring engine** driven entirely by config — see
  [Parameterization & Tuning](06-parameterization-and-tuning.md). Nearest-car and
  collective are weight vectors in `dispatcher-profiles.json`, not classes.
- Cost term library: `waitTime`, `distanceTravelled`, `directionReversal`, with
  normalization
- The seven-stage call lifecycle wired as config: registration, eligibility, scoring,
  assignment, reassignment, answering, repositioning
- Metrics recording: AWT, WT95, % > 60 s, TTD, load factor distribution

**Acceptance:** Midtown Office under pure up-peak produces interval and handling capacity
matching the closed-form Barney/CIBSE RTT calculation within a few percent. This is the
project's primary correctness oracle — see
[Traffic & Statistics § Part 2](03-traffic-and-statistics.md#part-2-the-analytical-baseline).
Additionally: nearest-car and collective behavior are reproduced purely by swapping
config, with no dispatcher-specific code paths.

> **Read literally, that criterion is met on NEITHER shipped building — and that is the
> gate's finding, not a gap in it.** Measured over 128 replications at the closed form's own
> design point, with the acceptance suite in
> `packages/core/src/analytical/validation.test.ts`:
>
> | | achieved INT vs `INT` | achieved %POP vs `%POP` | simulated RTT vs `RTT` |
> |---|---|---|---|
> | Midtown Office | **+27.5 %** | **−23.2 %** | +31.6 % |
> | Garden Apartments | **+7.5 %** | **−7.1 %** | +12.6 % |
>
> Every second of both rows is attributable, with no fitted constant anywhere, to
> simplifications `CLOSED_FORM_ASSUMPTIONS` enumerates in advance as `bias: 'under'` — chiefly
> `constant-transit-speed` (a jerk-limited car never reaches rated speed on a one-floor hop) and
> `no-minimum-dwell` (a real controller holds 5 s regardless of how few people transfer).
> Charging those two closes the gap to **0.001 % on Midtown and 0.69 % on Garden**, and pushing
> them *into* the simulator as per-car config collapses its round trip onto the textbook figure.
> So the simulator reproduces the physical system the formula describes, which is what this
> criterion is for; it does not reproduce the formula's own arithmetic, which no faithful
> simulator would.
>
> **Garden's row is new, and it replaced a flattering one.** This document and the acceptance
> suite previously recorded Garden at +1.7 % / −2.0 % and treated it as passing. It was not
> passing, it was *cancelling*: the runner charged every building the office transfer time of
> 1.2 s, including residential Garden, which made its simulated round trip ~7 s short at the
> same time as the closed form's omissions made it ~14 s short of the physical truth. Fixing the
> transfer time (`config/resolveCar.ts`, `config/parse.ts`, and per car in the two mixed-use
> building files) removed the cancellation. **Agreement with the textbook expression got worse
> and agreement with the physical system got better, in the same change and for the same
> reason** — Garden's residual against the physics-corrected model fell from +0.84 % to +0.69 %.
> That is the honest form of this criterion, and it is why the second reading is the one that
> matters. Nothing here was loosened to pass: the suite asserts the residual with a bound just
> above it, in both directions, and asserts that INT and %POP stay mirror images of each other.

**Status: green, with the two divergences above recorded rather than closed.** The gate is
`packages/core/src/analytical/validation.test.ts` (128 replications per case, fixed seeds) plus
`packages/core/src/sim/oracle.test.ts` and `packages/experiments/src/oracle/`, which reconcile the
closed form against the measured round trip term by term. It found two defects, both now fixed and
both of which had biased results *optimistically* — the direction
[CLAUDE.md § Statistical discipline](../CLAUDE.md) singles out:

1. **The departure-clustering threshold was shorter than a door reopen** — 10 s against a reopen
   bound of 19.2 s on Midtown, 20.5 s on Garden, and 19.2–39.8 s across all fourteen shipped banks
   — so one loading counted as two departures and the achieved interval read short:
   **−7.4 % on Midtown Office and −14.6 % on Garden Apartments**, in the flattering direction. The
   threshold is now derived per building from its own door
   timings, `sim/simulation.ts` attaches those timings to every record it writes, and
   `IntervalStatistics.departureGapBasis` reports which way each run got its value. On the two
   mixed-use towers the derivation proves *no* threshold can work — a shuttle holds its doors
   39.8 s while an office-local car beside it completes a whole round trip in 31.3 s — so those
   report `unmeasurable` and **no interval at all**, rather than a constant that lies outside
   every bracket on those buildings.
2. **The passenger transfer time never reached the cars**, so every building ran at the office
   1.2 s. Fixed at the config layer, so `loadConfig` now answers it for every car; the two
   mixed-use towers declare it per bank, because `mixed-use` has no row in the reference table on
   purpose.

---

## Phase 3 — Experiment infrastructure

The part that makes results trustworthy. **Do not skip or defer this.**

- Replication runner, parallel across cores, each replication internally deterministic
- Sequential stopping rule: **Student-t at every `n`**, stop when half-width < acceptable range.
  (This line used to carry the `t` (n ≤ 25) / `z` (n > 25) crossover; that quantile chooser was
  deleted — [`DECISIONS.md` § D14](../DECISIONS.md), and § Sequential stopping rule in
  [`docs/03`](03-traffic-and-statistics.md).) **The port ships; no shipped study injects a rule** —
  every one fixes its budget, because a rule stops *cells* and a paired comparison's two arms would
  stop at different `n`. Exempted with that reason recorded in
  [`DECISIONS.md` § D125](../DECISIONS.md); none of the four acceptance criteria below depends on it
- Common random numbers: same passenger traces fed to every alternative under comparison
- Paired-t confidence intervals on differences
- Saturation detection (positive trend in queue length) → flag and suppress AWT CI
- Per-run record persistence with seed attached; re-analysis without re-simulation

**Acceptance:**

1. **A dispatcher against itself.** Two criteria, because "a paired-t interval containing
   zero" is the weaker one — on a single seed pair it is a ~5%-flaky assertion by
   construction at 95% confidence, and asserting it would be an untrue statement about the
   method:
   - **Same traces, same config → paired differences are *exactly* zero.** Bit-identical on
     **all 23** replication metrics (nineteen when this was written; `f895a16` added `energyKJ`,
     `carDistanceM`, `carStarts` and `energyPerServedLegKJ`, and the check is over
     `REPLICATION_METRICS`, so it covers them without editing), `rho = 1`, interval `[0, 0]`. This is the real determinism check. An
     interval merely *containing* zero would also happily contain a leaked `Date.now()`, a
     `Map` iteration order, or a dispatcher drawing from a shared stream.
   - **Across 40 disjoint seed pairs, the interval contains zero at the nominal rate.**
     Measured **38/40** — a 5.0% rejection rate against a nominal 5%. Coverage is the correct
     way to assert calibration, and it is a claim no single seed pair can make.
2. **A deliberately crippled variant yields an interval excluding zero** — with the variant
   expressed as config, never code (invariant 7). A variant that serves nobody must make the
   apparatus **refuse** an interval rather than average a `NaN`.
3. **CRN measurably reduces the variance of the difference** versus independent runs on the
   same comparison.
4. **Any stored run replays to identical results from its seed** — reloaded from disk and
   re-executed, not merely re-read.

**Status: green.** The gate lives in `packages/experiments/src/validation/`, one suite per
criterion, measured against the real `data/` directory rather than a fixture. It also recorded
findings that change what later phases should expect — the CRN regime table, the resolution
limit, and the piecewise-constant objective surface — all written up under *measured* headings
in [Traffic & Statistics](03-traffic-and-statistics.md). Two are flagged inline at Phases 5 and
7 below.

> **Note on the operating point.** The gate measures Midtown Office up-peak at **1% of
> population per 5 minutes**, not the 11–15% office design target. Because a cell's AWT
> interval is suppressed if *any* replication saturated, 1% is the highest rate at which both
> `eta` and `nearest-car` return 0/100 saturated and the criteria can be argued from
> quotable statistics. Absolute waits below are therefore lightly loaded; the ratios and the
> method transfer, the absolutes must be re-measured.

---

## Phase 4 — Visualization

- Web viewer consuming `core` with no reverse dependency
- Renderer samples `Car.positionAt(t)` at display framerate between kernel events
- Building editor: floors, banks, cars, zones
- Live metrics overlay; run playback from a stored seed

**Acceptance:** a stored run replays visually identically, **and the first frame places every car
where the run says it started.** Rendering is fully decoupled — `core` builds and tests with `viz`
absent.

> **The second clause was added after the first was satisfied by a wrong picture.** The Phase 4
> recorder placed every car at its *final* position until its first move — wrong on 4 of the 5
> shipped buildings — and that recording replayed identically on every seed, because a wrong picture
> replays as faithfully as a right one. A replay-identity criterion cannot see a systematic error
> that is present in both replays. Raising the criterion is the response
> [`CLAUDE.md`](../CLAUDE.md) § Working agreements requires; weakening it was never available.
> Raised by T8, recorded as **C16** in `AGENT_STATUS.md`. *(The count is reported, not
> re-measurable: `AGENT_STATUS.md`'s own C16 line says "3 of 4" where the closing report says 4 of 5,
> and the defective recorder no longer exists to re-run. The clause holds either way, and it is now
> asserted on **all five** buildings by `describe.each(BUILDING_IDS)`.)*

**Status: COMPLETE (2026-07-28).** All four scope bullets are built and both acceptance clauses
pass. `packages/viz` carries a rendering contract (`contract/`, `VIZ_SCHEMA_VERSION = 4`), a
deterministic frame producer (`frame/`, including `frame/overlay.ts`), a replay harness with a
per-field negative control (`replay/`), a playback clock (`playback/`), a Canvas renderer
(`render/`), the editor's four pure modules (`editorEdits.ts`, `editorValidate.ts`,
`editorHistory.ts`, `editorPreview.ts`) and two dev entry points (`dev/main.ts`, `dev/editor.ts`).

| bullet | state |
|---|---|
| Web viewer consuming `core` with no reverse dependency | ✅ built — `packages/viz/src/boundaries.test.ts` asserts the direction, with positive controls (§ D66) |
| Renderer samples `Car.positionAt(t)` between kernel events | ✅ built — `frame/frameAt.ts`, driven by `playback/clock.ts` |
| Building editor: floors, banks, cars, zones | ✅ built — four pure modules plus `dev/editor.ts`; the editor never computes its own legality verdict, it reports `parseBuilding` / `resolveBuilding` ([`DECISIONS.md` § D67](../DECISIONS.md)) |
| Live metrics overlay; run playback from a stored seed | ✅ built — the overlay suppresses estimates and keeps observations ([§ D64](../DECISIONS.md)); playback from a stored seed has a per-field negative control |

**Evidence for each acceptance clause.** Clause 1 (replay identity) is exercised by
`packages/viz/src/replay/replay.test.ts` — round trip from the stored seed, a seed-altered negative
control, and a coarse-sample-rate control. Clause 2 (the raised one) is asserted on **all five**
buildings by `packages/viz/src/record/recordRun.test.ts` § *"gives every shaft the start the run
itself reports, not the position it ended at"*, under `describe.each(BUILDING_IDS)`.

**The UX cycle ran, and its ledger is published rather than summarised.**
`packages/viz/UX.md` § 7.0 carries **88** scenarios with differentiated states, not a blanket tick:
**86 ✅** (32 wave 1, 37 driven in a browser against the shipped `data/`, 4 driven *and* asserted,
13 asserted by a test whose assertion was proved to bite), 1 ✅+⚠️ with one clause each way
(`ED-23`), **0 ⚠️ unverified**, 0 🔲 re-marked, and 1 🔲 not built (`PB-09`). The ids are reproduced
in [`TEST_MATRIX.md`](../TEST_MATRIX.md) § 3.

> **The count moved from 87 to 88 because `T29` added a row, and two of the existing rows were
> found to be *false* rather than merely unverified.** `UX.md` § A.3's **Success** and **Saturated**
> rows both carried a "must not show" clause about the running mean, and `render/canvas.ts` drew
> `mean wait so far 87.7 s` one line below the banner saying the mean was suppressed — on the same
> `<canvas role="img">` whose `aria-label` said it did not exist, and which `Export PNG` bakes into
> a shareable file. Fixed and re-marked with the evidence, on both suppression grounds
> ([§ D111](../DECISIONS.md)).
>
> **Wave 5 drove the last four ⚠️ rows, and two of *those* were false as well**
> ([§ D120](../DECISIONS.md)). `RV-21`'s **Retry was permanently dead after any failed load** — a
> temporal-dead-zone `ReferenceError` thrown inside a floating `async` IIFE with no `catch`, so the
> page cleared its own error message and sat at `loading data…` for ever with nothing in the
> console. `RV-17` named no path, because Vite answers `Accept: */*` with `index.html` and a **200**
> and `!response.ok` is exactly the branch a missing file does not take. A fifth row (§ B.3) was
> false on both clauses. All seven ⛔ non-negotiable keyboard rows, `KB-14` included, are now ✅ —
> and `KB-14`'s row records what could *not* be exercised: the CSS clause under a real OS
> preference, the media query being un-emulable by the available tooling.
>
> **That is three consecutive passes in which driving the app found a shipped defect that reading it
> had missed** — and § D111's own pass had driven three buildings at one viewport without
> re-exercising these four.

> **Two things this phase found by running the UI rather than reading it**, recorded because the
> reading pass had already passed: four defects in [`DECISIONS.md` § D69](../DECISIONS.md), and
> three more that only a mutation harness found (§ D70) — 7 of 8 `frameCar` fields could be replaced
> with constants while the suite stayed green.

> **One qualification on the decoupling clause, and it is a documentation coupling rather than an
> import.** `packages/viz/src/boundaries.test.ts` asserts the dependency direction, and `core`
> imports nothing from `viz` — invariant 6 holds. But `core/src/sim/moduleTree.test.ts` compares
> `docs/01`'s module tree against the directories under `packages/*/src` **in both directions**, and
> the tree names `viz/*`. So deleting `packages/viz` from disk turns those rows into phantoms and
> reddens the **core** suite, which is what a reviewer checking the clause's strong form actually
> hits. The guard should scope its directory set to packages that exist. Tracked as **C28**;
> `moduleTree.test.ts` is a `packages/core` file and was another task's this round.

---

## Phase 5 — Smart dispatch

The actual point of the project.

- Remaining cost terms: `detourPenalty`, `existingCallDelay`, `loadFactor`, `stopCount`,
  `starvation`, `zoneAffinity`, `predictedDemand`, `crowding`
- ETA, zoned, energy-aware, and fairness-first strategies — all **weight vectors**, no new
  classes
- `AuctionDispatcher` — contract-net bidding among cars, so the agent-autonomy hypothesis
  gets benchmarked rather than assumed. Uses the same term library; only the aggregation
  differs.
- Predictive pre-positioning: learned arrival model per floor per time-of-day
- Capacity-aware reassignment when a car crosses the bypass threshold
- Parallel service: dispatcher splits demand at heavy floors across multiple cars

**Acceptance:** each dispatcher beats `NearestCarDispatcher` with a paired-t interval
excluding zero on at least one building. Pre-positioning shows measurable AWT improvement
on Garden Apartments, where parking policy dominates.

> **Know the resolution limit before starting — Phase 3 measured it.** Against a structurally
> different baseline the paired half-width at n = 100 is **1.33 s** on Midtown up-peak, so this
> criterion needs roughly a **12% AWT improvement** to be provable at that budget, not a 1%
> one. Two consequences:
>
> - **CRN buys only ~1.8× here**, not the 5–20× that holds between near-neighbours, because
>   `nearest-car` is far more variable than `eta`. Budget replications as if the runs were
>   nearly independent.
> - **A dispatcher whose gain lands under the half-width has not failed** — it is below the
>   apparatus's resolution at that budget. Report it as **indistinguishable** and either raise
>   `n` (the detectable effect falls as `1/sqrt(n)`) or say so plainly. Do **not** weaken the
>   interval, and do not report the point estimate as a win.
>
> See [Traffic & Statistics § the resolution limit](03-traffic-and-statistics.md#measured-the-resolution-limit-is-two-numbers-not-one).

**Status: green. Both criteria are MET as the roadmap words them — but the second is met by
`zone-center`, not by the learned arrival model this phase's own scope bullet names.** The gate lives
in `packages/experiments/src/benchmark/`, whose `index.ts` is the written report.

> **Which entry point regenerates which number.** This section previously said *"every number below
> is regenerated by `formatBenchmark(await runBenchmark())`"*. That is false and was
> [review finding #17](08-review-findings.md): `runBenchmark` is a loop over `BENCHMARK_CASES`
> calling `runBenchmarkCase`, and `formatBenchmark` is `results.map(formatCase)` plus
> `formatCriterionVerdict`. It calls none of the studies below. The actual mapping:
>
> | numbers | entry point |
> |---|---|
> | the § 1 comparison tables and the first criterion's verdict | `formatBenchmark(await runBenchmark())` |
> | the pre-positioning table (`zone-center`, `lobby`, `predicted-demand`) | `runPrepositioningStudy()` |
> | the tail terms and the saturation census | `runTailStudy()` |
> | the capacity-reassignment sweep | `runCapacityReassignmentStudy()` |
> | the predictor-lag study | `measurePredictorLag()` |
> | the forecast-causality audit | `auditForecastCausalityInRun()` |
> | the auction-aggregation reachability table | `measureAuctionAggregation()` |
> | the deadband and rate sweeps below | **no entry point ships** — driven through `runBenchmarkCase` by hand, so they are recorded rather than reproducible in one call |
>
> `packages/experiments/src/benchmark/published.test.ts` now partitions every interval-shaped
> literal in `benchmark/` into *reproduced by a pinned estimate at its own printed precision* or
> *declared unpinned with a count*, asserting the two multisets are equal in both directions — so a
> number cannot appear without a study behind it, and a study's number cannot change in silence.

| criterion | verdict |
|---|---|
| each dispatcher beats `nearest-car` with a paired-t interval excluding zero on at least one building | **MET** — 9 of 9 arms. One arm is also WORSE somewhere and is named below |
| pre-positioning shows measurable AWT improvement on Garden Apartments | **MET as written** — `zone-center` vs `stay` is **−4.88 s [−5.27, −4.49]** (−29.7 %) at n = 500 under CRN. **The *predictive* strategy does NOT clear it at the settings the library ships:** `predicted-demand` vs `stay` is **−0.006 s [−0.021, +0.010]**, a measured near-zero rather than an unresolved one. It reaches −0.98 s [−1.28, −0.68] only after `idle.repositionThresholdS` is retuned from 8 s to 3 s, and the profile is left as authored |

> **The `predicted-demand` row was wrong here, and the way it was wrong is worth keeping.**
> It read `−0.006 [−0.031, +0.019]` — the correct bound for the **n = 300** deadband
> sweep, pasted into a row whose own prose says n = 500. At n = 500 the same comparison is
> `−0.006 [−0.021, +0.010]` (mean −0.005801020408, SE 0.007965417897), a half-width 1.6× narrower.
> The *mean* matched, every other row in the same study reproduced to the digit, and no test read
> either bound — which is exactly why it survived. [Review finding #4](08-review-findings.md); root
> cause and the n = 500 re-measurement are T9's, and `benchmark/published.test.ts` now fails if the
> n = 300 literal reappears in an n = 500 position.

The second criterion previously read *NOT MET — 500 of 500 paired differences precisely `0`*, and
that zero was never statistical. Four Phase 5 behaviours were built correctly and connected to
nothing: `Simulation.#park` supplied no forecast, `#dispatchBank` no operational partition,
`simulation.ts` had no `reconsider` call site at all, and `SimulationConfig` no way to select an
aggregation. All four are wired, and `packages/core/src/sim/seam.test.ts` is the guard that fails
if any of them becomes unreachable again — behaviourally, by requiring two configurations the docs
say must differ to produce different car trajectories, because a symbol search would have caught
none of the four.

Seven measurements the headline hides, all of them results rather than opinions:

- **Only one pair of arms is bit-identical now, and it is the correct one.** Measured over the
  re-run matrix: `eta ≡ fairness-first` on Midtown Office and Secure Tower, and **no identical pair at
  all on Garden Apartments**. Three used to be (`rho = 1`, interval `[0, 0]`,
  every metric, every replication): `zoned-uppeak` everywhere and `fairness-first` on both up-peak
  buildings, because `zoneAffinity` and `predictedDemand` evaluated to `0` for every car in every
  real run. Counted through the shipped engine on Midtown Office, `zoneAffinity` went from **0
  non-zero evaluations in 437 to 372 in 495** and `predictedDemand` from **0 in 7 057 to 7 435 in
  7 435**. `fairness-first ≡ eta` survives on the up-peak cases and is correct: `starvation` is
  zero for every candidate when no car holds a committed hall call the new one would delay, which
  is what an up-peak lobby looks like.
- **`zoned-uppeak` is now the best arm on two buildings and the worst on the third**, and the cause
  decomposes. It beats the baseline by **−35.9 % AWT on Midtown** and **−38.9 % on Garden** — the
  largest margins in the study — and is **+8.9 % WORSE on Secure Tower**, on all four metrics.
  Holding everything else and setting `weights.zoneAffinity` to 0 (seed 20 260 726, 60
  replications, Secure Tower up-peak 2 %) runs the same profile at **14.29 s against `eta`'s
  15.37** — better than the field, where the authored weight runs it at 23.78. So the
  regression is the *cost term*, not the parking strategy: a static contiguous partition prices a
  car for being outside a band on a building whose **access** zoning already partitions the
  population differently, and the two disagree. The weight is left at the hand-authored `0.3`
  rather than tuned down to make a gate pass; it is a dimension Phase 7 can now actually search.
- **Predictive pre-positioning is connected, fires on every decision, and is still worth nothing
  measurable at the settings it ships with.** Instrumented through `SimulationConfig.createPolicy` on
  the criterion's own operating point (30 replications): the runner supplies a `demandForecast` on
  **35.40 of 35.40** reposition decisions per run and the predictor is fed 14.43 arrivals per run, so
  the mechanism is live — and the decision comes back `below-threshold` **26.87** times per run and
  `reposition` **0.00** times. The binding constraint is `predictive-balanced`'s own
  `idle.repositionThresholdS: 8`, taken from docs/06's worked example: it is *seconds of expected
  response saved per future call*, and six floors of jerk-limited travel cannot produce eight of them
  from any park. Swept at n = 300 against `stay`'s 16.31 s — `8` → `−0.006 [−0.031, +0.019]`,
  `6` → −0.021, `5` → **−0.217**, `4` → **−0.430**, `3` → **−0.792**, `2` → **−1.110**, `1` → −0.881,
  `0` → −0.623: an interior optimum at 2 s, with the curve turning back up below it as the car churns.
  **It is not a sparsity problem**, which was the obvious hypothesis and is refuted rather than
  confirmed: at the authored deadband the arm is inert at 2, 4, 8 and 16 % of population per 5 minutes
  (300/300 bit-identical at 4 %), so eight times the demand does not reach the threshold either. And
  the whole predictor apparatus, priced directly — the same profile with a forecast against
  `createPredictor: () => undefined` — is **−0.007 s [−0.032, +0.018]**, 296 of 300 replications
  bit-identical. The profile is left as authored; `idle.repositionThresholdS` is the dimension Phase 7
  should search first on this building.
- **Capacity-driven reassignment is reachable and fires on 0 % of load crossings at every load where
  an AWT interval may be quoted.** New in `packages/experiments/src/benchmark/capacityReassignment.ts`.
  On Midtown Office up-peak, `capacity-aware` against itself at `reassignmentPolicy: never`, n = 60
  per cell: crossings per run climb 0.00 → 0.55 → 2.77 → 6.07 → 19.27 → 40.98 across 1/2/3/4/8/16 %
  and `capacityHeld` shows the monitor examining 5 to 34 calls per run — so the sweep runs — while
  **migrations stay at exactly 0.00 per run through 4 %**, the last quotable load. The first migration
  appears at 8 %, where 56 of 60 replications have a diverging queue and no mean may be quoted.
  **Switching the policy at 3 % is not a resolved effect at this budget:** the paired difference is
  −0.520 s [−1.039, +0.000] at n = 60, which **contains zero — INDISTINGUISHABLE**. The point
  estimate is *reassignment as a whole*, and it decomposes to `split-demand` widening an
  already-assigned landing 0.367 times per run and a car-to-car swap 0.017 times per run — none of
  it the capacity trigger. The sign is stable and the magnitude is plausible; what n = 60 does not
  buy is the right to call it a win. `core/src/sim/seam.test.ts`
  asserts `capacityMigrations > 0` at the traffic profile's default demand and is right to as a wiring
  guard, but at that point AWT is 788 s and 60 of 60 replications diverge; it is proof of connection,
  not evidence the mechanism pays.
- **The predictor does not read the future, measured on the wired path and not only on the model.**
  `measurePredictorLag` shifts demand from floor 2 to floor 6 at 1800 s and finds 0 of 30 anticipatory
  samples, first movement at 2100 s (+300 s, exactly one bucket) and an argmax flip at 2400 s
  (+600 s). `auditForecastCausalityInRun` closes the half that study cannot reach — which arrivals the
  *run loop* hands the model — over 100 real replications of Midtown Office under mixed traffic:
  **0 of 34 422** forecast queries ran backwards, `corr(forecast, preceding 300 s)` is 0.614 against
  `corr(forecast, following 300 s)` 0.324, and the partial correlation with the future **given every
  arrival the run had already produced** is **−0.0139 [−0.0317, +0.0038]** — zero, over replications
  rather than over queries. A forecast that leaked the trace would keep predictive power there.
- **`nearest-car` is too weak a baseline to separate anything.** Unchanged: it loses by 27–30 % on
  the up-peak buildings and is the only profile that saturates inside the measured budget, capping
  Midtown Office at **n = 287**. `zoned-uppeak` is now the only other arm that ever loses its AWT in
  1 000 replications, at index 683 on Secure Tower — above the 150 that case is measured at. The
  tail terms only earn their weights one load step *above* where the baseline stops being quotable:
  at 2 % with two entrances contending, `fairness-first` − `eta` is **−0.26 s AWT [−0.45, −0.08]**,
  **−1.65 s WT95** and **−2.05 s WT99**.

  > **These three figures were stale, and the reason is this section's own defect resurfacing a
  > phase later.** They read `−0.23 [−0.41, −0.05]` / `−1.58` / `−1.94` until 2026-07-27. T9
  > extracted the commit that introduced `tailStudy.ts` (`a1ec6ad`), built it, and re-ran the study:
  > **the old tree reproduces the published text character-for-character**, and the current tree does
  > not. The figures were measured *before* `c237d95` wired stage 5 (capacity reassignment) and
  > stage 7 (pre-positioning) into `sim/simulation.ts`, and were never regenerated afterwards. The
  > mechanism is clean at replication resolution: `eta` declares no `reassignmentPolicy`, so the
  > wiring moved the treatment arms and left the reference untouched — `eta`'s mean is bit-identical
  > at every load, `fairness-first` changed on 10 of 250 replications and `capacity-aware` on 5, and
  > in both arms *changed ⊂ migrated*. `zoned-uppeak` moved on all 250 through a different mechanism
  > (stage 7 `zone-center` parking, wired by the same commit), which is why only its column of the
  > saturation census moved. **No verdict flips anywhere.** So the four dead seams this section
  > reports fixing had a second cost nobody billed: every number measured while they were dead became
  > wrong the moment they were wired, and nothing in the suite re-derived a published interval, so no
  > test could notice. That is the argument for `published.test.ts` above.

Two things the wiring also made authorable as **data** rather than as an options object:

- **The aggregation.** `config/schema.ts` carries an `auction` section — `aggregation`, `rounds`,
  `reserveMarginalDelayS` — and `dispatch/policies/registry.ts` is a frozen table from
  `auction.aggregation` to a policy factory, so *which dispatcher runs* is config and not a branch
  (CLAUDE.md invariant 7). `data/dispatcher-profiles.json` ships `auction` (sealed bid, one round,
  provably the centralized argmin) and `auction-multi-round` (three rounds, a 25 s reserve) that
  differ in that section and in nothing else, so a paired-t interval between them is an interval on
  the aggregation. Multi-round now has a wait-time result rather than only a divergence rate.
- **The predictor's six tunables.** `idleStageSchema` carried two of `PREDICTOR_PARAMETERS`' six,
  so an optimizer could search all six and persist only two. It carries all six, and
  `predictorLearningRate` is `gt(0)` rather than `min(0)` so a value the model refuses can no
  longer load clean and throw at construction.

One thing is deliberately **not** closed, and it is a property of transfers rather than of the
wiring: on a building with sky lobbies the predictor's observation stream differs between arms,
because a continuation leg begins waiting when the first leg's car put it down. Buildings that
declare **no** transfer floor — Midtown Office and Garden Apartments — feed every arm a
byte-identical observation sequence, so a predictive arm is CRN-paired against a non-predictive one
on equal terms exactly where the pre-positioning criterion lives. On every building that declares
one, a paired difference is a difference in dispatch **plus** whatever the divergent observation
stream did to the forecast, and must be read that way.

**Both halves are asserted, and the list is derived rather than written down.**
`packages/core/src/sim/seam.test.ts` partitions `BUILDING_IDS` on
`building.transferFloors.length === 0` and requires identity on one side and divergence on the
other, so a building that grows or loses a sky lobby cannot leave a stale name behind here. That
guard was added because this paragraph, `Simulation.#buildPredictors`' docstring and the seam test's
own comment all named **Secure Tower** as a third single-leg building and all three were wrong:
`data/buildings/secure-tower.json` flags its screened lobby `G` as `isTransferFloor`. Measured at
seed 20 260 726 with the shipped profiles, 3 of its 396 journeys are multi-leg,
`conservation.transfers` is 0 under `nearest-car` and 3 under both `eta` and `predictive-balanced`,
and the observation logs diverge at character 9 460 (10 200 characters against 10 122). It is a
small effect and it is still dispatcher-dependent, so **`secure-up-peak` carries the caveat** — which
matters, because that case holds the study's only WORSE verdict (`zoned-uppeak`, +8.9 %).

### Independent verification of the wiring, re-measured rather than re-read

A separate pass re-derived the liveness claims above from runs rather than from the code, because
"the module imports it" is the check that failed four times. `tsc -b` is silent and the suite is
**93 files / 2 058 tests, 0 failures**. Measured on `midtown-office` at seed 20 260 726, one
replication per cell, through `Simulation` with the counting hooks — every figure reproduced the
one already recorded on the `core` barrel exactly:

| seam | measurement |
|---|---|
| predictor observes | 660 arrivals on Midtown, 29 on Garden — equal to `stageActivity.predictorObservations` |
| predictor is read | `expectedDemandByFloor` called 1 149 times on Midtown, 73 on Garden, over 10 and 5 distinct forecast vectors |
| forecast reaches stage 7 | **60 of 60** reposition decisions on Garden carry a `demandForecast`, 49 of 49 on Midtown; with `createPredictor: () => undefined` all 60 come back `no-forecast` |
| forecast changes parking | at the authored 8 s deadband, 0 moves and Garden is byte-identical to no-predictor. At a 2 s deadband, **6 moves against 0**, and the trajectories diverge |
| capacity trigger | `capacity-aware` 44 crossings / **9 migrations** / 49 held; `eta` 44 crossings / **0** migrations. Garden records 0 crossings at all |
| multi-round auction | `auction-multi-round` resolves `rounds: 3` from `data/`, holds **922 of 2 398** auctions past round 1 (histogram 1:1 476, 2:916, 3:6), diverges from the argmin **194** times, 1 173 withdrawals, 5 waived. `auction` resolves `rounds: 1` and holds 2 038 auctions, **0** past round 1, **0** divergences |
| `zoneAffinity` | shipped `zoned-uppeak`: 472 evaluations, 355 non-zero, cross-car spread in 142 decisions |
| `predictedDemand` | shipped `predictive-balanced`: 7 435 evaluations, 7 435 non-zero, spread in 1 066 decisions |
| `rideTime` | **0 evaluations under every shipped profile, and that is correct** — all of them are `up-down-buttons`, and `rideTimeTerm.activeWhen` declares the term inert without a destination. Under `destination-entry` it is 468/468 non-zero with spread in 57 decisions |

Two claims in the tree were **overstated and are now corrected**, neither by changing a
measurement: the `core` barrel's wiring table linked `prepositionPlan` as the symbol `#park`
reaches, when `#park` is per-car and calls its two halves instead — the table now says so and the
audit's allowlist records it; and a benchmark test was titled *"finds no arm bit-identical to eta
any more"* while its own body asserts that `fairness-first ≡ eta` survives on both up-peak cases.
The assertions were right and the title was wrong.

The audit itself found **no dead symbol**: all 72 exports of `dispatch/policies/` and
`dispatch/predictor/` either have a real importer or are one of the **14** recorded as deliberate
public API — the four stage-5 result accessors and `parkingFloorIds`, `fixedForecast`, the
compile-time assertion `profileAsPolicySource`, `prepositionPlan`, and the six parameter-schema
introspection functions whose consumer is the Phase 7 optimizer (invariant 8).

---

## Phase 6 — Destination dispatch and learned control

**This phase was split into three by [`DECISIONS.md` § D28](../DECISIONS.md)**, because "Phase 6"
was two unrelated bodies of work plus a third that shares no interface with either. The full
interface contract is [`09-destination-dispatch-contract.md`](09-destination-dispatch-contract.md).

- **6a — destination *disclosure***: `dispatch.callType: destination-entry` / `mobile-credential`,
  profiles in `data/`, and the studies. No `core` change.
- **6b — destination *dispatch***: per-passenger car assignment — the passenger-model change.
  Strictly serial on `sim/simulation.ts`.
- **6c — learned control**: `LearnedDispatcher`, an RL policy. **Deferred out of the phase.**

### The acceptance criterion, as it now stands

It was **raised** on 2026-07-27 by [`DECISIONS.md` § D27](../DECISIONS.md). It used to read *"a
learned dispatcher beats the naive baselines on AWT and WT95 on the Mixed-Use High-Rise, with
paired-t intervals excluding zero."*

**Acceptance:** beat the baseline on **TTD** with a paired-t interval excluding zero, **and** report
AWT and WT95 with explicit BETTER / WORSE / INDISTINGUISHABLE / IDENTICAL verdicts. A WORSE verdict
on AWT does not fail the phase; **omitting it does.**

> **Why this is a raise and not a swap.** T14 measured that AWT and WT95 are two of the **nine**
> metrics `core`'s own `comparabilityOf('destination-dispatch')` says stop being comparable across
> the two passenger models, and that they are the two whose *sign flips*: at Midtown interfloor-mix,
> n = 40 under CRN, ΔAWT is `+0.355 ± 0.337` (worse) while ΔTTD is `−1.821 ± 0.738` (better), both
> excluding zero, from the same runs. The criterion as written would have rejected a genuine
> improvement. Replacing AWT/WT95 with TTD was the comfortable move and would have been a
> **weakening** — it drops the metrics on which destination dispatch looks worst, and
> [`docs/07-handoff.md`](07-handoff.md) says that cost "is a documented cost of the approach and this
> simulator can quantify it". Gating on TTD *and* keeping both losing metrics in public is strictly
> stronger than the original.

> **✅ One clause of the original that the raise did not carry — recorded, then closed by
> measurement.** The old criterion named a building: *"on the Mixed-Use High-Rise"*. § D27's
> replacement did not, and for a time **no Phase 6 result was measured on `mixed-use-high-rise`**.
> The operating points were Midtown Office and Secure Tower interfloor-mix, for good reasons —
> Secure Tower is the only access-zoned building, Midtown the unzoned control the
> difference-of-differences needs — and the substitution was never argued. Dropping a *named
> building* from a criterion is the shape of a weakening;
> [`DECISIONS.md` § D99](../DECISIONS.md) owned that, chose *measure it there* over *argue the
> substitution*, and § D100 is the result. **It is measured, and the building clause is back.** See
> § *Phase 6 on the building the criterion names* below.

### Phase 6 on the building the criterion names — `mixed-use-high-rise`

Measured by `benchmark/mixedUseHighRise.ts`; asserted by `mixedUseHighRise.test.ts` and
`saturationCensus.test.ts`; held by 72 pins in `benchmark/published.ts` (**0 moved, 0 removed**).
The verdict has three parts and all three are load-bearing.

**1. The building's own scenario admits no paired comparison — measured, not asserted.** Under the
mixed 40/30/30 traffic the building's `$comment` describes, every profile in
`data/dispatcher-profiles.json` carrying `role: "baseline"` fails outright, n = 30 per cell:

| mixed 40/30/30, 1800 s | conventional (all three baselines) | credential-aware |
|---|---|---|
| 1.5 %pop/5 min | 0/30 quotable, 39.2 undelivered/run, **24.4 % unserved** | 30/30 quotable, 0 undelivered |
| 0.75 % | 0/30 quotable, 22.7 undelivered, **31.7 % unserved** | 30/30, 0 undelivered |
| 0.2 % | 0/30 quotable, 6.4 undelivered, **36.6 % unserved** | 30/30, 0 undelivered |

**The unserved fraction rises as the load falls**, which is the signature of a *structural* refusal
and not of overload: an access-restricted pickup carries no credential under `up-down-buttons`,
every car answers `accessDenied`, and lowering the rate strips out only the share that *can* be
served. It is § H-ACCESS-1's mechanism reproduced on a second building. No baseline has a quotable
mean there, so no paired-t interval exists — reported as counts, never as an interval.

**The candidate reason already on record was checked and does not bite.** § D99 flagged that this
building reports its achieved *interval* `unmeasurable` by design — a shuttle holds doors 39.8 s
while an office-local car completes a round trip in 31.3 s, so no departure-gap threshold is valid.
That constrains the **oracle**, which reconstructs departures from boarding times. The Phase 6 gate
is **TTD**, read off passenger records, needing no departure bracket — and the study does produce
TTD intervals here. The obstacle is the access geometry, not the bracket.

**2. Incoming-only up-peak is the one comparable regime, and it is not blind.** `G` is the only
entrance outside both access zones, so it is the only origin at which a conventional baseline can
be measured on this building at all. It is also where a destination carries the most information: a
passenger at `G` may be bound for retail (2–5), an office floor (6–30), the sky lobby (31) or a
residence (32–60) **via a transfer at 31** — three banks and a two-leg journey behind one up button.

**3. The gate, ΔTTD at up-peak 4 %, n = 200, arm − baseline.** Baselines are resolved from `data/`
by `role: "baseline"` rather than named in code (invariant 7): `nearest-car`, `eta`, `collective`.

| | vs `nearest-car` | vs `eta` | vs `collective` |
|---|---|---|---|
| **Level 0** — `destination-eta` + `weights.rideTime: 1` | **−21.239 [−22.793, −19.685] BETTER** | **−2.072 [−2.868, −1.277] BETTER** | **−2.116 [−2.908, −1.325] BETTER** |
| Level 1 — `destination-panel` | −18.633 [−20.702, −16.563] BETTER | +0.534 [−0.855, +1.923] INDIST. | +0.490 [−0.902, +1.882] INDIST. |

The costs, published beside the gate because § D27 says omitting them fails the phase:

| | ΔAWT vs `eta` | ΔWT95 vs `eta` | Δride vs `eta` |
|---|---|---|---|
| **Level 0** | **+0.876 [+0.703, +1.050] WORSE** | +0.273 [−0.026, +0.571] INDIST. | −2.452 [−3.068, −1.835] BETTER |
| Level 1 | **+3.190 [+2.463, +3.916] WORSE** | **+9.083 [+5.683, +12.484] WORSE** | −3.126 [−3.785, −2.466] BETTER |

**The criterion is MET by the Level-0 arm, and NOT met by the Level-1 panel at any measured
point.** Both halves are the result; neither is a footnote on the other. Level 1's gate interval
contains zero against `eta` and `collective` at every rate, and at 4 % it is 9.083 s WORSE on WT95 —
the § D29 write-once promise binding under load, the same mechanism § Phase 6b measures on Midtown
at 4.5 %. Level 1 buys in-car time and pays for it at the landing.

**It is not met at 1 % or 2 % either, and the required `n` says why rather than the verdict.** At
2 % the Level-0 gate against `eta` is `−0.109 [−0.616, +0.399]` INDISTINGUISHABLE, needing
**n ≈ 5161 against a measured ceiling of 395** — *permanently* unresolvable at that operating point
in the sense [`docs/07-handoff.md`](07-handoff.md) § 4 means it, not a budget that was too small.
**3 % is excluded by its ceiling and not by its answer** — its effect is *larger* than 2 %'s, and
`nearest-car` loses its AWT on replication 22 there, so no budget in the 50–200 band can be spent at
that rate with the naive baseline in the cell. `saturationCensus.test.ts` asserts that distinction,
because the two are indistinguishable in a results table.

**Budgets derived from this building, never copied.** Ceilings censused at 1000 replications per
arm — 1 % none, 2 % `nearest-car`@395, 3 % `nearest-car`@22, 4 % `destination-panel`@206. n = 238 at
2 % is variance-derived from a pilot at a **disjoint** seed; n = 200 at 4 % is **ceiling-bound** (the
variance-derived requirement is 666, the ceiling is 206, so 200 leaves **six replications of
margin** — a tight margin, recorded as such in [`docs/07`](07-handoff.md) § 8); 1 % is a
**declared-in-advance blind control**, 390/1000 bit-identical.

**The call type alone is worth exactly zero here, and the study separates it out.** The
**`destination-eta-unpriced`** arm — destination disclosed and authorized, nothing pricing it — is
**bit-identical** to `eta` on all three up-peak points: 150/150, 238/238 and 200/200 paired
differences of exactly zero. Every pickup is at `G`, which is in no access zone. The whole of the
−2.072 s is the *weight*. That is the same decomposition Phase 6a made on Midtown, reproduced on the
building the criterion names.

> **That control used to be the shipped profile, and moving it is the reason the number survived.**
> Until [§ D112](../DECISIONS.md), `mixedUseHighRise.ts` bound `DECOMPOSITION_ARM` to the shipped
> `destination-eta` id, which was correct only while the shipped profile *happened* to weight
> `rideTime` at zero. Now it weights it at 0.5, and the arm is bound to the **configuration**
> (`destination-eta-unpriced`: `weights.rideTime: 0`, everything else inherited) rather than to the
> id. The measurement is unchanged and only the name moved. Left pointed at the id, this paragraph's
> claim — *the call type alone is worth zero* — would have been falsified by a pin regeneration and
> nothing else.

### Phase 6a — destination disclosure. **ACCEPTED (2026-07-27); building clause met 2026-07-28.**

**Its arm is the one that clears the gate on `mixed-use-high-rise`** — Level 0 beats all three
baseline-role profiles on TTD there with intervals excluding zero, and its AWT and WT95 are
published with verdicts. See § *Phase 6 on the building the criterion names* above.

Measured at Midtown Office interfloor-mix, n = 150 under common random numbers, `destination-eta`
with `weights.rideTime: 1` against `eta`, all four figures from the same runs. Regenerated by
`benchmark/destinationDisclosure.js`; pinned by `benchmark/published.ts` and asserted by
`benchmark/destinationDisclosure.test.ts`.

> **Reproduction caveat — the barrel half is now CLOSED (C27), and it buys less than it looks.**
> Phase 6a's and 6b's study entry points were **not** on `benchmark/index.ts` or on the
> `@elevator-sim/experiments` barrel, because `index.test.ts` requires the two to move together and
> the barrel was another task's file ([§ D62](../DECISIONS.md)). Wave 5 put all 34 names plus
> `runMixedUseHighRiseStudy` on both in one commit ([§ D118](../DECISIONS.md)) — **but a barrel
> re-export is *reachability*, not liveness**, which is the exact property all ten dead behaviours **in code**
> already had, and `measureEnergyLiveness` was on two barrels and was dead. Their non-test caller is `benchmark/regeneratePins.ts`, exactly as
> `runTailStudy`'s is, and they are reachable at their module paths. **This paragraph used to end
> *"putting them on the package surface is tracked as C27"*, in the present tense, two sentences
> after saying wave 5 had done it** — a live contradiction inside one blockquote, and the same rot
> that left `docs/07` § 8 carrying C27 as standing debt for two waves. The list is now guarded:
> `src/index.test.ts` parses § D62's own fence and requires every name on **both** barrels, bound
> identically, which is the check that did not exist while the row was wrong.

| metric | difference | verdict |
|---|---|---|
| **TTD** | **−1.562 [−1.916, −1.208] s** | **BETTER** — the gate |
| in-car time | −2.076 [−2.406, −1.746] s | BETTER — the mechanism check |
| AWT | +0.514 [+0.344, +0.684] s | **WORSE** — reported, not hidden |
| WT95 | +1.010 [+0.292, +1.729] s | **WORSE** — reported, not hidden |

**The effect is the *pricing*, not the call type, and the study separates them.** The
**`destination-eta-unpriced`** arm — `mobile-credential`, `weights.rideTime: 0`, everything else
inherited from the shipped profile — is **bit-identical to `eta`** here, 150 of 150 paired
differences exactly zero on every metric, because Midtown declares no `accessZones` and moving
information earlier is worth exactly zero until something reads it. Two arms, one variable; the
decomposition is a measurement rather than an inference.

> **The shipped profile used to *be* that control, and now weights `rideTime` at 0.5.** Until
> [§ D112](../DECISIONS.md) it authored the call type and no weight, so it was inert — the destination
> reached `estimateCost` and changed no decision, bit-identical to `eta` at 8 of 8 matrix cells,
> which is the standing requirement's defect in `data/`. Authoring the weight would have deleted this
> decomposition had the arm stayed bound to the id; the arm was **inverted** instead — the derived
> one is now the unpriced control rather than the priced treatment — so the measurement is unchanged
> and only the name moved. The evidence that `rideTime: 0` ≡ the term absent is itself a
> measurement: `destination-eta-unpriced` is in `eta`'s identity class at n = 150, 150 of 150 paired
> differences exactly zero on all seven identity metrics, which is what the shipped profile used to
> do. **1.0 remains a study arm and this −1.562 s headline is untouched.**

Also settled here, against the doc that predicted otherwise: the deferral the approach is forced to
surrender is **not a cost at this operating point**. The same `eta` deferring 1.5 s is WORSE on TTD
by `+1.123 [+0.848, +1.397] s`, on AWT by `+1.081 [+0.952, +1.209] s` and on WT95 by
`+1.895 [+1.443, +2.346] s`, 0 of 150 replications identical. That does not generalise to deferral
in general, and the suite says so rather than implying otherwise.

### The access-control hypothesis — one half CONFIRMED, one half REFUTED

**This section used to assert, as a scope bullet, that destination dispatch improves *"because
authorization and optimization happen in the same step."* Measured, that is false as a claim about
optimization and true as a claim about the credential.** The prior was stated in
`benchmark/accessControl.ts` before the result, so it could not be adopted afterwards, and every
replication run was an attempt to make the refutation fail.

> ## ⚠️ H-ACCESS-1 IS WITHDRAWN — REFUTED 2026-08-05, [§ D256](../DECISIONS.md)
>
> **Everything in this subsection measured a defect in `Car.estimateCost`, not a property of
> conventional dispatch.** Access zoning was applied to a hall call's **pickup** floor; a
> conventional landing call carries no credential by construction, so every car refused every
> landing raised inside an access zone and the building could not be operated at all
> ([§ D254](../DECISIONS.md)).
>
> Re-run at the same n = 30, the same seed and the same arms, with only that check corrected, the
> conventional row reads **30 of 30 quotable · 0.0 undelivered · 0.00 % unserved**, and
> `study.coverage.verdict` returns **`REFUTED`**. Conventional dispatch serves every access-zoned
> building this project ships, at 100 % delivery. On `secure-tower` under `eta` the credential arm
> is now **byte-identical** to the conventional one.
>
> What survives is the **bare-kiosk** row, and it is the genuine article — a destination call type
> with nothing to identify the passenger, refused `destinationAccessDenied` — at **61.2 %** unserved.
> It also got cleaner: 36.5 undelivered against 36.5 kiosk refusals, so every stranded leg is now a
> credential refusal and none is collateral, where the pinned row had 23 per run of collateral.
>
> The table below is **left standing and not regenerated**, because § D256's point is that these
> numbers existed. The pins in `PINNED_COVERAGE` are withdrawn rather than replaced: what should
> take their place is a question about the design of the experiment, not about its arithmetic.

**H-ACCESS-1 — coverage. ~~CONFIRMED, categorically, with no interval.~~ WITHDRAWN — see above.**
Secure Tower at
interfloor-mix, 30 replications — `benchmark/accessControl.ts`'s own coverage budget, seed
20 260 726, re-run 2026-07-28 on the tree carrying the `C35` fix and pinned in that module's
`PINNED_COVERAGE`:

| arm | replications with a quotable AWT | undelivered journeys per run | unserved |
|---|---|---|---|
| `eta`, `up-down-buttons` — conventional | **0 of 30** | 18.2 | 33.5 % |
| `eta`, `destination-entry`, no credential | **0 of 30** | 52.2 | 100.0 % |
| `destination-eta`, `mobile-credential` | **30 of 30** | 0.0 | **0.00 %** |

> **The middle row read 27.6 and 51.7 % until the `C35` fix** made a credential-less kiosk refuse the
> *passenger* rather than the whole landing call. It moved in the direction that makes its own claim
> **more** true — the bare kiosk now serves **nobody at all** on Secure Tower, which is
> [§ D30](../DECISIONS.md)'s qualitative ruling arriving literally — so no verdict moved, and **that
> is exactly why nothing went red**: `accessControl.test.ts` asserted inequalities, and every one of
> them held more strongly afterwards. `benchmark/published.test.ts`, whose whole job is to catch a
> published figure the code no longer produces, could not see it either: its interval layer scans for
> literals shaped `N [N, N]` and `51.7 %` is not one, and its study layer had excluded H-ACCESS-1 on
> the correct observation that a categorical has no standard error — read as a licence to hold
> nothing. Both halves now carry a pin.

Conventional dispatch does not perform *worse* on this building — **it does not perform.** An
access-restricted pickup carries no credential under `up-down-buttons`, so every car answers
`accessDenied` and the call is permanently unassignable; `destinationLiveness.ts` counts that one
level down at **307 of 331 decisions with every candidate refused**, all 921 verdicts
`accessDenied`, against 0 under the credential. The failure is **structural rather than
load-driven**, so no arrival rate rescues it and no operating point exists at which the two arms
could be given a paired interval. That is why this is reported as counts and gets no confidence
interval — a categorical outcome does not have one. The null half holds exactly: on Midtown Office,
which declares no `accessZones`, the credential arm is bit-identical to the conventional one on all
30 replications.

**H-ACCESS-2 — optimization. REFUTED.** With `Δ = TTD(credential + destination priced) −
TTD(credential alone)` per building, n = 150 under CRN:

| building | Δ absolute | Δ relative to its own baseline |
|---|---|---|
| Secure Tower (5 access zones) | **−0.580 [−0.764, −0.396] s** | −0.011 [−0.015, −0.008] |
| Midtown Office (no access zones) | **−1.562 [−1.916, −1.208] s** | −0.029 [−0.035, −0.022] |
| **Δ_secure − Δ_midtown** | **+0.982 [+0.584, +1.380] s** | **+0.017 [+0.010, +0.024]** |

Both buildings gain, both gains exclude zero, and the difference-of-differences excludes zero **on
the positive side in both forms**. Given the credential, pricing the destination buys *less* where
access is controlled, not more. **The saving is real and it is entirely in the credential**, which
is a claim about **authorization** rather than about **optimization**.

> **A single-building interval cannot answer this and must not be quoted as if it could.** Secure
> Tower alone gives −0.580 s with an interval clear of zero, and read alone that looks exactly like
> the old sentence coming true. It is only against Midtown's *larger* −1.562 s that it reads as
> refutation. `docs/09` § 8 named this as the most likely way Phase 6 publishes a wrong conclusion,
> *because the wrong answer is the comfortable one*, so the suite asserts the trap explicitly: the
> single-building interval **does** exclude zero on the confirming side and the
> difference-of-differences **does not**. Across buildings there is no pairing, so the two `Δ` series
> are combined with a **Welch** two-sample interval rather than a paired-t.

> **The near miss, recorded because it is the most instructive thing in this section.** `Δ` is
> defined as *TTD(credential + destination priced) − TTD(credential alone)*, and `accessControl.ts`
> resolved "credential alone" by the **shipped `destination-eta` id** — correct only while that
> profile happened to weight `rideTime` at zero. When [§ D112](../DECISIONS.md) authored the weight
> at 0.5, that binding would have silently redefined `Δ` as *the marginal effect of going from 0.5 to
> 1.0* rather than *the effect of pricing the destination at all*. Measured both ways: the published
> `+0.982 [+0.584, +1.380]` falls to a mean of **+0.208**, interval still excluding zero on the
> positive side — **same sign, same REFUTED verdict, a fifth of the magnitude**, and the only thing
> marking the change would have been a pin regeneration. Bound to the *configuration*
> (`destination-eta-unpriced`) instead, the six access-control pins do not move at all. **An arm
> resolved by a shipped id is an arm that can be redefined by editing `data/`.**

The mechanism of the refutation is legible, which is what makes it credible rather than a fluke:
once the credential is present the access check has **already passed**, so the destination can only
do ordinary ride-time optimization — and Secure Tower's banks are three identical cars over fifteen
floors against Midtown's four over twenty-one. There is less for a destination to differentiate.

**Seven places asserted the refuted mechanism as fact and none of them was pinned by a test**, so
nothing went red while they were wrong — the same defect class as a published number nothing
re-derives. Four were `core` docstrings, corrected by [§ T16-D9](../DECISIONS.md)
(`dispatch/lifecycle.ts`, `model/types.ts`, `model/car/types.ts`, `sim/simulation.ts`); the three
documents — this section, `docs/01-architecture.md` § Zoning and `docs/07-handoff.md` § 7 — are
corrected as of 2026-07-28. `model/car/estimateCost.ts:123` is **not** on the list and is correct as
written: it says only that a destination *lets* a dispatcher authorize and optimize in one step,
which is a true description of the code. What was refuted is the performance claim built on it.

### Phase 6b — destination dispatch. **ACCEPTED (2026-07-28), and the acceptance carries a caveat.**

> **What 6b's acceptance rests on, and what it does not.** It rests on the Midtown / Secure Tower
> contrast below, which is unchanged and unretracted: at the primary operating point every metric is
> INDISTINGUISHABLE while the arms are demonstrably wired, and where the promise binds the cost is
> published rather than hidden. It does **not** rest on the building the criterion names: measured
> there ([§ D100](../DECISIONS.md), and § *Phase 6 on the building the criterion names* above),
> **the Level-1 panel does not clear the gate at any measured point** — its TTD interval contains
> zero against `eta` and `collective` at 1 %, 2 % and 4 %, and at 4 % it is `+9.083 [+5.683,
> +12.484]` s WORSE on WT95. State that plainly beside the ✅ rather than under it. The Level-0 arm
> is what met the criterion on that building.

Per-passenger assignment is wired through `sim/simulation.ts`; a destination assignment is
**write-once** and a bumped passenger is counted in `brokenPromises` rather than re-promised
([§ D29](../DECISIONS.md)) — with exactly one exception, added by
[§ T22-D1](../DECISIONS.md) and recorded in [§ D101](../DECISIONS.md): a promise to a car that
**leaves group control** is revoked, because that car does not come back and the promise cannot be
kept. That refines D29 rather than weakening it — D29's argument is about a car that is *full*, and
a full car empties and returns. `VIZ_SCHEMA_VERSION` bumped 3 → 4 and the landing panel is **rendered**
— the contract's "either bump and render, or refuse the run outright; do not do neither" was
answered by rendering.

Arm D is the shipped `destination-panel`; arm C is that profile with `dispatch.passengerAssignment`
deleted and nothing else touched, so the contrast isolates the passenger model rather than the
weight vector. Seed 20260726, n = 150, CRN, D − C, from
`benchmark/destinationDispatchContrast.ts`:

| operating point | ΔTTD | ΔAWT | ΔWT95 | Δride | bit-identical |
|---|---|---|---|---|---|
| **Midtown interfloor-mix 1.5 %** (primary) | `+0.11 [−0.04, +0.25]` INDIST. | `−0.01 [−0.10, +0.08]` INDIST. | `+0.15 [−0.33, +0.64]` INDIST. | `+0.12 [−0.01, +0.25]` INDIST. | 27 / 150 |
| Secure Tower interfloor-mix 1.5 % | `−0.03 [−0.13, +0.08]` INDIST. | `−0.04 [−0.10, +0.01]` INDIST. | `−0.22 [−0.45, +0.02]` INDIST. | `+0.02 [−0.05, +0.09]` INDIST. | 41 / 150 |
| **Midtown interfloor-mix 4.5 %** (the promise binds) | `+5.94 [+4.42, +7.46]` **WORSE** | `+6.96 [+5.55, +8.38]` **WORSE** | `+37.34 [+29.37, +45.32]` **WORSE** | `−1.02 [−1.63, −0.41]` **BETTER** | 0 / 150 |

**Read the acceptance honestly: the gate is met at the primary point by a criterion that requires
reporting, not by a win.** At the primary point every metric is INDISTINGUISHABLE and the arms are
demonstrably wired (123 of 150 replications differ), which is the pair of readings that together
rule out a dead seam. Where the promise binds, at 4.5 %, the panel is **expensive** and the sign
split is the mechanism: TTD 5.94 s worse, WT95 37 s worse, and in-car time 1.02 s *better*.
Destination grouping still does what it is for; the landing is where it is paid for. That is the
"documented cost of the approach" as a measurement rather than an assumption, and it is the reason
D27's reporting clause exists. 4.5 % is **censused, not chosen because it worked**: at 6 % arm D
loses its AWT on 9 of 60 replications while arm C stays clean, so 4.5 % is the edge and *which arm
breaks first* is itself the finding.

Found by driving the CLI rather than by reading it ([§ T18-D6](../DECISIONS.md)): `compare` was
gating its headline verdict on **AWT** across two passenger models — the first of the nine metrics
`core` says must not be paired — while `Simulation` was already raising the disclaimer and `run` was
already printing it. `compare` now moves the headline to TTD when the arms' models differ, and says
so in a block naming `core`'s own list.

### Phase 6c — learned control. ⬜ **IMPLEMENTED, MEASURED, AND NOT ACCEPTED.**

**It is no longer deferred, and it is not accepted either.** The distinction matters: a deferral is
an absence of evidence, and this is evidence.

§ D28 moved it out of Phase 6 for three stated reasons, and the first two were answered by choosing
a shape rather than by argument:

1. *It shares no interface with 6a or 6b.* **Dissolved.** Built as **learned weight selection** — a
   contextual policy choosing among the cost-term weight vectors already shipped in
   `data/dispatcher-profiles.json` — it shares the very weight vector 6a and 6b price against. What
   changes is *which* vector, and when.
2. *It strains invariant 8 — a 400-parameter policy vector is not obviously a declarable tunable.*
   **Dissolved by not building that.** A selection policy is a declarable tunable with type, range,
   default and `activeWhen`, searchable by the generic optimizer invariant 8 exists for.
3. *Decisively, its acceptance criterion was stated in the metrics 6b makes non-comparable.*
   **Answered first, in writing, before any code existed** — the criterion is
   [§ D139](../DECISIONS.md), gating on **TTD** because `comparabilityOf` lists AWT and WT95 among
   nine metrics that stop being comparable across the two passenger models.

**The measurement.** Midtown Office interfloor-mix, reference arm `collective` (not `nearest-car`,
which § 4 of the handoff records as a poor reference arm), n = 200 on a **disjoint** seed under CRN:

| arm | ΔTTD (the gate) | verdict |
|---|---|---|
| learned selection (6c) | **−0.213 [−0.440, +0.014]** | **INDISTINGUISHABLE — the interval contains zero** |
| fuzzy detector (Phase 7's bullet) | −0.212 [−0.416, −0.007] | excludes zero, and **still below the resolution limit** |

Unchanged at 24 and at 64 search candidates. Costs published beside the gate and never folded into
it: ΔAWT +0.424 WORSE, ΔWT95 +0.675 INDISTINGUISHABLE, energy +4.807 kJ per served leg WORSE.

**Both arms are in the structural regime**, whose smallest detectable effect is **1.9 s** (§ 4). An
interval excluding zero is **not** a win when the effect is smaller than the apparatus can resolve,
which is why the fuzzy arm is reported below the resolution limit rather than banked.

**The search is not what failed.** Pointed at `idle.repositionThresholdS` — the known-answer test
whose interior optimum is 2 s while 8 s ships — the same machinery returned **1.691 s at 64
candidates, 1.490 s at 128, 1.874 s at 256**. It rediscovers ~2 s blind. The candidate count was
calibrated on *that* dimension, whose answer was known, and not on the 6c result.

#### The sweep — eight operating points, and the refusal holds ([§ D151](../DECISIONS.md), [§ D156](../DECISIONS.md))

**The one-operating-point objection is closed by measurement, and the verdict did not move.** § D151
pre-registered the cell set, the arms, the metric, the correction and what "accepted" would mean
**before any sweep ΔTTD existed**; § D156 is the result. Five PRIMARY cells across three buildings
and four traffic patterns, Holm–Bonferroni corrected across the family, n = 200, CRN, validated on a
disjoint seed:

| cell | ΔTTD | Holm | below this cell's own TTD limit? | verdict |
|---|---|---|---|---|
| Midtown interfloor-mix 1.0 % | **−0.265 [−0.429, −0.101]** | REJECT H0 at α = 0.010 | **yes**, 0.509 s | NOT ACCEPTED |
| Midtown interfloor-mix 2.0 % | −0.114 [−0.553, +0.324] | retain | yes, 0.615 s | NOT ACCEPTED |
| Garden residential 2 % | −0.111 [−0.248, +0.027] | retain | yes, 0.917 s | NOT ACCEPTED |
| Garden down-peak 2 % | **−0.191 [−0.314, −0.069]** | REJECT H0 at α = 0.0125 | **yes**, 0.786 s | NOT ACCEPTED |
| Midtown @ `hotel` profile 1.5 % | −0.085 [−0.262, +0.092] | retain | yes, 0.758 s | NOT ACCEPTED |

**Two of the five clear the correction and are still refused**, and [§ D140](../DECISIONS.md)'s
raise is the whole reason: both are a third to a half of their own cell's smallest detectable
effect. **The limits are now measured on TTD at each cell** rather than inherited from § 4's
AWT-measured 1.9 s — and every measured structural limit is **smaller** (0.509–0.991 s), which is
the *permissive* direction, so the refusal is robust to the choice rather than propped up by it.

**One SECONDARY cell clears every gate and does not accept the phase.** Midtown **down-peak 1 %**:
ΔTTD **−2.130 [−2.730, −1.529]**, Holm-rejected, above its own 0.991 s limit, generalizing. It is
reported and not banked, for the two reasons § D151 fixed in advance — a secondary cell is admitted
only by excluding an arm on its ceiling and cannot accept the phase, and a significant effect at a
cell the regime screen calls **one-regime** is a bug report until investigated. It was investigated:
it is **not** a constant weight override (pinning the dominant weight set for the whole run is
**+1.157 [+0.719, +1.595] WORSE**), and the learned arm really does alternate — `fairness-first`
79.7 % of decisions, `energy-aware` 20.3 %, five changes a run. **What it learned is a busy/idle
schedule, not a traffic-pattern selection.**

**The regime screen is the finding to carry forward.** Measured before any ΔTTD: the directional
split **does not vary within a run** at any cell — Pearson homogeneity over the time-bin ×
direction-category table is inside its own noise everywhere, largest standardized deviation **+1.83 σ**
— because `DemandPhase` carries a scalar intensity and `generator.ts` applies one `intensity(t)` to
every demand source. What *does* move is the **level**, and exactly one of the five authored patterns
(`idle`) is level-triggered. **So the shipped demand template cannot express the condition weight-set
selection exists to exploit**, and that is a different finding from *learned control does not help*.

#### The re-measurement on `lunch-two-way` — the third refusal, on the traffic the first two could not express ([§ D162](../DECISIONS.md) is the protocol; [§ D200](../DECISIONS.md) is the verdict)

**The condition § D156 named as missing now occurs, and the selector still does not clear the
gate.** Measured 2026-07-30 by `benchmark/lunchTwoWaySelection.ts` under § D162's five conditions —
the template cited and untouched, the operating point shipped for the building's own reasons, the
commit ordering on record, the gate § D139 as raised and unchanged, and the flat-mix negative
control measured in the same run at the same seeds and equal total demand. Census at the tuning
seed on both cells: **all twelve arms quotable, no ceiling, reference `auction-multi-round` on
both**; budget variance-derived per `matrix.ts`'s rule on the gate metric and clamped to the band's
ceiling of 200; resolution limits measured on TTD at each cell (structural **0.412 s** treatment,
**0.461 s** control); n = 200 on the disjoint holdout seed under CRN; Holm within a **new declared
family of exactly the treatment cell**, never pooled with this sweep's families.

| cell | learned ΔTTD vs `auction-multi-round` | verdict |
|---|---|---|
| `lunch-two-way` 1.5 % (mix swings 90/0/10 → 0/90/10) | **−0.170 [−0.405, +0.064]** | NOT ACCEPTED — contains zero (p = 0.1538), below the cell's own 0.412 s limit |
| flat-mix control (same template, `mixAmplitude: 0`, same total demand) | **−0.576 [−0.833, −0.319]** | BETTER, above its own limit — **§ D162 condition 5's trigger, investigated below** |

**The refusal is of the selector, not of the traffic.** The regime screen — fixed first by a wiring finding this measurement reported, five diagnostic
call sites that dropped the point's `demandTemplate` (commit `0a7bb4d`; the gate experiments run
through the runner and were never wrong) — shows the
condition present: `two-way` is the detector's incumbent on **66.1 %** of post-warm-up observations
(three regimes, 21 preference changes), and the trace-level split drift is **+10.38 σ** against the
control's +3.97 σ in the same apparatus. The fitted policy generalizes in sign (−0.205 s tuning →
−0.170 s holdout) and is still unresolvable — § D145's sentence, still true: a generalizing effect
that cannot be resolved is still an effect that cannot be resolved.

**The flat control's BETTER is the § D162 negative control doing exactly what it was built for.**
Pinning `predictive-balanced`'s weight vector on the reference profile for the **whole run** — no
selector, no switching — beats the reference by **−0.720 [−0.973, −0.467]** on the control and
**−0.667 [−0.923, −0.412]** on the treatment at the verdict seed: *more than the learned arm
achieves on either cell*. So the advantage is a **static weight-vector hybrid** — the auction
dispatch stages carrying a better-for-TTD vector at this point — present at full strength where the
mix cannot vary, and the switching *subtracts* value (−0.170 learned against −0.667 constant on the
mix-varying cell). It is not mix exploitation, and it accepts nothing. On the treatment the learned
arm held `interfloor` (= `eta`'s vector) 51.0 % and `two-way` 32.0 % of decisions; on the control it
pinned `two-way` for 90.9 %. Costs beside the gate, never folded in: the treatment's learned arm is
WORSE on AWT (+0.263), WT95 (+0.809) and energy (+4.444 kJ per served leg beside the raw figure).
The deadband known-answer returned **1.691 s** in the same session, so the refusal is a fact about
the policy and not the search. And the standing § D169 discount cuts the same way: the shipped arc
is the **widest** amplitude its citation permits, so even these figures are measured under
conditions *more* favourable to the selector than a real building's smoother arc.

**No status moves. Phase 6 stays ⚠️ partial.** Learned weight-set selection now stands refused on
fixed-mix traffic at nine operating points (§ D145, § D156) **and on mix-varying traffic at the one
shipped point that expresses it**, with a third refusal § D162 explicitly permitted; the record is
`benchmark/lunchTwoWaySelection.ts`, whose figures are pinned and re-derived by its own suite.

### Also still not built in this phase's original scope

- **Double-deck operation and Vertical City. SIMULATED, and benchmarked — to a dispatcher-dependent
  verdict, and then, once the lobby hop stopped being a lift leg, to BETTER-EVERYWHERE on a
  narrower base.** Paired stops serving both landings, per-deck design load at 80 %, deck-bound legs, and
  dwell charged to the **busier deck rather than the sum**. It closed the **eleventh** instance of
  this repository's signature defect: the whole deck API on `model/bank.ts` — `isDoubleDeck`,
  `deckAt`, `deckAssignmentFor`, `pairedFloorOf`, `servesFloorPair` — had **no non-test caller
  anywhere**, while `vertical-city` had authored eight double-deck cars and four floor pairs since
  the building was written and the config layer cross-validated them with four dedicated warning
  codes. The configuration was right, the validation was right, and nothing consulted either.

  **`WARNING_CODES.doubleDeckNotSimulated` is deleted**, because it became false. What survives is
  the narrower `WARNING_CODES.missingFloorPairs`, carrying the same sentence for the one case still
  true — a double-deck bank that declares no `servesFloorPairs` — which **no shipped building
  raises**. The `analytical/upPeak.ts` warning was **kept and strengthened**: the Barney/CIBSE closed
  form *is* the single-deck derivation, so retiring it would have been the over-claim
  ([§ D11, § D22, § D23](../DECISIONS.md), [review finding #11](08-review-findings.md)).

  **The verdict, on `vertical-city` up-peak, ΔTTD paired-t 95 % under CRN — and it has moved
  once, for a stated cause.** It was `DISPATCHER-DEPENDENT`: WORSE under `eta`
  (`+1.950 [+0.975, +2.925]` at 1 %), BETTER under `collective` (`−1.408 [−2.400, −0.416]` at 1 %
  and `−5.291 [−6.350, −4.232]` at 1.5 %), with one cell permanently unresolvable. That was
  measured on a building with **no escalator**, where a car boarding at `G` can only alight on
  lower-pair floors and the resulting `G → 2` lobby hop had nowhere to go but a local lift —
  **110 of 593 journeys gained a leg**, and the WORSE row was published as an *upper bound on the
  cost of double-deck rather than its true cost*.

  `core` now has a non-elevator transport mode and `vertical-city` declares one at `G ↔ 2`. Re-run
  at the same seed and the same pre-registered budgets, the excess-leg gap falls from
  **+10.80 % / +11.56 %** to **+1.32 % / +1.70 %** — and what is left is *report-window
  membership* rather than a decomposition difference, because at these points the two arms now
  plan identical leg counts journey for journey — `eta` at 1 % becomes
  `−2.729 [−3.550, −1.907]` **BETTER**, `collective` at 1 % `−6.262 [−7.210, −5.315]` **BETTER**,
  and the gate reads **`BETTER-EVERYWHERE`**. **Read it with its cost:** the 1.5 % point dropped
  out entirely — both double-deck cells lose their AWT inside n = 200 — so the new word rests on
  **two cells at one operating point** where the old one rested on four at two, and ΔAWT moved the
  *other* way (`eta` @ 1 %: −0.355 BETTER → +0.785 WORSE) because the legs removed were the cheap
  one-floor ones. Energy is still WORSE in every quotable cell and still **not** because it served
  fewer people: `unservedFraction` is exactly 0 on both arms at every replication. The intuitive
  *fewer stops ⇒ less driving* is refuted here in both revisions.

  **`vertical-city` has since declared an escalator at all three sky lobbies as well, and not one
  figure above moved.** The reason is measured rather than assumed: this study's only comparable
  regime is incoming-only up-peak from `G`, and none of the building's 92 populated destinations
  changes route when those three edges exist — on either arm. **The base did not widen**, so the
  word `BETTER-EVERYWHERE` is exactly as strong as it was: two cells at one operating point, with
  the 1.5 % point still UNQUOTABLE.

---

## Phase 7 — Automated tuning

Search the parameter space instead of hand-guessing weights. Full design in
[Parameterization & Tuning](06-parameterization-and-tuning.md).

- Self-describing parameter schema (`continuous` / `integer` / `categorical` / `boolean`,
  with `activeWhen` for conditional parameters) so a generic optimizer needs no
  elevator-specific code
- Common random numbers across candidates within an optimization round
- Successive halving on replication count as the fidelity dimension
- Random search baseline, Bayesian optimization, CMA-ES; OCBA for final selection
- Held-out traffic seeds for validation
- Pareto front reporting over (AWT, energy, WT95)
- ✅ **DONE — Fuzzy traffic-pattern detector with hysteresis, driving per-pattern weight sets**
  ([§ D143](../DECISIONS.md)). **This bullet was `⬜ NOT DONE` for two waves and the reason is worth
  keeping**: `data/dispatcher-profiles.json` authored a complete `patternSwitching` block —
  `type: "fuzzy"`, four inputs, five patterns, `hysteresisS: 120`, a `weightSetsByPattern` map —
  schema-validated, typed on the public `core` barrel, cross-checked for dangling profile names, and
  **read by nothing**. A user editing `weightSetsByPattern` saw a clean `loadConfig` and zero
  behavioural change: the defect one level up from code, into data
  ([review finding #5](08-review-findings.md), [§ D12](../DECISIONS.md)).

  It is live now, and its liveness was **measured on trajectories rather than read**: two
  configurations differing only in `weightSetsByPattern` produce different car paths on one seed —
  137 moves against 135, first divergence at move 42 — which is the assertion finding #5 prescribed.
  The detector entered `idle → interfloor → two-way → up-peak → interfloor → two-way → interfloor →
  two-way` over one run, 8 switches. `timeOfDay` was **dropped** from its declared inputs: a wall
  clock in `core` violates invariant 3, and it would have been a constant near zero wearing a
  feature's name. `weightSetsByPattern.idle` named `energy-saver`, which **no profile authors**; it
  is repointed to `energy-aware` and `resolveWeightSets` now **throws** on a dangling name rather
  than silently missing a regime ([§ D142](../DECISIONS.md)).

  **Measured, and reported below the resolution limit**: ΔTTD `−0.212 [−0.416, −0.007]` against
  `collective` at n = 200 — an interval that **excludes zero** and is still not a win, because the
  effect is smaller than the ~1.9 s this structural regime can resolve
  ([§ 4](07-handoff.md), [§ D140](../DECISIONS.md)). Reporting it as a win would have been the
  wave's easiest over-claim.
  [Review finding #5](08-review-findings.md), confirmed by measurement and recorded as deliberately
  unimplemented scope in [`DECISIONS.md` § D12](../DECISIONS.md). It is deferred rather than dropped
  because it is a genuinely new *behaviour* — a controller that switches the whole weight vector
  mid-run — with its own acceptance question and its own risk to CRN, since two arms that switch at
  different times see different weight vectors at the same instant.

**Acceptance:** a tuned weight vector beats the hand-authored `predictive-balanced`
profile on **held-out seeds** with a paired-t interval excluding zero. Candidates whose
difference falls below the confidence-interval half-width are reported as
indistinguishable rather than ranked.

> **The objective surface is piecewise constant — Phase 3 measured this too.** A weight
> perturbation below the threshold that flips a dispatch decision produces a **bit-identical
> run**: measured at ≤ 0.03 on `distanceTravelled`, 100/100 exactly-zero paired differences,
> `rho = 1`. Below that threshold a change is not a small effect, it is *no* effect, because
> dispatch is an `argmin` over a handful of cars and the simulator is deterministic.
>
> - **Expect flat regions and detect them cheaply** — exactly-zero differences with `rho = 1`.
>   A candidate scoring identically to its parent means the step was too small, not that the
>   direction was wrong.
> - **Anything gradient-ish or small-perturbation will stall.** Finite differences are
>   undefined on a plateau. This is a further argument for the random-search baseline, CMA-ES
>   with a step size above the plateau width, and coarse-grid Bayesian optimization.
> - **Step size has a per-term, per-building floor.** Probe it; do not assume 0.03.
> - **Conversely, this is the regime where CRN is at its best** — 99.69% variance reduction and
>   324× between near-neighbours. The ~94% / 5–20× expectation is sound *for this phase*, which
>   is exactly where the tuning loop's "use CRN across candidates" guidance applies.
>
> See [Traffic & Statistics](03-traffic-and-statistics.md) § *Measured: flat plateaus, not
> noise*.

**Status: ACCEPTED (2026-07-27), against the criteria as written and after the three blockers
below were closed.** This section has now carried three different verdicts, and the sequence is the
point: it read *"green. The machinery is complete and wired"* when nothing outside a test could
reach the module; that was corrected to **NOT ACCEPTED** by
[review finding #1](08-review-findings.md); the blockers were then closed by real work rather than
by rewording, and the verdict is accepted on the evidence below. **Both scope bullets that were
never built are marked not-done above rather than swept into this verdict.**

**What was wrong, recorded so the shape stays visible.** There was no
`packages/experiments/src/tuning/index.ts`; `packages/experiments/src/index.ts` exported nothing
from `tuning/`; every importer of `randomSearch`, `successiveHalving`, `sepCmaEs`, `runnerObjective`
and `runHoldoutRound` was either a `*.test.ts` in the same directory or a barrel re-export — and this
document is explicit that **a barrel re-export is not a caller**. The CLI exposed
`list|run|compare|watch` and no tuning command.

**The module said so itself.** `tuning/search/index.ts` § 6 was titled *"OPEN — nothing here is
reachable from the package's public surface"* and called it "a gate blocker, recorded here rather
than left to be rediscovered." That was honest and correct; the phase was accepted anyway, over the
module's own written objection. That is the failure worth learning from — the fifth instance was
caught by a verifier, and the sixth was *reported by the code itself* and then overridden at the
acceptance step. `dispatch/deadCode.test.ts` could not have caught it either: it sets
`AUDITED_MODULES = ['core/src/dispatch/policies', 'core/src/dispatch/predictor']`, is a
`packages/core` test, and cannot see `packages/experiments` at all.

**The three requirements this section set, each checked rather than asserted:**

| requirement | evidence |
|---|---|
| 1. A `tuning/index.ts` barrel and a re-export from `packages/experiments/src/index.ts`, resolving the `Candidate` name collision between `tuning/space` (a parameter assignment) and `tuning/search` (a configuration under evaluation) | ✅ `packages/experiments/src/tuning/index.ts` exists; `packages/experiments/src/index.ts` re-exports from it, names listed explicitly rather than by `export *`; the collision is resolved in `tuning/index.ts` with the space keeping the bare name |
| 2. A **real caller** — the natural one is a CLI `tune` command | ✅ **named non-test caller: `tuneCommand` in `packages/cli/src/commands/tune.ts`**, which imports and calls `runnerObjective`, `successiveHalving`, `sepCmaEs`, `randomSearch` and `runHoldoutRound` directly, and is registered as `['tune', …]` in `packages/cli/src/index.ts`. `elevator-sim --help` lists **five** commands: `list run compare tune watch` |
| 3. An experiments-side dead-code audit with `AUDITED_MODULES` extended to `experiments/src/tuning/{search,space,report}` | ✅ `packages/experiments/src/tuning/deadCode.test.ts`, with exactly those three modules |

**And the phase was made to answer its own known-answer test.** `docs/07-handoff.md` § 5 left
`data/dispatcher-profiles.json`'s `idle.repositionThresholdS` at the shipped **8 s** on purpose,
against Phase 5's independently measured interior optimum of **2 s**, so that an optimizer that
rediscovers it blind has validated itself. Run end to end against the real `data/` directory by the
orchestrator: `tune` searching that dimension from the shipped 8 s returned **2.582 s**, with the
tuning and holdout seed sets printed `DISJOINT` (trace seed 9876618837807159332 against holdout
11367898276632666949) and a holdout verdict of `GENERALIZES` at `--validate-reps 150`. That is the
phase's product — a search, an optimizer-found value, and a held-out check — produced by a command a
user can type.

What *is* done and verified: the search space, the three searches, successive halving, plateau
detection, the Pareto reporting and the held-out validation round are built, individually tested, and
`runHoldoutRound()` is exercised end to end against the real `data/` directory by
`report/holdoutRound.test.ts`. The acceptance measurement below was produced by that path and stands.

| criterion | verdict |
|---|---|
| a tuned weight vector beats hand-authored `predictive-balanced` on **held-out** seeds with a paired-t interval excluding zero | **MET, as a gate, at n = 150.** See § *The acceptance interval at a real budget* immediately below. The n = 60 measurement that used to sit here is retained there as the record of what the verdict was before Phase 8 discharged it |
| candidates below the interval half-width are reported as indistinguishable rather than ranked | **MET** — `pareto.ts` places an arm on the front only where another is significantly better on ≥1 objective and significantly worse on none; ties are reported as `indeterminate`, never ordered |

### The acceptance interval at a real budget. **MET at n = 150 (2026-07-28).**

`benchmark/phase7Acceptance.ts`, Garden Apartments, `predictive-balanced` as shipped (deadband 8 s)
as the reference, tuning seed set `tune-20260726` against holdout `hold-981234567`, realized
`DISJOINT`, n = 150 in CLAUDE.md's 50–200 band. Every figure below is a pin in
`benchmark/published.ts` § `phase7-acceptance` and was re-derived by running
`runPhase7Acceptance()` on this tree for this section.

| candidate | holdout AWT vs shipped | holdout verdict | retained | holdout energy |
|---|---|---|---|---|
| `c-deadband-2` (Phase 5's interior optimum) | **−1.088 s [−1.680, −0.495]** | BETTER · GENERALIZES | **94 %** | **+122.15 kJ [+108.65, +135.65]** — WORSE |
| `c-deadband-2.582` (what `elevator-sim tune` found blind) | **−1.105 s [−1.674, −0.536]** | BETTER · GENERALIZES | **122 %** | **+111.72 kJ [+98.59, +124.86]** — WORSE |
| `c-deadband-5` (negative control) | −0.221 s [−0.459, +0.017] | INDISTINGUISHABLE | — | +28.72 kJ — WORSE |

Both tuned arms clear; the negative control correctly does not, with 103 of 150 paired differences
exactly zero. `retained` is `holdoutGain / tuningGain`, so the 2.582 arm's 122 % means it did
*better* on traffic the search never saw, not that a gain grew.

**The cost is visible for the first time**, because the energy axis did not exist when Phase 7 was
accepted. Against the holdout reference's **402.958 kJ**, `c-deadband-2` spends **525.110 kJ** — a
**+30.3 %** energy bill for 1.09 s of wait — and `c-deadband-2.582` spends **514.679 kJ**, **+27.7 %**
for 1.11 s. Both are on the holdout Pareto front over (AWT, energy, WT95) together with the shipped
profile, and this document does not rank them: **which of those trades an operator wants is the
operator's call** (CLAUDE.md § Tuning discipline). The shipped 8 s deadband in
`data/dispatcher-profiles.json` is deliberately untouched — it is Phase 7's known-answer test.

### The n = 60 verdict this replaces, kept because the reasoning is still right

> **What this section said until 2026-07-28:** *MET as a measurement, NOT as a gate* — at n = 60 on
> Garden Apartments, `idle.repositionThresholdS` 8 s → 2 s gives **−1.288 s [−2.277, −0.298]** on the
> holdout seed set, which excludes zero; on the *tuning* seed set the same arm gives
> **−0.916 [−2.161, +0.328]**, which does not.
>
> The n = 150 measurement above confirms the sign on both arms and both seed sets, so nothing below
> is retracted. It is kept because **the argument for not gating at n = 60 is still correct**, and it
> is the reason the number was produced at a real budget rather than the gate being lowered to fit
> the budget a test suite can afford.

**Why the interval was measured but not asserted at n = 60.** The sign is stable and the effect is
real, but significance at a budget a test suite can afford is not reproducible — docs/03's own table prices a
±0.5 s interval at 143 replications and ±0.25 s at 563 (corrected 2026-07-28 — the table was the
deleted normal quantile's answer, **C19**; the argument here only gets stronger, since both budgets
moved up). A gate asserting significance at n = 60
would be a coin flip dressed as an acceptance criterion, which is precisely the failure
[CLAUDE.md § Statistical discipline](../CLAUDE.md) names. So the suite asserts what is *structural* —
that the seed sets are disjoint, that every arm ran the same seeds within a set, that the tuned
parameter demonstrably reaches the dispatcher (`verdict !== 'IDENTICAL'`), and that the page renders
both fronts — and leaves the number to a run with a real budget. **Producing that number at 50–200
replications is Phase 8's job**, not a weakening of this criterion.

> **The argument for not gating on it got stronger, not weaker, when the interval was corrected.**
> Both bounds above moved outward on 2026-07-27, when `estimateMean` stopped switching from
> Student-t to the normal quantile above n = 25 ([review finding #14](08-review-findings.md);
> [`DECISIONS.md` § D14](../DECISIONS.md)). The mean did not move; only the half-width did, by
> 2.09 % at n = 60. The holdout interval still excludes zero — `−0.319` → `−0.298` — but its margin
> falls from 33 % of the half-width to **30 %**. A gate asserting significance here would have been
> a coin flip before the correction and is a slightly worse one after it. Full precision:
> `mean = −1.2878228134149254`, `SE = 0.494478730556314`, `t(59)` half-width 0.9894497.

Three results worth carrying forward:

- **The fifth dead seam was here, and was caught by this phase's own verifier.** `tuning/report` had
  a full green suite in which *every caller was a test*; `seedSetFromReplications` existed precisely
  to be the integration seam and nothing outside a test ever called it. `holdoutRound.ts` is the
  file that calls it, and it is the only thing in the repository that **actually runs the holdout
  set** — a search cannot, because every round a search runs shares one experiment seed by
  construction, so the seeds a search optimizes against are by definition the only seeds it has seen.
- **The piecewise-constant objective shows up in a real run, not just in Phase 3's probe.** Stepping
  the deadband 8 s → 5 s leaves most replications bit-identical, because the deadband only matters on
  a run where some reposition decision falls between the two values. An optimizer taking small steps
  here stalls; this is now a known-answer test rather than a warning.
- **The `multiRoundIsReachableFromSimulation()` tautology is gone.** It returned the literal `true`
  and was asserted by a test — coverage that proved `true === true`. It is replaced by
  `measureMultiRoundReachability()`, which instruments a real `Simulation` through the
  `createPolicy` hook and reports the round histogram, the withdrawals by reason, and how often the
  contract net diverged from central argmin.

**Re-confirmed 2026-07-28: nothing landed since has invalidated this acceptance.** Checked rather
than assumed — (a) `tuneCommand` in `packages/cli/src/commands/tune.ts` is still the named non-test
caller and `elevator-sim --help` still lists five commands; (b) `tuning/deadCode.test.ts` still
covers `tuning/{search,space,report}`; (c) no pinned estimate moved in waves 2–4 —
`benchmark/published.test.ts`'s partition is green and T21 verified explicitly that its gate cannot
reach any pin, because `aggregateMetric` never consults `awtIsValid`; (d) the search space grew by
one declared row for `metrics.maxWaitHorizonS`, and `SPACE.parameters.length` is **unmoved at 49**
because `metrics.*` is excluded from the searchable space. The one thing then outstanding — the one
this section assigned elsewhere, **producing the acceptance interval at a 50–200 replication
budget** — was Phase 8's job, and Phase 8 has done it: see § *The acceptance interval at a real
budget* above. Nothing is left outstanding against this phase's criteria.

---

## Phase 8 — Testing campaign

The largest phase by replication count, and the one whose failures block release.

- Property-based fuzzing over randomly *generated* buildings — the highest-value track
- Analytical cross-validation: closed-form agreement across **all five** buildings
- Physics verification: S-curve times against hand calculations, degenerate short hops
- Statistical self-validation: Phase 3's results re-run as regression
- Determinism regression: golden runs replay byte-identically from stored seeds
- Scale & performance: large buildings, long sweeps, memory profile
- Adversarial edge cases: saturation, single car, all calls one floor, access lockout, all cars
  out of service, mid-run mode changes
- ✅ **DONE — the full experiment matrix at a real budget.** Every dispatcher × building × traffic
  with a Pareto front over (AWT, energy, WT95) and explicit INDISTINGUISHABLE verdicts, and with it
  Phase 7's acceptance interval re-measured at 50–200 replications rather than at n = 60. § Phase 7
  assigns that measurement here explicitly and accepting Phase 7 did not discharge it; `f895a16`
  did. `benchmark/matrix.ts` (8 cells × 12 profiles, budgets derived per cell, n = 50…200) and
  `benchmark/phase7Acceptance.ts` (n = 150, disjoint seed sets) are the two entry points, and the
  energy axis they need is the `RunSummary.energy` proxy that landed in the same commit.

**Acceptance:** every track lands, **and no property violation is outstanding**. A Phase 8 failure is
**blocking** — a simulator producing confident numbers from broken mechanics is worse than one that
crashes.

> **Where that criterion comes from, because it matters that it was not invented after the results
> came in.** This document had **no Phase 8 section at all** until 2026-07-28; the phase lived only
> in [`docs/07-handoff.md`](07-handoff.md) § 7, whose one stated rule is the blocking rule quoted
> above, written before any of this work started. The tracks-all-land half is the phase's own scope
> list restated as a gate and is **newly written down here**. It is flagged as new rather than
> presented as always having been there — but note that it does not do any work: the blocking rule
> alone already withholds acceptance, so nothing about the verdict below depends on the clause added
> today. `CLAUDE.md` forbids inventing a criterion after the fact as firmly as it forbids weakening
> one, and the way to honour that when a phase genuinely lacked a written gate is to say so.

**Status: ✅ ACCEPTED (2026-07-28) — the blocking clause is DISCHARGED and all eight tracks have
landed.**

> **This section read ⚠️ PARTIAL until the eighth track shipped**, and the reasoning for *not*
> rounding it up while the matrix was outstanding is [§ D102](../DECISIONS.md). That reasoning is
> not retracted — it is discharged by measurement. The track landed in `f895a16` with its own
> always-on suite (`matrix.test.ts`, `phase7Acceptance.test.ts`, `energyLiveness.test.ts`) and
> every published figure pinned in `benchmark/published.ts`. The acceptance is recorded in
> [§ D108](../DECISIONS.md).

The change that matters first is: **no property violation is outstanding.** Both findings
that blocked this phase are closed, and *neither was closed by moving a bound* —
`deadlockIdleBoundS` is untouched at 600 s and `PROPERTY_BOUNDS` is unchanged line for line, which
is what `RISKS.md` R22 existed to prevent. The deep tier is green at 2 000 cases (1 396 887
passengers, 0 violations) and the oracle's deep campaign is green at 11 measurable banks × n = 128.

The second clause is *every track lands*, and the eighth track — a **scheduled measurement, not a
defect** — is what it was waiting on. It landed. Both clauses now pass, so the phase is accepted.
The interval between the two states was carried honestly rather than papered over: the tracks clause
was written down late and flagged as such, and deleting a clause at the moment it becomes
load-bearing is the shape [§ D99](../DECISIONS.md) had to own.

| track | state | evidence |
|---|---|---|
| Property-based fuzzing | ✅ built | `experiments/src/fuzz/` — generator, shrinker, six properties, a 64-case always-on corpus and a 2 000-case deep tier |
| Analytical cross-validation, all five buildings | ✅ built | `experiments/src/oracle/fiveBuildings.test.ts`, `bankCensus.test.ts`, `reconcile.ts` |
| Physics verification | ✅ built | `experiments/src/validation/physics.test.ts` |
| Statistical self-validation | ✅ built | `validation/{crnVarianceReduction,nullComparison,sequentialStopping,operatingPoint}.test.ts` |
| Determinism regression, golden runs | ✅ built | `validation/goldenRuns.test.ts`, `validation/golden/manifest.json`, `fuzz/determinism.test.ts` |
| Scale & performance | ✅ built | `validation/perfScaling.test.ts`, `perfSweep.test.ts` — see § D91 on why the wall-clock gates are opt-in |
| Adversarial edge cases | ✅ built | `validation/adversarial.test.ts`, `fuzz/faults.test.ts` |
| Full experiment matrix + Pareto at a real budget | ✅ built | `benchmark/matrix.ts` + `matrix.test.ts` (8 cells × 12 profiles, per-cell derived budgets n = 50…200, front over AWT / energy / WT95), `benchmark/phase7Acceptance.ts` + its test (n = 150, disjoint seeds), `benchmark/matrixCensus.test.ts` (opt-in 200-replication census that re-derives the budgets), `benchmark/energyLiveness.ts` for the axis they need — **whose own non-test caller arrived late**: it was the ninth dead seam, and `benchmark/livenessSuite.ts` is the driver that closed it (§ Standing requirement, [`DECISIONS.md` § D114](../DECISIONS.md)) |

### Campaign statistics, measured on this code

| | always-on (`corpus.test.ts`) | deep (`ELEVATOR_SIM_FUZZ=deep`, 2 000 cases) |
|---|---|---|
| generated buildings | 64 | 2 000 |
| passengers generated | 7 889 | 1 396 887 |
| simulated time | 14.84 h | 1 242.86 h |
| run outcomes | 55 completed, 9 timed-out | 1 143 completed, 857 timed-out |
| unroutable / invalid generated | 0 | 0 |
| **property violations** | **0** | **0** — was 1; closed, see finding 4 below |

The deep row's 2 000-case figures are the campaign that *found* `fuzz-1000384`. After the fix the
whole deep campaign was re-run per case and diffed on `(status, simulatedSeconds, violations)`:
**8 cases of 2 000 change**, every one of them `destination-panel` with a `serviceEvents` schedule —
exactly and only the path the fix touches — and the other 1 992 are identical to the microsecond.
Seven of the eight move in the expected direction; the eighth is reported rather than buried in
[§ *Blast radius*](../DECISIONS.md), and moves no publishable number, because both states are
`diverging-queue` with `awtIsValid: false`.

### What the campaign found. A testing campaign that reports only "all green" has hidden its own value.

**1. A published mean beside an abandoned passenger. ✅ RESOLVED — a fourth `awtIsValid` ground.**
Reproduced at seed `fuzz-1001074`: mean wait **172.1 s**, p95 **686.4 s**, **max 922.7 s**, 67.8 %
of legs over 60 s — and `awtIsValid` came back **true**. `awtIsValid` had three grounds and the two
substantive ones were both proxies for one question, *did the backlog clear?*, detected in two
shapes: a queue still growing at the horizon (the trend test) and a queue that has not cleared by it
(censoring). Neither sees the third shape — **a queue that grew enormously and then drained just in
time** — which is exactly this case: it escapes the trend gate because a hump fits a shallow line
with large residuals (`g2n` 1.32 against a gate of 4) and the censoring gate because everybody was
eventually collected, 177 of 177. Little's Law confirms the simulator was right about everything:
`λ·W = 0.1235 × 172.07 = 21.2` against a measured mean queue of **20.8**. What was wrong was the
report. The fix is a fourth ground on `awtIsValid`, not a fourth `SaturationVerdict` — queue *level*
cannot be made scale-free, and the observable already normalised by arrival rate is the *wait*. See
[`DECISIONS.md` § T21-D1 – T21-D3](../DECISIONS.md) and `docs/03` § Saturation detection.

**2. A crash reachable the moment out-of-service cars became authorable. ✅ RESOLVED.** Every
landing boarding runs `#boardFrom` → `Car.board` → `Car.registerCarCall`, which **throws** for a
mode that does not honour car calls, and `run()` propagates a `ModelError` unchanged.
`#loadWhileIdle` boards a landing queue from a car already standing there *without consulting the
dispatcher*, deliberately. So the first out-of-service car parked at an occupied landing **killed
the run**, and "all cars out of service" was not merely untested but unrunnable. `#carCanCarry` now
checks service mode and `#park` skips a car the group does not control; both clauses are inert on
every shipped building, whose cars are all `in-service` for the whole run
([§ D76](../DECISIONS.md)).

**3. P5 termination was blind to a fleet that never moves at all. ✅ RESOLVED by strengthening.**
The most extreme corner in the adversarial suite *passed all six properties*: an authored
all-out-of-service fleet delivered **0 of 365** journeys and `checkAll` returned an empty violation
list. `checkTermination` measured the idle stretch once for the run, falling back to
`record.startedAt`; when the fleet does no work at all that fallback never moves, every passenger
arrives after it, and every candidate is skipped as "not yet waiting when the stall began". It is
now measured **per passenger**, over the overlap between fleet inactivity and that passenger's own
wait — **strictly stronger**, reducing to the original expression exactly whenever the old one
applied. `deadlockIdleBoundS` is untouched at 600 s; the bound was never the problem and moving it
would have been this track's own failure mode. Blast radius measured at zero new failures
([§ D86](../DECISIONS.md)).

**4. A deadlock, `fuzz-1000384`. ✅ RESOLVED — by revoking a promise a withdrawn car cannot keep.**
At the 2 000-case overnight budget the deep tier reported one failure:

```
case      fuzz-1000384      simSeed 205687583
topology  sky-lobby   tags: sky-lobby, access-zones, mixed-use, initial-service-mode, service-schedule
status    timed-out, 480 passengers
  [termination] deadlock: the last passenger boarded or alighted anywhere at t=1734.7, and
                nothing has happened for the 1694.3 s before this run's hard deadline of
                t=3429, while journey "j35" (G to 4, waiting) was servable and outstanding
                since t=152.9
```

**P5 termination, not P6 starvation, and proven pre-existing** — re-run at the branch point
`c072f97` with every T21 change stashed, it reproduced the identical violation to the same decimal.
The shrinker reduced it in 33 steps (139 candidate evaluations, 4.1 s) from a 32-floor sky-lobby
with 3 banks, 6 cars, 2 access zones and 480 passengers to **4 floors, 2 cars, 29 passengers and no
access zones**. **The access zones fall away entirely** despite the case's `access-zones` tag, so it
is not about access zoning; the single-entry service schedule and the two-car bank both survive, and
`dropCar` can remove neither — which *is* the diagnosis: the defect needs one car withdrawn and
another available and idle.

**The mechanism, instrumented rather than inferred.** A destination-panel promise bound journey
`j9` to car `low-1`; at t = 472 a service event moved `low-1` to `independent` and released its hall
calls; `#reofferCall` re-offered the call, and `#candidateCars` — enforcing § D29's write-once
promise at the candidate set — handed it **straight back to the car that had just left**.
`cands=[low-1] -> unassigned, low-1:serviceMode`, repeated every `dispatchRetryS = 5 s`, **592
identical dispatches** to t = 3427, while `low-4` served every other landing in the building and
stood idle in between.

**Fixed by [§ T22-D1](../DECISIONS.md): a promise whose car has left group control is revoked, not
held.** `Simulation.#revokePromisesTo` is called from `#onServiceChange` and nowhere else, gated on
`Car.acceptsHallCalls === false`. On the shrunk case: `timed-out` / 22 delivered / 7 undelivered →
**`completed` / 29 delivered / 0 undelivered**, with one revocation. On the parent, still
`timed-out` — which is the honest answer, since 3.8 %pop/5 min on that building with a car withdrawn
is past handling capacity, `saturation.verdict` is `diverging-queue` and no mean is published — but
fleet inactivity before the deadline falls from **1 694.3 s to 5.9 s** and all six properties hold.

**This refines § D29 rather than weakening it,** and the distinction is guarded by a control rather
than argued: D29's write-once rule is stated about a car that is **full**, whose promise is a real
cost precisely because the car empties and comes back. A car on `independent`, `fire-recall` or
`out-of-service` does not come back unless a later schedule entry says so, so the promise is not a
cost being paid — it is a promise that cannot be kept. `sim/serviceMode.test.ts` asserts
`promisesRevoked === 0` on a panel run of the same building with **no** schedule, in which 18
promises are broken by full cars. Recorded in [§ D101](../DECISIONS.md), which also corrects the
four earlier records that still describe this as live.

**Blast radius: 60 of 60 shipped cells byte-identical** (5 buildings × 12 profiles, full structural
fingerprint) once the new always-zero `promisesRevoked` field is stripped, and `promisesRevoked` is
0 in all 60 — necessarily, since no shipped building carries a `serviceEvents` schedule or a
non-default `CarConfig.mode`.

### What the matrix found. The eighth track produced four results, and three of them are about profiles that ship.

**Re-measured on 2026-07-28 by running `runMatrix()` on this tree** (8 cells, 12 arms, CRN within
each cell, budgets as derived in `matrix.ts`, `MATRIX_SEED = 20 260 728`) — **after** § D112 authored
`destination-eta`'s `rideTime` weight, and **after [§ D131](../DECISIONS.md) made double-deck
operation simulated rather than merely configured.** Not transcribed from the commit that produced
it, and not carried over from any earlier version of this section.

> **The `vertical-city-up-peak` row is measured on different hardware from every version of this
> table before [§ D150](../DECISIONS.md).** `vertical-city` is the only shipped building that
> declares double-deck cars, so it is the only cell the eleventh dead seam's closure could move —
> and it moved all 44 of its pins and none of the other 308. Every other row below is byte-identical
> to the version § D112 produced. Read the `vertical-city-up-peak` row as *what eight double-deck
> shuttles do*; the rows above it are unchanged single-deck measurements.

**Every identity claim below carries the `(cell, seed, n)` it was measured at**, because
[§ D136](../DECISIONS.md) established that an identity class belongs to an operating point and a
budget rather than to a cell: `destination-eta ≡ eta` at `garden-down-peak` is true at n = 51 at both
seeds and **false at n = 200** at one of them. Unless stated otherwise every figure here is at
`MATRIX_SEED = 20 260 728` and at that cell's own derived `n`, given in the table.

**1. `nearest-car` is on the Pareto front at six of the eight cells** — and it is there *because it
is worse at serving people*. Measured front membership, one row per cell:

| cell | n | front |
|---|---|---|
| `midtown-up-peak` | 81 | **nearest-car**, energy-aware, capacity-aware, `destination-eta` |
| `midtown-down-peak` | 78 | eta, energy-aware, fairness-first, zoned-uppeak, `destination-eta` |
| `midtown-interfloor` | 200 | **nearest-car**, eta, energy-aware |
| `garden-residential` | 65 | collective, **nearest-car**, energy-aware, zoned-uppeak |
| `garden-down-peak` | 51 | collective, **nearest-car**, eta, energy-aware, fairness-first, capacity-aware, auction, auction-multi-round, zoned-uppeak, `destination-eta` |
| `secure-up-peak` | 119 | **nearest-car**, energy-aware |
| `mixed-use-up-peak` | 50 | energy-aware |
| `vertical-city-up-peak` | 50 | collective, **nearest-car**, eta, energy-aware, fairness-first, `destination-eta` |

`nearest-car` is the arm this document elsewhere calls too weak a baseline to separate anything, and
it was the viewer's default until [§ D134](../DECISIONS.md). It reaches the front by being **best on energy and worst on wait**: a
dispatcher that drives less carries fewer people, and a front is non-domination, not merit. This is
the whole reason [`docs/10`](10-experience-layer-contract.md) § 5.5 forbids an aggregated "eco"
score — one would rank the worst dispatcher first. **Energy is an axis, never a score.**

> **Two rows moved when the weight was authored, and neither `nearest-car` count did.**
> `destination-eta` **joins** the front at `midtown-up-peak` and **leaves** it at
> `midtown-interfloor` and `vertical-city-up-peak`; every other cell's membership is unchanged, and
> `nearest-car` is still on the front at exactly six. The two departures are the interesting ones:
> at those cells `destination-eta` was on the front only by being bit-identical to an arm already on
> it, so it left the front by *becoming a distinct dispatcher* rather than by getting worse.
>
> > **⚠️ The `vertical-city-up-peak` half of that sentence is SUPERSEDED** by `7fac568`, two notes
> > below. `destination-eta` is on that cell's front in this tree. The `midtown-interfloor` half
> > stands.

> **One row moved again when double-deck operation was simulated, and the `nearest-car` count did
> not.** At `vertical-city-up-peak` (n = 50, seed 20 260 728) `eta` **leaves** the front and the
> baseline `collective` **joins** it; `nearest-car` and `energy-aware` stay. No other cell's
> membership changed, so **`nearest-car` is still on the front at exactly six of eight** — the same
> six: `midtown-up-peak`, `midtown-interfloor`, `garden-residential`, `garden-down-peak`,
> `secure-up-peak`, `vertical-city-up-peak`. The mechanism is visible in the pins: `eta`'s AWT
> against the baseline moves from **+0.101 s** (an interval spanning zero) to **+0.811 s** (an
> interval excluding zero on the *worse* side), so `eta` stops dominating `collective` and
> `collective` becomes non-dominated. **`eta` did not get better or worse than it was measured to
> be — it was previously measured on hardware the building does not have.**
>
> > **⚠️ The paragraph above is SUPERSEDED, and the row in the table has been corrected.** It is left
> > standing because the correction is only legible as a correction beside it — and because the way it
> > went stale is the point.
> >
> > **`7fac568` moved this cell again, and nothing followed it here.** That commit gave `core` a
> > non-elevator transport mode ([§ D167](../DECISIONS.md)): `traffic/route.ts` plans a journey as
> > reachability over service zoning, every edge of that graph had been a lift bank, and so the ground
> > hop of `vertical-city`'s two-level lobby — which the real building serves with an **escalator** —
> > had been routed onto `zone-1-local`. It correctly regenerated all of this cell's interval pins,
> > **108 references in `published.ts`**, including `eta`'s AWT against the baseline from
> > `+0.811` to **`+1.066 [+0.700, +1.432]`**. The Pareto front is computed from the same run, so it
> > moved with them.
> >
> > The front at `vertical-city-up-peak` is now the **six** arms in the table:
> > `collective`, `nearest-car`, `eta`, `energy-aware`, `fairness-first`, `destination-eta` — so
> > `eta` is back on it, and the identity class there is `eta ≡ fairness-first`. The
> > *"`eta` **leaves** the front"* sentence above, and the earlier note's claim that `destination-eta`
> > *"**leaves** it at … `vertical-city-up-peak`"*, are both false about this tree.
> >
> > **`nearest-car` is still on the front at exactly six of eight, and that is why nobody noticed.**
> > § D106, `docs/10` § 5.5's refusal of an aggregated eco score, and *energy is an axis, never a
> > score* all rest on **the count** — and the count was right the whole time the table under it was
> > wrong. This is [§ D149](../DECISIONS.md)'s shape exactly: *a stale number that still supports its
> > own sentence is the only kind nobody re-checks, and it is worse than one that contradicts it.*
> >
> > **Nothing was careless. There was no mechanism.** Every one of the 352 interval pins is an
> > arm-against-baseline paired estimate; front membership is decided **arm-against-arm** by
> > `tuning/report/pareto.ts` over raw per-replication energy. No interval pin can see a front move, so
> > a change to the dominance rule, to `pareto.ts`'s invalid-fraction tolerance, to the energy proxy's
> > wiring or to `verdict.ts`'s resolution limit moves this table with every pin green. There is a
> > mechanism now — `matrix.ts`'s `PINNED_FRONTS` and `matrixFront.test.ts`, which re-derive every
> > cell's front, identity classes and verdict census from the run the suite **already pays for**, and
> > scan this document for the row ([§ D184](../DECISIONS.md)). Cost: ~0.3 s.

**2. `destination-eta` used to be bit-identical to `eta` at all eight cells, and is now identical at
one.** It authored `dispatch.callType: mobile-credential` and a weight vector identical to `eta`'s,
so the destination reached `estimateCost` and changed no decision — a shipped, schema-valid,
separately-tested profile with no effect on any shipped path. Closed by
[§ D112](../DECISIONS.md): `weights.rideTime: 0.5`, chosen against two criteria stated *before* the
sweep. **The one cell where it is still identical is `garden-down-peak` at n = 51, and that is
structural, not a weight being too small** — measured bit-identical there at `rideTime` 0.3, 1.0
**and** 2.0, because every down trip ends at the lobby and the destination carries nothing the
direction button did not. Raising the weight fourfold not moving it is how a *blind operating point*
is told from a *dead seam*. **The budget is load-bearing and is not decoration:**
[§ D136](../DECISIONS.md) re-measured this same cell at **n = 200** and the class does *not* hold
there, at one of the two seeds. Simulating double-deck did not touch this cell — `garden-apartments`
declares no double-deck car — and all 44 of its pins are byte-identical.

**3. Three more identity classes — one of them wider than it was, and the widening is double-deck's
doing.** With every claim at `MATRIX_SEED = 20 260 728` and its cell's own `n`:

| class | cells | n at each | moved by double-deck? |
|---|---|---|---|
| `eta ≡ fairness-first` | `midtown-up-peak`, `garden-residential`, `garden-down-peak`, `secure-up-peak`, `mixed-use-up-peak`, **`vertical-city-up-peak`** | 81, 65, 51, 119, 50, **50** | **yes — six cells, not five** |
| `auction ≡ auction-multi-round` | `garden-residential`, `garden-down-peak` | 65, 51 | no |
| `destination-eta ≡ capacity-aware` | `garden-residential` | 65 | no |
| `destination-eta ≡ eta` | `garden-down-peak` only | 51 | no |

**`eta ≡ fairness-first` gained a sixth cell, `vertical-city-up-peak`, and it gained it by the decks
being simulated.** Before, the two arms were distinct there (`eta` +0.101 s on AWT, `fairness-first`
+0.218 s); now both read **+0.811 s** and every one of their four metrics agrees bit-for-bit. The
reading is that a double-deck shuttle bank leaves `fairness-first`'s starvation term nothing to
break the tie on — but **that reading is unmeasured**: nothing here isolates the term, and the
mechanism has not been tested by removing it. Recorded as a claim to check, not as a finding.

`garden-down-peak`'s class remains `{eta, fairness-first, destination-eta, destination-panel}` at
n = 51 — the Level-1 panel is in it too — and § D136 shows that class narrowing at n = 200. Reported
rather than filtered: an arm that is secretly another arm is a result about that arm, and an arm
that becomes another arm when the hardware changes is a new fact rather than a regression.

**4. Saturation ceilings are a property of (building, traffic, seed), not of a building.** Midtown
up-peak's `nearest-car` ceiling is **287** in `arms.ts` at seed 20 260 726 and **174** in `matrix.ts`
at its own seed and operating point. Neither is wrong; inheriting either across studies is. See
[`docs/07` § 4](07-handoff.md).

### Known coverage gaps, checked rather than inherited

1. **A bank with no serving car is generated by neither corpus** — a construction rule, not a
   filter, because `properties.ts`'s `isServable` does not know about service mode and would fire P5
   on a *generator* artefact ([§ D87](../DECISIONS.md)). Covered instead by
   `adversarial.test.ts` and `core/src/sim/serviceMode.test.ts`, where the expected outcome can be
   asserted rather than avoided.
2. ✅ **CLOSED. `serviceEvents` × `passengerAssignment: 'destination'` was untested** — `runCorner`
   and `fuzzSimulationConfigFor` both drove conventional dispatch, which is precisely where the
   deadlock lived. `validation/adversarial.test.ts` now covers it directly: legsAssigned 367,
   promisesRevoked 2, control 0, and `assigned − revoked === legsCreated`. The fuzz generator
   already reached it — `destination-panel` is one of the twelve profiles it draws, which is how
   `fuzz-1000384` was found — but the `validation/` corner was conventional-only.
3. **A dispatcher or a zone cannot be changed mid-run.** A car's availability can
   (`BuildingConfig.serviceEvents`); the other two have no mechanism.
4. **Multi-replication statistics over generated buildings.** One replication per case, as
   everywhere in `fuzz/`. Nothing here says a *mean* under a degraded fleet is right, only that the
   mechanics under it are sound.
5. **Persistence and replay round-trips on generated buildings.** `reports/replay.test.ts` and
   `validation/storedRunReplay.test.ts` own that for shipped buildings; a fuzz case is evaluated in
   memory.
6. **`fuzz/`'s only non-test caller was a test — CLOSED.** `campaign.ts` was driven by
   `corpus.test.ts`; it is now driven by `cli/src/commands/fuzz.ts`, and the deep campaign is in a
   user's hands rather than behind an environment variable set before a test run. Tracked as
   **C24**, closed by [§ D118](../DECISIONS.md). The command deliberately **cannot** set
   `PROPERTY_BOUNDS` and offers no fault-injection flag: `fuzz-1001074`'s lesson is that the cheap
   fix for a red property is to move a bound.

---

## Phase 9 — Experience layer

The layer that lets somebody who is not a lift engineer drive this simulator without being lied to.
Designed in [`docs/10`](10-experience-layer-contract.md); built, since wave 10, to the interface
handoff vendored at [`docs/design/`](design/), whose extracted requirements, audit and deviations
are [`docs/12`](12-design-handoff.md) ([§ D174](../DECISIONS.md)–[§ D179](../DECISIONS.md)). Nine
units, W1–W9, and **all nine are built** — the last open half, § 10.2's floor multi-select and
coverage matrix, landed with the access-zoning building editor ([§ D182](../DECISIONS.md)).

- W1 — close the honesty leak: no running mean on the header of a run the same run suppresses
- W2 — `VizSummary` widened to what the report sheet needs, now at `VIZ_SCHEMA_VERSION` 8
- W3 — a real replication batch in a worker, with the interval and no winner when it contains zero
- W4 — schema-generated dispatcher and traffic controls, proved against a schema this repo does not ship
- W5 — scenarios as data, and a seven-stage campaign judged on the shipped configuration's own scores
- W6 — the Casual/Engineer split, the live weight editor, and a **derived** mode-parity check
- W7a/W7b — per-floor rider queues, a building-mood gauge, and the access-credential lens
- W8 — access zoning in the building editor, and the dispatcher-compatibility warning
- W9 — every shipped goal carrying its measured across-seed pass rate

**Acceptance:** [§ D163](../DECISIONS.md), five clauses. Two are load-bearing because the product
**failed** them on the day the criterion was written — **(1)** the honesty property holds under
*search* rather than on hand-chosen examples, and **(2)** mode parity is *derived from the code*
rather than listed by hand. Three are standing requirements that *"can turn the phase red by
regressing, and cannot turn it green by having already been true"* — **(3)** every shipped goal
carries its measured pass rate, **(4)** every unit names its **non-test caller**, **(5)** the viewer
is **driven** for every acceptance claim, never read. § D163 also binds the shape of this section:
the row and the verdict **land together or neither does**, and **anything unbuilt at acceptance is
named in the verdict**.

> **This criterion was written after seven of the nine units existed, and that is its known
> weakness.** § D163 says so about itself and defends itself structurally rather than
> chronologically: a clause the product already satisfied would be a description, not a gate. A
> reader checking whether the gate was fitted to the work should check clauses 1 and 2 first — those
> are the two that were red when it was written — and should treat clause 4 as the one this verdict
> is weakest on. Its own list of what would make it a bad criterion is worth reading beside the
> table below.

**Status: ✅ ACCEPTED WITH NAMED GAPS (2026-07-30) — the two load-bearing clauses are met by a run
rather than by an argument, and the gaps below are part of the verdict rather than a footnote to
it.** The gate suites are `packages/viz/src/honesty/honesty.test.ts`,
`packages/viz/src/mode/parity.test.ts`, `packages/viz/src/scenario/goalRates.test.ts` and
`packages/viz/src/campaign/judge.test.ts`.

| clause | finding |
|---|---|
| **1 — the honesty property under *search*** | **MET, and met by a run.** The deep tier is green: **60 cases, 271 985 strings, 4 650 simulations, 43 of 60 runs suppressed, 23 surfaces, 398.7 s, 0 violations** (`ELEVATOR_SIM_HONESTY=deep`, `packages/viz/src/honesty/campaign.ts`). It **found two violations first** ([§ D186](../DECISIONS.md)) — one real, fixed at the cause, and one a false positive whose check was *accepting the other branch for the wrong reason*. **[§ D172](../DECISIONS.md) had asserted this tier clean on "the refinement relation, not a run"; running it said otherwise**, which is what the label on that claim was for |
| **2 — mode parity, derived** | **MET.** `packages/viz/src/mode/parity.ts` computes the failure/suppression set from the code — a discriminated union with an exhaustive switch, so a tenth failure state is a compile error rather than a silent omission — and is proved against a fail state the product deliberately does **not** ship (`packages/viz/src/mode/fictionalFailState.test-helper.ts`). `parityRefusal` runs in the shipped path, not only in the suite (`packages/viz/src/dev/main.ts`, `packages/viz/src/dev/campaignPanel.ts`). **Driven this session:** toggling Casual↔Engineer changes the rail's content and raises no refusal |
| **3 — every goal carries its measured pass rate** | **MET.** `packages/viz/src/scenario/goalRates.test.ts` re-derives the published counts from **both** disjoint seed sets in the always-on tier, and `docs/10` § M30's table is compared cell-by-cell **in both directions**, against `data/scenario-goals.json`. The surface half — the `goal-without-rate` property on the campaign judge — is deep-tier only, and is now green |
| **4 — every unit names its non-test caller** | **SATISFIED IN PROSE, MECHANISED BY NOTHING.** See below. This is the clause a future reader should distrust first *(as of the verdict date — mechanised in wave 12, [§ D192](../DECISIONS.md); see the dated note below the next paragraph. The verdict language stands as written)* |
| **5 — the viewer is driven, never read** | **MET, by driving.** There is **no browser automation in this repository** — no Playwright, no Puppeteer, no jsdom, and all four `vitest.config.ts` projects are `environment: 'node'` — and § D163 explicitly refuses *"a test that renders to a canvas mock and never opens a browser"* as a substitute. Discharged by driving the shipped page; one gap found by doing so, below |

**Clause 4 is the honest weak point, and the fix is a fifth copy of an audit this repository already
has four of.** All **19** directories under `packages/viz/src` sit outside every `AUDITED_MODULES`:
the four dead-code audits — `packages/core/src/dispatch/deadCode.test.ts`,
`packages/experiments/src/runner/deadCode.test.ts`,
`packages/experiments/src/tuning/deadCode.test.ts` and
`packages/experiments/src/fuzz/deadCode.test.ts` — cover **7 of 49** `packages/*/src` directories
(`dispatch/policies`, `dispatch/predictor`, `runner`, `fuzz`, `tuning/search`, `tuning/space`,
`tuning/report`), and **none of Phase 9's**.
The whole evidence for clause 4 is a hand-written table in `packages/viz/src/index.ts` plus
one prose `**Non-test caller:**` line per unit in `docs/10` § 11, **re-derived by nothing**. That
table is honest about itself — it lists the two rows whose entry reads *none* — but a hand-written
table is the defect [§ D152](../DECISIONS.md) closed one layer down and the standing requirement
above warns about in the same words: *a barrel re-export and a `{@link}` tag look exactly like a
caller and are not one*. Under § D163 this clause is a **standing requirement**, so it cannot green
the phase and it has not; the acceptance rests on clauses 1 and 2. It could still be false today
without anything going red, and the fix is a `deadCode.test.ts` under `packages/viz/src`.

> **The fix landed (2026-07-30, wave 12, [§ D192](../DECISIONS.md)) — recorded beside the gap
> rather than by rewriting it, and the verdict above is unchanged: the phase stays ACCEPTED WITH
> NAMED GAPS, and this gap is now closed.** `packages/viz/src/deadCode.test.ts` is the fifth copy of
> the audit: `AUDITED_MODULES` is derived from `readdirSync` and asserted in **both directions**, so
> all 19 `packages/viz/src` directories are covered and a twentieth turns the suite red; **1 017
> exports**, with the 25 zero-caller exports classified as 8 `DEAD_CANDIDATES` + 17
> `PUBLIC_API_ONLY`, both lists asserted in both directions plus disjointness. The hand-written
> table in `packages/viz/src/index.ts` is demoted to commentary. The mechanisation immediately
> out-performed the prose it replaces — it found **two docstrings naming callers that do not call**
> (`dev/viewerRunConfig`, `dev/PREFERRED_VIEWER_DISPATCHERS`) — and the 8 dead candidates await
> disposition as recorded follow-up work.

**What driving found, since clause 5 is the clause that is discharged by doing rather than
asserting.** At 1280–1440 px, on the shipped page: the tab arrow ring **skips all four hidden
contextual tabs and crosses into the nested `.tabs-right` div**, moving both selection and panel; a
deep link to a contextual tab works on a **cold** load, with exactly one focusable tab per tablist;
the mode toggle works in the shipped path rather than only in `packages/viz/src/mode/`; the drawer
opens on **one** press after crossing the 1340 px breakpoint **in both directions**, so the recorded
two-press bug does not reproduce; and [§ D159](../DECISIONS.md)'s access-compatibility warning is
live and correct on the right rail and **clears** when the dispatcher reads credentials. **One gap:
`Escape` does not dismiss the drawer**, which below 1340 px sits at `z-index: 20` over the stage and
can be closed only by its own toggle. It is in [`GAPS.md`](../GAPS.md) rather than in this verdict's
favour. *(Closed in wave 12, [§ D188](../DECISIONS.md): `escapeClosesDrawer` wired into
`wireKeyboard`, focus returned to the toggle, deliberately inert in column mode; the browser
re-drive is owed in the drive phase.)*

**Named limits on clause 1, in the same breath as the verdict.** The sweep's `mode` axis has **one
value** — it plugs in at a tuple in `packages/viz/src/honesty/types.ts`, and the corpus assertion
tightens automatically when it does. The three DOM panels are **statically swept rather than
driven**, so a sentence assembled at runtime there is invisible to the search. The access block's
labels, tooltips and legend, and the elevation express toggle's two strings, are **not seeded** into
`packages/viz/src/honesty/surfaces.ts` and are therefore outside R1–R13. Two rows with one cause:
`surfaces.ts` is a chokepoint every editor lane hits and no editor lane owns. All four are in
[`GAPS.md`](../GAPS.md). *(Wave 12, [§ D194](../DECISIONS.md): the `mode` axis now has two values —
and the second produced **zero new strings**, a measured null, because no shipped adapter branches
on case mode — and the express-toggle strings and the access block are seeded, as seeds rather than
`covers` entries because their producers are deliberately prose-free. The three DOM panels remain
statically swept — that limit stands.)*

**Named limits on clause 2.** Two of [§ D168](../DECISIONS.md)'s four are **closed** — Basic can now
shorten a suppression reason, because `core` carries the ground beside the prose
([§ D183](../DECISIONS.md)) and `VizSummary` transports it at schema 8
([§ D185](../DECISIONS.md)) — and two stand: the **structural-refusal reason is prose keyed on an id
the leg record does not carry**, so it cannot be joined to a leg, and thirteen warning rows on
Secure Tower is a wall that is deliberately **not** grouped, because parity requires each warning's
text in Basic and a summarising group is the first place one could go missing.

**Unbuilt at acceptance, which § D163 requires this verdict to name rather than absorb:** **U6**;
**U7's rider models**; and **Basic's curated three-dimension subset**, whose place is taken by the
campaign editor restricted to each stage's declared editable set, which is data. § 10.2's floor
multi-select and coverage matrix *were* on this list and are not any more — they landed this wave
([§ D182](../DECISIONS.md)), so **W8 and all nine units are built**, which is why this section says
*all nine* where the register said *eight and a half*. **Feature completeness was never the gate**,
and § D163 says why: a phase gate that requires every designed feature measures ambition rather than
quality. These three are named because the verdict is required to name them, not because they were
weighed against it.

**What this verdict does not say.** It does not say the experience layer is *good*: § D163 excludes
playability from the criterion as unfalsifiable, and puts [§ D161](../DECISIONS.md)'s uncomfortable
measured fact in its place — **four of seven campaign stages clear from the dispatcher dropdown
alone**. It does not say the honesty property holds; it says it held over 271 985 generated strings
on 23 seeded surfaces with one mode value, which is a bounded claim and is the strongest one this
apparatus can make. And it does not say clause 4 is true — only that nothing has shown it false,
which is exactly the distinction the standing requirement above exists to keep visible.

---

## Sequencing notes

- **Phases 0–3 are strictly sequential.** Phase 3 must land before any dispatcher
  comparison is reported, or the project will produce confident nonsense.
- **Phase 4 can run in parallel with Phase 3** once Phase 2 is complete.
- **Phase 5 dispatchers are parallelizable** among themselves once Phase 3 is done.
- **Phase 7 depends on Phase 3, not on Phase 5 or 6.** Once the scoring engine and the
  replication runner exist, tuning can proceed against whatever terms are implemented.
- Vertical City and double-deck are the most deferrable scope. The other four buildings
  cover most of the algorithmic ground.
- **6a before 6b, and both before 6c.** 6a needs no `core` change and ships two measured results;
  6b is strictly serial on `sim/simulation.ts` and needs a single named seam owner — four owners
  against one 2,765-line file is the Phase 5 configuration with a larger blast radius
  ([§ D28](../DECISIONS.md)). 6c needs its own acceptance question before it needs an implementation.

## What remains, as of 2026-07-30

> **Five rows of this table were stale when it was re-dated, and they are corrected below rather
> than deleted.** The table said Phase 6c was *deferred*, Phase 9 was *not built*,
> `packages/experiments` had *no browser export*, double-deck was *disclaimed on every run*, and
> fuzzy pattern switching was *read by nothing*. All five had been resolved by waves 6–9 and the
> table had not moved with them. It is dated, which is a partial defence and not a sufficient one: a
> dated register that contradicts the current tree is the same failure as an undated one, just
> harder to blame. The stale wording is quoted here so the correction is legible as a correction.

| Item | Where it is recorded |
|---|---|
| **The viewer is now built to a design handoff** | Not an open item — a change of source. *Elevator Sim Reimagined* is canonical for the interface ([§ D174](../DECISIONS.md)); the requirements, the gap analysis and the five deviations are [`docs/12`](12-design-handoff.md). **No phase verdict moved and no published number was recomputed**, which is the point rather than an aside: the sheet reads `VizSummary`, which reads `RunSummary`, which is the same object the CLI and the experiment matrix read. Board: [`WAVE10_PLAN.md`](../WAVE10_PLAN.md) |
| **Phase 6c — learned control** | § Phase 6c above. **No longer deferred: implemented, measured and NOT ACCEPTED**, the refusal broadened from one operating point to eight pre-registered cells and held ([§ D151](../DECISIONS.md) is the protocol; [§ D156](../DECISIONS.md) is the result) — **and the re-measurement on the mix-varying template is now run, under [§ D162](../DECISIONS.md)'s five conditions, and it refused a third time** (`benchmark/lunchTwoWaySelection.ts`; [§ D200](../DECISIONS.md) is the verdict): ΔTTD `−0.170 [−0.405, +0.064]` at n = 200 on the disjoint seed at `midtown-office`/`lunch-two-way` 1.5 %, below the cell's own TTD-measured limit, with the flat-mix negative control exposing the residual advantage as a static weight-vector hybrid rather than mix exploitation. The question § D156 left open is **closed, in the refusing direction**; what would move it now is a different selector, not a different measurement |
| **Phase 9 — the experience layer** | **No longer open: measured against [§ D163](../DECISIONS.md) and ACCEPTED WITH NAMED GAPS on 2026-07-30** — § Phase 9 above carries the verdict and the gaps, and the row and the verdict landed together as § D163 required. All nine units are built. What remains is not the phase: it is **U6**, **U7's rider models**, **Basic's curated three-dimension subset**, and clause 4 — *name the non-test caller* — which is **satisfied in prose and mechanised by nothing**, because no dead-code audit reaches `packages/viz` *(the clause-4 item closed later the same day: wave 12's `packages/viz/src/deadCode.test.ts` mechanises it, [§ D192](../DECISIONS.md) — verdict unchanged)* |
| ~~**Access-zoning editor controls**~~ **CLOSED** | [`docs/10`](10-experience-layer-contract.md) § 11 W8's open half — § 10.2's floor multi-select and coverage matrix — landed with the building editor's zoning round trip ([§ D182](../DECISIONS.md)). The dispatcher-compatibility warning had shipped ahead of it ([§ D159](../DECISIONS.md)) |
| **A zone cannot be changed mid-run** | Operational zoning is a shipped concept with no mechanism over time. Deliberately deferred: nothing measures it and no published result depends on it |
| **The Level-1 panel does not clear the Phase 6 gate on `mixed-use-high-rise`** | § *Phase 6 on the building the criterion names* above. A measured result, not a task — but it is what a reader planning 6c needs |
| **`garden-down-peak` is `destination-eta`'s remaining identity class at n = 51** | § *What the matrix found* above. It is blind to **`rideTime`**, not to the destination — and the distinction is measured, not argued ([§ D136](../DECISIONS.md)). `rideTime` separates the candidate cars in **1 of 1 727 contested decisions**, so a constant cannot move an argmin and no weight rescues it: 0.5, 1, 2 and 8 form one identity class, and sixteen times the shipped weight buys the same single flip. **The destination itself is not blind there**: `stopCount` separates the cars in **139** of those decisions — and pricing it is **WORSE** on AWT `+1.320 [+0.988, +1.653]`, WT95 `+4.060 [+2.899, +5.220]` and TTD `+1.419 [+1.067, +1.770]` at n = 200 at two seeds. So the open question is **answered, in the negative-for-the-operator direction**, and what remains open is the mechanism — *which* car the increment prefers and why it is worse placed — which is **unmeasured and not asserted**. The class is stated at n = 51 deliberately: it does not hold at n = 200 |
| **The editor's ⇧/⇩ buttons reorder the JSON declaration and not the building** | the retired T29 lane record § T29-4, and [§ D111](../DECISIONS.md). Relabelled honestly rather than repurposed; the scope call — give the declaration its own view, or drop `moveFloor` and let `index` be the only ordering control — is **handed back to the owner** |
| **No test asserts any phase's *status*** | [`docs/07` § 8](07-handoff.md). The guards assert the four documents **agree**, not that they are **true** |
| Open items C4, C5, C24, C27, C30, C32 | **All six closed** ([§ D116](../DECISIONS.md)–[§ D122](../DECISIONS.md), plus [§ D125](../DECISIONS.md)); **C33** and **C34** opened in their place, and five smaller findings besides. `C4` took **two** decisions — § D119 on the budget, § D125 on the port's disposition — and § D125 also added the **third dead-code guard**, over `runner/`, which neither `core`'s scanner nor `tuning/`'s could reach. Current list: [`docs/07`](07-handoff.md) § 8 § *Still open, in one place*. **C7 is closed** — see below |

### Since 2026-08-04 — the play experience, and what it found

**No phase verdict moved.** This is viewer and server work above the phases, and it is recorded here
for the reason the stale rows above are: a register that does not know what the tree contains is the
same failure as an undated one.

The contract is [`docs/16`](16-change-scope-contract.md) ([§ D216](../DECISIONS.md), dated before any
code), the audit is [`docs/17`](17-play-experience-audit.md), and the verdicts are
[§ D217](../DECISIONS.md) and [§ D219](../DECISIONS.md). **Five of the audit's seven findings are
closed.** What is worth a roadmap reader's attention is not the features but the three things
mounting them found, because each is this repository's standing defect in a new place:

- **`patternSwitching` had no writer at all.** The block is authored in `data/`, its ramps are
  calibrated against eight measured operating points, the loader carries it and `resolveWeightSets`
  resolves it — and **nothing in the viewer could change it**. That is the twelfth instance of the
  standing requirement's defect, and it would have shipped with five selects on top of it. Closed by
  `dispatcherProfilesWithSelector`, which is a caller rather than an allowlist entry.
- **Two of six selector sliders are inert at the cell the product opens on**, and the reason is the
  shipped calibration rather than the panel: Midtown's lobby rate is already past `up-peak`'s ramp,
  so *raising* the lobby gain saturates a membership already at 1. Each row names its own operating
  point in the test rather than the suite quietly moving to a cell where everything moves.
- **A `?? 0` in the leaderboard's submission** turned an unmeasured long-wait share into *zero per
  cent*, so the server — measuring `NaN` — would have refused an honest submission as a forgery.
  This product makes one accusation and it was pointed at a client fallback.

Also closed: two **unreachable** branches in the coach ribbon (`week.contractId === undefined` on a
field typed `string`, which TypeScript permits), `DayReportInput.event` having no reader while the
sheet named tomorrow's event and never today's, endless mode, the light palette reaching the stage,
and the whole menu finally being recorded as a deviation from a handoff that has no concept of it
([`docs/12`](12-design-handoff.md) § 4.8).

**All four designed modes are built** — incidents, calendar, the daily challenge and commissioning —
and each reaches a run through `shiftRunConfigOf` with a § D177 test on its own control. The saved
library survives a reload at schema version 2. `docs/17` § 5's ledger stands at **five of seven closed
outright**, with clause 2 settled by applying the handoff's own rule and clause 5 closed as a defect
while staying open as a mode.

**And the wave found the thing none of the checks above could see.** `dev/main.ts` ends with
`if (typeof document !== 'undefined') void main();`, so under vitest **`main()` had never run in this
repository's history**. A `let` declared below the `boot()` sequence that assigns it threw on boot's
second statement, and **2 100 tests were green over a dead page**. Fourth occurrence of that exact
mistake; two of the four are written up in prose in the file that carries them. It is now guarded
twice — a text assertion over `boot()`'s body, and a browser tier whose first test loads the page and
requires the stage to have been drawn ([§ D220](../DECISIONS.md), [§ D221](../DECISIONS.md)).

Still open and named: **Sandbox as a mode** — the defect is closed and the label is finally
printable and true, but whether it deserves a screen is undecided; **§ D220's document tier**, which
is what closes the rest of `UX.md` § 27's `⚠️ mount` marks; and — **not a defect, and named because it looked like one** — `midtown-office`'s
`rise-exceeds-class` advisory, 76.9 m against a reference rating of 76. `core` says in the warning
itself that the envelope is guidance rather than a limit, so the building is legal; what it cost is
that commissioning's diagnostic key had to include the **message** rather than only the code and
path, or commissioning that bank as a class rated for 18 m would have been forgiven as pre-existing.

**Closed since this table was last written:** **Phase 8's full experiment matrix and Pareto front at
a real budget, and with it Phase 7's acceptance interval at 50–200 replications** — both landed in
`f895a16`, and Phase 8 is accepted ([`DECISIONS.md` § D108](../DECISIONS.md)). Since then:
**`destination-eta`'s inert destination** ([§ D112](../DECISIONS.md)); **the ninth dead seam and the
whole `'no-intervals'` half of `benchmark/`** ([§ D114](../DECISIONS.md)); **C7**, the two holes in
`core`'s dead-code scanner, both watched failing before being closed and surfacing **no new dead
exports** ([§ D114](../DECISIONS.md)); and **the viewer and `elevator-sim watch` printing a
suppressed mean** ([§ D111](../DECISIONS.md)). Also
`fuzz-1000384` (§ Phase 8, finding 4), C2, C19, C20, C21, C22, C23, C26, C28, C29, C31. Each was
verified rather than taken on report; see [`docs/07`](07-handoff.md) § 8.
