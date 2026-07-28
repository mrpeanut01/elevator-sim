/**
 * Turning replications into claims — and refusing to make the ones the statistics do not support.
 *
 * ```ts
 * const report = comparisonReportFromRunSet(await readRunSetFile('out/up-peak.ndjson'), {
 *   baselineCandidateId: 'collective',
 *   targetHalfWidth: 1,        // the acceptable range the stopping rule aimed at, seconds
 *   replicationCap: 200,
 * });
 * console.log(formatComparisonReport(report));
 * ```
 *
 * ## The three rules this file exists to enforce
 *
 * From CLAUDE.md § Statistical discipline and docs/03-traffic-and-statistics.md § Part 4, in the
 * order they get violated in practice:
 *
 * 1. **No rank order without a paired-t interval excluding zero.** A candidate is compared to the
 *    baseline replication by replication, on matched seeds, and the verdict is read off the
 *    interval on the *differences*. There is no code path from two candidates' own intervals to a
 *    ranking, because that is the documented error: "two overlapping confidence intervals do **not**
 *    imply no significant difference", and neither do two disjoint ones imply the converse.
 * 2. **A difference below the noise floor is `indistinguishable`, not a tie broken by the means.**
 *    docs/05-roadmap.md § Phase 7 acceptance asks for exactly this in so many words. The interval
 *    half-width *is* the noise floor, and it is reported alongside the verdict so a reader can see
 *    what the experiment was capable of detecting.
 * 3. **A saturated configuration is statistically invalid.** Its wait statistics are suppressed and
 *    no comparison involving it is ranked, however large the apparent difference — because AWT under
 *    a diverging queue is not a mean of anything.
 *
 * ## Why excluded replications are counted rather than quietly dropped
 *
 * `core/metrics/types.ts` makes the point precisely: the runs whose queues diverged are exactly the
 * runs with the longest waits, so dropping them is *selection on the outcome variable*. The default
 * here is therefore `maxInvalidFraction: 0` — **one** invalid replication invalidates the
 * candidate's wait statistics. That is deliberately strict, and it is the strictness the project's
 * failure mode calls for: averaging the 199 replications that behaved is not a conservative choice,
 * it is a biased one. A caller who has a reason may raise the limit, and the count travels with
 * every estimate either way.
 */

import { estimateMean, pairedDifferenceEstimate, DEFAULT_CONFIDENCE } from './statistics.js';
import {
  ReportsError,
  intervalContainsZero,
  type CandidateComparison,
  type CandidateReport,
  type ComparisonReport,
  type ComparisonVerdict,
  type ConvergenceReport,
  type ConvergenceStatus,
  type MeanEstimate,
  type MetricComparison,
  type MetricEstimate,
  type MetricSpec,
  type ReplicationObservation,
  type StoredRunRecord,
} from './types.js';
import { groupByCandidate, observationsOf, type ReanalyzeOverrides } from './reanalyze.js';

/* -------------------------------------------------------------------------- *
 * The metric table (CLAUDE.md invariant 7)
 * -------------------------------------------------------------------------- */

/**
 * Every metric a report prints, as data.
 *
 * The five from docs/03-traffic-and-statistics.md § Part 5 that are per-replication scalars, plus
 * the achieved interval that Phase 2's oracle is stated in. Load-factor distribution is deliberately
 * absent: it is a distribution, not a scalar, and averaging one across replications would report
 * something nobody asked about.
 *
 * `invalidatedBySaturation` is the field that decides whether saturation suppresses a metric. It is
 * `true` for every waiting-time measure and `false` for throughput — a saturated system's achieved
 * handling capacity is a real number, and it is the evidence for *why* the configuration failed.
 */
