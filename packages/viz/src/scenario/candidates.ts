/**
 * The configurations whose goals are measured: one per stage of `docs/10` § 5.4's progression, and
 * — since GitHub issue **#227** — one per shipped engineering brief.
 *
 * **The briefs are here rather than in a driver of their own, and that is the first of `docs/21`
 * § 4's two trip-wires enforced rather than promised.** A brief with goals may not ship unless its
 * bar was measured, because `campaign/judge.ts#judgeStage` refuses to judge against a bar that does
 * not reproduce. Measuring them through this list means `regenerate.test-helper.ts` writes their
 * rows and `goalRates.test.ts` re-derives them, exactly as it does the ten stages'. A second driver
 * would have been a second answer to *"what was this bar measured on?"*.
 *
 * **These are not the campaign.** § 5.4's stages carry a brief, an editable dimension set, a
 * suggested lever and an order; none of that is here, and T65 owns all of it. What is here is the
 * part a *run* is a function of — building, dispatcher, horizon, demand — plus the seed sets and
 * the goal kinds each stage is a candidate for, because that is the whole of what a pass rate is
 * measured against. A campaign built on § 5.2's table needs this table first: **it is the input to
 * the campaign, not a preview of it.**
 *
 * ## Why every stage is a candidate for every measurable kind
 *
 * A tempting shortcut is to list only the goals a stage "is about" and measure those. It is the
 * wrong shortcut, and § 5.2's own measurement says why: the goals nobody expected to be constants
 * turned out to be three of five. A stage that never measured `answer-the-demand` would not know
 * whether it is a live goal there or a fact about the building, and the difference is the whole of
 * R12. So every stage measures every kind, and the table records where each one landed.
 *
 * ## The demand levels are chosen, and the choosing is the finding
 *
 * Four of the seven stages run below their building's shipped demand. That is not tuning the
 * problem to be winnable: **M1** measures that at the viewer's own defaults only 14 of 60
 * building × dispatcher cells produce a quotable mean, and § 0 makes shipping scenarios below the
 * saturation ceiling Phase 9's first job. What each stage runs at is on the record, in
 * `data/scenario-goals.json`, beside every number it produced.
 *
 * ## Both seed sets are the same size, and the size is the batch that will be run
 *
 * 50 and 50. Two reasons, and neither is symmetry for its own sake:
 *
 * - § D158's operational finding, inherited by name: *"a demand level chosen because every arm is
 *   quotable must be verified at the batch size that will actually be run… a level validated at
 *   n = 20 can suppress at n = 50."* R12's floor is twenty seeds; CLAUDE.md's budget is 50–200;
 *   the tuning set runs the budget.
 * - **Unequal sets manufacture disagreement.** A goal that passes 49 of 50 is `variable`; the same
 *   goal on 20 seeds is very often `constant-pass`. If the holdout were smaller, a near-constant
 *   would be reported as *"the classification did not survive a disjoint seed set"* when the only
 *   thing that changed was the denominator. Equal `n` makes a disagreement mean what it says.
 */

import type { GoalSpec } from './goals.js';
import type { GoalScenario, SeedSet } from './measure.js';

/**
 * `long-waits-under`'s ceiling, in percent of served rides over the long-wait threshold.
 *
 * **10 %**, which is the figure § 5.2's own measurement (**M18**) used, so this table's rates are
 * comparable with the one it is answering. It is a *free parameter* and the contract says so in
 * as many words: *"a coin flip whose rate is set entirely by the threshold the scenario author
 * picks — which makes the threshold, not the player, the thing being tested."* It is published
 * beside every rate it produced for exactly that reason.
 */
export const LONG_WAIT_CEILING_PCT = 10;

/**
 * Every goal kind § 5.2 declares, offered to every stage.
 *
 * Including the two that cannot be judged on one run. They are candidates, they are measured
 * against, and the table records that they could not be — which is a different statement from
 * their absence, and the only one a reader can act on.
 */
export const CANDIDATE_GOALS: readonly GoalSpec[] = [
  { kind: 'deliver-everyone', threshold: null },
  { kind: 'no-divergence', threshold: null },
  { kind: 'nobody-abandoned', threshold: null },
  { kind: 'answer-the-demand', threshold: null },
  { kind: 'long-waits-under', threshold: LONG_WAIT_CEILING_PCT },
  { kind: 'everyone-can-get-there', threshold: null },
  { kind: 'beat-the-baseline', threshold: null },
];

