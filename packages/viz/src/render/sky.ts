/**
 * The time of day, as light — `docs/12-design-handoff.md` § 1.3 M3, design `:1998–2005`.
 *
 * ## What this is for
 *
 * The stage's ground is a vertical ramp whose two stops are chosen by the hour. It is scenery,
 * and it is the only thing on the canvas that tells a reader *when* the building is being watched
 * without them reading a clock. Four bands: before 07:30, before 16:30, before 19:30, and night.
 *
 * ## The hour comes from the frame, and there is no other source
 *
 * `CLAUDE.md` invariant 3 keeps the wall clock out of `core/`, and `boundaries.test.ts` rule 2
 * keeps it out of everything here except `DisplayClock`. So the hour is
 * `dayStartS + frame.simTimeS`, both of which are simulated seconds. Scrubbing back to the same
 * `t` therefore repaints the same sky, which is the property `replay/replay.test.ts` turns into
 * *"a stored run replays visually identically"*.
 *
 * {@link DAY_START_S} is a **placeholder that must be re-sourced**: `packages/viz/src/live/timeline.ts`
 * is being written in a parallel lane and will export the day-start offset and the `hh:mm`
 * formatter for the whole viewer. `render/` may not import from `src/live/` yet, so the offset is
 * an *option* on {@link SkyInput} with this default, and the default is the one line that should
 * be deleted when `live/timeline.ts` lands. It is deliberately not a `Theme` field: it is a fact
 * about the shift, not a colour.
 *
 * ## Why a stack of bands and not a `CanvasGradient`
 *
 * `Canvas2DLike` is the structural subset of the 2D context this package draws against, and its
 * whole value is that a three-line stub can record *what was drawn* (`render/canvas.ts`'s
 * docstring). A `CanvasGradient` is an opaque handle: a recording stub sees one `fillRect` whose
 * fill stringifies to `[object Object]`, so the sky would be invisible to
 * `canvas.test.ts`'s *"equal frames draw equal call sequences"* — the transcript would be
 * identical at midnight and at noon. Widening `fillStyle` to a union to admit the handle buys a
 * smoother ramp and pays for it in the one property this directory is built around.
 *
 * So the ramp is painted as {@link SKY_BAND_COUNT} interpolated strips, each an ordinary
 * `fillRect` with an ordinary string fill. At the sizes the stage is drawn (a 300–900 px column
 * over a ~10 % lightness range) the banding is not visible; the strips *are* visible to a test,
 * which is the trade taken.
 */

import { DAY_START_S } from '../live/timeline.js';

import type { Canvas2DLike } from './canvas.js';
import { SKY_DAWN, SKY_DAY, SKY_DUSK, SKY_NIGHT } from './tokens.js';

/**
 * Simulated seconds from midnight to `simTimeS === 0` — `docs/12` § 4.1's *"the clock is
 * `06:00 + simTimeS`"*.
 *
 * Re-exported from `live/timeline.ts` rather than declared here. It was declared here for one
 * wave, while the two lanes were built in parallel, with a comment promising to reconcile — and a
 * constant duplicated with a promise is still a constant duplicated. `render/` importing `live/`
 * is a fresh edge and a legal one: `live/` depends on `contract/` and nothing else, so there is no
 * cycle, and `boundaries.test.ts` constrains the DOM and `core` imports rather than the shape of
 * the graph inside `viz`.
 */
export { DAY_START_S };

/** The four bands of the day, in the order the day passes through them. */
export type SkyBand = 'dawn' | 'day' | 'dusk' | 'night';

/** A two-stop vertical ramp: the colour at the top of the stage and the colour at the bottom. */
export type SkyRamp = readonly [top: string, bottom: string];

/** The shipped ramps. Overridable through {@link Theme.sky} so a light theme is expressible. */
export const DEFAULT_SKY: Readonly<Record<SkyBand, SkyRamp>> = Object.freeze({
  dawn: SKY_DAWN,
  day: SKY_DAY,
  dusk: SKY_DUSK,
  night: SKY_NIGHT,
});

/**
 * The hour of day, `[0, 24)`, for a frame.
 *
 * Wraps, because a shift long enough to cross midnight is representable — `constant-iso` is two
 * hours and nothing stops a caller running twenty. A sky that ran off the end of the fourth band
 * would simply stop changing, which is a caption that stops describing the picture.
 */
