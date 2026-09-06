/**
 * The first session's draw, through the shipped boot — GitHub issue #208, § D475, § D514.
 *
 * Three loads, three claims. A bare load with a seed and no session draws one of the five legible
 * towers, and the door says why under the seed line. The same seed draws the same tower, which is
 * what a named stream buys. An address naming a building is the player's choice and wins, and the
 * door then says nothing about a draw. The tier reaches the door by the player's own route.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, openEverydayDoor, openPage } from '../dev/browserTier.test-helper.js';
import { CONTRACTS, contractById } from '../shift/contracts.js';
import { ELIGIBLE_FIRST_CONTRACT_IDS, firstSessionContractFor } from '../shift/firstSession.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5231, strictPort: false },
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

async function coldLoad(search: string): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}${search}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

async function doorOf(page: Page): Promise<{ title: string; seed: string; line: string | null }> {
  await openEverydayDoor(page);
  return page.evaluate(() => ({
    title: document.querySelector('.everyday-door-title')?.textContent ?? '',
    seed: document.querySelector('.everyday-door-seed')?.textContent ?? '',
    line: document.querySelector('.everyday-door-first-session')?.textContent ?? null,
  }));
}

const SEED = 20_260_906;

describe.skipIf(!HAS_BROWSER)('the first session’s tower — GitHub issue #208', () => {
  it('draws one of the five legible towers on a bare first load, and the door says why', async () => {
    const page = await coldLoad(`?seed=${String(SEED)}`);
    try {
      const door = await doorOf(page);
      const drawn = contractById(firstSessionContractFor(SEED));
      expect(drawn).toBeDefined();
      expect(ELIGIBLE_FIRST_CONTRACT_IDS).toContain(drawn?.id);
      expect(door.seed).toContain(`tower ${drawn?.buildingId ?? ''}`);
      expect(door.seed).toContain(`crowd ${String(SEED)}`);
      expect(door.line).toContain('five towers');
      /* Not the campaign's opener, which the instrument found never legible. */
      expect(door.seed).not.toContain('tower garden-apartments');
    } finally {
      await page.close();
    }
  }, 120_000);

  it('honours an address that names a building, and then says nothing about a draw', async () => {
    const page = await coldLoad(`?building=garden-apartments&seed=${String(SEED)}`);
    try {
      const door = await doorOf(page);
      expect(door.seed).toContain('tower garden-apartments');
      expect(door.line).toBeNull();
      expect(CONTRACTS[0]?.buildingId).toBe('garden-apartments');
    } finally {
      await page.close();
    }
  }, 120_000);
});
