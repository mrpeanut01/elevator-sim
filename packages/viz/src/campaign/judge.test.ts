/**
 * The stage headline, and the false positive § D163 clause 1's deep tier reported against it.
 *
 * The finding was `goal-without-rate` at `campaign/judge.ts#judgeStage · judge.headline`, on
 * *"The morning rush: all 3 goals reached over 50 runs."* — and the argument that it is a false
 * positive is in {@link headlineFor}'s docstring. This file is that argument's **controls**, and
 * they are here rather than in `campaign.test.ts` because two of them are about what the headline
 * may never become rather than about what it currently says.
 *
 * 1. **The `N of M` in the headline counts goals, not seeds.** Driven on a batch with **no
 *    replications at all**: the headline still reads *"0 of 2 goals reached over 0 runs"*, so the
 *    `\d+ of \d+` that `honesty/surfaces.ts` reads as a pass rate is satisfied by a batch that
 *    produced nothing to take a rate over. This is the whole case: the property does not report
 *    this string because a rate is missing on the cleared branch — it **accepts** the uncleared
 *    branch for the wrong reason.
 * 2. **The headline names no goal kind and no goal label, on either branch.** This is the guard
 *    that makes the narrowing safe. Reclassifying the seed away from `role: 'goal'` gives up the
 *    ability to see a headline rewritten to assert a per-goal outcome; nothing may rewrite it that
 *    way while this passes.
 * 3. **The rate R12 asks for is on the goal's own sentence**, measured on a stage that really
 *    clears — so the narrowing removes no coverage of the rule it is narrowing.
 *
 * Everything is driven over the shipped `data/`, through the shipped request constructor, for
 * `campaign.test.ts`'s stated reason: a suite that assembled its own would keep passing while the
 * panel drifted.
 *
 * ## Control 3, and the cleared branch of control 2, are in `judgeCleared.test.ts`
 *
 * GitHub issue #317. Both of them need a verdict that really clears, which means running the
 * shipped dispatcher library against a stage; here that was one `it()` holding a thirteen-profile
 * sweep, and it measured **78 328 ms of this file's 81 200 ms** on an idle box while every other
 * case in it finished inside 9 ms. Inside a full `--project viz` run the same case was reported at
 * **336 826 ms against the project's 300 000 ms ceiling**.
 *
 * The sibling file is one case per dispatcher, so the work vitest schedules and times out is a
 * single dispatcher rather than the library. **No control was weakened to get there** — the sweep
 * used to stop at the first profile that cleared, and every profile after it went unread, so the
 * two controls are now made over all thirteen verdicts instead of over one.
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, intervalContainsZero, pairedDifferenceEstimate } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { restrictedFloorIds } from '../access/zoning.js';
import { plural } from '../mode/disclosure.js';
import { batchReport, type BatchComparisonRow, type BatchReport } from '../batch/report.js';
import { runBatch } from '../batch/runBatch.js';
import {
  BATCH_METRICS,
  BATCH_METRIC_CLASS,
  BATCH_METRIC_PRESENTATION,
  type BatchMetric,
  type BatchResult,
} from '../batch/types.js';
import { parkedMoveOf, runStageSplit, stageSplitPlanOf } from '../everyday/stagePlay.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { GOAL_KINDS, goalLabel } from '../scenario/goals.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';

import { holdoutSentenceOf, judgeStage, stageGoalNameOf, type StageReport, type StageSplit, type StageSplitLine } from './judge.js';
import { parseCampaign, type CampaignContext } from './parse.js';
import { admitStageMove, stageUnitsAt, type StageAdmission, type StageMove } from './stagePress.js';
import {
  batchRequestForStage,
  stageReplicationSeed,
  stageSeedSetOf,
  type StageSeedSet,
} from './stageRun.js';
import type { Campaign, CampaignStage } from './types.js';

let config: LoadedConfig;
let published: PublishedGoalRates;
let campaign: Campaign;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  const space = collectSearchSpace();
  const context: CampaignContext = {
    published,
    dimensionIds: space.ids,
    profileIds: new Set(config.dispatcherProfilesById.keys()),
    restrictedFloorIdsByBuilding: new Map(
      [...config.buildingsById.values()].map((building) => [
        building.id,
        restrictedFloorIds(
          building.floors.map((floor) => floor.id),
          building.accessZones,
        ),
      ]),
    ),
    /* #365: a budget is checked against the shipped ladder, never against a fixture. */
    schedule: shippedPriceSchedule(),
  };
  campaign = parseCampaign(
    JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')),
    context,
  );
}, 120_000);

function stageAt(index: number): CampaignStage {
  const stage = campaign.stages[index];
  if (stage === undefined) throw new Error(`no stage ${String(index)}`);
  return stage;
}

function publishedFor(stage: CampaignStage): PublishedScenario {
  const entry = published.scenarios.find((candidate) => candidate.id === stage.id);
  if (entry === undefined) throw new Error(`no published entry for ${stage.id}`);
  return entry;
}

/**
 * A batch that ran, and produced nothing.
 *
 * Not a fixture standing in for a run — an *empty* result is a real state `judgeStage` handles
 * (`"this batch produced no runs to judge"`), and it is the only one in which the headline's
 * denominator and the batch's replication count are provably different numbers.
 */
function emptyResult(stage: CampaignStage): BatchResult {
  return {
    buildingId: stage.building,
    buildingName: requireBuilding(config, stage.building).name,
    seed: '0',
    durationS: stage.durationS,
    arrivalRatePctPop5min: null,
    arms: [],
    crn: { traceKey: '{}', checkedComparisons: 0, mismatches: [], aligned: true },
    elapsedMs: 0,
  };
}

/** Every kind and every label a headline could name, including the parameterised ones. */
function goalWords(): readonly string[] {
  const words = new Set<string>(GOAL_KINDS);
  for (const stage of campaign.stages) {
    for (const spec of stage.goals) words.add(goalLabel(spec));
  }
  return [...words];
}

