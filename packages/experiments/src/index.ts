/**
 * `@elevator-sim/experiments` — public barrel.
 *
 * Replication runner, CRN management, statistics (paired-t, sequential stopping, saturation
 * detection) and run-record persistence. Every persisted run record carries the seed that produced
 * it (CLAUDE.md invariant 5), and nothing here weakens CLAUDE.md § Statistical discipline: a
 * difference is declared only through a paired-t interval that excludes zero, and a saturated
 * configuration has its wait statistics suppressed rather than averaged.
 *
 * May depend on `@elevator-sim/core`; nothing in `core` may depend on this package. Six modules
 * are re-exported below — `stats`, `runner/`, `reports/`, `oracle/`, Phase 5's `benchmark/` and
 * Phase 7's `tuning/` — with names listed explicitly rather than with `export *`, matching `core`'s
 * barrel: adding an export becomes a deliberate widening of the package's public surface, and a
 * name collision between two submodules is a compile error here rather than a silent shadow.
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
 * Every interval this package produces — published or consulted by the sequential stopping rule —
 * is Student-t at `n - 1`, at every `n` (docs/03-traffic-and-statistics.md § Part 4), and every
 * estimate records the family it used. There is no `n`-dependent crossover to a normal quantile
 * any more; see `reports/statistics.ts` § "One quantile" and DECISIONS.md § D7. `normalQuantile`
 * remains exported with **no production caller**, deliberately and for the two checkable reasons
 * its own docstring gives: it is the reference `studentTQuantile` is validated against, and it pins
 * the `Z_95` literal `benchmark/verdict.ts` hard-codes for replication planning.
 * All pure functions: no RNG (CLAUDE.md invariant 2), no clock (3), no mutation of an input.
 * -------------------------------------------------------------------------- */

export {
  DEFAULT_CONFIDENCE,
  PUBLISHED_INTERVAL_FAMILY,
  estimateMean,
  meanOf,
  normalQuantile,
  pairedDifferenceEstimate,
  sampleStdDevOf,
  studentTCdf,
  studentTQuantile,
} from './reports/statistics.js';

