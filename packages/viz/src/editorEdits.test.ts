/**
 * The editor's operations, and the round trip that matters.
 *
 * ## The round trip is against the real loader, not against a stub
 *
 * `ED-T9` says the editor's output must round-trip "through the same JSON `loadConfig` reads".
 * A test that re-parsed the serialised document with `parseBuilding` would prove only that the
 * editor agrees with one function; the loader also reads a *directory*, cross-checks the traffic
 * profile against `traffic-profiles.json`, and applies a second layer of diagnostics. So the
 * suites below write a whole data directory to a temporary path — the three top-level files
 * copied from `data/`, and the edited building in `buildings/` — and call `loadConfig` on it.
 *
 * That is also acceptance criterion 5 of this task: *a config loaded, edited, and serialised is
 * accepted by the real `loadConfig`.*
 */

import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, type BuildingConfig, type LoadedConfig } from '@elevator-sim/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BUILDING_IDS, DATA_DIR } from './fixtures.test-helper.js';
import {
  OPERATIONAL_ZONING_NOTE,
  addBank,
  addCar,
  addFloor,
  blankBuilding,
  moveFloor,
  removeAccessZone,
  removeCar,
  removeFloor,
  serializeBuilding,
  setBankServedFloors,
  setCarSpec,
  updateCar,
  updateFloor,
  upsertAccessZone,
} from './editorEdits.js';
import { validateBuilding } from './editorValidate.js';

let config: LoadedConfig;
let scratch: string;

/** The authored documents, read straight off disk — `ResolvedBuilding` cannot be re-serialised. */
const sources = new Map<string, BuildingConfig>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  scratch = await mkdtemp(join(tmpdir(), 'viz-editor-'));
  const { readFile } = await import('node:fs/promises');
  for (const id of BUILDING_IDS) {
    const text = await readFile(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8');
    sources.set(id, JSON.parse(text) as BuildingConfig);
  }
}, 120_000);

afterAll(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
});

function sourceOf(id: string): BuildingConfig {
  const source = sources.get(id);
  if (source === undefined) throw new Error(`no source document for ${id}`);
  return structuredClone(source);
}

/**
 * Write one building into a complete data directory and load it the way the project does.
 *
 * Returns the loaded config, so the caller can assert on what the loader *made of* the edit
 * rather than only that it did not throw.
 */
async function loadEdited(building: BuildingConfig, name: string): Promise<LoadedConfig> {
  const dir = join(scratch, name);
  await mkdir(join(dir, 'buildings'), { recursive: true });
  for (const file of [
    'elevator-specs.json',
    'traffic-profiles.json',
    'dispatcher-profiles.json',
  ]) {
    await cp(join(DATA_DIR, file), join(dir, file));
  }
  await writeFile(join(dir, 'buildings', `${building.id}.json`), serializeBuilding(building));
  return loadConfig(dir);
}

/* -------------------------------------------------------------------------- *
 * Acceptance criterion 5 — load, edit, serialise, load again
 * -------------------------------------------------------------------------- */

describe.each(BUILDING_IDS)('%s — the round trip', (buildingId) => {
  it('serialises unchanged to something the real loader accepts', async () => {
    const loaded = await loadEdited(sourceOf(buildingId), `${buildingId}-untouched`);
    const before = config.buildingsById.get(buildingId);
    const after = loaded.buildingsById.get(buildingId);
    expect(after).toBeDefined();
    expect(after?.floors.length).toBe(before?.floors.length);
    expect(after?.banks.length).toBe(before?.banks.length);
    expect(after?.totalPopulation).toBe(before?.totalPopulation);
  }, 300_000);

  it('survives an edit and comes back through the loader with the edit applied', async () => {
    const source = sourceOf(buildingId);
    const floors = source.floors ?? [];
    const target = floors[floors.length - 1];
    // A building declared only by ranges has no explicit floor to nudge; edit a car instead, so
    // every shipped building is genuinely exercised rather than skipped.
    const edited =
      target === undefined
        ? updateCar(source, source.banks[0]?.id ?? '', source.banks[0]?.cars[0]?.id ?? '', {
            ratedLoadLb: 3500,
          })
        : updateFloor(source, target.id, { population: target.population + 7 });

    const loaded = await loadEdited(edited, `${buildingId}-edited`);
    const after = loaded.buildingsById.get(buildingId);
    expect(after).toBeDefined();
    if (target === undefined) {
      expect(after?.banks[0]?.cars[0]?.ratedLoadLb).toBe(3500);
    } else {
      const floor = after?.floorsById.get(target.id);
      expect(floor?.population).toBe(target.population + 7);
    }
  }, 300_000);
});