describe('the headline is a tally of verdicts, not a goal claim', () => {
  it('counts goals rather than seeds — `0 of N goals reached over 0 runs`', () => {
    /*
     * **The stage with the most goals**, derived rather than pinned to stage 1. It was stage 1
     * and `0 of 2`; issue #255's regeneration took stage 1 down to a single goal — its four count
     * kinds all measure `50/50, 50/50` once the reporting window is honest — and a case whose
     * whole point is that the two numerals are *goals* is worth making on a stage that has more
     * than one of them.
     */
    const stage = [...campaign.stages].sort((left, right) => right.goals.length - left.goals.length)[0];
    expect(stage, 'the shipped campaign declares no stages').toBeDefined();
    if (stage === undefined) return;
    expect(stage.goals.length).toBeGreaterThan(1);
    const total = String(stage.goals.length);
    const result = emptyResult(stage);
    const report = batchReport(result);
    expect(report.replications).toBe(0);

    const verdict = judgeStage({ stage, published: publishedFor(stage), result, report });
    expect(verdict.replications).toBe(0);
    expect(verdict.headline).toContain(`0 of ${total} goals reached over 0 runs`);

    /*
     * `honesty/surfaces.ts` sets `goal.rateShown` from exactly this pattern. It matches here, on a
     * batch with no replications — so what it matched is the goal count, and a check it satisfies
     * is not a check that a pass rate was shown.
     */
    expect(/\b\d+\s*(?:of|\/)\s*\d+\b/.test(verdict.headline)).toBe(true);
    expect(verdict.goals.every((goal) => goal.met === null)).toBe(true);
  });

  /**
   * The **uncleared** half of what used to be one case — GitHub issue #317.
   *
   * The cleared half is `judgeCleared.test.ts`, one case per shipped dispatcher, and that file's
   * docstring carries the measurement that moved it: sweeping the library inside a single `it()`
   * put **78 328 ms of this file's 81 200 ms** into one unit that vitest can neither spread across
   * workers nor fail in any smaller piece, and it exceeded the project's 300 000 ms ceiling inside
   * a full `--project viz` run.
   *
   * Nothing was given up in the move. This half needs no simulation at all — an `emptyResult` and
   * a `judgeStage` call — so it stays here beside the other cases it shares its fixtures with, and
   * the assertions that needed a real clear are made over **all thirteen** dispatchers there
   * rather than over the first one that happened to clear.
   */
  it('names no goal kind and no goal label on an uncleared verdict', () => {
    const words = goalWords();
    // Both ways: a `GOAL_KINDS` that emptied would make every assertion below vacuous.
    expect(words.length).toBeGreaterThan(6);

    const notCleared = stageAt(0);
    const uncleared = judgeStage({
      stage: notCleared,
      published: publishedFor(notCleared),
      result: emptyResult(notCleared),
      report: batchReport(emptyResult(notCleared)),
    });
    expect(uncleared.cleared).toBe(false);

    for (const word of words) {
      expect(uncleared.headline.includes(word), `${word} in "${uncleared.headline}"`).toBe(false);
    }
    // R13's half of the same string: the count the tally is over is always in it.
    expect(uncleared.headline).toContain(`over ${String(uncleared.replications)} runs`);
  });
});

/* -------------------------------------------------------------------------- *
 * Every numeral in the headline is inflected — GitHub issue #295's F37
 * -------------------------------------------------------------------------- */

/**
 * The singular, which is the case that shipped wrong and the case a player meets first.
 *
 * `data/campaign.json`'s first stage carries exactly **one** goal, so `all 1 goals reached` and
 * `1 of 1 goals reached` were not corners; they were the campaign's opening verdict. The cases
 * below are driven over the **shipped** campaign and derive which stages are singular rather than
 * naming stage 1, so a stage that gains or loses a goal moves the coverage with it.
 *
 * The class is issue #134's, closed once in `shift/report.ts` and never generalised, so the guard
 * is written as a sweep over every shipped stage rather than as an assertion about one of them.
 */
describe('the headline inflects every count it prints — issue #295 F37, issue #134’s class', () => {
  it('says `1 goal` and never `1 goals` on a stage that declares one', () => {
    const singular = campaign.stages.filter((stage) => stage.goals.length === 1);
    /*
     * Non-vacuity, and it is the assertion that keeps this case honest: if the shipped campaign
     * ever stops carrying a one-goal stage this fails loudly rather than passing over nothing.
     */
    expect(singular.length, 'no shipped stage declares exactly one goal').toBeGreaterThan(0);

    for (const stage of singular) {
      const result = emptyResult(stage);
      const verdict = judgeStage({
        stage,
        published: publishedFor(stage),
        result,
        report: batchReport(result),
      });
      expect(verdict.headline, stage.id).toContain('0 of 1 goal reached');
      expect(verdict.headline, stage.id).not.toContain('1 goals');
    }
  });

  it('prints no `1 <plural>` anywhere in any shipped stage’s headline', () => {
    /*
     * Derived from `data/campaign.json` rather than from a list here, so a stage authored tomorrow
     * with one goal is covered the day it lands. The pattern is deliberately the whole shape of the
     * defect — a bare `1` followed by a word ending in `s` — rather than the two nouns this
     * headline happens to use today.
     */
    expect(campaign.stages.length).toBeGreaterThan(0);
    for (const stage of campaign.stages) {
      const result = emptyResult(stage);
      const verdict = judgeStage({
        stage,
        published: publishedFor(stage),
        result,
        report: batchReport(result),
      });
      const uninflected = /\b1 [a-z]+s\b/u.exec(verdict.headline);
      expect(uninflected?.[0], `${stage.id}: "${verdict.headline}"`).toBeUndefined();
    }
  });

  it('reaches for the shipped helper rather than a seventh private copy', () => {
    /*
     * The point of F37 is not the string; it is that a helper existed and nobody imported it. So
     * the import is asserted, and the two forms are asserted through the helper itself — a local
     * ternary would satisfy every case above and leave the eighth site to be written by hand.
     */
    expect(plural(1, 'goal', 'goals')).toBe('goal');
    expect(plural(0, 'goal', 'goals')).toBe('goals');
    expect(plural(2, 'goal', 'goals')).toBe('goals');
    const source = readFileSync(new URL('./judge.ts', import.meta.url), 'utf8');
    expect(source).toContain("from '../mode/disclosure.js'");
  });

  it('inflects the Engineer panel’s mirror of the same tally', () => {
    /*
     * `dev/campaignPanel.ts` prints the same goal count on the Engineer side, off the same
     * `verdict.goals`, so it reads `1 goals` on the same stage 1 for the same reason. It is
     * DOM-bound, there is no jsdom here, and it has no test file of its own — so this is a source
     * assertion, which is weaker than driving it and is the strongest thing available. It is here
     * rather than in a new file because the class is this describe block's subject, and a guard
     * filed away from the finding is a guard nobody reads.
     */
    const panel = readFileSync(
      new URL('../dev/campaignPanel.ts', import.meta.url),
      'utf8',
    );
    expect(panel).toContain("plural, rowClassesOf } from '../mode/disclosure.js'");
    expect(panel).toContain("plural(verdict.goals.length, 'goal', 'goals')");
    expect(panel).not.toContain('${String(verdict.goals.length)} goals');
  });
});

/* -------------------------------------------------------------------------- *
 * The judged seed set — GitHub issue #255, `docs/33` § 7 O7
 * -------------------------------------------------------------------------- */

/** Every replication seed one of a stage's two sets derives, through the shipped derivation. */
function replicationSeedsOf(stage: CampaignStage, which: StageSeedSet): readonly string[] {
  const set = stageSeedSetOf(stage, which);
  return Array.from({ length: set.replications }, (_, index) =>
    stageReplicationSeed(stage, index, which).toString(),
  );
}

