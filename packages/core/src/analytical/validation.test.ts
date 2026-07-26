/**
 * **Phase 2 acceptance gate.** Does the simulator agree with the closed form, and if not, why?
 *
 * `docs/05-roadmap.md` § Phase 2: *"Midtown Office under pure up-peak produces interval and
 * handling capacity matching the closed-form Barney/CIBSE RTT calculation within a few
 * percent."* This file exists to answer that question honestly, including when the answer is
 * uncomfortable. It does not tune the simulation to the formula and it does not widen a band
 * to make a phase pass (CLAUDE.md § Working agreements).
 *
 * ## The verdict this file encodes
 *
 * **Read literally, the criterion is met on NEITHER shipped building.** At the closed form's own
 * design point Midtown Office's simulated interval is ~28 % long and its achieved handling
 * capacity ~23 % low; Garden Apartments' are ~7.5 % long and ~7.1 % low. Read as the roadmap
 * intends — *does the simulator reproduce the physical system the formula describes* — it **is**
 * met on both, because every second of those gaps is attributable, with no fitted constant
 * anywhere, to simplifications `CLOSED_FORM_ASSUMPTIONS` already enumerates as `bias: 'under'`,
 * and charging them closes the gap to under 1 % on both buildings — Midtown **0.001 %**
 * (196.815 s simulated against 196.813 s), Garden **0.69 %** (127.953 s against 127.072 s).
 *
 * Garden's figures are worth reading twice, because this file used to record them as +1.7 % /
 * −2.0 % and call the criterion passed there. It was not passed; it was *cancelled*. Defect 2
 * below made the simulation ~7 s fast while the closed form's omissions made it ~14 s slow, and
 * the two nearly annihilated. Fixing defect 2 removed the cancellation and left the real
 * divergence visible. **Agreement with the textbook expression got worse and agreement with the
 * physical system got better, for the same reason and in the same change** — which is the whole
 * argument for why the second reading is the one the roadmap means.
 *
 * The full reasoning, the replication statistics and the two defects this gate turned up are
 * in the Phase 2 validation report. What follows is the machine-checkable part of it.
 *
 * ## How the divergence is attributed, and why the attribution is not circular
 *
 * Three independent instruments, in increasing strength:
 *
 * 1. **Term-by-term.** `P` and `S` are measured directly off the run record and compared with
 *    the closed form's own `P` and `S = N(1 − ((N−1)/N)^P)`. If those disagree the simulator is
 *    not serving the trip the formula scores, and nothing downstream means anything. They
 *    agree to well under 1 % on both buildings.
 * 2. **The closed form's own model, completed.** {@link kinematicRoundTrip} Monte-Carlos
 *    *Barney's population model* — exactly `P` passengers boarding at one terminal, each
 *    drawing a destination uniformly from `N` floors, distinct destinations served in
 *    ascending order, express return — but evaluates each flight with the project's
 *    jerk-limited `travelTime` and each stop with the project's `dwellSecondsFor` instead of
 *    `d/v` and `2·P·tp`. No dispatcher, no queue, no arrival process, no second entrance. The
 *    difference between this and the textbook expression *is* the two documented omissions,
 *    measured rather than argued.
 * 3. **Knock-out.** The two simplifications are pushed *into the simulator* as data — the cars
 *    are given effectively unbounded acceleration and jerk and a base dwell of zero, through
 *    `data/buildings/*.json`'s ordinary per-car override fields, with no new code path
 *    (CLAUDE.md invariant 7) — and the simulated round trip collapses onto the textbook
 *    figure. This is the decisive test: it cannot be satisfied by a compensating error,
 *    because it changes the simulator's inputs and not the comparison.
 *
 * ## Two defects this gate found — both now fixed
 *
 * Both are recorded at the bottom of this file, and both biased results *optimistically*, which
 * is the direction CLAUDE.md § Statistical discipline warns about.
 *
 * - `metrics/summarize.ts` `DEFAULT_DEPARTURE_GAP_S = 10` was **shorter than a door reopen at
 *   the terminal** on every shipped building, so one loading was counted as two departures and
 *   the achieved interval read low. **Fixed**: the threshold is now derived from the building's
 *   door timings — see the last describe block — and `sim/simulation.ts` attaches those timings to
 *   every record it writes, so the derivation runs on the production path and not only here.
 * - `Car.passengerTransferS` was never supplied by the runner, so **every building ran at the
 *   office value of 1.2 s** — including residential Garden Apartments, whose reference data
 *   and whose own `notes` field both say 1.75 s. **Fixed** in `resolveCar`, in `resolveBuilding`,
 *   and per car in the two mixed-use building files.
 *
 * ## Note on where this file lives
 *
 * `analytical/` is deliberately free of any import of the kernel, the model, the physics or
 * the dispatcher, so that the oracle cannot share a bug with the thing it checks. That rule
 * governs the *module*; this is the validation harness, and bridging the two sides is its
 * entire job. Nothing here is exported and nothing under `analytical/` imports it.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { loadConfig } from '../config/loader.js';
import type { PassengerRecord, ReportWindow } from '../metrics/types.js';
import { achievedIntervalOf } from '../metrics/summarize.js';
import { CAR_DEFAULTS } from '../model/car/index.js';
import type { Car } from '../model/car/index.js';
import { dwellSecondsFor } from '../physics/doors/index.js';
import { travelTime } from '../physics/motion/index.js';
import { StreamSet } from '../random/index.js';
import { parseBuilding, resolveBuilding } from '../config/parse.js';
import { Simulation } from '../sim/simulation.js';
import type { SimulationResult } from '../sim/types.js';

import { CLOSED_FORM_ASSUMPTIONS, CLOSED_FORM_COMPARISON_RULE } from './types.js';
import type { UpPeakAnalysis } from './types.js';
import { analyzeUpPeak } from './upPeak.js';

/* -------------------------------------------------------------------------- *
 * Experiment design
 * -------------------------------------------------------------------------- */

/**
 * Replications per configuration.
 *
 * `docs/03-traffic-and-statistics.md` § Part 3 is explicit that ten is not enough: Peters &
 * Abbi's 4-lift up-peak had individual runs spanning 4.1–7.4 s of AWT and CIBSE's ~10 runs
 * reported a 12 % error against the converged mean. 128 is inside the doc's 50–200 budget.
 * The seeds are fixed rather than drawn, so the numbers this file asserts are reproducible
 * rather than resampled on every CI run.
 */
const REPLICATIONS = 128;
const FIRST_SEED = 100_000;
const SEEDS = Array.from({ length: REPLICATIONS }, (_, i) => FIRST_SEED + i);

/** Fewer replications for the knock-out arms: they are a direction check, not a headline. */
const KNOCKOUT_REPLICATIONS = 48;

/**
 * Offered demand as a multiple of the closed-form `%POP`.
 *
 * The closed form describes a **saturated** group: cars leaving the terminal at design load,
 * back to back. Below capacity the achieved interval is set by how often people arrive, not
 * by how long a round trip takes, and agreement with `INT` would be an artefact of the demand
 * knob rather than a statement about the simulator. Swept over 1.0–2.0× while writing this,
 * every quantity below is flat to within its own standard deviation past ~1.15×; 1.3× is
 * comfortably inside that plateau.
 */
const OVERLOAD_FACTOR = 1.3;

/**
 * The departure-clustering threshold `metrics/summarize.ts` shipped when this gate found defect 1.
 *
 * Kept as a literal rather than read from `metrics/` — the module now derives the threshold from
 * the building's door timings and its remaining constant is a *fallback* — so the measurements
 * below stay a record of what the defect cost instead of quietly re-measuring the current
 * default against itself.
 */
const LEGACY_DEPARTURE_GAP_S = 10;

/** Monte Carlo draws for {@link kinematicRoundTrip}. Standard error on RTT is then ~0.1 %. */
const MONTE_CARLO_DRAWS = 20_000;

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

/* -------------------------------------------------------------------------- *
 * Small statistics
 * -------------------------------------------------------------------------- */

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

