/**
 * **The stage's record of a scored day is whole and current** — wave AM, lane AM-B,
 * [§ D1239](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## The defects this file reproduces (the post-AL panel's seats B and D)
 *
 * 1. The pinned call, the one the day turns on, never got a *What the calls did* row, on the stage
 *    or in the report, where every later call did.
 * 2. *Skip to the end* pressed just after an answer ran the day out and then raised the next call
 *    under the end's clock, beside *the day has run out*.
 * 3. Status lines went stale: *stopped for the day's call* and the pace note stood under the end's
 *    clock; *held until the stage stops for this day's call* stood beside the call's own card.
 * 4. A practice stage (*Take this call again*) did not say it was practice.
 * 5. *Close the day* with a call up put focus on *Close the day as it stands*, so two presses of
 *    `Enter` ended the day.
 *
 * The pinned day on `c8` with the page's clock held on 2026-10-03, `dayControls.browser.test.ts`'s
 * day: its call comes ten simulated minutes in, and the day asks on after it (§ D1204).
 *
 * The assertions are soft (`expect.soft`), so a tree carrying several of these defects reports each
 * of them rather than the first.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5841.
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
import { STAGE_CALL_COPY } from './stageCall.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5841, strictPort: false } });
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

function minutesOf(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

async function onThePinnedDay(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await leaveTutorialIfOffered(page);
  await openEverydayDoor(page);
  const row = `.everyday-door-pressday[data-contract="${PRESS_DAY}"]`;
  if ((await page.locator(`${row}[data-standing="true"]`).count()) === 0) await page.click(row);
  await page.waitForSelector(`${row}[data-standing="true"]`, { timeout: 30_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const primary = document.querySelector('.everyday-bar-primary')?.textContent ?? '';
      const start = document.querySelector<HTMLElement>('.everyday-stage-start');
      return primary.includes('Close the day') && start?.style.display === '';
    },
    undefined,
    { timeout: 120_000 },
  );
}

/** What the stage says at this instant: its clock, the card, the bar's note, the pace note and the strip's hold. */
async function stageNow(page: Page): Promise<{
  readonly clock: string;
  readonly card: boolean;
  readonly cardHeading: string;
  readonly bar: string;
  readonly pace: string;
  readonly hold: string;
  readonly ended: boolean;
}> {
  return page.evaluate(() => {
    const read = (selector: string): string => (document.querySelector(selector)?.textContent ?? '').replace(/\s+/gu, ' ').trim();
    const card = document.querySelector<HTMLElement>('.everyday-stage-call');
    return {
      clock: read('.everyday-stage-clock'),
      card: card !== null && !card.hidden && card.offsetParent !== null,
      cardHeading: read('.everyday-stage-call-heading'),
      bar: read('.everyday-bar'),
      pace: read('.everyday-stage-pace'),
      hold: read('.everyday-stage-intervene-refusal'),
      ended: document.querySelector<HTMLButtonElement>('.everyday-stage-skip')?.disabled === true,
    };
  });
}

