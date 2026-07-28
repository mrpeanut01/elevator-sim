# Architecture

## The central question, and the answer

Should each elevator be an autonomous entity that interfaces with the building, or should
the building directly control the bank of elevators?

**Neither, and the industry already settled where the seam goes.** Real elevator systems
are three layers:

| Layer | Owns | Centralized? |
|---|---|---|
| **Car controller** (one per car) | Motion profile, door state machine, leveling, load weighing, safety interlocks, service mode | Never — hard real-time, per-car |
| **Group controller** (one per bank) | Hall call allocation, pre-positioning, parking, zoning strategy | Always — it *is* the optimization |
| **Building systems** | Access control, fire recall, BMS, traffic generation | Separate concern |

The car is an entity that owns **physics and safety**. The group controller owns
**allocation**. Both, not either.

```
Building  →  topology, floors, zones, ACL, traffic generator
   └─ Bank  →  GroupController (pluggable policy) + [Car, Car, Car...]
                  └─ Car  →  kinematics, doors, car calls, load sensor, service mode
```

## The interface that decides everything

The single most important design decision is that the car exposes a **side-effect-free
cost query**:

```ts
interface Car {
  /** Pure. No mutation. Safe to call thousands of times per decision. */
  estimateCost(request: HallCall): CostEstimate;
}

interface CostEstimate {
  feasible: boolean;          // service zoning — can this car reach that floor at all?
  etaSeconds: number;         // when this car would arrive
  marginalDelaySeconds: number; // added delay imposed on already-committed passengers
  resultingLoadFactor: number;  // projected occupancy if this call is served
}
```

Because it is pure, the dispatcher can evaluate hypotheticals exhaustively without
committing to any of them. Every smart behavior in this project is downstream of that one
method. Get it right first.

## Why not pure agent-per-elevator

It is an appealing model and it fails on precisely the features this project targets:

1. **Pre-positioning is inherently global.** A car cannot decide to park at floor 20
   without knowing where every other car is. Pure agents force broadcasting full world
   state to every agent — centralization with a message bus bolted on, strictly worse.
2. **Capacity-driven bypass requires reassignment.** When the load sensor reports full,
   that car's committed hall calls must migrate elsewhere. Agent-owned calls mean a car
   must *hand back* work, producing re-auction storms and genuine starvation cases.
3. **Parallel service needs a splitter.** "Send two cars to floor 12 because thirty people
   are waiting" is a decision no individual car can make.
