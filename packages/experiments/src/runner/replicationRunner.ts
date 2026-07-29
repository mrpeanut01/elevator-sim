/**
 * The replication runner: N replications of a configuration, adaptively many, in parallel, with
 * common random numbers, and identical results either way.
 *
 * ```ts
 * import { loadConfig } from '@elevator-sim/core';
 * import { runExperiment, verifyCrnAlignment } from '@elevator-sim/experiments';
 *
 * const config = await loadConfig('data');
 * const result = await runExperiment(
 *   {
 *     id: 'collective-vs-nearest-car',
 *     seed: 20260726,
 *     buildings: ['midtown-office'],
 *     dispatchers: ['collective', 'nearest-car'],
 *     traffic: [{ id: 'up-peak', demand: { arrivalRatePctPop5min: 12 } }],
 *     replication: { minReplications: 50, maxReplications: 200, acceptableRange: 2 },
 *   },
 *   config,
 *   { stoppingRule: ({ samples, acceptableRange, confidence }) => sequentialStopping(samples, { acceptableRange, confidence }) },
 * );
 *
 * verifyCrnAlignment(result.cells).aligned;             // the pairing is sound
 * result.cells[0].aggregate.metrics.awtS.samples;       // index order — pair these, don't average them
 * result.cells[0].aggregate.awtIsValid;                 // false if anything saturated
 * ```
 *
 * ## The loop, and why it is shaped this way
 *
 * Each round: every still-active cell contributes its next chunk of replications, the whole
 * cross-cell batch goes to one executor call, outcomes come back in task order, and only then is
 * the stopping rule consulted per cell.
 *
 * Batching **across** cells rather than finishing one cell at a time is what keeps a worker pool
 * busy: a chunk is `policy.checkEvery` replications, which on its own would leave most of a pool
 * idle, but eight cells' chunks together will not. The first chunk is `minReplications`, because
 * consulting a stopping rule before the doc's floor of 50 replications is how the reference study
 * came to report a 12 % error (docs/03-traffic-and-statistics.md § Part 3).
 *
 * The chunk size is **policy data, never the core count**. That is the single decision that makes
 * "same experimentSeed ⇒ byte-identical results" survive parallelism: a batch of 8 may overshoot
 * the exact half-width crossing by up to 7 replications, and it has to overshoot it identically on
 * every machine. `parallel.test.ts` runs the same adaptive spec serially and on a pool and asserts
 * the replication counts and every number agree.
 *
 * ## What this module refuses to do
 *
 * Compute a confidence interval. It records the per-replication samples in index order and the
 * verdicts the injected rule returned, and stops. The interval — paired-t on the differences,
 * Student-t at `n − 1` at every `n` — belongs to `stats/`, and a runner that also owned it could
 * not be tested apart from a simulator. (This sentence used to name a "t/z switch at n = 25"; that
 * family was deleted in `89bbf37` and no estimator in this repository has implemented it since —
 * DECISIONS.md § D14.)
 */

import { summariseReplications } from '../oracle/reconcile.js';
import type { ReplicationStatistic } from '../oracle/types.js';

import { canonicalJson, crnCohortsOf, replicationSeed } from './crn.js';
import { planExperiment } from './experiment.js';
import { REPLICATION_METRICS, metricsOf } from './metrics.js';
import type { ReplicationMetric } from './metrics.js';
import { createExecutor } from './parallel.js';
import type { ReplicationExecutor } from './parallel.js';
import { runOneReplication, runIdFor, simulationConfigFor } from './replication.js';
import type {
  CellAggregate,
  CellResult,
  ExecutionReport,
  ExperimentCell,
  ExperimentPlan,
  ExperimentResources,
  ExperimentResult,
  ExperimentRunOptions,
  ExperimentSpec,
  MetricAggregate,
  RawReplicationOutcome,
  ReplicationFailure,
  ReplicationRecord,
  ReplicationTask,
  StoppingEvaluation,
  StoppingReason,
  StoppingSummary,
  StoppingVerdict,
} from './types.js';
import { RunnerError } from './types.js';

