/**
 * § 6.1's replay, end to end, by the player's own route — GitHub issue #177 item 1, § D517.
 *
 * Day 1 is played and closed and tomorrow opened, so the strip has a past day to hand back. Then the
 * past chip → *Set up the replay* → the brief → the stage in the `replay` context, with `REPLAYING`
 * on the rail → *Close the day* → the report → *Front door*, and the door shows the week exactly as
 * it was: still on day 2, day 1's score untouched.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, openEverydayDoor, openPage } from '../dev/browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { port: 5234, strictPort: false },
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

/** Brief → stage → the run lands → *Close the day* → the report. The daily loop's middle, once. */
async function playAndClose(page: Page): Promise<void> {
  await page.locator('.everyday-bar-primary').click(); // Start the day
  await page.waitForSelector('.everyday-stage-phase', { timeout: 30_000 });
  await page.waitForFunction(
    () => (document.querySelector('.everyday-bar-primary') as HTMLButtonElement | null)?.disabled === false,
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('.everyday-bar-primary').click(); // Close the day
  await page.waitForSelector('.everyday-report-title', { timeout: 30_000 });
}

describe.skipIf(!HAS_BROWSER)('the replay — GitHub issue #177 item 1', () => {
  it('hands yesterday back from the strip, plays it in the replay context, and leaves the week exactly as it was', async () => {
    const page = await coldLoad();
    try {
      await openEverydayDoor(page);
      await page.locator('.everyday-bar-primary').click(); // Set up today
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await playAndClose(page);
      await page.locator('.everyday-report-tomorrow').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-back').click(); // Front door
      await page.waitForSelector('.everyday-door-chip', { timeout: 15_000 });

      const before = await page.evaluate(() => ({
        stepper: document.querySelector('.everyday-door-stepper')?.textContent ?? '',
        scores: [...document.querySelectorAll('.everyday-door-chip-score')].map((node) => node.textContent ?? ''),
      }));
      expect(before.scores[5]).not.toBe('—');

      /* Yesterday's chip, and the primary it earns. */
      await page.locator('.everyday-door-chip').nth(5).click();
      const primary = page.locator('.everyday-bar-primary');
      expect(await primary.textContent()).toBe('Set up the replay');
      expect(await primary.isDisabled()).toBe(false);
      expect(await page.textContent('.everyday-door-kind')).toContain('DOES NOT COUNT');
      await primary.click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });

      await page.locator('.everyday-bar-primary').click(); // Start the day, on the replay week
      await page.waitForSelector('.everyday-stage-phase', { timeout: 30_000 });
      expect(await page.textContent('.everyday-rail-subline')).toBe('REPLAYING');
      await page.waitForFunction(
        () => (document.querySelector('.everyday-bar-primary') as HTMLButtonElement | null)?.disabled === false,
        undefined,
        { timeout: 60_000 },
      );
      expect(await page.textContent('.everyday-bar-note')).toContain('never scored');
      await page.locator('.everyday-bar-primary').click(); // Close the day
      await page.waitForSelector('.everyday-report-title', { timeout: 30_000 });
      expect(await page.textContent('.everyday-bar-primary')).toBe('Front door');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-door-chip', { timeout: 15_000 });

      const after = await page.evaluate(() => ({
        stepper: document.querySelector('.everyday-door-stepper')?.textContent ?? '',
        scores: [...document.querySelectorAll('.everyday-door-chip-score')].map((node) => node.textContent ?? ''),
      }));
      /* The week is where it was: the same day standing, and day 1's score as it was filed. */
      expect(after.stepper).toBe(before.stepper);
      expect(after.scores).toEqual(before.scores);
    } finally {
      await page.close();
    }
  }, 300_000);
});
