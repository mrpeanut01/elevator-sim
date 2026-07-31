/**
 * **The grounds on which a run refuses its own mean — as a code beside the prose.**
 *
 * `RunSummary.awtIsValid` is the single most consequential boolean this package produces: a run
 * whose mean is refused must never display a mean (docs/07 § 3, `the root DECISIONS.md` § D111).
 * Until this module existed the refusal travelled as **prose alone** — `summarizeRun` built one of
 * four sentences with a nested conditional and returned a bare `string` — and every consumer that
 * wanted to say anything *about* the refusal beyond quoting it had to re-decide which ground fired
 * by re-reading `saturated`, `waiting.count`, `unservedCount` and `serviceLevel.verdict` in this
 * module's own precedence order. That is a second source of truth about a question already
 * answered here, and it is wrong in exactly the case the fourth ground exists for: a run that looks
 * unsaturated and uncensored and is refused anyway.
 *
 * So the ground travels **beside** the prose. Both come out of {@link diagnoseAwtValidity}, both
 * are carried on {@link RunSummary}, and neither replaces the other: the sentence is the honest
 * statement and several guards assert on it, the code is what lets a presentation layer shorten it
 * without re-deciding it.
 *
 * ## Why this is a table of grounds and not a union beside a switch
 *
 * The obvious shape — a hand-written `AWT_INVALID_GROUNDS` tuple next to a nested conditional that
 * returns members of it — is the **hand-written-list defect** this repository has closed twice
 * (`the root DECISIONS.md` § D152, and § D163 one layer up). It fails silently: a fifth ground is
 * added to the conditional, nobody adds it to the tuple, and every list-driven consumer keeps
 * reporting four.
 *
 * Here a ground **is** its entry in {@link AWT_INVALID_GROUND_SPECS}, and there is nowhere else it
 * exists. The union {@link AwtInvalidGround} is `(typeof AWT_INVALID_GROUND_SPECS)[number]['ground']`
 * and {@link AWT_INVALID_GROUNDS} is that table's own `ground` column. A fifth ground is one new
 * entry — a predicate and a sentence, written together, in one place — and it enters the union, the
 * enumeration and the precedence by existing. There is no second list to forget.
 *
 * ## The order is the precedence, and the precedence is load-bearing
 *
 * The table is evaluated top to bottom and the **first** ground that fires is the one reported, so
 * a run that trips several reports the most fundamental one rather than the last one checked. The
 * order below is the order `summarizeRun`'s nested conditional had before this module extracted it,
 * preserved exactly — **saturation, then emptiness, then censoring, then starvation** — with
 * **abandonment** inserted between emptiness and censoring when docs/14 § 3.1 made riders able to
 * leave. It goes *above* censoring rather than below it, and that placement was corrected by a
 * run rather than argued: see the ground's own comment.
 *
 * (`RunSummary.awtIsValid`'s docstring numbered these 1 saturation, 2 censoring, 3 emptiness,
 * 4 starvation and claimed they were *"evaluated in that order"*. They were not, and never have
 * been — emptiness was always checked before censoring. The two disagree observably on a window
 * where nobody boarded at all and more than the censoring limit went unserved, which reports
 * emptiness. The docstring is corrected to match the code rather than the code to match the
 * docstring, because the code's order is the right one: *"nobody was served"* is a more fundamental
 * fact than *"the survivors are a biased sample"*, and with a zero denominator the censoring
 * sentence's own arithmetic is the less informative of the two.)
 *
 * ## What a consumer that does not recognise a code must do
 *
 * Not nothing. {@link AwtInvalidity.reason} is always present and always the run's own words, so a
 * consumer handed a ground it has no wording for falls back to quoting the prose — the behaviour it
 * had before codes existed. A code is permission to **shorten**, never permission to **replace**;
 * dropping the sentence because the code was unfamiliar would turn a widened vocabulary into a
 * suppressed refusal, which is the one failure this whole gate exists to prevent.
 *
 * Nothing here reads a clock (invariant 3) or draws a random number (invariant 2), and every
 * function is pure.
 */

