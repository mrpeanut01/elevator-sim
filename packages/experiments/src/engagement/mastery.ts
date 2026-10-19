/**
 * **Proxy 3, the mastery slope: does getting better at a stage improve the outcome?**
 *
 * Pillar 4 asks for *visible progress … a clear win*. If attempt after attempt at a stage passes no
 * more often, there is no mastery loop, however good one run looks. So this fits `linearTrend` to an
 * ordered series of attempts' pass indicators (1 cleared, 0 did not) over attempt index, and reads
 * the slope's interval from its standard error: slope ± t(1 − α/2, n − 2) · SE, the OLS slope's own
 * degrees of freedom, through `reports/statistics.ts#studentTQuantile`. Rising means the interval
 * lies above zero, falling below it, flat when it contains zero. The OLS standard error assumes
 * independent residuals, which 0/1 indicators only approximate; the interval is the textbook one and
 * is labelled as such. A premise about people, uncalibrated, like the other two.
 *
 * ## The pass indicators are the game's, never this package's
 *
 * Every stage judge lives in the viewer (`campaign/judge.ts`, reached through
 * `campaign/stagePress.ts#pressStage`), and `experiments` may not import it. A second copy of that
 * decision here would be the repository's signature defect. So {@link masterySlopeOf} takes the
 * verdicts as data: each attempt's pass indicator as the game's judge returned it (`null` when the
 * verdict refused), and the seed set it was judged on. Until the playtest phase supplies persona
 * attempts there are none, and the baseline is "no attempts".
 *
 * ## The rules
 *
 * - Fewer than the bands file's `masterySlope.attempts`, no slope is published.
 * - Any refused verdict suppresses the slope, and the counts are still shown. A slope needs a value at
 *   every attempt, and reading a refusal as a fail (or skipping it) is § D158's selection on the
 *   outcome: the attempts whose verdicts refuse are not a random sample of the attempts.
 * - Every attempt must have been judged on the seed set the bands file names (`holdout`).
 * - Two series are compared by {@link pairedMasterySlope}: the slope of the per-attempt differences,
 *   which is the difference of the two slopes, with its own interval. Two slope intervals are never
 *   set side by side.
 *
 * ## Named gap: what the game judges on is not what the spec measures
 *
 * The spec asks for the same persona through the same scenario across **N fresh, disjoint holdout
 * seeds in order**, so that a rising slope means skill that generalises rather than a trace the
 * persona memorised. The game judges **every** attempt of a stage on the **same** fixed holdout batch:
 * `data/campaign.json`'s `holdoutSeeds` (on `stage-1-first-call`, `holdout-20260731`, fifty
 * replications of master seed 20260731). So a series of real attempts carries one seed set, repeated,
 * and a rising slope over it could be memorisation of that batch. This module does not resolve that by
 * inventing a seed scheme; it counts the distinct seed sets it was handed, reports
 * `seedSetsDisjoint: false` when any repeats, and leaves the scheme to the owner.
 *
 * Pure. The decisions bind nothing outside `engagement/` (§ D405); the proxies are § D1595.
 */

import { linearTrend } from '@elevator-sim/core';

import type { PlaySeedSet } from '../fuzz/stageSession.js';
import { DEFAULT_CONFIDENCE, studentTQuantile } from '../reports/statistics.js';
import type { MasterySlopeBands } from './bands.js';

/** One attempt at a stage, as the game judged it. */
export interface MasteryAttempt {
  /** The game's verdict: `true` cleared, `false` did not, `null` when the verdict refused. */
  readonly pass: boolean | null;
  /** The seed set the attempt was judged on: the stage's role for it, and the set's own name. */
  readonly seedSet: { readonly role: PlaySeedSet; readonly name: string };
}

export type MasteryVerdict = 'rising' | 'falling' | 'flat' | 'suppressed' | 'no-attempts';

export interface MasterySlope {
  readonly attempts: number;
  /** Attempts the bands file requires before a slope is published. */
  readonly required: number;
  readonly passes: number;
  readonly fails: number;
  readonly refused: number;
  /** Passes per attempt, over attempt index from 0. `NaN` unless a slope is published. */
  readonly slopePerAttempt: number;
  readonly standardError: number;
  readonly lower: number;
  readonly upper: number;
  readonly confidence: number;
  readonly verdict: MasteryVerdict;
  readonly suppressedBecause?: string | undefined;
  readonly distinctSeedSets: number;
  /** Whether every attempt was judged on a seed set of its own. The game's attempts never are. */
  readonly seedSetsDisjoint: boolean;
}

