/**
 * **Screens that read the host once, across a trip to the Engineer surface** — GitHub issue #535,
 * § D566.
 *
 * `shell.ts#returnToEveryday` leaves every screen mounted: the state, the listeners and the DOM all
 * survive the trip, which is what makes the return land where the player left. For a screen that
 * *subscribes* that is fine. For one that read the host when it was drawn and never again, a
 * setting written on the other side comes back invisible — the screen shows what stood at the swap.
 *
 * PR #530 found the first of those (the rush setup screen) and fixed it with one guarded redraw.
 * The issue asked the same question of the three screens with the same shape, and the answers are
 * not the same:
 *
 * - **`boardScreen.ts` can**, and the case below drives it. § 20.10's gate — *a dispatcher with
 *   unsaved changes cannot be sent through the gauntlet* — is drawn from `editedDispatcher()`, and
 *   the Engineer surface's own weight sliders are what make a dispatcher dirty. Stale, the board
 *   offers a send the gate refuses, on a button that starts forty runs.
 * - **`landingScreen.ts` can**, and the second case drives it. Its single call to action is chosen
 *   by `tutorialIsDue`, which asks the week how many days have been filed, and the Engineer
 *   surface can file one.
 * - **`designerScreen.ts` cannot.** It reads the host twice, both at mount, and one of the two is
 *   the stable resources; the other seeds a drawing the player then owns. There is no case here for
 *   it, and its docstring says why — re-reading would *discard* a tower being drawn, so the fix
 *   would be worse than the defect. A screen that cannot go stale is a finding, and inventing a
 *   case for it would be inventing a defect.
 *
 * Both cases below were watched **red** before the fix: the board came back offering the send, and
 * the landing page came back offering the walkthrough to a player who had just filed a day.
 *
 * Driven on the shipped artifact and through the player's own doors — the rail's swap row and the
 * Engineer header's return — for `dev/browserTier.test-helper.ts`'s standing reason. No metric is
 * read (§ D220 § 4).
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  enterEngineerStage,
  leaveTutorialIfOffered,
  openEverydayDoor,
  openPage,
  returnToEverydayMode,
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
  site = await startShippedSite({ preview: { port: 5248, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** `#run` is the Engineer's Run button; `dev/main.ts#onRunning` labels it from the runner's own transition. */
const RUN_IDLE = 'Run this shift';

/**
 * A cold load, settled.
 *
 * `duration` is short for the landing case's sake — that one runs a shift on the Engineer surface
 * and then files it, and `deepLinkStateOf` clamps the value to `[60, 7200]`, so the address really
 * asks for the day it names.
 */
