import type { ScheduledEvent, SimEvent, SimTime } from './types.js';

/**
 * Total order over scheduled events: **`(time, sequence)`**.
 *
 * `sequence` is unique and strictly increasing, so this is a *total* order — no two distinct
 * entries ever compare equal. That is what makes event processing deterministic: the result
 * can never depend on heap layout, insertion accidents, or sort stability.
 *
 * @returns negative if `a` fires first, positive if `b` does, `0` only for the same entry.
 */
export function compareScheduledEvents(
  a: ScheduledEvent<unknown>,
  b: ScheduledEvent<unknown>,
): number {
  if (a.time !== b.time) {
    return a.time < b.time ? -1 : 1;
  }
  if (a.sequence !== b.sequence) {
    return a.sequence < b.sequence ? -1 : 1;
  }
  return 0;
}

/** `true` when `a` must fire strictly before `b`. Hot path — kept branch-cheap. */
function precedes(a: ScheduledEvent<unknown>, b: ScheduledEvent<unknown>): boolean {
  return a.time < b.time || (a.time === b.time && a.sequence < b.sequence);
}

/**
 * The queue's private, writable view of a slot.
 *
 * `ScheduledEvent` exposes `cancelled` as `readonly` on purpose: the queue maintains a live
 * count alongside the flag, and letting callers flip the flag directly would desynchronize
 * `size`. Only {@link EventQueue.cancel} writes here.
 */
interface QueueEntry<TPayload> {
  readonly time: SimTime;
  readonly sequence: number;
  readonly event: SimEvent<TPayload>;
  /** Tombstone. The slot keeps its heap position; `drain` skips it. */
  cancelled: boolean;
  /** `true` while the slot is still in the heap. Cleared when popped, pruned or cleared. */
  queued: boolean;
  /** Identifies the owning queue, so a foreign handle cannot corrupt this queue's counts. */
  readonly owner: EventQueue;
}

/**
 * Priority queue of pending simulation events, implemented as an array-backed binary
 * min-heap ordered by `(time, sequence)`.
 *
 * - `push` and `pop` are O(log n); `peek` and `size` are O(1) amortized. Nothing is sorted
 *   per insertion.
 * - The queue owns the sequence counter. Callers cannot supply a sequence number, so the
 *   tie-breaking invariant cannot be bypassed or forged.
 * - The heap is heterogeneous over payload types; payload and handler always travel together
 *   inside one `SimEvent`, so they can only ever be recombined correctly.
 *
 * ## Cancellation
 *
 * {@link cancel} tombstones a slot in O(1) rather than removing it. The slot keeps its
 * `(time, sequence)` position, so no re-heapification happens and the order of every
 * surviving event is untouched — cancelling is observationally identical to never having
 * scheduled the event. Tombstones are pruned lazily as they reach the head, and `size` counts
 * only live events so callers reading queue depth (saturation detection, run budgets) are
 * never misled by dead slots.
 */
export class EventQueue {
  /** Binary min-heap. `heap[0]` is the next slot, live or tombstoned. */
  private readonly heap: QueueEntry<unknown>[] = [];

  /** Monotonically increasing, assigned at push time. This is the tie-breaker. */
  private sequenceCounter = 0;

  /** Pending events that have *not* been cancelled. This is what `size` reports. */
  private liveCount = 0;

  /** Tombstoned slots still occupying heap space, awaiting lazy pruning. */
  private cancelledCount = 0;

  /** Number of pending events, excluding cancelled ones. */
  get size(): number {
    return this.liveCount;
  }

  /**
   * Heap slots currently allocated, including tombstones not yet pruned.
   * Diagnostic only — `size` is the number callers should reason about.
   */
  get slotCount(): number {
    return this.heap.length;
  }

  /** Tombstoned slots awaiting pruning. Diagnostic only. */
  get cancelledSlots(): number {
    return this.cancelledCount;
  }

  /** `true` when no *live* events are pending. */
  isEmpty(): boolean {
    return this.liveCount === 0;
  }

  /** The sequence number the next `push` will assign. Exposed for tests and tracing. */
  get nextSequence(): number {
    return this.sequenceCounter;
  }

  /**
   * Bind `event` to simulated time `time`, assign it the next sequence number, and insert it.
   *
   * O(log n). Returns the resulting {@link ScheduledEvent}, which doubles as the cancellation
   * handle and lets callers observe the assigned sequence number.
   *
   * @throws if `time` is not a finite number.
   */
  push<TPayload>(time: SimTime, event: SimEvent<TPayload>): ScheduledEvent<TPayload> {
    if (!Number.isFinite(time)) {
      throw new RangeError(
        `EventQueue.push: event "${event.type}" scheduled at non-finite time ${String(time)}. ` +
          `Simulated times must be finite numbers of seconds.`,
      );
    }

    const entry: QueueEntry<TPayload> = {
      time,
      sequence: this.sequenceCounter,
      event,
      cancelled: false,
      queued: true,
      owner: this,
    };
    this.sequenceCounter += 1;

    // Widening to `QueueEntry<unknown>` for heterogeneous storage. Sound because
    // `event.payload` and `event.handler` are never separated: only `SimKernel.dispatch`
    // recombines them, and it always does so from the same `SimEvent` value.
    this.heap.push(entry);
    this.siftUp(this.heap.length - 1);
    this.liveCount += 1;
    return entry;
  }

