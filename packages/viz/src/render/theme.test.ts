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

import { DARK_PALETTE, themeFromPalette } from './canvas.js';
import * as tokens from './tokens.js';
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
 * 2b — the palettes behind the tokens: coverage, and the distinctness property
 * -------------------------------------------------------------------------- */

/**
 * One comparable string per palette field. A sky ramp is a pair, and a pair that differs in either
 * stop is a different colour, so it joins rather than collapsing to its first stop.
 */
function valueOf(value: string | readonly string[]): string {
  return typeof value === 'string' ? value : value.join('|');
}

function valuesOf(palette: tokens.Palette): ReadonlyMap<string, string> {
  return new Map(
    Object.entries(palette).map(([field, value]) => [
      field,
      valueOf(value as string | readonly string[]),
    ]),
  );
}

/** Every runtime colour `render/tokens.ts` exports — strings and sky ramps, nothing else. */
function exportedColours(): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const [name, value] of Object.entries(tokens)) {
    if (typeof value === 'string') found.set(name, value);
    else if (Array.isArray(value)) found.set(name, (value as readonly string[]).join('|'));
  }
  return found;
}

/** Every colour a resolved theme actually hands to a surface: the shell's, and the stage's. */
function drawnValues(name: ThemeName): ReadonlySet<string> {
  const resolved = themeFor(name, NEVER_ASKED);
  const out = new Set<string>(Object.values(resolved.tokens));
  const walk = (value: unknown): void => {
    if (typeof value === 'string') out.add(value);
    else if (Array.isArray(value)) out.add((value as readonly string[]).join('|'));
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk);
  };
  // A ramp joins to one string on both sides of the comparison, so a mode that changed one stop
  // and not the other reads as a different colour rather than as the same one.
  walk(resolved.stage);
  return out;
}

describe('the palette behind the tokens covers the file it is assembled from', () => {
  it('gives every colour `render/tokens.ts` exports a field in the dark palette', () => {
    // The derivation, in the direction § D213 cares about: a constant added to the palette file
    // and forgotten in the assembly is a colour the light mode has no counterpart for, and the
    // half-repainted page is exactly what that produces. Derived from the module's own exports —
    // not from a list beside them.
    const exported = [...exportedColours().values()].sort();
    const assembled = [...valuesOf(DARK_PALETTE).values()].sort();
    expect(assembled).toEqual(exported);
  });

  it('names no colour `render/tokens.ts` does not export — the other direction', () => {
    const exported = new Set(exportedColours().values());
    const orphans = [...valuesOf(DARK_PALETTE)]
      .filter(([, value]) => !exported.has(value))
      .map(([field]) => field);
    expect(orphans, 'these palette fields hold a literal of their own').toEqual([]);
  });

  it('positive control: the derivation reads real values, and would notice a missing one', () => {
    // Without this the two assertions above pass on two empty lists. Both sides are non-trivial
    // and the count is the palette's, so a scanner that matched nothing is loud.
    const exported = exportedColours();
    expect(exported.get('PAGE')).toBe(tokens.PAGE);
    expect(exported.get('SKY_NIGHT')).toBe(tokens.SKY_NIGHT.join('|'));
    expect(exported.size).toBeGreaterThan(50);
    expect(Object.keys(DARK_PALETTE).length).toBe(exported.size);
  });

  it('draws every colour it declares — no field that nothing consumes', () => {
    // A palette field neither the shell nor the stage reads is a colour a mode can differ in with
    // no pixel following, which is the inert-control shape `docs/12` § 5 clause 9 forbids wearing
    // a palette's clothes. Checked on the light palette, whose fields are distinct wherever the
    // dark ones are (asserted below), so value-presence is not laundered through a collision.
    for (const name of ['dark', 'light'] as const) {
      const drawn = drawnValues(name);
      const unread = [...valuesOf(name === 'dark' ? DARK_PALETTE : tokens.LIGHT_PALETTE)]
        .filter(([, value]) => !drawn.has(value))
        .map(([field]) => field);
      expect(unread, `${name}: declared and never drawn`).toEqual([]);
    }
  });
});

