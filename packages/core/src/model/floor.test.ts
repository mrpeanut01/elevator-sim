import { describe, expect, it } from 'vitest';

import type { FloorConfig } from '../config/types.js';

import { Floor } from './floor.js';
import { Passenger, type PassengerInit } from './passenger.js';
import { ModelError } from './types.js';

const LOBBY: FloorConfig = { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true };

function floor(overrides: Partial<FloorConfig> = {}): Floor {
  return new Floor({ ...LOBBY, ...overrides });
}

let nextId = 0;

/** A passenger waiting at the lobby. `destinationFloorIndex` decides which queue they join. */
function waiter(overrides: Partial<PassengerInit> = {}): Passenger {
  nextId += 1;
  return new Passenger({
    id: `p${nextId}`,
    journeyId: `j${nextId}`,
    originFloorId: 'G',
    originFloorIndex: 0,
    destinationFloorId: '12',
    destinationFloorIndex: 12,
    massKg: 75,
    arrivedAt: 0,
    ...overrides,
  });
}

/** Somebody in the basement heading down — the lobby's `down` queue. */
function downwardWaiter(arrivedAt = 0): Passenger {
  return waiter({
    originFloorIndex: 0,
    destinationFloorId: 'P1',
    destinationFloorIndex: -1,
    arrivedAt,
  });
}

describe('Floor construction', () => {
  it('carries the floor description across from config', () => {
    const runtime = floor({
      id: '31',
      index: 31,
      heightM: 126,
      population: 260,
      isEntrance: false,
      isTransferFloor: true,
      label: 'Sky lobby',
      trafficProfile: 'residential',
    });

    expect(runtime.id).toBe('31');
    expect(runtime.index).toBe(31);
    expect(runtime.heightM).toBe(126);
    expect(runtime.population).toBe(260);
    expect(runtime.isEntrance).toBe(false);
    expect(runtime.isTransferFloor).toBe(true);
    expect(runtime.label).toBe('Sky lobby');
    expect(runtime.trafficProfile).toBe('residential');
  });

  it('treats absent flags as false, never as inherited', () => {
    // A ground lobby is not implicitly transfer-capable: the flag is declared per building.
    const plain = new Floor({ id: '5', index: 5, heightM: 20, population: 44 });
    expect(plain.isEntrance).toBe(false);
    expect(plain.isTransferFloor).toBe(false);
    expect(plain.label).toBeUndefined();
    expect(plain.trafficProfile).toBeUndefined();
  });

  it('starts empty and dark', () => {
    const runtime = floor();
    expect(runtime.queueLength()).toBe(0);
    expect(runtime.hasWaiting()).toBe(false);
    expect(runtime.activeHallCalls()).toEqual([]);
    expect(runtime.longestWaitS(500)).toBe(0);
  });
});

