/**
 * The 1280×800 fold — the geometry `docs/20`'s polish register measured, re-measured here.
 *
 * ## Why these are browser cases and not node ones
 *
 * All three defects in this file are statements about **where boxes land**, at the exact viewport
 * the audit drove (`docs/20` § Method: Playwright/Chromium at 1280×800): an acknowledgement
 * sentence below the fold, a section header squeezed to a 58 px one-word-per-line sliver, a
 * building name reading `Midto…` beside an intact pattern pill. No node test in this package can
 * see a box — `boundaries.test.ts` keeps jsdom out on purpose — and every one of these shipped
 * through 3 600 green node tests, which is § D220's own argument for the tier.
 *
 * § D220 § 4 holds: **no metric is asserted.** The echo's words, the header's words and the
 * pill's words are read only as *present* and *un-clipped*; whether the figure inside any of them
 * is right is the node tier's business (`dispatcherEditor.test.ts`, `patternReadout.test.ts`).
 *
 * ## The three findings, and what each case holds
 *
 * - **Defect 11** — the plain-lever echo landed at y 748–835 with the fold at 745, and `THE 13
 *   COST TERMS` rendered vertically because the lever block was inserted *inside* the header's
 *   own flex row. The echo now sits above the rows it acknowledges and the block sits above the
 *   header row rather than in it; the case moves a real lever and measures both.
 * - **Defect 13** — scrolled to the rules section, the editor's left column was a viewport-tall
 *   white void. The catalogue column is sticky against `.sheet`'s scroll now, so the case scrolls
 *   there and requires the pick list on screen.
 * - **Defect 17** (header half) — with the pattern pill showing, `.topbar-building h1` and the
 *   spec line shrank proportionally and the name truncated. The spec line gives way first now
 *   (`.topbar-spec`'s shrink factor is § 1.1 S5's priority, applied at every width). The case
 *   writes a rule whose condition is true for the whole run — *the time is before noon*, on a
 *   template whose clock starts at 08:30 — and measures the header in **both** regimes the pill
 *   produces: the short abstention pill, which keeps the header on one line and squeezes (the
 *   regime that truncated), and the long `rule 1 — …` pill, which wraps the right block onto its
 *   own row.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import { CHROMIUM, HAS_BROWSER, enterEngineerStage } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of this file's own, `strictPort: false` so it moves rather than fights the sibling
    // files — the tier's convention since noteContrast met boot on 5173 (see that file's note).
    server: { port: 5195, strictPort: false },
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

/** The audit's own viewport, verbatim — the width both defects were measured at. */
const VIEWPORT = { width: 1280, height: 800 };

/** A loaded page on the Engineer stage, boot's own run on it. */
async function stagePage(): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  // The page opens on Everyday Mode now; this is the player's way to the Engineer surface.
  await enterEngineerStage(page);
  await page.waitForTimeout(400);
  return page;
}

/**
 * Open the dispatcher editor the way a player does at this width.
 *
 * The Dispatcher tab is contextual (`CONTEXTUAL_TABS`) — hidden from the strip at rest — and at
 * 1280 the right rail is the overlay drawer (the 1339 px rule), so the route is the drawer toggle
 * and then its *Open dispatcher editor →* link. The navigation itself closes the drawer again
 * (`docs/19` defect 6), which is exactly the state the audit measured the editor in.
 */
async function openDispatcherEditor(page: Page): Promise<void> {
  await page.locator('#drawer-toggle').click();
  await page.locator('#rail-open-dispatcher').click();
  await page.waitForTimeout(300);
}

/** One element's box, in viewport pixels, plus whether its text overflows its own box. */
interface MeasuredBox {
  readonly found: boolean;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly clipped: boolean;
  readonly text: string;
}

async function measure(page: Page, selector: string): Promise<MeasuredBox> {
  return page.evaluate((sel): MeasuredBox => {
    const node = document.querySelector<HTMLElement>(sel);
    if (node === null) {
      return { found: false, top: 0, bottom: 0, left: 0, width: 0, height: 0, clipped: false, text: '' };
    }
    const box = node.getBoundingClientRect();
    return {
      found: true,
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      width: box.width,
      height: box.height,
      // The browser's own answer to *is any of this text cut off* — an ellipsis exists exactly
      // when the laid-out text is wider than the box that shows it.
      clipped: node.scrollWidth > node.clientWidth + 1,
      text: node.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
    };
  }, selector);
}

