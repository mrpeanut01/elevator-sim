import { describe, expect, it } from 'vitest';

import { estimateMean } from '../reports/statistics.js';
import { productionStoppingRule } from '../validation/harness.js';

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
 * **The composed rule, and the one assertion that says which estimator it is.**
 *
 * `validation/harness.ts`'s `productionStoppingRule` is the repository's only composed stopping
 * rule. **Nothing outside a test injects it, or any rule** — every shipped study fixes its budget,
 * deliberately (DECISIONS.md § D125). What it injects is `reports/statistics`'s `estimateMean` —
 * Student-t at `n - 1`, at every `n`. docs/03-traffic-and-statistics.md § Part 3 writes the rule with a
 * `t` (n ≤ 25) / `z` (n > 25) crossover instead; the quantile chooser that implemented that had no
 * non-test caller once review finding #14 took it off the published path, and is deleted rather
 * than kept exported behind a caller list nothing satisfies (DECISIONS.md § D7).
 *
 * The half-width the loop compares against `acceptableRange` is therefore the *same number* the
 * report prints for that cell — which is the property worth pinning, because `ConvergenceReport`
 * decides `converged` from the published half-width. A cheaper quantile here would stop at a
 * precision the page then declines to call converged, in the direction {@link HalfWidthEstimate}'s
 * docstring names: "one that stops too early publishes a number it did not earn".
 */
describe('productionStoppingRule — the estimator loop control would use if injected', () => {
  it('measures the same half-width the published interval will print, on both sides of n = 25', () => {
    for (const n of [10, 25, 26, 200]) {
      const samples = Array.from({ length: n }, (_, index) => index * 1.3);
      const published = estimateMean(samples, { confidence: 0.9 });
      const stopped = verdict(
        productionStoppingRule({
          samples,
          acceptableRange: Number.POSITIVE_INFINITY,
          confidence: 0.9,
          metric: 'awtS',
          replications: n,
        }),
      );
      expect(published.method, `n = ${n}`).toBe('t');
      expect(stopped.halfWidth, `n = ${n}`).toBeCloseTo(published.halfWidth, 12);
    }
  });

  it('is strictly more conservative than the doc’s crossover past n = 25, never less', () => {
    // The direction matters and is the whole reason this is the estimator that ships: a wider
    // half-width stops later. At 90 % and n = 26 the doc's z = 1.65 against t(25) = 1.7081.
    const samples = Array.from({ length: 26 }, (_, index) => index * 1.3);
    const input_ = {
      samples,
      acceptableRange: Number.POSITIVE_INFINITY,
      confidence: 0.9,
      metric: 'awtS' as const,
      replications: 26,
    };
    const shipped = verdict(productionStoppingRule(input_)).halfWidth as number;
    const doc = docHalfWidth(samples, { confidence: 0.9 }).halfWidth;
    expect(shipped).toBeGreaterThan(doc);
  });
});

/**
 * The test double is checked against the doc's own worked arithmetic, because the runner's stopping
 * tests are only as meaningful as the estimator behind them.
 *
 * It implements docs/03 § Part 3's crossover, which the **shipped** rule deliberately does not —
 * see the block above. That divergence is useful rather than accidental: it is what proves the
 * port records whatever family the estimator reports instead of re-deriving one.
 */
describe('docHalfWidth (an estimator that is deliberately not the shipped one)', () => {
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
