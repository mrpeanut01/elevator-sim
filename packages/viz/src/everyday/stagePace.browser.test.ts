/**
 * **A scored day's stage is fast while nobody has waited a minute and at the player's speed while
 * somebody has, on the shipped bundle** — [§ D1169](../../../../DECISIONS.md), which replaced
 * GitHub issue #592's § D991 rule on every scored day.
 *
 * `stagePace.test.ts` plays a whole day through the real `Playback` over a manual clock and measures
 * the duration. This is the half a unit test cannot reach: that the **stage** — the mounted screen a
 * player uses — asks the rule, moves the transport, lights the chip it is actually at and says why;
 * that a chip pressed while somebody is waiting is the rung every later wait plays at; that one
 * pressed while fast holds until somebody next waits; and that a slice is paced by the same rule,
 * where § D991 left it at one rung.
 *
 * The rung is read off the lit chip, whose label **is** its multiplier (§ D354), and off the note
 * the pace rule writes — both of which are the transport's own state, not a wall-clock reading
 * taken on a shared box. The day's crowd is the date's, so any ordinary call the day raises on the
 * way is answered *leave them* inside the polling predicate, which keeps the transport moving
 * without steering the run.
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
  /*
   * The tower may already be the week standing: since § D1178 a newcomer's first week is Midtown, and
   * the door draws the week you are playing as a selected, disabled row. Press it only when it is not.
   */
  const tower = page.locator(`.everyday-door-tower[data-contract="${contractId}"]`);
  if ((await tower.getAttribute('data-selected')) !== 'true') await tower.click();
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

/**
 * Wait until the pace note starts with `prefix`, answering any ordinary call card on the way with
 * *leave them* so a call's stop cannot hold the day where the note never changes.
 */
async function untilNote(page: Page, prefix: string, timeout: number): Promise<void> {
  await page.waitForFunction(
    (wanted) => {
      const leave = document.querySelector<HTMLButtonElement>(
        '.everyday-stage-call:not([hidden]) .everyday-stage-call-answer[data-answer="leave"]',
      );
      leave?.click();
      return (document.querySelector('.everyday-stage-pace')?.textContent ?? '').startsWith(wanted);
    },
    prefix,
    { timeout, polling: 100 },
  );
}

describe.skipIf(!HAS_BROWSER)('§ D1169 — a scored day is paced by the tutorial’s rule on the stage a player uses', () => {
  it('is fast while nobody has waited a minute, at the player’s speed while somebody has, and keeps a chip', async () => {
    const page = await playDayOn('c2');
    try {
      /* 08:00, the quiet head: nobody on a landing has waited a minute, so the transport is fast. */
      await untilNote(page, 'fast-forwarding at 30×', 30_000);
      expect(await litChip(page)).toBe('30×');
      expect(await paceNote(page)).toBe('fast-forwarding at 30× while nobody on a landing has waited a minute');

      /* Somebody passes a minute: the player's rung, and the note says why. */
      await untilNote(page, 'at your speed', 240_000);
      expect(await litChip(page)).toBe('4×');
      expect(await paceNote(page)).toBe('at your speed, 4×, while somebody on a landing has waited over a minute');

      /* A chip pressed while somebody waits is the rung that wait plays at, and stays the player's rung. */
      await page.click('.everyday-stage-speed:text-is("8×")');
      await untilNote(page, 'at your speed, 8×', 15_000);
      expect(await litChip(page)).toBe('8×');

      /* When the landings clear, fast again: the chip did not pin the rest of the day. */
      await untilNote(page, 'fast-forwarding at 30×', 240_000);
      expect(await litChip(page)).toBe('30×');

      /* A chip pressed while fast holds until somebody next waits a minute, and says so. */
      await page.click('.everyday-stage-speed:text-is("1×")');
      await untilNote(page, 'your speed, 1×', 15_000);
      expect(await paceNote(page)).toBe('your speed, 1×, until somebody on a landing has waited a minute');
      expect(await litChip(page)).toBe('1×');
    } finally {
      await page.close();
    }
  }, 300_000);

  it('paces a contract that plays a slice by the same rule, where § D991 left it at one rung', async () => {
    /* Crown Hotel's crowd has no authored day in `data/`, so Today's scenario plays its slice. */
    const page = await playDayOn('c7');
    try {
      await untilNote(page, 'fast-forwarding at 30×', 30_000);
      expect(await litChip(page)).toBe('30×');
    } finally {
      await page.close();
    }
  }, 300_000);
});
