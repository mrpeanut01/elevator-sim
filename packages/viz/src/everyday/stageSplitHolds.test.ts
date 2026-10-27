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
 * **The contrast** (ruling R11, amendment 4, [§ D1625](../../../../DECISIONS.md)) is gated the same
 * way, reading its rows from the contrast's own `BatchReport` on each seed set rather than working a
 * difference out again: the three waits and the three observation rows, since drive work stays out
 * of that line. A contrast row the stage's own crowds print as resolved one way whose held-back
 * interval excludes zero the other way fails the gate and goes back to the panel with the stage, the
 * move and the row; same-way agreement is printed beside it and never gated.
 *
 * **The split's two existing lines are pinned** to what they printed on `4afdd45`, before the
 * contrast landed: {@link EXISTING_LINES_SHA256} holds one digest per stage and budget over every
 * move's two lines and their drive-work lines, on the stage's own crowds, so adding the contrast
 * cannot have moved a word of them.
 *
 * **Its cost.** One batch per seed set holds every arm the stage's splits need (the presses, the
 * shipped order under each parking, each order under the shipped parking), because every arm of a
 * batch sees the same crowds and runs alone, so an arm's figures do not depend on its neighbours; the
 * always-on case checks that against one split run through `runStageSplit`, the screen's own path.
 * Measured 2026-10-22 on the lane's shared four-core container: stage 1 at 4 u, 18 moves and 27
 * arms, about 7 s for both seed sets; with the gate open, 1 519 s for the file, stages 3 and 5 the
 * dearest at about 300 s each.
 */

import { createHash } from 'node:crypto';
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
  /** The contrast's rows (§ D1625): the waits and observation rows of every move's contrast report. */
  readonly contrastRows: number;
  /** Contrast rows the stage's own crowds print as resolved. */
  readonly contrastPrinted: number;
  /** Of those, held back the same way. Printed, never gated. */
  readonly contrastSameWay: number;
  /** Of those, held back the other way: the gate (amendment 4). */
  readonly contrastFlips: readonly string[];
  /** The digest of every move's two existing lines and their drive-work lines, on the stage's own crowds. */
  readonly linesDigest: string;
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
  let contrastRows = 0;
  let contrastPrinted = 0;
  let contrastSameWay = 0;
  const contrastFlips: string[] = [];
  const lines: string[] = [];
  for (const plan of plans) {
    const mine = splitFrom(own, plan);
    const theirs = splitFrom(held, plan);
    tuning.set(plan, mine);
    lines.push(`# ${keyOf(plan.press)}`, ...mine.lines.flatMap((line) => [line.sentence, line.energy ?? '(no energy line)']));
    /* § D1625: the contrast's own rows on both seed sets; drive work is not in its line, so not here. */
    const heldContrast = theirs.contrast.report.comparisons[0]?.rows ?? [];
    for (const row of (mine.contrast.report.comparisons[0]?.rows ?? []).filter((entry) => entry.metricClass !== 'axis')) {
      contrastRows += 1;
      const way = row.verdict === 'resolved' ? signOf(row.estimate) : 0;
      if (way === 0) continue;
      contrastPrinted += 1;
      const other = heldContrast.find((candidate) => candidate.metric === row.metric);
      const heldWay = signOf(other?.estimate ?? null);
      if (heldWay === way) contrastSameWay += 1;
      if (heldWay === -way) {
        contrastFlips.push(
          `${stageId} at ${String(units)} u, ${keyOf(plan.press)}, contrast, ${row.label}: ` +
            `[${String(row.estimate?.lower)}, ${String(row.estimate?.upper)}] on the stage’s own crowds, ` +
            `[${String(other?.estimate?.lower)}, ${String(other?.estimate?.upper)}] held back`,
        );
      }
    }
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
  const linesDigest = createHash('sha256').update(lines.join('\n')).digest('hex');
  return {
    stageId,
    units,
    moves: plans.length,
    rows,
    printed,
    sameWay,
    flips,
    contrastRows,
    contrastPrinted,
    contrastSameWay,
    contrastFlips,
    linesDigest,
    plans,
    tuning,
  };
}

/**
 * **The split's two existing lines as they printed on `4afdd45`**, before ruling R11's contrast
 * ([§ D1625](../../../../DECISIONS.md)): per stage and budget, the SHA-256 of every two-change move's
 * press key, its two lines and their drive-work lines on the stage's own crowds, in the page's own
 * order, joined by newlines. Taken by running this file's own wording over the base commit.
 */
