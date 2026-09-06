/**
 * **Stage 5, played from the dropdown** — whether a stage can be won at all.
 *
 * One case, and it is the most expensive one in the `viz` project: every shipped profile played to
 * a verdict on stage 5, through the holdout batch wherever the tuning batch met every bar. Its
 * docstring below carries the measurement it pins and why it is a search with a floor rather than a
 * pinned profile id.
 *
 * ## Why a file of its own — GitHub issue #356
 *
 * 131.7 s on a quiet four-core box, measured on 2026-09-06 before the split, against a `viz` leg
 * whose summed serial cost was 897.1 s — so this one case is about 14.7 % of the leg by itself, and
 * vitest runs a file's cases in series. Anything else in the same file would sit on top of that.
 * The rest of stage 5 is `stageFiveCredential.test.ts`, whose hook plays one batch this case does
 * not read; the `describe` title is kept identical there and here, because
 * `documentation.test.ts`'s S5 check reads the played stages off the titles in this directory and
 * stage 5 is one played stage in two files.
 *
 * The case is not split further, and could not honestly be: its last assertion compares the set
 * that cleared with the set that met every bar on the tuning seeds, over **all** thirteen profiles,
 * so two files each sweeping half would each be asserting a different and weaker thing.
 */

import { describe, expect, it } from 'vitest';

import { useCampaignFixture } from './campaign.test-helper.js';

const fixture = useCampaignFixture();
const { stageAt, playToVerdict } = fixture;

describe('stage 5, played — the credential is named, and the lesson is that it is not congestion', () => {
  /**
   * **The answer to "is this playable?", and § D265 moved it here from stage 4.**
   *
   * This was stage 4's case — *a measured clear, from a profile `data/` already ships, inside the
   * dimensions the stage opens*. It has to live somewhere, because a campaign whose every stage is
   * unwinnable from the dropdown is a product claim nobody is re-deriving; and it has to live where
   * the measurement puts it, not where it was written. Swept over the thirteen shipped profiles at
   * the stage's own seeds, stage 4 now clears on **none** and stage 5 clears on **several**, so the
   * two cases swapped buildings. § D254 is what moved them: it changed what every conventional arm
   * on every access-zoned building does, and `beat-the-baseline` is a comparison against the
   * stage's own starting profile.
   *
   * Written as a **search with a stated floor** rather than a pinned profile id: which profile
   * clears is a measurement that will move again, and a test naming one would be re-pinned every
   * time without anybody re-reading the claim. What may not move is that at least one does.
   *
   * ## The clear now has to survive the holdout, and that moved which profile it is
   *
   * Issue #255's second half. Judged on the tuning batch alone, **six** of the thirteen meet every
   * bar here — `eta`, `energy-aware`, `fairness-first`, `capacity-aware`, `predictive-balanced`,
   * `auction`. Run again on the stage's declared holdout seeds, **one** survives:
   * `predictive-balanced`. Every one of the other five is beaten on a count goal it met on the
   * seeds it was measured on — `eta` loses `deliver-everyone`, `no-divergence` *and*
   * `answer-the-demand` there.
   *
   * That is what the holdout is for and it is the case for the split in one line: five of six
   * apparent clears on this stage were a fit to fifty passenger populations. It also means the
   * measurement `docs/33` § 3.1 publishes — *stage 5 clears under `eta`* — was taken under the old
   * judge and no longer names the same profile; that table is a published number pinned to a run,
   * and this is the run that moved it.
   *
   * Still a search with a floor, for the reason above, and still expressed as *at least one*. The
   * floor is what makes DC-3's question — *is this campaign winnable at all?* — a measurement.
   */
  it('clears from the dropdown, on the holdout seeds too — whether a stage can be won', async () => {
    const stage = stageAt(4);
    const clears = [];
    const metOnTuning = [];
    for (const profile of fixture.config.dispatcherProfiles.profiles) {
      const attempt = await playToVerdict(stage, profile.id);
      const rows = attempt.report.comparisons[0]?.rows ?? [];
      if (attempt.verdict.metOnTuningSeeds) metOnTuning.push(profile.id);
      if (!attempt.verdict.cleared) continue;
      clears.push(profile.id);
      // The clear is the shape `beat-the-baseline` describes and not an accident of an empty
      // comparison: something resolved ahead, and nothing resolved against.
      expect(rows.filter((row) => row.favours === 'candidate').length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.favours === 'baseline')).toEqual([]);
      for (const goal of attempt.verdict.goals) expect(goal.met, goal.sentence).toBe(true);
      // And the same again on the runs it was not tuned against, which is what cleared it.
      expect(attempt.verdict.holdout?.held).toBe(true);
      for (const goal of attempt.verdict.holdout?.goals ?? []) {
        expect(goal.met, goal.sentence).toBe(true);
      }
      /* R2 survives the good news: the headline still says what the number is about. */
      expect(attempt.verdict.headline).toContain('not a ranking of dispatchers');
    }
    expect(clears.length, 'no shipped profile clears stage 5 from the dropdown').toBeGreaterThan(0);
    /*
     * The gate is measured rather than asserted to be free: if the holdout ever stopped removing
     * anybody, the split would have become decoration on this stage and the sentence above would
     * be describing a rule that no longer bites.
     */
    expect(clears.length).toBeLessThan(metOnTuning.length);
  }, 3_000_000);
});
