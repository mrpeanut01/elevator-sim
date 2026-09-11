/**
 * **`runner/shard.ts` against `docs/15-compute-offload-contract.md` § 4's live criteria** — GitHub
 * issue #413.
 *
 * Criteria 1, 2, 5 and 7 are asserted here, each by a run. Criterion 6 — *the shard runner names
 * its non-test caller* — is `deadCode.test.ts`'s, which holds the module's docstring to the file it
 * names. Criteria 3 and 4 were Phase A's and are struck through in the document.
 *
 * Everything below runs on **one machine**, so where exactness holds it is asserted as exactness.
 * § D202's split — structural digest exactly, magnitudes within a declared tolerance — is asserted
 * as well, because that is the form criterion 1 is written in and the form a second machine would
 * be held to. **No cross-machine measurement is taken here**, and nothing in this file should be
 * read as one.
 *
 * ## How "refused by the type" is asserted
 *
 * Criterion 2 asks for a test that *attempts* to split a comparison's arms and fails loudly at the
 * type. Two halves do that here. The constants under *The surface, pinned* are conditional types
 * that `tsc -b` evaluates when it compiles this file, and each goes to `false` — so `true` stops
 * being assignable and the build fails — the moment the shard surface grows a field or loses its
 * nominal brand. And *refuses at the type, by trying* hands the real compiler a file of attempts
 * and a control file, and requires on every attempt line **the diagnostic that attempt should
 * raise**, and none on the control — the same one-shot `tsc -p` `core/src/config/parse.test.ts`
 * runs on the config module. A per-line suppression directive would accept any error on the line,
 * so an unrelated one could stand in for the refusal; naming the code per attempt does not allow it.
 *
 * Both halves were shown red before they were trusted: adding an arm selector to `ShardRunOptions`,
 * and separately removing `#plan` from `ShardedExperiment`, each failed `tsc -b` on the matching pin
 * and failed the by-trying case with `ACCEPTED by the compiler`.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '@elevator-sim/core';

import { smallestDetectableEffect } from '../benchmark/selectionSweep.js';
import { estimateMean, pairedDifferenceEstimate } from '../reports/statistics.js';
import { replicationSeed } from './crn.js';
import { planExperiment } from './experiment.js';
import {
  GARDEN_HEALTHY,
  GARDEN_SATURATED,
  assertCoreBuilt,
  loadResources,
  specOf,
} from './fixtures.test-helper.js';
import { REPLICATION_METRICS } from './metrics.js';
import type { ReplicationMetric } from './metrics.js';
import { fingerprintExperiment, runPlan } from './replicationRunner.js';
import { ShardedExperiment, deserializeShard, mergeShards, runShard, serializeShard } from './shard.js';
import type {
  ReplicationBlock,
  ShardCeiling,
  ShardResult,
  ShardRunOptions,
  ShardingRequest,
} from './shard.js';
import type {
  CellResult,
  ExperimentPlan,
  ExperimentResult,
  ExperimentSpec,
  MeasuredExperiment,
} from './types.js';
import { RunnerError } from './types.js';

/* -------------------------------------------------------------------------- *
 * The experiment every case shards
 * -------------------------------------------------------------------------- */

/**
 * Seven replications, because seven does not divide by two or by three: every k > 1 below is an
 * uneven split, and `[1, 5, 1]` is a deliberately lopsided one.
 */
const REPS = 7;

/**
 * Two dispatcher arms over two traffic arms: four cells in two CRN cohorts, so "every arm of every
 * cell" is tested on more than the two cells `compare` ships. The saturated arm is there so the
 * merged stopping reason has something other than `fixed-budget` to reproduce.
 */
const COMPARISON: ExperimentSpec = specOf({
  id: 'shard-comparison',
  dispatchers: [
    { id: 'A', profile: 'collective' },
    { id: 'B', profile: 'nearest-car' },
  ],
  traffic: [GARDEN_HEALTHY, GARDEN_SATURATED],
  replication: { minReplications: REPS, maxReplications: REPS },
});

/** Exactly cells × replications, so the ceiling is met with no headroom. */
const CEILING: ShardCeiling = { replicationRuns: 4 * REPS };

let config: LoadedConfig;
let plan: ExperimentPlan;
let unsharded: ExperimentResult;

beforeAll(async () => {
  config = await loadResources();
  plan = planExperiment(COMPARISON, config, { keepRecords: false });
  unsharded = await runPlan(plan);
}, 120_000);

async function runAll(sharded: ShardedExperiment): Promise<readonly ShardResult[]> {
  const results: ShardResult[] = [];
  for (const block of sharded.blocks) results.push(await runShard(sharded, block.index));
  return results;
}

/* -------------------------------------------------------------------------- *
 * Two readings of "the same"
 * -------------------------------------------------------------------------- */

