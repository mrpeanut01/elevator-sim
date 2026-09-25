/**
 * **`adopt-dispatcher` hands over the whole dispatcher, and says what it cannot** —
 * [§ D1048](../../../../DECISIONS.md), held by runs on the shipped path.
 *
 * The player's *Switch to X* press emitted `switch-dispatcher` until this ruling, which hands over
 * the weight vector alone: switching `collective` to *Minimum estimated wait* at 0:00 was
 * bit-identical to not switching on every pinned press day, because the two share `waitTime: 1`
 * and differ by one hard constraint the switch left standing. The new kind hands over the target's
 * resolved stages as well, less the passenger model and the bidding, which are refused.
 *
 * What is asserted, each on real `data/` through `runSimulation`:
 *
 * 1. **Adopting at 0:00 is picking it before the day**, on the legs, for every shipped profile whose
 *    differences from the opening one are all adoptable — on two buildings, so a building on which
 *    two dispatchers happen to agree cannot carry the claim alone.
 * 2. **The residual set is exactly the two the viewer names**, asserted both ways: a target whose
 *    car-level answer settings or demand-forecast settings differ from the opening profile's does
 *    *not* reproduce, and every other adoptable target does. If a residual starts reproducing, its
 *    note on the stage (`live/interventions.ts#switchNoteOf`) has stopped being true and must go.
 * 3. **The prefix is bit-identical and the suffix moves** — the four properties
 *    `interventions.test.ts` holds every kind to, for this one.
 * 4. **The two refusals are loud**, at scheduling time: a target with another passenger model, and
 *    one with other bidding.
 * 5. **`switch-dispatcher` is untouched**: pinned to the legs digest it produced on the tree before
 *    this kind existed, so every stored log and posted run that carries it replays exactly.
 */

import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig } from '../config/types.js';
import { aggregationOf, DISPATCH_DEFAULTS, POLICY_DEFAULTS } from '../dispatch/index.js';

import { fingerprint, load } from './fixtures.test-helper.js';
import { runSimulation, Simulation } from './simulation.js';
import { SimulationError, type RunInterventionConfig, type SimulationConfig, type SimulationResult } from './types.js';

let config: LoadedConfig;
let shipped: readonly DispatcherProfile[];

beforeAll(async () => {
  config = await load();
  shipped = config.dispatcherProfiles.profiles;
});

const SEED = 20260726;
const OPENING = 'collective';
const BUILDINGS = ['garden-apartments', 'midtown-office'] as const;

function profile(id: string): DispatcherProfile {
  const found = config.dispatcherProfilesById.get(id);
  if (found === undefined) throw new Error(`no profile "${id}"`);
  return found;
}

function run(
  buildingId: string,
  profileId: string,
  interventions: readonly RunInterventionConfig[] = [],
): SimulationConfig {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  return {
    building,
    dispatcherProfile: profile(profileId),
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    onTimeout: 'report',
    interventions,
  };
}

/** Every leg, whole: who, which car, when they boarded and when they got off. Never a mean. */
function legsOf(result: SimulationResult): string {
  return JSON.stringify(
    result.record.passengers.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
      leg.alightedAt ?? -1,
    ]),
  );
}

const adopt = (atS: number, id: string): RunInterventionConfig => ({
  atS,
  change: { kind: 'adopt-dispatcher', profile: profile(id) },
});

/** A plain object with sorted keys — authoring order is not a difference. */
const canonical = (value: object | undefined): string =>
  JSON.stringify(Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b))));

/** The passenger model and the bidding are held; a target differing in either is refused. */
function adoptable(target: DispatcherProfile, opening: DispatcherProfile): boolean {
  const landing = (p: DispatcherProfile): string =>
    `${p.dispatch?.callType ?? DISPATCH_DEFAULTS.callType}/${p.dispatch?.passengerAssignment ?? DISPATCH_DEFAULTS.passengerAssignment}`;
  const bidding = (p: DispatcherProfile): string =>
    aggregationOf(p) === POLICY_DEFAULTS.aggregation ? '' : `${aggregationOf(p)} ${canonical(p.auction)}`;
  return landing(target) === landing(opening) && bidding(target) === bidding(opening);
}

