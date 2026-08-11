/**
 * The ten things that can happen in a run, as kernel events.
 *
 * The whole simulation is these and nothing else. There is no tick, no polling loop and no
 * "advance by dt": the clock jumps from one of these to the next, which is what makes a
 * two-hour replication cost a few thousand steps instead of seventy-two thousand
 * (docs/01-architecture.md § Simulation kernel).
 *
 * | Event | Fired when | What it does |
 * |---|---|---|
 * | `sim.batchArrival` | a trace batch's time comes | materializes its passengers, lights the buttons, runs dispatch |
 * | `sim.transferArrival` | a sky-lobby walk completes | re-injects the journey's next leg as a fresh arrival |
 * | `sim.transportArrival` | a journey's *opening* escalator or stair hop completes | admits its first lift leg at the far landing |
 * | `sim.dispatchTick` | a defer window closes, or a call is due to be re-offered | runs stages 2–5 for one bank |
 * | `sim.carArrived` | a car is levelled | completes the move and asks the car what to do next |
 * | `sim.carDoor` | the door's next automatic transition is due | runs the door forward; transfers passengers when it reaches open |
 * | `sim.queueSample` | a sample point on the demand horizon | records the building-wide queue length |
 * | `sim.serviceChange` | a `serviceEvents` entry's time comes | changes a car's service mode and re-offers whatever it had to drop |
 * | `sim.abandonment` | a waiting leg's drawn patience runs out | the rider leaves the landing, and the call goes with them if nobody else holds it |
 * | `sim.intervention` | a `SimulationConfig.interventions` entry's time comes | walks the fleet's idle cars through stage 7 under the newly in-force override |
 *
 * ## Why the payloads are ids and not objects
 *
 * Every payload names its subject by id rather than carrying the object. An event scheduled at
 * `t` and fired at `t` is separated by every state change in between, and a payload holding a
 * `Passenger` or a `Car` is a snapshot of a world that has moved on. Ids force the handler to
 * look the subject up in the state that exists when it actually runs — the same reason
 * `Car.estimateCost` takes a snapshot rather than a car.
 *
 * Nothing here reads a wall clock or draws a random number; both belong to the handlers the
 * simulation supplies (CLAUDE.md invariants 2 and 3).
 */

import { createEvent, type EventHandler, type SimEvent, type SimTime } from '../kernel/index.js';

/* -------------------------------------------------------------------------- *
 * Type labels
 * -------------------------------------------------------------------------- */

/**
 * The event `type` labels this module emits.
 *
 * Labels never participate in ordering — the queue's total order is `(time, sequence)` — so
 * these exist for traces, metrics and debugging only.
 */
export const SIM_EVENT_TYPES = Object.freeze({
  batchArrival: 'sim.batchArrival',
  transferArrival: 'sim.transferArrival',
  transportArrival: 'sim.transportArrival',
  dispatchTick: 'sim.dispatchTick',
  carArrived: 'sim.carArrived',
  carDoor: 'sim.carDoor',
  queueSample: 'sim.queueSample',
  serviceChange: 'sim.serviceChange',
  abandonment: 'sim.abandonment',
  intervention: 'sim.intervention',
} as const);

export type SimEventType = (typeof SIM_EVENT_TYPES)[keyof typeof SIM_EVENT_TYPES];

/** Every label above, in declaration order. For exhaustiveness checks and traces. */
export const SIM_EVENT_TYPE_IDS: readonly SimEventType[] = Object.freeze(
  Object.values(SIM_EVENT_TYPES),
);

/* -------------------------------------------------------------------------- *
 * Payloads
 * -------------------------------------------------------------------------- */

/**
 * A batch of passengers arriving together at one landing.
 *
 * Indexed into `trace.arrivals` rather than carrying the batch, so a handler cannot be handed
 * a batch from a different trace than the one the run is driving.
 */
