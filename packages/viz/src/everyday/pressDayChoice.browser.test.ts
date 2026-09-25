/**
 * **A player reaches a day whose verdict turns on a press, from the front door, with no address
 * parameter** — GitHub issue #595, [§ D973](../../../../DECISIONS.md), on the shipped bundle.
 *
 * ## Why this case is the deliverable
 *
 * Wave AG shipped seven pinned days (§ D914) and a tower picker (§ D912), and they did not compose:
 * the picker moved the week and left the crowd on the date's seed, so the pinned day was reachable
 * only through a `?seed=` address — and on five of the seven towers the pin had been measured on a
 * thirty-minute slice of a day the Scenario press runs ten hours long. A pure test of
 * `towerChoice.ts#pressDayChoiceOf` would pass on the day the door wrote nothing. So this loads the
 * built bundle on a **bare origin** — no `?building=`, no `?seed=` — presses a row, and reads the
 * product's own answer back where a player reads it: the door's seed line, and the brief's
 * moot-dispatcher sentence, which `everyday/today.ts` draws only when `shift/ladder.ts#pressDayStanding`
 * holds of the run the next press will take (contract, day 1, ordinary wrinkle, no calendar, the
 * pinned seed and the pinned horizon). That sentence appearing is the shipped product agreeing that
 * the day standing is the day that was measured.
 *
 * Crown Hotel (`c7`), pinned on the slice the product plays a hotel on. The horizon gate — the one
 * #595 added — is exercised on the shipped bundle by the same sentence: the brief draws it only if
 * `host.scenarioHorizon()` answers the pin's own horizon for that tower.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, so the tier
 * is run with it set and the case count is what is read (`describe.skipIf(!HAS_BROWSER)`).
 *
 * Port 5621, inside this lane's reserved 5621–5629, `strictPort: false` so a busy port moves rather
 * than fails the case. **No case or hook carries a timeout of its own**: the `viz-browser` project's
 * 120 000 ms ceiling covers every one, and `testCost.test.ts` counts an annotation as a claim.
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
import { pressDayFor } from '../shift/ladder.js';
import { dailySeedAt } from '../shift/dailySeed.js';
import { deviceNowMs } from '../shift/deviceDate.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5621, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A cold load of the bare origin — no address parameter at all — to the front door. */
async function atTheDoor(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: 'load' });
  expect(new URL(page.url()).search, 'the case must not carry an address parameter').toBe('');
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await leaveTutorialIfOffered(page);
  await openEverydayDoor(page);
  await page.waitForSelector('.everyday-door-pressdays', { timeout: 30_000 });
  return page;
}

/** Press a pinned day's row, and wait for the door to say it is standing. */
async function choosePressDay(page: Page, contractId: string): Promise<void> {
  const row = `.everyday-door-pressday[data-contract="${contractId}"]`;
  /*
   * A fresh device is dealt a pinned day off the date since § D1047, so on the dates whose draw is
   * this tower the row already reads *the day you are set up to play* and is correctly inert.
   */
  if ((await page.locator(`${row}[data-standing="true"]`).count()) > 0) return;
  expect(await page.isDisabled(row), `${contractId}'s row is offered on a fresh device`).toBe(false);
  await page.click(row);
  await page.waitForSelector(`${row}[data-standing="true"]`, { timeout: 30_000 });
}

/** The door's primary onto the brief, and the brief's moot sentence — or `null` when none is drawn. */
async function briefMoot(page: Page): Promise<string | null> {
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  const moot = page.locator('.everyday-brief-moot');
  return (await moot.count()) === 0 ? null : moot.textContent();
}

describe.skipIf(!HAS_BROWSER)('a day a press decides is reachable from the front door', () => {
  /*
   * The towers whose pin is on the horizon the product plays them on. Crown Hotel is pinned on the
   * slice a hotel is played on; the office towers join this list on the commit that re-measures
   * their pins on the whole day (GitHub issue #595, § D973), and not before — until then their rows
   * are refused on the door, which `towerChoice.test.ts` asserts over the shipped data.
   */
  for (const [contractId, buildingId] of [
    ['c7', 'crown-hotel'],
    /* A whole-day pin, re-measured by § D974 — the horizon gate on the shipped bundle. */
    ['c2', 'midtown-office'],
  ] as const) {
    it(`sets ${contractId}'s pinned day up on its own crowd, and the brief agrees it is that day`, async () => {
      const press = pressDayFor(contractId);
      expect(press, `${contractId} pins a day`).toBeDefined();
      const page = await atTheDoor();
      try {
        await choosePressDay(page, contractId);
        /* The week moved and the crowd is the pinned one — read off the seed line, not the picker. */
        const seed = (await page.textContent('.everyday-door-seed')) ?? '';
        expect(seed).toContain(buildingId);
        expect(seed).toContain(press?.seedText ?? 'no pinned seed');
        expect(seed, 'the line must not call a pinned crowd the day’s').toContain('not the day’s');
        /*
         * The brief's moot sentence is drawn only when every gate of the measurement holds of the
         * run the next press takes — including the horizon, which is what #595 added.
         */
        const moot = await briefMoot(page);
        expect(moot, `${contractId}: the brief draws the census over the pinned day`).not.toBeNull();
        /* § D1029: the brief keeps one derived sentence; the list of names is the report's now. */
        expect(moot ?? '').toContain('This day runs under the tower’s standing order');
        expect(moot ?? '').toContain('with no press at all');
      } finally {
        await page.close();
      }
    });
  }

  it('puts the crowd back when the player then chooses an ordinary tower', async () => {
    const page = await atTheDoor();
    try {
      const before = (await page.textContent('.everyday-door-seed')) ?? '';
      await choosePressDay(page, 'c7');
      /* Any other tower from the list above — a fresh week there, on the crowd the session had. */
      const other = page.locator('.everyday-door-tower[data-selected="false"]:not([data-contract="c7"])').first();
      const otherId = await other.getAttribute('data-contract');
      await other.click();
      await page.waitForSelector(
        `.everyday-door-tower[data-contract="${otherId ?? ''}"][data-selected="true"]`,
        { timeout: 30_000 },
      );
      const after = (await page.textContent('.everyday-door-seed')) ?? '';
      const crowdOf = (line: string): string => /crowd (\d+)/u.exec(line)?.[1] ?? '';
      /*
       * **The crowd put back is the day's, which since § D1047 is not the crowd the door opened on.**
       * A fresh device is dealt its own pinned day (`before` is that pin's crowd), and the boot hands
       * the host the date's crowd as the one to restore — so a player who leaves the pinned days for
       * an ordinary tower lands on the day's crowd, not on a pin of either tower. Read off the date
       * the page itself read, give or take a UTC midnight between the two reads.
       */
      expect(crowdOf(before)).not.toBe('');
      expect(crowdOf(after), 'the pinned crowd did not follow the player').toBe(dailySeedAt(deviceNowMs()).toString());
      expect(after).toContain('today’s date');
      expect(crowdOf(after)).not.toBe(pressDayFor('c7')?.seedText);
    } finally {
      await page.close();
    }
  });
});
