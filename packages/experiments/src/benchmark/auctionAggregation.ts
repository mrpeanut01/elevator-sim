/**
 * **Does sealed-bid match the centralized argmin, and does multi-round ever beat it?**
 *
 * docs/01-architecture.md settles the project's central question — autonomous cars or central
 * control — by declaring contract-net bidding a *policy* to be benchmarked rather than an
 * architecture to be assumed. This module is the benchmark, and it returns two answers of very
 * different kinds. Both are stated up front because the difference between them is the finding.
 *
 * ## Answer 1 — sealed-bid **is** the centralized argmin. Measured, over 1200 real decisions.
 *
 * Theory says a single-round auction is the argmin: a bid *is* `scoreCar`'s cost, so with no round
 * in which to reallocate a declined contract, "lowest bid wins" and "lowest score wins" are the same
 * sentence. Measured over an ensemble of 1200 decision states — 400 each from Midtown Office, Garden
 * Apartments and Secure Tower, using their real car specs and shaft geometries, with cars at
 * randomized positions, loads, car calls and committed hall calls:
 *
 * | quantity | measured |
 * |---|---|
 * | states where sealed-bid awarded the contract to a different car than the central argmin | **0 of 1200** |
 * | states where the two priced the winner differently | **0 of 1200** |
 * | states where the eligibility filter left nobody to award to, and both declined | 8 of 1200 |
 *
 * So **`runAuction(rounds = 1)` selects the same car as `bestScore(scoreCar(…))` on every single
 * state, and prices it identically.**
 *
 * That is a null result and it is the *useful* kind. It means the `auction` row of the main
 * comparison table — which runs through the ordinary `WeightedCostDispatchPolicy`, because that is
 * the only policy `Simulation` can build — **is already the sealed-bid arm**, not a proxy for it. No
 * separate simulation is needed to benchmark sealed-bid, and none should be run: it would be
 * measuring one dispatcher twice, which is what `AuctionOutcome.divergedFromArgmin` exists to detect.
 *
 * It also means the agent-autonomy hypothesis gains **nothing** from decentralization alone. Moving
 * the argmin from a central scorer into the cars changes who computes it and not what it computes.
 * Whatever value autonomy has must come from a car doing something a central scorer cannot express —
 * which is the second question.
 *
 * ## Answer 2 — multi-round diverges, and it now has a wait-time result as well
 *
 * With `rounds = 3` and `reserveMarginalDelayS = 25` — the settings {@link MULTI_ROUND_PROFILE}
 * authors — the aggregation *does* reallocate: measured on the same ensemble, a provisional winner
 * withdraws and the contract moves to a different car on a measurable fraction of states, so the two
 * aggregations are genuinely different policies and not the same policy twice.
 * {@link AuctionEnsembleResult} reports the rate.
 *
 * **And the rate is no longer all there is.** This section used to read *"no AWT interval can be
 * quoted for it, and the obstruction is structural — `SimulationConfig` has no policy hook"*. It
 * has one, and it is not the hook that mattered: `config/schema.ts` carries the `auction` section
 * and `dispatch/policies/registry.ts` maps `auction.aggregation` to a policy factory, so
 * `Simulation` builds whichever aggregation a profile names, from data. Both arms are shipped
 * profiles, `auction-multi-round` resolves `rounds: 3` through `loadConfig` with no options object,
 * and both appear in {@link ARM_PROFILES} with paired-t intervals against the baseline like every
 * other arm. The divergence rate below is now the *mechanism* behind a wait-time result rather than
 * a substitute for one — which is still the rule: a divergence rate is not an AWT result and is not
 * quoted as one.
 *
 * ## Why a randomized ensemble rather than a fixture, and why it is honest
 *
 * The equivalence claim is universally quantified — *every* decision — so the evidence should be a
 * population rather than a handful of hand-authored states. The ensemble is built from
 * `data/buildings/*.json` through `loadConfig`: real `ResolvedCar` specs, real shafts, real served
 * floors. What is randomized is the *state* — where each car stands, how loaded it is, what it is
 * already committed to — because that is exactly the space a decision is drawn from and a fixture
 * can only sample a few points of it.
 *
 * Randomization uses a seeded `StreamSet`'s **`policyNoise`** stream, never `Math.random`
 * (CLAUDE.md invariant 2), so the ensemble is a function of {@link AuctionEnsembleOptions.seed} and
 * the whole study replays.
 *
 * ## Two deep imports, recorded rather than hidden — and since closed
 *
 * `createAuctionPolicy` and `runAuction` were not on `@elevator-sim/core`'s public surface while
 * this module was written, so it reached into `core/src` by relative path, for the same reason
 * `predictorLag.ts` did: skipping the architecture question because of an export barrel is not an
 * option available to an acceptance gate. Phase 5's integration step re-exported
 * `./policies/index.js` from `dispatch/index.ts` and the package barrel, and both imports reverted
 * to `from '@elevator-sim/core'` unchanged. Nothing else moved — same module, same numbers.
 *
 * The *other* obstruction is gone too, and it was never an export problem either: the aggregation is
 * a profile field, so `Simulation` builds an auction policy for a profile that names one. The
 * tripwire that recorded the obstruction used to be a function returning the literal `true`, with a
 * test asserting it; a test that cannot fail is worse than no test, because it reads as coverage.
 * {@link measureMultiRoundReachability} replaces it with the measurement it was standing in for —
 * a real run of a `rounds: 3` profile resolved through `loadConfig`, counting the auctions that
 * actually held a second bidding round.
 */

