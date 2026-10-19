/**
 * Judging a stage — every verdict from the batch, and no verdict this project's own discipline
 * would refuse.
 *
 * ## Where each verdict comes from, and where it does not
 *
 * | goal | judged by | why it cannot be judged any other way |
 * |---|---|---|
 * | the five per-run kinds | `measureGoalRate` over the **candidate** arm, against the count `data/scenario-goals.json` published for this stage **on the seed set the batch is over** | R12: they are batch goals on every stage they ship on, because R12's trichotomy leaves no single-run category ([§ D160](../../../../DECISIONS.md)) |
 * | `beat-the-baseline` | `batch/report.ts`'s paired-t rows, which come from `experiments`' own `pairedDifferenceEstimate` and `intervalContainsZero` | CLAUDE.md: *"Never declare one dispatcher better than another without a paired-t confidence interval that excludes zero"* |
 *
 * Both are asked **twice** — once of the tuning batch and once of the holdout batch — and a stage
 * clears only when both answers are yes. See *"why it cannot happen on the seeds the player tuned
 * against"* below.
 *
 * Nothing statistical is computed here. This module reads verdicts other modules produced and
 * turns them into sentences.
 *
 * ## The bar, and why it is not a number somebody chose
 *
 * A batch goal needs a target, and an authored one would be exactly the free parameter § 5.2 warns
 * about on `long-waits-under`: *"a coin flip whose rate is set entirely by the threshold the
 * scenario author picks — which makes the threshold, not the player, the thing being tested."*
 *
 * So the target is **the shipped configuration's own measured count on the very same seeds**,
 * taken from `data/scenario-goals.json`. It is not invented, it is not re-derived, and it is
 * checkable: the batch's baseline arm *is* that configuration on those seeds, so
 * {@link StageGoalVerdict.reproduced} compares what the baseline arm scored with what the table
 * says it scored. A stage whose bar does not reproduce is **not judged at all** — the sentence
 * says so and the stage cannot be cleared, because a bar that does not reproduce is a bar the
 * player would be measured against by accident.
 *
 * *"The very same seeds"* is load-bearing in both directions: the table publishes a count per seed
 * set, and each half of the judgement reads the half of the table its own batch was run over. A
 * tuning count compared against a holdout batch would reproduce by luck or not at all.
 *
 * ## Why clearing a stage cannot happen by standing still
 *
 * The count goals use `>=` rather than `>`, on purpose: clearing a goal by one run out of fifty is
 * inside the batch's own scatter, and a rule that turned that into a win would be reporting noise
 * as skill. The bar that actually has to be *earned* is `beat-the-baseline`, which every stage
 * carries and which is met only when a paired interval on the difference **excludes zero** in the
 * candidate's favour and no orderable row resolves against it. An unchanged profile scores every
 * count goal exactly level and resolves nothing, so it clears nothing — and that is W3's own
 * liveness control reaching a scoreboard.
 *
 * ## And why it cannot happen on the seeds the player tuned against — `docs/33` § 7 **O7**
 *
 * Every rule in `docs/33-difficulty-curve.md` judged a stage on the stage's **tuning** seeds,
 * because that is what this function did, and the consequence is written down in that document as
 * its largest open question: *"a curve whose intended solution is `tune until the judged seeds
 * clear` is a curve with a shortcut in it, and the shortcut is invisible to every rule above,
 * because every rule above judges on the same seeds the player tunes against."* It is CLAUDE.md
 * § Tuning discipline — *"Tune on one seed set, validate on a disjoint one, or you overfit the
 * weight vector to specific passenger traces and the gain vanishes on new traffic"* — simply not
 * enforced at this layer.
 *
 * **It was not hypothetical, and the campaign suite already carried the witness.**
 * `stageTwoEdited.test.ts` (`campaign.test.ts` until GitHub issue #356 split it) plays an authored
 * `EditedVector` on stage 2 (`weights.waitTime: 1`,
 * `weights.loadFactor: 2.25`, found by sweeping `loadFactor` on the stage's own tuning seeds) and
 * pins both halves: it met every goal on the tuning seeds, and on the stage's declared holdout
 * seeds the shipped setting beats it on **three** measures with `beat-the-baseline` resolving
 * against it. The sensitivity says what it is — `2.2`, `2.25` and `2.3` cleared and `2.35` did not.
 * A vector tuned on fifty traces, winning on those fifty traces, and losing on fifty it had not
 * seen, is the definition of the thing the holdout exists to catch, and the product certified it.
 *
 * So a stage now clears on **two** batches. {@link JudgeStageInput.result} is the tuning batch —
 * the runs the player made, and where each goal row's sentence comes from, because feedback a
 * player cannot see is not feedback. {@link JudgeStageInput.holdout} is the same two arms over
 * `stage.holdoutSeeds`, and {@link StageReport.cleared} requires **both**: every goal met on the
 * runs the player made *and* every goal met on crowds kept apart from the stage's own.
 *
 * Three properties of that rule are worth stating, because each of them was a way to get it wrong:
 *
 * - **It is checked, not named.** The holdout batch's own `result.seed` must equal
 *   `stage.holdoutSeeds.seed`. Handing this the tuning batch twice is refused by
 *   {@link holdoutVerdictFor} with the two seeds printed, so the split is a property of the runs
 *   rather than of what a caller called them.
 * - **The bar moves with the sample.** On the holdout half the bar is `PublishedGoalRecord.holdout`
 *   — the shipped setting's own count *on those seeds* — never the tuning count. Until this
 *   landed, `data/scenario-goals.json`'s `holdout` block was validated, published, quoted in the
 *   briefing and read by nothing that could change a verdict.
 * - **Requiring both halves is the stricter reading and the one next door.**
 *   `scenario/measure.ts` withholds a goal whose *classification* differs between the two seed
 *   sets rather than shipping the flattering half, and this is that rule applied to a player's move
 *   instead of to an author's goal.
 *
 * **What this function cannot do is run the second batch**, and the honest consequence is that a
 * caller that supplies only the tuning batch gets `cleared: false` with the reason in the headline.
 * That is the same refusal shape as a bar that does not reproduce: unjudged is not passed. It is a
 * *raised* bar rather than a changed verdict — no stage that was refused before is cleared now —
 * and the caller that has to grow a second run is `dev/campaignPanel.ts`, which this lane does not
 * own. **Recorded here rather than in `DECISIONS.md`, under § D405**: this is § D355's holdout
 * rule enforced in code rather than moved — a caller that supplies one batch gets `cleared: false`
 * from the function itself, so the binding is the signature and not this prose.
 *
 * ## R11 and R2, structurally
 *
 * The `beat-the-baseline` test reads `BatchComparisonRow.favours`, which `batch/report.ts` sets to
 * `null` on every `axis` row **however its interval fell**. There is no branch here that could
 * order two arms on energy, because there is no value to branch on. And every sentence below is a
 * statement about *runs* — *"in 50 runs, 45 passed"* — never about a dispatcher, except the one
 * sentence a paired-t interval over fifty paired replications entitles the project to say.
 */

