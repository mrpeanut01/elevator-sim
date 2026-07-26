/**
 * The auction, and the two things a benchmark of it has to establish before it means anything.
 *
 * 1. **Sealed-bid single round is the centralized argmin.** Not "close to", not "usually agrees
 *    with" — the same allocation, every time, on every authored profile. This is *proved* rather
 *    than asserted: a deterministic sweep over car placements, loads, landing sizes, directions and
 *    call floors runs both policies on byte-identical snapshots and compares the whole
 *    `DispatchDecision`, scores and rejections included. If that ever drifts, "auction dispatch"
 *    has become a second cost function wearing the same name, and every comparison against it is
 *    measuring the wrong thing.
 *
 *    Phase 3 measured why this matters: against a structurally different baseline the smallest
 *    detectable AWT difference at n = 100 is ~8% of AWT. A renamed dispatcher would sit far below
 *    that and be reported as "indistinguishable", which reads exactly like a correct null result.
 *    The only defence is an exact equality test at the decision level, which is this one.
 *
 * 2. **Multi-round genuinely diverges.** Both withdrawal rules are shown moving a contract to a car
 *    the argmin would not have chosen, with the local fact that caused it named. A "decentralized"
 *    aggregation that never diverges is the same dispatcher measured twice.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseDispatcherProfiles } from '../../config/parse.js';
import type { DispatcherProfile, DispatcherProfiles } from '../../config/types.js';
import type { CarSnapshot } from '../../model/car/types.js';
import type { Direction } from '../../model/types.js';
import { createDispatchPolicy } from '../policy.js';
import {
  DispatchError,
  type DispatchContext,
  type DispatchDecision,
  type DispatcherProfileSource,
} from '../types.js';

import {
  AuctionDispatchPolicy,
  createAuctionPolicy,
  observedContext,
  resolveAuctionConfig,
} from './auction.js';
import {
  board,
  call,
  hallCall,
  makeCar,
  profile,
  snapshotAt,
} from './fixtures.test-helper.js';
import { groupContext } from './groupContext.js';
import { MAX_AUCTION_ROUNDS, POLICY_DEFAULTS } from './parameters.js';
import type { AuctionOutcome } from './types.js';

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../../data', import.meta.url));

/* -------------------------------------------------------------------------- *
 * Fingerprints
 * -------------------------------------------------------------------------- */

/**
 * Everything a decision decided, as a string.
 *
 * Scores and rejections are included, not just the winner. Two aggregations that pick the same car
 * for different reasons are not the same aggregation, and a test that only compared winners would
 * pass while the cost function underneath had quietly changed.
 */
function decisionFingerprint(decision: DispatchDecision): string {
  return JSON.stringify({
    callId: decision.callId,
    outcome: decision.outcome,
    carIds: decision.carIds,
    primaryCarId: decision.primaryCarId,
    boardingPassengersPerCar: decision.boardingPassengersPerCar,
    cost: decision.cost,
    reason: decision.reason,
    stage: decision.stage,
    scores: decision.scores.map((score) => ({
      carId: score.carId,
      cost: score.cost,
      eta: score.estimate.etaSeconds,
      marginal: score.estimate.marginalDelaySeconds,
      load: score.estimate.resultingLoadFactor,
      terms: score.terms.map((term) => [term.termId, term.raw, term.contribution]),
    })),
    rejected: decision.rejected.map((verdict) => [
      verdict.carId,
      verdict.reason,
      verdict.constraintId,
      verdict.bypassOverridden,
      verdict.request.boardingPassengers,
    ]),
  });
}

function auctionFingerprint(outcome: AuctionOutcome): string {
  return JSON.stringify(outcome);
}

/* -------------------------------------------------------------------------- *
 * The load-crossing fixture
 * -------------------------------------------------------------------------- */

/**
 * Two cars, one of which wins the argmin and would cross its own bypass threshold by winning.
 *
 * `A` stands at floor 4 with **fourteen** passengers aboard, all bound for 19. That is 1,050 kg of
 * a 1,350 kg rated load: load factor 0.778, so it is *below* the 0.8 bypass threshold and fully
 * eligible. `requestForCar` then caps the hall request at `floor((1080 − 1050) / 75) = 0` → 1
 * passenger, and one more passenger takes it to 1,125 kg, load factor **0.833 — over its own
 * threshold**. So winning this contract takes `A` out of service for every other landing in the
 * bank, which is exactly the fact a per-call argmin cannot see and a self-interested bidder can.
 *
 * The same fixture drives the reserve-price rule, because inserting a stop at floor 5 ahead of A's
 * committed stop at 19 delays its own passengers by 14.12 s. One fixture, two independent local
 * reasons to decline, which is the honest way to show they are different rules.
 *
 * `B` stands at floor 20, empty. Farther, so it loses the argmin; empty, so it neither crosses a
 * threshold nor delays anybody.
 */
function loadCrossingBank(aboard = 14): {
  readonly cars: readonly CarSnapshot[];
  readonly nearId: string;
  readonly farId: string;
} {
  const near = makeCar('A', '4');
  board(near, aboard, '19');
  const far = makeCar('B', '20');
  return { cars: [near.snapshot(0), far.snapshot(0)], nearId: 'A', farId: 'B' };
}

/** `{ waitTime: 1 }` plus whatever stage settings a scenario needs. */
function waitTimeProfile(
  extras: Omit<DispatcherProfileSource, 'id' | 'name' | 'weights'> = {},
): DispatcherProfileSource {
  return profile({ waitTime: 1 }, extras);
}

