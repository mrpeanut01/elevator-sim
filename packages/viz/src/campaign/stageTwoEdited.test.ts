/**
 * **Stage 2, played on an edited weight vector** — the thing a dropdown could not do, and
 * § D161's known limit.
 *
 * W6's player move is an authored vector rather than a shipped profile, and this file plays one
 * through the shipped constructors on both seed sets: it meets every bar on the seeds it was tuned
 * on, it is refused on the holdout seeds — the overfitting gate doing its job — and a batch run on
 * the wrong seed set is refused rather than scored. The vector is defined below, in a `.test.ts`,
 * because `campaign.test.ts`'s dimension-literal guard reads every other `.ts` in this directory
 * and a helper carrying the two ids would trip it.
 *
 * ## Why its own file — GitHub issue #356
 *
 * Five batches across four cases, about eleven seconds on a quiet four-core box, and no hook. Split
 * out of `campaign.test.ts` with the other played stages so that no one file is a third of the
 * `viz` leg's serial cost; the loaded campaign is `campaign.test-helper.ts`'s.
 */

import { describe, expect, it } from 'vitest';

import { useCampaignFixture } from './campaign.test-helper.js';
import { admitProfile } from './dimensions.js';
import { judgeStage } from './judge.js';
import { editableIdsOf } from './parse.js';
import type { CampaignStage } from './types.js';
import { resolveEditedProfile, type EditedVector } from '../controls/editedProfile.js';

const fixture = useCampaignFixture();
const { stageAt, publishedFor, requireProfile, playStage, playToVerdict } = fixture;

/**
 * A stage's building and its sensor specs, as `controls/editedProfile.ts#EditTarget`.
 *
 * GitHub issue **#475**: an edited vector is admissible **on a building**, never in the abstract,
 * because `answer.maxDwellS` under an adaptive dwell policy is bounded by a car's door timings.
 * Drawn from the same `resourcesFor` the played batches use, so the admission and the run cannot
 * be about two different towers.
 */
function targetOf(stage: CampaignStage): {
  readonly building: ReturnType<typeof fixture.resourcesFor>['building'];
  readonly elevatorSpecs: ReturnType<typeof fixture.resourcesFor>['elevatorSpecs'];
} {
  const resources = fixture.resourcesFor(stage);
  return { building: resources.building, elevatorSpecs: resources.elevatorSpecs };
}

