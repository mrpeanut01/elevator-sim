/**
 * Achieved **interval** — the seconds between successive car departures from the terminal.
 *
 * ## Why this file exists
 *
 * docs/05-roadmap.md makes Phase 2's acceptance criterion "Midtown Office under pure up-peak
 * produces **interval and handling capacity** matching the closed-form Barney/CIBSE RTT
 * calculation within a few percent. This is the project's primary correctness oracle."
 *
 * `analytical/` computes the closed-form side of both (`RoundTripResult.intervalS = RTT / L`,
 * `handlingCapacity5Min = 300·P·L / RTT`). `metrics/` computed the achieved handling capacity
 * and nothing at all for the achieved interval — half of the primary oracle had no
 * implementation and therefore no test. `achievedIntervalOf` is that half.
 *
 * ## What the oracle test below does and does not prove
 *
 * It drives the metric with an **ideal** up-peak schedule derived from the closed form itself:
 * four cars leaving the lobby every `INT` seconds, each carrying `P` passengers who board a
 * transfer time apart. Recovering `INT` and `HC` from that is a real check — it exercises the
 * reconstruction of departures from boarding times, the clustering threshold, the windowing
 * and the person-versus-leg counting, any of which getting it wrong changes the answer by
 * more than "a few percent" (mistaking every boarding for a departure reports an interval of
 * 1.2 s rather than 37.4 s).
 *
 * What it does *not* prove is that the **simulation** matches the closed form. That comparison
 * needs the Phase 2 traffic generator, dispatcher and kernel wired end to end; it belongs with
 * whoever owns that runner, and this file gives it the metric and the units to compare in.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { analyzeUpPeak } from '../analytical/upPeak.js';
import { loadConfig } from '../config/loader.js';
import type { ElevatorSpecs, LoadedConfig, ResolvedBuilding } from '../config/types.js';

import { MetricsRecorder, type RecordablePassenger } from './recorder.js';
import { achievedIntervalOf, handlingCapacityOf, summarizeRun } from './summarize.js';
import { MetricsError, type PassengerRecord, type ReportWindow } from './types.js';

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

/* -------------------------------------------------------------------------- *
 * Reconstructing departures from boardings
 * -------------------------------------------------------------------------- */

function boarding(overrides: Partial<PassengerRecord> & { passengerId: string }): PassengerRecord {
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
    journeyStartedAt: 0,
    ...overrides,
  };
}

/** `count` passengers boarding `carId`, finishing exactly at `departsAt`, 1.2 s apart. */
function loadCar(carId: string, departsAt: number, count: number, tag: string): PassengerRecord[] {
  return Array.from({ length: count }, (_, i) =>
    boarding({
      passengerId: `${tag}-${i}`,
      carId,
      arrivedAt: Math.max(0, departsAt - 30),
      boardedAt: departsAt - (count - 1 - i) * 1.2,
      alightedAt: departsAt + 40,
    }),
  );
}

const WINDOW: ReportWindow = { id: 'w', startS: 0, endS: 600 };

