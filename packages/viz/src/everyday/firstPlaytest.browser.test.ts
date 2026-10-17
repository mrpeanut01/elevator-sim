/**
 * **What a first-time player meets, as GitHub issue #626 found it** — four of the playtest's
 * findings, each read off the built bundle rather than off a model.
 *
 * - Item 1: a Scenario stage states its goals before the first run, in the verdict's own words.
 * - Item 2: the front door does not promise a choice of driver the brief then holds.
 * - Item 7: the day screen's *Jump to floor…* select is never drawn with nothing in it.
 * - Item 9: the stage's running line counts toward a total the batch can actually reach.
 * - Item 10: stage 1's title does not name a count of cars its building does not have.
 *
 * Item 6 (*Start the day* opens paused) is not here: [§ D842](../../../../DECISIONS.md) rules the
 * stage opens paused on every route, by the handoff's text, and that ruling stands.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  enterEverydayStage,
  leaveTutorialIfOffered,
  openEverydayDoor,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

/** The playtest's own window. */
const VIEWPORT = { width: 1280, height: 800 } as const;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 6015, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function fresh(): Promise<Page> {
  const page = await openPage(browser, { viewport: VIEWPORT });
  await page.goto(origin, { waitUntil: 'load' });
  return page;
}

describe.skipIf(!HAS_BROWSER)('a first-time player, as issue #626 found the game', () => {
  it('reads stage 1’s goals before running it, under a title its building agrees with, and a running count it can reach', async () => {
    const page = await fresh();
    try {
      await leaveTutorialIfOffered(page);
      await page.locator('.everyday-mode[data-screen="scenario"]').click();
      await page.waitForSelector('.everyday-scenario-path-card', { timeout: 30_000 });
      await page
        .locator('.everyday-scenario-path-card[data-stage="stage-1-first-call"] .everyday-scenario-path-head')
        .click();
      await page.waitForSelector('.everyday-stage-play-title', { timeout: 60_000 });

      expect(await page.locator('.everyday-stage-play-title').textContent()).toBe('Two cars, low demand');
      expect(await page.locator('.everyday-stage-play-goals-head').textContent()).toBe('TO CLEAR THIS STAGE');
      expect(await page.locator('.everyday-stage-play-goal').allTextContents()).toEqual([
        'Measurably ahead of the shipped setting',
      ]);
      /* Before the press: no verdict on the page, so the goals are not the verdict's. */
      expect(await page.locator('.everyday-stage-play-status').count()).toBe(0);

      await page.locator('.everyday-bar-primary').click();
      await page.waitForFunction(
        () => /^Running [1-9]\d* of /u.test(document.querySelector('.everyday-stage-play-status')?.textContent ?? ''),
        undefined,
        { timeout: 60_000 },
      );
      const status = (await page.locator('.everyday-stage-play-status').textContent()) ?? '';
      const match = /^Running (\d+) of (\d+) of the stage’s own crowds/u.exec(status);
      expect(match, status).not.toBeNull();
      expect(Number(match?.[2]), status).toBe(50);
      expect(Number(match?.[1])).toBeLessThanOrEqual(50);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('says on the front door whether today’s driver is the player’s to pick, as the brief then draws it', async () => {
    const page = await fresh();
    try {
      await openEverydayDoor(page);
      const lede = (await page.locator('.everyday-door-lede').textContent()) ?? '';
      const note = (await page.locator('.everyday-door-driver').textContent()) ?? '';
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      const cards = await page
        .locator('.everyday-brief-style')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLButtonElement).disabled));
      expect(cards.length).toBeGreaterThan(0);
      const held = cards.every(Boolean);
      expect(cards.some(Boolean), 'some driver cards are held and some are not').toBe(held);
      /* A fresh device's first brief is the pinned day (§ D1047), so the held arm is the one met. */
      expect(held, 'the first day is not held, so this case does not test the contradiction').toBe(true);
      expect(lede).not.toContain('You choose who drives before the day starts');
      expect(lede).toContain('standing order drives until the stage’s call is answered');
      expect(note).not.toContain('Change it on the brief');
    } finally {
      await page.close();
    }
  }, 120_000);

  it('draws no Jump to floor select with nothing to jump to', async () => {
    const page = await fresh();
    try {
      await enterEverydayStage(page);
      await page.waitForTimeout(500);
      const selects = await page
        .locator('.everyday-stage-floor-jump')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLSelectElement).options.length));
      for (const options of selects) expect(options, 'a floor jump with no floor in it').toBeGreaterThan(1);
      /* Present exactly when the camera chips are: the two share one gate. */
      const chips = await page.locator('.everyday-stage-camera').count();
      expect(selects.length).toBe(chips > 0 ? 1 : 0);
    } finally {
      await page.close();
    }
  }, 120_000);
});

