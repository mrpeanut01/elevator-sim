/**
 * Why the gate runs where it runs, and the constraint that decides it.
 *
 * docs/03-traffic-and-statistics.md § Part 3: "If a configuration saturates, flag it and suppress
 * the AWT confidence interval." The runner implements that with no majority vote — **any** saturated
 * replication saturates the cell (`CellAggregate.saturated`, and `awtIsValid` with it) — and its own
 * reasoning is explicit about why: "a configuration that diverges on one passenger population in
 * fifty is a configuration operating at its limit, and averaging its AWT with the runs that happened
 * to cope is exactly how a failed design gets reported as a mediocre one."
 *
 * That rule is right, and it has a consequence nobody wrote down: **it gets strictly harder to
 * satisfy as the replication count rises.** A configuration with a 1-in-100 chance of diverging on
 * a given passenger population passes at n = 20 about 82 % of the time and at n = 200 about 13 % of
 * the time. Since docs/03 also asks for 50–200 replications, the two rules pull against each other,
 * and a sweep near the knee of a building's capacity will report *suppressed* AWT for almost every
 * cell.
 *
 * This suite measures the census that makes that concrete on the two cheapest buildings, and it is
 * the justification for the gate's 1 % operating point: it is the rate at which both `eta` and
 * `nearest-car` come back 0/100 saturated, so every criterion is argued from a statistic the
 * project's own rules permit quoting.
 *
 * Nothing here is asserted as a threshold on the simulator. The assertions are the two structural
 * facts the census exists to establish: the gate's operating point is clean at n = 100, and the
 * suppression rule really does fire as demand rises.
 */

import { describe, expect, it } from 'vitest';

