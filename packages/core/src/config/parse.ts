/**
 * Validation and cross-referencing of already-parsed reference data.
 *
 * Everything here is pure: it takes plain JavaScript objects and returns resolved ones, or
 * throws a `ConfigError`. **This module must never import `node:` anything.** Reading the
 * files is `loader.ts`'s job, and keeping the two apart is what lets a browser build
 * (Phase 4's viewer) import `parseBuilding`/`resolveBuilding` without dragging `node:fs`
 * into its module graph — a guarantee `parse.test.ts` enforces by walking this file's
 * static import graph.
 *
 * Two rules govern the diagnostics:
 *
 * 1. **Everything wrong is reported at once**, located by file and JSON path. A caller
 *    fixing a building config should not have to re-run the loader once per typo.
 * 2. **Errors mean unusable, warnings mean suspicious.** Anything that would make the
 *    simulation silently model the wrong building is an error (an unknown elevator class,
 *    a bank serving a floor that does not exist, a shaft whose heights disagree with its
 *    floor order). Anything advisory — a car outside the reference envelope for its class —
 *    is a warning carried on the result.
 */

import type { ZodError } from 'zod';

import { expandFloors } from './expandFloors.js';
import { findElevatorSpec, resolveCar } from './resolveCar.js';
import {
  ConfigError,
  ISSUE_CODES,
  WARNING_CODES,
  buildingConfigSchema,
  dispatcherProfilesSchema,
  elevatorSpecsSchema,
  issuesFromZodError,
  trafficProfilesSchema,
} from './schema.js';
import type {
  BuildingConfig,
  ConfigIssue,
  ConfigWarning,
  DispatcherProfiles,
  ElevatorSpec,
  ElevatorSpecs,
  FloorConfig,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedCar,
  ResolvedServiceEvent,
  TrafficProfiles,
} from './types.js';

/** Layout of a data directory. */
export const DATA_FILES = {
  elevatorSpecs: 'elevator-specs.json',
  trafficProfiles: 'traffic-profiles.json',
  dispatcherProfiles: 'dispatcher-profiles.json',
  buildingsDir: 'buildings',
} as const;

/** Shared by the missing-file and empty-directory diagnostics in `loader.ts`. */
export const LAYOUT_HINT = `Expected the data directory to contain ${DATA_FILES.elevatorSpecs}, ${DATA_FILES.trafficProfiles}, ${DATA_FILES.dispatcherProfiles} and ${DATA_FILES.buildingsDir}/*.json.`;

const BUILDING_HINT = 'See data/buildings/README.md for the building schema.';

/** Metres/pounds are authored to one or two decimals; this absorbs binary-float dust. */
const TOLERANCE = 1e-6;

/** Render a list of valid ids without producing a thousand-character error line. */
function formatKnown(ids: readonly string[], limit = 24): string {
  if (ids.length === 0) return '(none declared)';
  if (ids.length <= limit) return ids.join(', ');
  return `${ids.slice(0, limit).join(', ')}, ... (${ids.length} total)`;
}

/** Turn a zod failure into a located, actionable `ConfigError`. */
function schemaError(error: ZodError, file: string, hint: string): ConfigError {
  const issues = issuesFromZodError(error, file);
  return new ConfigError(issues, {
    summary: `Invalid config in ${file}: ${issues.length} problem${issues.length === 1 ? '' : 's'}`,
    hint,
  });
}

/** Validate an already-parsed `elevator-specs.json`. */
export function parseElevatorSpecs(
  data: unknown,
  file: string = DATA_FILES.elevatorSpecs,
): ElevatorSpecs {
  const result = elevatorSpecsSchema.safeParse(data);
  if (!result.success) throw schemaError(result.error, file, 'See docs/02-elevator-reference.md.');
  return result.data;
}

/** Validate an already-parsed `traffic-profiles.json`. */
export function parseTrafficProfiles(
  data: unknown,
  file: string = DATA_FILES.trafficProfiles,
): TrafficProfiles {
  const result = trafficProfilesSchema.safeParse(data);
  if (!result.success) {
    throw schemaError(result.error, file, 'See docs/03-traffic-and-statistics.md.');
  }
  return result.data;
}

