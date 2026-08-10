/**
 * `distanceTravelled` — metres of travel the call adds. The energy proxy, and the whole of
 * the "nearest car" dispatcher.
 *
 * The raw value is **marginal**, not absolute:
 *
 * ```
 * raw = pathLength(route with the call) − pathLength(route without it)
 * ```
 *
 * where a path length is the sum of `|Δheight|` over the stops in the order the car
 * physically reaches them, starting from where the route starts. Both routes come from the
 * pure `projectRoute`, so the ordering — everything ahead in the current direction, then
 * everything behind — is the car's, not a second opinion invented here.
 *
 * ## Why marginal, and why that gives nearest-car for free
 *
 * For an **idle car with nothing to do** the baseline route is empty and the projected route
 * is one stop, so the raw value collapses to `|callHeight − carHeight|`: the distance to the
 * call. A profile of `{ distanceTravelled: 1.0 }` therefore picks the physically nearest
 * eligible car, which is exactly what `data/dispatcher-profiles.json → nearest-car` claims,
 * reproduced with no strategy-specific code (CLAUDE.md invariant 7).
 *
 * For a **busy car** it collapses to zero when the call floor already lies on the route — the
 * car passes it anyway, so the marginal energy really is nothing — and to the detour length
 * otherwise. That is the correct energy semantics and the reason the term is not simply the
 * straight-line distance to the call: charging a car for metres it was going to travel anyway
 * would penalise the very car best placed to sweep the floor up on its way.
 *
 * ## The in-flight leg cancels
 *
 * A car mid-move is committed to its destination — it cannot stop short, which is how
 * `projectRoute` models it — so both routes start at `motion.toHeightM` and the metres
 * already being travelled appear in neither. The difference is the marginal cost of the call
 * and nothing else.
 *
 * Pure. `projectRoute` returns new frozen values and never touches the snapshot.
 */

import { projectRoute, requestedStop } from '../../model/car/estimateCost.js';
import type { CarSnapshot, RouteStop } from '../../model/car/types.js';
import type { CostTermDefinition, TermContext } from '../types.js';

/**
 * Where the route the car will actually fly starts, in metres above datum.
 *
 * The destination of the move in progress when the car is moving — it is committed to
 * arriving there — and the car's current height otherwise.
 */
export function routeStartHeightM(car: CarSnapshot): number {
  return car.motion === undefined ? car.heightM : car.motion.toHeightM;
}

/**
 * Total metres the car covers walking a route from `startHeightM`.
 *
 * The sum of the absolute height changes, in route order, so a route that goes up to 10 and
 * back down to 5 is charged for both legs. Height rather than floor count, deliberately: a
 * building with a double-height lobby has floors that cost twice as much to pass, and the
 * energy proxy has to know that.
 */
export function pathLengthM(startHeightM: number, route: readonly RouteStop[]): number {
  let total = 0;
  let heightM = startHeightM;
  for (const stop of route) {
    total += Math.abs(stop.heightM - heightM);
    heightM = stop.heightM;
  }
  return total;
}

/** Metres of travel this call would add to the car's route. Never negative. */
export function marginalDistanceM(context: TermContext): number {
  const car = context.car;
  const extra = requestedStop(car, context.request);
  /* c8 ignore next -- unreachable: stage 2 rejected any call the shaft does not serve. */
  if (extra === undefined) return 0;

  const startHeightM = routeStartHeightM(car);
  const baseline = pathLengthM(startHeightM, projectRoute(car));
  const projected = pathLengthM(startHeightM, projectRoute(car, extra));
  return Math.max(0, projected - baseline);
}

/** `distanceTravelled: 1.0` alone is the nearest-car dispatcher. */
export const distanceTravelledTerm: CostTermDefinition = Object.freeze({
  id: 'distanceTravelled',
  unit: 'm',
  measures: 'Metres of travel added',
  // Everyday Mode's words for this term — engine contract §6.3, issue #147. Two readers,
  // two vocabularies: `measures` stays addressed to an optimizer, these to a player.
  player: Object.freeze({
    name: 'distance travelled',
    serves: 'energy, roughly',
    atZero: 'run the motors hard',
    atFull: 'save the motors',
  } as const),
  normalization: Object.freeze({ mode: 'saturating', scale: 'distanceM' } as const),
  evaluate: marginalDistanceM,
});
