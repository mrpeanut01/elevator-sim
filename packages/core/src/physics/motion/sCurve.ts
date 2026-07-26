/**
 * Jerk-limited (S-curve) motion profiles: construction and analytic evaluation.
 *
 * # The profile
 *
 * A rest-to-rest move under three limits — rated speed `V`, rated acceleration `A`, rated
 * jerk `J` — is the classical seven-phase S-curve:
 *
 * ```
 * jerk+ → accel const → jerk− → cruise → jerk− → decel const → jerk+ → stop
 *  Tj        Ta            Tj      Tv       Tj       Ta          Tj
 * ```
 *
 * It is symmetric: the deceleration half mirrors the acceleration half, so only three
 * durations describe the whole thing — `Tj` (one jerk ramp), `Ta` (one constant-acceleration
 * plateau), `Tv` (cruise). Total time is `4*Tj + 2*Ta + Tv`.
 *
 * # Derivation
 *
 * ## The key identity
 *
 * Over the acceleration segment (`jerk+ → accel const → jerk−`, duration `Tacc = 2*Tj + Ta`)
 * the acceleration trace is symmetric about its own midpoint: `a(t) = a(Tacc − t)`. Hence
 * `v(t) + v(Tacc − t) = vPeak` for every `t`, so the mean speed over the segment is exactly
 * `vPeak/2` and
 *
 * ```
 * distance covered while accelerating = vPeak * Tacc / 2
 * ```
 *
 * The deceleration segment is its mirror image and covers the same distance. Therefore, for
 * a move that reaches peak speed `vPeak`,
 *
 * ```
 * D = 2 * (vPeak * Tacc / 2) + vPeak * Tv = vPeak * (Tacc + Tv)                        (1)
 * ```
 *
 * and, since the area under the acceleration trace is `vPeak`,
 *
 * ```
 * vPeak = aPeak * (Tj + Ta)                                                            (2)
 * ```
 *
 * ## Which constraint binds
 *
 * Two threshold distances fall out of (1) and (2).
 *
 * **`dSwitch`** — the shortest move that still touches rated acceleration. Set `Ta = 0`,
 * `Tj = A/J` (the ramp time to reach `A`); then `aPeak = A`, `vPeak = A^2/J` by (2) and
 * `Tacc = 2A/J`, so by (1)
 *
 * ```
 * dSwitch = (A^2/J) * (2A/J) = 2*A^3 / J^2                                             (3)
 * ```
 *
 * **`dRated`** — the shortest move that still touches rated speed. Set `vPeak = V` and
 * `Tv = 0`. If `V >= A^2/J` the acceleration plateau exists, `Tj = A/J` and, from (2),
 * `Ta = V/A − A/J`; otherwise the ramps alone reach `V`, so `Tj = sqrt(V/J)` and `Ta = 0`.
 * Either way, by (1), `dRated = V * Tacc`. For the plateau case this is the familiar
 *
 * ```
 * dRated = V * (V/A + A/J)                                                             (4)
 * ```
 *
 * The two thresholds cross at `V == A^2/J`, and which side you are on decides whether the
 * acceleration-limited regime exists at all:
 *
 * ```
 * V >= A^2/J   dSwitch <= dRated   [0, dSwitch) jerk | [dSwitch, dRated) accel | [dRated, ∞) speed
 * V <  A^2/J   dRated <  dSwitch   [0, dRated)  jerk |                          [dRated,  ∞) speed
 * ```
 *
 * Either way the regimes tile the distance axis without a gap, and `kind` is monotone in
 * distance. But in the second row the acceleration-limited band is *empty*: the ramps alone
 * reach rated speed, `Ta` is 0 even for an infinite trip, and peak acceleration tops out at
 * `sqrt(V*J) < A`. A `speedLimited` profile there has zero-duration `accelerate` and
 * `decelerate` phases and never touches rated acceleration — which is why
 * {@link MotionProfile.reachesRatedAcceleration} is derived from the peak and not from
 * `kind`. This is not an exotic envelope: `V = 0.5, A = 0.8, J = 0.8` is a hydraulic car
 * built entirely from values in data/elevator-specs.json's `hydraulic` ranges.
 *
 * ## Solving each regime
 *
 * **Speed-limited** (`D >= dRated`). `Tj`, `Ta` as for `dRated`; the surplus distance is all
 * cruise, `Tv = (D − dRated)/V`. Total time collapses to the well-known
 *
 * ```
 * T = D/V + V/A + A/J        (when V >= A^2/J)                                         (5)
 * ```
 *
 * — flight time at rated speed plus a fixed "lost time" of `V/A + A/J` for getting up to
 * speed and back down again. This is the closed form the tests hand-check against.
 *
 * **Acceleration-limited** (`dSwitch <= D < dRated`). `Tj = A/J` is fixed and `Ta` is the
 * unknown. Substituting (2) into (1) with `Tv = 0`:
 *
 * ```
 * D = A*(Tj + Ta) * (2*Tj + Ta) = A*(Ta^2 + 3*Tj*Ta + 2*Tj^2)
 * ```
 *
 * a quadratic in `Ta` whose positive root is
 *
 * ```
 * Ta = ( sqrt(Tj^2 + 4*D/A) − 3*Tj ) / 2                                               (6)
 * ```
 *
 * (At `D = dSwitch` the discriminant is `9*Tj^2` and `Ta` is exactly 0, as it must be.)
 *
 * **Jerk-limited** (`D < min(dSwitch, dRated)`). `Ta = Tv = 0`, the acceleration trace is a
 * triangle.
 * `aPeak = J*Tj`, so `vPeak = J*Tj^2` by (2) and `Tacc = 2*Tj`, so by (1) `D = 2*J*Tj^3`:
 *
 * ```
 * Tj = cbrt( D / (2*J) )                                                               (7)
 * ```
 *
 * `D = 0` falls out of (7) as `Tj = 0` with no division by zero, which is why the stationary
 * case needs no special arithmetic — only a distinct {@link MotionProfileKind} label.
 *
 * # Why this matters
 *
 * (7) and (6) are the reason a fast car is not proportionally faster on short hops: a
 * one-floor move never gets near rated speed, so the rated-speed number in the spec sheet is
 * simply not in the answer. A simulator that used `D/V` would conclude that a 2.5 m/s car
 * beats a 1.0 m/s car by 2.5x in a six-storey building; the real figure is under 1.9x, and
 * for a single-floor hop under 1.2x. See docs/02-elevator-reference.md § Motion parameters,
 * and the tests named after this claim.
 *
 * # Purity and determinism
 *
 * Every function here is pure: no mutation of any argument, no RNG, no wall clock. A
 * {@link MotionProfile} and its phases are frozen at construction, so handing one to the
 * dispatcher cannot let a hypothetical evaluation perturb committed state (CLAUDE.md
 * invariants 1–3).
 */

