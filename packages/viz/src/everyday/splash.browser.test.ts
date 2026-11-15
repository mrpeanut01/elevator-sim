/**
 * **The opening doors on the shipped bundle** — the splash a cold launch plays over the lobby.
 *
 * `splashModel.test.ts` holds the timeline and its five-second ceiling in the node tier. What only a
 * browser can hold is that the doors are really drawn over a lobby that is already there, that they
 * never stand between a press and what it was aimed at ([§ D1627](../../../../DECISIONS.md)), that
 * the first press clears them, that they leave the page by the ceiling, and that reduced motion
 * never draws them.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, openPage, startShippedSite, type ShippedSite } from '../dev/browserTier.test-helper.js';
import { SPLASH_CEILING_MS } from './splashModel.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5986, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function coldLaunch(reducedMotion: 'reduce' | 'no-preference'): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1280, height: 800 }, reducedMotion });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
  return page;
}

/** What a press at the centre of the first landing button would land on, as a class name. */
const hitAtLanding = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('.everyday-lobby-floor-button');
    if (target === null) return null;
    const box = target.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === null ? null : target === hit || target.contains(hit) ? 'landing' : hit.className;
  });

describe.skipIf(!HAS_BROWSER)('the opening doors', () => {
  it('opens over a live lobby, lets a press through, and is gone by the ceiling', async () => {
    const page = await coldLaunch('no-preference');
    try {
      await page.waitForSelector('.everyday-splash', { state: 'attached', timeout: 5_000 });
      expect(await page.locator('.everyday-splash-door').count()).toBe(2);
      expect(await page.getAttribute('.everyday-splash', 'aria-hidden')).toBe('true');
      /* The doors are drawn over the menu, and a press still reaches the menu. */
      expect(await hitAtLanding(page)).toBe('landing');
      await page.waitForSelector('.everyday-splash', { state: 'detached', timeout: SPLASH_CEILING_MS });
    } finally {
      await page.context().close();
    }
  }, 60_000);

  it('clears on the first key, without taking it', async () => {
    const page = await coldLaunch('no-preference');
    try {
      await page.waitForSelector('.everyday-splash', { state: 'attached', timeout: 5_000 });
      await page.keyboard.press('Shift');
      expect(await page.locator('.everyday-splash').count()).toBe(0);
    } finally {
      await page.context().close();
    }
  }, 60_000);

  it('is never drawn under reduced motion', async () => {
    const page = await coldLaunch('reduce');
    try {
      expect(await page.locator('.everyday-splash').count()).toBe(0);
    } finally {
      await page.context().close();
    }
  }, 60_000);
});