/* -------------------------------------------------------------------------- *
 * One replication, for a caller that wants exactly one
 * -------------------------------------------------------------------------- */

/**
 * Run a single replication of a planned cell, synchronously.
 *
 * The unit {@link runExperiment} is built from, exposed because replaying one stored record is a
 * routine need — `plan.cells[i]` plus a replication index reproduces it exactly, since the seed is
 * a function of `(experimentSeed, replication)` alone.
 *
 * @throws RunnerError if the replication threw. Unlike the batch path there is no policy to apply:
 *   a caller asking for one replication wants it or wants the exception.
 */
export function runReplication(
  plan: ExperimentPlan,
  cell: ExperimentCell,
  replication: number,
): ReplicationRecord {
  const seed = replicationSeed(plan.experimentSeed, replication);
  const outcome = runOneReplication(plan.experimentId, cell, replication, seed, plan.keepRecords);
  if (!outcome.ok) {
    throw new RunnerError(
      `Replication ${replication} of cell "${cell.cellId}" (seed ${outcome.seed}) failed: ${outcome.error.message}`,
    );
  }
  return recordOf(outcome);
}

/** Shape a successful outcome into the reported record, adding the scalar projection. */
function recordOf(outcome: Extract<RawReplicationOutcome, { ok: true }>): ReplicationRecord {
  const { summary } = outcome;
  return {
    replication: outcome.replication,
    seed: outcome.seed,
    runId: outcome.runId,
    status: outcome.status,
    summary,
    metrics: metricsOf(summary),
    saturated: summary.saturation.saturated,
    awtIsValid: summary.awtIsValid,
    ...(summary.awtInvalidReason === undefined ? {} : { awtInvalidReason: summary.awtInvalidReason }),
    traceDigest: outcome.traceDigest,
    tracePassengers: outcome.tracePassengers,
    conservation: outcome.conservation,
    undeliveredCount: outcome.undeliveredCount,
    ...(outcome.record === undefined ? {} : { record: outcome.record }),
    warnings: outcome.warnings,
  };
}

/* -------------------------------------------------------------------------- *
 * Aggregation
 * -------------------------------------------------------------------------- */

/**
 * Summarise one metric across a cell's replications.
 *
 * Non-finite values are **excluded from the statistic and counted**, rather than coalesced to
 * zero or allowed to poison the mean. `NaN` here is a real event — no passenger was served inside
 * the window, or a capacity had no population to divide by — and it is a fact about the
 * configuration, not a measurement of zero seconds. `samples` keeps every value in replication
 * order, holes included, because that array is what a paired comparison subtracts.
 */
export function aggregateMetric(
  metric: ReplicationMetric,
  records: readonly ReplicationRecord[],
): MetricAggregate {
  const samples = records.map((record) => record.metrics[metric]);
  const finite = samples.filter((value) => Number.isFinite(value));
  const statistic: ReplicationStatistic | undefined =
    finite.length === 0 ? undefined : summariseReplications(finite);
  return {
    metric,
    samples: Object.freeze(samples),
    finiteCount: finite.length,
    nonFiniteCount: samples.length - finite.length,
    statistic,
  };
}

/**
 * Aggregate a cell, propagating the saturation flag.
 *
 * `saturated` is `saturatedCount > 0` — **any** replication whose queue diverged saturates the
 * cell. Not a majority vote and not an average: a configuration that diverges on one passenger
 * population in fifty is a configuration at its limit, and folding its waiting time into a mean
 * with the runs that coped is precisely how a failed design gets published as a mediocre one.
 * docs/03-traffic-and-statistics.md § Part 3: "flag it and suppress the AWT confidence interval."
 */
