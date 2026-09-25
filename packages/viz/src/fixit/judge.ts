/**
 * **The fix-it judge: the letter's morning is the gate, and forty-nine derived mornings decide** —
 * [§ D1020](../../../../DECISIONS.md), GitHub issue **#602**, amended by
 * [§ D1120](../../../../DECISIONS.md).
 *
 * ## What was wrong with one pair
 *
 * `classifyOutcome` judges one pair: the case seed, one run as the building stands and one with the
 * player's order, against § 9's two bars. Under common random numbers an unchanged building
 * compares identical, so the pair is not a lottery in the obvious sense. The defect is subtler and
 * worse: **the case seeds sit where almost any perturbation clears the complaint**. On the shipped
 * seeds a 3 cm/s speed placebo cleared three of eighteen cases, free zone-centre parking six, and a
 * three-metre roof raise cleared a clinic's appointment-letter complaint. And measured on fifty
 * mornings, several of the case's own diagnosed repairs remove nothing off the letter's morning —
 * they were taught from one crowd.
 *
 * ## The ruling, and where each clause lives
 *
 * 1. **The gate** is the existing single pair on the letter's morning with today's bars — 80 % of
 *    the complaint gone and the rest of the building down by no more than 2 points. A press that
 *    misses it is classified exactly as before and costs exactly one pair.
 * 2. **Replication** runs only when the gate clears: the same order on {@link DERIVED_MORNINGS}
 *    further mornings, each paired with the building as it stands on that morning's crowd — common
 *    random numbers, so an unchanged building still compares identical.
 * 3. **The mornings are derived, never authored** — {@link replicationSeedsOf}: the case seed plus
 *    `i × 7919`, i = 1 … 49. No field of `data/fixit-cases.json` can name one, so no author can pick
 *    mornings the answer happens to clear, and `judge.test.ts` holds that both ways.
 * 4. **Fixed** requires all three: the gate; a two-sided 95 % paired-t interval on the per-morning
 *    complaint reduction **over the forty-nine derived mornings** whose lower bound is above zero
 *    (`CLAUDE.md`'s own rule, and the same arithmetic `experiments` publishes with); and the rest of
 *    the building **not shown worse than the 2-point floor** — the upper bound of the same interval
 *    on the rest's per-morning change is at or above −2.
 * 5. **k = 50 runs of each side in total**, the gate's morning and forty-nine more. It is not a
 *    tuning choice: it is `CLAUDE.md`'s *"Budget 50–200 replications per configuration. Ten is not
 *    enough"*, and a fixed verdict is a better-than-as-built claim. Two decision agents argued for
 *    eight and ten; the repository's rule settled it, and § D1020 records the dissent.
 * 6. **A clear that does not hold** is `cleared-once`: no badge, no chimes, nothing banked, and a
 *    screen that says it cleared on this morning only.
 *
 * ## What § D1120 moved, and why
 *
 * - **The letter's morning is out of the interval.** It is the gate's morning, and a gate-clearing
 *   order has by construction removed at least 80 % of its complaint, so a pair selected by the gate
 *   sat inside the interval that was meant to test it. Two decision agents measured the cost
 *   independently: with it in, a no-effect order passed about 4 % of the time against a nominal
 *   2.5 %; with it out, 2.1 to 2.7 %. Excluding it changed no shipped verdict, and `cases.test.ts`
 *   re-asserts every case on this tree.
 * - **A pre-registered futility look, and no efficacy look.** At {@link FUTILITY_LOOKS} — 10, 20, 30
 *   and 40 derived mornings — a check whose running mean reduction is at or below zero stops and
 *   says *not fixed*, with counts and no interval. It can only turn a *fixed* into a *not fixed*, so
 *   the false-fixed rate cannot rise; `judge.test.ts` reproduces the decision member's simulation of
 *   it (about 0.021 false-fixed, and a no-effect order checked in about 24.5 mornings rather than
 *   forty-nine). **There is no early *fixed***: an interval taken after peeking is not a 95 %
 *   interval, and a fixed verdict on fewer than forty-nine mornings would be under `CLAUDE.md`'s
 *   replication budget. Two members' O'Brien–Fleming efficacy boundary is § D1120's recorded dissent.
 *
 * **Replication can only take a clear away, never grant one.** The letter's morning is what the
 * stage plays, the three rows print and the letter is written about; a verdict reading *fixed* over
 * a gate pair that did not clear would be two verdicts on one screen, which is the shape
 * `fixedBadgeAfter`'s docstring was written against. And there is no 80 % bar pooled over the
 * mornings: that bar was authored against the letter's morning's magnitude, and asking it of every
 * morning refuses repairs whose effect is real on every one (§ D1020 names the dissent that wanted
 * it).
 *
 * ## The cost, and where it is paid
 *
 * The forty-nine as-built mornings do not depend on the order. They ship as a derived artifact,
 * `data/fixit-as-built-mornings.json` ({@link FixitJudgeOptions.shipped}, § D1120), checked
 * always-on against the inputs that produce them and re-derived in the deep tier, so no press is
 * ever cold; a case whose shipped readings do not match its inputs asks for them once, when the
 * case opens ({@link FixitJudge.prepare}), off the painting thread. The forty-nine after-runs are
 * asked **only on a press whose gate cleared**, and each one is reported as it lands
 * ({@link MorningProgress}), which is what the screens' live count and per-morning marks draw.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';
import { pairedDifferenceEstimate } from '@elevator-sim/experiments/browser';

import type { VizRecording } from '../contract/types.js';
import {
  DEMAND_BASIS_LINE,
  REST_DROP_LIMIT_POINTS,
  type FixitOutcome,
  type FixitRow,
} from './engine.js';
import type { FixitRunPlan, MorningReading } from './run.js';
import type { ComplaintMeasure, FixitCase } from './types.js';

/** The gate's morning and forty-nine more — `CLAUDE.md`'s floor of fifty replications. */
export const FIXIT_MORNINGS = 50;

