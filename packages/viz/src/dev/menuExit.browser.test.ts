/**
 * **A change of mind is not a choice** — GitHub issue #117, driven.
 *
 * ## Why this is a browser test and not a node one
 *
 * `closeMenu` lives inside `boot()`, which no node test can call: it needs a document, a canvas and
 * a click. Everything the node tier can say about issue #117's confirmed half is a **text**
 * assertion — `main.progression.test.ts` reads `main.ts` as a string and requires the `close` arm to
 * pass `'changed-their-mind'`. That is strong evidence about a line having been deleted and no
 * evidence at all about what the product does when a player presses Escape, which is the claim.
 *
 * ## What was reported, and what driving it found
 *
 * #117: *"WHAT MOVED SINCE THE RUN BEFORE THIS ONE compares against a phantom run."* The baseline
 * was a run the player never started — `was Garden Apartments · Energy aware · … · carried 39` —
 * against a 621-rider day on another building.
 *
 * The seam is here. `boot()` runs a full shift under the menu overlay, on the restored session's
 * building, dispatcher and seed. § D232 stopped that run **counting** with one flag, and `closeMenu`
 * latched that flag on all its arms — including the one whose own docstring says *"Resume itself
 * starts nothing."* Driven against the tree before the split, with `close` latching like the rest,
 * this exact sequence produced a filed sheet headed **Monday — day 1** and a streak line reading
 * *"First clean day. Streak started."* on a page where the only key pressed was Escape; the next run
 * the player actually started was then differenced against it.
 *
 * So the case below is the sequence, and the assertion is the **sheet**: after Escape and a full
 * playback, the Day report still reads *Nothing filed yet* — and, since `docs/19` defect 1, says
 * **why** in its own lede rather than refusing in silence. The positive control in the same file is
 * what stops that being vacuous — entering a mode properly and playing the same length of run does
 * file a sheet, so the refusal above is about the way out of the menu and not about the playback
 * failing to reach its end. The third case is the other direction of the same gate, the audit's
 * blocks-play trap: after a reload, **Resume** then **Run this shift** is a run the player started
 * on purpose, and it must file.
 *
 * § D220 § 4 forbids a browser test asserting a metric. Nothing here asserts one: every reading is
 * the presence or absence of a filed sheet.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import { CHROMIUM, HAS_BROWSER, enterEngineerStage, pressMenuRow, reopenEngineerMenu } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — `keyboard.browser.test.ts`'s reasoning, and files in
    // one project run concurrently.
    server: { port: 5200, strictPort: false },
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
 * A cold load with boot's own recording on the stage and the overlay still up.
 *
 * The smallest shipped building, so the playback below is seconds rather than a minute, and a fixed
 * seed so a failure is about the code rather than about the draw.
 */
async function coldLoad(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  // The page opens on Everyday Mode now; this is the player's way to the Engineer surface.
  await enterEngineerStage(page);
  /*
   * And then the Engineer menu is put back up, because *the menu is covering the page* is the
   * premise all three cases below start from — one dismisses it with Escape, two walk it to a mode
   * door. `everyday/boot.ts` has already pressed Resume once by now, which is the same
   * `changed-their-mind` exit the first case then performs; that press latches nothing, so the
   * refusal being asserted is still about the player's own way out and not about boot's.
   */
  await reopenEngineerMenu(page);
  return page;
}

/**
 * Play the run on the stage to its very end, the way a player watching at speed reaches it.
 *
 * The end has to be the **end**: `runProgressOf` is `simTimeS >= endedAt`, and both the sheet's
 * right to be a whole-day account (§ D223) and `openTab`'s right to file one hang on it. Clicking
 * the far edge of the timeline lands at 99.7 % and files nothing, which is a way to write this test
 * so that it passes for the wrong reason.
 */
