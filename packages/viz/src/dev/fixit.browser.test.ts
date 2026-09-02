/**
 * Fix-a-building's chrome, driven — `docs/20` defect 16's two observable halves.
 *
 * ## Why these are browser cases
 *
 * The repair rows are buttons `mountFixitPanel` builds and the overlay is appended to
 * `document.body`; no node test in this package can see either (`boundaries.test.ts` keeps jsdom
 * out), and both findings are about what a reader perceives: a toggle whose only state signal was
 * a background colour, and a dark room inside a light product. The third half of the defect — the
 * FIXED badge surviving a failing run — is a pure rule and is driven in `fixit/engine.test.ts`
 * (`fixedBadgeAfter`), with the panel's assignment pinned at the source there; a browser replay of
 * it would cost four simulations to re-prove a one-line pure function.
 *
 * § D220 § 4 holds: **no metric**. The first two cases read pressed-state, a glyph and two computed
 * background colours. The third runs a day and still asserts no metric — what it watches is the run
 * button's own state while the run is happening, which is a fact about the chrome and not about the
 * building. The fourth is GitHub issue #165's acceptance and asserts a fact about the *browser*:
 * how long the page went without rendering a frame while a run was happening. That is not a metric
 * of a run either — a run takes what it takes on a worker as much as on the main thread — it is
 * the difference between a page that answers a click and one that does not.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import {
  CHROMIUM,
  HAS_BROWSER,
  enterEngineerStage,
  openPage,
  pressMenuRow,
  reopenEngineerMenu,
  startShippedSite,
  type ShippedSite,
} from './browserTier.test-helper.js';
import {
  BLOCKED_FRAME_GAP_MS,
  frameDisabled,
  frameLabels,
  frameReading,
  paintedBusyFrame,
  recordFrames,
} from './mainThreadFrames.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  // A port of this file's own, `strictPort: false` — the tier's convention (see noteContrast).
  site = await startShippedSite({ preview: { port: 5198, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A page with the Fix-a-building overlay open on its first case, reached the player's way. */
async function fixitPage(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  await enterEngineerStage(page);
  await reopenEngineerMenu(page);
  await pressMenuRow(page, 'main.campaign');
  await pressMenuRow(page, 'campaign.fixit');
  // The case file is fetched on first open; a repair row existing is the honest "loaded" latch.
  await page.waitForSelector('.fixit-repair', { timeout: 30_000 });
  return page;
}

/** One frame the sampler actually saw painted, with the run button's state in it. */
interface RunFrame {
  readonly label: string;
  readonly disabled: boolean;
}

/** Where the sampler parks its list. The test's own name; the product neither writes nor reads it. */
type SamplingWindow = Window & typeof globalThis & { __fixitRunFrames?: RunFrame[] };

/**
 * Sample the run button once per **animation frame**, from before the press until the run is over.
 *
 * ## What this samples, and — measured — what it does *not* prove
 *
 * It samples in a `requestAnimationFrame` callback, so every entry is a frame the browser went on
 * to render: a busy entry means the relabel reached the screen and was not merely written to the
 * DOM. That is worth asserting, and a panel that stopped disabling its run button would fail here.
 *
 * **It does not discriminate the `requestAnimationFrame` wrapper in `fixitPanel.ts`, and saying so
 * is the point.** Both this case and its first draft — a `MutationObserver`, which cannot see paint
 * at all — were run against a deliberately broken panel with that wrapper replaced by an immediate
 * call, and **both passed**. The reason is an observer effect: this sampler keeps a *standing* rAF
 * loop, so when the click handler relabels there is already a frame callback queued, and it renders
 * the busy frame the product's own wrapper was supposed to guarantee.
 *
 * The wrapper is still right, and the evidence for it is a probe rather than this case. Two presses
 * in an empty page, identical but for the defer, counting frames rendered carrying the busy label:
 *
 * | defer | frames with the busy label |
 * |---|---|
 * | `setTimeout(body, 0)` | **0** |
 * | `requestAnimationFrame(() => setTimeout(body, 0))` | **1** |
 *
 * So a zero timeout really does let the blocking task run before any paint, and nesting really does
 * fix it — which is what `fixitPanel.ts`'s own comment now claims and what its previous comment
 * claimed while the code did not provide it.
 *
 * Installed **before** the press for the reason the sibling screen's case records: an evaluate
 * issued after the click queues behind the blocking task and first runs when the run is over.
 */
async function sampleRunFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as SamplingWindow;
    const frames: RunFrame[] = [];
    const tick = (): void => {
      const button = document.querySelector<HTMLButtonElement>('.fixit-run');
      if (button !== null) {
        frames.push({ label: button.textContent ?? '', disabled: button.disabled });
      }
      w.requestAnimationFrame(tick);
    };
    w.__fixitRunFrames = frames;
    w.requestAnimationFrame(tick);
  });
}

/** Every frame the sampler saw, in order. */
async function runFrames(page: Page): Promise<readonly RunFrame[]> {
  return page.evaluate(() => (window as SamplingWindow).__fixitRunFrames ?? []);
}

