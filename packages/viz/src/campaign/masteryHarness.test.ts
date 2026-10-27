/**
 * **The mastery harness, held** ([§ D1601](../../../../DECISIONS.md)): the fresh seeds, the harness
 * copy, the cut-off and the eight-attempt rule as pure checks, and one attempt re-judged on stage 1
 * through the game's own press.
 *
 * ## What the real presses cost
 *
 * A stage-1 batch is fifty 900 s replications on Garden Apartments, two arms. This file runs seven:
 * mid-zone parking on fresh batch 1 (the stage's own crowds, the held-back set, batch 1), the same move
 * on batch 2 (batch 2 only, the rest served by this file's own cache of identical requests), the
 * unchanged press on batch 1 (the stage's own crowds only, since it misses there), and one press of
 * mid-zone parking straight through `pressStage` with no cache, which is the game's verdict the
 * harness's fixed press is held to. Everything else here is pure. The seven took under five seconds
 * of test time in one run on 2026-10-21, on the shared four-core container under load, so every case
 * runs under the `viz` project's own ceiling and none carries an annotation.
 *
 * Nothing below pins a figure of a run. The one premise about a run is that mid-zone parking meets
 * every bar on stage 1's own crowds, which `stageVerdictsHold.test.ts` holds as a stage verdict; if a
 * change to the engine moves it, that file goes red first, and the assertion here that names the
 * premise goes red with it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import {
  collectSearchSpace,
  masterySlopeOf,
  parseEngagementBands,
  replicationSeed,
  type MasterySlopeBands,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { runBatch } from '../batch/runBatch.js';
import { valuesFromProfile } from '../controls/editedProfile.js';
import type { BatchRequest, BatchResult } from '../batch/types.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PublishedGoalRates, PublishedSeedSet } from '../scenario/published.js';
import { loadSurvivorFixture } from '../scenario/regenerateSurvivors.test-helper.js';

import {
  MASTERY_EVIDENCE_LABEL,
  formatMasteryReport,
  freshMasterSeedOf,
  freshSeedCollisions,
  harnessStageOf,
  masteryCutOf,
  masteryReportJsonOf,
  masteryReportOf,
  masterySlopesOf,
  parseFreshSeeds,
  parseMasteryAttempts,
  planMasteryRejudge,
  rejudgeAttempt,
  type FreshSeedDeclaration,
  type MasteryAttemptRecord,
  type MasteryHarnessResources,
  type MasteryPlan,
  type RejudgedAttempt,
  type RejudgedVerdict,
} from './masteryHarness.js';
import { pressStage, stageUnitsAt } from './stagePress.js';
import type { CampaignStage } from './types.js';

const SEEDS_RAW: unknown = JSON.parse(readFileSync(join(DATA_DIR, 'mastery-seeds.json'), 'utf8'));
const BANDS_RAW: unknown = JSON.parse(readFileSync(join(DATA_DIR, 'engagement-bands.json'), 'utf8'));
const BANDS: MasterySlopeBands = parseEngagementBands(BANDS_RAW).masterySlope;
const SEEDS: FreshSeedDeclaration = parseFreshSeeds(SEEDS_RAW);
const STAGE_ONE = 'stage-1-first-call';

let config: LoadedConfig;
let space: SearchSpace;
let stages: readonly CampaignStage[];
let published: PublishedGoalRates;

/** Requests this file actually ran, and a cache of identical ones: a batch is a function of its request. */
const ran: BatchRequest[] = [];
const cache = new Map<string, BatchResult>();

function runUncached(request: BatchRequest): BatchResult {
  return runBatch(request, {
    building: requireBuilding(config, request.buildingId),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  });
}

function runCached(request: BatchRequest): BatchResult {
  const key = JSON.stringify(request);
  const known = cache.get(key);
  if (known !== undefined) return known;
  ran.push(request);
  const result = runUncached(request);
  cache.set(key, result);
  return result;
}

function resources(): MasteryHarnessResources {
  return {
    stages,
    published,
    space,
    schedule: shippedPriceSchedule(),
    profiles: config.dispatcherProfiles.profiles,
    buildings: [...config.buildingsById.values()],
    elevatorSpecs: config.elevatorSpecs,
    run: runCached,
  };
}

function stageNamed(id: string): CampaignStage {
  const stage = stages.find((entry) => entry.id === id);
  if (stage === undefined) throw new Error(`the campaign ships no stage ${id}`);
  return stage;
}

