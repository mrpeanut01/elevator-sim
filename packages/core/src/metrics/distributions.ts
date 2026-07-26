/**
 * Percentiles, histograms and trend fitting: the arithmetic every summary is made of.
 *
 * Pure functions over plain arrays, with no knowledge of elevators. They live in `core/`
 * rather than in `experiments/stats/` because the *within-run* statistics — WT95, the load
 * factor distribution, the queue trend — are properties of a single run, and `summarize.ts`
 * needs them without taking a dependency on the replication runner. Cross-run inference
 * (confidence intervals, paired-t, sequential stopping) is a different job and stays in
 * Phase 3's `experiments/stats/`.
 *
 * ## Percentiles state their method
 *
 * There is no single definition of "the 95th percentile" — Hyndman & Fan enumerate nine — and
 * WT95 is a headline metric compared between configurations that differ by fractions of a
 * second. Every function here takes the method explicitly (defaulting to
 * {@link DEFAULT_PERCENTILE_METHOD}, type 7, what NumPy and R compute) and every result
 * carries the method it used, so two tools that disagree disagree loudly.
 *
 * Percentile positions are given in **percent, 0–100**, never as a fraction. `p95` and `0.95`
 * are one transposition apart and only one of them is an error the type system catches.
 *
 * Nothing here reads a wall clock or draws a random number.
 */

