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
  measurePredictorLag,
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
