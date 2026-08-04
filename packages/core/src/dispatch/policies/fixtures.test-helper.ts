/**
 * Fixtures for the `dispatch/policies` suites.
 *
 * Self-contained on purpose. The `terms/` suites have their own helper of the same shape, and
 * sharing one would couple two directories' test data together — a fixture change made for a cost
 * term would silently move an auction equivalence proof, which is the one thing in this module that
 * must not move for an unrelated reason.
 *
 * Round numbers throughout (2 m/s, 1 m/s², 1 m/s³, 4 m floor pitch), so an expected time in a test
 * can be reasoned about rather than pasted from a run.
 */

import { resolveCar } from '../../config/resolveCar.js';
import type { ElevatorSpecs, ResolvedCar } from '../../config/types.js';
import { Car } from '../../model/car/car.js';
import { createShaft, type CarShaft, type CarSnapshot } from '../../model/car/types.js';
import { Passenger } from '../../model/passenger.js';
import { hallCallId, type Direction, type HallCall } from '../../model/types.js';
import type { DispatchCall, DispatcherProfileSource } from '../types.js';

/* -------------------------------------------------------------------------- *
 * Specs
 * -------------------------------------------------------------------------- */

export const REFERENCE_SPECS: ElevatorSpecs = {
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

export const SPEC: ResolvedCar = resolveCar(
  { id: 'A', spec: 'round-numbers', ratedLoadLb: 3000 },
  REFERENCE_SPECS,
);

export const FLOOR_PITCH_M = 4;
/** Mean body mass the load sensor projects boarding load with. */
export const NOMINAL_MASS_KG = 75;

/* -------------------------------------------------------------------------- *
 * Shafts, clocks and cars
 * -------------------------------------------------------------------------- */

export function plainShaft(count = 21): CarShaft {
  return createShaft(
    Array.from({ length: count }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * FLOOR_PITCH_M,
    })),
  );
}

export interface Clock {
  now(): number;
  set(t: number): void;
}

export function clockAt(start = 0): Clock {
  let time = start;
  return {
    now: () => time,
    set: (t: number) => {
      time = t;
    },
  };
}

export function makeCar(
  id: string,
  homeFloorId: string,
  clock: Clock = clockAt(0),
  bankId = 'low',
  shaft: CarShaft = plainShaft(),
): Car {
  return new Car({ id, bankId, spec: SPEC, shaft, homeFloorId, clock });
}

export function snapshotAt(id: string, floorId: string, at = 0): CarSnapshot {
  return makeCar(id, floorId).snapshot(at);
}

/* -------------------------------------------------------------------------- *
 * Calls
 * -------------------------------------------------------------------------- */

/**
 * A landing call, optionally carrying the destination a destination-entry panel would know.
 *
 * `destinationFloorId` is opt-in and absent by default, so every existing caller is unchanged and
 * a fixture that wants to exercise `rideTime` — the one term in the library whose `activeWhen`
 * asks for a destination — can say so in one argument rather than by spreading fields onto the
 * returned value. `costRequestFor` drops it again under `up-down-buttons`, so supplying it does
 * not smuggle information into a conventional scenario.
 */
export function call(
  floorId: string,
  direction: Direction = 'up',
  registeredAt = 0,
  destinationFloorId?: string | undefined,
): DispatchCall {
  return {
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: Number(floorId),
    direction,
    registeredAt,
    ...(destinationFloorId === undefined ? {} : { destinationFloorId }),
  };
}

export function hallCall(
  floorId: string,
  direction: Direction = 'up',
  registeredAt = 0,
): HallCall {
  return {
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: Number(floorId),
    direction,
    registeredAt,
  };
}

/* -------------------------------------------------------------------------- *
 * Load
 * -------------------------------------------------------------------------- */

let passengerSeq = 0;

/**
 * Board `count` passengers of {@link NOMINAL_MASS_KG} each, all bound for `destinationFloorId`.
 *
 * A count rather than a target load factor, because the interesting scenarios in this module turn
 * on the **room the car has left** — `requestForCar` caps a hall request at
 * `floor((designLoad − mass) / nominalMass)` — and a count is the only way to hit a specific room
 * exactly. All at nominal mass so the load cell's reading is `count × 75` and nothing rounds.
 */
export function board(car: Car, count: number, destinationFloorId = '19', at = 0): void {
  for (let index = 0; index < count; index += 1) {
    passengerSeq += 1;
    const id = `p${passengerSeq}`;
    car.board(
      new Passenger({
        id,
        journeyId: id,
        originFloorId: car.floorId,
        originFloorIndex: car.floorIndex,
        destinationFloorId,
        destinationFloorIndex: Number(destinationFloorId),
        massKg: NOMINAL_MASS_KG,
        arrivedAt: at,
      }),
      at,
    );
  }
}

/* -------------------------------------------------------------------------- *
 * Profiles
 * -------------------------------------------------------------------------- */

/** A profile with the given weights and stage sections. Never given a meaningful id. */
export function profile(
  weights: Readonly<Record<string, number>>,
  extras: Omit<DispatcherProfileSource, 'id' | 'name' | 'weights'> = {},
): DispatcherProfileSource {
  return { id: 'fixture', name: 'Fixture', weights, ...extras };
}
