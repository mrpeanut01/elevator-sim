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

  /*
   * GitHub issue #627: the 0.75 floor held only at widths of 720 px and below, so a short window
   * wider than that (the handoff's own 1280 × 540 check, a landscape phone) still drew the floor
   * buttons 10 to 15 px tall. Each size is driven twice, with the consent ask standing above the
   * lobby as it does on a first visit and with it answered, because the ask is what takes the
   * height. CALL is pressed by a real click, so it is reachable in every case.
   *
   * 320 × 320 is the smallest size the lobby promises this at (`lobbyScreen.ts#MIN_SCALE`), and only
   * with the ask answered: at that size the shell's ask is about 510 px tall and leaves the screen
   * region no height at all, which no screen can answer from inside the region.
   */
  const VIEWPORTS = [
    { width: 1440, height: 900, asks: ['up', 'answered'] },
    { width: 1280, height: 540, asks: ['up', 'answered'] },
    { width: 844, height: 390, asks: ['up', 'answered'] },
    { width: 390, height: 844, asks: ['up', 'answered'] },
    { width: 375, height: 667, asks: ['up', 'answered'] },
    { width: 320, height: 320, asks: ['answered'] },
  ] as const;

  it.each(VIEWPORTS)(
    'gives every control a 24 px hit area at $width × $height, ask $asks (docs/36 § 1, SC 2.5.8)',
    async ({ width, height, asks }) => {
      const viewport = { width, height };
      for (const ask of asks) {
        const page = await openPage(browser, { viewport, reducedMotion: 'reduce' });
        try {
          await page.goto(origin, { waitUntil: 'load' });
          await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
          const consent = page.locator('.everyday-consent-no');
          if (ask === 'answered') await consent.click();
          else expect(await consent.count(), 'the ask stands on a first visit').toBe(1);
          await callTheCar(page);
          const squares = await hitSquares(page);
          const label = `${String(viewport.width)} × ${String(viewport.height)}, ask ${ask}: ${JSON.stringify(squares)}`;
          expect(squares, label).toHaveLength(LOBBY_CONTROLS.length - 1 + LOBBY_FLOORS.length);
          expect(squares.filter((square) => square.side < 24), label).toEqual([]);
        } finally {
          await page.close();
        }
      }
    },
  );

  /** Every control on the car panel, in document order, with its `tabIndex` now. */
  const panelStops = (page: Page): Promise<{ name: string; index: number }[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>('.everyday-lobby-panel button')].map((button) => ({
        name: button.getAttribute('aria-label') ?? '',
        index: button.tabIndex,
      })),
    );

  /** The panel controls focus visits, starting from the focused one and pressing Tab `presses` times. */
  async function tabThroughPanel(page: Page, presses: number): Promise<string[]> {
    const read = (): Promise<string | null> =>
      page.evaluate(() => {
        const active = document.activeElement;
        return active === null || active.closest('.everyday-lobby-panel') === null ? null : active.getAttribute('aria-label');
      });
    const reached: string[] = [];
    for (let press = 0; press <= presses; press += 1) {
      if (press > 0) await page.keyboard.press('Tab');
      const name = await read();
      if (name !== null) reached.push(name);
    }
    return reached;
  }

  /* The ten floors, then OPEN, CLOSE, HOLD and the Engineer key. */
  const PANEL_CONTROLS = LOBBY_FLOORS.length + 4;

  it('rides back to the lobby with focus on a floor and all fourteen panel controls in the Tab order', async () => {
    const page = await coldLobby();
    try {
      expect(PANEL_CONTROLS).toBe(14);
      await callTheCar(page);
      await rideTo(page, '3');
      await page.locator('.everyday-lobby-back').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.everyday-lobby[data-phase="open"]', { timeout: 15_000 });
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.classList.contains('everyday-lobby-floor-button') === true))
        .toBe(true);
      const stops = await panelStops(page);
      expect(stops).toHaveLength(PANEL_CONTROLS);
      expect(stops.filter((stop) => stop.index !== 0), 'out of the Tab order').toEqual([]);
      expect(await tabThroughPanel(page, PANEL_CONTROLS - 1)).toEqual(stops.map((stop) => stop.name));
    } finally {
      await page.close();
    }
  });

  it('lets a keyboard catch the closing doors with OPEN, and keeps the panel in the Tab order', async () => {
    /* Full motion, so the doors take 1.15 s to shut: the keyboard's window, not a race with 150 ms. */
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
      await callTheCar(page);
      await page.locator('.everyday-lobby-floor-button[data-floor="8"]').click();
      await page.locator('.everyday-lobby-close').focus();
      await page.keyboard.press('Enter');
      expect(await page.locator('.everyday-lobby').getAttribute('data-phase')).toBe('closing');
      /* OPEN sits just before CLOSE; while the doors close it must still be a Tab stop. */
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.activeElement?.classList.contains('everyday-lobby-open'))).toBe(true);
      await page.keyboard.press('Enter');
      expect(await page.locator('.everyday-lobby').getAttribute('data-phase')).toBe('open');
      /* Past the moment the car would have left, it is still here, with focus kept and the panel reachable. */
      await page.waitForTimeout(1500);
      expect(await page.locator('.everyday-lobby').getAttribute('data-phase')).toBe('open');
      expect(await page.evaluate(() => document.activeElement?.classList.contains('everyday-lobby-open'))).toBe(true);
      const stops = await panelStops(page);
      expect(stops.filter((stop) => stop.index !== 0), 'out of the Tab order').toEqual([]);
      await page.locator('.everyday-lobby-floor-button').first().focus();
      expect(await tabThroughPanel(page, PANEL_CONTROLS - 1)).toEqual(stops.map((stop) => stop.name));
    } finally {
      await page.close();
    }
  });
});
