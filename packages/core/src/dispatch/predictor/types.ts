/**
 * The vocabulary of demand forecasting: what an observation is, what a forecast is, and the
 * two faces the model presents to the rest of the system.
 *
 * ## Causality is expressed in the type system, not in a comment
 *
 * The single most important property of this module is that it **cannot see the future**. A
 * predictor that peeks at the passenger trace is clairvoyant, and every result produced with
 * one is worthless — not slightly optimistic, worthless, because the thing being measured is
 * the value of *anticipating* demand and a clairvoyant model does not anticipate anything.
 *
 * Four mechanisms enforce it, in decreasing order of strength:
 *
 * 1. **The module has no runtime import outside its own directory.** Not "does not import
 *    `traffic/`" — imports *nothing* at run time except its own files. Every outward import is
 *    `import type` and is erased. There is no object graph from a predictor to a trace, a
 *    generator, or a kernel, so there is nothing to peek at. `causality.test.ts` reads this
 *    module's own source and asserts it.
 * 2. **The only way information enters is {@link ArrivalModel.observe}**, whose arguments are
 *    a floor, a direction, a time and a count. A caller can only tell it about an arrival that
 *    has *happened*; there is no shape in which a future arrival could be expressed.
 * 3. **{@link DemandForecast} is the face everything downstream holds.** The `predictedDemand`
 *    cost term and the repositioning stage are handed the read-only interface, which has no
 *    `observe` and no `reset`, so no scoring code can inject or unlearn an observation. Only
 *    whatever owns the simulation loop holds the mutating {@link ArrivalModel}.
 * 4. **Reads are monotone, and that is checked.** Both the write path and the read path refuse to
 *    run backwards: `observe` rejects an out-of-order arrival, and {@link DemandForecast.forecast},
 *    {@link DemandForecast.expectedDemandByFloor} and {@link DemandForecast.rate} reject a time
 *    before {@link DemandForecast.lastObservedAt}. Without the second half the first is decoration:
 *    the estimator answers "as of the time asked", so a query about `t = 100` on a model fed
 *    through `t = 1795` returns the *advanced* estimate — measured, 31.90 against a causal 1.50, a
 *    21× clairvoyant answer that no aggregate metric would flag. It is the weakest of the four
 *    because it is a runtime check rather than a structural impossibility, which is why it throws
 *    loudly instead of quietly clamping.
 *
 * The one thing this module cannot check is a **prior derived from the trace**. A caller that
 * computes `priorRateByFloor` from the passengers it is about to generate has smuggled
 * clairvoyance in as configuration, and no structural property of this file can stop it. The
 * honest use of a prior is a belief held *before* the run — "demand starts at the entrances" —
 * and the default is uniform precisely so that a run which configures nothing cannot cheat.
 *
 * ## Conventions
 *
 * - SI. Rates are **arrivals per second**; a forecast is an **expected count** of arrivals,
 *   dimensionless.
 * - `SimTime` is simulated seconds from the kernel. Nothing here reads a clock (CLAUDE.md
 *   invariant 3) — every method takes the time it should answer for.
 * - No random draws anywhere (CLAUDE.md invariant 2). The forecast is a deterministic function
 *   of the observation sequence, and `arrivalModel.test.ts` runs two models through the same
 *   sequence and compares bit for bit.
 * - Reads are pure: {@link DemandForecast.forecast}, {@link DemandForecast.expectedDemandByFloor}
 *   and {@link DemandForecast.rate} mutate nothing, so calling one cannot change what a later
 *   one answers. They are also **monotone**: every one of them throws for a time before
 *   {@link DemandForecast.lastObservedAt}. Pure does not imply causal, and the second property is
 *   the one that keeps a forecast a forecast.
 */

