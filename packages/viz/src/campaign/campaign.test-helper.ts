/**
 * The apparatus the campaign suites share — the shipped campaign, loaded once per file, and the
 * play-a-stage path exactly as the panel runs it.
 *
 * ## Why this is a helper and not the top of `campaign.test.ts`
 *
 * It was the top of `campaign.test.ts`, and that file was **33.34 % of the `viz` leg's serial cost**
 * (279.5 s of 838.4 s, measured on 2026-09-05 — GitHub issue #356). Vitest schedules files and runs
 * the cases inside one file in series, so the leg could never finish before that file did, and the
 * reciprocal of its share — **3.0** — was the most concurrency the leg could ever use on a four-core
 * runner. The only thing that moves that ceiling is splitting the file, and a split has a cost the
 * issue names in its third criterion: *N copies of an expensive `beforeAll` would spend the saving
 * before it is banked.* So the setup the played-stage suites depend on is stated once, here, and
 * each of them calls {@link useCampaignFixture} rather than carrying its own.
 *
 * **What is shared is the cheap half, deliberately.** Loading `data/`, discovering the search space
 * and parsing the campaign is about a second a file. The *expensive* setup — a two-arm,
 * fifty-replication batch in a `beforeAll` — belongs to the `describe` that reads it and moved with
 * that `describe` into its own file, so no batch is run twice and no file pays for a batch it does
 * not read. The split is therefore by **which batch a case needs**, not by section heading.
 *
 * ## What is here, unchanged from where it was
 *
 * Every function below is the one `campaign.test.ts` defined, with the module-level `let`s it
 * closed over turned into a fixture object. None of them asserts anything a case did not already
 * assert — `failStatesFor`'s one `expect` was there before, pinning that the batch's replication-0
 * seed is the number the demonstration replays — and none of them is a second copy of what the
 * panel does: `playStage` goes through the shipped `batchRequestForStage`, and `playToVerdict`
 * through the shipped `runStageToVerdict`, for the reason both of those modules give at length. A
 * suite that assembled its own request would keep passing while the panel drifted.
 *
 * ## Two rules this file is subject to that a `*.test.ts` file is not
 *
 * 1. **The dimension-literal guard reads it.** `campaign.test.ts`'s *names no dimension the search
 *    space does not declare, and never writes the list down* scans every `.ts` in this directory
 *    that is not a `.test.ts`, and a `.test-helper.ts` is not a `.test.ts`. So no dimension id may
 *    appear here as a literal — which is why stage 2's authored `EditedVector` stayed in the suite
 *    that plays it rather than moving here with the rest of the apparatus. The guard's filter is
 *    left exactly as it was: excluding helpers from it would be editing a landed guard's reach to
 *    make a new file convenient, and this file has no need of a literal anyway.
 * 2. **The annotation census reads it too, since this file exists.** The fixture hook below carries
 *    the `120_000` that `campaign.test.ts`'s `beforeAll` carried, moved rather than added: one hook,
 *    one annotation, whichever suite calls it. `testCost.test-helper.ts#censusOf` used to read
 *    `*.test.ts` alone, so an annotation moved here would have left the census — a real bound on a
 *    real hook, uncounted, which is the shape `RISKS.md` R38 names and the reason that deriver was
 *    built. It now reads `*.test-helper.ts` as well, and its docstring carries the argument.
 *
 * ## How to read the fixture
 *
 * {@link useCampaignFixture} registers the hook and returns the fixture at once, so a file can hold
 * it in a `const` at the top and a `describe` can read `fixture.campaign` inside a case. The data
 * fields are getters that throw before the hook has run, rather than `undefined`s that would let a
 * case pass over an empty campaign — the shape this directory keeps finding, and the reason
 * `campaign.test.ts` asserts its premises as cases of their own.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type DispatcherProfile, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, expect } from 'vitest';

import { evidenceFrom, failStateCounts, failStateReports, type FailStateReport } from './failStates.js';
import { judgeStage, type StageReport } from './judge.js';
import { parseCampaign, validateCampaign, type CampaignContext } from './parse.js';
import { batchRequestForStage, demonstrationConfigFor, stageReplicationSeed } from './stageRun.js';
import { runStageToVerdict } from './stageSequence.js';
import type { Campaign, CampaignStage } from './types.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { batchReport, type BatchReport } from '../batch/report.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchResources, BatchResult } from '../batch/types.js';
import type { EditedVector } from '../controls/editedProfile.js';
import { recordRun } from '../record/recordRun.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';

/** A stage run through the shipped constructors: the batch, its report, and the judge's verdict. */
export interface PlayedStage {
  readonly result: BatchResult;
  readonly report: BatchReport;
  readonly verdict: StageReport;
}

