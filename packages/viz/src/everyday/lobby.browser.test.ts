/**
 * **The lobby on the shipped bundle** — [§ D1445](../../../../DECISIONS.md), as redrawn by
 * [§ D1627](../../../../DECISIONS.md).
 *
 * `lobbyModel.test.ts` holds the small machine and `floors.test.ts` the floor map, in the node tier.
 * What only a browser can hold is the rest: that a cold launch opens on the hall with the shell's
 * chrome stepped aside, that **one press on a landing is the whole trip** and lands on that floor's
 * own screen with the tray back and its car on the floor, that the press is not waiting on any
 * motion, that the lobby's own landing is the way to the main menu, and that *Skip the lobby*
 * restores the old front door.
 *
 * Most pages here are opened with `reducedMotion: 'reduce'`, because nothing they assert is about
 * the picture. The one case that is about motion opens with it on and measures the press.
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
import { GAME_FLOORS } from './floors.js';
import { LOBBY_COPY, LOBBY_TIMINGS } from './lobbyModel.js';

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

/** Press a landing, by pointer. One press: there is nothing else to do. */
async function pressLanding(page: Page, floor: string): Promise<void> {
  await page.locator(`.everyday-lobby-floor-button[data-floor="${floor}"]`).click();
}

/**
 * Every control the lobby offers, and the pointer's hit area for each: the
 * diameter of the largest circle, centred on the control, whose every sampled point lands on it.
 * WCAG 2.2 SC 2.5.8 asks for 24 CSS px, the size `docs/36-accessibility-standard.md` § 1 names to
 * measure; a 24 px circle inside the target is the criterion's own spacing test, and it is the
 * measure a round button can be held to, where a square would charge it for its corners.
 */
const LOBBY_CONTROLS = ['.everyday-lobby-floor-button', '.everyday-lobby-key', '.everyday-lobby-landing'] as const;

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

