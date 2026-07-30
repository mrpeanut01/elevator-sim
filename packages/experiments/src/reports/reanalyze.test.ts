/**
 * Re-analysis: the same data, asked the original question and then a different one.
 *
 * The first test in this file is the load-bearing one. docs/03-traffic-and-statistics.md § Part 5
 * asks for stored records so results can be "re-analyzed without re-simulating", and that is only
 * true if re-analysis reproduces the original headline numbers **exactly** — otherwise every stored
 * result silently belongs to a slightly different experiment from the freshly computed one, and no
 * comparison across the two means anything.
 *
 * Note what makes it non-trivial: `Simulation` summarizes with the building's entrance floors as
 * the achieved-interval terminals and with the window already resolved. A re-analysis that omitted
 * either would produce numbers that are *almost* the same, which is the hardest kind of wrong to
 * notice.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { runSimulation, summarizeRun, type LoadedConfig } from '@elevator-sim/core';

import { load, simulationConfig, storedRun } from './fixtures.test-helper.js';
import {
  createStoredRun,
  parseStoredRun,
  serializeStoredRun,
  summaryFingerprint,
} from './persistence.js';
import {
  groupByCandidate,
  observationOf,
  observationsOf,
  reanalyzeRunSet,
  reanalyzeStoredRun,
  reanalyzeVerified,
  summarizeOptionsFor,
  verifySummaryFingerprint,
} from './reanalyze.js';
import { ReportsError } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

/* -------------------------------------------------------------------------- *
 * Reproducing
 * -------------------------------------------------------------------------- */

describe('re-analysis reproduces the original summary exactly', () => {
  it('reproduces every field of a live run’s summary from the stored record', () => {
    const simConfig = simulationConfig(config, { seed: 20260726 });
    const result = runSimulation(simConfig);
    const stored = parseStoredRun(
      serializeStoredRun(
        createStoredRun({
          experimentId: 'reanalysis',
          experimentSeed: 1,
          replication: 0,
          config: simConfig,
          result,
        }),
      ),
    );

    const recomputed = reanalyzeStoredRun(stored);

    // Deep equality over the whole summary, not a spot check on AWT: `toEqual` treats NaN as equal
    // to NaN, which matters because "nobody was served" is a legitimate NaN in several fields.
    expect(recomputed).toEqual(result.summary);
    expect(summaryFingerprint(recomputed)).toBe(summaryFingerprint(result.summary));
    expect(summaryFingerprint(recomputed)).toBe(stored.summaryFingerprint);
  }, 60_000);

  it('reproduces it on a saturated building too, flag and reason included', () => {
    // Midtown Office at its own default demand saturates. The suppression verdict has to survive
    // re-analysis as well as the numbers, or a re-read result set would quietly report an AWT that
    // the original run refused to.
    const simConfig = simulationConfig(config, { seed: 4, buildingId: 'midtown-office' });
    const result = runSimulation(simConfig);
    const stored = createStoredRun({
      experimentId: 'reanalysis-saturated',
      experimentSeed: 1,
      replication: 0,
      config: simConfig,
      result,
    });

    const recomputed = reanalyzeStoredRun(parseStoredRun(serializeStoredRun(stored)));
    expect(recomputed).toEqual(result.summary);
    expect(recomputed.awtIsValid).toBe(result.summary.awtIsValid);
    expect(recomputed.awtInvalidReason).toBe(result.summary.awtInvalidReason);
    expect(recomputed.saturation.verdict).toBe(result.summary.saturation.verdict);
  }, 60_000);

  it('reproduces it across several buildings and dispatchers', () => {
    for (const buildingId of ['garden-apartments', 'midtown-office']) {
      for (const profileId of ['collective', 'nearest-car']) {
        const simConfig = simulationConfig(config, { seed: 99, buildingId, profileId });
        const result = runSimulation(simConfig);
        const stored = createStoredRun({
          experimentId: 'matrix',
          experimentSeed: 2,
          replication: 0,
          config: simConfig,
          result,
        });
        expect(
          reanalyzeStoredRun(stored),
          `${buildingId}/${profileId} did not re-analyse to its own summary`,
        ).toEqual(result.summary);
      }
    }
  }, 60_000);

  it('does not need the simulator: nothing but the stored record is consulted', () => {
    const stored = storedRun(config, { seed: 7 });
    // The same call `summarizeRun` would receive, reconstructed from the envelope alone.
    const options = summarizeOptionsFor(stored);
    expect(options.window).toEqual(stored.record.reportWindow);
    expect(options.terminalFloorIds).toEqual(['G']);
    expect(summarizeRun(stored.record, options)).toEqual(reanalyzeStoredRun(stored));
  });

  it('refuses at write time to store a record that would not re-analyse to its own summary', () => {
    // The one way the property could break: custom summarize options passed to `runSimulation` and
    // not to `createStoredRun`. Caught where it can still be fixed, rather than months later from a
    // result set that re-analyses to slightly different numbers.
    const simConfig = simulationConfig(config, {
      seed: 12,
      buildingId: 'midtown-office',
      overrides: { summarize: { longWaitThresholdS: 90, percentileMethod: 'nearest-rank' } },
    });
    const result = runSimulation(simConfig);

    expect(() =>
      createStoredRun({
        experimentId: 'forgot-the-options',
        experimentSeed: 1,
        replication: 0,
        config: simConfig,
        result,
      }),
    ).toThrow(/would not re-analyse to its own headline numbers/);

    // Passing them through stores a record that does reproduce — and only the overrides are needed,
    // because they are merged onto the reconstructed defaults the same way `Simulation` merges them.
    const stored = createStoredRun({
      experimentId: 'kept-the-options',
      experimentSeed: 1,
      replication: 0,
      config: simConfig,
      result,
      summarize: { longWaitThresholdS: 90, percentileMethod: 'nearest-rank' },
    });
    expect(stored.config.summarize?.window).toEqual(result.summary.window);
    expect(stored.config.summarize?.terminalFloorIds).toEqual(['P1', 'G']);
    expect(reanalyzeStoredRun(stored)).toEqual(result.summary);
  }, 60_000);

  it('lets a caller opt out of the write-time check, deliberately and explicitly', () => {
    const simConfig = simulationConfig(config, {
      seed: 13,
      overrides: { summarize: { longWaitThresholdS: 90 } },
    });
    const result = runSimulation(simConfig);
    const stored = createStoredRun({
      experimentId: 'opted-out',
      experimentSeed: 1,
      replication: 0,
      config: simConfig,
      result,
      verifySummary: false,
    });
    // The record is storable, and the mismatch it carries is still detectable afterwards rather
    // than invisible: the digest is the run's, the options are not.
    expect(stored.summaryFingerprint).toBe(summaryFingerprint(result.summary));
    expect(verifySummaryFingerprint(stored)).toBe(false);
  }, 60_000);

  it('falls back to the record’s own window when the envelope carries no options', () => {
    const stored = storedRun(config, { seed: 8 });
    const { summarize: _dropped, ...configWithout } = stored.config;
    const withoutOptions = { ...stored, config: configWithout };
    const options = summarizeOptionsFor(withoutOptions);
    expect(options.window).toEqual(stored.record.reportWindow);
    expect(reanalyzeStoredRun(withoutOptions).window).toEqual(stored.record.reportWindow);
  });
});

