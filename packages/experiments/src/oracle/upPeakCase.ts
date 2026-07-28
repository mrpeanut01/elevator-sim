/**
 * Driving the closed-form comparison on **any** shipped bank, not just the two it was written for.
 *
 * `packages/core/src/analytical/validation.test.ts` is the Phase 2 acceptance gate. It reconciles
 * Midtown Office and Garden Apartments against the closed form and it does so by hand: two `Case`
 * literals, a hard-coded `bankId: 'main'`, and a terminal the default rule happens to find. Three
 * of the five shipped buildings — Secure Tower, Mixed-Use High-Rise, Vertical City — cannot be
 * reached that way, for four separate reasons that this module resolves **generically** rather
 * than by adding three more literals:
 *
 * | Obstacle | Where it bites | What is derived instead |
 * |---|---|---|
 * | `tp` has no row for `mixed-use` | both mixed-use towers, every bank | the mean of the bank's own cars' `passengerTransferS`, which the reference data states per car precisely because the table cannot |
 * | no served floor has population above the terminal | Vertical City · shuttle | the highest served entrance, then the lowest served transfer floor |
 * | every destination is an unpopulated sky lobby | Vertical City · shuttle, Mixed-Use · shuttle | all served floors above the terminal, rather than the populated ones |
 * | `U` is the transfer floors' own population, not the population lifted | both shuttles | {@link onwardPopulationOf} — the floors reachable *through* those destinations on other banks |
 *
 * None of the four is a branch on a building id (CLAUDE.md invariant 7): each is a rule over the
 * resolved configuration that reduces to the existing behaviour on the two buildings the gate
 * already covers. {@link deriveUpPeakCase} reports which rule fired for each term, so a reader can
 * see whether a figure came from the default path or from a fallback.
 *
 * ## The `U` derivation is checkable against a number the project already published
 *
 * `analytical/upPeak.ts`'s own docstring works Mixed-Use High-Rise's shuttle by hand: the sky
 * lobby at 31 declares 260 occupants, the residential bank above it serves 754 more, *"for a true
 * `U` of 1014"*. {@link onwardPopulationOf} is not told that. It reaches 1014 from the bank graph,
 * and `bankCensus.test.ts` asserts it — which is what makes it a derivation rather than a
 * transcription.
 *
 * ## Isolation: why the simulated side runs one bank at a time
 *
 * The closed form describes **one group, serving one zone, loading every passenger at one
 * terminal**. On a single-bank building that is the building. On Vertical City it is not: seven
 * banks share three sky lobbies, a journey to floor 45 is two legs, and an offered demand high
 * enough to saturate `zone-1-local` saturates the shuttle so hard the run does not drain inside
 * its grace window at all — measured, not assumed (`onTimeout` fires at ~23 % of population per
 * 5 min). There is no rate at which the whole tower reproduces the closed form's operating point
 * for any one of its banks.
 *
 * {@link isolateBank} therefore rebuilds the bank as a building of its own — its served floors,
 * its cars, its terminal marked `isEntrance` — and hands that to the simulator. Everything goes
 * through `parseBuilding`/`resolveBuilding`, so no code path exists here that the shipped loader
 * does not already have; it is the same technique the Phase 2 gate's knock-out arms use to impose
 * the closed form's simplifications through per-car config. The check that it is faithful is that
 * it is a **no-op on the two buildings whose answers are known**: Midtown Office and Garden
 * Apartments have one bank each, so isolation returns the same zone, the same cars and the same
 * closed-form terms, and `fiveBuildings.test.ts` asserts the reconciliation reproduces the
 * residuals `docs/07-handoff.md` § 5 records.
 *
 * Pure except where noted: `measureUpPeak` runs the simulator and is the only function here that
 * does. No wall clock, no global RNG — every draw comes from a named stream on a seeded
 * `StreamSet` (CLAUDE.md invariants 2 and 3).
 */

import {
  StreamSet,
  achievedIntervalOf,
  analyzeUpPeak,
  dwellSecondsFor,
  parseBuilding,
  passengerTransferSecondsFor,
  resolveBuilding,
  travelTime,
  Simulation,
} from '@elevator-sim/core';
import type {
  BuildingConfig,
  Car,
  CarConfig,
  DispatcherProfile,
  ElevatorSpecs,
  FloorConfig,
  LoadedConfig,
  PassengerRecord,
  ReportWindow,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedCar,
  SimulationResult,
  TrafficProfiles,
  UpPeakAnalysis,
  UpPeakOptions,
} from '@elevator-sim/core';

import { departureGapBracket, summariseReplications } from './reconcile.js';
import type { DepartureGapBracket } from './reconcile.js';
import type { MeasuredRoundTrip, ReplicationStatistic } from './types.js';