const TUNING_SEEDS: SeedSet = { name: 'tuning-20260730', seed: '20260730', replications: 50 };
const HOLDOUT_SEEDS: SeedSet = { name: 'holdout-20260731', seed: '20260731', replications: 50 };

function stage(
  id: string,
  name: string,
  buildingId: string,
  dispatcherProfileId: string,
  arrivalRatePctPop5min: number | null,
): GoalScenario {
  return {
    id,
    name,
    buildingId,
    dispatcherProfileId,
    durationS: 900,
    arrivalRatePctPop5min,
    tuningSeeds: TUNING_SEEDS,
    holdoutSeeds: HOLDOUT_SEEDS,
    candidateGoals: CANDIDATE_GOALS,
  };
}

/**
 * The engineering briefs' own seed sets — GitHub issue **#227**.
 *
 * Different masters from the ten stages', and deliberately: a brief is a different question on a
 * different configuration, and sharing a master would make *"the same fifty traces"* true across two
 * bodies of content that were never meant to be compared. Disjointness from each other is what
 * matters and it is checked on the **derived** replication seeds by `campaign/parse.ts`, never on
 * the masters — two masters can in principle collide.
 */
const BRIEF_TUNING: SeedSet = { name: 'brief-tuning-20260910', seed: '20260910', replications: 50 };
const BRIEF_HOLDOUT: SeedSet = {
  name: 'brief-holdout-20260911',
  seed: '20260911',
  replications: 50,
};

function brief(
  id: string,
  name: string,
  buildingId: string,
  dispatcherProfileId: string,
  arrivalRatePctPop5min: number | null,
): GoalScenario {
  return {
    id,
    name,
    buildingId,
    dispatcherProfileId,
    durationS: 900,
    arrivalRatePctPop5min,
    tuningSeeds: BRIEF_TUNING,
    holdoutSeeds: BRIEF_HOLDOUT,
    candidateGoals: CANDIDATE_GOALS,
  };
}

/**
 * **The engineering briefs, as configurations** — `docs/21` § 4, GitHub issue **#227**, and the
 * first trip-wire that issue binds every brief to.
 *
 * > *"A batch-judged bar must already be measured. `judgeStage` refuses to judge against a bar
 * > that does not reproduce (`met: null`, the stage can never clear) … Any brief with goals
 * > therefore ships **with** its measured row, regenerated via the scenario regeneration path."*
 *
 * This constant is what makes that mechanical rather than a promise. The briefs are appended to
 * {@link CANDIDATE_SCENARIOS} rather than measured by a second driver, so
 * `regenerate.test-helper.ts` writes their rows with the ten stages' and `goalRates.test.ts`
 * re-derives them on every run against what is on disk. A brief added here and never regenerated
 * fails that guard; a brief authored in `data/engineering-briefs.json` and never added here fails
 * `campaign/parse.ts`'s *"has no entry in the published goal table"*. Both directions are held by a
 * test rather than by this paragraph.
 *
 * **They are appended rather than interleaved**, so the ten stages' rows keep their positions and a
 * regeneration that moves one of them is a finding rather than a re-ordering.
 *
 * ## Why `energy-aware` is the starting setting on both, and why it is not a dig at that profile
 *
 * [§ D106](../../../../DECISIONS.md) is this repository's most-repeated measured finding: energy is
 * an axis and never a score, because *"a dispatcher that drives less carries fewer people"* — the
 * Phase 8 matrix put `nearest-car` on the Pareto front at six of eight cells for exactly that
 * reason. A building handed over with an energy-first setting is therefore the most instructive
 * starting point this product can offer an enthusiast, and it is a real commissioning choice rather
 * than a strawman. The brief never grades the energy figure and never orders two arms on it;
 * `campaign/judge.ts`'s refusal is untouched, and what is judged is the wait and the demand
 * answered.
 *
 * ## Both configurations are measured rather than chosen, and the measurements are named
 *
 * - `brief-e5-handling-capacity` — Chancery House at 2.5 % of population every five minutes.
 *   Swept over all thirteen shipped profiles at these seeds, **three** clear both batches and
 *   **seven more** meet every bar on the tuning seeds and lose on the holdout. That is the
 *   difficulty `docs/38` § 2.1 asks for — *"many survivors is easy; one survivor is the hardest a
 *   scenario is allowed to be"* — arrived at by measurement, and the seven are what the holdout is
 *   for.
 * - `brief-e3-diagnose-the-saturation` — Mixed-Use High-Rise at its own declared demand. The
 *   starting setting withholds its mean on **14 of 50** replications and every one of those
 *   fourteen names the queue-growth ground, which is what gives the brief a suppression to
 *   diagnose. Eight of the thirteen clear it.
 *
 * **What is re-derived and what is a dated measurement, said rather than blurred.**
 * `briefs/playable.test.ts` re-derives the two claims a brief's playability rests on — *at least one
 * affordable setting clears both batches* and *the starting setting clears nothing* — and, on E3,
 * that a mean is still withheld on some replications and never on all of them. The counts above —
 * three, seven, eight, fourteen — are a **record of one sweep on 2026-09-10**, over all thirteen
 * shipped profiles at these seeds, and nothing re-derives them. They are here because a reader
 * deciding whether a brief is too easy needs them and the cheap test deliberately does not publish
 * a difficulty figure; they are not a bar, and a later reader who finds them moved has found a
 * measurement rather than an error.
 */
