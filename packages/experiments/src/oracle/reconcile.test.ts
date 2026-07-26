/**
 * Unit tests for the reconciliation arithmetic.
 *
 * The numbers used here are the ones the Phase 2 acceptance gate measured on Midtown Office and
 * Garden Apartments, so these tests double as a record of that result that does not need to run
 * a simulation to check. The gate itself — 128 replications, the knock-out experiments, the two
 * defects — is `packages/core/src/analytical/validation.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESIDUAL_TOLERANCE,
  constantSpeedPenalty,
  departureGapBracket,
  reconcileRoundTrip,
  relativeDivergence,
  summariseReplications,
} from './reconcile.js';
import type { MeasuredRoundTrip } from './types.js';

const constant = (value: number, count = 4): ReturnType<typeof summariseReplications> =>
  summariseReplications(Array.from({ length: count }, () => value));

describe('summariseReplications', () => {
  it('reports the mean, the spread across runs, and the precision of the mean', () => {
    const stat = summariseReplications([4.1, 5.0, 5.6, 7.4]);
    expect(stat.count).toBe(4);
    expect(stat.mean).toBeCloseTo(5.525, 6);
    expect(stat.min).toBeCloseTo(4.1, 9);
    expect(stat.max).toBeCloseTo(7.4, 9);
    // Sample (n−1) standard deviation, not population: these are four draws from a process,
    // not the whole of it.
    expect(stat.stdDev).toBeCloseTo(1.393736, 5);
    expect(stat.standardError).toBeCloseTo(stat.stdDev / 2, 9);
  });

  it('has no standard deviation from one replication, and says so rather than reporting zero', () => {
    // Zero would read as "perfectly reproducible". docs/03-traffic-and-statistics.md § Part 3
    // is about exactly this: one run of a lift peak tells you almost nothing.
    const stat = summariseReplications([5]);
    expect(stat.mean).toBe(5);
    expect(stat.stdDev).toBeNaN();
    expect(stat.standardError).toBeNaN();
  });

  it('refuses an empty series or a non-finite value rather than propagating NaN', () => {
    expect(() => summariseReplications([])).toThrow(RangeError);
    expect(() => summariseReplications([1, Number.NaN])).toThrow(/replication 1 produced NaN/);
    expect(() => summariseReplications([Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });
});

describe('relativeDivergence', () => {
  it('is signed and relative to the reference', () => {
    expect(relativeDivergence(196.8, 149.8)).toBeCloseTo(0.31375, 5);
    expect(relativeDivergence(4.55, 6.007)).toBeCloseTo(-0.24255, 5);
  });

  it('refuses a zero reference', () => {
    expect(() => relativeDivergence(1, 0)).toThrow(RangeError);
  });
});

describe('departureGapBracket', () => {
  /**
   * Midtown Office: centre-opening doors, 5 s hall dwell, 12.8 passengers at 1.2 s.
   *
   * The bare reopen is 1.8 + 5.0 + 3.0 = 9.8 s and a loaded one is 1.8 + 15.36 + 3.0 = 20.16 s,
   * both at or above `metrics`' 10 s default — which is the defect the acceptance gate found.
   */
  it('brackets Midtown Office above a loaded reopen and below the shortest round trip', () => {
    const bracket = departureGapBracket({
      doorOpenS: 1.8,
      doorCloseS: 3.0,
      dwellHallCallS: 5.0,
      dwellCarCallS: 3.0,
      fullLoadTransferS: 12.8 * 1.2,
      nearestFloorFlightS: 5.212, // jerk-limited flight over the 5.0 m to floor 2
      motorStartDelayS: 0.5,
      levelingSettleS: 0.7,
    });
    expect(bracket.maxReopenS).toBeCloseTo(20.16, 6);
    expect(bracket.minRoundTripS).toBeGreaterThan(bracket.maxReopenS);
    expect(bracket.midpointS).toBeGreaterThan(bracket.maxReopenS);
    expect(bracket.midpointS).toBeLessThan(bracket.minRoundTripS);
    // And it is well clear of the 10 s the metrics layer defaults to.
    expect(bracket.midpointS).toBeGreaterThan(10);
  });

  it('refuses to invent a threshold when a reopen can outlast a round trip', () => {
    // A car whose doors take longer to cycle than the trip itself: no gap can tell the two
    // apart, and silently choosing one would report a fabricated interval.
    expect(() =>
      departureGapBracket({
        doorOpenS: 10,
        doorCloseS: 10,
        dwellHallCallS: 30,
        dwellCarCallS: 30,
        fullLoadTransferS: 500,
        nearestFloorFlightS: 0.1,
        motorStartDelayS: 0,
        levelingSettleS: 0,
      }),
    ).toThrow(/no clustering threshold/);
  });
});

