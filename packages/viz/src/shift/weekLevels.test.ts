/**
 * **From week 3 a held week deals the next level** — wave AO, lane DS-1, swarm DS's Q1 ruling
 * ([§ D1400](../../../../DECISIONS.md), [§ D1401](../../../../DECISIONS.md)). See `weekLevels.ts`.
 *
 * The shipped census, pinned: Midtown's week 3 adds car C out on Monday morning and week 4 the same
 * on Tuesday, both admitted by DC-10, DC-11 and the monotone clause; week 5's booking falls on
 * Thursday, the day with the most room left, and DC-10 refuses it (7 of 20), so week 4 is the top.
 * Then each clause of the rule moved on a fixture and the verdict following it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CONTRACT_LADDER, type ContractLadder, type ContractWeekBooking } from './ladder.js';
import { WEEK_DOMINANCE, type WeekDominance } from './weekDominance.js';
import {
  authoredLevelOf,
  bookingPhraseOf,
  dealtWeekOf,
  hasFurtherWeek,
  weekBookingsOn,
  weekLevelAdmissionOf,
  weekLevelAwardKeyOf,
  weekLevelIssues,
  weekTopOf,
} from './weekLevels.js';
import { WEEK_WAY } from './weekWay.js';
import { POOL_CENSUS } from './weekPool.js';

/** The shipped ladder with Midtown's bookings replaced. */
function ladderWith(bookings: readonly ContractWeekBooking[]): ContractLadder {
  return {
    ...CONTRACT_LADDER,
    rows: CONTRACT_LADDER.rows.map((row) => (row.contractId === 'c2' ? { ...row, weekBookings: bookings } : row)),
  };
}

const SHIPPED_BOOKINGS = CONTRACT_LADDER.rows.find((row) => row.contractId === 'c2')?.weekBookings ?? [];

describe('Midtown’s levels, as the census measured them', () => {
  /*
   * § D1400's authored ladder, read as the pool census plays it (`weekPool.ts#POOL_CENSUS`): since
   * § D1461 the pool withdraws weeks 3 and 4, which the block after this one pins.
   */
  beforeAll(() => {
    POOL_CENSUS.measuring = true;
  });
  afterAll(() => {
    POOL_CENSUS.measuring = false;
  });

  it('authors three bookings, each car C out of passenger service from the start of the run to 0.4 of it', () => {
    expect(SHIPPED_BOOKINGS.map((booking) => [booking.day, booking.carId, booking.fromFraction, booking.toFraction])).toEqual([
      [1, 'C', 0, 0.4],
      [2, 'C', 0, 0.4],
      [4, 'C', 0, 0.4],
    ]);
    expect(weekLevelIssues()).toEqual([]);
  });

  it('admits weeks 3 and 4, and refuses week 5 on DC-10’s Thursday', () => {
    const three = weekLevelAdmissionOf('c2', 3);
    expect([three?.verdict, three?.dominance.strongest?.held, three?.monotone.rising]).toEqual(['admitted', 10, []]);
    const four = weekLevelAdmissionOf('c2', 4);
    expect([four?.verdict, four?.dominance.strongest?.held, four?.monotone.rising]).toEqual(['admitted', 8, []]);
    const five = weekLevelAdmissionOf('c2', 5);
    expect(five?.verdict).toBe('refused');
    expect(five?.because).toBe('DC-10 refuses Thursday as this level deals it');
    expect(five?.days[3]?.row?.chosenVerdicts.split('').filter((mark) => mark === 'C')).toHaveLength(7);
    expect(weekLevelAdmissionOf('c2', 6)).toBeUndefined();
  });

  it('accumulates bookings and never sheds one', () => {
    const three = authoredLevelOf('c2', 3);
    const four = authoredLevelOf('c2', 4);
    expect(three?.bookings).toEqual(SHIPPED_BOOKINGS.slice(0, 1));
    expect(four?.bookings).toEqual(SHIPPED_BOOKINGS.slice(0, 2));
    expect(four?.added.day).toBe(2);
    expect(three?.order.id).toBe('midtown-early-lift');
  });

  it('tops Midtown at week 4, and deals a week numbered past it as week 4', () => {
    expect(weekTopOf('c2')).toBe(4);
    expect(dealtWeekOf({ contractId: 'c2', week: 3 })).toBe(3);
    expect(dealtWeekOf({ contractId: 'c2', week: 9 })).toBe(4);
    expect(hasFurtherWeek({ contractId: 'c2', week: 3 })).toBe(true);
    expect(hasFurtherWeek({ contractId: 'c2', week: 4 })).toBe(false);
    /* A tower with no admitted order deals week 1's draw every week: its top is week 1. */
    expect(weekTopOf('c1')).toBe(1);
    expect(dealtWeekOf({ contractId: 'c1', week: 5 })).toBe(1);
  });

  it('hands the run a day’s bookings only on the level’s booked weekdays', () => {
    expect(weekBookingsOn({ contractId: 'c2', week: 3 }, 1, 0)).toHaveLength(1);
    expect(weekBookingsOn({ contractId: 'c2', week: 3 }, 2, 1)).toEqual([]);
    expect(weekBookingsOn({ contractId: 'c2', week: 4 }, 2, 1)).toHaveLength(1);
    expect(weekBookingsOn({ contractId: 'c2', week: 2 }, 1, 0)).toEqual([]);
    expect(weekBookingsOn({ contractId: 'c2', week: 4 }, 6, 5)).toEqual([]);
    expect(weekBookingsOn({ contractId: 'c2', week: 9 }, 4, 3), 'week 9 dealt Thursday’s refused booking').toEqual([]);
  });

  it('keys a held week’s award by the level it was dealt, so the top pays once', () => {
    expect(weekLevelAwardKeyOf({ contractId: 'c2', week: 3 })).toBe('c2/3');
    expect(weekLevelAwardKeyOf({ contractId: 'c2', week: 4 })).toBe('c2/4');
    expect(weekLevelAwardKeyOf({ contractId: 'c2', week: 7 })).toBe('c2/4');
    expect(weekLevelAwardKeyOf({ contractId: 'c8', week: 3 })).toBe('c8/1');
  });

  it('names a booking by its car, its day and the run’s clock, and by no time where there is no clock', () => {
    const monday = SHIPPED_BOOKINGS[0];
    if (monday === undefined) throw new Error('no booking');
    const clock = (fraction: number): string => `${String(8 + Math.round(fraction * 10))}:00`;
    expect(bookingPhraseOf(monday, clock)).toBe('car C is out of passenger service on Monday from 8:00 until 12:00');
    expect(bookingPhraseOf(monday, clock, 'short')).toBe('car C on Monday from 8:00 until 12:00');
    expect(bookingPhraseOf(monday)).toBe('car C is out of passenger service on Monday for part of the day');
  });
});