/**
 * The two settings a run builds with the cars and the predictors and an adoption cannot reach —
 * the car-level half of `answer`, and the `idle.predictor*` fields. The viewer's
 * `switchNoteOf` reads the same two, which is what this file holds it to.
 */
function residual(target: DispatcherProfile, opening: DispatcherProfile): boolean {
  const carLevel = (p: DispatcherProfile): string => {
    const { allowBypassIfSoleEligibleCar: _group, ...rest } = p.answer ?? {};
    return canonical(rest);
  };
  const forecast = (p: DispatcherProfile): string =>
    canonical(Object.fromEntries(Object.entries(p.idle ?? {}).filter(([key]) => key.startsWith('predictor'))));
  return carLevel(target) !== carLevel(opening) || forecast(target) !== forecast(opening);
}

describe('adopting at 0:00 is picking the dispatcher before the day — § D1048', () => {
  for (const buildingId of BUILDINGS) {
    it(`reproduces every adoptable, residual-free target on the legs, and no residual one — ${buildingId}`, () => {
      const opening = profile(OPENING);
      const candidates = shipped.filter((target) => target.id !== OPENING && adoptable(target, opening));
      const reproduces = new Map<string, boolean>();
      for (const target of candidates) {
        const picked = legsOf(runSimulation(run(buildingId, target.id)));
        const handed = legsOf(runSimulation(run(buildingId, OPENING, [adopt(0, target.id)])));
        reproduces.set(target.id, picked === handed);
      }
      const expected = new Map(candidates.map((target) => [target.id, !residual(target, opening)]));
      expect(Object.fromEntries(reproduces)).toEqual(Object.fromEntries(expected));
      /*
       * Named as well as derived, so a data change that moved a profile across the line is read by
       * a person rather than absorbed by the derivation: the six policy-level targets reproduce, and
       * the two whose door timing or forecast is built with the day do not.
       */
      expect([...reproduces].filter(([, same]) => same).map(([id]) => id).sort()).toEqual([
        'capacity-aware',
        'collective-enroute',
        'eta',
        'fairness-first',
        'nearest-car',
        'zoned-uppeak',
      ]);
      expect([...reproduces].filter(([, same]) => !same).map(([id]) => id).sort()).toEqual([
        'energy-aware',
        'predictive-balanced',
      ]);
    }, 300_000);
  }

  it('makes the one handover a weights-only switch could not: collective to ETA moves the legs', () => {
    /*
     * The finding that started the ruling, in one cell: the two share `waitTime: 1`, so a
     * weights-only switch is the day unchanged, and the whole dispatcher is not.
     */
    const baseline = legsOf(runSimulation(run('midtown-office', OPENING)));
    const weightsOnly = legsOf(
      runSimulation(run('midtown-office', OPENING, [{ atS: 0, change: { kind: 'switch-dispatcher', profile: profile('eta') } }])),
    );
    const whole = legsOf(runSimulation(run('midtown-office', OPENING, [adopt(0, 'eta')])));
    expect(weightsOnly).toBe(baseline);
    expect(whole).not.toBe(baseline);
  }, 120_000);
});

