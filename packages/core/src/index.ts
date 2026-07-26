/**
 * `@elevator-sim/core` — public barrel.
 *
 * Headless simulation. Invariants (see CLAUDE.md): no wall-clock time here, no global
 * RNG, `Car.estimateCost()` stays pure, and nothing in this package may import `viz`.
 *
 * Phase 0 lands three modules — `kernel/`, `random/` and `config/`. Phase 1 adds
 * `physics/motion`, `physics/doors` and `model/` (including `model/car/`). Their names are
 * re-exported explicitly rather than with `export *`, so that adding an export to a
 * submodule is a deliberate act of widening the package's public surface and a future
 * name collision between modules is a compile error here rather than a silent shadow.
 * `dispatch/`, `traffic/` and `metrics/` join this list as those modules land.
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

/* -------------------------------------------------------------------------- *
 * physics/motion — jerk-limited S-curve profiles. Every accessor is a pure
 * function of (profile, t), so the kernel, the renderer and the dispatcher's
 * hypothetical scoring can share one immutable profile (CLAUDE.md invariant 1).
 * -------------------------------------------------------------------------- */

export {
  MOTION_PHASE_NAMES,
  accelerationAt,
  assertMotionConstraints,
  buildProfile,
  distanceTravelledAt,
  kinematicsAt,
  phaseAt,
  phaseByName,
  positionAt,
  profileDuration,
  speedAt,
  travelTime,
  velocityAt,
} from './physics/motion/index.js';

export type {
  Kinematics,
  MotionConstraints,
  MotionDirection,
  MotionPhase,
  MotionPhaseName,
  MotionPhases,
  MotionProfile,
  MotionProfileKind,
} from './physics/motion/index.js';

/* -------------------------------------------------------------------------- *
 * physics/doors — the door state machine. Immutable values and pure functions;
 * obstruction is an input decided by the caller from the injected StreamSet's
 * `doorObstruction` stream, never drawn here (CLAUDE.md invariants 2, 3).
 * -------------------------------------------------------------------------- */

export {
  DOOR_DEFAULTS,
  DOOR_EVENT_TYPES,
  DOOR_OPEN_DECLINES,
  DOOR_PARAMETERS,
  DOOR_REOPEN_CAUSES,
  DOOR_REOPEN_REFUSALS,
  DOOR_STATES,
  advanceDoor,
  applyDoorCommand,
  createDoorState,
  doorAccountingAt,
  doorOpenFractionAt,
  dwellSecondsFor,
  isDoorMoving,
  maxStopSeconds,
  mergeStopReasons,
  nextDoorTransitionAt,
  nominalStopSeconds,
  resolveDoorConfig,
} from './physics/doors/index.js';

export type {
  DoorAnswerSource,
  DoorCommand,
  DoorConfig,
  DoorConfigOverrides,
  DoorEvent,
  DoorEventType,
  DoorMachineState,
  DoorOpenDecline,
  DoorParameterSpec,
  DoorParameterType,
  DoorReopenCause,
  DoorReopenRefusal,
  DoorState,
  DoorStep,
  DoorStopReason,
  DoorTimeAccounting,
  DoorTimingSource,
} from './physics/doors/index.js';

/* -------------------------------------------------------------------------- *
 * model/ — the runtime objects the simulation runs against: building, banks,
 * floors with queues and lit buttons, passengers. Service zoning (physical) and
 * access zoning (credential) live here; operational zoning is a dispatcher
 * strategy and belongs to `dispatch/` (CLAUDE.md § modeling rules).
 * -------------------------------------------------------------------------- */

export {
  Bank,
  Building,
  DECK_POSITIONS,
  DIRECTIONS,
  Floor,
  ModelError,
  Passenger,
  PassengerFactory,
  SERVICE_MODES,
  SUPPORTED_MASS_DISTRIBUTIONS,
  acceptsCarCalls,
  acceptsHallCalls,
  createBuilding,
  directionBetween,
  drawPassengerMass,
  hallCallId,
  oppositeDirection,
} from './model/index.js';

export type {
  ArrivalRequest,
  BankInit,
  BuildingOptions,
  CarCall,
  CarCreationContext,
  CarLike,
  CreateBuildingOptions,
  CredentialGroup,
  DeckAssignment,
  DeckPosition,
  Direction,
  FloorPair,
  FloorTopology,
  HallCall,
  NextLegInit,
  PassengerFactoryOptions,
  PassengerInit,
  ServiceMode,
  TransferRequest,
} from './model/index.js';

/* -------------------------------------------------------------------------- *
 * model/car — the car entity: physics and safety, never allocation policy.
 * `estimateCost` is the pure free function the `Car.estimateCost()` method
 * delegates to; it takes a frozen CarSnapshot and returns an estimate without
 * touching simulation state (CLAUDE.md invariant 1).
 * -------------------------------------------------------------------------- */

export {
  CAR_DEFAULTS,
  CAR_PARAMETERS,
  Car,
  INFEASIBILITY_REASONS,
  LOAD_SENSOR_DEFAULTS,
  LOAD_SENSOR_PARAMETERS,
  LoadSensor,
  createShaft,
  directionTowardNearestStop,
  estimateCost,
  infeasibilityOf,
  isAccessPermitted,
  loadFactorOf,
  projectRoute,
  requestedStop,
  resolveLoadSensor,
  shaftForBank,
  shaftFloor,
  shaftServes,
  totalMassKg,
} from './model/car/index.js';

export type {
  BoardOptions,
  CarClock,
  CarDoorRecord,
  CarInit,
  CarLoadSnapshot,
  CarMotion,
  CarMotionRecord,
  CarParameterSpec,
  CarParameterType,
  CarRecord,
  CarShaft,
  CarSnapshot,
  CommittedStop,
  CostEstimate,
  CostRequest,
  InfeasibilityReason,
  LoadSensorAnswerSource,
  LoadSensorOverrides,
  ResolvedLoadSensorConfig,
  RouteStop,
  ServedFloor,
  ServedFloorInit,
  WeighedOccupant,
} from './model/car/index.js';
