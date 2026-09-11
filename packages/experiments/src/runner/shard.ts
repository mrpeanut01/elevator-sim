/**
 * **Measurement fan-out, sharded by replication block** — `docs/15-compute-offload-contract.md`
 * Phase B, GitHub issue #413.
 *
 * ## The non-test caller
 *
 * `packages/cli/src/commands/compare.ts`. `elevator-sim compare --shard k/n --out <file>` mints a
 * {@link ShardedExperiment}, runs block `k` with {@link runShard} and writes it with
 * {@link serializeShard}; `elevator-sim compare --merge <file...>` reads the blocks back with
 * {@link deserializeShard} and takes its verdict from {@link mergeShards}. `runner/deadCode.test.ts`
 * reads the path this paragraph names and requires that file to be the non-test importer of those
 * five names, so the sentence cannot outlive the wiring.
 *
 * ## The unit of distribution is a replication, never an arm
 *
 * `docs/15` § 0.1: common random numbers pair alternatives *within one run on one machine*, so a
 * fleet that put one arm on one machine and the other on another would still print numbers, having
 * discarded the pairing. A block is therefore a set of **replication indices over the whole plan**,
 * and {@link runShard} runs every cell of the plan at every index of its block. Nothing it takes can
 * name fewer:
 *
 * - its only per-shard argument is the block's **index**;
 * - {@link ShardRunOptions} carries a progress hook and nothing else, and a key it does not declare
 *   is refused at run time as well as by the compiler;
 * - {@link ShardingRequest} is a count or a list of block **sizes**, plus a ceiling, so there is
 *   nowhere to put an assignment of arms to blocks;
 * - {@link ShardedExperiment} is **nominal**: its plan sits in a private field and its constructor is
 *   private, so an object built by hand around a one-arm plan does not type, and {@link runShard}
 *   refuses at run time anything {@link ShardedExperiment.of} did not mint.
 *
 * `shard.test.ts` asserts each of those by trying: it compiles the attempts with the real compiler
 * and requires a diagnostic on every one, and it forces each past the compiler and requires the
 * entry point to refuse it before a replication runs.
 *
 * What stays expressible is sharding a *different*, whole plan — a one-arm plan is a legitimate
 * experiment of its own. Its blocks carry that plan's digest and cells, and {@link mergeShards}
 * refuses them as blocks of any other plan.
 *
 * ## Within a shard, and never across
 *
 * A {@link ShardResult} is rows, one per replication of its block. A row holds the record of every
 * cell at that index and, for every pair of cells in one CRN cohort, every metric's paired
 * difference `candidate − baseline`, computed by {@link runShard} from that row's own records.
 * {@link mergeShards} concatenates those stored differences in replication order. It takes no mean of
 * a shard's means — a shard carries none — and rebuilds each cell's aggregate from its
 * per-replication records at the merged `n`, through the runner's own `aggregateCell`. It also
 * re-derives every stored difference from its row's records and refuses a row where the two
 * disagree.
 *
 * **What the merge does not do is authenticate a file.** A row assembled by hand from two runs, with
 * its differences recomputed to match, is indistinguishable from a genuine row: that is unchecked,
 * and stated here so the structural checks are not read as a signature.
 *
 * ## What cannot be sharded, refused before anything runs
 *
 * - **A budget the results could shorten.** With `minReplications < maxReplications` a saturating
 *   cell stops at the minimum, so which replications run depends on results a block cannot see.
 * - **A stopping rule**, for the same reason; {@link ShardRunOptions} has no field for one.
 * - **`onReplicationError: 'record'`**, because a pair with a failed side is not a pair.
 * - **A fan-out over its ceiling** (`docs/15` criterion 7). The ceiling is declared in
 *   replication-runs — cells × replications over every block — and compared with the plan's own
 *   count by {@link ShardedExperiment.of}, which is synchronous and starts nothing. CPU-seconds are
 *   not a ceiling here: they are not known before the run, and a ceiling enforced by aborting part
 *   way would make which replications exist depend on a clock.
 *
 * ## Spend, beside
 *
 * Each shard reports its replication-runs, its wall seconds and its executor, and
 * {@link mergeShards} reports them per shard and in total in {@link MergedExperiment.spend}. The
 * measured result is a `MeasuredExperiment`, which has no field for spend or for an executor, so the
 * cost of an answer cannot be folded into it — and its fingerprint is the unsharded run's.
 *
 * ## The file
 *
 * {@link serializeShard} writes JSON that keeps `NaN`, both infinities and `-0` — JSON alone writes
 * the first three as `null` and the last as `0` — and refuses, rather than drops, a `Map`, a `Set`, a
 * `bigint` or a function. {@link deserializeShard} checks the fields the merge reads and passes a
 * record's `summary` through unchecked. The plan digest is SHA-256 over the plan's canonical JSON with
 * every cell's simulation config in it, so on one machine a block run against a different data
 * directory is refused as a different plan. **Whether two machines derive the same digest for the
 * same data is unchecked**: no cross-machine run has been taken.
 */

