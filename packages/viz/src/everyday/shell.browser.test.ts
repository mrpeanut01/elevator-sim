/**
 * **The application opens on Everyday Mode, and Today's tower is playable** — GAMEPLAY § 3.5, § 4.
 *
 * ## Why this is a browser test and why every case here needs one
 *
 * The claim is about a *page*: which front door loads, what is reachable from it, and what happens
 * to the surface underneath. None of that is a function's return value. Two of the four defects this
 * suite pins were invisible to every other tier in the repository, because both were about an
 * attribute that changes nothing you can see:
 *
 * - `dev/main.ts#shellBehindMenu` handed `menuPanel.ts#coverShell` **every** child of `body`, so
 *   opening the Engineer menu behind this shell wrote `inert` onto the Everyday root and the front
 *   door stopped taking clicks. It painted identically.
 * - The reverse, on the same attribute: closing that menu *cleared* `inert` on `div.shell`, handing
 *   the Engineer surface its whole tab order back underneath an opaque overlay.
 *
 * A node test cannot see either, and a screenshot cannot see either. So they are driven.
 *
 * ## What is deliberately not asserted
 *
 * No metric, per § D220 § 4. The playability case reads *the run advanced* — arrivals and a moving
 * clock — and never what the run measured.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import { CHROMIUM, HAS_BROWSER } from '../dev/browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5196, strictPort: false },
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
 * A cold load, waited out to the point where the Engineer menu has been dismissed.
 *
 * The wait is the interesting part. `dev/main.ts` boots asynchronously, so the Engineer menu arrives
 * *after* this shell mounts — `everyday/boot.ts#closeEngineerMenuWhenReady` is what presses its
 * Resume row when it does. Waiting on that overlay being `hidden` is therefore the honest latch for
 * "boot has settled", and it is also the first assertion: if it never happens, every case times out
 * here rather than failing somewhere misleading.
 */
