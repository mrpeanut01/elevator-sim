/**
 * **Every day ends pointing at tomorrow** — wave AM, lane AM-C, swarm DO's § 1 ruling (three of
 * three), [§ D1246](../../../../DECISIONS.md) to [§ D1249](../../../../DECISIONS.md).
 *
 * ## What was wrong
 *
 * The post-AL panel's seat A found the next day's button about 3 900 px down the Everyday report,
 * under *Return to Main Menu*, and the swarm's S2 measured the close at 1 381 to 1 823 words that
 * never named tomorrow's wrinkle, never said whether tomorrow counts, and never said how today
 * went against the house, although `dev/main.ts#askWeekHouse` starts that run at each counted
 * close (§ D1227). The one stake the panels felt waited until Sunday, and a week whose target could
 * no longer be met still read *1 of 4 clean shifts banked* with nothing more.
 *
 * ## What the close leads with, in the ruling's order
 *
 * 1. **Today against the house**, with the week's running tally beside it.
 * 2. **The call that decided it**, where one did, read from the call rows' own runs; where none
 *    did, a plain sentence saying so, and on a counted day what did decide it: the driver, the
 *    presses or nothing, read off the driver run and the house (wave AN, lane DQ-3,
 *    [§ D1351](../../../../DECISIONS.md), {@link dayDeciderOf}).
 * 3. **The week's arithmetic**: what the target still needs of the counted days left, that it is
 *    met, or that it is out of reach while the tally against the house stays open.
 * 4. **Tomorrow in full**: its wrinkle and when, who moves in, whether it counts, and the census's
 *    measured rate for the tower's standing order left alone on that day.
 *
 * ## Every line is a count or a schedule fact, and none is a forecast
 *
 * - The house line and the tally are the sheet's own join (`weekStake.ts#houseReadingOfDay`), so
 *   they read *still being run* until the run answers and never a guessed verdict.
 * - The deciding call is read off runs that were made: a call's three runs from its instant, each
 *   with every earlier press kept and nothing pressed after (`dayCalls.ts#DayCallRecord`), graded by
 *   the report's own grader. The sentence names those conditions, because the filed day may carry
 *   later presses those runs do not.
 * - What decided a day no call decided is read off two runs the shell made of the day's own crowd
 *   (the standing order picked in place of the day's driver with every press kept, and the house),
 *   graded against the day's own goals, and reads *still being run* until they answer.
 * - Tomorrow's wrinkle, its note and its tenants are read off tomorrow's own run config through the
 *   report (`report.ts#WeekDayReport.onward`, derived as the run is), and the census line is a count
 *   over the crowds the census measured, worded as that and never as how the player's day will go
 *   (swarm DN's Q1(d) refusal and S1's refusal, honoured).
 *
 * Pure: no clock, no RNG, no simulation. `everyday/reportView.ts` is its non-test caller, and
 * `dev/main.ts#closeShift` calls {@link dayDeciderOf} at the close, so the shell starts the driver
 * run through the decision that reads it; the one effect is the shell's, behind `driverOf`.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import { clockAt } from '../live/timeline.js';

import { carsOutLineOf, wrinkleNoteOf } from './bookedOut.js';
import { pooledCrowdOf, poolCloseLineOf } from './poolWays.js';
import type { PoolCrowd } from './weekPool.js';
import { dayCallAnswerWordsOf, dayCallAnswersOf, type DayCallAnswer, type DayCallRecord } from './dayCalls.js';
import type { WeekDayReport } from './report.js';
import type { OnwardDay } from './tomorrow.js';
import {
  countedCleanOf,
  dayCountsToward,
  dayStakeSentenceOf,
  dayVerdictOf,
  driverRunNeedOf,
  houseNeedOf,
  houseReadingOfDay,
  weekDealOf,
  weekOrdinalOf,
  type HouseReading,
} from './weekStake.js';
import { clearsIn, WEEK_WAY, type WeekWay } from './weekWay.js';
import { weekdayOf, type Observations, type WeekState } from './types.js';

/* -------------------------------------------------------------------------- *
 * The call that decided it
 * -------------------------------------------------------------------------- */

/** A day's verdict, as the grader reads it. */
export type CloseVerdict = 'cleared' | 'missed' | 'ungraded';

/**
 * The pinned press day's call, played as it was measured (`callRow.ts#pressCallRowOf` draws a row
 * for exactly these), in the terms the deciding sentence needs.
 */
