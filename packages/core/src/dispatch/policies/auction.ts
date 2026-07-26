/**
 * Contract-net bidding among cars — the aggregation, benchmarked rather than assumed.
 *
 * ```ts
 * const sealed     = createPolicyFor(profiles.get('auction'));             // rounds: 1
 * const contractNet = createPolicyFor(profiles.get('auction-multi-round')); // rounds: 3
 * ```
 *
 * **The aggregation is a profile field.** `config/schema.ts` carries an `auction` section —
 * `aggregation`, `rounds`, `reserveMarginalDelayS` — and `dispatch/policies/registry.ts` is a frozen
 * table from `auction.aggregation` to a policy factory, so *which dispatcher runs* is data and not
 * a branch (CLAUDE.md invariant 7). `data/dispatcher-profiles.json` ships both arms as profiles:
 * `auction` (sealed bid, one round, provably the centralized argmin) and `auction-multi-round`
 * (three rounds, a 25 s reserve), differing in that section and in **nothing else**, so a paired-t
 * interval between the two is an interval on the aggregation. Loaded through `loadConfig` with no
 * options object, `auction-multi-round` resolves `rounds: 3` and, measured on `midtown-office` at
 * seed 20 260 726, holds more than one round in 922 of 2 398 auctions and lands somewhere other
 * than the argmin 194 times.
 *
 * This paragraph used to say the opposite — that the config layer could not carry the section, so a
 * second profile *"would resolve to `rounds: 1` and be the control arm under another name"*. It is
 * kept in view because the experiment design that claim implied is still on offer and is now the
 * wrong one: someone re-running this study from the old doc would build the options-object pair and
 * reproduce the confound the profile pair removes.
 *
 * {@link AuctionPolicyOptions} survives as the **pre-persistence override**: the shape an optimizer
 * uses to evaluate a candidate aggregation it has not written back to `data/` yet. It is not the
 * only place the aggregation can be set, and it is not how a shipped run selects one.
 *
 * Same profile, same weights, same term library, same seven-stage lifecycle. The only difference
 * is **who decides**, which is exactly the comparison docs/01-architecture.md
 * § *The resolution: auction dispatch is a policy, not an architecture* asks for:
 *
 * > *Contract-net bidding among cars is a legitimate research approach. Build it as
 * > `AuctionDispatcher` alongside the others. Then the agent-autonomy hypothesis becomes
 * > something you **benchmark** rather than something the codebase is betting on.*
 *
 * ## A bid is a score. That is the point, not a shortcut
 *
 * Each car computes its own bid from its own pure `estimateCost()` through the same `scoreCar`
 * the central engine uses — `DispatchPolicy.score` is documented as *"what Phase 5's
 * `AuctionDispatcher` collects as bids"* and this is that caller. Nothing about the *price* is
 * decentralized, because nothing about a price can be: `estimateCost()` is already local to the
 * car, and re-deriving it here would be a second implementation of the cost function and a
 * second source of truth for what a car is worth.
 *
 * The identity is enforced, not documented. A bid is priced against **the caller's whole
 * observation**, not a reconstruction of it — see {@link observedContext}. Pricing the bids against
 * a narrower context than the assignment is priced against is the one way this file can silently
 * stop being an aggregation and start being a second cost function: `zoneAffinity` and
 * `predictedDemand` read `zoneFloorIdsByCarId` and `demandForecast` off the observation, so
 * dropping those two fields from the bids alone would score them zero in every bid and non-zero in
 * every assignment. Sealed-bid would stop being the argmin, the load-crossing rule would
 * reconsider whichever car led the *mispriced* ranking, and `divergedFromArgmin` would be a
 * measurement of the wrong vector.
 *
 * What is decentralized is the **decision to bid at all**, and the two rules that express it are
 * the only genuinely new behaviour in this file:
 *
 * | Rule | The car's local reason | What no central argmin can express |
 * |---|---|---|
 * | `auction.reserveMarginalDelayS` | "this contract delays *my* passengers past what I will accept" | a car **refusing** work the group's own objective says it should take |
 * | load-crossing withdrawal | "winning would put me over *my own* bypass threshold while another bidder stays under" | a car pricing its **withdrawal from service for every other landing**, which the per-call objective never sees |
 *
 * Both are honest about their status. A central scorer can compute the same *arithmetic* —
 * `existingCallDelay` is a declared cost term and `eligibility.maxLoadFactorForAssignment` a
 * declared hard filter — so this is not a claim that decentralization computes something
 * uncomputable. It is a claim that it makes a *different allocation*, which is measurable, and
 * {@link AuctionOutcome.divergedFromArgmin} is the measurement.
 *
 * ## Sealed-bid single round *is* the centralized argmin
 *
 * With `rounds: 1` there is no subsequent round to reallocate a declined contract into, so no
 * withdrawal is taken, the bidder set is the whole group, and the winner is the lowest bid — the
 * argmin of exactly the vector `WeightedCostDispatchPolicy` minimises over. It is therefore not
 * merely equivalent in outcome but **the same computation**, and `auction.test.ts` proves it
 * rather than asserting it: over a deterministic sweep of car placements, loads, profiles and
 * landing sizes it compares the full `DispatchDecision` — winner, car list, cost, share, every
 * score — against the weighted-cost policy fed the same snapshots, and requires equality.
 *
 * Saying so plainly is the useful part. A "new dispatcher" that is a rename of the old one is the
 * single easiest way to report a difference that does not exist, and Phase 3 measured how small a
 * real difference has to be before it is unmeasurable: **8% of AWT** against a structurally
 * different baseline at n = 100. A benchmark of sealed-bid against centralized argmin must return
 * *exactly zero*, and if it ever returns anything else, something is broken.
 *
 * ## What this file does not do
 *
 * It does not re-implement a lifecycle stage. Registration, the eligibility filter, the batch and
 * defer windows, the stage-5 gates, the commitment latch, `maxReassignmentsPerCall`, split-demand
 * partitioning, answering and repositioning are all `WeightedCostDispatchPolicy`, delegated to
 * unchanged. The auction runs **between** stage 3 and stage 4: it decides which cars are still
 * bidding, and hands that set to the engine.
 *
 * Two consequences worth stating, because both are behaviour:
 *
 * - **Commitment beats withdrawal.** A committed call is retained by the stage-5 gate before any
 *   pricing happens, so a car cannot renege on a contract it has begun decelerating for. That is
 *   the correct precedence — docs/01 § *Why not pure agent-per-elevator* names "re-auction storms
 *   and genuine starvation cases" as the failure mode of letting agents hand work back freely.
 * - **A withdrawn incumbent loses the call.** Under `reassignmentPolicy: until-commitment` a car
 *   that withdraws is absent from the bidder set, so it is not there to defend the assignment and
 *   the hysteresis does not apply. That is the contract-net form of capacity migration, and it
 *   agrees with what `capacity.ts` does through the load sensor.
 */

