/**
 * From a run record to the numbers a phase report quotes.
 *
 * Everything here is a **pure function of a {@link RunRecord} and a set of options**, which is
 * the property that makes docs/03-traffic-and-statistics.md § Part 5 work: a stored run can be
 * re-windowed, re-thresholded or re-percentiled without being re-simulated. Nothing in this
 * file mutates its input, reads a clock or draws a random number.
 *
 * ## The window is the first decision, not the last
 *
 * The recommended demand template is CIBSE's rise-and-fall, and it "reports the peak 5
 * minutes", not the whole run. So every cohort statistic is computed over an explicit
 * {@link ReportWindow}, membership is **by arrival time** and the interval is **half-open**
 * — see the `types.ts` docstring for why selecting by boarding time would let a slow
 * dispatcher flatter itself by pushing its worst passengers out of the window.
 *
 * {@link peakArrivalWindow} finds the peak window by sliding over arrival times, which are an
 * input to the simulation rather than an output of it — so under common random numbers **every
 * dispatcher under comparison gets the identical window**, and the comparison stays paired.
 *
 * ## Saturation is checked before the mean is believed
 *
 * {@link detectSaturation} fits a line to queue length over the reporting window and, when the
 * queue is diverging, {@link RunSummary.awtIsValid} comes back `false` so Phase 3 suppresses
 * the confidence interval. The mean is still reported — suppressing it entirely would hide
 * the evidence — but it is reported *marked invalid*, which is the distinction between
 * "we don't know" and "it's fine".
 *
 * The trend test is not the only way a mean can be untrustworthy, and `awtIsValid` does not
 * depend on it alone. AWT averages the legs that boarded, so a window most of whose arrivals
 * were never served reports the mean of its fastest survivors; that is checked separately by
 * {@link DEFAULT_MAX_UNSERVED_FRACTION}, because a run can be badly censored without the
 * fitted trend firing at all.
 *
 * ## Both halves of the Phase 2 oracle live here
 *
 * {@link handlingCapacityOf} is the achieved counterpart of the closed form's `HC5` and
 * {@link achievedIntervalOf} of its `INT`. docs/05-roadmap.md asks for both to match
 * `analytical/` "within a few percent" under pure up-peak, so both are computed from the same
 * record, in the same units, over the same window.
 */

import type { SimTime } from '../kernel/types.js';

