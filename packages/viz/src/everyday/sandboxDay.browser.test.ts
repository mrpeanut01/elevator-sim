/**
 * **A sandbox day runs, plays, and leaves the week exactly where it was** — wave AO, lane AO-2,
 * [§ D1368](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## The defect this file reproduces
 *
 * The post-AN panel's seat D (D3), on a scored day's brief: *Change it anyway — the day stops
 * counting* opens *Tune the tower*; *How busy* 12 → 11.5 (or door dwell *patient*), *Run it and
 * watch*, and the stage said *"Today's day could not be simulated"*. Back on the brief it read
 * *Midtown Office … People 1,900 … tower bld-1*, and after a reload the week's day sat on
 * **Garden Apartments**. Red on `b53ab48`: the stage's failed row came up, and the brief after the
 * run named `tower bld-1`.
 *
 * ## What the cases hold
 *
 * 1. The brief's path, one value changed: the run simulates, the stage carries the sandbox
 *    sentence, the day plays, *‹ Brief* reads the brief exactly as it read before, and after a
 *    reload the door stands on the same tower and the brief reads the same again. The stored
 *    session never names a sandbox week.
 * 2. The same with the sandbox day closed: its sheet says it banked nothing and offers no next day,
 *    and the week is still on its first day with nothing filed.
 *
 * Both run before *Start the day*, so since wave AO's lane AO-1b ([§ D1362](../../../../DECISIONS.md))
 * the sandbox day meets the practice crowd, and the stage line and the sheet say so in the practice
 * crowd's words rather than the plain sandbox's.
 *
 * Midtown Office on 2026-10-10, the day seat D played: a whole authored day, so the run is the one
 * that could not be simulated, and a contract that books car D, so a sandbox that left the tower
 * alone is seen to keep it.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5932.
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
import { PRACTICE_DAY_SENTENCES } from '../shift/scoredCrowd.js';
import { PRACTICE_REHEARSAL_NOTE } from '../shift/report.js';
import { STAGE_RUN_FAILED_COPY } from './stageScreenModel.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5932, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const DATE = '2026-10-10';
const TOWER = 'c2';

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

/** Menu → Scenario → door, Midtown Office selected, then the door's primary onto the brief; the brief's text. */
async function toMidtownsBrief(page: Page): Promise<string> {
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
  return textOf(page, '.everyday-brief');
}

/** The brief's sandbox door, *How busy* down one step, and *Run it and watch*: the stage with the run on it. */
async function runASandboxDay(page: Page): Promise<void> {
  await page.click('.everyday-brief-locked-go');
  await page.waitForSelector('.everyday-tuner', { timeout: 15_000 });
  await page.locator('input[aria-label="How busy"]').evaluate((input: HTMLInputElement) => {
    input.value = String(Number(input.value) - Number(input.step));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await textOf(page, '.everyday-tuner-state')).toMatch(/^Sandbox/u);
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  /* The run is on the stage (Start up at the opening), or the stage said it could not be simulated. */
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('.everyday-stage-failed')?.style.display === 'flex' ||
      document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
    undefined,
    { timeout: 90_000 },
  );
  expect(
    await page.evaluate(() => document.querySelector<HTMLElement>('.everyday-stage-failed')?.style.display ?? 'none'),
    STAGE_RUN_FAILED_COPY.line,
  ).not.toBe('flex');
}

/** What this device has stored about the week, and every contract id the slot names anywhere. */
async function storedWeeks(page: Page): Promise<{ readonly week: { readonly contractId: string; readonly day: number; readonly history: readonly unknown[] } | undefined; readonly ids: readonly string[] }> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return { week: undefined, ids: [] };
    const session = (JSON.parse(raw) as { session?: { week?: { contractId: string; day: number; history: unknown[] }; parkedWeeks?: { contractId: string }[] } }).session;
    return {
      week: session?.week,
      ids: [session?.week?.contractId ?? '', ...(session?.parkedWeeks ?? []).map((week) => week.contractId)],
    };
  }, SESSION_KEY);
}

