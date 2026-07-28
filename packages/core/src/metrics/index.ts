/**
 * `core/metrics` — what a run recorded, and what it means.
 *
 * Three layers, deliberately separate:
 *
 * ```
 * MetricsRecorder  →  RunRecord   →  RunSummary
 *   (during a run)     (raw, seed-bearing, persisted)   (derived, re-computable)
 * ```
 *
 * The recorder collects raw events and computes nothing. The record is the *dataset* — one
 * entry per passenger leg, plus load and queue samples, plus the seed — and is what gets
 * written to disk. The summary is a pure function of a record and a set of options, so Phase 3
 * can re-window, re-threshold or re-percentile a stored run without re-simulating it, exactly
 * as docs/03-traffic-and-statistics.md § Part 5 requires.
 *
 * ```ts
 * const streams = new StreamSet(seed);
 * const recorder = new MetricsRecorder({ seed: streams, runId, buildingId: 'midtown-office' });
 * // ... simulate, calling recordArrival / recordBoarding / recordAlighting / sampleLoad ...
 * const record = recorder.finish(horizonS);
 *
 * const summary = summarizeRun(record, { window: 'peak-5min' });
 * summary.waiting.meanS;            // AWT
 * summary.waiting.p95S;             // WT95
 * summary.waiting.pctOverLongWait;  // % > 60 s
 * summary.timeToDestination.meanS;  // TTD, spanning every leg of a sky-lobby journey
 * summary.awtIsValid;               // false when the queue diverged — suppress the CI
 *
 * writeFileSync(path, serializeRunRecord(record));
 * new StreamSet(runSeed(parseRunRecord(readFileSync(path, 'utf8'))));  // replays exactly
 * ```
 *
 * Nothing here reads a wall clock (invariant 3) or draws a random number (invariant 2), and
 * the only mutable object in the module is the recorder itself.
 */

export {
  COMPARABLE_METRIC_IDS,
  MODEL_SENSITIVE_METRICS,
  MODEL_SENSITIVE_METRIC_IDS,
  PASSENGER_MODELS,
  comparabilityDisclaimer,
  comparabilityOf,
  passengerModelOf,
} from './comparability.js';

export type {
  ModelSensitiveMetric,
  PassengerModel,
  RunComparability,
} from './comparability.js';

export {
  DEPARTURE_GAP_BASES,
  METRICS_SCHEMA_VERSION,
  MetricsError,
  PERCENTILE_METHODS,
  DEFAULT_PERCENTILE_METHOD,
  QUEUE_SERIES_SOURCES,
  SATURATION_DEFAULTS,
  SATURATION_VERDICTS,
  legSecondsOf,
  rideSecondsOf,
  runSeed,
  waitSecondsOf,
  windowContains,
  windowContainsArrival,
  windowContainsJourney,
  windowDurationS,
} from './types.js';

export type {
  CarTimings,
  DepartureGapBasis,
  DurationStatistics,
  HandlingCapacity,
  Histogram,
  HistogramBin,
  IntervalStatistics,
  JourneyRecord,
  LinearTrend,
  LoadFactorStatistics,
  LoadReading,
  LoadSample,
  MetricsParameterSpec,
  MetricsParameterType,
  PassengerRecord,
  PercentileMethod,
  QueueSample,
  QueueSeriesSource,
  ReportWindow,
  RunCounts,
  RunRecord,
  RunSummary,
  SaturationDiagnosis,
  SaturationThresholds,
  SaturationVerdict,
  WaitStatistics,
} from './types.js';

export {
  countAbove,
  fractionAbove,
  histogram,
  linearTrend,
  mean,
  median,
  percentile,
  percentileOfSorted,
  percentiles,
  sampleStdDev,
  sortedAscending,
  summarizeDurations,
  weightedHistogram,
} from './distributions.js';

export type {
  DurationSummaryOptions,
  HistogramOptions,
  TrendPoint,
  WeightedValue,
} from './distributions.js';

export { MetricsRecorder } from './recorder.js';

export type {
  AssignmentDetails,
  BoardingDetails,
  MetricsRecorderOptions,
  RecordablePassenger,
  SeedSource,
} from './recorder.js';

export {
  DEFAULT_DEPARTURE_GAP_S,
  DEFAULT_DESIGN_LOAD_FACTOR,
  DEPARTURE_GAP_REOPEN_MARGIN,
  FALLBACK_DEPARTURE_GAP_S,
  DEFAULT_LOAD_FACTOR_EDGES,
  DEFAULT_LONG_WAIT_THRESHOLD_S,
  DEFAULT_MAX_UNSERVED_FRACTION,
  DEFAULT_QUEUE_SAMPLE_COUNT,
  DEFAULT_WAIT_HISTOGRAM_BIN_S,
  HANDLING_CAPACITY_WINDOW_S,
  METRICS_PARAMETERS,
  PEAK_WINDOW_S,
  achievedIntervalOf,
  assertWindow,
  buildJourneys,
  departureGapBracket,
  detectSaturation,
  fullRunWindow,
  handlingCapacityOf,
  legDurations,
  loadFactorStatistics,
  peakArrivalWindow,
  queueLengthSeries,
  resolveDepartureGapS,
  resolveWindow,
  selectJourneysInWindow,
  selectLegsInWindow,
  summarizeRun,
  summarizeWaiting,
  waitPercentile,
} from './summarize.js';

export type {
  DepartureGapBracket,
  IntervalOptions,
  LoadFactorOptions,
  PeakWindowOptions,
  QueueSeriesOptions,
  SaturationOptions,
  SummarizeOptions,
  WaitOptions,
  WindowSelection,
} from './summarize.js';

export {
  carTimingsSchema,
  loadSampleSchema,
  parseRunRecord,
  passengerRecordSchema,
  queueSampleSchema,
  reportWindowSchema,
  runRecordSchema,
  serializeRunRecord,
} from './serialization.js';

export type { SerializeOptions } from './serialization.js';
