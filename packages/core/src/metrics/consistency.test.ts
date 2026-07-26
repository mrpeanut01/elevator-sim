/**
 * **The interval and the handling capacity must imply the same round trip.**
 *
 * This is the guard that exposed `DEFAULT_DEPARTURE_GAP_S = 10`, and the reason it is a
 * permanent test rather than a paragraph in a report.
 *
 * ## The identity
 *
 * The closed form states throughput two ways, and they are the same statement:
 *
 * ```text
 * INT = RTT / L                RTT_from_interval = INT · L
 * HC5 = 300 · P · L / RTT      RTT_from_capacity = 300 · P · L / HC5
 * ```
 *
 * `metrics/` measures `INT` ({@link achievedIntervalOf}) and `HC5`
 * ({@link handlingCapacityOf}) from **the same record**, by two routes that share nothing: the
 * interval reconstructs *departures* from terminal boarding times, while the capacity counts
 * *people* and divides by the window. So the two round trips they imply must agree, and when
 * they do not, one of the two routes is wrong.
 *
 * ## Why `P` cannot come from the interval's own departures
 *
 * The trap in this check — and the reason the defect survived so long — is that
 * `HC5 = 300·P/INT` is a **tautology** when `P` is measured as persons-per-departure using the
 * same reconstruction the interval used. Split every loading in two and `INT` halves, `P` halves,
 * and the identity still holds perfectly while both numbers are wrong.
 *
 * `P` therefore comes from a third instrument that knows nothing about boarding times: the
 * record's **load samples**. Occupancy excursions above zero are car trips, and the peak
 * occupancy of each excursion is what that trip carried. Under pure up-peak — everyone boards at
 * the terminal, everyone alights above it, the car comes back empty — that is exactly `P`, and it
 * is invariant to any clustering threshold.
 *
 * ## What this file asserts, on both Phase 2 buildings
 *
 * 1. With the threshold **derived from the doors**, the two round trips agree to within
 *    {@link TOLERANCE}.
 * 2. The derived reconstruction recovers **exactly** the trip count the load samples show.
 * 3. At the old 10 s threshold, both statements fail on Garden Apartments — so this test has
 *    teeth, and cannot be satisfied by a metric that has stopped measuring anything.
 *
 * Nothing here is fitted. The threshold comes from `data/`, the loads from the record, the
 * window from the run.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { analyzeUpPeak } from '../analytical/upPeak.js';
import { loadConfig } from '../config/loader.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';
import type { Car } from '../model/car/index.js';
import { travelTime } from '../physics/motion/index.js';
import { Simulation } from '../sim/simulation.js';
import type { SimulationResult } from '../sim/types.js';

import { achievedIntervalOf, handlingCapacityOf } from './summarize.js';
import type { CarTimings, LoadSample, RunRecord } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

/**
 * How far apart the two round trips may sit.
 *
 * 5 %. The residual is not measurement error in either metric: the interval is a mean of gaps
 * *between* observed departures, `(last − first) / (n − 1)`, while the capacity divides the whole
 * window by the people carried in it, so the two differ by wherever the first and last departures
 * happen to fall against the window edges. Measured at −2.5 % (Midtown) and +0.3 % (Garden) over
 * 16 replications; the defect this guards against was −10.7 % and −15.9 %.
 */
const TOLERANCE = 0.05;

/** The value that shipped before the fix, kept as the negative control. */
const LEGACY_DEPARTURE_GAP_S = 10;

/** Enough replications to average out one run's luck; few enough to stay a unit test. */
const SEEDS = Array.from({ length: 16 }, (_, i) => 100_000 + i);

/**
 * Offered demand as a multiple of the closed-form `%POP`.
 *
 * Above capacity on purpose: the closed form describes a **saturated** group, cars leaving the
 * terminal back to back at design load. Below that the interval is set by how often people
 * arrive rather than by how long a round trip takes, and this identity would be measuring the
 * demand knob. 1.3× matches `analytical/validation.test.ts`.
 */
