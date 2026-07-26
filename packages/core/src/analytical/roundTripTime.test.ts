/**
 * Tests for the closed form itself: `S`, `H`, `RTT`, `INT`, `HC` and `%POP` as arithmetic
 * over plain numbers.
 *
 * Two independent kinds of check, deliberately:
 *
 * 1. **Hand-computed values**, written out in comments so a reviewer can verify them with a
 *    calculator and without running anything.
 * 2. **Exhaustive enumeration** of the underlying probability space for small `(N, P)`.
 *    `enumerateExactly` below counts every one of the `N^P` destination assignments and
 *    averages; it shares no code path with the formulas, so agreement is evidence the
 *    derivations in `roundTripTime.ts` are right rather than merely self-consistent.
 */

import { describe, expect, it } from 'vitest';

import {
  expectedStops,
  handlingCapacity5Min,
  highestReversalFloor,
  interval,
  percentPopulation,
  roundTripTime,
} from './roundTripTime.js';
import {
  ANALYTICAL_PARAMETERS,
  CLOSED_FORM_ASSUMPTIONS,
  CLOSED_FORM_COMPARISON_RULE,
  HANDLING_CAPACITY_WINDOW_S,
} from './types.js';

/**
 * Exact expectations by brute force over all `N^P` equally likely destination vectors.
 *
 * The independent check. It computes `E[number of distinct floors]` and `E[max floor]`
 * directly from the definition, with no algebra in between.
 */
function enumerateExactly(
  floors: number,
  passengers: number,
): { readonly stops: number; readonly highest: number } {
  const total = floors ** passengers;
  let stopTotal = 0;
  let highestTotal = 0;

  for (let code = 0; code < total; code += 1) {
    let remaining = code;
    const seen = new Set<number>();
    let highest = 0;
    for (let slot = 0; slot < passengers; slot += 1) {
      const destination = (remaining % floors) + 1;
      remaining = Math.floor(remaining / floors);
      seen.add(destination);
      if (destination > highest) highest = destination;
    }
    stopTotal += seen.size;
    highestTotal += highest;
  }

  return { stops: stopTotal / total, highest: highestTotal / total };
}

