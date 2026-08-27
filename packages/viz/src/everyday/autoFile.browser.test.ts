/**
 * **Nobody files the Everyday player's day but the Everyday player** — GitHub issue **#287**.
 *
 * `GAMEPLAY_AND_NAVIGATION.md` § 6.4 and § 16 rule 1 both say it in one sentence: *`Close the day`
 * is the **only** thing that sets `dayClosed`*. The product broke it in a way no node test could
 * see, because the thing that filed the day was not on the screen the player was looking at.
 *
 * ## What the defect was
 *
 * Two shells, two `Playback`s, one `ViewerState`. The Everyday stage builds its own transport over
 * the recording (`everyday/stageScreen.ts#adopt`) and the player drives that one; `dev/main.ts`
 * builds a second one over the same recording and autoplays it at `DEFAULT_BASE_SPEED` — ×60,
 * invisible behind the cover, driven by no control the player has. `dev/main.ts#tick` then filed
 * the day when **that** transport reached the end. Arriving on the stage and touching nothing
 * scored and banked a day in a fixed number of real seconds: the recording's span over sixty,
 * about a minute for the hour `garden-apartments` opens on.
 *
 * ## Why the cases below drive the product rather than the mechanism
 *
 * Every fact in the paragraph above is a closure local in `dev/main.ts`, and the one observable
 * consequence — a day filed — is a sentence on the Everyday action bar. So this is a browser-tier
 * file, and it reaches both worlds the way a player reaches them: `enterEverydayStage` walks § 6's
 * loop, `enterEngineerStage` presses § 3.2's swap row, and the return presses the Engineer header's
 * own control. Nothing here lifts a cover — a tier that did would be testing a surface nobody can
 * open, which is `dev/browserTier.test-helper.ts`'s standing argument.
 *
 * ## `?duration=`, and why a short day is not a weakened case
 *
 * The interval is `(endedAt − startedAt) / 60` and nothing about the defect depends on its size:
 * at the shipped hour it is ~60 s of waiting per case — measured, on this tree, at 60 011 ms from
 * arriving on the stage — and at five minutes it is ~5 s. The link carries `duration` already
 * (`dev/main.ts#deepLinkStateOf`, clamped to `[60, 7200]`), `garden-apartments` declares no whole
 * day (`shift/dayLength.ts#wholeDayFor` answers `undefined` for it), so the Everyday brief's own
 * `startRun` patches no length over it and the run really is the one the address asked for.
 * {@link engineerEndMs} is that arithmetic written once, and every wait below is a multiple of it —
 * a case that waited a flat number of seconds would go quiet the day the opening hour moves.
 *
 * **The last three cases are the negative controls, and the file is worth nothing without them.**
 * Five cases that assert *the day did not file* all pass on a build where nothing can ever file.
 * So one lets a day run out **after** the player has crossed into the Engineer world, one presses
 * the keyboard shortcut on the surface that shortcut belongs to, and one drives that surface's own
 * Run button; all three require the day **to** file, on the same page and through the same
 * instrument. Between them they pin the boundary as an *edge* — the instant the day ran out is the
 * instant that decides which product owns it — rather than as a rule reading *an Everyday day never
 * files by itself*, which is the wrong fix that every absence case would have been equally happy
 * with.
 *
 * Every absence case fails on `55f2bca` and every control passes there, which is the instrument
 * moving in both directions before its green was trusted.
 *
 * ## The third filing site, which issue #287 does not name
 *
 * Two of the cases below are about `dev/main.ts#tick`, which is what the issue reports. A third
 * turned up while tracing what else was armed behind § D338's cover: `Ctrl`/`Cmd`+`Enter` is bound
 * to `closeShift` on a **`window`** listener, and neither `inert` nor `visibility:hidden` takes an
 * element out of the bubble path of a key pressed on `body`. It is the same defect by a different
 * road and the same sentence forbids it.
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
  returnToEverydayMode,
} from '../dev/browserTier.test-helper.js';
import { STAGE_DAY_OVER, STAGE_SPEEDS, stageBarModelOf } from './stageScreenModel.js';

/** The run the address asks for, in simulated seconds. See the module docstring. */
const RUN_S = 300;

