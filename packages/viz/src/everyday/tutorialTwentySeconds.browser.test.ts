/**
 * **The tutorial's "Watch it come apart" shows the building breaking inside about twenty seconds,
 * with a clock, on the shipped bundle** — GitHub issue #598, [§ D992](../../../../DECISIONS.md).
 *
 * Three assessors watched this screen for two minutes and saw three idle cars and nobody on a
 * landing, with no clock; one pressed the fix before seeing anything break. `tutorialRuns.test.ts`
 * measures the twenty seconds through the real `Playback` over a manual clock. This is the half only
 * a browser can check: that the mounted screen draws the clock and the reason for its speed, that
 * the transport is really crossing the quiet at `90×` and drops to the player's `4×` when somebody
 * has waited a minute, and that the one press refuses — out loud — until then.
 *
 * The speed is read off the block's own pace line, which is written from the transport's speed on
 * every frame, so nothing here rests on a wall-clock duration taken on a shared box. The one
 * wall-clock figure the case takes is published beside the assertion as a reading, and asserted only
 * against a bound six times wider than the issue's twenty seconds.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  EVERYDAY_SCREEN_ROUTES,
  HAS_BROWSER,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5642, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function collapseScreen(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await EVERYDAY_SCREEN_ROUTES.collapse(page);
  return page;
}

describe.skipIf(!HAS_BROWSER)('GitHub issue #598 — the first twenty seconds of Watch it come apart', () => {
  it('draws a clock, crosses the quiet at 90×, and holds the press until somebody has waited a minute', async () => {
    const page = await collapseScreen();
    try {
      await page.waitForSelector('.everyday-collapse-stage-canvas', { state: 'visible', timeout: 180_000 });
      const shownAtMs = await page.evaluate(() => performance.now());

      /* A clock and a pace line are on the block. The quiet is crossed at 90×. */
      await page.waitForFunction(
        () => (document.querySelector('.everyday-collapse-stage-block-clock')?.textContent ?? '').includes('into the morning'),
        undefined,
        { timeout: 30_000 },
      );
      expect(await page.textContent('.everyday-collapse-stage-block-clock')).toContain('90×');

      /* The press refuses out loud until the building has been seen breaking. */
      const press = page.locator('.everyday-collapse-press');
      await page.waitForFunction(
        () => (document.querySelector('.everyday-collapse-control-refusal')?.textContent ?? '').startsWith('Watch first'),
        undefined,
        { timeout: 180_000 },
      );
      expect(await press.isDisabled()).toBe(true);

      /* Somebody passes a minute: the transport drops to the player's speed, and the press goes live. */
      await page.waitForFunction(
        () => document.querySelector('.everyday-collapse-press')?.hasAttribute('disabled') === false,
        undefined,
        { timeout: 180_000 },
      );
      const liveAtMs = await page.evaluate(() => performance.now());
      const clockLine = (await page.textContent('.everyday-collapse-stage-block-clock')) ?? '';
      expect(clockLine).toContain('your speed');
      const [minutes, seconds] = (/(\d{2}):(\d{2}) into the morning/u.exec(clockLine) ?? []).slice(1).map(Number);
      /* The first minute-long wait on the as-built run is 1 448 s in — 24:08 — so the clock is past it. */
      expect((minutes ?? 0) * 60 + (seconds ?? 0)).toBeGreaterThanOrEqual(1448);
      /*
       * A reading, not the measurement: `tutorialRuns.test.ts` is where twenty seconds is asserted,
       * from the code path. Here the bound is loose enough that a loaded box cannot fail it and a
       * transport still crossing the quiet at the player's own 4× (about 360 s) certainly would.
       */
      expect(liveAtMs - shownAtMs).toBeLessThan(120_000);
    } finally {
      await page.close();
    }
  }, 300_000);

  it('captions each figure card on screen one with its own sentence', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await EVERYDAY_SCREEN_ROUTES.tutorial(page);
      await page.waitForSelector('.everyday-tutorial-figure-note', { timeout: 180_000 });
      const notes = await page.$$eval('.everyday-tutorial-figure-note', (nodes) => nodes.map((node) => node.textContent ?? ''));
      expect(notes.length).toBeGreaterThan(1);
      expect(new Set(notes).size).toBe(notes.length);
      expect(notes.some((note) => note.startsWith('Every other journey'))).toBe(true);
    } finally {
      await page.close();
    }
  }, 300_000);
});