/* -------------------------------------------------------------------------- *
 * A bid is a score
 * -------------------------------------------------------------------------- */

describe('a bid is a score, and that identity is the whole equivalence argument', () => {
  it('returns exactly what the engine scores, in the engine’s own order', () => {
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '6'), snapshotAt('C', '14')];
    const subject = call('9', 'up');
    const policy = createAuctionPolicy(waitTimeProfile());

    const bids = policy.bids(subject, cars, 0, { waitingPassengers: 5 });
    const scores = policy.score(subject, cars, 0, { waitingPassengers: 5 });

    expect(bids.length).toBe(scores.length);
    expect(bids.length).toBe(3);
    bids.forEach((bid, index) => {
      const score = scores[index];
      expect(score).toBeDefined();
      expect(bid.carId).toBe(score?.carId);
      expect(bid.cost).toBe(score?.cost);
      expect(bid.estimate).toStrictEqual(score?.estimate);
      expect(bid.terms).toStrictEqual(score?.terms);
      expect(bid.round).toBe(1);
    });
  });

  it('prices a bid against the caller’s whole observation, not a two-field reconstruction of it', () => {
    // The regression this describe block is named for, and it is not hypothetical bookkeeping.
    // `#bidders` used to build its observation as `{ waitingPassengers, waitingMassKg }` — a fixed
    // field list — while handing the caller's own context to the engine for the award. Every other
    // field was therefore dropped **from the bids alone**, and `DispatchContext` carries two that
    // change a price: `zoneFloorIdsByCarId`, which `zoneAffinity` reads, and `demandForecast`, which
    // `predictedDemand` reads.
    //
    // Two cars standing together at the lobby with a call in the upper car's band is the smallest
    // fixture that separates the two prices. Zone-blind the two bids tie and `A` wins the id
    // tie-break; zone-aware `B` owns floor 15 and wins outright. So under the old construction a
    // *single-round* auction reported `argmin = A` while the engine awarded `B`, i.e.
    // `divergedFromArgmin` was true for a sealed-bid auction — the exact opposite of the theorem
    // this file exists to prove — and with a round budget the withdrawal rules would have
    // reconsidered `A`, the car that was not leading.
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '0')];
    const subject = call('15', 'up');
    const zoned = profile({ waitTime: 0.7, zoneAffinity: 0.3 });
    const context = groupContext(cars, 0, { waitingPassengers: 4 });
    expect(context.zoneFloorIdsByCarId?.get('B')).toContain('15');

    const central = createDispatchPolicy(zoned);
    const auction = createAuctionPolicy(zoned);
    central.register(subject, 0, context);
    auction.register(subject, 0, context);

    const expected = central.dispatch(subject.id, cars, 0, context);
    const actual = auction.dispatch(subject.id, cars, 0, context);
    const outcome = auction.auction(subject.id);

    // The fixture is only meaningful if the zone actually moves the argmin, so assert that first.
    const blind = central.score(subject, cars, 0, { waitingPassengers: 4 });
    expect(blind[0]?.carId).toBe('A');
    expect(expected.primaryCarId).toBe('B');

    // A bid *is* a score, term for term, against the observation the award was made from.
    expect(outcome?.openingBids.map((bid) => [bid.carId, bid.cost, bid.terms])).toEqual(
      expected.scores.map((score) => [score.carId, score.cost, score.terms]),
    );
    // And therefore sealed-bid is still the argmin, which is what the drop had broken.
    expect(outcome?.argminCarId).toBe('B');
    expect(outcome?.winnerCarId).toBe('B');
    expect(outcome?.divergedFromArgmin).toBe(false);
    expect(decisionFingerprint(actual)).toBe(decisionFingerprint(expected));
  });

  it('hands the same observation to the bids and to the award, so a round budget reconsiders the real leader', () => {
    // The consequence of the drop that is not bookkeeping: `withdrawalsFrom` reads `bids[0]` as the
    // provisional winner, so a mispriced ranking makes the load-crossing rule reconsider whichever
    // car led the *wrong* vector.
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '0')];
    const subject = call('15', 'up');
    const zoned = profile({ waitTime: 0.7, zoneAffinity: 0.3 });
    const context = groupContext(cars, 0, { waitingPassengers: 4 });

    const policy = createAuctionPolicy(zoned, { auction: { rounds: 3 } });
    policy.register(subject, 0, context);
    policy.dispatch(subject.id, cars, 0, context);

    const outcome = policy.auction(subject.id);
    expect(outcome?.openingBids[0]?.carId).toBe('B');
    // Nobody is loaded, so nobody withdraws — the assertion is about *who was examined*, which is
    // the leader of the correctly-priced ranking.
    expect(outcome?.withdrawals).toEqual([]);
    expect(outcome?.bids[0]?.carId).toBe('B');
  });

  it('forwards a field it has never heard of', () => {
    // The general form, so the identity above does not have to be re-proved for every field somebody
    // adds to `DispatchContext` later. `observedContext` widens; it never narrows.
    const extra = { waitingPassengers: 3, spareCapacityHint: 'x' } as unknown as DispatchContext;
    const observed = observedContext(extra, { waitingPassengers: 9, waitingMassKg: 700 });

    expect(observed.waitingPassengers).toBe(3);
    expect(observed.waitingMassKg).toBe(700);
    expect((observed as unknown as Record<string, unknown>).spareCapacityHint).toBe('x');
    expect(Object.isFrozen(observed)).toBe(true);
  });

  it('defaults only the two counts, and only when the caller supplied none', () => {
    // The one thing it *does* override, and why: the batch's accumulated count is what
    // `WeightedCostDispatchPolicy.#decide` prices the award against, so bidding against the caller's
    // absent count would price a landing the assignment is not made for.
    expect(observedContext(undefined, { waitingPassengers: 9, waitingMassKg: 700 })).toEqual({
      waitingPassengers: 9,
      waitingMassKg: 700,
    });
    expect(
      observedContext({ waitingMassKg: 150 }, { waitingPassengers: 9, waitingMassKg: undefined }),
    ).toEqual({ waitingPassengers: 9, waitingMassKg: 150 });
    // Nobody weighed anybody: the field is omitted rather than carried as undefined.
    const unweighed = observedContext(
      { waitingPassengers: 2 },
      { waitingPassengers: 9, waitingMassKg: undefined },
    );
    expect(Object.hasOwn(unweighed, 'waitingMassKg')).toBe(false);
  });

  it('prices a bid against the share of the landing, not the whole queue', () => {
    // A bid to collect a third of a landing is not a bid to collect all of it. If the auction
    // priced the whole queue while the engine priced a share, sealed-bid equivalence would fail on
    // exactly the profiles that use split-demand.
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '6'), snapshotAt('C', '14')];
    const policy = createAuctionPolicy(
      waitTimeProfile({ dispatch: { assignmentMode: 'split-demand', splitThresholdPassengers: 12 } }),
    );
    const bids = policy.bids(call('9', 'up'), cars, 0, { waitingPassengers: 30 });
    const verdicts = policy.eligible(call('9', 'up'), cars, 0, { waitingPassengers: 30 });

    for (const verdict of verdicts) {
      expect(verdict.request.boardingPassengers).toBe(10);
    }
    expect(bids.length).toBe(3);
  });
});

