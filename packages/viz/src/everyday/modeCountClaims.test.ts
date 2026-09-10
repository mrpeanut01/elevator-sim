/**
 * **How many tiles the front door has, derived rather than transcribed** — GitHub issue #219's
 * fifth acceptance criterion, and the fourth time this count has gone stale in a document.
 *
 * `everyday/modes.ts#EVERYDAY_MODES` is the answer. GitHub issue #364 retired the *Today's tower*
 * and *Fix a building* tiles into Scenario ([§ D525](../../../../DECISIONS.md) clause 1), taking the
 * menu from four to three — and four documents went on saying **four** afterwards:
 * `README.md`, `docs/01-architecture.md`, `docs/12-design-handoff.md` and `docs/27-flow-maps.md`.
 *
 * The `docs/12` instance is the instructive one. It did not merely state a number; it stated a
 * *prediction*: that `actionBar.test.ts` would go red *"on the commit that ships three labels"*.
 * That commit landed and the suite is green, so the sentence was a forecast whose subject had
 * already happened — which is worse than a stale figure, because a reader checks a forecast by
 * waiting rather than by looking.
 *
 * ## What this file checks, and the one thing it deliberately does not
 *
 * It reads `EVERYDAY_MODES` for the count and then requires that **no document asserts a different
 * one**. It does not require any document to *state* the count — a file that never mentions the
 * menu is not wrong about it, and a guard demanding a sentence would be inventing a documentation
 * requirement nobody set.
 *
 * The pattern is bounded to *tile* and *mode tile* wordings so that a historical phrase like
 * *"the rename map from the four-tile names to the three modes"* — which is `README.md:280`
 * describing `docs/39`, and is correct — does not match. A guard that fired on an accurate
 * historical reference would be relaxed by the next person to meet it, which is how a guard stops
 * being a guard.
 *
 * [§ D405](../../../../DECISIONS.md) settles the bookkeeping: this binds the documents it names and
 * the constant it derives from, so this file is the record and no `DECISIONS.md` entry is due.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EVERYDAY_MODES } from './modes.js';

/** Documents that talk about the front door. Kept short on purpose — see the docstring. */
const CARRIERS: readonly string[] = [
  'README.md',
  'docs/01-architecture.md',
  'docs/12-design-handoff.md',
  'docs/27-flow-maps.md',
];

const WORDS: readonly string[] = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];

const repoFile = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8');

describe('the front door’s tile count — GitHub issue #219 AC5', () => {
  it('is three, and that is read off the shipped array', () => {
    // Non-vacuity: a pattern that stopped matching would make every case below assert nothing.
    expect(EVERYDAY_MODES.length).toBeGreaterThan(0);
    expect(EVERYDAY_MODES.length).toBe(3);
  });

  it('is not contradicted by any document that mentions the tiles', () => {
    const shipped = WORDS[EVERYDAY_MODES.length] ?? String(EVERYDAY_MODES.length);
    const wrong = WORDS.filter((word) => word !== shipped);

    /*
     * `<word>-tile menu`, `<word> mode tiles`, `<word> tiles are the` — the three shapes the stale
     * sites actually used, rather than every sentence containing a number and the word tile. Narrow
     * by construction: each was read off the defect.
     */
    const patterns = wrong.flatMap((word) => [
      new RegExp(`${word}-tile menu`, 'iu'),
      new RegExp(`${word} mode tiles`, 'iu'),
      new RegExp(`${word} tiles are the`, 'iu'),
      new RegExp(`All ${word} tiles open`, 'iu'),
    ]);

    /*
     * **Line-scoped, with a two-line skirt, and that is the second draft.**
     *
     * The first ran each pattern over the whole file and went red on three *correct* sites:
     * `docs/12:717` (*"The four-tile menu is § D335's"* — what the handoff specified, immediately
     * before *"What the product does … Three tiles"*), `docs/12:723` (§ D335 recorded as
     * **superseded in part**, which is the four-tile menu being retired), and `docs/27:716`
     * (a quotation of an earlier verification finding).
     *
     * All three are the count being *discussed*, not asserted — and a guard that fires on an
     * accurate historical reference is one the next person relaxes, which is this file's own stated
     * rule. So a hit is excused when a supersession or quotation marker sits on its line or within
     * two lines either side. The window is small on purpose: a wider one lets a genuine assertion
     * borrow a marker from an unrelated paragraph, which is a failure this repository has already
     * met once in a sibling guard.
     */
    const excused =
      /supersede\w*|retired|§ D335's|used to|it read|this row said|Corrected \d{4}|\*"|could not settle/iu;

    const found: string[] = [];
    for (const carrier of CARRIERS) {
      const lines = repoFile(carrier).split('\n');
      lines.forEach((line, at) => {
        const near = lines.slice(Math.max(0, at - 2), at + 3).join('\n');
        for (const pattern of patterns) {
          const hit = pattern.exec(line);
          if (hit !== null && !excused.test(near)) {
            found.push(`${carrier}:${String(at + 1)}: "${hit[0]}"`);
          }
        }
      });
    }

    expect(
      found,
      `the front door ships ${String(EVERYDAY_MODES.length)} tiles (everyday/modes.ts#EVERYDAY_MODES) ` +
        'and these sites say otherwise. The count is derived; the documents are the thing to update.',
    ).toEqual([]);
  });

  it('would catch the defect it was written for, on its own patterns', () => {
    /*
     * The positive control, run against a string rather than the tree — so it proves the patterns
     * match the real wordings without needing a document to be wrong. Each line below is one of the
     * four sites as it actually stood before this commit.
     */
    const asItWas = [
      'pinned action bar and a four-tile menu over the Engineer surface',
      'the menu whose four tiles are the four modes',
      'Main menu: heading, lede, four mode tiles, and the register',
      'All four tiles open (`UNBUILT_REASONS` is empty)',
    ].join('\n');

    const caught = [
      /four-tile menu/iu,
      /four tiles are the/iu,
      /four mode tiles/iu,
      /All four tiles open/iu,
    ].filter((pattern) => pattern.test(asItWas));

    expect(caught.length, 'the patterns no longer match the wordings they were derived from').toBe(4);
  });
});
