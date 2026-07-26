import { describe, expect, it } from 'vitest';

import { StreamSet } from '../random/streams.js';

import { MetricsRecorder, type RecordablePassenger } from './recorder.js';
import { detectSaturation, queueLengthSeries, summarizeRun } from './summarize.js';
import {
  METRICS_SCHEMA_VERSION,
  SATURATION_DEFAULTS,
  type QueueSample,
  type ReportWindow,
  type RunRecord,
  type SaturationThresholds,
} from './types.js';

/**
 * Saturation detection, from docs/03-traffic-and-statistics.md:
 *
 * > If demand exceeds handling capacity, queues grow without bound and AWT is not remotely
 * > normal. [...] Detection: test for a positive trend in queue length across the run. If
 * > present, mark the result `SATURATED` and suppress the AWT confidence interval.
 *
 * The threshold is stated in `SaturationThresholds`: a fitted slope of at least **0.5
 * persons/minute** (a queue ~15 people longer at the end of the recommended 30-minute run)
 * *and* a slope t-statistic of at least 2. These tests pin both halves, and pin the cases the
 * rule must **not** fire on — a false SATURATED flag suppresses a perfectly good confidence
 * interval and is as damaging as a missed one.
 */

const WINDOW: ReportWindow = { id: 'run', startS: 0, endS: 1800 };

/** 60 samples across a 30-minute window, one every 30 s. */
function series(valueAt: (index: number) => number, count = 60, stepS = 30): QueueSample[] {
  return Array.from({ length: count }, (_, i) => ({ at: i * stepS, waiting: valueAt(i) }));
}

describe('detectSaturation — fires on a diverging queue', () => {
  it('flags a queue growing by one person every 30 seconds', () => {
    // waiting = i, sampled every 30 s: 1/30 persons per second = 2 persons per minute.
    const diagnosis = detectSaturation(series((i) => i), { window: WINDOW });

    expect(diagnosis.saturated).toBe(true);
    expect(diagnosis.verdict).toBe('diverging-queue');
    expect(diagnosis.slopePersonsPerMinute).toBeCloseTo(2, 12);
    expect(diagnosis.slopePersonsPerSecond).toBeCloseTo(1 / 30, 12);
    expect(diagnosis.projectedGrowthPersons).toBeCloseTo(60, 12);
    expect(diagnosis.rSquared).toBeCloseTo(1, 12);
    expect(diagnosis.interceptPersons).toBeCloseTo(0, 12);
    expect(diagnosis.maxQueueLength).toBe(59);
  });

  it('flags a noisy but unmistakably rising queue', () => {
    // 1 person/min plus a deterministic +-2 wobble.
    const wobble = [0, 2, -1, 1, -2];
    const diagnosis = detectSaturation(
      series((i) => i / 2 + (wobble[i % 5] as number)),
      { window: WINDOW },
    );
    expect(diagnosis.saturated).toBe(true);
    expect(diagnosis.slopePersonsPerMinute).toBeCloseTo(1, 1);
    expect(diagnosis.tStatistic).toBeGreaterThan(SATURATION_DEFAULTS.minTStatistic);
  });

  it('records the thresholds it applied, so a stored verdict can be re-derived', () => {
    const diagnosis = detectSaturation(series((i) => i), { window: WINDOW });
    expect(diagnosis.thresholds).toEqual(SATURATION_DEFAULTS);
    expect(diagnosis.windowStartS).toBe(0);
    expect(diagnosis.windowEndS).toBe(1800);
    expect(diagnosis.sampleCount).toBe(60);
  });
});

