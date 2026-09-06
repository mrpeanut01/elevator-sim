/**
 * Endless rush, end to end, by the player's own route — GitHub issue #220, § D515.
 *
 * Menu tile → setup screen → *Start the rush* → the stage in the `rush` context, with held time and
 * a wave pill where a day has a clock and a phase → *End the rush* → the result, its own screen. Then
 * the way out: *Leave the rush* puts the player's parked week back, which the front door shows by
 * naming the same tower it named before.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, openEverydayDoor, openPage, startShippedSite, type ShippedSite } from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5233, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

describe.skipIf(!HAS_BROWSER)('Endless rush — GitHub issue #220', () => {
  it('starts from the setup screen, plays on a held-time stage, ends by hand on its own result, and leaves the week as it was', async () => {
    const page = await coldLoad();
    try {
      await page.locator('.everyday-mode[data-screen="rush"]').click();
      await page.waitForSelector('.everyday-rush-driving', { timeout: 15_000 });
      /* § D478 on the setup screen: the stream leaves this building's band, and the screen says so. */
      expect(await page.textContent('.everyday-rush-disclosure')).toContain('Busier than a building like this is sized for');
      const primary = page.locator('.everyday-bar-primary');
      expect(await primary.textContent()).toBe('Start the rush');
      expect(await primary.isDisabled()).toBe(false);
      await primary.click();

      /* The stage, in the rush context: the run lands from the worker, then the pill reads a wave. */
      await page.waitForSelector('.everyday-stage-phase', { timeout: 30_000 });
      await page.waitForFunction(
        () => /^WAVE \d+$/u.test(document.querySelector('.everyday-stage-phase')?.textContent ?? ''),
        undefined,
        { timeout: 60_000 },
      );
      const stage = await page.evaluate(() => ({
        clock: document.querySelector('.everyday-stage-clock')?.textContent ?? '',
        phase: document.querySelector('.everyday-stage-phase')?.textContent ?? '',
        figures: [...document.querySelectorAll('.everyday-stage-figure')].map((node) => node.textContent ?? ''),
        goalsShown: (document.querySelector<HTMLElement>('.everyday-stage-goals')?.style.display ?? '') !== 'none',
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
      }));
      expect(stage.clock).toMatch(/^\d+:\d\d$/u);
      expect(stage.phase).toBe('WAVE 1');
      expect(stage.figures.join(' ')).toContain('past two minutes, of 40');
      expect(stage.goalsShown).toBe(false);
      expect(stage.primary).toBe('End the rush');

      /* Ended by hand, early: its own result, the stopped branch, and no day report anywhere. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-rush-result', { timeout: 15_000 });
      const result = await page.evaluate(() => ({
        outcome: document.querySelector<HTMLElement>('.everyday-rush-result')?.dataset['outcome'] ?? '',
        head: document.querySelector('.everyday-rush-result-head')?.textContent ?? '',
        footer: document.querySelector('.everyday-rush-result-footer')?.textContent ?? '',
        figures: document.querySelectorAll('.everyday-rush-result-figure').length,
        daySheet: document.querySelectorAll('.everyday-report-title').length,
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
      }));
      expect(result.outcome).toBe('stopped');
      expect(result.head).toMatch(/^You stopped at wave \d+, still holding$/u);
      expect(result.footer).toContain('not posted');
      expect(result.figures).toBe(4);
      expect(result.daySheet).toBe(0);
      expect(result.primary).toBe('Run the rush again');

      /* The way out puts the parked week back: the door names the address's tower and crowd, not seed 90210. */
      await page.locator('.everyday-bar-wayout').click();
      await page.waitForSelector('.everyday-rush-driving', { timeout: 15_000 });
      await page.locator('.everyday-bar-leave').click();
      await page.waitForSelector('.everyday-mode[data-screen="door"]', { timeout: 15_000 });
      await openEverydayDoor(page);
      const seedLine = await page.textContent('.everyday-door-seed');
      expect(seedLine).toContain('tower garden-apartments');
      expect(seedLine).toContain('crowd 424242');
    } finally {
      await page.close();
    }
  }, 180_000);
});
