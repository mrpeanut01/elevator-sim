/**
 * Capacity-driven reassignment: the load sensor, the edge it produces, and the four gates that
 * decide what stage 5 does with it.
 *
 * The scenario every test here is a variation of is the one docs/06 § Stage 5 describes and
 * docs/01 § *Why not pure agent-per-elevator* calls the second reason a pure agent model fails: a
 * car holding two hall calls crosses its bypass threshold, and **one of them may move and the
 * other may not**. Which is which is not a judgement this module makes — it is `commitmentPoint`,
 * and the point of the test is that the trigger asks rather than decides.
 */

import { describe, expect, it } from 'vitest';

import type { CarSnapshot } from '../../model/car/types.js';
import { createDispatchPolicy, type WeightedCostDispatchPolicy } from '../policy.js';
import type { CommitmentPoint, ReassignmentPolicy } from '../../config/types.js';
import type { DispatcherProfileSource } from '../types.js';

import {
  CapacityReassignmentMonitor,
  consideredCalls,
  heldBy,
  loadCrossings,
  hasMigrations,
  peakReassignments,
} from './capacity.js';
import { board, call, hallCall, makeCar, profile, snapshotAt } from './fixtures.test-helper.js';
import type { CapacityReassignmentResult } from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

/** Passengers that take a 1,350 kg car to a load factor of 0.833 — over its own 0.8 threshold. */
const OVER_THRESHOLD = 15;

interface Stage5 {
  readonly reassignmentPolicy?: ReassignmentPolicy | undefined;
  readonly commitmentPoint?: CommitmentPoint | undefined;
  readonly reassignmentHysteresisS?: number | undefined;
  readonly maxReassignmentsPerCall?: number | undefined;
}

function migratingProfile(stage: Stage5 = {}): DispatcherProfileSource {
  return profile(
    { waitTime: 1 },
    {
      dispatch: {
        reassignmentPolicy: 'until-commitment',
        commitmentPoint: 'on-deceleration',
        reassignmentHysteresisS: 5,
        maxReassignmentsPerCall: 3,
        ...stage,
      },
    },
  );
}

/**
 * A car standing at floor 5 holding the hall calls at 5 and 9, and a spare car at floor 20.
 *
 * The near car is standing **at** floor 5, so under `commitmentPoint: on-deceleration` it is
 * committed to that call — a car at the floor is past deceleration — and uncommitted to the call
 * at 9, which it has not started moving towards. One car, one instant, two different answers: that
 * asymmetry is what the whole mechanism turns on.
 */
function bankHoldingTwoCalls(stage: Stage5 = {}): {
  readonly policy: WeightedCostDispatchPolicy;
  readonly snapshots: () => readonly CarSnapshot[];
  readonly fillNearCar: () => void;
} {
  const near = makeCar('A', '5');
  const far = makeCar('B', '20');
  const policy = createDispatchPolicy(migratingProfile(stage));

  for (const floorId of ['5', '9']) {
    const subject = call(floorId, 'up');
    policy.register(subject, 0, { waitingPassengers: 2 });
    const decision = policy.dispatch(subject.id, [near.snapshot(0), far.snapshot(0)], 0, {
      waitingPassengers: 2,
    });
    expect(decision.primaryCarId, `call ${floorId} should start on the near car`).toBe('A');
    near.assignHallCall(hallCall(floorId, 'up'));
  }

  return {
    policy,
    snapshots: (): readonly CarSnapshot[] => [near.snapshot(1), far.snapshot(1)],
    fillNearCar: (): void => {
      board(near, OVER_THRESHOLD, '19');
    },
  };
}

function callIdsOf(migrations: CapacityReassignmentResult['migrated']): readonly string[] {
  return migrations.map((migration) => migration.callId);
}

/* -------------------------------------------------------------------------- *
 * The edge
 * -------------------------------------------------------------------------- */