import {
  linearTrend,
  mean as meanOf,
  percentileOfSorted,
  sortedAscending,
  summarizeDurations,
  weightedHistogram,
  histogram,
  type WeightedValue,
} from './distributions.js';
import {
  DEFAULT_PERCENTILE_METHOD,
  MetricsError,
  SATURATION_DEFAULTS,
  legSecondsOf,
  rideSecondsOf,
  waitSecondsOf,
  windowContains,
  windowContainsArrival,
  windowContainsJourney,
  windowDurationS,
  type DurationStatistics,
  type HandlingCapacity,
  type IntervalStatistics,
  type JourneyRecord,
  type LoadFactorStatistics,
  type LoadSample,
  type MetricsParameterSpec,
  type PassengerRecord,
  type PercentileMethod,
  type QueueSample,
  type QueueSeriesSource,
  type ReportWindow,
  type RunCounts,
  type RunRecord,
  type RunSummary,
  type SaturationDiagnosis,
  type SaturationThresholds,
  type WaitStatistics,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Defaults
 * -------------------------------------------------------------------------- */

/** The standard long-wait quality metric is "% waiting > **60 s**". */
export const DEFAULT_LONG_WAIT_THRESHOLD_S = 60;

/** Handling capacity is quoted per 5 minutes, matching the closed-form `HC5 = 300·P / RTT`. */
export const HANDLING_CAPACITY_WINDOW_S = 300;

/** The rise-and-fall template reports the peak **5 minutes**. */
export const PEAK_WINDOW_S = 300;

/**
 * Samples taken across the window when a queue-length series has to be derived.
 *
 * A count rather than an interval, so the resolution of the saturation fit does not depend on
 * how long the run was: 60 samples is one per 30 s over a 30-minute run and one per 5 s over a
 * peak-5-minute window, comfortably above `SATURATION_DEFAULTS.minSamples` in both cases.
 */
export const DEFAULT_QUEUE_SAMPLE_COUNT = 60;

/** Bin width for the waiting-time histogram, seconds. */
export const DEFAULT_WAIT_HISTOGRAM_BIN_S = 10;

/**
 * Fraction of rated capacity traffic analysis assumes a car fills to.
 *
 * Duplicates `LOAD_SENSOR_DEFAULTS.designLoadFactor` deliberately: `metrics/` is a leaf that
 * summarizes numbers other modules produced, and importing `model/car/` for one constant would
 * drag `physics/` into every report. Both are 0.8, and both cite
 * docs/03-traffic-and-statistics.md § Part 2 — "use 80% of rated capacity". Never 1.0.
 */
export const DEFAULT_DESIGN_LOAD_FACTOR = 0.8;

/** Bin edges for the load-factor distribution: 0 to 1.2 in tenths. 1.1 is the overload alarm. */
export const DEFAULT_LOAD_FACTOR_EDGES: readonly number[] = Object.freeze(
  Array.from({ length: 13 }, (_, i) => i / 10),
);

/**
 * Fraction of a window's arrivals that may go unserved before its AWT is marked invalid.
 *
 * **5 %.** AWT is a mean over the legs that boarded, so every unserved leg is a *censored*
 * observation — and censored in the one direction that matters, because the passengers still
 * standing at the landings when the run ended are the ones who would have contributed the
 * longest waits. Censoring 5 % of a right-skewed wait distribution already moves the mean by
 * roughly a tenth, and docs/03-traffic-and-statistics.md records that a 12 % error is
 * "comfortably larger than the gap between two decent dispatch algorithms". Anything above
 * this and the number is not a mean waiting time, it is the mean waiting time of the
 * survivors.
 *
 * The limit is not zero because a *legitimate* window has a little unavoidable censoring: a
 * whole-run window ends at the horizon, so the passengers who arrived in its last few seconds
 * genuinely have not boarded yet. That is `meanWait / runLength` — about 1 % for a 20 s mean
 * wait over a 30-minute run — and the peak-5-minute window, which the run continues past, has
 * essentially none.
 */
export const DEFAULT_MAX_UNSERVED_FRACTION = 0.05;

/* -------------------------------------------------------------------------- *
 * Journeys
 * -------------------------------------------------------------------------- */

/**
 * Group legs into journeys by `journeyId`.
 *
 * This is where time-to-destination becomes a whole-journey quantity. A sky-lobby journey is
 * recorded as two legs — `PassengerFactory.transfer` gives the second one the first one's
 * `journeyId` — and TTD is `finalLeg.alightedAt - firstLeg.arrivedAt`, spanning both rides,
 * both waits *and* the walk across the lobby between them.
 *
 * Legs come back ascending by `legIndex`; journeys come back in the order their first leg was
 * recorded, so the output is deterministic and does not depend on `Map` hashing of ids.
 *
 * A journey is **complete** only when its highest-indexed leg is flagged `isFinalLeg` and has
 * alighted. A passenger standing in a sky lobby has legs, timings and no TTD.
 */
export function buildJourneys(records: readonly PassengerRecord[]): readonly JourneyRecord[] {
  const byJourney = new Map<string, PassengerRecord[]>();
  for (const record of records) {
    const legs = byJourney.get(record.journeyId);
    if (legs === undefined) byJourney.set(record.journeyId, [record]);
    else legs.push(record);
  }

  const journeys: JourneyRecord[] = [];
  for (const [journeyId, unsorted] of byJourney) {
    const legs = [...unsorted].sort((a, b) => a.legIndex - b.legIndex);
    const first = legs[0] as PassengerRecord;
    const last = legs[legs.length - 1] as PassengerRecord;

    // `min` rather than `first.arrivedAt` so a record that captured only the second leg of a
    // journey still reports a journey start, and so a mis-ordered legIndex cannot invent a
    // negative duration.
    let startedAt = first.arrivedAt;
    for (const leg of legs) {
      if (leg.arrivedAt < startedAt) startedAt = leg.arrivedAt;
      if (leg.journeyStartedAt < startedAt) startedAt = leg.journeyStartedAt;
    }

    let totalWaitSeconds = 0;
    let totalRideSeconds = 0;
    for (const leg of legs) {
      totalWaitSeconds += waitSecondsOf(leg) ?? 0;
      totalRideSeconds += rideSecondsOf(leg) ?? 0;
    }

    const isComplete = last.isFinalLeg && last.alightedAt !== undefined;
    const completedAt = isComplete ? last.alightedAt : undefined;
    const timeToDestinationSeconds = completedAt === undefined ? undefined : completedAt - startedAt;
    const transferSeconds =
      timeToDestinationSeconds === undefined
        ? undefined
        : timeToDestinationSeconds - totalWaitSeconds - totalRideSeconds;

    journeys.push(
      Object.freeze({
        journeyId,
        legs: Object.freeze(legs),
        legCount: legs.length,
        originFloorId: first.originFloorId,
        finalDestinationFloorId: last.finalDestinationFloorId,
        startedAt,
        ...(completedAt === undefined ? {} : { completedAt }),
        isComplete,
        ...(timeToDestinationSeconds === undefined ? {} : { timeToDestinationSeconds }),
        totalWaitSeconds,
        totalRideSeconds,
        ...(transferSeconds === undefined ? {} : { transferSeconds }),
      }),
    );
  }

  return Object.freeze(journeys);
}

/* -------------------------------------------------------------------------- *
 * Windows
 * -------------------------------------------------------------------------- */

/** `'full-run'`, `'peak-5min'`, or an explicit window. */
export type WindowSelection = 'full-run' | 'peak-5min' | ReportWindow;

/** Validate a window and return a frozen copy. */
export function assertWindow(window: ReportWindow): ReportWindow {
  if (!Number.isFinite(window.startS) || !Number.isFinite(window.endS)) {
    throw new MetricsError(
      `Report window "${window.id}" needs finite bounds; received [${window.startS}, ${window.endS}).`,
    );
  }
  if (window.endS <= window.startS) {
    throw new MetricsError(
      `Report window "${window.id}" is empty: [${window.startS}, ${window.endS}). The interval is half-open, so its end must exceed its start.`,
    );
  }
  return Object.freeze({ id: window.id, startS: window.startS, endS: window.endS });
}

/** The whole run: `[startedAt, endedAt)`. */
export function fullRunWindow(record: Pick<RunRecord, 'startedAt' | 'endedAt'>): ReportWindow {
  return assertWindow({ id: 'full-run', startS: record.startedAt, endS: record.endedAt });
}

export interface PeakWindowOptions {
  readonly windowSeconds?: number | undefined;
  /** Where the search is allowed to look. Defaults to the span of the arrivals themselves. */
  readonly bounds?: ReportWindow | undefined;
  /** Label for the resulting window. Defaults to `peak-5min` for a 300 s window. */
  readonly id?: string | undefined;
}

/**
 * The busiest window of `windowSeconds`, measured by **arrivals**.
 *
 * Two properties make this the right selector for a comparison:
 *
 * 1. It depends only on arrival times, which the traffic generator produces from the
 *    `arrivals` stream. Under common random numbers every candidate dispatcher is therefore
 *    scored over the *same* five minutes, and the paired difference stays paired. Choosing the
 *    peak by, say, longest queue would give each dispatcher its own window and quietly
 *    unpair the comparison.
 * 2. The maximum-count window can always be taken to begin at an arrival, so scanning
 *    candidate starts at each arrival time is exact rather than a grid approximation. Ties go
 *    to the earliest start, so the answer is deterministic.
 *
 * Degenerate cases: a bounds interval shorter than `windowSeconds` returns the whole of it (a
 * 4-minute run has no peak 5 minutes), and a run with no arrivals returns the first
 * `windowSeconds` of its bounds.
 */
export function peakArrivalWindow(
  records: readonly PassengerRecord[],
  options: PeakWindowOptions = {},
): ReportWindow {
  const windowSeconds = options.windowSeconds ?? PEAK_WINDOW_S;
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new MetricsError(
      `Peak window length must be a positive number of seconds; received ${windowSeconds}.`,
    );
  }
  const id = options.id ?? (windowSeconds === PEAK_WINDOW_S ? 'peak-5min' : `peak-${windowSeconds}s`);

  const arrivalsAll = records.map((record) => record.arrivedAt);
  const bounds =
    options.bounds ??
    (arrivalsAll.length === 0
      ? { id, startS: 0, endS: windowSeconds }
      : {
          id,
          startS: Math.min(...arrivalsAll),
          // Half-open, so the last arrival must fall strictly inside.
          endS: Math.max(...arrivalsAll) + 1,
        });
  assertWindow(bounds);

  if (windowDurationS(bounds) <= windowSeconds) {
    return assertWindow({ id, startS: bounds.startS, endS: bounds.endS });
  }

  const arrivals = sortedAscending(
    arrivalsAll.filter((at) => at >= bounds.startS && at < bounds.endS),
  );
  if (arrivals.length === 0) {
    return assertWindow({ id, startS: bounds.startS, endS: bounds.startS + windowSeconds });
  }

  const latestStart = bounds.endS - windowSeconds;
  let bestStart = Math.min(arrivals[0] as number, latestStart);
  let bestCount = -1;

  let head = 0;
  for (let tail = 0; tail < arrivals.length; tail += 1) {
    const candidate = Math.min(arrivals[tail] as number, latestStart);
    if (tail > 0 && candidate === Math.min(arrivals[tail - 1] as number, latestStart)) continue;
    while (head < arrivals.length && (arrivals[head] as number) < candidate) head += 1;
    let count = 0;
    for (let i = head; i < arrivals.length; i += 1) {
      if ((arrivals[i] as number) >= candidate + windowSeconds) break;
      count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = candidate;
    }
  }

  return assertWindow({ id, startS: bestStart, endS: bestStart + windowSeconds });
}

