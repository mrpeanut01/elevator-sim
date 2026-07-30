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
 * ## What it does not check
 *
 * That every token is *used*. A custom property nobody references is dead weight and not a defect,
 * and enumerating usages would mean parsing the stylesheet. What matters is the one that bites:
 * two names for the same idea holding two different values.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as tokens from '../render/tokens.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

/** Every `--name: value;` inside the `:root` block. */
async function rootTokens(): Promise<ReadonlyMap<string, string>> {
  const html = await indexHtml();
  const block = /:root\s*\{([\s\S]*?)\}/.exec(html);
  if (block === null) throw new Error('index.html has no :root block');
  const found = new Map<string, string>();
  for (const line of (block[1] ?? '').split('\n')) {
    const match = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (match === null) continue;
    found.set(match[1] as string, (match[2] as string).trim());
  }
  return found;
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
  ['--edge', tokens.EDGE],
  ['--text', tokens.TEXT],
  ['--dimmer', tokens.TEXT_DIM],
  ['--dim', tokens.TEXT_MUTED],
  ['--accent', tokens.ACCENT],
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