/** Validate an already-parsed `dispatcher-profiles.json`. */
export function parseDispatcherProfiles(
  data: unknown,
  file: string = DATA_FILES.dispatcherProfiles,
): DispatcherProfiles {
  const result = dispatcherProfilesSchema.safeParse(data);
  if (!result.success) {
    throw schemaError(result.error, file, 'See docs/06-parameterization-and-tuning.md.');
  }
  return result.data;
}

/** Validate an already-parsed building config. Does not cross-reference other files. */
export function parseBuilding(data: unknown, file: string = '<building config>'): BuildingConfig {
  const result = buildingConfigSchema.safeParse(data);
  if (!result.success) throw schemaError(result.error, file, BUILDING_HINT);
  return result.data;
}

export interface ResolveBuildingOptions {
  /** File name used in diagnostics. */
  readonly file?: string | undefined;
  /**
   * Valid traffic-profile ids. When supplied, `trafficProfile` is checked against it;
   * omit when resolving a building in isolation.
   */
  readonly trafficProfileIds?: ReadonlySet<string> | undefined;
}

/**
 * Expand floors, resolve cars against their classes, and check every intra-building
 * cross-reference. Pure apart from reading the two config objects handed to it.
 *
 * @throws ConfigError listing every problem found in the building.
 */
