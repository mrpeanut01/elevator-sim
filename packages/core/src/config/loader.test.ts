/// <reference types="node" />

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from './loader.js';
import {
  DATA_FILES,
  crossCheckDispatcherProfiles,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  resolveBuilding,
} from './parse.js';
import { ConfigError, ISSUE_CODES, WARNING_CODES } from './schema.js';
import type { ElevatorSpecs, LoadedConfig } from './types.js';

/**
 * The acceptance bar: the data that ships in this repository must validate against the
 * schema that ships in this repository. Every test below either loads the real directory
 * or builds a temporary directory from the real reference files.
 */
const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function readReal(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(REAL_DATA_DIR, name), 'utf8')) as Record<string, unknown>;
}

/** `null` omits a file; a string is written verbatim (for malformed-JSON cases). */
interface DataDirSpec {
  readonly specs?: unknown;
  readonly traffic?: unknown;
  readonly dispatchers?: unknown;
  readonly buildings?: Record<string, unknown> | null;
}

async function makeDataDir(spec: DataDirSpec = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'elevator-sim-config-'));
  tempDirs.push(dir);

  /** `undefined` means "copy the real file"; `null` means "do not create it". */
  const write = async (name: string, value: unknown): Promise<void> => {
    const content = value === undefined ? await readReal(name) : value;
    if (content === null) return;
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await writeFile(join(dir, name), text, 'utf8');
  };

  await write(DATA_FILES.elevatorSpecs, spec.specs);
  await write(DATA_FILES.trafficProfiles, spec.traffic);
  await write(DATA_FILES.dispatcherProfiles, spec.dispatchers);

  if (spec.buildings !== null) {
    const buildingsDir = join(dir, DATA_FILES.buildingsDir);
    await mkdir(buildingsDir, { recursive: true });
    const buildings = spec.buildings ?? { 'tower.json': baseBuilding() };
    for (const [name, content] of Object.entries(buildings)) {
      const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      await writeFile(join(buildingsDir, name), text, 'utf8');
    }
  }

  return dir;
}

/** A minimal but valid building, used as the starting point for negative tests. */
function baseBuilding(): Record<string, unknown> {
  return {
    id: 'tower',
    name: 'Tower',
    type: 'office',
    trafficProfile: 'office-standard',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: '2', index: 2, heightM: 4, population: 50 },
      { id: '3', index: 3, heightM: 8, population: 50 },
    ],
    totalPopulation: 100,
    banks: [
      {
        id: 'main',
        servesFloors: ['G', '2', '3'],
        cars: [{ id: 'A', spec: 'geared-traction', ratedLoadLb: 2500, doorType: 'centerOpening' }],
      },
    ],
    accessZones: [],
  };
}