describe('constantSpeedPenalty', () => {
  it('shows the fast mid-rise car is worse served by the closed form than the slow low-rise one', () => {
    // This is the counter-intuitive finding of the acceptance gate. The instinct is that short
    // travel distances make ignoring acceleration worse; what actually matters is the interfloor
    // rise against v²/a, and a hydraulic's acceleration distance is tiny.
    const midtown = constantSpeedPenalty({
      ratedSpeedMps: 2.5,
      accelerationMps2: 1.0,
      jerkMps3: 1.4,
      interfloorDistanceM: 3.8,
    });
    const garden = constantSpeedPenalty({
      ratedSpeedMps: 0.63,
      accelerationMps2: 0.6,
      jerkMps3: 0.8,
      interfloorDistanceM: 3.0,
    });

    expect(midtown.accelerationDistanceM).toBeCloseTo(6.25, 6);
    expect(midtown.reachesRatedSpeedInOneFloor).toBe(false); // 6.25 m needed, 3.8 m available
    expect(midtown.lossPerFlightS).toBeCloseTo(3.214286, 5); // v/a + a/j
    expect(midtown.lossRelativeToTransit).toBeCloseTo(2.11466, 4); // 211 % of tv = 1.52 s

    expect(garden.accelerationDistanceM).toBeCloseTo(0.6615, 6);
    expect(garden.reachesRatedSpeedInOneFloor).toBe(true);
    expect(garden.lossPerFlightS).toBeCloseTo(1.8, 6);
    expect(garden.lossRelativeToTransit).toBeCloseTo(0.378, 2); // 38 % of tv = 4.762 s

    expect(midtown.lossRelativeToTransit).toBeGreaterThan(5 * garden.lossRelativeToTransit);
  });

  it('rejects a non-physical machine', () => {
    expect(() =>
      constantSpeedPenalty({ ratedSpeedMps: 0, accelerationMps2: 1, jerkMps3: 1, interfloorDistanceM: 3 }),
    ).toThrow(/ratedSpeedMps/);
  });
});

