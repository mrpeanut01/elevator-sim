/**
 * `weekPool.ts` on the shipped files — wave AP, lane DT-1 ([§ D1459](../../../../DECISIONS.md) to
 * [§ D1462](../../../../DECISIONS.md)), held by [§ D1616](../../../../DECISIONS.md).
 *
 * The pool's cells are the days of the order a tower deals from week 2. On the fixed engine § D1616
 * holds `midtown-early-lift`, Midtown's one dealt order, so the tower deals no cell, the census run on
 * that tree measured none, and the shipped pool keeps its protocol and no cell. So nothing is pooled:
 * every Midtown day from week 2 is dealt the date's crowd, as week 1's are. The gates, the dealer and
 * the run seam are tested on real cells in `weekPool.preD1603.test.ts`, on the census as measured
 * before the fix.
 */

import { describe, expect, it } from 'vitest';

import { openWeek } from './week.js';
import { weekTopOf } from './weekLevels.js';
import { dealtCrowdOf, weekRecordFor } from './weekRecord.js';
import { poolCellsOf, poolDealOf, poolLevelReadingOf, poolTopOf, WEEK_POOL } from './weekPool.js';

const C2 = 'c2';
const DATE = 20_261_013n;

describe('the shipped pool, held with its order — § D1616', () => {
  it('has no cell, because Midtown deals no order from week 2, and keeps the protocol it was measured on', () => {
    expect(poolCellsOf(C2)).toEqual([]);
    expect(WEEK_POOL.cells).toEqual([]);
    expect(WEEK_POOL.protocol.contractId).toBe(C2);
    expect(WEEK_POOL.protocol.crowdCount).toBe(40);
  });

  it('reads no level and deals no crowd, so a week-2 day meets the date’s crowd as week 1 does', () => {
    expect(poolLevelReadingOf(C2, 2)).toBeUndefined();
    expect(poolTopOf(C2)).toBe(1);
    expect(weekTopOf(C2)).toBe(1);
    for (let day = 1; day <= 5; day += 1) expect(poolDealOf(C2, 2, day, 3, DATE), `day ${String(day)}`).toBeUndefined();
    const record = { ...weekRecordFor([], C2), closed: 3, dateCrowd: DATE.toString() };
    const weekTwo = { ...openWeek(C2), week: 2, day: 1, dayIdx: 0 };
    const weekOne = { ...openWeek(C2), week: 1, day: 1, dayIdx: 0 };
    const two = dealtCrowdOf(weekTwo, record, DATE);
    const one = dealtCrowdOf(weekOne, record, DATE);
    expect(two).toBe(one);
  });
});
