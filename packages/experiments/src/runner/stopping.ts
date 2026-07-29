/**
 * The sequential stopping rule, as the runner uses it.
 *
 * docs/03-traffic-and-statistics.md § Part 3 states the rule as three lines:
 *
 * ```
 * after each replication n:
 *     halfWidth = t[n-1, conf] * (s / sqrt(n))     # every n — no crossover
 *     if halfWidth < acceptableRange: stop and report mean
 * ```
 *
 * It was four lines until 2026-07-27, with a `t` (n ≤ 25) / `z` (n > 25) crossover on the second
 * and third. That family is deleted from the code (DECISIONS.md § D14) *and* from the doc, and
 * this block quoted the superseded version for long enough to be worth saying so out loud.
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
 * warns about. The quantile chooser that implemented the crossover is deleted (DECISIONS.md § D7),
 * and § Part 3 was corrected to match, so the doc and the code now agree. What survives here is the
 * *port*: this module still adapts any estimator, and `fixtures.test-helper.ts`'s `docHalfWidth`
 * double deliberately uses the **superseded** crossover family to prove that.
 *
 * **What that costs, measured.** `t[n-1] > z` at every `n`, so the shipped rule can only ever run
 * *more* replications than a normal-approximation one — open item `C4` asked how many more, and
 * `stoppingBudget.test.ts` is the answer. At the policy that ships (floor 50, checked every 8,
 * capped at 200) the arithmetic bounds the inflation at **3.9 %** and the realized cost on
 * `midtown-office`/`eta`/up-peak across six target precisions was **zero replications** — the
 * 50-replication floor and the 8-replication chunk quantize the whole of it away. With the floor
 * lowered to 2 it was **+7 replications in 393 (+1.8 %)**.
 *
 * What those replications buy is not marginal. `t[1]/z = 3.84`, and below the floor a `z` rule
 * stopped on intervals that contained the long-run mean **56 %** of the time against a nominal 90 %,
 * where the shipped rule managed 76 % — it saved 3.1 replications a cell and gave up 20 points of
 * coverage. Both families under-cover, because a sequentially-stopped interval always does; the gap
 * between them is the point. Do not trade it away for replications. See `stoppingBudget.test.ts`
 * and DECISIONS.md's `C4` entry.
 *
 * One thing that measurement rules out: the overhead is **not** bounded by one `checkEvery` chunk,
 * so do not write a bound of that shape. A sample half-width is not monotone in `n`, so a cell where
 * `z` stopped and `t` did not can run far past the crossing before the next one — **+187** at the
 * widest cell of C4's seven-configuration sweep (`secure-tower`/`destination-eta`, floor lowered to
 * 2). The 3.9 % is a bound on the *budget*, not on any one cell.
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
 * persons per 5 minutes for handling capacity. A non-finite half-width — **fewer than two
 * samples** — means "not yet precise enough" and never "precise enough", which is the safe
 * direction: an experiment that runs too long wastes CPU, and one that stops too early publishes a
 * number it did not earn.
 *
 * ## A zero-variance sample is *not* one of those, and this docstring used to say it was
 *
 * It listed "a zero-variance sample the estimator declines to bound" beside the `n < 2` case. The
 * shipped estimator declines nothing: `estimateMean` returns `halfWidth = t[n-1] · 0 / √n` = **0**,
 * which is finite, correct, and below every positive target — so {@link halfWidthStoppingRule}
 * stops at the **first** evaluation point, whatever `acceptableRange` was asked for. Open item
 * `C4`'s third finding was that disagreement; the docstring is what was wrong, not the code, for
 * two reasons:
 *
 * 1. **Zero is the true half-width of an interval around a constant sample.** An estimator that
 *    returned `NaN` there would be refusing to report a number it has.
 * 2. **Phase 3's first acceptance criterion depends on it.** `pairedDifferenceEstimate(v, v)` must
 *    produce an interval of exactly `[0, 0]` containing zero — a candidate compared against itself
 *    is *indistinguishable*, not unmeasurable. `estimateMean` is what produces that, and
 *    "declining to bound" a zero-variance sample would replace a passing criterion with a `NaN`.
 *    Weakening an acceptance criterion so a comment becomes true is the move CLAUDE.md § Working
 *    agreements forbids by name.
 *
 * **What is genuinely uncomfortable is left standing and stated rather than fixed.** docs/07 § 4:
 * *"a bit-identical result is a wiring bug until proven otherwise"*. A rule that stops the instant
 * every replication agrees is declaring convergence on exactly the evidence that most often means
 * the replications were never independent. It is **unreachable in anything this repository ships**
 * — no study injects a stopping rule at all (DECISIONS.md § D125), and where one is injected the
 * runner's first evaluation is at `policy.minReplications` (50 by default,
 * `replicationRunner.ts`'s first chunk), so the stop lands at the floor rather than at `n = 2`
 * unless a caller lowers the floor as `validation/sequentialStopping.test.ts` does. Pinned by
 * `stopping.test.ts` § "a zero-variance sample", so a change of mind is a visible one.
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
 * **The runner does not call this.** It is the named counterpart of the runner's own `undefined`
 * branch, not that branch's implementation: `replicationRunner.ts`'s `decide()` handles
 * `rule === undefined` inline and sets `reason: 'fixed-budget'` itself. This symbol exists so a
 * caller that wants the shipped default *as a value* — a test asserting the branch, a study
 * selecting a rule from a table — can name it rather than pass `undefined`. Its docstring used to
 * claim the runner used it, which was the shape of defect this repository names most often: a
 * symbol asserting a shipped role it does not have. See DECISIONS.md § D125.
 */
export const fixedBudgetStoppingRule: StoppingRule = ({ samples }) => ({
  stop: false,
  n: samples.length,
});
