/**
 * **The TWIN separation arithmetic**, and the one premise the rest of it rests on.
 *
 * `separation.ts` claims something stronger than most predicates in this repository: that checking
 * two numbers checks *every instant* of a pair of runs, rather than every sampled instant. That is
 * a lemma, not an implementation detail, and `docs/11` § 2.2 is explicit about why it matters —
 * `positionAt` is analytic, so two cars can breach a clearance entirely between two kernel events
 * with both endpoints reading clean.
 *
 * The lemma has a premise: the safety brake is at least as hard as the service brake. The interesting
 * test in this file is the one that checks the premise **against the shipped speed range** rather
 * than asserting it in prose — `docs/11` OQ-3's *"measured check"*, which asks whether the
 * constant-deceleration figure `v²/2a` is covered.
 */

import { describe, expect, it } from 'vitest';

import { buildProfile, positionAt, velocityAt } from '../../physics/motion/index.js';
import { ModelError } from '../types.js';

import {
  admissibleHeightRangeM,
  assertBrakeDominatesComfort,
  isCrossedCommitment,
  protectedCeilingM,
  protectedFloorM,
  reachableHeightRangeM,
  requiredGapM,
  respectsClearance,
  respectsOrder,
  separationMarginM,
  stoppingDistanceM,
  validateSeparation,
  withinRange,
  type ShaftOccupantState,
  type ShaftSeparation,
} from './separation.js';

const SEP: ShaftSeparation = {
  standingClearanceM: 4,
  bufferM: 0.5,
  emergencyDecelerationMps2: 2,
};

const standing = (carId: string, heightM: number): ShaftOccupantState => ({
  carId,
  heightM,
  velocityMps: 0,
  targetHeightM: undefined,
});

const bound = (carId: string, heightM: number, velocityMps: number, targetHeightM: number): ShaftOccupantState => ({
  carId,
  heightM,
  velocityMps,
  targetHeightM,
});

describe('the declared separation is validated where a shaft is built', () => {
  it('refuses a clearance that is not strictly positive: zero is two cars at one point', () => {
    expect(() => {
      validateSeparation({ ...SEP, standingClearanceM: 0 }, 'S1');
    }).toThrow(ModelError);
    expect(() => {
      validateSeparation({ ...SEP, standingClearanceM: -1 }, 'S1');
    }).toThrow(/strictly positive/);
  });

  it('refuses a negative buffer, which would subtract from the braking distance', () => {
    expect(() => {
      validateSeparation({ ...SEP, bufferM: -0.1 }, 'S1');
    }).toThrow(/may not be negative/);
  });

  it('refuses a brake that does not decelerate, and accepts the shipped shape', () => {
    expect(() => {
      validateSeparation({ ...SEP, emergencyDecelerationMps2: 0 }, 'S1');
    }).toThrow(/strictly positive rate/);
    expect(() => {
      validateSeparation(SEP, 'S1');
    }).not.toThrow();
  });
});

describe('the protected position, which is what makes the check exact rather than sampled', () => {
  it('extends a moving car toward its target and never past it', () => {
    // Ascending to 30 from 10 at 3 m/s: the brake would leave it at 10 + 9/4 = 12.25, which is
    // short of the target, so the target is the extreme. That domination is the lemma.
    const rising = bound('U', 10, 3, 30);
    expect(protectedCeilingM(rising, SEP)).toBe(30);
    expect(protectedFloorM(rising, SEP)).toBe(10);
  });

  it('extends a descending car downward and never past its target', () => {
    const falling = bound('L', 30, -3, 10);
    expect(protectedFloorM(falling, SEP)).toBe(10);
    expect(protectedCeilingM(falling, SEP)).toBe(30);
  });

  it('is the car’s own height on both sides when it is standing', () => {
    const still = standing('C', 17);
    expect(protectedCeilingM(still, SEP)).toBe(17);
    expect(protectedFloorM(still, SEP)).toBe(17);
  });

  it('falls back on the braking distance when a brake is weaker than the service brake', () => {
    // The premise broken on purpose: a 0.1 m/s² "safety" brake from 3 m/s runs 45 m, far past the
    // 12 m target. The arithmetic stays sound because the speed term is computed rather than
    // assumed away — which is the whole reason it is computed.
    const weak: ShaftSeparation = { ...SEP, emergencyDecelerationMps2: 0.1 };
    expect(protectedCeilingM(bound('U', 10, 3, 12), weak)).toBeCloseTo(55, 6);
  });
});

