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

Because the system learns the destination before boarding, a credential-aware dispatcher can
authorize and optimize in one step. That is a true statement about the code, and about the code
only — it does **not** follow that a conventional dispatcher cannot authorize, and the clause that
used to say so is withdrawn two paragraphs down.

> **The performance claim that used to be built on it is refuted, and this paragraph asserted it as
> fact.** It read *"destination dispatch is better under access control, because … authorize and
> optimize in the same step."* Measured at n = 150 per building under common random numbers, the
> difference-of-differences `Δ_secure − Δ_midtown` is **+1.020 s [+0.625, +1.414]**, excluding zero
> on the **positive** side: given the credential, pricing the destination buys *less* where access is
> controlled, not more. The run is `runAccessControlStudy({})` at seed 20 260 726, pinned in
> `benchmark/published.ts` as `difference-of-differences/absolute` and re-measured by
> [§ D280](../DECISIONS.md); the superseded **+0.982 s [+0.584, +1.380]** was produced on the tree
> that still carried [§ D254](../DECISIONS.md)'s pickup-access defect. Full result and the reason a
> single-building interval cannot settle it:
> [Roadmap § The access-control hypothesis](05-roadmap.md). Seven places asserted the old sentence
> and no test pinned any of them.

> **⚠️ The second half of that correction is itself withdrawn, and it is the more important half.**
> This box used to continue *"what the credential does buy is coverage — conventional dispatch
> cannot serve Secure Tower's interfloor traffic under any budget (0 of 30 replications quotable,
> 33.5 % unserved) … so the saving is real and it is a claim about **authorization**, not about
> **optimization**."* That was **H-ACCESS-1**, and it is **REFUTED** ([§ D256](../DECISIONS.md),
> [§ D279](../DECISIONS.md)): it was measuring the pickup-access defect, not a property of
> conventional dispatch. Re-measured, `eta` and `destination-eta-unpriced` are **bit-identical on 150
> of 150** `secure-tower` replications across all seven identity metrics, and every access-zoned
> building this project ships is served at 100 % delivery under conventional dispatch. The credential
> buys nothing there, so the saving is not in it. **Where the saving comes from is unmeasured.** What
> is measured is the negative — the same-step mechanism is not what produces it — and nothing here
> may be substituted for the missing positive account.

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
  batchSize: RNG;        // group size — consumed only under `trafficModel: 'v2'`
  patience: RNG;         // abandonment tolerance — consumed only when a run declares `sim.patience`
  modeChoice: RNG;       // stairs versus lift — consumed only for a journey offered a stairs mode
  dayVariation: RNG;     // the per-run day — consumed only when a run declares `demand.dayVariation`
}
```

**The last four are conditional, and every one of them is materialized and never consumed unless a
run asks for it** — which is what keeps every published figure reproducing byte for byte. Under the
default `trafficModel: 'v1'` the group-size draw stays on `arrivals`, exactly where it has always
been ([docs/14 § 1.3](14-building-behaviour-contract.md)); nobody abandons unless `sim.patience` is
declared ([§ 3.1](14-building-behaviour-contract.md)); no shipped building declares a stairs edge
([§ 3.3](14-building-behaviour-contract.md)); and a template is a copy of the average day unless
`demand.dayVariation` is declared ([§ 2.3](14-building-behaviour-contract.md)).

**This list was three streams stale when `dayVariation` was added, and the three that were missing
had all shipped.** `random/streams.ts` names this section as where its stream list comes from, so a
list here that is shorter than `STREAM_NAMES` is the *"a stated mechanism goes stale"* failure
`CLAUDE.md` describes, pointed at the invariant it is the reference for. Nothing mechanises the
agreement: `streams.test.ts` pins the names and their derived parameters, and no test reads this
file.

**`dayVariation` is the one whose placement is a statistical decision rather than a modelling one.**
It draws **before the trace exists** and multiplies the rate the trace is generated at, so two cells
that disagree about it see different people — which is why `runner/crn.ts`'s `traceKeyOf` carries it
while `patience`, drawn *after* the trace from a stream in the same demand-side set, is deliberately
left out.

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
│   ├── benchmark/         — Phase 5's report and studies, and Phase 8's full experiment matrix
│   ├── tuning/            — Phase 7: automated search over the parameter space
│   │   ├── space/         — the self-describing search space, sampling, encoding
│   │   ├── search/        — random search, successive halving, sep-CMA-ES, the objective
│   │   └── report/        — Pareto fronts, the held-out validation round
│   ├── teaching/          — docs/14 § 4.2: the declared training configuration, and the round that judges a policy on traffic it has never seen
│   ├── fuzz/              — Phase 8: randomized buildings, the six properties, shrinking
│   └── validation/        — the Phase 3 acceptance gate
├── viz/                   — web visualization, consumes core                    (Phase 4 complete)
│   ├── access/            — access zoning made visible: the credential lens, the locked-out landing, the dispatcher compatibility check
│   ├── contract/          — the recording schema and its folded series
│   ├── record/            — instrumenting a run into a VizRecording, and the dispatch decisions behind it
│   ├── frame/             — the deterministic frame producer
│   ├── live/              — what the rails read at the playhead: wait bands, observations, the phase timeline, the decision rows, the honesty card
│   ├── shift/             — the shift layer: the five scenarios, the day's event, its goals, tenant growth, the week, the day report
│   ├── authoring/         — the four editors' models: a slider-shaped spec, and the real configuration object it becomes
│   ├── playback/          — the playback clock and its mapping
│   ├── render/            — layout and the minimal Canvas renderer
│   ├── replay/            — the replay harness and its per-field negative control
│   ├── editor/            — building-config edits, validation, history, preview geometry
│   ├── controls/          — the schema-generated parameter form: four control renderers
│   ├── batch/             — Phase 9 W3: N paired replications, and the paired-t report on them
│   ├── scenario/          — Phase 9 W9: goal predicates, their measured across-seed pass rates
│   ├── campaign/          — Phase 9 W5: the scenario schema, the seven stages, the four fail states
│   ├── honesty/           — Phase 9 § D163 clause 1: the generated search over every player-facing string
│   ├── mode/              — Phase 9 W6: Basic and Advanced, and the derived mode-parity check
│   ├── menu/              — § D214: the shell's screens, settings, and the free-play selection
│   ├── scope/             — § D216: what a control may move and when, derived from the state's own keys
│   ├── playthrough/       — § D217: the walk over the menu graph — every screen, every affordance
│   ├── persist/          — § D217: the session a reload survives — the week, the settings, the selection
│   ├── commissioning/    — § D219: the pre-week design phase — shafts, machine classes and rated speeds under a declared capital constraint, put back through the loader; retrofit is the constraint whose editable set is empty
│   └── dev/               — the Vite dev entry points, viewer and editor (dev-only)
├── server/                — § D214: accounts, email confirmation, and a verified leaderboard
│   ├── accounts/          — password hashing, signed confirmation tokens, session tokens
│   ├── mail/              — the one-method Mailer, and the dev driver that writes an outbox
│   ├── leaderboard/       — the submission shape, its board hash, and verification by replay
│   ├── challenge/        — § D218: the weekly fixed-seed challenge, scored over a seed set
│   ├── store/             — the SQLite schema: users, sessions, entries; the clock is injected
│   └── http/              — the API as a pure request→response function, and the socket above it
└── cli/                   — headless batch entry point
    └── commands/          — list, run, compare, tune, watch
```

