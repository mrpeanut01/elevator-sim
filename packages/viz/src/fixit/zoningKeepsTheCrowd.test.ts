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
import { ROUTES_BASIS_LINE, classifyOutcome, emptyFixitState, spendOf } from './engine.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import {
  FIXIT_RUN_SWITCHES,
  assertPairMatchesRepairs,
  fixitRunPlanOf,
  measuredOf,
  tripsTheRoutesChangeOf,
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
          const plan = fixitRunPlanOf(entry, state, resources);
          const after = recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES);
          // The zoning moves routes and opens or closes no trip, so the strict check still applies.
          expect(tripsTheRoutesChangeOf(plan)).toBe(0);
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
          expect(() => assertPairMatchesRepairs(entry, state, before.recording, after.recording, plan)).not.toThrow();
        }
      }
      expect(rungs).toBeGreaterThan(1);
      expect(movedRoutes).toBeGreaterThan(0);
    },
    SUITE_TIMEOUT,
  );
});

/**
 * **A zoning step that opens trips re-draws the crowd, and the player is told so in words** — wave
 * AK lane C, the post-AJ panel's seat C D1.
 *
 * Seat C pressed *Where the banks overlap +* on `zoning-starves-the-top` three times on two profiles
 * and got, every time, *"The day could not be run: the fix-it pair on case … claims both runs met the
 * same crowd, and they did not: passenger p18 arriving at 333.3088968988942 s …"*. The cause is the
 * generator rather than the check: Midtown's two banks meet only at the lobby and the car park, so a
 * trip from floor 2 to floor 18 has no chain of banks as built and is not drawn; one floor of
 * overlap opens trips between the low floors and the high ones, the destination tables are shared
 * over more trips, and the repaired run meets a crowd drawn for the building as rezoned. Measured
 * here: passenger p19 on floor 2 goes to 10 as built and to 18 after.
 *
 * Red before the fix: `assertPairMatchesRepairs` took no plan, and on this pair it threw the
 * sentence seat C read. Now the press site's plan says the trips changed, the pair makes no crowd
 * claim, and the basis line says what happened.
 */
describe('a zoning step that opens trips on midtown re-draws the crowd, and says so (seat C D1)', () => {
  it(
    'is not a crash, and the basis names the change in plain words',
    () => {
      const entry = cases.cases.find((candidate) => candidate.id === 'zoning-starves-the-top');
      expect(entry).toBeDefined();
      if (entry === undefined) return;
      const empty = emptyFixitState();
      const before = recordRun(fixitRunPlanOf(entry, empty, resources).asBuilt, FIXIT_RUN_SWITCHES).recording;
      const state = { ...empty, zoneOverlapFloors: 1 };
      const plan = fixitRunPlanOf(entry, state, resources);
      const after = recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES).recording;

      // The trips did change, and the crowd with them: this is the model, not a defect.
      expect(tripsTheRoutesChangeOf(plan)).toBeGreaterThan(0);
      expect(crowdDifferencesOf(before, after).length).toBeGreaterThan(0);
      // Without the plan, the strict check still refuses it: the throw seat C saw.
      expect(() => assertPairMatchesRepairs(entry, state, before, after)).toThrow(/claims both runs met the same crowd/);
      // With it, as both press sites now call it, the pair stands.
      expect(() => assertPairMatchesRepairs(entry, state, before, after, plan)).not.toThrow();

      const measurement = measuredOf(entry, before, after);
      expect(measurement.sameCrowd).toBe(false);
      expect(measurement.crowdRedrawn).toBe(true);
      const outcome = classifyOutcome(entry, measurement, spendOf(entry, state, shippedPriceSchedule()));
      expect(outcome.basis).toBe(ROUTES_BASIS_LINE);
      // Plain words: no passenger id, no arrival time, no case id.
      expect(outcome.basis).not.toMatch(/\bp\d+|\d+\.\d{3,}|zoning-starves/);
    },
    SUITE_TIMEOUT,
  );
});
