/**
 * `experiments/runner` — the replication runner.
 *
 * Phase 3's engine room: N replications of a `(building, dispatcher, traffic)` configuration,
 * adaptively many, spread across cores, driven by common random numbers, and reporting the same
 * numbers however they were executed.
 *
 * ```ts
 * import { loadConfig } from '@elevator-sim/core';
 * import { runExperiment, verifyCrnAlignment } from '@elevator-sim/experiments';
 *
 * const result = await runExperiment(
 *   {
 *     id: 'collective-vs-nearest-car',
 *     seed: 20260726,
 *     buildings: ['midtown-office'],
 *     dispatchers: ['collective', 'nearest-car'],
 *     traffic: [{ id: 'up-peak', demand: { arrivalRatePctPop5min: 12 } }],
 *   },
 *   await loadConfig('data'),
 * );
 * ```
 *
 * ## The four claims this module makes
 *
 * - **Common random numbers.** A replication's seed is `f(experimentSeed, replicationIndex)` and
 *   nothing else, so every arm of a comparison sees byte-identical passenger populations at equal
 *   index. `crn.ts` derives them; {@link verifyCrnAlignment} audits a finished result for it.
 * - **Parallelism cannot move a number.** Outcomes are assembled by task index, batch composition
 *   is fixed by the policy rather than by the core count, and both executors call one shared
 *   replication implementation.
 * - **Adaptive run counts.** The sequential stopping rule is injected through a port
 *   ({@link StoppingRule}); the t/z arithmetic lives in `stats/`, not here.
 * - **Saturation is flagged, never averaged.** Any saturated replication saturates its cell and
 *   suppresses the AWT interval.
 *
 * Names are re-exported explicitly rather than with `export *`, matching `core`'s barrels: adding
 * an export becomes a deliberate widening of the surface, and a future collision between two
 * submodules is a compile error here rather than a silent shadow.
 */

/* -------------------------------------------------------------------------- *
 * Common random numbers
 * -------------------------------------------------------------------------- */

export {
  REPLICATION_STREAM_PREFIX,
  assertCrnAligned,
  canonicalJson,
  crnCohortsOf,
  normalizeExperimentSeed,
  replicationSeed,
  replicationSeeds,
  traceKeyOf,
  verifyCrnAlignment,
} from './crn.js';

export type { CrnAlignmentReport, CrnMismatch } from './crn.js';

/* -------------------------------------------------------------------------- *
 * The declarative experiment
 * -------------------------------------------------------------------------- */

export {
  parseExperimentSpec,
  planExperiment,
  resolveParallelPolicy,
  resolveReplicationPolicy,
} from './experiment.js';

/* -------------------------------------------------------------------------- *
 * Per-replication scalars
 * -------------------------------------------------------------------------- */

export { REPLICATION_METRICS, isReplicationMetric, metricOf, metricsOf } from './metrics.js';

export type { ReplicationMetric } from './metrics.js';

/* -------------------------------------------------------------------------- *
 * One replication
 * -------------------------------------------------------------------------- */

export {
  runIdFor,
  runOneReplication,
  serializeError,
  simulationConfigFor,
  traceDigest,
} from './replication.js';

/* -------------------------------------------------------------------------- *
 * Sequential stopping
 * -------------------------------------------------------------------------- */

export { fixedBudgetStoppingRule, halfWidthStoppingRule } from './stopping.js';

export type {
  HalfWidthEstimate,
  HalfWidthEstimator,
  HalfWidthStoppingOptions,
} from './stopping.js';

/* -------------------------------------------------------------------------- *
 * Execution
 * -------------------------------------------------------------------------- */

export {
  createExecutor,
  createSerialExecutor,
  createWorkerPoolExecutor,
  resolveWorkerCount,
  workerEntryUrl,
} from './parallel.js';

export type {
  ExecutorChoice,
  ReplicationExecutor,
  WorkerInit,
  WorkerMessage,
  WorkerRequest,
} from './parallel.js';

/* -------------------------------------------------------------------------- *
 * The runner
 * -------------------------------------------------------------------------- */

export {
  aggregateCell,
  aggregateMetric,
  fingerprintExperiment,
  runExperiment,
  runPlan,
  runReplication,
} from './replicationRunner.js';

/* -------------------------------------------------------------------------- *
 * Vocabulary and tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

export {
  EXECUTOR_KINDS,
  PARALLEL_MODES,
  RUNNER_DEFAULTS,
  RUNNER_PARAMETERS,
  RunnerError,
  STOPPING_REASONS,
} from './types.js';

export type {
  CellAggregate,
  CellResult,
  CellSimulationConfig,
  CrnCohort,
  DispatcherArmSpec,
  ExecutionReport,
  ExecutorKind,
  ExperimentCell,
  ExperimentPlan,
  ExperimentResources,
  ExperimentResult,
  ExperimentRunOptions,
  ExperimentSpec,
  MetricAggregate,
  ParallelMode,
  ParallelSpec,
  RawReplicationOutcome,
  ReplicationFailure,
  ReplicationPolicySpec,
  ReplicationRecord,
  ReplicationTask,
  ResolvedParallelPolicy,
  ResolvedReplicationPolicy,
  RunnerParameterSpec,
  RunnerParameterType,
  SerializedError,
  SimulationOverridesSpec,
  StoppingEvaluation,
  StoppingReason,
  StoppingRule,
  StoppingRuleInput,
  StoppingSummary,
  StoppingVerdict,
  TrafficArmSpec,
} from './types.js';
