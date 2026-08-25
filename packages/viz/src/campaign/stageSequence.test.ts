/**
 * The Campaign tab's own start path, over the shipped `data/` — GitHub issue #255's second half,
 * from the caller's side.
 *
 * ## What this file is for
 *
 * `judge.ts` split the judged seed set from the tuning seed set and closed a real exploit with it:
 * *tune until the judged seeds clear*. It did so by requiring a second batch it cannot itself run,
 * and the caller that had to grow that second run — `dev/campaignPanel.ts` — did not. So the
 * Engineer Campaign tab reported **nothing** as cleared: an honest refusal, and a regression.
 *
 * `judge.test.ts` and `campaign.test.ts` already assert that `judgeStage` refuses a stage handed
 * one batch, and neither of them could have caught this, because both hand it two by hand. That is
 * the shape [§ D159](../../../../DECISIONS.md) names — a suite measuring a reimplementation of the
 * call site rather than the call site — so the cases below drive the sequence the panel runs,
 * through `campaign/stageSequence.ts`, which is the only statement of it.
 *
 * ## Real batches, and why they are not faked here
 *
 * Every case runs `runBatch` over the shipped buildings and the shipped goal table. A fake result
 * would let the tuning half be *declared* met rather than measured, and *"met every bar"* is
 * precisely the condition that decides whether a second batch happens at all — a fixture standing
 * in for it would be the test choosing its own answer. The cost is minutes, which is
 * `campaign.test.ts`'s cost for the same reason.
 *
 * ## What is counted, and why counting is the assertion
 *
 * The skip is asserted by recording **which seed sets the runner was asked for**, never by reading
 * a field off the verdict. `verdict.holdout === null` is what the panel draws and is exactly the
 * thing a broken sequence could produce while still burning fifty replications, so a case that
 * read it would pass on a panel that ran the holdout batch and threw it away.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { restrictedFloorIds } from '../access/zoning.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchRequest, BatchResources } from '../batch/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';

import { parseCampaign, type CampaignContext } from './parse.js';
import { runStageToVerdict, type StageSequenceOutcome } from './stageSequence.js';
import type { StageSeedSet } from './stageRun.js';
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

/** Every batch the sequence asked for, in order, with the seed set it asked for it under. */
interface Asked {
  readonly seedSet: StageSeedSet;
  readonly request: BatchRequest;
}

/** Play a stage exactly as the panel plays it, and keep the ledger of what it ran. */
async function play(
  stage: CampaignStage,
  candidateProfileId: string,
): Promise<{ readonly outcome: StageSequenceOutcome; readonly asked: readonly Asked[] }> {
  const asked: Asked[] = [];
  const outcome = await runStageToVerdict({
    stage,
    published: publishedFor(stage),
    candidateProfileId,
    run: (request, seedSet) => {
      asked.push({ seedSet, request });
      return runBatch(request, resourcesFor(stage));
    },
  });
  return { outcome, asked };
}

describe('the sequence the Campaign tab runs', () => {
  /**
   * **The regression, in the direction that shows it.**
   *
   * A panel that runs one batch cannot produce this state at all: `cleared` needs both halves, so
   * a sequence that never asks for `'holdout'` reports every stage in the shipped campaign as not
   * cleared however well it was played. The clearing profile is **searched for** rather than
   * pinned, for `judge.test.ts`'s stated reason — which profile clears is a measurement that will
   * move — and stage 5 is the stage that measurement was last taken on.
   */
  it('clears a stage on two batches, and names the holdout seeds it cleared on', async () => {
    const stage = stageAt(4);
    let cleared: { outcome: StageSequenceOutcome; asked: readonly Asked[] } | undefined;
    const everyAsk: Asked[] = [];
    for (const profile of config.dispatcherProfiles.profiles) {
      const played = await play(stage, profile.id);
      everyAsk.push(...played.asked);
      if (played.outcome.verdict.cleared) {
        cleared = played;
        break;
      }
    }

    /*
     * **Every** holdout ask in the sweep, before anything about clearing. `judgeStage` refuses a
     * second batch whose master seed is not the holdout set's, so a sequence that ran the tuning
     * batch twice would clear nothing and be reported above as *no profile clears this stage* —
     * true, unhelpful, and pointing at the wrong thing. This says which seed was asked for.
     */
    const holdoutAsks = everyAsk.filter((entry) => entry.seedSet === 'holdout');
    expect(holdoutAsks.length).toBeGreaterThan(0);
    for (const ask of holdoutAsks) expect(ask.request.seed).toBe(stage.holdoutSeeds.seed);
    for (const ask of everyAsk.filter((entry) => entry.seedSet === 'tuning')) {
      expect(ask.request.seed).toBe(stage.seeds.seed);
    }
    expect(stage.holdoutSeeds.seed).not.toBe(stage.seeds.seed);

    expect(
      cleared,
      'no shipped profile clears stage 5 through the panel’s sequence, so nothing here is measured',
    ).toBeDefined();
    if (cleared === undefined) return;

    /* Two batches, in order, over the two seed sets the stage declares — and no third. */
    expect(cleared.asked.map((entry) => entry.seedSet)).toEqual(['tuning', 'holdout']);

    const verdict = cleared.outcome.verdict;
    expect(verdict.metOnTuningSeeds).toBe(true);
    expect(verdict.cleared).toBe(true);
    expect(verdict.holdout?.held).toBe(true);
    expect(verdict.holdout?.seed).toBe(stage.holdoutSeeds.seed);
    /* Judged there, not merely unrefused: every count goal's bar reproduced on the holdout half. */
    for (const goal of verdict.holdout?.goals ?? []) {
      if (goal.kind === 'beat-the-baseline') continue;
      expect(goal.reproduced, goal.sentence).toBe(true);
    }

    /* And the figures the panel draws are the tuning batch's, which is the half a player can see. */
    expect(cleared.outcome.result.seed).toBe(stage.seeds.seed);
    expect(cleared.outcome.report.replications).toBe(stage.replications);
  }, 900_000);

  /**
   * **The skip, counted rather than read.**
   *
   * `cleared` needs both halves, so a stage that missed a bar on the runs the player made is
   * refused whatever the holdout says, and fifty more replications would buy nothing. The
   * assertion is the ledger of what the runner was asked for: a sequence that ran the holdout
   * batch and discarded it would produce an identical verdict and fail here.
   *
   * The control run is the stage's own baseline against itself — two identical arms, so every
   * paired difference is exactly zero, `beat-the-baseline` is unreachable, and the tuning batch
   * cannot meet its bars. That is `dev/campaignPanel.ts`'s own W3 liveness control, used here as
   * the cheapest honest way to reach a refused tuning batch.
   */
  it('asks for one batch and no more when the tuning batch missed a bar', async () => {
    const stage = stageAt(0);
    const played = await play(stage, stage.dispatcher.startingProfileId);

    expect(played.outcome.verdict.metOnTuningSeeds).toBe(false);
    expect(played.asked.map((entry) => entry.seedSet)).toEqual(['tuning']);
    expect(played.asked[0]?.request.seed).toBe(stage.seeds.seed);

    /*
     * The verdict is a refusal on **both** counts and says which is which: the holdout is `null`
     * because it was not run, and `cleared` is `false` because a goal was missed. A surface that
     * read `holdout === null` as *held* would be certifying a stage on a batch nobody ran.
     */
    expect(played.outcome.verdict.holdout).toBeNull();
    expect(played.outcome.verdict.cleared).toBe(false);
  }, 900_000);
});
