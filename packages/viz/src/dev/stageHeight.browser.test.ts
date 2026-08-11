/**
 * **The stage keeps a legible floor pitch at laptop sizes** — `docs/19` defect 7.
 *
 * ## What was measured, and what this asserts
 *
 * At 1280×800 the run panel's chrome — coach ribbon, two legend rows, the transport — grew and
 * `.stage-wrap`'s `min-height: 0` let the canvas absorb all of it: a campaign Midtown day (21
 * floors) collapsed to a **103 px** sliver, with the wait-age ramp sub-pixel and the alert banner
 * covering most of the building. At 1440×1000 the same scene was 375 px and readable. The drama
 * exists; laptop screens never saw it.
 *
 * The fix is a real `min-height` on `.stage-wrap` with `#panel-run` allowed to scroll when the
 * viewport genuinely cannot hold stage plus chrome, and this file is the measurement the CSS
 * comment cites: a real browser, both of the audit's viewports, and the **campaign** state that
 * produced the sliver (the scenario's coach ribbon is taller than free play's, which is where the
 * pixels went). The bar is derived from the drawing rather than chosen — see
 * {@link MIN_FLOOR_PITCH_PX} — so the assertion is *a floor's pixel height stays above a named
 * minimum*, not *the canvas is N pixels*.
 *
 * § D220 § 4 holds: nothing here asserts a metric, a mean, or anything the honesty search owns.
 * The claim is about layout, which only this tier can see.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIN_FOOTER_PX, MIN_HEADER_PX } from '../render/layout.js';

import { CHROMIUM, HAS_BROWSER } from './browserTier.test-helper.js';

/**
 * The smallest floor pitch worth calling legible, in canvas pixels — the same **12 px** that
 * `render/canvas.ts#MIN_GLYPH_PITCH_PX` names as the pitch below which a rider glyph degrades to
 * a bar. Restated rather than imported because that constant is deliberately module-private (an
 * export whose only caller is a test would be the dead-seam shape `deadCode.test.ts` counts); if
 * the canvas moves its bar, this floor is still one worth holding on its own terms.
 */
const MIN_FLOOR_PITCH_PX = 12;

/** Midtown Office's floor count — the tallest tower the audit measured the sliver on. */
const MIDTOWN_FLOORS = 21;

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    /*
     * A port of this file's own, not `port: 0` — the tier's third encounter with the same trap,
     * and this time it was caught at integration rather than in CI. `vite.config.ts` pins
     * `{ port: 5174, strictPort: true }`, so `port: 0` does **not** mean *an ephemeral port*: it
     * resolves to that pinned default, `boot.browser.test.ts` asks for the same one, and under
     * `strictPort` the loser gets no URL at all — a red file for a reason with nothing to do with
     * canvas height. Green on its own branch, red the moment the tier held nine files.
     */
    server: { port: 5194, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const local = server.resolvedUrls?.local[0];
  if (local === undefined) throw new Error('the dev server did not report a local URL');
  origin = local.replace(/\/$/, '');
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** The stage canvas's CSS height, after the page has settled at `viewport`. */
async function measureStage(
  page: Page,
): Promise<{ readonly stagePx: number; readonly panelScrollable: boolean }> {
  return page.evaluate(() => {
    const stage = document.querySelector('#stage');
    const panel = document.querySelector('#panel-run');
    return {
      stagePx: stage instanceof HTMLElement ? stage.getBoundingClientRect().height : 0,
      // The other half of the fix: when the chrome plus the floored stage exceed the column, the
      // panel scrolls rather than clipping the transport (overflow-y: auto in index.html).
      panelScrollable:
        panel instanceof HTMLElement && getComputedStyle(panel).overflowY === 'auto',
    };
  });
}

async function loadAt(width: number, height: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height } });
  // Midtown by deep link, fixed seed: the tallest shipped tower, and the audit's own building.
  await page.goto(`${origin}/?building=midtown-office&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector('canvas')?.width !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 10_000 },
  );
  return page;
}

/** Take the Midtown scenario off the Scenarios tab — the state the 103 px sliver was measured in. */
async function takeMidtownScenario(page: Page): Promise<void> {
  // By id, not by words — `browserTier.test-helper.ts`'s own lesson about `hasText` selectors.
  await page.locator('#tab-scenarios').first().click();
  await page.locator('#scenario-list button.scenario', { hasText: 'Midtown' }).first().click();
  // The take navigates back to the run tab and re-runs; the campaign coach ribbon (the tall one)
  // is drawn synchronously with that navigation, which is what the measurement needs.
  await page.waitForTimeout(1_500);
}

describe.skipIf(!HAS_BROWSER)('the stage canvas holds a legible floor pitch — docs/19 defect 7', () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 1000 },
  ]) {
    const name = `${String(viewport.width)}×${String(viewport.height)}`;
    it(`keeps ${String(MIN_FLOOR_PITCH_PX)} px per floor on a campaign Midtown day at ${name}`, async () => {
      const page = await loadAt(viewport.width, viewport.height);
      try {
        await takeMidtownScenario(page);
        const { stagePx, panelScrollable } = await measureStage(page);
        /*
         * The named minimum, applied to the drawing's own budget: the canvas spends
         * MIN_HEADER_PX + MIN_FOOTER_PX on its bands and divides the rest among the floors, so
         * the plot must hold `floors × pitch`. Before the fix this measured 103 px total at
         * 1280×800 — a *negative* plot — and 291 px on the state this test drives.
         */
        const plotPx = stagePx - MIN_HEADER_PX - MIN_FOOTER_PX;
        expect(
          plotPx,
          `the stage is ${String(stagePx)} px tall, leaving ${String(plotPx)} px for ` +
            `${String(MIDTOWN_FLOORS)} floors — under ${String(MIN_FLOOR_PITCH_PX)} px per floor`,
        ).toBeGreaterThanOrEqual(MIDTOWN_FLOORS * MIN_FLOOR_PITCH_PX);
        expect(
          panelScrollable,
          'the run panel does not scroll, so a floored stage would clip the transport instead',
        ).toBe(true);
      } finally {
        await page.close();
      }
    }, 120_000);
  }
});
