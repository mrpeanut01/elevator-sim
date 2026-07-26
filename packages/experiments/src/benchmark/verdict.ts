/**
 * What a paired interval is allowed to be called, and the arithmetic that decides.
 *
 * Five verdicts, and the reason there are five rather than three is that this project has already
 * measured two failure modes that a three-way BETTER / WORSE / SAME split would report as the same
 * thing:
 *
 * | verdict | means | evidence |
 * |---|---|---|
 * | `BETTER` | the arm beats the baseline | paired-t interval excludes zero, on the better side |
 * | `WORSE` | the arm loses to the baseline | paired-t interval excludes zero, on the worse side |
 * | `INDISTINGUISHABLE` | the difference is below the apparatus's resolution at this budget | interval contains zero, and at least one paired difference was non-zero |
 * | `IDENTICAL` | **no effect at all** — the two arms produced bit-identical runs | every one of `n` paired differences is exactly `0` |
 * | `UNQUOTABLE` | there is no interval to report | either cell's AWT was invalidated by saturation, censoring or an empty window |
 *
 * ## `IDENTICAL` is not a stronger `INDISTINGUISHABLE`, it is a different finding
 *
 * Phase 3 measured this and docs/05-roadmap.md § Phase 7 records it: dispatch is an `argmin` over a
 * handful of cars and the simulator is deterministic, so a change too small to flip a decision
 * produces a **bit-identical run** — 100/100 exactly-zero paired differences, `rho = 1`. That is not
 * a small effect buried in noise. It is *no effect*, and the correct report is that the mechanism
 * did not engage, not that the study lacked power. Collapsing the two would let an inert cost term
 * be written up as "a promising direction that needs more replications", which is the specific
 * mistake this project exists not to make.
 *
 * The distinction is load-bearing in this phase's results: three of the eight arms come back
 * `IDENTICAL` to `eta` at these operating points, and no amount of `n` would change that.
 *
 * ## What is deliberately *not* here
 *
 * A "practically significant" threshold. An interval that excludes zero excludes zero; whether 0.9 s
 * is worth an operator's money is not a statistical question and this module refuses to answer it by
 * hiding a constant in a verdict. {@link CellComparison.requiredReplications} and
 * {@link CellComparison.relativeEffect} give a reader everything needed to make that call, in the
 * open.
 */

import type { MeanEstimate } from '../reports/types.js';
import type { ReplicationMetric } from '../runner/metrics.js';
import { comparePaired, intervalExcludesZero, type PairedComparison } from '../validation/harness.js';

/** The five things a cell of the table may say. */
export const CELL_VERDICTS = [
  'BETTER',
  'WORSE',
  'INDISTINGUISHABLE',
  'IDENTICAL',
  'UNQUOTABLE',
] as const;

export type CellVerdict = (typeof CELL_VERDICTS)[number];

/** One (arm, metric) cell: the paired comparison, the verdict, and the arithmetic behind both. */
export interface CellComparison {
  readonly metric: ReplicationMetric;
  readonly armId: string;
  readonly baselineId: string;
  readonly verdict: CellVerdict;
  readonly comparison: PairedComparison;
  /** `candidate - baseline`, paired-t at 95 %. Negative is better for every metric here. */
  readonly estimate: MeanEstimate;
  /** Standard deviation of the paired differences. What the required-`n` arithmetic runs on. */
  readonly sdOfDifference: number;
  /** `mean / baselineMean`, as a fraction. `NaN` when the baseline mean is zero. */
  readonly relativeEffect: number;
  /**
   * Replications the **observed** point estimate would need to become significant at this
   * confidence, from the observed `s_D`: `n >= (z · s_D / |d|)²`.
   *
   * Computed from the measured spread rather than guessed, per the phase's own instruction. `1` when
   * the interval already excludes zero; `undefined` when the point estimate is exactly zero (no `n`
   * resolves a difference that is not there) or the spread is not finite.
   */
  readonly requiredReplications: number | undefined;
  /** Whether {@link requiredReplications} fits under the budget the baseline's saturation allows. */
  readonly resolvableWithinCeiling: boolean | undefined;
}

/** The 97.5th percentile of the standard normal. The required-`n` arithmetic's `z`. */
const Z_95 = 1.959_963_984_540_054;

/**
 * `n` such that the observed effect would clear zero at 95 %, given the observed spread.
 *
 * A normal rather than a `t` quantile, deliberately: the answer is a planning figure for `n` in the
 * hundreds, where the two agree to under a percent, and using `t` would need the answer to know its
 * own degrees of freedom.
 */
export function replicationsToResolve(effect: number, sdOfDifference: number): number | undefined {
  if (!Number.isFinite(effect) || !Number.isFinite(sdOfDifference)) return undefined;
  if (effect === 0) return undefined;
  if (sdOfDifference === 0) return 1;
  return Math.max(1, Math.ceil(((Z_95 * sdOfDifference) / Math.abs(effect)) ** 2));
}

/**
 * Turn a paired comparison into a verdict.
 *
 * `quotable` is the caller's: this module cannot see a `CellAggregate`, and whether a mean may be
 * quoted at all is a property of the cells rather than of their difference. Passing `false` short-
 * circuits everything below it, because an interval computed from an invalidated AWT is not a
 * weaker result, it is not a result.
 */
export function classify(comparison: PairedComparison, quotable: boolean): CellVerdict {
  if (!quotable) return 'UNQUOTABLE';
  if (comparison.n > 0 && comparison.exactZeroCount === comparison.n) return 'IDENTICAL';
  if (!intervalExcludesZero(comparison.estimate)) return 'INDISTINGUISHABLE';
  return comparison.estimate.mean < 0 ? 'BETTER' : 'WORSE';
}

export interface CellComparisonInput {
  readonly metric: ReplicationMetric;
  readonly armId: string;
  readonly baselineId: string;
  readonly candidate: readonly number[];
  readonly baseline: readonly number[];
  /** `false` when either cell's AWT was invalidated. Produces `UNQUOTABLE`. */
  readonly quotable: boolean;
  /** The budget ceiling the baseline's saturation imposes, if any. */
  readonly admissibleReplications?: number | undefined;
  readonly confidence?: number | undefined;
}

/** Compare one arm against the baseline on one metric, and say what it means. */
export function compareCell(input: CellComparisonInput): CellComparison {
  const comparison = comparePaired(
    input.metric,
    input.candidate,
    input.baseline,
    input.confidence ?? 0.95,
  );
  const sd = Math.sqrt(comparison.varianceOfDifference);
  const required = intervalExcludesZero(comparison.estimate)
    ? 1
    : replicationsToResolve(comparison.estimate.mean, sd);
  const ceiling = input.admissibleReplications;
  return Object.freeze({
    metric: input.metric,
    armId: input.armId,
    baselineId: input.baselineId,
    verdict: classify(comparison, input.quotable),
    comparison,
    estimate: comparison.estimate,
    sdOfDifference: sd,
    relativeEffect:
      comparison.baselineMean === 0
        ? Number.NaN
        : comparison.estimate.mean / comparison.baselineMean,
    requiredReplications: required,
    resolvableWithinCeiling:
      required === undefined ? undefined : ceiling === undefined ? true : required <= ceiling,
  });
}
