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
 * Both of those are proxies for one question — *did the backlog clear?* — and neither sees the
 * third shape it comes in: a queue that grew enormously and then drained **before** the horizon.
 * Such a run reports `completed`, nought unserved, and a trend diluted by its own hump, and it
 * publishes a mean beside a passenger who waited a quarter of an hour. {@link diagnoseServiceLevel}
 * is the gate for that, and {@link RunSummary.serviceLevel} carries its evidence; see
 * `the root DECISIONS.md` for the counterexample that found it.
 *
 * ## Both halves of the Phase 2 oracle live here
 *
 * {@link handlingCapacityOf} is the achieved counterpart of the closed form's `HC5` and
 * {@link achievedIntervalOf} of its `INT`. docs/05-roadmap.md asks for both to match
 * `analytical/` "within a few percent" under pure up-peak, so both are computed from the same
 * record, in the same units, over the same window.
 *
 * They must also agree with **each other**: `HC5 = 300·P·L/RTT` and `INT = RTT/L` are the same
 * statement, so the round trip the interval implies and the one the throughput implies have to
 * match. `metrics/consistency.test.ts` asserts that on both Phase 2 buildings, with `P` taken
 * from the record's load samples so the check is not circular. It is worth more than either
 * comparison against the closed form: it caught a departure-clustering threshold that was
 * shorter than a door reopen, which no agreement-within-a-few-percent band did.
 */

import type { SimTime } from '../kernel/types.js';

import { diagnoseAwtValidity } from './awtValidity.js';
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
  type AbandonmentStatistics,
  type CarTimings,
  type DepartureGapBasis,
  type DurationStatistics,
  type EnergyStatistics,
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
  type ServiceLevelDiagnosis,
  type ServiceLevelVerdict,
  type TravelSample,
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

/**
 * Fraction of a window's arrivals that may **walk out** before its AWT stops being quotable
 * (docs/14 § 3.1).
 *
 * Lower than {@link DEFAULT_MAX_UNSERVED_FRACTION}, and deliberately: an unserved leg is a leg the
 * mean *omits*, while an abandoned leg is one the passenger has deleted from the sample at
 * precisely the moment it would have become the worst observation in it. Censoring biases the mean
 * low; abandonment biases it low **and** hides the evidence, because the queue then drains, the
 * window reports as fully served and the trend test flattens.
 *
 * 2 % is where that bias becomes bigger than the effects this project publishes. The dispatcher
 * comparisons here turn on differences of a second or two in AWT; losing the top 2 % of a wait
 * distribution moves a mean by more than that on every shipped building, so a run past this limit
 * cannot be compared with one below it whatever its interval says.
 */
export const DEFAULT_MAX_ABANDONMENT_FRACTION = 0.02;

/**
 * Seconds a passenger may be known to have waited before the window's AWT stops being quotable.
 *
 * **900 s — fifteen minutes.** Not a service-quality target and not tuned to make anything pass:
 * it is the point past which a wait stops being a bad wait and becomes evidence that the
 * passenger was *forgotten*, and it is chosen the same way `DEFAULT_MAX_UNSERVED_FRACTION` is —
 * from the distance to the regime the project actually publishes in.
 *
 * - docs/03-traffic-and-statistics.md treats anything past **60 s** as a bad wait, and
 *   {@link DEFAULT_LONG_WAIT_THRESHOLD_S} is the metric built on that.
 * - The shipped operating points run at **10–30 s AWT**. A quarter of an hour is between one and
 *   two orders of magnitude out.
 * - **Measured**, over the shipped operating points at every shipped dispatcher profile, at the
 *   budgets the benchmark actually uses — `benchmark/saturationCensus.test.ts` re-measures all of
 *   these and asserts the margin, so none of them can go stale:
 *
 *   | operating point | n | longest single wait | margin |
 *   |---|---|---|---|
 *   | Midtown Office, up-peak 1 % | 250 | 203.7 s (`destination-panel`) | 4.4× |
 *   | Garden Apartments, residential 2 %, full run | 500 | 136.6 s (`destination-panel`) | 6.6× |
 *   | Secure Tower, up-peak 2 % | 150 | 121.2 s (`nearest-car`) | 7.4× |
 *   | Midtown Office, interfloor-mix 1.5 %, full run | 1000 | **344.8 s** (`nearest-car`) | **2.6×** |
 *
 *   Every replication of every one of those cells comes back `served`. The cells that *do* produce
 *   longer waits — Secure Tower interfloor-mix under the conventional arms — are already unquotable
 *   on gates 1 and 2 from replication index 0, and are published as counts rather than as an
 *   interval (`benchmark/arms.ts`, `admissibleReplications: 0`). So this horizon sits clear above
 *   everything the project publishes and below everything it already refuses to.
 *
 * **It is deliberately the same number as `fuzz/types.ts`'s `PROPERTY_BOUNDS.starvationBoundS`,
 * and deliberately not imported from it.** The project should state one abandonment horizon, and
 * it belongs in the model rather than in a test bound — which is the handback `the root DECISIONS.md`
 * § D83 made. The fuzz property keeps its own copy on purpose: it scans the *whole record*
 * including legs outside the report window, it re-derives servability from the building, and a
 * constant shared between a check and the thing it checks makes the check vacuous. See
 * `the root DECISIONS.md` § T21-D3 for what P6 still catches that this does not.
 */
