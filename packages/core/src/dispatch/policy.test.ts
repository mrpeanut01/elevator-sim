import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import { resolveCar } from '../config/resolveCar.js';
import { parseDispatcherProfiles } from '../config/parse.js';
import { PARKING_STRATEGIES } from '../config/types.js';
import type {
  DispatcherProfile,
  DispatcherProfiles,
  ElevatorSpecs,
  ParkingStrategy,
  ResolvedCar,
} from '../config/types.js';
import { Car } from '../model/car/car.js';
import { createShaft, shaftForBank, type CarShaft, type CarSnapshot } from '../model/car/types.js';
import { Passenger } from '../model/passenger.js';
import { hallCallId, type Direction, type HallCall } from '../model/types.js';

import { createDispatchPolicy, resolveDispatchConfig } from './policy.js';
import { DECLARED_TERM_IDS, IMPLEMENTED_TERM_IDS, isDeclaredTerm } from './terms/index.js';
import {
  DispatchError,
  type DispatchCall,
  type DispatcherProfileSource,
  type RepositionContext,
} from './types.js';

type DispatchStage = NonNullable<DispatcherProfileSource['dispatch']>;

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

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
    passengerTransferS: { office: 1.2, residential: 1.75, hotel: 1.5, hospital: 2.5 },
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

function makeCar(id: string, homeFloorId: string, clock: Clock = clockAt(0)): Car {
  return new Car({
    id,
    bankId: 'low',
    spec: SPEC,
    shaft: plainShaft(),
    homeFloorId,
    clock,
  });
}

function snapshotAt(id: string, floorId: string): CarSnapshot {
  return makeCar(id, floorId).snapshot(0);
}

function call(floorId: string, direction: Direction = 'up', registeredAt = 0): DispatchCall {
  return {
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: Number(floorId),
    direction,
    registeredAt,
  };
}

/** Fill a car past a fraction of its 1,350 kg rated load. */
function loadPast(car: Car, fraction: number, destinationFloorId = '19'): void {
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
 * Every profile in data/dispatcher-profiles.json builds a working policy
 * -------------------------------------------------------------------------- */

describe('every dispatcher in data/dispatcher-profiles.json', () => {
  let file: DispatcherProfiles;

  beforeAll(async () => {
    const raw = JSON.parse(
      await readFile(join(REAL_DATA_DIR, 'dispatcher-profiles.json'), 'utf8'),
    ) as unknown;
    file = parseDispatcherProfiles(raw, join(REAL_DATA_DIR, 'dispatcher-profiles.json'));
  });

  it('is a weight vector over one engine, and there is more than one of them', () => {
    expect(file.profiles.length).toBeGreaterThan(1);
    expect(file.normalization.required).toBe(true);
  });

  it('builds a policy and makes a decision, without exception', () => {
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '6'), snapshotAt('C', '14')];
    const subject = call('9', 'up');

    for (const profile of file.profiles) {
      const policy = createDispatchPolicy(profile);
      const lifecycle = policy.register(subject, 0);
      // `predictive-balanced` defers by 1.5 s; asking at its own `scoreableAt` is how a
      // runner would schedule it, and is the one call site that has to respect stage 4.
      const decision = policy.dispatch(subject.id, cars, lifecycle.scoreableAt);

      expect(decision.outcome, profile.id).toBe('assigned');
      expect(decision.primaryCarId, profile.id).toBeDefined();
      expect(decision.scores.length, profile.id).toBe(cars.length);
      expect(Number.isFinite(decision.cost ?? Number.NaN), profile.id).toBe(true);
    }
  });

  it('resolves every weight a profile authors, in registry order, with nothing left pending', () => {
    // This test pinned the pre-Phase-5 state, where `predictive-balanced` weighted eleven of the
    // twelve declared terms and only three were implemented, so eight landed in `pendingWeights`.
    // All twelve are implemented now: every authored weight must resolve, and a weight the engine
    // silently parked would be a profile scoring less than it says it does.
    const predictive = file.profiles.find((profile) => profile.id === 'predictive-balanced');
    expect(predictive).toBeDefined();

    const config = resolveDispatchConfig(predictive as DispatcherProfile);
    const authored = Object.keys(predictive?.weights ?? {});
    expect(config.pendingWeights.size).toBe(0);
    expect(config.weights.size).toBe(authored.length);
    // Registry order, not the profile's key order: two profiles weighting the same terms must
    // accumulate them in the same sequence to get bit-identical costs.
    expect([...config.weights.keys()]).toEqual(
      IMPLEMENTED_TERM_IDS.filter((id) => authored.includes(id)),
    );
    for (const [id, weight] of config.weights) {
      expect(weight, id).toBe((predictive?.weights as Record<string, number>)[id]);
    }
  });

  it('resolves each profile’s declared stage settings rather than silently defaulting them', () => {
    const predictive = file.profiles.find((profile) => profile.id === 'predictive-balanced');
    const config = resolveDispatchConfig(predictive as DispatcherProfile);

    expect(config.dispatch.assignmentTiming).toBe('deferred');
    expect(config.dispatch.deferWindowS).toBe(1.5);
    expect(config.dispatch.assignmentMode).toBe('split-demand');
    expect(config.dispatch.splitThresholdPassengers).toBe(12);
    expect(config.dispatch.reassignmentPolicy).toBe('until-commitment');
    expect(config.dispatch.commitmentPoint).toBe('on-deceleration');
    expect(config.dispatch.reassignmentHysteresisS).toBe(4);
    expect(config.dispatch.maxReassignmentsPerCall).toBe(3);
    expect(config.answer.allowBypassIfSoleEligibleCar).toBe(false);
    expect(config.idle.parkingStrategy).toBe('predicted-demand');
    expect(config.idle.repositionThresholdS).toBe(8);
    expect(config.idle.repositionEnergyWeight).toBe(0.2);
  });

  it('weights only terms the library declares, so a typo cannot reach the engine', () => {
    const declared = new Set(file.terms.map((term) => term.id));
    for (const profile of file.profiles) {
      for (const termId of Object.keys(profile.weights)) {
        expect(declared.has(termId), `${profile.id} weights ${termId}`).toBe(true);
      }
    }
  });

  it('is the library the resolver checks against, term for term', () => {
    // `DECLARED_TERM_IDS` is what `resolveDispatchConfig` rejects a misspelled weight against,
    // and it is a copy of this file's `terms` because the dispatch package is pure and never
    // reads the filesystem. Pinned in both directions so the copy cannot drift: a term added
    // to the library and not to the constant would be rejected as a typo, and one removed
    // from the library but left in the constant would be silently accepted.
    expect(DECLARED_TERM_IDS).toEqual(file.terms.map((term) => term.id));
  });
});