export function hourOfDay(simTimeS: number, dayStartS: number = DAY_START_S): number {
  const hours = (dayStartS + simTimeS) / 3600;
  const wrapped = hours % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

/**
 * Which band an hour falls in — design `:2000–2005`, boundary for boundary.
 *
 * The artefact's `night` predicate (`hour < 7 || hour > 19.5`) and its ramp selection
 * (`hour < 7.5 ? dawn : …`) disagree between 07:00 and 07:30: an hour there is *not* night and
 * still gets the dawn ramp. That is not a contradiction — the ramp is the sky and `night` is
 * whether the windows burn warm — so the two are kept as two functions rather than collapsed
 * into one and quietly rounded. See {@link isNight}.
 */
export function skyBandAt(hour: number): SkyBand {
  if (hour < 7.5) return 'dawn';
  if (hour < 16.5) return 'day';
  if (hour < 19.5) return 'dusk';
  return 'night';
}

/**
 * Whether the windows burn warm — design `:2000`, and *not* the same test as {@link skyBandAt}.
 *
 * A building at 07:15 is under a dawn sky with its lights already off, which is what the
 * artefact draws and what a building actually does.
 */
export function isNight(hour: number): boolean {
  return hour < 7 || hour > 19.5;
}

/** The ramp for an hour, from a palette. Total: every hour has a band and every band a ramp. */
export function skyRampAt(hour: number, palette: Readonly<Record<SkyBand, SkyRamp>> = DEFAULT_SKY): SkyRamp {
  return palette[skyBandAt(hour)];
}

/**
 * Strips in the painted ramp.
 *
 * Twenty-four is the smallest count at which the step between two adjacent strips is below one
 * unit of 8-bit lightness over the ramps this file ships — the widest is `#0c1018 → #141a26`,
 * eight units of blue over the whole height, so a 24-strip ramp steps a third of a unit and
 * rounds to the same byte for most pairs. It is also small enough that the strips are legible in
 * a recorded transcript rather than drowning it.
 */
export const SKY_BAND_COUNT = 24;

export interface SkyInput {
  /** The plot's containing surface. The sky fills all of it. */
  readonly width: number;
  readonly height: number;
  /** Simulated seconds since the run began. */
  readonly simTimeS: number;
  /** Seconds from midnight to `simTimeS === 0`. Defaults to {@link DAY_START_S}. */
  readonly dayStartS?: number | undefined;
  readonly palette?: Readonly<Record<SkyBand, SkyRamp>> | undefined;
}

/** Paint the ramp. Returns the hour it painted, so a caller can light the windows to match. */
export function drawSky(ctx: Canvas2DLike, input: SkyInput): number {
  const hour = hourOfDay(input.simTimeS, input.dayStartS ?? DAY_START_S);
  const [top, bottom] = skyRampAt(hour, input.palette ?? DEFAULT_SKY);
  const stripHeight = input.height / SKY_BAND_COUNT;
  for (let index = 0; index < SKY_BAND_COUNT; index += 1) {
    // The strip's *centre* rather than its top edge, so the painted ramp has the same mean
    // lightness as the continuous one it stands in for rather than being half a strip too pale.
    ctx.fillStyle = mixHex(top, bottom, (index + 0.5) / SKY_BAND_COUNT);
    // A hair of overlap. Fractional strip heights leave a seam of background between two
    // `fillRect`s on a real context, and a one-pixel light line across the stage every 25 px is
    // considerably more visible than the banding this function is trading against.
    ctx.fillRect(0, index * stripHeight, input.width, stripHeight + 1);
  }
  return hour;
}

/**
 * Linear interpolation between two `#rrggbb` strings, in sRGB.
 *
 * sRGB and not a perceptual space: the ramps are eight units of blue apart, the difference
 * between a linear and a perceptual blend over that range is below one byte, and a colour-space
 * conversion here would be arithmetic nobody can check by looking at the output.
 *
 * Total on malformed input — an unparsable stop returns the stop itself, so a themed palette with
 * a `rgba()` string in it draws a flat wash rather than `#NaNNaNNaN`.
 */
export function mixHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === undefined || b === undefined) return t < 0.5 ? from : to;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const channel = (index: number): string => {
    const value = Math.round((a[index] ?? 0) + ((b[index] ?? 0) - (a[index] ?? 0)) * clamped);
    return (value < 16 ? '0' : '') + value.toString(16);
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function parseHex(value: string): readonly [number, number, number] | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (match === null) return undefined;
  const digits = match[1] ?? '';
  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ];
}
