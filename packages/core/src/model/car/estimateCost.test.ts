import { describe, expect, it } from 'vitest';

import { resolveCar } from '../../config/resolveCar.js';
import type { ElevatorSpecs, ResolvedCar } from '../../config/types.js';
import { travelTime } from '../../physics/motion/index.js';
import { Passenger } from '../passenger.js';
import { hallCallId, type HallCall } from '../types.js';

import { Car } from './car.js';
import {
  directionTowardNearestStop,
  estimateCost,
  infeasibilityOf,
  projectRoute,
  requestedStop,
} from './estimateCost.js';
import {
  createShaft,
  type CarShaft,
  type CarSnapshot,
  type CostEstimate,
  type CostRequest,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 *
 * The envelope is chosen so every travel time in this file is exact in decimal and can be
 * hand-checked without trusting the module under test:
 *
 *   V = 2.0 m/s,  A = 1.0 m/s^2,  J = 1.0 m/s^3
 *
 * The acceleration plateau opens (V >= A^2/J = 1.0), so a long trip is speed-limited with
 *   Tj = A/J = 1 s,  Ta = V/A - A/J = 1 s,
 * and the ramp up to rated speed covers
 *   J*Tj^3/6 + (v1*Ta + A*Ta^2/2) + (v2*Tj + A*Tj^2/2 - J*Tj^3/6)
 *     = 1/6 + 1 + 11/6 = 3 m   in   2*Tj + Ta = 3 s.
 *
 * So a 20 m trip is 3 + 14/2 + 3 = 13.0 s and a 40 m trip is 3 + 34/2 + 3 = 23.0 s. Note
 * that 40 m / 2 m/s is 20 s: the S-curve costs three seconds more, and that gap is the whole
 * reason this project models jerk (docs/02-elevator-reference.md § Motion parameters).
 *
 * Floors are 4 m apart, indices 0..20, so floor N is at 4N metres.
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
  capacities: [{ ratedLoadLb: 3000, ratedLoadKg: 1350, personsUS: 20, use: 'Office / high-rise' }],
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

/** 2.0 m/s, 1.0 m/s^2, 1.0 m/s^3, 3,000 lb / 1,350 kg, 2 s open + 3 s close. */
const SPEC: ResolvedCar = resolveCar(
  { id: 'A', spec: 'round-numbers', ratedLoadLb: 3000 },
  REFERENCE_SPECS,
);

const MOTOR_START_S = 0.5;
const LEVELING_S = 0.5;
const OPEN_S = 2.0;
const CLOSE_S = 3.0;
const DWELL_CAR_S = 3.0;
const DWELL_HALL_S = 5.0;
const FLOOR_PITCH_M = 4;

/** A plain 21-floor shaft, floors "0".."20". */
function plainShaft(): CarShaft {
  return createShaft(
    Array.from({ length: 21 }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * FLOOR_PITCH_M,
    })),
  );
}

/**
 * A shaft that stops at floor 10 and puts floors 8-10 behind a credential — the Secure Tower
 * shape in miniature, where service zoning and access zoning must give different answers.
 */
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

interface MutableClock {
  now(): number;
  set(t: number): void;
}

function clockAt(start = 0): MutableClock {
  let time = start;
  return { now: () => time, set: (t: number) => (time = t) };
}

function makeCar(options: { shaft?: CarShaft; clock?: MutableClock; homeFloorId?: string } = {}): Car {
  return new Car({
    id: 'A',
    bankId: 'low',
    spec: SPEC,
    shaft: options.shaft ?? plainShaft(),
    homeFloorId: options.homeFloorId ?? '0',
    clock: options.clock ?? clockAt(0),
    loadSensorSpec: REFERENCE_SPECS.loadSensor,
    passengerTransferS: REFERENCE_SPECS.timing.passengerTransferS.office,
  });
}

function hallCall(floorId: string, direction: 'up' | 'down', registeredAt = 0): HallCall {
  return Object.freeze({
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: Number(floorId),
    direction,
    registeredAt,
  });
}

function passenger(id: string, destinationFloorId: string, massKg: number, arrivedAt = 0): Passenger {
  return new Passenger({
    id,
    journeyId: `j-${id}`,
    originFloorId: '0',
    originFloorIndex: 0,
    destinationFloorId,
    destinationFloorIndex: Number(destinationFloorId),
    massKg,
    arrivedAt,
  });
}

/** One leg: motor start delay, the real S-curve, levelling. */
function legSeconds(distanceM: number): number {
  return MOTOR_START_S + travelTime(distanceM, SPEC) + LEVELING_S;
}

/* -------------------------------------------------------------------------- *
 * ROADMAP ACCEPTANCE
 *
 * docs/05-roadmap.md § Phase 1: "`estimateCost()` called 10,000 times leaves simulation
 * state bit-identical."
 * -------------------------------------------------------------------------- */

