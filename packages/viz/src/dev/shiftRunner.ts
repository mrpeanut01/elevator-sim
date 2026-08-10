/**
 * The shift run, taken off the thread that paints — the second worker in this package, and the
 * one the player meets first.
 *
 * ## What was wrong
 *
 * `dev/main.ts#runShift` called `record/recordRun.ts` directly, and `recordRun` holds the only
 * `new Simulation` in the viewer. `Simulation.run()` is **one synchronous call**, so a shift ran
 * on the painting thread from the first click to the last delivery.
 *
 * Measured in Node on 2026-08-10, seed 20 260 810, on the worst cell the menu offers —
 * `vertical-city` (4 887 people) / `constant-iso` at the 7 200 s
 * `menu/types.ts#LONGEST_OFFERED_RUN_S`, two clicks from the menu, with no progress indication and
 * no way out:
 *
 * | dispatcher | wall clock | legs |
 * |---|---|---|
 * | `collective` | **21–31 s** over four runs | 22 185 |
 * | `nearest-car` | 47 s | 22 076 |
 * | `destination-panel` | **195–234 s** over three runs | 18 236 |
 *
 * All three generate the same **13 269** arrivals, which is the trace being drawn before the
 * dispatcher sees it. The UI readiness audit measured 31 s uncontended and 57–70 s under load in a
 * browser on the third row.
 *
 * **The third row is quoted as a range and is not what anything here is sized against**, for two
 * reasons stated rather than glossed: it varied fourfold across this file's own measurement
 * sessions on one machine, so it is not a number to pin; and the audit's separate B1 finding is
 * about that dispatcher starving riders on this building, so a fix to it is expected to shorten
 * this row. `collective`'s 21–31 s is the figure to design against — it is the shipped default's,
 * it reproduces, and no dispatcher fix will make it go away.
 *
 * `dev/batchWorker.ts` had solved the same problem for the Compare tab and nothing else used it.
 * This is that solution pointed at the single run.
 *
 * ## Why the whole `SimulationConfig` travels, rather than an id the worker re-derives
 *
 * `dev/batchWorker.ts` takes a `buildingId` and calls `loadBrowserResources()` on the far side,
 * because a batch names its arms and builds them itself. A shift is the opposite: `shiftRunConfigOf`
 * turns a whole `ViewerState` — the week's day, the calendar period, the commissioned fabric, the
 * saved classes, the levers, the selector — into one config, and **re-deriving that in the worker
 * would be a second answer to *what is this run***. Two answers is exactly the divergence
 * CLAUDE.md's standing requirement is about, and it would be invisible: both halves would run, and
 * only the legs would disagree.
 *
 * So the config crosses by structured clone, which is safe **because it is measured rather than
 * assumed**. `shiftRunConfigOf` writes no `createPolicy` and no `createPredictor` — the two
 * function-valued fields `SimulationConfig` has — so the object is plain data plus the
 * `ReadonlyMap`s on `ResolvedBuilding`, all of which structured clone carries. `record/recordRun.test.ts`
 * asserts the consequence directly: `recordRun(structuredClone(config))` is **byte-identical** to
 * `recordRun(config)`, legs and whole recording, which is CLAUDE.md invariant 5 held across a
 * thread boundary. The config is small and clones in under a millisecond.
 *
 * ## What it costs, which is not nothing
 *
 * The recording comes back the same way, and on the `collective` row above it is **57.3 MB** and
 * `structuredClone` of it takes **1.6–2.3 s**, measured five times in one process. That is a real
 * hitch and it is stated rather than glossed.
 *
 * Two things make it the right trade anyway, and only the first is a measurement. It replaces
 * 21–31 s of a page that answers no click with roughly a tenth of that, **after** the run rather
 * than instead of the page. And a `postMessage` splits the work — the structuring half runs on the
 * worker and only the destructuring half lands on the thread that paints — so the main-thread share
 * is smaller than the figure above. **That split is not measured here**, so no number is claimed for
 * it; what is claimed is the upper bound, which is the whole clone.
 *
 * ## Why there is no progress bar, only elapsed seconds
 *
 * `dev/batchWorker.ts` reports progress per *replication*, and a shift is one replication.
 * There is nothing smaller to count: the kernel has no notion of *now* to interrupt itself at
 * (CLAUDE.md invariant 3), so the smallest unit this package can schedule is the whole run. A bar
 * that filled at a guessed rate would be a claim about work done that nothing here can support, so
 * what is drawn is the two things that are true — how long it has been going, and how big the run
 * was predicted to be.
 *
 * ## Cancellation is `terminate()`, for `dev/batchWorker.ts`'s reason
 *
 * A replication cannot be interrupted, so a cooperative flag could not take effect until the run it
 * was meant to stop had finished. `Worker.terminate()` is immediate; the next run starts a fresh
 * worker. A cancelled run reports nothing, which is correct — it has no result.
 *
 * The same call is what makes *the latest ask wins*: starting a run while one is in flight
 * terminates the one in flight, so a player who changes the dispatcher twice never sees the first
 * answer arrive over the second.
 *
 * **A run that merely finished keeps its worker**, which is the one place this differs from
 * `dev/batchWorker.ts`'s caller. There is nothing to interrupt, and respawning would put the whole
 * of `core`'s module graph in front of the next press. Measured on the browser tier, which presses
 * Run repeatedly across seven files: **25.7 s** before this change, **70.7 s** with a worker spawned
 * per run, **58.3 s** with the worker kept warm. A production build pre-bundles the chunk and pays
 * far less than a dev server does, but not nothing. See {@link createShiftRunner}'s `warmWorker`.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import type { DisplayClock } from '../playback/clock.js';

/* -------------------------------------------------------------------------- *
 * The protocol
 * -------------------------------------------------------------------------- */