export const REPORT_METRICS: readonly MetricSpec[] = Object.freeze([
  Object.freeze({
    id: 'awt',
    label: 'AWT (mean wait)',
    unit: 's',
    direction: 'lower-is-better' as const,
    precision: 2,
    invalidatedBySaturation: true,
    valueOf: (observation: ReplicationObservation) => observation.awtS,
  }),
  Object.freeze({
    id: 'wt95',
    label: 'WT95 (95th pct wait)',
    unit: 's',
    direction: 'lower-is-better' as const,
    precision: 2,
    invalidatedBySaturation: true,
    valueOf: (observation: ReplicationObservation) => observation.wt95S,
  }),
  Object.freeze({
    id: 'pctLongWait',
    label: '% waiting over threshold',
    unit: '%',
    direction: 'lower-is-better' as const,
    precision: 2,
    invalidatedBySaturation: true,
    valueOf: (observation: ReplicationObservation) => observation.pctOverLongWait,
  }),
  Object.freeze({
    id: 'ttd',
    label: 'TTD (time to destination)',
    unit: 's',
    direction: 'lower-is-better' as const,
    precision: 2,
    invalidatedBySaturation: true,
    valueOf: (observation: ReplicationObservation) => observation.ttdS,
  }),
  Object.freeze({
    id: 'interval',
    label: 'Achieved interval',
    unit: 's',
    direction: 'lower-is-better' as const,
    precision: 2,
    invalidatedBySaturation: false,
    valueOf: (observation: ReplicationObservation) => observation.achievedIntervalS,
  }),
  Object.freeze({
    id: 'capacity',
    label: 'Handling capacity',
    unit: 'persons/5min',
    direction: 'higher-is-better' as const,
    precision: 2,
    invalidatedBySaturation: false,
    valueOf: (observation: ReplicationObservation) => observation.personsPer5Min,
  }),
]);

/** The metric a report leads with and assesses convergence on. */
export const HEADLINE_METRIC_ID = 'awt';

/**
 * Replications below which a report carries a warning.
 *
 * docs/03-traffic-and-statistics.md § Part 3: "Budget 50–200 replications per configuration, not
 * 10." CIBSE's recommended ~10 runs reported ~5.6 s against a converged ~5.0 s in Peters & Abbi's
 * measurement — a 12% error, larger than the gap between two decent dispatch algorithms. A report
 * built on fewer than this says so, next to the numbers.
 */
export const RECOMMENDED_MIN_REPLICATIONS = 50;

/* -------------------------------------------------------------------------- *
 * Candidate reports
 * -------------------------------------------------------------------------- */

export interface CandidateReportOptions {
  /** Two-sided confidence level. Default 0.95. */
  readonly confidence?: number | undefined;
  /** Which metrics to report. Default {@link REPORT_METRICS}. */
  readonly metrics?: readonly MetricSpec[] | undefined;
  /** Metric the sequential stopping rule was assessed on. Default {@link HEADLINE_METRIC_ID}. */
  readonly convergenceMetricId?: string | undefined;
  /**
   * The acceptable half-width the stopping rule aimed at, in the convergence metric's unit.
   *
   * Omit and convergence is reported as `not-assessed` rather than as converged. A report that
   * assumes an unspecified target has been met is the same failure as a report that assumes ten
   * replications is enough.
   */
  readonly targetHalfWidth?: number | undefined;
  /** The replication budget, so `hit-cap` can be distinguished from `in-progress`. */
  readonly replicationCap?: number | undefined;
  /**
   * Fraction of replications that may be statistically invalid before the candidate is.
   *
   * **Default 0.** See the file docstring: dropping the saturated runs is selection on the outcome
   * variable.
   */
  readonly maxInvalidFraction?: number | undefined;
  /** Replication count below which a warning is attached. Default {@link RECOMMENDED_MIN_REPLICATIONS}. */
  readonly recommendedMinReplications?: number | undefined;
  readonly label?: string | undefined;
}

/**
 * Everything one candidate can say about itself, with every mean carrying an interval.
 *
 * @throws ReportsError if two replications share a seed. That is not a tolerable duplicate: it
 *   means the batch ran the same passenger trace twice and the "independent replications" a
 *   confidence interval assumes are not independent, and it would also make the seed useless as a
 *   pairing key for common random numbers.
 */
