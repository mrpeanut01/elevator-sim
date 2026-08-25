/**
 * **How long a car has been standing still** — the one fact the stage could not draw.
 *
 * `docs/34-problem-per-mode.md` § 3.2 records the gap and § 9 is the whole section about it:
 * *"`grep` for `park`/`idle` across `render/` and both stage screens returns nothing. An idle car is
 * a stationary car with `direction === 0` and near-zero load — pixel-identical to any empty car that
 * happens to be stopped. `PARK_CARS_LOBBY_LABEL` exists as a button with no visual consequence of
 * its own."* Campaign stage 1 teaches parking, and the thing it teaches about had no mark.
 *
 * ## Why this is derived here rather than published by `core`
 *
 * § 9.4's `PM-PARK` prices the fix as a new `FrameCar` field and flags one thing **unverified**:
 * *"whether `Simulation` can publish idle into the frame without ambiguity — a car stopped with its
 * doors open at a landing is not idle, and a car repositioning is neither idle nor in service."*
 * That is a question about **intent**, and it is the reason this module does not answer it. What is
 * drawn here is not *parked*; it is **standing still**, which is an observable and needs no field:
 *
 * | word | what it claims | who can check it |
 * |---|---|---|
 * | *parked* | the dispatcher **decided** to leave the car here | `idle.parkingStrategy`, in `core` |
 * | *standing still* | the car has not moved and its doors are shut | anybody looking at the screen |
 *
 * A renderer that drew the first would be asserting a mechanism it cannot measure, which is the
 * failure `CLAUDE.md` files under *a stated mechanism goes stale*. So the mark says the second, and
 * the second is the whole of what a player needs: **a lift that has stood in one place for two
 * minutes is a lift that chose where to wait, whatever the dispatcher calls it.**
 *
 * ## The clock is the same one the people are on, and that is the point
 *
 * {@link CAR_REST_ONSET_S} and {@link CAR_REST_FULL_S} are read out of `live/bands.ts#WAIT_BANDS`
 * rather than authored: a car crosses into *standing still* at the instant the first person standing
 * at a landing crosses out of *breezy*, and its mark reaches full length at the instant that person
 * would be *eyeing the stairs*. That is one banding painted on both halves of the tableau
 * `docs/34` § 9.4 asks for — *"cars stopped low, people standing high, both at once, both
 * persistent"* — and it is why no second ramp is authored here (`docs/28` AD-S15).
 *
 * ## R6, and why this needs no gate
 *
 * `docs/10` R6 forbids a live surface from folding the whole run. `t − restingSince` is the same
 * **shape** as `t − arrivedAt`, the wait age every rider capsule on both stages is already tinted
 * by: a state at the playhead, computed from the past only, exact at every `t`, and identical when
 * the player scrubs back to it. *This car has stood here for four minutes* is a now-fact.
 * *This car was idle for 40 % of the day* is not, and nothing here can produce it.
 *
 * **Nothing here reads a motion the playhead has not reached.** {@link carRestAt} takes the last
 * motion *commanded* at or before `t` and never looks at the next one — which is `docs/28` § 4.4's
 * refused *foreshadowing* stated as a property of this file rather than as an intention. Knowing
 * when a rest will **end** would make the mark a prediction; knowing when it **began** makes it a
 * measurement.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { Frame, FrameCar, VizRecording, VizShaft } from '../contract/types.js';
import { WAIT_BANDS } from '../live/bands.js';

/**
 * A band boundary, by id rather than by index.
 *
 * Positional reads are how `stageScreen.browser.test.ts`'s `TOP_SPEED_INDEX` went stale without
 * failing: index 4 stayed a real rung and stopped being the top one. An id cannot drift under a
 * table that gains a member.
 */
function bandStartS(id: string): number {
  const band = WAIT_BANDS.find((candidate) => candidate.id === id);
  if (band === undefined) throw new Error(`live/bands.ts no longer defines the ${id} band`);
  return band.fromS;
}

