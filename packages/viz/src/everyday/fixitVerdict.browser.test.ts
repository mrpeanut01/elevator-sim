/**
 * **On the bundle players load, a wrong-family clear is told what it changed and never the
 * diagnosis's story — and an edit after it gives the Run press back** — [§ D1011](../../../../DECISIONS.md).
 *
 * `rescore-ai` C's D1 was reproduced on the built bundle, so it is pinned there: *Two cars out in
 * the wrong month*, car A moved into the High bank on its rezone select, *Run the day*. Before
 * § D1011 the verdict read the case's authored result — *"One car out, two cars on."* and *"The same
 * refit, re-phased"* — which describes moving car **E** back from the works. The run is not that
 * run, leg for leg, and the verdict now says so: it names the order and the row it bought, and
 * prints nothing of the authored narrative.
 *
 * The second half is C's D6 on the same page: the case reads FIXED, the player edits the order, and
 * the verdict is drawn stale with the Run press back — so a fixed case can be run again, which the
 * editor's best loop (a cheaper route) needs.
 *
 * The run is the product's own: the pair on the worker, then — because the pair cleared both bars —
 * the diagnosed repair's own run on the case seed, compared on the legs. Nothing is stubbed.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  openScenarioEntry,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { FIXIT_PAR, FIXIT_PAR_COPY } from '../fixit/par.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5721, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** The authored words the old verdict printed over this route — `data/fixit-cases.json`'s own. */
const AUTHORED_HEAD = 'One car out, two cars on.';
const AUTHORED_PHRASE = 'The same refit, re-phased';

async function openTwoCarsOut(page: Page): Promise<void> {
  await page.goto(`${origin}?building=garden-apartments`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await openScenarioEntry(page, 'fix-a-building');
  await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-case').length > 0, undefined, {
    timeout: 60_000,
  });
  await page.locator('.everyday-fixit-case', { hasText: 'Two cars out in the wrong month' }).click();
  /* Past the case's opening run to its figures — the player's own press, `fixitScreen.browser.test.ts`'s helper. */
  await page.waitForSelector('.everyday-fixit-skip', { timeout: 120_000 });
  await page.click('.everyday-fixit-skip');
  await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-figure').length === 4, undefined, {
    timeout: 120_000,
  });
}

function verdictOf(page: Page) {
  return page.evaluate(() => ({
    head: document.querySelector('.everyday-fixit-outcome-head')?.textContent ?? '',
    card: document.querySelector('.everyday-fixit-outcome')?.textContent ?? '',
    stale: document.querySelector('.everyday-fixit-verdict-stale')?.textContent ?? null,
    primary: document.querySelector<HTMLButtonElement>('.everyday-bar-primary')?.textContent ?? '',
  }));
}

