/**
 * **The pair a stage press plays is the batch's own replication 0** — GitHub issue #626 item 4,
 * [§ D1496](../../../../DECISIONS.md).
 *
 * `stageRun.ts#demonstrationConfigFor` has said since it was written that it is *"the batch's own
 * replication 0"*, and `campaign.test.ts` pinned its seed, horizon, demand and `onTimeout` only. The
 * stage screen now plays it to a player under the caption *one of the stage's crowds*, so the claim
 * is held here on the legs, which is the standing requirement's comparison: the candidate pane's
 * recording against the one `runBatch` makes for replication 0 of the candidate arm, built through
 * `batch/runBatch.ts#armConfigOf`, the constructor the batch loop itself calls. Both a shipped
 * profile and an edited one are asked, because the two reach the dispatcher by different routes
 * (`stagePress.ts#admitStageMove` resolves the page's edit; `runBatch.ts#armProfile` resolves the
 * batch's).
 *
 * The second half is the control: a different move must change the candidate pane's legs, and the
 * baseline pane must not move with it, which is the same crowd under the stage's own setting.
 */

import { describe, expect, it } from 'vitest';

import { metricOf, replicationSeed } from '@elevator-sim/experiments/browser';

import { armConfigOf, runBatch } from '../batch/runBatch.js';
import { sameCrowd } from '../record/crowd.js';
import { recordRun } from '../record/recordRun.js';
import { useCampaignFixture } from './campaign.test-helper.js';
import { admitStageMove, stageUnitsAt, type StageMove } from './stagePress.js';
import { batchRequestForStage, stageWatchConfigsOf } from './stageRun.js';
import { requireBuilding } from '../fixtures.test-helper.js';
import type { CampaignStage } from './types.js';

const fixture = useCampaignFixture();

const finiteOrNull = (value: number): number | null => (Number.isFinite(value) ? value : null);

const PARKING = 'idle.parkingStrategy';

function stageOne(): CampaignStage {
  const stage = fixture.campaign.stages[0];
  if (stage === undefined) throw new Error('the campaign has no first stage');
  return stage;
}

/** The pair the screen plays for `move`, from the admission's own resolved candidate. */
function watchPairOf(stage: CampaignStage, move: StageMove) {
  const { config, space, context } = fixture;
  const building = requireBuilding(config, stage.building);
  const baseline = fixture.requireProfile(stage.dispatcher.startingProfileId);
  const admission = admitStageMove(
    { space, schedule: context.schedule, baseline, building, elevatorSpecs: config.elevatorSpecs },
    move,
    // A wide budget: this file asks what the pair runs, not whether the page sells it.
    Math.max(stageUnitsAt(stage, null), 1_000),
  );
  if (admission.candidate === undefined) throw new Error('the move did not resolve to a dispatcher');
  return stageWatchConfigsOf({
    stage,
    building,
    baseline,
    candidate: admission.candidate,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  });
}

/** Replication 0 of the batch's candidate arm, exactly as `runBatch`'s loop builds it. */
function batchReplicationZero(stage: CampaignStage, move: StageMove) {
  const request = batchRequestForStage(stage, move.profile.id, move.edit);
  const arm = request.arms[1];
  if (arm === undefined) throw new Error('a stage batch has no candidate arm');
  const seed = replicationSeed(request.seed, 0);
  return { request, config: { ...armConfigOf(request, fixture.resourcesFor(stage), arm), seed, replication: 0 } };
}

describe('the pair a stage press plays is replication 0 of its own batch', () => {
  it('plays the candidate arm’s replication 0, leg for leg, for a shipped profile and for an edited one', () => {
    const stage = stageOne();
    const shipped: StageMove = { profile: fixture.requireProfile('nearest-car') };
    const base = fixture.requireProfile(stage.dispatcher.startingProfileId);
    const edited: StageMove = {
      profile: base,
      edit: { baseProfileId: base.id, profileId: `${base.id}-parked-zone-center`, values: { [PARKING]: 'zone-center' } },
    };
    for (const move of [shipped, edited]) {
      const pair = watchPairOf(stage, move);
      const pane = recordRun(pair.candidate, { recordDecisions: false });
      const { request, config } = batchReplicationZero(stage, move);
      const batch = recordRun(config);
      expect(pane.recording.legs.length).toBeGreaterThan(0);
      expect(pane.recording.legs, `the pane is not the batch's replication 0 under ${move.edit?.profileId ?? move.profile.id}`).toEqual(
        batch.recording.legs,
      );
      /* And the batch itself agrees, on its own reported statistics for that replication. */
      const ran = runBatch({ ...request, replications: 1 }, fixture.resourcesFor(stage));
      const replication = ran.arms[1]?.replications[0];
      expect(replication?.awtIsValid).toBe(pane.recording.summary.awtIsValid);
      expect(replication?.metrics.awtS ?? null).toBe(finiteOrNull(metricOf(pane.result.summary, 'awtS')));
      expect(ran.arms[1]?.replications[0]?.seed).toBe(pair.candidate.seed.toString());
    }
  }, 120_000);

  it('moves the candidate pane when the move changes, and leaves the baseline pane on the same crowd', () => {
    const stage = stageOne();
    const asBuilt = watchPairOf(stage, { profile: fixture.requireProfile(stage.dispatcher.startingProfileId) });
    const moved = watchPairOf(stage, { profile: fixture.requireProfile('nearest-car') });
    const before = recordRun(asBuilt.candidate, { recordDecisions: false }).recording;
    const after = recordRun(moved.candidate, { recordDecisions: false }).recording;
    const baseline = recordRun(moved.baseline, { recordDecisions: false }).recording;
    expect(after.legs, 'a different setting played the same run').not.toEqual(before.legs);
    /* The control arm is the stage's own setting on that crowd, whichever move the player made. */
    expect(baseline.legs).toEqual(before.legs);
    /* Same passengers: the two panes carry one crowd, as `record/crowd.ts` reads a crowd. */
    expect(sameCrowd(after, baseline)).toBe(true);
  }, 120_000);
});
