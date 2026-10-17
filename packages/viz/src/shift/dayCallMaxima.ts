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
 * `shift/observations.ts#shiftObservationsOf`) at every instant from the call that the fold moves,
 * and at its end ({@link dayCallMaximaOf} says which instants those are): the arrivals that open the goals (capped at `WAKE_UP_ARRIVALS`, past which they open
 * nothing), the deepest landing, and the longest wait, or `null` where the longest wait is a rider
 * still standing, which the rail reads as pending. A sample is kept only where one of the three
 * moved, so a stretch with nothing new costs nothing. Each sample is that fold at its instant,
 * exactly, and between samples the fold does not move, which `dayCallMaxima.test.ts` holds against
 * `observationsAt` at every event of two shipped runs and just after each.
 *
 * ## What it may say, and what not
 *
 * A reading at an instant the stage has reached is the past of that run: § D1219's footing, as the
 * counts are. The one verdict it carries is § D1168's: a maximum past its bar stays past it, so a
 * run whose reading is past its bar could no longer clear from that instant. That is said only once
 * the reading is past the bar ({@link dayCallMaximaReadingsAt}), never from a run's later instants,
 * and it amends § D1219 clause 2 for that one fact (§ D1433).
 *
 * Pure: the session computes it when a call is raised (`dev/dayCallSession.ts`), the stage's row
 * reads it (`everyday/stageCallRow.ts`).
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';

import { readGoal } from './goals.js';
import { WAKE_UP_ARRIVALS, type GoalObservations, type GoalReading, type ShiftGoal } from './types.js';
import type { DayCallAnswer, DayCallRecord } from './dayCalls.js';

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
  /**
   * The readings, in order, one at each instant the fold moves: the reading at any instant is the
   * last sample at or before it. A record written before wave AP kept them at whole minutes, and
   * reads the same way.
   */
  readonly samples: readonly DayCallMaximaSample[];
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

/* The next representable double either side of a time, for a crossing that falls between two. */
const STEP_SCRATCH = new Float64Array(1);
const STEP_BITS = new BigInt64Array(STEP_SCRATCH.buffer);
function nextAbove(x: number): number {
  STEP_SCRATCH[0] = x;
  STEP_BITS[0] = (STEP_BITS[0] ?? 0n) + 1n;
  return STEP_SCRATCH[0];
}
function nextBelow(x: number): number {
  if (x <= 0) return -Infinity;
  STEP_SCRATCH[0] = x;
  STEP_BITS[0] = (STEP_BITS[0] ?? 0n) - 1n;
  return STEP_SCRATCH[0];
}

/**
 * {@link DayCallMaxima} for `recording` from `fromS`: the rail's two maxima and its wake-up gate at
 * every instant they move — wave AP, lane DT-2, seat D's D5.
 *
 * ## Why every instant, not every minute
 *
 * Wave AO kept a reading at each whole minute, and the row read the last minute reached. The lost
 * day's card reads the rail at the frame, so on week 1's Thursday at 08:48 the card said the deepest
 * landing had reached 27 while the row, on the same run, said 26: the landing rose during 08:48 and
 * the row was a minute behind. One source at one instant means the row reads the run where the rail
 * does, so the readings are kept wherever `observationsAt`'s fold can move, and nowhere else:
 *
 * - **a leg arrives** (the wake-up count, a first rider standing) or **is resolved**, boarded or
 *   turned away (the longest resolved wait, the earliest rider still standing);
 * - **the deepest landing rises** ({@link peakRisesOf});
 * - **a rider still standing overtakes the longest resolved wait**, which happens between events,
 *   at `arrivedAt + longest`: from that instant the rail reads the longest wait as a wait under way.
 *   Ties go the fold's way, to the earlier leg in record order, to the exact double.
 *
 * Between those instants the fold's output cannot move, so the readings are exact at every instant,
 * which `dayCallMaxima.test.ts` holds against `observationsAt` at every event and between them.
 */
