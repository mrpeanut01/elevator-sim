/**
 * **Phase 8, physics-verification track — the S-curve against hand arithmetic.**
 *
 * The closed-form oracle in `oracle/` checks the simulator against an *independent formula*. This
 * file checks the layer that formula's residual is charged to: if `travelTime` is wrong, every
 * "explained" verdict in `fiveBuildings.test.ts` is explained by the wrong thing, and the two
 * would agree with each other while both disagreeing with physics.
 *
 * `packages/core/src/physics/motion/sCurve.test.ts` already checks the profile against its own
 * invariants — endpoints, continuity, monotonicity, the equality of `travelTime` and
 * `profileDuration` over 2000 random cases. What it does **not** do is evaluate the closed-form
 * solution by hand and compare. That is what this file is: three flight times worked from the
 * seven-phase equations with literal numbers, one in each of the three regimes, against the
 * reference data of the shipped cars. The arithmetic is written out rather than summarised, so a
 * reader can check it with a calculator and without reading `solveDurations`.
 *
 * ## Why the arithmetic has to be written out
 *
 * `travelTime(3.8, midtownConstraints)` returning 4.678 s is not evidence unless 4.678 s was known
 * beforehand. A test that computes the expected value with the same code it is testing asserts
 * only that the function is deterministic. Every expectation below is built from `v`, `a`, `j` and
 * `d` with the four arithmetic operations, `sqrt` and `cbrt`, and nothing else.
 *
 * ## The guard `docs/08-review-findings.md` finding #3 asked for
 *
 * That finding retracted a claim in `docs/04-test-buildings.md`: that Garden Apartments' cars never
 * reach rated speed and that faster lifts therefore do not help there. Measured, both halves are
 * false — a 0.63 m/s hydraulic reaches rated speed in 1.13 m against a 3.0 m pitch. The genuine
 * speed negative control is **Midtown Office**, whose 2.5 m/s car needs 8.04 m against 3.8 m and
 * never gets there.
 *
 * The finding prescribed its own guard: assert `buildProfile(interfloorM, constraints).kind` per
 * shipped building, so the sentence is backed by a run rather than by prose. That is the last
 * describe block, and it covers all five buildings rather than the two the claim was about.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  analyzeUpPeak,
  buildProfile,
  loadConfig,
  profileDuration,
  travelTime,
} from '@elevator-sim/core';
import type { LoadedConfig, MotionConstraints, ResolvedCar } from '@elevator-sim/core';

import { deriveUpPeakCase } from '../oracle/upPeakCase.js';
import { DATA_DIR } from './harness.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

const constraintsOf = (car: ResolvedCar): MotionConstraints => ({
  ratedSpeedMps: car.ratedSpeedMps,
  acceleration: car.acceleration,
  jerk: car.jerk,
});

function carOf(buildingId: string, bankId: string): ResolvedCar {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`missing building "${buildingId}"`);
  const bank = building.banks.find((entry) => entry.id === bankId);
  if (bank === undefined) throw new Error(`missing bank "${bankId}"`);
  const car = bank.cars[0];
  if (car === undefined) throw new Error('bank has no cars');
  return car;
}

/* ========================================================================== *
 * Hand calculations, one per regime.
 * ========================================================================== */

