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
 * The data host, as the **page** sees it once {@link stashHost} has put it somewhere nameable.
 *
 * A type-only shape, so nothing of this declaration survives into the browser — the casts below
 * are erased before Playwright ever serialises a callback.
 */
type PageHostWindow = Window &
  typeof globalThis & {
    __everydayHost?: {
      current(): {
        runState(): {
          hasRun: boolean;
          dayClosed: boolean;
          playheadS: number;
          open: boolean;
        };
        startRun(): void;
        closeDay(): void;
        lastReport(): unknown;
      } | undefined;
    };
  };

/**
 * Reach the shipped host module from inside the page, once, and give it a name the later
 * callbacks can read synchronously.
 *
 * **The import is a string, and that is a transform fact rather than a style choice.** vitest
 * compiles this file before Playwright serialises anything, and its SSR transform rewrites a
 * dynamic `import(…)` into `__vite_ssr_dynamic_import__(…)` — a binding that exists in this
 * module's scope and not in the page. Written as a callback, the evaluate threw
 * `ReferenceError: __vite_ssr_dynamic_import__ is not defined` in the browser, which is a
 * failure about the harness wearing the costume of a failure about the product. A string is not
 * transformed, so the dev server hands back **the very module instance `everyday/boot.ts`
 * imported** — the same slot `dev/main.ts` published into, not a second copy.
 *
 * The stash is the **test's** handle and the product neither writes nor reads it: driving the
 * host must not require the product to publish itself on a global, which would be a shipped
 * surface that exists for a test.
 */
async function stashHost(page: Page): Promise<void> {
  await page.evaluate(
    "import('/src/everyday/host.ts').then((module) => { window.__everydayHost = module.EVERYDAY_HOST; return true; })",
  );
  // `dev/main.ts` publishes at the end of its own boot, which is after the menu this page has
  // already waited out — so this is ordering insurance rather than a race, and it fails here,
  // named, rather than as an undefined read three lines down.
  await page.waitForFunction(
    () => (window as PageHostWindow).__everydayHost?.current() !== undefined,
    undefined,
    { timeout: 30_000 },
  );
}

