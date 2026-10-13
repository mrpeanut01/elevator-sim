/**
 * **A lost day stops once, on *End the day*, and *Watch the rest* plays on fast** — wave AO, lane
 * DR-1, [§ D1435](../../../../DECISIONS.md), swarm DR's ruling § Q4, on the shipped bundle.
 *
 * ## What was wrong
 *
 * Once a goal graded on a maximum had read past its bar, § D1168 stopped the calls and offered *End
 * the day* as an 11 px chip with its reason in a tooltip, and § D1169 held the player's rung wherever
 * somebody had waited a minute, which is most of a lost day: swarm DR measured 110 of 332 real
 * minutes played after the day was lost (S1), and 9.3 to 13.3 real minutes after a loss by 08:49
 * (S3).
 *
 * ## What the case holds
 *
 * Crown Hotel on 2026-10-05, `dayCalls.browser.test.ts`'s lost day, every call answered *leave
 * them*: the stage stops once, on the frame the day reads lost, with the lost card up in the call
 * card's place, naming the goal and its figure, and *End the day* holding focus. *Watch the rest*
 * plays on under the `lost` line at 30×, raises no call, does not stop on the card again, and runs
 * the day to its end without filing it: the stage never ends the day for the player.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5973 (5972 at the lane, where lane P2-2 holds it), moving if taken.
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
import { STAGE_LOST_COPY } from './stageCall.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5973, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const TOWER = 'c7';

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

/** Crown Hotel's day on `date`, from the door, onto a stage paused at its start. */
async function onCrownsDay(page: Page, date: string): Promise<void> {
  await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true, undefined, {
    timeout: 30_000,
  });
  await leaveTutorialIfOffered(page);
  await openEverydayDoor(page);
  const row = `.everyday-door-tower[data-contract="${TOWER}"]`;
  if ((await page.locator(`${row}[data-selected="true"]`).count()) === 0) await page.click(row);
  await page.waitForSelector(`${row}[data-selected="true"]`, { timeout: 30_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.locator('.everyday-bar-primary').click();
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

describe.skipIf(!HAS_BROWSER)('the lost day — § D1435', () => {
  it('stops once on End the day, and Watch the rest plays fast to the end without filing', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await onCrownsDay(page, '2026-10-05');
      expect(await page.locator('.everyday-stage-lost:not([hidden])').count(), 'the card before the day began').toBe(0);
      await page.locator('.everyday-stage-speed', { hasText: '30×' }).click();
      await page.locator('.everyday-stage-start').click();
      /* Every call on the way is answered *leave them*, so the run on the stage is the day as built. */
      await page.waitForFunction(
        () => {
          document
            .querySelector<HTMLButtonElement>('.everyday-stage-call:not([hidden]) .everyday-stage-call-answer[data-answer="leave"]')
            ?.click();
          return document.querySelector<HTMLElement>('.everyday-stage-lost')?.hidden === false;
        },
        undefined,
        { timeout: 180_000, polling: 100 },
      );

      /* Stopped on the card, End the day focused, the goal named with its figure. */
      const card = await textOf(page, '.everyday-stage-lost');
      expect(card).toContain(STAGE_LOST_COPY.heading);
      expect(card).toMatch(/The (deepest landing|longest wait) reached \d+( s)? by \d{2}:\d{2}, past its bar of \d+( s)?\./u);
      expect(await page.evaluate(() => document.activeElement?.className ?? '')).toBe('everyday-stage-lost-end');
      expect(await textOf(page, '.everyday-stage-play'), 'the transport did not stop at the loss').toContain('Play');
      const stoppedAt = await textOf(page, '.everyday-stage-clock');
      await page.waitForTimeout(1500);
      expect(await textOf(page, '.everyday-stage-clock'), 'the stage played on under the card').toBe(stoppedAt);

      /* Watch the rest: the card goes, the day plays on fast under the lost line, and asks nothing. */
      await page.locator('.everyday-stage-lost-watch').click();
      expect(await page.locator('.everyday-stage-lost:not([hidden])').count()).toBe(0);
      await page.waitForFunction(
        () => (document.querySelector('.everyday-stage-pace')?.textContent ?? '').includes('the day can no longer clear'),
        undefined,
        { timeout: 15_000 },
      );
      expect(await textOf(page, '.everyday-stage-pace')).toBe('the day can no longer clear: playing the rest at 30×, and no call is asked');
      await page.waitForFunction(
        (at) => (document.querySelector('.everyday-stage-clock')?.textContent ?? '').trim() !== at,
        stoppedAt,
        { timeout: 30_000 },
      );
      /* To the end: never the card again, never a call, and no report until the player closes the day. */
      await page.waitForFunction(
        () => {
          const lost = document.querySelector<HTMLElement>('.everyday-stage-lost');
          const call = document.querySelector('.everyday-stage-call:not([hidden])');
          if (lost?.hidden === false || call !== null) return true;
          return document.querySelector<HTMLButtonElement>('.everyday-stage-skip')?.disabled === true;
        },
        undefined,
        { timeout: 240_000, polling: 250 },
      );
      expect(await page.locator('.everyday-stage-lost:not([hidden])').count(), 'the card stopped the stage twice').toBe(0);
      expect(await page.locator('.everyday-stage-call:not([hidden])').count(), 'a call after the day was lost').toBe(0);
      expect(await page.locator('.everyday-report').count(), 'the stage ended the day itself').toBe(0);
      expect(await textOf(page, '.everyday-bar-primary')).toContain('Close the day');
    } finally {
      await page.close();
    }
  });
});