> **Layout note — `server/` is the only package allowed a socket, a database and a wall clock.**
> Invariant 3 forbids `core/` all three and invariant 6 forbids `core → viz`; nothing forbids
> `server → core`, and the leaderboard depends on it completely. Verification re-runs a submitted
> seed through the same kernel every study drives (§ D214 § 3), so the guarantee that makes the
> board trustworthy is the one invariant 5 already provides: *every persisted run record carries
> its seed, so any run replays exactly.*

> **Layout note — `viz/editor/` exists, and the reason it took two attempts is worth keeping.**
> `packages/core/src/sim/moduleTree.test.ts` compares this tree against the directories under
> `packages/*/src` **in both directions**, so a directory and its line here are a single atomic
> change: add the line first and it is a phantom that reddens the **core** suite; move the files
> first and the tree is incomplete. The editor's four pure modules — `editorEdits.ts`,
> `editorValidate.ts`, `editorHistory.ts`, `editorPreview.ts` — were flat files at
> `packages/viz/src/` for exactly that reason ([`DECISIONS.md` § D65](../DECISIONS.md), § D93): the
> task that wrote them did not own `docs/`. They **moved into `packages/viz/src/editor/` with the
> line above added in the same commit** (`f3fd3da`), which is what the guard requires. **C29 is
> closed.** The next person to move a directory here needs to do the same thing.
>
> **And the next person did.** `viz/controls/` — W4's schema-generated parameter form
> ([`docs/10`](10-experience-layer-contract.md) § 11, [`DECISIONS.md` § D127](../DECISIONS.md)) —
> was added on 2026-07-28 with its line above **in the same change**, because the guard reddened
> `core` the moment the directory existed and before anything else was run. The lane that added it
> had been told not to edit `docs/` outside its own document; it edited this one line anyway and
> said so, because the alternative was either a red suite or flattening a directory the wave plan
> names by path. **The atomicity is the rule, and it is stronger than a file-ownership boundary.**
>
> **And so did the one after.** `viz/batch/` — W3's replication batch runner
> ([`docs/10`](10-experience-layer-contract.md) § 11, [`DECISIONS.md` § D158](../DECISIONS.md)) —
> was added on 2026-07-29 with its line above in the same commit, for the same reason and by the
> same rule.
>
> **And the one after that.** `viz/scenario/` — W9's goal pass-rate measurement
> ([`docs/10`](10-experience-layer-contract.md) § 11 W9) — was added on 2026-07-29 the same way,
> and the guard reddened `core` first, exactly as this note predicts it will.
>
> **And so did W5.** `viz/campaign/` — the scenario schema, § 5.4's seven stages and § 5.3's four
> fail states ([`docs/10`](10-experience-layer-contract.md) § 5) — was added on 2026-07-29 with its
> line above in the same commit. The prediction held for the fourth time running: the `core` suite
> reddened on the directory before a single `viz` test was written.
>
> **And so did W6, for the fifth time.** `viz/mode/` — § 4's Basic/Advanced split and the parity
> check [`DECISIONS.md` § D163](../DECISIONS.md) clause 2 measures Phase 9 against — was added on
> 2026-07-29 with its line above in the same commit. The prediction held again, and the sequence is
> now long enough to be a procedure rather than an anecdote: **write the directory, watch `core` go
> red, add the line.**
>
> **Sixth, and it reddened on the same run as `viz/boundaries.test.ts`.** `viz/honesty/` — the
> generated search that [`DECISIONS.md` § D163](../DECISIONS.md) clause 1 requires over every
> player-facing string — was added on 2026-07-29, and the first full-suite run after it reddened
> **two** guards at once, neither of them in `viz/honesty/`: this one, for the undocumented
> directory, and the DOM rule in `viz/boundaries.test.ts`, for a local variable named `window`
> inside a text-proximity helper. The second is the more instructive: that rule's own docstring
> says the finding it was written for was *"a method parameter named `document` shadowing the
> global"*, and it caught the same shape again in a directory whose whole purpose is catching
> things.
>
> **Both paragraphs above sat behind literal conflict markers on `main` for two weeks, and the
> ordinal is why.** `<<<<<<< HEAD` / `=======` / `>>>>>>> feat/t78-honesty-search` were committed
> unresolved: two lanes each added a directory on 2026-07-29 and each correctly called its own the
> **fifth**, so the merge had no textual winner and neither half was wrong about its own subject.
> Resolved here by asking git rather than by choosing a side — `viz/mode/` landed in `16268b3` at
> 12:47 and `viz/honesty/` in `6e56a5b` at 13:40, so the order is *mode, then honesty*, and both
> notes are kept. It is the same lesson this file keeps recording one level up: **a running total
> is a shared resource, and two lanes incrementing it in parallel is the collision, not the
> tie-break.** The tree itself was never wrong — `moduleTree.test.ts` compares it against disk in
> both directions and stayed green throughout, which is exactly why nothing noticed for two weeks:
> the guard watches the list, and this was the prose beside it.
>
> **The guard is now scoped to packages present on disk, and C28 is closed.** It used to name
> `viz/*` directories unconditionally, so deleting `packages/viz` turned them into phantoms and
> reddened `core` — a *documentation* coupling rather than an import, so invariant 6 always held,
> but a reviewer checking its strong form hit it and could reasonably read it as a violation.
> `moduleTree.test.ts` now filters its directory set to workspace members that are installed, and
> asserts `core`'s own presence so the scope cannot degrade into "skip everything". Verified against
> the strong form rather than argued: with `packages/viz` deleted and deregistered in a scratch
> copy, `tsc -b` is clean and `core` passes 77 files / 1 832 tests — while the **pre-fix** guard
> reddens on the same copy. C28 was real. See [`DECISIONS.md` § D104](../DECISIONS.md).

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
