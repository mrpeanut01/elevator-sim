/// <reference types="node" />

/**
 * **The entry of a rush replay thread** — PR #513's review, finding 2. Started by
 * `rushReplayPool.ts#createRushReplays`, never imported: it throws if it is.
 *
 * ## The import rule this file obeys
 *
 * A worker entry is loaded by **Node**, not by the test runner, and that decides how it may import —
 * the same rule `packages/experiments/src/runner/replication.ts` states for the replication pool.
 * Node 26 strips types from a `.ts` file, so this entry runs unbuilt under the test runner; but Node
 * does not rewrite TypeScript's `./sibling.js` specifiers back to `./sibling.ts`, and it resolves a
 * workspace package to that package's **built** output rather than its source. So:
 *
 * - every static import here is `node:*` or `import type`, which are built in or erased;
 * - the thread's work, `rushReplayThread.ts`, is loaded by **dynamic** import, after
 *   {@link registerSourceHook} has run — and everything it imports statically resolves through the hook;
 * - in `dist/` — the image `Dockerfile` ships — this file is `.js`, every specifier resolves as it is
 *   written, and no hook is registered at all.
 *
 * The hook maps a relative `.js` specifier to the `.ts` beside it when that file exists, and the
 * workspace packages the replay reaches to their `src/`, which is what the test runner's aliases do for
 * the parent thread. That keeps both threads on one tree: a thread resolving `core` to a stale `dist/`
 * while the parent ran source is exactly the disagreement `experiments`' pool has to check the build
 * for. Measured before this was written, by loading `rushSitting.ts` from `src/` under plain Node
 * through the same hook: the tables loaded in 176 ms and a one-round Garden Apartments sitting replayed
 * in 392 ms, answering what the parent thread answers.
 */

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';

import type { RushReplayMessage } from './rushReplayPool.js';

const port = parentPort;
if (port === null) {
  throw new Error('leaderboard/rushReplayWorker.ts must be started as a worker thread, not imported.');
}

/** Running from `src/`, where the specifiers need the help described above. */
const FROM_SOURCE = /\.tsx?(\?|$)/u.test(import.meta.url);

function registerSourceHook(): void {
  const packages = new URL('../../../', import.meta.url);
  const sources: Readonly<Record<string, URL>> = {
    '@elevator-sim/core': new URL('core/src/index.ts', packages),
    '@elevator-sim/core/browser': new URL('core/src/browser.ts', packages),
    '@elevator-sim/experiments': new URL('experiments/src/index.ts', packages),
    '@elevator-sim/experiments/browser': new URL('experiments/src/browser.ts', packages),
  };
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const source = sources[specifier];
      if (source !== undefined) return { url: source.href, shortCircuit: true };
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      if (relative && specifier.endsWith('.js') && context.parentURL?.endsWith('.ts') === true) {
        const beside = new URL(`${specifier.slice(0, -'.js'.length)}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(beside))) return { url: beside.href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

try {
  if (FROM_SOURCE) registerSourceHook();
  await import(new URL(`./rushReplayThread.${FROM_SOURCE ? 'ts' : 'js'}`, import.meta.url).href);
} catch (error) {
  // The thread module reports its own failures once it is running; this is a failure to load it at all.
  const fatal: RushReplayMessage = { kind: 'fatal', message: error instanceof Error ? error.message : String(error) };
  port.postMessage(fatal);
}
