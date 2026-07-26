/**
 * `core/sim` — the run loop.
 *
 * Everything else in this package is a piece; this is the machine. A seed, a building, a
 * dispatcher profile and a demand template go in, and one replication comes out:
 *
 * ```ts
 * import { loadConfig, runSimulation } from '@elevator-sim/core';
 *
 * const config = await loadConfig('data');
 * const result = runSimulation({
 *   building: config.buildingsById.get('midtown-office')!,
 *   dispatcherProfile: config.dispatcherProfilesById.get('collective')!,
 *   trafficProfiles: config.trafficProfiles,
 *   elevatorSpecs: config.elevatorSpecs,
 *   seed: 20260726,
 * });
 *
 * result.summary.waiting.meanS;             // AWT over the peak 5 minutes
 * result.summary.waiting.p95S;              // WT95
 * result.summary.timeToDestination.meanS;   // TTD, spanning every sky-lobby transfer
 * result.conservation;                      // the books, balanced
 * ```
 *
 * Swapping `'collective'` for `'nearest-car'` swaps the dispatcher and nothing else, because
 * nothing in here reads a profile id (CLAUDE.md invariant 7).
 *
 * ## The three things this module guarantees
 *
 * - **Determinism.** The same `(seed, config)` gives a structurally identical result, every
 *   time. The trace is generated up front from the `arrivals`/`origins`/`destinations`/
 *   `passengerMass` streams before a car moves, so it is a function of the seed alone and is
 *   unaffected by anything the elevators do — which is what common random numbers need
 *   (docs/03-traffic-and-statistics.md § Part 4). The run itself draws from `doorObstruction`
 *   and only when asked to model obstructions.
 * - **Conservation.** Every generated journey is delivered to the floor it asked for, or named
 *   in `result.undelivered`. The books are reconciled at the end of every run and a run that
 *   does not balance throws {@link SimulationError} instead of reporting a number.
 * - **No wall clock.** All time comes from the kernel (invariant 3), and the run is driven
 *   entirely by scheduled events — there is no tick anywhere in this module.
 */

/* -------------------------------------------------------------------------- *
 * The loop
 * -------------------------------------------------------------------------- */

export { Simulation, runSimulation } from './simulation.js';

export type { StageActivity } from './simulation.js';

/* -------------------------------------------------------------------------- *
 * Events
 * -------------------------------------------------------------------------- */

export {
  SIM_EVENT_TYPES,
  SIM_EVENT_TYPE_IDS,
  batchArrivalEvent,
  carArrivedEvent,
  carDoorEvent,
  dispatchTickEvent,
  queueSampleEvent,
  transferArrivalEvent,
} from './events.js';

export type {
  BatchArrivalPayload,
  CarEventPayload,
  DispatchTickPayload,
  QueueSamplePayload,
  SimEventType,
  TransferArrivalPayload,
} from './events.js';

/* -------------------------------------------------------------------------- *
 * Vocabulary and tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

export {
  SIMULATION_STATUSES,
  SIM_DEFAULTS,
  SIM_PARAMETERS,
  SimulationError,
  TIMEOUT_POLICIES,
  UNDELIVERED_REASONS,
} from './types.js';

export type {
  ConservationAudit,
  SimParameterSpec,
  SimParameterType,
  SimulationConfig,
  SimulationDemandOptions,
  SimulationResult,
  SimulationStatus,
  TimeoutPolicy,
  UndeliveredJourney,
  UndeliveredReason,
} from './types.js';
