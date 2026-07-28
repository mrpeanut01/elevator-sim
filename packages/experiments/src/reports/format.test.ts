/**
 * The printed page — the last place a result can be misread.
 *
 * These assertions are deliberately about the *text*, not about the model behind it. A report whose
 * data model refuses to rank an indistinguishable pair, and whose formatter prints the two means
 * next to each other anyway, has failed in exactly the way this project is built to avoid: the
 * reader is not going to consult the model.
 */

import { describe, expect, it } from 'vitest';

import { buildCandidateReport, buildComparisonReport, compareCandidates } from './compare.js';
import { observation, observations } from './fixtures.test-helper.js';
import {
  SUPPRESSED_LABEL,
  formatCandidateComparison,
  formatCandidateReport,
  formatComparisonReport,
  formatConvergence,
  formatMeanEstimate,
  formatMetricComparison,
  formatNumber,
  formatSigned,
} from './format.js';
import { pairedDifferenceEstimate } from './statistics.js';
import type { ComparisonReport } from './types.js';

const SEEDS = [1, 2, 3, 4, 5, 6];

/**
 * The page with its line breaks and indentation collapsed to single spaces.
 *
 * Content assertions run against this; layout assertions (line length, label columns) run against
 * the raw text. Without the split a test for a sentence would be a test for where that sentence
 * happened to wrap, which would break on every wording change and prove nothing about the claim.
 */
const flat = (text: string): string => text.replace(/\s+/g, ' ');

/** A baseline and one candidate, both on the same six seeds. */
function reportOf(
  baselineAwt: readonly number[],
  candidateAwt: readonly number[],
  options: Parameters<typeof buildComparisonReport>[0]['options'] = {},
): ComparisonReport {
  return buildComparisonReport({
    title: 'Up-peak dispatchers — Garden Apartments',
    baseline: {
      candidateId: 'collective',
      observations: observations(baselineAwt, {}, SEEDS.slice(0, baselineAwt.length)),
    },
    candidates: [
      {
        candidateId: 'eta',
        observations: observations(candidateAwt, {}, SEEDS.slice(0, candidateAwt.length)),
      },
    ],
    options,
  });
}

/* -------------------------------------------------------------------------- *
 * Never a bare mean
 * -------------------------------------------------------------------------- */

describe('every mean is printed with its interval', () => {
  it('prints bounds, half-width, replication count and quantile family', () => {
    const report = buildCandidateReport('collective', observations([4.1, 5.0, 5.6, 7.4]));
    const text = formatCandidateReport(report);

    expect(flat(text)).toContain(
      'AWT (mean wait) 5.53 s · 95% CI [3.31, 7.74] · ±2.22 · n=4 · t(3)',
    );
  });

  it('has no metric line that carries a number without an interval', () => {
    const report = buildCandidateReport('collective', observations([4.1, 5.0, 5.6, 7.4, 6.2]));
    const text = formatCandidateReport(report);

    for (const line of text.split('\n')) {
      const isMetricLine = report.metrics.some((metric) => line.includes(metric.label));
      if (!isMetricLine) continue;
      // Either it carries an interval, or it says it is suppressed. There is no third form.
      expect(line.includes('CI [') || line.includes(SUPPRESSED_LABEL), line).toBe(true);
    }
  });

  it('says so when there is no interval rather than printing the mean alone', () => {
    const report = buildCandidateReport('collective', observations([5]));
    const text = formatCandidateReport(report);
    expect(text).toContain(SUPPRESSED_LABEL);
    expect(flat(text)).toMatch(/no measurable spread/);
    expect(text).not.toMatch(/5\.00 s/);
  });

  it('formats an estimate with no interval as such, not as a zero-width one', () => {
    const estimate = buildCandidateReport('a', observations([5])).metrics[0]?.estimate;
    expect(estimate).toBeUndefined();
    expect(formatMeanEstimate({ ...estimateStub, halfWidth: Number.NaN }, 2, 's')).toMatch(
      /no interval \(n=1\)/,
    );
  });

  it('names the family t(n−1) past n = 25, where it used to print "normal"', () => {
    // Review finding #14's second half: this line printed `normal` for an estimate that the page
    // header called a paired-t interval. Both are now true at once, and the printed family lets a
    // reader re-derive the printed half-width — t(25, .975) = 2.0595386.
    const estimate = pairedDifferenceEstimate(
      Array.from({ length: 26 }, (_, index) => index),
      Array.from({ length: 26 }, () => 0),
      { confidence: 0.95 },
    );
    const text = formatMeanEstimate(estimate, 3, 's');
    expect(text).toContain('n=26');
    expect(text).toContain('t(25)');
    expect(text).not.toContain('normal');
  });

  it('spells a normal-approximation estimate "normal(z)", so it cannot pass for a t interval', () => {
    // The arm is unreachable from this package's estimators now. It is kept explicit rather than
    // deleted so that a future or hand-built z estimate announces itself in the printed page.
    const text = formatMeanEstimate(
      { ...estimateStub, n: 30, stdDev: 1, standardError: 0.2, halfWidth: 0.39, lower: 4.61, upper: 5.39, method: 'z' as const, degreesOfFreedom: Number.NaN },
      2,
      's',
    );
    expect(text).toContain('normal(z)');
  });
});

