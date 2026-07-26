/**
 * Types for jerk-limited (S-curve) car motion.
 *
 * A profile is a complete, immutable description of one point-to-point move: rest to rest,
 * built once when the car commits to a destination and then only *read*. Every evaluation
 * function in `sCurve.ts` is a pure function of `(profile, t)`, which is what lets both the
 * renderer (sampling at display framerate) and `Car.estimateCost()` (sampling hypotheticals
 * thousands of times per dispatch decision) share one representation without either being
 * able to disturb the other — CLAUDE.md invariant 1.
 *
 * ## Units
 *
 * SI throughout: metres, seconds, m/s, m/s^2, m/s^3. Time is simulated seconds, sourced
 * from the kernel; nothing here reads a wall clock (invariant 3).
 *
 * ## Sign convention
 *
 * A profile is built from a **signed displacement** — `buildProfile(targetHeight - height)`.
 * Internally the seven phases are stored in the *travel frame*, where distance and speed are
 * always non-negative and the profile is symmetric in time. {@link MotionProfile.direction}
 * carries the sign, and the signed accessors (`positionAt`, `velocityAt`, `accelerationAt`,
 * `kinematicsAt`) apply it. The unsigned accessors (`distanceTravelledAt`, `speedAt`) return
 * the travel-frame magnitudes, so "speed never exceeds rated speed" is expressible without
 * an absolute value at every call site.
 *
 * ## No new tunables
 *
 * {@link MotionConstraints} deliberately declares exactly the three fields
 * `ResolvedCar` already carries (`ratedSpeedMps`, `acceleration`, `jerk`), so a
 * `ResolvedCar` is structurally assignable to it and this module needs no dependency on
 * `config/`. The schema, ranges and defaults for those three numbers live where they belong
 * — `data/elevator-specs.json` and `config/schema.ts` (CLAUDE.md invariants 7 and 8). This
 * module introduces no tunable of its own.
 */

/**
 * Direction of travel: `1` up, `-1` down, `0` for a zero-distance (stationary) profile.
 *
 * Zero is a distinct value rather than a defaulted `1` so that "this car is not moving" is
 * never confused with "this car is moving up by nothing".
 */
export type MotionDirection = -1 | 0 | 1;

/**
 * The comfort envelope a car moves within.
 *
 * All three are strictly positive. Acceleration and jerk are comfort limits, not motor
 * limits — see docs/02-elevator-reference.md § Motion parameters. A `ResolvedCar` satisfies
 * this interface structurally; there is no conversion step.
 */
export interface MotionConstraints {
  /** Rated (top) speed, m/s. The speed the car cruises at when the trip is long enough. */
  readonly ratedSpeedMps: number;
  /** Peak magnitude of acceleration, m/s^2. Typically 0.8–1.2. */
  readonly acceleration: number;
  /** Peak magnitude of jerk (rate of change of acceleration), m/s^3. Typically 1.0–1.6. */
  readonly jerk: number;
}

/**
 * The seven phases, in order, of a full S-curve:
 *
 * ```
 * jerkToAccel → accelerate → jerkToCruise → cruise → jerkToDecel → decelerate → jerkToStop
 * ```
 *
 * Every profile has all seven entries. Degenerate profiles express themselves as
 * zero-duration phases rather than as a shorter list, so consumers never have to branch on
 * which phases exist — see {@link MotionProfileKind}.
 */
export const MOTION_PHASE_NAMES = [
  'jerkToAccel',
  'accelerate',
  'jerkToCruise',
  'cruise',
  'jerkToDecel',
  'decelerate',
  'jerkToStop',
] as const;

/** One of the seven phase names in {@link MOTION_PHASE_NAMES}. */
export type MotionPhaseName = (typeof MOTION_PHASE_NAMES)[number];

/**
 * Which constraint binds, i.e. how much of the S-curve survives.
 *
 * This is the whole point of modelling jerk. A six-storey building runs almost entirely in
 * the `jerkLimited` and `accelerationLimited` regimes, where rated speed is irrelevant, so
 * a 2.5 m/s car is nowhere near 2.5x a 1.0 m/s car. See
 * docs/02-elevator-reference.md § Motion parameters.
 *
 * - `stationary` — zero distance. Every phase has zero duration.
 * - `jerkLimited` — jerk alone binds. `accelerate`, `decelerate` and `cruise` are all zero
 *   and the acceleration trace is triangular. Rated acceleration is not reached, *except* at
 *   exactly the threshold distance `dSwitch = 2*A^3/J^2`, where the plateau has zero width
 *   and the triangle peaks at exactly rated acceleration.
 * - `accelerationLimited` — rated acceleration is reached but rated speed is not. `cruise`
 *   is zero; the constant-acceleration phases are positive.
 * - `speedLimited` — rated speed is reached, and `cruise` is positive except at exactly the
 *   threshold distance, where it is zero. The constant-acceleration phases are positive only
 *   when the plateau opens, i.e. `ratedSpeedMps >= acceleration^2 / jerk`. A car rated below
 *   that (a hydraulic at `V = 0.5, A = 0.8, J = 0.8`, say) reaches rated speed on the jerk
 *   ramps alone, so `accelerate` and `decelerate` are zero and rated acceleration is never
 *   reached however long the trip is.
 *
 * This is why {@link MotionProfile.reachesRatedAcceleration} is derived from the peak rather
 * than from `kind`: the two disagree at both ends of the acceleration-limited band.
 */
