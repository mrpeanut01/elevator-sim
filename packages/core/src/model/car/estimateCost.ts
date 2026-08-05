/**
 * The pure cost query — "the interface that decides everything"
 * (docs/01-architecture.md § The interface that decides everything).
 *
 * Every smart dispatch behaviour in this project is downstream of this file. The dispatcher
 * calls it thousands of times per decision to evaluate hypotheticals it will not commit to,
 * so **CLAUDE.md invariant 1 is the design constraint**: no mutation of any simulation
 * state, no random draw, no scheduled event.
 *
 * ## How purity is guaranteed, rather than promised
 *
 * It is structural, not a comment. This module exports free functions whose only inputs are
 * a frozen {@link CarSnapshot} and a {@link CostRequest}:
 *
 * - It **never imports `car.js`**. The dependency runs one way — `car.ts` imports this file
 *   — so there is no type here through which a `Car` could be reached, let alone mutated.
 * - A `CarSnapshot` is a plain value: no methods, no back-reference to its car, no `Rng`, no
 *   `EventScheduler`. There is no handle to mutate through.
 * - It **never imports `random/`**, so it cannot draw from a stream even by accident, and it
 *   never imports the kernel's scheduler.
 * - Everything it calls from `physics/` — `travelTime`, `advanceDoor`, `nominalStopSeconds`
 *   — is itself documented pure and returns new values rather than mutating.
 *
 * The acceptance test in `estimateCost.test.ts` closes the loop from the other side: ten
 * thousand calls, and the car's complete serialized state is compared byte for byte
 * (docs/05-roadmap.md § Phase 1).
 *
 * ## What the ETA actually accounts for
 *
 * Not `distance / ratedSpeed`. That is the exact error this project exists to avoid: a short
 * hop never reaches rated speed, so dividing by it makes a 2.5 m/s car look 2.5x better than
 * a 1.0 m/s car in a six-storey building, and every conclusion downstream inherits the
 * optimism (docs/02-elevator-reference.md § Motion parameters).
 *
 * The projection walks the car's whole route and charges, for each leg:
 *
 * ```
 * motorStartDelayS                       brake lift and torque build
 * + travelTime(distance, constraints)    the real jerk-limited S-curve
 * + levelingSettleS                      levelling into the floor
 * ```
 *
 * and at each stop `openS + dwell + closeS`, where the dwell is whatever the door machine
 * says for that stop's reasons — including the passenger-transfer term, so a stop where
 * eight people get off costs what eight people getting off costs.
 *
 * ## Route order is geometry, not policy
 *
 * The car serves its committed stops in the order it physically reaches them: everything
 * ahead in the current direction of travel, in shaft order, then everything behind, in
 * reverse shaft order. That is one reversal, and it is the only sequencing a car controller
 * can claim as its own.
 *
 * What is deliberately **absent** is directional collective — skipping a down hall call while
 * travelling up, to answer it on the way back. That is a dispatch decision, and this project
 * models it as one: `collective` is a weight vector with a `noDirectionReversal` hard
 * constraint in `data/dispatcher-profiles.json`, not a behaviour compiled into the car
 * (CLAUDE.md invariant 7). A car prices the stops it was actually given, in the order it will
 * actually reach them.
 */

import type { SimTime } from '../../kernel/types.js';
import {
  advanceDoor,
  nextDoorTransitionAt,
  nominalStopSeconds,
  type DoorConfig,
  type DoorMachineState,
  type DoorStopReason,
} from '../../physics/doors/index.js';
import { travelTime } from '../../physics/motion/index.js';
import { acceptsCarCalls, acceptsHallCalls, type Direction } from '../types.js';

