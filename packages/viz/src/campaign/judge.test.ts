/**
 * The stage headline, and the false positive § D163 clause 1's deep tier reported against it.
 *
 * The finding was `goal-without-rate` at `campaign/judge.ts#judgeStage · judge.headline`, on
 * *"The morning rush: all 3 goals reached over 50 runs."* — and the argument that it is a false
 * positive is in {@link headlineFor}'s docstring. This file is that argument's **controls**, and
 * they are here rather than in `campaign.test.ts` because two of them are about what the headline
 * may never become rather than about what it currently says.
 *
 * 1. **The `N of M` in the headline counts goals, not seeds.** Driven on a batch with **no
 *    replications at all**: the headline still reads *"0 of 2 goals reached over 0 runs"*, so the
 *    `\d+ of \d+` that `honesty/surfaces.ts` reads as a pass rate is satisfied by a batch that
 *    produced nothing to take a rate over. This is the whole case: the property does not report
 *    this string because a rate is missing on the cleared branch — it **accepts** the uncleared
 *    branch for the wrong reason.
 * 2. **The headline names no goal kind and no goal label, on either branch.** This is the guard
 *    that makes the narrowing safe. Reclassifying the seed away from `role: 'goal'` gives up the
 *    ability to see a headline rewritten to assert a per-goal outcome; nothing may rewrite it that
 *    way while this passes.
 * 3. **The rate R12 asks for is on the goal's own sentence**, measured on a stage that really
 *    clears — so the narrowing removes no coverage of the rule it is narrowing.
 *
 * Everything is driven over the shipped `data/`, through the shipped request constructor, for
 * `campaign.test.ts`'s stated reason: a suite that assembled its own would keep passing while the
 * panel drifted.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { restrictedFloorIds } from '../access/zoning.js';
import { batchReport } from '../batch/report.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchResources, BatchResult } from '../batch/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { GOAL_KINDS, goalLabel } from '../scenario/goals.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';

import { judgeStage, type StageReport } from './judge.js';
import { parseCampaign, type CampaignContext } from './parse.js';
import {
  batchRequestForStage,
  stageReplicationSeed,
  stageSeedSetOf,
  type StageSeedSet,
} from './stageRun.js';
import { runStageToVerdict } from './stageSequence.js';
import type { Campaign, CampaignStage } from './types.js';

let config: LoadedConfig;
let published: PublishedGoalRates;
let campaign: Campaign;

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
}, 120_000);

function stageAt(index: number): CampaignStage {
  const stage = campaign.stages[index];
  if (stage === undefined) throw new Error(`no stage ${String(index)}`);
  return stage;
}

function publishedFor(stage: CampaignStage): PublishedScenario {
  const entry = published.scenarios.find((candidate) => candidate.id === stage.id);
  if (entry === undefined) throw new Error(`no published entry for ${stage.id}`);
  return entry;
}

function resourcesFor(stage: CampaignStage): BatchResources {
  return {
    building: requireBuilding(config, stage.building),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

/**
 * A batch that ran, and produced nothing.
 *
 * Not a fixture standing in for a run — an *empty* result is a real state `judgeStage` handles
 * (`"this batch produced no runs to judge"`), and it is the only one in which the headline's
 * denominator and the batch's replication count are provably different numbers.
 */
function emptyResult(stage: CampaignStage): BatchResult {
  return {
    buildingId: stage.building,
    buildingName: requireBuilding(config, stage.building).name,
    seed: '0',
    durationS: stage.durationS,
    arrivalRatePctPop5min: null,
    arms: [],
    crn: { traceKey: '{}', checkedComparisons: 0, mismatches: [], aligned: true },
    elapsedMs: 0,
  };
}

/** Every kind and every label a headline could name, including the parameterised ones. */
function goalWords(): readonly string[] {
  const words = new Set<string>(GOAL_KINDS);
  for (const stage of campaign.stages) {
    for (const spec of stage.goals) words.add(goalLabel(spec));
  }
  return [...words];
}

