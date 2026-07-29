# CLAUDE.md

Instructions for agents working in this repository.

## What this project is

An elevator traffic simulator for designing and benchmarking smart dispatch algorithms.
Read [`docs/00-project-brief.md`](docs/00-project-brief.md) first, then
[`docs/01-architecture.md`](docs/01-architecture.md).

**Current status: Phases 0–5, 7 and 8 are landed and accepted, plus a six-command CLI. Phase 6 is
partially complete.** Read the two that need care precisely:

- **Phase 6** — 6a (destination *disclosure*) and 6b (destination *dispatch*) are accepted against a
  **raised** criterion, now measured on the building that criterion names ([§ D100](DECISIONS.md)).
  The gate is **met by the Level-0 arm and not by the Level-1 panel at any measured point** — say
  both. 6c (learned control) is **no longer deferred — it is implemented, measured, and NOT
  ACCEPTED**: ΔTTD `−0.213 [−0.440, +0.014]` against `collective` at n = 200 on a disjoint seed, an
  interval containing zero, unchanged at 24 and 64 search candidates ([§ D139](DECISIONS.md) is the
  criterion, dated before the code; [§ D145](DECISIONS.md) is the verdict). **That refusal is now
  swept over eight pre-registered operating points and it held** — NOT ACCEPTED at all five PRIMARY
  cells under Holm–Bonferroni, with the resolution limit measured on **TTD at each cell** rather
  than inherited, and two cells that clear the correction refused anyway because the effect is a
  third to a half of what the apparatus can resolve there ([§ D151](DECISIONS.md) is the protocol,
  dated before any sweep ΔTTD; [§ D152](DECISIONS.md) is the result). The one cell that clears every
  gate is a **secondary** one, and what its policy learned is a *busy/idle schedule* rather than a
  traffic-pattern selection — because the shipped demand template varies the **level** and never the
  **directional split**, which § D152 measures rather than asserts. Double-deck operation is
  **simulated** — paired stops, per-deck design load, deck-bound legs ([§ D131](DECISIONS.md)) — and
  the disclaimer survives only in the narrower case of a double-deck bank declaring no
  `servesFloorPairs`, which no shipped building raises.
- **Phase 8** — **both blocking property violations are closed**, and neither was closed by moving a
  bound: `fuzz-1001074` by a fourth `awtIsValid` ground, `fuzz-1000384` by revoking a promise a
  withdrawn car cannot keep. The deep tier is green at 2 000 cases. **All eight tracks have landed**;
  the eighth — the full experiment matrix and Pareto front at a real budget, which carries Phase 7's
  acceptance interval at 50–200 replications — landed in `f895a16`, so the phase's criterion (*every
  track lands, and no property violation is outstanding*) is met ([§ D108](DECISIONS.md); § D102 is
  the superseded partial verdict, left standing).

**No phase status has moved, and wave 6 is the reason that sentence is worth reading.** That wave
built double-deck simulation, a mid-run weight-set selector, Phase 7's undelivered fuzzy detector,
Phase 6c, and Phase 9's W4 — and **not one phase verdict changed**, because 6c did not clear the
criterion written before it ([§ D139](DECISIONS.md)) and Phase 6 is
therefore still partial. The fuzzy arm *did* return an interval excluding zero, ΔTTD
`−0.212 [−0.416, −0.007]`, and is still reported **below the resolution limit** — both arms sit in
the structural regime whose smallest detectable effect is 1.9 s, and an interval excluding zero is
not a win when the effect is smaller than the apparatus can resolve.

What has moved is what the phases are *true of*: `destination-eta` weights `rideTime` at **0.5**
([§ D112](DECISIONS.md)); the viewer and `elevator-sim watch` no longer print a mean the same run
says is suppressed ([§ D111](DECISIONS.md)); the ninth dead seam and the two holes in `core`'s
dead-code scanner are closed ([§ D114](DECISIONS.md)); and the eleventh dead seam — the whole deck
API — is closed by simulating it ([§ D131](DECISIONS.md)). None of that was allowed to round a
verdict up.

**Energy is an axis, never a score.** The matrix that closed Phase 8 measured `nearest-car` — the
weakest shipped dispatcher and the viewer's default — **on the Pareto front at six of eight cells**,
because it is best on energy and worst on wait. A dispatcher that drives less carries fewer people.
So the energy proxy may be shown **beside** AWT and WT95 and never aggregated into a grade, and
`EnergyStatistics.workPerServedLegKJ` goes beside the raw figure: a configuration that spends less
by serving fewer people has not saved anything. See [§ D106](DECISIONS.md).