import type {
  SaturationDiagnosis,
  ServiceLevelDiagnosis,
  WaitStatistics,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The evidence a ground is decided on
 * -------------------------------------------------------------------------- */

/**
 * Everything the four grounds are decided and worded from.
 *
 * Assembled by `summarizeRun` from the diagnoses it has already computed — never re-derived here.
 * `windowSeconds` and `unservedFraction` are passed rather than recomputed for the same reason: the
 * caller has them, and a second computation of a quantity is a second answer waiting to disagree.
 */
export interface AwtValidityEvidence {
  /** The window's wait statistics — `count`, `arrivalCount`, `unservedCount`, `meanS`. */
  readonly waiting: WaitStatistics;
  /** The queue-trend verdict and every number behind it. */
  readonly saturation: SaturationDiagnosis;
  /** The longest-wait verdict and every number behind it. */
  readonly serviceLevel: ServiceLevelDiagnosis;
  /** Seconds spanned by the reporting window — `windowDurationS(window)`. */
  readonly windowSeconds: number;
  /** The censoring limit applied. `DEFAULT_MAX_UNSERVED_FRACTION` unless overridden. */
  readonly maxUnservedFraction: number;
  /** `unservedCount / arrivalCount`, or `0` when the window held no arrivals. */
  readonly unservedFraction: number;
  /**
   * Legs in the window whose rider gave up and left (docs/14 § 3.1).
   *
   * `0` on every run that declares no `sim.patience`, which is every run this repository has
   * published — so the fifth ground below cannot fire on one, and the four above are unchanged.
   */
  readonly abandonedCount: number;
  /** `abandonedCount / arrivalCount`, or `0` when the window held no arrivals. */
  readonly abandonmentFraction: number;
  /** The abandonment limit applied. `DEFAULT_MAX_ABANDONMENT_FRACTION` unless overridden. */
  readonly maxAbandonmentFraction: number;
}

/* -------------------------------------------------------------------------- *
 * The grounds
 * -------------------------------------------------------------------------- */

/**
 * One ground: how to tell it fired, and what the run says when it did.
 *
 * The predicate and the sentence live on the same object deliberately. Split apart — a `switch`
 * deciding the code and a second `switch` writing the prose — they are two places that must agree
 * about the same branch, which is the shape that lets a code and a sentence describe different
 * grounds. Together they cannot.
 */
interface AwtInvalidGroundSpec {
  /** The machine-readable code. Kebab-case, and stable: consumers key wording off it. */
  readonly ground: string;
  /** Whether this ground fires. Pure, and never mutates the evidence. */
  readonly fires: (evidence: AwtValidityEvidence) => boolean;
  /** The run's own sentence for this ground. The prose a consumer may shorten and may not drop. */
  readonly reason: (evidence: AwtValidityEvidence) => string;
}

/**
 * **The grounds, in precedence order. The only place a ground exists.**
 *
 * Every sentence below is carried over from `summarizeRun` verbatim — this module extracted the
 * decision, it did not reword it. See the module docstring for why there is no parallel list of
 * codes and why the order is the one it is.
 */
const AWT_INVALID_GROUND_SPECS = [
  {
    /**
     * The queue diverged over the window. docs/03-traffic-and-statistics.md § Saturation
     * detection: *"If a configuration saturates, flag it and suppress the AWT interval."*
     */
    ground: 'saturated',
    fires: (evidence: AwtValidityEvidence): boolean => evidence.saturation.saturated,
    reason: (evidence: AwtValidityEvidence): string => {
      const { saturation } = evidence;
      return `Queue length rose by ${saturation.projectedGrowthPersons.toFixed(1)} persons (${saturation.slopePersonsPerMinute.toFixed(2)}/min, ${saturation.growthToNoiseRatio.toFixed(1)}x the queue's own scatter) over the ${evidence.windowSeconds.toFixed(0)} s reporting window, against thresholds ${saturation.thresholds.minProjectedGrowthPersons} persons and ${saturation.thresholds.minSlopePersonsPerMinute}/min; the system is saturated, AWT is not approximately normal and its confidence interval must be suppressed.`;
    },
  },
  {
    /** Nobody was served at all, so there is no mean to take. */
    ground: 'empty-window',
    fires: (evidence: AwtValidityEvidence): boolean => evidence.waiting.count === 0,
    reason: (): string =>
      'No passenger was served within the reporting window, so there is no waiting time to average.',
  },
  {
    /*
     * **The fifth ground, and it is placed *ahead* of censoring because a measurement said so.**
     *
     * The argument written first put it after `censored`, on the reasoning that both describe a
     * biased survivor cohort and censoring is the older claim. The first run that abandoned
     * anybody refuted it: an abandoned leg never boards, so `WaitStatistics.unservedCount`
     * counts it too, and a run at a 4 % abandonment rate reported **`censored`** — *"too many
     * arrivals were never served"* — about a window whose queue had drained perfectly. The
     * sentence was true and the diagnosis was useless: it sends a reader to look for a backlog
     * that is not there, when what happened is that the backlog walked out.
     *
     * So the precedence is by **cause**, which is what "the most fundamental ground" has always
     * meant here. Where riders abandoned, the censoring *is* the abandonment seen from the other
     * side, and the same is true of the tail gate below — nobody can wait past a 900 s horizon on
     * a run where everybody leaves at five minutes, so `starved` goes quiet exactly when this
     * fires hardest.
     *
     * It stays below `empty-window` for the reason that ground is second at all: with nothing
     * served there is no mean, and no account of *why* changes that.
     */
    ground: 'abandoned',
    fires: (evidence: AwtValidityEvidence): boolean =>
      evidence.abandonmentFraction > evidence.maxAbandonmentFraction,
    reason: (evidence: AwtValidityEvidence): string =>
      `${evidence.abandonedCount} of ${evidence.waiting.arrivalCount} arrivals in the reporting window (${(evidence.abandonmentFraction * 100).toFixed(1)}%) gave up and left before a car reached them, above the ${(evidence.maxAbandonmentFraction * 100).toFixed(1)}% abandonment limit. Every one of those waits was longer than the ones the mean is taken over, so abandonment lowers AWT by construction and the reported mean of ${evidence.waiting.meanS.toFixed(1)} s describes the riders who stayed rather than the service they were offered; its confidence interval must be suppressed.`,
  },
  {
    /*
     * Censoring is checked independently of the trend. AWT is computed over the legs that
     * boarded, and the legs that did not are systematically the ones that would have waited
     * longest — so a heavily censored window reports the mean of its fastest survivors, and does
     * so without the queue trend necessarily firing at all.
     */
    ground: 'censored',
    fires: (evidence: AwtValidityEvidence): boolean =>
      evidence.unservedFraction > evidence.maxUnservedFraction,
    reason: (evidence: AwtValidityEvidence): string =>
      `${evidence.waiting.unservedCount} of ${evidence.waiting.arrivalCount} arrivals in the reporting window (${(evidence.unservedFraction * 100).toFixed(1)}%) were never served, above the ${(evidence.maxUnservedFraction * 100).toFixed(1)}% censoring limit. AWT is the mean over the legs that boarded, which are systematically the passengers who waited least, so the reported mean is biased low by an unknown amount and its confidence interval must be suppressed.`,
  },
  {
    /*
     * The tail is checked independently of both. The trend gate sees a queue that is still
     * growing at the horizon and the censoring gate sees one that has not cleared by it; neither
     * sees a queue that grew enormously and then drained just in time, which reports `completed`,
     * nought unserved, a diluted trend — and a mean beside a passenger who stood on a landing for
     * a quarter of an hour.
     */
    ground: 'starved',
    fires: (evidence: AwtValidityEvidence): boolean => evidence.serviceLevel.starved,
    reason: (evidence: AwtValidityEvidence): string => {
      const { serviceLevel, waiting } = evidence;
      return `Leg "${String(serviceLevel.longestWaitLegId)}" (${String(serviceLevel.longestWaitOriginFloorId)} to ${String(serviceLevel.longestWaitDestinationFloorId)}) waited ${serviceLevel.longestWaitS.toFixed(1)} s${serviceLevel.longestWaitIsCensored ? ' and had still not boarded when the run ended, so that is a lower bound' : ''}, past the ${serviceLevel.horizonS.toFixed(0)} s abandonment horizon; ${serviceLevel.overHorizonCount} of ${serviceLevel.arrivalCount} arrivals in the reporting window are past it. The queue did not diverge and the window is not censored, so neither of those gates fires — but a mean of ${waiting.meanS.toFixed(1)} s reported beside a wait of ${serviceLevel.longestWaitS.toFixed(1)} s describes a system nobody experienced, and its confidence interval must be suppressed.`;
    },
  },
] as const satisfies readonly AwtInvalidGroundSpec[];

/**
 * Which of the grounds refused a mean — the machine-readable half of the refusal.
 *
 * **Derived from {@link AWT_INVALID_GROUND_SPECS}, never written down twice.** A fifth entry in
 * that table widens this union with no edit here, and every exhaustive `switch` and
 * `Record<AwtInvalidGround, …>` in the tree becomes a compile error until somebody decides what the
 * fifth ground says. That compile error is the point: it is the difference between a decision
 * somebody made and a decision somebody forgot.
 */
export type AwtInvalidGround = (typeof AWT_INVALID_GROUND_SPECS)[number]['ground'];

/**
 * Every ground, in precedence order — the table's own `ground` column.
 *
 * For a consumer that needs to enumerate them (a wording table's completeness check, a report that
 * counts refusals by kind). Enumerating this is safe; **re-listing** it is the defect.
 */
export const AWT_INVALID_GROUNDS: readonly AwtInvalidGround[] = Object.freeze(
  AWT_INVALID_GROUND_SPECS.map((spec) => spec.ground),
);

/* -------------------------------------------------------------------------- *
 * The verdict
 * -------------------------------------------------------------------------- */

/**
 * A refusal: the ground that fired and the sentence it produced.
 *
 * The two are **never** separated. A consumer may show the prose alone (every consumer did, before
 * codes existed); it may not show the code alone, because a code is not an explanation.
 */
export interface AwtInvalidity {
  readonly ground: AwtInvalidGround;
  /** The run's own words. Never a paraphrase, never a code, never empty. */
  readonly reason: string;
}

/**
 * The first ground that fires, or `undefined` when the mean may carry a confidence interval.
 *
 * Pure. Total on well-formed evidence: every predicate is a comparison over numbers the caller
 * already computed, and none of them throws.
 *
 * This is the **only** place the grounds are evaluated. `summarizeRun` calls it once and
 * publishes both halves of what it returns; nothing else in the project may re-decide a refusal
 * from a summary's other fields, because a second decision is a second answer.
 */
export function diagnoseAwtValidity(evidence: AwtValidityEvidence): AwtInvalidity | undefined {
  for (const spec of AWT_INVALID_GROUND_SPECS) {
    if (!spec.fires(evidence)) continue;
    return Object.freeze({ ground: spec.ground, reason: spec.reason(evidence) });
  }
  return undefined;
}