/**
 * Every leaf equal under `Object.is` and every object carrying the same keys, returned as the paths
 * that differ.
 *
 * A walk rather than `fingerprintExperiment` alone, because the fingerprint goes through
 * `canonicalJson`, which renders `NaN` as `null` and cannot tell `-0` from `0`. Both are asserted.
 */
function differingPaths(a: unknown, b: unknown, path = '$', out: string[] = []): string[] {
  if (out.length > 20) return out;
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Object.is(a, b)) out.push(`${path}: ${String(a)} ≠ ${String(b)}`);
    return out;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) out.push(`${path}: ${String(a)} ≠ ${String(b)}`);
    return out;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path}: array against object`);
    return out;
  }
  const keysOf = (value: object): string[] =>
    Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort();
  const left = keysOf(a);
  const right = keysOf(b);
  if (left.join('|') !== right.join('|')) {
    out.push(`${path}: keys [${left.join(', ')}] ≠ [${right.join(', ')}]`);
    return out;
  }
  for (const key of left) {
    differingPaths(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      `${path}.${key}`,
      out,
    );
  }
  return out;
}

/** § D202's tolerance on a published estimate: `1e-6` relative with a `1e-5` absolute floor. */
const D202_RELATIVE = 1e-6;
const D202_ABSOLUTE_FLOOR = 1e-5;

/**
 * § D202's split of a whole result: **counts are decisions and reals are magnitudes**.
 *
 * Every string, boolean and safe integer is hashed exactly; every other number — a non-integer, a
 * `NaN`, an infinity, `-0` — is replaced by a placeholder **in place**, so a key appearing or
 * disappearing still moves the digest, and its value is collected for a tolerance comparison
 * instead. The rule `core/src/traffic/transportIdentity.test.ts` states for
 * `structuralDigestOfResult`, applied to a runner result.
 */
function identitySplitOf(value: unknown): {
  readonly structural: string;
  readonly magnitudes: readonly number[];
} {
  const magnitudes: number[] = [];
  const shape = (entry: unknown): unknown => {
    if (typeof entry === 'number') {
      if (Number.isSafeInteger(entry) && !Object.is(entry, -0)) return entry;
      magnitudes.push(entry);
      return '§real';
    }
    if (entry === null || typeof entry !== 'object') return entry;
    if (Array.isArray(entry)) return entry.map(shape);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(entry).sort()) {
      const inner = (entry as Record<string, unknown>)[key];
      if (inner !== undefined) out[key] = shape(inner);
    }
    return out;
  };
  const structural = createHash('sha256')
    .update(JSON.stringify(shape(value)))
    .digest('hex');
  return { structural, magnitudes };
}

function withinD202(a: number, b: number): boolean {
  if (Object.is(a, b)) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= Math.max(D202_ABSOLUTE_FLOOR, D202_RELATIVE * scale);
}

/** What criterion 1 compares: every measured field, and not the plan both sides share by reference. */
function measuredOf(result: MeasuredExperiment): unknown {
  return {
    experimentId: result.experimentId,
    experimentSeed: result.experimentSeed,
    cells: result.cells,
    cohorts: result.cohorts,
    replicationsRun: result.replicationsRun,
    failedReplications: result.failedReplications,
    saturated: result.saturated,
    warnings: result.warnings,
  };
}

function cellOf(cells: readonly CellResult[], trafficArmId: string, armId: string): CellResult {
  const cell = cells.find(
    (candidate) => candidate.trafficArmId === trafficArmId && candidate.dispatcherArmId === armId,
  );
  if (cell === undefined) throw new Error(`no cell ${trafficArmId}|${armId}`);
  return cell;
}

/* -------------------------------------------------------------------------- *
 * The surface, pinned — evaluated by `tsc -b`, not by vitest
 * -------------------------------------------------------------------------- */

/** `true` when `A` and `B` are the same type in both directions, `false` otherwise. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Everything a hand-built sharded experiment could carry, and not the private brand. */
interface HandBuilt {
  readonly plan: ExperimentPlan;
  readonly planDigest: string;
  readonly blocks: readonly ReplicationBlock[];
  readonly ceiling: ShardCeiling;
  readonly plannedReplicationRuns: number;
}

/*
 * Each annotation is a conditional type that is `true` today. Add a field to `ShardRunOptions` or
 * `ShardingRequest`, widen a layout past counts and sizes, or drop `#plan` from `ShardedExperiment`,
 * and the annotation becomes `false`: `true` is then not assignable to it and `tsc -b` fails on that
 * declaration. vitest never evaluates a type, which is why the compiler is the instrument here.
 *
 * **Annotations, and not `true as Same<…>`.** The first draft of these pins were casts, and the
 * positive control found them vacuous: TypeScript widens the literal `true` to `boolean` before it
 * checks an `as`, so `true as false` compiles. An annotation is an assignment, and `true` is not
 * assignable to `false`.
 */
