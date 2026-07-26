/**
 * `crowding` — the hall queue at the pickup floor, priced as the share of it this car would
 * leave standing. Serves parallel service.
 *
 * ```
 * seats = ⌊(designLoadFactor · ratedLoadKg − massOnArrival) / nominalPassengerMassKg⌋
 * raw   = max(0, queue − seats) / queue                              a fraction in [0, 1]
 * ```
 *
 * ## Why the fraction left behind, and not the queue length
 *
 * The raw queue length is the obvious reading of "hall queue length at the pickup floor" and it
 * is **useless as a cost term**: the queue is a property of the landing, so it is identical for
 * every candidate car, and a term with the same value for every car cannot change an `argmin`.
 * It would report a cost and move nobody.
 *
 * What differs between cars is *what they could do about it*. A car arriving nearly empty takes
 * the whole landing; a car arriving at 70% of design load takes four people and leaves
 * twenty-six with the button still lit, and those twenty-six wait for the next car — which is
 * the mechanism behind the tail on a heavy floor. So the term prices the **share of the landing
 * this car cannot absorb**, which is car-specific, bounded in `[0, 1]` by construction, and is
 * exactly the signal `dispatch.assignmentMode: split-demand` acts on: when no single car can
 * clear the floor, send more than one (docs/06 § Stage 4).
 *
 * The fraction rather than the absolute shortfall, for the same argmin reason: `queue` is common
 * to every car, so dividing by it changes no ranking, and it buys a bounded term with an
 * operational meaning — 1.0 is "this car takes nobody", 0.0 is "this car clears the floor".
 *
 * ## Design load, not rated load
 *
 * `load.designLoadFactor` — 0.8, never 1.0. People do not pack in, and using rated capacity
 * makes every result systematically optimistic (CLAUDE.md § modeling rules). It is the same cap
 * `lifecycle.requestForCar` applies when it decides how many of a landing a car may be priced
 * for, so the term and the pricing agree about how many fit. The one difference is deliberate:
 * `requestForCar` floors the room at one person, because a car that is eligible at all can take
 * somebody, whereas this term must be able to say *zero seats* — that is the whole content of a
 * crowded car.
 *
 * ## Occupancy on arrival, not now
 *
 * The mass used is what the car is carrying **when its doors open at the call floor**: everyone
 * bound for a floor it reaches first has already alighted, and so has everyone bound for the
 * call floor itself — out first, then in, which is the order the run transfers people in. A car
 * that is full now but empties two floors below the call has room, and pricing it as full would
 * send the landing to a worse car. That figure comes from the shared {@link routeComparison}.
 *
 * ## Bounded, and the cap costs nothing
 *
 * A fraction of a queue cannot exceed one, so `fullScale: 1` is a fact about the term rather
 * than a tunable — the same argument as `directionReversal`'s two and `loadFactor`'s one.
 *
 * Pure.
 */

import type { CostTermDefinition, TermContext } from '../types.js';

import { routeComparison } from './routeComparison.js';

/**
 * Passengers the car has room for when it reaches the call floor, at design load.
 *
 * Zero is a real answer here, unlike in `requestForCar`: a car arriving at design load takes
 * nobody, and that is the fact the term is built to express.
 */
export function spareSeatsOnArrival(context: TermContext): number {
  const car = context.car;
  const roomKg = car.load.ratedLoadKg * car.load.designLoadFactor - routeComparison(context).massOnArrivalKg;
  /* c8 ignore next -- a non-finite passenger mass would mean the car spec is nonsense. */
  if (!Number.isFinite(roomKg) || car.nominalPassengerMassKg <= 0) return 0;
  return Math.max(0, Math.floor(roomKg / car.nominalPassengerMassKg));
}

/** Share of the landing queue this car would leave behind, in `[0, 1]`. */
export function unservedQueueFraction(context: TermContext): number {
  const queue = context.observation.waitingPassengers;
  if (!Number.isFinite(queue) || queue <= 0) return 0;
  const leftBehind = Math.max(0, queue - spareSeatsOnArrival(context));
  return Math.min(1, leftBehind / queue);
}

/** Bounded at one: a fraction of a queue cannot exceed the queue. */
export const crowdingTerm: CostTermDefinition = Object.freeze({
  id: 'crowding',
  unit: '',
  measures: 'Hall queue length at the pickup floor',
  normalization: Object.freeze({ mode: 'bounded', fullScale: 1 } as const),
  evaluate: unservedQueueFraction,
});
