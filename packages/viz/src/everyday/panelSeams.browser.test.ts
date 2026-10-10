/**
 * **Three seams the post-AM panel found broken, on the shipped bundle** — wave AN, lane AN-5.
 *
 * Each lives between the Everyday shell, its host and `dev/main.ts`, and each is reached here by the
 * player's own route. The pure halves are held beside their modules (`host.test.ts`,
 * `driverMemory.test.ts`); these are the product.
 *
 * 1. **A Scenario day reached from the career runs as a Scenario day** (seat C, D3). The shell left
 *    the career's screens with its context still `campaign`, so today's tower played in the career's
 *    chrome and closed into the career's report. `everyday/shell.ts#leaveCareerFlow`.
 * 2. **Another tower's run is not drawn under this tower's name** (seat C, D4). Choosing a tower
 *    moved the building and left the last tower's recording standing, so the Engineer header named
 *    the new tower over the old tower's figures. `everyday/host.ts#moveWeekTo`.
 * 3. **The brief's driver survives a reload** (seat A, defect 3), § D1318. A reload put the house back
 *    on the week and said nothing. `everyday/driverMemory.ts`.
 *
 * Each was driven against a bundle built from the tree before its fix and failed there on the
 * assertion its comment names. Gate: without `ELEVATOR_SIM_CHROMIUM` every case skips and the file
 * reports a pass, so read the case count.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  enterEngineerStage,
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
  /* Its own port — `dev/browserTier.test.ts` requires every tier file's to be distinct. */
  site = await startShippedSite({ preview: { port: 5867, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await leaveTutorialIfOffered(page);
}

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

/** The stage has adopted today's run and is paused at its start with the day closable. */
async function waitForToday(page: Page): Promise<void> {
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
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

/** Skip to the end and close, filing past a call's ask the way `dayIsItsOwn.browser.test.ts` does. */
async function skipAndClose(page: Page): Promise<void> {
  await page.locator('.everyday-stage-skip').click();
  await page.waitForFunction(
    () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-report, .everyday-stage-call-confirm:not([hidden])', { timeout: 60_000 });
  if ((await page.locator('.everyday-report').count()) === 0) {
    await page.locator('.everyday-stage-call-confirm-file').click();
    await page.waitForSelector('.everyday-report', { timeout: 60_000 });
  }
}

async function toModes(page: Page): Promise<void> {
  await page.locator('.everyday-rail-menu').click();
  await page.waitForSelector('.everyday-mode[data-screen], .everyday-bar-confirm-leave', { timeout: 15_000 });
  if ((await page.locator('.everyday-bar-confirm-leave').count()) > 0) {
    await page.locator('.everyday-bar-confirm-leave').click();
  }
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
}

describe.skipIf(!HAS_BROWSER)('the post-AM panel’s broken seams — wave AN, lane AN-5', () => {
  it('runs today’s tower as a Scenario day when it is reached from the career — seat C D3', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await settle(page);
      await page.locator('.everyday-mode[data-screen="towers"]').click();
      await page.waitForSelector('.everyday-towers', { timeout: 15_000 });
      expect(await textOf(page, '.everyday-bar-leave')).toBe('⤺ Leave the career');
      /* The rail's *Your week*, then the week's own press into today's tower. */
      await page.locator('nav.everyday-rail button', { hasText: 'Your week' }).first().click();
      await page.waitForSelector('.everyday-week', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-door', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await waitForToday(page);
      /* Red before: *⤺ Leave the career*, the career's breadcrumb and its CAREER rail group. */
      expect(await textOf(page, '.everyday-bar-leave')).not.toBe('⤺ Leave the career');
      const rail = await page.locator('nav.everyday-rail').innerText();
      expect(rail, 'the career’s rail group stood over a Scenario day').not.toMatch(/^CAREER$/mu);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('does not draw the last tower’s run under the next tower’s name on the Engineer surface — seat C D4', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(`${origin}?building=crown-hotel&seed=424242`, { waitUntil: 'load' });
      await settle(page);
      await openEverydayDoor(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await waitForToday(page);
      await skipAndClose(page);
      /* The front door's tower list: another tower, chosen. */
      await toModes(page);
      await openEverydayDoor(page);
      const other = page.locator('.everyday-door-tower[data-selected="false"]', { hasText: 'Midtown Office' }).first();
      await other.click();
      await page.waitForFunction(
        () => (document.querySelector('.everyday-door')?.textContent ?? '').includes('Midtown Office'),
        undefined,
        { timeout: 15_000 },
      );
      await enterEngineerStage(page);
      const name = await textOf(page, '#building-name');
      const sub = await textOf(page, '#building-sub');
      expect(name).toBe('Midtown Office');
      /* Red before: Crown Hotel's floors and cars under Midtown Office's name. */
      expect(sub, `the header reads ${sub} under ${name}`).toMatch(/^21 floors · 4 cars/u);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('keeps the brief’s driver when the site is opened again — seat A defect 3, § D1318', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(`${origin}?building=crown-hotel&seed=424242`, { waitUntil: 'load' });
      await settle(page);
      await openEverydayDoor(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('select.everyday-brief-picker').selectOption('fairness-first');
      await page.waitForFunction(
        () => (document.querySelector('.everyday-bar')?.textContent ?? '').includes('Fairness first'),
        undefined,
        { timeout: 15_000 },
      );
      /* A day played and closed on it, so the week is saved and the reload has a week to restore. */
      await page.locator('.everyday-bar-primary').click();
      await waitForToday(page);
      await skipAndClose(page);
      /*
       * Back at the site's own address, as a player opening it again tomorrow does. A reload of
       * the same address keeps the driver already, because the address carries `?dispatcher=` while
       * it follows the run (`dev/main.ts#deepLinkSearchOf`); the bare address carries nothing, and
       * that is the visit seat A's driver came back to.
       */
      await page.goto(origin, { waitUntil: 'load' });
      await settle(page);
      await openEverydayDoor(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      /* Red before: the picker and the bar's note named Conventional collective, and nothing said so. */
      expect(await page.locator('select.everyday-brief-picker').inputValue()).toBe('fairness-first');
      expect(await textOf(page, '.everyday-bar')).toContain('Running the lifts: Fairness first');
    } finally {
      await page.close();
    }
  }, 120_000);
});
