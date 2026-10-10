/**
 * ***Skip to the end* stops at a call that is due** — wave AN, lane AN-6,
 * [§ D1324](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## The defect this file reproduces (the post-AM panel's seat D, D4)
 *
 * 1. **The card up.** At a call with its card up, one press of *Skip to the end* answered it as
 *    skipped and ran the scored day to its end, where *Close the day* in the same state asks
 *    *Close the day without answering this call?* first.
 * 2. **After a reload.** A day left at its call and resumed from the brief came back at the call's
 *    second, and one press of *Skip to the end* ran it to its end with the call recorded as skipped.
 *    Seat D saw no card before the press; on this file's day the card does come back once the call's
 *    runs land, which the case reads softly, and the press is the defect either way.
 *
 * ## What the cases hold
 *
 * 1. With the card up the first press asks, under the card, with focus on *Back to the call*, and the
 *    clock stays at the call; *Back to the call* puts the question away and leaves the card; the
 *    question's own *Skip to the end* then skips as § D1151 made it.
 * 2. Resumed after a reload, one press of the skip leaves the stage at the call, with its card or its
 *    question up, rather than at the end of the day.
 *
 * Crown Hotel on 2026-10-03, `attemptIsFinal.browser.test.ts`'s day: a slice whose first call comes
 * about nine minutes in, so a skip stops at it quickly.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5877.
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
  site = await startShippedSite({ preview: { port: 5877, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const DATE = '2026-10-03';
const TOWER = 'c7';

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

function minutesOf(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

async function load(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
}

/** Menu → Scenario → door, Crown Hotel selected, then the door's primary onto the brief. */
async function toCrownsBrief(page: Page): Promise<void> {
  await leaveTutorialIfOffered(page);
  await openEverydayDoor(page);
  const row = `.everyday-door-tower[data-contract="${TOWER}"]`;
  if ((await page.locator(`${row}[data-selected="true"]`).count()) === 0) await page.click(row);
  await page.waitForSelector(`${row}[data-selected="true"]`, { timeout: 30_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
}

/** *Start the day* (or *Resume*) from the brief, and wait for the stage to be closable. */
async function ontoTheStage(page: Page): Promise<void> {
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  await page.waitForFunction(
    () =>
      (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day') &&
      /\d{2}:\d{2}/u.test(document.querySelector('.everyday-stage-clock')?.textContent ?? ''),
    undefined,
    { timeout: 240_000 },
  );
}

/** One *Skip to the end* from the day's start, which stops at its first call (§ D1151); the clock there. */
async function skipToTheFirstCall(page: Page): Promise<string> {
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
    undefined,
    { timeout: 240_000 },
  );
  await page.locator('.everyday-stage-skip').click();
  await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 240_000 });
  return textOf(page, '.everyday-stage-clock');
}

/** What the stage shows about the call: the card, the skip's question, focus, and the clock. */
async function atTheCall(page: Page): Promise<{ readonly card: boolean; readonly asked: boolean; readonly focus: string; readonly clock: string }> {
  return page.evaluate(() => ({
    card: document.querySelector<HTMLElement>('.everyday-stage-call')?.hidden === false,
    asked: document.querySelector<HTMLElement>('.everyday-stage-skip-confirm')?.hidden === false,
    focus: document.activeElement?.className ?? '',
    clock: (document.querySelector('.everyday-stage-clock')?.textContent ?? '').trim(),
  }));
}

describe.skipIf(!HAS_BROWSER)('a skip stops at a call that is due — § D1324', () => {
  it('with the card up, Skip asks first and the clock stays at the call', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      const callClock = await skipToTheFirstCall(page);

      await page.locator('.everyday-stage-skip').click();
      await page.waitForTimeout(1_500);
      const asked = await atTheCall(page);
      expect(asked.clock, 'the skip ran past a call that was due').toBe(callClock);
      expect(asked, 'the skip did not ask before passing the call').toMatchObject({ card: true, asked: true });
      expect(asked.focus).toContain('everyday-stage-skip-confirm-back');
      expect(await textOf(page, '.everyday-stage-skip-confirm-question')).toBe(STAGE_CALL_COPY.skipAsk);

      await page.locator('.everyday-stage-skip-confirm-back').click();
      const back = await atTheCall(page);
      expect(back).toMatchObject({ card: true, asked: false, clock: callClock });

      /* The question's own button is § D1151's answer: the call is skipped and the day runs on. */
      await page.locator('.everyday-stage-skip').click();
      await page.locator('.everyday-stage-skip-confirm-go').click();
      await page.waitForFunction(
        (clock) => (document.querySelector('.everyday-stage-clock')?.textContent ?? '').trim() !== clock,
        callClock,
        { timeout: 60_000 },
      );
      expect(minutesOf(await textOf(page, '.everyday-stage-clock'))).toBeGreaterThan(minutesOf(callClock));
    } finally {
      await page.close();
    }
  });

  it('after a reload at a call, Resume and one Skip leave the stage at that call', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      const callClock = await skipToTheFirstCall(page);
      await page.waitForTimeout(1_000);

      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await toCrownsBrief(page);
      expect(await textOf(page, '.everyday-bar-primary')).toMatch(/^Resume /u);
      await ontoTheStage(page);
      await page.waitForFunction(
        (clock) => (document.querySelector('.everyday-stage-clock')?.textContent ?? '').trim() === clock,
        callClock,
        { timeout: 60_000 },
      );

      /*
       * Seat D pressed after waiting at the resumed call, so the call's two runs had landed and it was
       * raised: wait for the card, or as long as the runs take under load, before the press.
       */
      await page
        .waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 20_000 })
        .catch(() => undefined);
      await page.waitForTimeout(2_000);
      expect.soft((await atTheCall(page)).card, 'the resumed stage did not put the due call back up').toBe(true);
      await page.locator('.everyday-stage-skip').click();
      /* Long enough for a skip that ran on to have reached the end. */
      await page.waitForTimeout(4_000);
      const after = await atTheCall(page);
      expect(minutesOf(after.clock), `the skip ran from the call at ${callClock} to ${after.clock}`).toBeLessThanOrEqual(
        minutesOf(callClock) + 1,
      );
      expect(after.card || after.asked, 'the call was never put back up').toBe(true);
    } finally {
      await page.close();
    }
  });
});