describe('detectSaturation — does not fire on a stable queue', () => {
  it('leaves an oscillating queue alone', () => {
    const cycle = [8, 12, 9, 11, 10];
    const diagnosis = detectSaturation(series((i) => cycle[i % 5] as number), { window: WINDOW });

    expect(diagnosis.saturated).toBe(false);
    expect(diagnosis.verdict).toBe('stable');
    expect(Math.abs(diagnosis.slopePersonsPerMinute)).toBeLessThan(
      SATURATION_DEFAULTS.minSlopePersonsPerMinute,
    );
    expect(diagnosis.meanQueueLength).toBeCloseTo(10, 12);
  });

  it('leaves a perfectly flat queue alone', () => {
    const diagnosis = detectSaturation(series(() => 4), { window: WINDOW });
    expect(diagnosis.saturated).toBe(false);
    expect(diagnosis.slopePersonsPerMinute).toBe(0);
    expect(diagnosis.tStatistic).toBe(0);
  });

  it('leaves a draining queue alone', () => {
    const diagnosis = detectSaturation(series((i) => 60 - i), { window: WINDOW });
    expect(diagnosis.saturated).toBe(false);
    expect(diagnosis.slopePersonsPerMinute).toBeLessThan(0);
  });

  it('leaves a rise slower than the magnitude threshold alone, however clean the fit', () => {
    // 0.2 persons/min: a perfect straight line, t-statistic infinite, and still not saturation.
    // This is the test that shows the magnitude gate — not the significance gate — is binding.
    const diagnosis = detectSaturation(series((i) => 10 + (i * 30) / 300), { window: WINDOW });

    expect(diagnosis.slopePersonsPerMinute).toBeCloseTo(0.2, 12);
    expect(diagnosis.tStatistic).toBeGreaterThan(1000);
    expect(diagnosis.saturated).toBe(false);
    expect(diagnosis.verdict).toBe('stable');
  });

  it('honours a retuned magnitude threshold', () => {
    // 0.2 persons/min over 1800 s is 6 people of backlog, so *both* magnitude gates have to
    // be relaxed for this to fire — which is the point of stating them in different units.
    const samples = series((i) => 10 + (i * 30) / 300);
    const strict = detectSaturation(samples, {
      window: WINDOW,
      thresholds: { minSlopePersonsPerMinute: 0.1, minProjectedGrowthPersons: 4 },
    });
    expect(strict.saturated).toBe(true);
    expect(strict.thresholds.minSlopePersonsPerMinute).toBe(0.1);
    expect(strict.thresholds.minProjectedGrowthPersons).toBe(4);

    // Relaxing only the rate leaves the person-denominated gate binding.
    expect(
      detectSaturation(samples, {
        window: WINDOW,
        thresholds: { minSlopePersonsPerMinute: 0.1 },
      }).saturated,
    ).toBe(false);
  });
});

describe('detectSaturation — refuses to guess', () => {
  it('reports insufficient samples rather than "stable" when there is too little data', () => {
    const diagnosis = detectSaturation(series((i) => i, 4), { window: WINDOW });
    expect(diagnosis.verdict).toBe('insufficient-samples');
    expect(diagnosis.saturated).toBe(false);
    expect(diagnosis.sampleCount).toBe(4);
    expect(diagnosis.slopePersonsPerMinute).toBeNaN();
  });

  it('reports source "none" when the window contains no samples at all', () => {
    const diagnosis = detectSaturation([], { window: WINDOW });
    expect(diagnosis.source).toBe('none');
    expect(diagnosis.meanQueueLength).toBeNaN();
  });

  it('ignores samples outside the window', () => {
    const inside = series((i) => i, 60);
    const outside = Array.from({ length: 20 }, (_, i) => ({ at: 2000 + i, waiting: 500 }));
    const diagnosis = detectSaturation([...inside, ...outside], { window: WINDOW });
    expect(diagnosis.sampleCount).toBe(60);
    expect(diagnosis.maxQueueLength).toBe(59);
  });
});

describe('detectSaturation — the window is part of the question', () => {
  /**
   * A rise-and-fall run: the queue climbs to a peak at t = 900 and drains back. Fitting the
   * whole run sees the template's own hump and reports no trend; fitting the rising half sees
   * a system that could not keep up while demand was climbing. Both answers are correct for
   * their window, which is exactly why the fit is scoped to the reporting window rather than
   * to "the run".
   */
  const riseAndFall = series((i) => (i < 30 ? i : 60 - i), 60);

  it('sees no trend across a symmetric rise and fall', () => {
    const diagnosis = detectSaturation(riseAndFall, { window: WINDOW });
    expect(diagnosis.saturated).toBe(false);
    expect(Math.abs(diagnosis.slopePersonsPerMinute)).toBeLessThan(0.1);
  });

  it('sees the divergence when scoped to the rising half', () => {
    const diagnosis = detectSaturation(riseAndFall, {
      window: { id: 'ramp', startS: 0, endS: 900 },
    });
    expect(diagnosis.saturated).toBe(true);
    expect(diagnosis.slopePersonsPerMinute).toBeCloseTo(2, 12);
    expect(diagnosis.sampleCount).toBe(30);
  });
});