describe('two different claims never share a colour — in both palettes, or in neither', () => {
  /**
   * **The property this whole file exists to protect, stated once.**
   *
   * `render/`'s tests identify a mark *by its fill*: `canvas.test.ts` counts *"the rider glyphs
   * drawn in the settling band's colour"*, `stageRender.test.ts` picks the slabs out of the
   * transcript by `DEFAULT_THEME.floorSlab`. So a palette in which two claims collide does not
   * merely look wrong — it makes those counts measure something else, silently, and the suite
   * stays green while doing it.
   *
   * The dark palette's collisions are deliberate and are argued at their constants: a car with
   * room in it *is* the freshest band's green, one red means *this is the thing that is wrong*,
   * a warning *is* the second band's amber. So the assertion is not "everything differs" — that
   * would be false of the shipped design — but **the partition is the same**: equal in dark if and
   * only if equal in light. That catches both directions of the failure, a light palette that
   * merges two claims the dark one keeps apart, and one that splits a pair the design ties
   * together.
   */
  it('repeats the dark palette’s collisions exactly, and invents none of its own', () => {
    const dark = valuesOf(DARK_PALETTE);
    const light = valuesOf(tokens.LIGHT_PALETTE);
    expect([...light.keys()].sort()).toEqual([...dark.keys()].sort());

    const disagreements: string[] = [];
    const fields = [...dark.keys()].sort();
    for (const [index, a] of fields.entries()) {
      for (const b of fields.slice(index + 1)) {
        const sameInDark = dark.get(a) === dark.get(b);
        const sameInLight = light.get(a) === light.get(b);
        if (sameInDark === sameInLight) continue;
        disagreements.push(
          sameInDark
            ? `${a} and ${b} are one colour in dark and two in light`
            : `${a} and ${b} are two colours in dark and one in light (${light.get(a) ?? ''})`,
        );
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('positive control: the pairing really is checked — the dark palette does collide', () => {
    // If the dark palette had no collisions the assertion above would degenerate into "all
    // distinct", which is a different and weaker claim than the one its name makes. It has six
    // classes with more than one member, each argued at its constant.
    const dark = valuesOf(DARK_PALETTE);
    expect(dark.get('carLight')).toBe(dark.get('bandSettling'));
    expect(dark.get('carMid')).toBe(dark.get('accent'));
    expect(dark.get('alarm')).toBe(dark.get('bandAbandoned'));
    expect(dark.get('warning')).toBe(dark.get('bandWaiting'));
    expect(dark.get('waitingDown')).toBe(dark.get('carDown'));
    expect(new Set(dark.values()).size).toBeLessThan(dark.size);
  });

  it('moves every colour, so the stage cannot half-repaint', () => {
    // The `tokens` half of this was already asserted above for the twenty-seven shell properties.
    // This is the other thirty: a stage field left at its dark value is the gap this palette was
    // written to close, one constant at a time instead of all at once.
    const dark = valuesOf(DARK_PALETTE);
    const light = valuesOf(tokens.LIGHT_PALETTE);
    const shared = [...dark].filter(([field, value]) => light.get(field) === value).map(([f]) => f);
    expect(shared, 'these palette fields are the same colour in both modes').toEqual([]);
  });

  it('paints a stage whose fills share nothing with the dark one', () => {
    // The claim-level restatement: the projection through `themeFromPalette` preserves it, so a
    // fill-identified test written against one mode cannot match a mark drawn in the other.
    const collapse = (theme: Readonly<Record<string, unknown>>): ReadonlySet<string> => {
      const out = new Set<string>();
      const walk = (value: unknown): void => {
        if (typeof value === 'string') out.add(value);
        else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk);
      };
      walk(theme);
      return out;
    };
    const dark = collapse(themeFromPalette(DARK_PALETTE) as unknown as Record<string, unknown>);
    const light = collapse(
      themeFromPalette(tokens.LIGHT_PALETTE) as unknown as Record<string, unknown>,
    );
    expect([...dark].filter((colour) => light.has(colour))).toEqual([]);
    expect(dark.size).toBeGreaterThan(30);
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
 * Structure — rules, hairlines, the dotted underline under a term.
 *
 * Excluded from the floor with a reason rather than left out, and the reason has to be *true of
 * the token*, which is the half this list got wrong. `--faint` sat here on `render/tokens.ts`'s
 * argument that *"the label gutter is scenery and an eyebrow is content"* — and `--faint` is the
 * ink of sixteen text rules in `index.html`, so it was content wearing scenery's exemption. It is
 * in {@link CONTENT_ON_PANEL} now and it was raised to survive being there (§ D235).
 *
 * `--fainter` stays, and its exemption is now checkable rather than asserted: **nothing draws
 * it.** No rule in `index.html` names it and no function in `render/` reads `Theme.fainter`. A
 * colour that carries no word has no legibility to fail.
 */
const SCENERY = ['--hairline', '--edge', '--edge-mid', '--edge-strong', '--hint-underline', '--fainter'];

/** Everything that carries a word or a number, and the surface it is drawn on. */
const CONTENT_ON_PANEL = [
  '--text',
  '--dim',
  '--dimmer',
  '--faint',
  '--accent',
  '--accent-soft',
  '--band-0',
  '--band-1',
  '--band-2',
  '--band-3',
  // § D236 — the stage key's three swatches. Content rather than scenery: each is a mark in a
  // legend that a reader matches against the picture, so it has to be visible on the card it is
  // drawn on. The light mode's `--car-heavy` is the tightest at 4.50:1 on `--panel`.
  '--car-heavy',
  '--waiting-up',
  '--waiting-down',
  '--over',
  '--transfer',
  '--entrance',
  '--secure',
  '--measured',
];

/** Drawn *on* the accent fill, so it is measured against the accent and not against the page. */
const CONTENT_ON_ACCENT = ['--accent-ink'];

const FLOOR = 4;

/**
 * The four greys that carry prose, in ladder order — `--text` down to `--faint`.
 *
 * Separated from {@link CONTENT_ON_PANEL} because they are the group with a *standard* attached
 * rather than a no-regression bound: every one of them is drawn as body text at 9–13 px on at
 * least one surface, so WCAG 2.2 AA's 4.5:1 applies to all four with no large-text carve-out
 * available. The hue tokens below them — the four bands, `--over`, `--transfer`, `--entrance`,
 * `--secure`, `--measured` — stay on `FLOOR`, because § 1.1 S7 is canonical for the band ladder
 * and because none of them is ever the only signal (KB-15).
 */
const INK_LADDER = ['--text', '--dim', '--dimmer', '--faint'];

/** WCAG 2.2 AA, 1.4.3 Contrast (Minimum), for text below 18.66 px bold / 24 px. */
const AA_BODY = 4.5;

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

  it(`holds the ink ladder to WCAG 2.2 AA (${String(AA_BODY)}:1) on every surface, in both modes`, () => {
    /*
     * § D235. `FLOOR` above is a *no-regression* bound measured against one surface; this is a
     * standard, measured against all five — because a token is drawn on whichever surface the
     * rule that names it happens to land on, and the incumbent failure was found on `--panel`
     * (2.60:1) and was worse on `--raised` (2.31:1), which no one-surface check would have seen.
     *
     * Both directions of *worst surface* are covered by iterating rather than by naming one: in
     * dark the worst ground for pale ink is the lightest surface, `--raised`; in light the worst
     * ground for dark ink is the darkest, `--bg`. A test that picked a surface would have to know
     * which mode it was in, and would be wrong the day a sixth surface landed.
     */
    for (const name of ['dark', 'light'] as const) {
      const tokens = tokensOf(name);
      for (const token of INK_LADDER) {
        for (const surface of SURFACES) {
          const ratio = contrast(tokens[token] as string, tokens[surface] as string);
          expect(ratio, `${name} ${token} on ${surface}`).toBeGreaterThanOrEqual(AA_BODY);
        }
      }
    }
  });

  it('keeps the ink ladder a ladder: four distinct rungs, in order, in both modes', () => {
    /*
     * The other half of § D235, and the one a contrast floor alone would let through: four greys
     * that all cleared 4.5:1 and were indistinguishable from each other would satisfy the test
     * above and would delete the hierarchy the handoff's § 1.1 S8 is built on. So the rungs are
     * required to be strictly ordered against a *fixed* ground, and to differ by a real step.
     *
     * `--bg` is the ground for both modes here, not because it is the worst — it is the worst in
     * light and the best in dark — but because ordering is a property of the ink, and measuring
     * every rung against one surface is what makes the comparison mean anything.
     */
    for (const name of ['dark', 'light'] as const) {
      const tokens = tokensOf(name);
      const rungs = INK_LADDER.map((token) => contrast(tokens[token] as string, tokens['--bg'] as string));
      expect(new Set(INK_LADDER.map((token) => tokens[token])).size, `${name} rungs are distinct`).toBe(
        INK_LADDER.length,
      );
      for (let index = 1; index < rungs.length; index += 1) {
        const above = rungs[index - 1] as number;
        const here = rungs[index] as number;
        expect(here, `${name} ${INK_LADDER[index] ?? ''} is quieter than the rung above it`).toBeLessThan(
          above,
        );
        expect(
          above / here,
          `${name} ${INK_LADDER[index] ?? ''} is a visible step below the rung above it`,
        ).toBeGreaterThan(1.05);
      }
    }
  });

  it('reads the stage key on the ground the stage key is drawn on — § D236', () => {
    /*
     * The key lives in `.legend`, which sits on `.stagecol` — `--bg`, not `--panel`. That
     * distinction is not pedantry: it is how the light mode's `--waiting-up` shipped at 4.34:1
     * behind a green test. `CONTENT_ON_PANEL` above measures `--panel`, where the same value was
     * 4.83, and the `▲` a reader actually looks at is on `--bg`.
     *
     * Two thresholds, because the key has two kinds of mark. The direction arrows are **text** at
     * 10.5 px, so 4.5:1. The four car swatches are **UI components** — 1.4.11's 3:1 — and they
     * carry a `--edge-strong` hairline besides, so a fill close to its ground still reads as a
     * square.
     */
    for (const name of ['dark', 'light'] as const) {
      const tokens = tokensOf(name);
      const ground = tokens['--bg'] as string;
      for (const arrow of ['--waiting-up', '--waiting-down']) {
        expect(contrast(tokens[arrow] as string, ground), `${name} ${arrow} on --bg`).toBeGreaterThanOrEqual(
          AA_BODY,
        );
      }
      for (const fill of ['--band-0', '--accent', '--car-heavy', '--band-3']) {
        expect(contrast(tokens[fill] as string, ground), `${name} ${fill} swatch on --bg`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('reads the occupant count on every car, in both modes', () => {
    /*
     * The one arithmetic claim `render/tokens.ts` makes about the *stage* rather than the shell,
     * and therefore the one that has to be checked rather than believed: a single label colour is
     * drawn inside four differently loaded cars, so it is legible on all four or on none.
     *
     * It is the claim most likely to be got wrong by a light palette, because it is the one that
     * **inverts** — near-black ink on four bright cars in dark, near-white ink on four dark ones
     * here — and a mode that carried the dark label across would fail here rather than in a
     * browser this repository does not have. The label is translucent, so it is composited over
     * the fill first; the floor is 3:1, the bound for a large glyph, and it is a no-regression
     * bound like `FLOOR` above rather than a verdict.
     */
    const composite = (ink: string, over: string): string => {
      const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(ink);
      if (rgba === null) return ink;
      const alpha = Number(rgba[4] ?? '1');
      const base = [1, 3, 5].map((offset) => parseInt(over.slice(offset, offset + 2), 16));
      const mixed = [1, 2, 3].map((channel, index) =>
        Math.round(Number(rgba[channel]) * alpha + (base[index] ?? 0) * (1 - alpha)),
      );
      return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    };

    for (const [name, palette] of [
      ['dark', DARK_PALETTE],
      ['light', tokens.LIGHT_PALETTE],
    ] as const) {
      const label = palette.carOccupantText;
      for (const fill of [
        palette.carLight,
        palette.carMid,
        palette.carHeavy,
        palette.carOverload,
      ]) {
        expect(contrast(composite(label, fill), fill), `${name} label on ${fill}`).toBeGreaterThan(
          3,
        );
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

  it('resolves the stage from the same palette as the shell, through the one projection', () => {
    // The half that did not exist: a resolved theme now carries what the *canvas* draws with, and
    // it is `themeFromPalette` of the same palette the tokens came from — not a second table, and
    // not `DEFAULT_THEME` with a light page bolted onto it. Asserted by identity of value against
    // the shipped projection, so a resolver that assembled its own stage would be red here.
    expect(themeFor('dark', NEVER_ASKED).stage).toEqual(themeFromPalette(DARK_PALETTE));
    expect(themeFor('light', NEVER_ASKED).stage).toEqual(themeFromPalette(tokens.LIGHT_PALETTE));
    expect(themeFor('system', answering(true)).stage).toEqual(themeFor('dark', NEVER_ASKED).stage);
    expect(themeFor('system', answering(false)).stage).toEqual(themeFor('light', NEVER_ASKED).stage);
  });

  it('never hands out a light shell around a dark stage', () => {
    // The gap this feature closed, as a property rather than as a docstring: the two halves of a
    // resolved theme are read by two different surfaces, and nothing but this stops one of them
    // being resolved for the other mode. `--bg` and the stage's background are the same claim in
    // two vocabularies, so they are the pair to check.
    for (const choice of ['system', 'dark', 'light'] as const) {
      for (const prefersDark of [true, false]) {
        const resolved = themeFor(choice, answering(prefersDark));
        expect(resolved.stage.background, `${choice}/${String(prefersDark)}`).toBe(
          resolved.tokens['--bg'],
        );
        expect(resolved.stage.panel).toBe(resolved.tokens['--panel']);
        expect(resolved.stage.queueBands.settling).toBe(resolved.tokens['--band-0']);
        expect(resolved.stage.text).toBe(resolved.tokens['--text']);
      }
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
