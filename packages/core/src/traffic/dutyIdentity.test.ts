/**
 * **A rider's duty is inert wherever no car declares one, and drawing it moves no other draw.**
 * GitHub issue #481, `DECISIONS.md` § D549.
 *
 * Two claims, and the second is the one that is easy to get wrong. The first — a building that
 * declares no duty runs exactly as it did — is what lets duty land without re-baselining a single
 * published figure. The second — a duty is drawn from its own named stream, once per passenger, in
 * final trace order — is what keeps two arms that differ only in which car is the goods car *the
 * same crowd*: if the draw were taken from `credential` or `passengerMass`, declaring a goods car
 * would re-roll every later rider's badge or weight, and a paired comparison would be comparing
 * two populations. `random/streams.test.ts`'s golden vectors hold the eleven existing streams to
 * their recorded draws; this file holds the trace to it.
 */
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import {
  DUTIES,
  type Duty,
  type DutyShares,
  type LoadedConfig,
  type ResolvedBuilding,
} from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { withDuty } from '../sim/duty.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import { generateTrace } from './generator.js';
import type { PassengerTrace } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const SEED = 20_260_911n;

/** Every building on disk, named so the report can say which were checked. */
const SHIPPED = [
  'burj-class-reference',
  'chancery-house',
  'crown-hotel',
  'garden-apartments',
  'midtown-office',
  'mixed-use-high-rise',
  'secure-tower',
  'st-jude-hospital',
  'vertical-city',
] as const;

const NOBODY: DutyShares = { goods: 0, bed: 0, service: 0 };
const EVERYBODY: DutyShares = { goods: 0.4, bed: 0.3, service: 0.3 };

/**
 * The generalist every search-space probe starts from. The duty weight is authored onto it here,
 * because no shipped profile carries one while no shipped building declares a duty — the guard
 * below is that rule, and § D549 is why.
 */
const BASE_PROFILE_ID = 'predictive-balanced';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 120_000);

function buildingOf(id: string): ResolvedBuilding {
  const building = config.buildingsById.get(id);
  if (building === undefined) throw new Error(`no building "${id}"`);
  return building;
}

function traceOf(
  building: ResolvedBuilding,
  shares: Partial<DutyShares> | undefined,
  streams: StreamSet = new StreamSet(SEED),
): PassengerTrace {
  return generateTrace({
    building,
    profiles: config.trafficProfiles,
    streams,
    ...(shares === undefined ? {} : { duty: { shares } }),
  });
}

const withoutDuty = (value: unknown): string =>
  JSON.stringify(value, (key, item: unknown) => (key === 'duty' ? undefined : item));

const dutyColumn = (trace: PassengerTrace): readonly (Duty | undefined)[] =>
  trace.passengers.map((passenger) => passenger.duty);

describe('a building that declares no duty is byte-identical', () => {
  it('names the nine buildings from disk, and none of them declares a duty', () => {
    expect([...config.buildingsById.keys()].sort()).toEqual([...SHIPPED]);
    for (const id of SHIPPED) {
      for (const bank of buildingOf(id).banks) {
        for (const car of bank.cars) expect('duty' in car, `${id} ${bank.id}-${car.id}`).toBe(false);
      }
    }
  });

  it('ships no weight on the term while no shipped building declares a duty', () => {
    // `predictive-balanced`'s own $comment is the precedent: a weight that is decoration in every
    // shipped configuration is dropped rather than shipped, and the Engineer rail describes a profile
    // by the terms it weights. So a shipped weight lands with the first shipped building that
    // declares a duty, or with the control that lets a player declare one — § D549, clause 7.
    const declares = SHIPPED.some((id) =>
      buildingOf(id).banks.some((bank) => bank.cars.some((car) => car.duty !== undefined)),
    );
    const weighting = config.dispatcherProfiles.profiles
      .filter((profile) => (profile.weights['dutyMismatch'] ?? 0) > 0)
      .map((profile) => profile.id);
    expect(declares || weighting.length === 0, `weighted by ${weighting.join(', ')}`).toBe(true);
  });

  it.each(SHIPPED)('%s draws the same trace, byte for byte, at any duty share', (id) => {
    const building = buildingOf(id);
    const shipped = JSON.stringify(traceOf(building, undefined));
    expect(shipped.includes('"duty"')).toBe(false);
    expect(JSON.stringify(traceOf(building, NOBODY))).toBe(shipped);
    expect(JSON.stringify(traceOf(building, EVERYBODY))).toBe(shipped);
  });

  it.each(SHIPPED)(
    '%s runs the same legs, byte for byte, whether or not the profile weights duty',
    (id) => {
      const building = buildingOf(id);
      const unweighted = config.dispatcherProfilesById.get(BASE_PROFILE_ID);
      if (unweighted === undefined) throw new Error(`no profile "${BASE_PROFILE_ID}"`);
      // Five, the top of the weight's range and the size of the rest of this vector: a single call
      // priced anywhere would move a decision, so the identity is one the arm could have broken.
      const weighted = { ...unweighted, weights: { ...unweighted.weights, dutyMismatch: 5 } };

      const run = (profile: typeof unweighted, shares: DutyShares | undefined) => {
        const result = runSimulation({
          building,
          dispatcherProfile: profile,
          trafficProfiles: config.trafficProfiles,
          elevatorSpecs: config.elevatorSpecs,
          seed: Number(SEED),
          onTimeout: 'report',
          ...(shares === undefined ? {} : { demand: { duty: { shares } } }),
        });
        return JSON.stringify([result.record.passengers, result.summary]);
      };

      const baseline = run(unweighted, undefined);
      expect(baseline.includes('"duty"')).toBe(false);
      expect(run(weighted, undefined)).toBe(baseline);
      expect(run(weighted, EVERYBODY)).toBe(baseline);
    },
  );
});

