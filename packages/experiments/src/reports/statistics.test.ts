/**
 * The interval arithmetic, checked against published values.
 *
 * These are the numbers everything else in the module rests on: if the t quantile is wrong then
 * every "indistinguishable" verdict and every convergence decision is wrong in the same direction
 * and nothing downstream can notice. So they are pinned against the tables in
 * docs/03-traffic-and-statistics.md and against standard published quantiles rather than against
 * this implementation's own output.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFIDENCE,
  T_DISTRIBUTION_MAX_N,
  estimateMean,
  halfWidthQuantile,
  meanOf,
  normalQuantile,
  pairedDifferenceEstimate,
  sampleStdDevOf,
  studentTCdf,
  studentTQuantile,
} from './statistics.js';
import { ReportsError, intervalContainsZero } from './types.js';

describe('normalQuantile', () => {
  it('reproduces the z table in docs/03-traffic-and-statistics.md', () => {
    // | Confidence | 70% | 80% | 90% | 95% | 99% |
    // | z          | 1.04| 1.28| 1.65| 1.96| 2.58|
    //
    // Tolerance 0.006 rather than half a unit in the last printed place, because the doc's 90%
    // entry rounds 1.64485 *up* to 1.65. The doc is the reference for which quantile to use, not
    // for its fifth digit.
    const twoSided = (confidence: number): number => normalQuantile(1 - (1 - confidence) / 2);
    const table: readonly [number, number][] = [
      [0.7, 1.04],
      [0.8, 1.28],
      [0.9, 1.65],
      [0.95, 1.96],
      [0.99, 2.58],
    ];
    for (const [confidence, published] of table) {
      expect(Math.abs(twoSided(confidence) - published)).toBeLessThan(0.006);
    }
  });

  it('matches published quantiles to ten decimal places', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 10);
    expect(normalQuantile(0.95)).toBeCloseTo(1.6448536269514722, 10);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 12);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959963984540054, 10);
  });

  it('refuses a probability outside (0, 1)', () => {
    expect(() => normalQuantile(0)).toThrow(ReportsError);
    expect(() => normalQuantile(1)).toThrow(ReportsError);
  });
});

describe('studentTQuantile', () => {
  it('matches published two-sided 95% critical values', () => {
    // Standard t table, α = 0.05 two-sided.
    expect(studentTQuantile(0.975, 1)).toBeCloseTo(12.7062047, 6);
    expect(studentTQuantile(0.975, 2)).toBeCloseTo(4.30265273, 6);
    expect(studentTQuantile(0.975, 9)).toBeCloseTo(2.26215716, 6);
    expect(studentTQuantile(0.975, 11)).toBeCloseTo(2.20098516, 6);
    expect(studentTQuantile(0.975, 24)).toBeCloseTo(2.06389856, 6);
    expect(studentTQuantile(0.975, 199)).toBeCloseTo(1.9719565, 6);
  });

  it('matches published two-sided 90% critical values', () => {
    expect(studentTQuantile(0.95, 9)).toBeCloseTo(1.83311293, 6);
    expect(studentTQuantile(0.95, 24)).toBeCloseTo(1.71088208, 6);
  });

  it('is symmetric about zero and converges on the normal quantile', () => {
    expect(studentTQuantile(0.025, 9)).toBeCloseTo(-studentTQuantile(0.975, 9), 9);
    expect(studentTQuantile(0.5, 4)).toBe(0);
    expect(studentTQuantile(0.975, 1e6)).toBeCloseTo(normalQuantile(0.975), 4);
  });

  it('has a CDF that is a distribution', () => {
    expect(studentTCdf(0, 5)).toBeCloseTo(0.5, 12);
    expect(studentTCdf(-2.5, 7)).toBeCloseTo(1 - studentTCdf(2.5, 7), 12);
    expect(studentTCdf(2.26215716, 9)).toBeCloseTo(0.975, 7);
  });

  it('refuses a non-positive degrees of freedom', () => {
    expect(() => studentTQuantile(0.975, 0)).toThrow(ReportsError);
  });
});

describe('halfWidthQuantile', () => {
  it('uses the t-distribution up to n = 25 and the normal approximation above it', () => {
    // docs/03-traffic-and-statistics.md § "Sequential stopping rule" prescribes exactly this
    // split; it is not a house preference.
    const atCrossover = halfWidthQuantile(T_DISTRIBUTION_MAX_N, 0.95);
    const pastCrossover = halfWidthQuantile(T_DISTRIBUTION_MAX_N + 1, 0.95);
    expect(atCrossover.method).toBe('t');
    expect(atCrossover.quantile).toBeCloseTo(2.06389856, 6);
    expect(pastCrossover.method).toBe('z');
    expect(pastCrossover.quantile).toBeCloseTo(1.959963984540054, 9);
  });

  it('refuses a confidence given as a percentage', () => {
    expect(() => halfWidthQuantile(10, 95)).toThrow(/strictly inside \(0, 1\)/);
  });
});

describe('estimateMean', () => {
  it('reports the mean, the spread across runs and the interval', () => {
    // Peters & Abbi's reported individual-run AWT range, as four replications.
    const estimate = estimateMean([4.1, 5.0, 5.6, 7.4]);
    expect(estimate.n).toBe(4);
    expect(estimate.mean).toBeCloseTo(5.525, 9);
    expect(estimate.stdDev).toBeCloseTo(1.3937356, 6);
    expect(estimate.standardError).toBeCloseTo(estimate.stdDev / 2, 12);
    expect(estimate.method).toBe('t');
    expect(estimate.degreesOfFreedom).toBe(3);
    expect(estimate.halfWidth).toBeCloseTo(3.18244631 * estimate.standardError, 6);
    expect(estimate.lower).toBeCloseTo(estimate.mean - estimate.halfWidth, 12);
    expect(estimate.upper).toBeCloseTo(estimate.mean + estimate.halfWidth, 12);
    expect(estimate.min).toBe(4.1);
    expect(estimate.max).toBe(7.4);
    expect(estimate.confidence).toBe(DEFAULT_CONFIDENCE);
  });

  it('gives one replication a mean but no interval, rather than a zero-width one', () => {
    // A zero-width interval would read as "perfectly reproducible", which is the opposite of
    // what one run of a lift peak tells you.
    const estimate = estimateMean([5]);
    expect(estimate.mean).toBe(5);
    expect(estimate.stdDev).toBeNaN();
    expect(estimate.halfWidth).toBeNaN();
    expect(estimate.lower).toBeNaN();
    expect(estimate.upper).toBeNaN();
  });

  it('reports a zero-width interval when every replication agrees exactly', () => {
    const estimate = estimateMean([7, 7, 7, 7]);
    expect(estimate.stdDev).toBe(0);
    expect(estimate.halfWidth).toBe(0);
    expect(estimate.lower).toBe(7);
    expect(estimate.upper).toBe(7);
  });

  it('refuses an empty sample or a non-finite value rather than propagating NaN', () => {
    expect(() => estimateMean([])).toThrow(/at least one replication/);
    expect(() => estimateMean([1, Number.NaN])).toThrow(/replication 1 contributed NaN/);
    expect(() => estimateMean([Number.POSITIVE_INFINITY])).toThrow(ReportsError);
  });

  it('has moment helpers that report NaN rather than 0 for an absent measurement', () => {
    expect(meanOf([])).toBeNaN();
    expect(sampleStdDevOf([3])).toBeNaN();
    expect(sampleStdDevOf([2, 4])).toBeCloseTo(Math.SQRT2, 12);
  });
});

describe('pairedDifferenceEstimate', () => {
  it('collapses to a zero-width interval containing zero when a candidate is compared to itself', () => {
    // The Phase 3 acceptance criterion in its purest form: identical runs differ by exactly
    // nothing, and the interval must say so rather than reporting a tie.
    const values = [4.1, 5.0, 5.6, 7.4, 6.2];
    const estimate = pairedDifferenceEstimate(values, values);
    expect(estimate.mean).toBe(0);
    expect(estimate.halfWidth).toBe(0);
    expect(intervalContainsZero(estimate)).toBe(true);
  });

  it('excludes zero when every pair moves the same way', () => {
    const baseline = [10, 11, 12, 13, 14, 15];
    const candidate = baseline.map((value) => value - 2);
    const estimate = pairedDifferenceEstimate(candidate, baseline);
    expect(estimate.mean).toBeCloseTo(-2, 12);
    expect(estimate.upper).toBeLessThan(0);
    expect(intervalContainsZero(estimate)).toBe(false);
  });

  it('contains zero when the differences are large but inconsistent', () => {
    // The documented failure mode: a difference that looks decisive run by run and is not.
    const baseline = [10, 10, 10, 10, 10, 10];
    const candidate = [4, 16, 5, 15, 6, 14];
    const estimate = pairedDifferenceEstimate(candidate, baseline);
    expect(Math.abs(estimate.mean)).toBeLessThan(1);
    expect(estimate.halfWidth).toBeGreaterThan(4);
    expect(intervalContainsZero(estimate)).toBe(true);
  });

  it('demonstrates the variance reduction common random numbers exist for', () => {
    // Same two candidates, once paired on shared traces and once against traces that happen to
    // be ordered differently. The paired differences are constant; the mismatched ones are not,
    // and the interval on the difference is correspondingly wider — which is the whole of
    // docs/03-traffic-and-statistics.md § Part 4 in four lines.
    const baseline = [4.1, 5.0, 5.6, 7.4, 6.2, 4.8];
    const paired = baseline.map((value) => value - 0.5);
    const shuffled = [...paired].reverse();
    const withCrn = pairedDifferenceEstimate(paired, baseline);
    const withoutCrn = pairedDifferenceEstimate(shuffled, baseline);
    expect(withCrn.mean).toBeCloseTo(withoutCrn.mean, 9);
    expect(withCrn.halfWidth).toBe(0);
    expect(withoutCrn.halfWidth).toBeGreaterThan(1);
    expect(intervalContainsZero(withoutCrn)).toBe(true);
  });

  it('refuses series of different lengths', () => {
    expect(() => pairedDifferenceEstimate([1, 2], [1])).toThrow(/one pair per replication/);
  });
});

describe('intervalContainsZero', () => {
  it('is false for an interval that does not exist', () => {
    // n = 1: unknown, not "no difference". Treating an absent interval as containing zero would
    // report every single-replication comparison as indistinguishable.
    expect(intervalContainsZero(estimateMean([3]))).toBe(false);
  });
});
