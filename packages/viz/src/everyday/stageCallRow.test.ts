/**
 * `everyday/stageCallRow.ts` — each call's row on the stage, once its window can be observed:
 * wave AL, lane AL-E, § D1219.
 */

import { describe, expect, it } from 'vitest';

import {
  DAY_CALL_LONG_WAIT_S,
  dayCallFailedRowOf,
  dayCallRowOf,
  dayCallWrinkleQuietRowOf,
  type DayCallRecord,
} from '../shift/dayCalls.js';
import type { DayCallMaxima } from '../shift/dayCallMaxima.js';
import { goalsForDay } from '../shift/goals.js';
import { clockOf } from '../shift/report.js';
import type { Observations, ShiftGoal } from '../shift/types.js';

import {
  STAGE_CALL_FAILED_NOTE,
  stageCallFailedRowsOf,
  stageCallGoalsLineOf,
  stageCallRowDueAtS,
  stageCallRowsOf,
  STAGE_CALL_ROW_NOTE,
  stageCallWrinkleQuietDueAtS,
  stageCallWrinkleQuietRowsOf,
} from './stageCallRow.js';

const unread = {} as Observations;

/** A placement call at 10:00 (7 200 s from 08:00) whose three answers split the day's verdict. */
const RECORD: DayCallRecord = {
  atS: 7200,
  windowEndS: 7800,
  answer: 'spread-cars',
  counts: { 'park-cars-lobby': 34, 'spread-cars': 50, leave: 25 },
  observations: { 'park-cars-lobby': unread, 'spread-cars': unread, leave: unread },
};

const clock = (simTimeS: number): string => clockOf(simTimeS, 0);

function rowsAt(playheadS: number, log: { atS: number; change: { kind: 'park-cars-lobby' } }[] = []) {
  return stageCallRowsOf({ records: [RECORD], playheadS, endedAt: 36_000, log, clockOf: clock });
}

describe('a call’s row on the stage — § D1219', () => {
  it('is due a minute after its window closes, the call plus 660 s, and not a second before', () => {
    expect(DAY_CALL_LONG_WAIT_S).toBe(60);
    expect(stageCallRowDueAtS(RECORD, 36_000)).toBe(7200 + 660);
    expect(rowsAt(7200 + 659)).toEqual([]);
    expect(rowsAt(7200 + 660)).toHaveLength(1);
    /* A window that runs into the run's end is due at the end, when every rider in it is settled. */
    expect(stageCallRowDueAtS(RECORD, 7700)).toBe(7700);
  });

  it('prints the report row’s counts word for word, and never the day’s verdict', () => {
    const [row] = rowsAt(9000);
    const report = dayCallRowOf(
      RECORD,
      1,
      (observations) => (observations === RECORD.observations['spread-cars'] ? 'Shift cleared' : 'Shift missed'),
      clock,
    );
    expect(report.why).toContain(row?.counts ?? 'missing');
    expect(row?.counts).toMatch(/: 34 with park the cars in the lobby, 50 with spread the cars across the tower and 25 with leave them\.$/u);
    for (const text of [row?.heading, row?.counts, row?.note]) {
      expect(text).not.toMatch(/Shift (cleared|missed)|cleared with|missed with|\bbetter\b|\bworse\b/u);
    }
    expect(row?.heading).toBe(`The call at ${clock(7200)}`);
    expect(row?.note).toBe(STAGE_CALL_ROW_NOTE);
  });

  it('names a later press inside the window as outside the counts, and a press after it not at all', () => {
    const inside = rowsAt(9000, [{ atS: 7500, change: { kind: 'park-cars-lobby' } }])[0];
    expect(inside?.note).toBe(`${STAGE_CALL_ROW_NOTE} Your press at ${clock(7500)} is not in these counts.`);
    /* The call's own press, at the call second, is the answer the counts are about. */
    expect(rowsAt(9000, [{ atS: 7200, change: { kind: 'park-cars-lobby' } }])[0]?.note).toBe(STAGE_CALL_ROW_NOTE);
    expect(rowsAt(9000, [{ atS: 7800, change: { kind: 'park-cars-lobby' } }])[0]?.note).toBe(STAGE_CALL_ROW_NOTE);
  });
});

describe('a moment a run could not be made for, on the stage — § D1335', () => {
  const failures = [
    { atS: 7200, question: 'driver' as const },
    { atS: 9000, question: 'placement' as const },
  ];
  const failedAt = (playheadS: number) => stageCallFailedRowsOf({ failures, playheadS, clockOf: clock });

  it('is said from the instant the playhead reaches it, and not a second before', () => {
    expect(failedAt(7199)).toEqual([]);
    expect(failedAt(7200).map((row) => row.heading)).toEqual([`No call at ${clock(7200)}`]);
    expect(failedAt(9000)).toHaveLength(2);
  });

  it('says the fault in the report row’s own words, with no figure', () => {
    const [row] = failedAt(7200);
    const report = dayCallFailedRowOf(failures.slice(0, 1), clock);
    expect(report?.why).toBe(row?.counts);
    expect(row?.note).toBe(STAGE_CALL_FAILED_NOTE);
    for (const text of [row?.heading, row?.counts, row?.note]) {
      expect(text?.replace(/\d\d:\d\d/gu, '')).not.toMatch(/\d/u);
    }
  });
});