/**
 * When a still car starts carrying a mark — 30 s, `breezy`'s own ceiling.
 *
 * Below it a car is standing for an ordinary reason: it has just levelled, or its doors have just
 * shut and the next command has not arrived. `data/elevator-specs.json`'s slowest shipped hall-call
 * stop is `2.5 + 7 + 4.0 = 13.5 s` of door cycle, and the doors are open for all of it — so the
 * predicate below has already excluded the whole of it before this threshold is consulted.
 */
export const CAR_REST_ONSET_S = bandStartS('tapping-foot');

/**
 * When the mark reaches its full length — 120 s, the rung at which a person standing at a landing
 * would be *eyeing the stairs*. A car still at rest past it draws the same full bar; the mark
 * saturates rather than growing without bound, because a length nobody can compare is not a channel.
 */
export const CAR_REST_FULL_S = bandStartS('taking-the-stairs');

/** One car that is not doing anything, at one instant. */
export interface CarRest {
  readonly carId: string;
  /** The simulated instant it last moved or last shut its doors, whichever is later. */
  readonly sinceS: SimTime;
  /** `t − sinceS`. At least {@link CAR_REST_ONSET_S}, or this value would not exist. */
  readonly restedS: number;
  /**
   * `0` at the onset, `1` at {@link CAR_REST_FULL_S} and after it — the mark's **magnitude**
   * channel, so a reader can tell half a minute from ten without a legend and without a number.
   */
  readonly fill: number;
}

/** The last entry at or before `t`, by a key the caller names. Linear; these lists are short. */
function lastAtOrBefore<T>(items: readonly T[], t: SimTime, keyOf: (item: T) => number): T | undefined {
  let found: T | undefined;
  for (const item of items) {
    if (keyOf(item) > t) break;
    found = item;
  }
  return found;
}

/**
 * How long this car has stood still at `t`, or `undefined` if it has not stood still long enough.
 *
 * Three grounds for *not resting*, and each is a state a player can see:
 *
 * 1. **A move is in flight.** The last motion commanded at or before `t` has not arrived yet, so
 *    the car is either in its motor-start delay or on its S-curve.
 * 2. **The doors are not shut.** A car with its doors doing anything is transferring people, which
 *    is the opposite of the fact this mark carries. `doorPhase` rather than `doorFraction` because
 *    `opening` and `closing` are machine states rather than a rounding of a fraction, and a door a
 *    hair off shut is still working.
 * 3. **It has not been long enough** — {@link CAR_REST_ONSET_S}.
 *
 * The rest began at the **later** of the car's last arrival and its last door shutting, so a car
 * that stood five minutes, let somebody out, and settled again starts its clock at the settling
 * rather than at the arrival. Taking the arrival alone would overstate every rest that contained a
 * boarding, which is the flattering direction and therefore the wrong one.
 */
export function carRestAt(
  shaft: VizShaft,
  car: FrameCar,
  t: SimTime,
  openedAtS: SimTime,
): CarRest | undefined {
  if (car.doorPhase !== 'closed') return undefined;

  const motion = lastAtOrBefore(shaft.motions, t, (entry) => entry.commandedAt);
  if (motion !== undefined && motion.arrivesAt > t) return undefined;

  const mark = lastAtOrBefore(shaft.doorMarks, t, (entry) => entry.at);

  /*
   * `openedAtS` is the floor rather than a fallback branch. A car that has neither moved nor worked
   * its doors has stood where it started since the building opened, and that is the shipped
   * tutorial building's ordinary state — three lifts in the lobby, none of them moving, and until
   * this module no reason on screen to think that was a decision. Taking `0` or `t` instead would
   * be a different claim about the same picture, so the run's own start is passed in rather than
   * guessed at.
   */
  const since = Math.max(openedAtS, motion?.arrivesAt ?? openedAtS, mark?.at ?? openedAtS);

  const restedS = t - since;
  if (restedS < CAR_REST_ONSET_S) return undefined;

  const span = CAR_REST_FULL_S - CAR_REST_ONSET_S;
  const fill = span <= 0 ? 1 : Math.min(1, Math.max(0, (restedS - CAR_REST_ONSET_S) / span));
  return { carId: car.carId, sinceS: since, restedS, fill };
}

