/**
 * **A released hall call re-points the car that held it, and that is what moves a run** —
 * `DECISIONS.md` § D1603, carrying out the owner's decision panel's ruling R2 (§ D1600) on the gap
 * § D1591 clause 3 held, and its ruling R6, which folded `Car.setMode` into the same fix.
 *
 * Each run below is run on the fixed engine and again with one change put back
 * (`model/car/keptDirection.test-helper.ts` holds the car's direction through the methods named),
 * and the two are compared on the legs, the shape CLAUDE.md asks of a control. The release, with
 * `releaseHallCall` and `releaseAllHallCalls` put back, on two shipped runs:
 *
 * - **Crown Hotel under `collective`, seed 2, 900 s.** Under the old release one completion leaves a
 *   car standing still with its direction pointing at nothing, and `noDirectionReversal` then
 *   refuses that car for five calls, thirteen times. With the fix the refusals are gone and 21 legs
 *   arrive sooner, none later.
 * - **Garden Apartments under `collective`, seed 1, 900 s.** Seven releases and none of them leaves
 *   a standing car pointing past its work, so the two runs are byte-identical.
 *
 * And the mode change, with `setMode` alone put back, on the one session of the 2 000 that
 * `elevator-sim fuzz --scenario stage-1-first-call --tier deep` plays whose legs it moves:
 *
 * - **Session 1000611.** Car B stands at the ground floor pointing up with one hall call when a
 *   verb switches it to independent service, which drops the call, and back. Under the old
 *   `setMode` it returns to service still pointing up at nothing, and `noDirectionReversal` refuses
 *   it two down calls. With the fold it returns directionless, and five legs move, two sooner and
 *   three later. The same two riders are stranded at the same moment under both.
 *
 * The same comparisons over 494 and 147 shipped runs, the Phase 6 gate cell and all 2 000 stage-1
 * sessions are `experiments/src/fuzz/releaseDirection.test.ts`, behind the deep fuzz tier's switch.
 * This is the part of it that runs on every `vitest run`, at about a second.
 */

import { describe, expect, it } from 'vitest';

import { WeightedCostDispatchPolicy } from '../dispatch/policy.js';
import type { DispatchDecision } from '../dispatch/types.js';
import { Car } from '../model/car/car.js';
import { withOldHandBack, type HandBack } from '../model/car/keptDirection.test-helper.js';
import type { CarSnapshot } from '../model/car/types.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { RunInterventionConfig, SimulationConfig, SimulationResult } from './types.js';

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

/**
 * Stage 1's deep play session 1000611, as `experiments`' `PlaySessions.configFor` builds it: the
 * stage's building and opening profile, replication 22 of its tuning set (`tuning-20260730`, whose
 * replication seed `runner/crn.ts#replicationSeed` derives as below), its 900 s and its report
 * window, and the verb log `playCaseFromSeed(1000611, …, DEEP_PLAY_SPACE)` draws. `core` may not
 * import `experiments`, so the seed and the log are written out; the session's legs on the fixed
 * engine are the ones the deep tier reads, which the case below would show as a red if they moved.
 */
async function stageOneSession1000611(): Promise<SimulationConfig> {
  const config = await load();
  const building = config.buildingsById.get('garden-apartments');
  const dispatcherProfile = config.dispatcherProfilesById.get('collective');
  if (building === undefined || dispatcherProfile === undefined) throw new Error('garden-apartments/collective is not shipped');
  return {
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
    seed: 5_811_960_332_942_314_354n,
    durationS: 900,
    onTimeout: 'report',
    reportWindow: 'full-run',
    interventions: SESSION_1000611,
  };
}

