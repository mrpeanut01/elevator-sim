/**
 * The project's primary correctness oracle, wired end to end.
 *
 * docs/05-roadmap.md § Phase 2: *"Midtown Office under pure up-peak produces interval and
 * handling capacity matching the closed-form Barney/CIBSE RTT calculation within a few percent.
 * This is the project's primary correctness oracle."* `analytical/` computes the closed-form
 * side and `metrics/` measures the achieved side; `metrics/interval.test.ts` records that the
 * comparison itself *"needs the Phase 2 traffic generator, dispatcher and kernel wired end to
 * end; it belongs with whoever owns that runner"*. This is that comparison.
 *
 * ## What is compared, and against what
 *
 * The round trip itself, measured from the run record, is the quantity everything else here is
 * derived from — `INT = RTT/L` and `HC = 300·P·L/RTT` are both functions of it, so comparing
 * only the two derived numbers leaves the term they share unexamined. A departure is
 * reconstructed the way `metrics/interval.ts` reconstructs one: boardings at the terminal
 * carry a single timestamp per stop (everybody moves at the instant the doors are fully open),
 * so one timestamp per car **is** one departure, the gap to that car's next one is its round
 * trip, the group size is its load `P`, and the number of distinct destinations among them is
 * its stop count `S`.
 *
 * Four conditions reproduce the mode the closed form is a statement about:
 *
 * | Closed-form assumption | How the run reproduces it |
 * |---|---|
 * | every passenger boards at one terminal and travels up | `directionalSplit: { incoming: 1, … }`, `entranceWeights: { G: 1, P1: 0 }` |
 * | all `L` cars shuttle from that terminal | `idle.parkingStrategy: 'lobby'` — otherwise free cars stay where they stopped and the terminal is served by however many happen to come back |
 * | the cars are at the load the formula prices `P` at | demand **above** the analytical `%POP`, and only trips that left at design load are measured. This is `CLOSED_FORM_COMPARISON_RULE.precondition`: at any lower load a correct simulator reads low, on both RTT and HC, and the comparison says nothing |
 * | `RTT` is a mean, not one draw | {@link SEEDS} replications, and a peak plateau long enough to hold twenty-odd departures per run |
 *
 * ## Why the raw comparison is ~30 % out, and why that is the criterion being met
 *
 * Measured against the textbook figure the simulated round trip is about 35 % long (≈202 s
 * against 150 s) and handling capacity about 25 % low, and neither is a defect. The closed form
 * as classically stated omits two costs that {@link CLOSED_FORM_ASSUMPTIONS} enumerates in
 * advance, both `bias: 'under'`:
 *
 * - **`stop-time-excludes-acceleration`.** `ts` counts doors, motor start and levelling but not
 *   the kinematic penalty of stopping — Barney's full `ts` is `T₁ + to + tc − tv`. On this
 *   building `T₁ − tv` is ≈3.2 s, charged `S+1 ≈ 10.5` times a trip: ≈33 s. The analytical
 *   module names this bridge itself and offers `accelerationLossPerStopS` to close it.
 * - **`no-minimum-dwell`.** The closed form charges transfer only, as `2·P·tp`; a real
 *   controller holds a minimum dwell whatever the transfer was. At ≈1.35 passengers per
 *   upstairs stop the 3 s car-call dwell exceeds their 1.6 s of transfer by ≈1.4 s, ≈13 s a
 *   trip.
 *
 * Restore those two — from the same reference data the simulation runs on, not from fitted
 * constants — and the disagreement collapses to **≈3 %**, which is the acceptance criterion
 * read as written. So the numbers below are asserted against
 * {@link correctedRoundTripSeconds}, and the raw textbook figure is asserted as a *bound*
 * (`CLOSED_FORM_COMPARISON_RULE`: at matched load a simulated RTT **below** the closed form is
 * evidence of a bug, because everything the closed form leaves out only ever adds seconds).
 *
 * Nothing here widens a band to make a phase pass (CLAUDE.md § Working agreements). It replaces
 * a ±25 % band around an arbitrary 0.83× demand factor with a term-by-term reconciliation whose
 * residual is a few percent, and it fails if any term drifts.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { CLOSED_FORM_ASSUMPTIONS, CLOSED_FORM_COMPARISON_RULE } from '../analytical/index.js';
import { assertOracleProfile } from '../analytical/oraclePin.test-helper.js';
import type { UpPeakAnalysis } from '../analytical/index.js';
import { analyzeUpPeak } from '../analytical/upPeak.js';
import type { DispatcherProfile, LoadedConfig } from '../config/types.js';
import type { Car } from '../model/car/index.js';
import { dwellSecondsFor } from '../physics/doors/index.js';
import type { DoorConfig } from '../physics/doors/index.js';
import { travelTime } from '../physics/motion/index.js';
import type { MotionConstraints } from '../physics/motion/index.js';

import { load, withParking } from './fixtures.test-helper.js';
import { Simulation } from './simulation.js';
import type { SimulationResult } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

/**
 * Replications averaged over. Not a confidence interval — enough that no single draw rules, and
 * fixed, so the numbers below are reproducible rather than resampled on every run.
 */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Length of the peak plateau, seconds, which is also the reported window.
 *
 * The template's own 5 minutes is barely one and a half round trips per car: six or seven
 * departures, from which a mean gap is a coarse estimate of the interval and a person count is
 * quantised in twelve-passenger lumps. Fifteen minutes holds ≈19 departures per run and the
 * same measurement steadies to a few percent. It changes nothing about the system being
 * measured — the arrival rate, the building and the dispatcher are identical — only how long it
 * is observed for, which is a sample-size decision and belongs in the test that needs it.
 */
