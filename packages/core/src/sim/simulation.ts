/**
 * The run loop — the first place in this project where anything actually gets simulated.
 *
 * ```ts
 * const config = await loadConfig('data');
 * const result = runSimulation({
 *   building: config.buildingsById.get('midtown-office')!,
 *   dispatcherProfile: config.dispatcherProfilesById.get('nearest-car')!,
 *   trafficProfiles: config.trafficProfiles,
 *   elevatorSpecs: config.elevatorSpecs,
 *   seed: 20260726,
 * });
 *
 * result.summary.waiting.meanS;        // AWT over the peak 5 minutes
 * result.conservation.balanced;        // always true, or the run threw
 * result.undelivered;                  // named, never dropped
 * ```
 *
 * ## The shape of the loop
 *
 * Everything is kernel-driven; there is no tick and no wall clock anywhere (invariant 3).
 *
 * 1. **The trace is generated up front**, from the seed alone, before a single car moves. That
 *    is what common random numbers require: the passenger population must be a function of
 *    `(seed, config)` and must not shift when a dispatcher behaves differently
 *    (docs/03-traffic-and-statistics.md § Part 4). The run therefore draws from **no** stream
 *    except `doorObstruction`, and only when a non-zero obstruction probability asks it to.
 * 2. **Each batch is one kernel event.** Its passengers appear at the landing together, one
 *    button press between them.
 * 3. **Registration lights buttons and opens calls**, one per `(bank, floor, direction)` — see
 *    "Why calls are per bank" below — and runs the seven-stage lifecycle for that bank. Under
 *    `dispatch.passengerAssignment: 'panel'` the allocation unit gains a fourth component, the
 *    **destination**: the landing has no direction button, so two people going to two different
 *    floors are two requests. See "Destination dispatch" below.
 * 4. **Cars execute their own commitments.** A car that is idle either stops where it stands,
 *    departs for the next stop on its projected route, or parks. Travel is the jerk-limited
 *    S-curve; the stop is the real door machine; boarding is bounded by the load cell.
 * 5. **Every passenger event goes to the recorder** at the instant it happens.
 * 6. **The run ends when the trace is exhausted and nobody is left in the system** — or when
 *    the drain deadline fires, which is reported as a failure and never trimmed away. Nothing
 *    is scheduled past that deadline: not travel, not a dispatch retry, not a door. A third
 *    ending, `aborted`, is reserved for the event valve tripping, and is kept apart from a
 *    timeout because one is a saturated building and the other is a broken loop. Anything else
 *    a handler throws comes straight back out of {@link Simulation.run} unchanged.
 *
 * ## Why calls are per bank
 *
 * `Floor` models the physical button: one live call per floor per direction, exactly as the
 * landing has one panel per direction. But a **group controller is per bank**
 * (docs/01-architecture.md), and Mixed-Use High-Rise's ground lobby is served by two of them
 * whose shafts go to entirely different places. A single shared call would either be allocated
 * by one bank on behalf of passengers it cannot carry, or force the two banks into one
 * controller. So the physical button and the allocation unit are kept apart: the `Floor` light
 * is lit while anyone waits, and each bank that can carry *somebody* in that queue gets its own
 * `DispatchCall` with its own lifecycle.
 *
 * ## Destination dispatch — the passenger model, not a cost term
 *
 * `dispatch.callType` decides what the *dispatcher* knows; `dispatch.passengerAssignment` decides
 * what the *passenger is told*, and only the second changes what a passenger is. Under `'panel'`:
 *
 * - the allocation unit is `(bank, floor, direction, destination)` rather than the button, so the
 *   call count rises with the number of distinct destinations at a landing (measured: 25 → 70 on
 *   Midtown at the interfloor-mix operating point);
 * - `#applyDecision` **tells the panel** — every unpromised passenger of that request is assigned
 *   the car the group just chose, write-once, and the promise reaches the recorder in the same
 *   statement pair — **while that car still has room to promise**. `#tellThePanel` will not put
 *   more mass on a car's deck than its design load, for the same reason `#boardFrom` will not put
 *   more mass in it: the panel used to promise every waiter to `carIds[0]` unbounded, and on
 *   Vertical City that was 81 riders at the median promised to a car holding 13 to 20;
 * - `#boardFrom` refuses anyone whose promise names another car, or whose walk
 *   (`sim.assignedWalkS`) is not finished;
 * - a car that fills up leaves promised passengers behind rather than handing them on. Their
 *   promise **stands** (DECISIONS.md § D29) and `#candidateCars` gives the call straight back to
 *   the same car — *while everybody still standing there is one of them*.
 *   `ConservationAudit.brokenPromises` counts how often that happens, and it is a *result* — the
 *   price of committing at the panel — not a failure;
 * - a rider who arrives at that landing **later and has been told nothing** does not inherit the
 *   pin: the call is scored over the whole bank again, `#applyDecision` keeps the promised car on
 *   it so nobody's promise becomes a car that is no longer coming, and no existing promise moves.
 *   D29 protects the passenger the panel has answered; it says nothing about the one it has not;
 * - a car that leaves **group control** is the one exception: a promise it holds is revoked
 *   (`#revokePromisesTo`), because D29's argument is about a car that will empty and come back and
 *   an `independent` car will not. Counted separately in `ConservationAudit.promisesRevoked`;
 *   `the root DECISIONS.md` § T22-D1, and the Phase 8 P5 counterexample it closed;
 * - the panel performs the access check, so an authorized request is not refused a second time by
 *   `estimateCost` for want of a credential (§ D30).
 *
 * `'none'` is the default and every branch above reduces to the code that was there before it
 * existed, byte for byte: 0 of 55 shipped (building, profile) cells at seed 20260726 move.
 *
 * Nine of the twenty-three recorded metrics stop being comparable across the two models
 * (`metrics/comparability.ts`); the run says so in `result.comparability` and in a disclaimer.
 *
 * ## How nobody gets lost
 *
 * Four mechanisms, in increasing order of how much they are relied on:
 *
 * - **Boarding is a `takeWaiting` with a serve predicate.** A passenger only ever leaves the
 *   landing queue by entering a car whose shaft reaches their destination and whose access
 *   zoning admits their credential — and, under a panel, which is the car they were promised.
 *   There is no other path out of the queue, and `ConservationAudit.wrongCarBoardings` is the
 *   assertion that says so rather than the assumption.
 * - **A hall call is extinguished only when the landing has no eligible passenger left.** A car
 *   that fills up releases the call instead of completing it, and the group re-allocates it —
 *   which is the overflow case, and the reason a full car cannot delete a queue.
 * - **Alighting is `Car.alight`**, which refuses any floor that is not the passenger's
 *   destination. Nobody can be put out in the wrong place.
 * - **The books are reconciled at the end of every run** against the generated trace. A journey
 *   is delivered, or it is named in {@link SimulationResult.undelivered}. Anything else throws.
 */

import { findPassengerTransferS } from '../config/resolveCar.js';
import { SERVICE_MODES, isDestinationCallType } from '../config/types.js';
import type {
  DispatcherProfile,
  FloorConfig,
  ResolvedBank,
  ResolvedBuilding,
  ResolvedServiceEvent,
} from '../config/types.js';
import {
  CapacityReassignmentMonitor,
  DISPATCH_DEFAULTS,
  callCarriesCredential,
  createArrivalModel,
  createPolicyFor,
  groupContext,
  repositionContextFor,
  resolvePrepositionContext,
  resolveWeights,
  weightSetSourceFrom,
  withLandingCounts,
  type ArrivalModel,
  type CallContextSource,
  type DemandForecastSource,
  type DispatchCall,
  type DispatchDecision,
  type DispatchPolicy,
  type GroupObservationContext,
  type ResolvedIdleStage,
} from '../dispatch/index.js';
import { SimKernel, type ScheduledEvent, type SimTime } from '../kernel/index.js';
import {
  comparabilityDisclaimer,
  comparabilityOf,
  passengerModelOf,
  type PassengerModel,
} from '../metrics/comparability.js';
import { MetricsRecorder } from '../metrics/recorder.js';
import { PEAK_WINDOW_S, departureGapBracket, summarizeRun } from '../metrics/summarize.js';
import { MetricsError } from '../metrics/types.js';
import type { CarTimings, ReportWindow, RunRecord, RunSummary } from '../metrics/types.js';
import {
  CAR_DEFAULTS,
  Car,
  deckSlot,
  isAccessPermitted,
  shaftForBank,
  type CarSnapshot,
  type CommittedStop,
} from '../model/car/index.js';
import {
  DIRECTIONS,
  Passenger,
  PassengerFactory,
  createBuilding,
  type Bank,
  type Building,
  type Direction,
  type Floor,
  type HallCall,
} from '../model/index.js';
import type { DoorCrowdingConfig } from '../physics/doors/index.js';
import { travelTime } from '../physics/motion/index.js';
import { StreamSet } from '../random/index.js';
import {
  egressTransitSecondsOf,
  generateTrace,
  leadingTransitSecondsOf,
  toPassengerInit,
  transportHopBefore,
} from '../traffic/generator.js';
import type {
  GeneratedPassenger,
  PassengerTrace,
  TraceTransportHop,
  TrafficConfig,
  TrafficModelVersion,
} from '../traffic/types.js';

