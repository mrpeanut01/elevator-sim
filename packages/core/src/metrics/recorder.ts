/**
 * The thing the simulation talks to while it runs.
 *
 * `MetricsRecorder` collects raw per-passenger events and raw samples and does **no
 * statistics**. That separation is the point: docs/03-traffic-and-statistics.md § Part 5
 * requires per-run records rather than aggregates, "so any run can be replayed exactly and
 * results re-analyzed without re-simulating". A recorder that computed an AWT as it went
 * would have to be told the reporting window in advance, and re-windowing a stored run would
 * mean re-running it.
 *
 * ```ts
 * const streams = new StreamSet(seed);
 * const recorder = new MetricsRecorder({ seed: streams, runId: 'midtown-uppeak-07' });
 *
 * recorder.recordArrival(passenger);                       // registration at the landing
 * recorder.recordBoarding(passenger, ctx.time, { carId }); // doors closed, passenger aboard
 * recorder.recordAlighting(passenger, ctx.time);
 * recorder.sampleLoad(ctx.time, car.id, car.snapshot().load);
 * recorder.sampleQueue(ctx.time, building.waitingCount());
 *
 * const record = recorder.finish(horizonS);   // carries streams.masterSeed
 * ```
 *
 * ## What it refuses to do
 *
 * Every method that could paper over a bug throws instead. Boarding a passenger who never
 * arrived, boarding twice, alighting before boarding, a timestamp that runs backwards — all
 * are {@link MetricsError}s. A metrics layer that quietly tolerates an impossible sequence
 * turns a dispatcher bug into a plausible-looking statistic, which is the failure mode this
 * project is most at risk from.
 *
 * ## Invariants
 *
 * - **The seed is not optional** (CLAUDE.md invariant 5). Hand the recorder the run's
 *   `StreamSet` and the seed comes with it; there is no way to build a record without one.
 * - **No wall clock** (invariant 3). Every timestamp is passed in by the caller from the
 *   kernel.
 * - **No RNG** (invariant 2). Nothing here is stochastic.
 */

import type { SimTime } from '../kernel/types.js';
import type { PassengerModel } from './comparability.js';
import type { CredentialGroup, Direction } from '../model/types.js';

