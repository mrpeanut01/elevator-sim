/**
 * **The scenario budget's schema, in both directions** — GitHub issue **#365**.
 *
 * Every rule `scenario/budget.ts` states is asserted here twice: once that the shipped file passes
 * it, and once that a budget carrying exactly that defect is refused with the reason attached. A
 * validator nobody has watched fail is a validator nobody knows works — `pricing/schedule.test.ts`
 * says so in terms, and the positive controls below are that argument applied one module along.
 *
 * ## What the last block is for, and it is the clause the issue calls *asserted, not argued*
 *
 * #365's fourth criterion: *"the budget bounds the space and moves no bar — two players who post
 * the same run read the same verdict whatever their budget was (`charter` non-goal 6)."* Two
 * assertions carry it, and they cut from opposite sides:
 *
 * - A budget may not **carry** a bar. `decodeScenarioBudget` refuses an unknown key rather than
 *   ignoring it, so `"threshold": 30` on a budget fails to load; `data/contract-ladder.json` took
 *   the same decision the same way and said why — a field that does not exist cannot be authored.
 * - Nothing that **decides** a verdict may name a budget field. The modules that judge are read
 *   off disk and scanned for the budget's own field names, so a judge that grew a `startingUnits`
 *   branch would go red here. Its positive control is in the case itself: the scan is shown
 *   finding those names in the one file that legitimately holds them.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  BUDGET_KEYS,
  STEP_KEYS,
  admitPurchase,
  affordableChanges,
  budgetViolations,
  changePricingDimension,
  decodeScenarioBudget,
  rungsOf,
  scheduleBoundsOf,
  type BoughtBudgetStep,
  type ScenarioBudget,
} from './budget.js';
import type { PublishedGoalRates } from './published.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { editableIdsOf, parseCampaign, type CampaignContext } from '../campaign/parse.js';
import type { Campaign, CampaignStage } from '../campaign/types.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PriceSchedule } from '../pricing/types.js';
import { DATA_DIR } from '../fixtures.test-helper.js';

const VIZ_SRC = join(DATA_DIR, '..', 'packages', 'viz', 'src');

let config: LoadedConfig;
let published: PublishedGoalRates;
let campaign: Campaign;
let space: SearchSpace;
let schedule: PriceSchedule;
let rawCampaign: unknown;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  space = collectSearchSpace();
  schedule = shippedPriceSchedule();
  rawCampaign = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8'));
  campaign = parseCampaign(rawCampaign, contextOf());
}, 300_000);

function contextOf(): CampaignContext {
  return {
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
}

/** The first stage's budget, deep-copied so a mutation cannot reach another case. */
function aBudget(): ScenarioBudget {
  const stage = campaign.stages[0];
  if (stage === undefined) throw new Error('the campaign ships no stages');
  return JSON.parse(JSON.stringify(stage.budget)) as ScenarioBudget;
}

/** The raw campaign document, deep-copied, for a case that has to break the file rather than the type. */
function rawCopy(): { readonly stages: Record<string, unknown>[] } {
  return JSON.parse(JSON.stringify(rawCampaign)) as { readonly stages: Record<string, unknown>[] };
}

function firstStepOf(budget: ScenarioBudget): BoughtBudgetStep {
  const step = budget.steps[0];
  if (step === undefined) throw new Error('the budget ships no steps');
  return step;
}

/** Apply `change` to a deep copy of the shipped budget and return what the validator says. */
function violationsAfter(change: (budget: ScenarioBudget) => ScenarioBudget): readonly string[] {
  return budgetViolations('a stage', change(aBudget()), schedule);
}

