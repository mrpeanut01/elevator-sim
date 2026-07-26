/**
 * Shared fixtures for the cost-term tests.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`, so a helper named
 * this way is imported by tests but never collected as a suite of its own — and cannot silently
 * become one by acquiring an `it()` block. The same convention `sim/fixtures.test-helper.ts` uses.
 *
 * The numbers are chosen so a travel time can be checked by hand and matched against
 * `estimateCost.test.ts`: V = 2.0 m/s, A = 1.0 m/s², J = 1.0 m/s³, floors 4 m apart at indices
 * 0..20, so floor N is at 4N metres and a 40 m run takes 23.0 s of profile.
 */

import { resolveCar } from '../../config/resolveCar.js';
import type { ElevatorSpecs, ResolvedCar } from '../../config/types.js';
import { Car } from '../../model/car/car.js';
import { estimateCost } from '../../model/car/estimateCost.js';
import { createShaft, type CarShaft, type CarSnapshot } from '../../model/car/types.js';
import { Passenger } from '../../model/passenger.js';
import { hallCallId, type Direction, type HallCall } from '../../model/types.js';
import { costRequestFor, observationFor } from '../lifecycle.js';
import { resolveDispatchConfig } from '../policy.js';
import type {
  DispatchCall,
  DispatchObservation,
  ResolvedDispatchConfig,
  TermContext,
} from '../types.js';

/* -------------------------------------------------------------------------- *
 * Hardware
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
    passengerTransferS: { office: 1.2, residential: 1.75, hotel: 1.5 },
  },
  loadSensor: { hallCallBypassThreshold: 0.8, overloadAlarmThreshold: 1.1 },
  realWorldAnchors: [],
};

export const SPEC: ResolvedCar = resolveCar(
  { id: 'A', spec: 'round-numbers', ratedLoadLb: 3000 },
  REFERENCE_SPECS,
);

/** Metres between adjacent floors in {@link plainShaft}. */
export const FLOOR_PITCH_M = 4;

export function plainShaft(count = 21): CarShaft {
  return createShaft(
    Array.from({ length: count }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * FLOOR_PITCH_M,
    })),
  );
}

/* -------------------------------------------------------------------------- *
 * Clock and car
 * -------------------------------------------------------------------------- */

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
  id = 'A',
  homeFloorId = '0',
  clock: Clock = clockAt(0),
  shaft = plainShaft(),
): Car {
  return new Car({ id, bankId: 'low', spec: SPEC, shaft, homeFloorId, clock });
}

/* -------------------------------------------------------------------------- *
 * Calls and passengers
 * -------------------------------------------------------------------------- */

export function call(
  floorId: string,
  direction: Direction,
  registeredAt = 0,
  destinationFloorId?: string,
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

export function hallCall(floorId: string, direction: Direction, registeredAt = 0): HallCall {
  return {
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: Number(floorId),
    direction,
    registeredAt,
  };
}

let passengerSeq = 0;

/** A passenger already standing at `originFloorId`, ready to board. */
export function passengerTo(
  destinationFloorId: string,
  massKg = 75,
  originFloorId = '0',
  arrivedAt = 0,
): Passenger {
  passengerSeq += 1;
  const id = `p${passengerSeq}`;
  return new Passenger({
    id,
    journeyId: id,
    originFloorId,
    originFloorIndex: Number(originFloorId),
    destinationFloorId,
    destinationFloorIndex: Number(destinationFloorId),
    massKg,
    arrivedAt,
  });
}

/* -------------------------------------------------------------------------- *
 * Contexts
 * -------------------------------------------------------------------------- */

/** The default resolved config: every stage setting at its declared default. */
export const CONFIG: ResolvedDispatchConfig = resolveDispatchConfig({
  id: 'probe',
  name: 'Probe',
  weights: {},
});

/** A config that knows the destination at call time, for the two terms that need one. */
export const DESTINATION_CONFIG: ResolvedDispatchConfig = resolveDispatchConfig({
  id: 'probe-de',
  name: 'Probe (destination entry)',
  weights: {},
  dispatch: { callType: 'destination-entry' },
});

/** Extra facts a test wants on the observation, including the two the group controller owns. */
export interface ContextOptions {
  readonly at?: number | undefined;
  readonly config?: ResolvedDispatchConfig | undefined;
  readonly waitingPassengers?: number | undefined;
  readonly waitingMassKg?: number | undefined;
  readonly zoneFloorIdsByCarId?: ReadonlyMap<string, readonly string[]> | undefined;
  readonly demandForecast?: ReadonlyMap<string, number> | undefined;
}

/**
 * A {@link TermContext} built the way `lifecycle.ts` builds one — the real `observationFor`, the
 * real `costRequestFor` and the real `estimateCost`, so a term under test sees exactly the question
 * the engine asks, including the two group-owned facts.
 *
 * A unit fixture is still not proof of liveness: it can supply a zone the engine would never have
 * forwarded. `liveness.test.ts` closes that gap by going through `policy.score()` instead.
 */
export function contextFor(
  car: CarSnapshot,
  subject: DispatchCall,
  options: ContextOptions = {},
): TermContext {
  const config = options.config ?? CONFIG;
  const observation: DispatchObservation = observationFor(
    subject,
    options.waitingPassengers,
    options.waitingMassKg,
    {
      ...(options.zoneFloorIdsByCarId === undefined
        ? {}
        : { zoneFloorIdsByCarId: options.zoneFloorIdsByCarId }),
      ...(options.demandForecast === undefined ? {} : { demandForecast: options.demandForecast }),
    },
  );
  const request = costRequestFor(subject, config, observation);
  return {
    car,
    call: subject,
    request,
    estimate: estimateCost(car, request),
    at: options.at ?? car.at,
    observation,
  };
}

/* -------------------------------------------------------------------------- *
 * Purity harness
 * -------------------------------------------------------------------------- */

/**
 * Make every write a term could attempt throw.
 *
 * Lifted from `model/car/estimateCost.test.ts`, which the roadmap's purity acceptance test uses:
 * freeze the snapshot and everything reachable through it, and replace the shaft's lookup maps
 * with proxies whose `set`/`delete`/`clear` throw — `Object.freeze` does not protect a `Map`'s
 * contents, so freezing alone would leave the one mutable surface a snapshot exposes unguarded.
 */
export function tamperProof(snapshot: CarSnapshot): CarSnapshot {
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
      : {
          motion: Object.freeze({
            ...snapshot.motion,
            profile: Object.freeze(snapshot.motion.profile),
          }),
        }),
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
          throw new TypeError(`a cost term mutated a shaft lookup via Map.${String(key)}()`);
        };
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
}
