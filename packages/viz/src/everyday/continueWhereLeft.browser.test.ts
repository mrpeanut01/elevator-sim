/**
 * **Continue lands where you left, and the stage tells the truth about its own state** — wave AO,
 * lane AO-4, [§ D1384](../../../../DECISIONS.md), on the shipped bundle. The post-AN panel's seat B
 * (lost moments 3 to 9, defects 1, 2, 3 and 9) played this build and found each of these:
 *
 * 1. **A day left at its call** came back through the front door, *Set up today* and *Resume*, and
 *    then sat paused at the call with no card and *▶ Play* offered until Play was pressed. *Continue
 *    your week* now opens the stage itself, the card comes up without a press, and while the call is
 *    being worked out the transport says so instead of offering Play. The speed chip lit at the stop
 *    is the one the player chose (`30×` was lit at every stop for a player at `4×`), and the
 *    transport's line says one thing. *Leave today's tower* puts focus on *Stay* rather than letting
 *    it fall to the covered Engineer page's skip link.
 * 2. **A closed day** came back as yesterday's door with *Open the doors on Tuesday* as its primary.
 *    *Continue* now opens Tuesday's brief, by the door's own press.
 * 3. **On a phone** the header's *▶ Play* left the building under the fixed bar for the whole day.
 * 4. **Tuesday's brief opened on the house** after Monday was handed to another driver on the stage,
 *    with nothing said. It says which driver it opens on and why, by § D1318's unchanged rule.
 * 5. **On the Engineer surface during a scored day** the selects, *Run this shift* and the rail's
 *    cards looked live and refused only once pressed (§ D1323). They are drawn unavailable, with the
 *    reason, before the press.
 *
 * Crown Hotel on 2026-10-03, `dayCalls.browser.test.ts`'s day: a slice that raises a call at 08:39.
 * Each case was driven against a bundle of the base tree (`b53ab48`) and failed there on the
 * assertion its comment names. Gate: without `ELEVATOR_SIM_CHROMIUM` every case skips and the file
 * reports a pass, so read the case count. Port 5934.
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
  leaveLobbyIfShown,
} from '../dev/browserTier.test-helper.js';
import { ATTEMPT_ENGINEER_WATCHES_ONLY } from '../shift/banking.js';
import { STAGE_CALL_COPY } from './stageCall.js';
import { STAGE_PLAY_CONTROL } from './stageScreenModel.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /* Its own port — `dev/browserTier.test.ts` requires every tier file's to be distinct. */
  site = await startShippedSite({ preview: { port: 5934, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
  /* No annotation: the tier's own 120 000 ms hook timeout covers it (`vitest.config.ts`). */
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

async function load(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
  await page.goto(origin, { waitUntil: 'load' });
  await settle(page);
}

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await leaveTutorialIfOffered(page);
}

/** Menu → Scenario → door, Crown Hotel selected, then *Set up today* onto the brief. */
async function toCrownsBrief(page: Page): Promise<void> {
  await openEverydayDoor(page);
  const row = `.everyday-door-tower[data-contract="${TOWER}"]`;
  if ((await page.locator(`${row}[data-selected="true"]`).count()) === 0) await page.click(row);
  await page.waitForSelector(`${row}[data-selected="true"]`, { timeout: 30_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
}

/** *Start the day*, and wait for the stage paused at the day's start. */
async function startTheDay(page: Page): Promise<void> {
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  await page.waitForFunction(
    () =>
      (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day') &&
      document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
    undefined,
    { timeout: 240_000 },
  );
}

/** What the transport says: the clock, the lit chip, its button and its two lines. */
async function transport(page: Page): Promise<{
  readonly clock: string;
  readonly lit: readonly string[];
  readonly play: string;
  readonly pace: string;
  readonly skipLine: string;
}> {
  return page.evaluate(() => ({
    clock: document.querySelector('.everyday-stage-clock')?.textContent ?? '',
    lit: [...document.querySelectorAll('.everyday-stage-speed')]
      .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
      .map((chip) => chip.textContent ?? ''),
    play: document.querySelector('.everyday-stage-play')?.textContent ?? '',
    pace: document.querySelector('.everyday-stage-pace')?.textContent ?? '',
    skipLine: document.querySelector('.everyday-stage-skip-line')?.textContent ?? '',
  }));
}

/** The rail's *Main menu*, through § 3.4's strip where one is drawn; the strip's focus, read as it stands. */
async function leaveForTheMenu(page: Page): Promise<string | undefined> {
  await page.locator('.everyday-rail-menu').click();
  await page.waitForSelector('.everyday-mode[data-screen], .everyday-bar-confirm-leave', { timeout: 15_000 });
  let focused: string | undefined;
  if ((await page.locator('.everyday-bar-confirm-leave').count()) > 0) {
    focused = await page.evaluate(() => document.activeElement?.className ?? '');
    await page.locator('.everyday-bar-confirm-leave').click();
  }
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
  return focused;
}

describe.skipIf(!HAS_BROWSER)('Continue lands where you left — wave AO, lane AO-4', () => {
  it('opens a day left at its call on the stage, with the card up and Play never offered while it is worked out', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await startTheDay(page);
      /* At the player's own rung, the default: the pace fast-forwards the quiet itself (§ D1169). */
      await page.locator('.everyday-stage-start').click();
      await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 240_000 });
      const atCall = await transport(page);
      /* Defect 2 — red before: `30×` lit at the stop, the rung the pace had stopped from. */
      expect(atCall.lit, 'the chip lit at a call stop is not the one the player chose').toEqual(['4×']);
      /* Defect 3 — one message for one state: the stop speaks alone. */
      expect(atCall.pace).toBe('stopped for the day’s call');
      expect(atCall.skipLine).toBe('');

      /* *Leave today's tower* by the rail: § 3.4's strip, with focus on its safe answer. */
      const focused = await leaveForTheMenu(page);
      expect(focused, 'focus left the strip for the covered page').toContain('everyday-bar-confirm-stay');
      await page.reload({ waitUntil: 'load' });
      await settle(page);

      /*
       * § D1445: the reload opens the lobby, which offers the same *Continue* the menu's tile does,
       * in the same words. Checked here, then left by *Main menu* for the tile this case is about.
       */
      await page.waitForSelector('.everyday-lobby-continue', { state: 'visible', timeout: 30_000 });
      expect(await textOf(page, '.everyday-lobby-continue')).toContain(`left at ${atCall.clock}`);
      await leaveLobbyIfShown(page);

      /* Red before: no entry at all on a first day, and on a later day the entry opened the door. */
      await page.waitForSelector('.everyday-continue-week', { timeout: 15_000 });
      expect(await page.getAttribute('.everyday-continue-week', 'data-goes')).toBe('stage');
      expect(await textOf(page, '.everyday-continue-week')).toContain(`left at ${atCall.clock}`);

      /*
       * From the press to the card, every frame: the transport is never an enabled *▶ Play* while the
       * card is down, and a waiting stage says so on its button.
       */
      await page.evaluate(
        ({ play }) => {
          const seen = { offered: 0, waiting: 0 };
          (window as unknown as { __seen: typeof seen }).__seen = seen;
          const look = (): void => {
            const button = document.querySelector<HTMLButtonElement>('.everyday-stage-play');
            const card = document.querySelector<HTMLElement>('.everyday-stage-call');
            const clock = document.querySelector('.everyday-stage-clock')?.textContent ?? '';
            if (button !== null && card !== null && card.hidden && /\d{2}:\d{2}/u.test(clock)) {
              if (button.textContent === play && !button.disabled) seen.offered += 1;
              if (button.disabled && button.textContent !== play) seen.waiting += 1;
            }
            if (card === null || card.hidden) requestAnimationFrame(look);
          };
          requestAnimationFrame(look);
        },
        { play: STAGE_PLAY_CONTROL.play },
      );
      await page.locator('.everyday-continue-week').click();
      /* Red before: the door, then the brief, then a paused stage with no card until Play. */
      await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 120_000 });
      const seen = await page.evaluate(() => (window as unknown as { __seen: { offered: number; waiting: number } }).__seen);
      expect(seen.offered, 'Play was offered while the stage was working out the call').toBe(0);
      const resumed = await transport(page);
      expect(resumed.clock).toBe(atCall.clock);
      expect(resumed.lit).toEqual(['4×']);
      expect(resumed.pace).toBe('stopped for the day’s call');
      expect(resumed.pace).not.toBe(STAGE_CALL_COPY.waiting);
    } finally {
      await page.close();
    }
  });

  it('opens tomorrow’s brief after a close, rather than yesterday’s door', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await startTheDay(page);
      /* Skip to the end; a press with a card up asks first (§ D1324), and the next answers it. */
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
      /* Defect 2 at the day's end: the stopped transport lights the player's rung. */
      expect((await transport(page)).lit).toEqual(['4×']);
      await page.locator('.everyday-bar-primary').click();
      if ((await page.locator('.everyday-stage-call-confirm:not([hidden])').count()) > 0) {
        await page.locator('.everyday-stage-call-confirm-file').click();
      }
      await page.waitForSelector('.everyday-report', { timeout: 60_000 });
      await leaveForTheMenu(page);
      await page.waitForSelector('.everyday-continue-week', { timeout: 15_000 });
      expect(await textOf(page, '.everyday-continue-week')).toContain('Monday filed, Tuesday next');
      expect(await page.getAttribute('.everyday-continue-week', 'data-goes')).toBe('tomorrow');
      await page.locator('.everyday-continue-week').click();
      /* Red before: `.everyday-door`, on Monday, with *Open the doors on Tuesday* as its primary. */
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      expect(await page.locator('.everyday-door').count()).toBe(0);
      expect(await textOf(page, '.everyday-brief')).toContain('TUESDAY');
      expect(await textOf(page, '.everyday-bar-primary')).toBe('Start the day');
    } finally {
      await page.close();
    }
  });

  it('keeps the building in view on a phone once the header’s Play starts the day', async () => {
    const page = await openPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await load(page);
      if ((await page.locator('.everyday-consent-no').count()) > 0) await page.locator('.everyday-consent-no').click();
      await toCrownsBrief(page);
      await startTheDay(page);
      await page.locator('.everyday-stage-play').tap();
      await page.waitForFunction(
        () => document.querySelector('.everyday-stage-play')?.textContent?.includes('Pause') === true,
        undefined,
        { timeout: 15_000 },
      );
      await page.waitForTimeout(500);
      const boxes = await page.evaluate(() => {
        const box = (selector: string): { top: number; bottom: number } => {
          const rect = document.querySelector(selector)?.getBoundingClientRect();
          return { top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 };
        };
        return { canvas: box('.everyday-stage-canvas'), bar: box('.everyday-bar'), region: box('.everyday-screen') };
      });
      /* Defect 9 — red before: the canvas at y 756–1262 under a bar from y 725. */
      const shown = Math.min(boxes.canvas.bottom, boxes.bar.top, boxes.region.bottom) - Math.max(boxes.canvas.top, boxes.region.top);
      expect(shown / (boxes.canvas.bottom - boxes.canvas.top), JSON.stringify(boxes)).toBeGreaterThanOrEqual(0.95);
    } finally {
      await page.close();
    }
  });

  /*
   * Seat B (lost moment 10): Monday handed to *Fairness first* on the stage, and Tuesday's brief
   * opened on the house with nothing said. § D1318's rule stands (the brief's pick carries, a stage
   * handover does not); the brief now says which driver it opens on and why. Red before: no line.
   */
  it('says on the next brief which driver it opens on, after a handover on the stage', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await startTheDay(page);
      await page.locator('.everyday-stage-speed', { hasText: '30×' }).click();
      await page.locator('.everyday-stage-start').click();
      /* Answer each card until the day asks who drives, and hand it over there. */
      let handedTo = '';
      for (let card = 0; card < 8 && handedTo === ''; card += 1) {
        const up = await page
          .waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 90_000 })
          .then(() => true)
          .catch(() => false);
        if (!up) break;
        if ((await textOf(page, '.everyday-stage-call')).includes('Who drives the rest of the day?')) {
          handedTo = (await textOf(page, '.everyday-stage-call-answer[data-answer="driver-a"]')).replace(/^Switch to /u, '');
          await page.locator('.everyday-stage-call-answer[data-answer="driver-a"]').click();
        } else {
          await page.locator('.everyday-stage-call-answer[data-answer="leave"]').click();
        }
        await page.waitForSelector('.everyday-stage-call[hidden]', { state: 'attached', timeout: 60_000 });
      }
      expect(handedTo, 'the day never asked who drives').not.toBe('');
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
      await page.locator('.everyday-bar-primary').click();
      if ((await page.locator('.everyday-stage-call-confirm:not([hidden])').count()) > 0) {
        await page.locator('.everyday-stage-call-confirm-file').click();
      }
      await page.waitForSelector('.everyday-report', { timeout: 60_000 });
      await page.locator('.everyday-report-tomorrow').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      const line = await textOf(page, '.everyday-brief-driver-carried');
      expect(line).toMatch(/^Tuesday opens on Conventional collective, the driver Monday started with\. /u);
      expect(line).toContain(`Monday’s handover to ${handedTo} at `);
      expect(line).toContain(`To drive with ${handedTo} today, pick it here.`);
      /* The rule it states is unchanged: the brief still opens on the driver Monday started with. */
      expect(await page.inputValue('.everyday-brief-picker')).toBe('collective');
    } finally {
      await page.close();
    }
  });

  it('draws the Engineer surface’s run-making controls as unavailable, with the reason, while a scored day stands', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await startTheDay(page);
      await page.locator('.everyday-engineer-swap').click();
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('.shell')?.inert === false &&
          document.querySelector<HTMLElement>('.everyday')?.style.visibility === 'hidden',
        undefined,
        { timeout: 15_000 },
      );
      await page.locator('#seg-dispatcher').click();
      await page.waitForFunction(() => document.querySelectorAll('#rail-dispatcher-list .pick').length > 1, undefined, {
        timeout: 15_000,
      });
      const drawn = await page.evaluate(() => {
        const control = (id: string): { held: string | null; title: string } => {
          const node = document.getElementById(id);
          return { held: node?.getAttribute('aria-disabled') ?? null, title: node?.getAttribute('title') ?? '' };
        };
        const cards = [...document.querySelectorAll<HTMLElement>('#rail-dispatcher-list .pick')];
        return {
          building: control('pick-building'),
          run: control('run'),
          cardsHeld: cards.every((card) => card.getAttribute('aria-disabled') === 'true'),
          cardsDescribed: cards.every((card) => {
            const id = card.getAttribute('aria-describedby');
            return id !== null && (document.getElementById(id)?.textContent ?? '').length > 0;
          }),
        };
      });
      /* Red before: every one of these looked live (no `aria-disabled`, no reason) until pressed. */
      expect(drawn.building).toEqual({ held: 'true', title: ATTEMPT_ENGINEER_WATCHES_ONLY });
      expect(drawn.run).toEqual({ held: 'true', title: ATTEMPT_ENGINEER_WATCHES_ONLY });
      expect(drawn.cardsHeld).toBe(true);
      expect(drawn.cardsDescribed).toBe(true);
      /* The control: pressed, the rule still refuses in its own words on the status line (§ D1323). */
      await page.locator('#run').click({ force: true });
      expect(await textOf(page, '#status')).toContain(ATTEMPT_ENGINEER_WATCHES_ONLY);
    } finally {
      await page.close();
    }
  });
});
