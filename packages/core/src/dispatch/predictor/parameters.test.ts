/**
 * The parameter schema, checked in both directions — CLAUDE.md invariant 8.
 *
 * `dispatch/parameters.test.ts` makes the argument for why both directions matter equally, and it
 * applies verbatim here:
 *
 * 1. **Nothing hidden.** A knob the model reads but does not declare is invisible to a Phase 7
 *    optimizer, which will then report a tuned winner that is only optimal at whatever the hidden
 *    value happened to be.
 * 2. **Nothing spurious.** A declared parameter nothing reads costs 50–200 replications per
 *    evaluation to discover is inert — and docs/03-traffic-and-statistics.md § flat plateaus says
 *    a noisy objective will attribute a difference to it anyway.
 *
 * The third assertion is the one specific to a *predictor*: every declared parameter must be able
 * to change a forecast. A tunable that cannot is a plateau by construction.
 */

import { describe, expect, it } from 'vitest';

import { dispatcherProfileSchema } from '../../config/schema.js';

import { createArrivalModel, resolvePredictorConfig } from './arrivalModel.js';
import {
  PREDICTOR_DEFAULTS,
  PREDICTOR_PARAMETERS,
  PREDICTOR_PARAMETER_IDS,
  predictorParameter,
  predictorParameterValue,
  tunablePredictorPathsOf,
} from './parameters.js';
import type { PredictorIdleSource } from './types.js';

const FLOORS: readonly string[] = Object.freeze(['1', '2', '3', '4', '5', '6']);

/** A probe value inside the declared range but away from the default, per parameter. */
const PROBES: Readonly<Record<string, number>> = Object.freeze({
  'idle.predictorHorizonS': 137,
  'idle.predictorLearningRate': 0.11,
  'idle.predictorBucketWidthS': 90,
  'idle.predictorCycleS': 3600,
  'idle.predictorPriorRatePerS': 0.02,
  'idle.predictorPriorStrength': 7,
});

