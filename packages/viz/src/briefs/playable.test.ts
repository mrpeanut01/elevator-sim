/**
 * **Are the briefs playable?** — the question GitHub issue **#227** turns on, asked as a run.
 *
 * `docs/38` § 2.1 defines a scenario's difficulty as *"the number of affordable configurations that
 * survive"*, and it makes the bottom of that scale a ship condition: *"Many survivors is easy. One
 * survivor is the hardest a scenario is allowed to be. **Zero is not a scenario**"* unless it
 * declares itself a diagnosis. GitHub issue **#367** measured that count for the ten campaign stages
 * and found **six of ten with zero survivors at every budget rung**, so this is not a hypothetical
 * failure mode — it is the commonest outcome in the tree, and a brief authored without checking
 * would very likely be unplayable.
 *
 * ## What is proved here, and what is not
 *
 * A survivor count is a **sweep**, and #367's sweep is a deep-tier job pinned into
 * `data/scenario-survivors.json` and keyed by `(scenarioId, stepId)` against `data/campaign.json`.
 * This file proves the part that decides whether a brief may ship at all, and it proves it in the
 * only direction a cheap test can: **there exists at least one affordable configuration that
 * clears, and the handover setting is not one of them.** A floor of one, and a control at zero.
 *
 * What is deliberately not claimed is the count. Saying *"three of thirteen"* here would be
 * publishing a difficulty figure from a test rather than from the pinned sweep, which is the shape
 * `CLAUDE.md` records going stale three times. The full thirteen-profile sweep behind each brief's
 * shortlist is recorded in `scenario/candidates.ts` beside the configuration it chose.
 *
 * ## Why a shortlist rather than the thirteen
 *
 * Cost. `campaign/stageFiveClears.test.ts` plays all thirteen shipped profiles to a verdict and is
 * **131.7 s — about 14.7 % of the whole `viz` leg by itself**, which is why GitHub issue #356 gave
 * it a file of its own. Two more of those would be a third of the leg for a claim a shortlist
 * makes just as well: the claim is *at least one clears*, and a shortlist that contains one is
 * enough to establish it. It is still a search with a floor rather than a pinned id — the loop
 * tries members in order and stops at the first clear, so the day the first stops clearing it
 * reaches the second and this suite stays green without anybody re-pinning it. What reds it is the
 * whole shortlist failing, which is the statement `docs/38` § 2.1 makes a ship condition.
 *
 * ## The trip-wire is observed rather than assumed
 *
 * `docs/21` § 4's first trip-wire is that a batch-judged bar must already be measured, because
 * `judgeStage` returns `met: null` against a bar that does not reproduce and a `null` goal can
 * never clear. Every case below asserts `reproduced` on every count goal of every batch it runs, so
 * a brief whose row went stale fails here with the reason named rather than quietly never clearing.
 */

import { describe, expect, it } from 'vitest';

import { useBriefsFixture } from './briefs.test-helper.js';
import { runBatch } from '../batch/runBatch.js';
import type { StageGoalVerdict } from '../campaign/judge.js';
import { batchRequestForStage } from '../campaign/stageRun.js';

const fixture = useBriefsFixture();

/**
 * The settings tried per brief, and where the list came from.
 *
 * Each was found by sweeping **all thirteen** shipped profiles to a verdict at that brief's own
 * seeds — the measurement `scenario/candidates.ts` records — and keeping the ones that cleared. The
 * assertion below is that **at least one** still does, never that all of them do.
 */
const SHORTLIST: Readonly<Record<string, readonly string[]>> = {
  'brief-e5-handling-capacity': ['eta', 'fairness-first', 'destination-eta'],
  'brief-e3-diagnose-the-saturation': ['eta', 'capacity-aware', 'predictive-balanced'],
};

function countGoals(goals: readonly StageGoalVerdict[]): readonly StageGoalVerdict[] {
  /* `beat-the-baseline` has no published count, so `reproduced` is `null` on it by construction. */
  return goals.filter((goal) => goal.reproduced !== null);
}

