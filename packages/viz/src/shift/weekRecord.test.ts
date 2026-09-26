/**
 * `weekRecord.ts` — swarm DN's Q2.5 and Q2.6, lane AL-F ([§ D1229](../../../../DECISIONS.md),
 * [§ D1230](../../../../DECISIONS.md)): a new week is new, and what carries forward is the record.
 *
 * The property the ruling names is asserted over a binge rather than argued: three weeks played in
 * one sitting on one date, and then days across several dates, and no crowd this device filed is
 * ever dealt again.
 */

import { describe, expect, it } from 'vitest';

import { closeDay, nextDay, openWeek, outcomeOf } from './week.js';
import { goalsForDay, readGoals } from './goals.js';
import { scheduledEventFor } from './calendar.js';
import { countedCleanOf, weekDealOf, weekHasClosed } from './weekStake.js';
import {
  dealtCrowdOf,
  derivedCrowdOf,
  isDerivedCrowdOn,
  recordsWithClosedWeek,
  recordsWithDateCrowd,
  weekRecordFor,
  weekRecordLineOf,
  type WeekRecord,
} from './weekRecord.js';
import type { WeekState } from './types.js';
import type { WatchRecord } from '../watch/types.js';

const DATE = 20_260_926n;

function recordOn(day: number, seed: bigint): WatchRecord {
  return {
    version: 3,
    seed: seed.toString(),
    buildingId: 'midtown-office',
    dispatcherId: 'collective',
    pattern: 'building',
    demandTemplateId: null,
    arrivalRatePctPop5min: null,
    shiftLengthS: 36_000,
    windowStartS: null,
    day,
    dayIdx: (day - 1) % 7,
    outOfServiceCarIds: [],
    interventions: [],
    ruleRows: [],
    rungContractId: null,
  } as unknown as WatchRecord;
}

/** Close the standing day on `seed`, clean. */
function fileOn(week: WeekState, seed: bigint): WeekState {
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
      record: recordOn(week.day, seed),
      recordRefusal: null,
    }),
  );
}

/**
 * What the Everyday close writes (`everyday/host.ts#fileScenarioDay`), done here without a host:
 * the date's crowd on the record when the day was filed on it, and the week when it closed.
 */
function recordClose(records: readonly WeekRecord[], week: WeekState, seed: bigint, date: bigint): readonly WeekRecord[] {
  let next = seed === date ? recordsWithDateCrowd(records, week.contractId, seed.toString()) : records;
  const deal = weekDealOf(week.contractId);
  if (deal !== undefined && weekHasClosed(week)) {
    next = recordsWithClosedWeek(next, week.contractId, countedCleanOf(week), deal.target);
  }
  return next;
}

describe('a new week is new — § D1229', () => {
  it('deals the date’s crowd to the first day, and a derived one to the next day on the same date', () => {
    const empty = weekRecordFor([], 'c2');
    let week = openWeek('c2');
    expect(dealtCrowdOf(week, empty, DATE)).toBe(DATE);
    week = nextDay(fileOn(week, DATE));
    expect(dealtCrowdOf(week, empty, DATE)).toBe(derivedCrowdOf(DATE, 2, 0));
    expect(dealtCrowdOf(week, empty, DATE).toString()).toBe('2026092620');
  });

  it('deals the next date’s own crowd, which nobody has filed', () => {
    let week = openWeek('c2');
    week = nextDay(fileOn(week, DATE));
    expect(dealtCrowdOf(week, weekRecordFor([], 'c2'), DATE + 1n)).toBe(DATE + 1n);
  });

  it('keeps a closed day on the crowd it was filed on, so its practice meets the same passengers', () => {
    const week = fileOn(openWeek('c2'), DATE);
    expect(dealtCrowdOf(week, weekRecordFor([], 'c2'), DATE + 5n)).toBe(DATE);
  });

  it('never re-deals a crowd this device filed, over three weeks in one sitting and then a week across dates', () => {
    let records: readonly WeekRecord[] = [];
    let week = openWeek('c2');
    const filed = new Set<string>();
    const play = (date: bigint): void => {
      const crowd = dealtCrowdOf(week, weekRecordFor(records, 'c2'), date);
      expect(filed.has(crowd.toString()), `crowd ${crowd.toString()} was dealt twice`).toBe(false);
      filed.add(crowd.toString());
      week = fileOn(week, crowd);
      records = recordClose(records, week, crowd, date);
      week = nextDay(week);
    };
    for (let day = 0; day < 21; day += 1) play(DATE);
    for (let day = 0; day < 7; day += 1) play(DATE + BigInt(day + 1));
    expect(filed.size).toBe(28);
    expect(weekRecordFor(records, 'c2').closed).toBe(4);
  });

  it('is the date’s crowd, untouched, on a week on no scenario', () => {
    const sandbox = fileOn(openWeek('sandbox'), DATE);
    expect(dealtCrowdOf(nextDay(sandbox), weekRecordFor([], 'sandbox'), DATE)).toBe(DATE);
  });

  it('tells a derived crowd from the date’s and from a crowd of another date', () => {
    expect(isDerivedCrowdOn(derivedCrowdOf(DATE, 3, 1), DATE)).toBe(true);
    expect(isDerivedCrowdOn(DATE, DATE)).toBe(false);
    expect(isDerivedCrowdOn(DATE + 1n, DATE)).toBe(false);
  });
});

describe('the record carries forward and buys nothing — § D1230', () => {
  it('counts weeks closed, weeks met and the best week, and says nothing before one closes', () => {
    expect(weekRecordLineOf(weekRecordFor([], 'c2'))).toBeUndefined();
    let records = recordsWithClosedWeek([], 'c2', 4, 4);
    records = recordsWithClosedWeek(records, 'c2', 2, 4);
    const record = weekRecordFor(records, 'c2');
    expect([record.closed, record.met, record.best]).toEqual([2, 1, 4]);
    expect(weekRecordLineOf(record)).toBe(
      'Your record on this tower: 2 weeks closed, 1 with the target met, and the most clean counted days in one week is 4.',
    );
  });

  it('never counts a week with no target as met', () => {
    const record = weekRecordFor(recordsWithClosedWeek([], 'c9', 0, 0), 'c9');
    expect([record.closed, record.met]).toEqual([1, 0]);
  });

  it('keeps one line per tower', () => {
    let records = recordsWithClosedWeek([], 'c2', 3, 4);
    records = recordsWithClosedWeek(records, 'c3', 1, 1);
    records = recordsWithDateCrowd(records, 'c2', DATE.toString());
    expect(records.map((entry) => entry.contractId).sort()).toEqual(['c2', 'c3']);
    expect(weekRecordFor(records, 'c2').dateCrowd).toBe(DATE.toString());
    expect(weekRecordFor(records, 'c2').closed).toBe(1);
  });
});