import { createHash } from 'node:crypto';

import { canonicalJson, replicationSeed } from './crn.js';
import { REPLICATION_METRICS } from './metrics.js';
import type { ReplicationMetric } from './metrics.js';
import { createExecutor } from './parallel.js';
import { runIdFor } from './replication.js';
import {
  aggregateCell,
  fixedBudgetStoppingSummary,
  recordOf,
  trafficSeedFor,
} from './replicationRunner.js';
import type {
  CellResult,
  ExecutorKind,
  ExperimentCell,
  ExperimentPlan,
  MeasuredExperiment,
  RawReplicationOutcome,
  ReplicationRecord,
  ReplicationTask,
} from './types.js';
import { EXECUTOR_KINDS, RunnerError } from './types.js';

/** The `format` a shard file declares, versioned so a later layout is refused rather than misread. */
export const SHARD_FILE_FORMAT = 'elevator-sim/replication-shard@1';

/* -------------------------------------------------------------------------- *
 * The request
 * -------------------------------------------------------------------------- */

/** `docs/15` criterion 7's ceiling, declared before the first block runs. */
export interface ShardCeiling {
  /** The most replication-runs — cells × replications, over every block — the fan-out may spend. */
  readonly replicationRuns: number;
}

/** How to cut a plan. There is deliberately no field that could assign an arm to a block. */
export interface ShardingRequest {
  /**
   * How many blocks, as even as the budget divides with the larger blocks first — or each block's
   * size, in replication order, summing to the budget.
   */
  readonly shards: number | readonly number[];
  readonly ceiling: ShardCeiling;
}

/** A contiguous run of replication indices, half-open. */
export interface ReplicationBlock {
  readonly index: number;
  /** First replication index, inclusive. */
  readonly from: number;
  /** One past the last replication index. */
  readonly to: number;
}

/** What {@link runShard} takes besides the block's index: a progress hook, and nothing else. */
export interface ShardRunOptions {
  /** Called once per replication, in task order, as `ExperimentRunOptions.onReplication` is. */
  readonly onReplication?: ((record: ReplicationRecord, cell: ExperimentCell) => void) | undefined;
}

/* -------------------------------------------------------------------------- *
 * The results
 * -------------------------------------------------------------------------- */

/** Two cells of one CRN cohort, in plan order: every difference is `candidate − baseline`. */
export interface ShardPair {
  readonly candidateCellId: string;
  readonly baselineCellId: string;
}

/** One replication of a block: every cell's record, and every pair's differences from them. */
export interface ReplicationRow {
  readonly replication: number;
  /** One per plan cell, in plan order. */
  readonly records: readonly ReplicationRecord[];
  /** One per {@link ShardResult.pairs} entry, computed from {@link records} inside the shard. */
  readonly differences: readonly Readonly<Record<ReplicationMetric, number>>[];
}

/** What one block cost. Reported, never compared, and never part of what was measured. */
export interface ShardSpend {
  readonly replicationRuns: number;
  readonly wallSeconds: number;
  readonly executor: ExecutorKind;
  readonly workers: number;
}

/** One block, run. Plain data, so it survives {@link serializeShard}. */
export interface ShardResult {
  readonly planDigest: string;
  readonly experimentId: string;
  /** Decimal string. CLAUDE.md invariant 5: the seed travels with the records. */
  readonly experimentSeed: string;
  readonly experimentTrafficSeed?: string | undefined;
  readonly index: number;
  readonly count: number;
  /** Every block's size, so each result names the partition it belongs to. */
  readonly layout: readonly number[];
  readonly block: ReplicationBlock;
  readonly ceiling: ShardCeiling;
  readonly cellIds: readonly string[];
  readonly pairs: readonly ShardPair[];
  readonly rows: readonly ReplicationRow[];
  readonly spend: ShardSpend;
}

/** A pair's differences over the whole budget, in replication order. */
export interface MergedPair extends ShardPair {
  readonly differences: Readonly<Record<ReplicationMetric, readonly number[]>>;
}

/** What the whole fan-out cost, per block and in total. */
export interface FanOutSpend {
  readonly ceiling: ShardCeiling;
  readonly plannedReplicationRuns: number;
  readonly replicationRuns: number;
  /** Summed over blocks. Not the elapsed time of anything, since blocks may run concurrently. */
  readonly wallSeconds: number;
  readonly shards: readonly (ShardSpend & { readonly block: ReplicationBlock })[];
}

/** A merged fan-out: what was measured, the paired differences, and — beside them — the spend. */
export interface MergedExperiment {
  readonly result: MeasuredExperiment;
  readonly pairs: readonly MergedPair[];
  readonly spend: FanOutSpend;
}

/** A consumer's own description of a block, carried through a shard file verbatim. */
export type ShardContext = Readonly<Record<string, string | number | boolean>>;

export interface DeserializedShard {
  readonly result: ShardResult;
  readonly context: ShardContext;
}

/* -------------------------------------------------------------------------- *
 * Cutting a plan
 * -------------------------------------------------------------------------- */

