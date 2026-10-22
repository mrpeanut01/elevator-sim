/**
 * **A verdict says when a change moved no count** — wave AQ lane AQ-1, the playtest's stage 3
 * finding: *Min-wait* with lobby parking and *Min-wait* as it stands both passed 10 of 50 runs
 * against the shipped setting's 28, and the page drew two verdicts that read alike with nothing
 * saying the parking had changed no count.
 *
 * Played through the shipped constructors (`campaign.test-helper.ts#playStage`), so the counts are
 * the judge's own (`judge.ts#StageGoalVerdict.counts`), and folded through the screen's own
 * `verdictFactsOf` and {@link sameCountsOf}.
 *
 * **On the engine `DECISIONS.md` § D1603 fixed** the case holds unchanged: both settings pass 10 of
 * 50, now against the shipped setting's 29, its own count re-derived on that engine (§ D1607). The
 * case read no count at all on that engine for as long as `data/scenario-goals.json` still held the
 * old engine's 28, because a bar that does not reproduce is not judged and carries no count.
 */
import { describe, expect, it } from 'vitest';

import { useCampaignFixture } from '../campaign/campaign.test-helper.js';
import type { EditedVector } from '../controls/editedProfile.js';
import {
  STAGE_PLAY_COPY,
  sameCountsOf,
  stageRunCountsOf,
  verdictFactsOf,
  type StageRunCounts,
} from './stagePlay.js';

const fixture = useCampaignFixture();

const PARKING = 'idle.parkingStrategy';

function countsOf(stageIndex: number, profileId: string, parking?: string): StageRunCounts {
  const stage = fixture.stageAt(stageIndex);
  const edit: EditedVector | undefined =
    parking === undefined
      ? undefined
      : { baseProfileId: profileId, profileId: `${profileId}-parked-${parking}`, values: { [PARKING]: parking } };
  return stageRunCountsOf(verdictFactsOf(fixture.playStage(stage, profileId, edit).verdict, undefined).goals);
}

describe('a verdict says when a change moved no count — wave AQ lane AQ-1', () => {
  it('reproduces stage 3: lobby parking under Min-wait gives the counts Min-wait gave, and the page says so', () => {
    const plain = countsOf(2, 'eta');
    const parked = countsOf(2, 'eta', 'lobby');
    /* The judge's counts are the sentence's: every judged per-run goal carries them. */
    expect(plain.size).toBeGreaterThan(0);
    expect([...parked.values()]).toEqual([...plain.values()]);
    const same = sameCountsOf({ counts: parked, control: false, previous: { counts: plain, sameSettings: false } });
    expect(same).toBe('previous');
    expect(sameCountsOf({ counts: parked, control: false, previous: { counts: plain, sameSettings: true } })).toBeUndefined();
  }, 120_000);

  it('says nothing when a count moved: stage 2, the shipped setting then lobby parking on it', () => {
    const stage = fixture.stageAt(1);
    const standing = countsOf(1, stage.dispatcher.startingProfileId);
    const parked = countsOf(1, stage.dispatcher.startingProfileId, 'lobby');
    expect([...parked.values()]).not.toEqual([...standing.values()]);
    expect(sameCountsOf({ counts: parked, control: false, previous: { counts: standing, sameSettings: false } })).toBeUndefined();
    /* The stage's own setting matches its own counts by construction, so the control says nothing. */
    expect(sameCountsOf({ counts: standing, control: true, previous: undefined })).toBeUndefined();
  }, 120_000);

  it('prefers the building’s own counts, and needs a judged count to say anything', () => {
    const row = (yours: number, shipped: number) => ({ yours, shipped, runs: 50 });
    const equal: StageRunCounts = new Map([['a', row(28, 28)], ['b', row(41, 41)]]);
    expect(sameCountsOf({ counts: equal, control: false, previous: { counts: equal, sameSettings: false } })).toBe('shipped');
    expect(sameCountsOf({ counts: new Map(), control: false, previous: undefined })).toBeUndefined();
    for (const text of [STAGE_PLAY_COPY.sameAsShipped, STAGE_PLAY_COPY.sameAsPrevious]) expect(text).not.toMatch(/\d|—/u);
  });
});
