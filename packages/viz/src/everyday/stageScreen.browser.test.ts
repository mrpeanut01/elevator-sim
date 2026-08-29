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
  openPage,
} from '../dev/browserTier.test-helper.js';
import { ACTION_BAR_ROWS } from './actionBar.js';
import { STAGE_SPEEDS } from './stageScreenModel.js';
import { REST_BAR_MIN_PX } from '../render/carRest.js';
import { EVERYDAY_COLORS } from './tokens.js';

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

/**
 * **The fastest rung, derived rather than counted** — three cases below press it so the clock moves
 * inside a twenty-second wait, and what they want is *the top of the ladder*, not a position.
 *
 * They were written as a literal `4`, which was the top of a five-rung ladder and stopped being the
 * top when GitHub issue #257 added two rungs below it. Nothing failed — index 4 is a real rung and
 * still moves the clock — which is the whole problem with a positional reference: it goes on
 * passing while it stops meaning what it said. Reading the length is the same move
 * `LEAVE_TOWER` above makes for a label.
 */
const TOP_SPEED_INDEX = STAGE_SPEEDS.length - 1;

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5210, strictPort: false },
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
 * A cold load, settled: `dev/main.ts` has booted and its own menu has been dismissed.
 *
 * The building is a parameter because the cutaway's geometry is a function of it — `vertical-city`
 * draws a car roughly nine times narrower than `garden-apartments` does, which is the size range
 * `docs/28-art-direction.md` § 5.2 names as the one where the door has to be checked. Every case
 * that does not care takes the default, which is what they all took before it was a parameter.
 */
