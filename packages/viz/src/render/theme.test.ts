/**
 * The theme setting, made falsifiable — `docs/16-change-scope-contract.md` S2 and S9.
 *
 * Three separate claims, because they fail separately:
 *
 * 1. **The palette covers the stylesheet, in both directions.** The token *names* are derived from
 *    `index.html`'s `:root` block rather than listed here, and the assertion runs both ways: a
 *    custom property the stylesheet declares and the palette omits is red, and a palette entry
 *    naming a property the stylesheet no longer declares is red too. § D213 is the reason —
 *    a hand-maintained list stops tracking the thing it was built from, and this repository has
 *    been caught by that five times. `dev/tokens.test.ts` reads the same block by the same
 *    technique, for the same reason one layer down.
 * 2. **The two palettes are two palettes.** Every token differs. A "light theme" that quietly
 *    reused eleven of the dark values would satisfy every structural check above and would be the
 *    inert control `docs/12` § 5 clause 9 forbids, wearing a palette's clothes.
 * 3. **`'system'` follows the probe, in both directions, and the explicit choices do not consult
 *    it at all.** Driven through the shipped decision — `themeFor` — never through a restatement
 *    of it. The probe here records the query it is asked, so the exact media string is asserted by
 *    observation rather than by comparing an exported constant with itself.
 *
 * ## The evidence tier, stated
 *
 * `docs/16` S9: `static sweep < model walk < document recorder < browser`, and this repository has
 * no browser (`docs/05`: *"no Playwright, no Puppeteer, no jsdom"*). **Nothing below is a claim
 * that the light theme looks right.** The contrast assertions are arithmetic over hex triples —
 * a no-regression bound, not a WCAG verdict — and the floor is set by the *shipped dark palette*,
 * which clears 4.0:1 at `--dimmer` (4.24) and `--band-3` (4.47) and would fail a 4.5 bound today.
 * Raising the floor to 4.5 would therefore be a test that fails on the incumbent design rather
 * than on a regression, which is not a gate; it is a redesign with a test attached.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { themeFor, type ColorSchemeProbe, type ThemeName } from './theme.js';

/* -------------------------------------------------------------------------- *
 * The stylesheet, as the source of the token names
 * -------------------------------------------------------------------------- */

/**
 * Every `--name: #hex;` inside a `:root` block.
 *
 * **Hex literals only**, and that filter is the derivation rule rather than a convenience: a token
 * whose value is a `var(--other)` alias, a font stack or a length is not a colour and cannot be
 * theme-dependent. The stylesheet declares eleven such tokens — `--ok`/`--warn`/`--bad` (aliases
 * of the band palette), `--sans`/`--mono`, and the six geometry tokens — and a theme that restated
 * them would be a second place `--rail-left` has to change.
 */
function hexTokensIn(css: string): ReadonlyMap<string, string> {
  const block = /:root\s*\{([\s\S]*?)\}/.exec(css);
  if (block === null) throw new Error('no :root block');
  const found = new Map<string, string>();
  for (const line of (block[1] ?? '').split('\n')) {
    const match = /^\s*(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(line);
    if (match === null) continue;
    found.set(match[1] as string, (match[2] as string).toLowerCase());
  }
  return found;
}

async function stylesheetTokens(): Promise<ReadonlyMap<string, string>> {
  const html = await readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
  return hexTokensIn(html);
}

const NEVER_ASKED: ColorSchemeProbe = (query) => {
  throw new Error(`the probe was asked "${query}" for an explicit choice`);
};

const answering = (matches: boolean): ColorSchemeProbe => () => ({ matches });

/** A probe that records what it was asked, so the media string is checked by observation. */
function recordingProbe(matches: boolean): { probe: ColorSchemeProbe; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    probe: (query) => {
      asked.push(query);
      return { matches };
    },
  };
}

const tokensOf = (name: ThemeName): Readonly<Record<string, string>> =>
  themeFor(name, NEVER_ASKED).tokens;

/* -------------------------------------------------------------------------- *
 * 1 — the palette covers the stylesheet, both ways
 * -------------------------------------------------------------------------- */