export interface DecidingPinnedCall {
  readonly atS: SimTime;
  /** The press measured to clear the day at every moment tried, and the one measured to miss it. */
  readonly clearedBy: string;
  readonly missedBy: string;
  /** What was pressed at the call: one of the two, or nothing. */
  readonly answered: string | undefined;
  /**
   * Whether the day was skipped past the call with its card up and nothing pressed (§ D1151), so
   * the sentence says what the row says (`callRow.ts#PRESS_CALL_SKIPPED_WHAT`).
   */
  readonly skipped?: boolean | undefined;
}

export interface DecidingCallInput {
  /** The filed day's verdict. */
  readonly verdict: CloseVerdict;
  readonly records: readonly DayCallRecord[];
  readonly pinned?: DecidingPinnedCall | undefined;
  /** The report's own grader over a call's run — `verdictOf(readGoals(goals, observations))`. */
  readonly verdictOf: (observations: Observations) => CloseVerdict;
  /** The report's own words for a verdict — `VERDICT_VOICE[verdict].line`. */
  readonly lineOf: (verdict: CloseVerdict) => string;
  readonly clockOf: (simTimeS: SimTime) => string;
}

/** `a`, `a or b`, `a, b or c`. */
function orList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} or ${String(parts[parts.length - 1])}`;
}

/** `a`, `a and b`, `a, b and c`. */
function andList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${String(parts[parts.length - 1])}`;
}

/** A pinned press's words, lower-cased for the middle of a sentence — the call row's own labels. */
function pressWordsOf(kind: string): string {
  return dayCallAnswerWordsOf(
    { atS: 0, windowEndS: 0, answer: 'leave', counts: {}, observations: {} },
    kind as DayCallAnswer,
  );
}

/** *No call decided today* when calls were raised and none of their other answers moved the verdict. */
export const NO_CALL_DECIDED_LINE =
  'No call decided today: at each of today’s calls, the other answers, run on this crowd from the ' +
  'call with nothing pressed after it, left the day’s verdict where it was.';

/** The same, on a day the stage raised no call. */
export const NO_CALL_RAISED_LINE = 'No call decided today: the stage raised none.';

/** {@link decidingCallOf}'s answer: the sentence, and whether a call decided the day. */
export interface DecidingCall {
  readonly line: string;
  /**
   * `true` where a call's other answer read the other verdict; `false` where calls were raised and
   * none did, or none was raised. The close reads `false` as *say what did* ({@link dayDeciderOf}).
   */
  readonly decided: boolean;
}

/**
 * **The call that decided today**, or the plain sentence that none did — swarm DO's § 1 ruling,
 * item 2, [§ D1248](../../../../DECISIONS.md). `undefined` on a day nobody graded, which has no
 * verdict to decide.
 *
 * A call decided the day when one of its **other** answers, run on this crowd from the call with
 * every earlier press kept and nothing pressed after, reads a different verdict from the day that
 * was filed. Where several calls did, the latest is named, because the fewest later presses stand
 * between its runs and the filed day, and the count of the others is said beside it.
 *
 * Whether a call decided the day is answered beside the sentence — wave AN, lane DQ-3,
 * [§ D1351](../../../../DECISIONS.md). `report.ts` files both (`WeekDayReport.decidingCall`,
 * `WeekDayReport.callDecided`), and the close's one decision reads them; this was
 * `decidingCallLineOf`, which answered the sentence alone and left the close to match its words.
 */
