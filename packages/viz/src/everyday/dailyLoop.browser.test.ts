/**
 * **Today's tower is a loop** — GAMEPLAY § 6, driven end to end on a page.
 *
 * ## Why this needs a browser and the four view suites do not
 *
 * `doorView.test.ts` and its siblings decide what each screen *says*. What they cannot decide is
 * whether the four screens are **connected**: that the front door's primary reaches the brief, that
 * the brief's reaches the stage, that *Close the day* is what fills the report, and that the report
 * leads to Your week. Every one of those is a press on the shell's own bar wired to a screen's
 * mount handle, and the shell is a document.
 *
 * It is also the only tier that can see the loop's two withheld states **as a player meets them**.
 * § 16 rule 1 says an unfinished day shows `—` and that `dayClosed` is set by *Close the day*
 * alone; the honest way to test *alone* is to navigate to the report by another route and read the
 * week, which is what the third case does. A node test can assert the rule; only this one can
 * assert that no other press in the product breaks it.
 *
 * ## What is deliberately not asserted
 *
 * No metric, per § D220 § 4 and `shell.browser.test.ts`'s own rule. The cases read *a figure is
 * present* or *a figure is withheld* — never what it measured.
 *
 * Pattern and gate are `shell.browser.test.ts`'s.
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

/** A cold load, waited out to the point where the Engineer menu has been dismissed. */
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

/** The front door, from the menu tile — § 6.1, and the first stop on the § 3.3 daily timeline. */
async function openDoor(page: Page): Promise<void> {
  await page.locator('.everyday-mode[data-screen="door"]').click();
  await page.waitForSelector('.everyday-door', { timeout: 15_000 });
}

/**
 * A rail row, by the screen it opens — the navigation a player performs.
 *
 * § 3.2's rail has **no daily group**: the loop's four screens are navigated by § 3.3's timeline
 * and its primaries, and the rail carries only `CAMPAIGN`, `DESIGN` and `WORLD`. So the one rail
 * row this file uses is *Your week*, which is `WORLD`'s, and everything else here is a bar press.
 */
async function railTo(page: Page, label: string): Promise<void> {
  await page.locator('.everyday-rail button', { hasText: label }).first().click();
}

/**
 * Walk the § 3.3 primary from the front door to the stage.
 *
 * **The stage is a screen, so the wait is for the screen.** This helper landed waiting for
 * `.everyday-main` to go `display: none` — the § D335 hand-off's geometry, where entering the stage
 * shrank the shell to its rail and uncovered the Engineer surface beside it.
 * `everyday/stageScreen.ts` retired that: the stage mounts in the screen region like every other
 * registered key, `.everyday-main` stays `grid` for the whole loop, and waiting for the old
 * geometry would time out on a product that is working.
 */
async function toStage(page: Page): Promise<void> {
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
}

/**
 * Wait for the run *Start the day* asked for to land on the stage.
 *
 * The simulation is on a worker (`dev/shiftRunner.ts`), so the brief's primary returns before there
 * is a recording. `runState().open` is the § 3.4 latch and is exactly the condition a close needs:
 * a run this shell simulated, that the player asked for, and not yet filed.
 */
async function waitForOwnRun(page: Page): Promise<void> {
  await page.evaluate(
    "import('/src/everyday/host.ts').then((module) => { window.__everydayHost = module.EVERYDAY_HOST; return true; })",
  );
  await page.waitForFunction(
    () =>
      (window as unknown as { __everydayHost?: { current(): { runState(): { open: boolean } } | undefined } })
        .__everydayHost?.current()
        ?.runState().open === true,
    undefined,
    { timeout: 60_000 },
  );
}

/**
 * File the day the way the product does — `closeShift`, through the data host.
 *
 * § 3.3 gives the stage row the primary `Close the day`, and **that button now exists**:
 * `everyday/stageScreen.ts`'s `primary` pauses the playback and calls `host.closeDay()`, which is
 * exactly the call below. This docstring said there was no Everyday button to press, on a tree where
 * the stage handed off to the Engineer surface and drew no bar; that stopped being true when § 7's
 * stage became a screen.
 *
 * The call is kept because what these cases are about is **what a closed day does to the other three
 * screens**, and going through the host makes the close a single deterministic step rather than a
 * press whose timing depends on the stage's own mount. The press itself is driven where it belongs —
 * `shell.browser.test.ts` presses it through § 3.4's strip and `stageScreenModel.test.ts` pins its
 * label.
 */
