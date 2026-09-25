/**
 * **A zoning edit on Vertical City moves routes, not people** — GitHub issue #605, `DECISIONS.md`
 * § D1075.
 *
 * Found by lane AI-C: on `every-deck-calls-itself-full`, one floor of zone overlap tripped
 * `run.ts#assertPairMatchesRepairs`, and before wave AI's judge caught the throw the press sat on
 * *Running the day…* for good. The issue asked whether the passenger trace depended on the building's
 * shape, which would have broken common random numbers. It did not, and this file holds both halves:
 *
 * 1. **The generator's crowd is identical** under every zone rung either Vertical City case offers —
 *    every passenger's id, arrival, origin, destination and mass. That is the CRN property, and it
 *    held on the tree the issue was filed against.
 * 2. **The pair's crowd check agrees**, which it did not: `record/crowd.ts` keyed a rider on their
 *    first *lift* leg, and a rider for the upper deck rides the escalator from `G` to `2` before it.
 *    Overlap lets a local serve `G`, the escalator hop disappears, and the first lift leg starts at
 *    `G` 21.2 s earlier. The recording now carries the journey's
 *    own arrival and origin (version 16), and the check reads those.
 *
 * Red before the fix: with `record/crowd.ts` as it stood, the second assertion fails at `zone:1` on
 * the first Vertical City case the loop reaches, while the first holds. Measured separately on
 * `every-deck-calls-itself-full` at `zone:1`: 649 of 649 generated passengers identical, 97 of them
 * riding the escalator as built and none after, and 89 first lift legs read as different people. Only `vertical-city` declares a transport mode among
 * the buildings fix-it cases are set in, so these two cases are the whole of the exposure.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { crowdDifferencesOf } from '../record/crowd.js';
import { emptyFixitState } from './engine.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import {
  FIXIT_RUN_SWITCHES,
  assertPairMatchesRepairs,
  fixitRunPlanOf,
  zoneOverlapCeilingOf,
  type FixitResources,
} from './run.js';
import type { FixitCases } from './types.js';

const SUITE_TIMEOUT = 300_000;

let resources: FixitResources;
let cases: FixitCases;

beforeAll(async () => {
  resources = await fixitResourcesFromDisk();
  cases = await shippedFixitCases(resources);
}, SUITE_TIMEOUT);

describe('a zoning edit on vertical-city keeps the crowd (#605)', () => {
  it(
    'meets the same generated people, and the pair check says so, at every zone rung',
    () => {
      const onTheTower = cases.cases.filter((entry) => entry.buildingId === 'vertical-city');
      expect(onTheTower.map((entry) => entry.id).sort()).toContain('every-deck-calls-itself-full');
      let rungs = 0;
      let movedRoutes = 0;
      for (const entry of onTheTower) {
        const asBuiltPlan = fixitRunPlanOf(entry, emptyFixitState(), resources);
        const before = recordRun(asBuiltPlan.asBuilt, FIXIT_RUN_SWITCHES);
        const person = (p: (typeof before.result.trace.passengers)[number]): string =>
          `${p.id} ${String(p.arrivalTimeS)} ${p.originFloorId} ${p.finalDestinationFloorId} ${String(p.massKg)}`;
        const people = before.result.trace.passengers.map(person);
        for (let floors = 1; floors <= zoneOverlapCeilingOf(asBuiltPlan.asBuilt.building); floors += 1) {
          const state = { ...emptyFixitState(), zoneOverlapFloors: floors };
          const after = recordRun(fixitRunPlanOf(entry, state, resources).asRepaired, FIXIT_RUN_SWITCHES);
          rungs += 1;
          // 1. The generator: the same people, whatever the zones.
          expect(after.result.trace.passengers.map(person)).toEqual(people);
          // The routes did move, so the check below is one the tree could have failed.
          const firstLegAt = new Map(
            before.recording.legs.filter((leg) => (leg.legIndex ?? 0) === 0).map((leg) => [leg.passengerId, leg.originFloorId]),
          );
          movedRoutes += after.recording.legs.filter(
            (leg) => (leg.legIndex ?? 0) === 0 && firstLegAt.get(leg.passengerId) !== leg.originFloorId,
          ).length;
          // 2. The pair's own check, as both press sites run it.
          expect(crowdDifferencesOf(before.recording, after.recording)).toEqual([]);
          expect(() => assertPairMatchesRepairs(entry, state, before.recording, after.recording)).not.toThrow();
        }
      }
      expect(rungs).toBeGreaterThan(1);
      expect(movedRoutes).toBeGreaterThan(0);
    },
    SUITE_TIMEOUT,
  );
});
