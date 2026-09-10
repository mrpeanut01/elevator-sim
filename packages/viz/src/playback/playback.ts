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

/**
 * The span the transport repeats — `UX.md` `PB-09`.
 *
 * A whole-run loop is the degenerate case, `{ fromS: startedAt, toS: endedAt }`, which is what
 * {@link Playback.wholeRun} hands back. There is one piece of loop state rather than a boolean
 * beside a window, so a transport cannot be looping over a span nobody selected or holding a span
 * it is not looping over.
 */
export interface LoopWindow {
  readonly fromS: SimTime;
  readonly toS: SimTime;
}

export interface PlaybackOptions {
  /** Simulated seconds per real second. Default 10, matching the CLI's `watch --speed`. */
  readonly speed?: number;
  /** Where the playhead starts. Default `recording.startedAt`. */
  readonly startAtS?: SimTime;
  /** Start playing immediately. Default `false` — a viewer decides when it is ready to draw. */
  readonly autoplay?: boolean;
  /**
   * Restart from the beginning on reaching the end instead of stopping. Default `false`.
   *
   * Sugar for {@link Playback.setLoop} with {@link Playback.wholeRun}, kept because every existing
   * caller says `loop: looping` at construction. It is not the way to *change* the loop — a
   * transport already on screen takes {@link Playback.setLoop} instead, and rebuilding it to
   * change this option throws the playhead away (`PB-09`).
   */
  readonly loop?: boolean;
}

const DEFAULT_SPEED = 10;

export class Playback {
  readonly recording: VizRecording;
  readonly #clock: DisplayClock;
  /** The span being repeated, or `null` when the run simply ends. See {@link setLoop}. */
  #loopWindow: LoopWindow | null;
  #anchor: PlaybackAnchor;
  #playing: boolean;
  /** Where the playhead sits while paused. Meaningless while playing — the anchor decides. */
  #pausedAtS: SimTime;

  constructor(recording: VizRecording, clock: DisplayClock, options: PlaybackOptions = {}) {
    const speed = options.speed ?? DEFAULT_SPEED;
    assertSpeed(speed);
    this.recording = recording;
    this.#clock = clock;
    this.#loopWindow = null;
    const start = this.#clampSim(options.startAtS ?? recording.startedAt);
    this.#pausedAtS = start;
    this.#anchor = { atDisplayMs: clock.now(), atSimTimeS: start, speed };
    this.#playing = options.autoplay ?? false;
    if (options.loop === true) this.setLoop(this.wholeRun);
  }

  get speed(): number {
    return this.#anchor.speed;
  }

  /** The whole recording as a window — what the `loop` chip selects. */
  get wholeRun(): LoopWindow {
    return { fromS: this.recording.startedAt, toS: this.recording.endedAt };
  }

  /** The span being repeated, clamped into the recording, or `null` if nothing is. */
  get loopWindow(): LoopWindow | null {
    return this.#loopWindow;
  }

  /**
   * Repeat `span`, or stop repeating when it is `null` — `UX.md` `PB-09`.
   *
   * ## Why this is a method and not only a constructor option
   *
   * It used to be neither: `loop` was read once in the constructor and stored in a `readonly`
   * field, so the only way a viewer could change its mind was to build a second `Playback` over
   * the same recording. `dev/main.ts`'s loop chip did exactly that, and the cost was not the
   * allocation — the replacement transport takes `startAtS`'s default, so **pressing `loop` at
   * 07:30 put the playhead back at 06:00**, cleared the landing selection and re-armed the
   * day-filing gate. `UX.md`'s `PB-09` row described that as *"the transport is rebuilt at the
   * current instant"*, which is the one thing it was not.
   *
   * ## What it does to the playhead: nothing
   *
   * Selecting a span is a statement about where the transport will *wrap*, not about where it is
   * now, so this never seeks — the same promise {@link setSpeed} makes. A playhead sitting before
   * `fromS` therefore plays the lead-in **once** and joins the loop at `toS`; a playhead already
   * past `toS` wraps on the next {@link frame}. The row's expectation is that *only the selected
   * span repeats*, and both of those satisfy it.
   *
   * A sub-window loop never reaches `recording.endedAt`, so {@link state} never reads `ended`
   * while one is set and a viewer that files its day off that state does not file one. That is
   * deliberate: a player inspecting thirty seconds of an up-peak has not watched the shift.
   *
   * The parameter is `span` rather than `window`, and that is `boundaries.test.ts` rather than
   * taste: a bare `window` binding in a non-`dev/` file is indistinguishable from the DOM global to
   * a rule that is about globals rather than about spelling, and this file is on the wrong side of
   * that boundary for the reader of the rule to have to think about it.
   *
   * @throws RangeError if the window has no positive length once clamped into the recording — a
   * span the playhead cannot cross is not a loop, it is a frozen picture, because `#advance`
   * would wrap on every frame.
   */
  setLoop(span: LoopWindow | null): void {
    if (span === null) {
      this.#loopWindow = null;
      return;
    }
    const fromS = this.#clampSim(span.fromS);
    const toS = this.#clampSim(span.toS);
    if (!(toS > fromS)) {
      throw new RangeError(
        `A loop window must have positive length; ${String(span.fromS)}–${String(span.toS)} ` +
          `clamps to ${String(fromS)}–${String(toS)} inside this recording.`,
      );
    }
    this.#loopWindow = { fromS, toS };
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
   * Looping re-anchors at the window's start rather than subtracting its length, so a long-running
   * loop cannot drift: every cycle is measured from its own anchor.
   *
   * The window's `toS` is where the wrap happens and `recording.endedAt` is where the run stops,
   * and they are the same number only for a whole-run loop. Reading the wrap off the window is the
   * whole of `PB-09`.
   */
  #advance(): SimTime {
    if (!this.#playing) return this.#pausedAtS;
    const raw = this.#rawSimTime();
    const span = this.#loopWindow;
    const wrapAt = span?.toS ?? this.recording.endedAt;
    if (raw < wrapAt) return raw < this.recording.startedAt ? this.recording.startedAt : raw;
    if (span === null) {
      this.#pausedAtS = this.recording.endedAt;
      return this.recording.endedAt;
    }
    this.#anchor = reanchor(this.#anchor, this.#clock.now(), span.fromS);
    return span.fromS;
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
