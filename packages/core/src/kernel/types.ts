/**
 * Kernel vocabulary types.
 *
 * Invariants enforced here (see CLAUDE.md):
 *  - **No wall-clock time.** `SimTime` is *simulated* seconds and is only ever produced by
 *    the kernel. Nothing in `core/` may call `Date.now()`, `performance.now()` or any timer.
 *  - **Deterministic tie-breaking.** Every scheduled event carries a `sequence` assigned at
 *    `schedule()` time; the total order is `(time, sequence)`, never insertion order into a
 *    hash structure.
 */

/**
 * A point on the simulated clock, in **seconds**.
 *
 * Always sourced from the kernel — never from `Date.now()` or `performance.now()`.
 * A plain `number` by design: it is arithmetic-heavy and allocated millions of times.
 */
export type SimTime = number;

/**
 * Work performed when an event fires.
 *
 * Handlers are the only place in the simulation where state mutation belongs. They receive
 * the event's payload and a {@link EventContext} that exposes the clock and a narrow
 * scheduling interface for follow-up events.
 */
export type EventHandler<TPayload = unknown> = (
  payload: TPayload,
  context: EventContext,
) => void;

/**
 * A unit of simulated work, independent of *when* it happens.
 *
 * The same `SimEvent` value may be scheduled more than once; scheduling is what binds it to
 * a time and a sequence number (producing a {@link ScheduledEvent}).
 */
export interface SimEvent<TPayload = unknown> {
  /**
   * Stable label used for tracing, metrics and debugging — e.g. `'car.arrived'`.
   * Never participates in ordering.
   */
  readonly type: string;
  /** Structured detail handed to the handler when the event fires. */
  readonly payload: TPayload;
  /**
   * The work to perform.
   *
   * Declared as a *method* member deliberately: method parameters are compared bivariantly,
   * which is what lets `SimEvent<Whatever>` live in the kernel's single heterogeneous queue
   * as `SimEvent<unknown>`. Sound in practice because `payload` and `handler` are created
   * together and only ever recombined with each other.
   */
  handler(payload: TPayload, context: EventContext): void;
}

/**
 * A {@link SimEvent} bound to a time and a sequence number.
 *
 * `(time, sequence)` is the queue's total ordering key. `sequence` is assigned by the queue
 * at schedule time and is strictly increasing, so the order is total (no ties are possible)
 * and therefore fully deterministic.
 *
 * A `ScheduledEvent` doubles as the **cancellation handle** for the slot it occupies — pass
 * it to {@link EventScheduler.cancel} to invalidate the pending event.
 */
export interface ScheduledEvent<TPayload = unknown> {
  /** Simulated time at which the event fires. */
  readonly time: SimTime;
  /** Monotonically increasing counter assigned at schedule time. Breaks time ties. */
  readonly sequence: number;
  /** The work bound to this slot. */
  readonly event: SimEvent<TPayload>;
  /**
   * `true` once the slot has been cancelled and will never fire.
   *
   * Deliberately **not** writable through this interface: the queue keeps a live-event count
   * so `eventCount()` stays honest, and a caller flipping the flag by hand would desynchronize
   * it. Cancel through {@link EventScheduler.cancel}, which is the only writer.
   *
   * The slot keeps its `(time, sequence)` position while cancelled, so cancellation can never
   * perturb the order of the surviving events.
   */
  readonly cancelled: boolean;
}

/**
 * The narrow capability a running handler is given: read the clock, schedule more work,
 * cancel work it previously scheduled.
 *
 * Deliberately excludes `run`/`reset` — a handler must not be able to re-enter or rewind the
 * kernel it is running inside. `SimKernel` implements this interface.
 */
export interface EventScheduler {
  /** Current simulated time, in seconds. */
  now(): SimTime;
  /** Schedule `event` at absolute simulated time `at`. Throws if `at` is in the past. */
  schedule<TPayload>(at: SimTime, event: SimEvent<TPayload>): ScheduledEvent<TPayload>;
  /** Schedule `event` `delay` seconds from now. Throws if `delay` is negative. */
  scheduleAfter<TPayload>(
    delay: number,
    event: SimEvent<TPayload>,
  ): ScheduledEvent<TPayload>;
  /**
   * Invalidate a pending event so it never fires.
   *
   * This is what makes "the thing I scheduled is no longer going to happen" expressible
   * without every handler defensively re-deriving whether it is still relevant. The
   * canonical cases are a door obstruction superseding the `door.close` scheduled at
   * `t + dwell`, and hall-call reassignment superseding a committed arrival.
   *
   * The cancelled slot keeps its `(time, sequence)` position — nothing is re-heapified — so
   * the firing order of every surviving event is bit-identical to a run in which the
   * cancelled event was never scheduled at all. Cancelled events are dropped without being
   * dispatched, are excluded from `eventCount()`, and do not consume the `maxEventsPerRun`
   * budget.
   *
   * Safe to call from inside a handler, including on an event scheduled by a different
   * handler earlier in the same run.
   *
   * @returns `true` if the event was pending and is now cancelled; `false` if it had already
   *   fired, was already cancelled, or was never scheduled on this kernel. Idempotent: a
   *   second call on the same handle returns `false` and changes nothing.
   */
  cancel(handle: ScheduledEvent<unknown>): boolean;
}

/** What a handler is told about the event currently firing. */
export interface EventContext {
  /** The simulated time at which this event fires. Always equals `context.kernel.now()`. */
  readonly time: SimTime;
  /** The scheduling sequence number of this event. Useful for deterministic traces. */
  readonly sequence: number;
  /** The firing event's `type` label. */
  readonly type: string;
  /** Clock access and follow-up scheduling. */
  readonly kernel: EventScheduler;
}

/**
 * Build an event that carries no payload.
 *
 * ```ts
 * kernel.schedule(12, createEvent('door.close', (_, ctx) => car.closeDoor(ctx.time)));
 * ```
 */
export function createEvent(
  type: string,
  handler: EventHandler<undefined>,
): SimEvent<undefined>;
/**
 * Build an event with a typed payload.
 *
 * ```ts
 * kernel.schedule(12, createEvent('car.arrived', { carId: 3 }, (p, ctx) => bank.arrive(p.carId, ctx.time)));
 * ```
 */
export function createEvent<TPayload>(
  type: string,
  payload: TPayload,
  handler: EventHandler<TPayload>,
): SimEvent<TPayload>;
export function createEvent(
  type: string,
  payloadOrHandler: unknown,
  maybeHandler?: unknown,
): SimEvent<unknown> {
  if (maybeHandler === undefined) {
    return {
      type,
      payload: undefined,
      handler: payloadOrHandler as EventHandler<unknown>,
    };
  }
  return {
    type,
    payload: payloadOrHandler,
    handler: maybeHandler as EventHandler<unknown>,
  };
}
