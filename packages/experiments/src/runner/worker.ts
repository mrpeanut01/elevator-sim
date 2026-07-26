/**
 * The worker-thread entry. Runs replications; decides nothing.
 *
 * One `Worker` is started per pool slot, told the plan's cells once at spawn, and then fed
 * `ReplicationTask` messages of three numbers each. It answers with a `RawReplicationOutcome`
 * — including for a replication that *threw*, because an exception cannot cross a thread boundary
 * and a crashed replication has to arrive as data so the parent can apply the same
 * `onReplicationError` policy it would have applied on the serial path.
 *
 * ## Two rules this file lives by
 *
 * **It contains no simulation logic.** The replication is run by `replication.ts`'s
 * `runOneReplication`, which is the same function `parallel.ts` calls on the serial path. If this
 * file grew its own copy of "build a config and run it", the guarantee that parallelism cannot
 * change a result would quietly become a hope.
 *
 * **Its sibling import is dynamic and extension-resolved.** Node loads this file directly — it is
 * a worker entry, not part of the test runner's module graph — and Node 26 strips types from a
 * `.ts` file but does *not* rewrite TypeScript's `./sibling.js` specifiers back to `./sibling.ts`.
 * So the one sibling this file needs at runtime is imported by URL, with the extension taken from
 * this module's own, which makes a single code path work unbuilt from `src/` and built from
 * `dist/`. Every other sibling reference here is `import type`, which both `tsc` and Node's type
 * stripper erase entirely.
 */

import { parentPort, workerData } from 'node:worker_threads';

import type { WorkerInit, WorkerMessage, WorkerRequest } from './parallel.js';

type ReplicationModule = typeof import('./replication.js');

const port = parentPort;
if (port === null) {
  throw new Error('runner/worker.ts must be started as a worker thread, not imported.');
}

const init = workerData as WorkerInit;

const post = (message: WorkerMessage): void => {
  port.postMessage(message);
};

try {
  const extension = /\.tsx?(\?|$)/.test(import.meta.url) ? 'ts' : 'js';
  const replicationUrl = new URL(`./replication.${extension}`, import.meta.url).href;
  const replication = (await import(replicationUrl)) as ReplicationModule;

  port.on('message', (request: WorkerRequest) => {
    if (request.kind === 'stop') {
      port.close();
      return;
    }
    const { task } = request;
    try {
      const cell = init.cells[task.cellIndex];
      if (cell === undefined) {
        throw new Error(
          `No cell at index ${task.cellIndex}; this worker was given ${init.cells.length}.`,
        );
      }
      post({
        kind: 'result',
        outcome: replication.runOneReplication(
          init.experimentId,
          cell,
          task.replication,
          task.seed,
          init.keepRecords,
        ),
      });
    } catch (error) {
      // `runOneReplication` already returns a thrown simulation as `ok: false`, so reaching here
      // means the failure was in the plumbing — a lost cell, a clone that arrived malformed. That
      // is not a data point about a configuration, so it is escalated rather than recorded.
      post({
        kind: 'fatal',
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && error.stack !== undefined ? { stack: error.stack } : {}),
      });
    }
  });

  post({ kind: 'ready' });
} catch (error) {
  post({
    kind: 'fatal',
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack !== undefined ? { stack: error.stack } : {}),
  });
}