describe('the trigger is a rising edge on the load cell, not a state', () => {
  it('reports a car that has just started bypassing hall calls', () => {
    const car = makeCar('A', '5');
    board(car, OVER_THRESHOLD, '19');
    const snapshot = car.snapshot(0);
    expect(snapshot.load.isBypassingHallCalls).toBe(true);

    const crossings = loadCrossings(new Map(), [snapshot], 7);
    expect(crossings.length).toBe(1);
    expect(crossings[0]?.carId).toBe('A');
    expect(crossings[0]?.at).toBe(7);
    expect(crossings[0]?.loadFactor).toBeGreaterThanOrEqual(0.8);
    // The threshold is read off the load cell, never re-declared here.
    expect(crossings[0]?.bypassLoadThreshold).toBe(snapshot.load.bypassLoadThreshold);
  });

  it('says nothing about a car that was already full', () => {
    const car = makeCar('A', '5');
    board(car, OVER_THRESHOLD, '19');
    expect(loadCrossings(new Map([['A', true]]), [car.snapshot(0)], 0)).toEqual([]);
  });

  it('says nothing about a car under its threshold', () => {
    const car = makeCar('A', '5');
    board(car, 10, '19');
    expect(car.snapshot(0).load.isBypassingHallCalls).toBe(false);
    expect(loadCrossings(new Map(), [car.snapshot(0)], 0)).toEqual([]);
  });

  it('fires once per crossing, and again after the car unloads and refills', () => {
    const empty = (at: number): CarSnapshot => makeCar('A', '5').snapshot(at);
    const full = (at: number): CarSnapshot => {
      const car = makeCar('A', '5');
      board(car, OVER_THRESHOLD, '19');
      return car.snapshot(at);
    };
    const monitor = new CapacityReassignmentMonitor();

    expect(monitor.observe([empty(0)], 0)).toEqual([]);
    expect(monitor.observe([full(1)], 1).length).toBe(1);
    // Still full: already reconsidered, so re-running stage 5 would only spend the
    // maxReassignmentsPerCall budget on decisions that cannot change.
    expect(monitor.observe([full(2)], 2)).toEqual([]);
    expect(monitor.isBypassing('A')).toBe(true);

    // Unloaded at a stop. A falling edge is not a crossing, but it re-arms the comparator.
    expect(monitor.observe([empty(3)], 3)).toEqual([]);
    expect(monitor.isBypassing('A')).toBe(false);

    // Filling again is a genuine second crossing, not a repeat of the first.
    expect(monitor.observe([full(4)], 4).length).toBe(1);
  });

  it('forgets everything on reset, so a replication does not inherit a comparator', () => {
    const car = makeCar('A', '5');
    board(car, OVER_THRESHOLD, '19');
    const monitor = new CapacityReassignmentMonitor();
    expect(monitor.observe([car.snapshot(0)], 0).length).toBe(1);
    monitor.reset();
    expect(monitor.isBypassing('A')).toBe(false);
    expect(monitor.observe([car.snapshot(0)], 0).length).toBe(1);
  });
});

/* -------------------------------------------------------------------------- *
 * The sweep
 * -------------------------------------------------------------------------- */

