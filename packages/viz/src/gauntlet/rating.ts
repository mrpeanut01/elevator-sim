/**
 * **The rating** — a mean over the forty proof cases, with what it is a mean of stated beside it.
 *
 * ## What a rating is, in one sentence, and why that sentence is a field rather than a comment
 *
 * § 12.3: *"A rating is the **mean of all forty**. The cases never move, so two ratings a month
 * apart remain comparable; a dispatcher that wins one shape and loses four sits mid-table."* It
 * says the arithmetic and not the quantity, so the quantity is chosen here and {@link RATING_BASIS}
 * is the choice, published in the same object as the number. A rating printed without its basis is
 * `estimate-without-n` with a different missing half.
 *
 * ## Which figure, and why it is an observation
 *
 * The share of served rides that waited **no more than the long-wait threshold** — `100 −
 * pctOverLongWait`, over the whole run. Three reasons it is that and not the average wait:
 *
 * 1. It is the contract's own headline. § 5's `away / boardedCount`, *"away inside a minute"*, is
 *    the figure every Everyday surface already reports, and § 4.4 counts it at boarding for the
 *    stated reason that *"a run that ends with people still standing will flatter itself"*.
 *    `pctOverLongWait` is over **served legs**, which is a slightly different denominator and is
 *    described as what it is rather than as § 5's — see {@link RATING_BASIS}.
 * 2. `batch/types.ts` classes it an **observation**, not an estimate. R1 forbids reading
 *    `awtS`, `wt95S` or `ttdMeanS` off a run whose `awtIsValid` is false, and § 1's own measurement
 *    is that an observation-based comparison is available on all sixty shipped cells and an
 *    estimate-based one on fourteen. A rating that silently dropped a third of the forty whenever a
 *    tower saturated would move with the saturation rather than with the dispatcher.
 * 3. Its direction is unambiguous. Energy is an axis and never a score (CLAUDE.md § D106);
 *    `personsPer5Min` rewards a run that met more people. Neither can carry a single ordering.
 *
 * ## What the number may be used for, and what it may not
 *
 * A rating **orders the ladder** and **is not a measured difference**. Every entrant meets the
 * identical crowd on each case — that is § 1's fixed seed rule and it is what makes two ratings
 * comparable at all — but the gauntlet runs **one replication per case**, so the forty pairs behind
 * a gap between two ladder rows are forty, not the fifty-to-two-hundred CLAUDE.md budgets, and
 * `report.ts` would call a separating interval over them `under-budget` **with the winner
 * deliberately unnamed**. So this module computes a mean and a weakest case and stops: it emits no
 * verdict, no comparison and no winner, and {@link RATING_CAVEAT} is drawn wherever the number is.
 * The bench is where two dispatchers are compared, under common random numbers, with an interval.
 *
 * ## Holes are holes — R13
 *
 * `pctOverLongWait` is `null` on a replication that served nobody, and a `null` may never be
 * averaged as a zero. So the rating carries **two** counts: how many of the forty ran, and how many
 * produced a figure. A rating over fewer than all forty is not the rating § 12.3 defines, and
 * {@link RatingSummary.complete} says so rather than leaving a reader to compare two numbers.
 */

import type { BatchMetric, BatchResult } from '../batch/types.js';

import type { ProofCase } from './proofCases.js';

/**
 * The metric the rating is folded from — an id of the shipped projection, never a second list.
 *
 * The rating is `100 −` this, because the projection reports the **bad** share and a rating rises
 * with quality. That inversion is here, once, so no renderer performs it.
 */
export const RATING_METRIC: BatchMetric = 'pctOverLongWait';

/**
 * What the number is a mean of, in the player's words. Published beside every rating.
 *
 * It says *served rides* rather than § 5's *boarders* on purpose: the two denominators differ on a
 * run that ends with people aboard, and claiming § 5's figure while computing this one is the
 * stated-mechanism defect with a denominator.
 */
export const RATING_BASIS =
  'the share of rides that waited a minute or less, averaged over the forty proof cases — one run ' +
  'of each, every entrant on the identical crowd';

