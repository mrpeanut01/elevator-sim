/**
 * **A landing's call type is per-floor building data with a schema** — GitHub issue #437, AC1,
 * `DECISIONS.md` § D553.
 *
 * `FloorConfig.landingCallType` declares what the hall fixture at one landing is: an up/down button,
 * a destination-entry panel, or a mobile-credential reader. It is the same closed vocabulary as
 * `dispatch.callType`, and absent means *whatever the dispatcher's own `dispatch.callType` says*, so
 * a building that declares nothing is the building it was before the field existed.
 *
 * Asserted here on the authoring path a shipped building takes — the schema `loadConfig` runs, the
 * range expansion tall buildings use, and the `Floor` the simulator reads — and on the shipped data,
 * which declares it nowhere: every pinned figure in this repository was measured with it absent.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { Floor } from '../model/floor.js';

import { expandFloors } from './expandFloors.js';
import { loadConfig } from './loader.js';
import { floorConfigSchema, floorRangeSchema } from './schema.js';
import { CALL_TYPES, type LoadedConfig } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

const FLOOR = { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true } as const;
const RANGE = {
  fromIndex: 2,
  toIndex: 4,
  startHeightM: 6,
  floorToFloorM: 3,
  populationPerFloor: 40,
} as const;

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

describe('FloorConfig.landingCallType', () => {
  it('accepts every call type the dispatcher vocabulary declares, and nothing else', () => {
    for (const landingCallType of CALL_TYPES) {
      expect(floorConfigSchema.safeParse({ ...FLOOR, landingCallType }).success).toBe(true);
    }
    for (const wrong of ['panel', 'destination', true, 1, '']) {
      expect(floorConfigSchema.safeParse({ ...FLOOR, landingCallType: wrong }).success).toBe(false);
    }
  });

  it('is optional, and a floor that omits it parses to a floor without the key', () => {
    const parsed = floorConfigSchema.parse(FLOOR);
    expect(Object.keys(parsed)).not.toContain('landingCallType');
  });

  it('reaches the Floor the simulator reads, and is undefined where nothing was declared', () => {
    expect(new Floor({ ...FLOOR, landingCallType: 'destination-entry' }).landingCallType).toBe(
      'destination-entry',
    );
    expect(new Floor(FLOOR).landingCallType).toBeUndefined();
  });
});

describe('FloorRange.landingCallType', () => {
  it('is accepted on a range and copied to every floor the range expands to', () => {
    expect(floorRangeSchema.safeParse({ ...RANGE, landingCallType: 'mobile-credential' }).success).toBe(
      true,
    );
    expect(floorRangeSchema.safeParse({ ...RANGE, landingCallType: 'kiosk' }).success).toBe(false);
    const expanded = expandFloors({
      floors: [FLOOR],
      floorRanges: [{ ...RANGE, landingCallType: 'mobile-credential' }],
    });
    expect(expanded.map((floor) => [floor.id, floor.landingCallType])).toEqual([
      ['G', undefined],
      ['2', 'mobile-credential'],
      ['3', 'mobile-credential'],
      ['4', 'mobile-credential'],
    ]);
  });

  it('adds no key to a range floor that declares none, so an undeclared tower expands as it did', () => {
    const expanded = expandFloors({ floorRanges: [RANGE] });
    for (const floor of expanded) expect(Object.keys(floor)).not.toContain('landingCallType');
  });

  it('is overridden by an explicit floor at the same index, like every other range field', () => {
    const expanded = expandFloors({
      floors: [{ id: '3', index: 3, heightM: 9, population: 40, landingCallType: 'up-down-buttons' }],
      floorRanges: [{ ...RANGE, landingCallType: 'destination-entry' }],
    });
    expect(expanded.find((floor) => floor.index === 3)?.landingCallType).toBe('up-down-buttons');
  });
});

describe('the shipped buildings', () => {
  it('declare no landing call type anywhere, so every shipped run keeps its dispatcher’s call type', () => {
    // Every pinned figure and published interval was measured with the field absent. A building
    // that gains a declaration is a building whose pins must be re-measured, not inherited.
    const declared = [...config.buildingsById.values()].flatMap((building) =>
      building.floors
        .filter((floor) => floor.landingCallType !== undefined)
        .map((floor) => `${building.id}/${floor.id}`),
    );
    expect(declared).toEqual([]);
    expect(config.buildingsById.size).toBeGreaterThan(0);
  });
});
