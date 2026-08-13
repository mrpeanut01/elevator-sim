/**
 * **The campaign flow, driven on the page** — the wirings a node test cannot vouch for.
 *
 * The pure half is held by `campaignModel.test.ts` and `campaign/economy.test.ts`; what only a page
 * can prove is that the three screens are one flow over one record:
 *
 * 1. the Campaign tile **opens** (its refusal is gone) and lands on the triage list, with the § 3.3
 *    campaign timeline and the rail's `CAMPAIGN` group both present — the two surfaces that are
 *    gated on `ctx === 'campaign'`, which no node test sets;
 * 2. towers → building → contract navigate, and the desk is about the building the row opened;
 * 3. a standing order moved on the triage row **is still moved** two screens later, which is the
 *    proof that one record is behind all three rather than three copies of it;
 * 4. § 8.4's two-step buy: press a tier, the month grid lights its legal starts, pick one, and the
 *    purse falls by the tier's price while the row starts reading its works line. Money leaves when
 *    it is **booked**, which is the rule a screen is most likely to get wrong;
 * 5. § 16 rule 6 on a real button: an unaffordable tier is present, dimmed, `disabled`, and says
 *    what it is short by.
 *
 * Pattern and gate are `shell.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import { CHROMIUM, HAS_BROWSER } from '../dev/browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5201, strictPort: false },
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** Walk the player's own path to the contract sheet: tile → triage row → desk → contract. */
async function openContract(page: Page): Promise<void> {
  await enterCampaign(page);
  await page.click('.everyday-towers-open');
  await page.waitForSelector('.everyday-building');
  await page.click('.everyday-building-to-contract');
  await page.waitForSelector('.everyday-contract');
}

/** Press the Campaign tile — the player's own path, not a scripted navigation. */
async function enterCampaign(page: Page): Promise<void> {
  const tile = page.locator('.everyday-mode', { hasText: 'Campaign' }).first();
  await tile.click();
  await page.waitForSelector('.everyday-towers');
}