describe('a stage is judged on seeds the player could not have tuned against', () => {
  /**
   * **Disjointness, derived from the two sets rather than read off two literals.**
   *
   * The master seeds differing is not the property that matters — `replicationSeed` is a hash, and
   * two master seeds that differ could in principle derive an overlapping list. What matters is
   * that no run in the judged sample is a run in the tuning sample, so that is what is taken: both
   * lists, through the same derivation the batches use, intersected.
   *
   * It is also asserted **inside** each set. A set that derived the same seed twice would be two
   * replications that are one run, which deflates every variance in the batch while looking
   * entirely normal — `experiments`' own `replicationSeeds` refuses that case for the same reason,
   * and this is the campaign-shaped version of the same question.
   */
  it('derives two disjoint samples on every shipped stage', () => {
    expect(campaign.stages.length).toBeGreaterThan(0);
    for (const stage of campaign.stages) {
      const tuning = replicationSeedsOf(stage, 'tuning');
      const holdout = replicationSeedsOf(stage, 'holdout');
      expect(tuning.length).toBe(stage.replications);
      expect(holdout.length).toBe(stage.replications);
      expect(new Set(tuning).size, `${stage.id}: a tuning seed is derived twice`).toBe(tuning.length);
      expect(new Set(holdout).size, `${stage.id}: a holdout seed is derived twice`).toBe(
        holdout.length,
      );

      const shared = new Set(tuning);
      expect(
        holdout.filter((seed) => shared.has(seed)),
        `${stage.id}: the judged sample contains runs the player tuned against`,
      ).toEqual([]);
    }
  });

  it('would notice a holdout set that is the tuning set — the guard on the guard', () => {
    /*
     * Every assertion above is an empty intersection, and an empty intersection is also what a
     * broken derivation produces. So the derivation is shown to be able to find a collision:
     * point a stage's holdout set at its own tuning seed and every one of the fifty overlaps.
     *
     * `parse.ts` already refuses this at load, on the same derived-seed comparison; this is that
     * refusal's premise checked where the judging happens.
     */
    const stage = stageAt(0);
    const collided: CampaignStage = { ...stage, holdoutSeeds: stage.seeds };
    const tuning = new Set(replicationSeedsOf(collided, 'tuning'));
    expect(replicationSeedsOf(collided, 'holdout').filter((seed) => tuning.has(seed))).toHaveLength(
      stage.replications,
    );
  });

  it('runs each batch over the set it names', () => {
    /*
     * The seam: two disjoint lists are worth nothing if both batches are built from the same one.
     * Asserted through the shipped constructor, on both sets, over every stage.
     */
    for (const stage of campaign.stages) {
      const tuning = batchRequestForStage(stage, 'collective', undefined, 'tuning');
      const holdout = batchRequestForStage(stage, 'collective', undefined, 'holdout');
      /*
       * Against the **stage's own declared fields**, not against `stageSeedSetOf` — routing both
       * sides of the assertion through the accessor would make it true of an accessor that
       * returned the tuning set for both, which is the one regression this case is for.
       */
      expect(tuning.seed).toBe(stage.seeds.seed);
      expect(holdout.seed).toBe(stage.holdoutSeeds.seed);
      expect(holdout.seed).not.toBe(tuning.seed);
      // And the two batches differ in the seed and in nothing else.
      expect({ ...holdout, seed: tuning.seed }).toEqual(tuning);
      // The default is the batch the player runs, so no caller acquired a holdout by omission.
      expect(batchRequestForStage(stage, 'collective').seed).toBe(stage.seeds.seed);
    }
  });

  it('refuses a second batch that is not the holdout set, naming both seeds', () => {
    /*
     * **The mechanism, and the reason the split is a property of the runs rather than of an
     * argument's name.** A caller that handed `judgeStage` the tuning batch twice would otherwise
     * clear a stage on the sample it was tuned against while every downstream assertion said it
     * had been validated. The seed is checked, so that call is refused with both seeds printed.
     */
    const stage = stageAt(0);
    const result = emptyResult(stage);
    const asTuning: BatchResult = { ...result, seed: stage.seeds.seed };
    const verdict = judgeStage({
      stage,
      published: publishedFor(stage),
      result,
      report: batchReport(result),
      holdout: { result: asTuning, report: batchReport(asTuning) },
    });
    expect(verdict.holdout?.held).toBe(false);
    expect(verdict.holdout?.sentence).toContain(stage.seeds.seed);
    expect(verdict.holdout?.sentence).toContain(stage.holdoutSeeds.seed);
    expect(verdict.cleared).toBe(false);

    /*
     * And a batch that *is* the holdout set is accepted as one, so the check is not refusing
     * everything: it is judged, and it fails on its goals rather than on its seed.
     */
    const asHoldout: BatchResult = { ...result, seed: stage.holdoutSeeds.seed };
    const judged = judgeStage({
      stage,
      published: publishedFor(stage),
      result,
      report: batchReport(result),
      holdout: { result: asHoldout, report: batchReport(asHoldout) },
    });
    expect(judged.holdout?.sentence).not.toContain('validates nothing');
    expect(judged.holdout?.goals.length).toBe(stage.goals.length);
  });
});

/**
 * **A campaign goal is named in plain words for what it grades** — § D1159, the post-AJ panel's
 * seats A, C and D.
 *
 * Three seats read `deliver-everyone · met` beside *"your setting passed 5 of 50 runs"*, and
 * `holdout-20260731 (seed 20260731)` on the stage verdict. Red before § D1159: the verdict's labels
 * were the `data/` kinds and the holdout sentence named its seed set, so the second and third
 * assertions below failed on every stage; and stage 3's brief said it *"cannot be won"* on a stage a
 * seat cleared and was paid for.
 */
