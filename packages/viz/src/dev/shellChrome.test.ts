/**
 * The two pieces of page chrome that are **markup rather than a mount** — § D236.
 *
 * `dev/surfaces.test.ts` established the idiom this file uses and says why: this repository has no
 * jsdom (`vitest.config.ts` is `environment: 'node'` for every project), so a claim about the page
 * is checked by reading `index.html` as text. That is a weaker tier than driving a browser and it
 * is the tier available; § 5 of `docs/16` is the ladder. Everything here is a *structural* claim —
 * which rule exists, which attribute is on which element, which string the key contains — and none
 * of it is a claim about how any of it looks. The looking was done by driving, and is reported in
 * § D236 rather than asserted here.
 *
 * ## Why two subjects in one file
 *
 * Both are the same kind of thing: static markup in `index.html` with no module behind it, which
 * is precisely the shape nothing else in the suite covers. `elementMap.test.ts` checks the ids the
 * viewer *resolves*; a block with no id and no mount is invisible to it. `tokens.test.ts` checks
 * the palette; a legend that spelled a colour correctly and named the wrong state would pass it.
 *
 * | subject | what a failure would mean |
 * |---|---|
 * | the header's responsive rules | a control is `display: none` at a width, and `display: none` is not a step-aside — it takes the element out of the tab order too |
 * | the stage key | the legend and the canvas disagree about what a mark means, which is worse than no legend |
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { doorGlyph, SERVICE_OFF_GLYPH, SERVICE_ON_GLYPH, WAITING_DOWN_GLYPH, WAITING_UP_GLYPH } from '../render/canvas.js';
import * as tokens from '../render/tokens.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

/**
 * The page, read once at module load.
 *
 * Top-level `await`, which this package's `module: nodenext` build supports and which keeps the
 * stage-key assertions below free of plumbing that says nothing about the subject. The header
 * block keeps `await indexHtml()` per test because that is the idiom every sibling in this
 * directory uses; both read the same bytes.
 */
const PAGE = await indexHtml();

