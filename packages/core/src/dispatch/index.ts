/**
 * `core/dispatch` — the group controller.
 *
 * ```ts
 * import { createDispatchPolicy, loadConfig } from '@elevator-sim/core';
 *
 * const config = await loadConfig('data');
 * const policy = createDispatchPolicy(config.dispatcherProfilesById.get('collective')!);
 *
 * policy.register(hallCall, kernel.now());
 * const decision = policy.dispatch(hallCall.id, cars.map((c) => c.snapshot()), kernel.now());
 * ```
 *
 * ## One engine (CLAUDE.md invariant 7)
 *
 * ```
 * cost(car, call) = Σᵢ wᵢ · normalize(termᵢ(car, call))
 * ```
 *
 * Every dispatcher in `data/dispatcher-profiles.json` is a weight vector over that sum plus a
 * few stage settings. There is no `NearestCarDispatcher`; `nearest-car` is
 * `{ distanceTravelled: 1.0 }` and `collective` is `{ waitTime: 1.0 }` with the
 * `noDirectionReversal` hard constraint. Nothing in this module reads a profile id, and
 * `policy.test.ts` proves it by rebuilding every profile under a scrambled id and asserting
 * that no decision moves.
 *
 * Adding a strategy is a config entry. Only a genuinely new **cost term** — a cost the engine
 * cannot currently express — justifies new code, and even then only a new file in `terms/`
 * plus a row in its registry.
 *
 * ## Layout
 *
 * | Module | Owns |
 * |---|---|
 * | `types.ts` | the vocabulary: calls, lifecycles, verdicts, decisions, the policy interface |
 * | `terms/` | one pure function per cost term, plus the registry the engine iterates |
 * | `normalize.ts` | the two maps onto the shared `[0, 1]` scale, and why weights are meaningless without them |
 * | `scoringEngine.ts` | the weighted sum and the total ordering on scores |
 * | `lifecycle.ts` | stages 1, 2, 4, 5, 6 and 7 as pure functions |
 * | `policy.ts` | the state that sequences them, and `DispatcherProfile` → working policy |
 * | `parameters.ts` | the self-describing schema Phase 7 searches (CLAUDE.md invariant 8) |
 * | `policies/` | Phase 5: the aggregation (`auction`), the stage-5 capacity monitor, operational zoning, stage-7 pre-positioning |
 * | `predictor/` | Phase 5: the learned per-floor arrival model that stage 7 and `predictedDemand` read |
 *
 * Names are re-exported explicitly rather than with `export *`, as in the package barrel, so
 * widening this module's public surface is a deliberate act and a future collision is a
 * compile error here rather than a silent shadow.
 *
 * ## Phase 5 widened this barrel, and one name had to be disambiguated
 *
 * `terms/observation.ts` and `policies/zoning.ts` each export a `zoneFloorIdsFor`, and they are
 * different operations rather than two spellings of one:
 *
 * - `zoning.zoneFloorIdsFor(cars, carId)` **computes** a contiguous partition of a bank's shafts
 *   and answers which band a car owns. It is the operational-zoning primitive, and it keeps the
 *   bare name because it is the one a consumer calls.
 * - `observation.zoneFloorIdsFor(observation, carId)` **looks up** a band the group controller
 *   already decided and put on a {@link DispatchObservation}. It is re-exported here as
 *   {@link observedZoneFloorIdsFor}.
 *
 * Unlike `experiments`' two `canonicalJson`s — where picking one would hand a caller the other's
 * semantics silently — these two take unrelated first arguments, so reaching for the wrong one is
 * a compile error rather than a wrong number. That is why one may keep the bare name here and
 * neither may there.
 *
 * ## Everything exported here runs inside `runSimulation`
 *
 * `policies/` and `predictor/` are on the package surface and all four of their behaviours are
 * reachable from a full run: `Simulation` builds every bank's controller through
 * {@link createPolicyFor}, sweeps a `CapacityReassignmentMonitor` after every stop, resolves a
 * {@link groupContext} per dispatch pass and a preposition context per park. Every tunable a
 * Phase 7 optimizer reads off `POLICY_PARAMETERS` or `PREDICTOR_PARAMETERS` can move a
 * `runSimulation` measurement — with one documented exception it must honour rather than discover:
 * `auction.rounds` and `auction.reserveMarginalDelayS` are inert under
 * `auction.aggregation: central-argmin`, which both declare in their `activeWhen`.
 *
 * `sim/seam.test.ts` is what keeps that true. It asserts, behaviourally rather than by grepping for
 * a symbol, that every `idle.parkingStrategy` produces a different run from `stay`, that the two
 * aggregations differ, that sealed-bid is bit-identical to the central argmin, that the load edge
 * fires, and that every weighted cost term produces a non-zero value with spread across candidate
 * cars inside a real run.
 */

/* -------------------------------------------------------------------------- *
 * The policy
 * -------------------------------------------------------------------------- */