import type { SimTime } from '../../kernel/types.js';
import type { Direction } from '../../model/types.js';
import type { DispatchParameterSpec } from '../types.js';

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/**
 * A predictor that cannot be built, or an observation that cannot be believed.
 *
 * Thrown rather than returned, for the reason `DispatchError` gives: every case is a claim the
 * model cannot keep. A learning rate of zero is a model that can never learn; an arrival at a
 * floor the model was never told about is demand that will never appear in
 * {@link DemandForecast.expectedDemandByFloor} and so a repositioning stage that provably
 * ignores it; an out-of-order observation is a caller replaying history, which is exactly the
 * shape a peek at a trace would take, and an out-of-order *read* is the same peek with the
 * arguments the other way round. Each one produces a plausible-looking forecast of a
 * system nobody configured.
 *
 * Declared here rather than reusing `DispatchError` so this module keeps **zero runtime
 * imports outside its own directory** — the structural property the causality argument rests
 * on. The cost is one extra error class; the benefit is that "it cannot reach a trace" is
 * checkable by reading the import list.
 */
export class PredictorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PredictorError';
  }
}

/* -------------------------------------------------------------------------- *
 * Configuration
 * -------------------------------------------------------------------------- */

/**
 * Every predictor tunable, resolved, with the field names of
 * `data/dispatcher-profiles.json → profiles[].idle`.
 *
 * The names carry the `predictor` prefix — `predictorHorizonS`, not `horizonS` — because an
 * `id` in {@link PREDICTOR_PARAMETERS} is the **dotted path of the value in the data file**,
 * and a resolved field whose name differs from the authored key needs a translation table that
 * can drift. Here `idle.predictorHorizonS` reads back with a single property lookup, so
 * `parameters.test.ts` can assert the correspondence in both directions and neither a hidden
 * knob nor a spurious declaration survives.
 *
 * This interface is **exactly** the tunable surface: derived quantities (how many buckets a
 * cycle holds, the effective memory of the moving average) are computed inside the model and
 * deliberately absent, because a declared parameter nothing reads costs an optimizer real
 * replications to discover is inert.
 */
export interface ResolvedPredictorConfig {
  /** How far ahead a forecast looks by default, seconds. */
  readonly predictorHorizonS: number;
  /** Weight the moving average puts on the newest completed bucket, `(0, 1]`. */
  readonly predictorLearningRate: number;
  /** Width of one time-of-day bucket, seconds. */
  readonly predictorBucketWidthS: number;
  /** Period over which the time-of-day pattern repeats, seconds. */
  readonly predictorCycleS: number;
  /** Prior arrival rate per (floor, direction), arrivals per second. */
  readonly predictorPriorRatePerS: number;
  /** Strength of the prior, in pseudo-observations of a completed bucket. */
  readonly predictorPriorStrength: number;
}

/**
 * The shape the resolver reads a profile's `idle` section through.
 *
 * Declared structurally, as `DispatcherProfileSource` and `DoorAnswerSource` are, so this
 * module states exactly what it needs and a real `IdleStageConfig` satisfies it without a cast
 * and without a runtime import.
 *
 * ## Pending config surface
 *
 * `idleStageSchema` in `config/schema.ts` carries `predictorHorizonS` and
 * `predictorLearningRate` already. It does **not** carry the other four, so a profile in
 * `data/dispatcher-profiles.json` declaring one is rejected at load time today and only
 * {@link ArrivalModelOptions.idle} can set it. The config layer owes:
 *
 * ```ts
 * // config/schema.ts, idleStageSchema
 * predictorBucketWidthS: positive.optional(),
 * predictorCycleS: positive.optional(),
 * predictorPriorRatePerS: nonNegative.optional(),
 * predictorPriorStrength: nonNegative.optional(),
 * // config/types.ts, IdleStageConfig — the same four, as `readonly …?: number | undefined`
 * ```
 *
 * There is a second disagreement in the same two files: `predictorLearningRate` is typed
 * `fraction` = `z.number().min(0).max(1)`, so a profile authoring `0` **loads clean and then
 * throws** inside `createArrivalModel`, which rejects a learning rate that can never learn. The
 * config layer accepts a value the model refuses; `positive.max(1)` — or `z.number().gt(0).max(1)`
 * — is the row that makes the two layers agree.
 *
 * Until that lands, an optimizer honouring {@link PREDICTOR_PARAMETERS} can search all six
 * through this object but can persist only two as a profile. This module owns neither file, so
 * the gap is recorded rather than papered over — the same treatment `EligibilityStageConfig`
 * gives its two — but recorded *executably*: `parameters.test.ts` parses every declared id and
 * every boundary value through the real `dispatcherProfileSchema`, so the day either row changes
 * the build says so instead of this comment going stale.
 */