describe('a blank building', () => {
  it('is the smallest one the schema accepts, and the loader accepts it — ED-05', async () => {
    const blank = blankBuilding(config.elevatorSpecs, config.trafficProfiles);
    const report = validateBuilding(blank, config.elevatorSpecs, {
      trafficProfileIds: new Set(config.trafficProfilesById.keys()),
    });
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);

    const loaded = await loadEdited(blank, 'blank');
    const built = loaded.buildingsById.get(blank.id);
    expect(built?.floors).toHaveLength(2);
    expect(built?.banks[0]?.cars).toHaveLength(1);
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * The operations themselves
 * -------------------------------------------------------------------------- */

describe('edits are pure', () => {
  it('never mutates the document they were given', () => {
    const source = sourceOf('garden-apartments');
    const before = JSON.stringify(source);
    addFloor(source, { id: 'X', index: 99, heightM: 300, population: 1 });
    removeFloor(source, 'G');
    setBankServedFloors(source, 'main', []);
    upsertAccessZone(source, { id: 'z', floors: ['G'], credentialGroups: ['staff'] });
    moveFloor(source, '2', 1);
    expect(JSON.stringify(source)).toBe(before);
  }, 120_000);
});

describe('floors — ED-T1', () => {
  it('adds a floor and the preview sees it without a run', () => {
    const source = sourceOf('garden-apartments');
    const next = addFloor(source, { id: '7', index: 7, heightM: 18, population: 24 });
    expect(next.floors?.map((floor) => floor.id)).toContain('7');
  }, 120_000);

  it('removing a floor cleans it out of service and access zoning, separately', () => {
    const source = upsertAccessZone(sourceOf('garden-apartments'), {
      id: 'penthouse',
      floors: ['6'],
      credentialGroups: ['resident'],
    });
    expect(source.banks[0]?.servesFloors).toContain('6');

    const next = removeFloor(source, '6');
    expect(next.floors?.some((floor) => floor.id === '6')).toBe(false);
    // Service zoning: cleaned.
    expect(next.banks[0]?.servesFloors).not.toContain('6');
    // Access zoning: cleaned, and *separately* — the zone still exists, it just no longer names
    // a floor the building does not have.
    expect(next.accessZones?.find((zone) => zone.id === 'penthouse')?.floors).toEqual([]);
  }, 120_000);

  it('reorders the declaration list without renumbering index or height', () => {
    const source = sourceOf('garden-apartments');
    const first = source.floors?.[0];
    const next = moveFloor(source, first?.id ?? '', 2);
    expect(next.floors?.[2]?.id).toBe(first?.id);
    // The two orderings the loader cross-checks are untouched, deliberately: an editor that
    // renumbered them would be resolving a modelling error by fiat.
    for (const floor of next.floors ?? []) {
      const original = source.floors?.find((candidate) => candidate.id === floor.id);
      expect(floor.index).toBe(original?.index);
      expect(floor.heightM).toBe(original?.heightM);
    }
  }, 120_000);

  it('a non-monotonic height is rejected by the loader, with both values named — ED-10', () => {
    const source = sourceOf('garden-apartments');
    const broken = updateFloor(source, '5', { heightM: 1 });
    const report = validateBuilding(broken, config.elevatorSpecs);
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'floor-height-order')).toBe(true);
    expect(report.issues[0]?.message).toContain('1');
    expect(report.issues[0]?.message).toContain('4');
  }, 120_000);

  it('a negative height is accepted — basements are legal — ED-11', () => {
    const source = addFloor(sourceOf('garden-apartments'), {
      id: 'B1',
      index: -1,
      heightM: -3.5,
      population: 0,
    });
    const withService = setBankServedFloors(source, 'main', [
      'B1',
      ...(source.banks[0]?.servesFloors ?? []),
    ]);
    const report = validateBuilding(withService, config.elevatorSpecs);
    expect(report.issues).toEqual([]);
  }, 120_000);
});

describe('banks and cars — ED-T3, ED-02, ED-03', () => {
  it('adds a car that the schema accepts', () => {
    const next = addCar(sourceOf('garden-apartments'), 'main', { id: 'C', spec: 'hydraulic' });
    expect(next.banks[0]?.cars.map((car) => car.id)).toEqual(['A', 'B', 'C']);
    expect(validateBuilding(next, config.elevatorSpecs).issues).toEqual([]);
  }, 120_000);

  it('changing the class clears the overrides that belonged to the old one — ED-03', () => {
    const source = sourceOf('garden-apartments');
    expect(source.banks[0]?.cars[0]?.ratedSpeedMps).toBeDefined();
    const next = setCarSpec(source, 'main', 'A', 'gearless-traction');
    const car = next.banks[0]?.cars[0];
    expect(car?.spec).toBe('gearless-traction');
    expect(car?.ratedSpeedMps).toBeUndefined();
    expect(car?.ratedLoadLb).toBeUndefined();
    // And the resolved car now takes the new class's typical values rather than the old one's.
    const report = validateBuilding(next, config.elevatorSpecs);
    expect(report.valid).toBe(true);
    expect(report.resolved?.banks[0]?.cars[0]?.ratedSpeedMps).toBeGreaterThan(0.63);
  }, 120_000);

  it('an unknown class is rejected, naming the known ones', () => {
    const next = setCarSpec(sourceOf('garden-apartments'), 'main', 'A', 'antigravity');
    const report = validateBuilding(next, config.elevatorSpecs);
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === 'unknown-spec')).toBe(true);
  }, 120_000);

  it('a bank with no cars is refused by the schema, not by us — ED-12', () => {
    const next = removeCar(removeCar(sourceOf('garden-apartments'), 'main', 'A'), 'main', 'B');
    const report = validateBuilding(next, config.elevatorSpecs);
    expect(report.valid).toBe(false);
    expect(report.stage).toBe('schema');
  }, 120_000);

  it('two banks with overlapping served floors are legal — ED-08', () => {
    const source = sourceOf('garden-apartments');
    const next = addBank(source, {
      id: 'second',
      servesFloors: [...(source.banks[0]?.servesFloors ?? [])],
      cars: [{ id: 'A', spec: 'hydraulic' }],
    });
    const report = validateBuilding(next, config.elevatorSpecs);
    expect(report.issues).toEqual([]);
  }, 120_000);
});