export const DEFAULT_MAX_WAIT_HORIZON_S = 900;

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

    // A journey whose last segment is the building's escalator is complete when the passenger
    // reaches the far landing, not when they step off the lift. The seconds are a constant on
    // the leg rather than an event, because nothing a dispatcher does can change them — but
    // dropping them would make removing a spurious lift leg look like free time saved.
    const alightedAt = last.alightedAt;
    const isComplete = last.isFinalLeg && alightedAt !== undefined;
    const completedAt =
      isComplete && alightedAt !== undefined
        ? alightedAt + (last.egressTransitSeconds ?? 0)
        : undefined;
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
 * Service level — the tail the trend test cannot see
 * -------------------------------------------------------------------------- */

export interface ServiceLevelOptions {
  /**
   * The time an unserved leg's wait is censored at — `RunRecord.endedAt`.
   *
   * The **run's** end, not the window's. A leg that arrived inside a peak-5-minute window and was
   * still on the landing when the run finished waited at least until the run finished, and
   * clipping that to the window edge would understate it by however long the run continued.
   */
  readonly censoredAtS: SimTime;
  /** Seconds past which a wait makes the mean unquotable. Default {@link DEFAULT_MAX_WAIT_HORIZON_S}. */
  readonly horizonS?: number | undefined;
}

/**
 * The longest wait in a cohort, and whether it is past the horizon. Pure.
 *
 * Takes legs **already selected to the window** — the same contract as {@link summarizeWaiting},
 * so the two describe the same cohort by construction rather than by two selections that could
 * drift apart.
 *
 * Three deliberate choices, each of which a simpler version got wrong:
 *
 * - **An unserved leg counts, at its lower bound.** Its wait is unknown but is at least
 *   `censoredAtS - arrivedAt`, and dropping it would blind the gate exactly where service is
 *   worst — the same censoring argument `DEFAULT_MAX_UNSERVED_FRACTION` is built on, applied to
 *   the tail instead of the mean.
 * - **The comparison is strict.** A wait of exactly the horizon is not past it, matching
 *   {@link DurationStatistics} conventions and `pctOverLongWait`.
 * - **Ties go to the first leg in record order**, so the named passenger is deterministic and
 *   does not depend on `Array.prototype.sort` stability or on `Map` iteration.
 *
 * @throws MetricsError if the horizon is not a finite, non-negative number of seconds.
 */
export function diagnoseServiceLevel(
  legs: readonly PassengerRecord[],
  options: ServiceLevelOptions,
): ServiceLevelDiagnosis {
  const horizonS = options.horizonS ?? DEFAULT_MAX_WAIT_HORIZON_S;
  if (!Number.isFinite(horizonS) || horizonS < 0) {
    throw new MetricsError(
      `Maximum-wait horizon must be a finite, non-negative number of seconds; received ${horizonS}.`,
    );
  }
  const censoredAtS = options.censoredAtS;

  let longestWaitS = Number.NaN;
  let longest: PassengerRecord | undefined;
  let longestIsCensored = false;
  let overHorizonCount = 0;

  for (const leg of legs) {
    /*
     * **An abandoned leg's wait is known, not censored** (docs/14 § 3.1).
     *
     * A leg that never boarded is normally a lower bound — it was still standing there when the
     * clock stopped, so `censoredAtS - arrivedAt` is the least it could have waited. A leg whose
     * rider *left* is the opposite case: their wait ended, exactly, at the moment they walked
     * out. Reading it as censored would credit them with every second between their departure
     * and the end of the run — up to twenty-five minutes on a half-hour horizon — and report a
     * `starved` verdict about somebody who was not there. `abandonedAt` is absent on every leg of
     * every run that declares no patience, so this term is inert on the shipped path.
     */
    const endedAtS = leg.boardedAt ?? leg.abandonedAt ?? censoredAtS;
    const censored = leg.boardedAt === undefined && leg.abandonedAt === undefined;
    // A leg that arrived after the censoring instant (a record whose horizon precedes its last
    // arrival) would otherwise contribute a negative wait and drag the maximum down; clamp at 0
    // rather than let a malformed record understate the tail.
    const waitS = Math.max(0, endedAtS - leg.arrivedAt);
    if (waitS > horizonS) overHorizonCount += 1;
    if (longest === undefined || waitS > longestWaitS) {
      longestWaitS = waitS;
      longest = leg;
      longestIsCensored = censored;
    }
  }

  const verdict: ServiceLevelVerdict =
    longest === undefined ? 'no-arrivals' : overHorizonCount > 0 ? 'starved' : 'served';

  return Object.freeze({
    verdict,
    starved: verdict === 'starved',
    horizonS,
    longestWaitS,
    longestWaitIsCensored: longestIsCensored,
    ...(longest === undefined
      ? {}
      : {
          longestWaitLegId: longest.passengerId,
          longestWaitOriginFloorId: longest.originFloorId,
          longestWaitDestinationFloorId: longest.destinationFloorId,
        }),
    overHorizonCount,
    arrivalCount: legs.length,
    censoredAtS,
  });
}

/* -------------------------------------------------------------------------- *
 * Energy
 * -------------------------------------------------------------------------- */