  /**
   * Tombstone a pending slot so it never fires. O(1).
   *
   * Ordering is untouched: the slot keeps its `(time, sequence)` position and is dropped when
   * it reaches the head.
   *
   * @returns `true` if `handle` was pending on *this* queue and is now cancelled. `false` for
   *   an already-fired, already-cancelled, cleared, or foreign handle — cancellation is
   *   idempotent and never throws.
   */
  cancel(handle: ScheduledEvent<unknown>): boolean {
    const entry = handle as QueueEntry<unknown>;
    if (entry.owner !== this || !entry.queued || entry.cancelled) {
      return false;
    }

    entry.cancelled = true;
    this.liveCount -= 1;
    this.cancelledCount += 1;
    // Keep `peek`/`peekTime` honest for a caller that never pops.
    this.pruneCancelled();
    return true;
  }

  /** The next live event to fire, without removing it. O(1) amortized. */
  peek(): ScheduledEvent<unknown> | undefined {
    this.pruneCancelled();
    return this.heap[0];
  }

  /** The time of the next live event, or `undefined` when empty. O(1) amortized. */
  peekTime(): SimTime | undefined {
    this.pruneCancelled();
    return this.heap[0]?.time;
  }

  /** Remove and return the next live event in `(time, sequence)` order. O(log n). */
  pop(): ScheduledEvent<unknown> | undefined {
    this.pruneCancelled();
    const top = this.removeHead();
    if (top === undefined) {
      return undefined;
    }
    this.liveCount -= 1;
    return top;
  }

  /** Discard all pending events. Keeps the sequence counter advancing. */
  clear(): void {
    this.detachAll();
    this.heap.length = 0;
    this.liveCount = 0;
    this.cancelledCount = 0;
  }

  /**
   * Discard all pending events **and** rewind the sequence counter to 0.
   *
   * Restores the exact construction-time state so a replayed run assigns identical sequence
   * numbers, and therefore produces an identical event order.
   */
  reset(): void {
    this.clear();
    this.sequenceCounter = 0;
  }

  /**
   * Snapshot of pending *live* events in fire order, without mutating the queue. O(n log n).
   * Intended for debugging and tests, not for the hot path.
   */
  toOrderedArray(): ScheduledEvent<unknown>[] {
    return this.heap.filter((entry) => !entry.cancelled).sort(compareScheduledEvents);
  }

  /**
   * Drop tombstones that have reached the head of the heap.
   *
   * Called from `peek`/`peekTime`/`pop`/`cancel` so every observation of the queue reflects
   * only live events. Amortized O(1) per cancelled event across the queue's lifetime.
   */
  private pruneCancelled(): void {
    for (;;) {
      const head = this.heap[0];
      if (head === undefined || !head.cancelled) {
        return;
      }
      this.removeHead();
      this.cancelledCount -= 1;
    }
  }

  /** Remove the head slot (live or tombstoned) and restore the heap property. O(log n). */
  private removeHead(): QueueEntry<unknown> | undefined {
    const heap = this.heap;
    const top = heap[0];
    if (top === undefined) {
      return undefined;
    }
    // Non-null: length >= 1 because heap[0] exists.
    const last = heap.pop() as QueueEntry<unknown>;
    if (heap.length > 0) {
      heap[0] = last;
      this.siftDown(0);
    }
    top.queued = false;
    return top;
  }

  /**
   * Mark every remaining slot as no longer queued, so a handle retained across `clear()` or
   * `reset()` cannot later be "cancelled" and drive the live count negative.
   */
  private detachAll(): void {
    for (const entry of this.heap) {
      entry.queued = false;
    }
  }

  private siftUp(startIndex: number): void {
    const heap = this.heap;
    let index = startIndex;
    const item = heap[index] as QueueEntry<unknown>;

    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = heap[parentIndex] as QueueEntry<unknown>;
      if (!precedes(item, parent)) {
        break;
      }
      heap[index] = parent;
      index = parentIndex;
    }

    heap[index] = item;
  }

  private siftDown(startIndex: number): void {
    const heap = this.heap;
    const length = heap.length;
    const firstLeaf = length >> 1;
    let index = startIndex;
    const item = heap[index] as QueueEntry<unknown>;

    while (index < firstLeaf) {
      let childIndex = index * 2 + 1;
      let child = heap[childIndex] as QueueEntry<unknown>;

      const rightIndex = childIndex + 1;
      if (rightIndex < length) {
        const right = heap[rightIndex] as QueueEntry<unknown>;
        if (precedes(right, child)) {
          childIndex = rightIndex;
          child = right;
        }
      }

      if (!precedes(child, item)) {
        break;
      }
      heap[index] = child;
      index = childIndex;
    }

    heap[index] = item;
  }
}
