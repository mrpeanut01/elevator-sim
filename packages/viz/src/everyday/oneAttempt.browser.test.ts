/**
 * **One attempt per scored day: leaving the stage resumes the day rather than rewinding it** — wave
 * AL, lane AL-E, [§ D1218](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## The hole this file reproduces
 *
 * The post-AK panel's seat D (H6): on a scored week day, pick *Nearest car*, press *Start the day*,
 * skip to the end and do **not** close; press *‹ Brief*, pick another driver, press *Start the day*
 * again, answer the calls with what the first run showed, and close. The report said the day was
 * banked, and the failed first attempt left no trace. § D1138 clause 4 banks the first **closed**
 * attempt, so an unclosed day could be watched to its end and taken again with the answer known.
 *
 * ## What the cases hold
 *
 * 1. Seat D's path, pressed as the seat pressed it. After *‹ Brief* the brief offers to resume the
 *    day rather than to start it, and its driver cards and picker are held; resuming lands on the
 *    stage at the instant the attempt had reached (the end of the day, so there is nothing left to
 *    skip); closing files that attempt, and the week's stored day is the first attempt's run under
 *    the first attempt's driver.
 * 2. The same with a **reload** in the middle: the attempt is kept on this device, and the brief
 *    after the reload resumes it at the instant it had reached rather than opening a fresh run.
 *
 * Crown Hotel on 2026-10-03, `dayCalls.browser.test.ts`'s day: a slice, so each call's two runs
 * take a fraction of a second, and a day that raises calls, so a skip has calls to stop at.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5771.
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
  site = await startShippedSite({ preview: { port: 5771, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const DATE = '2026-10-03';
const TOWER = 'c7';
/** Seat D's first driver, and the one the second try would have swapped away from. */
const FIRST_DRIVER = 'nearest-car';
const SECOND_DRIVER = 'collective';

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

/** The week's stored record of `day`, as the session slot holds it — `dayCalls.browser.test.ts`'s reader. */
async function storedDay(page: Page, day: number): Promise<{ readonly record?: { readonly dispatcherId?: string } } | null> {
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
      return (walk(JSON.parse(raw)) ?? null) as never;
    },
    { key: SESSION_KEY, day },
  );
}

/** Menu → Scenario → door, Crown Hotel selected, then the door's primary onto the brief. */
async function toCrownsBrief(page: Page): Promise<void> {
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
}

/** The stage with a run of the player's own on it and closable. */
async function waitForStage(page: Page): Promise<void> {
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  await page.waitForFunction(
    () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
    undefined,
    { timeout: 240_000 },
  );
}

/** Seat D's first attempt: the first driver picked, *Start the day*, then skipped to its end unclosed; the end's clock. */
async function watchTheDayOutUnclosed(page: Page): Promise<string> {
  await page.selectOption('.everyday-brief-picker', FIRST_DRIVER);
  await page.waitForFunction(
    (id) => document.querySelector<HTMLSelectElement>('.everyday-brief-picker')?.value === id,
    FIRST_DRIVER,
    { timeout: 15_000 },
  );
  expect(await textOf(page, '.everyday-bar-primary')).toBe('Start the day');
  await page.locator('.everyday-bar-primary').click();
  await waitForStage(page);
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
    undefined,
    { timeout: 240_000 },
  );
  /* § D1151: a skip stops at each call; each press with a card up answers it, until nothing is left. */
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
  return textOf(page, '.everyday-stage-clock');
}

/** What the brief offers once an attempt stands: its primary, and whether the driver can move. */
async function briefOffer(page: Page): Promise<{ readonly primary: string; readonly pickerHeld: boolean; readonly cardsHeld: boolean }> {
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  return page.evaluate(() => ({
    primary: (document.querySelector('.everyday-bar-primary')?.textContent ?? '').trim(),
    pickerHeld: document.querySelector<HTMLSelectElement>('.everyday-brief-picker')?.disabled === true,
    cardsHeld: [...document.querySelectorAll<HTMLButtonElement>('.everyday-brief-style')].every((card) => card.disabled),
  }));
}