import { intervalContainsZero } from '@elevator-sim/experiments/browser';

import { batchFigureOf, type BatchComparisonRow, type BatchReport } from '../batch/report.js';
import { BATCH_METRIC_PRESENTATION, type BatchMetric, type BatchResult } from '../batch/types.js';
import {
  asPerReplicationGoal,
  measureGoalRate,
  type PerReplicationGoalSpec,
  type GoalKind,
  type GoalRate,
  type GoalSpec,
} from '../scenario/goals.js';
import type { PublishedGoalRecord, PublishedRate, PublishedScenario } from '../scenario/published.js';
import { stageSeedSetOf, type StageSeedSet } from './stageRun.js';
import type { StageAdmission } from './stagePress.js';
import type { CampaignStage } from './types.js';
import { glossaryFor, type GlossaryTerm } from '../mode/glossary.js';
import { plural } from '../mode/disclosure.js';

/** One goal, judged on the batch that just ran. */
export interface StageGoalVerdict {
  readonly kind: GoalKind;
  readonly label: string;
  /** `true`, `false`, or `null` when this batch cannot judge it — never a silent `false`. */
  readonly met: boolean | null;
  /**
   * Whether the baseline arm scored what the published table says it scored.
   *
   * `null` for a goal with no published count (`beat-the-baseline`). A `false` here is the reason
   * {@link met} is `null`: the bar did not reproduce, so nothing was judged against it.
   */
  readonly reproduced: boolean | null;
  /** A frequency over runs with its denominator. R10, R13. */
  readonly sentence: string;
  /** Where the bar came from, and what a count comparison is and is not. */
  readonly note: string;
  /**
   * A judged per-run goal's two counts, as its {@link sentence} prints them: runs your setting
   * passed, runs the shipped setting passed, and the runs counted. Absent on every other branch.
   * The stage page reads it to say when a change moved no count (wave AQ lane AQ-1).
   */
  readonly counts?: { readonly yours: number; readonly shipped: number; readonly runs: number } | undefined;
}

/**
 * The stage judged a second time, on crowds kept apart from the stage's own.
 *
 * A *whole* verdict rather than a boolean, because the reason a holdout refused a stage is the
 * interesting part: a vector that meets every count goal on both sets and loses `beat-the-baseline`
 * on the holdout has been told something specific about itself, and *"not cleared"* alone does not
 * say it.
 */
export interface StageHoldoutVerdict {
  /** The seed set's own name and master seed, so the sentence names the runs it is about. */
  readonly seedSetName: string;
  readonly seed: string;
  /** Every goal the stage declares, judged again against this seed set's published counts. */
  readonly goals: readonly StageGoalVerdict[];
  /** Every goal met here too. `false` whenever any is `null` — unjudged is not passed. */
  readonly held: boolean;
  /** What the holdout said, in one sentence, for a surface that has room for one. */
  readonly sentence: string;
}

export interface StageReport {
  readonly stageId: string;
  readonly stageName: string;
  /** R7 / invariant 5. The whole batch replays from this, in every mode. */
  readonly seed: string;
  readonly replications: number;
  readonly baselineProfileId: string;
  readonly candidateProfileId: string;
  /** Every goal, judged on the **tuning** batch — the runs the player made and can see. */
  readonly goals: readonly StageGoalVerdict[];
  /**
   * Every goal met on the runs the player made.
   *
   * **This is exactly what {@link cleared} meant before the holdout gate**, kept as its own field
   * rather than folded away: a caller that wants *"did this batch meet its bars"* is asking a real
   * question with a real answer, and it is the half a player's feedback loop is built out of. What
   * it is not is a stage clear, for the reason the module docstring gives at length.
   */
  readonly metOnTuningSeeds: boolean;
  /**
   * The second half of the verdict, or `null` when no holdout batch was supplied.
   *
   * `null` is a *refusal*, never a pass: {@link cleared} is `false` while it is `null`, and the
   * headline says which of the two things happened.
   */
  readonly holdout: StageHoldoutVerdict | null;
  /**
   * Every goal met on the runs the player made **and** on crowds kept apart from the stage's own.
   * `false` whenever any goal is `null`, because unjudged is not passed — and `false`
   * whenever {@link holdout} is `null`, because unvalidated is not passed either.
   */
  readonly cleared: boolean;
  readonly headline: string;
  /**
   * **Drive work, on a line of its own, for the stage's own crowds** — ruling R1, amendment 8
   * ([§ D1602](../../../../DECISIONS.md)), or `null` when the tuning batch has no comparison.
   *
   * Read off the tuning report's two `axis` rows, drive work and drive work per ride delivered, and
   * worded *higher* or *lower* only where the row's paired interval excludes zero, *too close to
   * call* otherwise. It is never met or missed and enters no goal: `beat-the-baseline` reads
   * `favours`, which is `null` on every axis row (R11), and nothing here is read by
   * {@link StageReport.cleared}. A line of its own because `honesty/properties.ts#checkEnergyWaitBlend`
   * refuses an energy figure inside a wait sentence, and `CLAUDE.md` keeps energy beside the waits.
   */
  readonly energy: string | null;
  /**
   * The words this verdict used, explained — issue #22.
   *
   * The Lab's verdict is the densest statistics prose the product draws: one sentence can carry
   * *paired runs*, *an interval on the difference*, *the replication budget* and *a move along
   * the front*. It is also the sentence a player is most invested in, which is exactly when a
   * misread costs something.
   *
   * Explained beside, never instead. Nothing about `headline`, `sentence` or `note` changes —
   * including the R2 clause on both branches of the headline, which is a caveat and not a
   * vocabulary problem, and which this must not be read as replacing.
   */
  readonly glossary: readonly GlossaryTerm[];
}

/** A batch and the report taken over it, together, so the two cannot be of different runs. */
export interface JudgedBatch {
  readonly result: BatchResult;
  /** `batchReport(result)`, passed in rather than recomputed so the panel draws what was judged. */
  readonly report: BatchReport;
}

