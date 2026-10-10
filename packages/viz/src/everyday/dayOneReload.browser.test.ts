/**
 * **A reload with the first day begun brings the continue tile, and no tutorial** — wave AO, lane
 * AO-2, [§ D1369](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## The defect this file reproduces
 *
 * The post-AN panel's seat D (D4): a fresh player starts the pinned Monday, plays it to its call and
 * reloads. The page opened on the landing page, *Start playing* opened the tutorial's first screen,
 * and the mode picker showed Scenario, Career and Rush with no *Continue your week*; the way back to
 * the day was Scenario, *Play today's scenario*, *Set up today* and *Resume Monday*. Once a day had
 * been filed the tile appeared. Red on `b53ab48`: the landing page came up after the reload, and the
 * picker had no `.everyday-continue-week`.
 *
 * The newcomer's own route on 2026-10-10, the day seat D played: the door's first tower as the first
 * visit deals it, *Set up today*, *Start the day*, and the reload once the attempt is on this
 * device's slot.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5934.
 */

import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openEverydayBrief,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { ATTEMPT_KEY } from '../persist/attempt.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5934, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const DATE = '2026-10-10';

describe.skipIf(!HAS_BROWSER)('a reload with the first day begun — § D1369', () => {
  it('opens on the picker with Continue your week, and the tile leads back to Resume', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      /* A first arrival: the landing page is offered, and left the way a newcomer leaves it. */
      await openEverydayBrief(page);
      expect((await page.textContent('.everyday-bar-primary'))?.trim()).toBe('Start the day');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
      /* The attempt is begun when its run lands, and kept on this device's slot. */
      await page.waitForFunction(
        (key) => (window.localStorage.getItem(key) ?? '').includes('"attempts"') &&
          Object.keys((JSON.parse(window.localStorage.getItem(key) ?? '{}') as { attempts?: object }).attempts ?? {}).length > 0,
        ATTEMPT_KEY,
        { timeout: 90_000 },
      );

      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForSelector('.everyday-landing, .everyday-tutorial, .everyday-continue-week', { timeout: 30_000 });
      expect(
        await page.locator('.everyday-landing, .everyday-tutorial').count(),
        'a player with a day begun was sent to the landing page or the tutorial',
      ).toBe(0);
      const tile = page.locator('.everyday-continue-week');
      expect(await tile.count(), 'the picker drew no Continue your week over a begun day').toBe(1);
      expect((await page.textContent('.everyday-continue-week-line')) ?? '').toMatch(/Monday under way/u);

      await tile.click();
      await page.waitForSelector('.everyday-door', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      expect((await page.textContent('.everyday-bar-primary'))?.trim()).toBe('Resume Monday');
    } finally {
      await page.close();
    }
  });

  it('still offers a genuine first arrival the landing page — the gate moved only for a begun day', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForSelector('.everyday-landing, .everyday-tutorial, .everyday-mode[data-screen]', { timeout: 30_000 });
      expect(await page.locator('.everyday-landing').count()).toBe(1);
      await leaveTutorialIfOffered(page);
      expect(await page.locator('.everyday-continue-week').count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
