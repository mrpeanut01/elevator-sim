/// <reference types="node" />

/**
 * **What a rush replay thread runs** — PR #513's review, finding 2. Loaded by `rushReplayWorker.ts`,
 * the thread's entry, only after that entry has registered the hook that resolves this package's
 * sources under the test runner; its docstring says why the order matters. Never imported anywhere
 * else: it throws when it is not on a worker thread.
 *
 * It is a module of its own, rather than the entry's body, **so the replay is reached by a static
 * import**: `deadCode.test.ts` names each link from an entry point to the replay by the file that imports
 * it, and a function reached only through `import(url)` is invisible to that check — which is the shape
 * of the defect this repository keeps shipping, a behaviour whose caller cannot be named.
 *
 * It loads `data/` itself, from the directory the server loaded it from, and answers each request with
 * `rushSitting.ts#replayRushSitting` — the same function, over the same tables, the request thread ran
 * before the move. `rushReplayPool.test.ts` holds the two answers equal.
 */

import { parentPort, workerData } from 'node:worker_threads';

import { loadConfig } from '@elevator-sim/core';

import { loadChimeLedger } from '../chimes/ledger.js';
import type { RushReplayMessage, RushReplayRequest, RushReplayWorkerInit } from './rushReplayPool.js';
import { loadRushPurse, replayRushSitting } from './rushSitting.js';

const port = parentPort;
if (port === null) {
  throw new Error('leaderboard/rushReplayThread.ts runs on a rush replay thread, started by rushReplayWorker.ts.');
}
const init = workerData as RushReplayWorkerInit;
const post = (message: RushReplayMessage): void => {
  port.postMessage(message);
};

try {
  const config = await loadConfig(init.dataDir);
  const ledger = await loadChimeLedger(init.dataDir);
  const purse = await loadRushPurse(init.dataDir, ledger);
  const from = {
    resources: {
      buildingsById: config.buildingsById,
      dispatcherProfilesById: config.dispatcherProfilesById,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      dispatcherProfiles: config.dispatcherProfiles,
    },
    purse,
    ledger,
  };
  port.on('message', (request: RushReplayRequest) => {
    try {
      post({ kind: 'done', id: request.id, verification: replayRushSitting(request.sitting, from) });
    } catch (error) {
      post({ kind: 'failed', id: request.id, message: error instanceof Error ? error.message : String(error) });
    }
  });
  post({ kind: 'ready' });
} catch (error) {
  post({ kind: 'fatal', message: error instanceof Error ? error.message : String(error) });
}