/* -------------------------------------------------------------------------- *
 * The threshold has to survive noise, not just a clean line
 * -------------------------------------------------------------------------- */

/**
 * ## Regression: the magnitude gate is window-aware
 *
 * Every deterministic test above feeds `detectSaturation` a noise-free series over the full
 * 1800 s run, and none of them can see the defect this section exists for.
 *
 * `minSlopePersonsPerMinute` is 0.5 because the recommended rise-and-fall run is 30 minutes,
 * so 0.5/min is ~15 people of backlog the system never cleared. But `summarizeRun` fits the
 * trend over the **reporting window**, and `METRICS_PARAMETERS` defaults that to `peak-5min`.
 * Over 300 s the same rate is 2.5 people — well inside the sampling noise of a queue that is
 * not diverging at all — and the t-statistic gate cannot rescue it, because queue-length
 * residuals are autocorrelated and inflate `t`.
 *
 * The consequence was not cosmetic. Every false positive sets `awtIsValid: false`, and Phase 3
 * then either suppresses one good confidence interval in four or drops those replications —
 * which is selection on the outcome variable, since the runs whose queue happened to drift up
 * are exactly the runs with the longest waits, and it biases the surviving AWT low.
 *
 * These tests run a **stationary** queue (Poisson arrivals, i.i.d. exponential waits, so no
 * trend by construction) across many seeds and pin the false-positive rate. A deterministic
 * clean line cannot demonstrate this property.
 */

/** The rule as it stood before the window-aware and noise-aware gates were added. */
const RATE_ONLY_THRESHOLDS: Partial<SaturationThresholds> = {
  minProjectedGrowthPersons: 0,
  minGrowthToNoiseRatio: 0,
};

/**
 * One replication of a stationary queue, recorded exactly as the simulation would record it.
 *
 * Arrivals are Poisson at `arrivalsPerSecond` and each passenger's wait is exponential with
 * mean `meanWaitS`, drawn from named streams on a seeded `StreamSet` (invariant 2 — no global
 * RNG). Arrival rate and service behaviour are constant in time, so the expected queue length
 * is flat: any fitted trend is noise.
 */
function stationaryRun(
  seed: number,
  options: { arrivalsPerSecond: number; meanWaitS: number; horizonS: number; serviceRate?: number },
): RunRecord {
  const streams = new StreamSet(seed);
  const recorder = new MetricsRecorder({ seed: streams, runId: `stationary-${seed}` });

  let at = 0;
  let serverFreeAt = 0;
  let index = 0;
  for (;;) {
    at += streams.arrivals.exponential(options.arrivalsPerSecond);
    if (at >= options.horizonS) break;
    const id = `p${index}`;
    index += 1;
    recorder.recordArrival(passenger(id, at));

    let boardsAt: number;
    if (options.serviceRate === undefined) {
      boardsAt = at + streams.policyNoise.exponential(1 / options.meanWaitS);
    } else {
      // A FIFO server that cannot keep up: the queue grows without bound. Used for the power
      // check, so the fix is not merely "never flag anything".
      boardsAt = Math.max(at, serverFreeAt) + 1 / options.serviceRate;
      serverFreeAt = boardsAt;
    }
    if (boardsAt < options.horizonS) recorder.recordBoarding(id, boardsAt);
  }
  return recorder.finish(options.horizonS);
}

/** How many of `seeds` replications were flagged saturated over `window`. */
function flaggedCount(
  seeds: number,
  window: ReportWindow,
  run: (seed: number) => RunRecord,
  thresholds?: Partial<SaturationThresholds>,
): number {
  let flagged = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const summary = summarizeRun(run(seed), {
      window,
      ...(thresholds === undefined ? {} : { saturation: thresholds }),
    });
    if (summary.saturation.saturated) flagged += 1;
  }
  return flagged;
}