/** What the main thread asks for. One run, on a worker that outlives it unless it was interrupted. */
export interface ShiftWorkerRequest {
  readonly kind: 'run';
  /**
   * The config `shiftRunConfigOf` built, whole and unmodified.
   *
   * Not an id to re-derive from — see the header. This is the single reason the run in the worker
   * and the run on the main thread cannot be different runs.
   */
  readonly config: SimulationConfig;
  /** `shiftRunConfigOf` returns these **beside** the config, and `recordRun` takes them separately. */
  readonly outOfServiceCarIds: readonly string[];
  /** `recordRun`'s own switch, passed rather than defaulted so the far side decides nothing. */
  readonly recordDecisions: boolean;
}

/** What comes back. A thrown error cannot cross a thread, so failure is a message. */
export type ShiftWorkerMessage =
  | {
      readonly kind: 'done';
      readonly recording: VizRecording;
      /** `SimulationResult.trace.startOfDayS` — absent for a template that declares no hour. */
      readonly startOfDayS: number | undefined;
    }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * The two members of `Worker` this file uses, plus `terminate`.
 *
 * Structural rather than `Worker` itself so `shiftRunner.test.ts` can drive the shipped runner with
 * a worker it controls — the alternative is a test that asserts the runner's *arithmetic* and never
 * touches its lifecycle, which is `scope/probes.test-helper.ts`'s own complaint about a sink that
 * restates a decision instead of calling it.
 */
export interface ShiftWorkerLike {
  postMessage(message: ShiftWorkerRequest): void;
  addEventListener(type: 'message', handler: (event: { readonly data: unknown }) => void): void;
  addEventListener(type: 'error', handler: (event: { readonly message: string }) => void): void;
  terminate(): void;
}

/* -------------------------------------------------------------------------- *
 * What a run is predicted to cost
 * -------------------------------------------------------------------------- */

/**
 * Predicted arrivals above which a run is called **heavy** on screen.
 *
 * **Calibrated against the worst cell this product offers, not chosen for roundness.** On
 * `vertical-city` — 4 887 people, `office-standard` at 12 %/5 min — a 7 200 s run
 * (`menu/types.ts#LONGEST_OFFERED_RUN_S`, the longest the menu offers) predicts
 * `4887 × 0.12 × 7200/300 = 14 075` arrivals, and the run that cell actually produced generated
 * **13 269**: the estimator is within 6 % of the truth on the case it has to be right about. That
 * cell takes 21–31 s under `collective` and 195–234 s under `destination-panel`.
 *
 * The 13 269 is the same under all three dispatchers measured, which is what makes it the right
 * thing to calibrate against: the trace is drawn before any dispatcher sees it, so the estimate is
 * a claim about the demand and stays true when a dispatch fix changes how long the run takes.
 *
 * 10 000 sits below both numbers and far above every ordinary cell — `midtown-office` at 3 %/5 min
 * over 1 800 s predicts **308** — so the tier separates *the biggest thing the menu can ask for*
 * from *everything a player will normally do*, which is the only distinction it is being asked to
 * make. It changes what the status line says and nothing about what is run: a threshold that
 * refused a run would be a difficulty setting on the simulator, and the deep link is bounded
 * (`dev/main.ts#deepLinkStateOf`) so there is no unbounded ask left for it to have to refuse.
 */
