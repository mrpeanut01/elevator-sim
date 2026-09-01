/**
 * **One ask, one or two runs, none of them on the thread that paints** — GitHub issue #165, and the
 * third near side of a seam this package has had since `dev/batchWorker.ts`.
 *
 * ## What was wrong
 *
 * Three surfaces called `record/recordRun.ts` **synchronously in a click handler**: both
 * Fix-a-building shells (`everyday/fixitScreen.ts`, `dev/fixitPanel.ts`) and the Watch picker's
 * reproduction gate (`dev/watchPanel.ts`). Each said so in its own docstring and none was
 * optimised, which made three stated costs and no measurement. Measured on this container by
 * `dev/measure.surfaceRuns.test.ts` before any of it moved:
 *
 * | surface | blocking wall clock, over the shipped population | transport, both clones |
 * |---|---|---|
 * | Fix-a-building, opening a case (one run) | 11–474 ms, median 87 | 1.9–40.9 ms |
 * | Fix-a-building, `Run the day` (the pair) | 24–846 ms, median 146 | 3.2–72.0 ms |
 * | Watch, the two shipped reference rows | 6 ms and 150 ms | 1.2 and 10.7 ms |
 * | Watch, the worst row the picker can offer — a filed `vertical-city` day at 7 200 s | **4 351 ms** | 387.6 ms |
 *
 * The last row is the finding rather than the total. Watch's stated cost was *"~0.2–1.5 s"*, and
 * the rows it was measured against are the two references — 6 ms and 150 ms, *below* the range it
 * claimed. But a picker row is a **filed day**, which is whatever the player ran, up to
 * `menu/types.ts#LONGEST_OFFERED_RUN_S` on any tower they have played; and that row blocks for
 * three times the stated ceiling. A stated cost measured on the cheap half of its own population
 * is § D227's stale refusal wearing a number.
 *
 * ## Why this is not `dev/shiftRunner.ts`
 *
 * That runner is the **shift**: it owns an elapsed-seconds status line, a predicted-arrivals tier,
 * a job label and a cancel button, all of which are the shift transport's chrome. These three
 * surfaces have their own busy states — a relabelled, disabled button, and a measuring line where
 * the figures will go — and none of them wants a status line. What they share with the shift is the
 * *transport*, and that is what is shared: the protocol below is
 * `dev/shiftRunner.ts`'s (`ShiftWorkerRequest`/`ShiftWorkerMessage`) and the far side is
 * `dev/shiftWorker.ts`, unchanged.
 *
 * Reusing a worker under the name of its first caller is this package's established practice rather
 * than a shortcut: `dev/batchWorker.ts` is spawned by `dev/batchPanel.ts`, `dev/campaignPanel.ts`,
 * `dev/suitePanel.ts`, `everyday/benchScreen.ts` and `everyday/boardScreen.ts`, and none of them
 * renamed it. What matters is that `record/recordRun.ts` stays the **only** place in the package
 * that constructs a `Simulation`, which is what keeps the honesty sweep, the CLI, the scope probes,
 * the shift and these three surfaces measuring the same simulator.
 *
 * ## Determinism across the boundary, which is the thing that could quietly go wrong
 *
 * CLAUDE.md invariant 2 is that every draw comes from a named stream on the injected `StreamSet`,
 * and invariant 5 is that a record replays from its seed. A worker that re-derived its own config,
 * or received one whose `bigint` seed or `ReadonlyMap` indexes did not survive the crossing, would
 * destroy both **silently** — the run would still finish, and only the legs would disagree.
 *
 * Two things stop that, and neither is an argument. The **whole** `SimulationConfig` crosses, so
 * there is exactly one answer in the product to *what is this run* — `dev/shiftRunner.ts`'s header
 * argues this at length and it is the same argument here. And the crossing is
 * `structuredClone`, asserted byte-identical **per surface** rather than in general:
 * `record/recordRun.test.ts` holds the fixture case, `fixit/run.test.ts` holds both of a case's
 * configs for all eighteen shipped cases, and `watch/reference.test.ts` holds the watch config. A
 * JSON transport is run beside each and required to fail, because a test that only asserts
 * *structured clone works* would pass just as happily against a transport that did not.
 *
 * ## The ordering, and why an ask is a list rather than a call per run
 *
 * A moved run is asynchronous, so two new failures become possible: a screen drawing against a run
 * the player has left, and two runs in flight racing to be drawn. Fix-a-building needs **two** runs
 * per press and they must not supersede one another; a player switching cases must supersede the
 * pair whole.
 *
 * So the unit is the **ask** — a non-empty list of runs, delivered in order, answered once. At most
 * one request is outstanding at any moment, which is what makes the correlation trivial: the reply
 * that arrives belongs to the request that is out, and no id is needed to say so. A new ask
 * `terminate()`s whatever was in flight, on `dev/batchWorker.ts`'s own ground that a replication
 * cannot be interrupted cooperatively — and the abandoned ask's callbacks are **never called**,
 * which is the property `offThreadRuns.test.ts` drives directly. A superseded ask that still
 * resolved is precisely the stale-render bug this seam is supposed to remove.
 *
 * ## The worker is kept warm
 *
 * `dev/shiftRunner.ts` measured why: every spawn re-imports `record/recordRun.ts` and the whole of
 * `core`, and the browser tier went 25.7 s → 70.7 s with a worker per run against 58.3 s with one
 * kept warm. Reuse is safe for that file's reason — the worker holds no state between runs. A
 * superseded or cancelled ask takes its worker with it, because `terminate()` is the only way to
 * stop a replication; the next ask spawns a fresh one.
 *
 * Recorded here under [§ D405](../../../../DECISIONS.md): every decision above is about this
 * module's own seam and the three callers it was built for, so this docstring is the record the
 * working agreement asks for.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';

import type { ShiftWorkerLike, ShiftWorkerMessage } from './shiftRunner.js';

/**
 * One simulation, in `recordRun`'s own three arguments — **all three required**.
 *
 * Neither switch is defaulted, and that is `dev/shiftRunner.ts`'s protocol rule for the same two
 * fields: *passed rather than defaulted so the far side decides nothing*. It is load-bearing here
 * rather than tidy. `recordRun` defaults `recordDecisions` to **true**, the Watch gate relied on
 * that default, and a decision log is *in* the recording — so a convenient default of `false` on
 * this interface would have handed the stage a different replay than the synchronous gate
 * produced, silently, on a surface whose whole job is deciding whether a run reproduces.
 */