describe.skipIf(!HAS_BROWSER)('a fixed verdict on the shipped bundle — § D1011', () => {
  it('a wrong-family clear shows the composed verdict, never the authored narrative, and goes stale on an edit', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await openTwoCarsOut(page);
      await page.locator('.everyday-fixit-car-A select').selectOption('high');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-fixit-outcome', { timeout: 120_000 });
      /* The verdict lands after the witness's run too; wait for the settled primary rather than the card. */
      await page.waitForFunction(
        () => {
          const label = document.querySelector('.everyday-bar-primary')?.textContent ?? '';
          return label === 'Next building' || label === 'Run it again';
        },
        undefined,
        { timeout: 120_000 },
      );
      const fixed = await verdictOf(page);
      expect(fixed.head).toBe('Fixed, by your own order.');
      expect(fixed.card).not.toContain(AUTHORED_HEAD);
      expect(fixed.card).not.toContain(AUTHORED_PHRASE);
      /* It names the change in the control's own words, and what it did (§ D1158). */
      expect(fixed.card).toContain('Car A runs in High bank');
      expect(fixed.card).toContain('What it did: the complaint went from');
      expect(fixed.card).not.toContain('What it bought');
      expect(fixed.card).not.toContain('describes a different run');
      expect(fixed.card).toContain('they do not say why');
      /* § D1184: the par, the cheapest change the census tried that fixes this letter, and it pays nothing. */
      expect(fixed.card).toContain(
        `The cheapest change we tried that fixes this letter, judged on the same forty-nine mornings, cost ${String(FIXIT_PAR['two-cars-out-wrong-month']?.units)} units.`,
      );
      expect(fixed.card).toContain(FIXIT_PAR_COPY.pays);
      expect(fixed.stale).toBeNull();
      expect(fixed.primary).toBe('Next building');

      /* An edit after the verdict — the parking select, which is free, so no budget can refuse it. */
      await page.locator('.everyday-fixit-parking-select').selectOption({ index: 1 });
      await page.waitForSelector('.everyday-fixit-verdict-stale', { timeout: 15_000 });
      await page.waitForFunction(
        () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '') === 'Run it again',
        undefined,
        { timeout: 15_000 },
      );
      const stale = await verdictOf(page);
      expect(stale.stale).toContain('You have changed the order since this verdict');
      /* The verdict is kept, as a true statement about the order that was run. */
      expect(stale.head).toBe('Fixed, by your own order.');

      /*
       * § D1157, the post-AJ panel's seat C D2: put the order back as the building stands and run it.
       * It does not clear, and the case stays FIXED, with a line over the card saying the card is
       * that run's result. Red before § D1157: the badge went back to OPEN.
       */
      await page.locator('.everyday-fixit-car-A select').selectOption('');
      await page.locator('.everyday-fixit-parking-select').selectOption({ index: 0 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-fixit-fix-kept', { timeout: 120_000 });
      await page.waitForFunction(
        () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '') !== 'Running the day…',
        undefined,
        { timeout: 120_000 },
      );
      const probed = await page.evaluate(() => ({
        head: document.querySelector('.everyday-fixit-outcome-head')?.textContent ?? '',
        kept: document.querySelector('.everyday-fixit-fix-kept')?.textContent ?? '',
        fixedTag: [...document.querySelectorAll('.everyday-fixit-case')]
          .find((row) => (row.textContent ?? '').includes('Two cars out in the wrong month'))
          ?.querySelector('.everyday-fixit-tag')?.textContent ?? '',
      }));
      expect(probed.head).not.toContain('Fixed');
      expect(probed.kept).toContain('This case stays fixed');
      expect(probed.fixedTag).toBe('FIXED');
    } finally {
      await page.close();
    }
  }, 120_000);

  it('a zoning step that opens trips on Midtown runs to a verdict and names the re-drawn crowd — § D1160', async () => {
    /*
     * The post-AJ panel's seat C D1, on the bundle: *Zoning that starves the top*, one press of the
     * overlap stepper, *Run the day*. Red before § D1160: the page printed *"The day could not be
     * run: the fix-it pair on case … claims both runs met the same crowd …"* with passenger ids and
     * arrival times, on every press.
     */
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(`${origin}?building=garden-apartments`, { waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await openScenarioEntry(page, 'fix-a-building');
      await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-case').length > 0, undefined, {
        timeout: 60_000,
      });
      await page.locator('.everyday-fixit-case', { hasText: 'Zoning that starves the top' }).click();
      await page.waitForSelector('.everyday-fixit-skip', { timeout: 120_000 });
      await page.click('.everyday-fixit-skip');
      await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-figure').length === 4, undefined, {
        timeout: 120_000,
      });
      await page.locator('.everyday-fixit-stepper-zones .everyday-fixit-step-up').click();
      await page.locator('.everyday-bar-primary').click();
      await page.waitForFunction(
        () =>
          document.querySelector('.everyday-fixit-outcome') !== null ||
          document.querySelector('.everyday-fixit-run-failed') !== null,
        undefined,
        { timeout: 120_000 },
      );
      const landed = await page.evaluate(() => ({
        failed: document.querySelector('.everyday-fixit-run-failed')?.textContent ?? null,
        card: document.querySelector('.everyday-fixit-outcome')?.textContent ?? '',
      }));
      expect(landed.failed).toBeNull();
      expect(landed.card).toContain('changes which trips the lifts can carry');
      expect(landed.card).not.toMatch(/passenger p\d+|claims both runs/);
    } finally {
      await page.close();
    }
  }, 120_000);
});
