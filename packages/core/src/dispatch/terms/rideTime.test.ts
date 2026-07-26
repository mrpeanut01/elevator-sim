import { describe, expect, it } from 'vitest';

import {
  DESTINATION_CONFIG,
  FLOOR_PITCH_M,
  call,
  contextFor,
  makeCar,
} from './fixtures.test-helper.js';
import { rideTimeSeconds } from './rideTime.js';

/** A call that carries its destination, priced under a destination-entry profile. */
function withDestination(carFloorId: string, callFloorId: string, destinationFloorId: string) {
  const car = makeCar('A', carFloorId);
  return {
    car,
    context: contextFor(car.snapshot(0), call(callFloorId, 'up', 0, destinationFloorId), {
      config: DESTINATION_CONFIG,
    }),
  };
}

describe('rideTime', () => {
  it('is short for a one-floor hop and long for a twenty-floor one', () => {
    // The ordering the term exists to express: TTD is dominated by how far the passenger has
    // to go, and a car is chosen partly on how directly it will take them there.
    const near = withDestination('0', '2', '3').context;
    const far = withDestination('0', '2', '20').context;

    expect(rideTimeSeconds(near)).toBeGreaterThan(0);
    expect(rideTimeSeconds(far)).toBeGreaterThan(rideTimeSeconds(near));
  });

  it('is the real jerk-limited ride, not distance over rated speed', () => {
    // 0 → pick up at 2 → out at 12: ten floors, 40 m, which is 23.0 s of S-curve profile plus
    // 0.5 s of motor start and 0.5 s of levelling. Naive 40/2 = 20 s understates it, and that
    // error is the one this project exists to avoid.
    const { context } = withDestination('0', '2', '12');
    expect(rideTimeSeconds(context)).toBeCloseTo(0.5 + 23 + 0.5, 9);
    expect(rideTimeSeconds(context)).toBeGreaterThan((10 * FLOOR_PITCH_M) / 2);
  });

  it('charges the door time of every stop the passenger sits through', () => {
    // Same ride, but the car is already committed to stopping at 6 on the way. The passenger is
    // aboard for that stop, so they pay for it — which is exactly why a `rideTime`-weighted
    // profile prefers a car that will take them there directly.
    const direct = makeCar('A', '0');
    const viaStop = makeCar('B', '0');
    viaStop.registerCarCall('6');

    const subject = call('2', 'up', 0, '12');
    const straight = rideTimeSeconds(
      contextFor(direct.snapshot(0), subject, { config: DESTINATION_CONFIG }),
    );
    const interrupted = rideTimeSeconds(
      contextFor(viaStop.snapshot(0), subject, { config: DESTINATION_CONFIG }),
    );

    expect(interrupted).toBeGreaterThan(straight);
  });

  it('excludes the pickup dwell, which waitTime has already charged', () => {
    // Measured from departure, not arrival. Otherwise the boarding dwell is counted twice and a
    // heavily-loading lobby stop looks worse to a rideTime profile than to a waitTime one for no
    // physical reason.
    const { context } = withDestination('0', '2', '12');
    const wholeJourney = context.estimate.etaSeconds + rideTimeSeconds(context);
    // The stop at 2 sits between the two, so the parts are strictly less than the whole.
    const nonStop = 0.5 + 23 + 0.5 + (0.5 + 12 + 0.5);
    expect(wholeJourney).toBeLessThan(nonStop + 60);
    expect(rideTimeSeconds(context)).toBeLessThan(wholeJourney);
  });

  it('is zero when the destination is unknown — the cost of a bare up/down button', () => {
    // Not a gap: under `up-down-buttons` nobody can attribute an in-car time to a car, and the
    // only destination-free proxy (a uniform prior over the shaft) is identical for every
    // candidate car and therefore cannot change a decision. See the module docstring.
    const car = makeCar('A', '0');
    const context = contextFor(car.snapshot(0), call('2', 'up', 0, '12'));
    expect(context.request.destinationFloorId).toBeUndefined();
    expect(rideTimeSeconds(context)).toBe(0);
  });

  it('is zero when the passenger is going nowhere', () => {
    const { context } = withDestination('0', '5', '5');
    expect(rideTimeSeconds(context)).toBe(0);
  });

  it('is strictly positive for every known destination the passenger has to travel to', () => {
    // The regression. `>= 0` was the old assertion and it passed on the bug: `projectRoute`
    // sequences stops geometrically with one reversal and knows nothing about
    // pickup-before-dropoff, so a single projection containing both stops ordered the destination
    // *before* the pickup in about half of these pairs (car at 10, pickup 5, destination 11 is
    // one), the subtraction went negative, and the clamp returned 0 — the best possible value —
    // for the longest rides. A journey that has to happen cannot take no time.
    for (const carFloorId of ['0', '5', '10', '20']) {
      for (const destinationFloorId of ['0', '3', '5', '11', '20']) {
        const { context } = withDestination(carFloorId, '5', destinationFloorId);
        const where = `car ${carFloorId} → pick up 5 → out at ${destinationFloorId}`;
        // Except the one journey that really is no journey: out where you got in.
        if (destinationFloorId === '5') expect(rideTimeSeconds(context), where).toBe(0);
        else expect(rideTimeSeconds(context), where).toBeGreaterThan(0);
      }
    }
  });

  it('prices the same journey the same however the car got to the pickup', () => {
    // The case that used to invert the term. Both cars are 20 m from floor 5 and both take the
    // passenger 5 → 15, so `waitTime` ties at 14.0 s and the ride is 24.0 s for both. The car at
    // 10 has to reverse; that costs metres and a reversal, which `distanceTravelled` and
    // `directionReversal` price. It does not cost the passenger in-car seconds, and it used to
    // score 0 here — the term paying a bonus for the ride it exists to punish.
    const above = makeCar('A', '10');
    const below = makeCar('B', '0');
    const subject = call('5', 'up', 0, '15');
    const reversing = contextFor(above.snapshot(0), subject, { config: DESTINATION_CONFIG });
    const straight = contextFor(below.snapshot(0), subject, { config: DESTINATION_CONFIG });

    expect(reversing.estimate.etaSeconds).toBe(straight.estimate.etaSeconds);
    expect(rideTimeSeconds(reversing)).toBeCloseTo(0.5 + 23 + 0.5, 9);
    expect(rideTimeSeconds(reversing)).toBe(rideTimeSeconds(straight));
    expect(rideTimeSeconds(reversing)).toBeGreaterThan(0);
  });

  it('charges only the stops the passenger is aboard for, not the ones made before they boarded', () => {
    // Leg 2 starts from the pickup with the stops still outstanding at that moment. The car below
    // stops at 2 on its way to the pickup — the passenger is not aboard for it and does not pay
    // for it — while the car above stops at 12 after the pickup, which they do.
    const beforeBoarding = makeCar('A', '0');
    beforeBoarding.registerCarCall('2');
    const afterBoarding = makeCar('B', '0');
    afterBoarding.registerCarCall('12');

    const subject = call('5', 'up', 0, '15');
    const clean = makeCar('C', '0');
    const baseline = rideTimeSeconds(
      contextFor(clean.snapshot(0), subject, { config: DESTINATION_CONFIG }),
    );

    expect(
      rideTimeSeconds(contextFor(beforeBoarding.snapshot(0), subject, { config: DESTINATION_CONFIG })),
    ).toBe(baseline);
    expect(
      rideTimeSeconds(contextFor(afterBoarding.snapshot(0), subject, { config: DESTINATION_CONFIG })),
    ).toBeGreaterThan(baseline);
  });

  it('keeps the car running the way it was going, so a stop above is served before a call below', () => {
    // Direction is inherited from the leg the car arrived on rather than re-derived from what is
    // left, because that is what a collective car does: picked up at 5 on the way up to 8, a
    // passenger for 3 rides up to 8 first. Nearest-stop sequencing would have said 3 was closer
    // and under-priced the ride by the whole out-and-back.
    const runningUp = makeCar('A', '0');
    runningUp.registerCarCall('8');
    const idle = makeCar('B', '0');

    const subject = call('5', 'up', 0, '3');
    const throughEight = rideTimeSeconds(
      contextFor(runningUp.snapshot(0), subject, { config: DESTINATION_CONFIG }),
    );
    const direct = rideTimeSeconds(
      contextFor(idle.snapshot(0), subject, { config: DESTINATION_CONFIG }),
    );

    expect(throughEight).toBeGreaterThan(direct);
  });

  it('prices a destination behind the pickup, which costs a reversal to reach', () => {
    // Picked up at 10 going down to 2, with the car already committed to 16 above. The car takes
    // them up to 16 first — a real ride, and a long one.
    const car = makeCar('A', '8');
    car.registerCarCall('16');
    const detoured = contextFor(car.snapshot(0), call('10', 'up', 0, '2'), {
      config: DESTINATION_CONFIG,
    });

    const clean = makeCar('B', '8');
    const straight = contextFor(clean.snapshot(0), call('10', 'up', 0, '2'), {
      config: DESTINATION_CONFIG,
    });

    expect(rideTimeSeconds(detoured)).toBeGreaterThan(rideTimeSeconds(straight));
  });
});
