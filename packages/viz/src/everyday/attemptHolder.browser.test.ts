/**
 * **The one attempt is final through every door: no other screen runs its day, and one tab holds
 * it at a time** — wave AO, lane AO-1, on the shipped bundle.
 *
 * ## The holes this file reproduces (the post-AN panel's seat D)
 *
 * 1. **D1, the Dispatcher workshop.** At a held call, Menu → *Dispatcher workshop* → a style card →
 *    *Run a day with this* opened the stage on the attempt's own crowd, labelled practice, and it
 *    stopped at the identical call. Every answer could be rehearsed to 18:00 and then given for score
 *    after *Resume*. § D1323 had closed the Engineer's dispatcher card for exactly this reason.
 * 2. **D2, a second tab.** Tab B resumed the scored attempt, played it to 18:00 without closing and
 *    read every goal; tab A then banked. B's progress also overwrote the saved attempt.
 *
 * ## What the cases hold
 *
 * 1. While an attempt stands, the workshop's style card changes nothing and its *Run a day with
 *    this* is inert with the reason beside it; back on the brief the attempt resumes at the same
 *    call, and its own close banks.
 * 2. A second tab opened at a held call does not offer *Resume*, and resumes, plays and writes
 *    nothing of the attempt; the first tab's close banks.
 * 3. The second tab's takeover is pressed on purpose: it opens no further than the attempt had been
 *    shown, the first tab stops (its close is gone and its presses write nothing), and only the
 *    tab holding the attempt banks it.
 * 4. A tab closed without closing the day lets its attempt go: a new tab resumes it with no
 *    takeover, at no later instant than the closed tab had shown, and banks it.
 *
 * Crown Hotel on 2026-10-03, `attemptIsFinal.browser.test.ts`'s day: a slice whose first call
 * comes about nine minutes in, so a skip stops at it quickly.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5931.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openEverydayDoor,
  openPage,
  openTwoTabs,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { ATTEMPT_KEY } from '../persist/attempt.js';
import { SESSION_KEY } from '../persist/types.js';
import { DAY_ATTEMPT_COPY } from '../shift/attempt.js';
import { ATTEMPT_HOLDS_ITS_DAY } from '../shift/banking.js';
import { PRACTICE_DAY_SENTENCES } from '../shift/scoredCrowd.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5931, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

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

/** The stored week on Crown Hotel's contract, as `{ closedDay, days }`, or `undefined`. */
async function weekOn(page: Page): Promise<{ readonly closedDay: number | null; readonly days: string } | undefined> {
  return page.evaluate(
    ({ key, tower }) => {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return undefined;
      const session = (JSON.parse(raw) as { session?: { week?: unknown; parkedWeeks?: unknown[] } }).session;
      const weeks = [session?.week, ...(session?.parkedWeeks ?? [])] as ({
        contractId: string;
        closedDay: number | null;
        history: { day: number; minutePct: number; carried: number }[];
      } | undefined)[];
      const week = weeks.find((entry) => entry?.contractId === tower);
      if (week === undefined) return undefined;
      return {
        closedDay: week.closedDay,
        days: JSON.stringify(week.history.map((entry) => [entry.day, entry.minutePct, entry.carried])),
      };
    },
    { key: SESSION_KEY, tower: TOWER },
  );
}

/** The stored attempt on Crown Hotel's day, as the slot holds it, or `undefined`. */
async function storedAttempt(
  page: Page,
): Promise<{ readonly shownToS: number; readonly presses: number; readonly dispatcherId: string } | undefined> {
  return page.evaluate(
    ({ key, tower }) => {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return undefined;
      const slot = JSON.parse(raw) as {
        attempts?: Record<string, { shownToS: number; interventions: unknown[]; dispatcherId: string }>;
      };
      const attempt = slot.attempts?.[tower];
      if (attempt === undefined) return undefined;
      return { shownToS: attempt.shownToS, presses: attempt.interventions.length, dispatcherId: attempt.dispatcherId };
    },
    { key: ATTEMPT_KEY, tower: TOWER },
  );
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

/** The brief's primary pressed, and the stage waited for until it is closable. */
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

/** One *Skip to the end*, which stops at the next call (§ D1151); the stage's clock there. */
async function skipToTheCall(page: Page): Promise<string> {
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
    undefined,
    { timeout: 240_000 },
  );
  await page.locator('.everyday-stage-skip').click();
  await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 240_000 });
  return textOf(page, '.everyday-stage-clock');
}

/** Pressed until the day has run out: with a card up the first press asks (§ D1324) and the next answers it. */
async function skipAll(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const skip = document.querySelector<HTMLButtonElement>('.everyday-stage-skip');
      if (skip === null || skip.disabled) return true;
      skip.click();
      return false;
    },
    undefined,
    { timeout: 240_000, polling: 500 },
  );
}

