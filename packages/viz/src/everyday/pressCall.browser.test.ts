/**
 * **The stage calls a pinned day, on the shipped bundle** — wave AI's press-moment ruling,
 * [§ D1029](../../../../DECISIONS.md).
 *
 * ## What one case walks
 *
 * A player opens an admitted pinned day from the front door with no address parameter, starts it,
 * and finds both parking presses **held** with the reason on the page. At the fastest rung the
 * stage **stops** at the call — the card is up and the transport paused — and pressing the answer
 * the pin clears on gives *Shift cleared* on the report, beside the call row. *Take this call again*
 * then re-opens the same day with **no presses** on its record: the parking presses are held again
 * and the report the second attempt files credits it with nothing.
 *
 * St Jude's (`c8`) is the tower, because it is a slice that simulates in seconds and its pin is
 * admitted on the shipped data; the case reads the pin rather than naming its answer, so a re-pin
 * moves the case with it.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5741, inside this lane's
 * reserved 5741–5749, `strictPort: false` so a busy one moves rather than fails.
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
import { admittedPressDayIds, pressDayFor } from '../shift/ladder.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5741, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const PRESS_DAY = 'c8';

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

/** Door → brief → *Start the day* → the stage, paused at the day's start with the day closable. */
async function startTheDayFromDoor(page: Page): Promise<void> {
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.locator('.everyday-bar-primary').click();
  await waitForToday(page);
}

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

/**
 * The re-simulation an answer asks for, waited out — on the refusal line, which says *recomputing*
 * while it runs and nothing of the kind after. Not on the page's whole text: the stage's overlay
 * keeps its last sentence while hidden, so a body-text wait never ends on a day answered mid-run.
 */
async function recomputed(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const line = document.querySelector('.everyday-stage-intervene-refusal')?.textContent ?? '';
      const stamp = document.querySelector('.everyday-stage-stamp')?.textContent ?? '';
      return !line.includes('recomputing') && stamp !== '';
    },
    undefined,
    { timeout: 240_000 },
  );
}

/** Whether both parking presses are held, and the reason the page gives. */
async function parkingHeld(page: Page): Promise<{ readonly held: boolean; readonly reason: string }> {
  const disabled = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>('.everyday-stage-intervene')]
      .filter((button) => ['park-cars-lobby', 'spread-cars'].includes(button.dataset['interventionKind'] ?? ''))
      .map((button) => button.disabled),
  );
  return {
    held: disabled.length === 2 && disabled.every(Boolean),
    reason: await textOf(page, '.everyday-stage-intervene-refusal'),
  };
}

describe.skipIf(!HAS_BROWSER)('the stage calls a pinned day — § D1029', () => {
  it('holds the presses, stops at the call at any speed, clears on the answer, and takes the call again clean', async () => {
    const press = pressDayFor(PRESS_DAY);
    expect(press, `${PRESS_DAY} pins a day`).toBeDefined();
    expect(admittedPressDayIds(), `${PRESS_DAY} is admitted`).toContain(PRESS_DAY);
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      expect(new URL(page.url()).search, 'the case must not carry an address parameter').toBe('');
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      const row = `.everyday-door-pressday[data-contract="${PRESS_DAY}"]`;
      /*
       * **Unless the date already dealt it** — [§ D1047](../../../../DECISIONS.md). A fresh device is
       * now dealt a pinned day off the date, so on a date whose draw is St Jude's this row already
       * reads *the day you are set up to play* and is drawn inert, and pressing it would wait for a
       * control that is correctly disabled. Either way the day below is the same pinned day.
       */
      if ((await page.locator(`${row}[data-standing="true"]`).count()) === 0) await page.click(row);
      await page.waitForSelector(`${row}[data-standing="true"]`, { timeout: 30_000 });
      await startTheDayFromDoor(page);

      /* ---- before the call: both parking presses held, with the reason drawn ---- */
      const before = await parkingHeld(page);
      expect(before.held, 'the parking presses are pressable before the call').toBe(true);
      expect(before.reason).toContain('held until the stage stops for this day’s call');
      expect(await page.locator('.everyday-stage-call').isHidden()).toBe(true);

      /* ---- the fastest rung, then Start: the stage stops at the call ---- */
      await page.locator('.everyday-stage-speed', { hasText: '600×' }).click();
      await page.locator('.everyday-stage-start').click();
      await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 60_000 });
      expect(await textOf(page, '.everyday-stage-play'), 'the transport did not stop').toContain('Play');
      const card = await textOf(page, '.everyday-stage-call');
      expect(card).toContain('out of passenger service');
      for (const word of [/\bnow\b/iu, /\bdecid/iu, /\bseconds? left\b/iu]) expect(card).not.toMatch(word);
      /* Still stopped a moment later: the pause survives the rung the player chose. */
      const clockAtCall = await textOf(page, '.everyday-stage');
      await page.waitForTimeout(800);
      expect(await textOf(page, '.everyday-stage'), 'the stage moved past an unanswered call').toBe(clockAtCall);

      /* ---- the answer the pin clears on, then the report ---- */
      await page.locator(`.everyday-stage-call-answer[data-answer="${press?.clearedBy ?? ''}"]`).click();
      await recomputed(page);
      await page.locator('.everyday-stage-skip').click();
      await page.waitForFunction(
        () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
        undefined,
        { timeout: 60_000 },
      );
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report', { timeout: 60_000 });
      const report = await textOf(page, '.everyday-report');
      expect(report).toContain('Shift cleared');
      expect(report).toContain('The stage called the day');
      expect(report).toContain('On this crowd');

      /* ---- Take this call again: the same day, from an empty record ---- */
      await page.locator('.everyday-report-call-again-press').click();
      await waitForToday(page);
      const again = await parkingHeld(page);
      expect(again.held, 'the second attempt started with the first one’s answer standing').toBe(true);
      expect(await textOf(page, '.everyday-stage-stamp'), 'a press is stamped on a fresh attempt').toBe('');
      await page.locator('.everyday-stage-skip').click();
      await page.waitForFunction(
        () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
        undefined,
        { timeout: 60_000 },
      );
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report', { timeout: 60_000 });
      const second = await textOf(page, '.everyday-report');
      expect(second).toContain('nothing was pressed');
      expect(second).not.toMatch(/\d{2}:\d{2} · (parked the cars in the lobby|spread the cars across the tower)/u);
    } finally {
      await page.close();
    }
  }, 300_000);
});