function batch(k: number): PublishedSeedSet {
  const found = SEEDS.batches[k - 1];
  if (found === undefined) throw new Error(`no fresh batch ${String(k)}`);
  return found;
}

/** An attempt record, at its defaults: stage 1, the base rung, the tree unread. */
function attempt(personaId: string, k: number, dials: Record<string, string> = {}, extra: Partial<MasteryAttemptRecord> = {}): MasteryAttemptRecord {
  return { personaId, attempt: k, stageId: STAGE_ONE, move: { profileId: 'collective', dials }, rung: null, readTreeBefore: false, ...extra };
}

const MID_ZONE = { 'idle.parkingStrategy': 'zone-center' };

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  space = collectSearchSpace();
  const fixture = await loadSurvivorFixture();
  stages = fixture.campaign.stages;
  published = fixture.published;
});

describe('the fresh seeds are declared before the playtest, from a named stream (§ D1601 clause 3)', () => {
  it('re-derives every seed from its root and stream, with headroom over the eight attempts at fifty runs each', () => {
    expect(SEEDS.stream).toBe('mastery-c3');
    expect(SEEDS.batches.length).toBeGreaterThanOrEqual(12);
    expect(SEEDS.batches.length).toBeGreaterThan(BANDS.attempts);
    SEEDS.batches.forEach((one, index) => {
      expect(one.name).toBe(`mastery-c3-${String(index + 1).padStart(2, '0')}`);
      expect(one.seed).toBe(freshMasterSeedOf(SEEDS.root, SEEDS.stream, index + 1));
      expect(one.replications).toBe(50);
    });
    expect(new Set(SEEDS.batches.map((one) => one.seed)).size).toBe(SEEDS.batches.length);
  });

  it('refuses a seed typed rather than derived, a misnamed batch and a batch of another size', () => {
    const raw = SEEDS_RAW as { batches: { name: string; seed: string; replications: number }[] };
    const tamper = (index: number, change: Partial<{ name: string; seed: string; replications: number }>): unknown => ({
      ...raw,
      batches: raw.batches.map((row, at) => (at === index ? { ...row, ...change } : row)),
    });
    expect(() => parseFreshSeeds(tamper(2, { seed: '20261023' }))).toThrow(/derived, never typed/);
    expect(() => parseFreshSeeds(tamper(2, { name: 'mastery-c3-3' }))).toThrow(/is named/);
    expect(() => parseFreshSeeds(tamper(2, { replications: 49 }))).toThrow(/replications/);
    expect(() => parseFreshSeeds({ ...raw, extra: true })).toThrow(/refuses rather than ignores/);
  });

  it('collides with no batch an earlier cycle declared: cycle 2 judged its attempts on mastery-c2, and those verdicts have been seen (§ D1624)', () => {
    const earlier = Array.from({ length: 12 }, (_, index) => ({
      name: `mastery-c2-${String(index + 1).padStart(2, '0')}`,
      seed: freshMasterSeedOf('20261021', 'mastery-c2', index + 1),
      replications: 50,
    }));
    /* Non-vacuity: the derivation reproduces cycle 2's first batch as § D1621 recorded it. */
    expect(earlier[0]?.seed).toBe('1145347316356468505');
    expect(freshSeedCollisions(SEEDS, earlier)).toEqual([]);
  });

  it('collides with no seed set any shipped stage declares, on master seeds or on replication seeds', () => {
    const sets = stages.flatMap((stage) => [stage.seeds, stage.holdoutSeeds]);
    /* Non-vacuity: stage 1's two sets are among them, and every replication seed is looked at. */
    expect(sets.map((set) => set.name)).toEqual(expect.arrayContaining(['tuning-20260730', 'holdout-20260731']));
    expect(freshSeedCollisions(SEEDS, sets)).toEqual([]);
  });

  it('positive control: a batch on the held-back master collides on the master and on all fifty replication seeds', () => {
    const clash: FreshSeedDeclaration = { ...SEEDS, batches: [...SEEDS.batches, { name: 'probe', seed: '20260731', replications: 50 }] };
    const found = freshSeedCollisions(clash, [stageNamed(STAGE_ONE).seeds, stageNamed(STAGE_ONE).holdoutSeeds]);
    expect(found.filter((line) => line.includes('master seed of holdout-20260731'))).toHaveLength(1);
    expect(found.filter((line) => line.startsWith('replication seed '))).toHaveLength(50);
  });

  it('positive control: a fresh master equal to a stage replication seed is caught', () => {
    const seed = replicationSeed('20260730', 5).toString();
    const clash: FreshSeedDeclaration = { ...SEEDS, batches: [{ name: 'probe', seed, replications: 50 }] };
    const found = freshSeedCollisions(clash, [stageNamed(STAGE_ONE).seeds]);
    expect(found).toEqual([`fresh batch probe's master seed ${seed} is a replication seed of tuning-20260730.`]);
  });
});

