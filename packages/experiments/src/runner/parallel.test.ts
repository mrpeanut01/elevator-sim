import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '@elevator-sim/core';

import { replicationSeed } from './crn.js';
import { planExperiment } from './experiment.js';
import {
  GARDEN_HEALTHY,
  MIDTOWN_UP_PEAK,
  assertCoreBuilt,
  docStoppingRule,
  loadResources,
  specOf,
} from './fixtures.test-helper.js';
import {
  createExecutor,
  createSerialExecutor,
  createWorkerPoolExecutor,
  resolveWorkerCount,
  workerEntryUrl,
} from './parallel.js';
import { fingerprintExperiment, runExperiment, runPlan } from './replicationRunner.js';
import type { ExperimentPlan, ExperimentSpec, ReplicationTask, TrafficArmSpec } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadResources();
}, 60_000);

/**
 * Traffic arms with no building-specific demand options, so every point of a multi-building cross
 * product is runnable.
 *
 * `MIDTOWN_UP_PEAK` cannot serve here: it zeroes the `P1` garage to reproduce the closed form's
 * single terminal, and Garden Apartments has no such floor — core rejects the arm outright, which
 * is the right behaviour and the reason a cross-product spec needs arms like these.
 */
const CROSS_SAFE_QUIET: TrafficArmSpec = {
  id: 'quiet',
  durationS: 900,
  demand: { arrivalRatePctPop5min: 8, peakWindowS: 300 },
};

const CROSS_SAFE_BRISK: TrafficArmSpec = {
  id: 'brisk',
  durationS: 900,
  demand: { arrivalRatePctPop5min: 15, peakWindowS: 300 },
};

/* -------------------------------------------------------------------------- *
 * Choosing an executor
 * -------------------------------------------------------------------------- */

describe('workerEntryUrl', () => {
  it('resolves to a file that exists, from source or from dist', () => {
    const entry = workerEntryUrl();
    expect(existsSync(fileURLToPath(entry))).toBe(true);
    // Under vitest this module is the TypeScript source, so the entry must be too; Node 26 strips
    // the types when it loads the worker.
    expect(entry.href).toMatch(/\/runner\/worker\.(ts|js)$/);
  });
});

describe('resolveWorkerCount', () => {
  it('honours an explicit count and never exceeds the work available', () => {
    const policy = { mode: 'workers' as const, workers: 6, minReplicationsForWorkers: 64 };
    expect(resolveWorkerCount(policy, 100)).toBe(6);
    expect(resolveWorkerCount(policy, 2)).toBe(2);
    expect(resolveWorkerCount(policy, 0)).toBe(1);
  });

  it('derives a count that leaves the parent room, capped at eight', () => {
    const derived = resolveWorkerCount({ mode: 'auto', workers: 0, minReplicationsForWorkers: 1 }, 1_000);
    expect(derived).toBeGreaterThanOrEqual(1);
    expect(derived).toBeLessThanOrEqual(8);
  });
});

describe('createExecutor', () => {
  const planWith = (spec: Partial<ExperimentSpec>): ExperimentPlan =>
    planExperiment(specOf({ id: 'choose', ...spec }), config);

  it('obeys an explicit mode', async () => {
    const serial = createExecutor(planWith({ parallel: { mode: 'serial' } }));
    expect(serial.executor.kind).toBe('serial');
    expect(serial.executor.workers).toBe(1);
    await serial.executor.close();

    const pool = createExecutor(planWith({ parallel: { mode: 'workers', workers: 2 } }));
    expect(pool.executor.kind).toBe('workers');
    expect(pool.executor.workers).toBe(2);
    // Never started, so closing is a no-op — and must not throw.
    await pool.executor.close();
  });

  it('stays serial in auto mode until the guaranteed work repays thread start-up', async () => {
    const small = createExecutor(
      planWith({ parallel: { mode: 'auto' }, replication: { minReplications: 4, maxReplications: 4 } }),
    );
    expect(small.executor.kind).toBe('serial');
    expect(small.reason).toMatch(/below the 64 needed/);
    await small.executor.close();

    const large = createExecutor(
      planWith({
        parallel: { mode: 'auto', workers: 2 },
        replication: { minReplications: 200, maxReplications: 200 },
      }),
    );
    expect(large.executor.kind).toBe('workers');
    expect(large.reason).toMatch(/200 guaranteed replications/);
    await large.executor.close();
  });

  it('is a pure function of the plan, so the choice itself is reproducible', () => {
    const plan = planWith({ parallel: { mode: 'auto' } });
    expect(createExecutor(plan).reason).toBe(createExecutor(plan).reason);
  });
});