export function resolveBuilding(
  building: BuildingConfig,
  specs: ElevatorSpecs,
  options: ResolveBuildingOptions = {},
): ResolvedBuilding {
  const file = options.file ?? '<building config>';
  const issues: ConfigIssue[] = [];
  const warnings: ConfigWarning[] = [];
  const addIssue = (path: string, message: string, code: string): void => {
    issues.push({ file, path, message, code });
  };
  const addWarning = (path: string, message: string, code: string): void => {
    warnings.push({ file, path, message, code });
  };

  let floors: readonly FloorConfig[] = [];
  try {
    floors = expandFloors(building, { file });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    issues.push(...error.issues);
  }

  // A building carries two orderings of the same shaft: `index` is what the dispatcher
  // means by "up", `heightM` is the distance the car physically travels. If they
  // disagree, travel times go negative and every direction-reversal cost term fires on
  // the wrong leg — the simulation runs and models a building that cannot exist. `floors`
  // is already sorted ascending by index, so adjacent pairs are the whole check.
  let below: FloorConfig | undefined;
  for (const floor of floors) {
    if (below !== undefined && floor.heightM <= below.heightM) {
      const relation =
        floor.heightM === below.heightM
          ? `the same height as floor "${below.id}" (index ${below.index})`
          : `below floor "${below.id}" (index ${below.index}), which sits at ${below.heightM} m`;
      addIssue(
        `floors["${floor.id}"].heightM`,
        `floor "${floor.id}" (index ${floor.index}) sits at ${floor.heightM} m, ${relation}. heightM must increase strictly with index: index is the shaft order the dispatcher travels in, heightM is the distance it travels.`,
        ISSUE_CODES.floorHeightOrder,
      );
    }
    below = floor;
  }

  const floorsById = new Map<string, FloorConfig>();
  const floorsByIndex = new Map<number, FloorConfig>();
  for (const floor of floors) {
    floorsById.set(floor.id, floor);
    floorsByIndex.set(floor.index, floor);
  }
  const knownFloorIds = [...floorsById.keys()];
  const entranceFloors = floors.filter((floor) => floor.isEntrance === true);
  const transferFloors = floors.filter((floor) => floor.isTransferFloor === true);

  if (floors.length > 0 && entranceFloors.length === 0) {
    addWarning(
      'floors',
      'no floor is flagged isEntrance, so no incoming traffic can be generated for this building.',
      WARNING_CODES.noEntranceFloor,
    );
  }

  const totalPopulation = floors.reduce((sum, floor) => sum + floor.population, 0);
  if (
    building.totalPopulation !== undefined &&
    floors.length > 0 &&
    Math.abs(building.totalPopulation - totalPopulation) > 0.5
  ) {
    addWarning(
      'totalPopulation',
      `declared totalPopulation ${building.totalPopulation} does not match the sum of floor populations (${totalPopulation}). The floor sum is used.`,
      WARNING_CODES.populationMismatch,
    );
  }

  const { trafficProfileIds } = options;
  if (trafficProfileIds !== undefined) {
    if (!trafficProfileIds.has(building.trafficProfile)) {
      addIssue(
        'trafficProfile',
        `unknown traffic profile "${building.trafficProfile}". Declared profiles in ${DATA_FILES.trafficProfiles}: ${formatKnown([...trafficProfileIds])}.`,
        ISSUE_CODES.unknownTrafficProfile,
      );
    }
    // Per-floor overrides: a mixed-use tower runs several profiles at once. The path
    // names the floor id because the floor may have come from a floorRange.
    for (const floor of floors) {
      if (floor.trafficProfile === undefined || trafficProfileIds.has(floor.trafficProfile)) {
        continue;
      }
      addIssue(
        `floors["${floor.id}"].trafficProfile`,
        `floor "${floor.id}" overrides its traffic profile to "${floor.trafficProfile}", which is not declared in ${DATA_FILES.trafficProfiles}. Declared profiles: ${formatKnown([...trafficProfileIds])}.`,
        ISSUE_CODES.unknownTrafficProfile,
      );
    }
  }

  const banks: ResolvedBank[] = [];
  building.banks.forEach((bank, bankIndex) => {
    const at = `banks[${bankIndex}]`;

    /*
     * A bank is a group of cars. With none, `servesFloors` is a service claim with no shaft
     * behind it — and nothing downstream said so. `Bank.fromConfig` builds it, `carCount` is 0,
     * the dispatcher finds no eligible car, and the run *completes and reports*. `awtIsValid`
     * does not save it: its censoring and abandonment grounds are thresholds, so a carless bank
     * that strands less than the 5 % censoring limit publishes a mean over the passengers some
     * *other* bank happened to serve. Measured on a seven-floor residential tower whose top
     * floor was served only by a carless bank, ten of twelve seeds came back `awtIsValid: true`,
     * two of them with passengers in the reporting window who were never served at all.
     *
     * `bankConfigSchema` already refuses `cars: []`, so a building read from a file never
     * reaches here empty. This is for the other callers: `resolveBuilding` is a public entry
     * point the editor, the fixtures and the fuzzers hand hand-built objects to (and § D67 makes
     * "`resolveBuilding` accepted it" the editor's whole definition of valid), and it was the one
     * gate that accepted what the schema rejects. `deriveUpPeakTerms` has always thrown
     * `emptyGroup` for exactly this bank; this is the same verdict, two stages earlier.
     *
     * Authored `bank.cars` rather than the resolved list, so a bank whose cars all fail to
     * resolve reports those failures and not this one on top of them.
     */
    if (bank.cars.length === 0) {
      addIssue(
        `${at}.cars`,
        `bank "${bank.id}" declares no cars, so nothing serves the ${bank.servesFloors.length} floors it lists. A bank is a group of cars: with none, the run strands every passenger whose only bank this is and still reports a mean over the rest, and the closed form has no interval for a group of zero. To stop service without deleting the bank, set its cars' "mode" to "out-of-service" or schedule a serviceEvent; to remove the service, remove the bank.`,
        ISSUE_CODES.emptyBank,
      );
    }

    const servedFloors: FloorConfig[] = [];
    const seenServed = new Set<string>();
    bank.servesFloors.forEach((floorId, floorIndex) => {
      if (seenServed.has(floorId)) {
        addIssue(
          `${at}.servesFloors[${floorIndex}]`,
          `floor "${floorId}" is listed twice in bank "${bank.id}".`,
          ISSUE_CODES.duplicateId,
        );
        return;
      }
      seenServed.add(floorId);
      const floor = floorsById.get(floorId);
      if (floor === undefined) {
        if (floors.length > 0) {
          addIssue(
            `${at}.servesFloors[${floorIndex}]`,
            `bank "${bank.id}" serves floor "${floorId}", which this building does not declare. Known floor ids: ${formatKnown(knownFloorIds)}.`,
            ISSUE_CODES.unknownFloor,
          );
        }
        return;
      }
      servedFloors.push(floor);
    });

    // Double-deck: `servesFloors` is the flattened union of `servesFloorPairs`, and each
    // pair must be exactly one deck-separation apart or the car cannot open on both.
    const pairs = bank.servesFloorPairs ?? [];
    pairs.forEach((pair, pairIndex) => {
      const pairPath = `${at}.servesFloorPairs[${pairIndex}]`;
      const [lowerId, upperId] = pair;
      const lower = floorsById.get(lowerId);
      const upper = floorsById.get(upperId);
      if (lower === undefined || upper === undefined) {
        if (floors.length > 0) {
          addIssue(
            pairPath,
            `bank "${bank.id}" pairs floors "${lowerId}" and "${upperId}", but this building does not declare ${lower === undefined ? `"${lowerId}"` : `"${upperId}"`}. Known floor ids: ${formatKnown(knownFloorIds)}.`,
            ISSUE_CODES.unknownFloor,
          );
        }
        return;
      }
      for (const [position, id] of [
        ['lower', lowerId],
        ['upper', upperId],
      ] as const) {
        if (seenServed.has(id)) continue;
        addIssue(
          pairPath,
          `the ${position} deck floor "${id}" is not listed in servesFloors for bank "${bank.id}". servesFloors is the flattened union of servesFloorPairs.`,
          ISSUE_CODES.floorPair,
        );
      }
      if (upper.heightM <= lower.heightM) {
        addIssue(
          pairPath,
          `pair ["${lowerId}", "${upperId}"] is not ordered: the first element is the lower deck, but "${upperId}" sits at ${upper.heightM} m and "${lowerId}" at ${lower.heightM} m.`,
          ISSUE_CODES.floorPair,
        );
      }
    });

    const cars: ResolvedCar[] = [];
    /** Distinct classes in this bank; the rise/floor-count checks are per class, not per car. */
    const usedSpecs = new Map<string, ElevatorSpec>();
    bank.cars.forEach((car, carIndex) => {
      const carPath = `${at}.cars[${carIndex}]`;
      let resolved: ResolvedCar;
      try {
        // The building type is passed so `passengerTransferS` is resolved *here*, at the config
        // layer, and not left for each consumer to re-derive. Omitting it was a real defect:
        // every `ResolvedCar` `loadConfig` returned had the field absent, so the only thing that
        // knew a residential car transfers at 1.75 s was `Simulation`, and any other consumer —
        // an optimizer, a report, the analytical path — silently got nothing instead of the
        // `missing-passenger-transfer` error that exists to stop exactly that.
        resolved = resolveCar(car, specs, {
          file,
          path: carPath,
          buildingType: building.type,
          buildingId: building.id,
        });
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        issues.push(...error.issues);
        return;
      }
      cars.push(resolved);

      const spec = findElevatorSpec(specs, car.spec);
      if (spec === undefined) return;
      usedSpecs.set(spec.id, spec);

      if (
        resolved.ratedSpeedMps < spec.ratedSpeedMps.min ||
        resolved.ratedSpeedMps > spec.ratedSpeedMps.max
      ) {
        addWarning(
          `${carPath}.ratedSpeedMps`,
          `${resolved.ratedSpeedMps} m/s is outside the reference envelope for class "${spec.id}" (${spec.ratedSpeedMps.min}-${spec.ratedSpeedMps.max} m/s).`,
          WARNING_CODES.speedOutsideClassRange,
        );
      }
      if (
        resolved.ratedLoadLb < spec.capacityLbRange[0] ||
        resolved.ratedLoadLb > spec.capacityLbRange[1]
      ) {
        addWarning(
          `${carPath}.ratedLoadLb`,
          `${resolved.ratedLoadLb} lb is outside the reference capacity range for class "${spec.id}" (${spec.capacityLbRange[0]}-${spec.capacityLbRange[1]} lb).`,
          WARNING_CODES.loadOutsideClassRange,
        );
      }
      if (!resolved.doubleDeck) return;
      if (
        resolved.ratedLoadLbPerDeck !== undefined &&
        Math.abs(resolved.ratedLoadLb - 2 * resolved.ratedLoadLbPerDeck) > TOLERANCE
      ) {
        addWarning(
          `${carPath}.ratedLoadLbPerDeck`,
          `whole-car rating ${resolved.ratedLoadLb} lb is not twice the per-deck rating ${resolved.ratedLoadLbPerDeck} lb.`,
          WARNING_CODES.deckLoadMismatch,
        );
      }
      const perDeckRange = spec.doubleDeckPersonsPerDeck;
      const perDeckPersons = resolved.capacityPersonsPerDeck;
      if (
        perDeckRange !== undefined &&
        perDeckPersons !== undefined &&
        (perDeckPersons < perDeckRange[0] || perDeckPersons > perDeckRange[1])
      ) {
        addWarning(
          `${carPath}.ratedLoadLbPerDeck`,
          `${perDeckPersons} persons per deck is outside the reference range for class "${spec.id}" (${perDeckRange[0]}-${perDeckRange[1]}).`,
          WARNING_CODES.deckPersonsOutsideClassRange,
        );
      }
    });

    const doubleDeckCars = cars.filter((car) => car.doubleDeck);
    if (doubleDeckCars.length > 0 && pairs.length === 0) {
      addWarning(
        `${at}.servesFloorPairs`,
        `bank "${bank.id}" of building "${building.id}" has ${doubleDeckCars.length} double-deck car${doubleDeckCars.length === 1 ? '' : 's'} and declares no servesFloorPairs, so the deck pairing is undefined and double-deck operation cannot be simulated for it: each car runs as a single deck of the same whole-car capacity, makes up to twice the stops the declared hardware would, and every round-trip time, interval and handling-capacity figure reported for this bank describes different hardware. Declare the floor pairs to have the decks modelled.`,
        WARNING_CODES.missingFloorPairs,
      );
    }
    if (doubleDeckCars.length === 0 && pairs.length > 0) {
      addWarning(
        `${at}.servesFloorPairs`,
        `bank "${bank.id}" declares servesFloorPairs but has no double-deck cars; the pairing has no effect.`,
        WARNING_CODES.unusedFloorPairs,
      );
    }
    /*
     * **The unconditional `double-deck-not-simulated` warning that stood here is retired**, and
     * retired because it became false rather than because it became inconvenient.
     *
     * It said, of every bank with a double-deck car, that the runtime ignored the pairing
     * entirely. That was true for the whole life of the project: `Car` had no deck concept, so
     * the eight `vertical-city` shuttles ran as eight single-deck cars of the combined capacity.
     * It is now true of exactly one configuration — a double-deck bank that declares no
     * `servesFloorPairs` — and `missing-floor-pairs` above says so, in the same words, on that
     * configuration only. `shaftForBank` reads the pairing, `Car` normalizes every floor to a
     * stop position, one stop opens onto both floors of a pair, the 80 % design load applies per
     * deck, and the dwell is the busier deck rather than the sum.
     *
     * What the retirement deliberately does **not** claim: `analytical/upPeak.ts` still warns
     * `double-deck`, because the Barney/CIBSE round trip this project implements is the
     * single-deck derivation and simulating the decks does not give the closed form a
     * double-deck one. The simulator and the closed form now disagree about this hardware *on
     * purpose*, which is a stronger reason to keep that warning than the one it had before.
     */

    // One check per distinct deck separation, not per car, so a bank of eight identical
    // shuttles reports one problem rather than eight.
    const carsBySeparation = new Map<number, string[]>();
    for (const car of doubleDeckCars) {
      if (car.deckSeparationM === undefined) continue;
      const group = carsBySeparation.get(car.deckSeparationM);
      if (group === undefined) carsBySeparation.set(car.deckSeparationM, [car.id]);
      else group.push(car.id);
    }
    for (const [separationM, carIds] of carsBySeparation) {
      pairs.forEach((pair, pairIndex) => {
        const lower = floorsById.get(pair[0]);
        const upper = floorsById.get(pair[1]);
        if (lower === undefined || upper === undefined) return;
        const actualM = upper.heightM - lower.heightM;
        if (Math.abs(actualM - separationM) <= TOLERANCE) return;
        addIssue(
          `${at}.servesFloorPairs[${pairIndex}]`,
          `floors "${pair[0]}" and "${pair[1]}" are ${Number(actualM.toFixed(3))} m apart, but car${carIds.length === 1 ? '' : 's'} ${carIds.join(', ')} in bank "${bank.id}" have decks ${separationM} m apart. A double-deck car can only serve pairs at exactly its deck separation.`,
          ISSUE_CODES.deckSeparationMismatch,
        );
      });
    }

    // Envelope checks belong to the shaft, so they are reported once per class in the
    // bank rather than once per car.
    const heights = servedFloors.map((floor) => floor.heightM);
    const riseM = heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0;
    for (const spec of usedSpecs.values()) {
      if (servedFloors.length > spec.maxFloors) {
        addWarning(
          `${at}.servesFloors`,
          `bank "${bank.id}" serves ${servedFloors.length} floors; class "${spec.id}" is reference-rated for at most ${spec.maxFloors}.`,
          WARNING_CODES.floorsExceedClass,
        );
      }
      if (riseM > spec.maxRiseM) {
        addWarning(
          `${at}.servesFloors`,
          `bank "${bank.id}" spans a rise of ${Number(riseM.toFixed(3))} m; class "${spec.id}" is reference-rated for at most ${spec.maxRiseM} m. Advisory: the reference envelope is application guidance, not a hard limit.`,
          WARNING_CODES.riseExceedsClass,
        );
      }
    }

    banks.push({
      id: bank.id,
      ...(bank.name === undefined ? {} : { name: bank.name }),
      servesFloors: bank.servesFloors,
      ...(bank.servesFloorPairs === undefined ? {} : { servesFloorPairs: bank.servesFloorPairs }),
      cars,
    });
  });

  /*
   * The service schedule, with every car located.
   *
   * Resolved here rather than at run time for the reason every other cross-reference in this
   * function is: an event naming a car that does not exist must be a located `ConfigError`, not
   * an event the runner silently skips. A skipped service event produces a run that completes,
   * balances its books, and did not do the thing its configuration says it did — which is the
   * "configured, validated, dead" shape this repository has shipped repeatedly.
   *
   * Authored order is preserved. The kernel's total order is `(time, sequence)` and the runner
   * schedules these in array order, so two events at the same `atS` fire in the order they were
   * written (CLAUDE.md invariant 4). Sorting here would be a second ordering authority.
   */
  const serviceEvents: ResolvedServiceEvent[] = [];
  (building.serviceEvents ?? []).forEach((event, eventIndex) => {
    const path = `serviceEvents[${eventIndex}]`;
    const holders = building.banks.filter(
      (bank) =>
        (event.bankId === undefined || bank.id === event.bankId) &&
        bank.cars.some((car) => car.id === event.carId),
    );
    const [holder] = holders;
    if (holder === undefined) {
      const known = building.banks.flatMap((bank) =>
        bank.cars.map((car) => `${bank.id}/${car.id}`),
      );
      addIssue(
        `${path}.carId`,
        event.bankId === undefined
          ? `service event at ${event.atS} s names car "${event.carId}", which no bank of this building declares. Known cars (bank/car): ${formatKnown(known)}.`
          : `service event at ${event.atS} s names car "${event.carId}" in bank "${event.bankId}", which that bank does not declare${building.banks.some((bank) => bank.id === event.bankId) ? '' : ' (and no bank has that id)'}. Known cars (bank/car): ${formatKnown(known)}.`,
        ISSUE_CODES.unknownServiceEventCar,
      );
      return;
    }
    if (holders.length > 1) {
      addIssue(
        `${path}.carId`,
        `service event at ${event.atS} s names car "${event.carId}", which exists in ${holders.length} banks (${holders.map((bank) => bank.id).join(', ')}). Car ids are unique per bank, not per building — add "bankId" to say which one.`,
        ISSUE_CODES.unknownServiceEventCar,
      );
      return;
    }
    serviceEvents.push({
      atS: event.atS,
      bankId: holder.id,
      carId: event.carId,
      mode: event.mode,
    });
  });

  (building.accessZones ?? []).forEach((zone, zoneIndex) => {
    zone.floors.forEach((floorId, floorIndex) => {
      if (floorsById.has(floorId) || floors.length === 0) return;
      addIssue(
        `accessZones[${zoneIndex}].floors[${floorIndex}]`,
        `access zone "${zone.id}" covers floor "${floorId}", which this building does not declare. Known floor ids: ${formatKnown(knownFloorIds)}.`,
        ISSUE_CODES.unknownFloor,
      );
    });
  });

  /*
   * A transport mode is an *edge of the routing graph*, so a mode naming a floor this building
   * does not declare is the same class of failure as a bank serving one: it silently removes a
   * connection somebody authored, and the only symptom would be a journey that quietly grew a
   * lift leg back. Fatal, located, and named after the field.
   */
  (building.transportModes ?? []).forEach((mode, modeIndex) => {
    mode.connects.forEach((floorId, endIndex) => {
      if (floorsById.has(floorId) || floors.length === 0) return;
      addIssue(
        `transportModes[${modeIndex}].connects[${endIndex}]`,
        `transport mode "${mode.id}" connects floor "${floorId}", which this building does not declare. Known floor ids: ${formatKnown(knownFloorIds)}.`,
        ISSUE_CODES.unknownFloor,
      );
    });
  });

  if (issues.length > 0) {
    throw new ConfigError(issues, {
      summary: `Invalid building "${building.id}": ${issues.length} problem${issues.length === 1 ? '' : 's'}`,
      hint: BUILDING_HINT,
    });
  }

  return {
    id: building.id,
    name: building.name,
    type: building.type,
    trafficProfile: building.trafficProfile,
    source: file,
    config: building,
    floors,
    floorsById,
    floorsByIndex,
    entranceFloors,
    transferFloors,
    banks,
    transportModes: building.transportModes ?? [],
    accessZones: building.accessZones ?? [],
    serviceEvents,
    totalPopulation,
    warnings,
  };
}

