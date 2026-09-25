/**
 * The morning worker — one fix-it morning, off the painting thread, answered as a reading rather
 * than a recording ([§ D1020](../../../../DECISIONS.md)).
 *
 * `dev/shiftWorker.ts`'s shape exactly: a structural scope, one `message` listener, a thrown error
 * flattened into a message. What differs is what comes back. The replication judge
 * (`fixit/judge.ts`) needs three numbers a morning and forty-nine mornings a side, and a recording
 * is megabytes of legs; so the run is measured **here**, by the same `fixit/run.ts#morningReadingOf`
 * the letter's pair is measured by, and only the reading crosses back.
 *
 * It calls the shipped `recordRun`, so `record/recordRun.ts` stays the one place in the package that
 * runs a simulation.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';

import { morningReadingOf, type MorningReading } from '../fixit/run.js';
import type { ComplaintMeasure } from '../fixit/types.js';
import { recordRun } from '../record/recordRun.js';

export interface MorningWorkerRequest {
  readonly kind: 'morning';
  /** The morning's own index in its ask, echoed back so a pool can put readings in order. */
  readonly index: number;
  readonly config: SimulationConfig;
  readonly measure: ComplaintMeasure;
  readonly outOfServiceCarIds: readonly string[];
  readonly recordDecisions: boolean;
}

export type MorningWorkerMessage =
  | { readonly kind: 'done'; readonly index: number; readonly reading: MorningReading }
  | { readonly kind: 'failed'; readonly index: number; readonly message: string };

interface WorkerScope {
  postMessage(message: MorningWorkerMessage): void;
  addEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.addEventListener('message', (event: MessageEvent) => {
  const request = event.data as MorningWorkerRequest;
  if (request.kind !== 'morning') return;
  try {
    const recorded = recordRun(request.config, {
      recordDecisions: request.recordDecisions,
      outOfServiceCarIds: request.outOfServiceCarIds,
    });
    scope.postMessage({ kind: 'done', index: request.index, reading: morningReadingOf(recorded.recording, request.measure) });
  } catch (error: unknown) {
    scope.postMessage({
      kind: 'failed',
      index: request.index,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
