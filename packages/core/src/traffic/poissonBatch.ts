/**
 * The Poisson **batch** arrival process, and the rate conversion that scales every result.
 *
 * ## Passengers arrive in groups
 *
 * docs/03-traffic-and-statistics.md § Arrival process: "Passengers arrive as a Poisson batch
 * arrival process — not one at a time. Groups travel together (colleagues, families, tour
 * groups), and batching materially changes loading and stop patterns."
 *
 * The construction is standard: **batches** arrive as a Poisson process, and each batch
 * carries `B` passengers drawn from the profile's distribution. To hit a target passenger
 * rate `λ` the batch rate must therefore be `λ / E[B]` — see {@link batchesPerSecond}. Get
 * that division wrong in either direction and every arrival rate in the project is off by
 * 40% while still looking entirely plausible.
 *
 * ## The rate conversion
 *
 * `data/traffic-profiles.json` states demand as **percent of building population per five
 * minutes**, the standard lift-engineering unit. {@link passengersPerSecond} is the whole
 * conversion, and `poissonBatch.test.ts` pins it against the worked case in the roadmap:
 * office-standard at 12% on Midtown Office's 1710 occupants is 205.2 passengers per five
 * minutes at peak. This is the quietest possible place for a factor-of-60 error to hide, so
 * it is one exported function with its own tests rather than an inline expression.
 *
 * ## Non-homogeneous rate
 *
 * The rise-and-fall template makes the rate a function of time. {@link sampleBatchArrivalTimes}
 * samples that by **thinning** (Lewis & Shedler 1979): propose arrivals at the peak rate and
 * keep each with probability `intensity(t)`. Thinning is exact for any intensity bounded by
 * the proposal rate, needs no closed-form inverse of the cumulative intensity, and — the
 * property that matters here — consumes draws from exactly one stream, so the whole arrival
 * process stays a pure function of the `arrivals` stream.
 */

import type { Rng } from '../random/index.js';

import { SUPPORTED_BATCH_DISTRIBUTIONS, TrafficError, type BatchSizeCurve } from './types.js';

/** The reporting window lift engineering states demand in. Seconds. */
export const SECONDS_PER_5MIN = 300;

/**
 * Largest group size {@link drawZeroTruncatedPoissonBatchSize} will return before giving up.
 *
 * Not a modelling bound — it is a termination guard on an inversion walk whose support is
 * infinite. The geometric needs none because its inverse is closed-form, and the explicit family
 * needs none because its support is the vector it was given.
 */
const MAX_BATCH_SIZE = 4_000;

/**
 * Guard against a pathological configuration spinning forever. A proposal rate high enough
 * to exceed this over one run is a mis-specified rate, not a busy building: at the largest
 * shipped demand (Vertical City, 4887 occupants at 17%/5 min) one 30-minute run proposes on
 * the order of 40 000 batches.
 */
const MAX_PROPOSALS = 20_000_000;

/**
 * Convert a profile's `arrivalRatePctPop5min` into passengers per simulated second.
 *
 * ```
 * passengers/second = (pct / 100) * population / 300
 * ```
 *
 * @param pctPop5min Percent of the population arriving per five minutes, e.g. `12`.
 * @param population Occupants the rate applies to.
 * @throws TrafficError on a negative or non-finite argument. Zero is legal — an unpopulated
 *   lobby floor generates no demand — but a negative rate is a config error that would
 *   otherwise surface as an empty trace.
 */
export function passengersPerSecond(pctPop5min: number, population: number): number {
  if (!Number.isFinite(pctPop5min) || pctPop5min < 0) {
    throw new TrafficError(
      `Arrival rate must be a non-negative finite percentage of population per 5 min; received ${pctPop5min}`,
    );
  }
  if (!Number.isFinite(population) || population < 0) {
    throw new TrafficError(`Population must be non-negative and finite; received ${population}`);
  }
  return (pctPop5min / 100) * population / SECONDS_PER_5MIN;
}

/**
 * The same conversion expressed as passengers per five minutes — the number a lift engineer
 * recognizes, and the one the acceptance test asserts.
 */
export function passengersPer5Min(pctPop5min: number, population: number): number {
  return passengersPerSecond(pctPop5min, population) * SECONDS_PER_5MIN;
}