async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242&duration=300`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** What the board's § 20.10 send gate is offering, as a player sees it. */
async function sendGate(page: Page): Promise<{ readonly disabled: boolean; readonly refusal: string | null }> {
  return page.evaluate(() => ({
    disabled: document.querySelector<HTMLButtonElement>('.everyday-gauntlet-send')?.disabled ?? false,
    refusal: document.querySelector('.everyday-gauntlet-refusal')?.textContent ?? null,
  }));
}

describe.skipIf(!HAS_BROWSER)('a screen covered while the Engineer surface has the page', () => {
  it('draws the board’s send gate against the dispatcher the panel left dirty, not the one that stood at the swap', async () => {
    const page = await coldLoad();
    try {
      await leaveTutorialIfOffered(page);
      await page.click('button:has-text("Boards & ladder")');
      /* The tabs appear only once `data/proof-cases.json` has loaded and parsed. */
      await page.waitForSelector('.everyday-board-tab-ladder', { timeout: 30_000 });

      /*
       * Non-vacuity: the gate is offering the send *before* the trip. Without this the assertion
       * after it would pass on a board that had always refused, for a reason nothing here wrote.
       */
      const before = await sendGate(page);
      expect(before.disabled).toBe(false);
      expect(before.refusal).toBeNull();

      await enterEngineerStage(page);
      /*
       * The workshop's own sliders, driven the way `dev/savedDispatcher.browser.test.ts` drives
       * them: a range control cannot be `fill`ed, so the value is written and an `input` raised.
       * One slider at its far end is a weight vector the library does not hold, which is exactly
       * what `specIsDirty` answers `true` for — and no term id is named here, because the editor
       * renders its rows from the cost-term library.
       */
      await page.locator('#rail-open-dispatcher').first().click();
      await page.waitForFunction(
        () => document.querySelector('#panel-dispatcher')?.hasAttribute('hidden') === false,
        undefined,
        { timeout: 30_000 },
      );
      const moved = await page.$$eval('#dispatcher-terms input[type="range"]', (inputs) => {
        const slider = inputs[0] as HTMLInputElement | undefined;
        if (slider === undefined) return 0;
        slider.value = slider.value === slider.max ? slider.min : slider.max;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        return inputs.length;
      });
      expect(moved, 'the term block drew no sliders, so nothing was moved').toBeGreaterThan(0);

      await returnToEverydayMode(page);

      /*
       * § 20.10's refusal, on the board that was covered while the weight moved. The button is the
       * half that matters: `startGauntlet` does not re-ask the gate on the press, so a stale
       * *enabled* button sends a dispatcher the product has just said cannot be sent.
       */
      const after = await sendGate(page);
      expect(after.refusal ?? '').toContain('not saved');
      expect(after.disabled).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('draws the landing page’s way in against the week the panel filed a day onto', async () => {
    const page = await coldLoad();
    try {
      /*
       * A fresh context is a first visit, so `shell.ts#offerTutorial` puts this page up — and the
       * call to action it draws is the first-session one, which opens the walkthrough rather than
       * a scenario. That is the state the Engineer surface is about to invalidate.
       */
      await page.waitForSelector('.everyday-landing', { timeout: 30_000 });
      const before = await page.evaluate(() => ({
        label: document.querySelector('.everyday-landing-cta')?.textContent ?? '',
        screen: document.querySelector<HTMLElement>('.everyday-landing-cta')?.dataset['screen'] ?? '',
      }));
      expect(before.screen).toBe('tutorial');

      await enterEngineerStage(page);
      /*
       * The Engineer surface's own Run button and its own filing key — one of `playerStartedARun`'s
       * two latch sites, and then `closeShift`, which has no playhead gate once that surface has
       * the page (`autoFile.browser.test.ts`, GitHub issue #287). Between them they file a day,
       * which is the one host fact this page draws.
       */
      await page.click('#run');
      await page.waitForFunction((label) => document.getElementById('run')?.textContent === label, RUN_IDLE, {
        timeout: 120_000,
      });
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      await page.keyboard.press('Control+Enter');
      await returnToEverydayMode(page);

      const after = await page.evaluate(() => ({
        landing: document.querySelector('.everyday-landing') !== null,
        label: document.querySelector('.everyday-landing-cta')?.textContent ?? '',
        screen: document.querySelector<HTMLElement>('.everyday-landing-cta')?.dataset['screen'] ?? '',
      }));
      /* Still this screen — the trip does not navigate, and a page that had is a different failure. */
      expect(after.landing).toBe(true);
      expect(
        after.screen,
        'the landing page is still offering the walkthrough to a player who has filed a day',
      ).toBe('scenario');
      /* And the label moved with the destination: a button promising a scenario opens one. */
      expect(after.label).not.toBe(before.label);

      /*
       * The positive control, taken after the assertion so it cannot mask a stale read: the day
       * really was filed, so a red above is this screen being stale rather than nothing having
       * happened on the other side of the door.
       */
      await openEverydayDoor(page);
      const scores = await page.evaluate(() =>
        [...document.querySelectorAll('.everyday-door-chip-score')].map((node) => node.textContent ?? ''),
      );
      expect(scores.filter((score) => /\d/u.test(score)).length).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  });
});