/** The host's own answer about the run on the stage, read live. */
async function runStateOf(page: Page): Promise<{
  hasRun: boolean;
  dayClosed: boolean;
  playheadS: number;
  open: boolean;
}> {
  const state = await page.evaluate(() =>
    (window as PageHostWindow).__everydayHost?.current()?.runState(),
  );
  if (state === undefined) throw new Error('the data host answered no run state');
  return state;
}

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
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
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
      // Two, since the fixit screen landed: the campaign and the rush still refuse.
      expect(refusals).toHaveLength(2);
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
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
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
  /**
   * **The geometry this case used to assert is gone, and its absence is the assertion now.**
   *
   * It read a 212 px inset on `div.shell` and `engineerReachable: true` — the § D335 hand-off, where
   * the shell shrank to the rail strip and put the Engineer surface beside it. § 7's stage is a
   * screen (`everyday/stageScreen.ts`), so the shell keeps one geometry, the Engineer root stays
   * covered and inert for its whole life, and the stage a player meets is drawn in the screen region
   * like every other. What is kept is the half that was always the point: the rail says where the
   * player is, and the day the stage asked for actually lands.
   */
  it('mounts § 7’s stage in the screen region, with the Engineer surface still covered', async () => {
    const page = await coldLoad();
    try {
      await page.locator('.everyday-mode[data-screen="stage"]').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });

      const shown = await page.evaluate(() => ({
        mainShown: document.querySelector<HTMLElement>('.everyday-main')?.style.display,
        inset: document.querySelector<HTMLElement>('.shell')?.style.marginLeft,
        railWidth: document.querySelector('.everyday-rail')?.getBoundingClientRect().width,
        // The rail says where the player now is, rather than still saying YOU ARE HERE.
        subline: document.querySelector('.everyday-rail-menu')?.textContent ?? '',
        engineerCovered: document.querySelector<HTMLElement>('.shell')?.inert === true,
      }));
      expect(shown.mainShown).toBe('grid');
      expect(shown.inset).toBe('');
      expect(shown.railWidth).toBeGreaterThan(0);
      expect(shown.subline).toContain('MID-DAY');
      expect(shown.engineerCovered).toBe(true);

      // And the stage is a stage: the day it asked for lands, and its transport says so.
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
        undefined,
        { timeout: 60_000 },
      );
      expect(await page.textContent('.everyday-stage-clock')).toMatch(/^\d{2}:\d{2}$/u);
    } finally {
      await page.close();
    }
  });

  it('warns before a mid-run leave, stays, and leaves freely once the day is closed — § 3.4 through the host', async () => {
    /*
     * The data host's runtime half, driven end to end: `dev/main.ts` publishes the host,
     * `everyday/boot.ts` hands its slot to the shell, and the shell's § 3.4 latch follows
     * `runState().open`. The host itself is reachable from the page because the dev server serves
     * the same module graph the app runs — `import('/src/everyday/host.ts')` answers the exact
     * module instance `boot.ts` imported, so `startRun`/`closeDay` here are the same presses a
     * screen lane's code will make.
     *
     * The sequencing is the claim: before the player starts anything, leaving the stage warns
     * nothing (boot's demo run is not theirs to lose — § D232); a run they started arms the
     * confirm strip with § 3.4's exact words; *Stay* puts it down and moves nothing; and once the
     * day is closed, leaving is free again, because a report is already after the fact.
     */
    const page = await coldLoad();
    try {
      await stashHost(page);

      /*
       * **Before the player has asked for anything, nothing is open** — § D232's ground, driven,
       * and now driven *on the menu*, which is where it can still be observed. A full shift has
       * already run under the menu (boot's own) and it is this shell's own run; what it is not is a
       * run the player started. This is the assertion that would fail if the latch were
       * `hasRun && !dayClosed`.
       *
       * It moved here because entering the stage **is** the player asking now: § 7's stage presses
       * `startRun` on mount when no run of the player's own is open, which is what *Today's tower*
       * means. Asserting it after the mount would be asserting that a press did not happen.
       */
      expect((await runStateOf(page)).open, 'boot’s own run armed the confirm strip').toBe(false);

      await page.locator('.everyday-mode[data-screen="stage"]').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });

      /*
       * Wait for the stage's own day to land, through the screen's own statement about it: the
       * centred `Start` is up exactly when a recording has been adopted and the transport is paused
       * at the beginning of it. Waiting for the round trip rather than only for the latch is what
       * keeps the closing half below deterministic — a `closeDay` pressed while the worker was
       * still simulating would file the recording on screen and then have `applyShift` clear the
       * sheet out from under the assertion.
       */
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
        undefined,
        { timeout: 120_000 },
      );

      // The latch follows the host: a run the player asked for is open on the stage.
      const started = await runStateOf(page);
      expect(started.hasRun).toBe(true);
      expect(started.dayClosed).toBe(false);
      expect(started.open, 'the host did not report the player’s own run as open').toBe(true);

      /*
       * Leaving mid-run meets § 3.4's strip — **in the bar**, which is § 3.4's own rule and which
       * this stage can keep. The strip had a second home while the stage handed off, because the
       * handed-off stage drew no bar; there is one under this stage, so there is one strip.
       */
      await page.locator('.everyday-rail-menu').click();
      const strip = await page.evaluate(() => ({
        question: document.querySelector('.everyday-bar-question')?.textContent ?? '',
        consequence: document.querySelector('.everyday-bar-consequence')?.textContent ?? '',
        stillOnStage: document.querySelector('.everyday-stage-canvas') !== null,
      }));
      expect(strip.question).toBe('Leave the day unfinished?');
      expect(strip.consequence).toBe(
        "Today's run will not be scored, and the board keeps whatever you posted before.",
      );
      expect(strip.stillOnStage).toBe(true);

      // Stay: the strip goes down, the bar comes back, and the stage is exactly as it was.
      await page.locator('.everyday-bar-confirm-stay').click();
      const stayed = await page.evaluate(() => ({
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
        question: document.querySelector('.everyday-bar-question'),
        stillOnStage: document.querySelector('.everyday-stage-canvas') !== null,
      }));
      expect(stayed).toEqual({ primary: 'Close the day', question: null, stillOnStage: true });

      // Close the day — § 3.3's stage primary, as the host carries it — and the latch disarms.
      await page.evaluate(() => {
        (window as PageHostWindow).__everydayHost?.current()?.closeDay();
      });
      const closed = await runStateOf(page);
      expect(closed.dayClosed, 'closeDay filed nothing').toBe(true);
      expect(closed.open, 'the day is filed and the strip is still armed').toBe(false);
      const filed = await page.evaluate(
        () => (window as PageHostWindow).__everydayHost?.current()?.lastReport() !== undefined,
      );
      expect(filed, 'closeDay filed no sheet').toBe(true);

      // A report is already after the fact: the same leave now goes straight to the menu.
      await page.locator('.everyday-rail-menu').click();
      const back = await page.evaluate(() => ({
        onMenu: document.querySelector('.everyday-mode[data-screen="stage"]') !== null,
        stageGone: document.querySelector('.everyday-stage-canvas') === null,
      }));
      expect(back).toEqual({ onMenu: true, stageGone: true });
    } finally {
      await page.close();
    }
  }, 180_000);

  it('comes back to the menu, unmounts the stage, and keeps the Engineer surface covered', async () => {
    const page = await coldLoad();
    try {
      await page.locator('.everyday-mode[data-screen="stage"]').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });

      /*
       * **The strip is in the way now, and that is the product being right rather than an
       * inconvenience.** The first draft of this case clicked the rail's Main menu row and asserted
       * the stage was gone; it was not, because § 7's stage presses `startRun` on mount, so by the
       * time the canvas exists the player has a day of their own open and § 3.4 arms. Under the
       * hand-off the same click left immediately — the run on the handed-off stage was boot's demo,
       * which § D232 exempts.
       *
       * So the way back to the menu mid-run is two presses, and this case makes both. It races the
       * host notification that arms the latch, which is why the strip is answered *if* it is up
       * rather than waited for: either order is a state a player can produce.
       */
      await page.locator('.everyday-rail-menu').click();
      const leaveIt = page.locator('.everyday-bar-confirm-leave');
      if ((await leaveIt.count()) > 0) await leaveIt.click();
      await page.waitForSelector('.everyday-mode[data-screen="stage"]', { timeout: 15_000 });

      const back = await page.evaluate(() => ({
        mainShown: document.querySelector<HTMLElement>('.everyday-main')?.style.display,
        stageGone: document.querySelector('.everyday-stage-canvas') === null,
        subline: document.querySelector('.everyday-rail-menu')?.textContent ?? '',
        /*
         * `inert` is now true for the Engineer root's whole life rather than only off-stage, so
         * this reads as *it never came off* rather than *it went back on*. It is still the case
         * that would catch the second `inert` defect: a shell that let `menuPanel.ts#coverShell`
         * clear the attribute on the way past would report `false` here.
         */
        engineer: document.querySelector<HTMLElement>('.shell')?.inert,
      }));
      expect(back.mainShown).toBe('grid');
      expect(back.stageGone).toBe(true);
      expect(back.subline).toContain('YOU ARE HERE');
      expect(back.engineer).toBe(true);
    } finally {
      await page.close();
    }
  });
});
