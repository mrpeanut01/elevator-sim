/**
 * One palette — asserted, not promised.
 *
 * Before the design refactor there were three copies of the colour set: `:root` in `index.html`,
 * `DEFAULT_THEME` in `render/canvas.ts`, and the handoff. They disagreed in every value — page
 * `#0f1319` against `#0b0e14`, edge `#2b3542` against `#212a36` — and nothing noticed, because a
 * stylesheet and a canvas theme are read by different things and neither is wrong on its own.
 *
 * Three copies of a palette is this repository's signature defect wearing a different hat: a
 * declaration that drifts because nothing consults both halves. The canvas theme is now derived
 * from `render/tokens.ts`, and this file is what stops the *stylesheet* becoming the second copy
 * again. It reads `index.html` as text — the same technique `elementMap.test.ts` uses on the same
 * file, for the same reason: no jsdom, and the markup is the contract.
 *
 * ## Two blocks now, and the second one is the point
 *
 * The stylesheet declares the palette twice: `:root` is the dark mode and
 * `:root[data-theme="light"]` is the light one, which `dev/main.ts` selects by stamping the
 * attribute on the document element. The second block is pinned here by exactly the same argument
 * as the first, and it is pinned to the **resolver's** answer rather than to a list — `themeFor`
 * is the function `applyTheme` calls, so what is checked is the thing the page will actually be
 * painted with.
 *
 * ## What it does not check
 *
 * That every token is *used*. A custom property nobody references is dead weight and not a defect,
 * and enumerating usages would mean parsing the stylesheet. What matters is the one that bites:
 * two names for the same idea holding two different values.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { themeFor } from '../render/theme.js';
import * as tokens from '../render/tokens.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

/** Every `--name: value;` in a block, given the text between its braces. */
function declarationsIn(body: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const line of body.split('\n')) {
    const match = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (match === null) continue;
    found.set(match[1] as string, (match[2] as string).trim());
  }
  return found;
}

/** Every `--name: value;` inside the `:root` block — the dark mode. */
async function rootTokens(): Promise<ReadonlyMap<string, string>> {
  const html = await indexHtml();
  const block = /:root\s*\{([\s\S]*?)\}/.exec(html);
  if (block === null) throw new Error('index.html has no :root block');
  return declarationsIn(block[1] ?? '');
}

