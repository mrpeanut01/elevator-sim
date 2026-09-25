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
 * - **Before the run** (the brief) — the car, the fact **and the two clock times**, since
 *   [§ D1039](../../../../DECISIONS.md). This line said *no clock*, on the ground that a time printed
 *   before the run is a figure whose only source is a schedule the reader cannot see; printing it is
 *   what lets the reader see it, and the brief read *booked out part-way through today* while the
 *   stage and the report beside it gave the times. The times are the same expression the report's
 *   header uses — this module's windows over the run's own building, on the run's own clock —
 *   read before the press rather than after it (`today.ts#outOfServiceOf`).
 * - **During and after the run** (the stage, the report) — the car and the two clock times, because
 *   the run is now the source: the stage draws the car leaving at that second, and the report is
 *   the account of a run that did.
 */

import { isServiceModeEvent, type ResolvedBuilding } from '@elevator-sim/core/browser';

import { eventCarChoice } from './events.js';
import type { ShiftEvent } from './types.js';

/** One car the run's schedule takes out of passenger service. */
export interface BookedOutCar {
  readonly carId: string;
  /**
   * The simulated second it leaves passenger service. Always `> 0` from {@link bookedOutCarsOf};
   * `0` is possible from {@link carAbsencesOf}, which also answers *out from the start*.
   */
  readonly awayAtS: number;
  /** The second the same schedule brings it back, or `null` when it does not come back. */
  readonly backAtS: number | null;
  /**
   * Whether **today's wrinkle** takes this car itself — `events.ts#eventCarChoice` over the same
   * building — rather than only the tower's own schedule. `undefined` when the caller did not say
   * which day it is, which every reader treats as *the tower's*.
   *
   * [§ D1038](../../../../DECISIONS.md): a car the day and the tower both take is one window in the
   * run, and {@link wrinkleNoteOf} must not say *the tower also books* a car that is the day's own —
   * on Midtown's Tuesday that sentence was the third of three accounts of car D.
   */
  readonly ofTheDay?: boolean;
}

/**
 * Every window the run's schedule takes a car out of passenger service for, **including one that
 * starts at the first instant** — one entry per car, ordered by car id.
 *
 * The brief's strip reads this ([§ D1039](../../../../DECISIONS.md)), because a car the day takes
 * from the start and hands back at 16:30 is as much a fact about today as one the tower books at
 * 10:30, and the strip used to describe the first with one sentence and the second with another.
 * `event`, when given, marks the cars the day's own wrinkle takes ({@link BookedOutCar.ofTheDay}).
 *
 * A car out twice is reported at its **first** leaving and the first return after it — which is the
 * sentence a player needs (*it goes, and it comes back*). Two windows on one car that meet are one
 * window by the time they reach a building (`incidents.ts#serviceEventsFor`, § D1038), so what is
 * left to disagree is two windows that do not meet, and no shipped day draws one.
 */
export function carAbsencesOf(
  building: ResolvedBuilding | undefined,
  event?: ShiftEvent,
): readonly BookedOutCar[] {
  /*
   * `isServiceModeEvent` rather than a field test: `ResolvedServiceEvent` is a union of a mode
   * change, a derate and a range change (§ D523), and only the first has a `mode` and a `carId`.
   */
  const events = (building?.serviceEvents ?? []).filter(isServiceModeEvent);
  const dayCars =
    event === undefined || building === undefined
      ? undefined
      : (() => {
          const choice = eventCarChoice(event.effect, building);
          return new Set([...choice.holdCars, ...choice.derateCars].map((car) => car.carId));
        })();
  const leaves = events
    .filter((entry) => entry.mode === 'out-of-service' && entry.atS >= 0)
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
      ...(dayCars === undefined ? {} : { ofTheDay: dayCars.has(leaving.carId) }),
    });
  }
  return [...seen.values()].sort((a, b) => a.carId.localeCompare(b.carId));
}

/**
 * The run's mid-run bookings — {@link carAbsencesOf} without the cars that are out from the first
 * instant, which is what makes each of these *part-way through today*. The stage's pill and the Day
 * report's header read this, and have since § D983.
 *
 * `atS > 0` is what makes this *part-way through today* rather than *not in the building*: a car
 * stood down at the first instant is the second thing, and the day's own note is what says so.
 */
export function bookedOutCarsOf(
  building: ResolvedBuilding | undefined,
  event?: ShiftEvent,
): readonly BookedOutCar[] {
  return carAbsencesOf(building, event).filter((car) => car.awayAtS > 0);
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
 * No clock: the times are the strip's and the header's own lines, and this one is the wrinkle.
 *
 * **A car the day takes itself is not *also* booked by the tower** — [§ D1038](../../../../DECISIONS.md).
 * The sentence names only cars {@link BookedOutCar.ofTheDay} does not mark; before, on Midtown's
 * Tuesday it said *the tower also books car D* about the move-in's own car, and on any tower a
 * wrinkle whose window starts after the first instant was read back as *the tower's* booking.
 */
export function wrinkleNoteOf(event: ShiftEvent, bookedOut: readonly BookedOutCar[]): string {
  const towers = bookedOut.filter((car) => car.ofTheDay !== true);
  if (towers.length === 0) return event.note;
  const which = carsPhraseOf(towers);
  if (event.id === 'ordinary') {
    return `Nothing on the calendar, but the tower books ${which} out of passenger service part-way through the day.`;
  }
  return `${event.note} The tower also books ${which} out of passenger service part-way through the day.`;
}
