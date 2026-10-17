/**
 * **Every optional field a shipped building declares reaches a shipped code path** — GitHub issue
 * **#232**, acceptance criterion 4: *"Validation rejects a building whose configuration reaches no
 * shipped code path."*
 *
 * ## Why this exists
 *
 * The repository's signature defect — a behaviour that is configurable, unit-tested in isolation
 * and consulted by no shipped path — has shipped twice in `data/`: `destination-eta` with a term
 * weighted at zero, and `accessZones`, loaded and cross-validated and unable to move a result.
 * `vertical-city` then carried eight double-deck cars that nothing consulted for months. The schema
 * cannot catch it, because a dead field is schema-valid by construction; `sim/seam.test.ts` and
 * `sim/searchSpaceLiveness.test.ts` guard dispatcher profiles, and nothing guarded a building's own
 * fields. With five towers still to land under #232 AC1, this is the check each of them meets.
 *
 * ## What it asserts
 *
 * The declared set is **derived**: every shipped `data/buildings/*.json` is walked against
 * `buildingConfigSchema` itself, and every key the schema marks optional and the file actually
 * declares becomes a field path such as `banks[].cars[].doubleDeck`. Nothing here transcribes a
 * list of fields, so a field added to the schema tomorrow and used by a building the day after is
 * red until it is registered. An empty array declares nothing (`accessZones: []` is the absent
 * case spelled out) and is not counted. Every declared path must have exactly one entry in
 * {@link REACH}, and every entry must be declared by some shipped building, so the register cannot
 * go stale in either direction.
 *
 * An entry is one of three kinds:
 *
 * - **`legs`** — the field changes a run. It names its non-test reader, **and** a witness: the
 *   building is run on a short deterministic slice with and without the field (removed through the
 *   same `parseBuilding`/`resolveBuilding` path `loadConfig` takes), and the per-passenger legs
 *   must differ. Legs, not a window statistic, on § D177/§ D219's reasoning: two configurations
 *   can share an AWT and still be different journeys. `witness: 'each'` runs every declaring
 *   building, for fields whose effect is conditional on the building (a descent cap that only
 *   binds above 300 m of travel); otherwise the named building is run.
 * - **`reader`** — the field reaches a non-test path that by design changes no leg: a cross-check
 *   the loader refuses or warns on (`totalPopulation`, `deckSeparationM`), the floor plate
 *   (`config/floorArea.ts`, which says in its own docstring that nothing in `sim/` reads it), or
 *   floor expansion. It names the reader, and that is all it claims.
 * - **`display`** — author's prose and labels, with the reason. No reader is required, and the
 *   allow-list is short on purpose.
 *
 * A reader is written `path/to/file.ts#symbol`. It must be a non-test file, `symbol` must be a
 * top-level declaration in it, and the field's own key must appear as an identifier in that
 * declaration's **code** — comments are stripped first, so a docstring that mentions a field is
 * not a reader. A declaration runs from its line to the next line that opens another top-level
 * declaration or docstring at column 0, which is how every module in this tree is written.
 *
 * ## Findings
 *
 * A witness that produces identical legs is a finding, not a test to loosen. {@link KNOWN_INERT}
 * registers each one found on a shipped building with a pointer to #232, and asserts it in both
 * directions: an entry whose run starts to differ is stale and goes red too. The data is not edited
 * here; whether the field is removed, re-authored or the reader extended is the owner's call.
 *
 * The three entries below were ruled on in GitHub issue #625 (a decision swarm on 2026-10-17): each
 * is kept as authored intent, permanently, and is not owed. A new entry is owed until it is ruled.
 *
 * Three were found on the tree this landed on (2026-10-17): `ctf-class-reference`'s pressurised
 * shuttle cabins, `burj-class-reference`'s four escalators, and `st-jude-hospital`'s bed-car duty.
 * Each entry states its cause and how far that cause is measured.
 *
 * ## Cost
 *
 * The register and the negative controls are static and take milliseconds. The witnesses run 300 s
 * slices — the shortest run a shipped demand template accepts — with baselines shared per building,
 * and measured about 14 s of test time on a quiet container, most of it the three supertalls that
 * declare escalators or double decks.
 *
 * ## Negative controls
 *
 * The audit is a pure function over a declared set, a register and a source reader, and it is run
 * against injected defects: a declared field with no entry, a reader that does not read the field,
 * a reader that is a test file, a stale entry, and a schema-valid field that genuinely changes no
 * leg (a pressurised cabin on a building too short for the descent cap to bind).
 *
 * ## Where the record lives
 *
 * This docstring, per [§ D405](../../../../DECISIONS.md): the rule is the standing requirement in
 * `docs/05-roadmap.md` pointed at `data/`, mechanised rather than moved.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildingConfigSchema,
  loadConfig,
  parseBuilding,
  resolveBuilding,
  runSimulation,
} from '@elevator-sim/core';
import type { LoadedConfig, SimulationResult } from '@elevator-sim/core';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const BUILDINGS_DIR = join(ROOT, 'data', 'buildings');

/** The short slice a witness runs: the shortest run a shipped demand template accepts (a 300 s peak hold). */
const SLICE_S = 300;
const SEED = 20_261_017;
const PROFILE = 'eta';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface LegsEntry {
  readonly kind: 'legs';
  readonly reader: string;
  /** `'each'` runs every declaring building; a building id runs that one. */
  readonly witness: 'each' | string;
  /** Field paths removed together with this one, where the loader refuses one without the other. */
  readonly removeAlso?: readonly string[];
  readonly why: string;
}
interface ReaderEntry {
  readonly kind: 'reader';
  readonly reader: string;
  readonly why: string;
}
interface DisplayEntry {
  readonly kind: 'display';
  readonly why: string;
}
type Entry = LegsEntry | ReaderEntry | DisplayEntry;