export interface JudgeStageInput {
  readonly stage: CampaignStage;
  /** This stage's row of the published table — the source of every bar, on both seed sets. */
  readonly published: PublishedScenario;
  /** The **tuning** batch: `batchRequestForStage(stage, …)`, the runs the player made. */
  readonly result: BatchResult;
  /** `batchReport(result)`, passed in rather than recomputed so the panel draws what was judged. */
  readonly report: BatchReport;
  /**
   * The **holdout** batch: `batchRequestForStage(stage, …, edit, 'holdout')`, run and reported.
   *
   * Absent means the stage was not validated, and an unvalidated stage cannot be cleared. It is
   * optional rather than required so that a caller which has not grown a second run keeps
   * compiling and keeps producing an honest verdict — a refusal, said in words — rather than a
   * verdict that certifies the shortcut `docs/33` § 7 O7 describes.
   */
  readonly holdout?: JudgedBatch | undefined;
  /**
   * **What the one admission check said about the press** (`campaign/stagePress.ts#admitStageMove`),
   * or absent where the caller asked none — ruling R1, amendment 4 ([§ D1602](../../../../DECISIONS.md)).
   *
   * It is the only thing that lets a verdict say *the same run*: a press whose `moved` is empty runs
   * the stage's own setting in both arms, so the two arms are one run on every crowd. Sameness is
   * never inferred from the figures, because a different setting can tie on every one of them
   * (`collective-enroute` matches the stage's own setting on 43 of stage 1's 50 tuning crowds). It
   * changes words only: no `met`, `held` or `cleared` reads it.
   */
  readonly admission?: Pick<StageAdmission, 'moved'> | undefined;
}

/**
 * Whether the press changed the stage's setting, as {@link JudgeStageInput.admission} answered it:
 * `unknown` where no admission was handed over, which claims neither sameness nor change.
 */
type StageSameness = 'unchanged' | 'changed' | 'unknown';

function samenessOf(admission: JudgeStageInput['admission']): StageSameness {
  if (admission === undefined) return 'unknown';
  return admission.moved.length === 0 ? 'unchanged' : 'changed';
}

/**
 * Judge every goal the stage declares, on the tuning batch and — when it is supplied — again on
 * the holdout batch.
 *
 * Pure: both batches already ran, and nothing here simulates, samples or estimates.
 */
export function judgeStage(input: JudgeStageInput): StageReport {
  const { stage, published, result, report } = input;
  const baselineArm = result.arms[0];
  const candidateArm = result.arms[1] ?? result.arms[0];

  const sameness = samenessOf(input.admission);
  const goals = judgeGoalsOf(stage, published, result, report, 'tuning', sameness);
  const holdout = holdoutVerdictFor(stage, published, input.holdout, sameness);

  const met = goals.filter((goal) => goal.met === true).length;
  const metOnTuningSeeds = goals.length > 0 && met === goals.length;
  const cleared = metOnTuningSeeds && holdout !== null && holdout.held;
  const headline = headlineFor(stage, goals, met, cleared, report.replications, holdout);
  const energy = energySentenceOf(report);
  return {
    stageId: stage.id,
    stageName: stage.name,
    seed: result.seed,
    replications: report.replications,
    baselineProfileId: baselineArm?.dispatcherProfileId ?? '',
    candidateProfileId: candidateArm?.dispatcherProfileId ?? '',
    goals,
    metOnTuningSeeds,
    holdout,
    cleared,
    headline,
    energy,
    /*
     * The verdict's own strings only — **not** `report`'s.
     *
     * A stage draws the batch report as well, and that report carries its own glossary derived
     * from its own sentences. Folding the two together here would make this list say the verdict
     * used words the verdict did not use, and a panel drawing both can concatenate two derived
     * lists far more honestly than this function can guess at one.
     */
    glossary: glossaryFor([
      headline,
      ...(energy === null ? [] : [energy]),
      ...goals.flatMap((goal) => [goal.label, goal.sentence, goal.note]),
      ...(holdout === null
        ? []
        : [holdout.sentence, ...holdout.goals.flatMap((goal) => [goal.sentence, goal.note])]),
    ]),
  };
}

/* -------------------------------------------------------------------------- *
 * The two seed sets
 * -------------------------------------------------------------------------- */

/**
 * Every goal the stage declares, judged over one batch against that seed set's own published
 * counts.
 *
 * One function for both halves rather than a second copy for the holdout, which is
 * `stageRun.ts`'s founding argument arriving one module along: two judgements of one stage that
 * could drift apart are two answers to the question this file exists to give once.
 */
function judgeGoalsOf(
  stage: CampaignStage,
  published: PublishedScenario,
  result: BatchResult,
  report: BatchReport,
  seedSet: StageSeedSet,
  sameness: StageSameness,
): readonly StageGoalVerdict[] {
  const baselineArm = result.arms[0];
  const candidateArm = result.arms[1] ?? result.arms[0];
  return stage.goals.map((spec) => {
    const narrowed = asPerReplicationGoal(spec);
    if (narrowed.judgeable) {
      return judgeCountGoal(narrowed.spec, published, baselineArm, candidateArm, seedSet);
    }
    // A `long-waits-under` with no threshold is a *count* goal that cannot be counted, so it must
    // not fall through to the comparison arm — that arm answers `beat-the-baseline` and would
    // judge this one against an interval it has nothing to do with. `parse.ts` refuses the case at
    // load, so no shipped campaign reaches here; it is handled rather than assumed away because
    // the stage's other goals should still be judged.
    if (narrowed.missingThreshold) {
      const label = stageGoalNameOf(spec);
      return {
        kind: spec.kind,
        label,
        met: null,
        reproduced: null,
        sentence: 'This goal declares no threshold, so there is no ceiling to judge a wait against.',
        note:
          'The kind is judgeable on one run; this instance of it is not. A campaign file is ' +
          'refused at load for this, so seeing it here means the stage was assembled in memory.',
      };
    }
    return judgeComparisonGoal(spec, report, seedSet, sameness);
  });
}

/**
 * The holdout half — `null` when there is no holdout batch to take it over.
 *
 * **The seed is checked rather than trusted.** A caller handed the tuning batch twice would
 * otherwise get a stage cleared on the sample it was tuned against, wearing a validation's
 * clothes, and every assertion downstream would be about nothing. `BatchResult.seed` is the master
 * seed the whole batch derives from, so comparing it against `stage.holdoutSeeds.seed` is a
 * statement about the runs rather than about the argument's name.
 */
function holdoutVerdictFor(
  stage: CampaignStage,
  published: PublishedScenario,
  batch: JudgedBatch | undefined,
  sameness: StageSameness,
): StageHoldoutVerdict | null {
  if (batch === undefined) return null;
  const seeds = stageSeedSetOf(stage, 'holdout');
  if (batch.result.seed !== seeds.seed) {
    return {
      seedSetName: seeds.name,
      seed: batch.result.seed,
      goals: [],
      held: false,
      sentence:
        `Not validated: the second batch replays from seed ${batch.result.seed} and this stage’s ` +
        `holdout set ${seeds.name} is seed ${seeds.seed}. A stage is cleared on crowds kept apart ` +
        'from the stage’s own, so a batch that is not that set validates nothing.',
    };
  }

  const goals = judgeGoalsOf(stage, published, batch.result, batch.report, 'holdout', sameness);
  return {
    seedSetName: seeds.name,
    seed: seeds.seed,
    goals,
    held: goals.length > 0 && goals.every((goal) => goal.met === true),
    sentence: holdoutSentenceOf(goals, batch.report.replications),
  };
}

