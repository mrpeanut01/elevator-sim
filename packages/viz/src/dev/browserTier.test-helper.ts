/**
 * The browser tier's gate, in **one** place — GitHub issue #142.
 *
 * ## Why this file exists at all
 *
 * Six `*.browser.test.ts` files each carried their own copy of the two constants below, and each
 * copy's docstring said the same thing: *"`boot.browser.test.ts`'s constant and its reasoning, kept
 * identical so a machine that can run one tier can run both."* Six copies kept identical by a
 * sentence is the shape this repository keeps finding stale — the copies were in fact identical, and
 * that is luck rather than a mechanism, because nothing checked.
 *
 * The reason it matters more than tidiness is what `browserTier.test.ts` does with it. That guard —
 * which runs in the **always-on** `viz` project — derives *which registered vitest project is the
 * gated tier* by asking which project has files that import this module, and then requires that
 * **all** of them do. A seventh browser file that declared its own gate would be a file the guard
 * cannot see, running nowhere, exactly as these six did; so it is named instead. The gate being one
 * importable module is what makes that check total rather than a list of file names.
 *
 * ## Why the gate is an environment variable and not a download
 *
 * § D220's own reasoning, unchanged: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set in this environment,
 * and a test that fetched a browser would be a test that fails behind a firewall for a reason that
 * is not about the product. So the browser is **named**, never installed by the suite.
 *
 * ## Why a missing browser skips rather than fails — and what now stops that hiding
 *
 * A missing browser is not a defect in this repository, and a tier that went red on a laptop
 * without one would train its owner to ignore the tier. That half of § D220 stands.
 *
 * What did not stand is the other half, and § D220 asked for it **in terms**. Its § 5 clause 4 is an
 * acceptance criterion: *"The browser tier runs in CI and is allowed to be slow, but not to be
 * flaky."* It never ran in CI. `.github/workflows/` named neither this variable nor Playwright, the
 * only control anybody built was `dev/main.test.ts` asserting the project is still *registered* —
 * which catches deletion and not rot — and measured on `main` at `69bff59` the tier was red in three
 * files and eight cases, for long enough that nobody could date it. **A skip is indistinguishable
 * from a pass in the summary line**, so the tier was reporting absence-of-failure.
 *
 * The fix is not to make this fail on a laptop. It is `browserTier.test.ts`: the skip is published
 * from a project that always runs, and in CI — where a browser is provisioned by
 * `.github/workflows/ci.yml` — an unexpectedly gated tier is a **red run**, named.
 *
 * `*.test-helper.ts` rather than a plain module, deliberately: `deadCode.test-helper.ts`'s `isTest`
 * excludes both `*.test.ts` and `*.test-helper.ts`, so a module whose only importers are tests is
 * classified honestly instead of arriving as a twelfth dead seam.
 */

import { existsSync } from 'node:fs';

import type { Page } from 'playwright-core';

/**
 * The variable that points the tier at a browser.
 *
 * Exported as a **string** rather than only read, because `browserTier.test.ts` greps the tier's own
 * sources for it: a file that names the variable without going through this module has rolled its
 * own gate, and that is the thing the guard has to be able to see.
 */
export const CHROMIUM_ENV = 'ELEVATOR_SIM_CHROMIUM';

/**
 * Where the tier looks when nothing says otherwise.
 *
 * A path from the environment that originally provisioned this tier, kept because it costs nothing
 * and documents what *provisioned* meant there. It is not a default anybody should rely on: on every
 * machine this repository has been measured on since, it does not exist, and the tier skips.
 */
const PROVISIONED_FALLBACK =
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

/** The executable the tier will launch. */
export const CHROMIUM = process.env[CHROMIUM_ENV] ?? PROVISIONED_FALLBACK;

/** Whether this machine has one. Every suite in the tier hangs off this. */
export const HAS_BROWSER = existsSync(CHROMIUM);

/**
 * What a reader is told when it does not.
 *
 * One sentence, and it names the path it looked at rather than only the variable — the two failures
 * *unset* and *set to something that has been deleted* look identical without it, and the second one
 * is what a stale shell revision produces.
 */
export const SKIP_REASON =
  `[viz-browser] skipped: no Chromium at ${CHROMIUM}. ` +
  `Set ${CHROMIUM_ENV} to run the browser tier (DECISIONS.md § D220, GitHub issue #142).`;

if (!HAS_BROWSER) console.warn(SKIP_REASON);

/* ========================================================================== *
 * Reaching the menu — GitHub issue #142's first part
 * ========================================================================== */

