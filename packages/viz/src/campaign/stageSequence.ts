/**
 * What playing a stage **is** — in one place, so a surface and a suite cannot exercise two
 * versions of it.
 *
 * ## Why this module exists at all
 *
 * `stageRun.ts` was written for exactly this shape one level down, and its founding argument is
 * this file's too: *"the suite would have gone on passing if the panel had drifted … because the
 * suite was measuring a **reimplementation of the call site** rather than the call site."* That is
 * [§ D159](../../../../DECISIONS.md)'s second false-negative variant, and issue #255's holdout
 * split reproduced it immediately at the next level up: there are **three** separate statements of
 * *run the tuning batch, and run the holdout batch only if it met every bar* —
 * `campaign.test.ts#playToVerdict`, `judge.test.ts`'s inline sweep, and none at all in
 * `dev/campaignPanel.ts`, which is the regression this file exists to close.
 *
 * The panel is DOM-bound and cannot be driven under Node — `boundaries.test.ts` confines the DOM
 * to `dev/` precisely so the rest of the package stays testable without a jsdom — so the sequence
 * has to live outside it to be driven at all.
 *
 * ## What this is at this commit, and what it is not
 *
 * **This is a faithful extraction of what `dev/campaignPanel.ts#start` does today, and it is
 * wrong.** It runs one batch and judges it with no holdout, so `judgeStage` refuses every stage
 * with *"Not cleared: these are the runs this setting was tuned against, and a stage is cleared on
 * the holdout seeds as well — which this batch did not run."* That refusal is honest and the bar
 * it names is a raised one; it is also a regression the Campaign tab should not ship, and the next
 * commit is the second batch.
 *
 * A decision number is owed for the extraction.
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
 * The request is built here rather than by the caller, so two batches of one stage cannot differ
 * in anything but their seed set — `stageRun.ts`'s rule, which is what makes a second sample a
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
  /** The verdict. */
  readonly verdict: StageReport;
}

/** Play a stage: the tuning batch, judged. */
export async function runStageToVerdict(input: StageSequenceInput): Promise<StageSequenceOutcome> {
  const { stage, published, candidateProfileId, edit, run } = input;

  const result = await run(batchRequestForStage(stage, candidateProfileId, edit), 'tuning');
  const report = batchReport(result);
  return { result, report, verdict: judgeStage({ stage, published, result, report }) };
}
