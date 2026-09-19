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
        expect(rung.budgetLine, `${rung.id}/${step.id}`).toContain(String(step.chimes));
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
