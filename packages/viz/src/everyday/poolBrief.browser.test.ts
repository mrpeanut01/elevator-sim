/**
 * **A week-2 brief is dealt a pool crowd and counts its ways through** — wave AP, lane DT-1,
 * [§ D1460](../../../../DECISIONS.md) and [§ D1463](../../../../DECISIONS.md), on the shipped bundle.
 *
 * The control is the stored week's number, moved on the page's own saved session and nothing else.
 * Week 1's brief runs the date's crowd and draws no ways line; once the stored week is 2 the brief's
 * crowd is one of `data/week-pool.json`'s, its seed line says so, and the ways line reads the pool's
 * record of that crowd, naming no driver. Red before: week 2's brief ran a crowd derived from the
 * date and drew no ways line.
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

describe.skipIf(!HAS_BROWSER || weekTopOf('c2') < 2)('a week-2 brief is dealt from the pool (§ D1460, § D1463)', () => {
  it('names the pool as the crowd’s source and counts the ways through, naming no driver', async () => {
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
      expect(seedLine).toContain('from this weekday’s measured pool');
      const crowd = /crowd (\d+)/u.exec(seedLine)?.[1];
      expect(crowd !== undefined && isPoolCrowdSeed(BigInt(crowd)), seedLine).toBe(true);
      const ways = await textOf(page, '.everyday-brief-ways');
      expect(ways).toMatch(/^Ways through, measured on this crowd: /u);
      for (const name of ['Fairness first', 'Predictive balanced', 'Collective']) expect(ways).not.toContain(name);
    } finally {
      await page.close();
    }
  });
});
