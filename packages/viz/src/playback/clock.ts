/**
 * Display time, and the one place the package is allowed to know about it.
 *
 * CLAUDE.md invariant 3 forbids wall-clock time in `core/`. It does not forbid it in a
 * renderer — a renderer has nothing else to animate against — so the rule this package keeps
 * instead is narrower and mechanically checkable: **wall-clock time enters through
 * {@link DisplayClock} and nowhere else**, and every module that produces a picture takes the
 * time as an argument. `src/purity.test.ts` greps for the alternatives.
 *
 * The payoff is that a test drives playback frame by frame with a {@link ManualClock}: no
 * timers, no `await sleep`, no flake, and the frame sequence a test sees is the frame sequence
 * a browser would draw. `src/replay/replay.test.ts` depends on that.
 *
 * ## Two clocks, two units
 *
 * | | Unit | Source |
 * |---|---|---|
 * | Simulated time | seconds | the kernel, via the recording |
 * | Display time | milliseconds | this file |
 *
 * They are never the same number and they are never added. {@link mapping.ts} is the only
 * conversion, and it is a pure function of an anchor.
 */

/** Milliseconds since some fixed origin. Monotonic; the origin is not meaningful. */
export interface DisplayClock {
  now(): number;
}

/**
 * A clock a test advances by hand.
 *
 * Deliberately not a wrapper around fake timers: there is no timer to fake, because nothing in
 * this package schedules one. Frames are requested, not delivered.
 */
export class ManualClock implements DisplayClock {
  #nowMs: number;

  constructor(startMs = 0) {
    this.#nowMs = startMs;
  }

  now(): number {
    return this.#nowMs;
  }

  advance(ms: number): number {
    if (ms < 0) throw new Error(`ManualClock cannot go backwards (advance(${ms})).`);
    this.#nowMs += ms;
    return this.#nowMs;
  }

  set(ms: number): void {
    if (ms < this.#nowMs) throw new Error(`ManualClock cannot go backwards (set(${ms})).`);
    this.#nowMs = ms;
  }
}

/**
 * The browser's clock: `performance.now()` when it exists, `Date.now()` otherwise.
 *
 * `performance.now()` is preferred because it is monotonic — `Date.now()` can step backwards
 * when the system clock is adjusted, and a playhead that jumps backwards mid-run would look
 * like a simulator bug rather than an NTP correction.
 */
export function systemClock(): DisplayClock {
  const performanceNow: (() => number) | undefined =
    typeof performance === 'object' && typeof performance.now === 'function'
      ? (): number => performance.now()
      : undefined;
  const read = performanceNow ?? ((): number => Date.now());
  return { now: read };
}