export function aggregateCell(records: readonly ReplicationRecord[]): CellAggregate {
  const metrics: Partial<Record<ReplicationMetric, MetricAggregate>> = {};
  for (const metric of REPLICATION_METRICS) metrics[metric] = aggregateMetric(metric, records);
  const awt = metrics.awtS;

  const saturatedCount = records.filter((record) => record.saturated).length;
  const awtInvalidCount = records.filter((record) => !record.awtIsValid).length;
  const awtValidCount = records.length - awtInvalidCount;
  const finiteAwt = awt?.finiteCount ?? 0;

  const reasons: string[] = [];
  if (saturatedCount > 0) {
    reasons.push(
      `${saturatedCount} of ${records.length} replications saturated (a diverging queue), so the mean describes a system whose backlog grows without bound`,
    );
  }
  if (awtInvalidCount > saturatedCount) {
    reasons.push(
      `${awtInvalidCount} of ${records.length} replications reported an invalid AWT (saturation, censoring or an empty window)`,
    );
  }
  if (finiteAwt < 2) {
    reasons.push(
      `only ${finiteAwt} replication(s) produced a finite AWT, which is not enough for an interval`,
    );
  }

  return {
    count: records.length,
    metrics: Object.freeze(metrics as Record<ReplicationMetric, MetricAggregate>),
    saturatedCount,
    saturated: saturatedCount > 0,
    awtValidCount,
    awtInvalidCount,
    awtIsValid: reasons.length === 0,
    ...(reasons.length === 0 ? {} : { awtInvalidReason: reasons.join('; ') }),
  };
}

/* -------------------------------------------------------------------------- *
 * The run loop
 * -------------------------------------------------------------------------- */

interface CellState {
  readonly cell: ExperimentCell;
  readonly records: ReplicationRecord[];
  readonly failures: ReplicationFailure[];
  readonly evaluations: StoppingEvaluation[];
  /** Replications issued so far. The next index to run. */
  issued: number;
  done: boolean;
  reason: StoppingReason;
}

/** Normalize the port's `boolean | StoppingVerdict` into a verdict. */
function asVerdict(answer: StoppingVerdict | boolean): StoppingVerdict {
  return typeof answer === 'boolean' ? { stop: answer } : answer;
}

/**
 * Run an already-resolved plan.
 *
 * Separated from {@link runExperiment} so a caller can inspect, print or assert on the plan before
 * spending an hour of CPU on it — and so a Phase 7 optimizer can re-run one plan across candidate
 * weight vectors without re-validating a spec each time.
 *
 * The plan is authoritative for `parallel`, `keepRecords` and `onReplicationError`: those are
 * resolved when the plan is built, so the matching fields of `options` are ignored here and only
 * `stoppingRule` and `onReplication` are read. Pass them to {@link runExperiment} (or to
 * {@link planExperiment}) instead — a plan that said one thing while the run did another would make
 * the printed plan a lie.
 */