/**
 * **What the held-back crowds said, in one sentence** — the tally, and, where they refused, **which
 * goals they refused** by their plain names (the post-AN panel's seat C, D7, wave AO lane AO-5).
 * Stage 5 with Fairness first read *"The held-back crowds do not agree: 4 of 5 goals reached"* and
 * named none, so the player could not tell which goal the crowds they never tuned against had
 * turned down. A goal the batch could not judge is counted in its own clause rather than named as
 * missed, because unjudged is neither passed nor failed. Exported so the sentence can be held on
 * goal verdicts directly; {@link holdoutVerdictFor} is its one caller. The decision reaches no further
 * than this module, so this docstring is its record ([§ D405](../../../../DECISIONS.md)).
 *
 * ## And how much, on those crowds alone — ruling R1 ([§ D1602](../../../../DECISIONS.md))
 *
 * The tally is followed by the comparison goal's own sentence for this seed set, which sizes every
 * resolved measure on the held-back crowds and says *too close to call* where an interval contains
 * zero. It stands alone: nothing compares it with the stage's own crowds, so nothing says a gain
 * shrank, survived or was smaller there (amendment 5). The crowds are named by where they come
 * from, *kept apart from the stage's own*. The sentence that explained a refusal as *a fit to fifty
 * crowds* is gone, because nobody measured that cause (finding X6); the rule is stated once, with no
 * cause, in the headline. With no comparison goal to carry the count, the tally carries it.
 */
export function holdoutSentenceOf(goals: readonly StageGoalVerdict[], replications: number): string {
  const met = goals.filter((goal) => goal.met === true).length;
  const held = goals.length > 0 && met === goals.length;
  const unjudged = goals.filter((goal) => goal.met === null).length;
  const missed = goals.filter((goal) => goal.met === false).map((goal) => goal.label);
  const runs = `${String(replications)} ${plural(replications, 'run', 'runs')}`;
  const sized = goals.find((goal) => goal.kind === 'beat-the-baseline')?.sentence ?? '';
  const over = sized === '' ? ` over ${runs} on ${crowdsOf('holdout')}` : '';
  const how = sized === '' ? '' : ` ${sized}`;
  const goalWord = plural(goals.length, 'goal', 'goals');
  if (held) {
    return `The held-back crowds agree: all ${String(goals.length)} ${goalWord} reached${over}.${how}`;
  }
  const named =
    missed.length === 0
      ? ''
      : ` ${missed.length === 1 ? 'The one they did not reach' : 'The ones they did not reach'}: ` +
        `${missed.join('; ')}.`;
  const tail =
    unjudged === 0
      ? ''
      : ` ${String(unjudged)} of them could not be judged there, and an unjudged goal is not a passed one.`;
  return (
    `The held-back crowds do not agree: ${String(met)} of ${String(goals.length)} ${goalWord} ` +
    `reached${over}.${named}${tail}${how}`
  );
}

/**
 * The crowds a sentence is about, named by where they come from — ruling R1, amendment 5
 * ([§ D1602](../../../../DECISIONS.md)). Never *crowds you could not have tuned against*: a player
 * who presses again after a refusal has seen how the held-back crowds answered.
 */
function crowdsOf(seedSet: StageSeedSet): string {
  return seedSet === 'tuning' ? 'the stage’s own crowds' : 'the crowds kept apart from the stage’s own';
}

/**
 * **A campaign goal, named in plain words for what it grades** — [§ D1159](../../../../DECISIONS.md),
 * the post-AJ panel's seats A, C and D.
 *
 * The stage page and the Engineer campaign panel both printed a goal as its `data/` kind:
 * *"deliver-everyone · met"*, and under it *"deliver-everyone: your setting passed 5 of 50 runs;
 * the shipped setting passed 5 of 50 … The bar is reached."* Two defects in one line. The id is an
 * id. And the name is an absolute where the bar is relative: a count goal is met when the player's
 * setting passes **at least as many** runs as the shipped setting did on the same crowds
 * ({@link judgeCountGoal}), so a stage where the shipped setting delivers everyone on 5 of 50 runs
 * is met at 5 of 50, and a name promising *everyone delivered* read as a lie to three seats.
 *
 * So every per-run goal is named for its relative bar, and `beat-the-baseline` for the interval it
 * asks for. `everyone-can-get-there` is named although no shipped stage can carry it, because a
 * switch over every kind is how a new kind is made to arrive with a name. Where `data/` gives a
 * threshold, the name carries it. The words before the comma are lane AK-B's
 * `scenario/goals.ts#GOAL_NAMES` (wave AK), which names what one run is asked on every surface; this
 * adds the bar a campaign judges it against, which only the campaign has.
 */
export function stageGoalNameOf(spec: GoalSpec): string {
  const asMany = 'on at least as many runs as the shipped setting';
  switch (spec.kind) {
    case 'deliver-everyone':
      return `Everyone delivered, ${asMany}`;
    case 'no-divergence':
      return `Queues settled, ${asMany}`;
    case 'nobody-abandoned':
      return `Nobody past the give-up line, ${asMany}`;
    case 'answer-the-demand':
      return `Kept up with arrivals, ${asMany}`;
    case 'long-waits-under':
      return spec.threshold === null
        ? `Long waits kept down, ${asMany}`
        : `Long waits kept under ${String(spec.threshold)} %, ${asMany}`;
    case 'beat-the-baseline':
      return 'Measurably ahead of the shipped setting';
    case 'everyone-can-get-there':
      return 'Everyone can reach their floor';
  }
}

/* -------------------------------------------------------------------------- *
 * The count goals
 * -------------------------------------------------------------------------- */

type Arm = BatchResult['arms'][number] | undefined;

/**
 * The half of the published record this batch's bar comes from.
 *
 * A count goal's bar is *the shipped setting's own measured count on these seeds*, so the half of
 * the table that is read has to be the half the batch was run over. Reading `tuning` on both would
 * make the holdout's `reproduced` check a coincidence detector.
 */
function publishedRateFor(
  record: PublishedGoalRecord | undefined,
  seedSet: StageSeedSet,
): PublishedRate | null {
  if (record === undefined) return null;
  return (seedSet === 'tuning' ? record.tuning : record.holdout) ?? null;
}

