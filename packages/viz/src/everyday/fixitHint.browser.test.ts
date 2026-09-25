/**
 * **A fix case played as a search: without the hint, with it, and a check that stops early** —
 * [§ D1120](../../../../DECISIONS.md), on the bundle players load.
 *
 * Four journeys, each the product's own run end to end — the pair on the worker, the gate, then the
 * forty-nine derived mornings on the morning pool against the as-built readings the build ships.
 * Nothing is stubbed. The routes are taken from measured tables rather than hoped for:
 * `theAnswerIsNotPrinted.test.ts#SOLVED_BY` for the two that hold, and § D1120's route probe for the
 * one that stops at the first futility look.
 *
 * 1. **Fixed on your own.** The case opens with its diagnosis withheld — no word of it on the page —
 *    and the as-built mornings already held, so the check is warm. A route the player chose clears,
 *    the check counts *N of 49* with a mark a morning and nothing pooled, the order stays editable
 *    through it, and the row reads *on your own*.
 * 2. **Fixed with the diagnosis.** The one case the route census opens shows its hint from the start
 *    and says why; another case's hint is asked for, names the priced row and not the cause, and the
 *    fixed row reads *with the diagnosis*.
 * 3. **Not fixed, early.** A roof raise on the bed-car case clears the letter's morning and is no
 *    better on average over the first ten derived mornings, so the check stops there and says so with
 *    counts and no interval.
 * 4. **An edit during the check.** The pending verdict is drawn stale, the press comes back, and
 *    pressing it stops the check, which says where it stopped and that it has no verdict.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  openScenarioEntry,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5793, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** The authored diagnoses, read from the shipped file so the check is on the words a player would see. */
const DIAGNOSES: ReadonlyMap<string, { readonly text: string; readonly reasoning: string }> = new Map(
  (
    JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'data', 'fixit-cases.json'), 'utf8')) as {
      cases: { name: string; diagnosis: { text: string; reasoning: string } }[];
    }
  ).cases.map((entry) => [entry.name, entry.diagnosis]),
);

async function openCase(page: Page, name: string): Promise<void> {
  await page.goto(`${origin}?building=garden-apartments`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true, undefined, {
    timeout: 30_000,
  });
  await openScenarioEntry(page, 'fix-a-building');
  await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-case').length > 0, undefined, { timeout: 60_000 });
  await page.locator('.everyday-fixit-case', { hasText: name }).click();
  await page.waitForSelector('.everyday-fixit-skip', { timeout: 120_000 });
  await page.click('.everyday-fixit-skip');
  await page.waitForFunction(() => document.querySelectorAll('.everyday-fixit-figure').length === 4, undefined, {
    timeout: 120_000,
  });
}

function diagnosisOf(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.everyday-fixit-diagnosis');
    return {
      state: card?.dataset['state'] ?? '',
      text: card?.textContent ?? '',
      because: document.querySelector('.everyday-fixit-diagnosis-because')?.textContent ?? null,
    };
  });
}

function rowOf(page: Page, name: string) {
  return page.evaluate((caseName) => {
    const row = [...document.querySelectorAll('.everyday-fixit-case')].find((node) => node.textContent?.includes(caseName));
    return {
      tag: row?.querySelector('.everyday-fixit-tag')?.textContent ?? '',
      mark: row?.querySelector('.everyday-fixit-case-mark')?.textContent ?? null,
    };
  }, name);
}

/** Wait for the check to be drawn, and read it while it runs. */
async function checkingOf(page: Page) {
  await page.waitForSelector('.everyday-fixit-check-count', { timeout: 120_000 });
  return page.evaluate(() => ({
    count: document.querySelector('.everyday-fixit-check-count')?.textContent ?? '',
    marks: document.querySelectorAll('.everyday-fixit-check-mark').length,
    block: document.querySelector('.everyday-fixit-check-progress')?.textContent ?? '',
    parkingDisabled: document.querySelector<HTMLSelectElement>('.everyday-fixit-parking-select')?.disabled ?? null,
    primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
    primaryDisabled: document.querySelector<HTMLButtonElement>('.everyday-bar-primary')?.disabled ?? null,
  }));
}

async function settledPrimary(page: Page): Promise<string> {
  await page.waitForFunction(
    () => {
      const label = document.querySelector('.everyday-bar-primary')?.textContent ?? '';
      return label === 'Next building' || label === 'Run it again';
    },
    undefined,
    { timeout: 300_000 },
  );
  return (await page.locator('.everyday-bar-primary').textContent()) ?? '';
}