const runOptionsCarryOnlyTheHook: Same<keyof ShardRunOptions, 'onReplication'> = true;
const requestCarriesOnlyLayoutAndCeiling: Same<keyof ShardingRequest, 'shards' | 'ceiling'> = true;
const layoutIsACountOrBlockSizes: Same<ShardingRequest['shards'], number | readonly number[]> = true;
const aShardIsNamedByAnIndex: Same<Parameters<typeof runShard>[1], number> = true;
const aPlanIsNotAShardedExperiment: ExperimentPlan extends ShardedExperiment ? false : true = true;
const aHandBuiltOneIsNotEither: HandBuilt extends ShardedExperiment ? false : true = true;

const SURFACE_PINS = {
  runOptionsCarryOnlyTheHook,
  requestCarriesOnlyLayoutAndCeiling,
  layoutIsACountOrBlockSizes,
  aShardIsNamedByAnIndex,
  aPlanIsNotAShardedExperiment,
  aHandBuiltOneIsNotEither,
};

/* -------------------------------------------------------------------------- *
 * What can be sharded
 * -------------------------------------------------------------------------- */

describe('ShardedExperiment.of — the fan-out is cut, and bounded, before anything runs', () => {
  it('cuts the budget into contiguous blocks that partition it, largest first', () => {
    const sharded = ShardedExperiment.of(plan, { shards: 3, ceiling: CEILING });
    expect(sharded.blocks).toEqual([
      { index: 0, from: 0, to: 3 },
      { index: 1, from: 3, to: 5 },
      { index: 2, from: 5, to: 7 },
    ]);
    expect(sharded.plannedReplicationRuns).toBe(28);
    expect(sharded.plan).toBe(plan);

    const lopsided = ShardedExperiment.of(plan, { shards: [1, 5, 1], ceiling: CEILING });
    expect(lopsided.blocks).toEqual([
      { index: 0, from: 0, to: 1 },
      { index: 1, from: 1, to: 6 },
      { index: 2, from: 6, to: 7 },
    ]);
  });

  it('refuses a layout that is not a partition of the budget', () => {
    // The control, so the refusals below cannot pass by refusing everything.
    expect(ShardedExperiment.of(plan, { shards: [3, 4], ceiling: CEILING }).blocks).toHaveLength(2);
    for (const shards of [0, 8, 2.5, [3, 3], [0, 7], [3.5, 3.5], [7, 0], []]) {
      expect(() => ShardedExperiment.of(plan, { shards, ceiling: CEILING }), String(shards)).toThrow(
        RunnerError,
      );
    }
  });

  it('criterion 7: refuses a fan-out whose planned replication-runs exceed the declared ceiling', () => {
    // Refused by the factory, which is synchronous and runs nothing: there is no ShardedExperiment
    // to hand runShard, so there is no route by which a replication could start.
    expect(() => ShardedExperiment.of(plan, { shards: 2, ceiling: { replicationRuns: 27 } })).toThrow(
      /28 replication-runs.*ceiling of 27/su,
    );
    for (const replicationRuns of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => ShardedExperiment.of(plan, { shards: 2, ceiling: { replicationRuns } })).toThrow(
        RunnerError,
      );
    }
  });

  it('refuses a budget the results could shorten, because a shard cannot see the other blocks', () => {
    // min < max with stopOnSaturation: a cell that saturates stops at min, and which replications
    // run is then a function of results a block does not have.
    const adaptive = planExperiment(
      specOf({
        id: 'adaptive',
        dispatchers: ['collective', 'nearest-car'],
        replication: { minReplications: 4, maxReplications: 8, checkEvery: 2 },
      }),
      config,
      { keepRecords: false },
    );
    expect(() => ShardedExperiment.of(adaptive, { shards: 2, ceiling: { replicationRuns: 100 } })).toThrow(
      /fixed budget/u,
    );
  });

  it('refuses a plan that records failures, because a pair with a missing side is not a pair', () => {
    const recording = planExperiment(COMPARISON, config, {
      keepRecords: false,
      onReplicationError: 'record',
    });
    expect(() => ShardedExperiment.of(recording, { shards: 2, ceiling: CEILING })).toThrow(
      /onReplicationError/u,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Criterion 1
 * -------------------------------------------------------------------------- */

describe('criterion 1 — a sharded run reproduces the unsharded run', () => {
  it('one shard is byte-identical to not sharding at all', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 1, ceiling: CEILING });
    const merged = mergeShards(sharded, await runAll(sharded));

    expect(fingerprintExperiment(merged.result)).toBe(fingerprintExperiment(unsharded));
    expect(differingPaths(measuredOf(merged.result), measuredOf(unsharded))).toEqual([]);
    expect(merged.result.plan).toBe(unsharded.plan);
    // Non-vacuity: the fixture really does exercise a stopping reason other than the default.
    expect(unsharded.cells.map((cell) => cell.stopping.reason)).toContain('saturated');
    expect(unsharded.cells.map((cell) => cell.stopping.reason)).toContain('fixed-budget');
  });

  it.each([
    { label: 'k = 2 (4 + 3)', shards: 2 as number | readonly number[] },
    { label: 'k = 3 (3 + 2 + 2)', shards: 3 },
    { label: 'uneven [1, 5, 1]', shards: [1, 5, 1] },
  ])('$label: structural digest exactly, magnitudes within § D202 — and exact on this machine', async ({ shards }) => {
    const sharded = ShardedExperiment.of(plan, { shards, ceiling: CEILING });
    const merged = mergeShards(sharded, await runAll(sharded));

    const mine = identitySplitOf(measuredOf(merged.result));
    const reference = identitySplitOf(measuredOf(unsharded));
    expect(mine.structural).toBe(reference.structural);
    expect(mine.magnitudes.length).toBe(reference.magnitudes.length);
    expect(mine.magnitudes.length).toBeGreaterThan(100);
    const outside = mine.magnitudes.filter(
      (value, index) => !withinD202(value, reference.magnitudes[index] as number),
    );
    expect(outside).toEqual([]);

    // One machine: the tolerance above is not needed here, and exactness is the stronger claim.
    expect(fingerprintExperiment(merged.result)).toBe(fingerprintExperiment(unsharded));
    expect(differingPaths(measuredOf(merged.result), measuredOf(unsharded))).toEqual([]);
  });

  it('survives the shard file: serialize, deserialize, merge — still byte-identical', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const results = await runAll(sharded);
    const context = { building: 'garden-apartments', reps: REPS, serial: true };
    const read = results.map((result) => deserializeShard(serializeShard(result, context)));
    for (const [index, entry] of read.entries()) {
      expect(entry.context).toEqual(context);
      expect(differingPaths(entry.result, results[index])).toEqual([]);
    }
    const merged = mergeShards(
      sharded,
      read.map((entry) => entry.result),
    );
    expect(fingerprintExperiment(merged.result)).toBe(fingerprintExperiment(unsharded));
    expect(differingPaths(measuredOf(merged.result), measuredOf(unsharded))).toEqual([]);
  });

  it('writes NaN, the infinities and -0 back exactly, which JSON on its own would not', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const result = await runShard(sharded, 1);
    const edited = structuredClone(result) as unknown as {
      rows: { records: { metrics: Record<string, number> }[]; differences: Record<string, number>[] }[];
    };
    const row = edited.rows[0];
    if (row === undefined) throw new Error('no row');
    const metrics = row.records[0]?.metrics;
    const difference = row.differences[0];
    if (metrics === undefined || difference === undefined) throw new Error('no record');
    metrics['awtS'] = Number.NaN;
    metrics['wt95S'] = -0;
    metrics['maxWaitS'] = Number.POSITIVE_INFINITY;
    difference['awtS'] = Number.NEGATIVE_INFINITY;

    const back = deserializeShard(serializeShard(edited as unknown as ShardResult)).result;
    expect(differingPaths(back, edited)).toEqual([]);
    expect(Object.is(back.rows[0]?.records[0]?.metrics.wt95S, -0)).toBe(true);
    expect(Number.isNaN(back.rows[0]?.records[0]?.metrics.awtS)).toBe(true);
  });

  it('refuses to write a value JSON would lose, rather than writing it lossily', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const result = await runShard(sharded, 1);
    const withRecord = structuredClone(result) as unknown as { rows: { records: { record?: unknown }[] }[] };
    const first = withRecord.rows[0]?.records[0];
    if (first === undefined) throw new Error('no record');
    first.record = { floorsById: new Map([['G', 0]]) };
    expect(() => serializeShard(withRecord as unknown as ShardResult)).toThrow(RunnerError);
  });
});