/**
 * One count goal, on one batch, against that batch's own half of the published table.
 *
 * **The `'tuning'` branch's four sentences are byte-identical to what this function produced before
 * the holdout split**, and that is deliberate rather than incidental: they are the words a player
 * reads on the runs they made, they are seeded into the honesty corpus one per goal, and a lane
 * that moved them while adding a seed set would have made two changes look like one.
 */
function judgeCountGoal(
  spec: PerReplicationGoalSpec,
  published: PublishedScenario,
  baselineArm: Arm,
  candidateArm: Arm,
  seedSet: StageSeedSet,
): StageGoalVerdict {
  const label = stageGoalNameOf(spec);
  const record = published.goals.find((entry) => entry.kind === spec.kind);
  const rate = publishedRateFor(record, seedSet);
  const target = rate?.passes ?? null;
  const publishedN = rate?.n ?? null;
  /* Where these runs came from, in the two words a sentence about them needs. */
  const runsAre = seedSet === 'tuning' ? 'runs' : 'holdout runs';
  const seedsAre = seedSet === 'tuning' ? 'tuning seeds' : 'holdout seeds';

  if (target === null || publishedN === null) {
    return {
      kind: spec.kind,
      label,
      met: null,
      reproduced: null,
      sentence: 'This stage has no published count for this goal, so there is no bar to judge against.',
      note:
        'R12: a goal ships with its across-seed rate published beside it. Without one there is ' +
        'nothing to compare a batch with, and a bar invented here would be the author being ' +
        'tested rather than the player.',
    };
  }

  const baseline = rateOf(spec, baselineArm);
  const candidate = rateOf(spec, candidateArm);

  if (candidate === null || baseline === null) {
    return {
      kind: spec.kind,
      label,
      met: null,
      reproduced: null,
      sentence: 'This batch produced no runs to judge.',
      note: 'A goal is a fraction of replications, and there were none.',
    };
  }

  const reproduced = baseline.passes === target && baseline.n === publishedN;
  if (!reproduced) {
    return {
      kind: spec.kind,
      label,
      met: null,
      reproduced,
      sentence:
        `This goal was not judged. The shipped setting scored ${String(baseline.passes)} of ` +
        `${String(baseline.n)} in this batch and the published table records ` +
        `${String(target)} of ${String(publishedN)} for it on these same seeds.`,
      note:
        'The bar for this goal is the shipped setting’s own measured count, so a bar that does ' +
        'not reproduce is not a bar. Nothing is scored against it. Check that the stage is ' +
        'running the building, demand level, horizon and seed set the table was measured on.' +
        (seedSet === 'tuning'
          ? ''
          : ` This is the ${seedsAre} half of the table, which is the half these runs were over.`),
    };
  }

  if (candidate.rateClass === 'unjudgeable') {
    return {
      kind: spec.kind,
      label,
      met: null,
      reproduced,
      sentence: `This goal was not judged. ${candidate.sentence}`,
      note:
        'The runs that could be judged are not counted on their own: the ones that fall out are ' +
        'the hard ones, and a rate over the survivors would understate the difficulty behind an ' +
        'honest-looking denominator.',
    };
  }

  const met = candidate.passes >= target;
  return {
    kind: spec.kind,
    label,
    met,
    reproduced,
    counts: { yours: candidate.passes, shipped: target, runs: candidate.n },
    sentence:
      `Your setting passed ${String(candidate.passes)} of ${String(candidate.n)} ` +
      `${runsAre}; the shipped setting passed ${String(target)} of ${String(publishedN)} on the ` +
      `same passenger populations. ${met ? 'The bar is reached.' : 'The bar is not reached.'}`,
    /*
     * **The path left this sentence with GitHub issue #207**, and what it was doing survives.
     *
     * It read *"published in data/scenario-goals.json — not a number chosen here"*, and naming the
     * file was R12's claim made checkable: a goal ships with its measured rate, and the bar is not
     * invented at judging time. That claim is still here, in the vocabulary of the person reading
     * a stage verdict — *shipped with the stage, measured before you played it*. The file is where
     * an engineer looks it up, and an engineer is not who this sentence is for.
     */
    note:
      `The bar is the shipped setting’s own measured count on this stage’s ${seedsAre} — shipped ` +
      'with the stage and measured before you played it, not a number chosen while judging you. ' +
      'Both arms saw the same passengers, so the two counts are paired. A count is not an ' +
      'interval: a couple of runs either way is inside what a batch of this size scatters by, and ' +
      'the goal that answers “is it actually better” is the one asking for your setting to be ' +
      `measurably better, which needs an interval that excludes zero.${
        seedSet === 'tuning'
          ? ''
          : ' These runs are on crowds kept apart from the stage’s own, the half that decides ' +
            'whether the stage is cleared.'
      }`,
  };
}

function rateOf(spec: PerReplicationGoalSpec, arm: Arm): GoalRate | null {
  if (arm === undefined || arm.replications.length === 0) return null;
  return measureGoalRate(spec, arm.replications);
}

/* -------------------------------------------------------------------------- *
 * The comparison goal
 * -------------------------------------------------------------------------- */

/**
 * `beat-the-baseline`: an interval on the difference that excludes zero, and nothing resolving the
 * other way.
 *
 * The second half is what makes this a **front** rather than a hill. A candidate that resolves
 * ahead on door-to-door time and behind on the 95th-percentile wait has not beaten anything; it
 * has moved along the front, and § D158 measured exactly that pair of outcomes on one pair of arms.
 * Energy is not in the test at all, because `favours` is `null` on every `axis` row (**R11**).
 *
 * The verdict (`met`) reads `favours` and nothing else; `seedSet` and `sameness` move words only.
 */
function judgeComparisonGoal(
  spec: GoalSpec,
  report: BatchReport,
  seedSet: StageSeedSet,
  sameness: StageSameness,
): StageGoalVerdict {
  const label = stageGoalNameOf(spec);
  const comparison = report.comparisons[0];
  if (comparison === undefined) {
    return {
      kind: spec.kind,
      label,
      met: null,
      reproduced: null,
      sentence: 'There is only one arm in this batch, so there is no difference to take.',
      note: 'A comparison needs two arms that saw the same passengers.',
    };
  }

  const orderable = comparison.rows.filter((row) => row.metricClass !== 'axis');
  const ahead = orderable.filter((row) => row.favours === 'candidate');
  const behind = orderable.filter((row) => row.favours === 'baseline');
  const suppressed = orderable.filter(
    (row) => row.verdict === 'suppressed' || row.verdict === 'unmeasured',
  );
  /*
   * Rows whose interval excludes zero over fewer paired runs than the project budgets for
   * (§ D171). Every shipped stage runs 50, so this is empty on `data/campaign.json` today — it
   * is here because {@link comparisonSentence}'s "no measure separated the two settings" clause
   * would otherwise be **false** on a batch that had one, and a sentence that is only true of
   * the data we happen to ship is the kind this repository keeps finding.
   */
  const underBudget = orderable.filter((row) => row.verdict === 'under-budget');
  const met = ahead.length > 0 && behind.length === 0;

  return {
    kind: spec.kind,
    label,
    met,
    reproduced: null,
    sentence: comparisonSentence({
      replications: report.replications,
      rows: comparison.rows,
      ahead,
      behind,
      underBudget,
      seedSet,
      sameness,
    }),
    note:
      `${suppressionClause(suppressed, report.replications)} Energy is not in this test: it is an ` +
      'axis and never a score, and the arm that spends least is routinely the arm that carried ' +
      'fewest people. Its interval is drawn beside these rows and is never ranked.',
  };
}