/**
 * Check references that only make sense across files: for now, the per-pattern weight
 * sets, which name dispatcher profiles.
 *
 * **Non-fatal here, and fatal in the selector**, which is the whole of what this comment is for.
 *
 * The sentence this paragraph replaces said `patternSwitching` *"describes a controller that does
 * not exist"*, and it was true twice over: the block was authored, schema-validated, typed on the
 * core barrel and cross-checked right here, and **nothing read it**, so editing
 * `weightSetsByPattern` produced a clean `loadConfig` and zero behavioural change. That is the
 * *configured, validated, dead in the shipped path* defect one level up from code into data.
 * `dispatch/selector.ts` reads it now.
 *
 * The asymmetry is deliberate. A caller may legitimately load this file for its **profile
 * library** alone — the CLI's `list`, the editor, every study that names a profile id — and a
 * dangling name in a block it never consults is an advisory, not a failure. But a *selector*
 * built over a pattern whose weight set does not exist is a dispatcher that cannot express one of
 * its own declared regimes, and it would fall back silently at exactly the traffic the operator
 * configured it for. So `resolveWeightSets` throws, and this stays a warning.
 *
 * The shipped file no longer trips it: `weightSetsByPattern.idle` named `energy-saver`, which was
 * never authored, and now names `energy-aware` — argued in the block's own `$comment`. The
 * warning is exercised from a fixture in `loader.test.ts` rather than from a defect in shipped
 * data, which is where a guard's evidence belongs.
 */
export function crossCheckDispatcherProfiles(
  dispatchers: DispatcherProfiles,
  file: string,
): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];
  const known = dispatchers.profiles.map((profile) => profile.id);
  const knownSet = new Set(known);
  const byPattern = dispatchers.patternSwitching?.weightSetsByPattern ?? {};
  for (const [pattern, profileId] of Object.entries(byPattern)) {
    if (knownSet.has(profileId)) continue;
    warnings.push({
      file,
      path: `patternSwitching.weightSetsByPattern.${pattern}`,
      message: `pattern "${pattern}" selects dispatcher profile "${profileId}", which is not declared. Declared profiles: ${formatKnown(known)}. Pattern switching will fall back until it exists.`,
      code: WARNING_CODES.unknownWeightSetProfile,
    });
  }
  return warnings;
}
