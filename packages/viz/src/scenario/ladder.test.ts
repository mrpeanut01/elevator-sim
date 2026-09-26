/**
 * **The ordered path's contract** — [§ D649](../../../../DECISIONS.md), GitHub issue #364's
 * missing half.
 *
 * The cases here are the ones that would go red if this reading stopped doing the job it exists
 * for: joining `data/campaign.json` to `data/scenario-survivors.json` so a player meets the path
 * with its measured count beside it, and **never offering a scenario nobody has a way through**.
 *
 * Everything runs on the **shipped** documents. A fixture ladder would prove that a fixture
 * renders, which is `resources.test-helper.ts`'s stated reason and the same one that makes the
 * derivation claim below checkable at all: the point of the module is that no figure is
 * transcribed, and only the real files can show that.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { SCENARIO_LADDER_COPY, ladderOfferCounts, scenarioLadderOf } from './ladder.js';
import type { PublishedGoalRates } from './published.js';
import { survivorSentenceFor, type PublishedSurvivors } from './survivors.js';
import { rungsOf } from './budget.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { parseCampaign, type CampaignContext } from '../campaign/parse.js';
import type { Campaign } from '../campaign/types.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { DATA_DIR } from '../fixtures.test-helper.js';

let config: LoadedConfig;
let published: PublishedGoalRates;
let space: SearchSpace;
let campaign: Campaign;
let survivors: PublishedSurvivors;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  space = collectSearchSpace();
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
    schedule: shippedPriceSchedule(),
  };
  campaign = parseCampaign(
    JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')),
    context,
  );
  survivors = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-survivors.json'), 'utf8'),
  ) as PublishedSurvivors;
}, 300_000);

function ladder() {
  return scenarioLadderOf({ stages: campaign.stages, survivors });
}

describe('the ordered path', () => {
  it('lists every shipped stage, in the campaign’s own order, and leaves none behind', () => {
    /*
     * The non-vacuity case, in both directions. A join that silently dropped a stage would make
     * every case below pass over a shorter list, and the module drops a stage the table holds no
     * row for **on purpose** — so the assertion that it drops none on the shipped files is what
     * says the drop is a regeneration somebody owes rather than a state a player meets.
     */
    const rungs = ladder();
    expect(rungs.map((rung) => rung.id)).toEqual(campaign.stages.map((stage) => stage.id));
    expect(rungs.map((rung) => rung.position)).toEqual(
      campaign.stages.map((_stage, index) => index + 1),
    );
    expect(rungs.length).toBeGreaterThan(1);
  });

  it('offers a scenario exactly when the measurement says there is a way through it', () => {
    /*
     * `docs/38` § 2.1: **zero is not a scenario** unless it declares itself a diagnosis. This is
     * that rule as a derivation over the shipped table rather than as a sentence — and it is
     * checked against the table's own base-rung counts, so a rebalance that opens a held stage
     * moves this case without an edit here.
     */
    for (const rung of ladder()) {
      const scenario = survivors.scenarios.find((row) => row.id === rung.id);
      const base = scenario?.steps.find((step) => step.stepId === null);
      expect(scenario, rung.id).toBeDefined();
      expect(base, rung.id).toBeDefined();
      const shouldOffer = scenario?.diagnosis !== null || (base?.survivors ?? 0) > 0;
      expect(rung.offer, `${rung.id} (survivors ${String(base?.survivors)})`).toBe(
        shouldOffer ? 'offered' : 'held',
      );
    }
  });

  it('gives a held row its reason and no invitation, and an offered row the reverse', () => {
    // GAMEPLAY § 20.12: an unavailable thing is a row with a reason, never a dead control. The
    // two fields are exclusive so a screen cannot draw a press beside a refusal by accident.
    for (const rung of ladder()) {
      if (rung.offer === 'held') {
        expect(rung.heldReason, rung.id).toBeDefined();
        expect(rung.openNote, rung.id).toBeUndefined();
      } else {
        expect(rung.openNote, rung.id).toBeDefined();
        expect(rung.heldReason, rung.id).toBeUndefined();
      }
    }
  });

  it('offers no purchase on the budget line while no screen sells one — § D786', () => {
    /*
     * **The worst thing on the Scenario hub, asserted in both directions.**
     *
     * The line read *"2 wider budgets **can be bought**, in order: Widen to the equipment tier
     * (20 chimes), Widen to the building tier (30 chimes)"* on every row, and shipped in
     * `dist-web`. `data/chime-ledger.json` has no scenario-budget sink and by its own ruling may
     * never have one — it refuses `scenario-budget-step` by name and
     * `core/config/chimeLedger.ts#REFUSED_MODIFIER_KINDS` refuses the modifier kind — so nothing in
     * the product could charge that price. § D227 in both polarities at once, on the first screen
     * of the mode `docs/38` § 2.1 rules first.
     *
     * Two halves, because either alone would pass on a line that is wrong:
     *
     * 1. **No purchase verb and no chime figure.** A price is the only part of that sentence a
     *    player could have acted on, and there is no act.
     * 2. **The refusal is there, and it names who cannot sell rather than who has not bought.**
     *    The deleted mitigation — *"Nothing here has bought a wider budget"* — reads to a first
     *    arrival as *you have not saved up yet*, which is why deleting the promise alone would not
     *    have been enough.
     *
     * It goes red the moment somebody re-adds a price, **and it goes red the moment somebody builds
     * the sink and forgets this line**: clause 2 requires the refusal on every row that has a rung,
     * so a spend surface that ships has to come back here.
     */
    const purchase = /\bcan be bought\b|\bbuy\b|\bbought\b|\bchimes?\b|\bprices?\b|\bcosts?\b/iu;
    let withRungs = 0;
    for (const rung of ladder()) {
      const stage = campaign.stages.find((row) => row.id === rung.id);
      if (stage === undefined) throw new Error(`no stage for ${rung.id}`);
      expect(rung.budgetLine, rung.id).not.toMatch(purchase);
      /*
       * **Every figure on the line, enumerated** — rather than *this price is absent*, which a
       * price that happens to equal the opening units could pass by coincidence. The line draws the
       * units it opens on, and the number of rungs above it when there is more than one; a third
       * figure of any kind is a regression whether or not it is one of today's prices.
       */
      const figures = new Set([...rung.budgetLine.matchAll(/\d+/gu)].map((match) => match[0]));
      const allowed = new Set([String(rungsOf(stage.budget)[0]?.units)]);
      if (stage.budget.steps.length > 1) allowed.add(String(stage.budget.steps.length));
      expect([...figures].sort(), rung.id).toEqual([...allowed].sort());
      if (stage.budget.steps.length === 0) continue;
      withRungs += 1;
      expect(rung.budgetLine, rung.id).toContain(SCENARIO_LADDER_COPY.baseRungNote);
    }
    // The clause above is vacuous if no shipped stage authors a rung; it does, and this says so.
    expect(withRungs).toBeGreaterThan(0);
  });

  it('never calls a held scenario unwinnable, because the dial half is a sample', () => {
    /*
     * The one thing this module may not say, asserted rather than reviewed.
     *
     * `survivors.ts#dialShareInterval` puts 0 of 12 at about a quarter or fewer with 95 %
     * confidence, so a zero is *none of the ways tried got through* and never *there is no way
     * through*. The vocabulary is listed rather than inferred, on
     * `everyday/refusalsAreCurrent.test.ts`'s stated reason: a phrasing this case does not know is
     * a phrasing it does not check, and a looser pattern would go red on correct copy.
     */
    const forbidden = /\bunwinnable\b|\bimpossible\b|\bcannot be (?:cleared|won|beaten)\b|\bno way through\b|\bnothing (?:can|will) (?:clear|get through)\b/iu;
    // A positive control for the pattern, so a regex that stopped matching cannot pass silently.
    expect(forbidden.test('this one is unwinnable as configured')).toBe(true);
    expect(forbidden.test('there is no way through it')).toBe(true);
    expect(forbidden.test('nothing that was tried at this budget got through')).toBe(false);

    for (const rung of ladder()) {
      expect(forbidden.test(rung.heldReason ?? ''), rung.id).toBe(false);
      expect(forbidden.test(rung.waysThrough), rung.id).toBe(false);
    }
    for (const [key, text] of Object.entries(SCENARIO_LADDER_COPY)) {
      expect(forbidden.test(text), key).toBe(false);
    }
  });

  it('draws the count in the table’s own words, at the base rung and no other', () => {
    /*
     * The count is `survivorSentenceFor`'s verbatim — a second sentence about one count is a
     * second authority on it — and it is taken at the rung a player actually has. Nothing in this
     * build spends a chime, so a bought rung's count beside an unbought budget would be a figure
     * the player's own state does not support (`docs/22` non-goal 2).
     */
    for (const rung of ladder()) {
      const scenario = survivors.scenarios.find((row) => row.id === rung.id);
      const base = scenario?.steps.find((step) => step.stepId === null);
      if (scenario === undefined || base === undefined) throw new Error(`no row for ${rung.id}`);
      expect(rung.waysThrough, rung.id).toBe(survivorSentenceFor(scenario, base));
      /* § D1233: the split waits for a clear, and the cleared form is the same count with it. */
      expect(rung.waysThroughCleared, rung.id).toBe(survivorSentenceFor(scenario, base, 'split'));
      // …and it is not any other rung's sentence, which is what makes the clause above bite.
      for (const step of scenario.steps) {
        if (step.stepId === null) continue;
        const other = survivorSentenceFor(scenario, step);
        if (other === rung.waysThrough) continue; // two rungs can coincide; that is not a defect
        expect(rung.waysThrough, rung.id).not.toBe(other);
      }
    }
  });

  it('derives every figure it draws — no count, building or budget is a literal', () => {
    /*
     * The claim the module exists to make good on, checked the only way it can be: each drawn
     * figure is recomputed here from the documents and compared. A transcribed figure would pass
     * today and go stale the first time a rebalance lands, which is the failure this wave was
     * built to avoid — LANE-J is moving `traffic.arrivalRatePctPop5min` in the same wave.
     */
    for (const rung of ladder()) {
      const stage = campaign.stages.find((row) => row.id === rung.id);
      if (stage === undefined) throw new Error(`no stage for ${rung.id}`);
      expect(rung.name).toBe(stage.name);
      expect(rung.teaches).toBe(stage.teaches);
      expect(rung.openingLine).toBe(stage.brief[0]);
      expect(rung.buildingId).toBe(stage.building);
      expect(rung.shape, rung.id).toContain(String(stage.replications));
      expect(rung.budgetLine, rung.id).toContain(String(rungsOf(stage.budget)[0]?.units));
      for (const step of stage.budget.steps) {
        expect(rung.budgetLine, `${rung.id}/${step.id}`).toContain(step.name);
      }
      // The building is named by its id from the stage, so a renamed building cannot be stranded.
      expect(config.buildingsById.has(rung.buildingId), rung.id).toBe(true);
    }
  });

  it('states the run’s length in building time, in a unit the duration is actually in', () => {
    // A stage authored at 950 s must not read "16 min", because no run in it would be 16 minutes
    // long — and the phrase says *in the building* because the stage plays back at a speed the
    // player picks, so a bare duration would be a claim about their evening.
    for (const rung of ladder()) {
      const stage = campaign.stages.find((row) => row.id === rung.id);
      const minutes = (stage?.durationS ?? 0) / 60;
      expect(rung.shape, rung.id).toContain(
        Number.isInteger(minutes) ? `${String(minutes)} min` : `${String(stage?.durationS)} s`,
      );
      expect(rung.shape, rung.id).toContain('in the building');
    }
  });

  it('counts what is offered and what is held, as counts rather than a share', () => {
    // `published.ts`'s rule: a stored rate drifts from its own counts. The register sentence this
    // feeds is the hub's only statement about why a listed row cannot be pressed.
    const rungs = ladder();
    const counts = ladderOfferCounts(rungs);
    expect(counts.listed).toBe(rungs.length);
    expect(counts.offered + counts.held).toBe(counts.listed);
    expect(counts.offered).toBe(rungs.filter((rung) => rung.offer === 'offered').length);
  });

  it('is pure — two readings of one pair of documents agree', () => {
    expect(ladder()).toEqual(ladder());
  });

  it('drops a scenario the table holds no row for, rather than drawing one with no count', () => {
    // The stated behaviour, driven: a scenario offered with no measured difficulty is what
    // `docs/38` § 2.1's whole definition is against. Checked on a clone so the shipped table is
    // untouched — `survivorBands.test.ts`'s discipline.
    const thinned: PublishedSurvivors = {
      ...survivors,
      scenarios: survivors.scenarios.slice(1),
    };
    const rungs = scenarioLadderOf({ stages: campaign.stages, survivors: thinned });
    expect(rungs.map((rung) => rung.id)).not.toContain(campaign.stages[0]?.id);
    expect(rungs.length).toBe(campaign.stages.length - 1);
    // …and the positions still count the path rather than the survivors, so a dropped row does not
    // silently renumber the ones after it into a different ladder.
    expect(rungs[0]?.position).toBe(2);
  });
});