export function decidingCallOf(input: DecidingCallInput): DecidingCall | undefined {
  const { verdict } = input;
  if (verdict === 'ungraded') return undefined;
  const decided: {
    readonly atS: number;
    readonly at: string;
    readonly chose: string;
    readonly others: readonly string[];
    readonly reads: CloseVerdict;
  }[] = [];

  const pinned = input.pinned;
  if (pinned !== undefined) {
    const at = input.clockOf(pinned.atS);
    const other =
      pinned.answered === pinned.clearedBy
        ? { words: pressWordsOf(pinned.missedBy), reads: 'missed' as const }
        : pinned.answered === pinned.missedBy
          ? { words: pressWordsOf(pinned.clearedBy), reads: 'cleared' as const }
          : verdict === 'missed'
            ? { words: pressWordsOf(pinned.clearedBy), reads: 'cleared' as const }
            : { words: pressWordsOf(pinned.missedBy), reads: 'missed' as const };
    if (other.reads !== verdict) {
      decided.push({
        atS: pinned.atS,
        at,
        chose:
          pinned.answered !== undefined
            ? `you chose ${pressWordsOf(pinned.answered)}`
            : pinned.skipped === true
              ? 'the day was skipped past the call'
              : 'nothing was pressed',
        others: [other.words],
        reads: other.reads,
      });
    }
  }

  for (const record of input.records) {
    const played: DayCallAnswer = record.answer === 'skipped' ? 'leave' : record.answer;
    const flipped = new Map<CloseVerdict, string[]>();
    for (const answer of dayCallAnswersOf(record.question ?? 'placement')) {
      if (answer === played) continue;
      const observations = record.observations[answer];
      if (observations === undefined) continue;
      const reads = input.verdictOf(observations);
      if (reads === 'ungraded' || reads === verdict) continue;
      flipped.set(reads, [...(flipped.get(reads) ?? []), dayCallAnswerWordsOf(record, answer)]);
    }
    for (const [reads, others] of flipped) {
      decided.push({
        atS: record.atS,
        at: input.clockOf(record.atS),
        chose:
          record.answer === 'skipped'
            ? 'the day was skipped past the call'
            : `you chose ${dayCallAnswerWordsOf(record, played)}`,
        others,
        reads,
      });
    }
  }

  /* In the day's order, so the deciding call is the last that could turn it and the rest came before it. */
  decided.sort((a, b) => a.atS - b.atS);
  const last = decided.at(-1);
  if (last === undefined) {
    return {
      line: input.records.length === 0 && pinned === undefined ? NO_CALL_RAISED_LINE : NO_CALL_DECIDED_LINE,
      decided: false,
    };
  }
  /*
   * **The earlier calls are named** — [§ D1379](../../../../DECISIONS.md), the post-AN panel's seat B
   * (defect 7). It read *1 earlier call today could have turned it too* and never said which, so a
   * player could not find it among the day's rows. Each is named by its clock, as its row is.
   */
  const earlier = [...new Set(decided.slice(0, -1).map((entry) => entry.at))];
  const more =
    earlier.length === 0
      ? ''
      : ` The ${earlier.length === 1 ? 'call' : 'calls'} at ${andList(earlier)} could have turned it too.`;
  return {
    line:
      `The call that decided today came at ${last.at}, where ${last.chose}: on this crowd, the day run ` +
      `from ${last.at} with ${orList(last.others)} and nothing pressed after it read ${input.lineOf(last.reads)}.${more}`,
    decided: true,
  };
}

/* -------------------------------------------------------------------------- *
 * What decided it, when no call did — § D1351
 * -------------------------------------------------------------------------- */

/** A verdict the driver run or the house can read, graded. */
type Graded = 'cleared' | 'missed';

/**
 * **What decided a day no call decided**, as one value — wave AN, lane DQ-3, swarm DQ's Q2 rule 3
 * (three of three), [§ D1351](../../../../DECISIONS.md). {@link dayDeciderOf} is the one decision;
 * the close's call line is {@link dayDeciderLineOf} over it, and the shell asks the driver run
 * exactly when this asks for its reading.
 *
 * - `'call'`: a call decided it, and the report's sentence names it.
 * - `'unsaid'`: no run here speaks, so the report's *No call decided today* stands alone: a day that
 *   does not count (the house is not run on it), a tower the census does not speak for, a day that
 *   kept no record, a day that ran the standing order untouched (there is nothing to swap) and a run
 *   nobody could grade.
 * - `'driver'`: the driver run, the same day with the standing order picked in place of the day's
 *   driver and every press kept, reads the other verdict.
 * - `'presses'`: the driver run reads the day's verdict, and the house, the standing order left
 *   alone, reads the other one. So under the house's driver the presses turn it, and swapping the
 *   driver alone does not.
 * - `'nothing'`: the house reads the day's verdict, and so does the driver run.
 * - `'pending'`: a run the answer needs is still being run. `known` is the driver run's verdict
 *   where it has answered and the house has not.
 * - `'unrun'`: a run the answer needs could not be run on this crowd.
 */
export type DayDecider =
  | { readonly kind: 'call' }
  | { readonly kind: 'unsaid' }
  | { readonly kind: 'driver'; readonly pressed: boolean; readonly reads: Graded }
  | { readonly kind: 'presses'; readonly houseDrove: boolean; readonly kept: Graded; readonly alone: Graded }
  | { readonly kind: 'nothing'; readonly pressed: boolean; readonly houseDrove: boolean; readonly reads: Graded }
  | { readonly kind: 'pending'; readonly waiting: 'driver-run' | 'house'; readonly known?: Graded | undefined }
  | { readonly kind: 'unrun'; readonly run: 'driver-run' | 'house'; readonly known?: Graded | undefined };

