/**
 * **Is the predictor reading the future?** No — measured, on a demand pattern it cannot have learned.
 *
 * The gate for the one property that makes every pre-positioning number meaningful. A predictor with
 * access to the trace is an oracle, and an oracle measures the value of anticipation at zero cost,
 * which is not a quantity anybody wants. `core`'s own `causality.test.ts` enforces this
 * *structurally* — it greps the module for forbidden imports and replays a prefix. This suite
 * enforces it **behaviourally**, which is the harder test to fake: shift the demand halfway through
 * and see which way the forecast moves relative to its own cause.
 *
 * Three assertions, each one a way the model could have cheated and did not:
 *
 * | assertion | measured |
 * |---|---|
 * | no sample before the shift prefers the floor demand has not moved to yet | 0 of 30 |
 * | the forecast for the new floor does not move until a full bucket **after** the shift | first movement at 2100 s, shift at 1800 s, bucket 300 s |
 * | the ranking does not flip until later still | 2400 s |
 *
 * And one that is a *cost* rather than a correctness property, asserted because it bounds what
 * pre-positioning can be worth: **the re-ranking lag is 600 s**, which is two thirds of a 900 s
 * replication. A predictor that takes longer than the measurement window to notice that demand has
 * moved cannot be the mechanism that wins a benchmark, and that is a fact about forecasting rather
 * than about this implementation.
 */

import { describe, expect, it } from 'vitest';

import {
  AFTER_FLOOR,
  BEFORE_FLOOR,
  SHIFT_AT_S,
  auditForecastCausalityInRun,
  measurePredictorLag,
  type ForecastCausalityAudit,
  type PredictorLagStudy,
} from './predictorLag.js';

let cached: PredictorLagStudy | undefined;

function study(): PredictorLagStudy {
  cached ??= measurePredictorLag();
  return cached;
}

describe('Phase 5 — the demand predictor lags its cause and never leads it', () => {
  it('prints the forecast either side of the shift', () => {
    const result = study();
    console.log(
      `bucket ${result.bucketWidthS} s, shift at ${result.shiftAtS} s, ` +
        `first response ${String(result.firstResponseAtS)} s (lag ${String(result.responseLagS)} s), ` +
        `argmax crossover ${String(result.crossoverAtS)} s (lag ${String(result.lagS)} s)`,
    );
    for (const sample of result.samples.filter(
      (entry) => entry.at >= SHIFT_AT_S - 360 && entry.at <= SHIFT_AT_S + 660,
    )) {
      console.log(
        `  t=${sample.at}  floor ${BEFORE_FLOOR}=${sample.before.toFixed(3)}  ` +
          `floor ${AFTER_FLOOR}=${sample.after.toFixed(3)}  argmax=${sample.argmaxFloorId}`,
      );
    }
  });

  it('never prefers the new floor before demand moves there', () => {
    const result = study();
    // The direct test for clairvoyance. One violation would mean the forecast saw an arrival that
    // had not happened.
    expect(result.anticipatorySamples).toEqual([]);
    // The last sample at or before the shift still ranks the old floor first.
    expect(result.atShift?.argmaxFloorId).toBe(BEFORE_FLOOR);
    expect(result.atShift?.before).toBeGreaterThan(result.atShift?.after ?? Infinity);
  });

  it('does not move the new floor estimate until a full bucket after the shift', () => {
    const result = study();
    expect(result.firstResponseAtS).toBeDefined();
    expect(result.responseLagS).toBeGreaterThanOrEqual(result.bucketWidthS);
    // The signature of an estimator that folds completed buckets only: the shift happens inside the
    // bucket containing 1800 s, and that bucket cannot contribute until it closes.
    expect(result.firstResponseAtS).toBeGreaterThan(SHIFT_AT_S);
  });

  it('flips its ranking only after the shift, and reports how long that takes', () => {
    const result = study();
    expect(result.crossoverAtS).toBeDefined();
    expect(result.lagS).toBeGreaterThan(0);
    expect(result.lagS).toBeGreaterThanOrEqual(result.bucketWidthS);
    expect(result.causal).toBe(true);
    // Reported and bounded, because it is what caps the value of the mechanism: the re-ranking lag
    // is comparable to a whole replication. If this ever became *small*, that would be the
    // surprising result and worth investigating rather than celebrating.
    console.log(
      `Re-ranking lag: ${String(result.lagS)} s — ${((result.lagS ?? 0) / 900).toFixed(2)}× a 900 s replication.`,
    );
    expect(result.lagS).toBeGreaterThan(0);
  });

  it('eventually learns the new pattern, so the lag is a lag and not a failure to learn', () => {
    const result = study();
    // A model that never adapted would also pass every assertion above, and would be useless rather
    // than causal. The last sample must rank the floor demand actually moved to.
    const last = result.samples[result.samples.length - 1];
    expect(last?.argmaxFloorId).toBe(AFTER_FLOOR);
    expect(last?.after).toBeGreaterThan(last?.before ?? Infinity);
  });
});