/* -------------------------------------------------------------------------- *
 * ROADMAP ACCEPTANCE: nearest-car and collective, by config alone
 * -------------------------------------------------------------------------- */

describe('nearest-car and collective are reproduced by config, with no code path of their own', () => {
  // The two profiles exactly as `data/dispatcher-profiles.json` declares them.
  const NEAREST_CAR = { id: 'nearest-car', name: 'Nearest car', weights: { distanceTravelled: 1 } };
  const ETA = { id: 'eta', name: 'Minimum estimated wait', weights: { waitTime: 1 } };
  const COLLECTIVE = {
    id: 'collective',
    name: 'Conventional collective',
    weights: { waitTime: 1 },
    hardConstraints: ['noDirectionReversal'],
  };

  it('is the same class for both — there is no NearestCarDispatcher', () => {
    const nearest = createDispatchPolicy(NEAREST_CAR);
    const collective = createDispatchPolicy(COLLECTIVE);
    expect(collective.constructor).toBe(nearest.constructor);
    expect(nearest.engine).toBe('weighted-cost');
    expect(collective.engine).toBe('weighted-cost');
  });

  it('nearest-car picks the physically closest car', () => {
    const policy = createDispatchPolicy(NEAREST_CAR);
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '5'), snapshotAt('C', '14')];
    const subject = call('6', 'up');

    policy.register(subject, 0);
    expect(policy.dispatch(subject.id, cars, 0).primaryCarId).toBe('B');
  });

  it('nearest-car is invariant to its normalization reference — a monotone map cannot reorder one term', () => {
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '5'), snapshotAt('C', '14')];
    const subject = call('6', 'up');
    for (const distanceM of [2, 30, 500]) {
      const policy = createDispatchPolicy(NEAREST_CAR, { normalization: { distanceM } });
      policy.register(subject, 0);
      expect(policy.dispatch(subject.id, cars, 0).primaryCarId, `distanceM=${distanceM}`).toBe('B');
    }
  });

  it('nearest-car and eta disagree, and the disagreement comes only from the weight vector', () => {
    // Car N is at the lobby with five stops already booked and floor 6 among them, so the
    // call adds **no** travel at all — the cheapest possible answer for an energy proxy — but
    // it is five door cycles away. Car F is idle four floors off: further, and far sooner.
    const busy = makeCar('N', '0');
    for (const floorId of ['1', '2', '3', '4', '5', '6']) busy.registerCarCall(floorId);
    const cars = [busy.snapshot(0), snapshotAt('F', '10')];
    const subject = call('6', 'up');

    const nearest = createDispatchPolicy(NEAREST_CAR);
    nearest.register(subject, 0);
    const byDistance = nearest.dispatch(subject.id, cars, 0);

    const eta = createDispatchPolicy(ETA);
    eta.register(subject, 0);
    const byWait = eta.dispatch(subject.id, cars, 0);

    expect(byDistance.primaryCarId).toBe('N');
    expect(byWait.primaryCarId).toBe('F');
  });

  it('collective’s noDirectionReversal genuinely prevents a reversal', () => {
    // Car A is standing at 4 with 6 booked, so it is running up; car B is idle at 20. A call
    // at floor 3 going up would make A turn round twice — down to 3, then up again — and A is
    // still the fastest answer, so only a hard constraint can stop it.
    const running = makeCar('A', '4');
    running.registerCarCall('6');
    const cars = [running.snapshot(0), snapshotAt('B', '20')];
    const subject = call('3', 'up');

    const eta = createDispatchPolicy(ETA);
    eta.register(subject, 0);
    const unconstrained = eta.dispatch(subject.id, cars, 0);
    expect(unconstrained.primaryCarId).toBe('A');

    const collective = createDispatchPolicy(COLLECTIVE);
    collective.register(subject, 0);
    const constrained = collective.dispatch(subject.id, cars, 0);

    expect(constrained.primaryCarId).toBe('B');
    expect(constrained.rejected.map((verdict) => verdict.carId)).toEqual(['A']);
    expect(constrained.rejected[0]?.reason).toBe('hardConstraint');
    expect(constrained.rejected[0]?.constraintId).toBe('noDirectionReversal');
  });

  it('collective leaves a call unassigned rather than reversing a car for it', () => {
    // The only car in the group is running up; a call below it cannot be served without a
    // reversal, so it waits — which is exactly what a collective controller does.
    const running = makeCar('A', '4');
    running.registerCarCall('10');
    const policy = createDispatchPolicy(COLLECTIVE);
    const subject = call('2', 'up');

    policy.register(subject, 0);
    const decision = policy.dispatch(subject.id, [running.snapshot(0)], 0);
    expect(decision.outcome).toBe('unassigned');
    expect(decision.reason).toBe('no-eligible-car');
    expect(policy.lifecycle(subject.id)?.carIds).toEqual([]);
  });

  it('collective assigns the moment a car is going the right way', () => {
    const running = makeCar('A', '4');
    running.registerCarCall('10');
    const policy = createDispatchPolicy(COLLECTIVE);
    const ahead = call('8', 'up');

    policy.register(ahead, 0);
    expect(policy.dispatch(ahead.id, [running.snapshot(0)], 0).primaryCarId).toBe('A');
  });

  it('no decision depends on the profile id (CLAUDE.md invariant 7)', () => {
    // The strongest form of the check: rename every profile and assert that nothing moves. A
    // single `if (profile.id === ...)` anywhere in dispatch/ fails this.
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '7'), snapshotAt('C', '15')];
    const subject = call('9', 'up');

    for (const profile of [NEAREST_CAR, ETA, COLLECTIVE]) {
      const named = createDispatchPolicy(profile);
      const scrambled = createDispatchPolicy({ ...profile, id: 'zzz-anonymous', name: 'Anonymous' });

      named.register(subject, 0);
      scrambled.register(subject, 0);
      const a = named.dispatch(subject.id, cars, 0);
      const b = scrambled.dispatch(subject.id, cars, 0);

      expect(b.primaryCarId).toBe(a.primaryCarId);
      expect(b.carIds).toEqual(a.carIds);
      expect(b.cost).toBe(a.cost);
      expect(b.scores.map((score) => [score.carId, score.cost])).toEqual(
        a.scores.map((score) => [score.carId, score.cost]),
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Determinism
 * -------------------------------------------------------------------------- */

describe('determinism', () => {
  it('makes the identical decision 100 times from the same state', () => {
    const subject = call('9', 'up');
    const build = (): readonly CarSnapshot[] => {
      const busy = makeCar('B', '12');
      busy.registerCarCall('3');
      return [snapshotAt('A', '0'), busy.snapshot(0), snapshotAt('C', '18')];
    };

    let expected: string | undefined;
    for (let run = 0; run < 100; run += 1) {
      const policy = createDispatchPolicy({
        id: 'balanced',
        name: 'Balanced',
        weights: { waitTime: 0.6, distanceTravelled: 0.3, directionReversal: 0.1 },
      });
      policy.register(subject, 0);
      const decision = policy.dispatch(subject.id, build(), 0);
      const signature = JSON.stringify({
        outcome: decision.outcome,
        carIds: decision.carIds,
        cost: decision.cost,
        scores: decision.scores.map((score) => [score.carId, score.cost, score.terms]),
        rejected: decision.rejected.map((verdict) => [verdict.carId, verdict.reason]),
      });
      expected ??= signature;
      expect(signature).toBe(expected);
    }
  });

  it('does not depend on the order the cars were supplied', () => {
    const subject = call('9', 'up');
    const forward = [snapshotAt('A', '4'), snapshotAt('B', '14'), snapshotAt('C', '4')];
    const backward = [...forward].reverse();

    const one = createDispatchPolicy({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    const two = createDispatchPolicy({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    one.register(subject, 0);
    two.register(subject, 0);

    // A and C are equidistant: the tie is broken by car id, not by argument order.
    expect(one.dispatch(subject.id, forward, 0).primaryCarId).toBe('A');
    expect(two.dispatch(subject.id, backward, 0).primaryCarId).toBe('A');
  });

  it('is reset to a clean slate between replications', () => {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    const subject = call('9', 'up');
    policy.register(subject, 0);
    policy.dispatch(subject.id, [snapshotAt('A', '0')], 0);
    expect(policy.calls).toHaveLength(1);

    policy.reset();
    expect(policy.calls).toHaveLength(0);
    expect(policy.lifecycle(subject.id)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 1 and 4 — batching and deferral
 * -------------------------------------------------------------------------- */

describe('registration and deferred assignment', () => {
  const weights = { waitTime: 1 };

  it('defers until the batch window closes, and says when to ask again', () => {
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: { batchWindowS: 2 },
    });
    const subject = call('5', 'up');
    policy.register(subject, 10);

    const early = policy.dispatch(subject.id, [snapshotAt('A', '0')], 10.5);
    expect(early.outcome).toBe('deferred');
    expect(early.reason).toBe('awaiting-batch-window');
    expect(early.dueAt).toBe(12);

    expect(policy.dispatch(subject.id, [snapshotAt('A', '0')], 12).outcome).toBe('assigned');
  });

  it('merges a second press at the same landing into the open batch', () => {
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: { batchWindowS: 3 },
    });
    const first = policy.register(call('5', 'up'), 0, { waitingPassengers: 2 });
    const second = policy.register(
      { ...call('5', 'up'), id: 'second-arrival' },
      1,
      { waitingPassengers: 3 },
    );

    expect(second.callId).toBe(first.callId);
    expect(second.waitingPassengers).toBe(5);
    expect(policy.calls).toHaveLength(1);
  });

  it('does not restart the clock when the same button is pressed again', () => {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights });
    const subject = call('5', 'up', 0);
    policy.register(subject, 0);
    const again = policy.register(subject, 30);
    expect(again.registeredAt).toBe(0);
  });

  it('separates the defer window from the batch window', () => {
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: { batchWindowS: 1, assignmentTiming: 'deferred', deferWindowS: 4 },
    });
    const subject = call('5', 'up');
    policy.register(subject, 0);

    expect(policy.dispatch(subject.id, [snapshotAt('A', '0')], 0.5).reason).toBe(
      'awaiting-batch-window',
    );
    expect(policy.dispatch(subject.id, [snapshotAt('A', '0')], 3).reason).toBe(
      'awaiting-defer-window',
    );
    expect(policy.dispatch(subject.id, [snapshotAt('A', '0')], 5).outcome).toBe('assigned');
  });

  it('splits a heavy landing across cars, and only above the threshold', () => {
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: { assignmentMode: 'split-demand', splitThresholdPassengers: 6 },
    });
    const cars = [snapshotAt('A', '4'), snapshotAt('B', '8'), snapshotAt('C', '20')];

    const light = call('5', 'up');
    policy.register(light, 0, { waitingPassengers: 4 });
    expect(policy.dispatch(light.id, cars, 0).carIds).toEqual(['A']);

    const heavy = call('6', 'up');
    policy.register(heavy, 0, { waitingPassengers: 20 });
    expect(policy.dispatch(heavy.id, cars, 0).carIds).toHaveLength(3);
  });

  it('divides the landing it split, rather than pricing every car for all of it', () => {
    // Naming three cars and then asking each of them what twenty boarders would cost charges
    // each one fourteen passenger-transfers it will never make and projects a load factor none
    // of them will reach. 1,350 kg rated at 75 kg a head: fourteen is 0.778 of rated, seven is
    // 0.389, and only one of those is the car's actual share.
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: { assignmentMode: 'split-demand', splitThresholdPassengers: 6 },
    });
    const cars = [snapshotAt('A', '4'), snapshotAt('B', '8'), snapshotAt('C', '20')];
    const heavy = call('6', 'up');
    policy.register(heavy, 0, { waitingPassengers: 20 });

    const decision = policy.dispatch(heavy.id, cars, 0);
    expect(decision.carIds).toHaveLength(3);
    // The share the runner must honour, carried on the decision and on the lifecycle.
    expect(decision.boardingPassengersPerCar).toBe(7);
    expect(policy.lifecycle(heavy.id)?.boardingPassengersPerCar).toBe(7);

    for (const score of decision.scores) {
      expect(score.estimate.resultingLoadFactor, score.carId).toBeCloseTo((7 * 75) / 1350, 9);
      expect(score.estimate.resultingLoadFactor, score.carId).toBeLessThan((14 * 75) / 1350);
    }
  });

  it('records the whole landing as one car’s load when it is not split', () => {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights });
    const subject = call('6', 'up');
    policy.register(subject, 0, { waitingPassengers: 9 });

    const decision = policy.dispatch(subject.id, [snapshotAt('A', '4')], 0);
    expect(decision.carIds).toEqual(['A']);
    expect(decision.boardingPassengersPerCar).toBe(9);

    // And nobody counted means nobody counted: the car charges its own assumption instead.
    const uncounted = call('7', 'up');
    policy.register(uncounted, 0);
    expect(policy.dispatch(uncounted.id, [snapshotAt('A', '4')], 0).boardingPassengersPerCar)
      .toBeUndefined();
  });

  it('does not disqualify a car for a share it was never going to carry', () => {
    // The load ceiling must be applied to what the car actually takes. Priced for the whole
    // twenty, every car projects 0.778 and a 0.5 ceiling rejects the lot — a heavy landing
    // left unserved by the very mechanism meant to serve it in parallel.
    const config = {
      id: 'p',
      name: 'P',
      weights,
      dispatch: { assignmentMode: 'split-demand' as const, splitThresholdPassengers: 6 },
      eligibility: { maxLoadFactorForAssignment: 0.5 },
    };
    const cars = [snapshotAt('A', '4'), snapshotAt('B', '8'), snapshotAt('C', '20')];
    const heavy = call('6', 'up');

    const policy = createDispatchPolicy(config);
    policy.register(heavy, 0, { waitingPassengers: 20 });
    const decision = policy.dispatch(heavy.id, cars, 0);

    expect(decision.outcome).toBe('assigned');
    expect(decision.carIds).toHaveLength(3);
    expect(decision.boardingPassengersPerCar).toBe(7);
    expect(decision.rejected).toHaveLength(0);

    // The ceiling still constrains, it just constrains the right quantity: seven a car clears
    // 0.5, and a 0.2 ceiling — three people — refuses even a third of the landing.
    const strict = createDispatchPolicy({
      ...config,
      eligibility: { maxLoadFactorForAssignment: 0.2 },
    });
    strict.register(heavy, 0, { waitingPassengers: 20 });
    const refused = strict.dispatch(heavy.id, cars, 0);
    expect(refused.outcome).toBe('unassigned');
    expect(refused.rejected.map((verdict) => verdict.reason)).toEqual([
      'loadFactorCeiling',
      'loadFactorCeiling',
      'loadFactorCeiling',
    ]);
  });

  it('refuses to defer a destination dispatcher, because it cannot', () => {
    // docs/06 § Stage 4: the passenger must be told which car to walk to immediately. That is
    // a documented cost of the approach, and it must not be configured away.
    expect(() =>
      createDispatchPolicy({
        id: 'dd',
        name: 'Destination',
        weights,
        dispatch: { callType: 'destination-entry', assignmentTiming: 'deferred' },
      }),
    ).toThrow(/cannot defer/);
  });

  it('throws when asked to dispatch a call nobody registered', () => {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights });
    expect(() => policy.dispatch('5:up', [snapshotAt('A', '0')], 0)).toThrow(DispatchError);
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 5 — reassignment
 * -------------------------------------------------------------------------- */