/** What {@link dayDeciderOf} reads. Every field is somebody else's measurement. */
export interface DayDeciderInput {
  /** The week the sheet stands on: after `closeDay`. */
  readonly week: WeekState;
  /** The filed sheet's call half — `report.ts` writes both from `decidingCallOf`. */
  readonly report: Pick<WeekDayReport, 'decidingCall' | 'callDecided'>;
  /** The shell's house runs, per counted day — `EverydayHost.weekHouse`. */
  readonly houseOf: (day: number) => HouseReading | undefined;
  /**
   * The shell's driver run on a counted day — `EverydayHost.weekDriverRun`, `undefined` until it
   * answers. **Asked only where the answer needs it**: on a counted day no call decided, whose driver
   * is not the house's and which has presses, so the shell starts the run on this call and on no other.
   */
  readonly driverOf?: ((day: number) => HouseReading | undefined) | undefined;
}

/** Graded, or `undefined` for every reading that is not a verdict. */
function gradedOf(reading: HouseReading | CloseVerdict): Graded | undefined {
  return reading === 'cleared' || reading === 'missed' ? reading : undefined;
}

/** See {@link DayDecider}. Pure: the only effect is the shell's, behind {@link DayDeciderInput.driverOf}. */
export function dayDeciderOf(input: DayDeciderInput, census: WeekWay = WEEK_WAY): DayDecider {
  const { week, report } = input;
  if (report.callDecided !== false) return report.callDecided === true ? { kind: 'call' } : { kind: 'unsaid' };
  const today = week.history.find((entry) => entry.day === week.day);
  if (today === undefined || weekDealOf(week, census) === undefined || !dayCountsToward(week, today, census)) {
    return { kind: 'unsaid' };
  }
  const yours = gradedOf(dayVerdictOf(today));
  const need = driverRunNeedOf(today, census);
  if (yours === undefined || need === 'unrecorded' || need === 'own') return { kind: 'unsaid' };
  const house = houseReadingOfDay(today, input.houseOf, census);

  /* The driver run's reading: the day itself, the house's own run, or one more run. */
  if (need !== 'same') {
    const reading: HouseReading = need === 'house' ? house : (input.driverOf?.(today.day) ?? 'pending');
    const run = need === 'house' ? 'house' : 'driver-run';
    if (reading === 'pending') return { kind: 'pending', waiting: run };
    if (reading === 'unrecorded') return { kind: 'unrun', run };
    const swapped = gradedOf(reading);
    if (swapped === undefined) return { kind: 'unsaid' };
    if (swapped !== yours) return { kind: 'driver', pressed: need === 'run', reads: swapped };
    if (need === 'house') return { kind: 'nothing', pressed: false, houseDrove: false, reads: yours };
  }

  /* The driver did not turn it (or drove as the house's): the house says whether the presses did. */
  const known = need === 'run' ? yours : undefined;
  if (house === 'pending') return { kind: 'pending', waiting: 'house', known };
  if (house === 'unrecorded') return { kind: 'unrun', run: 'house', known };
  const alone = gradedOf(house);
  if (alone === undefined) return { kind: 'unsaid' };
  return alone !== yours
    ? { kind: 'presses', houseDrove: need === 'same', kept: yours, alone }
    : { kind: 'nothing', pressed: true, houseDrove: need === 'same', reads: yours };
}

/** The close's words for a graded run — the call line's own *read Shift cleared* vocabulary. */
const READ_WORDS: Readonly<Record<Graded, string>> = Object.freeze({
  cleared: 'Shift cleared',
  missed: 'Shift missed',
});

/** The driver run, as the close names it. */
const SWAPPED = 'the same day with the tower’s standing order picked in place of yours';

/** *Your driver did not* — said before the house's half wherever the driver run answered and the day had presses. */
function driverDidNot(reads: Graded): string {
  return `Your driver did not: on this crowd, ${SWAPPED} and every press kept read ${READ_WORDS[reads]} too.`;
}