/** What the hook loads. Nothing is mocked, for the reason `campaign.test.ts`'s first claim gives. */
interface LoadedCampaign {
  readonly config: LoadedConfig;
  readonly published: PublishedGoalRates;
  readonly raw: unknown;
  readonly campaign: Campaign;
  readonly space: SearchSpace;
  readonly context: CampaignContext;
  readonly dimensionHelp: ReadonlyMap<string, string>;
}

export interface CampaignFixture extends LoadedCampaign {
  /** A deep copy of the parsed campaign, for a mutation that must not reach the other cases. */
  clone(): Campaign;
  /** Stage `index` of a fresh {@link clone}, so a case may spread over it freely. */
  stageAt(index: number): CampaignStage;
  /** Apply `change` to a clone and return what the validator says about the result. */
  mutate(change: (campaign: Campaign) => void): readonly string[];
  /** The published goal-table entry for a stage, or a throw — never a silent `undefined`. */
  publishedFor(stage: CampaignStage): PublishedScenario;
  /** The batch resources for a stage's building, from the loaded `data/`. */
  resourcesFor(stage: CampaignStage): BatchResources;
  /** A shipped dispatcher profile by id, or a throw. */
  requireProfile(id: string): DispatcherProfile;
  /**
   * Run a stage: two arms, the stage's own tuning seeds.
   *
   * `edit` is W6's player move — an **edited weight vector** instead of a dropdown choice. It goes
   * through the same `batchRequestForStage` the panel calls, so the suite cannot exercise a second
   * version of what a stage run with an edit is.
   *
   * **This is one half of a judgement and no longer the whole of one.** GitHub issue #255's second
   * half split the judged seed set from the tuning seed set, so a stage is *cleared* only on a
   * holdout batch as well — see {@link playToVerdict} and `judge.ts`'s docstring. Every case that
   * used to read `verdict.cleared` and meant *"did this batch meet its bars"* now reads
   * `verdict.metOnTuningSeeds`, which is that question with its own name; the cases that meant
   * *"is this stage won"* run both batches.
   */
  playStage(stage: CampaignStage, candidateProfileId: string, edit?: EditedVector): PlayedStage;
  /**
   * The whole judgement: the tuning batch, and — only when it met every bar — the holdout batch.
   *
   * **The sequence is `campaign/stageSequence.ts`'s, not this file's.** It used to be written out
   * in `campaign.test.ts`, which is the same defect {@link playStage} avoids one level down: a suite
   * carrying its own copy of what the panel does keeps passing while the panel drifts, and it did —
   * `dev/campaignPanel.ts` ran one batch for a whole wave while the suite ran two. The skip is
   * stated there too, and it is arithmetic rather than an optimisation with a cost: `cleared`
   * requires **both** halves, so a stage that missed a bar on the runs the player made is refused
   * whatever the holdout says, and running fifty more replications to learn nothing would double
   * the cost of every sweep in these suites.
   */
  playToVerdict(
    stage: CampaignStage,
    candidateProfileId: string,
    edit?: EditedVector,
  ): Promise<PlayedStage>;
  /**
   * The fail-state path, exactly as the panel runs it: the batch's counts, and one replayed
   * demonstration replication diagnosed. Asserts — as it always has — that the batch's replication-0
   * seed is the number the demonstration replays, rather than assuming the two agree.
   */
  failStatesFor(
    stage: CampaignStage,
    result: BatchResult,
    candidateProfileId: string,
  ): readonly FailStateReport[];
  /**
   * **The first stage that carries a count goal, derived — and it stopped being stage 1.**
   *
   * The count-goal suite was *"stage 1, played"* and every clause in it needed a count goal: the
   * bar reproducing, the shipped setting scoring exactly level against its own bar, and the refusal
   * to judge against a bar that does not reproduce. GitHub issue #255 took stage 1's away — with an
   * honest reporting window all five of its per-run kinds measure `50/50, 50/50`, so R12 makes
   * every one of them a fact for the briefing and `data/campaign.json` declares `beat-the-baseline`
   * alone there.
   *
   * Repointed at a **derived** stage rather than at stage 2 by name, for the suites' own reason: a
   * subject written down is a subject that goes stale silently, and the three clauses would have
   * gone on passing over an empty loop. The derivation throws rather than returning `undefined`, so
   * a campaign with no count goal anywhere reds the suite rather than skipping it.
   */
  firstStageWithCountGoals(): CampaignStage;
}

/**
 * Load the shipped campaign against the shipped goal table, buildings, profiles and the
 * **discovered** search space. Exactly what `campaign.test.ts`'s `beforeAll` did.
 */
