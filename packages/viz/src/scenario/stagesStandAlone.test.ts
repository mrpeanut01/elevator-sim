/**
 * **No earlier stage's whole set of ways through clears a later stage** — the criterion wave AL's
 * swarm DN wrote before stages 7 and 8 were re-authored ([§ D1235](../../../../DECISIONS.md), the
 * swarm's Q3 ruling item 2). Nothing here simulates: it reads `data/scenario-survivors.json`, which
 * `survivorSweep.test.ts` pins to the run that produced it.
 *
 * ## What the rule is, exactly
 *
 * A stage on the path stands as its own puzzle only if a player who has learned an earlier stage
 * cannot clear it by replaying **every** answer that earlier stage had. Stated over the census:
 * for every pair of stages in path order, where the earlier one's base rung names at least one way
 * through, that set of names is **not** contained in the later stage's base-rung survivor names.
 *
 * - **The base rung, and only the base rung**, because it is the only budget these ten stages are
 *   played at: `scenario/ladder.ts#SCENARIO_LADDER_COPY.baseRungNote` says nothing sells them a
 *   wider one, and the stage page plays every press there.
 * - **The whole set, not one member.** Two stages sharing a way through is not a defect: a fair
 *   default can be right twice. What the rule refuses is the case where the later stage asks
 *   nothing the earlier one had not already answered in full.
 * - **An earlier stage with no way through is skipped.** The empty set is contained in every set,
 *   so without the skip stages 4, 9 and 10, which nothing clears, would condemn every stage after
 *   them for a reason that has nothing to do with the later stage.
 * - **A name counts only where the later stage's own census cleared it.** A name the later stage
 *   did not examine, because its budget cannot afford it, is not a way through there, which is the
 *   census's own meaning of the word.
 *
 * When this was written the rule failed at exactly two pairs, both stage 2's five ways through
 * clearing stages 7 and 8 (the swarm's S2 measurement), and passed at every other pair.
 */

import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { SCENARIO_SURVIVORS_PATH } from './regenerateSurvivors.test-helper.js';
import type { PublishedSurvivorScenario, PublishedSurvivors } from './survivors.js';

let table: PublishedSurvivors;

beforeAll(async () => {
  table = JSON.parse(await readFile(SCENARIO_SURVIVORS_PATH, 'utf8')) as PublishedSurvivors;
}, 60_000);

/** The base rung's survivor names, the only rung these stages are played at. */
function baseNamesOf(scenario: PublishedSurvivorScenario): readonly string[] {
  const base = scenario.steps.find((step) => step.stepId === null);
  if (base === undefined) throw new Error(`${scenario.id} has no base rung`);
  return base.survivorNames;
}

/**
 * Every pair that breaks the rule, as a sentence naming both stages. Empty means every stage past
 * the first one that has an answer asks for something new.
 */
function stagesClearedByAnEarlierSet(scenarios: readonly PublishedSurvivorScenario[]): readonly string[] {
  const ordered = [...scenarios].sort((a, b) => a.ladderPosition - b.ladderPosition);
  const found: string[] = [];
  for (const [index, earlier] of ordered.entries()) {
    const earlierNames = baseNamesOf(earlier);
    if (earlierNames.length === 0) continue;
    for (const later of ordered.slice(index + 1)) {
      const laterNames = new Set(baseNamesOf(later));
      if (earlierNames.every((name) => laterNames.has(name))) {
        found.push(
          `${later.id} (position ${String(later.ladderPosition)}) is cleared by every one of ` +
            `${earlier.id}'s ${String(earlierNames.length)} ways through: ${earlierNames.join(', ')}`,
        );
      }
    }
  }
  return found;
}

describe('every stage past its first answer asks for something new', () => {
  it('no earlier stage’s whole set of ways through clears a later stage, at the base rung', () => {
    expect(
      stagesClearedByAnEarlierSet(table.scenarios),
      'a later stage that every answer to an earlier one already clears teaches nothing the earlier ' +
        'stage did not. Re-author the later stage against the census; do not edit the count.',
    ).toEqual([]);
  });

  it('is not vacuous: the table names ways through on more than one stage', () => {
    const answered = table.scenarios.filter((scenario) => baseNamesOf(scenario).length > 0);
    expect(answered.length).toBeGreaterThan(1);
  });

  /**
   * The negative control, on a mutation of the **real** table rather than a hand-built one: copy
   * the first answered stage's names into the last stage's survivors and the rule must fire on
   * exactly that pair. Without it a check that always returned `[]` would pass.
   */
  it('fires when a later stage is given an earlier stage’s whole set', () => {
    const ordered = [...table.scenarios].sort((a, b) => a.ladderPosition - b.ladderPosition);
    const first = ordered.find((scenario) => baseNamesOf(scenario).length > 0);
    const last = ordered[ordered.length - 1];
    if (first === undefined || last === undefined || first === last) throw new Error('no pair to mutate');
    const mutated = ordered.map((scenario) =>
      scenario.id !== last.id
        ? scenario
        : {
            ...scenario,
            steps: scenario.steps.map((step) =>
              step.stepId === null
                ? { ...step, survivorNames: [...step.survivorNames, ...baseNamesOf(first)] }
                : step,
            ),
          },
    );
    const found = stagesClearedByAnEarlierSet(mutated);
    expect(found.some((line) => line.startsWith(`${last.id} `) && line.includes(`${first.id}'s`))).toBe(true);
  });

  it('skips an earlier stage with no way through, since the empty set is in every set', () => {
    const empty = table.scenarios.filter((scenario) => baseNamesOf(scenario).length === 0);
    expect(empty.length, 'the skip is only exercised while some stage has no way through').toBeGreaterThan(0);
    for (const line of stagesClearedByAnEarlierSet(table.scenarios)) {
      for (const scenario of empty) expect(line).not.toContain(`${scenario.id}'s`);
    }
  });
});
