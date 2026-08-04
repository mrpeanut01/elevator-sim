/**
 * Resolution of a car against its elevator class.
 *
 * A `CarConfig` names a `spec` (a class in `data/elevator-specs.json`) and overrides only
 * what differs. Everything downstream — kinematics, doors, load sensor — consumes the
 * `ResolvedCar` and never has to know that class inheritance existed.
 *
 * Units stay SI. `ratedLoadLb` keeps its imperial suffix; the kilogram value is a
 * separately named field, never a silent conversion of the same name.
 *
 * One field is not a property of the hardware at all: `passengerTransferS` is a property of
 * the *building* (office 1.2 s, hotel 1.5 s, residential 1.75 s), so it is resolved from
 * `ResolveCarOptions.buildingType` and is absent when the caller does not say which building
 * the car belongs to. Absent, never defaulted — a car resolved with no building in view must
 * not silently claim the office figure. See {@link findPassengerTransferS}.
 */

import { ConfigError, ISSUE_CODES, parseLoadDivisor } from './schema.js';
import type {
  BuildingType,
  CarConfig,
  DoorTiming,
  ElevatorSpec,
  ElevatorSpecs,
  ResolvedCar,
} from './types.js';

/** Exact definition of the international pound, for loads with no standard-size entry. */
const KG_PER_LB = 0.45359237;

export interface ResolveCarOptions {
  /** File name used in error messages. */
  readonly file?: string | undefined;
  /** Path to the car within that file, e.g. `banks[0].cars[2]`. */
  readonly path?: string | undefined;
  /**
   * The type of the building this car is being resolved for.
   *
   * Supplying it resolves `passengerTransferS` from
   * `specs.timing.passengerTransferS[buildingType]`. Omitting it leaves that field absent
   * rather than defaulted — see {@link ResolvedCar.passengerTransferS}.
   */
  readonly buildingType?: BuildingType | undefined;
  /** Building id, for the error message when the type has no transfer time. */
  readonly buildingId?: string | undefined;
}

/** Look up an elevator class by id. */
export function findElevatorSpec(specs: ElevatorSpecs, id: string): ElevatorSpec | undefined {
  return specs.classes.find((elevatorClass) => elevatorClass.id === id);
}

/**
 * `tp` for a building type, from `elevator-specs.json → timing.passengerTransferS`.
 *
 * `undefined` for `mixed-use`, which the reference table has no row for on purpose: a mixed
 * tower's banks serve populations that transfer at different speeds (office 1.2 s against
 * residential 1.75 s), so there is no honest building-wide answer and the value has to be
 * stated per car. `undefined` is therefore "nobody has said", never "assume office" — the
 * bug this function exists to make impossible was a silent fall-through to 1.2 s on every
 * residential and hotel building in the repository.
 *
 * The table is read from data, not hard-coded, so the value stays tunable without a rebuild
 * (CLAUDE.md invariant 7). `analytical/upPeak.ts` reads the same table for the closed-form
 * oracle; `sim/simulation.test.ts` pins the two readings together so they cannot drift.
 */
export function findPassengerTransferS(
  specs: ElevatorSpecs,
  buildingType: BuildingType,
): number | undefined {
  const table = specs.timing.passengerTransferS;
  switch (buildingType) {
    case 'office':
      return table.office;
    case 'residential':
      return table.residential;
    case 'hotel':
      return table.hotel;
    case 'hospital':
      // Longest of the four, and the only one whose population is not all ambulant: a trolley with
      // an attendant is not a person stepping in. `st-jude-hospital`'s bed bank overrides it again
      // per car, which is how a building says its two banks carry different traffic.
      return table.hospital;
    case 'mixed-use':
      return undefined;
  }
}

/**
 * Persons at rated load, using the `personsPerRatedLoadUS` convention from the specs
 * file (`ratedLoadLb / 150`). Truncated: a fractional person cannot board.
 */
export function personsAtRatedLoad(ratedLoadLb: number, divisorLbPerPerson: number): number {
  return Math.floor(ratedLoadLb / divisorLbPerPerson);
}