export type MotionProfileKind =
  | 'stationary'
  | 'jerkLimited'
  | 'accelerationLimited'
  | 'speedLimited';

/**
 * One phase of the profile, with the travel-frame state at its start.
 *
 * Within a phase, jerk is constant, so the state at `startTime + dt` for
 * `0 <= dt <= duration` is the exact cubic
 *
 * ```
 * a(dt) = startAcceleration + jerk*dt
 * v(dt) = startSpeed        + startAcceleration*dt + jerk*dt^2/2
 * s(dt) = startDistance     + startSpeed*dt + startAcceleration*dt^2/2 + jerk*dt^3/6
 * ```
 *
 * All values are travel-frame: `startDistance` and `startSpeed` are non-negative regardless
 * of travel direction, and `startAcceleration` is positive while speeding up and negative
 * while slowing down.
 */
export interface MotionPhase {
  readonly name: MotionPhaseName;
  /** Position in {@link MOTION_PHASE_NAMES}, 0–6. */
  readonly index: number;
  /** Seconds from the start of the profile. */
  readonly startTime: number;
  /** `startTime + duration`. Equal to `startTime` for a collapsed phase. */
  readonly endTime: number;
  /** Seconds. Zero for a collapsed phase; never negative. */
  readonly duration: number;
  /** Constant jerk during the phase, m/s^3. Zero on `accelerate`, `cruise`, `decelerate`. */
  readonly jerk: number;
  /** Travel-frame distance covered before this phase, metres. Non-negative. */
  readonly startDistance: number;
  /** Travel-frame speed at `startTime`, m/s. Non-negative. */
  readonly startSpeed: number;
  /** Travel-frame acceleration at `startTime`, m/s^2. Signed. */
  readonly startAcceleration: number;
}

/** Exactly seven phases, always, in {@link MOTION_PHASE_NAMES} order. */
export type MotionPhases = readonly [
  MotionPhase,
  MotionPhase,
  MotionPhase,
  MotionPhase,
  MotionPhase,
  MotionPhase,
  MotionPhase,
];

/**
 * A complete rest-to-rest move. Immutable and frozen; safe to share between the kernel, the
 * dispatcher's hypothetical evaluations and the renderer.
 */
export interface MotionProfile {
  /** Which constraint binds. See {@link MotionProfileKind}. */
  readonly kind: MotionProfileKind;
  /** The envelope this profile was built against. */
  readonly constraints: MotionConstraints;
  /** Signed displacement from start to finish, metres. Negative for a down trip. */
  readonly displacementM: number;
  /** `Math.abs(displacementM)`. Non-negative. */
  readonly distanceM: number;
  /** Sign of {@link displacementM}. */
  readonly direction: MotionDirection;
  /** Total travel time, seconds. Excludes motor start delay and levelling — those are car-level, not profile-level. */
  readonly duration: number;
  /** The seven phases. Collapsed phases are present with `duration === 0`. */
  readonly phases: MotionPhases;
  /**
   * Highest speed actually reached, m/s. Equals `constraints.ratedSpeedMps`, to within
   * last-bit rounding, exactly when `kind === 'speedLimited'`; strictly below it otherwise.
   */
  readonly peakSpeedMps: number;
  /**
   * Highest magnitude of acceleration actually reached, m/s^2.
   *
   * Equal to `constraints.acceleration` whenever the acceleration plateau opens. Strictly
   * below it in the `jerkLimited` regime (short hops), and *also* in the `speedLimited`
   * regime when `ratedSpeedMps < acceleration^2 / jerk`, where the jerk ramps alone reach
   * rated speed and the peak is `sqrt(ratedSpeedMps * jerk)`. Do not infer this from
   * {@link kind} — read it, or read {@link reachesRatedAcceleration}.
   */
  readonly peakAccelerationMps2: number;
  /** True when the car reaches rated speed, i.e. `kind === 'speedLimited'`. */
  readonly reachesRatedSpeed: boolean;
  /**
   * True when the car reaches rated acceleration — that is, when
   * {@link peakAccelerationMps2} is `constraints.acceleration` to within last-bit rounding.
   *
   * This is **not** `kind === 'accelerationLimited' || kind === 'speedLimited'`. A
   * `speedLimited` profile misses rated acceleration entirely when
   * `ratedSpeedMps < acceleration^2 / jerk`, and a `jerkLimited` profile of exactly
   * `dSwitch = 2*acceleration^3 / jerk^2` touches it exactly. See {@link MotionProfileKind}.
   */
  readonly reachesRatedAcceleration: boolean;
}

/**
 * Signed kinematic state at an instant, in the building frame: `position` is displacement
 * from where the move started (negative while travelling down), and `velocity` and
 * `acceleration` carry the same sign convention.
 */
export interface Kinematics {
  /** Signed displacement from the start of the move, metres. */
  readonly position: number;
  /** Signed velocity, m/s. */
  readonly velocity: number;
  /** Signed acceleration, m/s^2. */
  readonly acceleration: number;
}
