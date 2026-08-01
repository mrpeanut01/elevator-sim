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
import { policyNoiseStream, sampleCandidate } from './sample.js';
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
 * Authorability, decided independently of the collector
 * -------------------------------------------------------------------------- */

/**
 * Whether `core`'s **own** profile parser accepts a profile carrying this row at its declared
 * default — computed here, sharing no code with `isProfileAuthorable`.
 *
 * This exists because the obvious form of the completeness assertion is a tautology.
 * `collectSearchSpace`'s default `include` *is* `isProfileAuthorable`, so
 * `expect(SPACE.byId.has(row.id)).toBe(isProfileAuthorable(row))` compares the predicate to
 * itself and passes however wrong the predicate is. The claim under test is docs/06's — *"every
 * declared `id` must be authorable into `data/dispatcher-profiles.json` and survive a `loadConfig`
 * round trip"* — and the only honest referee for it is `parseDispatcherProfiles`, the function
 * `loadConfig` calls.
 *
 * The dotted-path routing is restated here rather than imported for the same reason: it is the
 * authoring convention docs/06 § Layer 2 states, and reusing `decodeInto` would fold the thing
 * under test back into the test. Three cases, and they are the whole convention — `weights.<term>`
 * under `weights`, `constraints.<name>` as membership in `hardConstraints`, everything else as
 * `profile.<section>.<key>`.
 */