const stdDev = (xs: readonly number[]): number => {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Signed relative divergence of a measurement from a reference, as a fraction. */
const divergence = (measured: number, reference: number): number =>
  (measured - reference) / reference;

/* -------------------------------------------------------------------------- *
 * Reproducing the closed form's operating mode in the simulator
 * -------------------------------------------------------------------------- */

/**
 * One acceptance case: a building, and the conditions that reproduce pure up-peak on it.
 *
 * Everything here is **config**. There is no branch on a building id anywhere in this file
 * that reaches into the simulator's behaviour (CLAUDE.md invariant 7); the per-case fields are
 * the demand shape and the observation length, which are properties of the experiment.
 */
interface Case {
  readonly buildingId: string;
  /**
   * Length of the peak plateau, which is also the reported window.
   *
   * Sized so each car completes several round trips inside it: the interval is estimated from
   * the gaps between departures, and a window holding six departures estimates it far more
   * coarsely than one holding thirty. It changes the sample size, not the system.
   */
  readonly peakWindowS: number;
  /**
   * Relative weight per entrance floor. The closed form loads every passenger at **one**
   * terminal; Midtown Office declares two (lobby `G` and garage `P1`), so the garage is
   * weighted to zero. Garden Apartments declares one and needs no override.
   */
  readonly entranceWeights?: Readonly<Record<string, number>> | undefined;
}

const MIDTOWN: Case = {
  buildingId: 'midtown-office',
  peakWindowS: 900,
  entranceWeights: { G: 1, P1: 0 },
};

const GARDEN: Case = {
  buildingId: 'garden-apartments',
  peakWindowS: 1800,
};

function buildingOf(id: string): ResolvedBuilding {
  const building = config.buildingsById.get(id);
  if (building === undefined) throw new Error(`missing building fixture "${id}"`);
  return building;
}

function profileOf(id: string): DispatcherProfile {
  const profile = config.dispatcherProfilesById.get(id);
  if (profile === undefined) throw new Error(`missing dispatcher fixture "${id}"`);
  return profile;
}

/**
 * One replication under the closed form's conditions, as closely as the model allows.
 *
 * | Closed-form assumption | How this reproduces it | Matched? |
 * |---|---|---|
 * | all traffic is incoming, none interfloor or outgoing | `directionalSplit: { incoming: 1, … }` | yes |
 * | every passenger boards at one main terminal | `entranceWeights` zeroes the garage | yes |
 * | all `L` cars shuttle from that terminal | `idle.parkingStrategy: 'lobby'` — a profile field, not a code path | yes |
 * | the group is the constraint, not demand | offered demand above the closed-form `%POP` | yes |
 * | every trip carries exactly `P` | Poisson batches; handled by comparing at the observed load | **no** |
 * | cars depart perfectly evenly spaced | a real dispatcher bunches; reported as the interval's CoV | **no** |
 * | destinations drawn uniformly | Midtown and Garden both have uniform floor populations | yes |
 * | travel at rated speed, no minimum dwell | physics; **cannot** be matched, and is the whole finding | **no** |
 */
function replication(caseSpec: Case, seed: number, pctPopulation5Min: number, building?: ResolvedBuilding): Simulation {
  const profile = profileOf('collective');
  return new Simulation({
    building: building ?? buildingOf(caseSpec.buildingId),
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

/** The model `Car` the runner would build for this building. Cheap: constructed, never run. */
function carOf(caseSpec: Case, building?: ResolvedBuilding): Car {
  const car = replication(caseSpec, 1, 1, building).building.cars[0];
  if (car === undefined) throw new Error('bank has no cars');
  return car;
}

/* -------------------------------------------------------------------------- *
 * Measuring the round trip off the record
 * -------------------------------------------------------------------------- */

/** One car's departure from the terminal, and what it did before coming back. */
interface RoundTrip {
  readonly departedAt: number;
  /** `P` — how many boarded on that departure. */
  readonly passengers: number;
  /** `S` — distinct destinations among them, which is how many stops it made going up. */
  readonly stops: number;
  /** Seconds until the same car loaded at the terminal again; `undefined` for the last one. */
  readonly roundTripS: number | undefined;
}

/**
 * The threshold that separates "the car reopened its doors" from "the car went away and came
 * back", derived from the building's own reference data rather than chosen.
 *
 * A reopen at the terminal costs `openS + dwell + closeS`, and the dwell is
 * `max(policy dwell, transfer seconds)` — up to 20.2 s on Midtown Office with a full load
 * boarding. The shortest possible genuine round trip is out to the lowest served floor and
 * back, twice the fixed per-stop cost plus two flights. Those two numbers bracket a wide empty
 * band on both buildings (nothing at all between 20 s and 30 s on Midtown, nothing between
 * 20 s and 30 s on Garden across 128 runs), and the midpoint sits inside it.
 *
 * **This is where a defect lived.** The shipped default was 10 s, *below* the bare reopen cost of
 * 9.8 s on Midtown and 11.5 s on Garden. `metrics/summarize.ts` now derives the same bracket this
 * function computes (`departureGapBracket`), so the two agree by construction — asserted in the
 * last describe block.
 */
function departureGapFor(car: Car, analysis: UpPeakAnalysis, building: ResolvedBuilding): {
  readonly maxReopenS: number;
  readonly minRoundTripS: number;
  readonly gapS: number;
} {
  const { passengersPerTrip, passengerTransferS } = analysis.roundTripTerms;
  const maxReopenS =
    car.doorConfig.openS +
    Math.max(car.doorConfig.dwellHallCallS, car.doorConfig.dwellCarCallS, passengersPerTrip * passengerTransferS) +
    car.doorConfig.closeS;

  const lowestId = analysis.upperFloorIds[0];
  if (lowestId === undefined) throw new Error('no served floors above the terminal');
  const lowestHeightM = building.floorsById.get(lowestId)?.heightM;
  if (lowestHeightM === undefined) throw new Error(`floor "${lowestId}" has no height`);

  const legS =
    car.doorConfig.closeS +
    car.spec.motorStartDelayS +
    travelTime(lowestHeightM - analysis.terminalHeightM, car.constraints) +
    car.spec.levelingSettleS +
    car.doorConfig.openS;
  const minRoundTripS = 2 * legS + car.doorConfig.dwellCarCallS + car.doorConfig.dwellHallCallS;

  return { maxReopenS, minRoundTripS, gapS: (maxReopenS + minRoundTripS) / 2 };
}

/**
 * Every terminal departure in the record, per car, in time order.
 *
 * Reads only boarding timestamps, origin floors, destination floors and car ids out of the
 * persisted record — the same material a run replayed from its seed would offer — so it is
 * independent of the run loop's internals.
 */
function roundTripsOf(
  records: readonly PassengerRecord[],
  terminalFloorId: string,
  departureGapS: number,
): readonly RoundTrip[] {
  const byCar = new Map<string, PassengerRecord[]>();
  for (const leg of records) {
    if (leg.originFloorId !== terminalFloorId) continue;
    if (leg.boardedAt === undefined || leg.carId === undefined) continue;
    const boardings = byCar.get(leg.carId);
    if (boardings === undefined) byCar.set(leg.carId, [leg]);
    else boardings.push(leg);
  }

  const trips: RoundTrip[] = [];
  for (const [, boardings] of byCar) {
    boardings.sort((a, b) => (a.boardedAt ?? 0) - (b.boardedAt ?? 0));
    const clusters: { firstAt: number; lastAt: number; passengers: number; destinations: Set<string> }[] = [];
    for (const leg of boardings) {
      const at = leg.boardedAt ?? 0;
      const last = clusters.at(-1);
      if (last !== undefined && at - last.lastAt < departureGapS) {
        last.lastAt = at;
        last.passengers += 1;
        last.destinations.add(leg.destinationFloorId);
      } else {
        clusters.push({ firstAt: at, lastAt: at, passengers: 1, destinations: new Set([leg.destinationFloorId]) });
      }
    }
    for (const [index, cluster] of clusters.entries()) {
      const next = clusters[index + 1];
      trips.push({
        departedAt: cluster.firstAt,
        passengers: cluster.passengers,
        stops: cluster.destinations.size,
        roundTripS: next === undefined ? undefined : next.firstAt - cluster.firstAt,
      });
    }
  }
  return trips;
}

const inWindow = (trip: RoundTrip, window: ReportWindow): boolean =>
  trip.roundTripS !== undefined && trip.departedAt >= window.startS && trip.departedAt <= window.endS;

/* -------------------------------------------------------------------------- *
 * The closed form's own model, evaluated with the project's real physics
 * -------------------------------------------------------------------------- */

/** What one round trip costs when the closed form's two omissions are charged. */
interface KinematicRoundTrip {
  /** Mean `RTT`, seconds. */
  readonly roundTripS: number;
  /** Mean distinct destinations. Must reproduce the closed form's `S`, or the model differs. */
  readonly stops: number;
  /** Mean seconds in flight, up and back. The closed form's `2·(H·tv + tx)` counterpart. */
  readonly flightS: number;
  /** Mean seconds with doors dwelling. The closed form's `2·P·tp` counterpart. */
  readonly dwellS: number;
  /** Mean `(S+1)·(open + close + start + level)`. The closed form's `(S+1)·ts` counterpart. */
  readonly fixedS: number;
}

/**
 * Monte Carlo over the closed form's **own** population model, with the project's kinematics
 * and door policy substituted for `d/v` and `2·P·tp`.
 *
 * `P` passengers board at the terminal; each draws a destination uniformly from `N` floors;
 * the car serves the distinct destinations in ascending order and returns express. That is
 * Barney's model exactly — the same model `S = N(1 − ((N−1)/N)^P)` and `H = N − Σ(i/N)^P` are
 * derived from, which is why {@link KinematicRoundTrip.stops} must come out equal to `S`.
 *
 * The cycle is measured terminal-doors-open to terminal-doors-open, which is what
 * {@link roundTripsOf} measures in the simulator.
 *
 * Draws come from a named stream on a seeded {@link StreamSet} (CLAUDE.md invariant 2); there
 * is no wall clock (invariant 3) and nothing is mutated.
 */
function kinematicRoundTrip(options: {
  readonly car: Car;
  /** Destination floor heights, ascending. Its length is `N`. */
  readonly heightsM: readonly number[];
  readonly terminalHeightM: number;
  /** Passengers per trip. Integral: the Monte Carlo boards whole people. */
  readonly passengers: number;
  /** `tp`, seconds per passenger per direction. */
  readonly passengerTransferS: number;
  readonly draws: number;
  readonly seed: number;
}): KinematicRoundTrip {
  const { car, heightsM, terminalHeightM, passengers, passengerTransferS, draws, seed } = options;
  const floors = heightsM.length;
  const rng = new StreamSet(seed).stream('destinations');
  const fixedPerStopS =
    car.doorConfig.closeS + car.spec.motorStartDelayS + car.spec.levelingSettleS + car.doorConfig.openS;

  let totalRoundTrip = 0;
  let totalStops = 0;
  let totalFlight = 0;
  let totalDwell = 0;
  let totalFixed = 0;

  for (let draw = 0; draw < draws; draw += 1) {
    const alightingByFloor = new Map<number, number>();
    for (let p = 0; p < passengers; p += 1) {
      const index = rng.nextInt(0, floors);
      alightingByFloor.set(index, (alightingByFloor.get(index) ?? 0) + 1);
    }
    const destinations = [...alightingByFloor.keys()].sort((a, b) => a - b);

    // The terminal stop: a hall call, everybody boards.
    let dwellS = dwellSecondsFor(car.doorConfig, {
      carCall: false,
      hallCall: true,
      hallQueueLength: passengers,
      transferSeconds: passengers * passengerTransferS,
    });
    let flightS = 0;
    let fromM = terminalHeightM;
    for (const index of destinations) {
      const toM = heightsM[index];
      if (toM === undefined) throw new Error('destination index out of range');
      flightS += travelTime(toM - fromM, car.constraints);
      fromM = toM;
      dwellS += dwellSecondsFor(car.doorConfig, {
        carCall: true,
        hallCall: false,
        hallQueueLength: 0,
        transferSeconds: (alightingByFloor.get(index) ?? 0) * passengerTransferS,
      });
    }
    // Express back down to the terminal.
    flightS += travelTime(Math.abs(fromM - terminalHeightM), car.constraints);

    const fixedS = (destinations.length + 1) * fixedPerStopS;
    totalRoundTrip += dwellS + flightS + fixedS;
    totalStops += destinations.length;
    totalFlight += flightS;
    totalDwell += dwellS;
    totalFixed += fixedS;
  }

  return {
    roundTripS: totalRoundTrip / draws,
    stops: totalStops / draws,
    flightS: totalFlight / draws,
    dwellS: totalDwell / draws,
    fixedS: totalFixed / draws,
  };
}

/* -------------------------------------------------------------------------- *
 * One measured case
 * -------------------------------------------------------------------------- */

interface Measurement {
  readonly analysis: UpPeakAnalysis;
  readonly car: Car;
  readonly results: readonly SimulationResult[];
  readonly gap: { readonly maxReopenS: number; readonly minRoundTripS: number; readonly gapS: number };

  /** Mean and standard deviation **over replications**, not over trips. */
  readonly intervalS: { readonly mean: number; readonly sd: number };
  /** The same interval reconstructed at the 10 s threshold that shipped before defect 1 was fixed. */
  readonly intervalAtLegacyGapS: { readonly mean: number; readonly sd: number };
  readonly intervalCoV: { readonly mean: number; readonly sd: number };
  readonly handlingCapacityPctPop: { readonly mean: number; readonly sd: number };
  readonly roundTripAllS: { readonly mean: number; readonly sd: number };
  readonly roundTripFullS: { readonly mean: number; readonly sd: number };
  readonly passengersAll: { readonly mean: number; readonly sd: number };
  readonly passengersFull: { readonly mean: number; readonly sd: number };
  readonly stopsFull: { readonly mean: number; readonly sd: number };
  readonly tripCountAll: number;
  readonly tripCountFull: number;

  /** The closed form re-evaluated at the load the simulator actually carried. */
  readonly matched: UpPeakAnalysis;
  /** The same model with the two documented omissions charged. */
  readonly corrected: KinematicRoundTrip;
  readonly correctedRoundTripS: number;
}

function summarise(xs: readonly number[]): { mean: number; sd: number } {
  return { mean: mean(xs), sd: stdDev(xs) };
}

function measure(caseSpec: Case, replications: number = REPLICATIONS): Measurement {
  const building = buildingOf(caseSpec.buildingId);
  const analysis = analyzeUpPeak(building, config.elevatorSpecs, { bankId: 'main' });
  const car = carOf(caseSpec);
  const gap = departureGapFor(car, analysis, building);

  const results = SEEDS.slice(0, replications).map((seed) =>
    replication(caseSpec, seed, analysis.result.percentPopulation5Min * OVERLOAD_FACTOR).run(),
  );

  const intervals: number[] = [];
  const intervalsLegacy: number[] = [];
  const covs: number[] = [];
  const perRunRoundTripAll: number[] = [];
  const perRunRoundTripFull: number[] = [];
  const perRunPassengersAll: number[] = [];
  const perRunPassengersFull: number[] = [];
  const perRunStopsFull: number[] = [];
  let tripCountAll = 0;
  let tripCountFull = 0;

  // `CLOSED_FORM_COMPARISON_RULE.matchedLoadGuidance`: the largest integer load the simulator
  // can board. A trip that left below it was not full, and a part-full trip is a legitimately
  // shorter round trip the closed form does not describe.
  const designPersons = Math.floor(analysis.designLoadFactor * analysis.ratedCapacityPersons);

  for (const result of results) {
    const window = result.reportWindow;
    intervals.push(
      achievedIntervalOf(result.record.passengers, { window, departureGapS: gap.gapS }).meanS,
    );
    // Explicitly 10 s, not `result.summary.achievedInterval.meanS`: since defect 1 was fixed the
    // summary derives this threshold from the doors, so reading it off the summary would compare
    // the derived gap against itself and the measurement below would silently become 0 %.
    intervalsLegacy.push(
      achievedIntervalOf(result.record.passengers, {
        window,
        departureGapS: LEGACY_DEPARTURE_GAP_S,
      }).meanS,
    );
    covs.push(
      achievedIntervalOf(result.record.passengers, { window, departureGapS: gap.gapS })
        .coefficientOfVariation,
    );

    const all = roundTripsOf(result.record.passengers, analysis.terminalFloorId, gap.gapS).filter(
      (trip) => inWindow(trip, window),
    );
    const full = all.filter((trip) => trip.passengers >= designPersons);
    tripCountAll += all.length;
    tripCountFull += full.length;
    if (all.length > 0) {
      perRunRoundTripAll.push(mean(all.map((trip) => trip.roundTripS ?? 0)));
      perRunPassengersAll.push(mean(all.map((trip) => trip.passengers)));
    }
    if (full.length > 0) {
      perRunRoundTripFull.push(mean(full.map((trip) => trip.roundTripS ?? 0)));
      perRunPassengersFull.push(mean(full.map((trip) => trip.passengers)));
      perRunStopsFull.push(mean(full.map((trip) => trip.stops)));
    }
  }

  const passengersFull = summarise(perRunPassengersFull);
  const matched = analyzeUpPeak(building, config.elevatorSpecs, {
    bankId: 'main',
    passengersPerTrip: passengersFull.mean,
  });

  // The Monte Carlo boards whole people, so it is run at the two integers bracketing the
  // observed mean load and interpolated. RTT is very nearly linear in P over one person.
  const lower = Math.floor(passengersFull.mean);
  const heightsM = analysis.upperFloorIds.map((id) => {
    const heightM = building.floorsById.get(id)?.heightM;
    if (heightM === undefined) throw new Error(`floor "${id}" has no height`);
    return heightM;
  });
  const shared = {
    car,
    heightsM,
    terminalHeightM: analysis.terminalHeightM,
    // The transfer time the SIMULATOR uses, which is not always the one the closed form uses.
    // See the defect recorded at the bottom of this file: on a residential building the runner
    // charges the office value. Comparing at anything other than the value actually in force
    // would be comparing two different systems.
    passengerTransferS: car.passengerTransferS,
    draws: MONTE_CARLO_DRAWS,
    seed: 4_242,
  } as const;
  const low = kinematicRoundTrip({ ...shared, passengers: lower });
  const high = kinematicRoundTrip({ ...shared, passengers: lower + 1 });
  const w = passengersFull.mean - lower;
  const lerp = (key: keyof KinematicRoundTrip): number => low[key] * (1 - w) + high[key] * w;
  const corrected: KinematicRoundTrip = {
    roundTripS: lerp('roundTripS'),
    stops: lerp('stops'),
    flightS: lerp('flightS'),
    dwellS: lerp('dwellS'),
    fixedS: lerp('fixedS'),
  };

  return {
    analysis,
    car,
    results,
    gap,
    intervalS: summarise(intervals),
    intervalAtLegacyGapS: summarise(intervalsLegacy),
    intervalCoV: summarise(covs),
    handlingCapacityPctPop: summarise(
      results.map((r) => r.summary.handlingCapacity.pctPopulationPer5Min ?? Number.NaN),
    ),
    roundTripAllS: summarise(perRunRoundTripAll),
    roundTripFullS: summarise(perRunRoundTripFull),
    passengersAll: summarise(perRunPassengersAll),
    passengersFull,
    stopsFull: summarise(perRunStopsFull),
    tripCountAll,
    tripCountFull,
    matched,
    corrected,
    correctedRoundTripS: corrected.roundTripS,
  };
}

/* -------------------------------------------------------------------------- *
 * Knock-out: the closed form's simplifications, imposed on the simulator
 * -------------------------------------------------------------------------- */

/**
 * The building rebuilt with per-car overrides from `data/buildings/*.json`'s own schema.
 *
 * Everything goes through `parseBuilding`/`resolveBuilding`, so this exercises no code path the
 * simulator does not already have and introduces no `if (building.id === …)` (invariant 7).
 */
function withCarOverrides(
  source: ResolvedBuilding,
  overrides: Readonly<Record<string, number>>,
): ResolvedBuilding {
  const authored = {
    id: source.id,
    name: source.name,
    type: source.type,
    trafficProfile: source.trafficProfile,
    floors: source.floors.map((floor) => ({ ...floor })),
    totalPopulation: source.totalPopulation,
    banks: source.banks.map((bank) => ({
      id: bank.id,
      servesFloors: [...bank.servesFloors],
      cars: bank.cars.map((car) => ({
        id: car.id,
        spec: car.spec,
        ratedSpeedMps: car.ratedSpeedMps,
        ratedLoadLb: car.ratedLoadLb,
        doorType: car.doorType,
        ...overrides,
      })),
    })),
    accessZones: [],
  };
  return resolveBuilding(parseBuilding(authored, `${source.id}.knockout.json`), config.elevatorSpecs, {
    file: `${source.id}.knockout.json`,
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((p) => p.id)),
  });
}

/**
 * `constant-transit-speed` + `stop-time-excludes-acceleration`: a car that reaches rated speed
 * instantly. `positive` in the config schema forbids literal infinity, so these are simply
 * enormous — 1e5 m/s² covers 3.8 m in 8.7 ms of acceleration, five orders of magnitude below
 * the second the closed form's `tv` resolves to.
 */
const NO_ACCELERATION_LIMIT = { acceleration: 1e5, jerk: 1e6 } as const;

/** `no-minimum-dwell`: doors close the instant the last passenger has transferred. */
const NO_MINIMUM_DWELL = { dwellCarCallS: 1e-6, dwellHallCallS: 1e-6 } as const;

interface KnockoutResult {
  readonly closedFormRoundTripS: number;
  readonly simulatedRoundTripS: number;
  readonly simulatedRoundTripSd: number;
  readonly closedFormIntervalS: number;
  readonly simulatedIntervalS: number;
  readonly closedFormPctPop: number;
  readonly simulatedPctPop: number;
  readonly passengers: number;
}

function knockout(caseSpec: Case, overrides: Readonly<Record<string, number>>): KnockoutResult {
  const building = withCarOverrides(buildingOf(caseSpec.buildingId), overrides);
  const analysis = analyzeUpPeak(building, config.elevatorSpecs, { bankId: 'main' });
  const car = carOf(caseSpec, building);
  const gap = departureGapFor(car, analysis, building);
  const designPersons = Math.floor(analysis.designLoadFactor * analysis.ratedCapacityPersons);

  const results = SEEDS.slice(0, KNOCKOUT_REPLICATIONS).map((seed) =>
    replication(caseSpec, seed, analysis.result.percentPopulation5Min * OVERLOAD_FACTOR, building).run(),
  );

  const roundTrips: number[] = [];
  const passengers: number[] = [];
  const intervals: number[] = [];
  for (const result of results) {
    const window = result.reportWindow;
    intervals.push(
      achievedIntervalOf(result.record.passengers, { window, departureGapS: gap.gapS }).meanS,
    );
    const full = roundTripsOf(result.record.passengers, analysis.terminalFloorId, gap.gapS).filter(
      (trip) => inWindow(trip, window) && trip.passengers >= designPersons,
    );
    if (full.length > 0) {
      roundTrips.push(mean(full.map((trip) => trip.roundTripS ?? 0)));
      passengers.push(mean(full.map((trip) => trip.passengers)));
    }
  }

  const matched = analyzeUpPeak(building, config.elevatorSpecs, {
    bankId: 'main',
    passengersPerTrip: mean(passengers),
  });
  return {
    closedFormRoundTripS: matched.result.roundTripTimeS,
    simulatedRoundTripS: mean(roundTrips),
    simulatedRoundTripSd: stdDev(roundTrips),
    closedFormIntervalS: analysis.result.intervalS,
    simulatedIntervalS: mean(intervals),
    closedFormPctPop: analysis.result.percentPopulation5Min,
    simulatedPctPop: mean(
      results.map((r) => r.summary.handlingCapacity.pctPopulationPer5Min ?? Number.NaN),
    ),
    passengers: mean(passengers),
  };
}

/* ========================================================================== *
 * Case 1 — Midtown Office. The building the acceptance criterion names.
 * ========================================================================== */

describe('Midtown Office, pure up-peak, 4 cars', () => {
  let m: Measurement;

  beforeAll(() => {
    m = measure(MIDTOWN);
  }, 120_000);

  it('reproduces the closed form the roadmap points at, term by term', () => {
    // Every intermediate, pinned against a hand evaluation of the formulas in
    // docs/03-traffic-and-statistics.md Part 2. An oracle whose own arithmetic drifts is worse
    // than no oracle, so these are exact to six figures rather than approximate.
    const t = m.analysis.roundTripTerms;
    expect(t.floorsAboveTerminal).toBe(19); // floors 2..20; the garage and the lobby are not destinations
    expect(m.analysis.interfloorDistanceM).toBeCloseTo(3.8, 9); // (73.4 − 5.0) / 18
    expect(m.analysis.ratedSpeedMps).toBeCloseTo(2.5, 9);
    expect(t.singleFloorTransitS).toBeCloseTo(1.52, 9); // tv = df / v
    expect(t.expressJumpS).toBeCloseTo(0.48, 9); // (5.0 − 3.8 − 0.0) / 2.5
    expect(t.stopTimeLossS).toBeCloseTo(6.0, 9); // 1.8 open + 3.0 close + 0.5 start + 0.7 level
    expect(t.passengerTransferS).toBeCloseTo(1.2, 9); // office
    expect(t.passengersPerTrip).toBeCloseTo(12.8, 9); // 0.8 × 16, deliberately not rounded
    expect(t.carsInGroup).toBe(4);
    expect(t.population).toBe(1710);

    expect(m.analysis.result.expectedStops).toBeCloseTo(9.489670, 5); // S
    expect(m.analysis.result.highestReversalFloor).toBeCloseTo(18.067376, 5); // H
    expect(m.analysis.result.travelTimeS).toBeCloseTo(55.884825, 4); // 2(H·tv + tx)
    expect(m.analysis.result.stopTimeS).toBeCloseTo(62.938022, 4); // (S+1)·ts
    expect(m.analysis.result.transferTimeS).toBeCloseTo(30.72, 6); // 2·P·tp
    expect(m.analysis.result.roundTripTimeS).toBeCloseTo(149.542846, 4); // RTT
    expect(m.analysis.result.intervalS).toBeCloseTo(37.385712, 4); // INT = RTT/L
    expect(m.analysis.result.handlingCapacity5Min).toBeCloseTo(102.713038, 4); // 300·P·L/RTT
    expect(m.analysis.result.percentPopulation5Min).toBeCloseTo(6.006610, 5); // %POP

    // The two ways this building strays from the model, raised by the oracle itself.
    expect(m.analysis.warnings.map((w) => w.code).sort()).toEqual(['expressZone', 'multipleEntrances']);
  });

  it('measures 128 replications that lost nobody', () => {
    // Every statistic below is a mean over these. A run that timed out, or whose books did not
    // balance, would make the agreement further down an accident.
    expect(m.results).toHaveLength(REPLICATIONS);
    for (const result of m.results) {
      expect(result.status).toBe('completed');
      expect(result.conservation.balanced).toBe(true);
      expect(result.conservation.delivered).toBe(result.conservation.generated);
    }
    // Sample size: the interval is estimated from ~18 gaps per run, the round trip from ~18
    // trips per run, over 128 runs.
    expect(m.tripCountAll).toBeGreaterThan(2_000);
    expect(m.tripCountFull / m.tripCountAll).toBeGreaterThan(0.9);

    // Both sides quote %POP against the same U. If that ever stops being true the capacity
    // comparison is comparing two different fractions.
    expect(m.results[0]?.record.population).toBe(m.analysis.roundTripTerms.population);
  });

  it('carries the load and makes the stops the closed form prices, which is the precondition', () => {
    // P. The load cell is mass-based (0.8 × 1150 kg against a N(75, 15) mass distribution), so
    // the simulator is not obliged to land on 0.8 × 16 persons — it does, to within 0.5 %,
    // which is what makes the rest of the comparison a statement about time rather than load.
    // Measured: 12.84 against 12.80.
    expect(Math.abs(divergence(m.passengersFull.mean, m.analysis.roundTripTerms.passengersPerTrip)))
      .toBeLessThan(0.02);

    // S. The whole combinatorial content of the closed form: P passengers drawing from N
    // floors. Measured directly as distinct destinations among the people who boarded
    // together — 9.50 against 9.51. Agreement here means the simulator is serving the trip the
    // formula scores, before any question of how long each part of it takes.
    expect(Math.abs(divergence(m.stopsFull.mean, m.matched.result.expectedStops))).toBeLessThan(0.03);
  });

  it('does NOT match the textbook closed form within a few percent — it is ~25 % out', () => {
    // The honest headline. Read literally, docs/05-roadmap.md's Phase 2 criterion fails on this
    // building, and by a wide margin. It is recorded as an assertion rather than a footnote so
    // that nobody can quote the reconciled figures below without meeting this one first.
    const intervalError = divergence(m.intervalS.mean, m.analysis.result.intervalS);
    const capacityError = divergence(
      m.handlingCapacityPctPop.mean,
      m.analysis.result.percentPopulation5Min,
    );
    // Measured: INT 47.8 s against 37.4 s (+27.7 %); HC 4.55 %POP against 6.01 %POP (−24.2 %).
    expect(intervalError).toBeGreaterThan(0.15);
    expect(capacityError).toBeLessThan(-0.15);

    // And the sign is the one CLOSED_FORM_COMPARISON_RULE predicts at matched load: slower, and
    // therefore lower capacity. A simulator reading *faster* than the closed form would be the
    // alarming case, because everything the closed form omits only ever adds seconds.
    expect(m.roundTripFullS.mean).toBeGreaterThan(m.matched.result.roundTripTimeS);
  });

  it('is out by exactly the two omissions the closed form documents, and nothing else', () => {
    // The Monte Carlo runs Barney's own population model with the project's real physics. That
    // it reproduces S confirms it is the same model and not a different one that happens to
    // give a similar number.
    expect(Math.abs(divergence(m.corrected.stops, m.matched.result.expectedStops))).toBeLessThan(0.01);

    // The two omissions, measured. Both are `bias: 'under'` in CLOSED_FORM_ASSUMPTIONS, so both
    // can only add seconds — the closed form cannot be rescued by one offsetting the other.
    const flightExcessS = m.corrected.flightS - m.matched.result.travelTimeS;
    const dwellExcessS = m.corrected.dwellS - m.matched.result.transferTimeS;
    expect(flightExcessS).toBeGreaterThan(25); // measured +33.6 s: jerk-limited flights vs 2(H·tv + tx)
    expect(dwellExcessS).toBeGreaterThan(8); // measured +13.5 s: max(policy dwell, transfer) vs 2·P·tp
    // The stop term is untouched — both sides charge (S+1)·(open + close + start + level).
    expect(Math.abs(divergence(m.corrected.fixedS, m.matched.result.stopTimeS))).toBeLessThan(0.01);

    for (const id of ['constant-transit-speed', 'stop-time-excludes-acceleration', 'no-minimum-dwell']) {
      expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === id)?.bias).toBe('under');
      expect(CLOSED_FORM_COMPARISON_RULE.oneSidedUnderIds).toContain(id);
    }

    // The residual. Measured: 196.815 s simulated against 196.813 s corrected — **0.001 %**, on a
    // 197 s round trip. The band is 4 %, which is "a few percent" as the roadmap words it, and it
    // is not slack for a bug: the corrections are computed from `travelTime` and `dwellSecondsFor`
    // over the reference data, with no free parameter to absorb one. Garden's counterpart is
    // 0.69 % — see 'is out by the same two omissions' in the next describe block.
    const residual = divergence(m.roundTripFullS.mean, m.correctedRoundTripS);
    expect(Math.abs(residual)).toBeLessThan(0.04);
  });

  it('achieves the interval and the capacity that corrected round trip implies', () => {
    // INT = RTT/L, and the population of trips the achieved interval is measured over is *all*
    // in-window departures, so it is compared against the round trip of all of them. On this
    // building 97 % of trips are full, so the two barely differ.
    const impliedIntervalS = m.roundTripAllS.mean / m.analysis.roundTripTerms.carsInGroup;
    // Measured: 47.8 s against 49.1 s, −2.8 %. The deficit is the estimator's, not the loop's:
    // a mean of the gaps *inside* a window is (last − first)/(n − 1), which misses the part-gaps
    // at both edges and so reads low by roughly 1/n — ~5 % on 18 departures.
    expect(Math.abs(divergence(m.intervalS.mean, impliedIntervalS))).toBeLessThan(0.06);

    // HC = 300·P·L/RTT. This is the same identity the closed form states, evaluated on what the
    // cars actually carried and how long they actually took, so agreement means no work is
    // appearing or disappearing between the round trip and the throughput the metrics layer
    // reports. Measured: 4.55 %POP against 4.57 %POP, −0.4 %.
    const impliedPctPop =
      ((300 * m.passengersAll.mean * m.analysis.roundTripTerms.carsInGroup) /
        m.roundTripAllS.mean /
        m.analysis.roundTripTerms.population) *
      100;
    expect(Math.abs(divergence(m.handlingCapacityPctPop.mean, impliedPctPop))).toBeLessThan(0.04);

    // A simulator reporting *more* throughput than its own round trip allows is not an
    // optimistic dispatcher; it is a simulator that has stopped charging for something.
    expect(m.handlingCapacityPctPop.mean).toBeLessThan(m.analysis.result.percentPopulation5Min);
  });

  it('bunches, which the closed form has no way to express', () => {
    // `no-dispatcher`, bias `none`: the closed form assumes departures exactly INT apart and
    // therefore has no variance at all. A matching mean interval says nothing about spacing,
    // and spacing is what a waiting passenger experiences. Measured CoV ≈ 0.73 — a long way
    // from the 0 the formula assumes, and a separate finding from the mean.
    expect(m.intervalCoV.mean).toBeGreaterThan(0.3);
    expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === 'no-dispatcher')?.bias).toBe('none');
  });

  it('collapses onto the textbook figure when the two simplifications are imposed on it', () => {
    // The decisive test. Everything above reconciles the *comparison*; this changes the
    // simulator's inputs — through ordinary per-car config fields, no new code — so that the
    // system it runs is the system the closed form describes. If the reconciliation above were
    // a coincidence, this would not land.
    const both = knockout(MIDTOWN, { ...NO_ACCELERATION_LIMIT, ...NO_MINIMUM_DWELL });

    // Measured: 149.3 s simulated against 149.8 s closed form, −0.4 %.
    expect(Math.abs(divergence(both.simulatedRoundTripS, both.closedFormRoundTripS))).toBeLessThan(0.04);
    // Measured: 6.03 %POP against 6.01 %POP, +0.3 %.
    expect(Math.abs(divergence(both.simulatedPctPop, both.closedFormPctPop))).toBeLessThan(0.05);
    // Measured: 36.0 s against 37.4 s, −3.6 % — the same estimator edge bias as above.
    expect(Math.abs(divergence(both.simulatedIntervalS, both.closedFormIntervalS))).toBeLessThan(0.08);
  }, 120_000);

  it('attributes the divergence to each simplification separately, and they add up', () => {
    // Removing one at a time. Neither alone accounts for the gap; together they do, and the
    // two single-arm excesses sum to the double-arm excess to within the noise, which is what
    // "independent contributions" means quantitatively.
    const noAcceleration = knockout(MIDTOWN, NO_ACCELERATION_LIMIT);
    const noDwell = knockout(MIDTOWN, NO_MINIMUM_DWELL);

    const excessNoAcceleration = divergence(
      noAcceleration.simulatedRoundTripS,
      noAcceleration.closedFormRoundTripS,
    );
    const excessNoDwell = divergence(noDwell.simulatedRoundTripS, noDwell.closedFormRoundTripS);

    // Measured: with acceleration removed the residual dwell excess is +8.8 %; with the minimum
    // dwell removed the residual acceleration excess is +22.4 %. Sum 31.2 %, against the
    // combined +31.6 % measured with neither removed.
    expect(excessNoAcceleration).toBeGreaterThan(0.03);
    expect(excessNoDwell).toBeGreaterThan(0.15);
    expect(excessNoDwell).toBeGreaterThan(excessNoAcceleration); // acceleration is the bigger term

    const combined = divergence(m.roundTripFullS.mean, m.matched.result.roundTripTimeS);
    expect(Math.abs(excessNoAcceleration + excessNoDwell - combined)).toBeLessThan(0.06);
  }, 180_000);
});