/** Every instance {@link ShardedExperiment.of} minted, so a forged one is refused at run time too. */
const MINTED = new WeakSet<object>();

/**
 * A plan cut into replication blocks, under a ceiling checked before anything runs.
 *
 * Nominal on purpose: the plan is a private field and the constructor is private, so the only way to
 * hold one is {@link ShardedExperiment.of}, which derives the digest and the blocks from the plan
 * itself rather than accepting them.
 */
export class ShardedExperiment {
  readonly #plan: ExperimentPlan;
  readonly planDigest: string;
  readonly blocks: readonly ReplicationBlock[];
  readonly ceiling: ShardCeiling;
  /** Cells × replications: what the fan-out will spend if every block runs. */
  readonly plannedReplicationRuns: number;

  private constructor(
    plan: ExperimentPlan,
    planDigest: string,
    blocks: readonly ReplicationBlock[],
    ceiling: ShardCeiling,
    plannedReplicationRuns: number,
  ) {
    this.#plan = plan;
    this.planDigest = planDigest;
    this.blocks = blocks;
    this.ceiling = ceiling;
    this.plannedReplicationRuns = plannedReplicationRuns;
    MINTED.add(this);
    Object.freeze(this);
  }

  get plan(): ExperimentPlan {
    return this.#plan;
  }

  /**
   * Cut `plan` into blocks.
   *
   * @throws RunnerError before anything runs, for a budget that is not fixed, a plan that records
   *   failures, a layout that does not partition the budget, a malformed ceiling, or a fan-out whose
   *   planned replication-runs exceed the ceiling.
   */
  static of(plan: ExperimentPlan, request: ShardingRequest): ShardedExperiment {
    refuseUndeclaredKeys(request, ['shards', 'ceiling'], 'A sharding request');
    const { policy } = plan;
    if (policy.minReplications !== policy.maxReplications) {
      throw new RunnerError(
        `Sharding needs a fixed budget, and this plan's is ${policy.minReplications} to ${policy.maxReplications} replications. Below the maximum a saturating cell stops at the minimum, so which replications run would depend on results a block cannot see. Set minReplications equal to maxReplications.`,
        'replication',
      );
    }
    if (plan.onReplicationError !== 'throw') {
      throw new RunnerError(
        `Sharding needs onReplicationError: 'throw', and this plan records failures instead. A pair with a failed side is not a pair, and a block cannot drop a replication its sibling blocks kept.`,
        'onReplicationError',
      );
    }
    const ceiling = ceilingOf(request.ceiling);
    const budget = policy.maxReplications;
    const blocks = blocksOf(budget, request.shards);
    const planned = plan.cells.length * budget;
    if (planned > ceiling.replicationRuns) {
      throw new RunnerError(
        `This fan-out would spend ${planned} replication-runs (${plan.cells.length} cells × ${budget} replications) against a declared ceiling of ${ceiling.replicationRuns}. Nothing has run. Raise the ceiling or lower the budget.`,
        'ceiling',
      );
    }
    return new ShardedExperiment(plan, planDigestOf(plan), blocks, ceiling, planned);
  }
}

/* -------------------------------------------------------------------------- *
 * Running a block
 * -------------------------------------------------------------------------- */

/**
 * Run block `index`: every cell of the plan at every replication in the block, on the plan's seeds.
 *
 * Runs through the plan's own executor choice and `runOneReplication`, as `runPlan` does, so a
 * replication run here is the replication `runPlan` runs at that index.
 *
 * @throws RunnerError for an index that names no block, an option the type does not declare, an
 *   experiment {@link ShardedExperiment.of} did not mint, a plan mutated after it was cut, or a
 *   replication that threw.
 */
