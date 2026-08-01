/**
 * The rate conversion and the batch process.
 *
 * These are the quietest failure modes in the module. A factor-of-60 slip in
 * {@link passengersPerSecond} scales every result in the project without producing a single
 * error, and forgetting to divide the batch rate by the mean batch size inflates demand by
 * exactly the mean batch size — 40% for an office profile — while every trace still looks
 * entirely plausible. So both are exported functions with arithmetic tests of their own
 * rather than expressions buried in the generator.
 */

import { describe, expect, it } from 'vitest';

import { Pcg32 } from '../random/index.js';

import {
  SECONDS_PER_5MIN,
  batchesPerSecond,
  drawBatchSize,
  drawExplicitBatchSize,
  drawGeometricBatchSize,
  drawZeroTruncatedPoissonBatchSize,
  meanBatchSizeOf,
  passengersPer5Min,
  passengersPerSecond,
  sampleBatchArrivalTimes,
} from './poissonBatch.js';
import { SUPPORTED_BATCH_DISTRIBUTIONS, TrafficError } from './types.js';

const rng = (seed: number): Pcg32 => new Pcg32(seed, 1);

describe('arrival rate conversion', () => {
  it('turns percent of population per 5 minutes into passengers per second', () => {
    // The worked case: Midtown Office, 1710 occupants, office-standard at its typical 12%.
    expect(passengersPerSecond(12, 1710)).toBeCloseTo(0.684, 12);
    expect(passengersPer5Min(12, 1710)).toBeCloseTo(205.2, 9);
  });

  it('is exactly rate/100 * population / 300', () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [16, 1000, 160],
      [5, 120, 6],
      [12, 992, 119.04],
      [3, 500, 15],
      [0, 1710, 0],
    ];
    for (const [pct, population, per5Min] of cases) {
      expect(passengersPer5Min(pct, population)).toBeCloseTo(per5Min, 9);
      expect(passengersPerSecond(pct, population) * SECONDS_PER_5MIN).toBeCloseTo(per5Min, 9);
    }
  });

  it('uses a 300 second window, not 60', () => {
    // The specific slip this guards: treating "per 5 min" as "per minute".
    expect(SECONDS_PER_5MIN).toBe(300);
    expect(passengersPerSecond(12, 1710)).not.toBeCloseTo(12 / 100 * 1710 / 60, 6);
  });

  it('rejects a negative rate or population rather than returning an empty trace', () => {
    expect(() => passengersPerSecond(-1, 100)).toThrow(TrafficError);
    expect(() => passengersPerSecond(12, -1)).toThrow(TrafficError);
    expect(() => passengersPerSecond(Number.NaN, 100)).toThrow(TrafficError);
  });
});

describe('batch rate', () => {
  it('divides the passenger rate by the mean batch size', () => {
    expect(batchesPerSecond(0.684, 1.4)).toBeCloseTo(0.4885714285714286, 12);
  });

  it('round-trips: batches/second * mean batch size is the passenger rate', () => {
    for (const mean of [1, 1.4, 1.8, 2, 3.5]) {
      const passengers = passengersPerSecond(12, 1710);
      expect(batchesPerSecond(passengers, mean) * mean).toBeCloseTo(passengers, 12);
    }
  });

  it('refuses a mean below one, which is not a batch', () => {
    expect(() => batchesPerSecond(1, 0.9)).toThrow(TrafficError);
    expect(() => batchesPerSecond(1, 0)).toThrow(TrafficError);
  });
});