/**
 * The attribute `dev/menuPanel.ts` writes the affordance's own id onto, and the only stable name a
 * driven test has for a menu row.
 *
 * ## Why the tier stopped using the row's words
 *
 * Every menu press in this tier was written as `.menu-overlay button` filtered by `hasText`, and
 * three files were red on `main` because of it. The instructive half is that **the copy the
 * selectors named had not been deleted**. `Pick a scenario` is still the campaign screen's first
 * row, verbatim. What changed is that issue #90 added a *recommended* row above it whose detail
 * reads *"it opens the scenarios board, and the week begins when you take one"* — and Playwright's
 * `hasText` is a **case-insensitive substring** over the element's whole `textContent`, so
 * `hasText: 'Scenarios'` began matching two buttons instead of one. `.first()` is DOM order, so
 * every one of those presses hit **Start here**, whose Casual arm dispatches `open-campaign`, which
 * *closes the menu*. The next line then waited thirty seconds for a row on an overlay that was no
 * longer up. Measured 2026-08-09 by driving the shipped page: `Scenarios button count: 2`, and the
 * overlay `hidden: true` after the first press.
 *
 * That is worse than the copy having moved, because it is invisible to a reader of either side: the
 * label the test names exists, the row the test wants exists, and the selector still resolves. So
 * the fix is not a better string — it is to stop selecting a control by prose that belongs to the
 * player. `MenuAffordance.id` is contracted *"stable, and unique within a screen"*, `menuPanel.ts`
 * already writes it to `data-menu-control` for its own focus ring, and `menu/screens.test.ts` holds
 * every id this tier presses against the screens that produce them — so an id that moves is a
 * millisecond node failure rather than a thirty-second browser timeout.
 *
 * ## The one thing this selector cannot see
 *
 * `menuPanel.ts` **removes** the attribute from a disabled row, deliberately: a disabled button is
 * not focusable, so it may not be in the Tab ring. A press of a row that is currently refused
 * therefore times out on *absent* rather than on *not enabled*. That is the honest reading — the
 * player cannot press it either — but it is worth knowing when reading a failure.
 */
export const MENU_CONTROL_ATTR = 'data-menu-control';

/**
 * Press a menu row by the id its own screen gave it.
 *
 * `.first()` is kept rather than dropped: the overlay draws one screen at a time and the id is
 * unique within a screen, so the only way this matches twice is a defect worth a separate issue —
 * and Playwright's strict mode would turn that into a failure at an unrelated call site.
 */
/**
 * Get to the Engineer surface the way a player does — through Everyday Mode's front door.
 *
 * ## Why every browser test now needs this
 *
 * `packages/viz/index.html` loads `everyday/boot.ts`, so a cold page is Everyday Mode's main menu
 * with the Engineer surface **covered and `inert` beneath it** and that shell's own menu already
 * dismissed. Every test in this tier drives the Engineer surface, and none of them could reach it:
 * fifteen cases went red the moment the front door changed, all of them by clicking something that
 * was there, was visible, and was not in the page.
 *
 * ## Why it is a player's path rather than a back door
 *
 * This is the press a player makes — the *Today's tower* tile — and nothing else. It does not tear
 * the shell down, reach into `mountEverydayShell`, or load a second HTML entry point. That matters
 * for what the tier is worth: a helper that dismantled the front door would let these tests keep
 * passing against a surface no player can open, which is this repository's signature defect with a
 * test suite standing behind it.
 *
 * The Engineer **menu** is reachable from here too, by the `#open-menu` control the stage carries —
 * `menu.browser.test.ts` and `menuExit.browser.test.ts` take that second step themselves, because
 * for them the reopening is part of what is under test.
 *
 * @param page a page that has finished `goto`.
 */
export async function enterEngineerStage(page: Page): Promise<void> {
  /*
   * Wait for the hand-off to be *possible* before pressing. `everyday/boot.ts` presses the Engineer
   * menu's Resume row when that menu finishes rendering, which happens well after `load` — pressing
   * the tile first would hand off to a stage with that menu still over it, and the case would fail
   * somewhere that has nothing to do with what it is testing.
   */
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.locator('.everyday-mode[data-screen="stage"]').click();
  // The shell's screen region is `display: none` on the stage — the honest latch for *uncovered*.
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.everyday-main')?.style.display === 'none',
    undefined,
    { timeout: 15_000 },
  );
}

/** Reopen the Engineer menu from the stage — the control that surface carries for it. */
export async function reopenEngineerMenu(page: Page): Promise<void> {
  await page.locator('#open-menu').first().click();
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === false,
    undefined,
    { timeout: 15_000 },
  );
}

export async function pressMenuRow(page: Page, id: string): Promise<void> {
  await page
    .locator(`.menu-overlay [${MENU_CONTROL_ATTR}="${id}"]`)
    .first()
    .click();
}
