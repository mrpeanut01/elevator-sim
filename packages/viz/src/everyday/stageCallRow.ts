/**
 * **Each call's row on the stage, once its window can be observed** — wave AL, lane AL-E,
 * [§ D1219](../../../../DECISIONS.md), the decide-an swarm's ruling § Q1(d), which amends
 * [§ D1138](../../../../DECISIONS.md) clause 3.
 *
 * ## What it says, and when
 *
 * A call's row counts the riders who arrived in the ten minutes from the call and waited a minute
 * or more under each of its three answers. The last of them is known a minute after the window
 * closes, so the stage prints the row from `windowEndS + DAY_CALL_LONG_WAIT_S` on (the call plus
 * 660 s), or from the run's end where the window ran into it, and never before: before then a count
 * would be a figure about riders still standing, which is `whole-run-figure-early` applied to a
 * ten-minute figure. The row's counts are this crowd's past once they print.
 *
 * **Counts only, never the day's verdict.** The verdict under each answer is a whole-day figure and
 * stays with the close (`shift/dayCalls.ts#dayCallRowOf`). The counts sentence is the report's own
 * (`dayCallCountsLineOf`), so the two surfaces cannot count or order the answers differently, and
 * the `day-call-stage-row` pair in `honesty/agreement.ts` holds both to the runs' legs.
 *
 * **A later press inside the window** is named: the counts were taken with nothing pressed after
 * the call, while the run on the stage carries the player's later press, so the row says the press
 * is not in them rather than let the player's own count be read as the run they watched.
 *
 * ## Why only behind § D1218
 *
 * On a day that could be rewound, a row printed mid-day is a key for the second try: the three
 * answers' counts at a call the player will meet again. § D1218's one attempt per scored day is
 * what makes the row the past of the only attempt that banks, so this ships with it and not
 * before.
 *
 * Pure: `everyday/stageScreen.ts` draws it and `everyday/host.ts#dayCallRowsAt` hands it the
 * records the day's call session holds.
 */

import type { RunInterventionConfig } from '@elevator-sim/core/browser';

import { DAY_CALL_LONG_WAIT_S, dayCallCountsLineOf, type DayCallRecord } from '../shift/dayCalls.js';

/** One row on the stage. */
export interface StageCallRowView {
  /** `stage-call-row-1`, in the order the calls were raised. */
  readonly id: string;
  readonly heading: string;
  /** The report's counts sentence, word for word. */
  readonly counts: string;
  /** What the counts are about, and a later press inside the window where there was one. */
  readonly note: string;
}

/** The heading over the rows, once one is due. */
export const STAGE_CALL_ROWS_HEADING = 'WHAT THE CALLS DID';

/** The clause every row carries: whose runs, and what they held. No figure. */
export const STAGE_CALL_ROW_NOTE =
  'On this crowd, with every press before the call kept and nothing pressed after it. Whether the ' +
  'day cleared is on the report when the day closes.';

/** The instant a record's row can be printed: its window observed, or the run over. */
export function stageCallRowDueAtS(record: Pick<DayCallRecord, 'windowEndS'>, endedAt: number): number {
  return Math.min(record.windowEndS + DAY_CALL_LONG_WAIT_S, endedAt);
}

/**
 * The rows due at `playheadS`, one per answered or skipped call whose window can be observed.
 * `log` is the run's own press log, for the later-press clause.
 */
export function stageCallRowsOf(input: {
  readonly records: readonly DayCallRecord[];
  readonly playheadS: number;
  readonly endedAt: number;
  readonly log: readonly RunInterventionConfig[];
  readonly clockOf: (simTimeS: number) => string;
}): readonly StageCallRowView[] {
  const rows: StageCallRowView[] = [];
  for (const [index, record] of input.records.entries()) {
    if (input.playheadS < stageCallRowDueAtS(record, input.endedAt)) continue;
    const later = input.log.filter((entry) => entry.atS > record.atS && entry.atS < record.windowEndS);
    const pressNote =
      later.length === 0
        ? ''
        : ` Your ${later.length === 1 ? 'press' : 'presses'} at ${later
            .map((entry) => input.clockOf(entry.atS))
            .join(', ')} ${later.length === 1 ? 'is' : 'are'} not in these counts.`;
    rows.push({
      id: `stage-call-row-${String(index + 1)}`,
      heading: `The call at ${input.clockOf(record.atS)}`,
      counts: dayCallCountsLineOf(record, input.clockOf),
      note: `${STAGE_CALL_ROW_NOTE}${pressNote}`,
    });
  }
  return rows;
}
