/**
 * **The shipped-run measurements behind `DECISIONS.md` § D1591 and § D1603, as runs rather than as
 * prose.**
 *
 * § D1591 fixed one path by which a stationary car is left pointing at work it no longer has
 * (`Car.withdrawHallCall`, used by `Simulation.#withdrawCall`) and held the same gap in
 * `Car.releaseHallCall` and `Car.releaseAllHallCalls`. § D1603 closed it there, carrying out the
 * owner's decision panel's ruling R2 (§ D1600). Each half rests on counts over shipped runs, and
 * CLAUDE.md's rule is that a published number is pinned to the run that produced it. These are
 * those runs.
 *
 * - **494 runs** (ten shipped buildings, every shipped profile, two seeds, a 900 s horizon and the
 *   demand template's own, bar `vertical-city`'s, the costliest), each run three times: as shipped,
 *   with the old withdrawal put back, and with the old release put back. The withdrawal's re-settle
 *   moves no run (§ D1591's figure, now measured with the fixed release in both arms). The release's
 *   moves 24, listed.
 * - **147 runs** (seven shipped buildings, seven profiles, three seeds, 900 s), as shipped and with
 *   the old release put back: § D1591 clause 3's counts under the old release, none under the fixed
 *   one, and the two runs whose legs move.
 * - **The Phase 6 gate cell**: Mixed-Use High-Rise at up-peak 4 %, n = 200, every arm the gate study
 *   runs there, as shipped and with the old release put back. No leg moves.
 *
 * A release is **stale** when it leaves a car that is standing still with a direction and no
 * committed stop ahead in it, and it points **at nothing** when the car has no committed stop at
 * all. Each stale release is attributed to the `Simulation` method that made it, read off the stack,
 * because § D1591 argued the gap per path. A **stale refusal** is what such a car costs a rider:
 * `noDirectionReversal` refusing it a call while it stands in that state, read off the dispatch
 * decision's own rejected list. What a rider paid where the legs move is read per journey: its
 * door-to-door time (final alighting less journey start), and whether it was delivered, abandoned or
 * stranded under each engine.
 *
 * "The old one put back" is the current method run with the car's direction held where it was:
 * `#settleDirection` reads the car's stops through `this.committedStops()`, so shadowing that on the
 * instance for the length of the call, with one stop infinitely far ahead in the car's direction,
 * makes the re-settle keep whatever the car had. `core`'s `model/car/keptDirection.test-helper.ts`
 * is the same control; a test helper is not on `core`'s barrel, so this file carries its own copy.
 * The control checks itself: § D1591's counts have to come back under it, so a change to how the car
 * reads its stops goes red here rather than passing quietly.
 *
 * Opt-in, behind the deep fuzz tier's own switch (`ELEVATOR_SIM_FUZZ=deep`), so the always-on suite
 * pays nothing for them; `core/src/sim/releaseDirection.test.ts` is the always-on part:
 *
 * ```bash
 * ELEVATOR_SIM_FUZZ=deep npx vitest run --project experiments packages/experiments/src/fuzz/releaseDirection.test.ts
 * ```
 *
 * Each run swaps methods on the shared prototypes for its own length and restores them in a
 * `finally`, the shape `core/src/sim/serviceRange.test.ts` uses for the same comparison.
 */

import {
  Simulation,
  WeightedCostDispatchPolicy,
  loadConfig,
  type LoadedConfig,
  type SimulationConfig,
  type SimulationResult,
} from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { DISCLOSURE_PROFILE } from '../benchmark/destinationDisclosure.js';
import {
  baselineProfileIds,
  DECOMPOSITION_ARM,
  MIXED_USE_BUILDING,
  MIXED_USE_CANDIDATES,
  MIXED_USE_POINTS,
  mixedUseProfiles,
} from '../benchmark/mixedUseHighRise.js';
import { BENCHMARK_SEED } from '../benchmark/suite.js';
import { planExperiment, replicationSeed, simulationConfigFor } from '../runner/index.js';
import { withProfiles } from '../validation/harness.js';

import { deepCampaignRequested } from './campaign.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;

