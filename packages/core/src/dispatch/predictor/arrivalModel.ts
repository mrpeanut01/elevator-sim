/**
 * The learned arrival model: an exponentially-weighted moving average of the arrival rate per
 * (floor, direction, time-of-day bucket), estimated online from observed arrivals alone.
 *
 * ## What it answers, and why the shape is what it is
 *
 * One question: *"where is demand likely to appear in the next H seconds?"* — asked by the
 * repositioning stage so that a car can be parked **before** the calls arrive rather than
 * dispatched after, and by the `predictedDemand` cost term so that an assignment which strands
 * the group away from the next wave is priced for it.
 *
 * ## The estimator: EWMA over completed buckets
 *
 * Time is cut into buckets of `predictorBucketWidthS`, and a bucket's *occurrence* is one visit
 * to it — bucket 7 of Tuesday and bucket 7 of Wednesday are two occurrences of the same bucket.
 * When an occurrence **completes**, its arrival count divided by its width is one rate
 * observation, folded in with weight `predictorLearningRate`:
 *
 * ```
 * rate ← rate + α · (count / width − rate)
 * ```
 *
 * Occurrences that completed with no arrivals fold a zero, which is how a landing learns that it
 * is quiet: a model updated only by arrivals would leave every unvisited floor sitting at the
 * prior forever and could never rank one below it.
 *
 * Two properties follow directly, and both are load-bearing:
 *
 * - **Only completed occurrences count.** The bucket in progress is accumulating and is not part
 *   of any estimate, so a forecast made at time `t` is a function of arrivals strictly before
 *   `t`'s bucket started. That is the causality guarantee, stated as arithmetic — and it is only
 *   half of it. The arithmetic says *nothing* about a query for a time the model has already moved
 *   past: at `t = 100` on a model fed arrivals through `t = 1795`, bucket 0 has long since closed
 *   and the estimate returned is the advanced one. Measured, that is a 21× clairvoyant answer
 *   (31.90 against a causal 1.50). So the read path carries the other half as an **enforced
 *   precondition**: `fromT` must be at or after {@link ArrivalModel.lastObservedAt}, checked by
 *   `requireForecastTime` in `forecast`, `expectedDemandByFloor` and `rate`, exactly as `observe`
 *   already refuses an observation that runs backwards. Monotone use is a rule the module keeps,
 *   not a rule its callers are trusted with.
 * - **Sealing is closed-form.** A gap of `k` empty occurrences is `rate · (1 − α)^k`, so the
 *   state is `O(1)` per cell to bring up to date however long it has been idle, and it never
 *   matters *when* the model is asked — for any time it has not already passed.
 *
 * ## Why one EWMA is not enough: the 30-minute replication
 *
 * The brief for this module says an EWMA per (floor, direction, bucket) is sufficient and to
 * reach for nothing heavier. That is the right estimator, but used alone it would be **inert in
 * exactly the regime this project measures**, and the arithmetic is not close:
 *
 * A `rise-and-fall` replication is 30 minutes (docs/03-traffic-and-statistics.md § The
 * independence condition). At the default 300 s bucket that is six buckets — and, because
 * buckets are *time-of-day* buckets, **six different ones**. Every cell sees exactly one
 * occurrence, of which five complete. So a per-cell EWMA folds at most one observation per cell
 * per run and the prior decides everything. Narrowing the bucket does not help: 60 s buckets
 * give thirty buckets, still one occurrence each. Per-time-of-day learning inherently needs the
 * time of day to come round again, and inside one terminating replication it never does — *at the
 * default 86 400 s cycle*. A cycle shorter than the run does repeat a bucket inside it, which is
 * why `idle.predictorCycleS` is a live dimension there and not the plateau it was first described
 * as; `parameters.ts` states the condition and `parameters.test.ts` measures it.
 *
 * The fix is not a heavier estimator, it is the same estimator at three resolutions, with a
 * shrinkage chain between them:
 *
 * | Level | Keyed by | Learns within a 30-minute run? | Answers |
 * |---|---|---|---|
 * | cell | floor, direction, bucket-of-day | no — one occurrence per bucket | "is this landing busy at 08:35?" |
 * | landing | floor, direction | **yes — every completed bucket** | "is this landing busy?" |
 * | building | — | **yes** | "is the building busy?" |
 * | prior | configuration | — | "what did we believe before the run?" |
 *
 * Each level shrinks toward the next by pseudo-observations:
 *
 * ```
 * estimate = (n · own + s · fallback) / (n + s),   n = min(observations folded, 1/α),  s = priorStrength
 * ```
 *
 * `n` is capped at `1/α` because an EWMA with rate α remembers about that many observations; a
 * count that kept growing would eventually claim more evidence than the average retains and
 * freeze the model. The cap is what keeps a long run adaptive.
 *
 * So a 30-minute replication learns at the landing and building levels, a multi-day run
 * additionally learns the time-of-day shape, and the cold start is the prior at every level. No
 * regime is left inert, and there is still nothing here but exponential moving averages.
 *
 * ## What this file may not do
 *
 * It has **no runtime import outside this directory** — see `types.ts` for why that is the
 * causality argument rather than a style preference — no random draws (CLAUDE.md invariant 2),
 * and no clock (invariant 3): every method takes the time it should answer for. `reset()` exists
 * because a replication that inherits the previous one's learned rates is not independent of it.
 */

