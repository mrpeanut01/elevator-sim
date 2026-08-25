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
 * `campaign.test.ts` plays an authored `EditedVector` on stage 2 (`weights.waitTime: 1`,
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
 * runs the player made *and* every goal met on the runs they could not have tuned against.
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
 * own. A decision number is owed for all of it.
 *
 * ## R11 and R2, structurally
 *
 * The `beat-the-baseline` test reads `BatchComparisonRow.favours`, which `batch/report.ts` sets to
 * `null` on every `axis` row **however its interval fell**. There is no branch here that could
 * order two arms on energy, because there is no value to branch on. And every sentence below is a
 * statement about *runs* — *"in 50 runs, 45 passed"* — never about a dispatcher, except the one
 * sentence a paired-t interval over fifty paired replications entitles the project to say.
 */

import type { BatchComparisonRow, BatchReport } from '../batch/report.js';
import type { BatchResult } from '../batch/types.js';
import {
  goalLabel,
  asPerReplicationGoal,
  measureGoalRate,
  type PerReplicationGoalSpec,
  type GoalKind,
  type GoalRate,
  type GoalSpec,
} from '../scenario/goals.js';
import type { PublishedGoalRecord, PublishedRate, PublishedScenario } from '../scenario/published.js';
import { stageSeedSetOf, type StageSeedSet } from './stageRun.js';
import type { CampaignStage } from './types.js';
import { glossaryFor, type GlossaryTerm } from '../mode/glossary.js';

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
}

