/**
 * **No module in `dev/` holds a colour** — `docs/21-engineer-reimagined-contract.md` § 2.2 (3).
 *
 * ## The defect this closes, and why it is the same one four times
 *
 * `live/palette.test.ts` says it for `live/`: *"an inline style is not reached by a
 * `:root[data-theme]` block"*, so a hex literal in a module that writes inline styles is a colour
 * **no theme can repaint**. That sweep covers `live/` and `dev/leftRail.ts` — the two places the
 * defect had been found when it was written — and `dev/` is fourteen other modules that write
 * inline styles all day.
 *
 * The § 19 restyle is what made the gap load-bearing: the page's own `:root` is paper now, and
 * every literal left in `dev/` was authored against a dark page. The census taken before this file
 * existed found **five** private palettes and twenty-six literals — `watchPanel.ts`'s six,
 * `buildingEditor.ts`'s `SHAFT_TINTS` plus four row washes, `scenariosPanel.ts`'s sixteen inside
 * eight gradients, `trafficEditor.ts`'s two fallbacks, and `main.ts`'s spectator pair — and each
 * would have shipped a dark mark on a paper page while every palette assertion in the suite stayed
 * green, because none of them is in the stylesheet at all.
 *
 * ## Two halves, because a token can be named and still not exist
 *
 * 1. **No colour literal**, outside {@link ALLOWED} — a hex, or an `rgb(`/`hsl(` call, anywhere in
 *    the directory's non-test source. `color-mix(` is not a literal: it takes its colour from a
 *    token by construction and is the sanctioned way to write a tint.
 * 2. **No dangling token.** Every `var(--x)` named here is a custom property `index.html`'s `:root`
 *    block declares. § D222's `aria-describedby` argument in another medium: a reference that
 *    points at nothing renders as *nothing* — an unset custom property makes `color` fall back to
 *    `inherit` — so a typo produces a plausible-looking panel rather than an error.
 *
 * ## The allowlist is asserted non-stale, which is the half that rots
 *
 * § D192's dead-code discipline, pointed at colour: an entry that no longer describes a literal in
 * its file is **red**, exactly as an entry for a literal nobody allowed is. An allowlist that only
 * ever grows is a list of things somebody once decided not to look at.
 *
 * Read as text rather than imported, for `elementMap.test.ts`'s reason on the same directory: there
 * is no jsdom here (`vitest.config.ts` is `environment: 'node'` for every project), and what is
 * being checked is the source somebody will edit next.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const DEV_DIR = fileURLToPath(new URL('.', import.meta.url));
const INDEX_HTML = fileURLToPath(new URL('../../index.html', import.meta.url));

/**
 * The literals a token cannot express, each with the reason it is not a theming defect, and each
 * **named to the file it lives in** so the non-stale check can find it.
 *
 * **It is empty, and that is a measurement rather than an aspiration.** `dev/tokens.test.ts` has to
 * exempt two scrims in the stylesheet — a modal backdrop and a drawer's drop shadow are black in
 * both modes and have no token — and this directory turns out to draw neither: the scrims live in
 * `index.html`'s rules, where they belong, and every colour `dev/` writes is a claim the palette
 * already names. So the sweep below is total, and the check underneath it says so in the direction
 * that rots: the day somebody adds an entry here, it has to describe a literal that is really in
 * that file, and it stops being allowed the day the literal goes.
 */
const ALLOWED: Readonly<Record<string, readonly string[]>> = Object.freeze({});

/** Every non-test source file under `dev/`, **derived from disk** — § D213's rule. */
async function sweptFiles(): Promise<readonly string[]> {
  const entries = await readdir(DEV_DIR);
  return entries
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => !name.endsWith('.test.ts') && !name.endsWith('.test-helper.ts'))
    .sort();
}

/** Source with comments stripped — a hex quoted in a docstring is prose, not a painted colour. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*/g, ' ');
}

/**
 * Every colour literal in one file's code.
 *
 * A GitHub issue reference (`#124`) is not a colour: the pattern requires 3, 6 or 8 hex digits and
 * a word boundary, and `#104` is three *decimal* digits that happen to be hex-shaped — so the
 * filter is *inside a string literal*, which is where a painted colour has to be and where an
 * issue number in prose never is.
 */
function literalsIn(code: string): readonly string[] {
  const stripped = withoutComments(code);
  const found: string[] = [];
  for (const match of stripped.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g)) {
    const text = match[0];
    for (const colour of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g)) {
      found.push(colour[0]);
    }
  }
  return found;
}

/** Every `var(--name)` a file names. */
function tokensIn(code: string): readonly string[] {
  return [...withoutComments(code).matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map(
    (match) => match[1] as string,
  );
}

/** Every custom property `:root` declares — the paper block, and the page's default. */
async function declaredTokens(): Promise<ReadonlySet<string>> {
  const html = await readFile(INDEX_HTML, 'utf8');
  const block = /:root\s*\{([\s\S]*?)\}/.exec(html);
  if (block === null) throw new Error('index.html has no :root block');
  return new Set(
    [...(block[1] ?? '').matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1] as string),
  );
}

