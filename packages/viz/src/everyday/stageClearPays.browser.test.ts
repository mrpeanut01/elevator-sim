/**
 * **From the Scenario hub, through stage 1, to a clear that pays — once** —
 * [§ D1129](../../../../DECISIONS.md), the swarm's Q3 ruling, on the built bundle.
 *
 * The journey a post-wave-AI assessor could not make: press stage 1 on the hub, play it in this
 * world rather than in the Engineer Lab, under its own building's name and the budget the hub
 * quotes, pick a way through the hub's census names, run it, and be paid for clearing it. Then
 * clear it again and be paid nothing, because a stage pays once, and find nothing unlocked, because
 * nothing on the path is locked (`docs/38`).
 *
 * The route is the player's own: menu tile, hub row, the stage page's two selects, the § 3.3 bar's
 * primary. Nothing reaches past a control. The award is read off the device ledger the pay line
 * writes to, so the page's sentence and the chime are one fact rather than two.
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
  site = await startShippedSite({ preview: { port: 5743, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const STAGE = 'stage-1-first-call';

async function openStageOne(page: Page): Promise<void> {
  /* From the menu, or from the hub itself — the stage page's way back lands on the hub. */
  if ((await page.locator('.everyday-scenario-path-card').count()) === 0) {
    await page.locator('.everyday-mode[data-screen="scenario"]').click();
  }
  await page.waitForSelector(`.everyday-scenario-path-card[data-stage="${STAGE}"]`, { timeout: 30_000 });
  await page.locator(`.everyday-scenario-path-card[data-stage="${STAGE}"] .everyday-scenario-path-head`).click();
  await page.waitForSelector('.everyday-stage-play-setting-select', { timeout: 60_000 });
}

/** Pick the census's named way through by its value, press the bar's primary, and wait for the verdict. */
async function runWithSetting(page: Page, profileId: string): Promise<void> {
  await page.selectOption('.everyday-stage-play-setting-select', profileId);
  await page.waitForFunction(
    () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '') === 'Run the stage' ||
      (document.querySelector('.everyday-bar-primary')?.textContent ?? '') === 'Run it again',
    undefined,
    { timeout: 15_000 },
  );
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-stage-play-verdict', { timeout: 90_000 });
}

/** Which rows the hub offers, in path order — `stage:yes|no`. */
function offeredRows(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.everyday-scenario-path-card')].map(
      (card) => `${card.dataset['stage'] ?? ''}:${card.dataset['playable'] ?? ''}`,
    ),
  );
}

function deviceTurns(page: Page): Promise<readonly { readonly completion: string; readonly key: string }[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('elevator-sim.device-chimes.v1');
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as { readonly turns?: readonly { completion: string; key: string }[] };
    return parsed.turns ?? [];
  });
}

describe.skipIf(!HAS_BROWSER)('a campaign stage is played from the hub, and a clear pays once', () => {
  it('opens stage 1 in the fix-it editor under its own building, clears it, pays, and pays nothing the second time', async () => {
    const page = await openPage(browser, { viewport: { width: 1400, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await leaveTutorialIfOffered(page);
      await page.locator('.everyday-mode[data-screen="scenario"]').click();
      await page.waitForSelector('.everyday-scenario-path-card', { timeout: 30_000 });
      const playable = await offeredRows(page);
      await page.locator('.everyday-bar-leave').click();
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
      await openStageOne(page);

      /* The stage's own building and the budget the hub quotes — the Lab showed neither. */
      const face = await page.evaluate(() => ({
        title: document.querySelector('.everyday-stage-play-title')?.textContent ?? '',
        building: document.querySelector('.everyday-stage-play-building')?.textContent ?? '',
        budget: document.querySelector('.everyday-stage-play-budget')?.textContent ?? '',
        options: [...document.querySelectorAll<HTMLOptionElement>('.everyday-stage-play-setting-select option')].map(
          (option) => ({ value: option.value, disabled: option.disabled }),
        ),
      }));
      expect(face.building).toContain('Garden Apartments');
      expect(face.budget).toContain('4 units of change');
      /* The census's named way through is offered, not refused — the defect the ruling closes. */
      expect(face.options.find((option) => option.value === 'zoned-uppeak')?.disabled).toBe(false);
      expect(await deviceTurns(page)).toEqual([]);

      await runWithSetting(page, 'zoned-uppeak');
      const first = await page.evaluate(() => ({
        cleared: document.querySelector<HTMLElement>('.everyday-stage-play-verdict')?.dataset['cleared'] ?? '',
        pay: document.querySelector('.everyday-stage-play-pay')?.textContent ?? '',
        unlock: document.querySelector('.everyday-stage-play-unlock')?.textContent ?? '',
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
      }));
      expect(first.cleared, 'stage 1 did not clear under the census’s own way through').toBe('yes');
      expect(first.pay).toMatch(/^This clear pays \d+ chimes, the first time only\.$/u);
      expect(first.unlock).toContain('unlocks nothing');
      expect(first.primary).toBe('Back to the path');
      expect(await deviceTurns(page)).toEqual([{ completion: 'scenario-cleared', key: STAGE }]);

      /* The way back marks the row. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector(`.everyday-scenario-path-card[data-stage="${STAGE}"][data-cleared="yes"]`, {
        timeout: 30_000,
      });

      /* A second clear of the same stage pays nothing, and the ledger holds one turn for it. */
      await openStageOne(page);
      await runWithSetting(page, 'zoned-uppeak');
      const again = await page.evaluate(() => document.querySelector('.everyday-stage-play-pay')?.textContent ?? '');
      expect(again).toBe('A stage pays once, so this clear pays nothing.');
      expect(await deviceTurns(page)).toEqual([{ completion: 'scenario-cleared', key: STAGE }]);

      /* Nothing unlocked: the path offers exactly what it offered before the clear. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector(`.everyday-scenario-path-card[data-stage="${STAGE}"][data-cleared="yes"]`, {
        timeout: 30_000,
      });
      expect(await offeredRows(page), 'a clear opened or closed a stage on the path').toEqual(playable);
    } finally {
      await page.close();
    }
  }, 120_000);
});