describe('reconcileRoundTrip', () => {
  /** Midtown Office, 128 replications at 1.3x the closed-form %POP, matched load P = 12.84. */
  const midtownMeasured: MeasuredRoundTrip = {
    roundTripS: constant(196.815),
    passengersPerTrip: constant(12.841),
    stopsPerTrip: constant(9.504),
    intervalS: constant(47.755),
    percentPopulation5Min: constant(4.551),
  };
  const midtownClosedForm = {
    roundTripTimeS: 149.778,
    travelTimeS: 55.897,
    stopTimeS: 63.064,
    transferTimeS: 30.818,
    expectedStops: 9.5106,
    intervalS: 37.4445,
    percentPopulation5Min: 6.0155,
  };
  const midtownCompleted = {
    flightS: 89.486,
    dwellS: 44.336,
    fixedS: 63.056,
    stops: 9.5094,
  };

  it('charges the two documented omissions and leaves nothing unexplained', () => {
    const r = reconcileRoundTrip({
      closedForm: midtownClosedForm,
      completed: midtownCompleted,
      measured: midtownMeasured,
    });

    // Raw: 32 % long against the textbook figure. That is the number a naive comparison
    // reports as a defect, and it is not one.
    expect(r.rawDivergence).toBeCloseTo(0.3138, 3);

    // Corrected: the same round trip with jerk-limited flights and real dwells.
    expect(r.correctedRoundTripS).toBeCloseTo(196.878, 2);
    expect(Math.abs(r.residual)).toBeLessThan(0.005);
    expect(r.explained).toBe(true);
    expect(r.tolerance).toBe(DEFAULT_RESIDUAL_TOLERANCE);
    expect(r.warnings).toEqual([]);

    // Acceleration dominates, and both terms cite the assumptions they charge for.
    const [first, second] = r.terms;
    expect(first?.assumptionIds).toEqual([
      'constant-transit-speed',
      'stop-time-excludes-acceleration',
    ]);
    expect(first?.secondsS).toBeCloseTo(33.589, 2);
    expect(first?.fractionOfClosedForm).toBeCloseTo(0.2243, 3);
    expect(second?.assumptionIds).toEqual(['no-minimum-dwell']);
    expect(second?.secondsS).toBeCloseTo(13.518, 2);

    // S agrees, which is the precondition for any of the above meaning anything.
    expect(Math.abs(r.stopDivergence)).toBeLessThan(0.01);
  });

  it('refuses to call a divergence explained when the two sides disagree about the trip', () => {
    // Same timings, but the simulator made half as many stops. No timing correction can rescue
    // that, and the reconciliation must say so rather than reporting a residual.
    const r = reconcileRoundTrip({
      closedForm: midtownClosedForm,
      completed: midtownCompleted,
      measured: { ...midtownMeasured, stopsPerTrip: constant(4.7) },
    });
    expect(r.explained).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/not describing the same trip/);
    expect(r.stopDivergence).toBeLessThan(-0.4);
  });

  it('flags a negative acceleration correction as impossible rather than netting it off', () => {
    // A jerk-limited flight cannot beat the same distance at rated speed. If the completed model
    // says otherwise, it is not flying the closed form's itinerary.
    const r = reconcileRoundTrip({
      closedForm: midtownClosedForm,
      completed: { ...midtownCompleted, flightS: 40 },
      measured: midtownMeasured,
    });
    expect(r.explained).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/acceleration correction is negative/);
  });

  it('surfaces a stop-term discrepancy as an uncited correction rather than hiding it', () => {
    const r = reconcileRoundTrip({
      closedForm: midtownClosedForm,
      // Ten extra seconds of open/close/start/level, which both sides are meant to charge
      // identically. Nothing in CLOSED_FORM_ASSUMPTIONS explains it.
      completed: { ...midtownCompleted, fixedS: 63.056 + 10 },
      measured: midtownMeasured,
    });
    expect(r.correctedRoundTripS).toBeCloseTo(206.878, 2);
    // It appears as a term with no assumption to cite, which is what makes it findable.
    const uncited = r.terms.find((t) => t.assumptionIds.length === 0);
    expect(uncited?.secondsS).toBeCloseTo(9.992, 6); // 73.056 charged against 63.064
    // And it moves the residual out of band, so the reconciliation does not claim to explain it.
    expect(r.explained).toBe(false);
  });

  it('refuses a closed form whose own terms do not partition its round trip', () => {
    // The most likely way this happens is assembling the terms from two evaluations at
    // different P. The corrections would otherwise absorb the difference as if it were physics.
    const r = reconcileRoundTrip({
      closedForm: { ...midtownClosedForm, transferTimeS: 30.818 + 5 },
      completed: midtownCompleted,
      measured: midtownMeasured,
    });
    expect(r.explained).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/must partition RTT/);
  });

  /** Garden Apartments, same protocol: much smaller corrections, same structure. */
  it('reproduces the Garden Apartments reconciliation, where the corrections are 3x smaller', () => {
    const r = reconcileRoundTrip({
      closedForm: {
        roundTripTimeS: 106.477,
        travelTimeS: 46.023,
        stopTimeS: 40.293,
        transferTimeS: 20.162,
        expectedStops: 4.2329,
        intervalS: 53.239,
        percentPopulation5Min: 39.447,
      },
      completed: { flightS: 55.411, dwellS: 23.949, fixedS: 40.249, stops: 4.2271 },
      measured: {
        roundTripS: constant(120.611),
        passengersPerTrip: constant(8.401),
        stopsPerTrip: constant(4.221),
        intervalS: constant(57.737),
        percentPopulation5Min: constant(34.495),
      },
    });
    expect(r.explained).toBe(true);
    expect(Math.abs(r.residual)).toBeLessThan(0.02);
    // 9.4 s of acceleration against Midtown's 33.6 s, on a round trip only 30 % shorter.
    const acceleration = r.terms.find((t) => t.assumptionIds.includes('constant-transit-speed'));
    expect(acceleration?.secondsS).toBeCloseTo(9.388, 2);
    expect(acceleration?.fractionOfClosedForm).toBeLessThan(0.1);
  });
});
