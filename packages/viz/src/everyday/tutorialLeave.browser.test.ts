/**
 * **Leaving the tutorial files nothing, and a reload lands on a cover with a live way past it** —
 * GitHub issue #598, [§ D993](../../../../DECISIONS.md), amending § D476's condition.
 *
 * The tutorial's two exits used to start a run and file it as the week's day 1, on a tower the
 * player never saw; three of four assessors then met a front door reading *MON mixed-use-high-rise
 * 96 % today* before they had played. § D993 withdrew that. What it rests on now is two properties
 * only a browser can hold, and this file drives both on the shipped bundle:
 *
 * 1. **Neither exit files a day.** Checked by the one line whose presence *is* an empty week:
 *    § D514's first-session line — its pinned arm since § D1047, the one a fresh device's pinned
 *    day draws — on the daily door exactly when
 *    `shift/firstSession.ts#isFirstDayOnALegibleTower` holds, which needs `history.length === 0`.
 *    The filing used to switch it off; this is that regression's test.
 * 2. **Within a session the cover is not re-offered, and across a reload it is, with a live route to
 *    the modes.** That is the amended condition, and the reload half is the cost § D993 names.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openEverydayDoor,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { FIRST_SESSION_LINE_PINNED } from '../shift/firstSession.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5643, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A first visit, into the walkthrough by the landing page's own call to action. */
async function intoWalkthrough(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.everyday-landing-cta', { timeout: 30_000 });
  await page.locator('.everyday-landing-cta').click();
  await page.waitForSelector('.everyday-tutorial', { timeout: 30_000 });
  return page;
}

/**
 * The week is still empty: the daily door draws § D514's first-session line. Checked after a wait
 * long enough for the old filing to have landed — it simulated a day on a worker and closed it on
 * the landing — so a regression is caught rather than raced.
 */
async function expectNothingFiled(page: Page): Promise<void> {
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 30_000 });
  await page.waitForTimeout(8_000);
  expect(await page.locator('.everyday-landing, .everyday-tutorial').count(), 'the cover came back in-session').toBe(0);
  await openEverydayDoor(page);
  await page.waitForFunction((line) => document.body.textContent?.includes(line) === true, FIRST_SESSION_LINE_PINNED, {
    timeout: 30_000,
  });
}

describe.skipIf(!HAS_BROWSER)('§ D993 — the tutorial’s exits file nothing', () => {
  it('Skip reaches the menu with an empty week, is not re-offered, and a reload offers a cover with a live way past it', async () => {
    const page = await intoWalkthrough();
    try {
      await page.locator('.everyday-tutorial-skip').click();
      await expectNothingFiled(page);

      /* Across a reload the player has played nothing, and meets the landing page — one press from the modes. */
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.everyday-landing', { timeout: 30_000 });
      const leave = page.locator('.everyday-bar-leave');
      expect(await leave.isDisabled()).toBe(false);
      await leave.click();
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  }, 300_000);

  it('Start playing reaches the menu with an empty week too', async () => {
    const page = await intoWalkthrough();
    try {
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-collapse', { timeout: 20_000 });
      /* The collapse screen's primary is *Start playing* — the second of `leave`'s two callers. */
      await page.locator('.everyday-bar-primary').click();
      await expectNothingFiled(page);
    } finally {
      await page.close();
    }
  }, 300_000);
});