const estimateStub = {
  n: 1,
  mean: 5,
  stdDev: Number.NaN,
  standardError: Number.NaN,
  confidence: 0.95,
  method: 't' as const,
  degreesOfFreedom: Number.NaN,
  halfWidth: Number.NaN,
  lower: Number.NaN,
  upper: Number.NaN,
  min: 5,
  max: 5,
};

/* -------------------------------------------------------------------------- *
 * Indistinguishable
 * -------------------------------------------------------------------------- */

describe('indistinguishable candidates are named as such', () => {
  it('says INDISTINGUISHABLE when the paired interval contains zero', () => {
    const same = [4.1, 5.0, 5.6, 7.4, 6.2, 4.8];
    const text = formatComparisonReport(reportOf(same, same));

    expect(text).toContain('INDISTINGUISHABLE');
    expect(flat(text)).toMatch(/contains zero/);
    expect(flat(text)).toMatch(/no rank order is reported/);
    // And no ranking language anywhere on the page.
    expect(text).not.toContain('is BETTER than');
    expect(text).not.toContain('is WORSE than');
  });

  it('states the noise floor beside the verdict', () => {
    // Large, inconsistent differences: the mean difference is small and the interval is wide.
    const baseline = [10, 10, 10, 10, 10, 10];
    const candidate = [4, 16, 5, 15, 6, 14];
    const text = formatComparisonReport(reportOf(baseline, candidate));

    expect(text).toContain('INDISTINGUISHABLE');
    expect(flat(text)).toMatch(/noise floor of ±\d+\.\d+ s/);
  });

  it('concludes that no candidate is distinguishable, rather than leaving the reader to rank', () => {
    const same = [4.1, 5.0, 5.6, 7.4, 6.2, 4.8];
    const text = formatComparisonReport(reportOf(same, same));
    expect(text).toMatch(/CONCLUSION/);
    expect(flat(text)).toMatch(/No candidate is distinguishable from collective on awt/);
    expect(flat(text)).toMatch(/would not be supported by the intervals/);
  });

  it('prints a rank order when, and only when, the interval excludes zero', () => {
    const baseline = [10, 11, 12, 13, 14, 15];
    const candidate = baseline.map((value) => value - 2);
    const text = formatComparisonReport(reportOf(baseline, candidate));

    expect(text).toContain('eta is BETTER than collective');
    expect(flat(text)).toMatch(/the interval excludes zero, so the difference is significant at 95%/);
    expect(flat(text)).toMatch(/difference −2\.00 s/);
    // The AWT verdict is a ranking, so no AWT line may also claim indistinguishability. The
    // saturation-neutral metrics that genuinely did not move still say so, which is correct.
    expect(flat(text)).not.toMatch(/AWT \(mean wait\) INDISTINGUISHABLE/);
    expect(flat(text)).toMatch(/1 of 1 candidates differ from collective on awt/);
  });
});

/* -------------------------------------------------------------------------- *
 * Saturation
 * -------------------------------------------------------------------------- */