export interface BatchArrivalPayload {
  /** Index into `PassengerTrace.arrivals`. */
  readonly batchIndex: number;
}

/**
 * A passenger who has finished walking across a sky lobby and is ready to wait again.
 *
 * Names the leg that *just ended*, not the one about to begin: the next leg does not exist
 * until this fires, so that its `arrivedAt` is the simulated time it really started waiting
 * and its waiting time is its own rather than inherited.
 */
export interface TransferArrivalPayload {
  /** Id of the completed leg whose journey continues. */
  readonly fromLegId: string;
}

/**
 * A journey that begins on something that is not a lift, arriving at the landing where its
 * first lift leg starts.
 *
 * Indexed into `PassengerTrace.passengers` for the reason {@link BatchArrivalPayload} gives:
 * the handler must read the trace the run is actually driving. A *mid-journey* hop needs no
 * event of its own — it is a different number of seconds on the transfer that already exists —
 * and a hop that *ends* a journey needs none either, because it is a constant added to the
 * completion instant. Only the opening hop has no leg to hang itself on, which is why this is
 * one event and not three.
 */
export interface TransportArrivalPayload {
  /** Index into `PassengerTrace.passengers`. */
  readonly passengerIndex: number;
}

/** One bank's group controller is due to look at its live calls. */
export interface DispatchTickPayload {
  readonly bankId: string;
  /** The time this tick was scheduled for. Lets the handler drop its own de-duplication key. */
  readonly dueAt: SimTime;
}

/** A car event — arrival or door transition — by car id. */
export interface CarEventPayload {
  readonly carId: string;
}

/** A point on the queue-sampling grid. */
export interface QueueSamplePayload {
  /** 0-based position on the grid, for tracing. */
  readonly index: number;
}

/**
 * One entry of the building's `serviceEvents` schedule coming due.
 *
 * Indexed into `ResolvedBuilding.serviceEvents` for the reason the batch payload gives: the
 * handler must read the schedule the run is actually driving, and an index cannot be a stale
 * copy of an entry from a different building.
 */
export interface ServiceChangePayload {
  /** Index into `ResolvedBuilding.serviceEvents`. */
  readonly index: number;
}

/**
 * One entry of the run's `interventions` log coming due (Everyday Mode contract § 1.4).
 *
 * Indexed into `SimulationConfig.interventions` for the reason every other payload gives: the
 * handler must read the log the run is actually driving, and an index cannot be a stale copy of
 * an entry from a different record.
 */
export interface InterventionPayload {
  /** Index into `SimulationConfig.interventions`. */
  readonly index: number;
}

/**
 * A waiting leg's patience running out (docs/14 § 3.1).
 *
 * Names the **leg** by id rather than carrying the `Passenger`, for the reason at the head of
 * this module: between scheduling and firing the rider may have boarded, alighted, or had their
 * whole journey end, and a payload holding the object would describe a landing they left minutes
 * ago. The handler looks the leg up and does nothing at all unless it is still standing there.
 */
export interface AbandonmentPayload {
  /** Id of the waiting leg whose patience has expired. */
  readonly legId: string;
}

/* -------------------------------------------------------------------------- *
 * Constructors
 * -------------------------------------------------------------------------- */

/**
 * A trace batch reaching its landing.
 *
 * Every passenger in the batch appears at the same instant and shares one button press: a
 * batch of four is one hall call and four transfer times, not four hall calls
 * (CLAUDE.md § modelling rules).
 */
export function batchArrivalEvent(
  payload: BatchArrivalPayload,
  handler: EventHandler<BatchArrivalPayload>,
): SimEvent<BatchArrivalPayload> {
  return createEvent(SIM_EVENT_TYPES.batchArrival, payload, handler);
}

/** A sky-lobby walk completing, so the journey's next leg joins a queue. */
export function transferArrivalEvent(
  payload: TransferArrivalPayload,
  handler: EventHandler<TransferArrivalPayload>,
): SimEvent<TransferArrivalPayload> {
  return createEvent(SIM_EVENT_TYPES.transferArrival, payload, handler);
}