const PLATEAU_S = 900;

/** Offered demand as a multiple of the closed-form `%POP`. Above 1 so the ceiling is measured. */
const OVERLOAD_FACTOR = 1.15;

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const relativeError = (measured: number, reference: number): number =>
  (measured - reference) / reference;

function analysis(): UpPeakAnalysis {
  const building = config.buildingsById.get('midtown-office');
  if (building === undefined) throw new Error('missing fixture');
  return analyzeUpPeak(building, config.elevatorSpecs, { bankId: 'main' });
}

/** The closed form re-evaluated at the load the simulator actually carried. */
function atMatchedLoad(passengersPerTrip: number): UpPeakAnalysis {
  const building = config.buildingsById.get('midtown-office');
  if (building === undefined) throw new Error('missing fixture');
  return analyzeUpPeak(building, config.elevatorSpecs, { bankId: 'main', passengersPerTrip });
}

function upPeakRuns(pctPopulation5Min: number): readonly Simulation[] {
  const building = config.buildingsById.get('midtown-office');
  const profile = config.dispatcherProfilesById.get('collective');
  if (building === undefined || profile === undefined) throw new Error('missing fixture');

  return SEEDS.map(
    (seed) =>
      new Simulation({
        building,
        // The operating mode the closed form assumes, expressed entirely as config: a parking
        // strategy, not a code path (CLAUDE.md invariant 7).
        // Pinned to conventional up/down buttons. See `assertOracleProfile`: a destination arm
        // *should* disagree with the closed form, so the oracle refuses one rather than being
        // widened to accommodate it.
        dispatcherProfile: assertOracleProfile(withParking(profile as DispatcherProfile, 'lobby')),
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed,
        demand: {
          directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
          entranceWeights: { G: 1, P1: 0 },
          arrivalRatePctPop5min: pctPopulation5Min,
          peakWindowS: PLATEAU_S,
        },
      }),
  );
}

/* -------------------------------------------------------------------------- *
 * Measuring the round trip from the record
 * -------------------------------------------------------------------------- */

/** One car's departure from the terminal, and what it did before coming back. */
interface RoundTrip {
  readonly departedAt: number;
  /** `P` — how many boarded on that departure. */
  readonly passengers: number;
  /** `S` — distinct destinations among them, which is the number of stops on the way up. */
  readonly stops: number;
  /** Seconds until the same car loaded at the terminal again, or `undefined` for the last one. */
  readonly roundTripS: number | undefined;
}

