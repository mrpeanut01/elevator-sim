/**
 * **The cadence floors' arithmetic, on every run** — wave AN, lane DQ-1,
 * [§ D1338](../../../../DECISIONS.md) and [§ D1337](../../../../DECISIONS.md).
 *
 * `callCadence.sweep.test.ts` plays the census crowds through the shipped session nightly and asks
 * `callCadence.test-helper.ts` whether every floor holds. These cases hold that arithmetic to synthetic
 * days, each floor met and each one missed by one, so a gated verdict never rests on a summary nobody
 * has checked.
 */

import { describe, expect, it } from 'vitest';

import {
  CADENCE_EVENING_DAYS_FLOOR,
  CADENCE_FORMULA_SHARE,
  CADENCE_MEDIAN_CALLS_FLOOR,
  CADENCE_TRAP_SHARE,
  cadenceMissesOf,
  cadenceOf,
  lowestSharesOf,
  type CadenceCall,
  type CadenceDay,
} from './callCadence.test-helper.js';

const driverRow = (a: number, b: number, keep: number): CadenceCall => ({
  atS: 0,
  question: 'driver',
  counts: { 'driver-a': a, 'driver-b': b, leave: keep },
});
const placementRow = (): CadenceCall => ({
  atS: 0,
  question: 'placement',
  counts: { 'park-cars-lobby': 1, 'spread-cars': 2, leave: 3 },
});

/** A week of five days for `crowd`, each with `calls` calls and an evening call on the first `evenings`. */
function week(crowd: number, calls: readonly number[], evenings: number, rows: () => CadenceCall = placementRow): CadenceDay[] {
  return calls.map((count, index) => ({
    crowd,
    day: index + 1,
    calls: Array.from({ length: count }, rows),
    evening: index < evenings,
    realS: 480,
    longestGapRealS: 200,
    longestWaitingGapRealS: 150,
  }));
}

/** Driver rows whose lowest answer turns over evenly: each lowest on a third of them. */
function rotating(): () => CadenceCall {
  let k = 0;
  return () => {
    k += 1;
    return k % 3 === 0 ? driverRow(1, 5, 5) : k % 3 === 1 ? driverRow(5, 1, 5) : driverRow(5, 5, 1);
  };
}

describe('the cadence floors — § D1338', () => {
  it('holds a careful week that meets every floor', () => {
    const summary = cadenceOf(week(0, [4, 5, 4, 6, 4], CADENCE_EVENING_DAYS_FLOOR, rotating()));
    expect(summary.medianCalls).toBe(4);
    expect(cadenceMissesOf(summary)).toEqual([]);
  });

  it('misses a median a call under the floor, a silent weekday, and an evening short by one', () => {
    expect(cadenceMissesOf(cadenceOf(week(0, [3, 3, 3, 6, 6], 5, rotating())))).toEqual([
      `the median day raised 3 calls, under ${String(CADENCE_MEDIAN_CALLS_FLOOR)}`,
    ]);
    expect(cadenceMissesOf(cadenceOf(week(0, [4, 4, 0, 6, 6], 5, rotating())))).toEqual(['1 weekday(s) raised no call']);
    expect(cadenceMissesOf(cadenceOf(week(1, [4, 4, 4, 4, 4], CADENCE_EVENING_DAYS_FLOOR - 1, rotating())))).toEqual([
      `crowd 1 had an evening call on ${String(CADENCE_EVENING_DAYS_FLOOR - 1)} of 5 weekdays`,
    ]);
  });

  it('misses on the post-AM panel’s stale bundle: seat A’s 7 calls in 10 weekdays, 3 of them silent, no evening', () => {
    /* Seat A's two weeks as swarm DQ read them: every call a morning placement call. */
    const seatA = [...week(0, [1, 1, 0, 1, 0], 0), ...week(1, [1, 1, 0, 1, 1], 0)];
    const misses = cadenceMissesOf(cadenceOf(seatA));
    expect(misses).toContain(`the median day raised 1 calls, under ${String(CADENCE_MEDIAN_CALLS_FLOOR)}`);
    expect(misses).toContain('3 weekday(s) raised no call');
    expect(misses).toContain('crowd 0 had an evening call on 0 of 5 weekdays');
  });

  it('publishes the longest silence and floors nothing on it', () => {
    const days = week(0, [4, 4, 4, 4, 4], 5, rotating()).map((day, index) => ({ ...day, longestGapRealS: 600 + 60 * index }));
    const summary = cadenceOf(days);
    expect(summary.longestGapMinutes).toEqual({ median: 12, max: 14 });
    expect(cadenceMissesOf(summary)).toEqual([]);
  });
});

describe('the who-drives trap check — § D1337', () => {
  it('counts each answer lowest on a row, ties for every answer tied', () => {
    const { rows, shares } = lowestSharesOf([driverRow(1, 1, 5), driverRow(5, 1, 5), placementRow()], 'driver');
    expect(rows).toBe(2);
    expect(shares).toEqual({ 'driver-a': 0.5, 'driver-b': 1, leave: 0 });
  });

  it('refuses an answer lowest on under a tenth of the rows, as the house was, and one lowest on over three fifths', () => {
    /* The house as the switch target: swarm DQ found it lowest on 3 of 69 rows. */
    const houseTrap = [
      ...Array.from({ length: 3 }, () => driverRow(1, 5, 5)),
      ...Array.from({ length: 33 }, () => driverRow(5, 1, 5)),
      ...Array.from({ length: 33 }, () => driverRow(5, 5, 1)),
    ];
    const trap = cadenceOf([{ ...week(0, [4], 1)[0]!, calls: houseTrap }]);
    expect(trap.driver.shares['driver-a']).toBeLessThan(CADENCE_TRAP_SHARE);
    expect(cadenceMissesOf(trap).some((miss) => miss.startsWith('who drives: driver-a was lowest on 4.3 %'))).toBe(true);
    const formula = [
      ...Array.from({ length: 7 }, () => driverRow(1, 5, 5)),
      ...Array.from({ length: 2 }, () => driverRow(5, 1, 5)),
      ...Array.from({ length: 1 }, () => driverRow(5, 5, 1)),
    ];
    const summary = cadenceOf([{ ...week(0, [4], 1)[0]!, calls: formula }]);
    expect(summary.driver.shares['driver-a']).toBeGreaterThan(CADENCE_FORMULA_SHARE);
    expect(cadenceMissesOf(summary).some((miss) => miss.startsWith('who drives: driver-a was lowest on 70.0 %'))).toBe(true);
  });
});