describe.skipIf(!HAS_BROWSER)('a fix case as a search — § D1120', () => {
  it('fixes a case without the hint: withheld, counted morning by morning, editable, and marked on your own', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      const name = 'Three cars, one car';
      await openCase(page, name);
      const authored = [...DIAGNOSES.entries()].find(([caseName]) => caseName.startsWith(name))![1];

      /* First render: withheld, and no word of the diagnosis anywhere on the page. */
      const withheld = await diagnosisOf(page);
      expect(withheld.state).toBe('withheld');
      expect(withheld.text).toContain('Show the diagnosis');
      const page0 = (await page.locator('body').textContent()) ?? '';
      expect(page0).not.toContain(authored.text);
      expect(page0).not.toContain(authored.reasoning);
      /* The as-built mornings ship with the build, so they were held the moment the case opened. */
      expect(await page.locator('.everyday-fixit-main').getAttribute('data-mornings')).toBe('held');

      /* A route the player chose: idle cars in the middle of their zone (SOLVED_BY's row). */
      await page.locator('.everyday-fixit-parking-select').selectOption('zone-center');
      await page.locator('.everyday-bar-primary').click();
      const checking = await checkingOf(page);
      expect(checking.count).toMatch(/^\d+ of 49 mornings in$/);
      expect(checking.marks).toBe(49);
      expect(checking.block).not.toMatch(/holding|interval|average|mean/i);
      /* The order stays editable while it checks, and the press waits on it. */
      expect(checking.parkingDisabled).toBe(false);
      expect(checking.primaryDisabled).toBe(true);

      expect(await settledPrimary(page)).toBe('Next building');
      const card = (await page.locator('.everyday-fixit-outcome').textContent()) ?? '';
      expect(card).toContain('over 49 mornings');
      expect(await rowOf(page, name)).toEqual({ tag: 'FIXED', mark: 'on your own' });
      /*
       * Never asked, so the hint was never drawn. The authored cause may be, and only as
       * `explained`: this route's legs are the diagnosed repair's own, which is § D1011's condition.
       */
      expect(['withheld', 'explained']).toContain((await diagnosisOf(page)).state);
    } finally {
      await page.close();
    }
  });

  it('opens the needle case with its hint and says why, and marks a case fixed after asking as with the diagnosis', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await openCase(page, 'The express that stops everywhere');
      const express = await diagnosisOf(page);
      expect(express.state).toBe('shown');
      expect(express.because).toMatch(/of the \d+ single changes tried on this case, only one cleared the letter’s morning/);

      const name = 'Two cars out in the wrong month';
      await page.locator('.everyday-fixit-case', { hasText: name }).click();
      await page.waitForSelector('.everyday-fixit-skip', { timeout: 120_000 });
      await page.click('.everyday-fixit-skip');
      expect((await diagnosisOf(page)).state).toBe('withheld');
      await page.locator('.everyday-fixit-diagnosis-show').click();
      const shown = await diagnosisOf(page);
      expect(shown.state).toBe('shown');
      /* The measured witness: the priced row the diagnosed repair buys, and no mechanism story. */
      expect(shown.text).toContain('“Rezone a bank”');
      const authored = DIAGNOSES.get(name)!;
      expect(shown.text).not.toContain(authored.text);
      expect(shown.text).not.toContain(authored.reasoning);
      expect(await rowOf(page, name)).toEqual({ tag: 'OPEN', mark: 'diagnosis shown' });

      await page.locator('.everyday-fixit-car-A select').selectOption('high');
      await page.locator('.everyday-bar-primary').click();
      expect(await settledPrimary(page)).toBe('Next building');
      expect(await rowOf(page, name)).toEqual({ tag: 'FIXED', mark: 'with the diagnosis' });
    } finally {
      await page.close();
    }
  });

  it('stops a check that is no better on average after ten mornings, and says not fixed with counts only', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await openCase(page, 'The bed cars locked out of theatres');
      const up = page.locator('.everyday-fixit-stepper-elevation .everyday-fixit-step-up');
      for (let metre = 0; metre < 5; metre += 1) await up.click();
      await page.locator('.everyday-bar-primary').click();
      await checkingOf(page);
      expect(await settledPrimary(page)).toBe('Run it again');
      const verdict = await page.evaluate(() => ({
        head: document.querySelector('.everyday-fixit-outcome-head')?.textContent ?? '',
        card: document.querySelector('.everyday-fixit-outcome')?.textContent ?? '',
        rows: document.querySelectorAll('.everyday-fixit-outcome-row').length,
      }));
      expect(verdict.head).toBe('It cleared on the letter’s morning, and it did not hold on the others.');
      expect(verdict.card).toMatch(/the check stopped after 10 of 49 mornings: the complaint was lower on \d+ of 10, and no lower on average, so no interval is drawn/);
      expect(verdict.card).not.toMatch(/95 % interval/);
      expect(verdict.card).toContain('not fixed, and nothing is banked');
      expect(verdict.rows).toBe(4);
      expect((await rowOf(page, 'The bed cars locked out')).tag).toBe('OPEN');
    } finally {
      await page.close();
    }
  });

  it('draws a pending verdict stale on an edit, and a new press stops the check and says where', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      /* Vertical City's mornings are the longest in the file, so the check is still running when edited. */
      await openCase(page, 'The sleeping sky lobby');
      await page.locator('.everyday-fixit-parking-select').selectOption('stay');
      await page.locator('.everyday-bar-primary').click();
      await checkingOf(page);
      await page.locator('.everyday-fixit-parking-select').selectOption('zone-center');
      await page.waitForSelector('.everyday-fixit-verdict-stale', { timeout: 15_000 });
      await page.waitForFunction(
        () => {
          const primary = document.querySelector<HTMLButtonElement>('.everyday-bar-primary');
          return primary?.textContent === 'Run it again' && !primary.disabled;
        },
        undefined,
        { timeout: 15_000 },
      );
      /* Still checking the old order: the count is on screen under the stale line. */
      expect(await page.locator('.everyday-fixit-check-count').count()).toBe(1);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-fixit-check-stopped', { timeout: 15_000 });
      const stopped = (await page.locator('.everyday-fixit-check-stopped').textContent()) ?? '';
      expect(stopped).toMatch(/^The check on your last order stopped at \d+ of 49 mornings when you ran this one, and it has no verdict\.$/);
      /* The new order runs, and its own verdict lands. */
      const primary = await settledPrimary(page);
      expect(['Next building', 'Run it again']).toContain(primary);
      expect(await page.locator('.everyday-fixit-verdict-stale').count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