describe('the three kinds of zoning stay three things', () => {
  it('service zoning changes `servesFloors` and nothing else', () => {
    const source = sourceOf('garden-apartments');
    const next = setBankServedFloors(source, 'main', ['G', '2', '3']);
    expect(next.banks[0]?.servesFloors).toEqual(['G', '2', '3']);
    expect(next.accessZones).toEqual(source.accessZones);
  }, 120_000);

  it('access zoning changes `accessZones` and nothing else', () => {
    const source = sourceOf('garden-apartments');
    const next = upsertAccessZone(source, {
      id: 'staff-only',
      floors: ['6'],
      credentialGroups: ['staff'],
    });
    expect(next.accessZones?.map((zone) => zone.id)).toContain('staff-only');
    expect(next.banks[0]?.servesFloors).toEqual(source.banks[0]?.servesFloors);
    expect(removeAccessZone(next, 'staff-only').accessZones).toEqual([]);
  }, 120_000);

  it('an access zone naming a floor that does not exist is rejected — ED-14', () => {
    const next = upsertAccessZone(sourceOf('garden-apartments'), {
      id: 'ghost',
      floors: ['99'],
      credentialGroups: ['staff'],
    });
    const report = validateBuilding(next, config.elevatorSpecs);
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.message.includes('99'))).toBe(true);
  }, 120_000);

  it('offers no operational-zoning control, and says where it lives instead — ED-T6', () => {
    expect(OPERATIONAL_ZONING_NOTE).toContain('dispatcher-profiles.json');
    expect(OPERATIONAL_ZONING_NOTE).toContain('not building geometry');
  });
});

/* -------------------------------------------------------------------------- *
 * Serialisation — ED-T9
 * -------------------------------------------------------------------------- */

describe('serializeBuilding', () => {
  it('keeps the shipped field order so a diff is reviewable', () => {
    /*
     * Built from a **shuffled** document, deliberately. The first version of this test
     * serialised the shipped file, whose keys are already in the canonical order — so
     * `JSON.stringify(building)` with no reordering at all passed it, and the mutation harness
     * caught that: the whole ordering pass could be deleted with the suite still green.
     */
    const source = sourceOf('garden-apartments');
    const shuffled = Object.fromEntries(
      Object.entries(source).reverse(),
    ) as unknown as BuildingConfig;
    expect(Object.keys(shuffled)[0]).not.toBe('id');

    const keys = Object.keys(JSON.parse(serializeBuilding(shuffled)) as Record<string, unknown>);
    expect(keys[0]).toBe('$comment');
    expect(keys.indexOf('id')).toBeLessThan(keys.indexOf('name'));
    expect(keys.indexOf('name')).toBeLessThan(keys.indexOf('floors'));
    expect(keys.indexOf('floors')).toBeLessThan(keys.indexOf('banks'));
    expect(keys.indexOf('banks')).toBeLessThan(keys.indexOf('accessZones'));
    expect(keys.indexOf('accessZones')).toBeLessThan(keys.indexOf('notes'));
    // The shipped file is already canonical, so the two must serialise identically.
    expect(serializeBuilding(shuffled)).toBe(serializeBuilding(source));
  }, 120_000);

  it('is idempotent — serialising twice gives the same bytes', () => {
    const once = serializeBuilding(sourceOf('midtown-office'));
    const twice = serializeBuilding(JSON.parse(once) as BuildingConfig);
    expect(twice).toBe(once);
  }, 120_000);

  it('keeps a field the order list has never heard of', () => {
    const source = { ...sourceOf('garden-apartments'), someFutureField: 42 } as BuildingConfig;
    expect(serializeBuilding(source)).toContain('someFutureField');
  }, 120_000);

  it('ends with a newline, as the shipped files do', () => {
    expect(serializeBuilding(sourceOf('garden-apartments')).endsWith('}\n')).toBe(true);
  }, 120_000);
});
