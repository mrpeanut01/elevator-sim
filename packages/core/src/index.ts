/**
 * `@elevator-sim/core` — public barrel.
 *
 * Headless simulation. Invariants (see CLAUDE.md): no wall-clock time here, no global
 * RNG, `Car.estimateCost()` stays pure, and nothing in this package may import `viz`.
 *
 * Phase 0 lands three modules — `kernel/`, `random/` and `config/`. Phase 1 adds
 * `physics/motion`, `physics/doors` and `model/` (including `model/car/`). Phase 2 completes
 * the loop with `traffic/`, `dispatch/`, `metrics/`, `analytical/` and `sim/`. Their names are
 * re-exported explicitly rather than with `export *`, so that adding an export to a
 * submodule is a deliberate act of widening the package's public surface and a future
 * name collision between modules is a compile error here rather than a silent shadow.
 *
 * ## The one deliberate name collision
 *
 * `HANDLING_CAPACITY_WINDOW_S` (= 300) is declared independently by both `metrics/` and
 * `analytical/`, and that duplication is structural rather than an oversight: `analytical/`
 * is the correctness oracle and may not import from the thing it audits, so it cannot share
 * the constant. Only the `metrics/` binding is re-exported below. `index.test.ts` compares
 * the barrel's value against *both* modules', so if the two ever drift apart the guard fails
 * rather than silently preferring one.
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

/* -------------------------------------------------------------------------- *
 * traffic/ — passenger demand generation. Produces an immutable trace up front
 * from the `arrivals`/`origins`/`destinations`/`passengerMass` streams, so the
 * same seed yields the same passengers regardless of what the elevators then do
 * — the common-random-numbers mechanism Phase 3 depends on (invariants 2, 5).
 * -------------------------------------------------------------------------- */

export {
  CREDENTIAL_ASSIGNMENTS,
  DEMAND_LEVELS,
  DEMAND_SOURCE_KINDS,
  DEMAND_TEMPLATE_IDS,
  DIRECTION_CATEGORIES,
  INTERFLOOR_WEIGHTINGS,
  RoutePlanner,
  SECONDS_PER_5MIN,
  SUPPORTED_BATCH_DISTRIBUTIONS,
  TRAFFIC_DEFAULTS,
  TRAFFIC_PARAMETERS,
  TrafficError,
  batchesPerSecond,
  constantDemandTemplate,
  drawBatchSize,
  drawGeometricBatchSize,
  expectedPassengers,
  generateTrace,
  inReportWindow,
  integratedIntensityS,
  intensityAt,
  legDestinations,
  passengersPer5Min,
  passengersPerSecond,
  planDemand,
  resolveDemandTemplate,
  riseAndFallTemplate,
  routeOf,
  routeTopologyOf,
  sampleBatchArrivalTimes,
  toPassengerInit,
  transferFloorsOf,
} from './traffic/index.js';

export type {
  ArrivalEvent,
  BatchArrivalOptions,
  ConstantDemandOptions,
  CredentialAssignment,
  DemandConfig,
  DemandLevel,
  DemandPhase,
  DemandPlan,
  DemandSource,
  DemandSourceKind,
  DemandTemplateId,
  DemandTemplateOverrides,
  DemandTemplateSpec,
  DestinationWeight,
  DirectionCategory,
  EntranceShare,
  GeneratedPassenger,
  InterfloorWeighting,
  PassengerTrace,
  ResolvedDemandTemplate,
  RiseAndFallOptions,
  RouteTopology,
  TraceLeg,
  TrafficConfig,
  TrafficParameterSpec,
  TrafficParameterType,
} from './traffic/index.js';

/* -------------------------------------------------------------------------- *
 * dispatch/ — the group controller. ONE engine:
 *   cost(car, call) = Σᵢ wᵢ · normalize(termᵢ(car, call))
 * Every strategy in `data/dispatcher-profiles.json` is a weight vector over that
 * sum. There is no `NearestCarDispatcher` and nothing here reads a profile id
 * (invariant 7); `policy.test.ts` proves it by scrambling every id and asserting
 * no decision moves. A new strategy is a config entry, never a new class.
 * -------------------------------------------------------------------------- */

