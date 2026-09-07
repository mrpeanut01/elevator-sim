/**
 * **A career survives a reload** — GitHub issue #375, § D525's *"the Campaign becomes a Career that
 * persists"*.
 *
 * Driven in the browser tier rather than asserted at the unit tier, and the issue says why: **the
 * defect this closes is a reload defect.** `careerPersist.test.ts` has the codec and both
 * directions of refusal; a unit test cannot reload a page, so it cannot fail the way a player's
 * afternoon failed.
 *
 * The route is the player's own — the Campaign tile, the triage row — for
 * `browserTier.test-helper.ts`'s standing reason: a tier that reached a surface by a path no player
 * has is a tier that tests a surface nobody can open.
 */
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CAREER_STORAGE_KEY } from '../campaign/careerPersist.js';
import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite | undefined;
let browser: Browser | undefined;
let origin = '';

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5221, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function coldLoad(): Promise<Page> {
  if (browser === undefined) throw new Error('no browser');
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

async function enterCampaign(page: Page): Promise<void> {
  /*
   * By id, not by prose. § D525 renames this tile *Campaign* -> *Career*, and this file was
   * written on a branch where it still read Campaign — so a `hasText` locator matched nothing the
   * moment the rename landed. `browserTier.test-helper.ts` records the lesson: an id survives a
   * rename and a label does not, which is why the shipped tile carries one.
   */
  await page.locator('.everyday-mode[data-screen="towers"]').first().click();
  await page.waitForSelector('.everyday-towers', { timeout: 15_000 });
}

/** What the towers screen says the career is, read off the page rather than out of a store. */
async function towersMeta(page: Page): Promise<string> {
  return (await page.locator('.everyday-towers-meta').first().textContent()) ?? '';
}

describe.skipIf(!HAS_BROWSER)('a career survives a reload', () => {
  it('restores a career the page did not create, read off the screen', async () => {
    /*
     * **This case was vacuous in its first form, and the fix is what it asserts on.**
     *
     * It used to open a tower, reload, and compare `.everyday-towers-meta` either side. That string
     * is built from `carry` and `towers` (`campaignModel.ts#towersView`), and `open-tower` writes
     * only `openTowerId` — so a *fresh* career after the reload produced the identical string, and
     * an independent review proved it by disabling the restore and watching all three cases pass.
     *
     * So the mutation now moves a field the screen actually reads, and it is written **into
     * storage** rather than through the UI: a career this page never created cannot appear on the
     * screen unless the host read it back. Disable the restore and this fails on the first assert.
     */
    const page = await coldLoad();
    try {
      await enterCampaign(page);
      const fresh = await towersMeta(page);
      expect(fresh.trim()).not.toBe('');

      /*
       * Cause a save first. The host writes through `setCareer`, which runs on a mutation — so a
       * career nobody has touched is never in storage, and the guard below caught that on the
       * first run of this case. Opening a tower is the cheapest mutation the screen offers.
       */
      await page.click('.everyday-towers-open');
      await page.waitForSelector('.everyday-building', { timeout: 15_000 });

      /* A career with standing banked — `carry` is in the meta line, `openTowerId` is not. */
      const planted = await page.evaluate((key) => {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return null;
        const envelope = JSON.parse(raw) as { version: number; career: Record<string, unknown> };
        envelope.career['carry'] = 4321;
        window.localStorage.setItem(key, JSON.stringify(envelope));
        return JSON.stringify(envelope);
      }, CAREER_STORAGE_KEY);

      // Non-vacuity: if nothing was written, the reload below proves nothing.
      expect(planted, 'no career was saved, so there is nothing to restore').not.toBeNull();

      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForSelector('.everyday-mode', { timeout: 30_000 });
      await enterCampaign(page);

      const restored = await towersMeta(page);
      expect(restored).not.toBe(fresh);
      expect(restored).toContain('4321');
    } finally {
      await page.close();
    }
  }, 120_000);

  it('lands on the main menu after a reload, never on the screen it was left on', async () => {
    /*
     * § D366, asserted here rather than assumed: nothing this issue persists may become an
     * entry-screen override. The career comes back; the *place* does not.
     */
    const page = await coldLoad();
    try {
      await enterCampaign(page);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForSelector('.everyday-mode', { timeout: 30_000 });
      expect(await page.locator('.everyday-towers').count()).toBe(0);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('draws no load refusal when the career restored cleanly', async () => {
    // The notice is present only when a load actually refused. A first-ever load has nothing to
    // apologise for, and a notice there would read as a fault.
    const page = await coldLoad();
    try {
      await enterCampaign(page);
      expect(await page.locator('.everyday-towers-career-notice').count()).toBe(0);
    } finally {
      await page.close();
    }
  }, 120_000);
});
