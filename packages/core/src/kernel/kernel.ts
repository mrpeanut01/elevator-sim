import { EventQueue } from './eventQueue.js';
import type {
  EventContext,
  EventScheduler,
  ScheduledEvent,
  SimEvent,
  SimTime,
} from './types.js';

/** Construction options for {@link SimKernel}. */
export interface SimKernelOptions {
  /** Simulated time the clock starts at, in seconds. Defaults to `0`. */
  readonly startTime?: SimTime;
  /**
   * Safety valve: throw if a single `run`/`runUntilEmpty` call fires more than this many
   * events. Catches handlers that reschedule themselves at the same instant without making
   * progress. Defaults to unbounded.
   *
   * This is an *event count*, never a wall-clock timeout — there is no wall clock in `core/`.
   */
  readonly maxEventsPerRun?: number;

  /**
   * What {@link maxEventsPerRun} is counted over: one `run`/`runUntilEmpty` call (`'per-call'`,
   * the default and the historical behaviour) or the whole life of the kernel since construction
   * or {@link reset} (`'lifetime'`).
   *
   * **This exists so that a drain can be split into chunks without silently multiplying the
   * budget.** A caller that advances a simulation in N bounded calls rather than one unbounded
   * one gets N × `maxEventsPerRun` under `'per-call'`, so a livelock that the valve would have
   * caught in one call runs forever in ten — and, worse for this repository, the same seed
   * produces a *different* record depending on how the caller chose to step it. Under
   * `'lifetime'` the valve trips on exactly the same event whatever the chunking, which is what
   * {@link Simulation.advanceTo} needs to be bit-identical to {@link Simulation.run}.
   *
   * The two scopes are indistinguishable for a kernel that is drained exactly once — `fired` and
   * `processedCount()` are the same number there — so this changes nothing for every existing
   * caller, and the default keeps it that way for callers that never think about it.
   *
   * `DECISIONS.md` § D801, which also carries why the thrown message names neither the calling
   * method nor the clock under this scope.
   */
  readonly eventBudgetScope?: 'per-call' | 'lifetime';
}

/**
 * Discrete-event simulation kernel.
 *
 * The clock does not tick; it *jumps* to the time of the next pending event. All time in the
 * simulator originates here — there is no `Date.now()`, no `performance.now()` and no timer
 * anywhere in `core/`.
 *
 * Execution order is the total order `(time, sequence)` supplied by {@link EventQueue}, so a
 * given schedule of events processes identically on every run, on every machine.
 *
 * ```ts
 * const kernel = new SimKernel();
 * kernel.schedule(3.5, createEvent('car.arrived', { carId: 1 }, (p, ctx) => {
 *   ctx.kernel.scheduleAfter(2, createEvent('door.close', () => {}));
 * }));
 * kernel.run(60);
 * ```
 */
export class SimKernel implements EventScheduler {
  private readonly queue = new EventQueue();
  private readonly startTime: SimTime;
  private readonly maxEventsPerRun: number;
  private readonly eventBudgetScope: 'per-call' | 'lifetime';
  private currentTime: SimTime;
  private processed = 0;
  private lastDispatchedTime: SimTime | undefined;
  private running = false;

  constructor(options: SimKernelOptions = {}) {
    const startTime = options.startTime ?? 0;
    if (!Number.isFinite(startTime)) {
      throw new RangeError(
        `SimKernel: startTime must be a finite number of simulated seconds, got ${String(startTime)}.`,
      );
    }

    const maxEventsPerRun = options.maxEventsPerRun ?? Number.POSITIVE_INFINITY;
    if (Number.isNaN(maxEventsPerRun) || maxEventsPerRun < 0) {
      throw new RangeError(
        `SimKernel: maxEventsPerRun must be a non-negative number, got ${String(maxEventsPerRun)}.`,
      );
    }

    this.startTime = startTime;
    this.maxEventsPerRun = maxEventsPerRun;
    this.eventBudgetScope = options.eventBudgetScope ?? 'per-call';
    this.currentTime = startTime;
  }

  /** Current simulated time, in seconds. The only clock in the system. */
  now(): SimTime {
    return this.currentTime;
  }

  /**
   * Number of events currently pending in the queue.
   *
   * Counts *live* events only — cancelled events are excluded the instant they are cancelled,
   * so queue depth is a truthful signal for saturation detection.
   */
  eventCount(): number {
    return this.queue.size;
  }

  /**
   * Number of cancelled slots still occupying heap space, pending lazy pruning.
   * Diagnostic only; never part of {@link eventCount}.
   */
  cancelledEventCount(): number {
    return this.queue.cancelledSlots;
  }

  /** Number of events fired since construction (or since the last {@link reset}). */
  processedCount(): number {
    return this.processed;
  }

