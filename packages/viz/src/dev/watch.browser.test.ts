/**
 * **Watching, in the shipped shell** — GAMEPLAY § 14.1's differentiation table and its round trip,
 * observed rather than argued.
 *
 * ## Why this case is in the browser tier and not beside `watch/`'s others
 *
 * Everything `watch/` decides is already driven under plain Node — the record, both gate branches,
 * the no-first-person corpus, the untouched-state identity. What none of that can reach is the
 * claim § 14.1 actually makes, which is about **the shell**: that the header inverts, the pill
 * appears on the stage, the timeline goes, the intervention control is disabled, and `⤺ Stop
 * watching` puts the player back exactly where they were. Those are six surfaces and a transport,
 * and `dev/main.ts` ends with `if (typeof document !== 'undefined') void main();` — so short of
 * running the page, this is prose (§ D220's own argument for the tier existing at all).
 *
 * It asserts no figure. § D220 § 4 forbids a browser test claiming anything about a metric, and the
 * two figures it does read — the playhead and the pill's text — are read as *the same as before*
 * and *the string the view produced*, never as statements about a run.
 *
 * ## What it drives
 *
 * The shipped route, end to end: the menu's `Watch a run` row → the picker → a **reference run**'s
 * `Watch it` → the chrome → `⤺ Stop watching`. A reference run rather than a filed day, because a
 * cold page has closed no day and making it close one would put a two-minute campaign in front of
 * the thing being tested — which is exactly the first-visit emptiness `watch/reference.ts` says the
 * fixtures exist to answer.
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
    // A port of its own, `strictPort: false` so it moves rather than fights the sibling files.
    server: { port: 5193, strictPort: false },
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

/** A loaded page with a run of its own on the stage, paused where the player left it. */
async function pageWithARun(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  await page.goto(`${origin}?seed=20260811`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  // Leave the menu the way a player does, so boot's own recording is on screen and the transport
  // is live. `changed-their-mind` deliberately does not latch the filing gate (issue #117).
  await pressMenuRow(page, 'main.resume');
  await page.waitForTimeout(1_200);
  return page;
}

/** Whether the spectator chrome is up. */
async function chromeIsUp(page: Page): Promise<boolean> {
  return page.locator('.watch-chrome').first().isVisible();
}

/** The playhead, as the clock reads it — a string, never a claim about the run. */
async function clockText(page: Page): Promise<string> {
  return (await page.locator('#clock').first().textContent()) ?? '';
}

/** The `×N` chip currently pressed, or `''` when none is — the speed the transport is at. */
async function latchedSpeed(page: Page): Promise<string> {
  return (
    (await page.locator('#speed-chips button[aria-pressed="true"]').first().textContent()) ?? ''
  );
}

describe.skipIf(!HAS_BROWSER)('watching somebody else’s run — GAMEPLAY § 14.1', () => {
  it('inverts the shell, and puts it all back exactly', async () => {
    const page = await pageWithARun();

    /*
     * Pause and scrub, so the round trip has something specific to lose. A playhead that was never
     * moved comes back correct by accident — `adopt` starts at the beginning — so the assertion
     * would be green over a restore that does nothing, which is the shape of test this repository
     * keeps finding.
     */
    await page.locator('#play-pause').first().click();
    await page.waitForTimeout(200);
    for (let step = 0; step < 6; step += 1) {
      await page.locator('#step-forward').first().click();
    }
    await page.waitForTimeout(300);
    const clockBefore = await clockText(page);
    const headlineBefore = await page.locator('#building-name').first().textContent();

    /*
     * Latch the top chip, which is what `docs/20` defect 10 is about: ×900 was still driving the
     * transport when somebody else's day went on the stage, and a shipped reference run was over
     * about a second and a half later. ×900 rather than any other rung because it is the one that
     * makes the defect a *lost* run rather than a fast one.
     */
    await page.locator('#speed-chips button', { hasText: '×900' }).first().click();
    await page.waitForTimeout(200);
    expect(await latchedSpeed(page), 'the ×900 chip did not latch').toBe('×900');

    /* --- into the picker, and into somebody else's day ---------------------- */

    // `#open-menu` is the header's own way back — `dev/main.ts` dispatches the same `reopen`
    // intent `?screen=` uses, so there is one answer to what reopening does.
    await page.locator('#open-menu').first().click();
    await page.waitForTimeout(400);
    // The row sits on the Scenarios screen rather than the root — § D299 pins the root's six rows.
    await pressMenuRow(page, 'main.campaign');
    await page.waitForTimeout(400);
    await pressMenuRow(page, 'campaign.watch');
    await page.locator('.watch-overlay').first().waitFor({ timeout: 10_000 });

    // A reference row — the fixtures are what make this reachable on a page that has closed no day.
    const watchIt = page.locator('.watch-overlay button', { hasText: 'Watch it' }).first();
    await watchIt.waitFor({ timeout: 20_000 });
    await watchIt.click();
    // The gate re-simulates on the main thread before the chrome appears.
    await page.locator('.watch-chrome').first().waitFor({ timeout: 60_000 });

    expect(await chromeIsUp(page), 'the spectator chrome did not come up').toBe(true);

    /* --- `docs/20` defect 12 — the strip and the header share the top of the page ------------ */

    /*
     * Measured rather than described. The strip is inserted above the header, and `.shell` is a
     * three-row grid: as a fourth child it took the leading `auto` and pushed the header onto the
     * `1fr`, inside a `height: 100vh` box with `overflow: hidden`. The player-visible result was the
     * wordmark, Menu and clock clipped under a floating bar.
     *
     * Two claims, and neither is about how it looks: the two boxes do not overlap, and the
     * wordmark's own box is inside the header's. A pixel of tolerance, because a sub-pixel layout
     * rounding is not a defect and this assertion should not fail on one.
     */
    const boxes = await page.evaluate(() => {
      const rect = (selector: string): { top: number; bottom: number; left: number; right: number; width: number } | null => {
        const node = document.querySelector(selector);
        if (node === null) return null;
        const box = node.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width };
      };
      return {
        chrome: rect('.watch-chrome'),
        header: rect('header.topbar'),
        brand: rect('.brand-name'),
        shellChildren: document.querySelector('.shell')?.childElementCount ?? 0,
      };
    });
    expect(boxes.chrome, 'no spectator strip in the page').not.toBeNull();
    expect(boxes.header, 'no header in the page').not.toBeNull();
    expect(boxes.brand, 'no wordmark in the page').not.toBeNull();
    expect(
      (boxes.chrome?.bottom ?? 0) - 1,
      'the spectator strip overlaps the app header — `docs/20` defect 12',
    ).toBeLessThanOrEqual(boxes.header?.top ?? 0);
    expect(boxes.brand?.width ?? 0, 'the wordmark has no width while watching').toBeGreaterThan(0);
    expect(
      (boxes.brand?.right ?? 0) - 1,
      'the wordmark is clipped by the header while watching',
    ).toBeLessThanOrEqual(boxes.header?.right ?? 0);
    /*
     * And the grid still has the three children its `grid-template-rows` was written for. This is
     * the *cause* rather than the symptom, and it is asserted beside the symptom deliberately: a
     * future fix that moved the strip somewhere else would keep the boxes apart and quietly put the
     * row count back to four.
     */
    expect(boxes.shellChildren, 'the shell grid grew a row while watching').toBe(3);

    /* --- `docs/20` defect 10 — the speed chip does not carry into a stranger's day ----------- */

    expect(
      await latchedSpeed(page),
      'the latched ×900 chip carried into the watch — a stranger’s day is over before it is seen',
    ).toBe('×60');

    /* --- § 14.1's table, cell by cell --------------------------------------- */

    // header — ink, inverted, and the class the shell toggles.
    expect(
      await page.locator('header.topbar').first().evaluate((node) => node.classList.contains('watching-header')),
      'the header is not carrying the watching treatment — § 14.1’s single strongest signal',
    ).toBe(true);

    // canvas — a pill, top left, and it may not claim a server verified anything.
    const pill = (await page.locator('.watch-pill').first().textContent()) ?? '';
    expect(pill).toContain('REPLAY');
    expect(pill).toContain('VERIFIED BY RE-SIMULATION');
    expect(pill.toLowerCase()).not.toContain('server');

    // action bar — no timeline, and exactly the two controls.
    expect(await page.locator('#timeline').first().isVisible()).toBe(false);
    const actions = await page.locator('[data-watch-action]').allTextContents();
    expect(actions).toHaveLength(2);
    expect(actions.join(' ')).toContain('Stop watching');
    expect(actions.join(' ')).toContain('Play this crowd');

    // interventions and the ghost are disabled; the transport is deliberately not (contract § 1.5).
    expect(
      await page.locator('button', { hasText: 'Park the cars in the lobby' }).first().isDisabled(),
    ).toBe(true);
    expect(await page.locator('#race-ghost').first().isDisabled()).toBe(true);
    expect(await page.locator('#play-pause').first().isDisabled()).toBe(false);

    // no first-person copy anywhere on the watching surfaces — § 14.1's own defect condition, read
    // off the rendered page rather than off the view model this time.
    const chromeText = (await page.locator('.watch-chrome').first().textContent()) ?? '';
    for (const word of [' you ', ' your ', ' yours ']) {
      expect(` ${chromeText.toLowerCase()} `.replace(/\s+/g, ' ')).not.toContain(word);
    }

    /* --- ⤺ Stop watching, and the round trip ------------------------------- */

    await page.locator('[data-watch-action="stop-watching"]').first().click();
    await page.waitForTimeout(600);

    expect(await chromeIsUp(page), 'the chrome outlived the watch').toBe(false);
    expect(
      await page.locator('header.topbar').first().evaluate((node) => node.classList.contains('watching-header')),
      'the header stayed inverted after the watch ended',
    ).toBe(false);
    expect(await page.locator('.watch-pill').first().isVisible()).toBe(false);
    expect(await page.locator('#timeline').first().isVisible()).toBe(true);
    expect(
      await page.locator('button', { hasText: 'Park the cars in the lobby' }).first().isDisabled(),
    ).toBe(false);
    expect(await page.locator('#race-ghost').first().isDisabled()).toBe(false);

    // The player's own run, at the playhead they left it at. The building headline comes back with
    // it — the watched run was a different tower, so a restore that kept the watched state would
    // still be showing its name.
    expect(await clockText(page), 'the playhead did not survive the watch').toBe(clockBefore);
    expect(await page.locator('#building-name').first().textContent()).toBe(headlineBefore);
    /*
     * And the chip they latched, which is the other half of `docs/20` defect 10. § 14.1 promises
     * *"exactly where you were"*, and a reset with no restore is the same surprise pointed the
     * other way: the player comes back to their own run at a speed they never chose.
     */
    expect(await latchedSpeed(page), 'the player’s own speed chip did not come back').toBe('×900');

    await page.close();
  }, 300_000);
});