describe('reassignment', () => {
  const weights = { waitTime: 1 };

  /**
   * Car A is assigned a call at floor 10, then a much better placed car B appears.
   *
   * Returns the policy with the call already assigned to A.
   */
  function assignedToFarCar(dispatch: DispatchStage): {
    policy: ReturnType<typeof createDispatchPolicy>;
    subject: DispatchCall;
  } {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights, dispatch });
    const subject = call('10', 'up');
    policy.register(subject, 0);
    policy.dispatch(subject.id, [snapshotAt('A', '0')], 0);
    expect(policy.lifecycle(subject.id)?.carIds).toEqual(['A']);
    return { policy, subject };
  }

  it('never moves a call under reassignmentPolicy: never', () => {
    const { policy, subject } = assignedToFarCar({ reassignmentPolicy: 'never' });
    const decision = policy.reconsider(subject.id, [snapshotAt('A', '0'), snapshotAt('B', '10')], 1);
    expect(decision.outcome).toBe('retained');
    expect(decision.reason).toBe('reassignment-disabled');
    expect(decision.primaryCarId).toBe('A');
  });

  it('moves a call before the commitment point and not after', () => {
    const dispatch: DispatchStage = {
      reassignmentPolicy: 'until-commitment',
      commitmentPoint: 'on-deceleration',
      reassignmentHysteresisS: 0,
    };

    // Before commitment: A has only just set off for floor 10, so the call migrates to B.
    {
      const clock = clockAt(0);
      const car = makeCar('A', '0', clock);
      const policy = createDispatchPolicy({ id: 'p', name: 'P', weights, dispatch });
      const subject = call('10', 'up');
      policy.register(subject, 0);
      policy.dispatch(subject.id, [car.snapshot(0)], 0);

      car.assignHallCall(subject as HallCall);
      car.departFor('10', 0);
      clock.set(3);

      const decision = policy.reconsider(subject.id, [car.snapshot(3), snapshotAt('B', '10')], 3);
      expect(decision.outcome).toBe('reassigned');
      expect(decision.primaryCarId).toBe('B');
      expect(policy.lifecycle(subject.id)?.reassignments).toBe(1);
    }

    // After commitment: the same car, the same challenger, 22 s into a 24 s run — inside the
    // deceleration phase — and the call stays put.
    {
      const clock = clockAt(0);
      const car = makeCar('A', '0', clock);
      const policy = createDispatchPolicy({ id: 'p', name: 'P', weights, dispatch });
      const subject = call('10', 'up');
      policy.register(subject, 0);
      policy.dispatch(subject.id, [car.snapshot(0)], 0);

      car.assignHallCall(subject as HallCall);
      car.departFor('10', 0);
      clock.set(22);

      const decision = policy.reconsider(subject.id, [car.snapshot(22), snapshotAt('B', '10')], 22);
      expect(decision.outcome).toBe('retained');
      expect(decision.reason).toBe('committed');
      expect(decision.primaryCarId).toBe('A');
      expect(policy.lifecycle(subject.id)?.committedAt).toBe(22);
    }
  });

  it('ignores commitment under reassignmentPolicy: continuous', () => {
    const clock = clockAt(0);
    const car = makeCar('A', '0', clock);
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: { reassignmentPolicy: 'continuous', reassignmentHysteresisS: 0 },
    });
    const subject = call('10', 'up');
    policy.register(subject, 0);
    policy.dispatch(subject.id, [car.snapshot(0)], 0);

    car.assignHallCall(subject as HallCall);
    car.departFor('10', 0);
    clock.set(22);

    expect(policy.reconsider(subject.id, [car.snapshot(22), snapshotAt('B', '10')], 22).outcome).toBe(
      'reassigned',
    );
  });

  it('stops moving a call once maxReassignmentsPerCall is spent', () => {
    const { policy, subject } = assignedToFarCar({
      reassignmentPolicy: 'continuous',
      reassignmentHysteresisS: 0,
      maxReassignmentsPerCall: 1,
    });

    expect(
      policy.reconsider(subject.id, [snapshotAt('A', '0'), snapshotAt('B', '10')], 1).outcome,
    ).toBe('reassigned');

    const second = policy.reconsider(
      subject.id,
      [snapshotAt('A', '0'), snapshotAt('B', '10'), snapshotAt('C', '11')],
      2,
    );
    expect(second.outcome).toBe('retained');
    expect(second.reason).toBe('max-reassignments');
  });

  it('applies the stage-5 gates however the caller asks — the stage belongs to the call', () => {
    // A runner that calls dispatch() twice on the same call must not be able to move it with
    // `reassignmentPolicy: never` set. Which stage a call is in is a property of the call.
    const { policy, subject } = assignedToFarCar({ reassignmentPolicy: 'never' });
    const decision = policy.dispatch(subject.id, [snapshotAt('A', '0'), snapshotAt('B', '10')], 1);
    expect(decision.outcome).toBe('retained');
    expect(decision.reason).toBe('reassignment-disabled');
    expect(decision.primaryCarId).toBe('A');
  });

  it('holds the call when the incumbent is still the best', () => {
    const { policy, subject } = assignedToFarCar({
      reassignmentPolicy: 'continuous',
      reassignmentHysteresisS: 0,
    });
    const decision = policy.reconsider(subject.id, [snapshotAt('A', '0'), snapshotAt('B', '20')], 1);
    expect(decision.outcome).toBe('retained');
    expect(decision.reason).toBe('incumbent-best');
  });

  it('moves a call off an incumbent that has become ineligible', () => {
    // A car that filled up has nothing to defend, so the hysteresis does not protect it —
    // holding a call on an ineligible car is how a floor starves.
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: { reassignmentPolicy: 'continuous', reassignmentHysteresisS: 30 },
    });
    const subject = call('10', 'up');
    policy.register(subject, 0);
    policy.dispatch(subject.id, [snapshotAt('A', '9')], 0);
    expect(policy.lifecycle(subject.id)?.carIds).toEqual(['A']);

    const full = makeCar('A', '9');
    loadPast(full, 0.85);
    const decision = policy.reconsider(subject.id, [full.snapshot(0), snapshotAt('B', '20')], 1);
    expect(decision.outcome).toBe('reassigned');
    expect(decision.primaryCarId).toBe('B');
  });
});

