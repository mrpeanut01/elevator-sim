/**
 * **What one round of a posted rush sitting costs the server to replay** — GitHub issue #372.
 *
 * The owner's ruling of 2026-09-10 on that issue: *"The replay cost per round is measured before
 * `leaderboard/verify.ts`'s refusal of `endless-rush` is lifted."* This is that measurement, on the
 * server's own replay path — `rushSitting.ts#replayRushSitting`, the function `http/api.ts` calls —
 * in wall time and in simulations, on every shipped building, and on a chain of rounds so *per round*
 * is a measured quotient rather than an assumption that rounds cost the same.
 *
 * ## It asserts almost nothing, and that is deliberate
 *
 * A wall-clock figure is a claim about a machine, and this repository's rule is that such a figure is
 * dated and named rather than turned into a gate that goes red on a loaded box
 * (`packages/viz/src/live/interventions.ts`'s measurement note). The one assertion is the count this
 * path owns: a sitting of *n* rounds runs exactly *n* simulations, which is what the cooldown charges.
 *
 * ## Skipped unless asked for
 *
 * Gated on `RUSH_SITTING_COST_OUT`, on `packages/viz/src/honesty/measure.corpus.test.ts`'s pattern:
 * vitest intercepts `console.log`, so the table is written to a file. The command:
 *
 * ```
 * RUSH_SITTING_COST_OUT=/tmp/rush-sitting-cost.md \
 *   npx vitest run --project server packages/server/src/leaderboard/rushSitting.cost.test.ts
 * ```
 */

import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig, parseChimeLedger, parseRushPurse, runSimulation, rushHoldAtLegs } from '@elevator-sim/core';

import { replayRushSitting, type SubmittedRushRound, type SubmittedRushSitting } from './rushSitting.js';
import { rushRoundConfigFor, type VerificationResources } from './verify.js';

const OUT = process.env['RUSH_SITTING_COST_OUT'];
const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;
/** Timed replays per cell. The median is published, and the spread beside it. */
const REPEATS = 3;
/** The chain lengths timed on the smallest shipped building, to show a round costs what a round costs. */
const CHAIN = [1, 2, 4] as const;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? Number.NaN) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

describe.skipIf(OUT === undefined)('the replay cost of a rush round, measured — GitHub issue #372', () => {
  it('times replayRushSitting per round on every shipped building, and on a chain', async () => {
    const config = await loadConfig(DATA_DIR);
    const resources: VerificationResources = {
      buildingsById: config.buildingsById,
      dispatcherProfilesById: config.dispatcherProfilesById,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      dispatcherProfiles: config.dispatcherProfiles,
    };
    const ledger = parseChimeLedger(JSON.parse(await readFile(join(DATA_DIR, 'chime-ledger.json'), 'utf8')) as unknown);
    const purse = parseRushPurse(JSON.parse(await readFile(join(DATA_DIR, 'rush-purse.json'), 'utf8')) as unknown);
    const from = { resources, purse, ledger };

    /** The honest claim for one round, taken once and untimed, so the timed passes verify rather than refuse. */
    const roundOn = (buildingId: string): { round: SubmittedRushRound; passengers: number } => {
      const round = { dispatcherProfileId: 'collective' };
      const built = rushRoundConfigFor(buildingId, round, resources);
      if (typeof built === 'string') throw new Error(`${buildingId}: ${built}`);
      const { record } = runSimulation(built);
      const hold = rushHoldAtLegs(record.passengers, record.startedAt, record.endedAt);
      return {
        round: { ...round, claimedHeldS: hold === undefined ? null : hold - record.startedAt },
        passengers: record.passengers.length,
      };
    };

    const time = (sitting: SubmittedRushSitting): { ms: number[]; simulations: number; outcome: string } => {
      const ms: number[] = [];
      let simulations = 0;
      let outcome = '';
      for (let repeat = 0; repeat < REPEATS; repeat += 1) {
        const started = performance.now();
        const verified = replayRushSitting(sitting, from);
        ms.push(performance.now() - started);
        simulations = verified.simulations;
        outcome = verified.ok
          ? `verified · held ${verified.heldS.toFixed(0)} s · wave ${String(verified.furthestWave)} · outlasted ${verified.rounds.map((r) => r.wavesOutlasted).join('/')}`
          : `${verified.code}`;
      }
      return { ms, simulations, outcome };
    };

    const rows: string[] = [
      '| building | banks / cars | population | legs in the round | rounds | simulations | wall ms, median of 3 | ms per round | spread (min–max ms) | replay outcome |',
      '|---|---|---|---|---|---|---|---|---|---|',
    ];
    const ids = [...resources.buildingsById.keys()].sort();
    for (const buildingId of ids) {
      const building = resources.buildingsById.get(buildingId);
      if (building === undefined) continue;
      const { round, passengers } = roundOn(buildingId);
      const cars = building.banks.reduce((sum, bank) => sum + bank.cars.length, 0);
      const cell = time({ buildingId, rounds: [round] });
      expect(cell.simulations).toBe(1);
      rows.push(
        `| ${buildingId} | ${String(building.banks.length)} / ${String(cars)} | ${String(building.totalPopulation)} | ${String(passengers)} | 1 | ${String(cell.simulations)} | ${median(cell.ms).toFixed(0)} | ${median(cell.ms).toFixed(0)} | ${Math.min(...cell.ms).toFixed(0)}–${Math.max(...cell.ms).toFixed(0)} | ${cell.outcome} |`,
      );
    }

    rows.push('', '| chain on garden-apartments | simulations | wall ms, median of 3 | ms per round | spread (min–max ms) | replay outcome |', '|---|---|---|---|---|---|');
    const { round } = roundOn('garden-apartments');
    for (const length of CHAIN) {
      const cell = time({ buildingId: 'garden-apartments', rounds: Array.from({ length }, () => round) });
      expect(cell.simulations).toBe(length);
      rows.push(
        `| ${String(length)} round${length === 1 ? '' : 's'} | ${String(cell.simulations)} | ${median(cell.ms).toFixed(0)} | ${(median(cell.ms) / length).toFixed(0)} | ${Math.min(...cell.ms).toFixed(0)}–${Math.max(...cell.ms).toFixed(0)} | ${cell.outcome} |`,
      );
    }

    if (OUT !== undefined) {
      writeFileSync(OUT, [`measured ${new Date().toISOString()} · node ${process.version} · ${process.platform}/${process.arch}`, '', ...rows, ''].join('\n'));
    }
  }, 1_800_000);
});