/** Resolve a {@link WindowSelection} against a record. `undefined` uses the record's own. */
export function resolveWindow(record: RunRecord, selection?: WindowSelection | undefined): ReportWindow {
  if (selection === undefined) {
    return record.reportWindow === undefined
      ? fullRunWindow(record)
      : assertWindow(record.reportWindow);
  }
  if (selection === 'full-run') return fullRunWindow(record);
  if (selection === 'peak-5min') {
    return peakArrivalWindow(record.passengers, { bounds: fullRunWindow(record) });
  }
  return assertWindow(selection);
}

/** Legs whose **arrival** falls in the window. Order preserved. */
export function selectLegsInWindow(
  records: readonly PassengerRecord[],
  window: ReportWindow,
): readonly PassengerRecord[] {
  return records.filter((record) => windowContainsArrival(window, record));
}

/** Journeys whose **first leg's arrival** falls in the window. Order preserved. */
export function selectJourneysInWindow(
  journeys: readonly JourneyRecord[],
  window: ReportWindow,
): readonly JourneyRecord[] {
  return journeys.filter((journey) => windowContainsJourney(window, journey));
}

/* -------------------------------------------------------------------------- *
 * Queue length and saturation
 * -------------------------------------------------------------------------- */

export interface QueueSeriesOptions {
  readonly window: ReportWindow;
  /** Samples across the window. Default {@link DEFAULT_QUEUE_SAMPLE_COUNT}. */
  readonly sampleCount?: number | undefined;
  /** Fixed sampling interval in seconds. Overrides `sampleCount` when given. */
  readonly intervalS?: number | undefined;
}

/**
 * Reconstruct "how many people were waiting" over a window from the passenger records.
 *
 * A passenger counts as waiting at `t` when `arrivedAt <= t` and they had not boarded by `t`.
 * A leg that never boarded therefore counts from its arrival to the end of the series — which
 * is not a gap in the data but the very signal saturation detection is looking for: an
 * unserved backlog that never clears.
 *
 * Used when a record carries no {@link QueueSample}s of its own. Recorded samples are always
 * preferred, because only the simulation knows about passengers who left a queue for a reason
 * other than boarding.
 */
export function queueLengthSeries(
  records: readonly PassengerRecord[],
  options: QueueSeriesOptions,
): readonly QueueSample[] {
  const window = assertWindow(options.window);
  const duration = windowDurationS(window);

  let intervalS: number;
  if (options.intervalS !== undefined) {
    if (!Number.isFinite(options.intervalS) || options.intervalS <= 0) {
      throw new MetricsError(
        `Queue sampling interval must be a positive number of seconds; received ${options.intervalS}.`,
      );
    }
    intervalS = options.intervalS;
  } else {
    const sampleCount = options.sampleCount ?? DEFAULT_QUEUE_SAMPLE_COUNT;
    if (!Number.isInteger(sampleCount) || sampleCount < 2) {
      throw new MetricsError(
        `Queue sample count must be an integer of at least 2; received ${sampleCount}.`,
      );
    }
    intervalS = duration / sampleCount;
  }

  const arrivals = sortedAscending(records.map((record) => record.arrivedAt));
  const boardings = sortedAscending(
    records
      .map((record) => record.boardedAt)
      .filter((at): at is SimTime => at !== undefined),
  );

  const samples: QueueSample[] = [];
  let arrivalIndex = 0;
  let boardingIndex = 0;
  // Indexed rather than accumulated (`at += intervalS`), so rounding cannot drift the last
  // sample past the window edge and change how many samples a window produces.
  const count = Math.ceil(duration / intervalS);
  for (let i = 0; i < count; i += 1) {
    const at = window.startS + i * intervalS;
    if (at >= window.endS) break;
    while (arrivalIndex < arrivals.length && (arrivals[arrivalIndex] as number) <= at) {
      arrivalIndex += 1;
    }
    while (boardingIndex < boardings.length && (boardings[boardingIndex] as number) <= at) {
      boardingIndex += 1;
    }
    samples.push(Object.freeze({ at, waiting: arrivalIndex - boardingIndex }));
  }

  return Object.freeze(samples);
}

export interface SaturationOptions {
  /** The interval the trend is fitted over. */
  readonly window: ReportWindow;
  readonly thresholds?: Partial<SaturationThresholds> | undefined;
  /** Recorded in the diagnosis so a verdict can be traced to its data. */
  readonly source?: QueueSeriesSource | undefined;
}

/**
 * Fit a trend to queue length and decide whether the run saturated.
 *
 * The rule and the derivation of every threshold are documented on
 * {@link SaturationThresholds}. In short, all four must hold: a fitted **rate** of at least
 * `minSlopePersonsPerMinute` (0.5), a **magnitude** of at least `minProjectedGrowthPersons`
 * (8 people of backlog accumulated *across the fitted window*), a **signal-to-noise ratio** of
 * at least `minGrowthToNoiseRatio` (4) against the queue's own residual scatter, and a slope
 * t-statistic of at least `minTStatistic` (2).
 *
 * **The magnitude gate is stated in persons, not persons per minute, on purpose.** This
 * function is called with the *reporting* window, which defaults to the peak 5 minutes — a
 * sixth of the 30-minute run the 0.5 persons/min figure was derived against. A rate that means
 * "15 people the system never cleared" over a run means "2.5 people" over a peak window, which
 * a stationary queue produces by chance about a quarter of the time. See the
 * `SaturationThresholds` docstring for the measurements.
 *
 * **Fit over the reporting window, not the whole run.** The rise-and-fall template ramps
 * demand up and back down by construction, so a whole-run fit sees the template's own hump: a
 * perfectly healthy system looks like it is diverging during the ramp-up and recovering during
 * the ramp-down, and the answer depends on where the run happened to be cut. Over the peak
 * window, a positive trend means the system cannot keep up with the peak, which is the
 * question actually being asked.
 */
