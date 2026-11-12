/**
 * **The lobby on the shipped bundle** — the front door and the main menu, one screen
 * ([§ D1628](../../../../DECISIONS.md), after § D1445 and [§ D1627](../../../../DECISIONS.md)).
 *
 * `lobbyModel.test.ts` holds the small machine and `floors.test.ts` the floor map, in the node tier.
 * What only a browser can hold is the rest: that a cold launch opens on the lobby **inside the
 * shell**, with the tray beside it and its car on L; that the three top landings are the mode
 * tiles; that one press on a landing or a room is the whole trip and is not waiting on any motion;
 * that the lobby is where *Main menu* comes back to; and that no setting skips it, because there is
 * nothing behind it to skip to.
 *
 * Most pages here are opened with `reducedMotion: 'reduce'`, because nothing they assert is about
 * the picture. The one case that is about motion opens with it on.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, openPage, startShippedSite, type ShippedSite } from '../dev/browserTier.test-helper.js';
import { GAME_FLOORS } from './floors.js';
import { LOBBY_COPY, LOBBY_TIMINGS } from './lobbyModel.js';
import { EVERYDAY_MODES } from './modes.js';

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

async function coldLobby(viewport = { width: 1440, height: 900 }): Promise<Page> {
  const page = await openPage(browser, { viewport, reducedMotion: 'reduce' });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
  return page;
}

/** The floor the tray's car is standing at. */
const trayFloor = (page: Page): Promise<string | null> =>
  page.getAttribute('.everyday-rail-floor[aria-current="location"]', 'data-floor');

/**
 * Every control the lobby offers, and the pointer's hit area for each: the diameter of the largest
 * circle, centred on the control, whose every sampled point lands on it. WCAG 2.2 SC 2.5.8 asks for
 * 24 CSS px, the size `docs/36-accessibility-standard.md` § 1 names to measure.
 */
const LOBBY_CONTROLS = ['.everyday-lobby-floor-button', '.everyday-lobby-room'] as const;

async function hitSquares(page: Page): Promise<{ control: string; side: number }[]> {
  return page.evaluate((selectors) => {
    const out: { control: string; side: number }[] = [];
    for (const selector of selectors) {
      for (const target of document.querySelectorAll<HTMLElement>(selector)) {
        /* `elementFromPoint` sees only the viewport, and on a phone the lobby scrolls. */
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
        out.push({ control: `${selector}[${target.dataset['floor'] ?? target.dataset['screen'] ?? ''}]`, side });
      }
    }
    return out;
  }, LOBBY_CONTROLS);
}