export type { EstimateOptions, PublishedMeanEstimate } from './reports/statistics.js';

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
 *
 * **Phase 6a's disclosure studies and Phase 6b's raised criterion are here too**,
 * as of C27: `DECISIONS.md` § D62's name list verbatim plus
 * `runMixedUseHighRiseStudy`. What that closes is a *surface* gap — the studies
 * were reachable only at their module paths — and it closes nothing about
 * liveness. Their non-test caller is `benchmark/regeneratePins.ts` and always
 * was; `index.test.ts` § study entry points asks that question of a domain
 * derived from the directory, and deliberately does not ask whether a name is on
 * a barrel, because `measureEnergyLiveness` was on two barrels and was dead.
 * `runDestinationDispatchStudy` is still on no barrel and is still live, which is
 * the same point from the other side.
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
  // Phase 8's experiment matrix, Phase 7's acceptance interval, and the energy axis's liveness
  // proof. Re-exported here for the same reason everything else in this block is: a study that
  // only its own suite can reach is a study nobody outside this package can reproduce.
  EXCLUDED_CELLS,
  MATRIX_ARM_PROFILES,
  MATRIX_BASELINE,
  MATRIX_CELLS,
  MATRIX_METRICS,
  MATRIX_SEED,
  MAX_REPLICATIONS,
  MIN_REPLICATIONS,
  NEAR_NEIGHBOUR_CORRELATION,
  TARGET_HALF_WIDTH_S,
  budgetFor,
  cellResult,
  matrixCell,
  runMatrix,
  runMatrixCell,
  PHASE7_CASE_ID,
  PHASE7_DEADBANDS_S,
  PHASE7_HOLDOUT_SEED,
  PHASE7_REFERENCE_PROFILE,
  PHASE7_REPLICATIONS,
  PHASE7_TUNING_SEED,
  atDeadband,
  deadbandArmId,
  runPhase7Acceptance,
  LIVENESS_PROFILE,
  LIVENESS_REPLICATIONS,
  LIVENESS_SEED,
  LIVENESS_STRATEGIES,
  atStrategy,
  DETECTOR_INPUTS,
  LUNCH_TWO_WAY_BUILDING,
  LUNCH_TWO_WAY_SEED,
  MIX_TIME_BINS,
  formatLunchTwoWayMix,
  measureEnergyLiveness,
  measureLunchTwoWayMix,
  strategyArmId,
  formatLivenessSuite,
  runLivenessSuite,
  runPrepositioningStudy,
  runTailStudy,
  stage5Traffic,
  twoEntranceUpPeak,
  verdictCounts,
  withoutReassignment,
  // Phase 6a's disclosure studies and Phase 6b's raised criterion — `DECISIONS.md` § D62's name
  // list verbatim, plus `runMixedUseHighRiseStudy`, added here and to `benchmark/index.ts` in one
  // commit because `index.test.ts` requires this barrel to carry every runtime value that one
  // exports. C27. It buys **public API surface** and nothing else: their non-test caller is
  // `regeneratePins.ts`, and `index.test.ts` § study entry points asks that question separately
  // and deliberately does not ask this one.
  DEFERRED_ARM,
  DESTINATION_CASES,
  DISCLOSURE_BASELINE,
  DISCLOSURE_METRICS,
  DISCLOSURE_METRIC_LABELS,
  DISCLOSURE_PROFILE,
  GARDEN_RESIDENTIAL_2PCT,
  MIDTOWN_DOWN_PEAK_1PCT,
  MIDTOWN_INTERFLOOR_MIX,
  MIDTOWN_LUNCH_FLAT_CONTROL,
  MIDTOWN_LUNCH_TWO_WAY,
  MIDTOWN_UP_PEAK_1PCT,
  NEGATIVE_CONTROLS,
  RIDE_TIME_WEIGHTS,
  SECURE_INTERFLOOR_MIX,
  SECURE_UP_PEAK_2PCT,
  destinationCase,
  disclosureArm,
  disclosureCase,
  disclosureProfiles,
  formatDisclosureStudy,
  replicationsForHalfWidth,
  rideArmId,
  runDestinationDisclosureStudy,
  runNegativeControls,
  BARE_KIOSK_ARM,
  CREDENTIAL_ARM,
  CREDENTIAL_PLUS_DESTINATION_ARM,
  accessControlProfiles,
  differenceOfDifferences,
  formatAccessControlStudy,
  runAccessControlStudy,
  formatDestinationLiveness,
  livenessCases,
  measureDestinationLiveness,
  runMixedUseHighRiseStudy,
} from './benchmark/index.js';