describe('the harness copy differs from the shipped record in holdoutSeeds alone', () => {
  it('keeps every other field by identity, swaps the held-back set, and leaves the shipped record unchanged', () => {
    const stage = stageNamed(STAGE_ONE);
    const before = structuredClone(stage);
    const copy = harnessStageOf(stage, batch(1));
    expect(Object.keys(copy)).toEqual(Object.keys(stage));
    for (const key of Object.keys(stage) as (keyof CampaignStage)[]) {
      if (key === 'holdoutSeeds') continue;
      expect(copy[key], key).toBe(stage[key]);
    }
    expect(copy.holdoutSeeds).toEqual(batch(1));
    expect(copy.holdoutSeeds).not.toEqual(stage.holdoutSeeds);
    expect(stage).toEqual(before);
  });

  it('refuses a batch of another size, and either of the stage’s own sets', () => {
    const stage = stageNamed(STAGE_ONE);
    expect(() => harnessStageOf(stage, { ...batch(1), replications: 49 })).toThrow(/judges over 50/);
    expect(() => harnessStageOf(stage, stage.seeds)).toThrow(/not disjoint/);
    expect(() => harnessStageOf(stage, stage.holdoutSeeds)).toThrow(/not disjoint/);
  });

  it('refuses a stage with a count goal until its bars are measured on the fresh set (clause 4)', () => {
    expect(() =>
      planMasteryRejudge({
        attempts: { attempts: [{ ...attempt('probe', 1), stageId: 'stage-2-morning-rush' }] },
        seeds: SEEDS_RAW,
        bands: BANDS_RAW,
        resources: resources(),
      }),
    ).toThrow(/clause 4/);
  });
});

/** A verdict as the series reads it, with no run behind it: only `cleared` and the set matter there. */
function verdict(cleared: boolean, seedSet: PublishedSeedSet): RejudgedVerdict {
  return { seedSet, admitted: true, metOnTuningSeeds: cleared, holdoutRan: cleared, held: cleared, cleared, report: null };
}