const CORE = 'packages/core/src';

/**
 * The register. Keyed by field path; `$comment` at any depth is matched by its last segment.
 */
const REACH: ReadonlyMap<string, Entry> = new Map<string, Entry>([
  ['$comment', { kind: 'display', why: 'Author provenance and CITED/CHOSEN notes; prose, never configuration.' }],
  ['notes', { kind: 'display', why: 'Author prose; round-tripped by the viz authoring layer, never simulated.' }],
  ['banks[].name', { kind: 'display', why: 'A bank title for the screens; ids, not names, are the references.' }],
  ['floors[].label', { kind: 'display', why: 'A floor label for the screens; floor ids are the references.' }],
  ['floorRanges[].label', { kind: 'display', why: 'Expanded into floors[].label, which is display.' }],
  ['transportModes[].name', { kind: 'display', why: 'A transport-mode title for the screens.' }],

  ['floors', { kind: 'reader', reader: `${CORE}/config/expandFloors.ts#expandFloors`, why: 'The explicit floor form; one of floors or floorRanges is required.' }],
  ['floorRanges', { kind: 'reader', reader: `${CORE}/config/expandFloors.ts#expandFloors`, why: 'The compact floor form, expanded into floors.' }],
  ['floorRanges[].idPattern', { kind: 'reader', reader: `${CORE}/config/expandFloors.ts#expandFloors`, why: 'Names the expanded floors, which every other reference uses.' }],
  ['floorRanges[].grossAreaPerFloorM2', { kind: 'reader', reader: `${CORE}/config/expandFloors.ts#expandFloors`, why: 'Expanded into floors[].grossAreaM2: the floor plate, which changes no leg (config/floorArea.ts).' }],
  ['grossAreaPerFloorM2', { kind: 'reader', reader: `${CORE}/config/parse.ts#resolveBuilding`, why: 'The building plate, applied to floors that state none; changes no leg (config/floorArea.ts).' }],
  ['floors[].grossAreaM2', { kind: 'reader', reader: `${CORE}/config/floorArea.ts#resolveFloorArea`, why: 'The floor plate and the core the hoistways take out of it; changes no leg by design (§ D601).' }],
  ['totalPopulation', { kind: 'reader', reader: `${CORE}/config/parse.ts#resolveBuilding`, why: 'A cross-check: warned when it disagrees with the floor sum, and the floor sum is used.' }],
  ['banks[].cars[].deckSeparationM', { kind: 'reader', reader: `${CORE}/config/parse.ts#resolveBuilding`, why: 'A cross-check: refused when a served floor pair is not exactly this far apart. The deck geometry the run uses comes from the floor heights.' }],
  ['floors[].isEntrance', { kind: 'reader', reader: `${CORE}/model/building.ts#Building`, why: 'Entrance floors anchor demand; removing them all leaves no building, so a removal witness cannot run.' }],
  ['floors[].isTransferFloor', { kind: 'reader', reader: `${CORE}/model/building.ts#Building`, why: 'Sky lobbies, where a journey may change banks; removing them disconnects the buildings that declare them.' }],
  ['banks[].cars[].ratedSpeedMps', { kind: 'reader', reader: `${CORE}/config/resolveCar.ts#resolveCar`, why: 'Overrides the class default; every shipped car declares it.' }],
  ['banks[].cars[].ratedLoadLb', { kind: 'reader', reader: `${CORE}/config/resolveCar.ts#resolveCar`, why: 'Overrides the class default; every shipped car declares it.' }],
  ['banks[].cars[].doorType', { kind: 'reader', reader: `${CORE}/config/resolveCar.ts#resolveCar`, why: 'Selects the door timings; every shipped car declares it.' }],
  ['transportModes[].kind', { kind: 'reader', reader: `${CORE}/sim/stairs.ts#stairsIndexOf`, why: 'Stairs are offered as a choice, escalators are structural; a stairs mode cannot lose its kind and still load.' }],
  ['transportModes[].use', { kind: 'reader', reader: `${CORE}/sim/stairs.ts#stairsOfferFor`, why: 'The stairs propensity; required on a stairs mode, so a removal witness cannot load.' }],

  ['transportModes', { kind: 'legs', reader: `${CORE}/traffic/route.ts#routeTopologyOf`, witness: 'each', why: 'Escalators and stairs carry journeys the cars would otherwise carry.' }],
  ['accessZones', { kind: 'legs', reader: `${CORE}/traffic/generator.ts#permittedGroupsByFloor`, witness: 'each', why: 'Credentials restrict who may be carried where; #232 records this field once loading, cross-validating and moving no result.' }],
  ['banks[].cars[].doubleDeck', {
    kind: 'legs',
    reader: `${CORE}/model/car/car.ts#Car`,
    witness: 'each',
    removeAlso: ['banks[].cars[].deckSeparationM', 'banks[].cars[].ratedLoadLbPerDeck', 'banks[].servesFloorPairs'],
    why: 'One stop opens onto both floors of a pair; #232 records vertical-city carrying this pairing for months with nothing consulting it.',
  }],
  ['banks[].servesFloorPairs', {
    kind: 'legs',
    reader: `${CORE}/model/bank.ts#Bank`,
    witness: 'vertical-city',
    removeAlso: ['banks[].cars[].doubleDeck', 'banks[].cars[].deckSeparationM', 'banks[].cars[].ratedLoadLbPerDeck'],
    why: 'The floor pairs a double-deck bank stops at; it cannot be removed without the decks it pairs.',
  }],
  ['banks[].cars[].ratedLoadLbPerDeck', {
    kind: 'legs',
    reader: `${CORE}/model/car/car.ts#Car`,
    witness: 'vertical-city',
    removeAlso: ['banks[].cars[].doubleDeck', 'banks[].cars[].deckSeparationM', 'banks[].servesFloorPairs'],
    why: 'The per-deck 80 % design load; it cannot be removed without the decks it loads.',
  }],
  ['banks[].cars[].cabinPressurised', { kind: 'legs', reader: `${CORE}/config/resolveCar.ts#resolveCar`, witness: 'each', why: 'Lifts the air-pressure descent cap, which binds only above 300 m of travel and only on a car faster than the cap.' }],
  ['banks[].cars[].descentSpeedMps', { kind: 'legs', reader: `${CORE}/model/car/car.ts#Car`, witness: 'each', why: 'A machine slower down than up; binds only when it is below every other descent limit.' }],
  ['banks[].cars[].duty', { kind: 'legs', reader: `${CORE}/model/car/car.ts#Car`, witness: 'each', why: 'A bed or goods car serves only riders of that duty.' }],
  ['banks[].cars[].passengerTransferS', {
    kind: 'legs',
    reader: `${CORE}/model/car/car.ts#Car`,
    witness: 'one-wtc-class-reference',
    why:
      'Boarding time per rider, overriding the building-type default. On the seven mixed-use buildings ' +
      'that declare it the loader refuses the car without it (elevator-specs.json has no mixed-use ' +
      'default), so the witness is the one office tower that declares it.',
  }],
  ['floors[].trafficProfile', { kind: 'legs', reader: `${CORE}/traffic/generator.ts#profileResolver`, witness: 'one-wtc-class-reference', why: 'A floor whose demand follows another profile than the building.' }],
  ['floorRanges[].trafficProfile', { kind: 'legs', reader: `${CORE}/config/expandFloors.ts#expandFloors`, witness: 'mixed-use-high-rise', why: 'Expanded into floors[].trafficProfile, which moves demand.' }],
]);