export {
  ANSWER_REASONS,
  CALL_STAGES,
  COST_TERMS,
  COST_TERMS_BY_ID,
  DECISION_OUTCOMES,
  DECISION_REASONS,
  DECLARED_TERM_IDS,
  DISPATCH_DEFAULTS,
  DISPATCH_PARAMETERS,
  DISPATCH_PARAMETER_IDS,
  DispatchError,
  HARD_CONSTRAINT_IDS,
  IMPLEMENTED_TERM_IDS,
  INELIGIBILITY_REASONS,
  NORMALIZATION_DEFAULTS,
  NORMALIZATION_SCALE_IDS,
  PARK_CALL_HORIZON,
  REPOSITION_REASONS,
  WeightedCostDispatchPolicy,
  answerDecisionFor,
  assessDirectionReversal,
  assignmentWidth,
  batchKeyOf,
  bestScore,
  boundedNormalize,
  clearsHysteresis,
  compareScores,
  costRequestFor,
  costTerm,
  createDispatchPolicy,
  directionReversalTerm,
  directionReversals,
  dispatchParameter,
  dispatchParameterValue,
  distanceTravelledTerm,
  expectedResponseSeconds,
  filterEligible,
  isCommitted,
  isDeclaredTerm,
  isImplementedTerm,
  landingShare,
  marginalDistanceM,
  moveSeconds,
  newLifecycle,
  normalizeTerm,
  observationFor,
  pathLengthM,
  rankScores,
  repositionDecisionFor,
  requestForCar,
  requestForShare,
  resolveDispatchConfig,
  resolveNormalization,
  routeStartHeightM,
  saturatingNormalize,
  scoreCar,
  scoreableAt,
  tunablePathsOf,
  waitTimeSeconds,
  waitTimeTerm,
  withBypassOverridden,
  withLifecycle,
} from './dispatch/index.js';

export type {
  AnswerDecision,
  AnswerReason,
  BoundedNormalization,
  CallLifecycle,
  CallStage,
  CarScore,
  CostTermDefinition,
  DecisionOutcome,
  DecisionReason,
  DispatchCall,
  DispatchContext,
  DispatchDecision,
  DispatchObservation,
  DispatchParameterSpec,
  DispatchParameterType,
  DispatchPolicy,
  DispatchPolicyOptions,
  DispatcherProfileSource,
  EligibilityStageConfig,
  EligibilityVerdict,
  HardConstraintId,
  IneligibilityReason,
  NormalizationMode,
  NormalizationScaleId,
  RepositionContext,
  RepositionDecision,
  RepositionReason,
  ResolvedAnswerStage,
  ResolvedConstraints,
  ResolvedDispatchConfig,
  ResolvedDispatchStage,
  ResolvedEligibilityStage,
  ResolvedIdleStage,
  ResolvedNormalization,
  ReversalAssessment,
  SaturatingNormalization,
  ScoreBreakdown,
  TermContext,
  TermNormalization,
} from './dispatch/index.js';

/* -------------------------------------------------------------------------- *
 * metrics/ — recorder → RunRecord → RunSummary. The record is the seed-bearing
 * dataset that gets persisted (invariant 5); the summary is a pure function of
 * it, so Phase 3 can re-window or re-threshold a stored run without
 * re-simulating. Nothing here reads a clock (3) or draws a number (2).
 * -------------------------------------------------------------------------- */

export {
  DEFAULT_DEPARTURE_GAP_S,
  DEFAULT_DESIGN_LOAD_FACTOR,
  DEFAULT_LOAD_FACTOR_EDGES,
  DEFAULT_LONG_WAIT_THRESHOLD_S,
  DEFAULT_MAX_UNSERVED_FRACTION,
  DEFAULT_PERCENTILE_METHOD,
  DEFAULT_QUEUE_SAMPLE_COUNT,
  DEFAULT_WAIT_HISTOGRAM_BIN_S,
  DEPARTURE_GAP_BASES,
  DEPARTURE_GAP_REOPEN_MARGIN,
  FALLBACK_DEPARTURE_GAP_S,
  HANDLING_CAPACITY_WINDOW_S,
  METRICS_PARAMETERS,
  METRICS_SCHEMA_VERSION,
  MetricsError,
  MetricsRecorder,
  PEAK_WINDOW_S,
  PERCENTILE_METHODS,
  QUEUE_SERIES_SOURCES,
  SATURATION_DEFAULTS,
  SATURATION_VERDICTS,
  achievedIntervalOf,
  assertWindow,
  buildJourneys,
  carTimingsSchema,
  countAbove,
  departureGapBracket,
  detectSaturation,
  fractionAbove,
  fullRunWindow,
  handlingCapacityOf,
  histogram,
  legDurations,
  legSecondsOf,
  linearTrend,
  loadFactorStatistics,
  loadSampleSchema,
  mean,
  median,
  parseRunRecord,
  passengerRecordSchema,
  peakArrivalWindow,
  percentile,
  percentileOfSorted,
  percentiles,
  queueLengthSeries,
  queueSampleSchema,
  reportWindowSchema,
  resolveDepartureGapS,
  resolveWindow,
  rideSecondsOf,
  runRecordSchema,
  runSeed,
  sampleStdDev,
  selectJourneysInWindow,
  selectLegsInWindow,
  serializeRunRecord,
  sortedAscending,
  summarizeDurations,
  summarizeRun,
  summarizeWaiting,
  waitPercentile,
  waitSecondsOf,
  weightedHistogram,
  windowContains,
  windowContainsArrival,
  windowContainsJourney,
  windowDurationS,
} from './metrics/index.js';

