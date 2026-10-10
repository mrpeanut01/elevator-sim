/**
 * **What decided the day, on a page** — wave AN, lane DQ-3, swarm DQ's Q2 rule 3,
 * [§ D1351](../../../../DECISIONS.md).
 *
 * `shift/dayClose.test.ts` decides what the close says for every pair of readings, and
 * `watch/driverRun.test.ts` holds the driver run to the legs. What only the shipped page can show is
 * the wiring between them: that a counted day closed under another driver with a press makes the
 * shell start one more run off the thread that paints, that the close says plainly while it is
 * still being run, and that the line then answers from the run rather than from anything typed.
 *
 * The route is the player's own: Midtown Office from the Scenario tile through the door and the
 * brief, where the driver is picked, to the stage, where one parking press is made, closed on § 3.3's
 * primary. The day is a link's crowd, so the brief's picker is the player's to move.
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
  site = await startShippedSite({ preview: { port: 5887, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** Wait for the stage to hold a run the day can be closed on. */
async function waitClosable(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const primary = document.querySelector('.everyday-bar-primary')?.textContent ?? '';
      const start = document.querySelector<HTMLElement>('.everyday-stage-start');
      return primary.includes('Close the day') && start?.style.display === '';
    },
    undefined,
    { timeout: 150_000 },
  );
}

const text = (page: Page, selector: string): Promise<string> =>
  page.locator(selector).first().innerText().then((value) => value.replace(/\s+/gu, ' ').trim());

describe.skipIf(!HAS_BROWSER)('what decided the day — swarm DQ Q2 rule 3', () => {
  it('runs the day with the standing order picked in place of yours, says so while it runs, then answers', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      /* Monday is the newcomer's day, whose driver is held: closed as it stands, as a player does. */
      await page.goto(`${origin}?building=midtown-office&seed=424242`, { waitUntil: 'load' });
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
      await page.locator('.everyday-bar-primary').click();
      await waitClosable(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report-close', { timeout: 30_000 });

      /* Tuesday, a counted day: the brief's picker is the player's to move. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      /* The player's pick: somebody other than the tower's standing order. */
      await page.locator('.everyday-brief-picker').selectOption('fairness-first');
      await page.locator('.everyday-bar-primary').click();
      await waitClosable(page);

      /* One press on the stage, landed: the stamp names it once the re-simulated day is drawn. */
      const arm = '.everyday-stage-intervene[data-intervention-kind="park-cars-lobby"]';
      await page.waitForFunction((selector) => document.querySelector<HTMLButtonElement>(selector)?.disabled === false, arm, {
        timeout: 60_000,
      });
      await page.click(arm);
      await page.waitForFunction(
        (selector) =>
          document.querySelector<HTMLButtonElement>(selector)?.disabled === false &&
          (document.querySelector('.everyday-stage-stamp')?.textContent ?? '').includes('parked the cars'),
        arm,
        { timeout: 150_000 },
      );
      await waitClosable(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report-close-call', { timeout: 30_000 });

      /* The close counted the day against the house, so the driver run belongs to this close. */
      expect(await text(page, '.everyday-report-close-house')).toMatch(/^Today against the house: you (cleared|missed) it; /u);
      const first = await text(page, '.everyday-report-close-call');
      /*
       * Where a call decided the day the line names it and no run is asked; otherwise it says what
       * decided it, or that the run is still being run. It never reads the bare *No call decided
       * today* on a counted day closed under another driver with a press.
       */
      if (first.startsWith('The call that decided today')) {
        expect(first).not.toMatch(/Your driver|Your presses|Nothing you chose/u);
        return;
      }
      expect(first).toMatch(/^No call decided today: [^.]+\. /u);
      expect(first).toMatch(/still being run|waits on the house|Your driver did|Your presses did|Nothing you chose decided it either/u);
      await page.waitForFunction(
        () => !/still being run|waits on the house/u.test(document.querySelector('.everyday-report-close-call')?.textContent ?? ''),
        undefined,
        { timeout: 150_000 },
      );
      const answered = await text(page, '.everyday-report-close-call');
      expect(answered).toMatch(
        /(Your driver did: on this crowd, the same day with the tower’s standing order picked in place of yours and every press kept read Shift (cleared|missed)\.|Your presses did, together: left alone, the tower’s standing order read Shift (cleared|missed)\.|Nothing you chose decided it either: on this crowd, the tower’s standing order read Shift (cleared|missed) too, both with every press kept and left alone\.)$/u,
      );
      expect(answered).not.toContain('could not be run');
    } finally {
      await page.close();
    }
  });
});
