/**
 * **The post-AP playtest's rush findings, by the player's own route** — wave AQ, lane AQ-3.
 *
 * 1. The furthest round survives a reload ([§ D1515](../../../../DECISIONS.md)): a round ended by
 *    hand, a reload, and the setup screen draws its wave as kept on this device.
 * 2. A reload mid-round says, on the way back to the rush, that the round was not kept.
 * 3. The choice chips are inside the viewport and hit-testable at 1280×600 and on a 390×844 phone;
 *    since § D1589 they are the handover alone, with no parking chip, and a greyed row says why.
 * 4. *End the rush* asks once, with focus on *Keep playing*.
 * 5. The result's loud button is *Run the rush again*, with no second *Leave the rush*.
 * 6. After *Start the rush*, keyboard focus is on *Play*.
 *
 * Red on the base: every one of these. The facts read *"no round has finished since this page
 * opened"* after the reload, nothing was said about the lost round, the chips sat at y ≈ 700 under a
 * footer at 555, one press of *End the rush* ended the round, the result's orange button was *Leave
 * the rush*, and focus was on the page body.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5341, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** Past the lobby and the one-time consent question, onto the rush setup screen. */
async function openRushSetup(page: Page): Promise<void> {
  await leaveTutorialIfOffered(page);
  if ((await page.locator('.everyday-consent-no').count()) > 0) await page.locator('.everyday-consent-no').click();
  await page.locator('.everyday-mode[data-screen="rush"]').click();
  await page.waitForSelector('.everyday-rush-driving', { timeout: 15_000 });
}

async function startRush(page: Page): Promise<void> {
  await page.locator('.everyday-bar-primary').click();
  await page.waitForFunction(
    () => /^WAVE \d+$/u.test(document.querySelector('.everyday-stage-phase')?.textContent ?? ''),
    undefined,
    { timeout: 60_000 },
  );
}

async function coldLoad(width: number, height: number): Promise<Page> {
  const page = await openPage(browser, { viewport: { width, height } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true, undefined, {
    timeout: 30_000,
  });
  return page;
}

/** Every choice chip on the rush stage, with whether its centre is in the viewport and hits it. */
async function chipsReach(page: Page): Promise<readonly { readonly label: string; readonly inView: boolean; readonly hit: boolean }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.everyday-stage-intervene, .everyday-stage-switch-pick')]
      .filter((node) => !node.hidden)
      .map((node) => {
        const box = node.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const inView = box.top >= 0 && box.bottom <= window.innerHeight && box.left >= 0 && box.right <= window.innerWidth;
        const at = document.elementFromPoint(x, y);
        return { label: node.textContent ?? '', inView, hit: at !== null && (at === node || node.contains(at)) };
      }),
  );
}

/**
 * The round's one in-round choice is ready: the handover picker is enabled. Since § D1589 a rush has
 * no parking chip, and *Switch to* stays disabled while the picker names the driver already driving,
 * so an enabled button is no longer the signal.
 */