/* -------------------------------------------------------------------------- *
 * Criterion 2
 * -------------------------------------------------------------------------- */

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SHARD_SOURCE = fileURLToPath(new URL('./shard.js', import.meta.url));
const TYPES_SOURCE = fileURLToPath(new URL('./types.js', import.meta.url));
const run = promisify(execFile);
const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

/**
 * One attempt per line, each the shape of a split a caller might reach for, and the diagnostic the
 * compiler is expected to raise on it. Written to a file and compiled; never executed.
 */
const TYPE_ATTEMPTS: readonly { readonly what: string; readonly line: string; readonly code: string }[] = [
  {
    what: 'a run option naming the arms this shard should run',
    line: "void runShard(sharded, 0, { onReplication: tick, dispatcherArmIds: ['A'] });",
    code: 'TS2353',
  },
  {
    what: 'a run option naming the cells this shard should run',
    line: "void runShard(sharded, 1, { onReplication: tick, cellIds: ['garden-apartments|healthy|B'] });",
    code: 'TS2353',
  },
  {
    what: 'a layout that assigns arms to blocks',
    line: "void ShardedExperiment.of(plan, { shards: [{ size: 4, arms: ['A'] }, { size: 3, arms: ['B'] }], ceiling });",
    code: 'TS2322',
  },
  {
    what: 'a second request field to put an assignment in',
    line: "void ShardedExperiment.of(plan, { shards: 2, ceiling, arms: [['A'], ['B']] });",
    code: 'TS2353',
  },
  {
    what: 'a one-arm plan run as a block of the comparison',
    line: 'void runShard(onlyA, 0);',
    code: 'TS2740',
  },
  {
    what: 'a hand-built sharded experiment wearing the comparison’s digest',
    line: 'void runShard({ plan: onlyA, planDigest: sharded.planDigest, blocks: sharded.blocks, ceiling, plannedReplicationRuns: 28 }, 0);',
    code: 'TS2741',
  },
  {
    what: 'minting one past the factory',
    line: 'void new ShardedExperiment(onlyA, sharded.planDigest, sharded.blocks, ceiling);',
    code: 'TS2673',
  },
  {
    what: 'a stopping rule, which decides from results which replications run',
    line: 'void runShard(sharded, 0, { onReplication: tick, stoppingRule: () => true });',
    code: 'TS2353',
  },
];