/** The limitation drawn wherever a rating is. See the module docstring for why it is not optional. */
export const RATING_CAVEAT =
  'A rating orders this table; a gap between two rows is not a measured difference. Each case is ' +
  'one run, so forty pairs sit behind a gap and this project does not name a winner below fifty. ' +
  'The bench is where two dispatchers are compared on matched crowds with an interval.';

/** One of the forty, folded: the case, the seed it ran under, and its score. */
export interface RatedCase {
  readonly caseId: string;
  /** The tower's building id. The player-facing name is resolved by the reader, never stored. */
  readonly buildingId: string;
  readonly crowdId: string;
  /** Invariant 5 — the record carries the seed, so any case replays exactly. */
  readonly seed: string;
  /**
   * `100 − pctOverLongWait`, or `null` where the run measured nothing.
   *
   * `null` rather than zero, and it is the whole of R13 in one field: a case that served nobody has
   * no share to report, and a zero would be the claim that everybody waited too long.
   */
  readonly score: number | null;
  /** Why there is no score, when there is none — the run's own words where it had any. */
  readonly noScoreReason: string | null;
}

/** A finished rating, with both counts and the case it did worst on. */
export interface RatingSummary {
  /** The mean of every scored case, or `null` when none scored. */
  readonly rating: number | null;
  /** How many of the forty produced a figure. The rating's denominator. */
  readonly casesRated: number;
  /** How many of the forty ran at all. Equal to {@link casesRated} unless a run served nobody. */
  readonly casesRun: number;
  /** The forty. Derived from the proof set, never a literal. */
  readonly casesTotal: number;
  /**
   * `casesRated === casesTotal`.
   *
   * The cases never move, so only a complete rating is comparable with another rating. An
   * incomplete one is still shown — a refusal a player cannot see is a refusal that does not
   * work — and it is shown as incomplete.
   */
  readonly complete: boolean;
  /** The scored case with the lowest score — § 14's *weakest at*. `null` when nothing scored. */
  readonly weakest: RatedCase | null;
  readonly cases: readonly RatedCase[];
}

/**
 * One case's score from its finished batch — the mean of the arm's replications that measured
 * something.
 *
 * The gauntlet runs one arm and one replication, so this is almost always one number; it means the
 * mean rather than *"the first"* so that a caller raising the budget gets a rating rather than a
 * silently discarded thirty-nine runs. Replications that measured nothing are dropped from the
 * mean, never counted as zero.
 */
export function proofCaseScoreOf(result: BatchResult): {
  readonly score: number | null;
  readonly reason: string | null;
} {
  const arm = result.arms[0];
  if (arm === undefined) {
    return { score: null, reason: 'the case ran no dispatcher, so there is nothing to score' };
  }
  const measured = arm.replications
    .map((replication) => replication.metrics[RATING_METRIC])
    .filter((value): value is number => value !== null);
  if (measured.length === 0) {
    return {
      score: null,
      reason:
        'nobody was carried in this case, so there is no share of rides to take — the case is ' +
        'left out of the mean rather than counted as zero',
    };
  }
  const mean = measured.reduce((sum, value) => sum + value, 0) / measured.length;
  return { score: 100 - mean, reason: null };
}

/**
 * Fold one case's result into a {@link RatedCase}. Pure, and the only route into one.
 *
 * The proof case is passed beside its result rather than read off it, because a `BatchResult`
 * carries a building id and a seed and knows nothing about which of the forty it was.
 */
export function ratedCaseOf(proofCase: ProofCase, result: BatchResult): RatedCase {
  const { score, reason } = proofCaseScoreOf(result);
  return {
    caseId: proofCase.id,
    buildingId: proofCase.tower.id,
    crowdId: proofCase.crowd.id,
    seed: proofCase.seed,
    score,
    noScoreReason: reason,
  };
}

/**
 * The mean, its two counts, and the weakest case.
 *
 * `casesTotal` is passed in rather than counted from `cases`, because the interesting incomplete
 * rating is the one where a case **never ran** — a cancelled gauntlet, or a failed worker — and
 * that case has no row at all. A rating that derived its denominator from the rows it happened to
 * receive would report `40 of 40` on a gauntlet that ran twelve.
 */
