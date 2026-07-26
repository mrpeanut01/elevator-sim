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
  drawGeometricBatchSize,
  passengersPer5Min,
  passengersPerSecond,
  sampleBatchArrivalTimes,
} from './poissonBatch.js';
import { TrafficError } from './types.js';

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
