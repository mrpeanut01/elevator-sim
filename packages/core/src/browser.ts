/**
 * `@elevator-sim/core` — the **environment-free** public barrel, and the whole of the package
 * except one function.
 *
 * Two entry points resolve to this file:
 *
 * - `@elevator-sim/core/browser` — always, in every environment.
 * - `@elevator-sim/core` — under the `browser` export condition, i.e. whenever a bundler is
 *   building for the browser. Under Node the same specifier resolves to `./index.js`, which is
 *   this barrel plus `loadConfig`.
 *
 * ## Why the split exists, and what would break it
 *
 * `loadConfig` is the only export in the package that touches a filesystem, and its module
 * (`config/loader.ts`) imports `node:fs/promises` and `node:path`. When it sat on the default
 * barrel, *any* browser import of `@elevator-sim/core` threw at module evaluation — before a
 * line of consumer code ran — because a bundler's externalisation stub for a Node builtin
 * throws on evaluation. Phase 4's web viewer hit exactly that and worked around it by aliasing
 * the two builtins to a throwing shim in its dev server. That workaround is gone; this file is
 * the fix.
 *
 * The property that matters is not "this file does not import `node:`" — it is that **nothing
 * reachable from this file does**, transitively, at any depth. That is asserted mechanically in
 * `browser.test.ts`, which walks the real static import graph from this module and fails on any
 * `node:` specifier and on any external package outside a small asserted allowlist. Reading the
 * imports is not enough: the previous arrangement was documented as fs-free in three separate
 * docstrings while being nothing of the kind.
 *
 * So: **do not add an export here whose module reaches a Node builtin.** Node-only surface goes
 * on `./index.ts` beside `loadConfig`, never here. `index.test.ts` asserts the two barrels differ
 * by exactly `loadConfig`, so adding an export here reaches Node consumers automatically and
 * adding one there without thinking about the browser is a test failure rather than a surprise.
 *
 * Headless simulation. Invariants (see CLAUDE.md): no wall-clock time here, no global
 * RNG, `Car.estimateCost()` stays pure, and nothing in this package may import `viz`.
 *
 * Phase 0 lands three modules — `kernel/`, `random/` and `config/`. Phase 1 adds
 * `physics/motion`, `physics/doors` and `model/` (including `model/car/`). Phase 2 completes
 * the loop with `traffic/`, `dispatch/`, `metrics/`, `analytical/` and `sim/`. Phase 5 widens
 * `dispatch/` rather than adding a module: nine more cost terms, plus `dispatch/policies/`
 * (aggregation, the stage-5 capacity monitor, operational zoning, stage-7 pre-positioning) and
 * `dispatch/predictor/` (the learned arrival model). Their names are
 * re-exported explicitly rather than with `export *`, so that adding an export to a
 * submodule is a deliberate act of widening the package's public surface and a future
 * name collision between modules is a compile error here rather than a silent shadow.
 *
 * ## Phase 5: what is exported, and what a `runSimulation` objective can measure
 *
 * Everything Phase 5 built is reachable from this barrel **and reachable from `runSimulation`**.
 * State it here rather than only in `dispatch/policies/index.ts`, because this file is the first
 * thing a consumer reads and it spent a whole phase saying the opposite: four behaviours were
 * exported, unit-tested and dead in the shipped path, and this table said so. The wiring is in
 * `sim/` and `config/`; the table below is the one in `dispatch/policies/index.ts`, restated for
 * the barrel's audience:
 *
 * | behaviour | on this barrel? | how a run reaches it |
 * |---|---|---|
 * | the nine new cost terms | yes | stage 3, `zoneAffinity` and `predictedDemand` included — both are priced off the group context `#dispatchBank` resolves once per pass |
 * | {@link AuctionDispatchPolicy} / {@link runAuction} | yes | `auction.aggregation` in the profile names a factory in `dispatch/policies/registry.ts`; `Simulation` builds every bank through {@link createPolicyFor} |
 * | {@link CapacityReassignmentMonitor} | yes | one per bank, swept from `Simulation.#finishStop` once the doors have shut and the load has settled |
 * | {@link resolvePrepositionContext} / {@link repositionContextFor} / {@link createArrivalModel} | yes | `Simulation.#park` is called **per car**, so it resolves the bank's context once and derives that car's `RepositionContext` from it; one {@link ArrivalModel} per bank, fed in `#admit` |
 * | {@link prepositionPlan} | **exported, not called** | the per-bank convenience wrapper over the two functions above. The run cannot use it without taking a forecast per car instead of per bank, so it has no caller — recorded in `dispatch/deadCode.test.ts`'s allowlist rather than left to read as wired |
 * | {@link groupContext} | yes | `Simulation.#dispatchBank` resolves it once per pass and shares it across the calls in the pass |
 *
 * Measured through the shipped engine on `midtown-office` at seed 20 260 726, one replication each:
 * 660 predictor observations and 1 149 forecast reads under `predictive-balanced` (29 and 73 on
 * `garden-apartments`); 44 load crossings with 9 call migrations under `capacity-aware` against 44
 * crossings and 0 migrations under `eta`; `auction-multi-round` resolving `rounds: 3` through
 * `loadConfig` and holding more than one round in 922 of 2 398 auctions, 194 of them landing
 * somewhere other than the argmin; and `zoneAffinity` showing cross-car spread in 142 of
 * `zoned-uppeak`'s 144 decisions.
 *
 * So an optimizer that reads {@link POLICY_PARAMETERS} or {@link PREDICTOR_PARAMETERS} off this
 * barrel and searches them against a `runSimulation` objective is searching live dimensions. The
 * guard that keeps it that way is `sim/seam.test.ts`, and it is behavioural rather than a symbol
 * search: two configurations the docs say must differ have to produce different car trajectories.
 * A symbol search would have caught none of the four original gaps.
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
 * There are none, and that is checked rather than claimed — see the header above and
 * `browser.test.ts`. `loadConfig`, the one function that reads a disk, is exported from
 * `./index.ts` and from there only.
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
 * config/ — validation and resolution of data/*.json (CLAUDE.md invariants 7, 8).
 * Parsing only: the bytes arrive from somewhere else. `loadConfig`, which gets them
 * off a disk with `node:fs`, is on `./index.ts` instead — see this file's header.
 * -------------------------------------------------------------------------- */