import type { SimTime } from '../../kernel/types.js';
import type { Direction } from '../../model/types.js';

import { PREDICTOR_DEFAULTS, PREDICTOR_PARAMETERS } from './parameters.js';
import {
  PredictorError,
  type ArrivalModel,
  type ArrivalModelOptions,
  type PredictorIdleSource,
  type ResolvedPredictorConfig,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Directions
 * -------------------------------------------------------------------------- */

/**
 * The directions a forecast is kept per, mirroring `DIRECTIONS` in `model/types.ts`.
 *
 * Duplicated rather than imported for the reason `DECLARED_TERM_IDS` is duplicated in
 * `terms/index.ts`: importing the constant would be this module's only runtime import outside
 * its own directory, and "the predictor's import list contains nothing it could learn the future
 * from" is a property worth more than two saved lines. `arrivalModel.test.ts` pins the two lists
 * together, so they cannot drift.
 *
 * Both directions are kept for every floor, including the `up` cell of a terminal top floor,
 * which no passenger will ever press. An impossible cell simply never receives an arrival and
 * decays to zero; special-casing the terminals would need the shaft's extent, which is building
 * fabric this module deliberately does not hold.
 */
const FORECAST_DIRECTIONS: readonly Direction[] = Object.freeze(['up', 'down']);

/**
 * How many buckets one forecast may integrate over.
 *
 * A guard, not a tunable, and deliberately far outside the declared `[30, 3600]` range of
 * `idle.predictorHorizonS`: at the narrowest declared bucket width of 30 s the widest declared
 * horizon is 120 segments, so nothing a schema-honouring optimizer samples can reach this. What
 * it catches is a horizon in the wrong unit — minutes read as seconds, a whole day passed by
 * mistake — which would otherwise spin for millions of iterations rather than fail.
 */
const MAX_FORECAST_SEGMENTS = 10_000;

/* -------------------------------------------------------------------------- *
 * Configuration
 * -------------------------------------------------------------------------- */

/**
 * A profile's `idle` section with every default applied and every value checked.
 *
 * Precedence is `profile > defaults`, the same order `resolveDispatchConfig` and
 * `resolveDoorConfig` use. Key order is the order {@link PREDICTOR_PARAMETERS} declares, so
 * `tunablePredictorPathsOf` and the schema can be compared as sequences.
 *
 * Every rejection is a claim the model could not keep quietly:
 *
 * | Rejected | Because |
 * |---|---|
 * | `predictorLearningRate` ≤ 0 or > 1 | 0 is a model that can never learn — an inert predictor that still reports a forecast |
 * | non-positive `predictorHorizonS`, `predictorBucketWidthS`, `predictorCycleS` | a zero-width bucket has no exposure to divide a count by; the rate would be infinite |
 * | negative `predictorPriorRatePerS` or `predictorPriorStrength` | a negative rate is not a rate, and negative evidence would invert the shrinkage |
 * | any non-finite value | `NaN` propagates silently through every forecast that follows |
 */
export function resolvePredictorConfig(
  idle?: PredictorIdleSource | undefined,
): ResolvedPredictorConfig {
  const config: ResolvedPredictorConfig = {
    predictorHorizonS: idle?.predictorHorizonS ?? PREDICTOR_DEFAULTS.predictorHorizonS,
    predictorLearningRate:
      idle?.predictorLearningRate ?? PREDICTOR_DEFAULTS.predictorLearningRate,
    predictorBucketWidthS:
      idle?.predictorBucketWidthS ?? PREDICTOR_DEFAULTS.predictorBucketWidthS,
    predictorCycleS: idle?.predictorCycleS ?? PREDICTOR_DEFAULTS.predictorCycleS,
    predictorPriorRatePerS:
      idle?.predictorPriorRatePerS ?? PREDICTOR_DEFAULTS.predictorPriorRatePerS,
    predictorPriorStrength:
      idle?.predictorPriorStrength ?? PREDICTOR_DEFAULTS.predictorPriorStrength,
  };

  requirePositive('idle.predictorHorizonS', config.predictorHorizonS);
  requirePositive('idle.predictorBucketWidthS', config.predictorBucketWidthS);
  requirePositive('idle.predictorCycleS', config.predictorCycleS);
  requireNonNegative('idle.predictorPriorRatePerS', config.predictorPriorRatePerS);
  requireNonNegative('idle.predictorPriorStrength', config.predictorPriorStrength);

  const alpha = config.predictorLearningRate;
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
    throw new PredictorError(
      `idle.predictorLearningRate must be in (0, 1]; got ${String(alpha)}. A learning rate of zero is a predictor that can never learn, which is a configuration that silently does nothing.`,
    );
  }

  return Object.freeze(config);
}

