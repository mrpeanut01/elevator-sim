import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as core from '@elevator-sim/core';
import type { DispatchParameterSpec } from '@elevator-sim/core';

import {
  PARAMETER_SCHEMA_SUFFIX,
  activeParameters,
  activeWhenSatisfied,
  collectSearchSpace,
  defaultCandidate,
  discoverParameterSchemas,
  isActive,
  isActiveWhenRange,
  isProfileAuthorable,
  parameterOf,
  searchSpace,
  subspace,
} from './collect.js';
import { SearchSpaceError } from './types.js';
import type { Candidate, SearchParameter } from './types.js';

const SPACE = searchSpace();

/* -------------------------------------------------------------------------- *
 * The declaration sites, read off the filesystem
 * -------------------------------------------------------------------------- */

/** `packages/core/src`. The tree the schemas actually live in. */
const CORE_SRC = fileURLToPath(new URL('../../../../core/src', import.meta.url));

interface DeclarationSite {
  /** Path relative to `packages/core/src`. */
  readonly file: string;
  readonly schema: string;
  readonly rows: readonly DispatchParameterSpec[];
}

/**
 * Every parameter schema declared anywhere in `core`, found by **reading the source tree**.
 *
 * This is the staleness guard, and the reason it reads the disk rather than the barrel: the
 * collector discovers schemas through `@elevator-sim/core`'s module namespace, so a schema that
 * exists on disk and is not re-exported from the barrel is invisible to it. That is exactly the
 * shape of defect docs/05-roadmap.md § *Standing requirement* records four times — built,
 * exported from its own module, and not reachable from the path that matters. Here the two
 * discoveries are independent, and the tests below assert they agree.
 *
 * The regex is `export const <NAME>_PARAMETERS`, which is the declaration form every one of the
 * ten shipped schemas uses. A schema declared some other way is not found, which would show up
 * as this suite passing while a dimension went missing — so the count assertion below pins the
 * number of sites as well as their contents.
 */
async function declarationSites(): Promise<readonly DeclarationSite[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test-helper.ts')) continue;
      files.push(path);
    }
  };
  await walk(CORE_SRC);
  files.sort();

  const sites: DeclarationSite[] = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const names = [...text.matchAll(/export const ([A-Z][A-Z0-9_]*_PARAMETERS)\b/g)]
      .map((match) => match[1] as string)
      .sort();
    if (names.length === 0) continue;
    const module = (await import(pathToFileURL(file).href)) as Readonly<Record<string, unknown>>;
    for (const schema of names) {
      const rows = module[schema];
      expect(Array.isArray(rows), `${file} exports ${schema} and it is not an array`).toBe(true);
      sites.push({
        file: relative(CORE_SRC, file).replaceAll('\\', '/'),
        schema,
        rows: rows as readonly DispatchParameterSpec[],
      });
    }
  }
  return sites;
}

/* -------------------------------------------------------------------------- *
 * Discovery
 * -------------------------------------------------------------------------- */

describe('the space is discovered, not listed', () => {
  it('finds every schema the source tree declares, through the barrel', async () => {
    const sites = await declarationSites();
    const onDisk = [...new Set(sites.map((site) => site.schema))].sort();
    const discovered = [...discoverParameterSchemas().keys()].sort();

    // Both directions. A schema on disk that the barrel does not re-export is a dimension the
    // optimizer cannot see; a name the barrel exports that no file declares is a name this
    // suite would otherwise be checking against itself.
    expect(discovered).toStrictEqual(onDisk);
    expect(onDisk.length).toBeGreaterThanOrEqual(10);
  });

  it('reads whatever namespace it is handed, and nothing else', () => {
    // The property a hand-listed collector cannot have. If the collector held a list of schema
    // names, an injected namespace containing a name that is not on the list would produce an
    // empty space, and one containing none of the listed names would produce the full one.
    const fictional: DispatchParameterSpec = {
      id: 'dispatch.batchWindowS',
      type: 'continuous',
      range: [0, 5],
      scale: 'linear',
      default: 1,
      description: 'A schema that exists only in this test, to prove discovery is discovery.',
    };
    const invented = collectSearchSpace({ source: { FICTIONAL_PARAMETERS: [fictional] } });
    expect(invented.ids).toStrictEqual(['dispatch.batchWindowS']);
    expect(parameterOf(invented, 'dispatch.batchWindowS')?.declaredBy).toStrictEqual([
      'FICTIONAL_PARAMETERS',
    ]);

    expect(collectSearchSpace({ source: {} }).parameters).toStrictEqual([]);
    expect(discoverParameterSchemas({ NOT_A_SCHEMA: [{ id: 'x' }] }).size).toBe(0);
    expect(PARAMETER_SCHEMA_SUFFIX).toBe('_PARAMETERS');
  });

  it('collects the same space from the real namespace as `searchSpace()` caches', () => {
    const fresh = collectSearchSpace();
    expect(fresh.ids).toStrictEqual(SPACE.ids);
    expect(fresh.parameters).toStrictEqual(SPACE.parameters);
  });
});

