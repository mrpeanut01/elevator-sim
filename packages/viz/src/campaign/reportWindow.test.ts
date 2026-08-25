/**
 * **The campaign path's reporting window** — GitHub issue **#255**, the surviving residual of #209.
 *
 * ## The defect, and the population it is measured on
 *
 * `campaign/stageRun.ts` set no `reportWindow`, so `core` fell back to the demand template's own
 * measurement band: five minutes of a fifteen-minute run, at a fixed position in the schedule. On
 * `garden-apartments` — stage 1, the first stage a player ever plays, a building whose whole run is
 * about a dozen arrivals — that band is empty often enough to refuse the run's headline figures on
 * runs that delivered everybody they generated. The refusal is correct on its ground
 * (`empty-window`, the second of the five in `core/src/metrics/awtValidity.ts`); the **window** is
 * the wrong instrument, which is exactly what `shift/reportWindow.ts` established for the Day
 * report and what this closes for the campaign.
 *
 * **The issue's own command line is a different population from the one the product runs, and the
 * difference is stated rather than smoothed.** #255 sweeps *"50 consecutive seeds from 20260730"*
 * through `elevator-sim run --seed <n>`, and names seed **20260730 — the stage's own seed** — as one
 * of the two that suppress. That reproduces exactly (`window peak-5min [5:00 – 10:00)`, `0 arrived`,
 * `AWT SUPPRESSED`, on a run that delivered 10 of 10). But `20260730` is a **master** seed: no
 * replication of this stage is ever run at it. The batch runs `replicationSeed(20260730, i)`, and
 * replication 0 — the run the fail-state report names — is **not** one of the suppressed ones. So
 * the issue's headline case is a true statement about a run the campaign does not make, and the
 * defect is measured below on the runs it does.
 *
 * ## What is pinned here
 *
 * | population, at the stage-1 configuration | suppressed under the template's band | under the shipped window |
 * |---|---|---|
 * | the tuning batch, `replicationSeed(20260730, i)`, i < 50 | **1** | **0** |
 * | the holdout batch, `replicationSeed(20260731, i)`, i < 50 | **2** | **0** |
 *
 * Both counts are asserted, in both directions, because a fix whose *before* has stopped
 * reproducing is a fix nobody can check. Every one of them is `empty-window` on a run that served
 * everybody, which is what makes this the window's defect rather than the building's.
 *
 * ## And what it cost, which is more than a withheld headline
 *
 * A replication whose summary refuses its mean carries `null` for `pctOverLongWait` and
 * `unservedFraction`, so `scenario/goals.ts` scores it `unmeasured` — and **one** `unmeasured` in
 * fifty makes the whole across-seed rate `unjudgeable`, which R12 turns into `not-shippable`.
 * Stage 1's published table withheld `deliver-everyone` and `long-waits-under` on exactly that
 * ground, at 49 of 50 with one unmeasured. A five-minute band that happened to hold nobody took two
 * goals off a stage, and the last test below is that consequence driven rather than described.
 *
 * ## Why this file and not a line in `campaign.test.ts`
 *
 * It is the shape `shift/reportWindow.test.ts` uses, deliberately: **both windows in one test**,
 * because *the figure is published now* is only interesting beside *it was withheld before*. A test
 * that asserted only the after would pass on a building that never had the defect.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { batchRequestForStage, demonstrationConfigFor, stageSeedSetOf } from './stageRun.js';
import { parseCampaign, type CampaignContext } from './parse.js';
import type { Campaign, CampaignStage } from './types.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchReplication, BatchResources, BatchResult } from '../batch/types.js';
import { asPerReplicationGoal, measureGoalRate } from '../scenario/goals.js';
import type { PublishedGoalRates } from '../scenario/published.js';
import { shiftReportWindowFor } from '../shift/reportWindow.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';

let config: LoadedConfig;
let campaign: Campaign;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const published = JSON.parse(
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

/** The stage the rule moves, taken from `data/campaign.json` rather than written down. */
function stageOne(): CampaignStage {
  const stage = campaign.stages[0];
  if (stage === undefined) throw new Error('the shipped campaign declares no stages');
  return stage;
}

