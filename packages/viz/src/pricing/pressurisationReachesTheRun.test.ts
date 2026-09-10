/**
 * **The cabin-pressurisation row reaches the run, and buying speed alone does not** —
 * GitHub issue **#444**, and `CLAUDE.md`'s standing requirement pointed at a new equipment tier.
 *
 * > *"Move the control and require the run to change, compared on the legs."*
 *
 * ## Why this file exists beside `tiersReachTheRun.test.ts`
 *
 * That file drives one change at each of the three tiers through a shipped fix-it case, and it
 * would have covered this row too if the row bought anything on a shipped case. It does not, and
 * that is the design rather than a gap: the air-pressure cap only applies above
 * `elevator-specs.json`'s `airPressure.appliesAboveTravelM` of travel, and only to cars rated
 * faster than the cap. Every shipped building as built is symmetric, so a schedule-driven sweep
 * would find this row inert and be right.
 *
 * So the case is authored here, and it is authored as **the decision the issue is about**:
 *
 *  1. `vertical-city`'s shuttle is a real shipped bank with 307.5 m of travel — above the
 *     threshold — carrying eight 10.0 m/s cars, which is exactly the cap.
 *  2. The as-built patch buys +4 m/s through `ratedSpeedDeltaMps`, the same field the fix-it
 *     editor's speed control writes. That is the dominant buy the issue exists to break: the
 *     cars now climb at 14 m/s.
 *  3. The repair buys `cabinPressurised`. Priced by `data/price-schedule.json`'s
 *     `cabin-pressurisation` row at the equipment tier, applied by `fixit/run.ts`, and the only
 *     thing that lets any of that speed be spent going down.
 *
 * ## Compared on the legs, and with both negative controls
 *
 * `legsKey` is `tiersReachTheRun.test.ts`'s own key — who boarded which car and when. A mean can
 * move because a run is noisy; boarding identities move only when the simulation did something
 * different. And two arms are asserted to *not* move: the same purchase on a shaft the cap never
 * reached, and the same shaft with the speed left alone.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { emptyFixitState, toggleRepair } from '../fixit/engine.js';
import { fixitContextOf, parseFixitCases } from '../fixit/parse.js';
import { fixitRunPlanOf, type FixitResources } from '../fixit/run.js';
import type { FixitCase } from '../fixit/types.js';
import { recordRun, type RecordedRun } from '../record/recordRun.js';

import { changesBought, pathsIn } from './repairPrice.js';
import { shippedPriceSchedule } from './schedule.test-helper.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const TIMEOUT_MS = 300_000;

/** The shaft the cap reaches: `vertical-city`'s shuttle spans 307.5 m, above the 300 m threshold. */
const TALL_BUILDING = 'vertical-city';
/** The control: `midtown-office` spans 76.9 m, nowhere near it. */
const SHORT_BUILDING = 'midtown-office';

/** The bank and car each tower's unaffordable new shaft is cloned from. */
const SHAFT_BANK: Readonly<Record<string, string>> = {
  [TALL_BUILDING]: 'shuttle',
  [SHORT_BUILDING]: 'main',
};
const SHAFT_CAR: Readonly<Record<string, string>> = {
  [TALL_BUILDING]: 'S1',
  [SHORT_BUILDING]: 'A',
};

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

let resources: FixitResources;

beforeAll(() => {
  resources = resourcesFromDisk();
});

