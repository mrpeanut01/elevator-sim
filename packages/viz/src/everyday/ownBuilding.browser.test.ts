/**
 * **Playing a building you drew, on the shipped bundle** — [§ D1629](../../../../DECISIONS.md),
 * `docs/38` § 2.1's *Build your own* as far as this build takes it.
 *
 * `scenarioModel.test.ts` holds the list's words and `attemptDoors.test.ts` the two host doors. What
 * only a browser can hold is the path a player walks: draw on the Design floor, save, find the
 * building on the Scenario floor, and open a day in it. And the two things that path must not do:
 * *Save* may not move the player's week, and a test simulation may not put a building on the list.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, openPage, startShippedSite, type ShippedSite } from '../dev/browserTier.test-helper.js';
import { DESIGNER_COPY } from './designerModel.js';
import { OWN_BUILDINGS_COPY } from './scenarioModel.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5981, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
  /* No timeout annotation: the tier's own `hookTimeout` is already 120 000 ms, and `testCost.test.ts` counts annotations. */
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const NAME = 'Peanut Tower';

/** A cold load, then the drawing board by its own chip on the lobby. */
async function openDesigner(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('.everyday-lobby-room[data-screen="designer"]').click();
  await page.waitForSelector('.everyday-designer-save', { timeout: 30_000 });
  return page;
}

/** The Scenario floor, by the tray, with the *Your buildings* block drawn. */
async function toScenario(page: Page): Promise<void> {
  await page.locator('.everyday-rail-floor[data-floor="3"]').click();
  await page.waitForSelector('.everyday-scenario-own', { timeout: 30_000 });
}

describe.skipIf(!HAS_BROWSER)('§ D1629 — a building you drew is played from the Scenario floor', () => {
  it('saves to the shelf without moving the week, and lists the building by its name', async () => {
    const page = await openDesigner();
    try {
      await page.locator('.everyday-designer input').first().fill(NAME);
      await page.locator('.everyday-designer-save').click();
      expect(await page.textContent('.everyday-designer-saved')).toBe(DESIGNER_COPY.savedLine);

      await toScenario(page);
      const rows = page.locator('.everyday-scenario-own-row');
      expect(await rows.count()).toBe(1);
      expect(await page.textContent('.everyday-scenario-own-name')).toBe(NAME);

      /* The week did not follow the save: today's scenario still opens the door it would have. */
      await page.locator('.everyday-scenario-entry[data-entry="today"]').click();
      await page.waitForSelector('.everyday-door', { timeout: 30_000 });
      expect(await page.textContent('.everyday-door')).not.toContain(NAME);
    } finally {
      await page.close();
    }
  });

  it('opens a day in the building: its brief names it, and the tray keeps the car on Scenario', async () => {
    const page = await openDesigner();
    try {
      await page.locator('.everyday-designer input').first().fill(NAME);
      await page.locator('.everyday-designer-save').click();
      await toScenario(page);
      await page.locator('.everyday-scenario-own-play').click();
      await page.waitForSelector('.everyday-brief', { timeout: 30_000 });
      expect(await page.textContent('.everyday-brief')).toContain(NAME);
      expect(await page.getAttribute('.everyday-rail-floor[aria-current="location"]', 'data-floor')).toBe('3');
      expect((await page.textContent('.everyday-bar-primary'))?.trim()).toBe('Start the day');
      /* And it is a day, not a test: nothing on the tray calls it one. */
      expect(await page.textContent('.everyday-rail-subline')).not.toContain('TEST');
    } finally {
      await page.close();
    }
  });

  it('lists nothing after a test simulation alone, because a test saves no building', async () => {
    const page = await openDesigner();
    try {
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage', { timeout: 60_000 });
      expect(await page.textContent('.everyday-rail-subline')).toContain('TEST SIMULATION');
      await page.locator('.everyday-bar-leave').click();
      await page.waitForSelector('.everyday-designer-save', { timeout: 30_000 });
      await toScenario(page);
      expect(await page.locator('.everyday-scenario-own-row').count()).toBe(0);
      expect(await page.textContent('.everyday-scenario-own-empty')).toBe(OWN_BUILDINGS_COPY.empty);
    } finally {
      await page.close();
    }
  });
});