export function dayCallMaximaOf(recording: VizRecording, fromS: number): DayCallMaxima {
  const endedAt = recording.endedAt;
  const startS = Math.min(Math.max(fromS, recording.startedAt), endedAt);
  const legs = recording.legs;
  const rises = peakRisesOf(recording);
  /* A leg is resolved, for the fold, once it has both arrived and boarded or been turned away. */
  const resolutions: { readonly at: number; readonly index: number }[] = [];
  for (const [index, leg] of legs.entries()) {
    const resolvedAt = leg.boardedAt ?? leg.refusedAt;
    if (resolvedAt !== undefined) resolutions.push({ at: Math.max(resolvedAt, leg.arrivedAt), index });
  }
  resolutions.sort((a, b) => a.at - b.at || a.index - b.index);
  const instants = new Set<number>([startS, endedAt]);
  for (const leg of legs) if (leg.arrivedAt > startS && leg.arrivedAt < endedAt) instants.add(leg.arrivedAt);
  for (const { at } of resolutions) if (at > startS && at < endedAt) instants.add(at);
  for (const [at] of rises) if (at > startS && at < endedAt) instants.add(at);
  const ordered = [...instants].sort((a, b) => a - b);

  const resolved = new Uint8Array(legs.length);
  let arrived = 0;
  let resolution = 0;
  let rise = 0;
  let peak = 0;
  /* The longest resolved wait and the first leg in record order that reached it. */
  let longest: number | undefined;
  let longestIndex = 0;
  /* The first leg in record order that has arrived and is not resolved: the longest wait standing. */
  let standing = 0;
  const advanceTo = (t: number): void => {
    while (arrived < legs.length && legs[arrived]!.arrivedAt <= t) arrived += 1;
    while (resolution < resolutions.length && resolutions[resolution]!.at <= t) {
      const { index } = resolutions[resolution]!;
      resolution += 1;
      resolved[index] = 1;
      const leg = legs[index]!;
      const waitS = Math.max(0, (leg.boardedAt ?? leg.refusedAt ?? leg.arrivedAt) - leg.arrivedAt);
      if (longest === undefined || waitS > longest || (waitS === longest && index < longestIndex)) {
        longest = waitS;
        longestIndex = index;
      }
    }
    while (standing < arrived && resolved[standing] === 1) standing += 1;
    while (rise < rises.length && rises[rise]![0] <= t) {
      peak = rises[rise]![1];
      rise += 1;
    }
  };
  /* `observationsAt`'s worst-wait fold, rule for rule: the first leg in record order at the maximum. */
  const standingOvertakes = (t: number): boolean => {
    if (standing >= arrived) return false;
    if (longest === undefined) return true;
    const waitS = Math.max(0, t - legs[standing]!.arrivedAt);
    return waitS > longest || (waitS === longest && standing < longestIndex);
  };
  const samples: DayCallMaximaSample[] = [];
  const keep = (t: number): void => {
    const worst = arrived === 0 ? 0 : standingOvertakes(t) ? null : Math.round(longest ?? 0);
    const sample: DayCallMaximaSample = [t, Math.min(arrived, WAKE_UP_ARRIVALS), peak, worst];
    const last = samples[samples.length - 1];
    if (last === undefined || last[1] !== sample[1] || last[2] !== sample[2] || last[3] !== sample[3]) samples.push(sample);
  };
  for (const [position, t] of ordered.entries()) {
    advanceTo(t);
    keep(t);
    /*
     * Between this instant and the next nothing arrives, boards or rises, so the one thing that can
     * move is a rider still standing overtaking the longest resolved wait: find the first double at
     * which the fold says so, if it falls before the next instant.
     */
    const next = ordered[position + 1];
    if (next === undefined || standingOvertakes(t) || standing >= arrived || longest === undefined) continue;
    let crossing = Math.max(legs[standing]!.arrivedAt + longest, nextAbove(t));
    while (!standingOvertakes(crossing)) crossing = nextAbove(crossing);
    for (let below = nextBelow(crossing); below > t && standingOvertakes(below); below = nextBelow(crossing)) crossing = below;
    if (crossing < next) keep(crossing);
  }
  return Object.freeze({ fromS: startS, endedAt, samples: Object.freeze(samples) });
}