export function detectSaturation(
  samples: readonly QueueSample[],
  options: SaturationOptions,
): SaturationDiagnosis {
  const window = assertWindow(options.window);
  const thresholds: SaturationThresholds = Object.freeze({
    ...SATURATION_DEFAULTS,
    ...options.thresholds,
  });
  const source = options.source ?? 'recorded';

  const inWindow = samples
    .filter((sample) => windowContains(window, sample.at))
    .sort((a, b) => a.at - b.at);

  if (inWindow.length < thresholds.minSamples) {
    return Object.freeze({
      saturated: false,
      verdict: 'insufficient-samples',
      source: inWindow.length === 0 ? 'none' : source,
      windowStartS: window.startS,
      windowEndS: window.endS,
      sampleCount: inWindow.length,
      slopePersonsPerSecond: Number.NaN,
      slopePersonsPerMinute: Number.NaN,
      projectedGrowthPersons: Number.NaN,
      interceptPersons: Number.NaN,
      rSquared: Number.NaN,
      residualStdDevPersons: Number.NaN,
      growthToNoiseRatio: Number.NaN,
      tStatistic: Number.NaN,
      meanQueueLength: inWindow.length === 0 ? Number.NaN : meanOf(inWindow.map((s) => s.waiting)),
      maxQueueLength:
        inWindow.length === 0 ? Number.NaN : Math.max(...inWindow.map((s) => s.waiting)),
      thresholds,
    });
  }

  // x in seconds from the window start, so the intercept is "queue length at window start"
  // rather than a number that depends on how long the simulation had been running.
  const trend = linearTrend(
    inWindow.map((sample) => ({ x: sample.at - window.startS, y: sample.waiting })),
  );
  const slopePersonsPerMinute = trend.slope * 60;
  const projectedGrowthPersons = trend.slope * windowDurationS(window);
  // A noiseless fit has nothing for the growth to stand out from, so the ratio is unbounded
  // and gate 3 defers to the magnitude gate rather than dividing by zero.
  const growthToNoiseRatio =
    trend.residualStdDev === 0
      ? projectedGrowthPersons === 0
        ? 0
        : Number.POSITIVE_INFINITY * Math.sign(projectedGrowthPersons)
      : projectedGrowthPersons / trend.residualStdDev;
  const saturated =
    slopePersonsPerMinute >= thresholds.minSlopePersonsPerMinute &&
    projectedGrowthPersons >= thresholds.minProjectedGrowthPersons &&
    growthToNoiseRatio >= thresholds.minGrowthToNoiseRatio &&
    trend.tStatistic >= thresholds.minTStatistic;

  return Object.freeze({
    saturated,
    verdict: saturated ? 'diverging-queue' : 'stable',
    source,
    windowStartS: window.startS,
    windowEndS: window.endS,
    sampleCount: inWindow.length,
    slopePersonsPerSecond: trend.slope,
    slopePersonsPerMinute,
    projectedGrowthPersons,
    interceptPersons: trend.intercept,
    rSquared: trend.rSquared,
    residualStdDevPersons: trend.residualStdDev,
    growthToNoiseRatio,
    tStatistic: trend.tStatistic,
    meanQueueLength: trend.meanY,
    maxQueueLength: Math.max(...inWindow.map((sample) => sample.waiting)),
    thresholds,
  });
}

/* -------------------------------------------------------------------------- *
 * Load factor over time
 * -------------------------------------------------------------------------- */

export interface LoadFactorOptions {
  readonly window: ReportWindow;
  /**
   * The fleet roster: every car in service, whether or not it ever carried anybody.
   *
   * Supply it (from `RunRecord.carIds`) or the distribution silently omits idle cars — see
   * {@link LoadFactorStatistics}. Cars appearing only in the samples are added to whatever is
   * passed here, so an incomplete roster degrades rather than lies.
   */
  readonly carIds?: readonly string[] | undefined;
  /** Bin edges. Default {@link DEFAULT_LOAD_FACTOR_EDGES}: 0 to 1.2 in tenths. */
  readonly edges?: readonly number[] | undefined;
  /** The 80% fill assumption to measure time-at-design-load against. */
  readonly designLoadFactor?: number | undefined;
}

/**
 * Time-weighted distribution of car occupancy over the window.
 *
 * Each sample is held until the next sample **for the same car**, or until the end of the
 * window, and contributes that many seconds of weight. A sample taken before the window still
 * counts, clipped to the window: its reading is what the car was carrying when the window
 * opened, and dropping it would report an empty car for however long it took the next event to
 * fire.
 *
 * Weighting by time rather than by sample is what makes the answer mean anything. Load events
 * cluster at busy floors, so a sample-count histogram describes where the *events* were, not
 * where the *cars* were, and the metric exists to validate the capacity model.
 *
 * **Idle cars count.** Every car — those named in `carIds` and those seen in the samples —
 * that has no sample at or before the window start is given a synthetic zero-load reading
 * there, so the seconds it spent empty are weighted like any others. That is not an
 * assumption bolted on: `MetricsRecorder.sampleLoad` is called on every load change, so "no
 * sample yet" *means* "nothing has been loaded yet". Without it a car that never carried
 * anybody contributes zero car-seconds and the fleet mean is biased high — an eight-car bank
 * with four idle cars would report the same occupancy as a four-car bank.
 */