/* -------------------------------------------------------------------------- *
 * Hysteresis — the anti-thrash guard
 * -------------------------------------------------------------------------- */

describe('hysteresis prevents thrashing between two near-equal cars', () => {
  const weights = { waitTime: 1 };

  /**
   * Two cars a floor and two floors from the call: A is genuinely better, by about four
   * seconds. Exactly the margin a controller with no deadband would chase.
   */
  function nearEqualCars(): readonly CarSnapshot[] {
    return [snapshotAt('A', '9'), snapshotAt('B', '12')];
  }

  it('refuses a switch whose wait saving is inside the deadband', () => {
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: { reassignmentPolicy: 'continuous', reassignmentHysteresisS: 10 },
    });
    const subject = call('10', 'up');
    policy.register(subject, 0);
    // Assign to B by presenting it alone, then offer the marginally better A.
    policy.dispatch(subject.id, [snapshotAt('B', '12')], 0);
    expect(policy.lifecycle(subject.id)?.carIds).toEqual(['B']);

    const decision = policy.reconsider(subject.id, nearEqualCars(), 1);
    expect(decision.outcome).toBe('retained');
    expect(decision.reason).toBe('below-hysteresis');
    expect(policy.lifecycle(subject.id)?.carIds).toEqual(['B']);
  });

  it('does not thrash over repeated reconsiderations', () => {
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: {
        reassignmentPolicy: 'continuous',
        reassignmentHysteresisS: 10,
        maxReassignmentsPerCall: 100,
      },
    });
    const subject = call('10', 'up');
    policy.register(subject, 0);
    policy.dispatch(subject.id, [snapshotAt('B', '12')], 0);

    for (let t = 1; t <= 50; t += 1) policy.reconsider(subject.id, nearEqualCars(), t);
    expect(policy.lifecycle(subject.id)?.reassignments).toBe(0);
    expect(policy.lifecycle(subject.id)?.carIds).toEqual(['B']);
  });

  it('still switches when the saving is real', () => {
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights,
      dispatch: { reassignmentPolicy: 'continuous', reassignmentHysteresisS: 10 },
    });
    const subject = call('10', 'up');
    policy.register(subject, 0);
    policy.dispatch(subject.id, [snapshotAt('B', '0')], 0);

    const decision = policy.reconsider(subject.id, [snapshotAt('B', '0'), snapshotAt('A', '10')], 1);
    expect(decision.outcome).toBe('reassigned');
    expect(decision.primaryCarId).toBe('A');
  });

  it('trades thrash for responsiveness through one number', () => {
    // Same state, same challenger, two hysteresis settings: the deadband is the only thing
    // that decides, which is what makes it tunable.
    const outcomes = [0, 10].map((reassignmentHysteresisS) => {
      const policy = createDispatchPolicy({
        id: 'p',
        name: 'P',
        weights,
        dispatch: { reassignmentPolicy: 'continuous', reassignmentHysteresisS },
      });
      const subject = call('10', 'up');
      policy.register(subject, 0);
      policy.dispatch(subject.id, [snapshotAt('B', '12')], 0);
      return policy.reconsider(subject.id, nearEqualCars(), 1).outcome;
    });
    expect(outcomes).toEqual(['reassigned', 'retained']);
  });
});

