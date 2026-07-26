/**
 * **Phase 3 acceptance criterion 4** — "any stored run replays to identical results from its
 * seed."
 *
 * ## What counts as evidence here
 *
 * Not "the stored numbers equal themselves". The run is **re-executed**: the record goes to disk
 * as newline-delimited JSON, the process reads it back through `readRunSetFile`, `loadConfig`
 * re-reads `data/` from scratch, `replaySimulationConfig` rebuilds the `SimulationConfig` from the
 * stored envelope alone, and `runSimulation` runs the whole simulation again. Only then are the two
 * `RunRecord`s fingerprinted and compared. So the test covers two independent things, and a
 * failure would say which: the simulator's determinism, and whether the stored configuration is
 * *complete* enough to reconstruct the run without the object that produced it.
 *
 * A negative control is included, because a replay test that cannot fail proves nothing: the same
 * record with its seed incremented by one must **not** replay identically. Invariant 5 says every
 * persisted record carries its seed; this checks that the seed is load-bearing rather than
 * decorative.
 *
 * The seeds are the runner's real ones — `replicationSeed(experimentSeed, i)`, 64-bit, stored as
 * decimal strings because `Number` would silently lose them above 2^53 — so the round trip
 * exercises the path a sweep actually writes.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runSimulation } from '@elevator-sim/core';
import { afterAll, describe, expect, it } from 'vitest';

import { replicationSeed } from '../runner/crn.js';
import { planExperiment } from '../runner/experiment.js';
import { simulationConfigFor } from '../runner/replication.js';
import {
  appendRunToFile,
  createStoredRun,
  readRunSetFile,
  runRecordFingerprint,
  storedRunFingerprint,
  summaryFingerprint,
} from '../reports/persistence.js';
import { reanalyzeStoredRun, verifySummaryFingerprint } from '../reports/reanalyze.js';
import { replaySourcesFrom, replayStoredRun } from '../reports/replay.js';
import {
  GATE_BUILDING,
  GATE_SEED,
  MIDTOWN_UP_PEAK,
  loadResources,
  withProfiles,
} from './harness.js';

const REPLICATIONS = 5;

let scratch: string | undefined;

afterAll(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
});

describe('Phase 3 criterion 4 — a stored run re-executes to an identical result', () => {
  it('round-trips through NDJSON and re-runs the simulator from the stored seed alone', async () => {
    const config = await loadResources();
    const resources = withProfiles(config, []);
    const plan = planExperiment(
      {
        id: 'gate/replay',
        seed: GATE_SEED,
        buildings: [GATE_BUILDING],
        dispatchers: ['eta'],
        traffic: [MIDTOWN_UP_PEAK],
        replication: { minReplications: REPLICATIONS, maxReplications: REPLICATIONS, checkEvery: 1 },
        parallel: { mode: 'serial' },
      },
      resources,
    );
    const cell = plan.cells[0];
    if (cell === undefined) throw new Error('planExperiment produced no cells.');

    scratch = await mkdtemp(join(tmpdir(), 'phase3-gate-replay-'));
    const path = join(scratch, 'runs.ndjson');

    /* Persist. One record per replication, each carrying its own seed (invariant 5). */
    const originalFingerprints: string[] = [];
    for (let replication = 0; replication < REPLICATIONS; replication += 1) {
      const seed = replicationSeed(plan.experimentSeed, replication);
      const simulationConfig = simulationConfigFor(plan.experimentId, cell, replication, seed);
      const result = runSimulation(simulationConfig);
      originalFingerprints.push(runRecordFingerprint(result.record));
      await appendRunToFile(
        path,
        createStoredRun({
          experimentId: plan.experimentId,
          experimentSeed: plan.experimentSeed,
          replication,
          config: simulationConfig,
          result,
        }),
      );
    }

    /* Reload from disk. Nothing from the writing side survives except the file. */
    const reloaded = await readRunSetFile(path);
    expect(reloaded).toHaveLength(REPLICATIONS);

    /* Replay against config re-read from `data/`, not against the objects that produced the runs. */
    const sources = replaySourcesFrom(await loadResources());
    for (const [index, stored] of reloaded.entries()) {
      const outcome = replayStoredRun(stored, sources);
      console.log(
        `[criterion 4] ${stored.record.runId} seed ${stored.config.seed}: identical=${outcome.identical}, summaryMatches=${outcome.summaryMatches}, fingerprint ${outcome.storedFingerprint} → ${outcome.replayedFingerprint}, AWT ${outcome.result.summary.waiting.meanS.toFixed(6)} s`,
      );
      if (!outcome.identical) {
        throw new Error(
          `Stored run "${stored.record.runId}" did not re-execute to an identical record.\n${outcome.differences.join('\n')}`,
        );
      }
      expect(outcome.identical).toBe(true);
      expect(outcome.summaryMatches).toBe(true);
      expect(outcome.replayedFingerprint).toBe(originalFingerprints[index]);
      /* And the whole envelope, so a field that only the writer knew about would be caught too. */
      expect(storedRunFingerprint(stored)).toBe(
        storedRunFingerprint({ ...stored, record: outcome.result.record }),
      );
      /* Re-analysis without re-simulating must reach the same headline numbers. */
      expect(verifySummaryFingerprint(stored)).toBe(true);
      expect(summaryFingerprint(reanalyzeStoredRun(stored))).toBe(stored.summaryFingerprint);
    }
  }, 600_000);

  it('does not replay identically when the stored seed is altered', async () => {
    const config = await loadResources();
    const resources = withProfiles(config, []);
    const plan = planExperiment(
      {
        id: 'gate/replay-control',
        seed: GATE_SEED,
        buildings: [GATE_BUILDING],
        dispatchers: ['eta'],
        traffic: [MIDTOWN_UP_PEAK],
        replication: { minReplications: 1, maxReplications: 1, checkEvery: 1 },
        parallel: { mode: 'serial' },
      },
      resources,
    );
    const cell = plan.cells[0];
    if (cell === undefined) throw new Error('planExperiment produced no cells.');
    const seed = replicationSeed(plan.experimentSeed, 0);
    const simulationConfig = simulationConfigFor(plan.experimentId, cell, 0, seed);
    const stored = createStoredRun({
      experimentId: plan.experimentId,
      experimentSeed: plan.experimentSeed,
      replication: 0,
      config: simulationConfig,
      result: runSimulation(simulationConfig),
    });

    const tampered = {
      ...stored,
      config: { ...stored.config, seed: (BigInt(stored.config.seed) + 1n).toString() },
    };
    const outcome = replayStoredRun(tampered, replaySourcesFrom(config));
    console.log(
      `[criterion 4] negative control, seed ${stored.config.seed} → ${tampered.config.seed}: identical=${outcome.identical}`,
    );
    expect(outcome.identical).toBe(false);
  }, 600_000);
});