async function coldLoad(buildingId = 'garden-apartments'): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
  await page.goto(`${origin}?building=${buildingId}&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/**
 * The stage canvas's own pixels, counted by colour — GitHub issue **#212**.
 *
 * `canvasHasPaint` below answers *did anything get drawn*. This answers *what*, and it is the only
 * instrument in this repository that can settle #212's first defect: whether a shut car reads as a
 * dark box with an amber doorway or as a solid amber block. Every other check in the tree looks at
 * the plan; this looks at the bitmap the plan produced, through a real 2D context, on the page a
 * player loads.
 *
 * Two readings, both structural rather than positional — nothing here needs to know where a car is:
 *
 * - **`count`**, exact-match pixels of each colour. Antialiased edges are blends and are counted as
 *   neither, which is the conservative direction: it under-counts both sides equally.
 * - **`tallestRun`**, the longest unbroken vertical run of each colour anywhere on the canvas. That
 *   is the **shape** reading, and it is what tells a shut door from a shut car: the defect painted
 *   amber over the car's whole interior height, and the fix confines it to a band under half of it.
 * - **`widestRun`**, the same reading turned ninety degrees, added for AD-S17. The rest bar is a
 *   *horizontal* mark whose whole magnitude channel is its length, so a vertical run says nothing
 *   about it: a 2.5 px bar and a 2.5 px smudge have the same `tallestRun` and mean different
 *   things. Both are kept rather than one generalised, because the two claims below need opposite
 *   axes and a single "longest run in any direction" would satisfy each of them by accident.
 */
async function canvasInk(
  page: Page,
  colors: readonly string[],
): Promise<
  readonly { readonly count: number; readonly tallestRun: number; readonly widestRun: number }[]
> {
  return page.evaluate((wanted) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.everyday-stage-canvas');
    const ctx = canvas?.getContext('2d') ?? null;
    if (canvas === null || ctx === null || canvas.width === 0) {
      return wanted.map(() => ({ count: 0, tallestRun: 0, widestRun: 0 }));
    }
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const targets = wanted.map((hex) => [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ]);
    const counts = targets.map(() => 0);
    const tallest = targets.map(() => 0);
    const widest = targets.map(() => 0);
    const runs = targets.map(() => new Array<number>(width).fill(0));
    const across = targets.map(() => 0);
    for (let y = 0; y < height; y += 1) {
      for (const [index] of targets.entries()) across[index] = 0;
      for (let x = 0; x < width; x += 1) {
        const at = (y * width + x) * 4;
        for (const [index, target] of targets.entries()) {
          const hit =
            data[at] === target[0] && data[at + 1] === target[1] && data[at + 2] === target[2];
          const column = runs[index] ?? [];
          if (hit) {
            counts[index] = (counts[index] ?? 0) + 1;
            const run = (column[x] ?? 0) + 1;
            column[x] = run;
            if (run > (tallest[index] ?? 0)) tallest[index] = run;
            const row = (across[index] ?? 0) + 1;
            across[index] = row;
            if (row > (widest[index] ?? 0)) widest[index] = row;
          } else {
            column[x] = 0;
            across[index] = 0;
          }
        }
      }
    }
    return targets.map((_unused, index) => ({
      count: counts[index] ?? 0,
      tallestRun: tallest[index] ?? 0,
      widestRun: widest[index] ?? 0,
    }));
  }, colors);
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

/**
 * The Everyday data host, reached from inside the page — `dailyLoop.browser.test.ts`'s idiom.
 *
 * Only the readings GitHub issue #215 is about: whether a run is on the stage, whether it is filed,
 * and which attempt at the day the week is counting. All three come off the product's own façade
 * rather than off a rendered string, because the sheet that prints the count is on another screen
 * and the claim is about the count itself.
 */
interface HostWindow {
  readonly __everydayHost?: {
    current():
      | {
          runState(): { readonly hasRun: boolean; readonly dayClosed: boolean };
          week(): { readonly attempt: number };
        }
      | undefined;
  };
}

/**
 * A token the #215 case parks on its document, so a page that was replaced under it says so.
 *
 * Named here rather than inlined because it is written in one place and read in another, and the
 * whole value of it is that the two spellings cannot drift.
 */
const ALIVE = '__stageCaseAlive';

/** One reading of {@link HostWindow}, or `null` while the shell has published no host. */
interface HostFacts {
  readonly hasRun: boolean;
  readonly dayClosed: boolean;
  readonly attempt: number;
}

/**
 * Read the host, publishing the handle first if this document has not got one.
 *
 * The re-publish is not belt: `dev/main.ts` rewrites the address bar with `replaceState` on every
 * state change, and a handle parked on `window` by a single `evaluate` is one page-level surprise
 * away from being gone — which is a **timeout with no facts in it**, the least useful failure a
 * browser case can produce. Asking for it every time costs one resolved module import.
 */
async function hostFacts(page: Page): Promise<HostFacts | null> {
  try {
    await page.evaluate(
      "window.__everydayHost ? true : import('/src/everyday/host.ts').then((module) => { window.__everydayHost = module.EVERYDAY_HOST; return true; })",
    );
    return await page.evaluate(() => {
      const current = (window as unknown as HostWindow).__everydayHost?.current();
      if (current === undefined) return null;
      const run = current.runState();
      return { hasRun: run.hasRun, dayClosed: run.dayClosed, attempt: current.week().attempt };
    });
  } catch {
    /*
     * *Execution context was destroyed* — the dev server reloading the page under the poll, which
     * is `docs/…` § D220's *"the one tier that can fail for reasons that are not about this
     * repository"* arriving as an exception in the middle of a reading. It is a **missing** reading,
     * not a false one, so it is reported as one and the caller polls again; a genuinely reloaded
     * page never satisfies {@link untilHost} and fails on its last reading instead of here.
     */
    return null;
  }
}

/**
 * Poll {@link hostFacts} until `wanted` holds, and hand back the last reading either way.
 *
 * `page.waitForFunction` would do the waiting and report a bare `TimeoutError`. The case below
 * waits **for a defect** as well as for a state, so both outcomes are ordinary results rather than
 * exceptions, and the reading that was actually on the page travels into the assertion message.
 */
async function untilHost(
  page: Page,
  wanted: (facts: HostFacts) => boolean,
  timeoutMs: number,
): Promise<{ readonly held: boolean; readonly last: HostFacts | null }> {
  const deadline = Date.now() + timeoutMs;
  let last: HostFacts | null = null;
  for (;;) {
    last = await hostFacts(page);
    if (last !== null && wanted(last)) return { held: true, last };
    if (Date.now() >= deadline) return { held: false, last };
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
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

    /*
     * § 4.6: the day opens at the player's default speed, which is `30×` until a setting exists.
     *
     * **The chip's words moved and the pacing did not** — GitHub issue #257 renamed this rung from
     * `1×` to `30×` because 30 simulated seconds per real second is what it has always run at, and
     * `1×` now names the true 1:1 rung at the bottom of the ladder. The multiplier this case is
     * about is unchanged; only the face of the button is. The pure half owns the *reason* the
     * default is 30 (`stageScreenModel.ts`); what is checked here is that the page opens on it.
     */
    const pressed = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.everyday-stage-speed')]
        .filter((button) => button.getAttribute('aria-pressed') === 'true')
        .map((button) => button.textContent),
    );
    expect(pressed).toEqual(['30×']);

    /* And the playhead was at the *start*: playing only ever takes the clock forward from it. */
    await page.click(`.everyday-stage-speed[data-speed-index="${String(TOP_SPEED_INDEX)}"]`);
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

  /**
   * **GitHub issue #212, defect 1 — settled on the pixels rather than on the plan.**
   *
   * The stage opens paused with every car standing and its doors shut, which is the state #212 is
   * about and the state a car is in for most of a run. The mount drew the two door leaves as
   * `((width − 3) / 2) × (1 − doorFraction)` from the body's outer edges, so at `doorFraction = 0`
   * each leaf was **half the body**, the pair covered the car completely, and the nine `paper`
   * occupancy marks then sat on `sun` at 1.83:1 — the ratio § D336 measured and refused for text on
   * this palette. *A shut car was a solid amber block.*
   *
   * Watched failing before it landed: on the tree that reported the issue, `garden-apartments`
   * opened with **more amber than ink** on the canvas and the tallest unbroken amber run was the
   * car's whole interior height. Both readings invert here, and both are needed —
   *
   * - the **counts**, because a fix that shrank the leaves without moving them would still leave
   *   the car mostly amber;
   * - the **runs**, because a fix that simply stopped drawing doors would pass a count test while
   *   removing the thing § 7.2 asks the picture to say. `sun` must still be on the canvas.
   *
   * Neither reading needs to know where a car is, which is why this case survives a geometry
   * change. What it asserts is the read: *dark boxes with amber doors*, not amber boxes.
   *
   * Driven on **two** buildings, because § 5.2's acceptance names the size range rather than a
   * building: `vertical-city` puts 35 cars across seven banks and draws a car roughly nine times
   * narrower than `garden-apartments` does, which is where an area-only difference would stop being
   * visible and where the plan's hairline branches live.
   */
  it.each(['garden-apartments', 'vertical-city'])(
    'draws a shut car on %s as a dark box with an amber doorway, not as a block of door',
    async (buildingId) => {
      const page = await coldLoad(buildingId);
      try {
        await enterEverydayStage(page);
        /* The opening frame, before `Start`: every car standing, every door shut. */
        expect(await page.isVisible('.everyday-stage-start')).toBe(true);
        expect(await canvasHasPaint(page)).toBe(true);

        const [ink, sun] = await canvasInk(page, [EVERYDAY_COLORS.ink, EVERYDAY_COLORS.sun]);
        if (ink === undefined || sun === undefined) throw new Error('two readings expected');
        /* Measured either side of the fix on `garden-apartments`, so the margins below are read as
           margins rather than as thresholds somebody chose: the defect drew **7 040** amber against
           **892** ink with the amber running the car's full 17 px interior; the fix draws **1 904**
           amber against **6 640** ink, with amber running 7 px against ink's 20. `vertical-city`'s
           whole picture is smaller — 220 amber against 1 338 ink, 2 px against 7 — which is the
           point of driving it: the same claim, three times less room to make it in. */

        /* The doors are drawn. A stage that had stopped drawing them would pass everything below. */
        expect(sun.count, 'the door leaves are still painted').toBeGreaterThan(0);
        /* The car's identity is its body: ink dominates the picture the cars are in. AD-S1. */
        expect(sun.count * 2, `${String(sun.count)} amber against ${String(ink.count)} ink`)
          .toBeLessThan(ink.count);
        /* And the amber is a band inside the car rather than its full height. AD-S2 / AD-S3. */
        expect(sun.tallestRun).toBeGreaterThan(0);
        expect(
          sun.tallestRun,
          `amber runs ${String(sun.tallestRun)} px against ink's ${String(ink.tallestRun)} px`,
        ).toBeLessThan(ink.tallestRun);
      } finally {
        await page.close();
      }
    },
  );

  /**
   * **AD-S17 — a lift that is standing still looks different from one that has just stopped.**
   *
   * `docs/35-problem-per-mode.md` § 3.2 states the defect as a claim about pixels: *"an idle car is
   * a stationary car with `direction === 0` and near-zero load — **pixel-identical** to any empty
   * car that happens to be stopped"*, and § 9.2 calls it the reason the product's most-used fault
   * family has no mark on the stage. A claim about pixels is settled on pixels or not at all, so
   * this case reads the canvas's backing store rather than a model's return value.
   *
   * ## The two frames it compares are the same picture
   *
   * Not *a resting car beside a moving one* — that comparison confounds the mark with everything
   * else that differs between two cars. The stage **opens paused at the day's own start hour** with
   * every lift standing in the lobby and none of them having moved yet, so at that instant the
   * cars have stood for **zero** seconds and carry no mark. Play the same day forward and the same
   * three lifts, in the same places, acquire one. The only thing that changed is *how long they
   * have been standing*, which is precisely the fact the mark exists to carry.
   *
   * ## What is asserted, and why it is a width
   *
   * `inkSoft` is drawn by nothing else in this cutaway — `carRest.test.ts` asserts that against the
   * whole of the ink list — so a pixel of it is a rest bar and nothing else. `widestRun` rather
   * than `count`, because the magnitude channel *is* the bar's length: a count would go up for a
   * smudge, and AD-A1's second channel is what makes the mark readable in greyscale.
   *
   * Watched failing first, with the two draw sites disabled: `expected 0 to be greater than 0`
   * against *"a lift that has stood for over half a minute carries a mark"*.
   */
  it('marks a lift that has been standing still, and marks nothing at the opening frame', async () => {
    const page = await coldLoad();
    try {
      await enterEverydayStage(page);

      /* The opening frame. Every car is standing and none has stood for any time at all. */
      expect(await page.isVisible('.everyday-stage-start')).toBe(true);
      const [opening] = await canvasInk(page, [EVERYDAY_COLORS.inkSoft]);
      expect(
        opening?.count,
        'at the day’s first instant no lift has been standing still for any length of time, ' +
          'so nothing may claim it has',
      ).toBe(0);

      /* The same day, played forward. `garden-apartments` is idle for most of its hour —
         `docs/35` § 9.3 measures the landings empty about 91 % of the time — so a lift standing
         past the 30 s onset is the ordinary state of this building rather than a contrived one. */
      const opened = await page.textContent('.everyday-stage-clock');
      await page.click(`.everyday-stage-speed[data-speed-index="${String(TOP_SPEED_INDEX)}"]`);
      await page.click('.everyday-stage-play');
      await page.waitForFunction(
        (from) => document.querySelector('.everyday-stage-clock')?.textContent !== from,
        opened,
        { timeout: 20_000 },
      );

      /*
       * Sampled rather than waited on, and the difference is what the failure says. A
       * `waitForFunction` over the pixels reports a *timeout* when the mark is gone, which names
       * the harness rather than the product; twenty samples and then an assertion reports
       * *"a lift that has stood for over half a minute carries a mark: expected 0 to be greater
       * than 0"*, which names the thing that broke. Watched failing exactly that way with the two
       * draw sites deleted.
       *
       * Twenty is generous rather than tuned: at the top rung a lift crosses the 30 s onset inside
       * the first frame, so the loop normally leaves on its first reading.
       */
      let resting = (await canvasInk(page, [EVERYDAY_COLORS.inkSoft]))[0];
      for (let sample = 0; sample < 20 && (resting?.count ?? 0) === 0; sample += 1) {
        await page.waitForTimeout(150);
        resting = (await canvasInk(page, [EVERYDAY_COLORS.inkSoft]))[0];
      }
      await page.click('.everyday-stage-play');

      expect(
        resting?.count,
        'a lift that has stood for over half a minute carries a mark',
      ).toBeGreaterThan(0);
      /* A **bar**, not a speck: the length is the whole of the magnitude channel, so a mark
         narrower than the floor `restBarWidthPx` guarantees would be unreadable as a duration. */
      expect(
        resting?.widestRun,
        `the mark is ${String(resting?.widestRun ?? 0)} px wide; the floor is ${String(REST_BAR_MIN_PX)}`,
      ).toBeGreaterThanOrEqual(REST_BAR_MIN_PX);
      /* And it is a horizontal mark rather than a blob, which is what puts it in the arrows'
         family — up, down, and a flat bar for neither. */
      expect(resting?.widestRun ?? 0).toBeGreaterThan(resting?.tallestRun ?? 0);
    } finally {
      await page.close();
    }
  });

  it('plays, and the clock moves', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);
    /* The top rung, so a second of real time is ten minutes of the day — the transport, not a
       metric. */
    await page.click(`.everyday-stage-speed[data-speed-index="${String(TOP_SPEED_INDEX)}"]`);
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
    await page.click(`.everyday-stage-speed[data-speed-index="${String(TOP_SPEED_INDEX)}"]`);
    await page.click('.everyday-stage-play');
    await page.waitForFunction(
      (from) => document.querySelector('.everyday-stage-clock')?.textContent !== from,
      opened,
      { timeout: 20_000 },
    );
    await page.click('.everyday-stage-play');

    /*
     * **Read the clock only once it has stopped moving, and the difference is a CI failure.**
     *
     * Pausing is a request, not an instant: the click lands, and whatever frame was already in
     * flight still draws. At `TOP_SPEED_INDEX` — 600× — the clock advances a **simulated minute
     * every ~100 ms of real time**, so a single late frame between the click and this read captures
     * a `before` the transport has already left behind. The assertion at the end then compares the
     * post-intervention clock against a value that was never stable, and fails by exactly one
     * minute.
     *
     * That is what `suite (linux)` reported on this branch: *expected '08:32' to be '08:31'*. It
     * passes on an idle machine and fails on a loaded runner, which is why it survived until a
     * wave added a `vite build` to this tier (`everyday/builtBundle.browser.test.ts`) and put two
     * more cores of contention beside it.
     *
     * 300 ms is chosen against the speed rather than picked: at 600× it is three simulated minutes,
     * so a transport that is still running cannot produce two equal reads across it. The assertion
     * below is unchanged and is **stronger** for this — it now compares against a clock that was
     * genuinely at rest.
     */
    const before = await page
      .waitForFunction(
        () => {
          const read = (): string =>
            document.querySelector('.everyday-stage-clock')?.textContent ?? '';
          const first = read();
          return new Promise<string | false>((resolve) => {
            setTimeout(() => resolve(read() === first && first !== '' ? first : false), 300);
          });
        },
        undefined,
        { timeout: 30_000 },
      )
      .then(async (handle) => (await handle.jsonValue()) as string);

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
   * **#206's other half, in the one state that still shows it.**
   *
   * The daily strip's fourth stop is the report, and on a stage at step 3 it evaluated `4 <= 3`:
   * faint, `disabled` and carrying **no listener at all**, in every state, by construction. A day
   * filed under the player — `dev/main.ts` files one whose playhead has run out — is the state in
   * which that stop has a written sheet behind it and is still not the step the flow has reached.
   * It is now the next stop with something to read, so it is a way to the account of the day, and
   * filed this way it is the only way to it from here.
   *
   * **The unfiled state is now a `<span>` rather than a `<button disabled>`**, and the assertions
   * are indexed by the stop's own words rather than by position in the strip — both because of
   * GitHub issue #262's sweep, which stopped drawing an unreachable breadcrumb stop as a control
   * at all. A stop indexed by `nth(3)` was a stop identified by *how many buttons precede it*,
   * which is a number that moves when a different stop lights. What #206 needs asserted is
   * unchanged and is now said directly: before the file there is no way here, and after it there
   * is a button with these words that goes to the sheet.
   */
  it('lights the report stop once the day behind it is filed, and it goes there', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);
    const strip = page.locator('.everyday-bar-timeline');
    /* Unfiled: the sheet does not exist yet, so the stop is text and there is no way to press it. */
    expect(await strip.locator('button', { hasText: '4 How it went' }).count()).toBe(0);
    expect(await strip.textContent()).toContain('4 How it went');

    await page.evaluate(
      "import('/src/everyday/host.ts').then((module) => { module.EVERYDAY_HOST.current()?.closeDay(); return true; })",
    );
    const stop = strip.locator('button', { hasText: '4 How it went' });
    await stop.waitFor({ state: 'visible', timeout: 30_000 });
    expect(await stop.isDisabled()).toBe(false);

    await stop.click();
    await page.waitForSelector('.everyday-report', { timeout: 15_000 });
    expect(await page.locator('.everyday-report-empty').count()).toBe(0);
    await page.close();
  });

  /**
   * **A filed day is not silently re-run by walking back onto its stage** — GitHub issue **#215**.
   *
   * The sheet read *"attempt 4 at this day"* to a player who had pressed *Run* once. The issue
   * blamed navigation; navigation is not it — § D232 closed that path, and `dev/main.ts:3386`
   * guards the report tab with a `closeShift` that returns early on `filedRunId`. The count
   * increments in exactly one place (`shift/week.ts#closeDay`) and it is honest about what it
   * counts: **closes**. What was dishonest is the run underneath it.
   *
   * `mount` asked for a day whenever `runState().open` was false, and a filed day is not open — so
   * re-entering the stage after a close started a **new** run. `dev/state.ts` does not re-roll the
   * seed, so that run is bit-identical to the one just filed; `adopt` clears `filedRunId`, which
   * re-arms the filing gate; and `dev/main.ts`'s tick files it when its playhead runs out, behind
   * the Everyday cover. Report → *‹ The day* → wait is *attempt 2* with the player having asked
   * for nothing and nothing having changed. A bit-identical re-simulation is not an attempt.
   *
   * ## Nothing below presses *Close the day* twice, and that is the point
   *
   * A player who presses the primary a second time **has** made a second attempt — § D223's own
   * correction, which `week.test.ts` pins. The walk below is navigation only: file once, go to the
   * sheet, come back on `‹ The day`, and wait. Everything the count does after that, it does with
   * nobody asking.
   *
   * ## The second wait is a wait for a defect, and it is meant to run out
   *
   * There is no event for *a run that was never started*, so the green path is the absence of one.
   * Timing out is the pass, and the assertion is on the last reading rather than on the timeout, so
   * a red run says which fact was wrong instead of only that a clock expired.
   */
  it('does not re-run a filed day when the stage is re-entered, so the attempt count holds', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);

    /*
     * File the day through the data host — the idiom two cases above this one use, for their stated
     * reason: one deterministic step rather than a press whose timing depends on the mount. It is
     * also the call `dev/main.ts`'s tick makes when a playhead runs out under a watching player,
     * and the attempt it books is 1 by either route.
     *
     * This case drove the ×60 transport to the end of the day instead while it was being written,
     * which is the route the reporter walked and which reproduces the same way. It is not what
     * shipped: sixty seconds of real playback per run is sixty seconds in which the dev server can
     * reload the page underneath the poll, and the finding here is about re-**entry**, not about
     * how the day came to be filed.
     */
    await page.evaluate(
      "import('/src/everyday/host.ts').then((module) => { module.EVERYDAY_HOST.current()?.closeDay(); return true; })",
    );
    const filed = await untilHost(page, (facts) => facts.dayClosed, 60_000);
    expect(filed.last, 'the day never filed').toEqual({
      hasRun: true,
      dayClosed: true,
      attempt: 1,
    });

    await page.evaluate(`window.${ALIVE} = true`);

    /* The daily strip's fourth stop, lit by the file above — #206's route to the sheet. Named by
       its words rather than by position: since GitHub issue #262's sweep only a *live* stop is a
       button, so an index into the strip's buttons is an index into a list that changes length. */
    await page.locator('.everyday-bar-timeline button', { hasText: '4 How it went' }).click();
    await page.waitForSelector('.everyday-report', { timeout: 15_000 });

    /* § 3.3's report row names its linear parent `‹ The day`, and #206 made that cell a second way
       onto this mount. It is the route the reporter walked. */
    expect(await page.textContent('.everyday-bar-back')).toBe('‹ The day');
    await page.click('.everyday-bar-back');
    await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });

    /*
     * The wait for the defect, and it is meant to run out. `dayClosed` going false is `adopt`
     * taking on a run nobody asked for, and it is the whole mechanism at its first observable
     * instant — the re-simulation is off a worker and lands in a second or two, so thirty is a
     * window with an order of magnitude in hand rather than a guess.
     *
     * `attempt` is polled beside it and is the count the sheet prints. It moves one step later than
     * `dayClosed` does and by a different hand — the re-armed gate is what lets a **second close**
     * count, whether that close is the tick's or a player pressing a primary that has quietly
     * become pressable again. Asserting both says which half is broken when this goes red.
     */
    const reRan = await untilHost(page, (facts) => !facts.dayClosed || facts.attempt >= 2, 15_000);

    /*
     * A reload takes {@link ALIVE} with it, and would otherwise satisfy the poll above by the back
     * door: a freshly booted page has an unfiled run on it, which reads exactly like the defect.
     * Vite full-reloads every connected page when anything under `packages/viz` is written, so this
     * is a live hazard in a shared tree rather than a theoretical one — and it must fail as *the
     * page was replaced*, never as *the product re-ran a filed day*.
     */
    expect(
      await page.evaluate(`window.${ALIVE} === true`),
      'the page reloaded under this case — the reading below is from a different sitting',
    ).toBe(true);
    expect(reRan.last, 're-entering a filed day started a run nobody asked for').toEqual({
      hasRun: true,
      dayClosed: true,
      attempt: 1,
    });
    expect(reRan.held).toBe(false);

    /*
     * And what the player sees, which is the other half of the same fact: § 3.3's primary stays
     * inert over a filed day, saying so. Pre-fix it came back to life as a pressable *Close the
     * day* over a bit-identical re-simulation — which is how a count that means *attempts* reaches
     * four on a day that was run once.
     */
    expect(await page.locator('.everyday-bar-primary').isDisabled()).toBe(true);
    expect(await page.textContent('.everyday-bar-note')).toBe(
      'the day is filed — its report is written',
    );
    await page.close();
  }, 300_000);

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