describe('a campaign goal is named for what it grades, in plain words — § D1159', () => {
  /** A `data/` id: any goal kind, or a seed set's name. */
  const ID = new RegExp(`${GOAL_KINDS.join('|')}|holdout-\\d|tuning-\\d`);

  it('names every goal on every stage without its id, and a count goal for its relative bar', () => {
    let named = 0;
    for (const stage of campaign.stages) {
      for (const spec of stage.goals) {
        const name = stageGoalNameOf(spec);
        named += 1;
        expect(name, spec.kind).not.toMatch(ID);
        if (spec.kind !== 'beat-the-baseline') {
          expect(name, spec.kind).toContain('at least as many runs as the shipped setting');
        }
      }
    }
    expect(named).toBeGreaterThan(campaign.stages.length);
  });

  it('prints the plain names on the verdict, and names no seed set in the holdout sentence', () => {
    for (const stage of campaign.stages) {
      const result = emptyResult(stage);
      const holdout: BatchResult = { ...result, seed: stage.holdoutSeeds.seed };
      const verdict = judgeStage({
        stage,
        published: publishedFor(stage),
        result,
        report: batchReport(result),
        holdout: { result: holdout, report: batchReport(holdout) },
      });
      for (const [index, goal] of verdict.goals.entries()) {
        const spec = stage.goals[index];
        expect(spec).toBeDefined();
        if (spec === undefined) continue;
        expect(goal.label).toBe(stageGoalNameOf(spec));
        expect(goal.label, stage.id).not.toMatch(ID);
        expect(goal.sentence, stage.id).not.toMatch(ID);
      }
      const sentence = verdict.holdout?.sentence ?? '';
      expect(sentence, stage.id).not.toContain(stage.holdoutSeeds.name);
      expect(sentence, stage.id).not.toContain('(seed ');
      expect(sentence, stage.id).toContain('held-back crowds');
    }
  });

  /**
   * **A held-back verdict names the goal it missed** — the post-AN panel's seat C, D7 (wave AO lane
   * AO-5). Stage 5 with Fairness first read *"The held-back crowds do not agree: 4 of 5 goals
   * reached"* and named none, so the player could not tell which goal the held-back crowds refused.
   */
  it('names every goal the held-back crowds missed, by its plain name, and no goal they met', () => {
    /* Stage 5's five goals, the stage seat C ran: four met, the fourth missed, as its verdict read. */
    const stage = campaign.stages.find((candidate) => candidate.goals.length === 5) ?? stageAt(0);
    expect(stage.goals.length).toBe(5);
    const goals = stage.goals.map((spec, index) => ({
      kind: spec.kind,
      label: stageGoalNameOf(spec),
      met: index !== 3,
      reproduced: true,
      sentence: '',
      note: '',
    }));
    const missed = goals[3];
    expect(missed).toBeDefined();
    if (missed === undefined) return;
    const sentence = holdoutSentenceOf(goals, stage.replications);
    expect(sentence).toContain(`${String(goals.length - 1)} of ${String(goals.length)} goals reached`);
    expect(sentence).toContain(missed.label);
    for (const goal of goals.filter((entry) => entry.met)) {
      if (goal.label !== missed.label) expect(sentence).not.toContain(goal.label);
    }

    /* Two missed: both named. An unjudged goal is counted, never named as missed. */
    const two = goals.map((goal, index) => (index === 0 ? { ...goal, met: false } : goal));
    const both = holdoutSentenceOf(two, stage.replications);
    expect(both).toContain(two[0]?.label ?? '?');
    expect(both).toContain(missed.label);
    const unjudged = goals.map((goal, index) => (index === 3 ? { ...goal, met: null } : goal));
    const counted = holdoutSentenceOf(unjudged, stage.replications);
    expect(counted).not.toContain(missed.label);
    expect(counted).toContain('could not be judged there');

    /* The control: a holdout that held names nothing missed. */
    const held = holdoutSentenceOf(goals.map((goal) => ({ ...goal, met: true })), stage.replications);
    expect(held).toContain('The held-back crowds agree');
    expect(held).not.toContain('did not reach');
  });

  it('stage 3’s brief no longer says it cannot be won, and its “every run” is the published table', () => {
    const stage = campaign.stages.find((candidate) => candidate.id === 'stage-3-overwhelmed');
    expect(stage).toBeDefined();
    if (stage === undefined) return;
    const brief = stage.brief.join(' ');
    expect(brief).not.toMatch(/cannot be won|not to beat it/);
    expect(brief).toContain('on every one of the stage');
    /* The claim, pinned to the measurement: the shipped setting's queues diverge on 50 of 50 runs, both seed sets. */
    const divergence = publishedFor(stage).configurationFacts.find((record) => record.kind === 'no-divergence');
    expect(divergence?.tuning?.passes).toBe(0);
    expect(divergence?.holdout?.passes).toBe(0);
    expect(divergence?.tuning?.n).toBe(stage.replications);
  });
});

/* -------------------------------------------------------------------------- *
 * How much, read back — ruling R1 on GitHub issue #645, § D1602
 * -------------------------------------------------------------------------- */

/**
 * The presses CYCLE-1's playtest replayed on stage 1, by what they change, and one more: mid-zone
 * parking with a 30 s deadband, which `stageOneParking.test.ts` finds byte-identical on the legs to
 * the stage's own setting. It is the changed setting that ties on every crowd and every row, the one
 * amendment 4 needs a run of rather than an argument.
 */
const STAGE_ONE_PRESSES = [
  'unchanged',
  'collective-enroute',
  'lobby',
  'forecast',
  'mid-zone',
  'nearest-car',
  'mid-zone with a deadband',
] as const;
type StageOnePress = (typeof STAGE_ONE_PRESSES)[number];

/** Every row of a report's comparison is exactly zero on every pair: the two arms tied throughout. */
function everyRowIsZero(report: BatchReport): boolean {
  const rows = report.comparisons[0]?.rows ?? [];
  return rows.length > 0 && rows.every((row) => row.estimate?.min === 0 && row.estimate.max === 0);
}

/** One press, both seed sets run, judged with the holdout supplied so both sentences exist. */
interface ReadBackCase {
  readonly admission: StageAdmission;
  readonly tuning: BatchReport;
  readonly holdout: BatchReport;
  readonly verdict: StageReport;
}

/** A row's label, escaped for a pattern; longest first, so no label is read as part of another. */
const LABEL = BATCH_METRICS.map((metric) => BATCH_METRIC_PRESENTATION[metric].label)
  .sort((left, right) => right.length - left.length)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
  .join('|');
const UNIT = '(?: seconds| percentage points| kJ)?';
const FIGURE = '(\\d+(?:\\.\\d+)?)';
const SIZED = new RegExp(
  `(${LABEL}) (?:was|were) (shorter|longer|lower|higher) by between ${FIGURE} and ${FIGURE}${UNIT}`,
  'gu',
);
const CLOSE = new RegExp(
  `(${LABEL}) (?:was|were) too close to call at (\\d+) runs, between ` +
    `(?:no difference|${FIGURE}${UNIT} (shorter|lower)) and (?:no difference|${FIGURE}${UNIT} (longer|higher))`,
  'gu',
);
const SAME = new RegExp(`(${LABEL}) did not differ on any crowd`, 'gu');

function metricLabelled(label: string): BatchMetric {
  const metric = BATCH_METRICS.find((candidate) => BATCH_METRIC_PRESENTATION[candidate].label === label);
  if (metric === undefined) throw new Error(`no metric is labelled "${label}"`);
  return metric;
}

/**
 * **A printed figure read back against the bound it claims to be**, at
 * `BATCH_METRIC_PRESENTATION.places`: printed to at least the metric's places, equal to the bound
 * rounded where it is printed, widened past those places only where they would have printed a
 * non-zero bound as zero, and never zero for a bound that is not.
 */
