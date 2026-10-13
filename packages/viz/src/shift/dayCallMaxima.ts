/**
 * **Each answer's two final goals, so far, at the stage's playhead** — wave AO, lane DR-1,
 * [§ D1433](../../../../DECISIONS.md), swarm DR's ruling § Q1 item 2.
 *
 * The post-AN panel met a call's row that counted one-minute waits over ten minutes while the day
 * was graded on the deepest landing and the longest wait, usually settled later: the answer with
 * the fewest one-minute waits missed the day on 10 of 21 deciding rows (S2), and on 8 of 22 split
 * rows the readings at the window's end were identical under all three answers (S1). So once a
 * call's row is due, it reads those two goals off each answer's run at the stage's playhead.
 *
 * ## What is stored, and why it is exact
 *
 * The three runs a call compares are whole-day runs, held only while the session asks; an attempt
 * resumed after a reload has its records and not its runs. So the record keeps, for each answer,
 * the two readings the rail folds (`live/observations.ts#observationsAt`, through
 * `shift/observations.ts#shiftObservationsOf`) at every whole minute of the run from the call, and
 * at its end: the arrivals that open the goals (capped at `WAKE_UP_ARRIVALS`, past which they open
 * nothing), the deepest landing, and the longest wait, or `null` where the longest wait is a rider
 * still standing, which the rail reads as pending. A sample is kept only where one of the three
 * moved, so a stretch with nothing new costs nothing. Each sample is that fold at its instant,
 * exactly, which `dayCallMaxima.test.ts` holds against `observationsAt` on a shipped run.
 *
 * ## What it may say, and what not
 *
 * A reading at an instant the stage has reached is the past of that run: § D1219's footing, as the
 * counts are. The one verdict it carries is § D1168's: a maximum past its bar stays past it, so a
 * run whose reading is past its bar could no longer clear from that minute. That is said only once
 * the reading is past the bar ({@link dayCallMaximaReadingsAt}), never from a run's later minutes,
 * and it amends § D1219 clause 2 for that one fact (§ D1433).
 *
 * Pure: the session computes it when a call is raised (`dev/dayCallSession.ts`), the stage's row
 * reads it (`everyday/stageCallRow.ts`).
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';

import { readGoal } from './goals.js';
import { WAKE_UP_ARRIVALS, type GoalObservations, type GoalReading, type ShiftGoal } from './types.js';

/** How often a run is read, in simulated seconds: each whole minute, on the run's own clock. */
export const DAY_CALL_MAXIMA_STEP_S = 60;

/**
 * One reading of a run: `[atS, arrived, deepest landing, longest wait]`. `arrived` is capped at
 * `WAKE_UP_ARRIVALS`; the longest wait is whole seconds as the rail rounds it, or `null` where it
 * is a rider still standing.
 */
export type DayCallMaximaSample = readonly [atS: number, arrived: number, peakQueue: number, worstWaitS: number | null];

/** One answer's run, read from its call to its end. */
export interface DayCallMaxima {
  /** Where the readings start: the call's second. */
  readonly fromS: number;
  /** The run's end, where the last reading is taken. */
  readonly endedAt: number;
  /** The readings, in order, each kept only where it differs from the one before. */
  readonly samples: readonly DayCallMaximaSample[];
}

/** The instants a run is read at: each whole minute from `fromS` (itself included) to `endedAt`, which is read too. */
function instantsOf(fromS: number, endedAt: number): readonly number[] {
  const out = [fromS];
  for (let t = Math.floor(fromS / DAY_CALL_MAXIMA_STEP_S + 1) * DAY_CALL_MAXIMA_STEP_S; t < endedAt; t += DAY_CALL_MAXIMA_STEP_S) {
    out.push(t);
  }
  if (endedAt > fromS) out.push(endedAt);
  return out;
}

/**
 * The deepest landing's rises over the whole run: `live/observations.ts#sweepQueues`' own fold,
 * events and order and all, recorded where the maximum rises. A maximum is a running one, so its
 * value at any instant is the last rise at or before it.
 */
function peakRisesOf(recording: VizRecording): readonly (readonly [number, number])[] {
  const events: { at: SimTime; delta: 1 | -1; floorId: string; passengerId: string }[] = [];
  for (const leg of recording.legs) {
    if (leg.refusedAt !== undefined) continue;
    events.push({ at: leg.arrivedAt, delta: 1, floorId: leg.originFloorId, passengerId: leg.passengerId });
    if (leg.boardedAt !== undefined) {
      events.push({ at: leg.boardedAt, delta: -1, floorId: leg.originFloorId, passengerId: leg.passengerId });
    }
  }
  events.sort((a, b) => a.at - b.at || a.delta - b.delta || a.passengerId.localeCompare(b.passengerId));
  const depth = new Map<string, number>();
  const rises: [number, number][] = [];
  let peak = 0;
  for (const event of events) {
    const next = (depth.get(event.floorId) ?? 0) + event.delta;
    depth.set(event.floorId, next);
    if (next > peak) {
      peak = next;
      rises.push([event.at, peak]);
    }
  }
  return rises;
}

/**
 * {@link DayCallMaxima} for `recording` from `fromS`: the rail's two maxima and its wake-up gate at
 * each whole minute and at the run's end, kept where they move.
 */