async function closeDay(page: Page): Promise<void> {
  await page.evaluate(
    "import('/src/everyday/host.ts').then((module) => { module.EVERYDAY_HOST.current()?.closeDay(); return true; })",
  );
}

describe.skipIf(!HAS_BROWSER)('the daily loop is walkable end to end', () => {
  it('goes door → brief → stage → report → week on the § 3.3 primary alone', async () => {
    const page = await coldLoad();
    try {
      await openDoor(page);
      // § 3.3's door row: the primary is `Set up today`, and it is step 1 of the daily timeline.
      expect(await page.textContent('.everyday-bar-primary')).toBe('Set up today');

      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      expect(await page.textContent('.everyday-bar-primary')).toBe('Start the day');
      // § 3.3's brief note names the dispatcher that will drive — the screen's own substitution.
      expect(await page.textContent('.everyday-bar-note')).toContain('Running the lifts:');

      // § 6.3 / § 7: the day is `everyday/stageScreen.ts`, drawn in the screen region like every
      // other registered key — see {@link toStage} for the geometry this used to wait for.
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });

      /*
       * Close the day, then come back through Your week — which is the loop's tail as this build
       * has it: the rail's `WORLD` row opens the week, today's card opens the account of it, and
       * the report's own § 3.3 primary goes back to the week. See {@link closeDay} for the one
       * press that has no Everyday home yet.
       */
      await waitForOwnRun(page);
      await closeDay(page);
      await railTo(page, 'Your week');
      await page.waitForSelector('.everyday-week', { timeout: 15_000 });
      expect(await page.textContent('.everyday-week-title')).toBe('Your week');

      await page.locator('.everyday-week-card-open').click();
      await page.waitForSelector('.everyday-report', { timeout: 15_000 });
      expect(await page.textContent('.everyday-bar-primary')).toBe('Your week');
      // And a filed sheet, not the empty one: the loop produced an account of the day it ran.
      expect(await page.locator('.everyday-report-empty').count()).toBe(0);
      expect(await page.locator('.everyday-report-figures .everyday-figure').count()).toBeGreaterThan(0);

      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-week', { timeout: 15_000 });
    } finally {
      await page.close();
    }
  }, 180_000);

  it('withholds today everywhere until *Close the day*, and fills it in when pressed', async () => {
    const page = await coldLoad();
    try {
      await openDoor(page);

      /*
       * § 16 rule 1, at the front door: today's chip is the last of the seven, and it reads the em
       * dash rather than a `0%` for as long as the day is unfinished.
       */
      const beforeDoor = await page.evaluate(() => {
        const chips = [...document.querySelectorAll('.everyday-door-chip')];
        const today = chips.at(-1);
        return {
          chips: chips.length,
          score: today?.querySelector('.everyday-door-chip-score')?.textContent ?? '',
          note: today?.querySelector('.everyday-door-chip-note')?.textContent ?? '',
        };
      });
      expect(beforeDoor.chips).toBe(7);
      expect(beforeDoor.score).toBe('—');
      expect(beforeDoor.note).toBe('today · not closed yet');

      // And in Your week, reached from the rail — a navigation, which § 16 rule 9 says scores
      // nothing and § 16 rule 1 says must not fill today's card in.
      await railTo(page, 'Your week');
      await page.waitForSelector('.everyday-week', { timeout: 15_000 });
      const beforeWeek = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.everyday-week-card')];
        const today = cards.at(-1);
        return {
          score: today?.querySelector('.everyday-week-card-score')?.textContent ?? '',
          note: today?.querySelector('.everyday-week-card-note')?.textContent ?? '',
          percentile: document.querySelector('.everyday-week-percentile-line')?.textContent ?? '',
        };
      });
      expect(beforeWeek.score).toBe('—');
      expect(beforeWeek.note).toBe('today · not closed yet');
      expect(beforeWeek.percentile).toMatch(/not closed/);

      /*
       * Now close the day — through the stage's own § 3.3 primary, which is the **only** thing
       * that sets `dayClosed`. Reaching the report by the rail above did not, which is the half of
       * rule 1 that is easy to lose.
       */
      /*
       * Run the day, then close it. Both halves matter: `closeShift` refuses a run nobody started
       * (§ D232), so a close before *Start the day* files nothing — which is itself the reason the
       * brief's primary latches rather than merely navigating.
       *
       * Back to the menu first, through the rail's own Main menu row: § 3.2 gives the rail no daily
       * group, so the front door is entered from the menu tile and from nowhere else.
       */
      await page.locator('.everyday-rail-menu').click();
      await page.waitForSelector('.everyday-mode[data-screen="door"]', { timeout: 15_000 });
      await openDoor(page);
      await toStage(page);
      await waitForOwnRun(page);
      await closeDay(page);

      await railTo(page, 'Your week');
      await page.waitForSelector('.everyday-week', { timeout: 15_000 });
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('.everyday-week-card')]
            .at(-1)
            ?.querySelector('.everyday-week-card-score')?.textContent !== '—',
        undefined,
        { timeout: 20_000 },
      );
      const afterWeek = await page.evaluate(() => {
        const today = [...document.querySelectorAll('.everyday-week-card')].at(-1);
        return {
          score: today?.querySelector('.everyday-week-card-score')?.textContent ?? '',
          note: today?.querySelector('.everyday-week-card-note')?.textContent ?? '',
          tally: document.querySelector('.everyday-week-tally')?.textContent ?? '',
        };
      });
      expect(afterWeek.score).toMatch(/^\d+%$/);
      expect(afterWeek.note).toContain('today');
      expect(afterWeek.note).not.toContain('not closed yet');
      // Derived from the rendered list, so a card that filled in moves the tally with it.
      expect(afterWeek.tally).toMatch(/1 (?:day|days) closed/);
    } finally {
      await page.close();
    }
  }, 180_000);

  it('renders the report with the API absent, and never a spinner or a zero for the world', async () => {
    const page = await coldLoad();
    try {
      await openDoor(page);

      /*
       * § 16 rule 15 and § 12.2's *"with the API unreachable, every world figure renders a
       * labelled unavailable state and the screen is otherwise complete"*. This build has no
       * server at all, so that is the state the band is always in — which makes it testable
       * without one, exactly as the rule says.
       */
      const door = await page.evaluate(() => ({
        band: document.querySelector('.everyday-world-absent')?.textContent ?? '',
        label: document.querySelector('.everyday-world-label')?.textContent ?? '',
        // Everything else on the screen is drawn: the band is a degraded figure, not a degraded page.
        lede: document.querySelector('.everyday-door-lede')?.textContent ?? '',
        steps: document.querySelectorAll('.everyday-door-step').length,
        seed: document.querySelector('.everyday-door-seed')?.textContent ?? '',
      }));
      expect(door.label).toBe('WORLD FIGURES UNAVAILABLE');
      expect(door.band).not.toMatch(/\b0 players\b|Loading|…$/);
      expect(door.lede.length).toBeGreaterThan(40);
      expect(door.steps).toBe(3);
      expect(door.seed).toContain('crowd');

      await railTo(page, 'Your week');
      await page.waitForSelector('.everyday-week', { timeout: 15_000 });
      const week = await page.evaluate(() => ({
        label: document.querySelector('.everyday-world-label')?.textContent ?? '',
        // The board's own refusal, in `screens.ts`' words, beside the two rules it would keep.
        refusal: document.querySelector('.everyday-week-board-refusal')?.textContent ?? '',
        rules: document.querySelectorAll('.everyday-week-board > div').length,
      }));
      // One wording, two screens — the defect the shared module exists to prevent.
      expect(week.label).toBe(door.label);
      expect(week.refusal).toContain('server');
      expect(week.rules).toBe(2);
    } finally {
      await page.close();
    }
  }, 180_000);

  it('draws the brief’s elevation, its wrinkle and a dispatcher picker that writes', async () => {
    const page = await coldLoad();
    try {
      await openDoor(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });

      const brief = await page.evaluate(() => ({
        // The elevation is a real canvas with a real box — § 14's sizing rules need one.
        canvas: document.querySelector('.everyday-brief-elevation')?.getBoundingClientRect().width,
        wrinkle: document.querySelector('.everyday-brief-wrinkle-title')?.textContent ?? '',
        count: document.querySelector('.everyday-brief-count')?.textContent ?? '',
        // The two cards this build states rather than offers, each with its reason drawn.
        ghost: document.querySelector('.everyday-brief-ghost-why')?.textContent ?? '',
        locked: document.querySelector('.everyday-brief-locked-why')?.textContent ?? '',
      }));
      expect(brief.canvas ?? 0).toBeGreaterThan(100);
      expect(brief.wrinkle.length).toBeGreaterThan(3);
      // Derived from the rendered list — § 16 rule 5.
      expect(brief.count).toMatch(/^\d+ to choose from · \d+ of yours$/);
      expect(brief.ghost).toMatch(/one run at a time/);
      expect(brief.locked).toMatch(/tuner|sandbox/i);

      /*
       * **Move the control and require the run to change** — the standing requirement, pointed at
       * the one control on this screen that writes. Read on the *selection* rather than on a
       * figure: the picker's whole job is to change which dispatcher the next run is built from,
       * and it takes effect on that run rather than on the one already recorded.
       */
      const before = await page.evaluate(
        "import('/src/everyday/host.ts').then((module) => module.EVERYDAY_HOST.current()?.selection().dispatcherId)",
      );
      const other = await page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>('.everyday-brief-picker');
        const option = [...(select?.options ?? [])].find((entry) => !entry.selected);
        return option?.value ?? '';
      });
      expect(other).not.toBe('');
      await page.selectOption('.everyday-brief-picker', other);
      const after = await page.evaluate(
        "import('/src/everyday/host.ts').then((module) => module.EVERYDAY_HOST.current()?.selection().dispatcherId)",
      );
      expect(after).toBe(other);
      expect(after).not.toBe(before);
      // And the screen followed its own write: the card marked *driving today* moved with it.
      await page.waitForFunction(
        (id: string) =>
          document.querySelector<HTMLSelectElement>('.everyday-brief-picker')?.value === id,
        other,
        { timeout: 15_000 },
      );
    } finally {
      await page.close();
    }
  }, 180_000);

  it('refuses a past day’s replay in the § 3.3 primary rather than pretending to open it', async () => {
    const page = await coldLoad();
    try {
      await openDoor(page);
      expect(await page.textContent('.everyday-door-kind')).toBe('TODAY’S TOWER');

      await page.locator('.everyday-door-back').click();
      await page.waitForFunction(
        () => document.querySelector('.everyday-door-kind')?.textContent?.includes('REPLAY') === true,
        undefined,
        { timeout: 15_000 },
      );

      const replay = await page.evaluate(() => {
        const primary = document.querySelector<HTMLButtonElement>('.everyday-bar-primary');
        return {
          label: primary?.textContent ?? '',
          disabled: primary?.disabled,
          note: document.querySelector('.everyday-door-primary-note')?.textContent ?? '',
        };
      });
      // § 16 rule 6: visible, dimmed, inert — and it says what it is short by.
      expect(replay.label).toBe('Set up the replay');
      expect(replay.disabled).toBe(true);
      expect(replay.note).toMatch(/cannot be re-opened/);

      // And forward again: today is pressable, so the refusal is about the day and not the screen.
      await page.locator('.everyday-door-forward').click();
      await page.waitForFunction(
        () => document.querySelector<HTMLButtonElement>('.everyday-bar-primary')?.disabled === false,
        undefined,
        { timeout: 15_000 },
      );
      expect(await page.textContent('.everyday-bar-primary')).toBe('Set up today');
    } finally {
      await page.close();
    }
  }, 180_000);
});