describe('a building that declares a duty draws it without moving any other draw', () => {
  it.each([
    ['secure-tower', { 'low-A': 'goods' }],
    ['vertical-city', { 'zone-1-local-Z1-A': 'bed' }],
    ['midtown-office', { 'main-D': 'service' }],
  ] as const)('%s: stripping the duty leaves the undeclared trace, byte for byte', (id, duties) => {
    const building = buildingOf(id);
    const declared = traceOf(withDuty(building, duties), EVERYBODY);
    // Every rider carries one, from the closed list...
    expect(declared.passengers.length).toBeGreaterThan(0);
    for (const passenger of declared.passengers) expect(DUTIES).toContain(passenger.duty);
    // ...and nothing else about the crowd moved: not the badge, not the mass, not a single arrival.
    expect(withoutDuty(declared)).toBe(JSON.stringify(traceOf(building, EVERYBODY)));
  });

  it('takes the draw from the duty stream, and from no other', () => {
    const building = withDuty(buildingOf('secure-tower'), { 'high-F': 'goods' });
    const advanced = new StreamSet(SEED);
    advanced.duty.nextFloat();
    const fresh = traceOf(building, EVERYBODY);
    const shifted = traceOf(building, EVERYBODY, advanced);
    // Advancing `duty` alone re-rolls the duty column...
    expect(dutyColumn(shifted)).not.toEqual(dutyColumn(fresh));
    // ...and nothing else, which it could not do if any other column read that stream.
    expect(withoutDuty(shifted)).toBe(withoutDuty(fresh));
  });

  it('is a property of the person, not of which car declares', () => {
    const building = buildingOf('midtown-office');
    const goodsA = traceOf(withDuty(building, { 'main-A': 'goods' }), EVERYBODY);
    const bedD = traceOf(withDuty(building, { 'main-D': 'bed' }), EVERYBODY);
    expect(dutyColumn(goodsA)).toEqual(dutyColumn(bedD));
  });
});

describe('the shares are the demand side, and moving them moves the trace', () => {
  const declared = () => withDuty(buildingOf('midtown-office'), { 'main-A': 'goods' });

  it('draws nobody into a duty at zero and everybody at one', () => {
    expect(new Set(dutyColumn(traceOf(declared(), NOBODY)))).toEqual(new Set(['passenger']));
    expect(new Set(dutyColumn(traceOf(declared(), { goods: 1, bed: 0, service: 0 })))).toEqual(
      new Set(['goods']),
    );
    expect(dutyColumn(traceOf(declared(), EVERYBODY))).not.toContain('passenger');
  });

  it('reads the shipped shares from data/traffic-profiles.json when a run names none', () => {
    const shipped = config.trafficProfiles.duty?.shares;
    expect(shipped).toBeDefined();
    const column = dutyColumn(traceOf(declared(), undefined));
    const sum = (shipped?.goods ?? 0) + (shipped?.bed ?? 0) + (shipped?.service ?? 0);
    expect(sum).toBeGreaterThan(0);
    expect(sum).toBeLessThan(1);
    expect(column).toContain('passenger');
    expect(column.some((duty) => duty !== 'passenger')).toBe(true);
    expect(column).not.toEqual(dutyColumn(traceOf(declared(), NOBODY)));
  });

  it('refuses a share that is not a share, but only where a duty is declared', () => {
    expect(() => traceOf(declared(), { goods: -0.1 })).toThrow(/share/);
    expect(() => traceOf(declared(), { goods: 0.6, bed: 0.3, service: 0.3 })).toThrow(/share/);
    // A building that declares none never asks the question, so it cannot fail it.
    expect(() => traceOf(buildingOf('midtown-office'), { goods: -0.1 })).not.toThrow();
  });
});
