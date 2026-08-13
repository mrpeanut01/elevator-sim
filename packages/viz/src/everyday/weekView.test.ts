/**
 * Your week — GAMEPLAY § 14, and § 12.2's withheld matrix as far as this build reaches it.
 *
 * The highest-value cases here are the two absences, held apart: *today is not closed* is a fact
 * about the reader's own run and resolves when they close the day; *the world is unreachable* is a
 * fact about other players and does not resolve at all in this build. A screen that merged them
 * would tell each reader the other one's story, and the merge would be invisible.
 *
 * The tally is the § 16 rule 5 case: `cleared`, `missed` and `ungraded` are counted off the same
 * cards a reader can count, so a card that changes changes the count.
 */

import { describe, expect, it } from 'vitest';

import { goalsForDay, readGoals } from '../shift/goals.js';
import type { DayOutcome, GoalObservations, WeekState } from '../shift/types.js';
import type { WatchRecord } from '../watch/types.js';
import { openWeek, outcomeOf, wasGraded } from '../shift/week.js';

import { EM_DASH } from './figures.js';
import { verdictOf, WEEK_CARDS, weekScreenViewOf } from './weekView.js';

const MET: GoalObservations = {
  arrived: 400,
  carryPct: 100,
  minutePct: 84,
  peakQueue: 2,
  abandoned: 0,
  worstWaitS: 30,
  worstWaitIsCensored: false,
};

/** Missed: the same arrivals, a carried share no bar accepts. */
const MISSED: GoalObservations = { ...MET, carryPct: 40, minutePct: 31, worstWaitS: 400 };

/** Under the wake-up gate — nothing is graded, which is not the same as nothing being met. */
const TOO_QUIET: GoalObservations = { ...MET, arrived: 3, minutePct: 100 };

function dayOf(day: number, observed: GoalObservations): DayOutcome {
  return outcomeOf({
    day,
    dayIdx: (day - 1) % 7,
    eventId: 'ordinary',
    arrived: observed.arrived,
    carried: observed.arrived,
    minutePct: observed.minutePct,
    readings: readGoals(goalsForDay(day), observed),
    record: { buildingId: 'chancery-house' } as unknown as WatchRecord,
    recordRefusal: null,
  });
}

const weekWith = (day: number, history: readonly DayOutcome[]): WeekState => ({
  ...openWeek(),
  day,
  dayIdx: (day - 1) % 7,
  bestMinutePct: Math.max(0, ...history.map((entry) => entry.minutePct)),
  streak: history.filter((entry) => entry.allMet).length,
  history,
});

const viewOf = (week: WeekState, dayClosed: boolean): ReturnType<typeof weekScreenViewOf> =>
  weekScreenViewOf({ week, towerToday: 'Chancery House', dayClosed, sheetStanding: dayClosed });

describe('§ 16 rule 1 — today is withheld until *Close the day* has been pressed', () => {
  it('draws the em dash and *not closed yet*, never a `0%`', () => {
    const week = weekWith(3, [dayOf(1, MET), dayOf(2, MET)]);
    const today = viewOf(week, false).cards.at(-1);
    expect(today?.isToday).toBe(true);
    expect(today?.score).toBe(EM_DASH);
    expect(today?.note).toBe('today · not closed yet');
    expect(today?.verdict).toBeUndefined();
  });

  it('withholds it even when the week already carries today’s outcome from a previous sitting', () => {
    /*
     * The case that makes `dayClosed` load-bearing rather than decorative: a restored week can
     * hold today's closed outcome while the stage holds no filed run, and `dayClosed` — which
     * *Close the day* alone sets — is the authority. Publishing on the week alone would show a
     * figure for a day this sitting has not finished.
     */
    const week = weekWith(3, [dayOf(1, MET), dayOf(2, MET), dayOf(3, MET)]);
    expect(viewOf(week, false).cards.at(-1)?.score).toBe(EM_DASH);
    expect(viewOf(week, true).cards.at(-1)?.score).toBe('84%');
  });

  it('says nothing to place until the day is closed, and then says why it still cannot place you', () => {
    const week = weekWith(3, [dayOf(1, MET)]);
    expect(viewOf(week, false).percentile.line).toMatch(/not closed/);
    // Closed, and still withheld — but for the *other* reason, which is the world's.
    expect(viewOf(week, true).percentile.line).toMatch(/no verified distribution/);
  });
});

describe('the two absences are drawn in two places, and stay apart', () => {
  it('leaves the world band identical whether or not the day is closed', () => {
    const week = weekWith(3, [dayOf(1, MET)]);
    expect(viewOf(week, true).world).toEqual(viewOf(week, false).world);
  });

  it('moves the percentile line when the day closes, because that one is about your run', () => {
    const week = weekWith(3, [dayOf(1, MET)]);
    expect(viewOf(week, true).percentile.line).not.toBe(viewOf(week, false).percentile.line);
  });

  it('never renders a zero anywhere in the world band', () => {
    const { world } = viewOf(weekWith(1, []), false);
    for (const entry of [world.label, world.reason, ...world.absent]) {
      expect(entry).not.toMatch(/\b0\b/);
    }
  });
});

