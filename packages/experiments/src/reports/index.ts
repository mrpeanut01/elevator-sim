/**
 * `experiments/reports` — result persistence, replay, re-analysis and honest reporting.
 *
 * The Phase 3 half of docs/03-traffic-and-statistics.md § Part 5 ("persist per-run records, not
 * aggregates, with the seed attached") and of its § Part 4 (paired-t intervals over common random
 * numbers). Four capabilities, in the order a sweep uses them:
 *
 * ```ts
 * import {
 *   createStoredRun, appendRunToFile, readRunSetFile,     // 1. persist
 *   replaySourcesFrom, assertIdenticalReplay,             // 2. replay
 *   reanalyzeStoredRun, observationsOf,                   // 3. re-analyse
 *   comparisonReportFromRunSet, formatComparisonReport,   // 4. report
 * } from '@elevator-sim/experiments';
 * ```
 *
 * 1. **Persist.** One newline-delimited JSON record per replication, each carrying its seed
 *    (CLAUDE.md invariant 5), the full configuration needed to reproduce it, the per-passenger
 *    dataset, and two schema versions. No derived statistics: a stored aggregate is a second source
 *    of truth waiting to drift from the first.
 * 2. **Replay.** Rebuild the `SimulationConfig` from the record and re-run it, then compare the
 *    whole record byte for byte. This is a Phase 3 acceptance criterion, and it checks the stored
 *    configuration's completeness as much as the simulator's determinism.
 * 3. **Re-analyse.** Recompute every headline number from stored per-passenger records without
 *    re-simulating — which is what makes a 20 000-run sweep affordable to reinterpret, and what
 *    lets "what if a long wait means 90 s" cost milliseconds instead of another sweep.
 * 4. **Report.** Confidence intervals, never bare means; `INDISTINGUISHABLE` where the paired
 *    interval contains zero; saturated configurations marked statistically invalid with their wait
 *    statistics suppressed; and the replication count and stopping-rule state printed beside every
 *    estimate.
 *
 * ## What is deliberately not exported
 *
 * The interval arithmetic (`./statistics.ts`: t and normal quantiles, `estimateMean`,
 * `pairedDifferenceEstimate`). `experiments/stats/` owns the package's public statistical surface;
 * what this module keeps to itself is the minimum a *report* needs to stand on its own, so that
 * stored results can be turned into a defensible page without a second module in the loop and so
 * that the two can be reconciled later without an API break. Anything a caller needs from it is
 * reachable through {@link buildCandidateReport} with a custom {@link MetricSpec}.
 */

/* -------------------------------------------------------------------------- *
 * Persistence
 * -------------------------------------------------------------------------- */

export {
  appendRunToFile,
  canonicalJson,
  createStoredRun,
  fingerprintOf,
  parseRunSet,
  parseStoredRun,
  readRunSetFile,
  runRecordFingerprint,
  serializeRunSet,
  serializeStoredRun,
  storedRunFingerprint,
  summarizeOptionsOf,
  summaryFingerprint,
  writeRunSetFile,
} from './persistence.js';

export type { CreateStoredRunInput, SerializeStoredRunOptions } from './persistence.js';

/* -------------------------------------------------------------------------- *
 * Replay
 * -------------------------------------------------------------------------- */

export {
  assertIdenticalReplay,
  replaySimulationConfig,
  replaySourcesFrom,
  replayStoredRun,
} from './replay.js';

export type { ReplayOptions, ReplaySources } from './replay.js';

/* -------------------------------------------------------------------------- *
 * Re-analysis
 * -------------------------------------------------------------------------- */

export {
  groupByCandidate,
  observationOf,
  observationsOf,
  reanalyzeRunSet,
  reanalyzeStoredRun,
  reanalyzeVerified,
  summarizeOptionsFor,
  verifySummaryFingerprint,
} from './reanalyze.js';

export type { ReanalyzeOverrides } from './reanalyze.js';

/* -------------------------------------------------------------------------- *
 * Comparison
 * -------------------------------------------------------------------------- */

export {
  HEADLINE_METRIC_ID,
  RECOMMENDED_MIN_REPLICATIONS,
  REPORT_METRICS,
  buildCandidateReport,
  buildComparisonReport,
  compareCandidates,
  comparisonReportFromRunSet,
} from './compare.js';

export type {
  CandidateReportOptions,
  CandidateSeries,
  ComparisonOptions,
  ComparisonReportInput,
  RunSetComparisonOptions,
} from './compare.js';

/* -------------------------------------------------------------------------- *
 * Formatting
 * -------------------------------------------------------------------------- */

export {
  SUPPRESSED_LABEL,
  formatCandidateComparison,
  formatCandidateReport,
  formatComparisonReport,
  formatConvergence,
  formatMeanEstimate,
  formatMetricComparison,
  formatMetricEstimate,
  formatNumber,
  formatSigned,
} from './format.js';

export type { FormatCandidateOptions } from './format.js';

/* -------------------------------------------------------------------------- *
 * Vocabulary
 * -------------------------------------------------------------------------- */

export { REPORTS_SCHEMA_VERSION, ReportsError, intervalContainsZero } from './types.js';

export type {
  CandidateComparison,
  CandidateReport,
  ComparisonReport,
  ComparisonVerdict,
  ConvergenceReport,
  ConvergenceStatus,
  IntervalMethod,
  MeanEstimate,
  MetricComparison,
  MetricDirection,
  MetricEstimate,
  MetricSpec,
  ReplayOutcome,
  ReplicationObservation,
  StoredDemandOptions,
  StoredDispatcherOptions,
  StoredRunConfig,
  StoredRunRecord,
  StoredSimOptions,
  StoredSummarizeOptions,
} from './types.js';
