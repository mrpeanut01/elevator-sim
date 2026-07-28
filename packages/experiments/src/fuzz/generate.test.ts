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
      // Added when `CarConfig.mode` and `BuildingConfig.serviceEvents` became authorable. Both
      // axes were recorded as *excluded* from the campaign for want of a `core` change; they are
      // no longer excluded, and these two claims are what stops that quietly reversing.
      'initial-service-mode',
      'service-schedule',
      // A car that leaves the group and comes back, which is a different run from one that
      // leaves and does not — the returning car re-enters group control and the retry timer
      // picks it up. Both must be reachable, so both are asserted.
      'service-return',
    ]) {
      expect(tags, `corpus no longer covers "${claim}"`).toContain(claim);
    }
    expect(
      corpus.some((entry) => entry.tags.includes('service-schedule') && !entry.tags.includes('service-return')),
      'no pinned case withdraws a car for the rest of the run',
    ).toBe(true);
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

/* -------------------------------------------------------------------------- *
 * Service mode — what the corpus emits, and the one rule it may never break
 * -------------------------------------------------------------------------- */

const SERVICE_MODES_EXPECTED = ['in-service', 'out-of-service', 'independent', 'fire-recall'];

/** Initial mode per `bankId/carId`, absent meaning the `in-service` default. */
function initialModes(entry: FuzzCase): Map<string, string> {
  const modes = new Map<string, string>();
  for (const bank of entry.building.banks) {
    for (const car of bank.cars) modes.set(`${bank.id}/${car.id}`, car.mode ?? 'in-service');
  }
  return modes;
}

describe('the service-mode axis', () => {
  it('emits both shapes: an initial mode on a car, and a mid-run schedule', () => {
    const withMode = corpus.filter((entry) =>
      entry.building.banks.some((bank) => bank.cars.some((car) => car.mode !== undefined)),
    );
    const withSchedule = corpus.filter((entry) => (entry.building.serviceEvents ?? []).length > 0);

    // Counts, not merely "at least one": a corpus that drifted down to a single case of each
    // would still satisfy a `toBeGreaterThan(0)` while covering almost nothing, and these are
    // the numbers the campaign statistics in `the root DECISIONS.md` are quoted from.
    expect(withMode.map((entry) => entry.fuzzSeed)).toEqual([
      '101', '102', '107', '111', '116', '121', '128', '137', '181',
    ]);
    expect(withSchedule.map((entry) => entry.fuzzSeed)).toEqual([
      '101', '107', '108', '113', '129', '131', '141', '142', '144', '156', '193',
    ]);
  });

  it('reaches all four service modes, and both the qualified and unqualified event form', () => {
    const seen = new Set<string>();
    let qualified = 0;
    let unqualified = 0;
    for (const entry of corpus) {
      for (const bank of entry.building.banks) {
        for (const car of bank.cars) if (car.mode !== undefined) seen.add(car.mode);
      }
      for (const event of entry.building.serviceEvents ?? []) {
        seen.add(event.mode);
        if (event.bankId === undefined) unqualified += 1;
        else qualified += 1;
      }
    }
    for (const mode of SERVICE_MODES_EXPECTED) {
      expect(seen, `no pinned case reaches service mode "${mode}"`).toContain(mode);
    }
    // `bankId` is optional and generated car ids are unique building-wide, so both resolution
    // paths in `resolveBuilding` are real and both are exercised.
    expect(qualified).toBeGreaterThan(0);
    expect(unqualified).toBeGreaterThan(0);
  });

  it('never withdraws every serving car from a bank, at any instant of any case', () => {
    /*
     * The construction rule `generate.ts` § "Service mode is generated" states, asserted rather
     * than trusted. A bank with no `in-service` car cannot collect its landings, and
     * `properties.ts` `isServable` reasons about topology and credentials — not about service
     * mode — so it would call those passengers servable and P5 would report a deadlock. That
     * report would be *correct*, and it would be a generator artefact rather than a simulator
     * finding. The corner is covered on purpose elsewhere (`validation/adversarial.test.ts`,
     * `core/src/sim/serviceMode.test.ts`), where the expected `timed-out` status is asserted.
     *
     * Replayed in authored order, because that is the order the kernel fires the schedule in
     * (CLAUDE.md invariant 4).
     */
    for (const entry of corpus) {
      const modes = initialModes(entry);
      const servingIn = (bankId: string): number =>
        [...modes.entries()].filter(([key, mode]) => key.startsWith(`${bankId}/`) && mode === 'in-service')
          .length;

      const check = (when: string): void => {
        for (const bank of entry.building.banks) {
          expect(
            servingIn(bank.id),
            `${entry.caseId}: bank "${bank.id}" has no in-service car ${when}`,
          ).toBeGreaterThan(0);
        }
      };
      check('at t=0');

      for (const event of entry.building.serviceEvents ?? []) {
        const holder = entry.building.banks.find(
          (bank) =>
            (event.bankId === undefined || bank.id === event.bankId) &&
            bank.cars.some((car) => car.id === event.carId),
        );
        expect(holder, `${entry.caseId}: service event names a car no bank declares`).toBeDefined();
        if (holder === undefined) continue;
        modes.set(`${holder.id}/${event.carId}`, event.mode);
        check(`after the event at ${String(event.atS)} s`);
      }
    }
  });

  it('schedules every event inside its own run, so none is refused as past the deadline', () => {
    // `sim/simulation.ts` `#scheduleServiceEvents` refuses an entry past the drain deadline and
    // warns. A refused entry makes the case silently inert — it authors a mode change that never
    // happens — which is a fuzz case that proves nothing.
    for (const entry of corpus) {
      for (const event of entry.building.serviceEvents ?? []) {
        expect(event.atS).toBeGreaterThanOrEqual(0);
        expect(event.atS, `${entry.caseId}: event at ${String(event.atS)} s outruns its own horizon`)
          .toBeLessThan(entry.durationS);
      }
    }
  });
});
