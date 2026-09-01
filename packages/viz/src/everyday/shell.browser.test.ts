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
import {
  CHROMIUM,
  HAS_BROWSER,
  enterEngineerStage,
  enterEverydayStage,
  openPage,
  pressMenuRow,
  returnToEverydayMode,
} from '../dev/browserTier.test-helper.js';
import { railFooter } from './rail.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5202, strictPort: false },
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

/**
 * The `PLAYING AS` card's career line, as the page draws it — issue #214's whole subject.
 *
 * Read off the rendered card rather than off any model, because the defect was a *paint*: the
 * shell's `weekRailOptions` answered `{}` before `dev/main.ts` published the host, and on the
 * front door nothing redraws a rail, so what a player saw and what the host held were two
 * different things for the whole visit.
 */
async function careerLineOnPage(page: Page): Promise<string> {
  return page.evaluate(
    () => document.querySelector('.everyday-identity-streak')?.textContent ?? '',
  );
}

/**
 * The two lines the card may draw when it has no week, taken from `rail.ts` rather than quoted.
 *
 * Both are module-private constants there, on purpose (`honesty/derive.ts` would have to classify
 * a second text producer under `everyday/rail.ts`), so they are reached the way the shell reaches
 * them — through {@link railFooter}, over the two option shapes that produce them. A literal here
 * would be a copy that keeps passing after somebody rewords the card.
 */