/** The same for `:root[data-theme="light"]`, plus whatever else that block declares. */
async function lightBlock(): Promise<{ body: string; tokens: ReadonlyMap<string, string> }> {
  const html = await indexHtml();
  const block = /:root\[data-theme=['"]light['"]\]\s*\{([\s\S]*?)\}/.exec(html);
  if (block === null) {
    throw new Error(
      'index.html declares no `:root[data-theme="light"]` block. The light palette exists in ' +
        '`render/tokens.ts` (LIGHT_PALETTE) and is resolved by `render/theme.ts#themeFor`; the ' +
        'stylesheet is the half that has to declare it, and this test is what says so.',
    );
  }
  const body = block[1] ?? '';
  return { body, tokens: declarationsIn(body) };
}

/**
 * The pairs that must agree, by meaning rather than by name.
 *
 * The two sides name the same idea differently — a stylesheet says `--bg` and a renderer says
 * `PAGE` — so the mapping is written out. That is the whole content of this test: a pair somebody
 * adds to one side and not the other is a pair this table does not cover, which is why the second
 * assertion below counts them.
 */
const PAIRS: readonly (readonly [string, string])[] = Object.freeze([
  ['--bg', tokens.PAGE],
  ['--rail', tokens.RAIL],
  ['--panel', tokens.CARD],
  ['--card', tokens.CARD_RAISED],
  ['--raised', tokens.RAISED],
  ['--edge', tokens.EDGE],
  ['--edge-mid', tokens.EDGE_MID],
  ['--edge-strong', tokens.EDGE_STRONG],
  ['--hairline', tokens.HAIRLINE],
  ['--hint-underline', tokens.HINT_UNDERLINE],
  ['--text', tokens.TEXT],
  ['--dimmer', tokens.TEXT_DIM],
  ['--dim', tokens.TEXT_MUTED],
  ['--faint', tokens.FLOOR_LABEL],
  ['--fainter', tokens.TEXT_FAINTER],
  ['--accent', tokens.ACCENT],
  ['--accent-soft', tokens.ACCENT_SOFT],
  ['--accent-ink', tokens.ACCENT_INK],
  ['--over', tokens.OVER],
  ['--transfer', tokens.FLOOR_LABEL_TRANSFER],
  ['--entrance', tokens.FLOOR_LABEL_ENTRANCE],
  ['--secure', tokens.FLOOR_LABEL_RESTRICTED],
  ['--measured', tokens.MEASURED],
  ['--band-0', tokens.BAND_SETTLING],
  ['--band-1', tokens.BAND_WAITING],
  ['--band-2', tokens.BAND_LONG],
  ['--band-3', tokens.BAND_ABANDONED],
]);

describe('the stylesheet and the renderer share one palette', () => {
  it('agrees on every value the two both name', async () => {
    const root = await rootTokens();
    for (const [property, value] of PAIRS) {
      expect(root.get(property), `${property} in index.html`).toBe(value.toLowerCase());
    }
  });

  it('covers the four wait bands, which is the set that must never disagree', async () => {
    /*
     * The bands are the one part of the palette used by three surfaces at once — the mood bar in
     * the rail, the rider figures on the canvas, and the legend strip between them. A reader
     * comparing a figure on the stage against a count in the rail is comparing colours, so a
     * disagreement here is not a style bug; it is two panels reporting different things.
     */
    const root = await rootTokens();
    const bands = [tokens.BAND_SETTLING, tokens.BAND_WAITING, tokens.BAND_LONG, tokens.BAND_ABANDONED];
    expect(new Set(bands).size).toBe(4);
    for (const [index, band] of bands.entries()) {
      expect(root.get(`--band-${String(index)}`)).toBe(band.toLowerCase());
    }
  });

  it('declares the two type families the handoff specifies, and only those', async () => {
    // § 1.1 S8 — prose and figures. A third family here would be a third voice on the page.
    const root = await rootTokens();
    expect(root.get('--sans')).toContain('Helvetica');
    expect(root.get('--mono')).toContain('ui-monospace');
  });

  it('spells every token as a literal, so nothing here can resolve to another token', async () => {
    /*
     * `--card: var(--panel)` would typecheck as CSS and would make the two names one colour the
     * moment somebody edited either. Every value in `:root` is a literal — a hex, a font stack or a
     * length — and an alias belongs below the block, where the three that exist (`--ok`, `--warn`,
     * `--bad`) are declared and are deliberately aliases of the band palette.
     */
    const root = await rootTokens();
    for (const [property, value] of PAIRS) {
      void value;
      expect(root.get(property), `${property} must be a literal`).toMatch(/^#[0-9a-f]{3,8}$/i);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The rules below the blocks — § D235, and the half `PAIRS` above cannot see
 * -------------------------------------------------------------------------- */

/**
 * Every colour literal in the file that is **not** inside one of the two token blocks.
 *
 * The blocks above are stripped first, so what is left is the ~900 rules and the markup's inline
 * styles. Matches a hex (`#abc`, `#aabbcc`, `#aabbccdd`) or a functional colour (`rgb(`, `rgba(`,
 * `hsl(`, `hsla(`), and deliberately **not** `color-mix(`, which takes its colour from a token by
 * construction and is the sanctioned way to write a tint.
 *
 * Comments are stripped too. This file's own prose quotes a dozen hex values while arguing about
 * them, and a check that could be satisfied by rewording a comment is not checking the page.
 */
function literalColoursOutsideTheBlocks(html: string): readonly string[] {
  const style = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (style === null) throw new Error('index.html has no <style> block');
  const withoutComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const rules = withoutComments(style[1] ?? '')
    .replace(/:root\s*\{[\s\S]*?\}/, ' ')
    .replace(/:root\[data-theme=['"]light['"]\]\s*\{[\s\S]*?\}/, ' ');
  const markup = withoutComments(html.slice(style.index + style[0].length));
  return [
    ...`${rules}\n${markup}`.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g),
  ].map((match) => match[0]);
}

/**
 * The literals a token cannot express, each with the reason it is not a theming defect.
 *
 * Two, and both are the same idea: a **scrim** is black in both modes. A modal backdrop that
 * inverted with the page would be a white veil over a white page, and the drawer's drop shadow is
 * a shadow rather than a colour. Neither carries a claim and neither has a token, so neither is a
 * copy of the palette waiting to drift.
 */
const SCRIMS = ['rgb('] as const;

describe('no rule paints a colour the palette does not own — § D235', () => {
  it('leaves no hex literal anywhere below the two token blocks', async () => {
    /*
     * The failure this closes, in the reporter's words: *"hard-coded dark colours survive the
     * token switch"*. The light block was complete and correct and forty-eight elements stayed
     * dark anyway, because the colours that repainted them were not tokens at all — `#151d29`
     * under the **selected** tab (its `--text` label landed at **1.06:1**), `#c6d0dc` on the
     * coaching line the app writes for a new player (**1.31:1**), `#a6b2c1`, `#0f141d`, `#0d1219`,
     * `#06121f`, and five gradients.
     *
     * `PAIRS` above cannot see any of that: it reads the two blocks and asserts they agree with
     * `render/tokens.ts`. A palette can be perfect and be applied to a tenth of the page. This is
     * the other half — the one that says the rules *use* it.
     */
    const strays = literalColoursOutsideTheBlocks(await indexHtml()).filter(
      (literal) => literal.startsWith('#'),
    );
    expect(strays, 'a hex colour outside `:root` — declare a token, or use `color-mix`').toEqual([]);
  });

  it('leaves no functional colour either, except the two scrims', async () => {
    // `rgb(255 255 255 / 0.04)` and `rgb(63 178 127 / 0.09)` are the same defect wearing a
    // different syntax: a white wash is nothing on a white page, and the second is a fourth copy
    // of the settling band. Both are `color-mix(in srgb, var(--token) N%, transparent)` now.
    const strays = literalColoursOutsideTheBlocks(await indexHtml()).filter(
      (literal) => !literal.startsWith('#'),
    );
    expect(new Set(strays)).toEqual(new Set(SCRIMS));
  });

  it('negative control: the scan reaches the rules and the markup, not just the blocks', async () => {
    // A scan that matched nothing because its regex was wrong would pass both assertions above
    // silently. So: the two scrims *are* found, and a hex planted in each half is found too.
    const html = await indexHtml();
    expect(literalColoursOutsideTheBlocks(html).length).toBeGreaterThan(0);
    expect(literalColoursOutsideTheBlocks(html.replace('.card {', '.x { color: #abcdef } .card {')))
      .toContain('#abcdef');
    expect(literalColoursOutsideTheBlocks(html.replace('</style>', '</style><i style="color:#fedcba">')))
      .toContain('#fedcba');
  });
});

/* -------------------------------------------------------------------------- *
 * The light mode — `GAPS.md`'s half-repainted page, from the stylesheet's side
 * -------------------------------------------------------------------------- */

describe('the stylesheet declares the light mode too, and agrees with the resolver', () => {
  /**
   * The light palette the shipped decision resolves to.
   *
   * `themeFor` and not `LIGHT_PALETTE`, deliberately: the record below is what `applyTheme` writes
   * onto the document, so a projection that dropped a property, or named one the stylesheet does
   * not, fails here rather than in a browser nobody in this repository has. The probe is never
   * consulted for an explicit choice — `render/theme.test.ts` asserts that separately — so a
   * throwing one would be equally correct and a fixed one reads better.
   */
  const resolved = (): Readonly<Record<string, string>> =>
    themeFor('light', () => ({ matches: false })).tokens;

  it('declares every token the light palette resolves, at the resolver’s own value', async () => {
    const { tokens: declared } = await lightBlock();
    for (const [property, value] of Object.entries(resolved())) {
      expect(declared.get(property), `${property} in :root[data-theme="light"]`).toBe(
        value.toLowerCase(),
      );
    }
  });

  it('declares nothing the light palette does not resolve — the other direction', async () => {
    // § D213's rule, in the direction that rots quietly: a custom property left in this block
    // after the palette dropped it is a colour the page keeps applying and nothing decides.
    const { tokens: declared } = await lightBlock();
    const palette = resolved();
    const orphans = [...declared.keys()].filter((property) => palette[property] === undefined);
    expect(orphans, 'declared in the light block and resolved by nothing').toEqual([]);
  });

  it('covers the whole dark block: a mode may not simply omit a token', async () => {
    // The failure this catches is the one the gap was: a light palette that repaints *some* of the
    // page. Every colour `:root` declares must be answered here — the aliases and the type and
    // geometry tokens are mode-independent and are excluded by being non-hex, which is the same
    // filter `render/theme.test.ts` derives its names with.
    const dark = [...(await rootTokens())]
      .filter(([, value]) => /^#[0-9a-f]{3,8}$/i.test(value))
      .map(([property]) => property)
      .sort();
    const { tokens: declared } = await lightBlock();
    expect([...declared.keys()].sort()).toEqual(dark);
  });

  it('sets `color-scheme: light`, which no token assertion could catch', async () => {
    // `:root` hard-codes `color-scheme: dark`. Left alone, a light page keeps dark scrollbars and
    // dark `<select>` popups — the one failure mode of this feature that involves no token at all.
    const { body } = await lightBlock();
    expect(body).toMatch(/color-scheme\s*:\s*light\s*;/);
  });

  it('differs from the dark block at every single token', async () => {
    // The inert-control check, at the stylesheet layer: a light block that copied eleven of the
    // dark values would satisfy every structural assertion above.
    const dark = await rootTokens();
    const { tokens: declared } = await lightBlock();
    const shared = [...declared].filter(([property, value]) => dark.get(property) === value);
    expect(shared.map(([property]) => property)).toEqual([]);
  });
});
