/**
 * The cleared verdict's headline, one case per shipped dispatcher — GitHub issue #317.
 *
 * ## Why this file exists rather than a paragraph in `judge.test.ts`
 *
 * This is the second half of that file's *"names no goal kind and no goal label, cleared or not"*.
 * The first half — the **uncleared** verdict — needs no simulation and stayed there. This half had
 * to find a verdict that really clears, and it did so by sweeping the shipped dispatcher library
 * **inside a single `it()`**, thirteen profiles deep, breaking at the first clear.
 *
 * That one case measured **78 328 ms of its file's 81 200 ms** on an idle box: 96.5 % of the file
 * in one indivisible unit, with every other case in it at or under 9 ms. Inside a full
 * `--project viz` run it was reported at **336 826 ms against the project's 300 000 ms ceiling**,
 * and under three-way worktree contention between 313 s and 863 s. A single `it()` is the unit
 * vitest schedules and the unit it times out, so the sweep could neither be spread across workers
 * nor fail in any smaller piece than all of it — one slow dispatcher carried the other twelve into
 * the red with it.
 *
 * **The ceiling was deliberately not raised.** A budget lifted to fit the thing it measures stops
 * being a budget; `docs/05-roadmap.md`'s working agreement is that a criterion is raised rather
 * than weakened. What changed is the *shape* of the work, not the allowance for it.
 *
 * ## What the split changes about the claim, and it is not nothing
 *
 * The sweep used to stop at the first dispatcher that cleared, so the headline of every profile
 * after it went unread. Here every one of the thirteen is judged and every one of the thirteen
 * verdicts is checked, cleared or not — so the assertion this file makes is a **superset** of the
 * one it replaces. The two conditions the original searched for are kept exactly:
 * {@link SHIPPED_PROFILE_IDS} is asserted against the loaded library in both directions, so a
 * fourteenth dispatcher cannot arrive unswept, and the tally case at the bottom refuses a run in
 * which nothing cleared at all.
 *
 * ## What is duplicated here, and the one thing that is not
 *
 * The fixture plumbing — loading `data/`, finding a stage's published row, building its
 * `BatchResources` — is restated rather than shared, because it is a handful of accessors over
 * loaded configuration and has nothing in it that can drift into disagreement.
 *
 * The **rule** is not duplicated, and that is the distinction `stageSequence.ts` was extracted to
 * make: *run the tuning batch, and run the holdout batch only when it met every bar* is stated once
 * in `runStageToVerdict` and called from here, from `judge.test.ts` before this split, and from
 * `dev/campaignPanel.ts`. § D159's false negative is a suite measuring a reimplementation of the
 * call site; a second copy of that sequence in a second test file would be exactly it.
 *
 * ## One sentence outside this directory now names the wrong file — it is **not** fixed here
 *
 * `honesty/surfaces.ts`, in the docstring bounding what the narrowed `judge.headline` seed gives
 * up, reads: *"`judge.test.ts` asserts the produced headline names no goal kind and no goal label,
 * on both branches, with the cleared one driven through a real 50-replication batch."*
 * `DECISIONS.md` § D186 makes the same claim in its own words — *"`campaign/judge.test.ts` is the
 * control — the produced headline names no goal kind and no goal label, on both branches, with the
 * cleared one driven through a real 50-replication batch."*
 *
 * The **claim** survives this split intact — it is now made over thirteen cleared-or-not verdicts
 * rather than one, which is more than it promised. What has stopped being true is the **file
 * name**: after this commit `judge.test.ts` drives only the uncleared branch, and the cleared one
 * is here. That is § D227's shape exactly — a sentence that tells the next reader where to look,
 * and is wrong — so it is named rather than left for someone to trip over. It is not corrected in
 * this commit because `honesty/` and `DECISIONS.md` are outside this lane's allowed files, and
 * editing either to keep a cross-reference tidy is how two lanes end up writing the same line.
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405: this splits one test file and binds
 * no code or document outside it.
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { restrictedFloorIds } from '../access/zoning.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchResources } from '../batch/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { GOAL_KINDS, goalLabel } from '../scenario/goals.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';

import type { StageReport } from './judge.js';
import { parseCampaign, type CampaignContext } from './parse.js';
import { runStageToVerdict } from './stageSequence.js';
import type { Campaign, CampaignStage } from './types.js';

/**
 * The shipped dispatcher ids, read **synchronously** at module scope.
 *
 * One `it()` per dispatcher is the whole point of this file, and vitest fixes the set of cases at
 * collection time — before any `beforeAll` has run. So the names come off the file on disk rather
 * than out of `loadConfig`, and the two are then asserted equal in both directions by the first
 * case below. Reading the ids twice is the cost of being able to name them; a mismatch between the
 * two readings is a fourteenth dispatcher that would otherwise have gone unswept in silence.
 */
