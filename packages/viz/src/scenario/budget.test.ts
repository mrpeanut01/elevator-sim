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
  withholdingDimension,
  type BoughtBudgetStep,
  type ScenarioBudget,
} from './budget.js';
import type { PublishedGoalRates } from './published.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { parseEngineeringBriefs, type EngineeringBriefs } from '../briefs/parse.js';
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
let briefs: EngineeringBriefs;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  space = collectSearchSpace();
  schedule = shippedPriceSchedule();
  rawCampaign = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8'));
  campaign = parseCampaign(rawCampaign, contextOf());
  briefs = parseEngineeringBriefs(
    JSON.parse(await readFile(join(DATA_DIR, 'engineering-briefs.json'), 'utf8')),
    contextOf(),
  );
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
      const reachable = editableIdsOf(stage.dispatcher.editable, space.ids, schedule)
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
 * **What the shipped scenarios offer and the schedule does not price — a register GitHub issue
 * #467 emptied, and kept in both directions because an empty register is a state to keep checking
 * rather than a rule to delete.**
 *
 * It held thirty-five dimensions when #365's schema measured them: thirteen reachable from a
 * stage's own listed dimensions and twenty-two more through `stage-7-prove-it`'s
 * `every-declared-dimension`, including the whole weight-set selector (`selection.*`, seven) and
 * the arrival predictor (`idle.predictor*`, six). A dimension nothing prices is **free**, so the
 * budget did not bound it, and `docs/38` § 2.1's *"every knob is priced"* was true of part of the
 * product. The register could not tell apart the two answers #467 asked for — *not purchasable*
 * and *priced high* — and the product owner's ruling of 2026-09-10 is what split them
 * ([§ D535](../../../../DECISIONS.md)):
 *
 * - **the two families are withheld**, declared once in `data/price-schedule.json`'s `withheld`
 *   block and resolved out of every scenario's editable set by `campaign/parse.ts#editableIdsOf`,
 *   so no scenario offers them; and
 * - **the other twenty-two are priced**, on rows the file marks field by field as an agent's
 *   proposal, approved as drafted by the owner on 2026-09-11.
 *
 * The check now runs over the engineering briefs as well as the ten stages, because two of them
 * open `every-declared-dimension` exactly as stage 7 does, and a register blind to them would be
 * empty for the wrong reason. Both directions still hold: a dimension that loses its price arrives
 * here red, and an entry that acquires one must leave.
 */
const UNPRICED_DIMENSIONS: readonly string[] = [];

/** Every scenario the shipped content authors to the schema: the ten stages and the briefs. */
function everyScenario(): readonly CampaignStage[] {
  return [...campaign.stages, ...briefs.asScenarios.stages];
}

/** What a scenario lets the player move, resolved the one way every screen resolves it. */
function offeredBy(stage: CampaignStage): readonly string[] {
  return editableIdsOf(stage.dispatcher.editable, space.ids, schedule);
}

/** Offered dimensions a schedule prices nothing for, sorted. */
function unpricedOffered(against: PriceSchedule): readonly string[] {
  const offered = new Set(everyScenario().flatMap(offeredBy));
  return [...offered].filter((id) => changePricingDimension(against, id) === undefined).sort();
}

describe('the dimensions the shipped scenarios offer and the schedule does not price — #467', () => {
  it('is exactly the registered list, in both directions', () => {
    expect(unpricedOffered(schedule)).toEqual([...UNPRICED_DIMENSIONS].sort());
  });

  it('and every other dimension a scenario offers does carry a price', () => {
    for (const stage of everyScenario()) {
      for (const id of offeredBy(stage)) {
        if (UNPRICED_DIMENSIONS.includes(id)) continue;
        expect(changePricingDimension(schedule, id), `${stage.id} offers ${id}`).toBeDefined();
      }
    }
  });

  /**
   * **The positive control an empty register needs.** A check comparing an empty list with an empty
   * list passes whether or not it can see anything, so one priced row is taken off a copy of the
   * schedule and every offered dimension it covered must appear — each of them, and nothing else.
   */
  it('would see a dimension that lost its price, so the empty register is not vacuous', () => {
    const offered = [...new Set(everyScenario().flatMap(offeredBy))];
    const dropped = schedule.changes.find((change) =>
      offered.some((id) => changePricingDimension(schedule, id)?.id === change.id),
    );
    if (dropped === undefined) throw new Error('no priced row covers an offered dimension');
    const without: PriceSchedule = {
      ...schedule,
      changes: schedule.changes.filter((change) => change.id !== dropped.id),
    };
    const expected = offered.filter((id) => changePricingDimension(schedule, id)?.id === dropped.id);
    expect(expected.length, `${dropped.id} covers an offered dimension`).toBeGreaterThan(0);
    expect(unpricedOffered(without)).toEqual([...UNPRICED_DIMENSIONS, ...expected].sort());
  });
});

