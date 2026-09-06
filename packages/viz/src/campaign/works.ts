/**
 * **A works night takes a car out of passenger service** — GitHub issue #353 (`docs/35` PM-CA3),
 * `docs/32` GD11's first half, [§ D504](../../../../DECISIONS.md).
 *
 * GD11 is *spending must make the near days harder*: the ordering that makes a purchase a decision
 * is **take capacity away first, give it back later**. § D427 built the second half (the kit is in
 * the building the run is built on once the nights are past). This module is the first half, and
 * `docs/32` named its shape before it existed: *"giving a live booking a writer for
 * `RecordRunOptions.outOfServiceCarIds` on the path `runCampaignDay` takes … pinned in the
 * repository's standing shape: move the control and require the run to change, compared on the
 * legs."*
 *
 * ## What a night holds, and which car
 *
 * On any day one of the tower's bookings occupies (`economy.ts#occupiedDayIndices`), **one car** is
 * out for the day, whichever tier the works are for. One rather than a per-tier count, because the
 * shop's nights already scale with the tier — a fortnight of works is fourteen days a car short —
 * and a second per-tier number would be a second lever the design does not draw. The car is
 * `shift/incidents.ts#carsToDerate`'s first choice, the same chooser the day's event uses, so a
 * move-in day under works does not hold the same car twice: the event's derate is a
 * `serviceEvents` schedule and this is a whole-day hold, and both readers pick from the biggest
 * bank first.
 *
 * ## Two readers, one derivation
 *
 * `everyday/host.ts#runCampaignDay` writes {@link worksHeldCarsOf}'s answer into the run, and
 * `everyday/campaignScreens.ts` draws the same answer as a dashed well on the tower's elevation
 * before the day is pressed — § 16 rule 14, so the picture and the run cannot disagree.
 *
 * ## The sentences this brings back
 *
 * GitHub issue #264 withdrew seven sentences claiming a works day ran a car short, because no run
 * did, and `everyday/campaignModel.test.ts` held the writer's absence from disk so the day one
 * appeared the sentences would be owed back. This is that day; the sentences come back narrower
 * than they left (one car, on the days the works occupy), and the guard now holds the writer's
 * presence rather than its absence.
 */

import { carsToDerate, type BankedBuilding, type CarRef } from '../shift/incidents.js';

import { dayIndexOf, occupiedDayIndices, type TowerEconomy } from './economy.js';

/** Whether the tower's works occupy today. */
export function worksTodayOf(tower: TowerEconomy): boolean {
  return occupiedDayIndices(tower).has(dayIndexOf(tower));
}

/**
 * The car today's works hold, as the building names it — one ref, or none on a day no booking
 * occupies. The elevation reads this; the run reads {@link worksHeldCarsOf}.
 */
export function worksHeldCarRefsOf(tower: TowerEconomy, building: BankedBuilding): readonly CarRef[] {
  if (!worksTodayOf(tower)) return [];
  return carsToDerate(building, 1).held;
}

/**
 * The id `Simulation` gives a car at run time — `${bankId}-${carId}` — kept **private** here as it
 * is in `shift/events.ts` and `shift/calendar.ts`, for the reason `events.ts#carRuntimeId` states:
 * the hyphenated expression reads to the honesty deriver as a phrase, so the declaration holding it
 * is a text producer and an exported one would be an unclassified surface. Which car is taken is
 * `carsToDerate`'s and is not duplicated.
 */
function carRuntimeId(car: CarRef): string {
  return `${car.bankId}-${car.carId}`;
}

/**
 * The cars today's works hold out of passenger service, as `RecordRunOptions.outOfServiceCarIds`
 * names them — one, or none on a day no booking occupies.
 */
export function worksHeldCarsOf(tower: TowerEconomy, building: BankedBuilding): readonly string[] {
  return worksHeldCarRefsOf(tower, building).map(carRuntimeId);
}