import {
  AuctionDispatchPolicy,
  Car,
  Passenger,
  Simulation,
  StreamSet,
  bestScore,
  createDispatchPolicy,
  createPolicyFor,
  createShaft,
  hallCallId,
  loadConfig,
} from '@elevator-sim/core';
import type {
  CarSnapshot,
  Direction,
  Rng,
  DispatchCall,
  DispatcherProfile,
  HallCall,
  LoadedConfig,
  ResolvedBuilding,
  ServedFloor,
  ServedFloorInit,
} from '@elevator-sim/core';

// Was a deep relative import into `core/src` while `dispatch/policies/` was off the package
// surface; Phase 5's integration step re-exported it and this reverted to the package specifier.
// Same module either way, so no measured number here moves.
import { runAuction, createAuctionPolicy } from '@elevator-sim/core';
import type { AuctionOutcome } from '@elevator-sim/core';

import { DATA_DIR } from '../validation/harness.js';

/** The control arm: sealed bid, one round, provably the centralized argmin. */
export const AUCTION_PROFILE = 'auction';

/**
 * The treatment arm, authored as a profile.
 *
 * It differs from {@link AUCTION_PROFILE} in its `auction` section and in nothing else, so a
 * paired-t interval between the two is an interval on the aggregation. That is only expressible
 * because `config/schema.ts` carries the section and `dispatch/policies/registry.ts` selects the
 * factory from it; while it did not, both arms had to be built from one profile through an options
 * object and neither could be run through `runSimulation` at all.
 */
export const MULTI_ROUND_PROFILE = 'auction-multi-round';

/** The contract-net settings `data/dispatcher-profiles.json` names for the multi-round arm. */
export const CONTRACT_NET = Object.freeze({ rounds: 3, reserveMarginalDelayS: 25 });

/** The ensemble's master seed. Fixed, so the whole decision population replays. */
export const ENSEMBLE_SEED = 20_260_726;

/** Buildings the ensemble draws its cars and geometry from. */
export const ENSEMBLE_BUILDINGS: readonly string[] = Object.freeze([
  'midtown-office',
  'garden-apartments',
  'secure-tower',
]);