/* -------------------------------------------------------------------------- *
 * Completeness — the counting assertion
 * -------------------------------------------------------------------------- */

describe('every parameter core declares is accounted for', () => {
  it('carries every row declared in core/src/dispatch, with no exceptions', async () => {
    // The strict half. `dispatch/parameters.ts`, `dispatch/policies/parameters.ts` and
    // `dispatch/predictor/parameters.ts` declare the dispatcher's own tunables, and **all** of
    // them must be searchable: a row declared there and missing here is a knob the tuned winner
    // silently depends on. Counted against the files rather than a list, so a new row that is
    // not surfaced fails right here.
    const sites = (await declarationSites()).filter((site) => site.file.startsWith('dispatch/'));
    expect(sites.map((site) => site.file)).toStrictEqual([
      'dispatch/parameters.ts',
      'dispatch/policies/parameters.ts',
      'dispatch/predictor/parameters.ts',
    ]);

    const declared = sites.flatMap((site) => site.rows.map((row) => row.id)).sort();
    expect(declared.length).toBe(
      core.DISPATCH_PARAMETERS.length + core.POLICY_PARAMETERS.length + core.PREDICTOR_PARAMETERS.length,
    );
    for (const id of declared) {
      expect(SPACE.byId.has(id), `declared in core/src/dispatch and not searchable: ${id}`).toBe(
        true,
      );
    }
  });

  it('carries every other declared row a dispatcher profile can hold, and only those', async () => {
    // The mechanical half, and there is deliberately no allowlist. A row is in the space exactly
    // when `isProfileAuthorable` says a profile can hold it — docs/06 § `id` is a path a profile
    // can actually hold. So a row declared anywhere in `core` is either searchable or
    // unauthorable, and this asserts the biconditional over every row on disk.
    const sites = await declarationSites();
    let rows = 0;
    for (const site of sites) {
      for (const row of site.rows) {
        rows += 1;
        const where = `${site.file} → ${site.schema} → ${row.id}`;
        expect(SPACE.byId.has(row.id), where).toBe(isProfileAuthorable(row));
      }
    }
    // Ten schemas, 96 declared rows including the four `answer.*`/`car.*` that
    // `CAR_PARAMETERS` re-declares by spreading `LOAD_SENSOR_PARAMETERS`. Pinned so a schema
    // that stops being found — by being renamed, or by moving to a declaration form the scan
    // does not match — fails rather than silently shrinking the space.
    expect(rows).toBe(96);
    expect(SPACE.parameters.length).toBe(48);
  });

  it('excludes only sections no dispatcher profile has, and says which', async () => {
    const excluded = new Set<string>();
    for (const site of await declarationSites()) {
      for (const row of site.rows) {
        if (!SPACE.byId.has(row.id)) excluded.add(row.id.slice(0, row.id.indexOf('.')));
      }
    }
    // Building fabric, demand, the ruler, the closed-form oracle and the harness. Every one of
    // them is a thing a dispatcher is *measured against*; a search that moved them would be
    // tuning the ruler, and none of them is authorable under `profiles[]` in
    // `data/dispatcher-profiles.json`, which is the mechanical reason they are out.
    expect([...excluded].sort()).toStrictEqual(['analytical', 'car', 'metrics', 'sim', 'traffic']);
  });

  it('carries the eight answer-stage rows another schema owns', () => {
    // Not declared in `dispatch/`, and stage-6 tunables all the same: docs/06 § Layer 2 Stage 6
    // lists every one, `answerStageSchema` accepts every one, and `predictive-balanced` authors
    // four of them today. The door machine and the load cell own the *implementation*, which is
    // what stops them being declared twice — not a reason for a dispatcher search to pretend the
    // operator cannot retune a dwell.
    const owned = SPACE.parameters
      .filter((parameter) => !parameter.declaredBy.includes('DISPATCH_PARAMETERS'))
      .filter((parameter) => parameter.section === 'answer')
      .map((parameter) => parameter.id)
      .sort();
    expect(owned).toStrictEqual([
      'answer.bypassLoadThreshold',
      'answer.dwellAdaptationGain',
      'answer.dwellPolicy',
      'answer.maxDwellS',
      'answer.maxReopensPerStop',
      'answer.maxTransferSeconds',
      'answer.overloadThreshold',
      'answer.reopenOnLateArrival',
    ]);
  });

  it('merges an id two schemas declare identically, and records both', () => {
    // `CAR_PARAMETERS` is literally `[...LOAD_SENSOR_PARAMETERS, …]`, so two schemas declare
    // `answer.bypassLoadThreshold`. One dimension, two provenances.
    const shared = parameterOf(SPACE, 'answer.bypassLoadThreshold');
    expect(shared?.declaredBy).toStrictEqual(['CAR_PARAMETERS', 'LOAD_SENSOR_PARAMETERS']);
    expect(SPACE.ids.filter((id) => id === 'answer.bypassLoadThreshold')).toHaveLength(1);
  });

  it('refuses two schemas that declare one id differently', () => {
    // The failure the merge above would otherwise hide: whichever schema name sorts first wins,
    // and the search draws from one range while the engine reads the other.
    const row = (max: number): DispatchParameterSpec => ({
      id: 'dispatch.batchWindowS',
      type: 'continuous',
      range: [0, max],
      scale: 'linear',
      default: 0,
      description: 'Two schemas, two ranges, one knob.',
    });
    expect(() =>
      collectSearchSpace({ source: { A_PARAMETERS: [row(5)], B_PARAMETERS: [row(9)] } }),
    ).toThrow(/different declarations/);
  });
});

