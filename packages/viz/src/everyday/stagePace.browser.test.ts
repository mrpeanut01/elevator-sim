/**
 * **A whole day's stage crosses the quiet at 30× and plays its peaks at the player's speed, on the
 * shipped bundle** — GitHub issue #592, [§ D991](../../../../DECISIONS.md).
 *
 * `stagePace.test.ts` plays a whole day through the real `Playback` over a manual clock and measures
 * the duration. This is the half a unit test cannot reach: that the **stage** — the mounted screen a
 * player uses — asks the rule, moves the transport, lights the chip it is actually at and says why,
 * and that a chip press takes the speed back for the rest of the day. And the other direction: a
 * contract that plays a slice is not paced at all.
 *
 * The rung is read off the lit chip, whose label **is** its multiplier (§ D354), and off the note
 * the pace rule writes — both of which are the transport's own state, not a wall-clock reading
 * taken on a shared box.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openEverydayDoor,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /* Its own port — `dev/browserTier.test.ts` requires every tier file's to be distinct. */
  site = await startShippedSite({ preview: { port: 5641, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** Open Today's scenario on `contractId`, start the day, and wait for the stage to be playing. */
async function playDayOn(contractId: string): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await openEverydayDoor(page);
  await page.click(`.everyday-door-tower[data-contract="${contractId}"]`);
  await page.waitForSelector(`.everyday-door-tower[data-contract="${contractId}"][data-selected="true"]`, {
    timeout: 30_000,
  });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.everyday-stage-start')?.checkVisibility() === true,
    undefined,
    { timeout: 240_000 },
  );
  await page.locator('.everyday-stage-start').click();
  return page;
}

/** The chip the transport is lit at. */
async function litChip(page: Page): Promise<string> {
  return (await page.textContent('.everyday-stage-speed[aria-pressed="true"]')) ?? '';
}

async function paceNote(page: Page): Promise<string> {
  return (await page.textContent('.everyday-stage-pace')) ?? '';
}

describe.skipIf(!HAS_BROWSER)('§ D991 — the whole day is paced on the stage a player uses', () => {
  it('crosses the quiet head at 30×, plays the morning peak at 4×, and a chip press is the player’s', async () => {
    const page = await playDayOn('c2');
    try {
      /* 08:00–08:30 is quiet: the transport is at the between rung, and the note says why and until when. */
      await page.waitForFunction(
        () => document.querySelector('.everyday-stage-pace')?.textContent?.includes('between peaks') === true,
        undefined,
        { timeout: 30_000 },
      );
      expect(await litChip(page)).toBe('30×');
      expect(await paceNote(page)).toContain('next peak at 08:30');

      /* Inside the morning act the transport is back at the player's rung. */
      await page.waitForFunction(
        () => document.querySelector('.everyday-stage-pace')?.textContent?.startsWith('a peak') === true,
        undefined,
        { timeout: 240_000 },
      );
      expect(await litChip(page)).toBe('4×');
      expect(await paceNote(page)).toContain('until 09:00');
      const clock = (await page.textContent('.everyday-stage-clock')) ?? '';
      expect(clock >= '08:30' && clock < '09:00', clock).toBe(true);

      /* A chip press is the player's: the stage stops pacing and says so. */
      await page.click('.everyday-stage-speed:text-is("8×")');
      await page.waitForFunction(
        () => document.querySelector('.everyday-stage-pace')?.textContent?.startsWith('your speed') === true,
        undefined,
        { timeout: 15_000 },
      );
      expect(await litChip(page)).toBe('8×');
    } finally {
      await page.close();
    }
  }, 300_000);

  it('does not pace a contract that plays a slice: one rung, and no note', async () => {
    /* Crown Hotel's crowd has no authored day in `data/`, so Today's scenario plays its slice. */
    const page = await playDayOn('c7');
    try {
      await page.waitForFunction(
        () => /^\d{2}:\d{2}$/u.test(document.querySelector('.everyday-stage-clock')?.textContent ?? ''),
        undefined,
        { timeout: 30_000 },
      );
      /* Give the transport several seconds of play in which it could have been paced, and it is not. */
      const before = (await page.textContent('.everyday-stage-clock')) ?? '';
      await page.waitForFunction(
        (start) => (document.querySelector('.everyday-stage-clock')?.textContent ?? '') !== start,
        before,
        { timeout: 60_000 },
      );
      expect(await litChip(page)).toBe('4×');
      expect(await paceNote(page)).toBe('');
    } finally {
      await page.close();
    }
  }, 300_000);
});
