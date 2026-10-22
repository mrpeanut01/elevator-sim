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

import { ladderHarderThanTopOf, nextAdmittedTowerAfter, nextTowerOfferOf } from '../shift/nextTower.js';
import { NEXT_WEEK_LABEL } from '../shift/nextWeek.js';
import { describe, expect, it } from 'vitest';

import { clockOf } from '../shift/report.js';

import { goalsForDay, readGoals } from '../shift/goals.js';
import type { DayOutcome, GoalObservations, WeekState } from '../shift/types.js';
import type { WatchRecord } from '../watch/types.js';
import { scheduledEventFor } from '../shift/calendar.js';
import { openWeek, outcomeOf, wasGraded } from '../shift/week.js';
import { weekDealOf } from '../shift/weekStake.js';

import { CALL_BANDS, callBandsReadingOf } from '../shift/callBands.js';
import { weekOrderFor } from '../shift/weekOrders.js';

import { EM_DASH } from './figures.js';
import { driverRecordLinesOf, verdictOf, WEEK_CARDS, WEEK_START_NEXT_LABEL, WEEK_TOP_RUSH_COPY, weekScreenViewOf } from './weekView.js';
import { poolLevelReadingOf } from '../shift/weekPool.js';

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
    // Closed, and still withheld — but for the *other* reason, which is the world's. Closed means
    // the week holds today (§ D1142): a run filed this sitting that the week did not keep is not.
    const closed = weekWith(3, [dayOf(1, MET), dayOf(3, MET)]);
    expect(viewOf(closed, true).percentile.line).toMatch(/no verified distribution/);
    expect(viewOf(week, true).percentile.line).toMatch(/not closed/);
  });
});