/* ========================================================================== *
 * Case 2 — Garden Apartments. Two hydraulic cars, six floors.
 * ========================================================================== */

describe('Garden Apartments, pure up-peak, 2 hydraulic cars', () => {
  let m: Measurement;
  let midtown: Measurement;

  beforeAll(() => {
    m = measure(GARDEN);
    midtown = measure(MIDTOWN);
  }, 180_000);

  it('reproduces the closed form term by term', () => {
    const t = m.analysis.roundTripTerms;
    expect(t.floorsAboveTerminal).toBe(5);
    expect(m.analysis.interfloorDistanceM).toBeCloseTo(3.0, 9);
    expect(m.analysis.ratedSpeedMps).toBeCloseTo(0.63, 9);
    expect(t.singleFloorTransitS).toBeCloseTo(3 / 0.63, 9); // tv = 4.7619
    expect(t.expressJumpS).toBeCloseTo(0, 9); // the zone starts one df above the terminal
    expect(t.stopTimeLossS).toBeCloseTo(7.7, 9); // 2.5 open + 4.0 close + 0.5 start + 0.7 level
    expect(t.passengerTransferS).toBeCloseTo(1.75, 9); // residential — see the defect below
    expect(t.passengersPerTrip).toBeCloseTo(8.0, 9); // 0.8 × 10
    expect(t.carsInGroup).toBe(2);
    expect(t.population).toBe(120);

    expect(m.analysis.result.expectedStops).toBeCloseTo(4.161139, 5);
    expect(m.analysis.result.highestReversalFloor).toBeCloseTo(4.814774, 5);
    expect(m.analysis.result.roundTripTimeS).toBeCloseTo(113.595760, 4);
    expect(m.analysis.result.intervalS).toBeCloseTo(56.797880, 4);
    expect(m.analysis.result.handlingCapacity5Min).toBeCloseTo(42.255098, 4);
    expect(m.analysis.result.percentPopulation5Min).toBeCloseTo(35.212582, 5);

    // P ≥ N: with eight passengers over five floors the car stops nearly everywhere and S
    // saturates towards N, so RTT is insensitive to load here in a way it is not on Midtown.
    expect(m.analysis.warnings.map((w) => w.code)).toContain('saturatedStops');
  });

  it('measures 128 replications that lost nobody', () => {
    expect(m.results).toHaveLength(REPLICATIONS);
    for (const result of m.results) {
      expect(result.status).toBe('completed');
      expect(result.conservation.balanced).toBe(true);
    }
    expect(m.tripCountAll).toBeGreaterThan(3_000);
  });

  it('agrees with the textbook closed form BETTER than Midtown Office, not worse', () => {
    // The prediction going in was the opposite — short travel distances ought to make the
    // constant-speed simplification worse. On these two buildings it does not, and the reason
    // is measured in the next test: what matters is the interfloor distance *relative to the
    // distance the car needs to reach rated speed*, v²/a, and a 0.63 m/s hydraulic needs
    // 0.66 m while a 2.5 m/s geared traction needs 6.25 m.
    //
    // Measured, at the 1.75 s residential transfer time now in force (128 replications):
    //   Garden  INT +7.5 %, %POP −7.1 %, RTT +12.6 %.
    //   Midtown INT +27.5 %, %POP −23.2 %, RTT +31.6 %.
    // The ordering survives — Garden is still better than half of Midtown's divergence — but by
    // a much smaller margin than the +6.2 % this test recorded while the transfer-time defect
    // was live. See the block below for why that number was flattering.
    const gardenRtt = Math.abs(divergence(m.roundTripFullS.mean, m.analysis.result.roundTripTimeS));
    const midtownRtt = Math.abs(
      divergence(midtown.roundTripFullS.mean, midtown.analysis.result.roundTripTimeS),
    );
    expect(gardenRtt).toBeLessThan(midtownRtt / 2);
  });

  it('does NOT meet "within a few percent" either, once the transfer-time defect is removed', () => {
    // **This is a recorded residual, not a passing criterion.** It used to be the latter, and the
    // reason it looked like one is worth keeping written down.
    //
    // While the runner charged every building the office 1.2 s, Garden's simulated round trip was
    // 120.6 s against a 113.6 s closed form evaluated at the residential 1.75 s. The two errors
    // pointed in opposite directions: the missing 0.55 s per passenger made the simulation ~7 s
    // *short*, and the closed form's jerk-limited-flight and minimum-dwell omissions
    // (`constant-transit-speed`, `no-minimum-dwell`, both `bias: 'under'`) made it ~14 s short of
    // the physical truth. They very nearly cancelled, and Garden came out at INT +1.7 % / %POP
    // −2.0 % — inside "a few percent" by coincidence, on a building whose transfer time was wrong.
    //
    // With the defect fixed the cancellation is gone and the real divergence is visible:
    //
    // |  | before (tp = 1.2 s, buggy) | after (tp = 1.75 s, correct) |
    // |---|---|---|
    // | simulated RTT | 120.6 s | **128.0 s** |
    // | INT vs closed form | +1.7 % | **+7.5 %** |
    // | %POP vs closed form | −2.0 % | **−7.1 %** |
    //
    // So **neither** shipped building meets the roadmap's Phase 2 criterion read literally, and
    // Garden no longer offers the escape hatch this file previously claimed for it. What *did*
    // improve is the measurement that actually tests the simulator: against the closed form's own
    // model evaluated with real physics, the residual fell from +0.84 % to +0.69 % — asserted in
    // 'is out by the same two omissions' below. That is the honest reading: agreement with the
    // *textbook expression* got worse, agreement with the *physical system it describes* got
    // better, and both moved for the same reason.
    //
    // The bound here is 8 %, sitting just above the measured 7.5 %, so a regression that made this
    // worse still fails. Do not raise it further to accommodate a change: 7.5 % is attributable,
    // term by term, to assumptions already enumerated in `CLOSED_FORM_ASSUMPTIONS`, and anything
    // beyond it is not.
    const intervalError = divergence(m.intervalS.mean, m.analysis.result.intervalS);
    const capacityError = divergence(
      m.handlingCapacityPctPop.mean,
      m.analysis.result.percentPopulation5Min,
    );

    // Signs first: they are what makes this a documented divergence rather than noise. A longer
    // round trip both stretches the interval and lowers the achieved capacity.
    expect(intervalError).toBeGreaterThan(0.05);
    expect(intervalError).toBeLessThan(0.08);
    expect(capacityError).toBeLessThan(-0.05);
    expect(capacityError).toBeGreaterThan(-0.08);

    // And the two are the same finding seen twice: INT and %POP are algebraically linked through
    // RTT (%POP = 300·P·L / (RTT·pop)), so their divergences must be near mirror images once the
    // load is matched. If they ever stopped being, one of the two metrics would be wrong.
    expect(Math.abs(intervalError + capacityError)).toBeLessThan(0.015);

    // The mechanism, by id, so this residual cannot be re-read as an unexplained gap.
    for (const id of ['constant-transit-speed', 'no-minimum-dwell'] as const) {
      expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === id)?.bias).toBe('under');
    }
    // Why the correction was smaller than 2·P·Δtp, which is why the gate's ~125 s prediction
    // undershot the measured 128.0 s.
    expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === 'uniform-transfer-time')?.bias).toBe(
      'either',
    );
  });

  it('explains that ordering by the acceleration distance, v²/a, against the interfloor rise', () => {
    // A jerk-limited flight that reaches rated speed costs d/v + v/a + a/j; the loss term
    // v/a + a/j is a property of the *machine* and does not shrink with the distance flown, so
    // the closed form's error per stop is worst where that loss is large relative to tv = df/v.
    const gardenCar = m.car;
    const midtownCar = midtown.car;

    const lossPerFlight = (car: Car): number =>
      car.constraints.ratedSpeedMps / car.spec.acceleration + car.spec.acceleration / car.spec.jerk;
    const accelerationDistanceM = (car: Car): number =>
      car.constraints.ratedSpeedMps ** 2 / car.spec.acceleration;

    // Midtown: v²/a = 6.25 m against df = 3.8 m — the car never reaches rated speed on a
    // one-floor hop at all, so tv = df/v is a fiction. Garden: 0.66 m against 3.0 m — it
    // reaches rated speed with room to spare and spends most of the hop at it.
    expect(accelerationDistanceM(midtownCar) / midtown.analysis.interfloorDistanceM).toBeGreaterThan(1);
    expect(accelerationDistanceM(gardenCar) / m.analysis.interfloorDistanceM).toBeLessThan(0.5);

    // The loss as a fraction of what the closed form charges for the hop: 211 % on Midtown,
    // 38 % on Garden.
    const midtownRatio = lossPerFlight(midtownCar) / midtown.analysis.roundTripTerms.singleFloorTransitS;
    const gardenRatio = lossPerFlight(gardenCar) / m.analysis.roundTripTerms.singleFloorTransitS;
    expect(midtownRatio).toBeGreaterThan(2);
    expect(gardenRatio).toBeLessThan(0.5);

    // And the real one-floor flight against tv: 4.68 s against 1.52 s on Midtown (+208 %),
    // 6.56 s against 4.76 s on Garden (+38 %).
    const gardenHopS = travelTime(m.analysis.interfloorDistanceM, gardenCar.constraints);
    const midtownHopS = travelTime(midtown.analysis.interfloorDistanceM, midtownCar.constraints);
    expect(divergence(midtownHopS, midtown.analysis.roundTripTerms.singleFloorTransitS)).toBeGreaterThan(1.5);
    expect(divergence(gardenHopS, m.analysis.roundTripTerms.singleFloorTransitS)).toBeLessThan(0.5);
  });

  it('is out by the same two omissions, measured at the transfer time actually in force', () => {
    // The corrections here are much smaller — flight +9.4 s and dwell +3.9 s against Midtown's
    // +33.6 s and +13.5 s — which is the same finding as the test above, seen in seconds.
    const flightExcessS = m.corrected.flightS - m.matched.result.travelTimeS;
    expect(flightExcessS).toBeGreaterThan(5);
    expect(flightExcessS).toBeLessThan(midtown.corrected.flightS - midtown.matched.result.travelTimeS);

    // Residual, with the Monte Carlo run at `car.passengerTransferS` — the value the simulator
    // actually charges. **This is the measurement that got better when the defect was fixed**, and
    // it is the one that tests the simulator rather than the textbook expression:
    //
    // | tp in force | simulated RTT | corrected closed form | residual |
    // |---|---|---|---|
    // | 1.2 s (the defect) | 120.6 s | 119.6 s | +0.84 % |
    // | 1.75 s (correct) | **128.0 s** | **127.1 s** | **+0.69 %** |
    //
    // Both sides moved together, by ~7.4 s, because both now charge the residential transfer time.
    // That is the strongest single piece of evidence that the fix was a fix: an independent model
    // of the same round trip, sharing no code with the run loop, tracked the simulator to within
    // 0.7 % after the change and 0.8 % before it. If the transfer time had been wired to the wrong
    // place, or double-charged, this residual would have moved instead of holding.
    const residual = divergence(m.roundTripFullS.mean, m.correctedRoundTripS);
    expect(Math.abs(residual)).toBeLessThan(0.04);
  });

  it('collapses onto the textbook figure under the same knock-out', () => {
    // Sanity: the same intervention works here, and to a much smaller extent, because there was
    // much less to remove. The band stays wider than Midtown's for a reason that is no longer the
    // transfer time — that is fixed, and both sides of this comparison now charge 1.75 s — but the
    // residual express-run and stop-ordering detail, plus the fact that knocking out the minimum
    // dwell removes proportionally more from a building whose stops are lightly loaded (8 people
    // over 5 floors) than from one whose stops are not.
    const both = knockout(GARDEN, { ...NO_ACCELERATION_LIMIT, ...NO_MINIMUM_DWELL });
    expect(Math.abs(divergence(both.simulatedRoundTripS, both.closedFormRoundTripS))).toBeLessThan(0.1);
  }, 120_000);
});

