/**
 * **The budget bounds what reaches the run, and moves no bar** — GitHub issue **#365**'s third and
 * fourth criteria, and `CLAUDE.md`'s standing requirement pointed at a scenario budget.
 *
 * > *"Move the control and require the run to change, compared on the legs. A scenario's budget
 * > bounds which configurations are reachable; a change made under a budget that the budget does
 * > not permit must not reach the run, and one that it does permit must, proved on the legs rather
 * > than on a window statistic."*
 *
 * ## Compared on the legs, never on a window statistic
 *
 * `legsOf` folds a run to who boarded which car and when — `campaign/stageOneParking.test.ts`'s own
 * key, and `docs/12` § 5 clause 9's. A mean wait can move because a run is noisy; the boarding
 * identities move only when the simulation did something different.
 *
 * ## Three arms, and the third is what makes the second mean anything
 *
 * 1. A change the base rung **can** pay for reaches the run and moves the legs.
 * 2. A change the base rung **cannot** pay for is refused, nothing is applied, and the legs are
 *    the unedited ones to the boarding.
 * 3. **The same change**, at the bought-budget rung that can pay for it, moves the legs.
 *
 * Without the third arm the second would pass on a change that was inert — the eleven-dead-seams
 * class this repository has shipped in code, arrived at from the data side. With it, the second arm
 * is a statement about the *budget* rather than about the change.
 *
 * ## Why the priced change is one the stage's own `editable` list does not name
 *
 * The refused arm needs a change dearer than the rung, and **no shipped stage offers one**: each
 * base is authored as the dearest change its own dials reach plus a typical dispatcher change, so a
 * stage can always afford everything it lists. That is the design rather than a gap, and it is why
 * this file buys a landing panel — `equipment` tier — against a stage whose listed set predates the
 * ruling. [§ D525](../../../../DECISIONS.md) clause 2 retires per-scenario control lists outright:
 * *"the whole editor is open in every scenario … what varies between scenarios is the budget and
 * the building, never which controls are offered."* So a scenario's budget being asked about a
 * control its legacy `editable` list omits is the ruling's own case, not a liberty this test takes.
 * Re-authoring those lists is #233's.
 *
 * ## What building it found, and it is why the arms buy a *change* rather than a *dial*
 *
 * The first draft moved one dimension per arm — `dispatch.callType` for the dear one — and the legs
 * did not move on any of the four eligible stages. That is not a defect: `dispatch.callType` alone
 * is § D112's **6a disclosure**, the panel asking where a rider is going, and without
 * `dispatch.passengerAssignment` nothing routes on the answer. The schedule already knew this — one
 * price, `destination-panels`, covers **both** paths — so the arms now derive their dials from the
 * change's own `covers` list and move every one of them. A test that had asserted on the single
 * dial would have been asserting that a purchase reaches the run while buying half of one.
 *
 * ## The bar does not move with the budget, and it is asserted rather than argued
 *
 * `judgeStage` is judged twice over **one** batch — the same runs, the same report — under the
 * stage's shipped budget and under the same stage widened to the top of its ladder. The two
 * verdicts are deep-equal. `charter` non-goal 6, in the one form that cannot be satisfied by
 * inspection: *two players who post the same run read the same verdict whatever their budget was*.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { admitPurchase, changePricingDimension, rungsOf } from './budget.js';
import type { PublishedGoalRates, PublishedScenario } from './published.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { batchReport } from '../batch/report.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchResources } from '../batch/types.js';
import { judgeStage } from '../campaign/judge.js';
import { parseCampaign, type CampaignContext } from '../campaign/parse.js';
import { batchRequestForStage, demonstrationConfigFor } from '../campaign/stageRun.js';
import type { Campaign, CampaignStage } from '../campaign/types.js';
import { resolveEditedProfile, type EditedVector } from '../controls/editedProfile.js';
import { priceOf } from '../pricing/parse.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PriceSchedule } from '../pricing/types.js';
import { recordRun } from '../record/recordRun.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';

const TIMEOUT_MS = 300_000;

/**
 * The two **changes** this file buys, named as ids on `data/price-schedule.json` rather than as
 * dimensions — and that distinction is the point.
 *
 * A player does not buy `dispatch.callType`; they buy *a landing panel*, and the schedule prices
 * that one change over **both** `dispatcher.dispatch.callType` and
 * `dispatcher.dispatch.passengerAssignment`. Buying it and moving only the first is § D112's
 * 6a-disclosure without 6b-dispatch: the panel asks where you are going and nothing routes on the
 * answer. Measured, that edit moves the legs on **no** shipped stage, which is the first thing this
 * file found and the reason the dials below are derived from a change's own `covers` list.
 */
