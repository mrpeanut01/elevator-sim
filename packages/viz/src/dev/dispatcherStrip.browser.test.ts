/**
 * The dispatcher editor's result strip, **driven** — GitHub issue #92, [§ D310](../../../../DECISIONS.md).
 *
 * ## Why this is a browser test and not a node one
 *
 * `dispatcherEditor.test.ts` owns everything the panel *decides*: which of six states the strip is
 * in, that the pairing quotes the two sheets rather than deriving anything from them, and — on the
 * legs — that pressing the run verb produces a different run and a different strip. Every one of
 * those is a pure function and none of them needs a document.
 *
 * What no node test in this repository can reach is whether the block is **on the page at all**. The
 * strip is built at mount and inserted after `.editor-actions` with `after()`; there is no jsdom
 * here (`boundaries.test.ts` exists to keep it that way), so a mis-parented node, a hidden ancestor
 * or a mount that threw before reaching the insertion would be invisible to 2 800 green tests. That
 * is the shape of defect § D220 was written for, and the shape the triage ledger's N-6 records:
 * *the honesty harness cannot see a presentation pointer drawn as a live control.*
 *
 * ## What is asserted, and what § D220 § 4 forbids
 *
 * **No metric.** The strip's rows are the two sheets' own figures, and this file never reads one:
 * what it asserts is the *state machine* — the block exists, it says nothing has been run before
 * anything has, it names the playhead while the day is running, and once two days have been filed it
 * draws rows and carries the 50-paired-runs refusal. Whether `AVERAGE WAIT` is 10.3 s is the node
 * tier's business and the honesty search's, not a screenshot's.
 *
 * ## What driving it found
 *
 * That the sequence is reachable at all in the shipped shell, which was not obvious from the code:
 * the first press lands in `firstSheet` rather than `paired`, because boot's own shift never files
 * (§ D232 — nothing counts until a mode is chosen), so a player's **second** run from this panel is
 * the first one that can be paired. The copy says so in that state rather than showing an empty box.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** `boot.browser.test.ts`'s constant and its reasoning, kept identical across the tier. */
const CHROMIUM =
  process.env['ELEVATOR_SIM_CHROMIUM'] ??
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const HAS_BROWSER = existsSync(CHROMIUM);
if (!HAS_BROWSER) {
  console.warn(
    `[viz-browser] skipped: no Chromium at ${CHROMIUM}. ` +
      'Set ELEVATOR_SIM_CHROMIUM to run the browser tier (DECISIONS.md § D220).',
  );
}

let server: ViteDevServer;
let browser: Browser;
let origin: string;
let page: Page;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — `keyboard.browser.test.ts`'s reasoning, four files on.
    server: { port: 5192, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  origin = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
  if (origin === '') throw new Error('the dev server did not report a URL');
  browser = await chromium.launch({ executablePath: CHROMIUM });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
}, 120_000);

afterAll(async () => {
  await page?.close();
  await browser?.close();
  await server?.close();
});

/** What the strip is saying, read off the DOM by the relation the mount builds rather than by id. */
interface StripReading {
  /** Present at all — the assertion no node test in this package can make. */
  readonly found: boolean;
  readonly text: string;
  readonly rows: readonly string[];
}

async function readStrip(): Promise<StripReading> {
  return page.evaluate(() => {
    /*
     * Located as *the element after `.editor-actions`*, which is exactly how `mountDispatcherEditor`
     * puts it there. An id would let the mount stop inserting it and this test go on passing against
     * a node `index.html` happened to carry.
     */
    const strip = document.querySelector('#dispatcher-save')?.parentElement?.nextElementSibling;
    return {
      found: strip !== null && strip !== undefined,
      text: strip?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      rows: [...(strip?.querySelectorAll('.plate-row') ?? [])].map(
        (row) => row.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      ),
    };
  });
}

/** Press whichever of the two run verbs the panel is currently offering. */
async function pressRun(): Promise<void> {
  await page
    .locator('#dispatcher-save')
    .locator('xpath=..')
    .locator('button', { hasText: /Run this dispatcher|Save it and run it/u })
    .first()
    .click();
  await page.waitForTimeout(1_200);
}