  /**
   * Simulated time of the most recently *dispatched* event, or `undefined` if none has fired.
   *
   * Not the same thing as {@link now}, and the difference is the whole reason it exists.
   * {@link runUntilEmpty} leaves the clock at the last event's time, so the two agree; but
   * {@link run} advances the clock to `until` whether or not anything fired there, so a caller
   * that drains in bounded chunks can finish with the clock ahead of the last thing that
   * happened. Anything that means *"when did this run stop"* — as opposed to *"how far has the
   * caller asked us to look"* — has to read this, or the same run reports a different end time
   * depending on where the caller chose to pause.
   *
   * Cancelled events never dispatch, so they never move it.
   */
  lastEventTime(): SimTime | undefined {
    return this.lastDispatchedTime;
  }

  /** `true` when no events are pending. */
  isEmpty(): boolean {
    return this.queue.isEmpty();
  }

  /** Time of the next pending event, or `undefined` when the queue is empty. */
  peekNextTime(): SimTime | undefined {
    return this.queue.peekTime();
  }

  /**
   * Schedule `event` to fire at absolute simulated time `at`.
   *
   * `at === now()` is legal and common (zero-delay events); such an event fires after every
   * already-queued event at the same instant, because it receives a higher sequence number.
   *
   * @throws {RangeError} if `at` is not finite.
   * @throws {RangeError} if `at` is in the past. Simulated time never runs backwards, and
   *   silently clamping would corrupt every statistic downstream.
   */
  schedule<TPayload>(at: SimTime, event: SimEvent<TPayload>): ScheduledEvent<TPayload> {
    if (!Number.isFinite(at)) {
      throw new RangeError(
        `SimKernel.schedule: event "${event.type}" scheduled at non-finite time ${String(at)}. ` +
          `Simulated times must be finite numbers of seconds.`,
      );
    }
    if (at < this.currentTime) {
      throw new RangeError(
        `SimKernel.schedule: event "${event.type}" scheduled in the past — at t=${at}s ` +
          `but the simulated clock is already at t=${this.currentTime}s. ` +
          `Simulated time never runs backwards.`,
      );
    }
    return this.queue.push(at, event);
  }

  /**
   * Schedule `event` to fire `delay` simulated seconds from now.
   *
   * @throws {RangeError} if `delay` is not finite or is negative. `delay === 0` is legal.
   */
  scheduleAfter<TPayload>(
    delay: number,
    event: SimEvent<TPayload>,
  ): ScheduledEvent<TPayload> {
    if (!Number.isFinite(delay)) {
      throw new RangeError(
        `SimKernel.scheduleAfter: event "${event.type}" scheduled with non-finite delay ${String(delay)}.`,
      );
    }
    if (delay < 0) {
      throw new RangeError(
        `SimKernel.scheduleAfter: event "${event.type}" scheduled with negative delay ${delay}s. ` +
          `Simulated time never runs backwards.`,
      );
    }
    return this.schedule(this.currentTime + delay, event);
  }

  /**
   * Invalidate a pending event so it never fires.
   *
   * Exists so that "this is no longer going to happen" is expressible directly instead of
   * every handler defensively re-deriving whether it is still relevant. A door obstruction at
   * `t + 1` cancels the `door.close` committed at `t + dwell`; a hall-call reassignment
   * cancels the arrival committed by the previous assignment. Without this, a stale
   * `door.close` still fires and every dispatcher has to guard against it — miss one guard
   * and the door closes on a passenger while the metrics stay silent.
   *
   * The cancelled slot keeps its `(time, sequence)` position, so nothing is re-heapified and
   * the firing order of the surviving events is bit-identical to a run where the cancelled
   * event was never scheduled. Cancelled events are excluded from {@link eventCount} and do
   * not consume the `maxEventsPerRun` budget.
   *
   * Safe to call from inside a handler.
   *
   * ```ts
   * const close = kernel.scheduleAfter(dwell, createEvent('door.close', closeDoor));
   * // …obstruction detected…
   * kernel.cancel(close);
   * kernel.scheduleAfter(reopen, createEvent('door.open', openDoor));
   * ```
   *
   * @returns `true` if the event was pending and is now cancelled; `false` if it had already
   *   fired, was already cancelled, or belongs to a different kernel. Never throws.
   */
  cancel(handle: ScheduledEvent<unknown>): boolean {
    return this.queue.cancel(handle);
  }

