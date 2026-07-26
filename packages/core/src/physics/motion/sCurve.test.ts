import { describe, expect, it } from 'vitest';

import { Pcg32 } from '../../random/index.js';
import type { ResolvedCar } from '../../config/types.js';

import {
  MOTION_PHASE_NAMES,
  accelerationAt,
  assertMotionConstraints,
  buildProfile,
  distanceTravelledAt,
  kinematicsAt,
  phaseAt,
  phaseByName,
  positionAt,
  profileDuration,
  speedAt,
  travelTime,
  velocityAt,
} from './index.js';
import type { MotionConstraints, MotionProfile } from './index.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 *
 * Every envelope below is a real class from data/elevator-specs.json, so the
 * hand calculations double as a check that the reference data produces sane
 * journey times.
 * -------------------------------------------------------------------------- */

/** `geared-traction`, as configured for every car in data/buildings/midtown-office.json. */
const GEARED: MotionConstraints = { ratedSpeedMps: 2.5, acceleration: 1.0, jerk: 1.4 };

/** `mrl-gearless-low` derated to 1.0 m/s — the code-minimum 200 fpm car, for A/B comparison. */
const SLOW: MotionConstraints = { ratedSpeedMps: 1.0, acceleration: 1.0, jerk: 1.4 };

/**
 * A high acceleration / low jerk envelope. `dSwitch = 2*A^3/J^2 = 3.456 m`, so a
 * normal floor-to-floor hop lands *below* it and the profile is purely jerk-limited.
 * Both numbers are inside the reference envelope (accel max 1.5, jerk range 1.0–1.6).
 */
const SOFT: MotionConstraints = { ratedSpeedMps: 2.5, acceleration: 1.2, jerk: 1.0 };

/**
 * An envelope whose acceleration plateau never opens, because `V < A^2/J` (0.5 < 0.8).
 *
 * A `hydraulic` car at the bottom of its speed range with the top of its acceleration range:
 * every value is inside data/elevator-specs.json's `hydraulic` class (`ratedSpeedMps.min`
 * 0.5, `acceleration.max` 0.8, `jerk.typical` 0.8), and all three are per-car overridable
 * through `carConfigSchema`, so this is a configuration a user can actually write.
 *
 * The jerk ramps alone reach rated speed here, so `dRated` (0.791 m) is *below* `dSwitch`
 * (1.6 m): the acceleration-limited band does not exist, and no trip of any length reaches
 * rated acceleration.
 */
const NO_PLATEAU: MotionConstraints = { ratedSpeedMps: 0.5, acceleration: 0.8, jerk: 0.8 };

/** Floor pitch of data/buildings/midtown-office.json above the double-height lobby. */
const FLOOR_PITCH_M = 3.8;

/* -------------------------------------------------------------------------- *
 * Shared assertions
 * -------------------------------------------------------------------------- */

/** Loose bound for "not beyond a limit, allowing for last-bit rounding". */
function withinLimit(value: number, limit: number): boolean {
  return Math.abs(value) <= limit * (1 + 1e-9) + 1e-12;
}

/**
 * The distance and speed the phase table *implies* at the end of the move, computed
 * straight from the stored phase fields with no clamping. This is the check that the
 * duration solver is right; `positionAt` clamps its output, so asserting only on
 * `positionAt` could hide a solver error of any size.
 */
function impliedTerminalState(profile: MotionProfile): { distance: number; speed: number } {
  const last = profile.phases[6];
  const d = last.duration;
  return {
    distance:
      last.startDistance +
      last.startSpeed * d +
      0.5 * last.startAcceleration * d * d +
      (last.jerk * d * d * d) / 6,
    speed: last.startSpeed + last.startAcceleration * d + 0.5 * last.jerk * d * d,
  };
}

/**
 * Every correctness invariant the module promises, checked on one profile.
 *
 * Returns violations rather than asserting, so the property test can run 2000 profiles
 * without paying `expect()`'s per-call cost 800,000 times, and so a failure names the
 * invariant and the instant instead of a bare line number.
 */
function checkProfileInvariants(profile: MotionProfile, samples = 64): string[] {
  const { constraints, distanceM, duration } = profile;
  const bad: string[] = [];
  const fail = (message: string): void => {
    if (bad.length < 5) bad.push(message);
  };

  // Durations are real, non-negative, and add up.
  if (!Number.isFinite(duration) || duration < 0) fail(`duration ${duration}`);
  let summed = 0;
  for (const phase of profile.phases) {
    if (!Number.isFinite(phase.duration) || phase.duration < 0) {
      fail(`${phase.name}.duration ${phase.duration}`);
    }
    if (!withinLimit(phase.jerk, constraints.jerk)) {
      fail(`${phase.name}.jerk ${phase.jerk} exceeds ${constraints.jerk}`);
    }
    if (phase.startTime !== summed) fail(`${phase.name}.startTime ${phase.startTime} != ${summed}`);
    summed += phase.duration;
  }
  if (Math.abs(summed - duration) > 1e-9 * Math.max(1, duration)) {
    fail(`phase durations sum to ${summed}, duration is ${duration}`);
  }

  // The profile lands exactly on target and exactly at rest, before any clamping. This is
  // the check that the duration solver is right rather than merely well-clamped.
  const implied = impliedTerminalState(profile);
  const scale = Math.max(1, distanceM);
  if (Math.abs(implied.distance - distanceM) > 1e-9 * scale) {
    fail(`implied terminal distance ${implied.distance} != ${distanceM}`);
  }
  if (Math.abs(implied.speed) > 1e-9 * Math.max(1, profile.peakSpeedMps)) {
    fail(`implied terminal speed ${implied.speed} != 0`);
  }

  // Endpoints, exactly.
  if (!Object.is(positionAt(profile, 0), 0)) fail(`positionAt(0) is ${positionAt(profile, 0)}`);
  if (!Object.is(velocityAt(profile, 0), 0)) fail(`velocityAt(0) is ${velocityAt(profile, 0)}`);
  if (!Object.is(accelerationAt(profile, 0), 0)) fail('accelerationAt(0) is not 0');
  if (Math.abs(positionAt(profile, duration) - profile.displacementM) > 1e-9) {
    fail(`positionAt(T) is ${positionAt(profile, duration)}, want ${profile.displacementM}`);
  }
  if (velocityAt(profile, duration) !== 0) fail('velocityAt(T) is not 0');

  // Interior: bounded speed, bounded acceleration, monotone distance, no overshoot.
  let previous = -1;
  for (let i = 0; i <= samples; i++) {
    const t = (duration * i) / samples;
    const k = kinematicsAt(profile, t);
    const travelled = distanceTravelledAt(profile, t);
    const speed = speedAt(profile, t);

    if (!Number.isFinite(k.position) || !Number.isFinite(k.velocity) || !Number.isFinite(k.acceleration)) {
      fail(`non-finite kinematics at t=${t}`);
    }
    if (travelled < previous) fail(`distance decreased at t=${t}: ${previous} -> ${travelled}`);
    previous = travelled;

    if (travelled < 0 || travelled > distanceM + 1e-9 * scale) {
      fail(`distance ${travelled} outside [0, ${distanceM}] at t=${t}`);
    }
    if (speed < 0) fail(`negative speed ${speed} at t=${t}`);
    if (!withinLimit(speed, constraints.ratedSpeedMps)) {
      fail(`speed ${speed} exceeds rated ${constraints.ratedSpeedMps} at t=${t}`);
    }
    if (!withinLimit(k.acceleration, constraints.acceleration)) {
      fail(`acceleration ${k.acceleration} exceeds ${constraints.acceleration} at t=${t}`);
    }

    // Signed accessors agree with the travel-frame ones, and never point backwards.
    if (Math.abs(k.position) !== travelled) fail(`position/distance disagree at t=${t}`);
    if (Math.abs(k.velocity) !== speed) fail(`velocity/speed disagree at t=${t}`);
    if (profile.direction !== 0 && k.position !== 0 && Math.sign(k.position) !== profile.direction) {
      fail(`position ${k.position} has the wrong sign at t=${t}`);
    }
  }

  return bad;
}