4. **It desynchronizes common random numbers.** See [Determinism](#determinism-strategy)
   — this costs real statistical power, not just purity.

Reasons 1–3 are information-theoretic and algorithmic. They do not go away by changing the
execution model.

## Why not pure central control

1. Elevator *hardware* (speed, jerk, door timing, capacity) must be swappable
   independently of dispatch *policy*. A monolith couples them.
2. Load is genuinely local state — the car measures it, the dispatcher subscribes.
3. Degraded modes (out of service, fire recall Phase I/II, independent service, door
   obstruction) are natural as car-owned state machines and miserable as central flags.
4. Kinematics can't be unit-tested without booting a dispatcher.

## The resolution: auction dispatch is a *policy*, not an architecture

Contract-net bidding among cars is a legitimate research approach. Build it as
`AuctionDispatcher` alongside the others. Then the agent-autonomy hypothesis becomes
something you **benchmark** rather than something the codebase is betting on.

```
DispatchPolicy (interface)
├── NearestCarDispatcher      — naive baseline
├── CollectiveDispatcher      — conventional up/down collective
├── ETADispatcher             — estimated-time-of-arrival minimization
├── ZonedDispatcher           — static/dynamic floor partitioning
├── AuctionDispatcher         — contract-net bidding among cars
├── DestinationDispatcher     — destination known at call time (v2)
└── LearnedDispatcher         — RL policy (v3)
```

## Security zones are three different things

Conflating these is the classic modeling mistake. They must remain separate concepts:

| Concept | Meaning | Lives on | Behaves as |
|---|---|---|---|
| **Service zoning** | Which floors the shaft physically opens onto (low-rise 1–20, high-rise express 1 → 21–40) | Car / Bank | Hard feasibility filter |
| **Access zoning** | Which floors a given credential may reach | Passenger × Floor | Request validation |
| **Operational zoning** | Dynamic floor partitioning among cars during up-peak | Dispatcher policy | Tunable strategy |

Worth reproducing as a result: destination dispatch is *better* under access control,
because the system learns the destination before boarding and can authorize and optimize
in the same step.

## Simulation kernel

**Discrete-event, not fixed-timestep.**

The statistics require thousands of replications (see
[Traffic & Statistics](03-traffic-and-statistics.md)). A two-hour simulation at 100 ms
ticks is 72,000 iterations; across 20,000 runs that is ~1.4 billion steps. A discrete-event
kernel jumps event-to-event and cuts that by roughly two orders of magnitude.

```ts
interface SimKernel {
  now(): number;                              // simulated seconds
  schedule(at: number, event: SimEvent): void;
  run(until: number): void;
}
```

**Visualization is not compromised by this.** The car exposes its motion profile so the
renderer can interpolate position between events:

```ts
interface Car {
  /** Analytic position from the current S-curve motion profile. */
  positionAt(t: number): number;
}
```

The renderer samples `positionAt()` at display framerate; the kernel only schedules
meaningful events (arrival, door open complete, door close complete, call assigned).
One kernel serves both smooth visualization and fast headless sweeps.

Event ordering must break ties deterministically: sort by `(time, sequenceNumber)`, never
by insertion order into a hash structure.

## Determinism strategy

Three distinct kinds of determinism, routinely conflated:

| Kind | Decision |
|---|---|
| **Stochastic model** — passenger arrivals are random | **Required.** A single run measures one arbitrary scenario. |
| **Reproducible input streams** — same seed → same passenger list | **Keep.** Nearly free, and worth up to a 300×+ efficiency multiplier via CRN between closely related alternatives — though only ~1.8× between structurally different dispatchers. See the measured table below. |
| **Deterministic execution order** — no async agent races | **Keep.** Buys almost nothing to relax; costs replayability. |

### Dedicated random streams per source

Standard DES practice. **One independent RNG stream per stochastic source, never one
global RNG:**

```ts
interface StreamSet {
  arrivals: RNG;         // passenger arrival times
  origins: RNG;          // origin floor selection
  destinations: RNG;     // destination floor selection
  passengerMass: RNG;    // body weight, drives the load sensor
  doorObstruction: RNG;  // door reopen events
  policyNoise: RNG;      // stochastic dispatcher exploration
}
```

This matters more than it looks. With a single global RNG, if dispatcher B causes one
extra door reopen, **every subsequent draw shifts** and the two runs diverge into entirely
different passenger populations — common random numbers are destroyed. With per-source
streams, the arrival stream emits an identical passenger list regardless of what the
elevators do.

That is also the precise cost of execution-order nondeterminism: not impurity, but
desynchronized CRN and a large loss of statistical power per comparison.

**Measured, and the size of the prize is regime-dependent.** The Phase 3 gate measured what
per-source streams are actually worth on Midtown Office up-peak at n = 100, varying only how
similar the two dispatchers are:

| Comparison | rho | Variance reduction | Fewer runs |
|---|---|---|---|
| One weight nudged (Phase 7's neighbourhood) | 0.9969 | 99.69% | 324× |
| Halfway between two dispatchers | 0.9027 | 89.77% | 9.8× |
| `eta` vs `nearest-car` (Phase 5's comparison) | 0.6083 | 43.75% | 1.8× |

Two things follow for this document's argument. First, the determinism decisions above are
*more* justified than the original 5–20× estimate suggested, not less: in the regime an
automated tuner works in, synchronized streams are worth two orders of magnitude. Second, the
bottom row's ceiling is set by unequal marginal variances rather than by synchronization —
`eta` and `nearest-car` have variances of 12.56 s² and 69.76 s², so `(sd_A − sd_B)²` caps that
comparison at 71.92% however perfect the streams are. Byte-identical trace digests confirmed
the streams were never the problem there. Full derivation and the practical budgeting rule in
[Traffic & Statistics § Part 4](03-traffic-and-statistics.md#measured-the-reduction-depends-entirely-on-how-similar-the-two-arms-are).

### Parallelism

**Parallelize at the replication level, keep each replication internally deterministic.**
N replications on N cores scales linearly, preserves full CRN, keeps bugs replayable, and
keeps regression tests meaningful. Nondeterminism *inside* a run buys nothing that running
more runs concurrently doesn't buy more cheaply.

The one legitimate exception is a learned policy with sampled actions or GPU float
nondeterminism. Accept that *that component* is nondeterministic, seed what can be seeded,
and lean on replication count. Keep the environment deterministic so variance is
attributable to the policy rather than to the world.

## Module layout

**As built through Phase 7, plus Phase 4's foundation.** This tree is normative, not historical: the
roadmap's Standing Requirement demands that a phase plan *"name an owner for every file a new
behaviour must be called from"*, and it cannot be used that way if it is stale. It was scoped "as
built through Phase 3" for two phases too long, omitting every directory Phases 5 and 7 added
([review finding #15](08-review-findings.md)); `packages/core/src/sim/moduleTree.test.ts` now fails
if a source directory exists that this block does not list, or vice versa.

```
packages/
├── core/                  — headless simulation, zero rendering coupling
│   ├── kernel/            — discrete-event queue, clock, deterministic tie-breaking
│   ├── random/            — RNG and the per-source StreamSet
│   ├── physics/           — S-curve motion profiles (motion/), door state machine (doors/)
│   │   ├── motion/        — jerk-limited S-curve profiles, travel time
│   │   └── doors/         — door state machine, reopen causes, dwell
│   ├── model/             — Bank, Building, Floor, Passenger
│   │   └── car/           — Car, its shaft, the load sensor, estimateCost
│   ├── dispatch/          — DispatchPolicy, scoring engine, parameter schemas
│   │   ├── terms/         — the cost term library
│   │   ├── policies/      — Phase 5: zoning, pre-positioning, capacity reassignment, auction
│   │   └── predictor/     — Phase 5: the per-floor per-bucket arrival model
│   ├── traffic/           — passenger generation, demand profiles, routing
│   ├── analytical/        — closed-form Barney/CIBSE RTT, the correctness oracle
│   ├── config/            — data/*.json loading, schema, floorRange expansion
│   ├── sim/               — the assembled simulation and its end-to-end suites
│   └── metrics/           — per-run recording, distributions, saturation
├── experiments/           — replication runner, CRN manager, statistics
│   ├── runner/            — parallel replication execution, CRN, sequential stopping
│   ├── reports/           — persistence, replay, re-analysis, and the interval arithmetic
│   ├── oracle/            — closed-form against measured round trip, reconciled term by term
│   ├── benchmark/         — Phase 5: the written report and the studies behind it
│   ├── tuning/            — Phase 7: automated search over the parameter space
│   │   ├── space/         — the self-describing search space, sampling, encoding
│   │   ├── search/        — random search, successive halving, sep-CMA-ES, the objective
│   │   └── report/        — Pareto fronts, the held-out validation round
│   └── validation/        — the Phase 3 acceptance gate
├── viz/                   — web visualization, consumes core          (Phase 4 foundation only)
│   ├── contract/          — the recording schema and its folded series
│   ├── record/            — instrumenting a run into a VizRecording
│   ├── frame/             — the deterministic frame producer
│   ├── playback/          — the playback clock and its mapping
│   ├── render/            — layout and the minimal Canvas renderer
│   ├── replay/            — the replay harness and its per-field negative control
│   └── dev/               — the Vite dev entry point (dev-only)
└── cli/                   — headless batch entry point
    └── commands/          — list, run, compare, tune, watch
```

> **Layout note — `experiments/stats/` does not exist.** This doc previously placed the
> statistics layer at `packages/experiments/src/stats/`. Phase 3 landed that code in
> **`reports/statistics.ts`** (sample moments, t and normal quantiles, `estimateMean`,
> `pairedDifferenceEstimate`) and **`runner/stopping.ts`** (the sequential half-width rule);
> no `stats/` directory was ever created. The package boundary is where the original intent is
> honoured: `packages/experiments/src/index.ts` exports the statistical surface under its own
> `stats` heading, so a caller imports the names the design promised regardless of which file
> they come from. **Consolidating them into a `stats/` module is outstanding, not done.** Doing
> it would change which file the names come from and not one name a caller imports.

## Non-negotiable invariants

These exist to protect the statistics. Treat violations as bugs.

1. `Car.estimateCost()` is pure — no mutation of any simulation state.
2. No global RNG. Every random draw comes from a named stream on the injected `StreamSet`.
3. No wall-clock time in `core/`. All time comes from the kernel.
4. Event queue ties broken deterministically by sequence number.
5. Every persisted run record carries the seed that produced it.
6. `core/` has no dependency on `viz/`.