/**
 * Batch rate implied by a passenger rate and a mean batch size.
 *
 * `E[passengers per second] = batchRate * E[B]`, so `batchRate = λ / E[B]`. A mean below one
 * is not a batch.
 */
export function batchesPerSecond(passengerRate: number, meanBatchSize: number): number {
  if (!Number.isFinite(passengerRate) || passengerRate < 0) {
    throw new TrafficError(`Passenger rate must be non-negative and finite; received ${passengerRate}`);
  }
  if (!Number.isFinite(meanBatchSize) || meanBatchSize < 1) {
    throw new TrafficError(
      `Mean batch size must be at least 1 — a batch contains at least one passenger; received ${meanBatchSize}`,
    );
  }
  return passengerRate / meanBatchSize;
}

/**
 * Draw from the shifted geometric distribution on `{1, 2, 3, ...}` with the given mean.
 *
 * `P(B = k) = (1 - p)^(k-1) * p` with `p = 1 / mean`, sampled by inversion:
 * `k = ceil(ln U / ln(1 - p))`, which is exact because `P(B <= k) = 1 - (1-p)^k`.
 *
 * **Exactly one underlying draw is consumed per call, for every mean.** A mean of 1 is
 * degenerate (every batch is a single passenger) and returns 1 without special-casing the
 * draw away — a sampler whose draw count depends on its parameters desynchronizes common
 * random numbers the moment two configurations differ in that parameter, the same reasoning
 * that governs `Pcg32.bernoulli` and `drawPassengerMass`.
 */
export function drawGeometricBatchSize(rng: Rng, mean: number): number {
  if (!Number.isFinite(mean) || mean < 1) {
    throw new TrafficError(
      `Geometric batch size needs a mean of at least 1; received ${mean}. A batch contains at least one passenger.`,
    );
  }
  // `1 - nextFloat()` moves the uniform into (0, 1] so `ln u` is never -Infinity.
  const u = 1 - rng.nextFloat();
  if (mean === 1) return 1;
  const p = 1 / mean;
  const size = Math.ceil(Math.log(u) / Math.log(1 - p));
  // ln u is at most 0, so `size` is at least 0; it is 0 only when u === 1 exactly.
  return size < 1 ? 1 : size;
}

/**
 * Solve `λ / (1 - e^-λ) = mean` for the Poisson rate behind a zero-truncated mean.
 *
 * The map is strictly increasing from 1 (as `λ → 0`) to infinity, so a mean above 1 has exactly
 * one root and bisection finds it without a derivative. **Deterministic and draw-free**: a fixed
 * iteration count, so the answer is a pure function of the mean and two configurations sharing a
 * mean share a rate exactly.
 *
 * Bisection rather than Newton because Newton's iteration count depends on the starting point,
 * and a loop whose length depends on its parameters is the habit this module is built to avoid —
 * here it would only cost float determinism rather than draw alignment, but the same discipline
 * costs nothing to keep.
 */