const OVERLOAD_FACTOR = 1.3;

interface Case {
  readonly buildingId: string;
  /** Long enough to hold tens of departures: the interval is estimated from the gaps. */
  readonly peakWindowS: number;
  /**
   * Relative weight per entrance floor. The closed form loads at **one** terminal; Midtown
   * declares two (lobby `G`, garage `P1`) and the garage is weighted to zero.
   */
  readonly entranceWeights?: Readonly<Record<string, number>> | undefined;
}

const MIDTOWN: Case = { buildingId: 'midtown-office', peakWindowS: 1800, entranceWeights: { G: 1, P1: 0 } };
const GARDEN: Case = { buildingId: 'garden-apartments', peakWindowS: 1800 };

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

function buildingOf(id: string): ResolvedBuilding {
  const building = config.buildingsById.get(id);
  if (building === undefined) throw new Error(`missing building fixture "${id}"`);
  return building;
}

/** One replication under the closed form's conditions. Everything here is config. */
function simulate(caseSpec: Case, seed: number, pctPopulation5Min: number): Simulation {
  const profile = config.dispatcherProfilesById.get('collective');
  if (profile === undefined) throw new Error('missing dispatcher fixture "collective"');
  return new Simulation({
    building: buildingOf(caseSpec.buildingId),
    // `parkingStrategy: 'lobby'` is a profile field, not a code path (invariant 7): under
    // up-peak the whole group shuttles from the terminal.
    dispatcherProfile: { ...profile, idle: { ...profile.idle, parkingStrategy: 'lobby' } },
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    demand: {
      directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
      ...(caseSpec.entranceWeights === undefined ? {} : { entranceWeights: caseSpec.entranceWeights }),
      arrivalRatePctPop5min: pctPopulation5Min,
      peakWindowS: caseSpec.peakWindowS,
    },
  });
}

/**
 * The {@link CarTimings} a runner would attach to the record, off the cars it actually built.
 *
 * `P·tp` uses the design load and the car's own transfer time; the flight time is the project's
 * jerk-limited `travelTime` over the terminal-to-first-served-floor rise. No constant.
 */
function carTimingsOf(car: Car, building: ResolvedBuilding, terminalFloorId: string, nearestFloorId: string): CarTimings {
  const terminalHeightM = building.floorsById.get(terminalFloorId)?.heightM;
  const nearestHeightM = building.floorsById.get(nearestFloorId)?.heightM;
  if (terminalHeightM === undefined || nearestHeightM === undefined) {
    throw new Error(`missing floor heights for ${terminalFloorId} → ${nearestFloorId}`);
  }
  return {
    doorOpenS: car.doorConfig.openS,
    doorCloseS: car.doorConfig.closeS,
    dwellHallCallS: car.doorConfig.dwellHallCallS,
    dwellCarCallS: car.doorConfig.dwellCarCallS,
    fullLoadTransferS: car.spec.designCapacityPersons * car.passengerTransferS,
    nearestFloorFlightS: travelTime(nearestHeightM - terminalHeightM, car.constraints),
    motorStartDelayS: car.spec.motorStartDelayS,
    levelingSettleS: car.spec.levelingSettleS,
  };
}

/**
 * Car trips as the **load samples** see them: one per excursion of occupancy above zero, with
 * the peak occupancy that excursion reached.
 *
 * Independent of every boarding timestamp, which is the entire point — see this file's header.
 * An excursion is attributed to the window by where its peak fell, so a trip is counted once.
 */