describe('achievedIntervalOf — a departure is a car leaving, not a passenger boarding', () => {
  it('collapses one car load of boardings into a single departure', () => {
    const stats = achievedIntervalOf(loadCar('c1', 100, 12, 'a'), { window: WINDOW });
    expect(stats.boardingCount).toBe(12);
    expect(stats.departureCount).toBe(1);
    expect(stats.carCount).toBe(1);
    // One departure is no interval at all. Reporting 1.2 s — the transfer time — would be the
    // failure mode this collapse exists to prevent.
    expect(stats.count).toBe(0);
    expect(stats.meanS).toBeNaN();
  });

  it('measures the gap between successive departures across the whole group', () => {
    const legs = [
      ...loadCar('c1', 30, 10, 'a'),
      ...loadCar('c2', 60, 10, 'b'),
      ...loadCar('c3', 90, 10, 'c'),
      ...loadCar('c1', 120, 10, 'd'),
    ];
    const stats = achievedIntervalOf(legs, { window: WINDOW });
    expect(stats.departureCount).toBe(4);
    expect(stats.carCount).toBe(3);
    expect(stats.count).toBe(3); // gaps, one fewer than departures
    expect(stats.meanS).toBeCloseTo(30, 12);
    expect(stats.minS).toBeCloseTo(30, 12);
    expect(stats.maxS).toBeCloseTo(30, 12);
    expect(stats.stdDevS).toBeCloseTo(0, 12);
    expect(stats.coefficientOfVariation).toBeCloseTo(0, 12);
  });

  it('separates two trips by the same car and joins a slow load into one', () => {
    // Boardings 8 s apart — a slow, obstructed load — are still one departure at the default
    // 10 s threshold; a return trip 200 s later is a second.
    const slowLoad = [
      boarding({ passengerId: 's1', carId: 'c1', boardedAt: 10, arrivedAt: 0 }),
      boarding({ passengerId: 's2', carId: 'c1', boardedAt: 18, arrivedAt: 0 }),
      boarding({ passengerId: 's3', carId: 'c1', boardedAt: 26, arrivedAt: 0 }),
      boarding({ passengerId: 's4', carId: 'c1', boardedAt: 226, arrivedAt: 200 }),
    ];
    const stats = achievedIntervalOf(slowLoad, { window: WINDOW });
    expect(stats.departureCount).toBe(2);
    expect(stats.meanS).toBeCloseTo(200, 12); // 226 - 26: last boarding of each cluster
  });

  it('honours a retuned clustering threshold', () => {
    const legs = loadCar('c1', 100, 5, 'a'); // boardings 1.2 s apart
    expect(achievedIntervalOf(legs, { window: WINDOW, departureGapS: 0.5 }).departureCount).toBe(5);
    expect(achievedIntervalOf(legs, { window: WINDOW, departureGapS: 10 }).departureCount).toBe(1);
    expect(() => achievedIntervalOf(legs, { window: WINDOW, departureGapS: -1 })).toThrow(
      MetricsError,
    );
  });

  it('infers the terminal as the busiest boarding floor and reports which it chose', () => {
    const legs = [
      ...loadCar('c1', 30, 10, 'lobby-a'),
      ...loadCar('c2', 60, 10, 'lobby-b'),
      // Two people picked up at floor 12 on the way down: not terminal departures.
      boarding({ passengerId: 'x1', carId: 'c1', originFloorId: '12', boardedAt: 45 }),
      boarding({ passengerId: 'x2', carId: 'c2', originFloorId: '12', boardedAt: 75 }),
    ];
    const stats = achievedIntervalOf(legs, { window: WINDOW });
    expect(stats.terminalFloorId).toBe('G');
    expect(stats.boardingCount).toBe(20);
    expect(stats.departureCount).toBe(2);
    expect(stats.meanS).toBeCloseTo(30, 12);

    // And an explicit terminal overrides the inference.
    const atTwelve = achievedIntervalOf(legs, { window: WINDOW, terminalFloorIds: ['12'] });
    expect(atTwelve.terminalFloorId).toBe('12');
    expect(atTwelve.departureCount).toBe(2);
    expect(atTwelve.meanS).toBeCloseTo(30, 12);
  });

  it('windows by boarding time, because a departure is an event and not a cohort', () => {
    const legs = [
      ...loadCar('c1', 30, 5, 'a'),
      ...loadCar('c2', 60, 5, 'b'),
      ...loadCar('c3', 700, 5, 'late'),
    ];
    const stats = achievedIntervalOf(legs, { window: WINDOW });
    expect(stats.departureCount).toBe(2);
    expect(stats.carCount).toBe(2);
  });

  it('skips legs with no carId rather than inventing a departure', () => {
    const legs = [
      ...loadCar('c1', 30, 3, 'a'),
      boarding({ passengerId: 'anon', boardedAt: 45 }), // no carId
    ];
    const stats = achievedIntervalOf(legs, { window: WINDOW });
    expect(stats.boardingCount).toBe(3);
    expect(stats.departureCount).toBe(1);
  });

  it('reports nothing rather than zero when no car departed', () => {
    const stats = achievedIntervalOf([], { window: WINDOW });
    expect(stats.departureCount).toBe(0);
    expect(stats.carCount).toBe(0);
    expect(stats.terminalFloorId).toBeUndefined();
    expect(stats.meanS).toBeNaN();
    expect(stats.coefficientOfVariation).toBeNaN();
  });

  it('separates a bunched group from an evenly spaced one at the same mean interval', () => {
    // CLOSED_FORM_ASSUMPTIONS warns that real groups bunch while the closed form assumes even
    // spacing. Departures at 10/20/70/80/130/140 average the same 26 s as an even group would,
    // and the average passenger's wait is nothing like the same — so the spread is reported
    // rather than averaged away.
    const bunched = [10, 20, 70, 80, 130, 140].flatMap((at, i) => loadCar(`c${i % 4}`, at, 4, `b${i}`));
    const even = [10, 36, 62, 88, 114, 140].flatMap((at, i) => loadCar(`c${i % 4}`, at, 4, `e${i}`));

    const bunchedStats = achievedIntervalOf(bunched, { window: WINDOW });
    const evenStats = achievedIntervalOf(even, { window: WINDOW });

    expect(bunchedStats.meanS).toBeCloseTo(26, 12);
    expect(evenStats.meanS).toBeCloseTo(26, 12);
    expect(evenStats.coefficientOfVariation).toBeCloseTo(0, 12);
    expect(bunchedStats.coefficientOfVariation).toBeGreaterThan(0.8);
  });

  it('is reachable from summarizeRun and reports the window it used', () => {
    const recorder = new MetricsRecorder({ seed: 3, runId: 'interval' });
    for (const [index, departsAt] of [40, 80, 120].entries()) {
      for (let i = 0; i < 6; i += 1) {
        const id = `d${index}-${i}`;
        const passenger: RecordablePassenger = {
          id,
          journeyId: id,
          legIndex: 0,
          isFinalLeg: true,
          originFloorId: 'G',
          destinationFloorId: '10',
          finalDestinationFloorId: '10',
          direction: 'up',
          massKg: 75,
          arrivedAt: departsAt - 20,
          journeyStartedAt: departsAt - 20,
        };
        recorder.recordArrival(passenger);
        recorder.recordBoarding(id, departsAt - (5 - i) * 1.2, { carId: `c${index}` });
      }
    }
    const summary = summarizeRun(recorder.finish(300));
    expect(summary.achievedInterval.departureCount).toBe(3);
    expect(summary.achievedInterval.meanS).toBeCloseTo(40, 12);
    expect(summary.achievedInterval.terminalFloorId).toBe('G');
    expect(summary.achievedInterval.departureGapS).toBe(10);
  });
});