describe('a saturated configuration is marked statistically invalid', () => {
  const saturated = [
    observation(1, {
      awtS: 300,
      saturated: true,
      awtIsValid: false,
      awtInvalidReason: 'Queue length rose by 601.7 persons over the 300 s reporting window',
    }),
    observation(2, { awtS: 310, saturated: true, awtIsValid: false, awtInvalidReason: 'Queue length rose by 588.1 persons' }),
    observation(3, { awtS: 295, saturated: true, awtIsValid: false, awtInvalidReason: 'Queue length rose by 610.0 persons' }),
  ];

  it('refuses to print a clean AWT, anywhere on the line or the page', () => {
    const report = buildCandidateReport('overloaded', saturated);
    const text = formatCandidateReport(report);

    expect(text).toContain('SATURATED');
    expect(text).toContain('STATISTICALLY INVALID');
    expect(flat(text)).toMatch(/AWT \(mean wait\) suppressed/);

    // The mean of 300, 310 and 295 is 301.67. It must not appear — not on the metric line, not in
    // parentheses, not "for reference". A number on the page is a number that gets quoted.
    expect(text).not.toContain('301.67');
    expect(text).not.toMatch(/AWT[^\n]*\d+\.\d+ s/);
  });

  it('suppresses every waiting-time metric but still prints throughput', () => {
    const text = flat(formatCandidateReport(buildCandidateReport('overloaded', saturated)));
    for (const label of ['AWT (mean wait)', 'WT95', '% waiting over threshold', 'TTD']) {
      expect(text, label).toMatch(new RegExp(`${escapeRegExp(label)}[^·]*${SUPPRESSED_LABEL}`));
    }
    expect(text).toMatch(/Handling capacity 60\.00 persons\/5min · 95% CI/);
  });

  it('reports the replication accounting that justifies the suppression', () => {
    const text = flat(formatCandidateReport(buildCandidateReport('overloaded', saturated)));
    expect(text).toMatch(/replications 3 stored, 0 usable, 3 saturated, 3 statistically invalid/);
  });

  it('prints NOT COMPARABLE instead of a ranking when a side is saturated', () => {
    const comparison = compareCandidates(
      { candidateId: 'collective', observations: observations([5, 6, 7], {}, [1, 2, 3]) },
      { candidateId: 'overloaded', observations: saturated },
    );
    const text = formatCandidateComparison(comparison);

    expect(text).toContain('NOT COMPARABLE');
    expect(flat(text)).toMatch(/statistically invalid/);
    expect(text).not.toContain('is BETTER than');
    expect(text).not.toContain('is WORSE than');
    // 400 s versus 6 s is an enormous apparent difference; none of it is reported.
    expect(text).not.toMatch(/difference [+−]\d/);
  });

  it('prints the saturation diagnosis once, and points the metric lines at it', () => {
    // Six metrics each repeating the same paragraph of queue diagnostics buries the six words that
    // matter. The reason appears once, on the status line; the data still carries it per metric.
    const report = buildCandidateReport('overloaded', saturated);
    const text = formatCandidateReport(report);
    const reason = 'Queue length rose by 601.7 persons';
    expect(flat(text).split(reason).length - 1).toBe(1);
    expect(flat(text)).toMatch(
      /AWT \(mean wait\) suppressed — the configuration is statistically invalid; see status above/,
    );
  });

  it('reports an unmeasurable half-width as unmeasurable, not as ±n/a', () => {
    // "±n/a" invites the reader to treat a suppressed metric as a very wide interval, which is a
    // different claim from having none.
    const report = buildCandidateReport('overloaded', saturated, {
      targetHalfWidth: 1,
      replicationCap: 3,
    });
    const text = flat(formatConvergence(report.convergence));
    expect(text).toMatch(/half-width is not measurable/);
    expect(text).not.toContain('±n/a');
  });

  it('concludes that nothing could be compared, rather than that nothing differed', () => {
    const report = buildComparisonReport({
      baseline: { candidateId: 'collective', observations: observations([5, 6, 7], {}, [1, 2, 3]) },
      candidates: [{ candidateId: 'overloaded', observations: saturated }],
    });
    const text = flat(formatComparisonReport(report));
    expect(text).toMatch(/The only comparison against collective on awt could not be made/);
    expect(text).toMatch(/Nothing is reported about relative performance/);
    expect(text).not.toMatch(/No candidate is distinguishable/);
  });

  it('notes saturated candidates at report level too', () => {
    const report = buildComparisonReport({
      baseline: { candidateId: 'collective', observations: observations([5, 6, 7], {}, [1, 2, 3]) },
      candidates: [{ candidateId: 'overloaded', observations: saturated }],
    });
    const text = formatComparisonReport(report);
    expect(text).toMatch(/NOTES/);
    expect(flat(text)).toMatch(/Saturated replications present in: overloaded/);
  });
});

/* -------------------------------------------------------------------------- *
 * Replications and convergence
 * -------------------------------------------------------------------------- */

