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
- **Pluggable dispatchers** — nearest-car, ETA, zoned, auction-based and destination-dispatch, all
  as weight vectors in `data/`, not classes. A *learned* dispatcher is deferred scope, not shipped
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
| [Experience layer contract](docs/10-experience-layer-contract.md) | Phase 9's design: the rules that keep a gamified surface honest, novice/expert modes, a schema-generated dispatcher and traffic editor, and access-zone credentials |

Machine-readable configuration lives in [`data/`](data/).

## Status

**Phases 0–5 and 7 are landed and accepted. Phases 6 and 8 are partially complete** — see the table
for what that means for each; the two are partial for different reasons. Four packages (`core`,
`experiments`, `viz`, `cli`), a five-command CLI, **168 test files, 3,138 tests** (3,130 passing,
8 skipped), `tsc -b` clean.

| Phase | Status |
|---|---|
| 0 — Foundation | ✅ DES kernel, per-source RNG streams, config loading |
| 1 — Physics & model | ✅ S-curve motion, doors, load sensor, pure `estimateCost()` |
| 2 — Traffic & dispatch | ✅ Poisson batch arrivals, weighted-cost engine, RTT oracle |
| 3 — Experiment infra | ✅ Replication runner, CRN, sequential stopping, paired-t |
| 4 — Visualization | ✅ Viewer, building editor, live metrics overlay, playback from a stored seed, 87-scenario UX ledger |
| 5 — Smart dispatch | ✅ Twelve cost terms, auction, predictor, benchmark suite |
| 7 — Automated tuning | ✅ Search space, three searches, held-out validation, `elevator-sim tune` |
| CLI | ✅ `list`, `run`, `compare`, `tune`, `watch` |
| 6 — Destination dispatch & learned control | ⚠️ 6a (disclosure) and 6b (dispatch) accepted against a **raised** criterion, now measured on the Mixed-Use High-Rise the criterion names: **met by the Level-0 arm, not met by the Level-1 panel at any measured point**. 6c (learned control) deferred out of the phase with reasons; double-deck still not simulated |
| 8 — Testing campaign | ⚠️ Seven of eight tracks landed — fuzzing, oracle across all five buildings, physics, statistics, determinism, scale, adversarial — and found four real defects, **all four now fixed**; the deep tier is green at 2 000 cases. The eighth track, the full experiment matrix and Pareto front at a real budget, is not done, so the criterion (*every track lands, and no property violation is outstanding*) is not yet met |

Try it — five commands, all against the real `data/` directory:

```bash
npm install && npm run build
npm run sim -- list
npm run sim -- run --building garden-apartments --dispatcher eta --seed 42
npm run sim -- compare --building midtown-office --a eta --b nearest-car --reps 100
npm run sim -- tune --building garden-apartments --params idle.repositionThresholdS --seed 42
npm run sim -- watch --building garden-apartments --dispatcher nearest-car --speed 10
npm test        # 168 files, 3,138 tests, ~460 s — the benchmarks execute real replications
```

`compare` prints a paired-t interval on the difference and refuses to rank two arms whose interval
contains zero — that is the point of the project, not a nicety. It also **refuses to gate on AWT
across two passenger models**, moving its headline verdict to TTD and naming `core`'s own list of
the nine metrics that stop being comparable.

The browser viewer and building editor live in `packages/viz` and are dev-served with Vite;
`packages/core` exposes a `./browser` subpath so nothing pulls `node:fs` into a bundle.

See the [Roadmap](docs/05-roadmap.md) for per-phase acceptance verdicts and the measurements behind
them, and the [Handoff brief](docs/07-handoff.md) for current state and open debt.

## License

MIT — see [LICENSE](LICENSE).