function poissonRateForTruncatedMean(mean: number): number {
  let low = 0;
  let high = 1;
  // `mean` grows without bound in `λ`, so double until it brackets. Ten doublings reach λ = 1024,
  // a mean far past any group a lift lobby produces.
  while (high / (1 - Math.exp(-high)) < mean && high < 1024) high *= 2;
  for (let step = 0; step < 80; step += 1) {
    const mid = (low + high) / 2;
    if (mid / (1 - Math.exp(-mid)) < mean) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Draw from the **zero-truncated Poisson** on `{1, 2, 3, ...}` with the given mean.
 *
 * The same first moment as {@link drawGeometricBatchSize} and a much tighter shoulder: a
 * geometric with mean 2 puts half its mass on singles and has a long tail, while a
 * zero-truncated Poisson with mean 2 clusters around two. That is the whole reason it is offered
 * — "groups of about three" and "mostly singles, occasionally eleven" are different buildings at
 * the same headcount, and the geometric can only say the second.
 *
 * Sampled by **inversion**, walking `P(B = k+1) = P(B = k) · λ / (k+1)` from
 * `P(B = 1) = λ e^-λ / (1 - e^-λ)`. **Exactly one underlying draw is consumed per call, for every
 * mean** — the loop consumes no randomness, only the single uniform drawn before it. A
 * Knuth-style Poisson sampler would consume a number of draws that depends on λ and would have to
 * be gated behind `trafficModel: 'v2'`; this does not.
 */
export function drawZeroTruncatedPoissonBatchSize(rng: Rng, mean: number): number {
  if (!Number.isFinite(mean) || mean < 1) {
    throw new TrafficError(
      `Zero-truncated Poisson batch size needs a mean of at least 1; received ${mean}. A batch contains at least one passenger.`,
    );
  }
  // Drawn before the degenerate check, never after it: a sampler that short-circuits at mean 1
  // consumes a different number of draws there than elsewhere, which is the desynchronization
  // `drawGeometricBatchSize` refuses for the same reason.
  const u = rng.nextFloat();
  if (mean === 1) return 1;

  const lambda = poissonRateForTruncatedMean(mean);
  // p1 = λ e^-λ / (1 - e^-λ). `expm1` keeps the denominator accurate for small λ.
  let probability = (lambda * Math.exp(-lambda)) / -Math.expm1(-lambda);
  let cumulative = probability;
  for (let size = 1; size < MAX_BATCH_SIZE; size += 1) {
    if (u < cumulative) return size;
    probability *= lambda / (size + 1);
    cumulative += probability;
  }
  return MAX_BATCH_SIZE;
}

/**
 * Draw from an **authored** weight vector over group sizes `1..n`.
 *
 * The family docs/14 § 2.2 calls the one worth having: *"a conference floor emptying in groups of
 * eight is a different building from one emptying in ones and twos at the same passenger rate,
 * and no mean can express that."* Weights are relative and are normalized here, so an author — or
 * a generic optimizer sampling `traffic.batchSize.weight` in `[0, 1]` — never has to make them
 * sum to anything.
 *
 * **Exactly one underlying draw is consumed per call, for every vector**: inversion over the
 * cumulative weights, never rejection.
 */
export function drawExplicitBatchSize(rng: Rng, weights: readonly number[]): number {
  const total = validateWeights(weights);
  const target = rng.nextFloat() * total;
  let cumulative = 0;
  for (const [index, weight] of weights.entries()) {
    cumulative += weight;
    if (target < cumulative) return index + 1;
  }
  // Reached only when `target` lands on the very top of the range through rounding. The largest
  // size with positive weight is the honest answer; falling off the end would be a silent 0.
  for (let index = weights.length - 1; index >= 0; index -= 1) {
    if ((weights[index] ?? 0) > 0) return index + 1;
  }
  /* c8 ignore next -- unreachable: validateWeights refuses an all-zero vector */
  throw new TrafficError('Explicit batch size weights contain no positive entry');
}

/** Shared validation for {@link drawExplicitBatchSize} and {@link meanBatchSizeOf}. */
function validateWeights(weights: readonly number[] | undefined): number {
  if (weights === undefined || weights.length === 0) {
    throw new TrafficError(
      'An explicit batch size distribution needs a weights vector over group sizes 1..n; received none. weights[0] is the relative likelihood of a lone passenger.',
    );
  }
  let total = 0;
  for (const [index, weight] of weights.entries()) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new TrafficError(
        `Batch size weight for group size ${index + 1} must be non-negative and finite; received ${weight}`,
      );
    }
    total += weight;
  }
  if (total <= 0) {
    throw new TrafficError(
      'Explicit batch size weights must give at least one group size a positive weight; all are zero, which is a building nobody arrives at rather than a group-size curve.',
    );
  }
  return total;
}

/**
 * The mean group size a curve implies — **the number {@link batchesPerSecond} divides by**.
 *
 * Every family has to expose one, and `explicit` has to *derive* it rather than carry it. The
 * trap is named in docs/14 § 2.2: total passenger demand is held fixed at `λ`, so the batch rate
 * is `λ / E[B]`, and a family whose mean was authored beside its shape could drift from it and
 * silently change how many people the building generates. Derived here, on every call, from the
 * same vector the sampler draws from.
 */
