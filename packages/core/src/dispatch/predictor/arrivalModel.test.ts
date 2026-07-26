/**
 * The estimator: does it learn, does it learn the right thing, and does it give the same answer
 * twice?
 *
 * Causality has its own file. This one is about the arithmetic:
 *
 * - **cold start** returns the prior, not `NaN` and not zero everywhere — a model that forecasts
 *   zero on every floor is indistinguishable from "no demand anywhere", and a repositioning stage
 *   handed that parks by floor-id order for the first minutes of every run;
 * - **learning** ranks a floor that has been busy above one that has not, which is the whole
 *   product;
 * - **time-of-day** discrimination appears once a bucket comes round a second time, which is the
 *   part a single 30-minute replication cannot exercise and a multi-day run can;
 * - **determinism** — same observations in the same order, bit-identical forecasts (CLAUDE.md
 *   invariants 2 and 4).
 */

import { describe, expect, it } from 'vitest';

import type { DemandForecastSource, PrepositionContext } from '../policies/types.js';
import type { RepositionContext } from '../types.js';

import { createArrivalModel, resolvePredictorConfig } from './arrivalModel.js';
import { PREDICTOR_DEFAULTS, PREDICTOR_PARAMETERS } from './parameters.js';
import { PredictorError, type ArrivalModel, type DemandForecast } from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

/** A 20-floor office shaft. Floor 12 is the one every learning test makes busy. */
const FLOORS: readonly string[] = Object.freeze(
  Array.from({ length: 20 }, (_, index) => String(index + 1)),
);

const SMALL_FLOORS: readonly string[] = Object.freeze(['1', '2', '3', '4', '5', '6']);

/** One `rise-and-fall` replication, seconds. docs/03-traffic-and-statistics.md § independence. */
const REPLICATION_S = 1800;

function model(floorIds: readonly string[] = FLOORS): ArrivalModel {
  return createArrivalModel({ floorIds });
}

/** Floor ids ordered by forecast demand, busiest first. */
function ranking(forecast: ReadonlyMap<string, number>): readonly string[] {
  return [...forecast.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([floorId]) => floorId);
}

/* -------------------------------------------------------------------------- *
 * Cold start
 * -------------------------------------------------------------------------- */