describe('when a car crosses its bypass threshold', () => {
  it('migrates its uncommitted calls and keeps its committed ones', () => {
    const bank = bankHoldingTwoCalls();
    bank.fillNearCar();

    const monitor = new CapacityReassignmentMonitor();
    const result = monitor.run(bank.policy, bank.snapshots(), 1);

    expect(result.crossings.map((crossing) => crossing.carId)).toEqual(['A']);
    expect(hasMigrations(result)).toBe(true);

    // The uncommitted call left.
    expect(callIdsOf(result.migrated)).toEqual([call('9', 'up').id]);
    expect(result.migrated[0]?.fromCarId).toBe('A');
    expect(result.migrated[0]?.toCarIds).toEqual(['B']);
    expect(result.migrated[0]?.outcome).toBe('reassigned');
    expect(result.migrated[0]?.reassignments).toBe(1);

    // The committed one did not. The car is standing at that floor and is about to open.
    expect(result.held.length).toBe(1);
    expect(result.held[0]?.callId).toBe(call('5', 'up').id);
    expect(result.held[0]?.outcome).toBe('retained');
    expect(result.held[0]?.reason).toBe('committed');
    expect(result.held[0]?.toCarIds).toEqual(['A']);
    expect(heldBy(result, 'committed').length).toBe(1);

    // Both calls were looked at, in registration order.
    expect(consideredCalls(result)).toEqual([call('5', 'up').id, call('9', 'up').id]);

    // And the policy agrees, which is the assertion that the trigger changed the lifecycle rather
    // than only reporting on it.
    expect(bank.policy.lifecycle(call('9', 'up').id)?.carIds).toEqual(['B']);
    expect(bank.policy.lifecycle(call('5', 'up').id)?.carIds).toEqual(['A']);
  });

  it('moves the call even though the improvement is far below the hysteresis', () => {
    // 30 s of hysteresis, and the call still moves. That is correct rather than a bypassed guard:
    // the incumbent is no longer *eligible* at all, so it has nothing to defend, and holding a
    // call on a car that will not answer it is how a floor starves.
    const bank = bankHoldingTwoCalls({ reassignmentHysteresisS: 30 });
    bank.fillNearCar();

    const result = new CapacityReassignmentMonitor().run(bank.policy, bank.snapshots(), 1);
    expect(callIdsOf(result.migrated)).toEqual([call('9', 'up').id]);
    expect(heldBy(result, 'below-hysteresis')).toEqual([]);
  });

  it('respects maxReassignmentsPerCall as the starvation guard', () => {
    const bank = bankHoldingTwoCalls({ maxReassignmentsPerCall: 0 });
    bank.fillNearCar();

    const result = new CapacityReassignmentMonitor().run(bank.policy, bank.snapshots(), 1);

    expect(result.migrated).toEqual([]);
    // Both calls, including the one that was otherwise free to move: the budget is checked before
    // the commitment latch, so a call with nothing left in it does not even get re-priced.
    expect(heldBy(result, 'max-reassignments').length).toBe(2);
    expect(peakReassignments(result)).toBe(0);
    expect(bank.policy.lifecycle(call('9', 'up').id)?.carIds).toEqual(['A']);
  });

  it('never lets a call exceed its reassignment budget however many cars fill up', () => {
    // Three cars filling in sequence is exactly the situation the guard exists for: without it a
    // call is handed on indefinitely and is never actually served.
    const MAX = 1;
    // All three below the call floor, so none of them is standing at it and none is committed.
    // Commitment would stop the migration for a reason that is not the budget, and the budget is
    // what this test is about.
    const cars = [makeCar('A', '2'), makeCar('B', '3'), makeCar('C', '4')];
    const policy = createDispatchPolicy(migratingProfile({ maxReassignmentsPerCall: MAX }));
    const subject = call('9', 'up');
    policy.register(subject, 0, { waitingPassengers: 2 });
    policy.dispatch(
      subject.id,
      cars.map((car) => car.snapshot(0)),
      0,
      { waitingPassengers: 2 },
    );

    const monitor = new CapacityReassignmentMonitor();
    const holders: string[] = [];
    let peak = 0;
    for (let step = 0; step < cars.length; step += 1) {
      const holderId = policy.lifecycle(subject.id)?.carIds[0];
      const holder = cars.find((candidate) => candidate.id === holderId);
      if (holder === undefined) break;
      holders.push(holder.id);
      holder.assignHallCall(hallCall('9', 'up'));
      board(holder, OVER_THRESHOLD, '19');

      const at = step + 1;
      peak = Math.max(
        peak,
        peakReassignments(
          monitor.run(
            policy,
            cars.map((candidate) => candidate.snapshot(at)),
            at,
          ),
        ),
      );
    }

    // It moved once and then stopped, however many more cars filled up behind it.
    expect(holders.length).toBeGreaterThan(1);
    expect(peak).toBe(MAX);
    expect(policy.lifecycle(subject.id)?.reassignments).toBe(MAX);
  });

  it('does nothing at all under reassignmentPolicy: never', () => {
    // The control arm. A profile that says an allocation is final does not get capacity migration,
    // and the value of the mechanism is measured against exactly this.
    const bank = bankHoldingTwoCalls({ reassignmentPolicy: 'never' });
    bank.fillNearCar();

    const result = new CapacityReassignmentMonitor().run(bank.policy, bank.snapshots(), 1);
    expect(result.crossings.length).toBe(1);
    expect(result.migrated).toEqual([]);
    expect(heldBy(result, 'reassignment-disabled').length).toBe(2);
  });

  it('holds a call nobody else can take rather than leaving it unassigned', () => {
    const near = makeCar('A', '5');
    const policy = createDispatchPolicy(migratingProfile());
    const subject = call('9', 'up');
    policy.register(subject, 0, { waitingPassengers: 2 });
    policy.dispatch(subject.id, [near.snapshot(0)], 0, { waitingPassengers: 2 });
    near.assignHallCall(hallCall('9', 'up'));
    board(near, OVER_THRESHOLD, '19');

    const result = new CapacityReassignmentMonitor().run(policy, [near.snapshot(1)], 1);
    expect(result.migrated).toEqual([]);
    expect(heldBy(result, 'no-eligible-car').length).toBe(1);
    expect(policy.lifecycle(subject.id)?.carIds).toEqual(['A']);
  });

  it('runs no stage 5 at all when nothing crossed', () => {
    const bank = bankHoldingTwoCalls();
    const result = new CapacityReassignmentMonitor().run(bank.policy, bank.snapshots(), 1);

    expect(result.crossings).toEqual([]);
    expect(result.migrated).toEqual([]);
    expect(result.held).toEqual([]);
    // The assertion that matters: not one call was re-priced. A trigger that re-ran stage 5 on
    // every pass would be a reassignment policy, not a trigger.
    expect(result.decisions).toEqual([]);
  });

  it('leaves calls on cars that did not cross alone', () => {
    const bank = bankHoldingTwoCalls();
    // Fill the *far* car, which holds nothing.
    const spare = makeCar('B', '20');
    board(spare, OVER_THRESHOLD, '19');
    const snapshots = [bank.snapshots()[0] as CarSnapshot, spare.snapshot(1)];

    const result = new CapacityReassignmentMonitor().run(bank.policy, snapshots, 1);
    expect(result.crossings.map((crossing) => crossing.carId)).toEqual(['B']);
    expect(result.decisions).toEqual([]);
  });

  it('passes the caller’s landing count through to the re-pricing', () => {
    const seen: number[] = [];
    const bank = bankHoldingTwoCalls();
    bank.fillNearCar();

    const result = new CapacityReassignmentMonitor().run(
      bank.policy,
      bank.snapshots(),
      1,
      (lifecycle) => {
        seen.push(lifecycle.waitingPassengers);
        return { waitingPassengers: 8 };
      },
    );

    // Every call the sweep looked at was offered the caller's own count...
    expect(seen).toEqual([2, 2]);
    // ...and the migration was priced and recorded against it, not against the two the original
    // assignment was made for. A landing that has grown since is a landing the new car must be
    // priced for.
    expect(result.migrated[0]?.toCarIds).toEqual(['B']);
    expect(
      result.decisions.find((decision) => decision.callId === call('9', 'up').id)
        ?.boardingPassengersPerCar,
    ).toBe(8);
  });
});