describe('geometric batch size', () => {
  it('has approximately the configured mean', () => {
    for (const mean of [1.4, 1.8, 2.0]) {
      const generator = rng(20260726);
      const draws = 200_000;
      let total = 0;
      for (let i = 0; i < draws; i += 1) total += drawGeometricBatchSize(generator, mean);
      // Standard error of the mean is sqrt(mean^2 - mean)/sqrt(n) ~ 0.003 at mean 2.
      expect(total / draws).toBeCloseTo(mean, 1);
      expect(Math.abs(total / draws - mean)).toBeLessThan(0.02);
    }
  });

  it('produces positive integers only', () => {
    const generator = rng(11);
    for (let i = 0; i < 5_000; i += 1) {
      const size = drawGeometricBatchSize(generator, 1.4);
      expect(Number.isInteger(size)).toBe(true);
      expect(size).toBeGreaterThanOrEqual(1);
    }
  });

  it('matches the shifted geometric probability mass function', () => {
    const mean = 1.4;
    const p = 1 / mean;
    const generator = rng(99);
    const draws = 200_000;
    const counts = new Map<number, number>();
    for (let i = 0; i < draws; i += 1) {
      const size = drawGeometricBatchSize(generator, mean);
      counts.set(size, (counts.get(size) ?? 0) + 1);
    }
    for (let k = 1; k <= 4; k += 1) {
      const expected = (1 - p) ** (k - 1) * p;
      expect((counts.get(k) ?? 0) / draws).toBeCloseTo(expected, 2);
    }
  });

  it('is degenerate at a mean of exactly 1', () => {
    const generator = rng(3);
    for (let i = 0; i < 1_000; i += 1) expect(drawGeometricBatchSize(generator, 1)).toBe(1);
  });

  it('consumes exactly one draw whatever the mean, so common random numbers stay in step', () => {
    // A sampler whose draw count depends on its parameters desynchronizes two configurations
    // the first time they differ in that parameter — the same reasoning behind Pcg32.bernoulli.
    const degenerate = rng(5);
    const heavy = rng(5);
    drawGeometricBatchSize(degenerate, 1);
    drawGeometricBatchSize(heavy, 6);
    expect(degenerate.getState()).toEqual(heavy.getState());
  });

  it('rejects an unsupported distribution by name rather than falling back to singles', () => {
    expect(() => drawBatchSize(rng(1), { distribution: 'poisson', mean: 2 })).toThrow(
      /Unsupported batch size distribution "poisson"/,
    );
  });

  it('samples the geometric distribution declared in config', () => {
    const a = rng(7);
    const b = rng(7);
    expect(drawBatchSize(a, { distribution: 'geometric', mean: 1.8 })).toBe(
      drawGeometricBatchSize(b, 1.8),
    );
  });
});

/* -------------------------------------------------------------------------- *
 * docs/14 § 2.2 — the group-size curve
 * -------------------------------------------------------------------------- */

/**
 * **The property `DECISIONS.md` § D203 says a future group-size sampler must not quietly break.**
 *
 * One draw per call, for every family and every parameter. § D203 records that the strong form of
 * the cross-source coupling `trafficModel: 'v2'` exists to remove *returns* the moment a sampler's
 * draw count becomes parameter-dependent — so this is the assertion that decides whether the
 * families below are available under `v1` as well as `v2`, and they are.
 *
 * Asserted on the generator's **state**, not on a counter: a sampler that drew twice and threw one
 * away would pass a call count and fail this.
 */
describe('every group-size family costs exactly one draw', () => {
  const CURVES = [
    { distribution: 'geometric', mean: 1 },
    { distribution: 'geometric', mean: 1.4 },
    { distribution: 'geometric', mean: 9 },
    { distribution: 'zeroTruncatedPoisson', mean: 1 },
    { distribution: 'zeroTruncatedPoisson', mean: 1.4 },
    { distribution: 'zeroTruncatedPoisson', mean: 9 },
    { distribution: 'explicit', weights: [1] },
    { distribution: 'explicit', weights: [0.6, 0.4] },
    { distribution: 'explicit', weights: [0, 0, 0, 0, 0, 0, 0, 1] },
  ] as const;

  it.each(CURVES.map((curve) => [JSON.stringify(curve), curve] as const))(
    '%s advances the stream by one uniform',
    (_name, curve) => {
      const drawing = rng(2026);
      const reference = rng(2026);
      for (let i = 0; i < 32; i += 1) {
        drawBatchSize(drawing, curve);
        reference.nextFloat();
      }
      expect(drawing.getState()).toEqual(reference.getState());
    },
  );

  it('costs the same draws whichever family is selected, at the same call count', () => {
    // The cross-family form of the same property: two configurations differing *only* in the
    // group-size family stay in step on the stream, which is what makes them a paired comparison.
    const states = CURVES.map((curve) => {
      const generator = rng(77);
      for (let i = 0; i < 40; i += 1) drawBatchSize(generator, curve);
      return generator.getState();
    });
    for (const state of states) expect(state).toEqual(states[0]);
  });
});