/** What {@link comparisonSentence} is handed: the rows, already sorted by what they may say. */
interface ComparisonWords {
  readonly replications: number;
  /** Every row of the comparison, `axis` rows included, for the exactly-zero test. */
  readonly rows: readonly BatchComparisonRow[];
  readonly ahead: readonly BatchComparisonRow[];
  readonly behind: readonly BatchComparisonRow[];
  readonly underBudget: readonly BatchComparisonRow[];
  readonly seedSet: StageSeedSet;
  readonly sameness: StageSameness;
}

/**
 * **The comparison goal's sentence, with how much** — ruling R1 on GitHub issue #645
 * ([§ D1602](../../../../DECISIONS.md)), finding C1: *"behind"* and *"ahead"* carried no size, so
 * lobby parking at +1.49 s and `nearest-car` at +2.95 s read alike.
 *
 * Average wait comes first, with its range whichever way its interval fell (amendment 7). Every
 * other measure that resolved follows with its size, and the ones that did not go unnamed under one
 * clause. A resolved interval is said *shorter* or *longer* (*lower* or *higher* off the time axis),
 * *by between* its two bounds with the one nearer zero first; an interval containing zero is *too
 * close to call* at the batch's run count, with its range said both ways. Every figure goes through
 * `batch/report.ts#batchFigureOf`, the formatter the Engineer row prints with (amendment 3). A row
 * with no number keeps its refusal.
 *
 * **Sameness is the admission's to say, never the figures'** (amendment 4). An unchanged press is
 * the same run in both arms and says so; a changed setting whose every paired difference is exactly
 * zero, on every crowd and every row, says the change altered nothing measured; and a press with no
 * admission behind it says only what the figures were. Nothing here touches `met`: the closing
 * clause is chosen by the same `ahead` and `behind` the verdict is.
 */
function comparisonSentence(input: ComparisonWords): string {
  const { replications, rows, ahead, behind, underBudget, seedSet, sameness } = input;
  const runs = `${String(replications)} ${plural(replications, 'run', 'runs')}`;
  const crowds = crowdsOf(seedSet);
  const separated = ahead.length + behind.length + underBudget.length > 0;

  if (sameness === 'unchanged' && !separated) {
    return (
      `Your settings are the building’s own, so over ${runs} on ${crowds}, your run and the ` +
      'building’s were the same run every time, and there is nothing to separate. The bar is not reached.'
    );
  }
  if (sameness !== 'unchanged' && !separated && everyDifferenceIsZero(rows)) {
    return sameness === 'changed'
      ? `Over ${runs} on ${crowds}, your change altered nothing measured on any run: every measure ` +
          'came out exactly the same under both settings, crowd by crowd. The bar is not reached.'
      : `Over ${runs} on ${crowds}, every measure came out exactly the same under both settings, ` +
          'crowd by crowd. The bar is not reached.';
  }

  const orderable = rows.filter((row) => row.metricClass !== 'axis');
  const wait = orderable.find((row) => row.metric === 'awtS');
  const others = orderable.filter((row) => row !== wait);
  const sized = others.filter((row) => row.verdict === 'resolved');
  const close = others.filter((row) => row.verdict === 'unresolved');
  const unnumbered = others.filter((row) => row.verdict === 'suppressed' || row.verdict === 'unmeasured');
  const clauses = [
    ...(wait === undefined ? [] : [rowClauseOf(wait, runs)]),
    ...sized.map((row) => rowClauseOf(row, runs)),
  ];
  const body =
    clauses.length === 0
      ? `Over ${runs} on ${crowds}, no measure had an interval to read.`
      : `Over ${runs} on ${crowds}, ${listOf(clauses)}.`;

  /* The rest, unnamed (amendment 7): *as well* only where average wait was itself too close. */
  const waitTooClose = wait !== undefined && tooCloseToCall(wait);
  const restNoun =
    close.length === others.length
      ? plural(close.length, 'The other measure was', 'The other measures were')
      : plural(close.length, 'The remaining measure was', 'The remaining measures were');
  const restClause =
    close.length === 0 ? '' : ` ${restNoun} too close to call${waitTooClose ? ' as well' : ` at ${runs}`}.`;
  const unnumberedClause =
    unnumbered.length === 0
      ? ''
      : ` ${String(unnumbered.length)} other ${plural(unnumbered.length, 'measure', 'measures')} could not ` +
        'be compared at all, because at least one paired run refused to stand behind its own number.';
  /*
   * Named rather than folded into the rest: these rows **have** a number, and it orders nothing.
   * Every row that forms an interval forms it over the same `n`, so a report with an `under-budget`
   * row has no `resolved` row, and this clause sits only beside *no measure separated*.
   */
  const budgetClause =
    underBudget.length === 0
      ? ''
      : ` The interval on ${underBudget.map((row) => row.label).join(', ')} excludes zero and is ` +
        'drawn, and it orders nothing: this batch is below the project’s replication budget.';
  const verdict =
    ahead.length > 0 && behind.length === 0
      ? 'Nothing came out against your setting, so the bar is reached.'
      : ahead.length === 0 && behind.length > 0
        ? 'Your setting came out behind and ahead on nothing, so the bar is not reached.'
        : ahead.length > 0
          ? 'That is a move along the front rather than a win, so the bar is not reached.'
          : 'No measure separated the two settings, so the bar is not reached.';
  /* Two arms that ran one setting cannot differ; one that did is the apparatus, said so. */
  const fault =
    sameness === 'unchanged'
      ? ' Both runs used the building’s own settings, so a measure that separated them is a fault in ' +
        'the run rather than a result, and worth reporting.'
      : '';
  return `${body}${restClause}${unnumberedClause}${budgetClause} ${verdict}${fault}`;
}

/**
 * Every row's every paired difference is exactly zero: each row carries an interval over all its
 * pairs, and the smallest and largest difference are both zero. Read off the rows the report
 * already took, so it can only be true of a batch whose two arms tied on every crowd and every
 * measure. It decides words, and only for a press the admission says changed something.
 */
