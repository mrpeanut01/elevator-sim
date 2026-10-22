/**
 * **The held-back crowds judge the split**: ruling R10 on GitHub issue #645, amendments 6 and 7
 * ([§ D1622](../../../../DECISIONS.md)).
 *
 * The split is measured on the stage's own crowds only, so a row it prints as resolved could be a
 * feature of those fifty crowds. This sets every row the block can print against the same row on the
 * stage's held-back crowds: the three waits, the three observation rows `comparisonSentence` sizes
 * when they resolve, and the two drive-work rows, for each of a press's two changes, over **every
 * two-change move the page admits** at a budget: the page's own list (each standing order alone,
 * and {@link stagePageMovesOf}'s parked moves), asked through `stageSplitPlanOf` and so through
 * `admitStageMove`, never a fixed count.
 *
 * **The gate.** It fails when a row the stage's own crowds print as resolved one way has a held-back
 * interval excluding zero the other way. Same-way agreement is counted and printed beside it and
 * never gated (amendment 7). A flip is not a thing to fix here: the ruling sends it back to the panel
 * with the stage, the move and the row, and nothing (words, rows, seeds or this rule) is changed to
 * make it pass.
 *
 * **What it covers is exactly where the block draws.** It iterates
 * `stagePlay.ts#STAGE_SPLIT_COVERAGE` and nothing else, and `stageSplitPlanOf` draws no block off that
 * table, so a stage or budget this test does not reach never runs a split. Stage 1 at its 4 u base
 * is always-on (amendment 6); the rest of the table runs under `ELEVATOR_SIM_DEEP=1`, in
 * `.github/workflows/deep-tiers.yml`'s `stage-split` job.
 *
 * **Its cost.** One batch per seed set holds every arm the stage's splits need (the presses, the
 * shipped order under each parking, each order under the shipped parking), because every arm of a
 * batch sees the same crowds and runs alone, so an arm's figures do not depend on its neighbours; the
 * always-on case checks that against one split run through `runStageSplit`, the screen's own path.
 * Measured 2026-10-22 on the lane's shared four-core container: stage 1 at 4 u, 18 moves and 27
 * arms, about 7 s for both seed sets; with the gate open, 1 519 s for the file, stages 3 and 5 the
 * dearest at about 300 s each.
 */

import { appendFileSync } from 'node:fs';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { runBatch } from '../batch/runBatch.js';
import type { BatchResult } from '../batch/types.js';
import { stageSplitOf, type StageSplit } from '../campaign/judge.js';
import { batchRequestForStage, type StageSeedSet } from '../campaign/stageRun.js';
import type { StageMove } from '../campaign/stagePress.js';
import type { CampaignStage } from '../campaign/types.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { loadSurvivorFixture } from '../scenario/regenerateSurvivors.test-helper.js';
import {
  STAGE_SPLIT_COVERAGE,
  runStageSplit,
  stagePageMovesOf,
  stageSplitPlanOf,
  type StageSplitPlan,
} from './stagePlay.js';

let config: LoadedConfig;
let space: SearchSpace;
let stages: readonly CampaignStage[];

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  space = collectSearchSpace();
  stages = (await loadSurvivorFixture()).campaign.stages;
}, 120_000);

/** What one stage at one budget came to. */
interface Holding {
  readonly stageId: string;
  readonly units: number;
  readonly moves: number;
  /** Rows set against each other: every row of both changes of every move. */
  readonly rows: number;
  /** Rows the stage's own crowds print as resolved, one way or the other. */
  readonly printed: number;
  /** Of those, held-back intervals excluding zero the same way. Printed, never gated. */
  readonly sameWay: number;
  /** Of those, held-back intervals excluding zero the other way: the gate. */
  readonly flips: readonly string[];
  /** The stage's own crowds' plans and splits, for the path check. */
  readonly plans: readonly StageSplitPlan[];
  readonly tuning: ReadonlyMap<StageSplitPlan, StageSplit>;
}

function stageNamed(id: string): CampaignStage {
  const stage = stages.find((entry) => entry.id === id);
  if (stage === undefined) throw new Error(`the campaign ships no stage ${id}`);
  return stage;
}

function contextOf(stage: CampaignStage) {
  return {
    space,
    schedule: shippedPriceSchedule(),
    baseline: requireDispatcher(config, stage.dispatcher.startingProfileId),
    building: requireBuilding(config, stage.building),
    elevatorSpecs: config.elevatorSpecs,
  };
}

