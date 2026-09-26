/**
 * **An ordinary scored day calls, the rows wait for the close, and a retake banks nothing** — wave
 * AJ, [§ D1138](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## What the two cases walk
 *
 * 1. A player on an **unpinned** Scenario day — Crown Hotel on the date's own crowd, chosen from
 *    the door's tower list — starts it, meets the stage's call, answers it, meets a second call,
 *    answers that, and closes the day. Nothing about the answers not taken is on the page before the
 *    close: the card has no count and no verdict. At the close the report carries one row per call,
 *    each saying *on this crowd* and quoting its three counts.
 * 2. Having closed that day, the player takes it again from the door's *Run today again*. The second
 *    report says it is practice, and the week's stored record of the day is the first attempt's,
 *    unchanged — what the retake did banks nothing.
 *
 * ## Why the date is fixed and which date
 *
 * The day's crowd is the date's (`shift/dailySeed.ts`), so the case holds the page's clock at noon
 * UTC on **2026-10-03**, where Crown Hotel's day 1 raises two calls under the tower's standing
 * `collective` when the first is answered *spread* and the second *park* — measured in Node with the
 * shipped session before this case was written (calls at 549 s and 1 174 s into the slice). A slice,
 * so each of the call's two runs takes a fraction of a second.
 *
 * **Since wave AK the same day asks who drives in between** ([§ D1167](../../../../DECISIONS.md)):
 * the candidate after the first call refuses the placement question and raises the driver
 * question, so the second card the player meets asks *Who drives the rest of the day?*. The first
 * case answers every call it meets, placement by *spread* then *park* and the driver question by
 * *keep*, and holds the same claims over both kinds of card and both kinds of row.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5749. Both cases run at
 * the project's own timeout and add no annotation: measured at about 35 s each on a box at load 7.
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
import { SESSION_KEY } from '../persist/types.js';
import { PRACTICE_NOTE } from '../shift/report.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5749, strictPort: false } });
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

/** The stage with the day paused at its start and closable — `pressCall.browser.test.ts`'s wait. */
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
 * Close the day from wherever the stage is, skipping what is left, and wait for the report. Since
 * § D1151 a skip stops at each call it has not had an answer to, so it is pressed until the day
 * has run out — each press with a card up is that call's answer, recorded as skipped.
 */
