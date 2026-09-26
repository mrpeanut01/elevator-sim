/**
 * `everyday/stageCallRow.ts` — each call's row on the stage, once its window can be observed:
 * wave AL, lane AL-E, § D1219.
 */

import { describe, expect, it } from 'vitest';

import { DAY_CALL_LONG_WAIT_S, dayCallRowOf, type DayCallRecord } from '../shift/dayCalls.js';
import { clockOf } from '../shift/report.js';
import type { Observations } from '../shift/types.js';

import { stageCallRowDueAtS, stageCallRowsOf, STAGE_CALL_ROW_NOTE } from './stageCallRow.js';

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
