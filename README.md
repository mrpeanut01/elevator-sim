# elevator-sim

A configurable elevator traffic simulator for designing and benchmarking **smart dispatch algorithms**.

Build a building — floors, elevator banks, security zones — generate realistic passenger
traffic, and race dispatch strategies against each other under statistically valid conditions.

## Why

Elevator group control is a genuinely hard scheduling problem: continuous state space,
partially observable, non-stationary demand, and hard physical constraints. It is also
one where the "obvious" improvements frequently fail to show up in the data — a faster
elevator can measurably *increase* average waiting time if the gain is smaller than the
statistical noise.

This project exists to make those comparisons rigorous.

## Goals

- **Configurable buildings** — arbitrary floors, multiple banks, service zones, access-control zones
- **Realistic physics** — S-curve motion profiles with acceleration and jerk limits, door timing, load weighing
- **Realistic traffic** — office / residential / hotel / mixed-use arrival profiles with peak templates
- **Pluggable dispatchers** — nearest-car, ETA, zoned, destination-dispatch, auction-based, learned
- **Statistically valid results** — multi-replication runs, common random numbers, sequential confidence-interval stopping

## Target smart behaviors

| Behavior | Where it lives |
|---|---|
| Predictive pre-positioning / parking | Group controller + learned arrival predictor |
| Hall-call bypass when car is full | Car load sensor → dispatcher reassignment |
| Parallel service of heavy floors | Group controller demand splitting |
| Dynamic zoning under up-peak | Group controller policy |
| Access-control-aware routing | Building ACL → dispatcher feasibility filter |

## Documentation

| Doc | Contents |
|---|---|
| [Project Brief](docs/00-project-brief.md) | Vision, scope, non-goals, success criteria |
| [Architecture](docs/01-architecture.md) | Three-layer design, core interfaces, DES kernel, determinism strategy |
| [Elevator Reference](docs/02-elevator-reference.md) | Elevator classes, speeds, capacities, door and motion timings |
| [Traffic & Statistics](docs/03-traffic-and-statistics.md) | Demand profiles, RTT math, replication methodology, CRN, stopping rules |
| [Test Buildings](docs/04-test-buildings.md) | Five reference buildings from low-rise to supertall |
| [Roadmap](docs/05-roadmap.md) | Phased development plan, with each phase's acceptance verdict and the measurements behind it |
| [Parameterization & Tuning](docs/06-parameterization-and-tuning.md) | How to tweak every model without recoding, and how to search for an optimum |
| [Handoff](docs/07-handoff.md) | Current state, measured facts that bound what you may claim, known-answer tests, open debt |
| [Review findings](docs/08-review-findings.md) | The whole-system review register, with each finding's disposition |
| [Destination dispatch contract](docs/09-destination-dispatch-contract.md) | Phase 6's locked interface contract, its measured comparison design, and the open questions that gate implementation |

Machine-readable configuration lives in [`data/`](data/).

## Status

**Phases 0–3, 5 and 7 are landed and accepted. Phase 4 is a foundation only. Phases 6 and 8 are not
started.** Four packages (`core`, `experiments`, `viz`, `cli`), 129 test files, 2,627 passing tests,
`tsc -b` clean.

| Phase | Status |
|---|---|
| 0 — Foundation | ✅ DES kernel, per-source RNG streams, config loading |
| 1 — Physics & model | ✅ S-curve motion, doors, load sensor, pure `estimateCost()` |
| 2 — Traffic & dispatch | ✅ Poisson batch arrivals, weighted-cost engine, RTT oracle |
| 3 — Experiment infra | ✅ Replication runner, CRN, sequential stopping, paired-t |
| 5 — Smart dispatch | ✅ Twelve cost terms, auction, predictor, benchmark suite |
| 7 — Automated tuning | ✅ Search space, three searches, held-out validation, `elevator-sim tune` |
| CLI | ✅ `list`, `run`, `compare`, `tune`, `watch` |
| 4 — Visualization | ⚠️ Foundation only — rendering contract, frame producer, replay harness, Canvas renderer, 85-scenario UX inventory. Building editor and live metrics overlay unbuilt |
| 6 — Destination dispatch & learned control | ⬜ Not started |
| 8 — Testing campaign | ⬜ Not started |

Try it:

```bash
npm install && npm run build
npm run sim -- list
npm run sim -- run --building garden-apartments --dispatcher eta --seed 42
npm run sim -- compare --building midtown-office --a eta --b nearest-car --reps 100
npm run sim -- tune --building garden-apartments --params idle.repositionThresholdS --seed 42
npm run sim -- watch --building garden-apartments --dispatcher nearest-car --speed 10
```

`compare` prints a paired-t interval on the difference and refuses to rank two arms whose interval
contains zero — that is the point of the project, not a nicety.

See the [Roadmap](docs/05-roadmap.md) for per-phase acceptance verdicts and the measurements behind
them, and the [Handoff brief](docs/07-handoff.md) for current state and open debt.

## License

MIT — see [LICENSE](LICENSE).
