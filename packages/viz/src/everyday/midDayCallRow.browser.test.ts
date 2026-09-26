/**
 * **Each call's row on the stage, once its window can be observed** — wave AL, lane AL-E,
 * [§ D1219](../../../../DECISIONS.md), on the shipped bundle.
 *
 * Crown Hotel on 2026-10-03, `dayCalls.browser.test.ts`'s day: its first call is raised a few
 * minutes into the slice, and § D1166 asks every five minutes after it, so the stage stops at a
 * later call **before** the first call's row is due (the call plus 660 s). The case holds the two
 * halves of the ruling the stage can show:
 *
 * 1. while a later card is up inside the window, no row is on the page: the first call's window has
 *    not been observed yet, and nothing about the answers not taken prints before it is;
 * 2. played on, the first call's row appears mid-day, with the day still running, at a clock at
 *    least eleven minutes past the call's, carrying three counts in the report row's words and no
 *    verdict.
 *
 * The report row's words are the same sentence by construction (`shift/dayCalls.ts#dayCallCountsLineOf`)
 * and are held by `stageCallRow.test.ts` and the `day-call-stage-row` pair rather than by a close
 * here, which would double this case's run time.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5773.
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
  site = await startShippedSite({ preview: { port: 5773, strictPort: false } });
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

/** `hh:mm` as minutes of the day. */
function minutesOf(clock: string): number {
  const match = /(\d{2}):(\d{2})/u.exec(clock);
  if (match === null) throw new Error(`no clock in ${clock}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

async function nextCard(page: Page): Promise<string> {
  await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 90_000 });
  return textOf(page, '.everyday-stage-call');
}

async function answer(page: Page, kind: string): Promise<void> {
  await page.locator(`.everyday-stage-call-answer[data-answer="${kind}"]`).click();
  await page.waitForSelector('.everyday-stage-call[hidden]', { state: 'attached', timeout: 60_000 });
}

describe.skipIf(!HAS_BROWSER)('a call’s row on the stage mid-day — § D1219', () => {
  it('prints nothing before the call plus 660 s, then the counts and no verdict while the day runs', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true, undefined, {
        timeout: 30_000,
      });
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      const row = '.everyday-door-tower[data-contract="c7"]';
      if ((await page.locator(`${row}[data-selected="true"]`).count()) === 0) await page.click(row);
      await page.waitForSelector(`${row}[data-selected="true"]`, { timeout: 30_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForFunction(
        () =>
          (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day') &&
          document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
        undefined,
        { timeout: 90_000 },
      );
      await page.locator('.everyday-stage-speed', { hasText: '30×' }).click();
      await page.locator('.everyday-stage-start').click();

      /* The first call, answered; its row is due eleven minutes of the clock later. */
      const first = await nextCard(page);
      expect(first).not.toMatch(/\d+ with/u);
      const firstClock = minutesOf(await textOf(page, '.everyday-stage-clock'));
      await answer(page, first.includes('Who drives the rest of the day?') ? 'leave' : 'spread-cars');

      /*
       * Every call met before the row: no row is on the page while the first call's window is not
       * observed, and each card is answered so the day plays on.
       */
      let cardsBeforeRow = 0;
      for (let k = 0; k < 6; k += 1) {
        await page.waitForFunction(
          () =>
            document.querySelector('.everyday-stage-call-row') !== null ||
            document.querySelector('.everyday-stage-call:not([hidden])') !== null,
          undefined,
          { timeout: 90_000 },
        );
        if ((await page.locator('.everyday-stage-call-row').count()) > 0) break;
        const clock = minutesOf(await textOf(page, '.everyday-stage-clock'));
        if (clock - firstClock < 11) {
          expect(await textOf(page, '.everyday-stage'), 'a row printed before its window closed').not.toMatch(
            /Riders who arrived from/u,
          );
          cardsBeforeRow += 1;
        }
        const card = await textOf(page, '.everyday-stage-call');
        await answer(page, card.includes('Who drives the rest of the day?') ? 'leave' : 'park-cars-lobby');
      }
      expect(cardsBeforeRow, 'no call fell inside the first call’s window, so nothing was held back').toBeGreaterThan(0);

      /* The first call's row, mid-day. */
      await page.waitForSelector('.everyday-stage-call-row', { timeout: 60_000 });
      const shown = await page.evaluate(() => ({
        clock: document.querySelector('.everyday-stage-clock')?.textContent ?? '',
        heading: document.querySelector('.everyday-stage-call-row-heading')?.textContent ?? '',
        counts: document.querySelector('.everyday-stage-call-row-counts')?.textContent ?? '',
        note: document.querySelector('.everyday-stage-call-row-note')?.textContent ?? '',
        dayRunning: document.querySelector<HTMLButtonElement>('.everyday-stage-skip')?.disabled === false,
        report: document.querySelector('.everyday-report') !== null,
      }));
      expect(shown.report).toBe(false);
      expect(shown.dayRunning, 'the row arrived only at the day’s end').toBe(true);
      expect(minutesOf(shown.clock) - minutesOf(shown.heading), 'the row printed before the call plus 660 s').toBeGreaterThanOrEqual(11);
      expect(minutesOf(shown.heading)).toBe(firstClock);
      expect(shown.counts).toMatch(
        /^Riders who arrived from \d{2}:\d{2} to \d{2}:\d{2} and waited a minute or more: \d+ with .+, \d+ with .+ and \d+ with .+\.$/u,
      );
      for (const text of [shown.heading, shown.counts, shown.note]) {
        expect(text).not.toMatch(/Shift (cleared|missed)|cleared with|missed with/u);
      }
    } finally {
      await page.close();
    }
  });
});