/** `checkProfileInvariants` as a single assertion, for the hand-calculated cases. */
function assertProfileInvariants(profile: MotionProfile, samples = 64): void {
  expect(checkProfileInvariants(profile, samples)).toEqual([]);
}

/* -------------------------------------------------------------------------- *
 * Hand calculations
 * -------------------------------------------------------------------------- */

describe('hand-calculated travel times', () => {
  /*
   * Long journey, all seven phases present. Geared traction: V = 2.5 m/s,
   * A = 1.0 m/s^2, J = 1.4 m/s^3. Distance D = 35 m.
   *
   *   Ramp to rated acceleration      Tj = A/J   = 1.0/1.4        = 0.714285714 s
   *   Rated speed is reached iff V >= A^2/J = 0.714285714 m/s.  2.5 >= 0.714 ✓
   *   Constant-acceleration plateau   Ta = V/A - Tj = 2.5 - 0.714285714
   *                                                              = 1.785714286 s
   *   Acceleration segment           Tacc = 2*Tj + Ta            = 3.214285714 s
   *   Mean speed while accelerating is exactly V/2 (the acceleration trace is
   *   symmetric about its midpoint), so
   *   Distance to reach rated speed    = V * Tacc / 2 = 2.5 * 3.214285714 / 2
   *                                                              = 4.017857143 m
   *   Both ends                        = 8.035714286 m           (= dRated)
   *   35 m > 8.036 m, so a cruise phase exists:
   *   Cruise distance                  = 35 - 8.035714286        = 26.964285714 m
   *   Cruise time                 Tv   = 26.964285714 / 2.5      = 10.785714286 s
   *   Total              T = 2*Tacc + Tv = 6.428571429 + 10.785714286
   *                                                              = 17.214285714 s
   *
   * Equivalently, and this is the useful closed form for the speed-limited case,
   *   T = D/V + V/A + A/J = 14 + 2.5 + 0.714285714 = 17.214285714 s.
   * The lost time V/A + A/J = 3.214 s is the price of getting up to speed and back
   * down again; it is independent of distance.
   */
  it('matches the hand calculation for a 35 m journey', () => {
    const profile = buildProfile(35, GEARED);
    const expected = 35 / 2.5 + 2.5 / 1.0 + 1.0 / 1.4;

    expect(expected).toBeCloseTo(17.214285714285715, 12);
    expect(profile.duration).toBeCloseTo(expected, 12);
    // The roadmap's tolerance, stated explicitly rather than implied by toBeCloseTo.
    expect(Math.abs(profile.duration - expected) / expected).toBeLessThan(0.01);

    expect(profile.kind).toBe('speedLimited');
    expect(profile.peakSpeedMps).toBeCloseTo(2.5, 12);
    expect(profile.peakAccelerationMps2).toBeCloseTo(1.0, 12);
    assertProfileInvariants(profile);
  });

  /*
   * ROADMAP PHASE 1 ACCEPTANCE: "a car traversing 10 floors matches a hand-calculated
   * S-curve travel time within 1%".
   *
   * Ten floor-to-floor gaps of the Midtown Office pitch, 10 * 3.8 m = 38 m, in a
   * geared-traction car (V = 2.5, A = 1.0, J = 1.4) exactly as configured in
   * data/buildings/midtown-office.json.
   *
   *   dRated = V*(V/A + A/J) = 2.5 * (2.5 + 0.714285714) = 8.035714286 m < 38 m,
   *   so rated speed is reached and T = D/V + V/A + A/J:
   *
   *   T = 38/2.5 + 2.5/1.0 + 1.0/1.4
   *     = 15.2 + 2.5 + 0.714285714
   *     = 18.414285714 s
   *
   * Cross-check by phases: Tj = 0.714285714, Ta = 1.785714286, Tacc = 3.214285714,
   * accel+decel distance 8.035714286 m, cruise 29.964285714 m -> Tv = 11.985714286 s,
   * T = 2*3.214285714 + 11.985714286 = 18.414285714 s. ✓
   */
  it('roadmap acceptance: 10 floors of Midtown Office within 1% of hand calculation', () => {
    const distance = 10 * FLOOR_PITCH_M;
    const profile = buildProfile(distance, GEARED);

    const handCalculated = 18.414285714285715;
    const relativeError = Math.abs(profile.duration - handCalculated) / handCalculated;
    expect(relativeError).toBeLessThan(0.01);
    // Far tighter than the acceptance criterion, so a regression cannot hide inside it.
    expect(profile.duration).toBeCloseTo(handCalculated, 12);

    // And the phase breakdown from the same hand calculation.
    expect(phaseByName(profile, 'jerkToAccel').duration).toBeCloseTo(0.714285714285714, 12);
    expect(phaseByName(profile, 'accelerate').duration).toBeCloseTo(1.785714285714286, 12);
    expect(phaseByName(profile, 'cruise').duration).toBeCloseTo(11.985714285714286, 12);
    assertProfileInvariants(profile);
  });

  /*
   * Acceleration-limited hand calculation, one floor of Midtown Office (3.8 m) in the
   * geared-traction car. dSwitch = 2*A^3/J^2 = 2/1.96 = 1.020408 m and
   * dRated = 8.035714 m, so 1.02 <= 3.8 < 8.04: the plateau exists, cruise does not.
   *
   *   Tj = A/J = 0.714285714 s
   *   Ta = ( sqrt(Tj^2 + 4D/A) - 3*Tj ) / 2
   *      = ( sqrt(0.510204082 + 15.2) - 2.142857143 ) / 2
   *      = ( sqrt(15.710204082) - 2.142857143 ) / 2
   *      = ( 3.963609675 - 2.142857143 ) / 2
   *      = 0.910376266 s
   *   T  = 4*Tj + 2*Ta = 2.857142857 + 1.820752532 = 4.677895389 s
   *   vPeak = A*(Tj + Ta) = 1.624662 m/s   -- 65% of the 2.5 m/s rating
   */
  it('matches the hand calculation for a single-floor acceleration-limited hop', () => {
    const profile = buildProfile(FLOOR_PITCH_M, GEARED);

    expect(profile.kind).toBe('accelerationLimited');
    expect(profile.duration).toBeCloseTo(4.677895695304615, 9);
    expect(Math.abs(profile.duration - 4.6778957) / 4.6778957).toBeLessThan(0.01);
    expect(profile.peakSpeedMps).toBeCloseTo(1.6246621333665932, 9);
    expect(profile.peakAccelerationMps2).toBeCloseTo(1.0, 12);
    assertProfileInvariants(profile);
  });

  /*
   * Jerk-limited hand calculation. SOFT envelope: A = 1.2, J = 1.0, so
   * dSwitch = 2*A^3/J^2 = 2*1.728 = 3.456 m. A 3.0 m move is below that, so the
   * acceleration trace is a pure triangle and rated acceleration is never reached.
   *
   *   D = 2*J*Tj^3  =>  Tj = cbrt(D / (2J)) = cbrt(1.5) = 1.144714243 s
   *   T = 4*Tj                                          = 4.578856970 s
   *   aPeak = J*Tj                                      = 1.144714243 m/s^2  (< 1.2 ✓)
   *   vPeak = J*Tj^2                                    = 1.310370697 m/s    (< 2.5 ✓)
   */
  it('matches the hand calculation for a jerk-limited hop', () => {
    const profile = buildProfile(3.0, SOFT);

    expect(profile.kind).toBe('jerkLimited');
    expect(profile.duration).toBeCloseTo(4.578856970213328, 9);
    expect(Math.abs(profile.duration - 4.5788570) / 4.5788570).toBeLessThan(0.01);
    expect(profile.peakAccelerationMps2).toBeCloseTo(1.1447142425533319, 9);
    expect(profile.peakSpeedMps).toBeCloseTo(1.3103706971044484, 9);
    assertProfileInvariants(profile);
  });
});

