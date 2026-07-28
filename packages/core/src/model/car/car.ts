/**
 * The car entity: **physics and safety, never allocation policy**.
 *
 * docs/01-architecture.md draws the seam the industry already settled on. A car controller
 * owns motion profile, door state machine, levelling, load weighing, safety interlocks and
 * service mode — one per car, hard real-time, never centralized. A group controller owns
 * hall-call allocation, pre-positioning, parking and zoning strategy — always centralized,
 * because it *is* the optimization. This class is strictly the first of those.
 *
 * So the car knows *that* a hall call was allocated to it and what it costs to serve; it has
 * no opinion about whether it should have been. Everything that looks like a decision here
 * is either geometry (the order it physically reaches its stops) or safety (an overloaded car
 * does not start).
 *
 * ## What it owns
 *
 * | | |
 * |---|---|
 * | Position and motion | {@link departFor}, {@link completeArrival}, driven by `physics/motion` |
 * | Analytic position | {@link positionAt} — what the renderer samples between kernel events |
 * | Doors | {@link openDoors}, {@link closeDoors}, driven by `physics/doors` |
 * | Its own car calls | {@link registerCarCall}, cleared when the car opens up there |
 * | Load | {@link board}, {@link alight}, {@link disembark}; {@link loadSensor} sums real passenger masses, not a head count |
 * | Service mode | {@link setMode} — in-service, independent, fire-recall, out-of-service |
 * | The pure cost query | {@link estimateCost} |
 *
 * ## Invariants it upholds
 *
 * - **{@link estimateCost} is pure** (CLAUDE.md invariant 1). The method is a one-line
 *   delegation to a free function over a frozen {@link CarSnapshot}; see `estimateCost.ts`
 *   for how that makes purity structural rather than a promise.
 * - **No RNG.** This module never imports `random/`. It cannot draw a number, so it cannot
 *   desynchronize common random numbers. Whether a passenger obstructs the doors is decided
 *   by the caller from the injected `StreamSet`'s `doorObstruction` stream and delivered as
 *   {@link requestReopen}.
 * - **No wall clock.** Time comes from the injected {@link CarClock} — the kernel — and from
 *   nowhere else.
 *
 * ## Driving one from the kernel
 *
 * ```ts
 * const move = car.departFor('12');                       // returns the timed move
 * kernel.schedule(move.arrivesAt, createEvent('car.arrived', () => {
 *   car.completeArrival();
 *   car.openDoors();
 *   const closesAt = car.nextDoorTransitionAt();          // undefined while the load holds them
 *   if (closesAt !== undefined) kernel.schedule(closesAt, doorStep);
 * }));
 * // ...meanwhile, in the renderer, at display framerate:
 * const y = car.positionAt(kernel.now());
 * ```
 */

import type { SimTime } from '../../kernel/types.js';
import type { AnswerStageConfig, LoadSensorConfig, ResolvedCar } from '../../config/types.js';
import {
  advanceDoor,
  applyDoorCommand,
  createDoorState,
  doorOpenFractionAt,
  isDoorMoving,
  mergeStopReasons,
  nextDoorTransitionAt as nextDoorTransition,
  resolveDoorConfig,
  type DoorConfig,
  type DoorConfigOverrides,
  type DoorMachineState,
  type DoorReopenCause,
  type DoorState,
  type DoorStep,
  type DoorStopReason,
} from '../../physics/doors/index.js';
import {
  buildProfile,
  kinematicsAt as profileKinematicsAt,
  positionAt as profilePositionAt,
  velocityAt as profileVelocityAt,
  type Kinematics,
  type MotionConstraints,
} from '../../physics/motion/index.js';
import type { CarLike } from '../bank.js';
import type { Passenger } from '../passenger.js';
import {
  ModelError,
  acceptsCarCalls,
  acceptsHallCalls,
  oppositeDirection,
  type CarCall,
  type Direction,
  type HallCall,
  type ServiceMode,
} from '../types.js';