export type {
  ArmResult,
  AuctionEnsembleOptions,
  AuctionEnsembleResult,
  BenchmarkCase,
  BenchmarkRunOptions,
  CaseResult,
  BudgetBasis,
  CellComparison,
  CellComparisonInput,
  CellVerdict,
  CriterionOutcome,
  EnergyArmMeasurement,
  EnergyLivenessOptions,
  EnergyLivenessStudy,
  DetectorInput,
  LunchTwoWayMixOptions,
  LunchTwoWayMixStudy,
  MixHomogeneity,
  LivenessSuiteOptions,
  LivenessSuiteResult,
  ExcludedCell,
  FrontExclusion,
  MatrixCell,
  MatrixCellResult,
  NearNeighbourPair,
  Phase7AcceptanceOptions,
  Phase7AcceptanceStudy,
  Phase7Interval,
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

/* -------------------------------------------------------------------------- *
 * tuning/ — Phase 7: the self-describing search space, the three optimizers,
 * the seam to the replication runner, and the held-out validation round.
 *
 * Exported for the reason `benchmark/` is and `validation/` is not: what a
 * consumer needs from here is a **library**, not a gate. `tune`, the CLI
 * command, is the non-test caller — `packages/cli/src/commands/tune.ts` — and
 * it reaches every one of {@link randomSearch}, {@link successiveHalving},
 * {@link sepCmaEs}, {@link runnerObjective} and {@link runHoldoutRound} through
 * this barrel. Before it existed the whole module was reachable and called by
 * nothing, which is docs/08-review-findings.md § 1 and the sixth instance of
 * docs/05-roadmap.md's standing requirement. Reachability is not use; a barrel
 * re-export is not a caller; and `tuning/deadCode.test.ts` is what now fails
 * when that stops being true.
 *
 * **One name renamed, and no name omitted.** `tuning/space` and `tuning/search`
 * each export a type called `Candidate` — a parameter assignment and a
 * configuration under evaluation, and the second's generic is routinely the
 * first. `tuning/index.ts` resolves it there, keeping the space's bare name and
 * re-exporting the search's as `SearchCandidate`, and states why; this file
 * inherits the resolved surface. Unlike `canonicalJson` and `DecisionOutcome`
 * above, nothing needed to be held back: the three tuning barrels' runtime
 * surfaces are pairwise disjoint and disjoint from everything else here.
 *
 * `runnerObjective` and `runHoldoutRound` drive the Phase 3 runner and are
 * therefore as environment-bound as the rest of `runner/`; `tuning/space`
 * imports nothing outside `@elevator-sim/core`.
 * -------------------------------------------------------------------------- */

export {
  AWT_OBJECTIVE_ID,
  DOC_RUNGS,
  ENERGY_OBJECTIVE_ID,
  NOT_COMPARABLE_LABEL,
  PARAMETER_SCHEMA_SUFFIX,
  PROFILE_OBJECT_SECTIONS,
  PROFILE_SECTIONS,
  PlateauTally,
  SAMPLE_SEPARATOR,
  SEARCH_DEFAULTS,
  SEARCH_METHODS,
  SEARCH_METHOD_GATE,
  SEARCH_PARAMETERS,
  SEARCH_STREAM,
  SEED_POLICIES,
  SEED_SET_ROLES,
  SearchError,
  SearchRecorder,
  SearchSpaceError,
  TUNING_OBJECTIVES,
  TuningReportError,
  WT95_OBJECTIVE_ID,
  accountSeedSets,
  activeParameters,
  activeWhenSatisfied,
  applyPatch,
  assertDisjointSeedSets,
  assertDistinctObjectives,
  assertLadder,
  assessHoldout,
  bestByObjective,
  buildTuningReport,
  buildingFeasibility,
  candidateEvaluationsOf,
  candidateFromProfile,
  candidateProfile,
  candidateSampler,
  candidatesEqual,
  collectSearchSpace,
  compareEvaluations,
  compareObjective,
  compareObjectives,
  countDistinctOutcomes,
  decodeCandidate,
  decodeInto,
  defaultCandidate,
  discoverParameterSchemas,
  dominanceOf,
  dominatesPointwise,
  encodeCandidate,
  formatHoldout,
  formatIndistinguishable,
  formatObjectiveComparison,
  formatObjectiveEstimate,
  formatParetoFront,
  formatSeedSets,
  formatTuningReport,
  formatWinners,
  fromVector,
  gainOf,
  holdoutRoundSpec,
  isActive,
  isActiveWhenRange,
  isFlat,
  isIndistinguishable,
  isProfileAuthorable,
  materializer,
  normalizeSearchSeed,
  objectiveMetricSpec,
  objectiveMetricSpecs,
  objectivePointOf,
  objectiveVerdict,
  outcomeKey,
  outcomeOf,
  parameterOf,
  paretoFrontOfPoints,
  parseProfile,
  perturbCandidate,
  perturbValue,
  plannedBudget,
  plateauClasses,
  policyNoiseStream,
  probeStepFloor,
  randomSearch,
  rankEvaluations,
  readerFor,
  reflectInto,
  roundExperimentSpec,
  roundSeed,
  runHoldoutRound,
  runRound,
  runnerObjective,
  runnerUpOf,
  sameOutcome,
  sampleCandidate,
  sampleCandidates,
  sampleValue,
  searchRng,
  searchSpace,
  seedSetFromReplications,
  seedsOf,
  sepCmaEs,
  sharedSeedsOf,
  shrinkageInterval,
  statisticalParetoFront,
  subspace,
  successiveHalving,
  summarizeSeedSet,
  toVector,
  traceSeedFor,
  validateValues,
  vectorDimensions,
  vectorSpace,
} from './tuning/index.js';

export type {
  ActiveWhenCondition,
  ActiveWhenConditions,
  BestByObjectiveInput,
  BooleanParameter,
  Candidate,
  CandidateComparisons,
  CandidateEvaluation,
  CandidateEvaluationsInput,
  CandidateOutcome,
  CandidateProfileOptions,
  CandidateSampler,
  CandidateSummary,
  CategoricalParameter,
  CollectOptions,
  CompareObjectiveOptions,
  ContinuousParameter,
  DimensionStepFloor,
  DominanceVerdict,
  Evaluation,
  GateReader,
  HoldoutAssessment,
  HoldoutOptions,
  HoldoutRound,
  HoldoutRoundInput,
  HoldoutVerdict,
  IndistinguishablePair,
  IntegerParameter,
  NumericParameter,
  Objective,
  ObjectiveArm,
  ObjectiveComparison,
  ObjectivePoint,
  ObjectiveRequest,
  ObjectiveSpec,
  ObjectiveVerdict,
  ObjectiveWinner,
  ParameterScale,
  ParameterValue,
  ParetoEntry,
  ParetoFront,
  PerturbOptions,
  PlateauReport,
  ProfilePatch,
  ProfileSection,
  ProfileSource,
  RandomSearchOptions,
  RecordRoundOptions,
  ReplicationSource,
  Rung,
  RungResult,
  RunnerObjectiveOptions,
  RunnerUpComparison,
  SampleOptions,
  SearchCandidate,
  SearchDimension,
  SearchMethodId,
  SearchParameter,
  SearchParameterCommon,
  SearchParameterSpec,
  SearchParameterType,
  SearchResult,
  SearchRound,
  SearchSpace,
  SeedPolicy,
  SeedSetAccounting,
  SeedSetEvaluation,
  SeedSetFromReplicationsOptions,
  SeedSetRole,
  SeedSetSummary,
  SepCmaEsOptions,
  StatisticalFrontInput,
  StepFloorProbe,
  StepFloorProbeOptions,
  SuccessiveHalvingOptions,
  SuccessiveHalvingResult,
  TrajectoryPoint,
  TuningArm,
  TuningObservation,
  TuningReport,
  TuningReportInput,
  VectorDimension,
  VectorSpace,
} from './tuning/index.js';

/* -------------------------------------------------------------------------- *
 * teaching/ — docs/14 § 4.2's teaching surface: the declared training
 * configuration a learned dispatcher is fitted under, and the round that judges
 * it on traffic it has never seen.
 *
 * Exported for `tuning/`'s reason — what a consumer needs is the declaration and
 * the driver — and with `tuning/`'s disclaimer attached: this barrel proves
 * reachability and is not a caller. The named non-test caller is
 * `packages/cli/src/commands/tune.ts` under `--teaching`.
 * -------------------------------------------------------------------------- */

export {
  ACTION_PARAMETER_PREFIX,
  MAX_VERDICT_REPLICATIONS,
  MIN_VERDICT_REPLICATIONS,
  OBSERVATION_CAUSALITIES,
  TeachingError,
  formatTeachingRound,
  parseTeachingSpec,
  runTeachingRound,
  teachingSeedSets,
} from './teaching/index.js';

export type {
  ObservationCausality,
  ObservationFeature,
  TaughtCandidate,
  TaughtPolicy,
  TeachingActionSpace,
  TeachingBudget,
  TeachingCellResult,
  TeachingObjective,
  TeachingRound,
  TeachingRoundInput,
  TeachingSeedPlan,
  TeachingSeedSets,
  TeachingSpec,
} from './teaching/index.js';

/* -------------------------------------------------------------------------- *
 * fuzz/ — Phase 8: randomized buildings and traffic, checked against the six
 * invariants docs/07-handoff.md § 7 requires of any configuration — no passenger
 * lost, none delivered to the wrong floor, no car over capacity, no negative
 * waits, no deadlock, bounded starvation.
 *
 * Exported for the reason `benchmark/` and `tuning/` are and `validation/` is
 * not: what a consumer needs from here is a **library** — a generator, six
 * predicates over a finished run, and a shrinker — not the gate. The gate is
 * `fuzz/*.test.ts` and stays there.
 *
 * The non-test caller of this surface is `fuzz/campaign.ts` itself, which is
 * exported here and is what a deep campaign is driven from
 * (`ELEVATOR_SIM_FUZZ=deep`). That is a weaker claim than `tune` makes for
 * `tuning/` and it is stated rather than dressed up: this is a track whose
 * product is an executed campaign and a set of reusable predicates, and
 * docs/05-roadmap.md's standing requirement is answered by
 * `fuzz/corpus.test.ts` running the corpus on every `vitest run` rather than by
 * a CLI command that does not exist yet.
 *
 * `runCampaign` and `evaluateCase` drive the real simulator against a
 * `LoadedConfig`, so treat them as environment-bound executables in the same
 * sense as `runBenchmark`. `properties.ts`, `shrink.ts` and `generate.ts` are
 * pure and import nothing outside `@elevator-sim/core`.
 *
 * **No name held back, and two renamed at the source.** `fuzz/run.ts` and `fuzz/shrink.ts` each
 * exported a name this barrel already carries with different semantics — `simulationConfigFor`
 * (`runner/` builds a *cell's* config from an experiment spec, not a fuzz case) and `formatCase`
 * (`benchmark/`'s is a benchmark case). Unlike the `canonicalJson` and `DecisionOutcome`
 * omissions above, these are resolved by **renaming**, following `tuning/index.ts`'s
 * `SearchCandidate`: they are `fuzzSimulationConfigFor` and `formatFuzzCase`, so a consumer gets
 * both surfaces and neither can silently shadow the other in a file that imports both. The
 * collisions were found by `tsc`, which is the whole reason a barrel is written by hand.
 * -------------------------------------------------------------------------- */

export {
  DEEP_SPACE,
  FUZZ_PROPERTIES,
  FUZZ_SKIP_REASONS,
  FUZZ_TOPOLOGIES,
  PROPERTY_BOUNDS,
  PROPERTY_CHECKS,
  STANDARD_CORPUS,
  STANDARD_SPACE,
  caseFromSeed,
  checkAll,
  checkCapacity,
  checkConservation,
  checkDestination,
  checkMonotonicTime,
  checkStarvation,
  checkTermination,
  deepCampaignRequested,
  deepCampaignSize,
  deepSeeds,
  MIN_DURATION_BY_TEMPLATE,
  evaluateCase,
  formatFuzzCase,
  formatOutcome,
  formatStats,
  fuzzSimulationConfigFor,
  generateOptionsFrom,
  isFailure,
  minDurationFor,
  refusedAnswer,
  refusingToDispatch,
  reparse,
  resolveCase,
  runCampaign,
  shrinkCase,
  stallingAfter,
  starvingFloorUntil,
  withLostPassenger,
  withMisdelivery,
  withCallType,
  withNegativeWait,
  withOverfilledCar,
} from './fuzz/index.js';

export type {
  CampaignOptions,
  CampaignResult,
  CampaignStats,
  FuzzCase,
  FuzzOutcome,
  FuzzProperty,
  FuzzSkipReason,
  FuzzSpace,
  FuzzTopology,
  GenerateOptions,
  PropertyBounds,
  PropertyContext,
  RefusalPredicate,
  RunOptions,
  ShrinkOptions,
  ShrinkResult,
  Violation,
} from './fuzz/index.js';