describe('detectSaturation — false-positive rate on a stationary stochastic queue', () => {
  const SEEDS = 200;
  const PEAK: ReportWindow = { id: 'peak-5min', startS: 500, endS: 800 };
  const stationary = (seed: number): RunRecord =>
    stationaryRun(seed, { arrivalsPerSecond: 0.5, meanWaitS: 20, horizonS: 900 });

  it('flags at most 2% of non-saturated runs over a 300 s reporting window', () => {
    // Measured 1/200 = 0.5% at the shipped defaults; the stated level is 2%.
    const flagged = flaggedCount(SEEDS, PEAK, stationary);
    expect(flagged / SEEDS).toBeLessThanOrEqual(0.02);
  });

  it('is the window-aware gate doing that: a rate-only rule flags more than one run in ten', () => {
    // Same data, same fit, gates 2 and 3 disabled — i.e. the rule as it was. Measured 39/200
    // = 19.5%, against 1/200 with them on. If this ever stops being a problem, the gates
    // below it have stopped doing anything.
    const rateOnly = flaggedCount(SEEDS, PEAK, stationary, RATE_ONLY_THRESHOLDS);
    expect(rateOnly / SEEDS).toBeGreaterThan(0.1);
    expect(flaggedCount(SEEDS, PEAK, stationary)).toBeLessThan(rateOnly);
  });

  it('was invisible over the 30-minute window the threshold was derived for', () => {
    // The reason the defect survived review: at 1800 s the rate gate needs 15 people of
    // growth, which the noise never supplies, so the old rule looked fine here.
    const full: ReportWindow = { id: 'full', startS: 0, endS: 1800 };
    const long = (seed: number): RunRecord =>
      stationaryRun(seed, { arrivalsPerSecond: 0.5, meanWaitS: 20, horizonS: 1900 });
    expect(flaggedCount(60, full, long, RATE_ONLY_THRESHOLDS)).toBe(0);
    expect(flaggedCount(60, full, long)).toBe(0);
  });

  it('still catches a queue that genuinely runs away inside the same 300 s window', () => {
    // Arrivals 0.5/s against a server that clears 0.4/s: the backlog grows ~6 persons/min,
    // 30 people across the window. Suppressing false positives must not cost the true ones.
    const diverging = (seed: number): RunRecord =>
      stationaryRun(seed, {
        arrivalsPerSecond: 0.5,
        meanWaitS: 20,
        horizonS: 900,
        serviceRate: 0.4,
      });
    // Measured 38/40 at the shipped defaults.
    expect(flaggedCount(40, PEAK, diverging) / 40).toBeGreaterThanOrEqual(0.9);
  });

  it('reports the evidence behind whichever gate bound', () => {
    const summary = summarizeRun(stationary(1), { window: PEAK });
    expect(summary.saturation.projectedGrowthPersons).toBeCloseTo(
      summary.saturation.slopePersonsPerSecond * 300,
      12,
    );
    expect(summary.saturation.growthToNoiseRatio).toBeCloseTo(
      summary.saturation.projectedGrowthPersons / summary.saturation.residualStdDevPersons,
      12,
    );
    expect(summary.saturation.thresholds.minProjectedGrowthPersons).toBe(
      SATURATION_DEFAULTS.minProjectedGrowthPersons,
    );
    expect(summary.saturation.thresholds.minGrowthToNoiseRatio).toBe(
      SATURATION_DEFAULTS.minGrowthToNoiseRatio,
    );
  });

  it('treats a noiseless fit as infinitely far above the noise rather than dividing by zero', () => {
    const clean = detectSaturation(series((i) => i), { window: WINDOW });
    expect(clean.residualStdDevPersons).toBeCloseTo(0, 9);
    expect(clean.growthToNoiseRatio).toBe(Number.POSITIVE_INFINITY);
    expect(clean.saturated).toBe(true);

    const flat = detectSaturation(series(() => 4), { window: WINDOW });
    expect(flat.growthToNoiseRatio).toBe(0);
    expect(flat.saturated).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * Derived series
 * -------------------------------------------------------------------------- */

function passenger(id: string, arrivedAt: number): RecordablePassenger {
  return {
    id,
    journeyId: id,
    legIndex: 0,
    isFinalLeg: true,
    originFloorId: 'G',
    destinationFloorId: '10',
    finalDestinationFloorId: '10',
    direction: 'up',
    massKg: 75,
    arrivedAt,
    journeyStartedAt: arrivedAt,
  };
}

/** 120 arrivals over ten minutes; `servedCount` of them ever board. */
function overloadedRecord(servedCount: number): RunRecord {
  const recorder = new MetricsRecorder({ seed: 11, runId: `served-${servedCount}` });
  for (let i = 0; i < 120; i += 1) {
    const id = `p${i}`;
    recorder.recordArrival(passenger(id, i * 5));
    if (i < servedCount) recorder.recordBoarding(id, i * 5 + 10);
  }
  return recorder.finish(700);
}

describe('queue length derived from the passenger records', () => {
  it('counts a passenger as waiting from arrival until boarding', () => {
    const record = overloadedRecord(120);
    const samples = queueLengthSeries(record.passengers, {
      window: { id: 'w', startS: 0, endS: 600 },
      intervalS: 100,
    });
    expect(samples).toHaveLength(6);
    // Arrivals every 5 s, each served 10 s later: a steady queue of about two people.
    for (const sample of samples.slice(1)) {
      expect(sample.waiting).toBeLessThanOrEqual(3);
    }
  });

  it('keeps an unserved passenger in the queue for the rest of the run', () => {
    const record = overloadedRecord(20);
    const samples = queueLengthSeries(record.passengers, {
      window: { id: 'w', startS: 0, endS: 600 },
      intervalS: 100,
    });
    expect(samples[samples.length - 1]?.waiting).toBeGreaterThan(80);
  });

  it('produces the requested number of samples regardless of window length', () => {
    const record = overloadedRecord(120);
    expect(
      queueLengthSeries(record.passengers, {
        window: { id: 'w', startS: 0, endS: 600 },
        sampleCount: 60,
      }),
    ).toHaveLength(60);
    expect(
      queueLengthSeries(record.passengers, {
        window: { id: 'w', startS: 0, endS: 137 },
        sampleCount: 60,
      }),
    ).toHaveLength(60);
  });
});

describe('summarizeRun — saturation suppresses the AWT', () => {
  it('flags a run whose queue diverges and says why', () => {
    const summary = summarizeRun(overloadedRecord(20));

    expect(summary.saturation.saturated).toBe(true);
    expect(summary.saturation.source).toBe('derived');
    expect(summary.saturation.slopePersonsPerMinute).toBeGreaterThan(
      SATURATION_DEFAULTS.minSlopePersonsPerMinute,
    );
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidReason).toMatch(/saturated/);
    // The mean is still reported — suppressing it entirely would hide the evidence — but it is
    // reported *marked invalid*.
    expect(Number.isFinite(summary.waiting.meanS)).toBe(true);
    expect(summary.counts.unserved).toBe(100);
  });

  it('does not flag a run that kept up with its demand', () => {
    const summary = summarizeRun(overloadedRecord(120));

    expect(summary.saturation.saturated).toBe(false);
    expect(summary.saturation.verdict).toBe('stable');
    expect(summary.awtIsValid).toBe(true);
    expect(summary.awtInvalidReason).toBeUndefined();
    expect(summary.waiting.meanS).toBeCloseTo(10, 12);
  });

  it('prefers recorded queue samples to a derived series', () => {
    const derived = overloadedRecord(20);
    const withRecorded: RunRecord = {
      ...derived,
      schemaVersion: METRICS_SCHEMA_VERSION,
      // The simulation says the landings were quiet — perhaps the unserved passengers left the
      // building. Recorded samples win *for the trend verdict*, because only the simulation
      // knows that.
      queueSamples: Array.from({ length: 20 }, (_, i) => ({ at: i * 30, waiting: 3 })),
    };

    const summary = summarizeRun(withRecorded);
    expect(summary.saturation.source).toBe('recorded');
    expect(summary.saturation.saturated).toBe(false);

    // But they cannot rehabilitate the mean. 100 of this window's 120 arrivals never boarded,
    // so AWT is the mean over the 20 fastest passengers in the run and is censored, whatever
    // the landings looked like. The censoring gate is independent of the trend test.
    expect(summary.counts.unserved).toBe(100);
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidReason).toMatch(/never served/);
    expect(summary.awtInvalidReason).toMatch(/83\.3%/);
  });

  it('falls back to the derived series when too few samples were recorded', () => {
    const derived = overloadedRecord(20);
    const withTooFew: RunRecord = {
      ...derived,
      queueSamples: [
        { at: 0, waiting: 0 },
        { at: 300, waiting: 1 },
      ],
    };
    expect(summarizeRun(withTooFew).saturation.source).toBe('derived');
  });

  it('passes retuned thresholds through to the diagnosis', () => {
    const summary = summarizeRun(overloadedRecord(20), {
      saturation: { minSlopePersonsPerMinute: 99 },
    });
    expect(summary.saturation.saturated).toBe(false);
    expect(summary.saturation.thresholds.minSlopePersonsPerMinute).toBe(99);
    // Still invalid, but now for the censoring reason rather than the trend one.
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidReason).toMatch(/never served/);
  });
});
