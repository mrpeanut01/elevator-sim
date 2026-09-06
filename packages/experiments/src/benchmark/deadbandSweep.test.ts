/**
 * The two Phase 5 sweeps, reproducible in one call — GitHub issue #178 item 6, § D513.
 *
 * Both publish intervals, so both sets of pins are compared against a fresh run at the published
 * budget, `prepositioning.test.ts`'s own shape — Garden is small enough that n = 300 across the
 * twelve cells is under a minute. The rate sweep's count is asserted beside its intervals, because
 * the verdict quotes the count (*300/300 bit-identical at 4 %*) and a pin holds only the interval.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEADBAND_SWEEP_THRESHOLDS_S,
  RATE_SWEEP_RATES,
  SWEEP_REPLICATIONS,
  runDeadbandSweep,
  runRateSweep,
} from './deadbandSweep.js';
import { checkPinned, deadbandSweepFigures, rateSweepFigures } from './published.js';

describe('the deadband sweep — eight paired intervals against stay', () => {
  it('reproduces its pins at the published budget, and finds the interior optimum the verdict quotes', async () => {
    const study = await runDeadbandSweep({});
    expect(study.replications).toBe(SWEEP_REPLICATIONS);
    expect(study.rows.map((row) => row.thresholdS)).toEqual([...DEADBAND_SWEEP_THRESHOLDS_S]);
    const figures = deadbandSweepFigures(study);
    const out = process.env['SWEEP_PINS_OUT'];
    if (out !== undefined) {
      writeFileSync(out, JSON.stringify({ figures: [...figures], optimumThresholdS: study.optimumThresholdS, rows: study.rows.map((row) => ({ t: row.thresholdS, verdict: row.awt.verdict, mean: row.awt.estimate.mean, lower: row.awt.estimate.lower, upper: row.awt.estimate.upper })) }, null, 2));
      return;
    }
    expect(checkPinned('deadband-sweep', figures)).toEqual([]);
    /* The curve turns back up below the optimum, which is the finding rather than a monotone gain. */
    expect(study.optimumThresholdS).toBeGreaterThan(0);
    expect(study.optimumThresholdS).toBeLessThan(8);
  }, 3_600_000);
});

describe('the rate sweep — four paired intervals and the count beside each', () => {
  it('reproduces its pins at the published budget, and is inert at every rate without being identical at every rate', async () => {
    const study = await runRateSweep({});
    expect(study.thresholdS).toBe(8);
    expect(study.rows.map((row) => row.ratePctPop5min)).toEqual([...RATE_SWEEP_RATES]);
    const figures = rateSweepFigures(study);
    const out = process.env['SWEEP_PINS_OUT'];
    if (out !== undefined) {
      writeFileSync(
        `${out}.rate.json`,
        JSON.stringify(
          {
            figures: [...figures],
            inertAtEveryRate: study.inertAtEveryRate,
            rows: study.rows.map((row) => ({ rate: row.ratePctPop5min, verdict: row.awt.verdict, exactZeroCount: row.exactZeroCount, mean: row.awt.estimate.mean, lower: row.awt.estimate.lower, upper: row.awt.estimate.upper })),
          },
          null,
          2,
        ),
      );
      return;
    }
    expect(checkPinned('rate-sweep', figures)).toEqual([]);
    for (const row of study.rows) expect(row.replications).toBe(SWEEP_REPLICATIONS);
    /* The verdict's sentence, both halves: inert everywhere, bit-identical at 4 % and only there. */
    expect(study.inertAtEveryRate).toBe(true);
    const identical = study.rows.filter((row) => row.awt.verdict === 'IDENTICAL').map((row) => row.ratePctPop5min);
    expect(identical).toEqual([4]);
    const at4 = study.rows.find((row) => row.ratePctPop5min === 4);
    expect(at4?.exactZeroCount).toBe(SWEEP_REPLICATIONS);
    for (const row of study.rows) expect(row.exactZeroCount).toBeGreaterThanOrEqual(SWEEP_REPLICATIONS - 3);
  }, 3_600_000);
});
