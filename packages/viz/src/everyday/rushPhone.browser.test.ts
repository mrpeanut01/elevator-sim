/**
 * **The re-play after wave AQ's rush findings, by the player's own route** — wave AR, lane AR-1
 * (GitHub issue #633).
 *
 * 1. The setup page is readable on a 390×844 phone: the title, the furthest-round fact and the
 *    dispatcher choice are each at least 200 px wide. Red on the base: a two-column grid with no
 *    phone breakpoint left the main column 22 px wide.
 * 2. While a round plays on that phone, the building is on screen: part of the stage canvas is
 *    inside the viewport and above the sticky footer, and the chips stay reachable.
 * 3. *Run the rush again* that never starts playing is not reported as a round lost when the page
 *    closes.
 * 4. Enter pressed straight after *Start the rush* starts the round.
 *
 * And the result states the house's run on the same crowd beside the round (in 3).
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5343, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function coldLoad(width: number, height: number, query = '?building=garden-apartments&seed=424242'): Promise<Page> {
  const page = await openPage(browser, { viewport: { width, height } });
  await page.goto(`${origin}${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true, undefined, {
    timeout: 30_000,
  });
  return page;
}

async function openRushSetup(page: Page): Promise<void> {
  await leaveTutorialIfOffered(page);
  if ((await page.locator('.everyday-consent-no').count()) > 0) await page.locator('.everyday-consent-no').click();
  await page.locator('.everyday-mode[data-screen="rush"]').click();
  await page.waitForSelector('.everyday-rush-driving', { timeout: 15_000 });
}

async function waitForWave(page: Page): Promise<void> {
  await page.waitForFunction(
    () => /^WAVE \d+$/u.test(document.querySelector('.everyday-stage-phase')?.textContent ?? ''),
    undefined,
    { timeout: 60_000 },
  );
}

describe.skipIf(!HAS_BROWSER)('Rush on a phone, after the re-play — wave AR, lane AR-1', () => {
  it('1: the setup page stacks on a 390×844 phone, so its title, furthest round and dispatcher choice are readable', async () => {
    const page = await coldLoad(390, 844);
    try {
      await openRushSetup(page);
      const widths = await page.evaluate(() => {
        const width = (selector: string): number => document.querySelector(selector)?.getBoundingClientRect().width ?? 0;
        return {
          title: width('.everyday-rush-setup h1'),
          furthest: width('.everyday-rush-facts'),
          dispatcher: width('.everyday-rush-driving'),
          scroll: document.documentElement.scrollWidth,
        };
      });
      expect(widths.title, JSON.stringify(widths)).toBeGreaterThanOrEqual(200);
      expect(widths.furthest, 'furthest round').toBeGreaterThanOrEqual(200);
      expect(widths.dispatcher, 'dispatcher choice').toBeGreaterThanOrEqual(200);
      expect(widths.scroll, 'no sideways scroll').toBeLessThanOrEqual(390);
    } finally {
      await page.close();
    }
  });

  /* Wave AS, lane AS-1: and on the tower a first arrival meets, whose twenty floors and garage were the playtest's. */
  it.each([
    ['garden-apartments', '?building=garden-apartments&seed=424242'],
    ['the first arrival’s tower', '?seed=424242'],
  ])('2: while a round plays on a 390×844 phone (%s), the building is on screen above the footer and the chips stay reachable', async (_name, query) => {
    const page = await coldLoad(390, 844, query);
    try {
      await openRushSetup(page);
      await page.locator('.everyday-bar-primary').click();
      await waitForWave(page);
      await page.waitForFunction(
        () => [...document.querySelectorAll<HTMLButtonElement>('.everyday-stage-intervene')].some((node) => !node.disabled),
        undefined,
        { timeout: 30_000 },
      );
      await page.locator('.everyday-stage-play').click();
      /* Play's scroll to the lobby rows lands on a later frame; read once the clock has moved. */
      await page.waitForFunction(() => (document.querySelector('.everyday-stage-clock')?.textContent ?? '0:00') !== '0:00', undefined, {
        timeout: 30_000,
      });
      const seen = await page.evaluate(() => {
        const footer = document.querySelector('.everyday-bar')?.getBoundingClientRect().top ?? window.innerHeight;
        const floor = Math.min(footer, window.innerHeight);
        const canvas = [...document.querySelectorAll<HTMLCanvasElement>('.everyday-stage canvas, .everyday-stage-canvas')]
          .map((node) => node.getBoundingClientRect())
          .filter((box) => box.width > 0 && box.height > 0)
          .sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (canvas === undefined) return { visiblePx: 0, chipsOk: false, dbg: {} };
        const visiblePx = Math.max(0, Math.min(canvas.bottom, floor) - Math.max(canvas.top, 0));
        /* Wave AS, lane AS-1: the picker and *Switch to* fold away while the round plays on a phone. */
        const chipsOk = [...document.querySelectorAll<HTMLElement>('.everyday-stage-intervene, .everyday-stage-switch-pick')]
          .filter((node) => !node.hidden && node.getClientRects().length > 0)
          .every((node) => {
            const box = node.getBoundingClientRect();
            const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return box.top >= 0 && box.bottom <= window.innerHeight && at !== null && (at === node || node.contains(at));
          });
        const dbg = {
          canvases: [...document.querySelectorAll<HTMLCanvasElement>('canvas')].map((n) => [n.className, Math.round(n.getBoundingClientRect().top), Math.round(n.getBoundingClientRect().height), Math.round(n.getBoundingClientRect().width)]),
          chips: [...document.querySelectorAll<HTMLElement>('.everyday-stage-intervene, .everyday-stage-switch-pick')].filter((n) => !n.hidden).map((n) => [n.textContent, Math.round(n.getBoundingClientRect().top), Math.round(n.getBoundingClientRect().bottom)]),
          footer, scrollY: window.scrollY,
        };
        return { visiblePx, chipsOk, dbg };
      });
      expect(seen.visiblePx, JSON.stringify(seen)).toBeGreaterThanOrEqual(200);
      expect(seen.chipsOk, JSON.stringify(seen)).toBe(true);
      /*
       * Wave AS, lane AS-1 (GitHub issue #635, finding 3): the compact row, the chips and the whole
       * building, lobby rows included, are on one screen together, now and a few seconds on. Red on
       * the base: the lobby was below the footer, or the clock was above the top.
       */
      for (const pause of [0, 3_000]) {
        await page.waitForTimeout(pause);
        const together = await page.evaluate(() => {
          const footer = document.querySelector('.everyday-bar')?.getBoundingClientRect().top ?? window.innerHeight;
          const floor = Math.min(footer, window.innerHeight);
          const box = (selector: string): DOMRect | undefined => document.querySelector(selector)?.getBoundingClientRect();
          const inView = (rect: DOMRect | undefined): boolean => rect !== undefined && rect.height > 0 && rect.top >= -0.5 && rect.bottom <= floor + 0.5;
          const canvas = box('.everyday-stage-canvas');
          const header = box('.everyday-stage-header');
          const hud = {
            clock: inView(box('.everyday-stage-clock')),
            wave: inView(box('.everyday-stage-phase')),
            count: inView(box('.everyday-stage-figure-value')),
            pause: inView(box('.everyday-stage-play')) && /Pause/u.test(document.querySelector('.everyday-stage-play')?.textContent ?? ''),
            building: inView(canvas) && header !== undefined && canvas !== undefined && canvas.top >= header.bottom - 0.5,
            chips: [...document.querySelectorAll<HTMLElement>('.everyday-stage-intervene')]
              .filter((node) => node.getClientRects().length > 0)
              .every((node) => {
                const rect = node.getBoundingClientRect();
                const at = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
                return inView(rect) && at !== null && (at === node || node.contains(at));
              }),
            picker: document.querySelector<HTMLElement>('.everyday-stage-switch-pick')?.getClientRects().length ?? 0,
          };
          return { hud, dbg: { floor, header: header?.toJSON(), canvas: canvas?.toJSON(), count: document.querySelector('.everyday-stage-figure-value')?.textContent } };
        });
        const message = JSON.stringify(together);
        expect(together.hud.clock && together.hud.wave && together.hud.count && together.hud.pause, message).toBe(true);
        expect(together.hud.building, message).toBe(true);
        expect(together.hud.chips, message).toBe(true);
        expect(together.hud.picker, 'the dispatcher picker folds away while the round plays').toBe(0);
        expect(together.dbg.count ?? '', 'the compact count reads against the line').toMatch(/^\d+\/40$/u);
      }
      /* A pause unfolds the picker again. */
      await page.locator('.everyday-stage-play').click();
      await page.waitForFunction(() => (document.querySelector<HTMLElement>('.everyday-stage-switch-pick')?.getClientRects().length ?? 0) > 0, undefined, {
        timeout: 5_000,
      });
    } finally {
      await page.close();
    }
  });

  it('3: a round started again that never played is not reported as lost when the page closes', async () => {
    const page = await coldLoad(1280, 800);
    try {
      await openRushSetup(page);
      await page.locator('.everyday-bar-primary').click();
      await waitForWave(page);
      await page.locator('.everyday-bar-primary').click();
      await page.locator('.everyday-stage-end-confirm-go').click();
      await page.waitForSelector('.everyday-rush-result', { timeout: 15_000 });
      /* The house run on the same crowd is stated beside the round, as two figures and no verdict. */
      expect(await page.textContent('.everyday-rush-result-house')).toMatch(
        /^This round was ended by hand at \d+:\d\d, in wave \d+\. The house run on the same crowd, .+ with no changes, held /u,
      );
      /* Run the rush again, and close the page before the new round's clock moves. */
      await page.locator('.everyday-bar-primary').click();
      await waitForWave(page);
      expect(await page.textContent('.everyday-stage-clock')).toBe('0:00');
      await page.reload({ waitUntil: 'load' });
      await openRushSetup(page);
      expect(await page.locator('.everyday-rush-unfinished').count()).toBe(0);
    } finally {
      await page.close();
    }
  });

  it('4: Enter pressed straight after Start the rush starts the round', async () => {
    const page = await coldLoad(1280, 800);
    try {
      await openRushSetup(page);
      await page.locator('.everyday-bar-primary').focus();
      await page.keyboard.press('Enter');
      /* No wait for focus to move: the very next key is the player's. */
      await page.keyboard.press('Enter');
      await waitForWave(page);
      await page.waitForFunction(() => (document.querySelector('.everyday-stage-clock')?.textContent ?? '0:00') !== '0:00', undefined, {
        timeout: 30_000,
      });
      /*
       * Wave AS, lane AS-1 (GitHub issue #635, finding 2): the round plays, so the button offers
       * *Pause*. Red on the base: it still read *▶ Play*, and pressing it paused the round.
       */
      await page.waitForFunction(() => /Pause/u.test(document.querySelector('.everyday-stage-play')?.textContent ?? ''), undefined, {
        timeout: 5_000,
      });
      await page.locator('.everyday-stage-play').click();
      await page.waitForFunction(() => /Play/u.test(document.querySelector('.everyday-stage-play')?.textContent ?? ''), undefined, {
        timeout: 5_000,
      });
      const clock = await page.textContent('.everyday-stage-clock');
      await page.waitForTimeout(600);
      expect(await page.textContent('.everyday-stage-clock'), 'pressing Pause stops the clock').toBe(clock);
    } finally {
      await page.close();
    }
  });
});
