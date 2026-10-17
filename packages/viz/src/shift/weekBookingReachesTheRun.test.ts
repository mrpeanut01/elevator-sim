/**
 * **A week level's booking reaches the run, compared on the legs** — wave AO, lane DS-1,
 * [§ D1400](../../../../DECISIONS.md), the standing requirement's rule (§ D177, § D219): move the
 * control and require the run to change.
 *
 * The control is the week's number. Midtown's week 3 is dealt the same order as week 2 with one
 * booking more (`data/contract-ladder.json`'s first `weekBookings` entry: car C out of passenger
 * service on Monday from the start of the run to 0.4 of it). Nothing here hands a booking in: the
 * state carries only the week, and `dev/state.ts#shiftRunConfigOf` reads the booking off it through
 * `shift/weekLevels.ts#weekBookingsOn`, which is the path every Scenario day takes. So unwiring that
 * default turns this file red rather than leaving the sheet naming a car the run never stood down.
 *
 * The comparison string is `scope/probes.test-helper.ts#legsOf`, passenger, car and boarding instant
 * in the recording's own order, never a mean.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { legsOf, RESOURCES } from '../scope/probes.test-helper.js';

import { carAbsencesOf } from './bookedOut.js';
import { contractDayState } from './contractDay.test-helper.js';
import { openWeek } from './week.js';
import { weekTopOf } from './weekLevels.js';
import { POOL_CENSUS } from './weekPool.js';

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

/*
 * Since § D1461 the week pool withdraws Midtown's weeks 3 and 4 (the monotone clause over the pool as
 * dealt), so the authored levels are reached here as the census plays them (`weekPool.ts#POOL_CENSUS`):
 * the wiring under test is the same path, and the next block pins what the shipped tower deals.
 */
describe('a week level books its car out on the run itself, as the census plays the authored levels', () => {
  beforeAll(() => {
    POOL_CENSUS.measuring = true;
  });
  afterAll(() => {
    POOL_CENSUS.measuring = false;
  });

  it('stands car C down on week 3’s Monday from the first instant to 0.4 of the run, and not on week 2’s', () => {
    const level = midtownDay(3, 1);
    expect(carCOut(level)).toMatchObject({ awayAtS: 0, backAtS: 0.4 * level.shiftLengthS });
    expect(carCOut(midtownDay(2, 1))).toBeUndefined();
  });

  it('changes week 3’s Monday on the legs, and leaves its Tuesday as week 2 dealt it', () => {
    expect(legsOf(midtownDay(3, 1))).not.toBe(legsOf(midtownDay(2, 1)));
    /* The control's other side: the booking is Monday's, so Tuesday's run is the same run. */
    expect(legsOf(midtownDay(3, 2))).toBe(legsOf(midtownDay(2, 2)));
  });

  it('adds Tuesday’s booking in week 4, keeps Monday’s, and deals week 5 as week 4', () => {
    expect(carCOut(midtownDay(4, 2))).toBeDefined();
    expect(carCOut(midtownDay(4, 1))).toBeDefined();
    /* Week 5 is past Midtown's top (the census refuses its Thursday), so Thursday keeps every car. */
    expect(carCOut(midtownDay(5, 4))).toBeUndefined();
    expect(legsOf(midtownDay(5, 2))).toBe(legsOf(midtownDay(4, 2)));
  });

  it('never books a car out of a run that stands on no rung', () => {
    expect(carCOut(midtownDay(3, 1, { playMode: 'free-play' }))).toBeUndefined();
  });
});

describe('the shipped tower deals no level the pool withdrew — § D1461', () => {
  it('deals week 3’s Monday as week 2 dealt it, with every car in service', () => {
    expect(weekTopOf('c2')).toBe(2);
    expect(carCOut(midtownDay(3, 1))).toBeUndefined();
    expect(legsOf(midtownDay(3, 1))).toBe(legsOf(midtownDay(2, 1)));
  });
});