describe('expectedStops — S = N·(1 − ((N−1)/N)^P)', () => {
  it('is 1 stop for a single passenger, whatever the building', () => {
    // One passenger has exactly one destination, so the car makes exactly one stop.
    // S = 10·(1 − 0.9) = 10 × 0.1 = 1.
    expect(expectedStops(10, 1)).toBeCloseTo(1, 12);
    expect(expectedStops(60, 1)).toBeCloseTo(1, 12);
    expect(expectedStops(2, 1)).toBeCloseTo(1, 12);
  });

  it('matches the hand-computed value for N = 10, P = 10', () => {
    // 0.9^10 = 0.3486784401 exactly (9^10 = 3_486_784_401, 10^10 = 10_000_000_000).
    // S = 10 × (1 − 0.3486784401) = 6.513215599.
    expect(expectedStops(10, 10)).toBeCloseTo(6.513215599, 9);
  });

  it('matches hand-computed values for other small cases', () => {
    // N = 2, P = 2: 2 × (1 − 0.25) = 1.5.
    expect(expectedStops(2, 2)).toBeCloseTo(1.5, 12);
    // N = 4, P = 2: 4 × (1 − (3/4)²) = 4 × (1 − 0.5625) = 1.75.
    expect(expectedStops(4, 2)).toBeCloseTo(1.75, 12);
    // N = 5, P = 5: 5 × (1 − 0.8^5) = 5 × (1 − 0.32768) = 3.3616.
    expect(expectedStops(5, 5)).toBeCloseTo(3.3616, 12);
    // N = 20, P = 20: 0.95^20 = 0.3584859224...; 20 × 0.6415140776 = 12.830281552.
    expect(expectedStops(20, 20)).toBeCloseTo(12.830281552, 9);
  });

  it('is exactly 1 when the bank serves a single floor', () => {
    // log1p(-1) is -Infinity, so the implementation has to survive the degenerate case.
    expect(expectedStops(1, 1)).toBe(1);
    expect(expectedStops(1, 25)).toBe(1);
    expect(expectedStops(1, 12.8)).toBe(1);
  });

  it('agrees with exhaustive enumeration of the probability space', () => {
    for (const [floors, passengers] of [
      [2, 4],
      [3, 5],
      [4, 3],
      [5, 4],
      [6, 3],
      [8, 4],
    ] as const) {
      expect(expectedStops(floors, passengers)).toBeCloseTo(
        enumerateExactly(floors, passengers).stops,
        10,
      );
    }
  });

  it('accepts a fractional P, which is the normal case', () => {
    // P = 0.8 × 16 persons = 12.8. Bracketed by the integer neighbours, since S rises
    // monotonically with load.
    const s = expectedStops(19, 12.8);
    expect(s).toBeGreaterThan(expectedStops(19, 12));
    expect(s).toBeLessThan(expectedStops(19, 13));
    expect(s).toBeCloseTo(9.489670279, 9);
  });

  it('rises with load and saturates towards N', () => {
    expect(expectedStops(20, 100)).toBeLessThan(20);
    expect(expectedStops(20, 100)).toBeGreaterThan(19.8);
  });

  it('stays precise where the literal 1 − x form loses digits', () => {
    // N = 60, P = 0.5. The literal form computes 1 − 0.9916… and cancels away most of the
    // mantissa. There is a closed form for this particular case that does not cancel:
    //   60·(1 − √(59/60)) = 60·(1 − 59/60)/(1 + √(59/60)) = 1/(1 + √(59/60))
    // which is the reference below, correctly rounded.
    const reference = 1 / (1 + Math.sqrt(59 / 60));
    expect(expectedStops(60, 0.5)).toBe(reference);
    // And the literal form really is worse, by ~10 ulp — this is not a hypothetical.
    const literal = 60 * (1 - Math.pow(59 / 60, 0.5));
    expect(Math.abs(literal - reference)).toBeGreaterThan(
      Math.abs(expectedStops(60, 0.5) - reference),
    );
  });

  it('rejects inputs outside its domain', () => {
    expect(() => expectedStops(0, 5)).toThrow(RangeError);
    expect(() => expectedStops(-3, 5)).toThrow(RangeError);
    expect(() => expectedStops(10.5, 5)).toThrow(RangeError);
    expect(() => expectedStops(10, 0)).toThrow(RangeError);
    expect(() => expectedStops(10, -1)).toThrow(RangeError);
    expect(() => expectedStops(10, Number.NaN)).toThrow(RangeError);
    expect(() => expectedStops(Number.POSITIVE_INFINITY, 5)).toThrow(RangeError);
  });
});

