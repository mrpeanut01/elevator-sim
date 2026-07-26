/**
 * Parallel service — the specific Phase 2 defect, and its regression.
 *
 * The review found that `assignmentMode: split-demand`
 *
 * > *"names N cars but never divides the landing between them: every chosen car is scored and
 * > filtered as though it alone serves the whole queue."*
 *
 * Naming three cars for a landing of thirty and then pricing each of them for thirty people is not
 * parallel service. It is one decision made three times, and it is wrong in four separate ways,
 * every one of which this file asserts against:
 *
 * | Consequence | Assertion here |
 * |---|---|
 * | each car's dwell is inflated by transfers another car will make | the request each car prices carries the **share**, not the queue |
 * | the recorded `cost` and `etaSeconds` describe a trip nobody takes | the decision's cost is the priced-for-a-share cost |
 * | `maxLoadFactorForAssignment` disqualifies cars for a load they were never going to carry — exactly when a heavy floor most needs them | a ceiling that rejects every car at the whole queue admits three at the share |
 * | a runner boarding the whole landing onto the first car to arrive runs a different system from the one that was scored | `boardingPassengersPerCar` is published on the decision and the lifecycle |
 *
 * The brief's own numbers are used throughout — **thirty waiting, a threshold of twelve** — so the
 * regression is stated in the terms the defect was reported in.
 */

import { describe, expect, it } from 'vitest';

import type { CarSnapshot } from '../../model/car/types.js';
import { createDispatchPolicy } from '../policy.js';
import type { DispatcherProfileSource } from '../types.js';

import { createAuctionPolicy } from './auction.js';
import { call, makeCar, profile, snapshotAt } from './fixtures.test-helper.js';

/** Thirty waiting and a threshold of twelve: `ceil(30 / 12) = 3` cars, `ceil(30 / 3) = 10` each. */
const WAITING = 30;
const THRESHOLD = 12;
const EXPECTED_CARS = 3;
const EXPECTED_SHARE = 10;

function splitProfile(
  splitThresholdPassengers = THRESHOLD,
  eligibility: { maxLoadFactorForAssignment?: number } = {},
): DispatcherProfileSource {
  return profile(
    { waitTime: 1 },
    {
      dispatch: { assignmentMode: 'split-demand', splitThresholdPassengers },
      ...(eligibility.maxLoadFactorForAssignment === undefined ? {} : { eligibility }),
    },
  );
}

function singleCarProfile(): DispatcherProfileSource {
  return profile({ waitTime: 1 }, { dispatch: { assignmentMode: 'single-car' } });
}

/** Four cars spread up the shaft, so the split has more candidates than it needs. */
function bank(): readonly CarSnapshot[] {
  return [
    snapshotAt('A', '0'),
    snapshotAt('B', '6'),
    snapshotAt('C', '14'),
    snapshotAt('D', '20'),
  ];
}