export {
  AGGREGATIONS,
  ASSIGNMENT_MODES,
  ASSIGNMENT_TIMINGS,
  BUILDING_TYPES,
  TRANSPORT_MODE_KINDS,
  CALL_TYPES,
  COMMITMENT_POINTS,
  ConfigError,
  DESTINATION_CALL_TYPES,
  PASSENGER_ASSIGNMENT_MODES,
  isDestinationCallType,
  DATA_FILES,
  DEFAULT_ID_PATTERN,
  DISPATCHER_PROFILE_OBJECT_SECTIONS,
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
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseLoadDivisor,
  parseTrafficProfiles,
  personsAtRatedLoad,
  resolveBuilding,
  resolveCar,
  serviceEventSchema,
  trafficProfileSchema,
  trafficProfilesSchema,
  transportModeSchema,
} from './config/index.js';

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
  ProfileEligibilityConfig,
  ProfileNormalizationConfig,
  PatternSwitchingConfig,
  ReassignmentPolicy,
  RealWorldAnchor,
  ResolveBuildingOptions,
  ResolveCarOptions,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedCar,
  ResolvedServiceEvent,
  ServiceEventConfig,
  TrafficProfile,
  TrafficProfiles,
  DirectionalTraversalTime,
  StairsUseConfig,
  TransportModeConfig,
  TransportModeKind,
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
  sharedPrefixSeconds,
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
  CROWDING_PARAMETERS,
  DOOR_PARAMETERS,
  DOOR_REOPEN_CAUSES,
  DOOR_REOPEN_REFUSALS,
  DOOR_STATES,
  advanceDoor,
  applyDoorCommand,
  createDoorState,
  doorAccountingAt,
  doorOpenFractionAt,
  crowdingFactorFor,
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
  DoorCrowdingConfig,
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
  deckOfFloor,
  deckSlot,
  directionTowardNearestStop,
  estimateCost,
  floorIdsServedAt,
  infeasibilityOf,
  isAccessPermitted,
  loadFactorOf,
  projectRoute,
  requestedStop,
  resolveLoadSensor,
  shaftForBank,
  shaftFloor,
  shaftServes,
  stopFloorIdOf,
  stopFloorsOf,
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
  DeckStopSplit,
  InfeasibilityReason,
  LoadSensorAnswerSource,
  LoadSensorOverrides,
  ResolvedLoadSensorConfig,
  RouteStop,
  ServedFloor,
  ServedFloorInit,
  ShaftOptions,
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
  LUNCH_TWO_WAY_SPLIT_AT_END,
  LUNCH_TWO_WAY_SPLIT_AT_START,
  RoutePlanner,
  SECONDS_PER_5MIN,
  SUPPORTED_BATCH_DISTRIBUTIONS,
  TRAFFIC_DEFAULTS,
  TRAFFIC_MODEL_VERSIONS,
  TRAFFIC_PARAMETERS,
  TrafficError,
  batchesPerSecond,
  constantDemandTemplate,
  drawBatchSize,
  drawExplicitBatchSize,
  drawGeometricBatchSize,
  drawZeroTruncatedPoissonBatchSize,
  expectedPassengers,
  generateTrace,
  inReportWindow,
  integratedIntensityS,
  intensityAt,
  legDestinations,
  lunchTwoWayTemplate,
  maxPeakShiftS,
  meanBatchSizeOf,
  passengersPer5Min,
  passengersPerSecond,
  planDemand,
  requirePeakShiftFits,
  resolveDemandTemplate,
  riseAndFallTemplate,
  routeOf,
  routeTopologyOf,
  sampleBatchArrivalTimes,
  shiftTemplatePeak,
  splitAt,
  toPassengerInit,
  transferFloorsOf,
} from './traffic/index.js';