import {
  MOTION_PHASE_NAMES,
  type Kinematics,
  type MotionConstraints,
  type MotionDirection,
  type MotionPhase,
  type MotionPhaseName,
  type MotionPhases,
  type MotionProfile,
  type MotionProfileKind,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Validation
 * -------------------------------------------------------------------------- */

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than 0; received ${value}`);
  }
}

/**
 * Check a motion envelope. Exported because callers that build many profiles from one car
 * (the dispatcher does) can validate once and skip the per-profile cost of being wrong late.
 *
 * @throws RangeError if any of the three limits is not a finite positive number.
 */
export function assertMotionConstraints(constraints: MotionConstraints): void {
  assertPositiveFinite(constraints.ratedSpeedMps, 'constraints.ratedSpeedMps');
  assertPositiveFinite(constraints.acceleration, 'constraints.acceleration');
  assertPositiveFinite(constraints.jerk, 'constraints.jerk');
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number; received ${value}`);
  }
}

/* -------------------------------------------------------------------------- *
 * Duration solver
 * -------------------------------------------------------------------------- */

/** The three independent durations that describe a symmetric seven-phase profile. */
interface PhaseDurations {
  readonly kind: MotionProfileKind;
  /** `Tj` — one jerk ramp, seconds. */
  readonly jerkTime: number;
  /** `Ta` — one constant-acceleration plateau, seconds. */
  readonly accelTime: number;
  /** `Tv` — cruise, seconds. */
  readonly cruiseTime: number;
}