/* -------------------------------------------------------------------------- *
 * Deriving the closed form's inputs for an arbitrary bank
 * -------------------------------------------------------------------------- */

/** Which rule supplied a term. Reported so a fallback can never pass for the default path. */
export type TermProvenance = 'default' | 'fallback';

/** The closed-form inputs for one bank, and how each contested one was arrived at. */
export interface UpPeakCase {
  readonly buildingId: string;
  readonly bankId: string;
  /** Ready to pass to `analyzeUpPeak`. */
  readonly options: UpPeakOptions;
  readonly terminalFloorId: string;
  readonly terminalProvenance: TermProvenance;
  /** `tp`, seconds per passenger per direction. */
  readonly passengerTransferS: number;
  readonly transferProvenance: TermProvenance;
  readonly destinationFloorIds: readonly string[];
  readonly destinationProvenance: TermProvenance;
  /** `U`. */
  readonly servedPopulation: number;
  /** Floors reachable only *through* this bank's destinations, on other banks. */
  readonly onwardFloorIds: readonly string[];
}

/**
 * `tp` for a bank: the building-type table when it has a row, otherwise the bank's own cars.
 *
 * `elevator-specs.json → timing.passengerTransferS` covers office, residential and hotel and
 * deliberately has **no** `mixed-use` row — `analytical/upPeak.ts` explains why: a mixed tower's
 * banks serve populations with different transfer behaviour, so there is no honest building-wide
 * answer. The reference data states the value per car instead, and every car of both mixed-use
 * towers declares one. Averaging across the bank's cars is therefore reading the answer the data
 * gives, not inventing one; `resolveCar` refuses to default it, so an absent value here is a
 * configuration error rather than a silent office 1.2 s.
 *
 * @throws Error if the table has no row and some car of the bank declares no value either.
 */
export function passengerTransferForBank(
  building: ResolvedBuilding,
  bank: ResolvedBank,
  specs: ElevatorSpecs,
): { readonly value: number; readonly provenance: TermProvenance } {
  const fromTable = passengerTransferSecondsFor(specs, building.type);
  if (fromTable !== undefined) return { value: fromTable, provenance: 'default' };

  const declared = bank.cars.map((car) => car.passengerTransferS);
  const missing = bank.cars.filter((car) => car.passengerTransferS === undefined).map((car) => car.id);
  if (missing.length > 0) {
    throw new Error(
      `bank "${bank.id}" of building "${building.id}" is type "${building.type}", which ` +
        `elevator-specs.json → timing.passengerTransferS has no row for, and car(s) ` +
        `${missing.join(', ')} declare no passengerTransferS of their own. There is no honest ` +
        'value to use: 1.2 s is the office figure and assuming it is exactly the defect the ' +
        'Phase 2 gate found on Garden Apartments.',
    );
  }
  const values = declared as readonly number[];
  const total = values.reduce((sum, value) => sum + value, 0);
  return { value: total / values.length, provenance: 'fallback' };
}

/** The bank's served floors, in floor order. */
function servedFloorsOf(building: ResolvedBuilding, bank: ResolvedBank): readonly FloorConfig[] {
  const served = new Set(bank.servesFloors);
  return building.floors.filter((floor) => served.has(floor.id));
}

/**
 * The floor the up-peak round trip starts from.
 *
 * `analyzeUpPeak`'s own rule first — highest served entrance, then highest served transfer floor,
 * in both cases restricted to floors with populated served floors above them. That restriction is
 * what stops a sky lobby at the top of a bank's range being mistaken for its terminal, and it is
 * right on eleven of the fourteen shipped banks.
 *
 * It has nothing to say about a bank whose destinations are **all** unpopulated, which is exactly
 * what a shuttle is: Vertical City's shuttle serves G, 2 and six sky lobbies, and every one of the
 * eight declares `population: 0` because their traffic belongs to the floors beyond them. The rule
 * finds no candidate at all and `analyzeUpPeak` raises `noTerminal`. The fallback drops the
 * population condition and keeps the flag condition, which on that bank picks G — the street
 * entrance, and the only floor a passenger can enter the building at.
 */
export function terminalFloorFor(
  building: ResolvedBuilding,
  bank: ResolvedBank,
): { readonly floor: FloorConfig; readonly provenance: TermProvenance } {
  const served = servedFloorsOf(building, bank);
  const populatedAbove = (candidate: FloorConfig): boolean =>
    served.some((floor) => floor.index > candidate.index && floor.population > 0);

  const qualifying = served.filter(populatedAbove);
  const byDefault =
    qualifying.filter((floor) => floor.isEntrance === true).at(-1) ??
    qualifying.filter((floor) => floor.isTransferFloor === true).at(-1);
  if (byDefault !== undefined) return { floor: byDefault, provenance: 'default' };

  const fallback =
    served.filter((floor) => floor.isEntrance === true).at(-1) ??
    served.filter((floor) => floor.isTransferFloor === true).at(0);
  if (fallback === undefined) {
    throw new Error(
      `bank "${bank.id}" of building "${building.id}" serves no floor flagged isEntrance or ` +
        'isTransferFloor at all, so there is no floor an up-peak could start from.',
    );
  }
  return { floor: fallback, provenance: 'fallback' };
}