beforeAll(async () => {
  if (!deepCampaignRequested()) return;
  config = await loadConfig(DATA_DIR);
}, 60_000);

/* -------------------------------------------------------------------------- *
 * The controls
 * -------------------------------------------------------------------------- */

/** The three hand-backs, on the prototype every car of a run shares. */
type HandBack = 'withdrawHallCall' | 'releaseHallCall' | 'releaseAllHallCalls';
type CarPrototype = Record<HandBack, (this: ProbedCar, ...args: unknown[]) => unknown>;

/** A car's state, as the probe reads it. Public getters only. */
interface ProbedCar {
  readonly isMoving: boolean;
  readonly direction: 'up' | 'down' | undefined;
  readonly floorIndex: number;
  committedStops(): readonly { readonly floorIndex: number }[];
}

function shippedRun(buildingId: string, profileId: string, seed: number, durationS: number | undefined): SimulationConfig {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
  if (building === undefined || dispatcherProfile === undefined) throw new Error(`${buildingId}/${profileId} is not shipped`);
  return {
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
    seed,
    ...(durationS === undefined ? {} : { durationS }),
    onTimeout: 'report',
  };
}

function prototypeOf(sim: Simulation): CarPrototype {
  const car = sim.building.banks[0]?.cars[0];
  if (car === undefined) throw new Error('the bank has no car');
  return Object.getPrototypeOf(car) as CarPrototype;
}

/** `method`, run with the car's direction held where it was: the hand-back before § D1591/§ D1603. */
function keepingDirection(method: (this: ProbedCar, ...args: unknown[]) => unknown): (this: ProbedCar, ...args: unknown[]) => unknown {
  return function (this: ProbedCar, ...args: unknown[]): unknown {
    const direction = this.direction;
    const pinned = direction === undefined ? [] : [{ floorIndex: direction === 'up' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY }];
    Object.defineProperty(this, 'committedStops', { value: () => pinned, configurable: true, writable: true });
    try {
      return method.apply(this, args);
    } finally {
      Reflect.deleteProperty(this, 'committedStops');
    }
  };
}

/** Run `body` with the old behaviour on `methods`, restoring the current ones whatever happens. */
function withOldHandBack<T>(proto: CarPrototype, methods: readonly HandBack[], body: () => T): T {
  const saved = methods.map((name) => [name, proto[name]] as const);
  for (const [name, method] of saved) proto[name] = keepingDirection(method);
  try {
    return body();
  } finally {
    for (const [name, method] of saved) proto[name] = method;
  }
}

/* -------------------------------------------------------------------------- *
 * The probe
 * -------------------------------------------------------------------------- */

