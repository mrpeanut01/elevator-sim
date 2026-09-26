/**
 * **One record of the day, read by everything that shows or replays it** — wave AK, lane AK-A, the
 * post-AJ panel's defects that only the shipped bundle shows.
 * [§ D1139](../../../../DECISIONS.md), [§ D1140](../../../../DECISIONS.md),
 * [§ D1141](../../../../DECISIONS.md), [§ D1142](../../../../DECISIONS.md),
 * [§ D1143](../../../../DECISIONS.md).
 *
 * ## Why these are browser cases
 *
 * Each defect lives between `dev/main.ts`'s closure and the Everyday shell: the close that files a
 * day and writes the week, the address the boot reads, the watch gate's worker, and the reload that
 * asks whether a returning player has played. The pure halves are unit-tested beside their modules
 * (`watch/filedDay.test.ts`, `shift/scoredCrowd.test.ts`, `everyday/callOpening.test.ts`,
 * `everyday/doorView.test.ts`, `everyday/tutorialModel.test.ts`); these are the product, reached by
 * the player's own route.
 *
 * 1. **A banked day, then a link.** A fresh device closes its first day; the same device then opens
 *    `?seed=777&duration=300` and plays the next day on that crowd. The brief says it is practice,
 *    the sheet says so, and the week does not move (seat D, H2; seat A, D7).
 * 2. **A banked day, then another tower.** The door on the moved week says *Set up today*, not
 *    *closed and banked* (seat A, D2).
 * 3. **A banked day, watched from *Your week*.** It plays rather than being refused (seats A and D,
 *    D1 and H3), and it opens at its call rather than at its start (seat A).
 * 4. **A banked day, another tower, then a reload.** The reload lands on the mode picker rather
 *    than the landing page (seat A, D3).
 *
 * Each case sets its own day up, so each defect has its own red: every case was run against the
 * bundle built from the tree before the fix and failed there, on the assertion its comment names.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass — so a
 * count of cases, not the word *passed*, is what to check.
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
  /* Its own port — `dev/browserTier.test.ts` requires every tier file's to be distinct. */
  site = await startShippedSite({ preview: { port: 5811, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

/** `query` on the page already open, settled past the menu cover. Storage survives: one device. */
async function load(page: Page, query: string): Promise<void> {
  await page.goto(`${origin}${query}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
}

/** From the door: § 3.3's primary to the brief (and past it), start the day, close it, read the sheet. */
async function playTodayFromDoor(page: Page): Promise<string> {
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief, .everyday-stage-canvas', { timeout: 15_000 });
  if ((await page.locator('.everyday-brief').count()) > 0) {
    await page.locator('.everyday-bar-primary').click();
  }
  await page.waitForFunction(
    () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
    undefined,
    { timeout: 120_000 },
  );
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-report', { timeout: 60_000 });
  return textOf(page, '.everyday-report');
}

/** Back to the main menu and on to the door, the player's route. */
async function backToTheDoor(page: Page): Promise<void> {
  await page.locator('.everyday-rail-menu').click();
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
  await openEverydayDoor(page);
}

describe.skipIf(!HAS_BROWSER)('one record of the day', () => {
  it('keeps a link’s crowd out of a week under way — § D1141', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      /* ---- a fresh device closes its first day ---- */
      await load(page, '');
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      const first = await playTodayFromDoor(page);
      expect(first).not.toContain('Practice.');

      /* ---- the same device opens a link naming its own crowd, and plays the next day on it ---- */
      await load(page, '?seed=777&duration=300');
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      /* The first day is closed, so the door opens the second; the link names its crowd. */
      expect(await textOf(page, '.everyday-bar-primary')).toMatch(/Open the doors on/u);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      const seedLine = await textOf(page, '.everyday-brief-seed');
      expect(seedLine).toContain('crowd 777');
      /* The defect: this read *a crowd of this run's own* and then banked the day anyway. */
      expect(seedLine).toContain('so this run is practice and banks nothing into your week');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForFunction(
        () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
        undefined,
        { timeout: 120_000 },
      );
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report', { timeout: 60_000 });
      const linked = await textOf(page, '.everyday-report');
      expect(linked).toContain('Practice. This run met a crowd other than the day’s shared one');
      expect(linked).not.toMatch(/\b\w+day is banked\./u);

      /* The week did not move: today is still open, on the door's chip and on its primary. */
      await backToTheDoor(page);
      expect(await textOf(page, '.everyday-door-chip:last-child .everyday-door-chip-note')).toBe('today · not closed yet');
      const primary = await textOf(page, '.everyday-bar-primary');
      expect(primary, 'the link’s day was closed into the week').toContain('Set up today');
    } finally {
      await page.close();
    }
  });

  it('lets a moved week open on its own Monday — § D1142', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page, '');
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      await playTodayFromDoor(page);
      await backToTheDoor(page);
      await page.waitForSelector('.everyday-door-towers', { timeout: 30_000 });
      expect(await textOf(page, '.everyday-bar-primary')).toMatch(/Open the doors on/u);

      /* ---- another tower: a fresh week, whose Monday nobody has closed ---- */
      const other = await page
        .locator('.everyday-door-tower:not([data-selected="true"])')
        .first()
        .getAttribute('data-contract');
      expect(other).not.toBeNull();
      await page.click(`.everyday-door-tower[data-contract="${other ?? ''}"]`);
      await page.waitForSelector(`.everyday-door-tower[data-contract="${other ?? ''}"][data-selected="true"]`, {
        timeout: 30_000,
      });
      /* The defect: *"Today is closed and banked … Open the doors on Tuesday"* over a fresh Monday. */
      expect(await textOf(page, '.everyday-bar-primary')).toContain('Set up today');
      expect(await textOf(page, '.everyday-bar')).not.toContain('closed and banked');
    } finally {
      await page.close();
    }
  });

  it('watches a banked day from *Your week*, opened at its call — § D1139, § D1140', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page, '');
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      await playTodayFromDoor(page);
      await page.locator('.everyday-rail-menu').click();
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
      await page.click('button:has-text("Your week")');
      await page.locator('.everyday-week-watch-open').first().waitFor({ timeout: 30_000 });
      const label = await textOf(page, '.everyday-week-watch-row .everyday-week-watch-label');
      expect(label).toContain('day 1');
      await page.locator('.everyday-week-watch-open').first().click();
      await page.waitForSelector('.everyday-stage-watching, .everyday-week-watch-refusal', { timeout: 120_000 });
      /* The defect: *"this record no longer reproduces the result it was filed with"*. */
      expect(await page.locator('.everyday-week-watch-refusal').count(), await textOf(page, '.everyday-week-watch-refusal')).toBe(0);
      await page.waitForFunction(
        () => /^\d{2}:\d{2}$/u.test(document.querySelector('.everyday-stage-clock')?.textContent ?? ''),
        undefined,
        { timeout: 60_000 },
      );
      /*
       * § D1140: a watched day that raised a call opens just before it rather than at its start, so
       * the stage is already moving and its opening overlay is down.
       */
      expect(await page.locator('.everyday-stage-start').isVisible(), 'the watched day opened at its start').toBe(false);
    } finally {
      await page.close();
    }
  });

  it('keeps a returning player off the landing page after the week moved and the page reloaded — § D1143', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page, '');
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      await playTodayFromDoor(page);
      await backToTheDoor(page);
      await page.waitForSelector('.everyday-door-towers', { timeout: 30_000 });
      /* ---- another tower: a fresh week, whose Monday nobody has closed ---- */
      const other = await page
        .locator('.everyday-door-tower:not([data-selected="true"])')
        .first()
        .getAttribute('data-contract');
      expect(other).not.toBeNull();
      await page.click(`.everyday-door-tower[data-contract="${other ?? ''}"]`);
      await page.waitForSelector(`.everyday-door-tower[data-contract="${other ?? ''}"][data-selected="true"]`, {
        timeout: 30_000,
      });
      /* ---- a reload: the week that holds the closed day is parked, and still counts ---- */
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForSelector('.everyday-landing, .everyday-tutorial, .everyday-mode[data-screen]', { timeout: 30_000 });
      /* The defect: the landing page, then *Start playing* into the walkthrough again. */
      expect(await page.locator('.everyday-landing, .everyday-tutorial').count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