export async function runShard(
  sharded: ShardedExperiment,
  index: number,
  options?: ShardRunOptions | undefined,
): Promise<ShardResult> {
  const plan = mintedPlanOf(sharded);
  if (options !== undefined) {
    refuseUndeclaredKeys(
      options,
      ['onReplication'],
      'runShard’s options — a shard runs every arm of every cell, on a budget fixed by its plan —',
    );
  }
  const block = Number.isSafeInteger(index) ? sharded.blocks[index] : undefined;
  if (block === undefined) {
    throw new RunnerError(
      `runShard: ${String(index)} is not a block of this ${sharded.blocks.length}-block fan-out; blocks are numbered from 0.`,
    );
  }
  assertPlanUnchanged(sharded, plan);

  const tasks: ReplicationTask[] = [];
  for (const cell of plan.cells) {
    for (let replication = block.from; replication < block.to; replication += 1) {
      tasks.push({
        cellIndex: cell.index,
        replication,
        seed: replicationSeed(plan.experimentSeed, replication),
        ...(plan.experimentTrafficSeed === undefined
          ? {}
          : { trafficSeed: trafficSeedFor(plan, replication) }),
      });
    }
  }

  const { executor } = createExecutor(plan);
  const startedAt = Date.now();
  let outcomes: readonly RawReplicationOutcome[];
  try {
    outcomes = await executor.run(tasks);
  } finally {
    await executor.close();
  }
  const wallSeconds = (Date.now() - startedAt) / 1000;
  if (outcomes.length !== tasks.length) {
    throw new RunnerError(
      `Executor returned ${outcomes.length} outcomes for ${tasks.length} tasks. A batch must answer one outcome per task, in task order.`,
    );
  }

  const size = block.to - block.from;
  const columns: ReplicationRecord[][] = plan.cells.map(() => []);
  for (const [position, outcome] of outcomes.entries()) {
    const task = tasks[position];
    const cell = task === undefined ? undefined : plan.cells[task.cellIndex];
    if (task === undefined || cell === undefined) {
      throw new RunnerError(`Lost task ${position} while collecting a block's outcomes.`);
    }
    if (!outcome.ok) {
      throw new RunnerError(
        `Replication ${task.replication} of cell "${cell.cellId}" (seed ${outcome.seed}) threw ${outcome.error.name}: ${outcome.error.message}. A block cannot record a failure: a pair with a failed side is not a pair.`,
      );
    }
    const record = recordOf(outcome);
    (columns[task.cellIndex] as ReplicationRecord[])[task.replication - block.from] = record;
    options?.onReplication?.(record, cell);
  }

  const pairs = pairsOf(plan);
  const rows: ReplicationRow[] = [];
  for (let offset = 0; offset < size; offset += 1) {
    const records = Object.freeze(columns.map((column) => column[offset] as ReplicationRecord));
    rows.push(
      Object.freeze({
        replication: block.from + offset,
        records,
        differences: Object.freeze(pairs.map((pair) => differencesOf(plan, records, pair))),
      }),
    );
  }

  return Object.freeze({
    planDigest: sharded.planDigest,
    experimentId: plan.experimentId,
    experimentSeed: plan.experimentSeed.toString(),
    ...(plan.experimentTrafficSeed === undefined
      ? {}
      : { experimentTrafficSeed: plan.experimentTrafficSeed.toString() }),
    index: block.index,
    count: sharded.blocks.length,
    layout: layoutOf(sharded.blocks),
    block,
    ceiling: sharded.ceiling,
    cellIds: Object.freeze(plan.cells.map((cell) => cell.cellId)),
    pairs,
    rows: Object.freeze(rows),
    spend: Object.freeze({
      replicationRuns: tasks.length,
      wallSeconds,
      executor: executor.kind,
      workers: executor.workers,
    }),
  });
}

/* -------------------------------------------------------------------------- *
 * Merging
 * -------------------------------------------------------------------------- */

/**
 * Merge every block of one fan-out into what the unsharded run would have measured.
 *
 * Refuses a result from another plan, a block supplied twice or not at all, a result claiming another
 * block, layout or ceiling, a row missing any cell or run on any other seed, and a row whose stored
 * differences its own records do not give. Then concatenates each cell's records and each pair's
 * stored differences in replication order and rebuilds the aggregates and stopping summaries at the
 * merged `n`.
 */
