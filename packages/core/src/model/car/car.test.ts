/// <reference types="node" />

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../config/loader.js';
import { resolveCar } from '../../config/resolveCar.js';
import type { ElevatorSpecs, LoadedConfig, ResolvedCar } from '../../config/types.js';
import { SimKernel, createEvent } from '../../kernel/index.js';
import {
  buildProfile,
  positionAt as profilePositionAt,
  travelTime,
} from '../../physics/motion/index.js';
import { createBuilding } from '../building.js';
import { Passenger } from '../passenger.js';
import { ModelError, hallCallId, type HallCall } from '../types.js';

import { CAR_DEFAULTS, CAR_PARAMETERS, Car } from './car.js';
import {
  createShaft,
  shaftForBank,
  shaftServes,
  type CarClock,
  type CarShaft,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 *
 * Same round-number envelope as `estimateCost.test.ts`: V = 2.0, A = 1.0, J = 1.0, floors
 * 4 m apart, so a 20 m trip is exactly 13.0 s and a 40 m trip exactly 23.0 s.
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

function plainShaft(floorCount = 21): CarShaft {
  return createShaft(
    Array.from({ length: floorCount }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * FLOOR_PITCH_M,
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

function makeCar(
  options: { shaft?: CarShaft; clock?: CarClock; homeFloorId?: string } = {},
): Car {
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

/* -------------------------------------------------------------------------- *
 * Shaft
 * -------------------------------------------------------------------------- */

describe('createShaft', () => {
  it('indexes floors by id and by index, ascending, whatever order they arrive in', () => {
    const shaft = createShaft([
      { id: '3', index: 3, heightM: 12 },
      { id: 'G', index: 0, heightM: 0 },
      { id: 'B1', index: -1, heightM: -3.5 },
    ]);

    expect(shaft.floors.map((floor) => floor.id)).toEqual(['B1', 'G', '3']);
    expect(shaft.lowestIndex).toBe(-1);
    expect(shaft.highestIndex).toBe(3);
    expect(shaft.floorsById.get('G')?.heightM).toBe(0);
    expect(shaft.floorsByIndex.get(3)?.id).toBe('3');
    expect(shaftServes(shaft, 'B1')).toBe(true);
    expect(shaftServes(shaft, '4')).toBe(false);
  });

  it('rejects a shaft whose geometry disagrees with its ordering', () => {
    expect(() =>
      createShaft([
        { id: 'a', index: 0, heightM: 0 },
        { id: 'b', index: 1, heightM: -1 },
      ]),
    ).toThrow(/Height must increase strictly with index/);
  });

  it('rejects duplicates, empty shafts and non-integer indices', () => {
    expect(() => createShaft([])).toThrow(ModelError);
    expect(() =>
      createShaft([
        { id: 'a', index: 0, heightM: 0 },
        { id: 'a', index: 1, heightM: 4 },
      ]),
    ).toThrow(/twice/);
    expect(() => createShaft([{ id: 'a', index: 0.5, heightM: 0 }])).toThrow(/integer index/);
  });
});

describe('shaftForBank, against the real building configs', () => {
  let config: LoadedConfig;

  beforeAll(async () => {
    config = await loadConfig(fileURLToPath(new URL('../../../../../data', import.meta.url)));
  });

  it('gives a Secure Tower low-bank car a shaft that stops where the bank stops', () => {
    const tower = config.buildingsById.get('secure-tower');
    expect(tower).toBeDefined();
    if (tower === undefined) return;

    const low = shaftForBank(tower, 'low');
    const bank = tower.banks.find((candidate) => candidate.id === 'low');
    expect(bank).toBeDefined();

    expect(low.floors).toHaveLength(bank?.servesFloors.length ?? -1);
    for (const floorId of bank?.servesFloors ?? []) {
      expect(shaftServes(low, floorId)).toBe(true);
      expect(low.floorsById.get(floorId)?.heightM).toBe(tower.floorsById.get(floorId)?.heightM);
    }
  });

  it('folds the building’s access zones onto the floors they cover, and only those', () => {
    const tower = config.buildingsById.get('secure-tower');
    expect(tower).toBeDefined();
    if (tower === undefined) return;

    const restricted = new Set(tower.accessZones.flatMap((zone) => zone.floors));
    for (const bank of tower.banks) {
      const shaft = shaftForBank(tower, bank.id);
      for (const floor of shaft.floors) {
        expect(floor.permittedCredentialGroups === undefined).toBe(!restricted.has(floor.id));
      }
    }
    expect(restricted.size).toBeGreaterThan(0);
  });

  it('rejects a bank the building does not declare', () => {
    const tower = config.buildingsById.get('secure-tower');
    expect(tower).toBeDefined();
    if (tower === undefined) return;
    expect(() => shaftForBank(tower, 'nope')).toThrow(/declares no bank/);
  });

  it('builds a whole building of real cars through createBuilding', () => {
    const resolved = config.buildingsById.get('midtown-office');
    expect(resolved).toBeDefined();
    if (resolved === undefined) return;

    const kernel = new SimKernel();
    const entrance = resolved.entranceFloors[0]?.id ?? resolved.floors[0]?.id ?? 'G';
    const building = createBuilding(resolved, {
      createCar: (spec, context) =>
        new Car({
          id: `${context.bankId}-${spec.id}`,
          bankId: context.bankId,
          spec,
          shaft: shaftForBank(resolved, context.bankId),
          homeFloorId: entrance,
          clock: kernel,
          loadSensorSpec: config.elevatorSpecs.loadSensor,
        }),
    });

    expect(building.cars.length).toBeGreaterThan(0);
    for (const car of building.cars) {
      expect(car.floorId).toBe(entrance);
      expect(car.loadSensor.ratedLoadKg).toBeGreaterThan(0);
      expect(car.estimateCost(hallCall(entrance, 'up')).feasible).toBe(true);
    }

    // `Building.reset` reaches the cars through `CarLike.reset`, which is what keeps
    // replications independent.
    const car = building.cars[0];
    expect(car).toBeDefined();
    car?.registerCarCall(resolved.floors[3]?.id ?? entrance, 0);
    building.reset();
    expect(car?.carCalls).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * Construction
 * -------------------------------------------------------------------------- */

describe('construction', () => {
  it('resolves doors, motion constraints and the load sensor from the car spec', () => {
    const car = makeCar();

    expect(car.constraints).toEqual({ ratedSpeedMps: 2, acceleration: 1, jerk: 1 });
    expect(car.doorConfig.openS).toBe(2);
    expect(car.doorConfig.closeS).toBe(3);
    expect(car.doorConfig.dwellCarCallS).toBe(3);
    expect(car.doorConfig.dwellHallCallS).toBe(5);
    expect(car.loadSensor.ratedLoadKg).toBe(1350);
    expect(car.loadSensor.bypassLoadThreshold).toBe(0.8);
    expect(car.loadSensor.overloadThreshold).toBe(1.1);
  });

  it('lets a dispatcher profile’s answer stage retune both doors and the load sensor', () => {
    const car = new Car({
      id: 'A',
      bankId: 'low',
      spec: SPEC,
      shaft: plainShaft(),
      homeFloorId: '0',
      clock: clockAt(0),
      loadSensorSpec: REFERENCE_SPECS.loadSensor,
      answer: { dwellPolicy: 'adaptive', dwellAdaptationGain: 0.5, bypassLoadThreshold: 0.7 },
    });

    expect(car.doorConfig.dwellPolicy).toBe('adaptive');
    expect(car.doorConfig.dwellAdaptationGain).toBe(0.5);
    expect(car.loadSensor.bypassLoadThreshold).toBe(0.7);
  });

  it('refuses a home floor the shaft does not serve, and an empty id', () => {
    expect(() => makeCar({ homeFloorId: '99' })).toThrow(/does not serve/);
    expect(
      () =>
        new Car({
          id: '',
          bankId: 'low',
          spec: SPEC,
          shaft: plainShaft(),
          homeFloorId: '0',
          clock: clockAt(0),
        }),
    ).toThrow(/must not be empty/);
  });

  it('starts standing still, doors shut, empty, with nothing to do', () => {
    const car = makeCar({ homeFloorId: '4' });

    expect(car.floorId).toBe('4');
    expect(car.heightM).toBe(16);
    expect(car.isMoving).toBe(false);
    expect(car.direction).toBeUndefined();
    expect(car.doorState).toBe('closed');
    expect(car.loadKg).toBe(0);
    expect(car.mode).toBe('in-service');
    expect(car.route()).toEqual([]);
    expect(car.canStart).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * positionAt — the renderer's interface
 * -------------------------------------------------------------------------- */

describe('positionAt', () => {
  it('agrees exactly with the motion profile it was built from', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    const move = car.departFor('10', 0);
    const profile = buildProfile(40, car.constraints);

    expect(move.profile.duration).toBe(profile.duration);
    for (let i = 0; i <= 200; i += 1) {
      const t = move.startedAt + (profile.duration * i) / 200;
      expect(car.positionAt(t)).toBe(profilePositionAt(profile, t - move.startedAt));
    }
  });

  it('holds the departure floor through the motor start delay, then moves', () => {
    const car = makeCar();
    const move = car.departFor('10', 100);

    expect(move.commandedAt).toBe(100);
    expect(move.startedAt).toBe(100.5);
    expect(car.positionAt(100)).toBe(0);
    expect(car.positionAt(100.25)).toBe(0);
    expect(car.positionAt(100.5)).toBe(0);
    expect(car.positionAt(101)).toBeGreaterThan(0);
  });

  it('is continuous across the arrival event: nothing jumps when the kernel fires', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    const move = car.departFor('10', 0);

    const justBefore = car.positionAt(move.arrivesAt - 1e-9);
    const atArrival = car.positionAt(move.arrivesAt);
    expect(atArrival).toBe(40);
    expect(justBefore).toBe(40); // the profile ended before levelling did

    clock.set(move.arrivesAt);
    car.completeArrival();

    expect(car.positionAt(move.arrivesAt)).toBe(atArrival);
    expect(car.positionAt(move.arrivesAt + 5)).toBe(40);
    expect(car.heightM).toBe(40);
  });

  it('is monotonic and bounded across a whole up trip, and mirrored on the way down', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    const up = car.departFor('10', 0);

    let previous = -1;
    for (let i = 0; i <= 400; i += 1) {
      const y = car.positionAt(up.commandedAt + (i * (up.arrivesAt - up.commandedAt)) / 400);
      expect(y).toBeGreaterThanOrEqual(previous);
      expect(y).toBeLessThanOrEqual(40);
      previous = y;
    }

    clock.set(up.arrivesAt);
    car.completeArrival();
    const down = car.departFor('2', up.arrivesAt);

    previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 400; i += 1) {
      const y = car.positionAt(down.commandedAt + (i * (down.arrivesAt - down.commandedAt)) / 400);
      expect(y).toBeLessThanOrEqual(previous);
      expect(y).toBeGreaterThanOrEqual(8);
      previous = y;
    }
  });

  it('clamps outside the move rather than extrapolating, so a renderer may be off by a frame', () => {
    const car = makeCar();
    const move = car.departFor('10', 10);

    expect(car.positionAt(-1000)).toBe(0);
    expect(car.positionAt(move.arrivesAt + 1000)).toBe(40);
  });

  it('reports velocity and full kinematics in the building frame', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });

    expect(car.velocityAt(0)).toBe(0);
    expect(car.kinematicsAt(0)).toEqual({ position: 0, velocity: 0, acceleration: 0 });

    const move = car.departFor('10', 0);
    const mid = move.startedAt + move.profile.duration / 2;
    const state = car.kinematicsAt(mid);

    expect(state.position).toBe(car.positionAt(mid));
    expect(state.velocity).toBe(car.velocityAt(mid));
    expect(state.velocity).toBeCloseTo(2, 12); // cruising at rated speed halfway through 40 m
    expect(car.velocityAt(move.startedAt + move.profile.duration)).toBe(0);
  });

  it('drives a kernel run: the arrival event fires exactly when positionAt says it should', () => {
    const kernel = new SimKernel();
    const car = makeCar({ clock: kernel });
    const seen: number[] = [];

    const move = car.departFor('10', 0);
    kernel.schedule(
      move.arrivesAt,
      createEvent('car.arrived', (_: undefined, context) => {
        car.completeArrival(context.time);
        seen.push(context.time);
      }),
    );
    kernel.runUntilEmpty();

    expect(seen).toEqual([move.arrivesAt]);
    expect(move.arrivesAt).toBe(0.5 + travelTime(40, SPEC) + 0.5);
    expect(car.floorId).toBe('10');
    expect(car.distanceTravelledM).toBe(40);
  });
});

/* -------------------------------------------------------------------------- *
 * Motion control
 * -------------------------------------------------------------------------- */

describe('departFor and completeArrival', () => {
  it('builds the S-curve for the displacement and brackets it with the car-level overheads', () => {
    const car = makeCar({ homeFloorId: '10' });
    const move = car.departFor('2', 40);

    expect(move.profile.displacementM).toBe(-32);
    expect(move.direction).toBe('down');
    expect(move.startedAt).toBe(40 + SPEC.motorStartDelayS);
    expect(move.arrivesAt).toBe(move.startedAt + move.profile.duration + SPEC.levelingSettleS);
    expect(car.direction).toBe('down');
    expect(car.departures).toBe(1);
  });

  it('refuses to start while moving, with the doors open, or off the shaft', () => {
    const car = makeCar();
    car.departFor('10', 0);
    expect(() => car.departFor('5', 0)).toThrow(/already travelling/);

    const other = makeCar();
    other.openDoors(0);
    expect(() => other.departFor('5', 0)).toThrow(/doors opening/);

    const third = makeCar();
    expect(() => third.departFor('99', 0)).toThrow(/does not serve/);
    expect(() => third.departFor('0', 0)).toThrow(/already at floor/);
  });

  it('refuses to complete an arrival early, or with no move in progress', () => {
    const car = makeCar();
    expect(() => car.completeArrival(0)).toThrow(/not moving/);

    const move = car.departFor('10', 0);
    expect(() => car.completeArrival(move.arrivesAt - 1)).toThrow(/cannot complete its arrival/);
    expect(() => car.completeArrival(move.arrivesAt)).not.toThrow();
  });

  it('accumulates distance travelled as the energy proxy', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });

    let move = car.departFor('10', 0);
    clock.set(move.arrivesAt);
    car.completeArrival();
    move = car.departFor('4', clock.now());
    clock.set(move.arrivesAt);
    car.completeArrival();

    expect(car.distanceTravelledM).toBe(40 + 24);
    expect(car.departures).toBe(2);
  });

  it('keeps the run direction while work lies ahead, reverses when it does not, then goes idle', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    car.registerCarCall('5', 0);
    car.registerCarCall('10', 0);
    car.registerCarCall('2', 0);

    /** Arrive, serve the stop, and shut the doors again. */
    const serve = (floorId: string): void => {
      const move = car.departFor(floorId, clock.now());
      clock.set(move.arrivesAt);
      car.completeArrival();
      car.openDoors(); // clears the car call at this floor
      clock.set(clock.now() + 20);
      car.advanceDoorsTo(clock.now());
    };

    serve('5');
    expect(car.direction).toBe('up'); // 10 is still ahead

    serve('10');
    expect(car.direction).toBe('down'); // only 2 is left, and it is below

    serve('2');
    expect(car.direction).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * Doors
 * -------------------------------------------------------------------------- */

describe('doors', () => {
  it('derives the stop reason from the calls the car holds here', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock, homeFloorId: '5' });
    car.registerCarCall('5', 0);
    car.assignHallCall(hallCall('5', 'up', 0));

    const step = car.openDoors(0);

    expect(step.state.reason.carCall).toBe(true);
    expect(step.state.reason.hallCall).toBe(true);
    expect(car.hasCarCall('5')).toBe(false); // the button light goes out
    expect(car.stopsServed).toBe(1);
  });

  it('merges a caller-supplied reason rather than replacing it', () => {
    const car = makeCar({ homeFloorId: '5' });
    car.registerCarCall('5', 0);

    const step = car.openDoors(0, { carCall: false, hallCall: true, transferSeconds: 12 });

    expect(step.state.reason.carCall).toBe(true);
    expect(step.state.reason.hallCall).toBe(true);
    expect(step.state.reason.transferSeconds).toBe(12);
  });

  it('runs open, dwell, close on the kernel’s schedule', () => {
    const clock = clockAt(0);
    const car = makeCar({ homeFloorId: '5', clock });
    car.openDoors(0, { carCall: true, hallCall: false });

    expect(car.doorState).toBe('opening');
    expect(car.nextDoorTransitionAt()).toBe(2); // openS

    clock.set(2);
    car.advanceDoorsTo(2);
    expect(car.doorState).toBe('open');
    expect(car.nextDoorTransitionAt()).toBe(2 + 3); // car-call dwell

    clock.set(5);
    car.advanceDoorsTo(5);
    expect(car.doorState).toBe('closing');
    expect(car.nextDoorTransitionAt()).toBe(5 + 3); // closeS

    clock.set(8);
    car.advanceDoorsTo(8);
    expect(car.doorState).toBe('closed');
    expect(car.nextDoorTransitionAt()).toBeUndefined();
    expect(car.door.accounting.totalS).toBeCloseTo(8, 12);
  });

  it('reopens on an obstruction the caller decided on, never one it drew itself', () => {
    const clock = clockAt(0);
    const car = makeCar({ homeFloorId: '5', clock });
    car.openDoors(0);
    car.advanceDoorsTo(2);
    car.advanceDoorsTo(5); // closing
    expect(car.doorState).toBe('closing');

    const step = car.requestReopen('obstruction', 6);

    expect(step.state.state).toBe('opening');
    expect(step.state.accounting.obstructions).toBe(1);
    expect(car.doorOpenFractionAt(6)).toBeCloseTo(2 / 3, 12);
  });

  it('does not shorten a stop when it is only advanced', () => {
    const clock = clockAt(0);
    const car = makeCar({ homeFloorId: '5', clock });
    car.openDoors(0, { carCall: true, hallCall: false });
    car.advanceDoorsTo(2);

    // Advancing to a moment inside the dwell must leave the door open, not close it early —
    // that is what `closeDoors` is for.
    car.advanceDoorsTo(3);
    expect(car.doorState).toBe('open');

    car.closeDoors(3);
    expect(car.doorState).toBe('closing');
  });

  it('refuses to open the doors while travelling', () => {
    const car = makeCar();
    car.departFor('10', 0);
    expect(() => car.openDoors(1)).toThrow(/while travelling/);
  });
});

/* -------------------------------------------------------------------------- *
 * The load interlocks, at the car level
 * -------------------------------------------------------------------------- */

describe('load interlocks', () => {
  it('sums real passenger masses through the car, not a head count', () => {
    const car = makeCar();
    car.board(passenger('p1', '5', 61.5), 0);
    car.board(passenger('p2', '5', 103.25), 0);

    expect(car.loadKg).toBeCloseTo(164.75, 10);
    expect(car.loadFactor).toBeCloseTo(164.75 / 1350, 12);
    expect(car.passengers).toHaveLength(2);
  });

  it('registers the destination button on boarding, unless told not to', () => {
    const car = makeCar();
    car.board(passenger('p1', '7', 80), 0);
    expect(car.hasCarCall('7')).toBe(true);

    const destination = makeCar();
    destination.board(passenger('p2', '7', 80), 0, { registerCarCall: false });
    expect(destination.hasCarCall('7')).toBe(false);
    // The stop still exists, because a passenger aboard bound for 7 *is* a stop at 7 — which
    // is what keeps destination dispatch from stranding people.
    expect(destination.committedStops().map((stop) => stop.floorId)).toEqual(['7']);
  });

  it('will not start once the overload threshold is crossed', () => {
    const car = makeCar();
    car.board(passenger('heavy', '5', 1350 * 1.1), 0);

    expect(car.isOverloaded).toBe(true);
    expect(car.canStart).toBe(false);
    expect(() => car.departFor('5', 0)).toThrow(/overloaded/);
  });

  it('holds the doors open while overloaded, and releases them when mass leaves', () => {
    const clock = clockAt(0);
    const car = makeCar({ homeFloorId: '5', clock });
    car.openDoors(0, { carCall: true, hallCall: false });
    car.advanceDoorsTo(2);
    expect(car.doorState).toBe('open');

    car.board(passenger('heavy', '10', 1350 * 1.05), 2);
    car.board(passenger('last', '10', 1350 * 0.1), 2);
    expect(car.isOverloaded).toBe(true);

    // No automatic close to schedule, and the door does not move however far time is run on.
    expect(car.nextDoorTransitionAt()).toBeUndefined();
    expect(car.doorsHeldByOverload).toBe(true);
    car.advanceDoorsTo(1000);
    expect(car.doorState).toBe('open');
    expect(() => car.closeDoors(1000)).toThrow(/held open/);
  });

  // REGRESSION. The interlock used to be checked against the door's state *on entry* to
  // `nextDoorTransitionAt` and `advanceDoorsTo`, so it only ever saw a door that was already
  // `open`. A car that crossed the threshold a moment earlier — while the door was still
  // opening, or while it was closing — escaped it entirely, because `advanceDoor` replays
  // `opening -> open -> closing -> closed` inside a single call and the entry check was blind
  // to everything after the first transition. One coalesced wake-up then shut the doors of an
  // overloaded car, which is the safety function docs/02-elevator-reference.md § Load weighing
  // behavior describes.
  it('does not let a coalesced wake-up shut the doors of a car that went overloaded while they were opening', () => {
    const clock = clockAt(0);
    const car = makeCar({ homeFloorId: '5', clock });
    car.openDoors(0, { carCall: true, hallCall: false });
    expect(car.doorState).toBe('opening');

    car.board(passenger('heavy', '10', 1350 * 1.2), 0);

    expect(car.isOverloaded).toBe(true);
    expect(car.doorsHeldByOverload).toBe(true);
    // The one transition the interlock still allows, and the one the kernel should schedule:
    // the door finishing its opening, which is the state the interlock wants it in.
    expect(car.nextDoorTransitionAt()).toBe(2);

    // A single late wake-up covering the whole stop.
    car.advanceDoorsTo(1000);

    expect(car.doorState).toBe('open');
    expect(car.nextDoorTransitionAt()).toBeUndefined();
    expect(car.canStart).toBe(false);
    expect(() => car.closeDoors(1000)).toThrow(/held open/);
  });

  it('reverses the doors when the load trips the alarm while they are closing', () => {
    const clock = clockAt(0);
    const car = makeCar({ homeFloorId: '5', clock });
    car.openDoors(0, { carCall: true, hallCall: false });
    car.advanceDoorsTo(2);
    car.advanceDoorsTo(5);
    expect(car.doorState).toBe('closing');

    // Someone heavy steps in a second into the close. The alarm puts the doors back from
    // wherever they had got to, at the instant the load crossed — not at the next wake-up,
    // which would make the replay depend on how often the caller happened to look.
    const alarm = car.board(passenger('heavy', '10', 1350 * 1.2), 6);

    expect(alarm?.state.state).toBe('opening');
    expect(alarm?.state.accounting.obstructions).toBe(1);
    expect(car.doorOpenFractionAt(6)).toBeCloseTo(2 / 3, 12);

    car.advanceDoorsTo(1000);

    expect(car.doorState).toBe('open');
    expect(car.isOverloaded).toBe(true);
    expect(car.doorsHeldByOverload).toBe(true);
  });

  it('never shuts the doors of an overloaded car, however the load arrived', () => {
    // The alarm in `board` covers the path a running simulation takes. This is the backstop:
    // the guarantee is about the load, not about which call produced it, so mass that appears
    // on the cell without a boarding must not be able to defeat the interlock either.
    const clock = clockAt(0);
    const car = makeCar({ homeFloorId: '5', clock });
    car.openDoors(0, { carCall: true, hallCall: false });
    car.advanceDoorsTo(2);
    car.advanceDoorsTo(5);
    expect(car.doorState).toBe('closing');

    car.loadSensor.add({ id: 'freight', massKg: 1350 * 1.2 });

    expect(car.doorsHeldByOverload).toBe(true);
    expect(car.nextDoorTransitionAt()).toBeUndefined();
    car.advanceDoorsTo(1000);
    // Held where it stood — and, above all, not `closed`.
    expect(car.doorState).toBe('closing');

    car.loadSensor.remove('freight');
    expect(car.nextDoorTransitionAt()).toBe(8);
    car.advanceDoorsTo(1000);
    expect(car.doorState).toBe('closed');
  });

  it('resumes once the load drops back under the threshold', () => {
    const clock = clockAt(0);
    const car = makeCar({ homeFloorId: '5', clock });
    car.openDoors(0, { carCall: true, hallCall: false });
    car.advanceDoorsTo(2);

    const heavy = passenger('heavy', '10', 1350 * 1.05);
    const last = passenger('last', '10', 1350 * 0.1);
    car.board(heavy, 2);
    car.board(last, 2);
    expect(car.nextDoorTransitionAt()).toBeUndefined();

    // Through the car, not by reaching past it into the load cell: `disembark` takes the
    // passenger off the list and off the sensor together.
    expect(car.disembark(last)).toBeCloseTo(135, 12);

    expect(car.isOverloaded).toBe(false);
    expect(car.passengers.map((p) => p.id)).toEqual(['heavy']);
    expect(car.loadSensor.occupants).toBe(1);
    expect(car.nextDoorTransitionAt()).toBe(2 + 3);
    expect(() => car.closeDoors(3)).not.toThrow();
  });

  // REGRESSION. An overloaded car used to have no way out at all: `closeDoors` and `departFor`
  // refuse while overloaded, and `alight` refuses to put somebody out anywhere but their
  // destination — so the car stood with its doors held open for the rest of the run. The only
  // escape was `car.loadSensor.remove(p)`, which takes the mass off the cell and leaves the
  // passenger on the car's list, so the sensor and `committedStops()` then disagreed about who
  // was aboard.
  it('can be brought back to a movable state through the public API alone', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    const first = passenger('a', '10', 800);
    const second = passenger('b', '10', 800);

    car.openDoors(0);
    car.board(first, 0);
    car.board(second, 0);
    expect(car.isOverloaded).toBe(true);

    clock.set(2);
    car.advanceDoorsTo(2);
    expect(car.doorState).toBe('open');
    // Every other way out is shut, by design.
    expect(() => car.closeDoors(2)).toThrow(/held open/);
    expect(() => car.departFor('10', 2)).toThrow(/doors open/);
    expect(() => car.alight(second, 2)).toThrow(/cannot alight at/);

    expect(car.disembark(second)).toBe(800);

    expect(car.isOverloaded).toBe(false);
    expect(car.loadKg).toBe(800);
    expect(car.passengers.map((p) => p.id)).toEqual(['a']);
    expect(car.loadSensor.occupants).toBe(1);
    expect(car.loadSensor.aboard().map((occupant) => occupant.id)).toEqual(['a']);
    // The route stops pricing an alighting that can no longer happen.
    expect(car.committedStops()[0]?.alightingCount).toBe(1);
    // And nothing is recorded against the passenger: they did not arrive anywhere.
    expect(second.hasAlighted).toBe(false);
    expect(second.timeToDestinationS).toBeUndefined();

    car.closeDoors(2);
    car.advanceDoorsTo(5);
    expect(car.doorState).toBe('closed');
    expect(car.canStart).toBe(true);
    expect(() => car.departFor('10', 5)).not.toThrow();
  });

  it('refuses to step out a passenger who is not aboard', () => {
    const car = makeCar();
    expect(() => car.disembark(passenger('stranger', '3', 70))).toThrow(/is not aboard/);
  });

  it('crosses into hall-call bypass without becoming unable to move', () => {
    const car = makeCar();
    car.board(passenger('bulk', '10', 1350 * 0.85), 0);

    expect(car.isBypassingHallCalls).toBe(true);
    expect(car.isOverloaded).toBe(false);
    expect(car.canStart).toBe(true);
    expect(() => car.departFor('10', 0)).not.toThrow();
  });

  it('refuses to board someone bound for a floor it cannot reach, or to put them out early', () => {
    const car = makeCar({ shaft: plainShaft(11) });
    expect(() => car.board(passenger('p1', '15', 80), 0)).toThrow(/does not serve/);

    const other = makeCar();
    const rider = passenger('p2', '7', 80);
    other.board(rider, 0);
    expect(() => other.alight(rider, 1)).toThrow(/cannot alight at/);
    expect(() => other.alight(passenger('stranger', '3', 70), 1)).toThrow(/not aboard/);
  });

  it('drops the load when a passenger alights at their floor', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    const rider = passenger('p1', '5', 90);
    car.board(rider, 0);

    const move = car.departFor('5', 0);
    clock.set(move.arrivesAt);
    car.completeArrival();
    car.openDoors();
    expect(car.alightingHere().map((p) => p.id)).toEqual(['p1']);

    car.alight(rider, move.arrivesAt + 2);
    expect(car.loadKg).toBe(0);
    expect(car.passengers).toEqual([]);
    expect(rider.rideTimeS).toBeCloseTo(move.arrivesAt + 2, 12);
  });
});

/* -------------------------------------------------------------------------- *
 * The stop the car prices is the stop it performs
 * -------------------------------------------------------------------------- */

/**
 * Drive one stop from `openDoors` to shut doors the way a kernel handler would, and report
 * how long it took.
 */
function serveStop(car: Car, clock: MutableClock, reason?: Parameters<Car['openDoors']>[1]): number {
  const startedAt = clock.now();
  car.openDoors(startedAt, reason);
  for (let guard = 0; guard < 8 && car.doorState !== 'closed'; guard += 1) {
    const next = car.nextDoorTransitionAt();
    if (next === undefined) break;
    clock.set(next);
    car.advanceDoorsTo(next);
  }
  return clock.now() - startedAt;
}

describe('priced versus performed stops', () => {
  // REGRESSION. `projectRoute` charges `(alighting + boarding) * passengerTransferS` at every
  // stop, but the reason `openDoors` derived from the car's own state declared no transfer at
  // all — so the car executed an 8.0 s stop it had priced at 14.6 s. That difference is
  // exactly the `2*P*tp` term of the Barney/CIBSE round-trip-time calculation CLAUDE.md names
  // as the correctness oracle, and it made every `etaSeconds` a systematic over-estimate of
  // the car's own behaviour.
  it('charges the transfer time it quoted when the car actually stops there', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    car.registerCarCall('5', 0);
    for (let i = 0; i < 8; i += 1) car.board(passenger(`q${i}`, '5', 70), 0);

    const priced = car.route()[0];
    expect(priced?.floorId).toBe('5');
    // open 2 + max(car-call dwell 3, 8 * 1.2 = 9.6) + close 3
    const quoted = (priced?.departureSeconds ?? 0) - (priced?.arrivalSeconds ?? 0);
    expect(quoted).toBeCloseTo(2 + 9.6 + 3, 12);

    const move = car.departFor('5', 0);
    clock.set(move.arrivesAt);
    car.completeArrival();

    const performed = serveStop(car, clock);

    expect(performed).toBeCloseTo(quoted, 9);
    expect(car.door.accounting.totalS).toBeCloseTo(quoted, 9);
  });

  it('counts the boarders it priced a hall-call stop with, on both sides of the doorway', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    car.assignHallCall(hallCall('5', 'up', 0));
    for (let i = 0; i < 8; i += 1) car.board(passenger(`q${i}`, '5', 70), 0);

    // Eight alighting plus the one boarder a bare up button implies: 9 * 1.2 = 10.8 s, which
    // beats the 5 s hall dwell and sets the length of the stop.
    const priced = car.route()[0];
    const quoted = (priced?.departureSeconds ?? 0) - (priced?.arrivalSeconds ?? 0);
    expect(quoted).toBeCloseTo(2 + 10.8 + 3, 12);

    const move = car.departFor('5', 0);
    clock.set(move.arrivesAt);
    car.completeArrival();

    expect(serveStop(car, clock)).toBeCloseTo(quoted, 9);
  });

  it('takes the larger of the transfer it derived and the one the caller declares', () => {
    const car = makeCar({ homeFloorId: '5' });
    for (let i = 0; i < 8; i += 1) car.board(passenger(`q${i}`, '5', 70), 0);

    // The dispatcher declares the two people it can see waiting; the eight aboard who have to
    // get off first are the car's own knowledge, and the stop is sized for whichever is worse.
    const step = car.openDoors(0, { carCall: false, hallCall: true, transferSeconds: 2 * 1.2 });
    expect(step.state.reason.transferSeconds).toBeCloseTo(9.6, 12);

    car.advanceDoorsTo(2);
    expect(car.door.grantedDwellS).toBeCloseTo(9.6, 12);

    // ...and a bigger real count does move it.
    const busier = makeCar({ homeFloorId: '5' });
    for (let i = 0; i < 8; i += 1) busier.board(passenger(`q${i}`, '5', 70), 0);
    busier.openDoors(0, { carCall: false, hallCall: true, transferSeconds: (8 + 6) * 1.2 });
    busier.advanceDoorsTo(2);
    expect(busier.door.grantedDwellS).toBeCloseTo(16.8, 12);
  });

  it('quotes and performs a bare repositioning stop identically too', () => {
    // Nobody aboard, no calls: the derived reason declares no transfer, and the stop is the
    // plain open + car-call dwell + close.
    const clock = clockAt(0);
    const car = makeCar({ homeFloorId: '5', clock });

    expect(serveStop(car, clock)).toBeCloseTo(2 + 3 + 3, 12);
  });
});