describe.skipIf(!HAS_BROWSER)('the dispatcher editor at 1280×800 — docs/20 defects 11 and 13', () => {
  it('acknowledges a moved lever above the fold, under a header that reads horizontally', async () => {
    const page = await stagePage();
    await openDispatcherEditor(page);

    /*
     * The header first, before anything is moved: one line, panel-wide — not the 58 px column of
     * words the audit photographed. One line of 10 px/1.2 mono is ~12 px tall; 20 allows sub-pixel
     * rounding and nothing more, and the width floor is far above anything one word could need.
     */
    const header = await measure(page, '#dispatcher-terms-used');
    expect(header.found, 'the terms header is not on the page').toBe(true);
    expect(header.text).toMatch(/cost terms/iu);
    expect(header.height, `the terms header wraps — ${String(header.height)}px tall`).toBeLessThan(20);
    expect(header.width, 'the terms header is a sliver again').toBeGreaterThan(150);

    // Move a real lever the player's way: the block's first slider, arrow-keyed one step.
    const lever = page.locator('#panel-dispatcher input[type="range"]').first();
    await lever.focus();
    await lever.press('ArrowRight');
    await page.waitForTimeout(200);

    const echo = await measure(page, '.dispatcher-plain-echo');
    const sheet = await measure(page, '#panel-dispatcher .sheet');
    expect(echo.found, 'the echo paragraph is not on the page').toBe(true);
    expect(echo.text, 'the lever moved and the echo says nothing').not.toBe('');
    /*
     * The defect, verbatim: the echo's box at y 748–835 with the sheet's fold at 745. Visible
     * means the whole sentence, inside the sheet's own scrollport, at the scroll position the
     * player is already at — the lever they just moved is at the top of the panel.
     */
    expect(echo.top, 'the echo starts above the sheet').toBeGreaterThanOrEqual(sheet.top - 1);
    expect(
      echo.bottom,
      `the echo ends at ${String(Math.round(echo.bottom))}px with the sheet's fold at ` +
        `${String(Math.round(sheet.bottom))}px — below the fold again`,
    ).toBeLessThanOrEqual(sheet.bottom + 1);
  });

  it('keeps the catalogue beside the rules section — no viewport-tall empty column', async () => {
    const page = await stagePage();
    await openDispatcherEditor(page);

    // Scroll the way a reader reaches the rules: the bottom of the editor panel.
    await page.locator('#rule-rows').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const rules = await measure(page, '#rule-rows');
    const list = await measure(page, '#dispatcher-list');
    const sheet = await measure(page, '#panel-dispatcher .sheet');
    expect(rules.found && list.found && sheet.found).toBe(true);
    // The rules really are on screen — the control for the assertion below.
    expect(rules.top).toBeLessThan(sheet.bottom);
    expect(rules.bottom).toBeGreaterThan(sheet.top);
    /*
     * And so is the pick list. Before the fix its box ended thousands of pixels above this scroll
     * position and the left half of the sheet was empty for the whole viewport; sticky against
     * `.sheet`'s scroll, it rides along instead.
     */
    expect(
      list.bottom,
      'the catalogue column has been left behind at the top of the sheet — the void is back',
    ).toBeGreaterThan(sheet.top);
    expect(list.top).toBeLessThan(sheet.bottom);
  });
});

describe.skipIf(!HAS_BROWSER)('the stage header at 1280×800 — docs/20 defect 17, the header half', () => {
  it('shows the pattern pill and the whole building name at once', async () => {
    const page = await stagePage();

    /*
     * Give the run the longest kind of pill the product composes: a written rule, named live by
     * the header (`live/patternReadout.ts#ruleProvenanceName`). *The time is before noon* is in
     * force for the whole run — the boot template's clock starts at 08:30 (`startOfDayMin` 510,
     * § D244) — so the pill carries `rule 1 — …` at every playhead rather than only when traffic
     * cooperates.
     */
    await openDispatcherEditor(page);
    await page.locator('#rule-add').scrollIntoViewIfNeeded();
    await page.locator('#rule-add').click();
    await page.waitForTimeout(200);
    // `exact` — `row 1 condition` is a prefix of `row 1 condition value`, and strict mode is right.
    await page.getByLabel('row 1 condition', { exact: true }).selectOption('time-before');
    await page.waitForTimeout(200);
    await page.getByLabel('row 1 condition value', { exact: true }).selectOption('43200');
    await page.waitForTimeout(200);

    await page.locator('#tab-run').click();
    await page.locator('#run').click();
    // The pill unhides when a run that built the detector lands — that is the wait, not a timer.
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('#pattern-label')?.hidden === false,
      undefined,
      { timeout: 60_000 },
    );
    /*
     * The **short-pill regime first, because it is the one that squeezed.** Measured before
     * shipping the fix: with the abstention pill (`no clear pattern`, ~122 px) the whole header
     * stays on one flex line and `.topbar-building` is squeezed — unfixed, the name's box was
     * 56 px and `clipped` — while a long rule pill (~228 px) pushes `.topbar-right` onto its own
     * row and nothing squeezes at all. So the early playhead, where the pill reads the abstention
     * until the selector's first switch is crossed, is the load-bearing measurement; <kbd>Home</kbd>
     * pins it (KX-10).
     */
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    const earlyName = await measure(page, '#building-name');
    const earlyPill = await measure(page, '#pattern-label');
    expect(earlyPill.text, 'the pill is up — the state under measurement').not.toBe('');
    expect(
      earlyName.clipped,
      `the building name is truncated beside the "${earlyPill.text}" pill — "${earlyName.text}" ` +
        `in a ${String(Math.round(earlyName.width))}px box`,
    ).toBe(false);

    // And the long-pill regime: the end of the run (KX-10 again), where the rule is in force.
    await page.keyboard.press('End');
    await page.waitForFunction(
      () => (document.querySelector('#pattern-label')?.textContent ?? '').includes('rule 1'),
      undefined,
      { timeout: 30_000 },
    );

    const pill = await measure(page, '#pattern-label');
    const name = await measure(page, '#building-name');
    expect(pill.text, 'the run carries the rule and the pill must name it').toMatch(/rule 1/u);
    expect(name.found).toBe(true);
    expect(name.text.length, 'the header shows no building name at all').toBeGreaterThan(3);
    /*
     * The defect, both halves. The name is whole — `Midto…` is precisely `clipped: true` — and
     * the pill it coexists with is whole too and actually on screen, not wrapped away or clipped
     * to nothing.
     */
    expect(name.clipped, `the building name is truncated again — "${name.text}"`).toBe(false);
    expect(pill.clipped, 'the pill may not truncate — a shortened claim would say less').toBe(false);
    expect(pill.left).toBeGreaterThanOrEqual(0);
    expect(pill.bottom).toBeLessThanOrEqual(VIEWPORT.height);
  });
});
