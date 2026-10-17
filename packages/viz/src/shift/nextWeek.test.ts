/**
 * A held week deals the next week, and *harder* only where the house's census fell — wave AN, lane
 * DQ-2, [§ D1344](../../../../DECISIONS.md). See `nextWeek.ts`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { scheduledEventFor } from './calendar.js';
import { goalsForDay, readGoals } from './goals.js';
import {
  harderReadingOf,
  houseCensusOverDays,
  houseWeekCensusOf,
  NEXT_WEEK_LABEL,
  nextWeekOf,
  weekHarderOf,
  weekBookingsLineOf,
  weekHarderSentenceOf,
  weekUnderWayHarderLineOf,
  type HouseWeekCensus,
} from './nextWeek.js';
import { clockOf } from './report.js';
import type { DayOutcome, WeekState } from './types.js';
import { closeDay, nextDay, openWeek, outcomeOf, rollWeek } from './week.js';
import { weekOrderIndexOf } from './weekOrders.js';
import { CONTRACTS } from './contracts.js';
import { weekDealOf } from './weekStake.js';
import { WEEK_WAY, weekWayRowFor } from './weekWay.js';
import { POOL_CENSUS } from './weekPool.js';

const MET = {
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
};
const MISSED = { ...MET, carryPct: 10, minutePct: 10, peakQueue: 99, abandoned: 9, worstWaitS: 940, workPerServedLegKJ: 260.5 };

/** Week `number` of Midtown played Monday to Friday, clean where `days[i]` is true, standing on Friday filed. */
function midtownWeek(number: number, days: readonly boolean[]): WeekState {
  let week: WeekState = { ...openWeek('c2'), week: number };
  days.forEach((met, index) => {
    if (index > 0) week = nextDay(week);
    const outcome: DayOutcome = outcomeOf({
      record: null,
      recordRefusal: null,
      day: week.day,
      dayIdx: week.dayIdx,
      eventId: scheduledEventFor(null, week.day, week.dayIdx, 'whole-day', week).id,
      arrived: MET.arrived,
      carried: MET.arrived,
      minutePct: met ? 100 : 10,
      readings: readGoals(goalsForDay(week.day), met ? MET : MISSED),
    });
    week = closeDay(week, outcome);
  });
  return week;
}

const HELD = [true, true, true, true, false];
const NOT_HELD = [true, true, true, false, false];

/** A house census of `crowds` crowds clearing `perCrowd[i]` weekdays on crowd `i`. */
function census(perCrowd: readonly number[]): HouseWeekCensus {
  return {
    perCrowd,
    cleared: perCrowd.reduce((sum, value) => sum + value, 0),
    of: perCrowd.length * 5,
    crowds: perCrowd.length,
  };
}

describe('the roll: a held week deals the next week, and one that was not deals itself again', () => {
  it('advances the week number on a held week and keeps it on one that was not', () => {
    expect(rollWeek(midtownWeek(1, HELD)).week).toBe(2);
    expect(rollWeek(midtownWeek(1, NOT_HELD)).week).toBe(1);
    expect(rollWeek(midtownWeek(2, NOT_HELD)).week).toBe(2);
  });

  it('goes on to the next week from one that was not held when told to, because nothing is locked', () => {
    expect(rollWeek(midtownWeek(1, NOT_HELD), true).week).toBe(2);
    expect(rollWeek(midtownWeek(1, HELD), true).week).toBe(2);
  });

  it('deals the week’s own wrinkles again on a week that was not held', () => {
    const again = rollWeek(midtownWeek(1, NOT_HELD));
    for (let day = 1; day <= 5; day += 1) {
      expect(scheduledEventFor(null, day, day - 1, 'whole-day', again).id).toBe(
        scheduledEventFor(null, day, day - 1, 'whole-day', { contractId: 'c2', week: 1 }).id,
      );
    }
  });
});