describe('stage 2, played on an edited weight vector — the thing a dropdown could not do', () => {
  /**
   * The vector, and it is not a shipped profile.
   *
   * [§ D161](../../../../DECISIONS.md) measured that **three** of the seven stages clear from the
   * dispatcher dropdown alone — 3, 4 and 7 — and named the reason the other four do not:
   * *"the player's move is a shipped profile, not a live weight editor … so four stages need an
   * authored weight vector to clear."* Stage 2 is one of the four. This is that vector.
   *
   * Two dimensions, both inside the sixteen stage 2 declares editable. Found by sweeping
   * `weights.loadFactor` on the stage's own tuning seeds, which is exactly the thing the second
   * test below is about.
   */
  const EDIT: EditedVector = {
    baseProfileId: 'collective',
    profileId: 'collective-edited',
    values: { 'weights.waitTime': 1, 'weights.loadFactor': 2.25 },
  };

  it('meets every bar on the seeds it was tuned on — three goals, two measures ahead', () => {
    /*
     * **`metOnTuningSeeds`, and this case is the reason that field has a name.** It used to read
     * `cleared`, and what it was measuring was never *"this stage is won"*: it was *"this vector,
     * swept on these fifty traces, wins on these fifty traces"*. Issue #255's second half made the
     * difference visible by making it decide something, and the case below is the other half of
     * the same measurement.
     */
    const stage = stageAt(1);
    const played = playStage(stage, stage.dispatcher.startingProfileId, EDIT);
    expect(played.verdict.metOnTuningSeeds).toBe(true);
    for (const goal of played.verdict.goals) {
      expect(goal.met, goal.sentence).toBe(true);
    }
    const rows = played.report.comparisons[0]?.rows ?? [];
    expect(rows.filter((row) => row.favours === 'candidate').length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.favours === 'baseline')).toEqual([]);
    /* R2 survives the good news, as it does on stage 4. */
    expect(played.verdict.headline).toContain('not a ranking of dispatchers');
  }, 300_000);

  /**
   * **The exploit, and the gate that closes it — `docs/33` § 7 O7, GitHub issue #255.**
   *
   * This vector was found by sweeping `weights.loadFactor` on stage 2's **tuning** seeds until the
   * stage cleared, which is the shortcut the difficulty curve names as its largest open question:
   * *"a curve whose intended solution is `tune until the judged seeds clear` is a curve with a
   * shortcut in it, and the shortcut is invisible to every rule above."* It is the only measured
   * witness of that shortcut in the tree, and it is the one this gate has to stop.
   *
   * Played through the shipped constructors, both batches, exactly as `dev/campaignPanel.ts` will
   * once it grows the second run: it meets every bar on the seeds it was tuned against, and the
   * stage is **not cleared**, because on fifty passenger populations it has never seen it loses
   * `long-waits-under` (41 against a bar of 45) and is beaten on three measures.
   *
   * The two halves are asserted separately on purpose. *Not cleared* alone would also be produced
   * by a gate that refused everything — by a holdout batch that failed to reproduce its bars, say,
   * or by an input nobody supplied — so the case pins that the holdout half was **judged**
   * (`reproduced` is `true` on every count goal there) and that what refused it is a goal it
   * actually missed.
   */
  it('**is refused on the holdout seeds**, which is the overfitting gate doing its job', async () => {
    const stage = stageAt(1);
    const played = await playToVerdict(stage, stage.dispatcher.startingProfileId, EDIT);

    expect(played.verdict.metOnTuningSeeds).toBe(true);
    expect(played.verdict.cleared).toBe(false);

    const holdout = played.verdict.holdout;
    expect(holdout, 'the holdout batch was never run, so nothing was validated').toBeDefined();
    if (holdout === undefined || holdout === null) return;
    expect(holdout.seed).toBe(stage.holdoutSeeds.seed);
    expect(holdout.held).toBe(false);

    // Judged, not refused: every count goal's bar reproduced on the holdout half of the table.
    const counts = holdout.goals.filter((goal) => goal.kind !== 'beat-the-baseline');
    expect(counts.length).toBeGreaterThan(0);
    for (const goal of counts) expect(goal.reproduced, goal.sentence).toBe(true);

    // And it is a goal it missed rather than a goal nobody could answer.
    const missed = holdout.goals.filter((goal) => goal.met === false);
    expect(missed.map((goal) => goal.kind).sort()).toEqual(['beat-the-baseline', 'long-waits-under']);
    expect(holdout.goals.filter((goal) => goal.met === null)).toEqual([]);

    // The player is told which of the two seed sets refused it, in the headline, in words.
    expect(played.verdict.headline).toContain('Not cleared');
    expect(played.verdict.headline).toContain(stage.holdoutSeeds.name);
    expect(played.verdict.headline).toContain('not a ranking of dispatchers');

    /*
     * **And the same batch judged with no holdout at all is refused too, with the other reason.**
     *
     * Free — it is the tuning batch that has already run, judged a second time — and it is the
     * only place in this suite where *met every bar, and no second batch was supplied* can be
     * reached, because reaching it needs an arm that actually meets every bar. Without it the
     * unvalidated branch would be asserted nowhere and could be deleted with every other case
     * still green.
     */
    const unvalidated = judgeStage({
      stage,
      published: publishedFor(stage),
      result: played.result,
      report: played.report,
    });
    expect(unvalidated.metOnTuningSeeds).toBe(true);
    expect(unvalidated.holdout).toBeNull();
    expect(unvalidated.cleared).toBe(false);
    expect(unvalidated.headline).toContain('Not cleared');
    expect(unvalidated.headline).toContain('the runs this setting was tuned against');
  }, 600_000);

  it('runs a profile `data/` does not contain, and the report names the thing that ran', () => {
    // The claim W6 actually makes. `data/dispatcher-profiles.json` has no `collective-edited`, so
    // a batch that resolved arms by id alone could not have run this at all — which is precisely
    // what § D161 recorded as the limitation.
    expect(fixture.config.dispatcherProfilesById.has('collective-edited')).toBe(false);
    const stage = stageAt(1);
    const played = playStage(stage, stage.dispatcher.startingProfileId, EDIT);
    /*
     * The **resolved** id on the result, and the base id on the request. Found by driving: with
     * the request's id on the result the comparison rows read *"the difference between collective
     * and collective"* on a batch whose two arms were a shipped profile and an edit of it, so the
     * one surface whose job is telling two arms apart could not.
     */
    expect(played.result.arms[0]?.dispatcherProfileId).toBe('collective');
    expect(played.result.arms[1]?.dispatcherProfileId).toBe('collective-edited');
    const rows = played.report.comparisons[0]?.rows ?? [];
    expect(rows.some((row) => row.sentence.includes('collective-edited'))).toBe(true);
  }, 300_000);

  it('**does not survive the holdout seed set**, and the suite carries that half too', () => {
    /*
     * CLAUDE.md § Tuning discipline, arriving as a measurement rather than as a caution: *"Hold
     * out traffic seeds. Tune on one seed set, validate on a disjoint one, or you overfit the
     * weight vector to specific passenger traces and the gain vanishes on new traffic."*
     *
     * It vanished, and worse than vanished. On stage 2's declared holdout seeds the same vector is
     * beaten by the shipped setting on **three** measures, and `beat-the-baseline` resolves
     * against it. The sensitivity is visible in the sweep that found it: `2.2`, `2.25` and `2.3`
     * clear and `2.35` does not.
     *
     * This is asserted rather than mentioned because the alternative — a suite that records the
     * clear and not the failure to generalise — would be publishing the flattering half of a
     * measurement, and § 11 W6's *"a stage cleared on an edited vector"* would read as a stronger
     * result than it is.
     *
     * **What this case is now, and what it stopped being.** Its closing sentence used to be *"the
     * campaign judges on the tuning seeds, so a live weight editor makes overfitting them the
     * dominant strategy, and nothing in the shipped surface says so"* — a finding about the
     * campaign, and `docs/33` § 7's **O7**. Issue #255's second half closed it, and the closure is
     * the case above, which plays this vector through both batches and watches the gate refuse it.
     *
     * What survives here is a different and still-live claim: **a batch run on the wrong seed set
     * is refused rather than scored.** The stage below has its two sets swapped, so the runs are
     * the holdout's and the published counts read are the tuning set's — and every count goal comes
     * back `null` with `reproduced: false`. That is the guard that catches a campaign quietly
     * running a different configuration from the one its goals were measured on, and it is checked
     * on the field that has that meaning rather than on `cleared`, which an unvalidated batch
     * makes `false` whatever the goals said.
     */
    const stage = stageAt(1);
    const onHoldout: CampaignStage = {
      ...stage,
      seeds: stage.holdoutSeeds,
      holdoutSeeds: stage.seeds,
    };
    const played = playStage(onHoldout, stage.dispatcher.startingProfileId, EDIT);
    expect(played.verdict.metOnTuningSeeds).toBe(false);
    expect(played.verdict.cleared).toBe(false);
    const rows = played.report.comparisons[0]?.rows ?? [];
    expect(rows.filter((row) => row.favours === 'baseline').length).toBeGreaterThan(0);
    /*
     * And the count goals are `null` there rather than failed, which is `judge.ts` refusing to
     * judge against a bar that does not reproduce — the published counts are the tuning set's.
     * Stated so a reader does not mistake a refusal for a defeat.
     */
    const counts = played.verdict.goals.filter((goal) => goal.kind !== 'beat-the-baseline');
    expect(counts.length).toBeGreaterThan(0);
    for (const goal of counts) {
      expect(goal.met).toBeNull();
      expect(goal.reproduced).toBe(false);
    }
  }, 300_000);

  it('refuses an edited vector that leaves the dimensions this stage opened', () => {
    // `idle.parkingStrategy` is a real dimension and stage 2 does not declare it editable. The
    // refusal is `admitProfile`'s, on the **resolved** dispatcher, so an edit is held to exactly
    // the rule a shipped profile is.
    const { space } = fixture;
    const stage = stageAt(1);
    const outOfScope = resolveEditedProfile(
      space,
      requireProfile('collective'),
      {
        baseProfileId: 'collective',
        profileId: 'collective-edited',
        values: { 'idle.parkingStrategy': 'lobby' },
      },
      /* The stage's own building — issue #475: an admission is about a vector *on* a building. */
      targetOf(stage),
    );
    expect(outOfScope.ok, outOfScope.ok ? '' : outOfScope.reason).toBe(true);
    if (!outOfScope.ok) return;
    const admission = admitProfile(
      space,
      requireProfile(stage.dispatcher.startingProfileId),
      outOfScope.profile,
      editableIdsOf(stage.dispatcher.editable, space.ids),
    );
    expect(admission.admissible).toBe(false);
    expect(admission.sentence).toContain('idle.parkingStrategy');
  });
});