describe('the token names are derived from the stylesheet, not listed', () => {
  it('positive control: the derivation really does find tokens, and skips what is not a colour', () => {
    // Without this, every assertion below could pass because the regex matched nothing — the
    // silent-instrument shape wave 12's rule 5 forbids, and `boundaries.test.ts`'s own habit.
    const synthetic = hexTokensIn(
      ':root {\n  --planted: #ABCdef;\n  --alias: var(--planted);\n  --len: 12px;\n' +
        "  --font: 'Helvetica Neue', sans-serif;\n}",
    );
    expect([...synthetic]).toEqual([['--planted', '#abcdef']]);
  });

  it('gives every colour the stylesheet declares an entry in both palettes', async () => {
    const stylesheet = [...(await stylesheetTokens()).keys()].sort();
    expect(stylesheet.length).toBeGreaterThan(20);
    for (const name of ['dark', 'light'] as const) {
      expect(Object.keys(tokensOf(name)).sort(), `${name} is missing a token`).toEqual(stylesheet);
    }
  });

  it('names no token the stylesheet does not declare', async () => {
    // The other direction. A palette entry for a property `index.html` dropped would be applied to
    // a document that ignores it — a setting that appears to work and changes nothing, which is the
    // register entry this file exists to retire rather than to reproduce.
    const stylesheet = await stylesheetTokens();
    for (const name of ['dark', 'light'] as const) {
      const orphans = Object.keys(tokensOf(name)).filter((token) => !stylesheet.has(token));
      expect(orphans, `${name} names a property :root does not declare`).toEqual([]);
    }
  });

  it('is the shipped palette, value for value, on the dark side', async () => {
    // The dark palette is not a design decision made here; it is `index.html`'s, and seventeen of
    // its values come from `render/tokens.ts`. If this goes red, either the stylesheet moved or
    // this module became the fourth copy of a palette § 2.2 of the handoff counted three of.
    const stylesheet = await stylesheetTokens();
    for (const [token, value] of Object.entries(tokensOf('dark'))) {
      expect(value.toLowerCase(), `${token}`).toBe(stylesheet.get(token));
    }
  });

  it('spells every value as a literal hex, on both sides', () => {
    for (const name of ['dark', 'light'] as const) {
      for (const [token, value] of Object.entries(tokensOf(name))) {
        expect(value, `${name} ${token}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — the two palettes are two palettes
 * -------------------------------------------------------------------------- */

describe('light and dark are different palettes', () => {
  it('differs on every single token', () => {
    const dark = tokensOf('dark');
    const light = tokensOf('light');
    const shared = Object.keys(dark).filter((token) => dark[token] === light[token]);
    expect(shared, 'these tokens are the same colour in both themes').toEqual([]);
  });

  it('keeps the four wait bands distinct from each other within each palette', () => {
    // `render/tokens.ts`: the bands are *"used for every wait-age claim on every surface"*, and
    // `dev/tokens.test.ts` asserts the dark four are four. A light palette that collapsed two of
    // them would make the rail, the canvas and the legend disagree about what amber means — and
    // colour is never the only signal (`riderQueue.ts`'s `BAND_GLYPH`), but two bands sharing one
    // colour is still two claims wearing one face.
    for (const name of ['dark', 'light'] as const) {
      const tokens = tokensOf(name);
      const bands = [0, 1, 2, 3].map((index) => tokens[`--band-${String(index)}`]);
      expect(new Set(bands).size, `${name} bands`).toBe(4);
    }
  });

  it('keeps the surface ladder monotone, in the direction that reads as elevation', () => {
    // Ground → raised. Both palettes lighten; the light one starts at a grey and ends at white,
    // which is the light-mode convention rather than a mirror of the dark ladder.
    for (const name of ['dark', 'light'] as const) {
      const tokens = tokensOf(name);
      const ladder = ['--bg', '--rail', '--panel', '--card', '--raised'].map((token) =>
        luminance(tokens[token] as string),
      );
      for (const [index, step] of ladder.slice(1).entries()) {
        expect(step, `${name}: ${String(index)} → ${String(index + 1)}`).toBeGreaterThan(
          ladder[index] as number,
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Contrast — arithmetic, and nothing more than arithmetic
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

/** The grounds. Not measured against anything; they are what everything else is measured on. */
const SURFACES = ['--bg', '--rail', '--panel', '--card', '--raised'];

/**
 * Structure — rules, hairlines, the label gutter, the dotted underline under a term.
 *
 * Excluded from the floor with a reason rather than left out: `render/tokens.ts` makes the same
 * distinction one layer down (*"the label gutter is scenery and an eyebrow is content, and the
 * artefact draws them two different greys"*), and the shipped dark palette puts `--fainter` at
 * 1.99:1 on purpose. A floor that included these would be a floor the incumbent design fails.
 */
const SCENERY = [
  '--hairline',
  '--edge',
  '--edge-mid',
  '--edge-strong',
  '--hint-underline',
  '--faint',
  '--fainter',
];

/** Everything that carries a word or a number, and the surface it is drawn on. */
const CONTENT_ON_PANEL = [
  '--text',
  '--dim',
  '--dimmer',
  '--accent',
  '--accent-soft',
  '--band-0',
  '--band-1',
  '--band-2',
  '--band-3',
  '--over',
  '--transfer',
  '--entrance',
  '--secure',
  '--measured',
];

/** Drawn *on* the accent fill, so it is measured against the accent and not against the page. */
const CONTENT_ON_ACCENT = ['--accent-ink'];

const FLOOR = 4;

describe('contrast — a no-regression bound, never a claim about how it looks', () => {
  it('accounts for every token exactly once, derived from the stylesheet', async () => {
    // The four groups above are hand-written, which is the thing § D213 distrusts — so they are
    // asserted against the derived set in both directions and asserted disjoint. A token added to
    // `:root` lands in no group and turns this red on the day it lands.
    const stylesheet = [...(await stylesheetTokens()).keys()].sort();
    const grouped = [...SURFACES, ...SCENERY, ...CONTENT_ON_PANEL, ...CONTENT_ON_ACCENT];
    expect(new Set(grouped).size, 'a token is in two groups').toBe(grouped.length);
    expect([...grouped].sort()).toEqual(stylesheet);
  });

  it(`puts every content token at ${String(FLOOR)}:1 or better against the surface it sits on`, () => {
    for (const name of ['dark', 'light'] as const) {
      const tokens = tokensOf(name);
      for (const token of CONTENT_ON_PANEL) {
        const ratio = contrast(tokens[token] as string, tokens['--panel'] as string);
        expect(ratio, `${name} ${token} on --panel`).toBeGreaterThanOrEqual(FLOOR);
      }
      for (const token of CONTENT_ON_ACCENT) {
        const ratio = contrast(tokens[token] as string, tokens['--accent'] as string);
        expect(ratio, `${name} ${token} on --accent`).toBeGreaterThanOrEqual(FLOOR);
      }
    }
  });

  it('negative control: the floor is a real bound, and would catch a token that failed it', () => {
    // A test whose assertion cannot fail is a description. `--panel` against itself is 1:1.
    const tokens = tokensOf('light');
    expect(contrast(tokens['--panel'] as string, tokens['--panel'] as string)).toBe(1);
    expect(contrast(tokens['--panel'] as string, tokens['--card'] as string)).toBeLessThan(FLOOR);
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — the sink: `'system'` follows the probe, the explicit choices do not ask it
 * -------------------------------------------------------------------------- */

describe('the choice resolves through the shipped decision', () => {
  it('follows the probe in both directions when the choice is `system`', () => {
    // Both directions, because a resolver hard-wired to one answer passes a one-directional test.
    expect(themeFor('system', answering(true)).name).toBe('dark');
    expect(themeFor('system', answering(false)).name).toBe('light');
    expect(themeFor('system', answering(true)).tokens).not.toEqual(
      themeFor('system', answering(false)).tokens,
    );
  });

  it('asks for `prefers-color-scheme: dark`, and asks once', () => {
    const { probe, asked } = recordingProbe(true);
    themeFor('system', probe);
    expect(asked).toEqual(['(prefers-color-scheme: dark)']);
  });

  it('never consults the probe for an explicit choice', () => {
    // Not *consults it and ignores the answer*: a player who picked a side has overridden the
    // operating system, and `NEVER_ASKED` throws, so this fails loudly rather than by comparison.
    expect(themeFor('dark', NEVER_ASKED).name).toBe('dark');
    expect(themeFor('light', NEVER_ASKED).name).toBe('light');
  });

  it('carries the choice beside the answer, so a surface can say "System (dark)" honestly', () => {
    const resolved = themeFor('system', answering(false));
    expect(resolved.choice).toBe('system');
    expect(resolved.name).toBe('light');
    // `'system'` is a choice and never an answer — nothing downstream should have to re-derive it.
    expect(resolved.name).not.toBe('system');
  });

  it('sets `color-scheme` to match, so native widgets follow the page', () => {
    // The one failure no amount of token checking would catch: light cards with a dark scrollbar
    // and dark `<select>` popups, because `index.html` hard-codes `color-scheme: dark` on `:root`.
    for (const choice of ['system', 'dark', 'light'] as const) {
      const resolved = themeFor(choice, answering(true));
      expect(resolved.colorScheme, choice).toBe(resolved.name);
    }
  });

  it('the sink moves: the three choices do not all produce the same tokens', () => {
    // `docs/16` S2's second half, stated at the level `scope.test.ts` asserts it: a presentation
    // control must reach a sink and the sink must observably move. This is the assertion
    // `SINK_MISSING`'s `settings.theme` entry says has never been possible.
    const probe = answering(true);
    const rendered = (['system', 'dark', 'light'] as const).map((choice) =>
      JSON.stringify(themeFor(choice, probe)),
    );
    expect(new Set(rendered).size).toBeGreaterThan(1);
    expect(JSON.stringify(themeFor('dark', probe).tokens)).not.toBe(
      JSON.stringify(themeFor('light', probe).tokens),
    );
  });
});