/**
 * Shipped buildings on which a `legs` field produces identical legs with and without it.
 *
 * Each is a finding against #232 AC4, registered rather than fixed: the data is not edited by this
 * check. Asserted both ways — an entry whose run starts to differ fails as stale.
 */
const KNOWN_INERT: ReadonlyMap<string, { readonly issue: string; readonly why: string }> = new Map([
  [
    'ctf-class-reference:banks[].cars[].cabinPressurised',
    {
      issue: '#232',
      why:
        'The shuttle cars declare cabinPressurised: true and descentSpeedMps: 10. Pressurising lifts ' +
        'the 10 m/s air-pressure cap, and the authored descent limit then binds at the same 10 m/s ' +
        '(config/resolveCar.ts#descentSpeedOf takes the lower), so the cabin buys nothing. The ' +
        'loader now says so: since GitHub issue #625, pressurisation-buys-nothing compares the ' +
        'effective descent with and without the cabin, and is raised on this shuttle. The data is ' +
        'unchanged, so the field stays inert. Identical legs measured at 300, 1 800 and 7 200 s. ' +
        'Kept on purpose (#625): without it the air-pressure cap re-imposes 10 m/s and ' +
        'descentSpeedMps becomes the dead field instead (core/src/sim/directionalSpeedSeam.test.ts). ' +
        'Permanent; not owed.',
    },
  ],
  [
    'burj-class-reference:transportModes',
    {
      issue: '#232',
      why:
        'Its four escalators join G-1, 43-44, 76-77 and 123-124. Routing uses them: 832 of the ' +
        '27 060 floor-pair shortest routes, pinned in viz/src/record/burjReference.test.ts. The ' +
        'demand the tree ships never takes them: identical legs at 300, 1 800 and 7 200 s under ' +
        'eta. The cause is unmeasured; a plausible guess is that those routes start or end on ' +
        'levels the shipped traffic does not populate. Kept as the reference tower\'s plan (#625). ' +
        'Permanent; not owed. Revisit only if a demand-weighted count is zero under every shipped ' +
        'dispatcher and template.',
    },
  ],
  [
    'st-jude-hospital:banks[].cars[].duty',
    {
      issue: '#232',
      why:
        'Duty binds dispatch only through the dutyMismatch cost term (§ D549), and no shipped ' +
        'dispatcher profile weights it, so the bed car is dispatched exactly as a passenger car. ' +
        'The trace changes (riders are drawn with duties) and no leg does. It is live under a ' +
        'profile that weights the term, which sim/searchSpaceLiveness.test.ts executes and ' +
        'viz/src/authoring/stJudeDuty.test.ts pins (§ D1290); the case below goes red when a ' +
        'shipped profile starts weighting it. Intentional and permanent (#625): inert only under ' +
        'the profiles the tree ships.',
    },
  ],
]);

