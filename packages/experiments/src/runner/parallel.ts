/**
 * Executing replications: serially, or across cores. **Never differently.**
 *
 * ## The property that makes this safe
 *
 * Replications are embarrassingly parallel — each is a fresh `Simulation` over a seed that
 * depends on nothing but `(experimentSeed, replicationIndex)` — so the only channel through
 * which concurrency could reach a reported number is *ordering*. Three things close it:
 *
 * 1. **Results are assembled by task index, not by completion order.** A worker that finishes
 *    third writes into slot three of the batch it was given.
 * 2. **Batch composition is decided by the plan**, not by the pool. `replicationRunner.ts` hands
 *    down batches of `policy.checkEvery` replications per active cell, so the set of replications
 *    that run is a function of the spec and not of how many cores answered.
 * 3. **The two executors share one replication implementation.** `worker.ts` imports
 *    `replication.ts` and calls the same `runOneReplication` the serial path calls; there is no
 *    second transcription for the two to drift apart.
 *
 * `parallel.test.ts` asserts the consequence — byte-identical experiment fingerprints from both
 * executors — rather than trusting the argument.
 *
 * ## Which one is the default, and why
 *
 * Serial, until the work justifies a pool. Measured on this simulator (10 physical cores,
 * Node 26, `midtown-office` under pure up-peak):
 *
 * | Batch | Serial | 4 workers | 8 workers | 10 workers |
 * |---|---|---|---|---|
 * | 100 light replications (~3 ms each) | 388 ms | 275 ms | 295 ms | 407 ms |
 * | 400 light replications | 1185 ms | 630 ms | 563 ms | 670 ms |
 * | 50 heavy replications (~47 ms each) | 2356 ms | 1171 ms | 848 ms | 917 ms |
 * | 200 heavy replications | 9515 ms | 3781 ms | 2443 ms | 2351 ms |
 *
 * Pool start-up is ~85 ms for four workers and ~145 ms for eight — thread creation plus each
 * worker's own module graph, paid once. So the pool is a clear win on a real Phase 3 batch (4.1×
 * on 200 heavy replications) and a *loss* on a small one, and over-subscribing the machine is
 * consistently worse than leaving the parent a core to aggregate on. Hence `'auto'`: pool when the
 * guaranteed work — cells × `minReplications` — clears
 * `RUNNER_DEFAULTS.minReplicationsForWorkers`, serial otherwise, and eight workers at most.
 *
 * End to end through this module — two dispatcher arms × 50 replications on Midtown Office, with
 * planning, aggregation and fingerprinting included — 1555 ms serial against 996 ms / 657 ms /
 * 619 ms / 646 ms on 2 / 4 / 6 / 8 workers (2.5× at the knee), and every one of those runs produced
 * a fingerprint identical to the serial run's.
 *
 * A worker pool that fails to start is an **error**, not a reason to quietly go serial: a silent
 * fallback would turn a broken pool into a mysterious slowdown, and would let the measurement
 * above rot unnoticed. `mode: 'serial'` is how a caller opts out on purpose.
 */

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

import { runOneReplication } from './replication.js';
import type {
  ExecutorKind,
  ExperimentCell,
  ExperimentPlan,
  RawReplicationOutcome,
  ReplicationTask,
  ResolvedParallelPolicy,
} from './types.js';
import { RunnerError } from './types.js';

/* -------------------------------------------------------------------------- *
 * The port
 * -------------------------------------------------------------------------- */

/**
 * Somewhere to run a batch of replications.
 *
 * `run` resolves with **one outcome per task, in task order**, whatever order they completed in.
 * It may be called repeatedly — the sequential stopping loop calls it once per round — and a pool
 * keeps its threads warm between calls so the start-up cost is paid once per experiment rather
 * than once per round.
 */
export interface ReplicationExecutor {
  readonly kind: ExecutorKind;
  /** Threads doing the work. `1` for serial, which is the honest number: the parent thread. */
  readonly workers: number;
  run(tasks: readonly ReplicationTask[]): Promise<readonly RawReplicationOutcome[]>;
  /** Release resources. Idempotent, and safe to call on a pool that never started. */
  close(): Promise<void>;
}

/* -------------------------------------------------------------------------- *
 * Serial
 * -------------------------------------------------------------------------- */

/**
 * The reference executor: one replication after another on the calling thread.
 *
 * Also the definition of correctness for the pool. Deliberately trivial — it holds no state
 * beyond the cells, so there is nothing about it for a concurrency bug to hide behind.
 */
export function createSerialExecutor(plan: ExperimentPlan): ReplicationExecutor {
  return {
    kind: 'serial',
    workers: 1,
    run: (tasks) =>
      Promise.resolve(
        tasks.map((task) =>
          runOneReplication(
            plan.experimentId,
            cellAt(plan.cells, task.cellIndex),
            task.replication,
            task.seed,
            plan.keepRecords,
          ),
        ),
      ),
    close: () => Promise.resolve(),
  };
}

