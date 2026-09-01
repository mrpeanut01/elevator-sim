/**
 * **Watching, in the Everyday shell** — GitHub issue **#182**,
 * [§ D436](../../../../DECISIONS.md).
 *
 * ## Why this is in the browser tier and not beside `watchStage.ts`'s node cases
 *
 * Everything the model decides is already driven under plain Node: the § 3.3 row, § 20.15's
 * withdrawal, the no-first-person corpus, the host's gate-then-enter ordering. What none of that can
 * reach is the claim the issue actually makes, which is that the route **exists** — that a row on
 * a shipped screen opens the shipped stage in `ctx: 'watch'`. The shell sets `ctx` from a player's
 * press and `everyday/boot.ts` ends with a mount, so short of running the page this is prose
 * (§ D220's own argument for the tier existing at all).
 *
 * It asserts no figure. § D220 § 4 forbids a browser test claiming anything about a metric; the only
 * numbers read here are the ones the record was **filed** with, read as *the string the view
 * produced* and never as a statement about a run.
 *
 * ## The route it drives, which is the player's and not a helper's
 *
 * A cold load lands on the Everyday main menu (§ 3.5), the rail's `Your week` row opens § 14's
 * screen, and a `Watch it` button on one of its rows is pressed. **A reference run**, for
 * `dev/watch.browser.test.ts`'s stated reason: a cold page has closed no day, and making it close
 * one would put a two-minute campaign in front of the thing being tested — which is exactly the
 * first-visit emptiness `watch/reference.ts` says the fixtures exist to answer.
 *
 * ## The sweep, and why it is a region rather than a list of selectors
 *
 * § 14.1: *"The word `you` on a watched run is a defect."* `dev/watch.browser.test.ts` sweeps five
 * named selectors, because the Engineer shell's surfaces are scattered across a header, a rail, a
 * strip and a footer. This shell is not built that way: § 3.1 gives it **one screen region** and
 * **one action bar**, and every screen it mounts draws inside them. So the sweep is those two boxes
 * and the rail's own subline cell, and a string added anywhere on the watching screen is inside it
 * **by construction** — there is no per-surface list here that can drift from the surfaces.
 *
 * What is deliberately outside it is the rest of the rail: its rows name screens (`Your week`) and
 * its card names the player, and neither describes the run on the stage. That is `watch/shell.ts`'s
 * own line — *does this surface describe, identify or attribute the day on the stage?* — drawn in
 * writing rather than left to whoever adds the next surface.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
  site = await startShippedSite({ preview: { port: 5211, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/**
 * The two boxes § 3.1 gives the shell sole ownership of, plus the one rail cell that names the run.
 *
 * Not a list of surfaces: `.everyday-screen` is *the screen region*, so every element any screen
 * mounts is inside it. See the module docstring for why that distinction is the point.
 */
const SWEPT: readonly string[] = ['.everyday-screen', '.everyday-bar', '.everyday-rail-subline'];

/**
 * A cold load on the Everyday front door, with `dev/main.ts`'s boot finished behind it.
 *
 * **On a different building from the one the first reference row names**, which is not incidental:
 * every shipped reference run is `garden-apartments` or `midtown-office`, and a page opened on the
 * same tower as the row under test makes *the player's own run* and *the record* look alike on the
 * stage. The entry-rule case below measures whether a day of the player's own has been started, and
 * on a matching tower it would have measured nothing — the same shape as `dev/watch.browser.test.ts`'
 * own `SPECTATOR_SEED` note, where a fixture and a test that happened to agree hid the defect the
 * case was written for.
 */
async function openEveryday(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1400, height: 950 } });
  await page.goto(`${origin}?building=midtown-office&seed=424242`, { waitUntil: 'load' });
  /* The Engineer menu is dismissed behind the cover once the host has been published. */
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** § 14's screen, with its rows loaded — the second half of them is a fetch. */
async function openWeek(page: Page): Promise<void> {
  await page.click('button:has-text("Your week")');
  await page.locator('.everyday-week-watch-open').first().waitFor({ timeout: 30_000 });
}