/* -------------------------------------------------------------------------- *
 * Shape
 * -------------------------------------------------------------------------- */

describe('every dimension is well formed for its own declared type', () => {
  it('gives a numeric dimension finite bounds, a scale, and a default inside them', () => {
    for (const parameter of SPACE.parameters) {
      if (parameter.type !== 'continuous' && parameter.type !== 'integer') continue;
      const where = parameter.id;
      expect(Number.isFinite(parameter.min), where).toBe(true);
      expect(parameter.max, where).toBeGreaterThan(parameter.min);
      expect(parameter.default, where).toBeGreaterThanOrEqual(parameter.min);
      expect(parameter.default, where).toBeLessThanOrEqual(parameter.max);
      expect(['linear', 'log'], where).toContain(parameter.scale);
      // A log-uniform draw is undefined at or below zero, so a log dimension's range must not
      // reach it. `sim.drainGraceS` declares exactly that combination and is excluded for a
      // different reason; if it ever became authorable, collection would throw rather than
      // silently produce `-Infinity`.
      if (parameter.scale === 'log') expect(parameter.min, where).toBeGreaterThan(0);
      if (parameter.type === 'integer') {
        expect(Number.isInteger(parameter.min), where).toBe(true);
        expect(Number.isInteger(parameter.max), where).toBe(true);
        expect(Number.isInteger(parameter.default), where).toBe(true);
      }
    }
  });

  it('gives a categorical dimension a non-empty value set containing its default', () => {
    for (const parameter of SPACE.parameters) {
      if (parameter.type !== 'categorical') continue;
      expect(parameter.values.length, parameter.id).toBeGreaterThan(0);
      expect(parameter.values, parameter.id).toContain(parameter.default);
    }
  });

  it('splits every id into a section and a key that a profile can hold', () => {
    for (const parameter of SPACE.parameters) {
      expect(`${parameter.section}.${parameter.key}`).toBe(parameter.id);
      expect(parameter.description.length, parameter.id).toBeGreaterThan(20);
      expect(parameter.declaredBy.length, parameter.id).toBeGreaterThan(0);
    }
  });

  it('rejects a malformed row rather than dropping it', () => {
    const bad = (row: Partial<DispatchParameterSpec>): (() => unknown) => () =>
      collectSearchSpace({
        source: {
          X_PARAMETERS: [
            {
              id: 'dispatch.batchWindowS',
              type: 'continuous',
              range: [0, 5],
              scale: 'linear',
              default: 0,
              description: 'baseline',
              ...row,
            } as DispatchParameterSpec,
          ],
        },
        include: () => true,
      });

    expect(bad({ range: undefined })).toThrow(SearchSpaceError);
    expect(bad({ range: [5, 5] })).toThrow(/inverted range|cannot be sampled/);
    expect(bad({ default: 99 })).toThrow(/outside its declared range/);
    expect(bad({ scale: 'log' })).toThrow(/log scale over a range starting at 0/);
    expect(bad({ type: 'integer', range: [0, 5.5] })).toThrow(/integer dimension whose max/);
    expect(bad({ type: 'categorical', range: undefined, values: [] })).toThrow(/no values/);
    expect(bad({ type: 'boolean', range: undefined })).toThrow(/is boolean with default/);
    expect(bad({ id: 'nodot' })).toThrow(/not a dotted profile path/);
  });
});