export async function runPlan(
  plan: ExperimentPlan,
  options?: ExperimentRunOptions | undefined,
): Promise<ExperimentResult> {
  const { policy } = plan;
  const rule = options?.stoppingRule;
  const onReplication = options?.onReplication;
  const states: CellState[] = plan.cells.map((cell) => ({
    cell,
    records: [],
    failures: [],
    evaluations: [],
    issued: 0,
    done: false,
    reason: rule === undefined ? 'fixed-budget' : 'max-replications',
  }));

  const choice = createExecutor(plan);
  const executor: ReplicationExecutor = choice.executor;
  const startedAt = Date.now();
  let batches = 0;

  try {
    for (;;) {
      const tasks: ReplicationTask[] = [];
      const scheduled: CellState[] = [];
      for (const state of states) {
        if (state.done) continue;
        const chunk = state.issued === 0 ? policy.minReplications : policy.checkEvery;
        const take = Math.min(chunk, policy.maxReplications - state.issued);
        if (take <= 0) {
          state.done = true;
          state.reason = rule === undefined ? 'fixed-budget' : 'max-replications';
          continue;
        }
        for (let k = 0; k < take; k += 1) {
          const replication = state.issued + k;
          tasks.push({
            cellIndex: state.cell.index,
            replication,
            seed: replicationSeed(plan.experimentSeed, replication),
          });
        }
        state.issued += take;
        scheduled.push(state);
      }
      if (tasks.length === 0) break;

      const outcomes = await executor.run(tasks);
      batches += 1;
      if (outcomes.length !== tasks.length) {
        throw new RunnerError(
          `Executor returned ${outcomes.length} outcomes for ${tasks.length} tasks. A batch must answer one outcome per task, in task order.`,
        );
      }

      // Task order, always: a hook or a failure message must not depend on which thread was
      // quickest. `outcomes[i]` belongs to `tasks[i]` by the executor's contract.
      for (const [index, outcome] of outcomes.entries()) {
        const task = tasks[index];
        if (task === undefined) throw new RunnerError(`Lost task ${index} while collecting outcomes.`);
        const state = stateFor(states, task.cellIndex);
        if (outcome.ok) {
          const record = recordOf(outcome);
          state.records.push(record);
          onReplication?.(record, state.cell);
        } else if (plan.onReplicationError === 'throw') {
          throw new RunnerError(
            `Replication ${task.replication} of cell "${state.cell.cellId}" (seed ${outcome.seed}) threw ${outcome.error.name}: ${outcome.error.message}. Pass onReplicationError: 'record' to collect failures instead — but a conservation-audit failure is a bug, not a data point.`,
          );
        } else {
          state.failures.push({
            replication: task.replication,
            seed: outcome.seed,
            error: outcome.error,
          });
        }
      }

      for (const state of scheduled) {
        if (state.done) continue;
        decide(state, plan, rule);
      }
    }
  } finally {
    await executor.close();
  }

  const cells: CellResult[] = states.map((state) => {
    // Sorted once and used for both the records and the aggregate: `MetricAggregate.samples` is
    // documented to be in replication order because a paired comparison indexes into it, and
    // aggregating a differently-ordered array would break that quietly.
    const ordered = Object.freeze([...state.records].sort((a, b) => a.replication - b.replication));
    return {
      cellId: state.cell.cellId,
      buildingId: state.cell.buildingId,
      trafficArmId: state.cell.trafficArmId,
      dispatcherArmId: state.cell.dispatcherArmId,
      dispatcherProfileId: state.cell.dispatcherProfileId,
      traceKey: state.cell.traceKey,
      replications: ordered,
      failures: Object.freeze([...state.failures].sort((a, b) => a.replication - b.replication)),
      aggregate: aggregateCell(ordered),
      stopping: stoppingSummaryOf(state, plan),
    };
  });

  const execution: ExecutionReport = {
    executor: executor.kind,
    workers: executor.workers,
    reason: choice.reason,
    batches,
    elapsedMs: Date.now() - startedAt,
  };

  return {
    experimentId: plan.experimentId,
    experimentSeed: plan.experimentSeed.toString(),
    plan,
    cells: Object.freeze(cells),
    cohorts: plan.cohorts,
    replicationsRun: cells.reduce((total, cell) => total + cell.replications.length, 0),
    failedReplications: cells.reduce((total, cell) => total + cell.failures.length, 0),
    saturated: cells.some((cell) => cell.aggregate.saturated),
    warnings: plan.warnings,
    execution,
  };
}

function stateFor(states: readonly CellState[], cellIndex: number): CellState {
  const state = states.find((candidate) => candidate.cell.index === cellIndex);
  if (state === undefined) throw new RunnerError(`No cell state for index ${cellIndex}.`);
  return state;
}

/**
 * Decide whether a cell keeps replicating.
 *
 * Order matters and each step earns its place:
 *
 * 1. **Nothing to measure.** Every replication so far failed, so precision is not the problem.
 * 2. **Saturated.** The AWT interval will be suppressed whatever its half-width, so refining it
 *    buys nothing; the doc's position is that an accurate mean for a failed configuration is
 *    unnecessary as long as it is flagged.
 * 3. **The rule.** Consulted on the finite samples in index order, once per chunk.
 * 4. **The cap.**
 *
 * Evaluated on the *prefix* of completed replications in index order, which is why the decision is
 * the same whichever executor produced them.
 */
