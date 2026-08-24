/**
 * **The restyled Engineer shell, driven — and every § 1 carrier still on it.**
 * `docs/21-engineer-reimagined-contract.md` § 5's B1 liveness evidence.
 *
 * ## What this tier can see that no other tier can
 *
 * The restyle's whole claim is § D299's: *a change to Engineer may make it easier to use; it may
 * not make it say less.* The node tier proves the palette is **declared** correctly —
 * `dev/tokens.test.ts` pins both blocks, `render/theme.test.ts` holds every token to its floor,
 * `dev/paletteLiterals.test.ts` says no module paints a colour of its own. All of that can be
 * perfectly green while the page a player opens is still dark, and this repository has shipped
 * exactly that: § D235's *"the light block was complete and correct and forty-eight elements stayed
 * dark anyway"*. So this file reads the **resolved** page — `getComputedStyle`, real cascade, real
 * mounts — and asks two questions a static sweep cannot:
 *
 * 1. **Did the paper palette actually land on the shell?** The page's own `:root` is § 19's now,
 *    and `dev/main.ts#applyTheme` writes the resolved tokens over it on boot. A regression in that
 *    write is a page that is paper in the stylesheet and something else in the browser.
 * 2. **Is every § 1.2 carrier still drawn?** Not *does the module still export it* — whether the
 *    words are on the screen after the surface was restyled around them.
 *
 * ## Reached through the player's own path
 *
 * `enterEngineerStage` presses the rail's *Switch to Engineer* row, which is what a player presses.
 * The cover is never taken off by hand: a helper that dismantled the front door would let this case
 * pass against a surface nobody can open, which is the defect class this repository counts.
 *
 * It named the *Today's tower* tile until the swap row was built — § D335 shipped the stage as a
 * hand-off through that tile, and § 7's stage screen retired it. The helper's own docstring carries
 * the whole history; the point that does not move is that this file presses whatever the product's
 * door currently is.
 *
 * ## Midtown Office, seed 42
 *
 * The building the contract's B1 entry names, at the seed it names, reached by deep link so the run
 * under the assertions is the same one on every machine. Nothing here reads a **metric** — § D220
 * § 4's rule, and § 1's ledger is about carriers rather than values: what is asserted is that the
 * seed is on screen and copyable (R7), that the figure grid drew figures, and that the refusal
 * vocabulary is intact. A case that asserted *what* the run measured would go red on a fixture
 * change and say nothing about the restyle.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, enterEngineerStage } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { port: 5207, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  origin = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
  if (origin === '') throw new Error('the dev server did not report a URL');
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Midtown Office at seed 42, on the Engineer stage, reached the way a player reaches it.
 *
 * The viewport is a parameter because the right rail is not a column at every width: § 1.1 S5 turns
 * it into an overlay drawer below 1340 px, so the rail's own segment strip — where the building
 * editor lives — is present and **not visible** at 1280. A case that needs the elevation asks for a
 * width where the rail is a rail, rather than driving the drawer open to prove a point about
 * colour.
 */