function tripsFromLoadSamples(
  samples: readonly LoadSample[],
  startS: number,
  endS: number,
): { readonly count: number; readonly meanPassengers: number } {
  const byCar = new Map<string, LoadSample[]>();
  for (const sample of samples) {
    const list = byCar.get(sample.carId);
    if (list === undefined) byCar.set(sample.carId, [sample]);
    else list.push(sample);
  }

  const peaks: number[] = [];
  for (const [, list] of byCar) {
    const ordered = [...list].sort((a, b) => a.at - b.at);
    let peak = 0;
    let peakAt = 0;
    for (const sample of ordered) {
      if (sample.occupants > peak) {
        peak = sample.occupants;
        peakAt = sample.at;
      }
      if (sample.occupants === 0 && peak > 0) {
        if (peakAt >= startS && peakAt < endS) peaks.push(peak);
        peak = 0;
      }
    }
  }
  return {
    count: peaks.length,
    meanPassengers: peaks.length === 0 ? Number.NaN : peaks.reduce((a, b) => a + b, 0) / peaks.length,
  };
}

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const divergence = (measured: number, reference: number): number => (measured - reference) / reference;

interface Consistency {
  readonly roundTripFromIntervalS: number;
  readonly roundTripFromCapacityS: number;
  readonly divergence: number;
  readonly intervalS: number;
  readonly departures: number;
  readonly loadSampleTrips: number;
  readonly passengersPerTrip: number;
}

/** The identity, evaluated on one record at one clustering threshold. */
function consistencyOf(
  record: RunRecord,
  result: SimulationResult,
  carsInGroup: number,
  gap: { readonly carTimings: CarTimings } | { readonly departureGapS: number },
): Consistency {
  const window = result.reportWindow;
  const interval = achievedIntervalOf(record.passengers, { window, ...gap });
  const capacity = handlingCapacityOf(record.passengers, window, record.population);
  const trips = tripsFromLoadSamples(record.loadSamples, window.startS, window.endS);

  const roundTripFromIntervalS = interval.meanS * carsInGroup;
  const roundTripFromCapacityS = (300 * trips.meanPassengers * carsInGroup) / capacity.personsPer5Min;
  return {
    roundTripFromIntervalS,
    roundTripFromCapacityS,
    divergence: divergence(roundTripFromIntervalS, roundTripFromCapacityS),
    intervalS: interval.meanS,
    departures: interval.departureCount,
    loadSampleTrips: trips.count,
    passengersPerTrip: trips.meanPassengers,
  };
}

interface Measurement {
  readonly derived: readonly Consistency[];
  readonly legacy: readonly Consistency[];
  readonly carTimings: CarTimings;
  readonly carsInGroup: number;
  /** `floor(0.8 × rated capacity)` — what a car leaves the terminal with when demand exceeds it. */
  readonly designPersons: number;
}

function measure(caseSpec: Case): Measurement {
  const building = buildingOf(caseSpec.buildingId);
  const analysis = analyzeUpPeak(building, config.elevatorSpecs, { bankId: 'main' });
  const nearestFloorId = analysis.upperFloorIds[0];
  if (nearestFloorId === undefined) throw new Error('bank serves no floor above its terminal');

  const car = simulate(caseSpec, 1, 1).building.cars[0];
  if (car === undefined) throw new Error('bank has no cars');
  const carTimings = carTimingsOf(car, building, analysis.terminalFloorId, nearestFloorId);
  const carsInGroup = analysis.roundTripTerms.carsInGroup;

  const derived: Consistency[] = [];
  const legacy: Consistency[] = [];
  for (const seed of SEEDS) {
    const result = simulate(
      caseSpec,
      seed,
      analysis.result.percentPopulation5Min * OVERLOAD_FACTOR,
    ).run();
    expect(result.status).toBe('completed');
    derived.push(consistencyOf(result.record, result, carsInGroup, { carTimings }));
    legacy.push(
      consistencyOf(result.record, result, carsInGroup, { departureGapS: LEGACY_DEPARTURE_GAP_S }),
    );
  }
  return { derived, legacy, carTimings, carsInGroup, designPersons: car.spec.designCapacityPersons };
}

