/**
 * The first session's draw, through the shipped boot — GitHub issue #208, § D475, § D514.
 *
 * Three loads, three claims. A bare load with a seed and no session draws one of the five legible
 * towers, and the door says why under the seed line. The same seed draws the same tower, which is
 * what a named stream buys. An address naming a building is the player's choice and wins, and the
 * door then says nothing about a draw. The tier reaches the door by the player's own route.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, openEverydayDoor, openPage, startShippedSite, type ShippedSite } from '../dev/browserTier.test-helper.js';
import { CONTRACTS, contractById } from '../shift/contracts.js';
import { ELIGIBLE_FIRST_CONTRACT_IDS, firstSessionContractFor } from '../shift/firstSession.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5231, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
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

/* -------------------------------------------------------------------------- *
 * The consent ask — GitHub issue #340, `docs/26-telemetry-and-privacy.md` §§ 4 and 7.6
 * -------------------------------------------------------------------------- */

/**
 * § 7.6's second test, and it is a browser-tier test *because the section says so*: *"With the
 * transport unset — the `vite dev` case, and any deployment with no API origin tag — a session
 * completes all five beats and every screen behaves identically. This is `docs/26 P-6`, and it is a
 * browser-tier test rather than an argument."*
 *
 * The shipped preview this tier serves carries **no `<meta name="elevator-sim-api">`**, which is not
 * a limitation of the harness but the artifact's own shipped state (`vite.config.ts`: *"Unset is the
 * shipped state, and it is what `vite dev` and the `Dockerfile` both build with"*). So every case
 * below runs against exactly the deployment § 7.6 names, and *nothing is sent anywhere* is a
 * property of the page rather than of a stub.
 *
 * It lives in this file rather than in one of its own because the ask **is** a first-session
 * surface, and because a new file in this tier would have to claim a port nobody else has —
 * `dev/browserTier.test.ts` derives that rule and enforces it.
 */
describe.skipIf(!HAS_BROWSER)('the consent ask — GitHub issue #340', () => {
  const slotOf = async (page: Page): Promise<string | null> =>
    page.evaluate(() => window.localStorage.getItem('elevator-sim.telemetry'));

  const askOf = async (page: Page): Promise<{ heading: string | null; no: string | null; yes: string | null }> =>
    page.evaluate(() => ({
      heading: document.querySelector('.everyday-consent-heading')?.textContent ?? null,
      no: document.querySelector('.everyday-consent-no')?.textContent ?? null,
      yes: document.querySelector('.everyday-consent-yes')?.textContent ?? null,
    }));

  it('asks on a first load, and the screen behind it is fully usable', async () => {
    const page = await coldLoad('');
    try {
      const ask = await askOf(page);
      expect(ask.heading, 'the ask is not drawn on a device that has never been asked').not.toBeNull();
      expect(ask.no).toBeTruthy();
      expect(ask.yes).toBeTruthy();

      /*
       * § 4.4: *"A gate. No screen waits on an answer."* The screen behind the notice is drawn and
       * enterable with the question unanswered, which is what distinguishes a notice from the
       * consent wall § 10 non-goal 3 refuses by name.
       *
       * The assertion is *a screen opens*, not *the front door drew its tiles*: § D529 puts a
       * two-screen tutorial before the front door on a first session, so a fresh device is not on
       * the menu when the ask appears — which the tier reported as zero tiles before this comment
       * existed. Opening a screen is the stronger claim anyway; a wall would refuse it.
       */
      const drawn = await page.locator('.everyday-screen > *').count();
      expect(drawn, 'nothing was drawn behind the ask').toBeGreaterThan(0);
      await openEverydayDoor(page);
      const door = await page.evaluate(() => document.querySelector('.everyday-door-title')?.textContent ?? '');
      expect(door, 'a screen would not open while the question was unanswered').not.toBe('');

      // P-1, on the shipped page: no identifier before an answer, and nothing written at all.
      expect(await slotOf(page)).toBeNull();
    } finally {
      await page.close();
    }
  }, 120_000);

  it('takes no for an answer, mints no identifier, and never asks again', async () => {
    const page = await coldLoad('');
    try {
      await page.locator('.everyday-consent-no').click();
      expect((await askOf(page)).heading, 'the ask was still drawn after an answer').toBeNull();

      const stored = await slotOf(page);
      expect(stored, 'the refusal was not remembered').not.toBeNull();
      const record = JSON.parse(stored ?? '{}') as Record<string, unknown>;
      expect(record['state']).toBe('refused');
      // § 4.2, and P-1: a refusal mints nothing. There is no id in the slot to find.
      expect(record['playerId']).toBeUndefined();

      // § 10 non-goal 3: no repeated asking after a refusal, across a reload rather than within a
      // mount — a flag that lived in the shell would pass the first half and fail this one.
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      expect((await askOf(page)).heading, 'the question came back after a refusal').toBeNull();
    } finally {
      await page.close();
    }
  }, 120_000);

  it('takes yes, mints one identifier, and plays a whole first session with nowhere to send it', async () => {
    const page = await coldLoad('');
    try {
      await page.locator('.everyday-consent-yes').click();
      const record = JSON.parse((await slotOf(page)) ?? '{}') as Record<string, unknown>;
      expect(record['state']).toBe('granted');
      expect(String(record['playerId'])).toMatch(/^[0-9a-f]{32}$/u);

      /*
       * § 7.6's second test proper. This build has no API origin, so the recorder's transport is
       * `undefined` and every batch is dropped. The page has to be indistinguishable from one that
       * never had a recorder — so the beats are walked and the product is required to behave.
       */
      await openEverydayDoor(page);
      const door = await page.evaluate(() => document.querySelector('.everyday-door-title')?.textContent ?? '');
      expect(door).not.toBe('');
      await page.locator('.everyday-rail-settings').click();
      await page.waitForSelector('.everyday-settings', { timeout: 30_000 });

      // And the row § 4.3 requires: reachable, drawn on, and it is the way back out.
      const row = await page.evaluate(() => ({
        face: document.querySelector('.everyday-settings-telemetry')?.textContent ?? null,
        note: document.querySelector('.everyday-settings-telemetry-note')?.textContent ?? null,
      }));
      expect(row.face, 'the consent row is not on the settings screen').toBe('on');
      expect(row.note).toBeTruthy();

      await page.locator('.everyday-settings-telemetry').click();
      const withdrawn = JSON.parse((await slotOf(page)) ?? '{}') as Record<string, unknown>;
      // § 4.3: withdrawal deletes rather than stops. The identifier is gone from the device even
      // though there was no server to ask, which is the failure mode that section names.
      expect(withdrawn['state']).toBe('withdrawn');
      expect(withdrawn['playerId']).toBeUndefined();
      expect(
        await page.evaluate(() => document.querySelector('.everyday-settings-telemetry')?.textContent ?? ''),
        'the row did not draw off after a withdrawal',
      ).toBe('off');
    } finally {
      await page.close();
    }
  }, 120_000);
});
