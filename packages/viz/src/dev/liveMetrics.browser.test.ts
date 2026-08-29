/**
 * **The DOM check issue #115 § 6 said could not be made** — `docs/21` § 3.4's headline acceptance.
 *
 * ## What this tier can see that no other tier can
 *
 * The live metrics panel was drawn into the stage's bitmap. § D316 found four of its strings
 * overhanging the panel border at the viewer's own 910 × 547 canvas — `boarded (window) 75 legs` at
 * 173 px, `main  75 legs  suppressed` at 180 px, `… (full reason below the canvas)` at 211 px — and
 * closed the clipping with a width floor computed from an assumed character advance. It could not
 * close the reason the defect shipped for a wave with every tier green: **a string inside a canvas
 * has no `scrollWidth`**, so no automated check anywhere in this repository could see the panel's
 * geometry at all.
 *
 * The panel is a DOM card now (`render/overlay.ts#overlayViewOf` → `dev/main.ts#drawLiveMetrics`),
 * and this file asks the browser the question directly: `scrollWidth <= clientWidth`, on the card
 * and on every element inside it, over **all eight shipped buildings** in **both registers**. That
 * is strictly stronger than the arithmetic it replaces — it measures the real face at the real
 * width, including the authored bank ids nobody here chose (`office-low-rise` is fifteen
 * characters) — and it is what `docs/21` § 5's B3 entry names as the lane's liveness evidence.
 *
 * ## Reached through the player's own path
 *
 * `enterEngineerStage` presses the *Today's tower* tile, which is what a player presses (§ D335).
 * The Everyday cover is never taken off by hand: a helper that dismantled the front door would let
 * this case pass against a surface nobody can open, which is the defect class this repository
 * counts.
 *
 * ## Why the register is switched rather than deep-linked
 *
 * `#view-mode` is the control a player has, and issue #72 records that it is the **only** surface
 * that changes the setting. Driving it is what proves both registers are reachable *and* that the
 * card redraws when the register moves — a card keyed on something a mode toggle does not change is
 * exactly the defect `buildingPlateOf`'s Casual arm shipped with since issue #71.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CASUAL_WORDS, ENGINEER_WORDS } from '../render/overlay.js';
import { CHROMIUM, HAS_BROWSER, enterEngineerStage, openPage } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { port: 5205, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  origin = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
  if (origin === '') throw new Error('the dev server did not report a URL');
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * The eight buildings `data/buildings/` ships, by id.
 *
 * Written here rather than derived from disk, and the reason is what this list is *for*: the check
 * below is about the widest authored strings on each building — `office-low-rise` is a bank id
 * fifteen characters long, and Vertical City runs thirty-five cars. A list that silently grew would
 * still pass; what matters is that every shipped building is driven, and `dev/data.test.ts` already
 * holds the shipped set against the directory in both directions.
 */
const BUILDING_IDS = [
  'chancery-house',
  'crown-hotel',
  'garden-apartments',
  'midtown-office',
  'mixed-use-high-rise',
  'secure-tower',
  'st-jude-hospital',
  'vertical-city',
] as const;

/** One building on the Engineer stage, at a seed, reached the way a player reaches it. */
async function stageFor(building: string, width = 1280, height = 800): Promise<Page> {
  const page = await openPage(browser, { viewport: { width, height } });
  await page.goto(`${origin}?building=${building}&seed=42`, { waitUntil: 'load' });
  await enterEngineerStage(page);
  // The card is hidden until there is a run, which is `docs/21` L-5's *hidden: nothing to say*.
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('#live-metrics')?.hidden === false,
    undefined,
    { timeout: 60_000 },
  );
  return page;
}

/** Put the reader in a register, through the one control that changes it. */
async function setRegister(page: Page, mode: 'basic' | 'advanced'): Promise<void> {
  await page.selectOption('#view-mode', mode);
  await page.waitForFunction(
    (expected: string) => document.querySelector<HTMLElement>('#live-metrics-title')?.textContent === expected,
    mode === 'basic' ? CASUAL_WORDS.title : ENGINEER_WORDS.title,
    { timeout: 15_000 },
  );
}