async function closeTheDay(page: Page): Promise<string> {
  await page.waitForFunction(
    () => {
      const skip = document.querySelector<HTMLButtonElement>('.everyday-stage-skip');
      if (skip === null || skip.disabled) return true;
      skip.click();
      return false;
    },
    undefined,
    { timeout: 180_000, polling: 500 },
  );
  await page.waitForFunction(
    () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-report', { timeout: 60_000 });
  return textOf(page, '.everyday-report');
}

/** The week's stored record of `day`, as the session slot holds it. */
async function storedDay(page: Page, day: number): Promise<unknown> {
  return page.evaluate(
    ({ key, day: wanted }) => {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      const walk = (value: unknown): unknown => {
        if (typeof value !== 'object' || value === null) return undefined;
        const record = value as Record<string, unknown>;
        if (Array.isArray(record['history']) && typeof record['contractId'] === 'string') {
          return (record['history'] as { day?: number }[]).find((entry) => entry.day === wanted) ?? null;
        }
        for (const child of Object.values(record)) {
          const found = walk(child);
          if (found !== undefined) return found;
        }
        return undefined;
      };
      return walk(JSON.parse(raw)) ?? null;
    },
    { key: SESSION_KEY, day },
  );
}

/** A fresh page, its clock held on `date`, on Crown Hotel's day from the door's tower list. */
async function onCrownsOrdinaryDay(page: Page, date: string = DATE): Promise<void> {
  await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await leaveTutorialIfOffered(page);
  await openEverydayDoor(page);
  const row = `.everyday-door-tower[data-contract="${TOWER}"]`;
  if ((await page.locator(`${row}[data-selected="true"]`).count()) === 0) await page.click(row);
  await page.waitForSelector(`${row}[data-selected="true"]`, { timeout: 30_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.locator('.everyday-bar-primary').click();
  await waitForToday(page);
}

/** Wait for the next call card, and read it. */
async function nextCall(page: Page): Promise<string> {
  await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 120_000 });
  return textOf(page, '.everyday-stage-call');
}

/** Answer the card on screen with `answer`, and wait for a press's run to be on the stage. */
async function answer(
  page: Page,
  kind: 'park-cars-lobby' | 'spread-cars' | 'leave' | 'driver-a' | 'driver-b',
): Promise<void> {
  await page.locator(`.everyday-stage-call-answer[data-answer="${kind}"]`).click();
  await page.waitForSelector('.everyday-stage-call[hidden]', { state: 'attached', timeout: 60_000 });
}

describe.skipIf(!HAS_BROWSER)('an ordinary day’s calls — § D1138', () => {
  it('calls an unpinned day twice, prints nothing of the other answers until the close, then a row per call', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await onCrownsOrdinaryDay(page);
      const door = await textOf(page, '.everyday-stage');
      expect(door, 'the day is a pinned day, which keeps its one § D1029 call').not.toContain('pinned crowd');
      /* An ordinary call holds nothing in advance: the parking presses are pressable before it. */
      const heldBefore = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLButtonElement>('.everyday-stage-intervene')]
          .filter((button) => ['park-cars-lobby', 'spread-cars'].includes(button.dataset['interventionKind'] ?? ''))
          .map((button) => button.disabled),
      );
      expect(heldBefore, 'an ordinary day held its parking presses before any call').toEqual([false, false]);

      await page.locator('.everyday-stage-speed', { hasText: '30×' }).click();
      await page.locator('.everyday-stage-start').click();

      /* ---- the first call: the card, its words, and nothing about the answers ---- */
      const first = await nextCall(page);
      /* § D1150: the question names cars that are left only where the card names a car that is out. */
      expect(first).toContain(first.includes('out of passenger service') ? 'What do the cars that are left do?' : 'What do the cars do?');
      /* AJ-I's placement and focus, on an ordinary call: in the shell's scroller's view, and focused. */
      const placed = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('.everyday-stage-call');
        const region = document.querySelector<HTMLElement>('.everyday-screen');
        if (card === null || region === null) return { inView: false, focused: false };
        const c = card.getBoundingClientRect();
        const r = region.getBoundingClientRect();
        const vh = document.documentElement.clientHeight;
        return {
          inView: c.height > 0 && c.top >= Math.max(0, r.top) - 1 && c.bottom <= Math.min(vh, r.bottom) + 1,
          focused: document.activeElement === card,
        };
      });
      expect(placed, 'the ordinary call card is out of view or unfocused').toEqual({ inView: true, focused: true });
      expect(first).not.toMatch(/\d+ with|Shift (cleared|missed)|\bOn this crowd\b/u);
      expect(await textOf(page, '.everyday-stage-play'), 'the transport did not stop at the call').toContain('Play');
      await answer(page, 'spread-cars');

      /*
       * ---- every later call: placement answered *park*, the driver question *keep* ----
       *
       * § D1167: the day now asks who drives between its placement calls, so the second card may ask
       * either question. Each card is read for the same refusals before it is answered.
       */
      let placementsAnswered = 1;
      let driversAnswered = 0;
      for (let k = 0; k < 6; k += 1) {
        const up = await page
          .waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 60_000 })
          .then(() => true)
          .catch(() => false);
        if (!up) break;
        const card = await textOf(page, '.everyday-stage-call');
        expect(card).not.toMatch(/\d+ with|Shift (cleared|missed)|\bOn this crowd\b/u);
        /* Still no row anywhere on the page before the close. */
        expect(await page.locator('.everyday-report').count()).toBe(0);
        if (card.includes('Who drives the rest of the day?')) {
          expect(card).toMatch(/Switch to .+Switch to .+Keep .+ driving/u);
          await answer(page, 'leave');
          driversAnswered += 1;
        } else {
          expect(card).toContain(card.includes('out of passenger service') ? 'What do the cars that are left do?' : 'What do the cars do?');
          await answer(page, 'park-cars-lobby');
          placementsAnswered += 1;
        }
        if (placementsAnswered >= 2 && driversAnswered >= 1) break;
      }
      expect(placementsAnswered + driversAnswered, 'the day called fewer than twice').toBeGreaterThanOrEqual(2);

      /* ---- the close: one row per call, on this crowd, with its three counts ---- */
      const report = await closeTheDay(page);
      const rows = report.match(/The stage (called the day|asked who drives), and you/gu) ?? [];
      expect(rows.length, report).toBeGreaterThanOrEqual(placementsAnswered + driversAnswered);
      expect(report).toContain('you spread the cars across the tower');
      expect(report).toMatch(/On this crowd the day was run three ways from the call/u);
      expect(report).toMatch(/\d+ with park the cars in the lobby, \d+ with spread the cars across the tower and \d+ with leave them/u);
      if (placementsAnswered >= 2) expect(report).toContain('you parked the cars in the lobby');
      if (driversAnswered >= 1) {
        expect(report).toMatch(/you kept Conventional collective driving/u);
        expect(report).toMatch(/\d+ with .+ driving, \d+ with .+ driving and \d+ with Conventional collective still driving/u);
      }
      expect(report).not.toContain(PRACTICE_NOTE);
    } finally {
      await page.close();
    }
  });

  it('takes a closed day again as practice, and the week keeps the first attempt', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await onCrownsOrdinaryDay(page);
      /* The first attempt: skipped straight to its end, so it closes on the day as built. */
      await page.locator('.everyday-stage-start').click();
      const firstReport = await closeTheDay(page);
      expect(firstReport).not.toContain(PRACTICE_NOTE);
      const banked = await storedDay(page, 1);
      expect(banked, 'the first close stored no day 1').not.toBeNull();

      /* The door's *Run today again*: the brief, then *Start the day* on the same crowd. */
      await page.locator('.everyday-rail-menu').click();
      await page.waitForSelector('.everyday-mode[data-screen], .everyday-bar-confirm-leave', { timeout: 15_000 });
      if ((await page.locator('.everyday-bar-confirm-leave').count()) > 0) {
        await page.locator('.everyday-bar-confirm-leave').click();
      }
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
      await openEverydayDoor(page);
      expect(await textOf(page, '.everyday-door-again-note')).toContain('practice');
      await page.locator('.everyday-door-again-press').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await waitForToday(page);
      await page.locator('.everyday-stage-speed', { hasText: '30×' }).click();
      await page.locator('.everyday-stage-start').click();
      /* Answer whatever the retake calls, differently from the first attempt, then close. */
      const called = await page
        .waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 120_000 })
        .then(() => true)
        .catch(() => false);
      if (called) {
        const card = await textOf(page, '.everyday-stage-call');
        await answer(page, card.includes('Who drives the rest of the day?') ? 'driver-a' : 'park-cars-lobby');
      }
      const practice = await closeTheDay(page);
      expect(practice).toContain(PRACTICE_NOTE);
      expect(practice).toContain('practice');
      expect(await storedDay(page, 1), 'the retake changed the banked day').toEqual(banked);
    } finally {
      await page.close();
    }
  });

  /*
   * **No call once the day is lost, and *End the day*** — [§ D1168](../../../../DECISIONS.md).
   *
   * On **2026-10-05** Crown Hotel's day 1 as built reads its landing-queue or worst-wait goal missed
   * by 960 s into the slice (measured in Node over the shipped goals, every thirty seconds, on the
   * run a player who answers every call *leave them* keeps on the stage). From there the stage raises
   * no call and offers *End the day*; pressed, it files the day, and the report says when.
   */
  it('offers End the day once a goal whose miss is final reads missed, raises nothing after it, and files the day', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await onCrownsOrdinaryDay(page, '2026-10-05');
      expect(await page.locator('.everyday-stage-end-day:visible').count(), 'offered before the day began').toBe(0);
      await page.locator('.everyday-stage-speed', { hasText: '30×' }).click();
      await page.locator('.everyday-stage-start').click();
      /* Every call on the way is answered *leave them*, so the run on the stage is the day as built. */
      await page.waitForFunction(
        () => {
          const leave = document.querySelector<HTMLButtonElement>(
            '.everyday-stage-call:not([hidden]) .everyday-stage-call-answer[data-answer="leave"]',
          );
          leave?.click();
          return document.querySelector<HTMLElement>('.everyday-stage-end-day')?.checkVisibility() === true;
        },
        undefined,
        { timeout: 180_000, polling: 100 },
      );
      const note = (await page.getAttribute('.everyday-stage-end-day', 'title')) ?? '';
      expect(note).toMatch(/^The (landing-queue|worst-wait) goal is already past its bar, and it cannot come back under it today\./u);
      expect(/\d/u.test(note), note).toBe(false);
      const clock = await textOf(page, '.everyday-stage-clock');
      /* From here the stage raises no call: none is drawn in the seconds the day plays on. */
      await page.waitForTimeout(3000);
      expect(await page.locator('.everyday-stage-call:not([hidden])').count(), 'a call after the day was lost').toBe(0);
      await page.locator('.everyday-stage-end-day').click();
      await page.waitForSelector('.everyday-report', { timeout: 60_000 });
      const report = await textOf(page, '.everyday-report');
      expect(report).toMatch(/You ended the day early, at \d{2}:\d{2}/u);
      expect(report).toContain('the figures on this sheet are the whole day’s');
      expect(clock).toMatch(/^\d{2}:\d{2}$/u);
    } finally {
      await page.close();
    }
  });
});
