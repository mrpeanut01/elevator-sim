/**
 * **A whole campaign day, from the brief to the progression it buys** — GitHub issue **#223**.
 *
 * ## Why this has to be a journey and not a unit
 *
 * The pure halves are held elsewhere and are held well: `campaign/career.test.ts` has the record's
 * transitions, `everyday/campaignModel.test.ts` has the fold that marks the day, and
 * `everyday/host.test.ts` drives `runCampaignDay` → `closeDay` over two real recordings. Every one
 * of those would still pass on a build where **no button reaches them** — which is exactly this
 * repository's signature defect, and the reason `docs/05`'s standing requirement is *name the
 * non-test caller*. So this file names them by pressing them: the Campaign tile, the triage row's
 * *Look in*, the desk's link to the contract, *Lock it in and run day N*, *Close the day*, and the
 * report's own way back. Nothing here reaches into a module; every step is a control a player has.
 *
 * ## What it asserts, and the one thing it deliberately does not
 *
 * The record before and after, on the surfaces that publish it — the desk's month figures, its
 * purse, the contract sheet's terms and its month grid, and § 3.3's own primary, which carries the
 * day number and is therefore the progression a player *reads*.
 *
 * What it does **not** assert is *which* mark the day got. The verdict is § 8.6's tests over the
 * run, and pinning `cleared` here would make this file fail the day the shipped crowd, the
 * dispatcher default or the demand template moved — a fact about the simulator asserted through a
 * browser. Which mark follows which run is pinned in `host.test.ts` over recordings that file is
 * allowed to make. What belongs here is that **exactly one** of the two moved, which is the
 * acceptance criterion (*filed and marked cleared or missed*) and is false on every build before
 * this one, where neither did.
 *
 * ## The two negative controls, and why the file is worth little without them
 *
 * Five cases asserting *the record moved* all pass on a build that files a day on any press at all.
 * So one walks the same screens and presses nothing that closes a day, and one closes a day in
 * **Today's tower** after visiting the campaign — the cross-flow case the host's latch exists for.
 * Both require the record **not** to move, on the same page and through the same instrument.
 *
 * Pattern and gate are `shell.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import {
  CHROMIUM,
  HAS_BROWSER,
  enterEverydayStage,
  openPage,
} from '../dev/browserTier.test-helper.js';
import { DIFFICULTIES, rateOnDay } from '../campaign/economy.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5216, strictPort: false },
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

/** A cold load, settled — the Engineer menu dismissed, so `dev/main.ts`'s boot has published a host. */
async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** Press the Campaign tile — the player's own path, not a scripted navigation. */
async function enterCampaign(page: Page): Promise<void> {
  await page.locator('.everyday-mode', { hasText: 'Campaign' }).first().click();
  await page.waitForSelector('.everyday-towers');
}

/** Triage row → the building's desk. */
async function openDesk(page: Page): Promise<void> {
  await page.click('.everyday-towers-open');
  await page.waitForSelector('.everyday-building');
}

/** The desk's own link into § 8.4's sheet. */
async function openContract(page: Page): Promise<void> {
  await page.click('.everyday-building-to-contract');
  await page.waitForSelector('.everyday-contract');
}

/**
 * The desk's month card, as three numbers a player reads.
 *
 * Read off the rendered card rather than off the model, because what this file is for is that the
 * record reaches a screen. The card draws `day N` and then the cleared and missed counts, in that
 * order — see `campaignScreens.ts`'s month card.
 */
async function monthFigures(page: Page): Promise<{ day: number; cleared: number; missed: number }> {
  const text = (await page.textContent('.everyday-building-month')) ?? '';
  const day = /day (\d+)/u.exec(text)?.[1];
  const cleared = /(\d+)\s*cleared/u.exec(text)?.[1];
  const missed = /(\d+)\s*missed/u.exec(text)?.[1];
  if (day === undefined || cleared === undefined || missed === undefined) {
    throw new Error(`the desk's month card did not draw its three figures: ${text}`);
  }
  return { day: Number(day), cleared: Number(cleared), missed: Number(missed) };
}

/** `8 u on hand`, as the desk prints it. */
async function purseOnHand(page: Page): Promise<number> {
  const text = (await page.textContent('.everyday-building-on-hand')) ?? '';
  const units = /(\d+)/u.exec(text)?.[1];
  if (units === undefined) throw new Error(`the desk's purse did not draw a figure: ${text}`);
  return Number(units);
}

/**
 * Run the day the contract sheet is standing on, and close it — both through § 3.3's own primary.
 *
 * The wait is for the label rather than for a timer: the simulation is on a worker
 * (`dev/shiftRunner.ts`), so the press returns before there is a recording, and the stage's bar
 * says *Close the day* exactly when there is one to close.
 */
async function runAndCloseTheDay(page: Page): Promise<void> {
  await page.click('.everyday-bar-primary');
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 60_000 });
  await closeTheDayOnStage(page);
}