describe('waiting queues', () => {
  it('queues by the direction the passenger is actually travelling', () => {
    const runtime = floor();
    const up = waiter();
    const down = downwardWaiter();
    runtime.addWaiting(up);
    runtime.addWaiting(down);

    expect(runtime.waiting('up')).toEqual([up]);
    expect(runtime.waiting('down')).toEqual([down]);
    expect(runtime.queueLength('up')).toBe(1);
    expect(runtime.queueLength()).toBe(2);
    expect(runtime.waiting()).toEqual([up, down]);
  });

  it('rejects a passenger who is waiting somewhere else', () => {
    const runtime = floor();
    const elsewhere = waiter({ originFloorId: '5', originFloorIndex: 5 });
    expect(() => runtime.addWaiting(elsewhere)).toThrow(ModelError);
  });

  it('rejects double-queueing and passengers already aboard', () => {
    const runtime = floor();
    const passenger = waiter();
    runtime.addWaiting(passenger);
    expect(() => runtime.addWaiting(passenger)).toThrow(/already queued/);

    const boarded = waiter();
    boarded.board(1);
    expect(() => runtime.addWaiting(boarded)).toThrow(/already boarded/);
  });

  it('boards in arrival order, up to the space the car has', () => {
    const runtime = floor();
    const queue = [waiter(), waiter(), waiter(), waiter()];
    for (const passenger of queue) runtime.addWaiting(passenger);

    const boarding = runtime.takeWaiting('up', 2);
    expect(boarding).toEqual([queue[0], queue[1]]);
    expect(runtime.waiting('up')).toEqual([queue[2], queue[3]]);

    expect(runtime.takeWaiting('up')).toEqual([queue[2], queue[3]]);
    expect(runtime.queueLength('up')).toBe(0);
  });

  it('takes nobody from an empty queue and nobody when there is no room', () => {
    const runtime = floor();
    runtime.addWaiting(waiter());
    expect(runtime.takeWaiting('down')).toEqual([]);
    expect(runtime.takeWaiting('up', 0)).toEqual([]);
    expect(runtime.queueLength('up')).toBe(1);
    expect(() => runtime.takeWaiting('up', -1)).toThrow(ModelError);
  });

  it('leaves the hall call lit when a full car takes only part of the queue', () => {
    // The landing does not extinguish buttons. A car that fills up leaves people behind, and
    // deciding when a call has been answered is the answering stage's job, not the floor's.
    const runtime = floor();
    runtime.addWaiting(waiter());
    runtime.addWaiting(waiter());
    runtime.registerHallCall('up', 0);

    runtime.takeWaiting('up', 1);
    expect(runtime.hasHallCall('up')).toBe(true);
    expect(runtime.queueLength('up')).toBe(1);
  });

  it('removes a specific passenger who leaves the queue', () => {
    const runtime = floor();
    const a = waiter();
    const b = waiter();
    runtime.addWaiting(a);
    runtime.addWaiting(b);

    expect(runtime.removeWaiting(a)).toBe(true);
    expect(runtime.waiting('up')).toEqual([b]);
    expect(runtime.removeWaiting(a)).toBe(false);
  });

  it('hands out copies, so boarding cannot mutate a caller mid-iteration', () => {
    const runtime = floor();
    runtime.addWaiting(waiter());
    const snapshot = runtime.waiting('up');
    runtime.takeWaiting('up');
    expect(snapshot).toHaveLength(1);
    expect(runtime.queueLength('up')).toBe(0);
  });

  it('reports the longest wait, which is the head of the queue', () => {
    const runtime = floor();
    runtime.addWaiting(waiter({ arrivedAt: 10 }));
    runtime.addWaiting(waiter({ arrivedAt: 40 }));
    runtime.addWaiting(downwardWaiter(25));

    expect(runtime.longestWaitS(100, 'up')).toBe(90);
    expect(runtime.longestWaitS(100, 'down')).toBe(75);
    expect(runtime.longestWaitS(100)).toBe(90);

    runtime.takeWaiting('up', 1);
    expect(runtime.longestWaitS(100, 'up')).toBe(60);
  });
});

describe('boarding eligibility', () => {
  /** A lobby waiter bound for a named floor; `destinationFloorId` is what a filter reads. */
  function boundFor(destinationFloorId: string, destinationFloorIndex: number, arrivedAt = 0): Passenger {
    return waiter({ destinationFloorId, destinationFloorIndex, arrivedAt });
  }

  it('boards only the passengers a car can serve, and leaves the rest queued', () => {
    // Regression: on a floor served by two banks the head of the queue may be bound for a
    // floor this car's shaft does not reach. Taking it would both put the passenger in a car
    // that can never deliver them and delete them from the landing, so the hall call could
    // not recover them.
    const runtime = floor();
    const skyLobby = boundFor('31', 31, 0);
    const office = boundFor('20', 20, 1);
    const alsoSkyLobby = boundFor('31', 31, 2);
    const alsoOffice = boundFor('14', 14, 3);
    for (const passenger of [skyLobby, office, alsoSkyLobby, alsoOffice]) runtime.addWaiting(passenger);

    const served = new Set(['14', '20']);
    const boarding = runtime.takeWaiting('up', Number.POSITIVE_INFINITY, (p) =>
      served.has(p.destinationFloorId),
    );

    expect(boarding).toEqual([office, alsoOffice]);
    for (const passenger of boarding) expect(served.has(passenger.destinationFloorId)).toBe(true);
    // The two the car cannot serve are still on the landing, in the order they arrived.
    expect(runtime.waiting('up')).toEqual([skyLobby, alsoSkyLobby]);
  });

  it('counts only accepted passengers against the limit', () => {
    const runtime = floor();
    const ineligible = boundFor('31', 31, 0);
    const first = boundFor('20', 20, 1);
    const second = boundFor('14', 14, 2);
    for (const passenger of [ineligible, first, second]) runtime.addWaiting(passenger);

    // One space left. The passenger it cannot serve must not consume it.
    const boarding = runtime.takeWaiting('up', 1, (p) => p.destinationFloorId !== '31');

    expect(boarding).toEqual([first]);
    expect(runtime.waiting('up')).toEqual([ineligible, second]);
  });

  it('leaves the landing exactly as it found it when it can serve nobody', () => {
    const runtime = floor();
    const a = boundFor('31', 31, 0);
    const b = boundFor('31', 31, 1);
    runtime.addWaiting(a);
    runtime.addWaiting(b);
    runtime.registerHallCall('up', 0);

    expect(runtime.takeWaiting('up', 8, () => false)).toEqual([]);
    expect(runtime.waiting('up')).toEqual([a, b]);
    // And the button stays lit, so the bank that *can* serve them still sees the call.
    expect(runtime.hasHallCall('up')).toBe(true);
  });

  it('keeps the oldest remaining passenger at the head, so starvation is still measurable', () => {
    const runtime = floor();
    const oldIneligible = boundFor('31', 31, 10);
    const youngEligible = boundFor('20', 20, 40);
    runtime.addWaiting(oldIneligible);
    runtime.addWaiting(youngEligible);

    runtime.takeWaiting('up', 8, (p) => p.destinationFloorId === '20');

    expect(runtime.waiting('up')).toEqual([oldIneligible]);
    expect(runtime.longestWaitS(100, 'up')).toBe(90);
  });

  it('does not consult the filter when the car has no room', () => {
    const runtime = floor();
    runtime.addWaiting(waiter());
    let consulted = 0;
    const boarding = runtime.takeWaiting('up', 0, () => {
      consulted += 1;
      return true;
    });

    expect(boarding).toEqual([]);
    expect(consulted).toBe(0);
    expect(runtime.queueLength('up')).toBe(1);
  });

  it('still rejects a negative limit when a filter is supplied', () => {
    const runtime = floor();
    runtime.addWaiting(waiter());
    expect(() => runtime.takeWaiting('up', -1, () => true)).toThrow(ModelError);
  });
});