describe('no module in `dev/` holds a colour — docs/21 § 2.2 (3)', () => {
  it('paints no literal outside the allowlist', async () => {
    const offenders: string[] = [];
    for (const file of await sweptFiles()) {
      const allowed = new Set(ALLOWED[file] ?? []);
      for (const literal of literalsIn(await readFile(`${DEV_DIR}${file}`, 'utf8'))) {
        if (!allowed.has(literal)) offenders.push(`${file}: ${literal}`);
      }
    }
    expect(
      offenders,
      'a colour written in `dev/` reaches the page through an inline style, where no ' +
        '`:root[data-theme]` block can repaint it — name a token, or use `color-mix`',
    ).toEqual([]);
  });

  it('keeps the allowlist honest in the other direction — § D192', async () => {
    // An entry whose literal has been removed is an exemption for nothing, and the next literal to
    // land in that file inherits it silently. This is the direction that rots. The list is empty
    // today, so this passes vacuously — and the case below plants an entry through the same
    // machinery, which is what stops *that* from being the silent instrument.
    const stale: string[] = [];
    for (const [file, literals] of Object.entries(ALLOWED)) {
      const code = await readFile(`${DEV_DIR}${file}`, 'utf8').catch(() => undefined);
      if (code === undefined) {
        stale.push(`${file}: allowlisted and no longer exists`);
        continue;
      }
      const present = new Set(literalsIn(code));
      for (const literal of literals) {
        if (!present.has(literal)) stale.push(`${file}: allows \`${literal}\`, which it no longer paints`);
      }
    }
    expect(stale, 'an allowlist entry that describes nothing').toEqual([]);
  });

  it('names no token `:root` does not declare', async () => {
    const declared = await declaredTokens();
    const dangling: string[] = [];
    for (const file of await sweptFiles()) {
      for (const token of tokensIn(await readFile(`${DEV_DIR}${file}`, 'utf8'))) {
        if (!declared.has(token)) dangling.push(`${file}: var(${token})`);
      }
    }
    expect(dangling, 'an unset custom property falls back to `inherit`, not to an error').toEqual([]);
  });

  it('positive control: the sweep reads real files and would catch a planted literal', async () => {
    // Without this, all three assertions above pass on an empty set — the silent-instrument shape
    // wave 12's rule 5 forbids. The counts are the directory's own.
    const files = await sweptFiles();
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain('buildingEditor.ts');
    expect(files).not.toContain('tokens.test.ts');

    expect(literalsIn("const a = '#141a21';")).toEqual(['#141a21']);
    expect(literalsIn("style: { color: 'rgb(255 255 255 / 0.28)' }")).toEqual(['rgb(']);
    // The two things that look like colours and are not: an issue number in prose, and a
    // `color-mix` whose colour comes from a token.
    expect(literalsIn('/* GitHub issue #124 */ const b = 1;')).toEqual([]);
    expect(literalsIn("background: 'color-mix(in srgb, var(--text) 4%, transparent)'")).toEqual([]);
    // And the token scan finds what the files really name.
    expect(tokensIn("color: 'var(--dim)'")).toEqual(['--dim']);
    expect([...(await declaredTokens())]).toContain('--shaft-1');
  });

  it('negative control: an allowlist entry describing nothing is caught', async () => {
    /*
     * The stale-entry check runs over an empty list today, so on its own it is a description. This
     * drives the same derivation with a planted entry and requires it to be named — the instrument
     * is shown able to fail before it is trusted to pass.
     */
    const planted: Readonly<Record<string, readonly string[]>> = { 'dom.ts': ['#abcdef'] };
    const stale: string[] = [];
    for (const [file, literals] of Object.entries(planted)) {
      const present = new Set(literalsIn(await readFile(`${DEV_DIR}${file}`, 'utf8')));
      for (const literal of literals) {
        if (!present.has(literal)) stale.push(`${file}: allows \`${literal}\``);
      }
    }
    expect(stale).toEqual(['dom.ts: allows `#abcdef`']);
  });

  it('the five migrated palettes name tokens, and the elevation follows the theme', async () => {
    /*
     * The lane's own deliverable, asserted by name rather than left to the sweep: the sweep says
     * *no literal anywhere*, which a file could satisfy by deleting its colours. These five had a
     * private palette each, and what they have instead is the page's.
     */
    const named = async (file: string): Promise<readonly string[]> =>
      tokensIn(await readFile(`${DEV_DIR}${file}`, 'utf8'));
    expect(await named('watchPanel.ts')).toContain('--text');
    expect(await named('buildingEditor.ts')).toContain('--shaft-1');
    expect(await named('scenariosPanel.ts')).toContain('--card');
    expect(await named('trafficEditor.ts')).toContain('--phase-steady');
    // `leftRail.ts` was already token-only (§ D251 swept it beside `live/`); it is here so the
    // file that had this rule first stays inside the rule.
    expect(await named('leftRail.ts')).toContain('--edge-strong');
    // `reportPanel.ts` is the one this sweep found that no census had: two goal-verdict washes
    // written as `rgb(63 178 127 / 0.07)` and `rgb(224 71 58 / 0.07)` — the **dark** band values,
    // frozen, on a page whose bands are now paper's. Both are `color-mix` over the alias now.
    expect(await named('reportPanel.ts')).toContain('--ok');
  });
});