import { AGGREGATIONS } from '../../config/types.js';
import type { SimTime } from '../../kernel/types.js';
import type { CarSnapshot } from '../../model/car/types.js';
import { WeightedCostDispatchPolicy, resolveDispatchConfig } from '../policy.js';
import { DISPATCH_PARAMETERS } from '../parameters.js';
import {
  DispatchError,
  type AnswerDecision,
  type CallLifecycle,
  type CarScore,
  type DispatchCall,
  type DispatchContext,
  type DispatchDecision,
  type DispatchParameterSpec,
  type DispatchPolicy,
  type EligibilityVerdict,
  type RepositionContext,
  type RepositionDecision,
} from '../types.js';

import { MAX_AUCTION_ROUNDS, POLICY_DEFAULTS, POLICY_PARAMETERS } from './parameters.js';
import {
  carSnapshotsById,
  type AuctionOutcome,
  type AuctionPolicyOptions,
  type AuctionProfileSource,
  type Bid,
  type ResolvedAuctionConfig,
  type ResolvedAuctionStage,
  type Withdrawal,
  type WithdrawalReason,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Resolution
 * -------------------------------------------------------------------------- */

/**
 * Turn an authored profile into a fully defaulted, fully checked auction configuration.
 *
 * Precedence is `options > profile > POLICY_DEFAULTS`, matching `resolveDispatchConfig`. The
 * dispatch half is `resolveDispatchConfig`'s output verbatim — one resolver, so an auction policy
 * and a weighted-cost policy built from the same profile cannot disagree about anything except
 * the aggregation.
 *
 * @throws DispatchError if `aggregation` is not one this package implements, if `rounds` is not an
 *   integer in `[1, 8]`, or the reserve is not a finite non-negative number. Thrown at build time
 *   rather than at decision time, for the reason `DispatchError` gives: a configuration the engine
 *   cannot honour would otherwise produce a plausible-looking run of the wrong system.
 */
export function resolveAuctionConfig(
  source: AuctionProfileSource,
  options: AuctionPolicyOptions = {},
): ResolvedAuctionConfig {
  const base = resolveDispatchConfig(source, options);

  const aggregation =
    options.auction?.aggregation ?? source.auction?.aggregation ?? POLICY_DEFAULTS.aggregation;
  const rounds = options.auction?.rounds ?? source.auction?.rounds ?? POLICY_DEFAULTS.rounds;
  const reserve =
    options.auction?.reserveMarginalDelayS ??
    source.auction?.reserveMarginalDelayS ??
    POLICY_DEFAULTS.reserveMarginalDelayS;

  if (!AGGREGATIONS.includes(aggregation)) {
    throw new DispatchError(
      `Dispatcher "${source.id}": auction.aggregation must be one of ${AGGREGATIONS.join(', ')}; received "${String(aggregation)}". The aggregation selects which policy factory runs the profile, so an unknown one would silently fall back to a dispatcher nobody configured.`,
    );
  }
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_AUCTION_ROUNDS) {
    throw new DispatchError(
      `Dispatcher "${source.id}": auction.rounds must be an integer in [1, ${MAX_AUCTION_ROUNDS}]; received ${rounds}. One round is a sealed-bid auction and is the centralized argmin; a round budget below one is not an auction at all.`,
    );
  }
  if (!Number.isFinite(reserve) || reserve < 0) {
    throw new DispatchError(
      `Dispatcher "${source.id}": auction.reserveMarginalDelayS must be a finite non-negative number of seconds; received ${reserve}. Use a large finite value (the ${POLICY_DEFAULTS.reserveMarginalDelayS} s default) to disable the reserve, so the knob a Phase 7 optimizer samples stays inside its declared range.`,
    );
  }

  return Object.freeze({
    ...base,
    auction: Object.freeze({ aggregation, rounds, reserveMarginalDelayS: reserve }),
  });
}

