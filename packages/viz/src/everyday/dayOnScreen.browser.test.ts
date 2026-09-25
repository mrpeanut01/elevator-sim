/**
 * **The day on screen is the day's own, whatever the address bar says** — wave AJ, the post-AI
 * panel's defects that only a browser can show, on the shipped bundle.
 * [§ D1095](../../../../DECISIONS.md), [§ D1096](../../../../DECISIONS.md),
 * [§ D1097](../../../../DECISIONS.md).
 *
 * ## Why these three are browser cases
 *
 * Each defect lives in `dev/main.ts`'s closure, between the address the page reads on boot and the
 * address it writes afterwards, and none of that is reachable from a unit test: the boot's first-day
 * deal reads `window.location`, the Scenario's length arrives from `?duration=` through
 * `deepLinkStateOf`, and the bar is written by `syncUrl` on every render. The host's own halves are
 * unit-tested beside them (`host.test.ts`, `shift/firstSession.test.ts`); these cases are the
 * product, reached by the player's own route.
 *
 * 1. **A newcomer handed the address this page writes on a Scenario day** — the date's tower and
 *    the date's crowd — meets the pinned day the date deals, exactly as a newcomer at `/` does
 *    (seat A, defect 3).
 * 2. **The shared day is one length whatever `?duration=` said** (seat D, D3): two loads of the same
 *    tower on the date's crowd, one address asking for five minutes and the other for twenty, run
 *    the same day. Compared as a pair rather than against a figure, which is what the defect was —
 *    two players, one day, two lengths.
 * 3. **The fix-it screen holds the bar bare** (seat B), and the Scenario's address comes back when
 *    the player leaves it.
 *
 * Every case was run against the bundle built from the tree before the fix and failed there; the
 * lane's report records which assertion.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass — so a
 * count of cases, not the word *passed*, is what to check.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  enterEverydayStage,
  leaveTutorialIfOffered,
  openEverydayBrief,
  openPage,
  openScenarioEntry,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { contractById } from '../shift/contracts.js';
import { dailySeedAt } from '../shift/dailySeed.js';
import { firstSessionContractFor } from '../shift/firstSession.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /* Its own port — `dev/browserTier.test.ts` requires every tier file's to be distinct. */
  site = await startShippedSite({ preview: { port: 5763, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/**
 * The date's own crowd and the tower its draw deals, read the way the page reads them. Taken per
 * case rather than once, so a run that crosses UTC midnight between cases asks each case of its own
 * date.
 */
function today(): { readonly seed: bigint; readonly dealtTower: string } {
  const seed = dailySeedAt(Date.now());
  const dealtTower = contractById(firstSessionContractFor(seed))?.buildingId;
  if (dealtTower === undefined) throw new Error('the date deals no tower');
  return { seed, dealtTower };
}

/** A fresh device on `query`, settled past the menu cover. Leaves the first-visit offer standing. */
async function coldLoad(query: string): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}${query}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** The brief's seed line — tower, crowd, and what the crowd is. */
async function briefSeedLine(page: Page): Promise<string> {
  await openEverydayBrief(page);
  return (await page.textContent('.everyday-brief-seed')) ?? '';
}

/**
 * The stage's accessible sentence once the day's first frame is drawn: `describeFrame`'s *"at 00:00
 * of <the run's end>"*, which names the length of the run the player is about to watch.
 */
async function stageLengthPhrase(page: Page): Promise<string> {
  await enterEverydayStage(page);
  await page.waitForFunction(
    () => / of [^.]+\./u.test(document.querySelector('.everyday-stage-canvas')?.getAttribute('aria-label') ?? ''),
    undefined,
    { timeout: 30_000 },
  );
  const label = (await page.getAttribute('.everyday-stage-canvas', 'aria-label')) ?? '';
  return / of ([^.]+)\./u.exec(label)?.[1] ?? '';
}

describe.skipIf(!HAS_BROWSER)('the day on screen is the day’s own', () => {
  it('deals the pinned day to a newcomer whose address only restates the date — § D1096', async () => {
    const { seed, dealtTower } = today();
    const bare = await coldLoad('');
    const linked = await coldLoad(`?building=${dealtTower}&seed=${seed.toString()}&duration=1800&tab=report`);
    try {
      const fromBare = await briefSeedLine(bare);
      const fromLink = await briefSeedLine(linked);
      expect(fromBare).toMatch(/the pinned crowd/u);
      /* The defect: the link read *today's date* here, with no pin and no call. */
      expect(fromLink).toBe(fromBare);
    } finally {
      await bare.close();
      await linked.close();
    }
  }, 120_000);

  it('runs one shared day at one length, whatever `?duration=` asked for — § D1095', async () => {
    const { seed, dealtTower } = today();
    /* A tower with no authored whole day, so the slice's length is the only thing that could differ. */
    const tower = dealtTower === 'garden-apartments' ? 'st-jude-hospital' : 'garden-apartments';
    const short = await coldLoad(`?building=${tower}&seed=${seed.toString()}&duration=300`);
    const long = await coldLoad(`?building=${tower}&seed=${seed.toString()}&duration=1200`);
    try {
      await leaveTutorialIfOffered(short);
      await leaveTutorialIfOffered(long);
      const shortEnd = await stageLengthPhrase(short);
      const longEnd = await stageLengthPhrase(long);
      expect(shortEnd).not.toBe('');
      /* The defect: these read five minutes and twenty on one day everybody is told they share. */
      expect(shortEnd).toBe(longEnd);
    } finally {
      await short.close();
      await long.close();
    }
  }, 120_000);

  it('holds the address bar bare on a fix-it case, and gives the Scenario its address back after — § D1097', async () => {
    const { seed } = today();
    const page = await coldLoad(`?building=midtown-office&seed=${seed.toString()}`);
    try {
      await openScenarioEntry(page, 'fix-a-building');
      await page.waitForSelector('.everyday-fixit', { timeout: 30_000 });
      /* The defect: the daily's `?building=…&seed=…` stood over a case playing another tower. */
      await page.waitForFunction(() => window.location.search === '', undefined, { timeout: 10_000 });

      await page.locator('.everyday-bar-leave').click();
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
      await page.waitForFunction(() => window.location.search.includes('seed='), undefined, { timeout: 10_000 });
    } finally {
      await page.close();
    }
  }, 120_000);
});
