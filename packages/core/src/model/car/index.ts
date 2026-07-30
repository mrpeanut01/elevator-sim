/**
 * `core/model/car` — the car entity.
 *
 * A car owns **physics and safety, never allocation policy** (docs/01-architecture.md):
 * motion driven by the jerk-limited S-curve profiles in `physics/motion`, doors driven by the
 * state machine in `physics/doors`, its own car calls, the load-weighing device, and its
 * service mode. Which car should answer a hall call is the group controller's question, and
 * nothing in here has an opinion about it.
 *
 * ```ts
 * const car = new Car({
 *   id: 'A', bankId: 'low', spec: resolvedCar,
 *   shaft: shaftForBank(resolvedBuilding, 'low'),
 *   homeFloorId: 'G', clock: kernel,
 *   loadSensorSpec: loaded.elevatorSpecs.loadSensor,
 *   answer: dispatcherProfile.answer,
 * });
 *
 * const estimate = car.estimateCost(hallCall);   // pure — no state changes
 * if (estimate.feasible) bid(estimate.etaSeconds, estimate.marginalDelaySeconds);
 * ```
 *
 * ## The one thing to get right
 *
 * `Car.estimateCost()` is **pure** — CLAUDE.md invariant 1 — because the dispatcher evaluates
 * thousands of hypotheticals per decision and must be able to discard every one of them. The
 * purity is structural rather than promised: the method delegates to the free function
 * {@link estimateCost}, whose only inputs are a frozen {@link CarSnapshot} and a
 * {@link CostRequest}. `estimateCost.ts` never imports `car.ts`, never imports `random/`, and
 * a snapshot exposes no method, no back-reference and no scheduler — so there is nothing to
 * mutate, nothing to draw from and nothing to schedule.
 *
 * Everything the estimator uses from `physics/` is likewise pure, and the ETA is built from
 * the real S-curve travel time rather than `distance / ratedSpeed`, which is the single most
 * common source of naive over-optimism about faster elevators.
 *
 * ## Names re-exported explicitly
 *
 * As in the package barrel, names are listed rather than star-exported, so widening this
 * module's public surface is a deliberate act and a future collision is a compile error here
 * rather than a silent shadow.
 */

/* -------------------------------------------------------------------------- *
 * The entity
 * -------------------------------------------------------------------------- */

export { CAR_DEFAULTS, CAR_PARAMETERS, Car } from './car.js';

export type {
  BoardOptions,
  CarDoorRecord,
  CarInit,
  CarMotionRecord,
  CarRecord,
} from './car.js';

/* -------------------------------------------------------------------------- *
 * The pure cost query (CLAUDE.md invariant 1)
 * -------------------------------------------------------------------------- */

export {
  directionTowardNearestStop,
  estimateCost,
  infeasibilityOf,
  projectRoute,
  requestedStop,
} from './estimateCost.js';

/* -------------------------------------------------------------------------- *
 * Load weighing
 * -------------------------------------------------------------------------- */

export {
  LOAD_SENSOR_DEFAULTS,
  LOAD_SENSOR_PARAMETERS,
  LoadSensor,
  loadFactorOf,
  resolveLoadSensor,
  totalMassKg,
} from './loadSensor.js';

export type {
  LoadSensorAnswerSource,
  LoadSensorOverrides,
  ResolvedLoadSensorConfig,
  WeighedOccupant,
} from './loadSensor.js';

/* -------------------------------------------------------------------------- *
 * Vocabulary
 * -------------------------------------------------------------------------- */

export {
  INFEASIBILITY_REASONS,
  createShaft,
  deckOfFloor,
  deckSlot,
  floorIdsServedAt,
  isAccessPermitted,
  shaftForBank,
  shaftFloor,
  shaftServes,
  stopFloorIdOf,
  stopFloorsOf,
} from './types.js';

export type {
  CarClock,
  CarLoadSnapshot,
  CarMotion,
  CarParameterSpec,
  CarParameterType,
  CarShaft,
  CarSnapshot,
  CommittedStop,
  CostEstimate,
  CostRequest,
  DeckStopSplit,
  InfeasibilityReason,
  RouteStop,
  ServedFloor,
  ServedFloorInit,
  ShaftOptions,
} from './types.js';