function readBackProblems(printed: string, bound: number, metric: BatchMetric, where: string): string[] {
  const places = BATCH_METRIC_PRESENTATION[metric].places;
  const decimals = printed.split('.')[1]?.length ?? 0;
  const magnitude = Math.abs(bound);
  const problems: string[] = [];
  if (decimals < places) problems.push(`${where}: ${printed} has ${String(decimals)} places, under ${String(places)}`);
  if (magnitude !== 0 && Number(printed) === 0) problems.push(`${where}: a bound of ${String(bound)} printed as ${printed}`);
  if (Math.abs(Number(printed) - magnitude) > 0.5 * 10 ** -decimals + 1e-12) {
    problems.push(`${where}: ${printed} is not ${String(magnitude)} at ${String(decimals)} places`);
  }
  if (decimals > places && Number(magnitude.toFixed(places)) !== 0) {
    problems.push(`${where}: ${printed} widened past ${String(places)} places although they print ${magnitude.toFixed(places)}`);
  }
  return problems;
}

/**
 * Every clause of one sentence, read back against the comparison rows it claims to describe.
 *
 * `scope` is the rows the sentence may name: the orderable rows for a goal sentence, the two axis
 * rows for the energy line. A clause naming a row outside its scope is a problem, which is how
 * *energy inside a wait sentence* and *a wait inside the energy line* both fail here.
 */
function sentenceProblems(
  sentence: string,
  report: BatchReport,
  scope: 'orderable' | 'axis',
): string[] {
  const rows = report.comparisons[0]?.rows ?? [];
  const byMetric = new Map(rows.map((row) => [row.metric, row] as const));
  const inScope = (row: BatchComparisonRow): boolean =>
    scope === 'axis' ? row.metricClass === 'axis' : row.metricClass !== 'axis';
  const problems: string[] = [];
  const read = new Map<BatchMetric, number>();
  const rowOf = (label: string): BatchComparisonRow | undefined => {
    const metric = metricLabelled(label);
    read.set(metric, (read.get(metric) ?? 0) + 1);
    const row = byMetric.get(metric);
    if (row === undefined) problems.push(`"${label}" is named and the report has no such row`);
    else if (!inScope(row)) problems.push(`"${label}" is named in a sentence about the ${scope} rows`);
    return row;
  };

  for (const match of sentence.matchAll(SIZED)) {
    const [, label = '', word = '', near = '', far = ''] = match;
    const row = rowOf(label);
    const estimate = row?.estimate ?? null;
    if (row === undefined) continue;
    if (estimate === null) {
      problems.push(`${label}: sized with no interval behind it`);
      continue;
    }
    if (intervalContainsZero(estimate)) problems.push(`${label}: "${word}" over [${String(estimate.lower)}, ${String(estimate.upper)}], which contains zero`);
    if (scope === 'orderable' && row.verdict !== 'resolved') problems.push(`${label}: sized on a ${row.verdict} row`);
    const time = BATCH_METRIC_PRESENTATION[row.metric].unit.trim() === 's';
    const expected = estimate.upper < 0 ? (time ? 'shorter' : 'lower') : time ? 'longer' : 'higher';
    if (word !== expected) problems.push(`${label}: "${word}" over an interval whose words are "${expected}"`);
    const [low, high] = [Math.abs(estimate.lower), Math.abs(estimate.upper)].sort((a, b) => a - b);
    problems.push(...readBackProblems(near, low ?? Number.NaN, row.metric, `${label} near bound`));
    problems.push(...readBackProblems(far, high ?? Number.NaN, row.metric, `${label} far bound`));
  }
  for (const match of sentence.matchAll(CLOSE)) {
    const [, label = '', runs = '', from, , to] = match;
    const row = rowOf(label);
    const estimate = row?.estimate ?? null;
    if (row === undefined) continue;
    if (estimate === null) {
      problems.push(`${label}: called too close with no interval behind it`);
      continue;
    }
    if (!intervalContainsZero(estimate)) problems.push(`${label}: "too close to call" over [${String(estimate.lower)}, ${String(estimate.upper)}], which excludes zero`);
    if (Number(runs) !== report.replications) problems.push(`${label}: "at ${runs} runs" on a batch of ${String(report.replications)}`);
    if ((from === undefined) !== (estimate.lower === 0)) problems.push(`${label}: lower bound ${String(estimate.lower)} said as ${from ?? 'no difference'}`);
    if ((to === undefined) !== (estimate.upper === 0)) problems.push(`${label}: upper bound ${String(estimate.upper)} said as ${to ?? 'no difference'}`);
    if (from !== undefined) problems.push(...readBackProblems(from, estimate.lower, row.metric, `${label} lower bound`));
    if (to !== undefined) problems.push(...readBackProblems(to, estimate.upper, row.metric, `${label} upper bound`));
  }
  for (const match of sentence.matchAll(SAME)) {
    const [, label = ''] = match;
    const estimate = rowOf(label)?.estimate ?? null;
    if (estimate === null || estimate.lower !== 0 || estimate.upper !== 0) {
      problems.push(`${label}: "did not differ on any crowd" over an interval that is not zero`);
    }
  }

  /* Coverage, the figure budget (amendment 7): what must be said, and what must go unnamed. */
  for (const row of rows.filter(inScope)) {
    const times = read.get(row.metric) ?? 0;
    const said = sentence.includes(row.label);
    if (scope === 'axis' || row.metric === 'awtS') {
      if (row.estimate !== null && times !== 1) problems.push(`${row.label}: read ${String(times)} times, not once`);
    } else if (row.verdict === 'resolved') {
      if (times !== 1) problems.push(`${row.label}: resolved and read ${String(times)} times, not once`);
    } else if (said) {
      problems.push(`${row.label}: unresolved and named, where the rest go unnamed under one clause`);
    }
  }
  if (scope === 'orderable' && rows.some((row) => row.metricClass === 'axis' && sentence.includes(row.label))) {
    problems.push('an energy row is named inside the goal sentence');
  }
  return problems;
}

