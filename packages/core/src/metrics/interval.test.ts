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
import type {
  ElevatorSpecs,
  FloorConfig,
  LoadedConfig,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedCar,
} from '../config/types.js';
import { CAR_DEFAULTS } from '../model/car/index.js';
import { travelTime } from '../physics/motion/index.js';

import { MetricsRecorder, type RecordablePassenger } from './recorder.js';
import {
  DEPARTURE_GAP_REOPEN_MARGIN,
  FALLBACK_DEPARTURE_GAP_S,
  achievedIntervalOf,
  departureGapBracket,
  handlingCapacityOf,
  resolveDepartureGapS,
  summarizeRun,
} from './summarize.js';
import {
  MetricsError,
  type CarTimings,
  type PassengerRecord,
  type ReportWindow,
} from './types.js';

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
    // Boardings 8 s apart — a slow, obstructed load — are still one departure at the fallback
    // threshold; a return trip 200 s later is a second.
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
    // This record carries no `carTimings`, so the threshold is the fallback and says so.
    expect(summary.achievedInterval.departureGapS).toBe(FALLBACK_DEPARTURE_GAP_S);
    expect(summary.achievedInterval.departureGapBasis).toBe('fallback');
  });
});

/* -------------------------------------------------------------------------- *
 * The clustering threshold is derived from the doors, not chosen
 * -------------------------------------------------------------------------- */

/**
 * Midtown-Office-shaped timings: its real doors and its closed-form load, with plausible motion
 * overheads. Written out rather than loaded so the arithmetic below is checkable by eye; the
 * real per-bank figures are surveyed against `data/` in the last describe block.
 */
const MIDTOWN_TIMINGS: CarTimings = {
  doorOpenS: 1.8,
  doorCloseS: 3.0,
  dwellHallCallS: 5.0,
  dwellCarCallS: 3.0,
  fullLoadTransferS: 12.8 * 1.2, // P·tp at the design load
  nearestFloorFlightS: 4.9,
  motorStartDelayS: 0.5,
  levelingSettleS: 0.4,
};

