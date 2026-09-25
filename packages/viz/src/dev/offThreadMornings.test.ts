/**
 * The judge's morning pool — `dev/offThreadMornings.ts`, [§ D1020](../../../../DECISIONS.md).
 *
 * Driven with workers this file answers for, because what can go wrong is ordering and supersession
 * rather than simulation: readings dealt to several workers must come back in the ask's order, a
 * pool of one must give the same answer as a pool of four, and a superseded ask must be silent —
 * `dev/offThreadRuns.ts`'s protocol, which the judge's orchestration relies on.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import type { MorningReading } from '../fixit/run.js';
import type { ComplaintMeasure } from '../fixit/types.js';

import type { MorningWorkerMessage, MorningWorkerRequest } from './morningWorker.js';
import { createOffThreadMornings, MAX_MORNING_WORKERS, morningWorkerCountOf, type MorningWorkerLike } from './offThreadMornings.js';

const MEASURE: ComplaintMeasure = { kind: 'long-waits', label: 'waits', thresholdS: 60, scope: { mode: 'origin', floorIds: ['1'] } };

interface FakeWorker extends MorningWorkerLike {
  readonly inbox: MorningWorkerRequest[];
  answer(): void;
  terminated: boolean;
}

function fakeWorker(): FakeWorker {
  const listeners: ((event: { readonly data: unknown }) => void)[] = [];
  const worker: FakeWorker = {
    inbox: [],
    terminated: false,
    postMessage(message) {
      worker.inbox.push(message);
    },
    addEventListener(type: 'message' | 'error', handler: (event: never) => void) {
      if (type === 'message') listeners.push(handler as (event: { readonly data: unknown }) => void);
    },
    terminate() {
      worker.terminated = true;
    },
    answer() {
      const request = worker.inbox.shift();
      if (request === undefined) return;
      const seed = Number(request.config.seed);
      const reading: MorningReading = { complaint: seed, restAwayPct: 90, restBoarded: 10 };
      const message: MorningWorkerMessage = { kind: 'done', index: request.index, reading };
      for (const listener of listeners) listener({ data: message });
    },
  };
  return worker;
}

const configs = (n: number): readonly [SimulationConfig, ...SimulationConfig[]] =>
  Array.from({ length: n }, (_, i) => ({ seed: BigInt(i + 1) }) as unknown as SimulationConfig) as unknown as readonly [
    SimulationConfig,
    ...SimulationConfig[],
  ];

/** Answer whatever is outstanding on every worker, in a scrambled order, until nothing is. */
function drain(workers: readonly FakeWorker[]): void {
  for (let guard = 0; guard < 1000; guard += 1) {
    const busy = [...workers].reverse().filter((worker) => worker.inbox.length > 0);
    if (busy.length === 0) return;
    for (const worker of busy) worker.answer();
  }
}

describe('the morning pool', () => {
  it('puts readings back in the ask’s order however the workers finish, at any pool size', () => {
    for (const size of [1, 3, MAX_MORNING_WORKERS]) {
      const workers: FakeWorker[] = [];
      const runner = createOffThreadMornings({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; }, workers: size });
      let got: readonly MorningReading[] | undefined;
      runner.start({ configs: configs(49), measure: MEASURE, onDone: (r) => { got = r; }, onFailed: (m) => { throw new Error(m); } });
      expect(workers).toHaveLength(size);
      expect(runner.isRunning()).toBe(true);
      drain(workers);
      expect(got?.map((r) => r.complaint)).toEqual(Array.from({ length: 49 }, (_, i) => i + 1));
      expect(runner.isRunning()).toBe(false);
    }
  });

  it('keeps a superseded ask silent and terminates its workers', () => {
    const workers: FakeWorker[] = [];
    const runner = createOffThreadMornings({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; }, workers: 2 });
    let first = 0;
    let second: readonly MorningReading[] | undefined;
    runner.start({ configs: configs(5), measure: MEASURE, onDone: () => { first += 1; }, onFailed: () => { first += 1; } });
    const firstPool = [...workers];
    runner.start({ configs: configs(3), measure: MEASURE, onDone: (r) => { second = r; }, onFailed: (m) => { throw new Error(m); } });
    expect(firstPool.every((worker) => worker.terminated)).toBe(true);
    drain(firstPool);
    drain(workers.filter((worker) => !firstPool.includes(worker)));
    expect(first).toBe(0);
    expect(second?.map((r) => r.complaint)).toEqual([1, 2, 3]);
  });

  it('reports each reading as it lands, and a handler that cancels stops the pool — § D1120', () => {
    const workers: FakeWorker[] = [];
    const runner = createOffThreadMornings({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; }, workers: 2 });
    const heard: number[] = [];
    let done = 0;
    runner.start({
      configs: configs(49),
      measure: MEASURE,
      onReading: (index, reading) => {
        heard.push(index);
        expect(reading.complaint).toBe(index + 1);
        if (heard.length === 10) runner.cancel();
      },
      onDone: () => {
        done += 1;
      },
      onFailed: (m) => {
        throw new Error(m);
      },
    });
    drain(workers);
    /* Ten heard, in the order the two workers answered, and nothing after the cancel. */
    expect(heard).toHaveLength(10);
    expect(new Set(heard).size).toBe(10);
    expect(done).toBe(0);
    expect(workers.every((worker) => worker.terminated)).toBe(true);
    expect(runner.isRunning()).toBe(false);
  });

  it('sizes the pool from the machine, leaving a core to the painting thread and one to the pair', () => {
    expect(morningWorkerCountOf(undefined)).toBe(1);
    expect(morningWorkerCountOf(2)).toBe(1);
    expect(morningWorkerCountOf(4)).toBe(2);
    expect(morningWorkerCountOf(16)).toBe(MAX_MORNING_WORKERS);
  });
});
