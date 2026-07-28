# CLAUDE.md

Instructions for agents working in this repository.

## What this project is

An elevator traffic simulator for designing and benchmarking smart dispatch algorithms.
Read [`docs/00-project-brief.md`](docs/00-project-brief.md) first, then
[`docs/01-architecture.md`](docs/01-architecture.md).

**Current status: Phases 0–5 and 7 are landed and accepted, plus a five-command CLI. Phases 6 and 8
are partially complete.** Each of those two is partial for a different reason, so read them
precisely:

- **Phase 6** — 6a (destination *disclosure*) and 6b (destination *dispatch*) are accepted against a
  **raised** criterion, now measured on the building that criterion names ([§ D100](DECISIONS.md)).
  The gate is **met by the Level-0 arm and not by the Level-1 panel at any measured point** — say
  both. 6c (learned control) is deferred out of the phase with reasons, not dropped. Double-deck
  operation is configured, validated, disclaimed on every run — and not simulated.
- **Phase 8** — **both blocking property violations are closed**, and neither was closed by moving a
  bound: `fuzz-1001074` by a fourth `awtIsValid` ground, `fuzz-1000384` by revoking a promise a
  withdrawn car cannot keep. The deep tier is green at 2 000 cases. Seven of eight tracks have
  landed; the eighth — the full experiment matrix and Pareto front at a real budget, which carries
  Phase 7's acceptance interval at 50–200 replications — has not, so the phase's criterion (*every
  track lands, and no property violation is outstanding*) is not yet met
  ([§ D102](DECISIONS.md)).

[`docs/07-handoff.md`](docs/07-handoff.md) is the resume brief. Work proceeds by the phases
in [`docs/05-roadmap.md`](docs/05-roadmap.md), which carries each phase's acceptance verdict and the
measurements behind it. Read its **Standing requirement — the integration seam has an owner** before
planning work: a behaviour that is configurable, unit-tested in isolation and never called from a
shipped path passes every other check this repository runs, and has already shipped **eight** times.
The instructive one is the sixth: the whole of `tuning/` was reachable from nothing outside its own
tests, the module said so in its own docstring, and the roadmap asserted the phase green anyway. So
the rule is not "is it reachable?" but **"name the non-test caller"**. A barrel re-export and a
`{@link}` tag look exactly like a caller and are not one.

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