/**
 * Every terminal departure in the record, per car, in time order.
 *
 * Independent of the loop's internals: it reads boarding timestamps, origin floors and
 * destination floors out of the persisted record, which is the same material a stored run
 * replayed from its seed would offer.
 */
function roundTrips(result: SimulationResult, terminalFloorId: string): readonly RoundTrip[] {
  interface Departure {
    passengers: number;
    readonly destinations: Set<string>;
  }

  const byCar = new Map<string, Map<number, Departure>>();
  for (const leg of result.record.passengers) {
    if (leg.originFloorId !== terminalFloorId) continue;
    if (leg.boardedAt === undefined || leg.carId === undefined) continue;
    const departures = byCar.get(leg.carId) ?? new Map<number, Departure>();
    byCar.set(leg.carId, departures);
    const departure = departures.get(leg.boardedAt) ?? {
      passengers: 0,
      destinations: new Set<string>(),
    };
    departure.passengers += 1;
    departure.destinations.add(leg.destinationFloorId);
    departures.set(leg.boardedAt, departure);
  }

  const trips: RoundTrip[] = [];
  for (const [, departures] of byCar) {
    const times = [...departures.keys()].sort((a, b) => a - b);
    for (const [index, departedAt] of times.entries()) {
      const departure = departures.get(departedAt);
      if (departure === undefined) continue;
      const next = times[index + 1];
      trips.push({
        departedAt,
        passengers: departure.passengers,
        stops: departure.destinations.size,
        roundTripS: next === undefined ? undefined : next - departedAt,
      });
    }
  }
  return trips;
}

/* -------------------------------------------------------------------------- *
 * The closed form with its documented omissions restored
 * -------------------------------------------------------------------------- */

/** The two `bias: 'under'` terms the classic expression leaves out, in seconds per stop. */
interface StopCorrections {
  /** `CLOSED_FORM_ASSUMPTIONS` id `stop-time-excludes-acceleration`. `T₁ − tv`. */
  readonly accelerationLossS: number;
  /** `CLOSED_FORM_ASSUMPTIONS` id `no-minimum-dwell`, at an upstairs stop. */
  readonly dwellExcessS: number;
}

function stopCorrections(
  closedForm: UpPeakAnalysis,
  passengersPerTrip: number,
  expectedStops: number,
  door: DoorConfig,
  constraints: MotionConstraints,
): StopCorrections {
  // Barney's full ts is T₁ + to + tc − tv, where T₁ is the true single-floor flight. `ts`
  // already carries the motor start and the levelling, so what is missing is exactly the
  // kinematic difference between flying a floor and charging it at rated speed.
  const accelerationLossS =
    travelTime(closedForm.interfloorDistanceM, constraints) -
    closedForm.roundTripTerms.singleFloorTransitS;

  // An upstairs stop is a car call; its transfer is the passengers who alight there. The door
  // machine holds the longer of its policy dwell and that transfer, and the closed form charges
  // only the transfer.
  const transferS =
    (passengersPerTrip / expectedStops) * closedForm.roundTripTerms.passengerTransferS;
  const dwellS = dwellSecondsFor(door, {
    carCall: true,
    hallCall: false,
    hallQueueLength: 0,
    transferSeconds: transferS,
  });
  return { accelerationLossS, dwellExcessS: Math.max(0, dwellS - transferS) };
}

/**
 * `RTT` as the closed form would state it if it charged the two things it documents as missing.
 *
 * Every input comes from the reference data or from the pure physics the reference data
 * parameterises — `travelTime` and `dwellSecondsFor` are the same functions the run used, so
 * this is the closed form completed, not a curve fitted to the answer.
 */
function correctedRoundTripSeconds(
  matched: UpPeakAnalysis,
  corrections: StopCorrections,
): number {
  const stops = matched.result.expectedStops;
  return (
    matched.result.roundTripTimeS +
    (stops + 1) * corrections.accelerationLossS +
    stops * corrections.dwellExcessS
  );
}

