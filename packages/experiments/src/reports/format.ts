/**
 * Human-readable output — the last place a result can be misread, and therefore the place the
 * project's central failure mode has to be closed off for good.
 *
 * ```
 * Up-peak dispatchers — Garden Apartments
 * 95% confidence, paired-t on differences, common random numbers
 *
 * BASELINE  collective
 *   replications        12 stored, 12 usable, 0 saturated, 0 statistically invalid
 *   convergence         IN PROGRESS — half-width 1.31 s exceeds the 1.00 s target (awt, 95%)
 *   AWT (mean wait)     8.47 s   95% CI [7.16, 9.78]   ±1.31, n=12, t(11)
 *   …
 *
 * eta vs collective — 12 paired replications, common random numbers
 *   AWT (mean wait)     INDISTINGUISHABLE   difference −0.02 s, 95% CI [−0.31, +0.27]
 *                       the 95% paired interval on the difference contains zero; the
 *                       difference is below this experiment's noise floor of ±0.29 s, so no
 *                       rank order is reported
 * ```
 *
 * ## What the formatter refuses to print
 *
 * - **A bare mean.** {@link formatMeanEstimate} always prints the interval, the half-width, the
 *   replication count and which quantile family produced it. There is no code path that prints a
 *   mean alone, because a mean alone is the form in which noise gets published as a finding.
 * - **A clean AWT for a saturated configuration.** A suppressed metric prints the word
 *   `suppressed` and the reason. The number is not printed anywhere on the line — not in
 *   parentheses, not as "for reference" — because a number on the page is a number that gets
 *   quoted.
 * - **A rank order the interval does not support.** `indistinguishable` is printed in capitals
 *   with the noise floor beside it, and `NOT COMPARABLE` where a side is invalid. Neither is
 *   rendered as a near-miss or a tie: the point is that the experiment could not tell, and that
 *   is a result.
 *
 * ## Presentation choices that are not cosmetic
 *
 * Candidates print in the order supplied, never sorted by result — sorting a table by outcome *is*
 * a rank order. Signed differences carry an explicit `+` or `−` so the direction is unmistakable at
 * a glance, and every metric line states which direction is better. Nothing here reads a clock or a
 * locale: the output of two runs on the same report is byte-identical, which is what makes it
 * diffable in a regression test.
 */