/**
 * Every car standing still at the frame's instant, in the frame's own car order.
 *
 * A car with no shaft in the recording is skipped rather than guessed at, which is the same thing
 * both renderers already do when they cannot find a car's column.
 *
 * The run's own `startedAt` is handed to every call as the floor {@link carRestAt} measures from,
 * so a car that has not moved since the building opened is measured rather than skipped.
 *
 * Keyed by `carId` from the **recording** rather than by the frame's index: `drawScene` and
 * `drawCutaway` both already look a car's shaft up that way, and a frame whose cars were ordered
 * differently from the record's shafts would otherwise hand every car its neighbour's history.
 */
export function carRestsAt(recording: VizRecording, frame: Frame): readonly CarRest[] {
  const byCar = new Map(recording.shafts.map((shaft) => [shaft.carId, shaft]));
  const rests: CarRest[] = [];
  for (const car of frame.cars) {
    const shaft = byCar.get(car.carId);
    if (shaft === undefined) continue;
    const rest = carRestAt(shaft, car, frame.simTimeS, recording.startedAt);
    if (rest !== undefined) rests.push(rest);
  }
  return rests;
}

/**
 * The mark's length, in pixels, inside a slot of a given width — `docs/28` AD-S17.
 *
 * Two floors and one cap, and each is a legibility claim rather than taste:
 *
 * - **{@link REST_BAR_MIN_SHARE} of the slot** at the onset, so the mark is a *bar* at the instant
 *   it appears rather than a dot that grows into one. A reader who cannot see the shortest state
 *   cannot read the channel.
 * - **{@link REST_BAR_MIN_PX}** absolutely, because `vertical-city` puts 35 cars across a viewport
 *   and `stageCarPaintOf` measures a car at roughly 2.4 px there. A share of 2.4 px is not a mark.
 * - **The slot's own width**, never more, so the bar cannot overhang into the neighbouring shaft.
 *   The `▲`/`▼` it replaces does overhang, and copying that would put two banks' marks on one
 *   column on the building where the columns are narrowest.
 */
export function restBarWidthPx(fill: number, slotWidthPx: number): number {
  const share = REST_BAR_MIN_SHARE + (1 - REST_BAR_MIN_SHARE) * Math.min(1, Math.max(0, fill));
  return Math.min(slotWidthPx, Math.max(REST_BAR_MIN_PX, slotWidthPx * share));
}

/** The share of the slot the bar occupies at the onset. */
export const REST_BAR_MIN_SHARE = 0.34;
/** The narrowest bar that is still a bar, in device-independent pixels. */
export const REST_BAR_MIN_PX = 3;
/** How thick the bar is drawn. One rule for both renderers, so the mark is one mark. */
export const REST_BAR_THICKNESS_PX = 2.5;

/**
 * *standing still for 4 min 10 s*, for the frame's text alternative — `UX.md` KB-13.
 *
 * The sighted half of this signal is a rectangle, and a rectangle is nothing to a screen reader.
 * `docs/28` AD-A1 forbids a state that must be distinguished from carrying one channel, and for a
 * non-sighted reader the drawn channel is not one of them, so the duration is spelled.
 *
 * Minutes and seconds rather than bare seconds: the figures this reaches are 30 s at one end and a
 * whole quiet hour at the other, and *"standing still for 2 940 seconds"* is a number a listener has
 * to convert. The unit is named either way — `docs/28` AD-A5.
 */
export function restWords(restedS: number): string {
  const whole = Math.floor(restedS);
  if (whole < 60) return `standing still for ${String(whole)} s`;
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return seconds === 0
    ? `standing still for ${String(minutes)} min`
    : `standing still for ${String(minutes)} min ${String(seconds)} s`;
}
