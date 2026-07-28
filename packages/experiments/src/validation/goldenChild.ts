/**
 * The cross-process half of the golden-run regression, as an executable.
 *
 * ```bash
 * node packages/experiments/dist/validation/goldenChild.js runs.ndjson
 * ```
 *
 * Reads one NDJSON run set, replays every record against `data/`, and prints one line per record:
 * `<runId> <fingerprint> identical` or `<runId> <fingerprint> DIVERGED …`. Nothing else — the
 * parent test compares the line.
 *
 * ## Why a separate process at all
 *
 * `storedRunReplay.test.ts` and the in-process half of `goldenRuns.test.ts` both replay inside the
 * process that produced the record. That cannot observe a dependence on anything the process
 * accumulated: a module-level counter, an evaluation order, a cached value keyed on something the
 * first run installed. `core/sim/determinism.test.ts` covers the narrowest version of this — ids
 * must not come from a module-level counter — by running other simulations in between. A bare
 * `node` with no vitest, no test framework and no prior simulation covers the general version.
 *
 * It is deliberately not a vitest file. A child process spawned by the runner it is testing shares
 * the runner's module graph and half the point evaporates.
 */

import { loadConfig, runSimulation } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';

import { runRecordFingerprint } from '../reports/persistence.js';
import { readRunSetFile } from '../reports/persistence.js';
import { replaySimulationConfig, replaySourcesFrom } from '../reports/replay.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

async function main(): Promise<void> {
  const path = process.argv[2];
  if (path === undefined) {
    throw new Error('usage: node goldenChild.js <runs.ndjson>');
  }
  const sources = replaySourcesFrom(await loadConfig(DATA_DIR));
  for (const stored of await readRunSetFile(path)) {
    const replayed = runSimulation(replaySimulationConfig(stored, sources));
    const before = runRecordFingerprint(stored.record);
    const after = runRecordFingerprint(replayed.record);
    process.stdout.write(
      `${stored.record.runId} ${before} ${before === after ? 'identical' : `DIVERGED to ${after}`}\n`,
    );
  }
}

await main();