/**
 * The instant a reading at `playheadS` is true of: the playhead itself, where the rail reads it, or
 * the run's end past it. `undefined` before the call.
 */
export function dayCallMaximaInstantAt(maxima: DayCallMaxima, playheadS: number): number | undefined {
  if (playheadS < maxima.fromS) return undefined;
  return Math.min(playheadS, maxima.endedAt);
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
  /** The instant they are true of: the playhead, where the rail reads it, or the run's end. */
  readonly atS: number;
  readonly queue: GoalReading | undefined;
  readonly worstWait: GoalReading | undefined;
  /**
   * The first instant among the kept readings at which either goal read past its bar, at or before
   * {@link atS}; `undefined` while neither has. From there the run could no longer clear.
   */
  readonly pastBarFromS: number | undefined;
  /**
   * The readings past their bar at {@link pastBarFromS}, the crossing's own figures: what the row's
   * lead and the close name. Empty while neither goal has crossed.
   */
  readonly pastBar: readonly GoalReading[];
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
 * the sample standing at the playhead (the rail's own instant), by `shift/goals.ts#readGoal`,
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
  let pastBar: readonly GoalReading[] = [];
  for (const kept of maxima.samples) {
    if (kept[0] > atS) break;
    const missed = readingsOf(kept).filter((reading): reading is GoalReading => reading?.state === 'missed');
    if (missed.length > 0) {
      pastBarFromS = kept[0];
      pastBar = Object.freeze(missed);
      break;
    }
  }
  return Object.freeze({ atS, queue, worstWait, pastBarFromS, pastBar });
}

/**
 * **A crossing in words** — wave AP, lane DT-2: *the deepest landing reached 33 against a bar of 32*,
 * or both goals joined where both crossed at one instant. The figure is the reading at the crossing
 * (`pastBar`), so the row's lead and the close name the same instant's figure. Nothing about why.
 */
export function dayCallCrossingPhraseOf(pastBar: readonly GoalReading[]): string {
  const parts = pastBar.flatMap((reading) => {
    if (reading.observed === null) return [];
    const unit = reading.goal.unit;
    const what = reading.goal.id === 'queue' ? 'the deepest landing' : 'the longest wait';
    return [`${what} reached ${String(reading.observed)}${unit} against a bar of ${String(reading.goal.bar)}${unit}`];
  });
  return parts.join(' and ');
}

/**
 * **A call's record with each answer's readings taken from its runs** — the one place § D1433's
 * maxima are attached to a counted record, so an ordinary call (`dev/dayCallSession.ts`) and the
 * pinned day's call (`dev/main.ts#measurePinnedCall`, wave AP's lane DT-2, [§ D1471](../../../../DECISIONS.md), swarm DT's Q3 item 4)
 * carry the same readings and draw the same row. Taken while the runs are in hand, so a resumed
 * attempt reads them from the record. An answer with no run is left out, and its row reads the
 * others.
 */
export function dayCallRecordWithMaximaOf(
  counted: DayCallRecord,
  runs: Partial<Record<DayCallAnswer, VizRecording>>,
): DayCallRecord {
  const maxima: Partial<Record<DayCallAnswer, DayCallMaxima>> = {};
  for (const [answer, recording] of Object.entries(runs) as [DayCallAnswer, VizRecording | undefined][]) {
    if (recording !== undefined) maxima[answer] = dayCallMaximaOf(recording, counted.atS);
  }
  return Object.freeze({ ...counted, maxima: Object.freeze(maxima) });
}
