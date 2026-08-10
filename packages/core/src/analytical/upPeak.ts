/**
 * Deriving closed-form up-peak terms from a resolved building.
 *
 * `roundTripTime.ts` is the arithmetic; this file is the bridge from `data/buildings/*.json`
 * to the seven scalars that arithmetic consumes. It is the only part of `analytical/` that
 * knows what a building is.
 *
 * ## What "independent oracle" means here, stated precisely because it narrowed
 *
 * This header used to say the file imports **types only**, and drew the independence claim from
 * that. It imports one value now — {@link findPassengerTransferS}, the config layer's reading of
 * `elevator-specs.json → timing.passengerTransferS` — and the claim is *stronger* for it rather
 * than weakened, so the sentence is corrected rather than deleted.
 *
 * The oracle's independence is about the **derivation**: no round-trip arithmetic, no kinematics,
 * no dwell model here is code the simulation also runs, so a bug in one cannot hide in the other.
 * A shared *reading of a reference constant* is the opposite kind of thing. `tp` is an input both
 * sides must agree on: if the closed form read 1.2 s where the simulator read 1.75 s, the two
 * would be describing different hardware and the comparison would be meaningless — which is why
 * `sim/simulation.test.ts` already pinned the two readings together while they were two copies.
 * One body is what that pin was asking for.
 *
 * Pure throughout: no fs, no RNG, no kernel, no mutation of the building.
 */

import { findPassengerTransferS } from '../config/resolveCar.js';
import type {
  BuildingType,
  ElevatorSpecs,
  FloorConfig,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedCar,
} from '../config/types.js';
import { roundTripTime } from './roundTripTime.js';
import {
  ANALYTICAL_DEFAULTS,
  ANALYTICAL_ERROR_CODES,
  AnalyticalError,
  IMPLAUSIBLE_PERCENT_POPULATION_5MIN,
  UP_PEAK_WARNING_CODES,
  type ResolvedRoundTripTerms,
  type StopTimeBreakdown,
  type UpPeakAnalysis,
  type UpPeakOptions,
  type UpPeakTerms,
  type UpPeakWarning,
} from './types.js';

/**
 * Tolerance for calling two floor heights or two populations "the same", in metres and in
 * persons respectively. Floor heights in the reference data are authored to 0.1 m, so
 * anything below a millimetre is float noise from repeated addition, not a real step.
 */