describe('departureGapBracket — the threshold is a function of the doors', () => {
  it('brackets the reopen cycle below and the shortest round trip above', () => {
    const bracket = departureGapBracket(MIDTOWN_TIMINGS);

    // openS + max(5.0, 3.0, 15.36) + closeS. The transfer sets the dwell, not the policy value,
    // and this is the number the old 10 s default was under by a factor of two.
    expect(bracket.maxReopenS).toBeCloseTo(1.8 + 15.36 + 3.0, 10);
    expect(bracket.maxReopenS).toBeGreaterThan(2 * 10);

    // Two legs (close, start, fly, settle, open) plus a stop's dwell at each end.
    const legS = 3.0 + 0.5 + 4.9 + 0.4 + 1.8;
    expect(bracket.minRoundTripS).toBeCloseTo(2 * legS + 5.0 + 3.0, 10);

    expect(bracket.basis).toBe('bracket-midpoint');
    expect(bracket.gapS).toBeCloseTo((bracket.maxReopenS + (bracket.minRoundTripS as number)) / 2, 10);
    expect(bracket.gapS).toBeGreaterThan(bracket.maxReopenS);
    expect(bracket.gapS).toBeLessThan(bracket.minRoundTripS as number);
  });

  it('the bare policy dwell is not the bound — a full load holds the doors far longer', () => {
    // The defect's root cause in one assertion: reasoning about a reopen from the *policy* dwell
    // alone gets 9.8 s, and the dwell a stop actually earns is max(policy, transfer).
    const bareReopenS =
      MIDTOWN_TIMINGS.doorOpenS + MIDTOWN_TIMINGS.dwellHallCallS + MIDTOWN_TIMINGS.doorCloseS;
    expect(bareReopenS).toBeCloseTo(9.8, 10);
    expect(departureGapBracket(MIDTOWN_TIMINGS).maxReopenS).toBeGreaterThan(2 * bareReopenS);
  });

  it('falls back to a margin above the reopen bound when the flight time is unknown', () => {
    const { nearestFloorFlightS: _flight, ...noFlight } = MIDTOWN_TIMINGS;
    const bracket = departureGapBracket(noFlight);

    expect(bracket.basis).toBe('reopen-margin');
    expect(bracket.minRoundTripS).toBeUndefined();
    expect(bracket.gapS).toBeCloseTo(bracket.maxReopenS * (1 + DEPARTURE_GAP_REOPEN_MARGIN), 10);
    // Still inside the real bracket, which is the property that matters.
    expect(bracket.gapS).toBeGreaterThan(bracket.maxReopenS);
    expect(bracket.gapS).toBeLessThan(departureGapBracket(MIDTOWN_TIMINGS).minRoundTripS as number);
  });

  it('refuses to invent a threshold when no threshold can work', () => {
    // A hypothetical machine whose doors dawdle longer than its round trip. There is no value
    // that separates a reopen from a return, and reporting one anyway would be the defect this
    // whole derivation exists to prevent — in the other direction.
    expect(() =>
      departureGapBracket({ ...MIDTOWN_TIMINGS, fullLoadTransferS: 60, nearestFloorFlightS: 1 }),
    ).toThrow(MetricsError);
  });

  it('rejects timings that are not finite and non-negative', () => {
    expect(() => departureGapBracket({ ...MIDTOWN_TIMINGS, doorOpenS: Number.NaN })).toThrow(
      MetricsError,
    );
    expect(() => departureGapBracket({ ...MIDTOWN_TIMINGS, dwellHallCallS: -1 })).toThrow(
      MetricsError,
    );
    expect(() => departureGapBracket({ ...MIDTOWN_TIMINGS, nearestFloorFlightS: -1 })).toThrow(
      MetricsError,
    );
    // Zero is legitimate: the knock-out configurations `analytical/`'s validation runs drive
    // door times to zero deliberately.
    expect(() =>
      departureGapBracket({ ...MIDTOWN_TIMINGS, doorOpenS: 0, doorCloseS: 0 }),
    ).not.toThrow();
  });

  it('resolves in the order explicit, derived, fallback — and reports which', () => {
    expect(resolveDepartureGapS({ departureGapS: 42, carTimings: MIDTOWN_TIMINGS })).toEqual({
      gapS: 42,
      basis: 'explicit',
    });
    expect(resolveDepartureGapS({ carTimings: MIDTOWN_TIMINGS })).toEqual({
      gapS: departureGapBracket(MIDTOWN_TIMINGS).gapS,
      basis: 'derived',
    });
    expect(resolveDepartureGapS({})).toEqual({
      gapS: FALLBACK_DEPARTURE_GAP_S,
      basis: 'fallback',
    });
    expect(() => resolveDepartureGapS({ departureGapS: -1 })).toThrow(MetricsError);
  });

  it('a door reopen inside one loading is not a second departure', () => {
    // The synthetic case the defect was invisible in. One car, one load, one reopen: eight
    // people board, the doors start to close, a straggler puts a hand in, and the last two board
    // after the reopen — `openS + dwell + closeS = 20.16 s` later. Then the car goes away and
    // comes back 190 s after that.
    const bracket = departureGapBracket(MIDTOWN_TIMINGS);
    const reopenS = bracket.maxReopenS;
    const legs = [
      ...Array.from({ length: 8 }, (_, i) =>
        boarding({ passengerId: `first-${i}`, carId: 'c1', boardedAt: 100 + i * 1.2 }),
      ),
      // Post-reopen boardings: 20.16 s after the last pre-reopen one.
      boarding({ passengerId: 'late-0', carId: 'c1', boardedAt: 108.4 + reopenS }),
      boarding({ passengerId: 'late-1', carId: 'c1', boardedAt: 109.6 + reopenS }),
      // The genuine next departure of the same car, one round trip later.
      ...Array.from({ length: 8 }, (_, i) =>
        boarding({ passengerId: `next-${i}`, carId: 'c1', boardedAt: 300 + reopenS + i * 1.2 }),
      ),
    ];
    const window: ReportWindow = { id: 'w', startS: 0, endS: 600 };

    const derived = achievedIntervalOf(legs, { window, carTimings: MIDTOWN_TIMINGS });
    expect(derived.departureGapBasis).toBe('derived');
    expect(derived.departureCount).toBe(2);
    expect(derived.meanS).toBeCloseTo(300 + reopenS + 8.4 - (109.6 + reopenS), 9);

    // The fallback constant gets the same answer on this building — that is what makes it a
    // usable fallback — and the value that shipped before the fix does not.
    expect(achievedIntervalOf(legs, { window }).departureCount).toBe(2);
    expect(achievedIntervalOf(legs, { window, departureGapS: 10 }).departureCount).toBe(3);
  });
});

/* -------------------------------------------------------------------------- *
 * The fallback constant, against every building the project ships
 * -------------------------------------------------------------------------- */

