/**
 * The shift runner, driven — the UI readiness audit's B3.
 *
 * Two halves, and they are asked differently on purpose.
 *
 * **The size estimate** is arithmetic and is pinned against a *measured* run, not against itself.
 * `shiftRunCostOf` exists to answer *how big is this about to be* before the expensive thing starts,
 * and a threshold calibrated against a number nobody measured would be a tier that separates
 * nothing. So the cell it has to be right about — `vertical-city` at the longest run the menu
 * offers — carries the count that cell actually generated beside the prediction.
 *
 * **The lifecycle** is driven through the shipped `createShiftRunner` with a worker this file
 * answers for, because the claims that matter are not arithmetic: *cancel actually stops the run*
 * and *the latest ask wins* are statements about `terminate()` and about which results are allowed
 * to reach the screen. A test that asserted the status strings and never delivered a message would
 * be `scope/probes.test-helper.ts`' own complaint about a sink that restates a decision instead of
 * calling it.
 *
 * ## Each assertion was checked against a broken implementation
 *
 * `FIX_BRIEF.md` rule 4 — *a check that cannot fail is not evidence*. Every case below was run
 * against a deliberately broken `dev/shiftRunner.ts` and observed to fail:
 *
 * | case | break applied | result |
 * |---|---|---|
 * | cancel stops the run | `cancel()` without its `stop(); onRunning(false)` | **red in 2** — *terminates the worker* and *does not apply a result after the cancel* |
 * | the latest ask wins | `start()` without its leading `if (current !== undefined) stop()` | **red in 1** — *terminates the run in flight when a new one starts* |
 * | a result for nobody is dropped | the message handler's `if (job === undefined) return` removed | **red in 1** — *does not apply a result that arrives after the cancel* |
 * | the heavy tier | `HEAVY_RUN_ARRIVALS` raised to 20 000 | **red in 1** — the worst cell the menu offers reads ordinary |
 *
 * The third break falsifies fewer cases than it would have before the worker was kept warm, and
 * that is a fact about the fix rather than about the test: a *superseded* run's worker is
 * terminated with its listeners, so the guard is only load-bearing for a **cancel**. Both are
 * asserted; only one of them is what that guard defends.
 */

import { describe, expect, it } from 'vitest';

import { ManualClock } from '../playback/clock.js';
import type { VizRecording } from '../contract/types.js';
import type { SimulationConfig } from '@elevator-sim/core/browser';

import {
  createShiftRunner,
  shiftRunCostOf,
  type ShiftJob,
  type ShiftWorkerLike,
  type ShiftWorkerMessage,
  type ShiftWorkerRequest,
} from './shiftRunner.js';

/* -------------------------------------------------------------------------- *
 * The estimate
 * -------------------------------------------------------------------------- */

describe('a run’s predicted size', () => {
  /**
   * `vertical-city` / `constant-iso` / 7 200 s — the worst cell `menu/types.ts#LONGEST_OFFERED_RUN_S`
   * allows, and the one the audit measured the 31–70 s freeze on.
   *
   * The building is 4 887 people on `office-standard`, whose `typical` band is 12 %/5 min. Measured
   * 2026-08-10 on this worktree at seed 20 260 810 through `record/recordRun.ts`, that cell
   * generates **13 269** arrivals — **the same 13 269 under `collective`, `nearest-car` and
   * `destination-panel`**, because the trace is drawn before any dispatcher sees it. The wall clock
   * is not the same (21–31 s, 47 s and 195–234 s respectively) and is deliberately **not** what the
   * tier is calibrated against: a dispatch fix moves it, and the audit has an open finding about the
   * slowest of the three.
   *
   * The prediction is required to be close to the arrival count rather than merely large. An
   * estimator nobody checked against a run is a number with a unit.
   */
  it('is within a tenth of the arrivals the heaviest offered cell really generates', () => {
    const cost = shiftRunCostOf({ population: 4887, ratePctPop5min: 12, durationS: 7200 });
    expect(cost.arrivals).toBe(14_075);
    expect(Math.abs(cost.arrivals - 13_269) / 13_269).toBeLessThan(0.1);
    expect(cost.heavy).toBe(true);
  });

  it('leaves an ordinary cell ordinary', () => {
    // `midtown-office` — 1 710 people — at 3 %/5 min over 1 800 s, which is the shipped challenge
    // rotation's own first cell and about as ordinary as this product gets.
    const cost = shiftRunCostOf({ population: 1710, ratePctPop5min: 3, durationS: 1800 });
    expect(cost.arrivals).toBe(308);
    expect(cost.heavy).toBe(false);
  });

  it('declines to be impressed by a number it cannot use', () => {
    // The rate is `undefined` for a building whose traffic profile this build does not carry, and
    // `dev/main.ts#costOf` substitutes 0. `NaN people expected` would be worse than saying nothing.
    expect(shiftRunCostOf({ population: 1710, ratePctPop5min: 0, durationS: 1800 }).arrivals).toBe(0);
    expect(shiftRunCostOf({ population: Number.NaN, ratePctPop5min: 3, durationS: 1800 })).toEqual({
      arrivals: 0,
      heavy: false,
    });
  });
});