/* -------------------------------------------------------------------------- *
 * Criterion 1 — sealed-bid single round IS the centralized argmin
 * -------------------------------------------------------------------------- */

describe('sealed-bid single round is the centralized argmin, proved not asserted', () => {
  let file: DispatcherProfiles;

  beforeAll(async () => {
    const raw = JSON.parse(
      await readFile(join(REAL_DATA_DIR, 'dispatcher-profiles.json'), 'utf8'),
    ) as unknown;
    file = parseDispatcherProfiles(raw, join(REAL_DATA_DIR, 'dispatcher-profiles.json'));
  });

  /** Every scenario the sweep visits. Deterministic and exhaustive over the product. */
  const PLACEMENTS: readonly (readonly [string, string, string])[] = [
    ['0', '6', '14'],
    ['3', '3', '3'],
    ['20', '1', '9'],
    ['9', '10', '11'],
    ['0', '20', '10'],
  ];
  const ABOARD: readonly number[] = [0, 6, 14];
  const WAITING: readonly number[] = [0, 4, 30];
  const FLOORS: readonly string[] = ['5', '19'];
  const DIRECTIONS: readonly Direction[] = ['up', 'down'];

  function scenarioCars(
    placement: readonly [string, string, string],
    aboard: number,
  ): readonly CarSnapshot[] {
    const [a, b, c] = placement;
    const first = makeCar('A', a);
    if (aboard > 0) board(first, aboard, '19');
    return [first.snapshot(0), makeCar('B', b).snapshot(0), makeCar('C', c).snapshot(0)];
  }

  it('makes byte-identical decisions to the weighted-cost engine on every authored profile', () => {
    const winners = new Set<string>();
    let scenarios = 0;
    let withRejections = 0;
    let withSplit = 0;

    for (const authored of file.profiles) {
      for (const placement of PLACEMENTS) {
        for (const aboard of ABOARD) {
          for (const waiting of WAITING) {
            for (const floorId of FLOORS) {
              for (const direction of DIRECTIONS) {
                const cars = scenarioCars(placement, aboard);
                const subject = call(floorId, direction);
                const context = waiting === 0 ? undefined : { waitingPassengers: waiting };

                const central = createDispatchPolicy(authored);
                const auction = createAuctionPolicy(authored);
                // Default options: rounds 1, reserve inert. The control arm.
                expect(auction.config.auction.rounds).toBe(1);

                const lifecycle = central.register(subject, 0, context);
                auction.register(subject, 0, context);
                // `predictive-balanced` defers 1.5 s; asking at its own `scoreableAt` is how a
                // runner schedules it and is the one call site that must respect stage 4.
                const at = lifecycle.scoreableAt;

                const expected = central.dispatch(subject.id, cars, at, context);
                const actual = auction.dispatch(subject.id, cars, at, context);

                expect(
                  decisionFingerprint(actual),
                  `${authored.id} @ ${placement.join('/')} aboard=${aboard} waiting=${waiting} ${floorId}${direction}`,
                ).toBe(decisionFingerprint(expected));

                const outcome = auction.auction(subject.id);
                expect(outcome).toBeDefined();
                expect(outcome?.rounds).toBe(1);
                expect(outcome?.withdrawals).toEqual([]);
                expect(outcome?.waived).toEqual([]);
                expect(outcome?.divergedFromArgmin).toBe(false);
                expect(outcome?.winnerCarId).toBe(outcome?.argminCarId);

                scenarios += 1;
                if (actual.primaryCarId !== undefined) winners.add(actual.primaryCarId);
                if (actual.rejected.length > 0) withRejections += 1;
                if (actual.carIds.length > 1) withSplit += 1;
              }
            }
          }
        }
      }
    }

    // The sweep has to be able to *fail*. A comparison that only ever visited scenarios with one
    // obvious winner would agree trivially, so assert it exercised divergent winners, rejected
    // cars and split assignments.
    expect(scenarios).toBeGreaterThan(500);
    expect(winners.size).toBeGreaterThan(1);
    expect(withRejections).toBeGreaterThan(0);
    expect(withSplit).toBeGreaterThan(0);
  });

  it('agrees when no car may take the call at all', () => {
    // The other end of the range: every car bypassing on load, so the engine returns `unassigned`
    // with a full set of rejections. An auction over an empty bidder set must return that too,
    // rather than an empty decision of its own shape.
    const cars = ['A', 'B', 'C'].map((id, index) => {
      const car = makeCar(id, String(index * 6));
      board(car, 15, '19');
      return car.snapshot(0);
    });
    const subject = call('5', 'up');

    const central = createDispatchPolicy(waitTimeProfile());
    const auction = createAuctionPolicy(waitTimeProfile());
    central.register(subject, 0, { waitingPassengers: 4 });
    auction.register(subject, 0, { waitingPassengers: 4 });

    const expected = central.dispatch(subject.id, cars, 0, { waitingPassengers: 4 });
    const actual = auction.dispatch(subject.id, cars, 0, { waitingPassengers: 4 });

    expect(expected.outcome).toBe('unassigned');
    expect(decisionFingerprint(actual)).toBe(decisionFingerprint(expected));
    expect(auction.auction(subject.id)?.winnerCarId).toBeUndefined();
    expect(auction.auction(subject.id)?.divergedFromArgmin).toBe(false);
  });

  it('agrees on a reconsideration too, not only a first assignment', () => {
    for (const authored of file.profiles) {
      const subject = call('9', 'up');
      const early = [snapshotAt('A', '0'), snapshotAt('B', '18')];
      const late = [snapshotAt('A', '16'), snapshotAt('B', '10')];

      const central = createDispatchPolicy(authored);
      const auction = createAuctionPolicy(authored);
      const at = central.register(subject, 0, { waitingPassengers: 3 }).scoreableAt;
      auction.register(subject, 0, { waitingPassengers: 3 });

      central.dispatch(subject.id, early, at, { waitingPassengers: 3 });
      auction.dispatch(subject.id, early, at, { waitingPassengers: 3 });

      const expected = central.reconsider(subject.id, late, at + 30, { waitingPassengers: 3 });
      const actual = auction.reconsider(subject.id, late, at + 30, { waitingPassengers: 3 });
      expect(decisionFingerprint(actual), authored.id).toBe(decisionFingerprint(expected));
    }
  });

  it('reports the engine’s own error for a call nobody registered', () => {
    const auction = createAuctionPolicy(waitTimeProfile());
    expect(() => auction.dispatch('nope', [snapshotAt('A', '0')], 0)).toThrow(DispatchError);
    expect(() => auction.dispatch('nope', [snapshotAt('A', '0')], 0)).toThrow(/not registered/);
  });

  it('does not hold an auction while the batch or defer window is still open', () => {
    const auction = createAuctionPolicy(
      waitTimeProfile({ dispatch: { assignmentTiming: 'deferred', deferWindowS: 2 } }),
    );
    const subject = call('9', 'up');
    auction.register(subject, 0);
    const decision = auction.dispatch(subject.id, [snapshotAt('A', '0')], 0.5);

    expect(decision.outcome).toBe('deferred');
    // No auction was held, because the snapshots it would have priced will have moved by the time
    // the window closes.
    expect(auction.auction(subject.id)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * Criterion 2 — multi-round genuinely diverges
 * -------------------------------------------------------------------------- */

describe('multi-round bidding allocates where the argmin would not', () => {
  it('withdraws the winner whose own load would cross its bypass threshold', () => {
    const { cars, nearId, farId } = loadCrossingBank();
    const subject = call('5', 'up');
    const context = { waitingPassengers: 6 };

    const sealed = createAuctionPolicy(waitTimeProfile(), { auction: { rounds: 1 } });
    sealed.register(subject, 0, context);
    const sealedDecision = sealed.dispatch(subject.id, cars, 0, context);

    const multi = createAuctionPolicy(waitTimeProfile(), { auction: { rounds: 2 } });
    multi.register(subject, 0, context);
    const multiDecision = multi.dispatch(subject.id, cars, 0, context);

    // The nearest car wins the argmin...
    expect(sealedDecision.primaryCarId).toBe(nearId);
    // ...and loses the contract net, because winning would take it out of service for the bank.
    expect(multiDecision.primaryCarId).toBe(farId);
    expect(multiDecision.carIds).not.toContain(nearId);

    const outcome = multi.auction(subject.id);
    expect(outcome?.divergedFromArgmin).toBe(true);
    expect(outcome?.argminCarId).toBe(nearId);
    expect(outcome?.winnerCarId).toBe(farId);
    expect(outcome?.rounds).toBe(2);
    expect(outcome?.withdrawals.length).toBe(1);
    expect(outcome?.withdrawals[0]?.carId).toBe(nearId);
    expect(outcome?.withdrawals[0]?.reason).toBe('load-crossing');
    expect(outcome?.withdrawals[0]?.round).toBe(1);
    // The local facts that decided it: over its own threshold, read off its own load cell.
    expect(outcome?.withdrawals[0]?.resultingLoadFactor).toBeGreaterThanOrEqual(0.8);
    expect(outcome?.withdrawals[0]?.bypassLoadThreshold).toBe(0.8);
    expect(outcome?.waived).toEqual([]);
  });

  it('leaves the same contract alone when winning it would not cross the threshold', () => {
    // Thirteen aboard instead of fourteen: the projected load lands at 0.778, under the threshold,
    // so the rule does not fire and the multi-round auction returns the argmin. The knob discerns
    // a real difference in the world rather than always firing.
    const { cars, nearId } = loadCrossingBank(13);
    const subject = call('5', 'up');
    const context = { waitingPassengers: 6 };

    const multi = createAuctionPolicy(waitTimeProfile(), { auction: { rounds: 3 } });
    multi.register(subject, 0, context);
    const decision = multi.dispatch(subject.id, cars, 0, context);

    expect(decision.primaryCarId).toBe(nearId);
    const outcome = multi.auction(subject.id);
    expect(outcome?.withdrawals).toEqual([]);
    expect(outcome?.divergedFromArgmin).toBe(false);
    expect(outcome?.rounds).toBe(1);
    expect(outcome?.bids[0]?.estimate.resultingLoadFactor).toBeLessThan(0.8);
  });

  it('withdraws a bidder whose reserve price the contract would breach', () => {
    // Same fixture, different local reason: inserting a stop at 5 ahead of A's committed stop at 19
    // delays A's own passengers by 14.12 s. A reserve of 10 s declines it; a reserve of 20 s does
    // not, and the winner moves back to the argmin. Two runs, one number changed.
    const { cars, nearId, farId } = loadCrossingBank(6);
    const subject = call('5', 'up');
    const context = { waitingPassengers: 2 };

    const strict = createAuctionPolicy(waitTimeProfile(), {
      auction: { rounds: 2, reserveMarginalDelayS: 10 },
    });
    strict.register(subject, 0, context);
    const declined = strict.dispatch(subject.id, cars, 0, context);
    expect(declined.primaryCarId).toBe(farId);
    const strictOutcome = strict.auction(subject.id);
    expect(strictOutcome?.withdrawals[0]?.carId).toBe(nearId);
    expect(strictOutcome?.withdrawals[0]?.reason).toBe('reserve-price');
    expect(strictOutcome?.withdrawals[0]?.marginalDelaySeconds).toBeGreaterThan(10);
    expect(strictOutcome?.divergedFromArgmin).toBe(true);

    const relaxed = createAuctionPolicy(waitTimeProfile(), {
      auction: { rounds: 2, reserveMarginalDelayS: 20 },
    });
    relaxed.register(subject, 0, context);
    const accepted = relaxed.dispatch(subject.id, cars, 0, context);
    expect(accepted.primaryCarId).toBe(nearId);
    expect(relaxed.auction(subject.id)?.withdrawals).toEqual([]);
  });

  it('takes at most rounds − 1 withdrawals, so the round budget is a budget', () => {
    // Three cars below the call floor with committed stops above it, so every one of them would
    // have its own passengers delayed ~14 s by taking the contract, and one empty car far away
    // that would not. Position matters: a loaded car *above* the call floor empties before it
    // reaches the landing, so it delays nobody and has no reason to decline.
    const near = makeCar('A', '4');
    board(near, 6, '19');
    const middle = makeCar('B', '3');
    board(middle, 6, '19');
    const lower = makeCar('C', '2');
    board(lower, 6, '19');
    const cars = [near.snapshot(0), middle.snapshot(0), lower.snapshot(0), makeCar('D', '20').snapshot(0)];

    const subject = call('5', 'up');
    const policy = createAuctionPolicy(waitTimeProfile(), {
      auction: { rounds: 2, reserveMarginalDelayS: 5 },
    });
    policy.register(subject, 0, { waitingPassengers: 2 });
    policy.dispatch(subject.id, cars, 0, { waitingPassengers: 2 });

    const outcome = policy.auction(subject.id);
    expect(outcome?.rounds).toBe(2);
    // Every over-reserve bidder declines simultaneously — a reserve is a statement a car makes
    // about itself, not a response to having won — so one round strikes all three at once, and
    // every withdrawal carries round 1 because the budget allowed no second one.
    expect(outcome?.withdrawals.map((withdrawal) => withdrawal.carId).sort()).toEqual(['A', 'B', 'C']);
    expect(outcome?.withdrawals.every((withdrawal) => withdrawal.round === 1)).toBe(true);
    expect(outcome?.winnerCarId).toBe('D');
  });
});

/* -------------------------------------------------------------------------- *
 * The starvation guards
 * -------------------------------------------------------------------------- */

describe('a contract net may not leave a landing unserved', () => {
  it('waives a reserve rather than dropping the only bidder', () => {
    const near = makeCar('A', '4');
    board(near, 6, '19');
    const cars = [near.snapshot(0)];
    const subject = call('5', 'up');

    const policy = createAuctionPolicy(waitTimeProfile(), {
      auction: { rounds: 3, reserveMarginalDelayS: 1 },
    });
    policy.register(subject, 0, { waitingPassengers: 2 });
    const decision = policy.dispatch(subject.id, cars, 0, { waitingPassengers: 2 });

    expect(decision.outcome).toBe('assigned');
    expect(decision.primaryCarId).toBe('A');
    const outcome = policy.auction(subject.id);
    expect(outcome?.waived).toEqual(['A']);
    expect(outcome?.withdrawals).toEqual([]);
    // A waived auction is the argmin, which is the conservative half of the trade.
    expect(outcome?.divergedFromArgmin).toBe(false);
  });

  it('never lets the last bidder withdraw on the load-crossing rule', () => {
    const near = makeCar('A', '4');
    board(near, 14, '19');
    const subject = call('5', 'up');

    const policy = createAuctionPolicy(waitTimeProfile(), { auction: { rounds: 4 } });
    policy.register(subject, 0, { waitingPassengers: 6 });
    const decision = policy.dispatch(subject.id, [near.snapshot(0)], 0, { waitingPassengers: 6 });

    expect(decision.primaryCarId).toBe('A');
    const outcome = policy.auction(subject.id);
    // The rule does not fire at all with one bidder, so nothing is even waived.
    expect(outcome?.withdrawals).toEqual([]);
    expect(outcome?.waived).toEqual([]);
    expect(outcome?.rounds).toBe(1);
  });

  it('does not withdraw into another full car', () => {
    // Both cars are below the call floor with fourteen aboard bound for 19, so both would cross
    // their own threshold by winning. Handing the landing from one to the other helps nobody and
    // costs a round, so the rule requires room *somewhere else*.
    const first = makeCar('A', '4');
    board(first, 14, '19');
    const second = makeCar('B', '2');
    board(second, 14, '19');
    const subject = call('5', 'up');

    const policy = createAuctionPolicy(waitTimeProfile(), { auction: { rounds: 4 } });
    policy.register(subject, 0, { waitingPassengers: 6 });
    const decision = policy.dispatch(subject.id, [first.snapshot(0), second.snapshot(0)], 0, {
      waitingPassengers: 6,
    });

    const outcome = policy.auction(subject.id);
    expect(outcome?.bids.length).toBe(2);
    for (const bid of outcome?.bids ?? []) {
      expect(bid.estimate.resultingLoadFactor).toBeGreaterThanOrEqual(0.8);
    }
    expect(outcome?.withdrawals).toEqual([]);
    expect(decision.primaryCarId).toBe(outcome?.argminCarId);
  });
});

/* -------------------------------------------------------------------------- *
 * Commitment outranks withdrawal
 * -------------------------------------------------------------------------- */

describe('a car cannot renege on a contract the lifecycle has committed', () => {
  function assignThenFill(commitmentPoint: 'on-assignment' | 'on-door-open'): {
    readonly policy: AuctionDispatchPolicy;
    readonly decision: DispatchDecision;
    readonly outcome: AuctionOutcome | undefined;
  } {
    const near = makeCar('A', '4');
    const far = makeCar('B', '20');
    const subject = call('5', 'up');
    const context = { waitingPassengers: 6 };

    const policy = createAuctionPolicy(
      waitTimeProfile({
        dispatch: {
          reassignmentPolicy: 'until-commitment',
          commitmentPoint,
          reassignmentHysteresisS: 0,
          maxReassignmentsPerCall: 3,
        },
      }),
      { auction: { rounds: 3 } },
    );

    policy.register(subject, 0, context);
    // Empty, so nobody withdraws and the nearest car takes it.
    const first = policy.dispatch(subject.id, [near.snapshot(0), far.snapshot(0)], 0, context);
    expect(first.primaryCarId).toBe('A');
    near.assignHallCall(hallCall('5', 'up'));

    // Now it fills up, to the point where taking that contract would cross its threshold.
    board(near, 14, '19');
    const decision = policy.reconsider(
      subject.id,
      [near.snapshot(1), far.snapshot(1)],
      1,
      context,
    );
    return { policy, decision, outcome: policy.auction(subject.id) };
  }

  it('retains a committed call even though the bidder withdrew', () => {
    const { decision, outcome } = assignThenFill('on-assignment');

    // The bidder did take its bid back...
    expect(outcome?.withdrawals[0]?.carId).toBe('A');
    expect(outcome?.withdrawals[0]?.reason).toBe('load-crossing');
    // ...and the lifecycle refused it, because the assignment is already irrevocable. Letting a
    // car hand work back freely is the re-auction storm docs/01 names as the failure mode of pure
    // agent autonomy.
    expect(decision.outcome).toBe('retained');
    expect(decision.reason).toBe('committed');
    expect(decision.carIds).toEqual(['A']);
  });

  it('lets the withdrawal stand while the assignment is still revocable', () => {
    const { decision, outcome } = assignThenFill('on-door-open');

    expect(outcome?.withdrawals[0]?.carId).toBe('A');
    expect(decision.outcome).toBe('reassigned');
    expect(decision.primaryCarId).toBe('B');
    // A car that withdrew is not there to defend the assignment, so the hysteresis never applies.
    // That is the contract-net form of capacity migration.
    expect(decision.carIds).not.toContain('A');
  });
});

/* -------------------------------------------------------------------------- *
 * A sequence of calls, not one decision
 * -------------------------------------------------------------------------- */

describe('over a sequence of calls rather than a single decision', () => {
  /**
   * Eight landings answered in registration order against one evolving bank.
   *
   * Every other test in this file is one decision, which is enough for the equivalence and
   * divergence *theorems* — they are statements about one allocation — and not enough for anything
   * cumulative. Three things only a sequence can go wrong at: a lifecycle leaked between calls, a
   * withdrawal that starves a landing several calls later, and an allocation that is only stable
   * because nothing had been allocated yet.
   *
   * This is still a decision-level test. It says nothing about AWT: `SimulationConfig` has no policy
   * hook, so no auction has ever run inside `runSimulation` (see `index.ts` § *Nothing in this
   * directory is reachable from `runSimulation` yet*), and a sequence of decisions is not a run.
   */
  const LANDINGS: readonly (readonly [string, 'up' | 'down', number])[] = [
    ['2', 'up', 4],
    ['16', 'down', 3],
    ['5', 'up', 12],
    ['19', 'down', 2],
    ['9', 'up', 30],
    ['1', 'up', 6],
    ['12', 'down', 8],
    ['7', 'up', 5],
  ];

  function sequenceBank(): readonly CarSnapshot[] {
    const loaded = makeCar('A', '3');
    board(loaded, 9, '19');
    const half = makeCar('C', '11');
    board(half, 5, '20');
    return [loaded.snapshot(0), makeCar('B', '18').snapshot(0), half.snapshot(0), makeCar('D', '0').snapshot(0)];
  }

  function runSequence(
    policy: AuctionDispatchPolicy | ReturnType<typeof createDispatchPolicy>,
  ): readonly DispatchDecision[] {
    const cars = sequenceBank();
    const decisions: DispatchDecision[] = [];
    LANDINGS.forEach(([floorId, direction, waiting], index) => {
      const at = index * 15;
      const subject = call(floorId, direction, at);
      const context = { waitingPassengers: waiting };
      policy.register(subject, at, context);
      decisions.push(policy.dispatch(subject.id, cars, at, context));
    });
    return decisions;
  }

  it('answers every landing, and the control arm answers them exactly as the central engine does', () => {
    const authored = waitTimeProfile({
      dispatch: {
        assignmentMode: 'split-demand',
        splitThresholdPassengers: 12,
        reassignmentPolicy: 'until-commitment',
        commitmentPoint: 'on-deceleration',
        maxReassignmentsPerCall: 2,
      },
    });

    const central = runSequence(createDispatchPolicy(authored));
    const auctioned = runSequence(createAuctionPolicy(authored));

    expect(central.length).toBe(LANDINGS.length);
    for (const decision of central) {
      expect(decision.outcome, decision.callId).toBe('assigned');
      expect(decision.carIds.length, decision.callId).toBeGreaterThan(0);
    }
    // The sequence has to be able to fail: assert it exercised more than one winner and at least one
    // split landing, so agreement is not agreement about a single obvious answer repeated eight times.
    expect(new Set(central.map((decision) => decision.primaryCarId)).size).toBeGreaterThan(1);
    expect(central.some((decision) => decision.carIds.length > 1)).toBe(true);

    expect(auctioned.map(decisionFingerprint)).toEqual(central.map(decisionFingerprint));
  });

  it('leaves no landing unserved over the sequence once bidders start withdrawing', () => {
    // A contract net's cumulative failure mode: withdrawals compounding until some floor has nobody
    // left willing to take it. A reserve tight enough that the loaded cars decline is the stress
    // case, and every landing must still come back assigned.
    const authored = waitTimeProfile({
      dispatch: { reassignmentPolicy: 'until-commitment', commitmentPoint: 'on-deceleration' },
    });
    const policy = createAuctionPolicy(authored, {
      auction: { rounds: 4, reserveMarginalDelayS: 3 },
    });
    const decisions = runSequence(policy);

    let withdrawals = 0;
    let waived = 0;
    for (const decision of decisions) {
      expect(decision.outcome, decision.callId).toBe('assigned');
      const outcome = policy.auction(decision.callId);
      expect(outcome, decision.callId).toBeDefined();
      withdrawals += outcome?.withdrawals.length ?? 0;
      waived += outcome?.waived.length ?? 0;
      // Whoever won, they were still bidding when the auction closed.
      expect(
        outcome?.withdrawals.map((withdrawal) => withdrawal.carId),
        decision.callId,
      ).not.toContain(outcome?.winnerCarId);
    }

    // Non-vacuous: the reserve really did fire over the sequence.
    expect(withdrawals + waived).toBeGreaterThan(0);
    // And every registered call is still live and held by somebody.
    for (const lifecycle of policy.calls) {
      expect(lifecycle.carIds.length, lifecycle.callId).toBeGreaterThan(0);
    }
  });

  it('is the same sequence run twice', () => {
    const authored = waitTimeProfile();
    const first = runSequence(
      createAuctionPolicy(authored, { auction: { rounds: 3, reserveMarginalDelayS: 8 } }),
    );
    const second = runSequence(
      createAuctionPolicy(authored, { auction: { rounds: 3, reserveMarginalDelayS: 8 } }),
    );
    expect(second.map(decisionFingerprint)).toEqual(first.map(decisionFingerprint));
  });
});

/* -------------------------------------------------------------------------- *
 * Determinism
 * -------------------------------------------------------------------------- */

describe('an auction is a deterministic function of its inputs', () => {
  it('is identical over a hundred runs', () => {
    const { cars } = loadCrossingBank();
    const subject = call('5', 'up');
    let expected: string | undefined;

    for (let run = 0; run < 100; run += 1) {
      const policy = createAuctionPolicy(waitTimeProfile(), {
        auction: { rounds: 3, reserveMarginalDelayS: 40 },
      });
      policy.register(subject, 0, { waitingPassengers: 6 });
      policy.dispatch(subject.id, cars, 0, { waitingPassengers: 6 });
      const outcome = policy.auction(subject.id);
      expect(outcome).toBeDefined();
      const fingerprint = auctionFingerprint(outcome as AuctionOutcome);
      expected ??= fingerprint;
      expect(fingerprint).toBe(expected);
    }
  });

  it('does not depend on the order the cars were supplied', () => {
    const { cars } = loadCrossingBank();
    const subject = call('5', 'up');

    const forward = createAuctionPolicy(waitTimeProfile(), { auction: { rounds: 2 } });
    forward.register(subject, 0, { waitingPassengers: 6 });
    const forwardDecision = forward.dispatch(subject.id, cars, 0, { waitingPassengers: 6 });

    const reverse = createAuctionPolicy(waitTimeProfile(), { auction: { rounds: 2 } });
    reverse.register(subject, 0, { waitingPassengers: 6 });
    const reverseDecision = reverse.dispatch(subject.id, [...cars].reverse(), 0, {
      waitingPassengers: 6,
    });

    expect(reverseDecision.primaryCarId).toBe(forwardDecision.primaryCarId);
    expect(reverse.auction(subject.id)?.winnerCarId).toBe(forward.auction(subject.id)?.winnerCarId);
    expect(reverse.auction(subject.id)?.withdrawals.map((w) => w.carId)).toEqual(
      forward.auction(subject.id)?.withdrawals.map((w) => w.carId),
    );
  });

  it('forgets an auction when its call leaves the system', () => {
    const subject = call('5', 'up');
    const policy = createAuctionPolicy(waitTimeProfile());
    policy.register(subject, 0);
    policy.dispatch(subject.id, [snapshotAt('A', '4')], 0);
    expect(policy.auction(subject.id)).toBeDefined();

    policy.complete(subject.id, 5);
    expect(policy.auction(subject.id)).toBeUndefined();

    policy.register(subject, 10);
    policy.dispatch(subject.id, [snapshotAt('A', '4')], 10);
    expect(policy.auction(subject.id)).toBeDefined();
    policy.cancel(subject.id);
    expect(policy.auction(subject.id)).toBeUndefined();

    policy.register(subject, 20);
    policy.dispatch(subject.id, [snapshotAt('A', '4')], 20);
    policy.reset();
    expect(policy.auction(subject.id)).toBeUndefined();
    expect(policy.calls).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * Configuration
 * -------------------------------------------------------------------------- */

describe('resolveAuctionConfig', () => {
  it('defaults to the control arm', () => {
    const config = resolveAuctionConfig(waitTimeProfile());
    expect(config.auction.rounds).toBe(POLICY_DEFAULTS.rounds);
    expect(config.auction.rounds).toBe(1);
    expect(config.auction.reserveMarginalDelayS).toBe(POLICY_DEFAULTS.reserveMarginalDelayS);
    // The dispatch half is `resolveDispatchConfig`'s output, unchanged.
    expect(config.engine).toBe('weighted-cost');
    expect([...config.weights.keys()]).toContain('waitTime');
  });

  it('takes the profile’s section, and lets options override it', () => {
    const authored = { ...waitTimeProfile(), auction: { rounds: 4, reserveMarginalDelayS: 30 } };
    expect(resolveAuctionConfig(authored).auction).toEqual({
      rounds: 4,
      reserveMarginalDelayS: 30,
    });
    expect(resolveAuctionConfig(authored, { auction: { rounds: 2 } }).auction).toEqual({
      rounds: 2,
      reserveMarginalDelayS: 30,
    });
  });

  it('rejects a round budget the aggregation cannot honour', () => {
    for (const rounds of [0, -1, 1.5, MAX_AUCTION_ROUNDS + 1, Number.NaN]) {
      expect(() => resolveAuctionConfig(waitTimeProfile(), { auction: { rounds } })).toThrow(
        DispatchError,
      );
      expect(() => resolveAuctionConfig(waitTimeProfile(), { auction: { rounds } })).toThrow(
        /auction\.rounds/,
      );
    }
  });

  it('rejects a reserve outside its declared range rather than accepting Infinity', () => {
    for (const reserve of [-1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() =>
        resolveAuctionConfig(waitTimeProfile(), {
          auction: { reserveMarginalDelayS: reserve },
        }),
      ).toThrow(/auction\.reserveMarginalDelayS/);
    }
  });

  it('rejects everything resolveDispatchConfig rejects, because it is the same resolver', () => {
    expect(() => resolveAuctionConfig(profile({ waitTiem: 1 }))).toThrow(DispatchError);
    expect(() => resolveAuctionConfig({ ...waitTimeProfile(), engine: 'auction' })).toThrow(
      /weighted-cost/,
    );
  });

  it('declares every tunable it reads, the lifecycle’s and its own', () => {
    const policy = createAuctionPolicy(waitTimeProfile());
    const ids = new Set(policy.parameters.map((parameter) => parameter.id));
    expect(ids.has('auction.rounds')).toBe(true);
    expect(ids.has('auction.reserveMarginalDelayS')).toBe(true);
    // Still every lifecycle knob: the auction changes the aggregation, not the stages.
    expect(ids.has('dispatch.reassignmentPolicy')).toBe(true);
    expect(ids.has('idle.parkingStrategy')).toBe(true);
    expect(ids.size).toBe(policy.parameters.length);
  });

  it('accepts a real profile from the data file, auction section absent', () => {
    // The pending-config-surface case: a `DispatcherProfile` has no `auction` field and must still
    // build an auction policy, defaulted to the control arm.
    const authored: DispatcherProfile = {
      id: 'auction',
      name: 'Contract-net auction',
      weights: { waitTime: 1 },
    };
    const policy = createAuctionPolicy(authored);
    expect(policy.config.auction.rounds).toBe(1);
    expect(policy.engine).toBe('weighted-cost');
  });
});