describe('hall calls', () => {
  it('lights one call per direction', () => {
    const runtime = floor();
    const up = runtime.registerHallCall('up', 12);

    expect(up.id).toBe('G:up');
    expect(up.floorId).toBe('G');
    expect(up.floorIndex).toBe(0);
    expect(up.direction).toBe('up');
    expect(up.registeredAt).toBe(12);
    expect(runtime.hallCall('up')).toBe(up);
    expect(runtime.hallCall('down')).toBeUndefined();
  });

  it('does not restart the wait clock when the button is pressed again', () => {
    // The tenth person to press a button lit 90 seconds ago has not reset anybody's wait.
    // Refreshing `registeredAt` here would erase exactly the starvation a dispatcher is
    // supposed to be penalized for.
    const runtime = floor();
    const first = runtime.registerHallCall('up', 10);
    const second = runtime.registerHallCall('up', 100);

    expect(second).toBe(first);
    expect(second.registeredAt).toBe(10);
  });

  it('is immutable once registered', () => {
    const runtime = floor();
    const call = runtime.registerHallCall('up', 5);
    expect(Object.isFrozen(call)).toBe(true);
  });

  it('clears on demand, idempotently', () => {
    const runtime = floor();
    runtime.registerHallCall('down', 5);
    expect(runtime.clearHallCall('down')).toBe(true);
    expect(runtime.clearHallCall('down')).toBe(false);
    expect(runtime.hasHallCall('down')).toBe(false);
  });

  it('lists live calls up-first, whatever order they were registered in', () => {
    const runtime = floor();
    runtime.registerHallCall('down', 5);
    runtime.registerHallCall('up', 9);
    expect(runtime.activeHallCalls().map((call) => call.direction)).toEqual(['up', 'down']);
  });

  it('rejects a non-finite registration time', () => {
    const runtime = floor();
    expect(() => runtime.registerHallCall('up', Number.NaN)).toThrow(ModelError);
  });
});

describe('reset', () => {
  it('drops runtime state and keeps the floor description', () => {
    const runtime = floor({ isTransferFloor: true });
    runtime.addWaiting(waiter());
    runtime.addWaiting(downwardWaiter());
    runtime.registerHallCall('up', 1);
    runtime.registerHallCall('down', 2);

    runtime.reset();

    expect(runtime.queueLength()).toBe(0);
    expect(runtime.activeHallCalls()).toEqual([]);
    expect(runtime.id).toBe('G');
    expect(runtime.isTransferFloor).toBe(true);
  });
});
