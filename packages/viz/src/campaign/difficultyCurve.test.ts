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
 * down here — the same reason `countGoalStage.test.ts` derives its subject stage instead of naming it.
 * An
 * eighth goal kind, a regenerated table or a stage added to the campaign all reach this check
 * without an edit, which is the only way a curve rule stays a measurement.
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405; the argument is in {@link DC1_UNFAILABLE}'s own
 * comment and the measurement is in `docs/33` § 3.3 C1. The refusal that keeps stage 1 as it is
 * is § D409.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { useCampaignFixture } from './campaign.test-helper.js';
import { admitProfile } from './dimensions.js';
import { editableIdsOf, parseCampaign, type CampaignContext } from './parse.js';
import type { Campaign, CampaignStage } from './types.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { rungsOf } from '../scenario/budget.js';
import { isPerReplicationGoal, type GoalKind } from '../scenario/goals.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';
import { SCENARIO_SURVIVORS_PATH } from '../scenario/regenerateSurvivors.test-helper.js';
import { dropdownConfigurationsOf } from '../scenario/survivorSpace.js';
import type { PublishedSurvivors } from '../scenario/survivors.js';
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
    /* #365: a budget is checked against the shipped ladder, never against a fixture. */
    schedule: shippedPriceSchedule(),
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

/* -------------------------------------------------------------------------- *
 * DC-2b, always-on, and DC-2, deep — GitHub issue #234, docs/33 § 6, § D520
 * -------------------------------------------------------------------------- */

/**
 * § 6's campaign arm, the two dropdown rules. Both iterate `parseCampaign(data/campaign.json).stages`
 * × `data/dispatcher-profiles.json` through the shipped `admitProfile`, and neither list is written
 * down (§ 6.2). DC-2b is pure and always on; DC-2 plays every admitted cell through the shipped
 * `runStageToVerdict` and sits behind `ELEVATOR_SIM_DEEP=1` — § 6.4 measured the arm at 198 s on one
 * worker, which is far too slow for the suite somebody runs on every save and inside a CI job.
 *
 * ## The registers, and why each is checked in both directions
 *
 * `honesty.test.ts`'s `OUTSTANDING` precedent, § 6.3 rows 5 and 6: a stage in a register must still
 * breach, and a stage that breaches must be in it. {@link DC2B_SHORT} is § 3.1's DC-2b column — the
 * three stages whose `editable` list admits fewer than two profiles other than their own baseline.
 * {@link DROPDOWN_CLEARS} is the deep tier's measurement: for each stage, exactly the shipped
 * profiles that meet every bar on the tuning seeds from the dropdown, `metOnTuningSeeds` and not
 * `cleared`, because DC-2 asks whether the dropdown can meet the bars at all (§ 2.3). A stage with no
 * entry must have none; a fourth clearer on a registered stage is red; a registered clearer that
 * stops clearing is red, and the entry is deleted on the commit that made it stop. So the register
 * is #234's *fails the build* clause with the measured breaches named rather than hidden: the
 * rebalance (docs/33 C2, by demand or fabric, never a bar) empties it row by row, and nothing can
 * quietly reintroduce a clear. The pinned sets are stated as measured, with the tree, in § D520.
 *
 * A third check, always on and simulating nothing, reconciles {@link DROPDOWN_CLEARS} with the
 * dropdown survivors `data/scenario-survivors.json` publishes — the owner's ruling of 2026-09-10,
 * [§ D556](../../../../DECISIONS.md). The two are different readings of the same runs, and
 * {@link dropdownReconciliationIssues} holds the relationship between them in both directions.
 */
const fixture = useCampaignFixture();

/** § 3.1's DC-2b column, measured 2026-09-06: two admit only their own baseline, one admits one other. */
const DC2B_SHORT: ReadonlySet<string> = new Set([
  'stage-8-the-headline-address',
  'stage-9-both-ways-at-once',
  'stage-10-the-bed-and-the-visitor',
]);