export function mergeShards(
  sharded: ShardedExperiment,
  results: readonly ShardResult[],
): MergedExperiment {
  const plan = mintedPlanOf(sharded);
  assertPlanUnchanged(sharded, plan);
  const count = sharded.blocks.length;
  const cellIds = plan.cells.map((cell) => cell.cellId);
  const pairs = pairsOf(plan);
  const layout = layoutOf(sharded.blocks);
  const byIndex: (ShardResult | undefined)[] = sharded.blocks.map(() => undefined);

  for (const [position, result] of results.entries()) {
    const label = `Shard result ${position + 1} of ${results.length}`;
    if (result.planDigest !== sharded.planDigest) {
      throw new RunnerError(
        `${label} was produced by a different plan (digest ${abbreviate(result.planDigest)}; this fan-out's is ${abbreviate(sharded.planDigest)}): a different seed, set of cells or arms, budget, or data. Blocks of one plan cannot be merged into another.`,
      );
    }
    if (result.count !== count || !sameList(result.layout, layout)) {
      throw new RunnerError(
        `${label} belongs to a fan-out cut into blocks of [${String(result.layout)}], and this one is cut into [${layout.join(', ')}].`,
      );
    }
    const block = Number.isSafeInteger(result.index) ? sharded.blocks[result.index] : undefined;
    if (block === undefined) {
      throw new RunnerError(`${label} names block ${String(result.index)}, which this ${count}-block fan-out does not have.`);
    }
    if (byIndex[block.index] !== undefined) {
      throw new RunnerError(
        `Block ${block.index + 1} of ${count} (replications ${block.from}–${block.to - 1}) was supplied more than once.`,
      );
    }
    if (result.block.index !== block.index || result.block.from !== block.from || result.block.to !== block.to) {
      throw new RunnerError(
        `${label} claims block ${result.block.index + 1} as replications ${result.block.from}–${result.block.to - 1}; block ${block.index + 1} of this fan-out is replications ${block.from}–${block.to - 1}.`,
      );
    }
    if (result.ceiling.replicationRuns !== sharded.ceiling.replicationRuns) {
      throw new RunnerError(
        `${label} ran under a ceiling of ${result.ceiling.replicationRuns} replication-runs, and this fan-out declares ${sharded.ceiling.replicationRuns}. Every block of one fan-out runs under the one ceiling declared before it started.`,
      );
    }
    if (!sameList(result.cellIds, cellIds)) {
      throw new RunnerError(
        `${label} carries cells [${result.cellIds.join(', ')}], and the plan has [${cellIds.join(', ')}]. A block runs every arm of every cell, so a result carrying any other set cannot be merged.`,
      );
    }
    if (
      result.pairs.length !== pairs.length ||
      pairs.some(
        (pair, index) =>
          result.pairs[index]?.candidateCellId !== pair.candidateCellId ||
          result.pairs[index]?.baselineCellId !== pair.baselineCellId,
      )
    ) {
      throw new RunnerError(
        `${label} pairs its cells differently from the plan's CRN cohorts, so its differences are not the comparison this plan makes.`,
      );
    }
    const size = block.to - block.from;
    if (result.rows.length !== size) {
      throw new RunnerError(`${label} holds ${result.rows.length} replications for a block of ${size}.`);
    }
    if (result.spend.replicationRuns !== cellIds.length * size) {
      throw new RunnerError(
        `${label} reports ${result.spend.replicationRuns} replication-runs for a block that holds ${cellIds.length * size}.`,
      );
    }
    for (const [offset, row] of result.rows.entries()) {
      checkRow(plan, label, row, block.from + offset, cellIds, pairs);
    }
    byIndex[block.index] = result;
  }

  const ordered: ShardResult[] = [];
  for (const [index, result] of byIndex.entries()) {
    if (result === undefined) {
      const block = sharded.blocks[index];
      throw new RunnerError(
        `Received ${results.length} of the ${count} shards this fan-out was cut into; block ${index + 1}${block === undefined ? '' : ` (replications ${block.from}–${block.to - 1})`} is missing.`,
      );
    }
    ordered.push(result);
  }

  const cells: CellResult[] = plan.cells.map((cell, column) => {
    const replications = Object.freeze(
      ordered.flatMap((result) => result.rows.map((row) => row.records[column] as ReplicationRecord)),
    );
    return {
      cellId: cell.cellId,
      buildingId: cell.buildingId,
      trafficArmId: cell.trafficArmId,
      dispatcherArmId: cell.dispatcherArmId,
      dispatcherProfileId: cell.dispatcherProfileId,
      traceKey: cell.traceKey,
      replications,
      failures: Object.freeze([]),
      aggregate: aggregateCell(replications),
      stopping: fixedBudgetStoppingSummary(plan, replications),
    };
  });

  const result: MeasuredExperiment = {
    experimentId: plan.experimentId,
    experimentSeed: plan.experimentSeed.toString(),
    ...(plan.experimentTrafficSeed === undefined
      ? {}
      : { experimentTrafficSeed: plan.experimentTrafficSeed.toString() }),
    plan,
    cells: Object.freeze(cells),
    cohorts: plan.cohorts,
    replicationsRun: cells.reduce((total, cell) => total + cell.replications.length, 0),
    failedReplications: cells.reduce((total, cell) => total + cell.failures.length, 0),
    saturated: cells.some((cell) => cell.aggregate.saturated),
    warnings: plan.warnings,
  };

  const merged: MergedPair[] = pairs.map((pair, pairIndex) => {
    const differences: Partial<Record<ReplicationMetric, readonly number[]>> = {};
    for (const metric of REPLICATION_METRICS) {
      differences[metric] = Object.freeze(
        ordered.flatMap((shard) =>
          shard.rows.map((row) => (row.differences[pairIndex] as Record<ReplicationMetric, number>)[metric]),
        ),
      );
    }
    return Object.freeze({
      ...pair,
      differences: Object.freeze(differences as Record<ReplicationMetric, readonly number[]>),
    });
  });

  const shards = ordered.map((shard) =>
    Object.freeze({
      block: sharded.blocks[shard.index] as ReplicationBlock,
      replicationRuns: shard.spend.replicationRuns,
      wallSeconds: shard.spend.wallSeconds,
      executor: shard.spend.executor,
      workers: shard.spend.workers,
    }),
  );

  return Object.freeze({
    result,
    pairs: Object.freeze(merged),
    spend: Object.freeze({
      ceiling: sharded.ceiling,
      plannedReplicationRuns: sharded.plannedReplicationRuns,
      replicationRuns: shards.reduce((total, shard) => total + shard.replicationRuns, 0),
      wallSeconds: shards.reduce((total, shard) => total + shard.wallSeconds, 0),
      shards: Object.freeze(shards),
    }),
  });
}