/**
 * The destination floors: populated served floors above the terminal, or — when there are none —
 * every served floor above it.
 *
 * The fallback is the shuttle case again. Excluding unpopulated floors is right for a local bank,
 * where a plant room inside the zone is never an up-peak destination; on a shuttle it excludes
 * *every* destination and leaves the closed form with nothing to serve.
 */
export function destinationFloorsFor(
  building: ResolvedBuilding,
  bank: ResolvedBank,
  terminal: FloorConfig,
): { readonly floors: readonly FloorConfig[]; readonly provenance: TermProvenance } {
  const above = servedFloorsOf(building, bank).filter((floor) => floor.index > terminal.index);
  const populated = above.filter((floor) => floor.population > 0);
  if (populated.length > 0) return { floors: populated, provenance: 'default' };
  return { floors: above, provenance: 'fallback' };
}

/**
 * `U` — the population this group lifts, including everyone who continues past its destinations.
 *
 * Summing the destination floors' own `population` is right whenever those floors are where the
 * passengers are going. On a shuttle it is not: the sky lobby is a handover, and the people the
 * shuttle carries are the occupants of the floors *beyond* it. `analyzeUpPeak` raises
 * `destinationsAreTransferFloors` on exactly that shape and then reports a `%POP` its own
 * `implausibleHandlingCapacity` warning calls implausible, because `U` is too small.
 *
 * The onward population is read off the bank graph: any **other** bank that serves one of this
 * bank's destinations continues the journey, so every floor that bank serves and this one does not
 * is reachable only through here. The union is taken across all destinations before summing, so a
 * bank reached from two of them — Vertical City's `zone-5-local` opens on both 51 and 52 — is
 * counted once rather than twice.
 *
 * **A bank that also serves this bank's terminal is not a handover, and is skipped.** Sharing a
 * destination is not enough to make one group feed another: Vertical City's `zone-1-local` opens on
 * the upper ground lobby at floor 2, which is also one of the shuttle's stops, but its passengers
 * board it at G alongside everyone else and the shuttle lifts none of them. Without this condition
 * the shuttle's `U` comes out at the whole building's 4887 instead of the 2872 of zones 3–6 — a
 * 41 % understatement of `%POP` on the only bank whose `U` cannot be read off its own floors.
 * The same condition is what keeps Secure Tower's two banks independent of each other: both open
 * on the lobby, neither feeds the other.
 *
 * Second-order onward traffic is **not** followed: a bank reachable through two transfers would be
 * missed. No shipped building has one, and `bankCensus.test.ts` pins that by comparing this
 * one-hop answer against the transitive closure of the same rule.
 */
export function onwardPopulationOf(
  building: ResolvedBuilding,
  bank: ResolvedBank,
  destinationFloorIds: readonly string[],
  terminalFloorId?: string,
): { readonly total: number; readonly onwardFloorIds: readonly string[] } {
  const own = new Set(bank.servesFloors);
  const onward = new Set<string>();
  for (const other of building.banks) {
    if (other.id === bank.id) continue;
    if (terminalFloorId !== undefined && other.servesFloors.includes(terminalFloorId)) continue;
    if (!destinationFloorIds.some((id) => other.servesFloors.includes(id))) continue;
    for (const id of other.servesFloors) if (!own.has(id)) onward.add(id);
  }
  const onwardFloorIds = building.floors
    .filter((floor) => onward.has(floor.id))
    .map((floor) => floor.id);

  let total = 0;
  for (const id of [...destinationFloorIds, ...onwardFloorIds]) {
    total += building.floorsById.get(id)?.population ?? 0;
  }
  return { total, onwardFloorIds };
}

