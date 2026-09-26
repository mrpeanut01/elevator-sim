/**
 * **The one attempt is final: no other surface runs ahead of it, files it, or banks a second close
 * of its day** — wave AM, lane AM-B, [§ D1239](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## The holes this file reproduces (the post-AL panel's seat D)
 *
 * 1. **D1.** With a call held on the stage, *Switch to Engineer* showed the unanswered branch's
 *    future (the transport behind the cover had played on at ×60), and scrubbing its timeline to the
 *    end filed the scored day with the call never answered; the stage then drew live call buttons
 *    beside *the day is filed*.
 * 2. **The building change.** On the Engineer surface mid-attempt, another building's card put that
 *    tower's day on screen, and scrubbing it to its end filed and banked a Monday there with no brief
 *    and no calls.
 * 3. **D2.** Two tabs each closed one counted day, and the second close banked and wrote its week
 *    over the first.
 *
 * ## What the cases hold
 *
 * 1. At a held call the Engineer clock never passes the stage's, a scrub to the timeline's end stops
 *    at the stage's reach, nothing is filed, and back on the stage the call is still up with no
 *    filed-day line beside it; the stage's own close then banks the attempt.
 * 2. A building picked on the Engineer surface mid-attempt, run to its end, banks nothing into that
 *    tower's week, and its sheet says why.
 * 3. A tab closing a day another tab has already closed files practice, says so, and leaves the
 *    stored week as the first close wrote it.
 *
 * Crown Hotel on 2026-10-03, `oneAttempt.browser.test.ts`'s day: a slice whose first call comes
 * about nine minutes in, so a skip stops at it quickly.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5831.
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
import { SESSION_KEY } from '../persist/types.js';
import { PRACTICE_ENGINEER_NOTE, PRACTICE_OTHER_TAB_NOTE } from '../shift/report.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5831, strictPort: false } });
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

/** Every week this device has stored, live and parked, as `{ contractId, closedDay, days }`. */
async function storedWeeks(
  page: Page,
): Promise<readonly { readonly contractId: string; readonly closedDay: number | null; readonly days: string }[]> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const session = (JSON.parse(raw) as { session?: { week?: unknown; parkedWeeks?: unknown[] } }).session;
    const weeks = [session?.week, ...(session?.parkedWeeks ?? [])] as ({
      contractId: string;
      closedDay: number | null;
      history: { day: number; minutePct: number; carried: number }[];
    } | undefined)[];
    return weeks
      .filter((week) => week !== undefined)
      .map((week) => ({
        contractId: week!.contractId,
        closedDay: week!.closedDay,
        days: JSON.stringify(week!.history.map((entry) => [entry.day, entry.minutePct, entry.carried])),
      }));
  }, SESSION_KEY);
}

async function weekOn(page: Page, contractId: string): Promise<{ readonly closedDay: number | null; readonly days: string } | undefined> {
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

/** Pressed until the day has run out, each press with a card up answering it. */
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

/** Click the Engineer timeline at its right end: a scrub to the run's end. */
async function scrubToTheEnd(page: Page): Promise<void> {
  /* Dispatched at the timeline's own right edge, so it lands wherever the page has scrolled it. */
  await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>('#timeline');
    const box = line?.getBoundingClientRect();
    if (line === null || line === undefined || box === undefined) throw new Error('no Engineer timeline');
    line.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.right - 2, clientY: box.top + box.height / 2 }));
  });
}

