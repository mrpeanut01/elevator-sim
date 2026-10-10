/**
 * **While a scored attempt stands, the Engineer surface only watches** — wave AN, lane AN-6,
 * [§ D1323](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## The back doors this file reproduces (the post-AM panel's seat D)
 *
 * 1. **D3, first half.** A building card on the Engineer surface at a held call moved the week to
 *    another tower while the stage still drew the attempt's run; back in Everyday Mode the stage
 *    could not close (*the day has not started yet*).
 * 2. **D3, second half.** A building card picked later in a session parked a copy of the week from
 *    the render that last rebuilt the card list, so a day already filed reopened and banked again.
 * 3. **D2.** A dispatcher card made a practice of the attempt's own crowd, which the stage adopted and
 *    stopped at the identical call: every answer could be rehearsed and then given for score.
 * 4. **D1.** *Save recording* at a held call downloaded the whole unanswered day.
 * 5. **After a reload**, the Engineer surface stands on the page's own run of the attempt's day,
 *    which carries the attempt's crowd and none of its presses; it played on past the attempt's open
 *    call at ×60 and scrubbed to its end.
 *
 * Crown Hotel on 2026-10-03, `attemptIsFinal.browser.test.ts`'s day: a slice whose first call comes
 * about nine minutes in, so a skip stops at it quickly.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5873.
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
import {
  ATTEMPT_ENGINEER_WATCHES_ONLY,
  ATTEMPT_NOT_SAVED,
  ATTEMPT_RAIL_NOTE,
} from '../shift/banking.js';
import { PRACTICE_NOTE } from '../shift/report.js';
import { PRACTICE_DAY_SENTENCES } from '../shift/scoredCrowd.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5873, strictPort: false } });
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

/** Every week this device has stored, live and parked, as `{ contractId, day, closedDay, days }`. */
async function storedWeeks(
  page: Page,
): Promise<readonly { readonly contractId: string; readonly day: number; readonly closedDay: number | null; readonly days: readonly number[] }[]> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const session = (JSON.parse(raw) as { session?: { week?: unknown; parkedWeeks?: unknown[] } }).session;
    const weeks = [session?.week, ...(session?.parkedWeeks ?? [])] as ({
      contractId: string;
      day: number;
      closedDay: number | null;
      history: { day: number }[];
    } | undefined)[];
    return weeks
      .filter((week) => week !== undefined)
      .map((week) => ({
        contractId: week!.contractId,
        day: week!.day,
        closedDay: week!.closedDay,
        days: week!.history.map((entry) => entry.day),
      }));
  }, SESSION_KEY);
}

async function weekOn(page: Page, contractId: string) {
  return (await storedWeeks(page)).find((week) => week.contractId === contractId);
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

/** One *Skip to the end*, which stops at the day's first call (§ D1151); the stage's clock there. */
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

/**
 * Pressed until the day has run out. A press with a card up asks first (§ D1324), and a second press
 * answers the call as skipped, as the close's own question does.
 */
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

async function toEngineer(page: Page): Promise<void> {
  await page.locator('.everyday-engineer-swap').click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('.shell')?.inert === false &&
      document.querySelector<HTMLElement>('.everyday')?.style.visibility === 'hidden',
    undefined,
    { timeout: 15_000 },
  );
}

async function backToEveryday(page: Page): Promise<void> {
  await page.locator('#back-to-everyday').click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('.shell')?.inert === true &&
      document.querySelector<HTMLElement>('.everyday')?.style.visibility === '',
    undefined,
    { timeout: 15_000 },
  );
}

/** Open a rail segment and click the card whose title matches `name` (or, with none, any card not pressed). */
async function pickRailCard(page: Page, segment: 'building' | 'dispatcher', name?: RegExp): Promise<string> {
  await page.locator(`#seg-${segment}`).click();
  const list = `#rail-${segment}-list`;
  await page.waitForFunction((selector) => document.querySelectorAll(`${selector} .pick`).length > 1, list, {
    timeout: 15_000,
  });
  return page.evaluate(
    ({ selector, source }) => {
      const pattern = source === null ? null : new RegExp(source, 'u');
      const cards = [...document.querySelectorAll<HTMLButtonElement>(`${selector} .pick`)];
      const card = cards.find((entry) =>
        pattern === null
          ? entry.getAttribute('aria-pressed') !== 'true'
          : pattern.test(entry.querySelector('.pick-title')?.textContent ?? ''),
      );
      if (card === undefined) throw new Error(`no card to pick in ${selector}`);
      card.click();
      return card.querySelector('.pick-title')?.textContent ?? '';
    },
    { selector: list, source: name?.source ?? null },
  );
}

/** The rule's note above the rail's cards, read where it is drawn: shown, and in the shipped words. */
async function railNoteShown(page: Page, segment: 'building' | 'dispatcher'): Promise<string> {
  return page.evaluate((id) => {
    const panel = document.getElementById(`rail-panel-${id}`) ?? document.getElementById(`rail-${id}-list`)?.parentElement;
    const note = panel?.querySelector<HTMLElement>('.rail-attempt-note');
    return note === null || note === undefined || note.hidden ? '' : (note.textContent ?? '');
  }, segment);
}

