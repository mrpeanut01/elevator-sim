/**
 * **No module in `live/` holds a colour** — `DECISIONS.md` § D251.
 *
 * ## The defect this closes, and why four edits would not have closed it
 *
 * `index.html` declares the palette twice — `:root` and `:root[data-theme='light']` — and
 * `dev/tokens.test.ts` holds both blocks to `render/tokens.ts` in both directions, plus a scan
 * saying that no rule *below* the blocks paints a literal. All of that was green while **26 text
 * elements failed WCAG AA on a light page**, because the colours that painted them were never in
 * the stylesheet at all: `live/bands.ts`, `live/decisions.ts`, `live/timeline.ts` and
 * `live/honesty.ts` each held their own hexes, and `dev/leftRail.ts` and `dev/main.ts` write them
 * into inline `style="color:…"` attributes. **An inline style is not reached by a
 * `:root[data-theme]` block**, so no amount of palette work could repaint them.
 *
 * Rewriting those four files fixes today's page. This test is what stops the fifth copy, and it is
 * the reason the fix is described as *one source reachable by the theme* rather than as four
 * edits: `tokens.test.ts` guards the stylesheet's half of that sentence and nothing guarded this
 * half. `live/noMeans.test.ts` is the same instrument pointed at a different rule, and its
 * docstring makes the same argument about why a grep over a directory beats a promise in a
 * docstring.
 *
 * ## Two halves, because a token can be named and still not exist
 *
 * 1. **No colour literal.** A hex or an `rgb(`/`hsl(` call anywhere in the directory's source.
 * 2. **No dangling token.** Every `var(--x)` named here is a custom property `index.html`'s `:root`
 *    block declares. This is § D222's `aria-describedby` argument in another medium: a reference
 *    that points at nothing renders as *nothing* — an unset custom property makes `color` fall
 *    back to `inherit`, so a typo produces a plausible-looking rail rather than an error. An
 *    assertion rebuilt from the same constant would not see it; reading the page does.
 *
 * `dev/leftRail.ts` is swept alongside `live/`, because it is the file that puts these strings on
 * the page and it declares four `var(--…)` tokens of its own.
 *
 * Read as text rather than imported, for `elementMap.test.ts`'s reason on the same file: there is
 * no jsdom here (`vitest.config.ts` is `environment: 'node'` for every project), and the markup is
 * the contract.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const LIVE_DIR = fileURLToPath(new URL('.', import.meta.url));
const LEFT_RAIL = fileURLToPath(new URL('../dev/leftRail.ts', import.meta.url));

/**
 * Every non-test source file under `live/`, **derived from disk** plus the one renderer that
 * writes them.
 *
 * Derived rather than listed for § D213's reason, which this repository has been caught by five
 * times: a hand-written list stops tracking the directory it was built from, and the file somebody
 * adds next week is exactly the one that would carry the fifth copy.
 */
async function sweptFiles(): Promise<readonly string[]> {
  const entries = await readdir(LIVE_DIR);
  const live = entries
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => !name.endsWith('.test.ts') && !name.endsWith('.test-helper.ts'))
    .map((name) => `${LIVE_DIR}${name}`);
  return [...live, LEFT_RAIL].sort();
}

/** Source with block and line comments removed. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

/**
 * Colour literals in code — a hex string or a functional colour.
 *
 * Comments are stripped first, and that is not a convenience: `live/timeline.ts`'s own docstring
 * tabulates the handoff's six hex pairs while explaining what replaced them, and a check that
 * could be satisfied by rewording a docstring is not checking the code. `color-mix(` is not
 * matched — it takes its colour from a token by construction, which is the sanctioned way to write
 * a tint and is the phrasing `dev/tokens.test.ts` uses for the same allowance.
 */
