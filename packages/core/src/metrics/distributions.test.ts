import { describe, expect, it } from 'vitest';

import {
  countAbove,
  fractionAbove,
  histogram,
  linearTrend,
  mean,
  median,
  percentile,
  percentileOfSorted,
  percentiles,
  sampleStdDev,
  sortedAscending,
  summarizeDurations,
  weightedHistogram,
} from './distributions.js';
import { MetricsError } from './types.js';

/**
 * Percentiles are pinned against **hand-computed** values, not against whatever the
 * implementation happened to return when it was written.
 *
 * There is no single definition of "the 95th percentile", and WT95 is a headline metric
 * compared between configurations that differ by fractions of a second. These vectors fix the
 * interpolation so that a well-meaning refactor toward a different (equally defensible)
 * definition fails loudly instead of silently shifting every published number.
 */
describe('percentile — linear interpolation (Hyndman & Fan type 7)', () => {
  // x = [15, 20, 35, 40, 50], n = 5, so position h = (n - 1) * p / 100 = 4p/100.
  const sample = [15, 20, 35, 40, 50];

  it('returns the endpoints at 0 and 100', () => {
    expect(percentile(sample, 0)).toBe(15);
    expect(percentile(sample, 100)).toBe(50);
  });

  it('lands exactly on an order statistic when the position is an integer', () => {
    // p = 25 -> h = 1 -> x[1]
    expect(percentile(sample, 25)).toBe(20);
    // p = 50 -> h = 2 -> x[2]
    expect(percentile(sample, 50)).toBe(35);
    // p = 75 -> h = 3 -> x[3]
    expect(percentile(sample, 75)).toBe(40);
  });

  it('interpolates linearly between the bracketing order statistics', () => {
    // p = 40 -> h = 1.6 -> x[1] + 0.6 * (x[2] - x[1]) = 20 + 0.6 * 15 = 29
    expect(percentile(sample, 40)).toBeCloseTo(29, 12);
    // p = 90 -> h = 3.6 -> x[3] + 0.6 * (x[4] - x[3]) = 40 + 0.6 * 10 = 46
    expect(percentile(sample, 90)).toBeCloseTo(46, 12);
  });

  it('computes the 95th percentile of [1, 2, 3, 4] as 3.85', () => {
    // h = 3 * 0.95 = 2.85 -> x[2] + 0.85 * (x[3] - x[2]) = 3 + 0.85 = 3.85
    expect(percentile([1, 2, 3, 4], 95)).toBeCloseTo(3.85, 12);
  });

  it('is the default method', () => {
    expect(percentile(sample, 40)).toBe(percentile(sample, 40, 'linear'));
  });

  it('sorts its input rather than assuming it is ordered', () => {
    expect(percentile([50, 15, 40, 20, 35], 40)).toBeCloseTo(29, 12);
  });

  it('returns the single observation for a one-element sample at any position', () => {
    expect(percentile([7], 0)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([7], 100)).toBe(7);
  });
});

describe('percentile — nearest-rank', () => {
  const sample = [15, 20, 35, 40, 50];

  it('returns x[ceil(n * p / 100) - 1], always an observed value', () => {
    // ceil(5 * 0.25) = 2 -> x[1]
    expect(percentile(sample, 25, 'nearest-rank')).toBe(20);
    // ceil(5 * 0.40) = 2 -> x[1]  (note: differs from linear, which interpolates to 29)
    expect(percentile(sample, 40, 'nearest-rank')).toBe(20);
    // ceil(5 * 0.50) = 3 -> x[2]
    expect(percentile(sample, 50, 'nearest-rank')).toBe(35);
    // ceil(5 * 0.95) = 5 -> x[4]
    expect(percentile(sample, 95, 'nearest-rank')).toBe(50);
  });

  it('clamps rank 0 to the first observation', () => {
    expect(percentile(sample, 0, 'nearest-rank')).toBe(15);
  });

  it('never invents a value between two observations', () => {
    for (let p = 0; p <= 100; p += 1) {
      expect(sample).toContain(percentile(sample, p, 'nearest-rank'));
    }
  });
});