/* -------------------------------------------------------------------------- *
 * The canvas is sized from the viewport — GitHub issue #303
 * -------------------------------------------------------------------------- */

/**
 * **The height derives from the viewport, and a reintroduced literal fails here** — issue #303,
 * § D391.
 *
 * `viewportGates.browser.test.ts` owns the *clause*: it measures the canvas against
 * `docs/31-support-matrix.md` § 2's 60 % floor at the three widths the matrix names, and its
 * register is what went from three clause-2 entries to none. This file owns the *mechanism*, and
 * the two are deliberately not the same assertion.
 *
 * A gate written only against the floor is satisfied by a literal that happens to clear it — before
 * this fix the 375×667 cell read **51.0 %**, and a `height:420px` would have read 63.0 % there and
 * passed a floor-only check while failing at 1280×800 all over again. What § 2 actually needs is
 * that the height **is a function of the viewport**, and the only way to see a function is to
 * change its input.
 *
 * So this changes the input: one page, one mounted stage, two viewport heights, and the canvas's
 * own box read at each. Both readings must clear 60 %, and — the half a literal cannot survive —
 * the two must **differ**, in the direction the viewport moved. That is § D177's standing
 * requirement pointed at a layout constant instead of at a slider: move the thing, require the
 * output to change.
 *
 * The inline declaration is asserted beside the measurement rather than instead of it. A measured
 * pair alone would also pass for a JavaScript resize handler that recomputed pixels per frame,
 * which is the shape `sizeCanvas`'s own docstring and `index.html:1541` both refuse — a height that
 * feeds back into the bitmap it is measured from.
 */
