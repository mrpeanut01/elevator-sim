/**
 * Configuration loading and validation for `data/*.json`.
 *
 * ```ts
 * import { loadConfig } from '@elevator-sim/core';
 *
 * const config = await loadConfig('data');
 * const office = config.buildingsById.get('midtown-office');
 * ```
 *
 * `loadConfig` is the only entry point that touches the filesystem, and `./loader.js` is
 * the only module that imports `node:` anything. `parseBuilding`, `expandFloors`,
 * `resolveCar` and `resolveBuilding` live in `./parse.js`, `./expandFloors.js` and
 * `./resolveCar.js`, which are pure and fs-free: a browser build imports those modules
 * directly and never reaches `node:fs`. Importing this barrel pulls in `loader.js` too, so
 * a bundle that must exclude Node built-ins should import the leaf modules.
 */

export {
  ConfigError,
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

export { loadConfig } from './loader.js';

export {
  AGGREGATIONS,
  ASSIGNMENT_MODES,
  ASSIGNMENT_TIMINGS,
  BUILDING_TYPES,
  CALL_TYPES,
  COMMITMENT_POINTS,
  DOOR_TYPES,
  DWELL_POLICIES,
  PARKING_STRATEGIES,
  REASSIGNMENT_POLICIES,
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
  PatternSwitchingConfig,
  ReassignmentPolicy,
  RealWorldAnchor,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedCar,
  TrafficProfile,
  TrafficProfiles,
  TypicalMax,
  ValueRange,
} from './types.js';