/* -------------------------------------------------------------------------- *
 * activeWhen
 * -------------------------------------------------------------------------- */

describe('activeWhen is one evaluation rule, for both forms', () => {
  it('reproduces core dispatch/parameters.test.ts case for case', () => {
    // This function is a **restatement** of `activeWhenSatisfied` in
    // `core/dispatch/parameters.ts`, which is not on `@elevator-sim/core`'s barrel and therefore
    // cannot be imported (see the note on the function). The whole table from `core`'s own suite
    // is reproduced here so the two cannot drift silently; if the name reaches the barrel, this
    // test should be replaced by importing it.
    expect(activeWhenSatisfied(['deferred'], 'deferred')).toBe(true);
    expect(activeWhenSatisfied(['deferred'], 'immediate')).toBe(false);
    expect(activeWhenSatisfied(['true'], true)).toBe(true);
    expect(activeWhenSatisfied({ min: 2 }, 2)).toBe(true);
    expect(activeWhenSatisfied({ min: 2 }, 1)).toBe(false);
    expect(activeWhenSatisfied({ min: 2, max: 4 }, 5)).toBe(false);
    expect(activeWhenSatisfied({ max: 4 }, -1)).toBe(true);
    expect(activeWhenSatisfied({ min: 2 }, undefined)).toBe(false);
    expect(activeWhenSatisfied({ min: 2 }, 'contract-net')).toBe(false);
    expect(activeWhenSatisfied(['contract-net'], undefined)).toBe(false);
    expect(activeWhenSatisfied({ min: 2 }, Number.NaN)).toBe(false);

    expect(isActiveWhenRange({ min: 2 })).toBe(true);
    expect(isActiveWhenRange(['contract-net'])).toBe(false);
  });

  it('treats activeWhen as a conjunction, and an unreadable gate as unsatisfied', () => {
    const reserve = parameterOf(SPACE, 'auction.reserveMarginalDelayS') as SearchParameter;
    expect(reserve.activeWhen).toStrictEqual({
      'auction.aggregation': ['contract-net'],
      'auction.rounds': { min: 2 },
    });
    const read = (values: Record<string, string | number>) => (id: string) => values[id];
    expect(isActive(reserve, read({ 'auction.aggregation': 'contract-net', 'auction.rounds': 3 }))).toBe(true);
    expect(isActive(reserve, read({ 'auction.aggregation': 'contract-net', 'auction.rounds': 1 }))).toBe(false);
    expect(isActive(reserve, read({ 'auction.aggregation': 'central-argmin', 'auction.rounds': 3 }))).toBe(false);
    expect(isActive(reserve, read({}))).toBe(false);

    const callType = parameterOf(SPACE, 'dispatch.callType') as SearchParameter;
    expect(isActive(callType, () => undefined)).toBe(true);
  });

  it('names a gate every condition can actually read', () => {
    // A condition naming a dimension the space does not carry would leave the knob inactive
    // forever, silently. Every gate in the shipped schema is itself searchable.
    for (const parameter of SPACE.parameters) {
      for (const gate of Object.keys(parameter.activeWhen ?? {})) {
        expect(SPACE.byId.has(gate), `${parameter.id} gates on ${gate}, which is not searchable`)
          .toBe(true);
      }
    }
  });

  it('orders the dimensions so a gate always precedes what it gates', () => {
    // The property that lets the sampler decide activity in one pass. `weights.rideTime` is
    // declared *before* `dispatch.callType` and gated on it, so declaration order alone would
    // have the sampler asking a question nothing had answered.
    const placed = new Set<string>();
    for (const parameter of SPACE.parameters) {
      for (const gate of Object.keys(parameter.activeWhen ?? {})) {
        expect(placed.has(gate), `${parameter.id} is placed before its gate ${gate}`).toBe(true);
      }
      placed.add(parameter.id);
    }
    expect(SPACE.ids.indexOf('dispatch.callType')).toBeLessThan(
      SPACE.ids.indexOf('weights.rideTime'),
    );
    expect(SPACE.ids.indexOf('auction.rounds')).toBeLessThan(
      SPACE.ids.indexOf('auction.reserveMarginalDelayS'),
    );
  });

  it('refuses a cycle rather than picking an order', () => {
    const row = (id: string, gate: string): DispatchParameterSpec => ({
      id,
      type: 'categorical',
      values: ['a', 'b'],
      default: 'a',
      description: 'A gate that depends on what it gates.',
      activeWhen: { [gate]: ['a'] },
    });
    expect(() =>
      collectSearchSpace({
        source: { C_PARAMETERS: [row('dispatch.x', 'dispatch.y'), row('dispatch.y', 'dispatch.x')] },
        include: () => true,
      }),
    ).toThrow(/cycle/);
  });
});

