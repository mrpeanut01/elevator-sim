import { describe, expect, it } from 'vitest';

import { MetricsRecorder, type RecordablePassenger } from './recorder.js';
import {
  DEFAULT_LONG_WAIT_THRESHOLD_S,
  buildJourneys,
  fullRunWindow,
  handlingCapacityOf,
  loadFactorStatistics,
  peakArrivalWindow,
  resolveWindow,
  selectJourneysInWindow,
  selectLegsInWindow,
  summarizeRun,
  summarizeWaiting,
  waitPercentile,
} from './summarize.js';
import {
  METRICS_SCHEMA_VERSION,
  MetricsError,
  legSecondsOf,
  type LoadSample,
  type PassengerRecord,
  type RunRecord,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Builders
 * -------------------------------------------------------------------------- */

function legRecord(overrides: Partial<PassengerRecord> & { passengerId: string }): PassengerRecord {
  return {
    journeyId: overrides.passengerId,
    legIndex: 0,
    isFinalLeg: true,
    originFloorId: 'G',
    destinationFloorId: '10',
    finalDestinationFloorId: '10',
    direction: 'up',
    massKg: 75,
    arrivedAt: 0,
    journeyStartedAt: overrides.arrivedAt ?? 0,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    runId: 'run-1',
    seed: '20260726',
    startedAt: 0,
    endedAt: 1800,
    passengers: [],
    loadSamples: [],
    queueSamples: [],
    ...overrides,
  };
}

function arrival(overrides: Partial<RecordablePassenger> & { id: string }): RecordablePassenger {
  return {
    journeyId: overrides.id,
    legIndex: 0,
    isFinalLeg: true,
    originFloorId: 'G',
    destinationFloorId: '10',
    finalDestinationFloorId: '10',
    direction: 'up',
    massKg: 75,
    arrivedAt: 0,
    journeyStartedAt: overrides.arrivedAt ?? 0,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- *
 * AWT / WT95 / % > 60 s, hand-computed
 * -------------------------------------------------------------------------- */

/**
 * Twenty synthetic passengers with waiting times chosen so every headline number can be
 * checked by hand:
 *
 * ```
 * waits  = [5, 8, 10, 12, 15, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50, 58, 62, 75, 90, 120]
 * sum    = 768                       -> AWT    = 768 / 20      = 38.4 s
 * WT95   = h = 19 * 0.95 = 18.05     -> 90 + 0.05 * (120 - 90) = 91.5 s
 * WT90   = h = 19 * 0.90 = 17.1      -> 75 + 0.10 * (90 - 75)  = 76.5 s
 * median = h = 19 * 0.50 = 9.5       -> 28 + 0.50 * (30 - 28)  = 29 s
 * > 60 s = {62, 75, 90, 120}         -> 4 / 20                 = 20 %
 * ```
 */
const HAND_WAITS = [5, 8, 10, 12, 15, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50, 58, 62, 75, 90, 120];

function handComputedRecord(): RunRecord {
  const recorder = new MetricsRecorder({ seed: 20260726, runId: 'hand-computed' });
  HAND_WAITS.forEach((wait, index) => {
    const id = `p${index + 1}`;
    recorder.recordArrival(arrival({ id, arrivedAt: index }));
    recorder.recordBoarding(id, index + wait);
    recorder.recordAlighting(id, index + wait + 30);
  });
  return recorder.finish(2000);
}

describe('waiting-time statistics against hand-computed values', () => {
  const summary = summarizeRun(handComputedRecord());

  it('computes AWT as the arithmetic mean of the waits', () => {
    expect(summary.waiting.count).toBe(20);
    expect(summary.waiting.meanS).toBeCloseTo(38.4, 12);
  });

  it('computes WT95 by linear interpolation between the 19th and 20th order statistics', () => {
    expect(summary.waiting.p95S).toBeCloseTo(91.5, 12);
    expect(summary.waiting.p90S).toBeCloseTo(76.5, 12);
    expect(summary.waiting.medianS).toBeCloseTo(29, 12);
    expect(summary.waiting.percentileMethod).toBe('linear');
  });

  it('reports a different, also correct, WT95 under nearest-rank', () => {
    // ceil(20 * 0.95) = 19 -> the 19th order statistic, 90 s. Always an observed value.
    const nearest = summarizeRun(handComputedRecord(), { percentileMethod: 'nearest-rank' });
    expect(nearest.waiting.p95S).toBe(90);
    expect(nearest.waiting.percentileMethod).toBe('nearest-rank');
  });

  it('counts % > 60 s strictly above the threshold', () => {
    expect(summary.waiting.longWaitThresholdS).toBe(DEFAULT_LONG_WAIT_THRESHOLD_S);
    expect(summary.waiting.overLongWaitCount).toBe(4);
    expect(summary.waiting.pctOverLongWait).toBeCloseTo(20, 12);
  });

  it('follows a retuned long-wait threshold', () => {
    const strict = summarizeRun(handComputedRecord(), { longWaitThresholdS: 30 });
    // {35, 40, 45, 50, 58, 62, 75, 90, 120} = 9; the 30 s wait is not *over* 30 s.
    expect(strict.waiting.overLongWaitCount).toBe(9);
    expect(strict.waiting.pctOverLongWait).toBeCloseTo(45, 12);
  });

  it('reports spread and extremes', () => {
    expect(summary.waiting.minS).toBe(5);
    expect(summary.waiting.maxS).toBe(120);
    // Sum of squared deviations from 38.4 is 17266.8; /19 then square-rooted.
    expect(summary.waiting.stdDevS).toBeCloseTo(Math.sqrt(17266.8 / 19), 6);
  });

  it('bins the waits into a histogram whose weights are the counts', () => {
    const bins = summary.waiting.histogram;
    expect(bins.count).toBe(20);
    expect(bins.bins[0]).toMatchObject({ lowerBound: 0, upperBound: 10, count: 2 });
    expect(bins.bins.reduce((total, bin) => total + bin.count, 0)).toBe(20);
  });

  it('exposes the same numbers through the cohort-level helpers', () => {
    const legs = handComputedRecord().passengers;
    expect(summarizeWaiting(legs).meanS).toBeCloseTo(38.4, 12);
    expect(waitPercentile(legs, 95)).toBeCloseTo(91.5, 12);
    expect(waitPercentile([], 95)).toBeNaN();
  });

  it('marks the AWT valid when nothing diverged', () => {
    expect(summary.awtIsValid).toBe(true);
    expect(summary.awtInvalidReason).toBeUndefined();
    expect(summary.saturation.saturated).toBe(false);
  });
});

describe('unserved passengers', () => {
  it('counts them without imputing a waiting time for them', () => {
    const recorder = new MetricsRecorder({ seed: 1 });
    recorder.recordArrival(arrival({ id: 'served', arrivedAt: 0 }));
    recorder.recordBoarding('served', 10);
    recorder.recordArrival(arrival({ id: 'stranded', arrivedAt: 5 }));
    const summary = summarizeRun(recorder.finish(600));

    expect(summary.counts.arrivals).toBe(2);
    expect(summary.counts.boarded).toBe(1);
    expect(summary.waiting.count).toBe(1);
    expect(summary.waiting.unservedCount).toBe(1);
    expect(summary.waiting.meanS).toBe(10);
  });

  it('marks AWT invalid when nobody was served in the window', () => {
    const recorder = new MetricsRecorder({ seed: 1 });
    recorder.recordArrival(arrival({ id: 'stranded', arrivedAt: 5 }));
    const summary = summarizeRun(recorder.finish(600));

    expect(summary.waiting.count).toBe(0);
    expect(summary.waiting.meanS).toBeNaN();
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidReason).toMatch(/No passenger was served/);
  });
});

/* -------------------------------------------------------------------------- *
 * Censoring
 * -------------------------------------------------------------------------- */

/**
 * ## Regression: an AWT over a censored cohort is not a valid AWT
 *
 * AWT is the mean over the legs that *boarded* — `summarizeWaiting` only pushes a wait when
 * `waitSecondsOf` is defined — so every unserved leg is a censored observation, and censored
 * in the one direction that flatters the result: the passengers still standing at the landings
 * are systematically the ones who would have contributed the longest waits.
 *
 * `awtIsValid` used to depend only on the queue-trend test and on "was anybody served at all",
 * which meant a window where five in six arrivals were never served could be reported as a
 * valid mean whenever the trend test happened not to fire. The gate below is deliberately
 * *independent* of the trend test, because the two are answering different questions.
 */
describe('AWT validity accounts for censoring, not only for the queue trend', () => {
  /** `served` of 100 arrivals board; the rest are still waiting when the run ends. */
  function partiallyServed(served: number): RunRecord {
    const recorder = new MetricsRecorder({ seed: 5, runId: `served-${served}` });
    for (let i = 0; i < 100; i += 1) {
      const id = `p${i}`;
      recorder.recordArrival(arrival({ id, arrivedAt: i * 2 }));
      if (i < served) recorder.recordBoarding(id, i * 2 + 10);
    }
    return recorder.finish(400);
  }

  it('invalidates a window where more than 5% of arrivals were never served', () => {
    const summary = summarizeRun(partiallyServed(80), {
      // Quiet the trend test explicitly, so this test can only pass on the censoring gate.
      saturation: { minProjectedGrowthPersons: 1e6 },
    });
    expect(summary.saturation.saturated).toBe(false);
    expect(summary.counts.unserved).toBe(20);
    expect(summary.awtIsValid).toBe(false);
    expect(summary.awtInvalidReason).toMatch(/20 of 100 arrivals/);
    expect(summary.awtInvalidReason).toMatch(/20\.0%/);
    expect(summary.awtInvalidReason).toMatch(/5\.0% censoring limit/);
  });

  it('leaves a lightly censored window valid: a run has to end somewhere', () => {
    const summary = summarizeRun(partiallyServed(97));
    expect(summary.counts.unserved).toBe(3);
    expect(summary.awtIsValid).toBe(true);
    expect(summary.awtInvalidReason).toBeUndefined();
  });

  it('names the fraction, and honours a retuned limit', () => {
    const lenient = summarizeRun(partiallyServed(80), {
      maxUnservedFraction: 0.25,
      saturation: { minProjectedGrowthPersons: 1e6 },
    });
    expect(lenient.awtIsValid).toBe(true);

    const strict = summarizeRun(partiallyServed(97), { maxUnservedFraction: 0.01 });
    expect(strict.awtIsValid).toBe(false);
    expect(strict.awtInvalidReason).toMatch(/3 of 100 arrivals/);
  });

  it('shows why it matters: the mean over the survivors is the mean over the fastest', () => {
    // Waits rise with arrival index, so truncating the cohort truncates the tail.
    const recorder = new MetricsRecorder({ seed: 5, runId: 'increasing-waits' });
    for (let i = 0; i < 100; i += 1) {
      const id = `p${i}`;
      recorder.recordArrival(arrival({ id, arrivedAt: 0 }));
      if (i < 50) recorder.recordBoarding(id, i);
    }
    const summary = summarizeRun(recorder.finish(400), {
      saturation: { minProjectedGrowthPersons: 1e6 },
    });
    // Reported AWT is 24.5 s over the served half; the unserved half all waited >= 400 s.
    expect(summary.waiting.meanS).toBeCloseTo(24.5, 12);
    expect(summary.waiting.pctOverLongWait).toBe(0); // and not one "long wait" in sight
    expect(summary.awtIsValid).toBe(false);
  });

  it('rejects a nonsensical censoring limit rather than applying it', () => {
    expect(() => summarizeRun(partiallyServed(80), { maxUnservedFraction: 1.5 })).toThrow(
      MetricsError,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Time to destination across a sky-lobby transfer
 * -------------------------------------------------------------------------- */

/**
 * One two-leg journey through a sky lobby, timed so every component is distinguishable:
 *
 * ```
 * leg 0  G  -> 31   arrive   0   board  20   alight  60    wait 20, ride 40
 *                   (walk across the sky lobby: 10 s)
 * leg 1  31 -> 45   arrive  70   board 100   alight 140    wait 30, ride 40
 *
 * TTD = 140 - 0 = 140 s  = 50 wait + 80 ride + 10 transfer
 * ```
 *
 * The final leg on its own lasts 70 s. Reporting *that* as time-to-destination — which is what
 * happens if journey identity is lost — would understate this journey by half.
 */
function skyLobbyRecord(): RunRecord {
  const recorder = new MetricsRecorder({ seed: 7, runId: 'sky-lobby' });

  const first: RecordablePassenger = {
    id: 'p1',
    journeyId: 'j1',
    legIndex: 0,
    isFinalLeg: false,
    originFloorId: 'G',
    destinationFloorId: '31',
    finalDestinationFloorId: '45',
    direction: 'up',
    massKg: 80,
    arrivedAt: 0,
    journeyStartedAt: 0,
  };
  const second: RecordablePassenger = {
    ...first,
    id: 'p2',
    legIndex: 1,
    isFinalLeg: true,
    originFloorId: '31',
    destinationFloorId: '45',
    arrivedAt: 70,
    journeyStartedAt: 0,
  };

  recorder.recordArrival(first);
  recorder.recordBoarding(first, 20, { carId: 'shuttle-1', bankId: 'shuttle' });
  recorder.recordAlighting(first, 60);
  recorder.recordArrival(second);
  recorder.recordBoarding(second, 100, { carId: 'high-1', bankId: 'high-rise' });
  recorder.recordAlighting(second, 140);

  // A single-leg journey alongside it, for contrast.
  recorder.recordArrival(arrival({ id: 'p3', journeyId: 'j2', arrivedAt: 0 }));
  recorder.recordBoarding('p3', 10);
  recorder.recordAlighting('p3', 50);

  return recorder.finish(600);
}

describe('time to destination spans both legs of a sky-lobby journey', () => {
  const record = skyLobbyRecord();

  it('joins the legs by journeyId, in leg order', () => {
    const journeys = buildJourneys(record.passengers);
    expect(journeys.map((journey) => journey.journeyId)).toEqual(['j1', 'j2']);
    const [sky] = journeys;
    expect(sky?.legCount).toBe(2);
    expect(sky?.legs.map((entry) => entry.legIndex)).toEqual([0, 1]);
    expect(sky?.originFloorId).toBe('G');
    expect(sky?.finalDestinationFloorId).toBe('45');
  });

  it('measures TTD from the first landing to the final alighting, transfer included', () => {
    const [sky] = buildJourneys(record.passengers);
    expect(sky?.startedAt).toBe(0);
    expect(sky?.completedAt).toBe(140);
    expect(sky?.timeToDestinationSeconds).toBe(140);
    expect(sky?.totalWaitSeconds).toBe(50);
    expect(sky?.totalRideSeconds).toBe(80);
    expect(sky?.transferSeconds).toBe(10);
  });

  it('is strictly longer than the final leg alone, which is the whole point', () => {
    const finalLeg = record.passengers.find((entry) => entry.passengerId === 'p2');
    expect(legSecondsOf(finalLeg!)).toBe(70);
    const [sky] = buildJourneys(record.passengers);
    expect(sky?.timeToDestinationSeconds).toBeGreaterThan(legSecondsOf(finalLeg!)!);
  });

  it('summarizes TTD per journey, not per leg', () => {
    const summary = summarizeRun(record);
    expect(summary.counts.arrivals).toBe(3); // three legs
    expect(summary.counts.journeysStarted).toBe(2); // two journeys
    expect(summary.counts.journeysCompleted).toBe(2);
    expect(summary.timeToDestination.count).toBe(2);
    expect(summary.timeToDestination.meanS).toBe((140 + 50) / 2);
    expect(summary.timeToDestination.maxS).toBe(140);
  });

  it('keeps per-leg waiting time per leg, so AWT is not diluted by the journey view', () => {
    const summary = summarizeRun(record);
    // waits: 20 (leg 0), 30 (leg 1), 10 (single-leg journey)
    expect(summary.waiting.count).toBe(3);
    expect(summary.waiting.meanS).toBeCloseTo(20, 12);
  });

  it('withholds TTD from a journey still waiting in the sky lobby', () => {
    const recorder = new MetricsRecorder({ seed: 7 });
    recorder.recordArrival({
      id: 'p1',
      journeyId: 'j1',
      legIndex: 0,
      isFinalLeg: false,
      originFloorId: 'G',
      destinationFloorId: '31',
      finalDestinationFloorId: '45',
      direction: 'up',
      massKg: 80,
      arrivedAt: 0,
      journeyStartedAt: 0,
    });
    recorder.recordBoarding('p1', 20);
    recorder.recordAlighting('p1', 60);
    recorder.recordArrival({
      id: 'p2',
      journeyId: 'j1',
      legIndex: 1,
      isFinalLeg: true,
      originFloorId: '31',
      destinationFloorId: '45',
      finalDestinationFloorId: '45',
      direction: 'up',
      massKg: 80,
      arrivedAt: 70,
      journeyStartedAt: 0,
    });

    const [journey] = buildJourneys(recorder.finish(600).passengers);
    expect(journey?.isComplete).toBe(false);
    expect(journey?.timeToDestinationSeconds).toBeUndefined();
    expect(journey?.totalWaitSeconds).toBe(20);
  });
});

/* -------------------------------------------------------------------------- *
 * Windowing
 * -------------------------------------------------------------------------- */

describe('window membership is by arrival time and half-open', () => {
  const legs: readonly PassengerRecord[] = [
    legRecord({ passengerId: 'before', arrivedAt: 50, boardedAt: 150 }),
    legRecord({ passengerId: 'on-lower-bound', arrivedAt: 100, boardedAt: 110 }),
    legRecord({ passengerId: 'inside', arrivedAt: 200, boardedAt: 210 }),
    legRecord({ passengerId: 'late-boarder', arrivedAt: 250, boardedAt: 900 }),
    legRecord({ passengerId: 'on-upper-bound', arrivedAt: 300, boardedAt: 310 }),
    legRecord({ passengerId: 'after', arrivedAt: 400, boardedAt: 410 }),
  ];
  const window = { id: 'w', startS: 100, endS: 300 };

  it('includes the lower bound and excludes the upper', () => {
    expect(selectLegsInWindow(legs, window).map((leg) => leg.passengerId)).toEqual([
      'on-lower-bound',
      'inside',
      'late-boarder',
    ]);
  });

  it('keeps a passenger whose boarding falls outside the window', () => {
    // `late-boarder` arrived at 250 and boarded at 900. Selecting by boarding time would let a
    // slow dispatcher push its worst passengers out of the window and report a better AWT for
    // being worse.
    const selected = selectLegsInWindow(legs, window);
    expect(selected.map((leg) => leg.passengerId)).toContain('late-boarder');
    expect(summarizeWaiting(selected).maxS).toBe(650);
  });

  it('excludes a passenger who arrived before the window even if they boarded inside it', () => {
    expect(selectLegsInWindow(legs, window).map((leg) => leg.passengerId)).not.toContain('before');
  });

  it('partitions a run exactly once across adjacent windows', () => {
    const first = selectLegsInWindow(legs, { id: 'a', startS: 0, endS: 250 });
    const second = selectLegsInWindow(legs, { id: 'b', startS: 250, endS: 500 });
    expect(first.length + second.length).toBe(legs.length);
    const ids = new Set([...first, ...second].map((leg) => leg.passengerId));
    expect(ids.size).toBe(legs.length);
  });

  it('selects journeys by the arrival of their first leg', () => {
    const journeys = buildJourneys([
      legRecord({ passengerId: 'a1', journeyId: 'j1', legIndex: 0, isFinalLeg: false, arrivedAt: 90 }),
      legRecord({ passengerId: 'a2', journeyId: 'j1', legIndex: 1, arrivedAt: 150, journeyStartedAt: 90 }),
      legRecord({ passengerId: 'b1', journeyId: 'j2', arrivedAt: 150 }),
    ]);
    // j1 starts at 90, outside [100, 300); its second leg arriving inside does not pull it in.
    expect(selectJourneysInWindow(journeys, window).map((journey) => journey.journeyId)).toEqual([
      'j2',
    ]);
  });

  it('rejects an empty or inverted window rather than silently reporting nothing', () => {
    expect(() => selectLegsInWindow(legs, { id: 'x', startS: 100, endS: 100 })).not.toThrow();
    expect(() => resolveWindow(makeRecord(), { id: 'x', startS: 100, endS: 100 })).toThrow(
      MetricsError,
    );
    expect(() => resolveWindow(makeRecord(), { id: 'x', startS: 300, endS: 100 })).toThrow(
      MetricsError,
    );
  });
});

describe('resolveWindow', () => {
  it('defaults to the record’s own report window', () => {
    const record = makeRecord({ reportWindow: { id: 'peak-5min', startS: 600, endS: 900 } });
    expect(resolveWindow(record)).toEqual({ id: 'peak-5min', startS: 600, endS: 900 });
  });

  it('falls back to the whole run when the record names no window', () => {
    expect(resolveWindow(makeRecord())).toEqual({ id: 'full-run', startS: 0, endS: 1800 });
    expect(fullRunWindow({ startedAt: 10, endedAt: 20 })).toEqual({
      id: 'full-run',
      startS: 10,
      endS: 20,
    });
  });

  it('honours an explicit selection over the record’s own', () => {
    const record = makeRecord({ reportWindow: { id: 'peak-5min', startS: 600, endS: 900 } });
    expect(resolveWindow(record, 'full-run').id).toBe('full-run');
  });
});

describe('peakArrivalWindow', () => {
  it('finds the busiest five minutes by arrival count', () => {
    const legs: PassengerRecord[] = [];
    let id = 0;
    for (const at of [0, 2, 4, 6, 8]) legs.push(legRecord({ passengerId: `q${id++}`, arrivedAt: at }));
    for (let i = 0; i < 30; i += 1) {
      legs.push(legRecord({ passengerId: `q${id++}`, arrivedAt: 600 + i }));
    }
    for (const at of [1200, 1202, 1204]) legs.push(legRecord({ passengerId: `q${id++}`, arrivedAt: at }));

    const window = peakArrivalWindow(legs, { bounds: { id: 'run', startS: 0, endS: 1500 } });
    expect(window).toEqual({ id: 'peak-5min', startS: 600, endS: 900 });
    expect(selectLegsInWindow(legs, window)).toHaveLength(30);
  });

  it('depends only on arrival times, so common random numbers give every dispatcher the same window', () => {
    const arrivals = [0, 10, 610, 615, 620, 625, 630, 1200];
    const fast = arrivals.map((at, i) =>
      legRecord({ passengerId: `f${i}`, arrivedAt: at, boardedAt: at + 5 }),
    );
    const slow = arrivals.map((at, i) =>
      legRecord({ passengerId: `s${i}`, arrivedAt: at, boardedAt: at + 200 }),
    );
    const bounds = { id: 'run', startS: 0, endS: 1500 };
    expect(peakArrivalWindow(fast, { bounds })).toEqual(peakArrivalWindow(slow, { bounds }));
  });

  it('breaks ties towards the earliest window', () => {
    const legs = [0, 1, 400, 401].map((at, i) => legRecord({ passengerId: `t${i}`, arrivedAt: at }));
    const window = peakArrivalWindow(legs, { bounds: { id: 'run', startS: 0, endS: 1000 } });
    expect(window.startS).toBe(0);
  });

  it('returns the whole of a run shorter than the window', () => {
    const legs = [0, 10].map((at, i) => legRecord({ passengerId: `s${i}`, arrivedAt: at }));
    expect(peakArrivalWindow(legs, { bounds: { id: 'run', startS: 0, endS: 200 } })).toEqual({
      id: 'peak-5min',
      startS: 0,
      endS: 200,
    });
  });

  it('clamps a peak at the very end of the run so the window fits inside the bounds', () => {
    const legs = Array.from({ length: 10 }, (_, i) =>
      legRecord({ passengerId: `e${i}`, arrivedAt: 950 + i }),
    );
    const window = peakArrivalWindow(legs, { bounds: { id: 'run', startS: 0, endS: 1000 } });
    expect(window.startS).toBe(700);
    expect(window.endS).toBe(1000);
    expect(selectLegsInWindow(legs, window)).toHaveLength(10);
  });

  it('handles a run with no arrivals at all', () => {
    expect(peakArrivalWindow([], { bounds: { id: 'run', startS: 0, endS: 1800 } })).toEqual({
      id: 'peak-5min',
      startS: 0,
      endS: 300,
    });
  });

  it('is reachable through summarizeRun by selection name', () => {
    const legs = Array.from({ length: 12 }, (_, i) =>
      legRecord({ passengerId: `w${i}`, arrivedAt: 700 + i, boardedAt: 700 + i + 20 }),
    );
    const summary = summarizeRun(makeRecord({ passengers: legs }), { window: 'peak-5min' });
    expect(summary.window.id).toBe('peak-5min');
    expect(summary.counts.arrivals).toBe(12);
  });

  it('rejects a non-positive window length', () => {
    expect(() => peakArrivalWindow([], { windowSeconds: 0 })).toThrow(MetricsError);
  });
});

/* -------------------------------------------------------------------------- *
 * Handling capacity
 * -------------------------------------------------------------------------- */

describe('handling capacity is measured by events in the window, not by arrival cohort', () => {
  const window = { id: 'w', startS: 300, endS: 600 };
  const legs: readonly PassengerRecord[] = [
    // Arrived before the window, handled inside it: throughput, not demand.
    legRecord({ passengerId: 'early-arrival', arrivedAt: 290, boardedAt: 310, alightedAt: 380 }),
    // Arrived inside the window, handled after it: demand, not throughput.
    legRecord({ passengerId: 'late-boarder', arrivedAt: 350, boardedAt: 700, alightedAt: 760 }),
  ];

  it('counts boardings in the window as persons handled', () => {
    const capacity = handlingCapacityOf(legs, window);
    expect(capacity.personsHandled).toBe(1);
    expect(capacity.personsArrived).toBe(1);
    expect(capacity.personsDelivered).toBe(1);
    expect(capacity.windowSeconds).toBe(300);
  });

  it('scales to persons per 5 minutes', () => {
    const handled = Array.from({ length: 30 }, (_, i) =>
      legRecord({ passengerId: `h${i}`, arrivedAt: 300 + i * 5, boardedAt: 305 + i * 5 }),
    );
    expect(handlingCapacityOf(handled, window).personsPer5Min).toBeCloseTo(30, 12);
    // The same 30 people over ten minutes is half the capacity.
    expect(
      handlingCapacityOf(handled, { id: 'w2', startS: 300, endS: 900 }).personsPer5Min,
    ).toBeCloseTo(15, 12);
  });

  it('reports %POP when the record carries a population', () => {
    const handled = Array.from({ length: 30 }, (_, i) =>
      legRecord({ passengerId: `h${i}`, arrivedAt: 300 + i * 5, boardedAt: 305 + i * 5 }),
    );
    const capacity = handlingCapacityOf(handled, window, 500);
    expect(capacity.population).toBe(500);
    expect(capacity.pctPopulationPer5Min).toBeCloseTo(6, 12);
  });

  it('omits %POP rather than dividing by zero', () => {
    expect(handlingCapacityOf(legs, window, 0).pctPopulationPer5Min).toBeUndefined();
    expect(handlingCapacityOf(legs, window).pctPopulationPer5Min).toBeUndefined();
  });

  it('reports offered demand in the same units, for comparison against capacity', () => {
    const capacity = handlingCapacityOf(legs, window);
    expect(capacity.offeredPer5Min).toBeCloseTo(1, 12);
  });
});

/**
 * ## Regression: one person is one person, however many lifts they take
 *
 * `%POP = HC5 / population × 100` is defined against a population of *people*, and the demand
 * targets in docs/03-traffic-and-statistics.md Part 1 are quoted in "% pop / 5 min" of people.
 * A `PassengerRecord` is a **leg**, so a sky-lobby journey is two of them, and counting legs
 * inflated `personsHandled` and `%POP` by the transfer factor.
 *
 * This is live rather than hypothetical: four of the five shipped buildings declare an
 * `isTransferFloor`. The pure up-peak Midtown Office oracle case is single-leg, which is
 * exactly why no existing test could see it.
 */
describe('handling capacity counts people by journey and rides by leg', () => {
  const window = { id: 'w', startS: 0, endS: 300 };

  /** One person, G -> 31 -> 45 through a sky lobby: two legs, two boardings, one person. */
  const transferJourney: readonly PassengerRecord[] = [
    legRecord({
      passengerId: 'p1',
      journeyId: 'j1',
      legIndex: 0,
      isFinalLeg: false,
      destinationFloorId: '31',
      finalDestinationFloorId: '45',
      arrivedAt: 0,
      boardedAt: 10,
      alightedAt: 40,
    }),
    legRecord({
      passengerId: 'p2',
      journeyId: 'j1',
      legIndex: 1,
      originFloorId: '31',
      destinationFloorId: '45',
      finalDestinationFloorId: '45',
      arrivedAt: 50,
      journeyStartedAt: 0,
      boardedAt: 60,
      alightedAt: 90,
    }),
  ];

  it('counts a transferring passenger as one person handled and two legs', () => {
    const capacity = handlingCapacityOf(transferJourney, window, 100);
    expect(capacity.personsHandled).toBe(1);
    expect(capacity.personsDelivered).toBe(1);
    expect(capacity.personsArrived).toBe(1);
    expect(capacity.legsHandled).toBe(2);
    expect(capacity.legsDelivered).toBe(2);
    expect(capacity.legsArrived).toBe(2);
  });

  it('keeps %POP denominated in people: one of a hundred is 1%, not 2%', () => {
    const capacity = handlingCapacityOf(transferJourney, window, 100);
    expect(capacity.personsPer5Min).toBeCloseTo(1, 12);
    expect(capacity.pctPopulationPer5Min).toBeCloseTo(1, 12);
    // The cars really did do two rides' worth of work; that is a different number.
    expect(capacity.legsPer5Min).toBeCloseTo(2, 12);
    expect(capacity.offeredPer5Min).toBeCloseTo(1, 12);
  });

  it('is unchanged for a single-leg building, which is why the defect hid', () => {
    const singleLeg = Array.from({ length: 12 }, (_, i) =>
      legRecord({ passengerId: `s${i}`, arrivedAt: i, boardedAt: i + 5, alightedAt: i + 40 }),
    );
    const capacity = handlingCapacityOf(singleLeg, window, 200);
    expect(capacity.personsHandled).toBe(12);
    expect(capacity.legsHandled).toBe(12);
    expect(capacity.personsPer5Min).toBeCloseTo(capacity.legsPer5Min, 12);
  });

  it('counts a journey once even when both of its legs board inside the window', () => {
    const summary = summarizeRun(
      makeRecord({ passengers: transferJourney, population: 100, endedAt: 300 }),
    );
    expect(summary.handlingCapacity.personsHandled).toBe(1);
    expect(summary.handlingCapacity.legsHandled).toBe(2);
    expect(summary.counts.arrivals).toBe(2); // legs, as RunCounts documents
    expect(summary.counts.journeysStarted).toBe(1);
  });
});

/* -------------------------------------------------------------------------- *
 * Load factor over time
 * -------------------------------------------------------------------------- */

describe('load factor distribution is time-weighted', () => {
  const sample = (at: number, carId: string, loadFactor: number): LoadSample => ({
    at,
    carId,
    loadFactor,
    occupants: Math.round(loadFactor * 20),
    massKg: loadFactor * 1600,
  });

  it('holds each reading until the next sample for the same car', () => {
    const stats = loadFactorStatistics([sample(0, 'c1', 0.1), sample(100, 'c1', 0.9)], {
      window: { id: 'w', startS: 0, endS: 200 },
    });
    expect(stats.carCount).toBe(1);
    expect(stats.sampleCount).toBe(2);
    expect(stats.observedSeconds).toBe(200);
    expect(stats.meanLoadFactor).toBeCloseTo(0.5, 12);
    expect(stats.fractionOfTimeAtOrAboveDesignLoad).toBeCloseTo(0.5, 12);
  });

  it('is not the mean of the samples when the holds are uneven', () => {
    const stats = loadFactorStatistics(
      [sample(0, 'c1', 0.1), sample(100, 'c1', 0.9), sample(190, 'c1', 0.2)],
      { window: { id: 'w', startS: 0, endS: 200 } },
    );
    // Sample mean would be 0.4. Time-weighted: (0.1*100 + 0.9*90 + 0.2*10) / 200 = 0.465.
    expect(stats.meanLoadFactor).toBeCloseTo(0.465, 12);
  });

  it('clips a sample taken before the window rather than dropping it', () => {
    const stats = loadFactorStatistics([sample(-50, 'c1', 0.5), sample(60, 'c1', 1)], {
      window: { id: 'w', startS: 0, endS: 100 },
    });
    // (0.5 * 60 + 1.0 * 40) / 100 = 0.7 — the car was not empty before its first in-window event.
    expect(stats.observedSeconds).toBe(100);
    expect(stats.meanLoadFactor).toBeCloseTo(0.7, 12);
  });

  it('weights each car separately and sums their car-seconds', () => {
    const stats = loadFactorStatistics(
      [sample(0, 'c1', 0.2), sample(0, 'c2', 0.8), sample(50, 'c2', 0.4)],
      { window: { id: 'w', startS: 0, endS: 100 } },
    );
    expect(stats.carCount).toBe(2);
    expect(stats.observedSeconds).toBe(200);
    // (0.2*100 + 0.8*50 + 0.4*50) / 200 = 0.4
    expect(stats.meanLoadFactor).toBeCloseTo(0.4, 12);
  });

  it('bins into tenths of rated load and counts an overloaded car as overflow above 1.2', () => {
    const stats = loadFactorStatistics([sample(0, 'c1', 0.85), sample(50, 'c1', 1.35)], {
      window: { id: 'w', startS: 0, endS: 100 },
    });
    expect(stats.maxLoadFactor).toBe(1.35);
    expect(stats.distribution.overflow).toBe(1);
    expect(stats.distribution.bins.find((bin) => bin.lowerBound === 0.8)?.weight).toBe(50);
  });

  it('reports NaN, not zero, when no car was observed', () => {
    const stats = loadFactorStatistics([], { window: { id: 'w', startS: 0, endS: 100 } });
    expect(stats.sampleCount).toBe(0);
    expect(stats.meanLoadFactor).toBeNaN();
    expect(stats.fractionOfTimeAtOrAboveDesignLoad).toBeNaN();
  });

  it('measures time at design load against 0.8, never 1.0', () => {
    const stats = loadFactorStatistics([sample(0, 'c1', 0.8)], {
      window: { id: 'w', startS: 0, endS: 100 },
    });
    expect(stats.designLoadFactor).toBe(0.8);
    expect(stats.fractionOfTimeAtOrAboveDesignLoad).toBe(1);
  });

  /**
   * ## Regression: a car that never carried anybody is still a car
   *
   * `MetricsRecorder.sampleLoad` is documented to be called "on every load change — each board
   * and each alight", so **an idle car never produces a sample**. Building the car index from
   * the sample list alone therefore made idle car-seconds invisible: four idle cars out of
   * eight looked exactly like a four-car bank, and the fleet occupancy came out biased high —
   * which is the opposite of what docs/03-traffic-and-statistics.md Part 5 lists this metric
   * for ("validates the capacity model"). The roster is now an input.
   */
  describe('idle cars', () => {
    const window = { id: 'w', startS: 0, endS: 100 };

    it('halves the time-weighted mean when one car of two never carried anybody', () => {
      const busyOnly = loadFactorStatistics([sample(0, 'c1', 0.9)], { window });
      expect(busyOnly.meanLoadFactor).toBeCloseTo(0.9, 12);

      const withRoster = loadFactorStatistics([sample(0, 'c1', 0.9)], {
        window,
        carIds: ['c1', 'c2'],
      });
      expect(withRoster.carCount).toBe(2);
      expect(withRoster.sampledCarCount).toBe(1);
      expect(withRoster.observedSeconds).toBe(200);
      expect(withRoster.meanLoadFactor).toBeCloseTo(0.45, 12);
      expect(withRoster.fractionOfTimeAtOrAboveDesignLoad).toBeCloseTo(0.5, 12);
      expect(withRoster.minLoadFactor).toBe(0);
    });

    it('puts the idle car-seconds in the bottom bin rather than nowhere', () => {
      const stats = loadFactorStatistics([sample(0, 'c1', 0.9)], {
        window,
        carIds: ['c1', 'c2'],
      });
      expect(stats.distribution.bins[0]).toMatchObject({ lowerBound: 0, weight: 100 });
      expect(stats.distribution.totalWeight).toBe(200);
    });

    it('charges a car’s pre-first-sample time to zero load, not to nothing', () => {
      // c2 is loaded halfway through the window; before that it was empty, and the recorder
      // only fires on load *changes*, so the absence of a sample is the evidence of that.
      const stats = loadFactorStatistics([sample(0, 'c1', 0.6), sample(50, 'c2', 1)], { window });
      expect(stats.carCount).toBe(2);
      expect(stats.sampledCarCount).toBe(2);
      expect(stats.observedSeconds).toBe(200);
      // (0.6*100 + 0*50 + 1.0*50) / 200 = 0.55
      expect(stats.meanLoadFactor).toBeCloseTo(0.55, 12);
      expect(stats.sampleCount).toBe(2); // the seeded zero is not a recorded sample
    });

    it('unions the roster with cars the samples know about, so a stale roster degrades', () => {
      const stats = loadFactorStatistics([sample(0, 'c1', 0.4), sample(0, 'c9', 0.4)], {
        window,
        carIds: ['c1', 'c2'],
      });
      expect(stats.carCount).toBe(3);
      expect(stats.sampledCarCount).toBe(2);
    });

    it('reaches summarizeRun through the record’s own roster', () => {
      const record = makeRecord({
        endedAt: 100,
        carIds: ['c1', 'c2', 'c3', 'c4'],
        loadSamples: [sample(0, 'c1', 0.8)],
      });
      const summary = summarizeRun(record);
      expect(summary.loadFactor.carCount).toBe(4);
      expect(summary.loadFactor.meanLoadFactor).toBeCloseTo(0.2, 12);
      // An over-provisioned bank must not read like a right-sized one.
      expect(summary.loadFactor.fractionOfTimeAtOrAboveDesignLoad).toBeCloseTo(0.25, 12);
    });
  });
});

/* -------------------------------------------------------------------------- *
 * Whole-summary provenance
 * -------------------------------------------------------------------------- */

describe('summarizeRun carries its provenance', () => {
  it('repeats the run identity and the seed onto the summary', () => {
    const record = makeRecord({
      runId: 'midtown-07',
      seed: '99',
      buildingId: 'midtown-office',
      dispatcherProfileId: 'nearest-car',
      trafficProfileId: 'office-standard',
      passengers: [legRecord({ passengerId: 'p1', arrivedAt: 0, boardedAt: 10 })],
    });
    const summary = summarizeRun(record);
    expect(summary).toMatchObject({
      runId: 'midtown-07',
      seed: '99',
      buildingId: 'midtown-office',
      dispatcherProfileId: 'nearest-car',
      trafficProfileId: 'office-standard',
    });
    expect(summary.windowSeconds).toBe(1800);
  });

  it('counts legs in the run alongside legs in the window', () => {
    const record = makeRecord({
      passengers: [
        legRecord({ passengerId: 'in', arrivedAt: 500, boardedAt: 510 }),
        legRecord({ passengerId: 'out', arrivedAt: 5, boardedAt: 15 }),
      ],
    });
    const summary = summarizeRun(record, { window: { id: 'w', startS: 100, endS: 900 } });
    expect(summary.counts.arrivals).toBe(1);
    expect(summary.counts.legsInRun).toBe(2);
  });

  it('is a pure function of the record: summarizing twice gives the same answer', () => {
    const record = handComputedRecord();
    expect(summarizeRun(record)).toEqual(summarizeRun(record));
  });

  it('re-windows a stored record without re-simulating it', () => {
    const record = handComputedRecord();
    const full = summarizeRun(record, { window: 'full-run' });
    const narrow = summarizeRun(record, { window: { id: 'first-ten', startS: 0, endS: 10 } });
    expect(full.counts.arrivals).toBe(20);
    expect(narrow.counts.arrivals).toBe(10);
    expect(narrow.waiting.meanS).toBeCloseTo(
      HAND_WAITS.slice(0, 10).reduce((total, wait) => total + wait, 0) / 10,
      12,
    );
  });
});
