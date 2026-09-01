/**
 * **The settings screen, driven on the page** — the three wirings a node test cannot vouch for:
 *
 * 1. § 20.15's check, verbatim: *changing the name updates the rail card without a reload*. The
 *    field writes `profileStore.ts`'s one store and the shell's subscription redraws the rail —
 *    two modules, one instance, and only a page proves they are the same instance.
 * 2. The profile survives a reload through the real `localStorage`, which the node tier fakes.
 * 3. The Motion pill lands its write in the **Engineer** seam — asserted against the persisted
 *    session envelope `persist/session.ts` owns, because that envelope is written by
 *    `dispatchMenu`'s `saveSessionNow()` and nothing else: the pill moving that byte is the proof
 *    it dispatched the Engineer's own intent rather than flipping a second flag.
 *
 * Pattern and gate are `shell.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  // A port of its own, `strictPort: false` — files in one project run concurrently.
  site = await startShippedSite({ preview: { port: 5199, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/**
 * A cold load, settled: the Engineer menu has been dismissed, which means `dev/main.ts`'s boot
 * ran — and therefore `provideEngineerSettings` has run, so the Motion row (not its booting
 * stand-in) is what these cases meet. `browser.newPage()` gives each case its own context, so
 * each starts with empty storage.
 */
async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** The rail's bordered gear row — § 3.2's one Settings destination. */
async function openSettings(page: Page): Promise<void> {
  await page.click('.everyday-rail-settings');
  await page.waitForSelector('.everyday-settings');
}

describe.skipIf(!HAS_BROWSER)('the Everyday settings screen', () => {
  it('opens from the rail’s gear row, which then reads HERE', async () => {
    const page = await coldLoad();
    await openSettings(page);
    expect(await page.textContent('.everyday-settings h1')).toBe('Settings');
    expect(await page.textContent('.everyday-rail-settings')).toContain('HERE');
    // The § 3.3 row for settings: ⌂ Modes on the left, Back to the modes as the primary.
    expect(await page.textContent('.everyday-bar-leave')).toBe('⌂ Modes');
    expect(await page.textContent('.everyday-bar-primary')).toBe('Back to the modes');
    await page.close();
  });

  it('changes the name and the rail card follows without a reload — and survives one (§ 20.15)', async () => {
    const page = await coldLoad();
    await openSettings(page);

    expect(await page.textContent('.everyday-identity')).toContain('you');
    await page.fill('.everyday-settings-name', 'Nadia R.');
    // No navigation, no reload: the card has already moved, because both surfaces read one store.
    expect(await page.textContent('.everyday-identity')).toContain('Nadia R.');
    expect(await page.textContent('.everyday-identity-avatar')).toBe('N');

    // The picked swatch recolours the rail disc the same way.
    await page.click('.everyday-settings-swatch[data-color="#5F7268"]');
    expect(
      await page.$eval('.everyday-identity-avatar', (disc) => (disc as HTMLElement).style.background),
    ).toContain('rgb(95, 114, 104)');

    // A refused draft is said beside the field and moves nothing.
    await page.fill('.everyday-settings-name', 'x');
    expect(await page.textContent('.everyday-settings-issue')).toContain('Pick a name');
    expect(await page.textContent('.everyday-identity')).toContain('Nadia R.');

    // And the committed profile is this device's, not this tab's: a reload brings it back.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
      undefined,
      { timeout: 30_000 },
    );
    expect(await page.textContent('.everyday-identity')).toContain('Nadia R.');
    await page.close();
  });

  it('flips Motion through the Engineer seam — the session envelope moves, not a second flag', async () => {
    const page = await coldLoad();
    await openSettings(page);

    expect(await page.textContent('.everyday-settings-motion')).toBe('full');
    await page.click('.everyday-settings-motion');
    expect(await page.textContent('.everyday-settings-motion')).toBe('reduced');

    /*
     * The proof the write landed in the Engineer's own switch: `saveSessionNow()` runs inside
     * `dispatchMenu`'s `set-setting` arm and nowhere on any Everyday path, so this byte moving
     * means the pill dispatched the same intent `menu/screens.ts`'s toggle dispatches.
     */
    const persisted = await page.evaluate(() => {
      const raw = window.localStorage.getItem('elevator-sim.session');
      if (raw === null) return undefined;
      const envelope = JSON.parse(raw) as {
        session?: { settings?: { reduceMotion?: boolean } };
      };
      return envelope.session?.settings?.reduceMotion;
    });
    expect(persisted).toBe(true);
    await page.close();
  });

  /**
   * **The Units pill, end to end — GitHub issue #170's Units half, [§ D448](../../../../DECISIONS.md).**
   *
   * Three claims, and the third is the one that needs a browser. The pill flips; the choice reaches
   * this device's own slot (a *word*, not a figure — the whole safety argument in one assertion);
   * and **a machine specification on another screen reads the other unit**, which is the difference
   * between a preference that is stored and a preference that is honoured. `settingsView.test.ts`
   * can see the first, `units.test.ts` the second, and neither can see the third: only a real
   * navigation puts the drawing board's rating plate in front of the value the pill just wrote.
   */
  it('flips Units, keeps a word in this device’s slot, and the plate reads feet', async () => {
    const page = await coldLoad();
    await openSettings(page);

    expect(await page.textContent('.everyday-settings-units')).toBe('metres');
    await page.click('.everyday-settings-units');
    expect(await page.textContent('.everyday-settings-units')).toBe('feet');

    /*
     * A word in the Everyday slot, beside the profile and never on it: identity travels with a
     * posted run and a display preference must not ride along with it.
     */
    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('elevator-sim.everyday-profile');
      if (raw === null) return undefined;
      return (JSON.parse(raw) as { units?: unknown }).units;
    });
    expect(stored).toBe('imperial');

    /* The consumer. § 13.2's rating plate, reached through the rail the way a player reaches it. */
    await page.click('nav.everyday-rail button:has-text("Design a building")');
    await page.waitForSelector('.everyday-designer-plate', { timeout: 30_000 });
    const plate = (await page.textContent('.everyday-designer-plate')) ?? '';
    expect(plate).toContain('ft/s');
    expect(plate).not.toContain('m/s');
    // Converted, not relabelled: the load row is reference data and is untouched by the preference.
    expect(plate).toContain('lb');
    await page.close();
  });
});
