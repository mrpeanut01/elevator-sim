/**
 * The off-thread runner, driven — GitHub issue #165's ordering half.
 *
 * Moving a run off the painting thread makes it **asynchronous**, and that buys a new class of
 * defect the synchronous version could not have: a screen drawn against a run the player has left,
 * and two runs in flight racing to be the one drawn. So the claims asserted here are about
 * *lifecycle*, not arithmetic — which ask's callbacks fire, in what order, and which worker was
 * terminated. `dev/shiftRunner.test.ts` makes the same argument about the shift and this file is
 * its sibling: a test that asserted the runner's bookkeeping without ever delivering a message
 * would restate a decision instead of calling it.
 *
 * The runner is driven through the shipped `createOffThreadRunner` with a worker this file answers
 * for, so `postMessage`, `terminate` and the reply are all observable.
 *
 * ## Each assertion was checked against a broken implementation
 *
 * `FIX_BRIEF.md` rule 4 — *a check that cannot fail is not evidence*. Every case below was run
 * against a deliberately broken `dev/offThreadRuns.ts` and observed to fail; the table is in this
 * lane's report and the breaks are named beside each case.
 */

import { describe, expect, it } from 'vitest';

import type { SimulationConfig } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';

import { createOffThreadRunner, type OffThreadRunnerHandle } from './offThreadRuns.js';
import type { ShiftWorkerLike, ShiftWorkerMessage, ShiftWorkerRequest } from './shiftRunner.js';

/** A worker this test answers for — `dev/shiftRunner.test.ts`'s, kept identical on purpose. */
class FakeWorker implements ShiftWorkerLike {
  readonly posted: ShiftWorkerRequest[] = [];
  terminated = 0;
  #onMessage: ((event: { readonly data: unknown }) => void) | undefined;
  #onError: ((event: { readonly message: string }) => void) | undefined;

  postMessage(message: ShiftWorkerRequest): void {
    this.posted.push(message);
  }

  addEventListener(type: 'message', handler: (event: { readonly data: unknown }) => void): void;
  addEventListener(type: 'error', handler: (event: { readonly message: string }) => void): void;
  addEventListener(type: 'message' | 'error', handler: (event: never) => void): void {
    if (type === 'message') this.#onMessage = handler as (event: { data: unknown }) => void;
    else this.#onError = handler as (event: { message: string }) => void;
  }

  terminate(): void {
    this.terminated += 1;
  }

  /** Deliver a reply the way a real worker would. A terminated worker can still be poked here. */
  deliver(message: ShiftWorkerMessage): void {
    this.#onMessage?.({ data: message });
  }

  fail(message: string): void {
    this.#onError?.({ message });
  }
}

/** Recordings stand in for the megabytes; nothing under test reads a field of one. */
const recordingNamed = (runId: string): VizRecording => ({ runId }) as unknown as VizRecording;
const configNamed = (seed: bigint): SimulationConfig => ({ seed }) as unknown as SimulationConfig;

const done = (runId: string): ShiftWorkerMessage => ({
  kind: 'done',
  recording: recordingNamed(runId),
  startOfDayS: undefined,
});

interface Harness {
  readonly runner: OffThreadRunnerHandle;
  readonly workers: FakeWorker[];
  /** Every `onDone` that fired, as `ask → the runIds it was handed, in order`. */
  readonly answered: string[];
  readonly failures: string[];
}

function harness(): Harness {
  const workers: FakeWorker[] = [];
  const answered: string[] = [];
  const failures: string[] = [];
  const runner = createOffThreadRunner({
    spawn: () => {
      const next = new FakeWorker();
      workers.push(next);
      return next;
    },
  });
  return { runner, workers, answered, failures };
}