describe.each([
  ['Midtown Office', MIDTOWN],
  ['Garden Apartments', GARDEN],
])('%s: the interval and the handling capacity imply the same round trip', (_name, caseSpec) => {
  let m: Measurement;

  beforeAll(() => {
    m = measure(caseSpec);
  }, 120_000);

  it('agrees to within a few percent, with the threshold derived from the doors', () => {
    const fromInterval = mean(m.derived.map((c) => c.roundTripFromIntervalS));
    const fromCapacity = mean(m.derived.map((c) => c.roundTripFromCapacityS));

    // Both are real seconds of round trip, so a sanity floor before the comparison: a NaN or a
    // zero on either side would otherwise pass some tolerance somewhere.
    expect(fromInterval).toBeGreaterThan(30);
    expect(fromCapacity).toBeGreaterThan(30);
    expect(Math.abs(divergence(fromInterval, fromCapacity))).toBeLessThan(TOLERANCE);
  });

  it('reconstructs exactly the trips the load samples show', () => {
    // The strongest form of the same statement, and threshold-free on one side: departures
    // reconstructed from boarding times must equal occupancy excursions above zero.
    for (const c of m.derived) {
      expect(c.departures).toBe(c.loadSampleTrips);
    }
    // And the loads are what the closed form assumes at this demand — cars leaving at design
    // load — so the agreement above is not two errors cancelling on a half-empty group.
    expect(mean(m.derived.map((c) => c.passengersPerTrip))).toBeGreaterThan(0.9 * m.designPersons);
  });

  it('a threshold below the derived one can only split, never merge', () => {
    // Same records, same window, two thresholds. Stated as a monotonicity check because it is
    // what makes the direction of the old defect's bias knowable rather than empirical: a
    // too-small threshold can only *add* departures, and more departures is a shorter interval.
    for (const [index, c] of m.legacy.entries()) {
      expect(c.departures).toBeGreaterThanOrEqual(m.derived[index]?.departures ?? 0);
    }
  });
});

describe('the guard has teeth: at 10 s, Garden Apartments is internally inconsistent', () => {
  let m: Measurement;

  beforeAll(() => {
    m = measure(GARDEN);
  }, 120_000);

  /**
   * Garden Apartments is the discriminating case, and it is worth saying why rather than only
   * asserting it. Its doors are slower (2.5 s open, 4.0 s close) and its dwell is longer relative
   * to its round trip than Midtown's, so a straggler reopening the doors at the lobby is both
   * more likely and more expensive: 11.5 s bare, ~20.5 s after a full load. At the 10 s threshold
   * roughly one loading in six was counted twice.
   *
   * Midtown fails this too on a long window, but by less and less reliably — the reopen rate
   * depends on the arrival process — so the permanent assertion lives on the building where the
   * effect is unambiguous.
   */
  it('reports a round trip ~10 % short of the one its own throughput implies', () => {
    const fromInterval = mean(m.legacy.map((c) => c.roundTripFromIntervalS));
    const fromCapacity = mean(m.legacy.map((c) => c.roundTripFromCapacityS));
    expect(divergence(fromInterval, fromCapacity)).toBeLessThan(-TOLERANCE);
  });

  it('splits loadings that the load samples say were one trip', () => {
    const legacyTrips = mean(m.legacy.map((c) => c.departures));
    const realTrips = mean(m.legacy.map((c) => c.loadSampleTrips));
    expect(legacyTrips).toBeGreaterThan(realTrips * 1.05);
  });

  it('and the derived threshold fixes both, on the same records', () => {
    const derivedInterval = mean(m.derived.map((c) => c.intervalS));
    const legacyInterval = mean(m.legacy.map((c) => c.intervalS));
    // The bias is optimistic, which is the direction CLAUDE.md § Statistical discipline warns
    // about: the shorter interval makes the group look better than it is.
    expect(legacyInterval).toBeLessThan(derivedInterval);
    expect(Math.abs(mean(m.derived.map((c) => c.divergence)))).toBeLessThan(TOLERANCE);
  });
});
