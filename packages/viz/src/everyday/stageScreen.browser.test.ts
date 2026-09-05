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
async function coldLoad(buildingId = 'garden-apartments', dispatcherId?: string): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
  /*
   * The dispatcher is a parameter for the ghost case below and for nothing else, and it is a
   * parameter rather than a constant because *which* dispatcher drives decides whether the race
   * that case runs is a race at all — see `RACE` for the measurement that made it necessary.
   */
  const driver = dispatcherId === undefined ? '' : `&dispatcher=${dispatcherId}`;
  await page.goto(`${origin}?building=${buildingId}&seed=424242${driver}`, { waitUntil: 'load' });
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

  /**
   * **§ 7.6's second arm, pressed on the page** — GitHub issue **#171**.
   *
   * The pure half of this control is `stageScreenModel.test.ts`'s and the run it produces is
   * `stageHandover.test.ts`'s — legs before the stamp byte-identical, the day after it moved. What
   * needs a document is the thing neither can vouch for: that the picker and the button are wired to
   * *each other* and to the host, so the profile a player selects is the profile the record grows.
   *
   * The picker opens on the dispatcher the player has standing, which is a press that may well move
   * nothing — so the case selects somebody else first and requires the button to come alive. That
   * ordering is the assertion: a button that was already enabled would mean the model's refusal was
   * not reaching the DOM, and a button that stayed disabled after the pick would mean the picker was
   * not reaching the model.
   */
  it('hands the day to another dispatcher, and stamps who took it', async () => {
    const page = await coldLoad();
    await enterEverydayStage(page);

    const SWITCH = '.everyday-stage-intervene[data-intervention-kind="switch-dispatcher"]';
    await page.waitForSelector('.everyday-stage-switch-pick', { timeout: 30_000 });
    /* The standing dispatcher is what the picker opens on — § 7.6's own *who is driving*. */
    const standing = await page.evaluate(
      "(document.querySelector('.everyday-stage-switch-pick')).value",
    );
    const other = (await page.evaluate(
      "Array.from(document.querySelectorAll('.everyday-stage-switch-pick option')).map((o) => o.value)",
    )) as readonly string[];
    const handTo = other.find((value) => value !== standing) ?? '';
    expect(handTo).not.toBe('');

    /*
     * Dead first, and this half is the one that would go quietly missing. On a cold load the picker
     * names the dispatcher the day is already running, so the model refuses the press — and a button
     * that arrived enabled would mean that refusal never reached the DOM.
     */
    expect(await page.getAttribute(SWITCH, 'disabled')).not.toBe(null);
    /* § 7.6's fourth rule: it *says so*, in the refusal line, rather than only in a tooltip. */
    expect(await page.textContent('.everyday-stage-intervene-refusal')).toContain(
      'already running',
    );

    await page.selectOption('.everyday-stage-switch-pick', handTo);
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.hasAttribute('disabled') === false,
      SWITCH,
      { timeout: 30_000 },
    );
    /* And the sentence goes with the refusal — a line about a control that can now act is § D227. */
    expect(await page.textContent('.everyday-stage-intervene-refusal')).toBe('');
    const label = (await page.textContent(SWITCH)) ?? '';
    expect(label.startsWith('Switch to ')).toBe(true);

    await page.click('.everyday-stage-play');
    await page.click(SWITCH);
    /*
     * § 7.6: the stamp is what says the record grew, and it names the profile rather than its id —
     * a player hands the day to somebody, not to a key in a data file.
     */
    await page.waitForFunction(
      () =>
        (document.querySelector('.everyday-stage-stamp')?.textContent ?? '').includes(
          'switched to ',
        ),
      undefined,
      { timeout: 60_000 },
    );
    const stamp = (await page.textContent('.everyday-stage-stamp')) ?? '';
    expect(stamp).toContain(label.replace('Switch to ', 'switched to '));
    expect(stamp).not.toContain(handTo);
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
 * § 7.4's race — GitHub issue #226, § D482
 * -------------------------------------------------------------------------- */

/** One reading of the race, taken off the product's own façade and its own drawn lanes. */
interface RaceFacts {
  readonly pick: string;
  readonly pending: boolean;
  readonly refusal: string | null;
  /** The dispatcher each recording says served it — the attribution, from the record. */
  readonly mineId: string | null;
  /** The **player's** run id, so a rival can be told from a re-run — see the case's own note. */
  readonly mineRunId: string | null;
  /** `runState().open` — the player's own, chosen, unclosed day is the one on the stage. */
  readonly runOpen: boolean;
  readonly rivalId: string | null;
  /** Whether every arrival matches, leg for leg: who, when, from where, to where. */
  readonly crowdMatches: boolean | null;
  /** Whether the *service* of that crowd differs: boarded, alighted, in which car. */
  readonly serviceDiffers: boolean | null;
  /** The two lanes' `points`, as drawn. `''` is a line that is not there. */
  readonly youPoints: readonly string[];
  readonly ghostPoints: readonly string[];
  readonly keyText: string;
  readonly noteText: string;
  readonly footerText: string;
}

/**
 * Read the race off the page — the façade's own `ghostRace()`, and the polylines it produced.
 *
 * The fingerprints are computed **in the page** rather than shipped out, because a `VizRecording`
 * is megabytes and two of them would cross the CDP boundary on every poll. What crosses is two
 * booleans, and the strings they were computed from never leave the browser.
 *
 * `hostFacts`' idiom, including its `try`: a reading taken while the dev server reloads the page is
 * a **missing** reading rather than a false one, and the caller polls again.
 */
async function raceFacts(page: Page): Promise<RaceFacts | null> {
  try {
    await page.evaluate(
      "window.__everydayHost ? true : import('/src/everyday/host.ts').then((module) => { window.__everydayHost = module.EVERYDAY_HOST; return true; })",
    );
    return await page.evaluate(() => {
      interface Leg {
        readonly passengerId: string;
        readonly arrivedAt: number;
        readonly originFloorId: string;
        readonly destinationFloorId: string;
        readonly boardedAt?: number | undefined;
        readonly alightedAt?: number | undefined;
        readonly carId?: string | undefined;
      }
      interface Rec {
        readonly runId: string;
        readonly dispatcherProfileId: string;
        readonly legs: readonly Leg[];
      }
      const host = (
        window as unknown as {
          __everydayHost?: {
            current():
              | {
                  runState(): { readonly open: boolean };
                  recording(): Rec | undefined;
                  ghostRace(): {
                    pick: string;
                    rival: Rec | undefined;
                    refusal: string | undefined;
                    pending: boolean;
                  };
                }
              | undefined;
          };
        }
      ).__everydayHost?.current();
      if (host === undefined) return null;
      const race = host.ghostRace();
      const mine = host.recording();
      const rival = race.rival;
      /* The crowd: who arrived, when, and where they were going. Equal ⇒ common random numbers. */
      const crowd = (rec: Rec): string =>
        rec.legs
          .map(
            (leg) =>
              `${leg.passengerId}|${String(leg.arrivedAt)}|${leg.originFloorId}|${leg.destinationFloorId}`,
          )
          .join(';');
      /* The service of it: what the dispatcher did. Different ⇒ the race is a real comparison. */
      const service = (rec: Rec): string =>
        rec.legs
          .map(
            (leg) =>
              `${leg.passengerId}|${String(leg.boardedAt ?? -1)}|${String(leg.alightedAt ?? -1)}|${leg.carId ?? ''}`,
          )
          .join(';');
      const points = (selector: string): readonly string[] =>
        [...document.querySelectorAll(selector)].map((node) => node.getAttribute('points') ?? '');
      return {
        pick: race.pick,
        pending: race.pending,
        refusal: race.refusal ?? null,
        mineId: mine?.dispatcherProfileId ?? null,
        mineRunId: mine?.runId ?? null,
        runOpen: host.runState().open,
        rivalId: rival?.dispatcherProfileId ?? null,
        crowdMatches:
          mine === undefined || rival === undefined ? null : crowd(mine) === crowd(rival),
        serviceDiffers:
          mine === undefined || rival === undefined ? null : service(mine) !== service(rival),
        youPoints: points('.everyday-stage-lane-you'),
        ghostPoints: points('.everyday-stage-lane-ghost'),
        keyText: document.querySelector('.everyday-stage-race-key')?.textContent ?? '',
        noteText: document.querySelector('.everyday-stage-race-note')?.textContent ?? '',
        footerText: document.querySelector('.everyday-stage-race-footer')?.textContent ?? '',
      };
    });
  } catch {
    return null;
  }
}

/** {@link untilHost}'s shape for the race: poll, and hand back the last reading either way. */
async function untilRace(
  page: Page,
  wanted: (facts: RaceFacts) => boolean,
  timeoutMs: number,
): Promise<{ readonly held: boolean; readonly last: RaceFacts | null }> {
  const deadline = Date.now() + timeoutMs;
  let last: RaceFacts | null = null;
  for (;;) {
    last = await raceFacts(page);
    if (last !== null && wanted(last)) return { held: true, last };
    if (Date.now() >= deadline) return { held: false, last };
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
}

/**
 * **The moved-control case for the ghost picker, and it is the case that decides GitHub issue
 * #226** — [§ D482](../../../../DECISIONS.md).
 *
 * ## Why it is here and not in a node tier
 *
 * `CLAUDE.md`'s standing requirement is *move the control and require the run to change, compared on
 * the legs rather than on a window statistic*, and the eleven dead seams it was written from all
 * passed every isolated check they had. `dev/ghostRun.ts#ghostPlanOf` is unit-tested on the legs
 * already and has been since slice 4d — it was never the part that was missing. What was missing was
 * the **wire**: the shell's façade exposed no second recording, so a picker on this screen could
 * have been drawn, styled, wired to a listener and bound to nothing, and every node test in this
 * repository would have stayed green. So the control is pressed on the shipped page, through the
 * player's own `<select>`, and what is asserted is the recording that came back.
 *
 * ## The comparison, in the two halves the issue actually turns on
 *
 * - **The same crowd** — `crowdMatches`. Asserted on the *legs* and not on the seed: every arrival
 *   in the rival's day is the same passenger, at the same second, from the same floor, to the same
 *   floor. Two runs can share a seed and meet different crowds if anything upstream of the demand
 *   stream differs, so a seed comparison would be assuming exactly what CLAUDE.md's common-random-
 *   numbers rule wants proved.
 * - **A different service of it** — `serviceDiffers`. Who boarded when, in which car, and when they
 *   got out. This is the half an inert control cannot fake: with no rival there is nothing to
 *   compare, and with a rival that is secretly your own configuration the strings are equal.
 *
 * ## Why the day is driven by `eta` rather than by the default
 *
 * Measured, not assumed: a fresh shift opens on `collective` and *the plain baseline* **is**
 * `collective`, so at the defaults the rival's recording comes back byte-identical to the primary's
 * — one day drawn twice. That is a real state and the product now says so in words
 * (`live/raceStrip.ts#SAME_RUN_NOTE`), and it is useless for this case, because identical lines are
 * exactly what an inert control also produces. So the primary is deep-linked onto a different
 * dispatcher, which makes the two runs genuinely different and makes the assertion mean something.
 *
 * The `none` leg at the end is the other half of § D177's rule: moving the control **back** must take
 * the second line off the lanes, or the strip is drawing a rival nobody asked for.
 */
describe.skipIf(!HAS_BROWSER)('the § 7.4 race — issue #226', () => {
  it('races a second dispatcher over the same crowd, and the legs say it is a real comparison', async () => {
    const page = await coldLoad('midtown-office', 'eta');
    await enterEverydayStage(page);

    /*
     * **Wait for the player's *own* day before touching anything, and this is not tidiness.**
     *
     * `enterEverydayStage` returns when a canvas has a box and a clock reads — which boot's demo run
     * satisfies (§ D232: a full demo shift runs before anybody chooses anything). The player's own
     * run is started on the way in and lands later. Pressing the picker in that window produces a
     * rival, honestly, but of a **different primary**: `setGhostPick` declines to schedule while a
     * primary is in flight, and `runShift`'s own delivery callback then races the pick when the new
     * run arrives. The rival is real and the press did not cause it, which is precisely the
     * distinction the `mineRunId` assertion below exists to draw — so the wait has to happen first
     * or that assertion is a coin toss. `runState().open` is the product's own answer to *is the
     * player's chosen, unclosed day the one on this stage*.
     */
    const settled = await untilRace(page, (facts) => facts.runOpen, 120_000);
    expect(settled.held, `the player’s own day never opened: ${JSON.stringify(settled.last)}`).toBe(
      true,
    );

    /* The picker opens on *nobody*, which is the free pick: no second request is ever issued. */
    expect(await page.inputValue('.everyday-stage-ghost')).toBe('none');
    const before = await raceFacts(page);
    expect(before?.pick).toBe('none');
    expect(before?.rivalId).toBeNull();
    /* No rival, no line. A strip that drew one here would be inventing one. */
    expect(before?.ghostPoints.every((points) => points === '')).toBe(true);
    expect(before?.youPoints.some((points) => points !== '')).toBe(true);
    /* §7.4's footer is permanent and is already up before any race — it is not a result banner. */
    expect(before?.footerText).toBe('One day each on the same crowd. That is a race, not proof.');

    /* The press: the player's own control, and nothing else. */
    await page.selectOption('.everyday-stage-ghost', 'plain-baseline');
    const raced = await untilRace(page, (facts) => facts.rivalId !== null, 180_000);
    expect(
      raced.held,
      `no rival recording reached the shell: ${JSON.stringify(raced.last)}`,
    ).toBe(true);
    const after = raced.last;
    if (after === null) throw new Error('unreachable: held implies a reading');

    /* Correctly attributed, from each record rather than from the control that asked for it. */
    expect(after.mineId).toBe('eta');
    expect(after.rivalId).toBe('collective');
    expect(after.refusal).toBeNull();

    /*
     * **The rival came from the press, and not from a run that happened to land afterwards.**
     *
     * This clause was added because the inert-control rehearsal below found the hole. Replacing the
     * binding's body with a bare `ghostPick = pick` — the dead-seam shape, typed and called and
     * commissioning nothing — still produced a rival here, because `runShift`'s own delivery callback
     * races whatever `ghostPick` says when the **primary** lands, and on this walk a primary can land
     * after the press. The first half of the case went green over a port that did nothing.
     *
     * So the player's own run is pinned by id across the press. Same run before and after ⇒ nothing
     * re-ran, and the only thing that changed was the control.
     */
    expect(
      after.mineRunId,
      'the player’s own day was re-run across the press, so this rival is not attributable to it',
    ).toBe(before?.mineRunId);

    /* Common random numbers, proved on the legs: the same people, at the same seconds. */
    expect(after.crowdMatches, 'the rival met a different crowd — this is not a race').toBe(true);
    /* …and the dispatchers did different things with them, which is the run having changed. */
    expect(after.serviceDiffers, 'the rival served the crowd identically — the control is inert').toBe(
      true,
    );

    /*
     * **Then the drawn state, waited for separately — and the separation is not fussiness.**
     *
     * The façade reports the rival the instant the worker result lands; the lanes are drawn on the
     * notification that follows. A single poll on `rivalId !== null` therefore catches the page
     * mid-way often enough to matter — it did, on the second run of this case, with the host
     * holding a rival and the polylines still empty. So the two readings are taken separately, and
     * each wait is for *the page to catch up*, never for the property being asserted.
     */
    const shown = await untilRace(
      page,
      (facts) => facts.ghostPoints.every((points) => points !== ''),
      30_000,
    );
    expect(shown.held, `the rival never reached the lanes: ${JSON.stringify(shown.last)}`).toBe(true);
    const lanes = shown.last;
    if (lanes === null) throw new Error('unreachable: held implies a reading');
    /* Two lanes, both carrying the rival, named by the option the player picked. */
    expect(lanes.ghostPoints.length).toBe(2);
    expect(lanes.keyText).toContain('the plain baseline');
    expect(lanes.noteText).toBe('same crowd both runs — the gap is your change, not the morning');

    /*
     * **Distinguishable — but only once the day has actually been watched, and the first draft of
     * this case got that wrong in an instructive way.**
     *
     * § 7.3 opens the stage **paused at the day's own start hour**, and `raceSamplesOf` plots only
     * up to the playhead, so at the opening frame both lines are the single point `0.0,46.0`:
     * nobody has arrived, in either run. Asserting the lines differ there failed against a correct
     * product — two runs of one crowd genuinely are identical before the crowd exists.
     *
     * **And a line is not enough either, which is why this case races `midtown-office`.** The second
     * draft ran the default building and played the whole day: sixteen samples, every one of them
     * flat on the floor, in *both* runs. `garden-apartments` at its shift demand simply has nobody
     * mid-wait when the four-minute grid falls, so the strip draws two flat lines whatever the
     * dispatchers did — measured, and a fact about the building rather than about the race. Two
     * dispatchers can only draw different lines about a crowd once there is one on screen.
     *
     * So the day is played at the top of the speed ladder until the player's own waiting lane has
     * **shape**: more than one distinct height, which is somebody standing at a sample.
     *
     * The wait is on **the player's** series alone, never on the two differing. Waiting for the
     * difference would be waiting for the assertion to come true, and an inert control would then
     * report a timeout rather than a failure — which is the least useful way for this case to fail.
     */
    const hasShape = (points: string | undefined): boolean =>
      new Set((points ?? '').split(' ').map((pair) => pair.split(',')[1])).size > 1;
    await page.click(`.everyday-stage-speed[data-speed-index="${String(TOP_SPEED_INDEX)}"]`);
    await page.click('.everyday-stage-play');
    const played = await untilRace(page, (facts) => hasShape(facts.youPoints[0]), 180_000);
    expect(
      played.held,
      `no crowd ever stood in the player’s own day: ${String(played.last?.youPoints[0])}`,
    ).toBe(true);
    const drawn = played.last;
    if (drawn === null) throw new Error('unreachable: held implies a reading');
    expect(drawn.rivalId).toBe('collective');
    for (const [lane, points] of drawn.ghostPoints.entries()) {
      expect(points, `lane ${String(lane)} drew the rival exactly over the player`).not.toBe(
        drawn.youPoints[lane],
      );
    }

    /*
     * **The caution survives the race arriving**, which is this issue's third acceptance bullet and
     * is a statistics rule wearing a copy hat: one day each is n = 1, and CLAUDE.md forbids calling
     * one dispatcher better than another without a paired-t interval that excludes zero. So the
     * footer is unchanged and unconditional, and the verdict slot may not carry an ordering verb
     * about a *dispatcher* — `live/raceStrip.ts#raceVerdictOf` says *ahead by N points* about two
     * observed percentages and names neither driver, which is what keeps it a reading.
     */
    expect(drawn.footerText).toBe('One day each on the same crowd. That is a race, not proof.');
    const verdict = (await page.textContent('.everyday-stage-verdict')) ?? '';
    expect(verdict).not.toMatch(/better|worse|wins|beat|proof/iu);

    /*
     * And back: *nobody* takes the second line off, or the strip keeps a rival nobody asked for.
     *
     * **All three clauses are in the predicate rather than asserted off the snapshot**, and that is
     * a strengthening rather than a convenience. `untilRace` returns the first snapshot on which
     * its predicate holds; waiting on `rivalId === null` alone and then reading `ghostPoints` off
     * that snapshot asserts a property of a frame chosen by a *different* condition. The rival id
     * and the drawn points are cleared by the same redraw, so under load the id can be observed
     * cleared a frame before the points are — which is exactly what happened on the integrated
     * tree, where this case failed beside two corpus measurements and passed alone. Requiring the
     * three to hold **together on one frame** is the real product property and it is the stronger
     * claim: before, only the id had to be observed at all.
     */
    await page.selectOption('.everyday-stage-ghost', 'none');
    const cleared = await untilRace(
      page,
      (facts) =>
        facts.rivalId === null &&
        facts.ghostPoints.every((points) => points === '') &&
        facts.keyText === '',
      30_000,
    );
    expect(
      cleared.held,
      `the rival outlived the pick, or its line and key did not clear with it: ${JSON.stringify(cleared.last)}`,
    ).toBe(true);
    await page.close();
  }, 300_000);

  /**
   * **The refusing arm, on the product** — a pick this state cannot honestly produce says why, on
   * the control, and issues no run.
   *
   * *Your latest saved* has nothing behind it on a fresh page: nothing has been saved in the
   * workshop. The strip refuses **in words** rather than falling back to another rival, because a
   * rival the player did not pick would be the strip inventing one — and it is drawn where the
   * player pressed rather than only in a register, which is what the deleted `STAGE_NO_GHOST` used
   * to be the one example of on this screen.
   */
  it('refuses a pick it cannot honestly run, in words, without inventing a rival', async () => {
    const page = await coldLoad('garden-apartments', 'eta');
    await enterEverydayStage(page);
    /* The same wait, for the same reason — see the case above. */
    const settled = await untilRace(page, (facts) => facts.runOpen, 120_000);
    expect(settled.held, `the player’s own day never opened: ${JSON.stringify(settled.last)}`).toBe(
      true,
    );
    await page.selectOption('.everyday-stage-ghost', 'latest-saved');
    const refused = await untilRace(page, (facts) => facts.refusal !== null, 60_000);
    expect(refused.held, `no refusal arrived: ${JSON.stringify(refused.last)}`).toBe(true);
    expect(refused.last?.refusal).toContain('save a dispatcher in the workshop');
    expect(await page.textContent('.everyday-stage-verdict')).toContain(
      'save a dispatcher in the workshop',
    );
    /* Refused means no rival, and no rival means no second line and no name beside one. */
    expect(refused.last?.rivalId).toBeNull();
    expect(refused.last?.ghostPoints.every((points) => points === '')).toBe(true);
    expect(refused.last?.keyText).toBe('');
    await page.close();
  }, 120_000);
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
