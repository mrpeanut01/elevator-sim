/**
 * `experiments/tuning` — Phase 7's public surface, and the file that gives the phase an owner.
 *
 * Three modules, one barrel:
 *
 * | | |
 * |---|---|
 * | `tuning/space` | the self-describing search space: every declared tunable, discovered from `core`'s own schemas, sampled without a line of elevator-specific code (CLAUDE.md invariant 8) |
 * | `tuning/search` | three optimizers over one contract — {@link randomSearch}, {@link successiveHalving}, {@link sepCmaEs} — and {@link runnerObjective}, the seam to the Phase 3 replication runner |
 * | `tuning/report` | the Pareto front, the noise floor, and {@link runHoldoutRound}: the only thing in this repository that actually runs a **held-out** seed set |
 *
 * Names are listed explicitly and nothing is `export *`, matching
 * `packages/experiments/src/index.ts` and `core`'s barrel: adding an export is then a deliberate
 * widening of the surface, and a collision between two submodules is a compile error here rather
 * than a silent shadow.
 *
 * ## Why this file exists at all, stated once
 *
 * docs/05-roadmap.md § *Standing requirement — the integration seam has an owner*, and
 * docs/08-review-findings.md § 1. Phase 7 shipped complete, correct, unit-tested — and with **no
 * non-test caller anywhere**, the sixth instance of the defect that section exists to prevent.
 * `tuning/search/index.ts` § 6 recorded it as a gate blocker and named the concrete obstacle: the
 * `Candidate` collision below. This barrel resolves it; `packages/cli/src/commands/tune.ts` is the
 * caller. Neither on its own would be enough — a barrel re-export is *reachability*, and the rule
 * this repository settled on is **"name the non-test caller"**. `tuning/deadCode.test.ts` is what
 * makes a seventh instance fail a test instead of waiting for a reviewer.
 *
 * ## The one rename — `Candidate`
 *
 * The two modules each own a type of that name, and they are not the same idea:
 *
 * - `tuning/space`'s `Candidate` is a **parameter assignment**: `ReadonlyMap<string,
 *   ParameterValue>`, a point in the declared box. It is that module's central noun and appears in
 *   most of its signatures.
 * - `tuning/search`'s `Candidate<C>` is a **configuration under evaluation**: an id, a value of the
 *   search's own generic type, and an origin string. Its `C` is very often the space's `Candidate`,
 *   which is exactly why the collision is confusing rather than merely inconvenient.
 *
 * So the space's keeps the bare name and the search's is re-exported as {@link SearchCandidate},
 * the resolution `tuning/search/index.ts` § 6 recommends: renaming the map would rename the noun
 * three files are written around. Neither is a runtime value, so nothing about this is visible to
 * `index.test.ts`'s runtime-surface checks — it is a decision about what a *reader* sees, and it is
 * recorded here rather than left implicit in an import list.
 *
 * That is the **only** collision across the three barrels: checked over all 33 / 39 / 41 runtime
 * values and 28 / 22 / 32 types, the runtime surfaces are pairwise disjoint, and so is the union of
 * all three against the rest of `@elevator-sim/experiments`.
 *
 * ## Note on environment
 *
 * {@link runnerObjective} and {@link runHoldoutRound} run the Phase 3 replication runner, which
 * reaches `node:worker_threads` unless told to stay serial. `tuning/space` imports nothing but
 * `@elevator-sim/core` and is environment-free.
 */

/* -------------------------------------------------------------------------- *
 * tuning/space — the self-describing search space (CLAUDE.md invariant 8).
 *
 * Discovery, sampling, the candidate ⇄ profile map, and the two ports
 * `tuning/search` draws through (`candidateSampler`, `vectorSpace`, `materializer`).
 * -------------------------------------------------------------------------- */

export {
  PARAMETER_SCHEMA_SUFFIX,
  PROFILE_OBJECT_SECTIONS,
  PROFILE_SECTIONS,
  SearchSpaceError,
  activeParameters,
  activeWhenSatisfied,
  applyPatch,
  buildingFeasibility,
  candidateFromProfile,
  candidateProfile,
  candidateSampler,
  candidatesEqual,
  collectSearchSpace,
  decodeCandidate,
  decodeInto,
  defaultCandidate,
  discoverParameterSchemas,
  encodeCandidate,
  fromVector,
  isActive,
  isActiveWhenRange,
  isProfileAuthorable,
  materializer,
  parameterOf,
  parseProfile,
  perturbCandidate,
  perturbValue,
  policyNoiseStream,
  readerFor,
  reflectInto,
  sampleCandidate,
  sampleCandidates,
  sampleValue,
  searchSpace,
  subspace,
  toVector,
  validateValues,
  vectorDimensions,
  vectorSpace,
} from './space/index.js';