/**
 * DC-2's measured breaches — the shipped profiles that meet every bar on the tuning seeds, per stage,
 * measured 2026-09-06 on the integrated tree by the deep tier below (`ELEVATOR_SIM_DEEP=1`): 45
 * admitted cells over the ten stages, 217 s on one worker of a four-core box. A stage absent here had
 * none. The three are `docs/33` § 3.1's three, and each is one profile: `fairness-first` on stage 3,
 * `eta` on stage 5, `destination-panel` on stage 7. Emptying this table is C2's rebalance, by demand
 * or fabric and never by a bar (DC-R1); a row leaves on the commit that makes it stop reproducing.
 * See § D520 for the run. Re-run 2026-09-11 on `f691a97a`: the same three, over the same 45 cells.
 *
 * ## It is not the survivor table's dropdown column read another way
 *
 * `data/scenario-survivors.json` also names the shipped profiles that get through a stage from the
 * dropdown, and on stages 1, 5 and 7 it names different ones. **Both play a cell through the same
 * `runStageToVerdict`** — the stage's two seed sets at fifty replications each, its own 900 s, the
 * same judge, and no purchase applied to the run — so a profile both play gets one verdict, and every
 * profile either side names is affordable at its stage's base rung. Suppression gates neither: the
 * table counts it beside the verdict and this register does not read it. They differ in exactly two
 * places, measured on `f691a97a` by playing every shipped profile on stages 5 and 7 and reading each
 * verdict both ways ([§ D556](../../../../DECISIONS.md)):
 *
 * 1. **The reading.** This register is `metOnTuningSeeds`, for `docs/33` § 2.3's reason; the table
 *    counts `cleared`, which needs the holdout batch as well. `eta` on stage 5 and
 *    `destination-panel` on stage 7 are here and not there — {@link DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT}.
 * 2. **The population.** This register plays only what the stage's own `editable` list admits
 *    (`admitProfile`); the table plays every shipped profile that runs a different system and that
 *    the rung affords (`survivorSpace.ts#dropdownConfigurationsOf`, which does not apply the list, on
 *    § D525 clause 2's ruling). `predictive-balanced` on stage 5 and `zoned-uppeak` on stage 1 are
 *    there and not here — {@link DROPDOWN_SURVIVORS_OUTSIDE_EDITABLE}.
 *
 * Stage 3 is the one stage both name, and the only row that needs neither register.
 */
const DROPDOWN_CLEARS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'stage-3-overwhelmed': ['fairness-first'],
  'stage-5-credentials': ['eta'],
  'stage-7-prove-it': ['destination-panel'],
});

/**
 * The entries of {@link DROPDOWN_CLEARS} the **holdout** batch refuses: they meet every bar on the
 * tuning seeds and not on the stage's `holdoutSeeds`, so `cleared` is `false` and the survivor table
 * does not count them. Pinned by the same deep tier, which reads it off the holdout batch
 * `runStageToVerdict` already plays for every cell that met on the tuning seeds, so this half costs no
 * simulation. Measured 2026-09-11 on `f691a97a`:
 *
 * - `eta` on stage 5 meets all five goals on `tuning-20260730` and misses `deliver-everyone`,
 *   `no-divergence` and `answer-the-demand` on `holdout-20260731` — `stageFiveClears.test.ts`'s
 *   finding, reached here by a different route.
 * - `destination-panel` on stage 7 meets both goals on the tuning seeds and misses
 *   `beat-the-baseline` on the holdout.
 *
 * **A holdout refusal is still a DC-2 breach**, and this register takes neither row out of
 * {@link DROPDOWN_CLEARS}: DC-2 asks whether the dropdown can meet a stage's bars at all (`docs/33`
 * § 2.3). What it records is why the survivor table, which asks the stronger question, does not name
 * them. A row leaves when its profile stops meeting on the tuning seeds, or starts holding on the
 * holdout too — and then the table has to count it, which the always-on case turns red until it does.
 */
const DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'stage-5-credentials': ['eta'],
  'stage-7-prove-it': ['destination-panel'],
});

