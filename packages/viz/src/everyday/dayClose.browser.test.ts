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
  leaveLobbyIfShown,
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

/** The stage holds today's run, paused at its start and closable. */
async function waitForClosable(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const primary = document.querySelector('.everyday-bar-primary')?.textContent ?? '';
      const start = document.querySelector<HTMLElement>('.everyday-stage-start');
      return primary.includes('Close the day') && start?.style.display === '';
    },
    undefined,
    { timeout: 240_000 },
  );
}

/** The tally's text, whitespace folded. */
async function tallyOf(page: Page): Promise<string> {
  return ((await page.textContent('.everyday-report-close-tally')) ?? '').replace(/\s+/gu, ' ').trim();
}

/*
 * [§ D1380](../../../../DECISIONS.md), the post-AN panel's seats B (defect 5) and D (D8). After a
 * reload the close read *The house is still being run on all 2 of them* about a Monday an earlier
 * close had settled, and caught up seconds later: a tally going backwards. Monday is driven by a
 * driver other than the standing order, so its house is a run rather than the day itself; the
 * verdict is settled before the reload, and Tuesday's first close must read Monday as answered.
 */
describe.skipIf(!HAS_BROWSER)('the house tally never goes backwards across a reload — § D1380', () => {
  it('reads Monday’s settled house on Tuesday’s first close after a reload', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(`${origin}?building=midtown-office&seed=424243`, { waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await leaveTutorialIfOffered(page);
      if ((await page.locator('.everyday-consent-no').count()) > 0) await page.locator('.everyday-consent-no').click();
      await openEverydayDoor(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      /* A driver that is not the tower's standing order, so the house is a run of its own. */
      const standing = await page.$eval('.everyday-brief-picker', (select) => (select as HTMLSelectElement).value);
      const other = await page.$eval(
        '.everyday-brief-picker',
        (select, current) =>
          [...(select as HTMLSelectElement).options].find((option) => !option.disabled && option.value !== current)?.value ?? '',
        standing,
      );
      expect(other).not.toBe('');
      await page.selectOption('.everyday-brief-picker', other);
      await page.locator('.everyday-bar-primary').click();
      await waitForClosable(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report-close', { timeout: 60_000 });
      /* Monday's house settles on this sitting. */
      await page.waitForFunction(
        () => /^This week so far: you \d, the house \d/u.test(
          (document.querySelector('.everyday-report-close-tally')?.textContent ?? '').replace(/\s+/gu, ' ').trim(),
        ),
        undefined,
        { timeout: 180_000 },
      );

      /* A reload keeps no sitting's copy; the continue tile brings the week back. */
      await page.reload({ waitUntil: 'load' });
      /* § D1445: the reload opens the lobby; its *Main menu* is the way to the tile this case presses. */
      await leaveLobbyIfShown(page);
      await page.waitForSelector('.everyday-continue-week', { timeout: 60_000 });
      await page.locator('.everyday-continue-week').click();
      /* § D1384 (lane AO-4, joined at integration): a filed Monday's tile opens Tuesday's brief directly. */
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await waitForClosable(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report-close-tally', { timeout: 60_000 });
      const first = await tallyOf(page);
      /* Red before: *The house is still being run on all 2 of them.* */
      expect(first, 'the tally lost a house verdict an earlier close settled').not.toContain('all 2 of them');
      expect(first).toMatch(/The house: \d clean over the 1 it has answered|the house \d, clean over the same 2 counted days/u);
    } finally {
      await page.close();
    }
  });
});

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
      /* Wave AN, lane AN-7 (§ D1330): the week's number on the heading. */
      expect(await text('.everyday-report-close-tomorrow-heading')).toBe('TOMORROW · WEEK 1 · TUESDAY, DAY 2');
      /*
       * Wave AN, lane AN-7 (§ D1329), through the shipped path: the shell plans Tuesday at the close
       * (`dev/state.ts#tomorrowFactsOf`), and the card names the tower's booking of car D with its
       * clock, beside the move-in's own car, and the two buildings' measured tenants.
       */
      expect(await text('.everyday-report-close-cars')).toContain('car D 10:30–13:00, booked by the tower.');
      expect(await text('.everyday-report-close-cars')).toMatch(/^Out of passenger service: car [A-Z] \d\d:\d\d–\d\d:\d\d, taken by the day, and /u);
      expect(await text('.everyday-report-close-movein')).toMatch(/^\d+ people move in overnight: [\d,]+ → [\d,]+ tenants\.$/u);
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
