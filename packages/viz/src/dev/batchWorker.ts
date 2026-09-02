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

import { batchLibraryOf } from '../batch/library.js';
import type { DispatcherProfile } from '@elevator-sim/core/browser';

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

/**
 * The resources one batch resolves against — the loaded `data/`, plus whatever the player
 * authored, folded in through `batch/library.ts`.
 *
 * This function is **the** reason a saved dispatcher can be compared at all (issues #167, #228,
 * [§ D443](../../../../DECISIONS.md)). `runBatch` has always resolved an arm against
 * `BatchResources.dispatcherProfiles` rather than against a shipped list; what was missing is that
 * this side of the `postMessage` boundary calls `loadBrowserResources()` for itself, so the
 * library it assembled could only ever be `data/`. The player's shelf now arrives on the message
 * and lands here.
 *
 * The refusal is raised rather than returned because the caller is `handle`, whose `catch` posts
 * it as a `failed` message with the reason intact — which is how the sentence naming the offending
 * dispatcher reaches the reader. `batchLibraryOf` returns the loaded file **by identity** when
 * nothing is carried, so a batch with no saved dispatchers is byte-identical to one run before
 * this existed.
 */
function batchResourcesFor(
  loaded: BrowserResources,
  buildingId: string,
  savedProfiles: readonly DispatcherProfile[],
): BatchResources {
  const building = loaded.buildings.find((candidate) => candidate.id === buildingId);
  if (building === undefined) {
    throw new Error(
      `building "${buildingId}" is not in this build's data/. The batch has nothing to run.`,
    );
  }
  const library = batchLibraryOf(loaded.dispatcherProfiles, savedProfiles);
  if (!library.ok) throw new Error(library.reason);
  return {
    building,
    dispatcherProfiles: library.library,
    trafficProfiles: loaded.trafficProfiles,
    elevatorSpecs: loaded.elevatorSpecs,
  };
}

async function handle(request: BatchWorkerRequest): Promise<void> {
  const loaded = await resources();
  const batchResources = batchResourcesFor(
    loaded,
    request.request.buildingId,
    request.savedProfiles ?? [],
  );
  const result = runBatch(request.request, batchResources, {
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
