/**
 * **The opening doors, as numbers** — the splash a cold launch plays over the lobby.
 *
 * The app opens on the lobby, which is the main menu ([§ D1628](../../../../DECISIONS.md)). The
 * owner asked on 2026-11-13 for a splash in front of it: the elevator doors opening as the reveal,
 * in no more than five seconds. `splash.ts` is the mount; this file is when each part of it moves,
 * on the pure/DOM split the rest of `everyday/` keeps, so the timeline is held in the node tier.
 *
 * ## It is laid over the menu, never in front of it
 *
 * [§ D1627](../../../../DECISIONS.md) rules that motion supports a selection and never gates one,
 * and the splash is held to that: the lobby is mounted and live underneath from the first frame, the
 * doors take no pointer events, and any press or key clears them at once. So the five seconds are a
 * ceiling on the picture, not a wait anybody has to sit through. With reduced motion there is no
 * splash at all.
 *
 * Pure. No DOM, no timers.
 */

/** The owner's ceiling on the whole splash, start to gone. */
export const SPLASH_CEILING_MS = 5000;

export interface SplashTimings {
  /** The arrival lantern lights over the closed doors. */
  readonly lanternAtMs: number;
  /** The doors start to part. */
  readonly doorsAtMs: number;
  /** How long the doors take to slide fully open. */
  readonly doorsMs: number;
  /** The frame and lintel start to fade, once the doors are nearly clear. */
  readonly fadeAtMs: number;
  /** How long the fade takes. */
  readonly fadeMs: number;
  /** The splash is taken off the page. Never above {@link SPLASH_CEILING_MS}. */
  readonly goneAtMs: number;
}

export const SPLASH_TIMINGS: SplashTimings = Object.freeze({
  lanternAtMs: 250,
  doorsAtMs: 700,
  doorsMs: 1300,
  fadeAtMs: 1800,
  fadeMs: 600,
  goneAtMs: 2500,
});

/** The timeline to play, or `undefined` when the player asked for reduced motion. */
export function splashTimingsFor(reducedMotion: boolean): SplashTimings | undefined {
  return reducedMotion ? undefined : SPLASH_TIMINGS;
}

/** What the floor indicator over the doors reads: the lobby, where the car arrives. */
export const SPLASH_FLOOR = 'L';

/** The indicator's two direction arrows. Neither is lit for travel: the car has arrived. */
export const SPLASH_ARROWS = Object.freeze({ up: '▲', down: '▼' });
