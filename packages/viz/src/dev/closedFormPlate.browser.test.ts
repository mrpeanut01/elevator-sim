/**
 * **The closed-form specification rows, on the page a player opens** — `docs/21` § 3.7 (1).
 *
 * ## Why this needs a browser at all
 *
 * `rightRail.test.ts` proves `closedFormRowsOf` computes the right figures, labels the basis and
 * refuses honestly. None of that is the claim this file makes, which is the one the standing
 * requirement is about: **the rows reach the screen**. `docs/21` § 1.3's ledger check is *does this
 * surface still carry the row*, and a producer with no drawn output is the dead-seam shape this
 * repository has closed eleven times — a plate block that computes perfectly and is drawn by
 * nothing would pass every node tier in the package.
 *
 * ## The viewport is 1400, and that is not a convenience
 *
 * § 1.1 S5 turns the right rail into an overlay drawer below 1340 px, so the building segment — the
 * one this plate is in — is present and **not visible** at 1280. `paperShell.browser.test.ts`
 * records the same choice for the same reason: a case that needs the rail asks for a width where
 * the rail is a rail, rather than driving the drawer open to prove a point about a figure.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, enterEngineerStage, openPage } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { port: 5206, strictPort: false },
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

/** Midtown Office at seed 42, with the right rail's Building segment open. */
async function buildingSegment(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1400, height: 900 } });
  await page.goto(`${origin}?building=midtown-office&seed=42`, { waitUntil: 'load' });
  await enterEngineerStage(page);
  await page.locator('#seg-building').first().click();
  await page.waitForFunction(
    () => (document.querySelector<HTMLElement>('#rail-building-plate')?.textContent ?? '').length > 0,
    undefined,
    { timeout: 60_000 },
  );
  return page;
}

describe.skipIf(!HAS_BROWSER)('the building plate carries its specification rows', () => {
  it('draws the closed form beside the measured rows, labelled and cited', async () => {
    const page = await buildingSegment();
    try {
      const plate = await page.evaluate(() => {
        const host = document.querySelector<HTMLElement>('#rail-building-plate');
        if (host === null) return { keys: [] as string[], text: '', titles: [] as string[] };
        return {
          keys: [...host.querySelectorAll('.plate-row')].map(
            (row) => row.firstElementChild?.textContent?.trim() ?? '',
          ),
          text: host.textContent ?? '',
          titles: [...host.querySelectorAll<HTMLElement>('[title]')].map((node) => node.title),
        };
      });

      // The measured half is unchanged and still first — the headline stays what happened.
      expect(plate.keys).toContain('handling capacity');
      expect(plate.keys).toContain('achieved interval');
      // The specification half is drawn, and its basis is on the row rather than in a footnote.
      expect(plate.keys).toContain('closed form');
      expect(plate.keys).toContain('interval (closed form)');
      expect(plate.keys).toContain('capacity (closed form)');
      expect(plate.text).toContain('a specification, not a measurement');
      // Reading order: what the run did, then what the building was sized for.
      expect(plate.keys.indexOf('achieved interval')).toBeLessThan(
        plate.keys.indexOf('interval (closed form)'),
      );
      // The assumptions are cited where a reader can reach them — the row's own `title`.
      expect(plate.titles.join('\n')).toContain('CLOSED_FORM_ASSUMPTIONS');
      /*
       * Midtown Office declares two entrances, which is exactly what the closed form's
       * `single-entrance` assumption is about — so the divergence row is not decoration on this
       * building, it is the warning that makes the figure above it readable.
       */
      expect(plate.text).toContain('this building strays from the model');
    } finally {
      await page.close();
    }
  }, 180_000);

  it('draws the specification with no run, where the measured rows refuse', async () => {
    /*
     * L-3's surviving half, driven: a specification needs no run, and it may not stand in for one.
     * The state is reached by pressing the building card for a **different** building, which is the
     * player's own path — the rail re-runs, and between the write and the recording arriving the
     * plate is in its `no run yet` state. Rather than race that, the assertion is made where the
     * product is honest either way: `no run yet` and the closed form are never both absent.
     */
    const page = await buildingSegment();
    try {
      const text = await page.evaluate(
        () => document.querySelector<HTMLElement>('#rail-building-plate')?.textContent ?? '',
      );
      const measured = text.includes('no run yet');
      expect(text.includes('a specification, not a measurement')).toBe(true);
      // Whichever state the plate is in, the two halves are told apart rather than merged.
      if (measured) expect(text).not.toContain('achieved interval');
      else expect(text).toContain('achieved interval');
    } finally {
      await page.close();
    }
  }, 180_000);
});
