/**
 * The mapping between display time and simulated time.
 *
 * One affine function, anchored:
 *
 * ```
 * simTimeS = anchor.atSimTimeS + (displayMs - anchor.atDisplayMs) / 1000 * speed
 * ```
 *
 * It is stated as an *anchor* rather than as an accumulating `+= dt` for a reason that decides
 * whether the replay criterion can hold at all. An accumulator makes the playhead a function of
 * the frame rate: 600 frames of 16.667 ms do not sum to 10 s in binary floating point, so the
 * same recording watched on a 60 Hz screen and a 144 Hz screen would reach different simulated
 * instants and produce different frames. Anchoring makes the playhead a function of elapsed
 * display time alone, so it is frame-rate independent and exactly reproducible.
 *
 * Re-anchoring is therefore the *only* operation that changes the relationship: pausing,
 * resuming, seeking and changing speed all re-anchor. Nothing accumulates.
 */

import type { SimTime } from '@elevator-sim/core/browser';

/** Where the two clocks were pinned together, and how fast simulated time runs. */
export interface PlaybackAnchor {
  /** Display time, milliseconds, at the moment of pinning. */
  readonly atDisplayMs: number;
  /** Simulated time, seconds, at the same moment. */
  readonly atSimTimeS: SimTime;
  /** Simulated seconds per real second. Must be finite and positive. */
  readonly speed: number;
}

export const MIN_SPEED = 0.05;
export const MAX_SPEED = 1000;

/** @throws RangeError when `speed` is outside `[MIN_SPEED, MAX_SPEED]` or is not finite. */
export function assertSpeed(speed: number): void {
  if (!Number.isFinite(speed) || speed < MIN_SPEED || speed > MAX_SPEED) {
    throw new RangeError(
      `playback speed must be a finite number in [${MIN_SPEED}, ${MAX_SPEED}]; got ${speed}.`,
    );
  }
}

/** Simulated time at `displayMs`, unclamped. */
export function simTimeAt(anchor: PlaybackAnchor, displayMs: number): SimTime {
  return anchor.atSimTimeS + ((displayMs - anchor.atDisplayMs) / 1000) * anchor.speed;
}

/** Pin the two clocks together again at `(displayMs, simTimeS)`, keeping `speed`. */
export function reanchor(
  anchor: PlaybackAnchor,
  displayMs: number,
  simTimeS: SimTime,
): PlaybackAnchor {
  return { atDisplayMs: displayMs, atSimTimeS: simTimeS, speed: anchor.speed };
}