describe.skipIf(!HAS_BROWSER)('Fix-a-building’s chrome — docs/20 defect 16', () => {
  it('repair rows are toggles that say so: aria-pressed both ways, and a visible tick', async () => {
    const page = await fixitPage();
    const row = page.locator('.fixit-repair:not([disabled])').first();
    expect(await row.getAttribute('aria-pressed')).toBe('false');
    const name = (await row.textContent()) ?? '';
    expect(name.includes('✓'), 'an unselected row must not wear the tick').toBe(false);

    await row.click();
    await page.waitForTimeout(200);
    // The panel re-renders whole, so the row is re-located rather than held.
    const pressed = page.locator('.fixit-repair[aria-pressed="true"]');
    expect(await pressed.count(), 'the pressed state must be on the row that was pressed').toBe(1);
    expect(((await pressed.first().textContent()) ?? '').includes('✓')).toBe(true);

    // And back: a toggle that can only be told "on" is a latch wearing a toggle's contract.
    await pressed.first().click();
    await page.waitForTimeout(200);
    expect(await page.locator('.fixit-repair[aria-pressed="true"]').count()).toBe(0);
  });

  it('wears the product’s own palette, not a room of its own', async () => {
    const page = await fixitPage();
    const grounds = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('.fixit-overlay');
      return {
        overlay: overlay === null ? '' : getComputedStyle(overlay).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
      };
    });
    /*
     * The body paints `var(--bg)`, which is `applyTheme`'s write — so equality here means the
     * overlay follows the same theme switch every other surface follows, in whichever theme the
     * page is in. The old panel's own `#141a21` fails this in both themes.
     */
    expect(grounds.overlay).toBe(grounds.body);
    expect(grounds.overlay).not.toBe('');
  });
  it('holds the run button inert while the day runs, and the relabel reaches the screen first', async () => {
    const page = await fixitPage();

    /*
     * The press relabels and disables the run button, that state reaches a rendered frame, and the
     * button comes back — which is what stops a second press landing mid-run. It stopped being the
     * *only* thing stopping one when the runs moved to a worker (issue #165), and it became more
     * load-bearing rather than less: an asynchronous run leaves the page live, so a second press is
     * now something a player can physically make.
     *
     * This panel had no browser case at all until now, which is why a comment claiming a mechanism
     * the code did not provide survived here for two waves. The mechanism is fixed; the evidence
     * for the fix is the probe recorded on {@link sampleRunFrames} rather than this case, and that
     * distinction is stated there rather than implied by a green tick here.
     */
    await sampleRunFrames(page);
    await page.locator('.fixit-run').click();

    // A real run of a real case; the 120 s ceiling is the tier's for two `recordRun`s on a worker.
    await page.waitForSelector('.fixit-outcome', { timeout: 120_000 });

    const frames = await runFrames(page);
    const busyAt = frames.findIndex((frame) => /Running the day/.test(frame.label));
    /*
     * A **painted** frame carrying the busy label — the relabel reached the screen rather than only
     * the DOM. See {@link sampleRunFrames} for the measured limit of this assertion: it does not by
     * itself discriminate the defer, because the sampler's own frame loop supplies a frame either
     * way. What it does catch is a panel that stops relabelling or stops disabling.
     */
    expect(
      busyAt,
      `no rendered frame carried the busy label — the relabel never painted before the runs. Frames: ${JSON.stringify(frames.slice(0, 8))}`,
    ).toBeGreaterThanOrEqual(0);
    expect(frames[busyAt]?.disabled, 'the button was relabelled but stayed pressable').toBe(true);
    // And it came back: a busy frame that is the last one sampled is a button left inert.
    expect(busyAt, 'the button was still busy when the outcome was drawn').toBeLessThan(
      frames.length - 1,
    );

    const after = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('.fixit-run');
      return {
        label: button?.textContent ?? '',
        disabled: button?.disabled ?? true,
        outcomeRows: document.querySelectorAll('.fixit-outcome-row').length,
      };
    });
    expect(after.disabled).toBe(false);
    expect(after.label).toBe('Run it again');
    // § D220 § 4: that a verdict was drawn, never what it measured.
    expect(after.outcomeRows).toBeGreaterThan(0);
  });

  it('keeps painting through both runs — GitHub issue #165', async () => {
    const page = await fixitPage();

    /*
     * The acceptance for issue #165 on this surface, and it is asserted about the page rather than
     * about the panel: while the pair of simulations happens, the browser goes on rendering frames.
     * Before the runs moved to `dev/shiftWorker.ts` this could not have been true of the press —
     * `dev/measure.surfaceRuns.test.ts` measures the pair at 24–846 ms of a seized main thread over
     * the shipped cases — and it is what makes the busy state above worth drawing at all: a
     * disabled button on a frozen page is a picture of a disabled button.
     *
     * The sampler is installed before the press for the reason its own docstring gives.
     */
    await recordFrames(page, '.fixit-run');
    await page.locator('.fixit-run').click();
    await page.waitForSelector('.fixit-outcome', { timeout: 120_000 });

    /*
     * A **painted** frame carrying the busy label, which is the assertion that does not depend on
     * a threshold: a synchronous handler writes its label and calls `recordRun` in the same task,
     * so no frame can be rendered between the two. It is also the discriminating case
     * {@link sampleRunFrames} says it is not — see {@link paintedBusyFrame} for why the two differ.
     */
    const busyAt = await paintedBusyFrame(page, /Running the day/);
    expect(
      busyAt,
      `no rendered frame carried the busy label: ${JSON.stringify(await frameLabels(page))}`,
    ).toBeGreaterThanOrEqual(0);
    expect(await frameDisabled(page, busyAt), 'the button was relabelled but stayed pressable').toBe(
      true,
    );

    const reading = await frameReading(page);
    // Both halves, because either alone can be produced by a sampler that never started.
    expect(reading.frames, 'the frame sampler recorded nothing').toBeGreaterThan(10);
    expect(
      reading.longestGapMs,
      `the page stopped painting for ${reading.longestGapMs.toFixed(0)} ms over ${String(reading.frames)} frames — a run is back on the main thread`,
    ).toBeLessThan(BLOCKED_FRAME_GAP_MS);
  });
});