/** Resume from the brief, and read the stage it lands on: whether the day is at its end, and its clock. */
async function resumeAndRead(page: Page): Promise<{ readonly skipDisabled: boolean; readonly clock: string }> {
  await page.locator('.everyday-bar-primary').click();
  await waitForStage(page);
  /*
   * The resumed run is on the stage once the transport is built over it (after a reload, once its
   * re-simulation lands). A day resumed at its end leaves nothing to skip; a stage that rewound it
   * never gets there, and the read below says so.
   */
  await page
    .waitForFunction(
      () =>
        document.querySelector<HTMLButtonElement>('.everyday-stage-skip')?.disabled === true &&
        /\d{2}:\d{2}/u.test(document.querySelector('.everyday-stage-clock')?.textContent ?? ''),
      undefined,
      { timeout: 120_000 },
    )
    .catch(() => undefined);
  return page.evaluate(() => ({
    skipDisabled: document.querySelector<HTMLButtonElement>('.everyday-stage-skip')?.disabled === true,
    clock: document.querySelector('.everyday-stage-clock')?.textContent ?? '',
  }));
}

async function closeAndRead(page: Page): Promise<string> {
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-report', { timeout: 60_000 });
  return textOf(page, '.everyday-report');
}

describe.skipIf(!HAS_BROWSER)('one attempt per scored day — § D1218', () => {
  it('an unclosed day watched to its end is resumed from the brief, not rewound, and banks as that attempt', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
      await page.goto(origin, { waitUntil: 'load' });
      await toCrownsBrief(page);
      const endClock = await watchTheDayOutUnclosed(page);

      /* Seat D's *‹ Brief*: the brief now resumes the attempt and holds the driver. */
      await page.locator('.everyday-bar-back').click();
      const offer = await briefOffer(page);
      expect(offer.primary, 'the brief offered a fresh start over an unclosed attempt').toMatch(/^Resume /u);
      expect(offer.pickerHeld, 'the brief let the driver change under an open attempt').toBe(true);
      expect(offer.cardsHeld, 'the brief let a driver card change under an open attempt').toBe(true);
      await page.locator(`.everyday-brief-style[data-dispatcher="${SECOND_DRIVER}"]`).click({ force: true }).catch(() => undefined);

      /* Resumed at the end the attempt had reached: nothing to skip, no Start at the day's opening. */
      const stage = await resumeAndRead(page);
      expect(stage, 'the stage rewound the attempt to the start of the day').toEqual({ skipDisabled: true, clock: endClock });

      const report = await closeAndRead(page);
      expect(report).not.toContain(PRACTICE_NOTE);
      const banked = await storedDay(page, 1);
      expect(banked?.record?.dispatcherId, 'the week banked a run other than the first attempt').toBe(FIRST_DRIVER);
    } finally {
      await page.close();
    }
  });

  it('a reload keeps the attempt: the brief resumes it at the instant it had reached', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
      await page.goto(origin, { waitUntil: 'load' });
      await toCrownsBrief(page);
      const endClock = await watchTheDayOutUnclosed(page);

      await page.reload({ waitUntil: 'load' });
      await toCrownsBrief(page);
      const offer = await briefOffer(page);
      expect(offer.primary, 'a reload handed back a fresh start over an unclosed attempt').toMatch(/^Resume /u);
      expect(offer.pickerHeld).toBe(true);

      const stage = await resumeAndRead(page);
      expect(stage, 'the resumed attempt did not open where it had reached').toEqual({ skipDisabled: true, clock: endClock });

      const report = await closeAndRead(page);
      expect(report).not.toContain(PRACTICE_NOTE);
      const banked = await storedDay(page, 1);
      expect(banked?.record?.dispatcherId, 'the week banked a run other than the first attempt').toBe(FIRST_DRIVER);
    } finally {
      await page.close();
    }
  });
});
