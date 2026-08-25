/**
 * The campaign arm of `docs/33-difficulty-curve.md` § 6 — **the half of it a table can answer.**
 *
 * ## What is here, and what deliberately is not
 *
 * § 6.1 specifies one file at this path enforcing DC-1, DC-2, DC-2b and DC-3, and § 6.4 measures
 * that instrument at **198 s** over 7 700 simulations. This file is not that instrument. It is the
 * clause of DC-1 that needs no simulation at all, built now because it is the clause the campaign
 * currently breaches:
 *
 * > **DC-1.** For every stage `s`: `∃ m ∈ moves(s)` such that at least one **non-comparative** goal
 * > is **not met**.
 *
 * A stage's count goals are judged against *the shipped setting's own measured count on the same
 * seeds* (`judge.ts`, and `data/scenario-goals.json` is where the count comes from). So a goal whose
 * published rate is `constant-pass` cannot ship at all — `parse.ts`'s R12 check refuses it — and a
 * stage that declares **no** non-comparative goal has nothing for any admitted profile to fail. That
 * is DC-1 breached, and it is decidable from two files on disk.
 *
 * The implication runs one way and the docstring says so rather than letting a reader over-read it:
 *
 * - **A stage with no variable non-comparative goal breaches DC-1.** Necessary, and what this file
 *   checks.
 * - **A stage with one does not thereby satisfy DC-1.** Some admitted profile still has to score
 *   *below* the published count, and only a batch answers that. Stages 8, 9 and 10 are exactly that
 *   case — each declares a variable `answer-the-demand` and each admits no move that could miss it
 *   (§ 3.1's DC-2b column). **They are not registered below**, because this check is not the one
 *   they fail.
 *
 * So: red here is a DC-1 breach; green here is silence about DC-1, and the § 6 sweep is what breaks
 * it.
 *
 * ## Why the register, and why it is checked in both directions
 *
 * § 6.3 rows 5 and 6, and `honesty.test.ts`'s precedent under it: *"a register that can only grow is
 * decoration."* A stage in {@link DC1_UNFAILABLE} must genuinely have no variable non-comparative
 * goal, and a stage that has one may not be in it. The day somebody gives stage 1 a failable goal,
 * the second case reds and the entry is deleted on the commit that made it stop reproducing.
 *
 * ## Nothing here is a literal
 *
 * The stage list is `data/campaign.json`, the rates are `data/scenario-goals.json`, and *which kinds
 * are non-comparative* is `scenario/goals.ts#isPerReplicationGoal` rather than five names written
 * down here — the same reason `campaign.test.ts` derives its subject stage instead of naming it. An
 * eighth goal kind, a regenerated table or a stage added to the campaign all reach this check
 * without an edit, which is the only way a curve rule stays a measurement.
 *
 * A decision number is owed for the register's one entry; the argument is in
 * {@link DC1_UNFAILABLE}'s own comment and the measurement is in `docs/33` § 3.3 C1.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { parseCampaign, type CampaignContext } from './parse.js';
import type { Campaign, CampaignStage } from './types.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { isPerReplicationGoal, type GoalKind } from '../scenario/goals.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';
import { DATA_DIR } from '../fixtures.test-helper.js';

/**
 * Stages with no non-comparative goal a player could miss, each with the reason it has none.
 *
 * **One entry, and it is a measurement rather than an opinion.** GitHub issue #255 gave the campaign
 * path an honest full-run window ([§ D355](../../../../DECISIONS.md)); over that window every one of
 * stage 1's five per-run kinds measures `50/50, 50/50`, R12 makes all five facts for the briefing,
 * and `data/campaign.json` declares `beat-the-baseline` alone there.
 *
 * **What was swept before this entry was written**, on `garden-apartments` at the stage's own 900 s
 * horizon, both seed sets, 50 replications each — because a register entry that nobody tried to
 * avoid is an excuse:
 *
 * - **Demand.** Every level the residential profile declares — `min` 3 through `max` 7, and the
 *   `typical` 5 the stage runs at — leaves all five kinds `constant-pass` on both seed sets under
 *   `collective`, except `long-waits-under`, which reaches 48 or 49 of 50 on *one* set and 50 of 50
 *   on the other. That is `not-shippable`, not a goal. The building's own file refuses the rest in
 *   capitals: the menu separates at 20 %, *"three times the residential profile's own declared
 *   maximum of 7 %"*, and DC-R1 forbids exceeding it.
 * - **Demand shape.** The PM inversion the profile's own `$comment` declares, a pure up-peak and a
 *   flattened baseline all leave `collective` at 49 or 50 of 50 on both sets. A raised geometric
 *   group mean of 3 is the one cell that is variable on both — 49 of 50 and 47 of 50 — and it is
 *   refused twice over: `data/traffic-profiles.json` declares this profile's mean as 1.8 with no
 *   range, so 3 is invented traffic data, and 49 of 50 is a goal missed on one run in fifty.
 * - **Dispatcher.** All thirteen shipped profiles were measured as the stage's baseline.
 *   `nearest-car` is the only one whose `long-waits-under` is variable on both sets (48 of 50 and 46
 *   of 50) — **and making it the baseline removes the failure rather than creating one**, because
 *   DC-1 needs an admitted profile scoring *below* the published count and nothing on this building
 *   is worse than `nearest-car`.
 * - **Horizon.** 600 s makes `collective` variable on both sets at 49 and 49. It is refused rather
 *   than taken: a goal that becomes failable because the run got shorter is the defect § D355
 *   closed, wearing a different length.
 * - **Parking.** The axis the building's own `$comment` names — *"parking policy dominates here"* —
 *   and the one the four above did not touch. Swept in `docs/33` § 3.3c over every declared value,
 *   crossed with the reposition deadband, the energy price and every legal demand level. It reaches
 *   the run (all five values move the legs of this stage's own replication) and it moves **only**
 *   `long-waits-under`, exactly as the four other kinds' 50 | 50 predicted. At the stage's own
 *   demand under `collective` the one cell variable on both sets is a park at the **top floor**,
 *   49 | 49 — the 98 % shape refused two paragraphs up — and reaching it at all needs the parking
 *   value on the **baseline** arm, which no field of `data/campaign.json` can author and which
 *   `dev/campaignPanel.ts` would then be admitting profiles against the wrong setting. Measured
 *   shut on the margin **and** unreachable from here; the axis is not exhausted, but this lane's
 *   half of it is.
 *
 * **What would move it is fabric, and `docs/33` § 3.3 C1 predicted that before it was measured** —
 * *"`garden-apartments` has a hard rate ceiling … so its pressure has to come from fabric too."*
 * Measured: one car instead of two, at the building's own declared demand and with no demand change
 * at all, puts `collective`'s `long-waits-under (≤ 10 %)` at **31 of 50 and 32 of 50** — inside
 * DC-4's `[1/3, 2/3]` band on both seed sets. That edit is in `data/buildings/garden-apartments.json`
 * and belongs to the campaign rebalance (#234), not here.
 */
