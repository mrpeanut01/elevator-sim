/**
 * **A scored whole day's real length, read off its legs** — the instrument behind
 * [§ D1212](../../../../DECISIONS.md)'s measurements, and a test helper because only measurements
 * call it: the stage asks `stagePace.ts#stagePaceOf` and `#stageSkipOf` frame by frame, and this is
 * the same two rules integrated over a recording, so a sweep can say how long a day takes without a
 * transport. `stagePace.test.ts` plays Midtown's day through the real `Playback` both ways and holds
 * this to it; `firstDayLength.test.ts`, `stagePace.sweep.test.ts` and `stageSkip.sweep.test.ts`
 * publish from it.
 */

import type { VizLeg } from '../contract/types.js';
import { isWaitingAt } from '../frame/overlay.js';
import type { DayAct } from '../shift/dayLength.js';

import { BETWEEN_PEAKS_SIM_PER_REAL_S, PACE_HOLD_WAIT_S, SKIP_BEAT_REAL_S } from './stagePace.js';

/** A scored whole day as the stage plays it, read off its legs — {@link scoredDayPlayOf}. */
export interface ScoredDayPlay {
  /** Real seconds from the start of the recording to `untilS` (or its end). */
  readonly realS: number;
  /** Simulated seconds at the watching rung: somebody on a landing past a minute. */
  readonly slowS: number;
  /** Simulated seconds the stage seeks over and never draws. */
  readonly skippedS: number;
  /** How many skips, each costing one beat. */
  readonly skips: number;
}

/**
 * **How long a scored whole day takes to watch, from its legs** — § D1169's pacing with § D1212's
 * skip as § D1266 widened it, as the stage plays it with no chip pressed: the watching rung while
 * somebody on a landing has waited a minute, the fast rung otherwise, and anywhere in the day every
 * quiet stretch of at least two beats played for one beat and then skipped to its end. `stopsAtS` are the instants the stage
 * stops at (the calls it raises and the candidates it waits at), which end a stretch as they end a
 * skip. `skip: false` is § D1169's day without the skip, the *before* of § D1212's measurement. The
 * pause at a stop is the player's and is not counted.
 *
 * `stagePace.test.ts` plays Midtown's day through the real `Playback`, frame by frame, both ways,
 * and holds this to it.
 */
export function scoredDayPlayOf(input: {
  readonly legs: readonly VizLeg[];
  readonly acts: readonly DayAct[];
  readonly startedAt: number;
  readonly endedAt: number;
  readonly stopsAtS: readonly number[];
  readonly watchingSimPerRealS: number;
  /**
   * `true` is the skip as the stage takes it now, anywhere in the day ([§ D1266](../../../../DECISIONS.md));
   * `'between-peaks'` is [§ D1212](../../../../DECISIONS.md)'s skip as it shipped, only between two
   * peaks, kept so a sweep can publish the step from one to the other on one tree; `false` is
   * § D1169's day with no skip.
   */
  readonly skip: boolean | 'between-peaks';
  readonly untilS?: number | undefined;
}): ScoredDayPlay {
  const until = Math.min(input.untilS ?? input.endedAt, input.endedAt);
  const fast = Math.max(input.watchingSimPerRealS, BETWEEN_PEAKS_SIM_PER_REAL_S);
  const beatSimS = SKIP_BEAT_REAL_S * fast;
  /* The slow set: every stretch with somebody past a minute, merged. */
  const raw: [number, number][] = [];
  for (const leg of input.legs) {
    const left = leg.refusedAt ?? leg.boardedAt ?? input.endedAt;
    const from = leg.arrivedAt + PACE_HOLD_WAIT_S;
    if (left > from && isWaitingAt(leg, from)) raw.push([from, left]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const slow: [number, number][] = [];
  for (const [a, b] of raw) {
    const last = slow[slow.length - 1];
    if (last !== undefined && a <= last[1]) last[1] = Math.max(last[1], b);
    else slow.push([a, b]);
  }
  const overlap = (a: number, b: number, x: number, y: number): number =>
    Math.max(0, Math.min(b, y) - Math.max(a, x));
  let slowS = 0;
  for (const [a, b] of slow) slowS += overlap(a, b, input.startedAt, until);
  let skippedS = 0;
  let skips = 0;
  /*
   * The ranges the skip may cross: the whole day since § D1266, landing on a peak's start, a stop or
   * the run's end; only the gaps between two peaks under § D1212 as it shipped.
   */
  const acts = [...input.acts].sort((a, b) => a.startS - b.startS);
  const ranges: [number, number][] = [];
  if (input.skip === 'between-peaks') {
    for (let i = 0; i + 1 < acts.length; i += 1) ranges.push([acts[i]!.endS, acts[i + 1]!.startS]);
  } else if (input.skip && acts.length > 0) {
    ranges.push([input.startedAt, input.endedAt]);
  }
  for (const [from, to] of ranges) {
    /* The range, less the slow set, cut at every stop and every peak's start: the stretches the stage enters fast. */
    const cuts = [from, to];
    for (const [a, b] of slow) if (b > from && a < to) cuts.push(Math.max(a, from), Math.min(b, to));
    for (const stop of input.stopsAtS) if (stop > from && stop < to) cuts.push(stop);
    for (const act of acts) if (act.startS > from && act.startS < to) cuts.push(act.startS);
    const edges = [...new Set(cuts)].sort((a, b) => a - b);
    for (let j = 0; j + 1 < edges.length; j += 1) {
      const x = edges[j]!;
      const y = edges[j + 1]!;
      const mid = (x + y) / 2;
      if (slow.some(([a, b]) => mid >= a && mid < b)) continue;
      if (y - x < 2 * beatSimS) continue;
      if (x + beatSimS < until) skips += 1;
      skippedS += overlap(x + beatSimS, y, input.startedAt, until);
    }
  }
  const spanS = until - input.startedAt;
  return Object.freeze({
    realS: slowS / input.watchingSimPerRealS + (spanS - slowS - skippedS) / fast,
    slowS,
    skippedS,
    skips,
  });
}