import {
  directionTowardNearestStop,
  estimateCost as estimateCostFor,
  projectRoute,
} from './estimateCost.js';
import {
  LOAD_SENSOR_PARAMETERS,
  LoadSensor,
  resolveLoadSensor,
  type LoadSensorOverrides,
} from './loadSensor.js';
import {
  shaftFloor,
  type CarClock,
  type CarMotion,
  type CarParameterSpec,
  type CarShaft,
  type CarSnapshot,
  type CommittedStop,
  type CostEstimate,
  type CostRequest,
  type RouteStop,
  type ServedFloor,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Defaults and tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

/**
 * Runtime defaults for the two car-level numbers that are not already on a `ResolvedCar`.
 *
 * The physical timings — rated speed, acceleration, jerk, door times, motor start delay,
 * levelling — have no default here on purpose: they come from the car, which resolved them
 * from `data/elevator-specs.json`.
 */
export const CAR_DEFAULTS = Object.freeze({
  /**
   * Seconds per passenger per direction through the doorway.
   *
   * 1.2 s is the office value from `elevator-specs.json → timing.passengerTransferS`;
   * residential is 1.75 s (ISO 4190-6) and hotel 1.5 s. A caller that knows the building
   * type should pass the matching one — the default is the commonest case, not a claim that
   * building type does not matter.
   */
  passengerTransferS: 1.2,
  /**
   * Passengers a hall-call stop is assumed to load when nobody has counted the queue.
   *
   * It exists because a conventional up/down button carries no count: the car is told a
   * floor and a direction and nothing else. A dispatcher that *has* counted says so on the
   * request (`boardingPassengers`), and this number then plays no part.
   */
  assumedBoardingPassengers: 1,
} as const satisfies {
  readonly passengerTransferS: number;
  readonly assumedBoardingPassengers: number;
});

/**
 * The schema for every car tunable, including the load sensor's (CLAUDE.md invariant 8).
 *
 * A generic optimizer can sample a valid car configuration from this without knowing
 * anything about elevators. `car.*` ids resolve against a car in a building config,
 * `answer.*` against a dispatcher profile's answer stage.
 *
 * Rated speed, acceleration, jerk, the door timings and the car's **service mode** are not
 * here: they are already declared by `config/schema.ts` and `DOOR_PARAMETERS` respectively, and
 * a second declaration would be a second source of truth. `car.mode` is the newest of them and
 * the rule bites the same way — it is a `carConfigSchema` field with a `z.enum(SERVICE_MODES)`,
 * exactly as `doorType` is, so its schema (CLAUDE.md invariant 8) is declared there. It would
 * also be the wrong dimension for a dispatcher search to hold: a tuner that took its own fleet
 * out of service to improve an objective would be tuning the ruler.
 */
export const CAR_PARAMETERS: readonly CarParameterSpec[] = [
  ...LOAD_SENSOR_PARAMETERS,
  {
    id: 'car.passengerTransferS',
    type: 'continuous',
    range: [0.8, 2.0],
    scale: 'linear',
    default: CAR_DEFAULTS.passengerTransferS,
    unit: 's/passenger',
    description:
      'Transfer time per passenger per direction. Office 1.0-1.2, hotel 1.5, residential 1.5-2.0 (ISO 4190-6 uses 1.75). Sets the 2*P*tp term of the round-trip-time calculation.',
  },
  {
    id: 'car.assumedBoardingPassengers',
    type: 'integer',
    range: [0, 10],
    scale: 'linear',
    default: CAR_DEFAULTS.assumedBoardingPassengers,
    description:
      'Passengers a hall-call stop is assumed to load when the request declares no count. Inert under destination entry or any dispatcher that supplies boardingPassengers.',
  },
];

/* -------------------------------------------------------------------------- *
 * Construction
 * -------------------------------------------------------------------------- */

/** Everything a {@link Car} needs. */
export interface CarInit {
  /** Unique within the run. Usually the `ResolvedCar.id`, qualified by bank if need be. */
  readonly id: string;
  /** The bank whose group controller allocates to this car. */
  readonly bankId: string;
  /** The hardware, with class defaults already applied. */
  readonly spec: ResolvedCar;
  /** Floors this shaft opens onto — service zoning, geometry and access zones. */
  readonly shaft: CarShaft;
  /** Where the car stands at t=0 and returns to on {@link Car.reset}. Must be served. */
  readonly homeFloorId: string;
  /** The simulated clock. `SimKernel` satisfies this. */
  readonly clock: CarClock;
  /** Service mode at t=0 and after a reset. Defaults to `in-service`. */
  readonly mode?: ServiceMode | undefined;
  /** The dispatcher profile's answer stage: door and load-sensor control tunables. */
  readonly answer?: AnswerStageConfig | undefined;
  /** `data/elevator-specs.json → loadSensor`. Defaults to `LOAD_SENSOR_DEFAULTS`. */
  readonly loadSensorSpec?: LoadSensorConfig | undefined;
  /** Explicit door overrides, applied last. For an optimizer or a test fixture. */
  readonly doorOverrides?: DoorConfigOverrides | undefined;
  /** Explicit load-sensor overrides, applied last. */
  readonly loadSensorOverrides?: LoadSensorOverrides | undefined;
  /** Seconds per passenger per direction. Defaults to `CAR_DEFAULTS.passengerTransferS`. */
  readonly passengerTransferS?: number | undefined;
  /** Hall-call boarding assumed absent a count. Defaults to `CAR_DEFAULTS`. */
  readonly assumedBoardingPassengers?: number | undefined;
}

/** Options for {@link Car.board}. */
export interface BoardOptions {
  /**
   * Whether boarding also registers a car call for the passenger's destination.
   *
   * `true` by default, because a passenger boarding a conventional car presses their floor
   * and that button is car-owned state. Pass `false` under destination entry, where the
   * destination was registered at the landing and the car already holds the stop.
   */
  readonly registerCarCall?: boolean | undefined;
}

/* -------------------------------------------------------------------------- *
 * The car
 * -------------------------------------------------------------------------- */

/**
 * One elevator car during a run.
 *
 * Mutable per-run state, and {@link reset} clears all of it — which `Building.reset` relies
 * on, because a replication that inherits the previous one's car positions is not
 * statistically independent and turns Phase 3's paired-t intervals into confident nonsense.
 */
export class Car implements CarLike {
  readonly id: string;
  readonly bankId: string;
  /** The hardware specification this car was resolved from. Immutable. */
  readonly spec: ResolvedCar;
  /** Service zoning, geometry and access zones. Immutable for the run. */
  readonly shaft: CarShaft;
  /** Door timings and control settings, resolved once. Immutable for the run. */
  readonly doorConfig: DoorConfig;
  /** The comfort envelope every motion profile is built against. */
  readonly constraints: MotionConstraints;
  /** The load cell. Mutable per-run state; the one thing that measures rather than decides. */
  readonly loadSensor: LoadSensor;
  /** Seconds per passenger per direction through the doorway. */
  readonly passengerTransferS: number;
  /** Passengers a hall-call stop is assumed to load absent a declared count. */
  readonly assumedBoardingPassengers: number;
  /** The floor the car starts at, and returns to on {@link reset}. */
  readonly homeFloor: ServedFloor;

  readonly #clock: CarClock;
  readonly #initialMode: ServiceMode;

  #mode: ServiceMode;
  #floor: ServedFloor;
  #motion: CarMotion | undefined;
  #direction: Direction | undefined;
  #door: DoorMachineState;
  /** Registered destinations, keyed by floor id. Insertion-ordered, so iteration is stable. */
  readonly #carCalls = new Map<string, CarCall>();
  /** Hall calls the group controller allocated, keyed by `HallCall.id`. */
  readonly #hallCalls = new Map<string, HallCall>();
  #passengers: Passenger[] = [];
  #distanceTravelledM = 0;
  #departures = 0;
  #stopsServed = 0;

  constructor(init: CarInit) {
    if (init.id.length === 0) throw new ModelError('Car id must not be empty.');

    const home = shaftFloor(init.shaft, init.homeFloorId);
    if (home === undefined) {
      throw new ModelError(
        `Car "${init.id}" is homed at floor "${init.homeFloorId}", which its shaft does not serve.`,
      );
    }

    this.id = init.id;
    this.bankId = init.bankId;
    this.spec = init.spec;
    this.shaft = init.shaft;
    this.homeFloor = home;
    this.#clock = init.clock;
    this.#initialMode = init.mode ?? 'in-service';
    this.#mode = this.#initialMode;
    this.#floor = home;
    this.#door = createDoorState(0);

    this.doorConfig = resolveDoorConfig(init.spec, init.answer, init.doorOverrides);
    this.loadSensor = new LoadSensor(
      resolveLoadSensor(init.spec, init.loadSensorSpec, init.answer, init.loadSensorOverrides),
    );
    this.constraints = Object.freeze({
      ratedSpeedMps: init.spec.ratedSpeedMps,
      acceleration: init.spec.acceleration,
      jerk: init.spec.jerk,
    });

    this.passengerTransferS = requireNonNegative(
      init.passengerTransferS ?? CAR_DEFAULTS.passengerTransferS,
      'passengerTransferS',
      this.id,
    );
    const assumed = init.assumedBoardingPassengers ?? CAR_DEFAULTS.assumedBoardingPassengers;
    if (!Number.isInteger(assumed) || assumed < 0) {
      throw new ModelError(
        `Car "${this.id}": assumedBoardingPassengers must be a non-negative integer; received ${assumed}.`,
      );
    }
    this.assumedBoardingPassengers = assumed;
  }

  /* ---------------------------------------------------------------- *
   * Clock
   * ---------------------------------------------------------------- */

  /** The simulated time, from the kernel. Never a wall clock (CLAUDE.md invariant 3). */
  now(): SimTime {
    return this.#clock.now();
  }

  /* ---------------------------------------------------------------- *
   * Service mode
   * ---------------------------------------------------------------- */

  get mode(): ServiceMode {
    return this.#mode;
  }

  /** Whether the group controller may allocate hall calls here. Only `in-service` qualifies. */
  get acceptsHallCalls(): boolean {
    return acceptsHallCalls(this.#mode);
  }

  /** Whether car calls pressed inside are still honoured. True on `independent` too. */
  get acceptsCarCalls(): boolean {
    return acceptsCarCalls(this.#mode);
  }

  /**
   * Change service mode, releasing the work the new mode cannot do.
   *
   * A car leaving `in-service` **drops its assigned hall calls**, because they are now
   * unserviceable and the group controller has to reallocate them; leaving them attached to a
   * recalled car would strand every passenger waiting on them. A car leaving `independent`
   * as well as `in-service` — that is, going to `fire-recall` or `out-of-service` — also
   * drops its car calls, since it is no longer carrying anyone.
   *
   * @returns the hall calls released, so the caller can hand them back to the dispatcher.
   */
  setMode(mode: ServiceMode): readonly HallCall[] {
    if (mode === this.#mode) return [];
    this.#mode = mode;

    let released: readonly HallCall[] = [];
    if (!acceptsHallCalls(mode)) {
      released = [...this.#hallCalls.values()];
      this.#hallCalls.clear();
    }
    if (!acceptsCarCalls(mode)) {
      this.#carCalls.clear();
    }
    return released;
  }

  /* ---------------------------------------------------------------- *
   * Position and motion
   * ---------------------------------------------------------------- */

  /** The floor the car is at, or the one it left if a move is in progress. */
  get floorId(): string {
    return this.#floor.id;
  }

  get floorIndex(): number {
    return this.#floor.index;
  }

  /** Height above datum at the last kernel event, metres. Use {@link positionAt} between them. */
  get heightM(): number {
    return this.#floor.heightM;
  }

  /** Direction of the current run, or `undefined` when the car is idle. */
  get direction(): Direction | undefined {
    return this.#direction;
  }

  get isMoving(): boolean {
    return this.#motion !== undefined;
  }

  /** The move in progress, or `undefined`. Frozen. */
  get motion(): CarMotion | undefined {
    return this.#motion;
  }

  /** When the current move completes and the car is levelled, or `undefined` if standing. */
  get arrivesAt(): SimTime | undefined {
    return this.#motion?.arrivesAt;
  }

  /**
   * Height above datum at `t`, metres — the analytic position docs/01-architecture.md has
   * the renderer sample at display framerate between kernel events.
   *
   * Exact, not interpolated: it evaluates the same S-curve the kernel timed the move with,
   * so the picture and the statistics can never disagree.
   *
   * Continuous at both ends of a move, by construction. Before `motion.startedAt` — during
   * the motor start delay, when the brake is still lifting — the profile clamps to zero
   * displacement and this returns the departure floor. After the profile ends, it clamps to
   * full displacement and returns the destination floor, which is the same value
   * {@link completeArrival} then makes permanent, so the arrival event moves nothing.
   */
  positionAt(t: SimTime): number {
    const motion = this.#motion;
    if (motion === undefined) return this.#floor.heightM;
    return motion.fromHeightM + profilePositionAt(motion.profile, t - motion.startedAt);
  }

  /** Signed velocity at `t`, m/s. Zero while standing, and at both ends of a move. */
  velocityAt(t: SimTime): number {
    const motion = this.#motion;
    if (motion === undefined) return 0;
    return profileVelocityAt(motion.profile, t - motion.startedAt);
  }

  /**
   * Full kinematic state at `t`.
   *
   * `position` is the **absolute height above datum**, not the displacement from the start of
   * the move that `physics/motion` reports — a renderer wants where the car is, not how far
   * it has come.
   */
  kinematicsAt(t: SimTime): Kinematics {
    const motion = this.#motion;
    if (motion === undefined) {
      return Object.freeze({ position: this.#floor.heightM, velocity: 0, acceleration: 0 });
    }
    const state = profileKinematicsAt(motion.profile, t - motion.startedAt);
    return Object.freeze({
      position: motion.fromHeightM + state.position,
      velocity: state.velocity,
      acceleration: state.acceleration,
    });
  }

  /**
   * Whether the car is free to start: not already moving, doors shut, and not overloaded.
   *
   * The overload term is the safety interlock from docs/02-elevator-reference.md § Load
   * weighing behavior — at ~110% of rated load the doors are held open and the car will not
   * start — and it is checked here rather than left to the dispatcher because it is a car
   * function that no dispatcher setting may override.
   */
  get canStart(): boolean {
    return this.#motion === undefined && this.#door.state === 'closed' && this.loadSensor.canStart;
  }

  /**
   * Begin a move to `floorId`, building the S-curve profile for it.
   *
   * The returned {@link CarMotion} carries the three times the kernel needs: `commandedAt`,
   * `startedAt` (after the motor start delay) and `arrivesAt` (after levelling). Schedule the
   * arrival event at `arrivesAt` and call {@link completeArrival} when it fires.
   *
   * @throws ModelError if the car is already moving, its doors are not shut, it is
   *   overloaded, the shaft does not serve `floorId`, or the car is already there.
   */
  departFor(floorId: string, at: SimTime = this.now()): CarMotion {
    if (this.#motion !== undefined) {
      throw new ModelError(
        `Car "${this.id}" is already travelling to "${this.#motion.toFloorId}" and cannot depart for "${floorId}".`,
      );
    }
    if (this.#door.state !== 'closed') {
      throw new ModelError(
        `Car "${this.id}" cannot depart for "${floorId}" with its doors ${this.#door.state}.`,
      );
    }
    if (this.loadSensor.isOverloaded) {
      throw new ModelError(
        `Car "${this.id}" is overloaded (load factor ${this.loadSensor.loadFactor.toFixed(3)} >= ${this.loadSensor.overloadThreshold}); the doors are held open and the car will not start.`,
      );
    }
    const target = shaftFloor(this.shaft, floorId);
    if (target === undefined) {
      throw new ModelError(
        `Car "${this.id}" cannot depart for "${floorId}": its shaft does not serve that floor.`,
      );
    }
    if (target.id === this.#floor.id) {
      throw new ModelError(`Car "${this.id}" is already at floor "${floorId}".`);
    }
    if (!Number.isFinite(at)) {
      throw new ModelError(`Car "${this.id}" needs a finite departure time; received ${at}.`);
    }

    const profile = buildProfile(target.heightM - this.#floor.heightM, this.constraints);
    const startedAt = at + this.spec.motorStartDelayS;
    const motion: CarMotion = Object.freeze({
      profile,
      fromFloorId: this.#floor.id,
      fromFloorIndex: this.#floor.index,
      fromHeightM: this.#floor.heightM,
      toFloorId: target.id,
      toFloorIndex: target.index,
      toHeightM: target.heightM,
      commandedAt: at,
      startedAt,
      arrivesAt: startedAt + profile.duration + this.spec.levelingSettleS,
      direction: target.index > this.#floor.index ? 'up' : 'down',
    });

    this.#motion = motion;
    this.#direction = motion.direction;
    this.#departures += 1;
    return motion;
  }

  /**
   * Complete the move in progress: the car is levelled at its destination.
   *
   * Settles the run direction afterwards — kept if a committed stop still lies ahead in it,
   * reversed if the remaining stops are all behind, dropped if there is nothing left to do.
   * That is one reversal per run, and it is geometry rather than dispatch policy; see the
   * `estimateCost.ts` docstring.
   *
   * @throws ModelError if no move is in progress or `at` precedes the arrival time.
   *
   * @returns what the move cost, for the energy proxy — see {@link CarTravel}. Returning it is
   *   what makes the travel record possible at all: `#motion` is cleared here, so a caller that
   *   wanted the displacement afterwards would have to reconstruct it from floor heights, and a
   *   cumulative odometer read at the end of the run cannot be windowed.
   */
  completeArrival(at: SimTime = this.now()): CarTravel {
    const motion = this.#motion;
    if (motion === undefined) {
      throw new ModelError(`Car "${this.id}" is not moving and has no arrival to complete.`);
    }
    if (at < motion.arrivesAt - ARRIVAL_EPSILON_S) {
      throw new ModelError(
        `Car "${this.id}" arrives at t=${motion.arrivesAt} and cannot complete its arrival at t=${at}.`,
      );
    }
    const target = this.shaft.floorsById.get(motion.toFloorId);
    /* c8 ignore next 4 -- unreachable: `departFor` resolved the floor from this same shaft. */
    if (target === undefined) {
      throw new ModelError(
        `Car "${this.id}" arrived at "${motion.toFloorId}", which its shaft no longer serves.`,
      );
    }

    this.#distanceTravelledM += motion.profile.distanceM;
    this.#floor = target;
    this.#motion = undefined;
    this.#settleDirection();

    return Object.freeze({
      distanceM: motion.profile.distanceM,
      direction: motion.direction,
      loadKg: this.loadSensor.massKg,
      ratedLoadKg: this.loadSensor.ratedLoadKg,
    });
  }

  /* ---------------------------------------------------------------- *
   * Doors
   * ---------------------------------------------------------------- */

  /** The door's complete state. Immutable. */
  get door(): DoorMachineState {
    return this.#door;
  }

  get doorState(): DoorState {
    return this.#door.state;
  }

  /** True while a stop is in progress — the door is not shut. */
  get isStopped(): boolean {
    return isDoorMoving(this.#door);
  }

  /** How far open the door is at `t`, 0 (shut) to 1. Closed form, for the renderer. */
  doorOpenFractionAt(t: SimTime): number {
    return doorOpenFractionAt(this.#door, t, this.doorConfig);
  }

  /**
   * When the door next moves on its own, or `undefined` if it is at rest — the value to hand
   * to `kernel.schedule()`.
   *
   * **It never reports a transition the overload interlock will refuse.** While
   * {@link doorsHeldByOverload} the only automatic transition left is a door *finishing its
   * opening*: that carries it into the state the interlock wants it in, and it is exactly what
   * {@link advanceDoorsTo} will do. The close of an open door, and the completion of a close
   * already under way, are both held, so both report `undefined` — there is nothing to
   * schedule and the car cannot leave. They resume the moment enough mass steps out.
   *
   * Reporting the held close instead (the bug this replaced) put this accessor and
   * `advanceDoorsTo` into disagreement: the kernel was told to wake for a transition that the
   * interlock then had to swallow, or — worse, before `advanceDoorsTo` was fixed — did not.
   */
  nextDoorTransitionAt(): SimTime | undefined {
    const next = nextDoorTransition(this.#door, this.doorConfig);
    if (next === undefined || !this.doorsHeldByOverload) return next;
    return this.#door.state === 'opening' ? next : undefined;
  }

  /**
   * Whether the overload interlock is currently holding the doors.
   *
   * True for **every** open-ended door state — `opening`, `open` and `closing` — not just
   * `open`, because the interlock is a statement about the load, not about how far through a
   * stop the door happens to be. A car that crosses the threshold while its doors are still
   * opening is just as overloaded as one that crosses it standing open.
   */
  get doorsHeldByOverload(): boolean {
    return this.#door.state !== 'closed' && this.loadSensor.isOverloaded;
  }

  /**
   * Open up at the current floor.
   *
   * The stop reason is derived from the car's own state — a car call registered here, a hall
   * call assigned here, the passengers aboard who get out here, the boarders those hall calls
   * imply — and merged with anything the caller adds, so a dispatcher can declare a counted
   * hall queue without having to restate what the car already knows. The derived reason
   * carries the same passenger-transfer term {@link route} priced the stop with, so the stop
   * the car performs is the stop it quoted.
   *
   * Registering here also **extinguishes the car-call button for this floor**: the light
   * going out when the car opens up is car-controller behaviour, not a dispatch decision.
   */
  openDoors(at: SimTime = this.now(), reason?: DoorStopReason | undefined): DoorStep {
    if (this.#motion !== undefined) {
      throw new ModelError(
        `Car "${this.id}" cannot open its doors while travelling to "${this.#motion.toFloorId}".`,
      );
    }
    const derived = this.#stopReasonHere();
    const merged = reason === undefined ? derived : mergeStopReasons(derived, reason);
    const step = applyDoorCommand(this.#door, { kind: 'open', reason: merged }, at, this.doorConfig);
    const opening = this.#door.state === 'closed';
    this.#door = step.state;
    if (opening) this.#stopsServed += 1;
    this.#carCalls.delete(this.#floor.id);
    // Serving a stop can be the thing that leaves nothing ahead, so the run direction is
    // re-settled here as well as on arrival.
    this.#settleDirection();
    return step;
  }

  /**
   * Photo-eye interruption or late arrival.
   *
   * The car does **not** decide whether an obstruction happened: that draw belongs to the
   * caller and comes from the injected `StreamSet`'s `doorObstruction` stream. Putting it
   * here would couple every door to a generator and break common random numbers the moment
   * one configuration reopened more often than another (CLAUDE.md invariant 2).
   */
  requestReopen(
    cause: DoorReopenCause,
    at: SimTime = this.now(),
    reason?: DoorStopReason | undefined,
  ): DoorStep {
    const step = applyDoorCommand(
      this.#door,
      { kind: 'reopen', cause, ...(reason === undefined ? {} : { reason }) },
      at,
      this.doorConfig,
    );
    this.#door = step.state;
    return step;
  }

  /**
   * End the dwell now — the door-close button, or a dispatcher cutting a stop short.
   *
   * @throws ModelError while the car is overloaded. The doors are held open; a caller that
   *   wants to close them has to shed load first. Check {@link doorsHeldByOverload}.
   */
  closeDoors(at: SimTime = this.now()): DoorStep {
    if (this.loadSensor.isOverloaded) {
      throw new ModelError(
        `Car "${this.id}" is overloaded (load factor ${this.loadSensor.loadFactor.toFixed(3)} >= ${this.loadSensor.overloadThreshold}); the doors are held open until enough mass leaves.`,
      );
    }
    const step = applyDoorCommand(this.#door, { kind: 'close' }, at, this.doorConfig);
    this.#door = step.state;
    return step;
  }

  /**
   * Run the door forward to `at`, firing every automatic transition due on the way.
   *
   * This is what a door event handler calls; the transitions come back in chronological order
   * for the trace and the metrics layer. It does **not** end a dwell early — that is
   * {@link closeDoors} — so it can never shorten a stop the door had already granted.
   *
   * It is safe to call late or coalesced: `advanceDoor` replays every transition due in
   * between, so one call at `t = 60` gives the state a hundred intermediate wake-ups would
   * have. **The overload interlock has to be applied to that replay, not to the door's state
   * on entry**, because a single call can otherwise walk `opening → open → closing → closed`
   * internally and shut the doors of an overloaded car on the way past. So while
   * {@link doorsHeldByOverload}, time is only run on to the instant the door reaches fully
   * open, and never further: a door still opening finishes opening, and a door that is open or
   * closing stands exactly where it is.
   */
  advanceDoorsTo(at: SimTime = this.now()): DoorStep {
    const limit = this.#interlockedDoorTime(at);
    if (limit === undefined) {
      // Held. The door stays where it is and its dwell clock is not consumed; when the load
      // drops below the threshold the accumulated hold is charged as dwell, which is what it
      // was — the door really was standing open the whole time.
      return Object.freeze({ state: this.#door, events: Object.freeze([]) });
    }
    const step = advanceDoor(this.#door, limit, this.doorConfig);
    this.#door = step.state;
    return step;
  }

  /* ---------------------------------------------------------------- *
   * Calls
   * ---------------------------------------------------------------- */

  /** Registered car calls, in registration order. */
  get carCalls(): readonly CarCall[] {
    return [...this.#carCalls.values()];
  }

  /** Hall calls the group controller has allocated to this car, in allocation order. */
  get assignedHallCalls(): readonly HallCall[] {
    return [...this.#hallCalls.values()];
  }

  /** Whether a destination is registered inside the car. */
  hasCarCall(floorId: string): boolean {
    return this.#carCalls.has(floorId);
  }

  /**
   * Press a floor button inside the car.
   *
   * Idempotent, and deliberately does **not** refresh `registeredAt` — a second press of a
   * lit button is not a new call, and treating it as one would erase exactly the waiting time
   * a starvation term is meant to see.
   *
   * @throws ModelError if the mode does not honour car calls, or the shaft does not serve
   *   the floor. The second is a safety interlock: a button for a floor this shaft cannot
   *   reach does not exist in the car.
   */
  registerCarCall(floorId: string, at: SimTime = this.now()): CarCall {
    if (!acceptsCarCalls(this.#mode)) {
      throw new ModelError(
        `Car "${this.id}" is in mode "${this.#mode}" and does not honour car calls.`,
      );
    }
    const existing = this.#carCalls.get(floorId);
    if (existing !== undefined) return existing;

    const floor = shaftFloor(this.shaft, floorId);
    if (floor === undefined) {
      throw new ModelError(
        `Car "${this.id}" has no button for floor "${floorId}": its shaft does not serve it.`,
      );
    }
    if (!Number.isFinite(at)) {
      throw new ModelError(`Car "${this.id}" needs a finite car-call time; received ${at}.`);
    }

    const call: CarCall = Object.freeze({
      floorId: floor.id,
      floorIndex: floor.index,
      registeredAt: at,
    });
    this.#carCalls.set(floor.id, call);
    if (this.#motion === undefined) this.#settleDirection();
    return call;
  }

  /** Extinguish a car-call button. @returns `true` if one was lit. */
  clearCarCall(floorId: string): boolean {
    return this.#carCalls.delete(floorId);
  }

  /**
   * Accept a hall call the group controller allocated to this car.
   *
   * The car does not choose its hall calls and has no veto beyond feasibility — allocation is
   * the group controller's job. What it does do is refuse a call it physically cannot serve,
   * which is a safety interlock rather than an opinion.
   *
   * @throws ModelError if the mode does not accept hall calls or the shaft does not serve
   *   the floor.
   */
  assignHallCall(call: HallCall): void {
    if (!acceptsHallCalls(this.#mode)) {
      throw new ModelError(
        `Car "${this.id}" is in mode "${this.#mode}" and cannot be allocated hall call "${call.id}".`,
      );
    }
    if (!this.shaft.floorsById.has(call.floorId)) {
      throw new ModelError(
        `Car "${this.id}" cannot serve hall call "${call.id}" at floor "${call.floorId}": its shaft does not serve that floor.`,
      );
    }
    this.#hallCalls.set(call.id, call);
    if (this.#motion === undefined) this.#settleDirection();
  }

  /**
   * Hand a hall call back — reassignment, or a car crossing its bypass threshold.
   *
   * @returns `true` if this car held it.
   */
  releaseHallCall(callId: string): boolean {
    return this.#hallCalls.delete(callId);
  }

  /** Hand back every assigned hall call, e.g. when the load sensor trips bypass. */
  releaseAllHallCalls(): readonly HallCall[] {
    const released = [...this.#hallCalls.values()];
    this.#hallCalls.clear();
    return released;
  }

  /* ---------------------------------------------------------------- *
   * Load
   * ---------------------------------------------------------------- */

  /** Everyone aboard, in boarding order. A copy. */
  get passengers(): readonly Passenger[] {
    return [...this.#passengers];
  }

  /** What the load cell reads: the sum of real passenger masses, kilograms. */
  get loadKg(): number {
    return this.loadSensor.massKg;
  }

  /** `loadKg / ratedLoadKg`. */
  get loadFactor(): number {
    return this.loadSensor.loadFactor;
  }

  /** At or above 80% of rated load: no new hall calls, existing car calls still served. */
  get isBypassingHallCalls(): boolean {
    return this.loadSensor.isBypassingHallCalls;
  }

  /** At or above 110% of rated load: doors held open, the car will not start. */
  get isOverloaded(): boolean {
    return this.loadSensor.isOverloaded;
  }

  /**
   * Board a passenger: the load cell picks up their mass, and by default their destination
   * button is pressed.
   *
   * Boarding an overloaded car is allowed — that is how a car *becomes* overloaded, and the
   * alarm is the consequence, not a precondition. A caller that wants to fill a car to the
   * *design* load rather than to the alarm asks the cell first
   * (`car.loadSensor.remainingToDesignLoadKg`, the 80% rule from
   * docs/02-elevator-reference.md); a caller that overshoots anyway gets the interlock, and
   * {@link disembark} is how somebody steps back out of it.
   *
   * **Crossing the threshold trips the alarm here.** If the mass arrives while the doors are
   * closing, they are put back open: that is the "doors held open" half of the interlock, and
   * it has to happen at the instant the load crosses rather than at the next wake-up, or the
   * replay would depend on how often the caller happened to look. The reversal takes the
   * photo-eye's path — a safety reopen, never the `lateArrival` courtesy hold a dispatcher
   * profile may switch off.
   *
   * @returns the door transition the alarm caused, so a kernel-driven caller can emit it and
   *   reschedule from the new state; `undefined` when the alarm did not fire, which is every
   *   ordinary boarding.
   * @throws ModelError if the passenger is aboard already, or is bound for a floor this shaft
   *   does not serve (which would strand them).
   */
  board(
    passenger: Passenger,
    at: SimTime = this.now(),
    options: BoardOptions = {},
  ): DoorStep | undefined {
    if (!this.shaft.floorsById.has(passenger.destinationFloorId)) {
      throw new ModelError(
        `Car "${this.id}" cannot board passenger "${passenger.id}" bound for "${passenger.destinationFloorId}": its shaft does not serve that floor.`,
      );
    }
    passenger.board(at);
    this.#passengers.push(passenger);
    this.loadSensor.add(passenger);
    if (options.registerCarCall !== false) {
      this.registerCarCall(passenger.destinationFloorId, at);
    }
    return this.#soundOverloadAlarm(at);
  }

  /**
   * Alight a passenger at the current floor.
   *
   * @throws ModelError if they are not aboard, or their destination is not this floor —
   *   putting somebody out at the wrong floor would silently corrupt time-to-destination.
   */
  alight(passenger: Passenger, at: SimTime = this.now()): void {
    const index = this.#passengers.indexOf(passenger);
    if (index < 0) {
      throw new ModelError(`Passenger "${passenger.id}" is not aboard car "${this.id}".`);
    }
    if (passenger.destinationFloorId !== this.#floor.id) {
      throw new ModelError(
        `Passenger "${passenger.id}" is bound for "${passenger.destinationFloorId}" and cannot alight at "${this.#floor.id}".`,
      );
    }
    passenger.alight(at);
    this.#passengers.splice(index, 1);
    this.loadSensor.remove(passenger);
  }

  /**
   * Step a passenger **back out** of the car without completing their journey — how an
   * overloaded car sheds load.
   *
   * {@link alight} is the normal exit and insists the passenger is at their destination, so
   * that nobody can be put out at the wrong floor and silently corrupt time-to-destination.
   * That check makes it useless for the one state the interlock can produce: a car above
   * `overloadThreshold` will not start ({@link departFor}) and will not shut its doors
   * ({@link closeDoors}, {@link advanceDoorsTo}), so the *only* way out is for somebody to
   * step back onto the landing — at a floor that is, by construction, not their destination.
   * This is that operation.
   *
   * It is also the only sanctioned one. Reaching past the car into `loadSensor.remove()`
   * takes the mass off the cell but leaves the passenger on the car's list, so the sensor and
   * {@link committedStops} immediately disagree about who is aboard and the route goes on
   * pricing an alighting that can never happen.
   *
   * Two things it deliberately does **not** do:
   *
   * - **No journey record.** `Passenger.alight` is not called: this passenger did not arrive,
   *   and counting them as arrived would flatter every waiting-time and TTD statistic. Their
   *   `boardedAt` stands, and `Passenger.board` is write-once, so a runner that wants to put
   *   them back in the landing queue re-injects them as a fresh leg rather than re-boarding
   *   this object.
   * - **No call cleared.** The destination button they pressed stays lit, exactly as it would
   *   in a real car; {@link clearCarCall} is there for a caller that knows nobody is left for
   *   that floor.
   *
   * Takes no time argument, because it records nothing against the clock — that asymmetry
   * with `alight` is the point.
   *
   * @returns the mass removed, kilograms, so a caller shedding load knows how much it shed.
   * @throws ModelError if they are not aboard.
   */
  disembark(passenger: Passenger): number {
    const index = this.#passengers.indexOf(passenger);
    if (index < 0) {
      throw new ModelError(
        `Passenger "${passenger.id}" is not aboard car "${this.id}" and cannot step back out of it.`,
      );
    }
    this.#passengers.splice(index, 1);
    return this.loadSensor.remove(passenger);
  }

  /** Everyone aboard whose destination is the current floor, in boarding order. */
  alightingHere(): readonly Passenger[] {
    return this.#passengers.filter((p) => p.destinationFloorId === this.#floor.id);
  }

  /* ---------------------------------------------------------------- *
   * The pure cost query
   * ---------------------------------------------------------------- */

  /**
   * A frozen value describing everything a cost query is allowed to see.
   *
   * Cheap enough to build per call — the shaft and door config are shared by reference, and
   * only the committed stops are recomputed — which is what makes ten thousand hypothetical
   * evaluations per dispatch decision affordable.
   */
  snapshot(at: SimTime = this.now()): CarSnapshot {
    return Object.freeze({
      carId: this.id,
      bankId: this.bankId,
      at,
      mode: this.#mode,
      floorId: this.#floor.id,
      floorIndex: this.#floor.index,
      heightM: this.positionAt(at),
      direction: this.#direction,
      motion: this.#motion,
      door: this.#door,
      doorConfig: this.doorConfig,
      constraints: this.constraints,
      motorStartDelayS: this.spec.motorStartDelayS,
      levelingSettleS: this.spec.levelingSettleS,
      passengerTransferS: this.passengerTransferS,
      nominalPassengerMassKg: this.loadSensor.config.nominalPassengerMassKg,
      assumedBoardingPassengers: this.assumedBoardingPassengers,
      shaft: this.shaft,
      load: this.loadSensor.snapshot(),
      stops: this.committedStops(),
    });
  }

  /**
   * **Pure. No mutation. Safe to call thousands of times per decision.** CLAUDE.md invariant 1.
   *
   * A one-line delegation to a free function over a frozen snapshot, on purpose: everything
   * that could make it impure lives on `this`, and the estimator never receives `this`. See
   * `estimateCost.ts`.
   */
  estimateCost(request: CostRequest, at: SimTime = this.now()): CostEstimate {
    return estimateCostFor(this.snapshot(at), request);
  }

  /**
   * The stops this car is committed to, in the order it will physically reach them, with the
   * seconds until each.
   *
   * Pure with respect to the car: it is `projectRoute` over a snapshot.
   */
  route(at: SimTime = this.now()): readonly RouteStop[] {
    return projectRoute(this.snapshot(at));
  }

  /**
   * The floors the car must stop at, in floor-index order.
   *
   * The union of three things: registered car calls, allocated hall calls, and **the
   * destinations of the passengers aboard**. The third matters under destination entry, where
   * nobody presses a button inside the car — without it a boarded passenger would have no
   * stop and could never get out.
   */
  committedStops(): readonly CommittedStop[] {
    interface Accumulator {
      floor: ServedFloor;
      carCall: boolean;
      hallCall: boolean;
      hallCallDirections: Direction[];
      registeredAt: SimTime;
      alightingCount: number;
      alightingMassKg: number;
      boardingCount: number;
    }

    const byFloor = new Map<string, Accumulator>();
    const ensure = (floorId: string, registeredAt: SimTime): Accumulator | undefined => {
      const existing = byFloor.get(floorId);
      if (existing !== undefined) {
        existing.registeredAt = Math.min(existing.registeredAt, registeredAt);
        return existing;
      }
      const floor = this.shaft.floorsById.get(floorId);
      /* c8 ignore next -- every entry point validates the floor against this shaft. */
      if (floor === undefined) return undefined;
      const created: Accumulator = {
        floor,
        carCall: false,
        hallCall: false,
        hallCallDirections: [],
        registeredAt,
        alightingCount: 0,
        alightingMassKg: 0,
        boardingCount: 0,
      };
      byFloor.set(floorId, created);
      return created;
    };

    for (const call of this.#carCalls.values()) {
      const entry = ensure(call.floorId, call.registeredAt);
      if (entry !== undefined) entry.carCall = true;
    }
    for (const call of this.#hallCalls.values()) {
      const entry = ensure(call.floorId, call.registeredAt);
      if (entry === undefined) continue;
      entry.hallCall = true;
      if (!entry.hallCallDirections.includes(call.direction)) {
        entry.hallCallDirections.push(call.direction);
      }
      entry.boardingCount += this.assumedBoardingPassengers;
    }
    for (const passenger of this.#passengers) {
      const entry = ensure(passenger.destinationFloorId, passenger.boardedAt ?? passenger.arrivedAt);
      if (entry === undefined) continue;
      entry.carCall = true;
      entry.alightingCount += 1;
      entry.alightingMassKg += passenger.massKg;
    }

    return Object.freeze(
      [...byFloor.values()]
        .sort((a, b) => a.floor.index - b.floor.index)
        .map((entry) =>
          Object.freeze({
            floorId: entry.floor.id,
            floorIndex: entry.floor.index,
            heightM: entry.floor.heightM,
            carCall: entry.carCall,
            hallCall: entry.hallCall,
            // Up before down, so the array is a function of the set and not of arrival order.
            hallCallDirections: Object.freeze(
              (['up', 'down'] as const).filter((d) => entry.hallCallDirections.includes(d)),
            ),
            registeredAt: entry.registeredAt,
            alightingCount: entry.alightingCount,
            alightingMassKg: entry.alightingMassKg,
            boardingCount: entry.boardingCount,
          }),
        ),
    );
  }

  /* ---------------------------------------------------------------- *
   * Metrics and persistence
   * ---------------------------------------------------------------- */

  /** Metres travelled since the last reset. The raw input to any energy proxy. */
  get distanceTravelledM(): number {
    return this.#distanceTravelledM;
  }

  /** Moves commanded since the last reset. */
  get departures(): number {
    return this.#departures;
  }

  /** Stops made since the last reset — door openings, not floors passed. */
  get stopsServed(): number {
    return this.#stopsServed;
  }

  /**
   * The car's complete mutable state as a JSON-safe record.
   *
   * "Complete" is load-bearing: this is what the Phase 1 acceptance test compares before and
   * after ten thousand `estimateCost()` calls (docs/05-roadmap.md), so a field left out here
   * would turn that test into a token check. Everything that {@link reset} clears appears
   * below, `undefined` is written as `null` so key order and presence are stable, and nothing
   * derived-but-not-stored is included.
   */
  serialize(): CarRecord {
    const door = this.#door;
    const motion = this.#motion;
    return {
      id: this.id,
      bankId: this.bankId,
      mode: this.#mode,
      floorId: this.#floor.id,
      floorIndex: this.#floor.index,
      heightM: this.#floor.heightM,
      direction: this.#direction ?? null,
      motion:
        motion === undefined
          ? null
          : {
              fromFloorId: motion.fromFloorId,
              toFloorId: motion.toFloorId,
              commandedAt: motion.commandedAt,
              startedAt: motion.startedAt,
              arrivesAt: motion.arrivesAt,
              direction: motion.direction,
              displacementM: motion.profile.displacementM,
              durationS: motion.profile.duration,
              kind: motion.profile.kind,
              peakSpeedMps: motion.profile.peakSpeedMps,
              peakAccelerationMps2: motion.profile.peakAccelerationMps2,
            },
      door: {
        state: door.state,
        since: door.since,
        openFractionAtSince: door.openFractionAtSince,
        stopStartedAt: door.stopStartedAt ?? null,
        grantedDwellS: door.grantedDwellS,
        reopenCount: door.reopenCount,
        reason: {
          carCall: door.reason.carCall,
          hallCall: door.reason.hallCall,
          hallQueueLength: door.reason.hallQueueLength ?? null,
          transferSeconds: door.reason.transferSeconds ?? null,
        },
        accounting: {
          openingS: door.accounting.openingS,
          dwellS: door.accounting.dwellS,
          closingS: door.accounting.closingS,
          abortedClosingS: door.accounting.abortedClosingS,
          totalS: door.accounting.totalS,
          reopens: door.accounting.reopens,
          obstructions: door.accounting.obstructions,
          lateArrivals: door.accounting.lateArrivals,
          refusedReopens: door.accounting.refusedReopens,
        },
      },
      carCalls: [...this.#carCalls.values()].map((call) => ({
        floorId: call.floorId,
        floorIndex: call.floorIndex,
        registeredAt: call.registeredAt,
      })),
      assignedHallCalls: [...this.#hallCalls.values()].map((call) => ({
        id: call.id,
        floorId: call.floorId,
        floorIndex: call.floorIndex,
        direction: call.direction,
        registeredAt: call.registeredAt,
      })),
      passengers: this.#passengers.map((passenger) => ({
        id: passenger.id,
        massKg: passenger.massKg,
        destinationFloorId: passenger.destinationFloorId,
        boardedAt: passenger.boardedAt ?? null,
      })),
      loadKg: this.loadSensor.massKg,
      loadFactor: this.loadSensor.loadFactor,
      distanceTravelledM: this.#distanceTravelledM,
      departures: this.#departures,
      stopsServed: this.#stopsServed,
    };
  }

  /**
   * Drop every scrap of per-run state, leaving the car exactly as it was at t=0.
   *
   * `Building.reset` calls this between replications. A car that kept its position, load,
   * committed calls or service mode would make replication N+1 depend on replication N, which
   * shows up not as a crash but as serially correlated waiting-time samples and a confident
   * interval around the wrong number.
   */
  reset(): void {
    this.#mode = this.#initialMode;
    this.#floor = this.homeFloor;
    this.#motion = undefined;
    this.#direction = undefined;
    this.#door = createDoorState(0);
    this.#carCalls.clear();
    this.#hallCalls.clear();
    this.#passengers = [];
    this.loadSensor.reset();
    this.#distanceTravelledM = 0;
    this.#departures = 0;
    this.#stopsServed = 0;
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /**
   * How far the door may be run on, or `undefined` if the overload interlock forbids moving it
   * at all.
   *
   * The interlock's guarantee is one sentence: **while the car is overloaded the door may
   * reach `open`, and may never go past it.** A door still opening is therefore let run to the
   * instant it is fully open — and no further, so the dwell that follows is not consumed — and
   * an `open` or `closing` door does not move.
   *
   * Capping the *time* rather than checking the *state on entry* is what makes it robust: the
   * hole this replaced was that `advanceDoor` replays a whole chain of transitions inside one
   * call, so a check that only looked at the state it was handed was blind to the `open →
   * closing → closed` that call went on to perform.
   */
  #interlockedDoorTime(at: SimTime): SimTime | undefined {
    if (!this.doorsHeldByOverload) return at;
    if (this.#door.state !== 'opening') return undefined;
    const opensAt = nextDoorTransition(this.#door, this.doorConfig);
    /* c8 ignore next -- an opening door always has its completion as a next transition. */
    if (opensAt === undefined) return at;
    return Math.min(at, opensAt);
  }

  /**
   * The overload alarm, at the instant the load crossed the threshold: if the doors are
   * closing, put them back.
   *
   * A no-op unless the car is overloaded *and* a close is under way — an `opening` or `open`
   * door is already where the interlock wants it and is held there by
   * {@link advanceDoorsTo}, and a `closed` door is between stops, where reopening would start
   * a new stop and reset the door's accounting rather than continue this one.
   *
   * The reversal is issued as a photo-eye `obstruction` reopen. That is the door module's one
   * non-negotiable path — `lateArrival` is a courtesy hold a dispatcher profile may switch
   * off, and a safety interlock that a profile could switch off is not a safety interlock. It
   * is still bounded by `maxReopensPerStop` (real controllers nudge shut after repeated
   * interruptions); when that budget is spent the reversal is refused and the door simply
   * stands where it is, because {@link advanceDoorsTo} will not complete the close either way.
   */
  #soundOverloadAlarm(at: SimTime): DoorStep | undefined {
    if (this.#door.state !== 'closing' || !this.loadSensor.isOverloaded) return undefined;
    const step = applyDoorCommand(
      this.#door,
      { kind: 'reopen', cause: 'obstruction' },
      at,
      this.doorConfig,
    );
    this.#door = step.state;
    return step;
  }

  /**
   * Why the car is stopped here, and what that stop has to accommodate.
   *
   * Every term comes from state the car already owns, and they are the same terms
   * `projectRoute` prices the stop with — which is the point. The car must **perform the stop
   * it quoted**: `route()` charges `openS + dwell + closeS` with the dwell driven by
   * `(alighting + boarding) * passengerTransferS`, so a derived reason that omitted the
   * transfer term would execute an 8.0 s stop where the estimate said 14.6 s. That gap is
   * precisely the `2*P*tp` term of the Barney/CIBSE round-trip-time calculation that
   * CLAUDE.md names as the project's correctness oracle, and dropping it makes every
   * `etaSeconds` a systematic over-estimate of the car's own behaviour.
   *
   * The boarding side uses `assumedBoardingPassengers` per hall call held here, exactly as
   * {@link committedStops} does, because that is the number the route was priced with. A
   * caller that has counted the queue passes the real figure to {@link openDoors} and
   * `mergeStopReasons` takes the larger, so the assumption is a floor rather than a claim.
   */
  #stopReasonHere(): DoorStopReason {
    const floorId = this.#floor.id;
    let hallCall = false;
    let boarding = 0;
    for (const call of this.#hallCalls.values()) {
      if (call.floorId !== floorId) continue;
      hallCall = true;
      boarding += this.assumedBoardingPassengers;
    }
    let alighting = 0;
    for (const passenger of this.#passengers) {
      if (passenger.destinationFloorId === floorId) alighting += 1;
    }
    return {
      carCall: this.#carCalls.has(floorId) || alighting > 0,
      hallCall,
      hallQueueLength: boarding,
      transferSeconds: (alighting + boarding) * this.passengerTransferS,
    };
  }

  /**
   * Point the car at the work it has left: keep the run direction while a stop lies ahead in
   * it, reverse when the remaining stops are all behind, and go directionless when there is
   * nothing to do.
   */
  #settleDirection(): void {
    const stops = this.committedStops();
    const index = this.#floor.index;
    const ahead = (direction: Direction): boolean => {
      const sign = direction === 'up' ? 1 : -1;
      return stops.some((stop) => sign * (stop.floorIndex - index) > 0);
    };

    const current = this.#direction;
    if (current !== undefined) {
      if (ahead(current)) return;
      const reversed = oppositeDirection(current);
      this.#direction = ahead(reversed) ? reversed : undefined;
      return;
    }
    this.#direction = stops.some((stop) => stop.floorIndex !== index)
      ? directionTowardNearestStop(stops, index, this.#floor.heightM)
      : undefined;
  }
}

/**
 * Tolerance on "has the car arrived yet".
 *
 * `arrivesAt` is a sum of a motor delay, a profile duration derived through a cube root, and
 * a levelling time, so a kernel timestamp reconstructed from it can land a few ulps short.
 * A nanosecond of simulated time is far below anything the model resolves, and rejecting an
 * arrival for it would be a spurious failure.
 */
const ARRIVAL_EPSILON_S = 1e-9;

function requireNonNegative(value: number, field: string, carId: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ModelError(
      `Car "${carId}": ${field} must be a finite non-negative number; received ${value}.`,
    );
  }
  return value;
}

/* -------------------------------------------------------------------------- *
 * Persistence record
 * -------------------------------------------------------------------------- */

/** A move in progress, as a JSON-safe record. The profile is a function of these numbers. */
export interface CarMotionRecord {
  readonly fromFloorId: string;
  readonly toFloorId: string;
  readonly commandedAt: SimTime;
  readonly startedAt: SimTime;
  readonly arrivesAt: SimTime;
  readonly direction: Direction;
  readonly displacementM: number;
  readonly durationS: number;
  readonly kind: string;
  readonly peakSpeedMps: number;
  readonly peakAccelerationMps2: number;
}

/** The door, as a JSON-safe record. `undefined` is written as `null`. */
export interface CarDoorRecord {
  readonly state: DoorState;
  readonly since: SimTime;
  readonly openFractionAtSince: number;
  readonly stopStartedAt: SimTime | null;
  readonly grantedDwellS: number;
  readonly reopenCount: number;
  readonly reason: {
    readonly carCall: boolean;
    readonly hallCall: boolean;
    readonly hallQueueLength: number | null;
    readonly transferSeconds: number | null;
  };
  readonly accounting: {
    readonly openingS: number;
    readonly dwellS: number;
    readonly closingS: number;
    readonly abortedClosingS: number;
    readonly totalS: number;
    readonly reopens: number;
    readonly obstructions: number;
    readonly lateArrivals: number;
    readonly refusedReopens: number;
  };
}

/**
 * The car's complete mutable state, JSON-safe.
 *
 * Written by {@link Car.serialize}. This is the value the Phase 1 acceptance criterion
 * compares byte for byte across ten thousand `estimateCost()` calls, and the value a run
 * record persists so a replication can be replayed from its seed (CLAUDE.md invariant 5).
 */
export interface CarRecord {
  readonly id: string;
  readonly bankId: string;
  readonly mode: ServiceMode;
  readonly floorId: string;
  readonly floorIndex: number;
  readonly heightM: number;
  readonly direction: Direction | null;
  readonly motion: CarMotionRecord | null;
  readonly door: CarDoorRecord;
  readonly carCalls: readonly {
    readonly floorId: string;
    readonly floorIndex: number;
    readonly registeredAt: SimTime;
  }[];
  readonly assignedHallCalls: readonly {
    readonly id: string;
    readonly floorId: string;
    readonly floorIndex: number;
    readonly direction: Direction;
    readonly registeredAt: SimTime;
  }[];
  readonly passengers: readonly {
    readonly id: string;
    readonly massKg: number;
    readonly destinationFloorId: string;
    readonly boardedAt: SimTime | null;
  }[];
  readonly loadKg: number;
  readonly loadFactor: number;
  readonly distanceTravelledM: number;
  readonly departures: number;
  readonly stopsServed: number;
}

/**
 * One completed move, as {@link Car.completeArrival} reports it.
 *
 * The raw input to the energy proxy, and deliberately **raw**: no work, no joules, no
 * counterweight. `metrics/types.ts` owns `COUNTERWEIGHT_BALANCE_RATIO` and `outOfBalanceWorkJ`,
 * and `metrics` already imports `model` — the reverse import would be a cycle, and more to the
 * point a car is a mechanism rather than a meter. It reports what it did; the recorder prices it.
 *
 * Structurally identical to `metrics/types.ts`'s `TravelReading`, which is why the recorder takes
 * one without a cast, in the same way `Passenger` satisfies `RecordablePassenger`.
 */
export interface CarTravel {
  /** Metres travelled, always positive. */
  readonly distanceM: number;
  readonly direction: Direction;
  /**
   * Passenger mass aboard for the whole move, kg.
   *
   * Exact rather than averaged: a stop is the only thing that changes a car's load, and a car
   * that is moving is not stopped, so the load was constant across the move by construction.
   */
  readonly loadKg: number;
  readonly ratedLoadKg: number;
}