/** Which `Simulation` path released the call: the first two private frames below the release. */
function pathOf(stack: string): string {
  const frames = stack
    .split('\n')
    .slice(2)
    .map((line) => /#(\w+)/u.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
  const [caller, callersCaller] = frames;
  if (caller === 'reofferCall') return 're-offer';
  if (caller === 'completeCall') return 'completion';
  if (caller === 'applyDecision' && callersCaller === 'reassignOnLoad') return 'reassignment on load';
  if (caller === 'applyDecision' && callersCaller === 'dispatchBank') return 'dispatch decision';
  return `other: ${String(caller)} < ${String(callersCaller)}`;
}

/** Stale releases and stale refusals over a set of runs. */
interface Tally {
  stale: number;
  atNothing: number;
  byPath: Record<string, number>;
  /** `noDirectionReversal` refusals of a car standing with a stale direction. */
  refusals: number;
  /** The calls those refusals were for, summed over runs. */
  refusedCalls: number;
  /** Runs with at least one such refusal. */
  refusingRuns: number;
}

function emptyTally(): Tally {
  return { stale: 0, atNothing: 0, byPath: {}, refusals: 0, refusedCalls: 0, refusingRuns: 0 };
}

/** A standing car whose direction points at no committed stop ahead: `'nothing'` when it has none. */
function staleness(car: {
  readonly moving: boolean;
  readonly direction: 'up' | 'down' | undefined;
  readonly floorIndex: number;
  readonly stops: readonly { readonly floorIndex: number }[];
}): 'past' | 'nothing' | undefined {
  if (car.moving || car.direction === undefined) return undefined;
  const sign = car.direction === 'up' ? 1 : -1;
  if (car.stops.some((stop) => sign * (stop.floorIndex - car.floorIndex) > 0)) return undefined;
  return car.stops.length === 0 ? 'nothing' : 'past';
}

/** One run, with every release and every `noDirectionReversal` refusal read into `into`. */
function probed(sim: Simulation, into: Tally): SimulationResult {
  const proto = prototypeOf(sim);
  const release = proto.releaseHallCall;
  const releaseAll = proto.releaseAllHallCalls;
  const policy = WeightedCostDispatchPolicy.prototype;
  const dispatch = policy.dispatch;
  const refused = new Set<string>();
  let refusals = 0;

  const read = (car: ProbedCar, released: boolean, stack: string): void => {
    if (!released) return;
    const state = staleness({ moving: car.isMoving, direction: car.direction, floorIndex: car.floorIndex, stops: car.committedStops() });
    if (state === undefined) return;
    into.stale += 1;
    if (state === 'nothing') into.atNothing += 1;
    const path = pathOf(stack);
    into.byPath[path] = (into.byPath[path] ?? 0) + 1;
  };
  proto.releaseHallCall = function (this: ProbedCar, ...args: unknown[]): unknown {
    const out = release.apply(this, args);
    read(this, out === true, new Error().stack ?? '');
    return out;
  };
  proto.releaseAllHallCalls = function (this: ProbedCar, ...args: unknown[]): unknown {
    const out = releaseAll.apply(this, args);
    read(this, Array.isArray(out) && out.length > 0, new Error().stack ?? '');
    return out;
  };
  policy.dispatch = function (this: WeightedCostDispatchPolicy, ...args: Parameters<WeightedCostDispatchPolicy['dispatch']>) {
    const decision = dispatch.apply(this, args);
    for (const verdict of decision.rejected) {
      if (verdict.constraintId !== 'noDirectionReversal') continue;
      const car = args[1].find((snapshot) => snapshot.carId === verdict.carId);
      if (car === undefined) continue;
      if (staleness({ moving: car.motion !== undefined, direction: car.direction, floorIndex: car.floorIndex, stops: car.stops }) === undefined) continue;
      refusals += 1;
      refused.add(decision.callId);
    }
    return decision;
  };
  try {
    return sim.run();
  } finally {
    proto.releaseHallCall = release;
    proto.releaseAllHallCalls = releaseAll;
    policy.dispatch = dispatch;
    into.refusals += refusals;
    into.refusedCalls += refused.size;
    if (refusals > 0) into.refusingRuns += 1;
  }
}

/** A run's legs and termination, as one string: two runs are the same run when these are equal. */
function legsOf(result: SimulationResult): string {
  return `${JSON.stringify(result.record.passengers)}|${result.status}`;
}

/* -------------------------------------------------------------------------- *
 * What a rider paid
 * -------------------------------------------------------------------------- */

/** Per journey: door-to-door time if delivered, and whether any leg was abandoned or stranded. */
function journeysOf(result: SimulationResult): ReadonlyMap<string, { ttd: number | undefined; abandoned: boolean; stranded: boolean }> {
  const journeys = new Map<string, { ttd: number | undefined; abandoned: boolean; stranded: boolean }>();
  for (const leg of result.record.passengers) {
    const journey = journeys.get(leg.journeyId) ?? { ttd: undefined, abandoned: false, stranded: false };
    if (leg.isFinalLeg && leg.alightedAt !== undefined) journey.ttd = leg.alightedAt - leg.journeyStartedAt;
    if (leg.abandonedAt !== undefined) journey.abandoned = true;
    if (leg.strandedAt !== undefined) journey.stranded = true;
    journeys.set(leg.journeyId, journey);
  }
  return journeys;
}

/** The riders' account of the runs whose legs moved, old release against fixed. */
interface RiderEffect {
  journeys: number;
  moved: number;
  later: number;
  sooner: number;
  /** Sum over moved journeys of fixed minus old door-to-door time, seconds. */
  totalS: number;
  /** Journeys delivered under one engine and not the other, abandoned, or stranded, either way. */
  undeliveredUnderOneOnly: number;
  abandoned: number;
  stranded: number;
}

function emptyEffect(): RiderEffect {
  return { journeys: 0, moved: 0, later: 0, sooner: 0, totalS: 0, undeliveredUnderOneOnly: 0, abandoned: 0, stranded: 0 };
}

function addEffect(into: RiderEffect, old: SimulationResult, fixed: SimulationResult): void {
  const before = journeysOf(old);
  const after = journeysOf(fixed);
  for (const [journeyId, now] of after) {
    const was = before.get(journeyId);
    into.journeys += 1;
    if (now.abandoned || was?.abandoned === true) into.abandoned += 1;
    if (now.stranded || was?.stranded === true) into.stranded += 1;
    if ((now.ttd === undefined) !== (was?.ttd === undefined)) into.undeliveredUnderOneOnly += 1;
    if (now.ttd === undefined || was?.ttd === undefined) continue;
    const delta = now.ttd - was.ttd;
    if (Math.abs(delta) <= 1e-9) continue;
    into.moved += 1;
    into.totalS += delta;
    if (delta > 0) into.later += 1;
    else into.sooner += 1;
  }
}

/* -------------------------------------------------------------------------- *
 * The measurements
 * -------------------------------------------------------------------------- */

describe.skipIf(!deepCampaignRequested())('§ D1591 and § D1603, measured on shipped runs', () => {
  it('on 494 shipped runs the withdrawal’s re-settle moves none and the release’s moves 24, with nobody stranded either way', () => {
    const buildings = [
      'ashgate',
      'chancery-house',
      'crown-hotel',
      'garden-apartments',
      'harbour-point',
      'midtown-office',
      'mixed-use-high-rise',
      'secure-tower',
      'st-jude-hospital',
      'vertical-city',
    ];
    const profiles = config.dispatcherProfiles.profiles.map((profile) => profile.id);
    const tally = { old: emptyTally(), fixed: emptyTally() };
    const effect = emptyEffect();
    let runs = 0;
    const withdrawalMoves: string[] = [];
    const releaseMoves: string[] = [];
    for (const buildingId of buildings) {
      for (const profileId of profiles) {
        for (const seed of [11, 12]) {
          for (const durationS of [900, undefined]) {
            if (buildingId === 'vertical-city' && durationS === undefined) continue;
            const key = `${buildingId}/${profileId}/${String(seed)}/${String(durationS)}`;
            const runConfig = shippedRun(buildingId, profileId, seed, durationS);
            const fixed = probed(new Simulation(runConfig), tally.fixed);
            const withdrawn = new Simulation(runConfig);
            const oldWithdrawal = withOldHandBack(prototypeOf(withdrawn), ['withdrawHallCall'], () => withdrawn.run());
            const released = new Simulation(runConfig);
            const oldRelease = withOldHandBack(prototypeOf(released), ['releaseHallCall', 'releaseAllHallCalls'], () => probed(released, tally.old));
            runs += 1;
            if (legsOf(oldWithdrawal) !== legsOf(fixed)) withdrawalMoves.push(key);
            if (legsOf(oldRelease) !== legsOf(fixed)) {
              releaseMoves.push(key);
              addEffect(effect, oldRelease, fixed);
            }
          }
        }
      }
    }
    console.log(
      `\n§ D1591/§ D1603 on ${String(runs)} shipped runs: the withdrawal moves ${String(withdrawalMoves.length)}; ` +
        `the old release ${JSON.stringify(tally.old)}; the fixed release ${JSON.stringify(tally.fixed)}; ` +
        `the release moves ${JSON.stringify(releaseMoves)}; riders ${JSON.stringify(effect)}\n`,
    );
    expect(profiles).toHaveLength(13);
    expect(runs).toBe(494);
    // § D1591: re-pointing a car on a withdrawal moves no shipped run.
    expect(withdrawalMoves).toEqual([]);
    // § D1603: what the old release did on these runs, and what the fixed one does.
    expect(tally.old).toEqual({
      stale: 591,
      atNothing: 111,
      byPath: { 'dispatch decision': 212, completion: 46, 're-offer': 241, 'reassignment on load': 92 },
      refusals: 683,
      refusedCalls: 60,
      refusingRuns: 11,
    });
    expect(tally.fixed).toEqual(emptyTally());
    expect(releaseMoves).toEqual(RELEASE_MOVES_494);
    expect({ ...effect, totalS: Number(effect.totalS.toFixed(3)) }).toEqual(RIDERS_494);
  }, 3_600_000);

  it('a released call left a standing car pointing past its work 88 times in 147 shipped runs, 7 at nothing; since § D1603, none', () => {
    const buildings = [
      'garden-apartments',
      'midtown-office',
      'mixed-use-high-rise',
      'secure-tower',
      'chancery-house',
      'crown-hotel',
      'st-jude-hospital',
    ];
    const profiles = ['collective', 'eta', 'nearest-car', 'fairness-first', 'destination-panel', 'zoned-uppeak', 'auction'];
    const tally = { old: emptyTally(), fixed: emptyTally() };
    const effect = emptyEffect();
    let runs = 0;
    const moves: string[] = [];
    for (const buildingId of buildings) {
      for (const profileId of profiles) {
        for (const seed of [1, 2, 3]) {
          const runConfig = shippedRun(buildingId, profileId, seed, 900);
          const fixed = probed(new Simulation(runConfig), tally.fixed);
          const sim = new Simulation(runConfig);
          const old = withOldHandBack(prototypeOf(sim), ['releaseHallCall', 'releaseAllHallCalls'], () => probed(sim, tally.old));
          runs += 1;
          if (legsOf(old) !== legsOf(fixed)) {
            moves.push(`${buildingId}/${profileId}/${String(seed)}`);
            addEffect(effect, old, fixed);
          }
        }
      }
    }
    console.log(
      `\n§ D1603 on ${String(runs)} shipped runs: the old release ${JSON.stringify(tally.old)}; the fixed release ${JSON.stringify(tally.fixed)}; ` +
        `legs move on ${JSON.stringify(moves)}; riders ${JSON.stringify(effect)}\n`,
    );
    expect(runs).toBe(147);
    // § D1591 clause 3's figures, reproduced with the old release put back, and what they cost.
    expect(tally.old).toEqual({
      stale: 88,
      atNothing: 7,
      byPath: { 'reassignment on load': 28, 're-offer': 32, 'dispatch decision': 18, completion: 10 },
      refusals: 15,
      refusedCalls: 6,
      refusingRuns: 2,
    });
    // § D1603: no release leaves a standing car pointing past its work, and nothing is refused for it.
    expect(tally.fixed).toEqual(emptyTally());
    // The fix is what moves these two runs, and only these two.
    expect(moves).toEqual(['midtown-office/zoned-uppeak/2', 'crown-hotel/collective/2']);
    expect({ ...effect, totalS: Number(effect.totalS.toFixed(3)) }).toEqual(RIDERS_147);
  }, 3_600_000);

  /*
   * § D1603 clause 1's gate cell: Phase 6's published gate (`benchmark/mixedUseHighRise.ts`, § D100,
   * § D333), Mixed-Use High-Rise at up-peak 4 %, n = 200 under common random numbers, every arm the
   * study runs there, built exactly as `runMixedUseHighRiseStudy` builds that point.
   */
  it('the Phase 6 gate cell moves on no leg: 1 200 replications, 91 releases left a car pointing at nothing, all in the panel arm', () => {
    const destination = config.dispatcherProfilesById.get(DISCLOSURE_PROFILE);
    if (destination === undefined) throw new Error(`${DISCLOSURE_PROFILE} is not shipped`);
    const resources = withProfiles(config, mixedUseProfiles(destination));
    const arms = [...baselineProfileIds(config.dispatcherProfilesById), DECOMPOSITION_ARM, ...MIXED_USE_CANDIDATES];
    const point = MIXED_USE_POINTS.find((candidate) => candidate.id === 'up-peak-4pct');
    if (point === undefined) throw new Error('the gate point is not in MIXED_USE_POINTS');
    const id = `phase6/mixed-use/${point.id}`;
    const plan = planExperiment(
      {
        id,
        seed: BENCHMARK_SEED,
        buildings: [MIXED_USE_BUILDING],
        dispatchers: arms,
        traffic: [point.traffic],
        replication: { minReplications: point.replications, maxReplications: point.replications, checkEvery: 8 },
        parallel: { mode: 'serial' },
      },
      resources,
      { keepRecords: false },
    );

    const old: Record<string, Tally> = {};
    const fixed = emptyTally();
    let runs = 0;
    const moves: string[] = [];
    for (const cell of plan.cells) {
      const oldArm = (old[cell.dispatcherArmId] ??= emptyTally());
      for (let replication = 0; replication < point.replications; replication += 1) {
        const runConfig = simulationConfigFor(id, cell, replication, replicationSeed(plan.experimentSeed, replication));
        const current = probed(new Simulation(runConfig), fixed);
        const sim = new Simulation(runConfig);
        const before = withOldHandBack(prototypeOf(sim), ['releaseHallCall', 'releaseAllHallCalls'], () => probed(sim, oldArm));
        runs += 1;
        if (legsOf(before) !== legsOf(current)) moves.push(`${cell.dispatcherArmId}#${String(replication)}`);
      }
    }
    console.log(`\n§ D1603 gate cell: ${String(runs)} replications; the old release ${JSON.stringify(old)}; legs move on ${String(moves.length)}\n`);
    expect(arms).toEqual(['nearest-car', 'eta', 'collective', 'destination-eta-unpriced', 'destination-eta+ride1', 'destination-panel']);
    expect(runs).toBe(1_200);
    expect(moves).toEqual([]);
    expect(fixed).toEqual(emptyTally());
    expect(Object.fromEntries(Object.entries(old).filter(([, tally]) => tally.stale > 0))).toEqual({
      'destination-panel': { ...emptyTally(), stale: 91, atNothing: 91, byPath: { 're-offer': 91 } },
    });
  }, 3_600_000);
});

/* -------------------------------------------------------------------------- *
 * Pinned figures, derived by the runs above
 * -------------------------------------------------------------------------- */

/** The 494 runs whose legs the fixed release moves, in the order the case visits them. */
const RELEASE_MOVES_494: readonly string[] = [
  'ashgate/predictive-balanced/11/900',
  'crown-hotel/fairness-first/11/undefined',
  'crown-hotel/predictive-balanced/12/900',
  'harbour-point/collective/11/900',
  'harbour-point/collective-enroute/11/900',
  'harbour-point/collective-enroute/11/undefined',
  'harbour-point/capacity-aware/12/900',
  'harbour-point/capacity-aware/12/undefined',
  'harbour-point/predictive-balanced/11/undefined',
  'harbour-point/predictive-balanced/12/undefined',
  'harbour-point/auction/11/undefined',
  'harbour-point/zoned-uppeak/11/900',
  'midtown-office/auction-multi-round/12/900',
  'mixed-use-high-rise/collective-enroute/12/900',
  'mixed-use-high-rise/predictive-balanced/11/900',
  'st-jude-hospital/collective/12/900',
  'st-jude-hospital/collective/12/undefined',
  'st-jude-hospital/collective-enroute/12/undefined',
  'st-jude-hospital/fairness-first/11/900',
  'st-jude-hospital/predictive-balanced/11/undefined',
  'vertical-city/collective/11/900',
  'vertical-city/collective/12/900',
  'vertical-city/collective-enroute/11/900',
  'vertical-city/predictive-balanced/11/900',
];

/**
 * What the riders of those runs paid, fixed release minus old: every journey delivered under both
 * engines, none abandoned or stranded, and the moved door-to-door times split both ways.
 */
const RIDERS_494: RiderEffect = {
  journeys: 12_144,
  moved: 5_536,
  later: 2_651,
  sooner: 2_885,
  totalS: -18_770.755,
  undeliveredUnderOneOnly: 0,
  abandoned: 0,
  stranded: 0,
};

/** The same for the 147 runs' two. */
const RIDERS_147: RiderEffect = {
  journeys: 636,
  moved: 123,
  later: 47,
  sooner: 76,
  totalS: -153.745,
  undeliveredUnderOneOnly: 0,
  abandoned: 0,
  stranded: 0,
};