describe('the two absences are drawn in two places, and stay apart', () => {
  it('leaves the world band identical whether or not the day is closed', () => {
    const week = weekWith(3, [dayOf(1, MET)]);
    expect(viewOf(week, true).world).toEqual(viewOf(week, false).world);
  });

  it('moves the percentile line when the day closes, because that one is about your run', () => {
    const week = weekWith(3, [dayOf(1, MET)]);
    const closed = weekWith(3, [dayOf(1, MET), dayOf(3, MET)]);
    expect(viewOf(closed, true).percentile.line).not.toBe(viewOf(week, false).percentile.line);
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

describe('the week’s stake on the strip, and its sheet at the close — § D1176, § D1177', () => {
  /** A Midtown day drawing the wrinkle it is dealt, with a record whose driver is `dispatcherId`. */
  const midtownDay = (day: number, observed: GoalObservations, dispatcherId = 'collective'): DayOutcome => ({
    ...dayOf(day, observed),
    eventId: scheduledEventFor(null, day, (day - 1) % 7, 'whole-day').id,
    record: {
      buildingId: 'midtown-office',
      dispatcherId,
      interventions: [],
      ruleRows: [],
      outOfServiceCarIds: [],
    } as unknown as WatchRecord,
  });
  const midtown = (day: number, history: readonly DayOutcome[]): WeekState => ({
    ...weekWith(day, history),
    contractId: 'c2',
    closedDay: history.some((entry) => entry.day === day) ? day : null,
  });

  /*
   * Wave AO, lane DS-1 (§ D1400): a held week 2's sheet named the booking week 3 adds, on the run's
   * clock the screen hands it. Since § D1616 holds Midtown's order, no week deals a level, and the
   * sheet says the tower deals no further week and names no booking; the sentence with a booking in
   * it is pinned on the census before the fix in `weekView.preD1603.test.ts`.
   */
  it('names no booking on a held week 2, and says the tower deals no further week — § D1400, § D1616', () => {
    const dealtDay = (day: number, observed: GoalObservations): DayOutcome => ({
      ...midtownDay(day, observed),
      eventId: scheduledEventFor(null, day, (day - 1) % 7, 'whole-day', { contractId: 'c2', week: 2 }).id,
    });
    const view = weekScreenViewOf({
      week: { ...midtown(7, [1, 2, 3, 4, 5, 6, 7].map((day) => dealtDay(day, day === 5 ? MISSED : MET))), week: 2 },
      towerToday: 'Midtown Office',
      nameOf: NAME_OF,
      dayClosed: true,
      sheetStanding: true,
      bookingClock: (fraction) => clockOf(fraction * 10 * 3600, 8 * 3600),
    });
    expect(view.next?.held).toBe(true);
    expect(view.next?.line).toBe(
      'You held week 2. This tower deals no further week: Start next week deals week 3 as this week was ' +
        'dealt, the same wrinkles, on new crowds.',
    );
    expect(view.next?.line).not.toMatch(/\bcar [A-Z]\b|booked|withdrawn/u);
  });

  it('marks the days that do not count on their cards, and says why under the strip in the brief’s sentence', () => {
    // Since § D1180 every Midtown weekday counts as dealt, so the days that do not are the weekend.
    const view = viewOf(midtown(7, [1, 2, 3, 4, 5, 6].map((day) => midtownDay(day, MET))), false);
    expect(view.stake).toBe('This week’s target: 4 of 5 counted days clean. 5 so far. Met on Thursday.');
    expect(
      view.cards.filter((card) => card.day !== undefined).map((card) => [card.weekday, card.counts, card.note]),
    ).toEqual([
      ['MON', true, 'clean day'],
      ['TUE', true, 'clean day'],
      ['WED', true, 'clean day'],
      ['THU', true, 'clean day'],
      ['FRI', true, 'clean day'],
      ['SAT', false, 'clean day · not counted'],
      ['SUN', false, 'today · not closed yet · not counted'],
    ]);
    expect(view.notCounted).toEqual([
      { weekday: 'SAT', sentence: weekDealOf('c2')?.days[5]?.sentence },
      { weekday: 'SUN', sentence: weekDealOf('c2')?.days[6]?.sentence },
    ]);
    expect(view.notCounted[0]?.sentence).toMatch(/^This day does not count toward the week: /u);
    expect(view.sheet).toBeUndefined();
  });

  it('draws nothing new on a week the census does not speak for', () => {
    const view = viewOf(weekWith(3, [dayOf(1, MET), dayOf(2, MET)]), false);
    expect(view.stake).toBeUndefined();
    expect(view.notCounted).toEqual([]);
    expect(view.sheet).toBeUndefined();
    expect(view.cards.every((card) => card.counts === undefined)).toBe(true);
  });

  it('draws the sheet once the last dealt day is filed, with the shell’s house readings beside yours', () => {
    const history = [1, 2, 3, 4, 5, 6, 7].map((day) =>
      midtownDay(day, day === 1 || day === 4 ? MET : MISSED, day === 4 ? 'eta' : 'collective'),
    );
    const input = {
      week: midtown(7, history),
      towerToday: 'Midtown Office',
      nameOf: NAME_OF,
      dayClosed: true,
      sheetStanding: true,
    };
    const view = weekScreenViewOf({ ...input, house: (day) => (day === 4 ? 'missed' : undefined) });
    expect(view.sheet?.yoursLine).toBe('Your week: 2 of the 5 counted days clean.');
    expect(view.sheet?.houseLine).toBe('The tower’s standing order, left alone on the same crowds, cleared 1.');
    expect(view.sheet?.targetLine).toBe('Target 4: not met.');
    // With no house answered yet for the run it needs, the sheet says so rather than counting it.
    expect(weekScreenViewOf(input).sheet?.houseLine).toMatch(/still being run/u);
  });

  /*
   * Swarm DN's Q2.3 and Q2.6, lane AL-F (§ D1227, § D1230): while the sheet stands the screen's one
   * button starts the next week, and the tower's record of closed weeks is drawn where one is kept.
   */
  it('offers the next week while the sheet stands, and the week row’s own button otherwise', () => {
    const history = [1, 2, 3, 4, 5, 6, 7].map((day) => midtownDay(day, MET, 'collective'));
    const closed = weekScreenViewOf({
      week: midtown(7, history),
      towerToday: 'Midtown Office',
      nameOf: NAME_OF,
      dayClosed: true,
      sheetStanding: true,
    });
    /* Every day clean holds the week, so a tower the census admits after Midtown is the next step. */
    expect(closed.onward).toEqual(nextTowerOfferOf('c2', closed.sheet, NAME_OF));
    expect(closed.primary).toBe(closed.onward?.label ?? WEEK_START_NEXT_LABEL);
    const open = weekScreenViewOf({
      week: midtown(4, history.slice(0, 4)),
      towerToday: 'Midtown Office',
      nameOf: NAME_OF,
      dayClosed: true,
      sheetStanding: true,
    });
    expect(open.primary).toBeUndefined();
    expect(open.onward).toBeUndefined();
  });

  /*
   * Swarm DO § 3, lane AM-E (§ D1259): only a held week offers the next tower. A week that missed
   * its target keeps *Start next week* as its one button, and offers no other tower.
   */
  it('offers the next tower only when the week was held', () => {
    const missed = weekScreenViewOf({
      week: midtown(7, [1, 2, 3, 4, 5, 6, 7].map((day) => midtownDay(day, day <= 3 ? MET : MISSED, 'collective'))),
      towerToday: 'Midtown Office',
      nameOf: NAME_OF,
      dayClosed: true,
      sheetStanding: true,
    });
    expect(missed.sheet?.targetLine).toBe('Target 4: not met.');
    expect(missed.onward).toBeUndefined();
    /*
     * Wave AN, lane DQ-2 (§ D1344): a week that was not held plays itself again as the primary, and
     * the next week is the second press beside it, because nothing is locked. Since § D1616 Midtown
     * deals no week past its first, so there is no next week to offer beside it.
     */
    expect(missed.primary).toBe('Play week 1 again');
    expect(missed.next?.onward).toBeUndefined();
    /* The held week's label is the one the sheet always had, spelled once in each layer. */
    expect(NEXT_WEEK_LABEL).toBe(WEEK_START_NEXT_LABEL);
    const held = weekScreenViewOf({
      week: midtown(7, [1, 2, 3, 4, 5, 6, 7].map((day) => midtownDay(day, day === 5 ? MISSED : MET, 'collective'))),
      towerToday: 'Midtown Office',
      nameOf: NAME_OF,
      dayClosed: true,
      sheetStanding: true,
    });
    expect(held.sheet?.targetLine).toBe('Target 4: met.');
    const next = nextAdmittedTowerAfter('c2');
    expect(held.next?.held).toBe(true);
    expect(held.next?.onward).toBeUndefined();
    if (next === undefined) {
      expect(held.onward).toBeUndefined();
      expect(held.primary).toBe(WEEK_START_NEXT_LABEL);
    } else {
      expect(held.onward?.contractId).toBe(next);
      expect(held.primary).toBe(held.onward?.label);
      expect(held.primary).not.toBe(WEEK_START_NEXT_LABEL);
    }
    /*
     * On the shipped census the one tower offered is Midtown (§ D1258, § D1259): a Chancery House
     * week held Monday to Thursday offers it, as the primary, with the next week here in the sheet.
     */
    const chancery = weekScreenViewOf({
      week: { ...midtown(7, [1, 2, 3, 4, 5, 6, 7].map((day) => midtownDay(day, day === 5 ? MISSED : MET, 'collective'))), contractId: 'c6' },
      towerToday: 'Chancery House',
      nameOf: NAME_OF,
      dayClosed: true,
      sheetStanding: true,
    });
    expect(chancery.sheet?.targetLine).toBe('Target 3: met.');
    expect(chancery.onward?.contractId).toBe('c2');
    /* Wave AP, lane DT-2 (swarm DT's Q4): at a held top the next week stays the primary. */
    expect(chancery.primary).toBe(chancery.next?.top === true ? WEEK_START_NEXT_LABEL : 'Play Midtown Office’s week');
    expect(chancery.onward?.stayLabel).toBe('Start next week here');
  });

  /*
   * Wave AP, lane DT-2, swarm DT's Q4 items 2 to 4. Red before: a held Chancery House week at its top
   * made *Play Midtown Office’s week* the primary and offered no Rush; a held Ashgate week offered
   * Midtown though the house's census does not read Midtown's ladder harder than Ashgate's top.
   */
  it('at a held top keeps Start next week the primary, offers the Rush beside it, and another tower only where its ladder is harder', () => {
    const heldOn = (contractId: string, rushBest?: Parameters<typeof weekScreenViewOf>[0]['rushBest']) =>
      weekScreenViewOf({
        week: { ...midtown(7, [1, 2, 3, 4, 5, 6, 7].map((day) => midtownDay(day, MET, 'collective'))), contractId },
        towerToday: 'Tower',
        nameOf: NAME_OF,
        dayClosed: true,
        sheetStanding: true,
        ...(rushBest === undefined ? {} : { rushBest }),
      });
    const chancery = heldOn('c6');
    expect(chancery.next?.held).toBe(true);
    expect(chancery.next?.top).toBe(true);
    expect(chancery.primary).toBe(WEEK_START_NEXT_LABEL);
    expect(chancery.onwardPrimary).toBe(false);
    const harder = ladderHarderThanTopOf('c6', 'c2');
    expect(harder?.harder).toBe(true);
    expect(chancery.onward?.contractId).toBe('c2');
    expect(chancery.onward?.label).toBe('Play Midtown Office’s week');
    expect(chancery.onward?.line).toBe(
      `Midtown Office’s ladder goes further than this tower’s top by the house’s measure: left alone on the same ` +
        `${String(harder?.to.crowds)} crowds, the house cleared ${String(harder?.to.cleared)} of the ${String(harder?.to.of)} ` +
        `weekdays of Midtown Office’s top week, against ${String(harder?.from.cleared)} of this one’s.`,
    );
    expect(chancery.rush?.label).toBe(WEEK_TOP_RUSH_COPY.label);
    expect(chancery.rush?.line).toBe(`${WEEK_TOP_RUSH_COPY.what} ${WEEK_TOP_RUSH_COPY.chimes}`);
    /* This device's best, as the host's replay answered it: the replay's hold, never a stored one. */
    expect(heldOn('c6', { kind: 'row', heldS: 1325, roundCount: 3, modifiers: [] }).rush?.line).toContain(
      'Your best sitting here on this device, replayed now from its last round, held 22:05 over 3 rounds.',
    );
    expect(heldOn('c6', { kind: 'none' }).rush?.line).toContain(WEEK_TOP_RUSH_COPY.none);
    expect(heldOn('c6', { kind: 'silent' }).rush?.line).toBe(`${WEEK_TOP_RUSH_COPY.what} ${WEEK_TOP_RUSH_COPY.chimes}`);
    /*
     * Ashgate's top: under lane DT-1's pool (§ D1459) Midtown's top week was its pooled week 2, which
     * the house's census read harder than Ashgate's top. Since § D1616 holds Midtown's order its top is
     * week 1, the house's census does not read that harder than Ashgate's top, and so no tower is
     * offered from Ashgate. The offer is pinned on the census before
     * the fix in `weekView.preD1603.test.ts`.
     */
    const ashgate = heldOn('c10');
    expect(ashgate.next?.top).toBe(true);
    expect(nextAdmittedTowerAfter('c10')).toBe('c2');
    expect(ladderHarderThanTopOf('c10', 'c2')?.harder).toBe(false);
    expect(ashgate.onward).toBeUndefined();
    expect(ashgate.primary).toBe(WEEK_START_NEXT_LABEL);
    expect(ashgate.onwardPrimary).toBe(false);
    expect(ashgate.rush).toBeDefined();
    /* Where the census has no reading of the next tower against this one, no tower is offered. */
    expect(ladderHarderThanTopOf('c3', 'c2')).toBeUndefined();
    expect(heldOn('c3').onward).toBeUndefined();
    /* No word of unlocking, and *harder* only in the house's measure's sentence. */
    for (const view of [chancery, ashgate]) {
      for (const text of [view.rush?.line ?? '', view.onward?.line ?? '']) {
        expect(text).not.toMatch(/unlock|easier|best tower|you should/iu);
      }
    }
    /* A week not held offers neither. */
    const missed = weekScreenViewOf({
      week: { ...midtown(7, [1, 2, 3, 4, 5, 6, 7].map((day) => midtownDay(day, MISSED, 'collective'))), contractId: 'c6' },
      towerToday: 'Tower',
      nameOf: NAME_OF,
      dayClosed: true,
      sheetStanding: true,
    });
    expect(missed.rush).toBeUndefined();
    expect(missed.onward).toBeUndefined();
  });

  it('draws the tower’s record of closed weeks, and nothing where none has closed', () => {
    const input = { week: midtown(2, []), towerToday: 'Midtown Office', nameOf: NAME_OF, dayClosed: false, sheetStanding: false };
    expect(weekScreenViewOf(input).record).toBeUndefined();
    expect(weekScreenViewOf({ ...input, record: { contractId: 'c2', closed: 0, met: 0, best: 0 } }).record).toBeUndefined();
    expect(weekScreenViewOf({ ...input, record: { contractId: 'c2', closed: 3, met: 2, best: 5 } }).record).toBe(
      'Your record on this tower: 3 weeks closed, 2 with the target met, and the most clean counted days in one week is 5.',
    );
  });
});

/*
 * **Your week numbers the week** — wave AN, lane AN-7, the post-AM panel's seats B and D: in week 2
 * no screen said which week it was. The eyebrow carries § D1252's ordinal where one is true of the
 * week, and nothing where the census does not deal the tower's week.
 */
describe('the week’s number on Your week', () => {
  it('reads WEEK n on every Scenario week, and no number on a sentinel’s — § D1394', () => {
    expect(viewOf({ ...openWeek('c2'), week: 2, day: 1, dayIdx: 0 }, false).eyebrow).toBe(
      'ELEVATOR SIM · EVERYDAY MODE · WEEK 2',
    );
    /* Garden Apartments, which the census does not deal: numbered since § D1394 (wave AO lane AO-5). */
    expect(viewOf(weekWith(3, []), false).eyebrow).toBe('ELEVATOR SIM · EVERYDAY MODE · WEEK 1');
    expect(viewOf({ ...openWeek('sandbox'), day: 3, dayIdx: 2 }, false).eyebrow).toBe('ELEVATOR SIM · EVERYDAY MODE');
  });

  /**
   * **A held week on a tower the census does not deal closes on its sheet and offers the next tower**
   * — the post-AN panel's seat C, D6, wave AO lane AO-5, § D1394. St Jude Hospital's week met its
   * target on Tuesday and, after Sunday, opened *MONDAY · DAY 8* with no sheet and no next tower. Red
   * before: no sheet, no onward offer and no primary on Your week.
   */
  it('draws a closed St Jude week’s sheet, without a house, and offers Midtown Office — § D1394', () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((day) => dayOf(day, day <= 2 ? MET : MISSED));
    const week: WeekState = { ...openWeek('c8'), day: 7, dayIdx: 6, closedDay: 7, history: days, cleanRun: 2 };
    expect(weekDealOf(week)).toBeUndefined();
    const view = viewOf(week, true);
    expect(view.eyebrow).toBe('ELEVATOR SIM · EVERYDAY MODE · WEEK 1');
    expect(view.sheet?.rows).toHaveLength(7);
    expect(view.sheet?.targetLine).toBe('Target 2: met.');
    expect(view.sheet?.houseLine).toContain('Nothing was run beside you this week');
    expect(view.onward?.contractId).toBe('c2');
    expect(view.primary).toBe('Play Midtown Office’s week');
    /* The control: the same week not held deals itself again, as a census week does (§ D1344). */
    const notHeld = viewOf({ ...week, history: days.map((day) => (day.day <= 2 ? dayOf(day.day, MISSED) : day)), cleanRun: 0 }, true);
    expect(notHeld.onward).toBeUndefined();
    expect(notHeld.primary).toBe('Play week 1 again');
  });
});

/*
 * Wave AO, lane DR-2, § D1443 (swarm DR's Q3): a week dealt from week 2 says on Your week whether
 * it passes the call bands in play, and the screen keeps the player's own record with each driver.
 */
describe('DC-13 and your record with each driver — § D1443', () => {
  const NAMES_OF: Readonly<Record<string, string>> = {
    'fairness-first': 'Fairness first',
    'predictive-balanced': 'Predictive balanced',
    'capacity-aware': 'Capacity aware',
  };
  const profileNameOf = (id: string): string | undefined => NAMES_OF[id];
  const viewWithNames = (week: WeekState) =>
    weekScreenViewOf({ week, towerToday: 'Midtown Office', nameOf: NAME_OF, dayClosed: false, sheetStanding: false, profileNameOf });

  /* Since § D1462 DC-13 is stated in days over the pool as dealt, one sentence per banded profile. */
  /*
   * Since § D1616 Midtown pools no week, its order held, so DC-13 has no level to state anything
   * about; the sentence over a pooled week is pinned in `weekView.preD1603.test.ts`.
   */
  it('states no DC-13 line on Midtown’s week 1 or week 2, because no week is pooled', () => {
    const week1: WeekState = { ...openWeek('c2'), day: 1, dayIdx: 0 };
    const week2: WeekState = { ...week1, week: 2 };
    expect(poolLevelReadingOf('c2', 2)).toBeUndefined();
    expect(viewWithNames(week1).bands).toEqual([]);
    expect(viewWithNames(week2).bands).toEqual([]);
  });

  it('counts this week’s days by the driver picked at the brief, and nothing before a day closes', () => {
    const day = (n: number, observed: GoalObservations, dispatcherId: string): DayOutcome => ({
      ...dayOf(n, observed),
      record: { buildingId: 'chancery-house', dispatcherId, interventions: [], ruleRows: [], outOfServiceCarIds: [] } as unknown as WatchRecord,
    });
    expect(driverRecordLinesOf(weekWith(1, []), profileNameOf)).toEqual([]);
    const week = weekWith(4, [day(1, MET, 'fairness-first'), day(2, MISSED, 'fairness-first'), day(3, MET, 'predictive-balanced'), day(4, TOO_QUIET, 'capacity-aware')]);
    expect(driverRecordLinesOf(week, profileNameOf)).toEqual([
      'You started 2 days this week with Fairness first: 1 cleared, 1 missed.',
      'You started 1 day this week with Predictive balanced: 1 cleared, 0 missed.',
    ]);
    expect(viewWithNames(week).drivers).toEqual(driverRecordLinesOf(week, profileNameOf));
  });
});
