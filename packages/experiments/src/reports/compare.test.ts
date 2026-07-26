/**
 * What a comparison is allowed to claim.
 *
 * Mostly synthetic, deliberately: the statistical rules have to be checked against samples whose
 * answers are known in advance, and a simulation cannot supply "a difference of exactly −2 s on
 * every replication" or "a difference that is large and inconsistent". The last suite runs the real
 * simulator end to end, so the wiring from a stored result set to a report is exercised too.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '@elevator-sim/core';

import {
  HEADLINE_METRIC_ID,
  RECOMMENDED_MIN_REPLICATIONS,
  REPORT_METRICS,
  buildCandidateReport,
  buildComparisonReport,
  compareCandidates,
  comparisonReportFromRunSet,
} from './compare.js';
import { load, observation, observations, storedRun } from './fixtures.test-helper.js';
import { ReportsError, type CandidateReport, type MetricComparison } from './types.js';

const metric = (report: CandidateReport, metricId: string) => {
  const found = report.metrics.find((entry) => entry.metricId === metricId);
  if (found === undefined) throw new Error(`no metric "${metricId}"`);
  return found;
};

const comparisonOf = (
  metrics: readonly MetricComparison[],
  metricId: string,
): MetricComparison => {
  const found = metrics.find((entry) => entry.metricId === metricId);
  if (found === undefined) throw new Error(`no comparison for "${metricId}"`);
  return found;
};

/* -------------------------------------------------------------------------- *
 * Candidate reports
 * -------------------------------------------------------------------------- */

describe('a candidate report never carries a mean without an interval', () => {
  it('reports an interval for every metric it reports at all', () => {
    const report = buildCandidateReport('collective', observations([4.1, 5.0, 5.6, 7.4, 6.2]));

    expect(report.replications).toBe(5);
    expect(report.usableReplications).toBe(5);
    expect(report.statisticallyValid).toBe(true);
    for (const entry of report.metrics) {
      expect(entry.suppressed).toBe(false);
      expect(entry.estimate).toBeDefined();
      expect(Number.isFinite(entry.estimate?.halfWidth ?? Number.NaN)).toBe(true);
    }
    expect(metric(report, 'awt').estimate?.mean).toBeCloseTo(5.66, 9);
  });

  it('suppresses a metric measured on one replication rather than printing a bare mean', () => {
    const report = buildCandidateReport('collective', observations([5]));
    const awt = metric(report, 'awt');
    expect(awt.suppressed).toBe(true);
    expect(awt.suppressedReason).toMatch(/no measurable spread/);
    expect(awt.estimate).toBeUndefined();
  });

  it('suppresses a metric no replication produced', () => {
    const report = buildCandidateReport(
      'empty-window',
      observations([Number.NaN, Number.NaN], { served: 0 }),
    );
    expect(metric(report, 'awt').suppressed).toBe(true);
    expect(metric(report, 'awt').suppressedReason).toMatch(/no replication produced a value/);
  });

  it('warns when the replication budget is below the documented 50–200', () => {
    const report = buildCandidateReport('collective', observations([5, 6, 7]));
    expect(report.warnings.join(' ')).toMatch(
      new RegExp(`3 replications is below the ${RECOMMENDED_MIN_REPLICATIONS}–200 budget`),
    );
    expect(report.warnings.join(' ')).toMatch(/12% error/);
  });

  it('refuses two replications on one seed', () => {
    // Not a tolerable duplicate: the interval assumes independent replications, and the seed is the
    // pairing key for common random numbers.
    const duplicated = [observation('7'), observation('7')];
    expect(() => buildCandidateReport('collective', duplicated)).toThrow(ReportsError);
    expect(() => buildCandidateReport('collective', duplicated)).toThrow(
      /two replications on seed 7/,
    );
  });
});

