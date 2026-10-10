/**
 * **Every lever an offered case shows runs, and either moves somebody or says it did not** — wave
 * AN, lane AN-5, the post-AM panel's seat C (D1). Recorded under [§ D405](../../../../DECISIONS.md):
 * the check is this directory's own.
 *
 * Seat C pressed every tenancy position on the three cases that author one and met *"The day could
 * not be run"* each time, with the hidden reason *"the repair moved nobody"*. The cause was not in
 * this directory: the panel's bundle carried a `core` compiled three weeks earlier, which ignored
 * `crowdThinning` ([§ D1317](../../../../DECISIONS.md), `vite.config.ts#WORKSPACE_SOURCE`). But
 * nothing here would have said so either. `routeCensus.test-helper.ts` presses the same routes and
 * **swallows** the pair's crowd check (`catch { continue; }`), which is right for a census of clears
 * and wrong for a claim that a lever works, and no other suite presses the editor's levers one at a
 * time on every case.
 *
 * So this presses orders exactly as the press site does (`everyday/fixitScreen.ts#primary`): the
 * plan, both runs, the crowd check **with the plan**, then the gate's classification. A throw
 * anywhere is the fault a player would read as *"The day could not be run"*, and fails here naming
 * the case and the lever. Two halves:
 *
 * - **Always on**, the six tenancy positions: the levers seat C could not run, each required to run
 *   and to move somebody.
 * - **Nightly**, every single-control order `routes.test-helper.ts#routesFor` builds on every case
 *   the list offers. An order whose run is the as-built run leg for leg must be classified *No
 *   change*, whose body says *"Nothing you changed reached the thing the letter is about"*;
 *   anything else would be a verdict about a run that did not happen. Two-control orders and the
 *   diagnosed repair's witness are left out: a lever is one control, and the witness is not a
 *   control since § D1020 retired the menu. An order the case cannot afford, or the loader
 *   refuses, is not pressed, because the families card and the Run press say why before anything
 *   runs (`run.ts#fixitPlanRefusalOf`). About six hundred runs, 672 s of one contended vitest
 *   process on the lane's container, so it rides `deep-tiers.yml`'s `fixit-route-census` job,
 *   whose routes it shares.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { sameLegs } from '../record/crowd.js';
import { recordRun } from '../record/recordRun.js';

import { classifyOutcome, emptyFixitState, setTenancyPosition, spendOf } from './engine.js';
import { isOffered } from './held.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import { routesFor } from './routes.test-helper.js';
import { assertPairMatchesRepairs, FIXIT_RUN_SWITCHES, fixitRunPlanOf, measuredOf, type FixitResources } from './run.js';
import type { FixitCase, FixitCases, FixitState } from './types.js';

/** The head `engine.ts#classifyOutcome` gives a run that moved nothing the letter is about. */
const NO_CHANGE_HEAD = 'No change, and the complaint still stands.';

/** The nightly gate, shared with the route census. */
const DEEP = process.env['ELEVATOR_SIM_FIXIT_ROUTES'] === 'deep';

let resources: FixitResources;
let cases: FixitCases;

beforeAll(async () => {
  resources = await fixitResourcesFromDisk();
  cases = await shippedFixitCases(resources);
}, 300_000);

interface Pressed {
  readonly moved: boolean;
  readonly head: string;
}

/** One order, pressed as `everyday/fixitScreen.ts#primary` presses it. Throws what the press site would. */
function press(entry: FixitCase, state: FixitState, before: VizRecording): Pressed {
  const plan = fixitRunPlanOf(entry, state, resources);
  const after = recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES).recording;
  assertPairMatchesRepairs(entry, state, before, after, plan);
  const outcome = classifyOutcome(entry, measuredOf(entry, before, after), spendOf(entry, state, shippedPriceSchedule()));
  return { moved: !sameLegs(before, after), head: outcome.head };
}

function offered(): readonly FixitCase[] {
  return cases.cases.filter((candidate) => isOffered(candidate.id));
}

describe('the tenancy levers run and move somebody — the post-AM panel’s seat C D1', () => {
  it('presses all six authored positions on the three cases that author one', () => {
    const schedule = shippedPriceSchedule();
    const seen: string[] = [];
    for (const entry of offered()) {
      const cohorts = entry.asBuilt.tenancy?.cohorts ?? [];
      if (cohorts.length === 0) continue;
      const before = recordRun(fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt, FIXIT_RUN_SWITCHES).recording;
      for (const cohort of cohorts) {
        for (const position of cohort.positions) {
          const state = setTenancyPosition(entry, emptyFixitState(), cohort.id, position.id, schedule);
          expect(state.tenancyPositions[cohort.id], `${entry.id}/${position.id} was refused`).toBe(position.id);
          expect(press(entry, state, before).moved, `${entry.id}/${position.id} moved nobody`).toBe(true);
          seen.push(`${entry.id}/${position.id}`);
        }
      }
    }
    expect(seen.sort()).toEqual([
      'every-letter-says-nine/four-hundred-say-half-past',
      'every-letter-says-nine/half-say-half-past',
      'let-faster-than-the-lifts/invoke-for-all',
      'let-faster-than-the-lifts/invoke-for-half',
      'one-start-time/three-start-times',
      'one-start-time/two-start-times',
    ]);
  }, 300_000);
});

describe.skipIf(!DEEP)('every lever on every offered fix-it case — the post-AM panel’s seat C D1', () => {
  it('runs each one-control order, and an order that moved nobody is told so', () => {
    const faults: string[] = [];
    const unsaid: string[] = [];
    let pressedCount = 0;
    let moved = 0;
    for (const entry of offered()) {
      const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
      const before = recordRun(asBuilt, FIXIT_RUN_SWITCHES).recording;
      for (const route of routesFor(entry, asBuilt, resources)) {
        if (route.label.includes('+') || route.label.startsWith('answer:')) continue;
        pressedCount += 1;
        const where = `${entry.id} / ${route.label}`;
        try {
          const pressed = press(entry, route.state, before);
          if (pressed.moved) moved += 1;
          else if (pressed.head !== NO_CHANGE_HEAD) unsaid.push(`${where}: "${pressed.head}" over an unmoved run`);
        } catch (error) {
          faults.push(`${where}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    expect(faults, `levers that fault:\n${faults.join('\n')}`).toEqual([]);
    expect(unsaid, `levers that moved nobody and were not told so:\n${unsaid.join('\n')}`).toEqual([]);
    expect(moved).toBeGreaterThan(0);
    expect(pressedCount).toBeGreaterThan(offered().length);
  }, 1_800_000);
});
