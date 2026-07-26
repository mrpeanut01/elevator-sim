/// <reference types="node" />

/**
 * Tests for the pure half of the config module.
 *
 * `loader.test.ts` covers the filesystem entry point and the shipped data. This file
 * covers two properties that are structural rather than behavioural, and that nothing else
 * can observe:
 *
 * 1. **`parse.ts` stays fs-free.** Its whole static import graph must contain no `node:`
 *    specifier, so Phase 4's browser build can import `parseBuilding`/`resolveBuilding`
 *    without `node:fs` reaching its bundle (CLAUDE.md invariant 6).
 * 2. **The module typechecks.** All of it, under the repo's strict flags, with no help
 *    from a `types` field in the consuming tsconfig.
 *
 * Plus the shaft-ordering rule: `heightM` must agree with `index`, or the simulation
 * silently models a building that cannot exist.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseBuilding, parseElevatorSpecs, resolveBuilding } from './parse.js';
import { resolveCar } from './resolveCar.js';
import { ConfigError, ISSUE_CODES } from './schema.js';
import type { ElevatorSpecs, ResolvedBuilding, ResolvedCar } from './types.js';

const CONFIG_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SPECS_FILE = join(REPO_ROOT, 'data', 'elevator-specs.json');

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

// ---------------------------------------------------------------------------
// 1. parse.ts must never reach the filesystem
// ---------------------------------------------------------------------------

/** `from '<spec>'`, bare `import '<spec>'`, and dynamic `import('<spec>')`. */
const SPECIFIER = /\bfrom\s*'([^']*)'|\bimport\s*\(\s*'([^']*)'|(?:^|;)\s*import\s*'([^']*)'/gm;

async function staticSpecifiers(file: string): Promise<string[]> {
  const source = await readFile(file, 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(SPECIFIER)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (spec !== undefined && spec !== '') found.push(spec);
  }
  return found;
}

interface ImportGraph {
  /** Every local module reachable from the entry, as a path relative to `CONFIG_DIR`. */
  readonly modules: string[];
  /** Every bare specifier reachable from the entry. */
  readonly external: string[];
}

/** Walk the static import graph of a TypeScript entry point. */
async function importGraph(entry: string): Promise<ImportGraph> {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    for (const spec of await staticSpecifiers(file)) {
      if (!spec.startsWith('.')) {
        external.add(spec);
        continue;
      }
      // Source is authored with the ESM `.js` extension; the file on disk is `.ts`.
      queue.push(resolvePath(dirname(file), spec.replace(/\.js$/u, '.ts')));
    }
  }

  return {
    modules: [...visited].map((file) => file.slice(CONFIG_DIR.length)).sort(),
    external: [...external].sort(),
  };
}

