import { describe, expect, it } from 'vitest';

import {
  call,
  contextFor,
  hallCall,
  makeCar,
  passengerTo,
} from './fixtures.test-helper.js';
import { compareRoutes, routeComparison } from './routeComparison.js';

/** A car at 4 running up, holding landing calls at 8 and 16 and carrying two people to 12. */
function working(id = 'A') {
  const car = makeCar(id, '4');
  car.assignHallCall(hallCall('8', 'up', 0));
  car.assignHallCall(hallCall('16', 'up', 0));
  car.board(passengerTo('12'), 0);
  car.board(passengerTo('12'), 0);
  return car;
}

describe('the shared route comparison', () => {
  it('returns the identical object for the same context, and an equal one without the memo', () => {
    // The memo is an optimisation and nothing else: remove it and every number in the package is
    // bit-identical. That is the claim, and this is the assertion of it.
    const context = contextFor(working().snapshot(0), call('6', 'up'));

    expect(routeComparison(context)).toBe(routeComparison(context));
    expect(JSON.stringify(compareRoutes(context))).toBe(JSON.stringify(routeComparison(context)));
  });

  it('agrees with the car’s own estimate about the delay it causes', () => {
    // The identity `existingCallDelay` relies on: the per-stop deltas the terms compute sum to
    // the scalar `Car.estimateCost()` produced from the same pair of projections.
    const car = working();
    for (const floorId of ['0', '5', '6', '8', '10', '13', '17', '20']) {
      const context = contextFor(car.snapshot(0), call(floorId, 'up'));
      const summed = routeComparison(context).delayed.reduce(
        (total, entry) => total + entry.addedSeconds,
        0,
      );
      expect(summed, floorId).toBeCloseTo(context.estimate.marginalDelaySeconds, 9);
    }
  });

  it('reports one added stop for a new floor and none for a floor already on the route', () => {
    const car = working();
    expect(routeComparison(contextFor(car.snapshot(0), call('6', 'up'))).addedStops).toBe(1);
    expect(routeComparison(contextFor(car.snapshot(0), call('8', 'up'))).addedStops).toBe(0);
    expect(routeComparison(contextFor(car.snapshot(0), call('12', 'up'))).addedStops).toBe(0);
  });

  it('lists only stops that really move, in baseline route order', () => {
    const context = contextFor(working().snapshot(0), call('6', 'up'));
    const delayed = routeComparison(context).delayed;

    expect(delayed.length).toBeGreaterThan(0);
    for (const entry of delayed) expect(entry.addedSeconds).toBeGreaterThan(0);
    expect(delayed.map((entry) => entry.stop.order)).toEqual(
      [...delayed.map((entry) => entry.stop.order)].sort((a, b) => a - b),
    );
  });

  it('projects the mass aboard when the doors open at the call floor', () => {
    // Out first, then in: everyone bound for a floor the car reaches first has gone, and so has
    // anyone bound for the call floor itself. Two 75 kg passengers for 12, so a call at 16 finds
    // an empty car and a call at 10 finds a full one.
    const car = working();
    expect(routeComparison(contextFor(car.snapshot(0), call('10', 'up'))).massOnArrivalKg).toBe(150);
    expect(routeComparison(contextFor(car.snapshot(0), call('12', 'up'))).massOnArrivalKg).toBe(0);
    expect(routeComparison(contextFor(car.snapshot(0), call('16', 'up'))).massOnArrivalKg).toBe(0);
  });

  it('carries the requested stop, so a term never has to rebuild it', () => {
    const context = contextFor(working().snapshot(0), call('6', 'up'));
    const comparison = routeComparison(context);

    expect(comparison.requestedStop?.floorId).toBe('6');
    expect(comparison.requested?.floorId).toBe('6');
    expect(comparison.requested?.requested).toBe(true);
  });

  it('handles a car with nothing committed', () => {
    const context = contextFor(makeCar('A', '0').snapshot(0), call('9', 'up'));
    const comparison = routeComparison(context);

    expect(comparison.baseline).toEqual([]);
    expect(comparison.delayed).toEqual([]);
    expect(comparison.addedStops).toBe(1);
    expect(comparison.massOnArrivalKg).toBe(0);
  });
});
