/**
 * **The lobby on the shipped bundle** — [§ D1445](../../../../DECISIONS.md).
 *
 * `lobbyModel.test.ts` holds the door machine and the floor map in the node tier. What only a
 * browser can hold is the rest: that a cold launch opens on the lobby with the shell's chrome
 * stepped aside, that the car really rides and opens, that *Step out* lands on the floor's own screen
 * with the rail back, that the basement opens the walkthrough, that the quiet *Main menu* is a way
 * past the ride, and that *Skip the lobby* restores the old front door.
 *
 * Every page here is opened with `reducedMotion: 'reduce'`, which is the handoff's own fast path
 * (doors in 1 ms, steps in 90 ms), so a ride costs about a second rather than five. The full-motion
 * timings are the model's, and its test pins them.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  skipTheLobby,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { LOBBY_COPY, LOBBY_WARNINGS } from './lobbyModel.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5974, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function coldLobby(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
  return page;
}

/** CALL, and wait for the doors to open on L. */
async function callTheCar(page: Page): Promise<void> {
  await page.locator('.everyday-lobby-call').click();
  await page.waitForSelector('.everyday-lobby[data-phase="open"]', { timeout: 15_000 });
}

/** Choose a floor, close the doors, and wait to arrive. */
async function rideTo(page: Page, floor: string): Promise<void> {
  await page.locator(`.everyday-lobby-floor-button[data-floor="${floor}"]`).click();
  await page.locator('.everyday-lobby-close').click();
  await page.waitForSelector('.everyday-lobby[data-phase="arrived"]', { timeout: 15_000 });
}

describe.skipIf(!HAS_BROWSER)('§ D1445 — the lobby', () => {
  it('opens a cold launch on closed doors, with the rail and the bar stepped aside', async () => {
    const page = await coldLobby();
    try {
      expect(await page.locator('.everyday-lobby').getAttribute('data-phase')).toBe('idle');
      expect(await page.locator('.everyday-lobby-floor').textContent()).toBe('6');
      expect(await page.locator('.everyday-rail').isVisible()).toBe(false);
      expect(await page.locator('.everyday-bar').isVisible()).toBe(false);
      expect(await page.locator('.everyday-lobby-hint').textContent()).toBe('Press CALL');
      const frame = await page.locator('.everyday-lobby').boundingBox();
      expect(frame?.width ?? 0, 'the lobby has the whole viewport width').toBeGreaterThan(1400);
    } finally {
      await page.close();
    }
  });

  it('refuses a floor before CALL, and CLOSE with nothing chosen, in words', async () => {
    const page = await coldLobby();
    try {
      /* Behind shut doors a pointer cannot reach the panel; the keyboard can, and is told why not. */
      await page.locator('.everyday-lobby-floor-button[data-floor="8"]').focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => page.locator('.everyday-lobby-hint').textContent()).toBe(LOBBY_WARNINGS.callFirst);
      await callTheCar(page);
      expect(await page.locator('.everyday-lobby-floor').textContent()).toBe('L');
      await page.locator('.everyday-lobby-close').click();
      await expect.poll(() => page.locator('.everyday-lobby-status').textContent()).toBe(LOBBY_WARNINGS.chooseFirst);
    } finally {
      await page.close();
    }
  });

  it('rides to Scenario on 8 and steps out onto the Scenario hub, with the rail back', async () => {
    const page = await coldLobby();
    try {
      await callTheCar(page);
      await rideTo(page, '8');
      expect(await page.locator('.everyday-lobby-floor').textContent()).toBe('8');
      await page.locator('.everyday-lobby-step-out').click();
      await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
      expect(await page.locator('.everyday-rail').isVisible()).toBe(true);
      expect(await page.locator('.everyday-lobby').count()).toBe(0);
    } finally {
      await page.close();
    }
  });

  it('rides down to B and opens the walkthrough', async () => {
    const page = await coldLobby();
    try {
      await callTheCar(page);
      expect(await page.locator('.everyday-lobby').textContent()).toContain('B, under the lobby');
      await rideTo(page, 'B');
      expect(await page.locator('.everyday-lobby-floor').textContent()).toBe('B');
      await page.locator('.everyday-lobby-step-out').click();
      await page.waitForSelector('.everyday-tutorial', { timeout: 30_000 });
    } finally {
      await page.close();
    }
  });

  it('rides back to the lobby with the choice cleared', async () => {
    const page = await coldLobby();
    try {
      await callTheCar(page);
      await rideTo(page, '3');
      await page.locator('.everyday-lobby-back').click();
      await page.waitForSelector('.everyday-lobby[data-phase="open"]', { timeout: 15_000 });
      expect(await page.locator('.everyday-lobby-floor').textContent()).toBe('L');
      expect(await page.locator('.everyday-lobby-title').textContent()).toBe(LOBBY_COPY.welcomeTitle);
    } finally {
      await page.close();
    }
  });

  it('leaves for the main menu without riding, and the menu is not bounced to the landing page', async () => {
    const page = await coldLobby();
    try {
      await page.locator('.everyday-lobby-menu').click();
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 30_000 });
      /* The host lands after the press on a cold load; the offer it would have made is spent. */
      await page.waitForTimeout(1500);
      expect(await page.locator('.everyday-landing').count()).toBe(0);
      expect(await page.locator('.everyday-mode[data-screen]').count()).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  });

  it('is skipped when Settings says so, and the old front door is what opens', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    try {
      await skipTheLobby(page);
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForSelector('.everyday-landing, .everyday-mode[data-screen]', { timeout: 30_000 });
      expect(await page.locator('.everyday-lobby').count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
