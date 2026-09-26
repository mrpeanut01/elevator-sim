/**
 * **Every day ends pointing at tomorrow, on a page** — wave AM, lane AM-C, swarm DO's § 1 ruling
 * ([§ D1246](../../../../DECISIONS.md) to [§ D1249](../../../../DECISIONS.md)).
 *
 * The post-AL panel's seat A found the next day's button about 3 900 px down the report, under
 * *Return to Main Menu*. `shift/dayClose.test.ts` decides what the close says; what only a page can
 * show is **where** it is: that tomorrow's card and the press into it are on the first screen,
 * without scrolling, at 1440 × 900 and at 390 × 844, and that the pinned bar's primary is that press
 * rather than a way out.
 *
 * The route is the player's own: Midtown Office, the one tower whose week the census contests, from
 * the Scenario tile through the door and the brief to the stage, closed on § 3.3's own primary.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, so read
 * the case count rather than the word.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openEverydayDoor,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /* The shipped bundle, on a port of its own — `dev/browserTier.test.ts` requires every tier file's to be distinct. */
  site = await startShippedSite({ preview: { port: 5657, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** Midtown Office's Monday, played to the stage and closed on § 3.3's primary. */
async function closeMonday(page: Page): Promise<void> {
  await page.goto(`${origin}?building=midtown-office&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await leaveTutorialIfOffered(page);
  /*
   * The first visit's consent ask (GitHub issue #340) sits over the top of every screen until it is
   * answered, once. A player who has played a day has answered it, so the case answers it too.
   */
  if ((await page.locator('.everyday-consent-no').count()) > 0) await page.locator('.everyday-consent-no').click();
  await openEverydayDoor(page);
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  /* *Start the day*, then wait for the stage to hold today's run with the day closable. */
  await page.locator('.everyday-bar-primary').click();
  await page.waitForFunction(
    () => {
      const primary = document.querySelector('.everyday-bar-primary')?.textContent ?? '';
      const start = document.querySelector<HTMLElement>('.everyday-stage-start');
      return primary.includes('Close the day') && start?.style.display === '';
    },
    undefined,
    { timeout: 100_000 },
  );
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-report-close', { timeout: 30_000 });
}

/**
 * Where tomorrow's card and its press sit against the first screen: every scroller put back to the
 * top, then each box's bottom against the top of the pinned bar, which covers the page under it.
 */
async function firstScreen(page: Page): Promise<{ readonly card: number; readonly press: number; readonly barTop: number }> {
  return page.evaluate(() => {
    for (const node of [document.scrollingElement, ...document.querySelectorAll('*')]) {
      if (node instanceof HTMLElement && node.scrollTop > 0) node.scrollTop = 0;
    }
    const bottomOf = (selector: string): number =>
      document.querySelector(selector)?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY;
    const bar = document.querySelector('.everyday-bar');
    return {
      card: bottomOf('.everyday-report-close-tomorrow'),
      press: bottomOf('.everyday-report-close .everyday-report-tomorrow'),
      barTop: Math.min(bar?.getBoundingClientRect().top ?? window.innerHeight, window.innerHeight),
    };
  });
}

describe.skipIf(!HAS_BROWSER)('the close points at tomorrow — swarm DO § 1', () => {
  it('leads with the house and tomorrow, on the first screen at 1440 × 900 and at 390 × 844', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await closeMonday(page);
      const text = (selector: string): Promise<string> =>
        page.locator(selector).first().innerText().then((value) => value.replace(/\s+/gu, ' ').trim());
      expect(await text('.everyday-report-close-heading')).toBe('TODAY AGAINST THE HOUSE');
      expect(await text('.everyday-report-close-house')).toMatch(/^Today against the house: /u);
      expect(await text('.everyday-report-close-tally')).toMatch(/^This week so far: you \d, the house \d/u);
      expect(await text('.everyday-report-close-call')).toMatch(/^(The call that decided today|No call decided today)/u);
      expect(await text('.everyday-report-close-arithmetic')).toMatch(/target/u);
      expect(await text('.everyday-report-close-tomorrow-heading')).toBe('TOMORROW · TUESDAY, DAY 2');
      expect(await text('.everyday-report-close-counts')).toMatch(/counts? toward the week/u);
      expect(await text('.everyday-report-close-census')).toMatch(/^The census ran Tuesday on \d+ crowds: .* cleared it on \d+ of them\.$/u);
      /* The pinned bar's primary is the press into tomorrow, at full emphasis — not *Your week*. */
      expect(await text('.everyday-bar-primary')).toBe('Open the doors on Tuesday');
      expect(await page.locator('.everyday-bar-wayout').count()).toBe(0);
      expect(await text('.everyday-report-close .everyday-report-tomorrow')).toBe('Open the doors on Tuesday');
      expect(await page.locator('.everyday-report-close-week').count()).toBe(1);
      expect(await page.locator('.everyday-report-close-menu').count()).toBe(1);

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(250);
        const at = await firstScreen(page);
        const where = `${String(viewport.width)}×${String(viewport.height)}`;
        expect(at.card, `tomorrow's card is below the first screen at ${where}`).toBeLessThanOrEqual(at.barTop);
        /*
         * The press into tomorrow is the pinned bar's primary at every width (asserted above); at
         * the desktop width the close's own copy of it is on the first screen as well.
         */
        if (viewport.width >= 1000) {
          expect(at.press, `the press into tomorrow is below the first screen at ${where}`).toBeLessThanOrEqual(at.barTop);
        }
      }

      /* And the bar's primary opens tomorrow's brief. */
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      expect(await page.locator('.everyday-report').count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