import {
  GATE_BUILDING,
  GATE_REPLICATIONS,
  GATE_SEED,
  cellOf,
  comparePaired,
  gardenAt,
  loadResources,
  midtownUpPeakAt,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from './harness.js';
import type { TrafficArmSpec } from '../runner/types.js';

interface Census {
  readonly building: string;
  readonly rate: number;
  readonly dispatcher: string;
  readonly saturated: number;
  readonly awtIsValid: boolean;
  readonly awtMean: number;
}

async function census(
  building: string,
  rate: number,
  traffic: TrafficArmSpec,
): Promise<readonly Census[]> {
  const resources = withProfiles(await loadResources(), []);
  const result = await runGateExperiment({
    id: `gate/census-${building}-${traffic.id}`,
    seed: GATE_SEED,
    building,
    dispatchers: ['eta', 'nearest-car'],
    traffic,
    replications: GATE_REPLICATIONS,
    resources,
  });
  return ['eta', 'nearest-car'].map((dispatcher) => {
    const cell = cellOf(result, dispatcher);
    const samples = samplesOf(result, dispatcher, 'awtS');
    const finite = samples.filter((value) => Number.isFinite(value));
    return {
      building,
      rate,
      dispatcher,
      saturated: cell.aggregate.saturatedCount,
      awtIsValid: cell.aggregate.awtIsValid,
      awtMean: finite.reduce((total, value) => total + value, 0) / finite.length,
    };
  });
}

describe('the gate’s operating point, and the saturation suppression rule', () => {
  it('is clean at 1 % of population per 5 minutes on Midtown Office', async () => {
    const rows = await census(GATE_BUILDING, 1, midtownUpPeakAt(1));
    for (const row of rows) {
      console.log(
        `[operating point] ${row.building} @ ${row.rate} %/5 min, ${row.dispatcher}: saturated ${row.saturated}/${GATE_REPLICATIONS}, awtIsValid=${row.awtIsValid}, AWT ${row.awtMean.toFixed(4)} s`,
      );
    }
    for (const row of rows) {
      expect(row.saturated).toBe(0);
      expect(row.awtIsValid).toBe(true);
    }
  }, 600_000);

  it('suppresses the AWT interval as demand rises, on one replication in a hundred', async () => {
    const midtown: Census[] = [];
    for (const rate of [1, 1.5, 2, 4]) {
      midtown.push(...(await census(GATE_BUILDING, rate, midtownUpPeakAt(rate))));
    }
    const garden: Census[] = [];
    for (const rate of [12, 20, 30]) {
      garden.push(...(await census('garden-apartments', rate, gardenAt(rate))));
    }
    for (const row of [...midtown, ...garden]) {
      console.log(
        `[census] ${row.building} @ ${row.rate} %/5 min, ${row.dispatcher.padEnd(12)}: saturated ${String(row.saturated).padStart(3)}/${GATE_REPLICATIONS}, awtIsValid=${String(row.awtIsValid).padEnd(5)}, AWT ${row.awtMean.toFixed(2)} s`,
      );
    }

    /* The rule fires, and it fires on a single replication out of a hundred rather than on a
       majority — which is the behaviour docs/03 asks for and the reason the gate needs an
       operating point rather than a convenient rate. */
    const firstSuppressed = [...midtown, ...garden].find(
      (row) => !row.awtIsValid && row.saturated <= 2,
    );
    expect(firstSuppressed).toBeDefined();
    console.log(
      `[census] first suppression on a near-clean cell: ${firstSuppressed?.building} @ ${firstSuppressed?.rate} %/5 min, ${firstSuppressed?.dispatcher}, ${firstSuppressed?.saturated}/${GATE_REPLICATIONS} replications saturated`,
    );

    /* And the practical consequence, stated as arithmetic rather than as opinion: the probability
       a cell survives the rule falls off with n, so the same configuration that passes a
       20-replication smoke test will not pass a 200-replication sweep. */
    for (const perReplication of [0.005, 0.01, 0.02]) {
      const survival = (n: number): string => ((1 - perReplication) ** n * 100).toFixed(1);
      console.log(
        `[census] at a ${(perReplication * 100).toFixed(1)} % per-replication divergence rate, a cell keeps its AWT interval ${survival(20)} % of the time at n = 20, ${survival(100)} % at n = 100, ${survival(200)} % at n = 200`,
      );
    }
    expect((1 - 0.01) ** 200).toBeLessThan(0.2);
  }, 1_800_000);

  it('still yields a usable paired comparison where a cell is suppressed', async () => {
    /* The suppression rule bites the *cell's* AWT interval. A paired comparison over the same
       replications is a different statistic, and the honest position is that it is only quotable
       when neither arm saturated — which is why the gate picks its operating point instead of
       quoting one here. Measured so the size of what is being given up is on the record. */
    const resources = withProfiles(await loadResources(), []);
    const result = await runGateExperiment({
      id: 'gate/census-paired-at-4',
      seed: GATE_SEED,
      building: GATE_BUILDING,
      dispatchers: ['nearest-car', 'eta'],
      traffic: midtownUpPeakAt(4),
      replications: GATE_REPLICATIONS,
      resources,
    });
    const nearestCar = cellOf(result, 'nearest-car');
    const eta = cellOf(result, 'eta');
    const comparison = comparePaired(
      'awtS',
      samplesOf(result, 'nearest-car', 'awtS'),
      samplesOf(result, 'eta', 'awtS'),
    );
    console.log(
      `[census] at 4 %/5 min: nearest-car ${nearestCar.aggregate.saturatedCount}/${GATE_REPLICATIONS} saturated (valid=${nearestCar.aggregate.awtIsValid}), eta ${eta.aggregate.saturatedCount}/${GATE_REPLICATIONS} (valid=${eta.aggregate.awtIsValid}); paired difference ${comparison.estimate.mean.toFixed(4)} s [${comparison.estimate.lower.toFixed(4)}, ${comparison.estimate.upper.toFixed(4)}] — arithmetically fine, and NOT quotable, because both cells are flagged`,
    );
    expect(nearestCar.aggregate.awtIsValid).toBe(false);
    expect(eta.aggregate.awtIsValid).toBe(false);
  }, 600_000);
});
