/**
 * **The split of a two-change press: when it is made, what it runs, and how the card holds it**,
 * ruling R10 on GitHub issue #645, [§ D1622](../../../../DECISIONS.md).
 *
 * `campaign/judge.test.ts` reads every printed bound back against its two arms, and
 * `everyday/stageSplitHolds.test.ts` sets the held-back crowds against the stage's own. This file
 * holds the rest, on real stage-1 batches:
 *
 * - **the trigger and the arms** (amendment 1): decided from the admitted move, so `zoned-uppeak`
 *   parked mid-zone as it stands is split and zoning with cars left where they stopped is not; a
 *   one-change press and an unchanged press are not; and nothing is split off the coverage table;
 * - **the standing requirement both ways**: a real press through `pressStage` and the split through
 *   `runStageSplit`, the function `stagePlayScreen.ts#press` calls, draws the block, and a different
 *   two-change press draws different lines;
 * - **the CRN check** (amendment 5): a press arm that is not the verdict's own candidate arm on every
 *   replication and row draws nothing;
 * - **the card** (amendment 4): a pending line with no figure, a failed line, and no block over a
 *   stale verdict.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { runBatch } from '../batch/runBatch.js';
import type { BatchResult } from '../batch/types.js';
import { stageSplitOf, type StageSplit } from '../campaign/judge.js';
import { pressStage, stageUnitsAt, type StageMove } from '../campaign/stagePress.js';
import type { CampaignStage } from '../campaign/types.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { loadSurvivorFixture } from '../scenario/regenerateSurvivors.test-helper.js';
import type { PublishedGoalRates } from '../scenario/published.js';
import {
  STAGE_PLAY_COPY,
  STAGE_SPLIT_COVERAGE,
  parkedMoveOf,
  runStageSplit,
  stageFactsOf,
  stagePlayViewOf,
  stageSplitPlanOf,
  type StagePlayVerdictFacts,
} from './stagePlay.js';

let config: LoadedConfig;
let space: SearchSpace;
let stages: readonly CampaignStage[];
let published: PublishedGoalRates;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  space = collectSearchSpace();
  const fixture = await loadSurvivorFixture();
  stages = fixture.campaign.stages;
  published = JSON.parse(await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8')) as PublishedGoalRates;
}, 120_000);

function stageOne(): CampaignStage {
  const stage = stages[0];
  if (stage?.id !== 'stage-1-first-call') throw new Error('stage 1 is not first on the path');
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

function planOf(move: StageMove, budgetUnits = 4, stage = stageOne()) {
  return stageSplitPlanOf({ stageId: stage.id, context: contextOf(stage), move, budgetUnits });
}

/** The parking value an arm's edit writes, or `undefined` for a profile run as shipped. */
function parkingOf(move: StageMove): unknown {
  return move.edit?.values['idle.parkingStrategy'];
}

describe('the split is decided from the admitted move (amendment 1)', () => {
  it('splits zoned-uppeak parked mid-zone as it stands, with zoning and cars left where they stopped as its parking arm', () => {
    const zoning = requireDispatcher(config, 'zoned-uppeak');
    const plan = planOf({ profile: zoning });
    expect(plan).toBeDefined();
    if (plan === undefined) return;
    expect(plan.changed).toEqual({ standingOrder: true, parking: true });
    /* The parking arm: the press's own order, its parking reverted to the stage's own. */
    expect(plan.forParking.profile.id).toBe('zoned-uppeak');
    expect(parkingOf(plan.forParking)).toBe('stay');
    /* The order arm: the stage's own order, the press's parking kept. */
    expect(plan.forOrder.profile.id).toBe('collective');
    expect(parkingOf(plan.forOrder)).toBe('zone-center');
    expect(plan.parkingName).toBe('mid-zone parking');
    expect(plan.orderName).toBe(zoning.name);
  });

  it('does not split zoning with cars left where they stopped, a one-change press, or an unchanged one', () => {
    const zoning = requireDispatcher(config, 'zoned-uppeak');
    const collective = requireDispatcher(config, 'collective');
    const eta = requireDispatcher(config, 'eta');
    expect(planOf(parkedMoveOf(zoning, 'stay', space)), 'zoning, cars left where they stopped').toBeUndefined();
    expect(planOf({ profile: eta }), 'the order alone').toBeUndefined();
    expect(planOf(parkedMoveOf(collective, 'predicted-demand', space)), 'the parking alone').toBeUndefined();
    expect(planOf({ profile: collective }), 'unchanged').toBeUndefined();
    /* And a press the admission refuses is not split either. */
    expect(planOf({ profile: requireDispatcher(config, 'destination-panel') }), 'over budget').toBeUndefined();
  });

  it('splits only on a stage and budget the held-back test covers, and every entry is a rung the stage has', () => {
    const eta = requireDispatcher(config, 'eta');
    const press = parkedMoveOf(eta, 'predicted-demand', space);
    expect(planOf(press, 4)).toBeDefined();
    expect(planOf(press, 24)).toBeDefined();
    expect(planOf(press, 54), 'stage 1’s top rung is not in the table').toBeUndefined();
    expect(stageSplitPlanOf({ stageId: 'no-such-stage', context: contextOf(stageOne()), move: press, budgetUnits: 4 })).toBeUndefined();

    expect(Object.keys(STAGE_SPLIT_COVERAGE).sort()).toEqual(stages.map((stage) => stage.id).sort());
    for (const stage of stages) {
      const rungs = [stageUnitsAt(stage, null), ...stage.budget.steps.map((step) => stageUnitsAt(stage, step.id))];
      for (const units of STAGE_SPLIT_COVERAGE[stage.id] ?? []) expect(rungs, `${stage.id} at ${String(units)} u`).toContain(units);
      /* Every stage is covered at its base rung, where every player stands. */
      expect(STAGE_SPLIT_COVERAGE[stage.id], stage.id).toContain(stageUnitsAt(stage, null));
    }
  });
});