describe.skipIf(!HAS_BROWSER)('§ D1445, § D1627 — the lobby', () => {
  it('opens a cold launch on the hall, with the rail and the bar stepped aside and every landing live', async () => {
    const page = await coldLobby();
    try {
      expect(await page.locator('.everyday-rail').isVisible()).toBe(false);
      expect(await page.locator('.everyday-bar').isVisible()).toBe(false);
      expect(await page.locator('.everyday-lobby-title').textContent()).toBe(LOBBY_COPY.welcomeTitle);
      expect(await page.locator('.everyday-lobby-indicator').textContent()).toContain('L');
      const landings = page.locator('.everyday-lobby-floor-button');
      expect(await landings.count()).toBe(GAME_FLOORS.length);
      for (let index = 0; index < GAME_FLOORS.length; index += 1) {
        expect(await landings.nth(index).isEnabled(), `landing ${GAME_FLOORS[index]?.key ?? ''}`).toBe(true);
      }
      const frame = await page.locator('.everyday-lobby').boundingBox();
      expect(frame?.width ?? 0, 'the lobby has the whole viewport width').toBeGreaterThan(1400);
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
      expect(await page.locator('.everyday-lobby').count(), 'still in the hall').toBe(1);
    } finally {
      await page.close();
    }
  });

  it('steps out onto the Scenario hub in one press, with the tray back and its car on 3', async () => {
    const page = await coldLobby();
    try {
      await pressLanding(page, '3');
      await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
      expect(await page.locator('.everyday-rail').isVisible()).toBe(true);
      expect(await page.locator('.everyday-lobby').count()).toBe(0);
      expect(await page.locator('.everyday-rail-floor[aria-current="location"]').getAttribute('data-floor')).toBe('3');
    } finally {
      await page.close();
    }
  });

  /*
   * § D1627's rule, on the built bundle with motion **on**: the press is the trip. The § D1445
   * build took four presses and about ten seconds of its own timings to reach Scenario. Here the
   * hall is asked for in the same task as the press, before any timer or frame could have run, so a
   * handler that waited on the glide or on the doors fails here rather than in a playtest. It is a
   * question of order and not of milliseconds, so it does not depend on the machine.
   */
  it('does not wait on the car or the doors: the hall is gone in the task that pressed the landing', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForSelector('.everyday-lobby', { timeout: 30_000 });
      const after = await page.evaluate(() => {
        document.querySelector<HTMLElement>('.everyday-lobby-floor-button[data-floor="3"]')?.click();
        const doors = document.querySelector<HTMLElement>('.everyday-floor-doors');
        return {
          hall: document.querySelector('.everyday-lobby') !== null,
          floor: document.querySelector('.everyday-rail-floor[aria-current="location"]')?.getAttribute('data-floor'),
          /* The doors that part over the new floor are up already, and take no pointer events. */
          doors: doors === null ? 'absent' : getComputedStyle(doors).pointerEvents,
          hidden: doors?.getAttribute('aria-hidden'),
        };
      });
      expect(after.hall, 'the hall is left on the press, not after a ride').toBe(false);
      expect(after.floor).toBe('3');
      expect(after.doors).toBe('none');
      expect(after.hidden).toBe('true');
      /* And they take themselves away, inside the hall's own motion budget twice over. */
      await page.waitForSelector('.everyday-floor-doors', {
        state: 'detached',
        timeout: 4 * (LOBBY_TIMINGS.full.glideMs + LOBBY_TIMINGS.full.doorMs),
      });
      await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  });

  it('opens the lobby floor on the main menu, where the walkthrough is one row away', async () => {
    const page = await coldLobby();
    try {
      expect(await page.locator('.everyday-lobby').textContent()).toContain(LOBBY_COPY.firstVisit);
      await pressLanding(page, 'L');
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 30_000 });
      await page.locator('.everyday-rail button', { hasText: 'How this works' }).click();
      await page.waitForSelector('.everyday-tutorial', { timeout: 30_000 });
      expect(await page.locator('.everyday-rail-floor[aria-current="location"]').getAttribute('data-floor')).toBe('L');
    } finally {
      await page.close();
    }
  });

  it('comes back to the hall from the tray, with nothing pointed at', async () => {
    const page = await coldLobby();
    try {
      await pressLanding(page, 'B');
      await page.waitForSelector('.everyday-rail', { state: 'visible', timeout: 15_000 });
      expect(await page.locator('.everyday-rail-floor[aria-current="location"]').getAttribute('data-floor')).toBe('B');
      await page.locator('.everyday-rail button', { hasText: 'Elevator hall' }).click();
      await page.waitForSelector('.everyday-lobby', { timeout: 15_000 });
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

  it('is worked from the keyboard: Tab to a landing, arrows between them, Enter to step out', async () => {
    const page = await coldLobby();
    try {
      await page.locator('.everyday-consent-no').click();
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      let presses = 0;
      let onLanding = false;
      while (presses < 6 && !onLanding) {
        await page.keyboard.press('Tab');
        presses += 1;
        onLanding = await page.evaluate(() => document.activeElement?.classList.contains('everyday-lobby-floor-button') === true);
      }
      /* The skip link and the screen region's own stop, then the top landing. */
      expect(presses, 'Tabs to the first landing').toBeLessThanOrEqual(3);
      const ring = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const style = getComputedStyle(active);
        return { floor: active.dataset['floor'], visible: active.matches(':focus-visible'), outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(ring.floor).toBe('3');
      expect(ring.visible).toBe(true);
      expect(ring.outline).not.toBe('none');
      expect(ring.width).toBeGreaterThan(0);
      /* Focus points the car, as the pointer does. */
      expect(await page.locator('.everyday-lobby-title').textContent()).toBe('Scenario');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset['floor'])).toBe('1');
      await page.keyboard.press('ArrowUp');
      expect(await page.locator('.everyday-lobby-title').textContent()).toBe('Career');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.everyday-rail-floor[aria-current="location"][data-floor="2"]', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  });

  /*
   * GitHub issue #627 measured the § D1445 panel drawing its floor buttons 10 to 15 px tall in a
   * short window. The hall has no panel to scale: the landings keep their size and the region
   * scrolls, so the same six sizes are held to the same 24 px, with the consent ask standing above
   * the lobby as it does on a first visit and with it answered. 320 × 320 is WCAG 1.4.10's reflow
   * width taken as both sides.
   */
  const VIEWPORTS = [
    { width: 1440, height: 900, asks: ['up', 'answered'] },
    { width: 1280, height: 540, asks: ['up', 'answered'] },
    { width: 844, height: 390, asks: ['up', 'answered'] },
    { width: 390, height: 844, asks: ['up', 'answered'] },
    { width: 375, height: 667, asks: ['up', 'answered'] },
    { width: 320, height: 320, asks: ['up', 'answered'] },
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
          const squares = await hitSquares(page);
          const label = `${String(viewport.width)} × ${String(viewport.height)}, ask ${ask}: ${JSON.stringify(squares)}`;
          expect(squares, label).toHaveLength(LOBBY_CONTROLS.length - 1 + GAME_FLOORS.length);
          expect(squares.filter((square) => square.side < 24), label).toEqual([]);
        } finally {
          await page.close();
        }
      }
    },
  );

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
              await pressLanding(page, '3');
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
      const top = '.everyday-lobby-floor-button[data-floor="3"]';
      await page.locator(top).evaluate((node) => {
        node.scrollIntoView({ block: 'nearest' });
      });
      expect(await landsOn(page, top), 'the top landing is in reach beside the ask').toBe(true);
      await pressLanding(page, '3');
      await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
      expect(await page.locator('.everyday-consent-no').count(), 'and the ask still stands, unanswered').toBe(1);
    } finally {
      await page.close();
    }
  });
});