function requirePositive(id: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PredictorError(`${id} must be a finite positive number; got ${String(value)}.`);
  }
}

function requireNonNegative(id: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new PredictorError(`${id} must be a finite non-negative number; got ${String(value)}.`);
  }
}

/* -------------------------------------------------------------------------- *
 * One cell of the estimator
 * -------------------------------------------------------------------------- */

/**
 * One exponentially-weighted rate estimate, plus the occurrence currently accumulating.
 *
 * The invariant that makes lazy sealing exact: **every occurrence with index `< foldedThrough`
 * is already in `rate`, and `openCount` belongs to occurrence `foldedThrough`.** Under monotone
 * observation an arrival always lands in the occurrence that is open, so one counter suffices —
 * there is never a second unsealed occurrence to remember.
 */
interface Cell {
  /** Arrivals per second. */
  rate: number;
  /** How many occurrences have been folded in. Evidence, for the shrinkage chain. */
  folded: number;
  /** Index of the occurrence `openCount` belongs to; everything before it is folded. */
  foldedThrough: number;
  /** Arrivals seen so far in occurrence {@link foldedThrough}. */
  openCount: number;
}

/** A cell's estimate brought up to a point in time, without writing anything back. */
interface Sealed {
  readonly rate: number;
  readonly folded: number;
}

function emptyCell(): Cell {
  return { rate: 0, folded: 0, foldedThrough: 0, openCount: 0 };
}

/**
 * The estimate a cell holds once every occurrence before `completed` has been folded in. Pure.
 *
 * The read path and the write path share this function, which is what makes a forecast
 * independent of whether anybody happened to observe an arrival first: sealing to `c₁` and then
 * to `c₂` gives the same numbers as sealing straight to `c₂`, because the intervening
 * occurrences are empty either way.
 *
 * `widthS` is the occurrence's own duration, not the nominal bucket width — the last bucket of a
 * cycle may be short, and dividing its count by a width it never had would overstate its rate.
 */
function seal(cell: Cell, completed: number, alpha: number, widthS: number): Sealed {
  if (completed <= cell.foldedThrough) return { rate: cell.rate, folded: cell.folded };

  // The open occurrence has finished: its count is now a rate observation.
  let rate = cell.rate + alpha * (cell.openCount / widthS - cell.rate);
  // Every occurrence between it and `completed` finished empty. Closed form, so a cell nobody
  // has touched for a week costs the same to read as one touched a second ago.
  const empty = completed - cell.foldedThrough - 1;
  if (empty > 0) rate *= (1 - alpha) ** empty;

  return { rate, folded: cell.folded + 1 + empty };
}