async function midtownSeed42(width = 1280, height = 800): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${origin}?building=midtown-office&seed=42`, { waitUntil: 'load' });
  await enterEngineerStage(page);
  return page;
}


describe.skipIf(!HAS_BROWSER)('the Engineer shell is paper, and still says everything', () => {
  it('resolves guide § 19’s paper palette on the page a player opens', async () => {
    const page = await midtownSeed42();
    try {
      const resolved = await page.evaluate(() => {
        const toHex = (value: string): string => {
          const parts = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
          return parts === null
            ? value
            : `#${[1, 2, 3]
                .map((index) => Number(parts[index]).toString(16).padStart(2, '0'))
                .join('')}`;
        };
        const style = getComputedStyle(document.documentElement);
        const at = (name: string): string => style.getPropertyValue(name).trim().toLowerCase();
        const body = getComputedStyle(document.body);
        return {
          page: at('--panel'),
          ground: at('--bg'),
          ink: at('--text'),
          accent: at('--accent'),
          shaft: at('--shaft-1'),
          scheme: style.colorScheme,
          bodyBackground: toHex(body.backgroundColor),
          bodyColor: toHex(body.color),
        };
      });
      /*
       * § 19's own values, read off the resolved root rather than off the file the sweep reads.
       * `--panel` is the block's *"page, cards"* paper, `--text` its ink, `--bg` the sunk card the
       * surface ladder starts on.
       */
      expect(resolved).toMatchObject({
        page: '#f7f2e8',
        ground: '#f2eadb',
        ink: '#23201c',
        accent: '#8d6a2f',
        shaft: '#96681a',
        scheme: 'light',
      });
      // And the body really draws them — the half a token assertion cannot reach.
      expect(resolved.bodyBackground).toBe('#f2eadb');
      expect(resolved.bodyColor).toBe('#23201c');
    } finally {
      await page.close();
    }
  });

  it('paints no element in a colour the palette does not own', async () => {
    const page = await midtownSeed42();
    try {
      /*
       * § D235's defect as a player meets it: *"hard-coded dark colours survive the token switch"*.
       * `paletteLiterals.test.ts` proves no module in `dev/` **holds** a literal; this proves the
       * page does not **draw** one, which is the claim that actually matters and the one that
       * caught forty-eight elements last time. Every resolved ink and every resolved background on
       * the stage is required to be a colour some custom property resolves to.
       */
      const { found: strays, swept } = await page.evaluate(() => {
        const toHex = (value: string): string => {
          const parts = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
          return parts === null
            ? value
            : `#${[1, 2, 3]
                .map((index) => Number(parts[index]).toString(16).padStart(2, '0'))
                .join('')}`;
        };
        const style = getComputedStyle(document.documentElement);
        const palette = new Set<string>();
        for (const name of Array.from(style)) {
          if (!name.startsWith('--')) continue;
          const value = style.getPropertyValue(name).trim().toLowerCase();
          if (/^#[0-9a-f]{6}$/.test(value)) palette.add(value);
        }
        const found: string[] = [];
        let swept = 0;
        for (const node of document.querySelectorAll('.shell *')) {
          const box = node.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          swept += 1;
          const ink = toHex(getComputedStyle(node).color);
          if (/^#[0-9a-f]{6}$/.test(ink) && !palette.has(ink)) {
            found.push(`${node.tagName}#${node.id} ${String(node.className)} color ${ink}`);
          }
        }
        return { found: found.slice(0, 12), swept };
      });
      expect(strays).toEqual([]);
      // The positive control: the sweep reaches the shell and would name something if it found it.
      expect(swept).toBeGreaterThan(100);
    } finally {
      await page.close();
    }
  });

  it('keeps every § 1.2 carrier on the restyled shell', async () => {
    const page = await midtownSeed42();
    try {
      /*
       * The ledger, read off the page. Each entry is a **carrier** from `docs/21` § 1.2 — the shell
       * and provenance line, the left rail's mood and honesty cards, the right rail's three plates,
       * the stage and its key, the transport. A row with no carrier fails the lane, so a row that
       * cannot be found here is the lane's own acceptance failing rather than a flaky selector.
       */
      const ledger = await page.evaluate(() => {
        const text = (selector: string): string | null =>
          document.querySelector(selector)?.textContent?.trim() ?? null;
        const seed = document.querySelector('#seed');
        return {
          // Shell & provenance. R7's carrier is `#seed-line` — the seed on screen, in words —
          // and the entry beside it is `#seed`, whose *absent* `maxlength` is § D198's carrier.
          seedLine: text('#seed-line'),
          seedEntries: document.querySelectorAll('#seed').length,
          seedHasNoMaxLength: seed === null ? null : seed.getAttribute('maxlength') === null,
          // The provenance row's verbs — the replay and save affordances, drawn beside the seed.
          provenanceVerbs: text('.provenance')?.replace(/\s+/g, ' ') ?? null,
          // Left rail — the mood card's four bands with their counts, and the honesty card.
          moodFaces: document.querySelectorAll('.mood-face').length,
          moodLegendRows: document.querySelectorAll('.mood-legend > div').length,
          honestyCards: document.querySelectorAll('.honesty').length,
          // The figure grid drew figures, each with its non-optional note (L-6, R13's carrier).
          figures: document.querySelectorAll('.figure').length,
          figureNotes: document.querySelectorAll('.figure-note').length,
          // Right rail — the plates. Every row is a key and a value, never a bare number.
          plates: document.querySelectorAll('.plate').length,
          plateRows: document.querySelectorAll('.plate-row').length,
          // The stage, its wait-age legend and § D236's key — the swatches and their glyphs.
          stages: document.querySelectorAll('#stage').length,
          legendEntries: document.querySelectorAll('.legend-entry').length,
          legendSwatches: document.querySelectorAll('.legend-swatch').length,
          legendGlyphs: document.querySelectorAll('.legend-glyph').length,
          // The transport and its phase strip — `live/timeline.ts`'s tokens, drawn.
          phaseSegments: document.querySelectorAll('.phase-seg').length,
          // The tab strip — every retained surface is still a peer in the tablist.
          tabs: document.querySelectorAll('[role="tab"]').length,
        };
      });

      /*
       * R7 — *the seed stays visible and copyable in every mode*. It is visible in `#seed-line`,
       * which prints the seed the run was made with, and the deep link put 42 there. The
       * reproduction line (`provenanceLineOf`'s `elevator-sim run …`) is **not** asserted here: it
       * is not drawn on the stage in this state, and a carrier assertion has to be about where the
       * carrier is rather than where it would be convenient.
       */
      expect(ledger.seedLine).toContain('seed 42');
      expect(ledger.seedEntries).toBe(1);
      // § D198: a paste must not truncate in silence, so the entry declares no `maxlength`.
      expect(ledger.seedHasNoMaxLength).toBe(true);
      expect(ledger.provenanceVerbs).toContain('Verify replay');
      expect(ledger.provenanceVerbs).toContain('Save recording');
      expect(ledger.moodFaces).toBe(1);
      // Four bands, each with its own count in the legend — `moodViewOf`'s carrier.
      expect(ledger.moodLegendRows).toBe(4);
      expect(ledger.honestyCards).toBe(1);
      expect(ledger.figures).toBeGreaterThan(0);
      // L-6 / KB-15: figures carry notes. Not one per figure — `FigureView.note` is non-optional
      // in the *view* and the renderer draws a `.figure-note` only where there is a sentence, so
      // what is asserted is that the notes are on the page, not a count this file would be
      // inventing. `reportPanel.test.ts` owns the per-figure claim.
      expect(ledger.figureNotes).toBeGreaterThan(0);
      expect(ledger.plates).toBeGreaterThan(0);
      expect(ledger.plateRows).toBeGreaterThan(0);
      expect(ledger.stages).toBe(1);
      expect(ledger.legendEntries).toBeGreaterThan(0);
      // The key's swatches each carry a glyph beside them — colour is never the only signal.
      expect(ledger.legendSwatches).toBeGreaterThan(0);
      expect(ledger.legendGlyphs).toBeGreaterThan(0);
      expect(ledger.phaseSegments).toBeGreaterThan(0);
      expect(ledger.tabs).toBeGreaterThan(5);
    } finally {
      await page.close();
    }
  });

  it('draws the elevation’s shaft tints from the theme, not from a frozen literal', async () => {
    // 1440 × 1000: wide enough that the right rail is a column and its segment strip is visible.
    const page = await midtownSeed42(1440, 1000);
    try {
      /*
       * The § D251 defect this lane closed, read at the pixel: `buildingEditor.ts` writes the tint
       * into an **inline style**, which no `:root[data-theme]` block reaches, so the six literals it
       * used to hold were colours no theme could repaint. The band's resolved border is now the
       * paper tint — which is only true if the token survived the trip through the inline style.
       */
      // Two tabs are named `Building` — the drawer's and the strip's — and one of them is
      // `hidden`. Clicking by name alone matches both and waits forever on the invisible one.
      await page.locator('[role="tab"]:not([hidden])', { hasText: /^Building$/ }).first().click();
      /*
       * Waited on by **count** rather than by `waitForSelector`, which waits for *visible*: a bank
       * whose band covers no floors at this building draws at zero height, and the first band in
       * the strip is one. A computed colour is readable either way, and what is under test is the
       * colour rather than the geometry.
       */
      await page.waitForFunction(() => document.querySelectorAll('.elev-band').length > 0, undefined, {
        timeout: 15_000,
      });
      const bands = await page.evaluate(() => {
        const toHex = (value: string): string => {
          const parts = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
          return parts === null
            ? value
            : `#${[1, 2, 3]
                .map((index) => Number(parts[index]).toString(16).padStart(2, '0'))
                .join('')}`;
        };
        const root = getComputedStyle(document.documentElement);
        const band = document.querySelector('.elev-band');
        const label = band?.querySelector('span, .elev-band-label') ?? null;
        return {
          tint: root.getPropertyValue('--shaft-1').trim().toLowerCase(),
          border: band === null ? null : toHex(getComputedStyle(band).borderTopColor),
          labelInk: label === null ? null : toHex(getComputedStyle(label).color),
        };
      });
      expect(bands.tint).toBe('#96681a');
      expect(bands.border).toBe('#96681a');
      expect(bands.labelInk).toBe('#96681a');
    } finally {
      await page.close();
    }
  });
});
