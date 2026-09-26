/**
 * **The day's record, the clock and the controls, on the shipped bundle** — wave AL, lane AL-A, the
 * post-AK panel's defects that live between `dev/main.ts`'s closure and the Everyday shell.
 * [§ D1186](../../../../DECISIONS.md) to the highest this lane used.
 *
 * ## What each case walks
 *
 * 1. **A banked day, watched.** The replay's clock reads the hour the live stage read, and the car
 *    the day took out of service is named on the replay as it was live (seats B and D: the header
 *    read 08:40 for a 10:40 press, and the car-out pill was gone).
 * 2. **A banked day, then a link's crowd.** The practice sheet offers no button into the next day,
 *    because that button closed nothing and still moved the week past a counted day (seat D, H2).
 * 3. **A call up, then *Close the day*.** The close asks once, in plain words, before it files the
 *    day as it stands; the report takes keyboard focus after it (seat B, D1 and D8).
 * 4. **Boards & ladder, then *Play today's tower*.** It opens today's tower (seat B, D4).
 *
 * The pinned day is St Jude's (`c8`), whose slice simulates in seconds and whose pin takes a car out
 * of service, so one tower carries the call, the car-out pill and a whole close.
 *
 * Each case sets its own day up, so each defect has its own red: every case was run against the
 * bundle built from the tree before the fix and failed there, on the assertion its comment names.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, so a count
 * of cases, not the word *passed*, is what to check.
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
import { pressDayFor } from '../shift/ladder.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /* Its own port — `dev/browserTier.test.ts` requires every tier file's to be distinct. */
  site = await startShippedSite({ preview: { port: 5821, strictPort: false } });
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

/** `H:MM:SS` or `M:SS` into seconds — the elapsed time the canvas's own sentence names. */
function secondsOf(elapsed: string): number {
  return elapsed.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
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

/** The stage, paused at the day's start, with the day closable. */
async function waitForToday(page: Page): Promise<void> {
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const primary = document.querySelector('.everyday-bar-primary')?.textContent ?? '';
      const start = document.querySelector<HTMLElement>('.everyday-stage-start');
      return primary.includes('Close the day') && start?.style.display === '';
    },
    undefined,
    { timeout: 90_000 },
  );
}

/** A fresh device, past the first-visit offer, on the pinned day's stage and paused at its start. */
async function onThePinnedDay(page: Page): Promise<void> {
  await load(page, '');
  await leaveTutorialIfOffered(page);
  await openEverydayDoor(page);
  const row = `.everyday-door-pressday[data-contract="${PRESS_DAY}"]`;
  if ((await page.locator(`${row}[data-standing="true"]`).count()) === 0) await page.click(row);
  await page.waitForSelector(`${row}[data-standing="true"]`, { timeout: 30_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.locator('.everyday-bar-primary').click();
  await waitForToday(page);
}

/** At the fastest rung, Start, and wait for the stage to stop at the call. */
async function runToTheCall(page: Page): Promise<void> {
  await page.locator('.everyday-stage-speed', { hasText: '600×' }).click();
  await page.locator('.everyday-stage-start').click();
  await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 60_000 });
}

/** The clock the canvas's sentence was drawn at, and the elapsed time it names. */
async function clockAndElapsed(page: Page): Promise<{ readonly clock: string; readonly elapsedS: number }> {
  const read = await page.evaluate(() => ({
    clock: document.querySelector('.everyday-stage-clock')?.textContent ?? '',
    label: document.querySelector('.everyday-stage-canvas')?.getAttribute('aria-label') ?? '',
  }));
  const elapsed = /\bat (\d+(?::\d{2}){1,2}) of \d+(?::\d{2}){1,2}\./u.exec(read.label)?.[1];
  if (elapsed === undefined) throw new Error(`the canvas sentence names no elapsed time: ${read.label}`);
  return { clock: read.clock.trim(), elapsedS: secondsOf(elapsed) };
}

/** The car-out pill's words, or `''` where it is not drawn. */
async function bookedPill(page: Page): Promise<string> {
  return page.evaluate(() => {
    const pill = document.querySelector<HTMLElement>('.everyday-stage-booked');
    if (pill === null || pill.style.display === 'none') return '';
    return (pill.textContent ?? '').replace(/\s+/gu, ' ').trim();
  });
}

/** The recomputation an answer asks for, waited out on the refusal line. */
async function recomputed(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const line = document.querySelector('.everyday-stage-intervene-refusal')?.textContent ?? '';
      const stamp = document.querySelector('.everyday-stage-stamp')?.textContent ?? '';
      return !line.includes('recomputing') && stamp !== '';
    },
    undefined,
    { timeout: 90_000 },
  );
}

async function skipIfAnythingIsLeft(page: Page): Promise<void> {
  await page.evaluate(() => {
    const skip = document.querySelector<HTMLButtonElement>('.everyday-stage-skip');
    if (skip !== null && !skip.disabled) skip.click();
  });
}