describe('highestReversalFloor — H = N − Σ_{i=1..N−1} (i/N)^P', () => {
  it('is the mean of a uniform draw when one passenger travels', () => {
    // With P = 1 the highest floor is the only destination, so H must be (N+1)/2.
    // N = 10: 10 − (1+2+…+9)/10 = 10 − 4.5 = 5.5.
    expect(highestReversalFloor(10, 1)).toBeCloseTo(5.5, 12);
    expect(highestReversalFloor(2, 1)).toBeCloseTo(1.5, 12);
    expect(highestReversalFloor(19, 1)).toBeCloseTo(10, 12);
    expect(highestReversalFloor(60, 1)).toBeCloseTo(30.5, 12);
  });

  it('matches hand-computed values for small cases', () => {
    // N = 2, P = 2. max of two draws from {1,2}: Pr(max=1)=1/4, Pr(max=2)=3/4.
    // E = 1·¼ + 2·¾ = 1.75, and the formula gives 2 − (1/2)² = 1.75.
    expect(highestReversalFloor(2, 2)).toBeCloseTo(1.75, 12);

    // N = 4, P = 2. Pr(max ≤ i) = (i/4)², so Pr(max=1,2,3,4) = 1/16, 3/16, 5/16, 7/16
    // and E = (1 + 6 + 15 + 28)/16 = 50/16 = 3.125.
    // Formula: 4 − [(1/4)² + (2/4)² + (3/4)²] = 4 − [0.0625 + 0.25 + 0.5625] = 3.125.
    expect(highestReversalFloor(4, 2)).toBeCloseTo(3.125, 12);
  });

  it('matches the hand-computed value for N = 10, P = 10', () => {
    // Σ_{i=1..9} (i/10)^10, term by term:
    //   0.1^10 = 0.0000000001      0.2^10 = 0.0000001024
    //   0.3^10 = 0.0000059049      0.4^10 = 0.0001048576
    //   0.5^10 = 0.0009765625      0.6^10 = 0.0060466176
    //   0.7^10 = 0.0282475249      0.8^10 = 0.1073741824
    //   0.9^10 = 0.3486784401
    //   Σ      = 0.4914341925
    // H = 10 − 0.4914341925 = 9.5085658075.
    expect(highestReversalFloor(10, 10)).toBeCloseTo(9.5085658075, 9);
  });

  it('is exactly N when the bank serves a single floor', () => {
    // The sum is empty: there is nowhere else to go.
    expect(highestReversalFloor(1, 1)).toBe(1);
    expect(highestReversalFloor(1, 20)).toBe(1);
  });

  it('agrees with exhaustive enumeration of the probability space', () => {
    for (const [floors, passengers] of [
      [2, 4],
      [3, 5],
      [4, 3],
      [5, 4],
      [6, 3],
      [8, 4],
    ] as const) {
      expect(highestReversalFloor(floors, passengers)).toBeCloseTo(
        enumerateExactly(floors, passengers).highest,
        10,
      );
    }
  });

  it('approaches the top of the zone as the car fills', () => {
    // A full up-peak car almost always contains somebody going near the top. This is why
    // up-peak round trips are dominated by the full-height run.
    expect(highestReversalFloor(19, 12.8)).toBeCloseTo(18.067376494, 9);
    expect(highestReversalFloor(19, 12.8) / 19).toBeGreaterThan(0.95);
    expect(highestReversalFloor(19, 50)).toBeGreaterThan(18.9);
    expect(highestReversalFloor(19, 50)).toBeLessThan(19);
  });

  it('is bounded by 1 and N, and rises with load', () => {
    for (let passengers = 1; passengers <= 30; passengers += 1) {
      const h = highestReversalFloor(12, passengers);
      expect(h).toBeGreaterThanOrEqual(1);
      expect(h).toBeLessThanOrEqual(12);
      if (passengers > 1) expect(h).toBeGreaterThan(highestReversalFloor(12, passengers - 1));
    }
  });

  it('rejects inputs outside its domain', () => {
    expect(() => highestReversalFloor(0, 5)).toThrow(RangeError);
    expect(() => highestReversalFloor(4.5, 5)).toThrow(RangeError);
    expect(() => highestReversalFloor(10, 0)).toThrow(RangeError);
    expect(() => highestReversalFloor(10, Number.NaN)).toThrow(RangeError);
  });
});

