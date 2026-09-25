/**
 * **The Engineer rail names today as the Everyday brief does** — the post-AI panel's seat C and seat
 * D (D6), and seat B's defect 4.
 *
 * A fresh player pressed *Switch to Engineer* on St Jude's pinned day 1 and read *An ordinary day —
 * Nothing booked. The building is the only thing in the way.* on the rail, one door from a brief
 * saying cars D and E are booked out 08:37–08:46. The rail read the calendar's event straight, and the
 * brief read the run. Both are asked of the same state here.
 */

import { describe, expect, it } from 'vitest';

import { briefTodayOf } from '../everyday/today.test-helper.js';
import { wrinkleNameOf } from '../shift/bookedOut.js';
import { contractBuildings, contractDayState } from '../shift/contractDay.test-helper.js';
import { SHIFT_EVENTS } from '../shift/events.js';
import { pressDayFor } from '../shift/ladder.js';
import { openWeek } from '../shift/week.js';

import { todaysShiftOf } from './leftRail.js';

const CALL_DAY_NAME = wrinkleNameOf(SHIFT_EVENTS.ordinary, true);

describe('the Engineer rail’s today', () => {
  const resources = contractBuildings();

  it('names the tower’s booked cars on St Jude’s pinned day, and calls it a day with a call', () => {
    const press = pressDayFor('c8');
    if (press === undefined) throw new Error('c8 pins a day');
    const state = contractDayState('c8', { seed: BigInt(press.seedText), dispatcherId: press.standingOrder });
    const shift = todaysShiftOf(resources, state);
    expect(shift.note).not.toContain('Nothing booked');
    expect(shift.note).toContain('cars D and E');
    expect(shift.name).toBe(CALL_DAY_NAME);
    expect(shift.name).not.toBe(SHIFT_EVENTS.ordinary.name);
    /* And it is the brief's sentence and the brief's name, over the same state. */
    const today = briefTodayOf(resources, state);
    expect(shift.note).toBe(today.wrinkleNote);
    expect(shift.name).toBe(today.wrinkleName);
  });

  it('keeps the calendar’s name on a day that is not the pinned one', () => {
    const state = contractDayState('c8', { seed: 1n, over: { week: { ...openWeek('c8'), day: 2, dayIdx: 1 } } });
    const shift = todaysShiftOf(resources, state);
    expect(shift.name).not.toBe(CALL_DAY_NAME);
    const today = briefTodayOf(resources, state);
    expect(shift.name).toBe(today.wrinkleName);
    expect(shift.note).toBe(today.wrinkleNote);
  });
});