import {
  DEFAULT_PERCENTILE_METHOD,
  MetricsError,
  type DurationStatistics,
  type Histogram,
  type HistogramBin,
  type LinearTrend,
  type PercentileMethod,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Basics
 * -------------------------------------------------------------------------- */

/** Ascending copy, rejecting `NaN` — a silent `NaN` in a sort makes the order undefined. */
export function sortedAscending(values: readonly number[]): number[] {
  const copy = [...values];
  for (const value of copy) {
    if (Number.isNaN(value)) {
      throw new MetricsError('Cannot compute order statistics over a sample containing NaN.');
    }
  }
  return copy.sort((a, b) => a - b);
}

/** Arithmetic mean, or `NaN` for an empty sample. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/**
 * Sample standard deviation, `n - 1` denominator. `NaN` for fewer than two observations.
 *
 * The `n - 1` denominator is the one that belongs here: these samples are drawn from a
 * population (the passengers a peak *could* have produced), not enumerations of it, and the
 * result feeds a confidence interval in Phase 3 that assumes an unbiased variance estimate.
 *
 * Computed in two passes rather than from `Σx²  - (Σx)²/n`, which loses catastrophic
 * precision when the mean is large relative to the spread — exactly the case for waiting
 * times clustered around a long mean.
 */
export function sampleStdDev(values: readonly number[]): number {
  if (values.length < 2) return Number.NaN;
  const average = mean(values);
  let sumSquares = 0;
  for (const value of values) {
    const deviation = value - average;
    sumSquares += deviation * deviation;
  }
  return Math.sqrt(sumSquares / (values.length - 1));
}

/** Observations **strictly greater** than `threshold`. */
export function countAbove(values: readonly number[], threshold: number): number {
  let count = 0;
  for (const value of values) if (value > threshold) count += 1;
  return count;
}

/**
 * Fraction of observations **strictly greater** than `threshold`, `0`–`1`. `NaN` when empty.
 *
 * Strictly greater, because the metric it serves is "% waiting **> 60 s**". A passenger who
 * waited exactly 60.0 s did not wait longer than 60 s, and `>=` would make the answer depend
 * on floating-point luck at the boundary.
 */
export function fractionAbove(values: readonly number[], threshold: number): number {
  if (values.length === 0) return Number.NaN;
  return countAbove(values, threshold) / values.length;
}

/* -------------------------------------------------------------------------- *
 * Percentiles
 * -------------------------------------------------------------------------- */

/**
 * The `percent`-th percentile of `values`.
 *
 * @param percent position in **0–100**, not a fraction.
 * @param method see {@link PERCENTILE_METHODS}; defaults to `linear` (Hyndman & Fan type 7).
 * @throws MetricsError for an empty sample, a `percent` outside `[0, 100]`, or a `NaN`
 *   observation.
 *
 * ```ts
 * percentile([15, 20, 35, 40, 50], 40);                  // 29   — 20 + 0.6 * (35 - 20)
 * percentile([15, 20, 35, 40, 50], 40, 'nearest-rank');  // 35   — x[ceil(5 * 0.4) - 1]
 * ```
 */
export function percentile(
  values: readonly number[],
  percent: number,
  method: PercentileMethod = DEFAULT_PERCENTILE_METHOD,
): number {
  return percentileOfSorted(sortedAscending(values), percent, method);
}

/**
 * {@link percentile} over an already-ascending array.
 *
 * The array is trusted, not re-checked: this is the form used inside a loop over several
 * percentiles of one sample, and re-sorting per percentile is the only part of a summary that
 * would be super-linear.
 */
export function percentileOfSorted(
  sorted: readonly number[],
  percent: number,
  method: PercentileMethod = DEFAULT_PERCENTILE_METHOD,
): number {
  const n = sorted.length;
  if (n === 0) {
    throw new MetricsError('Cannot take a percentile of an empty sample.');
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new MetricsError(
      `Percentile position must be a percentage in [0, 100]; received ${percent}. Note the units: the 95th percentile is 95, not 0.95.`,
    );
  }

  const first = sorted[0] as number;
  const last = sorted[n - 1] as number;

  if (method === 'nearest-rank') {
    // The classical definition: the smallest observation at or below which at least
    // `percent`% of the sample falls. Always an observed value.
    const rank = Math.ceil((percent / 100) * n);
    const index = Math.min(Math.max(rank, 1), n) - 1;
    return sorted[index] as number;
  }

  // Hyndman & Fan type 7: position (n - 1) * p, linearly interpolated.
  const position = ((n - 1) * percent) / 100;
  const lower = Math.floor(position);
  const fraction = position - lower;
  if (lower >= n - 1) return last;
  if (lower < 0) return first;
  const low = sorted[lower] as number;
  const high = sorted[lower + 1] as number;
  return low + fraction * (high - low);
}

/** Several percentiles of one sample, sorting once. Positions are in 0–100. */
export function percentiles(
  values: readonly number[],
  positions: readonly number[],
  method: PercentileMethod = DEFAULT_PERCENTILE_METHOD,
): number[] {
  const sorted = sortedAscending(values);
  return positions.map((percent) => percentileOfSorted(sorted, percent, method));
}

/** The 50th percentile. `NaN` for an empty sample rather than a throw, for use in summaries. */
export function median(
  values: readonly number[],
  method: PercentileMethod = DEFAULT_PERCENTILE_METHOD,
): number {
  if (values.length === 0) return Number.NaN;
  return percentile(values, 50, method);
}

/* -------------------------------------------------------------------------- *
 * Duration summaries
 * -------------------------------------------------------------------------- */

export interface DurationSummaryOptions {
  readonly percentileMethod?: PercentileMethod | undefined;
}

/**
 * Location, spread and the three reported percentiles of a set of durations.
 *
 * An empty sample yields `NaN` throughout rather than zeros — see the `types.ts` docstring:
 * "no passengers waited" and "passengers waited zero seconds" are different facts and a
 * confidence interval must not be able to confuse them.
 */
export function summarizeDurations(
  values: readonly number[],
  options: DurationSummaryOptions = {},
): DurationStatistics {
  const percentileMethod = options.percentileMethod ?? DEFAULT_PERCENTILE_METHOD;
  if (values.length === 0) {
    return Object.freeze({
      count: 0,
      meanS: Number.NaN,
      stdDevS: Number.NaN,
      minS: Number.NaN,
      medianS: Number.NaN,
      p90S: Number.NaN,
      p95S: Number.NaN,
      p99S: Number.NaN,
      maxS: Number.NaN,
      percentileMethod,
    });
  }

  const sorted = sortedAscending(values);
  return Object.freeze({
    count: sorted.length,
    meanS: mean(sorted),
    stdDevS: sampleStdDev(sorted),
    minS: sorted[0] as number,
    medianS: percentileOfSorted(sorted, 50, percentileMethod),
    p90S: percentileOfSorted(sorted, 90, percentileMethod),
    p95S: percentileOfSorted(sorted, 95, percentileMethod),
    p99S: percentileOfSorted(sorted, 99, percentileMethod),
    maxS: sorted[sorted.length - 1] as number,
    percentileMethod,
  });
}

/* -------------------------------------------------------------------------- *
 * Histograms
 * -------------------------------------------------------------------------- */

/** One observation and how much of the distribution it accounts for. */
export interface WeightedValue {
  readonly value: number;
  /** Seconds, for a time-weighted distribution; `1` for a plain count. Must be finite, >= 0. */
  readonly weight: number;
}

/**
 * Where the bins go.
 *
 * `edges` wins if given. Otherwise the range is `[min, max]` (defaulting to the data's own
 * range) divided into `binCount` equal bins, or into bins of `binWidth`.
 */
export interface HistogramOptions {
  /** Explicit, strictly increasing bin boundaries. At least two. */
  readonly edges?: readonly number[] | undefined;
  /** Equal-width bins across the range. Default 10. Ignored when `edges` or `binWidth` given. */
  readonly binCount?: number | undefined;
  /** Fixed bin width, extended until it covers `max`. Ignored when `edges` is given. */
  readonly binWidth?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

const MAX_BINS = 1000;

/** Unweighted histogram: every observation counts once. */
export function histogram(values: readonly number[], options: HistogramOptions = {}): Histogram {
  return weightedHistogram(
    values.map((value) => ({ value, weight: 1 })),
    options,
  );
}

/**
 * Histogram over weighted observations.
 *
 * Bins are half-open `[lowerBound, upperBound)` so an observation lands in exactly one — with
 * the sole exception of the final bin, which is closed at the top so the maximum observation
 * is not an overflow. Observations outside the bins are counted as {@link Histogram.underflow}
 * or {@link Histogram.overflow} rather than being clamped into the end bins, because a load
 * factor of 1.3 is a fact worth seeing, not a 1.2.
 *
 * {@link Histogram.mean} is the weighted mean of the **observations**, not of the bin
 * midpoints, so binning never moves the mean.
 */
export function weightedHistogram(
  samples: readonly WeightedValue[],
  options: HistogramOptions = {},
): Histogram {
  // Validated before the zero-weight samples are dropped: `NaN > 0` is false, so filtering
  // first would silently swallow exactly the malformed input worth shouting about.
  for (const sample of samples) {
    if (!Number.isFinite(sample.value)) {
      throw new MetricsError(`Histogram observation must be finite; received ${sample.value}.`);
    }
    if (!Number.isFinite(sample.weight) || sample.weight < 0) {
      throw new MetricsError(
        `Histogram weight must be a finite non-negative number; received ${sample.weight}.`,
      );
    }
  }
  const usable = samples.filter((sample) => sample.weight > 0);

  const edges = resolveEdges(usable, options);
  const counts = new Array<number>(Math.max(edges.length - 1, 0)).fill(0);
  const weights = new Array<number>(Math.max(edges.length - 1, 0)).fill(0);

  let underflow = 0;
  let overflow = 0;
  let insideCount = 0;
  let insideWeight = 0;
  let weightedSum = 0;
  let totalWeight = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  const lowest = edges[0];
  const highest = edges[edges.length - 1];

  for (const sample of usable) {
    weightedSum += sample.value * sample.weight;
    totalWeight += sample.weight;
    if (sample.value < min) min = sample.value;
    if (sample.value > max) max = sample.value;

    if (lowest === undefined || highest === undefined) continue;
    if (sample.value < lowest) {
      underflow += 1;
      continue;
    }
    if (sample.value > highest) {
      overflow += 1;
      continue;
    }
    const index = binIndexOf(edges, sample.value);
    counts[index] = (counts[index] ?? 0) + 1;
    weights[index] = (weights[index] ?? 0) + sample.weight;
    insideCount += 1;
    insideWeight += sample.weight;
  }

  const bins: HistogramBin[] = [];
  for (let i = 0; i + 1 < edges.length; i += 1) {
    const weight = weights[i] ?? 0;
    bins.push(
      Object.freeze({
        lowerBound: edges[i] as number,
        upperBound: edges[i + 1] as number,
        count: counts[i] ?? 0,
        weight,
        fraction: insideWeight === 0 ? 0 : weight / insideWeight,
      }),
    );
  }

  return Object.freeze({
    bins: Object.freeze(bins),
    count: insideCount,
    totalWeight: insideWeight,
    underflow,
    overflow,
    mean: totalWeight === 0 ? Number.NaN : weightedSum / totalWeight,
    min: usable.length === 0 ? Number.NaN : min,
    max: usable.length === 0 ? Number.NaN : max,
  });
}

function resolveEdges(
  samples: readonly WeightedValue[],
  options: HistogramOptions,
): readonly number[] {
  if (options.edges !== undefined) {
    const edges = options.edges;
    if (edges.length < 2) {
      throw new MetricsError(
        `A histogram needs at least two bin edges to have one bin; received ${edges.length}.`,
      );
    }
    for (let i = 1; i < edges.length; i += 1) {
      const previous = edges[i - 1] as number;
      const current = edges[i] as number;
      if (!Number.isFinite(current) || current <= previous) {
        throw new MetricsError(
          `Histogram bin edges must be finite and strictly increasing; edge ${i} is ${current} after ${previous}.`,
        );
      }
    }
    return edges;
  }

  if (samples.length === 0) return [];

  let dataMin = Number.POSITIVE_INFINITY;
  let dataMax = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    if (sample.value < dataMin) dataMin = sample.value;
    if (sample.value > dataMax) dataMax = sample.value;
  }

  const min = options.min ?? dataMin;
  let max = options.max ?? dataMax;
  if (max < min) {
    throw new MetricsError(`Histogram max (${max}) must not be below min (${min}).`);
  }
  // A sample with no spread still deserves one bin rather than a degenerate zero-width one —
  // and one bin, not ten identical slivers, unless the caller explicitly asked for a count.
  let degenerate = false;
  if (max === min) {
    max = min + (options.binWidth ?? 1);
    degenerate = options.binCount === undefined;
  }
  if (degenerate && options.binWidth === undefined) return [min, max];

  if (options.binWidth !== undefined) {
    const width = options.binWidth;
    if (!Number.isFinite(width) || width <= 0) {
      throw new MetricsError(`Histogram binWidth must be a positive number; received ${width}.`);
    }
    const count = Math.min(Math.ceil((max - min) / width), MAX_BINS);
    return Array.from({ length: count + 1 }, (_, i) => min + i * width);
  }

  const binCount = options.binCount ?? 10;
  if (!Number.isInteger(binCount) || binCount < 1 || binCount > MAX_BINS) {
    throw new MetricsError(
      `Histogram binCount must be an integer in [1, ${MAX_BINS}]; received ${binCount}.`,
    );
  }
  const width = (max - min) / binCount;
  return Array.from({ length: binCount + 1 }, (_, i) => (i === binCount ? max : min + i * width));
}

/** Index of the bin containing `value`, assuming `edges[0] <= value <= edges[last]`. */
function binIndexOf(edges: readonly number[], value: number): number {
  const lastBin = edges.length - 2;
  if (value >= (edges[edges.length - 1] as number)) return lastBin;

  let low = 0;
  let high = lastBin;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (value >= (edges[mid] as number)) low = mid;
    else high = mid - 1;
  }
  return low;
}