export interface PredictorIdleSource {
  readonly predictorHorizonS?: number | undefined;
  readonly predictorLearningRate?: number | undefined;
  readonly predictorBucketWidthS?: number | undefined;
  readonly predictorCycleS?: number | undefined;
  readonly predictorPriorRatePerS?: number | undefined;
  readonly predictorPriorStrength?: number | undefined;
}

/** What a model needs to exist. */
export interface ArrivalModelOptions {
  /**
   * Every floor the model may be asked about, in the order
   * {@link DemandForecast.expectedDemandByFloor} should report them.
   *
   * Supplied rather than learned, and that is a requirement rather than a convenience: a model
   * that discovered its floors from arrivals would return an **empty** forecast at cold start,
   * and a repositioning stage handed an empty map parks nowhere. Floors are building fabric —
   * `car.shaft.floors`, `bank.servedFloorIds` — not demand, so taking them from configuration
   * tells the model nothing about who will arrive.
   */
  readonly floorIds: readonly string[];
  /** The `idle` section of a dispatcher profile. Every field optional; defaults documented. */
  readonly idle?: PredictorIdleSource | undefined;
  /**
   * Prior arrival rate by floor, arrivals per second **summed over both directions**, split
   * evenly between them.
   *
   * A belief held before the run: "an office fills from the entrances" is a fact about
   * buildings, not about this replication's passengers. Absent, the prior is uniform at
   * `predictorPriorRatePerS` per (floor, direction) — deliberately the default, so a run that
   * configures nothing has no per-floor belief to be right about by accident.
   *
   * A prior computed from the passengers a run is about to generate is clairvoyance wearing
   * configuration's clothes, and nothing here can detect it. See the module doc.
   */
  readonly priorRateByFloor?: ReadonlyMap<string, number> | undefined;
}

/* -------------------------------------------------------------------------- *
 * The two faces
 * -------------------------------------------------------------------------- */

/**
 * The read-only face: answers questions, learns nothing.
 *
 * This is what the `predictedDemand` cost term and the repositioning stage hold. It has no
 * `observe` and no `reset`, so scoring code cannot teach the model anything — which matters
 * because `Car.estimateCost()` is called thousands of times per decision and a scorer that
 * could record an observation would make the cost function stateful and CLAUDE.md invariant 1
 * unenforceable.
 *
 * Every method is **pure**, and every method takes the time it answers for. A forecast is a
 * function of `(observations, fromT, horizonS)` and of nothing else.
 *
 * Every read also has one **precondition**, enforced rather than assumed: `fromT` must be at or
 * after {@link lastObservedAt}. See mechanism 4 in the module doc for the 21× answer that holds
 * for otherwise.
 */
export interface DemandForecast {
  readonly config: ResolvedPredictorConfig;
  /** The self-describing schema of every tunable this model reads (CLAUDE.md invariant 8). */
  readonly parameters: readonly DispatchParameterSpec[];
  /** Every floor the model reports on, in the supplied order. */
  readonly floorIds: readonly string[];
  /** How many arrivals have been observed since construction or the last {@link ArrivalModel.reset}. */
  readonly observedArrivals: number;
  /**
   * Time of the most recent observation, or `undefined` when none has been made.
   *
   * Also the earliest time any read will answer for: every method below throws for a `fromT`
   * before this. A caller that needs to know whether a query is admissible before making it reads
   * this rather than catching a {@link PredictorError}.
   */
  readonly lastObservedAt: SimTime | undefined;

