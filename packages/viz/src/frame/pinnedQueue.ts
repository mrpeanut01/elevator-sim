/**
 * A landing queue that cannot clear, because more people are promised one car than it holds.
 *
 * ## The thing on screen this exists to explain
 *
 * Under a destination panel the assignment is **write-once** (`DECISIONS.md` § D29): a passenger
 * the panel promised a car that then filled waits for *that* car rather than the next one. § D29
 * chose that deliberately and the reasoning is not up for re-litigation here — re-offering *"quietly
 * recovers the deferral advantage Level 1 is supposed to surrender, which flatters the thing being
 * measured"*, and a non-zero broken-promise count is *"a result, not a failure"*.
 *
 * What § D29 did not do is make that result **visible**. A player watching Vertical City's lobby
 * after the peak sees a crowd standing still while shuttle cars sit at the same floor, and every
 * banner on the screen tells them about something else — undelivered legs, locked-out landings,
 * a suppressed mean. None of those is what is happening. The cars are not idle and not broken:
 * everybody standing there is holding a ticket for a *different* car, so a car that opens in front
 * of them may legally take nobody. That reads as broken software, and it is the model working.
 *
 * Measured on the run that prompted this, `vertical-city` / `destination-panel`, seed
 * 101390945715201: 936 legs ended the run waiting at `G`, **764 of them promised to one car**,
 * `shuttle-S1`, whose capacity is 26. Across the whole run S1 was promised 1531 legs and carried
 * 761, while `shuttle-S5` — an identical car in the same bank — was promised 68. The queue was not
 * short of cars. It was short of the *one* car it had been told to wait for.
 *
 * ## The trigger is arithmetic, not a threshold somebody chose
 *
 * A group is reported when it is **larger than the promised car's own capacity**, because at that
 * point the promise provably cannot be kept in one trip — the car would have to come back, and
 * every rider beyond the first carful is waiting for a second visit by a named car while other
 * cars pass. Below capacity this is an ordinary queue with an ordinary wait and nothing to explain.
 *
 * `capacityPersons` comes off the shaft, so the rule is a property of the building rather than a
 * constant this module invented — which is the distinction `data/traffic-profiles.json`'s
 * `credentialGap` block draws about its own uncited figure, applied one layer up.
 *
 * ## What it is not
 *
 * Not an alarm about the dispatcher being wrong, and the copy is written to avoid reading as one.
 * A panel that commits early buys shorter journeys for the people it commits and pays for it
 * exactly here; saying *"this is the cost you are seeing"* is the honest sentence, and
 * *"the dispatcher has failed"* is not. `docs/10` R3 — replace a suppressed thing with **why**,
 * never a blank — pointed at a number; this is the same rule pointed at a picture.
 */

import type { VizRecording, VizShaft } from '../contract/types.js';

import type { FloorQueue } from './overlay.js';

/** One landing where a single promised car is holding more people than it can carry. */
export interface PinnedQueue {
  readonly floorId: string;
  /** The car every rider in {@link waiting} was promised. */
  readonly carId: string;
  /** How many riders at this floor hold that promise, at this instant. */
  readonly waiting: number;
  /** That car's rated capacity in persons, from its shaft. */
  readonly capacityPersons: number;
  /**
   * Trips that car must make to clear them, `ceil(waiting / capacityPersons)`, at least 2.
   *
   * The quantity a reader actually wants — *"how long is this going to take"* expressed in car
   * visits rather than in seconds, because seconds depend on where the car is and this does not.
   */
  readonly tripsNeeded: number;
}

/**
 * Every landing at this instant where one promised car is over-subscribed, worst first.
 *
 * Conventional runs return an empty array by construction rather than by a check on the caller's
 * side: without a panel there is no promise, `FloorQueue.groups` collapses to a single group keyed
 * by the empty string, and the `carId === ''` skip below drops it.
 */
export function pinnedQueuesAt(
  queues: readonly FloorQueue[],
  shafts: readonly VizShaft[],
  model: VizRecording['passengerModel'],
): readonly PinnedQueue[] {
  if (model !== 'destination-dispatch') return Object.freeze([]);

  const capacityOf = new Map<string, number>();
  for (const shaft of shafts) capacityOf.set(shaft.carId, shaft.capacityPersons);

  const pinned: PinnedQueue[] = [];
  for (const queue of queues) {
    for (const group of queue.groups) {
      const carId = group.promisedCarId;
      // No promise is not a promise to nobody. A conventional run and a panel run's unassigned
      // riders both land here, and neither is over-subscribed to a car.
      if (carId === undefined || carId === '') continue;
      const capacityPersons = capacityOf.get(carId);
      // A car the recording does not describe cannot have its capacity compared against. Silently
      // skipped rather than defaulted: a guessed capacity would invent the very number this
      // module's docstring says it does not invent.
      if (capacityPersons === undefined || capacityPersons <= 0) continue;
      const waiting = group.riders.length;
      if (waiting <= capacityPersons) continue;
      pinned.push({
        floorId: queue.floorId,
        carId,
        waiting,
        capacityPersons,
        tripsNeeded: Math.ceil(waiting / capacityPersons),
      });
    }
  }

  // Worst first, and `floorId` last so the order is total: two landings with the same overhang
  // must not swap between frames, because a banner that reorders on its own reads as a change.
  pinned.sort(
    (a, b) =>
      b.waiting - a.waiting ||
      b.tripsNeeded - a.tripsNeeded ||
      (a.floorId < b.floorId ? -1 : a.floorId > b.floorId ? 1 : 0),
  );
  return Object.freeze(pinned);
}

/**
 * One sentence for the banner and its text alternative, or `''`.
 *
 * Produced here rather than in the canvas and in `describeFrame` separately, for the reason
 * `describeLockedOut` gives about itself: the picture and its alternative saying different things
 * about one fact is a defect this package has already paid for once.
 *
 * The **short** form drops the floor and the arithmetic and keeps the cause, because the banner has
 * one line and the floor is already marked on the picture. What it may not drop is *why* — a chip
 * reading only "queue pinned" would be the blank R3 forbids.
 */
export function describePinnedQueues(
  pinned: readonly PinnedQueue[],
  options: { readonly short?: boolean } = {},
): string {
  const worst = pinned[0];
  if (worst === undefined) return '';
  const short = options.short === true;
  const others = pinned.length - 1;

  if (short) {
    const more = others > 0 ? ` +${String(others)} more` : '';
    return `${String(worst.waiting)} waiting for one named car${more}`;
  }

  const suffix =
    others > 0
      ? ` The same is true at ${String(others)} other landing${others === 1 ? '' : 's'}.`
      : '';
  return (
    `${String(worst.waiting)} riders at ${worst.floorId} were each told to take ${worst.carId}, ` +
    `which holds ${String(worst.capacityPersons)} — so it needs ${String(worst.tripsNeeded)} trips ` +
    `to clear them and no other car may take them in the meantime. That is what the panel bought ` +
    `them a shorter journey with.${suffix}`
  );
}