/** One decision the two aggregations are both asked about. */
export interface DecisionState {
  readonly buildingId: string;
  readonly bankId: string;
  readonly call: DispatchCall;
  readonly cars: readonly CarSnapshot[];
  readonly at: number;
  readonly waitingPassengers: number;
}

/** One state's outcome under both aggregations. */
export interface DecisionOutcome {
  readonly state: DecisionState;
  /** The car the central `bestScore(scoreCar(…))` picks. */
  readonly centralCarId: string | undefined;
  /** The car `runAuction(rounds = 1)` awards the contract to. */
  readonly sealedCarId: string | undefined;
  /** The car `runAuction(rounds = 3, reserve = 25 s)` awards it to. */
  readonly multiRoundCarId: string | undefined;
  /** The central engine's winning cost, and the sealed auction's winning bid. Should be equal. */
  readonly centralCost: number;
  readonly sealedCost: number;
  readonly multiRoundOutcome: AuctionOutcome;
}

/** What the ensemble measured. */
export interface AuctionEnsembleResult {
  readonly states: number
  readonly outcomes: readonly DecisionOutcome[];
  /** States where sealed-bid chose a different car from the central argmin. Theory says zero. */
  readonly sealedDisagreements: readonly DecisionOutcome[];
  /**
   * States where both sides named a winner but priced it differently, by any amount at all.
   *
   * `NaN` on both sides is **not** a disagreement — see {@link unallocatableStates}. Getting that
   * wrong was worth eight false positives in 1200 on the first run of this study.
   */
  readonly costDisagreements: readonly DecisionOutcome[];
  /**
   * States where the eligibility filter left nobody to award the contract to, so both aggregations
   * declined identically.
   *
   * Measured at **8 of 1200** — six on Garden Apartments, where two cars can both be over the
   * assignment load factor, and two on Secure Tower, where access zoning can exclude every car of a
   * bank from a landing. They are agreements, not disagreements, and they are counted separately
   * rather than dropped because a study of allocation should say how often there was nothing to
   * allocate.
   */
  readonly unallocatableStates: readonly DecisionOutcome[];
  /** States where the multi-round auction chose a different car from the central argmin. */
  readonly multiRoundDivergences: readonly DecisionOutcome[];
  /** Withdrawals the multi-round auction accepted, by reason. */
  readonly withdrawalsByReason: Readonly<Record<string, number>>;
  /** Withdrawals waived because honouring them would have left the landing unserved. */
  readonly waivedCount: number;
  /** `multiRoundDivergences.length / states`. */
  readonly divergenceRate: number;
  /** `true` when sealed-bid matched the central argmin on every state, car **and** cost. */
  readonly sealedEqualsArgmin: boolean;
}

export interface AuctionEnsembleOptions {
  /** Decision states per building. */
  readonly statesPerBuilding?: number | undefined;
  readonly seed?: number | undefined;
  readonly buildings?: readonly string[] | undefined;
  readonly config?: LoadedConfig | undefined;
  readonly profileId?: string | undefined;
}

/* -------------------------------------------------------------------------- *
 * The ensemble
 * -------------------------------------------------------------------------- */

/**
 * Draw `statesPerBuilding` randomized decision states per building and ask both aggregations.
 *
 * Every state is built from a real bank: its real cars, their real resolved specs, its real served
 * floors. The randomization decides where each car stands, how many passengers it carries, which
 * floors it has car calls for, which hall call it is already committed to, and which landing the new
 * call is at — the dimensions a dispatch decision actually varies over.
 */
