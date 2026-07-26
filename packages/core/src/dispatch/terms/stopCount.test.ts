import { describe, expect, it } from 'vitest';

import {
  DESTINATION_CONFIG,
  call,
  contextFor,
  hallCall,
  makeCar,
} from './fixtures.test-helper.js';
import { addedStopCount } from './stopCount.js';

describe('stopCount', () => {
  it('is one for a new floor and zero for one the car already stops at', () => {
    // The low case is the point: the car passes the floor anyway, so it adds no stop and pays no
    // energy for one. The same argument `distanceTravelled` makes about metres already committed.
    const car = makeCar('A', '0');
    car.registerCarCall('10');

    expect(addedStopCount(contextFor(car.snapshot(0), call('6', 'up')))).toBe(1);
    expect(addedStopCount(contextFor(car.snapshot(0), call('10', 'up')))).toBe(0);
  });

  it('treats a floor with a car call and a hall call as one stop, not two', () => {
    // `CommittedStop` defines a stop as the union of the reasons for it, and this is where that
    // definition has to be honoured: a hall call at a floor somebody inside already pressed adds
    // no stop.
    const car = makeCar('A', '0');
    car.registerCarCall('8');
    expect(addedStopCount(contextFor(car.snapshot(0), call('8', 'up')))).toBe(0);

    const other = makeCar('B', '0');
    other.assignHallCall(hallCall('8', 'up', 0));
    expect(addedStopCount(contextFor(other.snapshot(0), call('8', 'up')))).toBe(0);
  });

  it('counts the destination too, once it is known', () => {
    // Under destination entry the passenger's destination is a real extra stop for the car. Two is
    // the maximum one call can add, and it is the term's full scale.
    const car = makeCar('A', '0');
    const both = contextFor(car.snapshot(0), call('6', 'up', 0, '14'), {
      config: DESTINATION_CONFIG,
    });
    expect(addedStopCount(both)).toBe(2);
  });

  it('does not double-count a destination somebody is already going to', () => {
    const car = makeCar('A', '0');
    car.registerCarCall('14');
    const context = contextFor(car.snapshot(0), call('6', 'up', 0, '14'), {
      config: DESTINATION_CONFIG,
    });
    expect(addedStopCount(context)).toBe(1);
  });

  it('counts only the pickup when the destination is not knowable', () => {
    // The `up-down-buttons` asymmetry, the same one `rideTime` has: the term prices the
    // information that exists rather than assuming information that does not.
    const car = makeCar('A', '0');
    const context = contextFor(car.snapshot(0), call('6', 'up', 0, '14'));
    expect(context.request.destinationFloorId).toBeUndefined();
    expect(addedStopCount(context)).toBe(1);
  });

  it('ignores a destination equal to the pickup floor', () => {
    const car = makeCar('A', '0');
    const context = contextFor(car.snapshot(0), call('6', 'up', 0, '6'), {
      config: DESTINATION_CONFIG,
    });
    expect(addedStopCount(context)).toBe(1);
  });

  it('never exceeds its full scale of two', () => {
    const car = makeCar('A', '0');
    car.registerCarCall('3');
    car.assignHallCall(hallCall('17', 'down', 0));
    for (const floorId of ['0', '3', '6', '10', '17', '20']) {
      for (const destination of ['1', '3', '9', '17', '20']) {
        const context = contextFor(car.snapshot(0), call(floorId, 'up', 0, destination), {
          config: DESTINATION_CONFIG,
        });
        const value = addedStopCount(context);
        expect(value, `${floorId}→${destination}`).toBeGreaterThanOrEqual(0);
        expect(value, `${floorId}→${destination}`).toBeLessThanOrEqual(2);
      }
    }
  });
});