describe('a saturated candidate is statistically invalid', () => {
  const saturatedSeries = [
    observation(1, { awtS: 300, saturated: true, awtIsValid: false, awtInvalidReason: 'Queue length rose by 601.7 persons' }),
    observation(2, { awtS: 310, saturated: true, awtIsValid: false, awtInvalidReason: 'Queue length rose by 588.1 persons' }),
    observation(3, { awtS: 295, saturated: true, awtIsValid: false, awtInvalidReason: 'Queue length rose by 610.0 persons' }),
  ];

  it('suppresses every waiting-time statistic and says why', () => {
    const report = buildCandidateReport('overloaded', saturatedSeries);
    expect(report.statisticallyValid).toBe(false);
    expect(report.saturatedReplications).toBe(3);
    expect(report.invalidReplications).toBe(3);
    expect(report.invalidReason).toMatch(/3 of 3 replications .* are statistically invalid/);
    expect(report.invalidReason).toMatch(/Queue length rose by 601.7 persons/);

    for (const metricId of ['awt', 'wt95', 'pctLongWait', 'ttd']) {
      expect(metric(report, metricId).suppressed, `${metricId} was not suppressed`).toBe(true);
      expect(metric(report, metricId).estimate).toBeUndefined();
    }
  });

  it('still reports throughput, which is the evidence of why it failed', () => {
    const report = buildCandidateReport('overloaded', saturatedSeries);
    expect(metric(report, 'capacity').suppressed).toBe(false);
    expect(metric(report, 'capacity').estimate?.mean).toBeCloseTo(60, 9);
  });

  it('invalidates the candidate on a single bad replication by default', () => {
    // Dropping the one saturated run is selection on the outcome variable: it is systematically the
    // worst run. The default therefore refuses to average the rest.
    const mostlyFine = [
      ...observations([5, 6, 7, 8], {}, [1, 2, 3, 4]),
      observation(5, { awtS: 300, saturated: true, awtIsValid: false }),
    ];
    const strict = buildCandidateReport('mixed', mostlyFine);
    expect(strict.statisticallyValid).toBe(false);
    expect(metric(strict, 'awt').suppressed).toBe(true);
  });

  it('counts and flags the exclusions when a caller raises the limit deliberately', () => {
    const mostlyFine = [
      ...observations([5, 6, 7, 8], {}, [1, 2, 3, 4]),
      observation(5, { awtS: 300, saturated: true, awtIsValid: false }),
    ];
    const lenient = buildCandidateReport('mixed', mostlyFine, { maxInvalidFraction: 0.25 });
    expect(lenient.statisticallyValid).toBe(true);
    const awt = metric(lenient, 'awt');
    expect(awt.suppressed).toBe(false);
    expect(awt.estimate?.n).toBe(4);
    expect(awt.excludedReplications).toBe(1);
    expect(lenient.warnings.join(' ')).toMatch(/biased in the favourable direction/);
  });
});

describe('convergence is reported as what it is', () => {
  const series = observations([5, 5.4, 4.8, 5.2, 5.1, 5.3]);

  it('is not assessed when no acceptable half-width was given', () => {
    const report = buildCandidateReport('collective', series);
    expect(report.convergence.status).toBe('not-assessed');
    expect(report.convergence.metricId).toBe(HEADLINE_METRIC_ID);
    expect(report.convergence.replications).toBe(6);
  });

  it('is converged when the half-width met the target', () => {
    const report = buildCandidateReport('collective', series, { targetHalfWidth: 1 });
    expect(report.convergence.status).toBe('converged');
    expect(report.convergence.achievedHalfWidth).toBeLessThan(1);
    expect(report.convergence.targetHalfWidth).toBe(1);
  });

  it('distinguishes hitting the cap from still running', () => {
    const capped = buildCandidateReport('collective', series, {
      targetHalfWidth: 0.01,
      replicationCap: 6,
    });
    expect(capped.convergence.status).toBe('hit-cap');
    expect(capped.convergence.replicationCap).toBe(6);

    const running = buildCandidateReport('collective', series, {
      targetHalfWidth: 0.01,
      replicationCap: 200,
    });
    expect(running.convergence.status).toBe('in-progress');
  });

  it('cannot be converged when the metric is suppressed', () => {
    const saturated = observations([300, 310], { saturated: true, awtIsValid: false });
    const report = buildCandidateReport('overloaded', saturated, { targetHalfWidth: 1 });
    expect(report.convergence.achievedHalfWidth).toBeNaN();
    expect(report.convergence.status).not.toBe('converged');
  });

  it('records which quantile family the half-width came from', () => {
    const small = buildCandidateReport('a', observations([1, 2, 3]));
    const large = buildCandidateReport(
      'b',
      observations(Array.from({ length: 30 }, (_, index) => 5 + index * 0.01)),
    );
    expect(small.convergence.method).toBe('t');
    expect(large.convergence.method).toBe('z');
  });
});

/* -------------------------------------------------------------------------- *
 * Paired comparisons
 * -------------------------------------------------------------------------- */