const SAMENESS_EPSILON = 1e-6;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function mean(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** True when every value sits within {@link SAMENESS_EPSILON} of the first. */
function allSame(values: readonly number[]): boolean {
  const [first] = values;
  if (first === undefined) return true;
  return values.every((value) => Math.abs(value - first) <= SAMENESS_EPSILON);
}

/**
 * `tp` for a building type, from `elevator-specs.json → timing.passengerTransferS`.
 *
 * **One line, because the body it used to hold was a second copy of
 * {@link findPassengerTransferS}** — the same `switch` over the same four cases, in a file that
 * must agree with the config layer to the last decimal or the oracle is checking the simulator
 * against different hardware. `sim/simulation.test.ts` pinned the two readings together, which
 * was the right guard for the wrong shape: it held two bodies in agreement where one body was
 * available. Adding a building type meant editing both, and forgetting one produced a divergence
 * that the pin would catch and the *reader* would not.
 *
 * Returns `undefined` for `mixed-use`, which the reference table has no row for — a mixed-use
 * tower's banks serve populations with different transfer behaviour (office 1.2 s, residential
 * 1.75 s), so there is no honest building-wide answer and the caller must state one per bank.
 */
export function passengerTransferSecondsFor(
  specs: ElevatorSpecs,
  buildingType: BuildingType,
): number | undefined {
  return findPassengerTransferS(specs, buildingType);
}

// ---------------------------------------------------------------------------
// Selection: bank, terminal, destinations
// ---------------------------------------------------------------------------

function selectBank(building: ResolvedBuilding, bankId: string | undefined): ResolvedBank {
  if (bankId !== undefined) {
    const found = building.banks.find((bank) => bank.id === bankId);
    if (found === undefined) {
      throw new AnalyticalError(
        ANALYTICAL_ERROR_CODES.unknownBank,
        `building "${building.id}" declares no bank "${bankId}". Banks: ${building.banks.map((bank) => bank.id).join(', ') || '(none)'}.`,
      );
    }
    return found;
  }

  const [only, ...rest] = building.banks;
  if (only === undefined) {
    throw new AnalyticalError(
      ANALYTICAL_ERROR_CODES.emptyGroup,
      `building "${building.id}" declares no banks, so there is no group to compute an interval for.`,
    );
  }
  if (rest.length > 0) {
    // Averaging across banks would be meaningless: each has its own zone, speed and
    // population, and an interval is a property of one group controller.
    throw new AnalyticalError(
      ANALYTICAL_ERROR_CODES.unknownBank,
      `building "${building.id}" has ${building.banks.length} banks; pass options.bankId to choose one. Banks: ${building.banks.map((bank) => bank.id).join(', ')}.`,
    );
  }
  return only;
}

/**
 * Choose the main terminal: the floor the up-peak round trip starts and ends at.
 *
 * The rule, in order:
 *
 * 1. `options.entranceFloorId`, if given. It must be served by the bank.
 * 2. Otherwise the **highest-index served floor flagged `isEntrance`** that still has at
 *    least one populated served floor above it. Highest rather than lowest because a
 *    building may declare several ground-level entrances — Midtown Office declares both the
 *    lobby (`G`, index 0) and the garage (`P1`, index −1) — and the classic up-peak loads at
 *    the main terminal, with anything below it out of scope. Taking `P1` would drag `G`
 *    into the served set as a zero-population destination and corrupt `N`.
 * 3. Otherwise the highest-index served floor flagged `isTransferFloor` with populated
 *    floors above it. This is how an upper local bank fed by a sky lobby is handled:
 *    Mixed-Use High-Rise's residential bank serves floors 31–60 and 31 is a transfer floor,
 *    not an entrance, but it is unambiguously that bank's terminal.
 *
 * The "populated floors above it" condition is what stops a sky lobby at the *top* of a
 * bank's range (the shuttle bank's floor 31) being mistaken for the terminal.
 */
function selectTerminal(
  building: ResolvedBuilding,
  bank: ResolvedBank,
  servedFloors: readonly FloorConfig[],
  entranceFloorId: string | undefined,
): FloorConfig {
  if (entranceFloorId !== undefined) {
    const found = servedFloors.find((floor) => floor.id === entranceFloorId);
    if (found === undefined) {
      throw new AnalyticalError(
        ANALYTICAL_ERROR_CODES.unknownTerminal,
        `floor "${entranceFloorId}" is not served by bank "${bank.id}" of building "${building.id}". Served floors: ${servedFloors.map((floor) => floor.id).join(', ')}.`,
      );
    }
    return found;
  }

  const hasPopulationAbove = (candidate: FloorConfig): boolean =>
    servedFloors.some((floor) => floor.index > candidate.index && floor.population > 0);

  const qualifying = servedFloors.filter(hasPopulationAbove);
  const entrances = qualifying.filter((floor) => floor.isEntrance === true);
  const transfers = qualifying.filter((floor) => floor.isTransferFloor === true);

  // servedFloors is ascending by index, so the last element is the highest.
  const chosen = entrances.at(-1) ?? transfers.at(-1);
  if (chosen === undefined) {
    throw new AnalyticalError(
      ANALYTICAL_ERROR_CODES.noTerminal,
      `bank "${bank.id}" of building "${building.id}" serves no floor flagged isEntrance or isTransferFloor with populated floors above it, so the closed form has no terminal to start the round trip from. Pass options.entranceFloorId to state one.`,
    );
  }
  return chosen;
}

/**
 * Choose the destination floors: served floors above the terminal that carry population.
 *
 * Zero-population floors are excluded, and that is deliberate rather than tidy-mindedness.
 * `N` enters both `S` and `H`; a plant room or an unoccupied sky lobby inside the bank's
 * range is never an up-peak destination, and counting it would dilute the destination
 * distribution and understate both the stop count and the reversal floor.
 *
 * `options.upperFloorIds` overrides the choice entirely — the escape hatch for a shuttle
 * bank, whose destinations are sky lobbies whose own `population` field is zero because
 * their traffic belongs to the floors above them.
 */
function selectUpperFloors(
  building: ResolvedBuilding,
  bank: ResolvedBank,
  servedFloors: readonly FloorConfig[],
  terminal: FloorConfig,
  upperFloorIds: readonly string[] | undefined,
): readonly FloorConfig[] {
  if (upperFloorIds !== undefined) {
    if (new Set(upperFloorIds).size !== upperFloorIds.length) {
      // A repeated id would inflate N and quietly change S and H. An oracle that returns
      // a wrong number is worse than one that refuses.
      throw new AnalyticalError(
        ANALYTICAL_ERROR_CODES.unknownUpperFloor,
        `options.upperFloorIds contains duplicates (${upperFloorIds.join(', ')}); each destination floor may appear once.`,
      );
    }
    const chosen = upperFloorIds.map((id) => {
      const found = servedFloors.find((floor) => floor.id === id);
      if (found === undefined) {
        throw new AnalyticalError(
          ANALYTICAL_ERROR_CODES.unknownUpperFloor,
          `floor "${id}" is not served by bank "${bank.id}" of building "${building.id}".`,
        );
      }
      if (found.index <= terminal.index) {
        throw new AnalyticalError(
          ANALYTICAL_ERROR_CODES.unknownUpperFloor,
          `floor "${id}" is at or below the terminal "${terminal.id}"; the up-peak closed form serves only floors above it.`,
        );
      }
      return found;
    });
    return [...chosen].sort((a, b) => a.index - b.index);
  }

  return servedFloors.filter((floor) => floor.index > terminal.index && floor.population > 0);
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Reduce a bank to the seven scalars the closed form consumes, plus a record of every way
 * the building strays from the model those scalars assume.
 *
 * ## What is read, and how
 *
 * | Term | Source |
 * |---|---|
 * | `N` | populated floors the bank serves above its terminal |
 * | `df` | mean floor-to-floor rise across those floors, from their authored heights |
 * | `tx` | terminal height to one `df` below the lowest served floor, over `v` |
 * | `v` | mean `ratedSpeedMps` of the bank's cars |
 * | `tv` | `df / v` — **at rated speed**, the classic simplification |
 * | `ts` | `doorOpenS + doorCloseS + motorStartDelayS + levelingSettleS` |
 * | `tp` | `options.passengerTransferS`, else `elevator-specs.json → timing.passengerTransferS[building.type]` — and the table has **no `mixed-use` row**, so on a mixed-use tower the option is not optional: this function throws `RangeError` without it |
 * | `P` | `capacityPersons × designLoadFactor`, **not rounded** |
 * | `L` | number of cars in the bank |
 * | `U` | population of the served floors above the terminal |
 *
 * ## `U` is a default, and for a shuttle it is the wrong one
 *
 * Summing `population` over the destination floors is right whenever those floors are where
 * the passengers are going. It is wrong whenever they are a transfer point: Mixed-Use
 * High-Rise's shuttle serves only `G` and the sky lobby at `31`, whose declared population
 * of 260 is its amenity occupants — while the shuttle also lifts all 754 residents of
 * floors 32–60, for a true `U` of 1014. The default reports **82.5 %** of population per
 * five minutes instead of **21.2 %**. `UP_PEAK_WARNING_CODES.destinationsAreTransferFloors`
 * fires on exactly this shape, and `analyzeUpPeak` adds `implausibleHandlingCapacity` when
 * the resulting `%POP` clears {@link IMPLAUSIBLE_PERCENT_POPULATION_5MIN}; the fix is
 * `options.servedPopulation`.
 *
 * **Those two figures are `tp`-dependent, and this docstring used to quote the wrong `tp`**
 * (`AGENT_STATUS.md` C20). It read *102.8 % … instead of 26.3 %*, which reproduces only at
 * `tp = 1.2 s` — a value **no car of that bank declares**. Every shuttle car in
 * `data/buildings/mixed-use-high-rise.json` authors `passengerTransferS: 1.75`, and the
 * building's own notes say why: the shuttle is the only route to floors 32–60, residents
 * are on it every trip, and understating `tp` understates the round trip in the optimistic
 * direction `CLAUDE.md` warns about. Re-measured through `analyzeUpPeak` rather than
 * transcribed:
 *
 * | `tp` | default `U` = 260 | stated `U` = 1014 | RTT | INT |
 * |---|---|---|---|---|
 * | 1.2 s (**not declared by any car here**) | 102.8 % | 26.3 % | 93.42 s | 23.36 s |
 * | **1.75 s (declared)** | **82.5 %** | **21.2 %** | 116.30 s | 29.08 s |
 *
 * The ratio is unchanged — `%POP` scales as `1 / U` and both columns move together with
 * `tp` — so the *point* the paragraph makes survives; only the numbers were from a bank
 * that does not exist. Both rows still clear
 * {@link IMPLAUSIBLE_PERCENT_POPULATION_5MIN} at the default `U`, which is what the
 * warning is for.
 *
 * ## `df` and `tx` together are exact
 *
 * `df` is taken as `(top − bottom) / (N − 1)`, the mean rise **within the served zone**,
 * and `tx` then places the terminal at its true height on that uniform grid. The result is
 * that `H·tv + tx` is the exact linear interpolation of the authored floor heights: at
 * `H = N` it reproduces the top floor's real height, at `H = 1` the lowest served floor's.
 * Taking `df` as `totalRise / N` instead — the more obvious reading of "average
 * floor-to-floor" — is off by ~0.1% on Midtown Office and much more on a zoned bank.
 *
 * ## `P` is not rounded
 *
 * `ResolvedCar.designCapacityPersons` is `floor(16 × 0.8) = 12`, which is right for the
 * simulator (it cannot board 0.8 of a person) and wrong here. `P` is an expectation over
 * many trips, so this uses `16 × 0.8 = 12.8`. The 6% difference is a known divergence, and
 * is listed as `fractional-capacity` in {@link CLOSED_FORM_ASSUMPTIONS}.
 *
 * @throws AnalyticalError if the bank cannot be modelled — unknown id, no terminal, no
 *   populated destination floors.
 * @throws RangeError if the derived geometry is degenerate, e.g. a served zone of zero
 *   height, or a `tp` that cannot be determined for a mixed-use building.
 */
export function deriveUpPeakTerms(
  building: ResolvedBuilding,
  specs: ElevatorSpecs,
  options: UpPeakOptions = {},
): UpPeakTerms {
  const warnings: UpPeakWarning[] = [];
  const bank = selectBank(building, options.bankId);

  const cars: readonly ResolvedCar[] = bank.cars;
  const [firstCar] = cars;
  if (firstCar === undefined) {
    throw new AnalyticalError(
      ANALYTICAL_ERROR_CODES.emptyGroup,
      `bank "${bank.id}" of building "${building.id}" declares no cars, so it has no interval.`,
    );
  }

  const served = new Set(bank.servesFloors);
  // building.floors is sorted ascending by index, so this preserves that order.
  const servedFloors = building.floors.filter((floor) => served.has(floor.id));

  const terminal = selectTerminal(building, bank, servedFloors, options.entranceFloorId);
  const upperFloors = selectUpperFloors(
    building,
    bank,
    servedFloors,
    terminal,
    options.upperFloorIds,
  );

  const floorsAboveTerminal = upperFloors.length;
  const bottom = upperFloors.at(0);
  const top = upperFloors.at(-1);
  if (bottom === undefined || top === undefined) {
    throw new AnalyticalError(
      ANALYTICAL_ERROR_CODES.noServedPopulation,
      `bank "${bank.id}" of building "${building.id}" serves no populated floor above its terminal "${terminal.id}", so there is no up-peak to analyse. A shuttle bank whose destinations are unpopulated sky lobbies needs options.upperFloorIds.`,
    );
  }

  // --- geometry ----------------------------------------------------------

  const derivedInterfloorM =
    floorsAboveTerminal > 1
      ? (top.heightM - bottom.heightM) / (floorsAboveTerminal - 1)
      : bottom.heightM - terminal.heightM;
  const interfloorDistanceM = options.interfloorDistanceM ?? derivedInterfloorM;
  if (!Number.isFinite(interfloorDistanceM) || interfloorDistanceM <= 0) {
    throw new RangeError(
      `bank "${bank.id}" of building "${building.id}": interfloor distance resolves to ${interfloorDistanceM} m. Floor heights must increase with floor index across the served zone.`,
    );
  }

  const expressRiseM =
    floorsAboveTerminal > 1 ? bottom.heightM - interfloorDistanceM - terminal.heightM : 0;

  const ratedSpeedMps =
    options.ratedSpeedMps ?? mean(cars.map((car) => car.ratedSpeedMps));
  if (!Number.isFinite(ratedSpeedMps) || ratedSpeedMps <= 0) {
    throw new RangeError(
      `bank "${bank.id}" of building "${building.id}": rated speed resolves to ${ratedSpeedMps} m/s.`,
    );
  }

  // --- stop time ---------------------------------------------------------

  const accelerationLossS =
    options.accelerationLossPerStopS ?? ANALYTICAL_DEFAULTS.accelerationLossPerStopS;
  const doorOpenS = mean(cars.map((car) => car.doorOpenS));
  const doorCloseS = mean(cars.map((car) => car.doorCloseS));
  const motorStartDelayS = mean(cars.map((car) => car.motorStartDelayS));
  const levelingSettleS = mean(cars.map((car) => car.levelingSettleS));
  const stopTime: StopTimeBreakdown = {
    doorOpenS,
    doorCloseS,
    motorStartDelayS,
    levelingSettleS,
    accelerationLossS,
    totalS: doorOpenS + doorCloseS + motorStartDelayS + levelingSettleS + accelerationLossS,
  };

  // --- payload -----------------------------------------------------------

  const ratedCapacityPersons = mean(cars.map((car) => car.capacityPersons));
  const designLoadFactor =
    options.designLoadFactor ?? mean(cars.map((car) => car.designLoadFactor));
  const passengersPerTrip = options.passengersPerTrip ?? ratedCapacityPersons * designLoadFactor;

  const passengerTransferS =
    options.passengerTransferS ?? passengerTransferSecondsFor(specs, building.type);
  if (passengerTransferS === undefined) {
    throw new RangeError(
      `building "${building.id}" is type "${building.type}", which elevator-specs.json → timing.passengerTransferS has no entry for. Pass options.passengerTransferS.`,
    );
  }

  const servedPopulation =
    options.servedPopulation ??
    upperFloors.reduce((total, floor) => total + floor.population, 0);

  // --- divergences from the model ----------------------------------------

  const servedEntrances = servedFloors.filter((floor) => floor.isEntrance === true);
  if (servedEntrances.length > 1) {
    warnings.push({
      code: UP_PEAK_WARNING_CODES.multipleEntrances,
      message: `bank "${bank.id}" serves ${servedEntrances.length} entrance floors (${servedEntrances.map((floor) => floor.id).join(', ')}); the closed form loads every passenger at "${terminal.id}" alone. Simulated round trips will be longer.`,
    });
  }

  if (!allSame(upperFloors.map((floor) => floor.population))) {
    warnings.push({
      code: UP_PEAK_WARNING_CODES.nonUniformFloorPopulations,
      message: `served floor populations are not uniform (${Math.min(...upperFloors.map((floor) => floor.population))}–${Math.max(...upperFloors.map((floor) => floor.population))} persons), but S and H assume every floor is an equally likely destination. S is maximised at uniform, so the stop term is over-charged.`,
    });
  }

  if (options.upperFloorIds === undefined) {
    const excluded = servedFloors.filter(
      (floor) => floor.index > terminal.index && floor.population === 0,
    );
    if (excluded.length > 0) {
      warnings.push({
        code: UP_PEAK_WARNING_CODES.unpopulatedFloorsExcluded,
        message: `${excluded.length} served floor(s) above the terminal carry no population (${excluded.map((floor) => floor.id).join(', ')}) and were excluded from N. They are not up-peak destinations, but the simulation may still stop there for other traffic.`,
      });
    }
  }

  if (floorsAboveTerminal > 2) {
    const gaps: number[] = [];
    for (let i = 1; i < upperFloors.length; i += 1) {
      const lower = upperFloors[i - 1];
      const higher = upperFloors[i];
      if (lower !== undefined && higher !== undefined) gaps.push(higher.heightM - lower.heightM);
    }
    if (!allSame(gaps)) {
      warnings.push({
        code: UP_PEAK_WARNING_CODES.nonUniformInterfloorDistance,
        message: `floor-to-floor rise varies across the served zone (${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)} m); df is its mean, ${interfloorDistanceM.toFixed(3)} m.`,
      });
    }
  }

  const heterogeneous =
    !allSame(cars.map((car) => car.ratedSpeedMps)) ||
    !allSame(cars.map((car) => car.capacityPersons)) ||
    !allSame(cars.map((car) => car.doorOpenS + car.doorCloseS)) ||
    !allSame(cars.map((car) => car.motorStartDelayS + car.levelingSettleS));
  if (heterogeneous) {
    warnings.push({
      code: UP_PEAK_WARNING_CODES.heterogeneousGroup,
      message: `bank "${bank.id}" mixes car specifications; the closed form models one representative car, so speed, capacity and timings are averaged across the ${cars.length} cars.`,
    });
  }

  // **Kept, and for a stronger reason than it had.** `RTT = 2(H·tv + tx) + (S+1)·ts + 2·P·tp` is
  // the *single-deck* Barney/CIBSE derivation, and simulating the decks did not give the closed
  // form a double-deck one — that is a separate derivation this project does not implement. Until
  // Phase 6 the simulator shared the closed form's simplification, so the two agreed by being
  // wrong together; now the simulator makes one stop where this expression counts two, and they
  // disagree *on purpose*. A warning that was advisory is therefore load-bearing: a residual
  // measured against this bank is a residual against a model of different hardware.
  if (cars.some((car) => car.doubleDeck)) {
    warnings.push({
      code: UP_PEAK_WARNING_CODES.doubleDeck,
      message: `bank "${bank.id}" contains double-deck cars. This closed form is the single-deck round trip and treats them as one car body of the combined capacity, which understates stops and overstates handling capacity; double-deck has its own formulation, which is not implemented. The simulator does model the decks, so a simulated round trip for this bank is deliberately not comparable with this expression.`,
    });
  }

  if (Math.abs(expressRiseM) > SAMENESS_EPSILON) {
    warnings.push({
      code: UP_PEAK_WARNING_CODES.expressZone,
      message: `bank "${bank.id}" runs ${expressRiseM.toFixed(1)} m below its served zone before its first possible stop, worth ${(expressRiseM / ratedSpeedMps).toFixed(2)} s each way. Carried as the tx term, which the textbook expression omits.`,
    });
  }

  // A destination that is itself a transfer point means this group does not deliver its
  // passengers to their final floor; it hands them to another bank. `U` then has to be the
  // population *beyond* the transfer, which no field on the destination floor states.
  const transferDestinations = upperFloors.filter((floor) => floor.isTransferFloor === true);
  const otherBanksServingDestinations = building.banks.filter(
    (other) =>
      other.id !== bank.id &&
      upperFloors.some((floor) => other.servesFloors.includes(floor.id)),
  );
  if (transferDestinations.length > 0 || otherBanksServingDestinations.length > 0) {
    const observations: string[] = [];
    if (transferDestinations.length > 0) {
      observations.push(
        `destination floor(s) ${transferDestinations.map((floor) => floor.id).join(', ')} are flagged isTransferFloor`,
      );
    }
    if (otherBanksServingDestinations.length > 0) {
      observations.push(
        `destination floors are also served by bank(s) ${otherBanksServingDestinations.map((other) => other.id).join(', ')}`,
      );
    }
    const provenance =
      options.servedPopulation === undefined
        ? `U defaults to those floors' own population (${servedPopulation}), which is almost certainly not the population this group lifts: a shuttle to a sky lobby carries everyone bound for the floors beyond it, not just the lobby's own occupants. Pass options.servedPopulation, or read %POP as meaningless.`
        : `U was stated explicitly as ${servedPopulation}, which is the right way to handle this; the divergence is recorded because the group still serves onward journeys the single-leg round trip does not model.`;
    warnings.push({
      code: UP_PEAK_WARNING_CODES.destinationsAreTransferFloors,
      message: `bank "${bank.id}": ${observations.join(', and ')}. ${provenance}`,
    });
  }

  if (passengersPerTrip >= floorsAboveTerminal) {
    warnings.push({
      code: UP_PEAK_WARNING_CODES.saturatedStops,
      message: `P (${passengersPerTrip.toFixed(1)}) is at least N (${floorsAboveTerminal}), so the car stops at most of the zone on every trip and S saturates towards N. RTT becomes insensitive to load, and so does any conclusion drawn from varying it.`,
    });
  }

  const roundTripTerms: ResolvedRoundTripTerms = {
    floorsAboveTerminal,
    passengersPerTrip,
    singleFloorTransitS: interfloorDistanceM / ratedSpeedMps,
    stopTimeLossS: stopTime.totalS,
    passengerTransferS,
    carsInGroup: cars.length,
    population: servedPopulation,
    expressJumpS: expressRiseM / ratedSpeedMps,
  };

  return {
    buildingId: building.id,
    bankId: bank.id,
    terminalFloorId: terminal.id,
    terminalHeightM: terminal.heightM,
    upperFloorIds: upperFloors.map((floor) => floor.id),
    floorsAboveTerminal,
    interfloorDistanceM,
    expressRiseM,
    ratedSpeedMps,
    stopTime,
    ratedCapacityPersons,
    designLoadFactor,
    servedPopulation,
    buildingPopulation: building.totalPopulation,
    roundTripTerms,
    warnings,
  };
}

/**
 * Derive the terms for one bank under up-peak and evaluate the closed form on them.
 *
 * The convenience entry point, and the one Phase 2's validation calls. `deriveUpPeakTerms`
 * is the seam: call it directly to inspect or amend a term before evaluating.
 *
 * ```ts
 * const config = await loadConfig('data');
 * const midtown = config.buildingsById.get('midtown-office');
 * const analysis = analyzeUpPeak(midtown, config.elevatorSpecs);
 * analysis.result.intervalS;             // 37.39 s
 * analysis.result.handlingCapacity5Min;  // 102.7 persons / 5 min
 * analysis.warnings;                     // two entrances, unpopulated floor excluded, ...
 * ```
 *
 * ## One warning is raised here rather than in the derivation
 *
 * `implausibleHandlingCapacity` compares `%POP` against
 * {@link IMPLAUSIBLE_PERCENT_POPULATION_5MIN}, and `%POP` is not known until the closed form
 * has been evaluated — so `deriveUpPeakTerms` cannot raise it and this function appends it.
 * `analysis.warnings` is therefore a superset of `deriveUpPeakTerms(...).warnings`, never a
 * different set. It is the output-side detector for the same defect
 * `destinationsAreTransferFloors` catches on the input side: a `U` that is not the
 * population the group actually lifts.
 *
 * Pure. Same inputs, same outputs, forever — it is a test oracle, and an oracle that could
 * drift would be worthless.
 */
export function analyzeUpPeak(
  building: ResolvedBuilding,
  specs: ElevatorSpecs,
  options: UpPeakOptions = {},
): UpPeakAnalysis {
  const terms = deriveUpPeakTerms(building, specs, options);
  const result = roundTripTime(terms.roundTripTerms);

  if (result.percentPopulation5Min <= IMPLAUSIBLE_PERCENT_POPULATION_5MIN) {
    return { ...terms, result };
  }

  const warnings: readonly UpPeakWarning[] = [
    ...terms.warnings,
    {
      code: UP_PEAK_WARNING_CODES.implausibleHandlingCapacity,
      message: `bank "${terms.bankId}" of building "${terms.buildingId}" reports ${result.percentPopulation5Min.toFixed(1)} % of population handled per 5 minutes against U = ${terms.servedPopulation}, above the ${IMPLAUSIBLE_PERCENT_POPULATION_5MIN} % sanity bound. Demand targets run 3–17 % (docs/03-traffic-and-statistics.md Part 1), so this is a U that is too small far more often than it is a genuinely over-elevatored bank. Check whether the destination floors feed further banks, and state options.servedPopulation.`,
    },
  ];
  return { ...terms, warnings, result };
}
