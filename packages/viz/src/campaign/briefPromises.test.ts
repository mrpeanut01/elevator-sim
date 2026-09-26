/**
 * **A stage's brief promises only what its page and its verdict draw** — lane AL-B, the post-AK
 * panel's seat C D2 and D3.
 *
 * Seat C played stages 6, 7 and 8 and read three sentences that were not true of the screen they
 * sat on:
 *
 * - stage 8: *"it still has to earn a 25 s interval"* and *"Watch the energy figure beside the
 *   wait"*, over a verdict whose only goals are *kept up with arrivals* and *ahead of the building's
 *   own setting*, and which draws no energy figure at all;
 * - stages 6 and 7: *"See how far the dials get you"* and *"Every dimension a scenario sells is
 *   yours to move"*, over an Everyday stage page with two selects, the standing order and where idle
 *   cars wait. The dials are on the Engineer surface, one link away.
 *
 * The brief is drawn on both surfaces (`everyday/stagePlay.ts` and `dev/campaignPanel.ts`), so a
 * sentence has to be true on each. Red before the fix: all four sentences fail below.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { GOAL_NAMES } from '../scenario/goals.js';

interface RawStage {
  readonly id: string;
  readonly brief: readonly string[];
  readonly goals: readonly { readonly kind: keyof typeof GOAL_NAMES; readonly threshold: number | null }[];
}

async function stages(): Promise<readonly RawStage[]> {
  const raw = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')) as { stages: RawStage[] };
  return raw.stages;
}

describe('every campaign brief names only controls and figures its page draws', () => {
  it('names no dial as if it were on the stage page', async () => {
    const found: string[] = [];
    for (const stage of await stages()) {
      for (const sentence of stage.brief) {
        /* The Everyday stage page has no dial; a sentence may name them only where they are. */
        if (/\bdials?\b/iu.test(sentence) && !/Engineer surface/u.test(sentence)) found.push(`${stage.id}: ${sentence}`);
        if (/yours to move/iu.test(sentence)) found.push(`${stage.id}: ${sentence}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('promises no figure the verdict does not judge: no energy to watch, no interval or wait in seconds', async () => {
    const found: string[] = [];
    for (const stage of await stages()) {
      for (const sentence of stage.brief) {
        /* No goal kind is an energy goal (`scenario/goals.ts#GOAL_NAMES`), so energy may be named only as not judged. */
        if (/energy/iu.test(sentence) && !/not one of this stage/iu.test(sentence)) found.push(`${stage.id}: ${sentence}`);
        /* Every goal threshold is a percentage; a seconds target in a brief is a bar no verdict draws. */
        if (/\b\d+(?:\.\d+)? s (?:interval|wait)\b/u.test(sentence)) found.push(`${stage.id}: ${sentence}`);
      }
    }
    expect(Object.keys(GOAL_NAMES).some((kind) => /energy/iu.test(kind))).toBe(false);
    expect(found).toEqual([]);
  });

  it('names stage 8’s goals in the words its verdict uses', async () => {
    const eight = (await stages()).find((stage) => stage.id === 'stage-8-the-headline-address')!;
    const brief = eight.brief.join(' ');
    expect(eight.goals.map((goal) => goal.kind).sort()).toEqual(['answer-the-demand', 'beat-the-baseline']);
    expect(brief).toContain('keep up with arrivals');
    expect(brief).toContain('ahead of the building’s own setting');
  });
});
