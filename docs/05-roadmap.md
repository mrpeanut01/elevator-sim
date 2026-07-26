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
the shipped path* — and it has now happened **four times**, all four in Phase 5, all four
simultaneously: `prepositionPlan`, `CapacityReassignmentMonitor`, `createAuctionPolicy` and the
whole arrival-model predictor were built correctly, exported, weighted by a shipped profile, and
called by nothing outside their own module.

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
- Sequential stopping rule: t-distribution for n ≤ 25, normal for n > 25, stop when
  half-width < acceptable range
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
     all 19 metrics, `rho = 1`, interval `[0, 0]`. This is the real determinism check. An
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

**Acceptance:** a stored run replays visually identically. Rendering is fully decoupled —
`core` builds and tests with `viz` absent.

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
in
`packages/experiments/src/benchmark/`, whose `index.ts` is the written report; every number below is
regenerated by `formatBenchmark(await runBenchmark())`.

| criterion | verdict |
|---|---|
| each dispatcher beats `nearest-car` with a paired-t interval excluding zero on at least one building | **MET** — 9 of 9 arms. One arm is also WORSE somewhere and is named below |
| pre-positioning shows measurable AWT improvement on Garden Apartments | **MET as written** — `zone-center` vs `stay` is **−4.88 s [−5.27, −4.49]** (−29.7 %) at n = 500 under CRN. **The *predictive* strategy does NOT clear it at the settings the library ships:** `predicted-demand` vs `stay` is **−0.006 s [−0.031, +0.019]**, a measured near-zero rather than an unresolved one. It reaches −0.98 s [−1.28, −0.68] only after `idle.repositionThresholdS` is retuned from 8 s to 3 s, and the profile is left as authored |

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
  appears at 8 %, where 56 of 60 replications have a diverging queue and no mean may be quoted. The
  −0.520 s [−1.029, −0.010] that switching the policy is worth at 3 % is *reassignment as a whole*,
  and it decomposes to `split-demand` widening an already-assigned landing 0.367 times per run and a
  car-to-car swap 0.017 times per run — none of it the capacity trigger. `core/src/sim/seam.test.ts`
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
  arrival the run had already produced** is **−0.0139 [−0.0315, +0.0036]** — zero, over replications
  rather than over queries. A forecast that leaked the trace would keep predictive power there.
- **`nearest-car` is too weak a baseline to separate anything.** Unchanged: it loses by 27–30 % on
  the up-peak buildings and is the only profile that saturates inside the measured budget, capping
  Midtown Office at **n = 287**. `zoned-uppeak` is now the only other arm that ever loses its AWT in
  1 000 replications, at index 683 on Secure Tower — above the 150 that case is measured at. The
  tail terms only earn their weights one load step *above* where the baseline stops being quotable:
  at 2 % with two entrances contending, `fairness-first` − `eta` is **−0.23 s AWT [−0.41, −0.05]**,
  **−1.58 s WT95** and **−1.94 s WT99**.

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

- `DestinationDispatcher` — destination known at call time; changes the passenger model
- Access-control integration, demonstrating that destination dispatch improves *because*
  authorization and optimization happen in the same step
- `LearnedDispatcher` — RL policy; accept component-level nondeterminism, keep the
  environment deterministic so variance is attributable to the policy
- Double-deck support and Vertical City (may be deferred)

**Acceptance:** a learned dispatcher beats the naive baselines on AWT and WT95 on the
Mixed-Use High-Rise, with paired-t intervals excluding zero.

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
- Fuzzy traffic-pattern detector with hysteresis, driving per-pattern weight sets

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