export function meanBatchSizeOf(curve: BatchSizeCurve): number {
  if (curve.distribution === 'explicit') {
    const total = validateWeights(curve.weights);
    let weighted = 0;
    for (const [index, weight] of (curve.weights ?? []).entries()) weighted += (index + 1) * weight;
    return weighted / total;
  }
  if (curve.mean === undefined) {
    throw new TrafficError(
      `Batch size distribution "${curve.distribution}" needs a mean; received none. Only the explicit family derives its mean from a weight vector.`,
    );
  }
  return curve.mean;
}

/**
 * Draw one batch size from a declared group-size curve.
 *
 * @throws TrafficError for a distribution this module cannot sample. Adding one means adding
 *   the sampler here **and** its name to {@link SUPPORTED_BATCH_DISTRIBUTIONS}, so a typo in
 *   `data/traffic-profiles.json` fails loudly instead of silently falling back to singles.
 */
export function drawBatchSize(rng: Rng, config: BatchSizeCurve): number {
  switch (config.distribution) {
    case 'geometric':
      return drawGeometricBatchSize(rng, meanBatchSizeOf(config));
    case 'zeroTruncatedPoisson':
      return drawZeroTruncatedPoissonBatchSize(rng, meanBatchSizeOf(config));
    case 'explicit':
      return drawExplicitBatchSize(rng, config.weights ?? []);
    default:
      throw new TrafficError(
        `Unsupported batch size distribution "${config.distribution}". Supported: ${SUPPORTED_BATCH_DISTRIBUTIONS.join(', ')}. Add the sampler in traffic/poissonBatch.ts and declare it in data/traffic-profiles.json.`,
      );
  }
}

/** Inputs to {@link sampleBatchArrivalTimes}. */
export interface BatchArrivalOptions {
  /** Must be the `arrivals` stream of the replication's `StreamSet`. */
  readonly rng: Rng;
  /** Batch rate at full intensity, batches per second. Zero yields no arrivals. */
  readonly peakBatchesPerSecond: number;
  /** Length of the run, seconds. Arrivals are generated on `[0, durationS)`. */
  readonly durationS: number;
  /**
   * Rate multiplier at a time, in `[0, 1]`. Returning a value above 1 means the proposal rate
   * is not an upper bound and thinning would silently under-generate, so it throws.
   */
  readonly intensityAt: (timeS: number) => number;
}

/**
 * Arrival times of a non-homogeneous Poisson batch process, ascending.
 *
 * Consumes from `rng` only: one exponential per proposal plus one uniform per acceptance
 * test. The number of draws depends on the rate and the run length but not on anything the
 * simulation does, which is the whole point — the same seed yields the same batch times no
 * matter how the elevators behave.
 */
export function sampleBatchArrivalTimes(options: BatchArrivalOptions): readonly number[] {
  const { rng, peakBatchesPerSecond, durationS, intensityAt } = options;
  if (!Number.isFinite(peakBatchesPerSecond) || peakBatchesPerSecond < 0) {
    throw new TrafficError(
      `Peak batch rate must be non-negative and finite; received ${peakBatchesPerSecond}`,
    );
  }
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new TrafficError(`Run duration must be positive and finite; received ${durationS}`);
  }
  if (peakBatchesPerSecond === 0) return [];

  const times: number[] = [];
  let t = 0;
  let proposals = 0;
  for (;;) {
    t += rng.exponential(peakBatchesPerSecond);
    if (t >= durationS) break;
    proposals += 1;
    if (proposals > MAX_PROPOSALS) {
      throw new TrafficError(
        `Batch arrival sampling exceeded ${MAX_PROPOSALS} proposals at ${peakBatchesPerSecond} batches/s over ${durationS} s. That is a mis-specified arrival rate, not a busy building.`,
      );
    }
    const intensity = intensityAt(t);
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
      throw new TrafficError(
        `Demand intensity must lie in [0, 1] for thinning to be exact; received ${intensity} at t=${t}. An intensity above 1 means the proposal rate is not an upper bound and arrivals would be silently lost.`,
      );
    }
    // Always exactly one uniform, whatever the intensity: `bernoulli` does not short-circuit,
    // so the draw count stays a function of the proposal count alone.
    if (rng.bernoulli(intensity)) times.push(t);
  }
  return times;
}
