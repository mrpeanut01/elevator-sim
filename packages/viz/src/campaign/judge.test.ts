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

import { judgeStage } from './judge.js';
import { parseCampaign, type CampaignContext } from './parse.js';
import { batchRequestForStage } from './stageRun.js';
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
  it('counts goals rather than seeds — `0 of 2 goals reached over 0 runs`', () => {
    const stage = stageAt(0);
    expect(stage.goals).toHaveLength(2);
    const result = emptyResult(stage);
    const report = batchReport(result);
    expect(report.replications).toBe(0);

    const verdict = judgeStage({ stage, published: publishedFor(stage), result, report });
    expect(verdict.replications).toBe(0);
    expect(verdict.headline).toContain('0 of 2 goals reached over 0 runs');

    /*
     * `honesty/surfaces.ts` sets `goal.rateShown` from exactly this pattern. It matches here, on a
     * batch with no replications — so what it matched is the goal count, and a check it satisfies
     * is not a check that a pass rate was shown.
     */
    expect(/\b\d+\s*(?:of|\/)\s*\d+\b/.test(verdict.headline)).toBe(true);
    expect(verdict.goals.every((goal) => goal.met === null)).toBe(true);
  });

  it('names no goal kind and no goal label, cleared or not', () => {
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

    /* Stage 4 on `destination-eta` is the measured clear `campaign.test.ts` § stage 4 pins. */
    const stage = stageAt(3);
    const result = runBatch(batchRequestForStage(stage, 'destination-eta'), resourcesFor(stage));
    const cleared = judgeStage({
      stage,
      published: publishedFor(stage),
      result,
      report: batchReport(result),
    });
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