describe('the replication count and stopping-rule state are always printed', () => {
  it('prints how many replications were used', () => {
    const text = flat(
      formatCandidateReport(buildCandidateReport('collective', observations([5, 6, 7]))),
    );
    expect(text).toMatch(/replications 3 stored, 3 usable, 0 saturated, 0 statistically invalid/);
  });

  it('says CONVERGED when the half-width met the target', () => {
    const report = buildCandidateReport('collective', observations([5, 5.1, 4.9, 5.05, 5.02]), {
      targetHalfWidth: 1,
      replicationCap: 200,
    });
    const text = flat(formatConvergence(report.convergence));
    expect(text).toMatch(/CONVERGED/);
    expect(text).toMatch(/met the ±1\.00 target after 5 replications \(cap 200\)/);
  });

  it('says HIT CAP when the budget ran out first, and says the interval is wider than asked for', () => {
    const report = buildCandidateReport('collective', observations([4, 6, 8, 10, 12]), {
      targetHalfWidth: 0.1,
      replicationCap: 5,
    });
    const text = flat(formatConvergence(report.convergence));
    expect(text).toMatch(/HIT CAP/);
    expect(text).toMatch(/5 replications \(cap 5\) without meeting the ±0\.10 target/);
    expect(text).toMatch(/measured less precisely than the experiment asked for/);
  });

  it('says IN PROGRESS when neither has happened yet', () => {
    const report = buildCandidateReport('collective', observations([4, 6, 8, 10, 12]), {
      targetHalfWidth: 0.1,
      replicationCap: 200,
    });
    expect(formatConvergence(report.convergence)).toMatch(/IN PROGRESS/);
  });

  it('says NOT ASSESSED rather than implying sufficiency when no target was given', () => {
    const report = buildCandidateReport('collective', observations([5, 6, 7]));
    const text = flat(formatConvergence(report.convergence));
    expect(text).toMatch(/NOT ASSESSED/);
    expect(text).toMatch(/cannot be called sufficient/);
  });

  it('prints the under-replication warning next to the numbers', () => {
    const text = flat(
      formatCandidateReport(buildCandidateReport('collective', observations([5, 6, 7]))),
    );
    expect(text).toMatch(/warning 3 replications is below the 50–200 budget/);
  });
});

/* -------------------------------------------------------------------------- *
 * Mechanics
 * -------------------------------------------------------------------------- */

describe('formatting mechanics', () => {
  it('formats absent measurements as n/a, not as zero', () => {
    expect(formatNumber(Number.NaN, 2)).toBe('n/a');
    expect(formatNumber(0, 2)).toBe('0.00');
    expect(formatSigned(Number.NaN, 2)).toBe('n/a');
  });

  it('always carries the sign of a difference', () => {
    expect(formatSigned(0.04, 2)).toBe('+0.04');
    expect(formatSigned(-0.04, 2)).toBe('−0.04');
    expect(formatSigned(0, 2)).toBe('+0.00');
  });

  it('is deterministic: the same report formats to the same bytes', () => {
    const report = reportOf([5, 6, 7, 8, 9, 10], [4, 5, 6, 7, 8, 9]);
    expect(formatComparisonReport(report)).toBe(formatComparisonReport(report));
  });

  it('states the method in the header, so the page cannot be quoted without it', () => {
    const text = flat(formatComparisonReport(reportOf([5, 6, 7], [5, 6, 7])));
    expect(text).toMatch(/95% confidence/);
    expect(text).toMatch(/paired-t intervals on per-replication differences over shared seeds/);
    expect(text).toMatch(/ranked only where the interval excludes zero/);
  });

  it('marks a partially paired comparison in its own heading', () => {
    const comparison = compareCandidates(
      { candidateId: 'collective', observations: observations([5, 6, 7, 8], {}, [1, 2, 3, 4]) },
      { candidateId: 'eta', observations: observations([4, 5, 6], {}, [2, 3, 9]) },
    );
    const text = formatCandidateComparison(comparison);
    expect(text).toContain('PARTIALLY PAIRED');
    expect(flat(text)).toMatch(/2 paired replications/);
  });

  it('wraps long text instead of running off the page', () => {
    const text = formatComparisonReport(
      reportOf([5, 6, 7], [5, 6, 7], { targetHalfWidth: 0.001, replicationCap: 3 }),
    );
    for (const line of text.split('\n')) {
      expect(line.length, line).toBeLessThanOrEqual(96);
    }
  });

  it('labels the baseline and the candidates', () => {
    const text = formatComparisonReport(reportOf([5, 6, 7], [5, 6, 7]));
    expect(text).toMatch(/BASELINE {2}collective/);
    expect(text).toMatch(/CANDIDATE {2}eta/);
  });

  it('formats one metric comparison on its own for embedding elsewhere', () => {
    const comparison = compareCandidates(
      { candidateId: 'collective', observations: observations([10, 11, 12, 13], {}, [1, 2, 3, 4]) },
      { candidateId: 'eta', observations: observations([8, 9, 10, 11], {}, [1, 2, 3, 4]) },
    );
    const awt = comparison.metrics.find((metric) => metric.metricId === 'awt');
    expect(awt).toBeDefined();
    if (awt === undefined) return;
    const text = formatMetricComparison(awt, 'eta', 'collective');
    expect(text).toContain('eta is BETTER than collective');
    expect(flat(text)).toMatch(/lower is better/);
  });
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