const BRIEF_SCENARIOS: readonly GoalScenario[] = [
  brief(
    'brief-e5-handling-capacity',
    'E5 — Meet the handling-capacity target',
    'chancery-house',
    'energy-aware',
    2.5,
  ),
  brief(
    'brief-e3-diagnose-the-saturation',
    'E3 — Diagnose the saturation',
    'mixed-use-high-rise',
    'energy-aware',
    null,
  ),
];

/**
 * The ten stages, as configurations, and the briefs appended: § 5.4's original seven, three that
 * came with the buildings added afterwards, and {@link BRIEF_SCENARIOS}.
 *
 * The briefs are **appended** so the ten keep their positions: `goalRates.test.ts` compares this
 * list with `data/scenario-goals.json` as an ordered array, so a regeneration that moved a stage's
 * row would be a finding rather than a re-ordering.
 *
 * The three new ones exist because the original seven could not pose their questions at all.
 * **8 — The headline address** is the first stage on `office-prestige`, a profile that had been
 * declared since Phase 1 and used by no building; the bank is deliberately oversupplied, so the
 * lesson is that spare cars do not by themselves hold a 25 s interval. **9 — Both ways at once**
 * is the first stage whose demand has no dominant direction, which is the traffic
 * `noDirectionReversal` is least suited to. **10 — The bed and the visitor** is the first stage
 * whose bank holds cars of unlike speed and capacity, so it asks whether a dispatcher notices that
 * two of its five cars are the wrong car for an ordinary hall call.
 *
 * `collective` throughout rather than the viewer's default: `docs/07` § 4 calls `nearest-car`
 * *"a poor reference arm — the only profile that saturates"* at the benchmark operating points,
 * and stage 5 is the one place a deliberately unsuitable dispatcher is the lesson (§ 2.8: on
 * Secure Tower a dispatcher that cannot read a credential leaves a third of riders unserved, and
 * running it and watching it fail is § 5.4's stated teaching move).
 */
export const CANDIDATE_SCENARIOS: readonly GoalScenario[] = [
  stage('stage-1-first-call', 'One shaft, low demand', 'garden-apartments', 'collective', null),
  stage('stage-2-morning-rush', 'The morning rush', 'midtown-office', 'collective', 2.5),
  stage('stage-3-overwhelmed', 'Overwhelmed', 'midtown-office', 'collective', null),
  stage('stage-4-two-banks', 'Two banks', 'mixed-use-high-rise', 'collective', 1.5),
  stage('stage-5-credentials', 'Credentials', 'secure-tower', 'collective', null),
  stage('stage-6-the-tall-one', 'The tall one', 'vertical-city', 'collective', 0.5),
  stage('stage-7-prove-it', 'Tune it', 'midtown-office', 'collective', 1.5),
  stage('stage-8-the-headline-address', 'The headline address', 'chancery-house', 'collective', 3),
  stage('stage-9-both-ways-at-once', 'Both ways at once', 'crown-hotel', 'collective', 2.5),
  stage('stage-10-the-bed-and-the-visitor', 'The bed and the visitor', 'st-jude-hospital', 'collective', 2),
  ...BRIEF_SCENARIOS,
];