function fixturePreamble(): readonly string[] {
  return [
    `import { ShardedExperiment, mergeShards, runShard } from ${JSON.stringify(SHARD_SOURCE)};`,
    `import type { ShardCeiling } from ${JSON.stringify(SHARD_SOURCE)};`,
    `import type { ExperimentPlan, ReplicationRecord } from ${JSON.stringify(TYPES_SOURCE)};`,
    'declare const plan: ExperimentPlan;',
    'declare const onlyA: ExperimentPlan;',
    'declare const sharded: ShardedExperiment;',
    'declare const ceiling: ShardCeiling;',
    'declare const tick: (record: ReplicationRecord) => void;',
    'void mergeShards;',
  ];
}

describe('criterion 2 — a comparison’s arms cannot be split across shards', () => {
  it('runs every cell at every replication of its block, on the plan’s own seeds', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: [1, 5, 1], ceiling: CEILING });
    const result = await runShard(sharded, 1);
    expect(result.rows.map((row) => row.replication)).toEqual([1, 2, 3, 4, 5]);
    expect(result.cellIds).toEqual(plan.cells.map((cell) => cell.cellId));
    for (const row of result.rows) {
      expect(row.records.map((record) => record.runId)).toEqual(
        plan.cells.map((cell) => `shard-comparison/${cell.cellId}#r${row.replication}`),
      );
      for (const record of row.records) {
        expect(record.seed).toBe(replicationSeed(COMPARISON.seed, row.replication).toString());
      }
    }
    expect(result.spend.replicationRuns).toBe(4 * 5);
  });

  it('refuses at the type: the surface a shard is made of has no field that could name an arm', () => {
    // The values are `true` by construction; what makes this a check is that `tsc -b` compiled the
    // annotations on `SURFACE_PINS`. This line keeps the pins in use and names them in a failure.
    expect(SURFACE_PINS).toEqual({
      runOptionsCarryOnlyTheHook: true,
      requestCarriesOnlyLayoutAndCeiling: true,
      layoutIsACountOrBlockSizes: true,
      aShardIsNamedByAnIndex: true,
      aPlanIsNotAShardedExperiment: true,
      aHandBuiltOneIsNotEither: true,
    });
  });

  it('refuses at the type, by trying: the compiler rejects every attempt and accepts the control', async () => {
    // The spawned compiler resolves `@elevator-sim/core` to its build, as `tsc -b` does.
    assertCoreBuilt();
    const dir = await mkdtemp(join(tmpdir(), 'elevator-sim-shard-types-'));
    tempDirs.push(dir);

    const preamble = fixturePreamble();
    const attempts = [...preamble, ...TYPE_ATTEMPTS.map((attempt) => attempt.line)];
    const control = [
      ...preamble,
      'const cut = ShardedExperiment.of(plan, { shards: [4, 3], ceiling });',
      'void runShard(cut, 0, { onReplication: tick });',
      'void runShard(cut, 1);',
      'void mergeShards(cut, []);',
    ];
    await writeFile(join(dir, 'attempts.mts'), `${attempts.join('\n')}\n`, 'utf8');
    await writeFile(join(dir, 'control.mts'), `${control.join('\n')}\n`, 'utf8');
    const project = join(dir, 'tsconfig.json');
    await writeFile(
      project,
      JSON.stringify({
        extends: join(REPO_ROOT, 'tsconfig.base.json'),
        compilerOptions: {
          composite: false,
          incremental: false,
          declaration: false,
          declarationMap: false,
          sourceMap: false,
          noEmit: true,
          types: ['node'],
          typeRoots: [join(REPO_ROOT, 'node_modules', '@types')],
        },
        include: [join(dir, 'attempts.mts'), join(dir, 'control.mts')],
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

    const diagnostics = [...output.matchAll(/([^\s()]+)\((\d+),\d+\): error (TS\d+)/gu)].map((match) => ({
      file: match[1] ?? '',
      line: Number(match[2]),
      code: match[3] ?? '',
    }));
    // The control compiles clean, so every error below is the attempt's and not the harness's.
    expect(
      diagnostics.filter((diagnostic) => !diagnostic.file.endsWith('attempts.mts')),
      output,
    ).toEqual([]);
    // Every attempt judged before anything is asserted, so a failure names all of them at once. The
    // code is required as well as an error, so an unrelated error on a line cannot stand in for it.
    const failures = TYPE_ATTEMPTS.flatMap((attempt, index) => {
      const line = preamble.length + index + 1;
      const codes = diagnostics.filter((diagnostic) => diagnostic.line === line).map((d) => d.code);
      if (codes.length === 0) return [`ACCEPTED by the compiler: ${attempt.what}`];
      if (!codes.includes(attempt.code)) {
        return [`refused with ${codes.join(', ')} rather than ${attempt.code}: ${attempt.what}`];
      }
      return [];
    });
    expect(failures, output).toEqual([]);
    // And nothing in the preamble was what failed.
    expect(diagnostics.filter((diagnostic) => diagnostic.line <= preamble.length)).toEqual([]);
  }, 120_000);

  it('refuses at the entry point: every attempt, forced past the compiler, before a replication runs', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const onlyA = planExperiment(
      { ...COMPARISON, dispatchers: [{ id: 'A', profile: 'collective' }] },
      config,
      { keepRecords: false },
    );
    let ran = 0;
    const tick = (): void => {
      ran += 1;
    };
    const options = (value: object): ShardRunOptions => value as unknown as ShardRunOptions;
    const request = (value: object): ShardingRequest => value as unknown as ShardingRequest;
    const forged = (value: object): ShardedExperiment => value as unknown as ShardedExperiment;

    const attempts: readonly (() => unknown)[] = [
      () => runShard(sharded, 0, options({ onReplication: tick, dispatcherArmIds: ['A'] })),
      () => runShard(sharded, 1, options({ onReplication: tick, cellIds: ['garden-apartments|healthy|B'] })),
      () => ShardedExperiment.of(plan, request({ shards: [{ size: 4, arms: ['A'] }, { size: 3, arms: ['B'] }], ceiling: CEILING })),
      () => ShardedExperiment.of(plan, request({ shards: 2, ceiling: CEILING, arms: [['A'], ['B']] })),
      () => runShard(forged(onlyA), 0, { onReplication: tick }),
      () =>
        runShard(
          forged({ plan: onlyA, planDigest: sharded.planDigest, blocks: sharded.blocks, ceiling: CEILING, plannedReplicationRuns: 28 }),
          0,
          { onReplication: tick },
        ),
      () => runShard(sharded, 0, options({ onReplication: tick, stoppingRule: () => true })),
      // `private` binds only the compiler. Built past it — the right plan and digest, and a ceiling
      // of 1 that `ShardedExperiment.of` would have refused — the instance was never minted.
      () =>
        runShard(
          Reflect.construct(ShardedExperiment, [plan, sharded.planDigest, [{ index: 0, from: 0, to: REPS }], { replicationRuns: 1 }, 28]) as ShardedExperiment,
          0,
          { onReplication: tick },
        ),
      () => runShard(sharded, 2, { onReplication: tick }),
    ];
    for (const [index, attempt] of attempts.entries()) {
      await expect(Promise.resolve().then(attempt), `attempt ${index}`).rejects.toThrow(RunnerError);
    }
    expect(ran).toBe(0);
  });

  it('refuses at the entry point: one whole one-arm plan per arm does not merge into the comparison', async () => {
    const armPlan = (id: 'A' | 'B'): ExperimentPlan =>
      planExperiment(
        { ...COMPARISON, dispatchers: [{ id, profile: id === 'A' ? 'collective' : 'nearest-car' }] },
        config,
        { keepRecords: false },
      );
    const perArm: ShardResult[] = [];
    for (const id of ['A', 'B'] as const) {
      const armOnly = ShardedExperiment.of(armPlan(id), { shards: 1, ceiling: CEILING });
      perArm.push(await runShard(armOnly, 0));
    }
    const comparison = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });

    expect(() => mergeShards(comparison, perArm)).toThrow(/different plan/u);

    // Relabelled as the comparison's two blocks — digest, index, count, layout, block and rows all
    // rewritten to match — each still carries one arm, and that is what is refused.
    const relabel = (result: ShardResult, index: number): ShardResult => {
      const block = comparison.blocks[index];
      if (block === undefined) throw new Error('no block');
      return {
        ...result,
        planDigest: comparison.planDigest,
        index,
        count: 2,
        layout: [4, 3],
        block,
        rows: result.rows.slice(block.from, block.to),
      };
    };
    const [a, b] = perArm;
    if (a === undefined || b === undefined) throw new Error('missing arm result');
    expect(() => mergeShards(comparison, [relabel(a, 0), relabel(b, 1)])).toThrow(
      /every arm of every cell/u,
    );
  });

  it('refuses at the entry point: a shard file edited to drop an arm', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const [first, second] = await runAll(sharded);
    if (first === undefined || second === undefined) throw new Error('missing shard');

    const file = JSON.parse(serializeShard(second)) as {
      result: {
        cellIds: string[];
        pairs: unknown[];
        rows: { records: unknown[]; differences: unknown[] }[];
      };
    };
    const dropped = file.result.cellIds.flatMap((id, index) => (id.endsWith('|B') ? [index] : []));
    expect(dropped).toHaveLength(2);
    file.result.cellIds = file.result.cellIds.filter((id) => !id.endsWith('|B'));
    file.result.pairs = [];
    for (const row of file.result.rows) {
      row.records = row.records.filter((_, index) => !dropped.includes(index));
      row.differences = [];
    }
    const edited = deserializeShard(JSON.stringify(file)).result;

    expect(() => mergeShards(sharded, [first, edited])).toThrow(/every arm of every cell/u);
    // The control: the same two files, unedited, merge.
    expect(() => mergeShards(sharded, [first, second])).not.toThrow();
  });

  it('refuses a missing, duplicated, misplaced or foreign block', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const [first, second] = await runAll(sharded);
    if (first === undefined || second === undefined) throw new Error('missing shard');

    expect(() => mergeShards(sharded, [first])).toThrow(/1 of the 2 shards/u);
    expect(() => mergeShards(sharded, [first, first])).toThrow(/more than once/u);
    expect(() => mergeShards(sharded, [first, { ...second, block: { index: 1, from: 3, to: 7 } }])).toThrow(
      /block/u,
    );
    expect(() =>
      mergeShards(sharded, [first, { ...second, ceiling: { replicationRuns: 1_000 } }]),
    ).toThrow(/ceiling/u);

    const otherSeed = planExperiment({ ...COMPARISON, seed: 7 }, config, { keepRecords: false });
    const foreign = await runShard(ShardedExperiment.of(otherSeed, { shards: 2, ceiling: CEILING }), 1);
    expect(() => mergeShards(sharded, [first, foreign])).toThrow(/different plan/u);
    expect(() => mergeShards(sharded, [first, { ...foreign, planDigest: sharded.planDigest }])).toThrow(
      /seed/u,
    );
  });

  it('refuses a block run against different data, although its cells, seeds and trace keys all match', async () => {
    const collective = config.dispatcherProfilesById.get('collective');
    if (collective === undefined) throw new Error('no collective profile');
    const retuned = new Map(config.dispatcherProfilesById);
    retuned.set('collective', { ...collective, weights: { ...collective.weights, waitTime: 2 } });
    const otherData = planExperiment(COMPARISON, { ...config, dispatcherProfilesById: retuned }, { keepRecords: false });

    // Everything a structural check on ids could compare is equal; only the data is not.
    expect(otherData.cells.map((cell) => [cell.cellId, cell.traceKey])).toEqual(
      plan.cells.map((cell) => [cell.cellId, cell.traceKey]),
    );
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const other = ShardedExperiment.of(otherData, { shards: 2, ceiling: CEILING });
    expect(other.planDigest).not.toBe(sharded.planDigest);

    const mine = await runShard(sharded, 0);
    const theirs = await runShard(other, 1);
    expect(theirs.rows[0]?.records[0]?.seed).toBe(replicationSeed(COMPARISON.seed, 4).toString());
    expect(() => mergeShards(sharded, [mine, theirs])).toThrow(/different plan/u);
  });

  it('refuses a row whose stored differences its own records do not support', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const [first, second] = await runAll(sharded);
    if (first === undefined || second === undefined) throw new Error('missing shard');
    const edited = structuredClone(second) as unknown as { rows: { differences: Record<string, number>[] }[] };
    const difference = edited.rows[1]?.differences[0];
    if (difference === undefined) throw new Error('no difference');
    difference['ttdMeanS'] = (difference['ttdMeanS'] ?? 0) + 1;
    expect(() => mergeShards(sharded, [first, edited as unknown as ShardResult])).toThrow(
      /do not match its own records/u,
    );
  });

  it('aggregates only differences a shard computed, concatenated in replication order', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 3, ceiling: CEILING });
    const results = await runAll(sharded);
    const merged = mergeShards(sharded, results);

    expect(merged.pairs.map((pair) => `${pair.candidateCellId} − ${pair.baselineCellId}`)).toEqual([
      'garden-apartments|healthy|A − garden-apartments|healthy|B',
      'garden-apartments|saturated|A − garden-apartments|saturated|B',
    ]);
    for (const [pairIndex, pair] of merged.pairs.entries()) {
      for (const metric of REPLICATION_METRICS) {
        const fromShards = results.flatMap((result) =>
          result.rows.map((row) => row.differences[pairIndex]?.[metric]),
        );
        expect(differingPaths(pair.differences[metric], fromShards), metric).toEqual([]);
      }
    }
    // A shard carries per-replication records and differences, and no aggregate a merge could average.
    for (const result of results) {
      expect(serializeShard(result)).not.toMatch(/"aggregate"|"statistic"/u);
    }
  });

  it('gives the unsharded paired interval, bit for bit, wherever one exists', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: [1, 5, 1], ceiling: CEILING });
    const merged = mergeShards(sharded, await runAll(sharded));
    let compared = 0;
    for (const [pairIndex, pair] of merged.pairs.entries()) {
      const traffic = pairIndex === 0 ? 'healthy' : 'saturated';
      for (const metric of REPLICATION_METRICS) {
        const a = cellOf(unsharded.cells, traffic, 'A').aggregate.metrics[metric].samples;
        const b = cellOf(unsharded.cells, traffic, 'B').aggregate.metrics[metric].samples;
        if (![...a, ...b].every(Number.isFinite)) continue;
        const reference = pairedDifferenceEstimate(a, b);
        const mine = estimateMean(pair.differences[metric]);
        expect(differingPaths(mine, reference), `${traffic} ${metric}`).toEqual([]);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(20);
  });
});