export {
  WeightedCostDispatchPolicy,
  createDispatchPolicy,
  resolveDispatchConfig,
  resolveWeights,
  weightSetSourceFrom,
} from './policy.js';

export type { WeightSetLibrarySource } from './policy.js';

/* -------------------------------------------------------------------------- *
 * The scoring engine (stage 3)
 * -------------------------------------------------------------------------- */

export { bestScore, compareScores, rankScores, scoreCar } from './scoringEngine.js';

/* -------------------------------------------------------------------------- *
 * The weight-set selector (stage 3) — one mechanism, two policies
 * -------------------------------------------------------------------------- */

export {
  ArrivalWindow,
  IDLE_TRAFFIC,
  INITIAL_SELECTOR_STATE,
  RULE_EMPHASIS,
  SELECTOR_INPUTS,
  STACKING_MIN_CALLS,
  WEIGHT_SET_POLICIES,
  armMembership,
  isSelectorInput,
  rampMembership,
  resolveRuleArms,
  resolveWeightSets,
  ruleArmMatches,
  ruleClauseHolds,
  rulesObservationOf,
  selectRuleArm,
  selectWeightSet,
} from './selector.js';

export type {
  CompiledRules,
  MembershipRamp,
  PatternSwitchingSource,
  ResolvedRuleSets,
  ResolvedSelection,
  ResolvedWeightSets,
  RuleArm,
  RuleClause,
  RuleRowSource,
  RuleScalarId,
  RuleSelectionResult,
  RulesObservation,
  SelectorInput,
  SelectorState,
  TrafficObservation,
  WeightSetArm,
  WeightSetPolicy,
  WeightSetSelectionResult,
  WeightSetSource,
} from './selector.js';

/* -------------------------------------------------------------------------- *
 * Normalization — required, not optional (CLAUDE.md § modeling rules)
 * -------------------------------------------------------------------------- */

export {
  NORMALIZATION_DEFAULTS,
  boundedNormalize,
  normalizeTerm,
  resolveNormalization,
  saturatingNormalize,
} from './normalize.js';

/* -------------------------------------------------------------------------- *
 * The cost-term library
 * -------------------------------------------------------------------------- */

export {
  COST_TERMS,
  COST_TERMS_BY_ID,
  DECLARED_TERM_IDS,
  IMPLEMENTED_TERM_IDS,
  STARVATION_HALF_COST_S,
  addedStopCount,
  assessDirectionReversal,
  compareRoutes,
  costTerm,
  crowdingTerm,
  demandForecastOf,
  demandMisalignmentM,
  detourPassengerSeconds,
  detourPenaltyTerm,
  diversionDetourTerm,
  directionReversalTerm,
  directionReversals,
  distanceTravelledTerm,
  existingCallDelaySeconds,
  existingCallDelayTerm,
  isDeclaredTerm,
  isImplementedTerm,
  loadFactorTerm,
  marginalDistanceM,
  oldestDelayedCallAgeS,
  pathLengthM,
  predictedDemandTerm,
  resultingLoadFactor,
  rideTimeSeconds,
  rideTimeTerm,
  routeComparison,
  routeEndHeightM,
  routeStartHeightM,
  spareSeatsOnArrival,
  starvationSeconds,
  starvationTerm,
  stopCountTerm,
  unservedQueueFraction,
  waitTimeSeconds,
  waitTimeTerm,
  zoneAffinityTerm,
  zoneDeviationM,
  // Disambiguated against `policies/zoning.ts` — see this file's header.
  zoneFloorIdsFor as observedZoneFloorIdsFor,
} from './terms/index.js';

export type {
  DelayedStop,
  ExpectedDemandByFloor,
  ReversalAssessment,
  RouteComparison,
} from './terms/index.js';

/* -------------------------------------------------------------------------- *
 * The seven-stage lifecycle
 * -------------------------------------------------------------------------- */

export {
  PARK_CALL_HORIZON,
  answerDecisionFor,
  assignmentWidth,
  batchKeyOf,
  callCarriesCredential,
  clearsHysteresis,
  costRequestFor,
  expectedResponseSeconds,
  filterEligible,
  isCommitted,
  landingShare,
  moveSeconds,
  newLifecycle,
  observationFor,
  repositionDecisionFor,
  requestForCar,
  requestForShare,
  scoreableAt,
  withBypassOverridden,
  withLifecycle,
} from './lifecycle.js';

/* -------------------------------------------------------------------------- *
 * Tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

export {
  DISPATCH_DEFAULTS,
  DISPATCH_PARAMETERS,
  DISPATCH_PARAMETER_IDS,
  dispatchParameter,
  dispatchParameterValue,
  tunablePathsOf,
} from './parameters.js';

/* -------------------------------------------------------------------------- *
 * Vocabulary
 * -------------------------------------------------------------------------- */