describe('the attempt file, the cut-off and the eight-attempt rule', () => {
  it('refuses an unknown key, a gap, a repeat, and a tree read undone', () => {
    const file = (rows: readonly unknown[]): unknown => ({ attempts: rows });
    expect(() => parseMasteryAttempts(file([{ ...attempt('a', 1), mood: 'calm' }]))).toThrow(/"mood"/);
    expect(() => parseMasteryAttempts(file([attempt('a', 1), attempt('a', 3)]))).toThrow(/without a gap/);
    expect(() => parseMasteryAttempts(file([attempt('a', 1), attempt('a', 1)]))).toThrow(/without a gap/);
    expect(() =>
      parseMasteryAttempts(file([attempt('a', 1), attempt('a', 2, {}, { readTreeBefore: true }), attempt('a', 3)])),
    ).toThrow(/was not read after/);
    /* Two personas' series are separate, and the order in the file does not matter. */
    expect(parseMasteryAttempts(file([attempt('b', 2), attempt('a', 1), attempt('b', 1)]))).toHaveLength(3);
  });

  it('refuses, before anything runs, a rung the stage does not sell, a profile not shipped and a dial not declared', () => {
    const plan = (row: MasteryAttemptRecord): MasteryPlan =>
      planMasteryRejudge({ attempts: { attempts: [row] }, seeds: SEEDS_RAW, bands: BANDS_RAW, resources: resources() });
    expect(() => plan(attempt('a', 1, {}, { rung: 'no-such-rung' }))).toThrow(/does not sell/);
    expect(() => plan({ ...attempt('a', 1), move: { profileId: 'no-such-profile', dials: {} } })).toThrow(/does not ship/);
    expect(() => plan(attempt('a', 1, { 'no.such.dial': 'x' }))).toThrow(/does not declare/);
    expect(plan(attempt('a', 1, {}, { rung: 'equipment-rung' })).series[0]?.tasks[0]?.budgetUnits).toBe(
      stageUnitsAt(stageNamed(STAGE_ONE), 'equipment-rung'),
    );
  });

  it('makes each move the way the surface that offers it does', () => {
    const plan = (dials: Record<string, string | number>): MasteryPlan =>
      planMasteryRejudge({
        attempts: { attempts: [{ ...attempt('a', 1), move: { profileId: 'collective', dials } }] },
        seeds: SEEDS_RAW,
        bands: BANDS_RAW,
        resources: resources(),
      });
    const standing = String(valuesFromProfile(space, requireDispatcher(config, 'collective')).get('idle.parkingStrategy'));
    /* A dial at the profile's own value is dropped, as the stage page drops it. */
    const same = plan({ 'idle.parkingStrategy': standing }).series[0]?.tasks[0];
    expect(same?.moveName).toBe('collective');
    expect(same?.move.edit).toBeUndefined();
    /* A dial the page offers is the page's own move, under the name the census publishes. */
    const parked = plan(MID_ZONE).series[0]?.tasks[0];
    expect(parked?.moveName).toBe('collective-parked-zone-center');
    expect(parked?.move.edit?.values).toEqual(MID_ZONE);
    /* Anything else is an edit as the Engineer Lab makes one. */
    const edited = plan({ 'weights.loadFactor': 2.25 }).series[0]?.tasks[0];
    expect(edited?.moveName).toBe('collective-edited');
    expect(edited?.move.edit).toEqual({ baseProfileId: 'collective', profileId: 'collective-edited', values: { 'weights.loadFactor': 2.25 } });
  });

  it('cuts the series at the first attempt made after the tree was read, and that attempt with it', () => {
    const series = Array.from({ length: 10 }, (_, index) => attempt('a', index + 1, {}, { readTreeBefore: index + 1 >= 9 }));
    const cut = masteryCutOf(series);
    expect(cut.kept.map((one) => one.attempt)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cut.cut.map((one) => one.attempt)).toEqual([9, 10]);
    expect(cut.fromAttempt).toBe(9);
    expect(masteryCutOf(series.slice(0, 8))).toEqual({ kept: series.slice(0, 8), cut: [], fromAttempt: null });
  });

  it('plans only the kept attempts, presses nothing, and asks for a batch only where an attempt is kept', () => {
    const before = ran.length;
    const rows = Array.from({ length: 13 }, (_, index) => attempt('a', index + 1, MID_ZONE, { readTreeBefore: index + 1 >= 3 }));
    const plan = planMasteryRejudge({ attempts: { attempts: rows }, seeds: SEEDS_RAW, bands: BANDS_RAW, resources: resources() });
    expect(plan.series).toHaveLength(1);
    expect(plan.series[0]?.tasks.map((task) => task.batch.name)).toEqual(['mastery-c3-01', 'mastery-c3-02']);
    expect(plan.series[0]?.cut.cut).toHaveLength(11);
    expect(plan.series[0]?.tasks[0]?.moveName).toBe('collective-parked-zone-center');
    expect(ran.length).toBe(before);
    /* One kept attempt more than the declaration holds needs a batch it does not have. */
    const all = Array.from({ length: SEEDS.batches.length + 1 }, (_, index) => attempt('a', index + 1, MID_ZONE, { readTreeBefore: false }));
    expect(() => planMasteryRejudge({ attempts: { attempts: all }, seeds: SEEDS_RAW, bands: BANDS_RAW, resources: resources() })).toThrow(
      /declare more/,
    );
  });

  it('publishes no slope below the bands file’s eight attempts, by masterySlopeOf’s own rule, and one at eight', () => {
    const pairs = (count: number): Pick<RejudgedAttempt, 'fixed' | 'fresh'>[] =>
      Array.from({ length: count }, (_, index) => ({
        fixed: verdict(index >= count / 2, stageNamed(STAGE_ONE).holdoutSeeds),
        fresh: verdict(index % 2 === 0, batch(index + 1)),
      }));
    const seven = masterySlopesOf(pairs(7), BANDS);
    const expected = masterySlopeOf(
      pairs(7).map((one) => ({ pass: one.fixed.cleared, seedSet: { role: 'holdout' as const, name: one.fixed.seedSet.name } })),
      BANDS,
    );
    expect(seven.fixed).toEqual(expected);
    expect(seven.fixed.verdict).toBe('suppressed');
    expect(seven.fresh.verdict).toBe('suppressed');
    expect(seven.paired.verdict).toBe('suppressed');
    const eight = masterySlopesOf(pairs(8), BANDS);
    expect(eight.fixed.verdict).not.toBe('suppressed');
    expect(eight.fresh.verdict).not.toBe('suppressed');
    expect(eight.paired.verdict).not.toBe('suppressed');
    /* The fresh series is judged on a set of its own at every attempt; the fixed one never is. */
    expect(eight.fresh.seedSetsDisjoint).toBe(true);
    expect(eight.fixed.seedSetsDisjoint).toBe(false);
  });
});