/**
 * Merge a car with its class defaults. Explicit car fields win; anything omitted falls
 * back to the class typical (or, for rated load, to the low end of the class capacity
 * range — the conservative choice, since overstating capacity flatters the simulation).
 *
 * Pure: no wall-clock, no RNG, no mutation of either input.
 *
 * @throws ConfigError if the car references an unknown class or door type.
 */
export function resolveCar(
  car: CarConfig,
  specs: ElevatorSpecs,
  options: ResolveCarOptions = {},
): ResolvedCar {
  const file = options.file ?? '<building config>';
  const path = options.path ?? `cars[${car.id}]`;

  const spec = findElevatorSpec(specs, car.spec);
  if (spec === undefined) {
    const known = specs.classes.map((elevatorClass) => elevatorClass.id).join(', ');
    throw new ConfigError(
      [
        {
          file,
          path: `${path}.spec`,
          message: `unknown elevator class "${car.spec}" for car "${car.id}". Declared classes: ${known}.`,
          code: ISSUE_CODES.unknownSpec,
        },
      ],
      { summary: 'Cannot resolve car against its elevator class: 1 problem' },
    );
  }

  const doorType = car.doorType ?? 'centerOpening';
  // Annotated: the type says this key exists, but a hand-built `ElevatorSpecs` that never
  // went through the schema can still be missing it, and the message must be actionable.
  const doorTiming: DoorTiming | undefined = specs.doors[doorType];
  if (doorTiming === undefined) {
    throw new ConfigError(
      [
        {
          file,
          path: `${path}.doorType`,
          message: `door type "${doorType}" has no timings in elevator-specs.json (doors.${doorType}).`,
          code: ISSUE_CODES.unknownDoorType,
        },
      ],
      { summary: 'Cannot resolve car doors: 1 problem' },
    );
  }

  const divisor = parseLoadDivisor(specs.conventions.personsPerRatedLoadUS, true);
  if (divisor === undefined) {
    throw new ConfigError(
      [
        {
          file,
          path: 'conventions.personsPerRatedLoadUS',
          message: `cannot read a persons-per-load divisor from "${specs.conventions.personsPerRatedLoadUS}"; expected the form "ratedLoadLb / 150".`,
          code: ISSUE_CODES.invalidConvention,
        },
      ],
      { summary: 'Cannot resolve car capacity: 1 problem' },
    );
  }

  const doubleDeck = car.doubleDeck === true;
  if (doubleDeck && car.deckSeparationM === undefined) {
    throw new ConfigError(
      [
        {
          file,
          path: `${path}.deckSeparationM`,
          message: `car "${car.id}" is doubleDeck but declares no deckSeparationM. The deck spacing determines which floor pairs the car can serve.`,
          code: ISSUE_CODES.deckConfiguration,
        },
      ],
      { summary: 'Cannot resolve a double-deck car: 1 problem' },
    );
  }
  if (!doubleDeck && (car.deckSeparationM !== undefined || car.ratedLoadLbPerDeck !== undefined)) {
    throw new ConfigError(
      [
        {
          file,
          path: `${path}.${car.ratedLoadLbPerDeck === undefined ? 'deckSeparationM' : 'ratedLoadLbPerDeck'}`,
          message: `car "${car.id}" declares a per-deck field without "doubleDeck": true. Set doubleDeck, or drop the field.`,
          code: ISSUE_CODES.deckConfiguration,
        },
      ],
      { summary: 'Cannot resolve a single-deck car: 1 problem' },
    );
  }

  // Transfer time: the car's own value first, else the building type's row in the reference
  // table. A type the table has no row for is a hard error and not the office value — the
  // whole defect this resolves was a silent fall-through to 1.2 s on residential buildings.
  const buildingType = options.buildingType;
  let passengerTransferS = car.passengerTransferS;
  if (passengerTransferS === undefined && buildingType !== undefined) {
    passengerTransferS = findPassengerTransferS(specs, buildingType);
    if (typeof passengerTransferS !== 'number' || !Number.isFinite(passengerTransferS)) {
      const building = options.buildingId ?? '<building>';
      throw new ConfigError(
        [
          {
            file,
            path: `${path}.passengerTransferS`,
            message: `building "${building}" is type "${buildingType}", which elevator-specs.json → timing.passengerTransferS has no entry for, and car "${car.id}" declares no passengerTransferS. Declare one on the car (seconds per passenger per direction: office 1.2, hotel 1.5, residential 1.75), or add the type to the reference table. Refusing to default: the office value on a residential car understates the round trip by about 6 %.`,
            code: ISSUE_CODES.missingPassengerTransfer,
          },
        ],
        { summary: 'Cannot resolve the car passenger transfer time: 1 problem' },
      );
    }
  }

  const ratedLoadLb = car.ratedLoadLb ?? spec.capacityLbRange[0];
  const standardSize = specs.capacities.find((entry) => entry.ratedLoadLb === ratedLoadLb);
  const designLoadFactor = specs.conventions.designLoadFactor;
  const capacityPersons = personsAtRatedLoad(ratedLoadLb, divisor);

  // Per-deck rating defaults to half the whole-car rating, which is what the reference
  // data does explicitly; persons per deck follows the same lb-per-person convention.
  const ratedLoadLbPerDeck = doubleDeck
    ? (car.ratedLoadLbPerDeck ?? ratedLoadLb / 2)
    : undefined;
  const capacityPersonsPerDeck =
    ratedLoadLbPerDeck === undefined
      ? undefined
      : personsAtRatedLoad(ratedLoadLbPerDeck, divisor);

  return {
    id: car.id,
    spec: spec.id,
    // The same default `Car` applies to an absent `CarInit.mode`, stated once here so that
    // every consumer of a `ResolvedCar` — the runner, a report, the analytical path — reads one
    // answer instead of each re-deriving it. Unlike `passengerTransferS` there is a safe
    // default, so this is resolved rather than left absent.
    mode: car.mode ?? 'in-service',
    ratedSpeedMps: car.ratedSpeedMps ?? spec.ratedSpeedMps.typical,
    acceleration: car.acceleration ?? spec.acceleration.typical,
    jerk: car.jerk ?? spec.jerk.typical,
    ratedLoadLb,
    // Standard car sizes are nominal, not conversions: 2500 lb is a 1150 kg car, not
    // 1134 kg. Prefer the reference table, convert exactly only for non-standard loads.
    ratedLoadKg: standardSize?.ratedLoadKg ?? Math.round(ratedLoadLb * KG_PER_LB),
    capacityPersons,
    // Cars fill to 80% of rated capacity, not 100% (CLAUDE.md modeling rules).
    designCapacityPersons: Math.floor(capacityPersons * designLoadFactor),
    designLoadFactor,
    doorType,
    doorOpenS: car.doorOpenS ?? doorTiming.openS,
    doorCloseS: car.doorCloseS ?? doorTiming.closeS,
    dwellCarCallS: car.dwellCarCallS ?? specs.doors.dwellCarCallS.typical,
    dwellHallCallS: car.dwellHallCallS ?? specs.doors.dwellHallCallS.typical,
    motorStartDelayS: car.motorStartDelayS ?? specs.timing.motorStartDelayS,
    levelingSettleS: car.levelingSettleS ?? specs.timing.levelingSettleS.typical,
    ...(passengerTransferS === undefined ? {} : { passengerTransferS }),
    doubleDeck,
    ...(car.deckSeparationM === undefined ? {} : { deckSeparationM: car.deckSeparationM }),
    ...(ratedLoadLbPerDeck === undefined ? {} : { ratedLoadLbPerDeck }),
    ...(capacityPersonsPerDeck === undefined
      ? {}
      : {
          capacityPersonsPerDeck,
          designCapacityPersonsPerDeck: Math.floor(capacityPersonsPerDeck * designLoadFactor),
        }),
  };
}
