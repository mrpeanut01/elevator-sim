/**
 * § 6.1's replay, end to end, by the player's own route — GitHub issue #177 item 1, § D517.
 *
 * Day 1 is played and closed and tomorrow opened, so the strip has a past day to hand back. Then the
 * past chip → *Set up the replay* → the brief → the stage in the `replay` context, with `REPLAYING`
 * on the rail → *Close the day* → the report → *Front door*, and the door shows the week exactly as
 * it was: still on day 2, day 1's score untouched.
 *
 * The second case is GitHub issue #522, the rush's #518 item 4 on the replay: a replay left while its
 * run is still being generated stops that run, so nothing from the replay lands over the week the way
 * out has just put back, and nothing from it can be filed there. The host's half is `host.test.ts`.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  enterEngineerStage,
  HAS_BROWSER,
  openEverydayDoor,
  openPage,
  returnToEverydayMode,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5234, strictPort: false } });
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

/** `#run` is the Engineer's Run button; `dev/main.ts#onRunning` labels it from the runner's own transition. */
const RUN_IDLE = 'Run this shift';

/** What the front door says about the week: the stepper, and the score under each of the strip's chips. */
interface DoorWeek {
  readonly stepper: string;
  readonly scores: readonly string[];
}

async function doorWeek(page: Page): Promise<DoorWeek> {
  return page.evaluate(() => ({
    stepper: document.querySelector('.everyday-door-stepper')?.textContent ?? '',
    scores: [...document.querySelectorAll('.everyday-door-chip-score')].map((node) => node.textContent ?? ''),
  }));
}

/**
 * Day 1 played and closed, *Tomorrow*, and back to the door. *Tomorrow* presses day 2's run itself
 * (`EverydayHost.openTomorrow`), so the week a replay parks from here has an open run of the player's
 * on it. That run is waited out, so which run the replay finds standing does not depend on the worker.
 */
async function toTomorrowsDoor(page: Page): Promise<void> {
  await openEverydayDoor(page);
  await page.locator('.everyday-bar-primary').click(); // Set up today
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await playAndClose(page);
  await page.locator('.everyday-report-tomorrow').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.waitForFunction((label) => document.getElementById('run')?.textContent === label, RUN_IDLE, { timeout: 60_000 });
  await page.locator('.everyday-bar-back').click(); // Front door
  await page.waitForSelector('.everyday-door-chip', { timeout: 15_000 });
}

/**
 * From the menu: the Engineer surface's `Ctrl`+`Enter`, then the front door. That key is `closeShift` with no playhead
 * gate, live once that surface has the page (#287), so it files whatever run of this shell's own stands
 * unfiled, onto the week that stands. A press a player has, and the one that needs nothing else to line up.
 */
async function fileByEngineerClose(page: Page): Promise<{ readonly week: DoorWeek; readonly status: string }> {
  await enterEngineerStage(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('Control+Enter');
  const status = await page.evaluate(() => document.getElementById('status')?.textContent ?? '');
  await returnToEverydayMode(page);
  await openEverydayDoor(page);
  return { week: await doorWeek(page), status };
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

  it('left while its run is still generating, stops that run, so nothing from the replay is filed onto the week put back — GitHub issue #522', async () => {
    /*
     * The control: the same tower and crowd to day 2's door and the same filing press, with no replay
     * opened. What it files is day 2's own run, which is the run leaving a replay must put back.
     */
    const control = await coldLoad();
    let expected: DoorWeek;
    try {
      await toTomorrowsDoor(control);
      /* The door's own leave, to the menu: where leaving the replay lands, so both arms file from one place. */
      await control.locator('.everyday-bar-leave').click();
      await control.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
      expected = (await fileByEngineerClose(control)).week;
    } finally {
      await control.close();
    }

    const page = await coldLoad();
    try {
      await toTomorrowsDoor(page);
      const before = await doorWeek(page);
      /*
       * Non-vacuity, twice. The press files a day. And day 2's own run does not score as day 1 did: the
       * replay plays day 1's crowd, and where the leave did not cancel it filed day 1's score, so were
       * the two equal the door could not tell which run had been filed.
       */
      expect(expected).not.toEqual(before);
      expect(expected.scores[6]).not.toBe(before.scores[5]);

      await page.locator('.everyday-door-chip').nth(5).click();
      await page.locator('.everyday-bar-primary').click(); // Set up the replay
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      /*
       * Start the replay's day and leave inside one task, `rush.browser.test.ts`'s #518 case: the worker
       * answers with a message, which is a task of its own, so the run cannot land between the two and
       * this case cannot pass by the run being quick. The confirm is clicked where the shell draws one.
       */
      const seen = await page.evaluate(() => {
        const label = (): string => document.getElementById('run')?.textContent ?? '';
        document.querySelector<HTMLButtonElement>('.everyday-bar-primary')?.click(); // Start the day, on the replay week
        const pressed = label();
        document.querySelector<HTMLButtonElement>('.everyday-bar-leave')?.click();
        document.querySelector<HTMLButtonElement>('.everyday-bar-confirm-leave')?.click();
        return { pressed, left: label() };
      });
      /* The press started the replay's run, and it was in flight when the player left. */
      expect(seen.pressed).toBe('Cancel this run');
      await page.waitForFunction((label) => document.getElementById('run')?.textContent === label, RUN_IDLE, { timeout: 60_000 });
      /*
       * Where the leave does not cancel, the replay's run lands after the week is back and
       * `dev/main.ts#applyShift` adopts it over day 2's, so the press files the replay onto day 2.
       */
      const filed = await fileByEngineerClose(page);
      expect(filed.week, `the runner read "${seen.left}" as the player left; the filing press left "${filed.status}"`).toEqual(expected);
    } finally {
      await page.close();
    }
  });
});
