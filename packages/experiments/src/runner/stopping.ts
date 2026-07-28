/**
 * The sequential stopping rule, as the runner uses it.
 *
 * docs/03-traffic-and-statistics.md § Part 3 states the rule as four lines:
 *
 * ```
 * after each replication n:
 *     halfWidth = t[n-1, conf] * (s / sqrt(n))     # n <= 25, t-distribution
 *     halfWidth = z[conf]      * (s / sqrt(n))     # n >  25, normal approximation
 *     if halfWidth < acceptableRange: stop and report mean
 * ```
 *
 * Two different responsibilities are packed into that. The first three lines are **statistics** —
 * a t/z quantile, a standard error, a half-width — and belong wherever this package keeps its
 * inference code (`stats/sequentialStopping`, or `reports/statistics`'s `estimateMean`). The last
 * line is a **policy decision by the runner**: it is what turns "here is the precision you have"
 * into "run more replications", and it is inseparable from the batching, the minimum replication
 * count and the reproducibility argument that live next door.
 *
 * **The shipped rule does not use the doc's crossover.** `validation/harness.ts`'s
 * `productionStoppingRule` injects `reports/statistics`'s `estimateMean`, which is Student-t at
 * `n - 1` at every `n`, so the half-width this rule compares against `acceptableRange` is the same
 * number the report will print. A `z` above n = 25 is 2–5 % narrower and would stop *earlier* than
 * the published interval justifies — the direction the last paragraph of {@link HalfWidthEstimate}
 * warns about. § Part 3's four-line rule therefore needs correcting to `t[n-1]` at every `n`; the
 * quantile chooser that implemented it is deleted (DECISIONS.md § D7). What survives here is the
 * *port*: this module still adapts any estimator, and `fixtures.test-helper.ts`'s `docHalfWidth`
 * double deliberately uses the doc's crossover family to prove that.
 *
 * So this module owns the comparison and injects the arithmetic. {@link halfWidthStoppingRule}
 * adapts any half-width estimator into a {@link StoppingRule}:
 *
 * ```ts
 * import { estimateMean } from '../reports/statistics.js';   // or stats/sequentialStopping
 *
 * const stoppingRule = halfWidthStoppingRule((samples, { confidence }) =>
 *   estimateMean(samples, { confidence }),
 * );
 * await runExperiment(spec, config, { stoppingRule });
 * ```
 *
 * {@link HalfWidthEstimate} is deliberately minimal — only `halfWidth` is required — so an
 * estimator written without knowing this file exists satisfies it. The runner records whatever
 * else the estimate carried, verbatim, and never recomputes it.
 */

import type { StoppingRule, StoppingVerdict } from './types.js';

/**
 * What an estimator has to tell the rule.
 *
 * Only {@link halfWidth} is required, and it is in the metric's own units: seconds for AWT,
 * persons per 5 minutes for handling capacity. A non-finite half-width — fewer than two samples,
 * a zero-variance sample the estimator declines to bound — means "not yet precise enough" and
 * never "precise enough", which is the safe direction: an experiment that runs too long wastes
 * CPU, and one that stops too early publishes a number it did not earn.
 */
export interface HalfWidthEstimate {
  readonly halfWidth: number;
  readonly n?: number | undefined;
  readonly mean?: number | undefined;
  readonly stdDev?: number | undefined;
  /**
   * Whatever the estimator calls its quantile family. `'t'` from the shipped estimator, at every
   * `n`; the `docHalfWidth` double says `'z'` past 25, which is how the runner's tests prove this
   * field is recorded verbatim rather than re-derived.
   */
  readonly distribution?: string | undefined;
}

/** Compute a confidence-interval half-width for a sample at a confidence level. */
export type HalfWidthEstimator = (
  samples: readonly number[],
  options: { readonly confidence: number },
) => HalfWidthEstimate;

export interface HalfWidthStoppingOptions {
  /**
   * Samples below which the rule never stops, whatever the estimate says. Two, because a
   * half-width needs a sample standard deviation.
   *
   * This is *not* the replication floor — that is `replication.minReplications`, which the runner
   * enforces before consulting a rule at all, and which the doc puts at 50.
   */
  readonly minSamples?: number | undefined;
}

/**
 * Turn a half-width estimator into the runner's stopping rule.
 *
 * Strictly `halfWidth < acceptableRange`, matching the doc. The verdict carries the achieved
 * half-width and the target alongside the decision, so a cell's replication count can be
 * explained afterwards from {@link StoppingSummary.evaluations} rather than re-derived.
 */
export function halfWidthStoppingRule(
  estimate: HalfWidthEstimator,
  options?: HalfWidthStoppingOptions | undefined,
): StoppingRule {
  const minSamples = Math.max(2, options?.minSamples ?? 2);
  return ({ samples, acceptableRange, confidence }): StoppingVerdict => {
    if (samples.length < minSamples) {
      return { stop: false, n: samples.length, targetHalfWidth: acceptableRange };
    }
    const result = estimate(samples, { confidence });
    return {
      stop: Number.isFinite(result.halfWidth) && result.halfWidth < acceptableRange,
      halfWidth: result.halfWidth,
      targetHalfWidth: acceptableRange,
      n: result.n ?? samples.length,
      ...(result.mean === undefined ? {} : { mean: result.mean }),
      ...(result.stdDev === undefined ? {} : { stdDev: result.stdDev }),
      ...(result.distribution === undefined ? {} : { distribution: result.distribution }),
    };
  };
}

/**
 * A fixed budget: never stop early.
 *
 * The rule the runner uses when none is injected, named so a report can say which rule produced a
 * replication count rather than leaving "no rule" implicit.
 */
export const fixedBudgetStoppingRule: StoppingRule = ({ samples }) => ({
  stop: false,
  n: samples.length,
});
