/**
 * The replay harness: a whole run's worth of frames, produced headlessly and deterministically.
 *
 * Phase 4's acceptance criterion is "a stored run replays visually identically". This is what
 * makes that mechanically checkable rather than a thing somebody squints at: a display frame
 * rate and a speed multiplier fix a sequence of simulated instants, {@link frameAt} turns each
 * into a plain data {@link Frame}, and two sequences either serialise to the same string or
 * they do not.
 *
 * ## Why the times come from an index, not an accumulator
 *
 * `simTimeS = startAtS + k * speed / fps` — computed from the frame index every time, never by
 * adding a step to the previous value. Accumulating would make the sequence depend on floating
 * point association: `600 × (10/60)` is not `sum of 600 copies of 10/60` in binary, so an
 * accumulated sequence would drift away from an indexed one and two implementations of "the
 * same replay" would disagree in the sixth decimal. This is the same discipline
 * `playback/mapping.ts` applies to the live playhead, for the same reason.
 *
 * The last frame is pinned to `endedAt` whether or not the grid lands on it, so a comparison
 * always includes the end of the run.
 */

import type { SimTime } from '@elevator-sim/core';

import type { Frame, VizRecording } from '../contract/types.js';
import { frameAt } from './frameAt.js';

export interface SequenceOptions {
  /** Display frames per second. Default 30. */
  readonly fps?: number;
  /** Simulated seconds per real second. Default 10. */
  readonly speed?: number;
  /** First instant. Default `recording.startedAt`. */
  readonly startAtS?: SimTime;
  /** Last instant. Default `recording.endedAt`. */
  readonly endAtS?: SimTime;
  /** Hard ceiling on frames produced, so a long run cannot exhaust memory. Default 20000. */
  readonly maxFrames?: number;
}

/**
 * The simulated instants a playback at `fps` and `speed` would land on.
 *
 * Exported separately from {@link frameSequence} because it is the thing worth asserting about
 * on its own: a test that shows the *times* are frame-rate-independent has shown the harness
 * cannot manufacture a match by sampling differently on the two sides of a comparison.
 */
export function frameTimes(recording: VizRecording, options: SequenceOptions = {}): readonly SimTime[] {
  const fps = options.fps ?? 30;
  const speed = options.speed ?? 10;
  const maxFrames = options.maxFrames ?? 20_000;
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError(`fps must be positive; got ${fps}.`);
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new RangeError(`speed must be positive; got ${speed}.`);
  }

  const start = options.startAtS ?? recording.startedAt;
  const end = options.endAtS ?? recording.endedAt;
  if (end < start) throw new RangeError(`endAtS (${end}) precedes startAtS (${start}).`);

  const stepS = speed / fps;
  const count = Math.min(maxFrames - 1, Math.max(0, Math.ceil((end - start) / stepS)));
  const times: SimTime[] = [];
  for (let k = 0; k < count; k += 1) times.push(start + k * stepS);
  times.push(end);
  return times;
}

/** Every frame a playback at `fps` and `speed` would draw, in order. */
export function frameSequence(
  recording: VizRecording,
  options: SequenceOptions = {},
): readonly Frame[] {
  return frameTimes(recording, options).map((t) => frameAt(recording, t));
}

/**
 * A stable, comparable serialisation of a frame sequence.
 *
 * `JSON.stringify` of a plain data value is deterministic in V8 for a fixed key insertion
 * order, and every {@link Frame} is built by the same object literals in `frameAt`, so the key
 * order is fixed by construction rather than by luck. Two runs that agree here agree pixel for
 * pixel, because the renderer is a pure function of the frame.
 */
export function serializeFrames(frames: readonly Frame[]): string {
  return JSON.stringify(frames);
}
