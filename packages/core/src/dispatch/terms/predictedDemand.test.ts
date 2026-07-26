import { describe, expect, it } from 'vitest';

import { FLOOR_PITCH_M, call, contextFor, makeCar } from './fixtures.test-helper.js';
import { demandMisalignmentM, routeEndHeightM } from './predictedDemand.js';

const forecast = (entries: Readonly<Record<string, number>>): ReadonlyMap<string, number> =>
  new Map(Object.entries(entries));

describe('predictedDemand', () => {
  it('is zero when the car ends up where demand is and high when it ends up far away', () => {
    // The ordering the term exists to express. Both cars answer the same call at floor 10; the
    // first finishes there, the second has to carry on to 20 for a stop it already holds, which
    // leaves it at the wrong end of the building for the lobby demand that is coming.
    const settled = makeCar('A', '0');
    const carriedOn = makeCar('B', '0');
    carriedOn.registerCarCall('20');

    const subject = call('10', 'up');
    const lobbyDemand = forecast({ '10': 1 });

    const aligned = contextFor(settled.snapshot(0), subject, { demandForecast: lobbyDemand });
    const misaligned = contextFor(carriedOn.snapshot(0), subject, { demandForecast: lobbyDemand });

    expect(demandMisalignmentM(aligned)).toBe(0);
    expect(demandMisalignmentM(misaligned)).toBeCloseTo(10 * FLOOR_PITCH_M, 9);
    expect(demandMisalignmentM(misaligned)).toBeGreaterThan(demandMisalignmentM(aligned));
  });

  it('is the demand-weighted mean distance, not the nearest or the furthest', () => {
    // Three quarters of the forecast arrivals at the floor the car ends on and one quarter twenty
    // floors away: the misalignment is 80 m / 4 = 20 m, which is neither 0 nor 80.
    const car = makeCar('A', '0');
    const context = contextFor(car.snapshot(0), call('0', 'up'), {
      demandForecast: forecast({ '0': 3, '20': 1 }),
    });

    expect(routeEndHeightM(context)).toBe(0);
    expect(demandMisalignmentM(context)).toBeCloseTo((20 * FLOOR_PITCH_M) / 4, 9);
  });

  it('measures from where the route ends, not from where the car is now', () => {
    // Pre-positioning is about where serving this call leaves the car. A term reading the current
    // position would rate a car that is about to fly to the far end as perfectly placed.
    const car = makeCar('A', '0');
    car.registerCarCall('20');
    const context = contextFor(car.snapshot(0), call('4', 'up'), {
      demandForecast: forecast({ '0': 1 }),
    });

    expect(routeEndHeightM(context)).toBeCloseTo(20 * FLOOR_PITCH_M, 9);
    expect(demandMisalignmentM(context)).toBeCloseTo(20 * FLOOR_PITCH_M, 9);
  });

  it('is inert without a forecast, rather than guessing one', () => {
    // The same choice `repositionDecisionFor` makes when it reports `no-forecast`. A fabricated
    // forecast would produce a plausible-looking run of a system nobody configured.
    const car = makeCar('A', '0');
    expect(demandMisalignmentM(contextFor(car.snapshot(0), call('10', 'up')))).toBe(0);
    expect(
      demandMisalignmentM(
        contextFor(car.snapshot(0), call('10', 'up'), { demandForecast: new Map() }),
      ),
    ).toBe(0);
  });

  it('ignores demand this shaft cannot answer', () => {
    const car = makeCar('A', '0');
    const context = contextFor(car.snapshot(0), call('10', 'up'), {
      demandForecast: forecast({ '10': 1, 'sky-lobby-42': 500 }),
    });
    expect(demandMisalignmentM(context)).toBe(0);
  });

  it('ignores a forecast weight that is not a positive number', () => {
    // A predictor emitting nonsense degrades to "no opinion" instead of poisoning the weighted sum
    // with a NaN, which would compare false against everything and silently pick a car.
    const car = makeCar('A', '0');
    const nonsense = contextFor(car.snapshot(0), call('0', 'up'), {
      demandForecast: forecast({ '20': Number.NaN, '16': -3, '12': 0 }),
    });
    expect(demandMisalignmentM(nonsense)).toBe(0);

    const partial = contextFor(car.snapshot(0), call('0', 'up'), {
      demandForecast: forecast({ '20': Number.NaN, '4': 2 }),
    });
    expect(demandMisalignmentM(partial)).toBeCloseTo(4 * FLOOR_PITCH_M, 9);
  });

  it('falls back to the committed position for a car with no route at all', () => {
    // Only reachable when the shaft does not serve the call, which stage 2 rejects — but the
    // fallback must still be the floor the car is committed to rather than NaN.
    const car = makeCar('A', '7');
    const context = contextFor(car.snapshot(0), call('7', 'up'), {
      demandForecast: forecast({ '7': 1 }),
    });
    expect(routeEndHeightM(context)).toBeCloseTo(7 * FLOOR_PITCH_M, 9);
    expect(demandMisalignmentM(context)).toBe(0);
  });

  it('is never negative', () => {
    const car = makeCar('A', '5');
    for (const floorId of ['0', '5', '11', '20']) {
      expect(
        demandMisalignmentM(
          contextFor(car.snapshot(0), call(floorId, 'up'), {
            demandForecast: forecast({ '0': 2, '9': 1, '20': 4 }),
          }),
        ),
        floorId,
      ).toBeGreaterThanOrEqual(0);
    }
  });
});
