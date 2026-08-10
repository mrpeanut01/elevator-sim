/**
 * The shift worker — one run, off the painting thread.
 *
 * `dev/batchWorker.ts` is this file's older sibling and the shape is deliberately the same: a
 * structural `WorkerScope` rather than the `WebWorker` lib (which collides with `DOM` on a long
 * list of shared globals, and the whole package would pay for one file), one `message` listener,
 * and a thrown error flattened into a message because an exception cannot cross a thread boundary.
 *
 * What is different is what crosses. The batch takes a `buildingId` and rebuilds its arms here;
 * this takes the **whole** `SimulationConfig` that `dev/state.ts#shiftRunConfigOf` produced, so
 * there is exactly one answer in the product to *what is this run*. The argument, the measurement
 * that the clone is faithful, and why cancellation is `terminate()` are all in
 * `dev/shiftRunner.ts`'s header — this file is the far end of that protocol and decides nothing.
 *
 * It calls the **shipped** `recordRun`, not a copy of it. `record/recordRun.ts` stays the only
 * place in the package that runs a simulation, which is what keeps the honesty sweep, the CLI, the
 * scope probes and this worker measuring the same simulator.
 */

import { recordRun } from '../record/recordRun.js';

import type { ShiftWorkerMessage, ShiftWorkerRequest } from './shiftRunner.js';

/** The two members of `DedicatedWorkerGlobalScope` this file uses. See `dev/batchWorker.ts`. */
interface WorkerScope {
  postMessage(message: ShiftWorkerMessage): void;
  addEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.addEventListener('message', (event: MessageEvent) => {
  const request = event.data as ShiftWorkerRequest;
  if (request.kind !== 'run') return;
  try {
    const recorded = recordRun(request.config, {
      recordDecisions: request.recordDecisions,
      outOfServiceCarIds: request.outOfServiceCarIds,
    });
    scope.postMessage({
      kind: 'done',
      recording: recorded.recording,
      // The template's own hour, or absent for one that declares none — `constant-iso` declares
      // none, and omission means *this has no hour* rather than *midnight*. The whole
      // `SimulationResult` is not sent: this is the only field of it the shell reads, and a
      // 57 MB recording is already the expensive half of the message.
      startOfDayS: recorded.result.trace.startOfDayS,
    });
  } catch (error: unknown) {
    /*
     * `recordRun` throws `SimulationError` for a run whose conservation audit failed or whose
     * drain deadline fired, and `shiftRunConfigOf`'s own refusals reach the main thread before
     * this file is ever spawned. Either way the shell must surface a failure rather than draw a
     * partial building, so the message is flattened and sent — a worker that died in silence
     * would leave the elapsed counter climbing forever, which is the worst available outcome.
     */
    scope.postMessage({
      kind: 'failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