export type {
  BoardingDetails,
  CarTimings,
  DepartureGapBasis,
  DepartureGapBracket,
  DurationStatistics,
  DurationSummaryOptions,
  HandlingCapacity,
  Histogram,
  HistogramBin,
  HistogramOptions,
  IntervalOptions,
  IntervalStatistics,
  JourneyRecord,
  LinearTrend,
  LoadFactorOptions,
  LoadFactorStatistics,
  LoadReading,
  LoadSample,
  MetricsParameterSpec,
  MetricsParameterType,
  MetricsRecorderOptions,
  PassengerRecord,
  PeakWindowOptions,
  PercentileMethod,
  QueueSample,
  QueueSeriesOptions,
  QueueSeriesSource,
  RecordablePassenger,
  ReportWindow,
  RunCounts,
  RunRecord,
  RunSummary,
  SaturationDiagnosis,
  SaturationOptions,
  SaturationThresholds,
  SaturationVerdict,
  SeedSource,
  SerializeOptions,
  SummarizeOptions,
  TrendPoint,
  WaitOptions,
  WaitStatistics,
  WeightedValue,
  WindowSelection,
} from './metrics/index.js';

/* -------------------------------------------------------------------------- *
 * analytical/ — the closed-form Barney/CIBSE up-peak round trip time, and the
 * project's primary correctness oracle (CLAUDE.md § Correctness oracle).
 * Independent of the simulation BY CONSTRUCTION: it imports config types only,
 * never the kernel, model, physics or dispatcher — not even to reuse a motion
 * profile. Read CLOSED_FORM_ASSUMPTIONS and CLOSED_FORM_COMPARISON_RULE before
 * quoting any agreement figure; "within a few percent" only means something
 * once the disagreements are enumerated in advance.
 *
 * `HANDLING_CAPACITY_WINDOW_S` is intentionally not re-exported here — see the
 * collision note in this file's header.
 * -------------------------------------------------------------------------- */

export {
  ANALYTICAL_DEFAULTS,
  ANALYTICAL_ERROR_CODES,
  ANALYTICAL_PARAMETERS,
  AnalyticalError,
  CLOSED_FORM_ASSUMPTIONS,
  CLOSED_FORM_COMPARISON_RULE,
  IMPLAUSIBLE_PERCENT_POPULATION_5MIN,
  UP_PEAK_WARNING_CODES,
  analyzeUpPeak,
  deriveUpPeakTerms,
  expectedStops,
  handlingCapacity5Min,
  highestReversalFloor,
  interval,
  passengerTransferSecondsFor,
  percentPopulation,
  roundTripTime,
} from './analytical/index.js';

export type {
  AnalyticalErrorCode,
  AnalyticalParameterSpec,
  AnalyticalParameterType,
  ClosedFormAssumption,
  ClosedFormBias,
  ClosedFormComparisonRule,
  ResolvedRoundTripTerms,
  RoundTripResult,
  RoundTripTerms,
  StopTimeBreakdown,
  UpPeakAnalysis,
  UpPeakOptions,
  UpPeakTerms,
  UpPeakWarning,
  UpPeakWarningCode,
} from './analytical/index.js';

/* -------------------------------------------------------------------------- *
 * sim/ — the run loop. Seed + building + dispatcher profile + demand template
 * in, one replication out. Event-driven throughout: no tick, no wall clock
 * (invariant 3), ties broken by (time, sequence) (invariant 4). Every journey
 * is delivered or named in `result.undelivered`, and a run whose books do not
 * balance throws rather than reporting a number.
 * -------------------------------------------------------------------------- */

export {
  SIMULATION_STATUSES,
  SIM_DEFAULTS,
  SIM_EVENT_TYPES,
  SIM_EVENT_TYPE_IDS,
  SIM_PARAMETERS,
  Simulation,
  SimulationError,
  TIMEOUT_POLICIES,
  UNDELIVERED_REASONS,
  batchArrivalEvent,
  carArrivedEvent,
  carDoorEvent,
  dispatchTickEvent,
  queueSampleEvent,
  runSimulation,
  transferArrivalEvent,
} from './sim/index.js';

export type {
  BatchArrivalPayload,
  CarEventPayload,
  ConservationAudit,
  DispatchTickPayload,
  QueueSamplePayload,
  SimEventType,
  SimParameterSpec,
  SimParameterType,
  SimulationConfig,
  SimulationDemandOptions,
  SimulationResult,
  SimulationStatus,
  TimeoutPolicy,
  TransferArrivalPayload,
  UndeliveredJourney,
  UndeliveredReason,
} from './sim/index.js';