/* -------------------------------------------------------------------------- *
 * The Phase 2 oracle: interval AND handling capacity against the closed form
 * -------------------------------------------------------------------------- */

describe('Midtown Office up-peak: achieved interval and handling capacity vs the closed form', () => {
  let config: LoadedConfig;
  let specs: ElevatorSpecs;

  beforeAll(async () => {
    config = await loadConfig(REAL_DATA_DIR);
    specs = config.elevatorSpecs;
  });

  function building(id: string): ResolvedBuilding {
    const found = config.buildingsById.get(id);
    if (found === undefined) throw new Error(`data/buildings is missing "${id}"`);
    return found;
  }

  /**
   * An ideal up-peak run: `L` cars leaving the lobby every `INT` seconds, each carrying `P`
   * passengers a transfer time apart. Exactly the schedule the closed form describes, recorded
   * the way the simulation would record it.
   *
   * `P` is 12.8 — an expectation, not a car load — so the per-departure count cycles
   * 13, 13, 13, 13, 12, which averages 12.8 over any five consecutive departures.
   */
  function idealUpPeakRun(
    intervalS: number,
    carsInGroup: number,
    passengersPerTrip: number,
    transferS: number,
    horizonS: number,
  ) {
    const recorder = new MetricsRecorder({
      seed: 20260726,
      runId: 'midtown-ideal-uppeak',
      buildingId: 'midtown-office',
      population: 1710,
      carIds: Array.from({ length: carsInGroup }, (_, i) => `car-${i}`),
    });

    const whole = Math.floor(passengersPerTrip);
    const fraction = passengersPerTrip - whole;
    let index = 0;
    for (let trip = 0; (trip + 1) * intervalS < horizonS; trip += 1) {
      const departsAt = (trip + 1) * intervalS;
      const carId = `car-${trip % carsInGroup}`;
      // Deterministic dithering: `fraction` of trips carry one extra passenger, so the mean
      // over the run is `passengersPerTrip` without any car ever carrying a fractional person.
      const count = whole + (((trip * fraction) % 1) + fraction >= 1 ? 1 : 0);
      for (let i = 0; i < count; i += 1) {
        const id = `p${index}`;
        index += 1;
        const boardsAt = departsAt - (count - 1 - i) * transferS;
        const arrivesAt = Math.max(0, boardsAt - 25);
        recorder.recordArrival({
          id,
          journeyId: id,
          legIndex: 0,
          isFinalLeg: true,
          originFloorId: 'G',
          destinationFloorId: '20',
          finalDestinationFloorId: '20',
          direction: 'up',
          massKg: 75,
          arrivedAt: arrivesAt,
          journeyStartedAt: arrivesAt,
        });
        recorder.recordBoarding(id, boardsAt, { carId, bankId: 'main' });
      }
    }
    return recorder.finish(horizonS);
  }

  it('recovers INT from boarding times to within a few percent', () => {
    const { result, roundTripTerms } = analyzeUpPeak(building('midtown-office'), specs);
    const record = idealUpPeakRun(
      result.intervalS,
      roundTripTerms.carsInGroup,
      roundTripTerms.passengersPerTrip,
      roundTripTerms.passengerTransferS,
      1800,
    );

    const window: ReportWindow = { id: 'full-run', startS: 0, endS: 1800 };
    const achieved = achievedIntervalOf(record.passengers, { window });

    expect(achieved.carCount).toBe(4);
    expect(achieved.departureCount).toBeGreaterThan(40);
    expect(achieved.meanS).toBeCloseTo(result.intervalS, 6);
    expect(Math.abs(achieved.meanS - result.intervalS) / result.intervalS).toBeLessThan(0.03);
    // An evenly spaced group by construction, which is what the closed form assumes.
    expect(achieved.coefficientOfVariation).toBeCloseTo(0, 9);
  });

  it('recovers HC5 and %POP to within a few percent, in people', () => {
    const { result, roundTripTerms } = analyzeUpPeak(building('midtown-office'), specs);
    const record = idealUpPeakRun(
      result.intervalS,
      roundTripTerms.carsInGroup,
      roundTripTerms.passengersPerTrip,
      roundTripTerms.passengerTransferS,
      1800,
    );

    const window: ReportWindow = { id: 'full-run', startS: 0, endS: 1800 };
    const capacity = handlingCapacityOf(record.passengers, window, record.population);

    expect(capacity.personsPer5Min).toBeGreaterThan(0);
    expect(
      Math.abs(capacity.personsPer5Min - result.handlingCapacity5Min) / result.handlingCapacity5Min,
    ).toBeLessThan(0.03);
    expect(
      Math.abs((capacity.pctPopulationPer5Min as number) - result.percentPopulation5Min) /
        result.percentPopulation5Min,
    ).toBeLessThan(0.03);
    // Pure up-peak is single-leg, so persons and legs coincide here — which is precisely why
    // the leg-versus-person defect could not be seen from this case alone.
    expect(capacity.personsHandled).toBe(capacity.legsHandled);
  });

  it('reports both halves of the oracle off one summary', () => {
    const { result, roundTripTerms } = analyzeUpPeak(building('midtown-office'), specs);
    const record = idealUpPeakRun(
      result.intervalS,
      roundTripTerms.carsInGroup,
      roundTripTerms.passengersPerTrip,
      roundTripTerms.passengerTransferS,
      1800,
    );

    const summary = summarizeRun(record, { window: 'full-run' });
    expect(summary.achievedInterval.meanS).toBeCloseTo(result.intervalS, 6);
    expect(
      Math.abs(summary.handlingCapacity.personsPer5Min - result.handlingCapacity5Min) /
        result.handlingCapacity5Min,
    ).toBeLessThan(0.03);
    // Nothing diverged and nothing was censored, so the AWT of this run is usable.
    expect(summary.awtIsValid).toBe(true);
  });
});