/**
 * Profiles the survivor table counts as a way through a stage from the dropdown, at the **base** rung,
 * that the stage's own `editable` list refuses — so DC-2 never plays them and {@link DROPDOWN_CLEARS}
 * cannot name them, however they score. `admitProfile` still applies the list and
 * `dev/campaignPanel.ts` still admits through it; `survivorSpace.ts#dropdownConfigurationsOf` does
 * not, and GitHub issue #233 re-authors the lists. Read off the table measured on `4159520`, and
 * reproduced for stage 5 on `f691a97a` 2026-09-11:
 *
 * - `predictive-balanced` on stage 5 — **position five, so a § D528 clause 2 breach that
 *   {@link DROPDOWN_CLEARS} cannot hold**: it meets every bar on both seed sets, and stage 5's
 *   six-entry list does not open the dimensions it moves. It is the one way through stage 5, and the
 *   disagreement the owner's ruling of 2026-09-10 names.
 * - `zoned-uppeak` on stage 1 — position one, exempt from clause 2, and registered because the
 *   relationship is checked over every stage rather than from position three.
 *
 * A row leaves when the table stops counting it, or when the stage's list starts admitting it — and
 * then DC-2 plays it and it belongs in {@link DROPDOWN_CLEARS}.
 */
const DROPDOWN_SURVIVORS_OUTSIDE_EDITABLE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'stage-1-first-call': ['zoned-uppeak'],
  'stage-5-credentials': ['predictive-balanced'],
});

/** A register with each stage's profiles sorted, so two registers compare as sets. */
function sortedRegister(
  register: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
  return Object.fromEntries(Object.entries(register).map(([id, ids]) => [id, [...ids].sort()]));
}

/** The shipped profiles a stage admits from its dropdown, its own baseline excluded. */
function admittedProfilesOf(stage: CampaignStage): readonly string[] {
  const baseline = fixture.requireProfile(stage.dispatcher.startingProfileId);
  const editable = editableIdsOf(stage.dispatcher.editable, fixture.space.ids, fixture.context.schedule);
  return fixture.config.dispatcherProfiles.profiles
    .filter((candidate) => candidate.id !== baseline.id)
    .filter((candidate) => admitProfile(fixture.space, baseline, candidate, editable).admissible)
    .map((candidate) => candidate.id);
}

describe('DC-2b — a stage admits at least two profiles other than its own baseline, or is registered short', () => {
  it('holds on every unregistered stage, and every registered stage is still short', () => {
    const shortStages: string[] = [];
    let admittedCells = 0;
    for (const stage of fixture.campaign.stages) {
      const admitted = admittedProfilesOf(stage);
      admittedCells += admitted.length;
      if (admitted.length < 2) shortStages.push(stage.id);
    }
    /* § 6.3 row 12: the sweep found something to check. */
    expect(fixture.campaign.stages.length).toBeGreaterThan(0);
    expect(admittedCells).toBeGreaterThan(0);
    expect(new Set(shortStages)).toEqual(DC2B_SHORT);
  });

  it('names only stages the campaign ships', () => {
    const ids = new Set(fixture.campaign.stages.map((stage) => stage.id));
    for (const id of DC2B_SHORT) expect(ids.has(id), id).toBe(true);
    for (const id of Object.keys(DROPDOWN_CLEARS)) expect(ids.has(id), id).toBe(true);
    for (const id of Object.keys(DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT)) expect(ids.has(id), id).toBe(true);
    for (const id of Object.keys(DROPDOWN_SURVIVORS_OUTSIDE_EDITABLE)) expect(ids.has(id), id).toBe(true);
  });
});

/** The three registers {@link dropdownReconciliationIssues} reads, passed in so a control can hand it copies. */
interface DropdownRegisters {
  readonly clears: Readonly<Record<string, readonly string[]>>;
  readonly refusedOnHoldout: Readonly<Record<string, readonly string[]>>;
  readonly outsideEditable: Readonly<Record<string, readonly string[]>>;
}

/** One stage's two populations: what DC-2 plays, and what the survivor table's base rung plays. */
interface DropdownPopulations {
  readonly stageId: string;
  /** {@link admittedProfilesOf}: `admitProfile` over the stage's `editable` list, baseline excluded. */
  readonly admitted: ReadonlySet<string>;
  /** `dropdownConfigurationsOf`, affordable at the stage's starting units — the base rung's census. */
  readonly census: ReadonlySet<string>;
}

