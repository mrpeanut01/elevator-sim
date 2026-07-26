/**
 * The vocabulary of `dispatch/policies` — aggregation, capacity migration, and pre-positioning.
 *
 * ## What this module is, and what it is not
 *
 * docs/01-architecture.md § *The resolution: auction dispatch is a policy, not an architecture*
 * settles the central question of this project by making contract-net bidding something the
 * codebase **benchmarks** rather than something it bets on. This module is the other half of
 * that settlement: everything here reuses `dispatch/`'s one scoring engine and its one cost-term
 * library, and changes only **who aggregates** the prices it produces.
 *
 * Concretely, nothing in this directory:
 *
 * - defines a cost term (that is `terms/`, and a new term is the only thing that justifies new
 *   code at all);
 * - re-implements a lifecycle stage (that is `lifecycle.ts`, driven by `policy.ts`);
 * - reads a profile id. CLAUDE.md invariant 7 forbids it, `policies.test.ts` greps for it, and
 *   the whole point of an auction being a *policy* is that it is selected by declared
 *   parameters — {@link AuctionStageConfig} — and not by a name.
 *
 * ## Branching on a declared parameter is not branching on a strategy
 *
 * `lifecycle.ts` draws the distinction and it applies verbatim here. `auction.rounds` is a
 * **declared integer tunable** with a declared range, and implementing it means comparing it
 * against the round counter somewhere. The failure invariant 7 names is branching on the *name* of
 * a profile — an `=== 'some-profile-id'` that puts behaviour in code the config claims to own.
 * There is no such comparison in this directory.
 *
 * ## Pending config surface
 *
 * `dispatcherProfileSchema` in `config/schema.ts` is strict and has no `auction` section, so a
 * profile in `data/dispatcher-profiles.json` carrying one is **rejected at load time today**
 * and only {@link AuctionPolicyOptions.auction} can set these two values. The config layer owes:
 *
 * ```ts
 * // config/schema.ts
 * const auctionStageSchema = z.strictObject({
 *   $comment: comment,
 *   rounds: z.number().int().min(1).max(8).optional(),
 *   reserveMarginalDelayS: nonNegative.optional(),
 * });
 * // ...and one row in dispatcherProfileSchema:
 * auction: auctionStageSchema.optional(),
 *
 * // config/types.ts, DispatcherProfile
 * readonly auction?: AuctionStageConfig | undefined;
 * ```
 *
 * Until that lands, an optimizer honouring {@link POLICY_PARAMETERS} can still search both
 * values through the options object but cannot persist a winner as a profile. This module owns
 * neither file, so the gap is **recorded rather than papered over** — the same treatment
 * `EligibilityStageConfig` gives `eligibility.*` and `DOOR_PARAMETERS` gives
 * `answer.maxReopensPerStop`. {@link AuctionProfileSource} already accepts the section, so the
 * schema addition is additive and changes nothing here.
 *
 * ## Conventions (see CLAUDE.md)
 *
 * - SI throughout; time is simulated seconds handed in by the caller. Nothing here reads a wall
 *   clock (invariant 3).
 * - No random draws. An auction outcome is a deterministic function of
 *   `(config, call, snapshots, time)`; `auction.test.ts` runs the same auction a hundred times
 *   and compares (invariants 2 and 4).
 * - Every value handed back is frozen.
 */

import type { SimTime } from '../../kernel/types.js';
import type { CarSnapshot, CostEstimate } from '../../model/car/types.js';
import type {
  CallLifecycle,
  DecisionOutcome,
  DecisionReason,
  DispatchContext,
  DispatchDecision,
  DispatchPolicyOptions,
  DispatcherProfileSource,
  ResolvedDispatchConfig,
  ScoreBreakdown,
} from '../types.js';

/* -------------------------------------------------------------------------- *
 * Stage 4 — the aggregation
 * -------------------------------------------------------------------------- */

/**
 * The auction's two tunables, as a profile would author them.
 *
 * Deliberately small. An auction that needed a dozen knobs would be a second dispatcher rather
 * than a second *aggregation*, and the comparison this module exists to make — does letting cars
 * decide for themselves ever beat a central argmin? — is only clean if everything except the
 * aggregation is held fixed.
 */