/** The `<style>` block with its comments stripped — the rules, and only the rules. */
function stylesheet(html: string): string {
  const block = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (block === null) throw new Error('index.html has no <style> block');
  return (block[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** The markup, with its comments stripped — so a claim quoted in a comment does not satisfy one. */
function markup(html: string): string {
  const end = html.indexOf('</style>');
  if (end < 0) throw new Error('index.html has no <style> block');
  return html.slice(end).replace(/<!--[\s\S]*?-->/g, ' ');
}

/** The one element carrying `id="…"`, as its whole tag, so its attributes can be read. */
function tagWithId(html: string, id: string): string {
  const found = new RegExp(`<[a-z]+[^>]*\\bid=["']${id}["'][^>]*>`).exec(markup(html));
  if (found === null) throw new Error(`index.html has no element with id="${id}"`);
  return found[0];
}

/* -------------------------------------------------------------------------- *
 * 1 — the header, at a width narrower than the design was drawn for
 * -------------------------------------------------------------------------- */

describe('the header steps aside without deleting anything — issues #72 and #74', () => {
  it('wraps rather than relying on the clip', async () => {
    /*
     * Issue #74, measured on the deployed build at 375 × 812: `header.topbar` reported
     * `scrollWidth 516` against `clientWidth 375` with `overflow-x: hidden`, and
     * `document.scrollWidth === 375`. The 141 px past the right edge held the clock, `Day 1 ·
     * Monday` and the tenant count, and **no gesture reaches a clipped flex item** — it is not
     * scrolled off, it is gone.
     *
     * `flex-wrap: wrap` is the whole fix and it is the thing pinned here, on `.topbar` and on
     * `.topbar-right`, which is the nested row that holds the clock, the day and the mode select.
     */
    const rules = stylesheet(await indexHtml());
    const topbar = /\.topbar\s*\{([^}]*)\}/.exec(rules)?.[1] ?? '';
    const right = /\.topbar-right\s*\{([^}]*)\}/.exec(rules)?.[1] ?? '';
    expect(topbar, '.topbar must wrap').toMatch(/flex-wrap:\s*wrap/);
    expect(right, '.topbar-right must wrap').toMatch(/flex-wrap:\s*wrap/);
  });

  it('gives the three header groups a row each below 768 px', async () => {
    // RX-03's width. The same stylesheet-pin idiom `surfaces.test.ts` uses on the 767 px block for
    // the body: the block must exist and must carry the three rules that do the work.
    const rules = stylesheet(await indexHtml());
    const start = rules.indexOf('@media (max-width: 767px)');
    expect(start, 'no 767 px block').toBeGreaterThan(-1);
    // Every 767 px block in the file, concatenated — there is more than one, and the header's is
    // not required to be the first.
    const blocks = [...rules.matchAll(/@media \(max-width: 767px\)\s*\{([\s\S]*?)\n {6}\}/g)]
      .map((match) => match[1] ?? '')
      .join('\n');
    expect(blocks).toMatch(/\.topbar-building\s*\{[^}]*flex-basis:\s*100%/);
    expect(blocks).toMatch(/\.topbar-right\s*\{[^}]*flex-basis:\s*100%/);
  });

  it('keeps the mode select reachable at every width — the lockout, not the styling', async () => {
    /*
     * Issue #72, and it is the one that is not a styling nit. `[data-hide-narrow]` resolves to
     * `display: none !important` below 1180 px, which gives an element a zero-size box: the
     * `<select>` left the **tab order** as well as the screen. There is no other control anywhere
     * in the product that changes Casual/Engineer — not the main menu, not the Settings screen,
     * not a link a reader can reach from inside the app — so below 1180 px a reader was locked
     * into whatever `localStorage` last held.
     *
     * Both halves are asserted, because hiding the label alone would take the control's accessible
     * name and leave a nameless combobox behind.
     */
    const html = await indexHtml();
    expect(tagWithId(html, 'view-mode')).not.toContain('data-hide-narrow');
    const label = new RegExp('<label[^>]*for=["\']view-mode["\'][^>]*>').exec(markup(html))?.[0];
    expect(label, 'no <label for="view-mode">').toBeDefined();
    expect(label ?? '').not.toContain('data-hide-narrow');
  });

  it('keeps the traffic phase, and still steps the spec line aside', async () => {
    // § S5 steps *secondary text* aside, and the phase pill is not secondary — it is the only
    // statement on the screen of what the building is doing at the playhead. The spec line still
    // is, so the rule keeps a job and this is not a claim that S5 was wrong about everything.
    const html = await indexHtml();
    expect(tagWithId(html, 'phase-label')).not.toContain('data-hide-narrow');
    expect(tagWithId(html, 'building-sub')).toContain('data-hide-narrow');
    expect(stylesheet(html)).toMatch(/@media \(max-width: 1179px\)/);
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — the stage key, against what the stage actually draws
 * -------------------------------------------------------------------------- */

/** The stage key's markup: the `.legend-stage` block, and nothing else. */
function stageKey(html: string): string {
  const found = /<div class="legend legend-stage">([\s\S]*?)<\/div>\s*\n/.exec(markup(html));
  if (found === null) throw new Error('index.html has no `.legend-stage` block');
  return found[1] ?? '';
}

describe('the stage key says what the stage draws — issue #63', () => {
  it('names every colour a car body can be, from the renderer’s own constants', () => {
    /*
     * `render/overlay.ts#loadColour` picks one of four fills by load factor, and nothing on the
     * screen said so: a reporter sampling the canvas found five hues plus dimmed variants and,
     * after several simulated minutes, still *"could not tell you with confidence what
     * distinguishes a blue car from a dim blue one"*. Their guess was that brightness meant
     * idle-versus-committed. It does not — it means out of service, and the body colour means
     * load.
     *
     * The four are checked by **token name** rather than by hex, because the key is written in
     * `var(--…)` and `dev/tokens.test.ts` is what pins each name to its value. Between the two,
     * the swatch and the fill are the same colour in both modes by construction.
     */
    const key = stageKey(PAGE);
    for (const token of ['--band-0', '--accent', '--car-heavy', '--band-3']) {
      expect(key, `the key is missing the car fill ${token}`).toContain(`var(${token})`);
    }
    // The two direction hues, which the arrows *and* the landing marks both use.
    expect(key).toContain('var(--waiting-up)');
    expect(key).toContain('var(--waiting-down)');
  });

  it('carries every glyph the canvas draws beside a car', () => {
    // Derived from the renderer, not transcribed: `doorGlyph` is exhaustive over `DoorPhase`, so a
    // fifth phase would turn this red on the day it lands rather than the day somebody notices the
    // key is short one row.
    const key = stageKey(PAGE);
    for (const phase of ['closed', 'opening', 'open', 'closing'] as const) {
      expect(key, `the key is missing the door glyph for ${phase}`).toContain(doorGlyph(phase));
    }
    for (const glyph of [WAITING_UP_GLYPH, WAITING_DOWN_GLYPH, SERVICE_ON_GLYPH, SERVICE_OFF_GLYPH]) {
      expect(key, `the key is missing ${glyph}`).toContain(glyph);
    }
  });

  it('pairs every colour with a word — KB-15, in the one place a legend could break it', () => {
    /*
     * A key is the one component that can satisfy *"no colour-only signal"* by accident and fail
     * it in substance: a row of swatches with no words is a colour chart. Every `.legend-entry`
     * here must carry text of its own outside its swatch and its glyph, and the entry that keys
     * the dimming must say the word — the dimming is `globalAlpha`, which no swatch can show.
     */
    const key = stageKey(PAGE);
    const entries = [...key.matchAll(/<span class="legend-entry">([\s\S]*?)<\/span>\s*(?=<span class="legend-entry"|$)/g)];
    expect(entries.length).toBeGreaterThanOrEqual(12);
    for (const [, body = ''] of entries) {
      const words = body.replace(/<[^>]*>/g, ' ').replace(/[^a-z ]/gi, ' ').trim();
      expect(words, `an entry with no words: ${body}`).not.toBe('');
    }
    expect(key).toContain('dimmed');
  });

  it('spends no hue the stage does not draw', () => {
    // The reporter's other half — *"if a colour has no meaning worth explaining, consider not
    // spending a hue on it"*. Read the other way: the key may not invent one. Every `var(--…)` in
    // it has to be a colour `render/tokens.ts` gives the canvas.
    const key = stageKey(PAGE);
    const drawn = new Set([
      tokens.CAR_LIGHT,
      tokens.CAR_MID,
      tokens.CAR_HEAVY,
      tokens.CAR_OVERLOAD,
      tokens.WAITING_UP,
      tokens.WAITING_DOWN,
    ]);
    const byName: Readonly<Record<string, string>> = {
      '--band-0': tokens.BAND_SETTLING,
      '--accent': tokens.ACCENT,
      '--car-heavy': tokens.CAR_HEAVY,
      '--band-3': tokens.BAND_ABANDONED,
      '--waiting-up': tokens.WAITING_UP,
      '--waiting-down': tokens.WAITING_DOWN,
    };
    for (const [, name = ''] of key.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
      const value = byName[name];
      expect(value, `the key spends ${name}, which is not a stage colour`).toBeDefined();
      expect(drawn.has(value as string), `${name} is not drawn on the stage`).toBe(true);
    }
  });
});