/* -------------------------------------------------------------------------- *
 * Criterion 5
 * -------------------------------------------------------------------------- */

describe('criterion 5 — the resolution limit is recomputed at the merged n, never inherited', () => {
  it('a block’s smallest detectable effect is not the merged one, and the merged one is the unsharded one', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const results = await runAll(sharded);
    const merged = mergeShards(sharded, results);
    const metric: ReplicationMetric = 'ttdMeanS';

    const limitOf = (differences: readonly number[]): { readonly n: number; readonly sde: number } => {
      const estimate = estimateMean(differences);
      return { n: estimate.n, sde: smallestDetectableEffect(estimate.stdDev, estimate.n) };
    };
    const perShard = results.map((result) =>
      limitOf(result.rows.map((row) => row.differences[0]?.[metric] ?? Number.NaN)),
    );
    const atMergedN = limitOf(merged.pairs[0]?.differences[metric] ?? []);

    const a = cellOf(unsharded.cells, 'healthy', 'A').aggregate.metrics[metric].samples;
    const b = cellOf(unsharded.cells, 'healthy', 'B').aggregate.metrics[metric].samples;
    const reference = pairedDifferenceEstimate(a, b);
    const unshardedLimit = smallestDetectableEffect(reference.stdDev, reference.n);

    expect(perShard.map((limit) => limit.n)).toEqual([4, 3]);
    expect(atMergedN.n).toBe(REPS);
    expect(Number.isFinite(atMergedN.sde)).toBe(true);
    expect(atMergedN.sde).toBe(unshardedLimit);
    for (const limit of perShard) expect(limit.sde).not.toBe(atMergedN.sde);
  });
});

