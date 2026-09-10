/**
 * The fixture the brief suites share: the shipped `data/`, the shipped validator, nothing mocked.
 *
 * It is `campaign/campaign.test-helper.ts` pointed at a second document, and it goes through the
 * **shipped** constructors for that file's stated reason — a suite that assembles its own request
 * keeps passing while the panel drifts. `playToVerdict` is `campaign/stageSequence.ts`'s sequence,
 * which is what `dev/campaignPanel.ts` runs, so a brief is played here exactly as a player plays it.
 *
 * **Nothing in this directory carries a timeout annotation, and that is deliberate rather than an
 * omission.** `vitest.config.ts`'s whole argument is that the annotation is a list and the list is
 * the defect: the `viz` project already budgets 300 000 ms for both tests and hooks, and
 * `testCost.test.ts` holds the above-ceiling population as a **ratchet that may only fall**. The
 * brief suites were first written with three cases at `900_000`, which would have raised that
 * ratchet from 93 to 96 — a decision, not a fix, and one nothing here needs: measured on a loaded
 * box the whole of `playable.test.ts` is about 71 s over six cases, so the project default carries
 * them with room. A site that genuinely knows it costs more than its project budgets for may say
 * so; this one does not know that.
 *
 * One rule this file is subject to that a `*.test.ts` is not: it is not a `*.test.ts`, so
 * `deadCode.test-helper.ts#isTest` still classifies it as a test and its exports are not audited as
 * product code.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll } from 'vitest';

import { parseEngineeringBriefs, type EngineeringBriefs } from './parse.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { batchReport, type BatchReport } from '../batch/report.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchResources } from '../batch/types.js';
import type { CampaignContext } from '../campaign/parse.js';
import { runStageToVerdict } from '../campaign/stageSequence.js';
import type { StageReport } from '../campaign/judge.js';
import type { CampaignStage } from '../campaign/types.js';
import type { EditedVector } from '../controls/editedProfile.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';

/** A brief run through the shipped constructors: the batch, its report, and the judge's verdict. */
export interface PlayedBrief {
  readonly report: BatchReport;
  readonly verdict: StageReport;
}

interface Loaded {
  readonly config: LoadedConfig;
  readonly published: PublishedGoalRates;
  readonly raw: unknown;
  readonly briefs: EngineeringBriefs;
  readonly space: SearchSpace;
  readonly context: CampaignContext;
  /**
   * The ids `data/campaign.json` authors, read rather than parsed.
   *
   * Here so `parse.test.ts` can ask the completeness question `campaign/campaign.test.ts` can no
   * longer ask alone — *is every measured row authored by somebody?* — without `campaign/` having
   * to import `briefs/`. Read as raw ids because that is all the question needs; a malformed
   * campaign is `campaign.test.ts`'s to fail on, not this file's.
   */
  readonly campaignStageIds: readonly string[];
}

export interface BriefsFixture extends Loaded {
  /** A deep copy of the raw document, for a mutation that must not reach the other cases. */
  rawClone(): Record<string, unknown>;
  /** The scenario a brief id names, or a throw — never a silent `undefined`. */
  stageOf(id: string): CampaignStage;
  /** The published goal-table entry for a brief, or a throw. */
  publishedFor(stage: CampaignStage): PublishedScenario;
  /** Batch resources for a brief's building, from the loaded `data/`. */
  resourcesFor(stage: CampaignStage): BatchResources;
  /**
   * The whole judgement — the tuning batch, and the holdout batch only where the first met
   * every bar. `campaign/stageSequence.ts`'s sequence, which is the panel's.
   */
  playToVerdict(
    stage: CampaignStage,
    candidateProfileId: string,
    edit?: EditedVector,
  ): Promise<PlayedBrief>;
}

async function load(): Promise<Loaded> {
  const config = await loadConfig(DATA_DIR);
  const published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  const raw: unknown = JSON.parse(
    await readFile(join(DATA_DIR, 'engineering-briefs.json'), 'utf8'),
  );
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
    schedule: shippedPriceSchedule(),
  };
  const campaign = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')) as {
    readonly stages: readonly { readonly id: string }[];
  };
  return {
    config,
    published,
    raw,
    briefs: parseEngineeringBriefs(raw, context),
    space,
    context,
    campaignStageIds: campaign.stages.map((stage) => stage.id),
  };
}

/**
 * Register the loading hook in the calling suite and return the fixture.
 *
 * Call it once, at the top of the file. The getters throw before the hook has run rather than
 * returning `undefined`, so a case that reads the fixture too early is a red and not a pass over
 * nothing — the campaign helper's rule, for the reason it gives.
 */
export function useBriefsFixture(): BriefsFixture {
  let loaded: Loaded | undefined;

  beforeAll(async () => {
    loaded = await load();
  });

  const state = (): Loaded => {
    if (loaded === undefined) {
      throw new Error('the briefs fixture is read before its `beforeAll` has run');
    }
    return loaded;
  };

  const publishedFor = (stage: CampaignStage): PublishedScenario => {
    const entry = state().published.scenarios.find((candidate) => candidate.id === stage.id);
    if (entry === undefined) throw new Error(`no published entry for ${stage.id}`);
    return entry;
  };

  const resourcesFor = (stage: CampaignStage): BatchResources => {
    const { config } = state();
    return {
      building: requireBuilding(config, stage.building),
      dispatcherProfiles: config.dispatcherProfiles,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
    };
  };

  const stageOf = (id: string): CampaignStage => {
    const brief = state().briefs.briefs.find((entry) => entry.stage.id === id);
    if (brief === undefined) throw new Error(`no brief "${id}" in data/engineering-briefs.json`);
    return brief.stage;
  };

  const playToVerdict = async (
    stage: CampaignStage,
    candidateProfileId: string,
    edit?: EditedVector,
  ): Promise<PlayedBrief> => {
    const played = await runStageToVerdict({
      stage,
      published: publishedFor(stage),
      candidateProfileId,
      edit,
      run: (request) => runBatch(request, resourcesFor(stage)),
    });
    return { report: batchReport(played.result), verdict: played.verdict };
  };

  return {
    get config() {
      return state().config;
    },
    get published() {
      return state().published;
    },
    get raw() {
      return state().raw;
    },
    get briefs() {
      return state().briefs;
    },
    get space() {
      return state().space;
    },
    get context() {
      return state().context;
    },
    get campaignStageIds() {
      return state().campaignStageIds;
    },
    rawClone: () => JSON.parse(JSON.stringify(state().raw)) as Record<string, unknown>,
    stageOf,
    publishedFor,
    resourcesFor,
    playToVerdict,
  };
}