describe('the sheet: what it deals next, and its presses', () => {
  it('on a held week deals the next week under the label it always had, with no second press', () => {
    const next = nextWeekOf(midtownWeek(1, HELD));
    expect(next?.held).toBe(true);
    expect(next?.week).toBe(2);
    expect(next?.label).toBe(NEXT_WEEK_LABEL);
    expect(next?.onward).toBeUndefined();
    expect(next?.line).toMatch(/^You held week 1, so Start next week deals week 2, with /u);
  });

  it('on a week that was not held plays it again, and offers the next week beside it', () => {
    const next = nextWeekOf(midtownWeek(1, NOT_HELD));
    expect(next?.held).toBe(false);
    expect(next?.week).toBe(1);
    expect(next?.label).toBe('Play week 1 again');
    expect(next?.onward).toEqual({ week: 2, label: 'Go on to week 2' });
    expect(next?.line).toMatch(/^This week’s target was not met, so Play week 1 again deals the same wrinkles on new crowds\. Nothing is locked: Go on to week 2 deals the next week instead, with /u);
  });

  it('says a week with no counted day had no target, rather than that it was missed', () => {
    const noTarget = CONTRACTS.find((contract) => weekDealOf(contract.id)?.target === 0);
    expect(noTarget, 'the shipped census deals one tower a week with no counted day').toBeDefined();
    if (noTarget === undefined) return;
    const next = nextWeekOf({ ...openWeek(noTarget.id), day: 5, dayIdx: 4 });
    expect(next?.held).toBe(false);
    expect(next?.line).toMatch(/^This week had no target to meet, so Play week 1 again deals /u);
  });

  /**
   * Since § D1394 (wave AO lane AO-5) a week the census does not deal closes on Sunday too, so its
   * sheet says what it deals next: the same draw, held or not, against the contract's `needClean`.
   * Red before: `undefined`, the week running on with no sheet. The control: a sentinel week.
   */
  it('deals next on a tower whose week the census does not deal, and says nothing on a sentinel’s — § D1394', () => {
    const held = nextWeekOf({ ...midtownWeek(1, HELD), contractId: 'c1' });
    expect(held?.held).toBe(true);
    expect(held?.week).toBe(2);
    expect(held?.line).toContain('the same wrinkles as this week');
    const notHeld = nextWeekOf({ ...midtownWeek(1, [false, false, false, false, false]), contractId: 'c8' });
    expect(notHeld?.held).toBe(false);
    expect(notHeld?.label).toBe('Play week 1 again');
    expect(nextWeekOf({ ...midtownWeek(1, HELD), contractId: 'sandbox' })).toBeUndefined();
  });

  it('names the wrinkles honestly: the same ones where the next week is dealt the same order', () => {
    const next = nextWeekOf(midtownWeek(1, HELD));
    const same = weekOrderIndexOf({ contractId: 'c2', week: 1 }) === weekOrderIndexOf({ contractId: 'c2', week: 2 });
    expect(next?.line.includes('the same wrinkles as this week')).toBe(same);
  });
});