export function buildCandidateReport(
  candidateId: string,
  observations: readonly ReplicationObservation[],
  options: CandidateReportOptions = {},
): CandidateReport {
  const confidence = options.confidence ?? DEFAULT_CONFIDENCE;
  const metrics = options.metrics ?? REPORT_METRICS;
  const maxInvalidFraction = options.maxInvalidFraction ?? 0;
  const recommendedMin = options.recommendedMinReplications ?? RECOMMENDED_MIN_REPLICATIONS;

  assertDistinctSeeds(candidateId, observations);

  const replications = observations.length;
  const invalid = observations.filter((observation) => !observation.awtIsValid);
  const saturated = observations.filter((observation) => observation.saturated);
  const invalidFraction = replications === 0 ? 0 : invalid.length / replications;
  const statisticallyValid = replications > 0 && invalidFraction <= maxInvalidFraction;

  const invalidReason =
    replications === 0
      ? `No replications were stored for candidate "${candidateId}", so it has no statistics at all.`
      : statisticallyValid
        ? undefined
        : invalidReasonFor(candidateId, observations, invalid, saturated, maxInvalidFraction);

  const metricEstimates = metrics.map((metric) =>
    candidateMetric(metric, observations, {
      confidence,
      statisticallyValid,
      ...(invalidReason === undefined ? {} : { invalidReason }),
    }),
  );

  const warnings: string[] = [];
  if (replications > 0 && replications < recommendedMin) {
    warnings.push(
      `${replications} replication${replications === 1 ? '' : 's'} is below the ${recommendedMin}–200 budget docs/03-traffic-and-statistics.md § Part 3 recommends; at ~10 runs Peters & Abbi measured a 12% error against the converged mean, which is larger than the gap between two decent dispatchers.`,
    );
  }
  for (const estimate of metricEstimates) {
    if (estimate.excludedReplications > 0 && !estimate.suppressed) {
      warnings.push(
        `${estimate.label}: ${estimate.excludedReplications} of ${replications} replications were excluded as statistically invalid. The excluded runs are systematically the worst ones, so this interval is biased in the favourable direction by an unknown amount.`,
      );
    }
  }

  const first = observations[0];
  return Object.freeze({
    candidateId,
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(first?.buildingId === undefined ? {} : { buildingId: first.buildingId }),
    ...(first?.dispatcherProfileId === undefined
      ? {}
      : { dispatcherProfileId: first.dispatcherProfileId }),
    replications,
    usableReplications: replications - invalid.length,
    saturatedReplications: saturated.length,
    invalidReplications: invalid.length,
    statisticallyValid,
    ...(invalidReason === undefined ? {} : { invalidReason }),
    metrics: Object.freeze(metricEstimates),
    convergence: convergenceOf(metricEstimates, replications, confidence, options),
    seeds: Object.freeze(observations.map((observation) => observation.seed)),
    warnings: Object.freeze(warnings),
  });
}

/* -------------------------------------------------------------------------- *
 * Comparisons
 * -------------------------------------------------------------------------- */

/** One alternative's replications, ready to be compared. */
export interface CandidateSeries {
  readonly candidateId: string;
  readonly label?: string | undefined;
  readonly observations: readonly ReplicationObservation[];
}

export type ComparisonOptions = CandidateReportOptions;

/**
 * Compare a candidate against a baseline, pairwise on matched seeds.
 *
 * Pairing is on **seed**, never on replication index. Equal seeds mean equal passenger traces,
 * which is what common random numbers *are*; equal indices mean two runs that happen to have been
 * the seventh of their batch, which is not a pairing at all. If the two sides share no seeds the
 * comparison is reported invalid rather than falling back to an unpaired test — an unpaired
 * comparison of elevator dispatchers needs 5–20× the replications for the same confidence, and
 * silently substituting one would report a weaker conclusion in the same words.
 */
