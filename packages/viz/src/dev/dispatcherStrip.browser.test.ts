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
 *
 * ## And what it found the second time, which was not the product — GitHub issue #142
 *
 * Two of these five cases were red on `main` at `69bff59`, and **neither was a defect in the
 * panel**. `pressRun` picked its dispatcher by ordinal, `nth(2)` is `Conventional collective`, and
 * § D134 made that the dispatcher the viewer opens on — so the case selected the one already in
 * charge, the panel correctly answered *Already driving* with a disabled button, and the press hung
 * for thirty seconds on a verb the product was right not to offer. The third case then failed on
 * the strip still reading *Nothing to put side by side yet*, which is the same finding one line
 * downstream: no run had started, so no sheet had filed. Established by driving the shipped page
 * before either was touched — the run verb reads `Run this dispatcher`, enabled, the moment any
 * dispatcher that is not the driving one is picked.
 *
 * The selection is derived from the panel's own answer now. See {@link selectRunnableDispatcher}.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import { CHROMIUM, HAS_BROWSER, enterEngineerStage, openPage, pressMenuRow, reopenEngineerMenu } from './browserTier.test-helper.js';

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
  page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
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

/**
 * The two labels that mean *this press starts a run* — `dispatcherEditor.ts#RUN_THIS_COPY`.
 *
 * The panel has **three** run states, and the third is the one this file used to drive itself into:
 * `alreadyDriving`, whose button reads *Already driving* and is `disabled`, because the dispatcher
 * on screen is the one the shift is already running. That is a designed refusal, not a defect —
 * moving a weight makes it a new dispatcher and the verb comes back.
 */
const RUN_VERBS = /Run this dispatcher|Save it and run it/u;

/**
 * The run verb, located by structure and then **read** rather than matched.
 *
 * `#dispatcher-save` is in `index.html`; `runThis` is appended beside it by `mountDispatcherEditor`
 * and carries no id, so it is *the other `.primary` in the same row*. Written as
 * `locator('button', { hasText: RUN_VERBS })` — which is how it read until issue #142 — a panel
 * sitting in `alreadyDriving` resolved to **no element**, and Playwright waited the full thirty
 * seconds and reported *waiting for locator*. That sentence is true of a deleted button, a
 * mis-parented one and a renamed one as well, so it named nothing. Selecting structurally and
 * asserting the text separately splits those apart: the locator failing means the control is gone,
 * and the assertion failing quotes the label the panel is actually showing.
 */
function runVerb() {
  return page
    .locator('#dispatcher-save')
    .locator('xpath=..')
    .locator('button.primary:not(#dispatcher-save)')
    .first();
}

/**
 * Select a dispatcher from the list that this panel will actually run, starting at `from`.
 *
 * ## The stale index this replaces, which is worth stating rather than deleting
 *
 * Two cases below picked `#dispatcher-list .pick` by **ordinal** — `nth(2)` and `nth(4)` — and
 * `nth(2)` is `Conventional collective`, which § D134 made the viewer's opening dispatcher. So the
 * case picked the dispatcher already driving, the panel correctly refused with *Already driving*,
 * and the press waited thirty seconds for a verb the product was right not to offer. Nothing about
 * the panel was wrong; the test had pinned a position in a list whose *default* moved underneath it.
 * `nth(4)` still worked, which is why one case in this file failed and the next one passed.
 *
 * So the choice is now derived from the panel's own answer — walk until it offers a run — rather
 * than from an ordinal. It also makes the second run land on a different dispatcher from the first
 * without anybody counting: the first run's pick is driving by then, so the walk steps past it.
 */
async function selectRunnableDispatcher(from: number): Promise<string> {
  const picks = page.locator('#dispatcher-list .pick');
  const count = await picks.count();
  expect(count, 'the dispatcher list is empty — every case below would be vacuous').toBeGreaterThan(
    from,
  );
  for (let index = from; index < count; index += 1) {
    await picks.nth(index).click();
    await page.waitForTimeout(300);
    const label = (await runVerb().textContent())?.trim() ?? '';
    if (RUN_VERBS.test(label)) return label;
  }
  throw new Error(
    `no dispatcher from index ${String(from)} of ${String(count)} left this panel offering a run ` +
      'verb. Either every one of them is the dispatcher already driving — which cannot be true of ' +
      'more than one — or the verb has stopped being drawn.',
  );
}

/** Press the run verb, having first said out loud which one the panel is offering. */
async function pressRun(): Promise<void> {
  const label = (await runVerb().textContent())?.trim() ?? '';
  expect(
    label,
    'the panel is not offering a run: this is what its primary verb reads instead. A disabled ' +
      '“Already driving” here means the case picked the dispatcher that is already in charge — see ' +
      'selectRunnableDispatcher.',
  ).toMatch(RUN_VERBS);
  await runVerb().click();
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
    // The page opens on Everyday Mode now; this is the player's way to the Engineer surface.
    await enterEngineerStage(page);
    // The Engineer menu is dismissed at boot now, so this walk has to reopen it first.
    await reopenEngineerMenu(page);
    // By affordance id — `pressMenuRow`'s docstring, and GitHub issue #142.
    await pressMenuRow(page, 'main.free-play');
    await page.locator('.menu-overlay .menu-text input').first().waitFor({ timeout: 10_000 });
    await pressMenuRow(page, 'free-play.start');
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
    await selectRunnableDispatcher(0);
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
    // A *different* dispatcher from the case above, without counting: that one is now the one
    // driving, so the walk steps past it on its own.
    await selectRunnableDispatcher(0);
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
