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

/**
 * Bounded at two: a pickup and a destination are all one call can add.
 *
 * `partiallyActiveWhen`, and deliberately **not** `activeWhen`. Half this term's raw value — the
 * destination increment — exists only when the call carries a destination, and the other half,
 * the pickup, is priced under every call type. So the *quantity* is conditional and the
 * *dimension* is not: `weights.stopCount` is a live search dimension at `up-down-buttons`, where
 * `energy-aware` and `predictive-balanced` both weight it today.
 *
 * The gate was tried before this declaration was written, and measurement refused it.
 * `sim/searchSpaceLiveness.test.ts` § *finds no activeWhen gate that hides a live region*
 * reported `weights.stopCount ... at dispatch.callType=up-down-buttons — outside that gate — it
 * still moves a run (0 vs 5 on midtown-office)`, and `policies.test.ts` turned red on the two
 * shipped profiles the gate would have made invalid. A gate is a machine-readable claim, and that
 * one is false.
 *
 * What the declaration *is* for is the hazard § D136 measured: authoring a destination call type
 * onto a profile that weights this term changes what the term prices, and at `garden-down-peak`
 * it made the wait **worse** by a resolved interval — `+1.320 [+0.988, +1.653] s` on AWT at
 * weight 1, n = 200. A weight tuned on one side of the call type does not transfer to the other,
 * which is the same discipline docs/06 already states for traffic patterns.
 */
export const stopCountTerm: CostTermDefinition = Object.freeze({
  id: 'stopCount',
  unit: '',
  measures: 'Number of stops added',
  // Everyday Mode's words for this term — engine contract §6.3, issue #147. Two readers,
  // two vocabularies: `measures` stays addressed to an optimizer, these to a player.
  player: Object.freeze({
    name: 'stop count',
    serves: 'energy, and a stopping trip\'s annoyance',
    atZero: 'stop wherever it helps',
    atFull: 'fewer stops, longer walks',
  } as const),
  normalization: Object.freeze({ mode: 'bounded', fullScale: 2 } as const),
  partiallyActiveWhen: Object.freeze({
    'dispatch.callType': Object.freeze(['destination-entry', 'mobile-credential']),
  }),
  evaluate: addedStopCount,
});