export interface OffThreadRun {
  readonly config: SimulationConfig;
  /** `recordRun`'s second argument. `fixit/run.ts#FIXIT_RUN_SWITCHES` settles it for both shells. */
  readonly outOfServiceCarIds: readonly string[];
  readonly recordDecisions: boolean;
}

/**
 * What a caller asks for: runs delivered in order, answered once.
 *
 * A non-empty tuple rather than an array, so an empty ask — which could only ever be a caller bug,
 * and would leave a busy state up with nothing coming — is a type error rather than a runtime
 * branch nobody exercises.
 */
export interface OffThreadAsk {
  readonly runs: readonly [OffThreadRun, ...OffThreadRun[]];
  /** The recordings, in `runs`' order. Never called for an ask that was cancelled or superseded. */
  readonly onDone: (recordings: readonly VizRecording[]) => void;
  /** A run that threw, on either side of the boundary. Same rule: never for an abandoned ask. */
  readonly onFailed: (message: string) => void;
}

export interface OffThreadRunnerHandle {
  /** Run these. Terminates whatever ask was in flight — the latest ask wins, and the earlier one is silent. */
  start(ask: OffThreadAsk): void;
  /** Stop the ask in flight, immediately and silently. A no-op when nothing is running. */
  cancel(): void;
  /** Whether an ask is in flight. */
  isRunning(): boolean;
}

