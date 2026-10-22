/**
 * A level's bookings on the front door, on the week as the census measured it before § D1603
 * ([§ D1400](../../../../DECISIONS.md), [§ D1616](../../../../DECISIONS.md)).
 *
 * `doorView.test.ts`'s booking case, unchanged, with `data/week-way.json`, `week-dominance.json`,
 * `week-pool.json` and `call-bands.json` mocked by the files as they stood on `4ee9557`, the engine
 * before the fix, where Midtown deals `midtown-early-lift` from week 2 and its levels from week 3.
 * On the fixed engine § D1616 holds that order, so the shipped files deal no level and no door names
 * a booking; here the shipped code draws the line from a real dealt level and fails if it breaks.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../data/week-way.json', () => vi.importActual('../shift/preD1603/week-way.json'));
vi.mock('../../../../data/week-dominance.json', () => vi.importActual('../shift/preD1603/week-dominance.json'));
vi.mock('../../../../data/week-pool.json', () => vi.importActual('../shift/preD1603/week-pool.json'));
vi.mock('../../../../data/call-bands.json', () => vi.importActual('../shift/preD1603/call-bands.json'));

import { clockOf } from '../shift/report.js';
import { openWeek } from '../shift/week.js';
import { POOL_CENSUS } from '../shift/weekPool.js';
import { doorScreenViewOf } from './doorView.js';
import type { TodayRecord } from './today.js';

const TODAY: TodayRecord = {
  day: 5,
  weekday: 'Friday',
  /* § D871's whole-day holds; this fixture's day holds no car. */
  heldCarIds: [],
  dayLabel: 'FRIDAY · DAY 5',
  towerName: 'Chancery House',
  lede: 'Fourteen floors and three lifts.',
  wrinkle: { id: 'ordinary', name: 'An ordinary day', note: 'Nothing booked.' } as TodayRecord['wrinkle'],
  wrinkleName: 'An ordinary day',
  wrinkleNote: 'Nothing booked.',
  outOfService: undefined,
  facts: [],
  load: undefined,
  asks: [],
  seedLine: 'tower chancery-house · crowd 424242 · today’s date, so everyone playing today meets this crowd',
  crowdIsToday: true,
  crowdIsPinned: false,
  firstSessionLine: undefined,
  dayLength: undefined,
  driver: 'Steady hand',
  driverHeld: undefined,
  wayThrough: undefined,
  weekStake: undefined,
};

const NAMES: Readonly<Record<string, string>> = {
  'garden-apartments': 'Garden Apartments',
  'crown-hotel': 'Crown Hotel',
  'chancery-house': 'Chancery House',
  'midtown-office': 'Midtown Office',
};
const NAME_OF = (buildingId: string): string | undefined => NAMES[buildingId];

describe('a level’s bookings on the door, on the pre-fix census — § D1400', () => {
  const clock = (fraction: number): string => clockOf(fraction * 10 * 3600, 8 * 3600);
  const doorOn = (number: number) =>
    doorScreenViewOf({
      week: { ...openWeek('c2'), week: number },
      bookingClock: clock,
      today: { ...TODAY, day: 1 },
      dayOffset: 0,
      dayClosed: false,
      nameOf: NAME_OF,
    });

  /* Since § D1461 the pool withdraws week 3: the door names no booking, and the authored level's line is read as the census plays it. */
  it('names no booking on week 3’s door while the pool withdraws its level', () => {
    expect(doorOn(3).weekBookings).toBeUndefined();
  });

  it('names week 3’s Monday booking as new, and nothing in week 2, as the census plays the level', () => {
    POOL_CENSUS.measuring = true;
    try {
      expect(doorOn(3).weekBookings).toBe(
        'Booked this week: car C is out of passenger service on Monday from 08:00 until 12:00, new this week.',
      );
      expect(doorOn(2).weekBookings).toBeUndefined();
      expect(doorOn(3).weekBookings).not.toMatch(/harder|easier/u);
    } finally {
      POOL_CENSUS.measuring = false;
    }
  });
});
