/**
 * **A chime spent on a scenario's budget reaches the run** — GitHub issue **#579**,
 * [§ D911](../../../../DECISIONS.md), and `CLAUDE.md`'s standing requirement pointed at the first
 * sink a player can buy without a server.
 *
 * > *"Move the control and require the run to change, compared on the legs rather than on a window
 * > statistic."*
 *
 * ## Why this file exists beside `scenario/budgetReachesTheRun.test.ts`
 *
 * That one proves the claim for the **campaign stages'** ladder, through the dispatcher space and
 * `admitPurchase`. This one proves it for the **fix cases'** ladder, through
 * `fixit/engine.ts#affordabilityOf` — a different gate, a different price list and a different
 * screen. They are not duplicates: `docs/38` § 2.1 makes the ten stages and the eighteen fix cases
 * two **sources** of one scenario schema, and until a spend surface shipped only one of the two
 * was ever reached by a purchase. The one a player can actually buy today is this one.
 *
 * ## Three arms, and the third is what makes the second mean anything
 *
 * 1. A repair set the base budget **can** pay for is applied and moves the legs off the as-built run.
 * 2. **The same set plus one more repair**, which the base cannot pay for, is refused: `toggleRepair`
 *    returns the state unchanged, so the run is arm 1's run to the boarding.
 * 3. **That same dearer set at the bought rung** is admitted, and the legs move off arm 1's.
 *
 * Without arm 3, arm 2 would pass on a repair that was simply inert — the eleven-dead-seams class,
 * arrived at from the money side. With it, arm 2 is a statement about the **budget**.
 *
 * ## The subject is searched for, never named
 *
 * `pricing/tiersReachTheRun.test.ts#caseAtTier`'s move, and `scenario/budgetReachesTheRun.test.ts`'
 * own: the shipped file is scanned for a case that can carry the claim, and the file goes **red**
 * rather than quiet when none can. A named case would turn a rebalance of `data/fixit-cases.json`
 * into a silently vacuous test.
 *
 * ## Compared on the legs, never on a window statistic
 *
 * Who boarded which car and when — `campaign/stageOneParking.test.ts`'s key and `docs/12` § 5
 * clause 9's. A mean wait moves because a run is noisy; the boarding identities move only when the
 * simulation did something different.
 */

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';

import { caseAtRung } from './budgetRungs.js';
import { affordabilityOf, emptyFixitState, spendOf, toggleRepair } from './engine.js';
import { FIXIT_RUN_SWITCHES, fixitRunPlanOf, type FixitResources } from './run.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import type { PriceSchedule } from '../pricing/types.js';
import type { FixitCase, FixitCases, FixitState } from './types.js';

const resources: FixitResources = await fixitResourcesFromDisk();
const loaded: FixitCases = await shippedFixitCases(resources);
const schedule: PriceSchedule = loaded.schedule;

/** The repaired half of the pair, folded to who boarded which car and when. */
function legsOf(entry: FixitCase, state: FixitState): string {
  const plan = fixitRunPlanOf(entry, state, resources);
  return JSON.stringify(
    recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
    ]),
  );
}

/**
 * Select repairs one at a time through the **reducer a press calls**, never by writing the state.
 *
 * That is the whole apparatus: `toggleRepair` consults `affordabilityOf` and returns the state
 * unchanged when the budget refuses, so a refused purchase reaches the run as *nothing* rather than
 * as an applied change with a warning beside it. A test that assembled `selectedRepairIds` itself
 * would vouch for a reimplementation of the call site — `campaign/stageRun.ts`' rule.
 */
function selecting(entry: FixitCase, ids: readonly string[]): FixitState {
  let state = emptyFixitState();
  for (const id of ids) state = toggleRepair(entry, state, id, schedule);
  return state;
}

/**
 * A case where the base budget takes the cheaper set and refuses the dearer one, and the one
 * authored rung admits it.
 *
 * Derived entirely from the shipped file and the shipped prices: no case id, no repair id and no
 * figure is written down here. The pair searched over is *the diagnosed repair* (the one whose
 * whole point is that it fixes the case) plus each other repair in draw order, because that is the
 * set a player who has diagnosed the fault and wants one more thing actually builds.
 */
interface Subject {
  readonly entry: FixitCase;
  readonly stepId: string;
  readonly cheap: readonly string[];
  readonly dear: readonly string[];
}