/* -------------------------------------------------------------------------- *
 * Re-asking
 * -------------------------------------------------------------------------- */

describe('re-analysis can ask a different question of the same data', () => {
  it('re-windows a stored run without re-simulating', () => {
    const stored = storedRun(config, { seed: 21 });
    const peak = reanalyzeStoredRun(stored);
    const whole = reanalyzeStoredRun(stored, { window: 'full-run' });

    expect(peak.window.id).toBe('peak-5min');
    expect(whole.window.id).toBe('full-run');
    expect(whole.windowSeconds).toBeGreaterThan(peak.windowSeconds);
    // The whole run contains more of the demand than its peak five minutes.
    expect(whole.counts.arrivals).toBeGreaterThan(peak.counts.arrivals);
  });

  it('re-thresholds the long-wait metric', () => {
    const stored = storedRun(config, { seed: 22, buildingId: 'midtown-office' });
    const sixty = reanalyzeStoredRun(stored);
    const ninety = reanalyzeStoredRun(stored, { longWaitThresholdS: 90 });

    expect(sixty.waiting.longWaitThresholdS).toBe(60);
    expect(ninety.waiting.longWaitThresholdS).toBe(90);
    expect(ninety.waiting.overLongWaitCount).toBeLessThanOrEqual(sixty.waiting.overLongWaitCount);
    // Same data, so the mean cannot have moved.
    expect(ninety.waiting.meanS).toBe(sixty.waiting.meanS);
  });

  it('re-percentiles without touching the mean', () => {
    const stored = storedRun(config, { seed: 23, buildingId: 'midtown-office' });
    const linear = reanalyzeStoredRun(stored);
    const nearest = reanalyzeStoredRun(stored, { percentileMethod: 'nearest-rank' });

    expect(linear.waiting.percentileMethod).toBe('linear');
    expect(nearest.waiting.percentileMethod).toBe('nearest-rank');
    expect(nearest.waiting.meanS).toBe(linear.waiting.meanS);
  });

  it('re-runs the saturation test at a different threshold', () => {
    const stored = storedRun(config, { seed: 24, buildingId: 'midtown-office' });
    const asRun = reanalyzeStoredRun(stored);
    expect(asRun.saturation.saturated).toBe(true);

    const lenient = reanalyzeStoredRun(stored, {
      saturation: { minProjectedGrowthPersons: 1e9 },
    });
    expect(lenient.saturation.saturated).toBe(false);
    // Re-asking is allowed to change the verdict — that is the point — but it must not be
    // mistakable for the stored one.
    expect(summaryFingerprint(lenient)).not.toBe(stored.summaryFingerprint);
  });

  it('ignores an override whose value is explicitly undefined', () => {
    const stored = storedRun(config, { seed: 25 });
    const recomputed = reanalyzeStoredRun(stored, { window: undefined, carIds: undefined });
    expect(recomputed).toEqual(reanalyzeStoredRun(stored));
  });

  it('re-analyses a whole set in order', () => {
    const records = [0, 1, 2].map((replication) =>
      storedRun(config, { seed: 300 + replication, replication }),
    );
    const summaries = reanalyzeRunSet(records);
    expect(summaries.map((summary) => summary.seed)).toEqual(['300', '301', '302']);
  });
});