import {
  deckOfFloor,
  deckSlot,
  isAccessPermitted,
  shaftFloor,
  stopFloorIdOf,
  type CarMotion,
  type CarSnapshot,
  type CommittedStop,
  type CostEstimate,
  type CostRequest,
  type DeckStopSplit,
  type InfeasibilityReason,
  type RouteStop,
  type ServedFloor,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Feasibility
 * -------------------------------------------------------------------------- */

/**
 * Why this car cannot serve the request, or `undefined` if it can.
 *
 * The order of the checks is the order of the reasons in `INFEASIBILITY_REASONS`, and it is
 * chosen so the *most structural* answer wins: a car whose shaft does not reach floor 30
 * reports `serviceZone` whether or not it is also overloaded, because retuning a threshold
 * will never make it reach floor 30.
 *
 * ## Access zoning is asked about the destination, and only about the destination
 *
 * There is **one** access question here, not two, and it is check 3: *may this credential
 * reach the floor this passenger is going to?* The floor they are being collected **from** is
 * not an access question at all, and asking it was this module's most expensive defect
 * (DECISIONS.md § D254).
 *
 * A credential governs *where you may go*, never *where you may be collected*. Someone
 * standing on floor 40 pressing "down" is already through whatever control protects floor 40
 * — a badged lobby door, a turnstile, a reception desk — and the lift has nothing left to
 * authorize. That is also what the hardware does: under conventional control the reader is
 * **inside the car** and gates the car-call buttons (CIBSE Guide D § 10 on security and lift
 * control), and under destination control the landing terminal takes credential and
 * destination together and gates the *destination* (ISO 8100-32). No installation of either
 * kind refuses to collect somebody from the floor they are standing on; refusing would make
 * a restricted floor uneavacuable by lift, which no code permits.
 *
 * The consequence of asking it here was total rather than marginal. Under
 * `dispatch.callType: 'up-down-buttons'` a landing call carries no credential *by
 * construction* — `costRequestFor` drops it — and `isAccessPermitted` answers `false` for an
 * undefined credential against any floor that declares `permittedCredentialGroups`. So every
 * car in the bank refused every landing call raised on a restricted floor, and every
 * access-zoned building was unserviceable by every conventional dispatcher: 642 of 725
 * delivered on `mixed-use-high-rise`, against 725 of 725 with the same seed and the same
 * dispatcher once the zones are stripped.
 *
 * **This does not loosen the credential model, because the credential model was never here.**
 * The runner enforces it per passenger with the passenger's real credential, at the landing
 * (`Simulation.#bankCanCarry`) and again at the doorway (`Simulation.#carCanCarry`), so a
 * rider whose destination their badge does not reach is refused whether or not a dispatcher
 * ever priced their call. Check 3 authorizes a *disclosed* destination one step earlier than
 * that, which is the whole of what a destination call type buys.
 *
 * Pure.
 */
export function infeasibilityOf(
  snapshot: CarSnapshot,
  request: CostRequest,
): InfeasibilityReason | undefined {
  const isHallCall = (request.kind ?? 'hall') === 'hall';

  // 1. Service mode. Only `in-service` takes hall calls; `independent` still honours the
  //    car calls pressed inside it, which is the entire point of the mode.
  if (isHallCall ? !acceptsHallCalls(snapshot.mode) : !acceptsCarCalls(snapshot.mode)) {
    return 'serviceMode';
  }

  // 2. Service zoning — physical. No credential or dispatcher weight overrides it.
  //    Asked about the pickup floor, because that *is* a physical question: a shaft that does
  //    not open onto floor 30 cannot collect anybody from floor 30.
  if (shaftFloor(snapshot.shaft, request.floorId) === undefined) {
    return 'serviceZone';
  }

  // 3. The destination, when the call type discloses one — service zoning and access zoning
  //    on it, kept as two answers. See the header: this is the only place access zoning is
  //    asked, and the pickup floor is deliberately not asked about.
  //
  //    Checking it here is what lets a destination dispatcher
  //    authorize and optimize in one step.
  //
  //    **That is a description of this function and it is true. It is not a claim that the one
  //    step is why destination dispatch performs better**, which is false — measured, the
  //    destination buys *less* where access is controlled (DECISIONS.md § D30, § D60). The
  //    distinction is asserted in both directions by
  //    `experiments/validation/documentation.test.ts`.
  const destinationFloorId = request.destinationFloorId;
  if (destinationFloorId !== undefined) {
    if (shaftFloor(snapshot.shaft, destinationFloorId) === undefined) {
      return 'destinationServiceZone';
    }
    if (!isAccessPermitted(snapshot.shaft, request.credentialGroup, destinationFloorId)) {
      return 'destinationAccessDenied';
    }
  }

  // 4. The load cell. Overload first: it is the stronger condition and the more actionable
  //    report — a car that will not start is not merely declining new work.
  if (snapshot.load.isOverloaded) {
    return 'overload';
  }
  if (isHallCall && snapshot.load.isBypassingHallCalls) {
    return 'hallCallBypass';
  }

  return undefined;
}

/* -------------------------------------------------------------------------- *
 * Route projection
 * -------------------------------------------------------------------------- */

/**
 * The stop a request would add, priced with the boarding it declares.
 *
 * Returns `undefined` when the shaft does not serve the floor — a request that got this far
 * is feasible, so the only caller that sees `undefined` is one that skipped the feasibility
 * check.
 *
 * Pure.
 */
export function requestedStop(
  snapshot: CarSnapshot,
  request: CostRequest,
): CommittedStop | undefined {
  // **Where the dispatcher learns that a stop serves two floors.** The request names a landing
  // — floor 27 — and the stop it would add is at the car's *position* for that landing, 26. So
  // a car already committed to 26 prices 27 as a stop it is making anyway, and `withStop` merges
  // rather than appends. Without this normalization the estimator prices double-deck hardware as
  // single-deck: two approaches, two door cycles, twice the marginal delay.
  //
  // Identity on a single-deck shaft, so no conventional bank's price moves.
  const floor = shaftFloor(snapshot.shaft, stopFloorIdOf(snapshot.shaft, request.floorId));
  if (floor === undefined) return undefined;

  const isHallCall = (request.kind ?? 'hall') === 'hall';
  // A car call loads nobody: the passenger who pressed it is already aboard. Only a landing
  // call brings mass and transfer time with it.
  const boardingCount = Math.max(
    0,
    request.boardingPassengers ?? (isHallCall ? snapshot.assumedBoardingPassengers : 0),
  );

  const slot = deckSlot(deckOfFloor(snapshot.shaft, request.floorId));
  const deckSplit: DeckStopSplit | undefined = snapshot.shaft.isDoubleDeck
    ? Object.freeze({
        movers: Object.freeze(slot === 0 ? [boardingCount, 0] : [0, boardingCount]) as readonly [
          number,
          number,
        ],
        boarding: Object.freeze(slot === 0 ? [boardingCount, 0] : [0, boardingCount]) as readonly [
          number,
          number,
        ],
      })
    : undefined;

  return Object.freeze({
    floorId: floor.id,
    floorIndex: floor.index,
    heightM: floor.heightM,
    carCall: !isHallCall,
    hallCall: isHallCall,
    hallCallDirections:
      isHallCall && request.direction !== undefined
        ? Object.freeze([request.direction])
        : Object.freeze([]),
    registeredAt: request.registeredAt ?? snapshot.at,
    alightingCount: 0,
    alightingMassKg: 0,
    boardingCount,
    ...(deckSplit === undefined ? {} : { deckSplit }),
  });
}

/** Fold a hypothetical stop into the committed set, merging when the floor is already one. */
function withStop(
  stops: readonly CommittedStop[],
  extra: CommittedStop | undefined,
): readonly CommittedStop[] {
  if (extra === undefined) return stops;

  const merged: CommittedStop[] = [];
  let found = false;
  for (const stop of stops) {
    if (stop.floorId !== extra.floorId) {
      merged.push(stop);
      continue;
    }
    found = true;
    // Is this the *same button* the car already holds, or a second group of people?
    //
    // Same button: a hall request whose directions the stop already carries. Reassignment and
    // hysteresis both re-score calls a car is already committed to, and adding the boarders
    // again each time would make a committed car look progressively worse the more often it
    // was reconsidered. A request that declares **no** direction counts as the same button
    // too, whenever the floor already carries any hall call: a bare `{ floorId }` names a
    // landing, not a second queue at it, and treating it as new was the mirror error — the
    // one re-price the car could not distinguish was silently double-counted.
    //
    // Different button: the opposite direction at the same floor, or a hall request at a
    // floor whose only commitment is a car call. Those really are extra people.
    const sameButton =
      extra.hallCall &&
      stop.hallCall &&
      (extra.hallCallDirections.length === 0 ||
        extra.hallCallDirections.every((direction) => stop.hallCallDirections.includes(direction)));

    merged.push(
      Object.freeze({
        ...stop,
        carCall: stop.carCall || extra.carCall,
        hallCall: stop.hallCall || extra.hallCall,
        // Up before down, so the merged array is a function of the set and not of the order
        // the two came in.
        hallCallDirections: Object.freeze(
          (['up', 'down'] as const).filter(
            (d) => stop.hallCallDirections.includes(d) || extra.hallCallDirections.includes(d),
          ),
        ),
        registeredAt: Math.min(stop.registeredAt, extra.registeredAt),
        // The same button is re-priced at the **larger** of the two counts, never dropped to
        // the one already on file. The stop the car holds carries `assumedBoardingPassengers`
        // — the number a bare up/down button implies, because nobody counted — so a dispatcher
        // that *has* counted the queue and says `boardingPassengers: 10` must move the price.
        // Discarding it (the bug this replaced) under-priced the incumbent car's own committed
        // call by the whole transfer term, and did so more the busier the floor really was:
        // exactly backwards, and enough to make reassignment stick to the wrong car.
        boardingCount: sameButton
          ? Math.max(stop.boardingCount, extra.boardingCount)
          : stop.boardingCount + extra.boardingCount,
        // The per-deck split follows the same rule, per deck. A request at 27 folded into a
        // stop already committed at 26 adds its boarders to the *upper* deck and leaves the
        // lower one alone — which is exactly why the merged stop's dwell does not grow: the
        // lower deck was already the busier one.
        ...(stop.deckSplit === undefined && extra.deckSplit === undefined
          ? {}
          : { deckSplit: mergeDeckSplits(stop.deckSplit, extra.deckSplit, sameButton) }),
      }),
    );
  }
  if (!found) merged.push(extra);
  return merged;
}

const ZERO_SPLIT: DeckStopSplit = Object.freeze({
  movers: Object.freeze([0, 0]) as readonly [number, number],
  boarding: Object.freeze([0, 0]) as readonly [number, number],
});

/** Deck-wise `withStop`: `max` for the same button, `+` for a second group of people. */
function mergeDeckSplits(
  a: DeckStopSplit | undefined,
  b: DeckStopSplit | undefined,
  sameButton: boolean,
): DeckStopSplit {
  const left = a ?? ZERO_SPLIT;
  const right = b ?? ZERO_SPLIT;
  const combine = (x: number, y: number): number => (sameButton ? Math.max(x, y) : x + y);
  return Object.freeze({
    movers: Object.freeze([
      combine(left.movers[0], right.movers[0]),
      combine(left.movers[1], right.movers[1]),
    ]) as readonly [number, number],
    boarding: Object.freeze([
      combine(left.boarding[0], right.boarding[0]),
      combine(left.boarding[1], right.boarding[1]),
    ]) as readonly [number, number],
  });
}

/**
 * Direction to set off in when the car is standing still with work to do.
 *
 * Nearest stop by **height** — the physical cost of getting there — with a tie broken
 * towards the higher floor so the choice is total and reproducible rather than dependent on
 * array order. Exported so the car and the projection cannot drift apart on it: `Car` uses
 * it to settle its run direction, and `projectRoute` to fill in a missing one.
 *
 * Pure. Returns `up` for an empty stop set, which no caller relies on.
 */
export function directionTowardNearestStop(
  stops: readonly CommittedStop[],
  startIndex: number,
  startHeightM: number,
): Direction {
  let best: CommittedStop | undefined;
  for (const stop of stops) {
    if (stop.floorIndex === startIndex) continue;
    if (best === undefined) {
      best = stop;
      continue;
    }
    const distance = Math.abs(stop.heightM - startHeightM);
    const bestDistance = Math.abs(best.heightM - startHeightM);
    if (distance < bestDistance || (distance === bestDistance && stop.floorIndex > best.floorIndex)) {
      best = stop;
    }
  }
  return best === undefined || best.floorIndex > startIndex ? 'up' : 'down';
}

/**
 * The stops in the order the car physically reaches them: this floor, then everything ahead
 * in `direction` in shaft order, then everything behind in reverse shaft order.
 *
 * One reversal. See the module docstring for why directional collective is not modelled here.
 */
function orderStops(
  stops: readonly CommittedStop[],
  startIndex: number,
  direction: Direction,
): readonly CommittedStop[] {
  const sign = direction === 'up' ? 1 : -1;
  const here: CommittedStop[] = [];
  const ahead: CommittedStop[] = [];
  const behind: CommittedStop[] = [];

  for (const stop of stops) {
    if (stop.floorIndex === startIndex) here.push(stop);
    else if (sign * (stop.floorIndex - startIndex) > 0) ahead.push(stop);
    else behind.push(stop);
  }

  ahead.sort((a, b) => sign * (a.floorIndex - b.floorIndex));
  behind.sort((a, b) => -sign * (a.floorIndex - b.floorIndex));

  return [...here, ...ahead, ...behind];
}

/** The door machine's view of why the car stops here, including the passenger-flow term. */
function stopReasonFor(snapshot: CarSnapshot, stop: CommittedStop): DoorStopReason {
  // Both decks open together and empty in parallel, so a paired stop takes the busier deck's
  // transfer, not the sum of the two. `deckSplit` is absent on every single-deck stop and the
  // expression below is then the sum it always was.
  const split = stop.deckSplit;
  const movers =
    split === undefined
      ? stop.alightingCount + stop.boardingCount
      : Math.max(split.movers[0], split.movers[1]);
  return {
    carCall: stop.carCall,
    hallCall: stop.hallCall,
    hallQueueLength:
      split === undefined ? stop.boardingCount : Math.max(split.boarding[0], split.boarding[1]),
    // The `2*P*tp` term of the Barney/CIBSE round-trip-time calculation, localised to one
    // stop. Without it, a lobby stop that loads twelve people is priced as a 5 s dwell and
    // the simulation comes out ~10 s short at every heavy floor.
    transferSeconds: movers * snapshot.passengerTransferS,
  };
}

/**
 * Seconds until the door finishes the stop it is in the middle of, `0` if it is already shut.
 *
 * Runs the real machine forward rather than re-deriving the timings: `advanceDoor` and
 * `nextDoorTransitionAt` are pure and return new values, so this reads the future without
 * touching the present. At most three transitions remain from any state
 * (`opening → open → closing → closed`), and the loop is bounded accordingly.
 *
 * The overload hold is deliberately **not** modelled here. An overloaded car is already
 * infeasible for new work, and pricing its route as infinite would make the whole projection
 * useless for the reassignment that has to move its committed calls elsewhere.
 */
function remainingDoorSeconds(
  door: DoorMachineState,
  at: SimTime,
  config: DoorConfig,
): number {
  if (door.state === 'closed') return 0;

  let state = advanceDoor(door, Math.max(at, door.since), config).state;
  let closesAt = at;
  for (let guard = 0; guard < 4 && state.state !== 'closed'; guard += 1) {
    const next = nextDoorTransitionAt(state, config);
    /* c8 ignore next -- only a `closed` door has no next transition, and the loop guards it. */
    if (next === undefined) break;
    closesAt = next;
    state = advanceDoor(state, next, config).state;
  }
  return Math.max(0, closesAt - at);
}

/**
 * The first stop of a route, if the car can really be cut short at it.
 *
 * "Really" is the whole point: at or beyond the commit point in the direction of travel, and
 * strictly short of where the car is already going. A stop at the destination is not a
 * diversion, and one behind the commit point is a stop the kernel would refuse — `Car.divertTo`
 * throws for exactly this case rather than rounding it off, so pricing one here would be
 * pricing a journey no car can make.
 */
function divertibleTo(
  first: CommittedStop | undefined,
  motion: CarMotion,
  frontier: ServedFloor,
): CommittedStop | undefined {
  if (first === undefined) return undefined;
  const sign = motion.direction === 'up' ? 1 : -1;
  if (sign * (first.floorIndex - frontier.index) < 0) return undefined;
  if (sign * (first.floorIndex - motion.toFloorIndex) >= 0) return undefined;
  return first;
}

/**
 * Where a car in flight would really end this run, given the stops it would then be holding.
 *
 * `undefined` in three distinct cases, and all three mean "no diversion": the car is not moving;
 * the profile forbids diversion, so the snapshot carries no `divertFrontierIndex` at all
 * (*presence is permission* — [`DECISIONS.md` § D205](../../../../../DECISIONS.md)); or nothing on
 * the route is reachable before the floor the car is already committed to. Otherwise it is the
 * first committed stop the kernel would actually cut the run short at, which is exactly what
 * `Simulation.#considerDiversion` will do.
 *
 * ## Why this is exported
 *
 * So `terms/diversionDetour.ts` can ask *"would serving this call truncate the run?"* against the
 * **same arithmetic the projection uses**. A term that priced a diversion `projectRoute` does not
 * make — or missed one it does — would be charging for a journey no car takes, and the resulting
 * weight would be tuned against a fiction.
 *
 * ## Why it re-derives rather than sharing {@link projectRoute}'s locals
 *
 * `projectRoute` has already computed the ordered stop list by the time it needs this answer, and
 * having it call this function instead would double `withStop` and `orderStops` on a path
 * `Car.estimateCost` runs thousands of times per decision. So the *decision rule* is shared — both
 * end in the same `divertibleTo` — and only the cheap setup is repeated.
 *
 * That duplication is a real risk of drift, so it is not left to inspection:
 * `estimateCost.test.ts` asserts the two agree on real snapshots, in both directions.
 *
 * Pure. Reads the snapshot; mutates nothing.
 */
export function runCutShortAt(
  snapshot: CarSnapshot,
  extra?: CommittedStop | undefined,
): CommittedStop | undefined {
  const motion = snapshot.motion;
  if (motion === undefined) return undefined;
  const frontier =
    snapshot.divertFrontierIndex === undefined
      ? undefined
      : snapshot.shaft.floorsByIndex.get(snapshot.divertFrontierIndex);
  if (frontier === undefined) return undefined;

  const stops = withStop(snapshot.stops, extra);
  if (stops.length === 0) return undefined;

  // Exactly `projectRoute`'s start-of-route for a moving car with a commit point: the route begins
  // at the frontier, headed the way the car is already going.
  const direction =
    motion.direction ?? directionTowardNearestStop(stops, frontier.index, frontier.heightM);
  return divertibleTo(orderStops(stops, frontier.index, direction)[0], motion, frontier);
}

/**
 * Walk the car's route and time every stop on it.
 *
 * Pass `extra` to price a hypothetical: the stop is folded into the committed set (merging if
 * the floor is already a stop) and the whole route is re-timed around it. Nothing is
 * mutated — `snapshot.stops` is read, never written, and the returned stops are new frozen
 * values.
 *
 * All times are **relative to `snapshot.at`**, in seconds.
 */
export function projectRoute(
  snapshot: CarSnapshot,
  extra?: CommittedStop | undefined,
): readonly RouteStop[] {
  const stops = withStop(snapshot.stops, extra);
  if (stops.length === 0) return Object.freeze([]);

  const motion = snapshot.motion;
  const moving = motion !== undefined;

  // Where the route starts — the floor the sequencing question is asked from.
  //
  // A car in flight is normally committed to its destination: it cannot stop short, so that is
  // where its route begins however far away it is. Under `eligibility.enRouteDiversion` the
  // snapshot carries a **commit point** instead (`divertFrontierIndex`, absent when the
  // profile forbids diversion), and the route begins there, because `Simulation.#considerDiversion`
  // will really cut the run short at the first committed stop beyond it.
  //
  // Both halves are needed and only one would be worse than neither. An eligibility filter
  // that admits an en-route stop while this function still prices it as "fly to the lobby,
  // turn round, come back up" makes the right car eligible and permanently uncompetitive — the
  // call is legal for it and always cheaper for somebody else, so the behaviour never appears
  // and the setting looks inert.
  const frontier =
    moving && snapshot.divertFrontierIndex !== undefined
      ? snapshot.shaft.floorsByIndex.get(snapshot.divertFrontierIndex)
      : undefined;
  const startIndex = moving ? (frontier?.index ?? motion.toFloorIndex) : snapshot.floorIndex;
  const startHeightM = moving ? (frontier?.heightM ?? motion.toHeightM) : snapshot.heightM;
  const direction =
    (moving ? motion.direction : snapshot.direction) ??
    directionTowardNearestStop(stops, startIndex, startHeightM);

  const ordered = orderStops(stops, startIndex, direction);

  // Time already owed before the car can begin the route: finishing the move it is in, or
  // finishing the stop it is at.
  let seconds = 0;
  let heightM = snapshot.heightM;
  let servingHere = false;

  if (moving) {
    // Where the run actually ends, which is the first committed stop it can be cut short at
    // rather than the floor it was last commanded to. `divertibleTo` is `undefined` when
    // nothing on the route is reachable en route, and the run then plays out in full.
    const cutShortAt = frontier === undefined ? undefined : divertibleTo(ordered[0], motion, frontier);
    if (cutShortAt === undefined) {
      seconds = Math.max(0, motion.arrivesAt - snapshot.at);
      heightM = motion.toHeightM;
    } else {
      // Exactly `Car.divertTo`'s arithmetic, and exactly `departFor`'s: the diverted run keeps
      // its `startedAt`, so its arrival is that instant plus the *shorter* profile's duration
      // plus the levelling settle. Reconstructed here rather than shared because this is a
      // hypothetical — the car has not been diverted and must not be.
      seconds = Math.max(
        0,
        motion.startedAt +
          travelTime(cutShortAt.heightM - motion.fromHeightM, snapshot.constraints) +
          snapshot.levelingSettleS -
          snapshot.at,
      );
      // The loop below charges `stop.heightM - heightM`, so arriving here makes the first leg
      // free rather than double-charged.
      heightM = cutShortAt.heightM;
    }
  } else if (snapshot.door.state !== 'closed') {
    seconds = remainingDoorSeconds(snapshot.door, snapshot.at, snapshot.doorConfig);
    servingHere = true;
  }

  const legs: RouteStop[] = [];
  for (const stop of ordered) {
    // The stop the car is standing at with its doors already open is being served *now*: its
    // door time is the remaining-door-seconds already charged above, and charging a full
    // `open + dwell + close` on top would double-count the whole stop.
    if (servingHere && legs.length === 0 && stop.floorIndex === snapshot.floorIndex) {
      legs.push(
        Object.freeze({
          ...stop,
          order: 0,
          arrivalSeconds: 0,
          departureSeconds: seconds,
          requested: extra !== undefined && stop.floorId === extra.floorId,
        }),
      );
      continue;
    }

    const displacementM = stop.heightM - heightM;
    if (displacementM !== 0) {
      seconds +=
        snapshot.motorStartDelayS +
        travelTime(displacementM, snapshot.constraints) +
        snapshot.levelingSettleS;
      heightM = stop.heightM;
    }

    const arrivalSeconds = seconds;
    // The *nominal* stop — open, dwell, close, no reopens. Reopens are stochastic and are
    // decided by the caller from the `doorObstruction` stream; charging an expected number of
    // them here would either require a random draw (breaking purity and common random
    // numbers) or bake a constant into the estimate that the door machine could not honour.
    seconds += nominalStopSeconds(snapshot.doorConfig, stopReasonFor(snapshot, stop));

    legs.push(
      Object.freeze({
        ...stop,
        order: legs.length,
        arrivalSeconds,
        departureSeconds: seconds,
        requested: extra !== undefined && stop.floorId === extra.floorId,
      }),
    );
  }

  return Object.freeze(legs);
}

/* -------------------------------------------------------------------------- *
 * The estimate
 * -------------------------------------------------------------------------- */

/** An infeasible answer. `Infinity` so a scorer that ignores `feasible` still ranks it last. */
function infeasible(snapshot: CarSnapshot, reason: InfeasibilityReason): CostEstimate {
  return Object.freeze({
    feasible: false,
    etaSeconds: Number.POSITIVE_INFINITY,
    marginalDelaySeconds: 0,
    resultingLoadFactor: snapshot.load.loadFactor,
    infeasibleReason: reason,
    stopsBefore: 0,
  });
}

/**
 * What it would cost this car to serve that request. **Pure** — CLAUDE.md invariant 1.
 *
 * ```ts
 * const estimate = estimateCost(car.snapshot(), hallCall);
 * if (estimate.feasible) score(estimate.etaSeconds, estimate.marginalDelaySeconds, ...);
 * ```
 *
 * The three numbers, precisely:
 *
 * - **`etaSeconds`** — the arrival time of the requested floor in the re-timed route: every
 *   committed stop the car reaches first, the real S-curve travel time between them, and the
 *   door time (open + dwell + close, dwell including passenger transfer) at each. If the
 *   floor is already a committed stop, this is simply when the car was going to be there
 *   anyway.
 * - **`marginalDelaySeconds`** — the sum, over the stops the car had *already* committed to,
 *   of how much later each would be reached. Zero when the new stop lands after everything
 *   else on the route. Summed rather than maximised so that delaying five stops by two
 *   seconds is not scored the same as delaying one; a passenger-weighted variant belongs in
 *   the dispatcher's term normalization, not here.
 * - **`resultingLoadFactor`** — the load after the stop: everyone bound for a floor the car
 *   reaches first has already alighted, everyone bound for the requested floor alights there,
 *   and the expected boarders are aboard. Uses declared boarding mass when the dispatcher
 *   supplies it, otherwise `boardingPassengers * nominalPassengerMassKg` — a projection, and
 *   the only place in the load model where a nominal mass appears at all.
 */
export function estimateCost(snapshot: CarSnapshot, request: CostRequest): CostEstimate {
  const reason = infeasibilityOf(snapshot, request);
  if (reason !== undefined) return infeasible(snapshot, reason);

  const extra = requestedStop(snapshot, request);
  /* c8 ignore next -- unreachable: `infeasibilityOf` already rejected an unserved floor. */
  if (extra === undefined) return infeasible(snapshot, 'serviceZone');

  const baseline = projectRoute(snapshot);
  const projected = projectRoute(snapshot, extra);

  const target = projected.find((leg) => leg.floorId === extra.floorId);
  /* c8 ignore next -- unreachable: the requested stop is always in the projected route. */
  if (target === undefined) return infeasible(snapshot, 'serviceZone');

  // Marginal delay: how much later every already-committed stop is reached.
  const projectedArrival = new Map<string, number>();
  for (const leg of projected) projectedArrival.set(leg.floorId, leg.arrivalSeconds);

  let marginalDelaySeconds = 0;
  for (const leg of baseline) {
    const after = projectedArrival.get(leg.floorId);
    if (after === undefined) continue;
    const delta = after - leg.arrivalSeconds;
    if (delta > 0) marginalDelaySeconds += delta;
  }

  // Projected load. Everyone bound for an earlier stop is already off; those bound for this
  // floor step out here, before the new passengers step in.
  let massKg = snapshot.load.massKg;
  for (const leg of projected) {
    if (leg.order > target.order) break;
    massKg -= leg.alightingMassKg;
  }
  const boardingMassKg =
    request.boardingMassKg ?? extra.boardingCount * snapshot.nominalPassengerMassKg;
  const resultingMassKg = Math.max(0, massKg + boardingMassKg);

  return Object.freeze({
    feasible: true,
    etaSeconds: target.arrivalSeconds,
    marginalDelaySeconds,
    resultingLoadFactor: resultingMassKg / snapshot.load.ratedLoadKg,
    infeasibleReason: undefined,
    stopsBefore: target.order,
  });
}
