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
 * ## What the row leads with since wave AP
 *
 * [§ D1471](../../../../DECISIONS.md), swarm DT's Q3 (lane DT-2): the post-AO panel's seat B predicted 0 of 7 calls from the count and 3
 * of 7 from the goal readings, and nothing said which decided. So a row that reads goals leads with
 * the first crossing once the playhead has reached it ({@link stageCallLeadOf}), or *No answer has
 * crossed a bar yet*; then each answer's readings at the playhead, the answer taken first; and no
 * count, which the report row keeps last with its label. The caveat is said once above the rows
 * ({@link STAGE_CALL_ROWS_CAVEAT}). A record written before the readings keeps its counts-only row,
 * as above. Nothing is read past the playhead, and *cleared* is the close's word alone.
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

import {
  dayCallCrossingPhraseOf,
  dayCallMaximaReadingsAt,
  type DayCallMaximaReadings,
} from '../shift/dayCallMaxima.js';
import {
  DAY_CALL_COUNT_LABEL,
  DAY_CALL_LONG_WAIT_S,
  dayCallAnswersOf,
  dayCallAnswerWordsOf,
  dayCallCountsLineOf,
  dayCallFailedSentenceOf,
  dayCallWrinkleQuietSentenceOf,
  type DayCallAnswer,
  type DayCallFailure,
  type DayCallRecord,
  type DayCallWrinkleQuiet,
} from '../shift/dayCalls.js';
import type { ShiftGoal } from '../shift/types.js';

/** One row on the stage. */
export interface StageCallRowView {
  /** `stage-call-row-1`, in the order the calls were raised. */
  readonly id: string;
  /**
   * What the row is: a raised call's, a moment no run could be made for (§ D1335), or a wrinkle that
   * raised no call (§ D1336). The caveat above the rows ({@link stageCallRowsCaveatOf}) is about the
   * first kind.
   */
  readonly kind: 'call' | 'failed' | 'wrinkle';
  readonly heading: string;
  /**
   * **What the row leads with** — wave AP, lane DT-2, swarm DT's Q3 item 1: the first crossing once the
   * playhead has reached it (*From 12:38, the day could no longer clear with park the cars in the
   * lobby: the deepest landing reached 33 against a bar of 32*), and each later one after it; until
   * then {@link STAGE_CALL_NO_CROSSING}. {@link stageCallLeadOf}. Absent on a row without readings.
   */
  readonly lead?: string | undefined;
  /**
   * Each answer's deepest landing and longest wait so far at the playhead, the answer taken first —
   * [§ D1433](../../../../DECISIONS.md), reordered by DT-2 ({@link stageCallReadingsLineOf}). Absent on a
   * record that carries no readings (one written before them) and where no goals were handed in.
   */
  readonly goals?: string | undefined;
  /**
   * A row's sentence where it has no readings: the ten-minute counts on a record written before the
   * readings (its counts-only row, § D1433), the failed moment's and the quiet wrinkle's own words.
   * Absent on a call's row that reads goals: the count is not one of the day's goals and leaves the
   * stage row (swarm DT's Q3 item 2); the report row keeps it, last.
   */
  readonly counts?: string | undefined;
  /** What this row alone needs said: a later press the runs do not carry, or a failed or quiet row's clause. */
  readonly note?: string | undefined;
}

/** The heading over the rows, once one is due. */
export const STAGE_CALL_ROWS_HEADING = 'WHAT THE CALLS DID';

/**
 * **The caveat, said once above the rows** — wave AP, lane DT-2, swarm DT's Q3 item 3 (S1 and S2).
 * Wave AO printed it under every row, seven times on seat A's Wednesday. Whose runs they are, that a
 * maximum past its bar stays past it (which is what *could no longer clear* rests on), and that the
 * verdict is the report's. No figure.
 */