function everyDifferenceIsZero(rows: readonly BatchComparisonRow[]): boolean {
  return (
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.estimate !== null &&
        row.totalPairs > 0 &&
        row.estimate.n === row.totalPairs &&
        row.estimate.min === 0 &&
        row.estimate.max === 0,
    )
  );
}

/** An interval that contains zero and is not simply zero on every crowd. */
function tooCloseToCall(row: BatchComparisonRow): boolean {
  const estimate = row.estimate;
  return (
    row.verdict === 'unresolved' &&
    estimate !== null &&
    Number.isFinite(estimate.lower) &&
    Number.isFinite(estimate.upper) &&
    !(estimate.lower === 0 && estimate.upper === 0)
  );
}

/** `a`, `a and b`, `a, b, and c` — clauses that each carry their own verb. */
function listOf(clauses: readonly string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? '';
  if (clauses.length === 2) return `${String(clauses[0])}, and ${String(clauses[1])}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${String(clauses[clauses.length - 1])}`;
}

/** A metric's unit, in words where the words are plain: a figure may be re-united (`docs/23` § 1.4). */
function unitWordsOf(metric: BatchMetric): string {
  switch (BATCH_METRIC_PRESENTATION[metric].unit.trim()) {
    case 's':
      return ' seconds';
    case '%':
      return ' percentage points';
    case '':
      return '';
    default:
      return BATCH_METRIC_PRESENTATION[metric].unit;
  }
}

/**
 * The rows whose label is a plural noun (*rides over the long-wait threshold*, *people carried per
 * 5 min*), so the clause agrees with it. Keyed by metric rather than read off the label's first
 * word, so a relabelled row keeps its grammar or fails the read-back test, never a guess.
 */
const PLURAL_LABELS: ReadonlySet<BatchMetric> = new Set<BatchMetric>([
  'pctOverLongWait',
  'personsPer5Min',
  'unservedFraction',
]);

/** The two directions of a metric's axis, in words: *shorter* and *longer* for a time. */
function directionsOf(metric: BatchMetric): { readonly down: string; readonly up: string } {
  return BATCH_METRIC_PRESENTATION[metric].unit.trim() === 's'
    ? { down: 'shorter', up: 'longer' }
    : { down: 'lower', up: 'higher' };
}

/**
 * **One row, said with its size** — the one clause shape for every row this module prints, a wait
 * or drive work alike, so a figure means the same thing wherever it lands.
 *
 * - An interval excluding zero: *"was shorter by between 0.34 and 2.03 seconds"*, the bound nearer
 *   zero first. *Shorter* is the measurement; which arm that favours is the verdict's to say, and on
 *   an `axis` row nothing is.
 * - An interval containing zero: *"was too close to call at 50 runs, between 1.20 seconds shorter
 *   and 0.20 seconds longer"*; one exactly zero on every crowd *"did not differ on any crowd"*.
 * - No interval: the row's refusal, kept (amendment 3).
 */
function rowClauseOf(row: BatchComparisonRow, runs: string): string {
  const estimate = row.estimate;
  if (estimate === null) return refusalClauseOf(row);
  if (!Number.isFinite(estimate.lower) || !Number.isFinite(estimate.upper)) {
    return `${row.label} has no interval to read over ${runs}`;
  }
  const { down, up } = directionsOf(row.metric);
  const unit = unitWordsOf(row.metric);
  const was = PLURAL_LABELS.has(row.metric) ? 'were' : 'was';
  const figure = (value: number): string => `${batchFigureOf(row.metric, value)}${unit}`;
  if (estimate.lower === 0 && estimate.upper === 0) return `${row.label} did not differ on any crowd`;
  if (!intervalContainsZero(estimate)) {
    const [near, far] = [Math.abs(estimate.lower), Math.abs(estimate.upper)].sort((a, b) => a - b);
    return (
      `${row.label} ${was} ${estimate.upper < 0 ? down : up} by between ` +
      `${batchFigureOf(row.metric, near ?? 0)} and ${batchFigureOf(row.metric, far ?? 0)}${unit}`
    );
  }
  const from = estimate.lower === 0 ? 'no difference' : `${figure(estimate.lower)} ${down}`;
  const to = estimate.upper === 0 ? 'no difference' : `${figure(estimate.upper)} ${up}`;
  return `${row.label} ${was} too close to call at ${runs}, between ${from} and ${to}`;
}

/** A row with no number, said in its own refusal's terms rather than as a blank. */
function refusalClauseOf(row: BatchComparisonRow): string {
  switch (row.verdict) {
    case 'suppressed':
      return row.suppressedPairs > 0
        ? `there is no ${row.label} to compare, because ${String(row.suppressedPairs)} of ` +
            `${String(row.totalPairs)} paired runs had a setting whose own summary refuses to quote a mean`
        : `no ${row.label} comparison is made, because the two settings did not see the same passengers`;
    case 'unmeasured':
      return (
        `${row.label} was never measured on ${String(row.unmeasuredPairs)} of ` +
        `${String(row.totalPairs)} paired runs, so there is nothing to compare`
      );
    default:
      return `${row.label} has no interval, because a single run has no measurable spread`;
  }
}

/**
 * **Drive work, on its own line, for the stage's own crowds** — ruling R1, amendment 8
 * ([§ D1602](../../../../DECISIONS.md)). See {@link StageReport.energy}.
 *
 * Both `axis` rows of the tuning report, in {@link rowClauseOf}'s shape: *higher* or *lower* only
 * where the paired interval excludes zero. No word in it is a wait, and none is *met*, *missed*,
 * *better* or *worse*: an axis names no arm ahead (`CLAUDE.md`, [§ D106](../../../../DECISIONS.md)).
 */
function energySentenceOf(report: BatchReport): string | null {
  const rows = report.comparisons[0]?.rows.filter((row) => row.metricClass === 'axis') ?? [];
  if (rows.length === 0) return null;
  const runs = `${String(report.replications)} ${plural(report.replications, 'run', 'runs')}`;
  return (
    `Beside the verdict and never part of it: over ${runs} on ${crowdsOf('tuning')}, with your ` +
    `settings ${listOf(rows.map((row) => rowClauseOf(row, runs)))}.`
  );
}

function suppressionClause(
  suppressed: readonly BatchComparisonRow[],
  replications: number,
): string {
  if (suppressed.length === 0) {
    return `Every orderable measure reported over all ${String(replications)} paired runs.`;
  }
  return (
    `${String(suppressed.length)} measure${suppressed.length === 1 ? '' : 's'} could not be ` +
    `compared at all — ${suppressed.map((row) => row.label).join(', ')} — because at least one ` +
    'paired run refused to stand behind its own number, and the pairs that survived are not ' +
    'averaged. The rows above say so in each case; nothing here is a blank.'
  );
}