  /**
   * Fire every pending event with `time <= until`, in `(time, sequence)` order, then advance
   * the clock to exactly `until`.
   *
   * Events scheduled by handlers during the run are picked up immediately if they fall within
   * the window. Events beyond `until` stay queued for the next call.
   *
   * @returns the number of events fired.
   * @throws {RangeError} if `until` is not finite or is before `now()`.
   */
  run(until: SimTime): number {
    if (!Number.isFinite(until)) {
      throw new RangeError(
        `SimKernel.run: "until" must be a finite number of simulated seconds, got ${String(until)}.`,
      );
    }
    if (until < this.currentTime) {
      throw new RangeError(
        `SimKernel.run: cannot run until t=${until}s; the simulated clock is already at ` +
          `t=${this.currentTime}s. Simulated time never runs backwards.`,
      );
    }

    const fired = this.drain(until, 'run');
    this.currentTime = until;
    return fired;
  }

  /**
   * Fire every pending event until the queue is exhausted, in `(time, sequence)` order.
   *
   * Leaves the clock at the time of the last event fired.
   *
   * @returns the number of events fired.
   */
  runUntilEmpty(): number {
    return this.drain(undefined, 'runUntilEmpty');
  }

  /**
   * Restore the exact construction-time state: empty queue, clock back to `startTime`,
   * sequence counter and processed count back to 0.
   *
   * After `reset()` a replayed schedule assigns identical sequence numbers and therefore
   * produces a bit-identical event order — this is what makes stored runs replayable.
   */
  reset(): void {
    if (this.running) {
      throw new Error(
        `SimKernel.reset: cannot reset while events are being processed. ` +
          `A handler must not rewind the kernel it is running inside.`,
      );
    }
    this.queue.reset();
    this.currentTime = this.startTime;
    this.processed = 0;
    this.lastDispatchedTime = undefined;
  }

  /**
   * Pop and fire events in order until the queue is empty or the head is beyond `until`.
   * `until === undefined` means "drain everything".
   */
  private drain(until: SimTime | undefined, caller: string): number {
    if (this.running) {
      throw new Error(
        `SimKernel.${caller}: the kernel is already running. Event handlers schedule work; ` +
          `they must not re-enter run()/runUntilEmpty().`,
      );
    }

    this.running = true;
    let fired = 0;
    try {
      for (;;) {
        // `peek` skips cancelled slots, so a cancelled event is never dispatched and never
        // counts against `maxEventsPerRun`.
        const next = this.queue.peek();
        if (next === undefined) {
          break;
        }
        if (until !== undefined && next.time > until) {
          break;
        }
        // `'lifetime'` counts every event this kernel has ever fired, so splitting one drain
        // into several bounded calls does not hand the caller a fresh budget each time. For a
        // kernel drained exactly once the two are the same number, which is why the default
        // scope leaves every existing caller's behaviour — and its error text — untouched.
        const lifetime = this.eventBudgetScope === 'lifetime';
        const spent = lifetime ? this.processed : fired;
        if (spent >= this.maxEventsPerRun) {
          // **Under `'lifetime'` the message names neither the calling method nor the clock**,
          // and neither omission is cosmetic. This message travels into `Simulation`'s warnings
          // and therefore into the `RunRecord`, so anything in it that varies with *how the
          // caller chose to step* puts the caller's stepping choice into a persisted record —
          // the same seed, the same events, the same instant, two different bytes.
          //
          // Both varied. The method name is `run` from a bounded chunk and `runUntilEmpty` from
          // an unbounded drain. And a lifetime budget can be found already spent at the *start*
          // of a later chunk, with the clock parked at a boundary the caller picked, so
          // `currentTime` would report where somebody looked rather than where the run stopped —
          // {@link lastEventTime} is the same distinction one layer up.
          //
          // Under `'per-call'` the budget really is a property of the one call and the clock is
          // necessarily on the last event it fired, so that message is exactly what it was.
          const at = lifetime ? (this.lastDispatchedTime ?? this.currentTime) : this.currentTime;
          throw new Error(
            `${lifetime ? 'SimKernel' : `SimKernel.${caller}`}: fired ${spent} events at ` +
              `t=${at}s without draining the queue ` +
              `(maxEventsPerRun=${this.maxEventsPerRun}). This usually means a handler ` +
              `reschedules itself at the same instant without making progress.`,
          );
        }
        this.queue.pop();
        this.dispatch(next);
        fired += 1;
      }
    } finally {
      this.running = false;
    }
    return fired;
  }

  /** Advance the clock to the event's time and invoke its handler. */
  private dispatch(entry: ScheduledEvent<unknown>): void {
    this.currentTime = entry.time;
    this.lastDispatchedTime = entry.time;
    this.processed += 1;

    const context: EventContext = {
      time: entry.time,
      sequence: entry.sequence,
      type: entry.event.type,
      kernel: this,
    };

    entry.event.handler(entry.event.payload, context);
  }
}