describe.skipIf(!HAS_BROWSER)('the Engineer surface only watches a scored attempt — § D1323', () => {
  it('a building card at a held call moves nothing, says why, and the stage still closes and banks', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      const stageClock = await skipToTheFirstCall(page);

      await toEngineer(page);
      await pickRailCard(page, 'building', /Chancery House/u);
      await page.waitForTimeout(1_500);
      expect(await textOf(page, '#status'), 'the building card was not refused').toBe(ATTEMPT_ENGINEER_WATCHES_ONLY);
      expect(await railNoteShown(page, 'building'), 'the rule was not drawn where the card is').toBe(ATTEMPT_RAIL_NOTE);
      expect(await page.inputValue('#pick-building')).toBe('crown-hotel');
      expect((await weekOn(page, TOWER))?.day, 'the week moved off the attempt’s tower').toBe(1);

      await backToEveryday(page);
      expect(await page.locator('.everyday-stage-call').isHidden(), 'the call went away under the stage').toBe(false);
      expect(await textOf(page, '.everyday-stage-clock')).toBe(stageClock);
      await skipAll(page);
      const report = await closeTheDay(page);
      expect(report).not.toMatch(/Practice\./u);
      expect((await weekOn(page, TOWER))?.closedDay, 'the attempt did not bank').toBe(1);
      const elsewhere = (await storedWeeks(page)).filter((week) => week.contractId !== TOWER && week.days.length > 0);
      expect(elsewhere, 'another tower banked a day').toEqual([]);
    } finally {
      await page.close();
    }
  });

  it('a building card picked after a day closed parks the week as it stands, so the filed day stays filed', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      await skipAll(page);
      await closeTheDay(page);
      expect((await weekOn(page, TOWER))?.days).toEqual([1]);
      /* *Open the doors on Tuesday*: day 2's brief, with no attempt begun on it, so the card is free. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      expect((await weekOn(page, TOWER))?.day).toBe(2);

      await toEngineer(page);
      await pickRailCard(page, 'building', /Chancery House/u);
      await page.waitForFunction(() => (document.getElementById('pick-building') as HTMLSelectElement | null)?.value === 'chancery-house', undefined, {
        timeout: 15_000,
      });
      const parked = await weekOn(page, TOWER);
      expect(parked?.days, 'the week parked behind the card is a copy from before the filed day').toEqual([1]);
      expect(parked?.day).toBe(2);
    } finally {
      await page.close();
    }
  });

  it('a dispatcher card at a held call makes no practice of the attempt’s crowd', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      const stageClock = await skipToTheFirstCall(page);

      await toEngineer(page);
      await pickRailCard(page, 'dispatcher');
      await page.waitForTimeout(1_500);
      expect(await textOf(page, '#status'), 'the dispatcher card was not refused').toBe(ATTEMPT_ENGINEER_WATCHES_ONLY);
      expect(await railNoteShown(page, 'dispatcher')).toBe(ATTEMPT_RAIL_NOTE);

      await backToEveryday(page);
      await page.waitForTimeout(3_000);
      expect(await textOf(page, '.everyday-stage-practice'), 'the stage adopted a practice of the attempt’s crowd').not.toBe(
        PRACTICE_DAY_SENTENCES.attempt,
      );
      expect(await page.locator('.everyday-stage-call').isHidden()).toBe(false);
      expect(await textOf(page, '.everyday-stage-clock')).toBe(stageClock);
      await skipAll(page);
      expect(await closeTheDay(page)).not.toContain(PRACTICE_NOTE);
    } finally {
      await page.close();
    }
  });

  it('Save recording at a held call saves nothing and says why', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      await skipToTheFirstCall(page);

      await toEngineer(page);
      const downloads: string[] = [];
      page.on('download', (download) => {
        downloads.push(download.suggestedFilename());
      });
      /* Forced: since wave AO, lane AO-4 the button is drawn unavailable (`aria-disabled`) while the attempt stands, and a press still refuses in words. */
      await page.locator('#save-recording').click({ force: true });
      await page.waitForTimeout(2_000);
      expect(downloads, 'the whole day was handed over').toEqual([]);
      expect(await textOf(page, '#status')).toBe(ATTEMPT_NOT_SAVED);
    } finally {
      await page.close();
    }
  });

  it('after a reload, the page’s own run of the attempt’s day is held at the attempt’s reach', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      const stageClock = await skipToTheFirstCall(page);
      /* Give the attempt's reach time to be written before the page goes. */
      await page.waitForTimeout(1_000);

      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await leaveTutorialIfOffered(page);
      await toEngineer(page);
      await page.waitForTimeout(3_000);
      const engineerClock = await textOf(page, '#clock');
      expect(minutesOf(engineerClock), `Engineer ${engineerClock} ran past the call at ${stageClock}`).toBeLessThanOrEqual(
        minutesOf(stageClock),
      );
      /* Scrubbed to its end, it stops at the attempt's reach. */
      await page.evaluate(() => {
        const line = document.querySelector<HTMLElement>('#timeline');
        const box = line?.getBoundingClientRect();
        if (line === null || line === undefined || box === undefined) throw new Error('no Engineer timeline');
        line.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.right - 2, clientY: box.top + box.height / 2 }));
      });
      await page.waitForTimeout(1_500);
      const scrubbed = await textOf(page, '#clock');
      expect(minutesOf(scrubbed), `the scrub showed ${scrubbed}, past the call at ${stageClock}`).toBeLessThanOrEqual(
        minutesOf(stageClock),
      );
    } finally {
      await page.close();
    }
  });
});