const CHEAP_CHANGE = 'dispatch-rules';
const DEAR_CHANGE = 'destination-panels';

let config: LoadedConfig;
let published: PublishedGoalRates;
let campaign: Campaign;
let space: SearchSpace;
let schedule: PriceSchedule;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  space = collectSearchSpace();
  schedule = shippedPriceSchedule();
  const raw: unknown = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8'));
  const context: CampaignContext = {
    published,
    dimensionIds: space.ids,
    profileIds: new Set(config.dispatcherProfilesById.keys()),
    restrictedFloorIdsByBuilding: new Map(
      [...config.buildingsById.values()].map((building) => [
        building.id,
        restrictedFloorIds(
          building.floors.map((floor) => floor.id),
          building.accessZones,
        ),
      ]),
    ),
    schedule,
  };
  campaign = parseCampaign(raw, context);
}, TIMEOUT_MS);

/**
 * The dimensions one priced change buys, in the search space's **own declaration order**.
 *
 * Derived from the change's `covers` paths rather than written down, so a re-grouped schedule moves
 * this file rather than leaving it asserting against a grouping that no longer ships. Categorical
 * only, because moving a categorical dial to another declared value is a move no range check can
 * refuse; a weight would need a magnitude this file has no basis to choose.
 *
 * The order matters and is the space's rather than this file's: `dispatch.passengerAssignment` is
 * gated on `dispatch.callType`, and `controls/editedProfile.ts#applyEdit` walks the record in
 * insertion order precisely so that *"writing the gate first is what lets the dependant become live
 * in the same pass"*. The space declares the gate first, so iterating it is enough.
 */
function dialsOf(changeId: string): readonly string[] {
  const change = priceOf(schedule, changeId);
  return space.parameters
    .filter((parameter) => parameter.type === 'categorical')
    .filter((parameter) =>
      change.covers.some(
        (path) =>
          `dispatcher.${parameter.id}` === path ||
          `dispatcher.${parameter.id}`.startsWith(`${path}.`),
      ),
    )
    .map((parameter) => parameter.id);
}

/** Every dial a change buys, each moved off the value the space defaults to. */
function editValuesFor(changeId: string): Readonly<Record<string, string | number>> {
  const values: Record<string, string | number> = {};
  for (const id of dialsOf(changeId)) values[id] = otherValueOf(id);
  return values;
}

/** Stages whose ladder can carry the three arms: base affords the cheap change, refuses the dear one. */
function candidates(): readonly CampaignStage[] {
  return campaign.stages.filter((stage) => {
    const rungs = rungsOf(stage.budget);
    const base = rungs[0]?.units ?? 0;
    const top = rungs.at(-1)?.units ?? 0;
    return (
      admitPurchase(schedule, base, dialsOf(CHEAP_CHANGE)).admitted &&
      !admitPurchase(schedule, base, dialsOf(DEAR_CHANGE)).admitted &&
      admitPurchase(schedule, top, dialsOf(DEAR_CHANGE)).admitted
    );
  });
}

/**
 * The stage this file runs, **found rather than named** — and found on two properties, not one.
 *
 * The first is about the budget: its base affords {@link CHEAP_DIAL} and refuses {@link DEAR_DIAL},
 * and its top rung affords both. The second is about the building: **both dials move its legs**.
 *
 * The second property is not a way of making the case pass, it is what makes the case *about a
 * budget*. A dial that changes nothing on a quiet two-car building is inert there, and a refusal
 * arm that showed the legs unmoved would then be evidence about the dial rather than about the
 * money. Selecting a stage where both dials are live means the middle arm can only be explained by
 * the budget, which is `pricing/tiersReachTheRun.test.ts#caseAtTier`'s own move: search the shipped
 * content for a subject that can carry the claim, and go red rather than quiet when none can.
 *
 * Cached, because finding it costs four recorded runs and every case below wants the same stage.
 */
