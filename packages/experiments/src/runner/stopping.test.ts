import { describe, expect, it } from 'vitest';

import { docHalfWidth, docStoppingRule } from './fixtures.test-helper.js';
import { fixedBudgetStoppingRule, halfWidthStoppingRule } from './stopping.js';
import type { HalfWidthEstimator } from './stopping.js';
import type { StoppingRuleInput, StoppingVerdict } from './types.js';

const input = (samples: readonly number[], acceptableRange = 2): StoppingRuleInput => ({
  samples,
  acceptableRange,
  confidence: 0.9,
  metric: 'awtS',
  replications: samples.length,
});

const verdict = (answer: StoppingVerdict | boolean): StoppingVerdict =>
  typeof answer === 'boolean' ? { stop: answer } : answer;

describe('halfWidthStoppingRule', () => {
  it('implements the doc’s comparison: stop when halfWidth < acceptableRange, strictly', () => {
    const constant: HalfWidthEstimator = () => ({ halfWidth: 2 });
    const rule = halfWidthStoppingRule(constant);
    // Exactly at the target is *not* below it. The doc writes `<`, and the conservative reading is
    // the one that never reports precision it did not reach.
    expect(verdict(rule(input([1, 2, 3], 2))).stop).toBe(false);
    expect(verdict(rule(input([1, 2, 3], 2.000_001))).stop).toBe(true);
  });

  it('never stops on a non-finite half-width', () => {
    const rule = halfWidthStoppingRule(() => ({ halfWidth: Number.NaN }));
    expect(verdict(rule(input([1, 2, 3], 1e9))).stop).toBe(false);
    const infinite = halfWidthStoppingRule(() => ({ halfWidth: Number.POSITIVE_INFINITY }));
    expect(verdict(infinite(input([1, 2, 3], 1e9))).stop).toBe(false);
  });

  it('never stops below two samples, and does not call the estimator there', () => {
    let calls = 0;
    const rule = halfWidthStoppingRule(() => {
      calls += 1;
      return { halfWidth: 0 };
    });
    expect(verdict(rule(input([]))).stop).toBe(false);
    expect(verdict(rule(input([5]))).stop).toBe(false);
    expect(calls).toBe(0);
    expect(verdict(rule(input([5, 6]))).stop).toBe(true);
    expect(calls).toBe(1);
  });

  it('records the estimate verbatim rather than recomputing it', () => {
    const rule = halfWidthStoppingRule(() => ({
      halfWidth: 1.25,
      n: 99,
      mean: 5.5,
      stdDev: 1.5,
      distribution: 'z',
    }));
    expect(verdict(rule(input([1, 2, 3], 2)))).toEqual({
      stop: true,
      halfWidth: 1.25,
      targetHalfWidth: 2,
      n: 99,
      mean: 5.5,
      stdDev: 1.5,
      distribution: 'z',
    });
  });

  it('passes the confidence level through to the estimator', () => {
    const seen: number[] = [];
    const rule = halfWidthStoppingRule((_, { confidence }) => {
      seen.push(confidence);
      return { halfWidth: 0 };
    });
    rule({ ...input([1, 2]), confidence: 0.95 });
    expect(seen).toEqual([0.95]);
  });
});

describe('fixedBudgetStoppingRule', () => {
  it('never stops', () => {
    expect(verdict(fixedBudgetStoppingRule(input(Array.from({ length: 500 }, () => 5)))).stop).toBe(false);
  });
});

/**
 * The test double is checked against the doc's own worked arithmetic, because the runner's stopping
 * tests are only as meaningful as the estimator behind them.
 */
describe('docHalfWidth (the stand-in for stats/sequentialStopping)', () => {
  it('uses the t-distribution to n = 25 and the normal approximation past it', () => {
    const small = docHalfWidth([1, 2, 3, 4], { confidence: 0.9 });
    expect(small.distribution).toBe('t');
    // s = 1.29099..., t[0.95, 3] = 2.353, halfWidth = 2.353 * s / 2.
    expect(small.stdDev).toBeCloseTo(1.290_994, 6);
    expect(small.halfWidth).toBeCloseTo((2.353 * small.stdDev!) / 2, 9);

    const large = docHalfWidth(Array.from({ length: 26 }, (_, i) => i), { confidence: 0.9 });
    expect(large.distribution).toBe('z');
    expect(large.halfWidth).toBeCloseTo((1.65 * large.stdDev!) / Math.sqrt(26), 9);
  });

  it('reports an infinite half-width below two samples', () => {
    expect(docHalfWidth([7], { confidence: 0.9 }).halfWidth).toBe(Number.POSITIVE_INFINITY);
  });

  it('shrinks as 1/sqrt(n), which is why the budget is 50–200 and not 10', () => {
    const pattern = [4, 6, 5, 7, 3, 6, 5, 4];
    const eight = docHalfWidth(pattern, { confidence: 0.9 }).halfWidth;
    const thirtyTwo = docHalfWidth([...pattern, ...pattern, ...pattern, ...pattern], { confidence: 0.9 }).halfWidth;
    expect(thirtyTwo).toBeLessThan(eight / 1.7);
  });

  it('is only a double, and says so by refusing a confidence level it did not implement', () => {
    expect(() => docHalfWidth([1, 2, 3], { confidence: 0.95 })).toThrow(/test double/);
  });

  it('is wired through the port the production rule uses', () => {
    expect(verdict(docStoppingRule(input([10, 12, 11, 13], 100))).stop).toBe(true);
    expect(verdict(docStoppingRule(input([10, 12, 11, 13], 0.01))).stop).toBe(false);
  });
});