/* -------------------------------------------------------------------------- *
 * The auction
 * -------------------------------------------------------------------------- */

/**
 * The observation the bids and the assignment are both priced against.
 *
 * The caller's context **widened, never narrowed**: every field it carries is forwarded and only
 * the two landing counts are defaulted, from the batch's own accumulated totals, exactly as
 * `WeightedCostDispatchPolicy.#decide` defaults them. One object priced twice, so the two halves of
 * a decision cannot disagree.
 *
 * Rebuilding the context from a fixed field list instead would be correct only for as long as
 * `DispatchContext` had exactly those fields, and it does not: `zoneFloorIdsByCarId` and
 * `demandForecast` are declared on it and forwarded by `lifecycle.observationFor`, which is what
 * makes `zoneAffinity` and `predictedDemand` price anything at all. A field list also fails
 * *silently* — the bids come back looking like scores, priced against a landing whose zoning and
 * forecast nobody mentioned — which is why this is one function with one test rather than an
 * object literal at each call site.
 *
 * Pure. Frozen.
 */
export function observedContext(
  context: DispatchContext | undefined,
  lifecycle: Pick<CallLifecycle, 'waitingPassengers' | 'waitingMassKg'>,
): DispatchContext {
  const waitingMassKg = context?.waitingMassKg ?? lifecycle.waitingMassKg;
  return Object.freeze({
    ...context,
    waitingPassengers: context?.waitingPassengers ?? lifecycle.waitingPassengers,
    ...(waitingMassKg === undefined ? {} : { waitingMassKg }),
  });
}