export function loadFactorStatistics(
  samples: readonly LoadSample[],
  options: LoadFactorOptions,
): LoadFactorStatistics {
  const window = assertWindow(options.window);
  const edges = options.edges ?? DEFAULT_LOAD_FACTOR_EDGES;
  const designLoadFactor = options.designLoadFactor ?? DEFAULT_DESIGN_LOAD_FACTOR;

  // Insertion-ordered: roster first, then any car the samples know about that the roster did
  // not, so the iteration order is deterministic and does not depend on `Map` hashing.
  const byCar = new Map<string, LoadSample[]>();
  for (const carId of options.carIds ?? []) if (!byCar.has(carId)) byCar.set(carId, []);
  for (const sample of samples) {
    const list = byCar.get(sample.carId);
    if (list === undefined) byCar.set(sample.carId, [sample]);
    else list.push(sample);
  }

  const weighted: WeightedValue[] = [];
  let observedSeconds = 0;
  let atOrAboveDesignSeconds = 0;
  let sampleCount = 0;
  let sampledCarCount = 0;
  let minLoadFactor = Number.POSITIVE_INFINITY;
  let maxLoadFactor = Number.NEGATIVE_INFINITY;

  for (const [carId, carSamples] of byCar) {
    if (carSamples.length > 0) sampledCarCount += 1;
    const ordered = [...carSamples].sort((a, b) => a.at - b.at);
    const first = ordered[0];
    const seeded = first === undefined || first.at > window.startS;
    if (seeded) {
      // The car was empty until its first recorded load change. Charge that time to 0.0
      // rather than letting it disappear.
      ordered.unshift({ at: window.startS, carId, loadFactor: 0, occupants: 0, massKg: 0 });
    }
    for (let i = 0; i < ordered.length; i += 1) {
      const sample = ordered[i] as LoadSample;
      const next = ordered[i + 1];
      const holdsUntil = next === undefined ? window.endS : next.at;
      const from = Math.max(sample.at, window.startS);
      const to = Math.min(holdsUntil, window.endS);
      const seconds = to - from;
      if (seconds <= 0) continue;

      weighted.push({ value: sample.loadFactor, weight: seconds });
      observedSeconds += seconds;
      if (sample.loadFactor >= designLoadFactor) atOrAboveDesignSeconds += seconds;
      if (!(seeded && i === 0)) sampleCount += 1;
      if (sample.loadFactor < minLoadFactor) minLoadFactor = sample.loadFactor;
      if (sample.loadFactor > maxLoadFactor) maxLoadFactor = sample.loadFactor;
    }
  }

  const distribution = weightedHistogram(weighted, { edges });

  return Object.freeze({
    sampleCount,
    carCount: byCar.size,
    sampledCarCount,
    observedSeconds,
    meanLoadFactor: distribution.mean,
    // Gated on observed car-seconds, not on recorded samples: a roster car that stood empty
    // all window really was at 0.0, and reporting NaN there would hide the idle time the
    // roster was added to expose.
    minLoadFactor: weighted.length === 0 ? Number.NaN : minLoadFactor,
    maxLoadFactor: weighted.length === 0 ? Number.NaN : maxLoadFactor,
    fractionOfTimeAtOrAboveDesignLoad:
      observedSeconds === 0 ? Number.NaN : atOrAboveDesignSeconds / observedSeconds,
    designLoadFactor,
    distribution,
  });
}

/* -------------------------------------------------------------------------- *
 * Handling capacity
 * -------------------------------------------------------------------------- */

/**
 * Persons handled per 5 minutes over the window — the achieved counterpart of `HC5`.
 *
 * Selected by **event time, not arrival cohort**: see {@link HandlingCapacity}. This is the one
 * deliberate departure from the module's window rule, and it is the correct one for a
 * throughput measure.
 *
 * **Persons are counted by distinct `journeyId`, legs by record.** A sky-lobby passenger
 * boards twice and is one person; counting the legs would inflate `%POP` by the transfer
 * factor against a population measured in people. Both counts are reported.
 */
export function handlingCapacityOf(
  records: readonly PassengerRecord[],
  window: ReportWindow,
  population?: number | undefined,
): HandlingCapacity {
  const seconds = windowDurationS(assertWindow(window));

  let legsHandled = 0;
  let legsDelivered = 0;
  let legsArrived = 0;
  const journeysHandled = new Set<string>();
  const journeysDelivered = new Set<string>();
  const journeysArrived = new Set<string>();
  for (const record of records) {
    if (record.boardedAt !== undefined && windowContains(window, record.boardedAt)) {
      legsHandled += 1;
      journeysHandled.add(record.journeyId);
    }
    if (record.alightedAt !== undefined && windowContains(window, record.alightedAt)) {
      legsDelivered += 1;
      journeysDelivered.add(record.journeyId);
    }
    if (windowContainsArrival(window, record)) {
      legsArrived += 1;
      journeysArrived.add(record.journeyId);
    }
  }

  const personsHandled = journeysHandled.size;
  const personsArrived = journeysArrived.size;
  const personsPer5Min = (personsHandled * HANDLING_CAPACITY_WINDOW_S) / seconds;
  const offeredPer5Min = (personsArrived * HANDLING_CAPACITY_WINDOW_S) / seconds;

  return Object.freeze({
    personsHandled,
    personsDelivered: journeysDelivered.size,
    personsArrived,
    legsHandled,
    legsDelivered,
    legsArrived,
    windowSeconds: seconds,
    personsPer5Min,
    offeredPer5Min,
    legsPer5Min: (legsHandled * HANDLING_CAPACITY_WINDOW_S) / seconds,
    ...(population === undefined ? {} : { population }),
    ...(population === undefined || population <= 0
      ? {}
      : { pctPopulationPer5Min: (personsPer5Min / population) * 100 }),
  });
}

/* -------------------------------------------------------------------------- *
 * Achieved interval
 * -------------------------------------------------------------------------- */

/**
 * Longest pause between two boardings by the same car that still counts as one departure.
 *
 * **10 s.** Loading is a passenger every 1–2 s and a door reopen adds a few more; a car does
 * not come back to the terminal inside a round trip, which is tens of seconds at minimum. Any
 * value between "a slow transfer" and "a fast round trip" gives the same answer, which is why
 * a fixed default is safe — and it is declared in {@link METRICS_PARAMETERS} for the cases
 * where it is not.
 */
export const DEFAULT_DEPARTURE_GAP_S = 10;

export interface IntervalOptions {
  readonly window: ReportWindow;
  /**
   * Floors whose boardings count as terminal departures. Defaults to the single floor with
   * the most in-window boardings — the lobby, under up-peak — which is reported back on
   * {@link IntervalStatistics.terminalFloorId}.
   */
  readonly terminalFloorIds?: readonly string[] | undefined;
  /** Departure clustering threshold. Default {@link DEFAULT_DEPARTURE_GAP_S}. */
  readonly departureGapS?: number | undefined;
  readonly percentileMethod?: PercentileMethod | undefined;
}

/** One reconstructed departure of one car from the terminal. */
interface Departure {
  readonly at: SimTime;
  readonly carId: string;
}

/**
 * Achieved interval — the seconds between successive car departures from the terminal.
 *
 * The simulated counterpart of the closed form's `INT = RTT / L`, and the half of Phase 2's
 * acceptance oracle that {@link handlingCapacityOf} does not cover: docs/05-roadmap.md asks
 * for "interval **and** handling capacity matching the closed-form Barney/CIBSE RTT
 * calculation within a few percent".
 *
 * A record stores boardings, not departures, so departures are reconstructed: boardings are
 * filtered to the terminal floor and the window, grouped by car, and split wherever the same
 * car's boardings are more than `departureGapS` apart. The departure instant is the **last**
 * boarding of each group — the point at which loading finished — and the reported durations
 * are the gaps between successive departures once every car's departures are merged and
 * sorted.
 *
 * Two deliberate choices:
 *
 * - **Boardings, not arrivals at the floor.** A car that stops at the lobby and takes nobody
 *   has not made a trip; the interval that matters to a waiting passenger is between the
 *   departures that carried people.
 * - **Legs without a `carId` are skipped**, and reported in the difference between
 *   {@link IntervalStatistics.boardingCount} and the window's boardings. A departure is a
 *   *car* leaving, and there is no honest way to reconstruct one without knowing which car.
 *
 * The spread matters as much as the mean here — see {@link IntervalStatistics}.
 */