/* -------------------------------------------------------------------------- *
 * Calls
 * -------------------------------------------------------------------------- */

describe('calls', () => {
  it('treats a re-press of a lit car-call button as the same call', () => {
    const car = makeCar();
    const first = car.registerCarCall('5', 10);
    const second = car.registerCarCall('5', 90);

    expect(second).toBe(first);
    expect(second.registeredAt).toBe(10);
    expect(car.carCalls).toHaveLength(1);
  });

  it('has no button for a floor the shaft does not serve', () => {
    const car = makeCar({ shaft: plainShaft(11) });
    expect(() => car.registerCarCall('15', 0)).toThrow(/no button for floor/);
  });

  it('accepts an allocated hall call and can hand it back', () => {
    const car = makeCar();
    const call = hallCall('6', 'up', 3);
    car.assignHallCall(call);

    expect(car.assignedHallCalls).toEqual([call]);
    expect(car.releaseHallCall(call.id)).toBe(true);
    expect(car.releaseHallCall(call.id)).toBe(false);

    car.assignHallCall(call);
    car.assignHallCall(hallCall('9', 'down', 4));
    expect(car.releaseAllHallCalls()).toHaveLength(2);
    expect(car.assignedHallCalls).toEqual([]);
  });

  it('refuses a hall call it physically cannot serve — a safety interlock, not an opinion', () => {
    const car = makeCar({ shaft: plainShaft(11) });
    expect(() => car.assignHallCall(hallCall('15', 'up'))).toThrow(/does not serve that floor/);
  });

  it('folds car calls, hall calls and passenger destinations into one stop per floor', () => {
    const car = makeCar();
    car.registerCarCall('7', 5);
    car.assignHallCall(hallCall('7', 'up', 2));
    car.assignHallCall(hallCall('7', 'down', 8));
    car.board(passenger('p1', '7', 70), 0);
    car.board(passenger('p2', '7', 90), 0);

    const stops = car.committedStops();
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({
      floorId: '7',
      carCall: true,
      hallCall: true,
      hallCallDirections: ['up', 'down'],
      registeredAt: 0, // the earliest of the calls making it up
      alightingCount: 2,
      alightingMassKg: 160,
      boardingCount: 2, // two hall calls, one assumed boarder each
    });
  });
});

