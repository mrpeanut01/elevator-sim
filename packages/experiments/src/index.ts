/**
 * `@elevator-sim/experiments` — public barrel.
 *
 * Replication runner, CRN management, statistics (paired-t, sequential stopping, saturation
 * detection) and run-record persistence. Every persisted run record carries the seed that produced
 * it (CLAUDE.md invariant 5), and nothing here weakens CLAUDE.md § Statistical discipline: a
 * difference is declared only through a paired-t interval that excludes zero, and a saturated
 * configuration has its wait statistics suppressed rather than averaged.
 *
 * May depend on `@elevator-sim/core`; nothing in `core` may depend on this package. Five modules
 * are re-exported below — `stats`, `runner/`, `reports/`, `oracle/` and Phase 5's `benchmark/` —
 * with names listed explicitly rather than with `export *`, matching `core`'s barrel: adding an
 * export becomes a deliberate widening of the package's public surface, and a name collision
 * between two submodules is a compile error here rather than a silent shadow.
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
 * ## Why `benchmark/` *is* here, when `validation/` is not
 *
 * `src/benchmark/` is the Phase 5 acceptance gate and shares `validation/`'s harness, so the same
 * reasoning would seem to keep it off the surface. It is exported anyway, for a reason that does
 * not apply to `validation/`: what Phase 6 and Phase 7 must reuse is not the gate's *assertions* but
 * its **vocabulary for what a paired interval is allowed to be called**. {@link classify} is the
 * function that refuses to call a point estimate a win; {@link replicationsToResolve} is what turns
 * an INDISTINGUISHABLE cell into the `n` it would need; {@link CELL_VERDICTS} distinguishes
 * `IDENTICAL` (bit-identical arms, no budget changes it) from `INDISTINGUISHABLE` (below resolution
 * at this budget) — a distinction Phase 3 measured the need for and that three of Phase 5's eight
 * arms turned out to require. A later phase that re-implements those from memory will get them
 * subtly wrong in the optimistic direction, which is exactly the failure CLAUDE.md § Statistical
 * discipline names. The gate's suites still live in `*.test.ts` files and are not exported.
 *
 * `runBenchmark`, `runTailStudy`, `runPrepositioningStudy`, `measurePredictorLag` and
 * `measureAuctionAggregation` come with it — they read the real `data/` directory and are as
 * environment-bound as `validation/`'s harness, so treat them as executables, not as library calls.
 * `benchmark/index.ts` is the phase's written report; read it before quoting any number from here.
 * In particular, three of the eight arms are bit-identical to `eta` in a real run and the
 * pre-positioning criterion measured **exactly zero**, both for wiring reasons recorded as gaps 2–5
 * in `core/dispatch/policies/index.ts`.
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

/* -------------------------------------------------------------------------- *
 * benchmark/ — the Phase 5 acceptance gate: eight shipped dispatcher profiles
 * against `nearest-car` on three buildings under common random numbers, plus the
 * four studies the criteria cannot express on their own (stage 7 in isolation,
 * the tail terms one load step up, the predictor's causality, the auction's
 * aggregation).
 *
 * Nothing here tunes a weight, loosens a tolerance or drops a losing arm; a test
 * asserts that the arm list is exactly the shipped profile set. Every verdict is
 * a paired-t interval at 95 %, and a cell whose interval contains zero is
 * reported as INDISTINGUISHABLE with the `n` it would need — never as a point
 * estimate that happens to have the right sign.
 *
 * Two things to read before quoting a number: `benchmark/index.ts`, which is the
 * phase's written report, and the note above on why this module is exported
 * where `validation/` is not.
 *
 * **One name held back: `DecisionOutcome`.** `benchmark/auctionAggregation.ts`
 * exports a type of that name for one randomized decision state and what the two
 * aggregations did with it. `@elevator-sim/core` exports an unrelated
 * `DecisionOutcome` — the `assigned` / `deferred` / … verdict of a dispatch
 * decision. They do not collide here, because this barrel re-exports nothing from
 * `core`; they would collide in any file that imported from both packages, and
 * TypeScript would resolve it silently to whichever import came last. Same
 * reasoning as the `canonicalJson` omission above: a name whose wrong resolution
 * is not a compile error does not go on the surface. It stays reachable at
 * `benchmark/auctionAggregation.js`.
 * -------------------------------------------------------------------------- */

export {
  AFTER_FLOOR,
  ARM_PROFILES,
  ARRIVAL_EVERY_S,
  AUCTION_PROFILE,
  BASELINE_PROFILE,
  BEFORE_FLOOR,
  BENCHMARK_CASES,
  BENCHMARK_METRICS,
  BENCHMARK_SEED,
  CELL_VERDICTS,
  CONTRACT_NET,
  CONTROL_STRATEGY,
  ENSEMBLE_BUILDINGS,
  ENSEMBLE_SEED,
  GARDEN_FLOOR_IDS,
  METRIC_LABELS,
  PREPOSITIONING_PROFILE,
  RUN_DURATION_S,
  SAMPLE_EVERY_S,
  SHIFT_AT_S,
  STAGE5_BUILDING,
  STAGE5_LOADS,
  STAGE5_PROFILE,
  STUDIED_PARKING_STRATEGIES,
  TAIL_ARMS,
  TAIL_LOADS,
  TAIL_METRICS,
  TAIL_REFERENCE,
  armOf,
  armsWithVerdict,
  auditForecastCausalityInRun,
  benchmarkCase,
  cellNote,
  classify,
  compareCell,
  criterionOutcomes,
  formatBenchmark,
  formatCapacityReassignment,
  formatCase,
  formatInterval,
  formatRelative,
  formatTailStudy,
  identityClassesOf,
  measureAuctionAggregation,
  measurePredictorLag,
  measureMultiRoundReachability,
  padVerdict,
  parkingArmId,
  parkingVariant,
  replicationsToResolve,
  requireAuctionProfile,
  runBenchmark,
  runBenchmarkCase,
  runCapacityReassignmentStudy,
  runPrepositioningStudy,
  runTailStudy,
  stage5Traffic,
  twoEntranceUpPeak,
  verdictCounts,
  withoutReassignment,
} from './benchmark/index.js';

export type {
  ArmResult,
  AuctionEnsembleOptions,
  AuctionEnsembleResult,
  BenchmarkCase,
  BenchmarkRunOptions,
  CaseResult,
  CellComparison,
  CellComparisonInput,
  CellVerdict,
  CriterionOutcome,
  DecisionState,
  ForecastCausalityAudit,
  ForecastCausalityOptions,
  ForecastSample,
  PredictorLagStudy,
  PrepositioningOptions,
  PrepositioningStudy,
  Stage5Cell,
  Stage5Options,
  Stage5Row,
  Stage5Study,
  TailCell,
  TailRow,
  TailStudy,
  TailStudyOptions,
} from './benchmark/index.js';
