/**
 * **Every priced tier reaches the run, and an unaffordable one does not** — GitHub issue **#366**'s
 * third criterion, and `CLAUDE.md`'s standing requirement pointed at a price ladder.
 *
 * > *"Move the control and require the run to change, compared on the legs. A change bought at each
 * > of the three tiers reaches the run and changes the legs; a change the budget cannot afford does
 * > not. Both arms, because a schedule that prices everything and gates nothing is the inert-control
 * > class this repository has shipped eleven times in code."*
 *
 * ## Compared on the legs, never on a window statistic
 *
 * `legsKey` is `fixit/run.test.ts`'s and `fixit/cases.test.ts`'s own key — who boarded which car and
 * when. A mean wait can move because a run is noisy; the boarding identities move only when the
 * simulation actually did something different. That is the difference between this test and one
 * that would pass on a control that changed nothing.
 *
 * ## The three tiers are driven through the shipped content, not through fixtures
 *
 * A fixture repair at each tier would be this file asserting against its own invention. Instead each
 * tier is found in `data/fixit-cases.json` — every shipped repair is priced by the schedule now, so
 * a repair's tier is a fact about the schedule rather than about this test — and the first case
 * offering one is used. If a tier ever stops appearing in the shipped cases this goes red rather
 * than silently testing two tiers, which is what the coverage assertion at the top is for.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';

import { emptyFixitState, toggleRepair } from '../fixit/engine.js';
import { fixitContextOf, parseFixitCases } from '../fixit/parse.js';
import { fixitRunPlanOf, type FixitResources } from '../fixit/run.js';
import type { FixitCase, FixitRepair } from '../fixit/types.js';
import { recordRun, type RecordedRun } from '../record/recordRun.js';
import { changesBought } from './repairPrice.js';
import { shippedPriceSchedule } from './schedule.test-helper.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const TIMEOUT_MS = 300_000;

const dataFile = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as unknown;

function resourcesFromDisk(): FixitResources {
  const elevatorSpecs = parseElevatorSpecs(dataFile('elevator-specs.json'));
  const trafficProfiles = parseTrafficProfiles(dataFile('traffic-profiles.json'));
  const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));
  const entries = readdirSync(join(DATA_DIR, 'buildings'))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const config = parseBuilding(dataFile(join('buildings', name)), name);
      return {
        config,
        resolved: resolveBuilding(config, elevatorSpecs, { file: name, trafficProfileIds }),
      };
    });
  return {
    entries,
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(dataFile('dispatcher-profiles.json')),
    trafficProfileIds,
  };
}

/** Boarding identity — the legs, never a window statistic. */
function legsKey(run: RecordedRun): string {
  return JSON.stringify(
    run.recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

let resources: FixitResources;
let cases: readonly FixitCase[];

beforeAll(() => {
  resources = resourcesFromDisk();
  cases = parseFixitCases(
    dataFile('fixit-cases.json'),
    fixitContextOf({
      schedule: shippedPriceSchedule(),
      buildings: resources.entries.map((entry) => entry.resolved),
      trafficProfiles: resources.trafficProfiles,
      dispatcherProfiles: resources.dispatcherProfiles,
    }),
  ).cases;
}, TIMEOUT_MS);

/** The first shipped case offering an affordable repair in `tier`, and that repair. */
function caseAtTier(tier: string): { readonly entry: FixitCase; readonly repair: FixitRepair } {
  const schedule = shippedPriceSchedule();
  for (const entry of cases) {
    for (const repair of entry.repairs) {
      const bought = changesBought(schedule, repair.patch);
      if (bought.length === 0) continue;
      if (!bought.every((change) => change.tier === tier)) continue;
      if (repair.costUnits > entry.budgetUnits) continue;
      return { entry, repair };
    }
  }
  throw new Error(`no shipped fix case offers an affordable ${tier}-tier repair`);
}

describe('a change bought at any tier reaches the run — issue #366', () => {
  /**
   * The coverage control. Without it, a tier that stopped appearing in the shipped cases would make
   * the three cases below silently test the same two tiers twice.
   */
  it('finds an affordable repair at each of the three tiers in the shipped cases', () => {
    for (const tier of ['dispatcher', 'equipment', 'building']) {
      const found = caseAtTier(tier);
      expect(found.repair.costUnits, `${tier}: ${found.repair.id}`).toBeLessThanOrEqual(
        found.entry.budgetUnits,
      );
    }
  });

  for (const tier of ['dispatcher', 'equipment', 'building'] as const) {
    it(
      `moves the legs when a ${tier}-tier change is bought`,
      () => {
        const { entry, repair } = caseAtTier(tier);
        const bought = toggleRepair(entry, emptyFixitState(), repair.id, shippedPriceSchedule());

        /* Non-vacuity: the press was accepted, or the comparison below is two identical configs. */
        expect(bought.selectedRepairIds, `${tier}: the press was refused`).toContain(repair.id);

        const plan = fixitRunPlanOf(entry, bought, resources);
        const asBuilt = recordRun(plan.asBuilt, { recordDecisions: false });
        const asRepaired = recordRun(plan.asRepaired, { recordDecisions: false });

        expect(legsKey(asRepaired), `${tier} (${repair.id}) changed nothing about the run`).not.toBe(
          legsKey(asBuilt),
        );
      },
      TIMEOUT_MS,
    );
  }

  /**
   * **The other arm, and it is the half that makes the first mean something.**
   *
   * The new shaft is 34 units against a 10–16 unit budget in every shipped case, so the reducer must
   * refuse it — and the run it would have produced must be the as-built one. A schedule that priced
   * everything and gated nothing would pass every test above and fail this one.
   */
  it(
    'leaves the run alone when the budget cannot afford the change',
    () => {
      const entry = cases.find((one) => one.repairs.some((r) => r.role === 'new-shaft'));
      expect(entry).toBeDefined();
      const shaft = entry!.repairs.find((repair) => repair.role === 'new-shaft')!;
      expect(shaft.costUnits).toBeGreaterThan(entry!.budgetUnits);

      const after = toggleRepair(entry!, emptyFixitState(), shaft.id, shippedPriceSchedule());
      expect(after.selectedRepairIds).toEqual([]);

      const plan = fixitRunPlanOf(entry!, after, resources);
      expect(legsKey(recordRun(plan.asRepaired, { recordDecisions: false }))).toBe(
        legsKey(recordRun(plan.asBuilt, { recordDecisions: false })),
      );
    },
    TIMEOUT_MS,
  );
});
