/**
 * `core/dispatch/policies` — aggregation, capacity migration, and pre-positioning.
 *
 * ```ts
 * import {
 *   createAuctionPolicy,
 *   CapacityReassignmentMonitor,
 *   POLICY_PARAMETERS,
 *   prepositionPlan,
 * } from '@elevator-sim/core';   // ← not yet: this barrel is not re-exported. See below.
 * ```
 *
 * **This barrel is not on the package surface yet.** `dispatch/index.ts` does not re-export it and
 * neither does `core/src/index.ts`, so nothing here — `createAuctionPolicy`,
 * {@link CapacityReassignmentMonitor}, {@link prepositionPlan}, {@link POLICY_PARAMETERS} — is
 * importable from `@elevator-sim/core` today. That matters most for the schema: a Phase 7 optimizer
 * reads `*_PARAMETERS` off the package, and one registry per module joined at the consumer is this
 * codebase's convention (`DISPATCH_PARAMETERS` defers `answer.bypassLoadThreshold` to
 * `LOAD_SENSOR_PARAMETERS` the same way), so `auction.rounds` is discoverable through
 * `AuctionDispatchPolicy.parameters` — which concatenates both registries and is asserted to — and
 * through `POLICY_PARAMETERS` **once this barrel is exported**. Both index files belong to the
 * verifier; the two lines they owe are `export * from './policies/index.js'` in `dispatch/index.ts`
 * and the matching explicit re-export block in `core/src/index.ts`.
 *
 * ## What is a policy and what is an architecture
 *
 * docs/01-architecture.md settles the project's central question — autonomous cars or central
 * control — by putting the seam where the industry puts it, and then insists that contract-net
 * bidding be built *alongside* the central scorer so the agent-autonomy hypothesis is
 * **benchmarked rather than assumed**. This directory is that construction, and its whole shape
 * follows from taking the word *policy* literally:
 *
 * | Module | Adds | Reuses unchanged |
 * |---|---|---|
 * | `auction.ts` | who aggregates the bids | the cost function, the term library, all seven stages |
 * | `capacity.ts` | the load-sensor edge that triggers stage 5 | the reassignment gate, the commitment latch, the hysteresis, the starvation guard |
 * | `zoning.ts` | operational zoning, the third kind | service and access zoning, which are not this |
 * | `prepositioning.ts` | a forecast and a zone for stage 7 | the reposition arithmetic and its two knobs |
 *
 * Four behaviours, **one new tunable pair** (`auction.*`). The other three add no parameter at all,
 * because they make declared parameters that were inert actually bite — `dispatch.reassignmentPolicy`
 * and its three companions for capacity migration, `idle.parkingStrategy`'s `zone-center` and
 * `predicted-demand` for stage 7. A behaviour that needed a new knob to work was not wired up; it
 * was reimplemented, and `parameters.ts` records that test.
 *
 * ## Nothing here reads a profile id
 *
 * CLAUDE.md invariant 7, and `policies.test.ts` proves it two ways: by grepping every source file
 * in this directory for a comparison against a profile id or a strategy name, and by rebuilding
 * every profile under a scrambled id and asserting no decision moves. Branching on
 * `auction.rounds` or `idle.parkingStrategy` is the *implementation* of a declared categorical or
 * integer tunable and is what every such parameter needs somewhere; branching on a profile's own
 * id is the failure the invariant names.
 *
 * ## Nothing in this directory is reachable from `runSimulation` yet
 *
 * State this first and plainly, because everything below is qualified by it. **All four behaviours
 * are proved at the decision level and none of them runs inside `runSimulation`.** The gaps are all
 * in `sim/`, `config/` — files this module does not own — and every one is additive. None is worked
 * around here, because working around it would mean a second implementation of a stage inside a
 * policy, which is the thing this directory exists not to be.
 *
 * | Behaviour | Reachable from a full run? | What it waits on |
 * |---|---|---|
 * | `auction.ts` | **no** | `SimulationConfig` has no policy hook (gap 2) |
 * | `capacity.ts` | **no** | `simulation.ts` contains no `reconsider` call site at all (gap 3) |
 * | `prepositioning.ts` | **no** | `Simulation.#park` builds its context inline (gap 4) |
 * | `zoning.ts` / `groupContext.ts` | **no** | `Simulation.#dispatchBank` passes `{waitingPassengers}` only (gap 5) |
 *
 * 1. **`config/schema.ts` has no `auction` section**, so `auction.rounds` and
 *    `auction.reserveMarginalDelayS` can only be set through {@link AuctionPolicyOptions} and a
 *    tuned winner cannot be persisted as a profile. The exact rows it owes are in `types.ts`
 *    § *Pending config surface*, next to the identical note `EligibilityStageConfig` carries.
 *    Consequence, and the reason it is listed first: a *profile* cannot declare an aggregation, so
 *    `data/dispatcher-profiles.json` ships **one** auction profile and both arms of the aggregation
 *    comparison are built from it. Two profiles would differ in stage settings and in nothing else.
 * 2. **`SimulationConfig` has no policy hook.** `Simulation` builds its group controllers with
 *    `createDispatchPolicy`, whose return type is `WeightedCostDispatchPolicy`, so an auction
 *    policy cannot be injected into a full run and the two aggregations cannot yet be compared
 *    with a paired-t interval on a real building. {@link AuctionDispatchPolicy} implements
 *    `DispatchPolicy` in full precisely so that the fix is one optional field:
 *
 *    ```ts
 *    // sim/types.ts, SimulationConfig
 *    readonly createPolicy?:
 *      | ((profile: DispatcherProfile, options: DispatchPolicyOptions) => DispatchPolicy)
 *      | undefined;
 *    // sim/simulation.ts, replacing the createDispatchPolicy call
 *    (config.createPolicy ?? createDispatchPolicy)(profile, config.dispatcherOptions ?? {})
 *    ```
 * 3. **{@link CapacityReassignmentMonitor} has no caller.** `simulation.ts` never calls
 *    `policy.reconsider`, so capacity-driven migration — stage 5's whole reason for existing, and
 *    the mechanism docs/06 § Stage 5 names as what makes capacity-aware bypass work — never fires
 *    in a run. One call site after the cars have loaded is the fix:
 *    `monitor.run(policy, snapshots, at)`, one monitor per bank, `reset()` per replication.
 * 4. **`Simulation.#park` builds its `RepositionContext` inline** from `{ entranceFloorIds }`, so
 *    `predicted-demand` answers `no-forecast` for every car of every run and `zone-center` sends a
 *    whole bank to one floor. Measured on `midtown-office` at `DISPATCH_DEFAULTS`, four cars from
 *    `G`: **all four move to floor `10`** through `#park`, against one target per band — `2 / 7 /
 *    12 / 17` — through {@link prepositionPlan}, three of them taken and the fourth inside its own
 *    deadband. The fix is `repositionContextFor(car, resolvePrepositionContext(snapshots, at,
 *    { entranceFloorIds, predictor }))`. Until it lands, no shipped profile declares `zone-center`
 *    — see the `zoned-uppeak` `$comment` in `data/dispatcher-profiles.json`.
 * 5. **`Simulation.#dispatchBank` passes `{ waitingPassengers }` only.** `DispatchContext` and
 *    `lifecycle.observationFor` *do* carry and forward `zoneFloorIdsByCarId` and `demandForecast`
 *    now, and {@link groupContext} produces exactly those two — measured live in
 *    `policies.test.ts`. But nothing in `sim/` calls it, so in a real run `zoneAffinity` and
 *    `predictedDemand` evaluate to zero for every car. The fix is one `groupContext(...)` per
 *    dispatch pass, shared across the calls in the pass.
 *
 * ## Phase 5 acceptance criteria: what is met and what is not
 *
 * docs/05-roadmap.md § Phase 5 asks for two things. Neither is claimed here.
 *
 * | Criterion | Status |
 * |---|---|
 * | *each dispatcher beats `nearest-car` with a paired-t interval excluding zero on at least one building* | **not established by this module.** It is a `runSimulation` measurement and belongs with the replication runner; nothing here reports an AWT interval |
 * | *pre-positioning shows measurable AWT improvement on Garden Apartments* | **unmet, and unwritable today** — gap 4. `prepositioning.test.ts` asserts the decision-level surrogate instead: on `garden-apartments`, a forecast turns `no-forecast` into a park with a 15.3 s per-call anticipated saving. That is a statement about stage 7's arithmetic, **not** an AWT interval, and it must not be reported as one |
 *
 * Phase 3 measured why the distinction matters: against a structurally different baseline the
 * smallest AWT difference detectable at n = 100 is ~8% of AWT, and ~12% at 80% power. A
 * decision-level saving is not evidence about that quantity in either direction.
 *
 * Names are re-exported explicitly rather than with `export *`, as elsewhere in this package, so
 * widening the public surface is a deliberate act and a future collision is a compile error here.
 */