/** Every shipped stage's two populations, through the shipped admission and the shipped price. */
function dropdownPopulationsOf(): readonly DropdownPopulations[] {
  const profiles = fixture.config.dispatcherProfiles.profiles;
  return fixture.campaign.stages.map((stage) => {
    const baseline = fixture.requireProfile(stage.dispatcher.startingProfileId);
    const base = rungsOf(stage.budget).find((rung) => rung.stepId === null);
    if (base === undefined) throw new Error(`${stage.id} declares no base rung`);
    const census = dropdownConfigurationsOf(fixture.space, fixture.context.schedule, baseline, profiles)
      .filter((entry) => entry.units <= base.units)
      .map((entry) => entry.profileId);
    return { stageId: stage.id, admitted: new Set(admittedProfilesOf(stage)), census: new Set(census) };
  });
}

/**
 * **The relationship between the DC-2 registers and the survivor table's base-rung dropdown
 * survivors**, returned as disagreements. Pure, and exact rather than approximate: both are verdicts
 * of the same runs, and `judge.ts` defines `cleared` as `metOnTuningSeeds` and the holdout. So, per
 * stage:
 *
 * ```
 * table = ((DROPDOWN_CLEARS − REFUSED_ON_HOLDOUT) ∩ census) ∪ OUTSIDE_EDITABLE
 * REFUSED_ON_HOLDOUT ⊆ DROPDOWN_CLEARS ⊆ admitted,  and  OUTSIDE_EDITABLE ∩ admitted = ∅
 * ```
 *
 * A profile the table counts that the registers do not account for is red, and so is one the
 * registers account for that the table does not count. The base rung only, because that is the rung
 * the survivor band judges. The census intersection is not a third difference: a registered clear the
 * base rung cannot afford is not a way through there, so its absence from the table says nothing.
 */
function dropdownReconciliationIssues(
  table: PublishedSurvivors,
  populations: readonly DropdownPopulations[],
  profileIds: ReadonlySet<string>,
  registers: DropdownRegisters,
): readonly string[] {
  const issues: string[] = [];
  const listed = (
    register: Readonly<Record<string, readonly string[]>>,
    stageId: string,
  ): ReadonlySet<string> => new Set(register[stageId] ?? []);
  for (const { stageId, admitted, census } of populations) {
    const base = table.scenarios
      .find((scenario) => scenario.id === stageId)
      ?.steps.find((step) => step.stepId === null);
    if (base === undefined) {
      issues.push(`${stageId}: data/scenario-survivors.json publishes no base rung for this stage`);
      continue;
    }
    const counted = new Set(base.survivorNames.filter((name) => profileIds.has(name)));
    if (counted.size !== base.dropdown.survivors) {
      issues.push(
        `${stageId}: the table names ${String(counted.size)} shipped profiles among its base-rung ` +
          `survivors and counts ${String(base.dropdown.survivors)} dropdown survivors`,
      );
    }
    const clears = listed(registers.clears, stageId);
    const refused = listed(registers.refusedOnHoldout, stageId);
    const outside = listed(registers.outsideEditable, stageId);
    for (const id of clears) {
      if (admitted.has(id)) continue;
      issues.push(
        `${stageId}: DROPDOWN_CLEARS names ${id}, which this stage's editable list does not admit, so ` +
          'DC-2 cannot have played it',
      );
    }
    for (const id of refused) {
      if (clears.has(id)) continue;
      issues.push(
        `${stageId}: DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT names ${id}, which DROPDOWN_CLEARS does not — ` +
          'only a profile that met every bar on the tuning seeds can be refused on the holdout',
      );
    }
    for (const id of outside) {
      if (!admitted.has(id)) continue;
      issues.push(
        `${stageId}: DROPDOWN_SURVIVORS_OUTSIDE_EDITABLE names ${id}, and this stage's editable list ` +
          'admits it — DC-2 plays it, so it belongs in DROPDOWN_CLEARS',
      );
    }
    for (const id of counted) {
      if (outside.has(id)) continue;
      if (!admitted.has(id)) {
        issues.push(
          `${stageId}: the table counts ${id} as a way through from the dropdown, and this stage's ` +
            'editable list refuses it, so DC-2 never plays it — name it in ' +
            'DROPDOWN_SURVIVORS_OUTSIDE_EDITABLE, or find what moved',
        );
      } else if (!clears.has(id)) {
        issues.push(
          `${stageId}: the table counts ${id} as clearing both seed sets, and DROPDOWN_CLEARS, which ` +
            'plays it, does not register it meeting every bar on the tuning seeds — a clear implies ' +
            'that, so one of the two measurements has moved',
        );
      } else if (refused.has(id)) {
        issues.push(
          `${stageId}: the table counts ${id} as holding on the holdout, and ` +
            'DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT registers the holdout refusing it',
        );
      } else if (!census.has(id)) {
        issues.push(
          `${stageId}: the table counts ${id} at the base rung, and the shipped price schedule does ` +
            'not afford it there',
        );
      }
    }
    for (const id of clears) {
      if (refused.has(id) || !census.has(id) || counted.has(id)) continue;
      issues.push(
        `${stageId}: DROPDOWN_CLEARS registers ${id} meeting every bar with no holdout refusal, the ` +
          'base rung affords it, and the table does not count it — if the holdout refuses it, ' +
          'register that in DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT; otherwise one of the two ' +
          'measurements has moved',
      );
    }
    for (const id of outside) {
      if (admitted.has(id) || counted.has(id)) continue;
      issues.push(
        `${stageId}: DROPDOWN_SURVIVORS_OUTSIDE_EDITABLE names ${id}, and the table's base rung ` +
          'does not count it',
      );
    }
  }
  return issues;
}

