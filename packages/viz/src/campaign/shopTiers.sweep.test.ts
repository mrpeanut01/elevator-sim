/**
 * **Which career days each shop tier clears on its own** — GitHub issue #603, `DECISIONS.md` § D1078.
 *
 * ## Why it exists
 *
 * The post-AG tenant-floors swarm found fix-it's free per-floor crowd control clearing 14 of 15 cases
 * whose fault lay elsewhere, and moved the finding across to the career shop by analogy:
 * `tenants` L2, *staggered start times*, cuts the crowd by a third, and as a 30 % or 38 % cut on the
 * fix cases it cleared 9 and 11 of the 15. Nothing had measured it in the career. This does, through
 * the career's own judge, on the day the career runs, with the crowd change applied as a thinning of
 * that day's crowd (`campaign/fitOut.ts#fittedCrowdThinning`) rather than as a re-drawn one — which
 * is issue #603's own condition, so the measurement is not a re-roll.
 *
 * ## What it measures, and on which path
 *
 * Per contract, over `n` base seeds of `docs/33` § 4.6's sequence, on **day 1** of a tower freshly
 * taken on that contract:
 *
 * - **as built** — nothing bought;
 * - **each shop tier alone** — every `(category, level)` of `economy.ts#SHOP`, fitted from an earlier
 *   month so its nights are behind it, and nothing else.
 *
 * The day's seed is `campaign/incidents.ts#careerDaySeedFor(base, contract, 1)`, the career's own
 * derivation. The event is held at `ordinary`, so a breakdown or a booked crowd on some seeds does
 * not stand between a tier and the day; that is a narrowing of the career's day, stated here rather
 * than discovered. The verdict is `everyday/campaignModel.ts#campaignDayVerdict` over
 * `campaignTestRows` at the standard difficulty and the `whole-run` fold, which is exactly what
 * `everyday/host.ts#closeDay` files. Everything is built through `dev/state.ts#shiftRunConfigOf`.
 *
 * ## Why it is a sweep and not a test
 *
 * Sixteen contracts by seventeen arms by `n` seeds is thousands of whole career days, several of
 * them supertall towers. It is gated on `CAREER_SHOP_SWEEP` and registered in `deepTiers.test.ts`,
 * so it costs the default suite nothing; `fitOut.test.ts` pins the tier's thinning on the legs on
 * every run. The table it writes is the one § D1078 publishes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding } from '@elevator-sim/core';

import type { BrowserResources } from '../dev/data.js';
import { shiftLengthForContract, shiftRunConfigOf } from '../dev/state.js';
import { campaignDayVerdict, campaignTestRows } from '../everyday/campaignModel.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { CONTRACTS } from '../shift/contracts.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { openCareer } from '../shift/week.js';

import { freshTower } from './career.js';
import { DIFFICULTIES, SHOP, offerFeeOf, type ShopCategoryId } from './economy.js';
import { fitOutOf } from './fitOut.js';
import { careerDaySeedFor } from './incidents.js';

const SEEDS = Number(process.env['CAREER_SHOP_SEEDS'] ?? '10');
const FROM_N = Number(process.env['CAREER_SHOP_FROM'] ?? '0');
const baseSeedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);

function allBuildings(): BrowserResources {
  const ids = [...new Set(CONTRACTS.map((contract) => contract.buildingId))];
  const entries = ids.map((id) => {
    const config = parseBuilding(JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

/** Every arm: nothing bought, then each tier of the shop on its own. */
const ARMS: readonly { readonly id: string; readonly fitted: Partial<Record<ShopCategoryId, number>> }[] = [
  { id: 'as-built', fitted: {} },
  ...SHOP.flatMap((category) =>
    category.tiers.map((tier) => ({ id: `${category.id}.${String(tier.level)}`, fitted: { [category.id]: tier.level } })),
  ),
];

describe.runIf(process.env['CAREER_SHOP_SWEEP'] === '1')('the career shop sweep', () => {
  it('writes each contract’s day 1 as built and under each shop tier alone', () => {
    const out = process.env['CAREER_SHOP_OUT'];
    expect(out, 'CAREER_SHOP_OUT names the file the table is written to').toBeTypeOf('string');
    const resources = allBuildings();
    const only = process.env['CAREER_SHOP_ONLY'];
    const wanted = only === undefined ? CONTRACTS : CONTRACTS.filter((c) => only.split(',').includes(c.id));
    const onlyArms = process.env['CAREER_SHOP_ARMS'];
    const arms = onlyArms === undefined ? ARMS : ARMS.filter((arm) => onlyArms.split(',').includes(arm.id));
    const lines: string[] = ['contract\tn\tseed\tarm\tverdict\tfailing'];
    for (const contract of wanted) {
      for (let n = FROM_N; n < FROM_N + SEEDS; n += 1) {
        const seed = careerDaySeedFor(baseSeedAt(n), contract.id, 1);
        for (const arm of arms) {
          const tower = {
            ...freshTower({
              contractId: contract.id,
              buildingId: contract.buildingId,
              dispatcherId: 'collective',
              rate: offerFeeOf(contract.buildingId) ?? 3,
            }),
            fitted: arm.fitted,
          };
          const base = baseState();
          const state = {
            ...base,
            buildingId: contract.buildingId,
            dispatcherId: 'collective',
            seed,
            week: { ...openCareer(), day: 1, dayIdx: 0 },
            outOfServiceCarIds: [],
            campaignFitOut: fitOutOf(tower),
            shiftLengthS: shiftLengthForContract(contract.id),
            windowStartS: null,
            campaignEventId: 'ordinary',
          };
          const plan = shiftRunConfigOf(resources, state);
          const { recording } = recordRun(plan.config, {
            recordDecisions: false,
            outOfServiceCarIds: plan.outOfServiceCarIds,
          });
          const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
          const rows = campaignTestRows(DIFFICULTIES.standard, tower, observations, [], 'whole-run');
          const failing = rows.filter((row) => row.reading !== undefined && row.reading.state !== 'met').map((row) => row.id);
          lines.push([contract.id, String(n), String(seed), arm.id, campaignDayVerdict(rows), failing.join('+')].join('\t'));
        }
        writeFileSync(String(out), `${lines.join('\n')}\n`);
      }
    }
  }, 14_400_000);
});