async function playToEnd(page: Page): Promise<void> {
  /*
   * Wait for the run to be **adopted** before touching the transport. `coldLoad`'s canvas latch
   * proves the page booted, not that boot's worker run has landed — `adopt` is what enables the
   * transport (`disableTransport(ui, false)`), and § D232 makes an adoption that lands after the
   * overlay was dismissed **autoplay**. Reading the label before adoption therefore raced: the
   * pre-adoption label says *Play*, the queued click is held by actionability until `adopt`
   * enables the button, and by then autoplay has started the run — so the click *paused* it and
   * the playhead never reached the end. The wave that landed slices 3/5/6a made boot heavy
   * enough to lose that race deterministically; the latch below makes the read-then-click
   * sound in either ordering, because autoplay is decided at construction and cannot intervene
   * after the button is enabled.
   */
  await page.waitForFunction(
    () => {
      const button = document.querySelector('#play-pause');
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.locator('#speed-chips .chip', { hasText: '×900' }).first().click();
  if ((await page.locator('#play-pause').first().getAttribute('aria-label')) === 'Play') {
    await page.locator('#play-pause').first().click();
  }
  await page.waitForFunction(
    () => /left:\s*100(?:\.0+)?%/.test(document.querySelector('#playhead')?.getAttribute('style') ?? ''),
    undefined,
    { timeout: 60_000 },
  );
}

/** What the Day report says it is a sheet of, whether it claims a week — and its own lede. */
async function sheetOf(page: Page): Promise<{ title: string; streak: string; lede: string }> {
  await page.locator('#tab-report').first().click();
  await page.waitForTimeout(300);
  return page.evaluate(() => ({
    title: document.querySelector('#report-title')?.textContent ?? '',
    streak: document.querySelector('#report-streak')?.textContent ?? '',
    lede: document.querySelector('#report-lede')?.textContent ?? '',
  }));
}

/**
 * Boot's (or a re-run's) worker recording has landed and been adopted — the transport enabling is
 * the adoption signal (`adopt` → `disableTransport(ui, false)`). Every press of `#run` must wait
 * for this: while a run is in flight, `#run` is the cancel button, and a press that lands
 * mid-flight cancels the run instead of starting the player's.
 */
async function waitForAdoption(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const button = document.querySelector('#play-pause');
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    undefined,
    { timeout: 30_000 },
  );
}

describe.skipIf(!HAS_BROWSER)('leaving the menu without entering a mode', () => {
  it('does not let boot’s own run file itself as the player’s day', async () => {
    /*
     * The reproduction, in four acts a player performs without thinking: load the page, press
     * Escape because the menu is in the way, press play because there is a building on the screen,
     * open the Day report because that is where the result is.
     *
     * Before the split this reached `closeShift` with the gate open and banked a clean Monday.
     */
    const page = await coldLoad();
    // The overlay must be up before Escape can dismiss it — under load the canvas latch can win
    // the race against the menu's own first draw, and an Escape into a page with no overlay yet
    // drives nothing. Latched on visibility, not on a sleep, for the same reason as playToEnd's.
    await page.waitForFunction(
      () => {
        const overlay = document.querySelector<HTMLElement>('.menu-overlay');
        return overlay !== null && !overlay.hidden;
      },
      undefined,
      { timeout: 30_000 },
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
      undefined,
      { timeout: 10_000 },
    );
    expect(
      await page.evaluate(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden ?? false,
      ),
      'Escape did not dismiss the overlay, so this case is not driving what it claims to',
    ).toBe(true);

    await playToEnd(page);
    const sheet = await sheetOf(page);

    expect(sheet.title, 'boot’s own recording filed itself as a day — issue #117’s phantom').toBe(
      'Nothing filed yet',
    );
    // And nothing was banked either. § D232's own claim, which the shared flag had quietly widened.
    expect(sheet.streak).toBe('');
    /*
     * **And the refusal speaks** — `docs/19` defect 1's second half. This exact state used to keep
     * the design's placeholder lede, telling the reader to press *Run this shift* about a run
     * whose completion the gate had just refused in silence. The lede is now
     * `shift/banking.ts#UNCHOSEN_RUN_CANNOT_BANK`, which names what the run was and what does
     * count.
     */
    expect(sheet.lede).toContain('not by you');
    await page.close();
  });

  it('still files a day when the player did enter a mode — the control that keeps the above honest', async () => {
    /*
     * Without this, the case above passes on any build where the playback never reaches its end,
     * where the report tab is broken, or where nothing files at all. The same page, the same
     * building, the same length of playback — and one difference, which is that the menu was left by
     * a door that means *I am playing this*.
     */
    const page = await coldLoad();
    /*
     * By id, and this line is the one that rotted **twice** — GitHub issue #142.
     *
     * It read `hasText: 'Scenarios'` then `hasText: 'Open the doors'`. The second string is honest
     * drift: issue #97 renamed that row to *Pick a scenario* because the old words claimed the press
     * started a week and it only opens a board (`menu/screens.ts#campaignRows`). The first is the
     * subtler one and is the reason a fresh string would not have been a fix — see `pressMenuRow`.
     * Two independent rots on two adjacent lines, both silent, because the tier ran nowhere.
     */
    await pressMenuRow(page, 'main.campaign');
    await pressMenuRow(page, 'campaign.open');
    await page.locator('#tab-run').first().click();
    // Boot's own run must have landed before #run is pressed — see {@link waitForAdoption}.
    await waitForAdoption(page);
    await page.locator('#run').first().click();
    await page.waitForTimeout(500);

    await playToEnd(page);
    const sheet = await sheetOf(page);

    expect(sheet.title, 'a day the player started did not file — the refusal above proves nothing').not.toBe(
      'Nothing filed yet',
    );
    await page.close();
  });

  it('files a run the player starts after reload + Resume — docs/19 defect 1, the blocks-play trap', async () => {
    /*
     * The audit's exact repro, and the regression that matters. Before the fix, `playerHasChosen`
     * latched only in `closeMenu`'s entered-a-mode arms, so a returning player's natural sequence
     * — reload, **Resume**, **Run this shift**, watch the day out — completed a run the gate then
     * refused in silence, forever, on the very button the empty sheet names. The latch now also
     * fires where a run is started on purpose (`playerStartedARun`), so this sequence must file.
     *
     * The first half of the case is the setup the audit calls *mid-campaign*: enter the campaign
     * by a mode door, run a day to its end, and let `closeShift` file it — which is also what
     * writes the session `page.reload()` then restores. Asserted before the reload, because a
     * setup that silently failed to file would make the reload restore nothing and the case prove
     * nothing.
     */
    const page = await coldLoad();
    await pressMenuRow(page, 'main.campaign');
    await pressMenuRow(page, 'campaign.open');
    await page.locator('#tab-run').first().click();
    await waitForAdoption(page);
    await page.locator('#run').first().click();
    await page.waitForTimeout(500);
    await playToEnd(page);
    const banked = await sheetOf(page);
    expect(banked.title, 'the setup day did not file, so there is no mid-campaign session to restore').not.toBe(
      'Nothing filed yet',
    );

    // The repro proper: reload (session restores; menu up) → Resume → Run this shift → the end.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
      timeout: 30_000,
    });
    /*
     * **The Resume press is still here; it is just not this test's to make any more.**
     *
     * The audit's player reloads and leaves the menu by Resume — a `changed-their-mind` exit, which
     * deliberately latches nothing. Since the page began opening on Everyday Mode, `everyday/boot.ts`
     * makes exactly that press itself as soon as the row is drawable, and the returning player's
     * sequence is *reload → Today's tower → Run this shift*. So this walks that, and the case is
     * unchanged in what it proves: no `entered-a-mode` exit happens anywhere in it, the tile press
     * latches nothing either, and the only thing that can file the day below is
     * `playerStartedARun` on the `#run` press.
     *
     * The adoption latch the old Resume wait doubled as has not been dropped — `waitForAdoption`
     * below is it, and it was always the load-bearing half.
     */
    await enterEngineerStage(page);
    // Back to the run surface first: `syncUrl` keeps the address describing the state, so after
    // the setup half filed its sheet the reloaded URL opens on the **report** tab — where `#run`
    // and the transport are not on screen. The audit's player was on the run surface; this is
    // that click, not a workaround.
    await page.locator('#tab-run').first().click();
    await waitForAdoption(page);
    await page.locator('#run').first().click();
    await page.waitForTimeout(500);
    await playToEnd(page);
    const sheet = await sheetOf(page);

    expect(
      sheet.title,
      'after reload + Resume, a run the player explicitly started did not file — docs/19 defect 1 is back',
    ).not.toBe('Nothing filed yet');
    await page.close();
  });
});
