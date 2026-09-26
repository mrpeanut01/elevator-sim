/**
 * `continueWeek.ts` — swarm DN's Q2.4, lane AL-F ([§ D1228](../../../../DECISIONS.md)): the mode
 * picker's entry back into a week under way, exactly while one is, and derived from the week.
 */

import { describe, expect, it } from 'vitest';

import { goalsForDay, readGoals } from '../shift/goals.js';
import { scheduledEventFor } from '../shift/calendar.js';
import { closeDay, nextDay, openWeek, outcomeOf } from '../shift/week.js';
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

  it('names the tower, the day standing and the count toward the target, and opens the door', () => {
    const tuesdayFiled = fileClean(nextDay(fileClean(openWeek('c2'))));
    expect(continueWeekEntryOf(tuesdayFiled, 'Midtown Office')).toEqual({
      title: CONTINUE_WEEK_TITLE,
      line: 'Midtown Office, Tuesday filed, Wednesday next · 2 of the 4 clean counted days the target asks for, so far',
      goes: 'door',
    });
    expect(continueWeekEntryOf(nextDay(tuesdayFiled), 'Midtown Office')?.line).toBe(
      'Midtown Office, Wednesday · 2 of the 4 clean counted days the target asks for, so far',
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
      line: 'Midtown Office: the week has closed, and its sheet beside the house is standing',
      goes: 'week',
    });
  });

  it('says no count where the census does not speak for the tower', () => {
    expect(continueWeekEntryOf(fileClean(openWeek('c1')), 'Garden Apartments')?.line).toBe(
      'Garden Apartments, Monday filed, Tuesday next',
    );
  });
});