export function ratingOf(cases: readonly RatedCase[], casesTotal: number): RatingSummary {
  const scored = cases.filter(
    (entry): entry is RatedCase & { readonly score: number } => entry.score !== null,
  );
  const rating =
    scored.length === 0
      ? null
      : scored.reduce((sum, entry) => sum + entry.score, 0) / scored.length;
  const weakest = scored.reduce<(RatedCase & { readonly score: number }) | null>(
    (worst, entry) => (worst === null || entry.score < worst.score ? entry : worst),
    null,
  );
  return {
    rating,
    casesRated: scored.length,
    casesRun: cases.length,
    casesTotal,
    complete: scored.length === casesTotal,
    weakest,
    cases,
  };
}

/**
 * The rating as a figure, or the em dash — § 13: *"`—` is the only placeholder for a figure that
 * does not exist yet. Never `0`, never `N/A`, never a spinner where a dash will do."*
 *
 * One decimal, because a rating separating two dispatchers by less than a point is a rating whose
 * gap this module already refuses to call a difference; a second decimal would invite the reading
 * the caveat exists to refuse.
 */
export function ratingFigureOf(summary: RatingSummary): string {
  return summary.rating === null ? '—' : `${summary.rating.toFixed(1)}%`;
}

/** § 14's *proof cases* cell — `40 of 40`, and the honest smaller number when it is one. */
export function proofCaseCountOf(summary: RatingSummary): string {
  return `${String(summary.casesRated)} of ${String(summary.casesTotal)}`;
}

/* -------------------------------------------------------------------------- *
 * Reading a rated case back off a store — GitHub issue #224
 * -------------------------------------------------------------------------- */

/**
 * Why a value read back out of storage is not a {@link RatedCase}, or `undefined` when it is one.
 *
 * ## Why the validator is here rather than where the bytes are
 *
 * `everyday/profile.ts` owns the slot, the version, the migration and the budget; it does not own
 * what a rated case *is*, and a persistence layer that grew its own opinion about that would be a
 * second definition of this module's type kept in step by hand. It is the split `persist/` already
 * draws between `session.ts` (the envelope) and `validate.ts` (the payloads), one product over.
 *
 * ## A sentence rather than a boolean
 *
 * `undefined` or a reason — `menu/account.ts#displayNameIssueOf`'s shape, and `persist/validate.ts`'s
 * — because a refusal a player meets has to be able to say *which* field was wrong, and a predicate
 * answering `false` would make all six the same failure.
 *
 * ## The two `null`s are checked against each other, and that is the point of the last clause
 *
 * `score: null` is R13's *this case served nobody*, and `noScoreReason` is the sentence that goes
 * with it. A stored case carrying **both** a score and a reason, or **neither**, is refused: those
 * two fields are one fact written twice, and a restored rating whose halves disagree would print a
 * figure beside an explanation of why there is none. {@link proofCaseScoreOf} cannot emit such a
 * pair, so a value that carries one did not come from this module.
 */
export function ratedCaseIssue(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'a rated case is not an object';
  }
  const record = value as Record<string, unknown>;
  for (const key of ['caseId', 'buildingId', 'crowdId', 'seed'] as const) {
    const text = record[key];
    // Invariant 5 sits inside this loop: a stored rating with no `seed` is a rating that cannot be
    // replayed, and restoring one would put an unrepeatable claim on the ladder.
    if (typeof text !== 'string' || text === '') return `a rated case has no ${key}`;
  }
  const score = record['score'];
  if (score !== null && (typeof score !== 'number' || !Number.isFinite(score))) {
    return 'a rated case’s score is neither a number nor null';
  }
  const reason = record['noScoreReason'];
  if (reason !== null && typeof reason !== 'string') {
    return 'a rated case’s noScoreReason is neither a sentence nor null';
  }
  if ((score === null) !== (reason !== null)) {
    return 'a rated case both has a score and says why it has none, or does neither';
  }
  return undefined;
}
