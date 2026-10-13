/**
 * **The cadence floors a correct build's careful day meets, and the trap check on the who-drives
 * card** — wave AN, lane DQ-1, [§ D1338](../../../../DECISIONS.md) and
 * [§ D1337](../../../../DECISIONS.md), swarm DQ's ruling Q1 items 3 and 5.
 *
 * The arithmetic only: `callCadence.sweep.test.ts` plays the days through the shipped session and
 * hands each one here as a {@link CadenceDay}; `callCadence.test.ts` holds every floor and the trap
 * check to synthetic days on every run, so the gated sweep's verdict rests on arithmetic the ordinary
 * suite has already checked.
 *
 * ## The floors, written before the run
 *
 * The post-AM panel scored the calls on a bundle whose worker refused every handover (§ D1317), so
 * its 0.07 decisions a real minute measured a build fault. Swarm DQ measured the careful policy on a
 * correct build at 4.42 to 4.8 calls a day with an evening call on 5 of 5 days, and ruled that no
 * cadence rule is loosened and the correct build's figures become floors:
 *
 * - the median day raises at least {@link CADENCE_MEDIAN_CALLS_FLOOR} calls;
 * - no weekday raises none;
 * - each crowd's week has an evening call on at least {@link CADENCE_EVENING_DAYS_FLOOR} of its five
 *   weekdays;
 * - the longest silence is published, with no floor: the stretch of real time at the default rung
 *   between two decisions (the day's start and end count as decisions), and the part of it played at
 *   the watching rate because somebody had waited a minute.
 *
 * ## The trap check, published since wave AO
 *
 * Within the who-drives question, the answer whose run left the fewest riders waiting a minute over
 * the call's ten minutes is the one the row favours. An answer that is lowest on under
 * {@link CADENCE_TRAP_SHARE} of the rows is a trap a player learns never to press, and one that is
 * lowest on over {@link CADENCE_FORMULA_SHARE} is a formula (swarm DQ's player member). Ties count for
 * every answer tied lowest. It reads which answer is lowest only to say how often each is; nothing
 * the product shows reads it.
 *
 * **It no longer gates** — wave AO, lane DR-2, [§ D1440](../../../../DECISIONS.md), swarm DR's ruling
 * Q2 item 1. The row's favourite lost the day about as often as it won (swarm DR's S1: on 20 of 55
 * split rows every answer with the lowest count missed), so the check is judged on the day's verdict
 * instead, on the weeks dealt from week 2 (`callBands.sweep.test.ts`, `shift/callBands.ts`). Here it
 * is published beside the floors ({@link countTrapNotesOf}), with each who-drives row's verdict split
 * ({@link verdictReadingOf}), on week 1, which DC-11 exempts and the bands do not read.
 */

import type { DayCallAnswer, DayCallQuestion } from '../shift/dayCalls.js';

/** At least four calls on the median day. */
export const CADENCE_MEDIAN_CALLS_FLOOR = 4;
/** An evening call on at least three of a week's five weekdays. */
export const CADENCE_EVENING_DAYS_FLOOR = 3;
/** Under a tenth of the rows: a trap. */
export const CADENCE_TRAP_SHARE = 0.1;
/** Over three fifths of the rows: a formula. */
export const CADENCE_FORMULA_SHARE = 0.6;

/** One raised call as the cadence instrument reads it. */
export interface CadenceCall {
  readonly atS: number;
  readonly question: DayCallQuestion | 'pinned';
  readonly counts: Readonly<Partial<Record<DayCallAnswer, number>>>;
  /** Each answer's run graded with the day's goals, `true` cleared; absent where not graded. */
  readonly clears?: Readonly<Partial<Record<DayCallAnswer, boolean>>> | undefined;
}

/**
 * **The who-drives rows on the day's verdict** — published on week 1, never banded (§ D1440): how
 * many rows split the day, and on how many of those *keep* missed while another answer cleared.
 */
export function verdictReadingOf(calls: readonly CadenceCall[]): { readonly rows: number; readonly split: number; readonly keepLoses: number } {
  const rows = calls.filter((call) => call.question === 'driver' && call.clears !== undefined);
  const split = rows.filter((call) => new Set(Object.values(call.clears ?? {})).size > 1);
  return { rows: rows.length, split: split.length, keepLoses: split.filter((call) => call.clears?.leave === false).length };
}

/** One played weekday. */
export interface CadenceDay {
  /** Which crowd's week the day belongs to. */
  readonly crowd: number;
  readonly day: number;
  readonly calls: readonly CadenceCall[];
  /** Whether any call fell inside the day's last act, its evening peak. */
  readonly evening: boolean;
  /** Real seconds at the default rung: the day, its longest gap between two decisions, and that gap's watched part. */
  readonly realS: number;
  readonly longestGapRealS: number;
  readonly longestWaitingGapRealS: number;
}