async function expectLoadError(dir: string): Promise<ConfigError> {
  try {
    await loadConfig(dir);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected loadConfig to throw a ConfigError');
}

const codes = (error: ConfigError): string[] => error.issues.map((issue) => issue.code ?? '');

describe('loadConfig against the real data/ directory', () => {
  let config: LoadedConfig;

  beforeAll(async () => {
    config = await loadConfig(REAL_DATA_DIR);
  });

  it('validates every shipped file', () => {
    expect(config.dataDir).toBe(REAL_DATA_DIR);
    expect(config.elevatorSpecs.version).toBe(1);
    expect(config.trafficProfiles.version).toBe(1);
    expect(config.dispatcherProfiles.version).toBe(1);
  });

  it('exposes the shipped elevator classes', () => {
    expect([...config.specsById.keys()]).toEqual([
      'hydraulic',
      'mrl-gearless-low',
      'geared-traction',
      'gearless-traction',
      'high-speed-gearless',
      'ultra-high-speed',
    ]);
    expect(config.elevatorSpecs.conventions.designLoadFactor).toBe(0.8);
  });

  it('exposes the shipped traffic profiles and cost terms', () => {
    expect([...config.trafficProfilesById.keys()]).toEqual([
      'office-prestige',
      'office-standard',
      'residential',
      'hotel',
    ]);
    expect(config.costTermsById.size).toBe(12);
    expect(config.costTermsById.get('waitTime')?.serves).toBe('AWT');
    expect([...config.dispatcherProfilesById.keys()]).toContain('predictive-balanced');
  });

  it('loads every shipped building, in filename order', () => {
    expect(config.buildings.map((building) => building.id)).toEqual([
      'garden-apartments',
      'midtown-office',
      'mixed-use-high-rise',
      'secure-tower',
      'vertical-city',
    ]);
  });

  it('resolves Midtown Office, the primary validation building', () => {
    const midtown = config.buildingsById.get('midtown-office');
    expect(midtown).toBeDefined();
    if (midtown === undefined) return;

    expect(midtown.floors).toHaveLength(21);
    // Sorted by index: the garage basement comes first.
    expect(midtown.floors.map((floor) => floor.id).slice(0, 3)).toEqual(['P1', 'G', '2']);
    // Two ground-level entrances deliberately break the single-lobby assumption.
    expect(midtown.entranceFloors.map((floor) => floor.id)).toEqual(['P1', 'G']);
    expect(midtown.totalPopulation).toBe(1710);
    expect(midtown.totalPopulation).toBe(midtown.config.totalPopulation);
    expect(midtown.banks).toHaveLength(1);
    expect(midtown.banks[0]?.cars.map((car) => car.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(midtown.banks[0]?.cars[0]).toMatchObject({
      spec: 'geared-traction',
      ratedSpeedMps: 2.5,
      ratedLoadLb: 2500,
      ratedLoadKg: 1150,
      capacityPersons: 16,
      designCapacityPersons: 12,
      doorType: 'centerOpening',
      doorOpenS: 1.8,
      doorCloseS: 3.0,
      // Inherited from the class, not declared on the car.
      acceleration: 1.0,
      jerk: 1.4,
      motorStartDelayS: 0.5,
      levelingSettleS: 0.7,
    });
    expect(midtown.trafficProfile).toBe('office-standard');
    expect(config.trafficProfilesById.has(midtown.trafficProfile)).toBe(true);
  });

  it('resolves Garden Apartments', () => {
    const garden = config.buildingsById.get('garden-apartments');
    expect(garden).toBeDefined();
    if (garden === undefined) return;

    expect(garden.floors).toHaveLength(6);
    expect(garden.totalPopulation).toBe(120);
    expect(garden.entranceFloors.map((floor) => floor.id)).toEqual(['G']);
    expect(garden.banks[0]?.cars).toHaveLength(2);
    expect(garden.banks[0]?.cars[0]).toMatchObject({
      spec: 'hydraulic',
      ratedSpeedMps: 0.63,
      ratedLoadLb: 1600,
      ratedLoadKg: 730,
      capacityPersons: 10,
      designCapacityPersons: 8,
      doorType: 'sideOpening',
      doorOpenS: 2.5,
      doorCloseS: 4.0,
    });
  });

  it('expands the compact form used by the tall buildings', () => {
    const mixedUse = config.buildingsById.get('mixed-use-high-rise');
    expect(mixedUse).toBeDefined();
    if (mixedUse === undefined) return;

    // Two explicit floors plus ranges 2-5, 6-30 and 32-60.
    expect(mixedUse.floors).toHaveLength(2 + 4 + 25 + 29);
    expect(mixedUse.totalPopulation).toBe(mixedUse.config.totalPopulation);
    expect(mixedUse.floorsById.get('60')?.heightM).toBe(221.6);
    expect(mixedUse.floorsById.get('6')?.label).toBe('Office');
  });

  it('resolves sky lobbies and per-floor traffic-profile overrides', () => {
    // Transfer floors are every floor where a journey may change banks, in index order.
    // The ground lobby counts: it joins the office locals to the residential shuttle, and
    // `isTransferFloor` is a distinct concept from `isEntrance` (see
    // buildingConnectivity.test.ts, which proves the routing depends on it).
    const mixedUse = config.buildingsById.get('mixed-use-high-rise');
    expect(mixedUse?.transferFloors.map((floor) => floor.id)).toEqual(['G', '31']);
    expect(mixedUse?.floorsById.get('40')?.trafficProfile).toBe('residential');
    expect(mixedUse?.floorsById.get('10')?.trafficProfile).toBeUndefined();

    const verticalCity = config.buildingsById.get('vertical-city');
    expect(verticalCity?.transferFloors.map((floor) => floor.id)).toEqual([
      // Both ground levels: the shuttle's lower deck boards at G, its upper deck at 2.
      'G',
      '2',
      '26',
      '27',
      '51',
      '52',
      '76',
      '77',
    ]);
    expect(verticalCity?.floorsById.get('60')?.trafficProfile).toBe('hotel');

    // Every per-floor override names a profile that exists.
    for (const building of config.buildings) {
      for (const floor of building.floors) {
        if (floor.trafficProfile === undefined) continue;
        expect(config.trafficProfilesById.has(floor.trafficProfile)).toBe(true);
      }
    }
  });

  it('resolves double-deck shuttles and their floor pairs', () => {
    const verticalCity = config.buildingsById.get('vertical-city');
    const shuttle = verticalCity?.banks.find((bank) => bank.id === 'shuttle');
    expect(shuttle).toBeDefined();
    if (verticalCity === undefined || shuttle === undefined) return;

    expect(shuttle.servesFloorPairs).toEqual([
      ['G', '2'],
      ['26', '27'],
      ['51', '52'],
      ['76', '77'],
    ]);
    expect(shuttle.cars[0]).toMatchObject({
      spec: 'ultra-high-speed',
      doubleDeck: true,
      deckSeparationM: 4.5,
      ratedLoadLb: 4000,
      ratedLoadLbPerDeck: 2000,
      capacityPersons: 26,
      capacityPersonsPerDeck: 13,
      designCapacityPersonsPerDeck: 10,
    });

    // Every pair is exactly one deck separation apart, or the car is impossible.
    for (const [lowerId, upperId] of shuttle.servesFloorPairs ?? []) {
      const lower = verticalCity.floorsById.get(lowerId);
      const upper = verticalCity.floorsById.get(upperId);
      expect(upper).toBeDefined();
      expect(lower).toBeDefined();
      expect((upper?.heightM ?? 0) - (lower?.heightM ?? 0)).toBeCloseTo(4.5, 9);
    }

    // Single-deck banks stay single-deck.
    const local = verticalCity.banks.find((bank) => bank.id === 'zone-1-local');
    expect(local?.servesFloorPairs).toBeUndefined();
    expect(local?.cars[0]?.doubleDeck).toBe(false);
  });

  it('every bank serves only floors the building declares', () => {
    for (const building of config.buildings) {
      for (const bank of building.banks) {
        for (const floorId of bank.servesFloors) {
          expect(building.floorsById.has(floorId)).toBe(true);
        }
      }
    }
  });

  it('every car resolves to a declared elevator class', () => {
    for (const building of config.buildings) {
      for (const bank of building.banks) {
        for (const car of bank.cars) {
          expect(config.specsById.has(car.spec)).toBe(true);
        }
      }
    }
  });

  it('reports exactly the three known advisories on the shipped data', () => {
    expect(config.warnings.map((warning) => warning.code)).toEqual([
      // patternSwitching selects an "energy-saver" profile that has not been authored.
      WARNING_CODES.unknownWeightSetProfile,
      // Midtown's bank spans 76.9 m; geared traction is reference-rated to 76 m.
      WARNING_CODES.riseExceedsClass,
      // Vertical City's shuttle bank declares eight double-deck cars that the runtime runs as
      // single-deck cars. The config layer used to validate the deck pairing carefully enough
      // to look wired and then say nothing at all, so the only signal that the shuttles were
      // not being modelled was silence.
      WARNING_CODES.doubleDeckNotSimulated,
    ]);
    expect(config.warnings[0]?.message).toContain('energy-saver');
    expect(config.warnings[1]?.message).toContain('76.9');
    expect(config.warnings[1]?.file).toContain('midtown-office.json');
    expect(config.warnings[2]?.message).toContain('double-deck operation is not simulated');
    expect(config.warnings[2]?.file).toContain('vertical-city.json');
  });

  it('is deterministic: two loads produce identical results', async () => {
    const again = await loadConfig(REAL_DATA_DIR);

    expect(again.buildings).toEqual(config.buildings);
    expect(again.warnings).toEqual(config.warnings);
  });

  it('accepts a path relative to the working directory', async () => {
    const fromRelative = await loadConfig(relative(process.cwd(), REAL_DATA_DIR));

    expect(fromRelative.dataDir).toBe(REAL_DATA_DIR);
    expect(fromRelative.buildings.map((building) => building.id)).toEqual(
      config.buildings.map((building) => building.id),
    );
  });
});

describe('cross-reference validation', () => {
  it("rejects a car whose spec is not in elevator-specs.json", async () => {
    const building = baseBuilding();
    (building['banks'] as { cars: { spec: string }[] }[])[0]!.cars[0]!.spec = 'geared-tration';
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.unknownSpec]);
    expect(error.issues[0]?.path).toBe('banks[0].cars[0].spec');
    expect(error.issues[0]?.file).toContain('tower.json');
    expect(error.message).toContain('unknown elevator class "geared-tration"');
    expect(error.message).toContain('geared-traction');
  });

  it('rejects a bank serving a floor the building does not declare', async () => {
    const building = baseBuilding();
    (building['banks'] as { servesFloors: string[] }[])[0]!.servesFloors = ['G', '2', '9'];
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.unknownFloor]);
    expect(error.issues[0]?.path).toBe('banks[0].servesFloors[2]');
    expect(error.message).toContain('serves floor "9"');
    expect(error.message).toContain('Known floor ids: G, 2, 3');
  });

  it('rejects an access zone covering a floor the building does not declare', async () => {
    const building = baseBuilding();
    building['accessZones'] = [{ id: 'exec', floors: ['30'], credentialGroups: ['exec'] }];
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.unknownFloor]);
    expect(error.issues[0]?.path).toBe('accessZones[0].floors[0]');
    expect(error.message).toContain('access zone "exec"');
  });

  it('rejects a building whose trafficProfile is not in traffic-profiles.json', async () => {
    const building = baseBuilding();
    building['trafficProfile'] = 'office-prestigious';
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.unknownTrafficProfile]);
    expect(error.issues[0]?.path).toBe('trafficProfile');
    expect(error.message).toContain('unknown traffic profile "office-prestigious"');
    expect(error.message).toContain('office-standard');
  });

  it('rejects a floor pair that is not one deck separation apart', async () => {
    const building = await readReal(join(DATA_FILES.buildingsDir, 'vertical-city.json'));
    // Move sky lobby A's upper deck floor 10 cm out of reach.
    const floors = building['floors'] as { id: string; heightM: number }[];
    const upper = floors.find((floor) => floor.id === '27');
    if (upper !== undefined) upper.heightM = 110.2;
    const dir = await makeDataDir({ buildings: { 'vertical-city.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.deckSeparationMismatch]);
    expect(error.issues[0]?.path).toBe('banks[0].servesFloorPairs[1]');
    expect(error.message).toContain('4.6 m apart');
    expect(error.message).toContain('decks 4.5 m apart');
    // One issue for eight identical shuttles, not eight.
    expect(error.message).toContain('S1, S2');
  });

  it('rejects a floor pair whose floors are not in servesFloors', async () => {
    const building = baseBuilding();
    const bank = (building['banks'] as Record<string, unknown>[])[0]!;
    bank['servesFloorPairs'] = [['2', '3']];
    bank['servesFloors'] = ['G', '2'];
    (bank['cars'] as Record<string, unknown>[])[0] = {
      id: 'A',
      spec: 'ultra-high-speed',
      doubleDeck: true,
      deckSeparationM: 4,
      ratedLoadLb: 4000,
      ratedLoadLbPerDeck: 2000,
    };
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.floorPair]);
    expect(error.message).toContain('the upper deck floor "3" is not listed in servesFloors');
  });

  it('rejects a double-deck car with no deck separation', async () => {
    const building = baseBuilding();
    (building['banks'] as { cars: Record<string, unknown>[] }[])[0]!.cars[0] = {
      id: 'A',
      spec: 'ultra-high-speed',
      doubleDeck: true,
    };
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.deckConfiguration]);
    expect(error.issues[0]?.path).toBe('banks[0].cars[0].deckSeparationM');
  });

  it('rejects a per-floor traffic profile that does not exist', async () => {
    const building = baseBuilding();
    (building['floors'] as Record<string, unknown>[])[2]!['trafficProfile'] = 'residentail';
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.unknownTrafficProfile]);
    expect(error.issues[0]?.path).toBe('floors["3"].trafficProfile');
    expect(error.message).toContain('residential');
  });

  it('rejects a dispatcher weighting a cost term that does not exist', async () => {
    const dispatchers = await readReal(DATA_FILES.dispatcherProfiles);
    (dispatchers['profiles'] as { id: string; weights: Record<string, number> }[])[0]!.weights[
      'distanceTravelledd'
    ] = 1;

    const error = (() => {
      try {
        parseDispatcherProfiles(dispatchers, 'dispatcher-profiles.json');
      } catch (thrown) {
        if (thrown instanceof ConfigError) return thrown;
        throw thrown;
      }
      throw new Error('expected a ConfigError');
    })();

    expect(error.issues[0]?.path).toBe('profiles[0].weights.distanceTravelledd');
    expect(error.message).toContain('unknown cost term "distanceTravelledd"');
    expect(error.message).toContain('starvation');
  });

  it('rejects duplicate building ids across files', async () => {
    const dir = await makeDataDir({
      buildings: { 'a.json': baseBuilding(), 'b.json': baseBuilding() },
    });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.duplicateId]);
    expect(error.message).toContain('duplicate building id "tower"');
    expect(error.message).toContain('a.json');
  });

  it('reports every problem in one pass rather than stopping at the first', async () => {
    const building = baseBuilding();
    building['trafficProfile'] = 'nope';
    (building['banks'] as { servesFloors: string[]; cars: { spec: string }[] }[])[0]!.servesFloors =
      ['G', '2', '77'];
    (building['banks'] as { cars: { spec: string }[] }[])[0]!.cars[0]!.spec = 'nope-either';
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([
      ISSUE_CODES.unknownTrafficProfile,
      ISSUE_CODES.unknownFloor,
      ISSUE_CODES.unknownSpec,
    ]);
    expect(error.message).toContain('3 problems');
  });
});