async function closeTheDay(page: Page): Promise<string> {
  await page.waitForFunction(
    () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-report', { timeout: 60_000 });
  return textOf(page, '.everyday-report');
}

describe.skipIf(!HAS_BROWSER)('the day’s record, the clock and the controls', () => {
  it('replays a banked day on its own clock, with its car out named — seats B and D', async () => {
    const press = pressDayFor(PRESS_DAY);
    expect(press, `${PRESS_DAY} pins a day`).toBeDefined();
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await onThePinnedDay(page);
      await runToTheCall(page);
      /* The live stage: its clock against the elapsed time, and the car it has out. */
      const live = await clockAndElapsed(page);
      const livePill = await bookedPill(page);
      expect(livePill, 'the pinned day draws no car-out pill live, so this case checks nothing').not.toBe('');
      const liveStartMin = minutesOf(live.clock) - Math.floor(live.elapsedS / 60);

      await page.locator(`.everyday-stage-call-answer[data-answer="${press?.clearedBy ?? ''}"]`).click();
      await recomputed(page);
      await skipIfAnythingIsLeft(page);
      await closeTheDay(page);

      /* ---- Your week → Watch it ---- */
      await page.locator('.everyday-rail-menu').click();
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
      await page.click('button:has-text("Your week")');
      await page.locator('.everyday-week-watch-open').first().waitFor({ timeout: 30_000 });
      await page.locator('.everyday-week-watch-open').first().click();
      await page.waitForSelector('.everyday-stage-watching', { timeout: 90_000 });
      await page.waitForFunction(
        () => /^\d{2}:\d{2}$/u.test(document.querySelector('.everyday-stage-clock')?.textContent ?? ''),
        undefined,
        { timeout: 60_000 },
      );
      const watched = await clockAndElapsed(page);
      const watchedStartMin = minutesOf(watched.clock) - Math.floor(watched.elapsedS / 60);
      /* The defect: 08:40 on the replay for a 10:40 press, the whole clock two hours early. */
      expect(
        Math.abs(watchedStartMin - liveStartMin),
        `the replay reads ${watched.clock} at ${String(watched.elapsedS)} s in; the live day read ${live.clock} at ${String(live.elapsedS)} s`,
      ).toBeLessThanOrEqual(1);
      /* And the car the day took out is named on the replay, as it was live. */
      const watchedPill = await bookedPill(page);
      const carOf = (pill: string): string => /\bCar (\S+)/u.exec(pill)?.[1] ?? '';
      expect(watchedPill, 'the replay dropped the car-out pill').not.toBe('');
      expect(carOf(watchedPill)).toBe(carOf(livePill));
    } finally {
      await page.close();
    }
  });

  it('offers a link’s practice sheet no button into the next day — § D1141, seat D (H2)', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      /* ---- a fresh device closes its first day ---- */
      await load(page, '');
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief, .everyday-stage-canvas', { timeout: 15_000 });
      if ((await page.locator('.everyday-brief').count()) > 0) await page.locator('.everyday-bar-primary').click();
      /* Closed from the paused start, so no call is up and the close asks nothing. */
      await closeTheDay(page);

      /* ---- the same device opens a link naming its own crowd, and plays the next day on it ---- */
      await load(page, '?seed=777&duration=300');
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      expect(await textOf(page, '.everyday-brief-seed')).toContain('practice and banks nothing');
      await page.locator('.everyday-bar-primary').click();
      const linked = await closeTheDay(page);
      expect(linked).toContain('Practice. This run met a crowd other than the day’s shared one');
      /*
       * The defect: *Open the doors on Wednesday* stood under that sentence, and pressing it moved the
       * week past the day the sheet said stayed open.
       */
      expect(
        await page.locator('.everyday-report-tomorrow').count(),
        `the practice sheet offers ${await textOf(page, '.everyday-report-tomorrow')}`,
      ).toBe(0);
    } finally {
      await page.close();
    }
  });

  it('asks once before a close files the day over an open call, and hands focus to the report — seat B', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await onThePinnedDay(page);
      await runToTheCall(page);
      /* The defect: this press filed the day as missed on the spot, with the call still up. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-call-confirm:not([hidden])', { timeout: 10_000 });
      expect(await page.locator('.everyday-report').count(), 'the close filed the day without asking').toBe(0);
      const ask = await textOf(page, '.everyday-stage-call-confirm');
      expect(ask).toMatch(/without answering/u);
      /* Back to the call puts the card's answers in reach again, with nothing filed. */
      await page.locator('.everyday-stage-call-confirm-back').click();
      expect(await page.locator('.everyday-stage-call-confirm').isHidden()).toBe(true);
      expect(await page.locator('.everyday-stage-call').isHidden()).toBe(false);
      /* Asked again, and this time filed — by the keyboard. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-call-confirm:not([hidden])', { timeout: 10_000 });
      await page.locator('.everyday-stage-call-confirm-file').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.everyday-report', { timeout: 60_000 });
      /* The second defect: focus fell to the page body, so the next Tab started at the top. */
      await page.waitForFunction(
        () => document.activeElement !== null && document.activeElement !== document.body,
        undefined,
        { timeout: 10_000 },
      );
      const focused = await page.evaluate(() => document.activeElement?.className ?? '');
      expect(focused).toContain('everyday-report-title');
    } finally {
      await page.close();
    }
  });

  it('opens today’s tower from Boards & ladder — seat B (D4)', async () => {
    const page = await openPage(browser, { viewport: { width: 1280, height: 900 } });
    try {
      await load(page, '');
      await leaveTutorialIfOffered(page);
      await page.click('button:has-text("Boards & ladder")');
      await page.waitForSelector('.everyday-board-tab-ladder', { timeout: 30_000 });
      expect(await textOf(page, '.everyday-bar-primary')).toContain('today');
      await page.locator('.everyday-bar-primary').click();
      /* The defect: the press did nothing and said nothing. */
      await page.waitForSelector('.everyday-door', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  });
});