/** Every cell present, in order, on the plan's seed — and every stored difference its records' own. */
function checkRow(
  plan: ExperimentPlan,
  label: string,
  row: ReplicationRow,
  replication: number,
  cellIds: readonly string[],
  pairs: readonly ShardPair[],
): void {
  if (row.replication !== replication) {
    throw new RunnerError(`${label} holds replication ${row.replication} where its block has replication ${replication}.`);
  }
  if (row.records.length !== cellIds.length) {
    throw new RunnerError(
      `${label}'s replication ${replication} carries ${row.records.length} records for ${cellIds.length} cells. A block runs every arm of every cell.`,
    );
  }
  const seed = replicationSeed(plan.experimentSeed, replication).toString();
  for (const [column, record] of row.records.entries()) {
    const cellId = cellIds[column] as string;
    if (record.replication !== replication || record.runId !== runIdFor(plan.experimentId, cellId, replication)) {
      throw new RunnerError(
        `${label}'s replication ${replication} has run "${record.runId}" where cell "${cellId}" belongs. A block runs every arm of every cell, in plan order.`,
      );
    }
    if (record.seed !== seed) {
      throw new RunnerError(
        `${label}'s replication ${replication} of cell "${cellId}" ran on seed ${record.seed}; the plan's seed for that replication is ${seed}.`,
      );
    }
  }
  if (row.differences.length !== pairs.length) {
    throw new RunnerError(
      `${label}'s replication ${replication} carries ${row.differences.length} sets of differences for ${pairs.length} pairs, so its differences do not match its own records.`,
    );
  }
  for (const [pairIndex, pair] of pairs.entries()) {
    const expected = differencesOf(plan, row.records, pair);
    const stored = row.differences[pairIndex] as Readonly<Record<ReplicationMetric, number>>;
    for (const metric of REPLICATION_METRICS) {
      if (!Object.is(stored[metric], expected[metric])) {
        throw new RunnerError(
          `${label}'s replication ${replication} states a ${metric} difference of ${String(stored[metric])} for ${pair.candidateCellId} − ${pair.baselineCellId}, and its own records give ${String(expected[metric])}: its differences do not match its own records.`,
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- *
 * The file
 * -------------------------------------------------------------------------- */

/** The one key a number JSON cannot write is wrapped under. Unlikely to collide with a summary field. */
const NUMBER_TAG = '$elevatorSimNumber';

/**
 * A block as JSON, with `context` — a consumer's own description of the run — beside it.
 *
 * @throws RunnerError for a value JSON would lose: a `Map`, `Set`, `bigint`, function or symbol.
 */
export function serializeShard(result: ShardResult, context: ShardContext = {}): string {
  contextOf(context);
  return JSON.stringify({ format: SHARD_FILE_FORMAT, context, result }, (key: string, value: unknown) => {
    if (typeof value === 'number') {
      if (Number.isNaN(value)) return { [NUMBER_TAG]: 'NaN' };
      if (value === Number.POSITIVE_INFINITY) return { [NUMBER_TAG]: 'Infinity' };
      if (value === Number.NEGATIVE_INFINITY) return { [NUMBER_TAG]: '-Infinity' };
      if (Object.is(value, -0)) return { [NUMBER_TAG]: '-0' };
      return value;
    }
    if (
      typeof value === 'bigint' ||
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      value instanceof Map ||
      value instanceof Set
    ) {
      throw new RunnerError(
        `serializeShard: the ${value instanceof Map ? 'Map' : value instanceof Set ? 'Set' : typeof value} at "${key}" cannot be written to JSON without loss. A shard file carries per-replication records from a plan with keepRecords: false.`,
      );
    }
    return value;
  });
}

/**
 * Read a block written by {@link serializeShard}.
 *
 * @throws RunnerError for text that is not JSON, a file of another format, or a result missing a
 *   field the merge reads or carrying one of the wrong type.
 */
export function deserializeShard(text: string): DeserializedShard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, (_key: string, value: unknown) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
      const keys = Object.keys(value);
      if (keys.length !== 1 || keys[0] !== NUMBER_TAG) return value;
      const tag = (value as Record<string, unknown>)[NUMBER_TAG];
      if (tag === 'NaN') return Number.NaN;
      if (tag === 'Infinity') return Number.POSITIVE_INFINITY;
      if (tag === '-Infinity') return Number.NEGATIVE_INFINITY;
      if (tag === '-0') return -0;
      throw new RunnerError(`Not a shard file: an unknown number tag ${JSON.stringify(tag)}.`);
    });
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    throw new RunnerError(`Not a shard file: ${error instanceof Error ? error.message : String(error)}`, undefined, {
      cause: error,
    });
  }
  const file = objectAt(parsed, 'file');
  if (file['format'] !== SHARD_FILE_FORMAT) {
    throw new RunnerError(
      `Not a shard file: its format is ${JSON.stringify(file['format'])}, and this reader takes "${SHARD_FILE_FORMAT}".`,
    );
  }
  return { context: contextOf(file['context']), result: shardResultOf(file['result']) };
}

function shardResultOf(value: unknown): ShardResult {
  const result = objectAt(value, 'result');
  stringAt(result, 'planDigest', 'result');
  stringAt(result, 'experimentId', 'result');
  stringAt(result, 'experimentSeed', 'result');
  if (result['experimentTrafficSeed'] !== undefined) stringAt(result, 'experimentTrafficSeed', 'result');
  integerAt(result, 'index', 'result');
  integerAt(result, 'count', 'result');
  arrayAt(result, 'layout', 'result').forEach((_, index, layout) => integerAt(layout, index, 'result.layout'));
  const block = objectAt(result['block'], 'result.block');
  for (const key of ['index', 'from', 'to']) integerAt(block, key, 'result.block');
  integerAt(objectAt(result['ceiling'], 'result.ceiling'), 'replicationRuns', 'result.ceiling');
  arrayAt(result, 'cellIds', 'result').forEach((_, index, ids) => stringAt(ids, index, 'result.cellIds'));
  for (const [index, pair] of arrayAt(result, 'pairs', 'result').entries()) {
    const entry = objectAt(pair, `result.pairs[${index}]`);
    stringAt(entry, 'candidateCellId', `result.pairs[${index}]`);
    stringAt(entry, 'baselineCellId', `result.pairs[${index}]`);
  }
  for (const [index, rowValue] of arrayAt(result, 'rows', 'result').entries()) {
    const path = `result.rows[${index}]`;
    const row = objectAt(rowValue, path);
    integerAt(row, 'replication', path);
    for (const [position, recordValue] of arrayAt(row, 'records', path).entries()) {
      const recordPath = `${path}.records[${position}]`;
      const record = objectAt(recordValue, recordPath);
      integerAt(record, 'replication', recordPath);
      for (const key of ['seed', 'runId', 'traceDigest']) stringAt(record, key, recordPath);
      for (const key of ['saturated', 'awtIsValid']) {
        if (typeof record[key] !== 'boolean') throw malformed(`${recordPath}.${key}`, 'a boolean');
      }
      metricsAt(record['metrics'], `${recordPath}.metrics`);
    }
    for (const [position, difference] of arrayAt(row, 'differences', path).entries()) {
      metricsAt(difference, `${path}.differences[${position}]`);
    }
  }
  const spend = objectAt(result['spend'], 'result.spend');
  integerAt(spend, 'replicationRuns', 'result.spend');
  integerAt(spend, 'workers', 'result.spend');
  if (typeof spend['wallSeconds'] !== 'number' || !Number.isFinite(spend['wallSeconds'])) {
    throw malformed('result.spend.wallSeconds', 'a finite number');
  }
  if (!(EXECUTOR_KINDS as readonly unknown[]).includes(spend['executor'])) {
    throw malformed('result.spend.executor', `one of ${EXECUTOR_KINDS.join(', ')}`);
  }
  return result as unknown as ShardResult;
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

function mintedPlanOf(sharded: ShardedExperiment): ExperimentPlan {
  if (typeof sharded !== 'object' || sharded === null || !MINTED.has(sharded)) {
    throw new RunnerError(
      'This is not a ShardedExperiment minted by ShardedExperiment.of. A plan, or an object built by hand around one, cannot be run or merged as blocks of a fan-out.',
    );
  }
  return sharded.plan;
}

function assertPlanUnchanged(sharded: ShardedExperiment, plan: ExperimentPlan): void {
  if (planDigestOf(plan) !== sharded.planDigest) {
    throw new RunnerError('The plan was changed after it was cut into blocks, so its blocks no longer describe it.');
  }
}

/** SHA-256 over everything a block's records are a function of, and nothing about how it runs. */
function planDigestOf(plan: ExperimentPlan): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        experimentId: plan.experimentId,
        experimentSeed: plan.experimentSeed,
        experimentTrafficSeed: plan.experimentTrafficSeed,
        policy: plan.policy,
        keepRecords: plan.keepRecords,
        onReplicationError: plan.onReplicationError,
        cells: plan.cells,
        cohorts: plan.cohorts,
        warnings: plan.warnings,
      }),
    )
    .digest('hex');
}

