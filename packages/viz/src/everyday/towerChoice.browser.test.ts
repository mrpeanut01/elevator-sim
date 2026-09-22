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
 * Pattern and gate are `shell.browser.test.ts`'s: without `ELEVATOR_SIM_CHROMIUM` every case here
 * skips and the file reports a pass, which is why the tier is run with it set.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openEverydayDoor,
  openPage,
} from '../dev/browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    /* A port of its own — `strictPort: false` fails silently on a collision, so no file shares one. */
    server: { port: 5331, strictPort: false },
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

describe.runIf(HAS_BROWSER)('the week’s tower is a control a player can press', () => {
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
     */
    const page = await atTheDoor();
    try {
      const first = await selectedContract(page);
      expect(first).not.toBeNull();
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
    } finally {
      await page.close();
    }
  }, 120_000);
});