async function waitForChoice(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector<HTMLSelectElement>('.everyday-stage-switch-pick')?.disabled === false,
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * [§ D1589](../../../../DECISIONS.md), the decision panel's ruling R5 on GitHub issue #635: no parking
 * chip on the rush stage, and every greyed handover row says why on itself. Red on the base: two
 * parking chips, and four greyed rows that were not greyed and carried only a name.
 */
async function noParkingAndGreyedSaysWhy(page: Page): Promise<{ parking: number; greyed: number; greyedSayWhy: number }> {
  return page.evaluate(() => {
    const greyed = [...document.querySelectorAll<HTMLOptionElement>('.everyday-stage-switch-pick option')].filter(
      (option) => option.disabled,
    );
    return {
      parking: document.querySelectorAll(
        '[data-intervention-kind="park-cars-lobby"], [data-intervention-kind="spread-cars"]',
      ).length,
      greyed: greyed.length,
      greyedSayWhy: greyed.filter((option) => /can’t take over mid-round: /u.test(option.textContent ?? '')).length,
    };
  });
}

describe.skipIf(!HAS_BROWSER)('Rush, after the post-AP playtest — wave AQ, lane AQ-3', () => {
  it('at 1280×600: focus on Play, chips reachable, End asks once, the result leads with the next round, and the furthest survives a reload', async () => {
    const page = await coldLoad(1280, 600);
    try {
      await openRushSetup(page);
      await startRush(page);

      /* 6: focus is on Play, not the page body. */
      await page.waitForFunction(() => document.activeElement?.classList.contains('everyday-stage-play') === true, undefined, {
        timeout: 30_000,
      });

      /* 3: every chip is inside the viewport and is what a tap at its centre lands on. */
      await waitForChoice(page);
      const chips = await chipsReach(page);
      /* § D1589: the picker and *Switch to*, and no parking chip. */
      expect(chips.length).toBeGreaterThanOrEqual(2);
      expect(await noParkingAndGreyedSaysWhy(page)).toEqual({ parking: 0, greyed: 4, greyedSayWhy: 4 });
      for (const chip of chips) expect(chip, chip.label).toMatchObject({ inView: true, hit: true });

      /* 4: the first press asks, focus on Keep playing, and Keep playing stays on the stage. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-end-confirm:not([hidden])', { timeout: 15_000 });
      expect(await page.evaluate(() => document.activeElement?.className)).toBe('everyday-stage-end-confirm-back');
      await page.locator('.everyday-stage-end-confirm-back').click();
      expect(await page.locator('.everyday-stage-end-confirm').isHidden()).toBe(true);
      expect(await page.locator('.everyday-rush-result').count()).toBe(0);

      /* And End it ends the round, on its own result. */
      await page.locator('.everyday-bar-primary').click();
      await page.locator('.everyday-stage-end-confirm-go').click();
      await page.waitForSelector('.everyday-rush-result', { timeout: 15_000 });
      const ended = (await page.textContent('.everyday-rush-result-head')) ?? '';
      const wave = /wave (\d+)/u.exec(ended)?.[1];
      expect(wave).toBeDefined();

      /* 5: the loud button is the next round, and there is one way out. */
      const bar = await page.evaluate(() => ({
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
        wayOut: document.querySelectorAll('.everyday-bar-wayout').length,
        leave: [...document.querySelectorAll('.everyday-bar button')].filter((node) => /Leave the rush/u.test(node.textContent ?? '')).length,
      }));
      expect(bar).toEqual({ primary: 'Run the rush again', wayOut: 0, leave: 1 });

      /* 1: reload, back to the rush, and the round is drawn as kept on this device. */
      await page.reload({ waitUntil: 'load' });
      await openRushSetup(page);
      await page.waitForFunction(
        /* The replay lands on a later frame; until then the fact reads as checking. */
        () => /^wave \d+$/u.test(document.querySelector('.everyday-rush-fact-value')?.textContent ?? ''),
        undefined,
        { timeout: 60_000 },
      );
      expect(await page.textContent('.everyday-rush-fact-value')).toBe(`wave ${String(wave)}`);
      expect(await page.textContent('.everyday-rush-fact-label')).toMatch(/kept on this device/u);
      expect(await page.textContent('.everyday-rush-facts')).not.toMatch(/since this page opened/u);
    } finally {
      await page.close();
    }
  });

  it('on a 390×844 phone the chips are above the fold and hit-testable', async () => {
    const page = await coldLoad(390, 844);
    try {
      await openRushSetup(page);
      await startRush(page);
      await waitForChoice(page);
      const chips = await chipsReach(page);
      expect(chips.length).toBeGreaterThanOrEqual(2);
      for (const chip of chips) expect(chip, chip.label).toMatchObject({ inView: true, hit: true });
    } finally {
      await page.close();
    }
  });

  it('2: a reload mid-round says, on the way back to the rush, that the round was not kept', async () => {
    const page = await coldLoad(1280, 800);
    try {
      await openRushSetup(page);
      await startRush(page);
      await page.locator('.everyday-stage-play').click();
      await page.waitForFunction(() => (document.querySelector('.everyday-stage-clock')?.textContent ?? '0:00') !== '0:00', undefined, {
        timeout: 30_000,
      });
      await page.reload({ waitUntil: 'load' });
      await openRushSetup(page);
      expect(await page.textContent('.everyday-rush-unfinished')).toMatch(/still running when the page closed, so it was not kept/u);
      /* Said once: the next visit to the setup screen does not repeat it. */
      await page.reload({ waitUntil: 'load' });
      await openRushSetup(page);
      expect(await page.locator('.everyday-rush-unfinished').count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
