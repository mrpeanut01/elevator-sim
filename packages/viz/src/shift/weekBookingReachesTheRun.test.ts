/**
 * **No week level's booking reaches a Midtown run on the fixed engine** — wave AO, lane DS-1,
 * [§ D1400](../../../../DECISIONS.md), held by [§ D1616](../../../../DECISIONS.md).
 *
 * The shipped tower, pinned on the legs. § D1616 holds `midtown-early-lift`, the order Midtown's
 * levels add their bookings to, so no week deals a level and no Midtown run stands a car down for
 * one: week 2 and week 3 deal week 1's draw on the same crowd, and their Mondays are one run. The
 * wiring the booking travels on is tested on a real level in
 * `weekBookingReachesTheRun.preD1603.test.ts`, on the census as measured before the fix.
 *
 * The comparison string is `scope/probes.test-helper.ts#legsOf`, passenger, car and boarding instant
 * in the recording's own order, never a mean.
 */

import { describe, expect, it } from 'vitest';

import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { legsOf, RESOURCES } from '../scope/probes.test-helper.js';

import { carAbsencesOf } from './bookedOut.js';
import { contractDayState } from './contractDay.test-helper.js';
import { openWeek } from './week.js';
import { weekTopOf } from './weekLevels.js';

/** Day `day` of Midtown's week `week`, as the week deals it, on one fixed crowd. */
function midtownDay(week: number, day: number, over: Partial<ViewerState> = {}): ViewerState {
  return contractDayState('c2', {
    seed: 20261001n,
    over: { week: { ...openWeek('c2'), week, day, dayIdx: day - 1 }, campaignEventId: undefined, ...over },
  });
}

/** Car C's window out of passenger service on the run's own building, or `undefined`. */
function carCOut(state: ViewerState): { readonly awayAtS: number; readonly backAtS: number | null } | undefined {
  return carAbsencesOf(shiftRunConfigOf(RESOURCES, state).building).find((car) => car.carId === 'C');
}

describe('the shipped tower deals no level, with its order held — § D1616', () => {
  it('deals weeks 2 and 3’s Mondays as week 1 dealt it, with every car in service', () => {
    expect(weekTopOf('c2')).toBe(1);
    for (const week of [2, 3, 4]) expect(carCOut(midtownDay(week, 1)), `week ${String(week)}`).toBeUndefined();
    expect(legsOf(midtownDay(2, 1))).toBe(legsOf(midtownDay(1, 1)));
    expect(legsOf(midtownDay(3, 1))).toBe(legsOf(midtownDay(2, 1)));
  });
});