describe('harder, only where the house’s census fell', () => {
  it('reads the house’s census off DC-10’s standing marks for each weekday as dealt', () => {
    const house = houseWeekCensusOf({ contractId: 'c2', week: 1 });
    expect(house?.crowds).toBe(WEEK_WAY.protocol.heldOutCount);
    expect(house?.of).toBe(5 * WEEK_WAY.protocol.heldOutCount);
    let expected = 0;
    for (const day of [1, 2, 3, 4, 5]) {
      const eventId = scheduledEventFor(null, day, day - 1, 'whole-day').id;
      const marks = weekWayRowFor('c2', day, eventId, 'whole-day')?.standingVerdicts ?? '';
      expected += [...marks].filter((mark) => mark === 'C').length;
    }
    expect(house?.cleared).toBe(expected);
  });

  it('is undefined where a weekday has no row under exactly its wrinkle', () => {
    expect(houseCensusOverDays('c2', ['ordinary', 'goods-inward', 'not-measured', 'audit-day', 'late-finish'])).toBeUndefined();
    expect(houseCensusOverDays('c2', ['ordinary'])).toBeUndefined();
  });

  it('calls a week harder only when the paired interval on the per-crowd difference lies below zero', () => {
    const from = census([3, 2, 3, 2, 3, 2, 3, 2, 3, 2]);
    expect(harderReadingOf(from, census([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]))?.harder).toBe(true);
    /* A fall on some crowds and a rise on others, centred on zero: not harder. */
    expect(harderReadingOf(from, census([4, 1, 2, 3, 2, 3, 4, 1, 2, 3]))?.harder).toBe(false);
    /* A rise is never called harder, and nothing calls it easier. */
    expect(harderReadingOf(from, census([5, 4, 5, 4, 5, 4, 5, 4, 5, 4]))?.harder).toBe(false);
    expect(harderReadingOf(from, census([1, 1]))).toBeUndefined();
  });

  it('draws the sentence exactly where the reading says harder, with the counts it read', () => {
    for (const week of [2, 3, 4]) {
      const reading = weekHarderOf('c2', week - 1, week);
      const sentence = weekHarderSentenceOf('c2', week - 1, week);
      expect(sentence !== undefined, `week ${String(week)}`).toBe(reading?.harder === true);
      if (reading?.harder === true) {
        expect(sentence).toBe(
          `Week ${String(week)} is harder than week ${String(week - 1)} by the house’s measure: left alone on ` +
            `the same ${String(reading.to.crowds)} crowds, the house cleared ${String(reading.to.cleared)} of ` +
            `week ${String(week)}’s ${String(reading.to.of)} weekdays, against ${String(reading.from.cleared)} of ` +
            `week ${String(week - 1)}’s.`,
        );
      }
      expect(weekUnderWayHarderLineOf({ contractId: 'c2', week })).toBe(sentence);
    }
  });

  it('draws nothing on the door in week 1, or on a tower the census does not deal', () => {
    expect(weekUnderWayHarderLineOf({ contractId: 'c2', week: 1 })).toBeUndefined();
    expect(weekUnderWayHarderLineOf({ contractId: 'c1', week: 3 })).toBeUndefined();
  });
});

/*
 * The shipped census, pinned — § D1345. Week 2 deals `midtown-early-lift`, and the house, left
 * alone, cleared 12 of its 100 weekdays on the held-out crowds against 21 of week 1's, a paired
 * interval wholly below zero; week 3 deals the same order again, so nothing calls it harder.
 */
describe('Midtown’s next week, as the census measured it', () => {
  const HARDER =
    'Week 2 is harder than week 1 by the house’s measure: left alone on the same 20 crowds, the ' +
    'house cleared 12 of week 2’s 100 weekdays, against 21 of week 1’s.';

  it('calls week 2 harder than week 1, on the sheet of a held week 1 and on week 2’s door', () => {
    const reading = weekHarderOf('c2', 1, 2);
    expect([reading?.from.cleared, reading?.to.cleared, reading?.harder]).toEqual([21, 12, true]);
    expect(reading?.estimate.upper ?? 0).toBeLessThan(0);
    expect(nextWeekOf(midtownWeek(1, HELD))?.line).toBe(
      `You held week 1, so Start next week deals week 2, with a different wrinkle on every weekday. ${HARDER}`,
    );
    expect(weekUnderWayHarderLineOf({ contractId: 'c2', week: 2 })).toBe(HARDER);
  });

  /* Since § D1461 the pool withdraws week 3, which a held week 2's sheet now says. */
  it('says Midtown deals no week past 2, and why the pool withdrew week 3', () => {
    expect(nextWeekOf(midtownWeek(2, HELD), WEEK_WAY, MIDTOWN_CLOCK)?.line).toBe(
      'You held week 2. This tower deals no further week: Start next week deals week 3 as this week was ' +
        'dealt, the same wrinkles, on new crowds. Week 3 is withdrawn: left alone, Contract-net auction, ' +
        'sealed bid holds it on 5 % of weeks against 0 % of week 2’s, and no driver may hold a week more ' +
        'often than the week below it.',
    );
  });
});

/*
 * § D1400's authored levels as the pool census plays them (`weekPool.ts#POOL_CENSUS`): the sentences
 * a level's sheet and door would say, kept under test while the pool withdraws weeks 3 and 4.
 */
