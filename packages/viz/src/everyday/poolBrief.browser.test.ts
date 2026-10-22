/**
 * **A week-2 brief is dealt the date's crowd, because Midtown pools no week** — wave AP, lane DT-1,
 * [§ D1460](../../../../DECISIONS.md) and [§ D1463](../../../../DECISIONS.md), on the shipped bundle,
 * held by [§ D1616](../../../../DECISIONS.md).
 *
 * The control is the stored week's number, moved on the page's own saved session and nothing else.
 * Until § D1616 a week-2 brief's crowd was one of `data/week-pool.json`'s, its seed line said so and a
 * ways line read the pool's record of that crowd. On the fixed engine Midtown's one dealt order is
 * held, so the pool has no cell, and the brief must say nothing of a pool: week 2 runs the date's
 * crowd and draws no ways line, as week 1 does. The pool's brief lines are tested on real cells in
 * `shift/weekPool.preD1603.test.ts`, on the census as measured before the fix; this bundle carries
 * the shipped files only.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` the case skips; read the case count, not the word *passed*.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, leaveTutorialIfOffered, openEverydayDoor, openPage, startShippedSite, type ShippedSite } from '../dev/browserTier.test-helper.js';
import { SESSION_KEY } from '../persist/types.js';
import { isPoolCrowdSeed } from '../shift/weekPool.js';
import { weekTopOf } from '../shift/weekLevels.js';

let site: ShippedSite;
let browser: Browser;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 6013, strictPort: false } });
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function coldLoad(page: Page): Promise<void> {
  await page.goto(`${site.origin}?building=midtown-office`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true, undefined, { timeout: 30_000 });
  await leaveTutorialIfOffered(page);
}

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

async function toBrief(page: Page): Promise<void> {
  await openEverydayDoor(page);
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
}

describe.skipIf(!HAS_BROWSER)('a week-2 brief is dealt no pool crowd while Midtown’s order is held (§ D1460, § D1616)', () => {
  it('names no pool and draws no ways line on week 2, as on week 1', async () => {
    /* § D1616: Midtown's top is week 1, so a stored week 2 is dealt as week 1 was. */
    expect(weekTopOf('c2')).toBe(1);
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page);
      await toBrief(page);
      expect(await page.locator('.everyday-brief-ways').count(), 'week 1 drew a ways line').toBe(0);
      expect(await textOf(page, '.everyday-brief-seed')).not.toContain('measured pool');
      /* A week is saved when a press moves it: the door's tower press away and back parks it (weekSurvives' route). */
      await page.locator('.everyday-rail-menu').click();
      await page.waitForSelector('.everyday-mode[data-screen], .everyday-bar-confirm-leave', { timeout: 15_000 });
      if ((await page.locator('.everyday-bar-confirm-leave').count()) > 0) await page.locator('.everyday-bar-confirm-leave').click();
      await openEverydayDoor(page);
      await page.locator('.everyday-door-tower[data-contract="c1"]').click();
      await page.locator('.everyday-door-tower[data-contract="c2"]').click();
      await page.waitForFunction(
        (key) => (JSON.parse(window.localStorage.getItem(key) ?? '{}') as { session?: { week?: { contractId?: string } } }).session?.week?.contractId === 'c2',
        SESSION_KEY,
        { timeout: 15_000 },
      );
      await page.evaluate((key) => {
        const stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as { session?: { week?: { week?: number } } };
        if (stored.session?.week !== undefined) stored.session.week.week = 2;
        window.localStorage.setItem(key, JSON.stringify(stored));
      }, SESSION_KEY);
      await coldLoad(page);
      await toBrief(page);
      expect(await textOf(page, '.everyday-brief-eyebrow')).toMatch(/^WEEK 2 · MONDAY/u);
      const seedLine = await textOf(page, '.everyday-brief-seed');
      expect(seedLine).not.toContain('measured pool');
      const crowd = /crowd (\d+)/u.exec(seedLine)?.[1];
      expect(crowd !== undefined && isPoolCrowdSeed(BigInt(crowd)), seedLine).toBe(false);
      expect(await page.locator('.everyday-brief-ways').count(), 'week 2 drew a ways line').toBe(0);
    } finally {
      await page.close();
    }
  });
});