/** {@link seal}, written back. The only place a cell's estimate changes. */
function sealInPlace(cell: Cell, completed: number, alpha: number, widthS: number): void {
  if (completed <= cell.foldedThrough) return;
  const next = seal(cell, completed, alpha, widthS);
  cell.rate = next.rate;
  cell.folded = next.folded;
  cell.foldedThrough = completed;
  cell.openCount = 0;
}

/**
 * The estimate, shrunk toward a coarser one by pseudo-observations.
 *
 * `folded` is capped at the EWMA's effective memory `1/α`: the average retains about that many
 * observations, so a cell claiming more evidence than that would keep hardening against its
 * fallback for the rest of the run and stop adapting.
 */
function shrink(own: Sealed, fallback: number, strength: number, memory: number): number {
  const n = Math.min(own.folded, memory);
  const denominator = n + strength;
  // No evidence and no prior weight: there is nothing to say but what the coarser level says.
  // Guarding it here is what keeps `predictorPriorStrength: 0` a valid setting rather than NaN.
  if (denominator <= 0) return fallback;
  return (n * own.rate + strength * fallback) / denominator;
}

/* -------------------------------------------------------------------------- *
 * The model
 * -------------------------------------------------------------------------- */

/**
 * Build a demand predictor.
 *
 * ```ts
 * const model = createArrivalModel({ floorIds: floors.map((f) => f.id), idle: profile.idle });
 *
 * // on a real arrival, and only on a real arrival
 * model.observe(passenger.originFloorId, passenger.direction, kernel.now());
 *
 * // stage 7, before the calls arrive. The model satisfies `DemandForecastSource` as it stands.
 * prepositionPlan(cars, kernel.now(), policy, { predictor: model });
 * ```
 *
 * Always `kernel.now()`, never a time already gone by: a read for a `fromT` before the last
 * observation throws, because the answer would be informed by arrivals that had not happened.
 *
 * The returned object is the mutating {@link ArrivalModel}. Anything that should only *ask* —
 * the `predictedDemand` cost term, a renderer — should be handed it as a `DemandForecast`, which
 * has no `observe`.
 */