/**
 * Solve `(Tj, Ta, Tv)` for a non-negative distance. See the module header for the
 * derivation; equation numbers below refer to it.
 */
function solveDurations(distance: number, constraints: MotionConstraints): PhaseDurations {
  const { ratedSpeedMps: v, acceleration: a, jerk: j } = constraints;

  if (distance <= 0) {
    return { kind: 'stationary', jerkTime: 0, accelTime: 0, cruiseTime: 0 };
  }

  // Ramp time to reach rated acceleration, and the shortest move that still touches it (3).
  const rampTime = a / j;
  const dSwitch = (2 * a * a * a) / (j * j);

  // Durations of the acceleration segment for a move that just reaches rated speed, and the
  // distance such a move covers (4). `v < a^2/j` means the plateau never opens: the ramps
  // alone are enough to reach rated speed.
  const plateauOpensAtSpeed = (a * a) / j;
  const jerkTimeAtRated = v >= plateauOpensAtSpeed ? rampTime : Math.sqrt(v / j);
  const accelTimeAtRated = v >= plateauOpensAtSpeed ? v / a - rampTime : 0;
  const dRated = v * (2 * jerkTimeAtRated + accelTimeAtRated);

  if (distance >= dRated) {
    return {
      kind: 'speedLimited',
      jerkTime: jerkTimeAtRated,
      accelTime: accelTimeAtRated,
      cruiseTime: (distance - dRated) / v,
    };
  }

  // The `distance >= dSwitch` test and the sign of the root of (6) are the same condition —
  // (6) is exactly zero at `dSwitch` — so either could decide the regime alone. Both are
  // here on purpose. `dSwitch` decides, because right at the boundary `sqrt(...) - 3*Tj`
  // cancels catastrophically and its sign is only good to a few ulps; comparing distances
  // instead keeps `kind` monotone in distance rather than flickering across the threshold.
  // The `accelTime > 0` guard is then the safety net for that same cancellation a hair
  // above the boundary, where falling through is correct — a zero plateau *is* the
  // jerk-limited case, and a negative one would silently corrupt the profile.
  if (distance >= dSwitch) {
    const accelTime = (Math.sqrt(rampTime * rampTime + (4 * distance) / a) - 3 * rampTime) / 2;
    if (accelTime > 0) {
      return { kind: 'accelerationLimited', jerkTime: rampTime, accelTime, cruiseTime: 0 };
    }
  }

  // (7). `cbrt(0) === 0`, so zero distance needs no special case.
  return { kind: 'jerkLimited', jerkTime: Math.cbrt(distance / (2 * j)), accelTime: 0, cruiseTime: 0 };
}

/* -------------------------------------------------------------------------- *
 * Construction
 * -------------------------------------------------------------------------- */

/**
 * Sign of the constant jerk in each of the seven phases, in {@link MOTION_PHASE_NAMES}
 * order. The two `−1`s are the two phases that shed acceleration — one into cruise, one
 * into the deceleration plateau — and the two `+1`s bracket them.
 */
const PHASE_JERK_SIGN = [1, 0, -1, 0, -1, 0, 1] as const;

function phaseName(index: number): MotionPhaseName {
  const name = MOTION_PHASE_NAMES[index];
  if (name === undefined) {
    throw new RangeError(`phase index out of range: ${index}`);
  }
  return name;
}

/**
 * Build a motion profile for a **signed** displacement.
 *
 * Pass `targetHeightM - currentHeightM`: positive travels up, negative travels down, zero
 * yields a `stationary` profile of zero duration. The magnitude drives the physics; the sign
 * is carried on {@link MotionProfile.direction} and applied by the signed accessors.
 *
 * The returned profile and its phases are frozen. Total duration covers motion only —
 * motor start delay and levelling are car-level costs and belong to the car model, not here.
 *
 * @throws RangeError if `displacementM` is not finite, or any constraint is not finite and
 *   positive.
 */
