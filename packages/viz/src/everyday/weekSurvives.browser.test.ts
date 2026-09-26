/**
 * **The player's week survives — a whole Scenario week plays, and no other mode writes it** —
 * GitHub issues **#593** and **#594**, on the shipped bundle.
 *
 * ## Why these two cases are the deliverable
 *
 * Both issues shipped past a green suite because **no test reached them**. Nothing in the tier
 * played past day 1 of a Scenario week, so the day-3 fire drill that `core` refused on every
 * whole-day tower (`shift/events.ts#demandTemplateVariesMix`) was met first by assessors, who sat
 * in front of *simulating today's day* for seven minutes. And nothing visited a second mode and came
 * back, so a career day filed into the Scenario week, a rush wrote its own week to the saved session
 * where the next load refused it, and a career desk graded a rush's run — four ways to lose the
 * thing a player comes back for, none of them visible to a case that stays in one mode.
 *
 * So the first case presses *Open the doors on …* six times and requires every day to land, on a
 * tower that runs the whole authored day and on one that runs a slice; and the second closes a
 * Scenario day, plays every other mode tile, comes back, reloads, and requires the week, its closed
 * day, its tower and its crowd to read exactly as they did.
 *
 * ## What it drives
 *
 * **The shipped bundle**, through {@link startShippedSite} — nothing here reaches into the module
 * graph, so there is nothing a dev server would be for (GitHub issue #281, § D425). Every press is
 * the player's own, read back from the screen a player reads it on.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass — which
 * is why the tier is run with it set, and why a count of cases, not the word *passed*, is what to
 * check.
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
  site = await startShippedSite({ preview: { port: 5611, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A crowd pinned by the address, so every read of the week can be compared as text. */
const SEED = 424242;

