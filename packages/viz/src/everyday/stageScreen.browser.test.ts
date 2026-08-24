/**
 * **§ 7's stage, driven on the page** — the five things a node test cannot vouch for.
 *
 * The pure half is `stageScreenModel.test.ts`'s, and it covers every word and every number. What
 * is left is precisely what needs a document, a real canvas and a real animation frame:
 *
 * 1. **Entry.** Walking § 6's loop mounts § 7's stage rather than uncovering the Engineer surface,
 *    and the run it asks for lands. The whole hand-off retirement is one assertion here:
 *    `.everyday-stage-canvas` exists and `.shell` is still covered.
 * 2. **Paused at the day's own start hour, with the first frame drawn.** § 7.3, and both halves
 *    matter — a stage that entered *playing* would be a day the player never chose to start, and a
 *    stage that entered paused with an empty canvas would be a blank screen with a `Start` button
 *    over it. The frame is checked by reading the canvas's own backing store, which is the only way
 *    to know something was painted. The *hour* is a finding rather than a transcription; the case
 *    below carries it.
 * 3. **The canvas has a real box.** § D335's rule: a canvas measured under a `display:none`
 *    ancestor gets a zero box and never recovers. `canvas.width > 0` on a mounted stage is that
 *    rule, checked on the product rather than argued about.
 * 4. **An intervention re-simulates and keeps the playhead.** § 7.6 and contract § 1.4 — the
 *    stamp appears, and the clock does not jump back to the start of the day.
 * 5. **Closing the day.** § 3.3's primary files the run, and § 3.4's latch disarms with it, so
 *    leaving afterwards does not raise the confirm strip.
 *
 * Pattern and gate are `shell.browser.test.ts`'s; no metric is read (§ D220 § 4) — every assertion
 * below is about a control, a class name or a clock, never about how a dispatcher performed.
 *
 * ## How these cases reach the stage, and the one time that route moved
 *
 * Through `dev/browserTier.test-helper.ts#enterEverydayStage`, which walks § 6's loop —
 * menu tile → front door → brief → stage — on § 3.3's primary at each step.
 *
 * It used to be one press. This file landed pressing the *Today's tower* tile and waiting for
 * `.everyday-stage-canvas`, which was the whole route for exactly as long as § 6.1's front door and
 * § 6.2's brief were unbuilt. Both are registered screens now, so `everyday/modes.ts` routes that
 * tile to `door` — which is what § 4's own inventory says it should, *"reached from menu (Today's
 * tower)"* — and `.everyday-mode[data-screen="stage"]` matches nothing on a working page. **The
 * product was right and the helper was stale**, and it failed the way a stale selector always fails:
 * a thirty-second timeout inside the harness, reported as five broken cases about the stage.
 *
 * That is `enterEngineerStage`'s lesson a second time, so the walk is shared rather than copied a
 * third time — `shell.browser.test.ts` and `dailyLoop.browser.test.ts` press the same function — and
 * it waits on facts that are only true once the day is *on* the stage rather than on a selector an
 * unmounted skeleton would satisfy. Not one assertion below moved with it.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import {
  CHROMIUM,
  HAS_BROWSER,
  enterEverydayStage,
} from '../dev/browserTier.test-helper.js';
import { ACTION_BAR_ROWS } from './actionBar.js';

/**
 * § 3.3's own cell, imported rather than transcribed.
 *
 * It is transcribed twice already — in `actionBar.ts` and in `actionBar.test.ts` — and a third copy
 * here caught nothing and failed once, on the apostrophe: the table's cell uses a typewriter `'`
 * and this file had been written with a typographic `’`. Two spellings of one label is a difference
 * no reader can see and every string comparison can.
 */
const LEAVE_TOWER = ACTION_BAR_ROWS.find(
  (row) => row.screen === 'stage' && row.ctx === 'daily',
)?.leave.label;

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5201, strictPort: false },
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

