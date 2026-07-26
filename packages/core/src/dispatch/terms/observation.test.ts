import { describe, expect, it } from 'vitest';

import { createArrivalModel } from '../predictor/arrivalModel.js';
import { observationFor } from '../lifecycle.js';
import type { DispatchCall, DispatchObservation } from '../types.js';

import { demandForecastOf, zoneFloorIdsFor, type ExpectedDemandByFloor } from './observation.js';

/** A landing call with nothing declared on it, so the observation is entirely the caller's. */
const CALL: DispatchCall = Object.freeze({
  id: '9:up',
  floorId: '9',
  floorIndex: 9,
  direction: 'up' as const,
  registeredAt: 0,
});

describe('the term observation', () => {
  it('reads an observation that carries neither group fact without inventing them', () => {
    // The inert-not-wrong contract: a caller that holds no partition and no predictor supplies
    // neither, and the two terms that price them contribute nothing rather than guessing.
    const bare = observationFor(CALL, 4, 300);
    expect(bare.waitingPassengers).toBe(4);
    expect(bare.zoneFloorIdsByCarId).toBeUndefined();
    expect(bare.demandForecast).toBeUndefined();
    expect(zoneFloorIdsFor(bare, 'A')).toBeUndefined();
    expect(demandForecastOf(bare)).toBeUndefined();
  });

  it('carries both group facts through the real observationFor, not through a cast', () => {
    // The link that used to be missing. `observationFor` built the observation from two fields and
    // dropped these, so every terms test that injected them was testing a shape the engine never
    // produced. Asserted through the real function, on the real interface.
    const zones: ReadonlyMap<string, readonly string[]> = new Map([['A', ['1', '2']]]);
    const forecast: ReadonlyMap<string, number> = new Map([['1', 3]]);
    const observation = observationFor(CALL, 4, 300, {
      zoneFloorIdsByCarId: zones,
      demandForecast: forecast,
    });

    expect(zoneFloorIdsFor(observation, 'A')).toEqual(['1', '2']);
    expect(zoneFloorIdsFor(observation, 'B')).toBeUndefined();
    expect(demandForecastOf(observation)?.get('1')).toBe(3);
    // The same objects, not copies: one partition and one forecast per decision, shared by every
    // term and every car, is what keeps a twelve-term vector the price of a one-term vector.
    expect(demandForecastOf(observation)).toBe(forecast);
    expect(observation.zoneFloorIdsByCarId).toBe(zones);
    expect(Object.isFrozen(observation)).toBe(true);
  });

  it('omits an absent field rather than setting it to undefined', () => {
    // `exactOptionalPropertyTypes` is on, and a frozen observation should record what was actually
    // known: present-but-undefined and absent are different claims.
    const partial = observationFor(CALL, 4, undefined, { demandForecast: new Map([['1', 2]]) });
    expect(Object.hasOwn(partial, 'demandForecast')).toBe(true);
    expect(Object.hasOwn(partial, 'zoneFloorIdsByCarId')).toBe(false);
  });

  it('accepts the predictor’s own forecast without translation', () => {
    // The hand-off `predictedDemand` is built on: whatever `DemandForecast.expectedDemandByFloor`
    // returns is what the term reads. Typed through the predictor rather than restated, so a
    // change to its return shape breaks the term at compile time rather than silently.
    const model = createArrivalModel({ floorIds: ['G', '1', '2'] });
    model.observe('G', 'up', 10);
    model.observe('G', 'up', 20);

    const forecast = model.expectedDemandByFloor(600);
    const observation: DispatchObservation = observationFor(CALL, 4, 300, {
      demandForecast: forecast,
    });

    expect(demandForecastOf(observation)).toBe(forecast);
    expect(demandForecastOf(observation)?.size).toBe(3);
    for (const expected of demandForecastOf(observation)?.values() ?? []) {
      expect(Number.isFinite(expected)).toBe(true);
      expect(expected).toBeGreaterThanOrEqual(0);
    }
  });
});

/**
 * Type-level guard, in both directions: the field `DispatchObservation` declares and the map the
 * predictor produces are the same type. If either moves, this file stops compiling — which is the
 * whole reason the shape is imported from `predictor/` instead of restated.
 */
const _sameShape: (forecast: ExpectedDemandByFloor) => DispatchObservation['demandForecast'] = (
  forecast,
) => forecast;
const _andBack: (field: NonNullable<DispatchObservation['demandForecast']>) => ExpectedDemandByFloor =
  (field) => field;
void _sameShape;
void _andBack;
