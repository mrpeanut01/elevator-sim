/**
 * `core/dispatch/policies` — aggregation, capacity migration, and pre-positioning.
 *
 * ```ts
 * import {
 *   createAuctionPolicy,
 *   CapacityReassignmentMonitor,
 *   POLICY_PARAMETERS,
 *   prepositionPlan,
 * } from '@elevator-sim/core';
 * ```
 *
 * On the package surface: `dispatch/index.ts` and `core/src/index.ts` both re-export this barrel
 * explicitly. That matters most for the schema — a Phase 7 optimizer reads `*_PARAMETERS` off the
 * package, and one registry per module joined at the consumer is this codebase's convention
 * (`DISPATCH_PARAMETERS` defers `answer.bypassLoadThreshold` to `LOAD_SENSOR_PARAMETERS` the same
 * way), so `auction.*` is discoverable through {@link POLICY_PARAMETERS} and through
 * `AuctionDispatchPolicy.parameters`, which concatenates both registries and is asserted to.
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
 * Four behaviours, **one new tunable section** (`auction.*`: the aggregation selector and the two
 * knobs the decentralized one adds). The other three add no parameter at all, because they make
 * declared parameters that were inert actually bite — `dispatch.reassignmentPolicy` and its three
 * companions for capacity migration, `idle.parkingStrategy`'s `zone-center` and `predicted-demand`
 * for stage 7. A behaviour that needed a new knob to work was not wired up; it was reimplemented,
 * and `parameters.ts` records that test.
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
 * ## Everything in this directory is reachable from `runSimulation`
 *
 * State this first and plainly, because it was the reverse for the whole of Phase 5 and everything
 * below used to be qualified by it. All four behaviours now run inside `runSimulation`, and the
 * wiring is in `sim/` and `config/` — files this module does not own and did not work around.
 *
 * | Behaviour | How a run reaches it |
 * |---|---|
 * | `auction.ts` | `auction.aggregation` in the profile names a factory in `registry.ts`; `Simulation` builds every bank through {@link createPolicyFor} |
 * | `capacity.ts` | one {@link CapacityReassignmentMonitor} per bank, swept from `Simulation.#finishStop` once the doors have shut and the load has settled |
 * | `prepositioning.ts` | `Simulation.#park` resolves the bank's context and derives each car's `RepositionContext` from it |
 * | `zoning.ts` / `groupContext.ts` | `Simulation.#dispatchBank` resolves {@link groupContext} once per pass and shares it across the calls in the pass |
 *
 * The five gaps this section used to enumerate are closed:
 *
 * 1. **`config/schema.ts` carries an `auction` section** — `aggregation`, `rounds`,
 *    `reserveMarginalDelayS` — so a tuned winner is persistable as a profile and
 *    `data/dispatcher-profiles.json` ships **two** auction profiles that differ in that section and
 *    in nothing else. {@link AuctionPolicyOptions} remains the override an optimizer uses before it
 *    has persisted a candidate.
 * 2. **`SimulationConfig` selects the policy from data.** `auction.aggregation` is a declared
 *    categorical and `POLICY_FACTORIES` is a frozen record keyed on it, so "which dispatcher" is
 *    config and not a branch (CLAUDE.md invariant 7). `SimulationConfig.createPolicy` exists
 *    alongside it as the instrumentation and unpersisted-candidate hook, never as the selector.
 * 3. **{@link CapacityReassignmentMonitor} has a caller.** Measured on `midtown-office` at one
 *    seed: 44 load crossings and 17 call migrations under `predictive-balanced`, and 44 crossings
 *    with 0 migrations under `eta` — the sweep runs for both, and only the profile that declared
 *    `reassignmentPolicy: until-commitment` moves anything, which is what makes the mechanism's
 *    value measurable against its own absence.
 * 4. **`Simulation.#park` builds its context from the whole bank.** `predicted-demand` and
 *    `zone-center` both move cars: on `garden-apartments` at n = 500 under CRN, `zone-center` is
 *    −4.88 s AWT [−5.27, −4.49] against `stay` and `predicted-demand` is −0.98 s [−1.28, −0.68]
 *    once its deadband is inside what a six-floor shaft can pay for.
 * 5. **`Simulation.#dispatchBank` builds a group context.** `zoneAffinity` went from 0 non-zero
 *    evaluations in 437 to 372 in 495 on a real `zoned-uppeak` run, and `predictedDemand` from 0 in
 *    7 057 to 7 435 in 7 435 on `predictive-balanced`.
 *
 * ## Phase 5 acceptance criteria: what is met and what is not
 *
 * docs/05-roadmap.md § Phase 5 asks for two things. Neither is claimed here.
 *
 * | Criterion | Status |
 * |---|---|
 * | *each dispatcher beats `nearest-car` with a paired-t interval excluding zero on at least one building* | **not established by this module.** It is a `runSimulation` measurement and belongs with the replication runner; nothing here reports an AWT interval |
 * | *pre-positioning shows measurable AWT improvement on Garden Apartments* | **met, and measured by `packages/experiments/src/benchmark/prepositioning.ts` rather than here.** What `prepositioning.test.ts` asserts in this directory is still the decision-level surrogate — a forecast turning `no-forecast` into a park with a 15.3 s per-call anticipated saving — which is a statement about stage 7's arithmetic and **not** an AWT interval. It must not be reported as one |
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

export {
  POLICY_FACTORIES,
  aggregationOf,
  createPolicyFor,
  profileAsPolicySource,
} from './registry.js';

export type { DispatchPolicyFactory } from './registry.js';

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