describe('every shipped scenario carries a budget, and it parses', () => {
  it('gives all ten stages a base, a ladder and a note', () => {
    expect(campaign.stages.length).toBe(10);
    for (const stage of campaign.stages) {
      expect(stage.budget.startingUnits, `${stage.id} opens on something`).toBeGreaterThan(0);
      expect(stage.budget.steps.length, `${stage.id} authors a ladder`).toBeGreaterThan(0);
      expect(stage.budget.note.trim(), `${stage.id} says where its figure came from`).not.toBe('');
      expect(budgetViolations(stage.id, stage.budget, schedule)).toEqual([]);
    }
  });

  it('climbs: every rung is dearer than the one below and costs more chimes to reach', () => {
    for (const stage of campaign.stages) {
      const rungs = rungsOf(stage.budget);
      expect(rungs.length, `${stage.id}`).toBe(stage.budget.steps.length + 1);
      expect(rungs[0]?.chimesSpent, `${stage.id} opens having spent nothing`).toBe(0);
      for (let i = 1; i < rungs.length; i += 1) {
        const below = rungs[i - 1];
        const rung = rungs[i];
        if (below === undefined || rung === undefined) throw new Error('unreachable');
        expect(rung.units, `${stage.id} at ${String(rung.stepId)}`).toBeGreaterThan(below.units);
        expect(rung.chimesSpent, `${stage.id} at ${String(rung.stepId)}`).toBeGreaterThan(
          below.chimesSpent,
        );
      }
    }
  });

  /**
   * The claim the file's own `$comment` makes about its arithmetic, re-derived rather than trusted.
   *
   * Nothing in `data/campaign.json` may be checkable only against the sentence beside it. The base
   * of every stage is *the dearest change its own dials reach, plus the cheapest tier's typical*,
   * and both halves come off `data/price-schedule.json` here.
   */
  it('opens one typical dispatcher change above the dearest dial the stage offers', () => {
    const bounds = scheduleBoundsOf(schedule);
    for (const stage of campaign.stages) {
      const reachable = editableIdsOf(stage.dispatcher.editable, space.ids)
        .map((id) => changePricingDimension(schedule, id))
        .filter((change) => change !== undefined)
        .map((change) => change.priceUnits);
      expect(reachable.length, `${stage.id} reaches something the schedule prices`).toBeGreaterThan(
        0,
      );
      expect(stage.budget.startingUnits, `${stage.id}`).toBe(
        Math.max(...reachable) + bounds.cheapestTierTypicalUnits,
      );
    }
  });

  it('reaches the top of the ladder, and stops where nothing more can be bought one at a time', () => {
    const bounds = scheduleBoundsOf(schedule);
    for (const stage of campaign.stages) {
      const rungs = rungsOf(stage.budget);
      const top = rungs[rungs.length - 1];
      expect(top?.units, `${stage.id}`).toBe(bounds.dearestChangeUnits);
      expect(affordableChanges(schedule, top?.units ?? 0).length, `${stage.id}`).toBe(
        schedule.changes.length,
      );
    }
  });
});

describe('a record missing a budget is refused rather than defaulted — #365 criterion 5', () => {
  it('refuses the stage and says why', () => {
    const broken = rawCopy();
    const stage = broken.stages[0];
    if (stage === undefined) throw new Error('unreachable');
    delete stage['budget'];
    expect(() => parseCampaign(broken, contextOf())).toThrow(/has no "budget"/);
    expect(() => parseCampaign(broken, contextOf())).toThrow(/refused rather than read as an unlimited one/);
  });

  it('and the same document with its budget in place parses, so the case is not vacuous', () => {
    expect(() => parseCampaign(rawCopy(), contextOf())).not.toThrow();
  });

  /**
   * **`budgetViolations` is reached by the loader, not merely callable.**
   *
   * Every case below this drives the validator directly, which would go on passing if
   * `parseCampaign` had never been wired to it — a validator with no caller on the shipped path is
   * the defect class `CLAUDE.md` names eleven times. So one rule is broken in the **file** and the
   * shipped loader is asked about it.
   */
  it('runs the budget rules from the loader, on the shipped document', () => {
    const broken = rawCopy();
    const stage = broken.stages[0];
    if (stage === undefined) throw new Error('unreachable');
    const budget = stage['budget'] as Record<string, unknown>;
    const schema = budget['schema'] as Record<string, unknown>;
    budget['schema'] = { ...schema, max: (schema['max'] as number) + 1 };
    expect(() => parseCampaign(broken, contextOf())).toThrow(
      /The ceiling is selected from the ladder/,
    );
  });
});