describe('a candidate compared against itself is indistinguishable', () => {
  it('produces a paired interval containing zero, not a tie', () => {
    // docs/05-roadmap.md § Phase 3 acceptance, first clause.
    const series = observations([4.1, 5.0, 5.6, 7.4, 6.2, 4.8]);
    const comparison = compareCandidates(
      { candidateId: 'collective', observations: series },
      { candidateId: 'collective-again', observations: series },
    );

    expect(comparison.valid).toBe(true);
    expect(comparison.crn).toBe(true);
    expect(comparison.pairedSeeds.length).toBe(6);

    const awt = comparisonOf(comparison.metrics, 'awt');
    expect(awt.verdict).toBe('indistinguishable');
    expect(awt.meanDifference).toBe(0);
    expect(awt.estimate?.lower).toBe(0);
    expect(awt.estimate?.upper).toBe(0);
    expect(awt.reason).toMatch(/contains zero/);
    expect(awt.reason).toMatch(/no rank order is reported/);
  });
});

describe('a difference is ranked only when the interval excludes zero', () => {
  it('ranks a consistently better candidate', () => {
    const baseline = observations([10, 11, 12, 13, 14, 15]);
    const candidate = baseline.map((entry) => observation(entry.seed, { awtS: entry.awtS - 2 }));
    const comparison = compareCandidates(
      { candidateId: 'collective', observations: baseline },
      { candidateId: 'eta', observations: candidate },
    );

    const awt = comparisonOf(comparison.metrics, 'awt');
    expect(awt.verdict).toBe('better');
    expect(awt.meanDifference).toBeCloseTo(-2, 9);
    expect(awt.estimate?.upper).toBeLessThan(0);
    expect(awt.pairs).toBe(6);
  });

  it('ranks a consistently worse candidate', () => {
    const baseline = observations([10, 11, 12, 13, 14, 15]);
    const candidate = baseline.map((entry) => observation(entry.seed, { awtS: entry.awtS + 3 }));
    const awt = comparisonOf(
      compareCandidates(
        { candidateId: 'collective', observations: baseline },
        { candidateId: 'crippled', observations: candidate },
      ).metrics,
      'awt',
    );
    expect(awt.verdict).toBe('worse');
    expect(awt.estimate?.lower).toBeGreaterThan(0);
  });

  it('refuses to rank a large but inconsistent difference', () => {
    // The documented failure mode: individual runs differ by up to 6 s and the true difference is
    // indistinguishable from zero. Ranking on the mean here is how "a faster lift increases waiting
    // time" gets published.
    const baseline = observations([10, 10, 10, 10, 10, 10]);
    const candidate = [4, 16, 5, 15, 6, 14].map((awtS, index) =>
      observation(index + 1, { awtS }),
    );
    const awt = comparisonOf(
      compareCandidates(
        { candidateId: 'collective', observations: baseline },
        { candidateId: 'noisy', observations: candidate },
      ).metrics,
      'awt',
    );
    expect(awt.verdict).toBe('indistinguishable');
    expect(awt.noiseFloor).toBeGreaterThan(Math.abs(awt.meanDifference));
    expect(awt.reason).toMatch(/noise floor/);
  });

  it('reads the direction of improvement from the metric, not the sign', () => {
    // Handling capacity is higher-is-better, so a positive difference is an improvement.
    const baseline = observations([10, 10, 10, 10], { personsPer5Min: 50 });
    const candidate = baseline.map((entry) =>
      observation(entry.seed, { awtS: entry.awtS, personsPer5Min: 62 }),
    );
    const metrics = compareCandidates(
      { candidateId: 'collective', observations: baseline },
      { candidateId: 'eta', observations: candidate },
    ).metrics;

    const capacity = comparisonOf(metrics, 'capacity');
    expect(capacity.direction).toBe('higher-is-better');
    expect(capacity.meanDifference).toBeCloseTo(12, 9);
    expect(capacity.verdict).toBe('better');
  });
});