/** The ask a caller makes, tagged so the recorder can say *which* ask answered. */
function ask(
  h: Harness,
  tag: string,
  seeds: readonly [bigint, ...bigint[]],
): Parameters<OffThreadRunnerHandle['start']>[0] {
  return {
    runs: seeds.map((seed) => ({
      config: configNamed(seed),
      outOfServiceCarIds: [],
      recordDecisions: false,
    })) as unknown as Parameters<OffThreadRunnerHandle['start']>[0]['runs'],
    onDone: (recordings) => {
      h.answered.push(`${tag}:${recordings.map((recording) => recording.runId).join(',')}`);
    },
    onFailed: (message) => {
      h.failures.push(`${tag}:${message}`);
    },
  };
}

describe('one run, off the thread', () => {
  it('posts the whole config rather than an id, and hands the recording back', () => {
    const h = harness();
    h.runner.start(ask(h, 'watch', [7n]));

    const worker = h.workers[0];
    expect(h.workers).toHaveLength(1);
    expect(worker?.posted).toHaveLength(1);
    /*
     * The **whole** config crosses — `dev/shiftRunner.ts`'s header argues why at length, and the
     * short form is that re-deriving it on the far side would be a second answer to *what is this
     * run*, invisible until the legs disagreed.
     */
    expect(worker?.posted[0]?.config).toEqual(configNamed(7n));
    expect(h.runner.isRunning()).toBe(true);

    worker?.deliver(done('a'));
    expect(h.answered).toEqual(['watch:a']);
    expect(h.runner.isRunning()).toBe(false);
  });

  it('carries the two switches the far side must not decide for itself', () => {
    const h = harness();
    h.runner.start(ask(h, 'watch', [7n]));
    /*
     * Both are **sent**, never defaulted here and never left to the worker. `recordRun` defaults
     * `recordDecisions` to `true` and a decision log is part of the recording, so a runner that
     * silently supplied `false` would change what the caller got back — which is why
     * `OffThreadRun` requires the field rather than offering a convenient default.
     */
    expect(h.workers[0]?.posted[0]?.recordDecisions).toBe(false);
    expect(h.workers[0]?.posted[0]?.outOfServiceCarIds).toEqual([]);
    /*
     * And the other value crosses too, rather than a default winning over what was asked for. It
     * is read off the **second** worker: this ask supersedes the first, and a supersede takes the
     * worker with it — which is `start`'s own rule showing up in an assertion about something
     * else, and is why the reading is not `posted[1]` on the first one.
     */
    h.runner.start({
      runs: [{ config: configNamed(9n), outOfServiceCarIds: ['main-D'], recordDecisions: true }],
      onDone: () => undefined,
      onFailed: () => undefined,
    });
    expect(h.workers).toHaveLength(2);
    expect(h.workers[1]?.posted[0]?.recordDecisions).toBe(true);
    expect(h.workers[1]?.posted[0]?.outOfServiceCarIds).toEqual(['main-D']);
  });
});

describe('an ask of two runs', () => {
  /*
   * Fix-a-building's press is a pair — as-built then as-repaired — and the pair must not supersede
   * itself. Serial rather than concurrent is what makes the correlation trivial: at most one
   * request is outstanding, so the reply that arrives belongs to the request that is out.
   */
  it('runs them one at a time, in order, and answers once with both', () => {
    const h = harness();
    h.runner.start(ask(h, 'fixit', [1n, 2n]));

    const worker = h.workers[0];
    expect(worker?.posted).toHaveLength(1);
    expect(worker?.posted[0]?.config).toEqual(configNamed(1n));

    worker?.deliver(done('before'));
    // Not answered yet, and the second is only posted now — never both at once.
    expect(h.answered).toEqual([]);
    expect(worker?.posted).toHaveLength(2);
    expect(worker?.posted[1]?.config).toEqual(configNamed(2n));
    expect(h.runner.isRunning()).toBe(true);

    worker?.deliver(done('after'));
    expect(h.answered).toEqual(['fixit:before,after']);
    expect(h.runner.isRunning()).toBe(false);
  });

  it('keeps the worker warm across the pair and across asks', () => {
    const h = harness();
    h.runner.start(ask(h, 'fixit', [1n, 2n]));
    h.workers[0]?.deliver(done('before'));
    h.workers[0]?.deliver(done('after'));
    h.runner.start(ask(h, 'again', [3n]));
    // One spawn, three posts. `dev/shiftRunner.ts` measured what respawning costs: every spawn
    // re-imports `recordRun` and the whole of `core`.
    expect(h.workers).toHaveLength(1);
    expect(h.workers[0]?.posted).toHaveLength(3);
    expect(h.workers[0]?.terminated).toBe(0);
  });
});