const EXISTING_LINES_SHA256: Readonly<Record<string, string>> = Object.freeze({
  'stage-1-first-call@4': '071a4bf0e5cd9c75c5fcf75a98745c7153d424480e31b07f6bba2e21793a26a2',
  'stage-1-first-call@24': 'a3f2e5b0791c12e8ff32d36e1633481c975139bd48ba8e3eba6b739b23d8c1d1',
  'stage-2-morning-rush@4': 'da150c359b68df8a8e6d0f6b14d9c4db29f74c8ebedee6c854ea8c96c3b92159',
  'stage-3-overwhelmed@4': '6642f6b50ef2feb9acf3e0fa8680215d24b8b6d28fa6fe002b725ca61818fdc5',
  'stage-4-two-banks@15': 'f3c55e2bd318778e676629435a13243303962795194ce062bbf3c29c51b7b218',
  'stage-5-credentials@15': 'f0a5788a9b7c4c8e623a5bd59703fea877c35a140a570420e5e5988f6bcddfb8',
  'stage-6-the-tall-one@15': 'bbfcfcdaa2328f09a8adbbcbfa0126c126c95268f174b09fc4e75b692d9372ef',
  'stage-7-prove-it@15': 'b44a51938099da19b37df715c5fff518a3c7a514605e1bff5672e189fc8e250b',
  'stage-8-the-headline-address@4': 'cebe5da481e513cb1510737518c095ad4876ca161e0aa736cccc2b670d464477',
  'stage-9-both-ways-at-once@15': '6764315c864e338c27abd41d71a747049a20b520b79e5cb254ef12be84b27324',
  'stage-10-the-bed-and-the-visitor@15': 'a64c3658f4f833ade7469f8d0de163eb96c3debc3f395a66b2b7428148b8a08e',
});

/**
 * Each stage's tally, appended to the file `ELEVATOR_SIM_SPLIT_OUT` names, where it names one: vitest
 * keeps a passing case's console to itself, and the figures are the half of this test a reader wants.
 */
function record(holding: Holding): void {
  const out = process.env['ELEVATOR_SIM_SPLIT_OUT'];
  if (out !== undefined && out !== '') {
    appendFileSync(
      out,
      `${summaryOf(holding)}\n${[...holding.flips, ...holding.contrastFlips].map((flip) => `  FLIP ${flip}\n`).join('')}`,
    );
  }
}

function summaryOf(holding: Holding): string {
  return (
    `${holding.stageId} at ${String(holding.units)} u: ${String(holding.moves)} two-change moves, ` +
    `${String(holding.rows)} rows, ${String(holding.printed)} printed as resolved, ` +
    `${String(holding.sameWay)} resolved the same way held back, ${String(holding.flips.length)} flipped; ` +
    `contrast ${String(holding.contrastRows)} rows, ${String(holding.contrastPrinted)} printed as resolved, ` +
    `${String(holding.contrastSameWay)} the same way held back, ${String(holding.contrastFlips.length)} flipped; ` +
    `lines ${holding.linesDigest}`
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

  it('flips no contrast row, read from the contrast’s own report on both seed sets (§ D1625, amendment 4)', () => {
    /* The waits and observation rows of every move's contrast: drive work stays out of that line. */
    expect(holding.contrastRows).toBe(holding.moves * 6);
    expect(holding.contrastPrinted).toBeGreaterThan(0);
    expect(holding.contrastFlips, summaryOf(holding)).toEqual([]);
  });

  it('leaves the split’s two existing lines byte for byte as they printed before the contrast', () => {
    expect(holding.linesDigest, summaryOf(holding)).toBe(EXISTING_LINES_SHA256['stage-1-first-call@4']);
    /* Every stage and budget the block draws on has its pin, and nothing else does. */
    const covered = Object.entries(STAGE_SPLIT_COVERAGE).flatMap(([stageId, rungs]) => rungs.map((units) => `${stageId}@${String(units)}`));
    expect(Object.keys(EXISTING_LINES_SHA256).sort()).toEqual(covered.sort());
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
    /* § D1625, amendment 4: the contrast's own rows, and a flip goes back to the panel. */
    expect(holdings.flatMap((holding) => holding.contrastFlips), holdings.map(summaryOf).join('\n')).toEqual([]);
    for (const holding of holdings) {
      expect(holding.linesDigest, summaryOf(holding)).toBe(EXISTING_LINES_SHA256[`${holding.stageId}@${String(holding.units)}`]);
    }
  }, 7_200_000);
});