export const STAGE_CALL_ROWS_CAVEAT =
  'Each call’s answers were run on this crowd from the call, with every press before it kept and nothing ' +
  'pressed after it. A landing’s deepest stack and the longest wait cannot come back under a bar once past ' +
  'it. Whether the day cleared is on the report when the day closes.';

/**
 * The caveat for `rows`, or `undefined` where none of them is a call's. Where a row still prints counts (a
 * record written before the readings) it ends with the count's label, `shift/dayCalls.ts#DAY_CALL_COUNT_LABEL`.
 */
export function stageCallRowsCaveatOf(rows: readonly StageCallRowView[]): string | undefined {
  const calls = rows.filter((row) => row.kind === 'call');
  if (calls.length === 0) return undefined;
  return calls.some((row) => row.counts !== undefined) ? `${STAGE_CALL_ROWS_CAVEAT} ${DAY_CALL_COUNT_LABEL}` : STAGE_CALL_ROWS_CAVEAT;
}

/** The row's lead before any answer's run has crossed a bar at the playhead. Never *cleared*. */
export const STAGE_CALL_NO_CROSSING = 'No answer has crossed a bar yet.';

/**
 * The note on a counts-only row, the one row whose sentence is a count: whose runs they are. A row
 * that reads goals says it once, in {@link STAGE_CALL_ROWS_CAVEAT}.
 */
export const STAGE_CALL_ROW_NOTE = 'On this crowd, with every press before the call kept and nothing pressed after it.';

/** Each answer of `record` read at `playheadS`, the answer taken first, then the counts sentence's order. */
function readingsOf(
  record: DayCallRecord,
  goals: readonly ShiftGoal[],
  playheadS: number,
): readonly { readonly answer: DayCallAnswer; readonly at: DayCallMaximaReadings }[] | undefined {
  const maxima = record.maxima;
  if (maxima === undefined) return undefined;
  const order = dayCallAnswersOf(record.question ?? 'placement');
  const taken = record.answer === 'skipped' ? undefined : record.answer;
  const answers = taken === undefined || !order.includes(taken) ? order : [taken, ...order.filter((answer) => answer !== taken)];
  const read: { answer: DayCallAnswer; at: DayCallMaximaReadings }[] = [];
  for (const answer of answers) {
    const series = maxima[answer];
    const at = series === undefined ? undefined : dayCallMaximaReadingsAt(series, goals, playheadS);
    if (at !== undefined) read.push({ answer, at });
  }
  return read.length === 0 ? undefined : read;
}

/**
 * **The row's lead** — wave AP, lane DT-2, swarm DT's Q3 item 1 (three of three on the shape; S3's
 * wording, S2's honesty pair). Each answer's run that has crossed a bar by the playhead, earliest
 * first, with the instant it crossed and the crossing's own figures: *From 12:38, the day could no
 * longer clear with park the cars in the lobby: the deepest landing reached 33 against a bar of 32.*
 * Before any has, {@link STAGE_CALL_NO_CROSSING}. A crossing is § D1168's one verdict and is said only
 * from the instant the run reads past its bar (`dayCallMaximaReadingsAt`); nothing past the playhead
 * is read, so no answer is ever said to clear. `undefined` where the record carries no readings.
 */
export function stageCallLeadOf(
  record: DayCallRecord,
  goals: readonly ShiftGoal[],
  playheadS: number,
  clockOf: (simTimeS: number) => string,
): string | undefined {
  const read = readingsOf(record, goals, playheadS);
  if (read === undefined) return undefined;
  const order = dayCallAnswersOf(record.question ?? 'placement');
  const crossed = read
    .filter(({ at }) => at.pastBarFromS !== undefined)
    .sort((a, b) => (a.at.pastBarFromS ?? 0) - (b.at.pastBarFromS ?? 0) || order.indexOf(a.answer) - order.indexOf(b.answer));
  if (crossed.length === 0) return STAGE_CALL_NO_CROSSING;
  return crossed
    .map(({ answer, at }) => {
      const phrase = dayCallCrossingPhraseOf(at.pastBar);
      return (
        `From ${clockOf(at.pastBarFromS ?? at.atS)}, the day could no longer clear with ${dayCallAnswerWordsOf(record, answer)}` +
        `${phrase === '' ? '' : `: ${phrase}`}.`
      );
    })
    .join(' ');
}