/**
 * **The mornings the verdict's interval is taken over: the forty-nine derived ones** —
 * [§ D1120](../../../../DECISIONS.md) clause 2. The letter's morning is the gate and is selected by
 * it, so it sits outside the interval that tests the gate's clear.
 */
export const DERIVED_MORNINGS = FIXIT_MORNINGS - 1;

/**
 * **The pre-registered futility looks** — [§ D1120](../../../../DECISIONS.md) clause 3.
 *
 * At each, in order, a check whose running mean complaint reduction over the derived mornings so far
 * is at or below zero stops and says *not fixed*. Constants rather than a dial: changing them
 * changes the design the error rates in `judge.test.ts` were measured on, and that test re-measures
 * them. There is **no efficacy look** — *fixed* is said only over all {@link DERIVED_MORNINGS}.
 */
export const FUTILITY_LOOKS: readonly number[] = Object.freeze([10, 20, 30, 40]);

/**
 * The stride between derived mornings. A prime, so no two cases' mornings fall into step with each
 * other's case seeds, and the one three decision agents measured with — so the census in § D1020
 * and the shipped judge are the same mornings.
 */
export const MORNING_SEED_STEP = 7919n;

/** The two-sided confidence the interval is taken at — the repository's rule, never a dial. */
export const JUDGE_CONFIDENCE = 0.95;

/**
 * The forty-nine further mornings, derived from the case seed and nothing else.
 *
 * In code rather than in `data/`, beside the bars they serve, so that no author can pick mornings —
 * a case file that could name its replication seeds could name the ones its answer clears on.
 */
export function replicationSeedsOf(entry: Pick<FixitCase, 'run'>): readonly bigint[] {
  const seed = BigInt(entry.run.seed);
  return Array.from({ length: DERIVED_MORNINGS }, (_, index) => seed + BigInt(index + 1) * MORNING_SEED_STEP);
}

/** One config per derived morning — the same config with the morning's seed, and nothing else changed. */
export function morningConfigsOf(config: SimulationConfig, seeds: readonly bigint[]): SimulationConfig[] {
  return seeds.map((seed) => ({ ...config, seed }));
}

/* -------------------------------------------------------------------------- *
 * The verdict over the derived mornings
 * -------------------------------------------------------------------------- */

/** A paired interval, as the verdict states it. At a futility stop the bounds are `NaN`: no interval. */
export interface PairedInterval {
  /** Mornings the interval is over. */
  readonly n: number;
  readonly mean: number;
  readonly lower: number;
  readonly upper: number;
}

export interface FixitReplication {
  /** Derived mornings the verdict read: {@link DERIVED_MORNINGS}, or the futility look it stopped at. */
  readonly mornings: number;
  /** The derived mornings the check was planned over — always {@link DERIVED_MORNINGS} from a press. */
  readonly planned: number;
  /** The futility look the check stopped at, or `undefined` when it ran to the end. */
  readonly stoppedAt: number | undefined;
  /** Of the mornings whose complaint could be read, how many had it lower with the order. A count. */
  readonly lowerOn: number;
  /** Complaint totals over the mornings the complaint interval is taken over. */
  readonly complaintBeforeTotal: number;
  readonly complaintAfterTotal: number;
  /** Before minus after, per morning. Positive is better. Bounds `NaN` at a futility stop. */
  readonly reduction: PairedInterval;
  /** After minus before in points, per morning. Negative is worse. `null` when nobody else rode on two mornings, and at a futility stop. */
  readonly rest: PairedInterval | null;
  /** The reduction's lower bound is above zero. */
  readonly complaintHolds: boolean;
  /** The rest is not shown worse than the 2-point floor. Not judged at a futility stop. */
  readonly restHolds: boolean;
  readonly holds: boolean;
}

function intervalOf(values: readonly number[]): PairedInterval {
  const zeros = values.map(() => 0);
  const estimate = pairedDifferenceEstimate(values, zeros, { confidence: JUDGE_CONFIDENCE });
  return { n: estimate.n, mean: estimate.mean, lower: estimate.lower, upper: estimate.upper };
}

function assertPaired(before: readonly MorningReading[], after: readonly MorningReading[]): void {
  if (before.length !== after.length) {
    throw new Error(
      `fixit judge: ${String(before.length)} as-built mornings against ${String(after.length)} after-runs. A paired interval needs one pair a morning.`,
    );
  }
}

/** The complaint's per-morning reductions and totals, over the mornings where it could be read on both sides. */
function complaintOf(before: readonly MorningReading[], after: readonly MorningReading[]) {
  const reductions: number[] = [];
  let beforeTotal = 0;
  let afterTotal = 0;
  for (const [index, b] of before.entries()) {
    const a = after[index]!;
    if (b.complaint !== null && a.complaint !== null) {
      reductions.push(b.complaint - a.complaint);
      beforeTotal += b.complaint;
      afterTotal += a.complaint;
    }
  }
  return { reductions, beforeTotal, afterTotal, lowerOn: reductions.filter((value) => value > 0).length };
}