describe('ROADMAP ACCEPTANCE: estimateCost() is pure', () => {
  /**
   * A car in a genuinely busy state: mid-stop with the doors open, four passengers of
   * different masses aboard, three car calls, two allocated hall calls, a run direction,
   * and non-zero odometer counters. Every one of those is mutable state that a leaky
   * estimator could disturb.
   */
  function busyCar(clock: MutableClock): Car {
    const car = makeCar({ clock });

    clock.set(0);
    car.registerCarCall('7', 0);
    car.assignHallCall(hallCall('4', 'up', 1));
    car.assignHallCall(hallCall('12', 'down', 2));

    // Take a real trip so the odometer, the departure count and the door accounting are all
    // non-zero before the measurement starts.
    const move = car.departFor('3', 0);
    clock.set(move.arrivesAt);
    car.completeArrival();
    car.openDoors();

    car.board(passenger('p1', '7', 61.4), move.arrivesAt);
    car.board(passenger('p2', '12', 98.25), move.arrivesAt);
    car.board(passenger('p3', '12', 74), move.arrivesAt);
    car.board(passenger('p4', '20', 83.75), move.arrivesAt);

    return car;
  }

  it('leaves the car bit-identical after 10,000 calls with the doors open and people aboard', () => {
    const clock = clockAt(0);
    const car = busyCar(clock);

    const before = JSON.stringify(car.serialize());
    const firstEstimate = car.estimateCost(hallCall('9', 'up', 100));

    // 10,000 varied requests: feasible and infeasible, hall and car, above and below, with
    // and without a credential or a declared destination, so nothing can be memoized into
    // looking pure.
    const floors = car.shaft.floors.map((floor) => floor.id);
    for (let i = 0; i < 10_000; i += 1) {
      const floorId = floors[i % floors.length] ?? '0';
      const request: CostRequest = {
        floorId,
        direction: i % 2 === 0 ? 'up' : 'down',
        registeredAt: 100 + (i % 37),
        ...(i % 3 === 0 ? { kind: 'car' as const } : {}),
        ...(i % 5 === 0 ? { credentialGroup: 'staff' } : {}),
        ...(i % 7 === 0 ? { destinationFloorId: floors[(i * 3) % floors.length] ?? '0' } : {}),
        ...(i % 11 === 0 ? { boardingPassengers: i % 6 } : {}),
      };
      car.estimateCost(request);
    }

    const after = JSON.stringify(car.serialize());

    expect(after).toBe(before);
    // And the answer itself has not drifted: state that changed invisibly would show here.
    expect(car.estimateCost(hallCall('9', 'up', 100))).toEqual(firstEstimate);
  });

  it('leaves the car bit-identical after 10,000 calls made mid-flight', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    car.registerCarCall('15', 0);
    car.assignHallCall(hallCall('9', 'up', 0));
    const move = car.departFor('15', 0);
    clock.set(move.startedAt + move.profile.duration / 3);

    const before = JSON.stringify(car.serialize());
    for (let i = 0; i < 10_000; i += 1) {
      car.estimateCost({ floorId: String(i % 21), direction: i % 2 === 0 ? 'up' : 'down' });
    }

    expect(JSON.stringify(car.serialize())).toBe(before);
    // The move itself is untouched: same profile object, same timings.
    expect(car.motion).toBe(move);
    expect(car.isMoving).toBe(true);
  });

  it('does not disturb anything the serialized record cannot see', () => {
    const clock = clockAt(0);
    const car = busyCar(clock);

    const before = {
      route: car.route(),
      stops: car.committedStops(),
      passengers: car.passengers.map((p) => p.id),
      aboard: car.loadSensor.aboard(),
      carCalls: car.carCalls,
      hallCalls: car.assignedHallCalls,
      door: car.door,
      mode: car.mode,
      direction: car.direction,
      loadKg: car.loadKg,
      nextDoorTransitionAt: car.nextDoorTransitionAt(),
      positionAt: car.positionAt(clock.now()),
    };

    for (let i = 0; i < 10_000; i += 1) {
      car.estimateCost({ floorId: String(i % 21), direction: 'up', boardingPassengers: i % 4 });
    }

    expect(car.route()).toEqual(before.route);
    expect(car.committedStops()).toEqual(before.stops);
    expect(car.passengers.map((p) => p.id)).toEqual(before.passengers);
    expect(car.loadSensor.aboard()).toEqual(before.aboard);
    expect(car.carCalls).toEqual(before.carCalls);
    expect(car.assignedHallCalls).toEqual(before.hallCalls);
    // The door state is an immutable value; a leaky estimator would have replaced it.
    expect(car.door).toBe(before.door);
    expect(car.mode).toBe(before.mode);
    expect(car.direction).toBe(before.direction);
    expect(car.loadKg).toBe(before.loadKg);
    expect(car.nextDoorTransitionAt()).toBe(before.nextDoorTransitionAt);
    expect(car.positionAt(clock.now())).toBe(before.positionAt);
  });

  it('cannot write to a snapshot even when every reachable object is sealed against it', () => {
    // The complementary proof. The test above says nothing changed; this one says nothing
    // *could* have, by making every write the estimator might attempt throw.
    const clock = clockAt(0);
    const car = busyCar(clock);
    const hardened = tamperProof(car.snapshot());

    for (const request of [
      { floorId: '9', direction: 'up' as const },
      { floorId: '2', direction: 'down' as const, kind: 'car' as const },
      { floorId: '99', direction: 'up' as const },
      { floorId: '12', direction: 'down' as const, boardingPassengers: 6 },
    ]) {
      expect(() => estimateCost(hardened, request)).not.toThrow();
      expect(() => projectRoute(hardened)).not.toThrow();
    }
  });

  it('draws no random numbers, because the module cannot reach one', async () => {
    // Structural, not behavioural: `estimateCost.ts` imports neither `random/` nor the
    // kernel's scheduler, and never imports `car.ts`. A future edit that reached for an Rng
    // would have to add an import here, and this test is what says not to.
    const source = await readModuleSource('estimateCost.ts');

    expect(source).not.toMatch(/from '.*random/);
    expect(source).not.toMatch(/from '\.\/car\.js'/);
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/Date\.now|performance\.now|setTimeout/);
  });
});

