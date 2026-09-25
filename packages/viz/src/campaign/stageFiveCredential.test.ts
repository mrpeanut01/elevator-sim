/**
 * **Stage 5, played** — the credential is named, and the lesson is that it is not congestion.
 *
 * The access-zoned stage: locked-out landings diagnosed by floor and by credential on the shipped
 * setting, cleared when the call carries the credential, and the lesson's move admitted by the one
 * admission check (§ D1129) — with a move the budget cannot pay for refused.
 *
 * ## Why its own file, and why the sweep is not in it — GitHub issue #356
 *
 * One batch in the hook and two replayed demonstrations, about ten seconds. The fourth case that
 * used to sit in this `describe` — *clears from the dropdown, on the holdout seeds too* — is
 * **`stageFiveClears.test.ts`**, on its own, because it is the single most expensive case in the
 * `viz` project: thirteen shipped profiles played to a verdict, six of them through the holdout
 * batch as well, 131.7 s on a quiet four-core box. Vitest runs a file's cases in series, so a file
 * holding that case and this hook's batch would have been above the share #356 allows, and that
 * case reads nothing this hook produces — it plays every profile from scratch. Same `describe`
 * title over there, on purpose: `documentation.test.ts`'s S5 check reads the played stages off the
 * titles in this directory, and stage 5 is one played stage in two files.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { useCampaignFixture, type PlayedStage } from './campaign.test-helper.js';
import { admitStageMove, stageUnitsAt } from './stagePress.js';
import type { CampaignStage } from './types.js';
import { requireBuilding } from '../fixtures.test-helper.js';

const fixture = useCampaignFixture();
const { stageAt, requireProfile, playStage, failStatesFor } = fixture;

describe('stage 5, played — the credential is named, and the lesson is that it is not congestion', () => {
  let stage: CampaignStage;
  let played: PlayedStage;

  beforeAll(() => {
    stage = stageAt(4);
    played = playStage(stage, stage.dispatcher.startingProfileId);
  }, 300_000);

  it('diagnoses locked-out landings by floor and by credential', () => {
    const reports = failStatesFor(stage, played.result, stage.dispatcher.startingProfileId);
    const locked = reports.find((report) => report.state === 'locked-out');
    expect(locked?.occurredInDemonstration).toBe(true);
    expect(locked?.diagnosis).toMatch(/holding [a-z-]+/);
    expect(locked?.sentence).toContain('It is not congestion');
  });

  it('clears the lockout when the call carries the credential', () => {
    const reports = failStatesFor(stage, played.result, 'destination-eta');
    const locked = reports.find((report) => report.state === 'locked-out');
    expect(locked?.occurredInDemonstration).toBe(false);
    expect(locked?.diagnosis).toContain('could legally be answered');
  });

  /**
   * **The lesson's move and the census's survivor are both admitted, by the one check** —
   * [§ D1129](../../../../DECISIONS.md).
   *
   * This case asserted the opposite half until the swarm's Q3 ruling: that stage 5's legacy
   * `editable` list admitted `destination-eta` and **refused** `predictive-balanced`. The census
   * named `predictive-balanced` as this stage's one way through at every rung, so the hub advertised
   * a route the surface refused, and this file held the refusal in place. Under the one admission
   * check the question is the census's — does the base rung pay for what the profile moves? — and
   * both answers are yes. The refusal half is kept, one rung lower: a budget that cannot pay for
   * destination panels refuses them with the price named, which is what makes the check a check.
   */
  it('admits the lesson’s move and the census’s survivor at the base rung, and refuses what the budget cannot pay', () => {
    const context = {
      space: fixture.space,
      schedule: fixture.context.schedule,
      baseline: requireProfile(stage.dispatcher.startingProfileId),
      building: requireBuilding(fixture.config, stage.building),
      elevatorSpecs: fixture.config.elevatorSpecs,
    };
    const base = stageUnitsAt(stage, null);
    const lesson = admitStageMove(context, { profile: requireProfile('destination-eta') }, base);
    expect(lesson.admitted, lesson.sentence).toBe(true);
    expect(lesson.moved.map((dimension) => dimension.id)).toContain('dispatch.callType');
    const survivor = admitStageMove(context, { profile: requireProfile('predictive-balanced') }, base);
    expect(survivor.admitted, survivor.sentence).toBe(true);
    expect(survivor.units).toBeLessThanOrEqual(base);

    const short = admitStageMove(context, { profile: requireProfile('destination-eta') }, lesson.units - 1);
    expect(short.admitted).toBe(false);
    expect(short.reason).toContain(`costs ${String(lesson.units)} units`);
  });
});