const NO_WEEK_LINES = {
  absent: railFooter({ screen: 'menu', ctx: 'daily' }).identity.streak,
  pending: railFooter({ screen: 'menu', ctx: 'daily' }, { weekPending: true }).identity.streak,
};

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
  const page = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/*
 * The walk from the menu to the stage — § 6's daily loop, as far as the stage — lives in
 * `dev/browserTier.test-helper.ts#enterEverydayStage` and is imported above.
 *
 * It was a local copy here, and it was correct; two other files had their own, and one of those was
 * still pressing the tile straight through to `stage`, which stopped existing as a route when § 6.1's
 * front door was registered. Three copies of one path is the shape `enterEngineerStage`'s own
 * docstring argues against — *one path moved, one file changed* — so there is one now.
 *
 * The wait is for **the screen**, never for the shell getting out of the way. The local copy landed
 * asking for `.everyday-main` to go `display: none` — the § D335 hand-off's geometry, where entering
 * the stage shrank the shell to the rail and uncovered the Engineer surface beside it.
 * `everyday/stageScreen.ts` retired that: the stage mounts in the screen region like every other
 * registered key and `.everyday-main` stays `grid` for the whole loop, which the first case below
 * asserts outright.
 */

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
      await page.locator('.everyday-mode[data-screen="door"]').click();
      // The tile opens § 6.1's front door now that it is registered — it used to skip to the
      // stage, and `modes.ts` routes it through the loop's own first screen instead.
      await page.waitForSelector('.everyday-door', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  });

  it('leaves no mode tile refusing, and every one of the four takes a click', async () => {
    const page = await coldLoad();
    try {
      const tiles = await page.evaluate(() =>
        [...document.querySelectorAll('.everyday-mode')]
          .filter((tile): tile is HTMLButtonElement => tile instanceof HTMLButtonElement)
          .map((tile) => ({
            screen: tile.getAttribute('data-screen') ?? '',
            disabled: tile.disabled,
            text: tile.textContent ?? '',
          })),
      );
      /*
       * **Zero, since § 9.1's rush setup screen landed beside § 8's three.** The count was one on
       * each incoming branch and for a different reason on each — the campaign on one, the rush on
       * the other — which is why it is stated as a fact about *this* tree and re-derived rather than
       * merged: neither branch's number was right here.
       *
       * A count of zero would be a weak case on its own, so the claim is the pair rather than the
       * count: four tiles, none disabled, and none carrying a refusal it can no longer mean. A tile
       * that stayed refused over a mode whose screens exist is § D227's defect and fails the second
       * assertion; a tile that vanished rather than opening fails the first.
       *
       * The rush's own missing engine has not gone anywhere — its § 3.3 primary is drawn inert with
       * the refusal on it, which is that honesty one level in, and
       * `standaloneScreens.browser.test.ts` is where that disabled primary is asserted. This case
       * deliberately does not cover it.
       */
      expect(tiles.map((tile) => tile.screen)).toEqual(['door', 'towers', 'rush', 'fixit']);
      expect(tiles.filter((tile) => tile.disabled)).toEqual([]);
      for (const tile of tiles) expect(tile.text, tile.screen).not.toMatch(/not built/);
    } finally {
      await page.close();
    }
  });

  it('offers the Engineer swap as a live row, with its note drawn rather than on a tooltip', async () => {
    const page = await coldLoad();
    try {
      const swap = await page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>('.everyday-engineer-swap');
        return button === null
          ? null
          : { disabled: button.disabled, title: button.title, label: button.textContent ?? '' };
      });
      /*
       * This case used to assert the opposite — disabled, with *not built yet* on `title`. The
       * assertion moved rather than being deleted, because what is under test either way is the pair
       * *refuses ⇔ unbuilt*, and § D227 is the direction that matters now.
       */
      expect(swap?.disabled).toBe(false);
      expect(swap?.label).toContain('Switch to Engineer');
      expect(swap?.label).not.toContain('not built');
      // The note is words on the row, on the mode tiles' argument: a `title` is not a sentence.
      expect(swap?.label).toContain('nothing stops');
      expect(swap?.title).toBe('');
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

  it('enters the picked mode through the bar’s primary — the player’s second way in', async () => {
    const page = await coldLoad();
    try {
      /*
       * § 3.3's menu row: the primary follows the selected card, and the selected card is
       * *Today's tower*. Where that lands moved this wave — the tile used to skip to the stage
       * because § 6.1's front door was unbuilt, and now it opens the door, which is what the guide
       * asks for. The claim the case is making is unchanged: the bar's primary enters the mode.
       */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-door', { timeout: 15_000 });
      expect(await page.textContent('.everyday-bar-primary')).toBe('Set up today');
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
       * **Issue #214, gap 1, and this line is what holds the redraw honest.** This page is a cold
       * load: the shell mounts and paints its rail while `dev/main.ts` is still fetching `data/`,
       * so the card is drawn from no week at all and says {@link NO_WEEK_LINES.pending}. Nothing
       * on a `'menu'` route redraws a rail — `connectDataHost`'s screen arm only fires for a
       * mounted screen — so before `shell.ts` learned to redraw on the career line moving, the
       * pending sentence is what stood here for the whole visit. Deleting that redraw turns this
       * assertion red, which is the evidence that the fix is on the shipped path and not only in
       * the model.
       */
      expect(footer.identity).not.toContain(NO_WEEK_LINES.pending);
      expect(await careerLineOnPage(page)).toBe(NO_WEEK_LINES.absent);
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

  it('leaves no rail row captioned with a refusal, because every screen behind the rail is built', async () => {
    const page = await coldLoad();
    try {
      /*
       * **This case has run out of refusing rows, and that is the result rather than a gap in it.**
       *
       * It used to pin both directions of § D227's pair on the page: `Design a building` disabled
       * and captioned *the designer screen is not built*, beside the workshop and the bench opening
       * because their screens had landed. § 13's drawing board is registered on this merge, so the
       * refusing half has no row left to be asserted on — and repointing it at another label is not
       * available either, since `UNBUILT_REASONS` is now empty and no rail row refuses at all.
       *
       * So the browser tier asserts the half a page can still show — every row opens, and none
       * carries a caption it can no longer mean — and the half that needs an unbuilt screen moves to
       * where it can be exercised without one: `rail.test.ts` derives both directions from the
       * registry and fails on the first row whose refusal and registration disagree. That is a
       * weaker page claim honestly stated, not a claim quietly dropped.
       */
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('nav.everyday-rail button')]
          .filter((row): row is HTMLButtonElement => row instanceof HTMLButtonElement)
          .map((row) => ({ disabled: row.disabled, text: row.textContent ?? '' })),
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.disabled)).toEqual([]);
      for (const row of rows) expect(row.text, row.text).not.toContain('not built');

      // And the rows the previous version of this case named, still by name: what moved is which
      // side of the pair they are on, and `Design a building` is the one that moved on this merge.
      const rowFor = async (label: string) =>
        page.evaluate((wanted) => {
          const found = [...document.querySelectorAll('nav.everyday-rail button')].find((r) =>
            (r.textContent ?? '').includes(wanted),
          );
          return found instanceof HTMLButtonElement
            ? { disabled: found.disabled, text: found.textContent ?? '' }
            : null;
        }, label);
      for (const label of ['Design a building', 'Dispatcher workshop', 'Test bench']) {
        const row = await rowFor(label);
        expect(row?.disabled, label).toBe(false);
        expect(row?.text, label).not.toContain('not built');
      }
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
      await enterEverydayStage(page);

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
       * **Before the player has asked for anything, nothing is open** — § D232's ground, driven.
       * A full shift has already run under the menu (boot's own) and it is this shell's own run;
       * what it is not is a run the player started, so leaving it must not warn. This is the
       * assertion that would fail if the latch were `hasRun && !dayClosed`.
       *
       * Read **at the menu**, before any navigation, and two lanes narrowed it to there
       * independently: § 6.2's *Start the day* latches a run (`host.startRun`), because a brief
       * whose primary only navigated would put a player on a stage they could never close, and
       * § 7's stage presses `startRun` on mount when no run of the player's own is open. So
       * *"the player has asked for nothing"* is no longer a state you can be in anywhere past the
       * menu, and asserting it further in would be asserting that a press did not happen.
       */
      expect((await runStateOf(page)).open, 'boot’s own run armed the confirm strip').toBe(false);

      /*
       * The run is started by the walk itself — § 6.2's *Start the day* is `host.startRun()`, the
       * same latching press as **Run this shift**. This case used to press it here, through the
       * host, because the brief did not exist; now the player's own route makes the run theirs and
       * pressing it a second time would be testing a control nobody uses.
       */
      await enterEverydayStage(page);

      /*
       * Wait for that run to land, through the screen's own statement about it: the stage's centred
       * `Start` is up exactly when a recording has been adopted and the transport is paused at the
       * beginning of it. It is the § 7 stage's own control rather than the Engineer coach's `#run`
       * — the stage is a screen now, so the surface under test is the one that answers. Waiting for
       * the round trip rather than only for the latch is what
       * keeps the closing half below deterministic — a `closeDay` pressed while the worker was
       * still simulating would file the recording on screen and then have `applyShift` clear the
       * sheet out from under the assertion.
       */
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
        undefined,
        { timeout: 120_000 },
      );
      await page.waitForFunction(
        () => (window as PageHostWindow).__everydayHost?.current()?.runState().open === true,
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

      /*
       * **Move the week, require the rail to change** — the standing requirement, pointed at the
       * one control that writes a career. Before this press the card is the honest absence (no day
       * had been closed); after it, the week the host holds has a day in it, and the `PLAYING AS`
       * card must say so **without a reload and without a navigation**, because the player is
       * standing on the stage and the rail beside them is the only place a career is drawn.
       *
       * Asserted on the shape rather than on a figure: whether the day came back clean decides the
       * streak, and § D220 § 4 keeps metrics out of this tier either way. What is asserted is that
       * the line moved off both no-week states and now carries the week's two figures — which is
       * what a card reading the store that keeps days looks like, and what a card reading the
       * profile store never could.
       */
      const afterClose = await careerLineOnPage(page);
      expect(afterClose, 'the card still says nothing is saved over a filed day').not.toBe(
        NO_WEEK_LINES.absent,
      );
      expect(afterClose).not.toBe(NO_WEEK_LINES.pending);
      expect(afterClose).toMatch(/^\d+ days? running · best /);

      // A report is already after the fact: the same leave now goes straight to the menu.
      await page.locator('.everyday-rail-menu').click();
      const back = await page.evaluate(() => ({
        // *Today's tower* is the tile, and it opens the front door now rather than the stage —
        // `modes.ts`'s own routing change. The claim is unchanged: the menu is back.
        onMenu: document.querySelector('.everyday-mode[data-screen="door"]') !== null,
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
      await enterEverydayStage(page);

      /*
       * **The strip is in the way now, and that is the product being right rather than an
       * inconvenience.** Two presses, not one: walking the player's own route to the stage starts
       * the day — § 6.2's primary latches, and § 7's stage presses `startRun` on mount when no run
       * of the player's own is open — so leaving mid-run meets § 3.4's confirm strip. Under the
       * hand-off the same click left immediately, because the run on the handed-off stage was
       * boot's demo, which § D232 exempts.
       *
       * *Leave it* is the arm this case is about; the strip itself is asserted above.
       */
      await page.locator('.everyday-rail-menu').click();
      await page.locator('.everyday-bar-confirm-leave').click();
      await page.waitForSelector('.everyday-mode[data-screen="door"]', { timeout: 15_000 });

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

/**
 * **§ 3.2's door, both ways** — the product owner's standing requirement that the two worlds
 * co-exist, driven as a round trip.
 *
 * ## Why none of this can be asserted anywhere else
 *
 * Every claim below is about *a page changing hands*, and the two ways it goes wrong are both
 * invisible to a screenshot and to a node test:
 *
 * - **Visible but not interactive.** `inert` paints identically. A surface that is uncovered and
 *   still `inert` looks exactly like a working one, and the whole of § D335's second defect was that
 *   shape. So every case here presses a real control on the surface it has just uncovered and
 *   requires the press to *do* something — the menu opening, the confirm strip appearing — rather
 *   than reading an attribute and calling it proof.
 * - **Interactive but measured at zero.** A canvas laid out under a `display:none` ancestor has a
 *   zero box and paints nothing when revealed. `shell.ts#setEverydayCovered` uses `visibility` for
 *   exactly that reason, and the assertion that it worked is the § 7 stage's canvas having the same
 *   non-zero box on both sides of the trip.
 *
 * ## And the state claim, which is the reason the door exists
 *
 * A swap that discarded the open day would be a control that costs a player their run — worse than
 * no door. The trip is therefore taken *from the stage, mid-run*, and what is checked on return is
 * not that the shell survived but that **the day did**: the host still reports the player's run
 * open, the § 3.3 primary still reads `Close the day`, and § 3.4 still arms.
 */
describe.skipIf(!HAS_BROWSER)('switching between the two worlds — GAMEPLAY § 3.2', () => {
  it('opens the Engineer surface from the rail, and hands it a page that takes clicks', async () => {
    const page = await coldLoad();
    try {
      await enterEngineerStage(page);

      const crossed = await page.evaluate(() => ({
        engineerInert: document.querySelector<HTMLElement>('.shell')?.inert,
        everydayInert: document.querySelector<HTMLElement>('.everyday')?.inert,
        everydayVisibility: document.querySelector<HTMLElement>('.everyday')?.style.visibility,
        everydayAria: document.querySelector<HTMLElement>('.everyday')?.getAttribute('aria-hidden'),
        // Covered, never hidden — on this side of the door too. A zero box here is the defect.
        everydayBox: document.querySelector('.everyday')?.getBoundingClientRect().width ?? 0,
        engineerStageBox: document.querySelector('#stage')?.getBoundingClientRect().width ?? 0,
      }));
      expect(crossed.engineerInert).toBe(false);
      expect(crossed.everydayInert).toBe(true);
      expect(crossed.everydayVisibility).toBe('hidden');
      expect(crossed.everydayAria).toBe('true');
      expect(crossed.everydayBox).toBeGreaterThan(0);
      expect(crossed.engineerStageBox).toBeGreaterThan(0);

      /*
       * The half an attribute read cannot give: a control on the uncovered surface, pressed, doing
       * its job. `#open-menu` is the Engineer header's own, its handler is `dispatchMenu`, and an
       * `inert` ancestor swallows the click silently — which is precisely how this defect ships.
       */
      await page.locator('#open-menu').first().click();
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === false,
        undefined,
        { timeout: 15_000 },
      );
      // And back out of it, through the row a player presses, so the surface is left as it was.
      await pressMenuRow(page, 'main.resume');
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 15_000 },
      );
    } finally {
      await page.close();
    }
  }, 180_000);

  it('comes back from the Engineer header onto the screen it left, with the day still open', async () => {
    const page = await coldLoad();
    try {
      await stashHost(page);

      /*
       * Get a day of the player's own open on § 7's stage — the state a swap must not cost them.
       *
       * **This case was the last one in the file still pressing the tile through to `stage`**, while
       * the two above it had already been moved onto the loop's own route. The tile is keyed `door`,
       * so the press matched nothing and the case spent thirty seconds proving the harness wrong on a
       * product that was working.
       *
       * What is asserted is unchanged, and so is what produces it: § 6.2's *Start the day* calls
       * `host.startRun()` on the way to the stage, and `everyday/stageScreen.ts`'s mount presses the
       * same latch when it finds no run of the player's own open — so the day below is theirs by
       * either route, which is what § D232 makes the difference between a run that can be filed and
       * boot's demo.
       */
      await enterEverydayStage(page);
      expect((await runStateOf(page)).open, 'no run was open to survive the swap').toBe(true);
      const before = await page.evaluate(
        () => document.querySelector('.everyday-stage-canvas')?.getBoundingClientRect().width ?? 0,
      );
      expect(before).toBeGreaterThan(0);

      await enterEngineerStage(page);
      /*
       * The stage screen is still mounted while the other world has the page — covered, not
       * unmounted — which is what makes the return a resume rather than a re-entry. `§ 16` rule 9:
       * nothing in the rail changes what is running.
       */
      expect(
        await page.evaluate(() => document.querySelector('.everyday-stage-canvas') !== null),
        'the swap unmounted the screen the player was on',
      ).toBe(true);

      await returnToEverydayMode(page);

      const home = await page.evaluate(() => ({
        engineerInert: document.querySelector<HTMLElement>('.shell')?.inert,
        everydayInert: document.querySelector<HTMLElement>('.everyday')?.inert,
        everydayAria: document.querySelector<HTMLElement>('.everyday')?.getAttribute('aria-hidden'),
        // The screen the player left — not the menu. § 3.5 governs *entry*, and this is not one.
        onStage: document.querySelector('.everyday-stage-canvas') !== null,
        canvasBox:
          document.querySelector('.everyday-stage-canvas')?.getBoundingClientRect().width ?? 0,
        subline: document.querySelector('.everyday-rail-menu')?.textContent ?? '',
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
      }));
      expect(home.engineerInert).toBe(true);
      expect(home.everydayInert).toBe(false);
      expect(home.everydayAria).toBeNull();
      expect(home.onStage).toBe(true);
      expect(home.subline).toContain('MID-DAY');
      expect(home.primary).toBe('Close the day');
      /*
       * The measured half of *cover, never hide*: the canvas kept its box across a trip in which it
       * was never painted. Under `display:none` this is `0` and the returned stage draws nothing.
       */
      expect(home.canvasBox).toBe(before);

      // The day itself, from the host rather than from the screen drawing it.
      const survived = await runStateOf(page);
      expect(survived.hasRun).toBe(true);
      expect(survived.dayClosed).toBe(false);
      expect(survived.open, 'the swap discarded the player’s open day').toBe(true);

      /*
       * And Everyday Mode takes clicks again — the same *visible but not interactive* trap, on the
       * return leg. The rail's Main menu row runs `requestLeave`, which mid-run raises § 3.4's
       * strip, so a strip appearing is a click that reached a handler **and** the run-open latch
       * surviving the trip. Answered with *Stay*, so nothing is left half-asked.
       */
      await page.locator('.everyday-rail-menu').click();
      expect(await page.textContent('.everyday-bar-question')).toBe('Leave the day unfinished?');
      await page.locator('.everyday-bar-confirm-stay').click();
      expect(await page.textContent('.everyday-bar-primary')).toBe('Close the day');
    } finally {
      await page.close();
    }
  }, 240_000);

  it('survives a round trip on the menu too, and does not remember the world across a reload', async () => {
    const page = await coldLoad();
    try {
      await enterEngineerStage(page);
      await returnToEverydayMode(page);

      // The menu is interactive, by a press that navigates rather than by an attribute.
      await page.locator('.everyday-rail-settings').click();
      await page.waitForFunction(
        () => (document.querySelector('.everyday-rail-menu')?.textContent ?? '').includes('SETTINGS'),
        undefined,
        { timeout: 15_000 },
      );

      /*
       * § 3.5, through the door: nothing remembers which world had the page, so a reload lands on
       * Everyday Mode's main menu — from the Engineer side, which is the case a `startScreen` prop
       * in `localStorage` clothing would fail. It is asserted here rather than argued in a docstring
       * because the argument is exactly the one that has been made and then quietly broken before.
       */
      await enterEngineerStage(page);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      const reloaded = await page.evaluate(() => ({
        tiles: document.querySelectorAll('.everyday-mode').length,
        visibility: document.querySelector<HTMLElement>('.everyday')?.style.visibility,
        engineerInert: document.querySelector<HTMLElement>('.shell')?.inert,
        subline: document.querySelector('.everyday-rail-menu')?.textContent ?? '',
      }));
      expect(reloaded.tiles).toBe(4);
      expect(reloaded.visibility).toBe('');
      expect(reloaded.engineerInert).toBe(true);
      expect(reloaded.subline).toContain('YOU ARE HERE');
    } finally {
      await page.close();
    }
  }, 180_000);
});