describe('zero-truncated Poisson batch size', () => {
  it('hits the requested mean, and clusters more tightly than the geometric at that mean', () => {
    const target = 3;
    const sample = (draw: (generator: Pcg32) => number): readonly number[] => {
      const generator = rng(515);
      return Array.from({ length: 40_000 }, () => draw(generator));
    };
    const poisson = sample((g) => drawZeroTruncatedPoissonBatchSize(g, target));
    const geometric = sample((g) => drawGeometricBatchSize(g, target));

    const meanOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    const sdOf = (xs: readonly number[]): number => {
      const m = meanOf(xs);
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
    };
    expect(meanOf(poisson)).toBeCloseTo(target, 1);
    // The whole reason it is offered: same first moment, much smaller spread. A geometric with
    // mean 3 puts a third of its mass on singles and has a long tail; this does neither.
    expect(sdOf(poisson)).toBeLessThan(sdOf(geometric) / 1.5);
    expect(Math.min(...poisson)).toBeGreaterThanOrEqual(1);
  });

  it('is degenerate at a mean of 1, and still draws', () => {
    const generator = rng(3);
    const reference = rng(3);
    expect(drawZeroTruncatedPoissonBatchSize(generator, 1)).toBe(1);
    reference.nextFloat();
    expect(generator.getState()).toEqual(reference.getState());
  });

  it('refuses a mean below one — a batch contains at least one passenger', () => {
    expect(() => drawZeroTruncatedPoissonBatchSize(rng(1), 0.5)).toThrow(TrafficError);
  });
});

describe('explicit batch size', () => {
  it('draws only the sizes the vector names, in the proportions it names them', () => {
    const generator = rng(88);
    const weights = [3, 1, 0, 6];
    const counts = [0, 0, 0, 0];
    const trials = 40_000;
    for (let i = 0; i < trials; i += 1) {
      const index = drawExplicitBatchSize(generator, weights) - 1;
      counts[index] = (counts[index] ?? 0) + 1;
    }

    expect(counts[2]).toBe(0);
    const total = weights.reduce((a, b) => a + b, 0);
    for (const [index, weight] of weights.entries()) {
      expect((counts[index] ?? 0) / trials).toBeCloseTo(weight / total, 2);
    }
  });

  it('derives the mean from the vector rather than taking one on trust', () => {
    // The rate coupling docs/14 § 2.2 warns about: `batchesPerSecond` divides by this number, so a
    // mean carried beside the weights could change total demand without changing any group.
    expect(meanBatchSizeOf({ distribution: 'explicit', weights: [3, 1] })).toBe(1.25);
    expect(meanBatchSizeOf({ distribution: 'explicit', weights: [0, 0, 0, 1] })).toBe(4);
    // Weights are relative: scaling the vector cannot move the mean.
    expect(meanBatchSizeOf({ distribution: 'explicit', weights: [30, 10] })).toBe(1.25);
    // And a carried mean is ignored rather than preferred, which is what makes it underivable.
    expect(meanBatchSizeOf({ distribution: 'explicit', weights: [0, 1], mean: 99 })).toBe(2);
  });

  it('refuses a vector that names no group', () => {
    expect(() => drawExplicitBatchSize(rng(1), [])).toThrow(/needs a weights vector/);
    expect(() => drawExplicitBatchSize(rng(1), [0, 0])).toThrow(/at least one group size/);
    expect(() => drawExplicitBatchSize(rng(1), [1, -1])).toThrow(/non-negative and finite/);
    expect(() => drawBatchSize(rng(1), { distribution: 'explicit' })).toThrow(
      /needs a weights vector/,
    );
  });

  it('refuses a mean-taking family that was given no mean', () => {
    expect(() => meanBatchSizeOf({ distribution: 'geometric' })).toThrow(/needs a mean/);
  });
});

describe('the supported-family list is the list the sampler dispatches on', () => {
  it('samples every declared family and refuses everything else', () => {
    // The list is what `TRAFFIC_PARAMETERS` declares to an optimizer, so a name on it the sampler
    // cannot draw is a search space with a hole in it, and a name off it that the sampler *can*
    // draw is a capability nothing can find.
    const curveFor = (distribution: string): Parameters<typeof drawBatchSize>[1] =>
      distribution === 'explicit'
        ? { distribution, weights: [1, 1] }
        : { distribution, mean: 2 };
    for (const distribution of SUPPORTED_BATCH_DISTRIBUTIONS) {
      expect(drawBatchSize(rng(4), curveFor(distribution)), distribution).toBeGreaterThanOrEqual(1);
    }
    expect(() => drawBatchSize(rng(1), curveFor('binomial'))).toThrow(
      /Unsupported batch size distribution "binomial"/,
    );
  });
});


