/**
 * **A chime spend makes a configuration reachable that was not, and the run changes on the legs** —
 * GitHub issue **#368**, [§ D526](../../../../DECISIONS.md) clause 3, and `CLAUDE.md`'s standing
 * requirement pointed at a currency.
 *
 * > *"Move the control and require the run to change, compared on the legs. A spend that widens a
 * > budget makes a configuration reachable that was not, and the run changes on the legs; the same
 * > spend not made leaves it unreachable."*
 *
 * `tiersReachTheRun.test.ts` is the sibling of this file and its shape is kept exactly: the same
 * shipped fix cases, the same `legsKey` — who boarded which car and when — and the same both-arms
 * structure, because a currency that priced everything and gated nothing would pass the first arm
 * and fail the second, and that is the inert-control class this repository has shipped eleven times
 * in code.
 *
 * ## Compared on the legs, never on a window statistic
 *
 * A mean wait can move because a run is noisy; the boarding identities move only when the
 * simulation actually did something different. That is the difference between this test and one
 * that would pass on a spend that bought nothing.
 *
 * ## What this test does not claim, said plainly
 *
 * The **screen** that lets a player spend chimes on a scenario's budget is not built — Scenario's
 * budget surface is separate work and `docs/38` § 3 lists it. What is built and what this drives is
 * the seam: `chimeGrantUnits` turns a paid-for number of steps into units of budget, and the
 * editor's own affordability rule is what decides whether a repair can be selected. So this proves
 * the grant reaches the run through the shipped editor rather than through a fixture, and it does
 * **not** prove a player can press anything yet. Saying which of those two is true is the whole
 * value of the sentence — a test that implied the second would be the stale-refusal defect
 * [§ D227](../../../../DECISIONS.md) records, with its polarity reversed.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  chimeGrantUnits,
  chimeSinkById,
  chimeSpendPrice,
  parseBuilding,
  parseChimeLedger,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type ChimeLedgerTable,
  type ChimeSink,
} from '@elevator-sim/core/browser';

import { emptyFixitState, toggleRepair } from '../fixit/engine.js';
import { fixitContextOf, parseFixitCases } from '../fixit/parse.js';
import { fixitRunPlanOf, type FixitResources } from '../fixit/run.js';
import type { FixitCase, FixitRepair } from '../fixit/types.js';
import { recordRun, type RecordedRun } from '../record/recordRun.js';
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

/** Boarding identity — the legs, never a window statistic. `tiersReachTheRun.test.ts`'s own key. */
function legsKey(run: RecordedRun): string {
  return JSON.stringify(
    run.recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

let resources: FixitResources;
let cases: readonly FixitCase[];
let ledger: ChimeLedgerTable;
let sink: ChimeSink;

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
  ledger = parseChimeLedger(dataFile('chime-ledger.json'));
  const found = chimeSinkById(ledger, 'scenario-budget-step');
  if (found === undefined) throw new Error('the shipped ledger sells no scenario budget step');
  sink = found;
}, TIMEOUT_MS);

/**
 * The first shipped case holding a repair the budget cannot afford **and** a spend can.
 *
 * Both halves matter. A repair the budget already affords proves nothing, and a repair no number of
 * steps could reach would make the second arm unreachable rather than refused — so the search is
 * for the case that sits between them, and it fails loudly rather than quietly testing something
 * else if the shipped content ever stops containing one.
 */
function caseNeedingSteps(): {
  readonly entry: FixitCase;
  readonly repair: FixitRepair;
  readonly steps: number;
} {
  for (const entry of cases) {
    for (const repair of entry.repairs) {
      if (repair.costUnits <= entry.budgetUnits) continue;
      const shortfall = repair.costUnits - entry.budgetUnits;
      const steps = Math.ceil(shortfall / sink.modifier.grantUnits);
      if (steps < 1 || steps > sink.maxSteps) continue;
      return { entry, repair, steps };
    }
  }
  throw new Error(
    'no shipped fix case holds a repair that is unaffordable as authored and affordable within ' +
      `${String(sink.maxSteps)} steps of the budget sink`,
  );
}

/** The widened case, which is the whole of what a spend does to a scenario. */
function widenedBy(entry: FixitCase, steps: number): FixitCase {
  return { ...entry, budgetUnits: entry.budgetUnits + chimeGrantUnits(sink, steps) };
}

describe('a chime spend widens a budget and the widening reaches the run — issue #368', () => {
  it('finds a shipped case the spend can move, which is what makes the arms below real', () => {
    const { entry, repair, steps } = caseNeedingSteps();
    expect(repair.costUnits, `${entry.id}/${repair.id}`).toBeGreaterThan(entry.budgetUnits);
    expect(widenedBy(entry, steps).budgetUnits).toBeGreaterThanOrEqual(repair.costUnits);
    /* And the spend is a real one at a real price, rather than a free widening. */
    expect(chimeSpendPrice(sink, steps) ?? 0).toBeGreaterThan(0);
  });

  it(
    'leaves the run alone when the spend was not made',
    () => {
      /*
       * **The arm that makes the other one mean something.** Unbought, the editor refuses the press
       * and the run it produces is the as-built one to the leg. A ledger that granted the budget
       * without a spend would pass the next case and fail this one.
       */
      const { entry, repair } = caseNeedingSteps();
      const after = toggleRepair(entry, emptyFixitState(), repair.id, shippedPriceSchedule());
      expect(after.selectedRepairIds, 'the unaffordable repair was selectable unbought').toEqual([]);

      const plan = fixitRunPlanOf(entry, after, resources);
      expect(legsKey(recordRun(plan.asRepaired, { recordDecisions: false }))).toBe(
        legsKey(recordRun(plan.asBuilt, { recordDecisions: false })),
      );
    },
    TIMEOUT_MS,
  );

  it(
    'makes the configuration reachable and moves the legs once the spend is made',
    () => {
      const { entry, repair, steps } = caseNeedingSteps();
      const widened = widenedBy(entry, steps);
      const bought = toggleRepair(widened, emptyFixitState(), repair.id, shippedPriceSchedule());

      /* Non-vacuity: the press was accepted, or the comparison below is two identical configs. */
      expect(bought.selectedRepairIds, 'the widened budget still refused the press').toContain(
        repair.id,
      );

      const plan = fixitRunPlanOf(widened, bought, resources);
      const asBuilt = recordRun(plan.asBuilt, { recordDecisions: false });
      const asRepaired = recordRun(plan.asRepaired, { recordDecisions: false });
      expect(
        legsKey(asRepaired),
        `${repair.id} became affordable and changed nothing about the run`,
      ).not.toBe(legsKey(asBuilt));
    },
    TIMEOUT_MS,
  );

  it(
    'buys nothing with a spend of zero steps, which is the arithmetic control',
    () => {
      /*
       * A grant that quietly treated *no steps* as *one step* would make the first arm pass by
       * accident. `chimeGrantUnits` refuses outside the range rather than clamping, so a budget
       * widened by nothing is the budget the scenario authored, and the press is still refused.
       */
      const { entry, repair } = caseNeedingSteps();
      expect(chimeGrantUnits(sink, 0)).toBe(0);
      const unmoved = widenedBy(entry, 0);
      expect(unmoved.budgetUnits).toBe(entry.budgetUnits);
      expect(
        toggleRepair(unmoved, emptyFixitState(), repair.id, shippedPriceSchedule()).selectedRepairIds,
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
