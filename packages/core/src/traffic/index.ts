/**
 * `core/traffic` — passenger demand generation.
 *
 * Produces a **passenger trace**: a plain, immutable list of everyone who will travel during
 * one replication, computed before the simulation starts and unaffected by anything the
 * elevators subsequently do.
 *
 * ```ts
 * const loaded = await loadConfig('data');
 * const trace = generateTrace({
 *   building: loaded.buildingsById.get('midtown-office')!,
 *   profiles: loaded.trafficProfiles,
 *   streams: new StreamSet(20260726),
 * });
 * ```
 *
 * Three properties are the whole point:
 *
 * - **Replayable.** Same seed plus same config gives a byte-identical trace, so a stored run
 *   record replays exactly (CLAUDE.md invariant 5) and every dispatcher under comparison can
 *   be handed the identical passengers — the common-random-numbers mechanism that is worth
 *   5–20x in required replications (docs/03-traffic-and-statistics.md § Part 4).
 * - **Stream-disciplined.** Arrival times and batch sizes come from `arrivals`, the entrance
 *   an incoming batch walks through from `origins`, destinations from `destinations`, body
 *   mass from `passengerMass`. `doorObstruction` and `policyNoise` are never touched, and the
 *   tests assert it — generating a trace must not shift the streams the *run* draws from.
 * - **Data-driven.** Rates, splits, batch distributions and template geometry all come from
 *   `data/traffic-profiles.json` and the per-floor `trafficProfile` overrides in
 *   `data/buildings/`. The code contributes the *shape* of a ramp and the *form* of a
 *   compound Poisson process, nothing more (CLAUDE.md invariants 7 and 8; every knob is
 *   declared in {@link TRAFFIC_PARAMETERS}).
 *
 * Note on module dependencies: this module reads config *types* and the model's
 * `PassengerInit`/`CredentialGroup` types, and imports no model runtime. Nothing here touches
 * the kernel, the clock or `viz`.
 */

/* -------------------------------------------------------------------------- *
 * Vocabulary, defaults and the tunable schema
 * -------------------------------------------------------------------------- */

export {
  CREDENTIAL_ASSIGNMENTS,
  DEMAND_LEVELS,
  DEMAND_SOURCE_KINDS,
  DEMAND_TEMPLATE_IDS,
  DIRECTION_CATEGORIES,
  INTERFLOOR_WEIGHTINGS,
  TRAFFIC_DEFAULTS,
  TRAFFIC_MODEL_VERSIONS,
  TRAFFIC_PARAMETERS,
  TrafficError,
} from './types.js';

export type {
  ArrivalEvent,
  CredentialAssignment,
  DemandLevel,
  DemandPhase,
  DemandSource,
  DemandSourceKind,
  DemandTemplateId,
  DemandTemplateOverrides,
  DestinationWeight,
  DirectionCategory,
  GeneratedPassenger,
  InterfloorWeighting,
  PassengerTrace,
  ResolvedDemandTemplate,
  TraceLeg,
  TrafficConfig,
  TrafficModelVersion,
  TrafficParameterSpec,
  TrafficParameterType,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The Poisson batch process and the rate conversion
 * -------------------------------------------------------------------------- */

export {
  SECONDS_PER_5MIN,
  SUPPORTED_BATCH_DISTRIBUTIONS,
  batchesPerSecond,
  drawBatchSize,
  drawGeometricBatchSize,
  passengersPer5Min,
  passengersPerSecond,
  sampleBatchArrivalTimes,
} from './poissonBatch.js';

export type { BatchArrivalOptions } from './poissonBatch.js';

/* -------------------------------------------------------------------------- *
 * Demand templates
 * -------------------------------------------------------------------------- */

export {
  LUNCH_TWO_WAY_SPLIT_AT_END,
  LUNCH_TWO_WAY_SPLIT_AT_START,
  constantDemandTemplate,
  expectedPassengers,
  inReportWindow,
  integratedIntensityS,
  intensityAt,
  lunchTwoWayTemplate,
  resolveDemandTemplate,
  riseAndFallTemplate,
  splitAt,
} from './demandTemplate.js';

export type {
  ConstantDemandOptions,
  DemandTemplateSpec,
  LunchTwoWayOptions,
  RiseAndFallOptions,
} from './demandTemplate.js';

/* -------------------------------------------------------------------------- *
 * Route planning over service zoning
 * -------------------------------------------------------------------------- */

export { RoutePlanner, legDestinations, routeTopologyOf } from './route.js';
export type { RoutePlan, RouteSegment } from './route.js';

export type { RouteTopology } from './route.js';

/* -------------------------------------------------------------------------- *
 * The generator
 * -------------------------------------------------------------------------- */

export {
  generateTrace,
  planDemand,
  routeOf,
  toPassengerInit,
  transferFloorsOf,
} from './generator.js';

export type { DemandConfig, DemandPlan, EntranceShare } from './generator.js';