function cellAt(cells: readonly ExperimentCell[], index: number): ExperimentCell {
  const cell = cells[index];
  if (cell === undefined) {
    throw new RunnerError(`No cell at index ${index}; the plan has ${cells.length}.`);
  }
  return cell;
}

/* -------------------------------------------------------------------------- *
 * The worker pool
 * -------------------------------------------------------------------------- */

/** What a worker is told once, at spawn. Structured-cloned, so plain data only. */
export interface WorkerInit {
  readonly experimentId: string;
  /** Every cell of the plan, addressed by `ReplicationTask.cellIndex`. */
  readonly cells: readonly ExperimentCell[];
  readonly keepRecords: boolean;
}

/** Parent → worker. */
export type WorkerRequest =
  | { readonly kind: 'task'; readonly task: ReplicationTask }
  | { readonly kind: 'stop' };

/** Worker → parent. */
export type WorkerMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'result'; readonly outcome: RawReplicationOutcome }
  | { readonly kind: 'fatal'; readonly message: string; readonly stack?: string | undefined };

/**
 * The worker entry module.
 *
 * Resolved from *this* module's own URL and extension, which is what lets one code path serve
 * both `src/` (Node 26 strips types from a `.ts` entry natively, so tests need no build step for
 * the runner itself) and `dist/` (a plain `.js` entry). See `replication.ts` for the import rule
 * a worker-reachable module has to obey; it exists because Node will not rewrite TypeScript's
 * `./sibling.js` specifiers back to `./sibling.ts`.
 *
 * One consequence is worth stating plainly: a worker resolves `@elevator-sim/core` through
 * `node_modules`, i.e. to core's **built** output, whereas a vitest run resolves it to core's
 * source. Both are the same TypeScript, so results agree — but a stale `packages/core/dist` makes
 * the pool and the parent disagree, which is why the test suite checks that the build is current
 * before comparing the two executors instead of reporting a baffling mismatch.
 */
export function workerEntryUrl(): URL {
  const extension = /\.tsx?(\?|$)/.test(import.meta.url) ? 'ts' : 'js';
  return new URL(`./worker.${extension}`, import.meta.url);
}

/**
 * Threads to spawn.
 *
 * `availableParallelism() - 2` clamped to `[1, 8]`, then clamped again to the work available —
 * spawning eight threads for three replications pays eight start-up costs to save two. Two cores
 * are left because the parent does the cloning, the stopping arithmetic and the aggregation, and
 * because k = cores measured consistently slower than k = cores − 2.
 */
export function resolveWorkerCount(policy: ResolvedParallelPolicy, plannedTasks: number): number {
  const requested =
    policy.workers > 0 ? policy.workers : Math.min(8, Math.max(1, availableParallelism() - 2));
  return Math.max(1, Math.min(requested, Math.max(1, plannedTasks)));
}

interface PoolWorker {
  readonly worker: Worker;
  /** Task slot the worker is currently on, or `-1` when idle. */
  slot: number;
}

/**
 * A pool of worker threads, warm across batches.
 *
 * Work-stealing rather than pre-partitioned: a worker that finishes takes the next unclaimed task,
 * so one slow replication (a saturated configuration runs far longer than a healthy one) delays
 * only itself. Pre-partitioning a batch would make the whole round wait for the unluckiest chunk.
 */
