/**
 * What the Compare surface still prints as a slug, and whether anything explains it — issue #59.
 *
 * ## What was already closed, and what this file is about
 *
 * #58's second half renamed the goal rows' **arms**: `goalReport.ts` printed `eta:` and
 * `collective:` where the rest of the product prints *Minimum estimated wait* and *Conventional
 * collective*, and `BatchArmResult.dispatcherProfileName` closed it (§ D236). #59's remainder is the
 * other direction — *is there anything else on that screen a player cannot read?*
 *
 * Swept, and there is exactly one class of string left: the goal rows' own **labels**, which are
 * `goalLabel(spec)` and therefore `GoalKind` — `awt-under`, `everyone-can-get-there`,
 * kebab-case, seven of them. Two things follow, and they pull in opposite directions.
 *
 * ## Why the slug stays, and what has to be true for that to be honest
 *
 * It is a **key**, not a sentence. `data/scenario-goals.json` names goals by these ids, `docs/10`
 * § 10.4 quotes them, and a player comparing what the screen says with what the file declares needs
 * the two to be the same string — renaming it on the surface would break the one link a reader has
 * between a row and its definition. That is the same argument `goalReport.ts` already makes for
 * keeping `armId` and `dispatcherProfileId` on the row.
 *
 * So the honest requirement is not *no slugs*, it is **no unexplained slug**: every one of these ids
 * must reach a definition on the same screen. `mode/glossary.ts` defines all seven, `GoalReport`
 * derives its `glossary` from its own labels and sentences, and `dev/batchPanel.ts` draws that block
 * under the rows. This file is what makes that a check rather than three facts that happen to line
 * up today — an eighth `GoalKind` lands red here on the day it is added.
 *
 * `docs/16` S9: this is the **static** tier. `mountBatchPanel` needs a document and this package has
 * none, so what is asserted is that the vocabulary answers for every label the report can produce,
 * not that the nodes reach the page.
 */

import { describe, expect, it } from 'vitest';

import { glossaryFor } from '../mode/glossary.js';
import { GOAL_KINDS, goalLabel, type GoalKind } from '../scenario/goals.js';

describe('every slug the Compare surface prints reaches a definition — issue #59', () => {
  it('defines all seven goal kinds, with and without a threshold', () => {
    /*
     * Both forms, because `goalLabel` writes two: a spec with no threshold is its bare kind, and one
     * with a threshold is `kind (≤ n %)`. The second is what most rows are, and a matcher that only
     * caught the bare form would leave every real row unexplained.
     */
    for (const kind of GOAL_KINDS) {
      for (const threshold of [null, 30] as const) {
        const label = goalLabel({ kind: kind as GoalKind, threshold });
        expect(
          glossaryFor([label]),
          `the Compare surface prints "${label}" and nothing on that screen defines it`,
        ).not.toEqual([]);
      }
    }
  });

  it('is not vacuous — the sweep really can find an undefined slug', () => {
    // Without this, the assertion above would pass on a `glossaryFor` that answered everything.
    // `docs/10`'s own naming shape, for a goal that does not exist.
    expect(glossaryFor(['riders-under-the-weather (≤ 30 %)'])).toEqual([]);
  });

  it('covers every kind the tuple declares, so an eighth cannot arrive unexplained', () => {
    // The list is `GOAL_KINDS` rather than seven strings written here: the shape this repository
    // keeps finding stale is a hand-written copy of a set that grows.
    expect(GOAL_KINDS.length).toBeGreaterThanOrEqual(7);
  });
});