export function achievedIntervalOf(
  records: readonly PassengerRecord[],
  options: IntervalOptions,
): IntervalStatistics {
  const window = assertWindow(options.window);
  const departureGapS = options.departureGapS ?? DEFAULT_DEPARTURE_GAP_S;
  if (!Number.isFinite(departureGapS) || departureGapS < 0) {
    throw new MetricsError(
      `Departure gap must be a non-negative number of seconds; received ${departureGapS}.`,
    );
  }
  const percentileMethod = options.percentileMethod ?? DEFAULT_PERCENTILE_METHOD;

  const boarded = records.filter(
    (record) => record.boardedAt !== undefined && windowContains(window, record.boardedAt),
  );

  // Terminal selection: the busiest boarding floor, ties to the one seen first, so the answer
  // is deterministic and does not depend on `Map` hashing.
  let terminalFloorIds = options.terminalFloorIds;
  let terminalFloorId: string | undefined;
  if (terminalFloorIds === undefined) {
    const perFloor = new Map<string, number>();
    for (const record of boarded) {
      perFloor.set(record.originFloorId, (perFloor.get(record.originFloorId) ?? 0) + 1);
    }
    let best = 0;
    for (const [floorId, count] of perFloor) {
      if (count > best) {
        best = count;
        terminalFloorId = floorId;
      }
    }
    terminalFloorIds = terminalFloorId === undefined ? [] : [terminalFloorId];
  } else if (terminalFloorIds.length === 1) {
    terminalFloorId = terminalFloorIds[0];
  }
  // Several explicit terminals (a building with two entrances) have no single id to report,
  // so the field stays undefined rather than naming one of them arbitrarily.
  const terminals = new Set(terminalFloorIds);

  const byCar = new Map<string, SimTime[]>();
  let boardingCount = 0;
  for (const record of boarded) {
    if (!terminals.has(record.originFloorId)) continue;
    if (record.carId === undefined) continue;
    boardingCount += 1;
    const list = byCar.get(record.carId);
    if (list === undefined) byCar.set(record.carId, [record.boardedAt as SimTime]);
    else list.push(record.boardedAt as SimTime);
  }

  const departures: Departure[] = [];
  for (const [carId, times] of byCar) {
    const ordered = sortedAscending(times);
    for (let i = 0; i < ordered.length; i += 1) {
      const at = ordered[i] as number;
      const next = ordered[i + 1];
      // The last boarding of a cluster is the departure: the doors close behind it.
      if (next === undefined || next - at > departureGapS) departures.push({ at, carId });
    }
  }
  departures.sort((a, b) => (a.at === b.at ? (a.carId < b.carId ? -1 : a.carId > b.carId ? 1 : 0) : a.at - b.at));

  const gaps: number[] = [];
  for (let i = 1; i < departures.length; i += 1) {
    gaps.push((departures[i] as Departure).at - (departures[i - 1] as Departure).at);
  }

  const base = summarizeDurations(gaps, { percentileMethod });
  const coefficientOfVariation =
    Number.isFinite(base.stdDevS) && base.meanS > 0 ? base.stdDevS / base.meanS : Number.NaN;

  return Object.freeze({
    ...base,
    ...(terminalFloorId === undefined ? {} : { terminalFloorId }),
    departureCount: departures.length,
    carCount: byCar.size,
    boardingCount,
    coefficientOfVariation,
    departureGapS,
  });
}

/* -------------------------------------------------------------------------- *
 * Waiting
 * -------------------------------------------------------------------------- */

export interface WaitOptions {
  readonly longWaitThresholdS?: number | undefined;
  readonly percentileMethod?: PercentileMethod | undefined;
  /** Bin width for the histogram, seconds. Default {@link DEFAULT_WAIT_HISTOGRAM_BIN_S}. */
  readonly histogramBinSeconds?: number | undefined;
}

/**
 * AWT, WT95 and % over the long-wait threshold, over a set of legs.
 *
 * `legs` is expected to be pre-filtered to the window (see {@link selectLegsInWindow}); this
 * function does not window, so it can also be pointed at an arbitrary cohort — one bank, one
 * floor, one credential group — during analysis.
 *
 * Legs that never boarded are counted in {@link WaitStatistics.unservedCount} and excluded
 * from the mean. They have no waiting time yet, and imputing one — the run length, say —
 * would be inventing data; their evidence surfaces through saturation detection instead.
 */
export function summarizeWaiting(
  legs: readonly PassengerRecord[],
  options: WaitOptions = {},
): WaitStatistics {
  const longWaitThresholdS = options.longWaitThresholdS ?? DEFAULT_LONG_WAIT_THRESHOLD_S;
  const percentileMethod = options.percentileMethod ?? DEFAULT_PERCENTILE_METHOD;
  const binSeconds = options.histogramBinSeconds ?? DEFAULT_WAIT_HISTOGRAM_BIN_S;

  const waits: number[] = [];
  let unservedCount = 0;
  for (const leg of legs) {
    const wait = waitSecondsOf(leg);
    if (wait === undefined) unservedCount += 1;
    else waits.push(wait);
  }

  const base = summarizeDurations(waits, { percentileMethod });
  let overLongWaitCount = 0;
  for (const wait of waits) if (wait > longWaitThresholdS) overLongWaitCount += 1;

  return Object.freeze({
    ...base,
    arrivalCount: legs.length,
    unservedCount,
    longWaitThresholdS,
    overLongWaitCount,
    pctOverLongWait: waits.length === 0 ? Number.NaN : (overLongWaitCount / waits.length) * 100,
    histogram: histogram(waits, { min: 0, binWidth: binSeconds }),
  });
}

/* -------------------------------------------------------------------------- *
 * The whole summary
 * -------------------------------------------------------------------------- */

