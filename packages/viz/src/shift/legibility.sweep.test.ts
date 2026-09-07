/**
 * **The legibility arm of `docs/33` § 6, over the same four hundred days the energy bar was measured
 * on** — GitHub issue #354. Gated on `LEGIBILITY_SWEEP=1`, because eight contracts × fifty seeds is
 * a compute job rather than a check; the table it prints is what `shift/legibility.ts`'s docstring
 * publishes, and `legibility.test.ts` pins a ten-seed slice of it on every run.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { shiftLengthForContract, shiftRunConfigOf } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseBuilding, resolveBuilding } from '@elevator-sim/core';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import type { BrowserResources } from '../dev/data.js';

import { CONTRACTS } from './contracts.js';
import { LEGIBILITY_SWEEP, legibilityOf } from './legibility.js';

const SEEDS = Number(process.env['LEGIBILITY_SEEDS'] ?? '50');

/**
 * Every shipped building, not `probes.test-helper.ts`'s two: the sweep is over all eight contracts,
 * so the resources carry all eight resolved buildings, parsed through the same loader.
 */
function allBuildings(): BrowserResources {
  const entries = ['chancery-house', 'crown-hotel', 'garden-apartments', 'midtown-office', 'mixed-use-high-rise', 'secure-tower', 'st-jude-hospital', 'vertical-city'].map((id) => {
    const config = parseBuilding(JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);

describe.runIf(process.env['LEGIBILITY_SWEEP'] === '1')('the legibility sweep — docs/33 § 6, issue #354', () => {
  it('publishes the fraction of seeds with a legible landing per contract, day 1, collective', () => {
    const resources = allBuildings();
    const lines: string[] = ['| contract | building | legible seeds | of | median longest stretch (s) | per seed |', '|---|---|---|---|---|---|'];
    const measured: Record<string, { legibleOf50: number; medianStretchS: number }> = {};
    for (const contract of CONTRACTS) {
      const longest: number[] = [];
      let legible = 0;
      for (let n = 0; n < SEEDS; n += 1) {
        const state = {
          ...baseState(),
          buildingId: contract.buildingId,
          dispatcherId: 'collective',
          shiftLengthS: shiftLengthForContract(contract.id),
          seed: seedAt(n),
          campaignEventId: 'ordinary' as const,
        };
        const plan = shiftRunConfigOf(resources, state);
        const recording = recordRun(plan.config, { recordDecisions: false }).recording;
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