/** The one capability the auction needs from the engine: stage 3, priced but not committed. */
export interface BidSource {
  score(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): readonly CarScore[];
}

/** A ranked score list as bids for one round. Order is the engine's total order on cost. */
export function bidsFrom(scores: readonly CarScore[], round: number): readonly Bid[] {
  return Object.freeze(
    scores.map((score) =>
      Object.freeze({
        carId: score.carId,
        cost: score.cost,
        estimate: score.estimate,
        terms: score.terms,
        round,
      }),
    ),
  );
}

function withdrawalOf(
  bid: Bid,
  car: CarSnapshot,
  reason: WithdrawalReason,
  round: number,
): Withdrawal {
  return Object.freeze({
    carId: bid.carId,
    round,
    reason,
    marginalDelaySeconds: bid.estimate.marginalDelaySeconds,
    resultingLoadFactor: bid.estimate.resultingLoadFactor,
    // Read off the load cell's own snapshot. `LOAD_SENSOR_PARAMETERS` declares the threshold;
    // re-declaring it here would be a second source of truth for one number.
    bypassLoadThreshold: car.load.bypassLoadThreshold,
  });
}

/**
 * Which bidders take their bids back this round, and why. `[]` closes the auction.
 *
 * The two rules are ordered, and the order is not arbitrary. A **reserve** is a statement a car
 * makes about itself regardless of whether it is winning, so every over-reserve bidder declines
 * simultaneously and independently — that is what "local decision" means, and processing them one
 * per round would make the outcome depend on how many rounds the profile happened to budget. The
 * **load-crossing** rule is a reconsideration by the provisional winner only: it is a response to
 * *having won*, so it cannot fire for a car that was not going to.
 *
 * Two guards, both starvation guards:
 *
 * - the load-crossing rule never fires with fewer than two bidders — the last car standing does
 *   not get to refuse the floor;
 * - it fires only when some other bidder would stay under **its own** threshold, because handing
 *   a heavy landing from one full car to another full car helps nobody and costs a round.
 */
function withdrawalsFrom(
  bids: readonly Bid[],
  byId: ReadonlyMap<string, CarSnapshot>,
  reserveMarginalDelayS: number,
  round: number,
): readonly Withdrawal[] {
  const declining: Withdrawal[] = [];
  for (const bid of bids) {
    if (bid.estimate.marginalDelaySeconds <= reserveMarginalDelayS) continue;
    const car = byId.get(bid.carId);
    /* c8 ignore next -- unreachable: bids are priced from these same snapshots. */
    if (car === undefined) continue;
    declining.push(withdrawalOf(bid, car, 'reserve-price', round));
  }
  if (declining.length > 0) return Object.freeze(declining);

  if (bids.length < 2) return Object.freeze([]);
  const leader = bids[0];
  /* c8 ignore next -- unreachable: `bids.length >= 2`. */
  if (leader === undefined) return Object.freeze([]);
  const leaderCar = byId.get(leader.carId);
  /* c8 ignore next -- unreachable: bids are priced from these same snapshots. */
  if (leaderCar === undefined) return Object.freeze([]);
  if (leader.estimate.resultingLoadFactor < leaderCar.load.bypassLoadThreshold) {
    return Object.freeze([]);
  }

  const roomElsewhere = bids.some((bid, index) => {
    if (index === 0) return false;
    const car = byId.get(bid.carId);
    return car !== undefined && bid.estimate.resultingLoadFactor < car.load.bypassLoadThreshold;
  });
  if (!roomElsewhere) return Object.freeze([]);

  return Object.freeze([withdrawalOf(leader, leaderCar, 'load-crossing', round)]);
}

