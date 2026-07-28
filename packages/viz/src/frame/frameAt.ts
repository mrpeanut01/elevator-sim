/**
 * The frame producer: `(recording, simulated time) → Frame`. Pure.
 *
 * ## The one interesting claim
 *
 * {@link carHeightAt} evaluates `motion.fromHeightM + positionAt(motion.profile, t -
 * motion.startedAt)` — character for character the arithmetic `Car.positionAt` performs. So the
 * height a renderer draws is not an interpolation *between* kernel events; it is the car's
 * analytic position, jerk-limited S-curve and all, including through the motor-start delay and
 * the levelling settle, because `positionAt` clamps at both ends of the profile. A short hop
 * that never reaches rated speed looks like a short hop that never reaches rated speed.
 *
 * That matters beyond looking nice. CLAUDE.md's modeling rules single out ignoring jerk and
 * acceleration as a way to "wrongly conclude faster elevators always help"; a viewer that drew
 * linear ramps would show a building the statistics do not describe, and somebody would trust
 * the picture.
 *
 * ## Purity, and why it is not decoration
 *
 * No cursor, no memo, no clock. `frameAt(r, 12.5)` returns the same value whether it is called
 * before or after `frameAt(r, 900)`. A playback scrubber moves backwards, a replay test samples
 * the same instant twice, and a future worker thread would call it out of order — all three
 * need this, and the acceptance criterion ("a stored run replays visually identically") is
 * exactly the statement that it holds.
 */

import { doorOpenFractionAt, positionAt, type SimTime } from '@elevator-sim/core/browser';

import { lastAtOrBefore, stepValueAt } from '../contract/series.js';
import {
  type DoorPhase,
  type Frame,
  type FrameCar,
  type FrameLanding,
  type TravelDirection,
  type VizRecording,
  type VizShaft,
} from '../contract/types.js';

/**
 * The frame at `simTimeS`.
 *
 * `simTimeS` is clamped into `[recording.startedAt, recording.endedAt]`, so a scrubber that
 * overshoots gets the first or last frame rather than an extrapolation of a run that had not
 * started or had ended.
 */
export function frameAt(recording: VizRecording, simTimeS: SimTime): Frame {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const boardedLegs = stepValueAt(recording.progress.boardedLegs, t);
  return {
    schemaVersion: recording.schemaVersion,
    runId: recording.runId,
    simTimeS: t,
    cars: recording.shafts.map((shaft) => frameCar(shaft, t)),
    landings: frameLandings(recording, t),
    totalWaiting: stepValueAt(recording.progress.waiting, t),
    boardedLegs,
    runningMeanWaitS: boardedLegs === 0 ? undefined : stepValueAt(recording.progress.meanWaitS, t),
  };
}

function frameCar(shaft: VizShaft, t: SimTime): FrameCar {
  return {
    carId: shaft.carId,
    bankId: shaft.bankId,
    label: shaft.label,
    heightM: carHeightAt(shaft, t),
    floorId: carFloorIdAt(shaft, t),
    direction: carDirectionAt(shaft, t),
    doorFraction: doorFractionAt(shaft, t),
    doorPhase: doorPhaseAt(shaft, t),
    occupants: stepValueAt(shaft.occupants, t),
    loadFactor: stepValueAt(shaft.loadFactor, t),
  };
}

function frameLandings(recording: VizRecording, t: SimTime): readonly FrameLanding[] {
  const up = new Map<string, number>();
  const down = new Map<string, number>();
  for (const landing of recording.landings) {
    const value = stepValueAt(landing.waiting, t);
    (landing.direction === 'down' ? down : up).set(landing.floorId, value);
  }
  // One entry per floor, in the building's own floor order, whether or not anybody is waiting:
  // a renderer laying out rows must not have them appear and vanish under it.
  return recording.floors.map((floor) => ({
    floorId: floor.id,
    waitingUp: up.get(floor.id) ?? 0,
    waitingDown: down.get(floor.id) ?? 0,
  }));
}

/* -------------------------------------------------------------------------- *
 * The samplers.
 *
 * Their caller is {@link frameCar}, directly above, and — stated plainly because the barrel's
 * table has a row for it — they have **no caller outside this package**. They are separate
 * functions rather than inline expressions so that a test can ask "where was the car at t?"
 * without going through a whole frame, which is what makes the wiring assertions in
 * `frameAt.test.ts` possible: those compare `frame.cars[i].heightM` against `carHeightAt(shaft,
 * t)` and would be vacuous if the two could not be evaluated separately.
 *
 * That test exists because seven of `frameCar`'s eight fields could be replaced by constants
 * without the package's 89-test suite noticing. Testing a sampler is not testing that the frame
 * calls it.
 * -------------------------------------------------------------------------- */

/** The move in effect at `t`: the last one *commanded* at or before it. */
function motionAt(shaft: VizShaft, t: SimTime): VizShaft['motions'][number] | undefined {
  // Motions are keyed on `commandedAt`, not `at`, so the shared search needs the adapter.
  const motions = shaft.motions;
  let low = 0;
  let high = motions.length - 1;
  let found: VizShaft['motions'][number] | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = motions[mid];
    if (candidate === undefined) break;
    if (candidate.commandedAt <= t) {
      found = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * Height above datum at `t`, metres — the exact analytic position.
 *
 * One expression covers the motor-start delay, the S-curve and the levelling settle, because
 * `positionAt` returns `0` before the profile starts and the full displacement after it ends.
 */
export function carHeightAt(shaft: VizShaft, t: SimTime): number {
  const motion = motionAt(shaft, t);
  if (motion === undefined) return shaft.startHeightM;
  return motion.fromHeightM + positionAt(motion.profile, t - motion.startedAt);
}

/** Signed direction of travel at `t`. `0` while standing, and while the doors are working. */
export function carDirectionAt(shaft: VizShaft, t: SimTime): TravelDirection {
  const motion = motionAt(shaft, t);
  if (motion === undefined) return 0;
  if (t <= motion.startedAt || t >= motion.arrivesAt) return 0;
  return motion.toHeightM > motion.fromHeightM ? 1 : -1;
}

/** The floor a standing car is at, or the one a moving car left. */
export function carFloorIdAt(shaft: VizShaft, t: SimTime): string {
  const motion = motionAt(shaft, t);
  if (motion === undefined) return shaft.startFloorId;
  return t >= motion.arrivesAt ? motion.toFloorId : motion.fromFloorId;
}

/** How far open the doors are at `t`, 0 shut to 1 fully open. Exact between kernel events. */
export function doorFractionAt(shaft: VizShaft, t: SimTime): number {
  const mark = lastAtOrBefore(shaft.doorMarks, t);
  if (mark === undefined) return 0;
  return doorOpenFractionAt(mark.state, t, shaft.doorConfig);
}

/** Door phase at `t`. `opening`/`closing` are states of the machine, not a rounding. */
export function doorPhaseAt(shaft: VizShaft, t: SimTime): DoorPhase {
  const mark = lastAtOrBefore(shaft.doorMarks, t);
  if (mark === undefined) return 'closed';
  const fraction = doorOpenFractionAt(mark.state, t, shaft.doorConfig);
  if (fraction <= 0) return 'closed';
  if (fraction >= 1) return 'open';
  return mark.state.state === 'closing' ? 'closing' : 'opening';
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