export interface SummarizeOptions {
  /**
   * Which window to report over. Defaults to the record's own `reportWindow`, and to the whole
   * run when it has none.
   */
  readonly window?: WindowSelection | undefined;
  readonly longWaitThresholdS?: number | undefined;
  readonly percentileMethod?: PercentileMethod | undefined;
  readonly waitHistogramBinSeconds?: number | undefined;
  readonly loadFactorEdges?: readonly number[] | undefined;
  readonly designLoadFactor?: number | undefined;
  /** Fleet roster, overriding `RunRecord.carIds`. See {@link LoadFactorOptions.carIds}. */
  readonly carIds?: readonly string[] | undefined;
  readonly saturation?: Partial<SaturationThresholds> | undefined;
  /** Sampling for a derived queue series. Ignored when the record carries queue samples. */
  readonly queueSampleCount?: number | undefined;
  /**
   * Fraction of the window's arrivals that may go unserved before the AWT is marked invalid.
   * Default {@link DEFAULT_MAX_UNSERVED_FRACTION}.
   */
  readonly maxUnservedFraction?: number | undefined;
  /** Terminal floor(s) for the achieved interval. See {@link IntervalOptions}. */
  readonly terminalFloorIds?: readonly string[] | undefined;
  /** Departure clustering threshold for the achieved interval, seconds. */
  readonly departureGapS?: number | undefined;
}

/**
 * Everything a run says about itself over one window.
 *
 * ```ts
 * const summary = summarizeRun(record, { window: 'peak-5min' });
 * summary.waiting.meanS;              // AWT
 * summary.waiting.p95S;               // WT95
 * summary.waiting.pctOverLongWait;    // % > 60 s
 * summary.timeToDestination.meanS;    // TTD, spanning every leg of every journey
 * summary.handlingCapacity.personsPer5Min;
 * if (!summary.awtIsValid) suppressConfidenceInterval(summary.awtInvalidReason);
 * ```
 */
export function summarizeRun(record: RunRecord, options: SummarizeOptions = {}): RunSummary {
  const window = resolveWindow(record, options.window);
  const legsInWindow = selectLegsInWindow(record.passengers, window);
  const journeys = buildJourneys(record.passengers);
  const journeysInWindow = selectJourneysInWindow(journeys, window);

  const waiting = summarizeWaiting(legsInWindow, {
    ...(options.longWaitThresholdS === undefined
      ? {}
      : { longWaitThresholdS: options.longWaitThresholdS }),
    ...(options.percentileMethod === undefined
      ? {}
      : { percentileMethod: options.percentileMethod }),
    ...(options.waitHistogramBinSeconds === undefined
      ? {}
      : { histogramBinSeconds: options.waitHistogramBinSeconds }),
  });

  const percentileOptions = {
    ...(options.percentileMethod === undefined ? {} : { percentileMethod: options.percentileMethod }),
  };

  const rideTime = summarizeDurations(
    legsInWindow
      .map((leg) => rideSecondsOf(leg))
      .filter((seconds): seconds is number => seconds !== undefined),
    percentileOptions,
  );

  const timeToDestination = summarizeDurations(
    journeysInWindow
      .map((journey) => journey.timeToDestinationSeconds)
      .filter((seconds): seconds is number => seconds !== undefined),
    percentileOptions,
  );

  const carIds = options.carIds ?? record.carIds;
  const loadFactor = loadFactorStatistics(record.loadSamples, {
    window,
    ...(carIds === undefined ? {} : { carIds }),
    ...(options.loadFactorEdges === undefined ? {} : { edges: options.loadFactorEdges }),
    ...(options.designLoadFactor === undefined
      ? {}
      : { designLoadFactor: options.designLoadFactor }),
  });

  const handlingCapacity = handlingCapacityOf(record.passengers, window, record.population);

  const achievedInterval = achievedIntervalOf(record.passengers, {
    window,
    ...(options.terminalFloorIds === undefined
      ? {}
      : { terminalFloorIds: options.terminalFloorIds }),
    ...(options.departureGapS === undefined ? {} : { departureGapS: options.departureGapS }),
    ...(options.percentileMethod === undefined
      ? {}
      : { percentileMethod: options.percentileMethod }),
  });

  const recordedInWindow = record.queueSamples.filter((sample) => windowContains(window, sample.at));
  const useRecorded = recordedInWindow.length >= (options.saturation?.minSamples ?? SATURATION_DEFAULTS.minSamples);
  const queueSeries = useRecorded
    ? record.queueSamples
    : queueLengthSeries(record.passengers, {
        window,
        ...(options.queueSampleCount === undefined
          ? {}
          : { sampleCount: options.queueSampleCount }),
      });
  const saturation = detectSaturation(queueSeries, {
    window,
    ...(options.saturation === undefined ? {} : { thresholds: options.saturation }),
    source: useRecorded ? 'recorded' : 'derived',
  });

  const counts: RunCounts = Object.freeze({
    arrivals: legsInWindow.length,
    boarded: legsInWindow.filter((leg) => leg.boardedAt !== undefined).length,
    alighted: legsInWindow.filter((leg) => leg.alightedAt !== undefined).length,
    unserved: waiting.unservedCount,
    journeysStarted: journeysInWindow.length,
    journeysCompleted: journeysInWindow.filter((journey) => journey.isComplete).length,
    legsInRun: record.passengers.length,
  });

  const maxUnservedFraction = options.maxUnservedFraction ?? DEFAULT_MAX_UNSERVED_FRACTION;
  if (!Number.isFinite(maxUnservedFraction) || maxUnservedFraction < 0 || maxUnservedFraction > 1) {
    throw new MetricsError(
      `maxUnservedFraction must be a fraction in [0, 1]; received ${maxUnservedFraction}.`,
    );
  }
  const unservedFraction =
    waiting.arrivalCount === 0 ? 0 : waiting.unservedCount / waiting.arrivalCount;

  const awtInvalidReason = saturation.saturated
    ? `Queue length rose by ${saturation.projectedGrowthPersons.toFixed(1)} persons (${saturation.slopePersonsPerMinute.toFixed(2)}/min, ${saturation.growthToNoiseRatio.toFixed(1)}x the queue's own scatter) over the ${windowDurationS(window).toFixed(0)} s reporting window, against thresholds ${saturation.thresholds.minProjectedGrowthPersons} persons and ${saturation.thresholds.minSlopePersonsPerMinute}/min; the system is saturated, AWT is not approximately normal and its confidence interval must be suppressed.`
    : waiting.count === 0
      ? 'No passenger was served within the reporting window, so there is no waiting time to average.'
      : // Censoring is checked independently of the trend. AWT is computed over the legs that
        // boarded, and the legs that did not are systematically the ones that would have
        // waited longest — so a heavily censored window reports the mean of its fastest
        // survivors, and does so without the queue trend necessarily firing at all.
        unservedFraction > maxUnservedFraction
        ? `${waiting.unservedCount} of ${waiting.arrivalCount} arrivals in the reporting window (${(unservedFraction * 100).toFixed(1)}%) were never served, above the ${(maxUnservedFraction * 100).toFixed(1)}% censoring limit. AWT is the mean over the legs that boarded, which are systematically the passengers who waited least, so the reported mean is biased low by an unknown amount and its confidence interval must be suppressed.`
        : undefined;

  return Object.freeze({
    runId: record.runId,
    seed: record.seed,
    ...(record.buildingId === undefined ? {} : { buildingId: record.buildingId }),
    ...(record.dispatcherProfileId === undefined
      ? {}
      : { dispatcherProfileId: record.dispatcherProfileId }),
    ...(record.trafficProfileId === undefined ? {} : { trafficProfileId: record.trafficProfileId }),
    window,
    windowSeconds: windowDurationS(window),
    counts,
    waiting,
    rideTime,
    timeToDestination,
    loadFactor,
    handlingCapacity,
    achievedInterval,
    saturation,
    awtIsValid: awtInvalidReason === undefined,
    ...(awtInvalidReason === undefined ? {} : { awtInvalidReason }),
  });
}