/** An opening escalator or stair hop completing, so the journey's first lift leg joins a queue. */
export function transportArrivalEvent(
  payload: TransportArrivalPayload,
  handler: EventHandler<TransportArrivalPayload>,
): SimEvent<TransportArrivalPayload> {
  return createEvent(SIM_EVENT_TYPES.transportArrival, payload, handler);
}

/** A bank's group controller running stages 2 to 5 over its live calls. */
export function dispatchTickEvent(
  payload: DispatchTickPayload,
  handler: EventHandler<DispatchTickPayload>,
): SimEvent<DispatchTickPayload> {
  return createEvent(SIM_EVENT_TYPES.dispatchTick, payload, handler);
}

/** A car levelled at its destination. Scheduled at `CarMotion.arrivesAt`. */
export function carArrivedEvent(
  payload: CarEventPayload,
  handler: EventHandler<CarEventPayload>,
): SimEvent<CarEventPayload> {
  return createEvent(SIM_EVENT_TYPES.carArrived, payload, handler);
}

/** The door's next automatic transition. Scheduled at `Car.nextDoorTransitionAt()`. */
export function carDoorEvent(
  payload: CarEventPayload,
  handler: EventHandler<CarEventPayload>,
): SimEvent<CarEventPayload> {
  return createEvent(SIM_EVENT_TYPES.carDoor, payload, handler);
}

/** A building-wide queue measurement. The direct input to saturation detection. */
export function queueSampleEvent(
  payload: QueueSamplePayload,
  handler: EventHandler<QueueSamplePayload>,
): SimEvent<QueueSamplePayload> {
  return createEvent(SIM_EVENT_TYPES.queueSample, payload, handler);
}

/**
 * A car changing service mode at a scheduled simulated time.
 *
 * The event that makes `Car.setMode` reachable from a configuration. Scheduled from
 * `ResolvedBuilding.serviceEvents` at `run()`, alongside the trace and the queue-sample grid, so
 * the time it fires at is the kernel's and never a wall clock (CLAUDE.md invariant 3).
 */
export function serviceChangeEvent(
  payload: ServiceChangePayload,
  handler: EventHandler<ServiceChangePayload>,
): SimEvent<ServiceChangePayload> {
  return createEvent(SIM_EVENT_TYPES.serviceChange, payload, handler);
}

/**
 * A waiting rider's patience running out, so they leave (docs/14 § 3.1).
 *
 * Scheduled at `admit` time from a value drawn **before the run started**, in trace order, so
 * that who gives up is a property of the crowd rather than of the dispatcher — see
 * `sim/patience.ts` for why the draw cannot be taken here. Never scheduled at all on a run that
 * declares no `sim.patience`, which is every run this repository has published.
 */
export function abandonmentEvent(
  payload: AbandonmentPayload,
  handler: EventHandler<AbandonmentPayload>,
): SimEvent<AbandonmentPayload> {
  return createEvent(SIM_EVENT_TYPES.abandonment, payload, handler);
}

/**
 * One intervention taking effect at its scheduled simulated time.
 *
 * The event exists for the already-parked fleet: the override itself is read by every later
 * `#park` decision whether or not this fires, but a car that is *currently* idle takes a stage 7
 * decision only when something asks it to, and without this event a fleet standing still at
 * `atS` would ignore *park the cars in the lobby* until the next arrival happened to free a car.
 * Scheduled from `SimulationConfig.interventions` at `run()`, beside the trace and the service
 * schedule, so its time is the kernel's and never a wall clock (CLAUDE.md invariant 3).
 */
export function interventionEvent(
  payload: InterventionPayload,
  handler: EventHandler<InterventionPayload>,
): SimEvent<InterventionPayload> {
  return createEvent(SIM_EVENT_TYPES.intervention, payload, handler);
}
