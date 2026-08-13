/**
 * Fix-a-building's chrome, driven — `docs/20` defect 16's two observable halves.
 *
 * ## Why these are browser cases
 *
 * The repair rows are buttons `mountFixitPanel` builds and the overlay is appended to
 * `document.body`; no node test in this package can see either (`boundaries.test.ts` keeps jsdom
 * out), and both findings are about what a reader perceives: a toggle whose only state signal was
 * a background colour, and a dark room inside a light product. The third half of the defect — the
 * FIXED badge surviving a failing run — is a pure rule and is driven in `fixit/engine.test.ts`
 * (`fixedBadgeAfter`), with the panel's assignment pinned at the source there; a browser replay of
 * it would cost four simulations to re-prove a one-line pure function.
 *
 * § D220 § 4 holds: no metric. Nothing here runs a day; the cases read pressed-state, a glyph,
 * and two computed background colours.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import {
  CHROMIUM,
  HAS_BROWSER,
  enterEngineerStage,
  pressMenuRow,
  reopenEngineerMenu,
} from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of this file's own, `strictPort: false` — the tier's convention (see noteContrast).
    server: { port: 5198, strictPort: false },
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

/** A page with the Fix-a-building overlay open on its first case, reached the player's way. */
async function fixitPage(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  await enterEngineerStage(page);
  await reopenEngineerMenu(page);
  await pressMenuRow(page, 'main.campaign');
  await pressMenuRow(page, 'campaign.fixit');
  // The case file is fetched on first open; a repair row existing is the honest "loaded" latch.
  await page.waitForSelector('.fixit-repair', { timeout: 30_000 });
  return page;
}

describe.skipIf(!HAS_BROWSER)('Fix-a-building’s chrome — docs/20 defect 16', () => {
  it('repair rows are toggles that say so: aria-pressed both ways, and a visible tick', async () => {
    const page = await fixitPage();
    const row = page.locator('.fixit-repair:not([disabled])').first();
    expect(await row.getAttribute('aria-pressed')).toBe('false');
    const name = (await row.textContent()) ?? '';
    expect(name.includes('✓'), 'an unselected row must not wear the tick').toBe(false);

    await row.click();
    await page.waitForTimeout(200);
    // The panel re-renders whole, so the row is re-located rather than held.
    const pressed = page.locator('.fixit-repair[aria-pressed="true"]');
    expect(await pressed.count(), 'the pressed state must be on the row that was pressed').toBe(1);
    expect(((await pressed.first().textContent()) ?? '').includes('✓')).toBe(true);

    // And back: a toggle that can only be told "on" is a latch wearing a toggle's contract.
    await pressed.first().click();
    await page.waitForTimeout(200);
    expect(await page.locator('.fixit-repair[aria-pressed="true"]').count()).toBe(0);
  });

  it('wears the product’s own palette, not a room of its own', async () => {
    const page = await fixitPage();
    const grounds = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('.fixit-overlay');
      return {
        overlay: overlay === null ? '' : getComputedStyle(overlay).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
      };
    });
    /*
     * The body paints `var(--bg)`, which is `applyTheme`'s write — so equality here means the
     * overlay follows the same theme switch every other surface follows, in whichever theme the
     * page is in. The old panel's own `#141a21` fails this in both themes.
     */
    expect(grounds.overlay).toBe(grounds.body);
    expect(grounds.overlay).not.toBe('');
  });
});