/** Every pair of cells inside one CRN cohort, earlier cell first, cohorts in plan order. */
function pairsOf(plan: ExperimentPlan): readonly ShardPair[] {
  const pairs: ShardPair[] = [];
  for (const cohort of plan.cohorts) {
    for (let candidate = 0; candidate < cohort.cellIds.length; candidate += 1) {
      for (let baseline = candidate + 1; baseline < cohort.cellIds.length; baseline += 1) {
        pairs.push(
          Object.freeze({
            candidateCellId: cohort.cellIds[candidate] as string,
            baselineCellId: cohort.cellIds[baseline] as string,
          }),
        );
      }
    }
  }
  return Object.freeze(pairs);
}

function differencesOf(
  plan: ExperimentPlan,
  records: readonly ReplicationRecord[],
  pair: ShardPair,
): Readonly<Record<ReplicationMetric, number>> {
  const candidate = records[plan.cells.findIndex((cell) => cell.cellId === pair.candidateCellId)];
  const baseline = records[plan.cells.findIndex((cell) => cell.cellId === pair.baselineCellId)];
  if (candidate === undefined || baseline === undefined) {
    throw new RunnerError(`No records for the pair ${pair.candidateCellId} − ${pair.baselineCellId}.`);
  }
  const out: Partial<Record<ReplicationMetric, number>> = {};
  for (const metric of REPLICATION_METRICS) out[metric] = candidate.metrics[metric] - baseline.metrics[metric];
  return Object.freeze(out as Record<ReplicationMetric, number>);
}