describe('a step no price schedule can reach fails to load — #365 criterion 2', () => {
  it('refuses a step that adds less than the cheapest change costing anything', () => {
    const bounds = scheduleBoundsOf(schedule);
    const found = violationsAfter((budget) => ({
      ...budget,
      steps: budget.steps.map((step, index) =>
        index === 0
          ? { ...step, addsUnits: 1, schema: { ...step.schema, default: 1 } }
          : step,
      ),
    }));
    expect(found.join('\n')).toMatch(/buys nothing at any price the ladder holds/);
    expect(found.join('\n')).toContain(String(bounds.cheapestPositiveUnits));
  });

  it('refuses a step that lifts the budget past what the whole schedule costs', () => {
    const bounds = scheduleBoundsOf(schedule);
    const found = violationsAfter((budget) => ({
      ...budget,
      steps: budget.steps.map((step, index) =>
        index === 0
          ? {
              ...step,
              addsUnits: bounds.totalUnits + 1,
              schema: { ...step.schema, default: bounds.totalUnits + 1 },
            }
          : step,
      ),
    }));
    expect(found.join('\n')).toMatch(/there is nothing above it left to buy/);
  });

  /**
   * The rung that is the rung below wearing a second price.
   *
   * 10 → 12 units on the shipped ladder: the dearest change at or under 10 units is 10, the next
   * price up is 13, so the two rungs afford exactly the same changes and the step buys nothing. The
   * figures are derived here rather than written down, so a re-priced schedule moves the case.
   */
  it('refuses a rung that affords exactly what the rung below afforded', () => {
    const prices = [...new Set(schedule.changes.map((change) => change.priceUnits))].sort(
      (a, b) => a - b,
    );
    const bounds = scheduleBoundsOf(schedule);
    const base = prices.find(
      (price, index) =>
        price >= bounds.cheapestTierTypicalUnits &&
        (prices[index + 1] ?? Number.POSITIVE_INFINITY) - price > bounds.cheapestPositiveUnits,
    );
    expect(base, 'the shipped ladder has a gap wide enough to author a dead rung in').toBeDefined();
    const found = budgetViolations(
      'a stage',
      {
        ...aBudget(),
        startingUnits: base ?? 0,
        schema: { ...aBudget().schema, default: base ?? 0 },
        steps: [
          {
            ...firstStepOf(aBudget()),
            addsUnits: bounds.cheapestPositiveUnits,
            schema: {
              ...firstStepOf(aBudget()).schema,
              default: bounds.cheapestPositiveUnits,
            },
          },
        ],
      },
      schedule,
    );
    expect(found.join('\n')).toMatch(/the rung below wearing a second price/);
  });
});

describe('the base clears the bottom of the ladder', () => {
  it('refuses a scenario that cannot afford a typical change at the cheapest tier', () => {
    const bounds = scheduleBoundsOf(schedule);
    const under = bounds.cheapestTierTypicalUnits - 1;
    const found = violationsAfter((budget) => ({
      ...budget,
      startingUnits: under,
      schema: { ...budget.schema, default: under },
    }));
    expect(found.join('\n')).toMatch(/there is no scenario here — only a run/);
  });
});