describe.skipIf(!HAS_BROWSER)('the Everyday campaign screens', () => {
  it('opens the Campaign tile, which no longer refuses, and lands on the triage list', async () => {
    const page = await coldLoad();
    const tile = page.locator('.everyday-mode', { hasText: 'Campaign' }).first();
    // § D227 in the direction a landed screen needs: the tile carries no refusal at all.
    expect(await tile.textContent()).not.toContain('not built');
    await enterCampaign(page);

    expect(await page.textContent('.everyday-towers h1')).toBe('Campaign');
    // The § 3.3 campaign timeline, which only a `ctx: 'campaign'` state resolves.
    const bar = await page.textContent('.everyday-bar-timeline');
    expect(bar).toContain('All buildings');
    expect(bar).toContain('Contract');
    // And the rail's CAMPAIGN group, gated on the same fact.
    expect(await page.textContent('.everyday-rail')).toContain('CAMPAIGN');
    await page.close();
  });

  it('walks towers → building → contract, about the building the row opened', async () => {
    const page = await coldLoad();
    await enterCampaign(page);

    const name = await page.textContent('.everyday-towers-name');
    expect(name).toBeTruthy();
    await page.click('.everyday-towers-open');
    await page.waitForSelector('.everyday-building');
    expect(await page.textContent('.everyday-building-name')).toBe(name);

    await page.click('.everyday-building-to-contract');
    await page.waitForSelector('.everyday-contract');
    expect(await page.textContent('.everyday-contract-title')).toBe(`${name ?? ''}, this month`);
    // § 3.3's contract row substitutes the day into its own placeholder.
    expect(await page.textContent('.everyday-bar-primary')).toMatch(/^Lock it in and run day \d+$/);
    await page.close();
  });

  it('keeps a standing order set on the triage row two screens later — one record, not three', async () => {
    const page = await coldLoad();
    await enterCampaign(page);

    /*
     * The triage row's select and the desk's are the same control drawn twice, so they carry the
     * same class and are told apart by the region around them — which is the point of the case.
     */
    const onRow = '.everyday-towers-row .everyday-campaign-dispatcher';
    const options = await page.$$eval(`${onRow} option`, (nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value),
    );
    const current = await page.inputValue(onRow);
    const next = options.find((value) => value !== current);
    expect(next).toBeTruthy();
    await page.selectOption(onRow, next ?? '');
    // The row redrew from the record, so the select still shows the pick.
    expect(await page.inputValue(onRow)).toBe(next);

    await page.click('.everyday-towers-open');
    await page.waitForSelector('.everyday-building');
    expect(await page.inputValue('.everyday-building-order .everyday-campaign-dispatcher')).toBe(
      next,
    );
    await page.close();
  });

  it('fits a zero-night tier at once, and the money leaves the purse with it (§ 8.2)', async () => {
    const page = await coldLoad();
    await openContract(page);
    const purseBefore = await page.textContent('.everyday-contract-on-hand');

    /*
     * `Faster doors` — 4 units and no nights, which a standard month's opening 8 can reach. § 8.2:
     * *"zero-night items are fitted immediately and work tomorrow"*.
     */
    const doors = page.locator('.everyday-contract-category-doors .everyday-contract-tier').first();
    expect(await doors.isDisabled()).toBe(false);
    await doors.click();
    await page.waitForFunction(
      () =>
        document.querySelector('.everyday-contract-category-doors .everyday-contract-owned')
          ?.textContent === 'level 1 fitted',
      undefined,
      { timeout: 5_000 },
    );
    expect(await page.textContent('.everyday-contract-on-hand')).not.toBe(purseBefore);
    expect(
      await page
        .locator('.everyday-contract-category-doors .everyday-contract-tier-state')
        .first()
        .textContent(),
    ).toBe('in the building');
    await page.close();
  });

  it('books nights in two steps, and the money leaves the purse when it is booked (§ 8.2)', async () => {
    const page = await coldLoad();
    await openContract(page);
    const purseBefore = await page.textContent('.everyday-contract-on-hand');

    /*
     * `Zone the tower` — 6 units and one night, the one tier with works a first day's purse can
     * reach. Step one parks it: nothing is spent and the grid lights every legal start.
     */
    const zone = page.locator('.everyday-contract-category-control .everyday-contract-tier').first();
    expect(await zone.isDisabled()).toBe(false);
    await zone.click();
    await page.waitForSelector('.everyday-contract-prompt');
    expect(await page.textContent('.everyday-contract-prompt')).toContain(
      'Pick the night Zone the tower goes in',
    );
    expect(await page.textContent('.everyday-contract-on-hand')).toBe(purseBefore);
    const lit = await page.$$('.everyday-contract-day-bookable');
    expect(lit.length).toBeGreaterThan(0);

    /* Step two: pick a night. The money goes **now**, and the row starts reading its works line. */
    await lit[3]!.click();
    await page.waitForFunction(
      () => document.querySelector('.everyday-contract-prompt') === null,
      undefined,
      { timeout: 5_000 },
    );
    expect(await page.textContent('.everyday-contract-on-hand')).not.toBe(purseBefore);
    expect(
      await page
        .locator('.everyday-contract-category-control .everyday-contract-tier-state')
        .first()
        .textContent(),
    ).toMatch(/^works day \d+ · live on day \d+$/);
    // And the nights show up beside the grid, priced as kit that stays with the building.
    expect(await page.textContent('.everyday-contract-booked')).toContain('Zone the tower');
    await page.close();
  });

  it('draws an unaffordable tier dimmed, inert, and saying what it is short by (§ 16 rule 6)', async () => {
    const page = await coldLoad();
    await openContract(page);

    // The fourth car is 34 units against a standard month's opening 8.
    const shaft = page.locator('.everyday-contract-category-shafts .everyday-contract-tier').first();
    expect(await shaft.isDisabled()).toBe(true);
    expect(await shaft.textContent()).toContain('need ');
    expect(await shaft.textContent()).toContain(' more');
    // Present and visible — refused, never hidden.
    expect(await shaft.isVisible()).toBe(true);
    await page.close();
  });

  it('reads the four daily tests with a “was” column, and refuses the one nothing measures', async () => {
    const page = await coldLoad();
    await enterCampaign(page);
    await page.click('.everyday-towers-open');
    await page.waitForSelector('.everyday-building');

    const tests = await page.$$eval('.everyday-campaign-test', (nodes) =>
      nodes.map((node) => node.textContent ?? ''),
    );
    expect(tests).toHaveLength(4);
    expect(tests[0]).toContain('away inside a minute');
    expect(tests[3]).toContain('trips on the machines');
    // § 7: with no previous day, every `was` is the unfinished mark.
    for (const row of await page.$$eval('.everyday-campaign-was', (nodes) =>
      nodes.map((node) => node.textContent ?? ''),
    )) {
      expect(row).toBe('was —');
    }
    // And the trip budget says why it grades nothing, rather than showing a stand-in.
    const refusals = await page.$$eval('.everyday-campaign-test-refusal', (nodes) =>
      nodes.map((node) => node.textContent ?? ''),
    );
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('not measured');
    await page.close();
  });
});