describe('C-CLEAR and C-ORDER', () => {
  it('holds when two standing cars are exactly a clearance plus a buffer apart', () => {
    const lower = standing('L', 0);
    const upper = standing('U', requiredGapM(SEP));
    expect(separationMarginM(lower, upper, SEP)).toBeCloseTo(0, 9);
    expect(respectsClearance(lower, upper, SEP)).toBe(true);
    expect(respectsOrder(lower, upper)).toBe(true);
  });

  it('fails by exactly the shortfall when they are closer', () => {
    const lower = standing('L', 1);
    const upper = standing('U', requiredGapM(SEP));
    expect(separationMarginM(lower, upper, SEP)).toBeCloseTo(-1, 9);
    expect(respectsClearance(lower, upper, SEP)).toBe(false);
  });

  it('sees a crossing that a clearance margin alone would only report as a large shortfall', () => {
    // C-ORDER is stated separately because a crossing is a *modelling* failure where a clearance
    // breach is a *control* failure, and the two want different bug reports (docs/11 § 2.1).
    const lower = standing('L', 20);
    const upper = standing('U', 5);
    expect(respectsOrder(lower, upper)).toBe(false);
    expect(respectsClearance(lower, upper, SEP)).toBe(false);
  });

  it('refuses a move whose *destination* breaches, even though the starting gap is ample', () => {
    // The point of checking commitments rather than positions: 40 m apart now, and the lower car
    // is committed to a floor 1 m under its mate.
    const lower = bound('L', 0, 0, 39);
    const upper = standing('U', 40);
    expect(respectsClearance(lower, upper, SEP)).toBe(false);
    expect(separationMarginM(lower, upper, SEP)).toBeCloseTo(-3.5, 9);
  });
});

describe('the two ranges answer two different questions', () => {
  const span = { lowestHeightM: 0, highestHeightM: 60 };

  it('bounds the lower car by its mate now, and the upper car by its mate now', () => {
    const mateAbove = standing('U', 30);
    expect(reachableHeightRangeM('lower', mateAbove, SEP, span)).toEqual([0, 25.5]);
    const mateBelow = standing('L', 30);
    expect(reachableHeightRangeM('upper', mateBelow, SEP, span)).toEqual([34.5, 60]);
  });

  it('returns an empty range for a car with nowhere to go this instant, and withinRange agrees', () => {
    // A lower car whose mate is standing 1 m above it can reach nothing at all right now. Empty is
    // a state to express, not a case to special-case: `low > high` is false for every index.
    const range = reachableHeightRangeM('lower', standing('U', 1), SEP, span);
    expect(range[0]).toBeGreaterThan(range[1]);
    expect(withinRange(0, range)).toBe(false);
    expect(withinRange(60, range)).toBe(false);
  });

  it('keeps the lower car a clearance below the roof and the upper a clearance above the pit, always', () => {
    // The static envelope, and the deadlock prevention of docs/11 § 3.2. It does not move when the
    // mate does, which is exactly what makes a commitment outside it undischargeable by any legal
    // sequence rather than merely inconvenient right now.
    expect(admissibleHeightRangeM('lower', SEP, span)).toEqual([0, 55.5]);
    expect(admissibleHeightRangeM('upper', SEP, span)).toEqual([4.5, 60]);
  });

  it('is never wider than the admissible one, whatever the mate is doing', () => {
    for (const mateHeightM of [0, 7, 19, 33, 48, 60]) {
      const reach = reachableHeightRangeM('lower', standing('U', mateHeightM), SEP, span);
      const ever = admissibleHeightRangeM('lower', SEP, span);
      expect(reach[0]).toBeGreaterThanOrEqual(ever[0]);
      expect(reach[1]).toBeLessThanOrEqual(ever[1]);
    }
  });
});