/* -------------------------------------------------------------------------- *
 * THE PROPERTY THAT MAKES THE DESIGN SAFE
 * -------------------------------------------------------------------------- */

/**
 * Parallelism must not change a single reported number.
 *
 * These are the tests the whole `parallel.ts` design exists to pass. They run the *same spec*
 * through the serial executor and through a real worker pool and compare
 * {@link fingerprintExperiment} — every replication's summary, scalar projection, saturation flag,
 * trace digest, conservation audit and full `RunRecord`, plus each cell's stopping history.
 *
 * A worker resolves `@elevator-sim/core` to core's built output while vitest resolves it to core's
 * source, so {@link assertCoreBuilt} fails loudly on a stale `dist` rather than letting a build
 * problem masquerade as a concurrency bug.
 */
describe('parallel and serial agree', () => {
  beforeAll(() => {
    assertCoreBuilt();
  });

  it('byte-identically, on a fixed budget across eight cells', async () => {
    // Two buildings, two dispatchers, two traffic conditions. The arms carry no
    // building-specific demand options, so every point of the cross product is runnable — and one
    // of them (Midtown at these rates) saturates, so parity is checked under saturation too.
    const spec = specOf({
      id: 'fixed-parity',
      buildings: ['garden-apartments', 'midtown-office'],
      dispatchers: ['collective', 'nearest-car'],
      traffic: [CROSS_SAFE_QUIET, CROSS_SAFE_BRISK],
      replication: { minReplications: 4, maxReplications: 4, checkEvery: 4 },
    });
    const serial = await runExperiment(spec, config, { parallel: { mode: 'serial' } });
    const parallel = await runExperiment(spec, config, { parallel: { mode: 'workers', workers: 4 } });

    expect(serial.execution.executor).toBe('serial');
    expect(parallel.execution.executor).toBe('workers');
    expect(parallel.execution.workers).toBe(4);

    expect(serial.cells).toHaveLength(8);
    expect(serial.replicationsRun).toBe(32);
    expect(serial.saturated).toBe(true);
    expect(fingerprintExperiment(parallel)).toBe(fingerprintExperiment(serial));
    expect(parallel.cells).toEqual(serial.cells);
    expect(parallel.saturated).toBe(serial.saturated);
  }, 180_000);

  it('byte-identically, with adaptive stopping — including how many replications each cell ran', async () => {
    // The harder case. If batch composition depended on the pool size, the two would stop at
    // different replication counts and every mean would legitimately differ; `checkEvery` is policy
    // data precisely so that cannot happen.
    const spec = specOf({
      id: 'adaptive-parity',
      buildings: ['garden-apartments'],
      dispatchers: ['collective', 'nearest-car', 'eta'],
      traffic: [GARDEN_HEALTHY],
      replication: { minReplications: 4, maxReplications: 24, checkEvery: 3, confidence: 0.9, acceptableRange: 6 },
    });
    const serial = await runExperiment(spec, config, {
      parallel: { mode: 'serial' },
      stoppingRule: docStoppingRule,
    });
    const parallel = await runExperiment(spec, config, {
      parallel: { mode: 'workers', workers: 3 },
      stoppingRule: docStoppingRule,
    });

    const counts = serial.cells.map((cell) => cell.stopping.replicationsRun);
    expect(counts.some((count) => count > 4 && count < 24)).toBe(true);
    expect(parallel.cells.map((cell) => cell.stopping.replicationsRun)).toEqual(counts);
    expect(parallel.execution.batches).toBe(serial.execution.batches);
    expect(parallel.execution.batches).toBeGreaterThan(1);
    expect(fingerprintExperiment(parallel)).toBe(fingerprintExperiment(serial));
  }, 120_000);

  it('keeps its threads warm across batches instead of respawning per round', async () => {
    const plan = planExperiment(
      specOf({
        id: 'warm-pool',
        replication: { minReplications: 2, maxReplications: 8, checkEvery: 2 },
      }),
      config,
    );
    const pool = createWorkerPoolExecutor(plan, 2);
    try {
      const first = await pool.run(tasksFor(plan, 0, 2));
      const second = await pool.run(tasksFor(plan, 2, 4));
      expect(first).toHaveLength(2);
      expect(second).toHaveLength(2);
      const serial = createSerialExecutor(plan);
      expect(second).toEqual(await serial.run(tasksFor(plan, 2, 4)));
    } finally {
      await pool.close();
    }
  }, 120_000);

  it('returns outcomes in task order, not completion order', async () => {
    const plan = planExperiment(
      specOf({
        id: 'ordered',
        buildings: ['garden-apartments', 'midtown-office'],
        traffic: [CROSS_SAFE_QUIET],
        replication: { minReplications: 12, maxReplications: 12, checkEvery: 12 },
      }),
      config,
    );
    // Interleaved cells and unequal per-replication cost — a Midtown replication takes around
    // thirty times as long as a Garden one at these rates — so completion order will not be task
    // order, and a pool that returned results as they arrived would fail here.
    const tasks: ReplicationTask[] = [];
    for (let replication = 0; replication < 6; replication += 1) {
      for (const cell of plan.cells) {
        tasks.push({ cellIndex: cell.index, replication, seed: replicationSeed(plan.experimentSeed, replication) });
      }
    }
    const pool = createWorkerPoolExecutor(plan, 4);
    try {
      const outcomes = await pool.run(tasks);
      expect(outcomes).toHaveLength(tasks.length);
      for (const [index, outcome] of outcomes.entries()) {
        expect(outcome.cellIndex).toBe(tasks[index]!.cellIndex);
        expect(outcome.replication).toBe(tasks[index]!.replication);
        expect(outcome.seed).toBe(tasks[index]!.seed.toString());
      }
      expect(outcomes).toEqual(await createSerialExecutor(plan).run(tasks));
    } finally {
      await pool.close();
    }
  }, 120_000);

  it('reports a replication that threw as data, identically to the serial path', async () => {
    const spec = specOf({
      id: 'worker-failure',
      replication: { minReplications: 4, maxReplications: 4, checkEvery: 4 },
      simulation: { maxEvents: 40 },
    });
    const serial = await runExperiment(spec, config, {
      parallel: { mode: 'serial' },
      onReplicationError: 'record',
    });
    const parallel = await runExperiment(spec, config, {
      parallel: { mode: 'workers', workers: 2 },
      onReplicationError: 'record',
    });

    expect(serial.failedReplications).toBe(4);
    expect(parallel.failedReplications).toBe(4);
    // Stacks differ between threads and are not part of the result's identity; everything the
    // runner acts on must match.
    const strip = (result: typeof serial): unknown =>
      result.cells.map((cell) =>
        cell.failures.map((failure) => ({
          replication: failure.replication,
          seed: failure.seed,
          name: failure.error.name,
          message: failure.error.message,
          fromSimulation: failure.error.fromSimulation,
        })),
      );
    expect(strip(parallel)).toEqual(strip(serial));
  }, 120_000);

  it('survives the structured clone of the cell payload with the numbers intact', async () => {
    // The pool ships `ResolvedBuilding`, the dispatcher profile, the traffic profiles and the
    // elevator specs to each worker by structured clone. A field lost in the clone would change
    // results *only* under the pool, which is the worst possible failure. Checked directly, on the
    // clone itself, so the diagnosis does not depend on a whole experiment disagreeing.
    const plan = planExperiment(
      specOf({
        id: 'clone-fidelity',
        buildings: ['midtown-office'],
        traffic: [MIDTOWN_UP_PEAK],
        replication: { minReplications: 1, maxReplications: 1, checkEvery: 1 },
      }),
      config,
    );
    const cloned = structuredClone(plan.cells);
    const clonedPlan: ExperimentPlan = { ...plan, cells: cloned };
    const direct = await runPlan(plan);
    const viaClone = await runPlan(clonedPlan);
    expect(fingerprintExperiment(viaClone)).toBe(fingerprintExperiment(direct));
  }, 120_000);
});

function tasksFor(plan: ExperimentPlan, from: number, to: number): ReplicationTask[] {
  const tasks: ReplicationTask[] = [];
  for (let replication = from; replication < to; replication += 1) {
    tasks.push({
      cellIndex: 0,
      replication,
      seed: replicationSeed(plan.experimentSeed, replication),
    });
  }
  return tasks;
}
