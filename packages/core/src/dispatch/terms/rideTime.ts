/**
 * `rideTime` — estimated in-car time for the new passenger. Serves TTD.
 *
 * The raw value is seconds aboard: from the moment the car leaves the pickup floor to the
 * moment it is levelled at the passenger's destination, charging every stop the car makes in
 * between with the real door time and the real jerk-limited travel between them.
 *
 * ```
 * raw = arrival(destination), projected from the pickup, once the passenger is aboard
 * ```
 *
 * Measuring from *departure* rather than arrival is deliberate — the pickup dwell is when the
 * passenger boards, and it is already charged inside `waitTime`'s ETA. Counting it twice would
 * make a heavily-loading lobby stop look worse to a `rideTime`-weighted profile than to a
 * `waitTime`-weighted one for no physical reason.
 *
 * ## Two projections, because a car call does not exist until somebody presses it
 *
 * This term is priced in two legs, and **one projection cannot do it**:
 *
 * 1. `projectRoute(car, pickup)` — the car's real route with the landing folded in. It answers
 *    when the doors shut at the pickup floor, and which committed stops are still outstanding
 *    at that moment.
 * 2. `projectRoute(atPickup, destination)` — the route onward from the pickup floor, with the
 *    outstanding stops and the car call the passenger presses on boarding. Its arrival at the
 *    destination *is* the seconds aboard, because leg 2 starts the clock at the pickup.
 *
 * The reason is precedence. `projectRoute` sequences stops **geometrically** — everything ahead
 * in the current direction, then everything behind, one reversal — and it knows nothing about
 * pickup-before-dropoff. Fold both the pickup and the destination into a single projection and
 * roughly half the (car, call, destination) triples come back with the destination ordered
 * *before* the pickup: a car idle at floor 10 asked for a call at 5 going up to 15 projects as
 * `15 → 5`, because 15 is ahead of a car that set off upwards. Subtracting then gives a
 * negative number, and the clamp that kept the term non-negative turned the **longest** rides
 * into 0 — the best possible value. That was this term rewarding the ride it exists to punish.
 *
 * Measured over 5040 (car, pickup, destination) triples on `midtown-office` — four cars, three
 * truncation points, every served floor against every other: the single projection clamped
 * **2520 of them, exactly half, to zero**, and the two-leg projection returns a positive ride for
 * every one of those. On the other 2520, where the geometry happened to order the two stops
 * correctly, the two algorithms agree to the last bit. The fix does not re-price a case that
 * already worked; it stops the term lying about the half where the ordering reversed.
 *
 * Leg 2 is not a repair for that case; it is the honest model of every case. The destination
 * car call is registered when the passenger boards, so it cannot be reached before the pickup,
 * and a route projected from the pickup cannot express that it was.
 *
 * ## What this term does not charge, and which term does
 *
 * A car that must reverse to collect the passenger pays nothing extra **here**: the car in the
 * example above and one idle at floor 0 both take the passenger 5 → 15, so both rides are
 * 24.0 s to the millisecond, and their equal ETAs make them equal on `waitTime` too. In-car
 * seconds are a property of the journey from the pickup, not of how the car got there. The
 * approach is priced by `directionReversal` and its metres by `distanceTravelled`; charging it
 * again here would double-count it and would make `rideTime` a worse `distanceTravelled`.
 *
 * ## Zero when the destination is unknown, and that is the point
 *
 * Under `dispatch.callType: up-down-buttons` a landing call carries no destination, so nobody
 * — not this term, not the car — can say how long the passenger will be aboard. The term
 * returns 0 and contributes nothing, and `weights.rideTime` declares exactly that as its
 * `activeWhen` so a Phase 7 optimizer does not spend replications on a dimension that cannot
 * move a decision (CLAUDE.md invariant 8).
 *
 * That is not a gap to be papered over with a proxy. The obvious proxy is a uniform
 * destination prior, the same equal-probability assumption the Barney/CIBSE round-trip-time
 * calculation makes (`analytical/roundTripTime.ts`). It would be arithmetically respectable
 * and **operationally useless**: the expected non-stop ride from a given pickup floor to a
 * uniformly random destination is a property of the *shaft*, identical for every candidate
 * car, and a term with the same value for every car cannot change a decision. It would add a
 * cost number that moves nothing, which is strictly worse than adding nothing — a Phase 7
 * optimizer would spend real replications on `weights.rideTime` and a noisy objective would
 * happily attribute a difference to it.
 *
 * So the term is live exactly when the information exists, which is under `destination-entry`
 * and `mobile-credential`. **The gap is the measurement**: docs/06 § Stage 1 says moving
 * information earlier is the entire source of destination dispatch's advantage, and a term
 * that can only be priced once the destination is known is one of the places that advantage
 * shows up.
 *
 * Pure: `projectRoute` and `requestedStop` return new frozen values, and the snapshot taken at
 * the pickup is a new frozen record — the same technique `lifecycle.withBypassOverridden` uses.
 */

import { projectRoute, requestedStop } from '../../model/car/estimateCost.js';
import {
  shaftFloor,
  type CarSnapshot,
  type CommittedStop,
  type RouteStop,
} from '../../model/car/types.js';
import type { Direction } from '../../model/types.js';
import type { CostTermDefinition, TermContext } from '../types.js';

/** A projected leg back as the plain commitment it came from, without the projection's times. */
function committedStopOf(leg: RouteStop): CommittedStop {
  return Object.freeze({
    floorId: leg.floorId,
    floorIndex: leg.floorIndex,
    heightM: leg.heightM,
    carCall: leg.carCall,
    hallCall: leg.hallCall,
    hallCallDirections: leg.hallCallDirections,
    registeredAt: leg.registeredAt,
    alightingCount: leg.alightingCount,
    alightingMassKg: leg.alightingMassKg,
    boardingCount: leg.boardingCount,
  });
}