/** Every term the closed form needs for one bank, each one derived and each one attributed. */
export function deriveUpPeakCase(
  building: ResolvedBuilding,
  bankId: string,
  specs: ElevatorSpecs,
): UpPeakCase {
  const bank = building.banks.find((candidate) => candidate.id === bankId);
  if (bank === undefined) {
    throw new Error(
      `building "${building.id}" declares no bank "${bankId}". Banks: ` +
        `${building.banks.map((candidate) => candidate.id).join(', ')}.`,
    );
  }
  const transfer = passengerTransferForBank(building, bank, specs);
  const terminal = terminalFloorFor(building, bank);
  const destinations = destinationFloorsFor(building, bank, terminal.floor);
  const destinationFloorIds = destinations.floors.map((floor) => floor.id);
  const onward = onwardPopulationOf(building, bank, destinationFloorIds, terminal.floor.id);

  return {
    buildingId: building.id,
    bankId,
    options: {
      bankId,
      passengerTransferS: transfer.value,
      entranceFloorId: terminal.floor.id,
      upperFloorIds: destinationFloorIds,
      servedPopulation: onward.total,
    },
    terminalFloorId: terminal.floor.id,
    terminalProvenance: terminal.provenance,
    passengerTransferS: transfer.value,
    transferProvenance: transfer.provenance,
    destinationFloorIds,
    destinationProvenance: destinations.provenance,
    servedPopulation: onward.total,
    onwardFloorIds: onward.onwardFloorIds,
  };
}

/* -------------------------------------------------------------------------- *
 * Isolating one bank as a building the simulator can run
 * -------------------------------------------------------------------------- */

/** A `ResolvedCar` back in the authored shape, with nothing left to a class default. */
function carConfigOf(car: ResolvedCar): CarConfig {
  return {
    id: car.id,
    spec: car.spec,
    ratedSpeedMps: car.ratedSpeedMps,
    ratedLoadLb: car.ratedLoadLb,
    doorType: car.doorType,
    acceleration: car.acceleration,
    jerk: car.jerk,
    doorOpenS: car.doorOpenS,
    doorCloseS: car.doorCloseS,
    dwellCarCallS: car.dwellCarCallS,
    dwellHallCallS: car.dwellHallCallS,
    motorStartDelayS: car.motorStartDelayS,
    levelingSettleS: car.levelingSettleS,
    ...(car.passengerTransferS === undefined ? {} : { passengerTransferS: car.passengerTransferS }),
  };
}

/**
 * The bank, rebuilt as a building of its own, through the shipped parser and resolver.
 *
 * Three edits, and only three:
 *
 * - **floors** are the bank's served floors at their authored heights and populations. Nothing is
 *   moved, so every flight the simulator flies is a flight the real building has.
 * - **the terminal** is flagged `isEntrance` and its population is zeroed. The flag is what makes
 *   the demand generator originate incoming traffic there, which is the closed form's condition
 *   that every passenger boards at the terminal; on a sky-lobby terminal it is also the truth —
 *   passengers *do* enter that group there, having arrived on another one. Zeroing its population
 *   stops the terminal being its own destination, which the closed form has no term for.
 * - **double-deck fields are dropped** with the rest of `servesFloorPairs`, because the runtime
 *   does not model them either. See {@link isolateBank}'s caller obligations below.
 *
 * Everything else is carried verbatim: car specs including per-car `passengerTransferS`, floor
 * traffic-profile overrides, the building type. `accessZones` is emptied — credential zoning is a
 * distinct concept from service zoning and the closed form has no term for it, so leaving a zone
 * behind that references dropped floors would fail validation for a reason unrelated to the
 * comparison.
 *
 * **Caller obligation on double-deck hardware.** `loadConfig` raises `double-deck-not-simulated`
 * on Vertical City's shuttle and that disclaimer travels in `RunRecord.warnings`. An isolated
 * single-bank building is authored fresh, so *it* carries no such history. Do not publish a figure
 * for a double-deck bank from this function without restating the disclaimer;
 * `fiveBuildings.test.ts` refuses to reconcile that bank at all, for this reason among two others.
 */
export function isolateBank(
  building: ResolvedBuilding,
  bankId: string,
  terminalFloorId: string,
  specs: ElevatorSpecs,
  trafficProfileIds: ReadonlySet<string>,
): ResolvedBuilding {
  const bank = building.banks.find((candidate) => candidate.id === bankId);
  if (bank === undefined) {
    throw new Error(`building "${building.id}" declares no bank "${bankId}".`);
  }
  const served = servedFloorsOf(building, bank);
  if (!served.some((floor) => floor.id === terminalFloorId)) {
    throw new Error(
      `floor "${terminalFloorId}" is not served by bank "${bankId}" of building "${building.id}".`,
    );
  }

  const authored: BuildingConfig = {
    id: `${building.id}__${bankId}`,
    name: `${building.name} — bank ${bankId}, isolated`,
    type: building.type,
    trafficProfile: building.trafficProfile,
    floors: served.map((floor) => ({
      id: floor.id,
      index: floor.index,
      heightM: floor.heightM,
      population: floor.id === terminalFloorId ? 0 : floor.population,
      ...(floor.id === terminalFloorId ? { isEntrance: true } : {}),
      ...(floor.trafficProfile === undefined ? {} : { trafficProfile: floor.trafficProfile }),
    })),
    banks: [{ id: bank.id, servesFloors: [...bank.servesFloors], cars: bank.cars.map(carConfigOf) }],
    accessZones: [],
  };
  const file = `${authored.id}.isolated.json`;
  return resolveBuilding(parseBuilding(authored, file), specs, {
    file,
    trafficProfileIds: new Set(trafficProfileIds),
  });
}

