/**
 * Cars in flight, for `diversionDetour`.
 *
 * Every other term in this directory can be exercised from a stationary car, so
 * `fixtures.test-helper.ts` builds one. This term is *defined* by what a car in motion can still
 * be stopped at, so it needs a car that has really departed, at a real instant mid-flight, with
 * passengers aboard who would pay for the extra stop.
 *
 * ## Two things these fixtures learned the hard way
 *
 * **The instant matters.** `Car.divertFrontier` walks the trajectory and returns the nearest floor
 * the envelope can still decelerate into, so a snapshot taken too late has no frontier ahead of the
 * call and the term reads zero for a reason that has nothing to do with the gate. So the snapshot
 * is taken early and the frontier is asserted to exist.
 *
 * **Anything the car is supposed to be holding must be assigned *before* the snapshot.** A snapshot
 * is a frozen value; a hall call assigned after it was taken is invisible to every term reading it.
 * The first draft of {@link movingCarContext} assigned the call afterwards and the "already
 * diverting there" case silently became the ordinary diverting case.
 */

import type { CarSnapshot } from '../../model/car/types.js';
import type { TermContext } from '../types.js';

import { call, contextFor, makeCar, passengerTo } from './fixtures.test-helper.js';

/** Which of the term's cases to build. */
export interface MovingCarOptions {
  /** Presence is permission: `false` takes the snapshot without a commit point (§ D205). */
  readonly enRouteDiversion: boolean;
  /** Put the call on a floor the car is *already* going to be cut short at. */
  readonly callAtExistingDivertStop?: boolean;
  /** Put the call past the floor the car is already committed to reach. */
  readonly callBeyondDestination?: boolean;
}

/** The floor the car departs from, and the one it is commanded to. A long run, so there is room. */
const FROM = '0';
const TO = '18';
/** Early in the flight, so the frontier is still well short of the destination. */
const MID_FLIGHT = 2;

/**
 * A car in flight from {@link FROM} to {@link TO}, carrying two passengers bound for the top,
 * with a hall call offered somewhere along the way.
 *
 * The two aboard are bound for {@link TO} rather than for an intermediate floor deliberately:
 * `detourPenalty` counts *alighting* passengers, so a car whose riders get out before the inserted
 * stop scores zero and the fixture would prove nothing about the gate.
 */
export function movingCarContext(options: MovingCarOptions): TermContext {
  const car = makeCar('A', FROM);
  car.board(passengerTo(TO), 0);
  car.board(passengerTo(TO), 0);
  car.departFor(TO, 0);

  const frontier = car.divertFrontier(MID_FLIGHT);
  if (frontier === undefined) {
    throw new Error('fixture is broken: no commit point mid-flight, so nothing here tests the gate');
  }

  // Assigned BEFORE the snapshot, or the car is not holding it when the term looks.
  if (options.callAtExistingDivertStop === true) {
    const held = String(frontier.index + 2);
    car.assignHallCall({
      id: `hall:${held}:up`,
      floorId: held,
      floorIndex: Number(held),
      direction: 'up',
      registeredAt: 0,
    });
  }

  const snapshot: CarSnapshot = car.snapshot(MID_FLIGHT, {
    enRouteDiversion: options.enRouteDiversion,
  });

  const callFloorId =
    options.callBeyondDestination === true ? '20' : String(frontier.index + 2);

  return contextFor(snapshot, call(callFloorId, 'up', 0));
}

/**
 * The same car and the same call, snapshotted both ways.
 *
 * This is how the "profile forbids diversion" case is tested, and it has to be a *pair* rather
 * than a lone zero. With diversion off the route is projected from the car's **destination**, so a
 * call short of it is served after the passengers have already got out and
 * `detourPassengerSeconds` is legitimately zero — there is no detour, because the model cannot
 * express the stop at all. That is `DECISIONS.md` § D205's original defect, not this term's gate,
 * and asserting a lone zero there would credit the gate with a zero the geometry produced.
 *
 * Comparing the two snapshots isolates the gate: same car, same call, same instant.
 */
export function bothWaysContext(): { readonly off: TermContext; readonly on: TermContext } {
  return {
    off: movingCarContext({ enRouteDiversion: false }),
    on: movingCarContext({ enRouteDiversion: true }),
  };
}

/**
 * A car standing still with a detour to charge — the control for *"zero because it is not moving"*.
 *
 * Deliberately the same shape as `detourPenalty.test.ts`'s own fixture: at 10, two aboard for 12,
 * a call at 11 that goes in front of them. `detourPenalty` charges it; this term must not.
 */
export function stoppedCarContext(): TermContext {
  const car = makeCar('A', '10');
  car.board(passengerTo('12'), 0);
  car.board(passengerTo('12'), 0);
  return contextFor(car.snapshot(0), call('11', 'up'));
}