/* -------------------------------------------------------------------------- *
 * Degenerate cases (a)-(e)
 * -------------------------------------------------------------------------- */

describe('degenerate cases', () => {
  it('(a) long journey: all seven phases have positive duration', () => {
    const profile = buildProfile(60, GEARED);

    expect(profile.kind).toBe('speedLimited');
    expect(profile.reachesRatedSpeed).toBe(true);
    expect(profile.reachesRatedAcceleration).toBe(true);
    for (const phase of profile.phases) {
      expect(phase.duration).toBeGreaterThan(0);
    }
    expect(phaseByName(profile, 'cruise').duration).toBeGreaterThan(0);
    assertProfileInvariants(profile);
  });

  it('(b) medium journey: cruise collapses, constant-acceleration phases survive', () => {
    // dSwitch = 1.0204 m <= 3.8 m < dRated = 8.0357 m.
    const profile = buildProfile(FLOOR_PITCH_M, GEARED);

    expect(profile.kind).toBe('accelerationLimited');
    expect(profile.reachesRatedSpeed).toBe(false);
    expect(profile.reachesRatedAcceleration).toBe(true);

    expect(phaseByName(profile, 'cruise').duration).toBe(0);
    expect(phaseByName(profile, 'accelerate').duration).toBeGreaterThan(0);
    expect(phaseByName(profile, 'decelerate').duration).toBeGreaterThan(0);
    for (const name of ['jerkToAccel', 'jerkToCruise', 'jerkToDecel', 'jerkToStop'] as const) {
      expect(phaseByName(profile, name).duration).toBeGreaterThan(0);
    }

    expect(profile.peakSpeedMps).toBeLessThan(GEARED.ratedSpeedMps);
    expect(profile.peakAccelerationMps2).toBeCloseTo(GEARED.acceleration, 12);
    assertProfileInvariants(profile);
  });

  it('(c) short journey: constant-acceleration phases collapse too (pure jerk-limited)', () => {
    // The one-floor hop case, and the reason a fast car is not proportionally faster.
    const profile = buildProfile(3.0, SOFT);

    expect(profile.kind).toBe('jerkLimited');
    expect(profile.reachesRatedSpeed).toBe(false);
    expect(profile.reachesRatedAcceleration).toBe(false);

    expect(phaseByName(profile, 'cruise').duration).toBe(0);
    expect(phaseByName(profile, 'accelerate').duration).toBe(0);
    expect(phaseByName(profile, 'decelerate').duration).toBe(0);
    for (const name of ['jerkToAccel', 'jerkToCruise', 'jerkToDecel', 'jerkToStop'] as const) {
      expect(phaseByName(profile, name).duration).toBeGreaterThan(0);
    }

    // Triangular acceleration: it peaks exactly at the end of the first ramp and the
    // plateau never opens.
    expect(profile.peakAccelerationMps2).toBeLessThan(SOFT.acceleration);
    expect(profile.peakSpeedMps).toBeLessThan(SOFT.ratedSpeedMps);
    const rampEnd = phaseByName(profile, 'jerkToAccel').endTime;
    expect(accelerationAt(profile, rampEnd)).toBeCloseTo(profile.peakAccelerationMps2, 9);
    assertProfileInvariants(profile);
  });

  it('(d) zero distance: duration 0, position constant, nothing is NaN', () => {
    const profile = buildProfile(0, GEARED);

    expect(profile.kind).toBe('stationary');
    expect(profile.duration).toBe(0);
    expect(profile.distanceM).toBe(0);
    expect(profile.direction).toBe(0);
    expect(profile.peakSpeedMps).toBe(0);
    expect(profile.peakAccelerationMps2).toBe(0);
    expect(profile.reachesRatedSpeed).toBe(false);
    expect(profile.reachesRatedAcceleration).toBe(false);

    for (const phase of profile.phases) {
      expect(phase.duration).toBe(0);
      expect(phase.startTime).toBe(0);
      expect(phase.endTime).toBe(0);
    }

    for (const t of [-5, -1e-9, 0, 1e-9, 0.5, 1e6]) {
      const k = kinematicsAt(profile, t);
      expect(k.position).toBe(0);
      expect(k.velocity).toBe(0);
      expect(k.acceleration).toBe(0);
      expect(Number.isNaN(positionAt(profile, t))).toBe(false);
    }

    // And the same for a signed zero, which must not read as a downward move.
    const negativeZero = buildProfile(-0, GEARED);
    expect(negativeZero.direction).toBe(0);
    expect(Object.is(negativeZero.displacementM, 0)).toBe(true);
    expect(Object.is(positionAt(negativeZero, 1), 0)).toBe(true);
  });

  it('(e) millimetre distances: finite, non-negative, no overshoot', () => {
    for (const distance of [1e-3, 1e-4, 1e-6, 1e-9, 1e-12, 1e-300]) {
      for (const constraints of [GEARED, SLOW, SOFT]) {
        const profile = buildProfile(distance, constraints);

        expect(profile.kind).toBe('jerkLimited');
        expect(Number.isFinite(profile.duration)).toBe(true);
        expect(profile.duration).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(profile.peakSpeedMps)).toBe(false);

        for (const phase of profile.phases) {
          expect(Number.isFinite(phase.duration)).toBe(true);
          expect(phase.duration).toBeGreaterThanOrEqual(0);
        }

        // Never overshoots: sampled anywhere, distance travelled stays within the target.
        for (let i = 0; i <= 50; i++) {
          const travelled = distanceTravelledAt(profile, (profile.duration * i) / 50);
          expect(Number.isNaN(travelled)).toBe(false);
          expect(travelled).toBeGreaterThanOrEqual(0);
          expect(travelled).toBeLessThanOrEqual(distance);
        }
        expect(positionAt(profile, profile.duration)).toBe(distance);
      }
    }
  });

  it('(e) a distance below floating-point resolution degrades to stationary, not to a broken profile', () => {
    // cbrt(MIN_VALUE / 2J) underflows to 0, so the seven-phase solution would have zero
    // duration and a non-zero target. Snapping to stationary keeps every endpoint
    // invariant exactly true instead of approximately.
    const profile = buildProfile(Number.MIN_VALUE, GEARED);

    expect(profile.kind).toBe('stationary');
    expect(profile.duration).toBe(0);
    expect(profile.distanceM).toBe(0);
    expect(profile.direction).toBe(0);
    expect(positionAt(profile, 0)).toBe(0);
    expect(positionAt(profile, 1)).toBe(profile.displacementM);
    expect(travelTime(Number.MIN_VALUE, GEARED)).toBe(0);
  });

  it('(e) a millimetre hop is jerk-limited and takes a non-trivial fraction of a second', () => {
    // 1 mm in the geared car: Tj = cbrt(0.001/2.8) = 0.0709 s, T = 4*Tj = 0.2838 s.
    const profile = buildProfile(1e-3, GEARED);
    expect(profile.duration).toBeCloseTo(4 * Math.cbrt(1e-3 / (2 * 1.4)), 12);
    expect(profile.duration).toBeCloseTo(0.2837966823940768, 12);
    assertProfileInvariants(profile);
  });
});