describe('Midtown’s authored levels, as the census plays them', () => {
  beforeAll(() => {
    POOL_CENSUS.measuring = true;
  });
  afterAll(() => {
    POOL_CENSUS.measuring = false;
  });

  /*
   * Wave AO, lane DS-1 (§ D1400, § D1401): from week 3 a held week deals the next level, the same
   * order with one more car out. Red before: *with the same wrinkles as this week.*, nothing new.
   */
  it('deals week 3 the same order with car C out on Monday morning, and calls it nothing harder', () => {
    expect(nextWeekOf(midtownWeek(2, HELD), WEEK_WAY, MIDTOWN_CLOCK)?.line).toBe(
      'You held week 2, so Start next week deals week 3, with the same wrinkles as this week and one ' +
        'more car out of passenger service: car C on Monday from 08:00 until 12:00.',
    );
    expect(weekUnderWayHarderLineOf({ contractId: 'c2', week: 3 })).toBeUndefined();
    /* The house fell by one crowd's Monday, an interval that holds zero: no *harder*, and no *easier*. */
    const reading = weekHarderOf('c2', 2, 3);
    expect([reading?.from.cleared, reading?.to.cleared, reading?.harder]).toEqual([12, 11, false]);
  });

  it('deals week 4 with Tuesday’s booking beside Monday’s, and names on the door which one is new', () => {
    expect(nextWeekOf(midtownWeek(3, HELD), WEEK_WAY, MIDTOWN_CLOCK)?.line).toBe(
      'You held week 3, so Start next week deals week 4, with the same wrinkles as this week and one ' +
        'more car out of passenger service: car C on Tuesday from 08:00 until 12:00.',
    );
    expect(weekBookingsLineOf({ contractId: 'c2', week: 3 }, WEEK_WAY, MIDTOWN_CLOCK)).toBe(
      'Booked this week: car C is out of passenger service on Monday from 08:00 until 12:00, new this week.',
    );
    expect(weekBookingsLineOf({ contractId: 'c2', week: 4 }, WEEK_WAY, MIDTOWN_CLOCK)).toBe(
      'Booked this week: car C is out of passenger service on Monday from 08:00 until 12:00; car C is out ' +
        'of passenger service on Tuesday from 08:00 until 12:00, new this week.',
    );
    expect(weekBookingsLineOf({ contractId: 'c2', week: 2 })).toBeUndefined();
    expect(weekBookingsLineOf({ contractId: 'c1', week: 4 })).toBeUndefined();
  });

  /*
   * The census refuses week 5 (Thursday with car C out clears 7 of 20 under the chosen play), so
   * week 4 is Midtown's last level. Red before: *deals week 5, with the same wrinkles*.
   */
  it('says Midtown deals no further week after week 4, and offers no Go on beside a week 4 not held', () => {
    const held = nextWeekOf(midtownWeek(4, HELD), WEEK_WAY, MIDTOWN_CLOCK);
    expect(held?.line).toBe(
      'You held week 4. This tower deals no further week: Start next week deals week 5 as this week was ' +
        'dealt, the same wrinkles and the same cars out, on new crowds.',
    );
    expect(held?.week).toBe(5);
    const missed = nextWeekOf(midtownWeek(4, NOT_HELD), WEEK_WAY, MIDTOWN_CLOCK);
    expect(missed?.line).toBe(
      'This week’s target was not met, so Play week 4 again deals the same wrinkles and the same cars out ' +
        'on new crowds. This tower deals no further week.',
    );
    expect(missed?.onward).toBeUndefined();
    /* Week 5 is dealt week 4: its door names the same bookings and none as new. */
    expect(weekBookingsLineOf({ contractId: 'c2', week: 5 }, WEEK_WAY, MIDTOWN_CLOCK)).not.toContain('new this week');
  });
});

/** Midtown's run clock: the office day starts at 08:00 and runs ten hours (`dayLength.ts#wholeDayFor`). */
function MIDTOWN_CLOCK(fraction: number): string {
  return clockOf(fraction * 10 * 3600, 8 * 3600);
}