describe('schema validation messages', () => {
  it('names the file, the field and what was expected', async () => {
    const building = baseBuilding();
    (building['floors'] as { population: unknown }[])[1]!.population = 'ninety';
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.schema]);
    expect(error.issues[0]?.path).toBe('floors[1].population');
    expect(error.issues[0]?.message).toContain('expected number');
    expect(error.message).toContain('tower.json');
    expect(error.message).toContain('data/buildings/README.md');
  });

  it('catches a misspelled field instead of silently ignoring it', async () => {
    const building = baseBuilding();
    (building['banks'] as { cars: Record<string, unknown>[] }[])[0]!.cars[0]!['ratedSpeedMPS'] = 2;
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.schema]);
    expect(error.message).toContain('ratedSpeedMPS');
    expect(error.issues[0]?.path).toBe('banks[0].cars[0]');
  });

  it('rejects a directional split that does not sum to one', async () => {
    const traffic = await readReal(DATA_FILES.trafficProfiles);
    (traffic['profiles'] as { directionalSplit: Record<string, number> }[])[0]!.directionalSplit = {
      incoming: 0.9,
      outgoing: 0.05,
      interfloor: 0.1,
    };
    const dir = await makeDataDir({ traffic });

    const error = await expectLoadError(dir);

    expect(error.message).toContain('must sum to 1');
    expect(error.issues[0]?.path).toBe('profiles[0].directionalSplit');
  });

  it('rejects a building that declares no floors', async () => {
    const building = baseBuilding();
    delete building['floors'];
    const dir = await makeDataDir({ buildings: { 'tower.json': building } });

    const error = await expectLoadError(dir);

    expect(error.message).toContain('no floors declared');
  });
});

