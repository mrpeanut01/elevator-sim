/**
 * **The three legible-floor-pitch constants, asserted against the document that publishes them** —
 * GitHub issue #195's third acceptance criterion.
 *
 * `docs/28-art-direction.md` § 5.5a states the size at which the stage stops being legible, and the
 * honest answer turned out to be **three numbers in three files**. A document that quotes three
 * figures nothing re-derives is `RISKS.md` R38 with three times the surface, so this file re-derives
 * each from its own source and asserts the table.
 *
 * ## Why the third row is a finding rather than a row
 *
 * `render/canvas.ts#MIN_GLYPH_PITCH_PX` (12) and `render/layout.ts#MIN_LABEL_PITCH_PX` (14) are
 * different quantities — a glyph's height and a line box — and each argues its value where it is
 * declared. They are *correctly* different.
 *
 * `everyday/stageScreenModel.ts#MIN_LABEL_PITCH_PX` (13) carries the **same name** as the second,
 * one import away, means the same thing, and answers differently. One of the two is wrong and
 * neither file knows the other exists. AD-S18 is the rule that came out of it, and the case below
 * asserts the disagreement **as it stands** rather than asserting a preferred value — because
 * picking one here would be doing in a test what § 5.5a refuses to do in prose.
 *
 * That is deliberate and is the unusual thing about this file: **it holds a defect in place.** If
 * somebody resolves the two to one number, this goes red and asks them to update the document,
 * which is exactly when it should. A guard that quietly accepted either value would let the
 * disagreement outlive the sentence describing it.
 *
 * [§ D405](../../../../DECISIONS.md) settles the bookkeeping: AD-S18 binds this document and the
 * constants it names, the document records it, and no `DECISIONS.md` entry is due. Phrased that way
 * rather than with the marker phrase itself — `documentation.test.ts`'s ratchet counts a discussion
 * of the marker as a use of it, and § D405's convention is to name it rather than utter it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { legibleFloorCount, wholeTowerIsLegible } from './stageScreenModel.js';

const sourceOf = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const numberIn = (source: string, name: string): number => {
  const found = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(source);
  expect(found, `${name} is no longer declared as a plain number literal`).not.toBeNull();
  return Number(found?.[1] ?? Number.NaN);
};

describe('§ 5.5a — the legible floor pitch, derived rather than quoted', () => {
  const brief = (): string => sourceOf('../../../../docs/28-art-direction.md');

  it('publishes each constant at the value its own file declares', () => {
    const pitches: readonly (readonly [string, string, string])[] = [
      ['render/canvas.ts#MIN_GLYPH_PITCH_PX', '../render/canvas.ts', 'MIN_GLYPH_PITCH_PX'],
      ['render/layout.ts#MIN_LABEL_PITCH_PX', '../render/layout.ts', 'MIN_LABEL_PITCH_PX'],
      [
        'everyday/stageScreenModel.ts#MIN_LABEL_PITCH_PX',
        './stageScreenModel.ts',
        'MIN_LABEL_PITCH_PX',
      ],
    ];
    const text = brief();
    for (const [row, file, name] of pitches) {
      const value = numberIn(sourceOf(file), name);
      expect(
        text,
        `docs/28 § 5.5a's row for \`${row}\` no longer states ${String(value)} px, which is what ` +
          'that file declares. The document is the thing to update, not this test.',
      ).toContain(`| \`${row}\` | **${String(value)} px** |`);
    }
  });

  it('holds the disagreement in place rather than picking a winner', () => {
    /*
     * The two that share a name. Asserted **unequal**, which is the opposite of what a guard usually
     * does — see this file's docstring. When somebody resolves them, this goes red and the document
     * has to be rewritten in the same change, which is the only moment the two can be made to agree
     * honestly.
     */
    const layout = numberIn(sourceOf('../render/layout.ts'), 'MIN_LABEL_PITCH_PX');
    const stage = numberIn(sourceOf('./stageScreenModel.ts'), 'MIN_LABEL_PITCH_PX');
    expect(
      layout,
      'the two `MIN_LABEL_PITCH_PX` constants now agree. That is good — and `docs/28` § 5.5a still ' +
        'says they disagree, AD-S18 still describes it as open, and § 8 still lists which is right ' +
        'as unsettled. Update all three and delete this case.',
    ).not.toBe(stage);
  });

  it('never reports fewer than four floors, and its stated floor of two is unreachable', () => {
    /*
     * **The behaviour-below-it half, driven rather than quoted — and driving it found something.**
     *
     * `legibleFloorCount`'s docstring says *"At least two, because a one-floor window has no pitch
     * to speak of"*, and its body is `Math.max(2, floor(plotHeightOf(h) / 13) + 1)`. That floor
     * **cannot fire**: `plotHeightOf` is `Math.max(height, 2 * PAD + 40) - 2 * PAD`, so with
     * `PAD = 14` the plot is never shorter than **40 px** whatever the box — including zero and
     * every negative — and 40 / 13 + 1 is **4**.
     *
     * So the real minimum is four, the `Math.max(2, …)` is dead, and the sentence explaining it
     * describes a state the function cannot produce. That is CLAUDE.md's standing requirement in
     * miniature: a defensive bound with no reachable input is a bound nothing has ever exercised.
     *
     * **Asserted as it stands rather than fixed**, on this file's own rule for the pitch pair
     * below: the finding belongs to whoever owns this function, and quietly changing 2 to 4 here
     * would hide it. `docs/28` § 5.5a states four.
     */
    expect(legibleFloorCount(0)).toBe(4);
    expect(legibleFloorCount(-10_000)).toBe(4);
    expect(
      legibleFloorCount(Number.NEGATIVE_INFINITY),
      'the two-floor floor is now reachable — good, and `docs/28` § 5.5a says it is not. Update it.',
    ).toBe(4);

    /* And it grows with the box, or the clamp above would be the whole function. */
    expect(legibleFloorCount(1200)).toBeGreaterThan(legibleFloorCount(400));

    const tower = Array.from({ length: 100 }, (_unused, index) => ({ index }) as never);
    expect(
      wholeTowerIsLegible(tower, 400),
      'a hundred-floor tower now fits a 400 px canvas, so the camera chips would not be offered ' +
        'and `docs/28` § 5.5a’s measured example is stale',
    ).toBe(false);
  });

  it('states the rule it derived, so the table cannot outlive its conclusion', () => {
    const text = brief();
    expect(text).toContain('AD-S18');
    expect(text).toContain('S18 one owner for the legible floor pitch');
  });
});