describe.skipIf(!HAS_BROWSER)('the one attempt is final — § D1239', () => {
  it('the Engineer surface never runs past a held call, and scrubbing it files nothing', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      const stageClock = await skipToTheFirstCall(page);

      await toEngineer(page);
      /* Given time, the transport behind the cover had played on past the call at ×60. */
      await page.waitForTimeout(3_000);
      const engineerClock = await textOf(page, '#clock');
      expect(minutesOf(engineerClock), `Engineer ${engineerClock} ran past the call at ${stageClock}`).toBeLessThanOrEqual(
        minutesOf(stageClock),
      );
      await scrubToTheEnd(page);
      await page.waitForTimeout(3_000);

      await backToEveryday(page);
      await page.waitForTimeout(2_000);
      /* The Engineer header is still in the page behind the cover, and it reads where the scrub left it. */
      const scrubbed = await textOf(page, '#clock');
      expect(minutesOf(scrubbed), `the scrub showed ${scrubbed}, past the call at ${stageClock}`).toBeLessThanOrEqual(
        minutesOf(stageClock),
      );
      expect((await weekOn(page, TOWER))?.days, 'the Engineer surface filed the attempt').toBe('[]');
      expect(await page.locator('.everyday-stage-call').isHidden()).toBe(false);
      expect(await textOf(page, '.everyday-stage-intervene-refusal')).not.toMatch(/filed/u);

      /* The attempt's own close still banks it. */
      await skipAll(page);
      const report = await closeTheDay(page);
      expect(report).not.toMatch(/Practice\./u);
      expect((await weekOn(page, TOWER))?.closedDay).toBe(1);
    } finally {
      await page.close();
    }
  });

  it('another building picked on the Engineer surface mid-attempt banks nothing into its week', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await ontoTheStage(page);
      await skipToTheFirstCall(page);

      await toEngineer(page);
      await page.locator('#seg-building').click();
      await page.waitForFunction(
        () => [...document.querySelectorAll('#rail-building-list > *')].some((card) => /Chancery House/u.test(card.textContent ?? '')),
        undefined,
        { timeout: 15_000 },
      );
      await page.evaluate(() => {
        const card = [...document.querySelectorAll<HTMLElement>('#rail-building-list > *')].find((entry) =>
          /Chancery House/u.test(entry.textContent ?? ''),
        );
        (card?.querySelector<HTMLElement>('button') ?? card)?.click();
      });
      /* Scrubbed to its end until Chancery House's day has been filed on the Engineer sheet. */
      await page.waitForFunction(
        () => {
          const sheet = document.querySelector('#panel-report')?.textContent ?? '';
          if (/Chancery House/u.test(sheet) && /day 1/u.test(sheet) && !/Nothing filed yet/u.test(sheet)) return true;
          const line = document.querySelector<HTMLElement>('#timeline');
          const box = line?.getBoundingClientRect();
          if (line !== null && line !== undefined && box !== undefined) {
            line.dispatchEvent(
              new MouseEvent('click', { bubbles: true, clientX: box.right - 2, clientY: box.top + box.height / 2 }),
            );
          }
          return false;
        },
        undefined,
        { timeout: 240_000, polling: 1_000 },
      );
      const sheet = await textOf(page, '#panel-report');
      expect(sheet).toContain(PRACTICE_ENGINEER_NOTE);
      const chancery = (await storedWeeks(page)).find((week) => week.contractId !== TOWER && week.days !== '[]');
      expect(chancery, 'a week other than the attempt’s banked a day from the Engineer surface').toBeUndefined();
    } finally {
      await page.close();
    }
  });

  it('a second tab’s close of a day the first tab closed is practice, says so, and leaves the stored week alone', async () => {
    const device = await openTwoTabs(browser, { viewport: { width: 1440, height: 900 } });
    try {
      const [first, second] = device.tabs;
      await load(first);
      await toCrownsBrief(first);
      await ontoTheStage(first);
      await skipToTheFirstCall(first);

      /* The second tab resumes the same attempt and closes it: that close banks. */
      await load(second);
      await toCrownsBrief(second);
      expect(await textOf(second, '.everyday-bar-primary')).toMatch(/^Resume /u);
      await ontoTheStage(second);
      await skipAll(second);
      expect(await closeTheDay(second)).not.toMatch(/Practice\./u);
      const banked = await weekOn(second, TOWER);
      expect(banked?.closedDay).toBe(1);

      /* The first tab, still holding the day open in memory, plays on and closes it. */
      await first.bringToFront();
      await skipAll(first);
      const report = await closeTheDay(first);
      expect(report, 'the first tab banked a day another tab had already closed').toContain(PRACTICE_OTHER_TAB_NOTE);
      expect(await weekOn(first, TOWER), 'the first tab wrote its week over the banked close').toEqual(banked);
    } finally {
      await device.close();
    }
  });
});