export function compareCandidates(
  baseline: CandidateSeries,
  candidate: CandidateSeries,
  options: ComparisonOptions = {},
): CandidateComparison {
  const confidence = options.confidence ?? DEFAULT_CONFIDENCE;
  const metrics = options.metrics ?? REPORT_METRICS;

  const baselineReport = buildCandidateReport(baseline.candidateId, baseline.observations, options);
  const candidateReport = buildCandidateReport(
    candidate.candidateId,
    candidate.observations,
    options,
  );

  const baselineBySeed = new Map(
    baseline.observations.map((observation) => [observation.seed, observation]),
  );
  const candidateBySeed = new Map(
    candidate.observations.map((observation) => [observation.seed, observation]),
  );
  const pairedSeeds = baseline.observations
    .map((observation) => observation.seed)
    .filter((seed) => candidateBySeed.has(seed));

  const crn =
    pairedSeeds.length > 0 &&
    pairedSeeds.length === baseline.observations.length &&
    pairedSeeds.length === candidate.observations.length;

  const warnings: string[] = [];
  if (pairedSeeds.length > 0 && !crn) {
    warnings.push(
      `Only ${pairedSeeds.length} of ${baseline.observations.length} baseline and ${candidate.observations.length} candidate replications share a seed. The unpaired runs are discarded, so this comparison is weaker than its replication count suggests and the variance reduction common random numbers exist for is only partly realized (docs/03-traffic-and-statistics.md § Part 4).`,
    );
  }

  const invalidReason =
    pairedSeeds.length === 0
      ? `"${candidate.candidateId}" and "${baseline.candidateId}" share no replication seeds, so no paired comparison is possible. Feed the same passenger traces to every alternative under comparison (docs/03-traffic-and-statistics.md § Part 4).`
      : pairedSeeds.length < 2
        ? `Only ${pairedSeeds.length} paired replication: a confidence interval needs at least two, and one run of a lift peak measures one arbitrary scenario (individual-run AWT spanned 4.1–7.4 s in Peters & Abbi's measurement).`
        : !baselineReport.statisticallyValid
          ? `Baseline "${baseline.candidateId}" is statistically invalid: ${baselineReport.invalidReason ?? 'no valid replications'}`
          : !candidateReport.statisticallyValid
            ? `Candidate "${candidate.candidateId}" is statistically invalid: ${candidateReport.invalidReason ?? 'no valid replications'}`
            : undefined;

  const valid = invalidReason === undefined;

  const metricComparisons = metrics.map((metric) =>
    compareMetric(metric, {
      pairedSeeds,
      baselineBySeed,
      candidateBySeed,
      confidence,
      valid,
      ...(invalidReason === undefined ? {} : { invalidReason }),
    }),
  );

  return Object.freeze({
    baselineId: baseline.candidateId,
    candidateId: candidate.candidateId,
    pairedSeeds: Object.freeze(pairedSeeds),
    crn,
    valid,
    ...(invalidReason === undefined ? {} : { invalidReason }),
    metrics: Object.freeze(metricComparisons),
    warnings: Object.freeze(warnings),
  });
}

export interface ComparisonReportInput {
  readonly title?: string | undefined;
  readonly baseline: CandidateSeries;
  readonly candidates: readonly CandidateSeries[];
  readonly options?: ComparisonOptions | undefined;
}

/**
 * A baseline, its candidates, and every paired comparison between them.
 *
 * Candidates keep the order they were supplied in. **Never sorted by result** — ordering a table by
 * how well each candidate did is a rank order, and a rank order is the thing that requires the
 * intervals to support it.
 */
