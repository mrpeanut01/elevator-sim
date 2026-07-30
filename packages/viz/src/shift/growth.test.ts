/**
 * A grown building is a building the loader builds — on all five, at three days.
 *
 * ## What this suite is actually defending
 *
 * `docs/12` § 3.1 BE6 makes growth a **building edit**, and the failure mode of a building edit is
 * that it produces a document the loader accepts *with a new warning*. Warnings do not fail a
 * load, so a grown building whose declared `totalPopulation` no longer matched its floors would
 * run, would produce figures, and would say so only in `resolved.warnings` — where nothing in the
 * viewer looks. That is why the assertion is *no warning the shipped building did not already
 * have* rather than *it loads*.
 *
 * ## Why three days and five buildings rather than one of each
 *
 * Day 1 is the identity case and is the one that must be bit-for-bit the shipped building, because
 * every published figure in this repository was measured on it. Day 5 is a routine week. Day 20 is
 * the one that exercises rounding hardest — ×3.09 on a hundred-and-one-floor tower — and it is the
 * only day at which a per-floor rounding error becomes visible in the total. The five buildings
 * matter because two of them (`mixed-use-high-rise`, `vertical-city`) declare their floors as
 * `floorRanges`, and one of those declares **both** ranges and explicit floors, which is the
 * precedence rule a hand-rolled total would get wrong.
 */

import { loadConfig, parseBuilding, resolveBuilding, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { BUILDING_IDS, DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { grownBuilding, growthFactor } from './growth.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

const DAYS = [1, 5, 20] as const;

/** Warning codes, sorted — the comparison unit. A code is stable; a message is prose. */
function warningCodes(warnings: readonly { readonly code: string }[]): readonly string[] {
  return [...warnings.map((warning) => warning.code)].sort((a, b) => a.localeCompare(b));
}

describe('growthFactor', () => {
  it('is exactly 1 on day 1, so a day-1 shift is the shipped building', () => {
    expect(growthFactor(1)).toBe(1);
  });

  it('is linear, not compounding', () => {
    // 1 + 0.11 × (day − 1). The compounding form would be ×7.26 at day 20 and would put 35 000
    // people in Vertical City. See `types.ts` on GROWTH_PER_DAY.
    expect(growthFactor(20)).toBeCloseTo(3.09, 10);
    expect(growthFactor(20)).toBeLessThan(1.11 ** 19);
  });

  it('never shrinks a building, whatever day it is handed', () => {
    expect(growthFactor(0)).toBe(1);
    expect(growthFactor(-4)).toBe(1);
  });
});

describe('a grown building still loads, on every shipped building', () => {
  it.each(BUILDING_IDS)('%s parses and resolves at days 1, 5 and 20', (buildingId) => {
    const shipped = requireBuilding(config, buildingId);
    const before = warningCodes(shipped.warnings);

    for (const day of DAYS) {
      const grown = grownBuilding(shipped.config, day);
      const parsed = parseBuilding(grown, `${buildingId}@day${String(day)}`);
      const resolved = resolveBuilding(parsed, config.elevatorSpecs, {
        file: `${buildingId}@day${String(day)}`,
        trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
      });
      expect(warningCodes(resolved.warnings), `${buildingId} day ${String(day)}`).toEqual(before);
    }
  });

  it.each(BUILDING_IDS)('%s grows strictly with the day', (buildingId) => {
    const shipped = requireBuilding(config, buildingId);
    const totals = DAYS.map((day) => {
      const grown = grownBuilding(shipped.config, day);
      const parsed = parseBuilding(grown, buildingId);
      return resolveBuilding(parsed, config.elevatorSpecs, { file: buildingId }).totalPopulation;
    });
    expect(totals[0]).toBe(shipped.totalPopulation);
    expect(totals[1]).toBeGreaterThan(totals[0] ?? 0);
    expect(totals[2]).toBeGreaterThan(totals[1] ?? 0);
  });

  it('leaves day 1 structurally identical to the shipped document', () => {
    // Not "close enough": the factor is exactly 1 and `Math.round` is the identity on the
    // integers `data/` declares, so a day-1 shift is comparable with every published figure.
    for (const buildingId of BUILDING_IDS) {
      const shipped = requireBuilding(config, buildingId);
      expect(grownBuilding(shipped.config, 1), buildingId).toEqual(shipped.config);
    }
  });

  it('does not mutate the config it was given', () => {
    const shipped = requireBuilding(config, 'vertical-city');
    const snapshot = JSON.stringify(shipped.config);
    grownBuilding(shipped.config, 20);
    expect(JSON.stringify(shipped.config)).toBe(snapshot);
  });
});

describe('the declared total is the sum of the floors it declares', () => {
  it.each(BUILDING_IDS)('%s: totalPopulation matches the expansion at every day', (buildingId) => {
    // This is the assertion that would fail if the total were re-derived here instead of taken
    // from `core`'s own `expandFloors` — the two would agree until somebody changed one, and
    // `mixed-use-high-rise` (ranges *and* explicit floors) is where they would first diverge.
    const shipped = requireBuilding(config, buildingId);
    for (const day of DAYS) {
      const grown = grownBuilding(shipped.config, day);
      const parsed = parseBuilding(grown, buildingId);
      const resolved = resolveBuilding(parsed, config.elevatorSpecs, { file: buildingId });
      expect(grown.totalPopulation, `${buildingId} day ${String(day)}`).toBe(
        resolved.totalPopulation,
      );
    }
  });

  it('leaves an undeclared total undeclared rather than inventing the check', () => {
    const shipped = requireBuilding(config, 'garden-apartments');
    const { totalPopulation: _dropped, ...withoutTotal } = shipped.config;
    expect(grownBuilding(withoutTotal, 7).totalPopulation).toBeUndefined();
  });
});