/** What a row says while every answer reads the same two figures — GitHub issue #631. */
export const STAGE_CALL_NO_DIFFERENCE = 'no answer has made a difference to these two goals yet';

/** The words that mark the answer taken among the readings. */
export const STAGE_CALL_TAKEN = 'your answer';

/**
 * **Each answer's two final goals so far, in one sentence** — wave AO, lane DR-1,
 * [§ D1433](../../../../DECISIONS.md), swarm DR's ruling § Q1 item 2; reordered by wave AP's lane DT-2
 * (swarm DT's Q3 item 1): the answer taken first, marked, then the others in the counts sentence's
 * order. Read off each answer's run at the playhead itself (`shift/dayCallMaxima.ts`), the instant
 * the rail reads: *By 10:41, the deepest landing and the longest wait so far: 22 and 340 s with
 * Energy aware driving, your answer; …*. A reading past its bar says so with the bar. A longest wait
 * that is a rider still standing is pending on the rail, and is said as such. `undefined` where the
 * record carries no readings.
 */
export function stageCallReadingsLineOf(
  record: DayCallRecord,
  goals: readonly ShiftGoal[],
  playheadS: number,
  clockOf: (simTimeS: number) => string,
): string | undefined {
  const read = readingsOf(record, goals, playheadS);
  const first = read?.[0];
  if (read === undefined || first === undefined) return undefined;
  const pastBar = (reading: DayCallMaximaReadings['queue'], unit: string): string =>
    reading?.state === 'missed' ? ` (past its bar of ${String(reading.goal.bar)}${unit})` : '';
  const figures = read.map(({ at }) => {
    const queue =
      at.queue === undefined || at.queue.observed === null ? 'not yet graded' : `${String(at.queue.observed)}${pastBar(at.queue, '')}`;
    const wait =
      at.worstWait === undefined || at.worstWait.observed === null
        ? 'a wait still under way'
        : `${String(at.worstWait.observed)} s${pastBar(at.worstWait, ' s')}`;
    return `${queue} and ${wait}`;
  });
  /*
   * **Every answer reading alike is said once** — GitHub issue #631, wave AQ lane AQ-4. The readings
   * are running maxima over the whole day, and the three runs share every second before the call,
   * so a maximum set before it stands under every answer until one run passes it. The playtest met
   * three identical clauses and read the answer as meaningless; the figures are still named.
   */
  const [shared] = figures;
  if (read.length > 1 && shared !== undefined && figures.every((figure) => figure === shared)) {
    return (
      `By ${clockOf(first.at.atS)}, ${STAGE_CALL_NO_DIFFERENCE}: the deepest landing and the longest wait ` +
      `so far are ${shared} with every answer.`
    );
  }
  const clauses = read.map(({ answer }, index) => {
    const taken = answer === record.answer ? `, ${STAGE_CALL_TAKEN}` : '';
    return `${figures[index] ?? ''} with ${dayCallAnswerWordsOf(record, answer)}${taken}`;
  });
  return `By ${clockOf(first.at.atS)}, the deepest landing and the longest wait so far: ${clauses.join('; ')}.`;
}

/** The instant a record's row can be printed: its window observed, or the run over. */
export function stageCallRowDueAtS(record: Pick<DayCallRecord, 'windowEndS'>, endedAt: number): number {
  return Math.min(record.windowEndS + DAY_CALL_LONG_WAIT_S, endedAt);
}

/**
 * The rows due at `playheadS`, one per answered or skipped call whose window can be observed.
 * `log` is the run's own press log, for the later-press clause.
 *
 * **A row that reads goals** leads with {@link stageCallLeadOf} and then {@link stageCallReadingsLineOf},
 * and prints no count (swarm DT's Q3 item 2). Its runs carry nothing pressed after the call, so a
 * later press anywhere after the call is named: the stage's own figures carry it and these do not.
 * **A record without readings** keeps wave AL's counts-only row, its note, and the window's
 * later-press clause.
 */