/**
 * **The sentence that says what decided a day no call decided**, or `undefined` where
 * {@link dayDeciderOf} says nothing beyond the report's own line. Every arm states the runs it read
 * and the crowd they ran on, and none says which driver or press is better anywhere else.
 */
export function dayDeciderLineOf(decider: DayDecider): string | undefined {
  switch (decider.kind) {
    case 'call':
    case 'unsaid':
      return undefined;
    case 'driver':
      return `Your driver did: on this crowd, ${SWAPPED}${decider.pressed ? ' and every press kept' : ''} read ${READ_WORDS[decider.reads]}.`;
    case 'presses':
      return decider.houseDrove
        ? `Your presses did, together: on this crowd, the tower’s standing order left alone read ${READ_WORDS[decider.alone]}.`
        : `${driverDidNot(decider.kept)} Your presses did, together: left alone, the tower’s standing order read ${READ_WORDS[decider.alone]}.`;
    case 'nothing':
      return decider.pressed && !decider.houseDrove
        ? `Nothing you chose decided it either: on this crowd, the tower’s standing order read ${READ_WORDS[decider.reads]} too, both with every press kept and left alone.`
        : `Nothing you chose decided it either: on this crowd, the tower’s standing order left alone read ${READ_WORDS[decider.reads]} too.`;
    case 'pending':
      if (decider.waiting === 'driver-run') return `What decided it is still being run: ${SWAPPED} and every press kept.`;
      return decider.known === undefined
        ? 'What decided it waits on the house, which is still being run.'
        : `${driverDidNot(decider.known)} Whether your presses did waits on the house, which is still being run.`;
    case 'unrun':
      if (decider.run === 'driver-run') {
        return `What decided it is not said: ${SWAPPED} could not be run on this crowd.`;
      }
      return decider.known === undefined
        ? 'What decided it is not said: the house could not be run on this crowd.'
        : `${driverDidNot(decider.known)} Whether your presses did is not said: the house could not be run on this crowd.`;
  }
}

/**
 * **The close's call line**: the report's sentence, and after it what decided the day where no call
 * did — the one decision {@link dayDeciderOf} takes. `undefined` on a day nobody graded.
 */
export function closeCallLineOf(input: DayDeciderInput, census: WeekWay = WEEK_WAY): string | undefined {
  const lead = input.report.decidingCall;
  if (lead === undefined) return undefined;
  const more = dayDeciderLineOf(dayDeciderOf(input, census));
  return more === undefined ? lead : `${lead} ${more}`;
}

/* -------------------------------------------------------------------------- *
 * The close
 * -------------------------------------------------------------------------- */

/** What {@link dayCloseOf} reads. Every field is somebody else's measurement. */
export interface DayCloseInput {
  /** The week the sheet stands on: after `closeDay`, before tomorrow opens. */
  readonly week: WeekState;
  /** The filed sheet. */
  readonly report: WeekDayReport;
  /** The shell's house runs, per counted day — `EverydayHost.weekHouse`. */
  readonly houseOf: (day: number) => HouseReading | undefined;
  /**
   * The two measured populations the between-day beat carries — today's building and tomorrow's,
   * each resolved through the run's own chain (`shift/tomorrow.ts`). Read only where tomorrow is the
   * next day on the path; `undefined` draws the report's own tenants line instead.
   */
  readonly population?: { readonly today: number; readonly tomorrow: number } | undefined;
  /**
   * **The day the card names, measured on its own plan** — `shift/tomorrow.ts#TomorrowBriefing.onward`
   * (wave AN, lane AN-7): its tenants beside today's, every car its run takes out of passenger
   * service, and where its clock starts. Read before {@link population} wherever given, and on the
   * close that closed the week, where `population` is the literal tomorrow and this is the next
   * week's Monday.
   */
  readonly onward?: OnwardDay | undefined;
  /**
   * **The shell's driver run per counted day** — `EverydayHost.weekDriverRun`, wave AN, lane DQ-3
   * ([§ D1351](../../../../DECISIONS.md)). Read only through {@link dayDeciderOf}, which asks it
   * only where the call line needs it. Absent, the run is *still being run*.
   */
  readonly driverOf?: ((day: number) => HouseReading | undefined) | undefined;
  /** Display names for the pool line's drivers (§ D1463); absent, the line names profile ids. */
  readonly profileNameOf?: ((profileId: string) => string | undefined) | undefined;
}