/* ========================================================================== *
 * The two defects this gate found. Both flatter the system.
 * ========================================================================== */

describe('defects found by the Phase 2 acceptance gate', () => {
  /**
   * ## Defect 1 — `DEFAULT_DEPARTURE_GAP_S` was shorter than a door reopen — **FIXED**
   *
   * Fixed in `metrics/summarize.ts`: the threshold is now `departureGapBracket(CarTimings)`, the
   * midpoint of `(openS + max(dwell, P·tp) + closeS, shortest round trip)`, derived per building
   * from the same door timings this file computes below, with `FALLBACK_DEPARTURE_GAP_S` for
   * records that carry no timings and `IntervalStatistics.departureGapBasis` saying which was
   * used. The measurements here are kept as the record of what the defect cost, and are now taken
   * at an explicit 10 s rather than off the summary. What follows describes the defect as found.
   *
   * `metrics/summarize.ts` reconstructs a terminal departure by splitting a car's boardings
   * wherever they are more than `departureGapS` apart, and justifies its 10 s default with
   * *"Loading is a passenger every 1–2 s and a door reopen adds a few more; a car does not come
   * back to the terminal inside a round trip … Any value between 'a slow transfer' and 'a fast
   * round trip' gives the same answer."*
   *
   * A reopen does not add a few seconds. It adds `openS + dwell + closeS`, because the doors
   * must finish closing before they can start opening again — **9.8 s on Midtown Office**
   * (1.8 + 5.0 + 3.0) and **11.5 s on Garden Apartments** (2.5 + 5.0 + 4.0), and up to ~20 s
   * when a full load's transfer sets the dwell. So one loading that reopens is counted as two
   * departures, the achieved interval reads low, and it reads low in the direction that makes
   * the group look better than it is.
   *
   * Measured across 128 replications:
   *
   * | building | INT at 10 s | INT at the derived gap | error |
   * |---|---|---|---|
   * | Midtown, at capacity | 45.6 s | 47.2 s | −3.5 % |
   * | Midtown, at 1.3× capacity | 47.5 s | 47.8 s | −0.5 % |
   * | Garden, at capacity | 46.6 s | 56.7 s | −17.7 % |
   * | Garden, at 1.3× capacity | 52.3 s | 57.7 s | −9.4 % |
   *
   * The tell that it is a defect and not a modelling choice is **internal inconsistency**: at
   * the 10 s default Garden's reported interval and its reported handling capacity, computed
   * from the same record, imply round trips 20 % apart.
   *
   * Fix, as applied: derive it from the door timings rather than fixing it — the bracket is
   * `(openS + max(dwell, P·tp) + closeS, shortest round trip)`, both computable, and both
   * computed by `metrics/summarize.ts`'s `departureGapBracket`. The internal inconsistency above
   * is now a permanent guard in `metrics/consistency.test.ts`, on both buildings.
   */
  it('defect 1: the 10 s threshold was below the terminal door reopen cycle', async () => {
    const { FALLBACK_DEPARTURE_GAP_S, departureGapBracket } = await import('../metrics/summarize.js');

    for (const caseSpec of [MIDTOWN, GARDEN]) {
      const building = buildingOf(caseSpec.buildingId);
      const analysis = analyzeUpPeak(building, config.elevatorSpecs, { bankId: 'main' });
      const car = carOf(caseSpec);
      const gap = departureGapFor(car, analysis, building);

      // The cheapest possible reopen: nobody transfers, so the dwell is the policy dwell. Even
      // that is above the threshold that shipped.
      const bareReopenS = car.doorConfig.openS + car.doorConfig.dwellHallCallS + car.doorConfig.closeS;
      expect(bareReopenS).toBeGreaterThan(LEGACY_DEPARTURE_GAP_S - 0.5);

      // And a real reopen after a full load is far longer still.
      expect(gap.maxReopenS).toBeGreaterThan(2 * LEGACY_DEPARTURE_GAP_S);

      // Fixed: `metrics/` now derives the threshold from these same door timings, and the
      // fallback it keeps for records that carry none clears the reopen on both buildings.
      const derived = departureGapBracket({
        doorOpenS: car.doorConfig.openS,
        doorCloseS: car.doorConfig.closeS,
        dwellHallCallS: car.doorConfig.dwellHallCallS,
        dwellCarCallS: car.doorConfig.dwellCarCallS,
        fullLoadTransferS:
          analysis.roundTripTerms.passengersPerTrip * analysis.roundTripTerms.passengerTransferS,
      });
      expect(derived.maxReopenS).toBeCloseTo(gap.maxReopenS, 9);
      expect(FALLBACK_DEPARTURE_GAP_S).toBeGreaterThan(gap.maxReopenS);
      expect(FALLBACK_DEPARTURE_GAP_S).toBeLessThan(gap.minRoundTripS);
    }
  });

  it('defect 1: costs Garden Apartments ~10 % of its reported interval', () => {
    const m = measure(GARDEN, 32);
    // Fewer replications: this is a bias, not a mean, and it does not need 128 runs to see.
    // Measured at 32 seeds: 52.3 s at the default against 57.7 s at the derived gap.
    expect(divergence(m.intervalAtLegacyGapS.mean, m.intervalS.mean)).toBeLessThan(-0.05);

    // The inconsistency, stated as such: the interval at the default gap and the handling
    // capacity from the same record imply two different round trips.
    const fromInterval = m.intervalAtLegacyGapS.mean * m.analysis.roundTripTerms.carsInGroup;
    const fromCapacity =
      (300 * m.passengersAll.mean * m.analysis.roundTripTerms.carsInGroup) /
      ((m.handlingCapacityPctPop.mean / 100) * m.analysis.roundTripTerms.population);
    expect(Math.abs(divergence(fromInterval, fromCapacity))).toBeGreaterThan(0.05);
  }, 60_000);

  /**
   * ## Defect 2 — the runner never applied the building's passenger transfer time — **FIXED**
   *
   * `elevator-specs.json → timing.passengerTransferS` is a per-building-type table:
   * office 1.2 s, residential 1.75 s, hotel 1.5 s. `analytical/upPeak.ts` read it; nothing on the
   * simulation side did. `Car.passengerTransferS` existed and was settable through `CarInit`, but
   * **nothing ever set it**: `resolveCar` did not derive it, `Simulation`'s `createCar` did not
   * pass it, and it fell through to `CAR_DEFAULTS.passengerTransferS`, whose own comment says
   * *"1.2 s is the office value"*. Every building therefore ran at the office figure — including
   * residential Garden Apartments, whose own `notes` field says 1.75 s.
   *
   * As found, measured on Garden Apartments over 128 replications:
   *
   * - the simulated round trip was **5.7 % short** (120.6 s where 128.0 s is correct),
   * - the achieved handling capacity was **5.4 % optimistic** (34.5 %POP where 32.7 % is correct),
   * - and the error was **invisible on Midtown Office**, because 1.2 s is the office value —
   *   which is precisely why an acceptance gate that only ran the named building would ship it.
   *
   * The effect was systematically optimistic, the direction CLAUDE.md § Statistical discipline
   * singles out.
   *
   * **Fixed in three places**, and it took all three:
   *
   * 1. `config/resolveCar.ts` resolves `passengerTransferS` from
   *    `specs.timing.passengerTransferS[buildingType]`, refusing to default for a type the table
   *    has no row for.
   * 2. `config/parse.ts`'s `resolveBuilding` passes the building type down, so every
   *    `ResolvedCar` `loadConfig` returns carries the value. Without this the derivation existed
   *    but was unreachable through the real loader, and only `Simulation` knew the answer.
   * 3. `data/buildings/mixed-use-high-rise.json` and `vertical-city.json` declare it **per car**,
   *    because `mixed-use` has no row on purpose — see `CLOSED_FORM_ASSUMPTIONS`
   *    `uniform-transfer-time`.
   *
   * The tests below pin the fixed behaviour on all five shipped buildings. They deliberately do
   * not branch on whether the defect is present: a conditional assertion is how a fix gets
   * un-made without anything failing.
   */
  it('defect 2 fixed: every shipped building runs at its own transfer time, off a built Car', () => {
    const table = config.elevatorSpecs.timing.passengerTransferS;
    expect(table.office).toBeCloseTo(1.2, 9);
    expect(table.residential).toBeCloseTo(1.75, 9);
    expect(table.hotel).toBeCloseTo(1.5, 9);

    const garden = buildingOf('garden-apartments');
    expect(garden.type).toBe('residential');

    // What the oracle uses, from the reference data, by building type.
    const closedForm = analyzeUpPeak(garden, config.elevatorSpecs, { bankId: 'main' });
    expect(closedForm.roundTripTerms.passengerTransferS).toBeCloseTo(table.residential, 9);

    // What the simulator uses, read off a constructed `Car` — the object that actually charges
    // the seconds, not the config it came from.
    expect(carOf(GARDEN).passengerTransferS).toBeCloseTo(table.residential, 9);
    // The two sides of the oracle now agree on `tp`, which is the whole point of the fix.
    expect(carOf(GARDEN).passengerTransferS).toBeCloseTo(
      closedForm.roundTripTerms.passengerTransferS,
      9,
    );

    // Midtown is unaffected — 1.2 s either way — which is exactly why it could not have caught
    // this, and why the gate had to run a second building.
    expect(carOf(MIDTOWN).passengerTransferS).toBeCloseTo(table.office, 9);
    expect(CAR_DEFAULTS.passengerTransferS).toBeCloseTo(table.office, 9);
  });

  it('defect 2 fixed: the 0.55 s per passenger is worth ~7 s of Garden round trip', () => {
    // The size of what was missing, through the closed form's own model rather than through a
    // simulation, so it is attributable to `tp` alone: same car, same heights, same draws, one
    // number changed.
    const garden = buildingOf('garden-apartments');
    const table = config.elevatorSpecs.timing.passengerTransferS;
    const car = carOf(GARDEN);
    const analysis = analyzeUpPeak(garden, config.elevatorSpecs, { bankId: 'main' });
    const heightsM = analysis.upperFloorIds.map((id) => {
      const heightM = garden.floorsById.get(id)?.heightM;
      if (heightM === undefined) throw new Error(`floor "${id}" has no height`);
      return heightM;
    });
    const shared = {
      car,
      heightsM,
      terminalHeightM: analysis.terminalHeightM,
      passengers: 8,
      draws: MONTE_CARLO_DRAWS,
      seed: 4_242,
    } as const;

    const asDefaulted = kinematicRoundTrip({ ...shared, passengerTransferS: table.office });
    const asSpecified = kinematicRoundTrip({ ...shared, passengerTransferS: table.residential });

    // Measured at P = 8: 117.9 s at the office default against 124.9 s at the residential value.
    // The whole of the difference is dwell; flight is bit-identical, as it must be.
    expect(asDefaulted.roundTripS).toBeLessThan(asSpecified.roundTripS);
    expect(Math.abs(divergence(asDefaulted.roundTripS, asSpecified.roundTripS))).toBeGreaterThan(0.03);
    expect(asDefaulted.flightS).toBeCloseTo(asSpecified.flightS, 6);
    expect(asSpecified.dwellS - asDefaulted.dwellS).toBeGreaterThan(1.5);

    // And **less than 2·P·Δtp**, which is the `uniform-transfer-time` assumption in seconds: the
    // minimum dwell absorbs part of the increase at every lightly loaded upstairs stop, so the
    // linear term overstates what raising `tp` actually costs.
    const linearPredictionS = 2 * 8 * (table.residential - table.office);
    expect(asSpecified.roundTripS - asDefaulted.roundTripS).toBeLessThan(linearPredictionS);

    // This 124.9 s figure is the *whole* provenance of the "~125 s once corrected" prediction the
    // gate made, and it is why that prediction undershot the 128.0 s the fix actually produced: it
    // is evaluated at exactly P = 8, while the simulator carries P ≈ 8.4 on its full trips.
    // Re-evaluated at the load actually carried the same model says 127.1 s, against 128.0 s
    // measured — so the prediction's mechanism was right and only its operating point was off.
    // `CLOSED_FORM_COMPARISON_RULE.precondition` is exactly this trap, stated in advance.
    expect(asSpecified.roundTripS).toBeGreaterThan(124);
    expect(asSpecified.roundTripS).toBeLessThan(126);
    expect(CLOSED_FORM_COMPARISON_RULE.precondition).toContain('Matched load');
  });
});
