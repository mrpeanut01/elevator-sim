/**
 * **The board screen, driven on the page** — the three things a node test cannot vouch for:
 *
 * 1. That the rail's `Boards & ladder` row actually opens something. The screen is registered in
 *    `screens.ts`, and a registered key that mounted nothing would still pass every pure test in
 *    `everyday/` — this is the one tier where the row is pressed.
 * 2. That the screen loads `data/proof-cases.json` through the real fetch path. `dev/data.ts`'s
 *    loaders are the only route, and `vite.config.ts`'s `WEB_DATA_FILES` is a hand-kept list: a
 *    missing entry 404s exactly one screen, which is that list's intended failure and is invisible
 *    to Node.
 * 3. That § 20.10's gate is drawn as a **control with a sentence** rather than a greyed button.
 *
 * The forty are deliberately **not** run here: § 1.4 puts a full simulation at 181 ms to 1 521 ms
 * and forty of them is minutes, which is not what a page test is for. What is asserted is that the
 * control refuses or offers, which is the check § 20.10 states.
 *
 * Pattern and gate are `settingsScreen.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5203, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A cold load with the Engineer menu dismissed, so `dev/main.ts`'s boot has published the host. */
async function openBoard(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.click('button:has-text("Boards & ladder")');
  /* The tabs appear only once `data/proof-cases.json` has loaded and parsed. */
  await page.waitForSelector('.everyday-board-tab-ladder', { timeout: 30_000 });
  return page;
}

describe.skipIf(!HAS_BROWSER)('the Everyday board and ladder screen', () => {
  it('opens on the ladder, which needs no server, and offers the gauntlet', async () => {
    const page = await openBoard();
    expect(await page.getAttribute('.everyday-board-tab-ladder', 'aria-pressed')).toBe('true');
    /* Nothing has been rated on a cold load, and the empty state says so rather than showing 0. */
    expect(await page.textContent('.everyday-ladder-empty')).toContain('gauntlet');
    expect(await page.textContent('.everyday-gauntlet-send')).toContain('gauntlet');
    /* Every rating here is local, and the sentence beside the table says which half is absent. */
    expect(await page.textContent('.everyday-ladder-world-absent')).toContain('needs a server');
    await page.close();
  }, 120_000);

  it('names the forty from the fixture list, buildings and shapes alike', async () => {
    const page = await openBoard();
    await page.click('.everyday-forty summary');
    const towers = await page.$$eval('.everyday-forty-tower', (nodes) => nodes.length);
    const crowds = await page.$$eval('.everyday-forty-crowd', (nodes) => nodes.length);
    expect(towers).toBe(8);
    expect(crowds).toBe(5);
    expect(await page.textContent('.everyday-forty')).toContain(
      '8 buildings × 5 crowd shapes = 40 runs',
    );
    await page.close();
  }, 120_000);

  it('draws the daily board’s absence rather than rows it cannot verify', async () => {
    const page = await openBoard();
    await page.click('.everyday-board-tab-daily');
    const absence = await page.textContent('.everyday-board-absent');
    expect(absence).toContain('needs a server');
    /* § 12.2: a labelled unavailable state, and the screen is otherwise complete. */
    expect(await page.$('.everyday-ladder')).toBeNull();
    await page.close();
  }, 120_000);
});
