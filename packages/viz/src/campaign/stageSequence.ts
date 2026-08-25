/**
 * What playing a stage **is**, now that a stage takes two batches — in one place, so a surface and
 * a suite cannot exercise two versions of it.
 *
 * ## Why this module exists at all
 *
 * `stageRun.ts` was written for exactly this shape one level down, and its founding argument is
 * this file's too: *"the suite would have gone on passing if the panel had drifted … because the
 * suite was measuring a **reimplementation of the call site** rather than the call site."* That is
 * [§ D159](../../../../DECISIONS.md)'s second false-negative variant, and issue #255's holdout
 * split reproduced it immediately at the next level up. When this module was written there were
 * **three** separate statements of *run the tuning batch, and run the holdout batch only if it met
 * every bar* — `campaign.test.ts#playToVerdict`, `judge.test.ts`'s inline sweep, and the one
 * `dev/campaignPanel.ts` did not have, which is the regression this closes. Three copies of a rule
 * that decides whether a player cleared a stage is three places for it to drift.
 *
 * So the sequence is stated once, here, and the panel and the suite both call it.
 *
 * ## The two batches, and why the second one is often not run
 *
 * `judge.ts` carries the argument for the split at length. What this module adds is the **order**
 * and the **skip**:
 *
 * 1. The tuning batch — `batchRequestForStage(stage, …)` over `stage.seeds`. These are the runs the
 *    player made, and every goal row's sentence comes from them, because feedback a player cannot
 *    see is not feedback.
 * 2. `judgeStage` over that batch alone, for `StageReport.metOnTuningSeeds`.
 * 3. **Only if that is `true`**, the holdout batch — the same two arms, the same horizon, the same
 *    demand, over `stage.holdoutSeeds` — and `judgeStage` again with both halves.
 *
 * The skip is **arithmetic, not an optimisation with a cost**: `StageReport.cleared` requires both
 * halves, so a stage that missed a bar on the runs the player made is refused whatever the holdout
 * says. Running fifty more replications to learn nothing would double the cost of the common case,
 * which on this surface is a minute of a player's time and in the suite is every sweep in
 * `campaign.test.ts`. What it costs is stated rather than glossed: on a refused stage nothing is
 * known about the holdout seeds, and {@link StageSequenceOutcome.verdict}'s `holdout` is `null` —
 * which `judge.ts` already defines as a refusal rather than a pass, and which a surface must
 * report as *not run* rather than as *held*.
 *
 * ## What is returned, and why the tuning batch comes back with the verdict
 *
 * A caller draws more than the verdict: `dev/campaignPanel.ts` draws `batchReport`'s own rows and
 * replays replication 0 of the batch to diagnose its fail states. Both are statements about the
 * **tuning** batch and neither may quietly become a statement about the other one, so the tuning
 * result and its report are returned beside the verdict rather than left for the caller to pick out
 * of a pair. The holdout batch is deliberately **not** returned: nothing outside `judge.ts` should
 * be drawing figures off it, and a caller that cannot reach it cannot mix the two.
 *
 * A decision number is owed for the extraction and for the skip.
 */

import { batchReport, type BatchReport } from '../batch/report.js';
import type { BatchRequest, BatchResult } from '../batch/types.js';
import type { EditedVector } from '../controls/editedProfile.js';
import type { PublishedScenario } from '../scenario/published.js';

import { judgeStage, type StageReport } from './judge.js';
import { batchRequestForStage, type StageSeedSet } from './stageRun.js';
import type { CampaignStage } from './types.js';

/**
 * How a caller runs one batch.
 *
 * The request is built here rather than by the caller, so the two batches cannot differ in
 * anything but their seed set — `stageRun.ts`'s rule, which is what makes the second sample a
 * *holdout* rather than a second question. `seedSet` is passed alongside it because a surface has
 * something to say about which of the two is running, and reading it back off the request's seed
 * would be a second derivation of a thing already known.
 *
 * Synchronous or not: the suite hands over `runBatch` and the panel hands over a worker.
 */
export type StageBatchRunner = (
  request: BatchRequest,
  seedSet: StageSeedSet,
) => BatchResult | Promise<BatchResult>;

export interface StageSequenceInput {
  readonly stage: CampaignStage;
  /** This stage's row of the published table — the source of every bar, on both seed sets. */
  readonly published: PublishedScenario;
  readonly candidateProfileId: string;
  /** The player's edited weight vector, or absent to run `candidateProfileId` as shipped. */
  readonly edit?: EditedVector | undefined;
  readonly run: StageBatchRunner;
}

export interface StageSequenceOutcome {
  /** The **tuning** batch: the runs the player made, and the only ones a figure may be drawn from. */
  readonly result: BatchResult;
  /** `batchReport(result)`, taken once so the caller draws what was judged. */
  readonly report: BatchReport;
  /**
   * The verdict over both halves — or over one half with the other refused, when the tuning batch
   * missed a bar and the holdout batch was therefore not run. `verdict.holdout` is `null` in
   * exactly that case, and it is the only case: this function never judges with a holdout it did
   * not run, and never runs a holdout it does not judge with.
   */
  readonly verdict: StageReport;
}

/**
 * Play a stage: the tuning batch, then — only when it met every bar — the holdout batch.
 *
 * The seed split is `judgeStage`'s to enforce and it does so by **checking** the second batch's
 * master seed rather than trusting its name, so nothing here can satisfy the gate by running the
 * tuning batch twice. This function's contract is narrower and worth saying on its own: it asks
 * {@link StageBatchRunner} for `'holdout'` and hands `judgeStage` whatever came back.
 */
export async function runStageToVerdict(
  input: StageSequenceInput,
): Promise<StageSequenceOutcome> {
  const { stage, published, candidateProfileId, edit, run } = input;

  const result = await run(batchRequestForStage(stage, candidateProfileId, edit), 'tuning');
  const report = batchReport(result);
  const onTuning = judgeStage({ stage, published, result, report });
  if (!onTuning.metOnTuningSeeds) return { result, report, verdict: onTuning };

  const holdoutResult = await run(
    batchRequestForStage(stage, candidateProfileId, edit, 'holdout'),
    'holdout',
  );
  const holdout = { result: holdoutResult, report: batchReport(holdoutResult) };
  return {
    result,
    report,
    verdict: judgeStage({ stage, published, result, report, holdout }),
  };
}