/* -------------------------------------------------------------------------- *
 * Convenience accessors
 * -------------------------------------------------------------------------- */

/** Leg durations (wait + ride) for a set of legs, over the legs that completed. */
export function legDurations(legs: readonly PassengerRecord[]): number[] {
  return legs
    .map((leg) => legSecondsOf(leg))
    .filter((seconds): seconds is number => seconds !== undefined);
}

/** A single percentile of a set of legs' waiting times. `NaN` when none boarded. */
export function waitPercentile(
  legs: readonly PassengerRecord[],
  percent: number,
  method: PercentileMethod = DEFAULT_PERCENTILE_METHOD,
): number {
  const waits = legs
    .map((leg) => waitSecondsOf(leg))
    .filter((seconds): seconds is number => seconds !== undefined);
  if (waits.length === 0) return Number.NaN;
  return percentileOfSorted(sortedAscending(waits), percent, method);
}

/* -------------------------------------------------------------------------- *
 * Tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

/**
 * Every reporting knob, declared so a generic optimizer — or a report generator — can vary it
 * without elevator-specific knowledge.
 *
 * These are *analysis* parameters, not model parameters: changing one re-reads a stored run
 * rather than re-simulating it. They are declared for the same reason the model's are, that a
 * tunable which is not declared is a tunable somebody will hardcode.
 */
export const METRICS_PARAMETERS: readonly MetricsParameterSpec[] = [
  {
    id: 'metrics.reportWindow',
    type: 'categorical',
    values: ['full-run', 'peak-5min'],
    default: 'peak-5min',
    description:
      'Which window the cohort statistics cover. The CIBSE rise-and-fall template reports the peak 5 minutes; full-run is for the ISO constant-demand cross-check.',
  },
  {
    id: 'metrics.longWaitThresholdS',
    type: 'continuous',
    range: [0, 300],
    scale: 'linear',
    default: DEFAULT_LONG_WAIT_THRESHOLD_S,
    unit: 's',
    description:
      'Waiting time above which a passenger counts as a long wait. 60 s is the standard quality metric; the reported percentage is of waits strictly greater than this.',
  },
  {
    id: 'metrics.percentileMethod',
    type: 'categorical',
    values: ['linear', 'nearest-rank'],
    default: DEFAULT_PERCENTILE_METHOD,
    description:
      'Interpolation used for WT95 and every other percentile. linear is Hyndman & Fan type 7 (NumPy, R, Excel PERCENTILE.INC); nearest-rank is the classical order-statistic definition.',
  },
  {
    id: 'metrics.saturation.minSlopePersonsPerMinute',
    type: 'continuous',
    range: [0, 5],
    scale: 'linear',
    default: SATURATION_DEFAULTS.minSlopePersonsPerMinute,
    unit: 'persons/min',
    description:
      'Fitted queue growth rate at or above which a run may be flagged saturated. Derived against a 30-minute run, so it is the binding magnitude gate only for windows longer than that; shorter windows are governed by minProjectedGrowthPersons.',
  },
  {
    id: 'metrics.saturation.minProjectedGrowthPersons',
    type: 'continuous',
    range: [0, 100],
    scale: 'linear',
    default: SATURATION_DEFAULTS.minProjectedGrowthPersons,
    unit: 'persons',
    description:
      'Backlog, in people, that the fitted trend must accumulate across the reporting window before a run is flagged saturated. Stated in persons rather than persons per minute so that a peak-5-minute window demands proportionally more evidence than a whole-run one.',
  },
  {
    id: 'metrics.saturation.minGrowthToNoiseRatio',
    type: 'continuous',
    range: [0, 10],
    scale: 'linear',
    default: SATURATION_DEFAULTS.minGrowthToNoiseRatio,
    description:
      "How many times the queue's own residual scatter the fitted growth must exceed. The noise-aware gate: it is what keeps the verdict scale-free between a lobby that swings by one person and one that swings by fifteen.",
  },
  {
    id: 'metrics.saturation.minTStatistic',
    type: 'continuous',
    range: [0, 10],
    scale: 'linear',
    default: SATURATION_DEFAULTS.minTStatistic,
    description:
      'Smallest slope t-statistic that counts as a trend. A sanity gate only: queue-length residuals are autocorrelated, so this statistic is optimistic and is never trusted alone.',
  },
  {
    id: 'metrics.maxUnservedFraction',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: DEFAULT_MAX_UNSERVED_FRACTION,
    description:
      'Fraction of a window’s arrivals that may go unserved before its AWT is marked invalid. AWT averages the legs that boarded, so unserved legs are censored observations and censored in the direction that flatters the result.',
  },
  {
    id: 'metrics.departureGapS',
    type: 'continuous',
    range: [0, 120],
    scale: 'linear',
    default: DEFAULT_DEPARTURE_GAP_S,
    unit: 's',
    description:
      'Longest pause between two boardings by the same car at the terminal that still counts as one departure, when reconstructing the achieved interval from boarding times.',
  },
  {
    id: 'metrics.saturation.minSamples',
    type: 'integer',
    range: [3, 1000],
    scale: 'linear',
    default: SATURATION_DEFAULTS.minSamples,
    description:
      'Fewest queue-length samples that can produce a verdict. Below this the diagnosis is insufficient-samples, which is reported as unknown rather than as stable.',
  },
  {
    id: 'metrics.designLoadFactor',
    type: 'continuous',
    range: [0.6, 1],
    scale: 'linear',
    default: DEFAULT_DESIGN_LOAD_FACTOR,
    description:
      'Fill fraction the time-at-design-load statistic is measured against. 0.8, matching the traffic-analysis assumption; 1.0 makes every capacity conclusion optimistic.',
  },
];