export function dayCallMaximaOf(recording: VizRecording, fromS: number): DayCallMaxima {
  const endedAt = recording.endedAt;
  const startS = Math.min(Math.max(fromS, recording.startedAt), endedAt);
  const rises = peakRisesOf(recording);
  const samples: DayCallMaximaSample[] = [];
  let rise = 0;
  let peak = 0;
  for (const raw of instantsOf(startS, endedAt)) {
    const t = Math.min(Math.max(raw, recording.startedAt), endedAt);
    while (rise < rises.length && rises[rise]![0] <= t) {
      peak = rises[rise]![1];
      rise += 1;
    }
    /* `observationsAt`'s own worst-wait fold, rule for rule: strict `>` in record order, clamped at 0. */
    let arrived = 0;
    let worst: number | undefined;
    let censored = false;
    for (const leg of recording.legs) {
      if (leg.arrivedAt > t) break;
      arrived += 1;
      const resolvedAt = leg.boardedAt ?? leg.refusedAt;
      const resolved = resolvedAt !== undefined && resolvedAt <= t;
      const waitS = Math.max(0, (resolved ? resolvedAt : t) - leg.arrivedAt);
      if (worst === undefined || waitS > worst) {
        worst = waitS;
        censored = !resolved;
      }
    }
    const sample: DayCallMaximaSample = [
      raw,
      Math.min(arrived, WAKE_UP_ARRIVALS),
      peak,
      censored ? null : Math.round(worst ?? 0),
    ];
    const last = samples[samples.length - 1];
    if (last === undefined || last[1] !== sample[1] || last[2] !== sample[2] || last[3] !== sample[3]) samples.push(sample);
  }
  return Object.freeze({ fromS: startS, endedAt, samples: Object.freeze(samples) });
}

/** The instant a reading at `playheadS` is true of: the last whole minute reached, or the run's end. */
export function dayCallMaximaInstantAt(maxima: DayCallMaxima, playheadS: number): number | undefined {
  if (playheadS < maxima.fromS) return undefined;
  if (playheadS >= maxima.endedAt) return maxima.endedAt;
  const minute = Math.floor(playheadS / DAY_CALL_MAXIMA_STEP_S) * DAY_CALL_MAXIMA_STEP_S;
  return Math.max(maxima.fromS, minute);
}

/** The sample standing at `atS`: the last kept at or before it. */
function sampleAt(maxima: DayCallMaxima, atS: number): DayCallMaximaSample | undefined {
  let found: DayCallMaximaSample | undefined;
  for (const sample of maxima.samples) {
    if (sample[0] > atS) break;
    found = sample;
  }
  return found;
}

/** The two final goals' readings off one answer's run at one instant, by the rail's own `readGoal`. */
export interface DayCallMaximaReadings {
  /** The instant they are true of — a whole minute the stage has reached, or the run's end. */
  readonly atS: number;
  readonly queue: GoalReading | undefined;
  readonly worstWait: GoalReading | undefined;
  /**
   * The first instant among the kept readings at which either goal read past its bar, at or before
   * {@link atS}; `undefined` while neither has. From there the run could no longer clear.
   */
  readonly pastBarFromS: number | undefined;
}

/** The fields `readGoal` reads for the two goals graded on a maximum; nothing else is consulted. */
function observationsOf(sample: DayCallMaximaSample): GoalObservations {
  return {
    arrived: sample[1],
    carryPct: 100,
    minutePct: 100,
    peakQueue: sample[2],
    abandoned: 0,
    abandonedCarried: 0,
    horizonS: 0,
    worstWaitS: sample[3] ?? 0,
    worstWaitIsCensored: sample[3] === null,
  };
}

/**
 * **The readings a row prints at `playheadS`** — the queue and worst-wait goals of `goals`, read off
 * the sample standing at the last whole minute the stage has reached, by `shift/goals.ts#readGoal`,
 * so *past its bar* is the rail's own `'missed'` and nothing looser. `undefined` before the call.
 */
export function dayCallMaximaReadingsAt(
  maxima: DayCallMaxima,
  goals: readonly ShiftGoal[],
  playheadS: number,
): DayCallMaximaReadings | undefined {
  const atS = dayCallMaximaInstantAt(maxima, playheadS);
  if (atS === undefined) return undefined;
  const sample = sampleAt(maxima, atS);
  if (sample === undefined) return undefined;
  const queueGoal = goals.find((goal) => goal.id === 'queue');
  const worstGoal = goals.find((goal) => goal.id === 'worst-wait');
  const readingsOf = (at: DayCallMaximaSample): readonly (GoalReading | undefined)[] => [
    queueGoal === undefined ? undefined : readGoal(queueGoal, observationsOf(at)),
    worstGoal === undefined ? undefined : readGoal(worstGoal, observationsOf(at)),
  ];
  const [queue, worstWait] = readingsOf(sample);
  let pastBarFromS: number | undefined;
  for (const kept of maxima.samples) {
    if (kept[0] > atS) break;
    if (readingsOf(kept).some((reading) => reading?.state === 'missed')) {
      pastBarFromS = kept[0];
      break;
    }
  }
  return Object.freeze({ atS, queue, worstWait, pastBarFromS });
}
