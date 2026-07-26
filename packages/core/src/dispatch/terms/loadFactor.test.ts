import { describe, expect, it } from 'vitest';

import { normalizeTerm, resolveNormalization } from '../normalize.js';

import { call, contextFor, makeCar, passengerTo } from './fixtures.test-helper.js';
import { loadFactorTerm, resultingLoadFactor } from './loadFactor.js';

const SCALES = resolveNormalization();

/**
 * A car at 0 with `aboard` passengers of 75 kg each, all bound for 20.
 *
 * Rated load is 1350 kg, so one passenger is exactly 1/18 of rated and nobody alights before the
 * call floor — which keeps the projected load a clean function of occupancy.
 */
function occupied(aboard: number, id = 'A') {
  const car = makeCar(id, '0');
  for (let i = 0; i < aboard; i += 1) car.board(passengerTo('20'), 0);
  return car;
}

describe('loadFactor', () => {
  it('is low for an empty car and high for a nearly full one', () => {
    const empty = contextFor(occupied(0, 'A').snapshot(0), call('5', 'up'));
    const full = contextFor(occupied(14, 'B').snapshot(0), call('5', 'up'));

    expect(resultingLoadFactor(empty)).toBeLessThan(0.2);
    expect(resultingLoadFactor(full)).toBeGreaterThan(0.75);
    expect(resultingLoadFactor(full)).toBeGreaterThan(resultingLoadFactor(empty));
  });

  it('rises monotonically with occupancy', () => {
    // Strictly, not merely weakly: every extra body is 75 kg of a 1350 kg rated load, and the
    // term is the car's own projection of what it will be carrying after the stop.
    let previous = -1;
    for (let aboard = 0; aboard <= 14; aboard += 1) {
      const context = contextFor(occupied(aboard, `car${aboard}`).snapshot(0), call('5', 'up'));
      const value = resultingLoadFactor(context);
      expect(value, `aboard=${aboard}`).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('rises monotonically once normalized too, until it caps', () => {
    let previous = -1;
    for (let aboard = 0; aboard <= 14; aboard += 1) {
      const context = contextFor(occupied(aboard, `car${aboard}`).snapshot(0), call('5', 'up'));
      const normalized = normalizeTerm(loadFactorTerm, resultingLoadFactor(context), SCALES);
      expect(normalized, `aboard=${aboard}`).toBeGreaterThanOrEqual(previous);
      expect(normalized).toBeLessThanOrEqual(1);
      previous = normalized;
    }
  });

  it('is capped at rated load, because stage 2 has already filtered anything fuller', () => {
    // A bounded map, and the clamp costs nothing: `maxLoadFactorForAssignment` and the load
    // cell's overload alarm mean a car projected above rated cannot be chosen anyway, so extra
    // resolution up there would be resolution on cars that are already out of the running.
    expect(normalizeTerm(loadFactorTerm, 1, SCALES)).toBe(1);
    expect(normalizeTerm(loadFactorTerm, 1.4, SCALES)).toBe(1);
    expect(normalizeTerm(loadFactorTerm, 12, SCALES)).toBe(1);
    expect(loadFactorTerm.normalization).toEqual({ mode: 'bounded', fullScale: 1 });
  });

  it('is exactly CostEstimate.resultingLoadFactor', () => {
    // The car's own projection from real passenger masses, not a head count times a nominal
    // weight. Re-deriving it here would produce a second, coarser answer.
    for (const aboard of [0, 3, 9, 14]) {
      const context = contextFor(occupied(aboard, `c${aboard}`).snapshot(0), call('5', 'up'));
      expect(resultingLoadFactor(context), `aboard=${aboard}`).toBe(
        context.estimate.resultingLoadFactor,
      );
    }
  });

  it('credits a car that empties before it gets there', () => {
    // Ten passengers bound for 3 and a call at 8: they are all out before the doors open at 8,
    // so the car arrives with room. A term reading current occupancy would price it as full.
    const emptying = makeCar('A', '0');
    for (let i = 0; i < 10; i += 1) emptying.board(passengerTo('3'), 0);

    const staying = makeCar('B', '0');
    for (let i = 0; i < 10; i += 1) staying.board(passengerTo('20'), 0);

    const emptied = resultingLoadFactor(contextFor(emptying.snapshot(0), call('8', 'up')));
    const loaded = resultingLoadFactor(contextFor(staying.snapshot(0), call('8', 'up')));

    expect(emptied).toBeLessThan(loaded);
  });

  it('is never negative', () => {
    for (const aboard of [0, 1, 7, 14]) {
      expect(
        resultingLoadFactor(contextFor(occupied(aboard, `n${aboard}`).snapshot(0), call('5', 'up'))),
      ).toBeGreaterThanOrEqual(0);
    }
  });
});