[`docs/07-handoff.md`](docs/07-handoff.md) is the resume brief. Work proceeds by the phases
in [`docs/05-roadmap.md`](docs/05-roadmap.md), which carries each phase's acceptance verdict and the
measurements behind it. Read its **Standing requirement — the integration seam has an owner** before
planning work: a behaviour that is configurable, unit-tested in isolation and never called from a
shipped path passes every other check this repository runs, and has already shipped **ten** times in
code — plus, once, in `data/`. The instructive one is the sixth: the whole of `tuning/` was reachable
from nothing outside its own tests, the module said so in its own docstring, and the roadmap asserted
the phase green anyway. So the rule is not "is it reachable?" but **"name the non-test caller"**. A
barrel re-export and a `{@link}` tag look exactly like a caller and are not one.

**The eleventh is the most recent and the most instructive, and it is the one to read first.** The
whole deck API on `model/bank.ts` — `isDoubleDeck`, `deckAt`, `deckAssignmentFor`, `pairedFloorOf`,
`servesFloorPair` — had **no non-test caller anywhere in the tree**. Every reference outside its own
file was `bank.test.ts` or a barrel re-export. It is instructive because nothing about it looked
neglected: `vertical-city` had authored eight double-deck cars and four floor pairs since the
building was written, the config layer cross-validated them with four dedicated warning codes, and
`Bank` indexed the geometry correctly. **The configuration was right, the validation was right, and
nothing consulted either.** Closed by simulating it ([§ D131](DECISIONS.md)) — which is why the
count above moved from nine to ten in code, while *"the ninth dead seam"* elsewhere in these
documents still correctly names § D114's instance and must not be renumbered.

**The ninth, and the one in `data/`, are the next two worth reading.**
The ninth is `measureEnergyLiveness` — and it was not a one-off: `published.ts` splits `benchmark/`
into studies that publish an interval and studies classified `'no-intervals'`, the first half has
`regeneratePins.ts` as its driver, and the second half had **no driver at all**, so **all five** of
its members were dead by the same measure. `benchmark/livenessSuite.ts` is now that driver and
`src/index.test.ts`'s guard iterates the entry-point set **derived from the directory** rather than
five hand-written names. The one in `data/` is `destination-eta`: two authored fields, a schema-valid
profile, its own tests, and `weights.rideTime: 0` — so the destination reached `estimateCost` and
changed no decision, **bit-identical to `eta` at 8 of 8 matrix cells**. Invariant 7 makes strategy
data; it does not make data exempt. See [§ D112](DECISIONS.md) and [§ D114](DECISIONS.md).

**A stated mechanism goes stale the same way, and the correction is now pinned.** Seven places
in this repository asserted, as fact, that destination dispatch does better under access control
*because* authorization and optimization happen in the same step. Measured at n = 150 per building
under common random numbers, the difference-of-differences is `+0.982 s [+0.584, +1.380]` — it buys
*less* where access is controlled, and the saving is entirely in the credential. All seven are
corrected, and `packages/experiments/src/validation/documentation.test.ts` now asserts it three
ways: the claim may not appear without a refutation within 400 characters of it, the correction may
not be silently deleted, and `model/car/estimateCost.ts`'s exclusion — its sentence is *descriptive*
and true — is asserted in **both** directions. If you write a sentence about *why* something
performs better, either measure it or say it is unmeasured.

**A published number goes stale the same way.** Three figures in this repository did not reproduce
from the code that was supposed to produce them — one measured before a seam was wired and never
regenerated, two hand-transcribed through a double rounding — and no test noticed, because nothing
in the suite re-derived a published interval. If you publish a number, pin it to the run that
produced it.

## Non-negotiable invariants

These protect the statistical validity of every result the project produces. Treat
violations as bugs, and reject changes that introduce them.

1. **`Car.estimateCost()` is pure.** No mutation of any simulation state. The dispatcher
   calls it thousands of times per decision to evaluate hypotheticals.