function subject(): Subject {
  const steps = loaded.budgetSteps;
  const tried: string[] = [];
  for (const entry of loaded.cases) {
    const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
    if (diagnosed === undefined) continue;
    for (const step of steps) {
      const widened = caseAtRung(entry, steps, step.id);
      for (const extra of entry.repairs) {
        if (extra.id === diagnosed.id) continue;
        const cheap = [diagnosed.id];
        const dear = [diagnosed.id, extra.id];
        const baseTakesCheap = affordabilityOf(entry, emptyFixitState(), diagnosed.costUnits, schedule)
          .selectable;
        const afterCheap = selecting(entry, cheap);
        const baseRefusesDear = !affordabilityOf(entry, afterCheap, extra.costUnits, schedule).selectable;
        const rungTakesDear =
          affordabilityOf(widened, selecting(widened, cheap), extra.costUnits, schedule).selectable;
        tried.push(
          `${entry.id}/${step.id}/${extra.id}: base takes cheap ${String(baseTakesCheap)}, ` +
            `base refuses dear ${String(baseRefusesDear)}, rung takes dear ${String(rungTakesDear)}`,
        );
        if (baseTakesCheap && baseRefusesDear && rungTakesDear) {
          return { entry, stepId: step.id, cheap, dear };
        }
      }
    }
  }
  throw new Error(
    'no shipped fix case has a repair pair its base budget splits and its bought rung admits, so ' +
      `this file can say nothing about a budget. Tried: ${tried.join('; ')}`,
  );
}

const chosen = subject();

describe('a bought scenario rung reaches the run — issue #579', () => {
  it('authors the ladder in the scenario’s own file, at one chime per unit and nowhere else', () => {
    expect(loaded.budgetSteps.length, 'the shipped fix cases author no bought rung').toBeGreaterThan(0);
    for (const step of loaded.budgetSteps) {
      expect(Number.isInteger(step.addsUnits) && step.addsUnits > 0, step.id).toBe(true);
      expect(Number.isInteger(step.chimes) && step.chimes > 0, step.id).toBe(true);
      /*
       * Invariant 8, on the rung itself — the schema travels with it, so a search over the space
       * needs no fix-it knowledge. Asserted here because `decodeBudgetStep` requires a schema and
       * says nothing about its unit.
       */
      expect(step.schema.unit, step.id).toBe('units');
      expect(step.schema.default, `${step.id}: the schema's default is the shipped figure`).toBe(
        step.addsUnits,
      );
    }
  });

  it('puts the bought rung above the base by exactly what the step authors', () => {
    const step = loaded.budgetSteps.find((candidate) => candidate.id === chosen.stepId);
    const widened = caseAtRung(chosen.entry, loaded.budgetSteps, chosen.stepId);
    expect(widened.budgetUnits).toBe(chosen.entry.budgetUnits + (step?.addsUnits ?? 0));
    expect(widened.budgetUnits).toBeGreaterThan(chosen.entry.budgetUnits);
    /* And it widens the budget and nothing else about the case. */
    expect({ ...widened, budgetUnits: chosen.entry.budgetUnits }).toEqual(chosen.entry);
  });

  it('arm 1: a change the base budget can pay for reaches the run and moves the legs', () => {
    const state = selecting(chosen.entry, chosen.cheap);
    expect(state.selectedRepairIds).toEqual([...chosen.cheap]);
    expect(legsOf(chosen.entry, state)).not.toBe(legsOf(chosen.entry, emptyFixitState()));
  });

  it('arm 2: the dearer change is refused at the base rung, and nothing of it reaches the run', () => {
    const cheapOnly = selecting(chosen.entry, chosen.cheap);
    const refused = selecting(chosen.entry, chosen.dear);
    expect(refused.selectedRepairIds, 'the refused repair was selected anyway').toEqual([
      ...chosen.cheap,
    ]);
    expect(spendOf(chosen.entry, refused, schedule).totalUnits).toBeLessThanOrEqual(
      chosen.entry.budgetUnits,
    );
    expect(legsOf(chosen.entry, refused)).toBe(legsOf(chosen.entry, cheapOnly));
  });

  it('arm 3: the same change at the bought rung is admitted, and the legs move', () => {
    const widened = caseAtRung(chosen.entry, loaded.budgetSteps, chosen.stepId);
    const bought = selecting(widened, chosen.dear);
    expect(bought.selectedRepairIds, 'the rung did not admit the dearer repair').toEqual([
      ...chosen.dear,
    ]);
    expect(legsOf(widened, bought)).not.toBe(legsOf(chosen.entry, selecting(chosen.entry, chosen.cheap)));
  });

  it('moves no bar: the run plan a rung produces is the run plan the base produces for one selection', () => {
    /*
     * `charter` non-goal 6, and the reason it holds here by construction rather than by a bound:
     * `fixitRunPlanOf` reads the patches and the seed and never `budgetUnits`, so two players who
     * assemble the same selection are simulated identically whatever they paid. Asserted on the
     * configs rather than argued, because *nothing reads that field* is exactly the kind of claim
     * that stops being true quietly.
     */
    const widened = caseAtRung(chosen.entry, loaded.budgetSteps, chosen.stepId);
    const state = selecting(chosen.entry, chosen.cheap);
    expect(fixitRunPlanOf(widened, state, resources)).toEqual(
      fixitRunPlanOf(chosen.entry, state, resources),
    );
  });

  it('leaves the case alone on the base rung and on a step the ladder does not hold', () => {
    expect(caseAtRung(chosen.entry, loaded.budgetSteps, undefined)).toBe(chosen.entry);
    expect(caseAtRung(chosen.entry, loaded.budgetSteps, 'no-such-rung')).toBe(chosen.entry);
  });
});