const HEAVY_RUN_ARRIVALS = 10_000;

/** How big a run is about to be, and whether that is worth saying out loud. */
export interface ShiftRunCost {
  /** Predicted arrivals over the whole run. `population × rate/100 × durationS/300`. */
  readonly arrivals: number;
  /** Whether {@link HEAVY_RUN_ARRIVALS} is exceeded. */
  readonly heavy: boolean;
}

/**
 * Predict a run's size before running it.
 *
 * Arithmetic, deliberately, and not a simulation: the whole point is to have an answer *before*
 * the expensive thing starts. `arrivalRatePctPop5min` is a percentage of population per five
 * minutes, which is what makes this three multiplications rather than a model.
 *
 * A non-finite or non-positive input yields `0` arrivals rather than `NaN` — the estimate is only
 * ever used to choose a sentence, and a sentence reading `NaN people` would be worse than one that
 * declines to be impressed.
 */
export function shiftRunCostOf(input: {
  readonly population: number;
  readonly ratePctPop5min: number;
  readonly durationS: number;
}): ShiftRunCost {
  const { population, ratePctPop5min, durationS } = input;
  const finite =
    Number.isFinite(population) && Number.isFinite(ratePctPop5min) && Number.isFinite(durationS);
  const arrivals = finite
    ? Math.max(0, Math.round((population * ratePctPop5min * durationS) / 100 / 300))
    : 0;
  return { arrivals, heavy: arrivals > HEAVY_RUN_ARRIVALS };
}

/* -------------------------------------------------------------------------- *
 * The runner
 * -------------------------------------------------------------------------- */

/** One run, and what to do with it. `onDone` is per job so *verify* and *run* share one runner. */
export interface ShiftJob {
  /** What the status line calls this run. `'shift'` and `'replay check'` are the two today. */
  readonly label: string;
  readonly config: SimulationConfig;
  readonly outOfServiceCarIds: readonly string[];
  readonly recordDecisions: boolean;
  readonly cost: ShiftRunCost;
  readonly onDone: (recording: VizRecording, startOfDayS: number | undefined) => void;
}

export interface ShiftRunnerOptions {
  /**
   * Start a worker. `dev/main.ts` passes the real one; the test passes one it can answer for.
   *
   * A factory rather than a single long-lived worker because cancellation is `terminate()`, which
   * ends the worker as well as the run.
   */
  readonly spawn: () => ShiftWorkerLike;
  /** Display milliseconds. `playback/clock.ts` is the one place this package reads a wall clock. */
  readonly clock: DisplayClock;
  /** Draw the run's own line. Called on start, on every {@link ShiftRunnerHandle.tick}, and at the end. */
  readonly onStatus: (text: string) => void;
  /** Called with `true` when a run starts and `false` when one ends, however it ends. */
  readonly onRunning: (running: boolean) => void;
  /** A run that threw, on either side of the boundary. */
  readonly onFailed: (message: string) => void;
}

export interface ShiftRunnerHandle {
  /** Run this. Terminates whatever was in flight — the latest ask wins. */
  start(job: ShiftJob): void;
  /** Stop the run in flight, immediately. A no-op when nothing is running. */
  cancel(): void;
  /** Whether a run is in flight. */
  isRunning(): boolean;
  /** Re-draw the elapsed line. `dev/main.ts` calls this on an interval; a no-op when idle. */
  tick(): void;
}

/**
 * The line under a running shift.
 *
 * Three facts and no fourth: what is running, how long it has been running, and how big it was
 * predicted to be. It says outright that there is no progress in it, because a reader who has
 * watched a number climb for forty seconds is entitled to know whether it is measuring their run
 * or measuring the clock.
 */
