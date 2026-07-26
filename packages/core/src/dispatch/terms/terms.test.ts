import { describe, expect, it } from 'vitest';

import { resolveCar } from '../../config/resolveCar.js';
import type { ElevatorSpecs, ResolvedCar } from '../../config/types.js';
import { Car } from '../../model/car/car.js';
import { estimateCost } from '../../model/car/estimateCost.js';
import { createShaft, type CarShaft, type CarSnapshot } from '../../model/car/types.js';
import { hallCallId, type Direction } from '../../model/types.js';
import { costRequestFor, observationFor } from '../lifecycle.js';
import { resolveDispatchConfig } from '../policy.js';
import type { DispatchCall, TermContext } from '../types.js';

import {
  COST_TERMS,
  COST_TERMS_BY_ID,
  DECLARED_TERM_IDS,
  IMPLEMENTED_TERM_IDS,
  assessDirectionReversal,
  costTerm,
  isDeclaredTerm,
  isImplementedTerm,
  marginalDistanceM,
  pathLengthM,
  waitTimeSeconds,
} from './index.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 *
 * V = 2.0 m/s, A = 1.0 m/s^2, J = 1.0 m/s^3, floors 4 m apart at indices 0..20, so floor N
 * is at 4N metres. Chosen to match `estimateCost.test.ts` so a hand-checked travel time in
 * one file is the same number in the other.
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
    passengerTransferS: { office: 1.2, residential: 1.75, hotel: 1.5 },
  },
  loadSensor: { hallCallBypassThreshold: 0.8, overloadAlarmThreshold: 1.1 },
  realWorldAnchors: [],
};

const SPEC: ResolvedCar = resolveCar(
  { id: 'A', spec: 'round-numbers', ratedLoadLb: 3000 },
  REFERENCE_SPECS,
);

const FLOOR_PITCH_M = 4;

function plainShaft(count = 21): CarShaft {
  return createShaft(
    Array.from({ length: count }, (_, index) => ({
      id: String(index),
      index,
      heightM: index * FLOOR_PITCH_M,
    })),
  );
}

interface Clock {
  now(): number;
  set(t: number): void;
}

function clockAt(start = 0): Clock {
  let time = start;
  return {
    now: () => time,
    set: (t: number) => {
      time = t;
    },
  };
}

function makeCar(id = 'A', homeFloorId = '0', clock: Clock = clockAt(0), shaft = plainShaft()): Car {
  return new Car({ id, bankId: 'low', spec: SPEC, shaft, homeFloorId, clock });
}

function call(floorId: string, direction: Direction, registeredAt = 0): DispatchCall {
  return {
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: Number(floorId),
    direction,
    registeredAt,
  };
}

const CONFIG = resolveDispatchConfig({ id: 'probe', name: 'Probe', weights: {} });

function contextFor(car: CarSnapshot, subject: DispatchCall, at = 0): TermContext {
  const observation = observationFor(subject);
  const request = costRequestFor(subject, CONFIG, observation);
  return { car, call: subject, request, estimate: estimateCost(car, request), at, observation };
}

/* -------------------------------------------------------------------------- *
 * The registry
 * -------------------------------------------------------------------------- */

