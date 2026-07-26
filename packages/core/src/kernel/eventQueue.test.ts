import { describe, expect, it } from 'vitest';

import { EventQueue, compareScheduledEvents } from './eventQueue.js';
import { createEvent } from './types.js';
import type { ScheduledEvent, SimEvent, SimTime } from './types.js';

/** An inert event. The queue never invokes handlers; it only orders them. */
const inert = (type: string): SimEvent<undefined> =>
  createEvent(type, () => {
    throw new Error('EventQueue must never invoke a handler');
  });

/**
 * Deterministic integer mixer. A *pure function of `n`* — no RNG state anywhere, so it does
 * not violate the "no global RNG" invariant and produces the same sequence on every run and
 * every machine.
 */
function mix(n: number): number {
  let x = Math.imul(n + 1, 2654435761);
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

describe('compareScheduledEvents', () => {
  const entry = (time: SimTime, sequence: number): ScheduledEvent<unknown> => ({
    time,
    sequence,
    event: inert('x'),
    cancelled: false,
  });

  it('orders by time first', () => {
    expect(compareScheduledEvents(entry(1, 99), entry(2, 0))).toBeLessThan(0);
    expect(compareScheduledEvents(entry(2, 0), entry(1, 99))).toBeGreaterThan(0);
  });

  it('breaks time ties by sequence number', () => {
    expect(compareScheduledEvents(entry(5, 1), entry(5, 2))).toBeLessThan(0);
    expect(compareScheduledEvents(entry(5, 2), entry(5, 1))).toBeGreaterThan(0);
  });

  it('is a total order: only an identical (time, sequence) compares equal', () => {
    expect(compareScheduledEvents(entry(5, 1), entry(5, 1))).toBe(0);
  });
});

describe('EventQueue', () => {
  it('starts empty', () => {
    const queue = new EventQueue();
    expect(queue.size).toBe(0);
    expect(queue.isEmpty()).toBe(true);
    expect(queue.peek()).toBeUndefined();
    expect(queue.peekTime()).toBeUndefined();
    expect(queue.pop()).toBeUndefined();
  });

  it('assigns strictly increasing sequence numbers at push time, starting at 0', () => {
    const queue = new EventQueue();
    expect(queue.nextSequence).toBe(0);

    const a = queue.push(10, inert('a'));
    const b = queue.push(0, inert('b'));
    const c = queue.push(10, inert('c'));

    expect([a.sequence, b.sequence, c.sequence]).toEqual([0, 1, 2]);
    expect(queue.nextSequence).toBe(3);
    // Sequence tracks *scheduling* order, not time order.
    expect(a.time).toBe(10);
    expect(b.time).toBe(0);
  });

  it('returns the scheduled entry from push', () => {
    const queue = new EventQueue();
    const event = inert('door.open');
    const scheduled = queue.push(4.25, event);

    expect(scheduled.time).toBe(4.25);
    expect(scheduled.sequence).toBe(0);
    expect(scheduled.event).toBe(event);
    expect(scheduled.cancelled).toBe(false);
  });

  it('preserves the payload type through push', () => {
    const queue = new EventQueue();
    const event = createEvent('car.arrived', { carId: 7 }, () => {});
    const scheduled = queue.push(1, event);
    // Type-level assertion: payload survives as `{ carId: number }`, not `unknown`.
    const carId: number = scheduled.event.payload.carId;
    expect(carId).toBe(7);
  });

  it('pops in time order regardless of push order', () => {
    const queue = new EventQueue();
    for (const time of [7, 2, 9, 1, 5, 3, 8, 4, 6, 0]) {
      queue.push(time, inert(`t${time}`));
    }

    const times: SimTime[] = [];
    for (let i = 0; i < 10; i += 1) {
      times.push((queue.pop() as ScheduledEvent<unknown>).time);
    }

    expect(times).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(queue.isEmpty()).toBe(true);
  });

  it('breaks ties by sequence, not by heap layout', () => {
    const queue = new EventQueue();
    // All identical timestamps: order must be exactly the push order.
    for (let i = 0; i < 1000; i += 1) {
      queue.push(42, inert(`e${i}`));
    }

    const sequences: number[] = [];
    while (!queue.isEmpty()) {
      sequences.push((queue.pop() as ScheduledEvent<unknown>).sequence);
    }

    expect(sequences).toEqual(Array.from({ length: 1000 }, (_, i) => i));
  });

  it('handles negative and fractional times', () => {
    const queue = new EventQueue();
    for (const time of [0.5, -3, 2.25, -0.125, 0]) {
      queue.push(time, inert(`t${time}`));
    }

    const times: SimTime[] = [];
    while (!queue.isEmpty()) {
      times.push((queue.pop() as ScheduledEvent<unknown>).time);
    }
    expect(times).toEqual([-3, -0.125, 0, 0.5, 2.25]);
  });

  it('peek does not remove, and always agrees with the next pop', () => {
    const queue = new EventQueue();
    queue.push(3, inert('c'));
    queue.push(1, inert('a'));
    queue.push(2, inert('b'));

    const peeked = queue.peek();
    expect(queue.size).toBe(3);
    expect(queue.peekTime()).toBe(1);
    expect(queue.peek()).toBe(peeked);
    expect(queue.pop()).toBe(peeked);
    expect(queue.size).toBe(2);
  });

  // The headline heap-correctness test required by the task.
  it('pops 10,000 events with many duplicate timestamps in exact (time, sequence) order', () => {
    const queue = new EventQueue();
    const count = 10_000;
    const pushed: ScheduledEvent<unknown>[] = [];

    for (let i = 0; i < count; i += 1) {
      // ~201 distinct timestamps across 10,000 events => ~50 duplicates each.
      const time = Math.round(mix(i) * 200);
      pushed.push(queue.push(time, inert(`e${i}`)));
    }

    expect(queue.size).toBe(count);

    // Independent reference order. The comparator is a total order, so this is unique.
    const expected = [...pushed].sort(compareScheduledEvents);

    const popped: ScheduledEvent<unknown>[] = [];
    while (!queue.isEmpty()) {
      popped.push(queue.pop() as ScheduledEvent<unknown>);
    }

    expect(popped.length).toBe(count);
    // Identity comparison, entry by entry — the strongest form of "exact order".
    for (let i = 0; i < count; i += 1) {
      expect(popped[i]).toBe(expected[i]);
    }

    // And restate the invariant directly, independently of the reference sort.
    let duplicateTimePairs = 0;
    for (let i = 1; i < count; i += 1) {
      const prev = popped[i - 1] as ScheduledEvent<unknown>;
      const curr = popped[i] as ScheduledEvent<unknown>;
      expect(prev.time).toBeLessThanOrEqual(curr.time);
      if (prev.time === curr.time) {
        expect(prev.sequence).toBeLessThan(curr.sequence);
        duplicateTimePairs += 1;
      }
    }
    // Guard against a vacuous test: the data really must contain heavy tie pressure.
    expect(duplicateTimePairs).toBeGreaterThan(count * 0.9);
    expect(new Set(popped.map((e) => e.time)).size).toBeLessThan(300);
  });

  it('maintains order under interleaved push and pop', () => {
    const queue = new EventQueue();
    // Reference model: a plain array scanned linearly for the minimum.
    const model: ScheduledEvent<unknown>[] = [];
    let pushes = 0;

    for (let step = 0; step < 4000; step += 1) {
      const shouldPush = model.length === 0 || mix(step) < 0.6;
      if (shouldPush) {
        const time = Math.round(mix(step * 7 + 1) * 20);
        model.push(queue.push(time, inert(`e${pushes}`)));
        pushes += 1;
        continue;
      }

      let bestIndex = 0;
      for (let i = 1; i < model.length; i += 1) {
        if (
          compareScheduledEvents(
            model[i] as ScheduledEvent<unknown>,
            model[bestIndex] as ScheduledEvent<unknown>,
          ) < 0
        ) {
          bestIndex = i;
        }
      }
      const expected = model.splice(bestIndex, 1)[0];
      expect(queue.pop()).toBe(expected);
      expect(queue.size).toBe(model.length);
    }

    expect(pushes).toBeGreaterThan(100);
  });

  it('rejects non-finite times', () => {
    const queue = new EventQueue();
    expect(() => queue.push(Number.NaN, inert('nan'))).toThrow(/non-finite/i);
    expect(() => queue.push(Number.POSITIVE_INFINITY, inert('inf'))).toThrow(/non-finite/i);
    expect(() => queue.push(Number.NEGATIVE_INFINITY, inert('-inf'))).toThrow(/non-finite/i);
    expect(queue.size).toBe(0);
  });

  it('clear() drops pending events but keeps the sequence counter advancing', () => {
    const queue = new EventQueue();
    queue.push(1, inert('a'));
    queue.push(2, inert('b'));
    queue.clear();

    expect(queue.size).toBe(0);
    expect(queue.isEmpty()).toBe(true);
    expect(queue.push(3, inert('c')).sequence).toBe(2);
  });

  it('reset() restores the construction-time state, including the sequence counter', () => {
    const queue = new EventQueue();
    queue.push(1, inert('a'));
    queue.push(2, inert('b'));
    queue.reset();

    expect(queue.size).toBe(0);
    expect(queue.nextSequence).toBe(0);
    expect(queue.push(3, inert('c')).sequence).toBe(0);
  });

  it('toOrderedArray() snapshots fire order without mutating the queue', () => {
    const queue = new EventQueue();
    queue.push(5, inert('late'));
    queue.push(5, inert('later'));
    queue.push(1, inert('early'));

    const snapshot = queue.toOrderedArray();
    expect(snapshot.map((e) => e.event.type)).toEqual(['early', 'late', 'later']);
    expect(queue.size).toBe(3);
    expect(queue.pop()?.event.type).toBe('early');
  });

  it('produces identical pop order across 100 independent constructions', () => {
    const orderFor = (): string => {
      const queue = new EventQueue();
      for (let i = 0; i < 500; i += 1) {
        queue.push(Math.round(mix(i) * 10), inert(`e${i}`));
      }
      const keys: string[] = [];
      while (!queue.isEmpty()) {
        const entry = queue.pop() as ScheduledEvent<unknown>;
        keys.push(`${entry.time}#${entry.sequence}`);
      }
      return keys.join(',');
    };

    const reference = orderFor();
    for (let run = 0; run < 100; run += 1) {
      expect(orderFor()).toBe(reference);
    }
  });
});

describe('EventQueue cancellation', () => {
  it('tombstones a pending entry and reports whether it did anything', () => {
    const queue = new EventQueue();
    const handle = queue.push(5, inert('door.close'));

    expect(handle.cancelled).toBe(false);
    expect(queue.cancel(handle)).toBe(true);
    expect(handle.cancelled).toBe(true);
    // Idempotent: a second cancel is a no-op, not a double decrement.
    expect(queue.cancel(handle)).toBe(false);
    expect(queue.size).toBe(0);
    expect(queue.isEmpty()).toBe(true);
  });

  it('excludes cancelled entries from size, isEmpty, peek, peekTime and pop', () => {
    const queue = new EventQueue();
    const first = queue.push(1, inert('a'));
    const second = queue.push(2, inert('b'));
    const third = queue.push(3, inert('c'));
    expect(queue.size).toBe(3);

    expect(queue.cancel(first)).toBe(true);
    expect(queue.size).toBe(2);
    expect(queue.peekTime()).toBe(2);
    expect(queue.peek()).toBe(second);

    expect(queue.cancel(second)).toBe(true);
    expect(queue.size).toBe(1);
    expect(queue.peek()).toBe(third);
    expect(queue.isEmpty()).toBe(false);

    expect(queue.pop()).toBe(third);
    expect(queue.size).toBe(0);
    expect(queue.isEmpty()).toBe(true);
    expect(queue.pop()).toBeUndefined();
  });

  it('keeps the sequence counter and the order of survivors untouched', () => {
    const queue = new EventQueue();
    const handles = [
      queue.push(5, inert('a')),
      queue.push(1, inert('b')),
      queue.push(5, inert('c')),
      queue.push(1, inert('d')),
      queue.push(3, inert('e')),
    ];
    expect(queue.nextSequence).toBe(5);

    // Cancel one head-of-time entry and one interior entry.
    expect(queue.cancel(handles[1] as ScheduledEvent<unknown>)).toBe(true);
    expect(queue.cancel(handles[2] as ScheduledEvent<unknown>)).toBe(true);
    // Cancellation must not consume or rewind sequence numbers.
    expect(queue.nextSequence).toBe(5);

    const order: string[] = [];
    while (!queue.isEmpty()) {
      order.push((queue.pop() as ScheduledEvent<unknown>).event.type);
    }
    // Exactly the (time, sequence) order of the survivors: d(1,3), e(3,4), a(5,0).
    expect(order).toEqual(['d', 'e', 'a']);
  });

  it('lazily reclaims tombstoned slots instead of re-heapifying', () => {
    const queue = new EventQueue();
    const handles = Array.from({ length: 20 }, (_, i) => queue.push(i, inert(`e${i}`)));

    for (let i = 0; i < 20; i += 2) {
      expect(queue.cancel(handles[i] as ScheduledEvent<unknown>)).toBe(true);
    }

    expect(queue.size).toBe(10);
    // The head tombstone (e0) is pruned eagerly; the interior ones wait their turn.
    expect(queue.cancelledSlots).toBeGreaterThan(0);
    expect(queue.slotCount).toBeGreaterThan(queue.size);

    const times: SimTime[] = [];
    while (!queue.isEmpty()) {
      times.push((queue.pop() as ScheduledEvent<unknown>).time);
    }
    expect(times).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
    expect(queue.slotCount).toBe(0);
    expect(queue.cancelledSlots).toBe(0);
  });

  it('refuses a foreign handle rather than corrupting its own counts', () => {
    const mine = new EventQueue();
    const theirs = new EventQueue();
    const foreign = theirs.push(1, inert('theirs'));
    mine.push(1, inert('mine'));

    expect(mine.cancel(foreign)).toBe(false);
    expect(foreign.cancelled).toBe(false);
    expect(mine.size).toBe(1);
    expect(theirs.size).toBe(1);
  });

  it('refuses a hand-rolled handle it never issued', () => {
    const queue = new EventQueue();
    queue.push(1, inert('real'));
    const forged: ScheduledEvent<unknown> = {
      time: 1,
      sequence: 0,
      event: inert('forged'),
      cancelled: false,
    };

    expect(queue.cancel(forged)).toBe(false);
    expect(queue.size).toBe(1);
  });

  it('refuses an entry that has already been popped', () => {
    const queue = new EventQueue();
    const handle = queue.push(1, inert('a'));
    expect(queue.pop()).toBe(handle);

    expect(queue.cancel(handle)).toBe(false);
    expect(handle.cancelled).toBe(false);
    expect(queue.size).toBe(0);
  });

  it('detaches handles on clear() and reset(), so a stale cancel is a no-op', () => {
    const queue = new EventQueue();
    const cleared = queue.push(1, inert('a'));
    queue.clear();
    expect(queue.cancel(cleared)).toBe(false);
    expect(queue.size).toBe(0);

    const live = queue.push(2, inert('b'));
    expect(queue.size).toBe(1);
    expect(queue.cancel(cleared)).toBe(false);
    expect(queue.size).toBe(1);

    queue.reset();
    expect(queue.cancel(live)).toBe(false);
    expect(queue.size).toBe(0);
    expect(queue.cancelledSlots).toBe(0);
    expect(queue.nextSequence).toBe(0);
  });

  it('omits cancelled entries from toOrderedArray()', () => {
    const queue = new EventQueue();
    queue.push(5, inert('late'));
    const doomed = queue.push(3, inert('doomed'));
    queue.push(1, inert('early'));

    expect(queue.cancel(doomed)).toBe(true);
    expect(queue.toOrderedArray().map((e) => e.event.type)).toEqual(['early', 'late']);
    expect(queue.size).toBe(2);
  });

  it('matches a reference model under interleaved push, cancel and pop', () => {
    const queue = new EventQueue();
    // Reference model: a plain array scanned linearly, with cancelled entries removed.
    const model: ScheduledEvent<unknown>[] = [];
    let pushes = 0;
    let cancels = 0;
    let pops = 0;

    for (let step = 0; step < 4000; step += 1) {
      const roll = mix(step);
      if (model.length === 0 || roll < 0.5) {
        const time = Math.round(mix(step * 7 + 1) * 20);
        model.push(queue.push(time, inert(`e${pushes}`)));
        pushes += 1;
        expect(queue.size).toBe(model.length);
        continue;
      }

      if (roll < 0.75) {
        // Cancel an arbitrary (deterministically chosen) pending entry.
        const victimIndex = Math.floor(mix(step * 13 + 5) * model.length) % model.length;
        const victim = model.splice(victimIndex, 1)[0] as ScheduledEvent<unknown>;
        expect(queue.cancel(victim)).toBe(true);
        expect(victim.cancelled).toBe(true);
        cancels += 1;
        expect(queue.size).toBe(model.length);
        continue;
      }

      let bestIndex = 0;
      for (let i = 1; i < model.length; i += 1) {
        if (
          compareScheduledEvents(
            model[i] as ScheduledEvent<unknown>,
            model[bestIndex] as ScheduledEvent<unknown>,
          ) < 0
        ) {
          bestIndex = i;
        }
      }
      const expected = model.splice(bestIndex, 1)[0];
      expect(queue.pop()).toBe(expected);
      expect(queue.size).toBe(model.length);
      pops += 1;
    }

    expect(pushes).toBeGreaterThan(100);
    expect(cancels).toBeGreaterThan(100);
    expect(pops).toBeGreaterThan(100);
  });

  it('produces identical results across 100 runs of a cancellation-heavy script', () => {
    const orderFor = (): string => {
      const queue = new EventQueue();
      const handles: ScheduledEvent<unknown>[] = [];
      for (let i = 0; i < 400; i += 1) {
        handles.push(queue.push(Math.round(mix(i) * 10), inert(`e${i}`)));
      }
      for (let i = 0; i < 400; i += 1) {
        if (mix(i * 17 + 3) < 0.4) {
          queue.cancel(handles[i] as ScheduledEvent<unknown>);
        }
      }
      const keys: string[] = [];
      while (!queue.isEmpty()) {
        const entry = queue.pop() as ScheduledEvent<unknown>;
        keys.push(`${entry.time}#${entry.sequence}`);
      }
      return keys.join(',');
    };

    const reference = orderFor();
    expect(reference.split(',').length).toBeLessThan(400);
    expect(reference.split(',').length).toBeGreaterThan(100);
    for (let run = 0; run < 100; run += 1) {
      expect(orderFor()).toBe(reference);
    }
  });

  it('never dispatches or returns a cancelled entry', () => {
    const queue = new EventQueue();
    const handles = Array.from({ length: 200 }, (_, i) =>
      queue.push(Math.round(mix(i * 3) * 15), inert(`e${i}`)),
    );
    const cancelled = new Set<ScheduledEvent<unknown>>();
    for (let i = 0; i < 200; i += 1) {
      const handle = handles[i] as ScheduledEvent<unknown>;
      if (mix(i * 29 + 11) < 0.5 && queue.cancel(handle)) {
        cancelled.add(handle);
      }
    }

    let popped = 0;
    while (!queue.isEmpty()) {
      const entry = queue.pop() as ScheduledEvent<unknown>;
      expect(entry.cancelled).toBe(false);
      expect(cancelled.has(entry)).toBe(false);
      popped += 1;
    }
    expect(popped).toBe(200 - cancelled.size);
    expect(cancelled.size).toBeGreaterThan(50);
  });
});