describe('cold start', () => {
  it('returns the prior on every floor, not NaN and not zero', () => {
    const predictor = model();
    const forecast = predictor.expectedDemandByFloor(0, 300);

    // Every floor the model was built for is present. A floor missing from the map is a floor the
    // repositioning stage will never park on, and "no evidence" is not "no demand".
    expect([...forecast.keys()]).toStrictEqual([...FLOORS]);

    for (const [floorId, expected] of forecast) {
      expect(Number.isFinite(expected), floorId).toBe(true);
      expect(expected, floorId).toBeGreaterThan(0);
    }

    // 0.005 arrivals/s per (floor, direction) × 300 s × two directions.
    const perDirection = PREDICTOR_DEFAULTS.predictorPriorRatePerS * 300;
    for (const [floorId, expected] of forecast) {
      expect(expected, floorId).toBeCloseTo(2 * perDirection, 12);
    }
    expect(predictor.forecast('12', 'up', 0, 300)).toBeCloseTo(perDirection, 12);
    expect(predictor.rate('12', 'up', 0)).toBeCloseTo(
      PREDICTOR_DEFAULTS.predictorPriorRatePerS,
      12,
    );
  });

  it('is uniform, so it expresses no belief about which floor is busy', () => {
    // Deliberate. A default prior with a shape would let a run benefit from a belief nobody
    // configured, and the pre-positioning result would be partly a property of this file.
    const forecast = model().expectedDemandByFloor(0);
    expect(new Set(forecast.values()).size).toBe(1);
  });

  it('takes a per-floor prior when the caller has one, split evenly across directions', () => {
    // Building fabric, not demand: "an office fills from the entrances" is true before the run
    // starts. It is also the one place clairvoyance could be smuggled in as configuration, which
    // is why the default above has no shape at all.
    const predictor = createArrivalModel({
      floorIds: SMALL_FLOORS,
      priorRateByFloor: new Map([['1', 0.4]]),
    });

    expect(predictor.forecast('1', 'up', 0, 300)).toBeCloseTo(0.2 * 300, 9);
    expect(predictor.forecast('1', 'down', 0, 300)).toBeCloseTo(0.2 * 300, 9);
    expect(ranking(predictor.expectedDemandByFloor(0, 300))[0]).toBe('1');
  });

  it('decays below the prior once buckets have closed with nothing in them', () => {
    // Thirty minutes of watching an empty landing is evidence, and the model must be allowed to
    // use it. A predictor that only ever revises upward would rank a floor nobody uses level with
    // one it has no opinion about.
    const predictor = model();
    const atStart = predictor.forecast('12', 'up', 0, 300);
    const afterSilence = predictor.forecast('12', 'up', REPLICATION_S, 300);

    expect(afterSilence).toBeLessThan(atStart);
    expect(afterSilence).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Learning a synthetic pattern
 * -------------------------------------------------------------------------- */

describe('learning', () => {
  it('ranks the floor 30 minutes of arrivals were concentrated on highest', () => {
    // The headline behaviour. One landing gets a passenger every ten seconds for a whole
    // replication; every other landing gets nothing.
    const predictor = model();
    for (let at = 0; at < REPLICATION_S; at += 10) predictor.observe('12', 'up', at);
    expect(predictor.observedArrivals).toBe(180);

    const forecast = predictor.expectedDemandByFloor(REPLICATION_S, 300);
    const ranked = ranking(forecast);

    expect(ranked[0]).toBe('12');

    const busiest = forecast.get('12') ?? 0;
    for (const [floorId, expected] of forecast) {
      if (floorId === '12') continue;
      // Not marginally ahead: an order of magnitude ahead, so the ranking is not a tie broken by
      // floating-point noise.
      expect(busiest, floorId).toBeGreaterThan(10 * expected);
    }
  });

  it('learns the direction, not just the floor', () => {
    // The cells are per (floor, direction) because a down-peak and an up-peak want cars in
    // opposite places. A model that pooled directions would park for the wrong one.
    const predictor = model();
    for (let at = 0; at < REPLICATION_S; at += 10) predictor.observe('12', 'down', at);

    const up = predictor.forecast('12', 'up', REPLICATION_S, 300);
    const down = predictor.forecast('12', 'down', REPLICATION_S, 300);
    expect(down).toBeGreaterThan(10 * up);
  });

  it('forgets a landing that has gone quiet', () => {
    // Exponential weighting, so the estimate follows the traffic rather than accumulating it. A
    // morning up-peak must not still be steering cars at eleven o'clock.
    const predictor = model();
    for (let at = 0; at < 600; at += 5) predictor.observe('12', 'up', at);

    const whileBusy = predictor.forecast('12', 'up', 600, 300);
    const muchLater = predictor.forecast('12', 'up', 3600, 300);

    expect(whileBusy).toBeGreaterThan(10);
    expect(muchLater).toBeLessThan(whileBusy / 4);
  });

  it('discriminates by time of day once a bucket has come round again', () => {
    // The part a single terminating replication cannot exercise: inside 30 minutes every
    // time-of-day bucket occurs exactly once, so the per-bucket cells never accumulate and the
    // model leans on its landing-level estimate. Give the pattern four cycles and the cells take
    // over. A 30-minute cycle keeps the test fast; the mechanism is the same at 24 hours.
    const cycleS = 1800;
    const predictor = createArrivalModel({
      floorIds: SMALL_FLOORS,
      idle: { predictorCycleS: cycleS, predictorBucketWidthS: 300 },
    });

    // Bucket 1 of every cycle — 05:00 to 10:00 past the hour, in miniature — and nothing else.
    for (let cycle = 0; cycle < 4; cycle += 1) {
      for (let offset = 0; offset < 300; offset += 15) {
        predictor.observe('5', 'up', cycle * cycleS + 300 + offset);
      }
    }

    const atTheUsualTime = predictor.forecast('5', 'up', 4 * cycleS + 300, 300);
    const atAQuietTime = predictor.forecast('5', 'up', 4 * cycleS + 900, 300);

    // Same floor, same direction, so the landing-level estimate is identical for both queries and
    // the only thing that can separate them is the time-of-day cell.
    expect(atTheUsualTime).toBeGreaterThan(5 * atAQuietTime);
  });

  it('integrates a horizon bucket by bucket rather than extrapolating the current one', () => {
    // A window that crosses a bucket boundary is two buckets' worth of demand. Averaging them
    // into whichever bucket the window opened in is how a predictor misses the peak it exists to
    // see — and it would be invisible in any aggregate metric.
    const cycleS = 1800;
    const predictor = createArrivalModel({
      floorIds: SMALL_FLOORS,
      idle: { predictorCycleS: cycleS, predictorBucketWidthS: 300 },
    });
    // Cycle 0: busy in bucket 2 only.
    for (let offset = 0; offset < 300; offset += 10) predictor.observe('5', 'up', 600 + offset);

    // Asked at the start of bucket 1 of cycle 1: the next 300 s is a bucket the model has learned
    // is quiet, the 300 s after that is the one it has learned is busy.
    const at = cycleS + 300;
    const oneBucket = predictor.forecast('5', 'up', at, 300);
    const twoBuckets = predictor.forecast('5', 'up', at, 600);

    expect(twoBuckets).toBeGreaterThan(2 * oneBucket);
    // And a horizon inside one bucket is exactly linear in the rate, which is what makes the
    // integral above meaningful rather than a coincidence.
    expect(predictor.forecast('5', 'up', at, 150)).toBeCloseTo(oneBucket / 2, 12);
  });
});

/* -------------------------------------------------------------------------- *
 * Determinism
 * -------------------------------------------------------------------------- */

describe('determinism', () => {
  it('gives bit-identical forecasts for the same observation sequence', () => {
    // CLAUDE.md invariant 2 in its consequence form. If two models fed the same arrivals could
    // disagree, then two dispatchers differing only in a weight would see different forecasts,
    // common random numbers would be broken, and the paired-t comparison the whole project rests
    // on would be measuring the predictor's noise.
    const sequence: readonly (readonly [string, 'up' | 'down', number])[] = Object.freeze(
      Array.from({ length: 120 }, (_, index) => {
        const floorId = FLOORS[(index * 7) % FLOORS.length] ?? '1';
        const direction = index % 3 === 0 ? ('down' as const) : ('up' as const);
        return [floorId, direction, index * 13.5] as const;
      }),
    );

    const first = model();
    const second = model();
    for (const [floorId, direction, at] of sequence) {
      first.observe(floorId, direction, at);
      second.observe(floorId, direction, at);
    }

    // Read times are at or after the last observation (119 × 13.5 = 1606.5), because a read for a
    // time the model has moved past is refused — see causality.test.ts.
    for (const at of [1606.5, 1620, 1800, 2400, 5000]) {
      expect([...first.expectedDemandByFloor(at, 300)]).toStrictEqual([
        ...second.expectedDemandByFloor(at, 300),
      ]);
    }
    expect(first.observedArrivals).toBe(second.observedArrivals);
    expect(first.lastObservedAt).toBe(second.lastObservedAt);
  });

  it('treats a batch of n as exactly n arrivals at the same instant', () => {
    // Passengers arrive in batches (CLAUDE.md § modeling rules), and a caller holding a batch
    // size should not have to loop. Exact equivalence, so the convenience cannot change a result.
    const looped = model();
    const batched = model();
    for (let n = 0; n < 5; n += 1) looped.observe('12', 'up', 42);
    batched.observe('12', 'up', 42, 5);

    expect([...batched.expectedDemandByFloor(600, 300)]).toStrictEqual([
      ...looped.expectedDemandByFloor(600, 300),
    ]);
    expect(batched.observedArrivals).toBe(5);
  });

  it('returns to the prior exactly on reset', () => {
    // Required, not optional: a replication that starts with the previous one's learned rates is
    // not independent of it, and every confidence interval in this project assumes independence.
    const predictor = model();
    for (let at = 0; at < REPLICATION_S; at += 10) predictor.observe('12', 'up', at);
    predictor.reset();

    expect(predictor.observedArrivals).toBe(0);
    expect(predictor.lastObservedAt).toBeUndefined();
    expect([...predictor.expectedDemandByFloor(600, 300)]).toStrictEqual([
      ...model().expectedDemandByFloor(600, 300),
    ]);
    // And time may run from the start again, which a monotonicity guard keyed to the old clock
    // would have forbidden.
    expect(() => predictor.observe('12', 'up', 0)).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- *
 * Shape and wiring
 * -------------------------------------------------------------------------- */

describe('the forecast fits stage 7 without translation', () => {
  it('is exactly the map RepositionContext.demandForecast wants', () => {
    // `parkingStrategy: predicted-demand` has been implemented since Phase 2 and reports
    // `no-forecast` when nobody supplies one. This is one half of the type-level hand-off — the
    // per-car one — and on its own it pins the wrong half: `RepositionContext` takes a *map*, which
    // any `ReadonlyMap<string, number>` satisfies. The bank-level test below is the one that pins
    // the model itself against the interface stage 7 declares.
    const predictor = model();
    const context: RepositionContext = { demandForecast: predictor.expectedDemandByFloor(0) };
    expect(context.demandForecast?.size).toBe(FLOORS.length);
  });

  it('is a DemandForecastSource, so PrepositionContext.predictor takes the model itself', () => {
    // The hand-off that actually parks cars, and a compile-time assertion first: `PrepositionContext
    // .predictor` is declared as `DemandForecastSource`, whose single member is
    // `expectedDemandByFloor(fromT, horizonS?)`. If either signature drifts — a required horizon
    // there, a renamed member here — these two annotations stop compiling.
    //
    // This is worth pinning because the contract spans two modules that no one agent owns, and the
    // failure mode is not a wrong number: it is a wiring agent hitting TS2322, writing a private
    // wrapper nobody owns, and stage 7 going on reporting `no-forecast`. A declared-and-inert stage
    // is precisely how `parkingStrategy: predicted-demand` sat unused since Phase 2.
    const predictor = model();
    const source: DemandForecastSource = predictor;
    const context: PrepositionContext = { predictor, horizonS: 300 };

    // And the same numbers arrive through both faces: the interface is satisfied by the real
    // estimate, not by an incidentally-compatible member.
    expect([...(context.predictor?.expectedDemandByFloor(0, 300) ?? [])]).toStrictEqual([
      ...predictor.expectedDemandByFloor(0, 300),
    ]);
    expect(source.expectedDemandByFloor(0).size).toBe(FLOORS.length);
    // The horizon is an override, so omitting it must answer over the model's own configured one
    // rather than over a second default living in the policies layer.
    expect([...source.expectedDemandByFloor(0)]).toStrictEqual([
      ...predictor.expectedDemandByFloor(0, predictor.config.predictorHorizonS),
    ]);
  });

  it('is satisfied by the read-only face alone, so stage 7 never needs a mutating handle', () => {
    // What stops a group controller recording an observation is the static type, so the assignment
    // that matters is from `DemandForecast` — the face with no `observe` and no `reset`. If stage 7
    // could only be fed an `ArrivalModel`, every consumer of a forecast would end up holding one,
    // and a scorer that can record an observation makes `Car.estimateCost()` stateful (CLAUDE.md
    // invariant 1).
    const readOnly: DemandForecast = model();
    const source: DemandForecastSource = readOnly;
    expect(source.expectedDemandByFloor(0).size).toBe(FLOORS.length);

    // And one member is the whole of what stage 7 asks for: an object literal with nothing else
    // compiles, so no part of the mutating face is load-bearing for pre-positioning.
    const minimal: DemandForecastSource = {
      expectedDemandByFloor: (): ReadonlyMap<string, number> => new Map([['1', 1]]),
    };
    expect(minimal.expectedDemandByFloor(0).get('1')).toBe(1);
  });

  it('declares its own tunables (CLAUDE.md invariant 8)', () => {
    expect(model().parameters).toBe(PREDICTOR_PARAMETERS);
  });

  it('defaults the horizon to the configured one', () => {
    const predictor = createArrivalModel({ floorIds: SMALL_FLOORS, idle: { predictorHorizonS: 60 } });
    expect(predictor.config.predictorHorizonS).toBe(60);
    expect(predictor.forecast('1', 'up', 0)).toBeCloseTo(predictor.forecast('1', 'up', 0, 60), 12);
  });

  it('forecasts nothing over a non-positive horizon', () => {
    const predictor = model();
    expect(predictor.forecast('1', 'up', 0, 0)).toBe(0);
    expect(predictor.forecast('1', 'up', 0, -10)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Configuration
 * -------------------------------------------------------------------------- */

describe('resolvePredictorConfig', () => {
  it('applies every default, in the order the schema declares them', () => {
    expect(resolvePredictorConfig()).toStrictEqual({ ...PREDICTOR_DEFAULTS });
    expect(Object.keys(resolvePredictorConfig())).toStrictEqual(Object.keys(PREDICTOR_DEFAULTS));
  });

  it('takes the profile over the default, per field', () => {
    const config = resolvePredictorConfig({ predictorHorizonS: 120, predictorPriorStrength: 0 });
    expect(config.predictorHorizonS).toBe(120);
    expect(config.predictorPriorStrength).toBe(0);
    expect(config.predictorLearningRate).toBe(PREDICTOR_DEFAULTS.predictorLearningRate);
  });

  it('trusts the first bucket completely at prior strength zero, rather than dividing by zero', () => {
    // The boundary of the declared range, and the one that would produce `NaN` if the shrinkage
    // chain were written naively. A `NaN` forecast propagates silently into every parking decision
    // that follows.
    const predictor = createArrivalModel({
      floorIds: SMALL_FLOORS,
      idle: { predictorPriorStrength: 0 },
    });
    // No evidence and no prior weight is not `0 / 0`: it is "nothing to say but what the coarser
    // level says", and the coarsest level is the prior.
    expect(predictor.forecast('1', 'up', 0, 300)).toBeCloseTo(
      PREDICTOR_DEFAULTS.predictorPriorRatePerS * 300,
      12,
    );

    predictor.observe('1', 'up', 10, 30);
    const learned = predictor.forecast('1', 'up', 300, 300);
    expect(Number.isFinite(learned)).toBe(true);
    // One completed bucket of 30 arrivals in 300 s, taken at face value: the moving average has
    // moved 30% of the way to 0.1/s and nothing is holding it back.
    expect(learned).toBeCloseTo(0.3 * 0.1 * 300, 9);
  });

  it('rejects a learning rate that cannot learn', () => {
    // Zero is the dangerous one: it builds without complaint, forecasts the prior forever, and
    // makes every pre-positioning result a property of the prior rather than of the traffic.
    expect(() => resolvePredictorConfig({ predictorLearningRate: 0 })).toThrow(PredictorError);
    expect(() => resolvePredictorConfig({ predictorLearningRate: 0 })).toThrow(/never learn/);
    expect(() => resolvePredictorConfig({ predictorLearningRate: 1.2 })).toThrow(PredictorError);
    expect(() => resolvePredictorConfig({ predictorLearningRate: -0.1 })).toThrow(PredictorError);
    expect(() => resolvePredictorConfig({ predictorLearningRate: Number.NaN })).toThrow(
      PredictorError,
    );
    expect(() => resolvePredictorConfig({ predictorLearningRate: 1 })).not.toThrow();
  });

  it('rejects a zero-width bucket, a zero cycle and a zero horizon', () => {
    expect(() => resolvePredictorConfig({ predictorBucketWidthS: 0 })).toThrow(/positive/);
    expect(() => resolvePredictorConfig({ predictorCycleS: 0 })).toThrow(/positive/);
    expect(() => resolvePredictorConfig({ predictorHorizonS: 0 })).toThrow(/positive/);
    expect(() => resolvePredictorConfig({ predictorHorizonS: Infinity })).toThrow(/positive/);
  });

  it('rejects a negative prior', () => {
    expect(() => resolvePredictorConfig({ predictorPriorRatePerS: -1 })).toThrow(/non-negative/);
    expect(() => resolvePredictorConfig({ predictorPriorStrength: -1 })).toThrow(/non-negative/);
  });

  it('accepts a bucket width that does not divide the cycle, and prices the short bucket at its own width', () => {
    // No constraint between two declared parameters, deliberately: a generic optimizer samples
    // each row independently and would violate one, and it cannot tell a throw from a bad score.
    const predictor = createArrivalModel({
      floorIds: SMALL_FLOORS,
      idle: { predictorCycleS: 1000, predictorBucketWidthS: 300 },
    });
    // Buckets are [0,300), [300,600), [600,900), [900,1000) — the last one 100 s wide.
    predictor.observe('1', 'up', 950, 20);
    const inTheShortBucket = predictor.forecast('1', 'up', 1000 + 900, 100);
    expect(Number.isFinite(inTheShortBucket)).toBe(true);
    // 20 arrivals in 100 s is 0.2/s, and the moving average takes 30% of that. Dividing by the
    // nominal 300 s instead would put the estimate at a third of this, below 1.14 — so the
    // threshold is what proves the short bucket was priced at its own width.
    expect(inTheShortBucket).toBeGreaterThan(1.5);
  });
});

/* -------------------------------------------------------------------------- *
 * Guards
 * -------------------------------------------------------------------------- */

describe('guards', () => {
  it('refuses to be built without floors, or with a floor named twice', () => {
    expect(() => createArrivalModel({ floorIds: [] })).toThrow(/at least one floor/);
    expect(() => createArrivalModel({ floorIds: ['1', '2', '1'] })).toThrow(/duplicate/);
  });

  it('refuses an arrival at a floor it does not serve', () => {
    // Silently ignoring it would be worse than throwing: the demand would be real, invisible to
    // every forecast, and the repositioning stage would provably never park for it.
    const predictor = model(SMALL_FLOORS);
    expect(() => predictor.observe('99', 'up', 10)).toThrow(/unknown floor/);
    expect(() => predictor.forecast('99', 'up', 10, 300)).toThrow(/unknown floor/);
    expect(() => predictor.rate('99', 'up', 10)).toThrow(/unknown floor/);
  });

  it('refuses a prior for a floor it does not serve', () => {
    expect(() =>
      createArrivalModel({
        floorIds: SMALL_FLOORS,
        priorRateByFloor: new Map([['99', 0.1]]),
      }),
    ).toThrow(/not one of the model's floors/);
    expect(() =>
      createArrivalModel({ floorIds: SMALL_FLOORS, priorRateByFloor: new Map([['1', -1]]) }),
    ).toThrow(/non-negative/);
  });

  it('refuses a batch that is not a positive whole number of passengers', () => {
    const predictor = model(SMALL_FLOORS);
    expect(() => predictor.observe('1', 'up', 10, 0)).toThrow(/positive integer/);
    expect(() => predictor.observe('1', 'up', 10, 1.5)).toThrow(/positive integer/);
    expect(() => predictor.observe('1', 'up', 10, -2)).toThrow(/positive integer/);
  });

  it('refuses a time that is not a simulated time', () => {
    const predictor = model(SMALL_FLOORS);
    expect(() => predictor.observe('1', 'up', -1)).toThrow(/finite simulated time/);
    expect(() => predictor.observe('1', 'up', Number.NaN)).toThrow(/finite simulated time/);
    expect(() => predictor.forecast('1', 'up', Infinity, 300)).toThrow(/finite simulated time/);
    expect(() => predictor.rate('1', 'up', Number.NaN)).toThrow(/finite simulated time/);
  });

  it('refuses a horizon long enough to be a unit mistake', () => {
    // A guard rather than a tunable: at the narrowest declared bucket width the widest declared
    // horizon is 120 segments, so nothing a schema-honouring optimizer samples can reach it. What
    // it catches is a day passed where a horizon was meant.
    const predictor = model(SMALL_FLOORS);
    expect(() => predictor.forecast('1', 'up', 0, 1e9)).toThrow(/unit mistake/);
    expect(() => predictor.forecast('1', 'up', 0, Number.NaN)).toThrow(/finite/);
  });

  it('never reports a negative, infinite or NaN expectation, however it is driven', () => {
    // The property every consumer relies on. `RepositionDecision` divides by a total forecast
    // weight and the `predictedDemand` term normalizes one, so a single `NaN` would poison a
    // parking decision and a whole weighted cost without anything failing loudly.
    const predictor = model();
    // Observations and reads interleaved in time order, the way a kernel drives it: a read for a
    // time the model has already passed is refused outright (causality.test.ts), so feeding all 400
    // arrivals up front would make the early reads unaskable rather than unchecked.
    let fed = 0;
    const feedTo = (at: number): void => {
      while (fed < 400 && fed * 4.25 <= at) {
        const floorId = FLOORS[(fed * 11) % FLOORS.length] ?? '1';
        predictor.observe(floorId, fed % 2 === 0 ? 'up' : 'down', fed * 4.25, (fed % 3) + 1);
        fed += 1;
      }
    };
    for (const at of [0, 1, 299.999, 300, 1799.5, 5000, 90_000]) {
      feedTo(at);
      for (const [floorId, expected] of predictor.expectedDemandByFloor(at, 300)) {
        expect(Number.isFinite(expected), `${floorId} at ${String(at)}`).toBe(true);
        expect(expected, `${floorId} at ${String(at)}`).toBeGreaterThanOrEqual(0);
      }
      expect(predictor.rate('12', 'up', at)).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(predictor.rate('12', 'up', at))).toBe(true);
    }
    // Every arrival really was fed, so the later reads are of a model with 400 batches in it rather
    // than of a cold one that trivially cannot produce a NaN.
    expect(fed).toBe(400);
    // Batches of 1, 2, 3 repeating: 133 whole cycles of six plus a final single.
    expect(predictor.observedArrivals).toBe(799);
  });
});