/** Tomorrow, whole — item 4. */
export interface DayCloseTomorrow {
  /** `TOMORROW · WEEK 1 · THURSDAY, DAY 4`, or the next week's Monday once the week has closed. */
  readonly heading: string;
  /** `Conference: …` — the wrinkle by name, and its note, which carries its clock window where it has one. */
  readonly wrinkle: string;
  /** Who moves in, measured on the two buildings or read off the report's own tenants line. */
  readonly moveIns: string;
  /**
   * Every car the day's run takes out of passenger service, with its clock times, in one line
   * (`bookedOut.ts#carsOutLineOf`); `undefined` where none is out or the day was not measured.
   */
  readonly cars: string | undefined;
  /** Whether it counts toward the week, the census's own sentence; `undefined` where the census does not speak. */
  readonly counts: string | undefined;
  /** The census's count for the standing order left alone on that day, over the crowds it measured. */
  readonly census: string | undefined;
  /** On the close that closed the week: that the weekend is off the path and still playable. */
  readonly weekend: string | undefined;
}

/** The close's lead, as data — {@link dayCloseOf}. */
export interface DayCloseView {
  /** Item 1. `undefined` where the census does not speak for the tower. */
  readonly house: string | undefined;
  /** Item 1's running tally. `undefined` where the census does not speak for the tower. */
  readonly tally: string | undefined;
  /** Item 2. `undefined` on a day nobody graded. */
  readonly call: string | undefined;
  /** Item 3. `undefined` where the census does not speak for the tower. */
  readonly arithmetic: string | undefined;
  /**
   * **Who cleared this crowd, by name** — wave AP, lane DT-1, [§ D1463](../../../../DECISIONS.md):
   * the pool's record of today's crowd, past tense (`poolWays.ts#poolCloseLineOf`). `undefined` on
   * a day the pool did not deal.
   */
  readonly ways?: string | undefined;
  /** Item 4. */
  readonly tomorrow: DayCloseTomorrow;
}

/** The heading over items 1 to 3. */
export const DAY_CLOSE_HEADING = 'TODAY AGAINST THE HOUSE';

/** What the weekend is on the close that closed the week — [§ D1246](../../../../DECISIONS.md). */
export const DAY_CLOSE_WEEKEND_LINE =
  'The rest of this week counts toward no target and is not run against the house; it stays ' +
  'playable from the week’s sheet.';

const YOU_WORDS: Readonly<Record<CloseVerdict, string>> = Object.freeze({
  cleared: 'cleared it',
  missed: 'missed it',
  ungraded: 'were not graded',
});

const HOUSE_WORDS: Readonly<Record<HouseReading, string>> = Object.freeze({
  cleared: 'cleared it',
  missed: 'missed it',
  ungraded: 'was not graded',
  pending: 'is still being run',
  unrecorded: 'could not be run on it',
});

const OWN_WORDS: Readonly<Record<CloseVerdict, string>> = Object.freeze({
  cleared: 'it cleared',
  missed: 'it missed',
  ungraded: 'it was not graded',
});

/** `1 counted day`, `3 counted days`. */
function countedDays(count: number): string {
  return `${String(count)} counted ${count === 1 ? 'day' : 'days'}`;
}

/** Item 1, today's line. */
function houseLineOf(week: WeekState, houseOf: DayCloseInput['houseOf'], census: WeekWay): string | undefined {
  const today = week.history.find((entry) => entry.day === week.day);
  if (today === undefined) return undefined;
  if (!dayCountsToward(week, today, census)) {
    return `${today.weekday} does not count toward the week, so the house was not run on it.`;
  }
  const yours = dayVerdictOf(today);
  const house = houseReadingOfDay(today, houseOf, census);
  if (houseNeedOf(today, census) === 'own') {
    return (
      `Today against the house: you ran the tower’s standing order with nothing pressed, so your day ` +
      `is the house’s, and ${OWN_WORDS[yours]}.`
    );
  }
  return (
    `Today against the house: you ${YOU_WORDS[yours]}; the tower’s standing order, left alone on the ` +
    `same crowd, ${HOUSE_WORDS[house]}.`
  );
}

/** `one of them`, `3 of them`, or `it` / `all 3 of them` where it is every one. */
function ofThem(count: number, of: number): string {
  if (count === of) return of === 1 ? 'it' : `all ${String(of)} of them`;
  return count === 1 ? 'one of them' : `${String(count)} of them`;
}