/* -------------------------------------------------------------------------- *
 * Criterion 7's second half
 * -------------------------------------------------------------------------- */

describe('criterion 7 — spend is reported beside the result, never folded into it', () => {
  it('reports runs and wall seconds per shard and in total, and the measured result carries none of it', async () => {
    const sharded = ShardedExperiment.of(plan, { shards: 2, ceiling: CEILING });
    const merged = mergeShards(sharded, await runAll(sharded));

    expect(merged.spend.ceiling).toEqual(CEILING);
    expect(merged.spend.plannedReplicationRuns).toBe(28);
    expect(merged.spend.replicationRuns).toBe(28);
    expect(merged.spend.shards.map((shard) => shard.replicationRuns)).toEqual([16, 12]);
    expect(merged.spend.shards.map((shard) => shard.block)).toEqual(sharded.blocks);
    for (const shard of merged.spend.shards) {
      expect(Number.isFinite(shard.wallSeconds) && shard.wallSeconds >= 0).toBe(true);
      expect(shard.executor).toBe('serial');
    }
    expect(merged.spend.wallSeconds).toBeCloseTo(
      merged.spend.shards.reduce((total, shard) => total + shard.wallSeconds, 0),
      9,
    );

    // Beside, not inside: no execution or spend key on the measured result, and its fingerprint is
    // the unsharded one although nothing about the two runs' timing agrees.
    expect(Object.keys(merged.result)).not.toContain('execution');
    expect(Object.keys(merged.result)).not.toContain('spend');
    expect(fingerprintExperiment(merged.result)).toBe(fingerprintExperiment(unsharded));
  });
});