/** Why a series cannot carry a slope, or `undefined` when it can. Shared by the single and paired forms. */
function refusalOf(attempts: readonly MasteryAttempt[], bands: MasterySlopeBands): string | undefined {
  if (attempts.length < bands.attempts) {
    return `${String(attempts.length)} attempt(s), fewer than the ${String(bands.attempts)} the bands file requires`;
  }
  const refused = attempts.filter((attempt) => attempt.pass === null).length;
  if (refused > 0) return `${String(refused)} of ${String(attempts.length)} verdicts refused, and a slope needs every one (§ D158)`;
  const elsewhere = attempts.filter((attempt) => attempt.seedSet.role !== bands.seedSet).length;
  if (elsewhere > 0) {
    return `${String(elsewhere)} attempt(s) judged on a seed set other than the ${bands.seedSet} set the bands file names`;
  }
  return undefined;
}

interface SlopeInterval {
  readonly slope: number;
  readonly standardError: number;
  readonly lower: number;
  readonly upper: number;
}

function slopeInterval(values: readonly number[], confidence: number): SlopeInterval {
  const trend = linearTrend(values.map((y, x) => ({ x, y })));
  const halfWidth = studentTQuantile(1 - (1 - confidence) / 2, values.length - 2) * trend.standardError;
  return { slope: trend.slope, standardError: trend.standardError, lower: trend.slope - halfWidth, upper: trend.slope + halfWidth };
}

function verdictOf(interval: SlopeInterval): MasteryVerdict {
  if (interval.lower > 0) return 'rising';
  if (interval.upper < 0) return 'falling';
  return 'flat';
}

/** The slope of one series of attempts, or the reason there is none. */
export function masterySlopeOf(
  attempts: readonly MasteryAttempt[],
  bands: MasterySlopeBands,
  confidence: number = DEFAULT_CONFIDENCE,
): MasterySlope {
  const passes = attempts.filter((attempt) => attempt.pass === true).length;
  const fails = attempts.filter((attempt) => attempt.pass === false).length;
  const distinctSeedSets = new Set(attempts.map((attempt) => `${attempt.seedSet.role}/${attempt.seedSet.name}`)).size;
  const base = {
    attempts: attempts.length,
    required: bands.attempts,
    passes,
    fails,
    refused: attempts.length - passes - fails,
    confidence,
    distinctSeedSets,
    seedSetsDisjoint: attempts.length > 0 && distinctSeedSets === attempts.length,
  };
  const absent = { slopePerAttempt: Number.NaN, standardError: Number.NaN, lower: Number.NaN, upper: Number.NaN };
  if (attempts.length === 0) return Object.freeze({ ...base, ...absent, verdict: 'no-attempts' });
  const refusal = refusalOf(attempts, bands);
  if (refusal !== undefined) return Object.freeze({ ...base, ...absent, verdict: 'suppressed', suppressedBecause: refusal });
  const interval = slopeInterval(attempts.map((attempt) => (attempt.pass === true ? 1 : 0)), confidence);
  return Object.freeze({
    ...base,
    slopePerAttempt: interval.slope,
    standardError: interval.standardError,
    lower: interval.lower,
    upper: interval.upper,
    verdict: verdictOf(interval),
  });
}

export interface PairedMasterySlope {
  readonly pairs: number;
  /** The candidate's slope minus the baseline's, passes per attempt. `NaN` unless published. */
  readonly slopeDifference: number;
  readonly lower: number;
  readonly upper: number;
  /** `rising` means the candidate learns faster on the paired attempts. */
  readonly verdict: MasteryVerdict;
  readonly suppressedBecause?: string | undefined;
}

/**
 * Two series of attempts, paired attempt by attempt: the slope of `candidate[i] − baseline[i]`, which
 * is the difference of the two slopes, with the interval of that one fit.
 */
export function pairedMasterySlope(
  candidate: readonly MasteryAttempt[],
  baseline: readonly MasteryAttempt[],
  bands: MasterySlopeBands,
  confidence: number = DEFAULT_CONFIDENCE,
): PairedMasterySlope {
  const absent = { slopeDifference: Number.NaN, lower: Number.NaN, upper: Number.NaN };
  const pairs = Math.min(candidate.length, baseline.length);
  if (candidate.length === 0 && baseline.length === 0) return Object.freeze({ pairs, ...absent, verdict: 'no-attempts' });
  const refusal =
    candidate.length !== baseline.length
      ? `${String(candidate.length)} attempts against ${String(baseline.length)}; a paired slope needs one of each`
      : (refusalOf(candidate, bands) ?? refusalOf(baseline, bands));
  if (refusal !== undefined) return Object.freeze({ pairs, ...absent, verdict: 'suppressed', suppressedBecause: refusal });
  const indicator = (attempt: MasteryAttempt): number => (attempt.pass === true ? 1 : 0);
  const interval = slopeInterval(
    candidate.map((attempt, index) => indicator(attempt) - indicator(baseline[index] as MasteryAttempt)),
    confidence,
  );
  return Object.freeze({
    pairs,
    slopeDifference: interval.slope,
    lower: interval.lower,
    upper: interval.upper,
    verdict: verdictOf(interval),
  });
}