describe.skipIf(!HAS_BROWSER)('§ D1628 — the lobby is the main menu', () => {
  it('opens a cold launch on the lobby inside the shell, with the tray’s car on L and the bar under it', async () => {
    const page = await coldLobby();
    try {
      expect(await page.locator('.everyday-rail').isVisible()).toBe(true);
      expect(await page.locator('.everyday-bar').isVisible()).toBe(true);
      expect(await trayFloor(page)).toBe('L');
      expect(await page.locator('.everyday-lobby-title').textContent()).toBe(LOBBY_COPY.welcomeTitle);
      expect(await page.locator('.everyday-lobby-indicator').textContent()).toContain('L');
      expect(await page.locator('.everyday-lobby h1').textContent()).toBe(LOBBY_COPY.building);
      /* One landing a floor, and the lobby's own is where the player stands rather than a press. */
      expect(await page.locator('.everyday-lobby-landing-row').count()).toBe(GAME_FLOORS.length);
      expect(await page.locator('.everyday-lobby-floor-button').count()).toBe(GAME_FLOORS.length - 1);
      expect(await page.locator('.everyday-lobby-here').textContent()).toContain(LOBBY_COPY.here);
    } finally {
      await page.close();
    }
  });

  it('draws the three modes as its three top landings, and nothing else is a mode tile', async () => {
    const page = await coldLobby();
    try {
      const tiles = await page.$$eval('.everyday-mode[data-screen]', (nodes) =>
        nodes.map((node) => ({ screen: node.getAttribute('data-screen'), inLobby: node.closest('.everyday-lobby') !== null })),
      );
      expect(tiles.map((tile) => tile.screen)).toEqual(EVERYDAY_MODES.map((mode) => mode.screen));
      expect(tiles.every((tile) => tile.inLobby)).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('points the car at a landing and describes the floor, without going anywhere', async () => {
    const page = await coldLobby();
    try {
      await page.locator('.everyday-lobby-floor-button[data-floor="1"]').hover();
      await expect.poll(() => page.locator('.everyday-lobby-title').textContent()).toBe('Rush');
      expect(await page.locator('.everyday-lobby-indicator').textContent()).toContain('1');
      expect(await page.locator('.everyday-lobby').count(), 'still in the lobby').toBe(1);
      expect(await trayFloor(page), 'pointing is not travelling').toBe('L');
    } finally {
      await page.close();
    }
  });

  it('steps out onto the Scenario hub in one press, and the tray’s car is on 3', async () => {
    const page = await coldLobby();
    try {
      await page.locator('.everyday-lobby-floor-button[data-floor="3"]').click();
      await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
      expect(await page.locator('.everyday-lobby').count()).toBe(0);
      expect(await trayFloor(page)).toBe('3');
    } finally {
      await page.close();
    }
  });

  it('opens a room in one press, from the landing it is on', async () => {
    const page = await coldLobby();
    try {
      await page.locator('.everyday-lobby-room[data-screen="designer"]').click();
      await page.waitForSelector('.everyday-rail-floor[aria-current="location"][data-floor="B"]', { timeout: 15_000 });
      expect(await page.locator('.everyday-lobby').count()).toBe(0);
      expect(await page.textContent('.everyday-bar-primary')).toBe('Test simulation');
    } finally {
      await page.close();
    }
  });

  /*
   * § D1627's rule, on the built bundle with motion **on**: the press is the trip. The lobby is
   * asked for in the same task as the press, before any timer or frame could have run, so a handler
   * that waited on the glide or on the doors fails here rather than in a playtest. It is a question
   * of order and not of milliseconds, so it does not depend on the machine.
   */
  it('does not wait on the car or the doors: the lobby is gone in the task that pressed the landing', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
      const after = await page.evaluate(() => {
        document.querySelector<HTMLElement>('.everyday-lobby-floor-button[data-floor="3"]')?.click();
        const doors = document.querySelector<HTMLElement>('.everyday-floor-doors');
        return {
          lobby: document.querySelector('.everyday-lobby') !== null,
          floor: document.querySelector('.everyday-rail-floor[aria-current="location"]')?.getAttribute('data-floor'),
          /* The doors that part over the new floor are up already, and take no pointer events. */
          doors: doors === null ? 'absent' : getComputedStyle(doors).pointerEvents,
          hidden: doors?.getAttribute('aria-hidden'),
        };
      });
      expect(after.lobby, 'the lobby is left on the press, not after a ride').toBe(false);
      expect(after.floor).toBe('3');
      expect(after.doors).toBe('none');
      expect(after.hidden).toBe('true');
      /* And they take themselves away, inside the lobby's own motion budget twice over. */
      await page.waitForSelector('.everyday-floor-doors', {
        state: 'detached',
        timeout: 4 * (LOBBY_TIMINGS.full.glideMs + LOBBY_TIMINGS.full.doorMs),
      });
      await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  });

  it('is where the tray’s Lobby floor and the bar’s leave come back to', async () => {
    const page = await coldLobby();
    try {
      await page.locator('.everyday-lobby-floor-button[data-floor="M"]').click();
      await page.waitForSelector('.everyday-rail-floor[aria-current="location"][data-floor="M"]', { timeout: 15_000 });
      await page.locator('.everyday-rail-menu').click();
      await page.waitForSelector('.everyday-lobby', { timeout: 15_000 });
      expect(await trayFloor(page)).toBe('L');
      /* Nothing is pointed at on the way back: the welcome, and the car at the lobby. */
      expect(await page.locator('.everyday-lobby-title').textContent()).toBe(LOBBY_COPY.welcomeTitle);
      await page.locator('.everyday-lobby-room[data-screen="board"]').click();
      await page.waitForSelector('.everyday-rail-floor[aria-current="location"][data-floor="M"]', { timeout: 15_000 });
      await page.locator('.everyday-bar-leave').click();
      await page.waitForSelector('.everyday-lobby', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  });

  /* § D1445's *Skip the lobby* skipped to the menu. They are one screen, so the key does nothing. */
  it('is not skipped by the retired setting’s key, and Settings offers no row for one', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    try {
      await page.addInitScript(() => {
        window.localStorage.setItem('elevator-sim.everyday.skip-lobby', '1');
      });
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
      await page.locator('.everyday-rail-settings').click();
      await page.waitForSelector('.everyday-rail-subline:has-text("SETTINGS")', { timeout: 15_000 });
      expect(await page.locator('.everyday-screen').textContent()).not.toMatch(/Skip the lobby/u);
    } finally {
      await page.close();
    }
  });

  it('is worked from the keyboard: arrows between the landings, Enter to step out', async () => {
    const page = await coldLobby();
    try {
      await page.locator('.everyday-lobby-floor-button[data-floor="3"]').focus();
      /* Focus points the car, as the pointer does. */
      expect(await page.locator('.everyday-lobby-title').textContent()).toBe('Scenario');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset['floor'])).toBe('1');
      await page.keyboard.press('ArrowUp');
      expect(await page.locator('.everyday-lobby-title').textContent()).toBe('Career');
      const ring = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const style = getComputedStyle(active);
        return { visible: active.matches(':focus-visible'), outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(ring.visible).toBe(true);
      expect(ring.outline).not.toBe('none');
      expect(ring.width).toBeGreaterThan(0);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.everyday-rail-floor[aria-current="location"][data-floor="2"]', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  });

  /*
   * GitHub issue #627 measured the § D1445 panel drawing its floor buttons 10 to 15 px tall in a
   * short window. The lobby has no panel to scale: the landings keep their size and the region
   * scrolls, so the same sizes are held to the same 24 px. 320 × 320 is WCAG 1.4.10's reflow width
   * taken as both sides.
   */
  const VIEWPORTS = [
    { width: 1440, height: 900 },
    { width: 1280, height: 540 },
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 375, height: 667 },
    { width: 320, height: 320 },
  ] as const;

  it.each(VIEWPORTS)('gives every control a 24 px hit area at $width × $height (docs/36 § 1, SC 2.5.8)', async (viewport) => {
    const page = await coldLobby({ ...viewport });
    try {
      await page.locator('.everyday-consent-no').click();
      const squares = await hitSquares(page);
      const label = `${String(viewport.width)} × ${String(viewport.height)}: ${JSON.stringify(squares)}`;
      const rooms = GAME_FLOORS.reduce((sum, floor) => sum + floor.rooms.length, 0);
      expect(squares, label).toHaveLength(GAME_FLOORS.length - 1 + rooms);
      expect(squares.filter((square) => square.side < 24), label).toEqual([]);
    } finally {
      await page.close();
    }
  });

  /*
   * GitHub issue #630. The consent ask is a notice above the screen and never a gate (`docs/26`
   * § 4.4), and it owes the player all four of its paragraphs (§ 15.2). At 320 × 320 it was 511 px
   * tall in a root that clips: the lobby's first control could not be reached while it stood, and its last paragraph
   * could not be read at all. Each answer is given by a real click at the button's centre (no
   * scroll on the player's behalf) and by Tab and Enter, with the ask's words scrolled to the top
   * and to the bottom first, so both answers stay in reach wherever the words have been left.
   */
  const ASK_VIEWPORTS = [
    { width: 320, height: 320 },
    { width: 844, height: 390 },
  ] as const;
  const ASK_PARTS = ['heading', 'body', 'not', 'later'] as const;

  /** Whether a point at the centre of `selector` lands on it, so a pointer there would press it. */
  const landsOn = (page: Page, selector: string): Promise<boolean> =>
    page.evaluate((s) => {
      const target = document.querySelector<HTMLElement>(s);
      if (target === null) return false;
      const box = target.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit !== null && (hit === target || target.contains(hit));
    }, selector);

  /** Whether the first line, the middle and the last line of a paragraph all land on it, so none is under anything. */
  const readable = (page: Page, selector: string): Promise<boolean> =>
    page.evaluate((s) => {
      const target = document.querySelector<HTMLElement>(s);
      if (target === null) return false;
      const box = target.getBoundingClientRect();
      const x = box.left + Math.min(box.width / 2, 20);
      return [box.top + 3, box.top + box.height / 2, box.bottom - 3].every((y) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === target || target.contains(hit));
      });
    }, selector);

  /** Scroll the ask's own box to its top or its bottom, as a player's wheel or swipe would. */
  const scrollAsk = (page: Page, to: 'top' | 'bottom'): Promise<void> =>
    page.evaluate((end) => {
      const row = document.querySelector<HTMLElement>('.everyday-consent-row');
      if (row !== null) row.scrollTop = end === 'top' ? 0 : row.scrollHeight;
    }, to);

  it.each(ASK_VIEWPORTS)(
    'answers the consent ask by click and by keyboard at $width × $height, with a landing in reach after',
    async ({ width, height }) => {
      for (const how of ['click', 'keyboard'] as const) {
        for (const answer of ['no', 'yes'] as const) {
          for (const end of ['top', 'bottom'] as const) {
            const label = `${String(width)} × ${String(height)}, ${how}, ${answer}, words at the ${end}`;
            const page = await openPage(browser, { viewport: { width, height }, reducedMotion: 'reduce' });
            try {
              await page.goto(origin, { waitUntil: 'load' });
              await page.waitForSelector('.everyday-consent-no', { timeout: 30_000 });
              const askHeight = await page.evaluate(
                () => document.querySelector('.everyday-consent')?.getBoundingClientRect().height ?? 0,
              );
              expect(askHeight, `${label}: the ask leaves the screen half the height`).toBeLessThanOrEqual(height / 2 + 1);

              /* Every paragraph the ask owes can be brought into view and read. */
              for (const part of ASK_PARTS) {
                const selector = `.everyday-consent-${part}`;
                await page.locator(selector).evaluate((node) => {
                  node.scrollIntoView({ block: 'nearest' });
                });
                expect(await readable(page, selector), `${label}: ${part} can be read`).toBe(true);
              }

              await scrollAsk(page, end);
              for (const button of ['.everyday-consent-no', '.everyday-consent-yes']) {
                expect(await landsOn(page, button), `${label}: ${button} is in reach`).toBe(true);
              }
              const target = `.everyday-consent-${answer}`;
              if (how === 'click') {
                const box = await page.locator(target).boundingBox();
                expect(box, label).not.toBeNull();
                if (box !== null) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              } else {
                await page.evaluate(() => {
                  (document.activeElement as HTMLElement | null)?.blur();
                });
                let reached = false;
                for (let press = 0; press < 30 && !reached; press += 1) {
                  await page.keyboard.press('Tab');
                  reached = await page.evaluate((s) => document.activeElement?.matches(s) === true, target);
                }
                expect(reached, `${label}: Tab reaches the answer`).toBe(true);
                expect(await landsOn(page, target), `${label}: the focused answer is on screen`).toBe(true);
                await page.keyboard.press('Enter');
              }
              await expect.poll(() => page.locator('.everyday-consent-no').count(), { message: label }).toBe(0);
              await page.locator('.everyday-lobby-floor-button[data-floor="3"]').click();
              await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
            } finally {
              await page.close();
            }
          }
        }
      }
    },
  );

  it('keeps a landing in reach at 320 × 320 while the consent ask stands (docs/26 § 4.4)', async () => {
    const page = await openPage(browser, { viewport: { width: 320, height: 320 }, reducedMotion: 'reduce' });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
      expect(await page.locator('.everyday-consent-no').count(), 'the ask stands on a first visit').toBe(1);
      /*
       * § D1631: the bar is one row here and the lobby keeps a landing's worth of room. Measured
       * before the fix at 92 px of bar and 18 px of lobby; the floors are a whole row and 48 px.
       */
      const room = await page.evaluate(() => ({
        bar: document.querySelector('.everyday-bar')?.getBoundingClientRect().height ?? 0,
        lobby: document.querySelector('.everyday-screen')?.getBoundingClientRect().height ?? 0,
        leaveShown: (document.querySelector<HTMLElement>('.everyday-bar-leave')?.offsetWidth ?? 0) > 0,
      }));
      expect(room.bar, 'the lobby bar wrapped to a second row').toBeLessThanOrEqual(56);
      expect(room.lobby, 'the lobby has less than a landing of room').toBeGreaterThanOrEqual(48);
      expect(room.leaveShown, 'a narrow lobby drew the leave that leads nowhere').toBe(false);
      const top = '.everyday-lobby-floor-button[data-floor="3"]';
      /* Centred, because the shell's header and bar share this window with the ask (§ D1628). */
      await page.locator(top).evaluate((node) => {
        node.scrollIntoView({ block: 'center' });
      });
      expect(await landsOn(page, top), 'the top landing is in reach beside the ask').toBe(true);
      await page.locator('.everyday-lobby-floor-button[data-floor="3"]').click();
      await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
      expect(await page.locator('.everyday-consent-no').count(), 'and the ask still stands, unanswered').toBe(1);
    } finally {
      await page.close();
    }
  });
});