/** Everything one demand level yields, measured once and shared by the assertions below. */
interface Measurement {
  readonly closedForm: UpPeakAnalysis;
  readonly matched: UpPeakAnalysis;
  readonly corrections: StopCorrections;
  readonly correctedRoundTripS: number;
  readonly passengersPerTrip: number;
  readonly stopsPerTrip: number;
  readonly roundTripS: number;
  readonly tripCount: number;
  readonly intervalS: number;
  readonly departuresPerRun: number;
  readonly coefficientOfVariation: number;
  readonly handlingCapacityPctPop: number;
  readonly maxLoadFactor: number;
  readonly results: readonly SimulationResult[];
  /** One car of the bank. They are identical, which `analyzeUpPeak` would warn about if not. */
  readonly car: Car;
}

function measureAtSaturation(): Measurement {
  const closedForm = analysis();
  const simulations = upPeakRuns(closedForm.result.percentPopulation5Min * OVERLOAD_FACTOR);
  const results = simulations.map((simulation) => simulation.run());

  // `CLOSED_FORM_COMPARISON_RULE.matchedLoadGuidance`: the largest integer load the simulator
  // can actually board. Trips that left the terminal below it were not full, and a part-full
  // trip is a legitimately shorter round trip that the closed form does not describe.
  const designPersons = Math.floor(closedForm.designLoadFactor * closedForm.ratedCapacityPersons);
  const full = results
    .flatMap((result) => roundTrips(result, closedForm.terminalFloorId))
    .filter((trip) => trip.roundTripS !== undefined && trip.passengers >= designPersons);

  const passengersPerTrip = mean(full.map((trip) => trip.passengers));
  const matched = atMatchedLoad(passengersPerTrip);

  const car = simulations[0]?.building.cars[0];
  if (car === undefined) throw new Error('missing fixture');
  const corrections = stopCorrections(
    closedForm,
    passengersPerTrip,
    matched.result.expectedStops,
    car.doorConfig,
    car.constraints,
  );

  return {
    closedForm,
    matched,
    corrections,
    correctedRoundTripS: correctedRoundTripSeconds(matched, corrections),
    passengersPerTrip,
    stopsPerTrip: mean(full.map((trip) => trip.stops)),
    roundTripS: mean(full.map((trip) => trip.roundTripS ?? 0)),
    tripCount: full.length,
    intervalS: mean(results.map((result) => result.summary.achievedInterval.meanS)),
    departuresPerRun: mean(
      results.map((result) => result.summary.achievedInterval.departureCount),
    ),
    coefficientOfVariation: mean(
      results.map((result) => result.summary.achievedInterval.coefficientOfVariation),
    ),
    handlingCapacityPctPop: mean(
      results.map((result) => result.summary.handlingCapacity.pctPopulationPer5Min ?? 0),
    ),
    maxLoadFactor: mean(results.map((result) => result.summary.loadFactor.maxLoadFactor)),
    results,
    car,
  };
}

let measurement: Measurement;

beforeAll(() => {
  measurement = measureAtSaturation();
});

/* -------------------------------------------------------------------------- *
 * The comparison
 * -------------------------------------------------------------------------- */