describe('non-homogeneous batch arrivals', () => {
  const flat = (): number => 1;

  it('returns strictly increasing times inside the run', () => {
    const times = sampleBatchArrivalTimes({
      rng: rng(42),
      peakBatchesPerSecond: 0.5,
      durationS: 1800,
      intensityAt: flat,
    });
    expect(times.length).toBeGreaterThan(0);
    for (const [index, time] of times.entries()) {
      expect(time).toBeGreaterThanOrEqual(0);
      expect(time).toBeLessThan(1800);
      if (index > 0) expect(time).toBeGreaterThan(times[index - 1] as number);
    }
  });

  it('produces rate * duration batches at full intensity', () => {
    const generator = rng(1234);
    const runs = 200;
    let total = 0;
    for (let i = 0; i < runs; i += 1) {
      total += sampleBatchArrivalTimes({
        rng: generator,
        peakBatchesPerSecond: 0.5,
        durationS: 600,
        intensityAt: flat,
      }).length;
    }
    // Mean 300 per run, sd sqrt(300) ~ 17.3, so sem over 200 runs ~ 1.2.
    expect(total / runs).toBeGreaterThan(295);
    expect(total / runs).toBeLessThan(305);
  });

  it('halves the count when the intensity halves', () => {
    const generator = rng(555);
    const runs = 200;
    let total = 0;
    for (let i = 0; i < runs; i += 1) {
      total += sampleBatchArrivalTimes({
        rng: generator,
        peakBatchesPerSecond: 0.5,
        durationS: 600,
        intensityAt: () => 0.5,
      }).length;
    }
    expect(total / runs).toBeGreaterThan(145);
    expect(total / runs).toBeLessThan(155);
  });

  it('follows a time-varying intensity: a ramp puts two thirds of arrivals in the back half', () => {
    const generator = rng(2024);
    const durationS = 1000;
    let early = 0;
    let late = 0;
    for (let i = 0; i < 200; i += 1) {
      for (const time of sampleBatchArrivalTimes({
        rng: generator,
        peakBatchesPerSecond: 1,
        durationS,
        intensityAt: (t) => t / durationS,
      })) {
        if (time < durationS / 2) early += 1;
        else late += 1;
      }
    }
    // ∫t dt over the first half is 1/4 of the total, so the split is 1:3.
    expect(late / (early + late)).toBeCloseTo(0.75, 2);
  });

  it('generates nothing at zero rate, and consumes no draws doing it', () => {
    const generator = rng(8);
    const before = generator.getState();
    expect(
      sampleBatchArrivalTimes({
        rng: generator,
        peakBatchesPerSecond: 0,
        durationS: 1800,
        intensityAt: flat,
      }),
    ).toEqual([]);
    expect(generator.getState()).toEqual(before);
  });

  it('refuses an intensity above 1, which would silently lose arrivals', () => {
    // Thinning is only exact while the proposal rate is an upper bound. Clamping instead of
    // throwing would under-generate demand and look like a slow building.
    expect(() =>
      sampleBatchArrivalTimes({
        rng: rng(9),
        peakBatchesPerSecond: 1,
        durationS: 100,
        intensityAt: () => 1.5,
      }),
    ).toThrow(/must lie in \[0, 1\]/);
  });

  it('rejects a non-positive duration', () => {
    expect(() =>
      sampleBatchArrivalTimes({
        rng: rng(9),
        peakBatchesPerSecond: 1,
        durationS: 0,
        intensityAt: flat,
      }),
    ).toThrow(TrafficError);
  });

  it('is a pure function of the stream: same seed, same times', () => {
    const options = { peakBatchesPerSecond: 0.4, durationS: 900, intensityAt: flat };
    expect(sampleBatchArrivalTimes({ rng: rng(31), ...options })).toEqual(
      sampleBatchArrivalTimes({ rng: rng(31), ...options }),
    );
    expect(sampleBatchArrivalTimes({ rng: rng(31), ...options })).not.toEqual(
      sampleBatchArrivalTimes({ rng: rng(32), ...options }),
    );
  });
});
