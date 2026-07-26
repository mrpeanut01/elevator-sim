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
| [Roadmap](docs/05-roadmap.md) | Phased development plan |

Machine-readable configuration lives in [`data/`](data/).

## Status

**Pre-implementation.** Research and architecture are captured; no code yet.
See the [Roadmap](docs/05-roadmap.md) for the build sequence.

## License

MIT — see [LICENSE](LICENSE).