/**
 * Judge a set of derived mornings with no look — the whole interval. `before[i]` and `after[i]` are
 * one morning's pair.
 *
 * A morning whose complaint cannot be read on either side — a `mean-wait` scope that boarded nobody
 * — is left out of the complaint interval rather than read as zero, and the interval's `n` says how
 * many were kept. A morning on which nobody outside the scope rode is left out of the rest's interval
 * the same way. Fewer than two usable mornings is no interval at all, and no interval is not a hold.
 *
 * **The letter's morning is not an argument** ([§ D1120](../../../../DECISIONS.md) clause 2): the
 * gate is judged by `classifyOutcome` on its own pair, and these are the derived mornings only.
 */
export function judgeReplication(
  before: readonly MorningReading[],
  after: readonly MorningReading[],
): FixitReplication {
  assertPaired(before, after);
  const { reductions, beforeTotal, afterTotal, lowerOn } = complaintOf(before, after);
  const restChanges: number[] = [];
  for (const [index, b] of before.entries()) {
    const a = after[index]!;
    if (b.restAwayPct !== null && a.restAwayPct !== null) restChanges.push(a.restAwayPct - b.restAwayPct);
  }
  const reduction =
    reductions.length >= 2 ? intervalOf(reductions) : { n: reductions.length, mean: Number.NaN, lower: Number.NaN, upper: Number.NaN };
  const rest = restChanges.length >= 2 ? intervalOf(restChanges) : null;
  const complaintHolds = Number.isFinite(reduction.lower) && reduction.lower > 0;
  const restHolds = rest === null || !(rest.upper < -REST_DROP_LIMIT_POINTS);
  return {
    mornings: before.length,
    planned: before.length,
    stoppedAt: undefined,
    lowerOn,
    complaintBeforeTotal: beforeTotal,
    complaintAfterTotal: afterTotal,
    reduction,
    rest,
    complaintHolds,
    restHolds,
    holds: complaintHolds && restHolds,
  };
}

/**
 * **Whether the check stops for futility at this look** — the running mean complaint reduction over
 * the first `look` derived mornings is at or below zero. A look with no readable morning is not a
 * reason to stop: nothing was seen either way, so the check runs on.
 */
export function futileAt(before: readonly MorningReading[], after: readonly MorningReading[], look: number): boolean {
  const { reductions } = complaintOf(before.slice(0, look), after.slice(0, look));
  if (reductions.length === 0) return false;
  const mean = reductions.reduce((sum, value) => sum + value, 0) / reductions.length;
  return mean <= 0;
}

/**
 * The verdict of a check that stopped at a futility look: **counts only, and no interval** — an
 * interval taken at a look chosen by the data is not a 95 % interval, and this verdict does not need
 * one to say *not fixed*.
 */
export function futilityStopOf(
  before: readonly MorningReading[],
  after: readonly MorningReading[],
  look: number,
  planned: number = DERIVED_MORNINGS,
): FixitReplication {
  assertPaired(before, after);
  const { reductions, beforeTotal, afterTotal, lowerOn } = complaintOf(before.slice(0, look), after.slice(0, look));
  const mean = reductions.length === 0 ? Number.NaN : reductions.reduce((sum, value) => sum + value, 0) / reductions.length;
  return {
    mornings: look,
    planned,
    stoppedAt: look,
    lowerOn,
    complaintBeforeTotal: beforeTotal,
    complaintAfterTotal: afterTotal,
    reduction: { n: reductions.length, mean, lower: Number.NaN, upper: Number.NaN },
    rest: null,
    complaintHolds: false,
    restHolds: true,
    holds: false,
  };
}

/**
 * **The judge's own verdict over the derived mornings: the looks, in order, then the interval.**
 *
 * What both surfaces' presses get, whether the mornings stream in or arrive at once — the streaming
 * path in {@link createFixitJudge} stops at the same look this function would, because it asks
 * {@link futileAt} the same question over the same prefix. A look at or past the last morning is the
 * final verdict's, not a look.
 */
export function judgeMornings(before: readonly MorningReading[], after: readonly MorningReading[]): FixitReplication {
  assertPaired(before, after);
  for (const look of FUTILITY_LOOKS) {
    if (look >= before.length) break;
    if (futileAt(before, after, look)) return futilityStopOf(before, after, look, before.length);
  }
  return judgeReplication(before, after);
}

/* -------------------------------------------------------------------------- *
 * The check as it runs — counts and marks, never a running interval
 * -------------------------------------------------------------------------- */

/**
 * One morning, as its mark says it: the complaint lower with the order, higher, no different, or not
 * readable on one side. **A fact about a named morning**, and nothing pooled — § D1120 clause 4.
 */
export type MorningMark = 'lower' | 'higher' | 'same' | 'unread';

export function morningMarkOf(before: MorningReading, after: MorningReading): MorningMark {
  if (before.complaint === null || after.complaint === null) return 'unread';
  if (after.complaint < before.complaint) return 'lower';
  if (after.complaint > before.complaint) return 'higher';
  return 'same';
}

/**
 * **What a check in flight may say about itself** — [§ D1120](../../../../DECISIONS.md) clause 4:
 * how many of the planned mornings are in, and each landed morning's mark. **No running mean, no
 * running interval**, and nothing that reads the pooled direction: a running interval is exactly
 * the peeking the design refuses, and a word like *holding* is an interim inference by another name.
 */