function runningLineOf(job: ShiftJob, elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const size = `about ${String(job.cost.arrivals)} people expected`;
  return (
    `simulating the ${job.label}${job.cost.heavy ? ' — a big one' : ''}: ${String(seconds)} s so far, ${size}. ` +
    'Elapsed seconds, not progress — a shift is one uninterruptible call, so nothing here can say how ' +
    'far through it is. The page stays yours; press Cancel this run to stop.'
  );
}

export function createShiftRunner(options: ShiftRunnerOptions): ShiftRunnerHandle {
  const { spawn, clock, onStatus, onRunning, onFailed } = options;

  let worker: ShiftWorkerLike | undefined;
  let current: ShiftJob | undefined;
  let startedMs = 0;

  /**
   * End the worker as well as the run.
   *
   * Only ever called where a run has to *stop* — a cancel, or a new ask arriving over one in
   * flight — because `terminate()` is the only way to interrupt a replication and it takes the
   * worker with it. A run that simply finished keeps its worker: see {@link warmWorker}.
   */
  function stop(): void {
    worker?.terminate();
    worker = undefined;
    current = undefined;
  }

  /**
   * The worker to send the next run to — the one from last time when there is one.
   *
   * **Reused rather than respawned, and the reason is measured.** Every spawn re-imports the
   * worker's whole module graph, which is `record/recordRun.ts` and the whole of `core`. Measured
   * on the browser tier, which presses Run repeatedly across seven files: **25.7 s** before the
   * worker existed, **70.7 s** with one spawned per run, **58.3 s** with it kept warm. A built
   * bundle pays a smaller version of the same toll.
   *
   * Reuse is safe because the worker holds no state between runs: `recordRun` takes a config and
   * returns a recording, and `dev/shiftWorker.ts` keeps nothing. `dev/batchWorker.ts` makes the
   * same observation from the other side, where it caches `loadBrowserResources()` across batches
   * *within* one worker for exactly this reason.
   *
   * The listeners are attached once, here, and read `current` rather than closing over a job — so
   * a result arriving for a run that has been cancelled or superseded finds `current` cleared or
   * different, and is dropped rather than drawn.
   */
  function warmWorker(): ShiftWorkerLike {
    const held = worker;
    if (held !== undefined) return held;
    const next = spawn();
    worker = next;
    next.addEventListener('message', (event) => {
      const job = current;
      if (job === undefined) return;
      const message = event.data as ShiftWorkerMessage;
      current = undefined;
      onRunning(false);
      if (message.kind === 'failed') {
        onFailed(message.message);
        return;
      }
      job.onDone(message.recording, message.startOfDayS);
    });
    next.addEventListener('error', (event) => {
      if (current === undefined) return;
      // A worker that failed to start is a worker, so it is dropped rather than kept warm: the next
      // run gets a fresh attempt instead of posting into something that never loaded.
      stop();
      onRunning(false);
      onFailed(`the shift worker failed to start: ${event.message}`);
    });
    return next;
  }

  return {
    isRunning: () => current !== undefined,

    start(job) {
      /*
       * **The latest ask wins.** Without this a player who changed the dispatcher twice would get
       * the first answer painted over the second, and the screen would be about a run they had
       * left. It is `stop()` rather than a flag because the run in flight is still burning a core.
       */
      if (current !== undefined) stop();
      current = job;
      startedMs = clock.now();
      onRunning(true);
      onStatus(runningLineOf(job, 0));
      warmWorker().postMessage({
        kind: 'run',
        config: job.config,
        outOfServiceCarIds: job.outOfServiceCarIds,
        recordDecisions: job.recordDecisions,
      });
    },

    cancel() {
      const job = current;
      if (job === undefined) return;
      const seconds = Math.max(0, Math.floor((clock.now() - startedMs) / 1000));
      stop();
      onRunning(false);
      onStatus(
        `the ${job.label} was cancelled after ${String(seconds)} s. Nothing was measured, so nothing ` +
          'is reported — the run on screen is the one before it.',
      );
    },

    tick() {
      const job = current;
      if (job === undefined) return;
      onStatus(runningLineOf(job, clock.now() - startedMs));
    },
  };
}