/* -------------------------------------------------------------------------- *
 * The claim the whole module exists to reproduce
 * -------------------------------------------------------------------------- */

describe('short hops do not reach rated speed', () => {
  it('a one-floor hop in a 2.5 m/s car peaks well below rated speed', () => {
    const profile = buildProfile(FLOOR_PITCH_M, GEARED);

    expect(profile.reachesRatedSpeed).toBe(false);
    expect(profile.peakSpeedMps).toBeLessThan(GEARED.ratedSpeedMps);
    // Explicit: it reaches roughly 65% of rated speed, not 100%.
    expect(profile.peakSpeedMps / GEARED.ratedSpeedMps).toBeLessThan(0.7);

    // Sampled everywhere, not just at the analytic peak.
    for (let i = 0; i <= 500; i++) {
      expect(speedAt(profile, (profile.duration * i) / 500)).toBeLessThan(GEARED.ratedSpeedMps);
    }
  });

  it('a 2.5x faster car is not 2.5x faster over six storeys', () => {
    // Five floor-to-floor gaps plus the double-height lobby: G -> 6 in Midtown Office
    // is 20.2 m. This is the docs/02-elevator-reference.md claim, as a test.
    const rise = 20.2;
    const slow = travelTime(rise, SLOW);
    const fast = travelTime(rise, GEARED);

    const speedRatio = GEARED.ratedSpeedMps / SLOW.ratedSpeedMps;
    expect(speedRatio).toBe(2.5);

    const timeRatio = slow / fast;
    expect(timeRatio).toBeLessThan(2.0);
    expect(timeRatio).toBeGreaterThan(1.5);
  });

  it('a 2.5x faster car is barely faster over one floor', () => {
    const slow = travelTime(FLOOR_PITCH_M, SLOW);
    const fast = travelTime(FLOOR_PITCH_M, GEARED);

    // 5.514 s versus 4.678 s: 18% better for 150% more rated speed.
    expect(slow / fast).toBeLessThan(1.2);
    expect(slow / fast).toBeGreaterThan(1.0);
  });

  it('rated speed is reached only once the trip exceeds the threshold distance', () => {
    // dRated = V*(V/A + A/J) for V >= A^2/J.
    const dRated = 2.5 * (2.5 / 1.0 + 1.0 / 1.4);
    expect(dRated).toBeCloseTo(8.035714285714286, 12);

    expect(buildProfile(dRated * 0.999, GEARED).reachesRatedSpeed).toBe(false);
    expect(buildProfile(dRated, GEARED).reachesRatedSpeed).toBe(true);
    expect(buildProfile(dRated * 1.001, GEARED).reachesRatedSpeed).toBe(true);

    // Exactly at the threshold, rated speed is reached but cruise has zero duration.
    const atThreshold = buildProfile(dRated, GEARED);
    expect(atThreshold.kind).toBe('speedLimited');
    expect(phaseByName(atThreshold, 'cruise').duration).toBeCloseTo(0, 12);
    expect(atThreshold.peakSpeedMps).toBeCloseTo(2.5, 9);
  });

  it('rated acceleration is reached only once the trip exceeds dSwitch', () => {
    // dSwitch = 2*A^3/J^2.
    const dSwitch = (2 * SOFT.acceleration ** 3) / SOFT.jerk ** 2;
    expect(dSwitch).toBeCloseTo(3.456, 12);

    expect(buildProfile(dSwitch * 0.999, SOFT).kind).toBe('jerkLimited');
    expect(buildProfile(dSwitch * 1.001, SOFT).kind).toBe('accelerationLimited');
    expect(buildProfile(dSwitch, SOFT).peakAccelerationMps2).toBeCloseTo(SOFT.acceleration, 9);
  });
});

/* -------------------------------------------------------------------------- *
 * reachesRatedAcceleration is a statement about the trajectory
 *
 * `kind` names which constraint *binds*; `reachesRatedAcceleration` reports what the
 * acceleration trace actually did. They are not the same predicate, and the two cases
 * below are exactly where they part company. Deriving the flag from `kind` — which is
 * the obvious-looking shortcut — is wrong in both directions.
 * -------------------------------------------------------------------------- */

