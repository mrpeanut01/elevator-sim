/**
 * `@elevator-sim/core` — public barrel.
 *
 * Headless simulation. Invariants (see CLAUDE.md): no wall-clock time here, no global
 * RNG, `Car.estimateCost()` stays pure, and nothing in this package may import `viz`.
 *
 * Phase 0 lands three modules — `kernel/`, `random/` and `config/`. Their names are
 * re-exported explicitly rather than with `export *`, so that adding an export to a
 * submodule is a deliberate act of widening the package's public surface and a future
 * name collision between modules is a compile error here rather than a silent shadow.
 * `physics/`, `model/`, `dispatch/`, `traffic/` and `metrics/` join this list as those
 * modules land.
 *
 * ## Note on Node built-ins
 *
 * `loadConfig` is the only export that touches the filesystem, and importing this barrel
 * therefore pulls in `node:fs`/`node:path` by way of `config/loader.js`. Everything else
 * — the whole of `kernel/` and `random/`, and `parseBuilding`/`expandFloors`/
 * `resolveCar`/`resolveBuilding` — is environment-free. A browser bundle that must
 * exclude Node built-ins should import those leaf modules directly instead of this
 * barrel; see the note at the top of `config/index.ts`.
 */

/* -------------------------------------------------------------------------- *
 * kernel/ — discrete-event queue and clock.
 * -------------------------------------------------------------------------- */

export { EventQueue, SimKernel, compareScheduledEvents, createEvent } from './kernel/index.js';

export type {
  EventContext,
  EventHandler,
  EventScheduler,
  ScheduledEvent,
  SimEvent,
  SimKernelOptions,
  SimTime,
} from './kernel/index.js';

/* -------------------------------------------------------------------------- *
 * random/ — seeded per-source RNG streams. Never construct an RNG inline;
 * inject a StreamSet and draw from its named streams (CLAUDE.md invariant 2).
 * -------------------------------------------------------------------------- */

export { Pcg32, STREAM_NAMES, StreamSet, deriveStreamSeed, normalizeSeed } from './random/index.js';

export type {
  RNG,
  Rng,
  RngState,
  StreamName,
  StreamSeed,
  StreamSetSnapshot,
} from './random/index.js';

/* -------------------------------------------------------------------------- *
 * config/ — loading and validation of data/*.json (CLAUDE.md invariants 7, 8).
 * -------------------------------------------------------------------------- */

export {
  ASSIGNMENT_MODES,
  ASSIGNMENT_TIMINGS,
  BUILDING_TYPES,
  CALL_TYPES,
  COMMITMENT_POINTS,
  ConfigError,
  DATA_FILES,
  DEFAULT_ID_PATTERN,
  DOOR_TYPES,
  DWELL_POLICIES,
  ISSUE_CODES,
  MAX_FLOORS_PER_RANGE,
  PARKING_STRATEGIES,
  REASSIGNMENT_POLICIES,
  WARNING_CODES,
  accessZoneSchema,
  bankConfigSchema,
  buildingConfigSchema,
  carConfigSchema,
  configError,
  costTermSchema,
  crossCheckDispatcherProfiles,
  dispatcherProfileSchema,
  dispatcherProfilesSchema,
  elevatorSpecSchema,
  elevatorSpecsSchema,
  expandFloors,
  findElevatorSpec,
  floorConfigSchema,
  floorRangeSchema,
  formatConfigIssues,
  formatPath,
  issuesFromZodError,
  loadConfig,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseLoadDivisor,
  parseTrafficProfiles,
  personsAtRatedLoad,
  resolveBuilding,
  resolveCar,
  trafficProfileSchema,
  trafficProfilesSchema,
} from './config/index.js';

export type {
  AccessZone,
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
  ExpandFloorsOptions,
  FloorConfig,
  FloorRange,
  FloorSource,
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
  ResolveBuildingOptions,
  ResolveCarOptions,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedCar,
  TrafficProfile,
  TrafficProfiles,
  TypicalMax,
  ValueRange,
} from './config/index.js';