/** Every element of the card that is wider than the box it was given. */
async function overflowing(page: Page): Promise<{
  readonly found: readonly string[];
  readonly swept: number;
  readonly bodyOverflows: boolean;
}> {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('#live-metrics');
    if (card === null) return { found: ['#live-metrics is not in the page'], swept: 0, bodyOverflows: false };
    const found: string[] = [];
    let swept = 0;
    const check = (node: HTMLElement, name: string): void => {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      swept += 1;
      /*
       * One pixel of slack, and it is sub-pixel rounding rather than tolerance: `scrollWidth` and
       * `clientWidth` are integers rounded from fractional layout, so an element whose content is
       * exactly its width can report a one-pixel difference. The defect this catches was three
       * characters wide on every line.
       */
      if (node.scrollWidth > node.clientWidth + 1) {
        found.push(`${name} scrollWidth ${String(node.scrollWidth)} > clientWidth ${String(node.clientWidth)}`);
      }
    };
    check(card, '#live-metrics');
    for (const node of card.querySelectorAll<HTMLElement>('*')) {
      check(node, `${node.tagName.toLowerCase()}.${String(node.className)}`);
    }
    return {
      found: found.slice(0, 12),
      swept,
      // The page itself may not scroll sideways either — a card that fits by pushing the shell wide
      // has moved the overflow rather than closed it.
      bodyOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
}

/**
 * The width question, asked of a real face at a real width.
 *
 * **What this sweep reaches, measured rather than assumed — issue #297.** `stageFor` leaves the
 * playhead in the opening seconds of the run, where no bank has answered anything inside the
 * rolling window, so the card is drawing `ENGINEER_WORDS.noneInWindow` / `CASUAL_WORDS.noneInWindow`
 * in place of the bank list. Probed on the narrowest and widest shipped buildings, in both
 * registers, at 1 280 px and at the 420 px stacked layout: the sentence is present in the card's
 * text in all eight combinations and nothing overflows. That is worth writing down because issue
 * #297 lengthened both strings — `nothing served yet` → `nothing served in this window`, and
 * Casual's by fourteen characters — and a wording change that no width check ever saw is exactly
 * the defect `docs/21` § 3.4 moved this panel into the DOM to catch.
 */
describe.skipIf(!HAS_BROWSER)('the live metrics card fits its own words', () => {
  for (const building of BUILDING_IDS) {
    it(`draws nothing past its own edge on ${building}, in both registers`, async () => {
      const page = await stageFor(building);
      try {
        for (const mode of ['advanced', 'basic'] as const) {
          await setRegister(page, mode);
          const { found, swept, bodyOverflows } = await overflowing(page);
          expect(found, `${building} · ${mode}`).toEqual([]);
          // The positive control: the sweep really reached the card and would have named something.
          expect(swept, `${building} · ${mode}: the card drew nothing`).toBeGreaterThan(10);
          expect(bodyOverflows, `${building} · ${mode}: the shell scrolls sideways`).toBe(false);
        }
      } finally {
        await page.close();
      }
    }, 180_000);
  }

  it('stacks rather than shrinking below the width floor — RS-03, transferred', async () => {
    /*
     * The old panel's answer to a narrow viewport was to **disappear** (`RS-03`, and `dev/main.ts`
     * dropped it below 900 px of canvas). A card can do better and the contract says which better:
     * *below the width floor the card stacks, it never shrinks its text.* Both halves are measured
     * — the three columns really are one column at 420 px, and the type is the same size as it was
     * at 1280 — and the overflow check runs again there, because a stacked card that overflows has
     * only rearranged the defect.
     */
    const page = await stageFor('vertical-city', 1280, 800);
    try {
      const wideFont = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('#live-metrics-figures .live-metrics-row');
        return row === null ? '' : getComputedStyle(row).fontSize;
      });
      const wideColumns = await page.evaluate(() => {
        const cols = document.querySelector<HTMLElement>('.live-metrics-cols');
        return cols === null ? 0 : new Set(
          [...cols.children].map((child) => Math.round(child.getBoundingClientRect().top)),
        ).size;
      });
      await page.setViewportSize({ width: 420, height: 900 });
      await page.waitForTimeout(400);
      const narrowFont = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('#live-metrics-figures .live-metrics-row');
        return row === null ? '' : getComputedStyle(row).fontSize;
      });
      const narrowRows = await page.evaluate(() => {
        const cols = document.querySelector<HTMLElement>('.live-metrics-cols');
        return cols === null ? 0 : new Set(
          [...cols.children].map((child) => Math.round(child.getBoundingClientRect().top)),
        ).size;
      });
      // One row of columns when there is room; three stacked rows when there is not.
      expect(wideColumns).toBe(1);
      expect(narrowRows).toBe(3);
      // And not one point smaller.
      expect(narrowFont).toBe(wideFont);
      const { found } = await overflowing(page);
      expect(found, 'the stacked card overflows').toEqual([]);
    } finally {
      await page.close();
    }
  }, 180_000);

  it('keeps every ENGINEER_WORDS label on the card', async () => {
    /*
     * `docs/21` § 3.4's second acceptance clause, and § 1.2's ledger row: *`LIVE METRICS` in two
     * registers*. Derived from the shipped table rather than listed here, so a word that stops
     * reaching the screen is red without anybody remembering to add it.
     *
     * `bankSuppressed` and `noneInWindow` are the two that are drawn only in the states that call for
     * them, and `honesty/surfaces.ts`'s adapter is what drives those on a refused run — a browser
     * case that manufactured a saturated building would be re-testing the view through a browser.
     */
    const page = await stageFor('midtown-office');
    try {
      await setRegister(page, 'advanced');
      const text = await page.evaluate(
        () => document.querySelector<HTMLElement>('#live-metrics')?.textContent ?? '',
      );
      for (const [key, word] of Object.entries(ENGINEER_WORDS)) {
        if (key === 'bankSuppressed' || key === 'noneInWindow') continue;
        expect(text, `the card lost ${key}`).toContain(word);
      }
    } finally {
      await page.close();
    }
  }, 180_000);

  it('survives the playhead — the card a reader can still press and scroll', async () => {
    /*
     * GitHub issue #106's defect, on the surface most exposed to it: `renderLive` runs at 60 Hz and
     * every figure on this card moves. A `fill` per frame detaches the node the pointer went down
     * on and drops the scroll position of whichever list a reader is in. `keyedFill` plus written
     * cells is the remedy, and this is the measurement of it — the car list is scrolled, the run
     * plays on, and the scroll survives while the numbers keep moving.
     */
    const page = await stageFor('vertical-city');
    try {
      await setRegister(page, 'advanced');
      /*
       * The boot run does not play itself — `adopt` hands `autoplay: false` until the overlay has
       * been dismissed, which is § D335's own rule and not something to work around. So the
       * transport is pressed, which is what a player does, and then the playhead really is moving
       * while the scroll is under test.
       */
      await page.locator('#play-pause').first().click();
      await page.evaluate(() => {
        const cars = document.querySelector<HTMLElement>('#live-metrics-cars');
        if (cars !== null) cars.scrollTop = 40;
      });
      /*
       * The window caption is the positive control rather than the car list, and that is a finding
       * rather than a convenience: at the start of a Vertical City day every car reads `0.00`, so a
       * check that watched the car text would have passed on a **frozen** card for the first few
       * seconds of every run. The caption moves with the playhead by construction.
       */
      const before = await page.evaluate(() => ({
        window: document.querySelector<HTMLElement>('#live-metrics-window')?.textContent ?? '',
        cars: document.querySelector<HTMLElement>('#live-metrics-cars')?.firstElementChild,
      }));
      await page.waitForTimeout(1_200);
      const after = await page.evaluate((was: string) => ({
        scrollTop: document.querySelector<HTMLElement>('#live-metrics-cars')?.scrollTop ?? -1,
        moved: (document.querySelector<HTMLElement>('#live-metrics-window')?.textContent ?? '') !== was,
      }), before.window);
      // The positive control: the card really was redrawing, so the survival below means something.
      expect(after.moved, 'the card did not redraw, so this proves nothing').toBe(true);
      // And the scroll is where the reader put it, sixty-odd frames later.
      expect(after.scrollTop).toBe(40);
    } finally {
      await page.close();
    }
  }, 180_000);
});
