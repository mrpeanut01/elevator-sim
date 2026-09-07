/**
 * **Stage 3, played** — Overwhelmed is a result, and the refusal reaches the reader.
 *
 * The stage whose demand outruns its cars on most runs, which is where three of `docs/10` § 1's
 * rules meet a real batch: R3's suppressed rows state their reason and show no number, the goal
 * that would have used the mean says the suppression happened, and § 5.3's fail states come back as
 * a frequency with its denominator — plus the diagnosis of one replayed run, by landing name, and
 * the gate that attaches a lever only where a fail state actually arose.
 *
 * ## Why its own file — GitHub issue #356
 *
 * One batch in the hook and three replayed demonstrations in cases. Split out of `campaign.test.ts`
 * with the other played stages so that no one file is a third of the `viz` leg's serial cost; the
 * loaded campaign is `campaign.test-helper.ts`'s, and the fail-state path used here is that helper's
 * `failStatesFor`, exactly as the panel runs it.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { useCampaignFixture, type PlayedStage } from './campaign.test-helper.js';
import { failStateCounts } from './failStates.js';
import type { CampaignStage } from './types.js';

const fixture = useCampaignFixture();
const { stageAt, playStage, failStatesFor } = fixture;

describe('stage 3, played — Overwhelmed is a result, and the refusal reaches the reader', () => {
  let stage: CampaignStage;
  let played: PlayedStage;

  beforeAll(() => {
    stage = stageAt(2);
    played = playStage(stage, stage.dispatcher.startingProfileId);
  }, 300_000);

  it('keeps exactly one live count goal, which is what the measurement licensed', () => {
    const counted = stage.goals.filter((goal) => goal.kind !== 'beat-the-baseline');
    expect(counted.map((goal) => goal.kind)).toEqual(['nobody-abandoned']);
  });

  it('R3 — every suppressed estimate row states its reason and shows no number', () => {
    const rows = played.report.comparisons[0]?.rows ?? [];
    const suppressed = rows.filter((row) => row.verdict === 'suppressed');
    expect(suppressed.length).toBeGreaterThan(0);
    for (const row of suppressed) {
      expect(row.estimate).toBeNull();
      expect(row.sentence).toContain('there is no');
      expect(row.note.trim()).not.toBe('');
      expect(row.sentence).not.toMatch(/\b0\.00 s\b/);
    }
  });

  it('says the suppression happened in the goal that would otherwise have used it', () => {
    const comparison = played.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.note).toContain('could not be compared at all');
  });

  it('is Overwhelmed on most of its runs, as a frequency with its denominator', () => {
    const counts = failStateCounts(played.result.arms[1]?.replications ?? []);
    const overwhelmed = counts.find((count) => count.state === 'overwhelmed');
    expect(overwhelmed?.n).toBe(50);
    expect(overwhelmed?.runs ?? 0).toBeGreaterThan(0);
  });

  it('refuses to count locked-out calls rather than reporting zero of them', () => {
    const counts = failStateCounts(played.result.arms[1]?.replications ?? []);
    const locked = counts.find((count) => count.state === 'locked-out');
    expect(locked?.runs).toBeNull();
  });

  it('diagnoses the deepest landing by name, from one replayed run', () => {
    const reports = failStatesFor(stage, played.result, stage.dispatcher.startingProfileId);
    const overwhelmed = reports.find((report) => report.state === 'overwhelmed');
    expect(overwhelmed?.occurredInDemonstration).toBe(true);
    expect(overwhelmed?.diagnosis).toMatch(/^Run 1, seed \d+: the deepest landing was \S+, with \d+ people on it \d+ s into the run/);
    expect(overwhelmed?.lever).toContain('never the answer');
  });

  it('attaches no hint to a fail state that did not arise, and does attach one where it did', () => {
    /*
     * Found by driving: a row reading *"in 50 runs, 0 ended this way"* was printing a dial to try,
     * which is furniture rather than advice. The gate is asserted in both directions here so it
     * cannot be removed silently.
     */
    const reports = failStatesFor(stage, played.result, stage.dispatcher.startingProfileId);
    const counts = failStateCounts(played.result.arms[1]?.replications ?? []);
    for (const report of reports) {
      const count = counts.find((entry) => entry.state === report.state);
      const arose = report.occurredInDemonstration || (count?.runs ?? 0) > 0;
      if (arose) expect(report.lever, report.state).not.toBe('');
      else if (stage.levers[report.state] !== null) expect(report.lever, report.state).toBe('');
    }
    expect(reports.some((report) => report.lever !== '')).toBe(true);
    expect(reports.some((report) => report.lever === '')).toBe(true);
  });

  it('suggests no credential lever on a building with no credentials', () => {
    const reports = failStatesFor(stage, played.result, stage.dispatcher.startingProfileId);
    const locked = reports.find((report) => report.state === 'locked-out');
    expect(locked?.lever).toContain('declares no access-controlled floor');
  });
});