describe('CLAUDE.md invariant 8 — type, range, default and activeWhen', () => {
  it('refuses a default that disagrees with the shipped value', () => {
    const found = violationsAfter((budget) => ({
      ...budget,
      schema: { ...budget.schema, default: budget.startingUnits + 1 },
    }));
    expect(found.join('\n')).toMatch(/The default is the shipped value, not a second opinion/);
  });

  it('refuses a ceiling that is not what the whole schedule costs', () => {
    const found = violationsAfter((budget) => ({
      ...budget,
      schema: { ...budget.schema, max: budget.schema.max + 1 },
    }));
    expect(found.join('\n')).toMatch(/The ceiling is selected from the ladder/);
  });

  it('refuses a value outside its own declared range', () => {
    const found = violationsAfter((budget) => ({
      ...budget,
      startingUnits: budget.schema.max + 5,
      schema: { ...budget.schema, default: budget.schema.max + 5 },
    }));
    expect(found.join('\n')).toMatch(/outside its own declared/);
  });

  /**
   * The conditional clause, which is the reason `activeWhen` is on a budget schema at all and not
   * on a price schema — `pricing/types.ts` explains its own absence and this is the other half.
   */
  it('refuses a step whose activeWhen is not the step below it', () => {
    const found = violationsAfter((budget) => ({
      ...budget,
      steps: budget.steps.map((step, index) =>
        index === 1 ? { ...step, schema: { ...step.schema, activeWhen: null } } : step,
      ),
    }));
    expect(found.join('\n')).toMatch(/The condition is derived from the ladder, never trusted/);
  });

  it('refuses a first step that claims a predecessor', () => {
    const found = violationsAfter((budget) => ({
      ...budget,
      steps: budget.steps.map((step, index) =>
        index === 0 ? { ...step, schema: { ...step.schema, activeWhen: 'nothing' } } : step,
      ),
    }));
    expect(found.join('\n')).toMatch(/invariant 8's condition is null/);
  });
});

describe('a step is a spend', () => {
  it('refuses a rung that costs no chimes', () => {
    const found = violationsAfter((budget) => ({
      ...budget,
      steps: budget.steps.map((step, index) => (index === 0 ? { ...step, chimes: 0 } : step)),
    }));
    expect(found.join('\n')).toMatch(/A step that costs nothing is not a spend/);
  });
});

describe('the budget bounds the space and moves no bar — #365 criterion 4', () => {
  /**
   * A budget that could carry a bar would be a second place a verdict is set. The refusal is at the
   * decoder rather than in the type, because the type is not what an author writes.
   */
  for (const key of ['goal', 'threshold', 'difficulty', 'tier']) {
    it(`refuses a budget carrying "${key}"`, () => {
      const violations: string[] = [];
      const budget: unknown = { ...JSON.parse(JSON.stringify(aBudget())), [key]: 30 };
      decodeScenarioBudget(budget, 'a stage', violations);
      expect(violations.join('\n')).toMatch(/A budget bounds the space and moves no bar/);
      expect(violations.join('\n')).toContain(key);
    });

    it(`refuses a budget step carrying "${key}"`, () => {
      const violations: string[] = [];
      const budget = JSON.parse(JSON.stringify(aBudget())) as {
        steps: Record<string, unknown>[];
      };
      const step = budget.steps[0];
      if (step === undefined) throw new Error('unreachable');
      step[key] = 30;
      decodeScenarioBudget(budget, 'a stage', violations);
      expect(violations.join('\n')).toMatch(/A bought rung buys units and nothing else/);
    });
  }

  it('and the shipped keys are exactly the ones the decoder allows, so the guard is not vacuous', () => {
    const budget = aBudget() as unknown as Record<string, unknown>;
    expect(Object.keys(budget).sort()).toEqual([...BUDGET_KEYS].sort());
    const step = firstStepOf(aBudget()) as unknown as Record<string, unknown>;
    expect(Object.keys(step).sort()).toEqual([...STEP_KEYS].sort());
  });

  /**
   * **Nothing that decides a verdict names a budget field.**
   *
   * Read off disk rather than reasoned about, so a judge that grew a `startingUnits` branch turns
   * this red. The scan's own positive control is the last assertion: the same scan is shown finding
   * those names in the file that legitimately holds them, which is what says a scan that found
   * nothing found nothing because there is nothing.
   */
  it('is named by no module that decides a verdict', async () => {
    const judging = [
      'campaign/judge.ts',
      'scenario/goals.ts',
      'scenario/goalReport.ts',
      'batch/report.ts',
    ];
    const names = [...BUDGET_KEYS, ...STEP_KEYS, 'chimes', 'rungsOf', 'admitPurchase'].filter(
      (name) => name !== 'name' && name !== 'note' && name !== 'id' && name !== 'schema',
    );
    for (const file of judging) {
      const source = await readFile(join(VIZ_SRC, file), 'utf8');
      for (const name of names) {
        expect(source, `${file} names "${name}"`).not.toContain(name);
      }
    }
    const own = await readFile(join(VIZ_SRC, 'scenario/budget.ts'), 'utf8');
    for (const name of names) expect(own, `the scan can see "${name}"`).toContain(name);
  });
});

describe('a rung permits what it can pay for and refuses what it cannot', () => {
  it('charges one price for two dials the schedule groups as one change', () => {
    const paired = schedule.changes.find((change) => change.covers.length > 1);
    expect(paired, 'the schedule groups at least one change over several paths').toBeDefined();
    const both = admitPurchase(schedule, schedule.changes.length * 100, [
      'weights.waitTime',
      'weights.distanceTravelled',
    ]);
    expect(both.changeIds.length, 'two weights are one re-tune').toBe(1);
    expect(both.units).toBe(changePricingDimension(schedule, 'weights.waitTime')?.priceUnits);
  });

  it('refuses a move it cannot pay for, with the price and the budget in the reason', () => {
    const panels = changePricingDimension(schedule, 'dispatch.callType');
    expect(panels, 'the schedule prices a landing panel').toBeDefined();
    const refused = admitPurchase(schedule, 1, ['dispatch.callType']);
    expect(refused.admitted).toBe(false);
    expect(refused.reason).toContain(String(panels?.priceUnits));
    expect(refused.reason).toMatch(/the bar the run is judged against does not move with it/);
  });
});

/**
 * **Thirty-five dimensions the shipped scenarios offer that `data/price-schedule.json` prices
 * nothing for — a finding this schema surfaced rather than one it introduced.**
 *
 * A register, on `honesty.test.ts#OUTSTANDING`'s precedent, and it is recorded rather than closed
 * because closing it means pricing thirty-five dials, which is #366's file and #233's authoring
 * rather than this schema's. What it costs today is real and worth stating plainly: a dimension
 * nothing prices is **free**, so the budget does not bound it, and `docs/38` § 2.1's *"every knob
 * is priced"* is not yet true of these. `admitPurchase` reports them rather than guessing a price,
 * because a guessed price is the second price list #366 exists to end, and refusing them outright
 * would make a control the editor offers unusable for a reason no player could read.
 *
 * **Thirteen of them are reachable from a stage's own listed dimensions**; the other twenty-two are
 * reached only through `stage-7-prove-it`, which opens `every-declared-dimension`. Two families are
 * worth naming because they are whole mechanisms rather than stray dials: the seven `selection.*`
 * knobs are the mid-run weight-set selector [§ D219](../../../../DECISIONS.md) wired up, and the
 * six `idle.predictor*` knobs are the arrival predictor. Under § D525 clause 2 the whole editor is
 * open in every scenario, so the number this register holds only grows as the other three content
 * sources are authored.
 *
 * The check runs in **both** directions, which is what makes a register a register: a dimension
 * that acquires a price must leave this list on the commit that prices it, and a dimension that
 * loses one must arrive.
 */
const UNPRICED_DIMENSIONS: readonly string[] = [
  'answer.allowBypassIfSoleEligibleCar',
  'answer.bypassLoadThreshold',
  'answer.maxReopensPerStop',
  'answer.maxTransferSeconds',
  'answer.overloadThreshold',
  'answer.reopenOnLateArrival',
  'auction.aggregation',
  'auction.reserveMarginalDelayS',
  'auction.rounds',
  'constraints.noDirectionReversal',
  'dispatch.assignmentTiming',
  'dispatch.batchWindowS',
  'dispatch.commitmentPoint',
  'dispatch.deferWindowS',
  'dispatch.maxReassignmentsPerCall',
  'dispatch.reassignmentHysteresisS',
  'dispatch.reassignmentPolicy',
  'eligibility.allowOppositeDirectionPickup',
  'eligibility.enRouteDiversion',
  'eligibility.maxLoadFactorForAssignment',
  'idle.predictorBucketWidthS',
  'idle.predictorCycleS',
  'idle.predictorHorizonS',
  'idle.predictorLearningRate',
  'idle.predictorPriorRatePerS',
  'idle.predictorPriorStrength',
  'normalization.distanceM',
  'normalization.waitTimeS',
  'selection.downPeakRateGain',
  'selection.hysteresisS',
  'selection.interfloorRateGain',
  'selection.lobbyArrivalRateGain',
  'selection.observationWindowS',
  'selection.policy',
  'selection.switchMargin',
];

describe('the dimensions the shipped scenarios offer and the schedule does not price', () => {
  it('is exactly the registered list, in both directions', () => {
    const offered = new Set<string>();
    for (const stage of campaign.stages) {
      for (const id of editableIdsOf(stage.dispatcher.editable, space.ids)) offered.add(id);
    }
    const unpriced = [...offered]
      .filter((id) => changePricingDimension(schedule, id) === undefined)
      .sort();
    expect(unpriced).toEqual([...UNPRICED_DIMENSIONS].sort());
  });

  it('and every other dimension the scenarios offer does carry a price', () => {
    for (const stage of campaign.stages) {
      for (const id of editableIdsOf(stage.dispatcher.editable, space.ids)) {
        if (UNPRICED_DIMENSIONS.includes(id)) continue;
        expect(changePricingDimension(schedule, id), `${stage.id} offers ${id}`).toBeDefined();
      }
    }
  });
});

describe("a stage's suggested levers are affordable at the rung it opens on", () => {
  it('holds for every shipped stage', () => {
    for (const stage of campaign.stages) {
      const levers = Object.values(stage.levers).filter((lever): lever is string => lever !== null);
      const base = rungsOf(stage.budget)[0];
      expect(admitPurchase(schedule, base?.units ?? 0, levers).admitted, stage.id).toBe(true);
    }
  });

  it('and a stage whose budget is cut below its own levers fails to load', () => {
    const broken = rawCopy();
    const stage: Record<string, unknown> | undefined = broken.stages.find(
      (entry) => entry['id'] === expensiveLeverStage().id,
    );
    if (stage === undefined) throw new Error('unreachable');
    const bounds = scheduleBoundsOf(schedule);
    stage['budget'] = {
      ...(stage['budget'] as Record<string, unknown>),
      startingUnits: bounds.cheapestTierTypicalUnits,
      schema: {
        ...((stage['budget'] as Record<string, unknown>)['schema'] as Record<string, unknown>),
        default: bounds.cheapestTierTypicalUnits,
      },
    };
    expect(() => parseCampaign(broken, contextOf())).toThrow(
      /the locked-dial hint with a price on it/,
    );
  });
});

/** The first stage whose levers cost more than the cheapest tier's typical — derived, not named. */
function expensiveLeverStage(): CampaignStage {
  const bounds = scheduleBoundsOf(schedule);
  const found = campaign.stages.find((stage) => {
    const levers = Object.values(stage.levers).filter((lever): lever is string => lever !== null);
    return !admitPurchase(schedule, bounds.cheapestTierTypicalUnits, levers).admitted;
  });
  if (found === undefined) {
    throw new Error('no shipped stage suggests a lever dearer than the cheapest tier typical');
  }
  return found;
}
