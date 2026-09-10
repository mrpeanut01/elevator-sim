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
 * the travel-frame magnitudes, so "speed never exceeds the limit in force" is expressible
 * without an absolute value at every call site. **The limit in force**, not the rated speed:
 * since GitHub issue #444 a down leg may be bound by {@link MotionConstraints.descentSpeedMps}
 * instead, and {@link MotionProfile.topSpeedLimitMps} is the one the profile actually solved
 * against.
 *
 * ## No new tunables
 *
 * {@link MotionConstraints} deliberately declares exactly the fields `ResolvedCar` already
 * carries (`ratedSpeedMps`, `descentSpeedMps`, `acceleration`, `jerk`), so a `ResolvedCar` is
 * structurally assignable to it and this module needs no dependency on `config/`. The schema,
 * ranges and defaults for those numbers live where they belong — `data/elevator-specs.json`
 * and `config/schema.ts` (CLAUDE.md invariants 7 and 8). This module introduces no tunable of
 * its own.
 *
 * ## Direction
 *
 * A car may have two top speeds (GitHub issue #444). Which one binds is read off the **sign of
 * the displacement** the caller already passes — `buildProfile(target - here)` and
 * `travelTime(to - from)` — so there is no second way of saying *down* that could disagree
 * with the first. `travelTime(Math.abs(...))` is therefore a real bug on an asymmetric car and
 * `sCurve.test.ts` holds a repository-wide guard against it.
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
  /**
   * Rated (top) speed, m/s. The speed the car cruises at when the trip is long enough.
   *
   * **Upwards** since GitHub issue #444, and only nominally: absent a {@link descentSpeedMps}
   * this is the top speed in both directions, which is what it has always meant and what every
   * pinned run still runs at.
   */
  readonly ratedSpeedMps: number;
  /**
   * Top speed **downwards**, m/s, when it differs from {@link ratedSpeedMps}.
   *
   * **Absent means symmetric**, and absent is the default: a car that declares nothing here
   * descends at its rated speed, which is the model this project shipped until GitHub issue
   * #444 and is why every pinned run is byte-identical across that change. `sCurve.test.ts`
   * asserts that as an identity over random envelopes rather than as a claim.
   *
   * Two things make a car asymmetric, and neither is the machine:
   *
   * - **Air pressure.** Al-Kodmany (Buildings 2015, 5(3), 1070–1104) § 3.1.4 records that
   *   *"because of the air-pressure problem, elevators continue to descend not faster than
   *   10 m per second"* — a limit on the rate a sealed cabin may lose ambient pressure, not on
   *   what the hoist can turn. `data/elevator-specs.json`'s `airPressure` block carries the
   *   figure and the travel it applies above, and `config/parse.ts#resolveBuilding` is what
   *   writes it onto a car.
   * - **Design.** The same paper records TWIN as directionally asymmetric on purpose — up to
   *   7 m/s up, about 4 m/s down. That is authored per car (`CarConfig.descentSpeedMps`).
   *
   * Strictly positive when present; **not** required to be below {@link ratedSpeedMps}, because
   * refusing a faster descent here would be this module inventing a rule that belongs to the
   * config layer, which warns about it with a located path.
   */
  readonly descentSpeedMps?: number | undefined;
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
 * - `accelerationLimited` — rated acceleration is reached but the top speed is not. `cruise`
 *   is zero; the constant-acceleration phases are positive.
 * - `speedLimited` — the top speed is reached, and `cruise` is positive except at exactly the
 *   threshold distance, where it is zero. The constant-acceleration phases are positive only
 *   when the plateau opens, i.e. `V >= acceleration^2 / jerk`. A car rated below
 *   that (a hydraulic at `V = 0.5, A = 0.8, J = 0.8`, say) reaches its top speed on the jerk
 *   ramps alone, so `accelerate` and `decelerate` are zero and rated acceleration is never
 *   reached however long the trip is.
 *
 * **`V` here is {@link MotionProfile.topSpeedLimitMps}, not `ratedSpeedMps`** — the two are the
 * same on every symmetric car and differ on a down leg of a car with a descent limit (GitHub
 * issue #444). It matters at the plateau test rather than only in wording: a car at 7 m/s up and
 * 0.5 m/s down with `A = 0.8, J = 0.8` sits on *opposite sides* of `V >= A^2/J` in the two
 * directions, so its regime and its peak acceleration genuinely differ by direction.
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
  /**
   * The envelope this profile was built against.
   *
   * `descentSpeedMps` is echoed back **only when the caller supplied one**, so a symmetric car's
   * profile carries exactly the three keys it always carried and a structural comparison against
   * a pre-#444 profile is an equality rather than an approximation.
   */
  readonly constraints: MotionConstraints;
  /**
   * The top speed that actually bound this profile, m/s — {@link MotionConstraints.ratedSpeedMps}
   * for an up or stationary move, `descentSpeedMps ?? ratedSpeedMps` for a down one.
   *
   * Read it rather than re-deriving it from `constraints` and `direction`: a second derivation is
   * a second authority on which limit was in force, and this one is what the solver used.
   */
  readonly topSpeedLimitMps: number;
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
   * Highest speed actually reached, m/s. Equals the top speed in force for this profile's
   * direction — `constraints.ratedSpeedMps` going up, `constraints.descentSpeedMps ??
   * constraints.ratedSpeedMps` going down — to within last-bit rounding, exactly when
   * `kind === 'speedLimited'`; strictly below it otherwise.
   */
  readonly peakSpeedMps: number;
  /**
   * Highest magnitude of acceleration actually reached, m/s^2.
   *
   * Equal to `constraints.acceleration` whenever the acceleration plateau opens. Strictly
   * below it in the `jerkLimited` regime (short hops), and *also* in the `speedLimited`
   * regime when `topSpeedLimitMps < acceleration^2 / jerk`, where the jerk ramps alone reach
   * the top speed and the peak is `sqrt(topSpeedLimitMps * jerk)`. **{@link topSpeedLimitMps},
   * not `ratedSpeedMps`**: the solver reads the direction's own limit, so a car with a descent
   * limit can peak at a different acceleration going down than going up. Do not infer this from
   * {@link kind} — read it, or read {@link reachesRatedAcceleration}.
   */
  readonly peakAccelerationMps2: number;
  /**
   * True when the car reaches the top speed in force for its direction — that is, when
   * {@link peakSpeedMps} is {@link topSpeedLimitMps} and `kind === 'speedLimited'`.
   *
   * On a car with a descent limit below its rated speed this is **not** *"reached
   * `ratedSpeedMps`"* on a down leg, and cannot be: the car never does. It is *"reached the
   * limit that applied"*, which is what every consumer of this flag was asking.
   */
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
