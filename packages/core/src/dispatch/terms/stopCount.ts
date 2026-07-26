/**
 * `stopCount` — how many stops the call adds to the car's route. Serves energy and ride
 * annoyance.
 *
 * ```
 * raw = (the call floor is not already a stop ? 1 : 0)
 *     + (the destination is known, served, and not already a stop ? 1 : 0)
 * ```
 *
 * Two things make this the right shape rather than an obvious one.
 *
 * ## A stop is a union, so the count comes off the projection
 *
 * A floor with both a car call and an assigned hall call is **one** stop, not two — that is
 * `withStop`'s merge rule and `CommittedStop`'s own definition. So the pickup increment is read
 * from the shared {@link routeComparison}, as `projected.length − baseline.length`, rather than
 * assumed to be 1: a car already committed to the call floor adds no stop and pays no energy for
 * one, which is the same argument `distanceTravelled` makes about metres it was going to travel
 * anyway. Charging it would penalise the very car best placed to sweep the floor up on its way.
 *
 * ## The destination is a stop too, when it is known
 *
 * Under `destination-entry` or `mobile-credential` the passenger's destination is known at call
 * time, and it is a real extra stop for the car unless somebody was already going there. Under
 * `up-down-buttons` it is not knowable and the term counts only the pickup — the same asymmetry
 * `rideTime` has, and the same reason: this simulator measures the value of earlier information
 * instead of assuming it.
 *
 * ## Bounded at two, by construction
 *
 * One call can add at most a pickup and a destination, so `fullScale: 2` is a fact about the
 * term and not a tunable — the same argument, and the same number, as `directionReversal`.
 *
 * Pure.
 */

import { shaftFloor } from '../../model/car/types.js';
import type { CostTermDefinition, TermContext } from '../types.js';

import { routeComparison } from './routeComparison.js';

/** Stops the call would add to the car's route: `0`, `1` or `2`. */
export function addedStopCount(context: TermContext): number {
  const car = context.car;
  const added = routeComparison(context).addedStops;

  const destinationFloorId = context.request.destinationFloorId;
  if (destinationFloorId === undefined) return added;
  if (destinationFloorId === context.request.floorId) return added;
  /* c8 ignore next -- unreachable: stage 2 rejected an unserved destination. */
  if (shaftFloor(car.shaft, destinationFloorId) === undefined) return added;

  const alreadyStopping = car.stops.some((stop) => stop.floorId === destinationFloorId);
  return added + (alreadyStopping ? 0 : 1);
}

/** Bounded at two: a pickup and a destination are all one call can add. */
export const stopCountTerm: CostTermDefinition = Object.freeze({
  id: 'stopCount',
  unit: '',
  measures: 'Number of stops added',
  normalization: Object.freeze({ mode: 'bounded', fullScale: 2 } as const),
  evaluate: addedStopCount,
});