describe('reachesRatedAcceleration is read from the peak, not inferred from kind', () => {
  it('a speed-limited profile whose plateau never opens does not claim rated acceleration', () => {
    // V < A^2/J, so the two jerk ramps alone carry the car to rated speed and the
    // constant-acceleration phases never open, however long the trip.
    expect(NO_PLATEAU.acceleration ** 2 / NO_PLATEAU.jerk).toBeGreaterThan(
      NO_PLATEAU.ratedSpeedMps,
    );

    const profile = buildProfile(15, NO_PLATEAU);

    expect(profile.kind).toBe('speedLimited');
    expect(profile.reachesRatedSpeed).toBe(true);
    // Inferring from `kind` reported `true` here.
    expect(profile.reachesRatedAcceleration).toBe(false);

    // The peak is sqrt(V*J) = 0.632, 21% short of the 0.8 rating.
    expect(profile.peakAccelerationMps2).toBeCloseTo(
      Math.sqrt(NO_PLATEAU.ratedSpeedMps * NO_PLATEAU.jerk),
      12,
    );
    expect(profile.peakAccelerationMps2).toBeCloseTo(0.6324555320336759, 12);
    expect(profile.peakAccelerationMps2 / NO_PLATEAU.acceleration).toBeLessThan(0.8);

    // The phases that would carry rated acceleration are collapsed even though this is a
    // `speedLimited` profile with a long cruise — so "speedLimited means all seven phases
    // are present" is false too.
    expect(phaseByName(profile, 'accelerate').duration).toBe(0);
    expect(phaseByName(profile, 'decelerate').duration).toBe(0);
    expect(phaseByName(profile, 'cruise').duration).toBeGreaterThan(0);

    assertProfileInvariants(profile);
  });

  it('no trip length whatsoever reaches rated acceleration when the plateau cannot open', () => {
    // The defect was distance-independent: it is a property of the envelope, so sweeping
    // distance is the honest check. dRated = 0.791 m, so everything from 1 m up is
    // `speedLimited` and every one of them used to claim rated acceleration.
    for (const distance of [1e-3, 0.1, 0.79, 1, 15, 100, 5000]) {
      const profile = buildProfile(distance, NO_PLATEAU);
      expect(profile.reachesRatedAcceleration).toBe(false);
      expect(profile.peakAccelerationMps2).toBeLessThan(NO_PLATEAU.acceleration);
      // Capped at sqrt(V*J) — the peak the ramps reach when they alone carry the car to
      // rated speed. `1 + 1e-12` because the profile computes it as J*sqrt(V/J), which is
      // the same quantity one rounding step apart.
      expect(profile.peakAccelerationMps2).toBeLessThanOrEqual(
        Math.sqrt(NO_PLATEAU.ratedSpeedMps * NO_PLATEAU.jerk) * (1 + 1e-12),
      );
      // `accelerationLimited` is unreachable for this envelope: dRated < dSwitch.
      expect(profile.kind).not.toBe('accelerationLimited');
    }
  });

  it('a trip of exactly dSwitch is labelled jerkLimited yet does touch rated acceleration', () => {
    // The mirror error. At D = dSwitch the plateau solves to Ta = 0, and the solver's
    // `accelTime > 0` guard deliberately falls through to `jerkLimited` — a zero-width
    // plateau *is* the triangle. But Tj = cbrt(dSwitch/2J) = A/J, so the triangle peaks at
    // exactly rated acceleration. Inferring from `kind` reported `false` here.
    const dSwitch = (2 * SOFT.acceleration ** 3) / SOFT.jerk ** 2;
    const profile = buildProfile(dSwitch, SOFT);

    expect(profile.kind).toBe('jerkLimited');
    expect(phaseByName(profile, 'accelerate').duration).toBe(0);
    expect(profile.peakAccelerationMps2).toBe(SOFT.acceleration);
    expect(profile.reachesRatedAcceleration).toBe(true);
    assertProfileInvariants(profile);
  });

  it('agrees with the reported peak across every regime of the reference envelopes', () => {
    // The general contract, stated once: the flag is a summary of peakAccelerationMps2 and
    // must never contradict it.
    for (const constraints of [GEARED, SLOW, SOFT, NO_PLATEAU]) {
      const dSwitch = (2 * constraints.acceleration ** 3) / constraints.jerk ** 2;
      for (const distance of [0, 1e-6, dSwitch / 2, dSwitch, dSwitch * 2, 3.8, 38, 400]) {
        const profile = buildProfile(distance, constraints);
        const atRated =
          profile.peakAccelerationMps2 >= constraints.acceleration * (1 - Number.EPSILON * 8);
        expect(profile.reachesRatedAcceleration).toBe(atRated);
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Monotonicity
 * -------------------------------------------------------------------------- */

describe('monotonicity', () => {
  it('position is non-decreasing over 1000 samples of an upward journey', () => {
    const profile = buildProfile(42, GEARED);

    let previous = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 1000; i++) {
      const t = (profile.duration * i) / 999;
      const position = positionAt(profile, t);
      expect(position).toBeGreaterThanOrEqual(previous);
      previous = position;
    }
    expect(previous).toBeCloseTo(42, 9);
  });

  it('position is non-increasing over 1000 samples of a downward journey', () => {
    const profile = buildProfile(-42, GEARED);

    let previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 1000; i++) {
      const t = (profile.duration * i) / 999;
      const position = positionAt(profile, t);
      expect(position).toBeLessThanOrEqual(previous);
      previous = position;
    }
    expect(previous).toBeCloseTo(-42, 9);
  });

  it('distance travelled is non-decreasing for every profile kind', () => {
    const cases: readonly (readonly [number, MotionConstraints])[] = [
      [0, GEARED],
      [1e-6, GEARED],
      [3.0, SOFT],
      [FLOOR_PITCH_M, GEARED],
      [-FLOOR_PITCH_M, GEARED],
      [200, GEARED],
      [5, { ratedSpeedMps: 0.5, acceleration: 1.2, jerk: 1.0 }],
    ];

    for (const [displacement, constraints] of cases) {
      const profile = buildProfile(displacement, constraints);
      let previous = -1;
      for (let i = 0; i < 1000; i++) {
        // Deliberately overshoot the ends by 5% to exercise the clamping.
        const t = profile.duration * (-0.05 + (1.1 * i) / 999);
        const travelled = distanceTravelledAt(profile, t);
        expect(travelled).toBeGreaterThanOrEqual(previous);
        previous = travelled;
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Analytic consistency
 * -------------------------------------------------------------------------- */

describe('analytic consistency', () => {
  it('velocity is the derivative of position', () => {
    const profile = buildProfile(38, GEARED);
    const h = 1e-6;

    for (let i = 1; i < 200; i++) {
      const t = (profile.duration * i) / 200;
      const numerical = (positionAt(profile, t + h) - positionAt(profile, t - h)) / (2 * h);
      expect(numerical).toBeCloseTo(velocityAt(profile, t), 6);
    }
  });

  it('acceleration is the derivative of velocity', () => {
    const profile = buildProfile(38, GEARED);
    const h = 1e-6;

    for (let i = 1; i < 200; i++) {
      const t = (profile.duration * i) / 200;
      // Skip the four jerk discontinuities, where the one-sided derivatives differ.
      const nearBoundary = profile.phases.some(
        (phase) => Math.abs(t - phase.startTime) < 10 * h || Math.abs(t - phase.endTime) < 10 * h,
      );
      if (nearBoundary) continue;

      const numerical = (velocityAt(profile, t + h) - velocityAt(profile, t - h)) / (2 * h);
      expect(numerical).toBeCloseTo(accelerationAt(profile, t), 5);
    }
  });

  it('integrating speed reproduces the distance', () => {
    for (const [distance, constraints] of [
      [38, GEARED],
      [FLOOR_PITCH_M, GEARED],
      [3.0, SOFT],
      [0.05, SOFT],
    ] as const) {
      const profile = buildProfile(distance, constraints);
      // Composite Simpson over an even number of intervals.
      const n = 2000;
      const h = profile.duration / n;
      let sum = speedAt(profile, 0) + speedAt(profile, profile.duration);
      for (let i = 1; i < n; i++) {
        sum += (i % 2 === 0 ? 2 : 4) * speedAt(profile, i * h);
      }
      expect((sum * h) / 3).toBeCloseTo(distance, 6);
    }
  });

  it('is symmetric in time: s(t) + s(T - t) === D', () => {
    const profile = buildProfile(38, GEARED);
    for (let i = 0; i <= 200; i++) {
      const t = (profile.duration * i) / 200;
      const forward = distanceTravelledAt(profile, t);
      const mirrored = distanceTravelledAt(profile, profile.duration - t);
      expect(forward + mirrored).toBeCloseTo(38, 9);
      expect(speedAt(profile, t)).toBeCloseTo(speedAt(profile, profile.duration - t), 9);
    }
  });

  it('each phase hands off exactly the state the next phase starts from', () => {
    // The strict form of continuity: no epsilon, no sampling. Integrate each phase's cubic
    // over its own duration and compare with the stored start state of its successor.
    for (const [distance, constraints] of [
      [38, GEARED],
      [FLOOR_PITCH_M, GEARED],
      [3.0, SOFT],
    ] as const) {
      const profile = buildProfile(distance, constraints);
      for (let i = 0; i < 6; i++) {
        const phase = profile.phases[i];
        const next = profile.phases[i + 1];
        if (phase === undefined || next === undefined) continue;
        const d = phase.duration;

        const endDistance =
          phase.startDistance +
          phase.startSpeed * d +
          0.5 * phase.startAcceleration * d * d +
          (phase.jerk * d * d * d) / 6;
        const endSpeed = phase.startSpeed + phase.startAcceleration * d + 0.5 * phase.jerk * d * d;
        const endAcceleration = phase.startAcceleration + phase.jerk * d;

        expect(next.startDistance).toBeCloseTo(endDistance, 12);
        expect(next.startSpeed).toBeCloseTo(endSpeed, 12);
        // Acceleration is continuous too — that is exactly what jerk limiting buys, and
        // what a trapezoidal-velocity model would get wrong.
        expect(next.startAcceleration).toBeCloseTo(endAcceleration, 12);
        expect(next.startTime).toBeCloseTo(phase.endTime, 12);
      }
    }
  });

  it('sampled kinematics do not jump at a phase boundary', () => {
    const profile = buildProfile(38, GEARED);
    const h = 1e-9;

    for (const phase of profile.phases) {
      for (const boundary of [phase.startTime, phase.endTime]) {
        if (boundary <= h || boundary >= profile.duration - h) continue;
        const before = kinematicsAt(profile, boundary - h);
        const after = kinematicsAt(profile, boundary + h);

        // Across 2h the state may only change by as much as the bounding rates allow. A
        // genuine discontinuity would exceed these by orders of magnitude.
        expect(Math.abs(after.position - before.position)).toBeLessThan(
          profile.peakSpeedMps * 2 * h + 1e-12,
        );
        expect(Math.abs(after.velocity - before.velocity)).toBeLessThan(
          profile.peakAccelerationMps2 * 2 * h + 1e-12,
        );
        expect(Math.abs(after.acceleration - before.acceleration)).toBeLessThan(
          GEARED.jerk * 2 * h + 1e-12,
        );
      }
    }
  });

  it('phase start states match the evaluator at the phase start', () => {
    const profile = buildProfile(38, GEARED);
    for (const phase of profile.phases) {
      expect(distanceTravelledAt(profile, phase.startTime)).toBeCloseTo(phase.startDistance, 9);
      expect(speedAt(profile, phase.startTime)).toBeCloseTo(phase.startSpeed, 9);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Direction
 * -------------------------------------------------------------------------- */

describe('direction', () => {
  it('up and down travel mirror each other exactly', () => {
    const up = buildProfile(38, GEARED);
    const down = buildProfile(-38, GEARED);

    expect(up.direction).toBe(1);
    expect(down.direction).toBe(-1);
    expect(down.duration).toBe(up.duration);
    expect(down.distanceM).toBe(up.distanceM);
    expect(down.displacementM).toBe(-38);
    expect(down.kind).toBe(up.kind);
    expect(down.peakSpeedMps).toBe(up.peakSpeedMps);

    for (let i = 0; i <= 100; i++) {
      const t = (up.duration * i) / 100;
      // `|| 0` keeps `-0` out of the comparison: the signed accessors normalize a zero
      // result to `+0` in both directions, deliberately.
      expect(positionAt(down, t)).toBe(-positionAt(up, t) || 0);
      expect(velocityAt(down, t)).toBe(-velocityAt(up, t) || 0);
      expect(accelerationAt(down, t)).toBe(-accelerationAt(up, t) || 0);
      expect(distanceTravelledAt(down, t)).toBe(distanceTravelledAt(up, t));
      expect(speedAt(down, t)).toBe(speedAt(up, t));
    }

    expect(positionAt(down, down.duration)).toBeCloseTo(-38, 9);
    assertProfileInvariants(down);
  });

  it('travelTime ignores the sign of the displacement', () => {
    expect(travelTime(-38, GEARED)).toBe(travelTime(38, GEARED));
    expect(travelTime(-1e-6, SOFT)).toBe(travelTime(1e-6, SOFT));
  });
});

/* -------------------------------------------------------------------------- *
 * API surface behaviour
 * -------------------------------------------------------------------------- */

describe('API behaviour', () => {
  it('exposes the seven phases in canonical order', () => {
    const profile = buildProfile(38, GEARED);
    expect(profile.phases.map((phase) => phase.name)).toEqual([...MOTION_PHASE_NAMES]);
    expect(profile.phases.map((phase) => phase.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('travelTime agrees with profileDuration', () => {
    for (const [distance, constraints] of [
      [0, GEARED],
      [1e-9, GEARED],
      [3.0, SOFT],
      [FLOOR_PITCH_M, GEARED],
      [38, GEARED],
      [500, GEARED],
    ] as const) {
      expect(travelTime(distance, constraints)).toBe(
        profileDuration(buildProfile(distance, constraints)),
      );
    }
  });

  it('phaseAt selects the phase containing the instant, skipping collapsed phases', () => {
    const profile = buildProfile(38, GEARED);
    expect(phaseAt(profile, 0).name).toBe('jerkToAccel');
    expect(phaseAt(profile, -10).name).toBe('jerkToAccel');
    expect(phaseAt(profile, profile.duration / 2).name).toBe('cruise');
    expect(phaseAt(profile, profile.duration + 10).name).toBe('jerkToStop');

    // With cruise collapsed, the instant it would have occupied belongs to the phase
    // the car actually enters there.
    const noCruise = buildProfile(FLOOR_PITCH_M, GEARED);
    const cruise = phaseByName(noCruise, 'cruise');
    expect(cruise.duration).toBe(0);
    expect(phaseAt(noCruise, cruise.startTime).name).toBe('jerkToDecel');
  });

  it('clamps outside the profile span rather than extrapolating', () => {
    const profile = buildProfile(38, GEARED);
    expect(positionAt(profile, -1)).toBe(0);
    expect(positionAt(profile, profile.duration + 1)).toBe(38);
    expect(velocityAt(profile, -1)).toBe(0);
    expect(velocityAt(profile, profile.duration * 10)).toBe(0);
    expect(accelerationAt(profile, -1e6)).toBe(0);
  });

  it('freezes the profile so a hypothetical evaluation cannot mutate it', () => {
    const profile = buildProfile(38, GEARED);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.phases)).toBe(true);
    expect(Object.isFrozen(profile.constraints)).toBe(true);
    for (const phase of profile.phases) {
      expect(Object.isFrozen(phase)).toBe(true);
    }

    // The Phase 1 acceptance shape: evaluating 10,000 times leaves state identical.
    const before = JSON.stringify(profile);
    for (let i = 0; i < 10_000; i++) {
      kinematicsAt(profile, (profile.duration * i) / 10_000);
    }
    expect(JSON.stringify(profile)).toBe(before);
  });

  it('rejects invalid envelopes and instants', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildProfile(10, { ...GEARED, ratedSpeedMps: bad })).toThrow(RangeError);
      expect(() => buildProfile(10, { ...GEARED, acceleration: bad })).toThrow(RangeError);
      expect(() => buildProfile(10, { ...GEARED, jerk: bad })).toThrow(RangeError);
      expect(() => assertMotionConstraints({ ...GEARED, jerk: bad })).toThrow(RangeError);
      expect(() => travelTime(10, { ...GEARED, acceleration: bad })).toThrow(RangeError);
    }

    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => buildProfile(bad, GEARED)).toThrow(RangeError);
      expect(() => travelTime(bad, GEARED)).toThrow(RangeError);
    }

    const profile = buildProfile(38, GEARED);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => positionAt(profile, bad)).toThrow(RangeError);
      expect(() => velocityAt(profile, bad)).toThrow(RangeError);
      expect(() => accelerationAt(profile, bad)).toThrow(RangeError);
      expect(() => kinematicsAt(profile, bad)).toThrow(RangeError);
      expect(() => phaseAt(profile, bad)).toThrow(RangeError);
    }
  });

  it('accepts a ResolvedCar as a MotionConstraints without conversion', () => {
    // Type-level: physics must not need to know about config. If ResolvedCar ever stops
    // carrying these three fields under these names, this stops compiling.
    const car = {
      ratedSpeedMps: 2.5,
      acceleration: 1.0,
      jerk: 1.4,
    } satisfies Pick<ResolvedCar, 'ratedSpeedMps' | 'acceleration' | 'jerk'>;
    const constraints: MotionConstraints = car;

    expect(buildProfile(38, constraints).duration).toBeCloseTo(18.414285714285715, 12);
  });
});

/* -------------------------------------------------------------------------- *
 * Property test
 * -------------------------------------------------------------------------- */

describe('properties over random profiles', () => {
  it('holds every correctness invariant across 2000 random (distance, envelope) pairs', () => {
    // Seeded, so a failure is reproducible from this file alone. Stream 7 is arbitrary and
    // private to this test — it is not one of the simulation's named streams.
    const rng = new Pcg32(20260725, 7);

    const logUniform = (min: number, max: number): number =>
      Math.exp(Math.log(min) + rng.nextFloat() * (Math.log(max) - Math.log(min)));

    const kinds = new Map<string, number>();
    const failures: string[] = [];
    let checked = 0;
    // Envelopes with `V < A^2/J`, whose acceleration plateau never opens however long the
    // trip. These are the trials that caught `reachesRatedAcceleration` being inferred from
    // `kind` — 22 of the 2000 at this seed. Counted so that a future change to the generator
    // cannot quietly stop exercising the case and leave the assertion below vacuous.
    let plateauNeverOpens = 0;

    for (let trial = 0; trial < 2000; trial++) {
      const constraints: MotionConstraints = {
        // Hydraulic through ultra-high-speed, plus a margin either side.
        ratedSpeedMps: 0.4 + rng.nextFloat() * 20.5,
        acceleration: 0.3 + rng.nextFloat() * 1.4,
        jerk: 0.4 + rng.nextFloat() * 1.8,
      };

      // 1 in 20 trials is a zero-distance move; the rest span a micron to a supertall rise.
      const magnitude = trial % 20 === 0 ? 0 : logUniform(1e-6, 600);
      const displacement = rng.bernoulli(0.5) ? magnitude : -magnitude;

      const profile = buildProfile(displacement, constraints);
      kinds.set(profile.kind, (kinds.get(profile.kind) ?? 0) + 1);

      const context = `trial ${trial}: d=${displacement} v=${constraints.ratedSpeedMps} a=${constraints.acceleration} j=${constraints.jerk}`;
      const trialFailures: string[] = [];

      if (travelTime(displacement, constraints) !== profile.duration) {
        trialFailures.push('travelTime disagrees with profileDuration');
      }
      if (profile.distanceM !== Math.abs(displacement)) trialFailures.push('distanceM wrong');
      // `|| 0` folds `Math.sign(-0)`, which is `-0`, onto `0`.
      if (profile.direction !== (Math.sign(displacement) || 0)) trialFailures.push('direction wrong');
      if (!withinLimit(profile.peakSpeedMps, constraints.ratedSpeedMps)) {
        trialFailures.push(`peakSpeedMps ${profile.peakSpeedMps} exceeds rated`);
      }
      if (!withinLimit(profile.peakAccelerationMps2, constraints.acceleration)) {
        trialFailures.push(`peakAccelerationMps2 ${profile.peakAccelerationMps2} exceeds rated`);
      }
      if (profile.reachesRatedSpeed !== (profile.kind === 'speedLimited')) {
        trialFailures.push('reachesRatedSpeed disagrees with kind');
      }

      // Both flags must agree with the peaks they claim to summarize — the cross-check the
      // `kind`-only assertions above cannot make. The tolerance is asymmetric on purpose: a
      // flag that is *true* must sit within rounding of the rating (1e-9 catches a real
      // shortfall without tripping on last-bit noise), while a flag that is *false* is only
      // wrong if the peak is right at the rating (1e-12), which leaves an ambiguous band for
      // a distance landing on a regime boundary rather than turning it into a flake.
      if (
        profile.reachesRatedAcceleration &&
        profile.peakAccelerationMps2 < constraints.acceleration * (1 - 1e-9)
      ) {
        trialFailures.push(
          `reachesRatedAcceleration true but peak ${profile.peakAccelerationMps2} is below rated ${constraints.acceleration}`,
        );
      }
      if (
        !profile.reachesRatedAcceleration &&
        profile.peakAccelerationMps2 > constraints.acceleration * (1 - 1e-12)
      ) {
        trialFailures.push(
          `reachesRatedAcceleration false but peak ${profile.peakAccelerationMps2} is at rated ${constraints.acceleration}`,
        );
      }
      if (
        profile.reachesRatedSpeed &&
        profile.peakSpeedMps < constraints.ratedSpeedMps * (1 - 1e-9)
      ) {
        trialFailures.push(
          `reachesRatedSpeed true but peak ${profile.peakSpeedMps} is below rated ${constraints.ratedSpeedMps}`,
        );
      }

      // Independently of the peak: when `V < A^2/J` the peak is `sqrt(V*J) < A` for every
      // distance, so the flag must be false whatever `kind` says. The 1e-9 margin excludes
      // envelopes sitting on the `V == A^2/J` boundary, where the two are equal.
      if (constraints.ratedSpeedMps < (constraints.acceleration ** 2 / constraints.jerk) * (1 - 1e-9)) {
        plateauNeverOpens++;
        if (profile.reachesRatedAcceleration) {
          trialFailures.push('claims rated acceleration on an envelope whose plateau never opens');
        }
      }

      trialFailures.push(...checkProfileInvariants(profile, 40));

      for (const failure of trialFailures) {
        if (failures.length < 20) failures.push(`${context} — ${failure}`);
      }
      checked++;
    }

    expect(failures).toEqual([]);
    expect(checked).toBe(2000);
    // The generator must actually exercise all four regimes, or the property test is
    // asserting invariants about one branch and calling it coverage.
    for (const kind of ['stationary', 'jerkLimited', 'accelerationLimited', 'speedLimited']) {
      expect(kinds.get(kind) ?? 0).toBeGreaterThan(0);
    }
    // ...and it must keep generating the envelope that has no acceleration plateau at all,
    // or the `reachesRatedAcceleration` checks above stop being a regression test.
    expect(plateauNeverOpens).toBeGreaterThan(0);
  });

  it('travel time is strictly increasing in distance', () => {
    const rng = new Pcg32(20260725, 11);

    for (let trial = 0; trial < 200; trial++) {
      const constraints: MotionConstraints = {
        ratedSpeedMps: 0.5 + rng.nextFloat() * 9.5,
        acceleration: 0.4 + rng.nextFloat() * 1.1,
        jerk: 0.6 + rng.nextFloat() * 1.4,
      };
      let previous = 0;
      for (const distance of [0, 0.01, 0.1, 1, 3.8, 10, 40, 120, 400]) {
        const time = travelTime(distance, constraints);
        expect(time).toBeGreaterThan(previous - 1e-12);
        previous = time;
      }
    }
  });

  it('the regime never regresses as the journey gets longer', () => {
    // A longer trip can only develop *more* of the S-curve. If `kind` ever went backwards
    // — say jerk-limited at 4 m but acceleration-limited at 3.9 m — the regime boundaries
    // would be inconsistent with each other, and reported peak speeds would be
    // non-monotone in distance even though travel time was not.
    const rank = { stationary: 0, jerkLimited: 1, accelerationLimited: 2, speedLimited: 3 };
    const rng = new Pcg32(20260725, 17);

    for (let trial = 0; trial < 100; trial++) {
      const constraints: MotionConstraints = {
        ratedSpeedMps: 0.4 + rng.nextFloat() * 10,
        acceleration: 0.3 + rng.nextFloat() * 1.4,
        jerk: 0.4 + rng.nextFloat() * 1.8,
      };

      // Sweep densely across both thresholds, including right on top of them.
      const dSwitch = (2 * constraints.acceleration ** 3) / constraints.jerk ** 2;
      const distances: number[] = [0];
      for (let i = 0; i <= 400; i++) {
        distances.push((dSwitch * i) / 100);
      }
      distances.sort((x, y) => x - y);

      let previousRank = 0;
      let previousPeak = 0;
      let previousPeakAccel = 0;
      let reachedRatedAccel = false;
      for (const distance of distances) {
        const profile = buildProfile(distance, constraints);
        expect(rank[profile.kind]).toBeGreaterThanOrEqual(previousRank);
        expect(profile.peakSpeedMps).toBeGreaterThanOrEqual(previousPeak - 1e-12);
        // Peak acceleration is J*Tj with Tj non-decreasing in distance, so it is
        // non-decreasing too — including across dSwitch, where cbrt(dSwitch/2J) === A/J
        // exactly. `reachesRatedAcceleration` therefore latches: once a longer trip reaches
        // rated acceleration, no longer trip may stop reaching it. A flag derived from
        // `kind` breaks that at dSwitch, where `kind` says jerkLimited but the peak is A.
        expect(profile.peakAccelerationMps2).toBeGreaterThanOrEqual(previousPeakAccel - 1e-12);
        if (reachedRatedAccel) expect(profile.reachesRatedAcceleration).toBe(true);
        previousRank = rank[profile.kind];
        previousPeak = profile.peakSpeedMps;
        previousPeakAccel = profile.peakAccelerationMps2;
        reachedRatedAccel = profile.reachesRatedAcceleration;
      }
    }
  });

  it('a faster rated speed never makes a journey slower', () => {
    // The literature's classic false result is "faster lifts increase waiting time".
    // Whatever else the simulation says, the motion profile itself must be monotone.
    const rng = new Pcg32(20260725, 13);

    for (let trial = 0; trial < 400; trial++) {
      const acceleration = 0.4 + rng.nextFloat() * 1.1;
      const jerk = 0.6 + rng.nextFloat() * 1.4;
      const slower = 0.5 + rng.nextFloat() * 4;
      const faster = slower + rng.nextFloat() * 6;
      const distance = Math.exp(Math.log(0.5) + rng.nextFloat() * Math.log(400 / 0.5));

      const slowTime = travelTime(distance, { ratedSpeedMps: slower, acceleration, jerk });
      const fastTime = travelTime(distance, { ratedSpeedMps: faster, acceleration, jerk });
      expect(fastTime).toBeLessThanOrEqual(slowTime + 1e-12);
    }
  });
});