function blocksOf(budget: number, shards: number | readonly number[]): readonly ReplicationBlock[] {
  let sizes: readonly number[];
  if (typeof shards === 'number') {
    if (!Number.isSafeInteger(shards) || shards < 1 || shards > budget) {
      throw new RunnerError(
        `shards must be a whole number from 1 to the plan's ${budget} replications; received ${String(shards)}.`,
        'shards',
      );
    }
    const base = Math.floor(budget / shards);
    const extra = budget % shards;
    sizes = Array.from({ length: shards }, (_, index) => base + (index < extra ? 1 : 0));
  } else if (Array.isArray(shards) && shards.length > 0) {
    for (const size of shards as readonly unknown[]) {
      if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1) {
        throw new RunnerError(
          `Every block size must be a whole number of replications, at least 1; received ${JSON.stringify(size)}.`,
          'shards',
        );
      }
    }
    const total = shards.reduce((sum, size) => sum + size, 0);
    if (total !== budget) {
      throw new RunnerError(
        `Block sizes [${shards.join(', ')}] sum to ${total}; a layout must partition the plan's ${budget} replications.`,
        'shards',
      );
    }
    sizes = shards;
  } else {
    throw new RunnerError('shards must be a count of blocks or a non-empty list of block sizes.', 'shards');
  }
  let from = 0;
  return Object.freeze(
    sizes.map((size, index) => {
      const block = Object.freeze({ index, from, to: from + size });
      from += size;
      return block;
    }),
  );
}

function layoutOf(blocks: readonly ReplicationBlock[]): readonly number[] {
  return Object.freeze(blocks.map((block) => block.to - block.from));
}

function ceilingOf(value: unknown): ShardCeiling {
  const ceiling = objectAt(value, 'ceiling');
  const replicationRuns = ceiling['replicationRuns'];
  if (typeof replicationRuns !== 'number' || !Number.isSafeInteger(replicationRuns) || replicationRuns < 1) {
    throw new RunnerError(
      `ceiling.replicationRuns must be a whole number of replication-runs, at least 1; received ${String(replicationRuns)}.`,
      'ceiling',
    );
  }
  return Object.freeze({ replicationRuns });
}

function contextOf(value: unknown): ShardContext {
  const context = objectAt(value, 'context');
  for (const [key, entry] of Object.entries(context)) {
    if (typeof entry !== 'string' && typeof entry !== 'boolean' && !(typeof entry === 'number' && Number.isFinite(entry))) {
      throw malformed(`context.${key}`, 'a string, a finite number or a boolean');
    }
  }
  return context as ShardContext;
}

function refuseUndeclaredKeys(value: unknown, declared: readonly string[], what: string): void {
  if (value === null || typeof value !== 'object') {
    throw new RunnerError(`${what} must be an object.`);
  }
  const undeclared = Object.keys(value).filter((key) => !declared.includes(key));
  if (undeclared.length > 0) {
    throw new RunnerError(
      `${what} does not take ${undeclared.map((key) => `"${key}"`).join(', ')}; it takes ${declared.map((key) => `"${key}"`).join(' and ')}.`,
    );
  }
}

function sameList(left: unknown, right: readonly (string | number)[]): boolean {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    right.every((entry, index) => Object.is(left[index], entry))
  );
}

function abbreviate(digest: string): string {
  return typeof digest === 'string' ? digest.slice(0, 12) : String(digest);
}

function malformed(path: string, expected: string): RunnerError {
  return new RunnerError(`Not a shard file this reader can merge: ${path} should be ${expected}.`, path);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw malformed(path, 'an object');
  return value as Record<string, unknown>;
}

function arrayAt(holder: Record<string, unknown>, key: string, path: string): readonly unknown[] {
  const value = holder[key];
  if (!Array.isArray(value)) throw malformed(`${path}.${key}`, 'an array');
  return value;
}

function stringAt(holder: Record<string, unknown> | readonly unknown[], key: string | number, path: string): void {
  if (typeof (holder as Record<string | number, unknown>)[key] !== 'string') {
    throw malformed(`${path}.${String(key)}`, 'a string');
  }
}

function integerAt(holder: Record<string, unknown> | readonly unknown[], key: string | number, path: string): void {
  const value = (holder as Record<string | number, unknown>)[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw malformed(`${path}.${String(key)}`, 'a whole number');
  }
}

function metricsAt(value: unknown, path: string): void {
  const metrics = objectAt(value, path);
  for (const metric of REPLICATION_METRICS) {
    if (typeof metrics[metric] !== 'number') throw malformed(`${path}.${metric}`, 'a number');
  }
}