describe.skipIf(!HAS_BROWSER)('the stage canvas is sized from the viewport — issue #303', () => {
  it('tracks viewport height at two heights, and clears § 2’s floor at both', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);
    await page.waitForSelector('.everyday-stage-canvas');

    /** The canvas's laid-out height and the viewport's, read in one evaluation. */
    const readAt = async (height: number): Promise<{ canvasPx: number; viewportPx: number }> => {
      await page.setViewportSize({ width: 1_280, height });
      /* One frame for the resize to lay out and for the stage's own `resize` listener to re-size
         the bitmap — the same settle every case in this file takes after a viewport move. */
      await page.waitForTimeout(400);
      return page.evaluate(() => ({
        canvasPx: document.querySelector('.everyday-stage-canvas')?.getBoundingClientRect().height ?? 0,
        viewportPx: document.documentElement.clientHeight,
      }));
    };

    const short = await readAt(700);
    const tall = await readAt(1_000);

    // Non-vacuity: a stage that never mounted reads 0 and would satisfy every ratio below.
    expect(short.canvasPx, 'the stage canvas has no box at 1280×700').toBeGreaterThan(0);
    expect(tall.canvasPx, 'the stage canvas has no box at 1280×1000').toBeGreaterThan(0);

    /*
     * The clause, at both heights. `docs/31-support-matrix.md` § 2 — *"keeps the stage canvas at
     * 60 % or more of the viewport height"*.
     */
    expect(short.canvasPx / short.viewportPx, '1280×700 is under § 2’s 60 % floor').toBeGreaterThanOrEqual(0.6);
    expect(tall.canvasPx / tall.viewportPx, '1280×1000 is under § 2’s 60 % floor').toBeGreaterThanOrEqual(0.6);

    /*
     * And the half that a fixed pixel height cannot survive. `340px` — or any literal — reads the
     * same number at both viewports and fails right here, which is issue #303's second acceptance
     * criterion stated as a run rather than as a rule.
     */
    expect(
      tall.canvasPx,
      'the canvas is the same height at 1280×700 and at 1280×1000, so it is not derived from the ' +
        'viewport — a fixed pixel height has been reintroduced on .everyday-stage-canvas',
    ).toBeGreaterThan(short.canvasPx);
    await page.close();
  }, 240_000);

  it('declares its height in a viewport unit, not in pixels', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);
    await page.waitForSelector('.everyday-stage-canvas');
    /* The inline declaration rather than the computed value: `getComputedStyle` resolves every
       length to pixels, so it cannot tell `60vh` from `480px` and would assert nothing here. */
    const declared = await page.evaluate(
      () => document.querySelector<HTMLElement>('.everyday-stage-canvas')?.style.height ?? '',
    );
    expect(declared, 'the stage canvas declares no height at all').not.toBe('');
    expect(
      declared,
      `the stage canvas declares height:${declared} — a pixel literal cannot track the viewport, ` +
        'which is what docs/31-support-matrix.md § 2 commits to. See issue #303 and § D391.',
    ).not.toMatch(/px\s*$/u);
    expect(declared).toMatch(/v(h|min|max)\s*$/u);
    await page.close();
  }, 240_000);
});
