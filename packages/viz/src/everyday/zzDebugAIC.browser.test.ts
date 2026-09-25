/* Scratch probe for lane AI-C. Not committed. */
import { appendFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, openPage, openScenarioEntry, startShippedSite, type ShippedSite } from '../dev/browserTier.test-helper.js';

const OUT = process.env['DBG_OUT'] ?? '/tmp/dbg.txt';
let site: ShippedSite;
let browser: Browser;
beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5734, strictPort: false } });
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 300_000);
afterAll(async () => {
  await browser?.close();
  await site?.close();
});

it.skipIf(!HAS_BROWSER)('debug every deck', async () => {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => appendFileSync(OUT, `console ${m.type()}: ${m.text().slice(0, 300)}\n`));
  page.on('pageerror', (e) => appendFileSync(OUT, `pageerror: ${String(e).slice(0, 300)}\n`));
  await page.goto(`${site.origin}?building=garden-apartments`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true, undefined, { timeout: 60_000 });
  await openScenarioEntry(page, 'fix-a-building');
  await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-case').length > 0, undefined, { timeout: 60_000 });
  await page.locator('.everyday-fixit-case', { hasText: 'Every deck calls itself full' }).click();
  await page.waitForSelector('.everyday-fixit-skip', { timeout: 120_000 });
  await page.click('.everyday-fixit-skip');
  await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-figure').length === 4, undefined, { timeout: 120_000 });
  const state = async (tag: string): Promise<void> => {
    const s = await page.evaluate(() => ({
      zones: document.querySelectorAll('.everyday-fixit-stepper-zones').length,
      zoneReadout: document.querySelector('.everyday-fixit-stepper-zones .everyday-fixit-readout')?.textContent ?? null,
      primary: document.querySelector('.everyday-bar-primary')?.textContent ?? null,
      primaryDisabled: (document.querySelector('.everyday-bar-primary') as HTMLButtonElement | null)?.disabled ?? null,
      outcome: document.querySelector('.everyday-fixit-outcome-head')?.textContent ?? null,
      failed: document.querySelector('.everyday-fixit-run-failed')?.textContent ?? null,
      refused: document.querySelector('.everyday-fixit-families-refused')?.textContent ?? null,
    }));
    appendFileSync(OUT, `${tag} ${JSON.stringify(s)}\n`);
  };
  await state('opened');
  const up = page.locator('.everyday-fixit-stepper-zones .everyday-fixit-step-up');
  if ((await up.count()) > 0) await up.first().click({ timeout: 10_000 }).catch((e) => appendFileSync(OUT, `click failed ${String(e).slice(0, 200)}\n`));
  await state('stepped');
  await page.locator('.everyday-bar-primary').click();
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(10_000);
    await state(`t+${String((i + 1) * 10)}s`);
  }
}, 600_000);