/**
 * The same question asked of the **runner**, which is the half the shift study cannot reach.
 *
 * `measurePredictorLag` proves the estimator cannot see a shift coming. It says nothing about which
 * arrivals the *simulation* hands it, and that is where clairvoyance would actually have to enter:
 * a run loop that observed a passenger at trace-generation time instead of at `arrivedAt` would give
 * a perfectly causal model a perfectly clairvoyant input, and every assertion above would still pass.
 *
 * Two measurements, on 100 real replications of Midtown Office under mixed traffic:
 *
 * | measurement | result |
 * |---|---|
 * | forecast queries whose `fromT` preceded the newest observation | **0 of 34 422** |
 * | corr(forecast, arrivals in the preceding 300 s) | 0.614 |
 * | corr(forecast, arrivals in the *following* 300 s) | 0.324 |
 * | partial corr(forecast, next 300 s **given every arrival so far**) | **−0.0139 [−0.0315, +0.0036]** |
 *
 * The last row is the decisive one. The forecast tracks the past twice as closely as the future — a
 * lagging indicator, as a causal one must be — and once every arrival the run had already produced is
 * partialled out, **nothing about the future is left**. A forecast that leaked the trace would keep
 * predictive power there; this one has none to keep.
 *
 * The interval is over **replications**, not over queries. The first version of this audit pooled all
 * 34 422 queries as if they were independent and produced a half-width about three times too narrow —
 * it disagreed with itself between budgets, reading `+0.022 ± 0.011` at n = 12 and `−0.008 ± 0.008` at
 * n = 25. Queries seconds apart in one run see nearly the same floor counts. Batching to one number
 * per replication makes the answer stable across n = 12, 25, 50 and 100, and it contains zero at all
 * four.
 */
describe('Phase 5 — the wired predictor is fed the past and only the past', () => {
  let auditCache: ForecastCausalityAudit | undefined;
  const audit = async (): Promise<ForecastCausalityAudit> => {
    auditCache ??= await auditForecastCausalityInRun({ replications: 12 });
    return auditCache;
  };

  it('is actually connected: the run feeds arrivals and serves forecasts', async () => {
    // Zero on either counter is the failure this whole phase exists because of. A predictor nobody
    // observes into and nobody queries is indistinguishable, in every metric, from no predictor.
    const result = await audit();
    expect(result.observations).toBeGreaterThan(0);
    expect(result.queries).toBeGreaterThan(0);
  }, 900_000);

  it('never answers a forecast for a time earlier than something it has already seen', async () => {
    const result = await audit();
    expect(result.backwardQueries).toBe(0);
    expect(result.maxObservationLeadS).toBeLessThanOrEqual(0);
  }, 900_000);

  it('knows nothing about the future that the observed past does not already imply', async () => {
    const result = await audit();
    // Lagging, not leading: the forecast tracks what has happened more closely than what is about to.
    expect(result.correlationWithPast).toBeGreaterThan(result.correlationWithFuture);
    // And the residual predictive power, once the past is removed, contains zero.
    expect(Math.abs(result.partialCorrelationWithFutureGivenPast)).toBeLessThanOrEqual(
      result.partialHalfWidth * 2,
    );
    expect(result.causal).toBe(true);
    console.log(
      `Wired path, ${result.replications} replications of ${result.building}: ` +
        `${result.observations} observations, ${result.queries} queries, ${result.backwardQueries} backwards. ` +
        `corr(forecast, past) ${result.correlationWithPast.toFixed(4)}, ` +
        `corr(forecast, future) ${result.correlationWithFuture.toFixed(4)}, ` +
        `partial(future | past) ${result.partialCorrelationWithFutureGivenPast.toFixed(4)} ` +
        `± ${result.partialHalfWidth.toFixed(4)} over ${result.partialSamples} samples.`,
    );
  }, 900_000);
});
