/**
 * **Counts, paired comparisons and the wait figures every proxy prints beside itself.**
 *
 * Three small pieces the three proxies share, so that each rule is stated once:
 *
 * - {@link KOfN} and {@link formatKOfN}. A proxy stores `k` and `n` and nothing derived from them;
 *   the rate is read off at print time, always as `k of n` with its Wilson interval
 *   (`reports/statistics.ts#wilsonScoreInterval`). docs/03 Part 5 and the bands file's `contract`
 *   both say counts, never quotients.
 * - {@link pairedComparison}. The only way any proxy compares two arms: a paired-t interval on the
 *   per-replication (or per-attempt) differences, through `pairedDifferenceEstimate`, read with
 *   `intervalContainsZero`. Two separate intervals are never compared.
 * - {@link waitFiguresOf}. AWT and WT95 over an arm's replications, suppressed outright when any
 *   replication refuses its mean, because every proxy reports **beside** those two and never folds
 *   into them, on the footing § D106 gives energy.
 *
 * Pure. The decisions here bind nothing outside `engagement/` (§ D405).
 */

import type { SimulationResult } from '@elevator-sim/core';

import { RECOMMENDED_MIN_REPLICATIONS } from '../reports/compare.js';
import {
  DEFAULT_CONFIDENCE,
  estimateMean,
  pairedDifferenceEstimate,
  wilsonScoreInterval,
  type PublishedMeanEstimate,
} from '../reports/statistics.js';
import { intervalContainsZero } from '../reports/types.js';
import { metricOf } from '../runner/metrics.js';

/* -------------------------------------------------------------------------- *
 * k of n
 * -------------------------------------------------------------------------- */

/** A count and its denominator. The rate is derived at read time and is never a field. */
export interface KOfN {
  readonly k: number;
  readonly n: number;
}

/**
 * `k of n [lower, upper]`, the interval being Wilson's at `confidence`; `0 of 0` says there was
 * nothing to judge rather than printing an interval on nothing.
 */
export function formatKOfN(count: KOfN, confidence: number = DEFAULT_CONFIDENCE): string {
  if (count.n === 0) return '0 of 0 (nothing to judge)';
  const interval = wilsonScoreInterval(count.k, count.n, { confidence });
  return `${String(count.k)} of ${String(count.n)} [${interval.lower.toFixed(3)}, ${interval.upper.toFixed(3)}]`;
}

/* -------------------------------------------------------------------------- *
 * Two arms, paired
 * -------------------------------------------------------------------------- */

/**
 * What a paired comparison may say. `HIGHER` and `LOWER` are about the measured quantity
 * (candidate minus baseline), never about which arm is more fun: the proxies are premises about
 * people, and the direction that is good is the design director's to read.
 */
export type PairedVerdict = 'HIGHER' | 'LOWER' | 'INDISTINGUISHABLE' | 'SUPPRESSED';

export interface PairedComparison {
  readonly pairs: number;
  /** Candidate minus baseline. Absent exactly when the verdict is `SUPPRESSED`. */
  readonly estimate?: PublishedMeanEstimate | undefined;
  readonly verdict: PairedVerdict;
  /** Every pair differed by exactly nothing: the arms are the same on this quantity, at any budget. */
  readonly identical: boolean;
  readonly suppressedBecause?: string | undefined;
}

/**
 * The paired-t interval on `candidate[i] - baseline[i]`, read as a verdict.
 *
 * The values may be measurements (a mean time to destination) or 0/1 indicators (in band or not);
 * the interval is the same. Pairs are pairs because the caller built both series on the same
 * replication seeds, and the caller is the one that checks it (each proxy checks a seed or a crowd
 * digest before it gets here).
 *
 * @param minimumPairs below this many pairs no verdict is formed. CLAUDE.md's floor by default.
 */
export function pairedComparison(
  candidate: readonly number[],
  baseline: readonly number[],
  minimumPairs: number = RECOMMENDED_MIN_REPLICATIONS,
  confidence: number = DEFAULT_CONFIDENCE,
): PairedComparison {
  const pairs = Math.min(candidate.length, baseline.length);
  if (pairs < Math.max(2, minimumPairs)) {
    return Object.freeze({
      pairs,
      verdict: 'SUPPRESSED',
      identical: false,
      suppressedBecause: `${String(pairs)} pair(s), fewer than the ${String(Math.max(2, minimumPairs))} a verdict needs`,
    });
  }
  const estimate = pairedDifferenceEstimate(candidate, baseline, { confidence });
  const identical = candidate.every((value, index) => value === baseline[index]);
  const verdict: PairedVerdict = intervalContainsZero(estimate)
    ? 'INDISTINGUISHABLE'
    : estimate.lower > 0
      ? 'HIGHER'
      : estimate.upper < 0
        ? 'LOWER'
        : 'SUPPRESSED';
  return Object.freeze({
    pairs,
    estimate,
    verdict,
    identical,
    ...(verdict === 'SUPPRESSED' ? { suppressedBecause: 'no interval could be formed' } : {}),
  });
}

/* -------------------------------------------------------------------------- *
 * AWT and WT95, beside every proxy
 * -------------------------------------------------------------------------- */

export interface WaitFigures {
  readonly replications: number;
  /** Replications whose summary refused its mean, on any of `awtIsValid`'s five grounds. */
  readonly refused: number;
  /** The grounds those replications refused on, each once, in the order first met. */
  readonly refusedGrounds: readonly string[];
  /** Mean AWT over the replications, seconds. Absent when any replication refused. */
  readonly awt?: PublishedMeanEstimate | undefined;
  /** Mean WT95 over the replications, seconds. Absent when any replication refused. */
  readonly wt95?: PublishedMeanEstimate | undefined;
}

/**
 * AWT and WT95 over one arm's replications, or neither.
 *
 * One refused replication suppresses both, which is CLAUDE.md's rule for a saturating
 * configuration applied to every ground: a mean taken over the replications that happened to report
 * one is a mean over the easy days.
 */
export function waitFiguresOf(results: readonly SimulationResult[], confidence: number = DEFAULT_CONFIDENCE): WaitFigures {
  const refused = results.filter((result) => !result.summary.awtIsValid);
  const refusedGrounds = [...new Set(refused.map((result) => result.summary.awtInvalidGround ?? 'refused'))];
  if (refused.length > 0 || results.length === 0) {
    return Object.freeze({ replications: results.length, refused: refused.length, refusedGrounds });
  }
  return Object.freeze({
    replications: results.length,
    refused: 0,
    refusedGrounds,
    awt: estimateMean(results.map((result) => metricOf(result.summary, 'awtS')), { confidence }),
    wt95: estimateMean(results.map((result) => metricOf(result.summary, 'wt95S')), { confidence }),
  });
}
