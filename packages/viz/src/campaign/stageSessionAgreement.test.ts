/**
 * **The persona's stage session is the game's own stage run** — `DECISIONS.md` § D1590.
 *
 * `packages/experiments/src/fuzz/stageSession.ts#stageSessionConfigFor` builds a campaign stage's
 * replication from the plain fields of `data/campaign.json`, because `experiments` may not import
 * this package and the adversarial persona (`elevator-sim fuzz --scenario <id>`) has to run the
 * stage from there. Two builders of one run is this repository's signature defect, so the claim that
 * the two agree is held here, on the side that owns the run: for an **empty** verb log, the session
 * config is the one `stageRun.ts#demonstrationConfigFor` builds for the same stage and replication,
 * and the one `batch/runBatch.ts#armConfigOf` builds for the batch's baseline arm, and on the
 * stages cheap enough to run the legs agree too (the standing requirement's comparison).
 *
 * The control is the other half: a verb on the log must change the legs, or the session would be
 * ignoring the thing it exists to fuzz.
 */

import { describe, expect, it } from 'vitest';

import { runSimulation, type SimulationConfig } from '@elevator-sim/core/browser';
import {
  playStageOf,
  replicationSeed,
  stageSessionConfigFor,
  type StageSessionResources,
} from '@elevator-sim/experiments/browser';

import { armConfigOf } from '../batch/runBatch.js';
import { requireBuilding } from '../fixtures.test-helper.js';
import { useCampaignFixture } from './campaign.test-helper.js';
import { batchRequestForStage, demonstrationConfigFor } from './stageRun.js';
import type { CampaignStage } from './types.js';

const fixture = useCampaignFixture();

function resourcesOf(stage: CampaignStage): StageSessionResources {
  return {
    building: requireBuilding(fixture.config, stage.building),
    dispatcherProfile: fixture.requireProfile(stage.dispatcher.startingProfileId),
    trafficProfiles: fixture.config.trafficProfiles,
    elevatorSpecs: fixture.config.elevatorSpecs,
    dispatcherProfiles: fixture.config.dispatcherProfiles,
  };
}

function sessionOf(stage: CampaignStage, replication: number, log: SimulationConfig['interventions'] = []): SimulationConfig {
  return stageSessionConfigFor(playStageOf(fixture.raw, stage.id), resourcesOf(stage), replication, log ?? []);
}

function demonstrationOf(stage: CampaignStage, replication: number): SimulationConfig {
  const resources = resourcesOf(stage);
  return demonstrationConfigFor({
    stage,
    building: resources.building,
    dispatcherProfile: resources.dispatcherProfile,
    trafficProfiles: resources.trafficProfiles,
    elevatorSpecs: resources.elevatorSpecs,
    dispatcherProfiles: resources.dispatcherProfiles,
    replication,
  });
}

function baselineArmOf(stage: CampaignStage, replication: number): SimulationConfig {
  const request = batchRequestForStage(stage, stage.dispatcher.startingProfileId);
  const arm = request.arms[0];
  if (arm === undefined) throw new Error('a stage batch has no baseline arm');
  return {
    ...armConfigOf(request, fixture.resourcesFor(stage), arm),
    seed: replicationSeed(request.seed, replication),
    replication,
  };
}

describe('the persona’s stage session is the stage run the game builds', () => {
  it('reads every stage the way the game does: the same config as demonstrationConfigFor and the baseline arm', () => {
    expect(fixture.campaign.stages.length).toBeGreaterThan(0);
    for (const stage of fixture.campaign.stages) {
      for (const replication of [0, 7, stage.replications - 1]) {
        const session = sessionOf(stage, replication);
        expect(session, `${stage.id} replication ${String(replication)} against demonstrationConfigFor`).toEqual(
          demonstrationOf(stage, replication),
        );
        expect(session, `${stage.id} replication ${String(replication)} against the batch's baseline arm`).toEqual(
          baselineArmOf(stage, replication),
        );
      }
    }
  });

  it('runs the same legs as the game’s replication, on a stage with the full-run window and on one with a demand override', () => {
    const stages = fixture.campaign.stages.filter(
      (stage) => stage.id === 'stage-1-first-call' || stage.id === 'stage-2-morning-rush',
    );
    expect(stages).toHaveLength(2);
    for (const stage of stages) {
      for (const replication of [0, 7]) {
        const session = runSimulation(sessionOf(stage, replication));
        const game = runSimulation(baselineArmOf(stage, replication));
        expect(session.record.passengers.length).toBeGreaterThan(0);
        expect(session.record.passengers, `${stage.id} replication ${String(replication)}`).toEqual(game.record.passengers);
      }
    }
  }, 120_000);

  it('carries the verb log into the run: a press changes the legs, on the same crowd', () => {
    const stage = fixture.campaign.stages[0];
    if (stage === undefined) throw new Error('the campaign has no first stage');
    const empty = runSimulation(sessionOf(stage, 0));
    const pressed = runSimulation(sessionOf(stage, 0, [{ atS: 0, change: { kind: 'spread-cars' } }]));
    expect(pressed.record.passengers).not.toEqual(empty.record.passengers);
    expect(pressed.trace.passengers).toEqual(empty.trace.passengers);
  });
});
