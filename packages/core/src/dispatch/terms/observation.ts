/**
 * What a Phase 5 term needs to know about the wider system, and where it comes from.
 *
 * Three of the twelve terms price something neither the car nor the call can answer:
 *
 * | Term | Fact it needs | Who owns it |
 * |---|---|---|
 * | `crowding` | passengers on the landing | `DispatchObservation.waitingPassengers` |
 * | `zoneAffinity` | the car's **operational** zone | the group controller's strategy |
 * | `predictedDemand` | the arrival forecast | the predictor's learned model |
 *
 * All three now arrive on {@link DispatchObservation}, and this module is the one place the two
 * group-owned ones are read. They are handed in rather than fetched for one reason: **a cost term
 * is a pure function and cannot own a learned model.** A predictor has a learning rate, a
 * per-floor per-time-of-day arrival model and a horizon; it is stateful by construction, and
 * stateful is exactly what `evaluate(context)` may not be (CLAUDE.md invariant 1). So the forecast
 * is resolved **once per decision**, by whoever holds the predictor, and handed to the term
 * through the observation — the same shape and the same hand-off `RepositionContext.demandForecast`
 * already uses for stage 7. Operational zoning arrives the same way, and for the same reason: a
 * zone is dispatcher strategy supplied per decision, not shaft geometry baked into a snapshot.
 *
 * ## The hand-off, end to end
 *
 * ```
 * policies/groupContext.ts   resolves zones + forecast once per dispatch pass
 *   → DispatchContext        the caller passes it to policy.score / dispatch / reconsider
 *   → lifecycle.observationFor   forwards both onto the frozen DispatchObservation
 *   → TermContext.observation    read here, by zoneAffinity and predictedDemand
 * ```
 *
 * That chain used to stop at `observationFor`, which built an observation from two fields and
 * dropped these two. The consequence was not a missing feature but a **silent** one: both terms
 * saw `undefined` and scored zero for every car in every configuration. `liveness.test.ts` is the
 * test that now fails if any link in that chain is dropped again — it drives every term through
 * `policy.score()` on a real building and demands a non-zero raw and a spread between candidate
 * cars.
 *
 * Every link in that chain is now joined, including the last one: `Simulation.#dispatchBank`
 * resolves a `groupContext` once per dispatch pass and shares it across the calls in the pass, so a
 * full `runSimulation` supplies both facts. It used not to, and the cost was exact rather than
 * approximate — `zoned-uppeak` produced **byte-identical** runs at `zoneAffinity` weights of 0.3, 0
 * and 50, and was bit-identical to `eta` on every building in the Phase 5 benchmark. Counted
 * through the shipped engine on `midtown-office`, `zoneAffinity` went from 0 non-zero evaluations
 * in 437 to 372 in 495. `sim/seam.test.ts` is the test that fails if the link is dropped again.
 *
 * ## Absent still means inert, and that is deliberate
 *
 * A caller that holds no predictor and configures no zoning supplies neither field, and both
 * terms score zero. A term with no information must contribute no cost; guessing one would be
 * worse than saying nothing, because a guess that is the same for every car cannot change a
 * decision but *can* change a reported cost. That is the same choice `repositionDecisionFor`
 * makes when it reports `no-forecast`.
 *
 * Everything here is pure: no clock, no RNG, no mutation.
 */

import type { DemandForecast } from '../predictor/types.js';
import type { DispatchObservation } from '../types.js';

/**
 * The forecast shape, taken from the predictor rather than restated.
 *
 * A **type-only** import: `predictor/` keeps zero runtime imports outside its own directory
 * because that is what its causality argument rests on, and nothing here adds one. What it buys
 * is that the hand-off is compile-checked in both directions — if `DemandForecast` ever changed
 * what `expectedDemandByFloor` returns, {@link demandForecastOf} would stop compiling instead of
 * silently handing `predictedDemand` a map that no longer means what it meant.
 *
 * Note what is deliberately *not* passed to a term: the {@link DemandForecast} itself. It has no
 * `observe`, so it could not be corrupted, but handing a term a live model would let two terms ask
 * for two different horizons and would put the cost of a forecast inside a per-term loop.
 */
export type ExpectedDemandByFloor = ReturnType<DemandForecast['expectedDemandByFloor']>;

/**
 * The floor ids of this car's operational zone, or `undefined` when it has none.
 *
 * Operational zoning only — the third kind, the dispatcher's own dynamic partitioning
 * (docs/01-architecture.md § Security zones are three different things). Service zoning is
 * `car.shaft` and access zoning is `ServedFloor.permittedCredentialGroups`; neither is a cost.
 *
 * A car absent from the map has no zone, which is not the same as an empty zone: no zone means no
 * operational zoning is configured and `zoneAffinity` is inert, while an empty zone would mean
 * every floor is a deviation.
 */
export function zoneFloorIdsFor(
  observation: DispatchObservation,
  carId: string,
): readonly string[] | undefined {
  return observation.zoneFloorIdsByCarId?.get(carId);
}

/** The arrival forecast, or `undefined` when nobody supplied one. */
export function demandForecastOf(
  observation: DispatchObservation,
): ExpectedDemandByFloor | undefined {
  return observation.demandForecast;
}
