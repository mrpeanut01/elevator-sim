/**
 * `@elevator-sim/experiments` — public barrel.
 *
 * Replication runner, CRN management, statistics (paired-t, sequential stopping, saturation
 * detection) and run-record persistence. Every persisted run record carries the seed that produced
 * it (CLAUDE.md invariant 5), and nothing here weakens CLAUDE.md § Statistical discipline: a
 * difference is declared only through a paired-t interval that excludes zero, and a saturated
 * configuration has its wait statistics suppressed rather than averaged.
 *
 * May depend on `@elevator-sim/core`; nothing in `core` may depend on this package. Four modules
 * are re-exported below — `stats`, `runner/`, `reports/` and `oracle/` — with names listed
 * explicitly rather than with `export *`, matching `core`'s barrel: adding an export becomes a
 * deliberate widening of the package's public surface, and a name collision between two submodules
 * is a compile error here rather than a silent shadow.
 *
 * ## Where `stats` lives
 *
 * `reports/index.ts` says the interval arithmetic is "deliberately not exported" from *that* module
 * because "`experiments/stats/` owns the package's public statistical surface". Phase 3 landed that
 * arithmetic in `reports/statistics.ts` and never grew a separate `stats/` directory, so the package
 * boundary is where the intent is honoured: the statistical surface is exported here, directly from
 * `reports/statistics.js`, under its own heading. A consumer sees the surface the design promised;
 * `reports/` keeps its own barrel narrow, as it intended. If a `stats/` directory ever lands it
 * changes which file the names come from, and not one name a caller imports.
 *
 * Everything a paired comparison needs is therefore reachable from this barrel alone:
 * {@link estimateMean} and {@link pairedDifferenceEstimate} for the intervals,
 * {@link halfWidthStoppingRule} for the sequential rule, {@link runExperiment} to produce the
 * samples under common random numbers, and {@link intervalContainsZero} to read the verdict.
 *
 * ## The one deliberate omission — `canonicalJson`
 *
 * `runner/crn.ts` and `reports/persistence.ts` each export a function of that name, and unlike
 * `core`'s duplicated `HANDLING_CAPACITY_WINDOW_S` the two are **not** interchangeable:
 *
 * - the runner's sorts keys, walks `Map`s and `Set`s, and lets `JSON.stringify` render a `NaN` as
 *   `null` — right for a trace key and a result fingerprint;
 * - the reports' sorts keys and renders non-finite numbers as `"NaN"`, `"Infinity"` and
 *   `"-Infinity"` — right for a `RunSummary`, where `null` would silently equate "nobody was
 *   served, so there is no mean" with the number zero.
 *
 * So neither is re-exported under the bare name. Picking one would hand a caller the other's
 * semantics silently, and the symptom would be a wrong digest rather than a compile error. Callers
 * want a fingerprint rather than a serializer, and every fingerprint is exported:
 * {@link runRecordFingerprint}, {@link summaryFingerprint}, {@link storedRunFingerprint},
 * {@link fingerprintOf}, {@link traceDigest}, {@link traceKeyOf} and
 * {@link fingerprintExperiment}. `index.test.ts` pins the omission *and* pins that the two
 * implementations really do disagree, so the exception cannot quietly become moot.
 *
 * ## What is deliberately not here — `validation/`
 *
 * `src/validation/` is the Phase 3 acceptance gate: suites that measure the four roadmap criteria
 * against the real `data/` directory. It is an executable argument rather than a library, and its
 * shared harness resolves `data/` from a path relative to the source tree. It stays reachable at
 * `validation/index.js` for a Phase 5 or Phase 7 comparison inside this package, and the paired-t
 * plumbing it is built from — `estimateMean`, `pairedDifferenceEstimate`, `halfWidthStoppingRule` —
 * is exported here, so nothing needs the gate's own barrel in order to reuse the method.
 *
 * ## Note on Node built-ins
 *
 * This barrel is not environment-free. `readRunSetFile`/`writeRunSetFile`/`appendRunToFile` pull in
 * `node:fs`, and `createWorkerPoolExecutor` pulls in `node:worker_threads`. `oracle/` and `stats`
 * import nothing at all; a browser bundle should import those leaf modules directly.
 */

/* -------------------------------------------------------------------------- *
 * stats — the interval arithmetic (`reports/statistics.ts`).
 *
 * Sample moments, the t and normal quantiles, and the paired difference interval.
 * docs/03-traffic-and-statistics.md § Part 3 chooses the quantile family by `n` — t at or below
 * 25, normal above it — and every estimate records which one it used. All pure functions: no RNG
 * (CLAUDE.md invariant 2), no clock (3), no mutation of an input.
 * -------------------------------------------------------------------------- */

export {
  DEFAULT_CONFIDENCE,
  T_DISTRIBUTION_MAX_N,
  estimateMean,
  halfWidthQuantile,
  meanOf,
  normalQuantile,
  pairedDifferenceEstimate,
  sampleStdDevOf,
  studentTCdf,
  studentTQuantile,
} from './reports/statistics.js';

export type { EstimateOptions } from './reports/statistics.js';

/* -------------------------------------------------------------------------- *
 * runner/ — N replications of a (building, dispatcher, traffic) configuration:
 * common random numbers, an adaptive run count, parallelism that cannot move a
 * number, and saturation flagged rather than averaged.
 * -------------------------------------------------------------------------- */

