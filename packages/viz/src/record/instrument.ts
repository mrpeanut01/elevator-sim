/**
 * Recording what a car did, without changing what it decided.
 *
 * ## Why instrumentation rather than an event hook
 *
 * `core/` deliberately exposes no per-event callback — a replication is a *value*, not a stream
 * — and adding one would mean editing a package this work must not touch (CLAUDE.md invariant
 * 6 runs one way, but the multi-agent contract for this task runs the other: `packages/core` is
 * not ours to write). So the five public methods that change how a car *looks* are wrapped, and
 * nothing else is.
 *
 * The wrapping is safe for a reason that is worth stating precisely, because "it looks
 * harmless" is not an argument in a repository whose whole thesis is that plausible numbers
 * hide bugs:
 *
 * - **Every wrapper delegates and returns the delegate's value unchanged.** It cannot move a
 *   dispatch decision, because it does not alter any input to one.
 * - **No wrapper draws a random number**, so common random numbers stay synchronised
 *   (invariant 2). It could not: it never touches the `StreamSet`.
 * - **No wrapper reads a clock.** The time it records is the time the caller passed, or
 *   `car.now()` — the kernel (invariant 3).
 * - **No wrapper changes a statistic.** The `RunRecord` is produced by `metrics/` from the same
 *   events either way; `recordRun` asserts this by comparing an instrumented run's record
 *   fingerprint against an uninstrumented one in `recordRun.test.ts`.
 *
 * `advanceDoorsTo` is in the list for a reason that is easy to miss: a door closes
 * *automatically* when its dwell expires, and the run realises that transition through
 * `advanceDoorsTo` rather than through `closeDoors`. Wrapping the commands alone would leave
 * cars standing on screen with their doors open forever.
 */

import type { Car, CarMotion, DoorStep, SimTime } from '@elevator-sim/core/browser';

import type { VizDoorMark } from '../contract/types.js';

/** Everything one car did, in the order it did it. Filled as the run proceeds. */
export interface CarTrack {
  readonly carId: string;
  readonly motions: CarMotion[];
  readonly doorMarks: VizDoorMark[];
}

/**
 * Wrap `car` so its moves and door transitions are recorded into a fresh {@link CarTrack}.
 *
 * Call **before** `Simulation.run()`. The track is empty on return and fills as the run
 * proceeds.
 */
export function instrumentCar(car: Car): CarTrack {
  const track: CarTrack = { carId: car.id, motions: [], doorMarks: [] };

  const departFor = car.departFor.bind(car);
  const openDoors = car.openDoors.bind(car);
  const requestReopen = car.requestReopen.bind(car);
  const closeDoors = car.closeDoors.bind(car);
  const advanceDoorsTo = car.advanceDoorsTo.bind(car);

  car.departFor = (floorId, at): CarMotion => {
    const motion = departFor(floorId, at ?? car.now());
    track.motions.push(motion);
    return motion;
  };
  car.openDoors = (at, reason): DoorStep => {
    const when = at ?? car.now();
    return mark(track, when, openDoors(when, reason));
  };
  car.requestReopen = (cause, at, reason): DoorStep => {
    const when = at ?? car.now();
    return mark(track, when, requestReopen(cause, when, reason));
  };
  car.closeDoors = (at): DoorStep => {
    const when = at ?? car.now();
    return mark(track, when, closeDoors(when));
  };
  car.advanceDoorsTo = (at): DoorStep => {
    const when = at ?? car.now();
    return mark(track, when, advanceDoorsTo(when));
  };

  return track;
}

function mark(track: CarTrack, at: SimTime, step: DoorStep): DoorStep {
  track.doorMarks.push({ at, state: step.state });
  return step;
}

/** `main-A` in bank `main` is just `A` on screen. */
export function shortCarLabel(carId: string, bankId: string): string {
  const prefix = `${bankId}-`;
  return carId.startsWith(prefix) ? carId.slice(prefix.length) : carId;
}
