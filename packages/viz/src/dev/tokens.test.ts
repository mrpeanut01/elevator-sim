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
 * ## The two blocks swapped on the § 19 restyle, and the pins moved with them
 *
 * `docs/21-engineer-reimagined-contract.md` § 2.2 (1): the guide's paper palette is the page's own
 * `:root` now, and the S6/S7 dark values live in `:root[data-theme='dark']` — a re-skin, not a
 * deletion of a mode, and the pin move is the recorded decision. So the assertions run exactly as
 * they did with the polarity flipped: the bare `:root` is pinned to the **resolver's** light
 * answer (`themeFor('light')` is what `applyTheme` writes), the dark block is pinned to
 * `render/tokens.ts`'s own constants by meaning, and the § 19 sources — `everyday/tokens.ts`, and
 * the guide block itself as text — are pinned underneath both.
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

import { EVERYDAY_COLORS, EVERYDAY_RADII, EVERYDAY_TYPE } from '../everyday/tokens.js';
import { themeFor } from '../render/theme.js';
import * as tokens from '../render/tokens.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

/** The § 19 block of the Casual guide, as text — the canonical source for every paper value. */
async function guideSection19(): Promise<string> {
  const guide = await readFile(
    fileURLToPath(
      new URL(
        '../../../../docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const heading = guide.indexOf('## 19. Design tokens');
  if (heading < 0) throw new Error('the guide has no § 19');
  const open = guide.indexOf('```', heading);
  const close = guide.indexOf('```', open + 3);
  if (open < 0 || close < 0) throw new Error('§ 19 has no fenced token block');
  return guide.slice(open + 3, close);
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

/** Every `--name: value;` inside the `:root` block — the paper mode, and the page's default. */
async function rootTokens(): Promise<ReadonlyMap<string, string>> {
  const html = await indexHtml();
  const block = /:root\s*\{([\s\S]*?)\}/.exec(html);
  if (block === null) throw new Error('index.html has no :root block');
  return declarationsIn(block[1] ?? '');
}

/** The same for `:root[data-theme="dark"]`, plus whatever else that block declares. */
async function darkBlock(): Promise<{ body: string; tokens: ReadonlyMap<string, string> }> {
  const html = await indexHtml();
  const block = /:root\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\}/.exec(html);
  if (block === null) {
    throw new Error(
      'index.html declares no `:root[data-theme="dark"]` block. The dark palette exists in ' +
        '`render/canvas.ts` (DARK_PALETTE) and is resolved by `render/theme.ts#themeFor`; the ' +
        'stylesheet is the half that has to declare it, and this test is what says so — the ' +
        'restyle is a re-skin, not a deletion of a mode (docs/21 § 2.2).',
    );
  }
  const body = block[1] ?? '';
  return { body, tokens: declarationsIn(body) };
}

/**
 * The pairs that must agree, by meaning rather than by name.
 *
 * The two sides name the same idea differently — a stylesheet says `--bg` and a renderer says
 * `PAGE` — so the mapping is written out. The right column is `render/tokens.ts`'s loose
 * constants, which **are** the dark palette, so the table pins the dark block; the paper block is
 * pinned to the resolver below. A pair somebody adds to one side and not the other is a pair this
 * table does not cover, which is why the coverage assertion counts them.
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
  // § D236 — the stage key's swatches. Pinned here for the reason every row above is: a legend
  // drawn in a colour the canvas does not use is a legend that lies about the picture.
  ['--car-heavy', tokens.CAR_HEAVY],
  ['--waiting-up', tokens.WAITING_UP],
  ['--waiting-down', tokens.WAITING_DOWN],
]);

describe('the stylesheet and the renderer share one palette', () => {
  it('agrees with `render/tokens.ts` on every dark value the two both name', async () => {
    const { tokens: dark } = await darkBlock();
    for (const [property, value] of PAIRS) {
      expect(dark.get(property), `${property} in the dark block`).toBe(value.toLowerCase());
    }
  });

  it('covers the four wait bands, which is the set that must never disagree', async () => {
    /*
     * The bands are the one part of the palette used by three surfaces at once — the mood bar in
     * the rail, the rider figures on the canvas, and the legend strip between them. A reader
     * comparing a figure on the stage against a count in the rail is comparing colours, so a
     * disagreement here is not a style bug; it is two panels reporting different things. Checked
     * in both blocks, against each block's own palette.
     */
    const root = await rootTokens();
    const paper = themeFor('light', () => ({ matches: false })).tokens;
    const { tokens: dark } = await darkBlock();
    const darkBands = [tokens.BAND_SETTLING, tokens.BAND_WAITING, tokens.BAND_LONG, tokens.BAND_ABANDONED];
    expect(new Set(darkBands).size).toBe(4);
    for (const [index, band] of darkBands.entries()) {
      expect(dark.get(`--band-${String(index)}`)).toBe(band.toLowerCase());
      expect(root.get(`--band-${String(index)}`)).toBe(paper[`--band-${String(index)}`]);
    }
  });

  it('declares the three type families guide § 19 specifies, pinned to `everyday/tokens.ts`', async () => {
    // § 19: Familjen Grotesk for headings, Instrument Sans for prose, DM Mono for figures. The
    // leading family of each stack is the module's; the tails are fallbacks, since no webfont is
    // shipped. A fourth family here would be a fourth voice on the page.
    const root = await rootTokens();
    const leading = (stack: string): string => stack.split(',')[0]?.trim() ?? '';
    expect(root.get('--heading')?.startsWith(leading(EVERYDAY_TYPE.heading))).toBe(true);
    expect(root.get('--sans')?.startsWith(leading(EVERYDAY_TYPE.body))).toBe(true);
    expect(root.get('--mono')?.startsWith(leading(EVERYDAY_TYPE.mono))).toBe(true);
    // The figures keep a real monospace behind DM Mono wherever the reader lacks it.
    expect(root.get('--mono')).toContain('ui-monospace');
  });

  it('takes its radii from § 19’s scale, pinned to `everyday/tokens.ts`', async () => {
    const root = await rootTokens();
    expect(root.get('--r-card')).toBe(`${String(EVERYDAY_RADII.card)}px`);
    expect(root.get('--r-panel')).toBe(`${String(EVERYDAY_RADII.tile)}px`);
    expect(root.get('--r-control')).toBe(`${String(EVERYDAY_RADII.control)}px`);
    expect(root.get('--r-chip')).toBe(`${String(EVERYDAY_RADII.control)}px`);
  });

  it('spells every colour token as a literal, so nothing here can resolve to another token', async () => {
    /*
     * `--card: var(--panel)` would typecheck as CSS and would make the two names one colour the
     * moment somebody edited either. Every colour in both blocks is a literal hex; an alias
     * belongs below the block, where the three that exist (`--ok`, `--warn`, `--bad`) are
     * declared and are deliberately aliases of the band palette.
     */
    const root = await rootTokens();
    const { tokens: dark } = await darkBlock();
    for (const [property] of PAIRS) {
      expect(root.get(property), `${property} in :root must be a literal`).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(dark.get(property), `${property} in the dark block must be a literal`).toMatch(
        /^#[0-9a-f]{3,8}$/i,
      );
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
    .replace(/:root\[data-theme=['"]dark['"]\]\s*\{[\s\S]*?\}/, ' ');
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
 * The two modes agree with the resolver — the pin, from the stylesheet's side
 * -------------------------------------------------------------------------- */

describe('both blocks agree with the resolver, and neither can drop or invent a token', () => {
  /**
   * `themeFor` and not the palettes, deliberately: the records below are what `applyTheme` writes
   * onto the document, so a projection that dropped a property, or named one the stylesheet does
   * not, fails here rather than in a browser. The probe is never consulted for an explicit
   * choice — `render/theme.test.ts` asserts that separately — so a throwing one would be equally
   * correct and a fixed one reads better.
   */
  const resolved = (name: 'light' | 'dark'): Readonly<Record<string, string>> =>
    themeFor(name, () => ({ matches: false })).tokens;

  it('declares every token the paper palette resolves in `:root`, at the resolver’s own value', async () => {
    const declared = await rootTokens();
    for (const [property, value] of Object.entries(resolved('light'))) {
      expect(declared.get(property), `${property} in :root`).toBe(value.toLowerCase());
    }
  });

  it('declares every token the dark palette resolves, at the resolver’s own value', async () => {
    const { tokens: declared } = await darkBlock();
    for (const [property, value] of Object.entries(resolved('dark'))) {
      expect(declared.get(property), `${property} in :root[data-theme="dark"]`).toBe(
        value.toLowerCase(),
      );
    }
  });

  it('declares nothing in the dark block the dark palette does not resolve — the other direction', async () => {
    // § D213's rule, in the direction that rots quietly: a custom property left in this block
    // after the palette dropped it is a colour the page keeps applying and nothing decides.
    const { tokens: declared } = await darkBlock();
    const palette = resolved('dark');
    const orphans = [...declared.keys()].filter((property) => palette[property] === undefined);
    expect(orphans, 'declared in the dark block and resolved by nothing').toEqual([]);
  });

  it('covers the whole paper block: a mode may not simply omit a token', async () => {
    // The failure this catches is the one the gap was: a second mode that repaints *some* of the
    // page. Every colour `:root` declares must be answered in the dark block — the aliases and
    // the type and geometry tokens are mode-independent and are excluded by being non-hex, which
    // is the same filter `render/theme.test.ts` derives its names with.
    const paper = [...(await rootTokens())]
      .filter(([, value]) => /^#[0-9a-f]{3,8}$/i.test(value))
      .map(([property]) => property)
      .sort();
    const { tokens: declared } = await darkBlock();
    expect([...declared.keys()].sort()).toEqual(paper);
  });

  it('sets `color-scheme` in both blocks, which no token assertion could catch', async () => {
    // Left alone, a paper page keeps dark scrollbars and dark `<select>` popups — the one failure
    // mode of this feature that involves no token at all — and vice versa in the dark mode.
    const html = await indexHtml();
    const root = /:root\s*\{([\s\S]*?)\}/.exec(html);
    expect(root?.[1]).toMatch(/color-scheme\s*:\s*light\s*;/);
    const { body } = await darkBlock();
    expect(body).toMatch(/color-scheme\s*:\s*dark\s*;/);
  });

  it('differs from the dark block at every single token', async () => {
    // The inert-control check, at the stylesheet layer: a dark block that copied eleven of the
    // paper values would satisfy every structural assertion above.
    const paper = await rootTokens();
    const { tokens: declared } = await darkBlock();
    const shared = [...declared].filter(([property, value]) => paper.get(property) === value);
    expect(shared.map(([property]) => property)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * Guide § 19 is the value source — pinned as text, deviations pinned as measurements
 * -------------------------------------------------------------------------- */

/** WCAG relative luminance of a `#rrggbb`. */
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('guide § 19 is canonical for the paper values — docs/21 § 2.1/§ 2.2', () => {
  it('takes every § 19-sourced token from the § 19 block, byte for byte as text', async () => {
    /*
     * `elementMap.test.ts`'s technique, third application: the markup is the contract, so the
     * guide's own fenced block is read and each § 19-sourced value in `:root` is required to
     * appear in it. A value that drifts from the guide is a bug in the palette, not a preference.
     */
    const section = (await guideSection19()).toUpperCase();
    const root = await rootTokens();
    const sourced: readonly (readonly [string, string])[] = [
      ['--bg', 'card sunk deep'],
      ['--rail', 'card sunk'],
      ['--panel', 'paper'],
      ['--card', 'card'],
      ['--hairline', 'rule'],
      ['--edge', 'rule'],
      ['--edge-mid', 'rule'],
      ['--hint-underline', 'warm grey faint'],
      ['--text', 'ink'],
      ['--dim', 'ink soft'],
      ['--faint', 'warm grey'],
      ['--fainter', 'warm grey fainter'],
      ['--band-3', 'terracotta'],
    ];
    for (const [property, claim] of sourced) {
      const value = root.get(property);
      expect(value, property).toBeDefined();
      expect(section, `${property} (${claim}) must be a § 19 value`).toContain(
        (value as string).toUpperCase(),
      );
    }
  });

  it('agrees with `everyday/tokens.ts` — the shared module both products read', async () => {
    // The palette imports the module; this asserts the wiring rather than trusting it, on the
    // stylesheet's side, so a fork of a § 19 value in either place is red.
    const root = await rootTokens();
    const lower = (value: string): string => value.toLowerCase();
    expect(root.get('--bg')).toBe(lower(EVERYDAY_COLORS.cardSunkDeep));
    expect(root.get('--rail')).toBe(lower(EVERYDAY_COLORS.cardSunk));
    expect(root.get('--panel')).toBe(lower(EVERYDAY_COLORS.paper));
    expect(root.get('--card')).toBe(lower(EVERYDAY_COLORS.card));
    expect(root.get('--hairline')).toBe(lower(EVERYDAY_COLORS.ruleLight));
    expect(root.get('--edge')).toBe(lower(EVERYDAY_COLORS.ruleMid));
    expect(root.get('--edge-mid')).toBe(lower(EVERYDAY_COLORS.rule));
    expect(root.get('--hint-underline')).toBe(lower(EVERYDAY_COLORS.faint));
    expect(root.get('--text')).toBe(lower(EVERYDAY_COLORS.ink));
    expect(root.get('--dim')).toBe(lower(EVERYDAY_COLORS.inkSoft));
    expect(root.get('--faint')).toBe(lower(EVERYDAY_COLORS.warmGrey));
    expect(root.get('--fainter')).toBe(lower(EVERYDAY_COLORS.fainter));
    expect(root.get('--band-3')).toBe(lower(EVERYDAY_COLORS.terracotta));
  });

  it('ships each recorded § 19 deviation only while the § 19 value still fails the floor', async () => {
    /*
     * docs/21 § 2.2 (5): the contrast floor outranks the prototype's values, and a deviation is
     * recorded, not improvised. This is the record made mechanical — each row asserts BOTH halves:
     * the § 19 value measures under the floor that forced the deviation, and the shipped value
     * clears it. If the guide ever moves a failing value past the floor, the first half goes red
     * and the § 19 value is re-adopted rather than the deviation quietly outliving its constraint.
     *
     * The floors are the shipped gates' own: `render/theme.test.ts`'s 4.0 content floor on
     * `--panel`, its 4.5 AA bound for the ink ladder (worst surface `--bg`), and
     * `noteContrast.test.ts`'s 4.5 on the note pairings (`--warn` proposed on `--rail`).
     */
    const root = await rootTokens();
    const at = (property: string): string => root.get(property) as string;
    const rows: readonly {
      readonly claim: string;
      readonly guide: string;
      readonly shipped: string;
      readonly ground: string;
      readonly floor: number;
    }[] = [
      { claim: 'accent (sun)', guide: EVERYDAY_COLORS.sun, shipped: at('--accent'), ground: at('--panel'), floor: 4 },
      { claim: 'warn band (sun)', guide: EVERYDAY_COLORS.sun, shipped: at('--band-1'), ground: at('--rail'), floor: 4.5 },
      { claim: 'ok band (moss)', guide: EVERYDAY_COLORS.moss, shipped: at('--band-0'), ground: at('--panel'), floor: 4 },
      { claim: 'bad band (alarm)', guide: EVERYDAY_COLORS.alarm, shipped: at('--band-3'), ground: at('--panel'), floor: 4 },
      { claim: 'entrance (sky)', guide: EVERYDAY_COLORS.sky, shipped: at('--entrance'), ground: at('--panel'), floor: 4 },
      { claim: 'eyebrow ink (label grey)', guide: EVERYDAY_COLORS.label, shipped: at('--dimmer'), ground: at('--bg'), floor: 4.5 },
    ];
    for (const row of rows) {
      expect(
        contrast(row.guide.toLowerCase(), row.ground),
        `${row.claim}: § 19's ${row.guide} now clears ${String(row.floor)}:1 — re-adopt it`,
      ).toBeLessThan(row.floor);
      expect(
        contrast(row.shipped, row.ground),
        `${row.claim}: the shipped value must clear the floor the deviation exists for`,
      ).toBeGreaterThanOrEqual(row.floor);
    }
  });

  it('negative control: the § 19 block is really read, and really contains the palette', async () => {
    const section = await guideSection19();
    expect(section).toContain('#F7F2E8');
    expect(section).toContain('Shaft tints');
    expect(section).toContain('DM Mono');
  });
});
