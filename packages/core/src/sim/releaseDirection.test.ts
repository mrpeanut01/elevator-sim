/**
 * **A released hall call re-points the car that held it, and that is what moves a run** —
 * `DECISIONS.md` § D1603, carrying out the owner's decision panel's ruling R2 (§ D1600) on the gap
 * § D1591 clause 3 held.
 *
 * Two shipped runs, each run with the fixed release and again with the old one put back
 * (`model/car/keptDirection.test-helper.ts` holds the car's direction through `releaseHallCall` and
 * `releaseAllHallCalls`), compared on the legs, the shape CLAUDE.md asks of a control:
 *
 * - **Crown Hotel under `collective`, seed 2, 900 s.** Under the old release one completion leaves a
 *   car standing still with its direction pointing at nothing, and `noDirectionReversal` then
 *   refuses that car for five calls, thirteen times. With the fix the refusals are gone and 21 legs
 *   arrive sooner, none later.
 * - **Garden Apartments under `collective`, seed 1, 900 s.** Seven releases and none of them leaves
 *   a standing car pointing past its work, so the two runs are byte-identical.
 *
 * The same comparison over 147 shipped runs, and over the Phase 6 gate cell, is
 * `experiments/src/fuzz/releaseDirection.test.ts`, behind the deep fuzz tier's switch. This is the
 * part of it that runs on every `vitest run`, at about a second.
 */

import { describe, expect, it } from 'vitest';

import { WeightedCostDispatchPolicy } from '../dispatch/policy.js';
import type { DispatchDecision } from '../dispatch/types.js';
import { Car } from '../model/car/car.js';
import { withOldHandBack } from '../model/car/keptDirection.test-helper.js';
import type { CarSnapshot } from '../model/car/types.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

async function shippedRun(buildingId: string, seed: number): Promise<SimulationConfig> {
  const config = await load();
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get('collective');
  if (building === undefined || dispatcherProfile === undefined) throw new Error(`${buildingId}/collective is not shipped`);
  return {
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
    seed,
    durationS: 900,
    onTimeout: 'report',
  };
}

/** What a run's hand-backs did to the cars that made them, and what the dispatcher refused. */
interface Observed {
  readonly result: SimulationResult;
  /** Releases that left a standing car with a direction and no committed stop ahead in it. */
  readonly staleReleases: number;
  /** The same, with no committed stop at all. */
  readonly atNothing: number;
  /** Refusals under `noDirectionReversal` of a standing car in that state. */
  readonly staleRefusals: number;
  /** The calls those refusals were for. */
  readonly refusedCalls: number;
}

/** A standing car's direction points at no committed stop ahead: `'nothing'` when it has none. */
function staleness(car: {
  readonly motion: unknown;
  readonly direction: 'up' | 'down' | undefined;
  readonly floorIndex: number;
  readonly stops: readonly { readonly floorIndex: number }[];
}): 'past' | 'nothing' | undefined {
  if (car.motion !== undefined || car.direction === undefined) return undefined;
  const sign = car.direction === 'up' ? 1 : -1;
  if (car.stops.some((stop) => sign * (stop.floorIndex - car.floorIndex) > 0)) return undefined;
  return car.stops.length === 0 ? 'nothing' : 'past';
}

/**
 * Run `config`, counting from outside: every release that leaves a standing car pointing past its
 * work, and every `noDirectionReversal` refusal of a car in that state. The probe wraps the
 * prototype methods and restores them; it changes no decision.
 */