/** What a run's hand-backs and mode changes did to the cars, and what the dispatcher refused. */
interface Observed {
  readonly result: SimulationResult;
  /** Releases that left a standing car with a direction and no committed stop ahead in it. */
  readonly staleReleases: number;
  /** The same, with no committed stop at all. */
  readonly atNothing: number;
  /** Mode changes that left a standing car with a direction and no committed stop ahead in it. */
  readonly staleModeChanges: number;
  /** The same, with no committed stop at all. */
  readonly modeChangesAtNothing: number;
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
 * Run `config` with the old behaviour put back on `old` (none for the fixed engine), counting from
 * outside: every release and every mode change that leaves a standing car pointing past its work,
 * and every `noDirectionReversal` refusal of a car in that state. The probe wraps the prototype
 * methods and restores them; it changes no decision.
 */
function observe(config: SimulationConfig, old: readonly HandBack[]): Observed {
  let staleReleases = 0;
  let atNothing = 0;
  let staleModeChanges = 0;
  let modeChangesAtNothing = 0;
  let staleRefusals = 0;
  const refused = new Set<string>();

  const cars = Car.prototype;
  const policy = WeightedCostDispatchPolicy.prototype;
  const release = cars.releaseHallCall;
  const releaseAll = cars.releaseAllHallCalls;
  const setMode = cars.setMode;
  const dispatch = policy.dispatch;

  const stateOf = (car: Car): 'past' | 'nothing' | undefined =>
    staleness({ motion: car.motion, direction: car.direction, floorIndex: car.floorIndex, stops: car.committedStops() });
  const read = (car: Car, released: boolean): void => {
    if (!released) return;
    const state = stateOf(car);
    if (state === undefined) return;
    staleReleases += 1;
    if (state === 'nothing') atNothing += 1;
  };
  const run = (): SimulationResult => {
    const currentRelease = cars.releaseHallCall;
    const currentReleaseAll = cars.releaseAllHallCalls;
    const currentSetMode = cars.setMode;
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
    cars.setMode = function (this: Car, mode: Car['mode']): ReturnType<Car['setMode']> {
      const before = this.mode;
      const out = currentSetMode.call(this, mode);
      const state = this.mode === before ? undefined : stateOf(this);
      if (state !== undefined) {
        staleModeChanges += 1;
        if (state === 'nothing') modeChangesAtNothing += 1;
      }
      return out;
    };
    try {
      return runSimulation(config);
    } finally {
      cars.releaseHallCall = currentRelease;
      cars.releaseAllHallCalls = currentReleaseAll;
      cars.setMode = currentSetMode;
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
    const result = old.length > 0 ? withOldHandBack(cars, old, run) : run();
    return { result, staleReleases, atNothing, staleModeChanges, modeChangesAtNothing, staleRefusals, refusedCalls: refused.size };
  } finally {
    cars.releaseHallCall = release;
    cars.releaseAllHallCalls = releaseAll;
    cars.setMode = setMode;
    policy.dispatch = dispatch;
  }
}

/** The four counts, in the order the cases read them. */
function countsOf(observed: Observed): readonly number[] {
  return [observed.staleReleases, observed.atNothing, observed.staleModeChanges, observed.modeChangesAtNothing, observed.staleRefusals, observed.refusedCalls];
}

/** Door-to-door time of every delivered leg, keyed by passenger and leg. */
function legTimes(result: SimulationResult): ReadonlyMap<string, number> {
  const times = new Map<string, number>();
  for (const leg of result.record.passengers) {
    if (leg.alightedAt !== undefined) times.set(`${leg.passengerId}#${String(leg.legIndex)}`, leg.alightedAt - leg.arrivedAt);
  }
  return times;
}

/** Fixed minus old door-to-door time of every delivered leg that moved, after checking both delivered the same legs. */
function movedLegs(before: SimulationResult, after: SimulationResult): readonly number[] {
  const was = legTimes(before);
  const now = legTimes(after);
  expect([...now.keys()].sort()).toEqual([...was.keys()].sort());
  return [...now].map(([key, time]) => time - (was.get(key) ?? Number.NaN)).filter((delta) => Math.abs(delta) > 1e-9);
}

/** Every stranded leg, keyed by passenger and leg, with the moment it was stranded. */
function strandedLegs(result: SimulationResult): readonly string[] {
  return result.record.passengers
    .filter((leg) => leg.strandedAt !== undefined)
    .map((leg) => `${leg.passengerId}#${String(leg.legIndex)}@${String(leg.strandedAt)}`)
    .sort();
}

const RELEASE: readonly HandBack[] = ['releaseHallCall', 'releaseAllHallCalls'];

describe('a released hall call re-points the car that held it (§ D1603)', () => {
  it('changes the run where a release left a car pointing at nothing, and only by delivering riders sooner', async () => {
    const config = await shippedRun('crown-hotel', 2);
    const before = observe(config, RELEASE);
    const after = observe(config, []);

    // The old release: one car left standing with its direction pointing at nothing, refused for
    // five calls by `noDirectionReversal`, thirteen times. No mode changes on a shipped run.
    expect(countsOf(before)).toEqual([1, 1, 0, 0, 13, 5]);
    // The fixed release: no such car and no such refusal.
    expect(countsOf(after)).toEqual([0, 0, 0, 0, 0, 0]);

    // Compared on the legs. Everybody is delivered under both, and every leg that moved arrived sooner.
    for (const { result } of [before, after]) {
      expect(result.status).toBe('completed');
      expect(result.undelivered).toEqual([]);
    }
    expect(after.result.record.passengers).not.toEqual(before.result.record.passengers);
    const moved = movedLegs(before.result, after.result);
    expect(moved).toHaveLength(21);
    expect(moved.every((delta) => delta < 0)).toBe(true);
    expect(moved.reduce((sum, delta) => sum + delta, 0)).toBeCloseTo(-308.737, 3);
  }, 120_000);

  it('leaves a run where no release leaves a car pointing past its work byte-identical', async () => {
    const config = await shippedRun('garden-apartments', 1);
    const before = observe(config, RELEASE);
    const after = observe(config, []);

    expect([before.staleReleases, before.staleRefusals]).toEqual([0, 0]);
    expect(JSON.stringify(after.result.record)).toBe(JSON.stringify(before.result.record));
  }, 120_000);
});

describe('a mode change that drops a standing car’s calls re-points it (§ D1603, ruling R6)', () => {
  it('changes stage 1’s session 1000611, where a car came back to service pointing at nothing', async () => {
    const config = await stageOneSession1000611();
    const before = observe(config, ['setMode']);
    const after = observe(config, []);

    // The old `setMode`, with the release fixed in both arms: car B is left standing pointing at
    // nothing twice, on leaving service and on coming back, and `noDirectionReversal` refuses it
    // two calls.
    expect(countsOf(before)).toEqual([0, 0, 2, 2, 2, 2]);
    // With the fold: no such car and no such refusal.
    expect(countsOf(after)).toEqual([0, 0, 0, 0, 0, 0]);

    // Compared on the legs: the same legs delivered, five of them moved both ways, and the same two
    // riders stranded at the same moment under both.
    for (const { result } of [before, after]) expect(result.status).toBe('completed');
    const moved = movedLegs(before.result, after.result);
    expect(moved).toHaveLength(5);
    expect(moved.filter((delta) => delta < 0)).toHaveLength(2);
    expect(moved.reduce((sum, delta) => sum + delta, 0)).toBeCloseTo(-12.397, 3);
    expect(strandedLegs(after.result)).toHaveLength(2);
    expect(strandedLegs(after.result)).toEqual(strandedLegs(before.result));
  }, 120_000);
});

/** Session 1000611's verb log, as `playCaseFromSeed` draws it. Data, written out because `core` may not import `experiments`. */
const SESSION_1000611: readonly RunInterventionConfig[] = [
  {
    atS: 52,
    change: {
      kind: 'answer-incident',
      option: 'answer 1',
      serviceEvents: [
        { atS: 723, bankId: 'main', carId: 'B', mode: 'out-of-service' },
        { atS: 424, bankId: 'main', carId: 'B', mode: 'in-service' },
      ],
    },
  },
  { atS: 127, change: { kind: 'spread-cars' } },
  {
    atS: 191,
    change: {
      kind: 'answer-incident',
      option: 'answer 2',
      serviceEvents: [
        { atS: 813, bankId: 'main', carId: 'B', ratedLoadLb: 960, ratedLoadKg: 438 },
        { atS: 768, bankId: 'main', carId: 'A', ratedLoadLb: 1200, ratedLoadKg: 548 },
        { atS: 604, bankId: 'main', carId: 'B', ratedLoadLb: 1600, ratedLoadKg: 730 },
      ],
    },
  },
  {
    atS: 278,
    change: {
      kind: 'equipment-change',
      changeId: 'load-weighing',
      name: 'Re-set the load-weighing thresholds',
      serviceEvents: [
        { atS: 491, bankId: 'main', servesFloors: ['G', '2', '5', '6'] },
        { atS: 278, bankId: 'main', carId: 'B', mode: 'independent' },
      ],
    },
  },
  { atS: 302, change: { kind: 'spread-cars' } },
  {
    atS: 431.5,
    change: {
      kind: 'equipment-change',
      changeId: 'tenant-floors',
      name: 'Move or stagger a tenancy',
      serviceEvents: [
        { atS: 867, bankId: 'main', carId: 'B', ratedLoadLb: 1200, ratedLoadKg: 548 },
        { atS: 802, bankId: 'main', carId: 'B', mode: 'out-of-service' },
        { atS: 864, bankId: 'main', carId: 'A', ratedLoadLb: 960, ratedLoadKg: 438 },
        { atS: 431.5, bankId: 'main', carId: 'B', ratedLoadLb: 960, ratedLoadKg: 438 },
      ],
    },
  },
  {
    atS: 444,
    change: {
      kind: 'equipment-change',
      changeId: 'load-weighing',
      name: 'Re-set the load-weighing thresholds',
      serviceEvents: [
        { atS: 615, bankId: 'main', carId: 'A', ratedLoadLb: 1600, ratedLoadKg: 730 },
        { atS: 809, bankId: 'main', servesFloors: ['G', '2', '3', '4', '5', '6'] },
      ],
    },
  },
  {
    atS: 545,
    change: {
      kind: 'equipment-change',
      changeId: 'load-weighing',
      name: 'Re-set the load-weighing thresholds',
      serviceEvents: [
        { atS: 682, bankId: 'main', servesFloors: ['G', '2', '3', '4', '6'] },
        { atS: 835, bankId: 'main', carId: 'B', mode: 'in-service' },
        { atS: 822, bankId: 'main', carId: 'A', ratedLoadLb: 1200, ratedLoadKg: 548 },
        { atS: 587, bankId: 'main', carId: 'A', ratedLoadLb: 800, ratedLoadKg: 365 },
        { atS: 579, bankId: 'main', carId: 'B', ratedLoadLb: 1440, ratedLoadKg: 657 },
      ],
    },
  },
  { atS: 562, change: { kind: 'spread-cars' } },
  { atS: 638, change: { kind: 'spread-cars' } },
  {
    atS: 874.5,
    change: {
      kind: 'answer-incident',
      option: 'answer 4',
      serviceEvents: [{ atS: 876, bankId: 'main', carId: 'A', mode: 'independent' }],
    },
  },
];