export {
  EXECUTOR_KINDS,
  PARALLEL_MODES,
  REPLICATION_METRICS,
  REPLICATION_STREAM_PREFIX,
  RUNNER_DEFAULTS,
  RUNNER_PARAMETERS,
  RunnerError,
  STOPPING_REASONS,
  aggregateCell,
  aggregateMetric,
  assertCrnAligned,
  createExecutor,
  createSerialExecutor,
  createWorkerPoolExecutor,
  crnCohortsOf,
  fingerprintExperiment,
  fixedBudgetStoppingRule,
  halfWidthStoppingRule,
  isReplicationMetric,
  metricOf,
  metricsOf,
  normalizeExperimentSeed,
  parseExperimentSpec,
  planExperiment,
  replicationSeed,
  replicationSeeds,
  resolveParallelPolicy,
  resolveReplicationPolicy,
  resolveWorkerCount,
  runExperiment,
  runIdFor,
  runOneReplication,
  runPlan,
  runReplication,
  serializeError,
  simulationConfigFor,
  traceDigest,
  traceKeyOf,
  verifyCrnAlignment,
  workerEntryUrl,
} from './runner/index.js';

export type {
  CellAggregate,
  CellResult,
  CellSimulationConfig,
  CrnAlignmentReport,
  CrnCohort,
  CrnMismatch,
  DispatcherArmSpec,
  ExecutionReport,
  ExecutorChoice,
  ExecutorKind,
  ExperimentCell,
  ExperimentPlan,
  ExperimentResources,
  ExperimentResult,
  ExperimentRunOptions,
  ExperimentSpec,
  HalfWidthEstimate,
  HalfWidthEstimator,
  HalfWidthStoppingOptions,
  MetricAggregate,
  ParallelMode,
  ParallelSpec,
  RawReplicationOutcome,
  ReplicationExecutor,
  ReplicationFailure,
  ReplicationMetric,
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
  WorkerInit,
  WorkerMessage,
  WorkerRequest,
} from './runner/index.js';

/* -------------------------------------------------------------------------- *
 * reports/ — persist, replay, re-analyse, report. One NDJSON record per
 * replication with its seed attached and no derived statistics; a stored run
 * re-executes from that record alone; every headline number is recomputable
 * without re-simulating; and nothing is printed as a bare mean.
 * -------------------------------------------------------------------------- */

export {
  HEADLINE_METRIC_ID,
  RECOMMENDED_MIN_REPLICATIONS,
  REPORTS_SCHEMA_VERSION,
  REPORT_METRICS,
  ReportsError,
  SUPPRESSED_LABEL,
  appendRunToFile,
  assertIdenticalReplay,
  buildCandidateReport,
  buildComparisonReport,
  compareCandidates,
  comparisonReportFromRunSet,
  createStoredRun,
  fingerprintOf,
  formatCandidateComparison,
  formatCandidateReport,
  formatComparisonReport,
  formatConvergence,
  formatMeanEstimate,
  formatMetricComparison,
  formatMetricEstimate,
  formatNumber,
  formatSigned,
  groupByCandidate,
  intervalContainsZero,
  observationOf,
  observationsOf,
  parseRunSet,
  parseStoredRun,
  readRunSetFile,
  reanalyzeRunSet,
  reanalyzeStoredRun,
  reanalyzeVerified,
  replaySimulationConfig,
  replaySourcesFrom,
  replayStoredRun,
  runRecordFingerprint,
  serializeRunSet,
  serializeStoredRun,
  storedRunFingerprint,
  summarizeOptionsFor,
  summarizeOptionsOf,
  summaryFingerprint,
  verifySummaryFingerprint,
  writeRunSetFile,
} from './reports/index.js';

export type {
  CandidateComparison,
  CandidateReport,
  CandidateReportOptions,
  CandidateSeries,
  ComparisonOptions,
  ComparisonReport,
  ComparisonReportInput,
  ComparisonVerdict,
  ConvergenceReport,
  ConvergenceStatus,
  CreateStoredRunInput,
  FormatCandidateOptions,
  IntervalMethod,
  MeanEstimate,
  MetricComparison,
  MetricDirection,
  MetricEstimate,
  MetricSpec,
  ReanalyzeOverrides,
  ReplayOptions,
  ReplayOutcome,
  ReplaySources,
  ReplicationObservation,
  RunSetComparisonOptions,
  SerializeStoredRunOptions,
  StoredDemandOptions,
  StoredDispatcherOptions,
  StoredRunConfig,
  StoredRunRecord,
  StoredSimOptions,
  StoredSummarizeOptions,
} from './reports/index.js';

/* -------------------------------------------------------------------------- *
 * oracle/ — the reusable half of the Phase 2 correctness gate: turning a
 * closed-form round trip and a measured one into a verdict, and accounting for
 * the difference term by term. Pure, and imports nothing.
 * -------------------------------------------------------------------------- */

export {
  DEFAULT_RESIDUAL_TOLERANCE,
  constantSpeedPenalty,
  departureGapBracket,
  reconcileRoundTrip,
  relativeDivergence,
  summariseReplications,
} from './oracle/index.js';

export type {
  ClosedFormRoundTrip,
  CompletedRoundTrip,
  DepartureGapBracket,
  MeasuredRoundTrip,
  ReconciliationTerm,
  RelativeDivergence,
  ReplicationStatistic,
  RoundTripReconciliation,
} from './oracle/index.js';
