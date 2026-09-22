/**
 * **The legibility arm of `docs/33` § 6, over the same days the energy bar was measured
 * on** — GitHub issue #354. Gated on `LEGIBILITY_SWEEP=1`, because ten contracts × fifty seeds is
 * a compute job rather than a check; the table it prints is what `shift/legibility.ts`'s docstring
 * publishes, and `legibility.test.ts` pins a ten-seed slice of it on every run.
 *
 * ## It measured the wrong towers until 2026-09-22 — GitHub issue #584, § D961
 *
 * Every state here was `{ ...baseState(), buildingId: contract.buildingId, … }`, and `baseState()`'s
 * week stands on **`c1`**. `shift/ladder.ts#rungFor` keys a rung on the contract *and* the building,
 * so a mismatched pair took no rung and **every tower was swept as built rather than as its
 * contract hands it over** — and two rungs that plainly move a run, Midtown Office's 0.395 occupancy
 * and Harbour Point's 0.6, were reaching nothing. The fix is one call:
 * `contractDay.test-helper.ts#contractDayState` builds the pair together and refuses a mismatched
 * one. The same call also threads `outOfServiceCarIds`, which this sweep dropped — `c7`'s rung
 * declares a maintenance incident, so Crown Hotel was swept with a car the scenario takes away.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { shiftRunConfigOf } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';

import { contractBuildings, contractDayState } from './contractDay.test-helper.js';
import { CONTRACTS } from './contracts.js';
import { LEGIBILITY_SWEEP, legibilityOf } from './legibility.js';

const SEEDS = Number(process.env['LEGIBILITY_SEEDS'] ?? '50');

const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);

describe.runIf(process.env['LEGIBILITY_SWEEP'] === '1')('the legibility sweep — docs/33 § 6, issue #354', () => {
  it('publishes the fraction of seeds with a legible landing per contract, day 1, collective', () => {
    const resources = contractBuildings();
    const lines: string[] = ['| contract | building | legible seeds | of | median longest stretch (s) | per seed |', '|---|---|---|---|---|---|'];
    const measured: Record<string, { legibleOf50: number; medianStretchS: number }> = {};
    for (const contract of CONTRACTS) {
      const longest: number[] = [];
      let legible = 0;
      for (let n = 0; n < SEEDS; n += 1) {
        const state = contractDayState(contract.id, { seed: seedAt(n) });
        const plan = shiftRunConfigOf(resources, state);
        const recording = recordRun(plan.config, {
          recordDecisions: false,
          outOfServiceCarIds: plan.outOfServiceCarIds,
        }).recording;
        const day = legibilityOf(recording);
        longest.push(day.longestS);
        if (day.legible) legible += 1;
      }
      const sorted = [...longest].sort((a, b) => a - b);
      const median = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
      measured[contract.id] = { legibleOf50: legible, medianStretchS: Math.round(median) };
      lines.push(`| ${contract.id} | ${contract.buildingId} | ${String(legible)} | ${String(SEEDS)} | ${median.toFixed(0)} | ${longest.map((value) => value.toFixed(0)).join(' ')} |`);
    }
    const out = process.env['LEGIBILITY_OUT'];
    if (out !== undefined) writeFileSync(out, `${lines.join('\n')}\n`);
    expect(lines.length).toBe(CONTRACTS.length + 2);
    /* The constant beside the window is this sweep as data; at the published budget it must agree. */
    if (SEEDS === 50) {
      expect(measured).toEqual(
        Object.fromEntries(LEGIBILITY_SWEEP.map((row) => [row.contractId, { legibleOf50: row.legibleOf50, medianStretchS: row.medianStretchS }])),
      );
    }
  }, 3_600_000);
});
