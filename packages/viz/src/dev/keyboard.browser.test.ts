/**
 * The transport's keyboard, **driven** — § D234, issue #69.
 *
 * ## Why this is a browser test and not a node one
 *
 * The standing requirement is *move the control and require the run to change, compared on the
 * legs rather than on a window statistic.* A keyboard shortcut has no legs to compare: it moves a
 * playhead over a recording that is already fixed. The equivalent — and the thing the issue is
 * actually about — is **press the key and require the playhead to move**, which needs a real key
 * event, a real focus context and a real `requestAnimationFrame`. A node test can assert that a
 * `case ','` exists in the source; it cannot tell you whether anything swallowed the event first,
 * which is precisely what the issue alleged.
 *
 * § D220 § 4 forbids a browser test asserting a *metric*. Nothing here asserts one: every
 * measurement is the playhead's own position, read off the slider the transport already publishes
 * it on.
 *
 * ## What driving this found, in both directions
 *
 * The issue reports that `,` and `.` "do nothing, in any focus context I could find", and that
 * `Space` does not pause. **Neither reproduces**, and the numbers are in `§ D234`: `,` moved the
 * playhead `5.15 % → 5.10 %`, exactly as far as the button's own click moves it, and `Space`
 * toggled a running transport to paused. What is real is that a display frame at the shipped ×60 is
 * **one simulated second** — under half a pixel here — against an `hh:mm` readout that could not
 * resolve it. The invisibility is the defect; the binding was never dead.
 *
 * And driving found one the issue did not: `Space` over a focused `<button>` cancelled that
 * button's own activation, because the arm called `preventDefault()` unconditionally.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import { CHROMIUM, HAS_BROWSER, pressMenuRow } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    /*
     * A port of its own, and `strictPort: false` so it moves rather than throws.
     *
     * `vite.config.ts` declares `{ port: 5174, strictPort: true }`, and `boot.browser.test.ts`
     * starts a second server from the same config. Two files in one project run concurrently, so
     * without this the second one to start dies with *Port 5173 is already in use* — a red tier
     * that is about neither test. The URL is read back off `resolvedUrls` rather than assumed.
     */
    server: { port: 5190, strictPort: false },
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
 * A page with a shift on the board, paused, reached the way a player reaches it.
 *
 * Through the menu rather than around it: since § D232 nothing autoplays and nothing files until
 * the overlay has been dismissed, so a test that poked the transport on a cold load would be
 * driving a state no player is ever in.
 *
 * The two presses are by **affordance id**, not by the row's words. Written as
 * `hasText: 'Scenarios'` this function pressed *Start here* on every call from the wave issue #90
 * landed in — one press, the wrong row, the overlay gone, and thirty seconds of silence on the next
 * line. `pressMenuRow`'s docstring carries the measurement.
 */