describe('the ordering', () => {
  /*
   * The class of defect a moved run buys: a superseded ask still resolving, and painting a screen
   * the player has left. Both are asserted as the **absence** of a callback, which is the only way
   * to say it.
   */
  it('the latest ask wins, and the superseded one never answers', () => {
    const h = harness();
    h.runner.start(ask(h, 'first', [1n]));
    h.runner.start(ask(h, 'second', [2n]));

    // The run in flight was still burning a core, so it is terminated rather than flagged.
    expect(h.workers[0]?.terminated).toBe(1);
    expect(h.workers).toHaveLength(2);
    expect(h.workers[1]?.posted[0]?.config).toEqual(configNamed(2n));

    // The first ask's worker answering late reaches nobody — its listeners read `current`.
    h.workers[0]?.deliver(done('stale'));
    expect(h.answered).toEqual([]);

    h.workers[1]?.deliver(done('fresh'));
    expect(h.answered).toEqual(['second:fresh']);
  });

  it('supersedes a pair whole, so half an ask is never drawn', () => {
    const h = harness();
    h.runner.start(ask(h, 'first', [1n, 2n]));
    h.workers[0]?.deliver(done('before'));
    // One of the two is in hand. A second ask must drop it rather than carry it into the answer.
    h.runner.start(ask(h, 'second', [3n]));
    h.workers[1]?.deliver(done('only'));
    expect(h.answered).toEqual(['second:only']);
  });

  it('a cancelled ask is silent, and its worker is gone', () => {
    const h = harness();
    h.runner.start(ask(h, 'first', [1n]));
    h.runner.cancel();
    expect(h.workers[0]?.terminated).toBe(1);
    expect(h.runner.isRunning()).toBe(false);
    h.workers[0]?.deliver(done('after the cancel'));
    expect(h.answered).toEqual([]);
    expect(h.failures).toEqual([]);
  });

  it('cancel is a no-op when nothing is running', () => {
    const h = harness();
    h.runner.cancel();
    expect(h.workers).toHaveLength(0);
  });
});

describe('failure', () => {
  it('reports a run that threw on the far side, and stops being busy', () => {
    const h = harness();
    h.runner.start(ask(h, 'fixit', [1n, 2n]));
    h.workers[0]?.deliver({ kind: 'failed', message: 'the conservation audit failed' });
    expect(h.failures).toEqual(['fixit:the conservation audit failed']);
    expect(h.answered).toEqual([]);
    expect(h.runner.isRunning()).toBe(false);
    // And the second run of the pair is not posted after the first one failed.
    expect(h.workers[0]?.posted).toHaveLength(1);
  });

  it('reports a worker that never loaded, and drops it rather than keeping it warm', () => {
    const h = harness();
    h.runner.start(ask(h, 'watch', [1n]));
    h.workers[0]?.fail('Failed to fetch dynamically imported module');
    expect(h.failures).toEqual([
      'watch:the run worker failed to start: Failed to fetch dynamically imported module',
    ]);
    expect(h.workers[0]?.terminated).toBe(1);
    h.runner.start(ask(h, 'retry', [2n]));
    expect(h.workers).toHaveLength(2);
  });

  it('a failure arriving for an abandoned ask reaches nobody', () => {
    const h = harness();
    h.runner.start(ask(h, 'first', [1n]));
    h.runner.cancel();
    h.workers[0]?.deliver({ kind: 'failed', message: 'too late' });
    h.workers[0]?.fail('too late');
    expect(h.failures).toEqual([]);
  });
});