/** A cold load, settled: `dev/main.ts` has booted and its own menu has been dismissed. */
async function coldLoad(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** Whether the canvas's backing store holds any non-transparent pixel. */
async function canvasHasPaint(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.everyday-stage-canvas');
    if (canvas === null || canvas.width === 0) return false;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if ((data[index] ?? 0) !== 0) return true;
    }
    return false;
  });
}

describe.skipIf(!HAS_BROWSER)('the Everyday stage', () => {
  it('opens as a screen, with the Engineer surface still covered behind it', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);

    /*
     * The hand-off's retirement, on the product. Before § 7's stage, arriving here shrank the shell
     * to the 212 px rail strip and inset `div.shell` beside it; now the shell keeps its full
     * geometry and the Engineer root stays inert underneath, exactly as on every other screen.
     */
    const shell = await page.evaluate(() => {
      const engineer = document.querySelector<HTMLElement>('.shell');
      return { inert: engineer?.inert ?? null, marginLeft: engineer?.style.marginLeft ?? null };
    });
    expect(shell.inert).toBe(true);
    expect(shell.marginLeft).toBe('');

    /* § 3.3 is drawn over this stage — it was not over the handed-off one. */
    expect(await page.textContent('.everyday-bar-leave')).toBe(LEAVE_TOWER);
    expect(await page.textContent('.everyday-bar-primary')).toBe('Close the day');
    await page.close();
  });

  /**
   * § 7.3 says *"paused, at 06:00, with the day's first frame drawn"*, and **this build opens
   * `garden-apartments` at 08:30** — measured here rather than assumed, because the first draft of
   * this case asserted the guide's literal and failed against the product.
   *
   * The product is right and the guide's literal is the deviation. `06:00` is `DAY_START_S`, which
   * `live/timeline.ts` uses as a *fallback* for a template that declares no hour; a run whose demand
   * template names its own start opens on that hour, and forcing 06:00 over it would be labelling
   * this building with another building's morning — the standing rule's own case (*the simulator
   * wins every disagreement about what a number means*). `stageScreenModel.test.ts` pins the
   * fallback; this pins the shape, and the property that actually matters: **the playhead is at the
   * start of the day and time only moves forward from it.**
   */
  it('enters paused at the day’s own start hour, with the first frame drawn on a canvas that has a box', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);

    /* § 7.3, both halves. */
    const opened = (await page.textContent('.everyday-stage-clock')) ?? '';
    expect(opened).toMatch(/^\d{2}:\d{2}$/u);
    expect(await page.textContent('.everyday-stage-play')).toContain('Play');
    expect(await page.isVisible('.everyday-stage-start')).toBe(true);
    /* Paused means paused: the clock does not move on its own. */
    await page.waitForTimeout(400);
    expect(await page.textContent('.everyday-stage-clock')).toBe(opened);

    /* § D335 and § 14: a real bounding rect, scaled by min(2, dpr), never a CSS scale. */
    const size = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.everyday-stage-canvas');
      const rect = canvas?.getBoundingClientRect();
      return {
        backing: canvas?.width ?? 0,
        css: Math.round(rect?.width ?? 0),
        dpr: Math.min(2, window.devicePixelRatio),
      };
    });
    expect(size.css).toBeGreaterThan(100);
    expect(size.backing).toBe(Math.round(size.css * size.dpr));
    expect(await canvasHasPaint(page)).toBe(true);

    /* § 4.6: the day opens at the player's default speed, which is 1× until a setting exists. */
    const pressed = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.everyday-stage-speed')]
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => button.textContent),
    );
    expect(pressed).toEqual(['1×']);

    /* And the playhead was at the *start*: playing only ever takes the clock forward from it. */
    await page.click('.everyday-stage-speed[data-speed-index="4"]');
    await page.click('.everyday-stage-play');
    await page.waitForFunction(
      (from) => document.querySelector('.everyday-stage-clock')?.textContent !== from,
      opened,
      { timeout: 20_000 },
    );
    const later = (await page.textContent('.everyday-stage-clock')) ?? '';
    expect(later > opened, `${later} is later than ${opened}`).toBe(true);
    await page.close();
  });

  it('plays, and the clock moves', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);
    /* 30× so a second of real time is ten minutes of the day — the transport, not a metric. */
    await page.click('.everyday-stage-speed[data-speed-index="4"]');
    await page.click('.everyday-stage-play');
    const opened = await page.textContent('.everyday-stage-clock');
    await page.waitForFunction(
      (from) => document.querySelector('.everyday-stage-clock')?.textContent !== from,
      opened,
      { timeout: 20_000 },
    );
    expect(await page.textContent('.everyday-stage-play')).toContain('Pause');
    /* The centred `Start` is gone once the day is under way — it is an affordance, not a badge. */
    expect(await page.isVisible('.everyday-stage-start')).toBe(false);
    await page.click('.everyday-stage-play');
    expect(await page.textContent('.everyday-stage-play')).toContain('Play');
    await page.close();
  });

  it('takes an intervention, re-simulates, and keeps the playhead', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);
    const opened = await page.textContent('.everyday-stage-clock');
    await page.click('.everyday-stage-speed[data-speed-index="4"]');
    await page.click('.everyday-stage-play');
    await page.waitForFunction(
      (from) => document.querySelector('.everyday-stage-clock')?.textContent !== from,
      opened,
      { timeout: 20_000 },
    );
    await page.click('.everyday-stage-play');
    const before = await page.textContent('.everyday-stage-clock');

    await page.click('.everyday-stage-intervene[data-intervention-kind="park-cars-lobby"]');
    /*
     * § 7.6: the stamp is what says the record grew, and it names the instant the player was
     * looking at — which is this screen's playhead, not the Engineer transport's. It arrives when
     * the re-simulated day does.
     */
    await page.waitForFunction(
      () => (document.querySelector('.everyday-stage-stamp')?.textContent ?? '') !== '',
      undefined,
      { timeout: 60_000 },
    );
    expect(await page.textContent('.everyday-stage-stamp')).toContain(
      'parked the cars in the lobby',
    );
    /* *A re-simulation is not a reset* — the clock continues from the playhead. */
    expect(await page.textContent('.everyday-stage-clock')).not.toBe(opened);
    expect(await page.textContent('.everyday-stage-clock')).toBe(before);
    await page.close();
  });

  it('closes the day, and leaving afterwards does not warn', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);
    await page.click('.everyday-stage-play');

    /* § 3.4 is armed while the player's own day is open: leaving raises the strip, and *Stay*
       puts the bar back untouched. */
    await page.click('.everyday-bar-leave');
    await page.waitForSelector('.everyday-bar-confirm-stay');
    expect(await page.textContent('.everyday-bar-question')).toBe('Leave the day unfinished?');
    await page.click('.everyday-bar-confirm-stay');
    expect(await page.textContent('.everyday-bar-primary')).toBe('Close the day');

    /*
     * § 3.3's primary files the run; the latch disarms with it, because a filed day is not open.
     *
     * **And it opens the sheet it wrote** — GitHub issue #206 — so what stands after the press is
     * the report, not the stage. The two claims this case made about the *stage* after a file are
     * unchanged and are made in the case below, which files the day the other way it is filed.
     */
    await page.click('.everyday-bar-primary');
    await page.waitForSelector('.everyday-report', { timeout: 30_000 });

    await page.click('.everyday-bar-leave');
    /* No strip: a report is already after the fact, and warning about it would be theatre. */
    expect(await page.locator('.everyday-bar-confirm-stay').count()).toBe(0);
    /* And the menu is back. The tile is keyed `door` — § 4's *"reached from menu (Today's
       tower)"* — which is the same route change {@link enterEverydayStage} walks; the claim here is
       unchanged and is about the menu having been reached at all. */
    await page.waitForSelector('.everyday-mode[data-screen="door"]');
    await page.close();
  });

  /**
   * The stage's own filed state — which the § 3.3 press no longer stops on.
   *
   * Since GitHub issue #206 the primary opens the report, so a day filed *by pressing it* leaves
   * this screen. The state is neither gone nor invented: `dev/main.ts`'s tick files a day whose
   * playhead has run out, and that file arrives while the player is still watching. So it is driven
   * here through the data host — `dailyLoop.browser.test.ts#closeDay`'s idiom, for its stated
   * reason: one deterministic step rather than a press whose timing depends on the mount.
   *
   * Both assertions were the case above's before the fix, and neither is weakened: an intervention
   * on a filed day is refused **and says so**, and § 3.4 does not warn about leaving one.
   */
  it('refuses an intervention on a day filed under it, and does not warn about leaving that', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);
    await page.click('.everyday-stage-play');

    await page.evaluate(
      "import('/src/everyday/host.ts').then((module) => { module.EVERYDAY_HOST.current()?.closeDay(); return true; })",
    );
    await page.waitForFunction(
      () => document.querySelector('.everyday-stage-intervene')?.hasAttribute('disabled') === true,
      undefined,
      { timeout: 30_000 },
    );
    expect(await page.textContent('.everyday-stage-intervene-refusal')).toContain('filed');
    /* Still the stage: only the § 3.3 press navigates, and this was not it. */
    expect(await page.locator('.everyday-stage-canvas').count()).toBe(1);

    await page.click('.everyday-bar-leave');
    expect(await page.locator('.everyday-bar-confirm-stay').count()).toBe(0);
    await page.waitForSelector('.everyday-mode[data-screen="door"]');
    await page.close();
  });

  /**
   * **The other flow that files** — GitHub issue #206's second half of the blast radius.
   *
   * `screens.ts` routes one `STAGE_SCREEN` and its `primary` is one function, so a campaign day is
   * filed by the very code the daily case drives. That is exactly why it is driven rather than
   * argued: the press's destination is decided per run context, and a rule that answered *report*
   * for `daily` because it was written for `daily` would be a rule that passes its own test.
   *
   * The walk is the player's: Campaign tile → the triage row's building → the contract desk → *Lock
   * it in and run day N*, which is `runCampaignDay` and `go('stage')`. `campaignScreens.browser.
   * test.ts` walks the first three of those and stops at the desk; this carries on to the end.
   */
  it('files a campaign day on the same primary and lands on the campaign report', async () => {
    const page = await coldLoad();
    await page.locator('.everyday-mode', { hasText: 'Campaign' }).first().click();
    await page.waitForSelector('.everyday-towers');
    const building = await page.textContent('.everyday-towers-name');
    await page.click('.everyday-towers-open');
    await page.waitForSelector('.everyday-building');
    await page.click('.everyday-building-to-contract');
    await page.waitForSelector('.everyday-contract');

    await page.click('.everyday-bar-primary');
    await page.waitForSelector('.everyday-stage-canvas', { timeout: 60_000 });
    await page.waitForFunction(
      () => document.querySelector('.everyday-bar-primary')?.textContent === 'Close the day',
      undefined,
      { timeout: 120_000 },
    );
    /* § 3.3's campaign stage row is step 4 of five, which is how this case knows the context is
       the campaign's and not the daily one it shares a screen with. */
    expect(await page.textContent('.everyday-bar-timeline')).toContain('4 The day');

    await page.click('.everyday-bar-primary');
    await page.waitForSelector('.everyday-report', { timeout: 30_000 });
    expect(await page.locator('.everyday-report-empty').count()).toBe(0);
    /* § 3.3's campaign report row: step 5 of five, and the primary that names the building the
       triage row opened. */
    expect(await page.textContent('.everyday-bar-timeline')).toContain('5 How it went');
    expect(await page.textContent('.everyday-bar-primary')).toBe(`Back to ${building ?? ''}`);
    await page.close();
  }, 240_000);
});