describe('one attempt, re-judged on stage 1 through the game’s own press', () => {
  let plan: MasteryPlan;
  let midZoneOne: RejudgedAttempt;
  let midZoneTwo: RejudgedAttempt;
  let unchanged: RejudgedAttempt;
  let shippedBefore: CampaignStage;

  beforeAll(async () => {
    shippedBefore = structuredClone(stageNamed(STAGE_ONE));
    plan = planMasteryRejudge({
      attempts: { attempts: [attempt('parks-mid-zone', 1, MID_ZONE), attempt('parks-mid-zone', 2, MID_ZONE), attempt('changes-nothing', 1)] },
      seeds: SEEDS_RAW,
      bands: BANDS_RAW,
      resources: resources(),
    });
    const done: RejudgedAttempt[] = [];
    for (const task of plan.series.flatMap((series) => series.tasks)) done.push(await rejudgeAttempt(task, resources()));
    const [first, second, third] = done;
    if (first === undefined || second === undefined || third === undefined) throw new Error('the plan held fewer than three attempts');
    [midZoneOne, midZoneTwo, unchanged] = [first, second, third];
  });

  it('the fixed verdict is the game’s: pressStage on the shipped record, run with no cache, returns the same report', async () => {
    const stage = stageNamed(STAGE_ONE);
    const scenario = published.scenarios.find((entry) => entry.id === STAGE_ONE);
    if (scenario === undefined) throw new Error('stage 1 has no published goal row');
    const game = await pressStage({
      stage,
      published: scenario,
      context: {
        space,
        schedule: shippedPriceSchedule(),
        baseline: requireDispatcher(config, stage.dispatcher.startingProfileId),
        building: requireBuilding(config, stage.building),
        elevatorSpecs: config.elevatorSpecs,
      },
      move: midZoneOne.task.move,
      budgetUnits: stageUnitsAt(stage, null),
      run: runUncached,
    });
    if (game.kind !== 'judged') throw new Error(`mid-zone parking was refused: ${game.admission.sentence}`);
    expect(midZoneOne.fixed.report).toEqual(game.outcome.verdict);
    expect(midZoneOne.fixed.cleared).toBe(game.outcome.verdict.cleared);
    expect(midZoneOne.fixed.seedSet).toBe(stage.holdoutSeeds);
  });

  it('the fresh verdict’s held-back half was judged on fresh batch 1, and came back judged', () => {
    expect(midZoneOne.fixed.metOnTuningSeeds, 'mid-zone parking meets stage 1 on its own crowds (stageVerdictsHold.test.ts)').toBe(true);
    const holdout = midZoneOne.fresh.report?.holdout;
    expect(holdout?.seed).toBe(batch(1).seed);
    expect(holdout?.seedSetName).toBe('mastery-c3-01');
    expect(holdout?.goals.length).toBeGreaterThan(0);
    expect(typeof midZoneOne.fresh.held).toBe('boolean');
    const fresh = midZoneOne.batches.find((one) => one.press === 'fresh' && one.seedSet === 'holdout');
    expect(fresh?.seed).toBe(batch(1).seed);
    expect(fresh?.result.arms[1]?.replications.map((one) => one.seed)).toEqual(
      Array.from({ length: 50 }, (_, index) => replicationSeed(batch(1).seed, index).toString()),
    );
    /* The two held-back batches differ in their seed and in nothing the request decides. */
    const fixed = midZoneOne.batches.find((one) => one.press === 'fixed' && one.seedSet === 'holdout');
    const shape = (result: BatchResult | undefined): unknown => {
      if (result === undefined) return undefined;
      const { seed: _seed, arms, crn: _crn, elapsedMs: _elapsed, ...rest } = result;
      return { ...rest, arms: arms.map((arm) => [arm.armId, arm.dispatcherProfileId, arm.dispatcherProfileName, arm.replications.length]) };
    };
    expect(shape(fresh?.result)).toEqual(shape(fixed?.result));
    expect(fresh?.result.seed).not.toBe(fixed?.result.seed);
  });

  it('the two presses share one tuning batch, asked for identically, and each runs its own held-back batch', () => {
    expect(midZoneOne.batches.map((one) => [one.press, one.seedSet, one.shared])).toEqual([
      ['fixed', 'tuning', false],
      ['fixed', 'holdout', false],
      ['fresh', 'tuning', true],
      ['fresh', 'holdout', false],
    ]);
    expect(midZoneOne.batches[2]?.result).toBe(midZoneOne.batches[0]?.result);
    expect(midZoneOne.batches[1]?.seed).toBe('20260731');
  });

  it('leaves the shipped stage record unchanged', () => {
    expect(stageNamed(STAGE_ONE)).toEqual(shippedBefore);
  });

  it('a different batch changes the held-back runs for the same move, and not the game’s verdict', () => {
    const heldBack = (one: RejudgedAttempt): BatchResult | undefined =>
      one.batches.find((entry) => entry.press === 'fresh' && entry.seedSet === 'holdout')?.result;
    const first = heldBack(midZoneOne);
    const second = heldBack(midZoneTwo);
    expect(second?.seed).toBe(batch(2).seed);
    const seedsOf = (result: BatchResult | undefined): readonly string[] => result?.arms[0]?.replications.map((one) => one.seed) ?? [];
    expect(seedsOf(first).filter((seed) => seedsOf(second).includes(seed))).toEqual([]);
    /* Every figure of every replication, drive work among them, so a crowd that changed shows. */
    const figuresOf = (result: BatchResult | undefined): readonly unknown[] => result?.arms[0]?.replications.map((one) => one.metrics) ?? [];
    expect(figuresOf(first)).toHaveLength(50);
    expect(figuresOf(second)).not.toEqual(figuresOf(first));
    expect(midZoneTwo.fixed.report).toEqual(midZoneOne.fixed.report);
  });

  it('a different move changes the re-judged verdict and its figures on the same batch', () => {
    expect(unchanged.task.batch).toBe(midZoneOne.task.batch);
    expect(unchanged.fresh.report).not.toEqual(midZoneOne.fresh.report);
    const candidateFigures = (one: RejudgedAttempt): readonly unknown[] =>
      one.batches[0]?.result.arms[1]?.replications.map((entry) => entry.metrics) ?? [];
    expect(candidateFigures(midZoneOne)).toHaveLength(50);
    expect(candidateFigures(unchanged)).not.toEqual(candidateFigures(midZoneOne));
  });

  it('a move that misses on the stage’s own crowds reads not cleared in both series, with no held-back run', () => {
    for (const one of [unchanged.fixed, unchanged.fresh]) {
      expect(one.metOnTuningSeeds).toBe(false);
      expect(one.holdoutRan).toBe(false);
      expect(one.held).toBeNull();
      expect(one.cleared).toBe(false);
    }
    expect(unchanged.batches.map((one) => [one.press, one.seedSet])).toEqual([
      ['fixed', 'tuning'],
      ['fresh', 'tuning'],
    ]);
  });

  it('carries the agent-evidence label on the report, its file and its table', () => {
    const report = masteryReportOf(plan, [midZoneOne, midZoneTwo, unchanged]);
    expect(report.label).toBe(MASTERY_EVIDENCE_LABEL);
    expect(MASTERY_EVIDENCE_LABEL).toContain('agent evidence, docs/23 § 1.5');
    expect(masteryReportJsonOf(report)['label']).toBe(MASTERY_EVIDENCE_LABEL);
    expect(formatMasteryReport(report)).toContain(MASTERY_EVIDENCE_LABEL);
    /* Two attempts and one are each fewer than eight, so no series publishes a slope. */
    for (const series of report.series) expect(series.slopes.paired.verdict).toBe('suppressed');
  });
});