import { HEADLINE_METRIC_ID } from './compare.js';
import type {
  CandidateComparison,
  CandidateReport,
  ComparisonReport,
  ConvergenceReport,
  MeanEstimate,
  MetricComparison,
  MetricEstimate,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Layout
 * -------------------------------------------------------------------------- */

const LINE_WIDTH = 96;
const LABEL_WIDTH = 26;
const INDENT = '  ';

/**
 * Separator between the parts of a value.
 *
 * A visible mark rather than a run of spaces, because every value goes through {@link wrap}, which
 * normalizes whitespace — column alignment inside a wrapped value cannot survive and pretending
 * otherwise produces a page that is aligned until the first long line and ragged afterwards.
 */
const PART = ' · ';

/** The word a reader greps for. Suppression is always explicit, never an empty cell. */
export const SUPPRESSED_LABEL = 'suppressed';

/* -------------------------------------------------------------------------- *
 * Numbers
 * -------------------------------------------------------------------------- */

/**
 * A number at a fixed precision, or `n/a` when there is genuinely no value.
 *
 * Negatives carry a typographic minus (`−`), matching {@link formatSigned}. One page mixing `-2.44`
 * in an interval with `−2.50` in a difference reads as two different quantities.
 */
export function formatNumber(value: number, precision: number): string {
  if (Number.isNaN(value)) return 'n/a';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  return value < 0 ? `−${Math.abs(value).toFixed(precision)}` : value.toFixed(precision);
}

/**
 * A signed number, always carrying its sign.
 *
 * `+0.04` rather than `0.04`, and a true minus sign rather than a hyphen, because the sign of a
 * difference is the part a reader acts on and `-0.04` in a column of numbers is easy to lose.
 */
export function formatSigned(value: number, precision: number): string {
  if (Number.isNaN(value)) return 'n/a';
  const text = Math.abs(value).toFixed(precision);
  return value < 0 ? `−${text}` : `+${text}`;
}

/**
 * A mean with its interval. **The only way this module prints a mean.**
 *
 * The half-width is printed as well as the bounds, because it is the quantity the sequential
 * stopping rule and the noise floor are both stated in, and `n` and the quantile family are printed
 * so a reader can re-derive the interval by hand — which someone eventually will.
 *
 * ## The family label is load-bearing
 *
 * Every interval this module receives from `estimateMean`/`pairedDifferenceEstimate` is Student-t
 * at `n − 1`, so the label reads `t(df)` at every `n` and a reader who multiplies `t(df)` by
 * `halfWidth/quantile` gets the printed bounds back. It did not always: review finding #14 found
 * this function printing `normal` for an interval that the page header two sections down called a
 * paired-t interval, because the estimator silently switched families above n=25.
 *
 * The `'z'` arm below is therefore no longer reachable from any estimator in this package, and is
 * kept — spelled `normal(z)`, never bare — precisely so that a hand-built or future
 * normal-approximation estimate announces itself instead of hiding behind a `t`-shaped label.
 */
export function formatMeanEstimate(
  estimate: MeanEstimate,
  precision: number,
  unit: string,
): string {
  const suffix = unit === '' ? '' : ` ${unit}`;
  const mean = `${formatNumber(estimate.mean, precision)}${suffix}`;
  if (!Number.isFinite(estimate.halfWidth)) {
    return `${mean}${PART}no interval (n=${estimate.n})`;
  }
  const level = `${(estimate.confidence * 100).toFixed(0)}%`;
  const bounds = `[${formatNumber(estimate.lower, precision)}, ${formatNumber(estimate.upper, precision)}]`;
  const family =
    estimate.method === 't' ? `t(${formatNumber(estimate.degreesOfFreedom, 0)})` : 'normal(z)';
  return [
    mean,
    `${level} CI ${bounds}`,
    `±${formatNumber(estimate.halfWidth, precision)}`,
    `n=${estimate.n}`,
    family,
  ].join(PART);
}

/* -------------------------------------------------------------------------- *
 * Candidate reports
 * -------------------------------------------------------------------------- */

/**
 * One metric of one candidate: an interval, or `suppressed` and why.
 *
 * `sharedReason` is the candidate-level invalidity reason, when there is one. Every suppressed
 * metric of a saturated candidate carries the identical reason, and printing a paragraph of
 * saturation diagnostics six times over buries the six words that matter. The reason is printed
 * once, on the status line, and the metric lines point at it — the *data* still carries the full
 * reason on every metric for a programmatic consumer.
 */
export function formatMetricEstimate(metric: MetricEstimate, sharedReason?: string): string {
  if (metric.suppressed || metric.estimate === undefined) {
    const reason = metric.suppressedReason ?? 'no reason recorded';
    const text =
      sharedReason !== undefined && reason === sharedReason
        ? `${SUPPRESSED_LABEL} — the configuration is statistically invalid; see status above`
        : `${SUPPRESSED_LABEL} — ${reason}`;
    return field(metric.label, text);
  }
  const line = field(metric.label, formatMeanEstimate(metric.estimate, metric.precision, metric.unit));
  if (metric.excludedReplications === 0) return line;
  return `${line}\n${continuation(`${metric.excludedReplications} replication${metric.excludedReplications === 1 ? '' : 's'} excluded as statistically invalid`)}`;
}

/** The replication budget and stopping-rule state, in words rather than a flag. */
export function formatConvergence(convergence: ConvergenceReport): string {
  const level = `${(convergence.confidence * 100).toFixed(0)}%`;
  const target = `±${formatNumber(convergence.targetHalfWidth ?? Number.NaN, 2)}`;
  const runs = `${convergence.replications} replication${convergence.replications === 1 ? '' : 's'}`;
  const cap = convergence.replicationCap === undefined ? '' : ` (cap ${convergence.replicationCap})`;
  const suffix = ` (${convergence.metricId}, ${level})`;
  // An interval that does not exist is reported as not existing. `±n/a` invites the reader to
  // treat a suppressed metric as a very wide one, which is a different claim.
  const achieved = Number.isFinite(convergence.achievedHalfWidth)
    ? `±${formatNumber(convergence.achievedHalfWidth, 2)}`
    : 'not measurable';

  switch (convergence.status) {
    case 'converged':
      return field(
        'convergence',
        `CONVERGED — half-width ${achieved} met the ${target} target after ${runs}${cap}${suffix}`,
      );
    case 'hit-cap':
      return field(
        'convergence',
        `HIT CAP — ${runs}${cap} without meeting the ${target} target; the half-width is ${achieved}, so this candidate is measured less precisely than the experiment asked for${suffix}`,
      );
    case 'in-progress':
      return field(
        'convergence',
        `IN PROGRESS — half-width ${achieved} still exceeds the ${target} target after ${runs}${cap}${suffix}`,
      );
    case 'not-assessed':
    default:
      return field(
        'convergence',
        `NOT ASSESSED — no acceptable half-width was specified, so ${runs}${cap} cannot be called sufficient${suffix}`,
      );
  }
}

export interface FormatCandidateOptions {
  /** Heading prefix, e.g. `BASELINE`. */
  readonly role?: string | undefined;
}

/** One candidate's block: identity, replication accounting, status, metrics, caveats. */
export function formatCandidateReport(
  report: CandidateReport,
  options: FormatCandidateOptions = {},
): string {
  const lines: string[] = [];
  const role = options.role === undefined ? '' : `${options.role}  `;
  const name = report.label === undefined ? report.candidateId : `${report.candidateId} (${report.label})`;
  lines.push(`${role}${name}${report.buildingId === undefined ? '' : ` — ${report.buildingId}`}`);

  lines.push(
    field(
      'replications',
      `${report.replications} stored, ${report.usableReplications} usable, ${report.saturatedReplications} saturated, ${report.invalidReplications} statistically invalid`,
    ),
  );

  if (!report.statisticallyValid) {
    lines.push(
      field(
        'status',
        `${report.saturatedReplications > 0 ? 'SATURATED — ' : ''}STATISTICALLY INVALID: ${report.invalidReason ?? 'no reason recorded'}`,
      ),
    );
  }

  lines.push(formatConvergence(report.convergence));
  for (const metric of report.metrics) {
    lines.push(formatMetricEstimate(metric, report.invalidReason));
  }
  for (const warning of report.warnings) lines.push(field('warning', warning));

  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * Comparisons
 * -------------------------------------------------------------------------- */

/**
 * One metric of one paired comparison.
 *
 * The verdict comes first on the line, in capitals, before any number. That ordering is the whole
 * design: a reader who stops after four words has read the conclusion the statistics support rather
 * than a difference they will interpret themselves.
 */
export function formatMetricComparison(
  comparison: MetricComparison,
  candidateId: string,
  baselineId: string,
  sharedReason?: string,
): string {
  const better = comparison.direction === 'lower-is-better' ? 'lower is better' : 'higher is better';

  if (comparison.verdict === 'invalid' || comparison.estimate === undefined) {
    const reason = comparison.reason ?? 'the comparison is not statistically supportable';
    // Same de-duplication as `formatMetricEstimate`: when every metric is refused for one
    // comparison-level reason, that reason is printed once on the status line.
    if (sharedReason !== undefined && reason === sharedReason) {
      return field(comparison.label, 'NOT COMPARABLE — see status above');
    }
    return [field(comparison.label, 'NOT COMPARABLE'), continuation(reason)].join('\n');
  }

  const difference = `difference ${formatSigned(comparison.meanDifference, comparison.precision)}${comparison.unit === '' ? '' : ` ${comparison.unit}`}`;
  const level = `${(comparison.estimate.confidence * 100).toFixed(0)}%`;
  const bounds = `${level} CI [${formatSigned(comparison.estimate.lower, comparison.precision)}, ${formatSigned(comparison.estimate.upper, comparison.precision)}]`;

  if (comparison.verdict === 'indistinguishable') {
    return [
      field(comparison.label, `INDISTINGUISHABLE${PART}${difference}${PART}${bounds}`),
      continuation(comparison.reason ?? 'the paired interval contains zero'),
    ].join('\n');
  }

  const headline =
    comparison.verdict === 'better'
      ? `${candidateId} is BETTER than ${baselineId}`
      : `${candidateId} is WORSE than ${baselineId}`;
  return [
    field(comparison.label, `${headline}${PART}${difference}${PART}${bounds}`),
    continuation(
      `the interval excludes zero, so the difference is significant at ${level} (${better}); n=${comparison.pairs} paired replications, noise floor ±${formatNumber(comparison.noiseFloor, comparison.precision)}`,
    ),
  ].join('\n');
}

/** One candidate against the baseline, over every metric. */
export function formatCandidateComparison(comparison: CandidateComparison): string {
  const lines: string[] = [];
  lines.push(
    `${comparison.candidateId} vs ${comparison.baselineId} — ${comparison.pairedSeeds.length} paired replication${comparison.pairedSeeds.length === 1 ? '' : 's'}, ${comparison.crn ? 'common random numbers' : 'PARTIALLY PAIRED'}`,
  );
  if (!comparison.valid) {
    lines.push(
      field('status', `NOT COMPARABLE: ${comparison.invalidReason ?? 'no reason recorded'}`),
    );
  }
  for (const metric of comparison.metrics) {
    lines.push(
      formatMetricComparison(
        metric,
        comparison.candidateId,
        comparison.baselineId,
        comparison.invalidReason,
      ),
    );
  }
  for (const warning of comparison.warnings) lines.push(field('warning', warning));
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * The whole report
 * -------------------------------------------------------------------------- */

/**
 * The printable page.
 *
 * Deterministic, byte-for-byte, from the report value alone: no clock, no locale, no environment.
 * A regression test can therefore diff the whole page, which is the cheapest way to notice that a
 * verdict changed.
 */
export function formatComparisonReport(report: ComparisonReport): string {
  const sections: string[] = [];

  sections.push(
    [
      report.title,
      wrap(
        `${(report.confidence * 100).toFixed(0)}% confidence. Comparisons are paired-t intervals on per-replication differences over shared seeds (common random numbers) — Student-t at n−1, at every n, matching the family each interval prints; a candidate is ranked only where the interval excludes zero.`,
        '',
      ),
    ].join('\n'),
  );

  sections.push(formatCandidateReport(report.baseline, { role: 'BASELINE' }));
  for (const candidate of report.candidates) {
    sections.push(formatCandidateReport(candidate, { role: 'CANDIDATE' }));
  }
  for (const comparison of report.comparisons) {
    sections.push(formatCandidateComparison(comparison));
  }

  if (report.notes.length > 0) {
    sections.push(
      ['NOTES', ...report.notes.map((note) => wrap(note, '    ', `${INDENT}- `))].join('\n'),
    );
  }

  sections.push(['CONCLUSION', wrap(conclusionOf(report), INDENT)].join('\n'));

  return `${sections.join('\n\n')}\n`;
}

/**
 * The bottom line, in the only three shapes it is allowed to take.
 *
 * "Nothing could be compared" and "nothing could be distinguished" are different findings and a
 * report that renders them with the same sentence has thrown away the more actionable one: the first
 * says the configurations failed, the second says the experiment could not tell them apart.
 */
function conclusionOf(report: ComparisonReport): string {
  const level = `${(report.confidence * 100).toFixed(0)}% confidence`;
  const entries = report.comparisons.map((comparison) => ({
    candidateId: comparison.candidateId,
    verdict: comparison.metrics.find((metric) => metric.metricId === HEADLINE_METRIC_ID)?.verdict,
  }));
  const ranked = entries.filter(
    (entry) => entry.verdict === 'better' || entry.verdict === 'worse',
  );
  const indistinguishable = entries.filter((entry) => entry.verdict === 'indistinguishable');
  const notComparable = entries.filter(
    (entry) => entry.verdict === undefined || entry.verdict === 'invalid',
  );

  if (entries.length === 0) {
    return `No candidate was compared against ${report.baseline.candidateId}.`;
  }
  if (ranked.length === 0 && indistinguishable.length === 0) {
    return entries.length === 1
      ? `The only comparison against ${report.baseline.candidateId} on ${HEADLINE_METRIC_ID} could not be made: it is statistically invalid, unpaired, or has too few replications to form an interval. Nothing is reported about relative performance — see the status above.`
      : `No comparison against ${report.baseline.candidateId} on ${HEADLINE_METRIC_ID} could be made: all ${entries.length} are statistically invalid, unpaired, or too few to form an interval. Nothing is reported about their relative performance — see each candidate's status above.`;
  }

  const parts: string[] = [];
  if (ranked.length === 0) {
    parts.push(
      `No candidate is distinguishable from ${report.baseline.candidateId} on ${HEADLINE_METRIC_ID} at ${level}. Reporting a rank order over these differences would not be supported by the intervals.`,
    );
  } else {
    parts.push(
      `${ranked.length} of ${entries.length} candidates differ from ${report.baseline.candidateId} on ${HEADLINE_METRIC_ID} by more than the noise floor at ${level}: ${ranked
        .map((entry) => `${entry.candidateId} ${entry.verdict}`)
        .join(', ')}.`,
    );
    if (indistinguishable.length > 0) {
      parts.push(
        `${indistinguishable.length} ${indistinguishable.length === 1 ? 'is' : 'are'} indistinguishable from it.`,
      );
    }
  }
  if (notComparable.length > 0) {
    parts.push(
      `${notComparable.length} could not be compared at all (saturated, unpaired, or too few replications).`,
    );
  }
  return parts.join(' ');
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

/** `  label            value`, with the value wrapped and hanging-indented under itself. */
function field(label: string, value: string): string {
  const padded = label.length >= LABEL_WIDTH ? `${label} ` : label.padEnd(LABEL_WIDTH, ' ');
  const head = `${INDENT}${padded}`;
  return wrap(value, ' '.repeat(head.length), head);
}

/** A wrapped continuation line under a field's value column. */
function continuation(text: string): string {
  const indent = ' '.repeat(INDENT.length + LABEL_WIDTH);
  return wrap(text, indent, indent);
}

/**
 * Greedy word wrap to {@link LINE_WIDTH}, with a hanging indent.
 *
 * Hand-rolled because the alternative is a dependency, and this module may not take one.
 */
function wrap(text: string, indent: string, firstPrefix = indent): string {
  const width = Math.max(LINE_WIDTH - indent.length, 24);
  const words = text.split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return firstPrefix.trimEnd();

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') current = word;
    else if (`${current} ${word}`.length <= width) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);

  return lines
    .map((line, index) => `${index === 0 ? firstPrefix : indent}${line}`)
    .join('\n');
}
