/**
 * `core/dispatch/predictor` — the demand predictor that drives predictive pre-positioning.
 *
 * ```ts
 * import { createArrivalModel } from '@elevator-sim/core';
 *
 * const model = createArrivalModel({
 *   floorIds: building.floors.map((floor) => floor.id),
 *   idle: profile.idle,                        // predictorHorizonS, predictorLearningRate, …
 * });
 *
 * // Only on arrivals that have actually happened.
 * model.observe(passenger.originFloorId, direction, kernel.now());
 *
 * // Stage 7, a whole bank at a time: the model *is* a `DemandForecastSource`, so it is handed
 * // over as-is — `expectedDemandByFloor(fromT, horizonS?)` is that interface's only member.
 * const plan = prepositionPlan(cars, kernel.now(), policy, { predictor: model });
 *
 * // Or one car, with the map taken directly.
 * const decision = policy.reposition(car.snapshot(), kernel.now(), {
 *   demandForecast: model.expectedDemandByFloor(kernel.now()),
 * });
 * ```
 *
 * Both reads pass `kernel.now()`, and that is the contract rather than a habit: a read for a time
 * earlier than the last observation throws. See the causality table below.
 *
 * ## Why this module exists
 *
 * Every other stage of dispatch is *reactive*: a passenger presses a button and the group
 * controller answers as well as it can. The floor of what reaction can achieve is the time it
 * takes a car to get there from wherever it happened to be, and on a sparse-traffic building
 * that term dominates everything else — a car parked at the wrong end of a residential tower
 * adds its whole travel time to every call. Anticipation is the only mechanism that attacks it,
 * and anticipation needs a forecast. This is the forecast.
 *
 * `parkingStrategy: predicted-demand` has been implemented since Phase 2 and reports
 * `no-forecast` when nobody supplies one. This module is what stops it reporting that.
 *
 * ## Causality: the property everything else depends on
 *
 * A predictor with access to the passenger trace is not a predictor, it is an oracle, and every
 * number measured with one is meaningless — the quantity under study is the value of
 * *anticipating* demand, and an oracle anticipates nothing. So the module is built so that
 * peeking is not merely forbidden but unavailable:
 *
 * | Mechanism | Enforced by |
 * |---|---|
 * | no runtime import outside this directory — no `traffic/`, no generator, no kernel, nothing | `causality.test.ts` reads this module's own source |
 * | information enters only through `observe(floor, direction, at, count)` | there is no argument in which a future arrival could be expressed |
 * | scoring code holds {@link DemandForecast}, which has no `observe` and no `reset` | the type system |
 * | a forecast made at `t` uses only arrivals before `t`'s bucket started | the estimator folds **completed** buckets only; `causality.test.ts` proves it against a replayed prefix |
 * | …**and `t` may not be a time already gone by** | a read for a `fromT` before `lastObservedAt` throws. The row above is arithmetic about the open bucket and says nothing about a *backwards query*: once a bucket has closed, asking about it later returns the advanced estimate. Measured on a model fed 360 arrivals over `[0, 1800)`, a query for `t = 100` gave **31.90** where the causal answer is **1.50**. Reachable from a context built on a call's `registeredAt`, a cached `now`, or replay scrubbing backwards — none of which would fail, all of which would look like a pre-positioning win |
 *
 * The one hole, stated plainly rather than hidden: a caller may compute
 * `priorRateByFloor` from the trace it is about to generate, and nothing here can tell. That is
 * clairvoyance dressed as configuration. The default prior is uniform so a run that configures
 * nothing cannot benefit from it.
 *
 * ## Layout
 *
 * | Module | Owns |
 * |---|---|
 * | `types.ts` | the vocabulary, and the two faces — {@link ArrivalModel} mutates, {@link DemandForecast} only answers |
 * | `arrivalModel.ts` | the estimator: an EWMA per (floor, direction, time-of-day bucket), with a shrinkage chain down to a landing rate, a building rate and the prior |
 * | `parameters.ts` | the six tunables, self-describing (CLAUDE.md invariant 8) |
 *
 * ## What it is not
 *
 * Not a dispatcher and not a strategy. It answers one question — *"where is demand likely to
 * appear in the next H seconds?"* — and two consumers decide what to do about the answer: the
 * repositioning stage, through `RepositionContext.demandForecast`, and the `predictedDemand`
 * cost term, whose weight lives in `data/dispatcher-profiles.json` like every other. Nothing in
 * here reads a profile id or branches on a strategy name (CLAUDE.md invariant 7).
 *
 * ## Reading the results honestly
 *
 * Phase 3 measured the apparatus this module will be judged by, and the numbers constrain the
 * claim that may be made:
 *
 * - Against a structurally different baseline at n = 100 the paired half-width is **1.33 s**, so
 *   a pre-positioning gain below roughly **8% of AWT is not measurable at all**, and 12% is what
 *   80% power needs. A smaller gain is **indistinguishable**, which is not the same as absent —
 *   and is not a win either.
 * - Turning the predictor on is a structural change, not a nudged weight, so CRN buys about
 *   **1.8×** here rather than the 5–20× that holds between near-neighbour weight vectors.
 * - Tuning the six parameters in `parameters.ts` *is* the near-neighbour regime, where CRN is
 *   worth 100–300×. Expect the two comparisons to behave completely differently.
 *
 * docs/05-roadmap.md § Phase 5 asks for a measurable improvement on Garden Apartments, where
 * parking policy dominates. That is the building to make the claim on, and the half-width is the
 * thing to check before making it.
 */

export { createArrivalModel, resolvePredictorConfig } from './arrivalModel.js';

export {
  PREDICTOR_DEFAULTS,
  PREDICTOR_PARAMETERS,
  PREDICTOR_PARAMETER_IDS,
  predictorParameter,
  predictorParameterValue,
  tunablePredictorPathsOf,
} from './parameters.js';

export { PredictorError } from './types.js';

export type {
  ArrivalModel,
  ArrivalModelOptions,
  DemandForecast,
  PredictorIdleSource,
  ResolvedPredictorConfig,
} from './types.js';