import {
  abandonmentEvent,
  batchArrivalEvent,
  carArrivedEvent,
  carDoorEvent,
  dispatchTickEvent,
  interventionEvent,
  queueSampleEvent,
  serviceChangeEvent,
  transferArrivalEvent,
  transportArrivalEvent,
} from './events.js';
import {
  drawStairsChoices,
  stairsIndexOf,
  type StairsOffer,
} from './stairs.js';
import {
  drawPatienceTable,
  patienceKeyOf,
  requireValidPatience,
  type PatienceConfig,
} from './patience.js';
import {
  INTERVENTION_KINDS,
  isInterventionKind,
  SIM_DEFAULTS,
  SimulationError,
  type ConservationAudit,
  type RunInterventionConfig,
  type SimulationConfig,
  type StageActivity,
  type SimulationResult,
  type SimulationStatus,
  type UndeliveredJourney,
  type UndeliveredReason,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Internal state
 * -------------------------------------------------------------------------- */

/**
 * One bank's allocation unit for one landing queue.
 *
 * `call` doubles as the {@link DispatchCall} the policy scores and the {@link HallCall} the car
 * accepts — the two interfaces agree on every field, deliberately, so a runner cannot hand the
 * dispatcher one identity and the car another.
 */
interface ActiveCall {
  readonly id: string;
  readonly bankId: string;
  readonly floorId: string;
  readonly direction: Direction;
  /**
   * The destination this call is *for*, under destination dispatch; `undefined` otherwise.
   *
   * This is what makes the allocation unit an **origin-destination pair** rather than a button.
   * Two people at one landing bound for two different floors are two requests here, where a
   * conventional landing has one up button between them, and it is the whole mechanism by which
   * a destination dispatcher can send them to different cars. `#eligibleWaiting` filters the
   * landing queue on it, so a call never counts — or is completed by — somebody going elsewhere.
   */
  readonly destinationFloorId?: string | undefined;
  /**
   * Frozen. `registeredAt` is the first press and is never refreshed; the credential is
   * whoever is at the head of the queue, and is refreshed when the call is re-offered.
   */
  call: DispatchCall & HallCall;
  /** Cars currently holding it, best first. More than one only under `split-demand`. */
  carIds: readonly string[];
}

/**
 * Ineligibility reasons that will still be true next time.
 *
 * Service and access zoning are properties of the fabric and the credential, not of the
 * moment: re-offering such a call every few seconds for the rest of the run cannot change the
 * answer, it just burns events and hides the diagnosis. Load, mode and direction all change on
 * their own, so a call rejected for one of those is worth asking about again.
 */
const STRUCTURAL_INELIGIBILITY: ReadonlySet<string> = new Set([
  'serviceZone',
  'destinationServiceZone',
  'destinationAccessDenied',
]);

/**
 * How the kernel stopped, which is not the same question as whether everybody was delivered.
 *
 * `drained` is the only outcome in which the run is a measurement of anything: the queue
 * emptied on its own. `event-budget` means a handler was still producing work when the valve
 * tripped, and the numbers that come out of it describe a run that never finished.
 */
type RunEndReason = 'drained' | 'event-budget';

/** What {@link Simulation.beginStop} did, since two of the three outcomes are not a stop. */
type StopOutcome =
  /** The doors are opening and a door event is queued. */
  | 'stopped'
  /**
   * Nobody would have got in or out. The caller surrenders whatever calls it answered rather
   * than cycling the doors for nobody — see {@link Simulation.serveHere}.
   */
  | 'nobody-would-move'
  /** Past the drain deadline. No new work is begun past it, doors included. */
  | 'past-deadline';

/** Refusals of one call by one car, for the end-of-run diagnosis. */
interface RefusalTally {
  count: number;
  readonly reasons: Set<string>;
}

/**
 * Refusals of the same call by the same car before the run says so in its warnings.
 *
 * A car may honestly refuse a call it was allocated a few times over a run — it arrives full,
 * surrenders it, and the group re-offers it. Refusing the *same* call this many times while
 * the landing stays occupied is not overflow, it is a car and a group that disagree, and the
 * run must say which call rather than merely reporting itself slow.
 */
const REFUSAL_WARNING_THRESHOLD = 8;

/** A stop in progress: who is getting out, who may get in, and which calls it answers. */
interface StopInProgress {
  readonly alighting: readonly Passenger[];
  readonly served: readonly ActiveCall[];
  /** Landing queues this car will load from, up before down. See `#boardingDirections`. */
  readonly directions: readonly Direction[];
  /**
   * Set once the doors reach fully open and people have actually moved.
   *
   * Cleared again by a granted **late-arrival reopen**, which is what lets the courtesy hold
   * board the passenger it was granted for — see `#reopenForLateArrival`.
   */
  transferred: boolean;
  /**
   * Set once the alighting cohort has left, and **never cleared**.
   *
   * Separate from {@link transferred} because a reopen replays the boarding half of the transfer
   * and must not replay the alighting half: `stop.alighting` is the list computed when the stop
   * began, and calling `Car.alight` twice for the same passenger is a conservation defect rather
   * than a second alighting.
   */
  alighted: boolean;
}

/** How many are waiting for a call, and what they weigh. */
interface WaitingTally {
  readonly count: number;
  readonly massKg: number;
}

/** Options with every default applied. */
interface ResolvedOptions {
  readonly transferWalkS: number;
  readonly assignedWalkS: number;
  readonly dispatchRetryS: number;
  readonly drainGraceS: number;
  readonly queueSampleCount: number;
  readonly doorObstructionProbability: number;
  readonly maxEvents: number;
  readonly onTimeout: 'throw' | 'report';
  /**
   * The declared patience curve, or `undefined` when the run models none — which is every run
   * this repository has published (docs/14 § 3.1).
   */
  readonly patience: PatienceConfig | undefined;
  /** The lobby-crowding term, or `undefined` when the run models none (docs/14 § 3.2). */
  readonly lobbyCrowding: DoorCrowdingConfig | undefined;
}

/**
 * Same-instant dispatch passes before the bank gives up and waits for a timed retry.
 *
 * A pass can dirty the bank again — a car that turns out to be bypassing releases its call, and
 * the call has to be re-offered — but that cannot go on forever, because every release is
 * caused by a car whose load the re-offer then filters out. The cap is a guard against a
 * dispatcher configuration nobody has written yet, not against the ones that exist.
 */
const MAX_DISPATCH_PASSES = 6;

/**
 * Identity of an allocation unit.
 *
 * `(bank, floor, direction)` conventionally — the button, one live call per landing per way.
 * `(bank, floor, direction, destination)` under destination dispatch — the request, one live
 * call per origin-destination pair. The direction stays in the key even though the destination
 * implies it: it keeps every id parseable by the same reader, and it keeps two calls that a
 * hand-written fixture might give the same destination on different floors distinct.
 *
 * Matches `dispatch/lifecycle.ts`'s `batchKeyOf` in *what it keys on* and deliberately not in
 * format: this is the runner's per-bank id, that is the policy's per-batch key, and a bank has
 * to appear here and must not appear there.
 */
function callIdOf(
  bankId: string,
  floorId: string,
  direction: Direction,
  destinationFloorId?: string | undefined,
): string {
  const base = `${bankId}#${floorId}:${direction}`;
  return destinationFloorId === undefined ? base : `${base}→${destinationFloorId}`;
}

/**
 * One bank's forecast, taken at most once per instant per observation.
 *
 * `prepositioning.ts` requires **one forecast per bank, not one per car** — *"asking the predictor
 * once per car would let two cars in one bank be placed against two different forecasts"* — and
 * stage 7 is decided per car, so something has to hold the answer between them. This does, and it
 * is a cache rather than a policy: the model's `expectedDemandByFloor` is pure, so the answer is a
 * function of `(observations, fromT)` alone and re-asking with both unchanged cannot produce a
 * different number.
 *
 * The key is `(fromT, observedArrivals)`. `observe` increments the count on every call — `count`
 * is a positive integer — so an unchanged count means no observation happened and the model state
 * is bit-identical. Nothing here is approximate; a stale entry is impossible rather than unlikely.
 *
 * A caller-supplied `horizonS` bypasses the cache entirely. Nothing in the runner passes one — the
 * model answers over its own `idle.predictorHorizonS`, which `PREDICTOR_PARAMETERS` declares and
 * the runner deliberately does not — so the path exists only so the wrapper cannot lie about a
 * question it was actually asked.
 */
class BankDemandForecast implements DemandForecastSource {
  readonly model: ArrivalModel;
  #fromT: SimTime | undefined;
  #arrivals = -1;
  #value: ReadonlyMap<string, number> | undefined;

  constructor(model: ArrivalModel) {
    this.model = model;
  }

  expectedDemandByFloor(
    fromT: SimTime,
    horizonS?: number | undefined,
  ): ReadonlyMap<string, number> {
    if (horizonS !== undefined) return this.model.expectedDemandByFloor(fromT, horizonS);
    if (
      this.#value !== undefined &&
      this.#fromT === fromT &&
      this.#arrivals === this.model.observedArrivals
    ) {
      return this.#value;
    }
    const value = this.model.expectedDemandByFloor(fromT);
    this.#fromT = fromT;
    this.#arrivals = this.model.observedArrivals;
    this.#value = value;
    return value;
  }
}


/* -------------------------------------------------------------------------- *
 * The simulation
 * -------------------------------------------------------------------------- */

/**
 * One replication, from seed to {@link SimulationResult}.
 *
 * Constructed, run once, and discarded: everything mutable is per-run, so there is no state a
 * second replication could inherit. Callers normally use {@link runSimulation}.
 */
export class Simulation {
  readonly #options: ResolvedOptions;
  readonly #streams: StreamSet;
  readonly #kernel: SimKernel;
  readonly #trace: PassengerTrace;
  readonly #resolved: ResolvedBuilding;
  readonly #building: Building<Car>;
  readonly #recorder: MetricsRecorder;
  readonly #factory: PassengerFactory;
  readonly #profileId: string;
  /**
   * **The Level-0 / Level-1 switch, resolved once.**
   *
   * `true` only under `dispatch.passengerAssignment: 'panel'`. Read all over the run loop, and
   * read from the *policy's resolved config* rather than from the authored profile, so a default
   * and an authored value cannot disagree. Every bank of a run shares one profile, so one boolean
   * is the whole of it.
   *
   * Where it is `false` — which is every run this project produced before this phase, and every
   * destination *disclosure* run — each branch below reduces to exactly the code that was there,
   * which is what makes `passengerAssignment` provably flat outside its own gate.
   */
  readonly #panelAssigns: boolean;
  readonly #passengerModel: PassengerModel;
  /**
   * The traffic draw ordering this run asked for, or `undefined` for the default.
   *
   * Kept as the caller gave it rather than resolved to `'v1'`, because the result reports it by
   * *presence* and resolving here would lose the only distinction the result needs to make. See
   * {@link SimulationResult.trafficModel}.
   */
  readonly #trafficModel: TrafficModelVersion | undefined;
  readonly #runId: string;
  readonly #reportWindow: ReportWindow;
  readonly #summarizeOptions: SimulationConfig['summarize'];
  readonly #windowSelection: SimulationConfig['reportWindow'];
  readonly #entranceFloorIds: readonly string[];
  /**
   * The same entrance floors as shaft indices, for the weight-set selector's traffic detector.
   *
   * Resolved once with {@link #entranceFloorIds} rather than per dispatch pass, and by index
   * rather than by id because a `DispatchCall` carries `floorIndex` and the detector counts
   * arrivals off calls.
   */
  readonly #entranceFloorIndices: ReadonlySet<number>;
  /** Seconds after local midnight at `t = 0`, or `undefined` on a template with no clock. */
  readonly #startOfDayS: number | undefined;
  readonly #deadlineS: SimTime;
  /**
   * The run's intervention log, in authored order — `SimulationConfig.interventions`, or `[]`.
   *
   * Read in three places and only three: {@link #scheduleInterventions}, which puts one kernel
   * event on the queue per acting entry so an already-idle fleet parks at `atS` rather than at
   * the next arrival and a bank's policies adopt a switched vector at `atS` rather than never;
   * {@link #idleOverrideAt}, which every `#park` decision asks for the settings in force *now*;
   * and {@link #scheduleServiceEvents}, which folds each `answer-incident` entry's effects into
   * the one service schedule the run drives. Empty, all three are no-ops that allocate nothing
   * and take no branch a previous run did not — the whole of the absent-equals-empty identity
   * the config field promises.
   */
  readonly #interventions: readonly RunInterventionConfig[];
  /**
   * `switch-dispatcher` entries' resolved vectors, by log index — resolved once at scheduling
   * time through the same `resolveWeights` the run's own profile went through, so a misspelled
   * term id in a switched profile is the same loud `DispatchError` it would be on the profile
   * that opened the run, thrown before a single event fires rather than mid-run.
   */
  readonly #switchWeights = new Map<number, ReadonlyMap<string, number>>();
  /**
   * The service schedule this run drives: the building's own resolved events, then every
   * `answer-incident` entry's effects, in log order. Built by {@link #scheduleServiceEvents} and
   * indexed by {@link #onServiceChange}, so the handler reads the schedule the run actually
   * scheduled — the same argument `ServiceChangePayload` makes about stale copies.
   */
  #serviceSchedule: readonly ResolvedServiceEvent[] = [];

  readonly #policies = new Map<string, DispatchPolicy>();
  /**
   * Bank id to its learned arrival model, wrapped so one forecast serves a whole decision.
   *
   * Empty when the profile's `idle` section configures no predictor path — see
   * {@link Simulation.#buildPredictors} for why "one per bank" and not one per building.
   */
  readonly #predictors = new Map<string, BankDemandForecast>();
  /** Bank id to its load-sensor comparator, the rising edge that triggers stage 5. */
  readonly #capacityMonitors = new Map<string, CapacityReassignmentMonitor>();
  readonly #carsById = new Map<string, Car>();
  /**
   * Car id to the one arrival event its current run will produce, so a diversion can cancel
   * the arrival it supersedes. Deleted when the arrival fires. See {@link #considerDiversion}.
   */
  readonly #carArrivals = new Map<string, ScheduledEvent<{ carId: string }>>();
  readonly #activeCalls = new Map<string, ActiveCall>();
  /** Every leg ever materialized, by leg id. The denominator of the conservation audit. */
  readonly #legs = new Map<string, Passenger>();
  readonly #legsByJourney = new Map<string, Passenger[]>();
  readonly #recordsByJourney = new Map<string, GeneratedPassenger>();
  /** Trace-record id to its index in `trace.passengers`, for the transport-arrival payload. */
  readonly #recordIndexById = new Map<string, number>();
  readonly #stops = new Map<string, StopInProgress>();
  /** Bank id to the future tick times already on the queue, so a tick is never doubled. */
  readonly #pendingTicks = new Map<string, Set<number>>();
  /** Banks currently inside `#dispatchBank`, and banks that were dirtied while inside. */
  readonly #dispatching = new Set<string>();
  readonly #dirtyBanks = new Set<string>();
  /** Call id to why every car refused it structurally. Cleared the moment anything changes. */
  readonly #unservable = new Map<string, string>();
  /** Call id to car id to how often that car declined it at stage 6. Survives a re-offer. */
  readonly #refusals = new Map<string, Map<string, RefusalTally>>();

  /**
   * Banks observed holding a landing queue with **not one car able to answer a hall call**.
   *
   * The run that most obviously needs a diagnostic used to produce none: `garden-apartments` with
   * both cars withdrawn and `midtown-office` with all four reported `timed-out`, 0 of 26 and 0 of
   * 719 delivered, and `result.warnings` **empty**. The viewer draws one row per warning, so a
   * player got a red word and no cause. Keyed by bank id; the value is the window it was first and
   * last seen in and the largest queue it was seen holding.
   */
  readonly #banksWithoutService = new Map<
    string,
    { from: SimTime; until: SimTime; peakWaiting: number }
  >();

  /**
   * Statements that a number this run reports describes something other than what was asked
   * for, kept apart from the advisories and reported **first**.
   *
   * The distinction is not presentational. An advisory qualifies a result ("this call bounced a
   * lot", "the run outlasted its drain tail"); a disclaimer says the *model* is not the
   * configuration — Vertical City's double-deck shuttles run as single-deck cars, a car with no
   * resolved `passengerTransferS` runs at the office value whatever building it is in. Every
   * consumer that truncates has to truncate the advisories, and the CLI's cut used to survive
   * only because the double-deck line happened to be warning #1 on the one building that raises
   * it. Ordering it deliberately is one line and removes the coincidence.
   */
  readonly #disclaimers: string[] = [];
  readonly #warnings: string[] = [];
  #transfers = 0;
  /** Hops taken on a declared non-lift connection. See {@link ConservationAudit.transportHops}. */
  #transportHops = 0;
  /** Promises a landing panel made. See {@link ConservationAudit.legsAssigned}. */
  #legsAssigned = 0;
  /** Boardings onto a car other than the promised one. Asserted `0`; see `#reconcile`. */
  #wrongCarBoardings = 0;
  /** Passengers a full car left behind after promising them a place. D29's *result*. */
  #brokenPromises = 0;
  /** Promises voided because the car they named left group control. See `#revokePromisesTo`. */
  #promisesRevoked = 0;
  /**
   * Mass promised to each car's deck and not yet aboard it, keyed by {@link #promiseKey}.
   *
   * **The panel's own load cell.** `#boardFrom` will not put a thirteenth person into a car that
   * holds twelve; without this the panel would still *promise* the thirteenth, and the hundredth,
   * because the promise is made at the landing where nothing weighs anything. Maintained rather
   * than derived: the honest derivation is a scan of every landing queue in the bank per decision,
   * and a run makes tens of thousands of decisions.
   *
   * Every entry is added in {@link #tellThePanel} and removed at the one instant the promise stops
   * being outstanding — boarding ({@link #boardFrom}), revocation ({@link #revokePromisesTo}) or
   * the rider walking out ({@link #abandon}) — which are the same three places
   * `ConservationAudit`'s promise identity is kept balanced. Empty on every conventional run.
   */
  readonly #promisedMassKg = new Map<string, number>();
  /**
   * How often the panel had a passenger to promise and no named car with room left for them.
   *
   * Read by {@link #dispatchBank} as a *retry* signal and by nothing else: a landing holding a
   * waiter nobody has been able to promise is a landing that must be asked about again, and the
   * ordinary `carIds.length === 0` retry does not fire for it because the call *was* assigned.
   */
  #promisesDeferred = 0;
  #capacityCrossings = 0;
  #capacityMigrations = 0;
  #capacityHeld = 0;
  #lateArrivalHoldsRequested = 0;
  #lateArrivalHoldsGranted = 0;
  #lateArrivalHoldsRefused = 0;
  #lateArrivalHoldsProjected = 0;
  #lateArrivalHoldsBoarded = 0;
  #lateArrivalHoldDwellS = 0;
  #lateArrivalHoldMaxDwellS = 0;
  #lateArrivalHoldMaxCohort = 0;
  /** How often the drain deadline refused to schedule something. `> 0` means it really bit. */
  #deadlineTruncations = 0;
  /** Runs cut short en route. Zero under every profile leaving `enRouteDiversion` off. */
  #diversions = 0;

  /* ---- patience and abandonment (docs/14 § 3.1) ---- */

  /**
   * One patience value per **planned** leg, drawn before the run started and keyed by
   * `patienceKeyOf(journeyId, legIndex)`.
   *
   * Empty on every run that declares no `sim.patience`, and the `patience` stream is then never
   * drawn from at all — which is what makes such a run byte-identical to one produced before this
   * feature existed. See `sim/patience.ts` for why the draw is taken in trace order rather than
   * as legs reach landings.
   */
  readonly #patienceByLeg: ReadonlyMap<string, SimTime>;
  /** Leg ids whose rider gave up and walked out. See {@link #abandon}. */
  readonly #abandonedLegs = new Set<string>();
  /** Journeys ended by an abandonment. See {@link ConservationAudit.abandoned}. */
  readonly #abandonedJourneys = new Set<string>();
  /** Calls taken back because their landing emptied. See {@link ConservationAudit.callsWithdrawn}. */
  #callsWithdrawn = 0;
  /**
   * Promises voided because the rider they named walked out.
   *
   * Counted apart from {@link #promisesRevoked}, which is the group taking a promise back from a
   * car that left service. These two look identical in the record — an assignment cleared — and
   * are opposite events: one is the *machine* withdrawing, the other the *person*. Merging them
   * would put a car's service change and a rider's patience into one number, and
   * `ConservationAudit.promisesRevoked`'s whole point is that it is not that number.
   */
  #promisesAbandoned = 0;

  /* ---- stairs (docs/14 § 3.3) ---- */

  /**
   * Journeys that took the stairs instead of a lift, decided in trace order before the run.
   *
   * Empty on every building that declares no `kind: 'stairs'` mode, which is every building this
   * repository ships — and the `modeChoice` stream is then never drawn from at all.
   */
  readonly #stairsTaken: ReadonlyMap<string, StairsOffer>;
  /** Seconds spent on stairs, summed. See {@link ConservationAudit.stairsTransitS}. */
  #stairsTransitS = 0;

  /* ---- double-deck operation, counted rather than asserted ---- */

  /** Stops begun by a double-deck car, whether or not both decks had a floor to open onto. */
  #doubleDeckStops = 0;
  /** Of those, stops where the two decks opened onto two different floors at the same instant. */
  #doubleDeckPairedStops = 0;
  /** Boardings actually taken, `[lower, upper]`. The deck assignment, counted at the doorway. */
  readonly #doubleDeckBoardings: [number, number] = [0, 0];
  /** Alightings actually taken, `[lower, upper]`. */
  readonly #doubleDeckAlightings: [number, number] = [0, 0];
  /** What the dwell was *sized* for, `[lower, upper]`; compare against the two above. */
  readonly #doubleDeckBoardingsProjected: [number, number] = [0, 0];
  /** Boarding loops stopped by a **deck's** 80 % design load while the car body still had room. */
  #doubleDeckDeckFullRefusals = 0;
  /** Legs refused because their origin and destination sit on different decks. See `#deckAllows`. */
  readonly #deckMismatchLegs = new Set<string>();

  /* ---- the bare kiosk, counted rather than asserted (DECISIONS.md § T50-D1) ---- */

  /**
   * Whether this run's calls disclose a destination and carry **nothing to authorize it with**.
   *
   * True for exactly one configuration: `dispatch.callType: 'destination-entry'` with no landing
   * panel. `costRequestFor` then forwards the destination and drops the credential, so
   * `infeasibilityOf` step 4 asks *"may an unbadged passenger reach that floor?"* and answers
   * `destinationAccessDenied` for every car in the building. Derived from the resolved policy
   * config beside {@link #panelAssigns}, through the same `dispatch/lifecycle.ts` functions
   * `costRequestFor` itself uses, so the runner and the request can never disagree about it.
   *
   * `false` under `up-down-buttons` (no destination reaches the request), under
   * `mobile-credential` (the device carries the credential) and under any panel (§ D30 authorizes
   * at the kiosk) — which is every profile `data/dispatcher-profiles.json` ships.
   */
  readonly #kioskWithoutCredential: boolean;
  /** Legs the bare kiosk refused. See {@link #kioskAllows}. */
  readonly #kioskRefusedLegs = new Set<string>();
  /** Legs turned away for want of a credential. See {@link #refuseAccess}. */
  readonly #accessRefusedLegs = new Set<string>();
  /** Journeys ended by an access refusal. See {@link ConservationAudit.accessRefused}. */
  readonly #accessRefusedJourneys = new Set<string>();

  #ran = false;

  constructor(config: SimulationConfig) {
    this.#options = resolveOptions(config);
    this.#streams = new StreamSet(
      config.seed,
      config.trafficSeed === undefined ? {} : { trafficSeed: config.trafficSeed },
    );
    this.#kernel = new SimKernel({ maxEventsPerRun: this.#options.maxEvents });
    this.#trafficModel = config.trafficModel;
    this.#resolved = config.building;
    this.#interventions = Object.freeze([...(config.interventions ?? [])]);

    /* ---- the trace, before anything moves (common random numbers) ---- */
    this.#trace = generateTrace(traceConfigFor(config, this.#streams));
    for (const [index, record] of this.#trace.passengers.entries()) {
      this.#recordsByJourney.set(record.journeyId, record);
      this.#recordIndexById.set(record.id, index);
    }
    this.#warnings.push(...this.#trace.warnings);

    /*
     * **Patience, drawn here or not at all.** In trace order, one value per planned leg, before
     * any car has moved — so who gives up is a property of the crowd and not of the dispatcher,
     * and two arms of a paired comparison lose the same people. `sim/patience.ts` states the
     * argument in full. With no declared curve this is an empty map and the `patience` stream is
     * never touched, which is the whole of docs/14 § 0 for this feature.
     */
    this.#patienceByLeg =
      this.#options.patience === undefined
        ? new Map()
        : drawPatienceTable(this.#streams.patience, this.#options.patience, this.#trace.passengers);

    /*
     * **Who takes the stairs, offered here and decided before anything moves** (docs/14 § 3.3).
     *
     * `routeTopologyOf` has already refused to plan any journey over a stair, so every record in
     * the trace is routed as though the stair did not exist. This asks each rider whether they
     * would rather walk. A building declaring none produces an empty index, `drawStairsChoices`
     * returns without touching `modeChoice`, and the run is the run it was.
     */
    this.#stairsTaken = drawStairsChoices(
      this.#streams.modeChoice,
      stairsIndexOf(this.#resolved),
      this.#trace.passengers,
    );

    /* ---- the building, with real cars ---- */
    const profile = config.dispatcherProfile;
    this.#profileId = profile.id;
    const resolved = this.#resolved;
    const kernel = this.#kernel;
    const loadSensorSpec = config.elevatorSpecs?.loadSensor;
    const answer = profile.answer;

    /* ---- the building's passenger transfer time (`tp`) ---- */
    // `2·P·tp` is the term the round trip is most sensitive to, and `tp` is a property of the
    // *building*, not of the hardware: office 1.2 s, hotel 1.5 s, residential 1.75 s (ISO
    // 4190-6, via `elevator-specs.json → timing.passengerTransferS`). It used to reach no car
    // at all — `resolveCar` never derived it and this constructor never passed it — so every
    // building ran at `CAR_DEFAULTS.passengerTransferS`, which *is* the office figure. Garden
    // Apartments' round trip came out ~5 % short and its handling capacity ~4 % optimistic,
    // and Midtown Office looked perfect, because 1.2 s was right there by accident.
    //
    // `resolveBuilding` now resolves the value onto each `ResolvedCar`, so `spec.passengerTransferS`
    // is normally the whole answer and the two lines below are the safety net for a
    // `ResolvedBuilding` assembled by hand rather than by the loader. A car that states its own
    // value wins; otherwise the building type's row is used. A type with no row (`mixed-use`,
    // deliberately: its banks serve populations that load at different speeds) is reported in
    // `warnings` and left to `CAR_DEFAULTS` — loud, and never a silent 1.2 s. Every building in
    // `data/buildings` now declares or derives one, so this warning fires on no shipped
    // configuration; `sim/simulation.test.ts` asserts that.
    const typeTransferS =
      config.elevatorSpecs === undefined
        ? undefined
        : findPassengerTransferS(config.elevatorSpecs, resolved.type);
    if (typeTransferS === undefined) {
      const unstated = resolved.banks.flatMap((bank) =>
        bank.cars.filter((car) => car.passengerTransferS === undefined).map((car) => car.id),
      );
      if (unstated.length > 0) {
        const why =
          config.elevatorSpecs === undefined
            ? 'no elevatorSpecs were supplied to this run'
            : `elevator-specs.json → timing.passengerTransferS has no entry for building type "${resolved.type}"`;
        this.#disclaimers.push(
          `passenger transfer time is undetermined for building "${resolved.id}": ${why}, and car(s) ${unstated.join(', ')} declare none, so they run at the ${CAR_DEFAULTS.passengerTransferS} s default — the office value. Supply elevatorSpecs, or declare passengerTransferS on the car.`,
        );
      }
    }

    /*
     * **Double-deck operation is simulated, and the disclaimer that said otherwise is gone.**
     *
     * What replaces it is a *narrower* disclaimer, raised only in the one case where the
     * hardware is declared and the geometry is not: a bank with double-deck cars and no
     * `servesFloorPairs`. `parse.ts` warns `missing-floor-pairs` for that config, and the
     * runtime consequence is concrete — `shaftForBank` builds a single-deck shaft, so the car
     * really does run as one body of the combined capacity and really does make up to twice the
     * stops. That sentence used to be true of every double-deck bank; it is now true of none
     * that ships, and this raises it only where it is still true.
     *
     * Detected from the resolved building rather than copied out of `ResolvedBuilding.warnings`,
     * so a building assembled by hand instead of by the loader is covered too.
     */
    const unpairedDoubleDeckBanks = resolved.banks.filter(
      (bank) =>
        bank.cars.some((car) => car.doubleDeck === true) &&
        (bank.servesFloorPairs === undefined || bank.servesFloorPairs.length === 0),
    );
    if (unpairedDoubleDeckBanks.length > 0) {
      const cars = unpairedDoubleDeckBanks.reduce(
        (total, bank) => total + bank.cars.filter((car) => car.doubleDeck === true).length,
        0,
      );
      this.#disclaimers.push(
        `building "${resolved.id}" declares ${cars} double-deck car(s) in bank(s) ${unpairedDoubleDeckBanks.map((bank) => `"${bank.id}"`).join(', ')} with no servesFloorPairs, so the runtime has no deck geometry to simulate: each runs as a single-deck car of the same whole-car capacity, and makes up to twice the stops the declared hardware would. Declare the floor pairs to have the decks modelled.`,
      );
    }

    const crowding = this.#options.lobbyCrowding;
    this.#building = createBuilding<Car>(resolved, {
      createCar: (spec, context) => {
        const passengerTransferS = spec.passengerTransferS ?? typeTransferS;
        return new Car({
          id: `${context.bankId}-${spec.id}`,
          bankId: context.bankId,
          spec,
          shaft: shaftForBank(resolved, context.bankId),
          homeFloorId: homeFloorIdFor(resolved, requireBank(resolved, context.bankId)),
          clock: kernel,
          // Service mode at t=0, straight off the resolved car. Without this line
          // `carConfigSchema.mode` would validate, round-trip and reach no car — the
          // "configured, validated, dead in the shipped path" shape docs/05 § *Standing
          // requirement* names. The non-test caller of `CarInit.mode` is right here.
          mode: spec.mode,
          ...(answer === undefined ? {} : { answer }),
          ...(loadSensorSpec === undefined ? {} : { loadSensorSpec }),
          ...(passengerTransferS === undefined ? {} : { passengerTransferS }),
          /*
           * **The non-test caller `CarInit.doorOverrides` did not have.** It has been declared,
           * typed and read by `resolveDoorConfig` since the door machine landed, and nothing in a
           * shipped path ever supplied one — the shape docs/05's standing requirement names. The
           * lobby-crowding term is what it now carries, and it carries nothing when the run
           * declares none, so a run that does not ask for crowding hands the same `undefined` the
           * constructor has always received.
           */
          ...(crowding === undefined ? {} : { doorOverrides: { crowding } }),
        });
      },
    });
    for (const car of this.#building.cars) this.#carsById.set(car.id, car);

    /*
     * A service schedule that was authored and not resolved, said out loud.
     *
     * `ResolvedBuilding.serviceEvents` is optional because a `ResolvedBuilding` can be assembled
     * by hand — fixtures, the fuzz generator, `experiments/validation/syntheticBuilding.ts` — and
     * making it required would break every one of those at compile time in packages this change
     * does not own. The cost of that choice is exactly one silent failure mode: a hand-built
     * resolved building whose `config` declares a schedule the resolver never located. So it is
     * not silent. A **disclaimer**, not an advisory, and for the reason `#disclaimers` gives: the
     * model is not the configuration, and nothing about the resulting numbers would say so.
     */
    const authoredEvents = resolved.config.serviceEvents ?? [];
    if (authoredEvents.length > 0 && (resolved.serviceEvents ?? []).length === 0) {
      this.#disclaimers.push(
        `building "${resolved.id}" authors ${authoredEvents.length} serviceEvents entr${authoredEvents.length === 1 ? 'y' : 'ies'} and the ResolvedBuilding carries none, so no car changes service mode in this run. A ResolvedBuilding assembled by hand must resolve its own schedule; resolveBuilding() does it.`,
      );
    }

    /* ---- one group controller per bank (docs/01-architecture.md) ---- */
    // Which policy is **data**: `auction.aggregation` names a factory in
    // `dispatch/policies/registry.ts`, so `contract-net` is a profile field and not a branch here
    // (CLAUDE.md invariant 7). `config.createPolicy` is the instrumentation and optimizer hook,
    // never how a shipped run chooses.
    const buildPolicy = config.createPolicy ?? createPolicyFor;
    // The weight-set library, derived from the data file rather than handed in as an override.
    //
    // `DispatchPolicyOptions.weightSets` is the *override* half — a hand-built library for a
    // fixture or an optimizer — and until this line it was the only way in, which is why a study
    // could enable the selector and `elevator-sim run` could not (§ D141's own "impact" note).
    // `config.dispatcherProfiles` is the file `loadConfig` already produced, so the shipped path
    // supplies the library the same way it supplies `elevatorSpecs`.
    //
    // Precedence `override > derived`, the same order every other stage resolves in. When both
    // are absent the object handed to `buildPolicy` is **the same object** `dispatcherOptions`
    // was, not a copy of it: a run that opts into nothing must be byte-identical to one built
    // before this line existed, and identity is a stronger statement of that than equality.
    const overrides = config.dispatcherOptions ?? {};
    const weightSets = overrides.weightSets ?? weightSetSourceFrom(config.dispatcherProfiles);
    const policyOptions =
      weightSets === overrides.weightSets ? overrides : { ...overrides, weightSets };
    for (const bank of this.#building.banks) {
      this.#policies.set(bank.id, buildPolicy(profile, policyOptions));
      this.#capacityMonitors.set(bank.id, new CapacityReassignmentMonitor());
    }
    this.#buildPredictors(config, profile);

    /* ---- which passenger model this run is ---- */
    // Off the *resolved* stage of a policy this run actually built, not off the authored profile:
    // `createPolicyFor` is what applies the defaults and what refuses `panel` under a call type
    // that cannot ask for a destination, so a run whose policy would throw never gets here to
    // claim a model it is not running. `config.createPolicy` is the instrumentation hook and may
    // hand back a policy built from different options — reading it here is what keeps the model
    // stamped on the record equal to the model the cars actually ran.
    const [firstPolicy] = [...this.#policies.values()];
    const stage = firstPolicy?.config.dispatch;
    this.#passengerModel =
      stage === undefined ? 'conventional' : passengerModelOf(stage);
    this.#panelAssigns = this.#passengerModel === 'destination-dispatch';
    // The bare kiosk, off the same resolved stage and through the same two functions
    // `costRequestFor` asks. `stage === undefined` cannot happen for a run with a bank; a
    // building with none discloses nothing because it opens no calls.
    this.#kioskWithoutCredential =
      stage !== undefined &&
      isDestinationCallType(stage.callType) &&
      !callCarriesCredential(stage.callType, this.#panelAssigns);

    /*
     * The comparability disclaimer, raised at construction beside the double-deck one.
     *
     * A *disclaimer*, not an advisory, and ordered with them for the reason `#disclaimers`
     * gives: an advisory qualifies a result, a disclaimer says the model is not the
     * configuration a reader will assume. "AWT" on a panel run is a different quantity from
     * "AWT" on a conventional one, and nothing about the number says so.
     */
    const disclaimer = comparabilityDisclaimer(this.#passengerModel);
    if (disclaimer !== undefined) this.#disclaimers.push(disclaimer);

    this.#factory = new PassengerFactory({
      streams: this.#streams,
      /*
       * **The reference block, not the run's `demand.passengerMass` override — and that is a
       * decision, not an oversight.**
       *
       * Wave 13's T3 briefly resolved the override here so the factory and the trace could not
       * draw from two different populations. Adversarial review pointed out the cost: reverting it
       * passed every test in `traffic`, `sim` and `model`, because **nothing reaches it**.
       * `PassengerFactory.arrive` has no caller outside its own docstring — `toPassengerInit`
       * bypasses the factory for every first leg and `transfer` reuses the mass it already drew —
       * so the line was an untested behaviour guarding a path that does not exist, which is the
       * defect this repository's standing requirement names rather than a defence against it.
       *
       * **The obligation it was carrying is real and is recorded here instead.** The moment
       * `arrive` gains a shipped caller, this argument must become
       * `config.demand?.passengerMass ?? config.trafficProfiles.passengerMass` and that wiring must
       * be tested on the legs, or a run with a mass override will create arrivals from the
       * reference population while its trace uses the overridden one.
       */
      massConfig: config.trafficProfiles.passengerMass,
      topology: this.#building,
      // Distinct from the trace's `p...` ids, so a leg id can never collide with a journey's
      // first-leg id and silently overwrite it in the recorder.
      idPrefix: 'leg',
      journeyIdPrefix: 'transfer',
    });

    this.#entranceFloorIds = Object.freeze(this.#building.entranceFloors.map((floor) => floor.id));
    this.#entranceFloorIndices = new Set(
      this.#building.entranceFloors.map((floor) => floor.index),
    );
    // The trace's own start-of-day — resolved template data, copied once, `undefined` for a
    // template with no clock. Supplied to every group context unconditionally: the field is
    // read only under `selection.policy: 'rules'`, and `traffic/dayStartIdentity.test.ts` plus
    // the golden runs are what hold "supplied and unread is byte-identical" as a measurement.
    this.#startOfDayS = this.#trace.startOfDayS;
    this.#deadlineS = this.#trace.durationS + this.#options.drainGraceS;
    this.#reportWindow = traceReportWindow(this.#trace);
    this.#windowSelection = config.reportWindow;
    this.#summarizeOptions = config.summarize;
    this.#runId =
      config.runId ?? `${resolved.id}-${profile.id}-${this.#streams.masterSeed.toString()}`;

    /* ---- the door and motion timings the achieved interval is measured with ---- */
    // Without these the recorder writes a record with no `carTimings`, `achievedIntervalOf`
    // falls back to `FALLBACK_DEPARTURE_GAP_S`, and every interval this project reports rests on
    // one constant happening to sit inside four hand-checked brackets. That is what shipped
    // before: `departureGapBracket` was real, tested code that nothing outside the tests ever
    // called. Derived here, off the cars that were actually built, so the production path and
    // the test path compute the same number from the same source.
    const carTimings = terminalCarTimings(resolved, this.#building, this.#entranceFloorIds);
    if (carTimings === undefined) {
      this.#warnings.push(
        `no car timings could be assembled for building "${resolved.id}": ${this.#entranceFloorIds.length === 0 ? 'it flags no entrance floor' : `no bank serving an entrance floor (${this.#entranceFloorIds.join(', ')}) also serves a floor above it`}. The achieved interval will fall back to a constant departure-clustering threshold and report departureGapBasis "fallback".`,
      );
    } else {
      // Computed here purely to say so out loud at construction. `achievedIntervalOf` reaches the
      // same verdict from the same timings and reports it as `departureGapBasis: 'unmeasurable'`
      // with no interval, but a warning is what a caller reading `result.warnings` will see.
      try {
        departureGapBracket(carTimings);
      } catch (error) {
        if (!(error instanceof MetricsError)) throw error;
        this.#warnings.push(
          `the achieved interval cannot be measured on building "${resolved.id}": ${error.message} The cars serving its entrance floor(s) ${this.#entranceFloorIds.join(', ')} hold their doors for up to ${carTimings.doorOpenS + Math.max(carTimings.dwellHallCallS, carTimings.dwellCarCallS, carTimings.fullLoadTransferS) + carTimings.doorCloseS} s at a full load. No interval is reported for this run rather than a fallback number that lies outside every bracket on this building.`,
        );
      }
    }

    this.#recorder = new MetricsRecorder({
      // The `StreamSet`, not `config.seed`: it carries the traffic seed as well, so both halves of
      // invariant 5 reach the record from the generator that filled the run rather than from a
      // second copy of the caller's intent.
      seed: this.#streams,
      // Passed through unresolved; the recorder omits `v1` however it was reached. The run seed and
      // the traffic seed are enough to replay a `v1` run, and are not enough to replay a `v2` one —
      // which is the whole reason this field is on the record and not only on the result.
      ...(this.#trafficModel === undefined ? {} : { trafficModel: this.#trafficModel }),
      ...(this.#passengerModel === 'conventional'
        ? {}
        : { passengerModel: this.#passengerModel }),
      runId: this.#runId,
      buildingId: resolved.id,
      dispatcherProfileId: profile.id,
      trafficProfileId: resolved.trafficProfile,
      demandTemplateId: this.#trace.template.id,
      population: resolved.totalPopulation,
      carIds: this.#building.cars.map((car) => car.id),
      startedAt: 0,
      reportWindow: this.#reportWindow,
      ...(carTimings === undefined ? {} : { carTimings }),
      ...(config.replication === undefined ? {} : { replication: config.replication }),
      ...(config.metadata === undefined ? {} : { metadata: config.metadata }),
    });
  }

  /**
   * One learned arrival model per bank, over the floors that bank serves.
   *
   * **Per bank, not per building**, and the reason is the shrinkage chain rather than tidiness.
   * `createArrivalModel` estimates a landing's rate by shrinking it toward a *building-level*
   * pooled rate, so the set of floors the model is built over decides what "the building is busy"
   * means for every cold-start estimate it produces. A model built over a whole tower would shrink
   * a low-rise bank's landings toward a mean taken over floors that bank cannot reach — on
   * Mixed-Use High-Rise, office landings toward a pool half of which is residential. A bank is
   * also the unit a group controller allocates over (docs/01-architecture.md), and the forecast is
   * read by exactly two consumers, both per bank: stage 7's `predicted-demand` and stage 3's
   * `predictedDemand`. Floors outside the bank are filtered out by both anyway — `parkingCandidates`
   * iterates `car.shaft.floors` and `demandMisalignmentM` skips floors the shaft does not serve —
   * so a building-wide model would buy nothing and cost the pooled rate its meaning.
   *
   * It also makes the write path check itself: `observe` throws for a floor the model was not built
   * for, so feeding a bank an arrival at a landing it does not serve is an error rather than a
   * silent no-op.
   *
   * A model is built for every bank, always. The predictor tunables all have defaults, and a run
   * that weights neither `predictedDemand` nor `predicted-demand` simply never reads the forecast
   * — which costs one forecast per dispatch pass and buys the property the next paragraph is
   * about. `config.createPredictor` may return `undefined` to run a bank with no model at all,
   * which is the control arm for measuring what the forecast is worth.
   *
   * ## The model is fed identically whatever the dispatcher does, with one honest exception
   *
   * Common random numbers require that the two arms of a paired comparison see the same world
   * (docs/03-traffic-and-statistics.md § Part 4). Observations are taken in {@link #admit}, the one
   * place a passenger begins waiting, at the passenger's own `arrivedAt` — which for a first leg is
   * the trace's batch time, a pure function of `(seed, config)` and untouchable by any dispatcher.
   * So on a single-leg building every arm feeds its predictor a **byte-identical** observation
   * sequence and a predictive arm is CRN-paired against a non-predictive one on equal terms.
   *
   * The exception is a **sky-lobby transfer**: the second leg of a journey begins waiting when the
   * first leg's car put it down, which is a time the dispatcher decides. On a building that
   * declares any `isTransferFloor` two arms therefore observe the same *first* legs at the same
   * times and the continuation legs at different ones. That does not break causality (a transfer
   * arrival is a real arrival, observed after it happened) and it does not break determinism, but
   * it does mean the predictor is one more thing that differs between arms there, so a paired
   * difference on those buildings is a difference in dispatch **plus** whatever the divergent
   * observation stream did to the forecast.
   *
   * **Which buildings those are is derived, never listed.** `seam.test.ts` partitions
   * `BUILDING_IDS` on `building.transferFloors.length === 0` and asserts identity on one side and
   * divergence on the other, so a building that grows or loses a sky lobby cannot leave a stale
   * list behind in this comment. As `data/buildings/` ships today the identical side is
   * `midtown-office` and `garden-apartments` — which is where the Phase 5 pre-positioning
   * criterion lives — and the divergent side is `mixed-use-high-rise`, `vertical-city` **and
   * `secure-tower`**, whose screened lobby `G` is an `isTransferFloor`. Secure Tower is easy to
   * mistake for single-leg because almost all of it is: measured at seed 20 260 726, 3 of its 396
   * journeys are multi-leg and `conservation.transfers` is 0 under `nearest-car` against 3 under
   * `eta`. A handful of dispatcher-dependent transfers is still dispatcher-dependent, so the
   * `secure-up-peak` benchmark case carries this caveat and the two single-leg cases do not.
   */
  #buildPredictors(config: SimulationConfig, profile: DispatcherProfile): void {
    for (const bank of this.#building.banks) {
      const resolvedBank = requireBank(this.#resolved, bank.id);
      const model =
        config.createPredictor === undefined
          ? createArrivalModel({
              floorIds: bank.servesFloors,
              ...(profile.idle === undefined ? {} : { idle: profile.idle }),
            })
          : config.createPredictor(resolvedBank, profile);
      if (model === undefined) continue;
      this.#predictors.set(bank.id, new BankDemandForecast(model));
    }
  }

  /** The trace this run is driven by. Available before {@link run} for CRN checks. */
  get trace(): PassengerTrace {
    return this.#trace;
  }

  /**
   * The group controllers this run built, by bank id.
   *
   * Exposed so a caller can read what a policy decided — the auction outcomes, the lifecycles —
   * without the run having to copy them into the result. Read-only by convention: the run holds
   * the same objects and mutating one mid-run would desynchronize the books.
   */
  get policies(): ReadonlyMap<string, DispatchPolicy> {
    return this.#policies;
  }

  /**
   * The arrival models this run built, by bank id, as the read-only face.
   *
   * `DemandForecastSource` and not `ArrivalModel`, deliberately: a caller that could `observe`
   * would be teaching the predictor something the simulation never saw, which is the one shape a
   * clairvoyant result takes that no aggregate metric would flag.
   */
  get predictors(): ReadonlyMap<string, DemandForecastSource> {
    return this.#predictors;
  }

  /**
   * What the two load-driven stages actually did — the counters that tell "off" from "never fired".
   *
   * A capacity migration count of zero and a mechanism that is not wired look identical in an AWT
   * mean, which is precisely how this project lost four behaviours to a missing call site. So the
   * run counts them and a test can assert on them.
   */
  get stageActivity(): StageActivity {
    let predictorObservations = 0;
    for (const forecast of this.#predictors.values()) {
      predictorObservations += forecast.model.observedArrivals;
    }
    return Object.freeze({
      predictorObservations,
      capacityCrossings: this.#capacityCrossings,
      capacityMigrations: this.#capacityMigrations,
      diversions: this.#diversions,
      capacityHeld: this.#capacityHeld,
      lateArrivalHoldsRequested: this.#lateArrivalHoldsRequested,
      lateArrivalHoldsGranted: this.#lateArrivalHoldsGranted,
      lateArrivalHoldsRefused: this.#lateArrivalHoldsRefused,
      lateArrivalHoldsProjected: this.#lateArrivalHoldsProjected,
      lateArrivalHoldsBoarded: this.#lateArrivalHoldsBoarded,
      lateArrivalHoldDwellS: this.#lateArrivalHoldDwellS,
      lateArrivalHoldMaxDwellS: this.#lateArrivalHoldMaxDwellS,
      lateArrivalHoldMaxCohort: this.#lateArrivalHoldMaxCohort,
      doubleDeckStops: this.#doubleDeckStops,
      doubleDeckPairedStops: this.#doubleDeckPairedStops,
      doubleDeckBoardings: Object.freeze([
        this.#doubleDeckBoardings[0],
        this.#doubleDeckBoardings[1],
      ]) as readonly [number, number],
      doubleDeckAlightings: Object.freeze([
        this.#doubleDeckAlightings[0],
        this.#doubleDeckAlightings[1],
      ]) as readonly [number, number],
      doubleDeckBoardingsProjected: Object.freeze([
        this.#doubleDeckBoardingsProjected[0],
        this.#doubleDeckBoardingsProjected[1],
      ]) as readonly [number, number],
      doubleDeckDeckFullRefusals: this.#doubleDeckDeckFullRefusals,
      deckMismatchLegs: this.#deckMismatchLegs.size,
      kioskRefusedLegs: this.#kioskRefusedLegs.size,
      // Omitted at zero, never `0`: `structuralDigestOfResult` hashes every key whatever its
      // value, so a key on every run would move every pinned identity digest to say nothing.
      ...(this.#accessRefusedLegs.size === 0
        ? {}
        : { accessRefusedLegs: this.#accessRefusedLegs.size }),
    });
  }

  /** The building, with its runtime cars. Available before {@link run} for fixtures. */
  get building(): Building<Car> {
    return this.#building;
  }

  /**
   * This replication's streams, positioned wherever the run has left them.
   *
   * Exposed because the property that matters most about them is externally checkable: taking
   * a `snapshot()` after construction and another after {@link run} must show **no movement at
   * all** on `arrivals`, `origins`, `destinations` and `passengerMass`. The passenger
   * population is settled before a car moves, so it cannot be perturbed by anything the
   * elevators do, which is the whole basis of common random numbers
   * (docs/03-traffic-and-statistics.md § Part 4). `doorObstruction` moves only when a non-zero
   * obstruction probability asks it to, and `policyNoise` is untouched by this phase.
   */
  get streams(): StreamSet {
    return this.#streams;
  }

  /**
   * Run to completion and reconcile the books.
   *
   * @throws SimulationError if the conservation audit fails, if the event budget was exhausted,
   *   or if the drain deadline fired with passengers still in the system and `onTimeout` is
   *   `throw`.
   * @throws whatever a handler threw. A routing failure, a `ModelError` from a car or a plain
   *   `TypeError` from a bug propagates **unchanged**; see {@link isEventBudgetExhaustion}.
   */
  run(): SimulationResult {
    if (this.#ran) {
      throw new SimulationError(
        `Simulation "${this.#runId}" has already run. A replication is single-use; build another for a second run, or two replications will share car positions and stop being independent.`,
      );
    }
    this.#ran = true;

    this.#scheduleTrace();
    this.#scheduleQueueSamples();
    this.#scheduleServiceEvents();
    this.#scheduleInterventions();

    let endReason: RunEndReason = 'drained';
    try {
      this.#kernel.runUntilEmpty();
    } catch (error) {
      if (!this.#isEventBudgetExhaustion(error)) throw error;
      endReason = 'event-budget';
      this.#warnings.push(
        `event budget exhausted at t=${this.#kernel.now()}s after ${this.#kernel.processedCount()} events (sim.maxEvents=${this.#options.maxEvents}): ${error.message}`,
      );
    }

    return this.#finish(endReason);
  }

  /**
   * Whether this exception is the kernel's event valve rather than a bug in a handler.
   *
   * The distinction is the difference between a run that saturated and a run that crashed, and
   * getting it wrong is worse than either: this module throws {@link SimulationError} out of
   * four handlers it means to be loud about — a batch that does not exist, a route no bank can
   * fly, a transfer whose legs do not join up — and `Car`/`Floor` throw `ModelError` for a
   * passenger put out in the wrong place. Swallowing any of those and calling the run
   * `timed-out` produces exactly the artefact the audit exists to prevent: a statistics-bearing
   * result, with balanced books, whose numbers describe a run that aborted somewhere in the
   * middle. A Phase 3 sweep tolerating `timed-out` replications would fold it straight into a
   * mean.
   *
   * So the valve is identified positively, by the kernel's own state, and everything else is
   * re-thrown untouched:
   *
   * - it is not one of this module's own errors, which are always bugs or bad configuration;
   * - the kernel really did fire its whole budget, which is what the valve is; and
   * - the message is the valve's. Belt and braces — if `SimKernel` ever reworded it, this
   *   returns `false` and the caller sees the raw error, which is the safe direction.
   */
  #isEventBudgetExhaustion(error: unknown): error is Error {
    if (error instanceof SimulationError || !(error instanceof Error)) return false;
    if (this.#kernel.processedCount() < this.#options.maxEvents) return false;
    return error.message.includes('maxEventsPerRun');
  }

  /* ---------------------------------------------------------------- *
   * Scheduling the trace
   * ---------------------------------------------------------------- */

  #scheduleTrace(): void {
    for (const [batchIndex, batch] of this.#trace.arrivals.entries()) {
      this.#kernel.schedule(
        batch.timeS,
        batchArrivalEvent({ batchIndex }, (payload, context) => {
          this.#onBatchArrival(payload.batchIndex, context.time);
        }),
      );
    }
  }

  #scheduleQueueSamples(): void {
    const count = this.#options.queueSampleCount;
    if (count <= 0) return;
    const horizon = this.#trace.durationS;
    for (let index = 0; index < count; index += 1) {
      const at = (index * horizon) / count;
      this.#kernel.schedule(
        at,
        queueSampleEvent({ index }, (_payload, context) => {
          this.#recorder.sampleQueue(context.time, this.#waitingCount());
        }),
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * Service mode
   * ---------------------------------------------------------------- */

  /**
   * Put the run's service schedule on the queue — the building's authored events, then every
   * `answer-incident` intervention's effects.
   *
   * **In array order, and not sorted.** The kernel's total order is `(time, sequence)` and the
   * sequence is the order things were scheduled in, so two entries with the same `atS` fire in
   * the order they were authored (CLAUDE.md invariant 4). Sorting here would be a second
   * ordering authority saying the same thing, and two authorities is how one of them drifts.
   *
   * Entries past the drain deadline are refused rather than queued, for the same reason
   * {@link #scheduleTick} refuses one: an event on the queue keeps the run alive to its time, so
   * a recall authored at 10 000 s on a 1800 s trace would extend a run by more than two hours to
   * do nothing. Refused **loudly** — a schedule entry that never fires is a configuration that
   * did not happen, which is exactly what `warnings` is for.
   *
   * ## Why an incident answer schedules through *this* event kind and not a sibling
   *
   * The decision the Everyday campaign's incident dock rests on, recorded here because this is
   * the seam that makes it. An `answer-incident` entry's effects are service-mode changes, and
   * {@link #onServiceChange} is the sole authority on what a mode change *does to the group* —
   * re-offering released calls with their original `registeredAt`, revoking promises a withdrawn
   * car cannot keep, re-dispatching the bank. A sibling `intervention`-kind handler applying
   * `Car.setMode` itself would be a second copy of all of that, wrong the day either copy moved —
   * the two-sources failure `runner/metrics.ts` names. So the answer's effects are **appended to
   * the one schedule** (building's events first, keeping their indexes and their warnings'
   * wording; answers after, in log order) and fire as ordinary `serviceChange` events, while the
   * answer entry itself puts nothing on the intervention queue — its `atS` is the record's
   * `runIncidentClock`, a fact for the report, not an action for the kernel.
   *
   * The effects were validated by {@link #answeredIncidentEvents} before they got here, so the
   * deadline branch below can only fire on the building's own entries and its message may keep
   * naming `serviceEvents[…]`.
   */
  #scheduleServiceEvents(): void {
    this.#serviceSchedule = Object.freeze([
      ...(this.#resolved.serviceEvents ?? []),
      ...this.#answeredIncidentEvents(),
    ]);
    const events = this.#serviceSchedule;
    for (const [index, event] of events.entries()) {
      if (event.atS > this.#deadlineS) {
        this.#deadlineTruncations += 1;
        this.#warnings.push(
          `serviceEvents[${index}] would set car "${event.bankId}-${event.carId}" to "${event.mode}" at ${event.atS} s, which is past this run's drain deadline of ${this.#deadlineS} s (demand horizon ${this.#trace.durationS} s + sim.drainGraceS ${this.#options.drainGraceS} s). It was not scheduled and the car's mode is unchanged by it.`,
        );
        continue;
      }
      this.#kernel.schedule(
        event.atS,
        serviceChangeEvent({ index }, (payload, context) => {
          this.#onServiceChange(payload.index, context.time);
        }),
      );
    }
  }

  /**
   * The service events the run's `answer-incident` interventions carry, validated — the second
   * half of {@link #scheduleServiceEvents}' schedule.
   *
   * Three refusals, each on its own ground:
   *
   * - **An effect before its own answer is refused loudly.** Contract § 1.4's whole mechanism is
   *   that everything before `atS` is bit-identical on re-simulation; an answer at 12:31 whose
   *   effect lands at 09:00 would rewrite a past the player has already watched, so it is a
   *   defect in the entry, warned by name, and never scheduled.
   * - **An effect past the drain deadline is refused loudly**, exactly as a building's own
   *   schedule entry is, and counted in the same `deadlineTruncations`.
   * - **An effect naming a car this run did not build throws.** The building's own schedule gets
   *   this check at config time (`resolveBuilding` raises a located `ConfigError`); an
   *   intervention's effects have no config pass, so scheduling time is their config time, and a
   *   silently skipped effect would be a run that did not do the thing its record says it did.
   *
   * The entry-level deadline refusal (`entry.atS` itself past the deadline) is
   * {@link #scheduleInterventions}' and is not repeated here — an entry it warned about is
   * skipped whole, silently, so the record produces one warning per defect rather than two.
   */
  #answeredIncidentEvents(): readonly ResolvedServiceEvent[] {
    const events: ResolvedServiceEvent[] = [];
    for (const [index, entry] of this.#interventions.entries()) {
      if (entry.change.kind !== 'answer-incident') continue;
      if (entry.atS > this.#deadlineS) continue;
      for (const effect of entry.change.serviceEvents) {
        if (effect.atS < entry.atS) {
          this.#warnings.push(
            `interventions[${index}] answers an incident at ${entry.atS} s with an effect setting car "${effect.bankId}-${effect.carId}" to "${effect.mode}" at ${effect.atS} s — before the answer itself. An answer cannot reschedule the past (contract § 1.4's prefix is bit-identical by construction), so this effect was not scheduled.`,
          );
          continue;
        }
        if (effect.atS > this.#deadlineS) {
          this.#deadlineTruncations += 1;
          this.#warnings.push(
            `interventions[${index}]'s incident answer would set car "${effect.bankId}-${effect.carId}" to "${effect.mode}" at ${effect.atS} s, which is past this run's drain deadline of ${this.#deadlineS} s (demand horizon ${this.#trace.durationS} s + sim.drainGraceS ${this.#options.drainGraceS} s). It was not scheduled and the car's mode is unchanged by it.`,
          );
          continue;
        }
        if (!this.#carsById.has(`${effect.bankId}-${effect.carId}`)) {
          throw new SimulationError(
            `interventions[${index}]'s incident answer names car "${effect.carId}" in bank "${effect.bankId}", which this run did not build. Known cars: ${[...this.#carsById.keys()].join(', ')}.`,
          );
        }
        // The mode against the declared vocabulary, for the reason the kind check gives one
        // level up: `Car.setMode` stores whatever string it is handed, and every later
        // `acceptsHallCalls` would then answer for a mode nobody defined — a run applied as a
        // guess, which is § 1.5's approximate replay wearing a service event's clothes. The
        // building's own schedule gets this check from the config schema; an intervention's
        // effects have no config pass, so it happens here.
        if (!(SERVICE_MODES as readonly string[]).includes(effect.mode)) {
          throw new SimulationError(
            `interventions[${index}]'s incident answer would set car "${effect.bankId}-${effect.carId}" to mode "${String(effect.mode)}", which this build does not declare. Known modes: ${SERVICE_MODES.join(', ')}.`,
          );
        }
        events.push(effect);
      }
    }
    return events;
  }

  /**
   * A car changes service mode, and the group takes back whatever the new mode cannot do.
   *
   * {@link Car.setMode} is the authority on *what* is released — a car leaving `in-service` drops
   * its hall calls, one leaving `independent` as well drops its car calls — and this method is
   * the authority on *what happens to them*. Both halves are needed and only the first existed:
   * a released hall call that nothing hands back to the group is a landing pinned to a car that
   * will never come, which under `reassignmentPolicy: 'never'` (every shipped profile) is
   * permanent.
   *
   * So each released call goes through {@link #reofferCall} — the same path a car that filled up
   * and left people behind uses, and the same path capacity-driven bypass uses. It completes the
   * lifecycle and re-registers the call with its **original** `registeredAt`, so a starvation
   * term still sees an old call rather than a fresh one.
   *
   * A car coming *back* needs no special handling and gets none: the bank is re-dispatched here,
   * and a call that no car could take was left `retry`-able rather than structurally unservable
   * (`serviceMode` is deliberately absent from `STRUCTURAL_INELIGIBILITY`), so the pending
   * dispatch tick finds the returning car too. `#stepCar` inside `#dispatchBank` then gives it
   * its first instruction.
   *
   * **Handing the call back is not enough under a panel**, and that half was missing. A re-offered
   * call whose waiters are promised to the withdrawn car is handed straight back to it by
   * {@link #candidateCars} — D29's write-once promise, enforced at the candidate set (T16-D3) —
   * so it is refused `serviceMode`, retried every `dispatchRetryS`, and refused again until the
   * drain deadline while the rest of the bank stands idle. So {@link #revokePromisesTo} voids
   * those promises first: a promise to a car that cannot accept a hall call is not a cost being
   * paid, it is a promise that cannot be kept. See `the root DECISIONS.md` § T22-D1.
   *
   * The sweep is over **every active call of the bank**, not only the ones `setMode` released,
   * because a call whose promised car was full at its last re-offer is active and held by nobody:
   * it would not appear in the released list and its waiters would be stranded exactly as before.
   *
   * **What happens to the passengers already aboard, corrected — the sentence here used to say
   * the opposite of what the code does.** It read: *"`setMode` clears its car calls, so it has no
   * reason to move and they end the run as `undelivered: 'riding'`"*. Measured across 336
   * configurations — 8 buildings × 3 dispatchers × 14 withdrawal instants — **874 rider-legs were
   * aboard at the instant of withdrawal and every one of them was delivered**; `undelivered:
   * 'riding'` was 0 in every cell. Clearing `#carCalls` cannot strand them, because
   * `Car.committedStops()` derives its stops from `#passengers` as well, and the passengers
   * regenerate the very stops that were cleared. A withdrawn car finishes the trip it is on and
   * then stops collecting: it takes no hall call, is not parked, and is not given a new
   * destination. That is what the run does; the mechanism is `committedStops()`, not the car-call
   * list.
   *
   * **What is genuinely not modelled** is the recall itself: a car in `fire-recall` neither
   * travels to a designated level nor parks with its doors open, so the mode is a withdrawal
   * wearing a fire brigade's name. A real Phase I recall is a behaviour rather than a config
   * field, and building it is out of scope here.
   */
  #onServiceChange(index: number, at: SimTime): void {
    // The run's own combined schedule — building events first, incident answers after — which is
    // the array {@link #scheduleServiceEvents} scheduled these indexes from.
    const event = this.#serviceSchedule[index];
    /* c8 ignore next 5 -- the index came from the same array a moment ago. */
    if (event === undefined) {
      throw new SimulationError(
        `Service event ${index} is not in the schedule of building "${this.#resolved.id}".`,
      );
    }
    const car = this.#carsById.get(`${event.bankId}-${event.carId}`);
    /* c8 ignore next 5 -- resolveBuilding located this car against the same banks. */
    if (car === undefined) {
      throw new SimulationError(
        `Service event ${index} names car "${event.carId}" in bank "${event.bankId}", which this run did not build.`,
      );
    }

    const released = new Set<string>();
    for (const call of car.setMode(event.mode)) {
      const active = this.#activeCalls.get(call.id);
      if (active === undefined) continue;
      released.add(active.id);
      this.#noteRefusal(active, car.id, 'serviceMode');
      this.#reofferCall(car, active, at);
    }
    // Every *other* live call of this bank whose waiters were promised to the withdrawn car —
    // a call it was not holding, because the last decision for it found the car full and left it
    // unassigned. Materialized into an array first, and each entry re-checked against
    // `#activeCalls`, because `#reofferCall` extinguishes a call whose landing has emptied.
    if (!car.acceptsHallCalls) {
      const stranded = [...this.#activeCalls.values()].filter(
        (active) =>
          !released.has(active.id) &&
          active.bankId === car.bankId &&
          this.#promisedTo(active, car).length > 0,
      );
      for (const active of stranded) {
        if (!this.#activeCalls.has(active.id)) continue;
        this.#reofferCall(car, active, at);
      }
      for (const active of [...released, ...stranded.map((call) => call.id)]) {
        const live = this.#activeCalls.get(active);
        if (live !== undefined) this.#revokePromisesTo(live, car, at);
      }
    }
    this.#dispatchBank(car.bankId, at);
  }

  /** The waiters of this call whom the panel promised to this car. Empty conventionally. */
  #promisedTo(active: ActiveCall, car: Car): readonly Passenger[] {
    if (!this.#panelAssigns) return [];
    const floor = this.#building.requireFloor(active.floorId);
    return this.#waitingForCall(floor, active).filter(
      (passenger) => passenger.assignedCarId === car.id,
    );
  }

  /**
   * Void every promise this call's waiters hold to a car that has left group control.
   *
   * **The one place a promise is ever taken back**, and the condition is a fact about the car
   * rather than about the score: `acceptsHallCalls === false`. No dispatch decision can produce
   * that, so D29's deferral advantage is not recoverable through this path — a promise is never
   * revoked because another car turned out to be closer, or because the promised car is full.
   * The car it names has simply stopped being a car the group may send anywhere.
   *
   * Called **after** {@link #reofferCall}, which is what keeps `brokenPromises` honest: those
   * passengers were promised this car and this car left them, and that is counted at the same
   * moment and for the same reason as a full car leaving them. The revocation is counted
   * separately in `ConservationAudit.promisesRevoked`, so the two are never conflated.
   *
   * The waiters are left unpromised rather than re-promised here. The pending
   * `#dispatchBank(bankId, at)` re-decides the re-registered call over the whole bank, and
   * `#tellThePanel` names whichever car it chooses — including the withdrawn car's replacement, or
   * the withdrawn car itself if a later schedule entry has already put it back in service.
   */
  #revokePromisesTo(active: ActiveCall, car: Car, at: SimTime): void {
    for (const passenger of this.#promisedTo(active, car)) {
      const massKg = passenger.massKg;
      passenger.releasePromise(at);
      // The withdrawn car's books are settled with it: a promise nobody holds any more is not a
      // claim on its doorway, and leaving it charged would shrink what the car may be promised
      // if a later schedule entry puts it back in service.
      this.#dischargePromise(car.id, active.floorId, massKg);
      this.#recorder.releaseAssignment(passenger, at);
      this.#promisesRevoked += 1;
    }
  }

  /* ---------------------------------------------------------------- *
   * Interventions — Everyday Mode's run record, contract § 1.4
   * ---------------------------------------------------------------- */

  /**
   * Put the run's intervention log on the queue — {@link #scheduleServiceEvents}' twin, entry for
   * entry, and deliberately so.
   *
   * **In array order, and not sorted**, for that method's stated reason: the kernel's total order
   * is `(time, sequence)` and the sequence is scheduling order, so two interventions at one
   * instant take effect in the order the player made them (invariant 4). Sorting here would be a
   * second ordering authority.
   *
   * Entries past the drain deadline are refused rather than queued, and refused **loudly**: an
   * event on the queue keeps the run alive to its time, so an intervention stamped after the last
   * possible departure would extend the run to do nothing — and an intervention that never fires
   * is a change of mind that did not happen, which is exactly what `warnings` is for.
   *
   * An entry whose `change.kind` this build does not declare **throws**, before any event fires.
   * The log is data off a worker boundary and a `localStorage` round trip, so it can carry a kind
   * a newer build wrote; treating it as any known kind would replay something *approximate*
   * (contract § 1.5's forbidden outcome), and skipping it quietly would replay a different run
   * and call it this one. `packages/viz`'s stored-record gate refuses the same log with a row
   * instead of a throw, on the promise this refusal keeps.
   *
   * Per kind:
   *
   * - `park-cars-lobby` schedules its event; the handler walks the already-idle fleet.
   * - `switch-dispatcher` resolves the profile's vector **here**, through the same
   *   {@link resolveWeights} the run's own profile went through — so a misspelled term id is the
   *   same loud `DispatchError`, thrown at scheduling time — and schedules the event that adopts
   *   it. A switched profile authoring the *other passenger model* gets a disclaimer, not a model
   *   change: `dispatch/selector.ts` § *Why only the weights switch* is the argument, and the
   *   model the record stamps stays the model the cars ran. A policy supplied through
   *   `config.createPolicy` that predates {@link DispatchPolicy.adoptWeights} is warned about by
   *   bank, because a switch such a bank cannot adopt is a control that moved nothing.
   * - `answer-incident` schedules **nothing here**: its effects ride the service schedule
   *   ({@link #scheduleServiceEvents} says why), and its `atS` is the record's `runIncidentClock`
   *   — a fact for the report rather than an action for the kernel.
   */
  #scheduleInterventions(): void {
    for (const [index, entry] of this.#interventions.entries()) {
      const kind = entry.change.kind;
      if (!isInterventionKind(kind)) {
        throw new SimulationError(
          `interventions[${index}] carries change kind "${String(kind)}", which this build does not declare. Known kinds: ${INTERVENTION_KINDS.join(', ')}. A kind applied as a guess would replay a different run and call it this one (Everyday Mode contract § 1.5).`,
        );
      }
      if (entry.atS > this.#deadlineS) {
        this.#deadlineTruncations += 1;
        this.#warnings.push(
          `interventions[${index}] would apply "${entry.change.kind}" at ${entry.atS} s, which is past this run's drain deadline of ${this.#deadlineS} s (demand horizon ${this.#trace.durationS} s + sim.drainGraceS ${this.#options.drainGraceS} s). It was not scheduled and nothing in the run changes because of it.`,
        );
        continue;
      }
      if (entry.change.kind === 'answer-incident') continue;
      if (entry.change.kind === 'switch-dispatcher') {
        const profile = entry.change.profile;
        this.#switchWeights.set(index, resolveWeights(profile.weights, profile.id).weights);
        // Through `passengerModelOf` — the one statement of the model rule, the same function
        // the run's own model was stamped by — with the stage defaults applied exactly as
        // `resolveDispatchConfig` applies them. A second inline copy of the rule here was
        // review-flagged as the two-sources shape and is gone.
        const switchedModel: PassengerModel = passengerModelOf({
          callType: profile.dispatch?.callType ?? DISPATCH_DEFAULTS.callType,
          passengerAssignment:
            profile.dispatch?.passengerAssignment ?? DISPATCH_DEFAULTS.passengerAssignment,
        });
        if (switchedModel !== this.#passengerModel) {
          this.#disclaimers.push(
            `interventions[${index}] switches to dispatcher "${profile.id}", which authors the ${switchedModel} passenger model; this run stays ${this.#passengerModel}. Only the weight vector switches mid-run — a record that changed passenger model at ${entry.atS} s would publish metrics not comparable with themselves (metrics/comparability.ts) — so every stage setting of the opening profile still stands.`,
          );
        }
        const unadoptable = [...this.#policies.entries()]
          .filter(([, policy]) => policy.adoptWeights === undefined)
          .map(([bankId]) => bankId);
        if (unadoptable.length > 0) {
          this.#warnings.push(
            `interventions[${index}] switches the dispatcher at ${entry.atS} s, and the policy of bank(s) ${unadoptable.join(', ')} (supplied through config.createPolicy) implements no adoptWeights, so assignment in ${unadoptable.length === this.#policies.size ? 'every bank' : 'those banks'} keeps scoring with the opening profile's weights.`,
          );
        }
      }
      this.#kernel.schedule(
        entry.atS,
        interventionEvent({ index }, (payload, context) => {
          this.#onIntervention(payload.index, context.time);
        }),
      );
    }
  }

  /**
   * An intervention taking effect, per kind.
   *
   * **`park-cars-lobby`** walks the fleet's idle cars through stage 7, under the override in
   * force as of this instant. The override itself needs no application step —
   * {@link #idleOverrideAt} is consulted by every later {@link #park} — so the whole job of this
   * arm is the fleet that is *already parked*: an idle car takes a stage 7 decision only when
   * something asks it to, and without this walk a building standing quiet at `atS` would honour
   * *park the cars in the lobby* only when the next arrival happened to free a car. Guarded per
   * car by {@link #isIdle}, exactly as {@link #stepCar} guards its own call, because `#park` may
   * move a car and a car with its doors open is not the group's to move.
   *
   * **`switch-dispatcher`** hands every bank's policy the vector {@link #scheduleInterventions}
   * resolved, through {@link DispatchPolicy.adoptWeights}. This one is a *push* at the event
   * where the park override is a *pull* per decision, and the asymmetry is deliberate: parking
   * decisions are taken by many callers at arbitrary instants, so their override must be a pure
   * function of `(log, at)`; the weight vector is read from policy state on every scoring pass,
   * so one write at one `(time, sequence)` on the queue is exactly as deterministic and replays
   * identically (invariants 4 and 5). Nothing is re-dispatched here: assignments already made
   * stand — stage 5's reassignment machinery, under the profile's own `reassignmentPolicy`, is
   * the only thing entitled to move one — and every decision from this instant on scores with
   * the new vector, which is the whole of what a change of driver is.
   */
  #onIntervention(index: number, at: SimTime): void {
    const entry = this.#interventions[index];
    /* c8 ignore next 5 -- the index came from the same array a moment ago. */
    if (entry === undefined) {
      throw new SimulationError(
        `Intervention ${index} is not in this run's log; the schedule and the config disagree.`,
      );
    }
    if (entry.change.kind === 'switch-dispatcher') {
      const weights = this.#switchWeights.get(index);
      /* c8 ignore next 5 -- #scheduleInterventions resolved this index a moment ago. */
      if (weights === undefined) {
        throw new SimulationError(
          `Intervention ${index} fired with no resolved weights; the schedule and the log disagree.`,
        );
      }
      for (const policy of this.#policies.values()) policy.adoptWeights?.(weights);
      return;
    }
    for (const car of this.#building.cars) {
      if (this.#isIdle(car)) this.#park(car, at);
    }
  }

  /**
   * The stage 7 settings in force at `at`, or `undefined` when the profile's own stand.
   *
   * A pure function of `(interventions, at)` — the log is scanned, never mutated, and no state
   * records "the intervention has happened", so a decision at `at` gives the same answer whether
   * it runs before or after the {@link #onIntervention} walk at the same instant.
   *
   * The scan is over the **parking kind alone**, and the *latest* such entry at or before `at`
   * wins. That is the semantics a log of changes to independent settings has to have: each kind
   * is its own control, so a `switch-dispatcher` at 10:00 does not un-park a fleet parked at
   * 08:00 — the player asked for both, and revoking one with the other would make the log's
   * entries interfere in an order-dependent way no stamp on the report describes. A future kind
   * that *does* address parking (an un-park, say) joins this scan; a kind about anything else
   * does not.
   *
   * `undefined` — not a copy of `idle` — when no entry is in force, so the ordinary run passes no
   * override and `repositionDecisionFor` hands its helpers the identical frozen config it always
   * did. For `park-cars-lobby` the override is the profile's own idle stage with the strategy
   * replaced: the deadband and the energy exchange rate stay authored, because the player said
   * *where*, not *at what price*.
   */
  #idleOverrideAt(at: SimTime, idle: ResolvedIdleStage): ResolvedIdleStage | undefined {
    let inForce: RunInterventionConfig | undefined;
    for (const entry of this.#interventions) {
      if (entry.atS <= at && entry.change.kind === 'park-cars-lobby') inForce = entry;
    }
    if (inForce === undefined) return undefined;
    return { ...idle, parkingStrategy: 'lobby' };
  }

  /* ---------------------------------------------------------------- *
   * Arrivals
   * ---------------------------------------------------------------- */

  #onBatchArrival(batchIndex: number, at: SimTime): void {
    const batch = this.#trace.arrivals[batchIndex];
    /* c8 ignore next 5 -- the index came from the same array a moment ago. */
    if (batch === undefined) {
      throw new SimulationError(
        `Trace batch ${batchIndex} does not exist; the schedule and the trace disagree.`,
      );
    }

    for (const record of batch.passengers) {
      /*
       * **The rider who walks.** They never join a lift queue, so no leg is created, no hall call
       * is pressed and no statistic derived from `record.passengers` describes them — which is
       * exactly the honesty problem docs/14 § 5 criterion 4 exists for, and why the count and the
       * seconds are published on the audit rather than left to be inferred from a shortfall.
       */
      const stairs = this.#stairsTaken.get(record.journeyId);
      if (stairs !== undefined) {
        this.#transportHops += 1;
        this.#stairsTransitS += stairs.transitS;
        continue;
      }
      // A journey that opens on the building's escalator is not standing at a lift landing yet.
      // Its leg 0 is admitted when the hop finishes; until then it is neither waiting nor
      // visible to a dispatcher, which is the whole difference between a hop and a leg.
      const openingHopS = leadingTransitSecondsOf(record);
      if (openingHopS > 0) {
        this.#scheduleOpeningTransport(record, at, openingHopS);
        continue;
      }
      // Built from the trace's own `PassengerInit`, not through `PassengerFactory.arrive`,
      // which would draw a fresh mass. The trace already carries one, drawn at generation time
      // in trace order — using it is what keeps the passenger population a pure function of
      // `(seed, config)` rather than of the order the run happened to create people in.
      this.#admit(new Passenger(toPassengerInit(record)));
    }

    const floor = this.#building.requireFloor(batch.originFloorId);
    for (const bankId of this.#openCalls(floor, at)) this.#dispatchBank(bankId, at);
  }

  /**
   * Hold a journey on its opening escalator, then admit its first lift leg at the far landing.
   *
   * Truncated by the same drain deadline a sky-lobby walk is, and counted the same way: a hop
   * the run had no time to finish is work the deadline cut, not a passenger who vanished.
   */
  #scheduleOpeningTransport(record: GeneratedPassenger, at: SimTime, traversalS: number): void {
    const arrivedAt = at + traversalS;
    if (arrivedAt > this.#deadlineS) {
      this.#deadlineTruncations += 1;
      return;
    }
    const passengerIndex = this.#recordIndexById.get(record.id);
    /* c8 ignore next 6 -- every trace record was indexed in the constructor. */
    if (passengerIndex === undefined) {
      throw new SimulationError(
        `Trace record "${record.id}" is not in this run's passenger index; the trace and the run disagree.`,
      );
    }
    this.#kernel.schedule(
      arrivedAt,
      transportArrivalEvent({ passengerIndex }, (payload, context) => {
        this.#onOpeningTransport(payload.passengerIndex, context.time);
      }),
    );
  }

  /** The far end of an opening hop: the journey's first lift leg starts waiting here, now. */
  #onOpeningTransport(passengerIndex: number, at: SimTime): void {
    const record = this.#trace.passengers[passengerIndex];
    /* c8 ignore next 6 -- the index came from the same array in the constructor. */
    if (record === undefined) {
      throw new SimulationError(
        `Trace passenger ${passengerIndex} does not exist; the schedule and the trace disagree.`,
      );
    }
    const passenger = new Passenger(toPassengerInit(record));
    this.#transportHops += 1;
    this.#admit(passenger);

    const floor = this.#building.requireFloor(passenger.originFloorId);
    for (const bankId of this.#openCalls(floor, at)) this.#dispatchBank(bankId, at);
  }

  /**
   * Put a leg on the landing and tell the recorder about it.
   *
   * The one entry point for "a passenger begins waiting", used by both a first leg from the
   * trace and a continuation leg from a sky lobby, so no leg can reach a queue without also
   * reaching the metrics layer — which is what makes `legsCreated === legsRecorded` a
   * meaningful check rather than a tautology.
   */
  #admit(passenger: Passenger): void {
    this.#legs.set(passenger.id, passenger);
    const legs = this.#legsByJourney.get(passenger.journeyId);
    if (legs === undefined) this.#legsByJourney.set(passenger.journeyId, [passenger]);
    else legs.push(passenger);

    // The leg carries its own `arrivedAt`; there is no second clock to pass in, and a runner
    // that supplied one could put the record and the model a fraction of a second apart.
    this.#recorder.recordArrival(passenger);
    // Recorded first and turned away second, deliberately: the person walked to the lift, and a
    // record that omitted them would make the refusal invisible to every count taken over the
    // record — which is exactly the shortfall `ConservationAudit.stairsJourneys` exists to stop
    // being inferred from an absence.
    if (!this.#credentialAllows(passenger)) {
      this.#refuseAccess(passenger);
      return;
    }
    this.#observeArrival(passenger);
    this.#building.requireFloor(passenger.originFloorId).addWaiting(passenger);
    this.#armPatience(passenger);
  }

  /**
   * Whether this leg's rider may legally alight where the leg is going.
   *
   * The same question {@link #bankCanCarry} and {@link #carCanCarry} ask, asked once, at the
   * landing, before any car is involved — because the answer is a fact about the pair
   * `(credential, floor)` and no dispatch decision can change it. Those two keep asking it, which
   * is defence in depth rather than duplication: they run on legs this one has already passed, and
   * a future model that admitted somebody conditionally would still be refused at the doorway.
   */
  #credentialAllows(passenger: Passenger): boolean {
    return this.#building.isAccessPermitted(
      passenger.credentialGroup,
      passenger.destinationFloorId,
    );
  }

  /**
   * **The building turning somebody away for want of a credential** (`DECISIONS.md` § D266).
   *
   * They reached the landing, the readers said no, and they left. Not delivered, not waiting, not
   * abandoned — a fourth outcome, and each of those three would be a different lie:
   *
   * - **Delivered** would say somebody got where they were going who did not.
   * - **Waiting** would leave them standing on a landing for the rest of the run, so their
   *   censored wait would run past the 900 s horizon and `awtIsValid`'s `starved` ground would
   *   suppress the mean of every access-zoned building. A credential refusal reported as a
   *   service failure is precisely the confusion this whole feature exists to end, and it is what
   *   [§ D254](../../../../DECISIONS.md) found the old defect doing.
   * - **Abandoned** would put it in `RunSummary.abandonment`, so a run declaring no
   *   `sim.patience` would report riders giving up, and the rate a reader judges patience by would
   *   be measuring access zoning.
   *
   * **They are not silently dropped, and that is the whole care of it.** The leg is in the record,
   * carries `refusedAt`, counts in `WaitStatistics.unservedCount` — they *were* never served — and
   * the total is published as `ConservationAudit.accessRefused` and
   * `StageActivity.accessRefusedLegs`, beside the mean their absence flatters, on exactly the
   * footing `EnergyStatistics.workPerServedLegKJ` sits beside raw energy
   * ([§ D106](../../../../DECISIONS.md)). A configuration that improves its wait by carrying fewer
   * people has not improved anything, and the count is how a reader sees that.
   *
   * No call is opened for them and no bank is told they arrived, which is what a destination
   * terminal does in a real building: it reads the badge and declines the request. **Under a
   * conventional up-down-button system the reader is inside the car**, so a real wrong-zone rider
   * boards, presses a button that does not light and rides somewhere before walking back — a stop
   * and a place in a car this model does not charge the building for. The cost of the gap is
   * therefore *understated* under conventional control, and that direction is stated here rather
   * than left to be discovered.
   */
  #refuseAccess(passenger: Passenger): void {
    this.#accessRefusedLegs.add(passenger.id);
    this.#accessRefusedJourneys.add(passenger.journeyId);
    this.#recorder.recordAccessRefusal(passenger, passenger.arrivedAt);
  }

  /**
   * Start this leg's patience clock, if the run declared one.
   *
   * The value was drawn before the run started; all that happens here is the scheduling. A leg
   * whose key is absent — every leg of every run with no `sim.patience`, and any leg the trace did
   * not plan — is left alone, so this is a no-op on the shipped path rather than a branch that
   * merely evaluates to nothing.
   *
   * **A timer past the drain deadline is not scheduled, and is not counted as truncated work.**
   * `#deadlineTruncations` is the evidence `#timeoutDiagnosis` uses to tell a genuine drain
   * timeout from a run that simply ran out of events, and a patience timer beyond the deadline is
   * neither: the run stops before it, so it could not have fired whether or not it was queued.
   * Counting it would send a reader to `sim.drainGraceS` for a run the deadline never touched.
   */
  #armPatience(passenger: Passenger): void {
    // The empty-map check comes first so the shipped path — no declared patience — does not build
    // a key string per leg. It is one branch against an allocation on every arrival in the run.
    if (this.#patienceByLeg.size === 0) return;
    const patienceS = this.#patienceByLeg.get(
      patienceKeyOf(passenger.journeyId, passenger.legIndex),
    );
    if (patienceS === undefined) return;
    const leavesAt = passenger.arrivedAt + patienceS;
    if (leavesAt > this.#deadlineS) return;
    this.#kernel.schedule(
      leavesAt,
      abandonmentEvent({ legId: passenger.id }, (payload, context) => {
        this.#onPatienceExpired(payload.legId, context.time);
      }),
    );
  }

  /**
   * A drawn patience running out. **Almost always a no-op**, and that is the design.
   *
   * The timer is armed when the leg reaches the landing and is never cancelled, because the
   * kernel has no cancel and adding one to support this would put a mutable index of pending
   * events beside the queue — the sort of structure invariant 4 exists to keep out. So the guard
   * is here instead: a leg that has boarded, has already abandoned, or is no longer on its floor
   * simply has nothing to do. Cheaper than cancellation and impossible to get out of step with.
   */
  #onPatienceExpired(legId: string, at: SimTime): void {
    const passenger = this.#legs.get(legId);
    if (passenger === undefined) return;
    if (passenger.hasBoarded || this.#abandonedLegs.has(legId)) return;
    this.#abandon(passenger, at);
  }

  /**
   * A rider giving up: off the landing, out of the books as neither served nor waiting, and the
   * call withdrawn behind them if nobody else is holding it (docs/14 § 3.1).
   *
   * The order matters and is not arbitrary. The passenger leaves the floor **first**, so every
   * predicate downstream — `#eligibleWaiting`, `#syncButton`, the next dispatch pass — sees a
   * landing that no longer contains them. Withdrawing the call before removing the rider would
   * ask "is anybody still here?" of a queue they were still in.
   *
   * **`cancel`, not `complete`.** The policy lifecycle has two exits and they mean different
   * things: `complete` says the landing was collected, `cancel` says the work went away. A
   * withdrawn call was not served, and filing it as served would put a phantom collection into
   * every stage-5 statistic the policy keeps about its own hit rate.
   */
  #abandon(passenger: Passenger, at: SimTime): void {
    const floor = this.#building.requireFloor(passenger.originFloorId);
    floor.removeWaiting(passenger);
    this.#abandonedLegs.add(passenger.id);
    this.#abandonedJourneys.add(passenger.journeyId);
    // The recorder clears any promise the rider was holding, so the record can never show a car
    // reserving itself for somebody who had already left.
    if (passenger.assignedCarId !== undefined) this.#promisesAbandoned += 1;
    this.#recorder.recordAbandonment(passenger, at);
    // Off the car's books as well as off the landing: a rider who has gone home is not a claim on
    // anybody's doorway, and the seat they were holding is free to be promised again.
    this.#dischargePromise(passenger.assignedCarId, passenger.originFloorId, passenger.massKg);
    passenger.releasePromise(at);

    for (const active of this.#callsAtFloor(passenger.originFloorId)) {
      const bank = this.#building.bankById(active.bankId);
      if (bank === undefined) continue;
      if (this.#eligibleWaiting(bank, active).count > 0) continue;
      this.#withdrawCall(active, at);
    }
    this.#syncButton(passenger.originFloorId, passenger.direction);
  }

  /** Every live call at a floor, whichever bank or direction it belongs to. */
  #callsAtFloor(floorId: string): readonly ActiveCall[] {
    const found: ActiveCall[] = [];
    for (const active of this.#activeCalls.values()) {
      if (active.floorId === floorId) found.push(active);
    }
    return found;
  }

  /**
   * Take a call back because the people who pressed the button have gone.
   *
   * The mirror image of {@link #completeCall}: the same teardown, through the lifecycle's other
   * exit. See {@link #abandon} for why the difference between the two is load-bearing rather than
   * cosmetic.
   */
  #withdrawCall(active: ActiveCall, at: SimTime): void {
    this.#callsWithdrawn += 1;
    this.#unservable.delete(active.id);
    this.#refusals.delete(active.id);
    this.#policies.get(active.bankId)?.cancel(active.id);
    for (const carId of active.carIds) this.#carsById.get(carId)?.releaseHallCall(active.id);
    active.carIds = Object.freeze([]);
    this.#activeCalls.delete(active.id);
    this.#syncButton(active.floorId, active.direction);
    // A car standing idle for a call that has just evaporated should be told, or it waits for a
    // landing nobody is on until the next tick happens to fire.
    this.#scheduleTick(active.bankId, at);
  }

  /**
   * Tell every bank that could carry this passenger that somebody has **just arrived** at its
   * landing.
   *
   * The one place the predictor learns anything, and it is here rather than in `#openCalls` for a
   * reason that is arithmetic rather than taste. `#openCalls` knows the *standing queue*, and
   * observing a queue on every press would re-observe everybody still waiting: one person waiting
   * through five batches would be counted five times, and a landing nobody collects would appear
   * to receive unbounded demand. {@link #admit} fires exactly once per leg, which is once per real
   * arrival, so the model sees each person exactly once and the counts it divides by a bucket width
   * are genuine arrival counts.
   *
   * ## Causality
   *
   * The passenger is already on the landing when this runs: `arrivedAt` is a time that has
   * happened, never a scheduled one, and the model has no way to express a future arrival even if
   * somebody wanted it to (`dispatch/predictor/types.ts` § *Causality is expressed in the type
   * system*). The trace is never handed over — the run holds it, and this function takes one
   * passenger.
   *
   * Observations are monotone because the kernel is: `arrivedAt` is the batch's own scheduled time
   * for a first leg and the event time for a transfer leg, and the kernel processes events in
   * `(time, sequence)` order. `observe` would throw if that ever stopped being true, which is the
   * check rather than the assumption.
   *
   * ## Which banks
   *
   * Every bank that serves the origin floor **and can carry this passenger** — the same
   * `#bankCanCarry` predicate that decides which banks get a hall call for them. A bank learns the
   * demand it could actually answer: teaching a low-rise bank about a passenger going to floor 38
   * would put weight on a landing whose demand that bank can never serve, and the repositioning
   * stage would park for it.
   *
   * A passenger no bank can carry is a routing failure, and `#openCalls` throws for it a moment
   * later with a far better message than a predictor could give; this simply observes nothing.
   */
  #observeArrival(passenger: Passenger): void {
    if (this.#predictors.size === 0) return;
    for (const bank of this.#building.banksServing(passenger.originFloorId)) {
      const forecast = this.#predictors.get(bank.id);
      if (forecast === undefined) continue;
      if (!this.#bankCanCarry(bank, passenger)) continue;
      forecast.model.observe(passenger.originFloorId, passenger.direction, passenger.arrivedAt);
    }
  }

  /**
   * Light the buttons at a floor and make sure every bank that could carry somebody in the
   * queue has a live call for it.
   *
   * @returns the banks whose controller now has work to look at.
   * @throws SimulationError if somebody is waiting whom no bank serving this floor could ever
   *   carry. That is a routing failure — the trace's route planner is supposed to make it
   *   impossible — and it would otherwise show up as a passenger who waits forever.
   */
  #openCalls(floor: Floor, at: SimTime): ReadonlySet<string> {
    const touched = new Set<string>();

    for (const direction of DIRECTIONS) {
      const waiting = floor.waiting(direction);
      if (waiting.length === 0) continue;
      floor.registerHallCall(direction, at);

      const carried = new Set<string>();
      for (const bank of this.#building.banksServing(floor.id)) {
        for (const destinationFloorId of this.#requestKeys(waiting)) {
          let count = 0;
          let massKg = 0;
          for (const passenger of waiting) {
            if (
              destinationFloorId !== undefined &&
              passenger.destinationFloorId !== destinationFloorId
            ) {
              continue;
            }
            if (!this.#bankMayServe(bank, passenger)) continue;
            carried.add(passenger.id);
            count += 1;
            massKg += passenger.massKg;
          }
          if (count === 0) continue;

          const id = callIdOf(bank.id, floor.id, direction, destinationFloorId);
          let active = this.#activeCalls.get(id);
          if (active === undefined) {
            active = {
              id,
              bankId: bank.id,
              floorId: floor.id,
              direction,
              ...(destinationFloorId === undefined ? {} : { destinationFloorId }),
              call: this.#callValue(id, floor, direction, at, bank, destinationFloorId),
              carIds: Object.freeze([]),
            };
            this.#activeCalls.set(id, active);
          }
          this.#policy(bank.id).register(active.call, at, {
            waitingPassengers: count,
            waitingMassKg: massKg,
          });
          touched.add(bank.id);
        }
      }

      for (const passenger of waiting) {
        if (carried.has(passenger.id)) continue;
        // A passenger already promised a car is served by that car's bank and by no other, so
        // they are legitimately absent from every *other* bank's tally. Their own bank counted
        // them, which is what this check is for.
        if (passenger.isAssigned) continue;
        // The bare kiosk's refusal is not a routing failure and must not be reported as one: the
        // building can fly this route, and does under either of the ladder's other two rungs. See
        // {@link #kioskAllows}. They stay on the landing, are named in `undelivered`, counted in
        // `stageActivity.kioskRefusedLegs`, and named once in a warning at the end of the run.
        if (!this.#kioskAllows(passenger)) continue;
        throw new SimulationError(
          `Passenger "${passenger.id}" waits at floor "${floor.id}" for "${passenger.destinationFloorId}", which no bank serving that floor can reach for credential "${String(passenger.credentialGroup)}". The trace planned a route no bank can fly; nobody could ever collect them.`,
        );
      }
    }

    return touched;
  }

  /**
   * The distinct requests standing in one landing queue — the identities calls are opened for.
   *
   * `[undefined]` conventionally: the queue is one button, and the single call it opens serves
   * whoever is in it. Under a panel it is the **distinct destinations**, in queue order, so two
   * people at one landing bound for two different floors produce two requests where a direction
   * button produces one. That is the mechanical heart of the change, and its first-order cost:
   * the per-instant dispatch work rises with the number of distinct destinations at the landing
   * rather than with the number of directions.
   *
   * Queue order and not a sort, so the order calls are opened in is arrival order — the same
   * FIFO the rest of this module is deterministic by.
   */
  #requestKeys(waiting: readonly Passenger[]): readonly (string | undefined)[] {
    if (!this.#panelAssigns) return [undefined];
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const passenger of waiting) {
      if (seen.has(passenger.destinationFloorId)) continue;
      seen.add(passenger.destinationFloorId);
      keys.push(passenger.destinationFloorId);
    }
    return keys;
  }

  /* ---------------------------------------------------------------- *
   * Dispatch — stages 2 to 5, per bank
   * ---------------------------------------------------------------- */

  /**
   * Run the group controller for one bank over every live call, then let its cars act.
   *
   * Re-entrant by design and single-threaded in effect: a nested request (a car releasing a
   * call it turns out to be too full for) marks the bank dirty and is picked up by the next
   * pass of the loop rather than recursing, so one instant of simulated time cannot produce an
   * unbounded stack.
   */
  #dispatchBank(bankId: string, at: SimTime): void {
    if (this.#dispatching.has(bankId)) {
      this.#dirtyBanks.add(bankId);
      return;
    }
    const bank = this.#building.bankById(bankId);
    const policy = this.#policies.get(bankId);
    if (bank === undefined || policy === undefined) return;

    this.#dispatching.add(bankId);
    try {
      let passes = 0;
      do {
        this.#dirtyBanks.delete(bankId);
        passes += 1;

        let retry = false;
        // A landing holding somebody the panel could not promise — every named car was already
        // promised its design load — has to be asked about again, and no other signal in this
        // loop says so: the call *was* assigned, so the `carIds.length === 0` retry below never
        // fires for it. Compared rather than reset, because `#dispatchBank` is re-entered.
        const deferredBefore = this.#promisesDeferred;
        // One set of snapshots serves every call in the pass, and is dropped the moment an
        // assignment actually moves — a call priced against a car that has since taken on
        // another stop is priced against a car that no longer exists.
        let snapshots: readonly CarSnapshot[] | undefined;
        // The two facts only the group controller holds — the operational partition and the
        // arrival forecast — resolved once and shared by every call in the pass. Not per call: a
        // twelve-term weight vector must cost one forecast, and two calls decided at the same
        // instant must be scored against the same partition or the bank disagrees with itself
        // (`policies/groupContext.ts`). It survives a snapshot invalidation because neither fact
        // depends on who holds which call.
        let group: GroupObservationContext | undefined;
        for (const lifecycle of policy.calls) {
          const active = this.#activeCalls.get(lifecycle.callId);
          if (active === undefined) {
            policy.cancel(lifecycle.callId);
            continue;
          }
          const waiting = this.#eligibleWaiting(bank, active);
          if (waiting.count === 0) {
            this.#completeCall(active, at);
            continue;
          }
          this.#noteUnservedBank(bank, waiting.count, at);
          snapshots ??= this.#snapshots(bank, at);
          group ??= this.#groupContext(bank.id, snapshots, at);
          const decision = policy.dispatch(
            lifecycle.callId,
            // Restricted to the promised car when this call's remaining passengers already have
            // one. See `#candidateCars`: this is where D29's write-once promise is enforced, and
            // it is here rather than in `#reofferCall` because three paths reach a re-offer.
            this.#candidateCars(active, snapshots),
            at,
            withLandingCounts(group, waiting.count, waiting.massKg),
          );
          if (this.#applyDecision(active, decision, at)) snapshots = undefined;
          if (decision.outcome === 'deferred') {
            if (decision.dueAt !== undefined) this.#scheduleTick(bankId, decision.dueAt);
          } else if (decision.carIds.length === 0) {
            // A call every car refused for a *structural* reason will be refused identically
            // until something about the landing changes, so retrying it on a timer is noise.
            // Record it and stop; `#reofferCall` and `#completeCall` clear the record, so a
            // landing that becomes servable is asked about again.
            if (this.#isStructurallyUnservable(decision)) this.#markUnservable(active, decision);
            else retry = true;
          }
        }

        if (this.#promisesDeferred !== deferredBefore) retry = true;

        for (const car of bank.cars) {
          // Before the step, not after: a car that can still be cut short is a car whose
          // arrival time is about to change, and `#stepCar` only ever acts on a standing one.
          this.#considerDiversion(car, at);
          this.#stepCar(car, at);
        }

        if (retry) this.#scheduleTick(bankId, at + this.#options.dispatchRetryS);
      } while (this.#dirtyBanks.has(bankId) && passes < MAX_DISPATCH_PASSES);

      if (this.#dirtyBanks.has(bankId)) {
        this.#scheduleTick(bankId, at + this.#options.dispatchRetryS);
      }
    } finally {
      this.#dispatching.delete(bankId);
      this.#dirtyBanks.delete(bankId);
    }
  }

  /**
   * Move the call onto the cars the decision names, and off the ones it does not — **plus the
   * cars that already owe somebody at this landing a trip**.
   *
   * The second clause is the other half of {@link #candidateCars}' correction and is useless
   * without it. Once a decision may name a car other than the promised one — which it may, as soon
   * as somebody at the landing has been promised nothing — the promised car would lose its hall
   * call and stop coming, and the people it answered would wait for a car with no reason to
   * travel. Under `reassignmentPolicy: 'never'`, every shipped profile, that is permanent.
   *
   * So a car holding an outstanding promise to a waiter of this call keeps the call. It is not a
   * second allocation: it is the first one, still owed, expressed the only way a car is ever told
   * to go somewhere. {@link #tellThePanel} is deliberately told about `decision.carIds` and not
   * about this union, so a retained, already-full car collects no *new* promises.
   *
   * Conventionally — no panel — nobody is promised anything, {@link #withPromiseHolders} returns
   * its argument, and this is the assignment loop it has always been.
   *
   * @returns `true` if any car's commitments actually changed.
   */
  #applyDecision(
    active: ActiveCall,
    decision: Pick<DispatchDecision, 'carIds'>,
    at: SimTime,
  ): boolean {
    const chosen = decision.carIds;
    // A decision that names nobody discharges the allocation outright, exactly as it always has:
    // there is no car to keep the promised alongside, and the call is retried or reported.
    const next = chosen.length === 0 ? chosen : this.#withPromiseHolders(active, chosen);
    let changed = false;
    for (const carId of active.carIds) {
      if (next.includes(carId)) continue;
      this.#carsById.get(carId)?.releaseHallCall(active.id);
      changed = true;
    }
    for (const carId of next) {
      if (active.carIds.includes(carId)) continue;
      this.#carsById.get(carId)?.assignHallCall(active.call);
      changed = true;
    }
    active.carIds = next;
    // **The landing panel answers**, at the instant the group decides and not one event later.
    // Unconditional on `changed`, because a decision that names the car it already named is still
    // the answer somebody who arrived since is waiting for.
    if (chosen.length > 0) this.#tellThePanel(active, chosen, at);
    return changed;
  }

  /**
   * The decision's cars, plus every other car of this bank that still owes a waiter of this call
   * the trip the panel promised them.
   *
   * The withdrawn car is excluded on purpose and not by accident: `#onServiceChange` has already
   * revoked its promises (§ T22-D1), so it holds none to retain, and re-committing a car that has
   * left group control is the defect that decision closed.
   */
  #withPromiseHolders(active: ActiveCall, chosen: readonly string[]): readonly string[] {
    if (!this.#panelAssigns) return chosen;
    const floor = this.#building.requireFloor(active.floorId);
    const owed: string[] = [];
    for (const passenger of this.#waitingForCall(floor, active)) {
      const carId = passenger.assignedCarId;
      if (carId === undefined || chosen.includes(carId) || owed.includes(carId)) continue;
      const car = this.#carsById.get(carId);
      if (car === undefined || car.bankId !== active.bankId || !car.acceptsHallCalls) continue;
      owed.push(carId);
    }
    return owed.length === 0 ? chosen : Object.freeze([...chosen, ...owed]);
  }

  /**
   * Tell everyone still standing at this request which car to walk to.
   *
   * Called from {@link #applyDecision} — the one place a call moves onto a car — so a passenger
   * cannot be promised a car the group did not choose, and cannot reach a queue anyone serves
   * without the promise also reaching the metrics layer. That is the same argument `#admit`'s
   * docstring makes for `recordArrival`, and it is what makes `legsAssigned` a check rather than
   * a tautology.
   *
   * **Only the unpromised are told anything.** `Passenger.assign` is write-once and throws on a
   * second call; skipping the already-promised is not a way around that throw but the statement
   * of the rule — a decision that moves a call to another car (stage 5's capacity migration, or a
   * re-offer) does not move the people who were already told where to stand.
   *
   * Under `split-demand` a request may be given several cars, and the queue is dealt across them
   * in arrival order. Under `single-car` — every shipped profile — that is `carIds[0]` for
   * everybody, evaluated identically.
   *
   * ## And **no more of them than the car can carry**
   *
   * This used to promise *every* unpromised waiter to `carIds[0]` with no bound at all, and the
   * bound's absence was a defect rather than a simplification. Measured on Vertical City at the
   * moment of a bump: **81 riders promised to one car at the median** — against a car that holds
   * 13 to 20 — with four of its seven siblings idle and completely empty, and one of them standing
   * at that very landing in 39–77 % of bumps. On the `office-day` template the panel delivered
   * 14 725 journeys and left **4 597** standing, where `collective` on the identical trace
   * delivered 19 293 and left none — with a longest served wait of 23 404.5 s against 721.7 s.
   *
   * So the panel promises while the car's outstanding promises are **below its design load**, and
   * stops the moment they cross it — clause for clause the rule {@link #boardFrom} applies at the
   * doorway, crossing by one person for the same reason (the sensor trips *after* somebody steps
   * in), and per **deck** for the same reason again: a deck is a room with its own doorway.
   *
   * **The ceiling is the outstanding promises alone and not the car's present load**, deliberately.
   * A promise is a claim on the car's doorway *at the pickup landing*, and what the car happens to
   * be carrying at the instant the panel speaks is not a fact about that moment — a shuttle full of
   * down-riders at floor 76 is empty by the time it reaches G. Pricing the load it will arrive with
   * is stage 2 and 3's job (`loadFactorOnArrival`), and this is not a second, worse copy of it: it
   * is the bound that stops the panel writing a cheque for a car that holds thirteen.
   *
   * Riders it cannot promise are left **unpromised**, which is a state a landing can already be in
   * (a call every car refused reaches nobody either), and the pass that could not place them sets
   * {@link #promisesDeferred} so the bank is asked again on the ordinary retry timer.
   *
   * **This is not a weakening of § D29 and does not touch a promise that exists.** D29 is about a
   * passenger the panel has already answered: they keep their car, they are skipped here as they
   * always were, and `brokenPromises` still counts every time a full car leaves them. What this
   * refuses is a *new* promise to a car that is already over-subscribed — a rider who has been told
   * nothing, and whom D29 says nothing about.
   */
  #tellThePanel(active: ActiveCall, carIds: readonly string[], at: SimTime): void {
    if (!this.#panelAssigns) return;
    const floor = this.#building.requireFloor(active.floorId);
    const bank = this.#building.bankById(active.bankId);
    /* c8 ignore next -- every active call belongs to a bank of this building. */
    if (bank === undefined) return;
    let index = 0;
    for (const passenger of this.#waitingForCall(floor, active)) {
      if (passenger.isAssigned) continue;
      if (!this.#bankCanCarry(bank, passenger)) continue;
      const car = this.#carWithPromiseRoom(carIds, index, active.floorId);
      if (car === undefined) {
        // Nobody the group named has room to promise. Left standing, unpromised, and the bank is
        // asked again — rather than promised a car that cannot come for them.
        this.#promisesDeferred += 1;
        continue;
      }
      index += 1;
      passenger.assign(car.id, at);
      this.#chargePromise(car, active.floorId, passenger.massKg);
      this.#recorder.recordAssignment(passenger, at, { carId: car.id, bankId: bank.id });
      this.#legsAssigned += 1;
    }
  }

  /**
   * The first of the named cars, starting at `index`, whose deck at this floor may still be
   * promised to. `undefined` when none of them may.
   *
   * The ring walk preserves `split-demand`'s deal exactly — with every car in room it returns
   * `carIds[index % carIds.length]`, which is the expression this replaced — and under
   * `single-car`, every shipped profile, it is one car and one test.
   */
  #carWithPromiseRoom(
    carIds: readonly string[],
    index: number,
    floorId: string,
  ): Car | undefined {
    for (let offset = 0; offset < carIds.length; offset += 1) {
      const carId = carIds[(index + offset) % carIds.length];
      /* c8 ignore next -- `carIds` is non-empty at every call site. */
      if (carId === undefined) continue;
      const car = this.#carsById.get(carId);
      if (car === undefined) continue;
      const promised = this.#promisedMassKg.get(this.#promiseKey(car, floorId)) ?? 0;
      if (promised < this.#promiseCeilingKg(car)) return car;
    }
    return undefined;
  }

  /**
   * Which load cell a promise made at this floor will eventually be weighed by.
   *
   * One key per car conventionally; one per **deck** for a double-deck car, because
   * {@link #boardFrom} stops on `deckMassKg >= deckDesignLoadKg` and a whole-car ceiling would let
   * one deck be promised twice what it holds. The floor is the passenger's own origin, so the key
   * a promise is charged to is the key it is discharged from.
   */
  #promiseKey(car: Car, floorId: string): string {
    if (car.deckDesignLoadKg === undefined) return car.id;
    return `${car.id}#${String(deckSlot(car.deckFor(floorId)))}`;
  }

  /** The design load {@link #promiseKey}'s cell is measured against — per deck where there is one. */
  #promiseCeilingKg(car: Car): number {
    return car.deckDesignLoadKg ?? car.loadSensor.designLoadKg;
  }

  /** Put a promise on the car's books. */
  #chargePromise(car: Car, floorId: string, massKg: number): void {
    const key = this.#promiseKey(car, floorId);
    this.#promisedMassKg.set(key, (this.#promisedMassKg.get(key) ?? 0) + massKg);
  }

  /**
   * Take a promise off them again — boarded, revoked, or the rider walked out.
   *
   * Silent when the car is gone or nothing was charged, because the three callers are each already
   * guarded on the passenger holding a promise and a fourth guard here would only hide a drift.
   */
  #dischargePromise(carId: string | undefined, floorId: string, massKg: number): void {
    if (carId === undefined) return;
    const car = this.#carsById.get(carId);
    /* c8 ignore next -- a promise names a car of this run's own building. */
    if (car === undefined) return;
    const key = this.#promiseKey(car, floorId);
    const remaining = (this.#promisedMassKg.get(key) ?? 0) - massKg;
    if (remaining > 0) this.#promisedMassKg.set(key, remaining);
    else this.#promisedMassKg.delete(key);
  }

  /** Whether every car refused this call for a reason that cannot change with time. */
  #isStructurallyUnservable(decision: DispatchDecision): boolean {
    if (decision.scores.length > 0 || decision.rejected.length === 0) return false;
    return decision.rejected.every(
      (verdict) => verdict.reason !== undefined && STRUCTURAL_INELIGIBILITY.has(verdict.reason),
    );
  }

  /**
   * Note that a landing cannot be collected as things stand, and stop asking on a timer.
   *
   * **This docstring used to describe an access-restricted *pickup* floor as the overwhelmingly
   * common cause, and it was describing a defect it had mistaken for a design.** `estimateCost`
   * applied access zoning to the floor named in the request; under `up-down-buttons` a landing
   * call carries no credential by construction, so every car refused every landing call raised
   * on a restricted floor and no access-zoned building could be operated by any conventional
   * dispatcher at any budget. That is fixed — the credential question is asked about the
   * destination and not about the pickup (§ D254) — so the cause named here no longer exists,
   * and the sentence is kept as a correction rather than deleted, because the claim it made is
   * repeated across this repository and a reader who meets it elsewhere needs to find its
   * refutation.
   *
   * What remains reachable is the genuine article: a `destinationServiceZone` or
   * `destinationAccessDenied` refusal — a disclosed destination this bank does not serve, or one
   * the disclosed credential may not reach. `#kioskAllows` is the shipped instance.
   *
   * The runner does not paper over it. The passengers stay on the landing, are counted in
   * {@link SimulationResult.undelivered}, the run is reported `timed-out`, and a warning names
   * the call — because a quietly-shortened run of a system that cannot serve a tenth of its
   * traffic is exactly the "confident nonsense" CLAUDE.md exists to prevent.
   *
   * The warning is emitted at the end rather than here, and only for calls that were still
   * stuck when the run finished: a landing can be freed by a car that stopped for some other
   * reason and loaded it on the way past, and reporting that as unservable would be a lie.
   */
  #markUnservable(active: ActiveCall, decision: DispatchDecision): void {
    const reasons = [...new Set(decision.rejected.map((verdict) => String(verdict.reason)))];
    this.#unservable.set(active.id, reasons.join(', '));
  }

  /**
   * Ask the bank's controller again at `at`.
   *
   * Only ever used for a **future** instant: a same-instant request goes through
   * `#dispatchBank`'s dirty flag instead, because a tick that re-scheduled itself at the time
   * it fired would spin the queue without advancing the clock.
   *
   * **At most one useful tick is outstanding per bank.** A request is dropped when a tick is
   * already queued no later than it, because that tick will run the same full pass over the
   * same call set. Without this the ticks multiply rather than coalesce: every car event that
   * left a call unassigned would start its own chain, and each chain would fork again on the
   * next retry — half a million events on a 420-passenger building, and each of them re-pricing
   * the whole bank.
   */
  #scheduleTick(bankId: string, at: SimTime): void {
    if (at > this.#deadlineS) {
      this.#deadlineTruncations += 1;
      return;
    }
    if (at <= this.#kernel.now()) {
      this.#dispatchBank(bankId, this.#kernel.now());
      return;
    }
    let pending = this.#pendingTicks.get(bankId);
    if (pending === undefined) {
      pending = new Set<number>();
      this.#pendingTicks.set(bankId, pending);
    }
    for (const queued of pending) {
      if (queued <= at) return;
    }
    pending.add(at);

    this.#kernel.schedule(
      at,
      dispatchTickEvent({ bankId, dueAt: at }, (payload, context) => {
        this.#pendingTicks.get(payload.bankId)?.delete(payload.dueAt);
        this.#dispatchBank(payload.bankId, context.time);
      }),
    );
  }

  /** Extinguish a call: nobody eligible is left on that landing for that bank. */
  #completeCall(active: ActiveCall, at: SimTime): void {
    this.#unservable.delete(active.id);
    // The landing has been collected, so whatever was refused on the way there is history. A
    // re-offer keeps its tally instead: same button, same people, still waiting.
    this.#refusals.delete(active.id);
    this.#policies.get(active.bankId)?.complete(active.id, at);
    for (const carId of active.carIds) this.#carsById.get(carId)?.releaseHallCall(active.id);
    active.carIds = Object.freeze([]);
    this.#activeCalls.delete(active.id);
    this.#syncButton(active.floorId, active.direction);
  }

  /**
   * Put a still-occupied landing back out to the group, unallocated.
   *
   * Three situations reach here, and the first two are the same situation: a car was sent for a
   * landing and the landing is still occupied afterwards. Either the car filled up and left
   * people behind, or it arrived already bypassing on load and could not open for them at all.
   *
   * The third is a **service-mode change** ({@link #onServiceChange}): a car recalled, taken out
   * of service or put on independent operation drops its hall calls, and the landings behind them
   * are still occupied. It is the same problem — work committed to a car that will not do it —
   * and it takes the same remedy, which is why it is this method and not a fourth one.
   *
   * **Why the lifecycle is completed and re-registered rather than merely edited.** The
   * policy's lifecycle is the authority on who holds a call, and the only ways out of it are
   * `complete` and `cancel`; taking the car off the runner's own record would leave the policy
   * still believing the call is assigned, and under `reassignmentPolicy: 'never'` — the default
   * for every profile in `data/dispatcher-profiles.json` — every later decision returns
   * `retained` forever. That is not a hypothetical: it pins a whole bank's landing traffic onto
   * one car while the rest of the group stands idle, and it costs about three quarters of the
   * building's handling capacity.
   *
   * It is also the honest reading of the stage-5 policy. `never` means an allocation is final
   * *until the car answers it*; once the car has opened its doors — or has demonstrated it
   * cannot — the allocation is discharged, and the people still standing there are a fresh
   * allocation problem. docs/01-architecture.md is explicit about the second case:
   * "capacity-driven bypass requires reassignment… when the load sensor reports full, that
   * car's committed hall calls must migrate elsewhere."
   *
   * The call keeps its **original** `registeredAt`, because the button has been lit since the
   * first press and nobody re-pressed it — so a starvation term still sees a ninety-second-old
   * call, not a brand new one.
   */
  #reofferCall(car: Car, active: ActiveCall, at: SimTime): void {
    const policy = this.#policies.get(active.bankId);
    const bank = this.#building.bankById(active.bankId);
    /* c8 ignore next -- every active call belongs to a bank with a policy. */
    if (policy === undefined || bank === undefined) return;

    this.#unservable.delete(active.id);
    policy.complete(active.id, at);
    for (const carId of active.carIds) this.#carsById.get(carId)?.releaseHallCall(active.id);
    car.releaseHallCall(active.id);
    active.carIds = Object.freeze([]);

    const waiting = this.#eligibleWaiting(bank, active);
    if (waiting.count === 0) {
      this.#activeCalls.delete(active.id);
      this.#syncButton(active.floorId, active.direction);
      return;
    }
    // **A broken promise, counted** (DECISIONS.md § D29). Everybody still standing here whom
    // *this* car had been promised to is somebody a full car left behind. Their `assignedCarId`
    // stands and they wait for it — `#candidateCars` hands this call back to the promised cars
    // while everybody left here is one of them, and `#applyDecision` keeps a promised car on the
    // call even when the group names another for the unpromised — so the count is the price of
    // committing at the panel rather than a fault.
    if (this.#panelAssigns) {
      const floor = this.#building.requireFloor(active.floorId);
      for (const passenger of this.#waitingForCall(floor, active)) {
        if (passenger.assignedCarId === car.id) this.#brokenPromises += 1;
      }
    }
    // The person who pressed the button has gone up in the car; the credential on the re-offer
    // is whoever is now at the head of what is left.
    active.call = this.#callValue(
      active.id,
      this.#building.requireFloor(active.floorId),
      active.direction,
      active.call.registeredAt,
      bank,
      active.destinationFloorId,
    );
    policy.register(active.call, active.call.registeredAt, {
      waitingPassengers: waiting.count,
      waitingMassKg: waiting.massKg,
    });
  }

  /* ---------------------------------------------------------------- *
   * Cars
   * ---------------------------------------------------------------- */

  /**
   * Give an idle car its next instruction: stop here, go to the next stop, or park.
   *
   * Idempotent and guarded, so it is safe to call for every car in a bank after every
   * decision: a car that is moving or has its doors open already has an event pending and is
   * left alone.
   */
  #stepCar(car: Car, at: SimTime): void {
    if (!this.#isIdle(car)) return;

    const service = this.#serveHere(car, at);
    // The re-offer is issued **after** the stop decision, never in the middle of it: a
    // dispatch pass can assign this very car new work and send it on its way, and a decision
    // half-taken against the car it was standing at a moment ago would open the doors of a
    // moving lift.
    if (service.dirty) this.#dispatchBank(car.bankId, at);
    if (service.stopped || !this.#isIdle(car)) return;

    const next = this.#nextStopFloorId(car, at);
    if (next !== undefined) {
      this.#depart(car, next, at);
      return;
    }
    if (this.#loadWhileIdle(car, at)) return;
    this.#park(car, at);
  }

  /** Standing still with its doors shut: the only state in which a car takes an instruction. */
  #isIdle(car: Car): boolean {
    return !car.isMoving && car.doorState === 'closed';
  }

  /**
   * A car with nothing committed, standing at a landing that has people on it, opens up.
   *
   * Not a dispatch decision and not a way around one — it is what the group controller's own
   * allocation has already produced. The controller decides where cars *go*; an empty car that
   * is already standing where the queue is does not need permission to open its doors, and a
   * simulation in which it waits for one gets up-peak badly wrong: with a lobby parking
   * strategy every free car returns to the terminal, and if none of them may load until it is
   * separately allocated the landing's one button serves one car at a time while three sit
   * closed a metre away.
   *
   * Safe against spinning, for a structural reason: "nothing committed" means an *empty* car
   * (a passenger aboard is a committed stop), so the load cell always has room and the queue
   * always shrinks. A stop that could board nobody is never begun.
   *
   * **Not a way around service mode**, though it is a way around a dispatch decision.
   * {@link #waitingFor} counts through {@link #carCanCarry}, which refuses a car that may not take
   * a landing queue, so a recalled or out-of-service car standing at a full landing counts zero
   * and opens nothing. Without that the group would stop allocating and the doors would keep
   * opening anyway — and `Car.registerCarCall` would throw the moment somebody stepped in.
   */
  #loadWhileIdle(car: Car, at: SimTime): boolean {
    // Both landings a double-deck car is standing at, not one: an empty shuttle parked at the
    // pair `[26, 27]` with a queue on 27 and nobody on 26 is standing where the queue is.
    const waiting = car
      .floorIdsServedHere()
      .map((floorId) => this.#building.requireFloor(floorId))
      .some(
        (floor) =>
          this.#waitingFor(car, floor, 'up', at) > 0 ||
          this.#waitingFor(car, floor, 'down', at) > 0,
      );
    if (!waiting) return false;
    return this.#beginStop(car, [], [], at) === 'stopped';
  }

  /**
   * Stage 6, for every call this car holds at the floor it is standing on.
   *
   * **Every refusal is a surrender, except the one that is somebody else's call.** A refusal
   * the runner ignores leaves the call pinned to a car that will not answer it, and under
   * `reassignmentPolicy: 'never'` — the default for every profile in
   * `data/dispatcher-profiles.json` — the lifecycle then keeps that car forever and no other
   * car can be given the landing. The passengers are stranded, the car ping-pongs between its
   * remaining commitments until the deadline, and the run reports itself merely slow. So the
   * switch below is exhaustive over `AnswerDecision['reason']` and the compiler enforces it:
   * a reason added to `ANSWER_REASONS` cannot be silently dropped here.
   *
   * - `bypassing-load` — the car filled up on the way. This is the capacity-driven
   *   reassignment docs/01-architecture.md names as the reason a pure agent-per-elevator model
   *   fails; without it a full car holds a landing hostage until it happens to empty.
   * - `direction-mismatch` — the car's committed route turned against the call after it was
   *   allocated, and `eligibility.allowOppositeDirectionPickup` is off. Same remedy: the
   *   allocation is discharged and the group re-allocates. That tunable is one an optimizer is
   *   documented to search (`dispatch/types.ts`), so this is a reachable configuration and not
   *   a hypothetical.
   * - `not-at-floor` — unreachable from here (this runs only for a stopped car at the call's
   *   own floor), and surrendering is the safe reading of it if it ever becomes reachable.
   * - `not-assigned` — the group moved this call while the car was on its way. Nothing to
   *   re-offer: the lifecycle already names somebody else.
   *
   * @returns whether a stop was begun, and whether the bank now owes a fresh decision. The
   *   caller issues that decision; issuing it from here would let a dispatch pass move this
   *   car while the stop it is standing in is still being decided.
   */
  #serveHere(car: Car, at: SimTime): { stopped: boolean; dirty: boolean } {
    const bank = this.#building.bankById(car.bankId);
    const policy = this.#policies.get(car.bankId);
    /* c8 ignore next -- every car is built from a bank that has a policy. */
    if (bank === undefined || policy === undefined) return { stopped: false, dirty: false };

    const served: ActiveCall[] = [];
    let snapshots: readonly CarSnapshot[] | undefined;
    let dirty = false;

    for (const call of car.assignedHallCalls) {
      // "At this car's floor" is "at either floor this car's decks open onto". Identity for a
      // single-deck car, where `stopFloorFor` returns its argument.
      if (car.stopFloorFor(call.floorId) !== car.floorId) continue;
      const active = this.#activeCalls.get(call.id);
      if (active === undefined) {
        car.releaseHallCall(call.id);
        continue;
      }
      snapshots ??= this.#snapshots(bank, at);
      const me = snapshots.find((snapshot) => snapshot.carId === car.id);
      /* c8 ignore next -- the car belongs to the bank whose snapshots these are. */
      if (me === undefined) continue;

      const decision = policy.answer(me, active.call, at, snapshots);
      if (decision.answer) {
        served.push(active);
        continue;
      }
      switch (decision.reason) {
        case 'not-assigned':
          car.releaseHallCall(call.id);
          break;
        case 'bypassing-load':
        case 'direction-mismatch':
        case 'not-at-floor':
          this.#noteRefusal(active, car.id, decision.reason);
          this.#reofferCall(car, active, at);
          dirty = true;
          break;
        /* c8 ignore next 4 -- both of these answer `true` and were handled above. */
        case 'assigned':
        case 'sole-eligible-override':
          break;
        default: {
          const unhandled: never = decision.reason;
          throw new SimulationError(
            `Stage 6 returned answer reason "${String(unhandled)}" for call "${active.id}", which the runner does not handle. Every non-answer must either release the call or surrender it to the group; ignoring one strands the landing.`,
          );
        }
      }
    }

    const alighting = car.alightingHere();
    if (alighting.length === 0 && served.length === 0 && !car.hasCarCall(car.floorId)) {
      return { stopped: false, dirty };
    }

    const outcome = this.#beginStop(car, alighting, served, at);
    if (outcome === 'stopped') return { stopped: true, dirty };
    if (outcome === 'nobody-would-move') {
      // Answering a call the load cell will not let the car load from is a stop that cycles the
      // doors for nobody, leaves the landing exactly as it was, and hands the call straight
      // back to the same car — which is a livelock, not a stop. Stage 6 can produce it: an
      // `allowBypassIfSoleEligibleCar` override answers on behalf of a car that is over the
      // bypass threshold. The honest move is the same as any other overflow: surrender.
      for (const active of served) {
        this.#noteRefusal(active, car.id, 'nobody-would-board');
        this.#reofferCall(car, active, at);
        dirty = true;
      }
    }
    return { stopped: false, dirty };
  }

  /**
   * Remember that this bank was asked to collect a landing while it had **no car in group
   * control at all**, so the run can say so instead of reporting a bare `timed-out`.
   *
   * Asked at the one place that already knows both halves — a live call with somebody eligible
   * standing at it, and the bank whose cars are about to be priced. A bank with cars but none of
   * them accepting hall calls and a bank with no cars are the same fact to a waiting rider, so
   * they are the same predicate here: `Car.acceptsHallCalls` is false for `out-of-service`,
   * `independent` and `fire-recall` alike, and `some` over an empty fleet is false, so a bank with
   * no cars at all falls through the guard and is recorded like any other.
   *
   * Silent on every shipped building — none declares `serviceEvents` or a car `mode` — so no run
   * this repository has published acquires a warning.
   */
  #noteUnservedBank(bank: Bank<Car>, waiting: number, at: SimTime): void {
    if (bank.cars.some((car) => car.acceptsHallCalls)) return;
    const seen = this.#banksWithoutService.get(bank.id);
    if (seen === undefined) {
      this.#banksWithoutService.set(bank.id, { from: at, until: at, peakWaiting: waiting });
      return;
    }
    seen.until = at;
    seen.peakWaiting = Math.max(seen.peakWaiting, waiting);
  }

  /** Remember that a car declined a call, so a call nobody will answer can be named at the end. */
  #noteRefusal(active: ActiveCall, carId: string, reason: string): void {
    const byCar = this.#refusals.get(active.id) ?? new Map<string, RefusalTally>();
    this.#refusals.set(active.id, byCar);
    const tally = byCar.get(carId) ?? { count: 0, reasons: new Set<string>() };
    tally.count += 1;
    tally.reasons.add(reason);
    byCar.set(carId, tally);
  }

  /**
   * Open up, sized for the people who are actually going to move.
   *
   * The dwell has to be granted *before* anybody moves, because the door machine grants it at
   * the moment of opening — so the counts handed to `openDoors` are a projection, computed the
   * same way the boarding loop will later execute. Getting that projection wrong does not lose
   * anybody; it makes the stop the wrong length, which is the `2·P·tp` term the Barney/CIBSE
   * round-trip-time oracle is most sensitive to.
   *
   * Two things stop a stop from happening at all, and both are guards against a run that never
   * ends rather than modelling choices:
   *
   * 1. **Past the drain deadline.** `drainGraceS` is documented as a hard timeout, so the door
   *    path is gated exactly as travel is (`#depart`, `#scheduleTick`, `#scheduleTransfer`).
   *    Gating only travel leaves a car free to cycle its doors for the rest of the run, which
   *    is not a timeout at all — it is an unbounded run with a deadline written on it.
   * 2. **Nobody would move.** A stop at which no one alights, no one boards and no car call is
   *    outstanding changes nothing about the world, so repeating it changes nothing either. It
   *    is reachable whenever stage 6 answers while the load cell refuses to load, and it is
   *    then not a rare event but an infinite one.
   */
  #beginStop(
    car: Car,
    alighting: readonly Passenger[],
    served: readonly ActiveCall[],
    at: SimTime,
  ): StopOutcome {
    if (at > this.#deadlineS) {
      this.#deadlineTruncations += 1;
      return 'past-deadline';
    }

    // **One stop, one or two landings.** A double-deck car standing at the lower floor of a pair
    // has both decks open, so the stop loads and unloads two floors at once. `floorIdsServedHere`
    // is `[car.floorId]` for every single-deck car, and every accumulator below then collapses to
    // the whole-car one it was.
    const floorIds = car.floorIdsServedHere();
    const floors = floorIds.map((floorId) => this.#building.requireFloor(floorId));
    const directions = this.#boardingDirections(car, floors, served, at);

    let alightingMassKg = 0;
    const deckAlighting: [number, number] = [0, 0];
    const deckAlightingMassKg: [number, number] = [0, 0];
    for (const passenger of alighting) {
      const slot = deckSlot(car.deckFor(passenger.destinationFloorId));
      alightingMassKg += passenger.massKg;
      deckAlightingMassKg[slot] += passenger.massKg;
      deckAlighting[slot] += 1;
    }

    let boarding = 0;
    const deckBoarding: [number, number] = [0, 0];
    let projectedMassKg = car.loadSensor.massKg - alightingMassKg;
    const deckMassKg: [number, number] = [
      car.deckMassKg('lower') - deckAlightingMassKg[0],
      car.deckMassKg('upper') - deckAlightingMassKg[1],
    ];
    for (const floor of floors) {
      const slot = deckSlot(car.deckFor(floor.id));
      for (const direction of directions) {
        const projected = this.#projectedBoarding(
          car,
          floor,
          direction,
          projectedMassKg,
          deckMassKg[slot],
          at,
        );
        boarding += projected.count;
        deckBoarding[slot] += projected.count;
        projectedMassKg = projected.massKg;
        deckMassKg[slot] = projected.deckMassKg;
      }
    }

    const carCallHere = floorIds.some((floorId) => car.hasCarCall(floorId));
    if (alighting.length === 0 && boarding === 0 && !carCallHere) {
      return 'nobody-would-move';
    }

    // **The dwell is the busier deck, not the sum.** Both decks open on the same interlock and
    // both queues move through their own doorway in parallel, so a stop that unloads four below
    // and one above takes `4 x tp`. Charging `5 x tp` would return the door-time saving the
    // hardware exists to produce — and `2*P*tp` is the term the Barney/CIBSE round trip is most
    // sensitive to. Degenerate for a single-deck car: everything is on the lower deck.
    const movers = car.isDoubleDeck
      ? Math.max(deckAlighting[0] + deckBoarding[0], deckAlighting[1] + deckBoarding[1])
      : alighting.length + boarding;
    car.openDoors(at, {
      carCall: alighting.length > 0 || carCallHere,
      // A landing stop is a landing stop whether or not this car was the one sent for it: the
      // dwell has to cover somebody noticing the car, walking to it and stepping in either way.
      hallCall: served.length > 0 || boarding > 0,
      hallQueueLength: car.isDoubleDeck ? Math.max(deckBoarding[0], deckBoarding[1]) : boarding,
      transferSeconds: movers * car.passengerTransferS,
      /*
       * **Everybody standing here, not everybody boarding here** (docs/14 § 3.2).
       *
       * `hallQueueLength` above is the boarding cohort — the people this car is about to take.
       * This is the whole landing, in both directions, including the riders going the other way
       * and the ones this car has no room for. That is the number a crowd is: the people you have
       * to get past to reach the doorway do not stop being in the way because they are waiting
       * for a different car.
       *
       * The busier of the two landings on a paired double-deck stop, by the rule the dwell above
       * already follows: the decks open on one interlock and the stop takes the slower of them.
       *
       * **Omitted entirely when the run declares no crowding term.** It was populated
       * unconditionally at first, on the argument that the door normalizes an unread field to a
       * factor of exactly 1 — and `sameStopReason` compares it, so a stop reason could in
       * principle compare unequal where it used to compare equal. Measured leg-by-leg across 18
       * cells that came out at 0 differing cells, which is *inert in practice* rather than
       * *inert*. Spreading it away makes it the second, at the cost of one branch.
       */
      ...(this.#options.lobbyCrowding === undefined
        ? {}
        : { lobbyOccupancy: busiestLandingOf(floors) }),
    });
    if (car.isDoubleDeck) {
      this.#doubleDeckStops += 1;
      if (floorIds.length > 1) this.#doubleDeckPairedStops += 1;
      this.#doubleDeckBoardingsProjected[0] += deckBoarding[0];
      this.#doubleDeckBoardingsProjected[1] += deckBoarding[1];
    }
    this.#stops.set(car.id, {
      alighting,
      served,
      directions,
      transferred: false,
      alighted: false,
    });
    this.#scheduleDoor(car);
    return 'stopped';
  }

  /**
   * Which landing queues a stopped car loads from.
   *
   * Allocation decides where a car **stops**; it does not decide who walks through an open
   * door. Restricting boarding to the calls a car was allocated makes a lobby a one-car-at-a-
   * time queue — the button is one call, so exactly one car may serve it, and a bank of four
   * delivers a quarter of its handling capacity while three cars stand empty at the terminal.
   * That is not a dispatcher being bad; it is the simulator refusing to model what happens when
   * the doors open.
   *
   * So a stop loads from three sources, unioned and deduplicated:
   *
   * 1. the directions of the hall calls this car was allocated here and answered (stage 6);
   * 2. the direction the car is **about to travel** — conventional collective behaviour, and
   *    the physical fact that a car leaving upward with room in it does not leave up-going
   *    passengers on the landing;
   * 3. when the car has nothing else committed, whichever direction has people in it, since an
   *    idle car with its doors open will take whoever is there and go where they are going.
   *
   * Never both directions on one stop, except when the car was genuinely allocated both: a car
   * that swallowed an up queue and a down queue in the same stop would deliver everyone
   * eventually, but through a route no controller asked for.
   */
  #boardingDirections(
    car: Car,
    floors: readonly Floor[],
    served: readonly ActiveCall[],
    at: SimTime,
  ): readonly Direction[] {
    const chosen = new Set<Direction>();
    for (const active of served) chosen.add(active.direction);

    const onward = this.#onwardDirection(car, at);
    if (onward !== undefined) {
      chosen.add(onward);
    } else if (chosen.size === 0) {
      // Idle, doors open. Take the fuller queue; ties go up, so the choice is total and does
      // not depend on the order two queues happened to be built in. **Summed over the landings
      // this stop opens onto**, because the decks travel together: one direction is chosen for
      // the car, not one per deck, and a car that took "up" below and "down" above would have to
      // come apart to honour both.
      let up = 0;
      let down = 0;
      for (const floor of floors) {
        up += this.#waitingFor(car, floor, 'up', at);
        down += this.#waitingFor(car, floor, 'down', at);
      }
      if (up > 0 || down > 0) chosen.add(up >= down ? 'up' : 'down');
    }

    return Object.freeze(DIRECTIONS.filter((direction) => chosen.has(direction)));
  }

  /** Which way the car leaves this floor, or `undefined` if it has nowhere else to be. */
  #onwardDirection(car: Car, at: SimTime): Direction | undefined {
    const next = this.#nextStopFloorId(car, at);
    if (next === undefined) return undefined;
    const target = car.shaft.floorsById.get(next);
    /* c8 ignore next -- the route is built from this shaft's own floors. */
    if (target === undefined) return undefined;
    return target.index > car.floorIndex ? 'up' : 'down';
  }

  /**
   * How many at this landing, going this way, this car could actually carry **now**.
   *
   * Under a panel that means the people it was promised to and whose walk is done, which is what
   * keeps an idle car from opening its doors for a queue it may not touch — a stop that boards
   * nobody, cycles the doors and leaves the landing exactly as it found it.
   */
  #waitingFor(car: Car, floor: Floor, direction: Direction, at: SimTime): number {
    let count = 0;
    for (const passenger of floor.waiting(direction)) {
      if (this.#carCanCarry(car, passenger) && this.#promiseAllows(car, passenger, at)) count += 1;
    }
    return count;
  }

  /**
   * Queue the next door transition, unless the deadline has passed.
   *
   * The gate matters as much as the one in {@link beginStop}: a door that reopens is a fresh
   * transition, so a stop already in progress could otherwise carry a run past its hard
   * timeout one obstruction at a time.
   */
  #scheduleDoor(car: Car): void {
    const next = car.nextDoorTransitionAt();
    /* c8 ignore next -- only an overloaded car holds its doors, and boarding never overloads one. */
    if (next === undefined) return;
    if (next > this.#deadlineS) {
      this.#deadlineTruncations += 1;
      return;
    }
    this.#kernel.schedule(
      next,
      carDoorEvent({ carId: car.id }, (payload, context) => {
        this.#onDoorEvent(payload.carId, context.time);
      }),
    );
  }

  #onDoorEvent(carId: string, at: SimTime): void {
    const car = this.#carsById.get(carId);
    /* c8 ignore next -- door events are only scheduled for cars in this building. */
    if (car === undefined) return;

    const step = car.advanceDoorsTo(at);
    let reachedOpen = false;
    let closeStarted = false;
    for (const event of step.events) {
      if (event.type === 'door.opened') reachedOpen = true;
      else if (event.type === 'door.closeStarted') closeStarted = true;
    }

    if (reachedOpen) this.#transferAtStop(car, at);

    // The photo-eye. The car never decides this for itself — the draw belongs to the runner and
    // comes from the injected StreamSet (CLAUDE.md invariant 2). At probability zero no draw is
    // taken at all, so a run that does not model obstructions leaves the stream untouched.
    if (
      closeStarted &&
      car.doorState === 'closing' &&
      this.#options.doorObstructionProbability > 0 &&
      this.#streams.doorObstruction.bernoulli(this.#options.doorObstructionProbability)
    ) {
      car.requestReopen('obstruction', at);
    }

    // The courtesy hold. Checked after the photo-eye and only while the door is still closing,
    // so an obstruction that has already reversed the door does not also spend a reopen here.
    if (closeStarted && car.doorState === 'closing') {
      this.#reopenForLateArrival(car, at);
    }

    if (car.doorState === 'closed') {
      this.#finishStop(car, at);
      this.#stepCar(car, at);
      return;
    }
    this.#scheduleDoor(car);
  }

  /**
   * Everybody moves at the instant the doors are fully open: out first, then in.
   *
   * Runs a second time after a granted late-arrival reopen, and the alighting half is guarded by
   * its own flag so only the boarding half replays — see {@link StopInProgress.alighted}.
   */
  #transferAtStop(car: Car, at: SimTime): void {
    const stop = this.#stops.get(car.id);
    if (stop === undefined || stop.transferred) return;
    // `alighted` is latched and only a granted reopen clears `transferred`, so this is exactly
    // "the boarding half is replaying because a courtesy hold reversed the door".
    const onReopen = stop.alighted;
    stop.transferred = true;

    // Both decks, in the order they are declared — lower first — so the boarding order of a
    // paired stop is a property of the config and not of a map's iteration.
    const floors = car
      .floorIdsServedHere()
      .map((floorId) => this.#building.requireFloor(floorId));

    if (!stop.alighted) {
      stop.alighted = true;
      for (const passenger of stop.alighting) {
        if (car.isDoubleDeck) this.#doubleDeckAlightings[deckSlot(car.deckFor(passenger.destinationFloorId))] += 1;
        car.alight(passenger, at);
        this.#recorder.recordAlighting(passenger, at);
        if (passenger.isFinalLeg) {
          // A journey that finishes on the building's escalator is still moving after it steps
          // off the lift. The seconds are already on the leg (`egressTransitS`, added to
          // time-to-destination); this is the hop being *counted*, so the audit's hop total is
          // every hop taken and not only the ones that needed an event.
          if (passenger.egressTransitS > 0) this.#transportHops += 1;
        } else {
          this.#scheduleTransfer(passenger, at);
        }
      }
    }

    let boarded = 0;
    for (const floor of floors) {
      for (const direction of stop.directions) {
        boarded += this.#boardFrom(car, floor, direction, at);
      }
    }
    if (onReopen) {
      this.#lateArrivalHoldsBoarded += boarded;
      // The door is fully open here — this handler runs on `door.opened` — so `grantedDwellS` is
      // the dwell this reversed open period was actually given. Read, never recomputed.
      this.#lateArrivalHoldDwellS += car.door.grantedDwellS;
      this.#lateArrivalHoldMaxDwellS = Math.max(
        this.#lateArrivalHoldMaxDwellS,
        car.door.grantedDwellS,
      );
    }

    // The load cell directly, not a whole `CarSnapshot`: this fires on every stop and the
    // reading is the only field the recorder wants.
    this.#recorder.sampleLoad(at, car.id, car.loadSensor.snapshot());
  }

  /**
   * The courtesy hold: somebody reached the landing while the door was closing.
   *
   * **This is the non-test caller `answer.reopenOnLateArrival` did not have.** The knob is
   * schema-validated, profile-authorable and one of the search space's dimensions, and the only
   * thing `Car.requestReopen` was ever called with in a run was `'obstruction'` — so the gate at
   * `doorMachine.refusalFor` (`cause === 'lateArrival' && !config.reopenOnLateArrival`) was
   * unreachable, `DoorAccounting.lateArrivals` was structurally 0 on every run this project can
   * produce, and `DOOR_REOPEN_REFUSALS.policyDisabled` was a verdict nothing could return. That
   * is the *configured, unit-tested, dead in the shipped path* defect, one level up into data.
   *
   * ## Why "somebody eligible is still waiting" is exactly "somebody arrived late"
   *
   * {@link #boardFrom} drains a landing queue of every passenger this car can carry, in arrival
   * order, and stops only when the load cell crosses the **design** load. So at the instant the
   * door starts closing, an eligible passenger still on the landing means one of two things: the
   * car filled up, or they were not there when the doors were open. The first is excluded by the
   * room check below — which is also why no reopen is granted to a full car, since holding the
   * door for somebody who cannot get in is a delay with no boarding to pay for it.
   *
   * ## The room check *is* the boarding predicate, computed by the same function
   *
   * That last sentence was a claim, not a mechanism, and the two disagreed. This asked
   * `massKg >= designLoadKg` plus {@link #carCanCarry}; {@link #boardFrom} admits on
   * `massKg + candidate.massKg < overloadKg` as well. At `answer.overloadThreshold` down at the
   * design load factor — the floor of the declared range — the hold was granted, the door
   * reversed, and the boarding loop then took nobody: exactly the delay-with-no-boarding this
   * docstring says is excluded. So the question is asked of {@link #projectedBoarding}, which is
   * the projection {@link #boardFrom} is defined against, and a hold is requested only when it
   * answers with at least one passenger.
   *
   * ## The dwell is sized to the reopen's cohort, not the stop's
   *
   * The count is then handed to the door as a **revised** {@link DoorStopReason}. Without one,
   * `applyReopen` re-grants `dwellSecondsFor(config, door.reason)` — the original stop's
   * whole-cohort transfer, `(alighting + boardingAtOpen) * tp` up to `maxTransferSeconds` — for
   * however many passengers the hold is actually for, once per honoured reopen. That is not a
   * small overstatement: it made the courtesy hold cost up to 59 % of AWT on `secure-tower`,
   * a figure that was published as the price of the knob and was an artefact of this line.
   *
   * No random draw is involved and none should be: unlike the photo-eye, this is a *deterministic
   * consequence of the trace*, and adding a probability here would spend a stream on something
   * the passenger population already decides (CLAUDE.md invariant 2).
   *
   * The reopen is bounded by `answer.maxReopensPerStop` in the door machine, so a landing that
   * keeps producing arrivals cannot hold a car indefinitely; the door refuses and closes anyway.
   */
  #reopenForLateArrival(car: Car, at: SimTime): void {
    const stop = this.#stops.get(car.id);
    // Only after the transfer really happened. A door closing on a stop that never opened on
    // anybody has no "late" to be late for.
    if (stop === undefined || !stop.transferred) return;
    if (car.loadSensor.massKg >= car.loadSensor.designLoadKg) return;

    // Both landings, and the per-deck cohorts kept apart, because the reopen's dwell is sized
    // the same way the stop's was: the busier deck, not the sum.
    const floors = car
      .floorIdsServedHere()
      .map((floorId) => this.#building.requireFloor(floorId));
    let boarding = 0;
    const deckBoarding: [number, number] = [0, 0];
    let massKg = car.loadSensor.massKg;
    const deckMassKg: [number, number] = [car.deckMassKg('lower'), car.deckMassKg('upper')];
    for (const floor of floors) {
      const slot = deckSlot(car.deckFor(floor.id));
      for (const direction of stop.directions) {
        // `queueLength` before the projection: the latter copies the queue, this runs at the
        // close of every stop, and the overwhelming majority of stops leave an empty landing
        // behind them.
        if (floor.queueLength(direction) === 0) continue;
        const projected = this.#projectedBoarding(
          car,
          floor,
          direction,
          massKg,
          deckMassKg[slot],
          at,
        );
        boarding += projected.count;
        deckBoarding[slot] += projected.count;
        massKg = projected.massKg;
        deckMassKg[slot] = projected.deckMassKg;
      }
    }
    if (boarding === 0) return;
    const holdCohort = car.isDoubleDeck
      ? Math.max(deckBoarding[0], deckBoarding[1])
      : boarding;

    this.#lateArrivalHoldsRequested += 1;
    const step = car.requestReopen('lateArrival', at, {
      // A landing period, for the people the boarding loop is about to take and nobody else.
      // Not `carCall`: nobody alights on a reopen — `stop.alighted` is latched, so the alighting
      // half of the transfer does not replay and must not be paid for a second time either.
      carCall: false,
      hallCall: true,
      hallQueueLength: holdCohort,
      transferSeconds: holdCohort * car.passengerTransferS,
      // The same landing, still as crowded: a courtesy hold re-grants the *hold's own* cohort,
      // and the crowd it has to move through is unchanged by the door reversing. Omitted with no
      // declared term, for the reason `#beginStop` gives.
      ...(this.#options.lobbyCrowding === undefined
        ? {}
        : { lobbyOccupancy: busiestLandingOf(floors) }),
    });
    // Refused — the profile declined the courtesy hold, or the stop's reopen budget is spent.
    // The door carries on closing and the passenger waits for the next car, which is the
    // behaviour `reopenOnLateArrival: false` buys and the reason it is a knob at all.
    if (step.refusal !== undefined) {
      this.#lateArrivalHoldsRefused += 1;
      return;
    }
    this.#lateArrivalHoldsGranted += 1;
    // Counted on the grant, not the request: a refused hold's projection sized no dwell and
    // boards nobody, so including it would make `projected` and `boarded` incomparable — and
    // they are compared, which is the assertion this whole path was missing.
    this.#lateArrivalHoldsProjected += boarding;
    this.#lateArrivalHoldMaxCohort = Math.max(this.#lateArrivalHoldMaxCohort, boarding);
    // Granted, so the boarding half of the transfer replays when the door reaches open again.
    stop.transferred = false;
  }

  /**
   * Fill the car from one landing queue, in arrival order, until the load cell says stop.
   *
   * The rule is the load cell's and only the load cell's: board while the car is below its
   * **design** load — 80% of rated, never 100% (CLAUDE.md § modelling rules) — and stop the
   * moment boarding crosses it. Crossing by one person is deliberate and is what a real car
   * does: the sensor trips *after* somebody steps in, and `isBypassingHallCalls` is then true
   * for every subsequent allocation.
   *
   * Tying "room for one more" to exactly the predicate stage 6 uses is what keeps the two from
   * disagreeing. A separate head-count cap would let a car answer a call and then board nobody,
   * and the call would bounce between "assigned" and "surrendered" forever.
   *
   * @returns how many boarded, which is what {@link #transferAtStop} attributes to a courtesy
   *   hold when the boarding half is replaying. {@link #projectedBoarding} is this loop's
   *   projection and must stay clause-for-clause identical to it.
   */
  #boardFrom(car: Car, floor: Floor, direction: Direction, at: SimTime): number {
    const designLoadKg = car.loadSensor.designLoadKg;
    const overloadKg = car.loadSensor.ratedLoadKg * car.loadSensor.overloadThreshold;
    // **The 80 % rule applies per deck.** A deck is a room with its own doorway; filling one to
    // the whole car's design load because the other happens to be empty would put 26 people into
    // a space that holds 13. `undefined` for every single-deck car, and both clauses below are
    // then exactly the two the whole-car cell already imposed.
    const deck = car.deckFor(floor.id);
    const deckDesignLoadKg = car.deckDesignLoadKg;
    const deckOverloadKg = car.deckOverloadKg;
    let boarded = 0;

    for (;;) {
      if (car.loadSensor.massKg >= designLoadKg) break;
      const massKg = car.loadSensor.massKg;
      const deckMassKg = deckDesignLoadKg === undefined ? 0 : car.deckMassKg(deck);
      if (deckDesignLoadKg !== undefined && deckMassKg >= deckDesignLoadKg) {
        this.#doubleDeckDeckFullRefusals += 1;
        break;
      }
      const [passenger] = floor.takeWaiting(
        direction,
        1,
        // Service zoning, access zoning, and the safety interlock, in that order. This is the
        // serve predicate `Floor.takeWaiting` exists for: on a floor served by two banks, "who
        // is waiting here" and "who can this car take" are different sets.
        (candidate) =>
          this.#carCanCarry(car, candidate) &&
          this.#promiseAllows(car, candidate, at) &&
          massKg + candidate.massKg < overloadKg &&
          (deckOverloadKg === undefined || deckMassKg + candidate.massKg < deckOverloadKg),
      );
      if (passenger === undefined) break;

      if (car.isDoubleDeck) this.#doubleDeckBoardings[deckSlot(deck)] += 1;
      // The promise is discharged the instant it is kept, so the doorway it was a claim on is
      // free to be promised to somebody else. Before `car.board`, which is the statement that
      // makes `hasBoarded` true and the promise no longer outstanding.
      this.#dischargePromise(passenger.assignedCarId, floor.id, passenger.massKg);
      car.board(passenger, at);
      // Counted, not assumed. `#promiseAllows` is the only path into this loop and it refuses
      // the wrong car, so this can only be non-zero if a *second* path into a car appears — which
      // is exactly the defect the phase is most likely to ship, and `#reconcile` fails the run on
      // it rather than reporting a plausible statistic.
      if (passenger.assignedCarId !== undefined && passenger.assignedCarId !== car.id) {
        this.#wrongCarBoardings += 1;
      }
      this.#recorder.recordBoarding(passenger, at, { carId: car.id, bankId: car.bankId });
      boarded += 1;
    }
    return boarded;
  }

  /**
   * Whether a promised passenger may get into *this* car, at *this* instant.
   *
   * Two clauses, and both are the passenger model rather than a policy:
   *
   * 1. **The car is the one the panel named.** Somebody the panel has not answered yet may not
   *    board at all: they are still standing at the kiosk. In practice the panel answers in the
   *    same instant they arrive — `#openCalls` runs a dispatch pass — so the window is empty
   *    unless no car was eligible, which is a landing nobody could serve either way.
   * 2. **The walk is done.** `sim.assignedWalkS` after the panel spoke, charged **between
   *    `arrivedAt` and `boardedAt`** and never by moving `arrivedAt`, which is the window
   *    membership key every paired-t in this project depends on. At the default of 0 the clause
   *    is `at >= assignedAt`, which the kernel guarantees.
   *
   * Trivially `true` under every conventional run, where nobody is assigned anything.
   */
  #promiseAllows(car: Car, passenger: Passenger, at: SimTime): boolean {
    if (!this.#panelAssigns) return true;
    const assignedCarId = passenger.assignedCarId;
    if (assignedCarId !== car.id) return false;
    const assignedAt = passenger.assignedAt ?? 0;
    return at >= assignedAt + this.#options.assignedWalkS;
  }

  /**
   * How many this car would take from one queue, computed exactly as {@link #boardFrom} will
   * take them, starting from a load of `fromMassKg`.
   *
   * Threaded rather than recomputed per direction, so a stop that loads two queues does not
   * price both of them against an empty car and grant twice the dwell it needs.
   *
   * **Every clause of {@link #boardFrom}'s predicate, in the same order.** It used to omit the
   * overload interlock — `massKg + candidate.massKg < overloadKg` — which is inert only while
   * `answer.overloadThreshold` stays well above `car.designLoadFactor`. That was true of the
   * shipped default (1.1 against 0.8: a candidate would have to weigh more than 0.3 x rated) and
   * stopped being guaranteed the moment the declared range's floor moved down to the design load
   * factor. A projection that over-counts grants a dwell for passengers the boarding loop then
   * refuses, and — since {@link #reopenForLateArrival} asks this same question — reverses a door
   * for a passenger who cannot get in.
   */
  #projectedBoarding(
    car: Car,
    floor: Floor,
    direction: Direction,
    fromMassKg: number,
    fromDeckMassKg: number,
    at: SimTime,
  ): { count: number; massKg: number; deckMassKg: number } {
    const designLoadKg = car.loadSensor.designLoadKg;
    const overloadKg = car.loadSensor.ratedLoadKg * car.loadSensor.overloadThreshold;
    const deckDesignLoadKg = car.deckDesignLoadKg;
    const deckOverloadKg = car.deckOverloadKg;
    let massKg = fromMassKg;
    let deckMassKg = fromDeckMassKg;
    let count = 0;
    for (const passenger of floor.waiting(direction)) {
      if (massKg >= designLoadKg) break;
      if (deckDesignLoadKg !== undefined && deckMassKg >= deckDesignLoadKg) break;
      if (!this.#carCanCarry(car, passenger)) continue;
      if (!this.#promiseAllows(car, passenger, at)) continue;
      if (massKg + passenger.massKg >= overloadKg) continue;
      if (deckOverloadKg !== undefined && deckMassKg + passenger.massKg >= deckOverloadKg) continue;
      massKg += passenger.massKg;
      deckMassKg += passenger.massKg;
      count += 1;
    }
    return { count, massKg, deckMassKg };
  }

  /**
   * Settle up after the doors shut.
   *
   * A call is **completed** only when the landing has no eligible passenger left for that bank.
   * If anybody is left — the car filled up — the call is surrendered instead and re-offered to
   * the group, which is the whole of "the overflow waits and is served later rather than
   * vanishing".
   *
   * Both directions are reconsidered, not only the calls this car was allocated, because a stop
   * can empty a queue this car was never sent for: an idle car with its doors open takes
   * whoever is there, and the call another car is still driving towards has to go out.
   */
  #finishStop(car: Car, at: SimTime): void {
    const stop = this.#stops.get(car.id);
    this.#stops.delete(car.id);
    if (stop === undefined) return;

    const bank = this.#building.bankById(car.bankId);
    /* c8 ignore next -- every car belongs to a bank of this building. */
    if (bank === undefined) return;
    const dirty = new Set<string>();

    // Every bank that opens onto this floor, not only this car's. A shared lobby is shared:
    // this car can have emptied a queue another bank still has a car driving towards, and
    // leaving that call lit sends it on a trip to collect nobody.
    //
    // **And every floor this stop opened onto**, not only the car's position: a double-deck
    // shuttle that emptied floor 27 with its upper deck must extinguish 27's button, or the
    // landing stays lit for a queue that is no longer there. Exactly one floor for a
    // single-deck car.
    const servedFloorIds = car.floorIdsServedHere();
    for (const floorId of servedFloorIds) {
      for (const other of this.#building.banksServing(floorId)) {
        for (const active of this.#callsAt(other.id, floorId)) {
          if (this.#eligibleWaiting(other, active).count === 0) {
            this.#completeCall(active, at);
            // The car that was driving there has just been freed; its group may have somewhere
            // better to send it.
            if (active.carIds.length > 0 || other.id === bank.id) dirty.add(other.id);
            continue;
          }
          // Somebody is still standing there. If this car was the one sent for them and could
          // not take them all, the allocation is discharged and the remainder goes back to the
          // group — the overflow case, and the reason a full car cannot delete a queue.
          if (other.id !== bank.id || !active.carIds.includes(car.id)) continue;
          this.#reofferCall(car, active, at);
          dirty.add(other.id);
        }
      }
    }

    for (const floorId of servedFloorIds) {
      this.#syncButton(floorId, 'up');
      this.#syncButton(floorId, 'down');
    }

    // Stage 5's load edge. A stop is the only thing in this simulation that changes a car's load,
    // so this is where a crossing can be observed, and it is before `#stepCar` sends the car on:
    // the whole mechanism is that a car which has just filled up gives up the landings it can no
    // longer serve *before* it drives past them.
    if (this.#reassignOnLoad(bank, at)) dirty.add(bank.id);

    for (const bankId of dirty) this.#dispatchBank(bankId, at);
  }

  /**
   * Send a car to `floorId`, unless it could not get there before the deadline.
   *
   * ## The gate is on the **arrival**, and it used to be on the command (GitHub issue #305)
   *
   * `SIM_DEFAULTS.drainGraceS` states the contract this enforces: the drain tail is a **hard
   * timeout**, and *"work scheduled past it is not scheduled at all — not a departure, not a
   * dispatch retry, not a sky-lobby transfer, and not a door transition"*. Every sibling gate in
   * this file reads that the same way — {@link #scheduleTransfer} and
   * {@link #scheduleOpeningTransport} price the walk and refuse the whole hop, {@link #armPatience}
   * prices the wait, {@link #scheduleDoor} prices the transition — because the instant that
   * matters is the one an **event lands on the queue**, not the one a decision is taken at.
   *
   * This gate did not. It compared `at` — the instant the car is *commanded* — against the
   * deadline, and then scheduled `motion.arrivesAt` unconditionally, so a car commanded at
   * t = deadline − 1 with a thirty-second flight put a `sim.carArrived` on the queue thirty
   * seconds past the run's own hard deadline. `runUntilEmpty` drains whatever is on the queue,
   * so that arrival **fired**: it completed the move, took a travel sample past the run's end,
   * and stepped the car — which can register a landing, price a bank and assign a car, all after
   * the run had declared itself over. Measured on shipped buildings rather than inferred: at
   * `vertical-city`/`collective`, 600 s of demand and a 60 s tail, **fourteen** travel samples
   * landed past the deadline and the last was **37.9 s** past it.
   *
   * It was usually invisible, which is why it survived: `endedAt` is
   * `max(recorder.lastEventAt, demand horizon)` and `MetricsRecorder.sampleTravel` deliberately
   * does not advance `lastEventAt`, so a late arrival that only moved a car left `endedAt`
   * untouched. It shows in `endedAt` only when the late arrival *also* does something the
   * recorder observes — which is exactly what `fuzz-1000130` caught, a run reporting
   * `endedAt = 3493.78` against its own deadline of 3493.
   *
   * The check is **strictly stronger than the one it replaces**, not a relocation of it:
   * `arrivesAt = at + motorStartDelayS + profile.duration + levelingSettleS` and every term is
   * non-negative with `profile.duration > 0`, so `at > deadlineS` implies
   * `arrivesAt > deadlineS` and every departure the old gate refused this one refuses too.
   *
   * The arrival instant comes from {@link Car.plannedDepartureFor}, which is `departFor` without
   * the writes, so the instant checked here is the instant the kernel is then handed. Deriving it
   * from `buildProfile` and the spec would be a second authority on when a car arrives, and this
   * defect is what one of those looks like after it drifts.
   *
   * A car that is refused is left standing, and that is the same shape as every sibling: the
   * transfer that is refused leaves its passenger on the landing, the door transition that is
   * refused leaves the door where it is. Nothing is half-committed — `plannedDepartureFor` writes
   * nothing — so `Car.departures` still counts exactly the moves the run commanded, which is what
   * `benchmark/energyLiveness.test.ts` pairs one-to-one against the travel samples.
   */
  #depart(car: Car, floorId: string, at: SimTime): void {
    if (!car.shaft.floorsById.has(floorId)) return;
    // A double-deck car drives between stop positions, so "go to 27" is "go to 26 and open the
    // upper deck onto 27" — and a car already at 26 has nowhere to go. Normalizing *before* the
    // already-there test is what keeps 26→27 from being commanded as a 4.5 m move that the
    // hardware cannot make. Identity for every single-deck car.
    const target = car.stopFloorFor(floorId);
    if (!car.canStart || car.floorId === target) return;

    const planned = car.plannedDepartureFor(target, at);
    if (planned.arrivesAt > this.#deadlineS) {
      this.#deadlineTruncations += 1;
      return;
    }

    const motion = car.departFor(target, at);
    this.#scheduleArrival(car, motion.arrivesAt);
  }

  /**
   * Hold the one arrival this car's current run will produce.
   *
   * Kept on {@link #carArrivals} rather than fired and forgotten, because a diverted run's old
   * arrival must be *cancelled* — the kernel's `cancel` preserves the cancelled slot's
   * `(time, sequence)` position, so a run that diverts fires every surviving event in exactly
   * the order a run that never scheduled it would (invariant 4). Letting the stale arrival
   * fire and no-op would have been the cheaper fix and the wrong one: it would leave a
   * phantom event in `eventCount()` and make the event budget depend on how often cars
   * diverted.
   *
   * ## Why there is no deadline gate here, stated because there used to be no gate anywhere
   *
   * Both callers are already inside the deadline, for two different reasons, and GitHub issue
   * #305 was one of them not being true. {@link #depart} now prices the arrival before it
   * commits, so what reaches here is an instant it has already accepted. {@link #considerDiversion}
   * cannot break that: a diversion keeps `motion.startedAt` and shortens the profile to a floor
   * strictly short of the one the car was already going to, so `diverted.arrivesAt` is strictly
   * *earlier* than the arrival this car already had — and that one was gated. A gate here would
   * therefore be a second authority that never fires, and the way to keep this honest is to keep
   * the two callers honest rather than to add a third check that hides which of them slipped.
   */
  #scheduleArrival(car: Car, arrivesAt: SimTime): void {
    this.#carArrivals.set(
      car.id,
      this.#kernel.schedule(
        arrivesAt,
        carArrivedEvent({ carId: car.id }, (payload, context) => {
          const arriving = this.#carsById.get(payload.carId);
          /* c8 ignore next -- arrivals are only scheduled for cars in this building. */
          if (arriving === undefined) return;
          this.#carArrivals.delete(payload.carId);
          // **The energy axis's integration seam.** This is the only place in the shipped path
          // where a completed move is observable — `completeArrival` clears `#motion` — and it is
          // therefore the only place a per-move travel sample can be taken. Every car move goes
          // through `#depart`, including stage 7's repositioning, which is the whole point: an
          // energy proxy reconstructed from passenger records would be blind to the empty-car
          // driving that pre-positioning does. `benchmark/energyLiveness.test.ts` counts the
          // samples against the fleet's own odometers rather than trusting this comment.
          // A diverted run arrives **once**, at the floor it was cut short at, so the sample is
          // the distance actually driven and the odometer check still balances.
          this.#recorder.sampleTravel(
            context.time,
            arriving.id,
            arriving.completeArrival(context.time),
          );
          this.#stepCar(arriving, context.time);
        }),
      ),
    );
  }

  /**
   * Cut a moving car's run short at the nearest committed stop it has not yet driven past.
   *
   * This is the other half of `eligibility.enRouteDiversion`, and the half without which the
   * first is a lie. `assessDirectionReversal` judges a car from its commit point under that
   * setting; if the kernel could not then *deliver* a stop at the commit point, eligibility
   * would be admitting stops the physics refuses — the precise disagreement
   * `terms/directionReversal.ts` warns about, and worse than the behaviour it replaces,
   * because a call would be assigned to a car that sails past it and has to come back.
   *
   * Only committed stops, and only ones already ahead of the commit point. The car is never
   * sent somewhere it was not going anyway; a diversion shortens a run, it does not invent
   * one. So the route order is unchanged, `#settleDirection` still sees the same remaining
   * work, and a car that diverts serves strictly more of its own commitments per pass.
   *
   * Inert under every profile that leaves the setting off, which is every profile measured
   * before it existed.
   */
  #considerDiversion(car: Car, at: SimTime): void {
    if (!car.isMoving) return;
    const policy = this.#policies.get(car.bankId);
    if (policy === undefined || !policy.config.eligibility.enRouteDiversion) return;

    const frontier = car.divertFrontier(at);
    if (frontier === undefined) return;
    const motion = car.snapshot(at).motion;
    /* c8 ignore next -- `car.isMoving` is exactly "this car has a motion". */
    if (motion === undefined) return;
    const sign = motion.direction === 'up' ? 1 : -1;

    let best: CommittedStop | undefined;
    for (const stop of car.committedStops()) {
      // Reachable: at or beyond the last floor the car can still decelerate into, and short of
      // where it is already going.
      if (sign * (stop.floorIndex - frontier.index) < 0) continue;
      if (sign * (stop.floorIndex - motion.toFloorIndex) >= 0) continue;
      if (best === undefined || sign * (stop.floorIndex - best.floorIndex) < 0) best = stop;
    }
    if (best === undefined) return;

    const pending = this.#carArrivals.get(car.id);
    if (pending !== undefined) this.#kernel.cancel(pending);
    this.#carArrivals.delete(car.id);
    const diverted = car.divertTo(best.floorId, at);
    this.#diversions += 1;
    this.#scheduleArrival(car, diverted.arrivesAt);
  }

  /**
   * Stage 7. Where an idle car waits.
   *
   * Suppressed once demand has stopped: a park during the drain tail cannot improve any
   * statistic — there are no future calls left to answer sooner — and it would put empty cars
   * on the move for as long as the deadline allows.
   *
   * ## The context is the bank's, not the car's
   *
   * This used to pass `{ entranceFloorIds }` and nothing else, and the two strategies that need
   * more were dead in consequence: `predicted-demand` answered `no-forecast` for every car of every
   * run — 500 of 500 paired differences of exactly zero against `stay` on Garden Apartments — and
   * `zone-center` gave every car in a bank the same shaft median, which `zoning.ts` calls worse
   * than not parking.
   *
   * Now the whole bank is resolved once through `resolvePrepositionContext` — the partition from
   * `contiguousZones`, the forecast from this bank's arrival model — and each car's
   * `RepositionContext` is a view onto it. One forecast per bank per instant, never one per car:
   * two cars placed against two different futures is a bug that presents as unstable parking.
   * {@link BankDemandForecast} is what makes "once" true across the several `#park` calls one
   * instant produces.
   */
  #park(car: Car, at: SimTime): void {
    if (at > this.#trace.durationS) return;
    // Parking is stage 7, and stage 7 is the *group controller* placing its fleet. A car the
    // group may not allocate to is not the group's to place: a recalled or out-of-service car
    // driving itself to a lobby because a parking strategy said so is the controller operating
    // hardware that has been taken away from it. Inert on every shipped run — every car of every
    // building in `data/buildings` is `in-service` throughout — so no parking-strategy
    // measurement in `seam.test.ts` or `searchSpaceLiveness.test.ts` moves.
    if (!car.acceptsHallCalls) return;
    const policy = this.#policies.get(car.bankId);
    const bank = this.#building.bankById(car.bankId);
    /* c8 ignore next -- every car's bank has a policy. */
    if (policy === undefined || bank === undefined) return;

    const forecast = this.#predictors.get(bank.id);
    const resolved = resolvePrepositionContext(this.#snapshots(bank, at), at, {
      entranceFloorIds: this.#entranceFloorIds,
      ...(forecast === undefined ? {} : { predictor: forecast }),
    });

    const me = car.snapshot(at);
    /*
     * The intervention seam. `#idleOverrideAt` answers from the run's log and this instant alone,
     * and with no entry in force it answers `undefined` — in which case the context below is the
     * very object `repositionContextFor` built, not a spread copy of it, so a run with no
     * interventions parks on exactly the objects it always did.
     */
    const override = this.#idleOverrideAt(at, policy.config.idle);
    const base = repositionContextFor(me, resolved);
    const decision = policy.reposition(
      me,
      at,
      override === undefined ? base : { ...base, idleOverride: override },
    );
    if (!decision.move || decision.targetFloorId === undefined) return;
    this.#depart(car, decision.targetFloorId, at);
  }

  /** The next floor on the car's projected route that is not the one it is standing on. */
  #nextStopFloorId(car: Car, at: SimTime): string | undefined {
    for (const stop of car.route(at)) {
      if (stop.floorId !== car.floorId) return stop.floorId;
    }
    return undefined;
  }

  /* ---------------------------------------------------------------- *
   * Sky-lobby transfers
   * ---------------------------------------------------------------- */

  #scheduleTransfer(passenger: Passenger, at: SimTime): void {
    // A change of lift made on the building's escalator costs the escalator's declared
    // landing-to-landing time **instead of** the sky-lobby walk, not on top of it: both numbers
    // are door-to-door times for the same movement, and charging both would double it.
    const hop = this.#transportHopAfter(passenger);
    const arrivedAt = at + (hop?.traversalTimeS ?? this.#options.transferWalkS);
    if (arrivedAt > this.#deadlineS) {
      this.#deadlineTruncations += 1;
      return;
    }

    this.#kernel.schedule(
      arrivedAt,
      transferArrivalEvent({ fromLegId: passenger.id }, (payload, context) => {
        this.#onTransfer(payload.fromLegId, context.time);
      }),
    );
  }

  /**
   * Re-inject a journey at the sky lobby it just reached.
   *
   * The next leg is materialized **here**, at the instant the walk finishes, rather than at the
   * moment of alighting: its `arrivedAt` is when it really started waiting, so the second leg's
   * waiting time is its own. `PassengerFactory.transfer` carries the `journeyId` and
   * `journeyStartedAt` across, which is what makes time-to-destination span both legs, and it
   * refuses a floor that is not a declared sky lobby.
   */
  #onTransfer(fromLegId: string, at: SimTime): void {
    const previous = this.#legs.get(fromLegId);
    /* c8 ignore next 5 -- transfers are only scheduled for legs this run created. */
    if (previous === undefined) {
      throw new SimulationError(
        `Transfer scheduled for leg "${fromLegId}", which this run never created.`,
      );
    }
    const record = this.#recordsByJourney.get(previous.journeyId);
    if (record === undefined) {
      throw new SimulationError(
        `Leg "${fromLegId}" belongs to journey "${previous.journeyId}", which the trace does not declare.`,
      );
    }
    const planned = record.legs[previous.legIndex + 1];
    if (planned === undefined) {
      throw new SimulationError(
        `Leg "${fromLegId}" is leg ${previous.legIndex} of a ${record.legs.length}-leg journey and has no successor, but it alighted short of "${record.finalDestinationFloorId}".`,
      );
    }
    // Without a hop the next leg boards where this one alighted. With one, it boards at the far
    // end of the declared connection — and the hop itself must start where the passenger is.
    const hop = this.#transportHopAfter(previous);
    if (hop !== undefined && hop.originFloorId !== previous.destinationFloorId) {
      throw new SimulationError(
        `Journey "${previous.journeyId}" alighted at "${previous.destinationFloorId}" but its next transport hop "${hop.modeId}" starts at "${hop.originFloorId}".`,
      );
    }
    const boardsAt = hop?.destinationFloorId ?? previous.destinationFloorId;
    if (planned.originFloorId !== boardsAt) {
      throw new SimulationError(
        `Journey "${previous.journeyId}" alighted at "${previous.destinationFloorId}" but its next planned leg starts at "${planned.originFloorId}".`,
      );
    }

    // The egress hop belongs to whichever leg is last, and that is this one exactly when the
    // leg being created is the highest-indexed planned leg.
    const egressTransitS =
      previous.legIndex + 2 === record.legs.length ? egressTransitSecondsOf(record) : 0;
    const next = this.#factory.transfer(previous, {
      destinationFloorId: planned.destinationFloorId,
      arrivedAt: at,
      ...(hop === undefined ? {} : { originFloorId: hop.destinationFloorId }),
      ...(egressTransitS === 0 ? {} : { egressTransitS }),
    });
    this.#transfers += 1;
    if (hop !== undefined) this.#transportHops += 1;
    this.#admit(next);

    const floor = this.#building.requireFloor(next.originFloorId);
    for (const bankId of this.#openCalls(floor, at)) this.#dispatchBank(bankId, at);
  }

  /**
   * The declared non-lift hop, if any, between the leg `passenger` is on and the next one.
   *
   * `undefined` for every leg of every building that declares no `transportModes` — the trace
   * omits the field entirely there — so this returns without touching a map on the shipped path.
   */
  #transportHopAfter(passenger: Passenger): TraceTransportHop | undefined {
    const record = this.#recordsByJourney.get(passenger.journeyId);
    if (record?.transportHops === undefined) return undefined;
    return transportHopBefore(record, passenger.legIndex + 1);
  }

  /* ---------------------------------------------------------------- *
   * Small queries
   * ---------------------------------------------------------------- */

  /**
   * The call as a value, carrying the credential of whoever is at the head of the queue.
   *
   * The credential is on the call because the runner honestly knows it — somebody is standing
   * at that landing — and `DispatchCall.credentialGroup` is the field for exactly that. Whether
   * the policy is *allowed* to use it is `dispatch.callType`'s decision, not the runner's:
   * `costRequestFor` forwards it only under `mobile-credential` and drops it under
   * `up-down-buttons`, so a conventional run cannot accidentally benefit from information the
   * passenger never gave it.
   *
   * **This paragraph used to end by saying conventional dispatch cannot serve an
   * access-controlled building at any budget, because every car answers `accessDenied`. That was
   * true of the code and false of the world, and § D254 removed the cause.** The credential was
   * being checked against the *pickup* floor, which is not a question a lift is asked; with it
   * asked about the destination instead, `collective` delivers 725 of 725 on
   * `mixed-use-high-rise` where it previously delivered 642. What the credential still buys is
   * real and much smaller — see § D256 for the measured figure — and it is no longer the
   * difference between operable and inoperable.
   *
   * **The surviving claim is about authorization, and it is the only one the measurements support.** This
   * docstring used to say the credential makes access control *cheaper* because authorization and
   * optimization happen in the same step; measured at n = 150 per building under CRN, the
   * destination's contribution to optimization is **smaller** on the access-controlled building
   * than on the unzoned one, so the difference-of-differences refutes the mechanism rather than
   * confirming it (DECISIONS.md § D30, § D60). The saving is real and it is entirely in the
   * credential.
   *
   * The **destination is on the call for exactly the same reason**, and gated the same way. The
   * runner knows where the head of the queue is going — it generated them — and
   * `DispatchCall.destinationFloorId` is the field for it. `costRequestFor` forwards it only under
   * `destination-entry` and `mobile-credential` and drops it under `up-down-buttons`, so a
   * conventional run cannot accidentally price a journey nobody declared, and no shipped profile's
   * behaviour changes by one bit. What it does change is that `rideTime` — a term that returns 0
   * whenever the destination is unknown, and whose `activeWhen` says so — can now be non-zero
   * *through the run loop* rather than only through a hand-built call, which is the difference
   * between a term that is live and a term that merely could be.
   *
   * This is not destination dispatch: the passenger model, the landing panel and the "which car do
   * I walk to" constraint are Phase 6. It is the same honest disclosure the credential already
   * gets, one field earlier than the profile may be allowed to read it.
   *
   * The **head** of the queue rather than a set: a landing call is one button, pressed by one
   * person, and the head is the one who pressed it first. FIFO makes that deterministic.
   */
  #callValue(
    id: string,
    floor: Floor,
    direction: Direction,
    registeredAt: SimTime,
    bank: Bank<Car>,
    forDestinationFloorId?: string | undefined,
  ): DispatchCall & HallCall {
    let credentialGroup: string | undefined;
    let destinationFloorId: string | undefined;
    for (const passenger of floor.waiting(direction)) {
      if (
        forDestinationFloorId !== undefined &&
        passenger.destinationFloorId !== forDestinationFloorId
      ) {
        continue;
      }
      if (!this.#bankCanCarry(bank, passenger)) continue;
      credentialGroup = passenger.credentialGroup;
      destinationFloorId = passenger.destinationFloorId;
      break;
    }
    return Object.freeze({
      id,
      floorId: floor.id,
      floorIndex: floor.index,
      direction,
      registeredAt,
      ...(credentialGroup === undefined ? {} : { credentialGroup }),
      ...(destinationFloorId === undefined ? {} : { destinationFloorId }),
      // The panel authorized this request (DECISIONS.md § D30), and says so.
      //
      // `#bankCanCarry` — the predicate every passenger above has just passed — *is* the access
      // check, run against the building's own zoning with the passenger's real credential. So by
      // the time a call value exists under a panel, authorization has already happened at the
      // kiosk, and forwarding that verdict is what stops `estimateCost` asking a second time
      // whether an **unbadged** passenger may reach a zoned floor. Unasked, that question made a
      // bare `destination-entry` arm unable to serve `secure-tower` at all — worse than
      // conventional, not better (100 % unserved against 33.5 %: `benchmark/accessControl.ts`
      // H-ACCESS-1, seed 20 260 726, n = 30, re-run after § T50-D1, which is where "at all"
      // stopped being a figure of speech).
      //
      // There is deliberately **no rejection branch** here. A passenger the panel would refuse
      // cannot reach this code: `#openCalls` throws for anybody no bank serving the floor can
      // carry, and the trace's route planner never generates one. Building a "rejected at the
      // panel" accounting path that nothing in this simulator can reach would be a ninth dead
      // seam, which is the defect this phase is most at risk of shipping.
      ...(this.#panelAssigns ? { panelAuthorized: true } : {}),
    });
  }

  #policy(bankId: string): DispatchPolicy {
    const policy = this.#policies.get(bankId);
    /* c8 ignore next 3 -- every bank gets a policy in the constructor. */
    if (policy === undefined) {
      throw new SimulationError(`Bank "${bankId}" has no group controller.`);
    }
    return policy;
  }

  /**
   * The bank's cars as the group controller sees them, at one instant.
   *
   * The single place `enRouteDiversion` enters the model. Every snapshot the dispatcher ever
   * scores comes from here, so gating the commit point on the resolved profile here is what
   * makes eligibility, every cost term and `projectRoute` agree without any of them reading a
   * configuration: under a profile that leaves the setting off, `divertFrontierIndex` is
   * simply absent and all three fall back to "a moving car is committed to its destination".
   */
  #snapshots(bank: Bank<Car>, at: SimTime): readonly CarSnapshot[] {
    const enRouteDiversion =
      this.#policies.get(bank.id)?.config.eligibility.enRouteDiversion ?? false;
    return bank.cars.map((car) => car.snapshot(at, { enRouteDiversion }));
  }

  /**
   * Stage 3's group facts for one bank at one instant: the operational partition and the forecast.
   *
   * The two things a cost term cannot own. `zoneAffinity` prices a car's deviation from its
   * operational zone, and `predictedDemand` prices where a route ends against where demand is
   * expected; both read the fact off the observation, because a term is a pure function and cannot
   * hold a learned model or a partition (CLAUDE.md invariant 1). Absent, both are correctly zero —
   * and were zero in every run this project has ever measured, which made a `zoneAffinity` weight
   * decoration and a `predictedDemand` weight a paid-for dimension that could not move an argmin.
   *
   * The partition is `contiguousZones` over the cars supplied, keyed on car id, so it is stable for
   * the run. The forecast is this bank's own model, taken once — `groupContext` calls
   * `expectedDemandByFloor(at)` and {@link BankDemandForecast} answers from cache when it can.
   */
  #groupContext(
    bankId: string,
    snapshots: readonly CarSnapshot[],
    at: SimTime,
  ): GroupObservationContext {
    const forecast = this.#predictors.get(bankId);
    return groupContext(snapshots, at, {
      ...(forecast === undefined ? {} : { predictor: forecast }),
      // The third group fact, and the one a car snapshot cannot carry: which floors are
      // entrances. `dispatch/selector.ts`'s traffic detector separates a lobby arrival from an
      // interfloor one, and a shaft knows its served floors without knowing which of them people
      // walk in at — on `midtown-office` the `main` bank's lowest served floor is the garage.
      // Resolved once for the run in the constructor, so this costs a property read per pass.
      entranceFloorIndices: this.#entranceFloorIndices,
      // The fourth group fact — the run's start-of-day, for the Everyday rules' time
      // conditions. Spread-if-defined so a clockless template's context carries no key at all.
      ...(this.#startOfDayS === undefined ? {} : { startOfDayS: this.#startOfDayS }),
    });
  }

  /**
   * **Stage 5, triggered by the load sensor.** A car that has just crossed its own hall-call bypass
   * threshold hands the calls it holds back to the group.
   *
   * docs/06 § Stage 5 states the mechanism exactly — *"when a car crosses its load threshold, its
   * uncommitted calls migrate"* — and docs/01 § *Why not pure agent-per-elevator* names it as the
   * second of the three reasons a pure agent model fails. Until now `simulation.ts` contained no
   * `reconsider` call site at all, so it had never run on a building.
   *
   * Called from {@link #finishStop}: doors shut, the load is settled, and the car has not yet been
   * given its next instruction. That ordering is the whole point — a call handed on *after* the car
   * has departed for the landing it can no longer serve is a second car sent to the same floor.
   *
   * **Every gate is the policy's.** `reassignmentPolicy`, `commitmentPoint`,
   * `reassignmentHysteresisS` and `maxReassignmentsPerCall` are checked inside
   * `policy.reconsider`; re-checking any of them here would be a latch implemented twice. Under the
   * default `reassignmentPolicy: never` every call comes back `retained`, so a profile that has not
   * opted into stage 5 is bit-identical to one run without this call — which is what makes the
   * mechanism's value measurable against its own absence rather than confounded with it.
   *
   * Each call is re-priced against the **live** landing count and this bank's group context, not
   * against the count its lifecycle accumulated: the queue is what it is now, and the car that
   * should take it is the one that is best now.
   *
   * @returns whether any call actually left a car, so the caller can re-run the bank.
   */
  #reassignOnLoad(bank: Bank<Car>, at: SimTime): boolean {
    const monitor = this.#capacityMonitors.get(bank.id);
    const policy = this.#policies.get(bank.id);
    /* c8 ignore next -- every bank gets both in the constructor. */
    if (monitor === undefined || policy === undefined) return false;

    const snapshots = this.#snapshots(bank, at);
    const group = this.#groupContext(bank.id, snapshots, at);
    const contextFor: CallContextSource = (lifecycle) => {
      const active = this.#activeCalls.get(lifecycle.callId);
      if (active === undefined) return group;
      const waiting = this.#eligibleWaiting(bank, active);
      return withLandingCounts(group, waiting.count, waiting.massKg);
    };

    const result = monitor.run(policy, snapshots, at, contextFor);
    this.#capacityCrossings += result.crossings.length;
    this.#capacityMigrations += result.migrated.length;
    this.#capacityHeld += result.held.length;
    if (result.migrated.length === 0) return false;

    // Only the migrations are applied. A `held` entry is a call the policy left exactly where it
    // was, and pushing its car list back through `#applyDecision` would be a release and an
    // immediate re-assign of the same commitment — a no-op that resets nothing but is one more way
    // for the runner's record and the policy's to drift apart.
    for (const migration of result.migrated) {
      const active = this.#activeCalls.get(migration.callId);
      if (active === undefined) continue;
      this.#applyDecision(active, { carIds: migration.toCarIds }, at);
    }
    return true;
  }

  /**
   * Whether this bank still has any business with this passenger.
   *
   * `#bankCanCarry` asks whether the fabric and the credential allow it. This adds the one thing
   * a promise changes: **once the panel has named a car, the request belongs to that car's
   * bank**, and every other bank's call for it is finished.
   *
   * Without this clause a landing served by two banks livelocks under a panel, and the shape is
   * worth naming because it is not obvious. Bank 1 opens the request, wins it, and promises
   * car X. Bank 2 opened the same request and still counts the passenger as waiting, so it sends
   * one of its own cars — which arrives, may not board anybody (the boarding predicate is per
   * car and refuses it), surrenders the call as "nobody would move", and is sent straight back.
   * Secure Tower's screened lobby, both of Mixed-Use High-Rise's shared floors and all eight of
   * Vertical City's are multi-bank, so this is a shipped configuration and not a hypothetical.
   */
  #bankMayServe(bank: Bank<Car>, passenger: Passenger): boolean {
    if (!this.#bankCanCarry(bank, passenger)) return false;
    if (!this.#panelAssigns) return true;
    const assignedCarId = passenger.assignedCarId;
    if (assignedCarId === undefined) return true;
    return this.#carsById.get(assignedCarId)?.bankId === bank.id;
  }

  /**
   * Service zoning, access zoning and **deck coupling**, all three checked, none merged.
   *
   * The deck clause is the bank-level twin of {@link #deckAllows}, and it is not a tidy
   * duplicate — it is load-bearing, and its absence was a defect. {@link #eligibleWaiting} runs
   * this predicate to decide whether a landing call is **finished**, and {@link #finishStop}
   * completes the call only when it answers `0`. Without the clause, a `G → 2` leg left standing
   * at the lobby keeps the shuttle's call at G alive forever: every car refuses it at
   * {@link #carCanCarry}, the call is re-offered, and the bank is sent back to a landing it can
   * never clear. The bank has to know what its cars know.
   *
   * **This is `Bank`'s deck index's first non-test caller.** `isDoubleDeck`, `deckAssignmentFor`
   * and `deckAt` were built, indexed and unit-tested when the bank was written and every
   * reference to them outside `model/bank.ts` was a test or a barrel re-export — the eleventh
   * instance of this repository's signature defect (`docs/07` § 3), and one of the two halves
   * this lane closes. The other half is the shaft's copy, which is what a `Car` reads.
   */
  #bankCanCarry(bank: Bank<Car>, passenger: Passenger): boolean {
    return (
      bank.servesFloor(passenger.destinationFloorId) &&
      this.#building.isAccessPermitted(passenger.credentialGroup, passenger.destinationFloorId) &&
      this.#bankDecksAllow(bank, passenger) &&
      this.#kioskAllows(passenger)
    );
  }

  /**
   * **The bare kiosk's own refusal, and it is not one of the three zonings.**
   *
   * A fourth question, kept fourth: service zoning is the fabric, access zoning is the credential,
   * deck coupling is the hardware — and this is the **interface**. Under
   * `dispatch.callType: 'destination-entry'` with no panel the passenger types a destination into
   * a kiosk that has nothing to identify them with, so the group is asked *"may an unbadged
   * passenger reach floor 27?"* and answers `destinationAccessDenied` for every car. That refusal
   * is the configuration's whole measured cost (DECISIONS.md § D30's premise, and
   * `benchmark/accessControl.ts`'s `BARE_KIOSK_ARM`), and it is preserved here rather than
   * removed.
   *
   * What it stops being is **collateral**. Before § T50-D1 the refusal was expressed only through
   * the call value: `#callValue` took the head of the landing queue, disclosed their restricted
   * destination, and the whole call died — so everybody standing behind them died with it,
   * including passengers whose journey touches no access zone at all. Asking the question per
   * passenger, here, is what separates the two: the refused passenger is refused, and the queue
   * behind them is collected.
   *
   * **Asked at the landing and at the doorway both**, because the alternative is worse than
   * either answer. `#bankCanCarry` stops them heading a call; `#carCanCarry` stops them boarding
   * the car the group sent for somebody else. Refusing at dispatch and admitting at the doorway
   * would make the refusal a matter of **luck** — you travel if and only if a queue-mate happens
   * to be bound somewhere unrestricted — which is an artefact of queue composition and not a
   * system anybody could build. A kiosk that would not send you a car has not authorized your
   * trip.
   *
   * The question is a fact about **the pair (call type, floor)**: no dispatch decision, score or
   * car state can produce it or change it, which is what keeps it from being a general
   * re-eligibility mechanism (the ground § T22-D1 argues from). `false` for every shipped
   * profile — all twelve run at `up-down-buttons` or `mobile-credential` — so no shipped
   * configuration's eligibility set moves.
   *
   * The refused passenger is neither dropped nor carried: they stay on the landing, are named in
   * {@link SimulationResult.undelivered} as `waiting`, and are counted in
   * {@link StageActivity.kioskRefusedLegs}. `#openCalls` exempts them from its routing-failure
   * throw for the same reason — the trace planned a route the building can fly; the interface
   * refused it.
   */
  #kioskAllows(passenger: Passenger): boolean {
    if (!this.#kioskWithoutCredential) return true;
    // The question `infeasibilityOf` step 4 will ask, asked with the credential the call will
    // actually carry — which under this configuration is none.
    if (this.#building.isAccessPermitted(undefined, passenger.destinationFloorId)) return true;
    this.#kioskRefusedLegs.add(passenger.id);
    return false;
  }

  /**
   * Whether a bank's coupled decks can carry a leg at all — origin and destination on one deck.
   *
   * A floor the bank pairs with nothing (or does not serve) has no deck assignment, and a leg
   * that touches one is not constrained: `undefined` from {@link Bank.deckAssignmentFor} means
   * *the car as a whole serves it*, which either deck does. Trivially `true` for every
   * single-deck bank, so no conventional building's eligibility set moves.
   */
  #bankDecksAllow(bank: Bank<Car>, passenger: Passenger): boolean {
    if (!bank.isDoubleDeck) return true;
    const origin = bank.deckAssignmentFor(passenger.originFloorId);
    if (origin === undefined) return true;
    const destinationDeck = bank.deckAt(passenger.destinationFloorId);
    return destinationDeck === undefined || destinationDeck === origin.deck;
  }

  /**
   * Service **mode**, service zoning and access zoning, all three checked, none merged.
   *
   * The mode clause is the one that is not obvious, and it is load-bearing rather than tidy.
   * Every landing boarding in this module goes through {@link #boardFrom}, and `Car.board`
   * registers the passenger's destination as a car call — which `Car.registerCarCall` **refuses**
   * for a mode that does not honour car calls, by throwing a `ModelError` that `run()` propagates
   * unchanged. So without this clause, the first out-of-service car standing at an occupied
   * landing crashes the run.
   *
   * It was unreachable until `CarConfig.mode` and `BuildingConfig.serviceEvents` made a
   * not-in-service car authorable: the only previous way to produce one was to proxy the
   * *dispatcher's view* of the cars (`experiments/validation/serviceMode.ts`), which leaves the
   * physical car in service, so `#loadWhileIdle` went on boarding from it quite legally. That is
   * why the adversarial campaign correctly asserts allocations rather than boardings — its cars
   * really were in service — and why this clause changes nothing about that run, or about any
   * run of any shipped building, all of whose cars are `in-service` for their whole duration.
   *
   * `acceptsHallCalls` and not `acceptsCarCalls` is deliberate: this predicate answers *"may this
   * car take somebody who is standing at a landing"*, and the answer for `independent` is no. An
   * attendant-operated car honours the buttons pressed inside it — which is what
   * `acceptsCarCalls` is for, and which `Car` still allows — but it is not under group control
   * and does not collect a landing queue. {@link #park} is gated on the same predicate for the
   * same reason.
   */
  #carCanCarry(car: Car, passenger: Passenger): boolean {
    return (
      car.acceptsHallCalls &&
      car.shaft.floorsById.has(passenger.destinationFloorId) &&
      isAccessPermitted(car.shaft, passenger.credentialGroup, passenger.destinationFloorId) &&
      this.#deckAllows(car, passenger) &&
      this.#kioskAllows(passenger)
    );
  }

  /**
   * **The deck binds the passenger.** A leg whose origin and destination sit on *different*
   * decks of the same double-deck bank cannot be ridden: the decks are rigidly coupled, so
   * somebody who boarded the lower deck at 26 is at 51 when the upper deck is at 52, and there
   * is no moment in the run at which they could step across.
   *
   * The model **refuses the leg rather than teleporting the passenger**, which is the honest of
   * the two readings — the alternative, letting them alight on the other deck's floor, would
   * silently make a physically impossible journey and flatter every time-to-destination
   * statistic on the building. The refusal is a car predicate, so the passenger stays on the
   * landing for a bank that *can* carry them.
   *
   * **It was expected to be unreachable, turned out not to be, and is now unreachable again from
   * shipped data — for a reason worth stating rather than deleting.** `traffic/route.ts`'s
   * `legDestinations` restricts a *shuttle* leg boarded on a lower-deck floor to lower-deck
   * floors, so no route ever puts a cross-deck leg **on this bank**. But a leg is not bound to a
   * bank — `route.ts` says so deliberately, because "recording a bank here would freeze a dispatch
   * decision into the passenger trace" — so the shuttle is still *offered* every queue at every
   * floor it opens onto. On `vertical-city` that used to be 270 `G → 2` legs and 22 `2 → G` legs:
   * one floor apart, planned on `zone-1-local` or `zone-2-local`, and impossible on a double-deck
   * car because **G and 2 are the same stop position** — the passenger would have to change decks
   * without the car moving. Measured at seed 20 260 726, `eta`: **200 distinct legs refused**,
   * conservation `balanced: true`, and none of the 83 undelivered journeys on a shuttle floor.
   *
   * `vertical-city` now declares an escalator between `G` and `2`, so **those legs no longer
   * exist and this refusal fires 0 times on every shipped building** at that same seed and
   * profile. The guard is kept, because it is the difference between refusing an impossible move
   * and teleporting a passenger, and `config/doubleDeck.test.ts` exercises it against the same
   * building with its `transportModes` stripped — the configuration every `vertical-city` figure
   * published before that declaration was measured under. A branch nothing shipped can reach is
   * only safe while something still reaches it on purpose.
   */
  #deckAllows(car: Car, passenger: Passenger): boolean {
    if (!car.isDoubleDeck) return true;
    if (car.deckFor(passenger.originFloorId) === car.deckFor(passenger.destinationFloorId)) {
      return true;
    }
    this.#deckMismatchLegs.add(passenger.id);
    return false;
  }

  /**
   * Who this call is still for: the landing queue, filtered to the bank and — under a panel — to
   * the call's own destination.
   *
   * The destination filter is what stops one OD request being completed by a car that emptied a
   * *different* OD request at the same landing, and what stops its waiting count including people
   * it was never opened for. Conventionally `destinationFloorId` is `undefined` and the filter is
   * not applied at all, so this is byte-for-byte the query it has always been.
   */
  #eligibleWaiting(bank: Bank<Car>, active: ActiveCall): WaitingTally {
    const floor = this.#building.requireFloor(active.floorId);
    let count = 0;
    let massKg = 0;
    for (const passenger of this.#waitingForCall(floor, active)) {
      if (!this.#bankMayServe(bank, passenger)) continue;
      count += 1;
      massKg += passenger.massKg;
    }
    return { count, massKg };
  }

  /** The landing queue this call was opened over, before any bank or car predicate. */
  #waitingForCall(floor: Floor, active: ActiveCall): readonly Passenger[] {
    const waiting = floor.waiting(active.direction);
    const destinationFloorId = active.destinationFloorId;
    if (destinationFloorId === undefined) return waiting;
    return waiting.filter((passenger) => passenger.destinationFloorId === destinationFloorId);
  }

  /**
   * The cars this call may still be given to — **the write-once promise, enforced**.
   *
   * DECISIONS.md § D29 says a bumped passenger keeps their assignment and waits for the car they
   * were told about. `#reofferCall` puts a still-occupied landing back out to the group, and
   * three separate paths reach it; patching one of them would leave the other two re-offering a
   * promised passenger to whichever car happens to score best, which is the panel silently
   * changing its mind. So the override is applied where *every* re-offer is eventually decided —
   * the candidate set stage 4 is allowed to choose from — rather than at any one call site.
   *
   * The effect is that a decision for a call whose remaining passengers are already promised can
   * only ever return the promised car. If that car is full, no car is eligible, the call is
   * retried on the ordinary timer, and the passengers wait. That waiting *is* destination
   * dispatch's cost, and `ConservationAudit.brokenPromises` counts how often it is paid.
   *
   * Returns the full snapshot list conventionally, and whenever nobody at the landing has been
   * promised anything yet — which is every call at the moment it opens.
   *
   * ## **"Remaining passengers" means all of them, and it used to mean any of them**
   *
   * The restriction used to fire as soon as *one* waiter held a promise, which pinned the whole
   * landing — for the rest of the run, because a call is only extinguished when its landing empties
   * and `reassignmentPolicy: 'never'` will not revisit an allocation in between. A rider who walked
   * up to a busy panel two hours later **inherited other people's pin**: measured on Vertical City,
   * 81 riders at the median promised to one car holding 13 to 20 while four of its seven siblings
   * stood idle and empty.
   *
   * That is not what § D29 says and it is not what T16-D3 was enforcing. D29's argument is about
   * the passenger the panel has **already answered** — they keep the car they were told, because
   * re-offering them is the panel changing its mind, and a destination arm that changes its mind
   * quietly recovers the deferral advantage it is supposed to have surrendered. It says nothing
   * about somebody the panel has not spoken to yet. Their call is a fresh allocation problem and
   * belongs to the whole bank.
   *
   * So the restriction now asks whether **every** waiter this bank could carry is already promised.
   * If one is not, the group scores the landing over its whole fleet; {@link #applyDecision} keeps
   * the promised car on the call regardless of what the group picks, so nobody's promise becomes a
   * car that is no longer coming, and {@link #tellThePanel} skips the promised as it always has.
   * Every existing promise is preserved and `brokenPromises` still counts every bump.
   */
  #candidateCars(
    active: ActiveCall,
    snapshots: readonly CarSnapshot[],
  ): readonly CarSnapshot[] {
    if (!this.#panelAssigns) return snapshots;
    const floor = this.#building.requireFloor(active.floorId);
    const bank = this.#building.bankById(active.bankId);
    /* c8 ignore next -- every active call belongs to a bank of this building. */
    if (bank === undefined) return snapshots;
    const promised = new Set<string>();
    for (const passenger of this.#waitingForCall(floor, active)) {
      const carId = passenger.assignedCarId;
      // Somebody this bank could carry and has told nothing. The landing is not settled, and the
      // decision that settles it is the whole group's — the same predicate `#tellThePanel` uses to
      // decide whom it may answer, asked here about whether anybody is still owed an answer.
      if (carId === undefined) {
        if (this.#bankCanCarry(bank, passenger)) return snapshots;
        continue;
      }
      promised.add(carId);
    }
    if (promised.size === 0) return snapshots;
    const restricted = snapshots.filter((snapshot) => promised.has(snapshot.carId));
    /* c8 ignore next 4 -- `#bankMayServe` drops a passenger promised outside this bank from the
       call's own waiting set, so a call that reaches a decision at all has every promise inside
       the bank being decided. The fallback is a guard against that invariant, not a path: an
       empty candidate list would report the call unservable rather than pending. */
    return restricted.length === 0 ? snapshots : restricted;
  }

  /**
   * Every live call one bank has at one floor.
   *
   * Two direct lookups conventionally, because the identity is `(bank, floor, direction)` and
   * there are exactly two directions — the same two the caller used to write out. Under a panel
   * the identity carries a destination and the set is not enumerable in advance, so it is found
   * by scan. **The conventional path is kept as a lookup rather than folded into the scan** so
   * that turning the panel on is the only thing that changes the cost of a stop, and every
   * conventional run's event count is unchanged.
   *
   * Live calls are extinguished the moment their landing empties, so the scanned set is the
   * occupied landings of one bank, not the building's floor count.
   */
  #callsAt(bankId: string, floorId: string): readonly ActiveCall[] {
    if (!this.#panelAssigns) {
      const found: ActiveCall[] = [];
      for (const direction of DIRECTIONS) {
        const active = this.#activeCalls.get(callIdOf(bankId, floorId, direction));
        if (active !== undefined) found.push(active);
      }
      return found;
    }
    const found: ActiveCall[] = [];
    for (const active of this.#activeCalls.values()) {
      if (active.bankId === bankId && active.floorId === floorId) found.push(active);
    }
    return found;
  }

  /** The landing light goes out when the landing is empty, and not before. */
  #syncButton(floorId: string, direction: Direction): void {
    const floor = this.#building.requireFloor(floorId);
    if (!floor.hasWaiting(direction)) floor.clearHallCall(direction);
  }

  #waitingCount(): number {
    let waiting = 0;
    for (const floor of this.#building.floors) waiting += floor.queueLength();
    return waiting;
  }

  /* ---------------------------------------------------------------- *
   * Closing the books
   * ---------------------------------------------------------------- */

  #finish(endReason: RunEndReason): SimulationResult {
    this.#diagnoseStuckCalls();
    this.#disclosePopulationChange();

    const demandEndedAt = this.#trace.durationS;
    const endedAt = Math.max(this.#recorder.lastEventAt, demandEndedAt);
    if (this.#options.queueSampleCount > 0) {
      this.#recorder.sampleQueue(endedAt, this.#waitingCount());
    }
    const bareRecord: RunRecord = this.#recorder.finish(endedAt);

    const summary: RunSummary = summarizeRun(bareRecord, {
      ...(this.#summarizeOptions ?? {}),
      ...(this.#windowSelection === undefined ? {} : { window: this.#windowSelection }),
      terminalFloorIds:
        this.#summarizeOptions?.terminalFloorIds ??
        (this.#entranceFloorIds.length > 0 ? this.#entranceFloorIds : undefined),
    });

    const { audit, undelivered, problems } = this.#reconcile(bareRecord);

    /*
     * Warnings are final only here — `#diagnoseStuckCalls` and `#reconcile` both raise them —
     * so the record is completed after the audit rather than by the recorder. The recorder has
     * no view of them and should not grow one: it records what the run *did*, and these are
     * what the run has to *say* about the configuration it did it under.
     *
     * Disclaimers first, then advisories; see `#disclaimers`. The key is omitted entirely when
     * there is nothing to say, so a quiet run's record is byte-identical to one written before
     * this field existed. Everything a summary or the audit reads was computed above from the
     * same data, so attaching this cannot change either.
     */
    const warnings = Object.freeze([...this.#disclaimers, ...this.#warnings]);
    const record: RunRecord =
      warnings.length === 0 ? bareRecord : Object.freeze({ ...bareRecord, warnings });
    // Three outcomes, not two. A run that hit the event valve is not a saturated building and
    // must not be filed as one: `timed-out` is a statement about the *configuration* — demand
    // the group could not clear inside the drain tail — while `aborted` is a statement about
    // this module.
    const status: SimulationStatus =
      endReason === 'event-budget'
        ? 'aborted'
        : undelivered.length === 0
          ? 'completed'
          : 'timed-out';

    const result: SimulationResult = Object.freeze({
      status,
      runId: this.#runId,
      seed: record.seed,
      /*
       * Read off the record, exactly as `seed` is, rather than re-derived from the streams and the
       * config. The record is what is persisted and what invariant 5 lives on; a result that
       * computed the same two fields a second way could disagree with the thing a replay reads,
       * and the disagreement would be invisible in memory and fatal on disk.
       *
       * Spread-or-omit rather than `trafficSeed: x ?? undefined`: under `exactOptionalPropertyTypes`
       * those are different types, and more importantly they are different *claims*. An absent key
       * says the run had no traffic seed; a present `undefined` says it had one that is missing.
       * The record omits each on its own boundary — see `MetricsRecorder.finish` — and this
       * inherits both.
       */
      ...(record.trafficSeed === undefined ? {} : { trafficSeed: record.trafficSeed }),
      ...(record.trafficModel === undefined ? {} : { trafficModel: record.trafficModel }),
      buildingId: this.#resolved.id,
      dispatcherProfileId: this.#profileId,
      trace: this.#trace,
      record,
      summary,
      reportWindow: summary.window,
      conservation: audit,
      undelivered: Object.freeze(undelivered),
      demandEndedAt,
      endedAt,
      deadlineS: this.#deadlineS,
      events: this.#kernel.processedCount(),
      warnings,
      stageActivity: this.stageActivity,
      comparability: comparabilityOf(this.#passengerModel),
    });

    // Reported **before** the audit, and unconditionally — not under `onTimeout`. That option
    // says what to do with a run whose *demand* outlasted its drain tail, which is a legitimate
    // measurement; it says nothing about a run that stopped because a handler would not stop
    // scheduling work, whose every statistic describes a simulation that never finished. The
    // audit is reported second because an aborted run fails it for an uninteresting reason:
    // batches still queued when the valve tripped never materialized a leg, and naming those
    // would bury the cause under its symptom.
    if (status === 'aborted') {
      throw new SimulationError(
        `Run "${this.#runId}" was aborted: the event budget (sim.maxEvents=${this.#options.maxEvents}) was exhausted at t=${this.#kernel.now()}s, with the queue still non-empty and ${undelivered.length} of ${audit.generated} journeys in the system. Its drain deadline was t=${this.#deadlineS}s. This is a handler that is not making progress, not a saturated building: raising sim.drainGraceS or lowering demand will not fix it, and the summary attached to this error describes a run that stopped in the middle.${problems.length === 0 ? '' : ` The conservation audit reports ${problems.length} problem${problems.length === 1 ? '' : 's'} as a consequence, beginning: ${problems[0] ?? ''}.`}`,
        result,
      );
    }
    if (problems.length > 0) {
      throw new SimulationError(
        `Run "${this.#runId}" failed its conservation audit (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n  - ${problems.slice(0, 10).join('\n  - ')}`,
        result,
      );
    }
    if (status === 'timed-out' && this.#options.onTimeout === 'throw') {
      throw new SimulationError(
        `Run "${this.#runId}" did not deliver everybody: ${undelivered.length} of ${audit.generated} journeys were still in the system when the run stopped at t=${endedAt}s. ${this.#timeoutDiagnosis(endedAt)} This is a failed run, not a slow one — pass onTimeout: 'report' to inspect it.`,
        result,
      );
    }
    return result;
  }

  /**
   * **Say, in the record, that this run's per-leg figures describe a different population.**
   *
   * A disclaimer rather than an advisory, and by `#disclaimers`' own test: it does not qualify a
   * number, it says the *model* is not what a reader would assume. Both behaviours below remove
   * people from the lift system, so AWT, WT95, TTD, the served-leg count and the over-horizon
   * count are all taken over a smaller cohort than `generated` — and abandonment improves every
   * one of them **by construction**, because the riders it removes are the ones who waited
   * longest. That is `DECISIONS.md` § D106's rule (*a configuration that spends less by serving
   * fewer people has not saved anything*) on two more axes.
   *
   * ## Why it is here and not only on the summary
   *
   * `RunSummary.abandonment` and `ConservationAudit.abandoned` are the figures, and a consumer
   * that reads them is fine. The disclaimer exists for the consumers that do **not** yet:
   * `viz/src/record/recordRun.ts` copies `generated`/`delivered`/`undelivered` into `VizSummary`
   * and carries neither new term, and `viz/src/shift/goals.ts` reads
   * `serviceLevel.overHorizonCount` — which abandonment improves by construction, since a rider
   * who left cannot wait past the horizon. Warnings travel with the record
   * (`RunRecord.warnings`), are ordered disclaimers-first, and every consumer that truncates has
   * to keep them, so this reaches those surfaces without this lane guessing at a schema it does
   * not own. **It is a stopgap that names a gap, not a substitute for projecting the figures.**
   *
   * Silent on every run that declares neither behaviour, which is every run this repository has
   * published — so no pinned record acquires a key or a line.
   */
  #disclosePopulationChange(): void {
    const abandoned = this.#abandonedLegs.size;
    if (abandoned > 0) {
      this.#disclaimers.push(
        `${abandoned} leg(s) were abandoned: their rider's declared patience (sim.patience) ran out and they left the landing, so they are neither delivered nor waiting. Every per-leg figure this run reports — AWT, WT95, time to destination, the served-leg count and serviceLevel.overHorizonCount — is taken over the riders who stayed, and abandonment improves all of them by construction because the waits it removes are the longest ones. Read summary.abandonment beside the mean (DECISIONS.md § D106's rule, one axis over), and note that a comparison against a run with different abandonment compares different populations.`,
      );
    }
    if (this.#stairsTaken.size > 0) {
      this.#disclaimers.push(
        `${this.#stairsTaken.size} journey(s) took a declared stairs mode and never entered the lift system, so they appear in conservation.delivered and in no wait, ride or time-to-destination figure at all. The served-leg count is correspondingly lower; read conservation.stairsJourneys and stairsTransitS beside it, and treat any comparison against a run with different stair uptake as a comparison of different populations (docs/14 § 3.3).`,
      );
    }
  }

  /**
   * Why a `timed-out` run stopped, stated from what actually happened rather than assumed.
   *
   * A genuine drain timeout has refused to schedule something because of the deadline. A run
   * that simply ran out of scheduled work while people were still standing at landings is a
   * different failure with a different remedy, and telling its owner to raise `drainGraceS`
   * would send them to look at a knob that had nothing to do with it.
   *
   * **It did exactly that, and the counter is the reason.** The test used to be
   * `#deadlineTruncations > 0 || now >= deadline`, and `#deadlineTruncations` counts *dispatch
   * retry ticks* as well as work: a bank with no in-service car spins one retry per
   * `dispatchRetryS`, the last of which falls past the deadline, so a run with **nobody to carry
   * anybody** reported *"the drain deadline cut 1 pieces of work: raise sim.drainGraceS"* — for a
   * run whose last recorded event was 3 600 s before that deadline. Measured refutation, on
   * `garden-apartments` and `midtown-office` with every car withdrawn: re-running at
   * `drainGraceS: 36000` leaves the result bit-identical, delivered still 0.
   *
   * So the question is asked of the clock the run publishes: did this run **reach** its deadline?
   * `endedAt` is `max(lastEventAt, demand horizon)` and the deadline is the horizon plus the
   * grace, so `endedAt >= deadlineS` is true exactly of a run the deadline stopped and false of one
   * that ran out of work first. The truncation counter is still reported — it is a fact — but it
   * no longer *decides*, and the quiet case says out loud that a non-zero count of it is not
   * evidence for the knob.
   *
   * @param endedAt the instant the run reports having stopped, from {@link #finish}.
   */
  #timeoutDiagnosis(endedAt: SimTime): string {
    if (endedAt >= this.#deadlineS) {
      return `The drain deadline (t=${this.#deadlineS}s = end of demand + sim.drainGraceS) stopped this run at t=${endedAt}s and cut ${this.#deadlineTruncations} pieces of work: raise sim.drainGraceS or lower demand.`;
    }
    const cut =
      this.#deadlineTruncations === 0
        ? 'nothing was truncated'
        : `the ${this.#deadlineTruncations} truncation(s) counted are dispatch retries that fell past it, not work that would have carried anybody`;
    return `The event queue emptied at t=${endedAt}s, ${this.#deadlineS - endedAt}s short of the drain deadline (t=${this.#deadlineS}s) and without it ever biting, so ${cut} — the run simply stopped scheduling work while people were still waiting. Check result.warnings for the calls and the banks involved; raising sim.drainGraceS cannot help, and re-running with a larger one returns the same figures.`;
  }

  /**
   * Name every landing that still had people on it when the run stopped, and why.
   *
   * Two shapes, both of which otherwise present as "the run was a bit slow":
   *
   * - **Structurally unservable** — every car in the bank refused the call for a reason that
   *   cannot change with time. Overwhelmingly an access-restricted pickup floor under
   *   `up-down-buttons`; see {@link markUnservable}.
   * - **Repeatedly refused** — the call was assignable, was assigned, and the car it was
   *   assigned to declined it at stage 6 again and again. Sometimes that is honest overflow
   *   with nowhere else to send it (a bank of one car); sometimes it is stages 2 and 6
   *   disagreeing about who may serve the landing. Either way, without naming it the run
   *   reports `timed-out` with no diagnosis at all, which is how a liveness hole reads as a
   *   slow building. The threshold is set so ordinary saturation on a shipped building stays
   *   quiet: four cars refusing a call a few times each is overflow, and the undelivered list
   *   already says so.
   *
   * Only calls that were *still* occupied at the end are reported: a landing freed by a car
   * that happened to pass and load it is not a problem, and saying so would be a lie.
   */
  #diagnoseStuckCalls(): void {
    /*
     * **A bank with nobody to send, said first, because it explains everything below it.**
     *
     * Every other line in this method describes a call that some car refused. A bank whose whole
     * fleet is out of group control refuses nothing — no car is priced, no verdict is recorded,
     * `#unservable` and `#refusals` stay empty — so the run used to reach the end with a status of
     * `timed-out`, nobody delivered, and **not one warning**. That is the shape a player is most
     * likely to produce on purpose (withdraw the cars and watch) and the one the product said
     * least about.
     *
     * Reported whether or not service came back, with the window, because a bank that was dead for
     * twenty minutes explains a run's waits even after a car returns. `Car.acceptsHallCalls` is the
     * predicate, so `out-of-service`, `independent` and `fire-recall` all count — none of the three
     * collects a landing queue.
     */
    for (const [bankId, seen] of this.#banksWithoutService) {
      const bank = this.#building.bankById(bankId);
      const fleet = bank === undefined ? 0 : bank.cars.length;
      const back = bank?.cars.some((car) => car.acceptsHallCalls) ?? false;
      this.#warnings.push(
        `bank "${bankId}" was asked to collect a landing while not one of its ${fleet} car(s) was in group control — every one was out of service, on independent operation or recalled — first at t=${seen.from.toFixed(1)}s, last at t=${seen.until.toFixed(1)}s, with up to ${seen.peakWaiting} rider(s) eligible and waiting at a single call. No car was priced and no call was refused, so nothing else in this run names the cause. ${back ? 'Service returned to the bank before the run ended.' : 'No car in this bank was back in group control when the run ended, so every landing it serves stayed uncollected.'} This is a fleet that cannot answer, not a dispatcher setting: no weight, no reassignment policy and no drain grace reaches it.`,
      );
    }

    // The bare kiosk's refusals, said out loud once. A landing that was collected around them
    // reports nothing else at all — the call completed — so without this line the only trace of
    // a turned-away passenger is a row in `undelivered` that looks like ordinary overflow.
    if (this.#kioskRefusedLegs.size > 0) {
      this.#warnings.push(
        `${String(this.#kioskRefusedLegs.size)} leg(s) were refused by the destination kiosk: dispatch.callType "destination-entry" discloses a destination and carries no credential, so an access-restricted destination is infeasible for every car in the building and no car is ever sent for it. Those legs are named in undelivered and are the measured cost of a kiosk that does not authorize (DECISIONS.md § D30, § T50-D1); passengers behind them in the same landing queue are collected normally. A credential-aware call type ("mobile-credential") or a landing panel serves them.`,
      );
    }

    /*
     * The credential gap's own refusals, said out loud once, in the run's own words (§ D266).
     *
     * The same argument the kiosk line above rests on, one cause over: nothing else in the run
     * mentions these people. They never opened a call, so no landing looks odd; the queue behind
     * them was collected normally; and the only other trace of them is a count in
     * `conservation.accessRefused` that a reader has to already be looking for.
     */
    if (this.#accessRefusedLegs.size > 0) {
      this.#warnings.push(
        `${String(this.#accessRefusedLegs.size)} leg(s) were turned away for want of a credential: the rider reached the landing and their credential does not permit the floor they were going to, so no car in the building may legally carry them and none was sent. They are counted in conservation.accessRefused and in stageActivity.accessRefusedLegs, and they are neither delivered nor waiting — read the count beside the mean, because every per-leg figure this run reports is taken over the riders who could travel and a building that refuses more people reports a shorter wait for exactly that reason (DECISIONS.md § D106's rule, one axis over; § D265, § D266). No dispatcher setting reaches this: the fix is a credential, or the building's access zoning.`,
      );
    }

    for (const [callId, reasons] of this.#unservable) {
      const active = this.#activeCalls.get(callId);
      if (active === undefined) continue;
      const bank = this.#building.bankById(active.bankId);
      if (bank === undefined || this.#eligibleWaiting(bank, active).count === 0) continue;
      this.#warnings.push(
        `call "${callId}" at floor "${active.floorId}" going ${active.direction} was never collected: every car in bank "${active.bankId}" refused it for a structural reason (${reasons}). Under dispatch.callType "up-down-buttons" a landing call carries no credential, so an access-restricted pickup floor is infeasible for the whole bank.`,
      );
    }

    for (const [callId, byCar] of this.#refusals) {
      const active = this.#activeCalls.get(callId);
      if (active === undefined || this.#unservable.has(callId)) continue;
      const bank = this.#building.bankById(active.bankId);
      if (bank === undefined) continue;
      const waiting = this.#eligibleWaiting(bank, active);
      if (waiting.count === 0) continue;

      for (const [carId, tally] of byCar) {
        if (tally.count < REFUSAL_WARNING_THRESHOLD) continue;
        this.#warnings.push(
          `call "${callId}" at floor "${active.floorId}" going ${active.direction} was refused ${tally.count} times by car "${carId}" (${[...tally.reasons].sort().join(', ')}) and still had ${waiting.count} waiting when the run stopped. Either the group had nowhere else to send it — a bank of one car, or every car full — or stage 2 and stage 6 disagree about which car may serve that landing.`,
        );
      }
    }
  }

  /**
   * Reconcile the generated trace against what actually happened.
   *
   * Three separate claims, each of which a plausible bug would break in a way no statistic
   * would reveal:
   *
   * 1. **Every journey is delivered or named.** Anyone missing is a passenger the simulation
   *    deleted, and the passengers a bug deletes are systematically the ones who waited
   *    longest, so the AWT *improves* as the bug worsens.
   * 2. **Every leg went where the route planner said it would**, and the journey ended at the
   *    destination the trace declared. `Car.alight` already refuses the wrong floor, so this
   *    catches the subtler version: the right floor on a leg the journey never planned.
   * 3. **Every materialized leg reached the recorder.** A leg that exists in the model but not
   *    in the record is invisible to every metric while still looking delivered here.
   */
  #reconcile(runRecord: RunRecord): {
    audit: ConservationAudit;
    undelivered: UndeliveredJourney[];
    problems: string[];
  } {
    const problems: string[] = [];
    const undelivered: UndeliveredJourney[] = [];
    let delivered = 0;
    let abandoned = 0;
    let accessRefused = 0;

    // Which car took each leg, so an undelivered rider can be named with the car it is in.
    const carOfLeg = new Map<string, string>();
    for (const leg of runRecord.passengers) {
      if (leg.carId !== undefined) carOfLeg.set(leg.passengerId, leg.carId);
    }

    for (const record of this.#trace.passengers) {
      /*
       * A journey that walked is **delivered**, and has no leg to check it against. Counted here,
       * before the missing-leg problem below, because "never materialized a leg" is otherwise the
       * exact symptom of the catastrophic failure this audit exists to catch — a passenger who
       * quietly stopped existing. The two are told apart by the run knowing it made the offer.
       */
      if (this.#stairsTaken.has(record.journeyId)) {
        delivered += 1;
        continue;
      }
      const legs = this.#legsByJourney.get(record.journeyId) ?? [];
      if (legs.length === 0) {
        problems.push(
          `journey "${record.journeyId}" (arriving t=${record.arrivalTimeS}s) never materialized a leg`,
        );
        continue;
      }
      if (legs.length > record.legs.length) {
        problems.push(
          `journey "${record.journeyId}" ran ${legs.length} legs but the trace planned ${record.legs.length}`,
        );
      }

      for (const [index, leg] of legs.entries()) {
        const planned = record.legs[index];
        if (planned === undefined) continue;
        if (
          leg.originFloorId !== planned.originFloorId ||
          leg.destinationFloorId !== planned.destinationFloorId
        ) {
          problems.push(
            `journey "${record.journeyId}" leg ${index} ran "${leg.originFloorId}"->"${leg.destinationFloorId}" but the trace planned "${planned.originFloorId}"->"${planned.destinationFloorId}"`,
          );
        }
        if (leg.journeyId !== record.journeyId) {
          problems.push(
            `leg "${leg.id}" carries journey "${leg.journeyId}" but is filed under "${record.journeyId}"`,
          );
        }
      }

      const last = legs[legs.length - 1];
      /* c8 ignore next -- `legs` is non-empty by the guard above. */
      if (last === undefined) continue;

      if (last.hasAlighted && last.isFinalLeg) {
        // The floor the *lifts* were asked to reach. Identical to the journey's declared
        // destination unless the route finishes on a declared escalator or stair, in which case
        // the lifts' job ended one hop short and `egressTransitS` carries the rest.
        const liftTerminus =
          record.legs[record.legs.length - 1]?.destinationFloorId ?? record.finalDestinationFloorId;
        if (last.destinationFloorId !== liftTerminus) {
          problems.push(
            `journey "${record.journeyId}" was delivered to "${last.destinationFloorId}" but its last planned lift leg ends at "${liftTerminus}" (final destination "${record.finalDestinationFloorId}")`,
          );
        } else {
          delivered += 1;
        }
        continue;
      }

      /*
       * **A rider who walked out is a third outcome, not a slow delivery** (docs/14 § 3.1).
       *
       * They are not `undelivered`: that list is *"who is still in the system"*, and it is what
       * decides whether the run reports `timed-out`. Somebody who went home is in no queue and no
       * car, so filing them there would report a run as having failed to drain when it drained
       * perfectly — and would hide the reason it drained, which is that a third of the demand
       * left. They are counted here instead and published as `ConservationAudit.abandoned`,
       * beside the AWT their departure improved.
       */
      if (this.#abandonedLegs.has(last.id)) {
        abandoned += 1;
        continue;
      }

      /*
       * **A rider the readers turned away is a fourth outcome** (§ D266), and it is `undelivered`
       * for the same reason abandonment is not: that list is *"who is still in the system"*, and
       * it decides whether the run reports `timed-out`. Somebody the building would not let
       * travel is in no queue and no car, so filing them there would report a run as having
       * failed to drain when it drained perfectly — and would blame the lifts for a credential.
       */
      if (this.#accessRefusedLegs.has(last.id)) {
        accessRefused += 1;
        continue;
      }

      const reason: UndeliveredReason = last.hasAlighted
        ? 'transferring'
        : last.hasBoarded
          ? 'riding'
          : 'waiting';
      undelivered.push(
        Object.freeze({
          journeyId: record.journeyId,
          legId: last.id,
          legIndex: last.legIndex,
          reason,
          originFloorId: last.originFloorId,
          destinationFloorId: last.destinationFloorId,
          finalDestinationFloorId: last.finalDestinationFloorId,
          journeyStartedAt: last.journeyStartedAt,
          arrivedAt: last.arrivedAt,
          boardedAt: last.boardedAt,
          carId: carOfLeg.get(last.id),
        }),
      );
    }

    const generated = this.#trace.passengerCount;
    const legsCreated = this.#legs.size;
    const legsRecorded = runRecord.passengers.length;
    if (legsCreated !== legsRecorded) {
      problems.push(
        `${legsCreated} legs were created but ${legsRecorded} reached the recorder; the difference is invisible to every metric`,
      );
    }
    if (delivered + undelivered.length + abandoned + accessRefused !== generated) {
      problems.push(
        `${generated} journeys were generated but ${delivered} were delivered, ${undelivered.length} accounted for as undelivered, ${abandoned} as abandoned and ${accessRefused} as refused for want of a credential`,
      );
    }

    /*
     * **Claim 4: nobody got into a car they were not sent to.**
     *
     * The whole of the passenger-model change, stated as a number that must be zero. The defect
     * it catches is the one this phase is most likely to ship: a destination profile that loads,
     * validates, weights `rideTime`, opens one call per origin-destination pair — and then boards
     * people exactly as the conventional model did, because the boarding predicate was never
     * wired. Every aggregate statistic would look plausible; a *count* of wrong-car boardings
     * cannot.
     *
     * Asserted rather than reported, because unlike `brokenPromises` there is no reading of it
     * that is a result.
     */
    if (this.#wrongCarBoardings > 0) {
      problems.push(
        `${this.#wrongCarBoardings} of ${this.#recorder.boardedCount} boardings put a passenger into a car other than the one the landing panel named. Under dispatch.passengerAssignment "panel" the promise is the passenger model; a boarding that ignores it is measuring conventional dispatch under a destination profile's name`,
      );
    }
    /*
     * **Claim 5: under a panel, a run that delivered everybody promised everybody.**
     *
     * Conditioned on the run having completed, and that is not a softening. A `timed-out` run can
     * legitimately end with somebody unassigned — a landing every car refused structurally is
     * never given a car to be promised — and that passenger is already named in `undelivered`
     * with the reason. Requiring the equality unconditionally would replace a precise diagnosis
     * with a conservation failure that says less.
     */
    /*
     * **Claim 6: every promise the runner made reached the record.**
     *
     * The `legsCreated === legsRecorded` argument, applied to the new state. The runner's counter
     * and the recorder's are incremented in the same statement pair and could still drift if a
     * second assignment path appeared, and a promise the record does not carry is invisible to
     * every downstream check of it — including the wrong-car check a reader would run over a
     * stored record rather than over this run.
     */
    if (this.#legsAssigned !== this.#recorder.assignedCount) {
      problems.push(
        `${this.#legsAssigned} landing-panel assignments were made but ${this.#recorder.assignedCount} reached the recorder; a promise the record does not carry cannot be audited from the record`,
      );
    }
    // Both ways a promise can be cleared, summed, because the recorder counts both on one
    // counter: the group revoking it and the rider walking out from under it.
    if (this.#promisesRevoked + this.#promisesAbandoned !== this.#recorder.releasedCount) {
      problems.push(
        `${this.#promisesRevoked} landing-panel promises were revoked and ${this.#promisesAbandoned} voided by abandonment, but ${this.#recorder.releasedCount} releases reached the recorder; a record still naming a car the group took the passenger back off is a promise no reader could audit`,
      );
    }
    /*
     * `legsAssigned` counts promise *events*, so a leg whose promise was revoked when its car left
     * group control and then re-made counts twice. The invariant is on promises **in force**:
     * every revocation is either followed by a fresh promise or leaves that leg unpromised, and a
     * leg that boarded held a promise when it did (`#boardFrom` refuses otherwise), so on a run
     * that delivered everybody `assigned - revoked` is exactly one per leg. Comparing the raw
     * event count instead would fail every run with a mid-run service change in it, which is the
     * shape this arithmetic exists to survive.
     */
    const promisesInForce =
      this.#legsAssigned - this.#promisesRevoked - this.#promisesAbandoned;
    /*
     * **A leg whose rider walked out holds no promise, and never boarded to need one.**
     *
     * `recordAbandonment` clears the assignment — a record that showed a car reserving itself for
     * somebody who had gone home would be a false record — so an abandoned leg is `legsCreated`
     * without being a promise in force, and the identity below has to net it out. Without this
     * term the first destination-dispatch run with `sim.patience` on it would fail its own
     * conservation audit for a reason that is not a defect. Zero on every run that declares no
     * patience, which is every run this repository has published.
     */
    const abandonedLegs = this.#abandonedLegs.size;
    /*
     * **A refused leg is netted out for the same reason, one step earlier** (§ D266). It never
     * reached a landing queue, so no panel ever saw it and no promise could have been made about
     * it — and without this term the first destination-dispatch run on an access-zoned building
     * would fail its own conservation audit for a reason that is not a defect. Zero on every
     * building that declares no `accessZones`.
     */
    const promisableLegs = legsCreated - abandonedLegs - this.#accessRefusedLegs.size;
    if (this.#panelAssigns && undelivered.length === 0 && promisesInForce !== promisableLegs) {
      problems.push(
        `${promisableLegs} legs were created and not abandoned and every journey was delivered, but ${promisesInForce} promises were in force at the end (${this.#legsAssigned} made, ${this.#promisesRevoked} revoked, ${this.#promisesAbandoned} voided by abandonment); ${promisableLegs - promisesInForce} boarded without being promised anything`,
      );
    }

    const audit: ConservationAudit = Object.freeze({
      generated,
      delivered,
      undelivered: undelivered.length,
      legsCreated,
      legsRecorded,
      legsBoarded: this.#recorder.boardedCount,
      legsAlighted: this.#recorder.alightedCount,
      transfers: this.#transfers,
      transportHops: this.#transportHops,
      legsAssigned: this.#legsAssigned,
      wrongCarBoardings: this.#wrongCarBoardings,
      brokenPromises: this.#brokenPromises,
      promisesRevoked: this.#promisesRevoked,
      /*
       * Present when the run modelled patience, absent when it did not — never `0` on a run that
       * never asked the question. A key that appeared on every run would move
       * `structuralDigestOfResult`, which hashes every key whatever its value, and with it every
       * pinned figure (docs/14 § 5 criterion 1). Present and `0` is the different, useful claim:
       * riders *could* have left and none did.
       */
      ...(this.#options.patience === undefined
        ? {}
        : { abandoned, callsWithdrawn: this.#callsWithdrawn }),
      /*
       * Present only when somebody actually walked — absent, not `0`, on every building that
       * declares no stair, so a run that has none carries the audit object it always did.
       *
       * **These are docs/14 § 5 criterion 4's figures for stairs**, and they are on the audit for
       * the same reason `abandoned` is: a stairs rider leaves the lift system, so the served-leg
       * count falls and any comparison across configurations with different uptake compares
       * different populations. Without the count that shortfall reads as a better building.
       */
      ...(this.#stairsTaken.size === 0
        ? {}
        : {
            stairsJourneys: this.#stairsTaken.size,
            stairsTransitS: this.#stairsTransitS,
          }),
      /*
       * Present only when the building actually turned somebody away — absent, not `0`, on every
       * building that declares no `accessZones` and on every run where everybody is correctly
       * badged, so such a run carries the audit object it always did and `structuralDigestOfResult`
       * (which hashes every key whatever its value) is unmoved for it.
       *
       * On the audit for `stairsJourneys`' reason: a refused rider leaves the lift system, so the
       * served-leg count falls and any comparison across configurations with different refusal
       * rates compares different populations. Without the count that shortfall reads as a better
       * building.
       */
      ...(accessRefused === 0 ? {} : { accessRefused }),
      balanced:
        problems.length === 0 &&
        legsCreated === legsRecorded &&
        this.#wrongCarBoardings === 0 &&
        delivered + undelivered.length + abandoned + accessRefused === generated,
    });

    return { audit, undelivered, problems };
  }
}

/* -------------------------------------------------------------------------- *
 * Entry point
 * -------------------------------------------------------------------------- */

/**
 * Run one replication.
 *
 * ```ts
 * const result = runSimulation({
 *   building, dispatcherProfile, trafficProfiles, elevatorSpecs, seed: 20260726,
 * });
 * ```
 *
 * The same `(seed, config)` produces a structurally identical {@link SimulationResult} every
 * time, on every machine — which is what makes a stored record replayable from its seed
 * (invariant 5) and what lets two dispatchers be compared on the identical passenger trace.
 *
 * @throws SimulationError if the conservation audit fails, or if the drain deadline fired with
 *   passengers still in the system and `onTimeout` is left at its default of `throw`.
 */
export function runSimulation(config: SimulationConfig): SimulationResult {
  return new Simulation(config).run();
}

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

function resolveOptions(config: SimulationConfig): ResolvedOptions {
  return Object.freeze({
    transferWalkS: nonNegative(
      config.transferWalkS ?? SIM_DEFAULTS.transferWalkS,
      'transferWalkS',
    ),
    assignedWalkS: nonNegative(
      config.assignedWalkS ?? SIM_DEFAULTS.assignedWalkS,
      'assignedWalkS',
    ),
    dispatchRetryS: positive(config.dispatchRetryS ?? SIM_DEFAULTS.dispatchRetryS, 'dispatchRetryS'),
    drainGraceS: nonNegative(config.drainGraceS ?? SIM_DEFAULTS.drainGraceS, 'drainGraceS'),
    queueSampleCount: nonNegativeInteger(
      config.queueSampleCount ?? SIM_DEFAULTS.queueSampleCount,
      'queueSampleCount',
    ),
    doorObstructionProbability: fraction(
      config.doorObstructionProbability ?? SIM_DEFAULTS.doorObstructionProbability,
      'doorObstructionProbability',
    ),
    maxEvents: positive(config.maxEvents ?? SIM_DEFAULTS.maxEvents, 'maxEvents'),
    onTimeout: config.onTimeout ?? 'throw',
    // Validated here rather than at first use: a mean patience of zero abandons everybody at the
    // instant they arrive, and a run that discovered that a thousand events in would report an
    // AWT over nobody rather than a configuration error.
    patience: config.patience === undefined ? undefined : requireValidPatience(config.patience),
    // Validated by `resolveDoorConfig`, where the bound it has to satisfy lives; passed straight
    // through so the runner has exactly one opinion about it and the door module has the other.
    lobbyCrowding: config.lobbyCrowding,
  });
}

/**
 * The fullest of the landings a stop opens onto — one for a single-deck car, two for a paired
 * double-deck stop.
 *
 * A loop rather than `Math.max(...floors.map(...))` because this runs at **every stop of every
 * run**, including the overwhelming majority that declare no crowding term and never read the
 * result: the spread form allocates an array and an argument list per stop, and it measurably
 * lengthened the identity suite before it was written this way.
 */
function busiestLandingOf(floors: readonly Floor[]): number {
  let busiest = 0;
  for (const floor of floors) {
    const queued = floor.queueLength();
    if (queued > busiest) busiest = queued;
  }
  return busiest;
}

function nonNegative(value: number, id: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new SimulationError(`sim.${id} must be a finite non-negative number; received ${value}.`);
  }
  return value;
}