describe('roundTripTime — RTT = 2·(H·tv + tx) + (S+1)·ts + 2·P·tp', () => {
  /**
   * A round-numbered example that can be checked entirely by hand.
   *
   * N = 10, P = 10, tv = 2 s, ts = 10 s, tp = 1 s, L = 4, U = 1000, tx = 0.
   *
   *   S = 6.513215599        (from the N = 10, P = 10 case above)
   *   H = 9.5085658075       (likewise)
   *
   *   travel   = 2 × (9.5085658075 × 2 + 0) = 38.03426323
   *   stops    = (6.513215599 + 1) × 10     = 75.13215599
   *   transfer = 2 × 10 × 1                 = 20
   *   RTT      = 38.03426323 + 75.13215599 + 20 = 133.16641922 s
   *
   *   INT  = 133.16641922 / 4              = 33.291604805 s
   *   HC   = 300 × 10 × 4 / 133.16641922   = 12000 / 133.16641922 = 90.11 persons / 5 min
   *   %POP = 90.11 / 1000 × 100            = 9.011 %
   */
  const textbook = {
    floorsAboveTerminal: 10,
    passengersPerTrip: 10,
    singleFloorTransitS: 2,
    stopTimeLossS: 10,
    passengerTransferS: 1,
    carsInGroup: 4,
    population: 1000,
  } as const;

  it('reproduces the hand-computed worked example term by term', () => {
    const result = roundTripTime(textbook);

    expect(result.expectedStops).toBeCloseTo(6.513215599, 9);
    expect(result.highestReversalFloor).toBeCloseTo(9.5085658075, 9);

    expect(result.travelTimeS).toBeCloseTo(38.03426323, 8);
    expect(result.stopTimeS).toBeCloseTo(75.13215599, 8);
    expect(result.transferTimeS).toBe(20);
    expect(result.roundTripTimeS).toBeCloseTo(133.16641922, 8);

    expect(result.intervalS).toBeCloseTo(33.291604805, 8);
    expect(result.handlingCapacity5Min).toBeCloseTo(12000 / 133.16641922, 6);
    expect(result.percentPopulation5Min).toBeCloseTo((12000 / 133.16641922) / 10, 6);
  });

  it('decomposes exactly: the three terms sum to RTT', () => {
    const result = roundTripTime(textbook);
    expect(result.travelTimeS + result.stopTimeS + result.transferTimeS).toBeCloseTo(
      result.roundTripTimeS,
      12,
    );
  });

  it('reports both the per-car and the whole-group handling capacity', () => {
    // docs/03-traffic-and-statistics.md Part 2 states HC5 = 300·P·L/RTT = 300·P/INT: the
    // group figure, which is what the Part 1 "% pop / 5 min" targets are quoted in and what
    // %POP divides by population. The per-car figure, 300·P/RTT, is reported alongside it —
    // it is L times smaller, and reading the group formula without L is precisely the
    // factor-of-L error the doc used to invite.
    const result = roundTripTime(textbook);
    expect(result.handlingCapacityPerCar5Min).toBeCloseTo(
      (HANDLING_CAPACITY_WINDOW_S * 10) / result.roundTripTimeS,
      12,
    );
    expect(result.handlingCapacity5Min).toBeCloseTo(result.handlingCapacityPerCar5Min * 4, 12);
    // 300·P/INT is the same quantity written the other way round.
    expect(result.handlingCapacity5Min).toBeCloseTo((300 * 10) / result.intervalS, 10);
    // And %POP is measured with the group figure, never the per-car one.
    expect(result.percentPopulation5Min).toBeCloseTo(
      (result.handlingCapacity5Min / 1000) * 100,
      10,
    );
    expect(result.percentPopulation5Min).not.toBeCloseTo(
      (result.handlingCapacityPerCar5Min / 1000) * 100,
      6,
    );
  });

  it('charges one more stop than there are destination floors', () => {
    // The +1 in (S+1)·ts is the stop at the terminal itself, where the car loads.
    const withStops = roundTripTime({ ...textbook, stopTimeLossS: 10 });
    const withoutStops = roundTripTime({ ...textbook, stopTimeLossS: 0 });
    expect(withStops.roundTripTimeS - withoutStops.roundTripTimeS).toBeCloseTo(
      (withStops.expectedStops + 1) * 10,
      10,
    );
  });

  it('adds the express jump twice, once each way', () => {
    const plain = roundTripTime(textbook);
    const express = roundTripTime({ ...textbook, expressJumpS: 14.025 });
    expect(express.roundTripTimeS - plain.roundTripTimeS).toBeCloseTo(2 * 14.025, 10);
    // It moves travel time only; stops and transfers are untouched.
    expect(express.stopTimeS).toBeCloseTo(plain.stopTimeS, 12);
    expect(express.transferTimeS).toBeCloseTo(plain.transferTimeS, 12);
  });

  it('defaults the express jump to zero, giving the published expression verbatim', () => {
    expect(roundTripTime(textbook).terms.expressJumpS).toBe(0);
    expect(roundTripTime(textbook).roundTripTimeS).toBe(
      roundTripTime({ ...textbook, expressJumpS: 0 }).roundTripTimeS,
    );
  });

  it('accepts a slightly negative express jump, and rejects one that inverts travel', () => {
    // Negative tx is legitimate: it means the terminal sits less than one interfloor
    // distance below the served zone. It is only nonsense once travel goes negative.
    expect(roundTripTime({ ...textbook, expressJumpS: -0.5 }).travelTimeS).toBeCloseTo(
      2 * (9.5085658075 * 2 - 0.5),
      8,
    );
    expect(() => roundTripTime({ ...textbook, expressJumpS: -100 })).toThrow(RangeError);
  });

  it('is pure: the argument is not mutated and repeated calls agree exactly', () => {
    const terms = { ...textbook };
    const snapshot = JSON.stringify(terms);
    const first = roundTripTime(terms);
    const second = roundTripTime(terms);
    expect(JSON.stringify(terms)).toBe(snapshot);
    expect(second).toEqual(first);
  });

  it('echoes its resolved inputs back', () => {
    const result = roundTripTime(textbook);
    expect(result.terms).toEqual({ ...textbook, expressJumpS: 0 });
  });

  it('rejects terms outside their domain rather than returning plausible nonsense', () => {
    expect(() => roundTripTime({ ...textbook, floorsAboveTerminal: 0 })).toThrow(RangeError);
    expect(() => roundTripTime({ ...textbook, floorsAboveTerminal: 9.5 })).toThrow(RangeError);
    expect(() => roundTripTime({ ...textbook, passengersPerTrip: 0 })).toThrow(RangeError);
    expect(() => roundTripTime({ ...textbook, singleFloorTransitS: -1 })).toThrow(RangeError);
    expect(() => roundTripTime({ ...textbook, stopTimeLossS: -1 })).toThrow(RangeError);
    expect(() => roundTripTime({ ...textbook, passengerTransferS: -1 })).toThrow(RangeError);
    expect(() => roundTripTime({ ...textbook, carsInGroup: 0 })).toThrow(RangeError);
    expect(() => roundTripTime({ ...textbook, carsInGroup: 2.5 })).toThrow(RangeError);
    expect(() => roundTripTime({ ...textbook, population: 0 })).toThrow(RangeError);
    expect(() =>
      roundTripTime({
        ...textbook,
        singleFloorTransitS: 0,
        stopTimeLossS: 0,
        passengerTransferS: 0,
      }),
    ).toThrow(RangeError);
  });

  it('moves the way physics says it should', () => {
    const base = roundTripTime(textbook);
    // More cars: same round trip, shorter interval, more capacity.
    const moreCars = roundTripTime({ ...textbook, carsInGroup: 8 });
    expect(moreCars.roundTripTimeS).toBeCloseTo(base.roundTripTimeS, 12);
    expect(moreCars.intervalS).toBeCloseTo(base.intervalS / 2, 12);
    expect(moreCars.handlingCapacity5Min).toBeCloseTo(base.handlingCapacity5Min * 2, 10);

    // Faster car: smaller tv, shorter round trip. Note the closed form rewards speed
    // without limit, because it never models the acceleration that caps a short hop —
    // exactly the failure mode CLAUDE.md warns about, and why the simulation is the
    // authority on short-hop behaviour rather than this.
    expect(roundTripTime({ ...textbook, singleFloorTransitS: 1 }).roundTripTimeS).toBeLessThan(
      base.roundTripTimeS,
    );

    // Taller zone: more stops and a higher reversal floor.
    const taller = roundTripTime({ ...textbook, floorsAboveTerminal: 20 });
    expect(taller.expectedStops).toBeGreaterThan(base.expectedStops);
    expect(taller.roundTripTimeS).toBeGreaterThan(base.roundTripTimeS);
  });
});