function resourcesFor(stage: CampaignStage): BatchResources {
  return {
    building: requireBuilding(config, stage.building),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

/** The shipped request, and the same request with the window taken back off. */
function bothWindows(
  stage: CampaignStage,
  seedSet: 'tuning' | 'holdout',
): { before: BatchResult; after: BatchResult } {
  const request = batchRequestForStage(stage, stage.dispatcher.startingProfileId, undefined, seedSet);
  const resources = resourcesFor(stage);
  return {
    before: runBatch({ ...request, reportWindow: undefined }, resources),
    after: runBatch(request, resources),
  };
}

const baselineOf = (result: BatchResult): readonly BatchReplication[] =>
  result.arms[0]?.replications ?? [];

const suppressed = (replications: readonly BatchReplication[]): readonly BatchReplication[] =>
  replications.filter((replication) => !replication.awtIsValid);

describe('which window a campaign stage is measured over', () => {
  it('is the same rule the shift path reads, and it reaches the request', () => {
    /*
     * The seam, in one assertion: a window decided in `campaign/` and never handed to `core` is
     * this repository's signature defect, and `reportWindow` on a `BatchRequest` is exactly the
     * kind of field that can be authored, carried and consulted by nothing.
     */
    const stage = stageOne();
    expect(shiftReportWindowFor(stage.building)).toBe('full-run');
    expect(batchRequestForStage(stage, 'collective').reportWindow).toBe('full-run');
  });

  it('is one decision, so the replay and the batch read the same runs', () => {
    // The demonstration is the batch's own replication 0, and the fail-state report puts a floor
    // id from it beside counts taken from the fifty. Two windows would make those two sentences
    // about two measurements.
    const stage = stageOne();
    const config_ = demonstrationConfigFor({
      stage,
      building: requireBuilding(config, stage.building),
      dispatcherProfile:
        config.dispatcherProfilesById.get(stage.dispatcher.startingProfileId) ??
        (() => {
          throw new Error('stage 1 names a dispatcher this build does not carry');
        })(),
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      dispatcherProfiles: config.dispatcherProfiles,
    });
    /*
     * Both halves, and the literal, because *"the two agree"* is satisfied by both being absent —
     * which is precisely the state before the fix. A test that asserted only the agreement would
     * have passed on the defect.
     */
    expect(config_.reportWindow).toBe('full-run');
    expect(config_.reportWindow).toBe(batchRequestForStage(stage, 'collective').reportWindow);
  });

  it('moves the stage the matrix moves and leaves the other nine alone', () => {
    /*
     * The shape of the answer, which is what stops the fix from being either inert or a
     * re-measurement of the whole campaign. `garden-apartments` is the only stage building whose
     * matrix cells unanimously declare `full-run`; `midtown-office` has three cells and one
     * dissenter, and three stage buildings have no cells at all. Derived on both sides — a matrix
     * cell added tomorrow moves the rule and this assertion together.
     */
    const moved = campaign.stages.filter(
      (stage) => batchRequestForStage(stage, 'collective').reportWindow !== undefined,
    );
    expect(moved.map((stage) => stage.id)).toEqual(
      campaign.stages
        .filter((stage) => shiftReportWindowFor(stage.building) === 'full-run')
        .map((stage) => stage.id),
    );
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.length).toBeLessThan(campaign.stages.length);
  });
});

describe('stage 1 on its own seed — the runs the band held nobody on', () => {
  /**
   * **The stage's own seed, and both of its batches.**
   *
   * `20260730` is stage 1's declared master seed; `20260731` is its declared holdout. Neither is
   * ever a simulation seed — `replicationSeed` derives fifty of those from each — so the case is
   * named by the seed set rather than by a literal, and the counts below are over the runs the
   * product actually makes.
   */
  const CASES = [
    { seedSet: 'tuning' as const, suppressedBefore: 1 },
    { seedSet: 'holdout' as const, suppressedBefore: 2 },
  ];

  for (const { seedSet, suppressedBefore } of CASES) {
    it(`publishes every headline on the ${seedSet} batch, and did not before`, () => {
      const stage = stageOne();
      const seeds = stageSeedSetOf(stage, seedSet);
      expect(seeds.seed).toBe(seedSet === 'tuning' ? '20260730' : '20260731');

      const { before, after } = bothWindows(stage, seedSet);

      const refused = suppressed(baselineOf(before));
      expect(
        refused.length,
        `${seeds.name}: the template band's suppression count has moved; the fix's "before" no ` +
          'longer reproduces and the pinned figure is stale.',
      ).toBe(suppressedBefore);
      for (const replication of refused) {
        // An *empty window*, not an empty run: the riders turned up, outside the band.
        expect(replication.awtInvalidReason ?? '').toContain('reporting window');
        expect(replication.saturated).toBe(false);
        // And the metrics two goal kinds read are `null` there, which is the cost below.
        expect(replication.metrics.pctOverLongWait).toBeNull();
        expect(replication.metrics.unservedFraction).toBeNull();
      }

      expect(suppressed(baselineOf(after))).toEqual([]);
      for (const replication of baselineOf(after)) {
        expect(replication.metrics.pctOverLongWait).not.toBeNull();
        expect(replication.metrics.unservedFraction).not.toBeNull();
      }
    }, 300_000);
  }

  it('gives stage 1 back the two goals an empty band took off it', () => {
    /*
     * **The actual cost of the defect, driven.** One `unmeasured` replication in fifty makes the
     * whole across-seed rate `unjudgeable`, and R12 turns `unjudgeable` into `not-shippable`. So
     * `long-waits-under` and `deliver-everyone` were in stage 1's `withheld` bucket at 49 of 50 —
     * not because the building is hard, but because a five-minute band happened to hold nobody.
     *
     * Asserted as a *change of class* rather than as a bucket name: which bucket the regenerated
     * table puts them in is `publishedScenarioFor`'s decision from these counts, and pinning the
     * bucket here would be this file having a second opinion about R12.
     */
    const stage = stageOne();
    const { before, after } = bothWindows(stage, 'tuning');
    for (const kind of ['long-waits-under', 'deliver-everyone'] as const) {
      const narrowed = asPerReplicationGoal({
        kind,
        threshold: kind === 'long-waits-under' ? 10 : null,
      });
      expect(narrowed.judgeable).toBe(true);
      if (!narrowed.judgeable) return;
      expect(measureGoalRate(narrowed.spec, baselineOf(before)).rateClass).toBe('unjudgeable');
      expect(measureGoalRate(narrowed.spec, baselineOf(after)).rateClass).not.toBe('unjudgeable');
    }
  }, 300_000);
});