describe('the split runs on the press a player makes: the standing requirement, both ways', () => {
  const pressed = new Map<string, { readonly verdict: BatchResult; readonly split: StageSplit | undefined; readonly cleared: boolean }>();

  beforeAll(async () => {
    const stage = stageOne();
    const scenario = published.scenarios.find((entry) => entry.id === stage.id);
    if (scenario === undefined) throw new Error('stage 1 has no published row');
    const eta = requireDispatcher(config, 'eta');
    for (const [name, move] of [
      ['eta with forecast parking', parkedMoveOf(eta, 'predicted-demand', space)],
      ['eta parked mid-zone', parkedMoveOf(eta, 'zone-center', space)],
    ] as const) {
      const run = (request: Parameters<typeof runBatch>[0]) => runBatch(request, resourcesOf(stage));
      const press = await pressStage({ stage, published: scenario, context: contextOf(stage), move, budgetUnits: 4, run });
      if (press.kind !== 'judged') throw new Error(`${name} was refused`);
      const plan = planOf(move);
      if (plan === undefined) throw new Error(`${name} is not split`);
      const split = await runStageSplit({
        stage,
        plan,
        verdict: press.outcome.result,
        holdoutRan: press.outcome.verdict.holdout !== null,
        run,
      });
      pressed.set(name, { verdict: press.outcome.result, split, cleared: press.outcome.verdict.cleared });
    }
  }, 120_000);

  it('draws the block on a real stage-1 press, and a different two-change press draws different lines', () => {
    const forecast = pressed.get('eta with forecast parking');
    const midZone = pressed.get('eta parked mid-zone');
    expect(forecast?.split).toBeDefined();
    expect(midZone?.split).toBeDefined();
    const linesOf = (split: StageSplit | undefined) => split?.lines.map((line) => line.sentence) ?? [];
    expect(linesOf(forecast?.split)).toHaveLength(2);
    expect(linesOf(forecast?.split)).not.toEqual(linesOf(midZone?.split));
    for (const [a, b] of linesOf(forecast?.split).map((line, index) => [line, linesOf(midZone?.split)[index]] as const)) {
      expect(a).not.toBe(b);
    }
    /* Both cleared, so the held-back crowds ran and the heading says what they judged. */
    expect(forecast?.cleared).toBe(true);
    expect(forecast?.split?.heading).toContain('judged your two changes only together');
  });

  it('draws nothing where the press arm is not the verdict’s own candidate arm on every replication and row (amendment 5)', () => {
    const forecast = pressed.get('eta with forecast parking');
    const plan = planOf(parkedMoveOf(requireDispatcher(config, 'eta'), 'predicted-demand', space));
    if (forecast === undefined || plan === undefined) throw new Error('no press');
    const stage = stageOne();
    let splitBatch: BatchResult | undefined;
    void runStageSplit({
      stage,
      plan,
      verdict: forecast.verdict,
      holdoutRan: true,
      run: (request) => (splitBatch = runBatch(request, resourcesOf(stage))),
    });
    if (splitBatch === undefined) throw new Error('the split did not run');
    const input = {
      result: splitBatch,
      verdict: forecast.verdict,
      changed: plan.changed,
      orderName: plan.orderName,
      parkingName: plan.parkingName,
      holdoutRan: true,
    };
    expect(stageSplitOf(input)).toBeDefined();

    /* One row of one replication of the verdict's candidate arm moved: the two are no longer one run. */
    const candidate = forecast.verdict.arms[1];
    if (candidate === undefined) throw new Error('no candidate arm');
    const tampered: BatchResult = {
      ...forecast.verdict,
      arms: [
        forecast.verdict.arms[0] ?? candidate,
        {
          ...candidate,
          replications: candidate.replications.map((replication, index) =>
            index === 17
              ? { ...replication, metrics: { ...replication.metrics, wt95S: (replication.metrics.wt95S ?? 0) + 0.001 } }
              : replication,
          ),
        },
      ],
    };
    expect(stageSplitOf({ ...input, verdict: tampered })).toBeUndefined();
    /* The verdict of another press is not this press's either. */
    expect(stageSplitOf({ ...input, verdict: pressed.get('eta parked mid-zone')?.verdict ?? tampered })).toBeUndefined();
    /* Nor is a split whose audit failed, a split of two arms, or a press that did not change both. */
    expect(stageSplitOf({ ...input, result: { ...splitBatch, crn: { ...splitBatch.crn, aligned: false } } })).toBeUndefined();
    expect(stageSplitOf({ ...input, result: { ...splitBatch, arms: splitBatch.arms.slice(0, 2) } })).toBeUndefined();
    expect(stageSplitOf({ ...input, changed: { standingOrder: true, parking: false } })).toBeUndefined();
  });
});