describe('the seven-phase flight time, worked by hand', () => {
  /**
   * The closed-form solution, restated. Distances and times for a symmetric seven-phase move:
   *
   * ```text
   * Tr      = a / j                          ramp time to rated acceleration
   * dSwitch = 2·a³ / j²                      shortest move that still touches rated acceleration
   * Tj*     = Tr           if v ≥ a²/j       jerk-ramp duration for a move reaching rated speed
   *         = sqrt(v / j)  otherwise         (the plateau never opens on a low-speed machine)
   * Ta*     = v/a − Tr     if v ≥ a²/j       acceleration-plateau duration at rated speed
   *         = 0            otherwise
   * dRated  = v · (2·Tj* + Ta*)              distance consumed accelerating to v and back to 0
   *
   * d ≥ dRated                 → speedLimited:        Tj = Tj*, Ta = Ta*, Tv = (d − dRated)/v
   * dSwitch ≤ d < dRated       → accelerationLimited: Tj = Tr,  Tv = 0,
   *                                                   Ta = (sqrt(Tr² + 4d/a) − 3·Tr) / 2
   * d < dSwitch                → jerkLimited:         Tj = cbrt(d / 2j), Ta = Tv = 0
   *
   * T = 4·Tj + 2·Ta + Tv
   * ```
   *
   * Each case below instantiates that with the numbers a shipped car declares, and every
   * intermediate is asserted so a wrong answer says which line went wrong rather than only that
   * the total is off.
   */

  it('accelerationLimited — Midtown Office, 3.8 m at v=2.5, a=1.0, j=1.4', () => {
    const car = carOf('midtown-office', 'main');
    expect(car.ratedSpeedMps).toBe(2.5);
    expect(car.acceleration).toBe(1.0);
    expect(car.jerk).toBe(1.4);

    const v = 2.5;
    const a = 1.0;
    const j = 1.4;
    const d = 3.8; // (73.4 − 5.0) / 18, the mean interfloor rise of the served zone

    //   Tr      = 1.0 / 1.4                       = 0.714285714285714…
    const Tr = a / j;
    expect(Tr).toBeCloseTo(0.7142857142857143, 15);

    //   dSwitch = 2 · 1.0³ / 1.4²  = 2 / 1.96     = 1.020408163265306… m
    const dSwitch = (2 * a ** 3) / j ** 2;
    expect(dSwitch).toBeCloseTo(1.0204081632653061, 12);

    //   a²/j    = 1.0 / 1.4                       = 0.714285714… m/s, and v = 2.5 exceeds it,
    //             so the acceleration plateau does open.
    expect(v).toBeGreaterThanOrEqual(a ** 2 / j);
    //   Tj*     = Tr                              = 0.714285714… s
    //   Ta*     = 2.5/1.0 − 0.714285714           = 1.785714285… s
    const TaStar = v / a - Tr;
    expect(TaStar).toBeCloseTo(1.7857142857142858, 15);
    //   dRated  = 2.5 · (2·0.714285714 + 1.785714285)
    //           = 2.5 · 3.214285714                = 8.035714285… m
    const dRated = v * (2 * Tr + TaStar);
    expect(dRated).toBeCloseTo(8.035714285714286, 12);

    //   1.020408 ≤ 3.8 < 8.035714  →  accelerationLimited.
    //   **The car never reaches 2.5 m/s on a one-floor hop.** This is the whole of
    //   `docs/07-handoff.md` § 5's mechanism, and note that dRated (8.04 m) is larger than the
    //   v²/a = 6.25 m the handoff quotes: v²/a ignores the jerk ramps, so it *understates* the
    //   distance to rated speed and the conclusion is stronger than the doc states, not weaker.
    expect(d).toBeGreaterThanOrEqual(dSwitch);
    expect(d).toBeLessThan(dRated);
    expect(v ** 2 / a).toBeCloseTo(6.25, 12);
    expect(dRated).toBeGreaterThan(v ** 2 / a);

    //   Ta = (sqrt(Tr² + 4d/a) − 3·Tr) / 2
    //      = (sqrt(0.510204081632653 + 15.2) − 2.142857142857143) / 2
    //      = (sqrt(15.710204081632653) − 2.142857142857143) / 2
    //      = (3.963609981… − 2.142857142…) / 2
    //      = 1.820752838… / 2
    //      = 0.910376419… s
    const underRoot = Tr ** 2 + (4 * d) / a;
    expect(underRoot).toBeCloseTo(15.710204081632653, 12);
    expect(Math.sqrt(underRoot)).toBeCloseTo(3.9636099810189007, 12);
    const Ta = (Math.sqrt(underRoot) - 3 * Tr) / 2;
    expect(Ta).toBeCloseTo(0.910376419080879, 12);

    //   T  = 4·0.714285714 + 2·0.910376419 + 0
    //      = 2.857142857 + 1.820752838
    //      = 4.677895695… s
    const expectedS = 4 * Tr + 2 * Ta;
    expect(expectedS).toBeCloseTo(4.677895695304615, 12);

    // The shipped implementation, against the hand figure. Exact to the last bits the two
    // evaluation orders can share.
    const constraints = constraintsOf(car);
    expect(travelTime(d, constraints)).toBeCloseTo(expectedS, 12);
    const profile = buildProfile(d, constraints);
    expect(profile.kind).toBe('accelerationLimited');
    expect(profileDuration(profile)).toBeCloseTo(expectedS, 12);

    // And the physical consequence, stated as a number the closed form gets wrong: the formula
    // charges `tv = d/v = 3.8/2.5 = 1.52 s` for this hop. The real flight is 3.08× that.
    expect(d / v).toBeCloseTo(1.52, 12);
    expect(expectedS / (d / v)).toBeCloseTo(3.0775629574, 8);
  });

  it('speedLimited — Garden Apartments, 3.0 m at v=0.63, a=0.6, j=0.8', () => {
    const car = carOf('garden-apartments', 'main');
    expect(car.ratedSpeedMps).toBe(0.63);
    expect(car.acceleration).toBe(0.6);
    expect(car.jerk).toBe(0.8);

    const v = 0.63;
    const a = 0.6;
    const j = 0.8;
    const d = 3.0; // the authored floor-to-floor rise

    //   Tr      = 0.6 / 0.8                       = 0.75 s
    const Tr = a / j;
    expect(Tr).toBeCloseTo(0.75, 15);
    //   dSwitch = 2 · 0.216 / 0.64                = 0.675 m
    const dSwitch = (2 * a ** 3) / j ** 2;
    expect(dSwitch).toBeCloseTo(0.675, 12);
    //   a²/j    = 0.36 / 0.8 = 0.45 m/s, and v = 0.63 exceeds it.
    expect(v).toBeGreaterThanOrEqual(a ** 2 / j);
    //   Ta*     = 0.63/0.6 − 0.75 = 1.05 − 0.75   = 0.30 s
    const TaStar = v / a - Tr;
    expect(TaStar).toBeCloseTo(0.3, 12);
    //   dRated  = 0.63 · (1.5 + 0.30) = 0.63 · 1.8 = 1.134 m
    const dRated = v * (2 * Tr + TaStar);
    expect(dRated).toBeCloseTo(1.134, 12);

    //   3.0 ≥ 1.134  →  speedLimited. **The hydraulic reaches rated speed with 1.87 m of the hop
    //   left to cruise**, which is why the short building with the slow cars agrees with the
    //   constant-velocity idealisation better than the tall one with the fast cars.
    expect(d).toBeGreaterThanOrEqual(dRated);

    //   Tv = (3.0 − 1.134) / 0.63 = 1.866 / 0.63  = 2.961904761… s
    const Tv = (d - dRated) / v;
    expect(Tv).toBeCloseTo(2.9619047619047617, 12);
    //   T  = 4·0.75 + 2·0.30 + 2.961904761
    //      = 3.0 + 0.6 + 2.961904761              = 6.561904761… s
    const expectedS = 4 * Tr + 2 * TaStar + Tv;
    expect(expectedS).toBeCloseTo(6.561904761904762, 12);

    const constraints = constraintsOf(car);
    expect(travelTime(d, constraints)).toBeCloseTo(expectedS, 12);
    const profile = buildProfile(d, constraints);
    expect(profile.kind).toBe('speedLimited');
    expect(profileDuration(profile)).toBeCloseTo(expectedS, 12);
    // Cruise is 45 % of the hop. The closed form charges `tv = 3.0/0.63 = 4.762 s`; the real
    // flight is 1.38× that, against Midtown's 3.08×.
    expect(Tv / expectedS).toBeCloseTo(0.4514, 3);
    expect(d / v).toBeCloseTo(4.761904761904762, 12);
    expect(expectedS / (d / v)).toBeCloseTo(1.378, 3);
  });

  it('jerkLimited — the same Midtown car over 0.5 m, below its own dSwitch', () => {
    // Not an interfloor rise: a levelling-scale correction, and the regime a car is in whenever
    // it is asked to move less than `2a³/j²`. It is in the reference envelope of every shipped
    // car and no shipped building has a floor pitch there, so it is exercised with a distance
    // rather than with a building.
    const constraints = constraintsOf(carOf('midtown-office', 'main'));
    const j = 1.4;
    const d = 0.5;

    //   dSwitch = 1.020408163… m, and 0.5 is below it, so the acceleration plateau never opens
    //   and the move is two jerk ramps up and two down with nothing between them.
    expect(d).toBeLessThan((2 * constraints.acceleration ** 3) / j ** 2);

    //   Tj = cbrt(d / 2j) = cbrt(0.5 / 2.8) = cbrt(0.178571428…) = 0.563123940… s
    const Tj = Math.cbrt(d / (2 * j));
    expect(d / (2 * j)).toBeCloseTo(0.17857142857142858, 15);
    expect(Tj).toBeCloseTo(0.5631239402218031, 12);
    //   T  = 4 · 0.563123940                       = 2.252495761… s
    const expectedS = 4 * Tj;
    expect(expectedS).toBeCloseTo(2.2524957608872125, 12);

    expect(travelTime(d, constraints)).toBeCloseTo(expectedS, 12);
    const profile = buildProfile(d, constraints);
    expect(profile.kind).toBe('jerkLimited');
    expect(profileDuration(profile)).toBeCloseTo(expectedS, 12);
    // Peak acceleration is `j · Tj = 1.4 × 0.563108 = 0.788 m/s²`, below the car's rated 1.0 —
    // which is what `jerkLimited` means and why `reachesRatedAcceleration` cannot be read off
    // `kind` in the other direction.
    expect(profile.peakAccelerationMps2).toBeCloseTo(j * Tj, 10);
    expect(profile.peakAccelerationMps2).toBeCloseTo(0.7883735163, 8); // 1.4 x 0.563124
    expect(profile.peakAccelerationMps2).toBeLessThan(constraints.acceleration);
    expect(profile.reachesRatedAcceleration).toBe(false);
  });

  it('the three regimes tile the distance axis, with no gap and no overlap', () => {
    // The hand solution above switches at `dSwitch` and at `dRated`. If the implementation
    // switched anywhere else, one of the three cases would be evaluated with the wrong formula
    // for some distance and the error would be largest exactly at the boundary — where the two
    // formulas must agree. So the check is continuity across both boundaries, from both sides.
    const constraints = constraintsOf(carOf('midtown-office', 'main'));
    const { ratedSpeedMps: v, acceleration: a, jerk: j } = constraints;
    const Tr = a / j;
    const dSwitch = (2 * a ** 3) / j ** 2;
    const dRated = v * (2 * Tr + (v / a - Tr));

    for (const boundary of [dSwitch, dRated]) {
      const epsilon = boundary * 1e-9;
      const below = travelTime(boundary - epsilon, constraints);
      const above = travelTime(boundary + epsilon, constraints);
      const at = travelTime(boundary, constraints);
      expect(Math.abs(above - below)).toBeLessThan(1e-6);
      expect(at).toBeGreaterThanOrEqual(below - 1e-9);
      expect(at).toBeLessThanOrEqual(above + 1e-9);
    }

    // And the regimes are in the order the solution says, monotone in distance.
    expect(buildProfile(dSwitch / 2, constraints).kind).toBe('jerkLimited');
    expect(buildProfile((dSwitch + dRated) / 2, constraints).kind).toBe('accelerationLimited');
    expect(buildProfile(dRated * 2, constraints).kind).toBe('speedLimited');
  });
});

