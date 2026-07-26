import { describe, expect, it } from 'vitest';

import { existingCallDelaySeconds } from './existingCallDelay.js';
import { call, contextFor, hallCall, makeCar } from './fixtures.test-helper.js';
import { routeComparison } from './routeComparison.js';

/** A car at 4 holding landing calls at 8, 12 and 16, so there is plenty to push back. */
function busy(id = 'A') {
  const car = makeCar(id, '4');
  car.assignHallCall(hallCall('8', 'up', 0));
  car.assignHallCall(hallCall('12', 'up', 0));
  car.assignHallCall(hallCall('16', 'up', 0));
  return car;
}

describe('existingCallDelay', () => {
  it('is high for a call inserted in front of three others and zero for one behind them', () => {
    const car = busy();
    const inFront = contextFor(car.snapshot(0), call('6', 'up'));
    const behind = contextFor(car.snapshot(0), call('18', 'up'));

    expect(existingCallDelaySeconds(inFront)).toBeGreaterThan(0);
    expect(existingCallDelaySeconds(behind)).toBe(0);
  });

  it('is exactly CostEstimate.marginalDelaySeconds, never a second opinion', () => {
    // The identity the module docstring commits to. Two definitions of "added delay" would let
    // the dispatcher reject a car on one and price it on the other, and the cheaper of two
    // inconsistent answers wins every time.
    const car = busy();
    for (const floorId of ['0', '5', '6', '8', '10', '12', '14', '16', '20']) {
      const context = contextFor(car.snapshot(0), call(floorId, 'up'));
      expect(existingCallDelaySeconds(context), floorId).toBe(context.estimate.marginalDelaySeconds);
    }
  });

  it('agrees with the shared route comparison, stop for stop', () => {
    // The same number from the other side: the sum of the per-stop deltas the terms compute for
    // themselves equals the scalar the car's estimator produced. If the car ever changed its mind
    // about what a delay is, this fails rather than a term silently disagreeing with it.
    const car = busy();
    for (const floorId of ['0', '6', '10', '14', '20']) {
      const context = contextFor(car.snapshot(0), call(floorId, 'up'));
      const summed = routeComparison(context).delayed.reduce(
        (total, delayed) => total + delayed.addedSeconds,
        0,
      );
      expect(summed, floorId).toBeCloseTo(context.estimate.marginalDelaySeconds, 9);
    }
  });

  it('grows with the number of stops pushed back, not just the worst one', () => {
    // Summed over stops, which is `CostEstimate`'s documented contract. Five stops two seconds
    // later is ten seconds, not two.
    const one = makeCar('A', '4');
    one.assignHallCall(hallCall('16', 'up', 0));

    const three = busy('B');

    const oneDelayed = existingCallDelaySeconds(contextFor(one.snapshot(0), call('6', 'up')));
    const threeDelayed = existingCallDelaySeconds(contextFor(three.snapshot(0), call('6', 'up')));

    expect(threeDelayed).toBeGreaterThan(oneDelayed);
  });

  it('is zero for a car with nothing to delay', () => {
    const idle = makeCar('A', '4');
    expect(existingCallDelaySeconds(contextFor(idle.snapshot(0), call('12', 'up')))).toBe(0);
  });

  it('charges nothing for a floor the car was already stopping at', () => {
    const car = busy();
    expect(existingCallDelaySeconds(contextFor(car.snapshot(0), call('12', 'up')))).toBe(0);
  });

  it('is never negative', () => {
    const car = busy();
    for (const floorId of ['0', '2', '8', '13', '20']) {
      expect(
        existingCallDelaySeconds(contextFor(car.snapshot(0), call(floorId, 'down'))),
      ).toBeGreaterThanOrEqual(0);
    }
  });
});