export type {
  ArrivalEvent,
  BatchArrivalOptions,
  BatchSizeCurve,
  ConstantDemandOptions,
  CredentialAssignment,
  DayVariationConfig,
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
  LunchTwoWayOptions,
  PassengerMassOverride,
  PassengerTrace,
  ResolvedDayVariation,
  ResolvedDemandTemplate,
  RiseAndFallOptions,
  RoutePlan,
  RouteSegment,
  RouteTopology,
  TraceLeg,
  TrafficConfig,
  TrafficModelVersion,
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
 *
 * Phase 5 completed the twelve-term library and added `policies/` and
 * `predictor/` beneath this module. It added exactly one new tunable pair
 * (`auction.*`); the rest of Phase 5 is weight vectors in
 * `data/dispatcher-profiles.json` and existing categorical parameters made to
 * bite. `zoneFloorIdsFor` from `terms/observation.ts` arrives here as
 * `observedZoneFloorIdsFor` — see `dispatch/index.ts` for why the other one
 * keeps the bare name.
 * -------------------------------------------------------------------------- */

export {
  ANSWER_REASONS,
  ArrivalWindow,
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
  IDLE_TRAFFIC,
  IMPLEMENTED_TERM_IDS,
  INITIAL_SELECTOR_STATE,
  INELIGIBILITY_REASONS,
  NORMALIZATION_DEFAULTS,
  NORMALIZATION_SCALE_IDS,
  PARK_CALL_HORIZON,
  REPOSITION_REASONS,
  SELECTOR_INPUTS,
  STARVATION_HALF_COST_S,
  WEIGHT_SET_POLICIES,
  WeightedCostDispatchPolicy,
  addedStopCount,
  answerDecisionFor,
  armMembership,
  assessDirectionReversal,
  assignmentWidth,
  batchKeyOf,
  bestScore,
  boundedNormalize,
  callCarriesCredential,
  clearsHysteresis,
  compareRoutes,
  compareScores,
  costRequestFor,
  costTerm,
  createDispatchPolicy,
  crowdingTerm,
  demandForecastOf,
  demandMisalignmentM,
  detourPassengerSeconds,
  detourPenaltyTerm,
  directionReversalTerm,
  directionReversals,
  dispatchParameter,
  dispatchParameterValue,
  distanceTravelledTerm,
  existingCallDelaySeconds,
  existingCallDelayTerm,
  expectedResponseSeconds,
  filterEligible,
  isCommitted,
  isDeclaredTerm,
  isImplementedTerm,
  isSelectorInput,
  landingShare,
  loadFactorTerm,
  marginalDistanceM,
  moveSeconds,
  newLifecycle,
  normalizeTerm,
  observationFor,
  observedZoneFloorIdsFor,
  oldestDelayedCallAgeS,
  pathLengthM,
  predictedDemandTerm,
  rampMembership,
  rankScores,
  repositionDecisionFor,
  requestForCar,
  requestForShare,
  resolveDispatchConfig,
  resolveNormalization,
  resolveWeightSets,
  resolveWeights,
  resultingLoadFactor,
  rideTimeSeconds,
  rideTimeTerm,
  routeComparison,
  routeEndHeightM,
  routeStartHeightM,
  saturatingNormalize,
  scoreCar,
  scoreableAt,
  selectWeightSet,
  spareSeatsOnArrival,
  starvationSeconds,
  starvationTerm,
  stopCountTerm,
  tunablePathsOf,
  unservedQueueFraction,
  waitTimeSeconds,
  waitTimeTerm,
  weightSetSourceFrom,
  withBypassOverridden,
  withLifecycle,
  zoneAffinityTerm,
  zoneDeviationM,
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
  DelayedStop,
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
  ExpectedDemandByFloor,
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
  ResolvedSelection,
  ResolvedWeightSets,
  ReversalAssessment,
  RouteComparison,
  SaturatingNormalization,
  ScoreBreakdown,
  SelectionStageConfig,
  SelectorInput,
  SelectorState,
  MembershipRamp,
  PatternSwitchingSource,
  TermContext,
  TermNormalization,
  TrafficObservation,
  WeightSetArm,
  WeightSetLibrarySource,
  WeightSetPolicy,
  WeightSetSelectionResult,
  WeightSetSource,
} from './dispatch/index.js';

/* -------------------------------------------------------------------------- *
 * dispatch/policies — Phase 5. What changes when you change *who aggregates*
 * rather than *what is aggregated*: contract-net bidding beside the central
 * scorer (so the agent-autonomy hypothesis is benchmarked rather than assumed),
 * the load-sensor edge that triggers stage-5 migration, operational zoning —
 * the third kind, distinct from service and access zoning — and stage 7's
 * pre-positioning plan. All four reuse the term library and the seven stages
 * unchanged; none reads a profile id (invariant 7).
 * -------------------------------------------------------------------------- */

export {
  AuctionDispatchPolicy,
  CapacityReassignmentMonitor,
  MAX_AUCTION_ROUNDS,
  POLICY_DEFAULTS,
  POLICY_FACTORIES,
  POLICY_PARAMETERS,
  POLICY_PARAMETER_IDS,
  WITHDRAWAL_REASONS,
  aggregationOf,
  bandRange,
  bidsFrom,
  carSnapshotsById,
  consideredCalls,
  contiguousZones,
  createAuctionPolicy,
  createPolicyFor,
  fixedForecast,
  groupContext,
  hasMigrations,
  heldBy,
  loadCrossings,
  movesOf,
  observedContext,
  parkingFloorIds,
  peakReassignments,
  policyParameter,
  prepositionPlan,
  profileAsPolicySource,
  repositionContextFor,
  resolveAuctionConfig,
  resolvePrepositionContext,
  runAuction,
  withLandingCounts,
  zoneAssignment,
  zoneFloorIdsFor,
} from './dispatch/index.js';

export type {
  AuctionOutcome,
  AuctionPolicyOptions,
  AuctionProfileSource,
  AuctionStageConfig,
  Bid,
  BidSource,
  CallContextSource,
  CallMigration,
  CapacityReassignmentResult,
  DemandForecastSource,
  DispatchPolicyFactory,
  GroupContextOptions,
  GroupObservationContext,
  LoadCrossing,
  OperationalZone,
  ParkableGroup,
  PrepositionContext,
  ReassignableGroup,
  ResolvedAuctionConfig,
  ResolvedAuctionStage,
  ResolvedPrepositionContext,
  Withdrawal,
  WithdrawalReason,
  ZoneAssignment,
} from './dispatch/index.js';

/* -------------------------------------------------------------------------- *
 * dispatch/predictor — Phase 5. The learned per-floor, per-direction,
 * per-time-of-day arrival model that `parkingStrategy: predicted-demand` and the
 * `predictedDemand` cost term read.
 *
 * It is built so that peeking is unavailable rather than merely forbidden: every
 * import in that directory is type-only and none leaves it, so the emitted module
 * cannot reach `traffic/`, the generator or the kernel. Facts enter through
 * `observe(floor, direction, at)`; the estimator folds *completed* buckets only,
 * and a read for a time earlier than the last observation throws rather than
 * quietly answering about a bucket that has since advanced. A predictor with the
 * trace is an oracle, and an oracle anticipates nothing (invariants 2, 3).
 * -------------------------------------------------------------------------- */

export {
  PREDICTOR_DEFAULTS,
  PREDICTOR_PARAMETERS,
  PREDICTOR_PARAMETER_IDS,
  PredictorError,
  createArrivalModel,
  predictorParameter,
  predictorParameterValue,
  resolvePredictorConfig,
  tunablePredictorPathsOf,
} from './dispatch/index.js';

export type {
  ArrivalModel,
  ArrivalModelOptions,
  DemandForecast,
  PredictorIdleSource,
  ResolvedPredictorConfig,
} from './dispatch/index.js';

/* -------------------------------------------------------------------------- *
 * metrics/ — recorder → RunRecord → RunSummary. The record is the seed-bearing
 * dataset that gets persisted (invariant 5); the summary is a pure function of
 * it, so Phase 3 can re-window or re-threshold a stored run without
 * re-simulating. Nothing here reads a clock (3) or draws a number (2).
 * -------------------------------------------------------------------------- */

export {
  AWT_INVALID_GROUNDS,
  diagnoseAwtValidity,
  DEFAULT_DEPARTURE_GAP_S,
  DEFAULT_DESIGN_LOAD_FACTOR,
  DEFAULT_LOAD_FACTOR_EDGES,
  DEFAULT_LONG_WAIT_THRESHOLD_S,
  DEFAULT_MAX_ABANDONMENT_FRACTION,
  DEFAULT_MAX_UNSERVED_FRACTION,
  DEFAULT_MAX_WAIT_HORIZON_S,
  DEFAULT_PERCENTILE_METHOD,
  DEFAULT_QUEUE_SAMPLE_COUNT,
  DEFAULT_WAIT_HISTOGRAM_BIN_S,
  DEPARTURE_GAP_BASES,
  DEPARTURE_GAP_REOPEN_MARGIN,
  FALLBACK_DEPARTURE_GAP_S,
  HANDLING_CAPACITY_WINDOW_S,
  METRICS_PARAMETERS,
  COUNTERWEIGHT_BALANCE_RATIO,
  METRICS_SCHEMA_VERSION,
  outOfBalanceWorkJ,
  STANDARD_GRAVITY_MPS2,
  COMPARABLE_METRIC_IDS,
  MODEL_SENSITIVE_METRICS,
  MODEL_SENSITIVE_METRIC_IDS,
  PASSENGER_MODELS,
  comparabilityDisclaimer,
  comparabilityOf,
  passengerModelOf,
  MetricsError,
  MetricsRecorder,
  PEAK_WINDOW_S,
  PERCENTILE_METHODS,
  QUEUE_SERIES_SOURCES,
  SATURATION_DEFAULTS,
  SATURATION_VERDICTS,
  SERVICE_LEVEL_VERDICTS,
  achievedIntervalOf,
  assertWindow,
  buildJourneys,
  carTimingsSchema,
  countAbove,
  departureGapBracket,
  detectSaturation,
  diagnoseServiceLevel,
  fractionAbove,
  fullRunWindow,
  handlingCapacityOf,
  histogram,
  legDurations,
  legSecondsOf,
  linearTrend,
  energyStatistics,
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
  summarizeAbandonment,
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
  AssignmentDetails,
  AwtInvalidGround,
  AwtInvalidity,
  AwtValidityEvidence,
  BoardingDetails,
  CarTimings,
  ModelSensitiveMetric,
  PassengerModel,
  RunComparability,
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
  EnergyStatistics,
  LoadReading,
  LoadSample,
  MetricsParameterSpec,
  MetricsParameterType,
  MetricsRecorderOptions,
  PassengerRecord,
  PeakWindowOptions,
  PercentileMethod,
  QueueSample,
  TravelReading,
  TravelSample,
  QueueSeriesOptions,
  QueueSeriesSource,
  RecordablePassenger,
  ReportWindow,
  RunCounts,
  RunRecord,
  RunSummary,
  SaturationDiagnosis,
  SaturationOptions,
  ServiceLevelOptions,
  SaturationThresholds,
  SaturationVerdict,
  ServiceLevelDiagnosis,
  ServiceLevelVerdict,
  SeedSource,
  SerializeOptions,
  SummarizeOptions,
  TrendPoint,
  WaitOptions,
  AbandonmentStatistics,
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
  PATIENCE_DISTRIBUTIONS,
  PATIENCE_PARAMETERS,
  SIM_PARAMETERS,
  Simulation,
  SimulationError,
  TIMEOUT_POLICIES,
  UNDELIVERED_REASONS,
  batchArrivalEvent,
  carArrivedEvent,
  carDoorEvent,
  dispatchTickEvent,
  drawPatienceSeconds,
  queueSampleEvent,
  runSimulation,
  serviceChangeEvent,
  transferArrivalEvent,
} from './sim/index.js';

export type {
  BatchArrivalPayload,
  CarEventPayload,
  ConservationAudit,
  DispatchTickPayload,
  QueueSamplePayload,
  ServiceChangePayload,
  SimEventType,
  SimParameterSpec,
  SimParameterType,
  PatienceConfig,
  PatienceDistribution,
  SimulationConfig,
  SimulationDemandOptions,
  SimulationResult,
  SimulationStatus,
  StageActivity,
  TimeoutPolicy,
  TransferArrivalPayload,
  UndeliveredJourney,
  UndeliveredReason,
} from './sim/index.js';