/**
 * Item 1's tally, over the counted days closed so far.
 *
 * **A count the house has not answered is not a zero** — wave AN, lane AN-7, the post-AM panel's
 * seat B (defect 3). With the house still being run on every counted day (after a reload, which
 * keeps no reading and asks again), this read *you 3, the house 0 … The house is still being run on
 * 3 of them*: a figure for a count nobody had yet made. While any day is pending the house's count
 * is stated over the days it has answered, and not at all where it has answered none.
 */
function tallyOf(week: WeekState, houseOf: DayCloseInput['houseOf'], census: WeekWay): string | undefined {
  const counted = week.history.filter((entry) => dayCountsToward(week, entry, census));
  if (counted.length === 0) return undefined;
  const readings = counted.map((entry) => houseReadingOfDay(entry, houseOf, census));
  const yours = countedCleanOf(week, census);
  const house = readings.filter((reading) => reading === 'cleared').length;
  const pending = readings.filter((reading) => reading === 'pending').length;
  const unrecorded = readings.filter((reading) => reading === 'unrecorded').length;
  const unrun =
    unrecorded === 0 ? '' : ` It could not be run on ${unrecorded === 1 ? 'one of them' : `${String(unrecorded)} of them`}.`;
  if (pending === 0) {
    return (
      `This week so far: you ${String(yours)}, the house ${String(house)}, clean over the same ` +
      `${countedDays(counted.length)}.${unrun}`
    );
  }
  const answered = counted.length - pending - unrecorded;
  const lead = `This week so far: you ${String(yours)} clean over ${countedDays(counted.length)}.`;
  const houseClause =
    answered === 0
      ? ` The house is still being run on ${ofThem(pending, counted.length)}.`
      : ` The house: ${String(house)} clean over the ${String(answered)} it has answered, and still being run on ` +
        `${ofThem(pending, counted.length)}.`;
  return `${lead}${houseClause}${unrun}`;
}

/** Item 3. */
function arithmeticOf(week: WeekState, census: WeekWay): string | undefined {
  const deal = weekDealOf(week, census);
  if (deal === undefined || deal.target === 0) return undefined;
  const clean = countedCleanOf(week, census);
  const left = deal.days.filter((day) => day.counts && day.day > week.day).length;
  const asks = `the target asks for ${String(deal.target)} of ${String(deal.counted)}`;
  if (clean >= deal.target) {
    return left === 0
      ? `Target met: ${String(clean)} clean, and ${asks}.`
      : `Target met: ${String(clean)} clean, and ${asks}. The ${countedDays(left)} left still ${left === 1 ? 'counts' : 'count'} against the house.`;
  }
  const need = deal.target - clean;
  if (need <= left) {
    return `The week needs ${String(need)} of the ${countedDays(left)} left: ${String(clean)} clean so far, and ${asks}.`;
  }
  if (left === 0) return `Target not met: ${String(clean)} clean, and ${asks}.`;
  return (
    `The target is out of reach: ${asks}, you have ${String(clean)} clean, and ${countedDays(left)} ` +
    `${left === 1 ? 'is' : 'are'} left. The tally against the house is still open.`
  );
}

/** `19 people move in overnight: 589 → 608 tenants.` — the beat's two measured counts. */
function moveInsOf(population: { readonly today: number; readonly tomorrow: number }): string {
  const delta = population.tomorrow - population.today;
  const counts = `${population.today.toLocaleString('en-GB')} → ${population.tomorrow.toLocaleString('en-GB')} tenants`;
  if (delta === 0) return `Nobody moves in overnight: ${counts}.`;
  const people = Math.abs(delta);
  return `${people.toLocaleString('en-GB')} ${people === 1 ? 'person' : 'people'} ${delta > 0 ? 'move in' : 'move out'} overnight: ${counts}.`;
}

/**
 * `A new week: the tower as handed, 627 → 589 tenants.` — the two measured counts, on the close
 * whose next day opens a new week. A percentage stood here, and it was a slope's ratio rather than
 * these counts' (the post-AM panel's seat D: *7.4 %* for 627 → 589, which is 6.1 %).
 */
function newWeekTenantsOf(population: { readonly today: number; readonly tomorrow: number }): string {
  return (
    `A new week: the tower as handed, ${population.today.toLocaleString('en-GB')} → ` +
    `${population.tomorrow.toLocaleString('en-GB')} tenants.`
  );
}

