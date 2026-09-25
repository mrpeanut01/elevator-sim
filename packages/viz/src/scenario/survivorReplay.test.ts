/**
 * **Every published way through is one a player's press is admitted to, and one it clears** — the
 * swarm's Q3 ruling, clause 5 (S3's replay, S2's always-on half), [§ D1129](../../../../DECISIONS.md).
 *
 * `data/scenario-survivors.json` names the ways through each stage, and the Scenario hub prints the
 * count on the stage's own face. Until § D1129 the census and the Lab admitted by different rules,
 * so the table named `zoned-uppeak` for stage 1 and `predictive-balanced` for stage 5 and the Lab
 * refused both. This file holds the table to the press, in two halves:
 *
 * - **Always on, simulating nothing.** Every named survivor, at every rung that names it, is
 *   admitted by `campaign/stagePress.ts#admitStageMove` at that rung's units. A named dial
 *   configuration (`edit-<n>`) is re-drawn from the published sampler seed, which the draw is a pure
 *   function of, and admitted the same way.
 * - **Deep (`ELEVATOR_SIM_SURVIVORS=deep`, the census's own nightly job).** Every named survivor is
 *   pressed through `campaign/stagePress.ts#pressStage` — the admission, then the stage's own judge
 *   on its tuning and holdout seeds, the press the Everyday stage page makes — and must clear. Each
 *   is played once, at the cheapest rung that names it, because a verdict does not depend on the
 *   rung (`measureSurvivors.ts` says why and `budgetReachesTheRun.test.ts` holds it).
 *
 * The census's own re-run (`survivorSweep.test.ts`) re-derives the counts; this re-derives the
 * **names** through the player's path. They share a job and differ in what a red means: a moved
 * count is a finding about the content, and a named route that no longer clears through the press is
 * a hub publishing a way through nobody can make.
 */

import { readFile } from 'node:fs/promises';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { runBatch } from '../batch/runBatch.js';
import { admitStageMove, pressStage, type StageAdmissionContext, type StageMove } from '../campaign/stagePress.js';
import type { CampaignStage } from '../campaign/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PublishedGoalRates } from './published.js';
import { SCENARIO_SURVIVORS_PATH, loadSurvivorFixture } from './regenerateSurvivors.test-helper.js';
import { sampleReachableConfigurations } from './survivorSpace.js';
import type { PublishedSurvivorStep, PublishedSurvivors } from './survivors.js';

const DEEP = process.env['ELEVATOR_SIM_SURVIVORS'] === 'deep';

let config: LoadedConfig;
let space: SearchSpace;
let stages: readonly CampaignStage[];
let published: PublishedGoalRates;
let table: PublishedSurvivors;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  space = collectSearchSpace();
  const fixture = await loadSurvivorFixture();
  stages = fixture.campaign.stages;
  published = fixture.published;
  table = JSON.parse(await readFile(SCENARIO_SURVIVORS_PATH, 'utf8')) as PublishedSurvivors;
}, 120_000);

function contextOf(stage: CampaignStage): StageAdmissionContext {
  const baseline = config.dispatcherProfilesById.get(stage.dispatcher.startingProfileId);
  if (baseline === undefined) throw new Error(`${stage.id}: no starting profile`);
  return {
    space,
    schedule: shippedPriceSchedule(),
    baseline,
    building: requireBuilding(config, stage.building),
    elevatorSpecs: config.elevatorSpecs,
  };
}

/**
 * The move a published survivor name stands for: a shipped profile by id, or a drawn dial
 * configuration re-drawn from the rung's own published sampler seed.
 */
function moveOf(stage: CampaignStage, step: PublishedSurvivorStep, name: string): StageMove {
  const profile = config.dispatcherProfilesById.get(name);
  if (profile !== undefined) return { profile };
  const index = /^edit-(\d+)$/u.exec(name)?.[1];
  if (index === undefined) throw new Error(`${stage.id}: the table names "${name}", which is neither a profile nor a draw`);
  const context = contextOf(stage);
  const drawn = sampleReachableConfigurations({
    space,
    schedule: context.schedule,
    baseline: context.baseline,
    building: requireBuilding(config, stage.building),
    elevatorSpecs: config.elevatorSpecs,
    units: step.units,
    sampleSize: step.sampling.sampleSize,
    seed: step.sampling.seed,
  }).configurations[Number(index)];
  if (drawn === undefined) throw new Error(`${stage.id}: ${name} is not in its rung's re-drawn sample`);
  return {
    profile: context.baseline,
    edit: { baseProfileId: context.baseline.id, profileId: name, values: drawn.values },
  };
}

/** Every `(stage, rung, name)` the table publishes as a way through. */
function namedRoutes(): readonly { stage: CampaignStage; step: PublishedSurvivorStep; name: string }[] {
  const out: { stage: CampaignStage; step: PublishedSurvivorStep; name: string }[] = [];
  for (const scenario of table.scenarios) {
    const stage = stages.find((entry) => entry.id === scenario.id);
    if (stage === undefined) throw new Error(`the table names ${scenario.id}, which the campaign does not ship`);
    for (const step of scenario.steps) {
      for (const name of step.survivorNames) out.push({ stage, step, name });
    }
  }
  return out;
}

describe('every published way through is admitted by the one check, at every rung that names it — § D1129', () => {
  it('admits each named survivor at its rung’s units', () => {
    const routes = namedRoutes();
    expect(routes.length, 'the table names no way through, so this case tests nothing').toBeGreaterThan(0);
    for (const { stage, step, name } of routes) {
      const admission = admitStageMove(contextOf(stage), moveOf(stage, step, name), step.units);
      expect(admission.admitted, `${stage.id} ${step.stepId ?? 'base'} ${name}: ${admission.sentence}`).toBe(true);
      expect(admission.moved.length, `${stage.id} ${name} moves nothing, so it is the baseline`).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!DEEP)('every published way through clears through the player’s press — § D1129, deep', () => {
  it('presses each named survivor once and requires it to clear on both seed sets', async () => {
    const played = new Map<string, boolean>();
    const lines: string[] = [];
    for (const { stage, step, name } of namedRoutes()) {
      const key = `${stage.id} ${name}`;
      if (played.has(key)) continue;
      const scenario = published.scenarios.find((entry) => entry.id === stage.id);
      if (scenario === undefined) throw new Error(`${stage.id}: no published goal row`);
      const started = Date.now();
      const press = await pressStage({
        stage,
        published: scenario,
        context: contextOf(stage),
        move: moveOf(stage, step, name),
        budgetUnits: step.units,
        run: (request) =>
          runBatch(request, {
            building: requireBuilding(config, stage.building),
            dispatcherProfiles: config.dispatcherProfiles,
            trafficProfiles: config.trafficProfiles,
            elevatorSpecs: config.elevatorSpecs,
          }),
      });
      const cleared = press.kind === 'judged' && press.outcome.verdict.cleared;
      played.set(key, cleared);
      lines.push(`${key}: ${press.kind === 'refused' ? `refused — ${press.admission.sentence}` : cleared ? 'cleared' : press.outcome.verdict.headline} (${String(Math.round((Date.now() - started) / 1000))} s)`);
    }
    process.stderr.write(`survivor replay\n${lines.join('\n')}\n`);
    expect(played.size).toBeGreaterThan(0);
    expect(
      [...played.entries()].filter(([, cleared]) => !cleared).map(([key]) => key),
      'a way through the Scenario hub publishes does not clear through the press a player makes',
    ).toEqual([]);
  }, 3_600_000);
});
