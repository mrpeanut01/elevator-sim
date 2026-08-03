/**
 * `core/physics/motion` — jerk-limited S-curve motion profiles.
 *
 * Build one profile per point-to-point move with {@link buildProfile}, then read it. The
 * profile is immutable and every accessor is a pure function of `(profile, t)`, so the same
 * object serves the kernel (which schedules only the arrival event), the renderer (which
 * samples {@link positionAt} at display framerate between events) and the dispatcher's
 * hypothetical scoring — none of which can perturb the others. CLAUDE.md invariants 1–3.
 *
 * ```ts
 * const profile = buildProfile(targetHeightM - car.heightM, car); // ResolvedCar fits
 * kernel.scheduleAfter(profileDuration(profile), arrivalEvent);
 * // ...later, in the renderer, between events:
 * const y = car.heightM + positionAt(profile, kernel.now() - departedAt);
 * ```
 *
 * {@link travelTime} is the allocation-free form for cost estimation, which needs the
 * duration but not the trajectory.
 *
 * The degenerate cases are the point of the module, not an afterthought: short journeys
 * collapse the cruise phase, and very short ones collapse the constant-acceleration phases
 * too, leaving a pure jerk-limited triangle. That is why a 2.5 m/s car is not 2.5x a 1.0 m/s
 * car in a low-rise building. All seven phases are always present in
 * {@link MotionProfile.phases}; a collapsed phase has `duration === 0`, and
 * {@link MotionProfile.kind} names which constraint binds. See `sCurve.ts` for the full
 * derivation and docs/02-elevator-reference.md § Motion parameters for the engineering
 * values.
 */

export {
  accelerationAt,
  assertMotionConstraints,
  buildProfile,
  distanceTravelledAt,
  kinematicsAt,
  phaseAt,
  phaseByName,
  positionAt,
  profileDuration,
  sharedPrefixSeconds,
  speedAt,
  travelTime,
  velocityAt,
} from './sCurve.js';

export { MOTION_PHASE_NAMES } from './types.js';

export type {
  Kinematics,
  MotionConstraints,
  MotionDirection,
  MotionPhase,
  MotionPhaseName,
  MotionPhases,
  MotionProfile,
  MotionProfileKind,
} from './types.js';