describe('the MERL deadlock shape', () => {
  it('is true when each car holds a stop across the other, and false when only one does', () => {
    const lower = standing('L', 10);
    const upper = standing('U', 30);
    // Lower wants 35 (at or above the upper car); upper wants 5 (at or below the lower car).
    expect(isCrossedCommitment([35], [5], lower, upper)).toBe(true);
    expect(isCrossedCommitment([35], [40], lower, upper)).toBe(false);
    expect(isCrossedCommitment([5], [5], lower, upper)).toBe(false);
    expect(isCrossedCommitment([], [], lower, upper)).toBe(false);
  });
});

describe('the premise the exactness lemma rests on, measured rather than asserted', () => {
  it('refuses a safety brake gentler than the service brake, naming both figures', () => {
    expect(() => {
      assertBrakeDominatesComfort({ ...SEP, emergencyDecelerationMps2: 0.5 }, 1.0, 'S1');
    }).toThrow(/not a safety brake/);
    expect(() => {
      assertBrakeDominatesComfort(SEP, 1.0, 'S1');
    }).not.toThrow();
  });

  /**
   * **`docs/11` OQ-3's measured check.** The question that document leaves open is whether the
   * constant-deceleration figure `v²/2a` is enough, given that the jerk-limited stop is longer and
   * `bufferM` is what is supposed to cover the difference.
   *
   * The lemma's claim is narrower and is what is checked here: under a brake at least as hard as
   * the service brake, a car's **emergency-braked position never passes the target of the comfort
   * profile it is already running** — so the target dominates and the buffer has nothing to cover
   * at all. Swept over the whole shipped speed range and over travel distances from a single hop
   * to a full rise, at every phase of the profile rather than at its endpoints.
   *
   * This is what would go red if `physics/motion` ever gained a profile whose deceleration exceeds
   * its acceleration, and it is the reason the arithmetic computes the speed term rather than
   * assuming it away.
   */
  it('never lets an emergency stop carry a car past the target it was already braking for', () => {
    const speeds = [0.63, 1.0, 1.6, 2.5, 4.0, 6.0, 8.0, 10.0];
    const distances = [3, 4.5, 12, 40, 120, 300];
    let checked = 0;
    let worstSlackM = Number.POSITIVE_INFINITY;

    for (const ratedSpeedMps of speeds) {
      for (const acceleration of [0.8, 1.0, 1.2]) {
        const constraints = { ratedSpeedMps, acceleration, jerk: 1.6 };
        // The premise: the safety brake is at least the service brake. Taken at equality, which is
        // the hardest case for the claim — any real safety gear is harder.
        const emergencyDecelerationMps2 = acceleration;
        for (const distanceM of distances) {
          const profile = buildProfile(distanceM, constraints);
          for (let step = 0; step <= 40; step += 1) {
            const t = (step / 40) * profile.duration;
            const heightM = positionAt(profile, t);
            const v = velocityAt(profile, t);
            const brakedM = heightM + stoppingDistanceM(v, emergencyDecelerationMps2);
            worstSlackM = Math.min(worstSlackM, distanceM - brakedM);
            checked += 1;
          }
        }
      }
    }

    expect(checked).toBeGreaterThan(5000);
    // Non-negative slack everywhere: the braked position never passes the target. A small negative
    // tolerance would be this test agreeing with a lemma that is false by a millimetre, so there is
    // none — the claim is an inequality and it is checked as one.
    expect(
      worstSlackM,
      `an emergency stop carried a car ${(-worstSlackM).toFixed(6)} m past its own comfort target, so the separation check is not exact`,
    ).toBeGreaterThanOrEqual(0);
  });
});