async function openPausedRun(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${origin}?seed=20260804`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  await pressMenuRow(page, 'main.campaign');
  await pressMenuRow(page, 'campaign.open');
  await page.locator('#tab-run').first().click();
  await page.locator('#run').first().click();
  await page.waitForTimeout(1_200);
  // Paused, so the playhead only moves when something asks it to.
  if ((await page.locator('#play-pause').first().getAttribute('aria-label')) === 'Pause') {
    await page.locator('#play-pause').first().click();
  }
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  return page;
}

/**
 * Where the playhead is, as the fraction of the run it has drawn itself at.
 *
 * Read off `#playhead`'s own `left`, which `drawPlayhead` writes to two decimals of a percent —
 * 0.18 s of a 1 800 s run, which is fine enough to see a one-second frame step. The slider's
 * `aria-valuenow` is a tenth of a percent and would round a frame step away, which is half of what
 * made the shortcut look dead.
 */
async function playheadPct(page: Page): Promise<number> {
  const style = (await page.locator('#playhead').first().getAttribute('style')) ?? '';
  return Number(/left:\s*([\d.]+)%/.exec(style)?.[1] ?? 'NaN');
}

describe.skipIf(!HAS_BROWSER)('the transport keyboard moves the playhead', () => {
  it('steps back on “,” and forward on “.”, from page focus', async () => {
    /*
     * The refutation of issue #69's central claim, and the assertion is the movement rather than a
     * registered handler: the issue's own account is that the button works and the key does not, so
     * anything short of measuring the playhead answers a different question.
     */
    const page = await openPausedRun();
    const start = await playheadPct(page);

    await page.keyboard.press(',');
    await page.waitForTimeout(150);
    const back = await playheadPct(page);
    expect(back, 'the “,” advertised on the step button’s own tooltip moved nothing').toBeLessThan(
      start,
    );

    await page.keyboard.press('.');
    await page.waitForTimeout(150);
    expect(await playheadPct(page), '“.” did not undo what “,” did').toBeGreaterThan(back);
    await page.close();
  }, 120_000);

  it('moves the playhead exactly as far as the button beside it does', async () => {
    // The issue's step 3 against its step 2. They share one handler — `UX.md`'s `TP-06` says so —
    // and this is what makes that row a measurement rather than a claim about the source.
    const page = await openPausedRun();
    const start = await playheadPct(page);
    await page.keyboard.press(',');
    await page.waitForTimeout(150);
    const byKey = start - (await playheadPct(page));

    const before = await playheadPct(page);
    await page.locator('#step-back').first().click();
    await page.waitForTimeout(150);
    const byButton = before - (await playheadPct(page));

    expect(byKey).toBeGreaterThan(0);
    /*
     * Within one quantum of the readout, not to the bit. `drawPlayhead` writes `left` to two
     * decimals of a percent, and a one-second step on a 1 800 s run is 0.0556 % — so two steps of
     * the same size land on 0.05 and 0.06 depending on where in the rounding they start. That
     * 0.01 % *is* the finding: the whole visible travel of an advertised shortcut is smaller than
     * the rounding of the only readout that shows it.
     */
    expect(Math.abs(byKey - byButton)).toBeLessThanOrEqual(0.011);
    await page.close();
  }, 120_000);

  it('pauses a running transport on Space, from page focus', async () => {
    const page = await openPausedRun();
    await page.locator('#play-pause').first().click();
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    expect(await page.locator('#play-pause').first().getAttribute('aria-label')).toBe('Pause');
    await page.keyboard.press(' ');
    await page.waitForTimeout(300);
    expect(
      await page.locator('#play-pause').first().getAttribute('aria-label'),
      'Space did not pause a running transport',
    ).toBe('Play');
    await page.close();
  }, 120_000);

  it('leaves Space to a focused button, which owns it', async () => {
    /*
     * The defect driving found. The arm called `preventDefault()` unconditionally, which cancels a
     * focused button's own activation — so Space over `#step-back` toggled playback instead of
     * stepping back, and the two controls the issue is about fought over one key.
     */
    const page = await openPausedRun();
    await page.locator('#step-back').first().focus();
    const before = await playheadPct(page);
    const playing = await page.locator('#play-pause').first().getAttribute('aria-label');

    await page.keyboard.press(' ');
    await page.waitForTimeout(200);

    expect(
      await playheadPct(page),
      'Space over the focused step-back button did not activate it',
    ).toBeLessThan(before);
    expect(
      await page.locator('#play-pause').first().getAttribute('aria-label'),
      'Space over a focused button toggled the transport as well as activating the button',
    ).toBe(playing);
    await page.close();
  }, 120_000);

  it('publishes seconds on the slider, so the frame step it advertises is observable', async () => {
    /*
     * The half of #69 that was real. `,` always moved the playhead; a display frame at the shipped
     * ×60 is one simulated second, and every readout on the page was `hh:mm`. A reader — especially
     * the screen-reader user the tooltip makes the promise to — pressed the key five times and had
     * nothing to see.
     */
    const page = await openPausedRun();
    const text = async (): Promise<string> =>
      (await page.locator('#timeline').first().getAttribute('aria-valuetext')) ?? '';
    expect(await text(), 'the slider no longer publishes seconds').toMatch(/^\d{2}:\d{2}:\d{2}$/);
    const before = await text();
    await page.keyboard.press(',');
    await page.waitForTimeout(150);
    expect(await text(), 'a frame step left the slider’s own readout unchanged').not.toBe(before);
    await page.close();
  }, 120_000);
});