let cachedSubject: CampaignStage | undefined;

function subject(): CampaignStage {
  if (cachedSubject !== undefined) return cachedSubject;
  const eligible = candidates();
  const tried: string[] = [];
  for (const stage of eligible) {
    const asShipped = legsOf(stage, null);
    const top = rungsOf(stage.budget).length - 1;
    const cheapMoves =
      legsOf(stage, editUnderBudget(stage, 0, editValuesFor(CHEAP_CHANGE))) !== asShipped;
    const dearMoves =
      legsOf(stage, editUnderBudget(stage, top, editValuesFor(DEAR_CHANGE))) !== asShipped;
    tried.push(`${stage.id} (${stage.building}): cheap ${String(cheapMoves)}, dear ${String(dearMoves)}`);
    if (cheapMoves && dearMoves) {
      cachedSubject = stage;
      return stage;
    }
  }
  throw new Error(
    `no shipped stage both bounds these two dials by its budget and has either of them reach its ` +
      `run, so this file can say nothing about a budget. Tried: ${tried.join('; ')}` +
      (eligible.length === 0 ? ' (no stage had the budget shape at all)' : ''),
  );
}

function editOf(values: Readonly<Record<string, string | number>>): EditedVector {
  return { baseProfileId: 'collective', profileId: 'budgeted', values };
}

/**
 * A declared value for `id` that is not the one the space defaults to — **read off the space**.
 *
 * Writing the alternative down would make this file the second place that says what a categorical
 * dimension may hold, and it would go quietly stale the day `core` renamed a choice. `campaign/`'s
 * whole dimension discipline is that a knob declared tomorrow needs no edit here.
 */
function otherValueOf(id: string): string {
  const parameter = space.parameters.find((entry) => entry.id === id);
  if (parameter === undefined) throw new Error(`the search space does not declare "${id}"`);
  if (parameter.type !== 'categorical') {
    throw new Error(`"${id}" is ${parameter.type}; this file moves a categorical dial.`);
  }
  const other = parameter.values.find((value) => value !== parameter.default);
  if (other === undefined) throw new Error(`"${id}" declares one value, so moving it is not a move`);
  return other;
}

/** The stage's own demonstration replication, folded to the legs. */
function legsOf(stage: CampaignStage, edit: EditedVector | null): string {
  const base = requireDispatcher(config, stage.dispatcher.startingProfileId);
  let profile = base;
  if (edit !== null) {
    const resolved = resolveEditedProfile(space, base, edit, {
      building: requireBuilding(config, stage.building),
      elevatorSpecs: config.elevatorSpecs,
    });
    if (!resolved.ok) throw new Error(resolved.reason);
    profile = resolved.profile;
  }
  const simulation = demonstrationConfigFor({
    stage,
    building: requireBuilding(config, stage.building),
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  });
  return JSON.stringify(
    recordRun(simulation, { recordDecisions: false }).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
    ]),
  );
}

/**
 * What the player has actually bought, at a rung — the shape a screen would call.
 *
 * A refused purchase reaches the run as **nothing**, which is the whole of the second arm: the
 * budget is not a warning printed beside an applied change, it is the thing that stops it being
 * applied.
 */
function editUnderBudget(
  stage: CampaignStage,
  rungIndex: number,
  values: Readonly<Record<string, string | number>>,
): EditedVector | null {
  const rung = rungsOf(stage.budget)[rungIndex];
  if (rung === undefined) throw new Error(`the budget has no rung ${String(rungIndex)}`);
  return admitPurchase(schedule, rung.units, Object.keys(values)).admitted
    ? editOf(values)
    : null;
}

