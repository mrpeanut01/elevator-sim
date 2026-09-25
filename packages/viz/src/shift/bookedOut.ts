/**
 * **The cars a tower books out of passenger service part-way through the day** — one reading,
 * three surfaces. GitHub issue **#596** item 3, [§ D983](../../../../DECISIONS.md).
 *
 * ## The defect
 *
 * All four assessors of the post-wave-AG panel met it: on a day whose tower books car D out at
 * half past eight, the brief's wrinkle card and the Day report's header both read *An ordinary day
 * — Nothing booked. The building is the only thing in the way.*, beside the brief's own plate
 * saying car D is booked out. Both halves were true of what they read — the *calendar* booked
 * nothing, and the tower's own schedule (`shift/ladder.ts#ContractFabric.incidents`, § D871) booked
 * a car — and the product said two contradicting things about one day on one screen.
 *
 * The strip on the brief already read the tower's schedule (`everyday/today.ts`, § D871); the
 * wrinkle card and the report header did not, and the report had no way to, because a
 * `VizRecording` carries whole-run holds (`outOfServiceCarIds`) and not a mid-run schedule. So the
 * reading moved here, where the brief, the report and the stage all reach it, and each of them
 * reads `building.serviceEvents` off the **run's own** resolved building
 * (`dev/state.ts#resolvedBuildingOf` is `shiftRunConfigOf(...).building`) rather than off the
 * ladder — the car named is the car the kernel stood down.
 *
 * ## What each surface may say
 *
 * - **Before the run** (the brief) — the car and the fact, **no clock**. `today.ts#outOfServiceOf`
 *   owns that rule and its reason: a time printed before the run is a figure whose only source is
 *   a schedule the reader cannot see.
 * - **During and after the run** (the stage, the report) — the car and the two clock times, because
 *   the run is now the source: the stage draws the car leaving at that second, and the report is
 *   the account of a run that did.
 */

import { isServiceModeEvent, type ResolvedBuilding } from '@elevator-sim/core/browser';

import type { ShiftEvent } from './types.js';

/** One car the tower's schedule takes out of passenger service after the day has started. */
export interface BookedOutCar {
  readonly carId: string;
  /** The simulated second it leaves passenger service. Always `> 0` — see {@link bookedOutCarsOf}. */
  readonly awayAtS: number;
  /** The second the same schedule brings it back, or `null` when it does not come back. */
  readonly backAtS: number | null;
}

/**
 * The tower's own mid-run bookings, one entry per car, ordered by car id.
 *
 * `atS > 0` is what makes this *part-way through today* rather than *not in the building*: a car
 * stood down at the first instant is the second thing, and `carsOutOfService` is where that lives.
 * A car booked out twice is reported at its **first** leaving and the first return after it —
 * which is the sentence a player needs (*it goes, and it comes back*), and no shipped rung books
 * one car twice.
 */
export function bookedOutCarsOf(building: ResolvedBuilding | undefined): readonly BookedOutCar[] {
  /*
   * `isServiceModeEvent` rather than a field test: `ResolvedServiceEvent` is a union of a mode
   * change, a derate and a range change (§ D523), and only the first has a `mode` and a `carId`.
   */
  const events = (building?.serviceEvents ?? []).filter(isServiceModeEvent);
  const leaves = events
    .filter((entry) => entry.mode === 'out-of-service' && entry.atS > 0)
    .sort((a, b) => a.atS - b.atS);
  const seen = new Map<string, BookedOutCar>();
  for (const leaving of leaves) {
    if (seen.has(leaving.carId)) continue;
    const back = events
      .filter(
        (entry) =>
          entry.carId === leaving.carId && entry.mode === 'in-service' && entry.atS > leaving.atS,
      )
      .sort((a, b) => a.atS - b.atS)[0];
    seen.set(leaving.carId, {
      carId: leaving.carId,
      awayAtS: leaving.atS,
      backAtS: back === undefined ? null : back.atS,
    });
  }
  return [...seen.values()].sort((a, b) => a.carId.localeCompare(b.carId));
}

/** `car D` / `cars D and E` / `cars D, E and F`. */
export function carsPhraseOf(cars: readonly BookedOutCar[]): string {
  const ids = cars.map((car) => car.carId);
  if (ids.length <= 1) return `car ${ids[0] ?? ''}`;
  return `cars ${ids.slice(0, -1).join(', ')} and ${String(ids[ids.length - 1])}`;
}

/**
 * **The day's wrinkle note, told the truth about the tower's own bookings** — the one sentence the
 * brief's wrinkle card and the report's header line both print.
 *
 * With nothing booked by the tower it is the event's own note, verbatim, so every day that was
 * already true reads exactly as it did. With a booking:
 *
 * - on the **ordinary** day, whose authored note begins *Nothing booked*, the note is replaced —
 *   *Nothing on the calendar, but the tower books car D out of passenger service part-way through
 *   the day.* Appending to *Nothing booked* would print the contradiction the issue is about;
 * - on any other day the event's note stands and one sentence follows it, because that note is
 *   about the calendar's event and is still true.
 *
 * No clock, for the module docstring's before-the-run reason: this line is drawn on the brief.
 */
export function wrinkleNoteOf(event: ShiftEvent, bookedOut: readonly BookedOutCar[]): string {
  if (bookedOut.length === 0) return event.note;
  const which = carsPhraseOf(bookedOut);
  if (event.id === 'ordinary') {
    return `Nothing on the calendar, but the tower books ${which} out of passenger service part-way through the day.`;
  }
  return `${event.note} The tower also books ${which} out of passenger service part-way through the day.`;
}
