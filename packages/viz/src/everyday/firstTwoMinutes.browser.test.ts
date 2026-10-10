/**
 * **Three of the six truth fixes in GitHub issue #569, verified by playing rather than by reading.**
 *
 * The issue's own criterion is *"each of the six is verified **by playing**, not by inspection —
 * every one of them was invisible to the existing suite"*. So this file drives the shipped bundle
 * in Chromium at **1440 × 900**, which is the viewport the playability assessor measured at, and
 * asks the three questions a unit tier cannot:
 *
 * | # | what was wrong | what is asked here |
 * |---|---|---|
 * | **6** | *Run the day and decide as it goes* landed on a **paused** clock under a centred `Start`, one screen after the brief's `Start the day` — two starts for one intention | no stage-reaching primary shares a verb with the overlay the stage actually draws, derived from the table (GitHub issue #573, § D1309) |
 * | **5** | the tutorial's only control sat at y = 889.5 in a 900 px viewport, below an **inner** scroller `window` scrolling does not reach | the press is inside the viewport, and `elementFromPoint` at its centre returns it |
 * | **1** | the footer read *“…Nothing is shown until both land”* while both runs were on screen | once the comparison is settled, that sentence is not on the page |
 *
 * **Why the viewport is a constant and not a sweep.** `everyday/viewportGates.browser.test.ts`
 * sweeps the small end and `everyday/smallScreen.browser.test.ts` plays at 360 px; neither is where
 * these three were found. 1440 × 900 is a common laptop and is the size at which a control that is
 * *nearly* above the fold is below it, which is exactly the failure #569 item 5 measured. A sweep
 * would have diluted that into a range in which the defect disappears.
 *
 * **Items 2 and 3 of the issue are deliberately absent.** They are `shift/week.ts`'s frozen day
 * counter and are another lane's — fixing the strings here without fixing the counter would be
 * editing a symptom to match a wrong state, which is the one thing #569 says not to do.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ACTION_BAR_ROWS } from './actionBar.js';
import { NEVER_OPENS_THE_STAGE, primariesSharingVerb, verbOf } from './overlayVerb.test-helper.js';
import {
  CHROMIUM,
  EVERYDAY_SCREEN_ROUTES,
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
  /* Its own port — `dev/browserTier.test.ts` requires every tier file's to be distinct, because
     `strictPort: false` makes a collision fail quietly rather than loudly. */
  site = await startShippedSite({ preview: { port: 5321, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** The assessor's own viewport, and the one every case here drives. */
const LAPTOP = { width: 1440, height: 900 } as const;

async function laptop(): Promise<Page> {
  const page = await openPage(browser, { viewport: { ...LAPTOP } });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  return page;
}

describe.skipIf(!HAS_BROWSER)('§ 569 — what a first-time player meets in their first two minutes', () => {
  /**
   * **Item 6, raised** — GitHub issue #573, [§ D1309](../../../../DECISIONS.md). The building's
   * press opens the § 7 stage **paused** (§ 7.3), and the player met two starts for one intention:
   * the brief's `Start the day`, then the overlay's `Start`.
   *
   * The criterion is the issue's: **no stage-reaching primary shares a verb with the overlay**. The
   * overlay's verb is read off the drawn page, not off a constant, and the primaries are derived from
   * `actionBar.ts`'s own table (`overlayVerb.test-helper.ts`), so a tenth route that shares the verb
   * fails here rather than escaping by not being listed. It was red while the overlay said `Start`,
   * on `Start the day`, `Start the rush` and `Start the month again`.
   *
   * And the building row says the guide's *Run the day…* again, because the press does run the day.
   */
  it('lets no stage-reaching primary share a verb with the overlay the stage draws', async () => {
    const page = await laptop();
    try {
      await EVERYDAY_SCREEN_ROUTES.building(page);
      const label = (await page.textContent('.everyday-bar-primary')) ?? '';
      const row = ACTION_BAR_ROWS.find((entry) => entry.screen === 'building');
      expect(row?.primary.variants).toContain(label);
      expect(label).toMatch(/^Run the day/u);

      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage', { timeout: 30_000 });

      /* The day is simulated on a worker, so the stage says so until the recording lands. */
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday-stage-start')?.checkVisibility() === true,
        undefined,
        { timeout: 180_000 },
      );
      const overlay = verbOf((await page.textContent('.everyday-stage-start')) ?? '');
      expect(overlay).not.toBe('');
      const offending = primariesSharingVerb(overlay).filter(
        (entry) => NEVER_OPENS_THE_STAGE[entry.key] === undefined,
      );
      expect(offending, `primaries that reach the stage and say ${overlay}`).toEqual([]);
      /* One verb for one act: the overlay and the transport both play the day back. */
      expect(verbOf((await page.textContent('.everyday-stage-play')) ?? '')).toBe(overlay);
    } finally {
      await page.close();
    }
  }, 300_000);

  /**
   * **Item 5.** The tutorial's one control — *Spread the cars out*, the first run-affecting control
   * a new player can press — is reachable without scrolling.
   *
   * `elementFromPoint` at the button's own centre is the question rather than the bounding box
   * alone: a control inside the viewport and **under** something else is not reachable either, and
   * a box check would pass on it. The box is asserted too, because `elementFromPoint` returning the
   * button says nothing about whether the part a player aims at is on screen.
   */
  it('puts the tutorial’s one control inside a 1440×900 viewport, hit-testable where it is drawn', async () => {
    const page = await laptop();
    try {
      await EVERYDAY_SCREEN_ROUTES.collapse(page);
      const press = page.locator('.everyday-collapse-press');
      await press.waitFor({ state: 'visible', timeout: 30_000 });
      /*
       * **Measured with the canvas up, which is the state the defect lives in.** Before the run
       * lands the stage block is one sentence rather than a 42vh canvas, so the press sits high on
       * the page and a box read then would pass for the wrong reason — the assessor's y = 889.5 was
       * taken against a drawn canvas.
       */
      await page.waitForSelector('.everyday-collapse-stage-canvas', {
        state: 'visible',
        timeout: 180_000,
      });

      const box = await press.boundingBox();
      expect(box).not.toBeNull();
      if (box === null) return;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(LAPTOP.height);

      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.className ?? null,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(hit).toBe('everyday-collapse-press');
    } finally {
      await page.close();
    }
  }, 240_000);

  /**
   * **Item 1.** The pending footer is drawn only while the runs are pending.
   *
   * The settled state is identified by the **worked answer's own body** rather than by a timer: the
   * component draws its pending line until both recordings are in hand and its counts afterwards,
   * so waiting for the counts is waiting for exactly the state the assessor photographed the wrong
   * sentence in. Then the whole page is read, not just the bar, because the sentence has two
   * authored sites and this asks that neither of them is on screen beside a settled comparison.
   */
  it('stops promising the two runs are coming once both are on screen', async () => {
    const page = await laptop();
    try {
      await EVERYDAY_SCREEN_ROUTES.collapse(page);
      /* The press is what puts the second run on the canvas and mounts the worked answer. */
      const press = page.locator('.everyday-collapse-press');
      await press.waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForFunction(
        () => document.querySelector('.everyday-collapse-press')?.hasAttribute('disabled') === false,
        undefined,
        { timeout: 180_000 },
      );
      await press.click();
      await page.waitForSelector('.everyday-worked-answer-movement', { timeout: 180_000 });

      const PENDING = 'Nothing is shown until both land';
      expect(await page.textContent('body')).not.toContain(PENDING);
    } finally {
      await page.close();
    }
  }, 300_000);
});
