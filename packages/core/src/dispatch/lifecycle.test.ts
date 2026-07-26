import { describe, expect, it } from 'vitest';

import { resolveCar } from '../config/resolveCar.js';
import type { ElevatorSpecs, ResolvedCar } from '../config/types.js';
import { Car } from '../model/car/car.js';
import { createShaft, type CarShaft, type CarSnapshot } from '../model/car/types.js';
import { Passenger } from '../model/passenger.js';
import { hallCallId, type Direction } from '../model/types.js';

import {
  PARK_CALL_HORIZON,
  answerDecisionFor,
  assignmentWidth,
  batchKeyOf,
  clearsHysteresis,
  costRequestFor,
  expectedResponseSeconds,
  filterEligible,
  isCommitted,
  landingShare,
  moveSeconds,
  observationFor,
  repositionDecisionFor,
  requestForShare,
  scoreableAt,
  withBypassOverridden,
} from './lifecycle.js';
import { resolveDispatchConfig } from './policy.js';
import type { DispatchCall, DispatcherProfileSource, ResolvedDispatchConfig } from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures — the same round-number envelope as `estimateCost.test.ts`.
 * -------------------------------------------------------------------------- */

const REFERENCE_SPECS: ElevatorSpecs = {
  version: 1,
  units: { speed: 'm/s' },
  conventions: {
    personsPerRatedLoadUS: 'ratedLoadLb / 150',
    personsPerRatedLoadEN81: 'ratedLoadKg / 75',
    designLoadFactor: 0.8,
  },
  classes: [
    {
      id: 'round-numbers',
      name: 'Round numbers',
      ratedSpeedMps: { min: 0.5, max: 10, typical: 2.0 },
      maxRiseM: 600,
      maxFloors: 100,
      acceleration: { typical: 1.0, max: 1.2 },
      jerk: { typical: 1.0, max: 1.6 },
      capacityLbRange: [1000, 4000],
      application: 'Test fixture',
    },
  ],
  codeMinimumSpeedByRise: [],
  capacities: [{ ratedLoadLb: 3000, ratedLoadKg: 1350, personsUS: 20, use: 'Office' }],
  doors: {
    centerOpening: { openS: 2.0, closeS: 3.0 },
    sideOpening: { openS: 2.5, closeS: 4.0 },
    dwellCarCallS: { min: 2, max: 4, typical: 3 },
    dwellHallCallS: { min: 4, max: 7, typical: 5 },
  },
  timing: {
    motorStartDelayS: 0.5,
    levelingSettleS: { min: 0.5, max: 1.0, typical: 0.5 },
    passengerTransferS: { office: 1.2, residential: 1.75, hotel: 1.5 },
  },
  loadSensor: { hallCallBypassThreshold: 0.8, overloadAlarmThreshold: 1.1 },
  realWorldAnchors: [],
};

const SPEC: ResolvedCar = resolveCar(
  { id: 'A', spec: 'round-numbers', ratedLoadLb: 3000 },
  REFERENCE_SPECS,
);

const FLOOR_PITCH_M = 4;

function plainShaft(count = 21): CarShaft {
  return createShaft(
    Array.from({ length: count }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * FLOOR_PITCH_M,
    })),
  );
}

/** Floors 8 and above need the `exec` credential — the Secure Tower shape in miniature. */
function securedShaft(): CarShaft {
  return createShaft(
    Array.from({ length: 11 }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * FLOOR_PITCH_M,
      ...(index >= 8 ? { permittedCredentialGroups: ['exec'] } : {}),
    })),
  );
}

interface Clock {
  now(): number;
  set(t: number): void;
}

function clockAt(start = 0): Clock {
  let time = start;
  return {
    now: () => time,
    set: (t: number) => {
      time = t;
    },
  };
}

function makeCar(id = 'A', homeFloorId = '0', clock: Clock = clockAt(0), shaft = plainShaft()): Car {
  return new Car({ id, bankId: 'low', spec: SPEC, shaft, homeFloorId, clock });
}

function call(floorId: string, direction: Direction, registeredAt = 0): DispatchCall {
  return {
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: Number(floorId),
    direction,
    registeredAt,
  };
}