/**
 * What the fleet spent moving, over the window.
 *
 * **Window membership is by arrival time and is half-open**, `[startS, endS)`, exactly as a leg's
 * is — a {@link TravelSample} is stamped with the instant the car levelled. A move is charged
 * whole to the window it finished in rather than split across a boundary, for the same reason a
 * leg is: a fractional charge would need the motion profile, the record does not carry it, and a
 * proportional split by time would be wrong anyway because an S-curve does not spend its metres
 * uniformly.
 *
 * **`undefined` samples are not zero samples.** A record with no `travelSamples` reports
 * `measured: false` and `NaN` throughout, so a downstream Pareto front suppresses the axis rather
 * than making every arm tie on it. An empty array is treated the same way and for the same
 * reason: the recorder omits the field rather than writing `[]`, so an empty array can only have
 * come from a caller constructing a record by hand.
 *
 * @param servedLegCount legs that alighted in the window, for {@link EnergyStatistics.workPerServedLegKJ}.
 */
export function energyStatistics(
  samples: readonly TravelSample[] | undefined,
  options: { readonly window: ReportWindow; readonly servedLegCount: number },
): EnergyStatistics {
  const window = assertWindow(options.window);
  if (samples === undefined || samples.length === 0) {
    return Object.freeze({
      measured: false,
      workKJ: Number.NaN,
      distanceM: Number.NaN,
      starts: Number.NaN,
      workPerServedLegKJ: Number.NaN,
      movingCarCount: Number.NaN,
    });
  }

  let workJ = 0;
  let distanceM = 0;
  let starts = 0;
  const cars = new Set<string>();
  for (const sample of samples) {
    if (!windowContains(window, sample.at)) continue;
    workJ += sample.workJ;
    distanceM += sample.distanceM;
    starts += 1;
    cars.add(sample.carId);
  }

  const workKJ = workJ / 1000;
  return Object.freeze({
    measured: true,
    workKJ,
    distanceM,
    starts,
    // NaN rather than Infinity when nothing was served: "the fleet drove and delivered nobody"
    // has no per-passenger cost, and Infinity would sort as the worst finite value in a front.
    workPerServedLegKJ: options.servedLegCount > 0 ? workKJ / options.servedLegCount : Number.NaN,
    movingCarCount: cars.size,
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
 * The window in which a departure-clustering threshold is safe, derived from a building's own
 * timings rather than chosen.
 *
 * A run record stores boardings, not departures, so a departure is reconstructed by splitting a
 * car's terminal boardings wherever they are far enough apart. "Far enough" has to sit between
 * two real quantities:
 *
 * - **above** the longest pause *inside* one loading. That is a door reopen — a late arrival
 *   puts a hand in the doors — and a reopen costs `openS + dwell + closeS`, because the doors
 *   must finish closing before they can start opening again. The dwell it earns is
 *   `max(policy dwell, transfer seconds)`, so a full load's transfer usually sets it.
 * - **below** the shortest genuine round trip: out to the nearest served floor and back, two
 *   flights plus two stops' worth of fixed overhead.
 *
 * A threshold under the first counts one loading as two departures and reports an interval that
 * is too short — flatteringly, which is the direction CLAUDE.md § Statistical discipline warns
 * about. A threshold over the second merges two round trips and reports one that is too long.
 * *Between* them the answer is genuinely insensitive to the exact value, which is what makes
 * {@link DepartureGapBracket.gapS} defensible.
 *
 * On the two buildings Phase 2 is validated against, with `P` the integer design load:
 *
 * | | `openS` | dwell | `P·tp` | `closeS` | max reopen | min round trip | derived gap |
 * |---|---|---|---|---|---|---|---|
 * | Midtown Office · main | 1.8 | 5.0 | 12 × 1.20 = 14.4 | 3.0 | **19.2 s** | 29.0 s | 24.1 s |
 * | Garden Apartments · main | 2.5 | 5.0 | 8 × 1.75 = 14.0 | 4.0 | **20.5 s** | 36.5 s | 28.5 s |
 *
 * (Those `min round trip` figures come from the cars' rated kinematics. The runner flies them
 * under the dispatcher profile's comfort envelope, which is slower — 30.5 s and a 24.8 s gap on
 * Midtown. Either lands in the same empty band, which is the point of a bracket.)
 *
 * Both max-reopen figures are about twice the 10 s the default used to be — and so is the
 * *bare* reopen at the policy dwell, 9.8 s and 11.5 s. The gap histogram over 128 replications
 * of each is cleanly bimodal about the bracket: a spike at exactly that bare reopen cost,
 * nothing between ~20 s and ~30 s, then real round trips. That empty band is the bracket,
 * measured.
 *
 * **The bracket can be empty**, and on three of the fourteen shipped banks it is — a 20-person car
 * whose first served floor is one floor up can hold its doors longer than it takes to go up and
 * come back:
 *
 * | bank | `P·tp` | max reopen | min round trip |
 * |---|---|---|---|
 * | Mixed-Use High-Rise · residential-local | 16 × 1.75 = 28.0 | 32.8 s | 31.3 s |
 * | Vertical City · shuttle | 20 × 1.75 = 35.0 | 39.8 s | 30.0 s |
 * | Vertical City · zone-6-local | 16 × 1.75 = 28.0 | 32.8 s | 30.0 s |
 *
 * That is a real limit of reconstructing departures from boarding times, not a tuning problem —
 * see the `@throws` on {@link departureGapBracket}. `achievedIntervalOf` reports it as
 * `departureGapBasis: 'unmeasurable'` and returns no interval.
 *
 * Both mixed-use towers' **terminals** land there too, for a second reason: the worst case is
 * taken across every bank serving the terminal, and at Mixed-Use's ground lobby a shuttle holding
 * its doors 39.8 s shares the floor with an office-local car whose whole round trip is 31.3 s. Two
 * banks with duty cycles that different do not have one achieved interval between them, whatever
 * threshold is chosen, so refusing to report one is the correct answer rather than a limitation.
 * Vertical City's ground lobby is the same shape and worse: 39.8 s against 30.0 s.
 *
 * ## An empty bracket is not the only thing worth naming — a **narrow** one is (C21)
 *
 * This section used to stop at the three empty brackets, which reads as though every other bank has
 * comfortable headroom. It does not. Re-measured across all fourteen shipped banks, band width
 * `minRoundTrip − maxReopen`, narrowest first:
 *
 * | bank | max reopen | min round trip | **band** |
 * |---|---|---|---|
 * | **Vertical City · zone-5-local** | 28.80 s | 30.03 s | **1.23 s** |
 * | Vertical City · zone-1-local / zone-2-local | 26.40 s | 30.03 s | 3.63 s |
 * | Secure Tower · low | 24.00 s | 30.83 s | 6.83 s |
 * | … six more, 7.23 s to 34.83 s … | | | |
 * | Secure Tower · high | 24.00 s | 59.43 s | 35.43 s |
 *
 * `zone-5-local`'s band is **1.23 s wide** — 2.95× tighter than the next narrowest and 28.8× below
 * the widest — and {@link departureGapBracket} still returns a `bracket-midpoint` there with no
 * warning of any kind, because the bracket is non-empty and that is the only question the function
 * asks. That bank is 1.23 s of authored timing away from joining the three above, and a reader of
 * the empty-bracket table alone would not know it. The figure is measured here rather than
 * transcribed: an earlier statement of it said "5× tighter than the next", which the fourteen-bank
 * sweep does not reproduce.
 *
 * It is **not** turned into a warning threshold. "How narrow is too narrow" is a judgement, the
 * bracket's whole argument is that any value strictly inside it works, and a constant chosen here
 * would be exactly the kind of hidden tolerance {@link DEPARTURE_GAP_REOPEN_MARGIN} is written not
 * to be. It is named so that the next person to change a car's `passengerTransferS` or a zone's
 * first hop knows which bank goes first.
 */
export interface DepartureGapBracket {
  /** `openS + max(hall dwell, car dwell, P·tp) + closeS`, seconds. The lower bound. */
  readonly maxReopenS: number;
  /**
   * Terminal to the nearest served floor and back, seconds — the upper bound. `undefined` when
   * {@link CarTimings.nearestFloorFlightS} was not supplied, in which case there is nothing to
   * check the threshold against from above.
   */
  readonly minRoundTripS: number | undefined;
  /** The threshold to use: the bracket midpoint, or a margin above the reopen bound. */
  readonly gapS: number;
  /** Which of those two {@link gapS} is. */
  readonly basis: 'bracket-midpoint' | 'reopen-margin';
}

/**
 * Fraction above {@link DepartureGapBracket.maxReopenS} to sit when there is no upper bound.
 *
 * Any value strictly above the reopen bound separates a reopen from a return, so this margin is
 * only insurance against the bound itself being slightly understated — an adaptive dwell that
 * ran longer than its policy value, say. 25 % of a ~20 s reopen is ~5 s, which stays far below
 * the shortest round trip any shipped building has (30.5 s, on the building with the *fastest*
 * cars and the *shortest* first hop).
 */
export const DEPARTURE_GAP_REOPEN_MARGIN = 0.25;

/**
 * The departure-clustering threshold this building's doors imply. See {@link DepartureGapBracket}.
 *
 * Pure, and total on well-formed input: every timing must be finite and non-negative.
 *
 * @throws MetricsError if a timing is not finite and non-negative, or if the bracket is empty —
 *   the longest reopen is at least the shortest round trip, so **no** threshold can separate
 *   the two and departures cannot be reconstructed from boarding times at all. That is a
 *   statement about the building, not about this function: it needs a car-position series
 *   instead. Three of the fourteen shipped banks are in that position, and so are both mixed-use
 *   towers' terminals — see the table on {@link DepartureGapBracket}. A caller measuring a metric
 *   rather than asking for a bracket should let `achievedIntervalOf` report it as
 *   `departureGapBasis: 'unmeasurable'` instead of catching this.
 */
export function departureGapBracket(timings: CarTimings): DepartureGapBracket {
  const attempt = bracketOrEmpty(timings);
  if (attempt.kind === 'empty') {
    throw new MetricsError(
      `The longest door reopen (${attempt.maxReopenS.toFixed(2)} s) is not shorter than the shortest ` +
        `round trip (${attempt.minRoundTripS.toFixed(2)} s), so no clustering threshold can tell a reopen ` +
        'from a car that left and came back. Reconstruct departures from car motion instead of ' +
        'from boarding times.',
    );
  }
  return attempt.bracket;
}

/** What {@link departureGapBracket} computes, before deciding whether to throw about it. */
type BracketAttempt =
  | { readonly kind: 'bracket'; readonly bracket: DepartureGapBracket }
  | { readonly kind: 'empty'; readonly maxReopenS: number; readonly minRoundTripS: number };

/**
 * The bracket, or the verdict that there is none, without throwing about the latter.
 *
 * Two callers need the same arithmetic and disagree only about what an empty bracket *means*:
 * {@link departureGapBracket} treats it as an exception because its job is to hand back a
 * threshold, and {@link resolveDepartureGapS} treats it as an answer because its job is to
 * report how an interval was measured. A malformed timing is a caller bug either way, so that
 * still throws from here.
 */
function bracketOrEmpty(timings: CarTimings): BracketAttempt {
  const required = [
    ['doorOpenS', timings.doorOpenS],
    ['doorCloseS', timings.doorCloseS],
    ['dwellHallCallS', timings.dwellHallCallS],
    ['dwellCarCallS', timings.dwellCarCallS],
    ['fullLoadTransferS', timings.fullLoadTransferS],
  ] as const;
  const optional = [
    ['nearestFloorFlightS', timings.nearestFloorFlightS],
    ['motorStartDelayS', timings.motorStartDelayS],
    ['levelingSettleS', timings.levelingSettleS],
  ] as const;
  for (const [name, value] of required) {
    if (!Number.isFinite(value) || (value as number) < 0) {
      throw new MetricsError(
        `Car timing ${name} must be a finite, non-negative number of seconds; received ${value}.`,
      );
    }
  }
  for (const [name, value] of optional) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new MetricsError(
        `Car timing ${name} must be a finite, non-negative number of seconds when supplied; received ${value}.`,
      );
    }
  }

  const maxReopenS =
    timings.doorOpenS +
    Math.max(timings.dwellHallCallS, timings.dwellCarCallS, timings.fullLoadTransferS) +
    timings.doorCloseS;

  if (timings.nearestFloorFlightS === undefined) {
    return {
      kind: 'bracket',
      bracket: {
        maxReopenS,
        minRoundTripS: undefined,
        gapS: maxReopenS * (1 + DEPARTURE_GAP_REOPEN_MARGIN),
        basis: 'reopen-margin',
      },
    };
  }

  // The absent motion terms default to 0 rather than to a typical value: that shortens the
  // shortest round trip, which tightens the bracket. Erring toward "these two are too close to
  // separate" is the safe direction for a check whose job is to refuse a bad threshold.
  const legS =
    timings.doorCloseS +
    (timings.motorStartDelayS ?? 0) +
    timings.nearestFloorFlightS +
    (timings.levelingSettleS ?? 0) +
    timings.doorOpenS;
  const minRoundTripS = 2 * legS + timings.dwellHallCallS + timings.dwellCarCallS;

  if (!(maxReopenS < minRoundTripS)) return { kind: 'empty', maxReopenS, minRoundTripS };
  return {
    kind: 'bracket',
    bracket: {
      maxReopenS,
      minRoundTripS,
      gapS: (maxReopenS + minRoundTripS) / 2,
      basis: 'bracket-midpoint',
    },
  };
}

/**
 * Departure-clustering threshold for a record that does not carry its {@link CarTimings}.
 *
 * **A fallback, not a derivation.** The honest value is `departureGapBracket(...)` off the
 * cars that ran; this exists so a record written without timings — an old one, a synthetic
 * one, a hand-built fixture — still produces a number instead of an exception, and it announces
 * itself through {@link IntervalStatistics.departureGapBasis} as `fallback`.
 *
 * **No run the simulator performs reaches it.** `sim/simulation.ts` assembles `CarTimings` off the
 * cars it built and attaches them to every record, so every shipped building reports either
 * `derived` (Midtown Office 24.1 s, Garden Apartments 28.5 s, Secure Tower 27.4 s) or
 * `unmeasurable` (both mixed-use towers). That was not true when this constant was introduced —
 * the recorder was constructed without `carTimings`, so every real run reported `fallback` and
 * this value, and the derivation below ran only in tests. `sim/simulation.test.ts` now asserts the
 * basis is `derived` on Midtown and Garden so the wiring cannot be dropped again.
 *
 * **26.5 s** — the midpoint of the *intersection* of the brackets of every bank an achieved
 * interval is currently measured on:
 *
 * | building / bank | max reopen | min round trip |
 * |---|---|---|
 * | Midtown Office · main | 19.2 s | 29.0 s |
 * | Garden Apartments · main | 20.5 s | 36.5 s |
 * | Secure Tower · low | 24.0 s | 30.8 s |
 * | Secure Tower · high | 24.0 s | 59.4 s |
 * | **intersection** | **24.0 s** | **29.0 s** |
 *
 * `metrics/interval.test.ts` re-derives that table from `data/` and asserts this constant lies
 * inside every row of it, so reference data that invalidates it fails a test instead of quietly
 * biasing an interval. Fix such a failure by supplying {@link CarTimings}, **not** by retuning
 * this number.
 *
 * The margin is 2.5 s either side, and it does not extend to the rest of `data/buildings`. The same
 * test surveys all fourteen shipped banks at the transfer time each car is actually charged, and
 * the survey does not overlap:
 *
 * - the mixed-use towers' shuttles reopen for up to **39.8 s** (a 20-person car at the residential
 *   1.75 s), which is longer than Midtown Office's *entire* shortest round trip of 29.0 s;
 * - **three of the fourteen** — Mixed-Use's `residential-local`, Vertical City's `shuttle` and
 *   `zone-6-local` — have no valid bracket at all;
 * - and this constant is at or below the reopen bound of **five** of them (both shuttles, both
 *   residential locals and Vertical City's hotel zone), so using it there would split one loading
 *   into two departures, which is the original defect.
 *
 * **No constant can cover an arbitrary building.** That is asserted too, so this cannot be mistaken
 * for the answer. Those assertions are load-bearing and they are only true because every car in
 * `data/buildings` declares or resolves its own `passengerTransferS`: at a uniform office 1.2 s the
 * worst reopen across all fourteen banks falls to 28.8 s against a 29.0 s minimum ceiling, no
 * bracket is empty, and a single constant *would* be safe everywhere by a 0.2 s margin. The
 * survey previously modelled 1.75 s on cars the simulator charged 1.2 s, which made the premise an
 * assumption of the test rather than a property of the data. It is now a property of the data.
 *
 * The previous value, 10 s, was below the reopen bound of *every* bank in `data/buildings`, so
 * any loading that reopened counted as two departures and the interval read short —
 * flatteringly. Measured over 16 replications at a 1800 s peak: Midtown Office 44.3 s against
 * 47.8 s (−7.4 %), Garden Apartments 51.4 s against 60.2 s (−14.6 %). That is the defect this
 * constant replaces. On both of those buildings this fallback and the derived threshold return
 * the *same* interval to the last decimal — which is what a value inside the bracket means.
 */
export const FALLBACK_DEPARTURE_GAP_S = 26.5;

/**
 * @deprecated Renamed to {@link FALLBACK_DEPARTURE_GAP_S}, which says what it is. Kept as an
 * alias so existing importers keep compiling; there is no separate "default" any more —
 * a threshold is either derived from {@link CarTimings} or it is this fallback.
 */
export const DEFAULT_DEPARTURE_GAP_S = FALLBACK_DEPARTURE_GAP_S;

/**
 * {@link achievedIntervalOf}'s threshold, and where it came from. Pure.
 *
 * Four outcomes, matching {@link DepartureGapBasis}. The one that needs explaining is
 * `unmeasurable`: when {@link CarTimings} are supplied and {@link departureGapBracket} rejects
 * them because the bracket is empty, that is **not** an error in the caller's request — it is the
 * honest answer to it. The building cannot have its departures reconstructed from boarding times
 * at any threshold, so this returns `NaN` and lets `achievedIntervalOf` report no interval.
 * Falling back to {@link FALLBACK_DEPARTURE_GAP_S} there would be the worst option available:
 * that constant is inside no bracket on such a building, so the number would be meaningless *and*
 * indistinguishable from the cases where it is sound.
 *
 * `departureGapBracket` itself still throws, and callers who want the bracket rather than a
 * metric still get the exception.
 */
export function resolveDepartureGapS(options: {
  readonly departureGapS?: number | undefined;
  readonly carTimings?: CarTimings | undefined;
}): { readonly gapS: number; readonly basis: DepartureGapBasis } {
  if (options.departureGapS !== undefined) {
    if (!Number.isFinite(options.departureGapS) || options.departureGapS < 0) {
      throw new MetricsError(
        `Departure gap must be a non-negative number of seconds; received ${options.departureGapS}.`,
      );
    }
    return { gapS: options.departureGapS, basis: 'explicit' };
  }
  if (options.carTimings !== undefined) {
    const attempt = bracketOrEmpty(options.carTimings);
    // A malformed timing still throws out of `bracketOrEmpty`; only the empty-bracket *verdict*
    // degrades, and it degrades to `NaN` rather than to the fallback constant.
    return attempt.kind === 'empty'
      ? { gapS: Number.NaN, basis: 'unmeasurable' }
      : { gapS: attempt.bracket.gapS, basis: 'derived' };
  }
  return { gapS: FALLBACK_DEPARTURE_GAP_S, basis: 'fallback' };
}

export interface IntervalOptions {
  readonly window: ReportWindow;
  /**
   * Floors whose boardings count as terminal departures. Defaults to the single floor with
   * the most in-window boardings — the lobby, under up-peak — which is reported back on
   * {@link IntervalStatistics.terminalFloorId}.
   */
  readonly terminalFloorIds?: readonly string[] | undefined;
  /**
   * Timings of the cars serving the terminal, which the clustering threshold is derived from.
   * Overrides `RunRecord.carTimings`. Ignored when {@link departureGapS} is given.
   */
  readonly carTimings?: CarTimings | undefined;
  /**
   * Departure clustering threshold, seconds. Overrides the derivation — pass it to re-threshold
   * a stored run, or when the timings are not to hand. Absent both, the derivation runs off
   * {@link carTimings}, and absent that too, {@link FALLBACK_DEPARTURE_GAP_S}.
   */
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
 * **The threshold is derived, not chosen** — see {@link departureGapBracket}. The pause a door
 * reopen leaves inside one loading is `openS + max(dwell, P·tp) + closeS`, around 20 s on both
 * shipped buildings, so a plausible-sounding constant splits one loading into two departures
 * and reports an interval up to 18 % short. Supply {@link CarTimings} (on the record or in
 * these options) and this is computed from the doors that ran.
 *
 * Three deliberate choices:
 *
 * - **Boardings, not arrivals at the floor.** A car that stops at the lobby and takes nobody
 *   has not made a trip; the interval that matters to a waiting passenger is between the
 *   departures that carried people.
 * - **Legs without a `carId` are skipped**, and reported in the difference between
 *   {@link IntervalStatistics.boardingCount} and the window's boardings. A departure is a
 *   *car* leaving, and there is no honest way to reconstruct one without knowing which car.
 * - **The provenance of the threshold is reported**, on
 *   {@link IntervalStatistics.departureGapBasis}. A `fallback` interval and a `derived` one are
 *   not equally trustworthy and the number alone does not say which it is.
 *
 * And one case where the honest answer is no answer: when the supplied {@link CarTimings} prove
 * the bracket is empty, **no interval is reported at all** — every duration is `NaN`, the counts
 * are 0 and the basis is `unmeasurable`. Both mixed-use towers' terminals are in that position,
 * because a shuttle holding its doors for a full 20-person load at 1.75 s outlasts the shortest
 * round trip an office-local car beside it can make. Reporting
 * {@link FALLBACK_DEPARTURE_GAP_S} there would be a number from outside every bracket, dressed as
 * a measurement.
 *
 * The spread matters as much as the mean here — see {@link IntervalStatistics}.
 */
export function achievedIntervalOf(
  records: readonly PassengerRecord[],
  options: IntervalOptions,
): IntervalStatistics {
  const window = assertWindow(options.window);
  const { gapS: departureGapS, basis: departureGapBasis } = resolveDepartureGapS(options);
  const percentileMethod = options.percentileMethod ?? DEFAULT_PERCENTILE_METHOD;

  // No threshold exists on this building, so no grouping is attempted. Returning the empty
  // statistics is not a degraded measurement — it is the absence of one, which is what the
  // caller must see rather than a plausible number derived from nothing.
  if (departureGapBasis === 'unmeasurable') {
    return Object.freeze({
      ...summarizeDurations([], { percentileMethod }),
      departureCount: 0,
      carCount: 0,
      boardingCount: 0,
      coefficientOfVariation: Number.NaN,
      departureGapS,
      departureGapBasis,
    });
  }

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
    departureGapBasis,
  });
}