describe('Midtown Office under pure up-peak, against the closed form', () => {
  it('measures full round trips, on runs that lost nobody', () => {
    // Everything below is a mean over these; if the sample is thin or a run failed, the
    // agreement further down is an accident.
    expect(measurement.tripCount).toBeGreaterThan(150);
    expect(measurement.departuresPerRun).toBeGreaterThan(15);
    for (const result of measurement.results) {
      expect(result.status).toBe('completed');
      expect(result.conservation.balanced).toBe(true);
      expect(result.conservation.delivered).toBe(result.conservation.generated);
    }

    // `%POP` on both sides is quoted against the same `U`. The closed form measures a bank's
    // capacity against the population above its terminal; the record carries the building's.
    // On this building they coincide, and if they ever stop coinciding the capacity comparison
    // below is comparing two different fractions.
    expect(measurement.results[0]?.record.population).toBe(
      measurement.closedForm.roundTripTerms.population,
    );
  });

  it('charges exactly the seconds its own physics prices, stop by stop', () => {
    // The tightest instrument here, and the one that keeps the percent bands honest: a
    // tolerance-based comparison cannot see a term that is wrong by less than the tolerance, so
    // one leg of the round trip is checked to the float.
    //
    // From the instant a terminal boarding is recorded (doors fully open) to the instant the
    // first passenger of that load steps out upstairs, a car owes exactly:
    //
    //     dwell + closeS + motorStartDelayS + flight(Δh) + levelingSettleS + openS
    //
    // every term of which comes from the same reference data and the same pure functions the
    // run used — `dwellSecondsFor` and `travelTime`. Nothing is fitted, and the dwell tracks a
    // change to `data/elevator-specs.json` or to the profile automatically.
    const { car } = measurement;
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('missing fixture');
    const terminalHeightM = building.floorsById.get(measurement.closedForm.terminalFloorId)
      ?.heightM;
    expect(terminalHeightM).toBeDefined();
    if (terminalHeightM === undefined) return;

    let exact = 0;
    let total = 0;
    let worstShortfallS = 0;

    for (const result of measurement.results) {
      // Each terminal boarding instant is one departure; the earliest alighting among that load
      // is where it stopped first.
      const loads = new Map<string, { passengers: number; firstAlightAt: number; floorId: string }>();
      for (const leg of result.record.passengers) {
        if (leg.originFloorId !== measurement.closedForm.terminalFloorId) continue;
        if (leg.boardedAt === undefined || leg.carId === undefined) continue;
        const key = `${leg.carId}@${leg.boardedAt}`;
        const load = loads.get(key) ?? {
          passengers: 0,
          firstAlightAt: Number.POSITIVE_INFINITY,
          floorId: '',
        };
        load.passengers += 1;
        if (leg.alightedAt !== undefined && leg.alightedAt < load.firstAlightAt) {
          load.firstAlightAt = leg.alightedAt;
          load.floorId = leg.destinationFloorId;
        }
        loads.set(key, load);
      }

      for (const [key, load] of loads) {
        if (!Number.isFinite(load.firstAlightAt)) continue;
        const heightM = building.floorsById.get(load.floorId)?.heightM;
        if (heightM === undefined) continue;
        const boardedAt = Number(key.slice(key.lastIndexOf('@') + 1));
        const measuredS = load.firstAlightAt - boardedAt;

        const reason = {
          carCall: false,
          hallCall: true,
          hallQueueLength: load.passengers,
          transferSeconds: load.passengers * car.passengerTransferS,
        } as const;
        const fixedS =
          car.doorConfig.closeS +
          car.spec.motorStartDelayS +
          travelTime(heightM - terminalHeightM, car.constraints) +
          car.spec.levelingSettleS +
          car.doorConfig.openS;
        const expectedS = dwellSecondsFor(car.doorConfig, reason) + fixedS;

        total += 1;
        if (Math.abs(measuredS - expectedS) < 1e-6) exact += 1;

        // A hard floor that holds whatever the dwell projection was: the door machine grants at
        // least the base hall-call dwell, and a car cannot fly a floor faster than its own
        // S-curve. Anything under this is time the loop never charged.
        const floorS = dwellSecondsFor(car.doorConfig, { ...reason, transferSeconds: 0 }) + fixedS;
        worstShortfallS = Math.min(worstShortfallS, measuredS - floorS);
      }
    }

    expect(total).toBeGreaterThan(300);
    expect(worstShortfallS).toBeGreaterThan(-1e-9);
    // A departure whose car flew straight to its first stop matches to the float; one that
    // answered something on the way legitimately takes longer, which is why this is a fraction
    // rather than a universal. Measured: 343 of 476 exact, 72 %.
    expect(exact / total).toBeGreaterThan(0.3);
  });

  it('stops as often per round trip as the closed form says it will', () => {
    // `S` is the whole combinatorial content of the closed form — P passengers drawing from N
    // floors — and it is measured here directly: distinct destinations among the people who
    // boarded together. Agreement means the simulator is serving the same trip the formula
    // scores, before any question of how long each part of it takes.
    const error = relativeError(measurement.stopsPerTrip, measurement.matched.result.expectedStops);
    expect(Math.abs(error)).toBeLessThan(0.04); // measured: 9.518 against 9.520, |error| = 0.0003
  });

  it('never round trips faster than the closed form, which is the one-sided half of the rule', () => {
    // CLOSED_FORM_COMPARISON_RULE: at matched load, below the closed form is evidence of a bug,
    // because every simplification left in the travel and stop terms only adds seconds. The
    // precondition is matched load, which is what the design-load filter above enforces.
    expect(measurement.roundTripS).toBeGreaterThan(measurement.matched.result.roundTripTimeS);

    // And the assumptions this test leans on are the ones the analytical module classifies as
    // one-sided. If one is ever reclassified, the argument here stops holding and this fails
    // rather than quietly continuing to be quoted.
    for (const id of ['stop-time-excludes-acceleration', 'no-minimum-dwell']) {
      expect(CLOSED_FORM_COMPARISON_RULE.oneSidedUnderIds).toContain(id);
      expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === id)?.bias).toBe('under');
    }
  });

  it('matches the closed form within a few percent once its documented omissions are charged', () => {
    const { corrections } = measurement;
    // Both corrections are real seconds, not fudge: a jerk-limited floor hop costs more than
    // df/v, and a 1.35-passenger stop is held open longer than 1.35·tp.
    expect(corrections.accelerationLossS).toBeGreaterThan(1);
    expect(corrections.dwellExcessS).toBeGreaterThan(0);

    const error = relativeError(measurement.roundTripS, measurement.correctedRoundTripS);
    // Measured: 202.3 s against 196.2 s, +3.1 %. The band is the acceptance criterion — "within
    // a few percent" — not a fitted tolerance, and the residual it leaves room for is the
    // smaller assumptions the correction does not model: multi-floor hops charged as
    // single-floor ones, door reopens, and E[f(S,H)] != f(E[S],E[H]).
    expect(Math.abs(error)).toBeLessThan(0.06);

    // The correction is doing real work: without it the same run reads ~35 % long, which is the
    // number a naive comparison reports as a defect.
    expect(
      relativeError(measurement.roundTripS, measurement.matched.result.roundTripTimeS),
    ).toBeGreaterThan(0.2);
  });

  it('achieves the closed-form interval within a few percent', () => {
    // INT = RTT/L. Compared against the corrected round trip for the same reason as above.
    const correctedIntervalS =
      measurement.correctedRoundTripS / measurement.matched.roundTripTerms.carsInGroup;
    const error = relativeError(measurement.intervalS, correctedIntervalS);

    // Measured: 47.6 s against 49.1 s, −2.9 %. The deficit is the estimator's, not the loop's:
    // a mean of gaps inside a window is (last − first)/(n − 1), which misses the part-gaps at
    // both edges and so reads low by about 1/n — here ~5 % on 19 departures.
    expect(Math.abs(error)).toBeLessThan(0.08);
    expect(measurement.departuresPerRun).toBeGreaterThan(15);

    // The spread is a separate finding from the mean, and it is large: real groups bunch, which
    // is `CLOSED_FORM_ASSUMPTIONS` id `no-dispatcher` — the closed form has no variance at all,
    // so a matching mean interval says nothing about how evenly the cars are spaced.
    expect(measurement.coefficientOfVariation).toBeGreaterThan(0.2);
    expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === 'no-dispatcher')?.bias).toBe(
      'none',
    );
  });

  it('achieves the handling capacity its round trip implies, and never more', () => {
    const { closedForm, matched, passengersPerTrip, roundTripS } = measurement;
    const terms = closedForm.roundTripTerms;

    // HC = 300·P·L/RTT, evaluated at what the cars actually carried and how long they actually
    // took. This is the same identity the closed form states, so agreement means the throughput
    // the metrics layer reports is the throughput the measured round trip produces — no work is
    // appearing or disappearing between the two.
    const impliedPctPop =
      ((300 * passengersPerTrip * terms.carsInGroup) / roundTripS / terms.population) * 100;
    const error = relativeError(measurement.handlingCapacityPctPop, impliedPctPop);
    expect(Math.abs(error)).toBeLessThan(0.08); // measured: 4.55 % against 4.46 %, +1.9 %

    // A simulator reporting more throughput than the closed form allows is not an optimistic
    // dispatcher; it is a simulator that has stopped charging for something.
    expect(measurement.handlingCapacityPctPop).toBeLessThan(
      closedForm.result.percentPopulation5Min,
    );

    // And the shortfall against the textbook figure — ~25 %, which is what an unqualified
    // comparison reports — is exactly the round-trip excess and the load, term for term:
    // HC/HC₀ = (P/P₀)·(RTT₀/RTT). Nothing else is missing.
    const explained =
      closedForm.result.percentPopulation5Min *
      (passengersPerTrip / terms.passengersPerTrip) *
      (matched.result.roundTripTimeS / roundTripS);
    expect(Math.abs(relativeError(measurement.handlingCapacityPctPop, explained))).toBeLessThan(
      0.08,
    );
    // The shortfall is real and large; this is not a case of the two figures coinciding anyway.
    expect(measurement.handlingCapacityPctPop).toBeLessThan(
      closedForm.result.percentPopulation5Min * 0.85,
    );
  });

  it('fills cars to the design load the closed form prices P at', () => {
    // `P` in the closed form is 80 % of rated capacity, never 100 % (CLAUDE.md § modelling
    // rules). A run whose cars never approach it is not running the system the formula scores.
    expect(measurement.maxLoadFactor).toBeGreaterThan(0.7);
    expect(measurement.maxLoadFactor).toBeLessThan(1.1);

    // The simulator cannot board 0.8 of a person, so its trips land just either side of the
    // largest integer load — `CLOSED_FORM_ASSUMPTIONS` id `fractional-capacity`, the reason the
    // comparison is made at the observed load rather than at 12.8.
    expect(measurement.passengersPerTrip).toBeGreaterThan(
      measurement.closedForm.roundTripTerms.passengersPerTrip - 1,
    );
    expect(measurement.passengersPerTrip).toBeLessThan(
      measurement.closedForm.roundTripTerms.passengersPerTrip + 1,
    );
    expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === 'fractional-capacity')?.bias).toBe(
      'over',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The other side of the ceiling
 * -------------------------------------------------------------------------- */

describe('below capacity, the same measurement tracks demand instead of the round trip', () => {
  /**
   * Why this test is here at all.
   *
   * The capacity comparison above says the group's ceiling is ~4.55 %POP against a textbook
   * 6.01 %, and that only means something if the *measurement* is unbiased when the group is
   * not the constraint. Offer half the closed-form capacity and throughput must equal demand
   * almost exactly; the same number that reads 24 % low at saturation reads within a percent of
   * offered here. So the shortfall at the ceiling is the system's, not the meter's.
   *
   * It is also why comparing at 83 % of capacity — as this file previously did — cannot settle
   * anything: at that load the achieved interval is set by how often people turn up, not by how
   * long a round trip takes, so agreement with `INT` is partly an artefact of the demand knob.
   */
  it('serves what is offered when the group is not the constraint', () => {
    const closedForm = analysis();
    const results = upPeakRuns(closedForm.result.percentPopulation5Min * 0.5).map((simulation) =>
      simulation.run(),
    );

    for (const result of results) {
      expect(result.status).toBe('completed');
      expect(result.summary.saturation.verdict).toBe('stable');
      expect(result.summary.awtIsValid).toBe(true);
    }

    const served = mean(results.map((result) => result.summary.handlingCapacity.personsPer5Min));
    const offered = mean(results.map((result) => result.summary.handlingCapacity.offeredPer5Min));
    expect(Math.abs(relativeError(served, offered))).toBeLessThan(0.03); // measured: +0.4 %

    // And it is nowhere near the ceiling, which is exactly why the interval and capacity
    // comparisons above are made above 1.0x rather than here.
    expect(served).toBeLessThan(
      (closedForm.result.handlingCapacity5Min * 2) / 3,
    );
    expect(mean(results.map((result) => result.summary.waiting.meanS))).toBeLessThan(
      mean(measurement.results.map((result) => result.summary.waiting.meanS)),
    );
  });
});
