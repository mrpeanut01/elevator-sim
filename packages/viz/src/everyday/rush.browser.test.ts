/**
 * Endless rush, end to end, by the player's own route — GitHub issue #220, § D515.
 *
 * Menu tile → setup screen → *Start the rush* → the stage in the `rush` context, with held time and
 * a wave pill where a day has a clock and a phase → *End the rush* → the result, its own screen. Then
 * the way out: *Leave the rush* puts the player's parked week back, which the front door shows by
 * naming the same tower it named before.
 *
 * The second case is GitHub issue #518, item 4: a rush left while its stream is still being generated
 * stops that run, so nothing lands over the day the way out has just put back. The host's half of that
 * is `host.test.ts`, and the runner's is `dev/shiftRunner.test.ts` (a result arriving after a cancel is
 * not applied); this case holds the binding between them, on the shipped bundle.
 *
 * The third is GitHub issue #523, item 1: *Switch to Engineer* pressed mid-rush leaves the rush before
 * it hands the page over. The full panel writes the levers, the selector and every other field a rush
 * runs fresh, and a posted sitting records none of them, so a rush that survived the trip could bank
 * a wave count its own replay would not produce. Coming back lands on the setup screen.
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
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5233, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

describe.skipIf(!HAS_BROWSER)('Endless rush — GitHub issue #220', () => {
  it('starts from the setup screen, plays on a held-time stage, ends by hand on its own result, and leaves the week as it was', async () => {
    const page = await coldLoad();
    try {
      await leaveTutorialIfOffered(page);
      await page.locator('.everyday-mode[data-screen="rush"]').click();
      await page.waitForSelector('.everyday-rush-driving', { timeout: 15_000 });
      /* § D478 on the setup screen: the stream leaves this building's band, and the screen says so. */
      expect(await page.textContent('.everyday-rush-disclosure')).toContain('Busier than a building like this is sized for');
      const primary = page.locator('.everyday-bar-primary');
      expect(await primary.textContent()).toBe('Start the rush');
      expect(await primary.isDisabled()).toBe(false);
      await primary.click();

      /* The stage, in the rush context: the run lands from the worker, then the pill reads a wave. */
      await page.waitForSelector('.everyday-stage-phase', { timeout: 30_000 });
      await page.waitForFunction(
        () => /^WAVE \d+$/u.test(document.querySelector('.everyday-stage-phase')?.textContent ?? ''),
        undefined,
        { timeout: 60_000 },
      );
      const stage = await page.evaluate(() => ({
        clock: document.querySelector('.everyday-stage-clock')?.textContent ?? '',
        phase: document.querySelector('.everyday-stage-phase')?.textContent ?? '',
        figures: [...document.querySelectorAll('.everyday-stage-figure')].map((node) => node.textContent ?? ''),
        goalsShown: (document.querySelector<HTMLElement>('.everyday-stage-goals')?.style.display ?? '') !== 'none',
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
      }));
      expect(stage.clock).toMatch(/^\d+:\d\d$/u);
      expect(stage.phase).toBe('WAVE 1');
      expect(stage.figures.join(' ')).toContain('past two minutes, of 40');
      expect(stage.goalsShown).toBe(false);
      expect(stage.primary).toBe('End the rush');

      /* Ended by hand, early: its own result, the stopped branch, and no day report anywhere. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-rush-result', { timeout: 15_000 });
      const result = await page.evaluate(() => ({
        outcome: document.querySelector<HTMLElement>('.everyday-rush-result')?.dataset['outcome'] ?? '',
        head: document.querySelector('.everyday-rush-result-head')?.textContent ?? '',
        footer: document.querySelector('.everyday-rush-result-footer')?.textContent ?? '',
        figures: document.querySelectorAll('.everyday-rush-result-figure').length,
        daySheet: document.querySelectorAll('.everyday-report-title').length,
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
      }));
      expect(result.outcome).toBe('stopped');
      expect(result.head).toMatch(/^You stopped at wave \d+, still holding$/u);
      expect(result.footer).toContain('not posted');
      expect(result.figures).toBe(4);
      expect(result.daySheet).toBe(0);
      expect(result.primary).toBe('Run the rush again');

      /* The way out puts the parked week back: the door names the address's tower and crowd, not seed 90210. */
      await page.locator('.everyday-bar-wayout').click();
      await page.waitForSelector('.everyday-rush-driving', { timeout: 15_000 });
      await page.locator('.everyday-bar-leave').click();
      await leaveTutorialIfOffered(page);
      await page.waitForSelector('.everyday-mode[data-screen="scenario"]', { timeout: 15_000 });
      await openEverydayDoor(page);
      const seedLine = await page.textContent('.everyday-door-seed');
      expect(seedLine).toContain('tower garden-apartments');
      expect(seedLine).toContain('crowd 424242');
    } finally {
      await page.close();
    }
  }, 180_000);

  it('left while its stream is still generating, stops that run, so it cannot land over the day put back — GitHub issue #518', async () => {
    const page = await coldLoad();
    try {
      await leaveTutorialIfOffered(page);
      await page.locator('.everyday-mode[data-screen="rush"]').click();
      await page.waitForSelector('.everyday-rush-driving', { timeout: 15_000 });
      /* `#run` is the Engineer's Run button; `dev/main.ts#onRunning` labels it from the runner's own transition. */
      const idle = 'Run this shift';
      await page.waitForFunction((label) => document.getElementById('run')?.textContent === label, idle, { timeout: 60_000 });
      /*
       * Press and leave inside one task. The worker answers with a message, which is a task of its own,
       * so the stream cannot land between the two, and this case cannot pass by the stream being quick.
       * The confirm is clicked where the shell draws one.
       */
      const seen = await page.evaluate(() => {
        const label = (): string => document.getElementById('run')?.textContent ?? '';
        document.querySelector<HTMLButtonElement>('.everyday-bar-primary')?.click();
        const pressed = label();
        document.querySelector<HTMLButtonElement>('.everyday-bar-leave')?.click();
        document.querySelector<HTMLButtonElement>('.everyday-bar-confirm-leave')?.click();
        return { pressed, left: label(), status: document.getElementById('status')?.textContent ?? '' };
      });
      /* Non-vacuity: the press started the rush's run, and it was in flight when the player left. */
      expect(seen.pressed).toBe('Cancel this run');
      /*
       * Where the leave does not cancel, the run stays in flight and lands later, and
       * `dev/main.ts#applyShift` adopts it over the restored day. The status line after that landing is
       * carried in the message, so a red run shows what landed.
       */
      await page.waitForFunction((label) => document.getElementById('run')?.textContent === label, idle, { timeout: 120_000 });
      const settled = await page.evaluate(() => document.getElementById('status')?.textContent ?? '');
      expect(seen.left, `left with status "${seen.status}"; once the runner was idle it read "${settled}"`).toBe(idle);
      await page.waitForSelector('.everyday-mode[data-screen="scenario"]', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  });

  it('switched to Engineer mid-rush, leaves the rush first, and comes back to the setup screen — GitHub issue #523', async () => {
    const page = await coldLoad();
    try {
      await leaveTutorialIfOffered(page);
      await page.locator('.everyday-mode[data-screen="rush"]').click();
      await page.waitForSelector('.everyday-rush-driving', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForFunction(
        () => /^WAVE \d+$/u.test(document.querySelector('.everyday-stage-phase')?.textContent ?? ''),
        undefined,
        { timeout: 60_000 },
      );
      /* Non-vacuity: a rush is standing on its stage when the player swaps. */
      expect(await page.textContent('.everyday-bar-primary')).toBe('End the rush');
      const note = await page.textContent('.everyday-engineer-swap');
      await page.locator('.everyday-engineer-swap').click();
      await page.locator('#back-to-everyday').click();
      /*
       * Where the swap does not leave, the stage is still there with *End the rush* on it, and anything
       * the panel wrote in between runs under the rush's next re-run.
       */
      const back = await page.evaluate(() => ({
        setup: document.querySelector('.everyday-rush-driving') !== null,
        stage: document.querySelector('.everyday-stage-phase') !== null,
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
      }));
      expect(back).toEqual({ setup: true, stage: false, primary: 'Start the rush' });
      /* And the row said so before it was pressed. */
      expect(note).toContain('ends the rush first');
    } finally {
      await page.close();
    }
  });
});
