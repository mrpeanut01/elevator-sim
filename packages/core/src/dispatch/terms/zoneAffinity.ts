/**
 * `zoneAffinity` — how far this call is outside the car's **operational** zone. Serves zoning
 * strategies.
 *
 * ```
 * raw = 0                                                    the call floor is inside the zone
 *     = min over zone floors of |height(call) − height(zone floor)|      otherwise, in metres
 * ```
 *
 * ## Operational zoning only — the third kind
 *
 * docs/01-architecture.md is explicit that the three kinds of zoning are three different
 * concepts and that collapsing them is the classic modelling mistake:
 *
 * | kind | question | where it lives | how it behaves |
 * |---|---|---|---|
 * | service | does the shaft open there at all | `car.shaft` | hard feasibility filter |
 * | access | may this credential go there | `ServedFloor.permittedCredentialGroups` | request validation |
 * | **operational** | which cars should cover which floors *right now* | dispatcher strategy | **tunable cost** |
 *
 * This term is the third row and only the third row. The first two are hard filters the car
 * already applied inside `Car.estimateCost()`; a car whose shaft does not reach the floor never
 * reaches a cost term at all. Expressing operational zoning as a **weighted cost** rather than
 * as an eligibility filter is what makes a zoned dispatcher a weight vector: a zone boundary a
 * weight can be argued past under load is a strategy, and a zone boundary nothing can cross is
 * service zoning wearing a dispatcher's hat.
 *
 * ## Metres, not floors, and only floors this shaft serves
 *
 * Distance is measured in metres of height, for the reason `distanceTravelled` gives: a building
 * with a double-height lobby has floors that really are twice as far apart, and a floor-count
 * metric would price them the same. Zone floors the shaft does not serve are skipped — a zone
 * naming a floor this car cannot reach says nothing about how far out of position it is.
 *
 * ## Inert without a zone, and why that is right
 *
 * The zone arrives on the observation (see `observation.ts`), because it is dispatcher strategy
 * resolved once per decision, exactly as `RepositionContext.zoneFloorIds` already carries one
 * for stage 7. A car with no declared zone scores zero: **no operational zoning is configured**,
 * which is not the same as a zone the car is standing outside of. Defaulting to the shaft's own
 * service zone would collapse rows one and three of the table above and make the term score
 * zero everywhere anyway, having quietly asserted that service zoning is a soft preference.
 *
 * Pure.
 */

import { shaftFloor } from '../../model/car/types.js';
import type { CostTermDefinition, TermContext } from '../types.js';

import { zoneFloorIdsFor } from './observation.js';

/**
 * Metres from the call floor to the nearest floor of this car's operational zone; `0` inside the
 * zone, and `0` when the car has no zone.
 */
export function zoneDeviationM(context: TermContext): number {
  const car = context.car;
  const zoneFloorIds = zoneFloorIdsFor(context.observation, car.carId);
  if (zoneFloorIds === undefined || zoneFloorIds.length === 0) return 0;

  const target = shaftFloor(car.shaft, context.request.floorId);
  /* c8 ignore next -- unreachable: stage 2 rejected any call the shaft does not serve. */
  if (target === undefined) return 0;

  let nearest = Number.POSITIVE_INFINITY;
  for (const floorId of zoneFloorIds) {
    if (floorId === target.id) return 0;
    const floor = shaftFloor(car.shaft, floorId);
    // A zone floor outside this shaft's service zone says nothing about this car's position.
    if (floor === undefined) continue;
    const distanceM = Math.abs(floor.heightM - target.heightM);
    if (distanceM < nearest) nearest = distanceM;
  }

  // Every floor the zone named is unreachable by this shaft: the zone does not constrain it.
  return Number.isFinite(nearest) ? nearest : 0;
}

/** Metres, on the same saturating reference as `distanceTravelled`: both are shaft geometry. */
export const zoneAffinityTerm: CostTermDefinition = Object.freeze({
  id: 'zoneAffinity',
  unit: 'm',
  measures: "Deviation from the car's assigned zone",
  normalization: Object.freeze({ mode: 'saturating', scale: 'distanceM' } as const),
  evaluate: zoneDeviationM,
});