describe('the cost-term registry', () => {
  it('implements the three terms Phase 2 owes, in a fixed order', () => {
    expect(IMPLEMENTED_TERM_IDS).toEqual(['waitTime', 'distanceTravelled', 'directionReversal']);
  });

  it('indexes every term by its id', () => {
    for (const term of COST_TERMS) {
      expect(COST_TERMS_BY_ID.get(term.id)).toBe(term);
      expect(costTerm(term.id)).toBe(term);
      expect(isImplementedTerm(term.id)).toBe(true);
    }
    expect(COST_TERMS_BY_ID.size).toBe(COST_TERMS.length);
  });

  it('reports a term no phase has implemented as absent rather than throwing', () => {
    // `predictive-balanced` weights eleven terms; a policy built from it must still work.
    expect(costTerm('predictedDemand')).toBeUndefined();
    expect(isImplementedTerm('predictedDemand')).toBe(false);
  });

  it('separates “declared but pending” from “not a term at all”', () => {
    // The distinction the resolver needs: a pending term is carried, a typo is rejected. If
    // the two collapsed, a misspelled weight would score every car at zero in silence.
    expect(isDeclaredTerm('predictedDemand')).toBe(true);
    expect(isImplementedTerm('predictedDemand')).toBe(false);
    expect(isDeclaredTerm('waitTime')).toBe(true);
    expect(isDeclaredTerm('waitTiem')).toBe(false);
    expect(isDeclaredTerm('waittime')).toBe(false);
  });

  it('declares every implemented term, and declares each id once', () => {
    for (const id of IMPLEMENTED_TERM_IDS) {
      expect(isDeclaredTerm(id), `implemented but undeclared: ${id}`).toBe(true);
    }
    expect(new Set(DECLARED_TERM_IDS).size).toBe(DECLARED_TERM_IDS.length);
  });

  it('gives every term the metadata the engine and the schema need', () => {
    for (const term of COST_TERMS) {
      expect(term.id).not.toBe('');
      expect(term.measures).not.toBe('');
      expect(typeof term.evaluate).toBe('function');
      if (term.normalization.mode === 'bounded') {
        expect(term.normalization.fullScale).toBeGreaterThan(0);
      } else {
        expect(['waitTimeS', 'distanceM']).toContain(term.normalization.scale);
      }
    }
  });

  it('leaves the snapshot untouched — terms are pure (CLAUDE.md invariant 1)', () => {
    const car = makeCar();
    car.registerCarCall('8');
    const snapshot = car.snapshot(0);
    const before = JSON.stringify(car.serialize());

    const context = contextFor(snapshot, call('5', 'up'));
    for (const term of COST_TERMS) {
      for (let i = 0; i < 200; i += 1) term.evaluate(context);
    }

    expect(JSON.stringify(car.serialize())).toBe(before);
  });
});

/* -------------------------------------------------------------------------- *
 * waitTime
 * -------------------------------------------------------------------------- */