/* -------------------------------------------------------------------------- *
 * The headline
 * -------------------------------------------------------------------------- */

/**
 * The one line at the top, and the one place a reader might expect a score.
 *
 * There is not one. **R2**: the sentence is about the runs — how many of this stage's goals were
 * reached over how many replications — and never about which dispatcher is better in general. No
 * grade, no points, no letter.
 *
 * ## This line is a tally of verdicts, and it is deliberately not a goal claim
 *
 * § D163 clause 1's deep tier reported it as one — `goal-without-rate` at
 * `campaign/judge.ts#judgeStage · judge.headline`, on
 * *"The morning rush: all 3 goals reached over 50 runs."* — and the report is a **false positive**
 * of § D172's exact shape: a numeral matched by something that is not the quantity being looked
 * for.
 *
 * The evidence is arithmetical rather than stylistic. `honesty/surfaces.ts` seeds this string
 * `role: 'goal'` with `rateShown` set by testing it for `\d+ of \d+`, and on the **uncleared**
 * branch that pattern matches `${met} of ${total}` — a count of **goals against goals**, with no
 * seed anywhere in it. Drive a stage on a batch with no replications at all and the headline reads
 * *"0 of 2 goals reached over 0 runs"*: the pattern is satisfied, and there is no run for a pass
 * rate to be over. `judge.test.ts` pins exactly that. So the check does not report this string
 * because a rate is missing on one branch — it accepts the other branch **for the wrong reason**,
 * which is the class § D163 was written against.
 *
 * The rate R12 asks for is per goal, and every goal has one: {@link judgeCountGoal} writes
 * *"passed 45 of 50 runs"* into each goal's own sentence, seeded separately, and
 * `beat-the-baseline` — the only other kind any shipped stage carries — is `batch-only` and R12
 * never reached it (§ D160). There is no rate this line could carry: four goals have four
 * different ones, and folding them into a headline would invent a fifth number nothing measured.
 * What R13 asks of it — the `n` — it does carry, in *"over 50 runs"*, on both branches.
 *
 * **The narrowing this needs, and what the narrowing gives up.** `judge.headline` should be seeded
 * `role: 'observation'` with `declaredCount` and `countShown` set from the replication count, so
 * R13 still sees it and R12 stops being asked a question the string does not answer. That is a
 * change to `honesty/surfaces.ts`. What it can no longer catch: a headline **rewritten** to assert
 * a per-goal outcome — *"nobody-abandoned was met"* — with no rate beside it. That risk is bounded
 * here rather than left implicit: this function's inputs are a stage name, four integers and two
 * fixed clauses, and the produced headline names **no goal kind and no goal label** over the
 * shipped campaign — `judge.test.ts` asserts it on the uncleared branch and
 * `judgeCleared.test.ts` on the cleared one, one case per dispatcher. Both files, because issue
 * #317's split moved the cleared half out; the claim itself is unchanged and is now made over
 * thirteen verdicts rather than the first one that cleared.
 *
 * ## The holdout clause, and why it is on the tally rather than beside it
 *
 * A player who meets every bar on the runs they made and is told *"not cleared"* with no reason is
 * being refused by an invisible rule, which is the shape this file refuses everywhere else (a bar
 * that does not reproduce says so; a suppressed measure says so). So the rule rides on this line,
 * on all three of its branches — met-and-held, met-and-not-held, and met-and-never-asked.
 *
 * **The rule, and not the held-back crowds' sentence** — ruling R1, amendments 5 and 6
 * ([§ D1602](../../../../DECISIONS.md)). This line used to carry {@link StageHoldoutVerdict.sentence}
 * whole, and both surfaces print that sentence beside it, so the stage card read one paragraph
 * twice (finding X1). It now says that *a stage clears only when the held-back crowds agree as
 * well* and whether they did, with no cause: the sentence that explained a refusal as *a fit to
 * fifty crowds* stated a mechanism nobody measured (X6). Where the held-back crowds are named
 * beside the stage's own, the tally says which crowds it is over.
 *
 * It adds **no numeral of its own**. The rule is words only, so the string's numerals stay exactly
 * what they were: the goal tally and the replication count R13 reads.
 */
function headlineFor(
  stage: CampaignStage,
  goals: readonly StageGoalVerdict[],
  met: number,
  cleared: boolean,
  replications: number,
  holdout: StageHoldoutVerdict | null,
): string {
  const unjudged = goals.filter((goal) => goal.met === null).length;
  const total = goals.length;
  /*
   * Every numeral in this sentence is inflected, and the singular is the case that shipped wrong —
   * GitHub issue #295's F37. `data/campaign.json`'s first stage carries exactly one goal, so
   * *"all 1 goals reached"* is not a corner a player has to look for; it is the first verdict the
   * campaign ever prints. It is issue #134 in a seventh place, and the fix is the shared helper
   * rather than a seventh private ternary — see `mode/disclosure.ts#plural`.
   */
  const goalWord = plural(total, 'goal', 'goals');
  const runWord = plural(replications, 'run', 'runs');
  const tail =
    unjudged === 0
      ? ''
      : ` ${String(unjudged)} of them could not be judged from this batch, and an unjudged goal is not a passed one.`;
  /*
   * The R2 clause is on **both** branches, and that is deliberate rather than tidy: it was on the
   * cleared branch alone in the first draft, so the sentence a player sees most of the time — the
   * one that says they have not cleared the stage yet — was the one with no statement about what
   * the number means. A caveat that only appears on good news is a caveat nobody reads.
   */
  const scope =
    ' That is a statement about these runs on these passenger populations, and not a ranking of dispatchers.';
  const own = 'on the stage’s own crowds';
  if (cleared) {
    return `${stage.name}: all ${String(total)} ${goalWord} reached over ${String(replications)} ${runWord} ${own}, and again on the held-back crowds.${scope}`;
  }
  /*
   * Said only when the tuning half is the half that passed. On a batch that missed a bar the
   * player's next move is that bar, and a sentence about a second seed set they have not reached
   * yet would bury it — the same argument `dev/campaignPanel.ts` makes for labelling a control run
   * as a control before printing the verdict over it.
   */
  const rule = ' A stage clears only when the held-back crowds agree as well';
  const holdoutClause =
    met < total
      ? ''
      : holdout === null
        ? `${rule}, and this batch did not run them.`
        : holdout.held
          ? ''
          : holdout.goals.length === 0
            ? `${rule}, and the second batch was not those crowds.`
            : `${rule}, and they do not.`;
  const over = holdoutClause === '' ? '' : ` ${own}`;
  return `${stage.name}: ${String(met)} of ${String(total)} ${goalWord} reached over ${String(replications)} ${runWord}${over}.${tail}${holdoutClause}${scope}`;
}