describe('filesystem diagnostics', () => {
  it('reports a missing file with the expected layout', async () => {
    const dir = await makeDataDir({ specs: null });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.missingFile]);
    expect(error.issues[0]?.file).toContain(DATA_FILES.elevatorSpecs);
    expect(error.message).toContain('file not found');
    expect(error.message).toContain('traffic-profiles.json');
  });

  it('reports malformed JSON with the parser message', async () => {
    const dir = await makeDataDir({ dispatchers: '{ "version": 1, }' });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.invalidJson]);
    expect(error.issues[0]?.file).toContain(DATA_FILES.dispatcherProfiles);
    expect(error.message).toContain('not valid JSON');
  });

  it('reports a missing buildings directory', async () => {
    const dir = await makeDataDir({ buildings: null });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.missingFile]);
    expect(error.message).toContain('buildings directory not found');
  });

  it('reports an empty buildings directory', async () => {
    const dir = await makeDataDir({ buildings: {} });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.noBuildings]);
    expect(error.message).toContain('no building configs found');
  });

  it('collects problems from several files at once', async () => {
    const dir = await makeDataDir({ specs: null, traffic: null });

    const error = await expectLoadError(dir);

    expect(codes(error)).toEqual([ISSUE_CODES.missingFile, ISSUE_CODES.missingFile]);
    expect(error.message).toContain('2 problems');
  });
});

