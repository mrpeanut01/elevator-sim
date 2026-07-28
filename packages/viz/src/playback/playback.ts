/**
 * The transport: play, pause, seek, speed — over an injected {@link DisplayClock}.
 *
 * It owns exactly one piece of mutable state, the {@link PlaybackAnchor}, and every command
 * re-anchors rather than accumulating (see `mapping.ts` for why that is not a style choice).
 * It draws nothing, schedules nothing, and starts no timer: a caller asks for
 * {@link Playback.frame} whenever it is ready to draw one, which is `requestAnimationFrame` in
 * a browser and a bare loop in a test.
 *
 * That inversion is what makes the playback path testable without a browser. The three states
 * — `paused`, `playing`, `ended` — and the transitions between them are asserted in
 * `playback.test.ts` against a {@link ManualClock}, with no timers anywhere.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import { frameAt } from '../frame/frameAt.js';
import type { Frame, VizRecording } from '../contract/types.js';
import type { DisplayClock } from './clock.js';
import {
  assertSpeed,
  reanchor,
  simTimeAt,
  type PlaybackAnchor,
} from './mapping.js';

export type PlaybackState = 'paused' | 'playing' | 'ended';

export interface PlaybackOptions {
  /** Simulated seconds per real second. Default 10, matching the CLI's `watch --speed`. */
  readonly speed?: number;
  /** Where the playhead starts. Default `recording.startedAt`. */
  readonly startAtS?: SimTime;
  /** Start playing immediately. Default `false` — a viewer decides when it is ready to draw. */
  readonly autoplay?: boolean;
  /** Restart from the beginning on reaching the end instead of stopping. Default `false`. */
  readonly loop?: boolean;
}

const DEFAULT_SPEED = 10;

export class Playback {
  readonly recording: VizRecording;
  readonly #clock: DisplayClock;
  readonly #loop: boolean;
  #anchor: PlaybackAnchor;
  #playing: boolean;
  /** Where the playhead sits while paused. Meaningless while playing — the anchor decides. */
  #pausedAtS: SimTime;

  constructor(recording: VizRecording, clock: DisplayClock, options: PlaybackOptions = {}) {
    const speed = options.speed ?? DEFAULT_SPEED;
    assertSpeed(speed);
    this.recording = recording;
    this.#clock = clock;
    this.#loop = options.loop ?? false;
    const start = this.#clampSim(options.startAtS ?? recording.startedAt);
    this.#pausedAtS = start;
    this.#anchor = { atDisplayMs: clock.now(), atSimTimeS: start, speed };
    this.#playing = options.autoplay ?? false;
  }

  get speed(): number {
    return this.#anchor.speed;
  }

  /**
   * `ended` is a *derived* state, not a flag: it is what "playing, and the playhead has reached
   * the end" is called. So a viewer that seeks backwards from the end is playing again without
   * anything having to reset.
   */
  get state(): PlaybackState {
    if (!this.#playing) return 'paused';
    return this.#rawSimTime() >= this.recording.endedAt ? 'ended' : 'playing';
  }

  /** Simulated seconds, clamped into the recording. */
  get simTimeS(): SimTime {
    if (!this.#playing) return this.#pausedAtS;
    return this.#clampSim(this.#rawSimTime());
  }

  /** Fraction of the run elapsed, 0 to 1. `0` for a zero-length recording. */
  get progress(): number {
    const span = this.recording.endedAt - this.recording.startedAt;
    if (span <= 0) return 0;
    return (this.simTimeS - this.recording.startedAt) / span;
  }

  /**
   * The frame to draw now.
   *
   * Reads the clock exactly once, so every number in the returned frame describes the same
   * instant. A caller that read `simTimeS` and then called `frameAt` itself could straddle a
   * clock tick and draw a car at one instant and its doors at another.
   */
  frame(): Frame {
    return frameAt(this.recording, this.#advance());
  }

  play(): void {
    if (this.#playing) return;
    this.#anchor = reanchor(this.#anchor, this.#clock.now(), this.#pausedAtS);
    this.#playing = true;
  }

  pause(): void {
    if (!this.#playing) return;
    this.#pausedAtS = this.simTimeS;
    this.#playing = false;
  }

  toggle(): void {
    if (this.#playing) this.pause();
    else this.play();
  }

  /** Jump the playhead. Legal in either state, and does not start or stop playback. */
  seekTo(simTimeS: SimTime): void {
    const target = this.#clampSim(simTimeS);
    this.#pausedAtS = target;
    this.#anchor = reanchor(this.#anchor, this.#clock.now(), target);
  }

  /** Jump by `deltaS` simulated seconds. Negative goes back. */
  seekBy(deltaS: number): void {
    this.seekTo(this.simTimeS + deltaS);
  }

  /** Jump to a fraction of the run, 0 to 1 — what a scrub bar hands over. */
  seekToProgress(fraction: number): void {
    const span = this.recording.endedAt - this.recording.startedAt;
    this.seekTo(this.recording.startedAt + span * clamp(fraction, 0, 1));
  }

  /**
   * Change speed without moving the playhead.
   *
   * Re-anchors at the current instant first, so the picture does not jump: a viewer switching
   * from ×1 to ×60 continues from where it was rather than from where ×60 would have put it.
   *
   * @throws RangeError outside `[MIN_SPEED, MAX_SPEED]`.
   */
  setSpeed(speed: number): void {
    assertSpeed(speed);
    const at = this.simTimeS;
    this.#pausedAtS = at;
    this.#anchor = { atDisplayMs: this.#clock.now(), atSimTimeS: at, speed };
  }

  /** Back to the start, paused. */
  reset(): void {
    this.#playing = false;
    this.seekTo(this.recording.startedAt);
  }

  /**
   * Settle the playhead against the clock, applying the end-of-run rule, and return it.
   *
   * Looping re-anchors at the start rather than subtracting the run length, so a long-running
   * loop cannot drift: every cycle is measured from its own anchor.
   */
  #advance(): SimTime {
    if (!this.#playing) return this.#pausedAtS;
    const raw = this.#rawSimTime();
    if (raw < this.recording.endedAt) return raw < this.recording.startedAt ? this.recording.startedAt : raw;
    if (!this.#loop) {
      this.#pausedAtS = this.recording.endedAt;
      return this.recording.endedAt;
    }
    this.#anchor = reanchor(this.#anchor, this.#clock.now(), this.recording.startedAt);
    return this.recording.startedAt;
  }

  #rawSimTime(): SimTime {
    return simTimeAt(this.#anchor, this.#clock.now());
  }

  #clampSim(value: SimTime): SimTime {
    return clamp(value, this.recording.startedAt, this.recording.endedAt);
  }
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