describe('split-demand genuinely partitions a landing', () => {
  it('prices every chosen car against its share, not the whole queue', () => {
    const cars = bank();
    const subject = call('9', 'up');
    const policy = createDispatchPolicy(splitProfile());

    policy.register(subject, 0, { waitingPassengers: WAITING });
    const verdicts = policy.eligible(subject, cars, 0, { waitingPassengers: WAITING });
    const decision = policy.dispatch(subject.id, cars, 0, { waitingPassengers: WAITING });

    // Three cars for thirty people at a threshold of twelve.
    expect(decision.carIds.length).toBe(EXPECTED_CARS);
    // **The defect.** Every car was asked to price ten, not thirty. This single assertion is the
    // regression: before the fix each of these read 30 (capped only by the car's own room), which
    // is the whole queue offered to every car at once.
    for (const verdict of verdicts) {
      expect(verdict.request.boardingPassengers, verdict.carId).toBe(EXPECTED_SHARE);
      expect(verdict.request.boardingPassengers, verdict.carId).not.toBe(WAITING);
    }
    // And the decision publishes the share, so a runner boards what was priced.
    expect(decision.boardingPassengersPerCar).toBe(EXPECTED_SHARE);
    expect(policy.lifecycle(subject.id)?.boardingPassengersPerCar).toBe(EXPECTED_SHARE);
    expect(decision.boardingPassengersPerCar).not.toBe(WAITING);
  });

  it('does not charge a car for the dwell of transfers another car will make', () => {
    // The harm the review named, measured. Every car here already has a committed stop at 19, so
    // the boarding dwell at floor 9 delays passengers it is *already carrying* — which is exactly
    // what `marginalDelaySeconds` reports. Priced for the whole queue a car is charged twelve
    // transfers; priced for its share, ten. The two extra were another car's.
    //
    // Note what does *not* move: `etaSeconds` to the call floor. Boarding happens on arrival, so
    // the trip to the landing is the same length however many people are on it. A test that only
    // compared ETAs would have passed against the defect.
    const cars = ['A', 'B', 'C', 'D'].map((id, index) => {
      const car = makeCar(id, String(index * 6));
      car.registerCarCall('19', 0);
      return car.snapshot(0);
    });
    const subject = call('9', 'up');

    const split = createDispatchPolicy(splitProfile());
    const whole = createDispatchPolicy(splitProfile(WAITING + 1));
    split.register(subject, 0, { waitingPassengers: WAITING });
    whole.register(subject, 0, { waitingPassengers: WAITING });

    const shared = split.dispatch(subject.id, cars, 0, { waitingPassengers: WAITING });
    const undivided = whole.dispatch(subject.id, cars, 0, { waitingPassengers: WAITING });

    expect(undivided.carIds.length).toBe(1);
    expect(shared.carIds.length).toBe(EXPECTED_CARS);

    const sharedDelay = shared.scores[0]?.estimate.marginalDelaySeconds as number;
    const undividedDelay = undivided.scores[0]?.estimate.marginalDelaySeconds as number;
    expect(sharedDelay).toBeLessThan(undividedDelay);
    expect(shared.scores[0]?.estimate.etaSeconds).toBe(undivided.scores[0]?.estimate.etaSeconds);
  });

  it('divides the load, so the projected load factor is a third of the undivided one', () => {
    const cars = bank();
    const subject = call('9', 'up');

    const split = createDispatchPolicy(splitProfile());
    const single = createDispatchPolicy(singleCarProfile());
    split.register(subject, 0, { waitingPassengers: WAITING });
    single.register(subject, 0, { waitingPassengers: WAITING });

    const shared = split.dispatch(subject.id, cars, 0, { waitingPassengers: WAITING });
    const alone = single.dispatch(subject.id, cars, 0, { waitingPassengers: WAITING });

    const sharedLoad = shared.scores[0]?.estimate.resultingLoadFactor as number;
    const aloneLoad = alone.scores[0]?.estimate.resultingLoadFactor as number;
    expect(sharedLoad).toBeLessThan(aloneLoad);
    // Ten of a 1,350 kg car at 75 kg apiece.
    expect(sharedLoad).toBeCloseTo((EXPECTED_SHARE * 75) / 1350, 6);
  });

  it('admits three cars at a load ceiling that rejects every car at the whole queue', () => {
    // The consequence that actually loses passengers: pricing the whole landing to every car
    // projects a load none of them will carry, `maxLoadFactorForAssignment` then disqualifies all
    // of them, and the heaviest floor in the building gets no car at all. Splitting is what makes
    // them eligible, and it is triggered by the same large queue that would have disqualified them.
    const cars = bank();
    const subject = call('9', 'up');
    const CEILING = 0.7;

    const single = createDispatchPolicy(
      profile(
        { waitTime: 1 },
        {
          dispatch: { assignmentMode: 'single-car' },
          eligibility: { maxLoadFactorForAssignment: CEILING },
        },
      ),
    );
    const split = createDispatchPolicy(splitProfile(THRESHOLD, { maxLoadFactorForAssignment: CEILING }));

    single.register(subject, 0, { waitingPassengers: WAITING });
    split.register(subject, 0, { waitingPassengers: WAITING });

    const alone = single.dispatch(subject.id, cars, 0, { waitingPassengers: WAITING });
    const shared = split.dispatch(subject.id, cars, 0, { waitingPassengers: WAITING });

    expect(alone.outcome).toBe('unassigned');
    expect(alone.rejected.map((verdict) => verdict.reason)).toEqual(
      cars.map(() => 'loadFactorCeiling'),
    );
    expect(shared.outcome).toBe('assigned');
    expect(shared.carIds.length).toBe(EXPECTED_CARS);
  });

  it('narrows the split to the cars that are actually eligible, and prices at that width', () => {
    // The width and the share define each other. Two cars in service means fifteen each, not ten,
    // and the request has to say fifteen or the two cars that were named are priced for a landing
    // a third smaller than the one they will find.
    const parked = makeCar('C', '14');
    parked.setMode('out-of-service');
    const away = makeCar('D', '20');
    away.setMode('out-of-service');
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '6'), parked.snapshot(0), away.snapshot(0)];

    const subject = call('9', 'up');
    const policy = createDispatchPolicy(splitProfile());
    policy.register(subject, 0, { waitingPassengers: WAITING });
    const decision = policy.dispatch(subject.id, cars, 0, { waitingPassengers: WAITING });
    const verdicts = policy.eligible(subject, cars, 0, { waitingPassengers: WAITING });

    expect(decision.carIds.length).toBe(2);
    // The landing is divided two ways: fifteen each, not the ten a three-way split would have
    // priced. The published share is the division...
    expect(decision.boardingPassengersPerCar).toBe(15);
    for (const verdict of verdicts.filter((candidate) => candidate.eligible)) {
      // ...and the request each car prices is that share capped by its own remaining room, which
      // for an empty 1,350 kg car at 0.8 design load is fourteen people. Two effects, composed in
      // that order, and neither is the whole queue.
      expect(verdict.request.boardingPassengers).toBe(14);
      expect(verdict.request.boardingPassengers).not.toBe(WAITING);
    }
  });

  it('does not split a landing below the threshold', () => {
    // Two cars racing to a landing with four people on it wastes a car and a set of doors.
    const cars = bank();
    const subject = call('9', 'up');
    const policy = createDispatchPolicy(splitProfile());
    policy.register(subject, 0, { waitingPassengers: 4 });
    const decision = policy.dispatch(subject.id, cars, 0, { waitingPassengers: 4 });

    expect(decision.carIds.length).toBe(1);
    expect(decision.boardingPassengersPerCar).toBe(4);
  });

  it('caps a share at what the car has room for, and says so', () => {
    // Two effects compose: the landing is divided by the split, and then each car's share is capped
    // by its own remaining room. A car that holds fourteen is not offered fifteen.
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '6')];
    const subject = call('9', 'up');
    const policy = createDispatchPolicy(splitProfile(THRESHOLD));
    policy.register(subject, 0, { waitingPassengers: WAITING });
    const verdicts = policy.eligible(subject, cars, 0, { waitingPassengers: WAITING });

    for (const verdict of verdicts) {
      // 1,350 kg × 0.8 design load ÷ 75 kg = 14 people, so the 15-person share is capped at 14.
      expect(verdict.request.boardingPassengers).toBe(14);
    }
  });

  it('holds under the auction’s aggregation too', () => {
    // A bid to collect a third of a landing is not a bid to collect all of it. If the auction
    // priced the whole queue, sealed-bid equivalence would fail on exactly the profiles that split.
    const cars = bank();
    const subject = call('9', 'up');
    const auction = createAuctionPolicy(splitProfile(), { auction: { rounds: 2 } });
    auction.register(subject, 0, { waitingPassengers: WAITING });
    const decision = auction.dispatch(subject.id, cars, 0, { waitingPassengers: WAITING });

    expect(decision.carIds.length).toBe(EXPECTED_CARS);
    expect(decision.boardingPassengersPerCar).toBe(EXPECTED_SHARE);
    const outcome = auction.auction(subject.id);
    for (const bid of outcome?.openingBids ?? []) {
      expect(bid.estimate.resultingLoadFactor).toBeCloseTo((EXPECTED_SHARE * 75) / 1350, 6);
    }
  });

  it('leaves each car charging its own assumption when nobody counted the queue', () => {
    // A bare up/down button carries no count. There is nothing to divide, so the request omits the
    // boarding count entirely rather than dividing zero by three.
    const cars = bank();
    const subject = call('9', 'up');
    const policy = createDispatchPolicy(splitProfile());
    policy.register(subject, 0);
    const decision = policy.dispatch(subject.id, cars, 0);
    const verdicts = policy.eligible(subject, cars, 0);

    expect(decision.carIds.length).toBe(1);
    expect(decision.boardingPassengersPerCar).toBeUndefined();
    for (const verdict of verdicts) {
      expect(verdict.request.boardingPassengers).toBeUndefined();
    }
  });
});