function configOf(profile: Partial<DispatcherProfileSource> = {}): ResolvedDispatchConfig {
  return resolveDispatchConfig({ id: 'probe', name: 'Probe', weights: {}, ...profile });
}

const DEFAULT_CONFIG = configOf();

function requestFor(subject: DispatchCall, config = DEFAULT_CONFIG, waiting?: number) {
  return costRequestFor(subject, config, observationFor(subject, waiting));
}

/** Fill a car past its 80% hall-call bypass threshold. 1350 kg rated; 0.8 is 1080 kg. */
function loadPast(car: Car, fraction: number, destinationFloorId = '9'): void {
  const target = SPEC.ratedLoadKg * fraction;
  let index = 0;
  while (car.loadKg < target) {
    car.board(
      new Passenger({
        id: `p${car.id}-${index}`,
        journeyId: `j${car.id}-${index}`,
        originFloorId: car.floorId,
        originFloorIndex: car.floorIndex,
        destinationFloorId,
        destinationFloorIndex: Number(destinationFloorId),
        massKg: 90,
        arrivedAt: 0,
      }),
      0,
    );
    index += 1;
  }
}

/* -------------------------------------------------------------------------- *
 * Stage 1 — registration
 * -------------------------------------------------------------------------- */

describe('stage 1: registration', () => {
  it('identifies a call by its floor and direction, one button each', () => {
    expect(batchKeyOf(call('7', 'up'))).toBe('7:up');
    expect(batchKeyOf(call('7', 'down'))).toBe('7:down');
  });

  it('adds the batch window, and the defer window only when deferring', () => {
    expect(scoreableAt(100, configOf({ dispatch: { batchWindowS: 2 } }))).toBe(102);
    // A defer window on an immediate dispatcher is inert, which is what `activeWhen` declares.
    expect(scoreableAt(100, configOf({ dispatch: { deferWindowS: 3 } }))).toBe(100);
    expect(
      scoreableAt(
        100,
        configOf({ dispatch: { batchWindowS: 2, assignmentTiming: 'deferred', deferWindowS: 3 } }),
      ),
    ).toBe(105);
  });

  describe('callType decides what the car is allowed to know', () => {
    const rich: DispatchCall = {
      ...call('5', 'up'),
      destinationFloorId: '9',
      credentialGroup: 'exec',
    };

    it('hides both under up/down buttons, even when the caller supplies them', () => {
      const request = requestFor(rich, configOf({ dispatch: { callType: 'up-down-buttons' } }));
      expect(request.destinationFloorId).toBeUndefined();
      expect(request.credentialGroup).toBeUndefined();
    });

    it('reveals the destination under destination entry', () => {
      const request = requestFor(rich, configOf({ dispatch: { callType: 'destination-entry' } }));
      expect(request.destinationFloorId).toBe('9');
      expect(request.credentialGroup).toBeUndefined();
    });

    it('reveals both under a mobile credential', () => {
      const request = requestFor(rich, configOf({ dispatch: { callType: 'mobile-credential' } }));
      expect(request.destinationFloorId).toBe('9');
      expect(request.credentialGroup).toBe('exec');
    });

    it('is what lets destination dispatch authorize and optimize in one step', () => {
      // The same call, the same car, two call types: only the one that knows the destination
      // can notice that the passenger may not go there.
      const car = makeCar('A', '0', clockAt(0), securedShaft()).snapshot(0);
      const unbadged: DispatchCall = { ...call('5', 'up'), destinationFloorId: '9' };

      const blind = filterEligible(
        [car],
        unbadged,
        requestFor(unbadged, configOf({ dispatch: { callType: 'up-down-buttons' } })),
        DEFAULT_CONFIG,
      );
      expect(blind[0]?.eligible).toBe(true);

      const knowing = filterEligible(
        [car],
        unbadged,
        requestFor(unbadged, configOf({ dispatch: { callType: 'destination-entry' } })),
        DEFAULT_CONFIG,
      );
      expect(knowing[0]?.eligible).toBe(false);
      expect(knowing[0]?.reason).toBe('destinationAccessDenied');
    });
  });

  it('counts a declared hall queue, and omits the count when nobody counted', () => {
    const subject = call('5', 'up');
    expect(requestFor(subject).boardingPassengers).toBeUndefined();
    expect(requestFor(subject, DEFAULT_CONFIG, 9).boardingPassengers).toBe(9);
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 2 — eligibility
 * -------------------------------------------------------------------------- */

describe('stage 2: eligibility is a hard filter, never a cost', () => {
  it('passes on the car’s own answers: service zoning, access zoning, service mode', () => {
    const short = makeCar('S', '0', clockAt(0), securedShaft()).snapshot(0);
    const subject = call('15', 'up');
    expect(filterEligible([short], subject, requestFor(subject), DEFAULT_CONFIG)[0]?.reason).toBe(
      'serviceZone',
    );

    const secured = makeCar('S', '0', clockAt(0), securedShaft()).snapshot(0);
    const upstairs = call('9', 'up');
    expect(
      filterEligible([secured], upstairs, requestFor(upstairs), DEFAULT_CONFIG)[0]?.reason,
    ).toBe('accessDenied');

    const parked = makeCar('P', '0');
    parked.setMode('out-of-service');
    const ordinary = call('5', 'up');
    expect(
      filterEligible([parked.snapshot(0)], ordinary, requestFor(ordinary), DEFAULT_CONFIG)[0]
        ?.reason,
    ).toBe('serviceMode');
  });

  it('rejects a reversal outright under the noDirectionReversal hard constraint', () => {
    const collective = configOf({ hardConstraints: ['noDirectionReversal'] });
    const car = makeCar('A', '4');
    car.registerCarCall('10'); // running up
    const snapshot = car.snapshot(0);

    const behind = call('2', 'up');
    const rejected = filterEligible([snapshot], behind, requestFor(behind), collective)[0];
    expect(rejected?.eligible).toBe(false);
    expect(rejected?.reason).toBe('hardConstraint');
    expect(rejected?.constraintId).toBe('noDirectionReversal');

    const ahead = call('8', 'up');
    expect(filterEligible([snapshot], ahead, requestFor(ahead), collective)[0]?.eligible).toBe(true);
  });

  it('leaves the same car eligible without the constraint — the difference is config alone', () => {
    const car = makeCar('A', '4');
    car.registerCarCall('10');
    const snapshot = car.snapshot(0);
    const behind = call('2', 'up');
    expect(
      filterEligible([snapshot], behind, requestFor(behind), DEFAULT_CONFIG)[0]?.eligible,
    ).toBe(true);
  });

  it('honours allowOppositeDirectionPickup independently of the hard constraint', () => {
    const strict = configOf({ eligibility: { allowOppositeDirectionPickup: false } });
    const car = makeCar('A', '4');
    car.registerCarCall('10'); // running up
    const snapshot = car.snapshot(0);

    const downCall = call('8', 'down');
    const verdict = filterEligible([snapshot], downCall, requestFor(downCall), strict)[0];
    expect(verdict?.eligible).toBe(false);
    expect(verdict?.reason).toBe('oppositeDirection');

    const upCall = call('8', 'up');
    expect(filterEligible([snapshot], upCall, requestFor(upCall), strict)[0]?.eligible).toBe(true);
  });

  it('refuses assignment above maxLoadFactorForAssignment, which is not the bypass threshold', () => {
    const car = makeCar('A', '0');
    loadPast(car, 0.55);
    const snapshot = car.snapshot(0);
    const subject = call('4', 'up');

    // The load cell is happy — it is well under its 0.8 bypass — but the dispatcher declines
    // to promise a car that would arrive this full.
    expect(snapshot.load.isBypassingHallCalls).toBe(false);
    const tight = configOf({ eligibility: { maxLoadFactorForAssignment: 0.5 } });
    const verdict = filterEligible([snapshot], subject, requestFor(subject), tight)[0];
    expect(verdict?.eligible).toBe(false);
    expect(verdict?.reason).toBe('loadFactorCeiling');

    expect(
      filterEligible([snapshot], subject, requestFor(subject), DEFAULT_CONFIG)[0]?.eligible,
    ).toBe(true);
  });

  describe('the sole-eligible-car starvation guard', () => {
    function fullCar(id: string): CarSnapshot {
      const car = makeCar(id, '0');
      loadPast(car, 0.85);
      return car.snapshot(0);
    }

    it('leaves a bypassing car ineligible by default', () => {
      const subject = call('4', 'up');
      const verdict = filterEligible([fullCar('A')], subject, requestFor(subject), DEFAULT_CONFIG)[0];
      expect(verdict?.eligible).toBe(false);
      expect(verdict?.reason).toBe('hallCallBypass');
    });

    it('admits it when it is the only car that could ever serve the floor', () => {
      const guarded = configOf({ answer: { allowBypassIfSoleEligibleCar: true } });
      const subject = call('4', 'up');
      const verdict = filterEligible([fullCar('A')], subject, requestFor(subject), guarded)[0];

      expect(verdict?.eligible).toBe(true);
      expect(verdict?.bypassOverridden).toBe(true);
      // And it carries a usable ETA rather than the Infinity a bypassing car reports, or the
      // scorer would rank the car it just admitted dead last.
      expect(Number.isFinite(verdict?.estimate.etaSeconds ?? Number.NaN)).toBe(true);
    });

    it('does not admit two full cars — waiting for one to unload is correct, not starvation', () => {
      const guarded = configOf({ answer: { allowBypassIfSoleEligibleCar: true } });
      const subject = call('4', 'up');
      const verdicts = filterEligible(
        [fullCar('A'), fullCar('B')],
        subject,
        requestFor(subject),
        guarded,
      );
      expect(verdicts.every((verdict) => !verdict.eligible)).toBe(true);
    });

    it('does not fire while any car is eligible', () => {
      const guarded = configOf({ answer: { allowBypassIfSoleEligibleCar: true } });
      const subject = call('4', 'up');
      const verdicts = filterEligible(
        [fullCar('A'), makeCar('B', '0').snapshot(0)],
        subject,
        requestFor(subject),
        guarded,
      );
      expect(verdicts[0]?.eligible).toBe(false);
      expect(verdicts[1]?.eligible).toBe(true);
    });
  });

  it('overrides the bypass by building a new snapshot, never by mutating one', () => {
    const car = makeCar('A', '0');
    loadPast(car, 0.85);
    const snapshot = car.snapshot(0);
    const overridden = withBypassOverridden(snapshot);

    expect(overridden).not.toBe(snapshot);
    expect(snapshot.load.isBypassingHallCalls).toBe(true);
    expect(overridden.load.isBypassingHallCalls).toBe(false);
    expect(overridden.load.massKg).toBe(snapshot.load.massKg);
    expect(car.isBypassingHallCalls).toBe(true);
  });

  it('returns verdicts in the order the cars were supplied, with one estimate each', () => {
    const cars = [makeCar('C', '3').snapshot(0), makeCar('A', '9').snapshot(0)];
    const subject = call('5', 'up');
    const verdicts = filterEligible(cars, subject, requestFor(subject), DEFAULT_CONFIG);
    expect(verdicts.map((verdict) => verdict.carId)).toEqual(['C', 'A']);
    expect(verdicts.every((verdict) => verdict.estimate !== undefined)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 4 — assignment
 * -------------------------------------------------------------------------- */

describe('stage 4: assignment width', () => {
  it('is always one car under single-car mode', () => {
    expect(assignmentWidth(DEFAULT_CONFIG, 4, 40)).toBe(1);
  });

  it('splits only above the threshold, and by how far above', () => {
    const split = configOf({
      dispatch: { assignmentMode: 'split-demand', splitThresholdPassengers: 12 },
    });
    expect(assignmentWidth(split, 4, 5)).toBe(1);
    expect(assignmentWidth(split, 4, 12)).toBe(1);
    expect(assignmentWidth(split, 4, 13)).toBe(2);
    expect(assignmentWidth(split, 4, 30)).toBe(3);
  });

  it('never allocates more cars than are eligible', () => {
    const split = configOf({
      dispatch: { assignmentMode: 'split-demand', splitThresholdPassengers: 4 },
    });
    expect(assignmentWidth(split, 2, 100)).toBe(2);
    expect(assignmentWidth(split, 0, 100)).toBe(0);
  });

  it('divides the landing between the cars it named', () => {
    // Naming three cars for twenty people and then asking each of them to price twenty is the
    // "a landing of thirty is not thirty boarders" error one level up.
    expect(landingShare(20, 3)).toBe(7);
    expect(landingShare(12, 1)).toBe(12);
    // Ceiling, not floor: three cars taking six each leave two people on the landing.
    expect(landingShare(20, 3)).toBeGreaterThanOrEqual(20 / 3);
    // Nothing to divide, and nothing to divide it between.
    expect(landingShare(0, 3)).toBeUndefined();
    expect(landingShare(20, 0)).toBeUndefined();
  });

  it('prices a share at a consistent mass per person, and leaves an uncounted call alone', () => {
    const subject = call('5', 'up');
    const counted = { ...requestFor(subject, DEFAULT_CONFIG, 20), boardingMassKg: 1600 };

    const share = requestForShare(counted, 7);
    expect(share.boardingPassengers).toBe(7);
    expect(share.boardingMassKg).toBeCloseTo((1600 * 7) / 20, 9);
    // 80 kg a head before the split, 80 kg a head after it.
    expect((share.boardingMassKg ?? 0) / (share.boardingPassengers ?? 1)).toBeCloseTo(
      1600 / 20,
      9,
    );

    // A share no smaller than the queue divides nothing, and a call nobody counted has
    // nothing to divide — the car then charges its own assumedBoardingPassengers.
    expect(requestForShare(counted, 20)).toBe(counted);
    expect(requestForShare(counted, 25)).toBe(counted);
    const uncounted = requestFor(subject);
    expect(requestForShare(uncounted, 7)).toBe(uncounted);
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 5 — commitment and hysteresis
 * -------------------------------------------------------------------------- */

describe('stage 5: commitment', () => {
  const subject = call('10', 'up');

  function movingTowardTen(at: number): CarSnapshot {
    const clock = clockAt(0);
    const car = makeCar('A', '0', clock);
    car.registerCarCall('10');
    car.departFor('10', 0);
    clock.set(at);
    return car.snapshot(at);
  }

  it('commits immediately under on-assignment', () => {
    const config = configOf({ dispatch: { commitmentPoint: 'on-assignment' } });
    expect(isCommitted(makeCar('A', '0').snapshot(0), subject, config, 0)).toBe(true);
  });

  it('commits at the real deceleration phase under on-deceleration', () => {
    const config = configOf({ dispatch: { commitmentPoint: 'on-deceleration' } });
    // 40 m at V=2, A=1, J=1: 23 s of profile, decelerating over the last 3 s, so the
    // jerkToDecel phase starts 20 s in and the profile begins at t = 0.5.
    expect(isCommitted(movingTowardTen(5), subject, config, 5)).toBe(false);
    expect(isCommitted(movingTowardTen(15), subject, config, 15)).toBe(false);
    expect(isCommitted(movingTowardTen(22), subject, config, 22)).toBe(true);
  });

  it('stays committed once the car has arrived — commitment is irrevocable', () => {
    const config = configOf({ dispatch: { commitmentPoint: 'on-deceleration' } });
    const clock = clockAt(0);
    const car = makeCar('A', '0', clock);
    car.registerCarCall('10');
    const motion = car.departFor('10', 0);
    clock.set(motion.arrivesAt);
    car.completeArrival(motion.arrivesAt);
    expect(isCommitted(car.snapshot(motion.arrivesAt), subject, config, motion.arrivesAt)).toBe(true);
  });

  it('waits for the doors under on-door-open', () => {
    const config = configOf({ dispatch: { commitmentPoint: 'on-door-open' } });
    const clock = clockAt(0);
    const car = makeCar('A', '0', clock);
    car.registerCarCall('10');
    const motion = car.departFor('10', 0);
    clock.set(motion.arrivesAt);
    car.completeArrival(motion.arrivesAt);

    expect(isCommitted(car.snapshot(motion.arrivesAt), subject, config, motion.arrivesAt)).toBe(false);
    car.openDoors(motion.arrivesAt);
    expect(isCommitted(car.snapshot(motion.arrivesAt), subject, config, motion.arrivesAt)).toBe(true);
  });

  it('is nested: on-assignment ⊇ on-deceleration ⊇ on-door-open', () => {
    const car = movingTowardTen(22);
    expect(isCommitted(car, subject, configOf({ dispatch: { commitmentPoint: 'on-assignment' } }), 22)).toBe(true);
    expect(isCommitted(car, subject, configOf({ dispatch: { commitmentPoint: 'on-deceleration' } }), 22)).toBe(true);
    expect(isCommitted(car, subject, configOf({ dispatch: { commitmentPoint: 'on-door-open' } }), 22)).toBe(false);
  });

  it('does not commit a car decelerating for some other floor', () => {
    const config = configOf({ dispatch: { commitmentPoint: 'on-deceleration' } });
    expect(isCommitted(movingTowardTen(22), call('6', 'up'), config, 22)).toBe(false);
  });
});

describe('stage 5: hysteresis', () => {
  it('requires both a cheaper cost and a materially shorter wait', () => {
    // Cheaper but barely faster: no switch. This is the anti-thrash condition.
    expect(clearsHysteresis(1.0, 40, 0.99, 39.5, 5)).toBe(false);
    // Cheaper and eight seconds faster: switch.
    expect(clearsHysteresis(1.0, 40, 0.7, 32, 5)).toBe(true);
    // Faster but not cheaper: the cost function decides which car is better, not the ETA.
    expect(clearsHysteresis(1.0, 40, 1.2, 20, 5)).toBe(false);
  });

  it('lets any improvement through at zero hysteresis', () => {
    expect(clearsHysteresis(1.0, 40, 0.9, 40, 0)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 6 — answering
 * -------------------------------------------------------------------------- */

describe('stage 6: answering', () => {
  const subject = call('4', 'up');

  it('stops for a call it holds while standing at the floor', () => {
    const car = makeCar('A', '4').snapshot(0);
    expect(answerDecisionFor(car, subject, DEFAULT_CONFIG, ['A'], [car])).toMatchObject({
      answer: true,
      reason: 'assigned',
    });
  });

  it('does not stop for a call assigned to somebody else', () => {
    const car = makeCar('A', '4').snapshot(0);
    expect(answerDecisionFor(car, subject, DEFAULT_CONFIG, ['B'], [car]).reason).toBe('not-assigned');
  });

  it('does not stop at a floor it is not at', () => {
    const car = makeCar('A', '7').snapshot(0);
    expect(answerDecisionFor(car, subject, DEFAULT_CONFIG, ['A'], [car]).reason).toBe('not-at-floor');
  });

  it('bypasses on load, and the load cell owns that threshold rather than the dispatcher', () => {
    const car = makeCar('A', '4');
    loadPast(car, 0.85);
    const snapshot = car.snapshot(0);
    const other = makeCar('B', '0').snapshot(0);
    expect(answerDecisionFor(snapshot, subject, DEFAULT_CONFIG, ['A'], [snapshot, other])).toMatchObject({
      answer: false,
      reason: 'bypassing-load',
    });
  });

  it('overrides the bypass when no other car could serve the floor', () => {
    const guarded = configOf({ answer: { allowBypassIfSoleEligibleCar: true } });
    const car = makeCar('A', '4');
    loadPast(car, 0.85);
    const snapshot = car.snapshot(0);
    expect(answerDecisionFor(snapshot, subject, guarded, ['A'], [snapshot])).toMatchObject({
      answer: true,
      reason: 'sole-eligible-override',
    });

    // With a second car in the group that reaches the floor, it is no longer sole.
    const other = makeCar('B', '0').snapshot(0);
    expect(answerDecisionFor(snapshot, subject, guarded, ['A'], [snapshot, other]).answer).toBe(false);
  });

  it('will not claim to be the sole car when nobody said what the group is', () => {
    // "No other car could serve this floor" is a claim about the bank. An omitted group is
    // not that claim, and defaulting it to [car] would make the override fire in every bank.
    const guarded = configOf({ answer: { allowBypassIfSoleEligibleCar: true } });
    const car = makeCar('A', '4');
    loadPast(car, 0.85);
    const snapshot = car.snapshot(0);

    expect(answerDecisionFor(snapshot, subject, guarded, ['A'], undefined)).toMatchObject({
      answer: false,
      reason: 'bypassing-load',
    });
    // The same car, the same config, with the group actually supplied.
    expect(answerDecisionFor(snapshot, subject, guarded, ['A'], [snapshot]).reason).toBe(
      'sole-eligible-override',
    );
  });

  it('refuses an opposite-direction pickup when the profile forbids one', () => {
    const strict = configOf({ eligibility: { allowOppositeDirectionPickup: false } });
    const car = makeCar('A', '4');
    car.registerCarCall('10'); // facing up
    const snapshot = car.snapshot(0);
    const downCall = call('4', 'down');
    expect(answerDecisionFor(snapshot, downCall, strict, ['A'], [snapshot]).reason).toBe(
      'direction-mismatch',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 7 — repositioning
 * -------------------------------------------------------------------------- */

describe('stage 7: repositioning', () => {
  const entrances = ['0'];

  it('leaves the car where it is under the default `stay`', () => {
    const car = makeCar('A', '15').snapshot(0);
    expect(repositionDecisionFor(car, DEFAULT_CONFIG, { entranceFloorIds: entrances })).toMatchObject({
      move: false,
      reason: 'parked',
    });
  });

  it('sends a car back to the lobby, and knows when it is already there', () => {
    const config = configOf({ idle: { parkingStrategy: 'lobby' } });
    const away = makeCar('A', '15').snapshot(0);
    const decision = repositionDecisionFor(away, config, { entranceFloorIds: entrances });
    expect(decision).toMatchObject({ move: true, targetFloorId: '0', reason: 'reposition' });
    expect(decision.travelSeconds).toBeGreaterThan(0);
    expect(decision.netGainS).toBeGreaterThanOrEqual(config.idle.repositionThresholdS);

    const home = makeCar('A', '0').snapshot(0);
    expect(repositionDecisionFor(home, config, { entranceFloorIds: entrances })).toMatchObject({
      move: false,
      reason: 'already-there',
    });
  });

  it('reports no target when no entrance is on this shaft', () => {
    const config = configOf({ idle: { parkingStrategy: 'lobby' } });
    const car = makeCar('A', '15').snapshot(0);
    expect(repositionDecisionFor(car, config, { entranceFloorIds: ['B2'] }).reason).toBe('no-target');
  });

  it('parks at the median floor of the zone under zone-center', () => {
    const config = configOf({ idle: { parkingStrategy: 'zone-center' } });
    const car = makeCar('A', '0').snapshot(0);
    // Floors 0..20: the median index is 10.
    expect(repositionDecisionFor(car, config).targetFloorId).toBe('10');
    // An operational zone overrides the shaft's own extent — operational zoning is a
    // dispatcher strategy, not a property of the shaft.
    expect(
      repositionDecisionFor(car, config, { zoneFloorIds: ['14', '15', '16', '17', '18'] })
        .targetFloorId,
    ).toBe('16');
  });

  it('actually moves the car under zone-center’s own declared defaults', () => {
    // The regression that matters more than the target floor: naming a target and then never
    // moving is a strategy that does nothing, and asserting only `targetFloorId` cannot see
    // it. A car at the bottom of a 21-floor shaft under `zone-center` and nothing else must
    // drive to the middle.
    const config = configOf({ idle: { parkingStrategy: 'zone-center' } });
    for (const floorId of ['0', '20']) {
      const decision = repositionDecisionFor(makeCar('A', floorId).snapshot(0), config);
      expect(decision, `from floor ${floorId}`).toMatchObject({
        move: true,
        targetFloorId: '10',
        reason: 'reposition',
      });
      expect(decision.netGainS, `from floor ${floorId}`).toBeGreaterThanOrEqual(
        config.idle.repositionThresholdS,
      );
    }

    // And a car already near the middle stays: a deadband that vetoes everything and a
    // deadband that vetoes nothing are equally useless.
    expect(repositionDecisionFor(makeCar('A', '8').snapshot(0), config)).toMatchObject({
      move: false,
      reason: 'below-threshold',
    });
  });

  it('amortises the one-off trip over the calls the park will answer', () => {
    // The saving is per call and the trip is one-off; subtracting them raw asked a park to
    // repay a whole journey out of a single call, which no park in a real shaft can do.
    const config = configOf({
      idle: { parkingStrategy: 'zone-center', repositionEnergyWeight: 1.4 },
    });
    const decision = repositionDecisionFor(makeCar('A', '0').snapshot(0), config);

    expect(decision.netGainS).toBeCloseTo(
      decision.anticipatedSavingS - (1.4 * decision.travelSeconds) / PARK_CALL_HORIZON,
      9,
    );
    // `travelSeconds` is still the real one-off trip, not the amortised figure.
    expect(decision.travelSeconds).toBeCloseTo(moveSeconds(makeCar('A', '0').snapshot(0), 0, 40), 9);
  });

  it('needs a forecast for predicted-demand, and says so rather than guessing', () => {
    const config = configOf({ idle: { parkingStrategy: 'predicted-demand' } });
    const car = makeCar('A', '0').snapshot(0);
    expect(repositionDecisionFor(car, config).reason).toBe('no-forecast');

    const forecast = new Map([['12', 40], ['3', 5]]);
    expect(repositionDecisionFor(car, config, { demandForecast: forecast })).toMatchObject({
      move: true,
      targetFloorId: '12',
    });
  });

  it('will not move for a gain below repositionThresholdS', () => {
    const patient = configOf({
      idle: { parkingStrategy: 'lobby', repositionThresholdS: 500 },
    });
    const car = makeCar('A', '15').snapshot(0);
    const decision = repositionDecisionFor(car, patient, { entranceFloorIds: entrances });
    expect(decision.move).toBe(false);
    expect(decision.reason).toBe('below-threshold');
    expect(decision.anticipatedSavingS).toBeGreaterThan(0);
  });

  it('trades the saving against energy through repositionEnergyWeight', () => {
    const car = makeCar('A', '20').snapshot(0);
    const free = configOf({
      idle: { parkingStrategy: 'lobby', repositionThresholdS: 0, repositionEnergyWeight: 0 },
    });
    const costly = configOf({
      idle: { parkingStrategy: 'lobby', repositionThresholdS: 0, repositionEnergyWeight: 2 },
    });

    const cheap = repositionDecisionFor(car, free, { entranceFloorIds: entrances });
    const dear = repositionDecisionFor(car, costly, { entranceFloorIds: entrances });
    expect(cheap.anticipatedSavingS).toBeCloseTo(dear.anticipatedSavingS, 9);
    expect(dear.netGainS).toBeLessThan(cheap.netGainS);
    expect(cheap.move).toBe(true);
    expect(dear.move).toBe(false);

    // Both ends of the declared [0, 2] range still bite, which is why the amortisation
    // horizon is 2: with one entrance the implied demand model puts everything on the target,
    // so the saving *is* the trip, and the top of the range lands exactly on break-even.
    expect(dear.anticipatedSavingS).toBeCloseTo(dear.travelSeconds, 9);
    expect(dear.netGainS).toBeCloseTo(0, 9);
  });

  it('leaves a car with work to do alone', () => {
    const config = configOf({ idle: { parkingStrategy: 'lobby' } });
    const busy = makeCar('A', '15');
    busy.registerCarCall('18');
    expect(
      repositionDecisionFor(busy.snapshot(0), config, { entranceFloorIds: entrances }).reason,
    ).toBe('busy');
  });

  it('builds its expectation from the real S-curve, not distance over rated speed', () => {
    const car = makeCar('A', '0').snapshot(0);
    // Every hop from the bottom of a 21-floor shaft, averaged. Naive 40 m / 2 m/s would be
    // 20 s for the top floor alone; the S-curve costs more, and the fixed motor-start and
    // levelling terms are charged per move.
    const fromBottom = expectedResponseSeconds(car, 0);
    const fromMiddle = expectedResponseSeconds(car, 10 * FLOOR_PITCH_M);
    expect(fromMiddle).toBeLessThan(fromBottom);
    expect(moveSeconds(car, 0, 0)).toBe(0);
    expect(moveSeconds(car, 0, 40)).toBeCloseTo(0.5 + 23 + 0.5, 9);
  });

  it('weights the expectation by the forecast when one is supplied', () => {
    const car = makeCar('A', '0').snapshot(0);
    const topHeavy = new Map([['20', 100]]);
    expect(expectedResponseSeconds(car, 20 * FLOOR_PITCH_M, topHeavy)).toBe(0);
    expect(expectedResponseSeconds(car, 0, topHeavy)).toBeGreaterThan(0);
  });
});