describe('every shipped brief is playable — a measured clear, and a control that is not', () => {
  it('names a shortlist for every brief it ships, and ships a brief for every shortlist', () => {
    const shipped = fixture.briefs.briefs.map((brief) => brief.stage.id).sort();
    expect(Object.keys(SHORTLIST).sort()).toEqual(shipped);
  });

  for (const id of Object.keys(SHORTLIST)) {
    describe(id, () => {
      it('clears from at least one shipped setting, on the tuning batch and on the holdout', async () => {
        const stage = fixture.stageOf(id);
        const tried = SHORTLIST[id] ?? [];
        expect(tried.length).toBeGreaterThan(0);

        /*
         * **Stops at the first clear, because the claim is a floor and not a census.** Playing all
         * three would cost three times as much to establish the same thing — *at least one
         * affordable configuration survives* — and `vitest.config.ts`'s own measurement is that
         * this leg's problem is wall clock rather than annotations. The remaining members are the
         * fallback: the day the first stops clearing, the loop reaches the second and this case
         * stays green without anybody re-pinning it, which is what makes it a search rather than a
         * pinned id.
         */
        const cleared: string[] = [];
        for (const candidate of tried) {
          const played = await fixture.playToVerdict(stage, candidate);
          /* The trip-wire, observed on every batch this suite runs rather than once. */
          for (const goal of countGoals(played.verdict.goals)) {
            expect(goal.reproduced, `${id}/${candidate}/${goal.kind}`).toBe(true);
          }
          if (played.verdict.cleared) {
            cleared.push(candidate);
            break;
          }
        }
        /*
         * A floor, not a pin. `docs/38` § 2.1: zero is not a scenario. If this ever reads zero the
         * brief is unplayable as authored and must be retired or re-measured — the same rule
         * `docs/21` § 4 states for E3's defect, generalised to every brief with goals.
         */
        expect(cleared.length, `${id}: nothing cleared, so this brief is not a scenario`).toBeGreaterThan(0);
      });

      it('does not clear by standing still — the handover setting against itself', async () => {
        /*
         * The liveness control, and it is the half that makes the case above mean something. An
         * unchanged profile scores every count goal exactly level and resolves no interval, so it
         * clears nothing — `judge.ts`'s own *"why clearing a stage cannot happen by standing
         * still"*. A brief where this passed would be a brief that is already solved.
         */
        const stage = fixture.stageOf(id);
        const played = await fixture.playToVerdict(stage, stage.dispatcher.startingProfileId);
        expect(played.verdict.cleared).toBe(false);
        expect(played.verdict.metOnTuningSeeds).toBe(false);
        for (const goal of countGoals(played.verdict.goals)) {
          expect(goal.reproduced, `${id}/${goal.kind}`).toBe(true);
        }
      });
    });
  }
});

describe('E3 still has a suppression to diagnose', () => {
  /*
   * `docs/21` § 4's E3 acceptance, in terms: *"the case's as-given run reproduces its suppression at
   * the pinned seed — asserted in the suite, so a case whose defect stops reproducing goes red and
   * is retired or re-pinned (the register rule: a brief about a defect that no longer exists must
   * stop being shipped)"*.
   *
   * **The ground is read from the run and never authored.** § 4 is explicit about why: *"the case
   * authors the configuration, never the expected ground, because an authored answer key goes stale
   * the day the engine's ordering moves"* — and the five grounds have been re-ordered once already,
   * when `CLAUDE.md`'s fifth landed above censoring rather than below it. So this asserts that a
   * mean is withheld and that the run says why; it does not assert which of the five.
   *
   * **Two consequences of that rule, both taken rather than half-taken.** There is no authored
   * answer key anywhere, because the *name the ground* step § 4 describes is a grading surface and
   * this issue does not build one — what ships is the configuration and the batch-judged fix, so
   * there is nothing that could go stale in the way § 4 warns about. And the brief's own prose does
   * not say which ground fires either: its second sentence read *"some of these runs end with the
   * queue still growing"* until this was written, which is both the answer and a claim that stops
   * being true the day a different ground bites first on the same configuration. It now says that a
   * mean is withheld and that the run gives the reason, which is exactly what the case below
   * asserts and no more.
   */
  it('withholds the mean on some of the handover setting’s own replications, with a reason attached', async () => {
    const stage = fixture.stageOf('brief-e3-diagnose-the-saturation');
    const request = batchRequestForStage(stage, stage.dispatcher.startingProfileId);
    const result = runBatch(request, fixture.resourcesFor(stage));
    const baseline = result.arms[0]?.replications ?? [];
    expect(baseline.length).toBe(stage.replications);

    const withheld = baseline.filter((replication) => !replication.awtIsValid);
    expect(
      withheld.length,
      'the brief is about a report that withholds its average wait, and this run withholds none',
    ).toBeGreaterThan(0);
    /* Not all of them, or there is nothing to compare the withheld runs against. */
    expect(withheld.length).toBeLessThan(baseline.length);

    for (const replication of withheld) {
      /*
       * R3: the reason is shown, never a blank. A withheld figure with no ground is the one thing
       * worse than a quoted one — the player is told to diagnose something the run will not name.
       */
      expect(replication.awtInvalidReason, replication.seed).not.toBeNull();
      expect((replication.awtInvalidReason ?? '').trim().length).toBeGreaterThan(0);
    }
  });
});
