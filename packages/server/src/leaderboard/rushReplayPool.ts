/// <reference types="node" />

/**
 * **Where a posted rush sitting is replayed: off the request thread, under one global limit** — PR
 * #513's review, finding 2. The argument, the measurements and the refusal it answers with are in
 * `rushSitting.ts`'s cost section; this module is the mechanism.
 *
 * A **slot** is one worker thread and one replay at a time on it. There are `limit` of them for the
 * whole process — never per account, because the review's point was that the per-account cooldown
 * bounds one account's rate and nothing bounds how many accounts replay at once — and there is **no
 * queue**: a caller who finds every slot taken is refused at once rather than parked behind replays
 * of unknown length, which is what lets `http/api.ts` answer `503` with an honest `Retry-After`.
 *
 * A slot is taken by {@link RushReplays.tryAcquire} before anything is charged and held until the
 * replay answers, so a refusal for capacity costs a player nothing, and a lease is released exactly
 * once whichever way the route leaves. Threads start on the first replay that needs them rather than
 * at boot — a server that is never sent a sitting pays for none — and each loads `data/` itself, from
 * the directory the server loaded it from, so the replay reads the same tables the gate read.
 */

import { Worker } from 'node:worker_threads';

import type { RushSittingVerification, SubmittedRushSitting } from './rushSitting.js';

/** What a replay thread is started with. */
export interface RushReplayWorkerInit {
  readonly dataDir: string;
}

/** One replay asked of a thread. */
export interface RushReplayRequest {
  readonly id: number;
  readonly sitting: SubmittedRushSitting;
}

/** What a thread says back. */
export type RushReplayMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'fatal'; readonly message: string }
  | { readonly kind: 'done'; readonly id: number; readonly verification: RushSittingVerification }
  | { readonly kind: 'failed'; readonly id: number; readonly message: string };

/** One slot of the limit, held from before the cooldown is charged until the replay has answered. */
export interface RushReplayLease {
  /** Replay `sitting` on this slot's thread — `rushSitting.ts#replayRushSitting`, answered across the thread. */
  replay(sitting: SubmittedRushSitting): Promise<RushSittingVerification>;
  /** Give the slot back. Idempotent, so every way out of a route may call it. */
  release(): void;
}

export interface RushReplays {
  /** A slot, or `undefined` when every slot is taken — the caller refuses rather than queueing. */
  tryAcquire(): RushReplayLease | undefined;
  /** Whole seconds a refused caller should wait: the rounds in flight at {@link ROUND_ESTIMATE_MS} each. */
  retryAfterS(): number;
  /** Stop every thread. A lease taken after this answers `undefined`. */
  close(): Promise<void>;
}

/**
 * What one round is budgeted at when telling a refused caller how long to wait: the dearest round
 * measured on this path, the review's twelve-round Burj-class sitting under nearest-car at 21 537 ms,
 * rounded up. An estimate for a header, never a bound anything relies on.
 */
const ROUND_ESTIMATE_MS = 1_800;

/** The thread's entry, from this module's own extension — `.ts` under the test runner, `.js` in `dist/`. */
function workerEntryUrl(): URL {
  const extension = /\.tsx?(\?|$)/u.test(import.meta.url) ? 'ts' : 'js';
  return new URL(`./rushReplayWorker.${extension}`, import.meta.url);
}

interface Slot {
  /** The running thread, once it has said it is ready. */
  worker: Worker | undefined;
  /** The thread starting, so two replays on one slot never start two threads. */
  starting: Promise<Worker> | undefined;
  busy: boolean;
  /** The rounds of the sitting on this slot, for {@link RushReplays.retryAfterS}. */
  rounds: number;
}

/**
 * The pool `bootstrap.ts` builds from `ELEVATOR_SIM_RUSH_REPLAYS`. `limit` is the number of replays the
 * whole process runs at once, and the number of threads it will ever start.
 */
