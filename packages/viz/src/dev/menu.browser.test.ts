/**
 * One press, after typing — GitHub issue #106, driven by a real pointer.
 *
 * ## Why this tier and not the one next door
 *
 * `dev/menuPanel.test.ts` can see the mechanism: it watches what a redraw does to its own children
 * and requires that the button a pointer is standing on is neither removed nor moved. What it
 * cannot see is the consequence, because it fires handlers by reaching into a `Map` — so a
 * **detached** node's click handler runs there exactly as a live one's does, and the whole of this
 * defect is that a browser declines to call it at all. Its own docstring says why: *"there is no
 * window, no layout, no event dispatch and no selector engine."*
 *
 * So the claim *the first press works* is only answerable here, and answering it needs the three
 * things a document recorder is not: a real `mousedown` that blurs the field, a real `change` fired
 * by that blur, and a real browser deciding whether the `mouseup` that follows is a click.
 *
 * ## What is driven, and why it is Free play rather than the account screen
 *
 * The issue reports the account screen, and the account screen's submit asks a **server** for a
 * sign-in link. This deployment has none — `dev/main.ts` builds a client only when the page carries
 * an origin — so the observable there would be a notice, and `updateForm` moves notices about for
 * reasons of its own. Free play has the same shape and a consequence nothing else can produce: a
 * text field (Seed), a `commit` row beside it (Start), and pressing Start closes the overlay and
 * runs a shift. The defect is the panel's, not the screen's, and this is the screen where landing
 * the press is unambiguous.
 *
 * § D220 § 4 forbids a browser test asserting a metric. Nothing here asserts one: what is measured
 * is whether an overlay is up.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The provisioned headless shell — `boot.browser.test.ts`'s constant, kept identical. */
const CHROMIUM =
  process.env['ELEVATOR_SIM_CHROMIUM'] ??
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const HAS_BROWSER = existsSync(CHROMIUM);
if (!HAS_BROWSER) {
  console.warn(
    `[viz-browser] skipped: no Chromium at ${CHROMIUM}. ` +
      'Set ELEVATOR_SIM_CHROMIUM to run the browser tier (DECISIONS.md § D220).',
  );
}

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, and `strictPort: false` so it moves rather than throws — the three files
    // in this project run concurrently and would otherwise fight over one port.
    server: { port: 5191, strictPort: false },
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

/** The Free play screen, reached the way a player reaches it: through the menu. */
async function openFreePlay(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}?seed=20260807`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  await page.locator('.menu-overlay button', { hasText: 'Free play' }).first().click();
  await page.locator('.menu-overlay .menu-text input').first().waitFor({ timeout: 10_000 });
  return page;
}

/** Whether the menu is still covering the page. */
async function menuIsUp(page: Page): Promise<boolean> {
  return page.locator('.menu-overlay').first().isVisible();
}

describe.skipIf(!HAS_BROWSER)('a field commit does not swallow the press beside it', () => {
  it('starts the run on the first click after typing a seed', async () => {
    /*
     * The reporter's steps with the screen swapped: type into a field, then press the button once.
     * Before the fix the `mousedown` blurred the field, the blur fired `change`, the commit redrew
     * the overlay with `replaceChildren`, and by `mouseup` the button had been out of the document
     * — so Chrome dispatched no click and the menu simply sat there.
     *
     * `click()` is one press: Playwright moves, presses and releases, which is exactly the sequence
     * the defect lives in. Nothing here retries.
     */
    const page = await openFreePlay();
    const seed = page.locator('.menu-overlay .menu-text input').first();
    await seed.click();
    await seed.fill('');
    await seed.type('20260106');
    expect(await menuIsUp(page), 'typing a seed closed the menu on its own').toBe(true);

    await page.locator('.menu-overlay button', { hasText: 'Start' }).first().click();
    await page.waitForTimeout(1_500);

    expect(
      await menuIsUp(page),
      'the first press of Start after typing a seed did nothing — the redraw the field commit ' +
        'caused took the button out of the document between mousedown and mouseup',
    ).toBe(false);
    await page.close();
  }, 120_000);

  it('starts it on Enter in the field, without a pointer at all', async () => {
    /*
     * The keyboard half. The menu builds no `<form>`, so Enter in a text field had nothing to do:
     * the overlay's own keydown handler owns Escape and Tab, and the submit is a
     * `<button type="button">` with a click listener. A player who typed a seed and pressed Enter
     * met silence on the one screen whose whole purpose is to start something.
     */
    const page = await openFreePlay();
    const seed = page.locator('.menu-overlay .menu-text input').first();
    await seed.click();
    await seed.fill('');
    await seed.type('20260107');
    await seed.press('Enter');
    await page.waitForTimeout(1_500);

    expect(await menuIsUp(page), 'Enter in the seed field started nothing').toBe(false);
    await page.close();
  }, 120_000);

  it('lets Tab out of the field reach the button, which Enter then presses', async () => {
    /*
     * The trap the swallowed click hid behind. `change` fires during a blur, and during a blur
     * `document.activeElement` is the body — which looked to `restoreFocus` exactly like a dialog
     * that had just opened, so it pulled the reader to `controls[0]`. On this screen that is the
     * top of the list, and on the account screen it is the field they were leaving: Tab out, land
     * back in, with no keyboard route to the button at all.
     */
    const page = await openFreePlay();
    const seed = page.locator('.menu-overlay .menu-text input').first();
    await seed.click();
    await seed.fill('');
    await seed.type('20260108');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    const landed = await page.evaluate(() => document.activeElement?.textContent ?? '');
    expect(
      landed,
      'Tab out of the seed field did not reach Start — the commit its blur caused took the focus ' +
        'back to the top of the screen',
    ).toContain('Start');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(1_500);
    expect(await menuIsUp(page), 'Enter on the focused Start did nothing').toBe(false);
    await page.close();
  }, 120_000);
});