describe('FALLBACK_DEPARTURE_GAP_S lies inside every shipped building’s bracket', () => {
  let config: LoadedConfig;

  beforeAll(async () => {
    config = await loadConfig(REAL_DATA_DIR);
  }, 60_000);

  /**
   * `tp` for a car, as the simulator will actually charge it.
   *
   * Every car in `data/buildings` now carries a resolved `passengerTransferS` — the building
   * type's row for a single-use building, an authored per-car value for the two mixed-use towers
   * — so this reads the value and does not invent one.
   *
   * **This function used to substitute the slowest row for `mixed-use`**, which made the survey
   * below model a building that did not exist: it charged those cars 1.75 s while the simulator
   * charged them 1.2 s, and at 1.2 s both of this file's structural claims are false (the maximum
   * reopen across all 14 banks drops to 28.8 s against a 29.0 s minimum ceiling, so a constant
   * *is* safe on every shipped bank, and no bracket is empty). The premise is now true of the
   * data rather than assumed by the test. See `data/buildings/mixed-use-high-rise.json`'s notes
   * for why the shuttles are authored at 1.75 s.
   */
  function transferOf(car: ResolvedCar, building: ResolvedBuilding): number {
    const { passengerTransferS } = car;
    if (passengerTransferS === undefined) {
      throw new Error(
        `car "${car.id}" in building "${building.id}" carries no resolved passengerTransferS. ` +
          'resolveBuilding derives it from the building type and the two mixed-use towers declare ' +
          'it per car; a car without one means one of those two paths has regressed.',
      );
    }
    return passengerTransferS;
  }

  /**
   * `CarTimings` for one bank, assembled the way a runner would: door timings and the machine's
   * fixed overheads off the resolved cars, `P·tp` off the design load, and the first hop's
   * flight time from the project's own jerk-limited `travelTime`.
   */
  function timingsOf(building: ResolvedBuilding, bank: ResolvedBank): CarTimings | undefined {
    const cars = bank.cars;
    if (cars.length === 0) return undefined;

    const served = bank.servesFloors
      .map((id) => building.floorsById.get(id))
      .filter((floor): floor is FloorConfig => floor !== undefined)
      .sort((a, b) => a.heightM - b.heightM);
    const terminal = served.find((floor) => floor.isEntrance) ?? served[0];
    if (terminal === undefined) return undefined;
    const nearest = served.find((floor) => floor.heightM > terminal.heightM);
    if (nearest === undefined) return undefined;

    const worst = (of: (car: ResolvedCar) => number): number => Math.max(...cars.map(of));
    const transferS = worst((car) => transferOf(car, building));
    const fastest = cars.reduce((a, b) => (b.ratedSpeedMps > a.ratedSpeedMps ? b : a));

    return {
      doorOpenS: worst((car) => car.doorOpenS),
      doorCloseS: worst((car) => car.doorCloseS),
      dwellHallCallS: worst((car) => car.dwellHallCallS),
      dwellCarCallS: worst((car) => car.dwellCarCallS),
      fullLoadTransferS: worst((car) => car.designCapacityPersons) * transferS,
      // The *shortest* first hop, flown by the *fastest* car: both pull the upper bound of the
      // bracket down, which is the conservative direction for a check that must not pass by
      // accident.
      nearestFloorFlightS: travelTime(nearest.heightM - terminal.heightM, fastest),
      motorStartDelayS: Math.min(...cars.map((car) => car.motorStartDelayS)),
      levelingSettleS: Math.min(...cars.map((car) => car.levelingSettleS)),
    };
  }

  interface Row {
    readonly id: string;
    readonly maxReopenS: number;
    /** `undefined` when the bracket is empty: no threshold at all can work on that bank. */
    readonly minRoundTripS: number | undefined;
  }

  function everyBankBracket(): readonly Row[] {
    const rows: Row[] = [];
    for (const [buildingId, building] of config.buildingsById) {
      for (const bank of building.banks) {
        const timings = timingsOf(building, bank);
        if (timings === undefined) continue;
        const id = `${buildingId}/${bank.id}`;

        // Dropping the flight time isolates the reopen bound, which always exists.
        const { nearestFloorFlightS: _drop, ...reopenOnly } = timings;
        const maxReopenS = departureGapBracket(reopenOnly).maxReopenS;
        let minRoundTripS: number | undefined;
        try {
          minRoundTripS = departureGapBracket(timings).minRoundTripS;
        } catch (error) {
          // An empty bracket is a legitimate verdict about a bank, not a failure here: a
          // 19-person car whose first hop is one floor can hold its doors longer than it takes
          // to go up and come back. Recorded, and asserted about below.
          expect(error).toBeInstanceOf(MetricsError);
        }
        rows.push({ id, maxReopenS, minRoundTripS });
      }
    }
    // Guard against a vacuous pass if the fixtures or the bank shapes change.
    expect(rows.length).toBeGreaterThanOrEqual(8);
    return rows;
  }

  it('the value that shipped before the fix was under every shipped bank’s reopen bound', () => {
    // The defect, machine-checked across all of `data/buildings` rather than argued from two of
    // them: 10 s could not have been right anywhere.
    for (const row of everyBankBracket()) {
      expect(row.maxReopenS, row.id).toBeGreaterThan(10);
    }
  }, 60_000);

  it('the fallback is inside the bracket of every bank Phase 2 measures an interval on', () => {
    // The banks a single-terminal up-peak is defined on, which is where an achieved interval is
    // a meaningful number at all — both Phase 2 buildings and both zones of the secure tower.
    const measured = new Set([
      'midtown-office/main',
      'garden-apartments/main',
      'secure-tower/low',
      'secure-tower/high',
    ]);
    const rows = everyBankBracket().filter((row) => measured.has(row.id));
    expect(rows.map((row) => row.id).sort()).toEqual([...measured].sort());

    for (const row of rows) {
      // If reference data ever moves the fallback out of one of these brackets, supply
      // `CarTimings` for that building — do not retune the constant to make this pass.
      expect(row.minRoundTripS, row.id).toBeDefined();
      expect(FALLBACK_DEPARTURE_GAP_S, row.id).toBeGreaterThan(row.maxReopenS);
      expect(FALLBACK_DEPARTURE_GAP_S, row.id).toBeLessThan(row.minRoundTripS as number);
    }
  }, 60_000);

  it('and no constant is safe on all of them, which is why the derivation is not optional', () => {
    // A mixed-use tower's shuttle takes longer to load a full car than Midtown Office's whole
    // shortest round trip takes to complete, so those two brackets do not overlap: no single
    // number can serve both buildings. This is the assertion that stops the fallback from being
    // read as the answer, and it cannot be satisfied by moving the constant.
    //
    // **These assertions rest entirely on the authored transfer times**, so the exact figures are
    // pinned rather than left implicit. At the uniform office 1.2 s the worst reopen across the
    // original fourteen banks was 28.8 s against a 29.0 s minimum ceiling — a constant *would* be
    // safe everywhere by 0.2 s, no bracket would be empty, and every claim below would be false.
    // The difference is that the shuttles and the residential banks are authored at 1.75 s and the
    // hotel zone at 1.5 s. `transferOf` reads those values; it does not supply them.
    //
    // **The survey grew from fourteen banks to seventeen, and the headline moved with it.** The
    // worst reopen is no longer a shuttle: `st-jude-hospital`'s bank is 26-person cars at the
    // hospital transfer time of 2.5 s, so a full load takes 56.5 s to board — half again the
    // 39.8 s shuttle that used to be the extreme. That building strengthens the claim rather than
    // complicating it: the spread between the worst reopen and the tightest ceiling is now nearly
    // 2:1, and no constant is safe by a wider margin than before.
    const rows = everyBankBracket();
    const detail = rows
      .map((row) => `${row.id} (${row.maxReopenS.toFixed(1)}, ${row.minRoundTripS?.toFixed(1) ?? 'empty'})`)
      .join('; ');
    const ceilings = rows
      .map((row) => row.minRoundTripS)
      .filter((value): value is number => value !== undefined);

    // The survey is the whole shipped set, not a subset that happens to prove the point.
    expect(rows.length, detail).toBe(17);

    // 56.5 s — a 26-person hospital car at 2.5 s — against a 29.0 s floor on Midtown Office.
    expect(Math.max(...rows.map((row) => row.maxReopenS)), detail).toBeCloseTo(56.5, 6);
    expect(Math.min(...ceilings), detail).toBeCloseTo(29.0, 1);
    expect(Math.max(...rows.map((row) => row.maxReopenS)), detail).toBeGreaterThan(
      Math.min(...ceilings),
    );

    // Seven of the seventeen sit at or above the fallback, so on those it would split one loading
    // into two departures — the original defect, in the banks the fallback does not cover. The two
    // new members are the two new buildings with an unlike car in the bank: a bank is as slow to
    // load as its slowest car, and both of these hold one deliberately.
    const unsafe = rows.filter((row) => FALLBACK_DEPARTURE_GAP_S <= row.maxReopenS);
    expect(unsafe.map((row) => row.id).sort(), detail).toEqual([
      'crown-hotel/main',
      'mixed-use-high-rise/residential-local',
      'mixed-use-high-rise/shuttle',
      'st-jude-hospital/main',
      'vertical-city/shuttle',
      'vertical-city/zone-5-local',
      'vertical-city/zone-6-local',
    ]);

    // Stronger still, and worth stating in a test rather than in prose: on some banks *no*
    // threshold works, because a full load's dwell outlasts a one-floor round trip. An achieved
    // interval on those needs a car-position series, not boarding times — see
    // `departureGapBracket`'s @throws. `sim/simulation.ts` meets this as a `MetricsError`, reports
    // it as `departureGapBasis: 'unmeasurable'` and publishes no interval, which is the correct
    // outcome: an interval that cannot be measured must not be reported.
    expect(
      rows.filter((row) => row.minRoundTripS === undefined).map((row) => row.id).sort(),
      detail,
    ).toEqual([
      'crown-hotel/main',
      'mixed-use-high-rise/residential-local',
      'st-jude-hospital/main',
      'vertical-city/shuttle',
      'vertical-city/zone-6-local',
    ]);
  }, 60_000);
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