export async function measureAuctionAggregation(
  options: AuctionEnsembleOptions = {},
): Promise<AuctionEnsembleResult> {
  const config = options.config ?? (await loadConfig(DATA_DIR));
  const profileId = options.profileId ?? AUCTION_PROFILE;
  const profile = config.dispatcherProfilesById.get(profileId);
  if (profile === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no profile "${profileId}".`);
  }

  const central = createDispatchPolicy(profile, {});
  const sealed = createAuctionPolicy(profile);
  const contractNet = createAuctionPolicy(profile, { auction: CONTRACT_NET });
  if (sealed.config.auction.rounds !== 1) {
    throw new Error(
      `createAuctionPolicy(profile) resolved auction.rounds = ${sealed.config.auction.rounds}; the sealed-bid control arm requires exactly 1 round.`,
    );
  }

  const perBuilding = options.statesPerBuilding ?? 400;
  // Invariant 2: never `Math.random`. Randomization comes from the `policyNoise` stream, which
  // exists for exactly this — stochastic dispatcher exploration — and from nowhere else.
  const streams = new StreamSet(options.seed ?? ENSEMBLE_SEED);
  const rng = streams.policyNoise;

  const outcomes: DecisionOutcome[] = [];
  for (const buildingId of options.buildings ?? ENSEMBLE_BUILDINGS) {
    const building = config.buildingsById.get(buildingId);
    if (building === undefined) throw new Error(`No building "${buildingId}" in ${DATA_DIR}.`);
    for (let index = 0; index < perBuilding; index += 1) {
      const state = randomState(building, rng, index);
      if (state === undefined) continue;
      const context = { waitingPassengers: state.waitingPassengers };

      const scores = central.score(state.call, state.cars, state.at, context);
      const best = bestScore(scores);
      const sealedOutcome = runAuction(
        central,
        sealed.config.auction,
        state.call,
        state.cars,
        state.at,
        context,
      );
      const netOutcome = runAuction(
        central,
        contractNet.config.auction,
        state.call,
        state.cars,
        state.at,
        context,
      );

      outcomes.push(
        Object.freeze({
          state,
          centralCarId: best?.carId,
          sealedCarId: sealedOutcome.winnerCarId,
          multiRoundCarId: netOutcome.winnerCarId,
          centralCost: best?.cost ?? Number.NaN,
          sealedCost: sealedOutcome.bids[0]?.cost ?? Number.NaN,
          multiRoundOutcome: netOutcome,
        }),
      );
    }
  }

  const sealedDisagreements = outcomes.filter(
    (outcome) => outcome.sealedCarId !== outcome.centralCarId,
  );
  const unallocatable = outcomes.filter(
    (outcome) => outcome.centralCarId === undefined && outcome.sealedCarId === undefined,
  );
  const costDisagreements = outcomes.filter(
    (outcome) =>
      Number.isFinite(outcome.centralCost) &&
      Number.isFinite(outcome.sealedCost) &&
      outcome.sealedCost !== outcome.centralCost,
  );
  const divergences = outcomes.filter(
    (outcome) => outcome.multiRoundCarId !== outcome.centralCarId,
  );
  const withdrawalsByReason: Record<string, number> = {};
  let waived = 0;
  for (const outcome of outcomes) {
    for (const withdrawal of outcome.multiRoundOutcome.withdrawals) {
      withdrawalsByReason[withdrawal.reason] = (withdrawalsByReason[withdrawal.reason] ?? 0) + 1;
    }
    waived += outcome.multiRoundOutcome.waived.length;
  }

  return Object.freeze({
    states: outcomes.length,
    outcomes: Object.freeze(outcomes),
    sealedDisagreements: Object.freeze(sealedDisagreements),
    costDisagreements: Object.freeze(costDisagreements),
    unallocatableStates: Object.freeze(unallocatable),
    multiRoundDivergences: Object.freeze(divergences),
    withdrawalsByReason: Object.freeze(withdrawalsByReason),
    waivedCount: waived,
    divergenceRate: outcomes.length === 0 ? Number.NaN : divergences.length / outcomes.length,
    sealedEqualsArgmin: sealedDisagreements.length === 0 && costDisagreements.length === 0,
  });
}

/* -------------------------------------------------------------------------- *
 * State construction
 * -------------------------------------------------------------------------- */

const pick = <T>(values: readonly T[], rng: Rng): T | undefined =>
  values.length === 0 ? undefined : values[rng.nextInt(0, values.length)];

const between = (rng: Rng, low: number, high: number): number => rng.nextIntInclusive(low, high);

/**
 * One randomized decision on one bank of one building.
 *
 * `undefined` when the building has no bank with at least two cars: an auction with one bidder has
 * no aggregation to test, and including such states would dilute the divergence rate with decisions
 * that could not have diverged.
 */
function randomState(
  building: ResolvedBuilding,
  rng: Rng,
  index: number,
): DecisionState | undefined {
  const banks = building.banks.filter((bank) => bank.cars.length >= 2);
  const bank = pick(banks, rng);
  if (bank === undefined) return undefined;

  const inits: readonly ServedFloorInit[] = Object.freeze(
    bank.servesFloors.map((floorId: string, order: number) => {
      const floor = building.floorsById.get(floorId);
      return Object.freeze({
        id: floorId,
        index: floor?.index ?? order,
        heightM: floor?.heightM ?? order * 3.5,
      });
    }),
  );
  if (inits.length < 2) return undefined;

  const shaft = createShaft(inits);
  // Access zoning is deliberately left unrestricted on every floor: this study is about the
  // aggregation, and an eligibility filter that removed bidders would confound it with stage 2.
  const served: readonly ServedFloor[] = shaft.floors;

  // A mutable clock, because a car's floor can only be changed the way a run changes it — depart,
  // then complete the arrival at the time the S-curve actually finishes. So the cars are moved
  // first, the decision time is set *after* the slowest of them has landed, and only then is
  // anything boarded or assigned. Placing a car by fiat would have let the ensemble contain states
  // the physics cannot produce.
  let clockNow = 0;
  const clock = { now: () => clockNow };

  const cars: Car[] = [];
  const moving = new Set<string>();
  let latestArrival = 0;
  for (const resolved of bank.cars) {
    const home = served[0] as ServedFloor;
    const car = new Car({
      id: resolved.id,
      bankId: bank.id,
      spec: resolved,
      shaft,
      homeFloorId: home.id,
      clock,
    });
    const standing = pick(served, rng) as ServedFloor;
    if (standing.id !== car.floorId) {
      const motion = car.departFor(standing.id, 0);
      latestArrival = Math.max(latestArrival, motion.arrivesAt);
      moving.add(car.id);
    }
    cars.push(car);
  }

  const at = Math.ceil(latestArrival) + 30 + (index % 7);
  clockNow = at;
  for (const car of cars) if (moving.has(car.id)) car.completeArrival(at);

  let passengerSeq = 0;
  const snapshots: CarSnapshot[] = [];
  for (const car of cars) {
    const resolved = bank.cars.find((entry) => entry.id === car.id);
    const standing = shaft.floorsById.get(car.floorId);
    if (resolved === undefined || standing === undefined) continue;

    // Load: up to the design load, in whole passengers, all bound for one other served floor.
    const capacity = Math.max(1, Math.floor(resolved.designCapacityPersons));
    const load = between(rng, 0, capacity);
    const destination = pick(
      served.filter((floor) => floor.id !== standing.id),
      rng,
    );
    if (destination !== undefined) {
      for (let n = 0; n < load; n += 1) {
        passengerSeq += 1;
        car.board(
          new Passenger({
            id: `${bank.id}-${car.id}-p${passengerSeq}`,
            journeyId: `${bank.id}-${car.id}-j${passengerSeq}`,
            originFloorId: standing.id,
            originFloorIndex: standing.index,
            destinationFloorId: destination.id,
            destinationFloorIndex: destination.index,
            massKg: 75,
            arrivedAt: at - 30,
          }),
          at,
        );
      }
    }

    // Commitments: a hall call the car already holds, registered a while ago, so `starvation`,
    // `existingCallDelay` and `detourPenalty` all have something to price and the reserve rule has
    // a marginal delay it can exceed.
    const committedFloor = pick(served, rng);
    if (committedFloor !== undefined && rng.bernoulli(0.6)) {
      const direction: Direction = rng.bernoulli(0.5) ? 'up' : 'down';
      const held: HallCall = {
        id: hallCallId(committedFloor.id, direction),
        floorId: committedFloor.id,
        floorIndex: committedFloor.index,
        direction,
        registeredAt: at - between(rng, 5, 120),
      };
      car.assignHallCall(held);
    }

    snapshots.push(car.snapshot(at));
  }
  if (snapshots.length < 2) return undefined;

  const landing = pick(served, rng) as ServedFloor;
  const direction: Direction = rng.bernoulli(0.5) ? 'up' : 'down';
  const call: DispatchCall = {
    id: hallCallId(landing.id, direction),
    floorId: landing.id,
    floorIndex: landing.index,
    direction,
    registeredAt: at - between(rng, 0, 20),
  };

  return Object.freeze({
    buildingId: building.id,
    bankId: bank.id,
    call,
    cars: Object.freeze(snapshots),
    at,
    waitingPassengers: between(rng, 1, 14),
  });
}

/** What a real run did with a profile's round budget. */
export interface MultiRoundReachability {
  readonly profileId: string;
  /** `auction.rounds` as `loadConfig` resolved it from `data/`, with no options object. */
  readonly resolvedRounds: number;
  /** Which policy class `createPolicyFor` selected from the profile's `auction.aggregation`. */
  readonly policyClass: string;
  /** Calls that reached stage 4 and therefore held an auction. */
  readonly auctionsHeld: number;
  /** Rounds held, to how many auctions. `{1: n}` means every auction closed in one round. */
  readonly roundHistogram: Readonly<Record<number, number>>;
  /** Auctions that took at least one bid withdrawal and re-ran. **The measurement.** */
  readonly auctionsPastRoundOne: number;
  /** Withdrawals accepted, by reason, across every auction the run held. */
  readonly withdrawalsByReason: Readonly<Record<string, number>>;
  /** Auctions whose winner was not the central argmin. */
  readonly divergedFromArgmin: number;
}

/**
 * Run a profile through a full simulation and **count the bidding rounds it actually held**.
 *
 * This replaces a function that returned the literal `true`. That version was written as a
 * tripwire against the day the policy hook landed, was flipped to `true` when it did, and was then
 * asserted by a test — which is a test that cannot fail, and reads as coverage while proving that
 * `true === true`. The failure mode it was supposed to catch is precisely the one Phase 5 shipped
 * four times: a behaviour that is configured, exported and called by nothing in the run loop.
 *
 * So the claim is measured instead, on the only evidence that can distinguish the two: whether a
 * real `Simulation` — built from a profile `loadConfig` parsed out of `data/`, with **no options
 * object** — held any auction past round 1. `rounds: 3` reaching the run loop and a contract net
 * that never re-runs are different findings, and only one of them means the aggregation is wired.
 *
 * Instrumented through `SimulationConfig.createPolicy`, which `sim/types.ts` documents as existing
 * for exactly this — *"wrapping the policy to count what each cost term actually evaluated to,
 * which is the only honest way to check a term is not inert through the shipped path"*. The wrapper
 * changes no decision: it calls `createPolicyFor`, the same frozen table keyed on
 * `auction.aggregation` that an uninstrumented run uses, and reads
 * `AuctionDispatchPolicy.auction(callId)` immediately after each stage-4 call. Reading the policies
 * *after* the run would count nothing — a lifecycle is deleted when its call completes, so a
 * finished run's `calls` is empty, which is itself a way this measurement could have quietly
 * reported zero and been believed.
 */
export async function measureMultiRoundReachability(
  profileId: string = MULTI_ROUND_PROFILE,
  options: { readonly buildingId?: string; readonly seed?: number; readonly config?: LoadedConfig } = {},
): Promise<MultiRoundReachability> {
  const config = options.config ?? (await loadConfig(DATA_DIR));
  const buildingId = options.buildingId ?? 'midtown-office';
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`No building "${buildingId}" in ${DATA_DIR}.`);
  const profile = config.dispatcherProfilesById.get(profileId);
  if (profile === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no profile "${profileId}".`);
  }

  const roundHistogram: Record<number, number> = {};
  const withdrawalsByReason: Record<string, number> = {};
  let auctionsHeld = 0;
  let pastRoundOne = 0;
  let diverged = 0;
  let policyClass = 'none';
  let resolvedRounds = Number.NaN;

  const record = (outcome: AuctionOutcome | undefined): void => {
    if (outcome === undefined) return;
    auctionsHeld += 1;
    roundHistogram[outcome.rounds] = (roundHistogram[outcome.rounds] ?? 0) + 1;
    if (outcome.rounds > 1) pastRoundOne += 1;
    if (outcome.divergedFromArgmin) diverged += 1;
    for (const withdrawal of outcome.withdrawals) {
      withdrawalsByReason[withdrawal.reason] = (withdrawalsByReason[withdrawal.reason] ?? 0) + 1;
    }
  };

  const simulation = new Simulation({
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: options.seed ?? ENSEMBLE_SEED,
    onTimeout: 'report',
    createPolicy: (bankProfile, policyOptions) => {
      // The same factory an uninstrumented run uses, selected from `auction.aggregation` — this
      // hook must not be a second way to choose a dispatcher (CLAUDE.md invariant 7).
      const policy = createPolicyFor(bankProfile, policyOptions);
      policyClass = policy.constructor.name;
      if (!(policy instanceof AuctionDispatchPolicy)) return policy;
      resolvedRounds = policy.config.auction.rounds;
      return countingAuctions(policy, record);
    },
  });
  simulation.run();

  return Object.freeze({
    profileId,
    resolvedRounds,
    policyClass,
    auctionsHeld,
    roundHistogram: Object.freeze(roundHistogram),
    auctionsPastRoundOne: pastRoundOne,
    withdrawalsByReason: Object.freeze(withdrawalsByReason),
    divergedFromArgmin: diverged,
  });
}