describe('a wrinkle that raised no call, on the stage — § D1336', () => {
  const quiet = {
    wrinkle: { startS: 7000, endS: 7500, name: 'A late finish' },
    refused: [{ ...RECORD, observations: {} }],
  };
  const wrinkleRowsAt = (playheadS: number, endedAt = 36_000) =>
    stageCallWrinkleQuietRowsOf({ quiet, playheadS, endedAt, clockOf: clock });

  it('is said after its window and after its last counted moment can be observed, and not before', () => {
    /* The record's window ends at 7 800 s, so its last rider is known at 7 860 s, after the wrinkle's 7 500 s. */
    expect(stageCallWrinkleQuietDueAtS(quiet, 36_000)).toBe(RECORD.windowEndS + DAY_CALL_LONG_WAIT_S);
    expect(wrinkleRowsAt(RECORD.windowEndS + DAY_CALL_LONG_WAIT_S - 1)).toEqual([]);
    expect(wrinkleRowsAt(RECORD.windowEndS + DAY_CALL_LONG_WAIT_S)).toHaveLength(1);
    /* A longer wrinkle waits for its own end. */
    const long = { ...quiet, wrinkle: { ...quiet.wrinkle, endS: 9000 } };
    expect(stageCallWrinkleQuietDueAtS(long, 36_000)).toBe(9000);
    /* And a run that ends first says it at its end. */
    expect(stageCallWrinkleQuietDueAtS(long, 8500)).toBe(8500);
    expect(stageCallWrinkleQuietRowsOf({ quiet: undefined, playheadS: 36_000, endedAt: 36_000, clockOf: clock })).toEqual([]);
  });

  it('prints the report row’s sentence word for word, in the past tense, and never a verdict', () => {
    const [row] = wrinkleRowsAt(36_000);
    expect(row?.counts).toBe(dayCallWrinkleQuietRowOf(quiet, clock).why);
    expect(row?.heading).toBe('A late finish raised no call');
    expect(row?.counts).toMatch(/^A late finish began at \d\d:\d\d, and the stage raised no call in it\. It ran the day ahead/u);
    expect(row?.counts).not.toMatch(/Shift (cleared|missed)|\bwill\b|\bbetter\b|\bworse\b/u);
  });
});

/*
 * Wave AO, lane DR-1, § D1433: once due, the row reads each answer's deepest landing and longest
 * wait so far at the last whole minute the stage has reached, says *past its bar* only where the
 * reading is past it, and that a run could no longer clear only from the minute it first read so.
 */
describe('a call’s row reads the day’s two final goals at the playhead — § D1433', () => {
  const series = (samples: DayCallMaxima['samples']): DayCallMaxima => ({ fromS: 7200, endedAt: 36_000, samples });
  /* Park's landing passes 24 at 7 800 s; spread's wait passes 380 s at 8 400 s; leave's longest wait is a rider still standing. */
  const READ: DayCallRecord = {
    ...RECORD,
    maxima: {
      'park-cars-lobby': series([[7200, 20, 10, 100], [7800, 20, 25, 100]]),
      'spread-cars': series([[7200, 20, 10, 100], [8400, 20, 12, 400]]),
      leave: series([[7200, 20, 10, null]]),
    },
  };
  const GOALS: readonly ShiftGoal[] = goalsForDay(1).map((goal) =>
    goal.id === 'queue' ? { ...goal, bar: 24 } : goal.id === 'worst-wait' ? { ...goal, bar: 380 } : goal,
  );

  it('reads each answer at the last whole minute reached, in the counts sentence’s order and naming', () => {
    expect(stageCallGoalsLineOf(READ, GOALS, 7890, clock)).toBe(
      `By ${clock(7860)}, the deepest landing and the longest wait so far: 25 (past its bar of 24) and 100 s with ` +
        'park the cars in the lobby; 10 and 100 s with spread the cars across the tower; 10 and a wait still ' +
        'under way with leave them. A landing’s deepest stack and the longest wait cannot come back under a bar ' +
        `once past it: the day could no longer clear with park the cars in the lobby from ${clock(7800)}.`,
    );
  });

  it('says past its bar only where the reading is past it — the honesty pair', () => {
    /* Before park's landing passed 24, nothing is past and no run is said to be lost. */
    const before = stageCallGoalsLineOf(READ, GOALS, 7799, clock) ?? '';
    expect(before).not.toMatch(/past its bar|could no longer clear/u);
    /* Spread's wait passes its bar at 8 400 s: not said a minute earlier, said from then. */
    expect(stageCallGoalsLineOf(READ, GOALS, 8399, clock)).not.toMatch(/400 s|with spread the cars across the tower from/u);
    const after = stageCallGoalsLineOf(READ, GOALS, 8400, clock) ?? '';
    expect(after).toContain('12 and 400 s (past its bar of 380 s) with spread the cars across the tower');
    expect(after).toContain(`with park the cars in the lobby from ${clock(7800)} and with spread the cars across the tower from ${clock(8400)}`);
    /* A wait still under way is pending on the rail, never past its bar, however long it has run. */
    expect(after).toContain('a wait still under way with leave them');
    expect(after).not.toMatch(/with leave them from/u);
  });

  it('prints the readings on a due row, labels the count as no goal, and prints counts only on a record without readings', () => {
    const [row] = stageCallRowsOf({ records: [READ], playheadS: 7860, endedAt: 36_000, log: [], clockOf: clock, goals: GOALS });
    expect(row?.goals).toBe(stageCallGoalsLineOf(READ, GOALS, 7860, clock));
    expect(row?.note).toContain('The count of riders who waited a minute is not one of the day’s goals.');
    expect(stageCallRowsOf({ records: [READ], playheadS: 7859, endedAt: 36_000, log: [], clockOf: clock, goals: GOALS })).toEqual([]);
    const [old] = stageCallRowsOf({ records: [RECORD], playheadS: 7860, endedAt: 36_000, log: [], clockOf: clock, goals: GOALS });
    expect(old?.goals).toBeUndefined();
    expect(stageCallGoalsLineOf(RECORD, GOALS, 7860, clock)).toBeUndefined();
  });
});