describe('PREDICTOR_PARAMETERS', () => {
  it('declares every tunable the resolved config exposes, and nothing else', () => {
    const config = resolvePredictorConfig();
    expect([...PREDICTOR_PARAMETERS.map((parameter) => parameter.id)]).toStrictEqual([
      ...tunablePredictorPathsOf(config),
    ]);
  });

  it('quotes the defaults rather than repeating them', () => {
    // One source of truth. A schema whose `default` disagreed with the resolver would hand an
    // optimizer a starting point the simulator never actually runs at.
    const config = resolvePredictorConfig();
    for (const parameter of PREDICTOR_PARAMETERS) {
      expect(predictorParameterValue(config, parameter.id), parameter.id).toBe(parameter.default);
    }
  });

  it('gives every parameter a type, a range that contains its default, and a description', () => {
    for (const parameter of PREDICTOR_PARAMETERS) {
      expect(parameter.type, parameter.id).toBe('continuous');
      expect(parameter.scale, parameter.id).toMatch(/^(?:linear|log)$/);
      expect(parameter.description.length, parameter.id).toBeGreaterThan(80);

      const range = parameter.range;
      expect(range, parameter.id).toBeDefined();
      const [low, high] = range ?? [0, 0];
      expect(low, parameter.id).toBeLessThan(high);
      expect(parameter.default, parameter.id).toBeGreaterThanOrEqual(low);
      expect(parameter.default, parameter.id).toBeLessThanOrEqual(high);
      // A log scale over a range reaching zero is not samplable.
      if (parameter.scale === 'log') expect(low, parameter.id).toBeGreaterThan(0);
    }
  });

  it('declares no id twice, and every id under the idle section a profile authors', () => {
    const ids = PREDICTOR_PARAMETERS.map((parameter) => parameter.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PREDICTOR_PARAMETER_IDS.size).toBe(ids.length);
    for (const id of ids) {
      // `id` is the dotted path in `data/dispatcher-profiles.json`, so a tuned winner is written
      // back as a profile without translation.
      expect(id.startsWith('idle.predictor'), id).toBe(true);
      expect(predictorParameter(id)?.id).toBe(id);
    }
    expect(predictorParameter('idle.nonsense')).toBeUndefined();
    expect(predictorParameterValue(resolvePredictorConfig(), 'idle.nonsense')).toBeUndefined();
    expect(predictorParameterValue(resolvePredictorConfig(), 'weights.waitTime')).toBeUndefined();
  });

  it('every declared id is authorable as a profile path — all six, by parsing them', () => {
    // `id` is documented as "the dotted path in data/dispatcher-profiles.json, so a tuned winner is
    // written back as a profile without translation". For four of the six that used to be false:
    // `idleStageSchema` carried only `predictorHorizonS` and `predictorLearningRate`, so the other
    // four were rejected as unrecognized keys and an optimizer could sample all six through
    // `ArrivalModelOptions.idle`, find an optimum, and then be unable to write it down — invariant 8
    // met on 2 of 6 dimensions. This test was two: a pinned `{2 true, 4 false}` classification and
    // an `it.fails` stating what the answer should be. The four rows landed, so both collapse into
    // this one, which goes red if any of them is ever removed again.
    const authorable = (id: string): boolean =>
      dispatcherProfileSchema.safeParse({
        id: 'probe',
        name: 'Probe',
        weights: {},
        idle: { [id.slice('idle.'.length)]: PROBES[id] ?? 0 },
      }).success;

    const classified = Object.fromEntries(
      PREDICTOR_PARAMETERS.map((parameter) => [parameter.id, authorable(parameter.id)]),
    );
    expect(classified).toStrictEqual({
      'idle.predictorHorizonS': true,
      'idle.predictorLearningRate': true,
      'idle.predictorBucketWidthS': true,
      'idle.predictorCycleS': true,
      'idle.predictorPriorRatePerS': true,
      'idle.predictorPriorStrength': true,
    });

    // Still strict about everything else: the section admits the declared knobs and nothing more,
    // so a misspelled one is a load-time error rather than a silently defaulted dimension.
    const rejected = dispatcherProfileSchema.safeParse({
      id: 'probe',
      name: 'Probe',
      weights: {},
      idle: { predictorCycleSeconds: 3600 },
    });
    expect(rejected.success).toBe(false);
    expect(rejected.error?.issues[0]?.message).toMatch(/Unrecognized key/);
  });

  it('rejects at load time the learning rate the model rejects at build time', () => {
    // The same two files, a second disagreement, and it used to fail at *run* time rather than load
    // time: `predictorLearningRate` was typed `fraction` = `z.number().min(0).max(1)`, so a profile
    // authoring 0 loaded clean and then threw inside `createArrivalModel`. A config layer that
    // accepts a value the model refuses is a profile that can be committed and cannot be run.
    // `z.number().gt(0).max(1)` is the row that closed it; both halves are asserted here so neither
    // can drift back.
    const loaded = dispatcherProfileSchema.safeParse({
      id: 'probe',
      name: 'Probe',
      weights: {},
      idle: { predictorLearningRate: 0 },
    });
    expect(loaded.success).toBe(false);
    expect(() => resolvePredictorConfig({ predictorLearningRate: 0 })).toThrow(/never learn/);
    // And the top of the interval is still admitted: `1` is "forget everything but the last
    // bucket", which is a legitimate setting and not an error.
    expect(
      dispatcherProfileSchema.safeParse({
        id: 'probe',
        name: 'Probe',
        weights: {},
        idle: { predictorLearningRate: 1 },
      }).success,
    ).toBe(true);
    // The declared range starts at 0.01, so a schema-honouring optimizer never samples into the
    // gap. It is a hand-authored profile that falls in, which is why it is worth a test at all.
    expect(predictorParameter('idle.predictorLearningRate')?.range?.[0]).toBeGreaterThan(0);
  });

  it('has a probe for every declared parameter', () => {
    // Guards the test below: a parameter added without a probe would be silently unexercised.
    expect(Object.keys(PROBES).sort()).toStrictEqual(
      PREDICTOR_PARAMETERS.map((parameter) => parameter.id).sort(),
    );
  });

  it('reaches the field the model reads, for every parameter', () => {
    // The round trip an optimizer performs: write a sampled value into an `idle` section, build,
    // read it back. This is what makes invariant 8 checkable rather than aspirational.
    for (const parameter of PREDICTOR_PARAMETERS) {
      const key = parameter.id.slice('idle.'.length);
      const probe = PROBES[parameter.id] ?? 0;
      const idle = { [key]: probe } as PredictorIdleSource;

      const config = resolvePredictorConfig(idle);
      expect(predictorParameterValue(config, parameter.id), parameter.id).toBe(probe);
      expect(createArrivalModel({ floorIds: FLOORS, idle }).config, parameter.id).toStrictEqual(
        config,
      );
    }
  });

  it('changes a forecast — no parameter is a plateau by construction', () => {
    // The predictor-specific assertion. docs/03-traffic-and-statistics.md § flat plateaus measured
    // that a weight perturbation below a decision-flip threshold produces a *bit-identical* run,
    // so a dimension that cannot move the forecast is worse than useless to a search: the
    // optimizer cannot distinguish "no effect" from "effect below the noise floor" and will report
    // a winner either way.
    //
    // Same observations for every candidate, one parameter moved at a time.
    //
    // The probe set reaches past one cycle so that `idle.predictorCycleS` is exercised even at a
    // probe of 3600 s. It is *not* true that the parameter is inert inside a single cycle — the test
    // below measures a 30% spread across its declared range on a 30-minute replication, and the
    // claim that it was a plateau lived in this comment and in the parameter's description for
    // exactly as long as nothing checked it.
    const observe = (idle: PredictorIdleSource | undefined): readonly number[] => {
      const predictor = createArrivalModel(
        idle === undefined ? { floorIds: FLOORS } : { floorIds: FLOORS, idle },
      );
      for (let at = 0; at < 1800; at += 7) {
        predictor.observe(at % 2 === 0 ? '5' : '2', at % 3 === 0 ? 'down' : 'up', at);
      }
      return [
        predictor.forecast('5', 'up', 1800),
        predictor.forecast('2', 'down', 1800),
        predictor.forecast('5', 'up', 2400, 300),
        // Past one cycle of the probe value, so `predictorCycleS` is exercised at all.
        predictor.forecast('5', 'up', 3900, 300),
        ...[...predictor.expectedDemandByFloor(1800, 300).values()],
      ];
    };

    const baseline = observe(undefined);
    for (const parameter of PREDICTOR_PARAMETERS) {
      const key = parameter.id.slice('idle.'.length);
      const probe = PROBES[parameter.id] ?? 0;
      const moved = observe({ [key]: probe } as PredictorIdleSource);
      expect(moved, parameter.id).not.toStrictEqual(baseline);
    }
  });

  it('idle.predictorCycleS is live below the run length, not the plateau it was described as', () => {
    // The parameter's description used to tell a Phase 7 optimizer that "on a 30-minute replication
    // no value of this parameter changes any forecast" and to "not spend a search budget on this
    // dimension". False for every value in the declared range [600, 86 400] below the run length,
    // and not by a little. Measured here, on 30 minutes of identical observations, reading floor 5:
    //
    //   600 -> 13.742   900 -> 11.797   1200 -> 10.650   1500 -> 10.550
    //   1800 -> 10.650  2400 -> 12.674  3600 -> 12.674   86 400 -> 12.674
    //
    // A 30% spread. The mechanism is the one the module relies on elsewhere (arrivalModel.test.ts
    // "discriminates by time of day once a bucket has come round again"): with the cycle shorter
    // than the run, a bucket-of-day recurs *inside* the replication and the per-cell EWMA does
    // accumulate. An optimizer honouring the old guidance would leave a live 30%-effect dimension
    // unsearched on this project's primary regime and report a winner optimal only at 86 400 — a
    // hidden knob arrived at by an explicit instruction not to look.
    // Twenty floors, so the figures above are the ones this code reproduces: the building level is
    // an average over cells, so the cell count is part of the arithmetic.
    const tower: readonly string[] = Array.from({ length: 20 }, (_, index) => String(index + 1));
    const read = (cycleS: number): number => {
      const predictor = createArrivalModel({ floorIds: tower, idle: { predictorCycleS: cycleS } });
      for (let at = 0; at < 1800; at += 7) {
        predictor.observe(at % 2 === 0 ? '5' : '2', at % 3 === 0 ? 'down' : 'up', at);
      }
      return predictor.expectedDemandByFloor(1800, 300).get('5') ?? 0;
    };

    const shortCycles = [600, 900, 1200, 1500, 1800] as const;
    const reference = read(86_400);
    for (const cycleS of shortCycles) {
      // Not "close to different": each one must move the forecast.
      expect(read(cycleS), `predictorCycleS ${String(cycleS)}`).not.toStrictEqual(reference);
    }

    const values = [...shortCycles.map(read), reference];
    const spread = Math.max(...values) / Math.min(...values) - 1;
    expect(spread).toBeGreaterThan(0.25);
    // The exact figures in the comment above, so a future change to the estimator that quietly
    // flattens this dimension shows up here rather than in a tuning report.
    expect(read(600)).toBeCloseTo(13.742, 3);
    expect(read(1500)).toBeCloseTo(10.55, 3);
    expect(reference).toBeCloseTo(12.674, 3);

    // The other direction, so the corrected claim is pinned too: once the cycle exceeds the whole
    // span observed and queried (1800 s of arrivals plus a 300 s horizon), no bucket-of-day recurs
    // and the parameter really is inert — bit-identical, not merely close.
    expect(read(2400)).toBe(reference);
    expect(read(3600)).toBe(reference);
    // 1800 is *not* in that set, which is why "inert on a 30-minute run" was the wrong phrasing:
    // the query at t = 1800 is bucket 0 of the second cycle, so the cell has already come round.
    expect(read(1800)).not.toBe(reference);
  });

  it('idle.predictorPriorRatePerS shapes the forecast, so the description may not call it inert', () => {
    // The second false inertness claim in this file, and the same class of error as the one above.
    // The description said the uniform prior "cancels out of the comparisons the repositioning
    // stage makes". True of the *argmax* — which is all `parkingStrategy: predicted-demand` reads
    // when it picks a target — and false of everything else stage 7 computes:
    // `lifecycle.ts → expectedResponseSeconds` takes a **demand-weighted mean** of the response
    // time from a candidate park to every served floor, so a uniform additive term changes the
    // weights that mean averages over, and the deadband comparison moves with it.
    //
    // Measured here as the ratio between the busiest landing and a quiet one, which is the shape
    // the weighting actually sees. An optimizer told this dimension was inert would leave it at
    // whatever the default happened to be and report a winner optimal only there.
    const tower: readonly string[] = Array.from({ length: 20 }, (_, index) => String(index + 1));
    const shape = (rate: number): { busiest: number; quiet: number } => {
      const predictor = createArrivalModel({
        floorIds: tower,
        idle: { predictorPriorRatePerS: rate },
      });
      for (let at = 0; at < 1800; at += 7) {
        predictor.observe(at % 2 === 0 ? '5' : '2', at % 3 === 0 ? 'down' : 'up', at);
      }
      const forecast = predictor.expectedDemandByFloor(1800, 300);
      return { busiest: forecast.get('5') ?? 0, quiet: forecast.get('1') ?? 0 };
    };

    const ratio = (rate: number): number => {
      const { busiest, quiet } = shape(rate);
      return busiest / quiet;
    };
    // 27.6 → 14.6 → 2.3 across the declared range [0, 0.1]. Not a rounding difference.
    expect(ratio(0)).toBeCloseTo(27.557, 2);
    expect(ratio(PREDICTOR_DEFAULTS.predictorPriorRatePerS)).toBeCloseTo(14.627, 2);
    expect(ratio(0.1)).toBeCloseTo(2.329, 2);
    expect(ratio(0) / ratio(0.1)).toBeGreaterThan(10);

    // And the description must not have quietly reverted to claiming otherwise. The word is what a
    // Phase 7 optimizer reads; there is no type that can check it, so a test does.
    const description = predictorParameter('idle.predictorPriorRatePerS')?.description ?? '';
    expect(description).not.toMatch(/cancels out/);
    expect(description).toMatch(/NOT inert/);
  });

  it('idle.predictorHorizonS is a pure scalar on the forecast at the default cycle, and says so', () => {
    // Finding #9/#10, measured at the level the *consumers* read rather than at the level the
    // existing rows above read.
    //
    // `expectedDemandByFloor(t, H)` scales linearly with H, so reading a raw cell — which is what
    // `predictorCycleS` and `predictorPriorRatePerS` are measured by, two tests up — reports the
    // horizon as the most live row of the six. It is the least. All three consumers of the
    // forecast reduce it to a **scale-invariant** statistic: `expectedResponseSeconds` and
    // `demandMisalignmentM` are demand-weighted means and `parkingCandidates` is an argmax. So
    // the statistic to assert on is the *normalised shape*, and at the default cycle that shape
    // is identical for every horizon in the whole declared [30, 3600] range — a factor of 120.
    const tower: readonly string[] = Array.from({ length: 20 }, (_, index) => String(index + 1));
    const shape = (horizonS: number, cycleS: number): readonly number[] => {
      const predictor = createArrivalModel({ floorIds: tower, idle: { predictorCycleS: cycleS } });
      for (let at = 0; at < 1800; at += 7) {
        predictor.observe(at % 2 === 0 ? '5' : '2', at % 3 === 0 ? 'down' : 'up', at);
      }
      const forecast = predictor.expectedDemandByFloor(1800, horizonS);
      const values = tower.map((floorId) => forecast.get(floorId) ?? 0);
      const total = values.reduce((sum, value) => sum + value, 0);
      return values.map((value) => value / total);
    };

    const HORIZONS = [30, 120, 300, 900, 3600] as const;
    const atDefault = HORIZONS.map((horizonS) =>
      shape(horizonS, PREDICTOR_DEFAULTS.predictorCycleS),
    );
    for (const [index, normalised] of atDefault.entries()) {
      // Identical to 12 decimal places, per floor. The residual is float rounding in the 15th
      // significant figure of a division by a sum of 120x-larger terms — not an effect: a
      // difference an argmax could act on would be in the first two figures, and a demand
      // weighting that moved by 1e-15 moves no decision.
      const reference = atDefault[0] as readonly number[];
      for (const [floor, value] of normalised.entries()) {
        expect(
          value,
          `horizon ${String(HORIZONS[index])} at the default cycle, floor index ${String(floor)}`,
        ).toBeCloseTo(reference[floor] as number, 12);
      }
    }
    // The raw magnitudes do move, which is exactly why reading them would have reported the row
    // as the liveliest of the six.
    const raw = (horizonS: number): number =>
      createArrivalModel({ floorIds: tower }).expectedDemandByFloor(0, horizonS).get('5') ?? 0;
    expect(raw(3600) / raw(30)).toBeCloseTo(120, 6);

    // The other direction: at a short enough cycle a bucket-of-day recurs inside the run, the
    // window folds, and the shape moves with the horizon. So the dimension is conditional rather
    // than dead.
    const folded = HORIZONS.map((horizonS) => shape(horizonS, 600));
    expect(new Set(folded.map((values) => values.join(','))).size).toBeGreaterThan(1);

    /*
     * **And the row carries no `activeWhen`, which this test used to pin to `{ max: 1800 }`.**
     *
     * That bound was unsound in the direction the module docstring calls the worse of the two:
     * measured through real runs at seed 20260726, the horizon still produces 2 distinct
     * passenger-record trajectories on `secure-tower` at a cycle of **3600** — outside the gate,
     * where a generic optimizer had been told not to look. The condition is relational (a
     * bucket-of-day has to recur inside the window, roughly `horizon >= cycle`) and `activeWhen`
     * compares against constants, so no bound is correct for more than the single cycle it is
     * fitted to.
     *
     * Ungated, therefore, and the inertness at the shipped cycle is carried where it can be
     * falsified: `sim/searchSpaceLiveness.test.ts` holds it in `DECLARED_INERT`, whose entries
     * must execute the condition under which the dimension IS live. The same file now also
     * asserts that every surviving gate's gated-**off** region is flat, so this class of wrong
     * bound is a red test rather than a comment.
     */
    const horizon = predictorParameter('idle.predictorHorizonS');
    expect(horizon?.activeWhen).toBeUndefined();

    // The folding happens above 1800 too, which is the measurement that removed the bound.
    const above = HORIZONS.map((horizonS) => shape(horizonS, 3600));
    expect(
      new Set(above.map((values) => values.join(','))).size,
      'the forecast no longer folds at a 3600 s cycle, so the bound that was removed would have been sound after all',
    ).toBeGreaterThan(1);
  });
});

describe('PREDICTOR_DEFAULTS', () => {
  it('is the five-minute daily model, matching the profile in data/dispatcher-profiles.json', () => {
    // `predictive-balanced` authors `idle.predictorHorizonS: 300`. A default that disagreed with
    // the only profile shipping the value would make the profile's declaration look like a change
    // when it is a restatement.
    expect(PREDICTOR_DEFAULTS.predictorHorizonS).toBe(300);
    // The interval every elevator demand figure in `data/traffic-profiles.json` is quoted in.
    expect(PREDICTOR_DEFAULTS.predictorBucketWidthS).toBe(300);
    expect(PREDICTOR_DEFAULTS.predictorCycleS).toBe(24 * 60 * 60);
    // Fast enough to have moved inside a 30-minute replication: five completed buckets at an
    // effective memory of about 3.3 buckets.
    expect(1 / PREDICTOR_DEFAULTS.predictorLearningRate).toBeLessThan(
      1800 / PREDICTOR_DEFAULTS.predictorBucketWidthS,
    );
    // Non-zero, or the cold-start forecast is zero everywhere and reads as "no demand anywhere".
    expect(PREDICTOR_DEFAULTS.predictorPriorRatePerS).toBeGreaterThan(0);
  });
});
