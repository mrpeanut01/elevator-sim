/**
 * **A day's presses are its own, a mode's crowd stays in its mode, and a closed today opens
 * tomorrow** — the post-AH panel's defects, on the shipped bundle. [§ D1002](../../../../DECISIONS.md),
 * [§ D1003](../../../../DECISIONS.md), [§ D1004](../../../../DECISIONS.md).
 *
 * ## Why these cases are the deliverable
 *
 * Every defect here passed a green suite, and for one reason: no case walked from one run to the
 * next. A press on Garden Apartments' day replayed in Crown Hotel's untouched day and was credited
 * to the player on its sheet; a second attempt from the brief carried five earlier presses under a
 * stage that showed one; a reload on a career report or mid-rush put that mode's crowd on the
 * Scenario week, and `weekSurvives.browser.test.ts`'s own reload passed `?seed=` explicitly, which
 * is the one address that hides it; and a closed Monday left from its report came back to a door
 * whose only press re-ran Monday. Each case below was run on the bundle built from the tree before
 * the fix and failed there, as the lane's report records.
 *
 * ## What it drives
 *
 * **The shipped bundle**, through {@link startShippedSite}, and every press is the player's own,
 * read back from the screen a player reads it on. Crown Hotel's pinned day (`c7`) is the tower most
 * cases play, because it is a slice that simulates in seconds and it is the day whose verdict a
 * press decides.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass — which is
 * why the tier is run with it set, and why a count of cases, not the word *passed*, is what to check.
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

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /* A port of its own for the tier's distinct-port clause; `strictPort: false` so a busy one moves. */
  site = await startShippedSite({ preview: { port: 5713, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** The pinned day these cases play — a slice, and a day a press decides. */
const PRESS_DAY = 'c7';

/** Every press a report can carry, in `live/interventions.ts#stampVerbOf`'s words, with its clock. */
const PRESS_STAMP = /\d{2}:\d{2} · (parked the cars in the lobby|spread the cars across the tower)/gu;

/** A cold load of `query`, past the menu cover and any first-visit offer, on the mode picker. */
async function coldLoad(page: Page, query = ''): Promise<void> {
  await page.goto(`${origin}${query === '' ? '' : `?${query}`}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await leaveTutorialIfOffered(page);
}

/** A reload, taken the way a player takes one — whatever the address bar says is what loads. */
async function reload(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await leaveTutorialIfOffered(page);
}

/** Whitespace-folded text of a selector, `''` when absent. */
async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

/** § 3.4's leave: the rail's main-menu row, answering the confirm strip when a run is open. */
async function toModes(page: Page): Promise<void> {
  await page.locator('.everyday-rail-menu').click();
  await page.waitForSelector('.everyday-mode[data-screen], .everyday-bar-confirm-leave', { timeout: 15_000 });
  if ((await page.locator('.everyday-bar-confirm-leave').count()) > 0) {
    await page.locator('.everyday-bar-confirm-leave').click();
  }
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
}

/** The stage has adopted today's run and is paused at its start with the day closable. */
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
 * A stage press, and the re-simulation it asks for, waited out.
 *
 * **On a pinned day played as measured the press is made at the stage's call** — wave AI,
 * [§ D1029](../../../../DECISIONS.md): the parking presses are held until the call and the answer is
 * stamped at the call second. So where the button is held this runs the day to the call at the
 * fastest rung and presses the same answer on the card, which is still one press of `kind` on this
 * attempt — the fixture these cases need — made the way a player now makes it on that day.
 */
async function press(page: Page, kind: 'park-cars-lobby' | 'spread-cars'): Promise<void> {
  const button = page.locator(`.everyday-stage-intervene[data-intervention-kind="${kind}"]`);
  if (await button.isDisabled()) {
    await page.locator('.everyday-stage-speed', { hasText: '600×' }).click();
    const start = page.locator('.everyday-stage-start');
    if (await start.isVisible()) await start.click();
    else await page.locator('.everyday-stage-play').click();
    await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 60_000 });
    await page.locator(`.everyday-stage-call-answer[data-answer="${kind}"]`).click();
    /*
     * Waited out on the refusal line rather than the page's text: the stage's overlay keeps its last
     * sentence while hidden, and on a day answered mid-run that sentence is *recomputing*.
     */
    await page.waitForFunction(
      () => {
        const line = document.querySelector('.everyday-stage-intervene-refusal')?.textContent ?? '';
        const stamp = document.querySelector('.everyday-stage-stamp')?.textContent ?? '';
        return !line.includes('recomputing') && stamp !== '';
      },
      undefined,
      { timeout: 240_000 },
    );
    return;
  }
  await button.click();
  await page.waitForFunction(
    () => !(document.body.textContent ?? '').includes('recomputing the day'),
    undefined,
    { timeout: 240_000 },
  );
}

/** § 7.3's skip, then § 3.3's *Close the day*, onto the report. */
async function skipAndClose(page: Page): Promise<void> {
  await page.locator('.everyday-stage-skip').click();
  await page.waitForFunction(
    () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('.everyday-bar-primary').click();
  /*
   * A skip stops at an unanswered call with its card up (§ D1151), and since wave AL's § D1189
   * *Close the day* then asks once, inside the card, before it files the day as it stands. These
   * cases are about which presses a sheet credits, not about the call, so the ask is answered with
   * *file it*, which is the press the old single click made.
   */
  await page.waitForSelector('.everyday-report, .everyday-stage-call-confirm:not([hidden])', { timeout: 60_000 });
  if ((await page.locator('.everyday-report').count()) === 0) {
    await page.locator('.everyday-stage-call-confirm-file').click();
    await page.waitForSelector('.everyday-report', { timeout: 60_000 });
  }
}

/** The presses the report credits to this run, as the sheet prints them. */
async function reportPresses(page: Page): Promise<readonly string[]> {
  return [...(await textOf(page, '.everyday-report')).matchAll(PRESS_STAMP)].map((match) => match[1] ?? '');
}

/** Door → brief → *Start the day* → the stage, paused at the day's start. */
async function startTheDayFromDoor(page: Page): Promise<void> {
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.locator('.everyday-bar-primary').click();
  await waitForToday(page);
}

/** The door's pinned-day row, pressed, and the door saying it stands. */
async function choosePressDay(page: Page, contractId: string): Promise<void> {
  const row = `.everyday-door-pressday[data-contract="${contractId}"]`;
  await page.click(row);
  await page.waitForSelector(`${row}[data-standing="true"]`, { timeout: 30_000 });
}

/** The crowd the door's seed line names. */
async function doorCrowd(page: Page): Promise<string> {
  return /crowd (\d+)/u.exec(await textOf(page, '.everyday-door-seed'))?.[1] ?? '';
}

describe.skipIf(!HAS_BROWSER)('§ D1002 — a day’s presses are its own', () => {
  it('does not carry a press on one tower’s day into an untouched day on another tower', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page);
      /* ---- day A: Garden Apartments, parked at the start, closed ---- */
      await openEverydayDoor(page);
      await page.locator('.everyday-door-tower[data-contract="c1"]').click();
      await page.waitForSelector('.everyday-door-tower[data-contract="c1"][data-selected="true"]', {
        timeout: 30_000,
      });
      await startTheDayFromDoor(page);
      await press(page, 'park-cars-lobby');
      await skipAndClose(page);
      /* The fixture is what it claims: the press is on day A's sheet. */
      expect(await reportPresses(page)).toEqual(['parked the cars in the lobby']);

      /* ---- day B: Crown Hotel's pinned day, nothing pressed, closed ---- */
      await toModes(page);
      await openEverydayDoor(page);
      await choosePressDay(page, PRESS_DAY);
      await startTheDayFromDoor(page);
      await skipAndClose(page);
      /* Assessor B's reading was *08:00 · parked the cars in the lobby* and *You parked …* here. */
      expect(await reportPresses(page), 'a press from another tower’s day is on this sheet').toEqual([]);
      expect(await textOf(page, '.everyday-report')).not.toMatch(/You (parked|spread) the cars/u);
    } finally {
      await page.close();
    }
  }, 300_000);

  it('starts a second attempt from the brief with no presses, so the pair is a clean experiment', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page);
      await openEverydayDoor(page);
      await choosePressDay(page, PRESS_DAY);
      await startTheDayFromDoor(page);
      await press(page, 'spread-cars');
      await skipAndClose(page);
      expect(await reportPresses(page)).toEqual(['spread the cars across the tower']);

      /* Assessor A's route back: *‹ The day*, *‹ Brief*, then *Start the day* again. */
      await page.locator('.everyday-bar-back').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
      await page.locator('.everyday-bar-back').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await waitForToday(page);
      /* Nothing pressed on this attempt, so the sheet may credit it with nothing. */
      await skipAndClose(page);
      expect(await reportPresses(page), 'the first attempt’s press rode into the second').toEqual([]);
    } finally {
      await page.close();
    }
  }, 300_000);
});

describe.skipIf(!HAS_BROWSER)('§ D1003 — a mode’s crowd stays in its mode, reload included', () => {
  it('leaves the address describing the Scenario run through a rush, so a reload mid-rush keeps the week’s crowd', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page, 'building=midtown-office&seed=424242');
      await openEverydayDoor(page);
      const crowd = await doorCrowd(page);
      expect(crowd).toBe('424242');

      await toModes(page);
      await page.locator('.everyday-mode[data-screen="rush"]').click();
      await page.waitForSelector('.everyday-rush', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
      /* Assessor B's D3: the address read `seed=90210&template=endless-rush` here. */
      const during = new URL(page.url()).searchParams;
      expect(during.get('seed'), 'the rush wrote its crowd into the address').toBe('424242');
      expect(during.get('template')).toBeNull();

      await reload(page);
      await openEverydayDoor(page);
      expect(await doorCrowd(page), 'a reload mid-rush put the rush’s crowd on the Scenario week').toBe(crowd);
    } finally {
      await page.close();
    }
  }, 300_000);

  it('does not put a career day’s crowd on the Scenario week after a reload on its report', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page, 'building=crown-hotel&seed=424242');
      await openEverydayDoor(page);
      const crowd = await doorCrowd(page);
      expect(crowd).toBe('424242');

      await toModes(page);
      await page.locator('.everyday-mode[data-screen="towers"]').click();
      await page.waitForSelector('.everyday-towers', { timeout: 15_000 });
      await page.locator('.everyday-towers-open').first().click();
      await page.waitForSelector('.everyday-building', { timeout: 15_000 });
      await page.locator('.everyday-building-to-contract').click();
      await page.waitForSelector('.everyday-contract', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await waitForToday(page);
      await skipAndClose(page);
      /* Assessor D's N2: `?seed=<career seed>&tab=report` here, read back as the Scenario crowd. */
      expect(new URL(page.url()).searchParams.get('seed')).toBe('424242');

      await reload(page);
      await openEverydayDoor(page);
      expect(await doorCrowd(page), 'the career’s crowd came back as the Scenario week’s').toBe(crowd);
    } finally {
      await page.close();
    }
  }, 300_000);
});

describe.skipIf(!HAS_BROWSER)('§ D1004 — a closed today opens tomorrow from the front door', () => {
  it('offers tomorrow after the report is left, reads today as closed after a reload, and opens it', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page, 'building=crown-hotel&seed=424242');
      await openEverydayDoor(page);
      expect(await textOf(page, '.everyday-bar-primary')).toBe('Set up today');
      await startTheDayFromDoor(page);
      await skipAndClose(page);
      const onward = await textOf(page, '.everyday-report-tomorrow');
      expect(onward).toMatch(/^Open the doors on /u);

      /* Left from the report and back to the door: the report's own press, and today's second attempt beside it. */
      await toModes(page);
      await openEverydayDoor(page);
      expect(await textOf(page, '.everyday-bar-primary'), 'the door’s only press re-ran today').toBe(onward);
      expect(await textOf(page, '.everyday-door-again-press')).toBe('Run today again');

      /* A reload keeps the week and drops the sheet; Your week reads the banked day as closed. */
      await reload(page);
      await page.locator('nav.everyday-rail button', { hasText: 'Your week' }).first().click();
      await page.waitForSelector('.everyday-week-strip', { timeout: 15_000 });
      const strip = await textOf(page, '.everyday-week-strip');
      expect(strip, 'Your week said a banked day was not closed').not.toContain('not closed yet');
      expect(await textOf(page, '.everyday-week')).not.toContain('No day of this week has been closed yet');

      /* And the door's press opens tomorrow — the door then stands on day 2. */
      await toModes(page);
      await openEverydayDoor(page);
      expect(await textOf(page, '.everyday-bar-primary')).toBe(onward);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-back').click();
      await page.waitForSelector('.everyday-door', { timeout: 15_000 });
      expect(await textOf(page, '.everyday-door-day')).toMatch(/· day 2$/u);
    } finally {
      await page.close();
    }
  }, 300_000);
});
