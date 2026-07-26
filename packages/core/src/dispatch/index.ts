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
 *
 * Names are re-exported explicitly rather than with `export *`, as in the package barrel, so
 * widening this module's public surface is a deliberate act and a future collision is a
 * compile error here rather than a silent shadow.
 */

/* -------------------------------------------------------------------------- *
 * The policy
 * -------------------------------------------------------------------------- */

export {
  WeightedCostDispatchPolicy,
  createDispatchPolicy,
  resolveDispatchConfig,
} from './policy.js';

/* -------------------------------------------------------------------------- *
 * The scoring engine (stage 3)
 * -------------------------------------------------------------------------- */

export { bestScore, compareScores, rankScores, scoreCar } from './scoringEngine.js';

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
  assessDirectionReversal,
  costTerm,
  directionReversalTerm,
  directionReversals,
  distanceTravelledTerm,
  isDeclaredTerm,
  isImplementedTerm,
  marginalDistanceM,
  pathLengthM,
  routeStartHeightM,
  waitTimeSeconds,
  waitTimeTerm,
} from './terms/index.js';

export type { ReversalAssessment } from './terms/index.js';

/* -------------------------------------------------------------------------- *
 * The seven-stage lifecycle
 * -------------------------------------------------------------------------- */

export {
  PARK_CALL_HORIZON,
  answerDecisionFor,
  assignmentWidth,
  batchKeyOf,
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
  INELIGIBILITY_REASONS,
  NORMALIZATION_SCALE_IDS,
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
  ResolvedNormalization,
  SaturatingNormalization,
  ScoreBreakdown,
  TermContext,
  TermNormalization,
} from './types.js';
