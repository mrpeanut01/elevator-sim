/* Scratch probe for lane AI-C: the fifty-morning judge's wait on the built bundle. Not committed. */
import { appendFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  openScenarioEntry,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

const OUT = process.env['WAIT_OUT'] ?? '/tmp/wait.jsonl';
const REPEATS = Number(process.env['WAIT_REPEATS'] ?? '1');
const IDLE_MS = Number(process.env['WAIT_IDLE_MS'] ?? '30000');
const ONLY = process.env['WAIT_ONLY']?.split(',');

let site: ShippedSite;
let browser: Browser;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5733, strictPort: false } });
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 300_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

type Route = (page: Page) => Promise<void>;
const sel = (css: string, label: string): Route => async (page) => {
  await page.locator(css).first().selectOption({ label });
};
const click = (css: string, times = 1): Route => async (page) => {
  for (let i = 0; i < times; i += 1) await page.locator(css).first().click();
};
const both = (...routes: Route[]): Route => async (page) => {
  for (const route of routes) await route(page);
};

const ROUTES: Record<string, [string, Route]> = JSON.parse('{}');
const add = (name: string, match: string, route: Route): void => {
  ROUTES[name] = [match, route];
};
add('sleeping-sky-lobby', 'The sleeping sky lobby', sel('.everyday-fixit-parking-select', 'where each one last stopped'));
add('zoning-starves-the-top', 'Zoning that starves', async (page) => { await page.locator('.everyday-fixit-car-A select').first().selectOption('high'); });
add('three-cars-one-cars-work', "Three cars, one car", sel('.everyday-fixit-parking-select', 'in the middle of its own zone'));
add('doors-that-never-close', 'The doors that never close', both(sel('.everyday-fixit-door-hall select', '5.0 s'), sel('.everyday-fixit-door-car select', '3.0 s')));
add('car-park-nobody-serves', 'The car park nobody serves', click('.everyday-fixit-stepper-zones .everyday-fixit-step-up'));
add('deliveries-on-the-passenger-group', 'Deliveries on the passenger', both(sel('.everyday-fixit-door-hall select', '5.0 s'), sel('.everyday-fixit-door-car select', '3.0 s')));
add('one-start-time', 'One start time', both(sel('.everyday-fixit-parking-select', 'back down at the lobby'), click('.everyday-fixit-stepper-speed .everyday-fixit-step-up')));
add('every-letter-says-nine', 'Every letter says nine', click('.everyday-fixit-stepper-elevation .everyday-fixit-step-up', 3));
add('bed-cars-locked-out', 'The bed cars locked out', click('.everyday-fixit-stepper-zones .everyday-fixit-step-up'));
add('two-cars-out-wrong-month', 'Two cars out', async (page) => { await page.locator('.everyday-fixit-car-A select').first().selectOption('high'); });
add('every-deck-calls-itself-full', 'Every deck calls itself full', click('.everyday-fixit-stepper-capacity .everyday-fixit-step-up'));

describe.skipIf(!HAS_BROWSER)('the judge’s wait', () => {
  it('measures press → checking → verdict per case', async () => {
    for (const [id, [match, route]] of Object.entries(ROUTES)) {
      if (ONLY !== undefined && !ONLY.includes(id)) continue;
      for (let r = 0; r < REPEATS; r += 1) {
        const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
        try {
          await page.goto(`${site.origin}?building=garden-apartments`, { waitUntil: 'load' });
          await page.waitForFunction(() => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true, undefined, { timeout: 60_000 });
          await openScenarioEntry(page, 'fix-a-building');
          await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-case').length > 0, undefined, { timeout: 60_000 });
          await page.locator('.everyday-fixit-case', { hasText: match }).click();
          await page.waitForSelector('.everyday-fixit-skip', { timeout: 120_000 });
          await page.click('.everyday-fixit-skip');
          await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-figure').length === 4, undefined, { timeout: 120_000 });
          await page.waitForTimeout(IDLE_MS);
          await route(page);
          const t0 = Date.now();
          await page.locator('.everyday-bar-primary').click();
          await page.waitForFunction(() => document.querySelector('.everyday-fixit-outcome') !== null, undefined, { timeout: 300_000 });
          const tGate = Date.now() - t0;
          const kind0 = await page.evaluate(() => document.querySelector('.everyday-bar-primary')?.textContent ?? '');
          await page.waitForFunction(() => !/more mornings/.test(document.querySelector('.everyday-bar-primary')?.textContent ?? ''), undefined, { timeout: 600_000 });
          const tVerdict = Date.now() - t0;
          const head = await page.evaluate(() => document.querySelector('.everyday-fixit-outcome-head')?.textContent ?? '');
          appendFileSync(OUT, JSON.stringify({ id, r, idleMs: IDLE_MS, gateMs: tGate, verdictMs: tVerdict, checking: /more mornings/.test(kind0), head }) + '\n');
        } catch (error) {
          appendFileSync(OUT, JSON.stringify({ id, r, err: String(error).slice(0, 300) }) + '\n');
        } finally {
          await page.close();
        }
      }
    }
  }, 7_200_000);
});