function decide(
  state: CellState,
  plan: ExperimentPlan,
  rule: ExperimentRunOptions['stoppingRule'],
): void {
  const { policy } = plan;
  const reachedMin = state.issued >= policy.minReplications;
  const reachedMax = state.issued >= policy.maxReplications;

  if (state.records.length === 0 && reachedMin) {
    state.done = true;
    state.reason = 'no-samples';
    return;
  }
  if (policy.stopOnSaturation && reachedMin && state.records.some((record) => record.saturated)) {
    state.done = true;
    state.reason = 'saturated';
    return;
  }
  if (rule === undefined) {
    if (reachedMax) {
      state.done = true;
      state.reason = 'fixed-budget';
    }
    return;
  }

  const ordered = [...state.records].sort((a, b) => a.replication - b.replication);
  const samples = ordered
    .map((record) => record.metrics[policy.stoppingMetric])
    .filter((value) => Number.isFinite(value));
  const verdict = asVerdict(
    rule({
      samples,
      acceptableRange: policy.acceptableRange,
      confidence: policy.confidence,
      metric: policy.stoppingMetric,
      replications: ordered.length,
    }),
  );
  state.evaluations.push({
    replications: ordered.length,
    finiteSamples: samples.length,
    nonFiniteSamples: ordered.length - samples.length,
    verdict,
  });
  if (verdict.stop) {
    state.done = true;
    state.reason = 'rule-satisfied';
    return;
  }
  if (reachedMax) {
    state.done = true;
    state.reason = 'max-replications';
  }
}

function stoppingSummaryOf(state: CellState, plan: ExperimentPlan): StoppingSummary {
  const { policy } = plan;
  return {
    metric: policy.stoppingMetric,
    minReplications: policy.minReplications,
    maxReplications: policy.maxReplications,
    checkEvery: policy.checkEvery,
    confidence: policy.confidence,
    acceptableRange: policy.acceptableRange,
    replicationsRun: state.issued,
    stoppedEarly: state.issued < policy.maxReplications,
    reason: state.reason,
    evaluations: Object.freeze([...state.evaluations]),
  };
}

/**
 * Plan a spec and run it.
 *
 * `resources` is structurally satisfied by core's `LoadedConfig`, so
 * `runExperiment(spec, await loadConfig('data'))` needs no adaptor.
 */
export async function runExperiment(
  spec: ExperimentSpec,
  resources: ExperimentResources,
  options?: ExperimentRunOptions | undefined,
): Promise<ExperimentResult> {
  return await runPlan(planExperiment(spec, resources, options), options);
}

/* -------------------------------------------------------------------------- *
 * Identity
 * -------------------------------------------------------------------------- */

/**
 * A canonical string identifying everything an experiment *measured*.
 *
 * The comparison behind "same experimentSeed ⇒ byte-identical results" and behind "parallel and
 * serial agree". Includes every replication's summary, scalar projection, saturation flag, trace
 * digest, conservation audit and — when the plan kept them — its whole `RunRecord`, plus the
 * per-cell stopping history, so a difference of one replication or one microsecond of waiting time
 * changes the string.
 *
 * Excluded, deliberately and by construction rather than by a list of field names:
 *
 * - `execution` — the executor, the thread count and the elapsed milliseconds. The one part of a
 *   result that legitimately differs between two runs of one spec, which is exactly why it lives
 *   in its own object.
 * - `plan.parallel` — a caller may override the execution strategy at the call site.
 * - `plan.cells` — the input configuration, which is large, shared by reference, and identical by
 *   construction for a given spec and resources.
 *
 * Keys are sorted, so an incidental property ordering is not mistaken for a difference; run it on
 * a small experiment, since it serializes every retained record.
 */
export function fingerprintExperiment(result: ExperimentResult): string {
  return canonicalJson({
    experimentId: result.experimentId,
    experimentSeed: result.experimentSeed,
    policy: result.plan.policy,
    keepRecords: result.plan.keepRecords,
    onReplicationError: result.plan.onReplicationError,
    cellIds: result.plan.cells.map((cell) => cell.cellId),
    traceKeys: result.plan.cells.map((cell) => cell.traceKey),
    cohorts: result.cohorts,
    cells: result.cells,
    replicationsRun: result.replicationsRun,
    failedReplications: result.failedReplications,
    saturated: result.saturated,
    warnings: result.warnings,
  });
}