describe('the tally is counted off the rendered cards — § 16 rule 5', () => {
  it('splits closed days three ways, and the three add up to the closed count', () => {
    const week = weekWith(5, [
      dayOf(1, MET),
      dayOf(2, MISSED),
      dayOf(3, MET),
      dayOf(4, TOO_QUIET),
    ]);
    const view = viewOf(week, false);
    expect(view.tally).toMatchObject({ cleared: 2, missed: 1, ungraded: 1, closed: 4 });
    expect(view.tally.cleared + view.tally.missed + view.tally.ungraded).toBe(view.tally.closed);
    // And the count is the cards: change what is rendered and the tally follows.
    expect(view.cards.filter((card) => card.verdict !== undefined)).toHaveLength(4);
  });

  it('says so plainly when no day has been closed, rather than printing three zeroes', () => {
    expect(viewOf(weekWith(1, []), false).tally.line).toMatch(/No day of this week has been closed/);
  });

  it('reads a day’s verdict the way `shift/report.ts` does — `allMet` and `wasGraded`, not one flag', () => {
    for (const [observed, expected] of [
      [MET, 'cleared'],
      [MISSED, 'missed'],
      [TOO_QUIET, 'ungraded'],
    ] as const) {
      const outcome = dayOf(2, observed);
      expect(verdictOf(outcome)).toBe(expected);
      // The pair, spelled out: `allMet` alone collapses *too quiet* into *missed*, which is § D234.
      expect(wasGraded(outcome.readings)).toBe(expected !== 'ungraded');
    }
  });
});

describe('the report’s one entrance — `WeekDayCard.readable`', () => {
  const week = weekWith(3, [dayOf(1, MET), dayOf(2, MET), dayOf(3, MET)]);

  it('opens today’s card only once the day is closed **and** a sheet is standing', () => {
    const open = weekScreenViewOf({
      week,
      towerToday: 'Chancery House',
      dayClosed: false,
      sheetStanding: false,
    });
    expect(open.cards.some((card) => card.readable)).toBe(false);
    expect(open.readNote).toMatch(/once it has been closed/);

    // Closed, but the sheet was cleared by *Open the doors on tomorrow* — the two can disagree,
    // and a card that opened an empty sheet would be § 16 rule 4's defect.
    const cleared = weekScreenViewOf({
      week,
      towerToday: 'Chancery House',
      dayClosed: true,
      sheetStanding: false,
    });
    expect(cleared.cards.some((card) => card.readable)).toBe(false);

    const filed = weekScreenViewOf({
      week,
      towerToday: 'Chancery House',
      dayClosed: true,
      sheetStanding: true,
    });
    expect(filed.cards.filter((card) => card.readable)).toHaveLength(1);
    expect(filed.cards.find((card) => card.readable)?.isToday).toBe(true);
    expect(filed.readNote).toMatch(/opens the account of it/);
  });

  it('never opens a past day, because this build keeps one sheet', () => {
    const filed = weekScreenViewOf({
      week,
      towerToday: 'Chancery House',
      dayClosed: true,
      sheetStanding: true,
    });
    for (const card of filed.cards.filter((entry) => !entry.isToday)) {
      expect(card.readable).toBe(false);
    }
  });
});

describe('the rest of § 14', () => {
  it('draws seven cards, oldest first, ending on today', () => {
    const view = viewOf(weekWith(4, [dayOf(1, MET), dayOf(2, MET), dayOf(3, MISSED)]), false);
    expect(view.cards).toHaveLength(WEEK_CARDS);
    expect(view.cards.at(-1)?.isToday).toBe(true);
    expect(view.cards.filter((card) => card.isToday)).toHaveLength(1);
  });

  it('reads the best figure as absent rather than zero before any day closes', () => {
    expect(viewOf(weekWith(1, []), false).streakLine).toContain(EM_DASH);
    expect(viewOf(weekWith(2, [dayOf(1, MET)]), false).streakLine).toContain('84%');
  });

  it('states the board’s two structural rules where the board is not', () => {
    const { board } = viewOf(weekWith(1, []), false);
    expect(board.refusal).toMatch(/server/);
    expect(board.rules).toHaveLength(2);
    expect(board.rules[0]?.body).toMatch(/one-entry boards/);
    expect(board.rules[1]?.body).toMatch(/ranking of luck/);
  });

  it('captions the style split as a share and not a ranking', () => {
    expect(viewOf(weekWith(1, []), false).splitCaption).toContain('not a ranking');
  });
});