describe('a stage’s par is the cheapest named way through the check prices — § D1234', () => {
  it('takes the minimum over the base rung’s priced names, and has none where nothing is priced', () => {
    const answered = survivors.scenarios.find(
      (scenario) => (scenario.steps.find((step) => step.stepId === null)?.survivorNames.length ?? 0) > 1,
    );
    if (answered === undefined) throw new Error('no stage names two ways through');
    const names = answered.steps.find((step) => step.stepId === null)!.survivorNames;
    /* A price per name, by position, so the cheapest is the last name and the first is left unpriced. */
    const price = new Map(names.map((name, index) => [name, index === 0 ? undefined : 10 - index]));
    const rungs = scenarioLadderOf({
      stages: campaign.stages,
      survivors,
      unitsOf: (stageId, name) => (stageId === answered.id ? price.get(name) : undefined),
    });
    const rung = rungs.find((entry) => entry.id === answered.id)!;
    expect(rung.parUnits).toBe(10 - (names.length - 1));
    for (const other of rungs.filter((entry) => entry.id !== answered.id)) expect(other.parUnits, other.id).toBeUndefined();
    /* No pricing passed, no par — the hub then draws no mark. */
    for (const entry of ladder()) expect(entry.parUnits, entry.id).toBeUndefined();
  });
});