export interface AuctionStageConfig {
  /**
   * Maximum number of bidding rounds; equivalently, one more than the number of withdrawals the
   * auction may take.
   *
   * **`1` is a sealed-bid single-round auction and is provably the centralized argmin** — see
   * {@link AuctionOutcome.divergedFromArgmin} and the equivalence proof in `auction.test.ts`.
   * With one round there is no round to reallocate a declined contract into, so both withdrawal
   * rules are inert and the winner is the lowest bid, which is what the central scorer picks.
   */
  readonly rounds?: number | undefined;
  /**
   * A bidder's own ceiling on the delay it will impose on **its already-committed passengers**,
   * seconds. Above it the car declines the contract.
   *
   * This is the genuinely decentralized rule, and the reason it is a *reserve* rather than an
   * eligibility filter is the whole hypothesis under test. A central scorer can express the same
   * arithmetic — `existingCallDelay` is a declared cost term, and
   * `eligibility.maxLoadFactorForAssignment` is a declared hard filter. What it cannot express is
   * a car **refusing** work the group's own objective says it should take. The interesting
   * question is whether that ever wins, and it is a measurement, not a claim.
   *
   * Default 600 s, which is unreachable on any building in `data/buildings/` and therefore
   * inert — the same way `eligibility.maxLoadFactorForAssignment` is inert at 1.0. A profile
   * opts into the behaviour; a run that did not configure it cannot silently benefit from it.
   */
  readonly reserveMarginalDelayS?: number | undefined;
}

/** {@link AuctionStageConfig} with defaults applied and every value checked. */
export interface ResolvedAuctionStage {
  readonly rounds: number;
  readonly reserveMarginalDelayS: number;
}

/**
 * A resolved dispatch configuration plus the aggregation.
 *
 * Extends rather than replaces {@link ResolvedDispatchConfig}, so an auction policy is
 * substitutable everywhere a weighted-cost policy is and the two share one resolver. `engine`
 * stays `'weighted-cost'` and that is not a fudge: the *engine* is the cost function, which is
 * identical, and docs/06 § *Where auction dispatch fits* is explicit that
 * `AuctionDispatcher` "uses the same term library — each car computes its own bid from
 * `estimateCost()` — but changes *who* aggregates".
 */
export interface ResolvedAuctionConfig extends ResolvedDispatchConfig {
  readonly auction: ResolvedAuctionStage;
}

/** A profile that may carry an `auction` section. A `DispatcherProfile` satisfies it as-is. */
export interface AuctionProfileSource extends DispatcherProfileSource {
  readonly auction?: AuctionStageConfig | undefined;
}

/** {@link DispatchPolicyOptions} plus the aggregation the config schema cannot carry yet. */
export interface AuctionPolicyOptions extends DispatchPolicyOptions {
  readonly auction?: AuctionStageConfig | undefined;
}

/* -------------------------------------------------------------------------- *
 * Bids
 * -------------------------------------------------------------------------- */

/**
 * One car's price for one contract.
 *
 * The bid **is** the weighted cost, computed by the car from its own pure `estimateCost()`
 * through the same `scoreCar` the central engine uses. That identity is deliberate and is what
 * makes the single-round equivalence a theorem rather than a coincidence: if a bid were a
 * different quantity from a score, "sealed-bid equals argmin" would be an accident of tuning.
 */
export interface Bid {
  readonly carId: string;
  /** `Σᵢ wᵢ · normalize(termᵢ)`. Lower wins. */
  readonly cost: number;
  /** The pure estimate the bid was computed from; the bidder's own local information. */
  readonly estimate: CostEstimate;
  /** One entry per weighted term — what the bidder priced, and at what. */
  readonly terms: readonly ScoreBreakdown[];
  /** Which round the bid was submitted in, 1-based. */
  readonly round: number;
}

/** Why a bidder took its bid back. */
export const WITHDRAWAL_REASONS = [
  /** `auction.reserveMarginalDelayS`: the contract would delay the bidder's own passengers too far. */
  'reserve-price',
  /**
   * Winning would put the bidder over **its own** hall-call bypass threshold while another
   * bidder would stay under it. The load-change withdrawal.
   */
  'load-crossing',
] as const;

export type WithdrawalReason = (typeof WITHDRAWAL_REASONS)[number];

/** A bid taken back, and the local facts that decided it. */
export interface Withdrawal {
  readonly carId: string;
  readonly round: number;
  readonly reason: WithdrawalReason;
  /** Delay the contract would add to passengers this car is already committed to, seconds. */
  readonly marginalDelaySeconds: number;
  /** Load factor the bidder projects for itself after the award. */
  readonly resultingLoadFactor: number;
  /** The bidder's own bypass threshold, from its load cell. Never re-declared here. */
  readonly bypassLoadThreshold: number;
}