export function createWorkerPoolExecutor(plan: ExperimentPlan, workerCount: number): ReplicationExecutor {
  const init: WorkerInit = {
    experimentId: plan.experimentId,
    cells: plan.cells,
    keepRecords: plan.keepRecords,
  };

  let pool: PoolWorker[] | undefined;
  let closed = false;

  const spawn = async (): Promise<PoolWorker[]> => {
    const entry = workerEntryUrl();
    const workers: PoolWorker[] = [];
    const started: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i += 1) {
      let worker: Worker;
      try {
        worker = new Worker(entry, { workerData: init });
      } catch (error) {
        await Promise.all(workers.map((entry_) => entry_.worker.terminate()));
        throw new RunnerError(
          `Could not start a worker from ${entry.href}: ${String(error)}. Run with parallel.mode = "serial" to execute on the calling thread instead.`,
          undefined,
          { cause: error },
        );
      }
      const member: PoolWorker = { worker, slot: -1 };
      workers.push(member);
      started.push(
        new Promise<void>((resolve, reject) => {
          const onMessage = (message: WorkerMessage): void => {
            if (message.kind === 'ready') {
              worker.off('message', onMessage);
              resolve();
            } else if (message.kind === 'fatal') {
              reject(new RunnerError(`Worker failed to initialize: ${message.message}`));
            }
          };
          worker.on('message', onMessage);
          worker.once('error', reject);
        }),
      );
    }
    try {
      await Promise.all(started);
    } catch (error) {
      await Promise.all(workers.map((member) => member.worker.terminate()));
      throw error instanceof RunnerError
        ? error
        : new RunnerError(`Worker pool failed to start: ${String(error)}`, undefined, { cause: error });
    }
    return workers;
  };

  const run = async (tasks: readonly ReplicationTask[]): Promise<readonly RawReplicationOutcome[]> => {
    if (closed) throw new RunnerError('This worker pool has been closed.');
    if (tasks.length === 0) return [];
    pool ??= await spawn();
    const members = pool;

    const outcomes = new Array<RawReplicationOutcome | undefined>(tasks.length);
    let nextTask = 0;
    let completed = 0;

    return await new Promise<readonly RawReplicationOutcome[]>((resolve, reject) => {
      let settled = false;
      const listeners: (() => void)[] = [];

      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        for (const detach of listeners) detach();
        if (error !== undefined) {
          reject(
            error instanceof RunnerError
              ? error
              : new RunnerError(`A replication worker failed: ${String(error)}`, undefined, { cause: error }),
          );
          return;
        }
        resolve(
          outcomes.map((outcome, index) => {
            if (outcome === undefined) {
              throw new RunnerError(`Worker pool lost the outcome for task ${index}.`);
            }
            return outcome;
          }),
        );
      };

      const feed = (member: PoolWorker): void => {
        if (nextTask >= tasks.length) {
          member.slot = -1;
          return;
        }
        const slot = nextTask;
        nextTask += 1;
        member.slot = slot;
        const task = tasks[slot];
        // Unreachable: `slot < tasks.length` by construction.
        if (task === undefined) return finish(new RunnerError(`Missing task at slot ${slot}.`));
        const request: WorkerRequest = { kind: 'task', task };
        member.worker.postMessage(request);
      };

      for (const member of members) {
        const onMessage = (message: WorkerMessage): void => {
          if (message.kind === 'result') {
            const slot = member.slot;
            member.slot = -1;
            if (slot >= 0) {
              outcomes[slot] = message.outcome;
              completed += 1;
            }
            if (completed === tasks.length) {
              finish();
              return;
            }
            feed(member);
            return;
          }
          if (message.kind === 'fatal') {
            finish(new RunnerError(`A replication worker reported a fatal error: ${message.message}`));
          }
        };
        const onError = (error: unknown): void => finish(error);
        const onExit = (code: number): void => {
          if (!settled) {
            finish(new RunnerError(`A replication worker exited with code ${code} mid-batch.`));
          }
        };
        member.worker.on('message', onMessage);
        member.worker.on('error', onError);
        member.worker.on('exit', onExit);
        listeners.push(() => {
          member.worker.off('message', onMessage);
          member.worker.off('error', onError);
          member.worker.off('exit', onExit);
        });
      }

      for (const member of members) feed(member);
    });
  };

  return {
    kind: 'workers',
    workers: workerCount,
    run,
    close: async () => {
      closed = true;
      const members = pool;
      pool = undefined;
      if (members === undefined) return;
      await Promise.all(members.map((member) => member.worker.terminate()));
    },
  };
}

/* -------------------------------------------------------------------------- *
 * Choosing
 * -------------------------------------------------------------------------- */

/** What `'auto'` decided, and on what grounds. Reported so a slow run can be explained. */
export interface ExecutorChoice {
  readonly executor: ReplicationExecutor;
  readonly reason: string;
}

/**
 * Build the executor a plan asks for.
 *
 * `'auto'` decides on {@link ExperimentPlan.guaranteedReplications} — cells × `minReplications` —
 * and **not** on a measured duration. The choice is therefore a pure function of the spec, so two
 * runs of one spec on one machine take the same path every time; the numbers would be identical
 * either way, but a reproducible *explanation* is worth having too.
 */
export function createExecutor(plan: ExperimentPlan): ExecutorChoice {
  const { mode } = plan.parallel;
  const plannedTasks = plan.cells.length * plan.policy.maxReplications;

  if (mode === 'serial') {
    return { executor: createSerialExecutor(plan), reason: 'parallel.mode = "serial"' };
  }
  if (mode === 'workers') {
    const workers = resolveWorkerCount(plan.parallel, plannedTasks);
    return {
      executor: createWorkerPoolExecutor(plan, workers),
      reason: `parallel.mode = "workers" (${workers} threads)`,
    };
  }
  if (plan.guaranteedReplications < plan.parallel.minReplicationsForWorkers) {
    return {
      executor: createSerialExecutor(plan),
      reason: `auto: ${plan.guaranteedReplications} guaranteed replications is below the ${plan.parallel.minReplicationsForWorkers} needed to repay thread start-up`,
    };
  }
  if (availableParallelism() < 2) {
    return { executor: createSerialExecutor(plan), reason: 'auto: only one core is available' };
  }
  const workers = resolveWorkerCount(plan.parallel, plannedTasks);
  return {
    executor: createWorkerPoolExecutor(plan, workers),
    reason: `auto: ${plan.guaranteedReplications} guaranteed replications across ${plan.cells.length} cells, ${workers} threads`,
  };
}
