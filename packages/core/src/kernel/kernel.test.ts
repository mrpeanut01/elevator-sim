import { describe, expect, it } from 'vitest';

import { SimKernel } from './kernel.js';
import { createEvent } from './types.js';
import type { EventContext, ScheduledEvent, SimTime } from './types.js';

// Source text for the invariant scans below. Imported through Vite's `?raw` loader rather
// than read with `node:fs`, so these tests depend on no ambient environment beyond
// `lib: ["ES2022"]` — see `raw-source.d.ts` and the "kernel source invariants" block.
import eventQueueSource from './eventQueue.ts?raw';
import eventQueueTestSource from './eventQueue.test.ts?raw';
import indexSource from './index.ts?raw';
import kernelSource from './kernel.ts?raw';
import kernelTestSource from './kernel.test.ts?raw';
import typesSource from './types.ts?raw';

/** A no-op event. */
const noop = (type: string) => createEvent(type, () => {});

/**
 * Deterministic integer mixer. A *pure function of `n`* — no RNG state, so it neither uses
 * nor needs a `StreamSet`, and it yields the same sequence on every run and every machine.
 */
function mix(n: number): number {
  let x = Math.imul(n + 1, 2654435761);
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

describe('SimKernel clock', () => {
  it('starts at t=0 with an empty queue', () => {
    const kernel = new SimKernel();
    expect(kernel.now()).toBe(0);
    expect(kernel.eventCount()).toBe(0);
    expect(kernel.processedCount()).toBe(0);
    expect(kernel.isEmpty()).toBe(true);
    expect(kernel.peekNextTime()).toBeUndefined();
  });

  it('honours an explicit startTime', () => {
    const kernel = new SimKernel({ startTime: 3600 });
    expect(kernel.now()).toBe(3600);
    expect(() => kernel.schedule(3599, noop('past'))).toThrow(/in the past/i);
    expect(() => kernel.schedule(3600, noop('now'))).not.toThrow();
  });

  it('rejects a non-finite startTime', () => {
    expect(() => new SimKernel({ startTime: Number.NaN })).toThrow(/finite/i);
    expect(() => new SimKernel({ startTime: Number.POSITIVE_INFINITY })).toThrow(/finite/i);
  });

  it('advances the clock to `until` even when nothing is queued', () => {
    const kernel = new SimKernel();
    expect(kernel.run(120)).toBe(0);
    expect(kernel.now()).toBe(120);
  });

  it('never lets the clock run backwards', () => {
    const kernel = new SimKernel();
    kernel.run(50);
    expect(() => kernel.run(49.999)).toThrow(/never runs backwards/i);
    expect(() => kernel.run(Number.NaN)).toThrow(/finite/i);
    expect(kernel.now()).toBe(50);
  });
});

describe('SimKernel.schedule', () => {
  it('throws a clear error for an event scheduled in the past', () => {
    const kernel = new SimKernel();
    kernel.run(10);
    expect(() => kernel.schedule(9.5, noop('car.arrived'))).toThrow(
      /event "car\.arrived" scheduled in the past — at t=9\.5s but the simulated clock is already at t=10s/,
    );
    expect(kernel.eventCount()).toBe(0);
  });

  it('throws when a handler tries to schedule into the past', () => {
    const kernel = new SimKernel();
    let caught: unknown;
    kernel.schedule(
      5,
      createEvent('probe', (_, ctx) => {
        try {
          ctx.kernel.schedule(4.9, noop('too.late'));
        } catch (error: unknown) {
          caught = error;
        }
      }),
    );
    kernel.runUntilEmpty();
    expect(caught).toBeInstanceOf(RangeError);
    expect(String(caught)).toMatch(/in the past/i);
  });

  it('accepts an event scheduled at exactly now()', () => {
    const kernel = new SimKernel();
    kernel.run(7);
    const scheduled = kernel.schedule(7, noop('zero.delay'));
    expect(scheduled.time).toBe(7);
    expect(kernel.eventCount()).toBe(1);
  });

  it('rejects non-finite times and negative delays', () => {
    const kernel = new SimKernel();
    expect(() => kernel.schedule(Number.NaN, noop('a'))).toThrow(/non-finite/i);
    expect(() => kernel.schedule(Number.POSITIVE_INFINITY, noop('b'))).toThrow(/non-finite/i);
    expect(() => kernel.scheduleAfter(-0.001, noop('c'))).toThrow(/negative delay/i);
    expect(() => kernel.scheduleAfter(Number.NaN, noop('d'))).toThrow(/non-finite/i);
    expect(() => kernel.scheduleAfter(0, noop('e'))).not.toThrow();
  });

  it('scheduleAfter is relative to the current simulated time', () => {
    const kernel = new SimKernel();
    kernel.run(30);
    expect(kernel.scheduleAfter(2.5, noop('door.close')).time).toBe(32.5);
  });

  it('returns a handle carrying the assigned sequence number', () => {
    const kernel = new SimKernel();
    expect(kernel.schedule(1, noop('a')).sequence).toBe(0);
    expect(kernel.schedule(1, noop('b')).sequence).toBe(1);
    expect(kernel.schedule(0, noop('c')).sequence).toBe(2);
  });
});

describe('SimKernel event processing', () => {
  it('fires events in (time, sequence) order and exposes the firing time', () => {
    const kernel = new SimKernel();
    const seen: Array<[string, SimTime, number]> = [];
    const watch = (type: string) =>
      createEvent(type, (_, ctx: EventContext) => {
        expect(ctx.kernel.now()).toBe(ctx.time);
        expect(ctx.type).toBe(type);
        seen.push([type, ctx.time, ctx.sequence]);
      });

    kernel.schedule(5, watch('c')); // seq 0
    kernel.schedule(1, watch('a')); // seq 1
    kernel.schedule(5, watch('d')); // seq 2
    kernel.schedule(1, watch('b')); // seq 3

    expect(kernel.runUntilEmpty()).toBe(4);
    expect(seen).toEqual([
      ['a', 1, 1],
      ['b', 1, 3],
      ['c', 5, 0],
      ['d', 5, 2],
    ]);
    expect(kernel.now()).toBe(5);
  });

  it('fires an event scheduled during a handler at the same instant, after the already-queued ones', () => {
    const kernel = new SimKernel();
    const order: string[] = [];

    kernel.schedule(
      2,
      createEvent('first', (_, ctx) => {
        order.push('first');
        ctx.kernel.scheduleAfter(
          0,
          createEvent('spawned', () => {
            order.push('spawned');
          }),
        );
      }),
    );
    kernel.schedule(
      2,
      createEvent('second', () => {
        order.push('second');
      }),
    );

    kernel.runUntilEmpty();
    // "spawned" gets a higher sequence than "second", so it must fire last.
    expect(order).toEqual(['first', 'second', 'spawned']);
  });

  it('processes cascading events in causal order', () => {
    const kernel = new SimKernel();
    const times: SimTime[] = [];

    const step = (n: number): void => {
      kernel.scheduleAfter(
        1.5,
        createEvent('chain', { n }, (payload, ctx) => {
          times.push(ctx.time);
          if (payload.n < 5) {
            step(payload.n + 1);
          }
        }),
      );
    };
    step(0);

    expect(kernel.runUntilEmpty()).toBe(6);
    expect(times).toEqual([1.5, 3, 4.5, 6, 7.5, 9]);
    expect(kernel.now()).toBe(9);
  });

  it('run(until) is inclusive of events at exactly `until` and leaves later ones queued', () => {
    const kernel = new SimKernel();
    const fired: SimTime[] = [];
    for (const time of [1, 5, 10, 10, 10.000001, 20]) {
      kernel.schedule(
        time,
        createEvent('e', (_, ctx) => {
          fired.push(ctx.time);
        }),
      );
    }

    expect(kernel.run(10)).toBe(4);
    expect(fired).toEqual([1, 5, 10, 10]);
    expect(kernel.now()).toBe(10);
    expect(kernel.eventCount()).toBe(2);
    expect(kernel.peekNextTime()).toBe(10.000001);

    expect(kernel.run(30)).toBe(2);
    expect(kernel.now()).toBe(30);
    expect(kernel.isEmpty()).toBe(true);
  });

  it('picks up events scheduled by handlers inside the same run window', () => {
    const kernel = new SimKernel();
    let count = 0;
    kernel.schedule(
      1,
      createEvent('seed', (_, ctx) => {
        count += 1;
        ctx.kernel.scheduleAfter(1, noop('inside'));
        ctx.kernel.scheduleAfter(100, noop('outside'));
      }),
    );

    expect(kernel.run(10)).toBe(2);
    expect(count).toBe(1);
    expect(kernel.eventCount()).toBe(1);
    expect(kernel.peekNextTime()).toBe(101);
  });

  it('tracks pending and processed counts', () => {
    const kernel = new SimKernel();
    kernel.schedule(1, noop('a'));
    kernel.schedule(2, noop('b'));
    kernel.schedule(3, noop('c'));
    expect(kernel.eventCount()).toBe(3);

    kernel.run(2);
    expect(kernel.eventCount()).toBe(1);
    expect(kernel.processedCount()).toBe(2);

    kernel.runUntilEmpty();
    expect(kernel.eventCount()).toBe(0);
    expect(kernel.processedCount()).toBe(3);
  });

  it('runUntilEmpty leaves the clock at the last event time', () => {
    const kernel = new SimKernel();
    kernel.schedule(4, noop('a'));
    kernel.schedule(17.5, noop('b'));
    expect(kernel.runUntilEmpty()).toBe(2);
    expect(kernel.now()).toBe(17.5);
  });

  it('delivers typed payloads to handlers', () => {
    const kernel = new SimKernel();
    const seen: string[] = [];
    kernel.schedule(
      1,
      createEvent('car.arrived', { carId: 3, floor: 12 }, (payload, ctx) => {
        // Type-level assertion: payload is `{ carId: number; floor: number }`.
        const floor: number = payload.floor;
        seen.push(`${ctx.type}:${payload.carId}@${floor}`);
      }),
    );
    kernel.runUntilEmpty();
    expect(seen).toEqual(['car.arrived:3@12']);
  });
});

describe('SimKernel guards', () => {
  it('throws when a handler tries to re-enter run()', () => {
    const kernel = new SimKernel();
    let caught: unknown;
    kernel.schedule(
      1,
      createEvent('reentrant', () => {
        try {
          kernel.run(10);
        } catch (error: unknown) {
          caught = error;
        }
      }),
    );
    kernel.runUntilEmpty();
    expect(String(caught)).toMatch(/already running/i);
  });

  it('throws when a handler tries to reset the kernel underneath itself', () => {
    const kernel = new SimKernel();
    let caught: unknown;
    kernel.schedule(
      1,
      createEvent('rewind', () => {
        try {
          kernel.reset();
        } catch (error: unknown) {
          caught = error;
        }
      }),
    );
    kernel.runUntilEmpty();
    expect(String(caught)).toMatch(/cannot reset while events are being processed/i);
  });

  it('catches a zero-progress livelock via maxEventsPerRun', () => {
    const kernel = new SimKernel({ maxEventsPerRun: 1000 });
    const spin = (): void => {
      kernel.scheduleAfter(
        0,
        createEvent('spin', () => {
          spin();
        }),
      );
    };
    spin();

    expect(() => kernel.runUntilEmpty()).toThrow(/maxEventsPerRun=1000/);
    expect(kernel.processedCount()).toBe(1000);
    // The kernel is left usable, not wedged mid-dispatch.
    expect(kernel.eventCount()).toBeGreaterThan(0);
  });

  it('leaves the running flag clear when a handler throws', () => {
    const kernel = new SimKernel();
    kernel.schedule(
      1,
      createEvent('boom', () => {
        throw new Error('handler blew up');
      }),
    );
    expect(() => kernel.runUntilEmpty()).toThrow('handler blew up');
    expect(() => kernel.runUntilEmpty()).not.toThrow();
    expect(() => kernel.reset()).not.toThrow();
  });
});

describe('SimKernel.cancel', () => {
  it('a door obstruction cancels the committed door.close, so the door never closes', () => {
    // The Phase 1 scenario in full: `door.close` is committed at t + dwell, an obstruction
    // lands at t + 1, and the stale close must not fire. Without cancellation the close
    // fires anyway and every handler downstream has to defend against it.
    const kernel = new SimKernel();
    const log: string[] = [];
    let doorOpen = false;

    kernel.schedule(
      10,
      createEvent('door.open', (_, ctx) => {
        doorOpen = true;
        log.push(`open@${ctx.time}`);

        const close = ctx.kernel.scheduleAfter(
          4,
          createEvent('door.close', (__, closeCtx) => {
            doorOpen = false;
            log.push(`close@${closeCtx.time}`);
          }),
        );

        ctx.kernel.scheduleAfter(
          1,
          createEvent('door.obstructed', (__, obstructCtx) => {
            log.push(`obstructed@${obstructCtx.time}`);
            expect(obstructCtx.kernel.cancel(close)).toBe(true);
            expect(close.cancelled).toBe(true);
            obstructCtx.kernel.scheduleAfter(
              4,
              createEvent('door.close', (___, reCtx) => {
                doorOpen = false;
                log.push(`close@${reCtx.time}`);
              }),
            );
          }),
        );
      }),
    );

    kernel.runUntilEmpty();
    expect(log).toEqual(['open@10', 'obstructed@11', 'close@15']);
    // The superseded close at t=14 never ran: no passenger was shut in.
    expect(log).not.toContain('close@14');
    expect(doorOpen).toBe(false);
  });

  it('is idempotent and reports whether it actually cancelled anything', () => {
    const kernel = new SimKernel();
    const handle = kernel.schedule(5, noop('a'));

    expect(handle.cancelled).toBe(false);
    expect(kernel.cancel(handle)).toBe(true);
    expect(handle.cancelled).toBe(true);
    expect(kernel.cancel(handle)).toBe(false);
    expect(kernel.eventCount()).toBe(0);
  });

  it('returns false for an event that has already fired, without corrupting counts', () => {
    const kernel = new SimKernel();
    const handle = kernel.schedule(1, noop('done'));
    kernel.schedule(2, noop('pending'));
    kernel.run(1);

    expect(kernel.processedCount()).toBe(1);
    expect(kernel.cancel(handle)).toBe(false);
    expect(handle.cancelled).toBe(false);
    expect(kernel.eventCount()).toBe(1);
    expect(kernel.runUntilEmpty()).toBe(1);
  });

  it('refuses a handle belonging to a different kernel', () => {
    const mine = new SimKernel();
    const theirs = new SimKernel();
    const foreign = theirs.schedule(3, noop('theirs'));
    mine.schedule(3, noop('mine'));

    expect(mine.cancel(foreign)).toBe(false);
    expect(foreign.cancelled).toBe(false);
    expect(mine.eventCount()).toBe(1);
    expect(theirs.eventCount()).toBe(1);
    expect(mine.runUntilEmpty()).toBe(1);
    expect(theirs.runUntilEmpty()).toBe(1);
  });

  it('keeps eventCount() and peekNextTime() honest the instant an event is cancelled', () => {
    const kernel = new SimKernel();
    const first = kernel.schedule(1, noop('a'));
    const second = kernel.schedule(2, noop('b'));
    kernel.schedule(3, noop('c'));
    expect(kernel.eventCount()).toBe(3);

    // Cancel an *interior* slot first: it stays in the heap as a tombstone, so this is where
    // a queue that reported raw heap depth instead of live depth would lie.
    expect(kernel.cancel(second)).toBe(true);
    expect(kernel.eventCount()).toBe(2);
    expect(kernel.cancelledEventCount()).toBe(1);
    expect(kernel.peekNextTime()).toBe(1);

    expect(kernel.cancel(first)).toBe(true);
    // Queue depth is the signal Phase 3 saturation detection reads: dead slots must not
    // inflate it, and the head of the queue must skip straight past them.
    expect(kernel.eventCount()).toBe(1);
    expect(kernel.peekNextTime()).toBe(3);
    expect(kernel.isEmpty()).toBe(false);
    expect(kernel.cancel(second)).toBe(false);
    expect(kernel.eventCount()).toBe(1);

    expect(kernel.runUntilEmpty()).toBe(1);
    expect(kernel.isEmpty()).toBe(true);
    expect(kernel.eventCount()).toBe(0);
    expect(kernel.cancelledEventCount()).toBe(0);
  });

  it('does not spend the maxEventsPerRun budget on cancelled events', () => {
    const kernel = new SimKernel({ maxEventsPerRun: 10 });
    const handles: Array<ScheduledEvent<unknown>> = [];
    for (let i = 0; i < 100; i += 1) {
      handles.push(kernel.schedule(i, noop(`e${i}`)));
    }
    // Cancel all but ten. Were tombstones dispatched — or merely counted — this would throw.
    for (let i = 0; i < 100; i += 1) {
      if (i % 10 !== 0) {
        expect(kernel.cancel(handles[i] as ScheduledEvent<unknown>)).toBe(true);
      }
    }

    expect(kernel.eventCount()).toBe(10);
    expect(kernel.runUntilEmpty()).toBe(10);
    expect(kernel.processedCount()).toBe(10);
  });

  it('leaves the order of surviving events exactly as if the cancelled ones never existed', () => {
    const times = Array.from({ length: 40 }, (_, i) => Math.round(mix(i * 9 + 2) * 12) * 0.5);
    const doomed = (i: number): boolean => i % 3 === 0;

    const withCancellation = (): string[] => {
      const kernel = new SimKernel();
      const fired: string[] = [];
      const handles = times.map((at, i) =>
        kernel.schedule(
          at,
          createEvent('e', { i }, (payload, ctx) => {
            fired.push(`${ctx.time}|${payload.i}`);
          }),
        ),
      );
      for (let i = 0; i < handles.length; i += 1) {
        if (doomed(i)) {
          expect(kernel.cancel(handles[i] as ScheduledEvent<unknown>)).toBe(true);
        }
      }
      kernel.runUntilEmpty();
      return fired;
    };

    const withoutTheDoomed = (): string[] => {
      const kernel = new SimKernel();
      const fired: string[] = [];
      times.forEach((at, i) => {
        if (doomed(i)) {
          return;
        }
        kernel.schedule(
          at,
          createEvent('e', { i }, (payload, ctx) => {
            fired.push(`${ctx.time}|${payload.i}`);
          }),
        );
      });
      kernel.runUntilEmpty();
      return fired;
    };

    const survivors = withCancellation();
    expect(survivors.length).toBe(times.length - times.filter((_, i) => doomed(i)).length);
    // Same events, same order, same times — cancellation perturbs nothing.
    expect(survivors).toEqual(withoutTheDoomed());
    // Non-vacuous: the timings really do collide, so ordering was under test.
    expect(new Set(times).size).toBeLessThan(times.length);
  });

  it('lets a handler cancel work scheduled by an earlier handler in the same run', () => {
    const kernel = new SimKernel();
    const fired: string[] = [];
    let assigned: ScheduledEvent<unknown> | undefined;

    kernel.schedule(
      1,
      createEvent('call.assigned', (_, ctx) => {
        assigned = ctx.kernel.scheduleAfter(
          10,
          createEvent('car.arrived', () => {
            fired.push('car.arrived');
          }),
        );
      }),
    );
    kernel.schedule(
      2,
      createEvent('call.reassigned', (_, ctx) => {
        expect(ctx.kernel.cancel(assigned as ScheduledEvent<unknown>)).toBe(true);
        fired.push('call.reassigned');
      }),
    );

    kernel.runUntilEmpty();
    expect(fired).toEqual(['call.reassigned']);
    expect(kernel.processedCount()).toBe(2);
  });

  it('cannot cancel the event that is currently firing', () => {
    const kernel = new SimKernel();
    let result: boolean | undefined;
    const handle = kernel.schedule(
      1,
      createEvent('self', (_, ctx) => {
        result = ctx.kernel.cancel(handle);
      }),
    );

    kernel.runUntilEmpty();
    expect(result).toBe(false);
    expect(kernel.processedCount()).toBe(1);
  });

  it('detaches handles on reset(), so a stale handle cannot corrupt the new run', () => {
    const kernel = new SimKernel();
    const stale = kernel.schedule(5, noop('stale'));
    kernel.reset();

    expect(kernel.cancel(stale)).toBe(false);
    kernel.schedule(5, noop('fresh'));
    expect(kernel.eventCount()).toBe(1);
    expect(kernel.cancel(stale)).toBe(false);
    expect(kernel.eventCount()).toBe(1);
    expect(kernel.runUntilEmpty()).toBe(1);
  });
});

/**
 * A cancellation-heavy script: every arrival may invalidate work already committed by an
 * earlier one, which is precisely the Phase 1 obstruction / Phase 2 reassignment shape.
 */
function runCancellationScript(kernel: SimKernel): readonly string[] {
  const trace: string[] = [];
  const committed = new Map<number, ScheduledEvent<unknown>>();

  for (let i = 0; i < 50; i += 1) {
    const at = Math.round(mix(i * 5 + 3) * 30) * 0.5;
    const handle = kernel.schedule(
      at,
      createEvent('door.close', { i }, (payload, ctx) => {
        trace.push(`${ctx.time.toFixed(4)}|${ctx.sequence}|close=${payload.i}`);
        // Supersede the close committed three cars later, if it is still pending.
        const victim = committed.get(payload.i + 3);
        if (victim !== undefined && ctx.kernel.cancel(victim)) {
          trace.push(`${ctx.time.toFixed(4)}|${ctx.sequence}|superseded=${payload.i + 3}`);
        }
      }),
    );
    committed.set(i, handle);
  }

  kernel.runUntilEmpty();
  trace.push(`pending=${kernel.eventCount()}|processed=${kernel.processedCount()}`);
  return trace;
}

describe('Phase 0 acceptance: determinism holds with cancellation', () => {
  it('replays a cancellation-heavy script identically across 100 runs and across reset()', () => {
    const reference = runCancellationScript(new SimKernel());

    // Non-vacuous: cancellations really happened, and really suppressed events.
    const supersededCount = reference.filter((line) => line.includes('superseded=')).length;
    expect(supersededCount).toBeGreaterThan(5);
    expect(reference.filter((line) => line.includes('close=')).length).toBe(50 - supersededCount);

    const referenceJson = JSON.stringify(reference);
    for (let run = 0; run < 100; run += 1) {
      expect(JSON.stringify(runCancellationScript(new SimKernel()))).toBe(referenceJson);
    }

    const kernel = new SimKernel();
    for (let run = 0; run < 100; run += 1) {
      kernel.reset();
      expect(JSON.stringify(runCancellationScript(kernel))).toBe(referenceJson);
    }
  });
});

describe('SimKernel.reset', () => {
  it('restores construction-time state, including sequence numbering', () => {
    const kernel = new SimKernel({ startTime: 100 });
    kernel.schedule(150, noop('a'));
    kernel.schedule(200, noop('b'));
    kernel.run(150);
    expect(kernel.now()).toBe(150);

    kernel.reset();

    expect(kernel.now()).toBe(100);
    expect(kernel.eventCount()).toBe(0);
    expect(kernel.processedCount()).toBe(0);
    expect(kernel.isEmpty()).toBe(true);
    // Sequence numbering restarts, so a replayed schedule reproduces the same order.
    expect(kernel.schedule(120, noop('c')).sequence).toBe(0);
  });
});

/**
 * A scripted, self-cascading event sequence. Deliberately full of duplicate timestamps,
 * zero-delay follow-ups and self-rescheduling events — every ordering hazard the kernel is
 * supposed to resolve deterministically.
 */
interface ScriptResult {
  readonly trace: readonly string[];
  readonly firstPhase: number;
  readonly secondPhase: number;
  readonly processed: number;
  readonly endTime: SimTime;
}

function runScriptedSimulation(kernel: SimKernel): ScriptResult {
  const trace: string[] = [];
  const record = (ctx: EventContext, note: string): void => {
    trace.push(`${ctx.time.toFixed(4)}|${ctx.sequence}|${ctx.type}|${note}`);
  };

  // A self-rescheduling metronome, one tick per simulated second.
  const scheduleTick = (n: number, at: SimTime): void => {
    kernel.schedule(
      at,
      createEvent('sim.tick', { n }, (payload, ctx) => {
        record(ctx, `tick=${payload.n}`);
        if (payload.n < 20) {
          scheduleTick(payload.n + 1, ctx.time + 1);
        }
      }),
    );
  };
  scheduleTick(0, 0);

  // Batch arrivals on a 0.25 s grid — guarantees heavy timestamp collision with the ticks
  // and with each other.
  for (let i = 0; i < 60; i += 1) {
    const at = Math.round(mix(i) * 40) * 0.25;
    kernel.schedule(
      at,
      createEvent('passenger.arrived', { id: i }, (payload, ctx) => {
        record(ctx, `passenger=${payload.id}`);

        // Zero-delay follow-up at the very same instant.
        ctx.kernel.scheduleAfter(
          0,
          createEvent('call.registered', { id: payload.id }, (inner, innerCtx) => {
            record(innerCtx, `call=${inner.id}`);
          }),
        );

        // Deferred follow-up, sometimes landing on another event's timestamp.
        const dwell = Math.round(mix(payload.id * 31 + 7) * 8) * 0.25;
        ctx.kernel.scheduleAfter(
          dwell,
          createEvent('door.close', { id: payload.id }, (inner, innerCtx) => {
            record(innerCtx, `door=${inner.id}`);
          }),
        );
      }),
    );
  }

  const firstPhase = kernel.run(12);
  const secondPhase = kernel.runUntilEmpty();

  return {
    trace,
    firstPhase,
    secondPhase,
    processed: kernel.processedCount(),
    endTime: kernel.now(),
  };
}

describe('Phase 0 acceptance: deterministic execution', () => {
  it('processes a scripted event sequence identically across 100 runs', () => {
    const reference = runScriptedSimulation(new SimKernel());

    // Guard against a vacuous test: the script must actually exercise the kernel hard.
    expect(reference.trace.length).toBeGreaterThan(200);
    expect(reference.firstPhase).toBeGreaterThan(0);
    expect(reference.secondPhase).toBeGreaterThan(0);
    expect(reference.processed).toBe(reference.trace.length);

    // And it must really contain same-timestamp collisions, or ordering is untested.
    const timestamps = reference.trace.map((line) => line.split('|')[0] as string);
    expect(new Set(timestamps).size).toBeLessThan(timestamps.length);

    const referenceJson = JSON.stringify(reference);
    for (let run = 0; run < 100; run += 1) {
      expect(JSON.stringify(runScriptedSimulation(new SimKernel()))).toBe(referenceJson);
    }
  });

  it('replays identically from reset() on a single kernel, 100 times', () => {
    const referenceJson = JSON.stringify(runScriptedSimulation(new SimKernel()));

    const kernel = new SimKernel();
    for (let run = 0; run < 100; run += 1) {
      kernel.reset();
      expect(JSON.stringify(runScriptedSimulation(kernel))).toBe(referenceJson);
    }
  });

  it('produces the same trace whether the run is split into windows or done in one pass', () => {
    const traceFor = (windows: readonly SimTime[]): string[] => {
      const kernel = new SimKernel();
      const trace: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        const at = Math.round(mix(i * 3 + 11) * 40) * 0.25;
        kernel.schedule(
          at,
          createEvent('e', { i }, (payload, ctx) => {
            trace.push(`${ctx.time}|${ctx.sequence}|${payload.i}`);
            if (payload.i % 4 === 0) {
              ctx.kernel.scheduleAfter(
                0.5,
                createEvent('f', { i: payload.i }, (inner, innerCtx) => {
                  trace.push(`${innerCtx.time}|${innerCtx.sequence}|f${inner.i}`);
                }),
              );
            }
          }),
        );
      }
      for (const until of windows) {
        kernel.run(until);
      }
      kernel.runUntilEmpty();
      return trace;
    };

    const oneShot = traceFor([]);
    expect(oneShot.length).toBeGreaterThan(40);
    expect(traceFor([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toEqual(oneShot);
    expect(traceFor([0.125, 6.5, 9.75])).toEqual(oneShot);
  });
});

/**
 * Static scans over the module's own source text.
 *
 * The text arrives via Vite's `?raw` loader, deliberately *not* via `node:fs`. Reading it
 * with `node:fs` — as an earlier revision of this file did — pulled `node:fs`, `URL` and
 * `import.meta.url` into a package whose tsconfig declares `lib: ["ES2022"]` and no `types`,
 * which turned `tsc -b` red for the whole build graph. The "ambient environment" test below
 * is the regression guard for exactly that.
 *
 * Every pattern here is written as `/\bNAME\b/`, and every label as a string literal, so the
 * scanners do not match their own definitions once comments and string literals are stripped.
 * That is what makes it safe to run these scans over the test files as well as the sources.
 */
describe('kernel source invariants', () => {
  /** Strip comments so documentation *about* forbidden APIs does not trip the scan. */
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  /** Strip string and template literals, so the pattern labels do not trip the scan. */
  const stripLiterals = (source: string): string =>
    source
      .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

  const scannable = (source: string): string => stripLiterals(stripComments(source));

  /** Every file in the module, sources and tests alike. */
  const files: Array<[string, string]> = [
    ['types.ts', typesSource],
    ['eventQueue.ts', eventQueueSource],
    ['kernel.ts', kernelSource],
    ['index.ts', indexSource],
    ['eventQueue.test.ts', eventQueueTestSource],
    ['kernel.test.ts', kernelTestSource],
  ];

  it('loaded every source file it claims to scan', () => {
    // Guards against a vacuous scan: an empty or missing import would pass every check.
    for (const [name, source] of files) {
      expect(source.length, `${name} source is empty`).toBeGreaterThan(400);
    }
    // And the raw text really is this file's own source, not a transformed or stale copy.
    expect(kernelTestSource).toContain('nonEs2022Ambients');
    expect(kernelSource).toContain('class SimKernel');
    expect(eventQueueSource).toContain('class EventQueue');
  });

  const forbidden: ReadonlyArray<readonly [string, RegExp]> = [
    ['Date.now()', /\bDate\s*\.\s*now\b/],
    ['new Date()', /\bnew\s+Date\b/],
    ['performance.now()', /\bperformance\s*\.\s*now\b/],
    ['process.hrtime()', /\bprocess\s*\.\s*hrtime\b/],
    ['setTimeout', /\bsetTimeout\b/],
    ['setInterval', /\bsetInterval\b/],
    ['setImmediate', /\bsetImmediate\b/],
    ['requestAnimationFrame', /\brequestAnimationFrame\b/],
    ['Math.random()', /\bMath\s*\.\s*random\b/],
  ];

  it.each(files)('%s uses no wall-clock time, no timers and no global RNG', (name, source) => {
    const code = scannable(source);
    expect(code.length).toBeGreaterThan(100);
    for (const [label, pattern] of forbidden) {
      expect(pattern.test(code), `${name} must not use ${label}`).toBe(false);
    }
  });

  /**
   * Ambient names that exist only with Node or DOM type definitions. `packages/core`
   * declares `lib: ["ES2022"]` and no `types`, so any of these is a `tsc -b` failure — the
   * exact break this suite regresses.
   */
  const nonEs2022Ambients: ReadonlyArray<readonly [string, RegExp]> = [
    ['import.meta', /\bimport\s*\.\s*meta\b/],
    ['process', /\bprocess\b/],
    ['Buffer', /\bBuffer\b/],
    ['__dirname', /\b__dirname\b/],
    ['__filename', /\b__filename\b/],
    ['require()', /\brequire\s*\(/],
    ['URL', /\bURL\b/],
    ['fetch()', /\bfetch\s*\(/],
    ['structuredClone', /\bstructuredClone\b/],
    ['TextEncoder', /\bTextEncoder\b/],
    ['TextDecoder', /\bTextDecoder\b/],
  ];

  it.each(files)('%s references no ambient outside lib.es2022', (name, source) => {
    const code = scannable(source);
    for (const [label, pattern] of nonEs2022Ambients) {
      expect(
        pattern.test(code),
        `${name} must not reference ${label}: packages/core declares lib ES2022 and no ` +
          `types, so this fails tsc -b and blocks every downstream project reference`,
      ).toBe(false);
    }
  });

  /** Module specifiers this package may import. Anything else is an undeclared dependency. */
  const allowedPackages = new Set(['vitest']);

  const moduleSpecifiers = (source: string): string[] => {
    const pattern = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*(['"])([^'"\n]*)\1/g;
    const found: string[] = [];
    for (;;) {
      const match = pattern.exec(source);
      if (match === null) {
        return found;
      }
      found.push(match[2] as string);
    }
  };

  it.each(files)(
    '%s imports only relative modules and declared dependencies',
    (name, source) => {
      const specifiers = moduleSpecifiers(stripComments(source));
      for (const specifier of specifiers) {
        const bare = specifier.split('?')[0] as string;
        expect(
          bare.startsWith('.') || allowedPackages.has(bare),
          `${name} pulls in ${specifier} — core/kernel may only import relative modules and ` +
            `${[...allowedPackages].join(', ')}. A Node builtin here needs the node type ` +
            `definitions, which this package does not declare`,
        ).toBe(true);
      }
    },
  );

  it('actually finds the imports it is checking', () => {
    // Guards against a scanner regex that silently matches nothing.
    expect(moduleSpecifiers(kernelSource)).toContain('./eventQueue.js');
    expect(moduleSpecifiers(kernelTestSource)).toContain('vitest');
    expect(moduleSpecifiers(kernelTestSource)).toContain('./kernel.ts?raw');
  });
});