describe('percentile — guards', () => {
  it('rejects an empty sample rather than returning zero', () => {
    expect(() => percentile([], 95)).toThrow(MetricsError);
  });

  it('rejects a position outside 0-100, including the 0.95-for-95 transposition', () => {
    expect(() => percentile([1, 2, 3], 101)).toThrow(MetricsError);
    expect(() => percentile([1, 2, 3], -1)).toThrow(MetricsError);
    expect(() => percentile([1, 2, 3], Number.NaN)).toThrow(/\[0, 100\]/);
  });

  it('rejects NaN observations, which would make the sort order undefined', () => {
    expect(() => sortedAscending([1, Number.NaN, 3])).toThrow(MetricsError);
  });

  it('computes several positions from one sort', () => {
    expect(percentiles([15, 20, 35, 40, 50], [25, 50, 75])).toEqual([20, 35, 40]);
  });
});

describe('mean, standard deviation and threshold counts', () => {
  it('averages, and reports NaN rather than 0 for an empty sample', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBeNaN();
  });

  it('uses the n-1 denominator', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9]: mean 5, sum of squared deviations 32, /7 = 4.571...
    expect(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it('reports NaN for fewer than two observations', () => {
    expect(sampleStdDev([5])).toBeNaN();
    expect(sampleStdDev([])).toBeNaN();
  });

  it('counts strictly above the threshold, so exactly-60 is not "over 60"', () => {
    const waits = [59, 60, 60.0001, 61];
    expect(countAbove(waits, 60)).toBe(2);
    expect(fractionAbove(waits, 60)).toBe(0.5);
  });

  it('reports NaN for the fraction of an empty sample', () => {
    expect(fractionAbove([], 60)).toBeNaN();
  });

  it('returns NaN throughout for an empty duration summary', () => {
    const empty = summarizeDurations([]);
    expect(empty.count).toBe(0);
    expect(empty.meanS).toBeNaN();
    expect(empty.p95S).toBeNaN();
    expect(empty.maxS).toBeNaN();
  });

  it('carries the percentile method it used', () => {
    expect(summarizeDurations([1, 2, 3], { percentileMethod: 'nearest-rank' }).percentileMethod).toBe(
      'nearest-rank',
    );
  });

  it('reports NaN for the median of an empty sample instead of throwing', () => {
    expect(median([])).toBeNaN();
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('histogram', () => {
  it('bins half-open, with the final bin closed at the top', () => {
    const result = histogram([0, 5, 10, 15, 20], { min: 0, max: 20, binCount: 2 });
    expect(result.bins.map((bin) => [bin.lowerBound, bin.upperBound])).toEqual([
      [0, 10],
      [10, 20],
    ]);
    // 10 belongs to the second bin ([10, 20]), 20 to the second as well (closed at the top).
    expect(result.bins.map((bin) => bin.count)).toEqual([2, 3]);
    expect(result.count).toBe(5);
  });

  it('counts observations outside the bins as underflow and overflow, never clamping them', () => {
    const result = histogram([-1, 0.5, 5, 21], { min: 0, max: 20, binCount: 2 });
    expect(result.underflow).toBe(1);
    expect(result.overflow).toBe(1);
    expect(result.count).toBe(2);
    // The mean still reflects every observation, including the ones outside the bins.
    expect(result.min).toBe(-1);
    expect(result.max).toBe(21);
  });

  it('reports fractions of the in-bin weight, summing to one', () => {
    const result = histogram([1, 2, 3, 11, 12], { min: 0, max: 20, binCount: 2 });
    expect(result.bins.map((bin) => bin.fraction)).toEqual([0.6, 0.4]);
  });

  it('gives a zero-spread sample one bin rather than a degenerate zero-width one', () => {
    const result = histogram([4, 4, 4]);
    expect(result.bins).toHaveLength(1);
    expect(result.count).toBe(3);
  });

  it('handles an empty sample without inventing bins', () => {
    const result = histogram([]);
    expect(result.bins).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.mean).toBeNaN();
  });

  it('accepts explicit edges and rejects non-increasing ones', () => {
    const result = histogram([0.05, 0.55, 1.15], { edges: [0, 0.5, 1, 1.5] });
    expect(result.bins.map((bin) => bin.count)).toEqual([1, 1, 1]);
    expect(() => histogram([1], { edges: [0, 0] })).toThrow(MetricsError);
    expect(() => histogram([1], { edges: [5] })).toThrow(MetricsError);
  });
});

describe('weightedHistogram', () => {
  it('weights by the supplied weight, not by sample count', () => {
    // One sample at 0.9 held for 100 s, one at 0.1 held for 1 s: 0.9 dominates.
    const result = weightedHistogram(
      [
        { value: 0.9, weight: 100 },
        { value: 0.1, weight: 1 },
      ],
      { edges: [0, 0.5, 1] },
    );
    expect(result.bins[0]?.weight).toBe(1);
    expect(result.bins[1]?.weight).toBe(100);
    expect(result.bins[1]?.fraction).toBeCloseTo(100 / 101, 12);
    expect(result.mean).toBeCloseTo((0.9 * 100 + 0.1) / 101, 12);
  });

  it('drops zero-weight samples but rejects malformed ones', () => {
    const result = weightedHistogram(
      [
        { value: 1, weight: 0 },
        { value: 2, weight: 3 },
      ],
      { edges: [0, 5] },
    );
    expect(result.count).toBe(1);
    expect(() => weightedHistogram([{ value: 1, weight: Number.NaN }])).toThrow(MetricsError);
    expect(() => weightedHistogram([{ value: 1, weight: -1 }])).toThrow(MetricsError);
    expect(() => weightedHistogram([{ value: Number.POSITIVE_INFINITY, weight: 1 }])).toThrow(
      MetricsError,
    );
  });
});

describe('linearTrend', () => {
  it('recovers a known line exactly', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 3 + 2 * i }));
    const trend = linearTrend(points);
    expect(trend.slope).toBeCloseTo(2, 12);
    expect(trend.intercept).toBeCloseTo(3, 12);
    expect(trend.rSquared).toBeCloseTo(1, 12);
    // A perfect fit has zero residual, so the slope is infinitely many standard errors from 0.
    expect(trend.standardError).toBe(0);
    expect(trend.tStatistic).toBe(Number.POSITIVE_INFINITY);
  });

  it('reports the residual scatter separately from the inference statistics', () => {
    // y = 2x plus a +-1 wobble chosen orthogonal to x, so the fit is exactly y = 2x and every
    // residual is exactly +-1: RSS = 8 over n - 2 = 6 degrees of freedom.
    //
    // residualStdDev is descriptive — how far the points sit from the line — where
    // standardError is inferential and is corrupted by autocorrelation. Saturation detection
    // uses the former as its noise yardstick for exactly that reason.
    const wobble = [1, -1, -1, 1, 1, -1, -1, 1];
    const points = wobble.map((offset, i) => ({ x: i, y: 2 * i + offset }));
    const trend = linearTrend(points);
    expect(trend.slope).toBeCloseTo(2, 12);
    expect(trend.residualStdDev).toBeCloseTo(Math.sqrt(8 / 6), 12);
    expect(trend.standardError).toBeCloseTo(trend.residualStdDev / Math.sqrt(42), 12);
    expect(linearTrend(Array.from({ length: 10 }, (_, i) => ({ x: i, y: 3 * i }))).residualStdDev)
      .toBeCloseTo(0, 12);
    expect(
      linearTrend([
        { x: 0, y: 0 },
        { x: 1, y: 100 },
      ]).residualStdDev,
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('reports a negative slope with a negative t-statistic', () => {
    const trend = linearTrend(Array.from({ length: 10 }, (_, i) => ({ x: i, y: 50 - i })));
    expect(trend.slope).toBeCloseTo(-1, 12);
    expect(trend.tStatistic).toBe(Number.NEGATIVE_INFINITY);
  });

  it('fits a flat series to a zero slope with no significance', () => {
    const trend = linearTrend(Array.from({ length: 10 }, (_, i) => ({ x: i, y: 7 })));
    expect(trend.slope).toBe(0);
    expect(trend.rSquared).toBe(0);
    expect(trend.tStatistic).toBe(0);
  });

  it('refuses to call a two-point fit significant: there are no residual degrees of freedom', () => {
    const trend = linearTrend([
      { x: 0, y: 0 },
      { x: 1, y: 100 },
    ]);
    expect(trend.slope).toBe(100);
    expect(trend.standardError).toBe(Number.POSITIVE_INFINITY);
    expect(trend.tStatistic).toBe(0);
  });

  it('handles degenerate inputs without throwing', () => {
    expect(linearTrend([]).n).toBe(0);
    const vertical = linearTrend([
      { x: 5, y: 1 },
      { x: 5, y: 2 },
      { x: 5, y: 3 },
    ]);
    expect(vertical.slope).toBe(0);
    expect(vertical.tStatistic).toBe(0);
  });

  it('rejects non-finite points, which would make the slope meaningless', () => {
    expect(() => linearTrend([{ x: 0, y: Number.NaN }])).toThrow(MetricsError);
  });

  it('agrees with percentileOfSorted on an already-sorted array', () => {
    expect(percentileOfSorted([1, 2, 3, 4], 95)).toBeCloseTo(3.85, 12);
  });
});