// ---------------------------------------------------------------------------------------------
// The declared set, derived from the schema
// ---------------------------------------------------------------------------------------------

interface ZodLike {
  readonly _zod: { readonly def: Record<string, unknown> & { readonly type: string } };
  safeParse(value: unknown): { readonly success: boolean };
}

function unwrap(schema: ZodLike): ZodLike {
  let current = schema;
  for (;;) {
    const def = current._zod.def;
    if (def.type === 'optional' || def.type === 'nullable' || def.type === 'default') {
      current = def['innerType'] as ZodLike;
    } else if (def.type === 'pipe') {
      current = def['in'] as ZodLike;
    } else {
      return current;
    }
  }
}

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every optional key a building declares, as field paths; keys the schema does not know too. */
function declaredFields(building: Json, schema: ZodLike): {
  readonly optional: ReadonlySet<string>;
  readonly unknown: ReadonlySet<string>;
} {
  const optional = new Set<string>();
  const unknown = new Set<string>();
  const walk = (value: Json, at: ZodLike, path: string): void => {
    const node = unwrap(at);
    const def = node._zod.def;
    if (def.type === 'array' && Array.isArray(value)) {
      for (const item of value) walk(item, def['element'] as ZodLike, `${path}[]`);
      return;
    }
    if (def.type === 'union' && isObject(value)) {
      const options = def['options'] as readonly ZodLike[];
      const fits = options.find((option) => option.safeParse(value).success) ?? options[0];
      if (fits !== undefined) walk(value, fits, path);
      return;
    }
    if (def.type !== 'object' || !isObject(value)) return;
    const shape = def['shape'] as Record<string, ZodLike>;
    for (const [key, child] of Object.entries(value)) {
      const fieldPath = path === '' ? key : `${path}.${key}`;
      const field = shape[key];
      if (field === undefined) {
        unknown.add(fieldPath);
        continue;
      }
      const declaresSomething = !(Array.isArray(child) && child.length === 0);
      if (field.safeParse(undefined).success && declaresSomething) optional.add(fieldPath);
      walk(child, field, fieldPath);
    }
  };
  walk(building, schema, '');
  return { optional, unknown };
}