function resourcesOf(stage: CampaignStage) {
  return {
    building: requireBuilding(config, stage.building),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

/** One arm's key: the profile it runs, edited or not. */
function keyOf(move: StageMove): string {
  return move.edit === undefined ? move.profile.id : move.edit.profileId;
}

/** Every two-change move the page admits at this budget, from the page's own list. */
function plansOf(stage: CampaignStage, units: number): readonly StageSplitPlan[] {
  const profiles = config.dispatcherProfiles.profiles;
  const moves: StageMove[] = [
    ...profiles.map((profile) => ({ profile })),
    ...stagePageMovesOf(profiles, space, shippedPriceSchedule()).map((entry) => entry.move),
  ];
  const context = contextOf(stage);
  return moves.flatMap((move) => {
    const plan = stageSplitPlanOf({ stageId: stage.id, context, move, budgetUnits: units });
    return plan === undefined ? [] : [plan];
  });
}

/** Every arm the plans need, run once on one seed set: one batch, every arm on the same crowds. */
function armsBatch(stage: CampaignStage, plans: readonly StageSplitPlan[], seedSet: StageSeedSet): BatchResult {
  const arms = new Map<string, StageMove>();
  for (const plan of plans) for (const move of [plan.press, plan.forOrder, plan.forParking]) arms.set(keyOf(move), move);
  const request = batchRequestForStage(stage, stage.dispatcher.startingProfileId, undefined, seedSet);
  return runBatch(
    {
      ...request,
      arms: [...arms.entries()].map(([armId, move]) => ({
        armId,
        dispatcherProfileId: move.profile.id,
        ...(move.edit === undefined ? {} : { edit: move.edit }),
      })),
    },
    resourcesOf(stage),
  );
}

/** One plan's split, worded by the judge over the arms of a batch on one seed set. */
function splitFrom(batch: BatchResult, plan: StageSplitPlan): StageSplit {
  const arm = (move: StageMove) => {
    const found = batch.arms.find((entry) => entry.armId === keyOf(move));
    if (found === undefined) throw new Error(`no arm ${keyOf(move)}`);
    return found;
  };
  const press = arm(plan.press);
  const split = stageSplitOf({
    result: { ...batch, arms: [press, arm(plan.forOrder), arm(plan.forParking)] },
    verdict: { ...batch, arms: [press, press] },
    changed: plan.changed,
    orderName: plan.orderName,
    parkingName: plan.parkingName,
    holdoutRan: false,
  });
  if (split === undefined) throw new Error(`${keyOf(plan.press)}: the judge drew no split`);
  return split;
}

/** −1, 0 or +1: which way an interval excludes zero, or 0 where it does not or there is none. */
function signOf(estimate: { readonly lower: number; readonly upper: number } | null): -1 | 0 | 1 {
  if (estimate === null || !Number.isFinite(estimate.lower) || !Number.isFinite(estimate.upper)) return 0;
  return estimate.lower > 0 ? 1 : estimate.upper < 0 ? -1 : 0;
}

function holdingOf(stageId: string, units: number): Holding {
  const stage = stageNamed(stageId);
  const plans = plansOf(stage, units);
  const own = armsBatch(stage, plans, 'tuning');
  const held = armsBatch(stage, plans, 'holdout');
  expect(own.crn.aligned && held.crn.aligned, `${stageId}: common random numbers`).toBe(true);
  const tuning = new Map<StageSplitPlan, StageSplit>();
  let rows = 0;
  let printed = 0;
  let sameWay = 0;
  const flips: string[] = [];
  for (const plan of plans) {
    const mine = splitFrom(own, plan);
    const theirs = splitFrom(held, plan);
    tuning.set(plan, mine);
    for (const [index, line] of mine.lines.entries()) {
      const heldRows = theirs.lines[index]?.report.comparisons[0]?.rows ?? [];
      for (const row of line.report.comparisons[0]?.rows ?? []) {
        rows += 1;
        /* What the line prints as resolved: a sized orderable row, or a drive-work row said higher or lower. */
        const way = row.metricClass === 'axis' || row.verdict === 'resolved' ? signOf(row.estimate) : 0;
        if (way === 0) continue;
        printed += 1;
        const other = heldRows.find((candidate) => candidate.metric === row.metric);
        const heldWay = signOf(other?.estimate ?? null);
        if (heldWay === way) sameWay += 1;
        if (heldWay === -way) {
          flips.push(
            `${stageId} at ${String(units)} u, ${keyOf(plan.press)}, ${line.change}, ${row.label}: ` +
              `[${String(row.estimate?.lower)}, ${String(row.estimate?.upper)}] on the stage’s own crowds, ` +
              `[${String(other?.estimate?.lower)}, ${String(other?.estimate?.upper)}] held back`,
          );
        }
      }
    }
  }
  return { stageId, units, moves: plans.length, rows, printed, sameWay, flips, plans, tuning };
}

/**
 * Each stage's tally, appended to the file `ELEVATOR_SIM_SPLIT_OUT` names, where it names one: vitest
 * keeps a passing case's console to itself, and the figures are the half of this test a reader wants.
 */
function record(holding: Holding): void {
  const out = process.env['ELEVATOR_SIM_SPLIT_OUT'];
  if (out !== undefined && out !== '') appendFileSync(out, `${summaryOf(holding)}\n${holding.flips.map((flip) => `  FLIP ${flip}\n`).join('')}`);
}

function summaryOf(holding: Holding): string {
  return (
    `${holding.stageId} at ${String(holding.units)} u: ${String(holding.moves)} two-change moves, ` +
    `${String(holding.rows)} rows, ${String(holding.printed)} printed as resolved, ` +
    `${String(holding.sameWay)} resolved the same way held back, ${String(holding.flips.length)} flipped`
  );
}

describe('stage 1 at its base: no row the split prints resolved flips on the held-back crowds (amendments 6 and 7)', () => {
  let holding: Holding;

  beforeAll(() => {
    holding = holdingOf('stage-1-first-call', 4);
    record(holding);
  }, 300_000);

  it('covers every two-change move the page admits, zoned-uppeak as it stands among them', () => {
    expect(STAGE_SPLIT_COVERAGE['stage-1-first-call']).toContain(4);
    expect(holding.moves).toBeGreaterThan(0);
    const presses = holding.plans.map((plan) => keyOf(plan.press));
    expect(presses).toContain('zoned-uppeak');
    expect(presses).not.toContain('zoned-uppeak-parked-stay');
    /* Every row the block can print, both changes, every move. */
    expect(holding.rows).toBe(holding.moves * 2 * 8);
    expect(holding.printed).toBeGreaterThan(0);
  });

  it('flips no row', () => {
    expect(holding.flips, summaryOf(holding)).toEqual([]);
  });

  it('words each split from the same runs the screen’s own path runs', async () => {
    const stage = stageNamed('stage-1-first-call');
    const plan = holding.plans.find((entry) => keyOf(entry.press) === 'eta-parked-predicted-demand');
    if (plan === undefined) throw new Error('X1’s press is not among the page’s two-change moves');
    const verdict = runBatch(batchRequestForStage(stage, plan.press.profile.id, plan.press.edit, 'tuning'), resourcesOf(stage));
    const split = await runStageSplit({ stage, plan, verdict, holdoutRan: false, run: (request) => runBatch(request, resourcesOf(stage)) });
    expect(split?.lines.map((line) => line.sentence)).toEqual(holding.tuning.get(plan)?.lines.map((line) => line.sentence));
  });
});

const DEEP = Object.entries(STAGE_SPLIT_COVERAGE).flatMap(([stageId, rungs]) =>
  rungs.filter((units) => !(stageId === 'stage-1-first-call' && units === 4)).map((units) => [stageId, units] as const),
);

describe.skipIf(process.env['ELEVATOR_SIM_DEEP'] !== '1')('every other stage and budget the split draws on: no flip (amendments 6 and 7)', () => {
  it('flips no row the split prints resolved, on stage 1’s 24 u rung and the base of stages 2 to 10', () => {
    expect(DEEP.length).toBe(Object.values(STAGE_SPLIT_COVERAGE).flat().length - 1);
    const holdings = DEEP.map(([stageId, units]) => {
      const holding = holdingOf(stageId, units);
      record(holding);
      return holding;
    });
    for (const holding of holdings) expect(holding.moves, summaryOf(holding)).toBeGreaterThan(0);
    expect(holdings.flatMap((holding) => holding.flips), holdings.map(summaryOf).join('\n')).toEqual([]);
  }, 7_200_000);
});