/* -------------------------------------------------------------------------- *
 * Trend
 * -------------------------------------------------------------------------- */

/** One `(x, y)` observation for {@link linearTrend}. */
export interface TrendPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Ordinary-least-squares fit of `y = intercept + slope * x`.
 *
 * The saturation test's engine. Reports the slope's standard error and t-statistic alongside
 * it, so a caller can ask not just "is the queue growing" but "is that growth distinguishable
 * from nothing" — with the caveat that queue-length residuals are autocorrelated and the
 * t-statistic is therefore optimistic. See `SaturationThresholds`.
 *
 * Degenerate inputs are handled rather than thrown, because a short or flat series is a normal
 * thing for a quiet run to produce:
 *
 * - `n < 2`, or every `x` identical: slope `0`, `rSquared` `0`, `tStatistic` `0`.
 * - `n < 3`: no residual degrees of freedom, so `standardError` and `residualStdDev` are
 *   `Infinity` and `tStatistic` is `0` — an unfalsifiable fit must not read as significant.
 * - A perfect fit with a non-zero slope: `standardError` `0` and `tStatistic` `Infinity`.
 */
export function linearTrend(points: readonly TrendPoint[]): LinearTrend {
  const n = points.length;
  if (n === 0) {
    return Object.freeze({
      n: 0,
      slope: 0,
      intercept: Number.NaN,
      rSquared: 0,
      residualStdDev: Number.POSITIVE_INFINITY,
      standardError: Number.POSITIVE_INFINITY,
      tStatistic: 0,
      meanX: Number.NaN,
      meanY: Number.NaN,
    });
  }

  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new MetricsError(
        `Trend points must be finite; received (${point.x}, ${point.y}). A non-finite sample would make the fitted slope meaningless rather than merely wrong.`,
      );
    }
    sumX += point.x;
    sumY += point.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  if (sxx === 0) {
    return Object.freeze({
      n,
      slope: 0,
      intercept: meanY,
      rSquared: 0,
      residualStdDev: Number.POSITIVE_INFINITY,
      standardError: Number.POSITIVE_INFINITY,
      tStatistic: 0,
      meanX,
      meanY,
    });
  }

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const residualSumSquares = Math.max(syy - slope * sxy, 0);
  const rSquared = syy === 0 ? 0 : 1 - residualSumSquares / syy;

  let residualStdDev = Number.POSITIVE_INFINITY;
  let standardError = Number.POSITIVE_INFINITY;
  if (n > 2) {
    residualStdDev = Math.sqrt(residualSumSquares / (n - 2));
    standardError = residualStdDev / Math.sqrt(sxx);
  }

  let tStatistic = 0;
  if (slope !== 0 && Number.isFinite(standardError)) {
    tStatistic = standardError === 0 ? Number.POSITIVE_INFINITY * Math.sign(slope) : slope / standardError;
  }

  return Object.freeze({
    n,
    slope,
    intercept,
    rSquared,
    residualStdDev,
    standardError,
    tStatistic,
    meanX,
    meanY,
  });
}
