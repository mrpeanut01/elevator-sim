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
  await page.locator('.everyday-mode', { hasText: 'Campaign' }).first().click();
  await page.waitForSelector('.everyday-towers', { timeout: 15_000 });
}

/** What the towers screen says the career is, read off the page rather than out of a store. */
async function towersMeta(page: Page): Promise<string> {
  return (await page.locator('.everyday-towers-meta').first().textContent()) ?? '';
}

describe.skipIf(!HAS_BROWSER)('a career survives a reload', () => {
  it('comes back on a second load, read off the screen both times', async () => {
    const page = await coldLoad();
    try {
      await enterCampaign(page);
      const before = await towersMeta(page);
      expect(before.trim()).not.toBe('');

      /*
       * Move the career, so the assertion is about a *restored* record rather than about two
       * identical opening careers — which is the vacuity this case would otherwise have. Opening a
       * tower writes `openTowerId`, which is career state and goes through the host's one writer.
       */
      await page.click('.everyday-towers-open');
      await page.waitForSelector('.everyday-building', { timeout: 15_000 });

      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );

      /* § D366: a reload lands on the main menu whichever screen the player was on. */
      await page.waitForSelector('.everyday-mode', { timeout: 30_000 });

      await enterCampaign(page);
      expect(await towersMeta(page)).toBe(before);
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