/**
 * Send the playhead to the end of the run, then open the sheet so the day is filed.
 *
 * Both halves are needed and neither is a shortcut: `dev/main.ts`'s tick closes a day only while the
 * Simulation tab is showing, and `openTab('report')` closes one only once the playhead has run out.
 * A test that skipped either would be filing a day by a route no player takes.
 */
async function playOutAndFile(): Promise<void> {
  await page.locator('#tab-run').first().click();
  await page.waitForTimeout(1_000);
  await page.evaluate(() => {
    const timeline = document.querySelector('#timeline');
    if (!(timeline instanceof HTMLElement)) return;
    const box = timeline.getBoundingClientRect();
    timeline.dispatchEvent(
      new MouseEvent('click', {
        clientX: box.right - 1,
        clientY: box.top + box.height / 2,
        bubbles: true,
      }),
    );
  });
  await page.waitForTimeout(1_200);
  await page.locator('#tab-report').first().click();
  await page.waitForTimeout(800);
  await page.locator('#tab-dispatcher').first().click();
  await page.waitForTimeout(500);
}

describe.skipIf(!HAS_BROWSER)('the dispatcher editor reports the run it started', () => {
  const pageErrors: string[] = [];

  beforeAll(async () => {
    page.on('pageerror', (error: Error) => pageErrors.push(`${error.name}: ${error.message}`));
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector('canvas')?.width !== undefined,
      undefined,
      { timeout: 30_000 },
    );
    await page.locator('.menu-overlay button', { hasText: 'Free play' }).first().click();
    await page.locator('.menu-overlay .menu-text input').first().waitFor({ timeout: 10_000 });
    await page.locator('.menu-overlay button', { hasText: 'Start' }).first().click();
    await page.waitForTimeout(1_500);
    // The rail's own way in, which is the route issue #92 says a player has to take twice.
    await page.locator('#rail-open-dispatcher').first().click();
    await page.waitForTimeout(800);
  }, 120_000);

  it('is on the page before anything has been run from it, and says so', async () => {
    const strip = await readStrip();
    expect(strip.found, 'the strip is not after .editor-actions — the mount did not insert it').toBe(
      true,
    );
    expect(strip.text).toContain('What your run moved');
    expect(strip.text).toContain('Nothing to put side by side yet');
    expect(strip.rows).toEqual([]);
  });

  it('names the playhead while the day it started is still running', async () => {
    await page.locator('#dispatcher-list .pick').nth(2).click();
    await page.waitForTimeout(300);
    await pressRun();
    await page.locator('#tab-dispatcher').first().click();
    await page.waitForTimeout(500);

    const strip = await readStrip();
    expect(strip.text).toContain('The day is still running');
    // The clock is the run's own, from `runProgressOf` — not a fixed string, and not a figure.
    expect(strip.text).toMatch(/\d\d:\d\d of a shift that runs to \d\d:\d\d/u);
    // And no rows: a whole-day pairing drawn at a part-day playhead is § D223's two answers.
    expect(strip.rows).toEqual([]);
  }, 60_000);

  it('has nothing to set beside the first sheet of the session, and says which nothing', async () => {
    await playOutAndFile();
    const strip = await readStrip();
    expect(strip.text).toContain('first sheet filed this session');
    expect(strip.rows).toEqual([]);
  }, 60_000);

  it('pairs the second run with the sheet the press replaced, and refuses to rank them', async () => {
    await page.locator('#dispatcher-list .pick').nth(4).click();
    await page.waitForTimeout(300);
    await pressRun();
    await playOutAndFile();

    const strip = await readStrip();
    expect(strip.text).toContain('Left is what the sheet on screen said when you pressed');
    /*
     * The identity row is the one that must be there whatever the run did — a reader cannot read six
     * moved figures honestly without knowing which dispatcher this is a run of. The figure rows are
     * left unasserted here on purpose: which of them move is a fact about a simulation, and § D220
     * § 4 keeps that out of this tier.
     */
    expect(strip.rows[0]).toContain('BUILDING & DISPATCHER');
    expect(strip.rows.length).toBeGreaterThan(1);
    expect(strip.text).toContain('Two runs are two runs');
    expect(strip.text).toContain('50 or more paired runs');
    expect(strip.text).toContain('interval that excludes zero');
  }, 90_000);

  it('threw nothing on the way through', () => {
    expect(pageErrors).toEqual([]);
  });
});
