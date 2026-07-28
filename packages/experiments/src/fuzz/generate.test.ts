/**
 * What the generator is, and what the always-on corpus actually covers.
 *
 * Two jobs. The first is the generator's own contract: a case is a pure function of its seed,
 * and every case it emits is a config the **real** loader accepts — a fuzzer that emitted
 * invalid configs would be testing `buildingConfigSchema` and reporting it as a simulator
 * finding.
 *
 * The second is the one that stops the corpus quietly narrowing. `campaign.ts` makes a list of
 * claims about what the pinned seeds cover — every topology, single-car banks, access zones with
 * and without a credential at the landing, basements, two entrances, mixed-use, degenerate
 * rises. Those claims are the whole basis for calling 60 replications a gate rather than a
 * gesture, and prose cannot enforce them: a generator edit that made `shuttle` unreachable, or
 * that stopped producing access zones, would leave the corpus green and the claim false. So the
 * claims are asserted here against exactly the pinned seeds.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { STANDARD_CORPUS } from './campaign.js';
import { caseFromSeed, minDurationFor, resolveCase, STANDARD_SPACE } from './generate.js';
import { generateOptionsFrom } from './run.js';
import { FUZZ_TOPOLOGIES, type FuzzCase } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;
let corpus: FuzzCase[];

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const options = generateOptionsFrom(config);
  corpus = STANDARD_CORPUS.map((seed) => caseFromSeed(seed, options));
}, 60_000);

describe('a case is a function of its seed', () => {
  it('reproduces bit-identically from the same seed', () => {
    const options = generateOptionsFrom(config);
    for (const seed of STANDARD_CORPUS.slice(0, 12)) {
      expect(JSON.stringify(caseFromSeed(seed, options))).toBe(
        JSON.stringify(caseFromSeed(seed, options)),
      );
    }
  });

  it('gives different seeds different buildings', () => {
    const shapes = new Set(corpus.map((entry) => JSON.stringify(entry.building)));
    // Not `=== corpus.length`: two seeds are allowed to collide on a two-floor building. What
    // would be worthless is a generator whose seed barely moves the configuration.
    expect(shapes.size).toBeGreaterThan(corpus.length - 3);
  });
});

describe('every generated case is one the real loader accepts', () => {
  it('parses and resolves, with floors ordered and banks consistent', () => {
    const options = generateOptionsFrom(config);
    for (const entry of corpus) {
      const building = resolveCase(entry, options);

      // `resolveBuilding` already refuses a shaft whose heights disagree with its floor order;
      // re-asserted here because it is the one structural property a naive generator gets wrong
      // (advancing the height by the *index* gap rather than by one storey per declared floor).
      let below = Number.NEGATIVE_INFINITY;
      let belowIndex = Number.NEGATIVE_INFINITY;
      for (const floor of building.floors) {
        expect(floor.index).toBeGreaterThan(belowIndex);
        expect(floor.heightM).toBeGreaterThan(below);
        below = floor.heightM;
        belowIndex = floor.index;
      }

      const floorIds = new Set(building.floors.map((floor) => floor.id));
      for (const bank of building.banks) {
        expect(bank.servesFloors.length).toBeGreaterThanOrEqual(2);
        expect(bank.cars.length).toBeGreaterThanOrEqual(1);
        for (const floorId of bank.servesFloors) expect(floorIds.has(floorId)).toBe(true);
      }
      for (const zone of building.accessZones) {
        for (const floorId of zone.floors) expect(floorIds.has(floorId)).toBe(true);
      }
      expect(building.entranceFloors.length).toBeGreaterThanOrEqual(1);
      expect(building.totalPopulation).toBeGreaterThan(0);

      // A demand template that cannot resolve at this horizon throws inside `generateTrace`, and
      // a case that cannot run is a case that proves nothing.
      expect(entry.durationS).toBeGreaterThanOrEqual(minDurationFor(entry.demandTemplate));
    }
  });

  it('never generates a building whose access zones make a route impossible', () => {
    // An access-restricted transfer floor produces a journey no credential can complete, and
    // the trace generator correctly refuses to generate the trip — which would silently narrow
    // the demand rather than test anything. Entrances are excluded for the same reason.
    for (const entry of corpus) {
      const restricted = new Set((entry.building.accessZones ?? []).flatMap((zone) => zone.floors));
      for (const floor of entry.building.floors ?? []) {
        if (!restricted.has(floor.id)) continue;
        expect(floor.isEntrance).not.toBe(true);
        expect(floor.isTransferFloor).not.toBe(true);
      }
    }
  });
});

describe('what the pinned corpus covers', () => {
  const tagsOf = (): Set<string> => new Set(corpus.flatMap((entry) => entry.tags));

  it('reaches every topology', () => {
    const seen = new Set(corpus.map((entry) => entry.topology));
    for (const topology of FUZZ_TOPOLOGIES) expect(seen).toContain(topology);
  });

  it('reaches every structural condition the corpus claims', () => {
    const tags = tagsOf();
    for (const claim of [
      'degenerate-rise',
      'single-car-banks',
      'access-zones',
      'access-lockout',
      'basement',
      'two-entrances',
      'mixed-use',
    ]) {
      expect(tags, `corpus no longer covers "${claim}"`).toContain(claim);
    }
  });

  it('reaches both call types and most of the shipped dispatcher set', () => {
    const callTypes = new Set(corpus.map((entry) => entry.callType));
    expect(callTypes.size).toBeGreaterThanOrEqual(2);

    const dispatchers = new Set(corpus.map((entry) => entry.dispatcherProfileId));
    const shipped = config.dispatcherProfiles.profiles.length;
    expect(dispatchers.size).toBeGreaterThanOrEqual(shipped - 2);
  });

  it('spans the declared space, and states its own ceiling', () => {
    const floorCounts = corpus.map((entry) => (entry.building.floors ?? []).length);
    expect(Math.min(...floorCounts)).toBe(STANDARD_SPACE.minFloors);
    expect(Math.max(...floorCounts)).toBeGreaterThanOrEqual(STANDARD_SPACE.maxFloors - 2);
    // The ceiling is the thing the deep campaign exists to go past. Asserted so the
    // "what the always-on corpus does not cover" claim in `campaign.ts` cannot go stale.
    expect(Math.max(...floorCounts)).toBeLessThanOrEqual(STANDARD_SPACE.maxFloors);
    for (const entry of corpus) {
      expect(entry.durationS).toBeLessThanOrEqual(STANDARD_SPACE.maxDurationS);
      expect(entry.arrivalRatePctPop5min).toBeLessThanOrEqual(
        STANDARD_SPACE.maxArrivalRatePctPop5min,
      );
      // `constant-iso` needs a 20-minute horizon before it has a measurement window, so the
      // always-on corpus is entirely rise-and-fall. Stated, not assumed.
      expect(entry.demandTemplate).toBe('rise-and-fall');
    }
  });
});
