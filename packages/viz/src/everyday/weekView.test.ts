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
  // The overlap and the run's own horizon that § D417 binds every publisher of
  // `abandoned` to carry, and `goals.ts#gaveUpBesideOf` reads (GitHub issue #456).
  abandonedCarried: 0,
  horizonS: 900,
  worstWaitS: 30,
  worstWaitIsCensored: false,
  // Under `GOAL_BARS.energyPerLegMaxKJ`, so a met day clears the energy bar too (§ D367, § D468).
  // Absent, the fifth reading is `pending`, and `outcomeOf` treats unjudged as not passed.
  workPerServedLegKJ: 34.7,
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

/** Building names by id, as the shipped documents carry them — the fixture for `nameOf` (GitHub issue #599). */
const NAMES: Readonly<Record<string, string>> = {
  'garden-apartments': 'Garden Apartments',
  'crown-hotel': 'Crown Hotel',
  'chancery-house': 'Chancery House',
  'midtown-office': 'Midtown Office',
};
const NAME_OF = (buildingId: string): string | undefined => NAMES[buildingId];

const weekWith = (day: number, history: readonly DayOutcome[]): WeekState => ({
  ...openWeek(),
  day,
  dayIdx: (day - 1) % 7,
  bestMinutePct: Math.max(0, ...history.map((entry) => entry.minutePct)),
  streak: history.filter((entry) => entry.allMet).length,
  history,
});

const viewOf = (week: WeekState, dayClosed: boolean): ReturnType<typeof weekScreenViewOf> =>
  weekScreenViewOf({ week, towerToday: 'Chancery House', nameOf: NAME_OF, dayClosed, sheetStanding: dayClosed });

describe('the tower on a card — GitHub issue #599', () => {
  it('names a closed day by the name today’s card uses, not by its id', () => {
    /*
     * A closed card printed `record.buildingId` — *chancery-house* — beside today's card printing
     * the document's *Chancery House*, so one strip named one tower two ways. A closed yesterday and
     * a closed today on the same tower, which is the pair a player meets every evening.
     */
    const week = weekWith(3, [dayOf(2, MET), dayOf(3, MET)]);
    const cards = viewOf(week, true).cards;
    const yesterday = cards.find((card) => card.day === 2);
    const today = cards.find((card) => card.isToday);
    expect(today?.day).toBe(3);
    expect(yesterday?.tower).toBe('Chancery House');
    expect(today?.tower).toBe('Chancery House');
    expect(cards.map((card) => card.tower)).not.toContain('chancery-house');
  });
});

describe('§ 16 rule 1 — today is withheld until *Close the day* has been pressed', () => {
  it('draws the em dash and *not closed yet*, never a `0%`', () => {
    const week = weekWith(3, [dayOf(1, MET), dayOf(2, MET)]);
    const today = viewOf(week, false).cards.at(-1);
    expect(today?.isToday).toBe(true);
    expect(today?.score).toBe(EM_DASH);
    expect(today?.note).toBe('today · not closed yet');
    expect(today?.verdict).toBeUndefined();
  });

  it('shows today once the week carries it, whether or not this sitting filed the run — § D1004', () => {
    /*
     * This case used to assert the withholding: a restored week holding today's outcome drew the
     * em dash until the sitting filed a run. The post-AH panel met that as *THU … today · not closed
     * yet* and *No day of this week has been closed yet* about days the report had called banked,
     * beside a front door whose chip read the same history and said *today*. Nothing but *Close
     * the day* writes an outcome into the history, so an outcome there is a closed day.
     */
    const week = weekWith(3, [dayOf(1, MET), dayOf(2, MET), dayOf(3, MET)]);
    const restored = viewOf(week, false);
    expect(restored.cards.at(-1)?.score).toBe('84%');
    expect(restored.cards.at(-1)?.note).toBe('today · clean day');
    expect(restored.tally.closed).toBe(3);
    expect(restored.percentile.line).not.toMatch(/not closed/);
    expect(viewOf(week, true).cards.at(-1)?.score).toBe('84%');
    // What stays about the sitting: with no sheet standing, the card does not open one, and says why.
    expect(restored.cards.some((card) => card.readable)).toBe(false);
    expect(restored.readNote).toMatch(/Today is closed/);
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
      towerToday: 'Chancery House', nameOf: NAME_OF,
      dayClosed: false,
      sheetStanding: false,
    });
    expect(open.cards.some((card) => card.readable)).toBe(false);
    // Today is in the week's history, so the note says the day is closed and why its sheet is not
    // here — § D1004. A week with today not yet closed still says *once it has been closed*.
    expect(open.readNote).toMatch(/Today is closed/);
    expect(
      weekScreenViewOf({
        week: weekWith(3, [dayOf(1, MET), dayOf(2, MET)]),
        towerToday: 'Chancery House',
        nameOf: NAME_OF,
        dayClosed: false,
        sheetStanding: false,
      }).readNote,
    ).toMatch(/once it has been closed/);

    // Closed, but the sheet was cleared by *Open the doors on tomorrow* — the two can disagree,
    // and a card that opened an empty sheet would be § 16 rule 4's defect.
    const cleared = weekScreenViewOf({
      week,
      towerToday: 'Chancery House', nameOf: NAME_OF,
      dayClosed: true,
      sheetStanding: false,
    });
    expect(cleared.cards.some((card) => card.readable)).toBe(false);

    const filed = weekScreenViewOf({
      week,
      towerToday: 'Chancery House', nameOf: NAME_OF,
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
      towerToday: 'Chancery House', nameOf: NAME_OF,
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
