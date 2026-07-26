/**
 * The one route projection the Phase 5 terms share.
 *
 * Four of the nine new terms price the *difference* the call makes to the route the car was
 * already going to fly — who gets there later (`detourPenalty`), whose landing call gets pushed
 * back (`starvation`), how many stops appear (`stopCount`), how full the car is when it gets
 * there (`crowding`). All four want the same two projections:
 *
 * ```
 * baseline   = projectRoute(car)              the route without the call
 * projected  = projectRoute(car, requested)   the route with it
 * ```
 *
 * `TermContext.estimate` cannot supply them. It carries the three *scalars*
 * `Car.estimateCost()` promises — an ETA, a summed marginal delay, a resulting load factor —
 * and deliberately not the route they were derived from, because a `CostEstimate` is the
 * car's public contract and widening it to carry a route would make every consumer of that
 * contract depend on the projection's internal shape. So the terms re-derive it, once,
 * together.
 *
 * ## The memo, and why it does not compromise purity
 *
 * `scoreCar` builds **one {@link TermContext} per (car, call)** and hands the same object to
 * every term, so a `WeakMap` keyed on that object collapses four terms' worth of projections
 * into one pair. This is a memo, not state:
 *
 * - the key is a `TermContext`, whose `car` is a frozen `CarSnapshot` and whose `request` is a
 *   frozen `CostRequest` — the inputs cannot change under the cache;
 * - `projectRoute` is pure, so the cached value is exactly what a recomputation would give;
 * - nothing observable depends on whether an entry was present. Remove the `WeakMap` and every
 *   number in this package is bit-identical. `routeComparison.test.ts` asserts that directly by
 *   comparing a cached read against a freshly computed one.
 *
 * It is `WeakMap` rather than `Map` so a finished decision's contexts are collectable; a
 * long-running replication makes millions of them.
 *
 * Pure throughout: no clock, no RNG, no mutation of anything passed in.
 */

import { projectRoute, requestedStop } from '../../model/car/estimateCost.js';
import type { CommittedStop, RouteStop } from '../../model/car/types.js';
import type { TermContext } from '../types.js';

/* -------------------------------------------------------------------------- *
 * Shape
 * -------------------------------------------------------------------------- */

/** A stop the car had already committed to that the new call would push back. */
export interface DelayedStop {
  /** The stop as the **baseline** route reached it. */
  readonly stop: RouteStop;
  /** Seconds later the projected route reaches it. Strictly positive. */
  readonly addedSeconds: number;
}

/** The route with the call, the route without it, and the differences between them. */
export interface RouteComparison {
  /** The route the car flies if it does not take the call. */
  readonly baseline: readonly RouteStop[];
  /** The route the car flies if it does. */
  readonly projected: readonly RouteStop[];
  /**
   * The stop the call would add, as the projected route reaches it.
   *
   * `undefined` only when the shaft does not serve the call floor, which stage 2 has already
   * rejected — so no term reaches it in a real decision, and one that does must score zero
   * rather than guess.
   */
  readonly requested: RouteStop | undefined;
  /** The requested stop as a committed stop, before projection. */
  readonly requestedStop: CommittedStop | undefined;
  /** Every already-committed stop the call pushes back, in baseline route order. */
  readonly delayed: readonly DelayedStop[];
  /**
   * `projected.length - baseline.length`: stops the call adds to the route, `0` or `1`.
   *
   * One, unless the call floor was already a stop — a floor with both a car call and a hall
   * call is one stop, not two, which is `withStop`'s merge rule and the reason this is read
   * off the projection rather than assumed.
   */
  readonly addedStops: number;
  /**
   * Mass aboard when the doors open at the call floor and the waiting passengers may step in,
   * kilograms.
   *
   * Everyone bound for a floor the car reaches first has alighted, **and so has everyone bound
   * for the call floor itself**: out first, then in, which is the order the run transfers
   * people in and the same order `estimateCost` projects the resulting load in.
   */
  readonly massOnArrivalKg: number;
}

/* -------------------------------------------------------------------------- *
 * The memo
 * -------------------------------------------------------------------------- */

const MEMO = new WeakMap<TermContext, RouteComparison>();

/**
 * The two routes and their differences, computed once per {@link TermContext}.
 *
 * @returns a frozen value. Repeated calls with the same context return the identical object.
 */
export function routeComparison(context: TermContext): RouteComparison {
  const memoized = MEMO.get(context);
  if (memoized !== undefined) return memoized;
  const computed = compareRoutes(context);
  MEMO.set(context, computed);
  return computed;
}

/**
 * {@link routeComparison} without the memo, for the test that proves the memo changes nothing.
 *
 * Exported for exactly that purpose. Production code should call the memoized form.
 */
export function compareRoutes(context: TermContext): RouteComparison {
  const car = context.car;
  const extra = requestedStop(car, context.request);
  const baseline = projectRoute(car);

  if (extra === undefined) {
    /* c8 ignore next 11 -- unreachable: stage 2 rejected any call the shaft does not serve. */
    return Object.freeze({
      baseline,
      projected: baseline,
      requested: undefined,
      requestedStop: undefined,
      delayed: Object.freeze([]),
      addedStops: 0,
      massOnArrivalKg: Math.max(0, car.load.massKg),
    });
  }

  const projected = projectRoute(car, extra);
  const arrivalByFloorId = new Map<string, number>();
  for (const leg of projected) arrivalByFloorId.set(leg.floorId, leg.arrivalSeconds);

  const delayed: DelayedStop[] = [];
  for (const leg of baseline) {
    const after = arrivalByFloorId.get(leg.floorId);
    /* c8 ignore next -- every baseline floor survives into the projected route. */
    if (after === undefined) continue;
    const addedSeconds = after - leg.arrivalSeconds;
    if (addedSeconds > 0) delayed.push(Object.freeze({ stop: leg, addedSeconds }));
  }

  const requested = projected.find((leg) => leg.floorId === extra.floorId);
  let massKg = car.load.massKg;
  if (requested !== undefined) {
    for (const leg of projected) {
      if (leg.order > requested.order) break;
      massKg -= leg.alightingMassKg;
    }
  }

  return Object.freeze({
    baseline,
    projected,
    requested,
    requestedStop: extra,
    delayed: Object.freeze(delayed),
    addedStops: projected.length - baseline.length,
    massOnArrivalKg: Math.max(0, massKg),
  });
}