describe('every printed bound is the run’s own interval, on both seed sets — ruling R1, § D1602', () => {
  const cases = new Map<StageOnePress, ReadBackCase>();

  beforeAll(() => {
    const stage = stageAt(0);
    expect(stage.building, 'stage 1 still runs the sparse residential building').toBe('garden-apartments');
    const space = collectSearchSpace();
    const building = requireBuilding(config, stage.building);
    const baseline = requireDispatcher(config, stage.dispatcher.startingProfileId);
    const resources = {
      building,
      dispatcherProfiles: config.dispatcherProfiles,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
    };
    const context = { space, schedule: shippedPriceSchedule(), baseline, building, elevatorSpecs: config.elevatorSpecs };
    const collective = requireDispatcher(config, 'collective');
    const moves: Readonly<Record<StageOnePress, StageMove>> = {
      unchanged: { profile: collective },
      'collective-enroute': { profile: requireDispatcher(config, 'collective-enroute') },
      lobby: parkedMoveOf(collective, 'lobby', space),
      forecast: parkedMoveOf(collective, 'predicted-demand', space),
      'mid-zone': parkedMoveOf(collective, 'zone-center', space),
      'nearest-car': { profile: requireDispatcher(config, 'nearest-car') },
      'mid-zone with a deadband': {
        profile: collective,
        edit: {
          baseProfileId: collective.id,
          profileId: 'collective-parked-zone-center-deadband-30',
          values: { 'idle.parkingStrategy': 'zone-center', 'idle.repositionThresholdS': 30 },
        },
      },
    };
    for (const press of STAGE_ONE_PRESSES) {
      const move = moves[press];
      const admission = admitStageMove(context, move, stageUnitsAt(stage, null));
      expect(admission.admitted, `${press}: ${admission.sentence}`).toBe(true);
      const tuningResult = runBatch(batchRequestForStage(stage, move.profile.id, move.edit, 'tuning'), resources);
      const holdoutResult = runBatch(batchRequestForStage(stage, move.profile.id, move.edit, 'holdout'), resources);
      const tuning = batchReport(tuningResult);
      const holdout = batchReport(holdoutResult);
      const verdict = judgeStage({
        stage,
        published: publishedFor(stage),
        result: tuningResult,
        report: tuning,
        holdout: { result: holdoutResult, report: holdout },
        admission,
      });
      cases.set(press, { admission, tuning, holdout, verdict });
    }
  }, 240_000);

  function caseOf(press: StageOnePress): ReadBackCase {
    const found = cases.get(press);
    if (found === undefined) throw new Error(`${press} was not played`);
    return found;
  }

  /** The comparison goal on each seed set, and the batch it is about. */
  function comparisonsOf(press: StageOnePress) {
    const { verdict, tuning, holdout } = caseOf(press);
    const onTuning = verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    const onHoldout = verdict.holdout?.goals.find((goal) => goal.kind === 'beat-the-baseline');
    if (onTuning === undefined || onHoldout === undefined) throw new Error(`${press}: no comparison goal on both sets`);
    return [
      { set: 'tuning', goal: onTuning, report: tuning },
      { set: 'holdout', goal: onHoldout, report: holdout },
    ] as const;
  }

  it.each(STAGE_ONE_PRESSES)('%s: every bound in both comparison sentences reads back', (press) => {
    for (const { set, goal, report } of comparisonsOf(press)) {
      const where = `${press} on ${set}: ${goal.sentence}`;
      if (everyRowIsZero(report)) {
        /* Two arms that tied on every crowd and row: nothing to size, and no figure but the run count. */
        expect([...goal.sentence.matchAll(SIZED), ...goal.sentence.matchAll(CLOSE)], where).toEqual([]);
        expect(goal.sentence.match(/\d+(?:\.\d+)?/gu), where).toEqual(['50']);
      } else {
        expect(sentenceProblems(goal.sentence, report, 'orderable'), where).toEqual([]);
      }
      /* The closing clause is the verdict's, chosen by the same rows `met` is. */
      expect(/the bar is reached\.$/u.test(goal.sentence), where).toBe(goal.met === true);
      expect(/[Tt]he bar is not reached\.$/u.test(goal.sentence), where).toBe(goal.met === false);
    }
  });

  it.each(STAGE_ONE_PRESSES)('%s: the energy line reads back, once, and is never met or missed', (press) => {
    const { verdict, tuning } = caseOf(press);
    const energy = verdict.energy;
    expect(energy, press).not.toBeNull();
    if (energy === null) return;
    expect(sentenceProblems(energy, tuning, 'axis'), `${press}: ${energy}`).toEqual([]);
    expect(energy).toContain('the stage’s own crowds');
    expect(energy).not.toMatch(/\b(?:met|missed|better|worse|bar|wait|waits)\b/u);
    /* Never inside a wait sentence, on either seed set. */
    for (const { goal } of comparisonsOf(press)) {
      expect(goal.sentence).not.toMatch(/\bkJ\b|drive work/u);
    }
  });

  it.each(STAGE_ONE_PRESSES)('%s: each seed set’s sentence stands alone, and the held-back one prints once', (press) => {
    const { verdict } = caseOf(press);
    const [tuning, holdout] = comparisonsOf(press);
    expect(tuning.goal.sentence).toContain('on the stage’s own crowds');
    expect(holdout.goal.sentence).toContain('on the crowds kept apart from the stage’s own');
    /* Amendment 5: nothing compares the two sets, and the held-back crowds are named by where they come from. */
    const sentences = [verdict.headline, tuning.goal.sentence, verdict.holdout?.sentence ?? '', verdict.energy ?? ''];
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/shr[a-z]*nk|surviv|smaller on|tuned against|fit to fifty/u);
    }
    const held = verdict.holdout?.sentence ?? '';
    expect(held.split(holdout.goal.sentence).length - 1, held).toBe(1);
    expect(verdict.headline).not.toContain(holdout.goal.sentence);
  });

  it('says “the same run” from the admission, and only there — amendment 4', () => {
    for (const press of STAGE_ONE_PRESSES) {
      const { admission } = caseOf(press);
      for (const { set, goal } of comparisonsOf(press)) {
        expect(goal.sentence.includes('the same run'), `${press} on ${set}: ${goal.sentence}`).toBe(admission.moved.length === 0);
      }
    }
    /* The changed setting that ties on every crowd and row: a change that altered nothing, never the same run. */
    const tie = caseOf('mid-zone with a deadband');
    expect(tie.admission.moved.length).toBeGreaterThan(0);
    for (const { goal, report } of comparisonsOf('mid-zone with a deadband')) {
      expect(everyRowIsZero(report)).toBe(true);
      expect(goal.sentence).toContain('your change altered nothing measured on any run');
    }
    /* And `collective-enroute`, which ties on most crowds and not all, claims neither. */
    for (const { goal } of comparisonsOf('collective-enroute')) {
      expect(goal.sentence).not.toMatch(/same run|altered nothing/u);
      expect(goal.sentence).toContain('too close to call at 50 runs');
    }
  });

  it('moves no verdict: `met`, `held` and `cleared` are what they were before the words changed', () => {
    /*
     * The six playtest presses measured on `96f83c9`, the tree before this change, each judged
     * against a supplied holdout so `held` is defined for all of them (the shipped press skips the
     * holdout after a miss, and `stageVerdictsHold.test.ts` holds that path). The deadband press is
     * a tie on both sets, so nothing resolves ahead on either and the rule leaves it unmet.
     */
    const before: Readonly<Record<StageOnePress, readonly [boolean, boolean, boolean]>> = {
      unchanged: [false, false, false],
      'collective-enroute': [false, false, false],
      lobby: [false, false, false],
      forecast: [true, false, false],
      'mid-zone': [true, true, true],
      'nearest-car': [false, false, false],
      'mid-zone with a deadband': [false, false, false],
    };
    for (const press of STAGE_ONE_PRESSES) {
      const { verdict } = caseOf(press);
      expect([verdict.metOnTuningSeeds, verdict.holdout?.held, verdict.cleared], press).toEqual(before[press]);
    }
  });

  /**
   * The standing requirement in both directions: the words change when the run changes, and the
   * checker that holds them to the run can fail. Lobby parking and `nearest-car` printed the same
   * sentence shape with no size (finding C1); they now differ in their figures.
   */
  it('changes its words when the run changes, and the read-back refuses a size the run did not produce', () => {
    const sentences = STAGE_ONE_PRESSES.map((press) => comparisonsOf(press)[0].goal.sentence);
    expect(new Set(sentences).size).toBe(sentences.length);
    const lobby = comparisonsOf('lobby')[0];
    const nearest = comparisonsOf('nearest-car')[0];
    expect(lobby.goal.sentence).not.toBe(nearest.goal.sentence);

    /* The guard on the guard: three ways to claim what the run did not produce, each caught. */
    const forecast = comparisonsOf('forecast')[0];
    const sentence = forecast.goal.sentence;
    const wrongWay = sentence.replace('average wait was shorter', 'average wait was longer');
    const wrongBound = sentence.replace(/by between (\d+)\.(\d)/u, (_whole, units: string, tenth: string) => `by between ${units}.${String((Number(tenth) + 3) % 10)}`);
    const calledClose = comparisonsOf('mid-zone')[1].goal.sentence.replace(
      /average wait was shorter by between ([\d.]+) and ([\d.]+) seconds/u,
      'average wait was too close to call at 50 runs, between $2 seconds shorter and $1 seconds longer',
    );
    const midZoneHeld = comparisonsOf('mid-zone')[1];
    for (const [what, original, tampered, report] of [
      ['the wrong direction', sentence, wrongWay, forecast.report],
      ['a moved bound', sentence, wrongBound, forecast.report],
      ['too close to call over an interval that excludes zero', midZoneHeld.goal.sentence, calledClose, midZoneHeld.report],
    ] as const) {
      expect(sentenceProblems(original, report, 'orderable'), what).toEqual([]);
      expect(tampered, what).not.toBe(original);
      expect(sentenceProblems(tampered, report, 'orderable').length, what).toBeGreaterThan(0);
    }
  });

  /**
   * Forecast parking, the most natural first pick (finding X1), pinned whole: its words, and its
   * figures as this run produced them on `tuning-20260730` and `holdout-20260731`.
   */
  it('pins forecast parking’s verdict, the one the playtest read as a win and then a refusal', () => {
    const { verdict } = caseOf('forecast');
    expect(verdict.headline).toBe(
      'Two cars, low demand: 1 of 1 goal reached over 50 runs on the stage’s own crowds. A stage clears ' +
        'only when the held-back crowds agree as well, and they do not. That is a statement about these ' +
        'runs on these passenger populations, and not a ranking of dispatchers.',
    );
    expect(verdict.goals[0]?.sentence).toBe(
      'Over 50 runs on the stage’s own crowds, average wait was shorter by between 0.34 and 2.03 seconds, ' +
        'and 95th-percentile wait was shorter by between 0.47 and 2.38 seconds. The remaining measures were ' +
        'too close to call at 50 runs. Nothing came out against your setting, so the bar is reached.',
    );
    expect(verdict.energy).toBe(
      'Beside the verdict and never part of it: over 50 runs on the stage’s own crowds, with your settings ' +
        'drive work (proxy) was higher by between 32.4 and 63.2 kJ, and drive work per ride delivered was ' +
        'higher by between 2.780 and 4.874 kJ.',
    );
    expect(verdict.holdout?.sentence).toBe(
      'The held-back crowds do not agree: 0 of 1 goal reached. The one they did not reach: Measurably ahead ' +
        'of the shipped setting. Over 50 runs on the crowds kept apart from the stage’s own, average wait was ' +
        'too close to call at 50 runs, between 1.20 seconds shorter and 0.20 seconds longer. The other ' +
        'measures were too close to call as well. No measure separated the two settings, so the bar is not reached.',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The split, read back — ruling R10 on GitHub issue #645, § D1622
 * -------------------------------------------------------------------------- */

/**
 * The two-change presses behind the findings the split answers: X1's (`eta` with forecast parking,
 * the phone persona's attempt 10), the phone persona's attempt 4 (`eta` parked mid-zone) and the
 * curious player's attempt 11 (zoning with forecast parking).
 */
const SPLIT_PRESSES = ['eta with forecast parking', 'eta parked mid-zone', 'zoning with forecast parking'] as const;
type SplitPress = (typeof SPLIT_PRESSES)[number];

/** A bar word, or the verdict's own closing: a split line never reads as a second verdict (amendment 2). */
const BAR_WORD = /\b(?:ahead|behind|met|reached|bar|cleared)\b/iu;

/** Every problem with one split line: the read-back of every figure, and no bar word in it. */
function splitLineProblems(sentence: string, report: BatchReport, scope: 'orderable' | 'axis'): string[] {
  return [
    ...sentenceProblems(sentence, report, scope),
    ...(BAR_WORD.test(sentence) ? [`a bar word in "${sentence}"`] : []),
  ];
}

describe('every split bound is the paired-t estimate of its two named arms — ruling R10, § D1622', () => {
  const splits = new Map<SplitPress, { readonly split: StageSplit; readonly result: BatchResult }>();

  beforeAll(async () => {
    const stage = stageAt(0);
    const space = collectSearchSpace();
    const building = requireBuilding(config, stage.building);
    const baseline = requireDispatcher(config, stage.dispatcher.startingProfileId);
    const resources = {
      building,
      dispatcherProfiles: config.dispatcherProfiles,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
    };
    const context = { space, schedule: shippedPriceSchedule(), baseline, building, elevatorSpecs: config.elevatorSpecs };
    const eta = requireDispatcher(config, 'eta');
    const zoning = requireDispatcher(config, 'zoned-uppeak');
    const moves: Readonly<Record<SplitPress, StageMove>> = {
      'eta with forecast parking': parkedMoveOf(eta, 'predicted-demand', space),
      'eta parked mid-zone': parkedMoveOf(eta, 'zone-center', space),
      'zoning with forecast parking': parkedMoveOf(zoning, 'predicted-demand', space),
    };
    for (const press of SPLIT_PRESSES) {
      const move = moves[press];
      const plan = stageSplitPlanOf({ stageId: stage.id, context, move, budgetUnits: stageUnitsAt(stage, null) });
      if (plan === undefined) throw new Error(`${press} is not split`);
      const verdict = runBatch(batchRequestForStage(stage, move.profile.id, move.edit, 'tuning'), resources);
      let ran: BatchResult | undefined;
      const split = await runStageSplit({
        stage,
        plan,
        verdict,
        holdoutRan: true,
        run: (request) => (ran = runBatch(request, resources)),
      });
      if (split === undefined || ran === undefined) throw new Error(`${press}: the judge drew no split`);
      splits.set(press, { split, result: ran });
    }
  }, 240_000);

  function splitOf(press: SplitPress): { readonly split: StageSplit; readonly result: BatchResult } {
    const found = splits.get(press);
    if (found === undefined) throw new Error(`${press} was not split`);
    return found;
  }

  /** The arm a line's change is reverted on: the shipped order for the order's line, the shipped parking for the parking's. */
  function keptArmOf(result: BatchResult, line: StageSplitLine) {
    const arm = result.arms[line.change === 'standing-order' ? 1 : 2];
    if (arm === undefined) throw new Error('the split batch has no such arm');
    return arm;
  }

  it.each(SPLIT_PRESSES)('%s: every row is the paired-t estimate of the press and the arm its line names', (press) => {
    const { split, result } = splitOf(press);
    const pressArm = result.arms[0];
    expect(pressArm).toBeDefined();
    if (pressArm === undefined) return;
    for (const line of split.lines) {
      const kept = keptArmOf(result, line);
      const rows = line.report.comparisons[0]?.rows ?? [];
      expect(rows.map((row) => row.metric)).toEqual([...BATCH_METRICS]);
      for (const row of rows) {
        /* Taken here from the two arms' own figures, never from the report under test. */
        const gated = BATCH_METRIC_CLASS[row.metric] === 'estimate';
        const pairs = pressArm.replications.flatMap((mine, index) => {
          const theirs = kept.replications[index];
          const [a, b] = [mine.metrics[row.metric], theirs?.metrics[row.metric] ?? null];
          if (theirs === undefined || a === null || b === null) return [];
          return gated && !(mine.awtIsValid && theirs.awtIsValid) ? [] : [[a, b] as const];
        });
        const estimate = pairedDifferenceEstimate(pairs.map(([a]) => a), pairs.map(([, b]) => b));
        expect(row.estimate?.lower, `${press}, ${line.change}, ${row.metric}`).toBe(estimate.lower);
        expect(row.estimate?.upper, `${press}, ${line.change}, ${row.metric}`).toBe(estimate.upper);
      }
      expect(splitLineProblems(line.sentence, line.report, 'orderable'), `${press}: ${line.sentence}`).toEqual([]);
      if (line.energy !== null) {
        expect(splitLineProblems(line.energy, line.report, 'axis'), `${press}: ${line.energy}`).toEqual([]);
        /* A profile's own name may carry a wait word (*Minimum estimated wait*); the line's own words may not. */
        const names = config.dispatcherProfiles.profiles.map((profile) => profile.name).sort((a, b) => b.length - a.length);
        const ownWords = names.reduce((text, name) => text.split(name).join('·'), line.energy);
        expect(ownWords).not.toMatch(/\b(?:wait|waits|met|missed|better|worse)\b/u);
      }
      /* Energy is never inside a wait sentence (§ D106). */
      expect(line.sentence).not.toMatch(/\bkJ\b|drive work/u);
    }
  });

  it.each(SPLIT_PRESSES)('%s: each line names its change and what was kept, and says nothing a split cannot', (press) => {
    const { split, result } = splitOf(press);
    const [order, parking] = split.lines;
    const pressName = result.arms[0]?.dispatcherProfileName ?? '';
    expect(order.change).toBe('standing-order');
    expect(parking.change).toBe('parking');
    expect(order.sentence).toMatch(/^Changing the standing order to .+, with .+ parking kept: average wait /u);
    expect(parking.sentence).toMatch(/^Changing to .+ parking, with the standing order kept at .+: average wait /u);
    expect(pressName).not.toBe('');
    expect(split.heading).toBe(
      'Your two changes, each with the other kept, over 50 runs on the stage’s own crowds. The crowds kept ' +
        'apart from the stage’s own judged your two changes only together, so nothing here says which of the ' +
        'two decided their answer.',
    );
    for (const text of [split.heading, ...split.lines.flatMap((line) => [line.sentence, line.energy ?? ''])]) {
      expect(text, text).not.toMatch(BAR_WORD);
      /* Amendment 2, and the delta's own list: no "alone", no cause, no sum, no other crowds. */
      expect(text, text).not.toMatch(/on its own|\balone\b|because|thanks to|due to|add up|together they|in total|other crowds/u);
    }
    expect(split.credits).toEqual(['standing-order', 'parking']);
    expect(split.carried).toEqual(['standing-order', 'parking']);
  });

  it('pins X1’s split: the order’s own effect on average wait is too close to call, and the 95th percentile resolves', () => {
    const [order] = splitOf('eta with forecast parking').split.lines;
    expect(order.sentence).toBe(
      'Changing the standing order to Minimum estimated wait, with forecast parking kept: average wait was too ' +
        'close to call at 50 runs, between 1.24 seconds shorter and 0.09 seconds longer, and 95th-percentile wait ' +
        'was shorter by between 0.62 and 5.02 seconds. The remaining measures were too close to call as well.',
    );
  });

  it('changes its lines when the press changes, and the read-back refuses what the run did not produce', () => {
    const texts = SPLIT_PRESSES.flatMap((press) => splitOf(press).split.lines.map((line) => line.sentence));
    expect(new Set(texts).size).toBe(texts.length);

    const [order] = splitOf('eta with forecast parking').split.lines;
    const wrongBound = order.sentence.replace(/by between (\d+)\.(\d)/u, (_whole, units: string, tenth: string) => `by between ${units}.${String((Number(tenth) + 3) % 10)}`);
    const sizedOverZero = order.sentence.replace(
      /average wait was too close to call at 50 runs, between ([\d.]+) seconds shorter and ([\d.]+) seconds longer/u,
      'average wait was shorter by between $2 and $1 seconds',
    );
    const closeOverResolved = order.sentence.replace(
      /95th-percentile wait was shorter by between ([\d.]+) and ([\d.]+) seconds/u,
      '95th-percentile wait was too close to call at 50 runs, between $2 seconds shorter and $1 seconds longer',
    );
    const barWord = `${order.sentence} Nothing came out against your setting, so the bar is reached.`;
    for (const [what, tampered] of [
      ['a moved bound', wrongBound],
      ['“shorter” over an interval containing zero', sizedOverZero],
      ['“too close to call” over an interval excluding zero', closeOverResolved],
      ['a bar word', barWord],
    ] as const) {
      expect(tampered, what).not.toBe(order.sentence);
      expect(splitLineProblems(tampered, order.report, 'orderable').length, what).toBeGreaterThan(0);
    }
  });
});

describe('the read-back’s own pieces', () => {
  it('knows every row label, and no label hides inside another', () => {
    const labels = BATCH_METRICS.map((metric) => BATCH_METRIC_PRESENTATION[metric].label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(metricLabelled(label)).toBeDefined();
      for (const other of labels) if (other !== label) expect(other.includes(label), `${label} in ${other}`).toBe(false);
    }
    expect(BATCH_METRICS.filter((metric) => BATCH_METRIC_CLASS[metric] === 'axis')).toHaveLength(2);
  });
});