export function stageCallRowsOf(input: {
  readonly records: readonly DayCallRecord[];
  readonly playheadS: number;
  readonly endedAt: number;
  readonly log: readonly RunInterventionConfig[];
  readonly clockOf: (simTimeS: number) => string;
  /** The day's goals, for each row's goal readings (§ D1433); absent, the rows print counts only. */
  readonly goals?: readonly ShiftGoal[] | undefined;
}): readonly StageCallRowView[] {
  const rows: StageCallRowView[] = [];
  const pressesOf = (entries: readonly RunInterventionConfig[], noun: string): string =>
    entries.length === 0
      ? ''
      : `Your ${entries.length === 1 ? 'press' : 'presses'} at ${entries
          .map((entry) => input.clockOf(entry.atS))
          .join(', ')} ${entries.length === 1 ? 'is' : 'are'} not in these ${noun}.`;
  for (const [index, record] of input.records.entries()) {
    if (input.playheadS < stageCallRowDueAtS(record, input.endedAt)) continue;
    const id = `stage-call-row-${String(index + 1)}`;
    const heading = `The call at ${input.clockOf(record.atS)}`;
    const goals =
      input.goals === undefined ? undefined : stageCallReadingsLineOf(record, input.goals, input.playheadS, input.clockOf);
    if (input.goals !== undefined && goals !== undefined) {
      const note = pressesOf(
        input.log.filter((entry) => entry.atS > record.atS && entry.atS <= input.playheadS),
        'runs',
      );
      rows.push({
        id,
        kind: 'call',
        heading,
        lead: stageCallLeadOf(record, input.goals, input.playheadS, input.clockOf),
        goals,
        ...(note === '' ? {} : { note }),
      });
      continue;
    }
    const pressNote = pressesOf(
      input.log.filter((entry) => entry.atS > record.atS && entry.atS < record.windowEndS),
      'counts',
    );
    rows.push({
      id,
      kind: 'call',
      heading,
      counts: dayCallCountsLineOf(record, input.clockOf),
      note: pressNote === '' ? STAGE_CALL_ROW_NOTE : `${STAGE_CALL_ROW_NOTE} ${pressNote}`,
    });
  }
  return sameNoDifferenceOnce(rows, input.records, input.clockOf);
}

/**
 * **Calls in a row that say the same *no difference* are said once** — wave AR, lane AR-2,
 * [§ D1529](../../../../DECISIONS.md). The re-play met the 17:20 and 17:25 calls as two blocks, each
 * *No answer has crossed a bar yet* and *By 18:00, no answer has made a difference …*, word for word.
 * Neighbouring goal rows whose lead, readings and note are the same string and read
 * {@link STAGE_CALL_NO_DIFFERENCE} become one row headed *The calls at 17:20 and 17:25*. A row with
 * any word of its own (a crossing, a figure that differs, a later press) stands alone.
 */
function sameNoDifferenceOnce(
  rows: readonly StageCallRowView[],
  records: readonly DayCallRecord[],
  clockOf: (simTimeS: number) => string,
): readonly StageCallRowView[] {
  const atOf = new Map(records.map((record, index) => [`stage-call-row-${String(index + 1)}`, record.atS]));
  const out: { row: StageCallRowView; clocks: string[] }[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    const plain = row.kind === 'call' && row.goals !== undefined && row.goals.includes(STAGE_CALL_NO_DIFFERENCE);
    if (
      plain &&
      last !== undefined &&
      last.row.kind === 'call' &&
      last.row.goals === row.goals &&
      last.row.lead === row.lead &&
      last.row.note === row.note
    ) {
      last.clocks.push(clockOf(atOf.get(row.id) ?? 0));
      continue;
    }
    out.push({ row, clocks: [clockOf(atOf.get(row.id) ?? 0)] });
  }
  return out.map(({ row, clocks }) =>
    clocks.length < 2 ? row : { ...row, heading: `The calls at ${clocks.slice(0, -1).join(', ')} and ${clocks.at(-1) ?? ''}` },
  );
}