import {
  METRICS_SCHEMA_VERSION,
  MetricsError,
  type CarTimings,
  type LoadReading,
  type LoadSample,
  type PassengerRecord,
  type QueueSample,
  type ReportWindow,
  type TravelReading,
  type TravelSample,
  outOfBalanceWorkJ,
  type RunRecord,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Inputs
 * -------------------------------------------------------------------------- */

/**
 * What the recorder needs to know about an arriving passenger.
 *
 * Declared structurally, as `CarClock` and `FloorTopology` are, so `metrics/` needs no
 * runtime dependency on `model/` — `Passenger` satisfies it without a cast, and a test can
 * supply an object literal.
 */
export interface RecordablePassenger {
  readonly id: string;
  readonly journeyId: string;
  readonly legIndex: number;
  readonly isFinalLeg: boolean;
  readonly originFloorId: string;
  readonly destinationFloorId: string;
  readonly finalDestinationFloorId: string;
  readonly direction: Direction;
  readonly massKg: number;
  readonly arrivedAt: SimTime;
  readonly journeyStartedAt: SimTime;
  readonly credentialGroup?: CredentialGroup | undefined;
  /**
   * Seconds of declared non-lift travel owed after this leg alights. Optional so that a test
   * literal and every pre-transport-mode caller satisfy the shape unchanged; `0` when absent,
   * which is every leg of every building that declares no transport mode.
   */
  readonly egressTransitS?: number | undefined;
}

/** Anything carrying the master seed. `StreamSet` satisfies it. */
export interface SeedSource {
  readonly masterSeed: bigint;
}

/** Which car served a leg. Both fields optional: a bare simulation may not track banks. */
export interface BoardingDetails {
  readonly carId?: string | undefined;
  readonly bankId?: string | undefined;
}

/** Which car a destination-dispatch landing panel named, and which bank it belongs to. */
export interface AssignmentDetails {
  readonly carId: string;
  readonly bankId?: string | undefined;
}

export interface MetricsRecorderOptions {
  /**
   * The seed that produced this run (CLAUDE.md invariant 5).
   *
   * Pass the run's `StreamSet` — `{ masterSeed }` — and the record cannot disagree with the
   * generator that filled it. A `bigint`, a safe-integer `number` or a decimal string are
   * also accepted for tests and for replays loaded from disk.
   */
  readonly seed: bigint | number | string | SeedSource;
  /** Identity of this replication. Defaults to `run`. */
  readonly runId?: string | undefined;
  readonly buildingId?: string | undefined;
  readonly dispatcherProfileId?: string | undefined;
  readonly trafficProfileId?: string | undefined;
  readonly demandTemplateId?: string | undefined;
  readonly replication?: number | undefined;
  /** Population the demand was generated against, for handling capacity as % of population. */
  readonly population?: number | undefined;
  /**
   * Every car in service, whether or not it ever carries anybody.
   *
   * Recorded so the load-factor distribution can weight idle car-seconds: `sampleLoad` fires
   * on load *changes*, so a car that carries nobody is never sampled and would otherwise be
   * invisible to the occupancy metric — see `LoadFactorStatistics`. Cars that do get sampled
   * are picked up either way, so this is only ever additive.
   */
  readonly carIds?: readonly string[] | undefined;
  /**
   * Door and motion timings of the cars serving the terminal — see {@link CarTimings}.
   *
   * Recorded because the achieved interval **derives its departure-clustering threshold from
   * them**: a reopen at the terminal leaves `openS + max(dwell, P·tp) + closeS` between two
   * boardings of the same load (around 20 s on the shipped buildings), and a threshold below
   * that counts one loading as two departures and reports the interval short. Supply the worst
   * case across the cars serving the terminal. Omit it and the interval falls back to a
   * constant and says so — see `IntervalStatistics.departureGapBasis`.
   */
  readonly carTimings?: CarTimings | undefined;
  /**
   * Which passenger model produced this run — see `metrics/comparability.ts`.
   *
   * Omitted for `conventional`, so a record written by a conventional run is byte-identical to
   * one written before the field existed and every stored schema-version-1 record still parses.
   * Present only when the landing panel named cars, which is exactly when nine of the recorded
   * metrics stop being comparable with a record that does not carry it.
   */
  readonly passengerModel?: PassengerModel | undefined;
  /** Simulated time the run starts. Defaults to `0`. */
  readonly startedAt?: SimTime | undefined;
  /** The window this run intends to be reported over, when the demand template names one. */
  readonly reportWindow?: ReportWindow | undefined;
  readonly metadata?: Readonly<Record<string, string | number | boolean>> | undefined;
}

/* -------------------------------------------------------------------------- *
 * The recorder
 * -------------------------------------------------------------------------- */

/** Mutable twin of {@link PassengerRecord}, private to the recorder. */
interface LegState {
  readonly record: {
    readonly passengerId: string;
    readonly journeyId: string;
    readonly legIndex: number;
    readonly isFinalLeg: boolean;
    readonly originFloorId: string;
    readonly destinationFloorId: string;
    readonly finalDestinationFloorId: string;
    readonly direction: Direction;
    readonly massKg: number;
    readonly credentialGroup: CredentialGroup | undefined;
    readonly arrivedAt: SimTime;
    readonly journeyStartedAt: SimTime;
    readonly egressTransitSeconds: number;
    boardedAt: SimTime | undefined;
    alightedAt: SimTime | undefined;
    carId: string | undefined;
    bankId: string | undefined;
    assignedCarId: string | undefined;
    assignedAt: SimTime | undefined;
  };
}

/**
 * Collects one run's raw measurements.
 *
 * One per replication, constructed with that replication's `StreamSet`. Legs are stored in
 * arrival order in an insertion-ordered `Map`, so the emitted record is deterministic and
 * nothing here iterates a hash structure to decide an order (CLAUDE.md invariant 4's spirit,
 * applied to output rather than to the queue).
 */
export class MetricsRecorder {
  readonly #seed: string;
  readonly #runId: string;
  readonly #buildingId: string | undefined;
  readonly #dispatcherProfileId: string | undefined;
  readonly #trafficProfileId: string | undefined;
  readonly #demandTemplateId: string | undefined;
  readonly #replication: number | undefined;
  readonly #population: number | undefined;
  readonly #carIds: readonly string[] | undefined;
  readonly #carTimings: CarTimings | undefined;
  readonly #passengerModel: PassengerModel | undefined;
  readonly #startedAt: SimTime;
  readonly #reportWindow: ReportWindow | undefined;
  readonly #metadata: Readonly<Record<string, string | number | boolean>> | undefined;

  readonly #legs = new Map<string, LegState>();
  readonly #loadSamples: LoadSample[] = [];
  readonly #queueSamples: QueueSample[] = [];
  readonly #travelSamples: TravelSample[] = [];

  #lastEventAt: SimTime;
  #boardedCount = 0;
  #assignedCount = 0;
  #releasedCount = 0;
  #alightedCount = 0;
  #finishedAt: SimTime | undefined;

  constructor(options: MetricsRecorderOptions) {
    this.#seed = normalizeSeedString(options.seed);
    this.#runId = options.runId ?? 'run';
    if (this.#runId.length === 0) {
      throw new MetricsError('Run id must not be empty; it is how a stored record is addressed.');
    }
    this.#buildingId = options.buildingId;
    this.#dispatcherProfileId = options.dispatcherProfileId;
    this.#trafficProfileId = options.trafficProfileId;
    this.#demandTemplateId = options.demandTemplateId;
    this.#replication = options.replication;
    this.#population = options.population;
    this.#carIds = options.carIds === undefined ? undefined : Object.freeze([...options.carIds]);
    this.#carTimings =
      options.carTimings === undefined ? undefined : Object.freeze({ ...options.carTimings });
    this.#passengerModel = options.passengerModel;
    this.#startedAt = options.startedAt ?? 0;
    if (!Number.isFinite(this.#startedAt)) {
      throw new MetricsError(`Run start time must be finite; received ${this.#startedAt}.`);
    }
    this.#reportWindow = options.reportWindow;
    this.#metadata = options.metadata;
    this.#lastEventAt = this.#startedAt;
  }

  /** The seed this run will be recorded against, as a decimal string. */
  get seed(): string {
    return this.#seed;
  }

  get runId(): string {
    return this.#runId;
  }

  /** Legs recorded so far. */
  get arrivalCount(): number {
    return this.#legs.size;
  }

  /** Legs that have boarded. */
  get boardedCount(): number {
    return this.#boardedCount;
  }

  /**
   * Promises a landing panel made. `0` under every conventional run.
   *
   * An **event count**, not a leg count: a leg whose promise was voided by
   * {@link releaseAssignment} and then re-made counts twice. `assignedCount - releasedCount` is
   * the number of legs holding a promise now, which is the quantity
   * `Simulation.#reconcile` compares with `legsCreated`.
   */
  get assignedCount(): number {
    return this.#assignedCount;
  }

  /** Promises voided because the car they named left group control. See {@link releaseAssignment}. */
  get releasedCount(): number {
    return this.#releasedCount;
  }

  /** Legs that have completed. */
  get alightedCount(): number {
    return this.#alightedCount;
  }

  /** Latest simulated time handed to any method. `finish` must not precede it. */
  get lastEventAt(): SimTime {
    return this.#lastEventAt;
  }

  /** Whether {@link finish} has been called. Further recording throws. */
  get isFinished(): boolean {
    return this.#finishedAt !== undefined;
  }

  /* ---------------------------------------------------------------- *
   * Passenger lifecycle
   * ---------------------------------------------------------------- */

  /**
   * Register a passenger arriving at a landing and beginning to wait.
   *
   * Call once per **leg**. A sky-lobby transfer produces a second `Passenger` sharing the
   * first one's `journeyId` (see `PassengerFactory.transfer`), and that second leg is recorded
   * with its own `recordArrival` — which is exactly what lets waiting time stay per-leg while
   * time-to-destination spans the whole journey.
   *
   * @throws MetricsError if the leg id has already been recorded, or the arrival time is not
   *   finite.
   */
  recordArrival(passenger: RecordablePassenger): void {
    this.#assertOpen('recordArrival');
    if (this.#legs.has(passenger.id)) {
      throw new MetricsError(
        `Leg "${passenger.id}" has already been recorded as arriving. Each leg of a journey is a distinct Passenger with its own id; re-recording one would double-count a wait.`,
      );
    }
    if (!Number.isFinite(passenger.arrivedAt)) {
      throw new MetricsError(
        `Leg "${passenger.id}" needs a finite arrival time; received ${passenger.arrivedAt}.`,
      );
    }
    if (passenger.journeyStartedAt > passenger.arrivedAt) {
      throw new MetricsError(
        `Leg "${passenger.id}" arrives at t=${passenger.arrivedAt} but claims its journey began later, at t=${passenger.journeyStartedAt}.`,
      );
    }

    this.#legs.set(passenger.id, {
      record: {
        passengerId: passenger.id,
        journeyId: passenger.journeyId,
        legIndex: passenger.legIndex,
        isFinalLeg: passenger.isFinalLeg,
        originFloorId: passenger.originFloorId,
        destinationFloorId: passenger.destinationFloorId,
        finalDestinationFloorId: passenger.finalDestinationFloorId,
        direction: passenger.direction,
        massKg: passenger.massKg,
        credentialGroup: passenger.credentialGroup,
        arrivedAt: passenger.arrivedAt,
        journeyStartedAt: passenger.journeyStartedAt,
        egressTransitSeconds: passenger.egressTransitS ?? 0,
        boardedAt: undefined,
        alightedAt: undefined,
        carId: undefined,
        bankId: undefined,
        assignedCarId: undefined,
        assignedAt: undefined,
      },
    });
    this.#observe(passenger.arrivedAt);
  }

  /**
   * Record the car a destination-dispatch landing panel named for a waiting leg.
   *
   * Beside `recordArrival` / `recordBoarding` / `recordAlighting` and called from the same one
   * place `#admit`'s decision to assign is taken, so no leg can be promised a car without the
   * promise reaching the metrics layer — which is what makes `legsAssigned` a check on the seam
   * rather than a restatement of it.
   *
   * **Write-once**, mirroring `Passenger.assign` (DECISIONS.md § D29). A second call is a panel
   * changing its mind, which this model does not have — with the one exception
   * {@link releaseAssignment} states, which must be called first.
   *
   * @throws MetricsError if the leg never arrived, has already been assigned, has already
   *   boarded, or is assigned before it arrived.
   */
  recordAssignment(
    passenger: RecordablePassenger | string,
    at: SimTime,
    details: AssignmentDetails,
  ): void {
    this.#assertOpen('recordAssignment');
    const id = typeof passenger === 'string' ? passenger : passenger.id;
    const leg = this.#require(id, 'be assigned a car');
    if (leg.record.assignedCarId !== undefined) {
      throw new MetricsError(
        `Leg "${id}" was assigned to car "${leg.record.assignedCarId}" at t=${String(leg.record.assignedAt)} and cannot be assigned to "${details.carId}" at t=${at}. A destination assignment is write-once.`,
      );
    }
    if (leg.record.boardedAt !== undefined) {
      throw new MetricsError(
        `Leg "${id}" boarded at t=${leg.record.boardedAt} and cannot be assigned a car at t=${at}.`,
      );
    }
    if (!Number.isFinite(at) || at < leg.record.arrivedAt) {
      throw new MetricsError(
        `Leg "${id}" cannot be assigned at t=${at}: it arrived at t=${leg.record.arrivedAt}.`,
      );
    }
    leg.record.assignedCarId = details.carId;
    leg.record.assignedAt = at;
    this.#assignedCount += 1;
    this.#observe(at);
  }

  /**
   * Void a leg's promise, because the car it named has left group control.
   *
   * The recorder's half of `Passenger.releasePromise`, and it exists for the same reason
   * `recordAssignment` does: the record must carry what the model holds, or a promise cannot be
   * audited from a stored record. `assignedCarId` is cleared rather than overwritten in place so
   * that the record never claims a promise that is not in force — a reader reconstructing "who was
   * promised what at t" from a record whose field was quietly re-pointed would see a passenger
   * promised to a car that had been out of service for twenty minutes.
   *
   * A no-op on a leg with no promise, so a sweep over a landing does not need to pre-filter.
   *
   * @throws MetricsError if the leg never arrived or has already boarded.
   */
  releaseAssignment(passenger: RecordablePassenger | string, at: SimTime): void {
    this.#assertOpen('releaseAssignment');
    const id = typeof passenger === 'string' ? passenger : passenger.id;
    const leg = this.#require(id, 'have its assignment released');
    if (leg.record.boardedAt !== undefined) {
      throw new MetricsError(
        `Leg "${id}" boarded at t=${leg.record.boardedAt} and its assignment cannot be released at t=${at}.`,
      );
    }
    if (leg.record.assignedCarId === undefined) return;
    leg.record.assignedCarId = undefined;
    leg.record.assignedAt = undefined;
    this.#releasedCount += 1;
    this.#observe(at);
  }

  /**
   * Record a passenger stepping into a car. This ends their wait.
   *
   * @throws MetricsError if the leg never arrived, has already boarded, or boards before it
   *   arrived. Simulated time never runs backwards, and a negative waiting time would sail
   *   through every downstream mean unnoticed.
   */
  recordBoarding(
    passenger: RecordablePassenger | string,
    at: SimTime,
    details: BoardingDetails = {},
  ): void {
    this.#assertOpen('recordBoarding');
    const id = typeof passenger === 'string' ? passenger : passenger.id;
    const leg = this.#require(id, 'board');
    if (leg.record.boardedAt !== undefined) {
      throw new MetricsError(
        `Leg "${id}" boarded at t=${leg.record.boardedAt} and cannot board again at t=${at}.`,
      );
    }
    if (!Number.isFinite(at) || at < leg.record.arrivedAt) {
      throw new MetricsError(
        `Leg "${id}" cannot board at t=${at}: it arrived at t=${leg.record.arrivedAt}.`,
      );
    }
    leg.record.boardedAt = at;
    leg.record.carId = details.carId;
    leg.record.bankId = details.bankId;
    this.#boardedCount += 1;
    this.#observe(at);
  }

  /**
   * Record a passenger stepping out of a car. This ends their leg.
   *
   * @throws MetricsError if the leg never arrived, never boarded, has already alighted, or
   *   alights before it boarded.
   */
  recordAlighting(passenger: RecordablePassenger | string, at: SimTime): void {
    this.#assertOpen('recordAlighting');
    const id = typeof passenger === 'string' ? passenger : passenger.id;
    const leg = this.#require(id, 'alight');
    const boardedAt = leg.record.boardedAt;
    if (boardedAt === undefined) {
      throw new MetricsError(`Leg "${id}" cannot alight at t=${at}: it never boarded.`);
    }
    if (leg.record.alightedAt !== undefined) {
      throw new MetricsError(
        `Leg "${id}" alighted at t=${leg.record.alightedAt} and cannot alight again at t=${at}.`,
      );
    }
    if (!Number.isFinite(at) || at < boardedAt) {
      throw new MetricsError(`Leg "${id}" cannot alight at t=${at}: it boarded at t=${boardedAt}.`);
    }
    leg.record.alightedAt = at;
    this.#alightedCount += 1;
    this.#observe(at);
  }

  /* ---------------------------------------------------------------- *
   * Samples
   * ---------------------------------------------------------------- */

  /**
   * Sample one car's load cell.
   *
   * Call on every load change — each board and each alight — rather than on a timer. Between
   * two load events the reading is constant, so an event-driven series is an *exact*
   * description of a step function, and `summarize` time-weights it accordingly.
   *
   * `CarSnapshot['load']` satisfies {@link LoadReading} directly.
   */
  sampleLoad(at: SimTime, carId: string, reading: LoadReading): void {
    this.#assertOpen('sampleLoad');
    if (!Number.isFinite(at)) {
      throw new MetricsError(`Load sample needs a finite time; received ${at}.`);
    }
    if (!Number.isFinite(reading.loadFactor)) {
      throw new MetricsError(
        `Load sample for car "${carId}" needs a finite loadFactor; received ${reading.loadFactor}.`,
      );
    }
    this.#loadSamples.push(
      Object.freeze({
        at,
        carId,
        loadFactor: reading.loadFactor,
        occupants: reading.occupants,
        massKg: reading.massKg,
      }),
    );
    this.#observe(at);
  }

  /**
   * Record one completed car move — the energy proxy's raw input.
   *
   * Called on every arrival, from the same handler that calls `Car.completeArrival`, whose
   * return value satisfies {@link TravelReading} structurally. **This is the whole of the
   * integration seam on the recorder's side**, and it is one call: a travel statistic that
   * existed here and was never called from `sim/simulation.ts` would be the ninth instance of
   * the defect docs/05-roadmap.md § *Standing requirement* enumerates.
   *
   * The joules are computed here rather than in the car, because
   * {@link COUNTERWEIGHT_BALANCE_RATIO} is a measurement convention and a car is a mechanism.
   * A zero-distance move is refused: the simulator never commands one (`departFor` throws when
   * the target is the current floor), so one arriving here is a bug worth failing on rather
   * than a free sample that dilutes the mean.
   */
  sampleTravel(at: SimTime, carId: string, reading: TravelReading): void {
    this.#assertOpen('sampleTravel');
    if (!Number.isFinite(at)) {
      throw new MetricsError(`Travel sample needs a finite time; received ${at}.`);
    }
    if (!Number.isFinite(reading.distanceM) || reading.distanceM <= 0) {
      throw new MetricsError(
        `Travel sample for car "${carId}" needs a positive distance; received ${reading.distanceM}. A car does not depart for the floor it is standing on, so a zero-distance move is a bug rather than a datum.`,
      );
    }
    if (!Number.isFinite(reading.ratedLoadKg) || reading.ratedLoadKg <= 0) {
      throw new MetricsError(
        `Travel sample for car "${carId}" needs a positive ratedLoadKg; received ${reading.ratedLoadKg}. The counterweight has nothing to balance against without one, so the work would be the car's whole load rather than its out-of-balance load.`,
      );
    }
    if (!Number.isFinite(reading.loadKg) || reading.loadKg < 0) {
      throw new MetricsError(
        `Travel sample for car "${carId}" needs a non-negative loadKg; received ${reading.loadKg}.`,
      );
    }
    this.#travelSamples.push(
      Object.freeze({
        at,
        carId,
        distanceM: reading.distanceM,
        direction: reading.direction,
        loadKg: reading.loadKg,
        ratedLoadKg: reading.ratedLoadKg,
        workJ: outOfBalanceWorkJ(reading),
      }),
    );
    // **Deliberately does not `#observe(at)`, unlike every other recording method here.**
    //
    // `#lastEventAt` is not bookkeeping: `Simulation` computes the run horizon as
    // `max(recorder.lastEventAt, demandEndedAt)`, so anything that advances it lengthens the
    // full-run window, which changes `windowSeconds`, the handling-capacity denominator and the
    // saturation fit for every run in the project. An instrument that changes the thing it is
    // measuring is a broken instrument, and adding the energy axis must not move a single
    // published figure — `benchmark/published.test.ts` is what would find out, and this is why it
    // does not have to.
    //
    // Nothing is lost. A car arrival is always followed, within the same stop, by the door
    // opening and the alighting that `recordAlighting` *does* observe, so the last travel sample
    // of a run never sits past the last passenger event; `energyLiveness.test.ts` asserts that
    // directly by counting samples outside the emitted record's own `[startedAt, endedAt)`.
  }

  /**
   * Sample the building-wide number of passengers waiting at landings.
   *
   * The direct input to saturation detection. Sampling on a regular grid is fine and is what
   * the trend fit expects; when a run carries no queue samples at all, `queueLengthSeries()`
   * reconstructs an equivalent series from arrival and boarding times, so this call is an
   * accuracy improvement rather than a requirement.
   */
  sampleQueue(at: SimTime, waiting: number, byFloorId?: Readonly<Record<string, number>>): void {
    this.#assertOpen('sampleQueue');
    if (!Number.isFinite(at)) {
      throw new MetricsError(`Queue sample needs a finite time; received ${at}.`);
    }
    if (!Number.isFinite(waiting) || waiting < 0) {
      throw new MetricsError(
        `Queue sample at t=${at} needs a non-negative finite count; received ${waiting}.`,
      );
    }
    this.#queueSamples.push(
      Object.freeze({
        at,
        waiting,
        ...(byFloorId === undefined ? {} : { byFloorId: Object.freeze({ ...byFloorId }) }),
      }),
    );
    this.#observe(at);
  }

  /* ---------------------------------------------------------------- *
   * Output
   * ---------------------------------------------------------------- */

  /** The legs recorded so far, in arrival order. A copy; safe to inspect mid-run. */
  passengerRecords(): readonly PassengerRecord[] {
    return [...this.#legs.values()].map((leg) => freezeLeg(leg));
  }

  /**
   * Close the run and emit its record.
   *
   * @param endedAt the horizon the kernel ran to. **Exclusive**: the full-run window is
   *   `[startedAt, endedAt)`, so pass the value given to `SimKernel.run(until)`, not the
   *   timestamp of the last event — a passenger arriving at exactly `endedAt` falls outside
   *   the window by the same half-open rule every other window obeys.
   * @throws MetricsError if `endedAt` precedes the run start or any recorded event.
   *
   * Idempotent: calling it again re-emits an equal record. Recording after it throws, because
   * an event that arrives after the run was summarized has already been left out of somebody's
   * statistics.
   */
  finish(endedAt: SimTime): RunRecord {
    if (!Number.isFinite(endedAt)) {
      throw new MetricsError(`Run end time must be finite; received ${endedAt}.`);
    }
    if (endedAt < this.#startedAt) {
      throw new MetricsError(
        `Run "${this.#runId}" cannot end at t=${endedAt}: it started at t=${this.#startedAt}.`,
      );
    }
    if (endedAt < this.#lastEventAt) {
      throw new MetricsError(
        `Run "${this.#runId}" cannot end at t=${endedAt}: it recorded an event at t=${this.#lastEventAt}. Pass the horizon the kernel ran to.`,
      );
    }
    this.#finishedAt = endedAt;

    return Object.freeze({
      schemaVersion: METRICS_SCHEMA_VERSION,
      runId: this.#runId,
      seed: this.#seed,
      ...(this.#buildingId === undefined ? {} : { buildingId: this.#buildingId }),
      ...(this.#dispatcherProfileId === undefined
        ? {}
        : { dispatcherProfileId: this.#dispatcherProfileId }),
      ...(this.#trafficProfileId === undefined ? {} : { trafficProfileId: this.#trafficProfileId }),
      ...(this.#demandTemplateId === undefined ? {} : { demandTemplateId: this.#demandTemplateId }),
      ...(this.#replication === undefined ? {} : { replication: this.#replication }),
      ...(this.#population === undefined ? {} : { population: this.#population }),
      ...(this.#carIds === undefined ? {} : { carIds: this.#carIds }),
      ...(this.#carTimings === undefined ? {} : { carTimings: this.#carTimings }),
      ...(this.#passengerModel === undefined ? {} : { passengerModel: this.#passengerModel }),
      startedAt: this.#startedAt,
      endedAt,
      ...(this.#reportWindow === undefined
        ? {}
        : { reportWindow: Object.freeze({ ...this.#reportWindow }) }),
      passengers: Object.freeze(this.passengerRecords()),
      loadSamples: Object.freeze([...this.#loadSamples]),
      queueSamples: Object.freeze([...this.#queueSamples]),
      // Omitted rather than empty when nothing moved, so a record from a harness that does not
      // sample travel is byte-identical to one written before the field existed — and so
      // `summarizeRun` can tell "the cars did not move" from "nobody wrote it down".
      ...(this.#travelSamples.length === 0
        ? {}
        : { travelSamples: Object.freeze([...this.#travelSamples]) }),
      ...(this.#metadata === undefined ? {} : { metadata: Object.freeze({ ...this.#metadata }) }),
    });
  }

  #require(id: string, action: string): LegState {
    const leg = this.#legs.get(id);
    if (leg === undefined) {
      throw new MetricsError(
        `Leg "${id}" cannot ${action}: it was never recorded as arriving. Call recordArrival first, or the passenger's wait has no start.`,
      );
    }
    return leg;
  }

  #assertOpen(method: string): void {
    if (this.#finishedAt !== undefined) {
      throw new MetricsError(
        `Run "${this.#runId}" was finished at t=${this.#finishedAt}; ${method} came too late and would be missing from any summary already computed.`,
      );
    }
  }

  #observe(at: SimTime): void {
    if (at > this.#lastEventAt) this.#lastEventAt = at;
  }
}

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

function freezeLeg(leg: LegState): PassengerRecord {
  const source = leg.record;
  return Object.freeze({
    passengerId: source.passengerId,
    journeyId: source.journeyId,
    legIndex: source.legIndex,
    isFinalLeg: source.isFinalLeg,
    originFloorId: source.originFloorId,
    destinationFloorId: source.destinationFloorId,
    finalDestinationFloorId: source.finalDestinationFloorId,
    direction: source.direction,
    massKg: source.massKg,
    ...(source.credentialGroup === undefined ? {} : { credentialGroup: source.credentialGroup }),
    arrivedAt: source.arrivedAt,
    journeyStartedAt: source.journeyStartedAt,
    // Omitted at zero so a record from a building with no transport mode is byte-identical to
    // one written before the field existed — the same rule `assignedCarId` follows below.
    ...(source.egressTransitSeconds === 0
      ? {}
      : { egressTransitSeconds: source.egressTransitSeconds }),
    ...(source.boardedAt === undefined ? {} : { boardedAt: source.boardedAt }),
    ...(source.alightedAt === undefined ? {} : { alightedAt: source.alightedAt }),
    ...(source.carId === undefined ? {} : { carId: source.carId }),
    ...(source.bankId === undefined ? {} : { bankId: source.bankId }),
    // Omitted, not `undefined`, so a conventional run's record is byte-identical to one written
    // before destination dispatch existed — which is what keeps every stored Phase 5 and Phase 6a
    // record parseable and every published digest of one unchanged.
    ...(source.assignedCarId === undefined ? {} : { assignedCarId: source.assignedCarId }),
    ...(source.assignedAt === undefined ? {} : { assignedAt: source.assignedAt }),
  });
}

/**
 * Normalize any accepted seed form to the decimal string a record stores.
 *
 * A string is validated rather than trusted: a record whose seed is `"undefined"` cannot be
 * replayed, and finding that out at parse time beats finding it out during a Phase 3
 * re-analysis.
 */
function normalizeSeedString(seed: bigint | number | string | SeedSource): string {
  if (typeof seed === 'bigint') return assertNonNegative(seed);
  if (typeof seed === 'number') {
    if (!Number.isSafeInteger(seed) || seed < 0) {
      throw new MetricsError(
        `Master seed must be a non-negative safe integer, a bigint or a decimal string; received ${seed}.`,
      );
    }
    return String(seed);
  }
  if (typeof seed === 'string') {
    if (!/^\d+$/.test(seed)) {
      throw new MetricsError(
        `Master seed string must be a non-negative decimal integer; received "${seed}".`,
      );
    }
    return seed;
  }
  return assertNonNegative(seed.masterSeed);
}

function assertNonNegative(seed: bigint): string {
  if (seed < 0n) {
    throw new MetricsError(
      `Master seed must be non-negative; received ${seed}. StreamSet normalizes seeds to unsigned 64-bit, so pass the StreamSet rather than the raw value.`,
    );
  }
  return seed.toString();
}