function positive(value: number, id: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SimulationError(`sim.${id} must be a finite positive number; received ${value}.`);
  }
  return value;
}

function nonNegativeInteger(value: number, id: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new SimulationError(`sim.${id} must be a non-negative integer; received ${value}.`);
  }
  return value;
}

function fraction(value: number, id: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new SimulationError(`sim.${id} must be a probability in [0, 1]; received ${value}.`);
  }
  return value;
}

/** Build the `generateTrace` config, with the three fields the runner owns filled in. */
function traceConfigFor(config: SimulationConfig, streams: StreamSet): TrafficConfig {
  const demand = config.demand ?? {};
  const templateOverrides = {
    ...(config.durationS === undefined ? {} : { durationS: config.durationS }),
    ...(demand.peakWindowS === undefined ? {} : { peakWindowS: demand.peakWindowS }),
    ...(demand.baselineFraction === undefined
      ? {}
      : { baselineFraction: demand.baselineFraction }),
    ...(demand.mixAmplitude === undefined ? {} : { mixAmplitude: demand.mixAmplitude }),
  };

  return {
    building: config.building,
    profiles: config.trafficProfiles,
    streams,
    ...(config.trafficModel === undefined ? {} : { trafficModel: config.trafficModel }),
    ...(config.demandTemplate === undefined ? {} : { template: config.demandTemplate }),
    // `generateTrace` rejects overrides against an already-resolved template, which carries its
    // own geometry; passing an empty record would trip that check for no benefit.
    ...(Object.keys(templateOverrides).length === 0 ? {} : { templateOverrides }),
    // § D285, and carried straight through rather than folded into `templateOverrides`: an override
    // refits the template's geometry and a window leaves it exactly as authored. That is what makes
    // this the answer to the refusal `durationS` gets on a phase list rather than a way round it.
    ...(config.windowStartS === undefined ? {} : { windowStartS: config.windowStartS }),
    ...(config.windowEndS === undefined ? {} : { windowEndS: config.windowEndS }),
    ...(demand.demandLevel === undefined ? {} : { demandLevel: demand.demandLevel }),
    ...(demand.arrivalRatePctPop5min === undefined
      ? {}
      : { arrivalRatePctPop5min: demand.arrivalRatePctPop5min }),
    ...(demand.directionalSplit === undefined
      ? {}
      : { directionalSplit: demand.directionalSplit }),
    ...(demand.batchSharesDestination === undefined
      ? {}
      : { batchSharesDestination: demand.batchSharesDestination }),
    ...(demand.entranceWeights === undefined ? {} : { entranceWeights: demand.entranceWeights }),
    ...(demand.interfloorWeighting === undefined
      ? {}
      : { interfloorWeighting: demand.interfloorWeighting }),
    ...(demand.credentialAssignment === undefined
      ? {}
      : { credentialAssignment: demand.credentialAssignment }),
    // Spread-or-omit for `passengerMass`'s reason: unset means the reference data decides, and a
    // default here would be a second source of truth for a number `data/traffic-profiles.json`
    // already states with its reasoning attached (§ D265).
    ...(demand.credentialGap === undefined ? {} : { credentialGap: demand.credentialGap }),
    ...(demand.maxLegs === undefined ? {} : { maxLegs: demand.maxLegs }),
    // docs/14 §§ 2.1-2.2. Spread-or-omit, never `?? <a default of this file's own>`: unset means
    // the reference data decides, and a default invented here would be a second source of truth
    // for a number `data/traffic-profiles.json` already states.
    ...(demand.batchSize === undefined ? {} : { batchSize: demand.batchSize }),
    ...(demand.passengerMass === undefined ? {} : { passengerMass: demand.passengerMass }),
    // docs/14 § 2.3. Spread-or-omit for the same reason, one step further: a run that declares no
    // day is the run that predates the feature, and the trace it generates must be that object.
    ...(demand.dayVariation === undefined ? {} : { dayVariation: demand.dayVariation }),
  };
}