export interface MorningProgress {
  /** Mornings with both sides in. */
  readonly landed: number;
  readonly planned: number;
  /** One entry per planned morning, in derived order; `undefined` until that morning lands. */
  readonly marks: readonly (MorningMark | undefined)[];
}

function progressOf(
  before: readonly (MorningReading | undefined)[],
  after: readonly (MorningReading | undefined)[],
): MorningProgress {
  const marks = before.map((b, index) => {
    const a = after[index];
    return b === undefined || a === undefined ? undefined : morningMarkOf(b, a);
  });
  return { landed: marks.filter((mark) => mark !== undefined).length, planned: before.length, marks };
}

/* -------------------------------------------------------------------------- *
 * The words
 * -------------------------------------------------------------------------- */

/**
 * The basis line under a verdict the derived mornings decided — § D1020's true second form of
 * `BASIS_LINE`, whose *"one run before, one run after"* stops being the whole of what was run the
 * moment the gate clears. Reworded by § D1120: the letter's morning is the gate and the forty-nine
 * are the interval, so the sentence says which is which.
 */
export const REPLICATED_BASIS_LINE =
  'one run before and one after on the letter’s morning, which is the gate, then the same order on forty-nine more mornings, each run beside the building as it stands on the same crowd — and fixed only where the drop holds across those forty-nine.';

/**
 * The same, for an order that changes who arrives: each morning's second run meets that morning's
 * crowd less the people moved, thinned rather than re-drawn since GitHub issue #601 (§ D1076).
 */
export const REPLICATED_DEMAND_BASIS_LINE =
  'one run before and one after on the letter’s morning, which is the gate, then the same order on forty-nine more mornings, each run beside the building as it stands — and the change moves who arrives, so each morning’s second run meets that morning’s crowd less the people it moved. Fixed only where the drop holds across those forty-nine.';

/**
 * The basis under a check that stopped at a futility look — § D1120 clause 3. The two lines above
 * say *forty-nine more mornings*, which is false of a check that ran ten.
 */
export const FUTILITY_BASIS_LINE =
  'one run before and one after on the letter’s morning, which is the gate, then the same order on the derived mornings in turn, each beside the building as it stands on the same crowd — looked at after ten, twenty, thirty and forty, and stopped at the first look where the complaint was no lower on average.';

/** The same, for an order that changes who arrives. */
export const FUTILITY_DEMAND_BASIS_LINE =
  'one run before and one after on the letter’s morning, which is the gate, then the same order on the derived mornings in turn, each beside the building as it stands with that morning’s crowd less the people the change moved — looked at after ten, twenty, thirty and forty, and stopped at the first look where the complaint was no lower on average.';

export const JUDGE_COPY = Object.freeze({
  checkingHead: 'It cleared on the letter’s morning. Now checking it on forty-nine more.',
  checkingBody:
    'One morning can be luck. The same order is running on forty-nine more mornings, each beside the building as it stands. It is called fixed only once all forty-nine are in; it can stop sooner, after ten, twenty, thirty or forty, only to say it is not fixed.',
  clearedOnceHead: 'It cleared on the letter’s morning, and it did not hold on the others.',
  clearedOnceClosing:
    'It cleared on this morning only, which one lucky crowd can do: it is not fixed, and nothing is banked.',
  replicationLabel: 'The same order on forty-nine more mornings',
  /** The live counter's unit, beside *N of 49* — § D1120 clause 4. */
  progressUnit: 'mornings in',
  /** Each per-morning mark's word, drawn in its title. */
  markLower: 'the complaint was lower with your order',
  markHigher: 'the complaint was higher with your order',
  markSame: 'the complaint was no different',
  markUnread: 'the complaint could not be read on this morning',
  markPending: 'still running',
});

/** The live counter, *"12 of 49 mornings in"* — a count and nothing else. */
export function progressLineOf(progress: MorningProgress): string {
  return `${String(progress.landed)} of ${String(progress.planned)} ${JUDGE_COPY.progressUnit}`;
}

/** One mark's title, *"Morning 12: the complaint was lower with your order"*. */
export function markTitleOf(index: number, mark: MorningMark | undefined): string {
  const word =
    mark === undefined
      ? JUDGE_COPY.markPending
      : mark === 'lower'
        ? JUDGE_COPY.markLower
        : mark === 'higher'
          ? JUDGE_COPY.markHigher
          : mark === 'same'
            ? JUDGE_COPY.markSame
            : JUDGE_COPY.markUnread;
  return `Morning ${String(index + 1)}: ${word}`;
}

function basisAfterReplication(gate: FixitOutcome, replication: FixitReplication): string {
  const demand = gate.basis === DEMAND_BASIS_LINE;
  if (replication.stoppedAt !== undefined) return demand ? FUTILITY_DEMAND_BASIS_LINE : FUTILITY_BASIS_LINE;
  return demand ? REPLICATED_DEMAND_BASIS_LINE : REPLICATED_BASIS_LINE;
}

function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return `${value < 0 ? '−' : '+'}${text}`;
}

function unitOf(measure: ComplaintMeasure): string {
  return measure.kind === 'long-waits' ? 'waits' : 's';
}