/**
 * The stage judged a second time, on seeds the player could not have tuned against.
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
   * Every goal met on the runs the player made **and** on the runs they could not have tuned
   * against. `false` whenever any goal is `null`, because unjudged is not passed — and `false`
   * whenever {@link holdout} is `null`, because unvalidated is not passed either.
   */
  readonly cleared: boolean;
  readonly headline: string;
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

  const goals = judgeGoalsOf(stage, published, result, report, 'tuning');
  const holdout = holdoutVerdictFor(stage, published, input.holdout);

  const met = goals.filter((goal) => goal.met === true).length;
  const metOnTuningSeeds = goals.length > 0 && met === goals.length;
  const cleared = metOnTuningSeeds && holdout !== null && holdout.held;
  const headline = headlineFor(stage, goals, met, cleared, report.replications, holdout);
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
      const label = goalLabel(spec);
      return {
        kind: spec.kind,
        label,
        met: null,
        reproduced: null,
        sentence: `${label}: declares no threshold, so there is no ceiling to judge a wait against.`,
        note:
          'The kind is judgeable on one run; this instance of it is not. A campaign file is ' +
          'refused at load for this, so seeing it here means the stage was assembled in memory.',
      };
    }
    return judgeComparisonGoal(spec, report);
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
        `holdout set ${seeds.name} is seed ${seeds.seed}. A stage is cleared on runs the settings ` +
        'were not tuned against, so a batch that is not that set validates nothing.',
    };
  }

  const goals = judgeGoalsOf(stage, published, batch.result, batch.report, 'holdout');
  const met = goals.filter((goal) => goal.met === true).length;
  const held = goals.length > 0 && met === goals.length;
  const unjudged = goals.filter((goal) => goal.met === null).length;
  const runs = `${String(batch.report.replications)} runs`;
  const tail =
    unjudged === 0
      ? ''
      : ` ${String(unjudged)} of them could not be judged there, and an unjudged goal is not a passed one.`;
  return {
    seedSetName: seeds.name,
    seed: seeds.seed,
    goals,
    held,
    sentence: held
      ? `The holdout set ${seeds.name} (seed ${seeds.seed}) agrees: all ${String(goals.length)} ` +
        `goals reached over ${runs} this setting was not tuned against.`
      : `The holdout set ${seeds.name} (seed ${seeds.seed}) does not agree: ${String(met)} of ` +
        `${String(goals.length)} goals reached over ${runs} this setting was not tuned against.` +
        `${tail} A gain that does not survive a disjoint seed set is a fit to fifty passenger ` +
        'populations rather than a better way of running the building.',
  };
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
  const label = goalLabel(spec);
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
      sentence: `${label}: this stage has no published count for it, so there is no bar to judge against.`,
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
      sentence: `${label}: this batch produced no runs to judge.`,
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
        `${label}: not judged. The shipped setting scored ${String(baseline.passes)} of ` +
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
      sentence: `${label}: not judged. ${candidate.sentence}`,
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
    sentence:
      `${label}: your setting passed ${String(candidate.passes)} of ${String(candidate.n)} ` +
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
      'the goal that answers “is it actually better” is beat-the-baseline, which needs an interval ' +
      `that excludes zero.${
        seedSet === 'tuning'
          ? ''
          : ' These are the runs your setting was not tuned against, which is the half that ' +
            'decides whether the stage is cleared.'
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
 */
function judgeComparisonGoal(spec: GoalSpec, report: BatchReport): StageGoalVerdict {
  const label = goalLabel(spec);
  const comparison = report.comparisons[0];
  if (comparison === undefined) {
    return {
      kind: spec.kind,
      label,
      met: null,
      reproduced: null,
      sentence: `${label}: there is only one arm in this batch, so there is no difference to take.`,
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
    sentence: `${label}: ${comparisonSentence(report.replications, ahead, behind, underBudget)}`,
    note:
      `${suppressionClause(suppressed, report.replications)} Energy is not in this test: it is an ` +
      'axis and never a score, and the arm that spends least is routinely the arm that carried ' +
      'fewest people. Its interval is drawn beside these rows and is never ranked.',
  };
}

function comparisonSentence(
  replications: number,
  ahead: readonly BatchComparisonRow[],
  behind: readonly BatchComparisonRow[],
  underBudget: readonly BatchComparisonRow[],
): string {
  const runs = `${String(replications)} runs`;
  const names = (rows: readonly BatchComparisonRow[]): string =>
    rows.map((row) => row.label).join(', ');
  /*
   * Named rather than folded into *"had no number"*: these rows **have** a number.
   *
   * Only the first branch below can carry it, and that is arithmetic rather than an oversight —
   * every row that forms an interval forms it over the same `n`, so a report with an
   * `under-budget` row has no `resolved` row and therefore nothing ahead and nothing behind.
   */
  const budgetClause =
    underBudget.length === 0
      ? ''
      : ` The interval on ${names(underBudget)} excludes zero and is drawn, and it orders ` +
        'nothing: this batch is below the project’s replication budget.';
  if (ahead.length === 0 && behind.length === 0) {
    return (
      `in ${runs}, no measure separated the two settings — every interval on the difference ` +
      `included zero, or had no number to form one. The two are not ordered.${budgetClause}`
    );
  }
  if (behind.length === 0) {
    return (
      `in ${runs}, your setting came out ahead on ${names(ahead)} — the interval on the ` +
      'difference excludes zero — and no measure resolved against it. The bar is reached.'
    );
  }
  if (ahead.length === 0) {
    return (
      `in ${runs}, your setting came out behind on ${names(behind)}, and ahead on nothing that ` +
      'resolved. The bar is not reached.'
    );
  }
  return (
    `in ${runs}, your setting came out ahead on ${names(ahead)} and behind on ${names(behind)}. ` +
    'That is a move along the front rather than a win, so the bar is not reached.'
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
 * fixed clauses, and `judge.test.ts` asserts the produced headline names **no goal kind and no
 * goal label**, on both branches, over the shipped campaign.
 *
 * ## The holdout clause, and why it is on the tally rather than beside it
 *
 * A player who meets every bar on the runs they made and is told *"not cleared"* with no reason is
 * being refused by an invisible rule, which is the shape this file refuses everywhere else (a bar
 * that does not reproduce says so; a suppressed measure says so). So the holdout's answer rides on
 * this line, in the same tally sentence, on all three of its branches — met-and-held, met-and-not-
 * held, and met-and-never-asked.
 *
 * It adds **no numeral of its own** on the branch that has none to add. The *not validated* clause
 * is words only, so the string's numerals stay exactly what they were: the goal tally and the
 * replication count R13 reads.
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
  if (cleared) {
    return `${stage.name}: all ${String(total)} goals reached over ${String(replications)} runs, and again on the holdout seeds.${scope}`;
  }
  /*
   * Said only when the tuning half is the half that passed. On a batch that missed a bar the
   * player's next move is that bar, and a sentence about a second seed set they have not reached
   * yet would bury it — the same argument `dev/campaignPanel.ts` makes for labelling a control run
   * as a control before printing the verdict over it.
   */
  const holdoutClause =
    met < total
      ? ''
      : holdout === null
        ? ' Not cleared: these are the runs this setting was tuned against, and a stage is cleared ' +
          'on the holdout seeds as well — which this batch did not run.'
        : holdout.held
          ? ''
          : ` Not cleared: ${holdout.sentence}`;
  return `${stage.name}: ${String(met)} of ${String(total)} goals reached over ${String(replications)} runs.${tail}${holdoutClause}${scope}`;
}