/** § 3.3's stage primary, waited out and pressed. Shared by both flows, because it is one control. */
async function closeTheDayOnStage(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('.everyday-bar-primary')?.textContent === 'Close the day',
    undefined,
    { timeout: 120_000 },
  );
  await page.click('.everyday-bar-primary');
  await page.waitForSelector('.everyday-report', { timeout: 30_000 });
}

/** The rail's own way out — `shell.ts`'s Main menu row, which is § 3.4's exit. */
async function toMainMenu(page: Page): Promise<void> {
  await page.click('.everyday-rail-menu');
  await page.waitForSelector('.everyday-mode', { timeout: 30_000 });
}

describe.skipIf(!HAS_BROWSER)('a campaign day, filed — issue #223', () => {
  it('walks the brief, runs the day, files it, and comes back to a record that moved', async () => {
    const page = await coldLoad();
    await enterCampaign(page);
    const building = await page.textContent('.everyday-towers-name');
    await openDesk(page);

    const before = await monthFigures(page);
    const purseBefore = await purseOnHand(page);
    expect(before).toEqual({ day: 1, cleared: 0, missed: 0 });

    await openContract(page);
    // § 3.3's contract row substitutes the day the record is on — the brief, in one control.
    expect(await page.textContent('.everyday-bar-primary')).toBe('Lock it in and run day 1');

    await runAndCloseTheDay(page);

    /*
     * The report's own way back, which is the § 8 progression step and was `Your week` — a button
     * naming the tower and opening the daily loop's seven-day strip. See `reportScreen.ts`.
     */
    expect(await page.textContent('.everyday-bar-primary')).toBe(`Back to ${building ?? ''}`);
    await page.click('.everyday-bar-primary');
    await page.waitForSelector('.everyday-building', { timeout: 30_000 });

    const after = await monthFigures(page);
    expect(after.day).toBe(2);
    // Filed **and marked**: exactly one of the two moved, and which one is the run's business.
    expect(after.cleared + after.missed).toBe(1);
    /*
     * § 8.1's purse is derived from the record, so a cleared day pays this contract's first-week
     * rate and a missed one pays nothing. The rate is read from the table rather than written down:
     * a literal here would be a second copy of a number `campaign/economy.ts` owns.
     */
    const purseAfter = await purseOnHand(page);
    const firstWeekRate = rateOnDay(DIFFICULTIES.standard, 0);
    expect(purseAfter).toBe(after.cleared === 1 ? purseBefore + firstWeekRate : purseBefore);

    await page.close();
  }, 300_000);

  it('drives the next day from the filed result, on the sheet and on the grid', async () => {
    const page = await coldLoad();
    await enterCampaign(page);
    await openDesk(page);
    await openContract(page);

    const termsBefore = (await page.textContent('.everyday-contract-terms')) ?? '';
    expect(termsBefore).toContain('0 of 0');
    expect(await page.locator('.everyday-contract-day-cleared').count()).toBe(0);
    expect(await page.locator('.everyday-contract-day-missed').count()).toBe(0);

    await runAndCloseTheDay(page);
    await page.click('.everyday-bar-primary');
    await page.waitForSelector('.everyday-building', { timeout: 30_000 });
    await openContract(page);

    /*
     * The progression, on the three surfaces that publish it. The primary is the one a player
     * presses next, so a day number that did not move is a loop that did not close.
     */
    expect(await page.textContent('.everyday-bar-primary')).toBe('Lock it in and run day 2');
    expect(await page.textContent('.everyday-contract-terms')).toContain('of 1');
    const cleared = await page.locator('.everyday-contract-day-cleared').count();
    const missed = await page.locator('.everyday-contract-day-missed').count();
    expect(cleared + missed).toBe(1);

    await page.close();
  }, 300_000);

  it('files nothing on a walk through § 8’s screens that closes no day', async () => {
    // The first negative control: the same three screens, every navigation a player would make,
    // and no *Close the day*. A build that filed on any press would move the record here.
    const page = await coldLoad();
    await enterCampaign(page);
    await openDesk(page);
    await openContract(page);
    await page.click('.everyday-bar-back');
    await page.waitForSelector('.everyday-towers', { timeout: 30_000 });
    await openDesk(page);

    expect(await monthFigures(page)).toEqual({ day: 1, cleared: 0, missed: 0 });
    await page.close();
  }, 300_000);

  it('files nothing against the tower when the day closed was Today’s tower', async () => {
    /*
     * The second negative control, and the one the host's latch exists for: enter the campaign,
     * leave it for § 6's loop, run and close a day **there**, then come back. That day is not this
     * contract's, and a record that moved would have banked somebody else's morning against it.
     */
    const page = await coldLoad();
    await enterCampaign(page);
    await openDesk(page);

    // Out to the main menu, then § 6's own walk — tile, front door, brief, stage — and close there.
    await toMainMenu(page);
    await enterEverydayStage(page);
    await closeTheDayOnStage(page);

    // Back to the campaign the long way, and its record has not been touched.
    await toMainMenu(page);
    await enterCampaign(page);
    await openDesk(page);
    expect(await monthFigures(page)).toEqual({ day: 1, cleared: 0, missed: 0 });

    await page.close();
  }, 300_000);
});