/** *"fell by 2.3 waits a morning over 49 mornings (95 % interval +1.6 to +3.0)"*, and its refusal. */
function reductionClause(measure: ComplaintMeasure, replication: FixitReplication): string {
  const { reduction } = replication;
  if (!Number.isFinite(reduction.mean)) {
    return `the complaint could be read on only ${String(reduction.n)} of ${String(replication.mornings)} mornings, which is no interval at all`;
  }
  const digits = 1;
  const direction = reduction.mean >= 0 ? 'fell by' : 'rose by';
  const span = `95 % interval ${signed(reduction.lower, digits)} to ${signed(reduction.upper, digits)}`;
  const tail = replication.complaintHolds ? 'which is not no change' : 'which cannot be told from no change';
  return `the complaint ${direction} ${Math.abs(reduction.mean).toFixed(digits)} ${unitOf(measure)} a morning over ${String(reduction.n)} mornings (${span}), ${tail}`;
}

/**
 * *"the check stopped after 10 of 49 mornings: the complaint was lower on 3 of 10, and no lower on
 * average, so no interval is drawn"* — § D1120 clause 3's claim, counts only.
 */
function futilityClause(replication: FixitReplication): string {
  const { reduction } = replication;
  return (
    `the check stopped after ${String(replication.mornings)} of ${String(replication.planned)} mornings: ` +
    `the complaint was lower on ${String(replication.lowerOn)} of ${String(reduction.n)}, and no lower on average, ` +
    'so no interval is drawn'
  );
}

function restClause(replication: FixitReplication): string {
  const { rest } = replication;
  if (rest === null) return 'nobody else rode on enough mornings to protect a share';
  const span = `${signed(rest.lower, 1)} to ${signed(rest.upper, 1)}`;
  const tail = replication.restHolds
    ? `not shown worse than the ${String(REST_DROP_LIMIT_POINTS)}-point floor`
    : `worse than the ${String(REST_DROP_LIMIT_POINTS)}-point floor across them`;
  return `the rest of the building moved ${signed(rest.mean, 1)} points a morning over ${String(rest.n)} mornings (${span}), ${tail}`;
}

function complaintTotalText(measure: ComplaintMeasure, total: number, n: number): string {
  return measure.kind === 'long-waits'
    ? `${String(total)} waits over ${String(n)} mornings`
    : `${(n === 0 ? 0 : total / n).toFixed(1)} s a morning over ${String(n)} mornings`;
}

/** The fourth row — the derived mornings, summed and judged. */
export function replicationRowOf(entry: FixitCase, replication: FixitReplication): FixitRow {
  const measure = entry.complaint.measure;
  return {
    label: `${JUDGE_COPY.replicationLabel} — ${measure.label}`,
    before: complaintTotalText(measure, replication.complaintBeforeTotal, replication.reduction.n),
    after: complaintTotalText(measure, replication.complaintAfterTotal, replication.reduction.n),
    verdict:
      replication.stoppedAt !== undefined
        ? futilityClause(replication)
        : `${reductionClause(measure, replication)}; ${restClause(replication)}`,
    passed: replication.holds,
  };
}

/**
 * What a surface draws the moment the letter's morning clears and the other mornings are still
 * running. The gate's three rows are true of the pair they print, so they stay; the head and body
 * say nothing is decided. `fixedBadgeAfter` reads `kind`, so no badge.
 */
export function checkingOutcomeOf(gate: FixitOutcome): FixitOutcome {
  if (gate.kind !== 'fixed') return gate;
  /*
   * Spread from the gate, so any field the classification carries beside the five below — whose
   * run the narration is about, say — travels with it rather than being dropped by this wrapper.
   */
  return {
    ...gate,
    kind: 'checking',
    head: JUDGE_COPY.checkingHead,
    body: JUDGE_COPY.checkingBody,
    rows: gate.rows,
    basis: gate.basis,
  };
}

/**
 * The verdict once the mornings are in, or once a futility look stopped them.
 *
 * A gate that did not clear is returned unchanged — replication never ran. A gate that cleared and
 * held keeps its own head and body (the letter's morning's narration, whatever decides it) with the
 * fourth row and the replicated basis beside it. One that did not hold is `cleared-once`, and so is
 * a check stopped for futility, whose body says where it stopped and claims counts only.
 */
export function judgedOutcomeOf(entry: FixitCase, gate: FixitOutcome, replication: FixitReplication): FixitOutcome {
  if (gate.kind !== 'fixed') return gate;
  const [complaintRow, restRow, spentRow] = gate.rows;
  const rows = [complaintRow, restRow, spentRow, replicationRowOf(entry, replication)] as const;
  const basis = basisAfterReplication(gate, replication);
  if (replication.holds) return { ...gate, body: bodyWithRestOf(entry, gate, replication), rows, basis };
  const measure = entry.complaint.measure;
  const why =
    replication.stoppedAt !== undefined
      ? `On the other mornings ${futilityClause(replication)}.`
      : replication.complaintHolds
        ? `Over the other forty-nine mornings ${restClause(replication)}.`
        : `Over the other forty-nine mornings ${reductionClause(measure, replication)}.`;
  return {
    ...gate,
    kind: 'cleared-once',
    head: JUDGE_COPY.clearedOnceHead,
    body: `${why} ${JUDGE_COPY.clearedOnceClosing}`,
    rows,
    basis,
  };
}