/* ========================================================================== *
 * Degenerate hops.
 * ========================================================================== */

describe('degenerate hops', () => {
  const constraints = () => constraintsOf(carOf('midtown-office', 'main'));

  it('zero distance takes zero time and is stationary, in both signs of zero', () => {
    for (const displacement of [0, -0]) {
      const profile = buildProfile(displacement, constraints());
      expect(profile.kind).toBe('stationary');
      expect(profileDuration(profile)).toBe(0);
      expect(profile.direction).toBe(0);
      expect(travelTime(displacement, constraints())).toBe(0);
    }
  });

  it('a signed displacement costs what its magnitude costs, in either direction', () => {
    // The round trip in `kinematicRoundTrip` flies up and comes back down; if the two directions
    // did not cost the same, every corrected round trip in `oracle/` would be off by the
    // asymmetry and the residuals would still look small.
    for (const d of [0.001, 0.5, 3.8, 40, 68.4]) {
      expect(travelTime(-d, constraints())).toBe(travelTime(d, constraints()));
      expect(buildProfile(-d, constraints()).direction).toBe(-1);
      expect(buildProfile(d, constraints()).direction).toBe(1);
      expect(profileDuration(buildProfile(-d, constraints()))).toBeCloseTo(
        profileDuration(buildProfile(d, constraints())),
        12,
      );
    }
  });

  it('flight time is strictly increasing in distance, including across the regimes', () => {
    // A profile solver that mis-selected a regime could return a *shorter* time for a *longer*
    // move, and nothing else in this suite would notice: the round trip would simply be wrong in
    // a direction that happens to flatter the system.
    const c = constraints();
    let previous = 0;
    for (const d of [1e-6, 1e-3, 0.1, 0.5, 1.0204081632653061, 2, 3.8, 8.035714285714286, 20, 76.9]) {
      const t = travelTime(d, c);
      expect(t).toBeGreaterThan(previous);
      previous = t;
    }
  });

  it('a one-floor hop is never the fraction of a full-height run that d/v implies', () => {
    // The modelling rule `CLAUDE.md` states as easy to get wrong: *"Short hops never reach rated
    // speed. A simulator that ignores this will wrongly conclude faster elevators always help."*
    // Measured on Midtown Office: a one-floor hop is 4.678 s against a 68.4 m full-height run of
    // 31.35 s — 14.9 % of it, where `d/v` scaling would predict 3.8/68.4 = 5.6 %. A model that
    // scaled linearly would make an 18-stop trip look 2.7× cheaper than it is.
    const c = constraints();
    const oneFloor = travelTime(3.8, c);
    const fullHeight = travelTime(68.4, c);
    const linearShare = 3.8 / 68.4;
    expect(oneFloor / fullHeight).toBeGreaterThan(2 * linearShare);
    expect(oneFloor / fullHeight).toBeCloseTo(0.149, 2);
  });

  it('a hop below the resolution of the model is treated as no move rather than as a fast one', () => {
    // `Number.MIN_VALUE` is a denormal: `cbrt(d/2j)` rounds to zero, and a profile with zero
    // duration and a non-zero target would be a move that both takes no time and does not
    // arrive. The implementation calls that stationary. Pinned here because the alternative — a
    // move that arrives for free — would let a dispatcher's cost function find an infinitely
    // cheap repositioning.
    const profile = buildProfile(Number.MIN_VALUE, constraints());
    expect(profileDuration(profile)).toBe(0);
    expect(profile.kind).toBe('stationary');
    expect(travelTime(Number.MIN_VALUE, constraints())).toBe(0);
  });

  it('rejects a non-finite distance and a degenerate envelope rather than returning NaN', () => {
    const c = constraints();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => travelTime(bad, c)).toThrow(RangeError);
      expect(() => buildProfile(bad, c)).toThrow(RangeError);
    }
    for (const envelope of [
      { ratedSpeedMps: 0, acceleration: 1, jerk: 1.4 },
      { ratedSpeedMps: 2.5, acceleration: 0, jerk: 1.4 },
      { ratedSpeedMps: 2.5, acceleration: 1, jerk: 0 },
      { ratedSpeedMps: -2.5, acceleration: 1, jerk: 1.4 },
    ]) {
      expect(() => travelTime(3.8, envelope)).toThrow(RangeError);
    }
  });
});