describe('the card holds the split last, and never over a stale verdict (amendment 4)', () => {
  function viewWith(split: StagePlayVerdictFacts['split'], stale: boolean) {
    const stage = stageOne();
    const facts = stageFactsOf({
      stage,
      position: 1,
      total: stages.length,
      building: requireBuilding(config, stage.building),
      context: contextOf(stage),
      profiles: config.dispatcherProfiles.profiles,
      schedule: shippedPriceSchedule(),
      held: undefined,
      award: 6,
      choice: { profileId: 'eta', parking: 'predicted-demand' },
    });
    const verdict: StagePlayVerdictFacts = {
      headline: 'headline',
      goals: [],
      holdoutSentence: 'The held-back crowds agree.',
      metOnTuningSeeds: true,
      cleared: true,
      paid: undefined,
      split,
    };
    return stagePlayViewOf(facts, { kind: 'judged', verdict, stale });
  }

  it('holds the place with one line and no figure while the batch runs, and says so in one line when it fails', () => {
    const pending = viewWith({ kind: 'pending' }, false).verdict?.split;
    expect(pending).toEqual({ kind: 'pending', heading: undefined, lines: [STAGE_PLAY_COPY.splitPending] });
    expect(STAGE_PLAY_COPY.splitPending).not.toMatch(/\d/u);
    const failed = viewWith({ kind: 'failed' }, false).verdict?.split;
    expect(failed).toEqual({ kind: 'failed', heading: undefined, lines: [STAGE_PLAY_COPY.splitFailed] });
    expect(STAGE_PLAY_COPY.splitFailed).not.toMatch(/\d/u);
  });

  it('draws the heading and each change’s line with its drive work, and nothing once the verdict is stale', () => {
    const split = pressedSplit();
    const drawn = viewWith({ kind: 'drawn', split }, false).verdict?.split;
    expect(drawn?.heading).toBe(split.heading);
    expect(drawn?.lines).toEqual(split.lines.flatMap((line) => [line.sentence, ...(line.energy === null ? [] : [line.energy])]));
    for (const kind of [{ kind: 'pending' }, { kind: 'failed' }, { kind: 'drawn', split }] as const) {
      expect(viewWith(kind, true).verdict?.split, kind.kind).toBeUndefined();
    }
    expect(viewWith(undefined, false).verdict?.split).toBeUndefined();
  });

  /** A split worded over a real batch, enough for the card's own arithmetic. */
  function pressedSplit(): StageSplit {
    const stage = stageOne();
    const plan = planOf(parkedMoveOf(requireDispatcher(config, 'eta'), 'predicted-demand', space));
    if (plan === undefined) throw new Error('not split');
    const short = { ...stage, replications: 3 };
    let ran: BatchResult | undefined;
    void runStageSplit({ stage: short, plan, verdict: emptyVerdict(), holdoutRan: false, run: (request) => (ran = runBatch(request, resourcesOf(stage))) });
    if (ran === undefined) throw new Error('no split batch');
    const press = ran.arms[0];
    if (press === undefined) throw new Error('no press arm');
    const split = stageSplitOf({
      result: ran,
      verdict: { ...ran, arms: [press, press] },
      changed: plan.changed,
      orderName: plan.orderName,
      parkingName: plan.parkingName,
      holdoutRan: false,
    });
    if (split === undefined) throw new Error('the judge drew no split');
    return split;
  }

  function emptyVerdict(): BatchResult {
    return {
      buildingId: 'garden-apartments',
      buildingName: '',
      seed: '0',
      durationS: 0,
      arrivalRatePctPop5min: null,
      arms: [],
      crn: { traceKey: '{}', checkedComparisons: 0, mismatches: [], aligned: true },
      elapsedMs: 0,
    };
  }
});