/* -------------------------------------------------------------------------- *
 * The lifecycle
 * -------------------------------------------------------------------------- */

/** A worker this test answers for. Records what was posted and whether it was terminated. */
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

  /** Deliver a message the way a real worker would. A terminated worker can still be poked here. */
  deliver(message: ShiftWorkerMessage): void {
    this.#onMessage?.({ data: message });
  }

  fail(message: string): void {
    this.#onError?.({ message });
  }
}

/** A recording stands in for the 57 MB one; nothing under test reads a field of it. */
const RECORDING = { runId: 'probe' } as unknown as VizRecording;
const CONFIG = { seed: 7n } as unknown as SimulationConfig;

interface Harness {
  readonly runner: ReturnType<typeof createShiftRunner>;
  readonly clock: ManualClock;
  readonly workers: FakeWorker[];
  readonly status: string[];
  readonly running: boolean[];
  readonly failures: string[];
  readonly delivered: string[];
  job(label: string, arrivals?: number): ShiftJob;
}

function harness(): Harness {
  const workers: FakeWorker[] = [];
  const status: string[] = [];
  const running: boolean[] = [];
  const failures: string[] = [];
  const delivered: string[] = [];
  const clock = new ManualClock(1000);
  const runner = createShiftRunner({
    spawn: () => {
      const next = new FakeWorker();
      workers.push(next);
      return next;
    },
    clock,
    onStatus: (text) => status.push(text),
    onRunning: (value) => running.push(value),
    onFailed: (message) => failures.push(message),
  });
  return {
    runner,
    clock,
    workers,
    status,
    running,
    failures,
    delivered,
    job: (label, arrivals = 300) => ({
      label,
      config: CONFIG,
      outOfServiceCarIds: ['main-D'],
      recordDecisions: true,
      cost: { arrivals, heavy: arrivals > 10_000 },
      onDone: () => delivered.push(label),
    }),
  };
}

describe('starting a run', () => {
  it('posts the config whole, with the held cars beside it', () => {
    const h = harness();
    h.runner.start(h.job('shift'));

    expect(h.workers).toHaveLength(1);
    expect(h.workers[0]?.posted).toEqual([
      {
        kind: 'run',
        config: CONFIG,
        outOfServiceCarIds: ['main-D'],
        recordDecisions: true,
      },
    ]);
    expect(h.runner.isRunning()).toBe(true);
    expect(h.running).toEqual([true]);
  });

  it('says what is running, how long it has been running, and that it is not progress', () => {
    const h = harness();
    h.runner.start(h.job('shift'));
    expect(h.status.at(-1)).toContain('simulating the shift');
    expect(h.status.at(-1)).toContain('0 s so far');
    expect(h.status.at(-1)).toContain('about 300 people expected');
    // The sentence that stops the elapsed counter being read as a progress bar. A run has no
    // interruptible unit, so nothing here can say how far through it is — and saying so is the
    // difference between an honest indicator and a lie with a number in it.
    expect(h.status.at(-1)).toContain('not progress');
    expect(h.status.at(-1)).toContain('Cancel this run');

    h.clock.advance(12_400);
    h.runner.tick();
    expect(h.status.at(-1)).toContain('12 s so far');
  });

  it('names a heavy run as one', () => {
    const h = harness();
    h.runner.start(h.job('shift', 14_075));
    expect(h.status.at(-1)).toContain('a big one');
  });

  it('ticks nothing when nothing is running', () => {
    const h = harness();
    h.runner.tick();
    expect(h.status).toEqual([]);
  });
});