/* -------------------------------------------------------------------------- *
 * Drift detection
 * -------------------------------------------------------------------------- */

describe('the stored digest detects a change in the derivation', () => {
  it('verifies a freshly stored record', () => {
    const stored = storedRun(config, { seed: 31 });
    expect(verifySummaryFingerprint(stored)).toBe(true);
    expect(() => reanalyzeVerified(stored)).not.toThrow();
  });

  it('reports unknown, not fine, when a record carries no digest', () => {
    const stored = storedRun(config, { seed: 32 });
    const { summaryFingerprint: _dropped, ...withoutDigest } = stored;
    expect(verifySummaryFingerprint(withoutDigest)).toBeUndefined();
    expect(() => reanalyzeVerified(withoutDigest)).not.toThrow();
  });

  it('fails loudly when the derivation no longer produces the stored numbers', () => {
    // Stands in for a metrics default moving in `core`: the data is identical, the summary is not.
    const stored = storedRun(config, { seed: 33 });
    const drifted = {
      ...stored,
      config: {
        ...stored.config,
        summarize: { ...stored.config.summarize, longWaitThresholdS: 45 },
      },
    };
    expect(verifySummaryFingerprint(drifted)).toBe(false);
    expect(() => reanalyzeVerified(drifted)).toThrow(ReportsError);
    expect(() => reanalyzeVerified(drifted)).toThrow(
      /derives a different summary from the one stored with it/,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Observations
 * -------------------------------------------------------------------------- */

describe('observations', () => {
  it('projects a summary onto the row a comparison consumes', () => {
    const stored = storedRun(config, { seed: 41 });
    const summary = reanalyzeStoredRun(stored);
    const observation = observationOf(summary);

    expect(observation.seed).toBe(stored.record.seed);
    expect(observation.awtS).toBe(summary.waiting.meanS);
    expect(observation.wt95S).toBe(summary.waiting.p95S);
    expect(observation.ttdS).toBe(summary.timeToDestination.meanS);
    expect(observation.personsPer5Min).toBe(summary.handlingCapacity.personsPer5Min);
    expect(observation.awtIsValid).toBe(summary.awtIsValid);
    expect(observation.saturated).toBe(summary.saturation.saturated);
  });

  it('carries the saturation verdict through, rather than repairing it', () => {
    const stored = storedRun(config, { seed: 42, buildingId: 'midtown-office' });
    const observation = observationOf(reanalyzeStoredRun(stored));
    expect(observation.saturated).toBe(true);
    expect(observation.awtIsValid).toBe(false);
    expect(observation.awtInvalidReason).toMatch(/saturated|never served/);
  });

  it('takes the replication index from the envelope, which always has one', () => {
    const records = [0, 1].map((replication) =>
      storedRun(config, { seed: 500 + replication, replication }),
    );
    const rows = observationsOf(records);
    expect(rows.map((row) => row.replication)).toEqual([0, 1]);
    expect(rows.map((row) => row.seed)).toEqual(['500', '501']);
  });

  it('groups a set by candidate in first-seen order', () => {
    const records = [
      storedRun(config, { seed: 1, candidateId: 'b' }),
      storedRun(config, { seed: 2, candidateId: 'a' }),
      storedRun(config, { seed: 3, candidateId: 'b' }),
    ];
    const grouped = groupByCandidate(records);
    expect([...grouped.keys()]).toEqual(['b', 'a']);
    expect(grouped.get('b')?.length).toBe(2);
    expect(grouped.get('a')?.length).toBe(1);
  });
});
