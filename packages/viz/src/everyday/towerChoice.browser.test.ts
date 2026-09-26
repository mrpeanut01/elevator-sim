/**
 * **A player can choose which tower their week runs on** — GitHub issue **#587**,
 * [§ D912](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## Why this case is the deliverable rather than `towerChoice.test.ts`
 *
 * The finding this closes is not that the words were wrong. It is that **no player action reached
 * a day**: `c7` — the one contract whose day 1 the standing order misses and a press clears
 * (§ D871) — entered a week only through `shift/firstSession.ts`'s draw, which an assessor
 * measured at 37 of 365 dates and which `dev/state.ts#withFirstSession` takes once per device.
 * A pure test of the picker's rows would have passed on the day the picker wrote nothing, which is
 * this repository's signature defect: everything wired, nothing a player can press.
 *
 * So the case below presses the row in a browser and **reads the week back off the product** —
 * `CLAUDE.md`'s standing requirement in the form a navigation control can take it: move the
 * control and require the state to change, read where a player reads it.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which
 * is why the tier is run with it set — `describe.skipIf(!HAS_BROWSER)`, which is the one spelling
 * `dev/browserTier.test.ts` reads, and the other fifty-one files of the tier use.
 *
 * ## What it drives, and why not `shell.browser.test.ts`'s server
 *
 * **The shipped bundle**, through {@link startShippedSite} — GitHub issue #281, § D425. This file
 * landed driving a `vite dev` server on `shell.browser.test.ts`'s pattern, and that pattern is the
 * exception rather than the rule: `browserTier.test-helper.ts#DEV_SERVER_FILES` names four files
 * that may, and the one reason any of them may is that each reaches into the module graph **by
 * URL** — `page.evaluate("import('/src/everyday/host.ts')…")` — to drive `EVERYDAY_HOST`
 * directly, a path that exists on a dev server and not in `dist-web/`.
 *
 * Nothing here does that. Every one of the three cases below goes to an origin, clicks a row and
 * reads an attribute or a string back, so there was never anything to exempt: what it certified
 * was an artifact nobody receives, which is exactly the defect #281 is about — and a scroll-reset
 * bug had already lived in that difference. Converted by lane AG-FIX-1 rather than registered as a
 * fifth exception, because the registry is *a floor and not a ceiling*: every file that **can**
 * drive the bundle does.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openEverydayDoor,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /*
   * The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425. A port of
   * its own, kept at this file's original 5331 so the tier's distinct-port clause still reads one
   * number here; `strictPort: false` because files in one project run concurrently and a busy port
   * should move rather than fail the case.
   */
  site = await startShippedSite({ preview: { port: 5331, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A cold load with the Engineer menu dismissed, the tutorial left, and the front door open. */
async function atTheDoor(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await leaveTutorialIfOffered(page);
  await openEverydayDoor(page);
  await page.waitForSelector('.everyday-door-towers', { timeout: 30_000 });
  return page;
}

/** Which contract the picker says the week is standing on — the product's own answer. */
async function selectedContract(page: Page): Promise<string | null> {
  return page.getAttribute('.everyday-door-tower[data-selected="true"]', 'data-contract');
}

describe.skipIf(!HAS_BROWSER)('the week’s tower is a control a player can press', () => {
  it('opens the front door with a row per shipped tower and exactly one marked', async () => {
    const page = await atTheDoor();
    try {
      const rows = await page.locator('.everyday-door-tower').count();
      expect(rows, 'a row per shipped contract').toBeGreaterThan(1);
      expect(await page.locator('.everyday-door-tower[data-selected="true"]').count()).toBe(1);
      /* § 16 rule 6: the row the week is on is drawn and inert rather than hidden. */
      expect(await page.isDisabled('.everyday-door-tower[data-selected="true"]')).toBe(true);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('draws Secure Tower’s scenario as held, with its reason, and the row still moves the week — § D1179', async () => {
    /*
     * Swarm DM's ruling (a): a tower whose week the census counts no day of has its scenario's
     * clear held, and nothing else. So the reason is read where a player reads it, inside the row,
     * and the row is pressed and required to move the week, which is what *nothing is locked* means
     * on this surface.
     */
    const page = await atTheDoor();
    try {
      const held = page.locator('.everyday-door-tower[data-contract="c3"] .everyday-door-tower-scenario');
      expect(await held.getAttribute('data-scenario')).toBe('held');
      const reason = (await held.textContent()) ?? '';
      expect(reason).toContain('held back');
      expect(reason).toContain('have not been measured as they are dealt');
      expect(reason).not.toMatch(/\b(cannot|unwinnable)\b|found none/iu);
      await page.click('.everyday-door-tower[data-contract="c3"]');
      await page.waitForSelector('.everyday-door-tower[data-contract="c3"][data-selected="true"]', {
        timeout: 30_000,
      });
      expect(await selectedContract(page)).toBe('c3');
      /* Harbour Point stays offered, and its row names its one counting day. */
      const harbour = page.locator('.everyday-door-tower[data-contract="c9"] .everyday-door-tower-scenario');
      expect(await harbour.getAttribute('data-scenario')).toBe('offered');
      expect((await harbour.textContent()) ?? '').toContain('Monday');
    } finally {
      await page.close();
    }
  }, 120_000);

  it('moves the week to Crown Hotel when its row is pressed, and says so afterwards', async () => {
    /*
     * `c7` by name, because it is the contract the finding is about: the day whose verdict turns on
     * a press was reachable only by a once-per-device draw, and this is the press that reaches it.
     */
    const page = await atTheDoor();
    try {
      expect(await selectedContract(page)).not.toBe('c7');
      await page.click('.everyday-door-tower[data-contract="c7"]');
      await page.waitForSelector('.everyday-door-tower[data-contract="c7"][data-selected="true"]', {
        timeout: 30_000,
      });
      expect(await selectedContract(page)).toBe('c7');
      /*
       * And the **rest of the product** moved with it, not just the picker: the door's seed line is
       * `everyday/today.ts#seedLineOf`, composed from the building the run is set to, so a picker
       * that wrote only its own selection would leave this naming the tower the player left. That
       * line is the honest place to read it — the lede names floors and people rather than the
       * building, so it would pass on the wrong tower.
       */
      const seed = (await page.textContent('.everyday-door-seed')) ?? '';
      expect(seed).toContain('crown-hotel');
    } finally {
      await page.close();
    }
  }, 120_000);

  it('brings a week back rather than restarting it, which is the whole of the resume arm', async () => {
    /*
     * Press away and press back. `shift/week.ts#switchWeek`'s `resume` arrival parks the departing
     * week under its own id and picks the destination's up if there is one — so the second press
     * finds a parked entry, and the row that offered it says *resume* rather than *open* before it
     * is pressed. That sentence is the promise; this is the check that the product keeps it.
     *
     * **A day is closed first, and since wave AI that is what makes it a week to resume.**
     * `towerChoice.ts#towerChoiceViewOf` calls a parked week *a week going here* only once somebody
     * has played it — a closed day, or a day past the first — because a fresh profile read *"this
     * picks it back up"* over a Monday nobody had touched (the post-AH panel's B.md). Picking an
     * unplayed week back up is a fresh week in everything a player can see, so that row now says
     * *open*, and this case would be testing nothing on one. So the week is played before it is
     * left, and what comes back is checked on the strip as well as on the picker: the closed Monday
     * is still there, which is what *rather than restarting it* means.
     */
    const page = await atTheDoor();
    try {
      const first = await selectedContract(page);
      expect(first).not.toBeNull();

      /* ---- close Monday on the week the page opened on, through § 3.3's own primaries ---- */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForFunction(
        () => (document.querySelector('.everyday-bar-primary')?.textContent ?? '').includes('Close the day'),
        undefined,
        { timeout: 60_000 },
      );
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report', { timeout: 30_000 });
      await page.locator('.everyday-rail-menu').click();
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
      await openEverydayDoor(page);
      await page.waitForSelector('.everyday-door-towers', { timeout: 30_000 });
      expect(await selectedContract(page)).toBe(first);
      const played = (await page.textContent('.everyday-door-strip')) ?? '';
      /* A closed day draws its score; an unplayed chip draws a dash — `doorView.ts`'s chip. */
      expect(played).toMatch(/\d+%/u);

      /* ---- away, and back ---- */
      await page.click('.everyday-door-tower[data-contract="c7"]');
      await page.waitForSelector('.everyday-door-tower[data-contract="c7"][data-selected="true"]', {
        timeout: 30_000,
      });
      const back = await page.textContent(`.everyday-door-tower[data-contract="${first ?? ''}"]`);
      expect(back ?? '').toContain('picks it back up');
      await page.click(`.everyday-door-tower[data-contract="${first ?? ''}"]`);
      await page.waitForSelector(
        `.everyday-door-tower[data-contract="${first ?? ''}"][data-selected="true"]`,
        { timeout: 30_000 },
      );
      expect(await selectedContract(page)).toBe(first);
      /* The week that came back is the one that was left, closed Monday and all. */
      expect((await page.textContent('.everyday-door-strip')) ?? '').toBe(played);
    } finally {
      await page.close();
    }
  }, 120_000);
});
