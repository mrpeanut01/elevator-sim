import { describe, expect, it } from 'vitest';

import { spareSeatsOnArrival, unservedQueueFraction } from './crowding.js';
import { call, contextFor, makeCar, passengerTo } from './fixtures.test-helper.js';

/**
 * A car at 0 carrying `aboard` passengers of 75 kg each, bound for `to`.
 *
 * Rated load is 1350 kg and design load is 0.8 of it, so an empty car has room for
 * `⌊1080 / 75⌋ = 14` people and each one aboard costs exactly one seat.
 */
function loaded(aboard: number, to = '20', id = 'A') {
  const car = makeCar(id, '0');
  for (let i = 0; i < aboard; i += 1) car.board(passengerTo(to), 0);
  return car;
}

/** The term for a landing of `queue` people at floor 5. */
function scored(aboard: number, queue: number, to = '20') {
  const car = loaded(aboard, to, `car-${aboard}-${queue}-${to}`);
  return contextFor(car.snapshot(0), call('5', 'up'), { waitingPassengers: queue });
}

describe('crowding', () => {
  it('is zero for a car that can clear the landing and near one for a car that cannot', () => {
    // The ordering the term exists to express, and the signal `split-demand` acts on: when no
    // single car can take the floor, send more than one.
    const roomy = scored(0, 10);
    const nearlyFull = scored(13, 10);

    expect(unservedQueueFraction(roomy)).toBe(0);
    expect(unservedQueueFraction(nearlyFull)).toBeCloseTo(0.9, 9);
    expect(unservedQueueFraction(nearlyFull)).toBeGreaterThan(unservedQueueFraction(roomy));
  });

  it('counts seats at design load, not rated load', () => {
    // 0.8 of 1350 kg over 75 kg a head is fourteen, never eighteen. Using rated capacity makes
    // every result systematically optimistic (CLAUDE.md § modeling rules).
    expect(spareSeatsOnArrival(scored(0, 1))).toBe(14);
    expect(spareSeatsOnArrival(scored(6, 1))).toBe(8);
    expect(spareSeatsOnArrival(scored(14, 1))).toBe(0);
  });

  it('rises monotonically as the car fills, and is exact', () => {
    // seats = 14 − aboard, so a landing of ten is fully served until the fifth passenger aboard
    // and then loses one place per body.
    for (let aboard = 0; aboard <= 14; aboard += 1) {
      const expected = Math.max(0, aboard - 4) / 10;
      expect(unservedQueueFraction(scored(aboard, 10)), `aboard=${aboard}`).toBeCloseTo(expected, 9);
    }
  });

  it('credits a car that empties before it gets there', () => {
    // Thirteen passengers bound for 3 with the call at 5: they are out before the doors open, so
    // the car arrives with fourteen places. Reading current occupancy would send the landing to a
    // worse car.
    const emptying = scored(13, 10, '3');
    const staying = scored(13, 10, '20');

    expect(spareSeatsOnArrival(emptying)).toBe(14);
    expect(unservedQueueFraction(emptying)).toBe(0);
    expect(unservedQueueFraction(staying)).toBeGreaterThan(0);
  });

  it('caps at one when the car can take nobody', () => {
    // A fraction of a queue cannot exceed the queue, which is why the term is bounded rather than
    // saturating and why its full scale is a constant of the term.
    const full = scored(15, 30);
    expect(spareSeatsOnArrival(full)).toBe(0);
    expect(unservedQueueFraction(full)).toBe(1);
  });

  it('is zero when nobody counted the landing', () => {
    // A bare up/down button carries no count, so `observationFor` reports zero waiting and the
    // term has nothing to price. Inventing a queue would put a cost on every car equally, which
    // moves nobody.
    const car = loaded(13, '20', 'uncounted');
    const context = contextFor(car.snapshot(0), call('5', 'up'));
    expect(context.observation.waitingPassengers).toBe(0);
    expect(unservedQueueFraction(context)).toBe(0);
  });

  it('is a fraction of the queue, so it stays comparable as the queue grows', () => {
    // A car with two places leaves 8 of 10 or 28 of 30 behind: the same car is equally unable to
    // clear either landing, and the queue length is common to every candidate car anyway.
    expect(unservedQueueFraction(scored(12, 10))).toBeCloseTo(0.8, 9);
    expect(unservedQueueFraction(scored(12, 30))).toBeCloseTo(28 / 30, 9);
  });

  it('lands in [0, 1] for every occupancy and every queue', () => {
    for (const aboard of [0, 4, 8, 12, 15]) {
      for (const queue of [0, 1, 5, 12, 40]) {
        const value = unservedQueueFraction(scored(aboard, queue));
        expect(value, `aboard=${aboard} queue=${queue}`).toBeGreaterThanOrEqual(0);
        expect(value, `aboard=${aboard} queue=${queue}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
