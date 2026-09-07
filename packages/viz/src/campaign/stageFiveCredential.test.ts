/**
 * **Stage 5, played** — the credential is named, and the lesson is that it is not congestion.
 *
 * The access-zoned stage: locked-out landings diagnosed by floor and by credential on the shipped
 * setting, cleared when the call carries the credential, and the dial the lesson needs opened —
 * with a profile that changes anything else refused.
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
import { admitProfile } from './dimensions.js';
import { editableIdsOf } from './parse.js';
import type { CampaignStage } from './types.js';

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

  it('opens the dial the lesson needs and refuses a profile that changes anything else', () => {
    const { space } = fixture;
    const editable = editableIdsOf(stage.dispatcher.editable, space.ids);
    expect(editable).toContain('dispatch.callType');
    expect(
      admitProfile(space, requireProfile('collective'), requireProfile('destination-eta'), editable)
        .admissible,
    ).toBe(true);
    expect(
      admitProfile(space, requireProfile('collective'), requireProfile('predictive-balanced'), editable)
        .admissible,
    ).toBe(false);
  });
});