describe.skipIf(!HAS_BROWSER)('a sandbox day runs and cannot touch the week — § D1368', () => {
  it('runs one changed value, plays it, and the brief reads as before, after ‹ Brief and after a reload', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
      await page.goto(origin, { waitUntil: 'load' });
      const before = await toMidtownsBrief(page);
      expect(before).toContain('tower midtown-office');

      await runASandboxDay(page);
      /* The stage says what the run is, in the practice sentences' frame: before the attempt, on a practice crowd (§ D1362). */
      expect(await textOf(page, '.everyday-screen')).toContain(PRACTICE_DAY_SENTENCES.practiceCrowd);
      /* And it plays: the clock moves off the opening once Start is pressed. */
      const opening = await textOf(page, '.everyday-stage-clock');
      await page.click('.everyday-stage-start');
      await page.waitForFunction(
        (at) => (document.querySelector('.everyday-stage-clock')?.textContent ?? '').trim() !== at,
        opening,
        { timeout: 60_000 },
      );

      await page.locator('.everyday-bar-back').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      expect(await textOf(page, '.everyday-brief'), 'the brief after the sandbox is not the brief before it').toBe(before);

      const stored = await storedWeeks(page);
      expect(stored.week?.contractId).toBe(TOWER);
      expect(stored.week?.day).toBe(1);
      expect(stored.ids.filter((id) => id.startsWith('sandbox')), 'a sandbox week reached the saved session').toEqual([]);

      await page.reload({ waitUntil: 'load' });
      const reloaded = await toMidtownsBrief(page);
      expect(reloaded, 'the brief after a reload is not the brief before the sandbox').toBe(before);
      expect((await storedWeeks(page)).week?.contractId).toBe(TOWER);
    } finally {
      await page.close();
    }
  });

  it('closes as a sandbox day that banks nothing and offers no next day, and the week stays on Monday', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
      await page.goto(origin, { waitUntil: 'load' });
      await toMidtownsBrief(page);
      await runASandboxDay(page);

      await page.locator('.everyday-bar-primary').click();
      const asStands = page.getByText('Close the day as it stands');
      if (await asStands.isVisible().catch(() => false)) await asStands.click();
      await page.waitForSelector('.everyday-report', { timeout: 90_000 });
      const report = await textOf(page, '.everyday-report');
      expect(report).toContain(PRACTICE_REHEARSAL_NOTE);
      expect(await textOf(page, '.everyday-bar-primary')).not.toMatch(/Open the doors/u);

      const stored = await storedWeeks(page);
      expect(stored.week?.contractId).toBe(TOWER);
      expect(stored.week?.day).toBe(1);
      expect(stored.week?.history ?? []).toEqual([]);
    } finally {
      await page.close();
    }
  });

  /*
   * Wave AP lane AP-D2, [§ D1451](../../../../DECISIONS.md). The post-AO panel's seat D (D8): an
   * untouched tuner's *Run it and watch* began the day's counted attempt with the house driving, under
   * *the day still matches everyone else's*. Seat B (D1): a bigger car ran with no car D out and
   * closed under *An ordinary day — nothing booked*, so its clear read as *bigger cars fixed it*.
   * Red before: the untouched press's stage carried no sandbox sentence, and the changed tower's stage
   * had no car D booked.
   */
  it('runs an untouched tuner as a sandbox day, and a bigger car on the day it copies, car D booked as the day had it', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
      await page.goto(origin, { waitUntil: 'load' });
      await toMidtownsBrief(page);

      /* Untouched: a sandbox day all the same, and the day that counts is not begun. */
      await page.click('.everyday-brief-locked-go');
      await page.waitForSelector('.everyday-tuner', { timeout: 15_000 });
      expect(await textOf(page, '.everyday-tuner-state')).toMatch(/^Nothing changed yet — a sandbox day/u);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
      await page.waitForFunction(() => document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '', undefined, {
        timeout: 90_000,
      });
      expect(await textOf(page, '.everyday-screen')).toContain(PRACTICE_DAY_SENTENCES.practiceCrowd);
      await page.locator('.everyday-bar-back').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });

      /* A bigger car: the day's booking rides along, and the stage and the close say so. */
      await page.click('.everyday-brief-locked-go');
      await page.waitForSelector('.everyday-tuner', { timeout: 15_000 });
      await page.locator('.everyday-tuner button:has-text("3000 lb")').first().click();
      expect(await textOf(page, '.everyday-tuner-state')).toMatch(/^Sandbox/u);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
      await page.waitForFunction(() => document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '', undefined, {
        timeout: 90_000,
      });
      const stage = await textOf(page, '.everyday-screen');
      expect(stage).toContain('Car D booked out 10:30–13:00');
      expect(stage).toContain('This sandbox day keeps car D booked out of passenger service as the day had.');

      await page.locator('.everyday-bar-primary').click();
      const asStands = page.getByText('Close the day as it stands');
      if (await asStands.isVisible().catch(() => false)) await asStands.click();
      await page.waitForSelector('.everyday-report', { timeout: 90_000 });
      expect(await textOf(page, '.everyday-report')).toContain('car D · out of passenger service 10:30–13:00');
      expect(await page.locator('.everyday-report-sandbox').allTextContents()).toEqual([
        'This sandbox day keeps car D booked out of passenger service as the day had.',
        'Your week is where you left it, on Monday, which you have not closed.',
      ]);
      expect((await storedWeeks(page)).week?.history ?? []).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