export function createArrivalModel(options: ArrivalModelOptions): ArrivalModel {
  const config = resolvePredictorConfig(options.idle);
  const floorIds: readonly string[] = Object.freeze([...options.floorIds]);
  const floorIdSet = new Set(floorIds);
  if (floorIds.length === 0) {
    throw new PredictorError(
      'createArrivalModel needs at least one floor id: a model with no floors can only forecast an empty map, and a repositioning stage handed one parks nowhere.',
    );
  }
  if (floorIdSet.size !== floorIds.length) {
    throw new PredictorError(
      'createArrivalModel was given duplicate floor ids, so two floors would share one estimate and one of them would never appear in a forecast.',
    );
  }

  const alpha = config.predictorLearningRate;
  const bucketWidthS = config.predictorBucketWidthS;
  const cycleS = config.predictorCycleS;
  const strength = config.predictorPriorStrength;
  /** Effective memory of the moving average, in observations. See {@link shrink}. */
  const memory = 1 / alpha;
  const bucketsPerCycle = Math.max(1, Math.ceil(cycleS / bucketWidthS));
  /** Cells the building level is an average over, so its rate is comparable to a landing's. */
  const cellCount = floorIds.length * FORECAST_DIRECTIONS.length;

  /**
   * Per-direction prior rate by floor, arrivals/s, resolved once.
   *
   * Checked at construction rather than on read, for the reason every other resolver in this
   * codebase checks at build time: a bad prior discovered on the ten-thousandth forecast has
   * already produced ten thousand forecasts. A prior naming a floor the model does not serve is
   * a configuration mismatch that would otherwise be silently ignored.
   */
  const priorByFloor = new Map<string, number>(
    floorIds.map((floorId) => [floorId, config.predictorPriorRatePerS]),
  );
  for (const [floorId, perFloor] of options.priorRateByFloor ?? []) {
    if (!floorIdSet.has(floorId)) {
      throw new PredictorError(
        `priorRateByFloor names floor '${floorId}', which is not one of the model's floors. A prior for a floor no forecast reports is a belief that can never be acted on.`,
      );
    }
    if (!Number.isFinite(perFloor) || perFloor < 0) {
      throw new PredictorError(
        `priorRateByFloor['${floorId}'] must be a finite non-negative arrival rate; got ${String(perFloor)}.`,
      );
    }
    priorByFloor.set(floorId, perFloor / FORECAST_DIRECTIONS.length);
  }
  const priorRateOf = (floorId: string): number =>
    priorByFloor.get(floorId) ?? config.predictorPriorRatePerS;

  /* -- state ------------------------------------------------------------- */

  /** `floorId NUL direction NUL bucket`. Materialized on first arrival; see below. */
  let cells = new Map<string, Cell>();
  /** `floorId NUL direction`. */
  let landings = new Map<string, Cell>();
  let building = emptyCell();
  let arrivals = 0;
  let latestObservedAt: SimTime | undefined;

  /* -- bucket arithmetic -------------------------------------------------- */

  /** Which time-of-day bucket a time falls in. */
  const bucketOf = (at: SimTime): number =>
    Math.min(bucketsPerCycle - 1, Math.floor((at % cycleS) / bucketWidthS));

  /** Where a bucket ends inside its cycle, seconds. The last one may be short. */
  const bucketEndInCycle = (bucket: number): number =>
    Math.min((bucket + 1) * bucketWidthS, cycleS);

  /** A bucket's own duration, seconds — the exposure its rate estimate divides by. */
  const bucketWidthOf = (bucket: number): number =>
    bucketEndInCycle(bucket) - bucket * bucketWidthS;

  /**
   * How many occurrences of `bucket` have finished by `at`.
   *
   * Occurrence `k` of bucket `b` runs to `k · cycleS + bucketEnd(b)`, so it has finished iff
   * that instant has passed. Counting completed occurrences rather than elapsed buckets is what
   * makes the cell genuinely per-time-of-day: bucket 7 does not age while bucket 8 is running.
   */
  const completedOccurrences = (bucket: number, at: SimTime): number => {
    const end = bucketEndInCycle(bucket);
    if (at < end) return 0;
    return Math.floor((at - end) / cycleS) + 1;
  };

  /** How many `bucketWidthS` windows have finished by `at`. The landing and building grid. */
  const completedWindows = (at: SimTime): number => Math.max(0, Math.floor(at / bucketWidthS));

  /* -- lookup ------------------------------------------------------------- */

  const cellKey = (floorId: string, direction: Direction, bucket: number): string =>
    `${floorId}\u0000${direction}\u0000${String(bucket)}`;

  const landingKey = (floorId: string, direction: Direction): string =>
    `${floorId}\u0000${direction}`;

  /**
   * A cell's estimate as of `asOf`, without materializing it.
   *
   * A cell that has never been touched is `{rate: 0, folded: 0}`, and sealing that to `asOf`
   * yields exactly the right answer — rate zero, with as much evidence as there are completed
   * occurrences of the bucket, because those windows *were* observed and nothing arrived. So a
   * read never allocates, and a building of 60 floors does not carry 34,560 objects for a
   * pattern it has seen one morning of.
   */
  const sealedCell = (
    floorId: string,
    direction: Direction,
    bucket: number,
    asOf: SimTime,
  ): Sealed => {
    const cell = cells.get(cellKey(floorId, direction, bucket));
    const completed = completedOccurrences(bucket, asOf);
    if (cell === undefined) return { rate: 0, folded: completed };
    return seal(cell, completed, alpha, bucketWidthOf(bucket));
  };

  const sealedLanding = (floorId: string, direction: Direction, asOf: SimTime): Sealed => {
    const cell = landings.get(landingKey(floorId, direction));
    const completed = completedWindows(asOf);
    if (cell === undefined) return { rate: 0, folded: completed };
    return seal(cell, completed, alpha, bucketWidthS);
  };

  const sealedBuilding = (asOf: SimTime): Sealed =>
    seal(building, completedWindows(asOf), alpha, bucketWidthS);

  /**
   * The shrinkage chain: cell → landing → building → prior, every level sealed **as of
   * `asOf`** and never as of the moment being forecast.
   *
   * That is the causality rule in one line. Pricing a bucket the horizon reaches into with the
   * belief the model will hold when it gets there would be remembering, not forecasting.
   */
  const estimatedRate = (
    floorId: string,
    direction: Direction,
    bucket: number,
    asOf: SimTime,
  ): number => {
    const prior = priorRateOf(floorId);
    const wide = sealedBuilding(asOf);
    const perCell = shrink(
      { rate: wide.rate / cellCount, folded: wide.folded },
      prior,
      strength,
      memory,
    );
    const landing = shrink(sealedLanding(floorId, direction, asOf), perCell, strength, memory);
    return shrink(sealedCell(floorId, direction, bucket, asOf), landing, strength, memory);
  };

  /* -- guards ------------------------------------------------------------- */

  const requireKnownFloor = (floorId: string): void => {
    if (!floorIdSet.has(floorId)) {
      throw new PredictorError(
        `unknown floor id '${floorId}': the model was built for [${floorIds.join(', ')}]. An arrival at a floor the model does not know is demand no forecast could ever report.`,
      );
    }
  };

  const requireTime = (at: SimTime, label: string): void => {
    if (!Number.isFinite(at) || at < 0) {
      throw new PredictorError(`${label} must be a finite simulated time at or after 0; got ${String(at)}.`);
    }
  };

  /**
   * {@link requireTime}, plus the other half of the causality guarantee: a **read** may not ask
   * about a time the model has already moved past.
   *
   * `observe` refuses an observation that runs backwards, which keeps the write path monotone. On
   * its own that is not enough, and the gap is not narrow: the estimator answers "as of `asOf`",
   * and once a bucket has closed there is nothing in the arithmetic that distinguishes "asked at
   * `t`" from "asked long after `t` about `t`". Fed 360 arrivals at one landing over `[0, 1800)`,
   * a query for `fromT = 100` returned **31.90** where a model fed only the arrivals before
   * `t = 100` returns **1.50** — a 21× answer, informed entirely by arrivals that had not happened
   * at the time being asked about, and silently plausible.
   *
   * That is reachable without anybody intending it: a decision context built from a call's
   * `registeredAt` rather than `kernel.now()`, a cached `now` while the arrival handler has already
   * run ahead, or replay code scrubbing backwards. It would not fail, it would look like a large
   * pre-positioning win — the "confident nonsense" CLAUDE.md names as this project's most likely
   * failure mode, arrived at through a caller obligation nobody wrote down.
   *
   * So monotone reads are enforced rather than documented. A consumer that genuinely wants a
   * retrospective forecast should hold a model fed only up to that time, or `reset()` and replay
   * the prefix — both of which make the intent visible at the call site, which a silent
   * `min(fromT, lastObservedAt)` would not.
   */
  const requireForecastTime = (at: SimTime, label: string): void => {
    requireTime(at, label);
    if (latestObservedAt !== undefined && at < latestObservedAt) {
      throw new PredictorError(
        `${label} of ${String(at)} is before the most recent observation at ${String(latestObservedAt)}: a forecast for a time the model has already moved past is informed by arrivals that had not happened yet, which is clairvoyance rather than prediction. Ask about ${String(latestObservedAt)} or later, or hold a model fed only up to ${String(at)}.`,
      );
    }
  };

  /* -- the interface ------------------------------------------------------ */

  const forecast = (
    floorId: string,
    direction: Direction,
    fromT: SimTime,
    horizonS?: number | undefined,
  ): number => {
    requireKnownFloor(floorId);
    requireForecastTime(fromT, 'forecast(fromT)');
    const horizon = horizonS ?? config.predictorHorizonS;
    if (!Number.isFinite(horizon)) {
      throw new PredictorError(`forecast(horizonS) must be finite; got ${String(horizon)}.`);
    }
    if (horizon <= 0) return 0;
    if (horizon / bucketWidthS > MAX_FORECAST_SEGMENTS) {
      throw new PredictorError(
        `forecast(horizonS) of ${String(horizon)} s spans more than ${String(MAX_FORECAST_SEGMENTS)} buckets of ${String(bucketWidthS)} s. A forecast is integrated bucket by bucket, and a horizon that long is a unit mistake rather than a question about the near future — the declared range of idle.predictorHorizonS is [30, 3600].`,
      );
    }

    // Integrate the piecewise-constant intensity, splitting at every bucket boundary the window
    // crosses. A horizon that spans a boundary is two buckets' worth of demand, and averaging
    // them into whichever bucket the window opened in is how a predictor misses the peak it was
    // built to see. Boundaries are the multiples of the bucket width within each cycle plus the
    // cycle boundary itself, and each step is strictly forward, so the loop always terminates.
    const end = fromT + horizon;
    let at = fromT;
    let expected = 0;
    while (at < end) {
      const positionInCycle = at % cycleS;
      const bucket = Math.min(bucketsPerCycle - 1, Math.floor(positionInCycle / bucketWidthS));
      const boundary = at - positionInCycle + bucketEndInCycle(bucket);
      const segmentEnd = Math.min(boundary, end);
      expected += estimatedRate(floorId, direction, bucket, fromT) * (segmentEnd - at);
      at = segmentEnd;
    }
    return expected;
  };

  const model: ArrivalModel = {
    config,
    parameters: PREDICTOR_PARAMETERS,
    floorIds,

    get observedArrivals(): number {
      return arrivals;
    },

    get lastObservedAt(): SimTime | undefined {
      return latestObservedAt;
    },

    observe(floorId: string, direction: Direction, at: SimTime, count?: number | undefined): void {
      requireKnownFloor(floorId);
      requireTime(at, 'observe(at)');
      const batch = count ?? 1;
      if (!Number.isInteger(batch) || batch <= 0) {
        throw new PredictorError(
          `observe(count) must be a positive integer; got ${String(batch)}. It is a batch size, and passengers arrive in batches of at least one.`,
        );
      }
      // Time must not run backwards. Not pedantry: an out-of-order observation is precisely the
      // shape replaying a stored history would take, and the causality guarantee — a forecast at
      // `t` uses only arrivals before `t`'s bucket — holds only while observation is monotone.
      if (latestObservedAt !== undefined && at < latestObservedAt) {
        throw new PredictorError(
          `observations must arrive in time order: got ${String(at)} after ${String(latestObservedAt)}. The model learns online and cannot un-learn a bucket it has already closed.`,
        );
      }

      const bucket = bucketOf(at);
      const key = cellKey(floorId, direction, bucket);
      let cell = cells.get(key);
      if (cell === undefined) {
        cell = emptyCell();
        cells.set(key, cell);
      }
      sealInPlace(cell, completedOccurrences(bucket, at), alpha, bucketWidthOf(bucket));
      cell.openCount += batch;

      const landing = landingKey(floorId, direction);
      let pooled = landings.get(landing);
      if (pooled === undefined) {
        pooled = emptyCell();
        landings.set(landing, pooled);
      }
      sealInPlace(pooled, completedWindows(at), alpha, bucketWidthS);
      pooled.openCount += batch;

      sealInPlace(building, completedWindows(at), alpha, bucketWidthS);
      building.openCount += batch;

      arrivals += batch;
      latestObservedAt = at;
    },

    forecast,

    expectedDemandByFloor(
      fromT: SimTime,
      horizonS?: number | undefined,
    ): ReadonlyMap<string, number> {
      // Checked here as well as inside `forecast`, so the message names the method the caller
      // actually called rather than the one it delegates to.
      requireForecastTime(fromT, 'expectedDemandByFloor(fromT)');
      const byFloor = new Map<string, number>();
      for (const floorId of floorIds) {
        let total = 0;
        for (const direction of FORECAST_DIRECTIONS) {
          total += forecast(floorId, direction, fromT, horizonS);
        }
        byFloor.set(floorId, total);
      }
      return byFloor;
    },

    rate(floorId: string, direction: Direction, at: SimTime): number {
      requireKnownFloor(floorId);
      requireForecastTime(at, 'rate(at)');
      return estimatedRate(floorId, direction, bucketOf(at), at);
    },

    reset(): void {
      cells = new Map();
      landings = new Map();
      building = emptyCell();
      arrivals = 0;
      latestObservedAt = undefined;
    },
  };

  return model;
}