/**
 * Which way the car is travelling as it pulls away from the pickup.
 *
 * Inherited from the leg it arrived on rather than re-derived from what is left to do, because
 * that is what a collective car does: one heading up with a stop above it finishes upwards and
 * comes back for a destination below, and `orderStops` can only say so if it is told the
 * direction. It matters only when stops remain on both sides — with one stop left, every
 * direction produces the same route.
 */
function departureDirection(
  car: CarSnapshot,
  route: readonly RouteStop[],
  boarded: RouteStop,
): Direction | undefined {
  const previous = route.find((leg) => leg.order === boarded.order - 1);
  const fromIndex = previous?.floorIndex ?? car.motion?.toFloorIndex ?? car.floorIndex;
  // Picked up where the car already was: it has no arrival leg to inherit from, so its own run
  // direction stands, and an idle car keeps `undefined` and lets the projection choose.
  if (boarded.floorIndex === fromIndex) return car.motion?.direction ?? car.direction;
  return boarded.floorIndex > fromIndex ? 'up' : 'down';
}

/**
 * The same car, standing at the pickup floor with the doors just shut and the passenger aboard.
 *
 * A **new frozen snapshot**, never a mutation (CLAUDE.md invariant 1). Its `stops` are the
 * commitments still outstanding at that moment — the legs the first projection put *after* the
 * pickup — so the ride is charged for the stops the passenger really sits through and not for
 * the ones the car had already made before they boarded.
 *
 * The load is carried over unchanged, and deliberately not projected forward: `projectRoute`
 * prices time, and the only passenger figures it reads are the per-stop counts that set each
 * dwell. `resultingLoadFactor` is `estimateCost`'s business and `loadFactor`'s, not this term's.
 */
function snapshotAtPickup(
  car: CarSnapshot,
  route: readonly RouteStop[],
  boarded: RouteStop,
): CarSnapshot {
  const departsAt = car.at + boarded.departureSeconds;
  return Object.freeze({
    ...car,
    at: departsAt,
    floorId: boarded.floorId,
    floorIndex: boarded.floorIndex,
    heightM: boarded.heightM,
    direction: departureDirection(car, route, boarded),
    // Standing, doors shut: the move in progress has been served and the pickup dwell is spent.
    // Both are what stops leg 2 charging any part of leg 1 a second time.
    motion: undefined,
    door: Object.freeze({
      ...car.door,
      state: 'closed' as const,
      since: departsAt,
      openFractionAtSince: 0,
    }),
    stops: Object.freeze(
      route
        .filter((leg) => leg.order > boarded.order)
        .map(committedStopOf)
        .sort((a, b) => a.floorIndex - b.floorIndex),
    ),
  });
}

/** Seconds the new passenger would spend aboard. `0` when the destination is not known. */
export function rideTimeSeconds(context: TermContext): number {
  const car = context.car;
  const destinationFloorId = context.request.destinationFloorId;
  if (destinationFloorId === undefined) return 0;
  if (destinationFloorId === context.request.floorId) return 0;

  const pickup = requestedStop(car, context.request);
  /* c8 ignore next -- unreachable: stage 2 rejected any call the shaft does not serve. */
  if (pickup === undefined) return 0;
  /* c8 ignore next -- unreachable: stage 2 rejected an unserved destination too. */
  if (shaftFloor(car.shaft, destinationFloorId) === undefined) return 0;

  // Leg 1 — the car's own route with the landing folded in, through `projectRoute`'s own merge
  // so a floor the car already stops at is priced once and keeps the larger boarding count.
  const boarding = projectRoute(car, pickup);
  const boarded = boarding.find((leg) => leg.floorId === pickup.floorId);
  /* c8 ignore next -- the pickup is in the route that was built from it. */
  if (boarded === undefined) return 0;

  // Leg 2 — from the pickup, with the car call the passenger presses on boarding. It loads
  // nobody and lands nobody; it is simply where they get out.
  const atPickup = snapshotAtPickup(car, boarding, boarded);
  const alighting = requestedStop(atPickup, { floorId: destinationFloorId, kind: 'car' });
  /* c8 ignore next -- `shaftFloor` above already proved the shaft serves it. */
  if (alighting === undefined) return 0;

  const arrived = projectRoute(atPickup, alighting).find(
    (leg) => leg.floorId === destinationFloorId,
  );
  /* c8 ignore next -- the destination is in the route that was built from it. */
  if (arrived === undefined) return 0;

  // Already non-negative — leg 2's clock starts at the pickup — and asserted as the contract
  // `scoreCar` enforces rather than as a repair for an ordering this projection cannot produce.
  return Math.max(0, arrived.arrivalSeconds);
}

/**
 * Seconds, on the same saturating reference as `waitTime`: both are passenger time, and a
 * 60 s ride costing the same as a 60 s wait is the statement an author can argue with.
 *
 * `activeWhen` is not decoration: under `up-down-buttons` — the default, and every profile that
 * does not say otherwise — no landing call carries a destination, so this term returns 0 for
 * every car and its weight is a dead search dimension. Declaring the condition is what lets a
 * generic optimizer skip it (docs/06 § The parameter schema).
 */
export const rideTimeTerm: CostTermDefinition = Object.freeze({
  id: 'rideTime',
  unit: 's',
  measures: 'Estimated in-car time for the new passenger',
  normalization: Object.freeze({ mode: 'saturating', scale: 'waitTimeS' } as const),
  activeWhen: Object.freeze({
    'dispatch.callType': Object.freeze(['destination-entry', 'mobile-credential']),
  }),
  evaluate: rideTimeSeconds,
});