/**
 * Hold the auction for one contract.
 *
 * ```
 * round 1: every car in the group prices the contract from its own estimateCost()
 *          lowest bid wins provisionally
 * round r: any bidder over its reserve declines; failing that, a provisional winner that would
 *          cross its own bypass threshold declines; the survivors re-bid
 * close:   at `rounds` rounds, or the first round nobody declines in
 * ```
 *
 * Under `assignmentMode: single-car` a bid is independent of the other bidders, so a later
 * round's bids are the earlier round's minus the withdrawals. Under `split-demand` the *share*
 * each car is asked to collect is `ceil(waiting / bidders)`, so removing a bidder re-prices every
 * remaining bid — which is why each round re-runs `score` rather than filtering the previous
 * round's list. Re-pricing is also what makes the round structure honest: a round in which no
 * bid can change is not a round.
 *
 * Terminates: every round either closes or moves at least one car from the bidder set to
 * `withdrawn`, and `round < rounds ≤ 8` bounds it besides.
 *
 * Pure. No clock, no RNG, no mutation of anything passed in.
 */
export function runAuction(
  engine: BidSource,
  auction: ResolvedAuctionStage,
  call: DispatchCall,
  cars: readonly CarSnapshot[],
  at: SimTime,
  context?: DispatchContext | undefined,
): AuctionOutcome {
  const byId = carSnapshotsById(cars);
  const openingBids = bidsFrom(engine.score(call, cars, at, context), 1);

  let bids = openingBids;
  const withdrawals: Withdrawal[] = [];
  const withdrawn = new Set<string>();
  const waived: string[] = [];
  let round = 1;

  while (round < auction.rounds) {
    const leaving = withdrawalsFrom(bids, byId, auction.reserveMarginalDelayS, round);
    if (leaving.length === 0) break;

    const leavingIds = new Set(leaving.map((withdrawal) => withdrawal.carId));
    const remaining = cars.filter(
      (car) => !withdrawn.has(car.carId) && !leavingIds.has(car.carId),
    );
    const nextBids = bidsFrom(engine.score(call, remaining, at, context), round + 1);

    // Honouring these withdrawals would leave the landing with no car. A contract net that
    // leaves a floor unserved has not made a decision, it has dropped one — so the withdrawals
    // are waived and the auction closes on the bids it already has.
    if (nextBids.length === 0) {
      for (const withdrawal of leaving) waived.push(withdrawal.carId);
      break;
    }

    for (const withdrawal of leaving) {
      withdrawn.add(withdrawal.carId);
      withdrawals.push(withdrawal);
    }
    bids = nextBids;
    round += 1;
  }

  const winnerCarId = bids[0]?.carId;
  const argminCarId = openingBids[0]?.carId;

  return Object.freeze({
    callId: call.id,
    rounds: round,
    openingBids,
    bids,
    withdrawals: Object.freeze([...withdrawals]),
    waived: Object.freeze([...waived]),
    winnerCarId,
    argminCarId,
    divergedFromArgmin: winnerCarId !== argminCarId,
  });
}

/* -------------------------------------------------------------------------- *
 * The policy
 * -------------------------------------------------------------------------- */

/**
 * A `DispatchPolicy` whose stage 4 aggregates bids instead of taking a central argmin.
 *
 * Implements the interface in full and delegates every stage except the aggregation to a
 * {@link WeightedCostDispatchPolicy} built from the **same resolved configuration**. It is
 * therefore substitutable anywhere a weighted-cost policy is, which is what makes a paired
 * benchmark between the two possible at all — see the note on `SimulationConfig` in this
 * module's `index.ts`.
 *
 * `engine` is `'weighted-cost'` and that is literally true: the engine is the cost function, and
 * it is the same one. docs/06 § *Where auction dispatch fits* says so — *"uses the same term
 * library … but changes who aggregates"*.
 */
