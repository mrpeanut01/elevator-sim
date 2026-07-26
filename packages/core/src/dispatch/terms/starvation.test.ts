import { describe, expect, it } from 'vitest';

import { normalizeTerm, resolveNormalization } from '../normalize.js';

import { call, contextFor, hallCall, makeCar } from './fixtures.test-helper.js';
import {
  STARVATION_HALF_COST_S,
  oldestDelayedCallAgeS,
  starvationSeconds,
  starvationTerm,
} from './starvation.js';

const SCALES = resolveNormalization();

/**
 * A car at 0 holding a landing call at 10 that was registered at `registeredAt`, scored at `at`
 * against a new call at 4 — which goes in front of the old one and pushes it back.
 */
function deferring(at: number, registeredAt = 0, newCallRegisteredAt = at) {
  const car = makeCar('A', '0');
  car.assignHallCall(hallCall('10', 'up', registeredAt));
  return contextFor(car.snapshot(at), call('4', 'up', newCallRegisteredAt), { at });
}

describe('starvation', () => {
  it('is small for a fresh call pushed back and large for an old one', () => {
    const fresh = deferring(10);
    const stale = deferring(90);

    expect(oldestDelayedCallAgeS(fresh)).toBe(10);
    expect(oldestDelayedCallAgeS(stale)).toBe(90);
    expect(starvationSeconds(stale)).toBeGreaterThan(starvationSeconds(fresh));
  });

  it('escalates: every extra second of age costs more than the last', () => {
    // The operational content of "escalating", and the property a linear age term would not have.
    // The raw value is age²/H, so its first difference grows without bound while the second
    // difference stays positive — a 20 s-old call is a mild preference, a 100 s-old one a
    // near-veto, and the crossover is smooth rather than a threshold a call can sit just under.
    const ages = [0, 20, 40, 60, 80, 100];
    const raws = ages.map((age) => starvationSeconds(deferring(age)));

    for (let i = 1; i < raws.length; i += 1) {
      expect(raws[i] as number, `age ${ages[i]}`).toBeGreaterThan(raws[i - 1] as number);
    }
    for (let i = 2; i < raws.length; i += 1) {
      const later = (raws[i] as number) - (raws[i - 1] as number);
      const earlier = (raws[i - 1] as number) - (raws[i - 2] as number);
      expect(later, `age ${ages[i]}`).toBeGreaterThan(earlier);
    }

    // And the closed form, so the escalation is pinned rather than merely asserted.
    expect(starvationSeconds(deferring(60))).toBeCloseTo(
      (60 * 60) / STARVATION_HALF_COST_S,
      9,
    );
  });

  it('still escalates once normalized, below the half-cost point', () => {
    // Both normalization maps decelerate, which is why the escalation lives in the raw value.
    // Composed, the term is a sigmoid in age: convex up the near side of the half-cost point.
    const ages = [0, 15, 30, 45];
    const normalized = ages.map((age) =>
      normalizeTerm(starvationTerm, starvationSeconds(deferring(age)), SCALES),
    );
    for (let i = 2; i < normalized.length; i += 1) {
      const later = (normalized[i] as number) - (normalized[i - 1] as number);
      const earlier = (normalized[i - 1] as number) - (normalized[i - 2] as number);
      expect(later, `age ${ages[i]}`).toBeGreaterThan(earlier);
    }
  });

  it('puts the half-cost point at a sixty-second-old call', () => {
    // STARVATION_HALF_COST_S and normalization.waitTimeS are both 60 for the same reason: 60 s is
    // the threshold the % > 60 s metric reports against.
    expect(normalizeTerm(starvationTerm, starvationSeconds(deferring(60)), SCALES)).toBeCloseTo(
      0.5,
      12,
    );
  });

  it('is INDEPENDENT of the call being scored — the mistake this term is usually made of', () => {
    // Charging a car for how long *this* call has waited adds the same constant to every
    // candidate's cost, because the age is a property of the call and not of any car. It cannot
    // change an argmin: it moves nobody and merely inflates the reported cost. So the age of the
    // call under consideration must not enter the term at all — and here it demonstrably does not.
    const at = 90;
    const values = [0, 15, 45, 90].map((registeredAt) =>
      starvationSeconds(deferring(at, 0, registeredAt)),
    );

    const first = values[0] as number;
    expect(first).toBeGreaterThan(0);
    for (const value of values) expect(value).toBe(first);

    // The complementary half: it *is* a function of the committed call's age.
    expect(starvationSeconds(deferring(at, 60))).toBeLessThan(starvationSeconds(deferring(at, 0)));
    expect(starvationSeconds(deferring(at, 0))).toBeGreaterThan(0);
  });

  it('takes the oldest delayed call, not the newest and not the mean', () => {
    const car = makeCar('A', '0');
    car.assignHallCall(hallCall('10', 'up', 0)); // 90 s old at t = 90
    car.assignHallCall(hallCall('6', 'up', 60)); // 30 s old
    const context = contextFor(car.snapshot(90), call('4', 'up', 90), { at: 90 });

    expect(oldestDelayedCallAgeS(context)).toBe(90);
    expect(starvationSeconds(context)).toBeCloseTo((90 * 90) / STARVATION_HALF_COST_S, 9);
  });

  it('is zero when the call delays nobody', () => {
    // A car at 0 with a landing call at 10 loses nothing by also taking one at 12: the old call is
    // reached exactly when it was going to be. There is no starvation to price.
    const car = makeCar('A', '0');
    car.assignHallCall(hallCall('10', 'up', 0));
    const context = contextFor(car.snapshot(90), call('12', 'up', 90), { at: 90 });

    expect(context.estimate.marginalDelaySeconds).toBe(0);
    expect(starvationSeconds(context)).toBe(0);
  });

  it('ignores car calls: a passenger aboard is not a starving landing', () => {
    // Their waiting ended when they boarded, and the delay they suffer is `detourPenalty`'s to
    // price. `CommittedStop.registeredAt` is read only for stops carrying a hall call.
    const riding = makeCar('A', '0');
    riding.registerCarCall('10', 0);
    const carCallContext = contextFor(riding.snapshot(90), call('4', 'up', 90), { at: 90 });

    expect(carCallContext.estimate.marginalDelaySeconds).toBeGreaterThan(0);
    expect(starvationSeconds(carCallContext)).toBe(0);

    // The same geometry with a landing call instead does bite.
    expect(starvationSeconds(deferring(90))).toBeGreaterThan(0);
  });

  it('is zero for a car with nothing committed', () => {
    const idle = makeCar('A', '0');
    expect(starvationSeconds(contextFor(idle.snapshot(90), call('4', 'up', 0), { at: 90 }))).toBe(0);
  });

  it('is never negative, even if the clock is behind the registration', () => {
    // Defensive rather than expected: a negative age would mean the decision time preceded the
    // button press. It must not become a bonus.
    const context = deferring(0, 30);
    expect(oldestDelayedCallAgeS(context)).toBe(0);
    expect(starvationSeconds(context)).toBe(0);
  });
});