/** Every forbidden word rendered inside `selector`, or `[]`. `innerText`, never `textContent`. */
async function firstPersonIn(page: Page, selector: string): Promise<string[]> {
  const rendered = await page.locator(selector).first().innerText();
  const words = rendered.toLowerCase().match(/[a-z']+/g) ?? [];
  return words.filter((word) => ['you', 'your', 'yours'].includes(word));
}

describe.skipIf(!HAS_BROWSER)('watching, in the Everyday shell — GAMEPLAY § 14.1', () => {
  it('opens the stage on somebody else’s record, and puts it all back', async () => {
    const page = await openEveryday();
    await openWeek(page);

    /* § 20.11's line is on the row a reader is deciding about, not only on the header. */
    expect(await page.textContent('.everyday-week-watch-source')).toContain('not a player');

    /* --- the press: the gate runs on this click, then the shell enters the context ---------- */
    await page.locator('.everyday-week-watch-open').first().click();
    await page.locator('.everyday-stage-watching').first().waitFor({ timeout: 60_000 });

    /* --- § 14.1's table, cell by cell ------------------------------------------------------- */

    /* The identity band: their initial, their name, and where the row came from. */
    expect((await page.textContent('.everyday-stage-watching-name'))?.trim().length).toBeGreaterThan(0);
    expect(await page.textContent('.everyday-stage-watching-source')).toContain('not a player');
    /* `THEIR DISPATCHER` has replaced `DRIVING` in the header — the single identity cell. */
    const header = (await page.locator('.everyday-stage-header').first().innerText()).toUpperCase();
    expect(header).toContain('THEIR DISPATCHER');
    expect(header).not.toContain('DRIVING');
    /* The canvas pill, and it may not claim a server verified anything. */
    const pill = (await page.textContent('.everyday-stage-watching-pill')) ?? '';
    expect(pill).toContain('REPLAY');
    expect(pill).toContain('VERIFIED BY RE-SIMULATION');
    expect(pill.toLowerCase()).not.toContain('server');
    /* The rail subline is § 14.1's `WATCHING · <NAME>` rather than the bare word. */
    const subline = (await page.textContent('.everyday-rail-subline')) ?? '';
    expect(subline).toContain('WATCHING');
    expect(subline.length).toBeGreaterThan('WATCHING'.length);
    /* § 3.3's row: `⤺ Stop watching`, no timeline, and § 14.1's conversion as the primary. */
    const bar = (await page.locator('.everyday-bar').first().innerText()) ?? '';
    expect(bar).toContain('Stop watching');
    expect(bar).toContain('Play this crowd');
    expect(await page.locator('.everyday-bar-timeline').count()).toBe(0);
    /* § 14.1: the intervention machinery is disabled while watching. */
    expect(await page.locator('.everyday-stage-intervene').first().isDisabled()).toBe(true);
    expect(await page.textContent('.everyday-stage-intervene-refusal')).toContain('spectator');
    /* And the transport is deliberately not — contract § 1.5, *pause and the speeds stay*. */
    expect(await page.locator('.everyday-stage-play').first().isDisabled()).toBe(false);

    /* --- § 14.1's defect condition, over the rendered screen -------------------------------- */
    for (const selector of SWEPT) {
      const found = await firstPersonIn(page, selector);
      expect(
        found,
        `“${selector}” says ${found.join(', ')} while watching somebody else’s run — § 14.1’s own defect condition`,
      ).toEqual([]);
    }

    /* --- ⤺ Stop watching, and the round trip ------------------------------------------------ */
    await page.locator('.everyday-bar-leave').first().click();
    await page.waitForTimeout(600);
    /* § 14.1: it returns to the board immediately, and the spectator state is cleared. */
    expect(await page.locator('.everyday-stage-watching').count()).toBe(0);
    expect(await page.locator('.everyday-board').count()).toBe(1);
    /* The rail is back to its own word for wherever the player now is. */
    expect(await page.textContent('.everyday-rail-subline')).not.toContain('WATCHING');

    await page.close();
  }, 300_000);

  /*
   * § 14.1 promises the player's own state survives, and this build has a sharper version of that
   * promise than the guide's: a watched run may not *file*. The check is the one a player can see —
   * the week's own strip, which is drawn from `WeekState.history` and would gain a card if a
   * spectator's replay had been closed into a day.
   *
   * It also drives the entry rule's guard from the other end: the mount's first act on a watch must
   * not be `startRun`, and a run started there would be the player's own day landing on the stage
   * under a stranger's chrome. What that would look like from here is the band coming up and the
   * building name under it changing a beat later.
   */
  it('files nothing, and does not start a day of its own on the way in', async () => {
    const page = await openEveryday();
    await openWeek(page);
    const before = await page.locator('.everyday-week-card-score').allTextContents();

    await page.locator('.everyday-week-watch-open').first().click();
    await page.locator('.everyday-stage-watching').first().waitFor({ timeout: 60_000 });
    /*
     * The header is the observable, because it is the one part of the screen drawn from the
     * **recording** rather than from the row: the clock, the demand stretch, the next stretch and
     * the three live figures are all `observationsAt(adopted, …)`. The band and the pill would go on
     * saying the record's name over a run that had been replaced, which is exactly the state this is
     * written to refuse — a stranger's identity over the player's own day.
     *
     * The page stands on a different tower from the row (see {@link openEveryday}), so a run started
     * here is a different building's whole day and the header cannot come back the same by accident.
     */
    const header = await page.locator('.everyday-stage-header').first().innerText();
    /* Long enough for a `startRun` to have been simulated on the worker and landed, if one was asked. */
    await page.waitForTimeout(4_000);
    expect(
      await page.locator('.everyday-stage-header').first().innerText(),
      'a run of the player’s own landed on the stage under the spectator chrome',
    ).toBe(header);

    await page.locator('.everyday-bar-leave').first().click();
    await page.waitForTimeout(400);
    await page.click('button:has-text("Your week")');
    await page.locator('.everyday-week-card-score').first().waitFor({ timeout: 30_000 });
    expect(
      await page.locator('.everyday-week-card-score').allTextContents(),
      'watching a run filed a day into the week',
    ).toEqual(before);

    await page.close();
  }, 300_000);

  /*
   * § 20.15's withdrawal, on the page. The shipped reference runs are day 1 of their own week and a
   * cold load stands on day 1, so the primary is **live** here — which is the half worth driving in
   * a browser, because a control withdrawn in every state would pass a node test that only checked
   * the refusal fires. The refusal's own arm is driven in `watchStage.test.ts`, where a record from
   * another day can be constructed without playing four days first.
   */
  it('offers the conversion when the record is the day standing here', async () => {
    const page = await openEveryday();
    await openWeek(page);
    await page.locator('.everyday-week-watch-open').first().click();
    await page.locator('.everyday-stage-watching').first().waitFor({ timeout: 60_000 });

    const primary = page.locator('.everyday-bar-primary').first();
    expect(await primary.textContent()).toContain('Play this crowd');
    expect(await primary.isDisabled(), 'the conversion was withdrawn on the day it belongs to').toBe(
      false,
    );

    /* And it converts: the spectator state goes and § 6's brief comes up on the same crowd. */
    await primary.click();
    await page.waitForTimeout(800);
    expect(await page.locator('.everyday-stage-watching').count()).toBe(0);
    expect(await page.locator('.everyday-brief').count()).toBe(1);

    await page.close();
  }, 300_000);

  /*
   * The hole the centralised exit was written for: `requestLeave` is not the only way off the stage,
   * because every rail row calls `go` directly. A row pressed while a record was on the stage used
   * to leave `ctx: 'watch'` standing over a screen that is not a stage, with the watched run still
   * on the state and the player's own day still snapshotted inside `dev/main.ts`.
   */
  it('ends the watch when a rail row walks away from the stage', async () => {
    const page = await openEveryday();
    await openWeek(page);
    await page.locator('.everyday-week-watch-open').first().click();
    await page.locator('.everyday-stage-watching').first().waitFor({ timeout: 60_000 });

    await page.click('button:has-text("Test bench")');
    await page.waitForTimeout(800);
    expect(await page.textContent('.everyday-rail-subline')).not.toContain('WATCHING');
    expect(await page.locator('.everyday-stage-watching').count()).toBe(0);

    /*
     * And the § 3.3 row is the bench's rather than a watching row left standing — the visible half
     * of `ctx` having been cleared, which is the thing that would otherwise survive the navigation.
     */
    expect(await page.locator('.everyday-bar').first().innerText()).not.toContain('Stop watching');

    await page.close();
  }, 300_000);
});