/** Each answer's share of a question's rows on which it was lowest, ties counted for each. */
export function lowestSharesOf(
  calls: readonly CadenceCall[],
  question: DayCallQuestion,
): { readonly rows: number; readonly shares: Readonly<Partial<Record<DayCallAnswer, number>>> } {
  const rows = calls.filter((call) => call.question === question);
  const lowest: Partial<Record<DayCallAnswer, number>> = {};
  for (const row of rows) {
    const entries = Object.entries(row.counts) as [DayCallAnswer, number][];
    if (entries.length === 0) continue;
    const low = Math.min(...entries.map(([, count]) => count));
    for (const [answer, count] of entries) {
      lowest[answer] = (lowest[answer] ?? 0) + (count === low ? 1 : 0);
    }
  }
  const shares: Partial<Record<DayCallAnswer, number>> = {};
  for (const [answer, count] of Object.entries(lowest) as [DayCallAnswer, number][]) {
    shares[answer] = rows.length === 0 ? 0 : count / rows.length;
  }
  return { rows: rows.length, shares };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return Number.NaN;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** What a sweep of played days measured, every figure from the days. */
export interface CadenceSummary {
  readonly days: number;
  readonly medianCalls: number;
  readonly silentDays: number;
  /** Per crowd, how many of its weekdays had an evening call, and of how many. */
  readonly eveningByCrowd: ReadonlyMap<number, { readonly evening: number; readonly days: number }>;
  readonly medianCallsPerRealMinute: number;
  readonly longestGapMinutes: { readonly median: number; readonly max: number };
  readonly longestWaitingGapMinutes: { readonly median: number; readonly max: number };
  readonly driver: ReturnType<typeof lowestSharesOf>;
  readonly placement: ReturnType<typeof lowestSharesOf>;
}

export function cadenceOf(days: readonly CadenceDay[]): CadenceSummary {
  const eveningByCrowd = new Map<number, { evening: number; days: number }>();
  for (const day of days) {
    const entry = eveningByCrowd.get(day.crowd) ?? { evening: 0, days: 0 };
    entry.days += 1;
    if (day.evening) entry.evening += 1;
    eveningByCrowd.set(day.crowd, entry);
  }
  const calls = days.flatMap((day) => day.calls);
  const gaps = days.map((day) => day.longestGapRealS / 60);
  const waiting = days.map((day) => day.longestWaitingGapRealS / 60);
  return {
    days: days.length,
    medianCalls: median(days.map((day) => day.calls.length)),
    silentDays: days.filter((day) => day.calls.length === 0).length,
    eveningByCrowd,
    medianCallsPerRealMinute: median(days.filter((day) => day.realS > 0).map((day) => day.calls.length / (day.realS / 60))),
    longestGapMinutes: { median: median(gaps), max: Math.max(...gaps) },
    longestWaitingGapMinutes: { median: median(waiting), max: Math.max(...waiting) },
    driver: lowestSharesOf(calls, 'driver'),
    placement: lowestSharesOf(calls, 'placement'),
  };
}

/** Every floor and trap bound the summary misses, in words; empty where all hold. */
export function cadenceMissesOf(summary: CadenceSummary): readonly string[] {
  const misses: string[] = [];
  if (!(summary.medianCalls >= CADENCE_MEDIAN_CALLS_FLOOR)) {
    misses.push(`the median day raised ${String(summary.medianCalls)} calls, under ${String(CADENCE_MEDIAN_CALLS_FLOOR)}`);
  }
  if (summary.silentDays > 0) misses.push(`${String(summary.silentDays)} weekday(s) raised no call`);
  for (const [crowd, { evening, days }] of summary.eveningByCrowd) {
    if (evening < Math.min(CADENCE_EVENING_DAYS_FLOOR, days)) {
      misses.push(`crowd ${String(crowd)} had an evening call on ${String(evening)} of ${String(days)} weekdays`);
    }
  }
  return misses;
}

/**
 * **§ D1337's count check, published and not gated** — § D1440. Every who-drives answer lowest on
 * under a tenth or over three fifths of the rows, in words; the sweep writes them beside the floors.
 */
export function countTrapNotesOf(summary: CadenceSummary): readonly string[] {
  const notes: string[] = [];
  for (const [answer, share] of Object.entries(summary.driver.shares)) {
    if (share < CADENCE_TRAP_SHARE || share > CADENCE_FORMULA_SHARE) {
      notes.push(`who drives: ${answer} was lowest on ${(share * 100).toFixed(1)} % of ${String(summary.driver.rows)} rows`);
    }
  }
  return notes;
}
