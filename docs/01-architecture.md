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
| **Reproducible input streams** — same seed → same passenger list | **Keep.** Nearly free, and worth a 5–20× efficiency multiplier via CRN. |
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
desynchronized CRN and a 5–20× loss of statistical power per comparison.

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

```
packages/
├── core/                  — headless simulation, zero rendering coupling
│   ├── kernel/            — discrete-event queue, clock, RNG streams
│   ├── physics/           — S-curve motion profiles, door state machine
│   ├── model/             — Car, Bank, Building, Floor, Passenger
│   ├── dispatch/          — DispatchPolicy interface + implementations
│   ├── traffic/           — passenger generation, demand profiles
│   └── metrics/           — per-run recording, distributions
├── experiments/           — replication runner, CRN manager, statistics
│   ├── runner/            — parallel replication execution
│   ├── stats/             — CI, sequential stopping, paired-t
│   └── reports/           — result persistence and re-analysis
├── viz/                   — web visualization, consumes core
└── cli/                   — headless batch entry point
```

## Non-negotiable invariants

These exist to protect the statistics. Treat violations as bugs.

1. `Car.estimateCost()` is pure — no mutation of any simulation state.
2. No global RNG. Every random draw comes from a named stream on the injected `StreamSet`.
3. No wall-clock time in `core/`. All time comes from the kernel.
4. Event queue ties broken deterministically by sequence number.
5. Every persisted run record carries the seed that produced it.
6. `core/` has no dependency on `viz/`.