export type {
  ActiveWhenCondition,
  ActiveWhenConditions,
  BooleanParameter,
  /** A point in the declared box: parameter id → value. See the rename note above. */
  Candidate,
  CandidateProfileOptions,
  CategoricalParameter,
  CollectOptions,
  ContinuousParameter,
  GateReader,
  IntegerParameter,
  NumericParameter,
  ParameterScale,
  ParameterValue,
  PerturbOptions,
  ProfilePatch,
  ProfileSection,
  ProfileSource,
  SampleOptions,
  SearchParameter,
  SearchParameterCommon,
  SearchSpace,
  VectorDimension,
} from './space/index.js';

/* -------------------------------------------------------------------------- *
 * tuning/search — the three optimizers, the round (CRN, ranking, plateau
 * classes), and the seam to the Phase 3 runner.
 * -------------------------------------------------------------------------- */

export {
  DOC_RUNGS,
  PlateauTally,
  SAMPLE_SEPARATOR,
  SEARCH_DEFAULTS,
  SEARCH_METHODS,
  SEARCH_METHOD_GATE,
  SEARCH_PARAMETERS,
  SEARCH_STREAM,
  SEED_POLICIES,
  SearchError,
  SearchRecorder,
  assertLadder,
  compareEvaluations,
  countDistinctOutcomes,
  isFlat,
  normalizeSearchSeed,
  outcomeKey,
  outcomeOf,
  plannedBudget,
  plateauClasses,
  probeStepFloor,
  randomSearch,
  rankEvaluations,
  roundExperimentSpec,
  roundSeed,
  runRound,
  runnerObjective,
  runnerUpOf,
  sameOutcome,
  searchRng,
  sepCmaEs,
  successiveHalving,
  traceSeedFor,
} from './search/index.js';

export type {
  /**
   * A configuration under evaluation — an id, a value and an origin.
   *
   * Renamed from `tuning/search`'s `Candidate<C>`. See the module docstring: the bare name belongs
   * to `tuning/space`'s parameter assignment, which is very often this type's `C`.
   */
  Candidate as SearchCandidate,
  CandidateOutcome,
  CandidateSampler,
  DimensionStepFloor,
  Evaluation,
  Objective,
  ObjectiveRequest,
  PlateauReport,
  RandomSearchOptions,
  RecordRoundOptions,
  Rung,
  RungResult,
  RunnerObjectiveOptions,
  RunnerUpComparison,
  SearchDimension,
  SearchMethodId,
  SearchParameterSpec,
  SearchParameterType,
  SearchResult,
  SearchRound,
  SeedPolicy,
  SepCmaEsOptions,
  StepFloorProbe,
  StepFloorProbeOptions,
  SuccessiveHalvingOptions,
  SuccessiveHalvingResult,
  TrajectoryPoint,
  VectorSpace,
} from './search/index.js';

/* -------------------------------------------------------------------------- *
 * tuning/report — the Pareto front over (AWT, energy, WT95), the noise floor,
 * and the held-out validation round. Nothing here scalarizes, and nothing here
 * ranks two candidates whose difference is inside the interval half-width.
 * -------------------------------------------------------------------------- */

export {
  AWT_OBJECTIVE_ID,
  ENERGY_OBJECTIVE_ID,
  NOT_COMPARABLE_LABEL,
  SEED_SET_ROLES,
  TUNING_OBJECTIVES,
  TuningReportError,
  WT95_OBJECTIVE_ID,
  accountSeedSets,
  assertDisjointSeedSets,
  assertDistinctObjectives,
  assessHoldout,
  bestByObjective,
  buildTuningReport,
  candidateEvaluationsOf,
  compareObjective,
  compareObjectives,
  dominanceOf,
  dominatesPointwise,
  formatHoldout,
  formatIndistinguishable,
  formatObjectiveComparison,
  formatObjectiveEstimate,
  formatParetoFront,
  formatSeedSets,
  formatTuningReport,
  formatWinners,
  gainOf,
  holdoutRoundSpec,
  isIndistinguishable,
  objectiveMetricSpec,
  objectiveMetricSpecs,
  objectivePointOf,
  objectiveVerdict,
  paretoFrontOfPoints,
  runHoldoutRound,
  seedSetFromReplications,
  seedsOf,
  sharedSeedsOf,
  shrinkageInterval,
  statisticalParetoFront,
  summarizeSeedSet,
} from './report/index.js';

export type {
  BestByObjectiveInput,
  CandidateComparisons,
  CandidateEvaluation,
  CandidateEvaluationsInput,
  CandidateSummary,
  CompareObjectiveOptions,
  DominanceVerdict,
  HoldoutAssessment,
  HoldoutOptions,
  HoldoutRound,
  HoldoutRoundInput,
  HoldoutVerdict,
  IndistinguishablePair,
  ObjectiveArm,
  ObjectiveComparison,
  ObjectivePoint,
  ObjectiveSpec,
  ObjectiveVerdict,
  ObjectiveWinner,
  ParetoEntry,
  ParetoFront,
  ReplicationSource,
  SeedSetAccounting,
  SeedSetEvaluation,
  SeedSetFromReplicationsOptions,
  SeedSetRole,
  SeedSetSummary,
  StatisticalFrontInput,
  TuningArm,
  TuningObservation,
  TuningReport,
  TuningReportInput,
} from './report/index.js';
