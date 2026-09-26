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
 * skip, as the stage plays it with no chip pressed: the watching rung while somebody on a landing
 * has waited a minute, the fast rung otherwise, and between two peaks every quiet stretch of at least
 * two beats played for one beat and then skipped to its end. `stopsAtS` are the instants the stage
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
  readonly skip: boolean;
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
  if (input.skip) {
    const acts = [...input.acts].sort((a, b) => a.startS - b.startS);
    for (let i = 0; i + 1 < acts.length; i += 1) {
      const gapFrom = acts[i]!.endS;
      const gapTo = acts[i + 1]!.startS;
      /* The gap, less the slow set, cut at every stop: the stretches the stage enters fast. */
      const cuts = [gapFrom, gapTo];
      for (const [a, b] of slow) {
        if (b > gapFrom && a < gapTo) cuts.push(Math.max(a, gapFrom), Math.min(b, gapTo));
      }
      for (const stop of input.stopsAtS) if (stop > gapFrom && stop < gapTo) cuts.push(stop);
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
  }
  const spanS = until - input.startedAt;
  return Object.freeze({
    realS: slowS / input.watchingSimPerRealS + (spanS - slowS - skippedS) / fast,
    slowS,
    skippedS,
    skips,
  });
}
