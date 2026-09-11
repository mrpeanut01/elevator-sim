/**
 * **The published house rows reproduce from the runs that produced them** — GitHub issue #418's
 * pin, and `CLAUDE.md`'s oldest rule about a published number: *"pin it to the run that produced
 * it."*
 *
 * `rushHouse.test.ts` is the always-on half. It checks the table against the stream this build
 * generates and the shipped data's buildings and dispatchers, and it replays the one cell that costs
 * a few hundred milliseconds. This file is the other half: it **re-runs every cell** — each shipped
 * dispatcher on each shipped building, through `rushHouse.test-helper.ts#measureRushHouseRun` — and
 * compares every figure with `data/rush-house-runs.json`.
 *
 * ## Why this is gated, on a gate of its own, and what it really costs
 *
 * The owner's ruling expected *"the multi-minute cost"*, and it was measured rather than taken on
 * trust. On 2026-09-11, on a ten-core developer machine shared with other suites: **117 runs in
 * 137.5 s**. That is 9 buildings × 13 dispatchers, one Endless rush each at 5 400 simulated seconds
 * plus the drain. Per building it ranges from **5.6 s** (`garden-apartments`) to **25.4 s**
 * (`burj-class-reference`). The slowest single run is **7.2 s** (`midtown-office` ×
 * `destination-panel`). So the cost is a little over two minutes, not hours. That is too much for
 * the default suite, which pays for none of it, and nowhere near the survivor sweep's 932 s.
 *
 * `ELEVATOR_SIM_RUSH_HOUSE` rather than `ELEVATOR_SIM_DEEP`, on `.github/workflows/deep-tiers.yml`'s
 * argument for one job per tier. A re-run after a fix does not pay for the tiers beside it, and a red
 * here does not hide a red there. `deepTiers.test.ts` derives the gated set from disk and asserts the
 * workflow names this file with the variable set, so the tier cannot arrive unwired.
 *
 * **One case per building, not one case for the sweep.** Each is well inside the `viz` project's
 * 300 s ceiling, even at three times the measured cost on a hosted four-core runner. So this file
 * carries no timeout annotation, and `testCost.test.ts`'s above-ceiling ratchet does not move.
 *
 * ## Regenerating
 *
 * ```
 * ELEVATOR_SIM_RUSH_HOUSE=deep ELEVATOR_SIM_REGENERATE_RUSH_HOUSE=1 \
 *   npx vitest run --project viz src/everyday/rushHouseSweep.test.ts
 * ```
 *
 * It **writes** the file and skips the comparison, following `survivorSweep.test.ts`'s precedent,
 * so a regeneration cannot be mistaken for a passing guard. A re-run that disagrees with the file is
 * a question rather than an answer. Something moved: a dispatcher profile, a building, the rush
 * template, `core`'s simulation or `rushHoldAt`. The thing to do is find out which.
 *
 * This file imports only **types** from `rushHouse.ts`, because that module reads the table at load
 * and a regeneration has to be able to start from a tree where the table is missing or malformed.
 */

import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { BUILDING_IDS } from '../fixtures.test-helper.js';

import type { RushHouseRun, RushHouseTable } from './rushHouse.js';
import {
  RUSH_HOUSE_PATH,
  loadRushHouseResources,
  measureRushHouseRun,
  writeRushHouseTable,
} from './rushHouse.test-helper.js';

const OPEN = process.env['ELEVATOR_SIM_RUSH_HOUSE'] === 'deep';
const REGENERATE = process.env['ELEVATOR_SIM_REGENERATE_RUSH_HOUSE'] === '1';

/** A cell as the string a failure prints: which cell first, then every figure it pins. */
function cellsOf(runs: readonly RushHouseRun[]): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const run of runs) {
    out[`${run.buildingId}#${run.dispatcherId}`] =
      `broke ${String(run.brokeAtS)} arrived ${String(run.arrived)} carried ${String(run.carried)} ` +
      `legs ${String(run.legs)} awtIsValid ${String(run.awtIsValid)} saturation ${String(run.saturationVerdict)}`;
  }
  return out;
}

describe.skipIf(!OPEN)('the published house rows reproduce — GitHub issue #418', () => {
  let resources: BrowserResources;
  const measured = new Map<string, readonly RushHouseRun[]>();
  const started = Date.now();

  beforeAll(async () => {
    resources = await loadRushHouseResources();
  });

  afterAll(async () => {
    const runs = BUILDING_IDS.flatMap((id) => measured.get(id) ?? []);
    process.stderr.write(`rush house sweep: ${String(runs.length)} runs in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
    if (REGENERATE && measured.size === BUILDING_IDS.length) await writeRushHouseTable(runs);
  });

  it.each([...BUILDING_IDS])('%s — every shipped dispatcher', (buildingId) => {
    const t0 = Date.now();
    const runs = resources.dispatcherProfiles.profiles.map((profile) => measureRushHouseRun(resources, buildingId, profile.id));
    measured.set(buildingId, runs);
    process.stderr.write(`${buildingId}: ${String(runs.length)} runs, ${String(Date.now() - t0)} ms\n`);

    /* Non-vacuity: every shipped dispatcher ran. */
    expect(runs.length).toBeGreaterThan(0);
    if (REGENERATE) return;

    const onDisk = JSON.parse(readFileSync(RUSH_HOUSE_PATH, 'utf8')) as RushHouseTable;
    expect(
      cellsOf(runs),
      'a published house row no longer reproduces from the run that produced it. Something moved — ' +
        'a dispatcher profile, a building, the endless-rush template, core’s simulation or the hold ' +
        'line. That is a finding to report, not a number to edit.',
    ).toEqual(cellsOf(onDisk.runs.filter((run) => run.buildingId === buildingId)));
  });
});