const SHIPPED_PROFILE_IDS: readonly string[] = (
  JSON.parse(readFileSync(join(DATA_DIR, 'dispatcher-profiles.json'), 'utf8')) as {
    readonly profiles: readonly { readonly id: string }[];
  }
).profiles.map((profile) => profile.id);

/**
 * Stage 5, and it is an index rather than an id for `judge.test.ts`'s reason — see that file's
 * § *a measured clear*, which records that the clearing building moved when § D254 changed what
 * every conventional arm on an access-zoned building does.
 */
const STAGE_INDEX = 4;

let config: LoadedConfig;
let published: PublishedGoalRates;
let campaign: Campaign;
let stage: CampaignStage;
let goalWords: readonly string[];

/** Which dispatchers cleared, filled in by the cases below and tallied by the last one. */
const clearedBy: string[] = [];
/** Which dispatchers were judged at all, so the tally can refuse to speak for a partial run. */
const judged: string[] = [];

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  const space = collectSearchSpace();
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
  };
  campaign = parseCampaign(
    JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')),
    context,
  );
  const found = campaign.stages[STAGE_INDEX];
  if (found === undefined) throw new Error(`no stage ${String(STAGE_INDEX)}`);
  stage = found;

  const words = new Set<string>(GOAL_KINDS);
  for (const candidate of campaign.stages) {
    for (const spec of candidate.goals) words.add(goalLabel(spec));
  }
  goalWords = [...words];
}, 120_000);

function publishedFor(target: CampaignStage): PublishedScenario {
  const entry = published.scenarios.find((candidate) => candidate.id === target.id);
  if (entry === undefined) throw new Error(`no published entry for ${target.id}`);
  return entry;
}

function resourcesFor(target: CampaignStage): BatchResources {
  return {
    building: requireBuilding(config, target.building),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

describe('the headline names no goal, on every shipped dispatcher', () => {
  it('sweeps the library the loader actually loaded, and all of it', () => {
    /*
     * Both directions. A profile in `data/` that this file never names would go unswept while the
     * suite stayed green, and a name here that the loader rejects would be a case asserting
     * nothing about a dispatcher anybody ships.
     */
    expect([...SHIPPED_PROFILE_IDS].sort()).toEqual(
      config.dispatcherProfiles.profiles.map((profile) => profile.id).sort(),
    );
    expect(SHIPPED_PROFILE_IDS.length).toBeGreaterThan(1);
  });

  for (const profileId of SHIPPED_PROFILE_IDS) {
    it(`${profileId} — names no goal kind and no goal label`, async () => {
      const { verdict } = await runStageToVerdict({
        stage,
        published: publishedFor(stage),
        candidateProfileId: profileId,
        run: (request) => runBatch(request, resourcesFor(stage)),
      });
      judged.push(profileId);
      if (verdict.cleared) clearedBy.push(profileId);

      for (const word of goalWords) {
        expect(verdict.headline.includes(word), `${word} in "${verdict.headline}"`).toBe(false);
      }
      // R13's half of the same string: the count the tally is over is always in it.
      expect(verdict.headline).toContain(`over ${String(verdict.replications)} runs`);

      /*
       * And the rate R12 does ask for is where R12 puts it — beside each goal, not in the headline
       * — asserted on a stage that really clears, so the narrowing removes no coverage of the rule
       * it is narrowing. `beat-the-baseline` is `batch-only`, which § D160 says R12 never reached.
       *
       * Guarded on `cleared` rather than run unconditionally because that is the claim the case it
       * came from made: a goal's sentence carries its rate on a verdict that was actually judged
       * against both seed sets. An uncleared stage may have had no holdout batch at all.
       */
      if (!verdict.cleared) return;
      const cleared: StageReport = verdict;
      expect(cleared.cleared).toBe(true);
      for (const goal of cleared.goals) {
        if (goal.kind === 'beat-the-baseline') continue;
        expect(/\b\d+ of \d+ runs\b/.test(goal.sentence), goal.sentence).toBe(true);
      }
    }, 300_000);
  }

  it('and at least one shipped dispatcher clears the stage', () => {
    /*
     * **The guard that keeps the thirteen cases above from being vacuous.** Every one of them passes
     * on an uncleared verdict, so a stage that no dispatcher could clear any more would leave this
     * file green while it had stopped checking a cleared headline at all — which is the whole
     * property `judge.test.ts` split this work out of was written to hold.
     *
     * It is a tally over the cases above rather than a test of its own, so it says so and refuses
     * to speak for a filtered run: a partial sweep fails here loudly instead of reporting that
     * nothing clears.
     */
    expect(
      [...judged].sort(),
      'this tally only means anything over a full sweep — run the file, not one case of it',
    ).toEqual([...SHIPPED_PROFILE_IDS].sort());
    expect(
      clearedBy,
      'no shipped profile clears this stage, so nothing above checked a cleared verdict',
    ).not.toEqual([]);
  });
});