const keyOf = (fieldPath: string): string => fieldPath.slice(fieldPath.lastIndexOf('.') + 1);

function entryFor(registry: ReadonlyMap<string, Entry>, fieldPath: string): Entry | undefined {
  return registry.get(fieldPath) ?? (keyOf(fieldPath) === '$comment' ? registry.get('$comment') : undefined);
}

// ---------------------------------------------------------------------------------------------
// The reader check
// ---------------------------------------------------------------------------------------------

const TOP_LEVEL = /^(?:export |async |function |class |const |let |var |type |interface |enum |declare |\/\*\*)/u;

/** The code of a top-level declaration, comments stripped, or `undefined` if it is not declared. */
function declarationCode(source: string, symbol: string): string | undefined {
  const lines = source.split('\n');
  const opens = new RegExp(
    `^(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?` +
      `(?:function\\*?|class|const|let|var)\\s+${symbol.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`,
    'u',
  );
  const start = lines.findIndex((line) => opens.test(line));
  if (start < 0) return undefined;
  let end = start + 1;
  while (end < lines.length && !TOP_LEVEL.test(lines[end] ?? '')) end += 1;
  return lines
    .slice(start, end)
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:'"`])\/\/.*$/gmu, '$1');
}

const IS_TEST = /(?:\.test\.ts|\.test-helper\.ts|__tests__|\/fixtures?\/)/u;

function readerProblem(
  reader: string,
  fieldPath: string,
  readSource: (file: string) => string | undefined,
): string | undefined {
  const [file, symbol] = reader.split('#');
  if (file === undefined || symbol === undefined || symbol === '') {
    return `${fieldPath}: reader "${reader}" is not written file#symbol`;
  }
  if (IS_TEST.test(file)) return `${fieldPath}: reader "${reader}" is a test file, not a shipped path`;
  const source = readSource(file);
  if (source === undefined) return `${fieldPath}: reader file ${file} does not exist`;
  const code = declarationCode(source, symbol);
  if (code === undefined) return `${fieldPath}: ${file} declares no top-level ${symbol}`;
  const key = keyOf(fieldPath);
  if (!new RegExp(`\\b${key}\\b`, 'u').test(code)) {
    return `${fieldPath}: ${reader} never reads "${key}" in its code (comments do not count)`;
  }
  return undefined;
}

