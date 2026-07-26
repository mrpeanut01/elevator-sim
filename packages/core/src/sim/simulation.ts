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
 *    "Why calls are per bank" below — and runs the seven-stage lifecycle for that bank.
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
 * ## How nobody gets lost
 *
 * Four mechanisms, in increasing order of how much they are relied on:
 *
 * - **Boarding is a `takeWaiting` with a serve predicate.** A passenger only ever leaves the
 *   landing queue by entering a car whose shaft reaches their destination and whose access
 *   zoning admits their credential. There is no other path out of the queue.
 * - **A hall call is extinguished only when the landing has no eligible passenger left.** A car
 *   that fills up releases the call instead of completing it, and the group re-allocates it —
 *   which is the overflow case, and the reason a full car cannot delete a queue.
 * - **Alighting is `Car.alight`**, which refuses any floor that is not the passenger's
 *   destination. Nobody can be put out in the wrong place.
 * - **The books are reconciled at the end of every run** against the generated trace. A journey
 *   is delivered, or it is named in {@link SimulationResult.undelivered}. Anything else throws.
 */

import { findPassengerTransferS } from '../config/resolveCar.js';
import type {
  DispatcherProfile,
  FloorConfig,
  ResolvedBank,
  ResolvedBuilding,
} from '../config/types.js';
import {
  createDispatchPolicy,
  type DispatchCall,
  type DispatchDecision,
  type WeightedCostDispatchPolicy,
} from '../dispatch/index.js';
import { SimKernel, type SimTime } from '../kernel/index.js';
import { MetricsRecorder } from '../metrics/recorder.js';
import { PEAK_WINDOW_S, departureGapBracket, summarizeRun } from '../metrics/summarize.js';
import { MetricsError } from '../metrics/types.js';
import type { CarTimings, ReportWindow, RunRecord, RunSummary } from '../metrics/types.js';
import {
  CAR_DEFAULTS,
  Car,
  isAccessPermitted,
  shaftForBank,
  type CarSnapshot,
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
import { travelTime } from '../physics/motion/index.js';
import { StreamSet } from '../random/index.js';
import { generateTrace, toPassengerInit } from '../traffic/generator.js';
import type { GeneratedPassenger, PassengerTrace, TrafficConfig } from '../traffic/types.js';

import {
  batchArrivalEvent,
  carArrivedEvent,
  carDoorEvent,
  dispatchTickEvent,
  queueSampleEvent,
  transferArrivalEvent,
} from './events.js';
import {
  SIM_DEFAULTS,
  SimulationError,
  type ConservationAudit,
  type SimulationConfig,
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
  'accessDenied',
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
  /** Set once the doors reach fully open and people have actually moved. */
  transferred: boolean;
}

/** How many are waiting for a call, and what they weigh. */
interface WaitingTally {
  readonly count: number;
  readonly massKg: number;
}

/** Options with every default applied. */
interface ResolvedOptions {
  readonly transferWalkS: number;
  readonly dispatchRetryS: number;
  readonly drainGraceS: number;
  readonly queueSampleCount: number;
  readonly doorObstructionProbability: number;
  readonly maxEvents: number;
  readonly onTimeout: 'throw' | 'report';
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

/** Identity of a `(bank, floor, direction)` allocation unit. */
function callIdOf(bankId: string, floorId: string, direction: Direction): string {
  return `${bankId}#${floorId}:${direction}`;
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
  readonly #runId: string;
  readonly #reportWindow: ReportWindow;
  readonly #summarizeOptions: SimulationConfig['summarize'];
  readonly #windowSelection: SimulationConfig['reportWindow'];
  readonly #entranceFloorIds: readonly string[];
  readonly #deadlineS: SimTime;

  readonly #policies = new Map<string, WeightedCostDispatchPolicy>();
  readonly #carsById = new Map<string, Car>();
  readonly #activeCalls = new Map<string, ActiveCall>();
  /** Every leg ever materialized, by leg id. The denominator of the conservation audit. */
  readonly #legs = new Map<string, Passenger>();
  readonly #legsByJourney = new Map<string, Passenger[]>();
  readonly #recordsByJourney = new Map<string, GeneratedPassenger>();
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

  readonly #warnings: string[] = [];
  #transfers = 0;
  /** How often the drain deadline refused to schedule something. `> 0` means it really bit. */
  #deadlineTruncations = 0;
  #ran = false;

  constructor(config: SimulationConfig) {
    this.#options = resolveOptions(config);
    this.#streams = new StreamSet(config.seed);
    this.#kernel = new SimKernel({ maxEventsPerRun: this.#options.maxEvents });
    this.#resolved = config.building;

    /* ---- the trace, before anything moves (common random numbers) ---- */
    this.#trace = generateTrace(traceConfigFor(config, this.#streams));
    for (const record of this.#trace.passengers) {
      this.#recordsByJourney.set(record.journeyId, record);
    }
    this.#warnings.push(...this.#trace.warnings);

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
        this.#warnings.push(
          `passenger transfer time is undetermined for building "${resolved.id}": ${why}, and car(s) ${unstated.join(', ')} declare none, so they run at the ${CAR_DEFAULTS.passengerTransferS} s default — the office value. Supply elevatorSpecs, or declare passengerTransferS on the car.`,
        );
      }
    }

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
          ...(answer === undefined ? {} : { answer }),
          ...(loadSensorSpec === undefined ? {} : { loadSensorSpec }),
          ...(passengerTransferS === undefined ? {} : { passengerTransferS }),
        });
      },
    });
    for (const car of this.#building.cars) this.#carsById.set(car.id, car);

    /* ---- one group controller per bank (docs/01-architecture.md) ---- */
    for (const bank of this.#building.banks) {
      this.#policies.set(
        bank.id,
        createDispatchPolicy(profile, config.dispatcherOptions ?? {}),
      );
    }

    this.#factory = new PassengerFactory({
      streams: this.#streams,
      massConfig: config.trafficProfiles.passengerMass,
      topology: this.#building,
      // Distinct from the trace's `p...` ids, so a leg id can never collide with a journey's
      // first-leg id and silently overwrite it in the recorder.
      idPrefix: 'leg',
      journeyIdPrefix: 'transfer',
    });

    this.#entranceFloorIds = Object.freeze(this.#building.entranceFloors.map((floor) => floor.id));
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
      seed: this.#streams,
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

  /** The trace this run is driven by. Available before {@link run} for CRN checks. */
  get trace(): PassengerTrace {
    return this.#trace;
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
    this.#building.requireFloor(passenger.originFloorId).addWaiting(passenger);
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
        let count = 0;
        let massKg = 0;
        for (const passenger of waiting) {
          if (!this.#bankCanCarry(bank, passenger)) continue;
          carried.add(passenger.id);
          count += 1;
          massKg += passenger.massKg;
        }
        if (count === 0) continue;

        const id = callIdOf(bank.id, floor.id, direction);
        let active = this.#activeCalls.get(id);
        if (active === undefined) {
          active = {
            id,
            bankId: bank.id,
            floorId: floor.id,
            direction,
            call: this.#callValue(id, floor, direction, at, bank),
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

      for (const passenger of waiting) {
        if (carried.has(passenger.id)) continue;
        throw new SimulationError(
          `Passenger "${passenger.id}" waits at floor "${floor.id}" for "${passenger.destinationFloorId}", which no bank serving that floor can reach for credential "${String(passenger.credentialGroup)}". The trace planned a route no bank can fly; nobody could ever collect them.`,
        );
      }
    }

    return touched;
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
        // One set of snapshots serves every call in the pass, and is dropped the moment an
        // assignment actually moves — a call priced against a car that has since taken on
        // another stop is priced against a car that no longer exists.
        let snapshots: readonly CarSnapshot[] | undefined;
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
          snapshots ??= this.#snapshots(bank, at);
          const decision = policy.dispatch(lifecycle.callId, snapshots, at, {
            waitingPassengers: waiting.count,
            waitingMassKg: waiting.massKg,
          });
          if (this.#applyDecision(active, decision)) snapshots = undefined;
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

        for (const car of bank.cars) this.#stepCar(car, at);

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
   * Move the call onto the cars the decision names, and off the ones it does not.
   *
   * @returns `true` if any car's commitments actually changed.
   */
  #applyDecision(active: ActiveCall, decision: DispatchDecision): boolean {
    const next = decision.carIds;
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
    return changed;
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
   * The overwhelmingly common cause is an **access-restricted pickup floor under
   * `up-down-buttons`**. `Car.estimateCost` applies access zoning to the floor named in the
   * request, and a conventional landing call carries no credential by construction, so every
   * car in the bank reports `accessDenied` and the call is unassignable. On Secure Tower that
   * is every down and interfloor trip from floors 2–30; the same shape appears on Mixed-Use
   * High-Rise and Vertical City.
   *
   * The runner does not paper over it. The passengers stay on the landing, are counted in
   * {@link SimulationResult.undelivered}, the run is reported `timed-out`, and a warning names
   * the call — because a quietly-shortened run of a system that cannot serve a tenth of its
   * traffic is exactly the "confident nonsense" CLAUDE.md exists to prevent. A credential-aware
   * profile (`dispatch.callType: 'mobile-credential'`) serves these landings, which is the
   * documented advantage of moving authorization earlier rather than an accident of this
   * module.
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
   * Two situations reach here, and they are the same situation: a car was sent for a landing
   * and the landing is still occupied afterwards. Either the car filled up and left people
   * behind, or it arrived already bypassing on load and could not open for them at all.
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
    // The person who pressed the button has gone up in the car; the credential on the re-offer
    // is whoever is now at the head of what is left.
    active.call = this.#callValue(
      active.id,
      this.#building.requireFloor(active.floorId),
      active.direction,
      active.call.registeredAt,
      bank,
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
   */
  #loadWhileIdle(car: Car, at: SimTime): boolean {
    const floor = this.#building.requireFloor(car.floorId);
    if (this.#waitingFor(car, floor, 'up') === 0 && this.#waitingFor(car, floor, 'down') === 0) {
      return false;
    }
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
      if (call.floorId !== car.floorId) continue;
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

    let alightingMassKg = 0;
    for (const passenger of alighting) alightingMassKg += passenger.massKg;

    const floor = this.#building.requireFloor(car.floorId);
    const directions = this.#boardingDirections(car, floor, served, at);

    let boarding = 0;
    let projectedMassKg = car.loadSensor.massKg - alightingMassKg;
    for (const direction of directions) {
      const projected = this.#projectedBoarding(car, floor, direction, projectedMassKg);
      boarding += projected.count;
      projectedMassKg = projected.massKg;
    }

    if (alighting.length === 0 && boarding === 0 && !car.hasCarCall(car.floorId)) {
      return 'nobody-would-move';
    }

    car.openDoors(at, {
      carCall: alighting.length > 0 || car.hasCarCall(car.floorId),
      // A landing stop is a landing stop whether or not this car was the one sent for it: the
      // dwell has to cover somebody noticing the car, walking to it and stepping in either way.
      hallCall: served.length > 0 || boarding > 0,
      hallQueueLength: boarding,
      transferSeconds: (alighting.length + boarding) * car.passengerTransferS,
    });
    this.#stops.set(car.id, { alighting, served, directions, transferred: false });
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
    floor: Floor,
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
      // not depend on the order two queues happened to be built in.
      const up = this.#waitingFor(car, floor, 'up');
      const down = this.#waitingFor(car, floor, 'down');
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

  /** How many at this landing, going this way, this car could actually carry. */
  #waitingFor(car: Car, floor: Floor, direction: Direction): number {
    let count = 0;
    for (const passenger of floor.waiting(direction)) {
      if (this.#carCanCarry(car, passenger)) count += 1;
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

    if (car.doorState === 'closed') {
      this.#finishStop(car, at);
      this.#stepCar(car, at);
      return;
    }
    this.#scheduleDoor(car);
  }

  /** Everybody moves at the instant the doors are fully open: out first, then in. */
  #transferAtStop(car: Car, at: SimTime): void {
    const stop = this.#stops.get(car.id);
    if (stop === undefined || stop.transferred) return;
    stop.transferred = true;

    const floor = this.#building.requireFloor(car.floorId);

    for (const passenger of stop.alighting) {
      car.alight(passenger, at);
      this.#recorder.recordAlighting(passenger, at);
      if (!passenger.isFinalLeg) this.#scheduleTransfer(passenger, at);
    }

    for (const direction of stop.directions) {
      this.#boardFrom(car, floor, direction, at);
    }

    // The load cell directly, not a whole `CarSnapshot`: this fires on every stop and the
    // reading is the only field the recorder wants.
    this.#recorder.sampleLoad(at, car.id, car.loadSensor.snapshot());
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
   */
  #boardFrom(car: Car, floor: Floor, direction: Direction, at: SimTime): void {
    const designLoadKg = car.loadSensor.designLoadKg;
    const overloadKg = car.loadSensor.ratedLoadKg * car.loadSensor.overloadThreshold;

    for (;;) {
      if (car.loadSensor.massKg >= designLoadKg) break;
      const massKg = car.loadSensor.massKg;
      const [passenger] = floor.takeWaiting(
        direction,
        1,
        // Service zoning, access zoning, and the safety interlock, in that order. This is the
        // serve predicate `Floor.takeWaiting` exists for: on a floor served by two banks, "who
        // is waiting here" and "who can this car take" are different sets.
        (candidate) =>
          this.#carCanCarry(car, candidate) && massKg + candidate.massKg < overloadKg,
      );
      if (passenger === undefined) break;

      car.board(passenger, at);
      this.#recorder.recordBoarding(passenger, at, { carId: car.id, bankId: car.bankId });
    }
  }

  /**
   * How many this car would take from one queue, computed exactly as {@link #boardFrom} will
   * take them, starting from a load of `fromMassKg`.
   *
   * Threaded rather than recomputed per direction, so a stop that loads two queues does not
   * price both of them against an empty car and grant twice the dwell it needs.
   */
  #projectedBoarding(
    car: Car,
    floor: Floor,
    direction: Direction,
    fromMassKg: number,
  ): { count: number; massKg: number } {
    const designLoadKg = car.loadSensor.designLoadKg;
    let massKg = fromMassKg;
    let count = 0;
    for (const passenger of floor.waiting(direction)) {
      if (massKg >= designLoadKg) break;
      if (!this.#carCanCarry(car, passenger)) continue;
      massKg += passenger.massKg;
      count += 1;
    }
    return { count, massKg };
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
    for (const other of this.#building.banksServing(car.floorId)) {
      for (const direction of DIRECTIONS) {
        const active = this.#activeCalls.get(callIdOf(other.id, car.floorId, direction));
        if (active === undefined) continue;
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

    this.#syncButton(car.floorId, 'up');
    this.#syncButton(car.floorId, 'down');
    for (const bankId of dirty) this.#dispatchBank(bankId, at);
  }

  #depart(car: Car, floorId: string, at: SimTime): void {
    if (at > this.#deadlineS) {
      this.#deadlineTruncations += 1;
      return;
    }
    if (!car.canStart || car.floorId === floorId) return;
    if (!car.shaft.floorsById.has(floorId)) return;

    const motion = car.departFor(floorId, at);
    this.#kernel.schedule(
      motion.arrivesAt,
      carArrivedEvent({ carId: car.id }, (payload, context) => {
        const arriving = this.#carsById.get(payload.carId);
        /* c8 ignore next -- arrivals are only scheduled for cars in this building. */
        if (arriving === undefined) return;
        arriving.completeArrival(context.time);
        this.#stepCar(arriving, context.time);
      }),
    );
  }

  /**
   * Stage 7. Where an idle car waits.
   *
   * Suppressed once demand has stopped: a park during the drain tail cannot improve any
   * statistic — there are no future calls left to answer sooner — and it would put empty cars
   * on the move for as long as the deadline allows.
   */
  #park(car: Car, at: SimTime): void {
    if (at > this.#trace.durationS) return;
    const policy = this.#policies.get(car.bankId);
    /* c8 ignore next -- every car's bank has a policy. */
    if (policy === undefined) return;

    const decision = policy.reposition(car.snapshot(at), at, {
      entranceFloorIds: this.#entranceFloorIds,
    });
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
    const arrivedAt = at + this.#options.transferWalkS;
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
    if (planned.originFloorId !== previous.destinationFloorId) {
      throw new SimulationError(
        `Journey "${previous.journeyId}" alighted at "${previous.destinationFloorId}" but its next planned leg starts at "${planned.originFloorId}".`,
      );
    }

    const next = this.#factory.transfer(previous, {
      destinationFloorId: planned.destinationFloorId,
      arrivedAt: at,
    });
    this.#transfers += 1;
    this.#admit(next);

    const floor = this.#building.requireFloor(next.originFloorId);
    for (const bankId of this.#openCalls(floor, at)) this.#dispatchBank(bankId, at);
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
   * passenger never gave it. Supplying it here is what lets a credential-aware profile
   * demonstrate the result docs/01-architecture.md is after — that access control is cheaper
   * when authorization and optimization happen in the same step.
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
  ): DispatchCall & HallCall {
    let credentialGroup: string | undefined;
    for (const passenger of floor.waiting(direction)) {
      if (!this.#bankCanCarry(bank, passenger)) continue;
      credentialGroup = passenger.credentialGroup;
      break;
    }
    return Object.freeze({
      id,
      floorId: floor.id,
      floorIndex: floor.index,
      direction,
      registeredAt,
      ...(credentialGroup === undefined ? {} : { credentialGroup }),
    });
  }

  #policy(bankId: string): WeightedCostDispatchPolicy {
    const policy = this.#policies.get(bankId);
    /* c8 ignore next 3 -- every bank gets a policy in the constructor. */
    if (policy === undefined) {
      throw new SimulationError(`Bank "${bankId}" has no group controller.`);
    }
    return policy;
  }

  #snapshots(bank: Bank<Car>, at: SimTime): readonly CarSnapshot[] {
    return bank.cars.map((car) => car.snapshot(at));
  }

  /** Service zoning and access zoning, both checked, neither merged into the other. */
  #bankCanCarry(bank: Bank<Car>, passenger: Passenger): boolean {
    return (
      bank.servesFloor(passenger.destinationFloorId) &&
      this.#building.isAccessPermitted(passenger.credentialGroup, passenger.destinationFloorId)
    );
  }

  #carCanCarry(car: Car, passenger: Passenger): boolean {
    return (
      car.shaft.floorsById.has(passenger.destinationFloorId) &&
      isAccessPermitted(car.shaft, passenger.credentialGroup, passenger.destinationFloorId)
    );
  }

  #eligibleWaiting(bank: Bank<Car>, active: ActiveCall): WaitingTally {
    const floor = this.#building.requireFloor(active.floorId);
    let count = 0;
    let massKg = 0;
    for (const passenger of floor.waiting(active.direction)) {
      if (!this.#bankCanCarry(bank, passenger)) continue;
      count += 1;
      massKg += passenger.massKg;
    }
    return { count, massKg };
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

    const demandEndedAt = this.#trace.durationS;
    const endedAt = Math.max(this.#recorder.lastEventAt, demandEndedAt);
    if (this.#options.queueSampleCount > 0) {
      this.#recorder.sampleQueue(endedAt, this.#waitingCount());
    }
    const record: RunRecord = this.#recorder.finish(endedAt);

    const summary: RunSummary = summarizeRun(record, {
      ...(this.#summarizeOptions ?? {}),
      ...(this.#windowSelection === undefined ? {} : { window: this.#windowSelection }),
      terminalFloorIds:
        this.#summarizeOptions?.terminalFloorIds ??
        (this.#entranceFloorIds.length > 0 ? this.#entranceFloorIds : undefined),
    });

    const { audit, undelivered, problems } = this.#reconcile(record);
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
      warnings: Object.freeze([...this.#warnings]),
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
        `Run "${this.#runId}" did not deliver everybody: ${undelivered.length} of ${audit.generated} journeys were still in the system when the run stopped at t=${endedAt}s. ${this.#timeoutDiagnosis()} This is a failed run, not a slow one — pass onTimeout: 'report' to inspect it.`,
        result,
      );
    }
    return result;
  }

  /**
   * Why a `timed-out` run stopped, stated from what actually happened rather than assumed.
   *
   * A genuine drain timeout has refused to schedule something because of the deadline. A run
   * that simply ran out of scheduled work while people were still standing at landings is a
   * different failure with a different remedy, and telling its owner to raise `drainGraceS`
   * would send them to look at a knob that had nothing to do with it.
   */
  #timeoutDiagnosis(): string {
    if (this.#deadlineTruncations > 0 || this.#kernel.now() >= this.#deadlineS) {
      return `The drain deadline (t=${this.#deadlineS}s = end of demand + sim.drainGraceS) cut ${this.#deadlineTruncations} pieces of work: raise sim.drainGraceS or lower demand.`;
    }
    return `The event queue emptied at t=${this.#kernel.now()}s without the drain deadline (t=${this.#deadlineS}s) ever biting, so nothing was truncated — the run simply stopped scheduling work while people were still waiting. Check result.warnings for the calls involved; raising sim.drainGraceS cannot help.`;
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

    // Which car took each leg, so an undelivered rider can be named with the car it is in.
    const carOfLeg = new Map<string, string>();
    for (const leg of runRecord.passengers) {
      if (leg.carId !== undefined) carOfLeg.set(leg.passengerId, leg.carId);
    }

    for (const record of this.#trace.passengers) {
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
        if (last.destinationFloorId !== record.finalDestinationFloorId) {
          problems.push(
            `journey "${record.journeyId}" was delivered to "${last.destinationFloorId}" but asked for "${record.finalDestinationFloorId}"`,
          );
        } else {
          delivered += 1;
        }
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
    if (delivered + undelivered.length !== generated) {
      problems.push(
        `${generated} journeys were generated but ${delivered} were delivered and ${undelivered.length} accounted for as undelivered`,
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
      balanced:
        problems.length === 0 &&
        legsCreated === legsRecorded &&
        delivered + undelivered.length === generated,
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
  });
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
  };

  return {
    building: config.building,
    profiles: config.trafficProfiles,
    streams,
    ...(config.demandTemplate === undefined ? {} : { template: config.demandTemplate }),
    // `generateTrace` rejects overrides against an already-resolved template, which carries its
    // own geometry; passing an empty record would trip that check for no benefit.
    ...(Object.keys(templateOverrides).length === 0 ? {} : { templateOverrides }),
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
    ...(demand.maxLegs === undefined ? {} : { maxLegs: demand.maxLegs }),
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