function parserAcceptsRow(row: DispatchParameterSpec): boolean {
  const dot = row.id.indexOf('.');
  if (dot <= 0 || dot >= row.id.length - 1) return false;
  const section = row.id.slice(0, dot);
  const key = row.id.slice(dot + 1);
  const value = row.default;
  if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
    return false;
  }

  const authored: Record<string, unknown> = { id: 'probe', name: 'Probe', weights: {} };
  if (section === 'weights') authored['weights'] = { [key]: value };
  else if (section === 'constraints') authored['hardConstraints'] = value === true ? [key] : [];
  else authored[section] = { [key]: value };

  try {
    core.parseDispatcherProfiles(
      {
        version: 1,
        terms: core.COST_TERMS.map((term) => ({
          id: term.id,
          measures: term.measures,
          serves: 'authorability referee',
        })),
        normalization: { required: true },
        profiles: [authored],
      },
      '<collect.test.ts authorability referee>',
    );
    return true;
  } catch {
    return false;
  }
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
    // when a profile can hold it — docs/06 § `id` is a path a profile can actually hold.
    //
    // The verdict on the right-hand side is computed **here, from `core`'s parser**, not read off
    // `isProfileAuthorable`. Comparing the space against the collector's own predicate is a
    // self-comparison: `collectSearchSpace`'s default `include` *is* `isProfileAuthorable`, so
    // `SPACE.byId.has(row.id) === isProfileAuthorable(row)` holds by construction and cannot fail.
    // Proven: breaking `isProfileAuthorable` for `answer.maxTransferSeconds` — a real, authorable
    // dimension then lost from the space — left that form of the loop passing on all 96 rows, and
    // only the hardcoded count below noticed. {@link parserAcceptsRow} is the independent
    // criterion, and `catches a dimension the predicate loses` below proves it discriminates.
    const sites = await declarationSites();
    let rows = 0;
    let authorable = 0;
    for (const site of sites) {
      for (const row of site.rows) {
        rows += 1;
        const accepted = parserAcceptsRow(row);
        if (accepted) authorable += 1;
        const where = `${site.file} → ${site.schema} → ${row.id}`;
        expect(SPACE.byId.has(row.id), where).toBe(accepted);
      }
    }
    // Ten schemas, 99 declared rows including the four `answer.*`/`car.*` that
    // `CAR_PARAMETERS` re-declares by spreading `LOAD_SENSOR_PARAMETERS`. Pinned so a schema
    // that stops being found — by being renamed, or by moving to a declaration form the scan
    // does not match — fails rather than silently shrinking the space.
    //
    // **96 → 98 and 48 → 49 in Phase 6b**, and the asymmetry is the point rather than an
    // oversight. Two rows landed: `dispatch.passengerAssignment` (the Level-0/Level-1 switch,
    // `DISPATCH_PARAMETERS`) and `sim.assignedWalkS` (the walk from a destination panel to the car
    // it named, `SIM_PARAMETERS`). Only the first is a *dispatcher* dimension. The walk is a
    // property of the lobby and is deliberately not authorable in a profile — a dispatcher that
    // could tune its own walk distance could tune away its own cost — so it is declared, counted,
    // and correctly absent from the searchable space, which is exactly the discrimination the
    // biconditional above exists to prove.
    //
    // **98 → 99 in T21, with the space unmoved at 49**, and that asymmetry is the same
    // discrimination again. `metrics.maxWaitHorizonS` (`METRICS_PARAMETERS`) is the abandonment
    // horizon `RunSummary.awtIsValid`'s fourth gate is stated in. It is an *analysis* parameter —
    // changing it re-reads a stored run rather than re-simulating one — so like every other
    // `metrics.*` row it is declared and counted here and is correctly not authorable in a
    // dispatcher profile. A dispatcher that could tune the threshold at which its own long waits
    // stop being reported would be tuning away its own evidence.
    //
    // **99 → 106 and 49 → 56 in wave 6**, and here the two move together, which is the third
    // possible relationship and the one neither earlier note had. All seven new rows are
    // `DISPATCH_PARAMETERS`' `selection.*` — stage 3's weight-set selector — and all seven are
    // authorable in a profile, because a dispatcher choosing *which of the shipped weight vectors
    // to score with* is a dispatcher dimension in a way `sim.assignedWalkS` and
    // `metrics.maxWaitHorizonS` are not. Their arrival also found a real defect one file over:
    // `encode.ts`'s `PROFILE_OBJECT_SECTIONS` is a hand-written list of profile sections, so all
    // seven were reported unauthorable and silently dropped from the space until `selection` was
    // added to it. The biconditional above is what caught it.
    //
    // **The list is no longer hand-written.** It is derived from `dispatcherProfileSchema`'s own
    // shape by `core`'s `objectSectionsOf`, so an eighth section reaches this count with no edit
    // in `experiments` at all; `config/schema.test.ts` proves the derivation against a fictional
    // schema the product does not ship, and `encode.test.ts` pins `encode.ts` to it by identity.
    // These two numbers are unchanged by that work — 106 and 56 before and after — which is the
    // claim, since a derivation that moved a count would be a second defect wearing the fix's
    // clothes.
    //
    // **106 → 108 and the space unmoved at 56 in wave 9**, which is the `sim.assignedWalkS`
    // relationship again rather than a new one. Both rows are `TRAFFIC_PARAMETERS`' —
    // `traffic.lunchTwoWay.durationS` and `traffic.lunchTwoWay.mixAmplitude`, the geometry and the
    // mix-arc amplitude of the third demand template — and neither is authorable in a dispatcher
    // profile, correctly: they describe the *traffic a dispatcher is measured under*, and a
    // dispatcher that could tune the demand it is scored on could tune away the demand it is bad
    // at. The second is the one that matters, because it is the flat-mix negative control
    // `DECISIONS.md` § D162 condition 5 requires — a control an arm could set for itself would
    // not be one.
    //
    // **108 -> 113 and the space unmoved at 56 in wave 13**, which is the `sim.assignedWalkS`
    // relationship a fourth time and an eleventh schema. Five rows landed with docs/14 § 3.1's
    // patience and abandonment: four are a new `PATIENCE_PARAMETERS` schema in `core/src/sim`
    // (`sim.patience.distribution`, `.meanS`, `.spreadS`, `.minS`) and the fifth is
    // `metrics.maxAbandonmentFraction`, the rate above which a run refuses its own mean. None is
    // authorable in a dispatcher profile and none should be: patience is a property of the
    // *crowd* a dispatcher is measured against, and a dispatcher that could tune how long riders
    // are willing to wait — or the rate at which their leaving stops being reportable — could
    // tune away the evidence of its own queues. That is `metrics.maxWaitHorizonS`'s argument
    // exactly, one axis over.
    //
    // The patience rows are their own schema rather than four more on `SIM_PARAMETERS` because
    // that table's ids are flat `sim.<key>` names bound one-for-one to `SIM_DEFAULTS`, and a
    // patience curve has no scalar default: the absent block *is* the default, which is what
    // keeps a run that declares none byte-identical to one produced before the feature existed.
    expect(rows).toBe(113);
    expect(SPACE.parameters.length).toBe(56);
    // Both verdicts occur, and neither is the whole set: an oracle that always said `true` or
    // always said `false` would satisfy the biconditional above only by accident.
    expect(authorable).toBeGreaterThan(0);
    expect(authorable).toBeLessThan(rows);
  });

  it('has an authorability oracle that discriminates, independently of the collector', async () => {
    // The negative control the biconditional needs to be worth anything. `parserAcceptsRow` is
    // built from `core.parseDispatcherProfiles` and the authoring convention docs/06 states; it
    // shares no code with `isProfileAuthorable`. Here it is shown to answer both ways on rows
    // whose answer is known, and to disagree with a deliberately broken predicate.
    const probe = (id: string, extra: Partial<DispatchParameterSpec> = {}): DispatchParameterSpec => ({
      id,
      type: 'continuous',
      range: [0, 5],
      scale: 'linear',
      default: 1,
      description: 'A row invented by this test to check the oracle discriminates.',
      ...extra,
    });
    expect(parserAcceptsRow(probe('weights.waitTime'))).toBe(true);
    expect(parserAcceptsRow(probe('idle.repositionThresholdS'))).toBe(true);
    // A section no dispatcher profile has, an unknown key in a real section, and a malformed id.
    expect(parserAcceptsRow(probe('sim.drainGraceS'))).toBe(false);
    expect(parserAcceptsRow(probe('idle.notAKnobAnybodyDeclared'))).toBe(false);
    expect(parserAcceptsRow(probe('nodot'))).toBe(false);

    // And the case that caught the tautology: a space missing a row the parser accepts fails.
    const sites = await declarationSites();
    const transfer = sites
      .flatMap((site) => site.rows)
      .find((row) => row.id === 'answer.maxTransferSeconds') as DispatchParameterSpec;
    expect(parserAcceptsRow(transfer)).toBe(true);
    const without = collectSearchSpace({
      include: (spec) => isProfileAuthorable(spec) && spec.id !== 'answer.maxTransferSeconds',
    });
    expect(without.byId.has('answer.maxTransferSeconds')).toBe(false);
    expect(without.byId.has('answer.maxTransferSeconds')).not.toBe(parserAcceptsRow(transfer));
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

  it('keeps the whole index when narrowed, so a merged subspace point decodes whole', () => {
    // The regression. `subspace` used to rebuild the oracle against the **narrowed** index, so
    // `decodeInto` dropped every dimension the merge had just supplied from the base and the
    // oracle answered about a dispatcher nobody proposed.
    const timing = subspace(SPACE, ['dispatch.assignmentTiming', 'dispatch.deferWindowS']);
    expect(timing.byId.size).toBe(2);
    expect(timing.allById.size).toBe(SPACE.parameters.length);
    expect(timing.defaults.size).toBe(SPACE.defaults.size);

    // A merged point: the base says destination entry, the candidate says deferred. `core`
    // refuses the combination, and the narrowed space must refuse it too.
    const merged: Candidate = new Map<string, string | number>([
      ['dispatch.callType', 'destination-entry'],
      ['dispatch.assignmentTiming', 'deferred'],
      ['dispatch.deferWindowS', 1.5],
    ]);
    expect(timing.validate(merged)).toMatch(/defers assignment under destination entry/);
    expect(timing.validate(merged)).toBe(SPACE.validate(merged));

    // And the candidate alone — no base — still validates, because the dimensions it does not
    // carry are ones the resolver defaults. Narrowing must not manufacture a rejection either.
    expect(timing.validate(new Map([['dispatch.assignmentTiming', 'immediate']]))).toBeUndefined();
  });

  it('rejection-samples a subspace against the merged point, not against half a dispatcher', () => {
    // The path the defect actually shipped on: `sampleCandidate(subspace, rng, { base })` with
    // validation **on**. Measured before the fix: 24 of 50 draws came back `deferred` under a
    // `destination-entry` base — the combination this module's docstrings say it rejects one draw
    // in eight. Every subspace test in the module passed `validate: false`, so nothing saw it.
    const timing = subspace(SPACE, ['dispatch.assignmentTiming', 'dispatch.deferWindowS']);
    const base: Candidate = new Map([['dispatch.callType', 'destination-entry']]);
    const rng = policyNoiseStream(1234);
    for (let index = 0; index < 50; index += 1) {
      const candidate = sampleCandidate(timing, rng, { base });
      expect(candidate.get('dispatch.assignmentTiming'), `draw ${index}`).not.toBe('deferred');
      // The whole dispatcher the draw describes is one `core` will build.
      expect(SPACE.validate(new Map([...base, ...candidate])), `draw ${index}`).toBeUndefined();
    }

    // The rejection is of one *combination*, not of one value: under up-down buttons the same
    // subspace reaches `deferred` freely, or the search would have lost a dimension.
    const upDown: Candidate = new Map([['dispatch.callType', 'up-down-buttons']]);
    const timings = new Set(
      Array.from({ length: 50 }, () =>
        sampleCandidate(timing, rng, { base: upDown }).get('dispatch.assignmentTiming'),
      ),
    );
    expect(timings.has('deferred')).toBe(true);
  });
});