describe('Midtown’s levels as the pool deals them — § D1461', () => {
  it('tops Midtown at week 2, where the monotone clause over the pool withdraws week 3', () => {
    expect(weekTopOf('c2')).toBe(2);
    expect(dealtWeekOf({ contractId: 'c2', week: 4 })).toBe(2);
    expect(hasFurtherWeek({ contractId: 'c2', week: 2 })).toBe(false);
    expect(weekBookingsOn({ contractId: 'c2', week: 3 }, 1, 0)).toEqual([]);
    expect(weekLevelAwardKeyOf({ contractId: 'c2', week: 4 })).toBe(weekLevelAwardKeyOf({ contractId: 'c2', week: 2 }));
  });
});

describe('each clause of the rule, moved', () => {
  it('refuses a level the monotone clause refuses, naming the profile that held it more often', () => {
    /*
     * DC-11's line moved to every crowd, so only the monotone clause can refuse: Zoned up-peak
     * clears every day of week 3 on every crowd, against one crowd held in week 2.
     */
    const rows = WEEK_DOMINANCE.rows.map((row) =>
      row.bookings.length === 1
        ? { ...row, verdicts: { ...row.verdicts, 'zoned-uppeak': row.days.map(() => 'C'.repeat(20)) } }
        : row,
    );
    const screen: WeekDominance = { ...WEEK_DOMINANCE, protocol: { ...WEEK_DOMINANCE.protocol, oneProfileHoldsAtMost: 1 }, rows };
    const three = weekLevelAdmissionOf('c2', 3, WEEK_WAY, screen);
    expect(three?.verdict).toBe('refused');
    expect(three?.monotone.rising).toEqual([{ profileId: 'zoned-uppeak', before: 1, after: 20 }]);
    expect(three?.because).toBe('zoned-uppeak holds it on 20 crowds against 1 the week before');
    /* The same screen with Zoned up-peak's week 3 as shipped admits it: the clause, and nothing else. */
    const control: WeekDominance = { ...screen, rows: WEEK_DOMINANCE.rows };
    expect(weekLevelAdmissionOf('c2', 3, WEEK_WAY, control)?.verdict).toBe('admitted');
    expect(weekTopOf('c2', WEEK_WAY, screen)).toBe(2);
  });

  it('refuses a level DC-11 refuses, at the shipped line', () => {
    const rows = WEEK_DOMINANCE.rows.map((row) =>
      row.bookings.length === 1
        ? { ...row, verdicts: { ...row.verdicts, 'zoned-uppeak': row.days.map(() => 'C'.repeat(20)) } }
        : row,
    );
    const three = weekLevelAdmissionOf('c2', 3, WEEK_WAY, { ...WEEK_DOMINANCE, rows });
    expect(three?.verdict).toBe('refused');
    expect(three?.because).toBe('zoned-uppeak holds it on 20 of 20 crowds, over DC-11’s 10');
  });

  it('calls a level with no screen row unmeasured, and ends the ladder below it', () => {
    const screen: WeekDominance = { ...WEEK_DOMINANCE, rows: WEEK_DOMINANCE.rows.filter((row) => row.bookings.length !== 2) };
    expect(weekLevelAdmissionOf('c2', 3, WEEK_WAY, screen)?.verdict).toBe('admitted');
    expect(weekLevelAdmissionOf('c2', 4, WEEK_WAY, screen)?.verdict).toBe('unmeasured');
    expect(weekTopOf('c2', WEEK_WAY, screen)).toBe(3);
  });

  it('refuses a booking authored anywhere but the day with the most room', () => {
    const [monday, tuesday] = SHIPPED_BOOKINGS;
    if (monday === undefined || tuesday === undefined) throw new Error('no bookings');
    /* Tuesday first: Monday (20 clears as week 2 deals it) has more room than Tuesday (19). */
    const issues = weekLevelIssues(ladderWith([tuesday]));
    expect(issues).toEqual(['c2 week 3 books car C on day 2, and the day with the most room is day 1']);
    expect(weekLevelIssues(ladderWith([monday, tuesday]))).toEqual([]);
  });

  it('authors no level on a ladder with no booking, and leaves § D1343’s cycle of orders without a top', () => {
    const bare = ladderWith([]);
    expect(authoredLevelOf('c2', 3, WEEK_WAY, bare)).toBeUndefined();
    expect(weekTopOf('c2', WEEK_WAY, WEEK_DOMINANCE, bare)).toBe(Number.POSITIVE_INFINITY);
  });
});