  /**
   * Expected arrivals at `floorId` travelling `direction` over `[fromT, fromT + horizonS)`.
   *
   * A count, not a rate: the integral of the estimated intensity across the window, which
   * means a horizon spanning a bucket boundary is priced with each bucket's own estimate
   * rather than with the one the window started in.
   *
   * **Every estimate is taken as of `fromT`.** A bucket the window reaches into is read with
   * the belief the model held at `fromT`, never with a belief it will only hold later — that
   * distinction is the whole difference between forecasting and remembering.
   *
   * `horizonS` defaults to `config.predictorHorizonS`; a non-positive horizon forecasts `0`.
   *
   * Throws when `fromT` is before {@link lastObservedAt} — a question about a time the model has
   * already moved past would be answered with the estimate it holds *now*, which is the one shape
   * clairvoyance can take on the read path.
   */
  forecast(
    floorId: string,
    direction: Direction,
    fromT: SimTime,
    horizonS?: number | undefined,
  ): number;

  /**
   * Expected arrivals per floor over `[fromT, fromT + horizonS)`, summed over both directions.
   *
   * Exactly the shape `RepositionContext.demandForecast` wants, so `parkingStrategy:
   * predicted-demand` consumes it without translation. Every floor in {@link floorIds} is
   * present, including ones no arrival has ever been seen at — a floor missing from the map is
   * a floor the repositioning stage will never park on, and "no evidence" is not "no demand".
   *
   * It is also the **whole** of `DemandForecastSource` in `dispatch/policies/types.ts`, the
   * interface `PrepositionContext.predictor` is declared as, so an {@link ArrivalModel} is handed
   * to a group controller with no adapter and no import in either direction. That assignability is
   * a structural claim across a module boundary neither side owns alone, so it is pinned by a
   * compile-time assertion in `arrivalModel.test.ts` rather than left to this sentence: the
   * signature here and the signature there must not drift, and `forecast` — the *scalar* per-floor
   * per-direction read above — is deliberately not the member that satisfies it.
   */
  expectedDemandByFloor(fromT: SimTime, horizonS?: number | undefined): ReadonlyMap<string, number>;

  /**
   * The estimated arrival rate at `(floorId, direction)` at time `at`, arrivals per second.
   *
   * The instantaneous view of the same estimate {@link forecast} integrates. Exposed because a
   * cost term comparing floors at one instant wants a density, and dividing a forecast by its
   * horizon would silently average across a bucket boundary.
   *
   * Throws when `at` is before {@link lastObservedAt}, for the reason {@link forecast} does.
   */
  rate(floorId: string, direction: Direction, at: SimTime): number;
}

/**
 * The mutating face: the read-only one plus the two operations that change what is known.
 *
 * Held by whatever owns the simulation loop and by nothing else. Handing this to a scorer or a
 * cost term would defeat the point of there being two interfaces.
 */
export interface ArrivalModel extends DemandForecast {
  /**
   * Record arrivals that have **already happened**.
   *
   * Called on real arrivals only — a passenger pressing a button, or a batch registering at one
   * landing. Never on a scheduled future arrival, and never from a trace: there is no argument
   * here in which a future arrival could be expressed, which is the point.
   *
   * `count` is a convenience for a batch and is exactly equivalent to `count` separate calls at
   * the same time; passengers arrive in batches (CLAUDE.md § modeling rules) and a caller
   * holding a batch size should not have to loop.
   *
   * Throws when time runs backwards, when `floorId` is not one this model was built for, or
   * when `count` is not a positive integer.
   */
  observe(floorId: string, direction: Direction, at: SimTime, count?: number | undefined): void;

  /**
   * Forget every observation and return to the prior.
   *
   * For reusing a model across replications, and required rather than optional: a replication
   * that starts with the previous one's learned rates is not statistically independent of it,
   * and the confidence intervals in docs/03-traffic-and-statistics.md assume independence.
   * `DispatchPolicy.reset()` exists for the same reason.
   */
  reset(): void;
}