export class AuctionDispatchPolicy implements DispatchPolicy {
  readonly id: string;
  readonly name: string;
  readonly engine = 'weighted-cost' as const;
  readonly config: ResolvedAuctionConfig;
  /** Every lifecycle tunable, plus the aggregation's own (CLAUDE.md invariant 8). */
  readonly parameters: readonly DispatchParameterSpec[] = Object.freeze([
    ...DISPATCH_PARAMETERS,
    ...POLICY_PARAMETERS,
  ]);

  readonly #inner: WeightedCostDispatchPolicy;
  /** Call id to the last auction held for it. Diagnostic; the contract is the decision. */
  readonly #auctions = new Map<string, AuctionOutcome>();

  constructor(config: ResolvedAuctionConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.#inner = new WeightedCostDispatchPolicy(config);
  }

  /** The weighted-cost engine underneath, for a caller that wants the central answer too. */
  get enginePolicy(): WeightedCostDispatchPolicy {
    return this.#inner;
  }

  get calls(): readonly CallLifecycle[] {
    return this.#inner.calls;
  }

  /* ---------------------------------------------------------------- *
   * Stage 4 — the aggregation, and the only thing this class adds
   * ---------------------------------------------------------------- */

  dispatch(
    callId: string,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): DispatchDecision {
    const held = this.#bidders(callId, cars, at, context);
    return this.#inner.dispatch(callId, held.bidders, at, held.observed);
  }

  reconsider(
    callId: string,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): DispatchDecision {
    const held = this.#bidders(callId, cars, at, context);
    return this.#inner.reconsider(callId, held.bidders, at, held.observed);
  }