describe('derived quantities', () => {
  it('interval is RTT over the group size', () => {
    expect(interval(150, 4)).toBe(37.5);
    expect(() => interval(150, 0)).toThrow(RangeError);
    expect(() => interval(0, 4)).toThrow(RangeError);
  });

  it('handling capacity is 300·P·L / RTT', () => {
    expect(handlingCapacity5Min(12.8, 150, 4)).toBeCloseTo((300 * 12.8 * 4) / 150, 12);
    // Equivalently 300·P/INT.
    expect(handlingCapacity5Min(12.8, 150, 4)).toBeCloseTo((300 * 12.8) / interval(150, 4), 12);
    expect(() => handlingCapacity5Min(12.8, 150, 1.5)).toThrow(RangeError);
  });

  it('percent population is handling capacity over population', () => {
    expect(percentPopulation(102.4, 1000)).toBeCloseTo(10.24, 12);
    expect(() => percentPopulation(102.4, 0)).toThrow(RangeError);
  });
});

describe('the documented model', () => {
  it('enumerates every simplification with the direction it biases RTT', () => {
    expect(CLOSED_FORM_ASSUMPTIONS.length).toBeGreaterThanOrEqual(10);
    const ids = CLOSED_FORM_ASSUMPTIONS.map((assumption) => assumption.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The four the task brief calls out by name must be present and stay present.
    expect(ids).toContain('constant-transit-speed');
    expect(ids).toContain('uniform-floor-populations');
    expect(ids).toContain('single-entrance');
    expect(ids).toContain('pure-up-peak');
    for (const assumption of CLOSED_FORM_ASSUMPTIONS) {
      expect(assumption.assumption.length).toBeGreaterThan(20);
      expect(assumption.divergence.length).toBeGreaterThan(20);
      expect(['under', 'over', 'either', 'none']).toContain(assumption.bias);
    }
  });

  it('says the closed form is optimistic about the travel and stop terms', () => {
    // These three are what make a simulated RTT land *above* the closed form. They are
    // one-sided: nothing on the list pushes back against them.
    const byId = new Map(CLOSED_FORM_ASSUMPTIONS.map((a) => [a.id, a]));
    expect(byId.get('constant-transit-speed')?.bias).toBe('under');
    expect(byId.get('stop-time-excludes-acceleration')?.bias).toBe('under');
    expect(byId.get('no-minimum-dwell')?.bias).toBe('under');
  });

  it('does NOT say the closed form is one-sided overall — two entries bias over', () => {
    // The trap this guards. "Every term it omits only ever adds seconds, so a simulation
    // below the closed form is wrong" is false by this module's own data: a part-full car
    // makes fewer stops and a shorter round trip. Both entries act through the load P,
    // which is why CLOSED_FORM_COMPARISON_RULE's precondition is matched load.
    const byId = new Map(CLOSED_FORM_ASSUMPTIONS.map((a) => [a.id, a]));
    expect(byId.get('full-car-every-trip')?.bias).toBe('over');
    expect(byId.get('fractional-capacity')?.bias).toBe('over');
    expect(CLOSED_FORM_ASSUMPTIONS.some((a) => a.bias === 'over')).toBe(true);
  });

  it('states the comparison rule with the precondition that makes it sound', () => {
    const rule = CLOSED_FORM_COMPARISON_RULE;

    // The rule is only ever quoted with its scope attached.
    expect(rule.statement).toMatch(/matched load/i);
    expect(rule.precondition.length).toBeGreaterThan(80);
    expect(rule.matchedLoadGuidance).toMatch(/passengersPerTrip/);

    // And the escape hatch it points at has to exist for the guidance to be actionable.
    const ids = ANALYTICAL_PARAMETERS.map((parameter) => parameter.id);
    expect(ids).toContain('analytical.designLoadFactor');
  });

  it('keeps the comparison rule and the assumption table in agreement', () => {
    // The whole point of holding the rule as data: it cannot drift from the table it rests
    // on. Add a new 'over'-biased assumption without listing it and this fails.
    const rule = CLOSED_FORM_COMPARISON_RULE;
    const byId = new Map(CLOSED_FORM_ASSUMPTIONS.map((a) => [a.id, a]));

    for (const id of rule.oneSidedUnderIds) {
      expect(byId.get(id), `${id} is not a documented assumption`).toBeDefined();
      expect(byId.get(id)?.bias, `${id} must bias 'under' to be one-sided`).toBe('under');
    }
    for (const id of rule.canPushSimulationBelowIds) {
      expect(byId.get(id), `${id} is not a documented assumption`).toBeDefined();
      expect(['over', 'either']).toContain(byId.get(id)?.bias);
    }

    // Disjoint, and between them they account for every assumption that moves RTT at all.
    const under = new Set(rule.oneSidedUnderIds);
    const below = new Set(rule.canPushSimulationBelowIds);
    expect(rule.oneSidedUnderIds.filter((id) => below.has(id))).toEqual([]);
    const moving = CLOSED_FORM_ASSUMPTIONS.filter((a) => a.bias !== 'none').map((a) => a.id);
    for (const id of moving) {
      expect(
        under.has(id) || below.has(id),
        `${id} moves RTT but is classified by neither list on CLOSED_FORM_COMPARISON_RULE`,
      ).toBe(true);
    }

    // Non-empty is the load-bearing assertion: if this list could be empty, the unqualified
    // "below means broken" rule would be sound and the precondition unnecessary.
    expect(rule.canPushSimulationBelowIds.length).toBeGreaterThan(0);
  });

  it('demonstrates the counterexample in arithmetic: less load, shorter RTT', () => {
    // Midtown Office's terms. At the design load P = 12.8 the closed form gives 149.54 s;
    // at the largest load the simulator can actually board, ⌊0.8 × 16⌋ = 12, it gives
    // 144.85 s. A simulation reading 144.85 s is not 3.1 % broken, it is being compared
    // against the wrong P.
    const midtown = {
      floorsAboveTerminal: 19,
      passengersPerTrip: 12.8,
      singleFloorTransitS: 1.52,
      stopTimeLossS: 6.0,
      passengerTransferS: 1.2,
      carsInGroup: 4,
      population: 1710,
      expressJumpS: 0.48,
    } as const;

    const design = roundTripTime(midtown);
    const boarded = roundTripTime({ ...midtown, passengersPerTrip: 12 });

    expect(design.roundTripTimeS).toBeCloseTo(149.5428462, 6);
    expect(boarded.roundTripTimeS).toBeCloseTo(144.8534513, 6);
    expect(boarded.roundTripTimeS).toBeLessThan(design.roundTripTimeS);
    expect(boarded.roundTripTimeS / design.roundTripTimeS).toBeCloseTo(0.9686, 3);

    // RTT falls monotonically as the car empties, across the whole plausible range. Any
    // acceptance test that compares at an unmatched load is reading somewhere on this
    // curve rather than measuring the simulator.
    let previous = Number.POSITIVE_INFINITY;
    for (const passengers of [12.8, 12, 11, 10, 8, 6, 4, 2]) {
      const rtt = roundTripTime({ ...midtown, passengersPerTrip: passengers }).roundTripTimeS;
      expect(rtt).toBeLessThan(previous);
      previous = rtt;
    }
  });

  it('declares a schema for every tunable it exposes (CLAUDE.md invariant 8)', () => {
    expect(ANALYTICAL_PARAMETERS.length).toBeGreaterThan(0);
    for (const parameter of ANALYTICAL_PARAMETERS) {
      expect(parameter.id.startsWith('analytical.')).toBe(true);
      expect(parameter.description.length).toBeGreaterThan(10);
      if (parameter.type === 'continuous' || parameter.type === 'integer') {
        expect(parameter.range).toBeDefined();
        const [min, max] = parameter.range ?? [0, 0];
        expect(min).toBeLessThan(max);
        expect(typeof parameter.default).toBe('number');
        expect(parameter.default as number).toBeGreaterThanOrEqual(min);
        expect(parameter.default as number).toBeLessThanOrEqual(max);
      }
    }
  });
});