/**
 * Everything the auction did, kept so the hypothesis can be *measured* rather than asserted.
 *
 * {@link divergedFromArgmin} is the field the research question turns on: it is true exactly
 * when decentralized aggregation allocated the contract somewhere the central argmin would not.
 * A benchmark that never diverges is measuring one dispatcher twice.
 */
export interface AuctionOutcome {
  readonly callId: string;
  /** Rounds actually held. `1` when nobody withdrew. */
  readonly rounds: number;
  /** Round 1's bids, best first. The vector a central argmin would minimise over. */
  readonly openingBids: readonly Bid[];
  /** The closing round's bids, best first. */
  readonly bids: readonly Bid[];
  readonly withdrawals: readonly Withdrawal[];
  /**
   * Bidders whose withdrawal was **waived** because honouring it would have left the landing
   * with no car at all.
   *
   * The starvation guard, and it is not optional: a contract net that leaves a floor unserved
   * has not made a decision, it has dropped one. Honouring a reserve into an empty bidder set
   * would also hand `filterEligible`'s `allowBypassIfSoleEligibleCar` guard a group it was never
   * asked about.
   */
  readonly waived: readonly string[];
  /** The closing winner, or `undefined` when no car could bid at all. */
  readonly winnerCarId: string | undefined;
  /** Round 1's lowest bidder — what the centralized argmin would have chosen. */
  readonly argminCarId: string | undefined;
  /** `winnerCarId !== argminCarId`. The measurement, not a claim. */
  readonly divergedFromArgmin: boolean;
}

/* -------------------------------------------------------------------------- *
 * Stage 5 — capacity-driven migration
 * -------------------------------------------------------------------------- */

/**
 * A car that has just crossed its hall-call bypass threshold.
 *
 * A **rising edge**, not a state: a car that has been full for ten seconds has already had its
 * calls reconsidered, and re-running stage 5 on every dispatch pass because it is still full
 * would spend the `maxReassignmentsPerCall` budget on nothing. The threshold itself is read
 * from the car's own load cell (`CarLoadSnapshot.bypassLoadThreshold`) and is never re-declared
 * here — `LOAD_SENSOR_PARAMETERS` owns it, and the dispatcher reads its effect.
 */
export interface LoadCrossing {
  readonly carId: string;
  readonly loadFactor: number;
  readonly bypassLoadThreshold: number;
  readonly at: SimTime;
}

/** What stage 5 did with one call held by a car that has filled up. */
export interface CallMigration {
  readonly callId: string;
  /** The car that crossed its threshold. */
  readonly fromCarId: string;
  /** Cars holding the call after stage 5 ran, best first. */
  readonly toCarIds: readonly string[];
  readonly outcome: DecisionOutcome;
  /** Why it stayed, when it stayed: `committed`, `max-reassignments`, `below-hysteresis`, … */
  readonly reason: DecisionReason | undefined;
  /** The call's reassignment count after the decision. Bounded by `maxReassignmentsPerCall`. */
  readonly reassignments: number;
}

/** One sweep of the load sensor over a bank, and everything stage 5 made of it. */
export interface CapacityReassignmentResult {
  readonly at: SimTime;
  /** Rising edges observed on this sweep. Empty means no work was done. */
  readonly crossings: readonly LoadCrossing[];
  /** Calls that left the crossed car. */
  readonly migrated: readonly CallMigration[];
  /** Calls that stayed, each with the gate that kept it. */
  readonly held: readonly CallMigration[];
  /** Every decision stage 5 produced, in the order calls were registered. */
  readonly decisions: readonly DispatchDecision[];
}

/** What the caller knows about a landing when stage 5 re-prices it. */
export type CallContextSource = (lifecycle: CallLifecycle) => DispatchContext | undefined;

/* -------------------------------------------------------------------------- *
 * Stage 7 — pre-positioning
 * -------------------------------------------------------------------------- */

