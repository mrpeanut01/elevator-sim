/**
 * The batch worker — `docs/10-experience-layer-contract.md` § 11 **W3**, *"the main thread must
 * not block."*
 *
 * ## Why a worker and not a chunked loop on the main thread
 *
 * `Simulation.run()` is **one synchronous call**. There is no tick to yield between and there
 * could not be one: CLAUDE.md invariant 3 keeps the wall clock out of `core`, so the kernel has
 * no notion of *"now"* to interrupt itself at. The smallest unit this package can schedule is one
 * whole replication, and W3's own measurement makes that unacceptable on the painting thread:
 * 196 ms per replication on Vertical City is twelve dropped frames per replication, and a
 * 50-replication two-arm batch is twenty seconds of a page that does not answer a click.
 *
 * A worker moves the whole loop off the thread that paints, and the progress messages arrive
 * while it runs because `postMessage` queues on the *receiver*, not on the sender's event loop.
 *
 * ## The typing, and why it is a local structural interface
 *
 * This package compiles with `lib: ["ES2022", "DOM", "DOM.Iterable"]`. Adding `WebWorker` would
 * collide with `DOM` on a long list of shared globals, and the whole package would pay for one
 * file. `DedicatedWorkerGlobalScope` is therefore declared here as the two members this file
 * actually uses — which is also a more honest statement of what it needs.
 *
 * ## Cancellation
 *
 * There is none inside this file, deliberately. A replication cannot be interrupted, so a
 * cooperative flag could only take effect between replications and would still leave the reader
 * waiting up to 196 ms — while adding a second way for a batch to end. `dev/batchPanel.ts`
 * cancels by calling `Worker.terminate()`, which is immediate, and starts a fresh worker for the
 * next batch. A terminated batch reports nothing, which is correct: it has no result.
 */

import { runBatch } from '../batch/runBatch.js';
import type {
  BatchResources,
  BatchWorkerMessage,
  BatchWorkerRequest,
} from '../batch/types.js';
import { systemClock } from '../playback/clock.js';
import { loadBrowserResources, type BrowserResources } from './data.js';

/** The two members of `DedicatedWorkerGlobalScope` this file uses. See the docstring. */
interface WorkerScope {
  postMessage(message: BatchWorkerMessage): void;
  addEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
}

const scope = globalThis as unknown as WorkerScope;

/** Loaded once per worker. A second batch in the same worker reuses it. */
let resourcesPromise: Promise<BrowserResources> | undefined;

function resources(): Promise<BrowserResources> {
  resourcesPromise ??= loadBrowserResources();
  return resourcesPromise;
}

function batchResourcesFor(loaded: BrowserResources, buildingId: string): BatchResources {
  const building = loaded.buildings.find((candidate) => candidate.id === buildingId);
  if (building === undefined) {
    throw new Error(
      `building "${buildingId}" is not in this build's data/. The batch has nothing to run.`,
    );
  }
  return {
    building,
    dispatcherProfilesById: new Map(
      loaded.dispatcherProfiles.map((profile) => [profile.id, profile]),
    ),
    trafficProfiles: loaded.trafficProfiles,
    elevatorSpecs: loaded.elevatorSpecs,
  };
}

async function handle(request: BatchWorkerRequest): Promise<void> {
  const loaded = await resources();
  const result = runBatch(request.request, batchResourcesFor(loaded, request.request.buildingId), {
    clock: systemClock(),
    onProgress: (progress) => {
      scope.postMessage({ kind: 'progress', progress });
    },
  });
  scope.postMessage({ kind: 'done', result });
}

scope.addEventListener('message', (event: MessageEvent) => {
  const request = event.data as BatchWorkerRequest;
  if (request.kind !== 'run') return;
  handle(request).catch((error: unknown) => {
    /*
     * A thrown exception cannot cross a thread boundary, so it is flattened into a message. The
     * panel prints it where the reader is; a worker that died in silence would leave a progress
     * bar frozen at whatever number it last reported, which is the worst available outcome.
     */
    scope.postMessage({
      kind: 'failed',
      message: error instanceof Error ? error.message : String(error),
    });
  });
});