export interface OffThreadRunnerOptions {
  /**
   * Start a worker. The shipped callers pass
   * `new Worker(new URL('./shiftWorker.ts', import.meta.url), { type: 'module' })`; the test passes
   * one it can answer for.
   *
   * A factory rather than one long-lived worker, because cancellation is `terminate()` and that
   * ends the worker along with the run.
   */
  readonly spawn: () => ShiftWorkerLike;
}

export function createOffThreadRunner(options: OffThreadRunnerOptions): OffThreadRunnerHandle {
  const { spawn } = options;

  let worker: ShiftWorkerLike | undefined;
  let current: OffThreadAsk | undefined;
  let done: VizRecording[] = [];

  /**
   * End the worker as well as the ask.
   *
   * Only called where an ask has to *stop* — a cancel, or a new ask arriving over one in flight.
   * An ask that simply finished keeps its worker warm; see the header.
   */
  function stop(): void {
    worker?.terminate();
    worker = undefined;
    current = undefined;
    done = [];
  }

  function post(ask: OffThreadAsk, index: number): void {
    const run = ask.runs[index];
    if (run === undefined) return;
    warmWorker().postMessage({
      kind: 'run',
      config: run.config,
      outOfServiceCarIds: run.outOfServiceCarIds,
      recordDecisions: run.recordDecisions,
    });
  }

  /**
   * The worker to send the next run to — the one from last time when there is one.
   *
   * The listeners are attached once and read `current` rather than closing over an ask, so a reply
   * for an ask that has been cancelled finds `current` cleared and is dropped. That is
   * `dev/shiftRunner.ts`'s arrangement, for its reason.
   *
   * **It also checks that the reply came from the worker this runner is currently using, and that
   * second half is not redundant** — it was written because `offThreadRuns.test.ts` caught its
   * absence. `current === undefined` catches a *cancel*; it does not catch a **supersede**, where a
   * new ask is in `current` and a late reply from the terminated worker would be counted into
   * *its* results. In a browser `Worker.terminate()` is immediate and no such reply can arrive, so
   * the guard defends against a boundary this package cannot observe rather than one it has seen —
   * which is precisely the kind of thing to hold with a check rather than with an argument about
   * another platform's timing. `dev/shiftRunner.ts` reads `current` alone and its own test
   * docstring records the same limitation.
   */
  function warmWorker(): ShiftWorkerLike {
    const held = worker;
    if (held !== undefined) return held;
    const next = spawn();
    worker = next;
    next.addEventListener('message', (event) => {
      const ask = current;
      if (ask === undefined || worker !== next) return;
      const message = event.data as ShiftWorkerMessage;
      if (message.kind === 'failed') {
        current = undefined;
        done = [];
        ask.onFailed(message.message);
        return;
      }
      done.push(message.recording);
      if (done.length < ask.runs.length) {
        post(ask, done.length);
        return;
      }
      const recordings = done;
      current = undefined;
      done = [];
      ask.onDone(recordings);
    });
    next.addEventListener('error', (event) => {
      const ask = current;
      if (ask === undefined || worker !== next) return;
      // A worker that failed to start is a worker, so it is dropped rather than kept warm: the next
      // ask gets a fresh attempt instead of posting into something that never loaded.
      stop();
      ask.onFailed(`the run worker failed to start: ${event.message}`);
    });
    return next;
  }

  return {
    isRunning: () => current !== undefined,

    start(ask) {
      /*
       * **The latest ask wins, and the loser is silent.** Without this a player who opened a second
       * case would get the first one's answer painted over the second, and the screen would be
       * about a case they had left. It is `stop()` rather than a flag because the run in flight is
       * still burning a core.
       */
      if (current !== undefined) stop();
      current = ask;
      done = [];
      post(ask, 0);
    },

    cancel() {
      if (current === undefined) return;
      stop();
    },
  };
}