/**
 * The authored body with its **rest** line, gated on the fifty mornings — `types.ts#FixitResultCopy`.
 *
 * Only on the authored arm (the witness's own run), and only when the case authors a `rest` line. The
 * line is a claim that the rest of the building did not notice the fix, and it prints only when the
 * rest's fifty-morning interval contains zero. Where the interval excludes zero the measured sentence
 * prints in its place, in the row's own figures, so the card never says *never noticed* above a row
 * that shows a change. Where nobody else rode on enough mornings there is no interval, and neither
 * prints: a claim about nobody is not a claim.
 *
 * The line goes straight after the authored body and before anything the engine appended to it
 * (`engine.ts#spentAnywayClause`), which is where the authored sentence stood before it was split out.
 */
function bodyWithRestOf(entry: FixitCase, gate: FixitOutcome, replication: FixitReplication): string {
  const authored = entry.result.rest;
  if (authored === undefined || gate.attribution !== 'diagnosis') return gate.body;
  if (!gate.body.startsWith(entry.result.body)) return gate.body;
  const sentence = restSentenceOf(authored, replication.rest);
  if (sentence === '') return gate.body;
  return `${entry.result.body} ${sentence}${gate.body.slice(entry.result.body.length)}`;
}

/** The authored rest line where the interval contains zero, the measured one where it does not. */
function restSentenceOf(authored: string, rest: PairedInterval | null): string {
  if (rest === null) return '';
  if (rest.lower <= 0 && rest.upper >= 0) return authored;
  return (
    `The rest of the building did notice: its share away inside a minute moved ${signed(rest.mean, 1)} ` +
    `points a morning over ${String(rest.n)} mornings (95 % interval ${signed(rest.lower, 1)} to ` +
    `${signed(rest.upper, 1)}), which is not shown worse than the ${String(REST_DROP_LIMIT_POINTS)}-point floor.`
  );
}

/* -------------------------------------------------------------------------- *
 * Running the mornings — the orchestration both surfaces share
 * -------------------------------------------------------------------------- */

/** One ask of the morning runner: configs in, one reading per config out, in order. */
export interface MorningAsk {
  readonly configs: readonly [SimulationConfig, ...SimulationConfig[]];
  readonly measure: ComplaintMeasure;
  /**
   * Each reading as it lands, by its index in {@link configs} — [§ D1120](../../../../DECISIONS.md).
   * Optional, because a runner that answers all at once (a test's, or a synchronous census) is still
   * a correct runner: the judge reaches the same verdict either way. A handler may cancel the runner.
   */
  readonly onReading?: (index: number, reading: MorningReading) => void;
  readonly onDone: (readings: readonly MorningReading[]) => void;
  readonly onFailed: (message: string) => void;
}

/**
 * What `dev/offThreadMornings.ts` provides and a test fakes. Its protocol is `dev/offThreadRuns.ts`'s:
 * the latest ask wins, and a superseded or cancelled ask is silent.
 */
export interface MorningRunner {
  start(ask: MorningAsk): void;
  cancel(): void;
  isRunning(): boolean;
}

/**
 * The as-built mornings a build ships for a case, or `undefined` when it ships none that match —
 * `fixit/asBuiltMornings.ts#shippedAsBuiltMorningsOf`, passed rather than imported so this module
 * reads no data file and a test can hand it anything.
 */
export type ShippedMornings = (entry: FixitCase, asBuilt: SimulationConfig) => readonly MorningReading[] | undefined;

export interface FixitJudgeOptions {
  /** [§ D1120](../../../../DECISIONS.md) clause 4: the derived artifact that makes no press cold. */
  readonly shipped?: ShippedMornings;
}

export interface FixitJudge {
  /**
   * Start the case's forty-nine as-built mornings if they are neither held, shipped, nor in flight.
   * Called when a case opens; never supersedes a press's replication.
   */
  prepare(entry: FixitCase, asBuilt: SimulationConfig): void;
  /** Whether the as-built mornings for this case are held — asked for and landed, or shipped. */
  prepared(entry: FixitCase): boolean;
  /**
   * Run the order's forty-nine after-mornings and judge them against the as-built forty-nine, with
   * the futility looks. Asks for the as-built mornings in the same breath when they are neither held
   * nor shipped, and waits on them when they are already in flight. `onProgress` hears every morning
   * that lands, as a count and a mark.
   */
  replicate(
    entry: FixitCase,
    plan: FixitRunPlan,
    onJudged: (replication: FixitReplication) => void,
    onFailed: (message: string) => void,
    onProgress?: (progress: MorningProgress) => void,
  ): void;
  /** Whether a replication is in flight. */
  replicating(): boolean;
  /**
   * Stop a replication in flight, silently: its `onJudged` never fires. What a surface calls when a
   * new press supersedes a check (§ D1120 clause 4's *the latest ask wins*).
   */
  cancel(): void;
}

/** The as-built mornings depend on the case's run and nothing a player sets, so this is their key. */
function morningsKeyOf(entry: FixitCase): string {
  return `${entry.id}|${entry.run.seed}|${String(entry.run.durationS)}|${String(entry.run.arrivalRatePctPop5min)}`;
}

function nonEmpty(configs: SimulationConfig[]): readonly [SimulationConfig, ...SimulationConfig[]] {
  if (configs.length === 0) throw new Error('fixit judge: an empty morning ask is a caller bug.');
  return configs as unknown as readonly [SimulationConfig, ...SimulationConfig[]];
}

/** Interleave two equal lists, a[0], b[0], a[1], b[1], … — so a cold check's pairs land together. */
function interleave<T>(a: readonly T[], b: readonly T[]): T[] {
  return a.flatMap((item, index) => [item, b[index]!]);
}