describe('parse.ts is fs-free so the browser build can use it', () => {
  let graph: ImportGraph;

  beforeAll(async () => {
    graph = await importGraph(join(CONFIG_DIR, 'parse.ts'));
  });

  it('reaches no node: built-in from parse.ts', () => {
    // The regression: `parse.ts` and `loader.ts` were one file, so importing
    // `parseBuilding` statically imported `node:fs/promises`, and whether a viz bundle
    // survived depended on the bundler proving the module side-effect-free.
    expect(graph.external.filter((spec) => spec.startsWith('node:'))).toEqual([]);
  });

  it('depends on zod and nothing else', () => {
    // zod is the only runtime dependency core is permitted.
    expect(graph.external).toEqual(['zod']);
  });

  it('does not reach loader.ts, the one module that imports node:', async () => {
    expect(graph.modules).not.toContain('loader.ts');
    expect(graph.modules).toEqual([
      'expandFloors.ts',
      'parse.ts',
      'resolveCar.ts',
      'schema.ts',
      'types.ts',
    ]);
    // ...and loader.ts is genuinely the file that holds the fs import, so the assertion
    // above is about placement, not about the import having been deleted.
    expect(await staticSpecifiers(join(CONFIG_DIR, 'loader.ts'))).toContain('node:fs/promises');
  });

  it('keeps every other config module fs-free too', async () => {
    for (const name of ['expandFloors.ts', 'resolveCar.ts', 'schema.ts', 'types.ts']) {
      const specifiers = await staticSpecifiers(join(CONFIG_DIR, name));
      expect(specifiers.filter((spec) => spec.startsWith('node:')), name).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The module typechecks
// ---------------------------------------------------------------------------

const run = promisify(execFile);

describe('the config module typechecks under the repo strict flags', () => {
  it('compiles with zero errors', async () => {
    // The regression: `tsc -b` failed with 20 errors in this module (node built-in
    // imports, `structuredClone`, `URL`, and the resulting implicit `any`s) while the
    // test suite was green, because vitest transpiles without typechecking. `npm run
    // build` and `npm run typecheck` are both `tsc -b`, so the repo could not build.
    const dir = await mkdtemp(join(tmpdir(), 'elevator-sim-typecheck-'));
    tempDirs.push(dir);
    const project = join(dir, 'tsconfig.json');
    await writeFile(
      project,
      JSON.stringify({
        extends: join(REPO_ROOT, 'tsconfig.base.json'),
        compilerOptions: {
          // The base config is set up for `tsc -b`; this is a one-shot check.
          composite: false,
          incremental: false,
          declaration: false,
          declarationMap: false,
          sourceMap: false,
          noEmit: true,
        },
        // Deliberately no `types`/`typeRoots`: the module must carry its own declaration
        // of the ambient types it needs rather than depend on the consumer's tsconfig.
        include: [join(CONFIG_DIR, '**/*.ts')],
      }),
      'utf8',
    );

    const tsc = join(REPO_ROOT, 'node_modules', '.bin', 'tsc');
    let output: string;
    try {
      const result = await run(tsc, ['-p', project, '--pretty', 'false'], { cwd: REPO_ROOT });
      output = `${result.stdout}${result.stderr}`;
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
    }

    expect(output.trim()).toBe('');
  }, 120_000);
});

// ---------------------------------------------------------------------------
// 3. heightM must agree with index
// ---------------------------------------------------------------------------

/** A building whose floors are given explicit heights, with one bank over all of them. */
function towerWith(floors: readonly { id: string; index: number; heightM: number }[]): unknown {
  return {
    id: 'tower',
    name: 'Tower',
    type: 'office',
    trafficProfile: 'office-standard',
    floors: floors.map((floor, position) => ({
      ...floor,
      population: position === 0 ? 0 : 50,
      ...(position === 0 ? { isEntrance: true } : {}),
    })),
    banks: [
      {
        id: 'main',
        servesFloors: floors.map((floor) => floor.id),
        cars: [{ id: 'A', spec: 'geared-traction', ratedLoadLb: 2500 }],
      },
    ],
  };
}

function expectResolveError(building: unknown, specs: ElevatorSpecs): ConfigError {
  try {
    resolveBuilding(parseBuilding(building, 'tower.json'), specs, { file: 'tower.json' });
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected resolveBuilding to throw a ConfigError');
}

describe('resolveBuilding rejects a shaft whose heights disagree with its floor order', () => {
  let specs: ElevatorSpecs;

  beforeAll(async () => {
    specs = parseElevatorSpecs(JSON.parse(await readFile(SPECS_FILE, 'utf8')), SPECS_FILE);
  });

  it('accepts a strictly ascending shaft', () => {
    const resolved = resolveBuilding(
      parseBuilding(
        towerWith([
          { id: 'G', index: 0, heightM: 0 },
          { id: '2', index: 2, heightM: 5 },
          { id: '3', index: 3, heightM: 10 },
        ]),
        'tower.json',
      ),
      specs,
      { file: 'tower.json' },
    );

    expect(resolved.floors.map((floor) => floor.heightM)).toEqual([0, 5, 10]);
    expect(resolved.warnings).toEqual([]);
  });

  it('rejects a floor that sits below the floor one index down', () => {
    // The regression: `index` is the dispatcher's up/down ordering and `heightM` is the
    // physics travel distance, so this building loaded clean and then modelled a car
    // "travelling up" from 2 to 3 across −5 m — negative travel times, reversal cost
    // terms firing on the wrong legs, and an RTT oracle that cannot be reconciled.
    const error = expectResolveError(
      towerWith([
        { id: 'G', index: 0, heightM: 0 },
        { id: '2', index: 2, heightM: 10 },
        { id: '3', index: 3, heightM: 5 },
      ]),
      specs,
    );

    expect(error.issues.map((issue) => issue.code)).toEqual([ISSUE_CODES.floorHeightOrder]);
    expect(error.issues[0]?.path).toBe('floors["3"].heightM');
    expect(error.issues[0]?.file).toBe('tower.json');
    // Both floors named, with their indices and their heights, so the fix is obvious.
    expect(error.message).toContain('floor "3" (index 3) sits at 5 m');
    expect(error.message).toContain('below floor "2" (index 2), which sits at 10 m');
  });

  it('rejects two floors at the same height', () => {
    const error = expectResolveError(
      towerWith([
        { id: 'G', index: 0, heightM: 0 },
        { id: '2', index: 2, heightM: 5 },
        { id: '3', index: 3, heightM: 5 },
      ]),
      specs,
    );

    expect(error.issues.map((issue) => issue.code)).toEqual([ISSUE_CODES.floorHeightOrder]);
    expect(error.message).toContain('the same height as floor "2" (index 2)');
  });

  it('reports every offending pair, not just the first', () => {
    const error = expectResolveError(
      towerWith([
        { id: 'G', index: 0, heightM: 0 },
        { id: '2', index: 2, heightM: 10 },
        { id: '3', index: 3, heightM: 5 },
        { id: '4', index: 4, heightM: 2 },
      ]),
      specs,
    );

    expect(error.issues.map((issue) => issue.path)).toEqual([
      'floors["3"].heightM',
      'floors["4"].heightM',
    ]);
  });

  it('checks floors that came out of a floorRange, not just explicit ones', () => {
    // A mistyped `startHeightM` on a range is the likely way this happens in practice.
    const building = parseBuilding(
      {
        id: 'sky-tower',
        name: 'Sky Tower',
        type: 'office',
        trafficProfile: 'office-standard',
        floors: [
          { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
          { id: '5', index: 5, heightM: 100, population: 40 },
        ],
        floorRanges: [
          {
            fromIndex: 6,
            toIndex: 8,
            startHeightM: 50,
            floorToFloorM: 4,
            populationPerFloor: 40,
          },
        ],
        banks: [
          {
            id: 'main',
            servesFloors: ['G', '5', '6', '7', '8'],
            cars: [{ id: 'A', spec: 'geared-traction', ratedLoadLb: 2500 }],
          },
        ],
      },
      'sky-tower.json',
    );

    let error: ConfigError | undefined;
    try {
      resolveBuilding(building, specs, { file: 'sky-tower.json' });
    } catch (thrown) {
      if (!(thrown instanceof ConfigError)) throw thrown;
      error = thrown;
    }

    expect(error?.issues.map((issue) => issue.code)).toEqual([ISSUE_CODES.floorHeightOrder]);
    expect(error?.issues[0]?.path).toBe('floors["6"].heightM');
    expect(error?.message).toContain('floor "6" (index 6) sits at 50 m');
  });

  it('is fatal, not advisory: the building never resolves', () => {
    const error = expectResolveError(
      towerWith([
        { id: 'G', index: 0, heightM: 0 },
        { id: '2', index: 2, heightM: 10 },
        { id: '3', index: 3, heightM: 5 },
      ]),
      specs,
    );

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toContain('Invalid building "tower"');
  });
});

// ---------------------------------------------------------------------------
// 4. resolveBuilding resolves the passenger transfer time onto every car
// ---------------------------------------------------------------------------

/**
 * REGRESSION. `resolveCar` derives `passengerTransferS` from
 * `specs.timing.passengerTransferS[buildingType]` and throws `missing-passenger-transfer` for a
 * type the table has no row for — but `resolveBuilding` did not pass the type down, so **every
 * `ResolvedCar` `loadConfig` returned had the field absent** and neither the derivation nor its
 * error was reachable through the real loader. Only `Simulation` re-derived the value.
 *
 * That is the same shape as the defect it was meant to close: a number that exists in the data and
 * reaches nothing. It also means any other consumer of `ResolvedCar` — an optimizer, a report, the
 * analytical path — silently got `undefined` where it should have got either the right answer or an
 * exception. These tests assert the value is present at the *config* layer, which is the layer
 * whose job it is to answer "what transfer time does this car use".
 */
describe('resolveBuilding resolves passengerTransferS onto every ResolvedCar', () => {
  let specs: ElevatorSpecs;

  beforeAll(async () => {
    specs = parseElevatorSpecs(JSON.parse(await readFile(SPECS_FILE, 'utf8')), SPECS_FILE);
  });

  async function resolveShipped(id: string): Promise<ResolvedBuilding> {
    const file = join(REPO_ROOT, 'data', 'buildings', `${id}.json`);
    return resolveBuilding(parseBuilding(JSON.parse(await readFile(file, 'utf8')), file), specs, {
      file,
    });
  }

  const carsOf = (building: ResolvedBuilding): readonly ResolvedCar[] =>
    building.banks.flatMap((bank) => bank.cars);

  it('gives Garden Apartments’ cars the residential 1.75 s, off the resolved config alone', () => {
    // The assertion the reviewer asked for by name, and the one that fails if `resolveBuilding`
    // stops passing the building type. Note it never constructs a `Simulation`: the point is that
    // the config layer answers on its own.
    return resolveShipped('garden-apartments').then((garden) => {
      expect(garden.type).toBe('residential');
      for (const car of carsOf(garden)) {
        expect(Object.hasOwn(car, 'passengerTransferS'), car.id).toBe(true);
        expect(car.passengerTransferS, car.id).toBe(1.75);
        expect(car.passengerTransferS, car.id).toBe(specs.timing.passengerTransferS.residential);
      }
    });
  });

  it('resolves every shipped building’s cars, by type or by per-car declaration', async () => {
    const expected: Record<string, readonly number[]> = {
      'garden-apartments': [1.75],
      'midtown-office': [1.2],
      'secure-tower': [1.2],
      // `mixed-use` has no row in the reference table on purpose, so these declare per car.
      'mixed-use-high-rise': [1.2, 1.75],
      'vertical-city': [1.2, 1.5, 1.75],
    };

    for (const [id, values] of Object.entries(expected)) {
      const building = await resolveShipped(id);
      const cars = carsOf(building);
      expect(cars.length, id).toBeGreaterThan(0);
      for (const car of cars) {
        expect(Object.hasOwn(car, 'passengerTransferS'), `${id}/${car.id}`).toBe(true);
      }
      expect([...new Set(cars.map((car) => car.passengerTransferS))].sort(), id).toEqual(values);
    }
  }, 30_000);

  it('refuses a mixed-use building whose cars declare none, one issue per car', async () => {
    // The error `resolveCar` has always been able to raise, now reachable through the loader. It
    // must be an error and never a default: the office value on a residential car understates the
    // round trip by ~6 %, which is the optimistic direction.
    const file = join(REPO_ROOT, 'data', 'buildings', 'mixed-use-high-rise.json');
    const authored = JSON.parse(await readFile(file, 'utf8')) as {
      banks: { cars: Record<string, unknown>[] }[];
    };
    for (const bank of authored.banks) {
      for (const car of bank.cars) delete car['passengerTransferS'];
    }

    let error: ConfigError | undefined;
    try {
      resolveBuilding(parseBuilding(authored, file), specs, { file });
    } catch (thrown) {
      if (!(thrown instanceof ConfigError)) throw thrown;
      error = thrown;
    }

    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.issues).toHaveLength(16);
    for (const issue of error?.issues ?? []) {
      expect(issue.code).toBe(ISSUE_CODES.missingPassengerTransfer);
      expect(issue.path).toMatch(/^banks\[\d+]\.cars\[\d+]\.passengerTransferS$/);
    }
    // Actionable: names the type, the values to choose from, and why refusing to guess.
    expect(error?.issues[0]?.message).toContain('mixed-use');
    expect(error?.issues[0]?.message).toContain('residential 1.75');
    expect(error?.issues[0]?.message).toContain('Refusing to default');
  });

  it('leaves it absent when no building type is supplied, rather than guessing', () => {
    // `resolveCar`'s documented contract, still intact: absent means "nobody has said", never
    // "assume office". `resolveBuilding` always has a type, so this is the direct-caller path.
    const car = resolveCar(
      { id: 'A', spec: 'geared-traction', ratedLoadLb: 2500 },
      specs,
      { file: 'x.json' },
    );
    expect(Object.hasOwn(car, 'passengerTransferS')).toBe(false);
  });
});