function colourLiteralsIn(source: string): readonly string[] {
  const code = withoutComments(source);
  return [...code.matchAll(/'#[0-9a-fA-F]{3,8}'|"#[0-9a-fA-F]{3,8}"|\b(?:rgba?|hsla?)\(/g)].map(
    (match) => match[0],
  );
}

/**
 * Every `--name` inside a `var(--name…)` in the source, comments stripped.
 *
 * Stripped for {@link colourLiteralsIn}'s reason and for one of its own: `dev/leftRail.ts`'s token
 * docstring says *"`style.setProperty` takes `var(--x)` happily"*, and `--x` is not a property
 * anybody declares. A prose example is not a reference.
 */
function tokensNamedIn(source: string): readonly string[] {
  return [...withoutComments(source).matchAll(/var\((--[a-z0-9-]+)/g)].map(
    (match) => match[1] as string,
  );
}

/**
 * The text of `index.html`'s `:root` block, found the way the rest of the suite finds it.
 *
 * The same non-greedy regex `dev/tokens.test.ts` and `render/theme.test.ts` use — deliberately,
 * because the point of {@link rootTokens}'s companion assertion below is to keep *their* view of
 * the block honest as well as this one's.
 */
async function rootBlock(): Promise<string> {
  const html = await readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
  const block = /:root\s*\{([\s\S]*?)\}/.exec(html);
  if (block === null) throw new Error('index.html has no :root block');
  return block[1] ?? '';
}

/** Every `--name:` declared in `index.html`'s `:root` block, whatever its value. */
async function rootTokens(): Promise<ReadonlySet<string>> {
  return new Set(
    [...(await rootBlock()).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1] as string),
  );
}

async function read(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

describe('the wait bands, the decision rows and the phase strip name one palette — § D251', () => {
  it('holds no colour literal anywhere in `live/`, nor in the rail that draws it', async () => {
    const offenders: string[] = [];
    for (const path of await sweptFiles()) {
      const found = colourLiteralsIn(await read(path));
      if (found.length > 0) offenders.push(`${path.split('/').slice(-2).join('/')}: ${found.join(', ')}`);
    }
    expect(
      offenders,
      'a colour written here cannot be themed — name a token, or use `color-mix` over one',
    ).toEqual([]);
  });

  it('names only custom properties the page declares', async () => {
    const declared = await rootTokens();
    const dangling: string[] = [];
    for (const path of await sweptFiles()) {
      for (const token of tokensNamedIn(await read(path))) {
        if (!declared.has(token)) dangling.push(`${path.split('/').pop() ?? path}: ${token}`);
      }
    }
    expect(dangling, 'an undeclared custom property renders as no colour at all').toEqual([]);
  });

  it('negative control: the scan reads the code and not only the file list', async () => {
    /*
     * A regex that matched nothing would pass both assertions above in silence, and a comment
     * stripper that ate the whole file would too. So: a planted literal is found, the handoff
     * hexes still quoted in `live/timeline.ts`'s docstring are **not**, and the sweep is over more
     * than one file and does find tokens.
     */
    expect(colourLiteralsIn("const c = '#3fb27f';")).toEqual(["'#3fb27f'"]);
    expect(colourLiteralsIn('const c = "rgba(1,2,3,.5)";')).toEqual(['rgba(']);
    expect(colourLiteralsIn('/* the design drew #2a2033 here */ const c = TOKEN;')).toEqual([]);
    expect(colourLiteralsIn("const c = 'color-mix(in srgb, var(--band-0) 14%, transparent)';")).toEqual(
      [],
    );
    expect(tokensNamedIn('var(--band-0) var(--nope)')).toEqual(['--band-0', '--nope']);
    expect((await sweptFiles()).length).toBeGreaterThan(4);
    expect(await rootTokens()).toContain('--band-0');
  });

  it('reads the `:root` block to its end, so a brace in a comment cannot shorten the palette', async () => {
    /*
     * Found rather than reasoned about, and it cost half an hour: the comment introducing
     * `--phase-*` first read *"six `{ bg, fg }` hex pairs"*, and `/:root\s*\{([\s\S]*?)\}/` stops
     * at the first `}` — so the block three test files thought they were reading ended inside a
     * comment, and every token below it stopped existing as far as they were concerned. Nothing
     * went red: `dev/tokens.test.ts` and `render/theme.test.ts` both only ever *look up* names,
     * and a name that is silently absent is a check that silently passes.
     *
     * `--rail-right` is the block's last declaration, so requiring it is requiring the match to
     * reach the closing brace. The two shapes below are the ways a brace gets written by accident.
     */
    expect(await rootTokens(), 'the `:root` match stops before the end of the block').toContain(
      '--rail-right',
    );
    const block = await rootBlock();
    expect(block).not.toMatch(/\/\*[^*]*[{}]/);
    expect(block.split('{').length, 'an unbalanced brace inside `:root`').toBe(1);
  });

  it('every phase-strip token the page declares is one the strip actually names', async () => {
    /*
     * The other direction, and the one that rots quietly — § D213's rule, and the same shape as
     * `dev/tokens.test.ts`'s orphan check on the light block. `--phase-*` exists for exactly one
     * consumer, so a property left behind after `live/timeline.ts` stopped naming it is a colour
     * the page keeps declaring and nothing decides.
     */
    const declared = [...(await rootTokens())].filter((name) => name.startsWith('--phase-'));
    expect(declared.length).toBeGreaterThan(0);
    const named = new Set(tokensNamedIn(await read(`${LIVE_DIR}timeline.ts`)));
    expect(declared.filter((name) => !named.has(name))).toEqual([]);
  });
});