const DC1_UNFAILABLE: ReadonlyMap<string, string> = new Map([
  [
    'stage-1-first-call',
    'Every count goal is 50 of 50 on both seed sets under the shipped setting, at every demand ' +
      'level the residential profile declares. No demand, dispatcher or parking change inside ' +
      'DC-R1 moves one at a margin worth asking a player about; fabric would. See docs/33 ' +
      '§ 3.3 C1 and § 3.3c.',
  ],
]);

let published: PublishedGoalRates;
let campaign: Campaign;

beforeAll(async () => {
  const config: LoadedConfig = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  const raw: unknown = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8'));
  const context: CampaignContext = {
    published,
    dimensionIds: collectSearchSpace().ids,
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
  };
  campaign = parseCampaign(raw, context);
}, 120_000);

/**
 * The non-comparative goals this stage declares whose published rate is `variable` on **both** seed
 * sets — the goals a player could be told they missed.
 *
 * Both halves are required for the reason `scenario/measure.ts` withholds a goal whose class differs
 * between the sets: a goal that is live on the seeds the player tunes against and constant on the
 * ones they are validated over is half a goal, and `judge.ts` reads the holdout half against the
 * holdout count.
 */
function failableGoalsOf(stage: CampaignStage, table: PublishedGoalRates): readonly GoalKind[] {
  const scenario: PublishedScenario | undefined = table.scenarios.find(
    (entry) => entry.id === stage.id,
  );
  if (scenario === undefined) return [];
  return stage.goals
    .filter((goal) => isPerReplicationGoal(goal.kind))
    .filter((goal) => {
      const record = scenario.goals.find((entry) => entry.kind === goal.kind);
      return (
        record?.tuning?.rateClass === 'variable' && record.holdout?.rateClass === 'variable'
      );
    })
    .map((goal) => goal.kind);
}

/** `stage 1 (garden-apartments)` — the form every failure sentence below names a stage in. */
function where(stage: CampaignStage): string {
  return `${stage.id} (${stage.building})`;
}

