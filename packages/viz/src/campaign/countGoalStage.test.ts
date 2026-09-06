/**
 * **The first stage that carries a count goal, played** — `campaign.test.ts`'s fifth claim, *the bar
 * reproduces*, on the stage whose bars can reproduce.
 *
 * ## The subject is derived, and it stopped being stage 1
 *
 * This block was *"stage 1, played"* and every clause in it needed a count goal: the bar
 * reproducing, the shipped setting scoring exactly level against its own bar, and the refusal to
 * judge against a bar that does not reproduce. GitHub issue #255 took stage 1's away — with an
 * honest reporting window all five of its per-run kinds measure `50/50, 50/50`, so R12 makes every
 * one of them a fact for the briefing and `data/campaign.json` declares `beat-the-baseline` alone
 * there.
 *
 * Repointed at a **derived** stage rather than at stage 2 by name, for the campaign suite's own
 * reason: a subject written down is a subject that goes stale silently, and the three clauses below
 * would have gone on passing over an empty loop. The derivation is
 * `campaign.test-helper.ts#firstStageWithCountGoals`, which throws rather than returning
 * `undefined`, and the first case here asserts the premise as a case of its own.
 *
 * ## Why its own file — GitHub issue #356
 *
 * One batch in the hook and two more in cases, about eight seconds on a quiet four-core box. It is
 * not the cost that put it here but the shape: this was one of five `describe`s in a file that was
 * a third of the `viz` leg's serial cost, and vitest runs a file's cases in series. Each played
 * stage now carries only the batch its own cases read, and the loaded campaign they all read is
 * `campaign.test-helper.ts`'s, loaded once a file.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { briefingFor } from './brief.js';
import { useCampaignFixture, type PlayedStage } from './campaign.test-helper.js';
import type { CampaignStage } from './types.js';

const fixture = useCampaignFixture();
const { publishedFor, playStage, firstStageWithCountGoals } = fixture;

describe('a stage played — the bar reproduces and standing still clears nothing', () => {
  let stage: CampaignStage;
  let unchanged: PlayedStage;

  beforeAll(() => {
    stage = firstStageWithCountGoals();
    unchanged = playStage(stage, stage.dispatcher.startingProfileId);
  }, 300_000);

  it('has a count goal to be about — the premise, asserted rather than assumed', () => {
    /*
     * Three cases below iterate the count goals, and an empty list would make all three pass
     * without measuring anything. That is the shape this file keeps finding, so the premise is a
     * case of its own.
     */
    expect(stage.goals.filter((goal) => goal.kind !== 'beat-the-baseline').length).toBeGreaterThan(0);
  });

  it('reproduces the published bar by running the shipped setting as its own arm', () => {
    for (const goal of unchanged.verdict.goals) {
      if (goal.reproduced === null) continue;
      expect(goal.reproduced, goal.sentence).toBe(true);
    }
  });

  it('clears nothing when nothing was changed — W3’s liveness control, on a scoreboard', () => {
    /*
     * `metOnTuningSeeds` rather than `cleared`, and the difference matters here more than
     * anywhere else in this file: `cleared` is `false` on an unvalidated batch whatever the goals
     * said, so asserting it would have made this control pass without measuring anything. What is
     * being controlled is that an unchanged setting does not meet its own bars, and that is the
     * field with that meaning.
     */
    expect(unchanged.verdict.metOnTuningSeeds).toBe(false);
    expect(unchanged.verdict.cleared).toBe(false);
    const comparison = unchanged.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.met).toBe(false);
    expect(comparison?.sentence).toContain('not ordered');
  });

  it('scores every count goal exactly level against its own bar', () => {
    for (const goal of unchanged.verdict.goals) {
      if (goal.kind === 'beat-the-baseline') continue;
      expect(goal.met).toBe(true);
      expect(goal.sentence).toMatch(/passed (\d+) of 50 runs; the shipped setting passed \1 of 50/);
    }
  });

  it('R7 — the seed is on the report and replays the whole batch', () => {
    expect(unchanged.verdict.seed).toBe(stage.seeds.seed);
    const briefing = briefingFor({
      stage,
      published: publishedFor(stage),
      dimensionIds: fixture.space.ids,
      dimensionHelp: fixture.dimensionHelp,
    });
    expect(briefing.seedNote).toContain(stage.seeds.seed);
    expect(briefing.seedNote).toContain(stage.holdoutSeeds.seed);
  });

  it('R13 — every goal sentence carries the count it was computed from', () => {
    for (const goal of unchanged.verdict.goals) {
      expect(goal.sentence, goal.sentence).toMatch(/\b50\b/);
    }
    expect(unchanged.verdict.headline).toMatch(/\b50 runs\b/);
  });

  it('R2 — no sentence claims a dispatcher is better, only what happened over runs', () => {
    const texts = [
      unchanged.verdict.headline,
      ...unchanged.verdict.goals.flatMap((goal) => [goal.sentence, goal.note]),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/\bis (?:the )?better dispatcher\b/i);
      expect(text).not.toMatch(/\bbest dispatcher\b/i);
    }
    expect(unchanged.verdict.headline).toContain('not a ranking of dispatchers');
  });

  it('R11 — no energy row can decide a goal, however its interval fell', () => {
    const rows = unchanged.report.comparisons[0]?.rows ?? [];
    const axis = rows.filter((row) => row.metricClass === 'axis');
    expect(axis.length).toBeGreaterThan(0);
    for (const row of axis) expect(row.favours).toBeNull();
    for (const goal of unchanged.verdict.goals) {
      expect(goal.sentence).not.toContain('drive work');
    }
  });

  it('refuses to judge against a bar it cannot reproduce — the clause that makes "reproduced" real', () => {
    /*
     * Without this the `reproduced` assertions above could pass because nothing can ever set the
     * flag to `false`. A stage run on a seed set the table was not measured on is exactly the
     * mistake the flag exists for, so it is made here and the refusal is asserted.
     */
    const wrongSeeds: CampaignStage = {
      ...stage,
      seeds: { ...stage.seeds, seed: '424242' },
    };
    const played = playStage(wrongSeeds, wrongSeeds.dispatcher.startingProfileId);
    const counted = played.verdict.goals.filter((goal) => goal.kind !== 'beat-the-baseline');
    expect(counted.length).toBeGreaterThan(0);
    for (const goal of counted) {
      expect(goal.reproduced).toBe(false);
      expect(goal.met).toBeNull();
      expect(goal.sentence).toContain('not judged');
      expect(goal.note).toContain('a bar that does not reproduce is not a bar');
    }
    expect(played.verdict.metOnTuningSeeds).toBe(false);
    expect(played.verdict.cleared).toBe(false);
  }, 120_000);

  it('judges a changed setting, and says what moved', () => {
    const changed = playStage(stage, 'nearest-car');
    const comparison = changed.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.met === true || comparison?.met === false).toBe(true);
    expect(comparison?.sentence).toMatch(/\b50 runs\b/);
    for (const goal of changed.verdict.goals) {
      if (goal.reproduced === null) continue;
      expect(goal.reproduced).toBe(true);
    }
  });
});