describe.skipIf(!HAS_BROWSER)('the stage’s record of a scored day — § D1239', () => {
  it('keeps the close’s question safe, gives the pinned call its row, and never asks a call under the end’s clock', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await onThePinnedDay(page);
      await page.locator('.everyday-stage-speed', { hasText: '600×' }).click();
      await page.locator('.everyday-stage-start').click();
      await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 120_000 });
      const pinnedClock = (await stageNow(page)).clock;

      /* Seat B: the close's question takes focus on the safe button, so two Enters cannot end the day. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-call-confirm:not([hidden])', { timeout: 10_000 });
      const focused = await page.evaluate(() => document.activeElement?.className ?? '');
      expect.soft(focused, 'focus went to the button that files the day').toContain('everyday-stage-call-confirm-back');
      /* Where focus did land on the filing button, Enter would file: take it back to the call first. */
      if (!focused.includes('everyday-stage-call-confirm-back')) await page.locator('.everyday-stage-call-confirm-back').focus();
      await page.keyboard.press('Enter');
      expect.soft(await page.locator('.everyday-report').count(), 'Enter on the question filed the day').toBe(0);
      expect.soft(await page.locator('.everyday-stage-call').isHidden()).toBe(false);

      /* Seats B and D: at the call, the strip's hold names the card rather than a stop still to come. */
      expect.soft((await stageNow(page)).hold).not.toBe(STAGE_CALL_COPY.held);

      /* Answer, then skip at once, inside the answer's re-simulation; then skip each call as it comes. */
      /* Seat B's hands: the answer and the skip in one breath, so the skip lands inside the re-simulation. */
      await page.evaluate(() => {
        document.querySelector<HTMLButtonElement>('.everyday-stage-call-answer')?.click();
        document.querySelector<HTMLButtonElement>('.everyday-stage-skip')?.click();
      });
      const seen: string[] = [];
      for (let presses = 0; presses < 12; presses += 1) {
        if (presses > 0) {
          const before = await stageNow(page);
          if (before.ended) break;
          await page.locator('.everyday-stage-skip').click();
        }
        await page.waitForFunction(
          () => {
            const card = document.querySelector<HTMLElement>('.everyday-stage-call');
            const up = card !== null && !card.hidden && card.offsetParent !== null;
            return up || document.querySelector<HTMLButtonElement>('.everyday-stage-skip')?.disabled === true;
          },
          undefined,
          { timeout: 120_000, polling: 250 },
        );
        await page.waitForTimeout(1_500);
        const now = await stageNow(page);
        if (now.card) {
          seen.push(now.clock);
          expect.soft(now.ended, `a call was asked at ${now.clock} on a day that had run out`).toBe(false);
          expect.soft(now.bar, `a call was asked beside the day's end at ${now.clock}`).not.toMatch(/run out/u);
          expect.soft(now.hold).not.toBe(STAGE_CALL_COPY.held);
        }
      }
      /* A call the day still had would come up once its runs land; give it the time they take. */
      await page
        .waitForFunction(
          () => {
            const card = document.querySelector<HTMLElement>('.everyday-stage-call');
            return card !== null && !card.hidden && card.offsetParent !== null;
          },
          undefined,
          { timeout: 15_000, polling: 250 },
        )
        .catch(() => undefined);
      const end = await stageNow(page);
      expect.soft(end.ended).toBe(true);
      expect.soft(end.card, `a call came up after the day ran out: ${end.cardHeading}`).toBe(false);
      for (const clock of seen) {
        expect.soft(minutesOf(clock), `the stage asked at ${clock}, before the pinned call`).toBeGreaterThanOrEqual(minutesOf(pinnedClock));
        /* Seat B's defect: the card came up under the day's last clock, the skip having run past it. */
        expect.soft(minutesOf(clock), `the stage asked a call under the day's end clock, ${clock}`).toBeLessThan(minutesOf(end.clock));
      }
      /* Seats B and D: nothing under the end's clock describes a stop or a pace. */
      expect.soft(end.pace, `the pace note under the end read: ${end.pace}`).toBe('');

      /* Seats B and D: the pinned call's own row, on the stage and on the report. */
      const rows = await textOf(page, '.everyday-stage-call-rows');
      expect.soft(rows, 'the stage printed no row for the pinned call').toContain(`The call at ${pinnedClock}`);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report', { timeout: 60_000 });
      const report = await textOf(page, '.everyday-report');
      expect.soft(report, 'the report printed no counts for the pinned call').toContain(
        `Riders who arrived from ${pinnedClock} to`,
      );

      /* Seat D: the practice stage says it is practice. */
      /*
       * Each defect above is a soft assertion, so a run on a tree that has several of them names every
       * one; the steps below need a report and a retake to stand on.
       */
      await page.locator('.everyday-report-call-again-press').click();
      await page.waitForFunction(
        () => /^\d{2}:\d{2}$/u.test(document.querySelector('.everyday-stage-clock')?.textContent ?? ''),
        undefined,
        { timeout: 120_000 },
      );
      await page.waitForFunction(
        () => (document.querySelector('.everyday-stage-practice')?.textContent ?? '') !== '',
        undefined,
        { timeout: 30_000 },
      ).catch(() => undefined);
      expect.soft(await textOf(page, '.everyday-stage-practice'), 'the practice stage did not say so').toMatch(
        /does not count toward the week/u,
      );
    } finally {
      await page.close();
    }
  });
});