/**
 * A longer one, for the two cases that have to *get somewhere* before the covered transport runs
 * out. `deepLinkStateOf` clamps `duration` to `[60, 7200]`, so both of these are values the address
 * really honours rather than values it quietly rounds.
 */
const LONG_RUN_S = 900;

/**
 * When `dev/main.ts`'s own transport reaches the end of a run of `runS` seconds, in real
 * milliseconds.
 *
 * `DEFAULT_BASE_SPEED` is 60 and `menuState.settings.playbackSpeed` opens at ×1, so the covered
 * transport plays the recording at sixty simulated seconds per real one. Derived rather than
 * measured, because the number this file cares about is *the instant the old defect fired* and a
 * measured one would move with the machine.
 */
const engineerEndMs = (runS: number): number => (runS / 60) * 1000;

/** The top rung of § 7's ladder, read rather than counted — `stageScreen.browser.test.ts`'s rule. */
const TOP_SPEED_INDEX = STAGE_SPEEDS.length - 1;

/**
 * The exact sentence a filed day puts on § 3.3's row, taken from the function that writes it.
 *
 * Transcribing it would be the third copy of a string this repository has already been bitten by
 * once — `stageScreen.browser.test.ts`'s `LEAVE_TOWER` comment holds that story, about an
 * apostrophe. `stageBarModelOf` is pure, so the browser tier can ask it directly.
 */
const FILED_BAR = stageBarModelOf(
  { screen: 'stage', ctx: 'daily' },
  { hasRun: true, dayClosed: true, recomputing: false },
);
if (FILED_BAR.note === undefined) {
  // Loud rather than defaulted: an empty string here would silently turn every assertion below
  // into a comparison against the absence of a note, which is a thing the page is often in.
  throw new Error('stageBarModelOf drew no note for a filed day — issue #287’s instrument is gone');
}
const FILED_NOTE: string = FILED_BAR.note;

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5219, strictPort: false },
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

/** A cold load at a short day, settled: `dev/main.ts` has booted and its own menu is dismissed. */
async function coldLoad(runS: number = RUN_S): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242&duration=${String(runS)}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/**
 * What § 3.3's row says about today, read off the page.
 *
 * Both halves, because either alone is a weaker claim than the issue's: a filed day resolves the
 * primary **inert** (`stageBarModelOf`) *and* puts the reason in the note, and the shell draws an
 * inert primary disabled. A case that only read the note would pass against a build that disabled
 * the button and said nothing, which is the second half of the same defect.
 *
 * The Everyday root is never removed or hidden with `display` — § D338 covers it with
 * `visibility:hidden` — so this reads correctly from inside the Engineer world too, which is what
 * the round-trip case needs.
 */
async function barSays(page: Page): Promise<{ readonly note: string; readonly inert: boolean }> {
  return page.evaluate(() => ({
    note: document.querySelector('.everyday-bar-note')?.textContent ?? '',
    inert: document.querySelector<HTMLButtonElement>('.everyday-bar-primary')?.disabled ?? false,
  }));
}

/** Wait out `multiple` covered-transport runs. The unit is the interval the defect fired at. */
async function waitPastTheCoveredEnd(
  page: Page,
  multiple: number,
  runS: number = RUN_S,
): Promise<void> {
  await page.waitForTimeout(engineerEndMs(runS) * multiple);
}