async function closeTheDay(page: Page): Promise<string> {
  await page.locator('.everyday-bar-primary').click();
  if ((await page.locator('.everyday-stage-call-confirm:not([hidden])').count()) > 0) {
    await page.locator('.everyday-stage-call-confirm-file').click();
  }
  await page.waitForSelector('.everyday-report', { timeout: 60_000 });
  return textOf(page, '.everyday-report');
}

/** § 3.4's strip from the stage's rail menu: *Leave the day for now?*, left, onto the modes. */
async function leaveForTheMenu(page: Page): Promise<void> {
  await page.locator('.everyday-rail-menu').click();
  await page.waitForSelector('.everyday-bar-confirm-leave', { timeout: 15_000 });
  await page.locator('.everyday-bar-confirm-leave').click();
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
}

describe.skipIf(!HAS_BROWSER)('the one attempt is final through every door — wave AO', () => {
  it('the Dispatcher workshop runs nothing of the day while its attempt stands', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      const stageClock = await skipToTheCall(page);
      await page.waitForTimeout(1_000);
      const before = await storedAttempt(page);
      expect(before, 'no attempt was stored at the call').toBeDefined();

      await leaveForTheMenu(page);
      await page.click('.everyday-rail button:has-text("Dispatcher workshop")');
      await page.waitForSelector('.everyday-workshop', { timeout: 15_000 });
      /* A style card the attempt is not driven by: drawn disabled, and a click dispatched on it writes nothing. */
      const card = page.locator('.everyday-workshop-style:not([style*="amber"])').first();
      expect(await card.isDisabled(), 'a style card could still be pressed').toBe(true);
      await card.dispatchEvent('click');
      await page.waitForTimeout(500);
      const primary = page.locator('.everyday-bar-primary');
      expect(await primary.isDisabled(), '“Run a day with this” could still be pressed').toBe(true);
      expect(await textOf(page, '.everyday-bar-note'), 'the bar did not say why').toBe(ATTEMPT_HOLDS_ITS_DAY);
      expect(await textOf(page, '.everyday-workshop-held'), 'the workshop did not say why').toBe(ATTEMPT_HOLDS_ITS_DAY);
      expect(
        await page.locator('.everyday-workshop-style[style*="amber"]').count(),
        'the style card moved the working copy',
      ).toBeLessThanOrEqual(1);
      await primary.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(1_500);
      expect(await page.locator('.everyday-stage-canvas').count(), 'the workshop opened the stage').toBe(0);

      /* Back to the day the way a player takes it: the modes, Scenario, the door, the brief, *Resume*. */
      await page.locator('.everyday-bar-leave').click();
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
      await toCrownsBrief(page);
      expect(await textOf(page, '.everyday-bar-primary')).toMatch(/^Resume /u);
      await ontoTheStage(page);
      expect(await textOf(page, '.everyday-stage-practice')).not.toBe(PRACTICE_DAY_SENTENCES.attempt);
      expect((await storedAttempt(page))?.dispatcherId, 'the workshop changed the attempt’s driver').toBe(before?.dispatcherId);
      await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 60_000 }).catch(() => undefined);
      if ((await page.locator('.everyday-stage-call:not([hidden])').count()) === 0) await skipToTheCall(page);
      expect(minutesOf(await textOf(page, '.everyday-stage-clock'))).toBe(minutesOf(stageClock));
      await skipAll(page);
      const report = await closeTheDay(page);
      expect(report).not.toMatch(/Practice\./u);
      expect((await weekOn(page))?.closedDay).toBe(1);
    } finally {
      await page.close();
    }
  });

  it('a second tab opened at a held call neither resumes nor writes the attempt, and the first tab banks', async () => {
    const device = await openTwoTabs(browser, { viewport: { width: 1440, height: 900 } });
    try {
      const [first, second] = device.tabs;
      await load(first);
      await toCrownsBrief(first);
      await ontoTheStage(first);
      await skipToTheCall(first);
      await first.waitForTimeout(1_000);
      const held = await storedAttempt(first);

      await load(second);
      await toCrownsBrief(second);
      expect(await textOf(second, '.everyday-bar-primary'), 'the second tab offered to resume the attempt').not.toMatch(
        /^Resume /u,
      );
      expect(await textOf(second, '.everyday-bar-note')).toBe(DAY_ATTEMPT_COPY.elsewhereNote);
      await second.waitForTimeout(1_500);
      expect(await storedAttempt(second), 'the second tab wrote the attempt').toEqual(held);

      await first.bringToFront();
      await skipAll(first);
      expect(await closeTheDay(first)).not.toMatch(/Practice\./u);
      expect((await weekOn(first))?.closedDay).toBe(1);
    } finally {
      await device.close();
    }
  });

  /*
   * Wave AP, lane AP-D1, § D1448, the post-AO panel's seat D (D7). A second tab sent to the stage by
   * the mode picker's *Continue your week* while the first held the attempt drew the page's own run
   * under the veil: an 08:30 hour, another car booked out, other bars, and a live *▶ Play*. Red before
   * on the bundle: clock 08:30, *Car D booked out 08:45–09:00*, Play and Skip both pressable.
   */
  it('a second tab sent to the stage by Continue your week shows no other day behind the veil, and takes no press', async () => {
    const device = await openTwoTabs(browser, { viewport: { width: 1440, height: 900 } });
    try {
      const [first, second] = device.tabs;
      await load(first);
      await toCrownsBrief(first);
      await ontoTheStage(first);
      await skipToTheCall(first);
      await first.waitForTimeout(1_000);
      const held = await storedAttempt(first);

      await load(second);
      await leaveTutorialIfOffered(second);
      await second.locator('.everyday-continue-week').click();
      await second.waitForSelector('.everyday-stage-canvas', { timeout: 30_000 });
      await second.waitForFunction(
        (line) => (document.querySelector('.everyday-stage-status-text')?.textContent ?? '').includes(line),
        DAY_ATTEMPT_COPY.elsewhereStage,
        { timeout: 60_000 },
      );
      await second.waitForTimeout(3_000);
      expect(await textOf(second, '.everyday-stage-clock'), 'a run stood behind the veil').toBe('');
      expect(await textOf(second, '.everyday-stage'), 'another day’s booking behind the veil').not.toMatch(/booked out/u);
      expect(await second.locator('.everyday-stage-play').isDisabled(), '▶ Play was live behind the veil').toBe(true);
      expect(await second.locator('.everyday-stage-skip').isDisabled(), 'the skip was live behind the veil').toBe(true);
      expect(await second.getAttribute('.everyday-stage-play', 'title')).toBe(DAY_ATTEMPT_COPY.elsewhereStage);
      expect(await storedAttempt(second), 'the second tab wrote the attempt').toEqual(held);

      await first.bringToFront();
      await skipAll(first);
      expect(await closeTheDay(first)).not.toMatch(/Practice\./u);
    } finally {
      await device.close();
    }
  });

  it('a takeover pressed in the second tab opens no further than the attempt was shown, and only that tab banks', async () => {
    const device = await openTwoTabs(browser, { viewport: { width: 1440, height: 900 } });
    try {
      const [first, second] = device.tabs;
      await load(first);
      await toCrownsBrief(first);
      await ontoTheStage(first);
      const firstClock = await skipToTheCall(first);
      await first.waitForTimeout(1_000);

      await load(second);
      await toCrownsBrief(second);
      expect(await textOf(second, '.everyday-bar-primary')).toMatch(/ here$/u);
      await ontoTheStage(second);
      expect(minutesOf(await textOf(second, '.everyday-stage-clock')), 'the takeover opened past the first tab’s reach').toBeLessThanOrEqual(
        minutesOf(firstClock),
      );

      /* The first tab has stopped: its close is gone, and a press there writes nothing. */
      await first.bringToFront();
      await first.waitForFunction(
        () => !(document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
        undefined,
        { timeout: 15_000 },
      );
      expect(await textOf(first, '.everyday-stage-status-text')).toBe(DAY_ATTEMPT_COPY.elsewhereStage);
      const heldClock = await textOf(first, '.everyday-stage-clock');
      await first.locator('.everyday-stage-skip').click({ force: true, timeout: 2_000 }).catch(() => undefined);
      await first.waitForTimeout(1_500);
      expect(await textOf(first, '.everyday-stage-clock'), 'the first tab played on past where it was held').toBe(heldClock);
      const taken = await storedAttempt(first);
      await first.locator('.everyday-stage-call button').first().click({ force: true, timeout: 2_000 }).catch(() => undefined);
      await first.waitForTimeout(1_500);
      expect(await storedAttempt(first), 'the first tab wrote the attempt after it was taken over').toEqual(taken);

      await second.bringToFront();
      await skipAll(second);
      expect(await closeTheDay(second)).not.toMatch(/Practice\./u);
      const banked = await weekOn(second);
      expect(banked?.closedDay).toBe(1);
      expect(await weekOn(first), 'the first tab wrote its week over the bank').toEqual(banked);
    } finally {
      await device.close();
    }
  });

  it('a tab closed without closing the day lets its attempt go to the next tab, at no later instant', async () => {
    const device = await openTwoTabs(browser, { viewport: { width: 1440, height: 900 } });
    try {
      const [first, second] = device.tabs;
      await load(first);
      await toCrownsBrief(first);
      await ontoTheStage(first);
      const firstClock = await skipToTheCall(first);
      await first.waitForTimeout(1_000);
      await first.close();

      await load(second);
      await toCrownsBrief(second);
      expect(await textOf(second, '.everyday-bar-primary')).toMatch(/^Resume /u);
      await ontoTheStage(second);
      expect(minutesOf(await textOf(second, '.everyday-stage-clock'))).toBeLessThanOrEqual(minutesOf(firstClock));
      await skipAll(second);
      expect(await closeTheDay(second)).not.toMatch(/Practice\./u);
      expect((await weekOn(second))?.closedDay).toBe(1);
    } finally {
      await device.close();
    }
  });
});