/** The measurement window the demand template declares, as a `ReportWindow`. */
function traceReportWindow(trace: PassengerTrace): ReportWindow {
  const span = trace.reportWindowEndS - trace.reportWindowStartS;
  return Object.freeze({
    id: span === PEAK_WINDOW_S ? 'peak-5min' : 'report-window',
    startS: trace.reportWindowStartS,
    endS: trace.reportWindowEndS,
  });
}

function requireBank(building: ResolvedBuilding, bankId: string): ResolvedBank {
  const bank = building.banks.find((candidate) => candidate.id === bankId);
  /* c8 ignore next 5 -- the bank id came from this building's own bank list. */
  if (bank === undefined) {
    throw new SimulationError(`Building "${building.id}" declares no bank "${bankId}".`);
  }
  return bank;
}

/**
 * The {@link CarTimings} the achieved interval's departure-clustering threshold is derived from.
 *
 * Assembled off the **runtime cars**, not off the config, so the numbers are the ones the doors
 * and the machine actually ran with — including a `passengerTransferS` a car overrode. Scoped to
 * the cars whose bank serves at least one entrance floor, because those are the cars whose
 * boardings `achievedIntervalOf` groups into departures (`#finish` passes the entrance floors as
 * `terminalFloorIds`).
 *
 * **Worst case in both directions**, per {@link CarTimings}: the largest door, dwell and
 * full-load transfer times, which push the reopen bound *up*; and the shortest first hop flown by
 * the fastest car, which pulls the round-trip bound *down*. Both narrow the bracket, so a
 * threshold that survives is safe for every car in it. Where two banks share a terminal — Secure
 * Tower's low and high zones, Mixed-Use's shuttle and office-local — the worst case is taken
 * across both, which is why a bank whose shuttles hold their doors for 39.8 s can make the whole
 * terminal unmeasurable. That is the correct verdict: those two banks' departures are genuinely
 * not separable in a single boarding series.
 *
 * The hop is measured from **every** entrance floor, not only the lowest. Midtown Office's cars
 * serve a basement entrance 3.5 m below the lobby, and a P1→G→P1 round trip is a real short
 * excursion that a threshold has to stay under.
 *
 * `undefined` when there is nothing to measure: no entrance floor, or no bank that serves an
 * entrance also serving a floor above it.
 */