/* -------------------------------------------------------------------------- *
 * Abandonment
 * -------------------------------------------------------------------------- */

/**
 * How many riders in this cohort walked out, and how long they stood there first.
 *
 * **Returns `undefined` when nobody did**, which is every run that declares no `sim.patience` —
 * and that is what keeps the key off `RunSummary` and the whole result byte-identical to one
 * produced before abandonment existed (docs/14 § 5 criterion 1). `0` would be a different claim
 * and a different object.
 *
 * `arrivalCount` is passed in rather than recomputed from `legs.length`, so the denominator here
 * is provably the one {@link summarizeWaiting} used: two counts of the same cohort computed two
 * ways are two answers waiting to disagree, and the *ratio* is what the fifth `awtIsValid` ground
 * is decided on.
 *
 * `legs` is expected to be pre-filtered to the window, exactly as {@link summarizeWaiting}'s is.
 */
export function summarizeAbandonment(
  legs: readonly PassengerRecord[],
  arrivalCount: number,
): AbandonmentStatistics | undefined {
  let count = 0;
  let totalS = 0;
  let maxS = 0;
  for (const leg of legs) {
    if (leg.abandonedAt === undefined) continue;
    const stoodForS = leg.abandonedAt - leg.arrivedAt;
    count += 1;
    totalS += stoodForS;
    if (stoodForS > maxS) maxS = stoodForS;
  }
  if (count === 0) return undefined;
  return Object.freeze({
    count,
    arrivalCount,
    fraction: arrivalCount === 0 ? 0 : count / arrivalCount,
    meanWaitBeforeLeavingS: totalS / count,
    maxWaitBeforeLeavingS: maxS,
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
  /**
   * Fraction of a window's arrivals that may abandon before the AWT is marked invalid.
   * Default {@link DEFAULT_MAX_ABANDONMENT_FRACTION}.
   */
  readonly maxAbandonmentFraction?: number | undefined;
  /**
   * Seconds a passenger may be known to have waited before the AWT is marked invalid.
   * Default {@link DEFAULT_MAX_WAIT_HORIZON_S}.
   */
  readonly maxWaitHorizonS?: number | undefined;
  /** Terminal floor(s) for the achieved interval. See {@link IntervalOptions}. */
  readonly terminalFloorIds?: readonly string[] | undefined;
  /**
   * Car timings the departure-clustering threshold is derived from, overriding
   * `RunRecord.carTimings`. See {@link CarTimings} and {@link departureGapBracket}.
   */
  readonly carTimings?: CarTimings | undefined;
  /**
   * Departure clustering threshold for the achieved interval, seconds. Overrides the
   * derivation — see {@link IntervalOptions.departureGapS}.
   */
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

  const energy = energyStatistics(record.travelSamples, {
    window,
    servedLegCount: legsInWindow.filter((leg) => leg.alightedAt !== undefined).length,
  });

  const handlingCapacity = handlingCapacityOf(record.passengers, window, record.population);

  // The record's own timings are the honest source; options override them so a stored run can
  // be re-thresholded without being re-simulated.
  const carTimings = options.carTimings ?? record.carTimings;
  const achievedInterval = achievedIntervalOf(record.passengers, {
    window,
    ...(options.terminalFloorIds === undefined
      ? {}
      : { terminalFloorIds: options.terminalFloorIds }),
    ...(carTimings === undefined ? {} : { carTimings }),
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

  const maxAbandonmentFraction =
    options.maxAbandonmentFraction ?? DEFAULT_MAX_ABANDONMENT_FRACTION;
  if (
    !Number.isFinite(maxAbandonmentFraction) ||
    maxAbandonmentFraction < 0 ||
    maxAbandonmentFraction > 1
  ) {
    throw new MetricsError(
      `maxAbandonmentFraction must be a fraction in [0, 1]; received ${maxAbandonmentFraction}.`,
    );
  }
  const abandonment = summarizeAbandonment(legsInWindow, waiting.arrivalCount);

  const serviceLevel = diagnoseServiceLevel(legsInWindow, {
    censoredAtS: record.endedAt,
    ...(options.maxWaitHorizonS === undefined ? {} : { horizonS: options.maxWaitHorizonS }),
  });

  /*
   * One call, and every branch of it lives in `awtValidity.ts`. The four grounds used to be a
   * nested conditional here that produced prose and nothing else, so a consumer wanting to word a
   * refusal per ground had to re-decide which one fired from this summary's other fields — a
   * second answer to a question this line has already answered. The ground now travels beside the
   * sentence, and both come from the same table entry.
   */
  const awtInvalidity = diagnoseAwtValidity({
    waiting,
    saturation,
    serviceLevel,
    windowSeconds: windowDurationS(window),
    maxUnservedFraction,
    unservedFraction,
    abandonedCount: abandonment?.count ?? 0,
    abandonmentFraction: abandonment?.fraction ?? 0,
    maxAbandonmentFraction,
  });

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
    energy,
    handlingCapacity,
    achievedInterval,
    saturation,
    serviceLevel,
    /*
     * Present exactly when somebody left, absent otherwise — so a run that declared no patience
     * produces the summary object it produced before this key existed, which is what docs/14 § 5
     * criterion 1 holds the whole `SimulationResult` to. It sits here, immediately before the
     * validity verdict, because that is the reading order: the count is what the verdict below is
     * partly decided on.
     */
    ...(abandonment === undefined ? {} : { abandonment }),
    awtIsValid: awtInvalidity === undefined,
    /*
     * Both keys or neither. A summary carrying a code with no sentence would be a refusal a reader
     * cannot act on, and one carrying a sentence with no code is what this change removed.
     */
    ...(awtInvalidity === undefined
      ? {}
      : { awtInvalidReason: awtInvalidity.reason, awtInvalidGround: awtInvalidity.ground }),
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
    id: 'metrics.maxAbandonmentFraction',
    type: 'continuous',
    range: [0, 1],
    scale: 'linear',
    default: DEFAULT_MAX_ABANDONMENT_FRACTION,
    description:
      'Fraction of a window\u2019s arrivals that may give up and leave before its AWT is marked invalid. An abandoned leg is not merely omitted from the mean the way an unserved one is \u2014 it is deleted from the sample at the moment it would have become the worst observation in it, and the queue then drains, so the trend and censoring gates both go quiet. Analysis-side: changing it re-reads a stored run rather than re-simulating one.',
  },
  {
    id: 'metrics.maxWaitHorizonS',
    type: 'continuous',
    range: [60, 3600],
    scale: 'linear',
    default: DEFAULT_MAX_WAIT_HORIZON_S,
    unit: 's',
    description:
      'Seconds a passenger may be known to have waited before the window’s AWT is marked invalid. Independent of the queue-trend and censoring gates, both of which are proxies for “the backlog did not clear” and neither of which sees a backlog that cleared just late enough to leave somebody on a landing for a quarter of an hour. The range runs from the long-wait quality threshold at the bottom to an hour at the top; the default sits a factor of 2.6 above the longest wait any shipped operating point produces (344.8 s, Midtown Office interfloor-mix under nearest-car, over 1000 replications).',
  },
  {
    id: 'metrics.departureGapS',
    type: 'continuous',
    range: [10, 120],
    scale: 'linear',
    default: FALLBACK_DEPARTURE_GAP_S,
    unit: 's',
    description:
      'Longest pause between two boardings by the same car at the terminal that still counts as one departure, when reconstructing the achieved interval from boarding times. Leave it unset and it is derived from the cars\u2019 own door timings, which is the only way to get it right on an arbitrary building: the pause a door reopen leaves inside one loading is openS + max(dwell, P\u22c5tp) + closeS, about 20 s on the shipped buildings. The declared default is the fallback for records that carry no timings; the range runs from a bare reopen at the bottom to a slow round trip at the top, and every value in it is wrong on some building, which is why the derivation exists.',
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