export function createFixitJudge(runner: MorningRunner, options: FixitJudgeOptions = {}): FixitJudge {
  const held = new Map<string, readonly MorningReading[]>();
  /** What the runner is doing now — at most one ask, by `MorningRunner`'s protocol. */
  let flight: { readonly kind: 'prepare' | 'replicate'; readonly key: string } | undefined;
  /** A replication waiting on the prepare already in flight for the same case. */
  let waiting: (() => void) | undefined;
  /** Bumped by every replication and every cancel, so a superseded check's callbacks go quiet. */
  let generation = 0;

  /** Held, or shipped and now held. */
  function heldFor(entry: FixitCase, asBuilt: SimulationConfig): readonly MorningReading[] | undefined {
    const key = morningsKeyOf(entry);
    const cached = held.get(key);
    if (cached !== undefined) return cached;
    const shipped = options.shipped?.(entry, asBuilt);
    if (shipped !== undefined && shipped.length === DERIVED_MORNINGS) {
      held.set(key, shipped);
      return shipped;
    }
    return undefined;
  }

  function startPrepare(entry: FixitCase, asBuilt: SimulationConfig): void {
    const key = morningsKeyOf(entry);
    flight = { kind: 'prepare', key };
    waiting = undefined;
    runner.start({
      configs: nonEmpty(morningConfigsOf(asBuilt, replicationSeedsOf(entry))),
      measure: entry.complaint.measure,
      onDone: (readings) => {
        flight = undefined;
        held.set(key, readings);
        const next = waiting;
        waiting = undefined;
        next?.();
      },
      onFailed: () => {
        flight = undefined;
        /* A prepare that failed is retried by the replication that needs it, which says why. */
        const next = waiting;
        waiting = undefined;
        next?.();
      },
    });
  }

  return {
    prepare(entry, asBuilt) {
      const key = morningsKeyOf(entry);
      if (heldFor(entry, asBuilt) !== undefined) return;
      if (flight !== undefined && (flight.kind === 'replicate' || flight.key === key)) return;
      startPrepare(entry, asBuilt);
    },

    prepared(entry) {
      return held.has(morningsKeyOf(entry));
    },

    replicating() {
      return flight?.kind === 'replicate' || waiting !== undefined;
    },

    cancel() {
      generation += 1;
      waiting = undefined;
      if (flight?.kind === 'replicate') {
        flight = undefined;
        runner.cancel();
      }
    },

    replicate(entry, plan, onJudged, onFailed, onProgress) {
      generation += 1;
      const mine = generation;
      const key = morningsKeyOf(entry);
      const seeds = replicationSeedsOf(entry);
      const measure = entry.complaint.measure;
      const count = seeds.length;
      const before: (MorningReading | undefined)[] = new Array<MorningReading | undefined>(count);
      const after: (MorningReading | undefined)[] = new Array<MorningReading | undefined>(count);
      /** The index into {@link FUTILITY_LOOKS} of the next look not yet taken. */
      let nextLook = 0;
      let settled = false;
      const live = (): boolean => mine === generation && !settled;

      const settle = (replication: FixitReplication): void => {
        settled = true;
        flight = undefined;
        onJudged(replication);
      };

      /**
       * Take every look the contiguous prefix of landed pairs now covers, in order. A look that
       * finds the check futile stops the runner and settles; the same looks over the same prefixes
       * are what {@link judgeMornings} takes at the end, so streaming changes when a verdict lands
       * and never which.
       */
      const look = (): void => {
        let prefix = 0;
        while (prefix < count && before[prefix] !== undefined && after[prefix] !== undefined) prefix += 1;
        while (nextLook < FUTILITY_LOOKS.length && FUTILITY_LOOKS[nextLook]! <= prefix) {
          const at = FUTILITY_LOOKS[nextLook]!;
          nextLook += 1;
          if (at >= count) continue;
          const b = before.slice(0, at) as MorningReading[];
          const a = after.slice(0, at) as MorningReading[];
          if (futileAt(b, a, at)) {
            runner.cancel();
            settle(futilityStopOf(b, a, at, count));
            return;
          }
        }
      };

      const landed = (): void => {
        if (!live()) return;
        onProgress?.(progressOf(before, after));
        look();
      };

      const finish = (b: readonly MorningReading[], a: readonly MorningReading[]): void => {
        if (!live()) return;
        settle(judgeMornings(b, a));
      };

      const afterOnly = (asBuilt: readonly MorningReading[]): void => {
        asBuilt.forEach((reading, index) => {
          before[index] = reading;
        });
        flight = { kind: 'replicate', key };
        onProgress?.(progressOf(before, after));
        runner.start({
          configs: nonEmpty(morningConfigsOf(plan.asRepaired, seeds)),
          measure,
          onReading: (index, reading) => {
            after[index] = reading;
            landed();
          },
          onDone: (readings) => {
            if (!live()) return;
            flight = undefined;
            finish(asBuilt, readings);
          },
          onFailed: (message) => {
            if (!live()) return;
            flight = undefined;
            settled = true;
            onFailed(message);
          },
        });
      };
      /*
       * Cold: both sides in one ask, **interleaved** — as-built then after, morning by morning — so
       * each morning's pair lands together and the looks can be taken while the check runs. Before
       * § D1120 the forty-nine as-built runs came first and no pair was complete until the fiftieth
       * reading.
       */
      const both = (): void => {
        flight = { kind: 'replicate', key };
        waiting = undefined;
        onProgress?.(progressOf(before, after));
        runner.start({
          configs: nonEmpty(interleave(morningConfigsOf(plan.asBuilt, seeds), morningConfigsOf(plan.asRepaired, seeds))),
          measure,
          onReading: (index, reading) => {
            if (index % 2 === 0) before[index >> 1] = reading;
            else after[index >> 1] = reading;
            landed();
          },
          onDone: (readings) => {
            if (!live()) return;
            flight = undefined;
            const asBuilt = readings.filter((_, index) => index % 2 === 0);
            const repaired = readings.filter((_, index) => index % 2 === 1);
            held.set(key, asBuilt);
            finish(asBuilt, repaired);
          },
          onFailed: (message) => {
            if (!live()) return;
            flight = undefined;
            settled = true;
            onFailed(message);
          },
        });
      };

      const cached = heldFor(entry, plan.asBuilt);
      if (cached !== undefined) {
        afterOnly(cached);
        return;
      }
      if (flight?.kind === 'prepare' && flight.key === key) {
        waiting = () => {
          if (mine !== generation) return;
          const arrived = held.get(key);
          if (arrived !== undefined) afterOnly(arrived);
          else both();
        };
        return;
      }
      both();
    },
  };
}