describe('DROPDOWN_CLEARS and the survivor table — two readings of the dropdown, every difference named', () => {
  let table: PublishedSurvivors;
  beforeAll(async () => {
    table = JSON.parse(await readFile(SCENARIO_SURVIVORS_PATH, 'utf8')) as PublishedSurvivors;
  });

  const profileIds = (): ReadonlySet<string> =>
    new Set(fixture.config.dispatcherProfiles.profiles.map((profile) => profile.id));

  it('agree in both directions once the holdout and the editable list are accounted for', () => {
    const populations = dropdownPopulationsOf();
    /* § 6.3 row 12: something on both sides to compare. */
    expect(populations.some((row) => row.admitted.size > 0 && row.census.size > 0)).toBe(true);
    expect(
      table.scenarios.some((scenario) =>
        scenario.steps.some((step) => step.stepId === null && step.dropdown.survivors > 0),
      ),
    ).toBe(true);
    expect(
      dropdownReconciliationIssues(table, populations, profileIds(), {
        clears: DROPDOWN_CLEARS,
        refusedOnHoldout: DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT,
        outsideEditable: DROPDOWN_SURVIVORS_OUTSIDE_EDITABLE,
      }),
    ).toEqual([]);
  });

  it('is red on a way through the registers miss, and on a registered clear the table does not count', () => {
    /*
     * Synthetic populations and registers over a clone of the real table, so no control depends on
     * what the shipped registers hold today: a rebalance that empties them must not break these.
     */
    const [row] = table.scenarios;
    if (row === undefined) throw new Error('the survivor table publishes no scenario');
    const [inList, offList] = [...profileIds()].filter((id) => id !== row.baselineProfileId);
    if (inList === undefined || offList === undefined) throw new Error('fewer than two shipped profiles');
    interface MutableStep {
      stepId: string | null;
      survivorNames: string[];
      dropdown: { survivors: number };
    }
    const counting = (names: readonly string[]): PublishedSurvivors => {
      const copy = JSON.parse(JSON.stringify(table)) as PublishedSurvivors;
      const base = copy.scenarios
        .find((scenario) => scenario.id === row.id)
        ?.steps.find((step) => step.stepId === null) as unknown as MutableStep | undefined;
      if (base === undefined) throw new Error(`${row.id} publishes no base rung`);
      base.survivorNames = [...base.survivorNames.filter((name) => !profileIds().has(name)), ...names];
      base.dropdown.survivors = names.length;
      return copy;
    };
    const at = (ids: readonly string[]): Record<string, readonly string[]> => ({ [row.id]: ids });
    const issues = (
      names: readonly string[],
      registers: Partial<DropdownRegisters>,
      census: readonly string[] = [inList, offList],
    ): string =>
      dropdownReconciliationIssues(
        counting(names),
        [{ stageId: row.id, admitted: new Set([inList]), census: new Set(census) }],
        profileIds(),
        { clears: {}, refusedOnHoldout: {}, outsideEditable: {}, ...registers },
      ).join('\n');

    /* The floor: nothing counted and nothing registered agrees. */
    expect(issues([], {})).toBe('');
    /* A way through that DC-2 plays and has not registered. */
    expect(issues([inList], {})).toContain(`counts ${inList} as clearing both seed sets`);
    /* A registered clear with no holdout refusal that the table does not count: stage 7 before § D556. */
    expect(issues([], { clears: at([inList]) })).toContain(`DROPDOWN_CLEARS registers ${inList}`);
    /* Naming the refusal reconciles it, and a table that then counts the profile contradicts it. */
    expect(issues([], { clears: at([inList]), refusedOnHoldout: at([inList]) })).toBe('');
    expect(issues([inList], { clears: at([inList]), refusedOnHoldout: at([inList]) })).toContain(
      'registers the holdout refusing it',
    );
    expect(issues([], { refusedOnHoldout: at([inList]) })).toContain('which DROPDOWN_CLEARS does not');
    /* A way through the list refuses: stage 5 before § D556, and the register that names it. */
    expect(issues([offList], {})).toContain(`counts ${offList} as a way through from the dropdown`);
    expect(issues([offList], { outsideEditable: at([offList]) })).toBe('');
    expect(issues([], { outsideEditable: at([offList]) })).toContain('does not count it');
    expect(issues([inList], { clears: at([inList]), outsideEditable: at([inList]) })).toContain(
      'belongs in DROPDOWN_CLEARS',
    );
    expect(issues([], { clears: at([offList]) })).toContain('does not admit');
    /* A registered clear the base rung cannot afford is not a disagreement. */
    expect(issues([], { clears: at([inList]) }, [offList])).toBe('');
  });
});