async function coldLoad(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

describe.skipIf(!HAS_BROWSER)('the app opens on Everyday Mode', () => {
  it('draws the menu, the rail and the four mode tiles — not the Engineer menu', async () => {
    const page = await coldLoad();
    try {
      const front = await page.evaluate(() => ({
        shells: document.querySelectorAll('.everyday').length,
        tiles: document.querySelectorAll('.everyday-mode').length,
        rails: document.querySelectorAll('.everyday-rail').length,
        lede: document.querySelector('.everyday-screen')?.textContent ?? '',
        engineerMenuHidden: document.querySelector<HTMLElement>('.menu-overlay')?.hidden,
      }));
      expect(front.shells).toBe(1);
      expect(front.tiles).toBe(4);
      expect(front.rails).toBe(1);
      // § 3.5: the front door is not overridable, and a deep link is what would override it. The
      // load above carries two query parameters and still lands here.
      expect(front.lede).toContain('Pick a way to play');
      expect(front.engineerMenuHidden).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('keeps the covered page out of the tab order, and keeps itself in it', async () => {
    const page = await coldLoad();
    try {
      /*
       * Both directions of the `inert` fight, in one read. `div.shell` inert is the Engineer surface
       * being genuinely unreachable rather than merely painted over; `.everyday` *not* inert is the
       * half `shellBehindMenu` broke, and the half where a regression is a front door that ignores
       * every click while looking completely normal.
       */
      const state = await page.evaluate(() => ({
        engineer: document.querySelector<HTMLElement>('.shell')?.inert,
        everyday: document.querySelector<HTMLElement>('.everyday')?.inert,
      }));
      expect(state).toEqual({ engineer: true, everyday: false });
    } finally {
      await page.close();
    }
  });

  it('takes a real click on a mode tile — the cover does not swallow it', async () => {
    const page = await coldLoad();
    try {
      /*
       * The positive control for the case above, and the one that would have caught the defect as a
       * player meets it. `inert` on the Everyday root reads as an attribute in one test and as
       * *nothing happens when you click* in the product; this is the second reading.
       */
      await page.locator('.everyday-mode[data-screen="stage"]').click();
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday-main')?.style.display === 'none',
        undefined,
        { timeout: 15_000 },
      );
    } finally {
      await page.close();
    }
  });

  it('says why each mode it cannot open does not open', async () => {
    const page = await coldLoad();
    try {
      const refusals = await page.evaluate(() =>
        [...document.querySelectorAll('.everyday-mode')]
          .filter((tile) => tile instanceof HTMLButtonElement && tile.disabled)
          .map((tile) => tile.textContent ?? ''),
      );
      expect(refusals).toHaveLength(3);
      // Not a greyed tile with nothing on it — the handoff's definition of done requires the words.
      for (const refusal of refusals) expect(refusal).toMatch(/not built yet/);
    } finally {
      await page.close();
    }
  });

  it('offers the Engineer swap and refuses it, because that play style is not built', async () => {
    const page = await coldLoad();
    try {
      const swap = await page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>('.everyday-engineer-swap');
        return button === null
          ? null
          : { disabled: button.disabled, title: button.title, label: button.textContent ?? '' };
      });
      expect(swap?.disabled).toBe(true);
      expect(swap?.title).toMatch(/not built yet/);
      expect(swap?.label).toContain('Engineer');
    } finally {
      await page.close();
    }
  });

  it('draws § 3.3’s menu row in the bar: ⌂ Modes inert, one named primary, the note', async () => {
    const page = await coldLoad();
    try {
      const bar = await page.evaluate(() => ({
        leave: (() => {
          const button = document.querySelector<HTMLButtonElement>('.everyday-bar-leave');
          return button === null
            ? null
            : { label: button.textContent ?? '', disabled: button.disabled };
        })(),
        primary: (() => {
          const button = document.querySelector<HTMLButtonElement>('.everyday-bar-primary');
          return button === null
            ? null
            : { label: button.textContent ?? '', disabled: button.disabled };
        })(),
        note: document.querySelector('.everyday-bar-note')?.textContent ?? '',
      }));
      // The left button is present and inert on the menu — there is no mode to abandon yet — and
      // the primary is named for its effect, never "Next".
      expect(bar.leave).toEqual({ label: '⌂ Modes', disabled: true });
      expect(bar.primary).toEqual({ label: "Play today's tower", disabled: false });
      expect(bar.note).toBe('Pick a mode above, then play it.');
    } finally {
      await page.close();
    }
  });

  it('enters the stage through the bar’s primary — the player’s second way in', async () => {
    const page = await coldLoad();
    try {
      await page.locator('.everyday-bar-primary').click();
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday-main')?.style.display === 'none',
        undefined,
        { timeout: 15_000 },
      );
    } finally {
      await page.close();
    }
  });

  it('draws § 3.2’s footer: the PLAYING AS card without an invented profile, and Settings opening', async () => {
    const page = await coldLoad();
    try {
      const footer = await page.evaluate(() => ({
        identity: document.querySelector('.everyday-identity')?.textContent ?? '',
        settings: (() => {
          const button = document.querySelector<HTMLButtonElement>('.everyday-rail-settings');
          return button === null
            ? null
            : { label: button.textContent ?? '', disabled: button.disabled };
        })(),
      }));
      // § 20.11: no fixture presented as a player. The card names the absence instead.
      expect(footer.identity).toContain('PLAYING AS');
      expect(footer.identity).toContain('you');
      expect(footer.identity).toContain('no days saved');
      /*
       * The bordered Settings row is a destination, and it **opens** — the § 15.1 screen landed
       * and left `UNBUILT_REASONS` on the same commit, which is the registry's whole contract.
       * This case previously pinned the other side of it (disabled, captioned *not built*); the
       * assertion moved rather than being deleted, because the pair *refuses ⇔ unbuilt* is what
       * is under test either way, and § D227 is the direction that matters now: a row still
       * captioning a refusal over a working screen would fail here.
       */
      expect(footer.settings?.disabled).toBe(false);
      expect(footer.settings?.label).toContain('Settings');
      expect(footer.settings?.label).not.toContain('not built');
    } finally {
      await page.close();
    }
  });

  it('captions every refusing rail row with the registry’s own sentence — drawn, not a tooltip', async () => {
    const page = await coldLoad();
    try {
      /*
       * No player control reaches an unbuilt screen today — every row and tile that would is
       * disabled — so what a player actually meets is the caption on the disabled row, and the
       * claim under test is the § D227 guarantee: the rail refuses in the registry's sentence,
       * as words on the row, never as a `title` attribute nobody hovers.
       */
      const row = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.everyday-rail button')];
        const workshop = rows.find((r) => (r.textContent ?? '').includes('Dispatcher workshop'));
        return workshop instanceof HTMLButtonElement
          ? { disabled: workshop.disabled, text: workshop.textContent ?? '' }
          : null;
      });
      expect(row?.disabled).toBe(true);
      expect(row?.text).toContain('the workshop screen is not built');
    } finally {
      await page.close();
    }
  });
});

