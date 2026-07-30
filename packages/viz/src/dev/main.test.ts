/**
 * The wait-age legend — § 1.3 M4.
 *
 * The legend was the plainest instance of this repository's standing defect: `live/bands.ts`
 * authored four `legendLabel` strings and four colours, `bands.test.ts` pinned them, and **no
 * non-test caller ever put them on a page**. `index.html` rendered the legend's title with nothing
 * under it, so the stage drew riders in four colours and the row that says what those colours mean
 * was empty. Configured, unit-tested in isolation, never called — the shape the roadmap's standing
 * requirement is written about.
 *
 * The fix has two halves and this file asserts both:
 *
 * 1. **The entries are derived.** `waitLegendEntries()` is `WAIT_BANDS` and nothing else, so a band
 *    whose colour or wording moves takes the legend with it. A hand-written copy in `main.ts` would
 *    typecheck, look identical today, and be a fifth copy of a palette whose whole purpose is that
 *    the rail, the canvas and the report cannot disagree about what amber means.
 * 2. **The markup carries no second copy.** `index.html`'s `#legend` holds its title and no
 *    entries. If somebody types the four dots back into the page, the derivation above becomes
 *    decorative and the two copies start drifting the same afternoon.
 *
 * The third assertion goes the other way — the four strings and the four hexes are checked against
 * the **vendored handoff**, which is canonical for what the screen says (`DECISIONS.md` § D174).
 * Deriving from `WAIT_BANDS` is only right if `WAIT_BANDS` is the handoff's, and nothing else in
 * the suite reads the prototype to say so.
 *
 * There is no jsdom here (`vitest.config.ts` is `environment: 'node'` for every project), so the
 * decision is the pure export and the DOM writing is decision-free — `dom.ts`'s pattern.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { WAIT_BANDS } from '../live/bands.js';

import { seekActionForKey, waitLegendEntries } from './main.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

/** The vendored design handoff. Read as text, never edited — `docs/12-design-handoff.md`. */
async function handoff(): Promise<string> {
  return readFile(
    fileURLToPath(new URL('../../../../docs/design/elevator-sim-reimagined.dc.html', import.meta.url)),
    'utf8',
  );
}

/** The `#legend` element's own markup, from its opening tag to the first `</div>` after it. */
async function legendMarkup(): Promise<string> {
  const html = await indexHtml();
  const start = html.indexOf('id="legend"');
  expect(start, 'index.html has no #legend').toBeGreaterThan(-1);
  const end = html.indexOf('</div>', start);
  expect(end, '#legend is never closed').toBeGreaterThan(start);
  return html.slice(start, end);
}

describe('the legend is the wait bands, not a copy of them', () => {
  it('takes every label and every colour from WAIT_BANDS, in the bands’ own order', () => {
    const entries = waitLegendEntries();
    expect(entries.map((entry) => entry.label)).toEqual(
      WAIT_BANDS.map((band) => band.legendLabel),
    );
    expect(entries.map((entry) => entry.color)).toEqual(WAIT_BANDS.map((band) => band.color));
  });

  it('has one entry per band and four distinct colours', () => {
    // Four keys and three colours would be a legend that cannot key anything, and the stage draws
    // all four. The distinctness is the property; the count 4 is `WAIT_BANDS`' to decide.
    const entries = waitLegendEntries();
    expect(entries).toHaveLength(WAIT_BANDS.length);
    expect(new Set(entries.map((entry) => entry.color)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.label)).size).toBe(entries.length);
  });

  it('says nothing WAIT_BANDS does not say — no label is invented here', () => {
    const known = new Set(WAIT_BANDS.map((band) => `${band.legendLabel}·${band.color}`));
    for (const entry of waitLegendEntries()) {
      expect(known.has(`${entry.label}·${entry.color}`), entry.label).toBe(true);
    }
  });
});

describe('index.html holds no second copy of the legend', () => {
  it('carries the title and no entries of its own', async () => {
    const markup = await legendMarkup();
    expect(markup).toContain('legend-title');
    // The handoff draws each key as a `●` in the band's colour. One in the markup means somebody
    // wrote the palette into the page beside the module that already owns it.
    expect(markup, '#legend must not hard-code a band key').not.toContain('●');
    for (const band of WAIT_BANDS) {
      expect(markup, `#legend must not spell "${band.legendLabel}"`).not.toContain(
        band.legendLabel,
      );
      expect(markup, `#legend must not spell ${band.color}`).not.toContain(band.color);
    }
  });

  it('gives the title a manifest id, so the fill re-appends it rather than restating it', async () => {
    // The four entries are derived; the title is design copy and stays in the markup. The shell
    // needs a handle to keep it, and `elementMap.ts` is where a handle is declared.
    const markup = await legendMarkup();
    expect(markup).toContain('id="legend-title"');
  });
});

describe('keyboard seeking — KX-10', () => {
  it('maps the arrows to ∓5 s, and to ∓60 s with Shift', () => {
    expect(seekActionForKey('ArrowLeft', false)).toStrictEqual({ kind: 'by', deltaS: -5 });
    expect(seekActionForKey('ArrowRight', false)).toStrictEqual({ kind: 'by', deltaS: 5 });
    expect(seekActionForKey('ArrowLeft', true)).toStrictEqual({ kind: 'by', deltaS: -60 });
    expect(seekActionForKey('ArrowRight', true)).toStrictEqual({ kind: 'by', deltaS: 60 });
  });

  it('sends Home and End to the run’s own ends', () => {
    expect(seekActionForKey('Home', false)).toStrictEqual({ kind: 'toStart' });
    expect(seekActionForKey('End', false)).toStrictEqual({ kind: 'toEnd' });
    // Shift changes the arrows' distance and nothing about the ends — there is only one start.
    expect(seekActionForKey('Home', true)).toStrictEqual({ kind: 'toStart' });
    expect(seekActionForKey('End', true)).toStrictEqual({ kind: 'toEnd' });
  });

  it('answers nothing for every key it does not own', () => {
    // The transport's other keys keep their own handlers; a seek answered for Space or Escape
    // would swallow play/pause and the drawer's dismissal.
    for (const key of [' ', ',', '.', '[', ']', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'a']) {
      expect(seekActionForKey(key, false)).toBeUndefined();
      expect(seekActionForKey(key, true)).toBeUndefined();
    }
  });
});

describe('the words and the colours are the handoff’s', () => {
  it('finds all four legend labels in the vendored prototype', async () => {
    // `:230–233`. The handoff wins every disagreement about what the screen says, so a label that
    // is not in it is one somebody wrote here.
    const design = await handoff();
    for (const band of WAIT_BANDS) {
      expect(design, `the handoff does not say "${band.legendLabel}"`).toContain(band.legendLabel);
    }
  });

  it('finds all four band colours in the vendored prototype', async () => {
    const design = await handoff();
    for (const band of WAIT_BANDS) {
      expect(design.toLowerCase(), `the handoff does not use ${band.color}`).toContain(
        band.color.toLowerCase(),
      );
    }
  });
});