/** The static half of the audit: every declared field registered, every entry earned. */
function auditRegister(
  declared: ReadonlyMap<string, ReadonlySet<string>>,
  unknownFields: ReadonlyMap<string, ReadonlySet<string>>,
  registry: ReadonlyMap<string, Entry>,
  readSource: (file: string) => string | undefined,
): string[] {
  const problems: string[] = [];
  for (const [fieldPath, buildings] of unknownFields) {
    problems.push(`${fieldPath}: declared by ${[...buildings].join(', ')} and unknown to the schema`);
  }
  for (const [fieldPath, buildings] of declared) {
    const entry = entryFor(registry, fieldPath);
    if (entry === undefined) {
      problems.push(
        `${fieldPath}: declared by ${[...buildings].join(', ')} and registered nowhere. Name its ` +
          'non-test reader, or show a run it changes, or list it as display with a reason (#232 AC4).',
      );
      continue;
    }
    if (entry.kind === 'display') continue;
    const problem = readerProblem(entry.reader, fieldPath, readSource);
    if (problem !== undefined) problems.push(problem);
    if (entry.kind === 'legs' && entry.witness !== 'each' && !buildings.has(entry.witness)) {
      problems.push(`${fieldPath}: witness ${entry.witness} does not declare it`);
    }
  }
  for (const fieldPath of registry.keys()) {
    const used = fieldPath === '$comment'
      ? [...declared.keys()].some((one) => keyOf(one) === '$comment')
      : declared.has(fieldPath);
    if (!used) problems.push(`${fieldPath}: registered, and no shipped building declares it — a stale entry`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// The behavioural half
// ---------------------------------------------------------------------------------------------

/** Remove every occurrence of a field path from a deep copy of a building. */
function without(building: JsonObject, fieldPaths: readonly string[]): JsonObject {
  const copy = structuredClone(building);
  const strip = (value: Json | undefined, segments: readonly string[]): void => {
    const [head, ...rest] = segments;
    if (head === undefined || !isObject(value)) return;
    const isArray = head.endsWith('[]');
    const key = isArray ? head.slice(0, -2) : head;
    if (rest.length === 0) {
      delete value[key];
      return;
    }
    const child = value[key];
    if (isArray && Array.isArray(child)) {
      for (const item of child) strip(item, rest);
    } else {
      strip(child, rest);
    }
  };
  for (const fieldPath of fieldPaths) strip(copy, fieldPath.split('.'));
  return copy;
}

/** Every leg's passenger, car and boarding and alighting instants: the trajectory itself. */
function legs(result: SimulationResult): string {
  return result.record.passengers
    .map((leg) => `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}:${String(leg.alightedAt)}`)
    .join('|');
}

// ---------------------------------------------------------------------------------------------

const SHIPPED: ReadonlyMap<string, JsonObject> = new Map(
  readdirSync(BUILDINGS_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => [file.slice(0, -'.json'.length), JSON.parse(readFileSync(join(BUILDINGS_DIR, file), 'utf8')) as JsonObject]),
);

const SCHEMA = buildingConfigSchema as unknown as ZodLike;

function census(buildings: ReadonlyMap<string, JsonObject>): {
  readonly declared: Map<string, Set<string>>;
  readonly unknown: Map<string, Set<string>>;
} {
  const declared = new Map<string, Set<string>>();
  const unknown = new Map<string, Set<string>>();
  for (const [id, raw] of buildings) {
    const found = declaredFields(raw, SCHEMA);
    for (const fieldPath of found.optional) {
      const into = declared.get(fieldPath) ?? new Set<string>();
      into.add(id);
      declared.set(fieldPath, into);
    }
    for (const fieldPath of found.unknown) {
      const into = unknown.get(fieldPath) ?? new Set<string>();
      into.add(id);
      unknown.set(fieldPath, into);
    }
  }
  return { declared, unknown };
}

const readRepoSource = (file: string): string | undefined => {
  const at = join(ROOT, file);
  return existsSync(at) ? readFileSync(at, 'utf8') : undefined;
};

const { declared: DECLARED, unknown: UNKNOWN } = census(SHIPPED);

describe('every optional field a shipped building declares is registered with a reader (#232 AC4)', () => {
  it('derives a declared set that is not empty, from every shipped building', () => {
    expect(SHIPPED.size).toBeGreaterThanOrEqual(17);
    expect(DECLARED.size).toBeGreaterThan(20);
    // Spot-checks that the walk reaches every depth it must: building, bank, car, floor, range, mode.
    for (const fieldPath of [
      'totalPopulation',
      'banks[].servesFloorPairs',
      'banks[].cars[].doubleDeck',
      'floors[].isTransferFloor',
      'floorRanges[].trafficProfile',
      'transportModes[].use',
    ]) {
      expect(DECLARED.has(fieldPath), fieldPath).toBe(true);
    }
    // Required fields are not in it.
    expect(DECLARED.has('banks[].cars[].spec')).toBe(false);
    expect(DECLARED.has('id')).toBe(false);
  });

  it('finds no problem in the register, in either direction', () => {
    expect(auditRegister(DECLARED, UNKNOWN, REACH, readRepoSource)).toEqual([]);
  });
});

describe('the audit goes red on the defects it exists for — negative controls', () => {
  const bogus = 'banks[].cars[].bogusFieldNothingReads';
  const withBogus = new Map<string, ReadonlySet<string>>([...DECLARED, [bogus, new Set(['midtown-office'])]]);

  it('refuses a declared field nobody registered', () => {
    const problems = auditRegister(withBogus, UNKNOWN, REACH, readRepoSource);
    expect(problems.some((one) => one.startsWith(`${bogus}: declared by midtown-office and registered nowhere`))).toBe(true);
  });

  it('refuses a registered reader that does not read the field', () => {
    const registry = new Map<string, Entry>([
      ...REACH,
      [bogus, { kind: 'reader', reader: `${CORE}/config/resolveCar.ts#resolveCar`, why: 'injected' }],
    ]);
    const problems = auditRegister(withBogus, UNKNOWN, registry, readRepoSource);
    expect(problems).toEqual([`${bogus}: ${CORE}/config/resolveCar.ts#resolveCar never reads "bogusFieldNothingReads" in its code (comments do not count)`]);
  });

  it('refuses a reader that only mentions the field in a comment', () => {
    const source = '/** reads bogusFieldNothingReads */\nexport function f(): number {\n  // bogusFieldNothingReads\n  return 1;\n}\n';
    expect(readerProblem('src/f.ts#f', bogus, () => source)).toMatch(/never reads/u);
    expect(readerProblem('src/f.ts#f', bogus, () => source.replace('return 1', 'return x.bogusFieldNothingReads'))).toBeUndefined();
  });

  it('refuses a test file, a missing file and a missing symbol as a reader', () => {
    expect(readerProblem(`${CORE}/sim/seam.test.ts#trajectory`, 'x', readRepoSource)).toMatch(/test file/u);
    expect(readerProblem(`${CORE}/nowhere.ts#f`, 'x', readRepoSource)).toMatch(/does not exist/u);
    expect(readerProblem(`${CORE}/config/resolveCar.ts#noSuchSymbol`, 'x', readRepoSource)).toMatch(/declares no top-level/u);
  });

  it('refuses a stale entry and a field the schema does not know', () => {
    const registry = new Map<string, Entry>([...REACH, ['banks[].nothingDeclaresThis', { kind: 'display', why: 'injected' }]]);
    expect(auditRegister(DECLARED, UNKNOWN, registry, readRepoSource)).toEqual([
      'banks[].nothingDeclaresThis: registered, and no shipped building declares it — a stale entry',
    ]);
    const raw = structuredClone(SHIPPED.get('midtown-office')) as JsonObject;
    (raw['banks'] as JsonObject[])[0]!['bogusFieldNothingReads'] = 1;
    expect([...declaredFields(raw, SCHEMA).unknown]).toEqual(['banks[].bogusFieldNothingReads']);
  });
});

describe('every legs field changes the legs of a short slice where it is declared', () => {
  let config: LoadedConfig;
  let trafficProfileIds: ReadonlySet<string>;
  const baselines = new Map<string, string>();

  beforeAll(async () => {
    config = await loadConfig(join(ROOT, 'data'));
    trafficProfileIds = new Set(config.trafficProfiles.profiles.map((profile) => profile.id));
  });

  function run(id: string, raw: JsonObject): string {
    const file = `${id}.json`;
    const building = resolveBuilding(parseBuilding(raw, file), config.elevatorSpecs, { file, trafficProfileIds });
    const profile = config.dispatcherProfilesById.get(PROFILE);
    if (profile === undefined) throw new Error(`no dispatcher profile ${PROFILE}`);
    return legs(
      runSimulation({
        building,
        dispatcherProfile: profile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: SEED,
        durationS: SLICE_S,
        onTimeout: 'report',
      }),
    );
  }

  function baseline(id: string): string {
    const known = baselines.get(id);
    if (known !== undefined) return known;
    const raw = SHIPPED.get(id);
    if (raw === undefined) throw new Error(`${id} is not shipped`);
    const measured = run(id, raw);
    baselines.set(id, measured);
    return measured;
  }

  /** Whether the run moves when the field is removed, per witness building. */
  function witness(fieldPath: string, entry: LegsEntry): Map<string, 'differs' | 'identical'> {
    const buildings = entry.witness === 'each' ? [...(DECLARED.get(fieldPath) ?? [])].sort() : [entry.witness];
    const verdicts = new Map<string, 'differs' | 'identical'>();
    for (const id of buildings) {
      const raw = SHIPPED.get(id);
      if (raw === undefined) throw new Error(`${id} is not shipped`);
      const stripped = without(raw, [fieldPath, ...(entry.removeAlso ?? [])]);
      verdicts.set(id, run(id, stripped) === baseline(id) ? 'identical' : 'differs');
    }
    return verdicts;
  }

  const legsEntries = [...REACH].filter((pair): pair is [string, LegsEntry] => pair[1].kind === 'legs');

  it.each(legsEntries)('%s', (fieldPath, entry) => {
    const verdicts = witness(fieldPath, entry);
    expect(verdicts.size).toBeGreaterThan(0);
    for (const [id, verdict] of verdicts) {
      const known = KNOWN_INERT.get(`${id}:${fieldPath}`);
      if (known === undefined) {
        expect(
          verdict,
          `${id} declares ${fieldPath}, and a ${SLICE_S} s slice without it has identical legs: the field ` +
            'reaches no leg on this building (#232 AC4). Register it in KNOWN_INERT with the reason, or fix ' +
            'the data or the reader; do not loosen this check.',
        ).toBe('differs');
      } else {
        expect(
          verdict,
          `${id}:${fieldPath} is registered as inert (${known.issue}) and now changes the legs: the entry is stale.`,
        ).toBe('identical');
      }
    }
  });

  it('registers no inert finding for a field or building that is not a legs witness', () => {
    for (const key of KNOWN_INERT.keys()) {
      const [id, fieldPath] = key.split(':') as [string, string];
      const entry = REACH.get(fieldPath);
      expect(entry?.kind, key).toBe('legs');
      expect(DECLARED.get(fieldPath)?.has(id), key).toBe(true);
    }
  });

  it('holds the duty finding to its stated cause: no shipped profile weights dutyMismatch', () => {
    const weighting = [...config.dispatcherProfilesById.values()]
      .filter((profile) => (profile.weights as Readonly<Record<string, number>>)['dutyMismatch'] !== undefined)
      .map((profile) => profile.id);
    expect(
      weighting,
      'a shipped profile now weights dutyMismatch, so the st-jude duty entry in KNOWN_INERT may be ' +
        'stale under that profile; re-run its witness under it',
    ).toEqual([]);
  });

  it('catches a schema-valid field that changes no leg — the negative control', () => {
    // A pressurised cabin on midtown-office: read by resolveCar, schema-valid, and unable to move a
    // leg, because no bank there travels the 300 m above which the descent cap binds.
    const raw = structuredClone(SHIPPED.get('midtown-office')) as JsonObject;
    for (const bank of raw['banks'] as JsonObject[]) {
      for (const car of bank['cars'] as JsonObject[]) car['cabinPressurised'] = true;
    }
    expect(run('midtown-office', raw)).toBe(baseline('midtown-office'));
    // And the instrument can see a difference at all on that building: a transfer time does move it.
    const slower = structuredClone(raw);
    for (const bank of slower['banks'] as JsonObject[]) {
      for (const car of bank['cars'] as JsonObject[]) car['passengerTransferS'] = 3;
    }
    expect(run('midtown-office', slower)).not.toBe(baseline('midtown-office'));
  });
});