describe('a comparison that is not supportable is refused', () => {
  it('refuses to compare candidates that share no seeds', () => {
    const comparison = compareCandidates(
      { candidateId: 'collective', observations: observations([5, 6, 7], {}, [1, 2, 3]) },
      { candidateId: 'eta', observations: observations([5, 6, 7], {}, [4, 5, 6]) },
    );
    expect(comparison.valid).toBe(false);
    expect(comparison.crn).toBe(false);
    expect(comparison.invalidReason).toMatch(/share no replication seeds/);
    expect(comparison.invalidReason).toMatch(/same passenger traces/);
    for (const entry of comparison.metrics) {
      expect(entry.verdict).toBe('invalid');
      expect(entry.estimate).toBeUndefined();
    }
  });

  it('refuses a single pair', () => {
    const comparison = compareCandidates(
      { candidateId: 'collective', observations: [observation(1, { awtS: 5 })] },
      { candidateId: 'eta', observations: [observation(1, { awtS: 3 })] },
    );
    expect(comparison.valid).toBe(false);
    expect(comparison.invalidReason).toMatch(/Only 1 paired replication/);
    expect(comparisonOf(comparison.metrics, 'awt').verdict).toBe('invalid');
  });

  it('refuses any ranking against a saturated side, however large the difference', () => {
    const baseline = observations([5, 6, 7, 8]);
    const saturated = baseline.map((entry) =>
      observation(entry.seed, { awtS: 400, saturated: true, awtIsValid: false }),
    );
    const comparison = compareCandidates(
      { candidateId: 'collective', observations: baseline },
      { candidateId: 'overloaded', observations: saturated },
    );
    expect(comparison.valid).toBe(false);
    expect(comparison.invalidReason).toMatch(/Candidate "overloaded" is statistically invalid/);
    expect(comparisonOf(comparison.metrics, 'awt').verdict).toBe('invalid');
    expect(comparisonOf(comparison.metrics, 'awt').estimate).toBeUndefined();
  });

  it('warns and keeps going when only some replications pair up', () => {
    const comparison = compareCandidates(
      { candidateId: 'collective', observations: observations([5, 6, 7, 8], {}, [1, 2, 3, 4]) },
      { candidateId: 'eta', observations: observations([4, 5, 6], {}, [2, 3, 9]) },
    );
    expect(comparison.pairedSeeds).toEqual(['2', '3']);
    expect(comparison.crn).toBe(false);
    expect(comparison.warnings.join(' ')).toMatch(/Only 2 of 4 baseline and 3 candidate/);
    expect(comparison.valid).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Whole reports
 * -------------------------------------------------------------------------- */

describe('a comparison report', () => {
  it('keeps candidates in the order supplied, never sorted by result', () => {
    const seeds = [1, 2, 3, 4];
    const report = buildComparisonReport({
      baseline: {
        candidateId: 'collective',
        observations: observations([10, 10, 10, 10], {}, seeds),
      },
      candidates: [
        { candidateId: 'worse', observations: observations([12, 12, 12, 12], {}, seeds) },
        { candidateId: 'better', observations: observations([8, 8, 8, 8], {}, seeds) },
      ],
    });
    expect(report.candidates.map((candidate) => candidate.candidateId)).toEqual([
      'worse',
      'better',
    ]);
    expect(report.comparisons.map((comparison) => comparison.candidateId)).toEqual([
      'worse',
      'better',
    ]);
  });

  it('notes indistinguishable candidates as a result rather than a gap', () => {
    const seeds = [1, 2, 3, 4, 5];
    const identical = observations([5, 6, 7, 8, 9], {}, seeds);
    const report = buildComparisonReport({
      baseline: { candidateId: 'collective', observations: identical },
      candidates: [{ candidateId: 'eta', observations: identical }],
    });
    expect(report.notes.join(' ')).toMatch(/could not be distinguished from the baseline/);
    expect(report.notes.join(' ')).toMatch(/is a result, not a missing one/);
  });

  it('notes the presence of saturated replications', () => {
    const seeds = [1, 2, 3];
    const report = buildComparisonReport({
      baseline: { candidateId: 'collective', observations: observations([5, 6, 7], {}, seeds) },
      candidates: [
        {
          candidateId: 'overloaded',
          observations: observations([400, 410, 420], { saturated: true, awtIsValid: false }, seeds),
        },
      ],
    });
    expect(report.notes.join(' ')).toMatch(/Saturated replications present in: overloaded/);
  });

  it('declares every metric in the table (invariant 7: metrics are data)', () => {
    const report = buildCandidateReport('collective', observations([5, 6, 7]));
    expect(report.metrics.map((entry) => entry.metricId)).toEqual(
      REPORT_METRICS.map((spec) => spec.id),
    );
    expect(REPORT_METRICS.map((spec) => spec.id)).toContain(HEADLINE_METRIC_ID);
  });

  it('reports only the metrics a caller asks for', () => {
    const only = REPORT_METRICS.filter((spec) => spec.id === 'wt95');
    const report = buildCandidateReport('collective', observations([5, 6, 7]), { metrics: only });
    expect(report.metrics.map((entry) => entry.metricId)).toEqual(['wt95']);
  });
});

/* -------------------------------------------------------------------------- *
 * End to end from a stored result set
 * -------------------------------------------------------------------------- */

describe('from a stored result set, with the real simulator', () => {
  let config: LoadedConfig;

  beforeAll(async () => {
    config = await load();
  });

  it('re-analyses, pairs on seeds, and compares two dispatchers on shared traces', () => {
    const seeds = [101, 102, 103, 104, 105, 106];
    const records = [
      ...seeds.map((seed, index) =>
        storedRun(config, { seed, replication: index, candidateId: 'collective' }),
      ),
      ...seeds.map((seed, index) =>
        storedRun(config, {
          seed,
          replication: index,
          profileId: 'nearest-car',
          candidateId: 'nearest-car',
        }),
      ),
    ];

    const report = comparisonReportFromRunSet(records, {
      baselineCandidateId: 'collective',
      targetHalfWidth: 2,
      replicationCap: 6,
      title: 'Garden Apartments up-peak',
    });

    expect(report.title).toBe('Garden Apartments up-peak');
    expect(report.baseline.candidateId).toBe('collective');
    expect(report.baseline.replications).toBe(6);
    expect(report.baseline.buildingId).toBe('garden-apartments');
    expect(report.candidates.map((candidate) => candidate.candidateId)).toEqual(['nearest-car']);

    const comparison = report.comparisons[0];
    expect(comparison).toBeDefined();
    if (comparison === undefined) return;

    // The same six seeds on both sides: common random numbers, which is what makes the paired
    // interval worth taking.
    expect(comparison.crn).toBe(true);
    expect(comparison.pairedSeeds).toEqual(seeds.map(String));

    const awt = comparisonOf(comparison.metrics, 'awt');
    expect(['better', 'worse', 'indistinguishable']).toContain(awt.verdict);
    expect(awt.pairs).toBe(6);
    expect(awt.estimate).toBeDefined();
    // Whatever the verdict, it has to follow from the interval and not from the means.
    if (awt.verdict === 'indistinguishable') {
      expect((awt.estimate?.lower ?? 1) <= 0 && (awt.estimate?.upper ?? -1) >= 0).toBe(true);
    } else {
      expect((awt.estimate?.lower ?? 0) > 0 || (awt.estimate?.upper ?? 0) < 0).toBe(true);
    }
  });

  it('compares a candidate against itself on the same stored traces and finds no difference', () => {
    const seeds = [201, 202, 203, 204];
    const records = [
      ...seeds.map((seed, index) =>
        storedRun(config, { seed, replication: index, candidateId: 'collective' }),
      ),
      ...seeds.map((seed, index) =>
        storedRun(config, { seed, replication: index, candidateId: 'collective-copy' }),
      ),
    ];
    const report = comparisonReportFromRunSet(records, {
      baselineCandidateId: 'collective',
    });
    const awt = comparisonOf(
      (report.comparisons[0] ?? { metrics: [] }).metrics,
      'awt',
    );
    expect(awt.verdict).toBe('indistinguishable');
    expect(awt.meanDifference).toBe(0);
    expect(awt.noiseFloor).toBe(0);
  });

  it('refuses a baseline that is not in the set', () => {
    const records = [storedRun(config, { seed: 301, candidateId: 'collective' })];
    expect(() => comparisonReportFromRunSet(records, { baselineCandidateId: 'absent' })).toThrow(
      /baseline candidate "absent" is not in the result set/,
    );
    expect(() => comparisonReportFromRunSet([])).toThrow(/the result set is empty/);
  });

  it('applies re-analysis overrides identically to every candidate', () => {
    const seeds = [401, 402, 403];
    const records = [
      ...seeds.map((seed) => storedRun(config, { seed, candidateId: 'a' })),
      ...seeds.map((seed) => storedRun(config, { seed, candidateId: 'b' })),
    ];
    const peak = comparisonReportFromRunSet(records, { baselineCandidateId: 'a' });
    const whole = comparisonReportFromRunSet(records, {
      baselineCandidateId: 'a',
      overrides: { window: 'full-run' },
    });
    // Re-windowing changes the numbers; asking the two candidates *different* questions would be a
    // subtler version of the error the paired interval exists to prevent, so there is no per-
    // candidate override.
    expect(metric(whole.baseline, 'awt').estimate?.mean).not.toBe(
      metric(peak.baseline, 'awt').estimate?.mean,
    );
    expect(whole.comparisons[0]?.crn).toBe(true);
  });
});