/* -------------------------------------------------------------------------- *
 * Reading round trips off a run record
 * -------------------------------------------------------------------------- */

/** One car's departure from the terminal, and what it did before coming back. */
export interface TerminalRoundTrip {
  readonly departedAt: number;
  /** `P` — how many boarded on that departure. */
  readonly passengers: number;
  /** `S` — distinct destinations among them. */
  readonly stops: number;
  /** Seconds until the same car loaded at the terminal again; `undefined` for the last one. */
  readonly roundTripS: number | undefined;
}

/**
 * Every terminal departure in the record, per car, in time order.
 *
 * Reads boarding timestamps, origin and destination floor ids and car ids and nothing else — the
 * material a run replayed from its seed would offer — so it is independent of the run loop's
 * internals. Boardings closer together than `departureGapS` belong to one loading; see
 * {@link DepartureGapBracket} for why the threshold is derived rather than chosen.
 */
export function terminalRoundTripsOf(
  records: readonly PassengerRecord[],
  terminalFloorId: string,
  departureGapS: number,
): readonly TerminalRoundTrip[] {
  const byCar = new Map<string, PassengerRecord[]>();
  for (const leg of records) {
    if (leg.originFloorId !== terminalFloorId) continue;
    if (leg.boardedAt === undefined || leg.carId === undefined) continue;
    const boardings = byCar.get(leg.carId);
    if (boardings === undefined) byCar.set(leg.carId, [leg]);
    else boardings.push(leg);
  }

  const trips: TerminalRoundTrip[] = [];
  for (const [, boardings] of byCar) {
    boardings.sort((a, b) => (a.boardedAt ?? 0) - (b.boardedAt ?? 0));
    const clusters: {
      firstAt: number;
      lastAt: number;
      passengers: number;
      destinations: Set<string>;
    }[] = [];
    for (const leg of boardings) {
      const at = leg.boardedAt ?? 0;
      const last = clusters.at(-1);
      if (last !== undefined && at - last.lastAt < departureGapS) {
        last.lastAt = at;
        last.passengers += 1;
        last.destinations.add(leg.destinationFloorId);
      } else {
        clusters.push({
          firstAt: at,
          lastAt: at,
          passengers: 1,
          destinations: new Set([leg.destinationFloorId]),
        });
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

const inWindow = (trip: TerminalRoundTrip, window: ReportWindow): boolean =>
  trip.roundTripS !== undefined &&
  trip.departedAt >= window.startS &&
  trip.departedAt <= window.endS;

/**
 * The departure-clustering bracket for one bank, from that bank's cars alone.
 *
 * `metrics/summarize.ts` computes the same bracket across **every** bank serving the terminal,
 * because it publishes one achieved interval for the building and a threshold has to be valid for
 * all of them. That is why both mixed-use towers report their terminals `unmeasurable`: at
 * Mixed-Use's ground lobby a shuttle can hold its doors 41.2 s while an office-local car completes
 * a whole round trip in 31.3 s, and no single threshold separates a reopen from a return for both.
 *
 * A per-bank reconciliation does not need one threshold for both. Both bounds — how long *this*
 * car can hold its doors, and how fast *this* car can get to its nearest served floor and back —
 * are properties of the bank being measured, and trips are reconstructed per car anyway. So the
 * bracket is computed from the bank, and the buildings whose *terminals* are unmeasurable are not
 * thereby unmeasurable bank by bank. Three of the fourteen shipped banks still are, on their own
 * timings; `bankCensus.test.ts` enumerates them and this function throws on them.
 *
 * @throws RangeError when the bracket is empty — the longest reopen is not shorter than the
 *   shortest round trip. That is a statement about the bank, not a tolerance to widen.
 */
export function bankDepartureBracket(
  car: Car,
  analysis: UpPeakAnalysis,
  building: ResolvedBuilding,
): DepartureGapBracket {
  const lowestId = analysis.upperFloorIds[0];
  if (lowestId === undefined) throw new Error('no served floors above the terminal');
  const lowestHeightM = building.floorsById.get(lowestId)?.heightM;
  if (lowestHeightM === undefined) throw new Error(`floor "${lowestId}" has no height`);

  const { passengersPerTrip, passengerTransferS } = analysis.roundTripTerms;
  return departureGapBracket({
    doorOpenS: car.doorConfig.openS,
    doorCloseS: car.doorConfig.closeS,
    dwellHallCallS: car.doorConfig.dwellHallCallS,
    dwellCarCallS: car.doorConfig.dwellCarCallS,
    fullLoadTransferS: passengersPerTrip * passengerTransferS,
    nearestFloorFlightS: travelTime(lowestHeightM - analysis.terminalHeightM, car.constraints),
    motorStartDelayS: car.spec.motorStartDelayS,
    levelingSettleS: car.spec.levelingSettleS,
  });
}

/* -------------------------------------------------------------------------- *
 * The closed form's own model, evaluated with the project's real physics
 * -------------------------------------------------------------------------- */

/** What one round trip costs when the closed form's two omissions are charged. */
export interface KinematicRoundTrip {
  readonly roundTripS: number;
  /** Mean distinct destinations. Must reproduce the closed form's `S`, or the models differ. */
  readonly stops: number;
  /** Mean seconds in flight. Counterpart of `2·(H·tv + tx)`. */
  readonly flightS: number;
  /** Mean seconds with doors dwelling. Counterpart of `2·P·tp`. */
  readonly dwellS: number;
  /** Mean `(S+1)·(open + close + start + level)`. Counterpart of `(S+1)·ts`. */
  readonly fixedS: number;
}

/**
 * Monte Carlo over Barney's **own** population model, with this project's kinematics and door
 * policy substituted for `d/v` and `2·P·tp`.
 *
 * `P` passengers board at the terminal; each draws a destination uniformly from `N` floors; the
 * car serves the distinct destinations in ascending order and returns express. That is the model
 * `S = N(1 − ((N−1)/N)^P)` and `H = N − Σ(i/N)^P` are derived from, which is why
 * {@link KinematicRoundTrip.stops} must come out equal to `S` — checked, not assumed.
 *
 * The same construction as the Phase 2 gate's, lifted here so it can be pointed at a bank rather
 * than at a `Case` literal. Draws come from a named stream on a seeded `StreamSet`; nothing is
 * mutated and there is no wall clock.
 */
export function kinematicRoundTrip(options: {
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
    car.doorConfig.closeS +
    car.spec.motorStartDelayS +
    car.spec.levelingSettleS +
    car.doorConfig.openS;

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
 * Measuring one bank
 * -------------------------------------------------------------------------- */

/**
 * Offered demand as a multiple of the closed-form `%POP`.
 *
 * The closed form describes a **saturated** group: cars leaving the terminal at design load, back
 * to back. Below capacity the achieved interval is set by how often people arrive rather than by
 * how long a round trip takes, and agreement would be an artefact of the demand knob. The Phase 2
 * gate swept 1.0–2.0× and found every quantity flat past ~1.15×; 1.3 is the value it settled on
 * and is reused here so the two gates are measuring the same operating point.
 *
 * The consequence is that **every run in this module saturates on purpose**, and
 * {@link UpPeakMeasurement} carries no waiting-time statistic at all: CLAUDE.md § Statistical
 * discipline forbids reporting a mean waiting time for a system whose queues grow without bound,
 * and round-trip time, interval and handling capacity are precisely the quantities that stay
 * well-defined when they do.
 */
export const OVERLOAD_FACTOR = 1.3;

/** Monte Carlo draws for {@link kinematicRoundTrip}. Standard error on RTT is then ~0.1 %. */
export const MONTE_CARLO_DRAWS = 20_000;

/** Everything one bank's up-peak measurement produced. */
export interface UpPeakMeasurement {
  readonly caseSpec: UpPeakCase;
  /** The bank isolated as a building of its own. */
  readonly isolated: ResolvedBuilding;
  /** The closed form at its own design load. */
  readonly analysis: UpPeakAnalysis;
  /** The closed form re-evaluated at the load the simulator actually carried. */
  readonly matched: UpPeakAnalysis;
  readonly car: Car;
  readonly bracket: DepartureGapBracket;
  readonly replications: number;
  /** Every replication saturated, as intended. `false` means the operating point drifted. */
  readonly allSaturated: boolean;
  /**
   * How many of the {@link replications} came back `saturated`.
   *
   * Reported as a count rather than folded into {@link allSaturated} because the two answer
   * different questions. Saturation is the closed form's *operating point*, offered deliberately
   * at {@link OVERLOAD_FACTOR} — but 1.3× is a mean over a Poisson arrival process, so an
   * individual replication can fail to diverge without anything being wrong with the model. What
   * matters is that the great majority do; a fraction that fell would say the offered rate had
   * stopped exceeding the group's capacity, and then the achieved interval would be set by how
   * often people arrive rather than by how long a round trip takes.
   */
  readonly saturatedReplications: number;
  readonly measured: MeasuredRoundTrip;
  /** Round trip over *all* in-window departures, full or not. What the interval is measured over. */
  readonly roundTripAllS: ReplicationStatistic;
  readonly passengersAllS: ReplicationStatistic;
  readonly intervalCoV: ReplicationStatistic;
  readonly tripCountAll: number;
  readonly tripCountFull: number;
  /** The same model with the two documented omissions charged. */
  readonly corrected: KinematicRoundTrip;
}

export interface MeasureUpPeakInput {
  readonly config: LoadedConfig;
  readonly buildingId: string;
  readonly bankId: string;
  readonly seeds: readonly number[];
  /** Length of the peak plateau, which is also the reported window. */
  readonly peakWindowS: number;
  /** Defaults to `collective`, parked at the lobby — the Phase 2 gate's arm. */
  readonly dispatcherProfileId?: string | undefined;
}

function statOf(values: readonly number[]): ReplicationStatistic {
  return summariseReplications(values);
}

const meanOf = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Run one bank under pure up-peak and reduce the result to what a reconciliation needs.
 *
 * The conditions reproduce the closed form's as closely as the model allows, and every one of them
 * is **config** — there is no branch on a building id anywhere in this function (CLAUDE.md
 * invariant 7):
 *
 * | Closed-form assumption | How this reproduces it | Matched? |
 * |---|---|---|
 * | all traffic incoming | `directionalSplit: { incoming: 1, … }` | yes |
 * | every passenger boards at one terminal | the isolated building has exactly one entrance | yes |
 * | all `L` cars shuttle from that terminal | `idle.parkingStrategy: 'lobby'`, a profile field | yes |
 * | the group is the constraint, not demand | offered demand at {@link OVERLOAD_FACTOR} × `%POP` | yes |
 * | one group, one zone | {@link isolateBank} | yes |
 * | every trip carries exactly `P` | Poisson batches; handled by comparing at the observed load | **no** |
 * | departures perfectly evenly spaced | a real dispatcher bunches; reported as the interval's CoV | **no** |
 * | destinations drawn uniformly | true only where floor populations are uniform; the analysis warns | **varies** |
 * | rated speed, no minimum dwell | physics; **cannot** be matched, and is the whole finding | **no** |
 *
 * @throws RangeError from {@link bankDepartureBracket} when this bank's departures cannot be
 *   reconstructed from boarding times at all.
 */
export function measureUpPeak(input: MeasureUpPeakInput): UpPeakMeasurement {
  const { config, buildingId, bankId, seeds, peakWindowS } = input;
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`missing building fixture "${buildingId}"`);
  const profile = config.dispatcherProfilesById.get(input.dispatcherProfileId ?? 'collective');
  if (profile === undefined) throw new Error('missing dispatcher fixture');

  const caseSpec = deriveUpPeakCase(building, bankId, config.elevatorSpecs);
  const trafficProfileIds = new Set(config.trafficProfiles.profiles.map((entry) => entry.id));
  const isolated = isolateBank(
    building,
    bankId,
    caseSpec.terminalFloorId,
    config.elevatorSpecs,
    trafficProfileIds,
  );
  // The isolated building's `U` is the population of its own floors. The closed form is evaluated
  // against the population the *simulator* is driven by, so that %POP means the same fraction on
  // both sides; `caseSpec.servedPopulation` (which follows onward traffic) is the right figure for
  // the whole tower and the wrong one for a bank running alone.
  const options: UpPeakOptions = {
    bankId,
    passengerTransferS: caseSpec.passengerTransferS,
    entranceFloorId: caseSpec.terminalFloorId,
    upperFloorIds: [...caseSpec.destinationFloorIds],
  };
  const analysis = analyzeUpPeak(isolated, config.elevatorSpecs, options);

  const arm = (seed: number, target: ResolvedBuilding, rate: number): Simulation =>
    new Simulation({
      building: target,
      dispatcherProfile: { ...profile, idle: { ...profile.idle, parkingStrategy: 'lobby' } },
      trafficProfiles: config.trafficProfiles as TrafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed,
      demand: {
        directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
        arrivalRatePctPop5min: rate,
        peakWindowS,
      },
    });

  const car = arm(1, isolated, 1).building.cars[0];
  if (car === undefined) throw new Error(`bank "${bankId}" has no cars`);
  const bracket = bankDepartureBracket(car, analysis, isolated);

  const rate = analysis.result.percentPopulation5Min * OVERLOAD_FACTOR;
  const results: SimulationResult[] = seeds.map((seed) => arm(seed, isolated, rate).run());

  // `CLOSED_FORM_COMPARISON_RULE.matchedLoadGuidance`: a trip that left below the largest integer
  // load the simulator can board was not full, and a part-full trip is a legitimately shorter
  // round trip the closed form does not describe.
  const designPersons = Math.floor(analysis.designLoadFactor * analysis.ratedCapacityPersons);

  const intervals: number[] = [];
  const covs: number[] = [];
  const capacities: number[] = [];
  const roundTripAll: number[] = [];
  const roundTripFull: number[] = [];
  const passengersAll: number[] = [];
  const passengersFull: number[] = [];
  const stopsFull: number[] = [];
  let tripCountAll = 0;
  let tripCountFull = 0;
  let saturatedReplications = 0;

  for (const result of results) {
    const window = result.reportWindow;
    if (result.summary.saturation?.saturated === true) saturatedReplications += 1;
    capacities.push(result.summary.handlingCapacity.pctPopulationPer5Min ?? Number.NaN);

    const all = terminalRoundTripsOf(
      result.record.passengers,
      analysis.terminalFloorId,
      bracket.midpointS,
    ).filter((trip) => inWindow(trip, window));
    const full = all.filter((trip) => trip.passengers >= designPersons);
    tripCountAll += all.length;
    tripCountFull += full.length;
    if (all.length > 0) {
      roundTripAll.push(meanOf(all.map((trip) => trip.roundTripS ?? 0)));
      passengersAll.push(meanOf(all.map((trip) => trip.passengers)));
    }
    // The achieved interval, at **this bank's** threshold rather than off the summary. The
    // summary derives its threshold across every bank serving the terminal, which is right for a
    // building-wide figure and is why both mixed-use towers report theirs `unmeasurable`; passing
    // the bank's own bracket is what lets the same code measure a bank the summary declines to.
    const achieved = achievedIntervalOf(result.record.passengers, {
      window,
      departureGapS: bracket.midpointS,
    });
    if (Number.isFinite(achieved.meanS)) intervals.push(achieved.meanS);
    if (Number.isFinite(achieved.coefficientOfVariation)) {
      covs.push(achieved.coefficientOfVariation);
    }
    if (full.length > 0) {
      roundTripFull.push(meanOf(full.map((trip) => trip.roundTripS ?? 0)));
      passengersFull.push(meanOf(full.map((trip) => trip.passengers)));
      stopsFull.push(meanOf(full.map((trip) => trip.stops)));
    }
  }

  const passengersFullStat = statOf(passengersFull);
  const matched = analyzeUpPeak(isolated, config.elevatorSpecs, {
    ...options,
    passengersPerTrip: passengersFullStat.mean,
  });

  // The Monte Carlo boards whole people, so it runs at the two integers bracketing the observed
  // mean load and interpolates. RTT is very nearly linear in P over one person.
  const lower = Math.floor(passengersFullStat.mean);
  const heightsM = analysis.upperFloorIds.map((id) => {
    const heightM = isolated.floorsById.get(id)?.heightM;
    if (heightM === undefined) throw new Error(`floor "${id}" has no height`);
    return heightM;
  });
  const shared = {
    car,
    heightsM,
    terminalHeightM: analysis.terminalHeightM,
    // The transfer time the SIMULATOR uses, which is not always the one the closed form uses.
    // Comparing at anything other than the value actually in force compares two systems.
    passengerTransferS: car.passengerTransferS,
    draws: MONTE_CARLO_DRAWS,
    seed: 4_242,
  } as const;
  const low = kinematicRoundTrip({ ...shared, passengers: Math.max(1, lower) });
  const high = kinematicRoundTrip({ ...shared, passengers: Math.max(2, lower + 1) });
  const w = passengersFullStat.mean - lower;
  const lerp = (key: keyof KinematicRoundTrip): number => low[key] * (1 - w) + high[key] * w;

  return {
    caseSpec,
    isolated,
    analysis,
    matched,
    car,
    bracket,
    replications: seeds.length,
    allSaturated: saturatedReplications === seeds.length,
    saturatedReplications,
    measured: {
      roundTripS: statOf(roundTripFull),
      passengersPerTrip: passengersFullStat,
      stopsPerTrip: statOf(stopsFull),
      intervalS: statOf(intervals),
      percentPopulation5Min: statOf(capacities),
    },
    roundTripAllS: statOf(roundTripAll),
    passengersAllS: statOf(passengersAll),
    intervalCoV: statOf(covs),
    tripCountAll,
    tripCountFull,
    corrected: {
      roundTripS: lerp('roundTripS'),
      stops: lerp('stops'),
      flightS: lerp('flightS'),
      dwellS: lerp('dwellS'),
      fixedS: lerp('fixedS'),
    },
  };
}

/** Convenience: the completed breakdown in the shape {@link reconcileRoundTrip} consumes. */
export function completedOf(measurement: UpPeakMeasurement): {
  readonly flightS: number;
  readonly dwellS: number;
  readonly fixedS: number;
  readonly stops: number;
} {
  const { flightS, dwellS, fixedS, stops } = measurement.corrected;
  return { flightS, dwellS, fixedS, stops };
}