describe('the stage page is counted, and a held stage says which half stopped it — § D1183', () => {
  it('offers the four stages the page reaches and holds the three it does not, on the shipped table', () => {
    /*
     * The swarm's Q3 ruling as a reading of the regenerated table: S3 pressed the page's own choices
     * and found holdout-confirmed ways through stages 2, 6, 7 and 8, which the dial sample had
     * missed. Named here because the ruling named them; the rule itself is the derivation above.
     */
    const offer = new Map(ladder().map((rung) => [rung.id, rung.offer]));
    for (const id of ['stage-2-morning-rush', 'stage-6-the-tall-one', 'stage-7-prove-it', 'stage-8-the-headline-address']) {
      expect(offer.get(id), id).toBe('offered');
      const base = survivors.scenarios.find((row) => row.id === id)?.steps.find((step) => step.stepId === null);
      expect(base?.page.survivors, `${id}: its way through is on the page`).toBeGreaterThan(0);
    }
    for (const id of ['stage-4-two-banks', 'stage-9-both-ways-at-once', 'stage-10-the-bed-and-the-visitor']) {
      expect(offer.get(id), id).toBe('held');
    }
  });

  it('holds stage 4 on the held-back crowds and stages 9 and 10 on their own, in words, from the counts', () => {
    const reason = new Map(ladder().map((rung) => [rung.id, rung.heldReason ?? '']));
    expect(reason.get('stage-4-two-banks')).toMatch(/^Held back: \d+ of the \d+ ways tried at this budget met every goal on the stage’s own crowds, and none of them met every goal again on the crowds held back\./u);
    for (const id of ['stage-9-both-ways-at-once', 'stage-10-the-bed-and-the-visitor']) {
      expect(reason.get(id), id).toMatch(/^Held back: None of the \d+ ways tried at this budget met every goal even on the stage’s own crowds\./u);
    }
  });

  it('reads the reason off metOnTuning, in both arms, on a synthetic table', () => {
    const id = campaign.stages[0]!.id;
    const withBase = (metOnTuning: number): PublishedSurvivors => ({
      ...survivors,
      scenarios: survivors.scenarios.map((row) =>
        row.id !== id
          ? row
          : {
              ...row,
              diagnosis: null,
              steps: row.steps.map((step) =>
                step.stepId !== null
                  ? step
                  : {
                      ...step,
                      survivors: 0,
                      survivorNames: [],
                      metOnTuning,
                      dropdown: { ...step.dropdown, survivors: 0 },
                      page: { ...step.page, survivors: 0 },
                      dials: { ...step.dials, survivors: 0 },
                    },
              ),
            },
      ),
    });
    const read = (metOnTuning: number) =>
      scenarioLadderOf({ stages: campaign.stages, survivors: withBase(metOnTuning) }).find((rung) => rung.id === id)!;
    expect(read(3).offer).toBe('held');
    expect(read(3).heldReason).toContain('3 of the ');
    expect(read(3).heldReason).toContain('none of them met every goal again on the crowds held back');
    expect(read(0).heldReason).toContain('met every goal even on the stage’s own crowds');
    expect(read(0).heldReason).toContain(SCENARIO_LADDER_COPY.heldBody);
  });
});
