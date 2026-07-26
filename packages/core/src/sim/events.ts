/**
 * The six things that can happen in a run, as kernel events.
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
 * | `sim.dispatchTick` | a defer window closes, or a call is due to be re-offered | runs stages 2–5 for one bank |
 * | `sim.carArrived` | a car is levelled | completes the move and asks the car what to do next |
 * | `sim.carDoor` | the door's next automatic transition is due | runs the door forward; transfers passengers when it reaches open |
 * | `sim.queueSample` | a sample point on the demand horizon | records the building-wide queue length |
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
  dispatchTick: 'sim.dispatchTick',
  carArrived: 'sim.carArrived',
  carDoor: 'sim.carDoor',
  queueSample: 'sim.queueSample',
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