/** Boarding identity — the legs, never a window statistic. `tiersReachTheRun.test.ts`'s key. */
function legsKey(run: RecordedRun): string {
  return JSON.stringify(
    run.recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

/**
 * One authored case: a tower, a speed already bought, and pressurisation offered as the repair.
 *
 * Built through `parseFixitCases` rather than as a `FixitCase` literal, so it goes through every
 * refusal a shipped case does — including the one that checks the patch's `covers` paths are
 * priced by the schedule, which is what makes the price a fact about `data/` rather than about
 * this file.
 */
function caseWith(options: {
  readonly buildingId: string;
  readonly speedDeltaMps: number;
}): FixitCase {
  const raw = {
    version: 1,
    cases: [
      {
        id: 'pressure-decision',
        name: 'The speed that will not go down',
        buildingId: options.buildingId,
        dispatcherProfileId: 'eta',
        run: { seed: '20260910', durationS: 900, arrivalRatePctPop5min: null },
        asBuilt: {
          note: 'The machines have already been re-geared.',
          patch:
            options.speedDeltaMps === 0
              ? { dispatcher: { idle: { parkingStrategy: 'lobby' } } }
              : {
                  building: {
                    cars: [{ carIds: ['*'], set: { ratedSpeedDeltaMps: options.speedDeltaMps } }],
                  },
                },
        },
        complaint: {
          text: 'Going home takes longer than coming in.',
          complainer: 'tenant, upper floors',
          measure: {
            kind: 'mean-wait',
            label: 'the wait for a car down',
            thresholdS: 60,
            // The lobby, which both towers declare. The measure is not what this file asserts
            // on — the legs are — and the scope only has to be a floor the building has.
            scope: { mode: 'origin', floorIds: ['G'] },
          },
        },
        symptom: 'the evening drags',
        figures: [
          { kind: 'complaint', label: 'The wait for a car down', reading: 'bad' },
          { kind: 'scope-mean-wait', label: 'Mean wait down', reading: 'mid' },
          { kind: 'scope-worst-wait', label: 'Worst wait down', reading: 'mid' },
          { kind: 'rest-away-pct', label: 'The rest away inside a minute', reading: 'healthy' },
        ],
        diagnosis: {
          text: 'The cabins cannot descend as fast as they climb.',
          reasoning: 'Air pressure caps the descent above 300 m of travel.',
        },
        /*
         * A whole case rather than one repair, because `parseFixitCases` enforces § 10.6 rule 3
         * — exactly one repair of each of the four roles — and going through that door rather
         * than around it is the point: the price this file asserts is the schedule's, checked by
         * the same validator every shipped case passes.
         *
         * Pressurisation is the **costly fix** and not the diagnosed one, and that is the
         * schedule deciding rather than this file: rule 2 prices a diagnosed fix at 0–9 u and
         * `cabin-pressurisation` is 11.
         */
        budgetUnits: 16,
        repairs: [
          {
            id: 'r-diagnosed',
            role: 'diagnosed',
            name: 'Spread the fleet',
            effect: 'A setting; the waits above are the target.',
            patch: { dispatcher: { idle: { parkingStrategy: 'stay' } } },
          },
          {
            id: 'r-pressurise',
            role: 'costly-fix',
            name: 'Pressurise the cabins',
            effect: 'Lifts the descent cap; the climb is unchanged.',
            patch: { building: { cars: [{ carIds: ['*'], set: { cabinPressurised: true } }] } },
          },
          {
            id: 'r-cheap',
            role: 'cheap-fix',
            name: 'Trim the dwell',
            effect: 'Moves the mean a little.',
            patch: { building: { cars: [{ carIds: ['*'], set: { dwellHallCallS: 2.5 } }] } },
          },
          {
            id: 'r-shaft',
            role: 'new-shaft',
            name: 'A new shaft · beyond a repair budget',
            effect: 'A capital conversation with the owner.',
            patch: { building: { addCars: [{ bankId: SHAFT_BANK[options.buildingId] ?? 'main', copyCarId: SHAFT_CAR[options.buildingId] ?? 'A', id: 'ZZ' }] } },
          },
        ],
        result: { head: 'The evening runs.', body: 'The cabins hold their pressure.' },
      },
    ],
  };
  const parsed = parseFixitCases(
    raw,
    fixitContextOf({
      schedule: shippedPriceSchedule(),
      buildings: resources.entries.map((entry) => entry.resolved),
      trafficProfiles: resources.trafficProfiles,
      dispatcherProfiles: resources.dispatcherProfiles,
    }),
  );
  const entry = parsed.cases[0];
  if (entry === undefined) throw new Error('the authored case did not parse');
  return entry;
}

/** The two arms: the repair unselected, then selected. */
function arms(entry: FixitCase): { readonly without: RecordedRun; readonly with: RecordedRun } {
  const plan = fixitRunPlanOf(entry, emptyFixitState(), resources);
  const repaired = fixitRunPlanOf(
    entry,
    toggleRepair(entry, emptyFixitState(), 'r-pressurise', shippedPriceSchedule()),
    resources,
  );
  return {
    without: recordRun(plan.asRepaired),
    with: recordRun(repaired.asRepaired),
  };
}

describe('the cabin-pressurisation row is priced by the schedule', () => {
  it('is an equipment-tier row, found by the path the patch produces', () => {
    const patch = { building: { cars: [{ carIds: ['*'], set: { cabinPressurised: true } }] } };
    expect(pathsIn(patch)).toContain('building.cars[].set.cabinPressurised');

    const bought = changesBought(shippedPriceSchedule(), patch);
    expect(bought.map((change) => change.id)).toEqual(['cabin-pressurisation']);
    expect(bought[0]?.tier).toBe('equipment');
    // Priced, and priced at something. A zero would make the decision free, which is the one
    // thing a decision cannot be.
    expect(bought[0]?.priceUnits).toBeGreaterThan(0);
  });
});

describe('it reaches the run where the cap bites (§ D219)', () => {
  it('changes the legs on a 307.5 m shaft whose cars have been sped past the cap', () => {
    const both = arms(caseWith({ buildingId: TALL_BUILDING, speedDeltaMps: 4 }));
    expect(legsKey(both.with)).not.toBe(legsKey(both.without));
  }, TIMEOUT_MS);

  it('changes NOTHING on the same shaft when the speed was never bought', () => {
    /*
     * The first negative control, and the one that separates this from a field that simply
     * perturbs a run. `vertical-city`'s shuttle is 10.0 m/s as built, which is exactly the cap,
     * so there is nothing for pressurisation to lift and the two arms must be identical leg for
     * leg. A cap of `<=` rather than `<` would fail here and pass the case above.
     */
    const both = arms(caseWith({ buildingId: TALL_BUILDING, speedDeltaMps: 0 }));
    expect(legsKey(both.with)).toBe(legsKey(both.without));
  }, TIMEOUT_MS);

  it('changes NOTHING on a 76.9 m shaft however fast the cars are', () => {
    /*
     * The second negative control: the same purchase, the same speed increase, a shaft the cap
     * never reaches. An implementation that applied the limit to every car regardless of travel
     * would pass both cases above and fail this one.
     */
    const both = arms(caseWith({ buildingId: SHORT_BUILDING, speedDeltaMps: 4 }));
    expect(legsKey(both.with)).toBe(legsKey(both.without));
  }, TIMEOUT_MS);
});
