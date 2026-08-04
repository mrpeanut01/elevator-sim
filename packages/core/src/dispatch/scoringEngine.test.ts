import { describe, expect, it } from 'vitest';

import { resolveCar } from '../config/resolveCar.js';
import type { ElevatorSpecs, ResolvedCar } from '../config/types.js';
import { Car } from '../model/car/car.js';
import { estimateCost } from '../model/car/estimateCost.js';
import { createShaft, type CarShaft, type CarSnapshot } from '../model/car/types.js';
import { hallCallId, type Direction } from '../model/types.js';

import { costRequestFor, observationFor } from './lifecycle.js';
import { normalizeTerm, resolveNormalization } from './normalize.js';
import { resolveDispatchConfig } from './policy.js';
import { bestScore, compareScores, rankScores, scoreCar } from './scoringEngine.js';
import { COST_TERMS } from './terms/index.js';
import {
  DispatchError,
  type CarScore,
  type CostTermDefinition,
  type DispatchCall,
  type TermContext,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

const REFERENCE_SPECS: ElevatorSpecs = {
  version: 1,
  units: { speed: 'm/s' },
  conventions: {
    personsPerRatedLoadUS: 'ratedLoadLb / 150',
    personsPerRatedLoadEN81: 'ratedLoadKg / 75',
    designLoadFactor: 0.8,
  },
  classes: [
    {
      id: 'round-numbers',
      name: 'Round numbers',
      ratedSpeedMps: { min: 0.5, max: 10, typical: 2.0 },
      maxRiseM: 600,
      maxFloors: 100,
      acceleration: { typical: 1.0, max: 1.2 },
      jerk: { typical: 1.0, max: 1.6 },
      capacityLbRange: [1000, 4000],
      application: 'Test fixture',
    },
  ],
  codeMinimumSpeedByRise: [],
  capacities: [{ ratedLoadLb: 3000, ratedLoadKg: 1350, personsUS: 20, use: 'Office' }],
  doors: {
    centerOpening: { openS: 2.0, closeS: 3.0 },
    sideOpening: { openS: 2.5, closeS: 4.0 },
    dwellCarCallS: { min: 2, max: 4, typical: 3 },
    dwellHallCallS: { min: 4, max: 7, typical: 5 },
  },
  timing: {
    motorStartDelayS: 0.5,
    levelingSettleS: { min: 0.5, max: 1.0, typical: 0.5 },
    passengerTransferS: { office: 1.2, residential: 1.75, hotel: 1.5, hospital: 2.5 },
  },
  loadSensor: { hallCallBypassThreshold: 0.8, overloadAlarmThreshold: 1.1 },
  realWorldAnchors: [],
};

const SPEC: ResolvedCar = resolveCar(
  { id: 'A', spec: 'round-numbers', ratedLoadLb: 3000 },
  REFERENCE_SPECS,
);

function plainShaft(count = 21): CarShaft {
  return createShaft(
    Array.from({ length: count }, (_, index) => ({ id: String(index), index, heightM: index * 4 })),
  );
}

function snapshotAt(id: string, floorId: string): CarSnapshot {
  return new Car({
    id,
    bankId: 'low',
    spec: SPEC,
    shaft: plainShaft(),
    homeFloorId: floorId,
    clock: { now: () => 0 },
  }).snapshot(0);
}

function call(floorId: string, direction: Direction = 'up'): DispatchCall {
  return {
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: Number(floorId),
    direction,
    registeredAt: 0,
  };
}

const CONFIG = resolveDispatchConfig({ id: 'probe', name: 'Probe', weights: {} });
const SCALES = resolveNormalization();

function contextFor(car: CarSnapshot, subject: DispatchCall): TermContext {
  const observation = observationFor(subject);
  const request = costRequestFor(subject, CONFIG, observation);
  return {
    car,
    call: subject,
    request,
    estimate: estimateCost(car, request),
    at: 0,
    observation,
  };
}

function fakeScore(carId: string, cost: number): CarScore {
  return {
    carId,
    cost,
    estimate: {
      feasible: true,
      etaSeconds: cost,
      marginalDelaySeconds: 0,
      resultingLoadFactor: 0,
      infeasibleReason: undefined,
      stopsBefore: 0,
    },
    terms: [],
  };
}

/* -------------------------------------------------------------------------- *
 * The weighted sum
 * -------------------------------------------------------------------------- */

describe('the weighted sum', () => {
  it('is exactly Σ wᵢ · normalize(termᵢ)', () => {
    const car = snapshotAt('A', '0');
    const context = contextFor(car, call('5'));
    const weights = new Map([
      ['waitTime', 0.6],
      ['distanceTravelled', 0.4],
    ]);

    const score = scoreCar(context, weights, SCALES);

    let expected = 0;
    for (const term of COST_TERMS) {
      const weight = weights.get(term.id);
      if (weight === undefined) continue;
      expected += weight * normalizeTerm(term, term.evaluate(context), SCALES);
    }
    expect(score.cost).toBeCloseTo(expected, 12);
    expect(score.carId).toBe('A');
  });

  it('breaks the cost down term by term, in registry order', () => {
    const context = contextFor(snapshotAt('A', '0'), call('5'));
    const score = scoreCar(
      context,
      new Map([
        ['distanceTravelled', 0.4],
        ['waitTime', 0.6],
      ]),
      SCALES,
    );

    // Registry order, not the order the weights were written in: two profiles weighting the
    // same terms must accumulate them in the same sequence and get bit-identical sums.
    expect(score.terms.map((term) => term.termId)).toEqual(['waitTime', 'distanceTravelled']);
    for (const breakdown of score.terms) {
      expect(breakdown.contribution).toBeCloseTo(breakdown.weight * breakdown.normalized, 12);
      expect(breakdown.normalized).toBeGreaterThanOrEqual(0);
      expect(breakdown.normalized).toBeLessThanOrEqual(1);
    }
    expect(score.terms.reduce((sum, term) => sum + term.contribution, 0)).toBeCloseTo(score.cost, 12);
  });

  it('skips terms with no weight and terms weighted zero', () => {
    const context = contextFor(snapshotAt('A', '0'), call('5'));
    const score = scoreCar(
      context,
      new Map([
        ['waitTime', 1],
        ['distanceTravelled', 0],
      ]),
      SCALES,
    );
    expect(score.terms.map((term) => term.termId)).toEqual(['waitTime']);
  });

  it('costs zero when nothing is weighted', () => {
    const context = contextFor(snapshotAt('A', '0'), call('5'));
    expect(scoreCar(context, new Map(), SCALES).cost).toBe(0);
  });

  it('ignores a weight on a term no phase implements', () => {
    // `predictive-balanced` weights ten of the twelve declared terms; Phase 2 implemented three.
    const context = contextFor(snapshotAt('A', '0'), call('5'));
    const withPending = scoreCar(
      context,
      new Map([
        ['waitTime', 1],
        ['predictedDemand', 9],
      ]),
      SCALES,
    );
    const without = scoreCar(context, new Map([['waitTime', 1]]), SCALES);
    expect(withPending.cost).toBe(without.cost);
  });

  it('carries the estimate through so nothing recomputes it', () => {
    const context = contextFor(snapshotAt('A', '0'), call('5'));
    expect(scoreCar(context, new Map([['waitTime', 1]]), SCALES).estimate).toBe(context.estimate);
  });

  it('rejects a term that returns a negative or non-finite value', () => {
    const context = contextFor(snapshotAt('A', '0'), call('5'));
    const bad: CostTermDefinition = {
      id: 'bogus',
      unit: 's',
      measures: 'nothing',
      normalization: { mode: 'saturating', scale: 'waitTimeS' },
      evaluate: () => -1,
    };
    const weights = new Map([['bogus', 1]]);
    expect(() => scoreCar(context, weights, SCALES, [bad])).toThrow(DispatchError);
    expect(() =>
      scoreCar(context, weights, SCALES, [{ ...bad, evaluate: () => Number.NaN }]),
    ).toThrow(DispatchError);
  });

  it('is deterministic: the same context scores identically every time', () => {
    const context = contextFor(snapshotAt('A', '0'), call('7'));
    const weights = new Map([
      ['waitTime', 0.6],
      ['distanceTravelled', 0.3],
      ['directionReversal', 0.1],
    ]);
    const first = scoreCar(context, weights, SCALES).cost;
    for (let i = 0; i < 100; i += 1) {
      expect(scoreCar(context, weights, SCALES).cost).toBe(first);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Ranking
 * -------------------------------------------------------------------------- */

describe('ranking', () => {
  it('orders by cost, cheapest first', () => {
    const ranked = rankScores([fakeScore('A', 2), fakeScore('B', 1), fakeScore('C', 3)]);
    expect(ranked.map((score) => score.carId)).toEqual(['B', 'A', 'C']);
  });

  it('breaks a tie by car id, whatever order the caller supplied', () => {
    // A symmetric bank at t=0 has every car at the lobby with an identical cost. Leaving the
    // winner to sort stability would make it depend on how the bank happened to iterate.
    const forward = rankScores([fakeScore('A', 1), fakeScore('B', 1), fakeScore('C', 1)]);
    const backward = rankScores([fakeScore('C', 1), fakeScore('B', 1), fakeScore('A', 1)]);
    expect(forward.map((score) => score.carId)).toEqual(['A', 'B', 'C']);
    expect(backward.map((score) => score.carId)).toEqual(['A', 'B', 'C']);
  });

  it('is a total order', () => {
    expect(compareScores(fakeScore('A', 1), fakeScore('A', 1))).toBe(0);
    expect(compareScores(fakeScore('A', 1), fakeScore('B', 1))).toBeLessThan(0);
    expect(compareScores(fakeScore('B', 1), fakeScore('A', 1))).toBeGreaterThan(0);
  });

  it('does not touch the array it was given', () => {
    const scores = [fakeScore('C', 3), fakeScore('A', 1)];
    rankScores(scores);
    expect(scores.map((score) => score.carId)).toEqual(['C', 'A']);
  });

  it('finds the best without sorting, and reports none for an empty set', () => {
    expect(bestScore([fakeScore('C', 3), fakeScore('A', 1), fakeScore('B', 1)])?.carId).toBe('A');
    expect(bestScore([])).toBeUndefined();
  });
});