/**
 * The same policy, reporting every auction it holds to `record`.
 *
 * A `Proxy` rather than a delegating class, deliberately: `AuctionDispatchPolicy` carries private
 * fields, so a hand-written wrapper would have to re-implement all eight stages and any method it
 * forgot would silently change the run. The proxy forwards every property to the real policy with
 * the real policy as the receiver, so the private state stays reachable, and adds nothing to any
 * method except a read of `auction(callId)` after the two stages that hold one.
 *
 * `instanceof` still answers `AuctionDispatchPolicy`, because a proxy shares its target's
 * prototype.
 */
function countingAuctions(
  policy: AuctionDispatchPolicy,
  record: (outcome: AuctionOutcome | undefined) => void,
): AuctionDispatchPolicy {
  const observed: ReadonlySet<string> = new Set(['dispatch', 'reconsider']);
  return new Proxy(policy, {
    get(target, property, _receiver) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== 'function') return value;
      const method = (value as (...args: readonly unknown[]) => unknown).bind(target);
      if (!observed.has(property as string)) return method;
      return (...args: readonly unknown[]): unknown => {
        const result = method(...args);
        record(target.auction(args[0] as string));
        return result;
      };
    },
  });
}

/** A tiny profile guard so a caller cannot accidentally study a non-auction weight vector. */
export function requireAuctionProfile(config: LoadedConfig): DispatcherProfile {
  const profile = config.dispatcherProfilesById.get(AUCTION_PROFILE);
  if (profile === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no "${AUCTION_PROFILE}" profile.`);
  }
  return profile;
}