/**
 * **The weight-set selector and the arrival predictor are sold in no scenario** — GitHub issue
 * #467, [§ D535](../../../../DECISIONS.md).
 *
 * The families are derived off the discovered space by the two prefixes the ruling names rather
 * than listed. So a `selection.*` knob declared tomorrow is withheld with no edit anywhere, because
 * `data/price-schedule.json` withholds that family as a group — while a new `idle.predictor*` knob
 * turns the first case below red until somebody decides which answer it gets, because the file
 * withholds that family by exact path. The asymmetry is the data's rather than this test's:
 * `idle.*` also holds the parking dials the schedule prices, so the predictor cannot be withheld as
 * a group without withholding them too.
 */
function familiesTheRulingNames(): readonly string[] {
  return space.ids.filter((id) => id.startsWith('selection.') || id.startsWith('idle.predictor'));
}

describe('the weight-set selector and the arrival predictor are withheld from every scenario — #467', () => {
  it('withholds exactly the two families the ruling names, and prices none of them', () => {
    const withheld = space.ids.filter((id) => withholdingDimension(schedule, id) !== undefined);
    expect([...withheld].sort()).toEqual([...familiesTheRulingNames()].sort());
    expect(withheld.length, 'seven selector knobs and six predictor knobs').toBe(13);
    for (const id of withheld) {
      expect(changePricingDimension(schedule, id), `${id} is withheld and priced`).toBeUndefined();
    }
  });

  it('resolves them out of every scenario that opens every declared dimension, stage 7 included', () => {
    const open = everyScenario().filter(
      (stage) => stage.dispatcher.editable.mode === 'every-declared-dimension',
    );
    expect(open.map((stage) => stage.id)).toContain('stage-7-prove-it');
    expect(open.length, 'the briefs open every declared dimension too').toBeGreaterThan(1);
    const families = familiesTheRulingNames();
    for (const stage of open) {
      const offered = offeredBy(stage);
      for (const id of families) expect(offered, `${stage.id} offers ${id}`).not.toContain(id);
      expect(offered, stage.id).toEqual(space.ids.filter((id) => !families.includes(id)));
    }
  });

  it('is offered by no scenario at all, listed or opened', () => {
    const families = new Set(familiesTheRulingNames());
    for (const stage of everyScenario()) {
      for (const id of offeredBy(stage)) {
        expect(families.has(id), `${stage.id} offers ${id}`).toBe(false);
      }
    }
  });

  it('refuses a listed stage that authors one, at load, with the reason attached', () => {
    const id = familiesTheRulingNames()[0];
    if (id === undefined) throw new Error('the space declares neither family');
    const broken = rawCopy();
    const stage = broken.stages.find(
      (entry) => (entry['dispatcher'] as { editable: { mode: string } }).editable.mode === 'listed',
    );
    if (stage === undefined) throw new Error('no shipped stage lists its dimensions');
    (stage['dispatcher'] as { editable: { ids: string[] } }).editable.ids.push(id);
    expect(() => parseCampaign(broken, contextOf())).toThrow(/sold in no scenario/);
  });

  it('refuses a purchase that moves one, rather than letting it through for nothing', () => {
    const id = familiesTheRulingNames()[0] ?? '';
    const priced = 'weights.waitTime';
    const admission = admitPurchase(schedule, Number.MAX_SAFE_INTEGER, [priced, id]);
    expect(admission.admitted).toBe(false);
    expect(admission.withheld).toEqual([id]);
    expect(admission.unpriced).toEqual([]);
    expect(admission.reason).toMatch(/sold in no scenario/);
    /* The priced half is still charged, so the refusal is about the withheld dial and not the bill. */
    expect(admission.units).toBe(changePricingDimension(schedule, priced)?.priceUnits);
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
