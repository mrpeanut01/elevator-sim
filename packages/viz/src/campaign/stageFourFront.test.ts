/**
 * **Stage 4, played** — a setting that buys one thing by spending another.
 *
 * The witness for the *"and nothing resolved against it"* half of `beat-the-baseline`: a profile
 * that resolves ahead on one measure and behind on another is a move along the front rather than a
 * win, and without a stage that produces one that clause could be deleted with every other
 * assertion in the campaign suites still green. The case's own docstring carries the measurement.
 *
 * ## Why its own file — GitHub issue #356
 *
 * One case, thirteen batches — every shipped profile played on stage 4's tuning seeds — 47.3 s on
 * a quiet four-core box. No hook: the sweep reads nothing but the loaded campaign, which is
 * `campaign.test-helper.ts`'s. Split out of `campaign.test.ts` with the other played stages so that
 * no one file is a third of the `viz` leg's serial cost.
 */

import { describe, expect, it } from 'vitest';

import { useCampaignFixture } from './campaign.test-helper.js';

const fixture = useCampaignFixture();
const { stageAt, playStage } = fixture;

describe('stage 4, played — a setting that buys one thing by spending another', () => {
  /**
   * **The other end of the `beat-the-baseline` clause, and § D265 moved it here from stage 5.**
   *
   * This describe used to be *"a stage that can actually be cleared"*. It is not one any more:
   * swept over the thirteen shipped profiles at the stage's own seeds, **not one clears stage 4** —
   * `zoned-uppeak` comes closest at 2 metrics for and 1 against — and the measured clear has moved
   * to stage 5, where it is asserted. § D254 is what moved it, by changing what every conventional
   * arm on an access-zoned building does.
   *
   * What stage 4 has instead is the **front**: a profile that resolves ahead on one measure and
   * behind on another, which is the case R11 is about and the case that makes the *"and nothing
   * resolved against it"* half of `beat-the-baseline` falsifiable. Without a witness somewhere that
   * clause could be deleted and every other assertion in this file would still pass.
   *
   * A search rather than a pinned profile id, for the reason stage 5's clear is one.
   */
  it('calls a setting ahead on one measure and behind on another a move along the front', () => {
    const stage = stageAt(3);
    let witnesses = 0;
    for (const profile of fixture.config.dispatcherProfiles.profiles) {
      const played = playStage(stage, profile.id);
      const rows = played.report.comparisons[0]?.rows ?? [];
      const ahead = rows.filter((row) => row.favours === 'candidate').length;
      const behind = rows.filter((row) => row.favours === 'baseline').length;
      // Nothing clears this stage from the dropdown any more, and that is asserted rather than
      // assumed: the day something does, this fails and the claim above gets re-read.
      expect(played.verdict.metOnTuningSeeds, `${profile.id} meets every bar on stage 4`).toBe(false);
      if (ahead === 0 || behind === 0) continue;
      witnesses += 1;
      const comparison = played.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
      expect(comparison?.met).toBe(false);
      expect(comparison?.sentence).toContain('ahead on');
      expect(comparison?.sentence).toContain('behind on');
      expect(comparison?.sentence).toContain('a move along the front rather than a win');
    }
    expect(witnesses, 'no shipped profile lands on the front on stage 4').toBeGreaterThan(0);
  }, 3_000_000);
});
