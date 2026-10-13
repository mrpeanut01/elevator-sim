/**
 * **A career event day asks its call, and an ordinary one does not** — wave AO, lane DS-2,
 * [§ D1408](../../../../DECISIONS.md) and [§ D1409](../../../../DECISIONS.md), swarm DS's ruling Q2,
 * through the shipped bundle and the player's own presses.
 *
 * The post-AN re-panel's seat C played 22 career days and every one offered only *Let the day run as
 * it is*. Here a returning player's career stands on Garden Apartments' day 16 (an ordinary day at
 * this base) and then day 17 (the calendar's booked move-in). *Skip to the end* stops at every call a
 * day raises (§ D1151), so the skip is the instrument: on day 16 it runs to the end with no card, and
 * on day 17 it stops at the move-in's who-drives card, which is answered. The career report then
 * carries the day's account, graded on the contract's tests. Which call and which mark are the run's
 * business (`careerCalls.test.ts` pins them on the legs); this file asserts that the card is reached
 * and answered through the controls a player has.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openingCareer, type CampaignCareer } from '../campaign/career.js';
import { CAREER_STORAGE_KEY, encodeCareer } from '../campaign/careerPersist.js';
import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5972, strictPort: false } });
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A cold load whose device carries a career standing on contract day `day`, as a returning player's does. */
async function coldLoadOnContractDay(day: number): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  const career: CampaignCareer = {
    ...openingCareer('collective'),
    today: day,
    towers: openingCareer('collective').towers.map((tower) => ({ ...tower, day })),
  };
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* No storage, no career: the case then fails on the day it reads. */
      }
    },
    { key: CAREER_STORAGE_KEY, value: encodeCareer(career) },
  );
  await page.goto(`${site.origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true, undefined, {
    timeout: 30_000,
  });
  return page;
}

/** Campaign tile → the desk → the contract → *Lock it in and run day N* → the stage, with its run landed. */
async function runContractDay(page: Page, day: number, fromMenu: boolean): Promise<void> {
  if (fromMenu) {
    await leaveTutorialIfOffered(page);
    await page.locator('.everyday-mode[data-screen="towers"]').first().click();
    await page.waitForSelector('.everyday-towers');
    await page.click('.everyday-towers-open');
  }
  await page.waitForSelector('.everyday-building', { timeout: 30_000 });
  await page.click('.everyday-building-to-contract');
  await page.waitForSelector('.everyday-contract');
  expect(await page.textContent('.everyday-bar-primary')).toBe(`Lock it in and run day ${String(day)}`);
  await page.click('.everyday-bar-primary');
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('.everyday-bar-primary')?.textContent === 'Close the day', undefined, {
    timeout: 120_000,
  });
}

/** *Skip to the end*: it runs to the end, or stops at the first call the day raises. */
async function skip(page: Page): Promise<void> {
  await page.locator('.everyday-stage-skip').click();
}

/** § 3.3's stage primary, pressed: the day is filed and its report opens. */
async function closeTheDay(page: Page): Promise<string> {
  await page.click('.everyday-bar-primary');
  await page.waitForSelector('.everyday-report', { timeout: 30_000 });
  return (await page.textContent('.everyday-report')) ?? '';
}

describe.skipIf(!HAS_BROWSER)('the career asks on its event days — § D1408', () => {
  it('runs an ordinary day to its end with no card, then stops at the move-in’s call, answers it, and reports what decided the day', async () => {
    const page = await coldLoadOnContractDay(16);
    try {
      /* ---- day 16: ordinary at this base, so the skip meets no call ---- */
      await runContractDay(page, 16, true);
      await skip(page);
      await page.waitForTimeout(3000);
      expect(await page.locator('.everyday-stage-call:not([hidden])').count(), 'an ordinary career day raised a call').toBe(0);
      const ordinary = await closeTheDay(page);
      expect(ordinary).toContain('No call decided today: the stage raised none.');
      await page.click('.everyday-bar-primary');

      /* ---- day 17: the booked move-in, so the skip stops at its call ---- */
      await runContractDay(page, 17, false);
      await skip(page);
      /* Red before § D1408: the shell refused every career day, so the skip ran to the end. */
      await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 120_000 });
      const card = (await page.textContent('.everyday-stage-call')) ?? '';
      expect(await page.locator('.everyday-stage-call:not([hidden]) .everyday-stage-call-answer').count()).toBe(3);
      /* The card is the Scenario's: nothing about the answers' effect before the answer. */
      expect(card).not.toMatch(/Shift (cleared|missed)|contract’s tests|\bOn this crowd\b/u);
      /* The dock's purse, before and after: an answer costs nothing. */
      const purse = await page.textContent('.everyday-stage-dock-value');
      await page.locator('.everyday-stage-call:not([hidden]) .everyday-stage-call-answer').first().click();
      await page.waitForSelector('.everyday-stage-call[hidden]', { state: 'attached', timeout: 60_000 });
      expect(await page.textContent('.everyday-stage-dock-value')).toBe(purse);

      await skip(page);
      await page.waitForFunction(
        () => {
          const leave = document.querySelector<HTMLButtonElement>(
            '.everyday-stage-call:not([hidden]) .everyday-stage-call-answer[data-answer="leave"]',
          );
          leave?.click();
          return document.querySelector('.everyday-bar-primary')?.textContent === 'Close the day';
        },
        undefined,
        { timeout: 60_000, polling: 200 },
      );
      await closeTheDay(page);
      /* § D1409: the career report says what decided the day, graded on the contract's tests. */
      await page.waitForSelector('.everyday-report-career-call', { timeout: 30_000 });
      /* The house is run off the painting thread at the close, and the line says so until it answers. */
      await page.waitForFunction(
        () => !(document.querySelector('.everyday-report-career-call')?.textContent ?? 'still being run').includes('still being run'),
        undefined,
        { timeout: 60_000 },
      );
      const account = (await page.textContent('.everyday-report-career-call')) ?? '';
      expect(account).toMatch(/^(The call that decided today came at|No call decided today)/u);
      expect(account).toContain('contract’s tests');
    } finally {
      await page.close();
    }
  }, 300_000);
});