export function createRushReplays(options: { readonly dataDir: string; readonly limit: number }): RushReplays {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error(`a rush replay limit must be a whole number of at least one, not ${String(options.limit)}`);
  }
  const slots: Slot[] = Array.from({ length: options.limit }, () => ({ worker: undefined, starting: undefined, busy: false, rounds: 0 }));
  let nextId = 0;
  let closed = false;

  const forget = (slot: Slot, worker: Worker): void => {
    if (slot.worker === worker) slot.worker = undefined;
    slot.starting = undefined;
  };

  const threadFor = (slot: Slot): Promise<Worker> => {
    if (slot.worker !== undefined) return Promise.resolve(slot.worker);
    if (slot.starting !== undefined) return slot.starting;
    const init: RushReplayWorkerInit = { dataDir: options.dataDir };
    const starting = new Promise<Worker>((resolve, reject) => {
      const worker = new Worker(workerEntryUrl(), { workerData: init });
      const onMessage = (message: RushReplayMessage): void => {
        if (message.kind === 'ready') {
          stop();
          // Idle threads do not hold the process open; a thread with a replay on it does (`replay` below).
          worker.unref();
          slot.worker = worker;
          slot.starting = undefined;
          resolve(worker);
        } else if (message.kind === 'fatal') {
          fail(new Error(`the rush replay thread did not start: ${message.message}`));
        }
      };
      const onError = (error: Error): void => {
        fail(error);
      };
      const onExit = (code: number): void => {
        fail(new Error(`the rush replay thread exited with code ${String(code)} before it was ready`));
      };
      const stop = (): void => {
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
      };
      const fail = (error: Error): void => {
        stop();
        forget(slot, worker);
        void worker.terminate();
        reject(error);
      };
      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.on('exit', onExit);
    });
    slot.starting = starting;
    return starting;
  };

  return {
    tryAcquire: () => {
      if (closed) return undefined;
      const slot = slots.find((entry) => !entry.busy);
      if (slot === undefined) return undefined;
      slot.busy = true;
      let released = false;
      return {
        replay: async (sitting) => {
          if (released) throw new Error('a released rush replay lease cannot replay');
          slot.rounds = sitting.rounds.length;
          const worker = await threadFor(slot);
          nextId += 1;
          const id = nextId;
          return new Promise<RushSittingVerification>((resolve, reject) => {
            const onMessage = (message: RushReplayMessage): void => {
              if ((message.kind !== 'done' && message.kind !== 'failed') || message.id !== id) return;
              stop();
              if (message.kind === 'done') resolve(message.verification);
              else reject(new Error(message.message));
            };
            const onError = (error: Error): void => {
              stop();
              forget(slot, worker);
              reject(error);
            };
            const onExit = (code: number): void => {
              stop();
              forget(slot, worker);
              reject(new Error(`the rush replay thread exited with code ${String(code)} during a replay`));
            };
            const stop = (): void => {
              worker.off('message', onMessage);
              worker.off('error', onError);
              worker.off('exit', onExit);
              worker.unref();
            };
            worker.on('message', onMessage);
            worker.on('error', onError);
            worker.on('exit', onExit);
            worker.ref();
            const request: RushReplayRequest = { id, sitting };
            worker.postMessage(request);
          });
        },
        release: () => {
          if (released) return;
          released = true;
          slot.busy = false;
          slot.rounds = 0;
        },
      };
    },
    retryAfterS: () => {
      const rounds = slots.reduce((sum, slot) => sum + (slot.busy ? Math.max(1, slot.rounds) : 0), 0);
      return Math.max(1, Math.ceil((rounds * ROUND_ESTIMATE_MS) / 1000));
    },
    close: async () => {
      closed = true;
      await Promise.all(
        slots.map(async (slot) => {
          const worker = slot.worker ?? (await slot.starting?.catch(() => undefined));
          slot.worker = undefined;
          slot.starting = undefined;
          if (worker !== undefined) await worker.terminate();
        }),
      );
    },
  };
}