export function buildComparisonReport(input: ComparisonReportInput): ComparisonReport {
  const options = input.options ?? {};
  const confidence = options.confidence ?? DEFAULT_CONFIDENCE;

  const baseline = buildCandidateReport(input.baseline.candidateId, input.baseline.observations, {
    ...options,
    ...(input.baseline.label === undefined ? {} : { label: input.baseline.label }),
  });
  const candidates = input.candidates.map((series) =>
    buildCandidateReport(series.candidateId, series.observations, {
      ...options,
      ...(series.label === undefined ? {} : { label: series.label }),
    }),
  );
  const comparisons = input.candidates.map((series) =>
    compareCandidates(input.baseline, series, options),
  );

  const notes: string[] = [];
  const saturatedIds = [baseline, ...candidates]
    .filter((report) => report.saturatedReplications > 0)
    .map((report) => report.candidateId);
  if (saturatedIds.length > 0) {
    notes.push(
      `Saturated replications present in: ${saturatedIds.join(', ')}. Waiting-time statistics for a configuration whose queues grow without bound are suppressed, not merely widened (docs/03-traffic-and-statistics.md § "Saturation detection").`,
    );
  }
  if (comparisons.some((comparison) => !comparison.crn)) {
    notes.push(
      'At least one comparison is not fully paired. Common random numbers require the same passenger traces on both sides; where seeds do not match, runs were discarded to form pairs.',
    );
  }
  const indistinguishable = comparisons.filter((comparison) =>
    comparison.metrics.some(
      (metric) => metric.metricId === HEADLINE_METRIC_ID && metric.verdict === 'indistinguishable',
    ),
  );
  if (indistinguishable.length > 0) {
    notes.push(
      `${indistinguishable.length} candidate${indistinguishable.length === 1 ? '' : 's'} could not be distinguished from the baseline on ${HEADLINE_METRIC_ID}. That is a result, not a missing one: the difference is smaller than the experiment can measure, and reporting a rank order over it is the failure this project is built to avoid.`,
    );
  }

  return Object.freeze({
    title: input.title ?? `Comparison against "${input.baseline.candidateId}"`,
    confidence,
    baseline,
    candidates: Object.freeze(candidates),
    comparisons: Object.freeze(comparisons),
    notes: Object.freeze(notes),
  });
}

export interface RunSetComparisonOptions extends ComparisonOptions {
  /** Which stored candidate is the baseline. Defaults to the first one in the set. */
  readonly baselineCandidateId?: string | undefined;
  /** Re-analysis overrides, applied identically to every candidate. */
  readonly overrides?: ReanalyzeOverrides | undefined;
  readonly title?: string | undefined;
}

/**
 * One call from a stored result set to a printable comparison.
 *
 * Re-analyses every record (no re-simulation), groups by candidate, and compares each candidate to
 * the baseline. The re-analysis overrides are applied **identically to every candidate**, which is
 * not merely convenient: asking two candidates different questions and comparing the answers is a
 * subtler version of the same error the paired-t interval exists to prevent.
 */
