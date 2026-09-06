/**
 * **Stage 6, after `vertical-city` declared an escalator at every one of its two-level lobbies.**
 *
 * The building's numbers moved twice: once when it declared the ground-lobby escalator — which took
 * `long-waits-under` out of this stage's `goals` bucket, because 49/50 tuning against 50/50 holdout
 * is a classification that does not survive the holdout — and again when it declared the three
 * sky-lobby ones. The second move was smaller: **one cell**, `answer-the-demand` from 7 of 50 to 6
 * of 50 on the holdout set, still a variable and still a batch goal. **No goal returned**, and none
 * was authored to replace the one that left; § D160 selects goals from the measured table and this
 * lane did not touch that rule.
 *
 * So the question *"is stage 6 still playable?"* is answered here the way stage 4's is: by playing
 * it. Four live goals, three of them counts whose bar is the shipped setting's own count, and the
 * comparison goal that no stage clears by standing still.
 *
 * ## Why its own file — GitHub issue #356
 *
 * One batch in the hook and thirteen more in the sweep that names the closest profile, about
 * 65 s on a quiet four-core box. Split out of `campaign.test.ts` with the other played stages so
 * that no one file is a third of the `viz` leg's serial cost; the loaded campaign is
 * `campaign.test-helper.ts`'s.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { useCampaignFixture, type PlayedStage } from './campaign.test-helper.js';
import type { CampaignStage } from './types.js';

const fixture = useCampaignFixture();
const { stageAt, playStage } = fixture;

describe('stage 6, played — three goals survive the escalators, and the bars still reproduce', () => {
  let stage: CampaignStage;
  let unchanged: PlayedStage;

  beforeAll(() => {
    stage = stageAt(5);
    unchanged = playStage(stage, stage.dispatcher.startingProfileId);
  }, 300_000);

  /**
   * **Three, not four, and the missing one is `no-divergence`.**
   *
   * § D254 made this building serviceable and `no-divergence` went to `50/50, 50/50` — a constant,
   * which R12 makes a fact for the briefing rather than a goal, so it left the `goals` bucket and
   * issue #88 recorded the drop. § D265 puts `deliver-everyone` back: the credential gap turns a
   * declared share of in-building journeys away, so *"everybody who arrived was carried"* is a
   * question again — `40/50` on the tuning seeds and `46/50` on the holdout, published in
   * `data/scenario-goals.json` beside the goal, which is R12's whole requirement.
   *
   * So the count went 4 → 2 → 3, and each move is a measurement rather than an edit. The list is
   * asserted rather than the length, because *which* three is the part that would go stale.
   */
  it('carries three live goals — the two counts and the comparison', () => {
    expect(stage.goals.map((goal) => goal.kind)).toEqual([
      'deliver-everyone',
      'answer-the-demand',
      'beat-the-baseline',
    ]);
  });

  it('reproduces every published bar on the changed building', () => {
    /*
     * The clause that would have caught the goal table going stale against the escalators: the
     * bars in `data/scenario-goals.json` are re-derived by running the stage, and a bar that no
     * longer reproduces is refused rather than judged.
     */
    let checked = 0;
    for (const goal of unchanged.verdict.goals) {
      if (goal.reproduced === null) continue;
      checked += 1;
      expect(goal.reproduced, goal.sentence).toBe(true);
    }
    expect(checked).toBe(2);
  });

  it('meets its two count goals at the shipped setting and clears on none of them', () => {
    // Standing still scores every count goal exactly level against its own bar — so the low
    // absolute rates (4 of 50 on `deliver-everyone`) are a **bar**, not a difficulty. What is
    // not cleared is the comparison, which is the whole of what this stage asks a player for.
    for (const goal of unchanged.verdict.goals) {
      if (goal.kind === 'beat-the-baseline') continue;
      expect(goal.met, goal.sentence).toBe(true);
    }
    const comparison = unchanged.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.met).toBe(false);
    expect(unchanged.verdict.metOnTuningSeeds).toBe(false);
    expect(unchanged.verdict.cleared).toBe(false);
  });

  /**
   * **Not clearable from the dropdown any more, and that is a measurement rather than a gap.**
   *
   * This case asserted that `destination-eta` clears stage 6, and it was true when it was written.
   * It is not true now, and the change is § D254's rather than § D265's: making this building
   * serviceable moved every conventional arm's numbers, and `beat-the-baseline` is a comparison
   * against the stage's own starting profile. Swept over **all thirteen shipped profiles** at the
   * stage's own seeds, not one of them resolves ahead on a metric without also resolving behind on
   * one — `zoned-uppeak` comes closest at 1 for and 4 against — so `beat-the-baseline` is met by
   * none and `cleared` is `false` for all thirteen.
   *
   * The claim is therefore **inverted rather than deleted**, which is the only honest option: a
   * case that stopped asking would leave the published *"three stages clear from the dropdown"*
   * count with nothing re-deriving it, which is the exact failure this case was added to fix. What
   * it now pins is the negative, with the witness that comes closest named — so the day a profile
   * does clear it, this fails and says so.
   *
   * **Stage 6 is still playable**, and by the mechanism § D161 already documents for the four
   * stages that never cleared from the dropdown: an edited weight vector. That is stage 2's
   * apparatus and it is not re-run here.
   */
  it('is not clearable from the dropdown by any shipped profile, and names the closest', () => {
    const outcomes = fixture.config.dispatcherProfiles.profiles.map((profile) => {
      const played = playStage(stage, profile.id);
      const rows = played.report.comparisons[0]?.rows ?? [];
      return {
        id: profile.id,
        /*
         * `metOnTuningSeeds`, not `cleared`: `cleared` is `false` on an unvalidated batch whatever
         * the goals said, so this sweep would have gone on passing without measuring anything.
         * What it asserts is that no shipped profile *meets stage 6's bars at all*, which is the
         * stronger of the two claims and the one that was true when this case was written.
         */
        cleared: played.verdict.metOnTuningSeeds,
        for: rows.filter((row) => row.favours === 'candidate').length,
        against: rows.filter((row) => row.favours === 'baseline').length,
      };
    });
    for (const outcome of outcomes) {
      expect(outcome.cleared, `${outcome.id} meets every bar on stage 6`).toBe(false);
    }
    // Not vacuous: somebody does resolve ahead on something, so the refusal is `beat-the-baseline`
    // asking for a dominating move rather than the comparison being dead.
    const ahead = outcomes.filter((outcome) => outcome.for > 0);
    expect(ahead.length).toBeGreaterThan(0);
    for (const outcome of ahead) expect(outcome.against).toBeGreaterThan(0);
  }, 3_000_000);
});