describe('the budget bounds which configurations reach the run — #365 criterion 3', () => {
  it('prices the two changes off the shipped schedule, so the arms below are about a budget', () => {
    const stage = subject();
    const cheap = priceOf(schedule, CHEAP_CHANGE);
    const dear = priceOf(schedule, DEAR_CHANGE);
    expect(dialsOf(CHEAP_CHANGE).length, 'the cheap change buys a dial').toBeGreaterThan(0);
    expect(dialsOf(DEAR_CHANGE).length, 'the dear change buys a dial').toBeGreaterThan(0);
    const rungs = rungsOf(stage.budget);
    expect(cheap.priceUnits).toBeLessThanOrEqual(rungs[0]?.units ?? 0);
    expect(dear.priceUnits).toBeGreaterThan(rungs[0]?.units ?? 0);
    expect(dear.priceUnits).toBeLessThanOrEqual(rungs.at(-1)?.units ?? 0);
    /* The two sit on different tiers, which is what makes this a ladder and not a threshold. */
    expect(cheap.tier).not.toBe(dear.tier);
    /* Every dial the change buys is priced by that change, and by only that one. */
    for (const id of dialsOf(DEAR_CHANGE)) {
      expect(changePricingDimension(schedule, id)?.id, id).toBe(DEAR_CHANGE);
    }
  });

  it(
    'moves the legs when the base rung can pay for the change',
    () => {
      const stage = subject();
      const edit = editUnderBudget(stage, 0, editValuesFor(CHEAP_CHANGE));
      expect(edit, 'the base rung admitted the cheap change').not.toBeNull();
      expect(legsOf(stage, edit)).not.toBe(legsOf(stage, null));
    },
    TIMEOUT_MS,
  );

  it(
    'leaves the run alone when the base rung cannot pay for the change',
    () => {
      const stage = subject();
      const edit = editUnderBudget(stage, 0, editValuesFor(DEAR_CHANGE));
      expect(edit, 'the base rung refused the dear change').toBeNull();
      expect(legsOf(stage, edit)).toBe(legsOf(stage, null));
    },
    TIMEOUT_MS,
  );

  it(
    'and reaches the run at the bought rung that can pay for it, so the refusal is the budget',
    () => {
      const stage = subject();
      const top = rungsOf(stage.budget).length - 1;
      const edit = editUnderBudget(stage, top, editValuesFor(DEAR_CHANGE));
      expect(edit, 'the top rung admitted the dear change').not.toBeNull();
      expect(legsOf(stage, edit)).not.toBe(legsOf(stage, null));
    },
    TIMEOUT_MS,
  );
});

describe('the budget moves no bar — #365 criterion 4, charter non-goal 6', () => {
  it(
    'judges one batch identically under the shipped budget and under the widest one',
    async () => {
      const stage = subject();
      const resources: BatchResources = {
        building: requireBuilding(config, stage.building),
        dispatcherProfiles: config.dispatcherProfiles,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
      };
      const result = await runBatch(
        batchRequestForStage(stage, stage.dispatcher.startingProfileId),
        resources,
      );
      const report = batchReport(result);
      const row = scenarioOf(stage);

      /* The same stage at the top of its own ladder: every step already bought. */
      const rungs = rungsOf(stage.budget);
      const widened: CampaignStage = {
        ...stage,
        budget: {
          ...stage.budget,
          startingUnits: rungs.at(-1)?.units ?? stage.budget.startingUnits,
          steps: [],
        },
      };
      expect(widened.budget.startingUnits).toBeGreaterThan(stage.budget.startingUnits);

      const asShipped = judgeStage({ stage, published: row, result, report });
      const asWidened = judgeStage({ stage: widened, published: row, result, report });
      expect(asWidened).toEqual(asShipped);
      /* Non-vacuity: the verdict says something rather than being an empty object. */
      expect(asShipped.headline.trim()).not.toBe('');
      expect(asShipped.goals.length).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );
});

function scenarioOf(stage: CampaignStage): PublishedScenario {
  const found = published.scenarios.find((entry) => entry.id === stage.id);
  if (found === undefined) throw new Error(`no published row for ${stage.id}`);
  return found;
}