export function buildProfile(displacementM: number, constraints: MotionConstraints): MotionProfile {
  assertFinite(displacementM, 'displacementM');
  assertMotionConstraints(constraints);

  const requested = Math.abs(displacementM);
  const durations = solveDurations(requested, constraints);
  const { jerkTime, accelTime, cruiseTime } = durations;
  const duration = 4 * jerkTime + 2 * accelTime + cruiseTime;

  // Underflow guard. A distance small enough that `cbrt(D/2J)` rounds to zero (only true
  // denormals, below ~1e-323 m) would otherwise produce a profile with zero duration but a
  // non-zero target — a move that both takes no time and does not arrive. Below the
  // resolution of the model, "not a move" is the honest answer, and it keeps every
  // endpoint invariant exactly true rather than approximately.
  const stationary = duration === 0;
  const distance = stationary ? 0 : requested;
  const displacement = stationary ? 0 : displacementM;
  const direction: MotionDirection = displacement > 0 ? 1 : displacement < 0 ? -1 : 0;
  const kind: MotionProfileKind = stationary ? 'stationary' : durations.kind;

  const jerk = constraints.jerk;
  // Universal across all three regimes: the ramp always runs at rated jerk, so peak
  // acceleration is whatever that ramp reaches in `Tj`. That is rated acceleration whenever
  // the plateau opens (`Tj = A/J`) — the acceleration-limited regime always, the
  // speed-limited regime only when `V >= A^2/J`. When `V < A^2/J` the ramps alone reach
  // rated speed, `Tj = sqrt(V/J)`, and the peak is `sqrt(V*J) < A` no matter how long the
  // trip is. That case is why `reachesRatedAcceleration` below cannot be read off `kind`.
  const peakAcceleration = jerk * jerkTime;

  const phaseDurations = [jerkTime, accelTime, jerkTime, cruiseTime, jerkTime, accelTime, jerkTime];
  const phaseStartAccelerations = [
    0,
    peakAcceleration,
    peakAcceleration,
    0,
    0,
    -peakAcceleration,
    -peakAcceleration,
  ];

  // Travel-frame cursor, advanced once per phase. Array-literal elements evaluate strictly
  // left to right, so the seven `nextPhase()` calls below see the cursor in phase order.
  let time = 0;
  let travelled = 0;
  let speed = 0;

  const nextPhase = (index: number): MotionPhase => {
    const dt = phaseDurations[index] ?? 0;
    const startAcceleration = phaseStartAccelerations[index] ?? 0;
    const phaseJerk = (PHASE_JERK_SIGN[index] ?? 0) * jerk;

    const phase: MotionPhase = Object.freeze({
      name: phaseName(index),
      index,
      startTime: time,
      endTime: time + dt,
      duration: dt,
      jerk: phaseJerk,
      startDistance: travelled,
      startSpeed: speed,
      startAcceleration,
    });

    // Advance the cursor. Distance first: it consumes the *entry* speed.
    travelled += speed * dt + 0.5 * startAcceleration * dt * dt + (phaseJerk * dt * dt * dt) / 6;
    speed += startAcceleration * dt + 0.5 * phaseJerk * dt * dt;
    time += dt;

    return phase;
  };

  const phases: MotionPhases = [
    nextPhase(0),
    nextPhase(1),
    nextPhase(2),
    nextPhase(3),
    nextPhase(4),
    nextPhase(5),
    nextPhase(6),
  ];
  Object.freeze(phases);

  // Peak speed is the state entering `cruise`, by construction. Reading it back from the
  // accumulated cursor rather than asserting `= V` keeps the reported peak consistent with
  // the trajectory the evaluator actually produces, to the last bit.
  const peakSpeedMps = phases[3].startSpeed;

  return Object.freeze({
    kind,
    constraints: Object.freeze({
      ratedSpeedMps: constraints.ratedSpeedMps,
      acceleration: constraints.acceleration,
      jerk: constraints.jerk,
    }),
    // `|| 0` normalizes `-0` to `0`, so a zero-distance down "trip" reports 0, not -0.
    displacementM: displacement || 0,
    distanceM: distance,
    direction,
    duration,
    phases,
    peakSpeedMps,
    peakAccelerationMps2: peakAcceleration,
    reachesRatedSpeed: kind === 'speedLimited',
    // Read back from the trajectory, exactly as `peakSpeedMps` is, rather than inferred from
    // `kind` — the two genuinely disagree at both ends of the acceleration-limited band:
    //
    //   * `V < A^2/J` (e.g. a hydraulic car at V=0.5, A=0.8, J=0.8, all within
    //     data/elevator-specs.json's own hydraulic ranges): the plateau never opens, so an
    //     arbitrarily long trip is `speedLimited` with `accelerate`/`decelerate` of zero
    //     duration and a peak of `sqrt(V*J) = 0.632 < 0.8`. Inferring from `kind` claims
    //     rated acceleration that the car never sees.
    //   * `D === dSwitch` exactly: `solveDurations` solves `Ta = 0` there, and its
    //     `accelTime > 0` guard deliberately falls through to `jerkLimited` (a zero-width
    //     plateau *is* the triangle). But `Tj = cbrt(dSwitch/2J) = A/J`, so the triangle
    //     peaks at exactly rated acceleration. Inferring from `kind` denies it.
    //
    // The 8-ulp slack absorbs the rounding in `J * (A/J)`, which is within 1 ulp of `A`
    // across the whole reference envelope and over 2e6 random (A, J) pairs.
    reachesRatedAcceleration:
      peakAcceleration >= constraints.acceleration * (1 - Number.EPSILON * 8),
  });
}