function observe(config: SimulationConfig, old: boolean): Observed {
  let staleReleases = 0;
  let atNothing = 0;
  let staleRefusals = 0;
  const refused = new Set<string>();

  const cars = Car.prototype;
  const policy = WeightedCostDispatchPolicy.prototype;
  const release = cars.releaseHallCall;
  const releaseAll = cars.releaseAllHallCalls;
  const dispatch = policy.dispatch;

  const read = (car: Car, released: boolean): void => {
    if (!released) return;
    const state = staleness({ motion: car.motion, direction: car.direction, floorIndex: car.floorIndex, stops: car.committedStops() });
    if (state === undefined) return;
    staleReleases += 1;
    if (state === 'nothing') atNothing += 1;
  };
  const run = (): SimulationResult => {
    const currentRelease = cars.releaseHallCall;
    const currentReleaseAll = cars.releaseAllHallCalls;
    cars.releaseHallCall = function (this: Car, callId: string): boolean {
      const out = currentRelease.call(this, callId);
      read(this, out);
      return out;
    };
    cars.releaseAllHallCalls = function (this: Car): ReturnType<Car['releaseAllHallCalls']> {
      const out = currentReleaseAll.call(this);
      read(this, out.length > 0);
      return out;
    };
    try {
      return runSimulation(config);
    } finally {
      cars.releaseHallCall = currentRelease;
      cars.releaseAllHallCalls = currentReleaseAll;
    }
  };

  policy.dispatch = function (this: WeightedCostDispatchPolicy, ...args: Parameters<WeightedCostDispatchPolicy['dispatch']>): DispatchDecision {
    const decision = dispatch.apply(this, args);
    const snapshots: readonly CarSnapshot[] = args[1];
    for (const verdict of decision.rejected) {
      if (verdict.constraintId !== 'noDirectionReversal') continue;
      const snapshot = snapshots.find((car) => car.carId === verdict.carId);
      if (snapshot === undefined || staleness(snapshot) === undefined) continue;
      staleRefusals += 1;
      refused.add(decision.callId);
    }
    return decision;
  };
  try {
    const result = old ? withOldHandBack(cars, ['releaseHallCall', 'releaseAllHallCalls'], run) : run();
    return { result, staleReleases, atNothing, staleRefusals, refusedCalls: refused.size };
  } finally {
    cars.releaseHallCall = release;
    cars.releaseAllHallCalls = releaseAll;
    policy.dispatch = dispatch;
  }
}

/** Door-to-door time of every delivered leg, keyed by passenger and leg. */
function legTimes(result: SimulationResult): ReadonlyMap<string, number> {
  const times = new Map<string, number>();
  for (const leg of result.record.passengers) {
    if (leg.alightedAt !== undefined) times.set(`${leg.passengerId}#${String(leg.legIndex)}`, leg.alightedAt - leg.arrivedAt);
  }
  return times;
}

describe('a released hall call re-points the car that held it (§ D1603)', () => {
  it('changes the run where a release left a car pointing at nothing, and only by delivering riders sooner', async () => {
    const config = await shippedRun('crown-hotel', 2);
    const before = observe(config, true);
    const after = observe(config, false);

    // The old release: one car left standing with its direction pointing at nothing, refused for
    // five calls by `noDirectionReversal`, thirteen times.
    expect([before.staleReleases, before.atNothing, before.staleRefusals, before.refusedCalls]).toEqual([1, 1, 13, 5]);
    // The fixed release: no such car and no such refusal.
    expect([after.staleReleases, after.atNothing, after.staleRefusals, after.refusedCalls]).toEqual([0, 0, 0, 0]);

    // Compared on the legs. Everybody is delivered under both, and every leg that moved arrived sooner.
    for (const { result } of [before, after]) {
      expect(result.status).toBe('completed');
      expect(result.undelivered).toEqual([]);
    }
    expect(after.result.record.passengers).not.toEqual(before.result.record.passengers);
    const was = legTimes(before.result);
    const now = legTimes(after.result);
    expect([...now.keys()].sort()).toEqual([...was.keys()].sort());
    const moved = [...now].map(([key, time]) => time - (was.get(key) ?? Number.NaN)).filter((delta) => Math.abs(delta) > 1e-9);
    expect(moved).toHaveLength(21);
    expect(moved.every((delta) => delta < 0)).toBe(true);
    expect(moved.reduce((sum, delta) => sum + delta, 0)).toBeCloseTo(-308.737, 3);
  }, 120_000);

  it('leaves a run where no release leaves a car pointing past its work byte-identical', async () => {
    const config = await shippedRun('garden-apartments', 1);
    const before = observe(config, true);
    const after = observe(config, false);

    expect([before.staleReleases, before.staleRefusals]).toEqual([0, 0]);
    expect(JSON.stringify(after.result.record)).toBe(JSON.stringify(before.result.record));
  }, 120_000);
});
