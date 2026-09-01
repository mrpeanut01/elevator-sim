/**
 * **The test bench, driven on the page** — the four things § 12 says it must do, asked of the
 * screen rather than of the model.
 *
 * `benchModel.test.ts` holds the arithmetic (the field's bounds, the budget note's two sentences,
 * the interval narrowing between ten replications and two hundred, the three-arm refusal). What
 * only a page can say is that the **controls are wired to it**: that a third entrant changes what
 * the screen promises about verdicts, that a budget pill changes the live count of the work, and
 * that ticking nothing leaves the primary inert with § 12.1's own sentence beside the list.
 *
 * No suite is run here. A real budget is minutes of simulation and the smallest honest one is
 * still ten days per arm; the run path is `dev/suitePanel.ts`'s, unchanged and already covered,
 * and a browser case that ran a suite would be timing the simulator rather than testing a screen.
 * That is a stated limitation of this file, not coverage it claims.
 *
 * Pattern and gate are `settingsScreen.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5204, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function openBench(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 60_000 },
  );
  await page.click('.everyday-rail button:has-text("Test bench")');
  await page.waitForSelector('.everyday-bench');
  return page;
}

describe.skipIf(!HAS_BROWSER)('the Everyday test bench', () => {
  it('opens from the rail with § 3.3’s bench row, and the three standing notes present', async () => {
    const page = await openBench();
    expect(await page.textContent('.everyday-bench h1')).toBe('Find out whether it actually helps');
    expect(await page.textContent('.everyday-bar-leave')).toBe('⌂ Modes');
    expect(await page.textContent('.everyday-bar-primary')).toBe('Run the suite');
    expect(await page.locator('.everyday-bench-standing li').count()).toBe(3);
    expect(await page.textContent('.everyday-bench-never')).toContain('is not a comparison');
    await page.close();
  }, 120_000);

  it('refuses an empty tick list in § 12.1’s words, and leaves the primary inert', async () => {
    const page = await openBench();
    expect(await page.textContent('.everyday-bench-tests-refusal')).toBe(
      'No tests ticked. Pick at least one.',
    );
    expect(await page.locator('.everyday-bar-primary').isDisabled()).toBe(true);

    await page.click('.everyday-bench-test:has-text("Midtown Office, up-peak")');
    await page.waitForFunction(
      () => document.querySelector('.everyday-bench-tests-refusal') === null,
      undefined,
      { timeout: 15_000 },
    );
    expect(await page.locator('.everyday-bar-primary').isDisabled()).toBe(false);
    await page.close();
  }, 120_000);

  it('names the two design shapes it has no operating point for, rather than inventing them', async () => {
    const page = await openBench();
    const absent = await page.textContent('.everyday-bench-tests-absent');
    expect(absent).toContain('short a lift');
    expect(absent).toContain('sky-lobby transfer');
    await page.close();
  }, 120_000);

  /**
   * The verdict promise follows the field, and follows it **before** anything is run.
   *
   * § 12.2 gives the pairwise verdict only to a field of exactly two. A reader who has ticked
   * three should learn that at the top of the screen rather than eight cell-refusals later, and
   * the only way a screen gets that wrong is by promising the same thing whatever the field is.
   */
  it('changes what it promises about verdicts when a third entrant joins the field', async () => {
    const page = await openBench();
    expect(await page.textContent('.everyday-bench-verdict-note')).toContain('pairwise answer');

    const unpicked = page.locator('.everyday-bench-entrant[aria-pressed="false"]').first();
    await unpicked.click();
    await page.waitForFunction(
      () =>
        /no single pairwise answer/.test(
          document.querySelector('.everyday-bench-verdict-note')?.textContent ?? '',
        ),
      undefined,
      { timeout: 15_000 },
    );
    expect(await page.textContent('.everyday-bench-verdict-note')).toContain(
      'no single pairwise answer',
    );
    expect(await page.locator('.everyday-bench-entrant[aria-pressed="true"]').count()).toBe(3);
    await page.close();
  }, 120_000);

  it('stops offering unpicked entrants at four, and says why on the ones it refuses', async () => {
    const page = await openBench();
    for (let step = 0; step < 2; step += 1) {
      await page.locator('.everyday-bench-entrant[aria-pressed="false"]:not([disabled])').first().click();
      await page.waitForTimeout(120);
    }
    expect(await page.locator('.everyday-bench-entrant[aria-pressed="true"]').count()).toBe(4);
    const refused = page.locator('.everyday-bench-entrant[aria-pressed="false"]').first();
    expect(await refused.isDisabled()).toBe(true);
    expect(await refused.getAttribute('title')).toContain('The field is full at 4');
    await page.close();
  }, 120_000);

  /**
   * The budget control is wired to the count of the work, which is the cheap half of the standing
   * requirement: the expensive half — that the number changes the interval — is measured in
   * `benchModel.test.ts` against the report itself.
   */
  it('moves the live count of the work when the budget or the field changes', async () => {
    const page = await openBench();
    await page.click('.everyday-bench-test:has-text("Midtown Office, up-peak")');
    await page.waitForTimeout(150);
    const at50 = await page.textContent('.everyday-bench-work');
    expect(at50).toBe('1 test · 100 days of simulation');
    expect(await page.locator('.everyday-bench-budget-note').count()).toBe(0);

    await page.click('.everyday-bench-reps[data-reps="10"]');
    await page.waitForFunction(
      (was) => document.querySelector('.everyday-bench-work')?.textContent !== was,
      at50,
      { timeout: 15_000 },
    );
    expect(await page.textContent('.everyday-bench-work')).toBe('1 test · 20 days of simulation');
    expect(await page.textContent('.everyday-bench-budget-note')).toContain(
      'rarely tell anything apart',
    );

    await page.click('.everyday-bench-reps[data-reps="30"]');
    await page.waitForTimeout(150);
    // Thirty is a different claim from ten: the instrument can see, the report will not rank.
    expect(await page.textContent('.everyday-bench-budget-note')).toContain(
      'no row here will name a winner',
    );
    await page.close();
  }, 120_000);
});
