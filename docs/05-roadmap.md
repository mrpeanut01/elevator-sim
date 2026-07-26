# Roadmap

Phased build sequence. Each phase has explicit acceptance criteria so work can be
parallelized and verified independently.

**Assumed stack:** TypeScript monorepo, headless `core` package plus separate `viz` and
`cli`. Node for batch experiments, browser for visualization, one shared simulation core.
This is a [documented assumption](00-project-brief.md#key-design-assumptions) and can be
revisited before Phase 0 starts.

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