describe('waitTime', () => {
  it('is the estimate’s ETA, which is the real S-curve time and not distance over speed', () => {
    const car = makeCar('A', '0');
    const context = contextFor(car.snapshot(0), call('10', 'up'));

    expect(waitTimeSeconds(context)).toBe(context.estimate.etaSeconds);

    // 40 m at V=2, A=1, J=1 is 23.0 s of profile; naive 40/2 = 20 s. Plus 0.5 s motor start
    // and 0.5 s levelling.
    expect(waitTimeSeconds(context)).toBeCloseTo(0.5 + 23 + 0.5, 9);
    expect(waitTimeSeconds(context)).toBeGreaterThan(40 / 2);
  });

  it('charges the door time of every committed stop it passes first', () => {
    const bare = makeCar('A', '0');
    const busy = makeCar('B', '0');
    busy.registerCarCall('5');

    const direct = waitTimeSeconds(contextFor(bare.snapshot(0), call('10', 'up')));
    const viaStop = waitTimeSeconds(contextFor(busy.snapshot(0), call('10', 'up')));
    expect(viaStop).toBeGreaterThan(direct);
  });

  it('is never negative', () => {
    const car = makeCar('A', '3');
    expect(waitTimeSeconds(contextFor(car.snapshot(0), call('3', 'up')))).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------------------- *
 * distanceTravelled — the nearest-car term
 * -------------------------------------------------------------------------- */

describe('distanceTravelled', () => {
  it('collapses to the distance to the call for an idle car — which is nearest-car', () => {
    const near = makeCar('A', '5');
    const far = makeCar('B', '0');

    expect(marginalDistanceM(contextFor(near.snapshot(0), call('6', 'up')))).toBeCloseTo(
      FLOOR_PITCH_M,
      9,
    );
    expect(marginalDistanceM(contextFor(far.snapshot(0), call('6', 'up')))).toBeCloseTo(
      6 * FLOOR_PITCH_M,
      9,
    );
  });

  it('charges nothing when the call floor is already on the route', () => {
    // The correct energy semantics: the car passes the floor anyway, so the marginal energy
    // really is zero. Charging straight-line distance would penalise the car best placed to
    // sweep the floor up on its way.
    const car = makeCar('A', '0');
    car.registerCarCall('10');
    expect(marginalDistanceM(contextFor(car.snapshot(0), call('4', 'up')))).toBe(0);
    expect(marginalDistanceM(contextFor(car.snapshot(0), call('10', 'up')))).toBe(0);
  });

  it('charges the whole detour for a call behind the car', () => {
    // Standing at 4 with 10 committed, so the run direction is up. A call at 2 is served
    // after 10: the route becomes 4 → 10 → 2 (24 + 32 m) against a baseline of 4 → 10 (24 m),
    // so the call costs the full 32 m back down.
    const car = makeCar('A', '4');
    car.registerCarCall('10');
    expect(marginalDistanceM(contextFor(car.snapshot(0), call('2', 'down')))).toBeCloseTo(
      8 * FLOOR_PITCH_M,
      9,
    );
  });

  it('excludes the leg already in flight, because it is common to both routes', () => {
    const clock = clockAt(0);
    const car = makeCar('A', '0', clock);
    car.registerCarCall('10');
    car.departFor('10', 0);
    clock.set(4);

    // Mid-flight from 0 to 10, a call at 12 costs only the 10 → 12 extension; the metres
    // already being covered appear in neither route.
    expect(marginalDistanceM(contextFor(car.snapshot(4), call('12', 'up')))).toBeCloseTo(
      2 * FLOOR_PITCH_M,
      9,
    );
  });

  it('is never negative', () => {
    const car = makeCar('A', '7');
    car.registerCarCall('2');
    for (const floorId of ['0', '2', '7', '9', '20']) {
      expect(marginalDistanceM(contextFor(car.snapshot(0), call(floorId, 'up')))).toBeGreaterThanOrEqual(0);
    }
  });

  it('measures a path in metres of height, not in floor counts', () => {
    const route = [
      { heightM: 10 },
      { heightM: 4 },
      { heightM: 9 },
    ] as unknown as Parameters<typeof pathLengthM>[1];
    expect(pathLengthM(0, route)).toBe(10 + 6 + 5);
  });
});

/* -------------------------------------------------------------------------- *
 * directionReversal
 * -------------------------------------------------------------------------- */

describe('directionReversal', () => {
  /** A car running up from 0 towards 10, standing at 4 with 10 committed. */
  function runningUp(): CarSnapshot {
    const car = makeCar('A', '4');
    car.registerCarCall('10');
    return car.snapshot(0);
  }

  it('scores an idle car zero — it is free to set off either way', () => {
    const idle = makeCar('A', '4').snapshot(0);
    const assessment = assessDirectionReversal(idle, call('1', 'down'));
    expect(assessment.direction).toBeUndefined();
    expect(assessment.reversals).toBe(0);
  });

  it('scores zero for a call ahead in the car’s own direction', () => {
    expect(assessDirectionReversal(runningUp(), call('8', 'up')).reversals).toBe(0);
  });

  it('scores one when the car arrives facing the wrong way for the passenger', () => {
    const assessment = assessDirectionReversal(runningUp(), call('8', 'down'));
    expect(assessment.reversesToReach).toBe(false);
    expect(assessment.opposesCallDirection).toBe(true);
    expect(assessment.reversals).toBe(1);
  });

  it('scores one when it must turn round to reach the floor but then faces the right way', () => {
    // Up to 10, call at 2 going down: reverse at 10, come down, passenger also going down.
    const assessment = assessDirectionReversal(runningUp(), call('2', 'down'));
    expect(assessment.reversesToReach).toBe(true);
    expect(assessment.opposesCallDirection).toBe(false);
    expect(assessment.reversals).toBe(1);
  });

  it('scores two when it must turn round and then turn round again', () => {
    // Up to 10, call at 2 going up: down to 2, then up again. Genuinely worse than one, and a
    // boolean penalty could not say so.
    const assessment = assessDirectionReversal(runningUp(), call('2', 'up'));
    expect(assessment.reversesToReach).toBe(true);
    expect(assessment.opposesCallDirection).toBe(true);
    expect(assessment.reversals).toBe(2);
  });

  it('measures "behind" from the floor a moving car is committed to, not from where it is', () => {
    // The car cannot stop short of its destination — `projectRoute` models exactly that — so
    // eligibility and cost must agree that floor 6 is behind a car flying 0 → 10.
    const clock = clockAt(0);
    const car = makeCar('A', '0', clock);
    car.registerCarCall('10');
    car.departFor('10', 0);
    clock.set(3);

    expect(assessDirectionReversal(car.snapshot(3), call('6', 'up')).reversesToReach).toBe(true);
    expect(assessDirectionReversal(car.snapshot(3), call('12', 'up')).reversesToReach).toBe(false);
  });

  it('scores zero for a floor the shaft does not serve — that is stage 2’s answer, not a cost', () => {
    const assessment = assessDirectionReversal(runningUp(), call('99', 'up'));
    expect(assessment.reversals).toBe(0);
  });
});