/**
 * The one capability stage 7 needs from a learned arrival model: floor id to expected arrivals
 * over the next `horizonS` seconds.
 *
 * **Declared structurally, and narrow on purpose** — the same treatment `CarClock` gives the
 * kernel and `DoorAnswerSource` gives a dispatcher profile. Three things follow, all of them
 * the point:
 *
 * 1. The predictor module is free to be as elaborate as it likes (per floor, per time of day,
 *    exponentially weighted at `idle.predictorLearningRate`) without this module knowing.
 * 2. This module cannot *train* it, mutate it, or reach the kernel through it. `forecast` is a
 *    query, and `at` is handed in rather than read from a clock (CLAUDE.md invariant 3).
 * 3. A test can supply a synthetic forecast and exercise `predicted-demand` end to end.
 *
 * A predictor exposing `forecast(at, horizonS)` satisfies this with no adapter and no import
 * from this file.
 */
export interface DemandForecastSource {
  /**
   * Expected arrivals per floor over `[fromT, fromT + horizonS)`, summed over both directions.
   *
   * Weights, not probabilities: only their ratios are read, so an implementation may return
   * counts, rates, or anything monotone in expected demand.
   *
   * `horizonS` is an **override**. Omitted, the model answers over its own configured
   * `idle.predictorHorizonS` — which is the predictor's tunable and is declared by
   * `PREDICTOR_PARAMETERS`, so this module passes a horizon only when a caller explicitly wants a
   * different one. Two defaults for one horizon would be two sources of truth for how far ahead a
   * bank looks.
   *
   * The name is the predictor's own. `DemandForecast` in `dispatch/predictor/` declares
   * `expectedDemandByFloor(fromT, horizonS?)` with exactly this signature and documents it as
   * *"exactly the shape `RepositionContext.demandForecast` wants"*, so an `ArrivalModel` satisfies
   * this interface with no adapter and no import in either direction. Its sibling
   * `forecast(floorId, direction, fromT, horizonS?)` answers a *scalar* for one floor and one
   * direction, which is what the `predictedDemand` cost term reads and not what stage 7 needs.
   */
  expectedDemandByFloor(
    fromT: SimTime,
    horizonS?: number | undefined,
  ): ReadonlyMap<string, number>;
}

/**
 * One car's operational zone: the floors it is currently expected to cover.
 *
 * **Operational** zoning, the third of docs/01-architecture.md's three kinds and the only one
 * that is a dispatcher strategy rather than building fabric or a credential. It is computed
 * per decision from the cars in service — a bank that loses a car to maintenance re-partitions
 * rather than leaving a band uncovered — and it is never stored on a car, because a car that
 * owned its zone could not be re-zoned by the group controller that is supposed to own the
 * decision.
 */
export interface OperationalZone {
  readonly carId: string;
  /** Floors in this car's band, ascending by shaft index. Possibly empty. */
  readonly floorIds: readonly string[];
}

/** Car id to its zone's floor ids. The shape `RepositionContext.zoneFloorIds` is read from. */
export type ZoneAssignment = ReadonlyMap<string, readonly string[]>;

/**
 * What the caller knows about where cars should wait.
 *
 * The superset of `RepositionContext`: the same three facts, but sourced rather than
 * pre-computed, so one object serves a whole bank and a per-car `RepositionContext` is derived
 * from it. `demandForecast` becomes a {@link DemandForecastSource} plus a horizon, because a
 * forecast is a function of time and a bank is repositioned repeatedly.
 */
export interface PrepositionContext {
  /** Ground-level floors, for `parkingStrategy: lobby`. A building may have several. */
  readonly entranceFloorIds?: readonly string[] | undefined;
  /**
   * Car id to operational zone, for `parkingStrategy: zone-center`.
   *
   * Omit it and `contiguousZones` is applied to the cars supplied, which is what makes
   * `zone-center` spread a bank out instead of sending every car to the same shaft median.
   */
  readonly zones?: ZoneAssignment | undefined;
  /** The learned arrival model, for `parkingStrategy: predicted-demand`. */
  readonly predictor?: DemandForecastSource | undefined;
  /**
   * Override the horizon the forecast is taken over, seconds.
   *
   * Omitted — the normal case — the model answers over its own `idle.predictorHorizonS`, which
   * `PREDICTOR_PARAMETERS` declares and this module deliberately does not.
   */
  readonly horizonS?: number | undefined;
}

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/** Guard, so a `CarSnapshot` list can be indexed by car id without a cast. */
export function carSnapshotsById(cars: readonly CarSnapshot[]): ReadonlyMap<string, CarSnapshot> {
  return new Map(cars.map((car) => [car.carId, car]));
}
