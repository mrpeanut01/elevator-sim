/**
 * `everyday/stageCallRow.ts` — each call's row on the stage, once its window can be observed:
 * wave AL, lane AL-E, § D1219.
 */

import { describe, expect, it } from 'vitest';

import {
  DAY_CALL_COUNT_LABEL,
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
  STAGE_CALL_NO_CROSSING,
  STAGE_CALL_ROWS_CAVEAT,
  STAGE_CALL_TAKEN,
  stageCallFailedRowsOf,
  stageCallLeadOf,
  stageCallReadingsLineOf,
  stageCallRowDueAtS,
  stageCallRowsCaveatOf,
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
 * Wave AO, lane DR-1, § D1433, as wave AP's lane DT-2 reorders it (swarm DT's Q3): once due, a row
 * that reads goals leads with the first crossing the playhead has reached, or says no answer has
 * crossed a bar yet; then each answer's deepest landing and longest wait at the playhead, the answer
 * taken first; and no count. *Past its bar* only where the reading is past it, a crossing only from
 * the instant it happened, and the caveat once above the rows.
 */
describe('a call’s row leads with the first crossing and reads the goals at the playhead — § D1433, swarm DT’s Q3', () => {
  const series = (samples: DayCallMaxima['samples']): DayCallMaxima => ({ fromS: 7200, endedAt: 36_000, samples });
  /*
   * Spread was the answer taken. Park's landing passes 24 at 16 700 s (04:38:20 on this test's clock); spread's wait
   * passes 380 s at 17 000 s (04:43:20); leave's longest wait is a rider still standing.
   */
  const READ: DayCallRecord = {
    ...RECORD,
    maxima: {
      'park-cars-lobby': series([[7200, 20, 10, 100], [16_700, 20, 25, 100], [17_500, 20, 27, 100]]),
      'spread-cars': series([[7200, 20, 10, 100], [17_000, 20, 12, 400]]),
      leave: series([[7200, 20, 10, null]]),
    },
  };
  const GOALS: readonly ShiftGoal[] = goalsForDay(1).map((goal) =>
    goal.id === 'queue' ? { ...goal, bar: 24 } : goal.id === 'worst-wait' ? { ...goal, bar: 380 } : goal,
  );
  const rowsOf = (playheadS: number, log: readonly { atS: number; change: { kind: 'park-cars-lobby' } }[] = []) =>
    stageCallRowsOf({ records: [READ], playheadS, endedAt: 36_000, log, clockOf: clock, goals: GOALS });

  it('says no answer has crossed a bar a minute before the crossing, and leads with it at the crossing', () => {
    expect(clock(16_700)).toBe('04:38');
    /* A minute before, and at the minute's own start: nothing has crossed, and nothing ahead is read. */
    for (const playheadS of [16_640, 16_680, 16_699]) {
      expect(stageCallLeadOf(READ, GOALS, playheadS, clock), `at ${String(playheadS)}`).toBe(STAGE_CALL_NO_CROSSING);
    }
    expect(stageCallLeadOf(READ, GOALS, 16_700, clock)).toBe(
      'From 04:38, the day could no longer clear with park the cars in the lobby: the deepest landing reached 25 against a bar of 24.',
    );
    /* The crossing's own figure, not the later 27: the row's lead is the instant it crossed. */
    expect(stageCallLeadOf(READ, GOALS, 18_000, clock)).toContain('the deepest landing reached 25 against a bar of 24.');
    /* A later crossing follows the first, in the order they happened. */
    expect(stageCallLeadOf(READ, GOALS, 17_000, clock)).toBe(
      'From 04:38, the day could no longer clear with park the cars in the lobby: the deepest landing reached 25 against a bar of 24. ' +
        'From 04:43, the day could no longer clear with spread the cars across the tower: the longest wait reached 400 s against a bar of 380 s.',
    );
  });

  it('reads each answer at the playhead, the answer taken first and marked, the others in the counts order', () => {
    expect(stageCallReadingsLineOf(READ, GOALS, 16_730, clock)).toBe(
      `By ${clock(16_730)}, the deepest landing and the longest wait so far: 10 and 100 s with spread the cars across ` +
        'the tower, your answer; 25 (past its bar of 24) and 100 s with park the cars in the lobby; 10 and a wait still ' +
        'under way with leave them.',
    );
    /* A skipped call has no answer taken: the counts sentence's order, nothing marked. */
    const skipped = stageCallReadingsLineOf({ ...READ, answer: 'skipped' }, GOALS, 16_730, clock) ?? '';
    expect(skipped).toMatch(/so far: 25 \(past its bar of 24\) and 100 s with park the cars in the lobby; 10 and 100 s with spread/u);
    expect(skipped).not.toContain(STAGE_CALL_TAKEN);
  });

  it('never says an answer cleared, and never names a crossing before its instant, at any playhead', () => {
    for (let playheadS = 7860; playheadS <= 36_000; playheadS += 30) {
      const [row] = rowsOf(playheadS);
      for (const text of [row?.lead, row?.goals]) expect(text ?? '').not.toMatch(/\bcleared\b|could still clear|\bwill\b/u);
      const named = ['park the cars in the lobby', 'spread the cars across the tower', 'leave them'].filter((words) =>
        (row?.lead ?? '').includes(`clear with ${words}`),
      );
      const crossed = [playheadS >= 16_700 ? 'park the cars in the lobby' : undefined, playheadS >= 17_000 ? 'spread the cars across the tower' : undefined];
      expect(named, `at ${String(playheadS)}`).toEqual(crossed.filter((words) => words !== undefined));
    }
  });

  it('prints no count on a row that reads goals, says the caveat once above the rows, and keeps an old record’s counts', () => {
    const [row] = rowsOf(7860);
    expect(row?.kind).toBe('call');
    expect(row?.lead).toBe(STAGE_CALL_NO_CROSSING);
    expect(row?.goals).toBe(stageCallReadingsLineOf(READ, GOALS, 7860, clock));
    expect(row?.counts).toBeUndefined();
    expect(row?.note).toBeUndefined();
    expect(stageCallRowsCaveatOf(rowsOf(7860))).toBe(STAGE_CALL_ROWS_CAVEAT);
    expect(stageCallRowsOf({ records: [READ], playheadS: 7859, endedAt: 36_000, log: [], clockOf: clock, goals: GOALS })).toEqual([]);
    /* A record written before the readings keeps its counts-only row, and the caveat labels its count. */
    const old = stageCallRowsOf({ records: [RECORD, READ], playheadS: 7860, endedAt: 36_000, log: [], clockOf: clock, goals: GOALS });
    expect(old[0]?.counts).toBe(dayCallRowOf(RECORD, 1, () => 'Shift cleared', clock).why.match(/Riders who arrived[^.]*\./u)?.[0]);
    expect(old[0]?.lead).toBeUndefined();
    expect(stageCallRowsCaveatOf(old)).toBe(`${STAGE_CALL_ROWS_CAVEAT} ${DAY_CALL_COUNT_LABEL}`);
    expect(stageCallLeadOf(RECORD, GOALS, 7860, clock)).toBeUndefined();
    /* The failed and quiet rows are not calls' rows, and draw no caveat alone. */
    expect(stageCallRowsCaveatOf(stageCallFailedRowsOf({ failures: [{ atS: 7200, question: 'driver' }], playheadS: 7200, clockOf: clock }))).toBeUndefined();
  });

  it('names a press after the call as outside the runs, wherever it fell, and one after the playhead not at all', () => {
    const press = (atS: number) => ({ atS, change: { kind: 'park-cars-lobby' as const } });
    expect(rowsOf(16_000, [press(12_000)])[0]?.note).toBe(`Your press at ${clock(12_000)} is not in these runs.`);
    expect(rowsOf(16_000, [press(7200)])[0]?.note).toBeUndefined();
    expect(rowsOf(16_000, [press(16_500)])[0]?.note).toBeUndefined();
  });
});