/* -------------------------------------------------------------------------- *
 * Stages 6 and 7 through the policy
 * -------------------------------------------------------------------------- */

describe('the policy exposes every stage', () => {
  it('answers only for the car it assigned', () => {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    const subject = call('5', 'up');
    const cars = [snapshotAt('A', '5'), snapshotAt('B', '5')];
    policy.register(subject, 0);
    const decision = policy.dispatch(subject.id, cars, 0);

    const winner = cars.find((car) => car.carId === decision.primaryCarId) as CarSnapshot;
    const loser = cars.find((car) => car.carId !== decision.primaryCarId) as CarSnapshot;
    expect(policy.answer(winner, subject, 0, cars).answer).toBe(true);
    expect(policy.answer(loser, subject, 0, cars).answer).toBe(false);
  });

  it('does not fire the starvation override on a group the caller never supplied', () => {
    // `answer(car, call, at)` with the group omitted used to assert a bank of one, so every
    // full car in a four-car bank overrode its own load bypass and claimed a starvation
    // protection nobody had established.
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights: { waitTime: 1 },
      answer: { allowBypassIfSoleEligibleCar: true },
    });
    const subject = call('5', 'up');

    const car = makeCar('A', '5');
    loadPast(car, 0.85);
    const full = car.snapshot(0);
    const group = [full, snapshotAt('B', '0'), snapshotAt('C', '12')];

    // The guard admitted it because it was alone in the list it was given; that is the
    // decision under test, and it is about the *group*, not about this one car.
    policy.register(subject, 0);
    expect(policy.dispatch(subject.id, [full], 0).carIds).toEqual(['A']);

    expect(policy.answer(full, subject, 0, group)).toMatchObject({
      answer: false,
      reason: 'bypassing-load',
    });
    expect(policy.answer(full, subject, 0)).toMatchObject({
      answer: false,
      reason: 'bypassing-load',
    });
    // Supplied, and genuinely alone: the override is available to a caller that says so.
    expect(policy.answer(full, subject, 0, [full]).reason).toBe('sole-eligible-override');
  });

  it('scores and filters without touching any lifecycle', () => {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    const subject = call('5', 'up');
    const cars = [snapshotAt('A', '0'), snapshotAt('B', '4')];

    const scores = policy.score(subject, cars, 0);
    expect(scores.map((score) => score.carId)).toEqual(['B', 'A']);
    expect(policy.eligible(subject, cars, 0).every((verdict) => verdict.eligible)).toBe(true);
    expect(policy.calls).toHaveLength(0);
  });

  it('parks an idle car where its profile says', () => {
    const policy = createDispatchPolicy({
      id: 'p',
      name: 'P',
      weights: { waitTime: 1 },
      idle: { parkingStrategy: 'lobby' },
    });
    expect(
      policy.reposition(snapshotAt('A', '18'), 0, { entranceFloorIds: ['0'] }),
    ).toMatchObject({ move: true, targetFloorId: '0' });
  });

  it('completes and cancels calls', () => {
    const policy = createDispatchPolicy({ id: 'p', name: 'P', weights: { waitTime: 1 } });
    const served = call('5', 'up');
    const abandoned = call('7', 'down');
    policy.register(served, 0);
    policy.register(abandoned, 0);

    const record = policy.complete(served.id, 30);
    expect(record?.answeredAt).toBe(30);
    expect(policy.lifecycle(served.id)).toBeUndefined();

    expect(policy.cancel(abandoned.id)).toBe(true);
    expect(policy.cancel(abandoned.id)).toBe(false);
    expect(policy.calls).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 7 acceptance — every parking strategy must actually park, on the
 * project's own reference building and under its own declared defaults.
 * -------------------------------------------------------------------------- */

describe('every parking strategy moves a car on data/buildings/midtown-office.json', () => {
  // The reference building and the real car, not the round-number test shaft: whether a
  // parking strategy can ever clear its own deadband is decided by the building's floor
  // pitch and the car's S-curve, so only a real one can catch a default that no attainable
  // saving reaches. Asserting `move`, never just `targetFloorId` — naming a target and then
  // never going there is a strategy that silently does nothing, and this whole suite passed
  // while `zone-center` did exactly that.
  it('moves at least one car from at least one floor, under defaults alone', async () => {
    const loaded = await loadConfig(REAL_DATA_DIR);
    const building = loaded.buildingsById.get('midtown-office');
    expect(building, 'midtown-office').toBeDefined();
    const bank = building?.banks[0];
    const spec = bank?.cars[0];
    if (building === undefined || bank === undefined || spec === undefined) return;

    const shaft = shaftForBank(building, bank.id);
    const entranceFloorIds = building.entranceFloors.map((floor) => floor.id);
    const snapshots = shaft.floors.map((floor) =>
      new Car({
        id: 'A',
        bankId: bank.id,
        spec,
        shaft,
        homeFloorId: floor.id,
        clock: { now: () => 0 },
      }).snapshot(0),
    );

    // What each strategy declares it needs, and nothing else: no threshold and no energy
    // weight is overridden anywhere in this test. A `Record` over the strategy union rather
    // than a list, so adding a fourth parking strategy to `PARKING_STRATEGIES` fails to
    // compile here until somebody says how it is meant to be driven.
    const context: Record<Exclude<ParkingStrategy, 'stay'>, RepositionContext> = {
      lobby: { entranceFloorIds },
      'zone-center': {},
      // Caller-supplied data, which is the strategy's declared prerequisite — Phase 5 learns
      // it. An up-peak morning: arrivals at the two entrances, plus one busy tenant.
      'predicted-demand': { demandForecast: new Map([['G', 10], ['P1', 3], ['12', 5]]) },
      // Nothing: the strategy's whole context is the profile's own `idle.parkingFloorIndex`,
      // whose declared default (0) is midtown's `G` — so under defaults alone every idle car
      // above the datum has a park to pay for, exactly like `lobby` with one entrance.
      'fixed-floor': {},
    };

    for (const strategy of PARKING_STRATEGIES) {
      if (strategy === 'stay') continue;
      const policy = createDispatchPolicy({
        id: 'p',
        name: 'P',
        weights: { waitTime: 1 },
        idle: { parkingStrategy: strategy },
      });

      const decisions = snapshots.map((car) => policy.reposition(car, 0, context[strategy]));
      const moved = decisions.filter((decision) => decision.move);

      expect(moved.length, `${strategy} never moves any car from any floor`).toBeGreaterThan(0);
      for (const decision of moved) {
        expect(decision.reason, strategy).toBe('reposition');
        expect(decision.targetFloorId, strategy).toBeDefined();
        expect(decision.netGainS, strategy).toBeGreaterThanOrEqual(
          policy.config.idle.repositionThresholdS,
        );
      }
      // Nor does it move everything: a park a car is already at, or close to, is not worth a
      // trip, and a strategy that moves every car from every floor has no deadband at all.
      expect(moved.length, `${strategy} moves every car from every floor`).toBeLessThan(
        decisions.length,
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Configuration is checked, not trusted
 * -------------------------------------------------------------------------- */

describe('resolveDispatchConfig', () => {
  it('rejects a hard constraint the engine does not implement', () => {
    // An ignored hard constraint is a configuration that silently does not constrain.
    expect(() =>
      resolveDispatchConfig({
        id: 'p',
        name: 'P',
        weights: {},
        hardConstraints: ['noOvertaking'],
      }),
    ).toThrow(/noOvertaking/);
  });

  it('rejects a weight on a term the library does not declare', () => {
    // A misspelled term contributes nothing, so this profile would score every car at exactly
    // zero and "dispatch" by the car-id tie-break — a plausible-looking run of a system nobody
    // configured. Same argument as the unknown hard constraint above, same treatment.
    expect(() =>
      resolveDispatchConfig({ id: 'typo', name: 'Typo', weights: { waitTiem: 1 } }),
    ).toThrow(/waitTiem/);
    expect(() =>
      resolveDispatchConfig({ id: 'typo', name: 'Typo', weights: { waitTiem: 1 } }),
    ).toThrow(DispatchError);
  });

  it('rejects a misspelled weight arriving through the options override too', () => {
    // The channel a Phase 7 optimizer writes candidates through, and the one no zod schema
    // ever sees. `dispatcherProfilesSchema` guards data/dispatcher-profiles.json and nothing
    // else: every fixture in this file is a hand-built object.
    expect(() =>
      resolveDispatchConfig(
        { id: 'p', name: 'P', weights: { waitTime: 1 } },
        { weights: { waittime: 3 } },
      ),
    ).toThrow(/waittime/);
  });

  it('keeps the distinction that makes rejecting a typo safe', () => {
    // `starvation` used to be declared-but-unimplemented and was carried in `pendingWeights`; it
    // is implemented now, so it resolves. The distinction the rejection rests on is unchanged and
    // is what this asserts: a *declared* id is a term and is honoured, an undeclared one is a
    // misspelling and throws, because a weight nothing reads scores every car at zero and hands
    // the decision to the car-id tie-break in silence.
    const config = resolveDispatchConfig({
      id: 'p',
      name: 'P',
      weights: { waitTime: 1, starvation: 0.7 },
    });
    expect([...config.weights.entries()]).toEqual([
      ['waitTime', 1],
      ['starvation', 0.7],
    ]);
    expect(config.pendingWeights.size).toBe(0);
    expect(isDeclaredTerm('starvation')).toBe(true);

    expect(() =>
      resolveDispatchConfig({ id: 'p', name: 'P', weights: { waitTime: 1, starvatoin: 0.7 } }),
    ).toThrow(/starvatoin/);
    expect(isDeclaredTerm('starvatoin')).toBe(false);
  });

  it('rejects an engine this package does not implement', () => {
    expect(() =>
      resolveDispatchConfig({ id: 'p', name: 'P', weights: {}, engine: 'genetic' }),
    ).toThrow(/weighted-cost/);
  });

  it('accepts the engine the data file names', () => {
    expect(
      resolveDispatchConfig({ id: 'p', name: 'P', weights: {}, engine: 'weighted-cost' }).engine,
    ).toBe('weighted-cost');
  });

  it('rejects nonsensical numbers rather than producing plausible nonsense', () => {
    expect(() =>
      resolveDispatchConfig({ id: 'p', name: 'P', weights: {}, dispatch: { batchWindowS: -1 } }),
    ).toThrow(/batchWindowS/);
    expect(() =>
      resolveDispatchConfig({
        id: 'p',
        name: 'P',
        weights: {},
        dispatch: { maxReassignmentsPerCall: 1.5 },
      }),
    ).toThrow(/maxReassignmentsPerCall/);
    expect(() =>
      resolveDispatchConfig({
        id: 'p',
        name: 'P',
        weights: {},
        dispatch: { splitThresholdPassengers: 0 },
      }),
    ).toThrow(/splitThresholdPassengers/);
  });

  it('applies overrides over the profile, and the profile over the defaults', () => {
    const config = resolveDispatchConfig(
      {
        id: 'p',
        name: 'P',
        weights: { waitTime: 1 },
        hardConstraints: ['noDirectionReversal'],
      },
      { weights: { waitTime: 0.25 }, hardConstraints: [] },
    );
    expect(config.weights.get('waitTime')).toBe(0.25);
    expect(config.constraints.noDirectionReversal).toBe(false);
    expect(config.declaredHardConstraints).toEqual([]);
  });

  it('turns the authored hard-constraint array into the boolean an optimizer can sample', () => {
    const config = resolveDispatchConfig({
      id: 'p',
      name: 'P',
      weights: {},
      hardConstraints: ['noDirectionReversal'],
    });
    expect(config.constraints.noDirectionReversal).toBe(true);
    expect(config.declaredHardConstraints).toEqual(['noDirectionReversal']);
  });

  it('freezes the resolved configuration', () => {
    const config = resolveDispatchConfig({ id: 'p', name: 'P', weights: {} });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.dispatch)).toBe(true);
    expect(Object.isFrozen(config.idle)).toBe(true);
  });
});