/** Item 4. */
function tomorrowOf(input: DayCloseInput, census: WeekWay): DayCloseTomorrow {
  const { week, report } = input;
  const onward = report.onward;
  /* Tomorrow's own week: on the close that closed the week, the next one's deal (§ D1252). */
  const on = { contractId: week.contractId, week: onward?.week ?? week.week };
  const deal = weekDealOf(on, census);
  const day = onward?.day ?? week.day + 1;
  const weekday = onward?.weekday ?? weekdayOf(week.dayIdx + 1);
  const newWeek = onward?.newWeek === true;
  /* Wave AN, lane AN-7: the week's number where one is true of it (`weekStake.ts#weekOrdinalOf`). */
  const ordinal = weekOrdinalOf({ ...on, day })?.toUpperCase();
  const heading = newWeek
    ? `NEXT · ${ordinal === undefined ? '' : `${ordinal} · `}${weekday.toUpperCase()}, DAY ${String(day)} OF A NEW WEEK`
    : `TOMORROW · ${ordinal === undefined ? '' : `${ordinal} · `}${weekday.toUpperCase()}, DAY ${String(day)}`;
  const measured = input.onward;
  /*
   * On an ordinary day the note is told the truth about the tower's bookings, as the brief's card
   * tells it (`bookedOut.ts#wrinkleNoteOf`), because *Nothing booked* would sit over the car line.
   * On every other day the note is about the wrinkle and stays true, and the car line names the
   * booking, so the card does not say it twice on a phone's first screen.
   */
  const wrinkle =
    onward === undefined
      ? report.forecast.name
      : `${onward.name}: ${
          onward.eventId === 'ordinary'
            ? wrinkleNoteOf({ id: onward.eventId, note: onward.note }, measured?.cars ?? [])
            : onward.note
        }`;
  const tenants = measured?.population ?? (newWeek ? undefined : input.population);
  const moveIns =
    tenants === undefined
      ? `${onward?.demand ?? report.forecast.demand}.`
      : newWeek
        ? newWeekTenantsOf(tenants)
        : moveInsOf(tenants);
  const cars =
    measured === undefined ? undefined : carsOutLineOf(measured.cars, (simTimeS) => clockAt(simTimeS, measured.startOfDayS));
  const counts = onward === undefined ? undefined : dayStakeSentenceOf(on, day, onward.eventId, census);
  const dealt = deal?.days[day - 1];
  const row = onward !== undefined && dealt?.eventId === onward.eventId ? dealt.row : undefined;
  const censusLine =
    row === undefined || row.standingVerdicts.length === 0
      ? undefined
      : (() => {
          const n = row.standingVerdicts.length;
          const clears = clearsIn(row.standingVerdicts);
          return (
            `The census ran ${weekday} on ${String(n)} crowds: left alone, the tower’s standing order ` +
            `cleared it on ${String(clears)} of them.`
          );
        })();
  return {
    heading,
    wrinkle,
    moveIns,
    cars,
    counts,
    census: censusLine,
    weekend: newWeek && week.day < 7 ? DAY_CLOSE_WEEKEND_LINE : undefined,
  };
}

/** The pool's crowd today's filed day ran on, or `undefined`. */
function todaysPooledCrowd(week: WeekState): PoolCrowd | undefined {
  const seed = week.history.find((entry) => entry.day === week.day)?.record?.seed;
  return seed === undefined || !/^\d+$/u.test(seed) ? undefined : pooledCrowdOf(week, week.day, BigInt(seed));
}

/**
 * **The close's lead** — see the module docstring. `undefined` on a close that has no tomorrow to
 * point at: a practice close, whose week stands on the day it did not bank, and every sheet that
 * is not a day of a week.
 */
export function dayCloseOf(input: DayCloseInput, census: WeekWay = WEEK_WAY): DayCloseView | undefined {
  const { week, report } = input;
  if (report.practiceNote !== undefined || report.dayStaysOpen === true) return undefined;
  if (week.closedDay !== week.day) return undefined;
  const speaks = weekDealOf(week, census) !== undefined;
  return {
    house: speaks ? houseLineOf(week, input.houseOf, census) : undefined,
    tally: speaks ? tallyOf(week, input.houseOf, census) : undefined,
    call: closeCallLineOf({ week, report, houseOf: input.houseOf, driverOf: input.driverOf }, census),
    arithmetic: speaks ? arithmeticOf(week, census) : undefined,
    ways: poolCloseLineOf(todaysPooledCrowd(week), input.profileNameOf ?? (() => undefined)),
    tomorrow: tomorrowOf(input, census),
  };
}
