/**
 * Configuration validation and resolution for `data/*.json`.
 *
 * ```ts
 * import { loadConfig } from '@elevator-sim/core';   // Node: reads a directory
 * import { parseBuilding } from '@elevator-sim/core/browser'; // browser: parses bytes you fetched
 *
 * const config = await loadConfig('data');
 * const office = config.buildingsById.get('midtown-office');
 * ```
 *
 * **This barrel is fs-free, and that is now enforced rather than intended.** `loadConfig` is
 * the only entry point that touches the filesystem, `./loader.js` is the only module in the
 * package that imports `node:` anything, and neither is re-exported here — `loadConfig` is
 * exported from `src/index.ts` alone, the Node-only entry point. Everything below reaches a
 * browser through `src/browser.ts`, whose transitive import graph `src/browser.test.ts` walks
 * and asserts is free of `node:` specifiers.
 *
 * This file used to end with `export { loadConfig } from './loader.js'` while its own docstring
 * explained that a browser build must be able to avoid `node:fs`. It could not: the re-export
 * chain `index.ts → config/index.ts → loader.ts` put `node:fs/promises` in every consumer's
 * module graph, browser included. Keep the loader off this barrel.
 */

export {
  ConfigError,
  DISPATCHER_PROFILE_OBJECT_SECTIONS,
  ISSUE_CODES,
  WARNING_CODES,
  accessZoneSchema,
  bankConfigSchema,
  buildingConfigSchema,
  carConfigSchema,
  configError,
  costTermSchema,
  dispatcherProfileSchema,
  dispatcherProfilesSchema,
  elevatorSpecSchema,
  elevatorSpecsSchema,
  floorConfigSchema,
  floorRangeSchema,
  formatConfigIssues,
  formatPath,
  issuesFromZodError,
  parseLoadDivisor,
  serviceEventSchema,
  trafficProfileSchema,
  trafficProfilesSchema,
} from './schema.js';

export {
  DEFAULT_ID_PATTERN,
  MAX_FLOORS_PER_RANGE,
  expandFloors,
  type ExpandFloorsOptions,
  type FloorSource,
} from './expandFloors.js';

export {
  findElevatorSpec,
  personsAtRatedLoad,
  resolveCar,
  type ResolveCarOptions,
} from './resolveCar.js';

export {
  DATA_FILES,
  crossCheckDispatcherProfiles,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type ResolveBuildingOptions,
} from './parse.js';

/* `./loader.js` is deliberately NOT re-exported here — see this file's header. Node-side
   callers import `loadConfig` from `@elevator-sim/core`, or from `./loader.js` directly. */

export {
  AGGREGATIONS,
  ASSIGNMENT_MODES,
  ASSIGNMENT_TIMINGS,
  BUILDING_TYPES,
  CALL_TYPES,
  COMMITMENT_POINTS,
  DESTINATION_CALL_TYPES,
  DOOR_TYPES,
  DWELL_POLICIES,
  PARKING_STRATEGIES,
  PASSENGER_ASSIGNMENT_MODES,
  REASSIGNMENT_POLICIES,
  isDestinationCallType,
} from './types.js';

export type {
  AccessZone,
  Aggregation,
  AnswerStageConfig,
  ArrivalProcessConfig,
  AssignmentMode,
  AssignmentTiming,
  BankConfig,
  BatchSizeConfig,
  BuildingConfig,
  BuildingType,
  CallType,
  PassengerAssignmentMode,
  CapacityEntry,
  CarConfig,
  CodeMinimumSpeed,
  Commented,
  CommitmentPoint,
  ConfigIssue,
  ConfigWarning,
  CostTerm,
  DemandTemplate,
  DirectionalSplit,
  DispatchStageConfig,
  DispatcherProfile,
  DispatcherProfiles,
  DoorTiming,
  DoorTimings,
  DoorType,
  DwellPolicy,
  ElevatorConventions,
  ElevatorSpec,
  ElevatorSpecs,
  ElevatorTiming,
  FloorConfig,
  FloorRange,
  IdleStageConfig,
  LoadSensorConfig,
  LoadedConfig,
  ParkingStrategy,
  PassengerMassConfig,
  PassengerTransferTimes,
  PatternDetectorConfig,
  ProfileEligibilityConfig,
  ProfileNormalizationConfig,
  PatternSwitchingConfig,
  ReassignmentPolicy,
  RealWorldAnchor,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedCar,
  ResolvedServiceEvent,
  ServiceEventConfig,
  TrafficProfile,
  TrafficProfiles,
  TypicalMax,
  ValueRange,
} from './types.js';
