/**
 * **The fix-it judge's mornings, on a small pool of workers** — [§ D1020](../../../../DECISIONS.md).
 *
 * `fixit/judge.ts#MorningRunner`, built. Its protocol is `dev/offThreadRuns.ts`'s and for that
 * file's reasons: an ask is a non-empty list answered once, in order; the latest ask wins; a
 * superseded or cancelled ask is **silent** and takes its workers with it, because `terminate()` is
 * the only way to stop a simulation mid-run; and an ask that simply finished keeps its workers warm.
 *
 * ## Why a pool rather than `offThreadRuns`' one worker
 *
 * A clearing press asks for forty-nine after-runs, and a case opened cold asks for forty-nine
 * as-built ones. On one worker that is forty-nine runs end to end — on `vertical-city` about seven
 * hundred milliseconds each in node — and the player is waiting on it. The runs are independent, so
 * they are dealt to up to {@link MAX_MORNING_WORKERS} workers and put back in order by index. That
 * is an optimisation and nothing in the judge depends on it: one worker gives the same readings in
 * the same order, which `offThreadMornings.test.ts` holds.
 *
 * ## Why a reading crosses and a recording does not
 *
 * `dev/morningWorker.ts` measures the run where it ran and sends back three numbers. Forty-nine
 * recordings held until the last one lands would be hundreds of megabytes on the painting thread
 * for figures nobody draws.
 */

import type { MorningAsk, MorningRunner } from '../fixit/judge.js';
import type { MorningReading } from '../fixit/run.js';
import { FIXIT_RUN_SWITCHES } from '../fixit/run.js';

import type { MorningWorkerMessage, MorningWorkerRequest } from './morningWorker.js';

/** The structural half of a `Worker` this runner uses — a test passes one it can answer for. */
export interface MorningWorkerLike {
  postMessage(message: MorningWorkerRequest): void;
  addEventListener(type: 'message', handler: (event: { readonly data: unknown }) => void): void;
  addEventListener(type: 'error', handler: (event: { readonly message: string }) => void): void;
  terminate(): void;
}

/** The pool's ceiling, whatever the machine. */
export const MAX_MORNING_WORKERS = 4;

export interface OffThreadMorningsOptions {
  readonly spawn: () => MorningWorkerLike;
  /** How many workers to deal the mornings to. Clamped to 1 … {@link MAX_MORNING_WORKERS}. */
  readonly workers: number;
}

/**
 * How many workers a machine gets: its cores less **two** — one for the painting thread and one for
 * the pair's own worker, which `offThreadRuns` keeps warm beside this pool — never fewer than one.
 * Cores less one was the first draft and the browser tier caught it: on a four-core box the three
 * morning workers and the pair's worker took every core, and the Engineer panel's frame sampler saw
 * the page stop painting for a second.
 */
export function morningWorkerCountOf(hardwareConcurrency: number | undefined): number {
  const cores = hardwareConcurrency ?? 2;
  return Math.max(1, Math.min(MAX_MORNING_WORKERS, cores - 2));
}

export function createOffThreadMornings(options: OffThreadMorningsOptions): MorningRunner {
  const size = Math.max(1, Math.min(MAX_MORNING_WORKERS, Math.floor(options.workers)));
  let pool: MorningWorkerLike[] = [];
  let current: MorningAsk | undefined;
  let readings: (MorningReading | undefined)[] = [];
  let nextIndex = 0;
  let landed = 0;

  function stop(): void {
    for (const worker of pool) worker.terminate();
    pool = [];
    current = undefined;
    readings = [];
    nextIndex = 0;
    landed = 0;
  }

  function feed(worker: MorningWorkerLike): void {
    const ask = current;
    if (ask === undefined) return;
    const index = nextIndex;
    const config = ask.configs[index];
    if (config === undefined) return;
    nextIndex += 1;
    worker.postMessage({
      kind: 'morning',
      index,
      config,
      measure: ask.measure,
      outOfServiceCarIds: FIXIT_RUN_SWITCHES.outOfServiceCarIds,
      recordDecisions: FIXIT_RUN_SWITCHES.recordDecisions,
    });
  }

  function spawnOne(): MorningWorkerLike {
    const worker = options.spawn();
    worker.addEventListener('message', (event) => {
      const ask = current;
      if (ask === undefined || !pool.includes(worker)) return;
      const message = event.data as MorningWorkerMessage;
      if (message.kind === 'failed') {
        current = undefined;
        readings = [];
        ask.onFailed(message.message);
        return;
      }
      readings[message.index] = message.reading;
      landed += 1;
      if (landed < ask.configs.length) {
        feed(worker);
        return;
      }
      const done = readings as MorningReading[];
      current = undefined;
      readings = [];
      ask.onDone(done);
    });
    worker.addEventListener('error', (event) => {
      const ask = current;
      if (ask === undefined || !pool.includes(worker)) return;
      stop();
      ask.onFailed(`a morning worker failed to start: ${event.message}`);
    });
    return worker;
  }

  return {
    isRunning: () => current !== undefined,

    start(ask) {
      if (current !== undefined) stop();
      current = ask;
      readings = new Array<MorningReading | undefined>(ask.configs.length);
      nextIndex = 0;
      landed = 0;
      const wanted = Math.min(size, ask.configs.length);
      while (pool.length < wanted) pool.push(spawnOne());
      for (const worker of pool.slice(0, wanted)) feed(worker);
    },

    cancel() {
      if (current === undefined) return;
      stop();
    },
  };
}