2. **No global RNG.** Every random draw comes from a named stream on the injected
   `StreamSet`. A single shared RNG desynchronizes common random numbers and destroys
   comparison power — see [Architecture § Determinism](docs/01-architecture.md#determinism-strategy).
3. **No wall-clock time in `core/`.** All time comes from the kernel. No `Date.now()`,
   no `performance.now()`, no timers.
4. **Event queue ties break deterministically** by `(time, sequenceNumber)`. Never by
   insertion order into a hash structure.
5. **Every persisted run record carries its seed**, so any run replays exactly.
6. **`core/` never depends on `viz/`.** The core must build and test with `viz` absent.
7. **Anything tunable is data, not code.** Dispatch strategies are weight vectors in
   `data/dispatcher-profiles.json`, not classes. If you find yourself writing
   `if (strategy === 'nearest-car')`, stop — that belongs in config. Only a genuinely new
   *cost term* justifies new code. See
   [Parameterization & Tuning](docs/06-parameterization-and-tuning.md).
8. **Every tunable declares its schema** — type, range, default, and `activeWhen` for
   conditional parameters — so a generic optimizer can search the space without
   elevator-specific knowledge.

## Statistical discipline

The single most likely way this project fails is by reporting confident nonsense. The
literature documents the exact failure mode: *increasing lift speed appearing to increase
average waiting time*, because the real difference is smaller than the noise.

- **Never** declare one dispatcher better than another without a **paired-t confidence
  interval that excludes zero**.
- **Never** compare two separate confidence intervals and conclude from overlap. Overlapping
  intervals do not imply no significant difference.
- **Budget 50–200 replications** per configuration. Ten is not enough — it produced a 12%
  error against the converged mean in the reference study.
- Always feed **the same passenger traces** to every alternative under comparison (common
  random numbers). It is worth 5–20× in required run count.
- If a configuration saturates, **flag it and suppress the AWT interval**. Do not report a
  mean for a system whose queues grow without bound. **Saturation is one of four grounds**, not the
  whole rule: `awtIsValid` also fails on an empty window, on censoring above the unserved limit, and
  — since Phase 8 found a run publishing a mean beside a **922.7 s** wait — on a leg past the 900 s
  abandonment horizon. The trend test sees a queue still growing at the horizon and the censoring
  test sees one that has not cleared by it; **neither sees a queue that grew enormously and drained
  just in time.** See [`docs/03` § Saturation detection](docs/03-traffic-and-statistics.md).

Full detail in [`docs/03-traffic-and-statistics.md`](docs/03-traffic-and-statistics.md).

## Correctness oracle

Under pure up-peak, simulated interval and handling capacity must match the closed-form
Barney/CIBSE round-trip-time calculation within a few percent. Implement that calculation
as a test. If simulation and closed form diverge, assume the simulation is wrong until
proven otherwise.

## Modeling rules that are easy to get wrong

- **Cars fill to 80% of rated capacity, not 100%.** Using 1.0 makes everything
  systematically optimistic.
- **Model jerk and acceleration properly.** Short hops never reach rated speed. A simulator
  that ignores this will wrongly conclude faster elevators always help.
- **Passenger mass is a distribution, not a constant.** Otherwise the load sensor has
  nothing to measure.
- **Passengers arrive in batches**, not one at a time.
- **The three kinds of zoning are distinct concepts** — service (physical), access
  (credential), operational (dispatcher strategy). Never collapse them into one field.
- **Normalize cost terms before weighting.** Raw `waitTime` (0–120 s) and `stopCount`
  (0–20) on the same scale produce uninterpretable weights and an unsearchable space.

## Tuning discipline

- **Hold out traffic seeds.** Tune on one seed set, validate on a disjoint one, or you
  overfit the weight vector to specific passenger traces and the gain vanishes on new
  traffic.
- **Use common random numbers across candidates** within an optimization round.
- **Do not scalarize too early.** Report the Pareto front over (AWT, energy, WT95); the
  energy-versus-wait tradeoff is the operator's call, not a constant to bake in.
- **Tune per traffic pattern.** The optimum for up-peak is not the optimum for down-peak.

## Conventions

- TypeScript. Strict mode.
- Units are SI internally (metres, seconds, kilograms, m/s). Imperial values appear only
  in reference data and display formatting, always with the unit in the identifier
  (`ratedLoadLb`, `speedFpm`).
- Time is simulated seconds, a plain number, always sourced from the kernel.
- Prefer pure functions in `core/`. Side effects belong in the kernel and the runner.
- Tests colocate with source as `*.test.ts`.

## Reference data

- [`data/elevator-specs.json`](data/elevator-specs.json) — elevator classes, capacities, timings
- [`data/traffic-profiles.json`](data/traffic-profiles.json) — demand profiles by building type
- [`data/dispatcher-profiles.json`](data/dispatcher-profiles.json) — cost term library and dispatcher weight vectors
- [`data/buildings/`](data/buildings/) — test building configs; see its README for the schema

Reference values come from CIBSE Guide D, ISO 8100-32, and published lift-engineering
literature. Sources are cited at the bottom of each doc. If you change a reference value,
cite why.

## Working agreements

- Keep [`docs/05-roadmap.md`](docs/05-roadmap.md) phase status current as work lands.
- A phase is done when its stated acceptance criteria pass, not when the code exists.
- If you hit a decision the docs don't cover, record it in the relevant doc rather than
  only in a commit message.
- Do not weaken an acceptance criterion to make a phase pass. Raise it instead.