/* -------------------------------------------------------------------------- *
 * ETA accounting — hand-verified
 * -------------------------------------------------------------------------- */

describe('etaSeconds', () => {
  it('is the real S-curve travel time, not distance / ratedSpeed', () => {
    const car = makeCar();
    const estimate = car.estimateCost(hallCall('10', 'up'));

    // 40 m at 2 m/s "would be" 20 s; the jerk-limited profile takes 23 s, and the car adds
    // half a second of motor start delay and half a second of levelling.
    expect(travelTime(40, SPEC)).toBe(23);
    expect(estimate.etaSeconds).toBe(24);
    expect(estimate.etaSeconds).toBeGreaterThan(40 / SPEC.ratedSpeedMps);
  });

  it('demonstrates that a one-floor hop never reaches rated speed', () => {
    const car = makeCar();
    const oneFloor = car.estimateCost(hallCall('1', 'up')).etaSeconds;
    const tenFloors = car.estimateCost(hallCall('10', 'up')).etaSeconds;

    // Ten times the distance is nowhere near ten times the time, because the short hop spends
    // all of itself accelerating and decelerating.
    expect(oneFloor - 2 * MOTOR_START_S).toBeGreaterThan((tenFloors - 2 * MOTOR_START_S) / 10);
    expect(travelTime(FLOOR_PITCH_M, SPEC)).toBeLessThan(
      FLOOR_PITCH_M / SPEC.ratedSpeedMps + 2 * SPEC.ratedSpeedMps,
    );
  });

  it('includes the door time and the travel time of every committed stop in between', () => {
    const car = makeCar();
    car.registerCarCall('5', 0); // 20 m up, a car call: dwell is the 3 s car-call dwell

    const estimate = car.estimateCost(hallCall('10', 'up'));

    // Hand computation, every term from the reference data:
    //   leg 0 -> 5   0.5 + 13.0 + 0.5 = 14.0   (20 m: 3 m ramp, 14 m cruise, 3 m ramp)
    //   stop 5       2.0 +  3.0 + 3.0 =  8.0   (open + car-call dwell + close)
    //   leg 5 -> 10  0.5 + 13.0 + 0.5 = 14.0
    //                                  ------
    //                                    36.0
    const expected = legSeconds(20) + (OPEN_S + DWELL_CAR_S + CLOSE_S) + legSeconds(20);
    expect(expected).toBe(36);
    expect(estimate.etaSeconds).toBe(36);
    expect(estimate.stopsBefore).toBe(1);

    // Twelve seconds worse than the direct trip: eight of door, one of extra start-and-level,
    // three of a speed profile that has to come back down to zero in the middle.
    expect(estimate.etaSeconds - makeCar().estimateCost(hallCall('10', 'up')).etaSeconds).toBe(12);
  });

  it('charges the longer hall-call dwell, and the passenger transfer on top of it', () => {
    const car = makeCar();
    car.assignHallCall(hallCall('5', 'up', 0)); // hall call: 5 s dwell, one assumed boarder

    const oneBoarder = car.estimateCost(hallCall('10', 'up')).etaSeconds;
    expect(oneBoarder).toBe(legSeconds(20) + (OPEN_S + DWELL_HALL_S + CLOSE_S) + legSeconds(20));

    // Eight people getting off at floor 5, plus the one assumed boarder, take 9 * 1.2 = 10.8 s
    // to clear the doorway — longer than the 5 s policy dwell, so the stop grows to fit them.
    // This is the 2*P*tp term of the Barney/CIBSE round-trip-time calculation, localised to
    // one stop; a simulator that let the dwell timer end the stop would come out ~6 s short
    // here and would fail the RTT oracle at every heavy floor.
    const loaded = makeCar();
    loaded.assignHallCall(hallCall('5', 'up', 0));
    for (let i = 0; i < 8; i += 1) loaded.board(passenger(`q${i}`, '5', 70), 0);

    const withTransfer = loaded.estimateCost(hallCall('10', 'up')).etaSeconds;
    expect(withTransfer).toBeCloseTo(legSeconds(20) + (OPEN_S + 9 * 1.2 + CLOSE_S) + legSeconds(20), 12);
    expect(withTransfer - oneBoarder).toBeCloseTo(9 * 1.2 - DWELL_HALL_S, 12);
  });

  it('counts the time left on a move already in flight', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    car.registerCarCall('10', 0);
    const move = car.departFor('10', 0);

    // Five seconds after the profile started, with 23 - 5 = 18 s of profile and 0.5 s of
    // levelling still to run.
    clock.set(move.startedAt + 5);
    const estimate = car.estimateCost(hallCall('10', 'up'));

    expect(estimate.etaSeconds).toBeCloseTo(23 - 5 + LEVELING_S, 12);
    expect(estimate.stopsBefore).toBe(0);
  });

  it('counts the time left on the stop the car is standing in', () => {
    const clock = clockAt(100);
    const car = makeCar({ clock });
    car.openDoors(100, { carCall: true, hallCall: false });

    // The stop runs open (2 s) + car-call dwell (3 s) + close (3 s) = 8 s from t=100, so at
    // t=101 there are 7 s left before the car can move at all.
    clock.set(101);
    const estimate = car.estimateCost(hallCall('5', 'up'));

    expect(estimate.etaSeconds).toBeCloseTo(7 + legSeconds(20), 12);
  });

  it('is when the car would be there anyway if the floor is already a stop', () => {
    const car = makeCar();
    car.registerCarCall('5', 0);

    const estimate = car.estimateCost(hallCall('5', 'up'));

    expect(estimate.etaSeconds).toBe(legSeconds(20));
    expect(estimate.marginalDelaySeconds).toBe(0);
    expect(estimate.stopsBefore).toBe(0);
  });

  it('is zero for a request at the floor an idle car is standing at', () => {
    const car = makeCar({ homeFloorId: '6' });

    expect(car.estimateCost(hallCall('6', 'up')).etaSeconds).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Route ordering
 * -------------------------------------------------------------------------- */

describe('route ordering', () => {
  it('serves everything ahead in the direction of travel, then reverses once', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock, homeFloorId: '10' });
    car.registerCarCall('14', 0);
    car.registerCarCall('12', 0);
    car.registerCarCall('6', 0);
    car.registerCarCall('2', 0);
    car.assignHallCall(hallCall('16', 'down', 0));
    // Force the run direction by departing upward.
    const move = car.departFor('12', 0);
    clock.set(move.arrivesAt);
    car.completeArrival();

    expect(car.route().map((stop) => stop.floorId)).toEqual(['12', '14', '16', '6', '2']);
  });

  it('is monotonic in time and never revisits a floor', () => {
    const car = makeCar({ homeFloorId: '8' });
    for (const floorId of ['3', '11', '1', '19', '7']) car.registerCarCall(floorId, 0);

    const route = car.route();
    const ids = route.map((stop) => stop.floorId);

    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < route.length; i += 1) {
      const previous = route[i - 1];
      const current = route[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      expect(current?.arrivalSeconds ?? 0).toBeGreaterThanOrEqual(previous?.departureSeconds ?? 0);
      expect(current?.order).toBe(i);
    }
  });

  it('sets off towards the nearest stop when the car is idle and directionless', () => {
    const car = makeCar({ homeFloorId: '10' });
    car.registerCarCall('12', 0);
    car.registerCarCall('4', 0);

    expect(car.route()[0]?.floorId).toBe('12');
    expect(directionTowardNearestStop(car.committedStops(), 10, 40)).toBe('up');
  });

  it('is empty for a car with nothing to do', () => {
    expect(makeCar().route()).toEqual([]);
    expect(projectRoute(makeCar().snapshot())).toEqual([]);
  });

  it('does not filter hall calls by direction — that is the dispatcher’s call', () => {
    // A car travelling up with a *down* hall call assigned below it still prices it as a stop
    // it will reach after reversing. Refusing to answer a down call while going up is
    // `collective`, which this project models as a dispatcher weight vector with a
    // `noDirectionReversal` hard constraint, not as behaviour compiled into the car.
    const clock = clockAt(0);
    const car = makeCar({ clock, homeFloorId: '0' });
    car.registerCarCall('10', 0);
    car.assignHallCall(hallCall('4', 'down', 0));
    const move = car.departFor('10', 0);
    clock.set(move.arrivesAt);
    car.completeArrival();

    expect(car.route().map((stop) => stop.floorId)).toEqual(['10', '4']);
    expect(car.estimateCost(hallCall('4', 'down')).feasible).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * marginalDelaySeconds
 * -------------------------------------------------------------------------- */

describe('marginalDelaySeconds', () => {
  it('is zero when the new stop falls after everything already committed', () => {
    const car = makeCar();
    car.registerCarCall('5', 0);

    expect(car.estimateCost(hallCall('10', 'up')).marginalDelaySeconds).toBe(0);
  });

  it('is the delay imposed on the committed stop when the new one comes first', () => {
    const car = makeCar();
    car.registerCarCall('10', 0); // committed: arrives at 0.5 + 23 + 0.5 = 24 s

    const estimate = car.estimateCost(hallCall('5', 'up'));

    // With a stop inserted at floor 5, the car reaches 10 at
    //   leg 0->5   14.0
    //   stop 5      2.0 + 5.0 + 3.0 = 10.0   (hall-call dwell beats 1 boarder * 1.2 s)
    //   leg 5->10  14.0
    //                              -------
    //                                38.0    which is 14.0 s later than 24.0.
    expect(estimate.etaSeconds).toBe(14);
    expect(estimate.marginalDelaySeconds).toBe(38 - 24);
    expect(estimate.marginalDelaySeconds).toBe(14);
  });

  it('sums over every committed stop that is pushed back', () => {
    const car = makeCar();
    car.registerCarCall('10', 0);
    car.registerCarCall('15', 0);

    const baseline = projectRoute(car.snapshot());
    const estimate = car.estimateCost(hallCall('5', 'up'));
    const projected = projectRoute(car.snapshot(), requestedStop(car.snapshot(), hallCall('5', 'up')));

    const byFloor = new Map(projected.map((stop) => [stop.floorId, stop.arrivalSeconds]));
    const expected = baseline.reduce(
      (total, stop) => total + ((byFloor.get(stop.floorId) ?? 0) - stop.arrivalSeconds),
      0,
    );

    expect(estimate.marginalDelaySeconds).toBeCloseTo(expected, 12);
    // Two stops delayed, so the sum is larger than either one alone.
    expect(estimate.marginalDelaySeconds).toBeGreaterThan(14);
  });

  it('is zero for a floor that was already a committed stop', () => {
    const car = makeCar();
    car.registerCarCall('5', 0);
    car.registerCarCall('10', 0);

    expect(car.estimateCost({ floorId: '5', direction: 'up', kind: 'car' }).marginalDelaySeconds).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * resultingLoadFactor
 * -------------------------------------------------------------------------- */

describe('resultingLoadFactor', () => {
  it('projects the boarding mass onto the current load', () => {
    const car = makeCar();
    car.board(passenger('p1', '10', 90), 0);

    const estimate = car.estimateCost(hallCall('5', 'up'));

    // 90 kg aboard, nobody alights before floor 5, one assumed boarder at 75 kg nominal.
    expect(estimate.resultingLoadFactor).toBeCloseTo((90 + 75) / 1350, 12);
  });

  it('subtracts everyone who alights on the way, and at the requested floor', () => {
    const car = makeCar();
    car.board(passenger('p1', '3', 80), 0); // off before floor 5
    car.board(passenger('p2', '5', 100), 0); // off at floor 5
    car.board(passenger('p3', '9', 70), 0); // still aboard

    const estimate = car.estimateCost(hallCall('5', 'up'));

    expect(estimate.resultingLoadFactor).toBeCloseTo((70 + 75) / 1350, 12);
  });

  it('uses a declared boarding mass in preference to the nominal projection', () => {
    const car = makeCar();
    const estimate = car.estimateCost({
      floorId: '5',
      direction: 'up',
      boardingPassengers: 4,
      boardingMassKg: 340,
    });

    expect(estimate.resultingLoadFactor).toBeCloseTo(340 / 1350, 12);
  });

  it('scales with a declared head count when no mass is given', () => {
    const car = makeCar();
    const estimate = car.estimateCost({ floorId: '5', direction: 'up', boardingPassengers: 6 });

    expect(estimate.resultingLoadFactor).toBeCloseTo((6 * 75) / 1350, 12);
  });

  it('adds nothing for a car call — whoever pressed it is already aboard', () => {
    const car = makeCar();
    car.board(passenger('p1', '10', 90), 0);

    const carCall = car.estimateCost({ floorId: '5', kind: 'car' });
    expect(carCall.resultingLoadFactor).toBeCloseTo(90 / 1350, 12);

    // And the stop it would add carries no boarding transfer time either.
    const stop = requestedStop(car.snapshot(), { floorId: '5', kind: 'car' });
    expect(stop?.boardingCount).toBe(0);
    expect(stop?.carCall).toBe(true);
  });

  it('does not load a stop twice when the car is re-priced for a call it already holds', () => {
    // Reassignment and hysteresis both re-score calls a car is already committed to. Counting
    // the boarders again each time would make a committed car look worse the more often it
    // was reconsidered, which would make reassignment thrash.
    const car = makeCar();
    car.assignHallCall(hallCall('5', 'up', 0));
    car.registerCarCall('12', 0);

    const reprice = car.estimateCost(hallCall('5', 'up', 0));
    const baselineArrivalAt12 = projectRoute(car.snapshot()).find((leg) => leg.floorId === '12');

    expect(reprice.marginalDelaySeconds).toBe(0);
    expect(reprice.etaSeconds).toBe(legSeconds(20));
    expect(baselineArrivalAt12?.arrivalSeconds).toBe(
      projectRoute(car.snapshot(), requestedStop(car.snapshot(), hallCall('5', 'up', 0))).find(
        (leg) => leg.floorId === '12',
      )?.arrivalSeconds,
    );

    const snapshot = car.snapshot();
    const samePress = projectRoute(snapshot, requestedStop(snapshot, hallCall('5', 'up', 0)));
    expect(samePress.find((leg) => leg.floorId === '5')?.boardingCount).toBe(1);

    // The other direction at the same floor *is* a second group of people, and does load it.
    const otherPress = projectRoute(snapshot, requestedStop(snapshot, hallCall('5', 'down', 0)));
    expect(otherPress.find((leg) => leg.floorId === '5')?.boardingCount).toBe(2);
    expect(otherPress.find((leg) => leg.floorId === '5')?.hallCallDirections).toEqual([
      'up',
      'down',
    ]);
  });

  // REGRESSION. "Do not load the stop twice" was implemented as "ignore the declared boarding
  // entirely", so a car that already held the call priced it as if only
  // `assumedBoardingPassengers` were waiting however many the dispatcher had counted. The
  // incumbent car then looked *better* the busier the floor actually was — backwards, and
  // enough to make reassignment stick to the wrong car.
  it('re-prices a held call at the larger boarding count, so counting the queue moves the estimate', () => {
    const car = makeCar();
    car.assignHallCall(hallCall('5', 'up', 0)); // held: one assumed boarder
    car.registerCarCall('12', 0);

    const assumed = car.estimateCost(hallCall('5', 'up', 0));
    const counted = car.estimateCost({ floorId: '5', direction: 'up', boardingPassengers: 10 });

    const snapshot = car.snapshot();
    const stop = projectRoute(
      snapshot,
      requestedStop(snapshot, { floorId: '5', direction: 'up', boardingPassengers: 10 }),
    ).find((leg) => leg.floorId === '5');

    expect(stop?.boardingCount).toBe(10);
    // Ten people take 12 s through the doorway, which beats the 5 s hall dwell.
    expect((stop?.departureSeconds ?? 0) - (stop?.arrivalSeconds ?? 0)).toBeCloseTo(
      OPEN_S + 10 * 1.2 + CLOSE_S,
      12,
    );

    // Floor 5 itself is reached at the same moment either way — it is first on the route —
    // but everything behind it moves, and that is what the dispatcher scores.
    expect(counted.etaSeconds).toBe(assumed.etaSeconds);
    expect(assumed.marginalDelaySeconds).toBe(0);
    expect(counted.marginalDelaySeconds).toBeCloseTo(10 * 1.2 - DWELL_HALL_S, 12);

    // The opposite direction is still a second group, and its declared count is still added.
    const bothWays = projectRoute(
      snapshot,
      requestedStop(snapshot, { floorId: '5', direction: 'down', boardingPassengers: 10 }),
    ).find((leg) => leg.floorId === '5');
    expect(bothWays?.boardingCount).toBe(11);
  });

  it('treats a re-price with no declared direction as the same button, not a second queue', () => {
    // The mirror of the case above: `requestedStop` reports no direction for a bare
    // `{ floorId }`, which used to fall through the same-button test and load the stop twice.
    const car = makeCar();
    car.assignHallCall(hallCall('5', 'up', 0));
    const snapshot = car.snapshot();

    expect(requestedStop(snapshot, { floorId: '5' })?.hallCallDirections).toEqual([]);

    const bare = projectRoute(snapshot, requestedStop(snapshot, { floorId: '5' })).find(
      (leg) => leg.floorId === '5',
    );

    expect(bare?.boardingCount).toBe(1);
    expect((bare?.departureSeconds ?? 0) - (bare?.arrivalSeconds ?? 0)).toBe(
      OPEN_S + DWELL_HALL_S + CLOSE_S,
    );
  });

  it('still adds the boarders at a floor the car holds only a car call for', () => {
    // Nobody is waiting at a floor somebody aboard pressed, so a landing call there really is
    // a new group of people and must be added rather than merged away.
    const car = makeCar();
    car.registerCarCall('5', 0);
    const snapshot = car.snapshot();

    const stop = projectRoute(
      snapshot,
      requestedStop(snapshot, { floorId: '5', direction: 'up', boardingPassengers: 4 }),
    ).find((leg) => leg.floorId === '5');

    expect(stop?.boardingCount).toBe(4);
    expect(stop?.carCall).toBe(true);
    expect(stop?.hallCall).toBe(true);
    expect((stop?.departureSeconds ?? 0) - (stop?.arrivalSeconds ?? 0)).toBeCloseTo(
      OPEN_S + Math.max(DWELL_HALL_S, 4 * 1.2) + CLOSE_S,
      12,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Feasibility
 * -------------------------------------------------------------------------- */

describe('feasible', () => {
  it('is false for a floor outside the shaft’s service zone', () => {
    const car = makeCar({ shaft: securedShaft() });
    const estimate = car.estimateCost({ floorId: '30', direction: 'up' });

    expect(estimate.feasible).toBe(false);
    expect(estimate.infeasibleReason).toBe('serviceZone');
    expect(estimate.etaSeconds).toBe(Number.POSITIVE_INFINITY);
  });

  /**
   * **The pickup floor is not an access question, and this test used to assert that it was.**
   *
   * It read: a hall call at restricted floor 9 is infeasible for `staff`, and infeasible for an
   * unbadged caller. Both assertions were wrong about lifts, and the second was catastrophic —
   * under `up-down-buttons` *every* landing call is unbadged by construction, so every car
   * refused every landing call raised inside an access zone and no access-zoned building could
   * be served by any conventional dispatcher (§ D254).
   *
   * The credential governs where you may **go**. Floor 9 asks nothing of somebody already
   * standing on floor 9.
   */
  it('collects from a restricted floor whatever the credential, because a pickup is not an access question', () => {
    const car = makeCar({ shaft: securedShaft() });

    // Floor 9 is restricted to `exec`. All three of these are people standing on floor 9 who
    // pressed a button, and a lift collects all three.
    expect(car.estimateCost({ floorId: '9', direction: 'up', credentialGroup: 'staff' }).feasible).toBe(
      true,
    );
    expect(car.estimateCost({ floorId: '9', direction: 'up' }).feasible).toBe(true);
    expect(car.estimateCost({ floorId: '9', direction: 'up', credentialGroup: 'exec' }).feasible).toBe(
      true,
    );

    // And an unrestricted floor is unaffected, as it always was.
    expect(car.estimateCost({ floorId: '3', direction: 'up' }).feasible).toBe(true);
  });

  it('keeps service zoning and access zoning as separate answers', () => {
    const car = makeCar({ shaft: securedShaft() });

    // Floor 30: no shaft goes there, for anybody — a physical fact about the pickup, and the
    // one question the pickup floor *is* asked. Floor 9: the shaft goes there, and access
    // zoning has nothing to say about being collected from it.
    expect(car.estimateCost({ floorId: '30', credentialGroup: 'exec' }).infeasibleReason).toBe(
      'serviceZone',
    );
    expect(car.estimateCost({ floorId: '9', credentialGroup: 'staff' }).infeasibleReason).toBe(
      undefined,
    );

    // Access zoning answers about the destination, and the two reasons stay distinct there:
    // floor 30 is unreachable by any shaft, floor 9 is reachable but not by `staff`.
    expect(
      car.estimateCost({ floorId: '3', destinationFloorId: '30', credentialGroup: 'exec' })
        .infeasibleReason,
    ).toBe('destinationServiceZone');
    expect(
      car.estimateCost({ floorId: '3', destinationFloorId: '9', credentialGroup: 'staff' })
        .infeasibleReason,
    ).toBe('destinationAccessDenied');
  });

  /**
   * The other half of § D254, and the one a careless fix breaks: moving the question off the
   * pickup must not take it off the destination too.
   */
  it('still refuses a destination the credential may not reach, from any pickup', () => {
    const car = makeCar({ shaft: securedShaft() });

    // Unrestricted pickup, restricted destination, wrong badge — refused.
    expect(
      car.estimateCost({ floorId: '3', destinationFloorId: '9', credentialGroup: 'staff' }).feasible,
    ).toBe(false);
    // Unbadged is refused for the same destination: an undisclosed credential authorizes nothing.
    expect(car.estimateCost({ floorId: '3', destinationFloorId: '9' }).feasible).toBe(false);
    // *Restricted* pickup, restricted destination, wrong badge — still refused. The fix admits
    // the pickup, it does not admit the journey.
    expect(
      car.estimateCost({ floorId: '9', destinationFloorId: '9', credentialGroup: 'staff' })
        .infeasibleReason,
    ).toBe('destinationAccessDenied');
    // And the right badge travels.
    expect(
      car.estimateCost({ floorId: '3', destinationFloorId: '9', credentialGroup: 'exec' }).feasible,
    ).toBe(true);
  });

  it('checks the destination too when destination entry supplies one', () => {
    const car = makeCar({ shaft: securedShaft() });

    expect(
      car.estimateCost({ floorId: '3', direction: 'up', destinationFloorId: '30' })
        .infeasibleReason,
    ).toBe('destinationServiceZone');
    expect(
      car.estimateCost({
        floorId: '3',
        direction: 'up',
        destinationFloorId: '9',
        credentialGroup: 'staff',
      }).infeasibleReason,
    ).toBe('destinationAccessDenied');
    expect(
      car.estimateCost({
        floorId: '3',
        direction: 'up',
        destinationFloorId: '9',
        credentialGroup: 'exec',
      }).feasible,
    ).toBe(true);
  });

  it('is false for an out-of-service car, for every kind of request', () => {
    const car = makeCar();
    car.setMode('out-of-service');

    expect(car.estimateCost(hallCall('5', 'up')).infeasibleReason).toBe('serviceMode');
    expect(car.estimateCost({ floorId: '5', kind: 'car' }).infeasibleReason).toBe('serviceMode');
  });

  it('is false for a recalled car, and false for hall calls but true for car calls on independent service', () => {
    const recalled = makeCar();
    recalled.setMode('fire-recall');
    expect(recalled.estimateCost(hallCall('5', 'up')).infeasibleReason).toBe('serviceMode');
    expect(recalled.estimateCost({ floorId: '5', kind: 'car' }).infeasibleReason).toBe('serviceMode');

    const independent = makeCar();
    independent.setMode('independent');
    expect(independent.estimateCost(hallCall('5', 'up')).infeasibleReason).toBe('serviceMode');
    expect(independent.estimateCost({ floorId: '5', kind: 'car' }).feasible).toBe(true);
  });

  it('is false for a new hall call once the load crosses the bypass threshold, and stays true for car calls', () => {
    const car = makeCar();
    car.board(passenger('heavy', '10', 1350 * 0.8), 0);

    expect(car.loadFactor).toBe(0.8);
    expect(car.estimateCost(hallCall('5', 'up')).infeasibleReason).toBe('hallCallBypass');
    // "Serve only existing car calls" — a request from inside the car is still feasible.
    expect(car.estimateCost({ floorId: '5', kind: 'car' }).feasible).toBe(true);
  });

  it('is false for everything once the load crosses the overload threshold', () => {
    const car = makeCar();
    car.board(passenger('heavy', '10', 1350 * 1.1), 0);

    expect(car.estimateCost(hallCall('5', 'up')).infeasibleReason).toBe('overload');
    expect(car.estimateCost({ floorId: '5', kind: 'car' }).infeasibleReason).toBe('overload');
  });

  it('reports the most structural reason first', () => {
    const car = makeCar({ shaft: securedShaft() });
    car.setMode('out-of-service');

    // Out of service *and* out of zone: the mode is reported, because it is checked first and
    // is the condition a dispatcher can act on by picking a different car.
    expect(car.estimateCost({ floorId: '30' }).infeasibleReason).toBe('serviceMode');
    expect(infeasibilityOf(car.snapshot(), { floorId: '30' })).toBe('serviceMode');
  });

  it('reports Infinity so a scorer that ignores `feasible` still ranks the car last', () => {
    const car = makeCar();
    car.setMode('out-of-service');
    const estimate = car.estimateCost(hallCall('5', 'up'));

    expect(estimate.etaSeconds).toBe(Number.POSITIVE_INFINITY);
    expect(estimate.marginalDelaySeconds).toBe(0);
    expect(estimate.resultingLoadFactor).toBe(car.loadFactor);
  });
});

/* -------------------------------------------------------------------------- *
 * Determinism
 * -------------------------------------------------------------------------- */

describe('determinism', () => {
  it('returns an identical estimate for an identical request, 100 times', () => {
    const car = makeCar();
    car.registerCarCall('7', 0);
    car.assignHallCall(hallCall('13', 'down', 0));
    car.board(passenger('p1', '7', 82.5), 0);

    const request = hallCall('4', 'up', 3);
    const first = car.estimateCost(request);

    for (let i = 0; i < 100; i += 1) {
      const estimate = car.estimateCost(request);
      expect(estimate).toEqual(first);
      // Exact float equality, not toBeCloseTo: a run must replay bit for bit.
      expect(estimate.etaSeconds).toBe(first.etaSeconds);
      expect(estimate.marginalDelaySeconds).toBe(first.marginalDelaySeconds);
      expect(estimate.resultingLoadFactor).toBe(first.resultingLoadFactor);
    }
  });

  it('gives two identically built cars identical estimates', () => {
    function build(): Car {
      const car = makeCar();
      car.registerCarCall('7', 0);
      car.registerCarCall('2', 0);
      car.assignHallCall(hallCall('13', 'down', 1));
      car.board(passenger('p1', '7', 82.5), 0);
      car.board(passenger('p2', '13', 61.25), 0);
      return car;
    }

    const left = build();
    const right = build();
    const requests: CostRequest[] = [
      hallCall('4', 'up', 3),
      hallCall('18', 'down', 4),
      { floorId: '9', kind: 'car' },
      { floorId: '0', direction: 'down', boardingPassengers: 5 },
    ];

    for (const request of requests) {
      expect(left.estimateCost(request)).toEqual(right.estimateCost(request));
    }
    expect(JSON.stringify(left.serialize())).toBe(JSON.stringify(right.serialize()));
  });

  it('does not depend on the order calls were registered in', () => {
    const forwards = makeCar();
    forwards.registerCarCall('3', 0);
    forwards.registerCarCall('11', 0);
    forwards.registerCarCall('7', 0);

    const backwards = makeCar();
    backwards.registerCarCall('7', 0);
    backwards.registerCarCall('11', 0);
    backwards.registerCarCall('3', 0);

    expect(forwards.route().map((stop) => stop.floorId)).toEqual(
      backwards.route().map((stop) => stop.floorId),
    );
    expect(forwards.estimateCost(hallCall('9', 'up'))).toEqual(
      backwards.estimateCost(hallCall('9', 'up')),
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Free-function surface
 * -------------------------------------------------------------------------- */

describe('the free functions the car delegates to', () => {
  it('gives the same answer as the method, which is a one-line delegation', () => {
    const car = makeCar();
    car.registerCarCall('6', 0);
    const request = hallCall('11', 'up', 2);

    expect(estimateCost(car.snapshot(), request)).toEqual(car.estimateCost(request));
  });

  it('builds a requested stop from the request, defaulting the boarding count', () => {
    const car = makeCar();
    const stop = requestedStop(car.snapshot(), hallCall('6', 'up', 5));

    expect(stop).toEqual({
      floorId: '6',
      floorIndex: 6,
      heightM: 24,
      carCall: false,
      hallCall: true,
      hallCallDirections: ['up'],
      registeredAt: 5,
      alightingCount: 0,
      alightingMassKg: 0,
      boardingCount: 1,
    });
    expect(requestedStop(car.snapshot(), { floorId: '99' })).toBeUndefined();
  });

  it('merges a request for a floor that is already a stop rather than duplicating it', () => {
    const car = makeCar();
    car.registerCarCall('6', 0);
    const snapshot = car.snapshot();
    const route = projectRoute(snapshot, requestedStop(snapshot, hallCall('6', 'up', 5)));

    expect(route).toHaveLength(1);
    expect(route[0]?.carCall).toBe(true);
    expect(route[0]?.hallCall).toBe(true);
    expect(route[0]?.requested).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

/**
 * Make every write the estimator could attempt throw.
 *
 * Freezes the snapshot and everything reachable through it, and replaces the shaft's lookup
 * maps with proxies whose `set`/`delete`/`clear` throw — `Object.freeze` does not protect a
 * Map's contents, so freezing alone would leave the one mutable surface a snapshot exposes
 * unguarded.
 */
function tamperProof(snapshot: CarSnapshot): CarSnapshot {
  const shaft = Object.freeze({
    ...snapshot.shaft,
    floors: Object.freeze(snapshot.shaft.floors.map((floor) => Object.freeze({ ...floor }))),
    floorsById: sealedMap(snapshot.shaft.floorsById),
    floorsByIndex: sealedMap(snapshot.shaft.floorsByIndex),
  });

  return Object.freeze({
    ...snapshot,
    shaft,
    door: Object.freeze({
      ...snapshot.door,
      reason: Object.freeze({ ...snapshot.door.reason }),
      accounting: Object.freeze({ ...snapshot.door.accounting }),
    }),
    doorConfig: Object.freeze({ ...snapshot.doorConfig }),
    constraints: Object.freeze({ ...snapshot.constraints }),
    load: Object.freeze({ ...snapshot.load }),
    ...(snapshot.motion === undefined
      ? {}
      : { motion: Object.freeze({ ...snapshot.motion, profile: Object.freeze(snapshot.motion.profile) }) }),
    stops: Object.freeze(
      snapshot.stops.map((stop) =>
        Object.freeze({ ...stop, hallCallDirections: Object.freeze([...stop.hallCallDirections]) }),
      ),
    ),
  });
}

function sealedMap<K, V>(map: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  return new Proxy(map as Map<K, V>, {
    get(target, key) {
      if (key === 'set' || key === 'delete' || key === 'clear') {
        return () => {
          throw new TypeError(`estimateCost mutated a shaft lookup via Map.${String(key)}()`);
        };
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
}

/** Read one of this module's own source files, for the structural-purity assertions. */
async function readModuleSource(fileName: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  return readFile(fileURLToPath(new URL(fileName, import.meta.url)), 'utf8');
}

/** Type-level guard: the exported shape is exactly the documented contract. */
const _contract: (estimate: CostEstimate) => void = (estimate) => {
  void estimate.feasible;
  void estimate.etaSeconds;
  void estimate.marginalDelaySeconds;
  void estimate.resultingLoadFactor;
};
void _contract;