describe('DC-1, as far as the published table can decide it', () => {
  it('gives every stage a non-comparative goal that is variable on both seed sets', () => {
    const unfailable = campaign.stages
      .filter((stage) => failableGoalsOf(stage, published).length === 0)
      .filter((stage) => !DC1_UNFAILABLE.has(stage.id))
      .map(
        (stage) =>
          `${where(stage)}: declares no non-comparative goal that is variable on both seed sets, ` +
          'so there is nothing here for any admitted profile to fail — docs/33 DC-1. Give it one ' +
          'from its measured bucket, or register it with the reason it has none.',
      );
    expect(unfailable).toEqual([]);
  });

  it('keeps the register honest in the other direction', () => {
    const wrongly = campaign.stages
      .filter((stage) => DC1_UNFAILABLE.has(stage.id))
      .filter((stage) => failableGoalsOf(stage, published).length > 0)
      .map(
        (stage) =>
          `${where(stage)}: is registered as having no failable goal and declares ` +
          `${failableGoalsOf(stage, published).join(', ')}. Delete the entry on the commit that ` +
          'made it stop reproducing — a register that can only grow is decoration.',
      );
    expect(wrongly).toEqual([]);
  });

  it('names only stages the campaign ships', () => {
    const shipped = new Set(campaign.stages.map((stage) => stage.id));
    expect([...DC1_UNFAILABLE.keys()].filter((id) => !shipped.has(id))).toEqual([]);
  });

  /*
   * § 6.3 row 12 — the guard on the guard. An empty campaign, a table whose ids stopped matching
   * the campaign's, or a `goals` bucket that lost its rates would make every case above pass by
   * iterating nothing, which is the shape `citations.test.ts` and `moduleTree.test.ts` both carry a
   * case against.
   */
  it('found something to check', () => {
    expect(campaign.stages.length).toBeGreaterThan(0);
    const withGoals = campaign.stages.filter(
      (stage) => failableGoalsOf(stage, published).length > 0,
    );
    expect(withGoals.length).toBeGreaterThan(0);
    expect(withGoals.length).toBe(campaign.stages.length - DC1_UNFAILABLE.size);
  });
});

/**
 * The negative controls, applied to the **real** loaded table rather than to a fixture — for
 * `goalRates.test.ts`'s stated reason: a check exercised only against a hand-built object proves
 * that the hand-built object is well formed.
 */
describe('the derivation reads the rates it claims to read', () => {
  function withMutatedTable(change: (table: PublishedGoalRates) => void): PublishedGoalRates {
    const clone = JSON.parse(JSON.stringify(published)) as PublishedGoalRates;
    change(clone);
    return clone;
  }

  function subject(): CampaignStage {
    const found = campaign.stages.find((stage) => failableGoalsOf(stage, published).length > 0);
    if (found === undefined) throw new Error('no shipped stage carries a failable goal');
    return found;
  }

  it('stops seeing a goal whose tuning class becomes a constant', () => {
    const stage = subject();
    const kind = failableGoalsOf(stage, published)[0];
    const mutated = withMutatedTable((table) => {
      const scenario = table.scenarios.find((entry) => entry.id === stage.id);
      const record = scenario?.goals.find((entry) => entry.kind === kind);
      if (record?.tuning === undefined || record.tuning === null) {
        throw new Error('the subject goal has no tuning rate to mutate');
      }
      (record.tuning as { rateClass: string }).rateClass = 'constant-pass';
    });
    expect(failableGoalsOf(stage, mutated)).not.toContain(kind);
  });

  it('stops seeing a goal whose holdout class becomes a constant', () => {
    const stage = subject();
    const kind = failableGoalsOf(stage, published)[0];
    const mutated = withMutatedTable((table) => {
      const scenario = table.scenarios.find((entry) => entry.id === stage.id);
      const record = scenario?.goals.find((entry) => entry.kind === kind);
      if (record?.holdout === undefined || record.holdout === null) {
        throw new Error('the subject goal has no holdout rate to mutate');
      }
      (record.holdout as { rateClass: string }).rateClass = 'constant-pass';
    });
    expect(failableGoalsOf(stage, mutated)).not.toContain(kind);
  });

  it('never counts the comparison goal, however its record reads', () => {
    /*
     * `beat-the-baseline` is unmet on the control arm at all ten stages by construction — § D161's
     * *"standing still clears nothing"* — so a DC-1 written over any goal is satisfied everywhere by
     * the player changing nothing. `docs/33` § 2.2 calls the word *non-comparative* the whole of the
     * rule's teeth. This case is that word, mechanised: even a table that published a variable rate
     * for it may not make a stage look failable.
     */
    const registered = campaign.stages.find((stage) => DC1_UNFAILABLE.has(stage.id));
    if (registered === undefined) throw new Error('the register is empty; repoint this case');
    const mutated = withMutatedTable((table) => {
      const scenario = table.scenarios.find((entry) => entry.id === registered.id);
      const record = scenario?.goals.find((entry) => entry.kind === 'beat-the-baseline');
      if (record === undefined) throw new Error('the registered stage declares no comparison goal');
      const rate = { n: 50, passes: 30, fails: 20, unmeasured: 0, rateClass: 'variable' };
      (record as { tuning: unknown; holdout: unknown }).tuning = rate;
      (record as { tuning: unknown; holdout: unknown }).holdout = rate;
    });
    expect(failableGoalsOf(registered, mutated)).toEqual([]);
  });
});