describe('adopt-dispatcher changes the future and only the future', () => {
  // The instant `interventions.test.ts` stands on for this building and seed: five legs board
  // before 600 s and twenty-four after.
  const AT_S = 600;
  const prefix = (result: SimulationResult): string =>
    JSON.stringify(
      result.record.passengers
        .filter((leg) => leg.boardedAt !== undefined && leg.boardedAt < AT_S)
        .map((leg) => [leg.passengerId, leg.carId, leg.boardedAt]),
    );

  it('keeps every leg boarded before atS byte-identical, and moves the run after it', () => {
    const baseline = runSimulation(run('garden-apartments', OPENING));
    const handed = runSimulation(run('garden-apartments', OPENING, [adopt(AT_S, 'nearest-car')]));
    expect(handed.record.passengers.length).toBe(baseline.record.passengers.length);
    expect(JSON.parse(prefix(baseline)).length).toBeGreaterThan(0);
    expect(prefix(handed)).toBe(prefix(baseline));
    expect(legsOf(handed)).not.toBe(legsOf(baseline));
    // The record names the profile the run *started* under; the log is the handover's account.
    expect(handed.record.dispatcherProfileId).toBe(OPENING);
  }, 60_000);

  it('replays the same record to the same fingerprint (invariant 5)', () => {
    const record = (): SimulationConfig => run('garden-apartments', OPENING, [adopt(AT_S, 'fairness-first')]);
    expect(fingerprint(runSimulation(record()))).toBe(fingerprint(runSimulation(record())));
  }, 60_000);

  it('hands a reused policy back its opening dispatcher on reset', () => {
    const simulation = new Simulation(run('garden-apartments', OPENING, [adopt(AT_S, 'capacity-aware')]));
    simulation.run();
    const [policy] = [...simulation.policies.values()];
    expect(policy?.config.dispatch.reassignmentPolicy).toBe('until-commitment');
    policy?.reset();
    expect(policy?.config.dispatch.reassignmentPolicy).toBe(
      profile(OPENING).dispatch?.reassignmentPolicy ?? DISPATCH_DEFAULTS.reassignmentPolicy,
    );
  }, 60_000);
});

describe('what no handover can carry is refused before any event fires', () => {
  it('refuses a target with another passenger model, and names both models', () => {
    for (const id of ['destination-eta', 'destination-panel']) {
      expect(() => runSimulation(run('midtown-office', OPENING, [adopt(300, id)])), id).toThrow(SimulationError);
      expect(() => runSimulation(run('midtown-office', OPENING, [adopt(300, id)])), id).toThrow(/passenger model/u);
    }
  });

  it('refuses a target with other bidding, either way round and between two auctions', () => {
    expect(() => runSimulation(run('midtown-office', OPENING, [adopt(300, 'auction')]))).toThrow(/bidding/u);
    expect(() => runSimulation(run('midtown-office', 'auction', [adopt(300, OPENING)]))).toThrow(/bidding/u);
    expect(() => runSimulation(run('midtown-office', 'auction', [adopt(300, 'auction-multi-round')]))).toThrow(
      /bidding/u,
    );
  });

  it('lets an auction day adopt a dispatcher with the same bidding, through the engine underneath', () => {
    const tuned: DispatcherProfile = {
      ...profile('auction'),
      id: 'auction-tuned',
      dispatch: { ...profile('auction').dispatch, reassignmentPolicy: 'never' },
    };
    const baseline = runSimulation(run('midtown-office', 'auction'));
    const simulation = new Simulation(
      run('midtown-office', 'auction', [{ atS: 300, change: { kind: 'adopt-dispatcher', profile: tuned } }]),
    );
    const handed = simulation.run();
    const [policy] = [...simulation.policies.values()];
    expect(policy?.config.dispatch.reassignmentPolicy).toBe('never');
    expect((policy?.config as { readonly auction?: { readonly aggregation?: string } } | undefined)?.auction?.aggregation).toBe(
      'contract-net',
    );
    expect(legsOf(handed)).not.toBe(legsOf(baseline));
  }, 60_000);
});

describe('switch-dispatcher replays exactly as it did before adopt-dispatcher existed', () => {
  /**
   * The digest of the legs a weights-only handover produced on `47d15b5`, the tree this kind was
   * built on, taken by running this very case there. A stored log or a posted run carrying the old
   * kind must replay bit-identically (invariant 5), and this is the run that says it does.
   */
  const PINNED_SWITCH_LEGS_SHA256 = 'ef1da57ceb5e5889efbd39c6777fe2e90649a1d81afbdfe3e48a9d5eebb6bed2';

  it('produces the pinned legs for collective handed to nearest-car at 600 s', () => {
    const result = runSimulation(
      run('garden-apartments', OPENING, [{ atS: 600, change: { kind: 'switch-dispatcher', profile: profile('nearest-car') } }]),
    );
    const digest = createHash('sha256').update(legsOf(result)).digest('hex');
    expect(digest).toBe(PINNED_SWITCH_LEGS_SHA256);
  }, 60_000);
});