describe.skipIf(!HAS_BROWSER)('the day nobody closed', () => {
  it('does not file itself on a stage the player has not touched', async () => {
    const page = await coldLoad();
    try {
      await enterEverydayStage(page);
      /*
       * Four times over the instant the defect fired at. The issue measured 58.6–59.2 s against a
       * derived 60.0, so the margin is not tight in either direction — what a longer wait buys is
       * the reading *nothing files, ever*, rather than *nothing had filed yet*.
       */
      await waitPastTheCoveredEnd(page, 4);
      const bar = await barSays(page);
      expect(bar.note).not.toBe(FILED_NOTE);
      expect(bar.inert).toBe(false);
    } finally {
      await page.close();
    }
  }, 300_000);

  it('does not file itself at the fastest chip, when the player’s own transport has ended', async () => {
    const page = await coldLoad();
    try {
      await enterEverydayStage(page);
      /*
       * § 7's own transport, run to the end on the ladder's top rung — the state the issue's last
       * section describes, where the stage's playback is finished and the covered one is not. At
       * 600× a five-minute day is half a second of watching, so the wait below covers both.
       */
      await page.click(`.everyday-stage-speed[data-speed-index="${String(TOP_SPEED_INDEX)}"]`);
      await page.click('.everyday-stage-play');
      await waitPastTheCoveredEnd(page, 4);
      const bar = await barSays(page);
      expect(bar.note).not.toBe(FILED_NOTE);
      expect(bar.inert).toBe(false);
      // The player's own transport really did finish: § 7.3's button is back to offering Play.
      expect(await page.textContent('.everyday-stage-play')).toContain('Play');
      /*
       * And the fourth criterion. The issue's own last section is what this line answers: from the
       * instant the stage's playback finishes, the page was bit-for-bit identical with only that
       * `⏸ Pause` → `▶ Play` flip to show for itself, and readers took it for a crash. Removing the
       * covered transport makes the stillness *permanent*, so the row is what has to say the day is
       * over — and the two assertions above it are the other half: the primary that ends the
       * stillness is still pressable.
       */
      expect(bar.note).toBe(STAGE_DAY_OVER);
    } finally {
      await page.close();
    }
  }, 300_000);

  /**
   * The **third** filing site, and the one that is not a transport at all.
   *
   * `dev/main.ts` binds `Ctrl`/`Cmd`+`Enter` to `closeShift` on a **`window`** listener. `inert` is
   * what covers the Engineer surface, and `inert` does not stop a window-level key handler — so a
   * shortcut belonging to a surface the Everyday player cannot see filed, scored and banked their
   * day from § 7's stage. Not what issue #287 reported, found while tracing what else was armed
   * behind the cover, and the same sentence forbids it: *`Close the day` is the **only** thing that
   * sets `dayClosed`*.
   *
   * Driven as a real keystroke on the page rather than a synthesised event, and both modifiers,
   * because the product accepts either and a case that pressed one would leave the other armed.
   */
  it('is not filed by the Engineer surface’s own keyboard shortcut', async () => {
    const page = await coldLoad();
    try {
      await enterEverydayStage(page);
      await page.keyboard.press('Control+Enter');
      await page.keyboard.press('Meta+Enter');
      await page.waitForTimeout(500);
      const bar = await barSays(page);
      expect(bar.note).not.toBe(FILED_NOTE);
      expect(bar.inert).toBe(false);
    } finally {
      await page.close();
    }
  }, 300_000);

  it('stays unfiled across a round trip through § 3.2’s door', async () => {
    const page = await coldLoad();
    try {
      await enterEverydayStage(page);
      // The covered transport passes the end of the day here, under the cover, unwatched.
      await waitPastTheCoveredEnd(page, 2);
      /*
       * § 3.2's swap and the Engineer header's return, both pressed rather than simulated. This is
       * the criterion that says the file may not be *re-armed* by the trip: the day the player left
       * unclosed on the stage is the day they come back to.
       */
      await enterEngineerStage(page);
      await waitPastTheCoveredEnd(page, 1);
      await returnToEverydayMode(page);
      await waitPastTheCoveredEnd(page, 1);
      const bar = await barSays(page);
      expect(bar.note).not.toBe(FILED_NOTE);
      expect(bar.inert).toBe(false);
    } finally {
      await page.close();
    }
  }, 300_000);

  it('files when the player presses Close the day, and only then', async () => {
    const page = await coldLoad();
    try {
      await enterEverydayStage(page);
      await waitPastTheCoveredEnd(page, 2);
      expect((await barSays(page)).note).not.toBe(FILED_NOTE);
      /*
       * § 3.3's primary. It lands the player on the report (`stageFilingLandsOn`, issue #206), so
       * the bar under them is the report's — the fact asserted is the one the host holds: the day
       * is filed, which is what `everyday/reportScreen.ts` needs to have a sheet to draw.
       */
      await page.click('.everyday-bar-primary');
      await page.waitForSelector('.everyday-report', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  }, 300_000);

  /**
   * **The negative control.** Everything above asserts an absence, and an absence is free on a
   * build that has broken the behaviour outright.
   *
   * The Engineer surface's own rule — *the day closes when the day ends* — is not the defect and is
   * deliberately untouched. So: swap to the Engineer world through § 3.2's row, press its own
   * **Run this shift**, and require the day to file on its transport reaching the end, read through
   * the very instrument the four cases above trust. If a fix disarms the close everywhere rather
   * than while the Everyday shell holds the page, this is the case that says so.
   */
  /**
   * The other half of the negative control: the boundary is **when the day ran out**, not *which
   * shell the run was started from*.
   *
   * A player who walks through § 3.2's door while the day is still going has gone to the surface
   * whose stated behaviour is *the day closes when the day ends*, and it does. The run below starts
   * in the Everyday world and ends in the Engineer one, so it is the one case that can tell an edge
   * from a rule reading *an Everyday day never files by itself*. `LONG_RUN_S` is what makes the
   * swap comfortably earlier than the end rather than a race with it.
   */
  it('closes a day that ran out after the player crossed into the Engineer world', async () => {
    const page = await coldLoad(LONG_RUN_S);
    try {
      await enterEverydayStage(page);
      await enterEngineerStage(page);
      await page.waitForFunction(
        (note) => document.querySelector('.everyday-bar-note')?.textContent === note,
        FILED_NOTE,
        { timeout: 120_000 },
      );
    } finally {
      await page.close();
    }
  }, 300_000);

  /**
   * The third negative control: the shortcut is not broken, it is **scoped**.
   *
   * `LONG_RUN_S` is what makes this an isolation rather than a coincidence. The covered transport
   * cannot reach the end of a fifteen-minute day in under fifteen real seconds, so a day that is
   * filed within five of them was filed by the keystroke and by nothing else.
   */
  it('still closes the day from the keyboard on the surface the shortcut belongs to', async () => {
    const page = await coldLoad(LONG_RUN_S);
    try {
      await enterEverydayStage(page);
      await enterEngineerStage(page);
      await page.keyboard.press('Control+Enter');
      await page.waitForFunction(
        (note) => document.querySelector('.everyday-bar-note')?.textContent === note,
        FILED_NOTE,
        { timeout: 5_000 },
      );
    } finally {
      await page.close();
    }
  }, 300_000);

  it('still closes the Engineer surface’s own day when its own transport ends', async () => {
    const page = await coldLoad();
    try {
      await enterEverydayStage(page);
      await enterEngineerStage(page);
      /*
       * The Engineer Run button — `wireTransport`'s, one of `playerStartedARun`'s two latch sites.
       * It re-adopts, which clears `filedRunId`, so the day this files is the one started here.
       */
      await page.click('#run');
      await page.waitForFunction(
        (note) => document.querySelector('.everyday-bar-note')?.textContent === note,
        FILED_NOTE,
        { timeout: 120_000 },
      );
    } finally {
      await page.close();
    }
  }, 300_000);
});