function terminalCarTimings(
  resolved: ResolvedBuilding,
  building: Building<Car>,
  entranceFloorIds: readonly string[],
): CarTimings | undefined {
  if (entranceFloorIds.length === 0) return undefined;
  const entrances = new Set(entranceFloorIds);

  const heightOf = (floorId: string): number | undefined =>
    resolved.floorsById.get(floorId)?.heightM;

  /** The shortest rise from any served entrance to the next floor above it that the bank serves. */
  const shortestRiseM = (bank: ResolvedBank): number | undefined => {
    const heights = bank.servesFloors
      .map((id) => heightOf(id))
      .filter((height): height is number => height !== undefined)
      .sort((a, b) => a - b);
    let best: number | undefined;
    for (const floorId of bank.servesFloors) {
      if (!entrances.has(floorId)) continue;
      const from = heightOf(floorId);
      if (from === undefined) continue;
      const above = heights.find((height) => height > from);
      if (above === undefined) continue;
      const rise = above - from;
      if (best === undefined || rise < best) best = rise;
    }
    return best;
  };

  let doorOpenS = 0;
  let doorCloseS = 0;
  let dwellHallCallS = 0;
  let dwellCarCallS = 0;
  let fullLoadTransferS = 0;
  let nearestFloorFlightS: number | undefined;
  let motorStartDelayS: number | undefined;
  let levelingSettleS: number | undefined;
  let seen = false;

  for (const bank of resolved.banks) {
    if (!bank.servesFloors.some((floorId) => entrances.has(floorId))) continue;
    const riseM = shortestRiseM(bank);
    for (const car of building.cars) {
      if (car.bankId !== bank.id) continue;
      seen = true;
      doorOpenS = Math.max(doorOpenS, car.doorConfig.openS);
      doorCloseS = Math.max(doorCloseS, car.doorConfig.closeS);
      dwellHallCallS = Math.max(dwellHallCallS, car.doorConfig.dwellHallCallS);
      dwellCarCallS = Math.max(dwellCarCallS, car.doorConfig.dwellCarCallS);
      fullLoadTransferS = Math.max(
        fullLoadTransferS,
        car.spec.designCapacityPersons * car.passengerTransferS,
      );
      motorStartDelayS =
        motorStartDelayS === undefined
          ? car.spec.motorStartDelayS
          : Math.min(motorStartDelayS, car.spec.motorStartDelayS);
      levelingSettleS =
        levelingSettleS === undefined
          ? car.spec.levelingSettleS
          : Math.min(levelingSettleS, car.spec.levelingSettleS);
      if (riseM === undefined) continue;
      // Jerk-limited, never `rise / ratedSpeed`: no car reaches rated speed on a one-floor hop,
      // and using the naive figure would understate the round trip and shrink the bracket from
      // above (CLAUDE.md § Modeling rules).
      const flightS = travelTime(riseM, car.constraints);
      nearestFloorFlightS =
        nearestFloorFlightS === undefined ? flightS : Math.min(nearestFloorFlightS, flightS);
    }
  }

  if (!seen || nearestFloorFlightS === undefined) return undefined;
  return Object.freeze({
    doorOpenS,
    doorCloseS,
    dwellHallCallS,
    dwellCarCallS,
    fullLoadTransferS,
    nearestFloorFlightS,
    ...(motorStartDelayS === undefined ? {} : { motorStartDelayS }),
    ...(levelingSettleS === undefined ? {} : { levelingSettleS }),
  });
}

/**
 * Where a bank's cars stand at t=0.
 *
 * The lowest entrance the bank serves, or its lowest served floor when it serves none — which
 * is the case for every upper-zone local bank in a sky-lobby building, whose "ground" is the
 * sky lobby. Derived from the fabric rather than configured, because a home floor a bank's
 * shaft does not serve is a construction error rather than a tuning choice.
 */
function homeFloorIdFor(building: ResolvedBuilding, bank: ResolvedBank): string {
  let lowest: FloorConfig | undefined;
  let entrance: FloorConfig | undefined;
  for (const floorId of bank.servesFloors) {
    const floor = building.floorsById.get(floorId);
    /* c8 ignore next -- resolveBuilding has already checked every bank's floor list. */
    if (floor === undefined) continue;
    if (lowest === undefined || floor.index < lowest.index) lowest = floor;
    if (floor.isEntrance === true && (entrance === undefined || floor.index < entrance.index)) {
      entrance = floor;
    }
  }
  const home = entrance ?? lowest;
  /* c8 ignore next 5 -- a bank with no floors fails validation long before this. */
  if (home === undefined) {
    throw new SimulationError(`Bank "${bank.id}" serves no floor and its cars have nowhere to be.`);
  }
  return home.id;
}
