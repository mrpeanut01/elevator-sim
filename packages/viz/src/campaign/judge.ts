/**
 * Judging a stage — every verdict from the batch, and no verdict this project's own discipline
 * would refuse.
 *
 * ## Where each verdict comes from, and where it does not
 *
 * | goal | judged by | why it cannot be judged any other way |
 * |---|---|---|
 * | the five per-run kinds | `measureGoalRate` over the **candidate** arm, against the count `data/scenario-goals.json` published for this stage | R12: they are batch goals on every stage they ship on, because R12's trichotomy leaves no single-run category ([§ D160](../../../../DECISIONS.md)) |
 * | `beat-the-baseline` | `batch/report.ts`'s paired-t rows, which come from `experiments`' own `pairedDifferenceEstimate` and `intervalContainsZero` | CLAUDE.md: *"Never declare one dispatcher better than another without a paired-t confidence interval that excludes zero"* |
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
  isPerReplicationGoal,
  measureGoalRate,
  type GoalKind,
  type GoalRate,
  type GoalSpec,
} from '../scenario/goals.js';
import type { PublishedScenario } from '../scenario/published.js';
import type { CampaignStage } from './types.js';

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

export interface StageReport {
  readonly stageId: string;
  readonly stageName: string;
  /** R7 / invariant 5. The whole batch replays from this, in every mode. */
  readonly seed: string;
  readonly replications: number;
  readonly baselineProfileId: string;
  readonly candidateProfileId: string;
  readonly goals: readonly StageGoalVerdict[];
  /** Every goal met. `false` whenever any goal is `null`, because unjudged is not passed. */
  readonly cleared: boolean;
  readonly headline: string;
}

export interface JudgeStageInput {
  readonly stage: CampaignStage;
  /** This stage's row of the published table — the source of every bar. */
  readonly published: PublishedScenario;
  readonly result: BatchResult;
  /** `batchReport(result)`, passed in rather than recomputed so the panel draws what was judged. */
  readonly report: BatchReport;
}

/**
 * Judge every goal the stage declares.
 *
 * Pure: the batch already ran, and nothing here simulates, samples or estimates.
 */
export function judgeStage(input: JudgeStageInput): StageReport {
  const { stage, published, result, report } = input;
  const baselineArm = result.arms[0];
  const candidateArm = result.arms[1] ?? result.arms[0];

  const goals = stage.goals.map((spec) =>
    isPerReplicationGoal(spec.kind)
      ? judgeCountGoal(spec, published, baselineArm, candidateArm)
      : judgeComparisonGoal(spec, report),
  );

  const met = goals.filter((goal) => goal.met === true).length;
  const cleared = goals.length > 0 && met === goals.length;
  return {
    stageId: stage.id,
    stageName: stage.name,
    seed: result.seed,
    replications: report.replications,
    baselineProfileId: baselineArm?.dispatcherProfileId ?? '',
    candidateProfileId: candidateArm?.dispatcherProfileId ?? '',
    goals,
    cleared,
    headline: headlineFor(stage, goals, met, cleared, report.replications),
  };
}

/* -------------------------------------------------------------------------- *
 * The count goals
 * -------------------------------------------------------------------------- */

type Arm = BatchResult['arms'][number] | undefined;

function judgeCountGoal(
  spec: GoalSpec,
  published: PublishedScenario,
  baselineArm: Arm,
  candidateArm: Arm,
): StageGoalVerdict {
  const label = goalLabel(spec);
  const record = published.goals.find((entry) => entry.kind === spec.kind);
  const target = record?.tuning?.passes ?? null;
  const publishedN = record?.tuning?.n ?? null;

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
        'running the building, demand level, horizon and seed set the table was measured on.',
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
      `${label}: your setting passed ${String(candidate.passes)} of ${String(candidate.n)} runs; ` +
      `the shipped setting passed ${String(target)} of ${String(publishedN)} on the same ` +
      `passenger populations. ${met ? 'The bar is reached.' : 'The bar is not reached.'}`,
    note:
      'The bar is the shipped setting’s own measured count on this stage’s tuning seeds, ' +
      'published in data/scenario-goals.json — not a number chosen here. Both arms saw the same ' +
      'passengers, so the two counts are paired. A count is not an interval: a couple of runs ' +
      'either way is inside what a batch of this size scatters by, and the goal that answers ' +
      '“is it actually better” is beat-the-baseline, which needs an interval that excludes zero.',
  };
}

function rateOf(spec: GoalSpec, arm: Arm): GoalRate | null {
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
 */
function headlineFor(
  stage: CampaignStage,
  goals: readonly StageGoalVerdict[],
  met: number,
  cleared: boolean,
  replications: number,
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
    return `${stage.name}: all ${String(total)} goals reached over ${String(replications)} runs.${scope}`;
  }
  return `${stage.name}: ${String(met)} of ${String(total)} goals reached over ${String(replications)} runs.${tail}${scope}`;
}