export function comparisonReportFromRunSet(
  records: readonly StoredRunRecord[],
  options: RunSetComparisonOptions = {},
): ComparisonReport {
  const grouped = groupByCandidate(records);
  if (grouped.size === 0) {
    throw new ReportsError('comparisonReportFromRunSet: the result set is empty');
  }
  const overrides = options.overrides ?? {};
  const series: CandidateSeries[] = [...grouped].map(([candidateId, group]) => ({
    candidateId,
    observations: observationsOf(group, overrides),
  }));

  const baselineId = options.baselineCandidateId ?? (series[0] as CandidateSeries).candidateId;
  const baseline = series.find((entry) => entry.candidateId === baselineId);
  if (baseline === undefined) {
    throw new ReportsError(
      `comparisonReportFromRunSet: baseline candidate "${baselineId}" is not in the result set. Present: ${[...grouped.keys()].join(', ')}`,
    );
  }

  return buildComparisonReport({
    ...(options.title === undefined ? {} : { title: options.title }),
    baseline,
    candidates: series.filter((entry) => entry.candidateId !== baselineId),
    options,
  });
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

function assertDistinctSeeds(
  candidateId: string,
  observations: readonly ReplicationObservation[],
): void {
  const seen = new Set<string>();
  for (const observation of observations) {
    if (seen.has(observation.seed)) {
      throw new ReportsError(
        `Candidate "${candidateId}" has two replications on seed ${observation.seed} (the second is run "${observation.runId}"). Replications must be independent for a confidence interval to mean anything, and the seed is the pairing key for common random numbers — a duplicate breaks both.`,
      );
    }
    seen.add(observation.seed);
  }
}

function invalidReasonFor(
  candidateId: string,
  observations: readonly ReplicationObservation[],
  invalid: readonly ReplicationObservation[],
  saturated: readonly ReplicationObservation[],
  maxInvalidFraction: number,
): string {
  const example = invalid.find((observation) => observation.awtInvalidReason !== undefined);
  const detail = example?.awtInvalidReason ?? 'no reason recorded';
  return (
    `${invalid.length} of ${observations.length} replications of "${candidateId}" are statistically invalid` +
    `${saturated.length > 0 ? ` (${saturated.length} saturated)` : ''}, above the ` +
    `${(maxInvalidFraction * 100).toFixed(0)}% limit. First reason: ${detail}`
  );
}

interface CandidateMetricContext {
  readonly confidence: number;
  readonly statisticallyValid: boolean;
  readonly invalidReason?: string | undefined;
}

/**
 * One metric of one candidate, as an interval or an explicit refusal.
 *
 * Three ways to get a refusal, and each has to be distinguishable in the printed report:
 * saturation (the configuration is invalid), emptiness (nothing was measured) and a single
 * replication (nothing to measure spread with). The third is the easy one to get wrong — a lone
 * replication has a perfectly good mean, and printing it without an interval is exactly the "bare
 * mean" this module refuses.
 */
function candidateMetric(
  metric: MetricSpec,
  observations: readonly ReplicationObservation[],
  context: CandidateMetricContext,
): MetricEstimate {
  const head = {
    metricId: metric.id,
    label: metric.label,
    unit: metric.unit,
    direction: metric.direction,
    precision: metric.precision,
  } as const;

  const eligible = observations.filter(
    (observation) =>
      (!metric.invalidatedBySaturation || observation.awtIsValid) &&
      Number.isFinite(metric.valueOf(observation)),
  );
  const excluded = observations.length - eligible.length;

  if (metric.invalidatedBySaturation && !context.statisticallyValid) {
    return Object.freeze({
      ...head,
      suppressed: true,
      suppressedReason:
        context.invalidReason ??
        'the configuration is statistically invalid, so this waiting-time statistic is not reported',
      excludedReplications: excluded,
    });
  }
  if (eligible.length === 0) {
    return Object.freeze({
      ...head,
      suppressed: true,
      suppressedReason: `no replication produced a value for ${metric.label}`,
      excludedReplications: excluded,
    });
  }
  if (eligible.length < 2) {
    return Object.freeze({
      ...head,
      suppressed: true,
      suppressedReason: `only one usable replication, which has no measurable spread; a mean without an interval is not reported`,
      excludedReplications: excluded,
    });
  }

  const estimate = estimateMean(
    eligible.map((observation) => metric.valueOf(observation)),
    { confidence: context.confidence },
  );
  return Object.freeze({
    ...head,
    suppressed: false,
    estimate,
    excludedReplications: excluded,
  });
}

/**
 * The one quantile family a report built here can carry — as a value, so the compiler holds it.
 *
 * `statistics.ts` narrows `publishedIntervalQuantile`'s return type to `'t'`: every published
 * interval in this package is Student-t at `n − 1`, at every `n` (DECISIONS.md § D14, review
 * finding #14). This constant is that guarantee restated where a report is *assembled* rather than
 * where an interval is computed, because the two are different places to get it wrong.
 */
const PUBLISHED_INTERVAL_FAMILY = 't' as const;

/**
 * A {@link ConvergenceReport} whose family label is pinned to {@link PUBLISHED_INTERVAL_FAMILY}.
 *
 * `ConvergenceReport.method` is typed `IntervalMethod`, the two-member union, because a *stored*
 * run set predating 2026-07 carries `'z'` and must still parse. That width is right for the stored
 * shape and wrong for a freshly assembled one: it let the family label be assigned from an
 * expression of union type, so nothing but a literal in the right place kept `'z'` off a report
 * whose every interval was `t`. Narrowing the construction site — the only one in the repository —
 * makes that assignment a compile error rather than a convention.
 */
type PublishedConvergenceReport = ConvergenceReport & {
  readonly method: typeof PUBLISHED_INTERVAL_FAMILY;
};

/**
 * The family label a convergence report may carry for `estimate`, or a refusal.
 *
 * Three cases, and the third is the one worth stating:
 *
 * - An estimate in the published family: its own label, copied.
 * - **No estimate at all** — the headline metric was suppressed, so `achievedHalfWidth` is `NaN`.
 *   There is no interval to read a family off, and `ConvergenceReport.method` is not optional, so
 *   the report names the family it would have used. This is the branch open item C5 was about: it
 *   used to call an n-dependent quantile chooser that returned `'z'` past n = 25, so a suppressed
 *   metric could stamp `'z'` on a report whose every printed interval was `t`.
 * - An estimate from **outside** the published family: refused. Copying `'z'` here would be
 *   truthful about that estimate and untruthful about this package, which has no estimator that
 *   produces one; the estimate came from somewhere else, and a reader cannot re-derive the
 *   half-width from a family the code cannot compute. `formatConvergence` never prints `method`,
 *   so a wrong value is invisible on the page and fully present in a serialized report — which is
 *   precisely why this refuses rather than degrading quietly.
 */
export function publishedIntervalFamily(
  estimate: MeanEstimate | undefined,
): typeof PUBLISHED_INTERVAL_FAMILY {
  if (estimate === undefined) return PUBLISHED_INTERVAL_FAMILY;
  if (estimate.method !== PUBLISHED_INTERVAL_FAMILY) {
    throw new ReportsError(
      `a convergence report cannot label its half-width "${estimate.method}": every interval this package publishes is Student-t at n − 1, at every n (statistics.ts § "One quantile", DECISIONS.md § D14), so a "${estimate.method}" estimate did not come from an estimator here and the report will not put a family on it.`,
    );
  }
  return estimate.method;
}

function convergenceOf(
  metrics: readonly MetricEstimate[],
  replications: number,
  confidence: number,
  options: CandidateReportOptions,
): PublishedConvergenceReport {
  const metricId = options.convergenceMetricId ?? HEADLINE_METRIC_ID;
  const estimate = metrics.find((metric) => metric.metricId === metricId)?.estimate;
  const achievedHalfWidth = estimate?.halfWidth ?? Number.NaN;
  const target = options.targetHalfWidth;

  const status: ConvergenceStatus =
    target === undefined
      ? 'not-assessed'
      : Number.isFinite(achievedHalfWidth) && achievedHalfWidth <= target
        ? 'converged'
        : options.replicationCap !== undefined && replications >= options.replicationCap
          ? 'hit-cap'
          : 'in-progress';

  return Object.freeze({
    status,
    metricId,
    replications,
    ...(options.replicationCap === undefined ? {} : { replicationCap: options.replicationCap }),
    ...(target === undefined ? {} : { targetHalfWidth: target }),
    achievedHalfWidth,
    confidence,
    /*
     * `'t'`, always — including when `achievedHalfWidth` is `NaN` because the headline metric was
     * suppressed and there is no estimate to read a family off. {@link publishedIntervalFamily}
     * has the three cases and why the third refuses; {@link PublishedConvergenceReport} is what
     * makes `'z'` unwritable here, rather than this line being careful.
     *
     * It used to read `estimate?.method ?? 't'` — an expression of union type assigned to a field
     * of union type. The literal was right and nothing checked it. Open item C5.
     */
    method: publishedIntervalFamily(estimate),
  });
}

interface MetricComparisonContext {
  readonly pairedSeeds: readonly string[];
  readonly baselineBySeed: ReadonlyMap<string, ReplicationObservation>;
  readonly candidateBySeed: ReadonlyMap<string, ReplicationObservation>;
  readonly confidence: number;
  readonly valid: boolean;
  readonly invalidReason?: string | undefined;
}

function compareMetric(metric: MetricSpec, context: MetricComparisonContext): MetricComparison {
  const head = {
    metricId: metric.id,
    label: metric.label,
    unit: metric.unit,
    direction: metric.direction,
    precision: metric.precision,
  } as const;

  const candidateValues: number[] = [];
  const baselineValues: number[] = [];
  for (const seed of context.pairedSeeds) {
    const left = context.baselineBySeed.get(seed);
    const right = context.candidateBySeed.get(seed);
    if (left === undefined || right === undefined) continue;
    if (metric.invalidatedBySaturation && !(left.awtIsValid && right.awtIsValid)) continue;
    const a = metric.valueOf(right);
    const b = metric.valueOf(left);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    candidateValues.push(a);
    baselineValues.push(b);
  }

  if (!context.valid) {
    return Object.freeze({
      ...head,
      pairs: candidateValues.length,
      meanDifference: Number.NaN,
      noiseFloor: Number.NaN,
      verdict: 'invalid' as ComparisonVerdict,
      reason: context.invalidReason ?? 'the comparison is not statistically supportable',
    });
  }
  if (candidateValues.length < 2) {
    return Object.freeze({
      ...head,
      pairs: candidateValues.length,
      meanDifference: Number.NaN,
      noiseFloor: Number.NaN,
      verdict: 'invalid' as ComparisonVerdict,
      reason: `only ${candidateValues.length} usable pair${candidateValues.length === 1 ? '' : 's'} for ${metric.label}; a paired interval needs at least two`,
    });
  }

  const estimate = pairedDifferenceEstimate(candidateValues, baselineValues, {
    confidence: context.confidence,
  });
  const verdict = verdictOf(estimate, metric);
  const reason = reasonFor(verdict, estimate, metric);

  return Object.freeze({
    ...head,
    pairs: estimate.n,
    meanDifference: estimate.mean,
    estimate,
    noiseFloor: estimate.halfWidth,
    verdict,
    ...(reason === undefined ? {} : { reason }),
  });
}

/**
 * The verdict, read off the interval and nothing else.
 *
 * Note what is *not* consulted: the size of the mean difference. A large difference with an interval
 * straddling zero is indistinguishable, and a tiny one with an interval clear of zero is real. That
 * asymmetry is the whole content of docs/03-traffic-and-statistics.md § Part 3's warning about
 * "increasing lift speed increasing average waiting time".
 */
function verdictOf(estimate: MeanEstimate, metric: MetricSpec): ComparisonVerdict {
  if (intervalContainsZero(estimate)) return 'indistinguishable';
  const candidateIsLower = estimate.upper < 0;
  if (metric.direction === 'lower-is-better') return candidateIsLower ? 'better' : 'worse';
  return candidateIsLower ? 'worse' : 'better';
}

function reasonFor(
  verdict: ComparisonVerdict,
  estimate: MeanEstimate,
  metric: MetricSpec,
): string | undefined {
  if (verdict !== 'indistinguishable') return undefined;
  const floor = Number.isFinite(estimate.halfWidth)
    ? `±${estimate.halfWidth.toFixed(metric.precision)} ${metric.unit}`.trim()
    : 'unmeasurable';
  return `the ${(estimate.confidence * 100).toFixed(0)}% paired interval on the difference contains zero; the difference is below this experiment's noise floor of ${floor}, so no rank order is reported`;
}