describe('cancelling a run', () => {
  it('terminates the worker rather than asking it to stop', () => {
    const h = harness();
    h.runner.start(h.job('shift'));
    h.clock.advance(9_000);
    h.runner.cancel();

    expect(h.workers[0]?.terminated).toBe(1);
    expect(h.runner.isRunning()).toBe(false);
    expect(h.running).toEqual([true, false]);
    expect(h.status.at(-1)).toContain('cancelled after 9 s');
    expect(h.status.at(-1)).toContain('Nothing was measured');
  });

  it('does not apply a result that arrives after the cancel', () => {
    // The claim the audit asks for in terms — *a cancel that actually stops the run*. `terminate()`
    // is immediate so this message cannot arrive from a real worker; it is delivered anyway,
    // because a runner that would have drawn it is a runner whose cancel is a label.
    const h = harness();
    h.runner.start(h.job('shift'));
    h.runner.cancel();
    h.workers[0]?.deliver({ kind: 'done', recording: RECORDING, startOfDayS: 0 });

    expect(h.delivered).toEqual([]);
    expect(h.running).toEqual([true, false]);
  });

  it('is a no-op when nothing is running', () => {
    const h = harness();
    h.runner.cancel();
    expect(h.status).toEqual([]);
    expect(h.running).toEqual([]);
  });
});

describe('the latest ask wins', () => {
  it('terminates the run in flight when a new one starts', () => {
    const h = harness();
    h.runner.start(h.job('first'));
    h.runner.start(h.job('second'));

    expect(h.workers).toHaveLength(2);
    expect(h.workers[0]?.terminated).toBe(1);
    expect(h.workers[1]?.terminated).toBe(0);
  });

  it('drops the superseded run’s result rather than painting it over the new one', () => {
    const h = harness();
    h.runner.start(h.job('first'));
    h.runner.start(h.job('second'));
    h.workers[0]?.deliver({ kind: 'done', recording: RECORDING, startOfDayS: 0 });
    h.workers[1]?.deliver({ kind: 'done', recording: RECORDING, startOfDayS: 0 });

    expect(h.delivered).toEqual(['second']);
  });
});

describe('a run that finishes', () => {
  it('hands the recording and the run’s hour to the job that asked for it', () => {
    const h = harness();
    const seen: (number | undefined)[] = [];
    h.runner.start({
      ...h.job('shift'),
      onDone: (recording, startOfDayS) => {
        expect(recording).toBe(RECORDING);
        seen.push(startOfDayS);
      },
    });
    h.workers[0]?.deliver({ kind: 'done', recording: RECORDING, startOfDayS: 27_000 });

    expect(seen).toEqual([27_000]);
    expect(h.runner.isRunning()).toBe(false);
    // The worker is **kept**, not terminated: a run that finished has nothing to interrupt, and
    // respawning would put the whole of `core`'s module graph in front of the next press. See
    // `warmWorker`.
    expect(h.workers[0]?.terminated).toBe(0);
  });

  it('sends the next run to the same worker rather than paying for a new one', () => {
    const h = harness();
    h.runner.start(h.job('first'));
    h.workers[0]?.deliver({ kind: 'done', recording: RECORDING, startOfDayS: 0 });
    h.runner.start(h.job('second'));

    expect(h.workers).toHaveLength(1);
    expect(h.workers[0]?.posted).toHaveLength(2);
    expect(h.workers[0]?.terminated).toBe(0);
  });

  it('drops a worker that failed to start rather than keeping it warm', () => {
    const h = harness();
    h.runner.start(h.job('first'));
    h.workers[0]?.fail('module not found');
    h.runner.start(h.job('second'));

    expect(h.workers).toHaveLength(2);
    expect(h.workers[1]?.posted).toHaveLength(1);
  });

  it('reports a run that threw on the far side, and stops running', () => {
    const h = harness();
    h.runner.start(h.job('shift'));
    h.workers[0]?.deliver({ kind: 'failed', message: 'the drain deadline fired' });

    expect(h.failures).toEqual(['the drain deadline fired']);
    expect(h.delivered).toEqual([]);
    expect(h.runner.isRunning()).toBe(false);
  });

  it('reports a worker that could not start at all', () => {
    const h = harness();
    h.runner.start(h.job('shift'));
    h.workers[0]?.fail('module not found');

    expect(h.failures).toEqual(['the shift worker failed to start: module not found']);
    expect(h.runner.isRunning()).toBe(false);
  });
});