export {
  ANSWER_REASONS,
  CALL_STAGES,
  DECISION_OUTCOMES,
  DECISION_REASONS,
  DispatchError,
  HARD_CONSTRAINT_IDS,
  HARD_CONSTRAINT_WORDS,
  INELIGIBILITY_REASONS,
  NORMALIZATION_SCALE_IDS,
  PARK_AT_TOP_FLOOR_INDEX,
  REPOSITION_REASONS,
} from './types.js';

export type {
  AnswerDecision,
  AnswerReason,
  BoundedNormalization,
  CallLifecycle,
  CallStage,
  CarScore,
  CostTermDefinition,
  PlayerTermWords,
  PlayerControlWords,
  DecisionOutcome,
  DecisionReason,
  DispatchCall,
  DispatchContext,
  DispatchDecision,
  DispatchObservation,
  DispatchParameterSpec,
  DispatchParameterType,
  DispatchPolicy,
  DispatchPolicyOptions,
  DispatcherProfileSource,
  EligibilityStageConfig,
  EligibilityVerdict,
  HardConstraintId,
  IneligibilityReason,
  NormalizationMode,
  NormalizationScaleId,
  RepositionContext,
  RepositionDecision,
  RepositionReason,
  ResolvedAnswerStage,
  ResolvedConstraints,
  ResolvedDispatchConfig,
  ResolvedDispatchStage,
  ResolvedEligibilityStage,
  ResolvedIdleStage,
  SelectionStageConfig,
  ResolvedNormalization,
  SaturatingNormalization,
  ScoreBreakdown,
  TermContext,
  TermNormalization,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * policies/ — Phase 5. What the aggregation, the capacity edge, operational
 * zoning and pre-positioning add on top of the one engine. Four behaviours, one
 * new tunable pair (`auction.*`); the other three make declared-but-inert
 * parameters bite rather than inventing knobs. Nothing here reads a profile id
 * (invariant 7) and `policies.test.ts` greps the directory to prove it.
 *
 * Read `policies/index.ts` § *Nothing in this directory is reachable from
 * `runSimulation` yet* before quoting any of it in a run-level result.
 * -------------------------------------------------------------------------- */

export {
  AuctionDispatchPolicy,
  CapacityReassignmentMonitor,
  MAX_AUCTION_ROUNDS,
  POLICY_DEFAULTS,
  POLICY_FACTORIES,
  POLICY_PARAMETERS,
  POLICY_PARAMETER_IDS,
  WITHDRAWAL_REASONS,
  aggregationOf,
  bandRange,
  bidsFrom,
  carSnapshotsById,
  consideredCalls,
  contiguousZones,
  createAuctionPolicy,
  createPolicyFor,
  fixedForecast,
  groupContext,
  hasMigrations,
  heldBy,
  loadCrossings,
  movesOf,
  observedContext,
  parkingFloorIds,
  peakReassignments,
  policyParameter,
  prepositionPlan,
  profileAsPolicySource,
  repositionContextFor,
  resolveAuctionConfig,
  resolvePrepositionContext,
  runAuction,
  withLandingCounts,
  zoneAssignment,
  zoneFloorIdsFor,
} from './policies/index.js';

export type {
  AuctionOutcome,
  AuctionPolicyOptions,
  AuctionProfileSource,
  AuctionStageConfig,
  Bid,
  BidSource,
  CallContextSource,
  CallMigration,
  CapacityReassignmentResult,
  DemandForecastSource,
  DispatchPolicyFactory,
  GroupContextOptions,
  GroupObservationContext,
  LoadCrossing,
  OperationalZone,
  ParkableGroup,
  PrepositionContext,
  ReassignableGroup,
  ResolvedAuctionConfig,
  ResolvedAuctionStage,
  ResolvedPrepositionContext,
  Withdrawal,
  WithdrawalReason,
  ZoneAssignment,
} from './policies/index.js';

/* -------------------------------------------------------------------------- *
 * predictor/ — Phase 5. The learned arrival model behind
 * `parkingStrategy: predicted-demand` and the `predictedDemand` cost term.
 *
 * It cannot see the future because it cannot reach the trace: every import in
 * this directory is type-only and none leaves it, so at runtime the emitted
 * module imports nothing outside `predictor/`. Information enters through
 * `observe(floor, direction, at)` and no other door, the estimator folds
 * completed buckets only, and a read for a time before the last observation
 * throws. `causality.test.ts` reads this module's own source to keep it that way.
 * -------------------------------------------------------------------------- */

export {
  PREDICTOR_DEFAULTS,
  PREDICTOR_PARAMETERS,
  PREDICTOR_PARAMETER_IDS,
  PredictorError,
  createArrivalModel,
  predictorParameter,
  predictorParameterValue,
  resolvePredictorConfig,
  tunablePredictorPathsOf,
} from './predictor/index.js';

export type {
  ArrivalModel,
  ArrivalModelOptions,
  DemandForecast,
  PredictorIdleSource,
  ResolvedPredictorConfig,
} from './predictor/index.js';
