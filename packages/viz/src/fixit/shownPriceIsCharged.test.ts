/**
 * **The price a control shows is the price it charges** — wave AK lane C, the post-AJ panel's seat C
 * D3.
 *
 * Seat C set *finish the direction first* alone on the Mixed-Use controller case, under a group
 * heading that read *"2 u once for the group"*, and the header answered *"0 of 11 u committed ·
 * Everything you changed is a setting, and settings are free"*. The run had changed (15 → 9 waits).
 * The label was right and the charge was wrong: `fixit/editorInputs.ts` groups a dial under its
 * schedule row by `scenario/survivorSpace.ts#dimensionsCoveredBy`, which reads a `covers` entry as
 * the root of everything below it (`dispatcher.weights` covers `dispatcher.weights.loadFactor`),
 * while `pricing/parse.ts#changeCovering` matched a path only when a `covers` entry spelled it
 * exactly. So every dial whose row covers a *section* rather than a leaf was drawn at the row's
 * price and charged nothing.
 *
 * Red before the fix: on the shipped schedule, the `dispatch-rules` row's `weights`, `eligibility`
 * and `constraints` dials charge 0 u under a 2 u heading, on every case that draws them.
 *
 * The check is over **every** control the editor draws with a row price — every dial in every group,
 * the door hold and the rezone row — on every shipped case, each set alone on an otherwise empty
 * order, because a control charged alone is exactly what the heading promises.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PriceSchedule } from '../pricing/types.js';
import { editorInputsOf } from './editorInputs.js';
import { emptyFixitState, spendOf } from './engine.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import { zoneOverlapCeilingOf, fixitRunPlanOf, type FixitResources } from './run.js';
import type { FixitCases, FixitState } from './types.js';
import { EVERY_CAR } from './types.js';

const SUITE_TIMEOUT = 300_000;

let resources: FixitResources;
let cases: FixitCases;
let schedule: PriceSchedule;

beforeAll(async () => {
  resources = await fixitResourcesFromDisk();
  cases = await shippedFixitCases(resources);
  schedule = shippedPriceSchedule();
}, SUITE_TIMEOUT);

describe('every fix-it control charges the price it shows', () => {
  it(
    'a dial set alone charges its group’s price, on every shipped case',
    () => {
      const mismatches: string[] = [];
      let checked = 0;
      for (const entry of cases.cases) {
        const empty = emptyFixitState();
        const inputs = editorInputsOf(entry, empty, resources, schedule);
        for (const group of inputs.dialGroups) {
          for (const dial of group.dials) {
            const option = dial.options[0];
            if (option === undefined) continue;
            const state: FixitState = { ...empty, dispatcherDials: { [dial.id]: option.value } };
            const charged = spendOf(entry, state, schedule).totalUnits;
            checked += 1;
            if (charged !== group.row.units) {
              mismatches.push(`${entry.id} · ${group.row.name} · ${dial.id}: shows ${String(group.row.units)} u, charges ${String(charged)} u`);
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(50);
      expect(mismatches).toEqual([]);
    },
    SUITE_TIMEOUT,
  );

  it(
    'the door hold and a zoning step each charge their row’s price, on every case that draws them',
    () => {
      const mismatches: string[] = [];
      let zoned = 0;
      for (const entry of cases.cases) {
        const empty = emptyFixitState();
        const inputs = editorInputsOf(entry, empty, resources, schedule);
        const hall = inputs.door.hallOptions[0];
        if (hall !== undefined) {
          const state: FixitState = { ...empty, doorDwell: { [EVERY_CAR]: { hallCallS: hall } } };
          const charged = spendOf(entry, state, schedule).totalUnits;
          if (charged !== inputs.door.row.units) {
            mismatches.push(`${entry.id} · door: shows ${String(inputs.door.row.units)} u, charges ${String(charged)} u`);
          }
        }
        const building = fixitRunPlanOf(entry, empty, resources).asBuilt.building;
        if (zoneOverlapCeilingOf(building) > 0) {
          zoned += 1;
          const charged = spendOf(entry, { ...empty, zoneOverlapFloors: 1 }, schedule).totalUnits;
          if (charged !== inputs.rezone.row.units) {
            mismatches.push(`${entry.id} · zoning: shows ${String(inputs.rezone.row.units)} u, charges ${String(charged)} u`);
          }
        }
      }
      expect(zoned).toBeGreaterThan(0);
      expect(mismatches).toEqual([]);
    },
    SUITE_TIMEOUT,
  );
});
