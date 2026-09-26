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
 *    did, a plain sentence saying so.
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
 * - Tomorrow's wrinkle, its note and its tenants are read off tomorrow's own run config through the
 *   report (`report.ts#WeekDayReport.onward`, derived as the run is), and the census line is a count
 *   over the crowds the census measured, worded as that and never as how the player's day will go
 *   (swarm DN's Q1(d) refusal and S1's refusal, honoured).
 *
 * Pure: no clock, no RNG, no simulation. `everyday/reportView.ts` is its non-test caller.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import { dayCallAnswerWordsOf, dayCallAnswersOf, type DayCallAnswer, type DayCallRecord } from './dayCalls.js';
import type { WeekDayReport } from './report.js';
import {
  countedCleanOf,
  dayCountsToward,
  dayStakeSentenceOf,
  dayVerdictOf,
  houseNeedOf,
  houseReadingOfDay,
  weekDealOf,
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

/**
 * **The call that decided today**, or the plain sentence that none did — swarm DO's § 1 ruling,
 * item 2, [§ D1248](../../../../DECISIONS.md). `undefined` on a day nobody graded, which has no
 * verdict to decide.
 *
 * A call decided the day when one of its **other** answers, run on this crowd from the call with
 * every earlier press kept and nothing pressed after, reads a different verdict from the day that
 * was filed. Where several calls did, the latest is named, because the fewest later presses stand
 * between its runs and the filed day, and the count of the others is said beside it.
 */
export function decidingCallLineOf(input: DecidingCallInput): string | undefined {
  const { verdict } = input;
  if (verdict === 'ungraded') return undefined;
  const decided: { readonly at: string; readonly chose: string; readonly others: readonly string[]; readonly reads: CloseVerdict }[] = [];

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
        at,
        chose: pinned.answered === undefined ? 'nothing was pressed' : `you chose ${pressWordsOf(pinned.answered)}`,
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

  const last = decided.at(-1);
  if (last === undefined) {
    return input.records.length === 0 && pinned === undefined ? NO_CALL_RAISED_LINE : NO_CALL_DECIDED_LINE;
  }
  const more =
    decided.length === 1
      ? ''
      : ` ${String(decided.length - 1)} earlier ${decided.length === 2 ? 'call' : 'calls'} today could have turned it too.`;
  return (
    `The call that decided today came at ${last.at}, where ${last.chose}: on this crowd, the day run ` +
    `from ${last.at} with ${orList(last.others)} and nothing pressed after it read ${input.lineOf(last.reads)}.${more}`
  );
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
}

/** Tomorrow, whole — item 4. */
export interface DayCloseTomorrow {
  /** `TOMORROW · THURSDAY, DAY 4`, or the next week's Monday once the week has closed. */
  readonly heading: string;
  /** `Conference: …` — the wrinkle by name, and its note, which carries its clock window where it has one. */
  readonly wrinkle: string;
  /** Who moves in, measured on the two buildings or read off the report's own tenants line. */
  readonly moveIns: string;
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

/** Item 1's tally, over the counted days closed so far. */
function tallyOf(week: WeekState, houseOf: DayCloseInput['houseOf'], census: WeekWay): string | undefined {
  const counted = week.history.filter((entry) => dayCountsToward(week, entry, census));
  if (counted.length === 0) return undefined;
  const readings = counted.map((entry) => houseReadingOfDay(entry, houseOf, census));
  const yours = countedCleanOf(week, census);
  const house = readings.filter((reading) => reading === 'cleared').length;
  const pending = readings.filter((reading) => reading === 'pending').length;
  const unrecorded = readings.filter((reading) => reading === 'unrecorded').length;
  const tail =
    (pending === 0 ? '' : ` The house is still being run on ${pending === 1 ? 'one of them' : `${String(pending)} of them`}.`) +
    (unrecorded === 0 ? '' : ` It could not be run on ${unrecorded === 1 ? 'one of them' : `${String(unrecorded)} of them`}.`);
  return (
    `This week so far: you ${String(yours)}, the house ${String(house)}, clean over the same ` +
    `${countedDays(counted.length)}.${tail}`
  );
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

/** Item 4. */
function tomorrowOf(input: DayCloseInput, census: WeekWay): DayCloseTomorrow {
  const { week, report } = input;
  const onward = report.onward;
  const deal = weekDealOf(week, census);
  const day = onward?.day ?? week.day + 1;
  const weekday = onward?.weekday ?? weekdayOf(week.dayIdx + 1);
  const newWeek = onward?.newWeek === true;
  const heading = newWeek
    ? `NEXT · ${weekday.toUpperCase()}, DAY ${String(day)} OF A NEW WEEK`
    : `TOMORROW · ${weekday.toUpperCase()}, DAY ${String(day)}`;
  const wrinkle = onward === undefined ? report.forecast.name : `${onward.name}: ${onward.note}`;
  const moveIns =
    !newWeek && input.population !== undefined
      ? moveInsOf(input.population)
      : `${onward?.demand ?? report.forecast.demand}.`;
  const counts = onward === undefined ? undefined : dayStakeSentenceOf(week, day, onward.eventId, census);
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
    counts,
    census: censusLine,
    weekend: newWeek && week.day < 7 ? DAY_CLOSE_WEEKEND_LINE : undefined,
  };
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
    call: report.decidingCall,
    arithmetic: speaks ? arithmeticOf(week, census) : undefined,
    tomorrow: tomorrowOf(input, census),
  };
}