/**
 * Total travel time for a distance, without building a profile.
 *
 * `Math.abs(distanceM)` is used, so a signed displacement is accepted. This is the hot path
 * for `Car.estimateCost()`, which scores thousands of hypothetical journeys per dispatch
 * decision and needs the duration but not the trajectory; it allocates nothing.
 *
 * Equal to `profileDuration(buildProfile(distanceM, constraints))` to within floating-point
 * rounding — the tests assert exact equality on 2000 random cases.
 *
 * @throws RangeError on a non-finite distance or an invalid envelope.
 */
export function travelTime(distanceM: number, constraints: MotionConstraints): number {
  assertFinite(distanceM, 'distanceM');
  assertMotionConstraints(constraints);
  const { jerkTime, accelTime, cruiseTime } = solveDurations(Math.abs(distanceM), constraints);
  return 4 * jerkTime + 2 * accelTime + cruiseTime;
}

/* -------------------------------------------------------------------------- *
 * Evaluation
 * -------------------------------------------------------------------------- */

/** Total travel time of a built profile, seconds. */
export function profileDuration(profile: MotionProfile): number {
  return profile.duration;
}

/**
 * The phase containing `tSeconds`, clamped to the profile's span.
 *
 * Collapsed (zero-duration) phases are skipped: at an instant where several phases share a
 * boundary, the *last* one starting at or before `t` wins, which is the phase the car is
 * actually entering. For a `stationary` profile every phase starts at 0 and the final phase
 * is returned.
 *
 * @throws RangeError if `tSeconds` is not finite.
 */
export function phaseAt(profile: MotionProfile, tSeconds: number): MotionPhase {
  assertFinite(tSeconds, 'tSeconds');
  let current = profile.phases[0];
  for (const phase of profile.phases) {
    if (tSeconds >= phase.startTime) {
      current = phase;
    }
  }
  return current;
}

/** The phase with a given name. Every profile has all seven, so this never fails. */
export function phaseByName(profile: MotionProfile, name: MotionPhaseName): MotionPhase {
  for (const phase of profile.phases) {
    if (phase.name === name) {
      return phase;
    }
  }
  /* c8 ignore next */
  throw new RangeError(`unknown motion phase: ${name}`);
}

