import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '@elevator-sim/core';

import { replicationSeed } from './crn.js';
import { planExperiment } from './experiment.js';
import {
  GARDEN_HEALTHY,
  GARDEN_SATURATED,
  MIDTOWN_UP_PEAK,
  docStoppingRule,
  loadResources,
  specOf,
} from './fixtures.test-helper.js';
import {
  aggregateCell,
  fingerprintExperiment,
  runExperiment,
  runPlan,
  runReplication,
} from './replicationRunner.js';
import { fixedBudgetStoppingRule } from './stopping.js';
import type { ExperimentCell, ExperimentResult, ReplicationRecord } from './types.js';
import { RunnerError } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadResources();
}, 60_000);

/* -------------------------------------------------------------------------- *
 * N replications, N records, N seeds
 * -------------------------------------------------------------------------- */

describe('runExperiment: replications', () => {
  it('produces N distinct records, each carrying its own seed (invariant 5)', async () => {
    const spec = specOf({
      id: 'n-replications',
      traffic: [GARDEN_HEALTHY],
      replication: { minReplications: 6, maxReplications: 6, checkEvery: 6 },
    });
    const result = await runExperiment(spec, config);
    const cell = result.cells[0]!;

    expect(result.cells).toHaveLength(1);
    expect(cell.replications).toHaveLength(6);
    expect(result.replicationsRun).toBe(6);
    expect(result.failedReplications).toBe(0);

    // Index order, one seed each, and the seed is the one CRN says it should be.
    expect(cell.replications.map((record) => record.replication)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const record of cell.replications) {
      expect(record.seed).toBe(replicationSeed(spec.seed, record.replication).toString());
      expect(record.summary.seed).toBe(record.seed);
      expect(record.record?.seed).toBe(record.seed);
      expect(record.runId).toBe(`n-replications/garden-apartments|healthy|collective#r${record.replication}`);
      expect(record.tracePassengers).toBeGreaterThan(0);
      expect(record.conservation.balanced).toBe(true);
    }
    expect(new Set(cell.replications.map((record) => record.seed)).size).toBe(6);

    // Distinct runs, not six copies of one: the whole point of replicating.
    expect(new Set(cell.replications.map((record) => record.traceDigest)).size).toBe(6);
  }, 60_000);

  it('keeps the RunRecord by default and drops it on request', async () => {
    const spec = specOf({ id: 'records', replication: { minReplications: 2, maxReplications: 2, checkEvery: 2 } });
    const kept = await runExperiment(spec, config);
    expect(kept.cells[0]?.replications[0]?.record).toBeDefined();

    const dropped = await runExperiment(spec, config, { keepRecords: false });
    expect(dropped.cells[0]?.replications[0]?.record).toBeUndefined();
    // The summary and the seed survive either way, so a dropped record still replays.
    expect(dropped.cells[0]?.replications[0]?.summary.seed).toBe(kept.cells[0]?.replications[0]?.seed);
  }, 60_000);

  it('calls the per-replication hook once each, in index order', async () => {
    const seen: number[] = [];
    const cells: string[] = [];
    await runExperiment(
      specOf({
        id: 'hook',
        dispatchers: ['collective', 'nearest-car'],
        replication: { minReplications: 3, maxReplications: 5, checkEvery: 1 },
      }),
      config,
      {
        stoppingRule: fixedBudgetStoppingRule,
        onReplication: (record: ReplicationRecord, cell: ExperimentCell) => {
          seen.push(record.replication);
          cells.push(cell.cellId);
        },
      },
    );
    expect(seen).toHaveLength(10);
    // Two cells interleave by batch, but within a batch the order is task order, never completion
    // order — otherwise a streamed output file would depend on thread scheduling.
    expect(seen).toEqual([0, 1, 2, 0, 1, 2, 3, 3, 4, 4]);
    expect(new Set(cells).size).toBe(2);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Reproducibility
 * -------------------------------------------------------------------------- */

describe('runExperiment: reproducibility', () => {
  it('gives byte-identical results for the same experimentSeed', async () => {
    const spec = specOf({
      id: 'reproducible',
      buildings: ['midtown-office'],
      dispatchers: ['collective', 'nearest-car'],
      traffic: [MIDTOWN_UP_PEAK],
      replication: { minReplications: 3, maxReplications: 3, checkEvery: 3 },
    });
    const first = await runExperiment(spec, config);
    const second = await runExperiment(spec, config);
    expect(fingerprintExperiment(second)).toBe(fingerprintExperiment(first));
    expect(second.cells).toEqual(first.cells);
  }, 60_000);

  it('gives different results for a different experimentSeed', async () => {
    const spec = specOf({
      id: 'seeded',
      replication: { minReplications: 3, maxReplications: 3, checkEvery: 3 },
    });
    const a = await runExperiment(spec, config);
    const b = await runExperiment({ ...spec, seed: 99 }, config);
    expect(fingerprintExperiment(b)).not.toBe(fingerprintExperiment(a));
  }, 60_000);

  it('replays a stored record from its seed alone', async () => {
    const spec = specOf({
      id: 'replay',
      traffic: [GARDEN_HEALTHY],
      replication: { minReplications: 4, maxReplications: 4, checkEvery: 4 },
    });
    const plan = planExperiment(spec, config);
    const result = await runPlan(plan);
    const stored = result.cells[0]!.replications[2]!;

    const again = runReplication(plan, plan.cells[0]!, stored.replication);
    expect(again.seed).toBe(stored.seed);
    expect(again.traceDigest).toBe(stored.traceDigest);
    expect(again.summary).toEqual(stored.summary);
    expect(again.record).toEqual(stored.record);
    expect(again.metrics).toEqual(stored.metrics);
  }, 60_000);

  it('excludes only the execution report from the fingerprint', async () => {
    const spec = specOf({ id: 'fingerprint', replication: { minReplications: 2, maxReplications: 2, checkEvery: 2 } });
    const result = await runExperiment(spec, config);
    const relabelled: ExperimentResult = {
      ...result,
      execution: { ...result.execution, elapsedMs: result.execution.elapsedMs + 1_000, batches: 99 },
    };
    expect(fingerprintExperiment(relabelled)).toBe(fingerprintExperiment(result));
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Sequential stopping
 * -------------------------------------------------------------------------- */

describe('sequential stopping', () => {
  it('stops early on a low-variance configuration', async () => {
    const spec = specOf({
      id: 'stop-early',
      traffic: [GARDEN_HEALTHY],
      // A generous half-width target: ±20 s is reached after two checks, which is what "stops
      // early" has to mean if the test is to distinguish the rule firing from the cap being hit.
      //
      // RECALIBRATED. Garden Apartments is residential, so its cars now run at the building's
      // own passenger transfer time, 1.75 s, instead of the office 1.2 s every building used to
      // fall through to (`Simulation` never passed `tp` to the car). Slower loading raises both
      // the mean and the spread of AWT on this arm — measured 31.8 s with a standard deviation
      // of 14.5 s, against ~28 s and ~11 s before — so the first check at 4 replications lands
      // at a half-width of 21.96 s, just outside the target, and the second at 8 replications
      // reaches 9.70 s. The rule still fires 52 replications short of the cap; what changed is
      // that the *first* evaluation is no longer the satisfying one, so the assertions below
      // read the evaluation that actually stopped the cell rather than assuming it is index 0.
      replication: { minReplications: 4, maxReplications: 60, checkEvery: 4, confidence: 0.9, acceptableRange: 20 },
    });
    const result = await runExperiment(spec, config, { stoppingRule: docStoppingRule });
    const cell = result.cells[0]!;

    expect(cell.stopping.reason).toBe('rule-satisfied');
    expect(cell.stopping.stoppedEarly).toBe(true);
    expect(cell.stopping.replicationsRun).toBeLessThan(60);
    expect(cell.replications).toHaveLength(cell.stopping.replicationsRun);

    // Early, not merely "before the cap": the rule fires within the first few checks.
    expect(cell.stopping.evaluations.length).toBeLessThanOrEqual(3);
    const evaluation = cell.stopping.evaluations.at(-1);
    expect(evaluation?.verdict.stop).toBe(true);
    expect(evaluation?.verdict.halfWidth).toBeLessThan(20);
    expect(evaluation?.verdict.distribution).toBe('t');
    expect(evaluation?.finiteSamples).toBe(evaluation?.replications);
    // Every earlier check must have declined; a rule that "stops" twice is not sequential.
    for (const earlier of cell.stopping.evaluations.slice(0, -1)) {
      expect(earlier.verdict.stop).toBe(false);
      expect(earlier.verdict.halfWidth).toBeGreaterThanOrEqual(20);
    }
  }, 60_000);

  it('runs to the cap when the target half-width is out of reach', async () => {
    const spec = specOf({
      id: 'stop-late',
      traffic: [GARDEN_HEALTHY],
      replication: { minReplications: 4, maxReplications: 12, checkEvery: 4, confidence: 0.9, acceptableRange: 0.01 },
    });
    const result = await runExperiment(spec, config, { stoppingRule: docStoppingRule });
    const cell = result.cells[0]!;
    expect(cell.stopping.replicationsRun).toBe(12);
    expect(cell.stopping.reason).toBe('max-replications');
    expect(cell.stopping.stoppedEarly).toBe(false);
    expect(cell.stopping.evaluations.map((entry) => entry.replications)).toEqual([4, 8, 12]);
    for (const entry of cell.stopping.evaluations) expect(entry.verdict.stop).toBe(false);
  }, 60_000);

  it('never consults the rule before the minimum replication count', async () => {
    // docs/03-traffic-and-statistics.md § Part 3: ten runs produced a 12 % error against the
    // converged mean, so a floor exists independently of whatever precision the rule reports.
    const asked: number[] = [];
    await runExperiment(
      specOf({
        id: 'floor',
        replication: { minReplications: 5, maxReplications: 20, checkEvery: 5, acceptableRange: 1e6 },
      }),
      config,
      {
        stoppingRule: (input) => {
          asked.push(input.replications);
          return { stop: true };
        },
      },
    );
    expect(asked).toEqual([5]);
  }, 60_000);

  it('runs a fixed budget when no rule is injected', async () => {
    const result = await runExperiment(
      specOf({ id: 'fixed', replication: { minReplications: 2, maxReplications: 6, checkEvery: 2 } }),
      config,
    );
    const cell = result.cells[0]!;
    expect(cell.stopping.replicationsRun).toBe(6);
    expect(cell.stopping.reason).toBe('fixed-budget');
    expect(cell.stopping.evaluations).toHaveLength(0);
  }, 60_000);

  it('accepts a rule that answers with a bare boolean', async () => {
    const result = await runExperiment(
      specOf({ id: 'boolean-rule', replication: { minReplications: 2, maxReplications: 20, checkEvery: 2 } }),
      config,
      { stoppingRule: ({ samples }) => samples.length >= 4 },
    );
    expect(result.cells[0]?.stopping.replicationsRun).toBe(4);
    expect(result.cells[0]?.stopping.reason).toBe('rule-satisfied');
  }, 60_000);

  it('decides per cell, so one arm stopping does not stop the other', async () => {
    const result = await runExperiment(
      specOf({
        id: 'per-cell',
        dispatchers: ['collective', 'nearest-car'],
        replication: { minReplications: 2, maxReplications: 8, checkEvery: 2 },
      }),
      config,
      {
        // Stops the first cell immediately, never the second.
        stoppingRule: ({ samples }) => samples.length >= 2 && samples[0]! < 1e9 && samples.length < 3,
      },
    );
    expect(result.cells.map((cell) => cell.stopping.replicationsRun)).toEqual([2, 2]);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Saturation
 * -------------------------------------------------------------------------- */

describe('saturation', () => {
  it('flags a saturated replication and propagates the flag to the aggregate', async () => {
    const result = await runExperiment(
      specOf({
        id: 'saturated',
        traffic: [GARDEN_SATURATED],
        replication: { minReplications: 4, maxReplications: 4, checkEvery: 4, stopOnSaturation: false },
      }),
      config,
    );
    const cell = result.cells[0]!;

    const saturated = cell.replications.filter((record) => record.saturated);
    expect(saturated.length).toBeGreaterThan(0);
    for (const record of saturated) {
      expect(record.summary.saturation.verdict).toBe('diverging-queue');
      expect(record.awtIsValid).toBe(false);
      expect(record.awtInvalidReason).toBeTruthy();
    }

    // Propagation: any saturated replication saturates the cell and the experiment, and the AWT
    // interval is suppressed rather than quoted (docs/03-traffic-and-statistics.md § Part 3).
    expect(cell.aggregate.saturatedCount).toBe(saturated.length);
    expect(cell.aggregate.saturated).toBe(true);
    expect(cell.aggregate.awtIsValid).toBe(false);
    expect(cell.aggregate.awtInvalidReason).toMatch(/saturated/);
    expect(result.saturated).toBe(true);

    // ...while the samples themselves are still there, so the run can be re-analyzed.
    expect(cell.aggregate.metrics.awtS.samples).toHaveLength(4);
    expect(cell.aggregate.metrics.queueSlopePersonsPerMinute.statistic?.mean).toBeGreaterThan(0);
  }, 60_000);

  it('stops a saturated cell at the minimum by default, rather than refining a suppressed mean', async () => {
    const result = await runExperiment(
      specOf({
        id: 'saturated-stop',
        traffic: [GARDEN_SATURATED],
        replication: { minReplications: 4, maxReplications: 40, checkEvery: 4, acceptableRange: 0.01 },
      }),
      config,
      { stoppingRule: docStoppingRule },
    );
    const cell = result.cells[0]!;
    expect(cell.aggregate.saturated).toBe(true);
    expect(cell.stopping.reason).toBe('saturated');
    expect(cell.stopping.replicationsRun).toBe(4);
  }, 60_000);

  it('leaves a healthy cell valid', async () => {
    const result = await runExperiment(
      specOf({
        id: 'healthy',
        traffic: [GARDEN_HEALTHY],
        replication: { minReplications: 6, maxReplications: 6, checkEvery: 6 },
      }),
      config,
    );
    const cell = result.cells[0]!;
    expect(cell.aggregate.saturated).toBe(false);
    expect(cell.aggregate.awtIsValid).toBe(true);
    expect(cell.aggregate.awtInvalidReason).toBeUndefined();
    expect(result.saturated).toBe(false);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Aggregation
 * -------------------------------------------------------------------------- */

describe('aggregateCell', () => {
  it('keeps samples in replication order, which is what a paired comparison subtracts', async () => {
    const result = await runExperiment(
      specOf({
        id: 'aggregate',
        buildings: ['midtown-office'],
        dispatchers: ['collective', 'nearest-car'],
        traffic: [MIDTOWN_UP_PEAK],
        replication: { minReplications: 4, maxReplications: 4, checkEvery: 4 },
      }),
      config,
    );
    const [left, right] = result.cells;
    for (const cell of [left!, right!]) {
      const awt = cell.aggregate.metrics.awtS;
      expect(awt.samples).toEqual(cell.replications.map((record) => record.metrics.awtS));
      expect(awt.finiteCount + awt.nonFiniteCount).toBe(4);
      expect(awt.statistic?.count).toBe(awt.finiteCount);
    }
    // Pairable: equal length, equal indices, equal traces.
    expect(left!.traceKey).toBe(right!.traceKey);
    expect(left!.replications.map((record) => record.traceDigest)).toEqual(
      right!.replications.map((record) => record.traceDigest),
    );
  }, 60_000);

  it('counts a non-finite sample rather than folding it into the mean', () => {
    const records = [
      stubRecord(0, 10),
      stubRecord(1, Number.NaN),
      stubRecord(2, 20),
    ];
    const aggregate = aggregateCell(records);
    const awt = aggregate.metrics.awtS;
    expect(awt.samples).toHaveLength(3);
    expect(awt.finiteCount).toBe(2);
    expect(awt.nonFiniteCount).toBe(1);
    expect(awt.statistic?.mean).toBe(15);
    expect(aggregate.awtIsValid).toBe(true);
  });

  it('withholds validity when fewer than two replications produced a finite AWT', () => {
    const aggregate = aggregateCell([stubRecord(0, 10), stubRecord(1, Number.NaN)]);
    expect(aggregate.awtIsValid).toBe(false);
    expect(aggregate.awtInvalidReason).toMatch(/not enough for an interval/);
    expect(aggregate.metrics.awtS.statistic?.count).toBe(1);
  });

  it('reports an empty cell without inventing a mean', () => {
    const aggregate = aggregateCell([]);
    expect(aggregate.count).toBe(0);
    expect(aggregate.metrics.awtS.statistic).toBeUndefined();
    expect(aggregate.awtIsValid).toBe(false);
  });
});

function stubRecord(replication: number, awtS: number): ReplicationRecord {
  const metrics = Object.fromEntries(
    Object.keys(aggregateCell([]).metrics).map((metric) => [metric, metric === 'awtS' ? awtS : 1]),
  ) as ReplicationRecord['metrics'];
  return {
    replication,
    seed: String(replication),
    runId: `stub#r${replication}`,
    status: 'completed',
    summary: { saturation: { saturated: false }, awtIsValid: true } as unknown as ReplicationRecord['summary'],
    metrics,
    saturated: false,
    awtIsValid: true,
    traceDigest: `digest-${replication}`,
    tracePassengers: 1,
    conservation: { balanced: true } as unknown as ReplicationRecord['conservation'],
    undeliveredCount: 0,
    warnings: [],
  };
}

/* -------------------------------------------------------------------------- *
 * Failures
 * -------------------------------------------------------------------------- */

describe('a replication that throws', () => {
  const brokenSpec = specOf({
    id: 'broken',
    replication: { minReplications: 2, maxReplications: 2, checkEvery: 2 },
    // Exhausts the kernel's event budget, which core reports as `aborted` and always throws.
    simulation: { maxEvents: 40 },
  });

  it('stops the experiment by default, because a crash is not a data point', async () => {
    await expect(runExperiment(brokenSpec, config)).rejects.toThrow(RunnerError);
    await expect(runExperiment(brokenSpec, config)).rejects.toThrow(/SimulationError/);
  }, 60_000);

  it('is collected as a failure when the caller asks for that', async () => {
    const result = await runExperiment(brokenSpec, config, { onReplicationError: 'record' });
    const cell = result.cells[0]!;
    expect(cell.replications).toHaveLength(0);
    expect(cell.failures).toHaveLength(2);
    expect(cell.failures[0]?.error.fromSimulation).toBe(true);
    expect(cell.failures[0]?.seed).toBe(replicationSeed(brokenSpec.seed, 0).toString());
    expect(result.failedReplications).toBe(2);
    // Nothing to be precise about, so the cell stops instead of burning the budget.
    expect(cell.stopping.reason).toBe('no-samples');
    expect(cell.aggregate.awtIsValid).toBe(false);
  }, 60_000);
});