async function loadCampaign(): Promise<LoadedCampaign> {
  const config = await loadConfig(DATA_DIR);
  const published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  const raw: unknown = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8'));
  const space = collectSearchSpace();
  const help = new Map<string, string>();
  for (const parameter of space.parameters) {
    if (parameter.description !== undefined) help.set(parameter.id, parameter.description);
  }
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
    /* #365: a budget is checked against the shipped ladder, never against a fixture. */
    schedule: shippedPriceSchedule(),
  };
  return {
    config,
    published,
    raw,
    campaign: parseCampaign(raw, context),
    space,
    context,
    dimensionHelp: help,
  };
}

/**
 * Register the loading hook in the calling suite and return the fixture.
 *
 * Call it **once, at the top of the file**, and hold the result in a `const`. The hook is a
 * `beforeAll` on whatever suite is being collected when this is called, and the data getters throw
 * until it has run — so a case that reads the fixture before the hook is a red rather than a pass
 * over `undefined`. Vitest isolates each test file in its own module instance, so the `loaded`
 * below is one file's and the load is paid once a file; a second call in the same file would
 * register a second hook and load again, which is why the rule is *once*.
 *
 * The `120_000` is the annotation `campaign.test.ts`'s hook carried, moved here with the hook; see
 * the file docstring for why the census now counts it here.
 */
export function useCampaignFixture(): CampaignFixture {
  let loaded: LoadedCampaign | undefined;

  beforeAll(async () => {
    loaded = await loadCampaign();
  }, 120_000);

  const state = (): LoadedCampaign => {
    if (loaded === undefined) {
      throw new Error('the campaign fixture is read before its `beforeAll` has run');
    }
    return loaded;
  };

  const clone = (): Campaign => JSON.parse(JSON.stringify(state().campaign)) as Campaign;

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

  const requireProfile = (id: string): DispatcherProfile => {
    const profile = state().config.dispatcherProfilesById.get(id);
    if (profile === undefined) throw new Error(`no dispatcher profile "${id}"`);
    return profile;
  };

  const playStage = (
    stage: CampaignStage,
    candidateProfileId: string,
    edit?: EditedVector,
  ): PlayedStage => {
    /*
     * The **shipped** request constructor, not a second copy of it. A suite that assembled its own
     * would keep passing while the panel drifted.
     */
    const result = runBatch(batchRequestForStage(stage, candidateProfileId, edit), resourcesFor(stage));
    const report = batchReport(result);
    return { result, report, verdict: judgeStage({ stage, published: publishedFor(stage), result, report }) };
  };

  const playToVerdict = (
    stage: CampaignStage,
    candidateProfileId: string,
    edit?: EditedVector,
  ): Promise<PlayedStage> =>
    runStageToVerdict({
      stage,
      published: publishedFor(stage),
      candidateProfileId,
      edit,
      run: (request) => runBatch(request, resourcesFor(stage)),
    });

  const failStatesFor = (
    stage: CampaignStage,
    result: BatchResult,
    candidateProfileId: string,
  ): readonly FailStateReport[] => {
    const { config, dimensionHelp } = state();
    const building = requireBuilding(config, stage.building);
    const profile = requireProfile(candidateProfileId);
    const replication = result.arms[1]?.replications ?? [];
    const seed = stageReplicationSeed(stage, 0).toString();
    /* The batch's own replication-0 seed, asserted rather than assumed to be the same number. */
    expect(replication[0]?.seed).toBe(seed);
    const { recording } = recordRun(
      demonstrationConfigFor({
        stage,
        building,
        dispatcherProfile: profile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        dispatcherProfiles: config.dispatcherProfiles,
      }),
    );
    return failStateReports({
      stage,
      counts: failStateCounts(replication),
      evidence: evidenceFrom({
        recording,
        replication: 0,
        seed,
        restrictedFloorIds: restrictedFloorIds(
          building.floors.map((floor) => floor.id),
          building.accessZones,
        ),
        carriesCredential: credentialCapabilityOf(profile).carriesCredential,
      }),
      dimensionHelp,
    });
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
    get campaign() {
      return state().campaign;
    },
    get space() {
      return state().space;
    },
    get context() {
      return state().context;
    },
    get dimensionHelp() {
      return state().dimensionHelp;
    },
    clone,
    stageAt(index: number): CampaignStage {
      const stage = clone().stages[index];
      if (stage === undefined) throw new Error(`no stage ${String(index)}`);
      return stage;
    },
    mutate(change: (campaign: Campaign) => void): readonly string[] {
      const mutated = clone();
      change(mutated);
      return validateCampaign(mutated, state().context);
    },
    publishedFor,
    resourcesFor,
    requireProfile,
    playStage,
    playToVerdict,
    failStatesFor,
    firstStageWithCountGoals(): CampaignStage {
      const found = state().campaign.stages.find((candidate) =>
        candidate.goals.some((goal) => goal.kind !== 'beat-the-baseline'),
      );
      if (found === undefined) throw new Error('no shipped stage declares a count goal');
      return found;
    },
  };
}