/* -------------------------------------------------------------------------- *
 * Determinism
 * -------------------------------------------------------------------------- */

describe('a capacity sweep is a deterministic function of its inputs', () => {
  it('is identical over a hundred runs', () => {
    let expected: string | undefined;
    for (let run = 0; run < 100; run += 1) {
      const bank = bankHoldingTwoCalls();
      bank.fillNearCar();
      const result = new CapacityReassignmentMonitor().run(bank.policy, bank.snapshots(), 1);
      const fingerprint = JSON.stringify({
        crossings: result.crossings,
        migrated: result.migrated,
        held: result.held,
      });
      expected ??= fingerprint;
      expect(fingerprint).toBe(expected);
    }
  });

  it('reports crossings in the order the cars were supplied', () => {
    const cars = ['A', 'B', 'C'].map((id, index) => {
      const car = makeCar(id, String(index * 4));
      board(car, OVER_THRESHOLD, '19');
      return car.snapshot(0);
    });
    expect(loadCrossings(new Map(), cars, 0).map((crossing) => crossing.carId)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(loadCrossings(new Map(), [...cars].reverse(), 0).map((c) => c.carId)).toEqual([
      'C',
      'B',
      'A',
    ]);
  });

  it('leaves an empty bank alone', () => {
    const policy = createDispatchPolicy(migratingProfile());
    const result = new CapacityReassignmentMonitor().run(policy, [snapshotAt('A', '0')], 0);
    expect(result.at).toBe(0);
    expect(result.crossings).toEqual([]);
    expect(peakReassignments(result)).toBe(0);
    expect(hasMigrations(result)).toBe(false);
  });
});
