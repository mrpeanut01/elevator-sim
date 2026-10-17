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
import { LOBBY_COPY, LOBBY_FLOORS, LOBBY_WARNINGS } from './lobbyModel.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5974, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

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

/**
 * Press Tab from the top of a fresh page until CALL holds focus. `presses` counts from the last stop
 * in the consent ask when it is up (from the top when it is not), which is the player's own cost of
 * reaching the one control that does anything on a first visit; `hiddenStops` names every stop on
 * the way that sat behind the shut doors.
 */
async function tabsToCall(page: Page, limit = 30): Promise<{ presses: number; hiddenStops: string[] }> {
  /* Tab starts from the top of the page, whatever the mount focused. */
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const hiddenStops: string[] = [];
  let presses = 0;
  for (let press = 1; press <= limit; press += 1) {
    await page.keyboard.press('Tab');
    presses += 1;
    const stop = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active === null) return { call: false, consent: false, behindDoors: false, name: '' };
      const box = active.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const behindDoors = [...document.querySelectorAll<HTMLElement>('.everyday-lobby-door')].some((door) => {
        const d = door.getBoundingClientRect();
        return door.parentElement?.contains(active) === true && x >= d.left && x <= d.right && y >= d.top && y <= d.bottom;
      });
      return {
        call: active.classList.contains('everyday-lobby-call'),
        consent: active.closest('.everyday-consent') !== null,
        behindDoors,
        name: active.getAttribute('aria-label') ?? active.className,
      };
    });
    if (stop.consent) presses = 0;
    if (stop.behindDoors) hiddenStops.push(stop.name);
    if (stop.call) return { presses, hiddenStops };
  }
  return { presses: Number.POSITIVE_INFINITY, hiddenStops };
}

/**
 * Every control the lobby offers once the doors are open, and the pointer's hit area for each: the
 * diameter of the largest circle, centred on the control, whose every sampled point lands on it.
 * WCAG 2.2 SC 2.5.8 asks for 24 CSS px, the size `docs/36-accessibility-standard.md` § 1 names to
 * measure; a 24 px circle inside the target is the criterion's own spacing test, and it is the
 * measure a round button can be held to, where a square would charge it for its corners.
 */
const LOBBY_CONTROLS = [
  '.everyday-lobby-call',
  '.everyday-lobby-floor-button',
  '.everyday-lobby-open',
  '.everyday-lobby-close',
  '.everyday-lobby-hold',
  '.everyday-lobby-key',
  '.everyday-lobby-menu',
  '.everyday-lobby-landing',
] as const;

async function hitSquares(page: Page): Promise<{ control: string; side: number }[]> {
  return page.evaluate((selectors) => {
    const out: { control: string; side: number }[] = [];
    for (const selector of selectors) {
      for (const target of document.querySelectorAll<HTMLElement>(selector)) {
        /* `elementFromPoint` sees only the viewport, and on a phone the open panel scrolls. */
        target.scrollIntoView({ block: 'center', inline: 'center' });
        const box = target.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const lands = (radius: number): boolean => {
          for (let i = 0; i < 32; i += 1) {
            const angle = (i / 32) * 2 * Math.PI;
            const hit = document.elementFromPoint(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
            if (hit === null || (hit !== target && !target.contains(hit))) return false;
          }
          return true;
        };
        let side = 0;
        for (let d = 2; d <= 60 && lands(d / 2 - 0.01); d += 1) side = d;
        const floor = target.dataset['floor'];
        out.push({ control: floor === undefined ? selector : `${selector}[${floor}]`, side });
      }
    }
    return out;
  }, LOBBY_CONTROLS);
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
      /* Behind shut doors neither a pointer nor Tab reaches the panel; a floor focused anyway is told why not. */
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

  it('reaches CALL in two Tabs on a fresh load, and never stops behind the shut doors', async () => {
    const page = await coldLobby();
    try {
      const { presses, hiddenStops } = await tabsToCall(page);
      expect(hiddenStops, 'no Tab stop sits behind the closed doors').toEqual([]);
      /* The screen region's own stop, then CALL; it was sixteen before the panel left the order. */
      expect(presses, 'Tabs past the consent ask to CALL').toBeLessThanOrEqual(2);
      /* Once the doors open, focus goes to the panel, and its ring is drawn. */
      await page.keyboard.press('Enter');
      await page.waitForSelector('.everyday-lobby[data-phase="open"]', { timeout: 15_000 });
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.classList.contains('everyday-lobby-floor-button') === true))
        .toBe(true);
      const ring = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const style = getComputedStyle(active);
        return { visible: active.matches(':focus-visible'), outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(ring.visible).toBe(true);
      expect(ring.outline).not.toBe('none');
      expect(ring.width).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  });

  it('gives every control a 24 px hit area on a 390 × 844 phone (docs/36 § 1, SC 2.5.8)', async () => {
    const page = await openPage(browser, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
      await callTheCar(page);
      const squares = await hitSquares(page);
      expect(squares).toHaveLength(LOBBY_CONTROLS.length - 1 + LOBBY_FLOORS.length);
      expect(squares.filter((square) => square.side < 24), JSON.stringify(squares)).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
