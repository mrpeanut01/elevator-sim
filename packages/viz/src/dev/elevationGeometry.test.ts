/**
 * **The elevation's columns are one set of widths, and two files hold them** — `DECISIONS.md`
 * § D253, play-test issue #52.
 *
 * ## The defect under the reported one
 *
 * #52's symptom is that the SHAFTS column is unreachable at a 1440 px viewport. The cause under it
 * is that `.elevation-head` and the rows `dev/buildingEditor.ts` builds are **two sources of truth
 * for one set of column widths**: the header declared `40 / 26 / 104 / 74` inline, the `.elev-*`
 * rules declared the same four numbers again, and `buildingEditor.ts#SHAFT_LEFT_PX` is their sum
 * plus the row padding and the four gaps — `284`, written out, with a docstring that says *"if
 * either moves, both move"* and nothing that makes it so. Fixing the scroll and leaving that is
 * leaving the next drift waiting.
 *
 * Two of the three are now one: the rules and the header both name `--elev-*` in `index.html`. The
 * third cannot be, from this lane — `buildingEditor.ts`'s constants are its own and the overlay's
 * arithmetic has to be pure, because `elevationStageWidthPx` is the thing #52's first half is
 * asserted on. So the duplication that remains is **pinned rather than promised**, which is exactly
 * what `dev/tokens.test.ts` does for the colour palette one layer over: two declarations, one test,
 * and neither side can move alone.
 *
 * `index.html` is read as text for that file's own reason: there is no jsdom here
 * (`vitest.config.ts` is `environment: 'node'` for every project) and the markup is the contract.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SHAFT_LEFT_PX, elevationStageWidthPx } from './buildingEditor.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

/** A `--name: <n>px;` from the `:root` block, as a number. */
async function pixels(name: string): Promise<number> {
  const html = await indexHtml();
  const block = /:root\s*\{([\s\S]*?)\}/.exec(html);
  if (block === null) throw new Error('index.html has no :root block');
  const match = new RegExp(`^\\s*${name}\\s*:\\s*(-?[0-9.]+)px\\s*;`, 'm').exec(block[1] ?? '');
  if (match === null) throw new Error(`index.html declares no ${name}`);
  return Number.parseFloat(match[1] as string);
}

describe('the elevation grid has one set of column widths — § D253', () => {
  it('derives `SHAFT_LEFT_PX` from the page’s own columns rather than trusting the number', async () => {
    /*
     * The shaft overlay is absolutely positioned at `left: SHAFT_LEFT_PX`, so it has to start
     * exactly where the fourth column ends. The sum is the row's left padding, the four column
     * widths, and the four gaps between the five flex items:
     *
     *     pad + FLOOR + gap + SKY + gap + OCCUPIED + gap + PEOPLE + gap
     *
     * Written as that expression rather than as `284`, so a column that widens in the stylesheet
     * fails here with the arithmetic in front of the reader instead of drawing bars over PEOPLE.
     */
    const [pad, floor, sky, occ, people, gap] = await Promise.all([
      pixels('--elev-row-pad'),
      pixels('--elev-floor-w'),
      pixels('--elev-sky-w'),
      pixels('--elev-occ-w'),
      pixels('--elev-people-w'),
      pixels('--elev-col-gap'),
    ]);
    expect(SHAFT_LEFT_PX).toBe(pad + floor + gap + sky + gap + occ + gap + people + gap);
  });

  it('agrees with the page about the gap between bars and the space at the right', async () => {
    /*
     * `elevationStageWidthPx` is `SHAFT_LEFT_PX + right + n·min + (n−1)·gap`, and the two numbers
     * it is not exported with — the inter-bar gap and the right-hand inset — are read back out of
     * it by differencing rather than by importing constants that would then be asserted against
     * themselves. `right` falls out of the one-bar case, `gap` out of the step between two and
     * three, and both are compared with the stylesheet's.
     */
    const shaftGap = await pixels('--elev-shaft-gap');
    const rowPad = await pixels('--elev-row-pad');
    const minPerBar = elevationStageWidthPx(21) - elevationStageWidthPx(20);
    const oneBar = elevationStageWidthPx(20) - elevationStageWidthPx(19);
    expect(minPerBar, 'each further bar costs one bar plus one gap').toBe(oneBar);

    // Enough bars that the `STAGE_MIN_PX` floor is not the binding constraint.
    const twenty = elevationStageWidthPx(20);
    const barPlusGap = minPerBar;
    // width(n) = left + right + n·bar + (n−1)·gap = left + right − gap + n·(bar + gap)
    const leftPlusRightMinusGap = twenty - 20 * barPlusGap;
    expect(leftPlusRightMinusGap + shaftGap - SHAFT_LEFT_PX, '`.elev-shafts`’s `right`').toBe(rowPad);
    expect(barPlusGap - shaftGap, 'the narrowest a bar is drawn').toBeGreaterThan(0);
  });

  it('never asks for less than the width the stylesheet floors the grid at', async () => {
    // `--elev-stage-min` is what `.elevation-head` is given as a `min-width`; a stage narrower than
    // the header would leave the header sticking out of the grid it labels.
    const floorPx = await pixels('--elev-stage-min');
    for (const cars of [0, 1, 2, 4, 8, 35]) {
      expect(elevationStageWidthPx(cars), `${String(cars)} cars`).toBeGreaterThanOrEqual(floorPx);
    }
  });

  it('puts the header and the body in one scrolling box, and gives that box the scroll', async () => {
    /*
     * The structural half of #52's remainder, asserted on the markup because it is a fact about
     * the markup: the header used to be a **sibling** of the scroller, so it could not move with
     * it. Both are inside `.elevation-grid` now, and `.elevation-scroll` is the box with
     * `overflow-x`.
     *
     * The last assertion is the one that would have caught the shape the issue proposed:
     * `overflow-x: visible` beside `overflow-y: auto` computes to `auto`, so writing it on
     * `.elevation-body` would read as *do not scroll sideways* and mean the opposite.
     */
    const html = await indexHtml();
    const grid = /<div class="elevation-scroll">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/.exec(html);
    expect(grid, 'no `.elevation-scroll` wrapper').not.toBeNull();
    expect(grid?.[1]).toContain('class="elevation-head"');
    expect(grid?.[1]).toContain('id="elevation-body"');
    expect(html).toMatch(/\.elevation-scroll\s*\{[^}]*overflow-x:\s*auto/);
    expect(html).toMatch(/\.elevation-grid\s*\{[^}]*min-width:\s*max-content/);
    expect(html).not.toMatch(/\.elevation-body\s*\{[^}]*overflow-x/);
  });

  it('leaves no bare pixel width on the header, which is where the second copy lived', async () => {
    // The header's five spans carried `width: 40px` … `width: 74px` inline while the `.elev-*`
    // rules carried the same four numbers. Both name the tokens now, and this is what says so.
    const html = await indexHtml();
    const head = /<div class="elevation-head">([\s\S]*?)<\/div>/.exec(html);
    expect(head, 'no `.elevation-head`').not.toBeNull();
    expect(head?.[1] ?? '', 'a hard-coded width on the header').not.toMatch(/width:\s*\d/);
    for (const token of ['--elev-floor-w', '--elev-sky-w', '--elev-occ-w', '--elev-people-w']) {
      expect(head?.[1], token).toContain(`var(${token})`);
    }
  });
});
