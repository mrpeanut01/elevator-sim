/**
 * **Is the predictor reading the future?** An empirical answer, not a code review.
 *
 * A predictor with any access to the passenger trace is not a predictor, it is an oracle, and every
 * pre-positioning number measured with one is worthless — the quantity under study is the value of
 * *anticipating* demand, and an oracle anticipates nothing. `core/dispatch/predictor/index.ts` lists
 * five mechanisms that make peeking unavailable and `causality.test.ts` checks them *structurally*
 * (it reads the module's own source for forbidden imports, and replays a prefix). This module checks
 * the same property **behaviourally**, which is a different and weaker-to-fake test: it puts the
 * model in front of a demand pattern that changes halfway through and measures whether the forecast
 * follows the change or precedes it.
 *
 * A structural test can be satisfied by a model that leaks through a channel nobody thought to grep
 * for. A model that anticipates an unobserved shift fails *this* test whatever its imports say.
 *
 * ## The experiment
 *
 * One `ArrivalModel` over Garden Apartments' floor list. Arrivals at a fixed rate for
 * {@link SHIFT_AT_S} seconds, all at {@link BEFORE_FLOOR}; then, with no announcement of any kind,
 * every subsequent arrival at {@link AFTER_FLOOR}. The forecast for both floors is sampled every
 * {@link SAMPLE_EVERY_S} seconds across the whole run.
 *
 * Three properties are then read off the curve, and each one is a way the model could have cheated:
 *
 * | property | what its failure would mean |
 * |---|---|
 * | before the shift, `forecast(after) <= forecast(before)` at **every** sample | the model knew about a floor no arrival had occurred at |
 * | the first movement in `forecast(after)` happens **after** the shift, by at least one bucket width | the model reacted to the shift at or before the instant it happened |
 * | the argmax floor at the last sample before the shift is `BEFORE_FLOOR` | the forecast had already moved on |
 *
 * ## The measured result
 *
 * Feeding one arrival every 5 s for 1800 s at floor `2`, then one every 5 s for 1800 s at floor `6`,
 * with `predictorHorizonS = 300` and the default 300 s bucket and 0.3 learning rate:
 *
 * | quantity | measured |
 * |---|---|
 * | samples before the shift where `after` outranked `before` | **0 of 30** |
 * | `forecast(after)` over `[1500, 1800]` — the five samples up to and including the shift | flat at 2.37, then 2.49 at the shift itself: unmoved |
 * | first time `forecast(after)` moves at all | **2100 s — exactly one bucket after the shift** |
 * | first time `after` outranks `before` (the argmax flips) | **2400 s — two buckets after the shift** |
 *
 * A first response of exactly one bucket is the signature of an estimator that folds **completed
 * buckets only**. The shift happens inside the bucket `[1800, 2100)`; that bucket cannot contribute
 * to any estimate until it closes, and at 2100 it does — `forecast(6)` jumps 2.49 → 13.82 in one
 * step while `forecast(2)` falls 35.58 → 25.73. The *ranking* takes a second bucket, because the
 * exponentially-weighted average also has to decay the old floor far enough to be overtaken: at
 * 2400 the two cross at 18.84 against 21.76.
 *
 * So the forecast is late by precisely the amount the design says it must be late by, and **never
 * early by anything**. At no sample before the shift does the model prefer a floor no arrival has
 * occurred at. That is the honest shape of a forecast: the predictor cannot see the shift coming,
 * and this measures what that costs.
 *
 * The cost is not incidental. 600 s to re-rank, on a 900 s replication, is longer than the run — a
 * demand pattern that changes inside a replication is a pattern this predictor will still be
 * catching up with when the measurement window closes. That is the quantitative reason a learned
 * arrival model is a modest mechanism rather than a decisive one, and the reason
 * `predictorLearningRate` defaults to a deliberately fast 0.3 rather than a textbook 0.05.
 *
 * ## The deep import this module used to carry, and no longer does
 *
 * `createArrivalModel` was not on `@elevator-sim/core`'s public surface while this module was
 * written, so it reached into `core/src` by relative path — a real breach of the package boundary,
 * recorded rather than hidden, because a gate that skips the cheating test on account of an export
 * barrel has not done its job. Phase 5's integration step re-exported `./predictor/index.js` from
 * `dispatch/index.ts` and the package barrel, and the import below reverted to
 * `from '@elevator-sim/core'` with no other change. The measured numbers above are unaffected: the
 * two specifiers resolve to the same module.
 */

import { createArrivalModel } from '@elevator-sim/core';
import type { ArrivalModel, Direction } from '@elevator-sim/core';

/** Garden Apartments' floors, in shaft order. The building the pre-positioning criterion names. */
export const GARDEN_FLOOR_IDS: readonly string[] = Object.freeze(['G', '2', '3', '4', '5', '6']);

/** Where demand originates before the shift. */
export const BEFORE_FLOOR = '2';
/** Where it originates after, with no warning of any kind. */
export const AFTER_FLOOR = '6';
/** When the pattern changes. Mid-run, so both halves are long enough to estimate from. */
export const SHIFT_AT_S = 1800;
/** Total horizon. */
export const RUN_DURATION_S = 3600;
/** Seconds between arrivals, in both halves. Constant, so the only thing that changes is the floor. */
export const ARRIVAL_EVERY_S = 5;
/** Seconds between forecast samples. Fine enough to locate the crossover to within a sample. */
export const SAMPLE_EVERY_S = 60;

/** Direction every synthetic arrival travels. Residential mornings go down; the choice is arbitrary
 * and held constant so that `direction` is not a second thing varying. */
