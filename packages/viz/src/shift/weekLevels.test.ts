/**
 * **From week 3 a held week deals the next level, and on the fixed engine Midtown deals none** —
 * wave AO, lane DS-1 ([§ D1400](../../../../DECISIONS.md), [§ D1401](../../../../DECISIONS.md)), held
 * by [§ D1616](../../../../DECISIONS.md). See `weekLevels.ts`.
 *
 * The shipped census, pinned. A level is the order the cycle deals that week plus the rung's first
 * `week − 2` bookings, so a tower with no dealt order deals no level. On the engine § D1603 fixed,
 * the week census refuses Thursday and Friday of `midtown-early-lift`, Midtown's one dealt order,
 * and the re-author search § D1616 registers found no replacement, so the order is held: Midtown
 * deals week 1's draw every week and none of its three authored bookings reaches a run. The
 * bookings stay authored, as the ladder's own comment keeps a refused booking, and
 * `weekLevelIssues` says what that leaves.
 *
 * The rule's mechanics are not tested here, because the shipped files no longer give them a level
 * to read: `weekLevels.preD1603.test.ts` runs every one of them on the census as measured before the
 * fix, where the order is dealt.
 */

import { describe, expect, it } from 'vitest';

import { CONTRACT_LADDER } from './ladder.js';
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
import { dealtWeekOrdersOf } from './weekOrders.js';

const SHIPPED_BOOKINGS = CONTRACT_LADDER.rows.find((row) => row.contractId === 'c2')?.weekBookings ?? [];

describe('Midtown’s levels, held with its order on the fixed engine — § D1616', () => {
  it('still authors three bookings, and the ladder says it deals no order to add them to', () => {
    expect(SHIPPED_BOOKINGS.map((booking) => [booking.day, booking.carId, booking.fromFraction, booking.toFraction])).toEqual([
      [1, 'C', 0, 0.4],
      [2, 'C', 0, 0.4],
      [4, 'C', 0, 0.4],
    ]);
    /* The measured negative: no order is dealt from week 2, so no booking has a week to join. */
    expect(dealtWeekOrdersOf('c2')).toEqual([undefined]);
    expect(weekLevelIssues()).toEqual(['c2 authors week bookings and deals no order to add them to']);
  });

  it('authors and admits no level, and tops Midtown at week 1', () => {
    for (const week of [3, 4, 5]) {
      expect(authoredLevelOf('c2', week), `week ${String(week)}`).toBeUndefined();
      expect(weekLevelAdmissionOf('c2', week), `week ${String(week)}`).toBeUndefined();
    }
    expect(weekTopOf('c2')).toBe(1);
    expect(dealtWeekOf({ contractId: 'c2', week: 4 })).toBe(1);
    expect(hasFurtherWeek({ contractId: 'c2', week: 1 })).toBe(false);
    expect(weekLevelAwardKeyOf({ contractId: 'c2', week: 4 })).toBe('c2/1');
  });

  it('hands no run a booking on any weekday of any week', () => {
    for (const week of [2, 3, 4, 9]) {
      for (let day = 1; day <= 5; day += 1) {
        expect(weekBookingsOn({ contractId: 'c2', week }, day, day - 1), `week ${String(week)} day ${String(day)}`).toEqual([]);
      }
    }
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
