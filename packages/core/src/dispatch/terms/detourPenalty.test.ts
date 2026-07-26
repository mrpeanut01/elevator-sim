import { describe, expect, it } from 'vitest';

import { detourPassengerSeconds } from './detourPenalty.js';
import {
  call,
  contextFor,
  hallCall,
  makeCar,
  passengerTo,
} from './fixtures.test-helper.js';

/** A car standing at 10, running up, carrying `aboard` passengers who get out at 12. */
function carrying(aboard: number, id = 'A') {
  const car = makeCar(id, '10');
  for (let i = 0; i < aboard; i += 1) car.board(passengerTo('12'), 0);
  return car;
}

describe('detourPenalty', () => {
  it('is high for a detour that delays a loaded car and zero for one that does not', () => {
    // The car is at 10 with three people aboard for 12. A call at 11 goes in front of them and
    // every one of them pays for the stop; a call at 14 is served after they have got out.
    const car = carrying(3);
    const inFront = contextFor(car.snapshot(0), call('11', 'up'));
    const behind = contextFor(car.snapshot(0), call('14', 'up'));

    expect(detourPassengerSeconds(inFront)).toBeGreaterThan(0);
    expect(detourPassengerSeconds(behind)).toBe(0);
    expect(detourPassengerSeconds(inFront)).toBeGreaterThan(detourPassengerSeconds(behind));
  });

  it('scales exactly with the number of people inconvenienced', () => {
    // The whole reason this term is not `existingCallDelay`: the same detour delaying three
    // passengers is three times the harm of one delaying a single passenger. The delay itself is
    // identical — the dwell at the delayed stop comes after its arrival — so the ratio is exact.
    const one = contextFor(carrying(1, 'A').snapshot(0), call('11', 'up'));
    const three = contextFor(carrying(3, 'B').snapshot(0), call('11', 'up'));

    expect(detourPassengerSeconds(one)).toBeGreaterThan(0);
    expect(detourPassengerSeconds(three)).toBeCloseTo(3 * detourPassengerSeconds(one), 9);
  });

  it('is zero for an empty car, however far it detours', () => {
    // There is nobody aboard to inconvenience. The added delay is real and is priced — by
    // `existingCallDelay`, which counts stops rather than people.
    const car = makeCar('A', '10');
    car.assignHallCall(hallCall('12', 'up', 0));
    const context = contextFor(car.snapshot(0), call('11', 'up'));

    expect(context.estimate.marginalDelaySeconds).toBeGreaterThan(0);
    expect(detourPassengerSeconds(context)).toBe(0);
  });

  it('counts the people aboard, not the people still on a landing', () => {
    // A committed stop whose only reason is a hall call has boarders but no alighters. Their
    // delay is a waiting-time cost and belongs to `existingCallDelay` and `starvation`; charging
    // it here too would bill the same second three times.
    const withPassengers = carrying(2, 'A');
    const withHallCalls = makeCar('B', '10');
    withHallCalls.assignHallCall(hallCall('12', 'up', 0));

    const passengerDetour = detourPassengerSeconds(
      contextFor(withPassengers.snapshot(0), call('11', 'up')),
    );
    const hallDetour = detourPassengerSeconds(
      contextFor(withHallCalls.snapshot(0), call('11', 'up')),
    );

    expect(passengerDetour).toBeGreaterThan(0);
    expect(hallDetour).toBe(0);
  });

  it('adds up over several delayed stops', () => {
    // Two people out at 12 and two more at 16. A call at 11 delays both stops, so the term is
    // the sum of two products rather than the larger of them.
    const one = makeCar('A', '10');
    one.board(passengerTo('12'), 0);
    one.board(passengerTo('12'), 0);

    const two = makeCar('B', '10');
    two.board(passengerTo('12'), 0);
    two.board(passengerTo('12'), 0);
    two.board(passengerTo('16'), 0);
    two.board(passengerTo('16'), 0);

    const oneStop = detourPassengerSeconds(contextFor(one.snapshot(0), call('11', 'up')));
    const twoStops = detourPassengerSeconds(contextFor(two.snapshot(0), call('11', 'up')));

    expect(twoStops).toBeGreaterThan(oneStop);
  });

  it('is never negative', () => {
    const car = carrying(4);
    for (const floorId of ['0', '9', '10', '11', '12', '20']) {
      expect(
        detourPassengerSeconds(contextFor(car.snapshot(0), call(floorId, 'up'))),
      ).toBeGreaterThanOrEqual(0);
    }
  });
});