/* -------------------------------------------------------------------------- *
 * Stage 4 — the aggregation
 * -------------------------------------------------------------------------- */

export {
  AuctionDispatchPolicy,
  bidsFrom,
  createAuctionPolicy,
  observedContext,
  resolveAuctionConfig,
  runAuction,
} from './auction.js';

export type { BidSource } from './auction.js';

/* -------------------------------------------------------------------------- *
 * Stage 5 — capacity-driven reassignment
 * -------------------------------------------------------------------------- */

export {
  CapacityReassignmentMonitor,
  consideredCalls,
  heldBy,
  loadCrossings,
  hasMigrations,
  peakReassignments,
} from './capacity.js';

export type { ReassignableGroup } from './capacity.js';

/* -------------------------------------------------------------------------- *
 * Stage 7 — pre-positioning and operational zoning
 * -------------------------------------------------------------------------- */

export {
  fixedForecast,
  movesOf,
  parkingFloorIds,
  prepositionPlan,
  repositionContextFor,
  resolvePrepositionContext,
} from './prepositioning.js';

export type { ParkableGroup, ResolvedPrepositionContext } from './prepositioning.js';

export { bandRange, contiguousZones, zoneAssignment, zoneFloorIdsFor } from './zoning.js';

/* -------------------------------------------------------------------------- *
 * Stage 3 — the facts only the group controller holds
 * -------------------------------------------------------------------------- */

export { groupContext, withLandingCounts } from './groupContext.js';

export type { GroupContextOptions, GroupObservationContext } from './groupContext.js';

/* -------------------------------------------------------------------------- *
 * Tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

export {
  MAX_AUCTION_ROUNDS,
  POLICY_DEFAULTS,
  POLICY_PARAMETERS,
  POLICY_PARAMETER_IDS,
  policyParameter,
} from './parameters.js';

/* -------------------------------------------------------------------------- *
 * Vocabulary
 * -------------------------------------------------------------------------- */

export { WITHDRAWAL_REASONS, carSnapshotsById } from './types.js';

export type {
  AuctionOutcome,
  AuctionPolicyOptions,
  AuctionProfileSource,
  AuctionStageConfig,
  Bid,
  CallContextSource,
  CallMigration,
  CapacityReassignmentResult,
  DemandForecastSource,
  LoadCrossing,
  OperationalZone,
  PrepositionContext,
  ResolvedAuctionConfig,
  ResolvedAuctionStage,
  Withdrawal,
  WithdrawalReason,
  ZoneAssignment,
} from './types.js';