/** Travel-frame state: distance covered and speed, both non-negative. */
interface TravelState {
  readonly distance: number;
  readonly speed: number;
  readonly acceleration: number;
}

/**
 * Evaluate the travel-frame cubic. Outside `[0, duration]` the car is at rest at the
 * respective end, which is what makes `positionAt` safe for a renderer that is a frame
 * ahead of, or behind, the kernel.
 */
function evaluate(profile: MotionProfile, tSeconds: number): TravelState {
  assertFinite(tSeconds, 'tSeconds');

  if (tSeconds <= 0) {
    return { distance: 0, speed: 0, acceleration: 0 };
  }
  if (tSeconds >= profile.duration) {
    return { distance: profile.distanceM, speed: 0, acceleration: 0 };
  }

  const phase = phaseAt(profile, tSeconds);
  const dt = tSeconds - phase.startTime;

  const acceleration = phase.startAcceleration + phase.jerk * dt;
  const speed = phase.startSpeed + phase.startAcceleration * dt + 0.5 * phase.jerk * dt * dt;
  const distance =
    phase.startDistance +
    phase.startSpeed * dt +
    0.5 * phase.startAcceleration * dt * dt +
    (phase.jerk * dt * dt * dt) / 6;

  // The exact trajectory satisfies 0 <= s <= D and 0 <= v <= vPeak everywhere. Clamping
  // absorbs the last-bit rounding of the accumulated phase states so those invariants hold
  // for callers as stated, not merely to within an epsilon they would have to know about.
  return {
    distance: distance < 0 ? 0 : distance > profile.distanceM ? profile.distanceM : distance,
    speed: speed < 0 ? 0 : speed > profile.peakSpeedMps ? profile.peakSpeedMps : speed,
    acceleration,
  };
}

/** Travel-frame distance covered by `tSeconds`, metres. Non-negative and non-decreasing in `t`. */
export function distanceTravelledAt(profile: MotionProfile, tSeconds: number): number {
  return evaluate(profile, tSeconds).distance;
}

/** Travel-frame speed at `tSeconds`, m/s. Non-negative, never above `peakSpeedMps`. */
export function speedAt(profile: MotionProfile, tSeconds: number): number {
  return evaluate(profile, tSeconds).speed;
}

/**
 * Signed displacement from the start of the move at `tSeconds`, metres.
 *
 * Exactly `0` at `t <= 0` and exactly `displacementM` at `t >= duration`. This is the
 * function the renderer samples at display framerate between kernel events
 * (docs/01-architecture.md § Simulation kernel).
 */
export function positionAt(profile: MotionProfile, tSeconds: number): number {
  const distance = evaluate(profile, tSeconds).distance;
  return distance === 0 ? 0 : profile.direction * distance;
}

/** Signed velocity at `tSeconds`, m/s. Zero at both ends of the move. */
export function velocityAt(profile: MotionProfile, tSeconds: number): number {
  const speed = evaluate(profile, tSeconds).speed;
  return speed === 0 ? 0 : profile.direction * speed;
}

/** Signed acceleration at `tSeconds`, m/s^2. Zero at both ends of the move. */
export function accelerationAt(profile: MotionProfile, tSeconds: number): number {
  const acceleration = evaluate(profile, tSeconds).acceleration;
  return acceleration === 0 ? 0 : profile.direction * acceleration;
}

/**
 * Full signed kinematic state at `tSeconds`. One evaluation instead of three when the caller
 * needs more than one component.
 */
export function kinematicsAt(profile: MotionProfile, tSeconds: number): Kinematics {
  const state = evaluate(profile, tSeconds);
  const direction = profile.direction;
  return {
    position: state.distance === 0 ? 0 : direction * state.distance,
    velocity: state.speed === 0 ? 0 : direction * state.speed,
    acceleration: state.acceleration === 0 ? 0 : direction * state.acceleration,
  };
}