describe('the headline is a tally of verdicts, not a goal claim', () => {
  it('counts goals rather than seeds — `0 of N goals reached over 0 runs`', () => {
    /*
     * **The stage with the most goals**, derived rather than pinned to stage 1. It was stage 1
     * and `0 of 2`; issue #255's regeneration took stage 1 down to a single goal — its four count
     * kinds all measure `50/50, 50/50` once the reporting window is honest — and a case whose
     * whole point is that the two numerals are *goals* is worth making on a stage that has more
     * than one of them.
     */
    const stage = [...campaign.stages].sort((left, right) => right.goals.length - left.goals.length)[0];
    expect(stage, 'the shipped campaign declares no stages').toBeDefined();
    if (stage === undefined) return;
    expect(stage.goals.length).toBeGreaterThan(1);
    const total = String(stage.goals.length);
    const result = emptyResult(stage);
    const report = batchReport(result);
    expect(report.replications).toBe(0);

    const verdict = judgeStage({ stage, published: publishedFor(stage), result, report });
    expect(verdict.replications).toBe(0);
    expect(verdict.headline).toContain(`0 of ${total} goals reached over 0 runs`);

    /*
     * `honesty/surfaces.ts` sets `goal.rateShown` from exactly this pattern. It matches here, on a
     * batch with no replications — so what it matched is the goal count, and a check it satisfies
     * is not a check that a pass rate was shown.
     */
    expect(/\b\d+\s*(?:of|\/)\s*\d+\b/.test(verdict.headline)).toBe(true);
    expect(verdict.goals.every((goal) => goal.met === null)).toBe(true);
  });

  it('names no goal kind and no goal label, cleared or not', async () => {
    const words = goalWords();
    // Both ways: a `GOAL_KINDS` that emptied would make every assertion below vacuous.
    expect(words.length).toBeGreaterThan(6);

    const notCleared = stageAt(0);
    const uncleared = judgeStage({
      stage: notCleared,
      published: publishedFor(notCleared),
      result: emptyResult(notCleared),
      report: batchReport(emptyResult(notCleared)),
    });
    expect(uncleared.cleared).toBe(false);

    /*
     * A **measured** clear, and it is stage 5 rather than stage 4 since § D265 — see
     * `campaign.test.ts` § *stage 5, played*, which sweeps the thirteen shipped profiles and records
     * that the clear moved buildings when § D254 changed what every conventional arm on an
     * access-zoned building does.
     *
     * Searched rather than pinned to a profile id for that file's reason: which profile clears is a
     * measurement that will move again, and a test naming one gets re-pinned without anybody
     * re-reading the claim. What this file needs is *a* cleared verdict to check the headline of.
     */
    const stage = stageAt(4);
    let cleared: StageReport | undefined;
    for (const profile of config.dispatcherProfiles.profiles) {
      /*
       * Two batches, and the second only when the first met every bar — through
       * `campaign/stageSequence.ts`, which is the sequence the Campaign tab runs. It was written
       * out here, and a copy of the rule that decides whether a player cleared a stage is a copy
       * that can drift from the surface: it did, for a whole wave, while the panel ran one batch.
       * The skip is arithmetic rather than a shortcut, because `cleared` needs both halves.
       */
      const { verdict } = await runStageToVerdict({
        stage,
        published: publishedFor(stage),
        candidateProfileId: profile.id,
        run: (request) => runBatch(request, resourcesFor(stage)),
      });
      if (verdict.cleared) {
        cleared = verdict;
        break;
      }
    }
    expect(cleared, 'no shipped profile clears stage 5, so this case has no cleared verdict to check').toBeDefined();
    if (cleared === undefined) return;
    expect(cleared.cleared).toBe(true);

    for (const verdict of [uncleared, cleared]) {
      for (const word of words) {
        expect(verdict.headline.includes(word), `${word} in "${verdict.headline}"`).toBe(false);
      }
      // R13's half of the same string: the count the tally is over is always in it.
      expect(verdict.headline).toContain(`over ${String(verdict.replications)} runs`);
    }

    /*
     * And the rate R12 does ask for is where R12 puts it — beside each goal, not in the headline.
     * `beat-the-baseline` is `batch-only`, which § D160 says R12 never reached.
     */
    for (const goal of cleared.goals) {
      if (goal.kind === 'beat-the-baseline') continue;
      expect(/\b\d+ of \d+ runs\b/.test(goal.sentence), goal.sentence).toBe(true);
    }
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * The judged seed set — GitHub issue #255, `docs/33` § 7 O7
 * -------------------------------------------------------------------------- */

/** Every replication seed one of a stage's two sets derives, through the shipped derivation. */
function replicationSeedsOf(stage: CampaignStage, which: StageSeedSet): readonly string[] {
  const set = stageSeedSetOf(stage, which);
  return Array.from({ length: set.replications }, (_, index) =>
    stageReplicationSeed(stage, index, which).toString(),
  );
}

describe('a stage is judged on seeds the player could not have tuned against', () => {
  /**
   * **Disjointness, derived from the two sets rather than read off two literals.**
   *
   * The master seeds differing is not the property that matters — `replicationSeed` is a hash, and
   * two master seeds that differ could in principle derive an overlapping list. What matters is
   * that no run in the judged sample is a run in the tuning sample, so that is what is taken: both
   * lists, through the same derivation the batches use, intersected.
   *
   * It is also asserted **inside** each set. A set that derived the same seed twice would be two
   * replications that are one run, which deflates every variance in the batch while looking
   * entirely normal — `experiments`' own `replicationSeeds` refuses that case for the same reason,
   * and this is the campaign-shaped version of the same question.
   */
  it('derives two disjoint samples on every shipped stage', () => {
    expect(campaign.stages.length).toBeGreaterThan(0);
    for (const stage of campaign.stages) {
      const tuning = replicationSeedsOf(stage, 'tuning');
      const holdout = replicationSeedsOf(stage, 'holdout');
      expect(tuning.length).toBe(stage.replications);
      expect(holdout.length).toBe(stage.replications);
      expect(new Set(tuning).size, `${stage.id}: a tuning seed is derived twice`).toBe(tuning.length);
      expect(new Set(holdout).size, `${stage.id}: a holdout seed is derived twice`).toBe(
        holdout.length,
      );

      const shared = new Set(tuning);
      expect(
        holdout.filter((seed) => shared.has(seed)),
        `${stage.id}: the judged sample contains runs the player tuned against`,
      ).toEqual([]);
    }
  });

  it('would notice a holdout set that is the tuning set — the guard on the guard', () => {
    /*
     * Every assertion above is an empty intersection, and an empty intersection is also what a
     * broken derivation produces. So the derivation is shown to be able to find a collision:
     * point a stage's holdout set at its own tuning seed and every one of the fifty overlaps.
     *
     * `parse.ts` already refuses this at load, on the same derived-seed comparison; this is that
     * refusal's premise checked where the judging happens.
     */
    const stage = stageAt(0);
    const collided: CampaignStage = { ...stage, holdoutSeeds: stage.seeds };
    const tuning = new Set(replicationSeedsOf(collided, 'tuning'));
    expect(replicationSeedsOf(collided, 'holdout').filter((seed) => tuning.has(seed))).toHaveLength(
      stage.replications,
    );
  });

  it('runs each batch over the set it names', () => {
    /*
     * The seam: two disjoint lists are worth nothing if both batches are built from the same one.
     * Asserted through the shipped constructor, on both sets, over every stage.
     */
    for (const stage of campaign.stages) {
      const tuning = batchRequestForStage(stage, 'collective', undefined, 'tuning');
      const holdout = batchRequestForStage(stage, 'collective', undefined, 'holdout');
      /*
       * Against the **stage's own declared fields**, not against `stageSeedSetOf` — routing both
       * sides of the assertion through the accessor would make it true of an accessor that
       * returned the tuning set for both, which is the one regression this case is for.
       */
      expect(tuning.seed).toBe(stage.seeds.seed);
      expect(holdout.seed).toBe(stage.holdoutSeeds.seed);
      expect(holdout.seed).not.toBe(tuning.seed);
      // And the two batches differ in the seed and in nothing else.
      expect({ ...holdout, seed: tuning.seed }).toEqual(tuning);
      // The default is the batch the player runs, so no caller acquired a holdout by omission.
      expect(batchRequestForStage(stage, 'collective').seed).toBe(stage.seeds.seed);
    }
  });

  it('refuses a second batch that is not the holdout set, naming both seeds', () => {
    /*
     * **The mechanism, and the reason the split is a property of the runs rather than of an
     * argument's name.** A caller that handed `judgeStage` the tuning batch twice would otherwise
     * clear a stage on the sample it was tuned against while every downstream assertion said it
     * had been validated. The seed is checked, so that call is refused with both seeds printed.
     */
    const stage = stageAt(0);
    const result = emptyResult(stage);
    const asTuning: BatchResult = { ...result, seed: stage.seeds.seed };
    const verdict = judgeStage({
      stage,
      published: publishedFor(stage),
      result,
      report: batchReport(result),
      holdout: { result: asTuning, report: batchReport(asTuning) },
    });
    expect(verdict.holdout?.held).toBe(false);
    expect(verdict.holdout?.sentence).toContain(stage.seeds.seed);
    expect(verdict.holdout?.sentence).toContain(stage.holdoutSeeds.seed);
    expect(verdict.cleared).toBe(false);

    /*
     * And a batch that *is* the holdout set is accepted as one, so the check is not refusing
     * everything: it is judged, and it fails on its goals rather than on its seed.
     */
    const asHoldout: BatchResult = { ...result, seed: stage.holdoutSeeds.seed };
    const judged = judgeStage({
      stage,
      published: publishedFor(stage),
      result,
      report: batchReport(result),
      holdout: { result: asHoldout, report: batchReport(asHoldout) },
    });
    expect(judged.holdout?.sentence).not.toContain('validates nothing');
    expect(judged.holdout?.goals.length).toBe(stage.goals.length);
  });
});