describe.skipIf(!HAS_BROWSER)("Today's tower is playable through the new shell", () => {
  it('uncovers the stage beside the rail, and the run advances', async () => {
    const page = await coldLoad();
    try {
      await page.locator('.everyday-mode[data-screen="stage"]').click();

      /*
       * The hand-off's geometry. The shell shrinks to the rail strip and insets the Engineer
       * surface beside it rather than hiding it — a `display:none` ancestor would give the stage's
       * canvases a zero box, which is why this reads a *width* and not just visibility.
       */
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday-main')?.style.display === 'none',
        undefined,
        { timeout: 15_000 },
      );
      const geometry = await page.evaluate(() => ({
        inset: document.querySelector<HTMLElement>('.shell')?.style.marginLeft,
        railWidth: document.querySelector('.everyday-rail')?.getBoundingClientRect().width,
        // The rail says where the player now is, rather than still saying YOU ARE HERE.
        subline: document.querySelector('.everyday-rail-menu')?.textContent ?? '',
        engineerReachable: document.querySelector<HTMLElement>('.shell')?.inert === false,
      }));
      expect(geometry.inset).toBe('212px');
      expect(geometry.railWidth).toBeGreaterThan(0);
      expect(geometry.subline).toContain('MID-DAY');
      expect(geometry.engineerReachable).toBe(true);

      // And the stage is a stage: press the button the surface's own copy names, and the run moves.
      await page.waitForFunction(
        () => {
          const button = document.querySelector('#play-pause');
          return button instanceof HTMLButtonElement && !button.disabled;
        },
        undefined,
        { timeout: 30_000 },
      );
      await page.locator('#run').first().click();
      await page.waitForFunction(
        () => /\barrived\b/.test(document.querySelector('#status-line')?.textContent ?? ''),
        undefined,
        { timeout: 60_000 },
      );
    } finally {
      await page.close();
    }
  });

  it('comes back to the menu, and covers the stage again on the way', async () => {
    const page = await coldLoad();
    try {
      await page.locator('.everyday-mode[data-screen="stage"]').click();
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday-main')?.style.display === 'none',
        undefined,
        { timeout: 15_000 },
      );

      await page.locator('.everyday-rail-menu').click();

      const back = await page.evaluate(() => ({
        mainShown: document.querySelector<HTMLElement>('.everyday-main')?.style.display,
        subline: document.querySelector('.everyday-rail-menu')?.textContent ?? '',
        /*
         * The cover going back on is the case that would have caught the second `inert` defect from
         * the other side: leaving a mode has to re-inert the surface it uncovered, or the stage
         * stays in the tab order behind the menu for the rest of the session.
         */
        engineer: document.querySelector<HTMLElement>('.shell')?.inert,
      }));
      expect(back.mainShown).toBe('grid');
      expect(back.subline).toContain('YOU ARE HERE');
      expect(back.engineer).toBe(true);
    } finally {
      await page.close();
    }
  });
});