/* -------------------------------------------------------------------------- *
 * Service mode
 * -------------------------------------------------------------------------- */

describe('service mode', () => {
  it('hands hall calls back when the car leaves group control', () => {
    const car = makeCar();
    car.assignHallCall(hallCall('5', 'up', 0));
    car.assignHallCall(hallCall('9', 'down', 0));
    car.registerCarCall('12', 0);

    const released = car.setMode('independent');

    expect(released.map((call) => call.id)).toEqual(['5:up', '9:down']);
    expect(car.assignedHallCalls).toEqual([]);
    // Independent service still honours the buttons pressed inside the car.
    expect(car.carCalls).toHaveLength(1);
    expect(car.acceptsCarCalls).toBe(true);
    expect(car.acceptsHallCalls).toBe(false);
  });

  it('drops car calls as well on recall and out of service', () => {
    for (const mode of ['fire-recall', 'out-of-service'] as const) {
      const car = makeCar();
      car.assignHallCall(hallCall('5', 'up', 0));
      car.registerCarCall('12', 0);

      car.setMode(mode);

      expect(car.assignedHallCalls).toEqual([]);
      expect(car.carCalls).toEqual([]);
      expect(() => car.registerCarCall('12', 0)).toThrow(/does not honour car calls/);
      expect(() => car.assignHallCall(hallCall('5', 'up', 0))).toThrow(/cannot be allocated/);
    }
  });

  it('is a no-op when the mode does not change', () => {
    const car = makeCar();
    car.assignHallCall(hallCall('5', 'up', 0));
    expect(car.setMode('in-service')).toEqual([]);
    expect(car.assignedHallCalls).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- *
 * Serialization and reset
 * -------------------------------------------------------------------------- */

describe('serialize and reset', () => {
  it('records every piece of mutable state, JSON-safe, with no undefined', () => {
    const clock = clockAt(0);
    const car = makeCar({ clock });
    car.registerCarCall('7', 0);
    car.assignHallCall(hallCall('4', 'up', 1));
    car.board(passenger('p1', '7', 82.5), 0);
    const move = car.departFor('4', 0);

    const record = car.serialize();
    const round = JSON.parse(JSON.stringify(record)) as unknown;

    expect(round).toEqual(record);
    expect(record.motion?.arrivesAt).toBe(move.arrivesAt);
    expect(record.motion?.kind).toBe(move.profile.kind);
    expect(record.direction).toBe('up');
    expect(record.door.stopStartedAt).toBeNull();
    expect(record.carCalls.map((call) => call.floorId)).toEqual(['7']);
    expect(record.assignedHallCalls.map((call) => call.id)).toEqual(['4:up']);
    expect(record.passengers).toEqual([
      { id: 'p1', massKg: 82.5, destinationFloorId: '7', boardedAt: 0 },
    ]);
    expect(record.loadKg).toBe(82.5);
    expect(JSON.stringify(record)).not.toContain('undefined');
  });

  it('returns a reset car to exactly its freshly built record', () => {
    const clock = clockAt(0);
    const fresh = JSON.stringify(makeCar({ clock: clockAt(0) }).serialize());

    const car = makeCar({ clock });
    car.setMode('independent');
    car.registerCarCall('7', 0);
    car.board(passenger('p1', '7', 82.5), 0);
    const move = car.departFor('7', 0);
    clock.set(move.arrivesAt);
    car.completeArrival();
    car.openDoors();
    car.requestReopen('obstruction', move.arrivesAt + 0.5);

    car.reset();

    expect(JSON.stringify(car.serialize())).toBe(fresh);
    expect(car.distanceTravelledM).toBe(0);
    expect(car.departures).toBe(0);
    expect(car.stopsServed).toBe(0);
    expect(car.route()).toEqual([]);
  });

  it('snapshots a frozen value with no way back to the car', () => {
    const car = makeCar();
    car.registerCarCall('5', 0);
    const snapshot = car.snapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.stops)).toBe(true);
    expect(Object.isFrozen(snapshot.stops[0])).toBe(true);
    // Nothing on a snapshot is a function, so there is nothing to call back into.
    for (const value of Object.values(snapshot)) {
      expect(typeof value).not.toBe('function');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

describe('CAR_PARAMETERS', () => {
  it('includes the load sensor’s tunables and the car’s own, each fully specified', () => {
    const ids = CAR_PARAMETERS.map((parameter) => parameter.id);

    expect(ids).toContain('answer.bypassLoadThreshold');
    expect(ids).toContain('car.passengerTransferS');
    expect(ids).toContain('car.assumedBoardingPassengers');
    expect(new Set(ids).size).toBe(ids.length);

    for (const parameter of CAR_PARAMETERS) {
      const [min, max] = parameter.range ?? [Number.NaN, Number.NaN];
      expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
      expect(min).toBeLessThan(max);
      expect(parameter.default).toBeGreaterThanOrEqual(min);
      expect(parameter.default).toBeLessThanOrEqual(max);
      expect(parameter.description.length).toBeGreaterThan(20);
    }
  });

  it('does not redeclare a tunable that already has a home in config or the door schema', () => {
    const ids = new Set(CAR_PARAMETERS.map((parameter) => parameter.id));

    // `car.mode` and `car.doorType` are the two categoricals the rule covers, and they are here
    // because the rule is easiest to break with a categorical: neither has a `range`, so a row
    // for one would have slipped past the "fully specified" check above as well.
    for (const id of [
      'car.ratedSpeedMps',
      'car.acceleration',
      'car.jerk',
      'car.doorOpenS',
      'car.doorType',
      'car.mode',
    ]) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it('quotes the runtime defaults', () => {
    const byId = new Map(CAR_PARAMETERS.map((parameter) => [parameter.id, parameter]));

    expect(byId.get('car.passengerTransferS')?.default).toBe(CAR_DEFAULTS.passengerTransferS);
    expect(byId.get('car.assumedBoardingPassengers')?.default).toBe(
      CAR_DEFAULTS.assumedBoardingPassengers,
    );
    expect(CAR_DEFAULTS.passengerTransferS).toBe(
      REFERENCE_SPECS.timing.passengerTransferS.office,
    );
  });
});