/** Cold load, menu dismissed, the first-visit offer left, on the main menu. */
async function coldLoad(page: Page, query: string): Promise<void> {
  await page.goto(`${origin}?${query}`, { waitUntil: 'load' });
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

/**
 * The stage has adopted **today's** run and is paused at its start with the day closable — or it
 * said the day failed, which is returned rather than waited out, because a failure the case cannot
 * see is the defect #593 is about.
 */
async function waitForToday(page: Page): Promise<'ready' | 'failed'> {
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  const handle = await page.waitForFunction(
    () => {
      const failed = document.querySelector<HTMLElement>('.everyday-stage-failed');
      if (failed !== null && failed.style.display !== 'none') return 'failed';
      const primary = document.querySelector('.everyday-bar-primary')?.textContent ?? '';
      const start = document.querySelector<HTMLElement>('.everyday-stage-start');
      return primary.includes('Close the day') && start?.style.display === '' ? 'ready' : false;
    },
    undefined,
    { timeout: 240_000 },
  );
  return (await handle.jsonValue()) as 'ready' | 'failed';
}

/** § 3.4's leave: the rail's main-menu row, answering the confirm strip when a run is open. */
async function toModes(page: Page): Promise<void> {
  await page.locator('.everyday-rail-menu').click();
  await page.waitForSelector('.everyday-mode[data-screen], .everyday-bar-confirm-leave', {
    timeout: 15_000,
  });
  if ((await page.locator('.everyday-bar-confirm-leave').count()) > 0) {
    await page.locator('.everyday-bar-confirm-leave').click();
  }
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
}

/** What the front door says about the week — the four things #594 says must not move. */
async function weekAtTheDoor(page: Page): Promise<{
  readonly tower: string | null;
  readonly day: string;
  readonly strip: string;
  readonly crowd: string;
}> {
  await openEverydayDoor(page);
  return {
    tower: await page.getAttribute('.everyday-door-tower[data-selected="true"]', 'data-contract'),
    day: await textOf(page, '.everyday-door-day'),
    strip: await textOf(page, '.everyday-door-strip'),
    crowd: await textOf(page, '.everyday-door-seed'),
  };
}

describe.skipIf(!HAS_BROWSER)('GitHub issue #593 — a Scenario week plays from day 1 to day 7', () => {
  /*
   * Midtown Office runs the whole authored day (`office-day`), which is where the fire drill was
   * refused; Garden Apartments has no authored day and runs its slice, which is the other shape a
   * Scenario day can take. Day 3 is where the assessors stopped, so seven days is the week and not
   * a round number.
   */
  for (const building of ['midtown-office', 'garden-apartments']) {
    it(`plays seven days on ${building} and every one of them lands`, async () => {
      const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
      try {
        await coldLoad(page, `building=${building}&seed=${String(SEED)}`);
        await openEverydayDoor(page);
        await page.locator('.everyday-bar-primary').click();
        await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
        const reached: string[] = [];
        for (let day = 1; day <= 7; day += 1) {
          /* The brief's primary is *Start the day* — `host.startRun()`, then the stage. */
          await page.locator('.everyday-bar-primary').click();
          const landed = await waitForToday(page);
          expect(landed, `day ${String(day)} on ${building} did not simulate`).toBe('ready');
          /* Close it on § 3.3's own primary, which files the day and lands on the report. */
          await page.locator('.everyday-bar-primary').click();
          await page.waitForSelector('.everyday-report', { timeout: 30_000 });
          reached.push(await textOf(page, '.everyday-report-tomorrow'));
          if (day === 7) break;
          /* The report's own way into tomorrow — `openTomorrow`, then the brief. */
          await page.locator('.everyday-report-tomorrow').click();
          await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
        }
        /*
         * Seven days closed, each offering the next, in the week's order. On a week the census
         * speaks for (Midtown's), Sunday's close closes the week, and its one button opens the
         * week's sheet rather than Monday — swarm DN's Q2.3, § D1227 — whose own primary then
         * starts the next week on the brief. Garden Apartments' week has no ending and offers
         * Monday.
         */
        expect(reached).toHaveLength(7);
        const closesAWeek = building === 'midtown-office';
        const offersNext = closesAWeek ? reached.slice(0, 6) : reached;
        expect(offersNext.every((label) => label.startsWith('Open the doors on'))).toBe(true);
        expect(new Set(offersNext).size).toBe(offersNext.length);
        if (closesAWeek) {
          expect(reached[6]).toBe('See the week against the house');
          await page.locator('.everyday-report-tomorrow').click();
          await page.waitForSelector('.everyday-week-sheet', { timeout: 15_000 });
          expect((await page.locator('.everyday-week-sheet-row').count())).toBe(7);
          expect(await textOf(page, '.everyday-bar-primary')).toContain('Start next week');
          await page.locator('.everyday-bar-primary').click();
          await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
        }
      } finally {
        await page.close();
      }
    }, 600_000);
  }
});

describe.skipIf(!HAS_BROWSER)('GitHub issue #594 — no mode but Scenario writes the Scenario week', () => {
  it('closes a Scenario day, plays every other mode, and finds the week exactly as it was — reload included', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page, `building=midtown-office&seed=${String(SEED)}`);

      /* ---- close Monday on Midtown Office ---- */
      await openEverydayDoor(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      expect(await waitForToday(page)).toBe('ready');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report', { timeout: 30_000 });
      await toModes(page);
      /*
       * The mode picker offers the week back — swarm DN's Q2.4, § D1228 — naming the tower and the
       * day standing, and its press opens the front door on that week.
       */
      await page.waitForSelector('.everyday-continue-week', { timeout: 15_000 });
      expect(await textOf(page, '.everyday-continue-week')).toContain('Midtown Office, Monday filed, Tuesday next');
      await page.locator('.everyday-continue-week').click();
      await page.waitForSelector('.everyday-door', { timeout: 15_000 });
      await toModes(page);
      const before = await weekAtTheDoor(page);
      /*
       * The fixture is what it claims to be: Midtown, a closed Monday, the address's crowd. The
       * closed chip names its tower as today's chip does — by the building's name, not its id, since
       * wave AI's GitHub issue #599 (`everyday/doorView.ts#DoorScreenInput.nameOf`).
       */
      expect(before.tower).toBe('c2');
      expect(before.strip).toContain('Midtown Office');
      expect(before.crowd).toContain(String(SEED));

      /* ---- the Rush tile: open it, start a rush, leave it ---- */
      await toModes(page);
      await page.locator('.everyday-mode[data-screen="rush"]').click();
      await page.waitForSelector('.everyday-rush', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
        undefined,
        { timeout: 240_000 },
      );
      await toModes(page);
      expect(await weekAtTheDoor(page), 'after a rush').toEqual(before);

      /* ---- the Career tile: a desk that has run nothing grades nothing ---- */
      await toModes(page);
      await page.locator('.everyday-mode[data-screen="towers"]').click();
      await page.waitForSelector('.everyday-towers', { timeout: 15_000 });
      await page.locator('.everyday-towers-open').first().click();
      await page.waitForSelector('.everyday-building', { timeout: 15_000 });
      /* Assessor D's third finding: the rush just left may not be graded as a career day. */
      expect(await textOf(page, '.everyday-building')).toContain('nothing run yet today');

      /* ---- … then run a career day, skip to its end and close it ---- */
      await page.locator('.everyday-building-to-contract').click();
      await page.waitForSelector('.everyday-contract', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      expect(await waitForToday(page)).toBe('ready');
      await page.locator('.everyday-stage-skip').click();
      await page.waitForFunction(
        () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
        undefined,
        { timeout: 30_000 },
      );
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report', { timeout: 30_000 });
      await toModes(page);
      expect(await weekAtTheDoor(page), 'after a career day').toEqual(before);

      /* ---- the Scenario tile itself, and a reload: what is on disk is the week, not a mode's ---- */
      await page.goto(`${origin}?seed=${String(SEED)}`, { waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 30_000 });
      expect(await weekAtTheDoor(page), 'after a reload').toEqual(before);
    } finally {
      await page.close();
    }
  }, 600_000);

  it('a reload taken while a rush is standing brings the Scenario week back rather than a fresh one', async () => {
    /*
     * Assessor A's route, the one that lost the week outright: a rush writes its own week to the
     * saved session, and the next load refused that session and opened a fresh Garden Apartments
     * Monday. Reloaded mid-rush here, which is the moment the rush week is the live one.
     */
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page, `building=midtown-office&seed=${String(SEED)}`);
      await openEverydayDoor(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      expect(await waitForToday(page)).toBe('ready');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report', { timeout: 30_000 });
      await toModes(page);
      const before = await weekAtTheDoor(page);

      await toModes(page);
      await page.locator('.everyday-mode[data-screen="rush"]').click();
      await page.waitForSelector('.everyday-rush', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });

      await page.goto(`${origin}?seed=${String(SEED)}`, { waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 30_000 });
      expect(await weekAtTheDoor(page)).toEqual(before);
    } finally {
      await page.close();
    }
  }, 600_000);
});