describe('resolveBuilding', () => {
  let specs: ElevatorSpecs;

  beforeAll(async () => {
    specs = parseElevatorSpecs(await readReal(DATA_FILES.elevatorSpecs), DATA_FILES.elevatorSpecs);
  });

  it('resolves the compact floorRanges form end to end', () => {
    const building = parseBuilding(
      {
        id: 'sky-tower',
        name: 'Sky Tower',
        type: 'mixed-use',
        trafficProfile: 'office-standard',
        floors: [{ id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true }],
        floorRanges: [
          {
            fromIndex: 32,
            toIndex: 60,
            startHeightM: 124.0,
            floorToFloorM: 3.2,
            populationPerFloor: 40,
            idPattern: '{index}',
          },
        ],
        banks: [
          {
            id: 'high',
            // `passengerTransferS` is declared because this fixture is `mixed-use`, a type
            // `elevator-specs.json → timing.passengerTransferS` has no row for on purpose. A
            // mixed-use car that declares none is a hard `ConfigError` — see
            // `parse.test.ts` § resolveBuilding resolves passengerTransferS. Incidental to what
            // this test is about (floorRanges), and stated rather than worked around.
            cars: [{ id: 'A', spec: 'high-speed-gearless', passengerTransferS: 1.75 }],
            servesFloors: ['G', '32', '45', '60'],
          },
        ],
      },
      'sky-tower.json',
    );

    const resolved = resolveBuilding(building, specs, {
      file: 'sky-tower.json',
      trafficProfileIds: new Set(['office-standard']),
    });

    expect(resolved.floors).toHaveLength(30);
    expect(resolved.floorsById.get('60')?.heightM).toBe(213.6);
    expect(resolved.floorsByIndex.get(32)?.id).toBe('32');
    expect(resolved.totalPopulation).toBe(29 * 40);
    expect(resolved.banks[0]?.cars[0]?.ratedSpeedMps).toBe(8);
    expect(resolved.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it('warns when the declared totalPopulation disagrees with the floors', () => {
    const building = parseBuilding({ ...baseBuilding(), totalPopulation: 999 }, 'tower.json');

    const resolved = resolveBuilding(building, specs, { file: 'tower.json' });

    expect(resolved.warnings.map((warning) => warning.code)).toEqual([
      WARNING_CODES.populationMismatch,
    ]);
    expect(resolved.totalPopulation).toBe(100);
  });

  it('warns when no floor is an entrance', () => {
    const raw = baseBuilding();
    (raw['floors'] as Record<string, unknown>[])[0]!['isEntrance'] = false;
    const building = parseBuilding(raw, 'tower.json');

    const resolved = resolveBuilding(building, specs, { file: 'tower.json' });

    expect(resolved.warnings.map((warning) => warning.code)).toContain(
      WARNING_CODES.noEntranceFloor,
    );
  });

  it('warns when a car sits outside the reference envelope for its class', () => {
    const raw = baseBuilding();
    (raw['banks'] as { cars: Record<string, unknown>[] }[])[0]!.cars[0] = {
      id: 'A',
      spec: 'hydraulic',
      ratedSpeedMps: 3.0,
      ratedLoadLb: 5000,
    };
    const building = parseBuilding(raw, 'tower.json');

    const resolved = resolveBuilding(building, specs, { file: 'tower.json' });

    expect(resolved.warnings.map((warning) => warning.code)).toEqual([
      WARNING_CODES.speedOutsideClassRange,
      WARNING_CODES.loadOutsideClassRange,
    ]);
    expect(resolved.warnings[0]?.path).toBe('banks[0].cars[0].ratedSpeedMps');
  });
});

describe('crossCheckDispatcherProfiles', () => {
  it('flags a pattern selecting an unauthored dispatcher profile', async () => {
    const dispatchers = parseDispatcherProfiles(
      await readReal(DATA_FILES.dispatcherProfiles),
      'dispatcher-profiles.json',
    );

    const warnings = crossCheckDispatcherProfiles(dispatchers, 'dispatcher-profiles.json');

    expect(warnings.map((warning) => warning.code)).toEqual([
      WARNING_CODES.unknownWeightSetProfile,
    ]);
    expect(warnings[0]?.path).toBe('patternSwitching.weightSetsByPattern.idle');
    expect(warnings[0]?.message).toContain('energy-saver');
  });
});
