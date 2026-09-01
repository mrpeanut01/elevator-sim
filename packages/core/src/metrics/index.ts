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
 * parseRunRecord(readFileSync(path, 'utf8'));  // validated on the way in, seed included
 * ```
 *
 * Nothing here reads a wall clock (invariant 3) or draws a random number (invariant 2), and
 * the only mutable object in the module is the recorder itself.
 *
 * ## Persisting a run is not this module's job, and the example above used to say it was
 *
 * That last line read `writeFileSync(path, serializeRunRecord(record))` followed by
 * `new StreamSet(runSeed(parseRunRecord(...)))`, annotated **`// replays exactly`**. It does not.
 * It builds a stream set with the right master seed and replays nothing, because a `RunRecord`
 * is a *dataset*, not a run: it names no demand template, no duration, no demand or dispatcher
 * overrides, and its `buildingId`, `dispatcherProfileId` and `trafficProfileId` are optional
 * fields. Feed the resulting stream set to a building you picked yourself and you have a new
 * run that agrees with the stored one on nothing but its random draws.
 *
 * CLAUDE.md invariant 5 has two clauses. **The first lives here** — every record carries its
 * seed, `parseRunRecord` refuses one that does not, and the seed travels as a decimal string so
 * that 64 bits survive the trip. **The second — *"so any run replays exactly"* — is discharged
 * in `experiments/reports`**, where `createStoredRun` wraps this record in the configuration
 * that produced it and cross-checks the two seeds, `parseStoredRun` re-checks them on the way
 * back in along with the traffic seed and the traffic model, and `replayStoredRun` rebuilds the
 * `SimulationConfig` and proves the replay bit-identical by fingerprint.
 *
 * `serializeRunRecord` and `runSeed` were the two symbols that example named, and nothing else
 * ever called for them: `core/src/dispatch/deadCode.test.ts` has carried both in its dead-candidate
 * register since the audit widened to fourteen directories on 2026-07-31, and neither acquired a
 * caller in that time. They are deleted rather than wired, because the round trip they described
 * was never a replay and inventing a call site would have been the standing requirement's defect
 * wearing a fix.
 * `DECISIONS.md` § D395.
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
  COUNTERWEIGHT_BALANCE_RATIO,
  DEPARTURE_GAP_BASES,
  METRICS_SCHEMA_VERSION,
  MetricsError,
  PERCENTILE_METHODS,
  DEFAULT_PERCENTILE_METHOD,
  QUEUE_SERIES_SOURCES,
  SATURATION_DEFAULTS,
  SATURATION_VERDICTS,
  SERVICE_LEVEL_VERDICTS,
  legSecondsOf,
  rideSecondsOf,
  outOfBalanceWorkJ,
  STANDARD_GRAVITY_MPS2,
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
  EnergyStatistics,
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
  ServiceLevelDiagnosis,
  TravelReading,
  TravelSample,
  ServiceLevelVerdict,
  AbandonmentStatistics,
  WaitStatistics,
} from './types.js';

export { AWT_INVALID_GROUNDS, diagnoseAwtValidity } from './awtValidity.js';

export type { AwtInvalidGround, AwtInvalidity, AwtValidityEvidence } from './awtValidity.js';

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
  DEFAULT_DESIGN_LOAD_FACTOR,
  DEPARTURE_GAP_REOPEN_MARGIN,
  FALLBACK_DEPARTURE_GAP_S,
  DEFAULT_LOAD_FACTOR_EDGES,
  DEFAULT_LONG_WAIT_THRESHOLD_S,
  DEFAULT_MAX_ABANDONMENT_FRACTION,
  DEFAULT_MAX_UNSERVED_FRACTION,
  DEFAULT_MAX_WAIT_HORIZON_S,
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
  diagnoseServiceLevel,
  energyStatistics,
  fullRunWindow,
  handlingCapacityOf,
  legDurations,
  loadedDepartureTimes,
  loadFactorStatistics,
  peakArrivalWindow,
  queueLengthSeries,
  resolveDepartureGapS,
  resolveWindow,
  selectJourneysInWindow,
  selectLegsInWindow,
  summarizeRun,
  summarizeAbandonment,
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
  ServiceLevelOptions,
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
} from './serialization.js';