/* ========================================================================== *
 * The per-building guard docs/08-review-findings.md § 3 prescribed.
 * ========================================================================== */

describe('the regime each shipped building’s cars are in on a one-floor hop', () => {
  it('is the one the docs claim, on all five, and only Garden Apartments reaches rated speed', () => {
    const rows: string[] = [];
    const kinds = new Map<string, string>();
    for (const [buildingId, bankId] of [
      ['midtown-office', 'main'],
      ['garden-apartments', 'main'],
      ['secure-tower', 'low'],
      ['mixed-use-high-rise', 'office-local'],
      ['vertical-city', 'zone-1-local'],
    ] as const) {
      const building = config.buildingsById.get(buildingId);
      if (building === undefined) throw new Error(`missing building "${buildingId}"`);
      const derived = deriveUpPeakCase(building, bankId, config.elevatorSpecs);
      // `df` from the oracle's own derivation, not from a literal: the mean floor-to-floor rise
      // of the served zone is what `tv = df/v` is charged against, so it is the distance whose
      // regime decides how wrong the closed form is per stop.
      const df = analyzeUpPeak(building, config.elevatorSpecs, derived.options).interfloorDistanceM;
      const car = carOf(buildingId, bankId);
      const c = constraintsOf(car);
      const profile = buildProfile(df, c);
      kinds.set(buildingId, profile.kind);
      rows.push(
        `${buildingId.padEnd(20)} df=${df.toFixed(3).padStart(6)} m  v=${String(c.ratedSpeedMps).padStart(5)}  ` +
          `a=${c.acceleration}  j=${c.jerk}  ->  ${profile.kind.padEnd(20)} ` +
          `${profileDuration(profile).toFixed(3)} s vs tv=${(df / c.ratedSpeedMps).toFixed(3)} s`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(`\none-floor regime, per shipped building:\n${rows.join('\n')}\n`);

    // **The retracted claim, inverted and pinned.** `docs/04-test-buildings.md` said Garden
    // Apartments' cars never reach rated speed. It is the only shipped building whose cars *do*.
    expect(kinds.get('garden-apartments')).toBe('speedLimited');
    // And Midtown Office is the genuine speed negative control the finding identified.
    expect(kinds.get('midtown-office')).toBe('accelerationLimited');
    // The other three are in the same regime as Midtown: fast traction cars over ~4 m pitches.
    expect(kinds.get('secure-tower')).toBe('accelerationLimited');
    expect(kinds.get('mixed-use-high-rise')).toBe('accelerationLimited');
    expect(kinds.get('vertical-city')).toBe('accelerationLimited');
    // Exactly one of the five, stated as a count so a sixth building cannot join silently.
    expect([...kinds.values()].filter((kind) => kind === 'speedLimited')).toHaveLength(1);
  });

  it('faster lifts do help Garden Apartments, which is the other half of the retraction', () => {
    // The retracted claim's second half was that faster lifts do not help there. A car already
    // cruising for 45 % of its hop gets the whole of a speed increase applied to that cruise, so
    // the prediction is the opposite: raising `v` shortens the flight, and by more than it does
    // on a car that never reaches its current rated speed.
    const garden = constraintsOf(carOf('garden-apartments', 'main'));
    const midtown = constraintsOf(carOf('midtown-office', 'main'));

    const faster = (c: MotionConstraints, factor: number): MotionConstraints => ({
      ...c,
      ratedSpeedMps: c.ratedSpeedMps * factor,
    });
    const gardenGain =
      1 - travelTime(3.0, faster(garden, 1.5)) / travelTime(3.0, garden);
    const midtownGain =
      1 - travelTime(3.8, faster(midtown, 1.5)) / travelTime(3.8, midtown);

    // eslint-disable-next-line no-console
    console.log(
      `\n50 % more rated speed, one-floor hop:\n` +
        `  garden-apartments  ${(gardenGain * 100).toFixed(1)} % faster\n` +
        `  midtown-office     ${(midtownGain * 100).toFixed(1)} % faster\n`,
    );

    // It helps Garden materially...
    expect(gardenGain).toBeGreaterThan(0.15);
    // ...and it does **nothing at all** on Midtown, whose car never reaches even its current
    // rated speed on a one-floor hop, so raising the ceiling changes no phase of the profile.
    // That is the sentence `docs/04-test-buildings.md` had attached to the wrong building.
    expect(midtownGain).toBe(0);
  });
});
