import { describe, expect, it } from 'vitest';

import type { CarSnapshot } from '../../model/car/types.js';
import { normalizeTerm, resolveNormalization } from '../normalize.js';

import {
  DESTINATION_CONFIG,
  FLOOR_PITCH_M,
  call,
  clockAt,
  contextFor,
  hallCall,
  makeCar,
  passengerTo,
  tamperProof,
} from './fixtures.test-helper.js';
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

const SCALES = resolveNormalization();

/* -------------------------------------------------------------------------- *
 * The registry
 * -------------------------------------------------------------------------- */

describe('the cost-term registry', () => {
  it('implements all twelve terms of the library, in the order the data file declares them', () => {
    expect(IMPLEMENTED_TERM_IDS).toEqual([
      'waitTime',
      'rideTime',
      'detourPenalty',
      'existingCallDelay',
      'directionReversal',
      'loadFactor',
      'stopCount',
      'distanceTravelled',
      'starvation',
      'zoneAffinity',
      'predictedDemand',
      'crowding',
    ]);
    expect(IMPLEMENTED_TERM_IDS).toEqual(DECLARED_TERM_IDS);
  });

  it('indexes every term by its id', () => {
    for (const term of COST_TERMS) {
      expect(COST_TERMS_BY_ID.get(term.id)).toBe(term);
      expect(costTerm(term.id)).toBe(term);
      expect(isImplementedTerm(term.id)).toBe(true);
    }
    expect(COST_TERMS_BY_ID.size).toBe(COST_TERMS.length);
  });

  it('still separates “declared but pending” from “not a term at all”', () => {
    // The library happens to be complete, so nothing is pending today. The distinction must
    // survive that: a pending term is carried, a typo is rejected. If the two collapsed, a future
    // declared-but-unimplemented term would be treated as a misspelling — and a misspelled weight
    // scores every car at zero, which decides by car id in silence.
    expect(isDeclaredTerm('predictedDemand')).toBe(true);
    expect(isImplementedTerm('predictedDemand')).toBe(true);
    expect(isDeclaredTerm('waitTiem')).toBe(false);
    expect(isDeclaredTerm('waittime')).toBe(false);
    expect(costTerm('waitTiem')).toBeUndefined();
    expect(isImplementedTerm('waitTiem')).toBe(false);
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
      expect(Object.isFrozen(term), term.id).toBe(true);
      if (term.normalization.mode === 'bounded') {
        expect(term.normalization.fullScale, term.id).toBeGreaterThan(0);
      } else {
        expect(['waitTimeS', 'distanceM'], term.id).toContain(term.normalization.scale);
      }
    }
  });

  it('lets a term declare the configuration its weight is live under', () => {
    // `parameters.ts` copies this onto the derived `weights.<id>` row, so a term that can only be
    // priced under some stage setting says so once, here, and no file has to name it (invariants 7
    // and 8 together). `rideTime` is the case: no destination, no in-car time, no live dimension.
    // `parameters.test.ts` checks the condition is satisfiable — that the gate exists, is
    // categorical, and admits the values named.
    expect(costTerm('rideTime')?.activeWhen).toEqual({
      'dispatch.callType': ['destination-entry', 'mobile-credential'],
    });

    for (const term of COST_TERMS) {
      if (term.activeWhen === undefined) continue;
      expect(Object.isFrozen(term.activeWhen), term.id).toBe(true);
      const conditions = Object.entries(term.activeWhen);
      expect(conditions.length, term.id).toBeGreaterThan(0);
      for (const [parameterId, values] of conditions) {
        // A dotted parameter path, never a term id: a condition on another term would be a
        // dependency between costs, which the weighted sum has no way to express.
        expect(parameterId, term.id).toContain('.');
        expect(values.length, `${term.id} → ${parameterId}`).toBeGreaterThan(0);
      }
    }
  });

  it('lets a term declare the configuration that changes what its weight prices', () => {
    // `partiallyActiveWhen` is the other half, and the two are opposites rather than degrees.
    // `activeWhen` says the dimension is dead outside the condition; `partiallyActiveWhen` says
    // it is alive outside it and pricing something else. `stopCount` is the case: the pickup is
    // counted under every call type, the destination stop only when one is disclosed.
    // `destinationDisclosure.test.ts` is where each declaration is checked against measurement;
    // this file checks the shape, and that no term claims both about one setting.
    expect(costTerm('stopCount')?.partiallyActiveWhen).toEqual({
      'dispatch.callType': ['destination-entry', 'mobile-credential'],
    });
    expect(costTerm('stopCount')?.activeWhen).toBeUndefined();

    for (const term of COST_TERMS) {
      if (term.partiallyActiveWhen === undefined) continue;
      expect(Object.isFrozen(term.partiallyActiveWhen), term.id).toBe(true);
      const conditions = Object.entries(term.partiallyActiveWhen);
      expect(conditions.length, term.id).toBeGreaterThan(0);
      for (const [parameterId, values] of conditions) {
        expect(parameterId, term.id).toContain('.');
        expect(values.length, `${term.id} → ${parameterId}`).toBeGreaterThan(0);
        // Contradictory on one key: a dimension cannot be both dead and live outside a
        // condition, and a consumer that read both would have to pick one and be wrong half
        // the time.
        expect(
          term.activeWhen?.[parameterId],
          `${term.id} declares ${parameterId} in both activeWhen and partiallyActiveWhen`,
        ).toBeUndefined();
      }
    }
  });

  it('returns a finite, non-negative number from every term on every plausible context', () => {
    // The contract `scoreCar` enforces at runtime, asserted here across a spread of car states so
    // a term that can produce a NaN or a bonus fails in this file rather than mid-replication.
    for (const context of probeContexts()) {
      for (const term of COST_TERMS) {
        const raw = term.evaluate(context);
        expect(Number.isFinite(raw), `${term.id} raw=${raw}`).toBe(true);
        expect(raw, term.id).toBeGreaterThanOrEqual(0);

        const normalized = normalizeTerm(term, raw, SCALES);
        expect(normalized, term.id).toBeGreaterThanOrEqual(0);
        expect(normalized, term.id).toBeLessThanOrEqual(1);
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Purity — CLAUDE.md invariant 1
 * -------------------------------------------------------------------------- */

describe('every cost term is pure', () => {
  it('leaves the car bit-identical after a thousand evaluations of every term', () => {
    // The roadmap's acceptance form of invariant 1: the dispatcher calls these thousands of times
    // per decision to evaluate hypotheticals it will not commit to.
    const car = makeCar('A', '4');
    car.assignHallCall(hallCall('16', 'up', 0));
    car.registerCarCall('8');
    car.board(passengerTo('12'), 0);
    car.board(passengerTo('12'), 0);

    const before = JSON.stringify(car.serialize());
    const context = contextFor(car.snapshot(0), call('6', 'up', 0, '14'), {
      config: DESTINATION_CONFIG,
      waitingPassengers: 9,
      zoneFloorIdsByCarId: new Map([['A', ['8', '9', '10']]]),
      demandForecast: new Map([
        ['0', 4],
        ['16', 1],
      ]),
    });

    for (let i = 0; i < 1000; i += 1) {
      for (const term of COST_TERMS) term.evaluate(context);
    }

    expect(JSON.stringify(car.serialize())).toBe(before);
  });

  it('cannot write to a snapshot even when every reachable object is sealed against it', () => {
    // The complementary proof, and the same harness `estimateCost.test.ts` uses: the test above
    // says nothing changed, this one says nothing *could* have, by making every write a term might
    // attempt throw — including through the shaft's lookup maps, which `Object.freeze` does not
    // protect.
    const car = makeCar('A', '4');
    car.assignHallCall(hallCall('16', 'up', 0));
    car.board(passengerTo('12'), 0);

    const hardened = tamperProof(car.snapshot(0));
    const context = contextFor(hardened, call('6', 'up', 0, '14'), {
      config: DESTINATION_CONFIG,
      waitingPassengers: 9,
      zoneFloorIdsByCarId: new Map([['A', ['8', '9', '10']]]),
      demandForecast: new Map([['0', 4]]),
    });

    for (const term of COST_TERMS) {
      expect(() => {
        for (let i = 0; i < 1000; i += 1) term.evaluate(context);
      }, term.id).not.toThrow();
    }
  });

  it('returns the same number on the thousandth call as on the first', () => {
    // Determinism, which purity implies and a cache could break: nothing a term reads may change
    // because a term read it.
    const context = probeContexts()[0] as ReturnType<typeof contextFor>;
    for (const term of COST_TERMS) {
      const first = term.evaluate(context);
      for (let i = 0; i < 1000; i += 1) {
        expect(term.evaluate(context), term.id).toBe(first);
      }
    }
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
      expect(
        marginalDistanceM(contextFor(car.snapshot(0), call(floorId, 'up'))),
      ).toBeGreaterThanOrEqual(0);
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

/* -------------------------------------------------------------------------- *
 * Probes
 * -------------------------------------------------------------------------- */

/** A spread of car states and calls wide enough to exercise every branch of every term. */
function probeContexts(): readonly ReturnType<typeof contextFor>[] {
  const contexts: ReturnType<typeof contextFor>[] = [];

  const idle = makeCar('A', '0');
  const holding = makeCar('B', '10');
  holding.assignHallCall(hallCall('4', 'down', 0));
  holding.assignHallCall(hallCall('18', 'up', 30));
  const carrying = makeCar('C', '6');
  for (let i = 0; i < 9; i += 1) carrying.board(passengerTo('14'), 0);
  const clock = clockAt(0);
  const flying = makeCar('D', '0', clock);
  flying.registerCarCall('16');
  flying.departFor('16', 0);
  clock.set(5);

  const zones: ReadonlyMap<string, readonly string[]> = new Map([
    ['A', ['0', '1', '2', '3']],
    ['B', ['10', '11', '12']],
    ['C', ['6', '7']],
  ]);
  const demandForecast: ReadonlyMap<string, number> = new Map([
    ['0', 6],
    ['12', 2],
    ['20', 1],
  ]);

  for (const [car, at] of [
    [idle.snapshot(120), 120],
    [holding.snapshot(120), 120],
    [carrying.snapshot(120), 120],
    [flying.snapshot(5), 5],
  ] as const) {
    for (const floorId of ['0', '4', '9', '14', '20']) {
      for (const direction of ['up', 'down'] as const) {
        contexts.push(
          contextFor(car, call(floorId, direction, 0), {
            at,
            waitingPassengers: 7,
            zoneFloorIdsByCarId: zones,
            demandForecast,
          }),
        );
        contexts.push(
          contextFor(car, call(floorId, direction, 0, '11'), {
            at,
            config: DESTINATION_CONFIG,
            waitingPassengers: 22,
            zoneFloorIdsByCarId: zones,
            demandForecast,
          }),
        );
      }
    }
  }

  return contexts;
}
