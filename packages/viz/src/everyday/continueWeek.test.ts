/**
 * `continueWeek.ts` — swarm DN's Q2.4, lane AL-F ([§ D1228](../../../../DECISIONS.md)): the mode
 * picker's entry back into a week under way, exactly while one is, and derived from the week.
 */

import { describe, expect, it } from 'vitest';

import { goalsForDay, readGoals } from '../shift/goals.js';
import { scheduledEventFor } from '../shift/calendar.js';
import { closeDay, nextDay, openWeek, outcomeOf, rollWeek } from '../shift/week.js';
import type { WeekState } from '../shift/types.js';

import { CONTINUE_WEEK_TITLE, continueWeekEntryOf } from './continueWeek.js';

function fileClean(week: WeekState): WeekState {
  return closeDay(
    week,
    outcomeOf({
      day: week.day,
      dayIdx: week.dayIdx,
      eventId: scheduledEventFor(null, week.day, week.dayIdx, 'whole-day').id,
      arrived: 400,
      carried: 400,
      minutePct: 100,
      readings: readGoals(goalsForDay(week.day), {
        arrived: 400,
        carryPct: 100,
        minutePct: 100,
        peakQueue: 0,
        abandoned: 0,
        abandonedCarried: 0,
        horizonS: 900,
        worstWaitS: 40,
        worstWaitIsCensored: false,
        workPerServedLegKJ: 41.2,
      }),
      record: null,
      recordRefusal: null,
    }),
  );
}

describe('continue your week — § D1228', () => {
  it('is absent before a day of the week is filed, and on a week on no scenario', () => {
    expect(continueWeekEntryOf(openWeek('c2'), 'Midtown Office')).toBeUndefined();
    expect(continueWeekEntryOf(fileClean(openWeek('sandbox')), 'My tower')).toBeUndefined();
  });

  it('offers a first week whose first day is begun, and says the day is under way — § D1369', () => {
    /*
     * The post-AN panel's seat D (D4): the pinned Monday started and the page reloaded, and the
     * picker drew no entry because nothing had been filed. Red before `dayBegun`: `undefined`.
     */
    const entry = continueWeekEntryOf(openWeek('c2'), 'Midtown Office', true);
    expect(entry?.goes).toBe('door');
    expect(entry?.line).toMatch(/^Midtown Office, week 1, Monday under way/u);
    /* Nothing begun on a week on no scenario is still nothing to continue. */
    expect(continueWeekEntryOf(openWeek('sandbox'), 'My tower', true)).toBeUndefined();
    /* And a filed day reads as filed, whatever stands on the next one. */
    expect(continueWeekEntryOf(fileClean(openWeek('c2')), 'Midtown Office', true)?.line).toMatch(
      /Monday filed, Tuesday next/u,
    );
  });

  it('names the tower, the day standing and the count toward the target, and opens the door', () => {
    const tuesdayFiled = fileClean(nextDay(fileClean(openWeek('c2'))));
    expect(continueWeekEntryOf(tuesdayFiled, 'Midtown Office')).toEqual({
      title: CONTINUE_WEEK_TITLE,
      line: 'Midtown Office, week 1, Tuesday filed, Wednesday next · 2 of the 4 clean counted days the target asks for, so far',
      goes: 'door',
    });
    expect(continueWeekEntryOf(nextDay(tuesdayFiled), 'Midtown Office')?.line).toBe(
      'Midtown Office, week 1, Wednesday · 2 of the 4 clean counted days the target asks for, so far',
    );
  });

  it('opens the week’s sheet once the week has closed', () => {
    let week = openWeek('c2');
    for (let day = 1; day <= 7; day += 1) {
      week = fileClean(week);
      if (day < 7) week = nextDay(week);
    }
    expect(continueWeekEntryOf(week, 'Midtown Office')).toEqual({
      title: CONTINUE_WEEK_TITLE,
      line: 'Midtown Office, week 1: the week has closed, and its sheet beside the house is standing',
      goes: 'week',
    });
  });

  /*
   * Wave AN, lane AN-7, carried from the post-AL panel and found again by the post-AM panel's seats
   * B and D: after *Start next week* the picker showed no entry until a day of the new week was
   * filed, because the roll empties the history. A later week is under way from its first morning.
   */
  it('offers a later week from its first morning, numbered, with nothing filed', () => {
    let week = openWeek('c2');
    for (let day = 1; day <= 5; day += 1) {
      week = fileClean(week);
      if (day < 5) week = nextDay(week);
    }
    const second = rollWeek(week);
    expect(second.history).toHaveLength(0);
    expect(continueWeekEntryOf(second, 'Midtown Office')).toEqual({
      title: CONTINUE_WEEK_TITLE,
      line: 'Midtown Office, week 2, Monday · 0 of the 4 clean counted days the target asks for, so far',
      goes: 'door',
    });
    /* A first week with nothing filed is still Scenario's to open. */
    expect(continueWeekEntryOf(openWeek('c2'), 'Midtown Office')).toBeUndefined();
  });

  /*
   * Wave AN, lane DQ-2 (§ D1344): a week that was not held is dealt itself again and keeps its
   * number, so a week 1 played again starts with nothing filed. It is still a week the player chose
   * to carry on, and the tile offers it from its first morning, as a later week is.
   */
  it('offers a week dealt again after it was not held, from its first morning', () => {
    const again = rollWeek(fileClean(openWeek('c2')));
    expect([again.week, again.history.length]).toEqual([1, 0]);
    expect(continueWeekEntryOf(again, 'Midtown Office')?.line).toMatch(/^Midtown Office, week 1, Monday · 0 of the /u);
  });

  it('says no count where the census does not speak for the tower, and the week’s number — § D1394', () => {
    /* Since § D1394 (wave AO lane AO-5) every Scenario week ends and rolls, so each carries its number. */
    expect(continueWeekEntryOf(fileClean(openWeek('c1')), 'Garden Apartments')?.line).toBe(
      'Garden Apartments, week 1, Monday filed, Tuesday next',
    );
  });
});