/* -------------------------------------------------------------------------- *
 * A press, through the gate and the judge — what both surfaces call
 * -------------------------------------------------------------------------- */

/** The structural half of `dev/offThreadRuns.ts#OffThreadRunnerHandle` a press uses. */
export interface PairRunner {
  start(ask: {
    readonly runs: readonly [
      { readonly config: SimulationConfig; readonly outOfServiceCarIds: readonly string[]; readonly recordDecisions: boolean },
      ...{ readonly config: SimulationConfig; readonly outOfServiceCarIds: readonly string[]; readonly recordDecisions: boolean }[],
    ];
    readonly onDone: (recordings: readonly VizRecording[]) => void;
    readonly onFailed: (message: string) => void;
  }): void;
}

export interface JudgedPress {
  readonly entry: FixitCase;
  readonly plan: FixitRunPlan;
  /** `fixit/run.ts#FIXIT_RUN_SWITCHES`, passed rather than imported so this module runs nothing. */
  readonly switches: { readonly outOfServiceCarIds: readonly string[]; readonly recordDecisions: boolean };
  readonly pairRunner: PairRunner;
  readonly judge: FixitJudge;
  /**
   * Classify the letter's pair into § 10.4's outcomes. A continuation rather than a return, so a
   * surface whose classification needs a further run (the diagnosed repair's own, to decide the
   * narration) can take it before answering.
   */
  readonly classify: (before: VizRecording, after: VizRecording, done: (gate: FixitOutcome) => void) => void;
  /**
   * The letter's morning has an answer: the gate's own outcome when it did not clear, or the
   * {@link checkingOutcomeOf} state when it did. Drawn at once.
   */
  readonly onGate: (outcome: FixitOutcome, before: VizRecording, after: VizRecording) => void;
  /** A derived morning landed — the live count and the marks, § D1120 clause 4. Optional. */
  readonly onProgress?: (progress: MorningProgress) => void;
  /** The mornings are in, or a futility look stopped them. Only ever called after an `onGate` carrying `checking`. */
  readonly onVerdict: (outcome: FixitOutcome) => void;
  readonly onFailed: (message: string) => void;
}

/**
 * One press: the pair, the gate, and — only when the gate clears — the mornings.
 *
 * So a press whose gate fails asks for exactly one pair, and one whose gate clears asks for one pair
 * and at most forty-nine after-runs (plus the forty-nine as-built mornings when the case's own are
 * neither shipped nor held), fewer when a futility look stops the check. `judge.test.ts` counts all
 * of it with fake runners, which is the structural guard on the cost claim in the module docstring.
 *
 * **The letter's pair is not part of the interval** (§ D1120 clause 2): the gate judges it, and the
 * judge reads the derived mornings alone.
 */
export function pressThroughTheJudge(press: JudgedPress): void {
  const { entry, plan, switches } = press;
  press.pairRunner.start({
    runs: [
      { config: plan.asBuilt, ...switches },
      { config: plan.asRepaired, ...switches },
    ],
    onDone: ([before, after]) => {
      if (before === undefined || after === undefined) return;
      /*
       * A classification that throws — the surfaces hold the pair's crowd claim to its legs first,
       * and that check throws on a disagreement — is a failed press, said where the reader is. It
       * used to escape the worker's callback, and the § 3.3 primary stayed *Running the day…* for
       * good: measured on `every-deck-calls-itself-full`, whose zoning step moves the crowd.
       */
      try {
        classifyThenJudge(before, after);
      } catch (error) {
        press.onFailed(error instanceof Error ? error.message : String(error));
      }
    },
    onFailed: press.onFailed,
  });

  function classifyThenJudge(before: VizRecording, after: VizRecording): void {
    press.classify(before, after, (gate) => {
      if (gate.kind !== 'fixed') {
        press.onGate(gate, before, after);
        return;
      }
      press.onGate(checkingOutcomeOf(gate), before, after);
      press.judge.replicate(
        entry,
        plan,
        (replication) => press.onVerdict(judgedOutcomeOf(entry, gate, replication)),
        press.onFailed,
        press.onProgress,
      );
    });
  }
}