describe.skipIf(process.env['ELEVATOR_SIM_DEEP'] !== '1')('DC-2 — no stage clears from the dispatcher dropdown alone, beyond the register', () => {
  it('plays every admitted cell and matches the register in both directions', async () => {
    const measured: Record<string, string[]> = {};
    const refused: Record<string, string[]> = {};
    let cells = 0;
    const lines: string[] = [];
    for (const stage of fixture.campaign.stages) {
      const admitted = admittedProfilesOf(stage);
      const met: string[] = [];
      const heldBack: string[] = [];
      for (const id of admitted) {
        cells += 1;
        const attempt = await fixture.playToVerdict(stage, id);
        if (!attempt.verdict.metOnTuningSeeds) continue;
        met.push(id);
        /* `runStageToVerdict` has already played this cell's holdout batch, so reading it is free. */
        if (!attempt.verdict.cleared) heldBack.push(id);
      }
      if (met.length > 0) measured[stage.id] = met;
      if (heldBack.length > 0) refused[stage.id] = heldBack;
      lines.push(
        `${stage.id}: admitted ${String(admitted.length)}, met on tuning seeds ` +
          `${met.length === 0 ? 'none' : met.join(' ')}, refused on the holdout ` +
          `${heldBack.length === 0 ? 'none' : heldBack.join(' ')}`,
      );
    }
    process.stderr.write(`DC-2 sweep over ${String(cells)} admitted cells\n${lines.join('\n')}\n`);
    expect(cells, 'the sweep admitted no cell at all').toBeGreaterThan(0);
    expect(
      sortedRegister(measured),
      'the register and the measurement disagree — a new dropdown clear, or a registered one that stopped',
    ).toEqual(sortedRegister(DROPDOWN_CLEARS));
    expect(
      sortedRegister(refused),
      'DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT and the holdout disagree — a registered clear that now holds ' +
        'on the holdout too, or a new refusal',
    ).toEqual(sortedRegister(DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT));
  }, 3_600_000);
});