  /**
   * Hold the auction and return the cars still bidding, plus the observation they were priced
   * against — which is the observation the assignment is then priced against too.
   *
   * The context is returned rather than rebuilt by the caller for the reason
   * {@link observedContext} gives: one object, priced twice. `dispatch` and `reconsider` hand it
   * straight to the engine, so there is no path on which the bids and the award see different
   * information.
   *
   * Bidder order is preserved rather than sorted by bid, because the engine's own total order on
   * `(cost, carId)` is what decides the winner and a pre-sorted list would make the outcome look
   * like it depended on argument order when it does not.
   *
   * Two cases skip the auction, and both would otherwise price a landing nobody is going to be
   * offered. Both return the caller's context untouched, because there is no lifecycle to default
   * the counts from:
   *
   * - **an unregistered call** — the engine throws the same `DispatchError` it always throws, and
   *   it should be that error rather than one from this file;
   * - **a call still inside its batch or defer window** — stage 4 has not opened yet, so the
   *   engine returns `deferred` without scoring, and an auction held now would be against
   *   snapshots that will have moved by the time the window closes.
   */
  #bidders(
    callId: string,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context: DispatchContext | undefined,
  ): {
    readonly bidders: readonly CarSnapshot[];
    readonly observed: DispatchContext | undefined;
  } {
    const lifecycle = this.#inner.lifecycle(callId);
    if (lifecycle === undefined) return { bidders: cars, observed: context };
    if (lifecycle.carIds.length === 0 && at < lifecycle.scoreableAt) {
      return { bidders: cars, observed: context };
    }

    // The same observation `#decide` will use, whole: the caller's counts when it supplied them,
    // the batch's accumulated counts otherwise, and every other field it carries forwarded
    // untouched. Two different observations would price the bids against a landing the assignment
    // is not made for.
    const observed = observedContext(context, lifecycle);

    const outcome = runAuction(this.#inner, this.config.auction, lifecycle.call, cars, at, observed);
    this.#auctions.set(callId, outcome);
    if (outcome.withdrawals.length === 0) return { bidders: cars, observed };

    const withdrawn = new Set(outcome.withdrawals.map((withdrawal) => withdrawal.carId));
    return {
      bidders: Object.freeze(cars.filter((car) => !withdrawn.has(car.carId))),
      observed,
    };
  }

  /** The last auction held for a call, or `undefined` if none has been. */
  auction(callId: string): AuctionOutcome | undefined {
    return this.#auctions.get(callId);
  }

  /**
   * Round 1's bids for a call, best first, without creating or touching a lifecycle.
   *
   * The pure view of the auction, and identical to {@link score} by construction: a bid *is* a
   * score. `auction.test.ts` asserts the identity term for term, because if it ever stopped
   * holding, "sealed-bid equals argmin" would stop being a theorem.
   */
  bids(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): readonly Bid[] {
    return bidsFrom(this.#inner.score(call, cars, at, context), 1);
  }

  /* ---------------------------------------------------------------- *
   * Every other stage — the engine's, unchanged
   * ---------------------------------------------------------------- */

  register(
    call: DispatchCall,
    at: SimTime,
    context?: DispatchContext | undefined,
  ): CallLifecycle {
    return this.#inner.register(call, at, context);
  }

  score(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): readonly CarScore[] {
    return this.#inner.score(call, cars, at, context);
  }

  eligible(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): readonly EligibilityVerdict[] {
    return this.#inner.eligible(call, cars, at, context);
  }

  answer(
    car: CarSnapshot,
    call: DispatchCall,
    at: SimTime,
    cars?: readonly CarSnapshot[] | undefined,
  ): AnswerDecision {
    return this.#inner.answer(car, call, at, cars);
  }

  reposition(
    car: CarSnapshot,
    at: SimTime,
    context?: RepositionContext | undefined,
  ): RepositionDecision {
    return this.#inner.reposition(car, at, context);
  }

  lifecycle(callId: string): CallLifecycle | undefined {
    return this.#inner.lifecycle(callId);
  }

  complete(callId: string, at: SimTime): CallLifecycle | undefined {
    this.#auctions.delete(callId);
    return this.#inner.complete(callId, at);
  }

  cancel(callId: string): boolean {
    this.#auctions.delete(callId);
    return this.#inner.cancel(callId);
  }

  reset(): void {
    this.#auctions.clear();
    this.#inner.reset();
  }
}

/* -------------------------------------------------------------------------- *
 * Construction
 * -------------------------------------------------------------------------- */

/**
 * Build an auction policy from a dispatcher profile.
 *
 * ```ts
 * const control = createAuctionPolicy(config.dispatcherProfilesById.get('auction')!);
 * const treatment = createAuctionPolicy(config.dispatcherProfilesById.get('auction-multi-round')!);
 * ```
 *
 * There is no aggregation argument, because the aggregation *is* `auction.rounds` and
 * `auction.reserveMarginalDelayS` — data, declared in {@link POLICY_PARAMETERS}, sampleable by a
 * generic optimizer, and carried by `config/schema.ts` so a tuned winner persists as a profile.
 * A profile with no `auction` section resolves to the centralized argmin, which is the control arm
 * every measurement of this module is against.
 *
 * **Two profiles, not one profile and two option sets.** That is the shipped shape:
 * `data/dispatcher-profiles.json` holds `auction` and `auction-multi-round`, byte-identical outside
 * their `auction` sections, and `registry.ts` builds whichever one a run names. `options` is the
 * override an optimizer uses **before** it has persisted a candidate; passing it is not how a run
 * selects an aggregation, and a benchmark that used it to build both arms from one profile would be
 * measuring something the shipped path cannot run.
 */
export function createAuctionPolicy(
  profile: AuctionProfileSource,
  options: AuctionPolicyOptions = {},
): AuctionDispatchPolicy {
  return new AuctionDispatchPolicy(resolveAuctionConfig(profile, options));
}