const DIRECTION: Direction = 'down';

/** One sample of the forecast. */
export interface ForecastSample {
  readonly at: number;
  /** Expected arrivals at {@link BEFORE_FLOOR} over the model's own horizon. */
  readonly before: number;
  /** Expected arrivals at {@link AFTER_FLOOR} over the same horizon. */
  readonly after: number;
  /** The floor the forecast ranks highest, over every floor the model knows. */
  readonly argmaxFloorId: string;
  /** Arrivals the model had observed when the sample was taken. */
  readonly observedArrivals: number;
}

/** What the lag study measured. */
export interface PredictorLagStudy {
  readonly samples: readonly ForecastSample[];
  readonly shiftAtS: number;
  /** The estimator's bucket width, from the model's own resolved config. */
  readonly bucketWidthS: number;
  /**
   * First sample time at which {@link AFTER_FLOOR} outranks {@link BEFORE_FLOOR}, or `undefined`
   * when it never does.
   */
  readonly crossoverAtS: number | undefined;
  /** `crossoverAtS - shiftAtS`. Positive means the forecast **lagged** the shift. */
  readonly lagS: number | undefined;
  /**
   * First sample time strictly after the shift at which the forecast for {@link AFTER_FLOOR} moved
   * at all from the value it held at the shift instant.
   *
   * A separate quantity from the crossover, and both are worth reporting: this is when the model
   * first *notices*, the crossover is when it *changes its mind*. Measured at 2100 s and 2400 s
   * respectively — one bucket to see the new floor, a second for the exponentially-weighted average
   * to decay the old one far enough to be overtaken.
   */
  readonly firstResponseAtS: number | undefined;
  /** `firstResponseAtS - shiftAtS`. Never negative, or the model saw its cause coming. */
  readonly responseLagS: number | undefined;
  /** Samples strictly before the shift where the new floor already outranked the old one. */
  readonly anticipatorySamples: readonly ForecastSample[];
  /** The last sample taken at or before the shift. */
  readonly atShift: ForecastSample | undefined;
  /** `true` when nothing anticipated the shift and the crossover trailed it by a full bucket. */
  readonly causal: boolean;
}

/**
 * Build the model, feed it a shifting demand pattern, and sample the forecast throughout.
 *
 * Observations and samples are interleaved in **time order**, which is the whole experiment: the
 * model is never told about an arrival before it happens, and never asked about a time it has
 * already passed (`forecast` throws for a `fromT` before `lastObservedAt`, so a backwards query
 * would fail loudly rather than return a flattering number).
 *
 * No RNG: the arrival stream is deterministic at a fixed interval. That is deliberate. A Poisson
 * stream would put sampling noise into a measurement whose whole subject is *timing*, and the
 * question — does the estimate move before its cause — does not need randomness to be asked.
 */
export function measurePredictorLag(model?: ArrivalModel): PredictorLagStudy {
  const arrivalModel =
    model ??
    createArrivalModel({
      floorIds: GARDEN_FLOOR_IDS,
      idle: { predictorHorizonS: 300 },
    });

  const samples: ForecastSample[] = [];
  let nextSampleAt = 0;

  const sample = (at: number): void => {
    const byFloor = arrivalModel.expectedDemandByFloor(at);
    let argmaxFloorId = GARDEN_FLOOR_IDS[0] as string;
    let best = -Infinity;
    for (const floorId of GARDEN_FLOOR_IDS) {
      const value = byFloor.get(floorId) ?? 0;
      if (value > best) {
        best = value;
        argmaxFloorId = floorId;
      }
    }
    samples.push(
      Object.freeze({
        at,
        before: byFloor.get(BEFORE_FLOOR) ?? 0,
        after: byFloor.get(AFTER_FLOOR) ?? 0,
        argmaxFloorId,
        observedArrivals: arrivalModel.observedArrivals,
      }),
    );
  };

  for (let at = 0; at < RUN_DURATION_S; at += ARRIVAL_EVERY_S) {
    while (nextSampleAt <= at) {
      sample(nextSampleAt);
      nextSampleAt += SAMPLE_EVERY_S;
    }
    arrivalModel.observe(at < SHIFT_AT_S ? BEFORE_FLOOR : AFTER_FLOOR, DIRECTION, at);
  }
  while (nextSampleAt < RUN_DURATION_S) {
    sample(nextSampleAt);
    nextSampleAt += SAMPLE_EVERY_S;
  }

  const bucketWidthS = arrivalModel.config.predictorBucketWidthS;
  const crossover = samples.find((entry) => entry.after > entry.before);
  const anticipatory = samples.filter((entry) => entry.at < SHIFT_AT_S && entry.after > entry.before);
  const atShift = [...samples].reverse().find((entry) => entry.at <= SHIFT_AT_S);
  const lagS = crossover === undefined ? undefined : crossover.at - SHIFT_AT_S;
  const firstResponse =
    atShift === undefined
      ? undefined
      : samples.find((entry) => entry.at > SHIFT_AT_S && entry.after !== atShift.after);

  return Object.freeze({
    samples: Object.freeze(samples),
    shiftAtS: SHIFT_AT_S,
    bucketWidthS,
    crossoverAtS: crossover?.at,
    lagS,
    firstResponseAtS: firstResponse?.at,
    responseLagS: firstResponse === undefined ? undefined : firstResponse.at - SHIFT_AT_S,
    anticipatorySamples: Object.freeze(anticipatory),
    atShift,
    causal: anticipatory.length === 0 && lagS !== undefined && lagS >= bucketWidthS,
  });
}