/* -------------------------------------------------------------------------- *
 * The default point, and narrowing
 * -------------------------------------------------------------------------- */

describe('the space can be read at its defaults and narrowed', () => {
  it('drops inactive dimensions from the default point', () => {
    const point = defaultCandidate(SPACE);
    // Defaults park with `stay`, assign immediately and single-car, never reassign, and
    // aggregate centrally — so every knob those gate is absent, not zero.
    for (const absent of [
      'idle.repositionThresholdS',
      'idle.repositionEnergyWeight',
      'dispatch.deferWindowS',
      'dispatch.splitThresholdPassengers',
      'dispatch.commitmentPoint',
      'dispatch.reassignmentHysteresisS',
      'dispatch.maxReassignmentsPerCall',
      'weights.rideTime',
      'auction.rounds',
      'auction.reserveMarginalDelayS',
      'answer.dwellAdaptationGain',
      'answer.maxDwellS',
    ]) {
      expect(point.has(absent), `${absent} is inactive at the defaults`).toBe(false);
    }
    for (const [id, value] of point) {
      expect(value, id).toStrictEqual(parameterOf(SPACE, id)?.default);
    }
    expect(SPACE.validate(point)).toBeUndefined();
    expect(activeParameters(SPACE, point).map((parameter) => parameter.id)).toStrictEqual([
      ...point.keys(),
    ]);
  });

  it('keeps the whole default map when narrowed, so a gate outside the subspace still reads', () => {
    // The failure this prevents: narrow to `idle.*`, and `idle.repositionThresholdS` deactivates
    // because nothing can read `idle.parkingStrategy` — a search that quietly became narrower
    // than it was asked to be.
    const idle = subspace(SPACE, (parameter) => parameter.section === 'idle');
    expect(idle.ids.length).toBe(9);
    expect(idle.defaults.size).toBe(SPACE.defaults.size);

    const parked: Candidate = new Map([['idle.parkingStrategy', 'lobby']]);
    const live = activeParameters(idle, new Map(), parked).map((parameter) => parameter.id);
    expect(live).toContain('idle.repositionThresholdS');

    // And with nothing said, the base falls through to the declared default, which is `stay`.
    expect(activeParameters(idle, new Map()).map((parameter) => parameter.id)).not.toContain(
      'idle.repositionThresholdS',
    );
  });

  it('narrows by id and refuses an id it does not carry', () => {
    const two = subspace(SPACE, ['weights.waitTime', 'idle.repositionThresholdS']);
    expect(two.ids).toStrictEqual(['weights.waitTime', 'idle.repositionThresholdS']);
    expect(() => subspace(SPACE, ['weights.waitTime', 'weights.nonsense'])).toThrow(
      SearchSpaceError,
    );
  });

  it('reports an unknown id rather than guessing', () => {
    expect(parameterOf(SPACE, 'dispatch.nonsense')).toBeUndefined();
    expect(SPACE.defaults.get('car.doorOpenS')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * Feasibility
 * -------------------------------------------------------------------------- */

describe('the space asks core what is feasible rather than keeping a list', () => {
  it('rejects the one combination the declared box does not exclude', () => {
    // `resolveDispatchConfig`: a destination dispatcher must name the car at the landing, so it
    // cannot defer. One draw in eight over the full space hits it, and a search that did not
    // reject it would see a throw where it expects a score.
    const point = new Map(defaultCandidate(SPACE));
    point.set('dispatch.callType', 'destination-entry');
    point.set('dispatch.assignmentTiming', 'deferred');
    point.set('dispatch.deferWindowS', 1.5);
    expect(SPACE.validate(point)).toMatch(/defers assignment under destination entry/);

    point.set('dispatch.assignmentTiming', 'immediate');
    point.delete('dispatch.deferWindowS');
    expect(SPACE.validate(point)).toBeUndefined();
  });

  it('rejects a value outside a declared range with core’s own message', () => {
    const point = new Map(defaultCandidate(SPACE));
    point.set('eligibility.maxLoadFactorForAssignment', 9);
    expect(SPACE.validate(point)).toMatch(/maxLoadFactorForAssignment/);
  });
});