/**
 * **A moment whose question a run could not be made for, on the stage** — wave AN, lane DQ-1,
 * [§ D1335](../../../../DECISIONS.md). One row per such moment, from the instant the playhead
 * reaches it and never before: the session runs ahead of the stage, and a row printed early would say
 * where somebody is about to have waited a minute. Its words are the report row's sentence
 * (`shift/dayCalls.ts#dayCallFailedSentenceOf`), so the two surfaces describe the fault alike, and it
 * carries no figure because nothing was compared.
 */
export function stageCallFailedRowsOf(input: {
  readonly failures: readonly DayCallFailure[];
  readonly playheadS: number;
  readonly clockOf: (simTimeS: number) => string;
}): readonly StageCallRowView[] {
  const instants = [...new Set(input.failures.map((failure) => failure.atS))].sort((a, b) => a - b);
  return instants
    .filter((atS) => input.playheadS >= atS)
    .map((atS, index) => ({
      id: `stage-call-failed-${String(index + 1)}`,
      kind: 'failed' as const,
      heading: `No call at ${input.clockOf(atS)}`,
      counts: dayCallFailedSentenceOf([input.clockOf(atS)]),
      note: STAGE_CALL_FAILED_NOTE,
    }));
}

/** The failed row's clause: the rule, which costs one moment and not the day. No figure, no forecast. */
export const STAGE_CALL_FAILED_NOTE =
  'A run that cannot be made costs the stage that one moment, not the rest of the day’s calls.';

/**
 * **When a wrinkle that raised no call may say so** — wave AN, lane DQ-1,
 * [§ D1336](../../../../DECISIONS.md): after its window, and after the last of its turned-down
 * moments can be observed (that moment's ten minutes and the minute its last rider needs, as a call
 * row waits), or at the run's end where either runs into it. Before then the line would say the
 * wrinkle raised nothing while it could still raise something, or quote counts of riders still
 * standing.
 */
export function stageCallWrinkleQuietDueAtS(quiet: DayCallWrinkleQuiet, endedAt: number): number {
  const counted = quiet.refused.map((record) => record.windowEndS + DAY_CALL_LONG_WAIT_S);
  return Math.min(Math.max(quiet.wrinkle.endS, ...counted), endedAt);
}

/** The wrinkle row's clause: whose runs the counts are, as the call row's note says it of a call. */
export const STAGE_CALL_WRINKLE_NOTE =
  'On this crowd, with every press before that moment kept and nothing pressed after it.';

/**
 * The wrinkle's past-tense row on the stage, once due ({@link stageCallWrinkleQuietDueAtS}): the
 * report row's sentence, word for word (`shift/dayCalls.ts#dayCallWrinkleQuietSentenceOf`), so the
 * two cannot differ, and {@link STAGE_CALL_WRINKLE_NOTE}, since its counts are runs of a call's kind.
 */
export function stageCallWrinkleQuietRowsOf(input: {
  readonly quiet: DayCallWrinkleQuiet | undefined;
  readonly playheadS: number;
  readonly endedAt: number;
  readonly clockOf: (simTimeS: number) => string;
}): readonly StageCallRowView[] {
  const quiet = input.quiet;
  if (quiet === undefined || input.playheadS < stageCallWrinkleQuietDueAtS(quiet, input.endedAt)) return [];
  return [
    {
      id: 'stage-call-wrinkle-quiet',
      kind: 'wrinkle',
      heading: `${quiet.wrinkle.name} raised no call`,
      counts: dayCallWrinkleQuietSentenceOf(quiet, input.clockOf),
      note: STAGE_CALL_WRINKLE_NOTE,
    },
  ];
}
