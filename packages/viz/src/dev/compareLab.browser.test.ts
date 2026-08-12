/**
 * **The Compare and Lab tabs, driven** — the two panels a node test cannot reach.
 *
 * `honesty/derive.test.ts` excludes `dev/batchPanel.ts#mountBatchPanel` and
 * `dev/campaignPanel.ts#mountCampaignPanel` from the honesty search with a stated reason: they
 * mount the page and author their status text inline, so they cannot be driven under Node —
 * `boundaries.test.ts` confines the DOM to `dev/` precisely so the rest of the package stays
 * testable without a jsdom. Their literals reach only a **static** sweep, which that file calls a
 * limitation rather than coverage.
 *
 * This file narrows the limitation for the four claims a play-through found false. Each one is a
 * fact about what a player sees on arrival, and every one of them was reported by somebody who had
 * followed the product's own instructions:
 *
 * 1. **Compare introduces itself.** The Day report ends by sending a reader to this tab; the tab
 *    was one toolbar row over an empty panel, with no title, no sentence and no verb.
 * 2. **Both tabs name dispatchers the way the rest of the product does.** They listed `eta`,
 *    `collective`, `zoned-uppeak` — ids that appear on no other screen.
 * 3. **The Lab does not open on a setting against itself.** Every shipped stage starts on
 *    `collective` and the panel selected `collective` as the player's setting too, so the only
 *    thing a first-time player could do was an unwinnable run reported as *"stage not cleared"*.
 * 4. **The pre-flight line is bound to the controls.** The standing *move the control and require
 *    the run to change* requirement, pointed at a display: a cost line that did not move when
 *    `replications` did would be a number that looks right and means nothing.
 *
 * 5. **The interval is drawn** — GitHub issue #119, and the reason this file's scope moved. *"This
 *    is a product whose central claim is a confidence interval that excludes zero, and it never
 *    draws one."* A drawn bar is a DOM node with a class and a position, so nothing under Node can
 *    see it: `batch/intervalPlot.ts` is unit-tested against `intervalContainsZero`, and whether the
 *    geometry it returns ever reaches the page is a claim only this tier can make.
 *
 * ## What it deliberately does not claim
 *
 * § D220 § 4 forbids a browser test asserting a metric, a mean or any number the honesty search
 * and the replay harness already own, and that rule is kept exactly. What has changed is the
 * sentence that used to sit beside it: the last two blocks **do** run a batch — the shipped
 * default, and a two-replication one at a load the building cannot cope with — because there is no
 * other way to put a report on the page, and a drawn interval cannot be asserted on a panel that
 * has computed nothing.
 *
 * **Not one assertion below reads a value.** No mean, no bound, no count, no verdict text: what is
 * checked is that a row with an interval has a bar, that the bar's class matches the row's own
 * refusal, that the zero line is inside the plot, and that the prose the disclosure now hides is
 * still on the page in full. Every one of those is a fact about the *rendering*, and every one of
 * them is false in a way no Node test can see.
 *
 * There is no screenshot, for § D220's reason: a pixel diff fails on a font hint and is repaired by
 * re-baselining, which is a control that trains its owner to override it.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import { CHROMIUM, HAS_BROWSER, enterEngineerStage, pressMenuRow, reopenEngineerMenu } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    /*
     * A port of this file's own, and `strictPort: false` so a busy one becomes the next free one.
     *
     * Not `port: 0`. `boot.browser.test.ts` asks for that and lands on Vite's default 5173 anyway,
     * so two browser files running in parallel — which is vitest's default — collide, and the
     * second one to start fails with *"Port 5173 is already in use"* for a reason that has nothing
     * to do with the product. Naming a port outside the range anything else in this repository
     * uses, and letting it slide when it is taken, is the half of that this file can fix without
     * reaching into a test it does not own.
     */
    server: { port: 5273, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
  if (origin === undefined) throw new Error('the dev server did not report a URL');
  browser = await chromium.launch({ executablePath: CHROMIUM });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(origin, { waitUntil: 'load' });
  // The page opens on Everyday Mode now; this is the player's way to the Engineer surface.
  await enterEngineerStage(page);
  /*
   * The campaign's own `data/campaign.json` is fetched after boot and the Lab panel mounts on that
   * promise, so waiting for the stage picker to have options is waiting for the mount rather than
   * for a fixed delay. `dev/main.ts` reports a failed load into the panel's alert slot, so a
   * timeout here is a real failure and not a race.
   */
  await page.waitForFunction(
    () => (document.querySelector('#campaign-stage') as HTMLSelectElement | null)?.options.length,
    undefined,
    { timeout: 60_000 },
  );
  /*
   * The main menu covers the page on load, and the tester's own first step was dismissing it —
   * Scenarios, then the row that opens the board. Walked here rather than hidden with a style,
   * because a test that reached past the overlay would be asserting about a page no player can be
   * looking at.
   *
   * By affordance id since issue #142. This pair was green, and green for a reason that was about to
   * stop being true: `.menu-row` happened to exclude the recommended row that broke three sibling
   * files, because a `commit` affordance draws as `.menu-start`, and `.menu-start` happened to have
   * the row this wants first on the campaign screen. Both are positions rather than names. The
   * second half of the comment above was also already stale — *Open the doors* has been *Pick a
   * scenario* since issue #97.
   */
  // The Engineer menu is dismissed at boot now, so this walk has to reopen it first.
  await reopenEngineerMenu(page);
  await pressMenuRow(page, 'main.campaign');
  await pressMenuRow(page, 'campaign.open');
  await page.waitForFunction(
    () => (document.querySelector('.menu-overlay') as HTMLElement | null)?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** Every option's visible text on a picker, in the page's own order. */
async function optionTexts(selector: string): Promise<readonly string[]> {
  return page.evaluate((query: string) => {
    const select = document.querySelector(query) as HTMLSelectElement | null;
    return [...(select?.options ?? [])].map((option) => option.text);
  }, selector);
}

async function textOf(selector: string): Promise<string> {
  return page.evaluate(
    (query: string) => (document.querySelector(query) as HTMLElement | null)?.textContent ?? '',
    selector,
  );
}

/**
 * Bring a tab to the front the way a player does.
 *
 * Needed before any *interaction*: a tabpanel that is not selected is `hidden`, so Playwright's
 * actionability checks refuse to fill or select inside it — correctly, since a real reader cannot
 * either. Reading `textContent` works either way, which is why the assertions above this line do
 * not need it.
 */
async function openTab(id: string): Promise<void> {
  await page.click(`#${id}`);
  await page.waitForFunction(
    (tab: string) => document.querySelector(`#${tab}`)?.getAttribute('aria-selected') === 'true',
    id,
    { timeout: 30_000 },
  );
}

describe.skipIf(!HAS_BROWSER)('Compare, before anything has run', () => {
  it('says what the tab is, and that a batch has to be started', async () => {
    const body = await textOf('#batch-output');
    expect(body, 'the Compare panel body is empty on arrival').not.toBe('');
    expect(body).toContain('what Compare is for');
    // The verb. Its absence is what made the panel read as broken rather than as waiting.
    expect(body).toContain('Press Run batch');
    // baseline and candidate, explained, and which way round the subtraction goes.
    expect(body).toContain('candidate minus baseline');
    // The demand field's placeholder is the word `profile` in a numeric-looking box.
    expect(body).toContain('the building’s own traffic profile');
    // Units, which the toolbar label does not carry.
    expect(body).toContain('simulated seconds');
  });

  it('states the size of the job, and Cancel is not live before there is one', async () => {
    const body = await textOf('#batch-output');
    // 2 dispatchers × the shipped 50 replications. Derived, so it cannot go stale.
    expect(body).toContain('2 dispatchers × 50 replications = 100 simulations');
    /*
     * The tester reported Cancel as *"present and looks live before anything is running"*. The
     * property is asserted because it is the one that matters, and it already held — see the
     * report: `setRunning(false)` disables it at mount.
     */
    expect(
      await page.evaluate(() => (document.querySelector('#batch-cancel') as HTMLButtonElement).disabled),
    ).toBe(true);
  });

  it('rewrites the size of the job when a control moves', async () => {
    /*
     * *Move the control and require the run to change*, one level down: this control changes a
     * display rather than a simulation, and a pre-flight line that did not follow its own form
     * would be a number that looks right and means nothing. Restored afterwards so the rest of the
     * file sees the shipped defaults.
     */
    await openTab('tab-compare');
    await page.fill('#batch-replications', '120');
    await page.dispatchEvent('#batch-replications', 'input');
    expect(await textOf('#batch-output')).toContain('2 dispatchers × 120 replications = 240 simulations');
    await page.fill('#batch-replications', '50');
    await page.dispatchEvent('#batch-replications', 'input');
    expect(await textOf('#batch-output')).toContain('= 100 simulations');
  });
});

describe.skipIf(!HAS_BROWSER)('the dispatcher pickers name what the rest of the product names', () => {
  it('offers `Name (slug)` on Compare’s two arms and on the Lab’s setting', async () => {
    for (const selector of ['#batch-baseline', '#batch-candidate', '#campaign-profile']) {
      const texts = await optionTexts(selector);
      expect(texts, selector).toContain('Minimum estimated wait (eta)');
      expect(texts, selector).toContain('Conventional collective (collective)');
      // `destination-panel` has no card in the dispatcher rail, so a slug was unresolvable there
      // even by elimination.
      expect(texts, selector).toContain('Destination dispatch, landing panel (destination-panel)');
      // No option is a bare slug any more.
      expect(texts.filter((text) => !text.includes(' (')), selector).toEqual([]);
    }
  });

  it('matches the form the building picker beside it already used', async () => {
    expect(await optionTexts('#batch-building')).toContain('Chancery House (chancery-house)');
  });
});

describe.skipIf(!HAS_BROWSER)('the Lab does not open on an unwinnable run', () => {
  it('selects a setting that differs from the stage’s own baseline', async () => {
    const [stage, profile] = await page.evaluate(() => [
      (document.querySelector('#campaign-stage') as HTMLSelectElement).value,
      (document.querySelector('#campaign-profile') as HTMLSelectElement).value,
    ]);
    expect(stage).toBe('stage-1-first-call');
    // Every shipped stage starts on `collective`; the opening setting must not be it.
    expect(profile).not.toBe('collective');
  });

  it('does it on every stage that has an alternative, and says so on the two that do not', async () => {
    /*
     * Every one of the ten stages starts on `collective`, so this is not a property of stage 1.
     *
     * **Two of them cannot move, and the walk is how that was found rather than assumed.**
     * `stage-8-the-headline-address` and `stage-10-the-bed-and-the-visitor` open dimension sets no
     * shipped dispatcher sits inside — stage 8's omits `constraints.noDirectionReversal`, which
     * `collective` declares and every alternative moves — so on those the weight editor is the
     * only way to play, and the status line has to say that rather than tell a player to change a
     * setting that cannot be changed. Asserted as a **disjunction** rather than as two hard-coded
     * stage ids: an eleventh stage, or a fourteenth profile, moves which stages are which, and a
     * list here would go stale silently.
     *
     * *Run enabled* is the other half, and the one a wrong default would break quietly: a profile
     * the stage did not open is refused at the control, so an opening setting chosen without
     * asking `admitProfile` would land a player on a disabled button and a refusal they did not
     * cause.
     */
    await openTab('tab-campaign');
    const stages = await page.evaluate(() =>
      [...(document.querySelector('#campaign-stage') as HTMLSelectElement).options].map((o) => o.value),
    );
    expect(stages.length).toBeGreaterThan(1);
    let stuck = 0;
    for (const stage of stages) {
      await page.selectOption('#campaign-stage', stage);
      const [profile, runDisabled] = await page.evaluate(() => [
        (document.querySelector('#campaign-profile') as HTMLSelectElement).value,
        (document.querySelector('#campaign-run') as HTMLButtonElement).disabled,
      ]);
      expect(runDisabled, stage).toBe(false);
      if (profile !== 'collective') continue;
      stuck += 1;
      // The fallback is not silent: the bar says the arms are the same and names the way out.
      const status = await textOf('#campaign-status');
      expect(status, stage).toContain('both settings are Conventional collective (collective)');
      expect(status, stage).toContain('edit the weights');
    }
    // …and it is a fallback, not the rule: most stages do have somewhere to go.
    expect(stuck).toBeLessThan(stages.length / 2);
    await page.selectOption('#campaign-stage', stages[0] ?? '');
  });

  it('says what it is about to run, at the top, before the button is pressed', async () => {
    await openTab('tab-campaign');
    await page.selectOption('#campaign-stage', 'stage-1-first-call');
    const status = await textOf('#campaign-status');
    expect(status).toContain('Conventional collective (collective)');
    expect(status).toContain('Press Run this stage');
  });

  it('warns up front — not in the left column — when the two arms would be the same', async () => {
    /*
     * The control run is still available; what changed is that choosing it says so *before* the
     * minute of computation rather than in a tautology several screens down the briefing.
     */
    await openTab('tab-campaign');
    await page.selectOption('#campaign-stage', 'stage-1-first-call');
    await page.selectOption('#campaign-profile', 'collective');
    const status = await textOf('#campaign-status');
    expect(status).toContain('both settings are Conventional collective (collective)');
    expect(status).toContain('control run');
    expect(status).toContain('cannot be reached');
  });
});

/* ========================================================================== *
 * The interval, drawn — GitHub issue #119
 * ========================================================================== */

/**
 * Run a batch and wait for **that** batch's report to land.
 *
 * The wait is on `#batch-status`, and it names the replication count on purpose. Waiting for the
 * word *"the answer"* in `#batch-output` was the first draft and it is wrong in the way that
 * matters: after the first batch the phrase is already on the page, so the predicate is satisfied
 * by the **previous** report and every assertion after it reads a stale DOM. Found by driving —
 * the suppressed-batch block passed its wait instantly and then asserted against a report from a
 * different configuration.
 *
 * The demand is a parameter because the two shapes this file needs are on either side of the
 * complete-case rule: blank runs the shipped band point and every pair stands behind a mean; `40`
 * is a load Chancery House does not cope with, and all three wait rows suppress. The counts differ
 * between the two calls, which is what makes the status line unambiguous.
 */
async function runBatchOf(replications: string, demand: string): Promise<void> {
  await openTab('tab-compare');
  /*
   * The building is named rather than left alone, and the reason is the test above this one: the
   * panel now inherits the building the player is on, so *"whatever Compare opens on"* is a
   * property of the scenario the harness started and not of this file. Which building the shipped
   * default runs is `batch/shippedDefault.test.ts`'s claim; this block's claim is about drawing,
   * and it needs a report with every kind of row on it.
   */
  await page.selectOption('#batch-building', 'chancery-house');
  /*
   * The seed and the horizon are named for the same reason the building is, and this one was found
   * by driving rather than reasoned about: the panel inherits **all three** from the shell, so a
   * batch run here was landing on the scenario's own seed and shift length and producing a
   * different set of rows from the one measured. Pinning them is not a workaround — it is what
   * makes the assertions below about the drawing rather than about whichever scenario the harness
   * happened to start.
   */
  await page.fill('#batch-seed', '20260729');
  await page.fill('#batch-duration', '900');
  await page.fill('#batch-replications', replications);
  await page.fill('#batch-demand', demand);
  await page.click('#batch-run');
  await page.waitForFunction(
    (needle: string) =>
      (document.querySelector('#batch-status') as HTMLElement | null)?.textContent?.includes(needle) === true,
    `${replications} replications per arm in`,
    { timeout: 120_000 },
  );
}

describe.skipIf(!HAS_BROWSER)('the interval reaches the page', () => {
  afterAll(async () => {
    if (!HAS_BROWSER) return;
    // The rest of this file reads the shipped defaults. Put them back.
    await page.fill('#batch-replications', '50');
    await page.fill('#batch-demand', '');
  });

  it('opens on the building the player is on, not on the first one in the file', async () => {
    /*
     * **Issue #119 item 4, and the defect was worse than the issue reported.** *"Playing Garden
     * Apartments, opening Compare offers Chancery House."* `mountBatchPanel` has returned a handle
     * with a `prefill` since it was written and `options.inherit` reads the viewer's live building
     * — and **nothing in the tree called either**. A behaviour wired at one end and called from
     * nowhere is `docs/05`'s standing requirement exactly, and it is why the rule is *name the
     * non-test caller* rather than *is it reachable*.
     *
     * The harness starts *Scenarios → Open the doors*, whose building is Garden Apartments, so
     * that is what a player on this page is looking at and what Compare has to offer. Asserted
     * against the shell's own state rather than against the string, so a re-authored opening
     * scenario moves both sides together instead of leaving this pinning a stale id.
     *
     * It runs **first** in this block, because the batches below name a building of their own.
     */
    await openTab('tab-compare');
    const [inherited, running] = await page.evaluate(() => [
      (document.querySelector('#batch-building') as HTMLSelectElement).value,
      (document.querySelector('#pick-building') as HTMLSelectElement).value,
    ]);
    expect(running, 'the shell is not running any building, so there is nothing to inherit').not.toBe('');
    // The shell's own picker names what the player is running; Compare must offer the same one.
    expect(inherited).toBe(running);
  }, 180_000);

  it('draws one bar per row that has an interval, and none for a row that has not', async () => {
    /*
     * **The shipped default, at its shipped replication count.** A cheaper two-replication batch
     * was the first draft and it does not reach the states this block is about: at n = 2 every
     * interval is wide enough to contain zero, so nothing draws a filled bar and the distinction
     * the plot exists to make is untested. Measured, not assumed — the run at 50 is about four
     * seconds and produces all three bar states at once.
     */
    await runBatchOf('50', '');
    const drawn = await page.evaluate(() => {
      const figures = [...document.querySelectorAll('#batch-output .figure')];
      return figures
        .filter((figure) => figure.querySelector('.iv') !== null)
        .map((figure) => ({
          bars: figure.querySelectorAll('.iv-bar').length,
          zeros: figure.querySelectorAll('.iv-zero').length,
          means: figure.querySelectorAll('.iv-mean').length,
        }));
    });
    // Eight metrics, every one of which has an interval on a batch that suppressed nothing.
    expect(drawn.length).toBe(8);
    for (const figure of drawn) {
      expect(figure).toEqual({ bars: 1, zeros: 1, means: 1 });
    }
  }, 180_000);

  it('positions every mark inside its own plot, zero line included', async () => {
    /*
     * The failure this catches is the one a unit test cannot: `intervalPlotFor` returns fractions
     * and something has to turn them into `left`/`width`. A percentage written without its `%`, or
     * a `NaN` from a degenerate interval, lands the bar off the panel and the page still renders.
     */
    const marks = await page.evaluate(() =>
      [...document.querySelectorAll('#batch-output .iv-track')].flatMap((track) =>
        [...track.children].map((child) => ({
          className: (child as HTMLElement).className,
          left: (child as HTMLElement).style.left,
          width: (child as HTMLElement).style.width,
        })),
      ),
    );
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.left, mark.className).toMatch(/^\d+(\.\d+)?%$/);
      const left = Number.parseFloat(mark.left);
      expect(left, mark.className).toBeGreaterThanOrEqual(0);
      expect(left, mark.className).toBeLessThanOrEqual(100);
      if (mark.width === '') continue;
      expect(mark.width, mark.className).toMatch(/^\d+(\.\d+)?%$/);
      expect(left + Number.parseFloat(mark.width), mark.className).toBeLessThanOrEqual(100.01);
    }
  }, 180_000);

  it('gives a bar that clears zero a different class from one that straddles it', async () => {
    /*
     * The whole point of drawing anything. Two rows in the same report, one filled and one hollow,
     * asserted as *different* rather than as two specific class names — the classes are `index.html`'s
     * to rename and the distinction is the product's.
     *
     * The energy axes clear zero at Chancery House and the wait rows do not, so both states are on
     * screen at once, which is also what makes the assertion non-vacuous.
     */
    const classes = await page.evaluate(() =>
      [...document.querySelectorAll('#batch-output .iv-bar')].map((bar) => (bar as HTMLElement).className),
    );
    const ranked = classes.filter((name) => name.includes('iv-bar-clear'));
    const axis = classes.filter((name) => name.includes('iv-bar-axis'));
    const straddle = classes.filter((name) => name.includes('iv-bar-straddle'));
    expect(ranked.length, 'no bar on this report is a resolved row, so the distinction is untested').toBeGreaterThan(0);
    expect(axis.length, 'no bar clears zero without ranking, so R11 on the picture is untested').toBeGreaterThan(0);
    expect(straddle.length, 'no bar on this report contains zero, so the distinction is untested').toBeGreaterThan(0);
    // Total, so a fourth state cannot arrive unclassified.
    expect(ranked.length + axis.length + straddle.length).toBe(classes.length);
  }, 180_000);

  it('says which it is in words as well as in shape — the colour is the second signal', async () => {
    const captions = await page.evaluate(() =>
      [...document.querySelectorAll('#batch-output .iv-caption')].map((node) => node.textContent ?? ''),
    );
    expect(captions.length).toBe(8);
    expect(captions.some((text) => text.includes('contains zero'))).toBe(true);
    expect(captions.some((text) => text.includes('excludes zero'))).toBe(true);
    // R11 on the picture: the energy rows draw a bar clear of zero and refuse to rank on it.
    expect(captions.some((text) => text.includes('an axis, so no arm is named ahead'))).toBe(true);
  }, 180_000);

  it('keeps every word of the prose, behind a disclosure rather than deleted', async () => {
    /*
     * *"The statistics are exemplary … Keep every word."* The prose moved into a `<details>`; a
     * `<details>` keeps its content in the DOM and in a text selection whether it is open or shut,
     * so this asserts the arithmetic sentence is still there — closed — rather than that it is
     * visible.
     */
    const [summaries, hidden] = await page.evaluate(() => {
      const details = [...document.querySelectorAll('#batch-output .figure-why')];
      return [
        details.map((node) => node.querySelector('summary')?.textContent ?? ''),
        details.map((node) => node.querySelector('.figure-note')?.textContent ?? ''),
      ] as const;
    });
    expect(summaries.length).toBeGreaterThan(0);
    // The summary names what it opens. A control labelled only `why` is the defect this panel
    // already shipped once, as a tab with no verb on it.
    for (const text of summaries) expect(text).toContain('the arithmetic behind');
    expect(hidden.some((text) => text.includes('Paired difference'))).toBe(true);
    expect(hidden.some((text) => text.includes('Student-t at'))).toBe(true);
    // R11's reason, unabridged and one click away.
    expect(hidden.some((text) => text.includes('Energy is an axis and never a score'))).toBe(true);
  }, 180_000);

  it('leads with the answer rather than with the provenance', async () => {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('#batch-output .figure-label')].map((node) => node.textContent?.trim() ?? ''),
    );
    expect(labels[0]).toBe('the answer');
    // And the provenance is still there, unabridged — this is a reordering, not a deletion.
    expect(labels).toContain('batch');
    expect(labels).toContain('common random numbers');
    expect(labels.indexOf('batch')).toBeGreaterThan(0);
  }, 180_000);
});

describe.skipIf(!HAS_BROWSER)('a suppressed batch says what it cost and offers the lever', () => {
  it('states the drop count up front and makes the remedy clickable', async () => {
    /*
     * Issue #119 items 3 and 5. At a load Chancery House does not cope with, all three wait rows
     * suppress — which is the shape the issue is about — and the two things that were missing are
     * a count near the top and a button instead of a paragraph.
     */
    await runBatchOf('2', '40');
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('#batch-output .figure-label')].map((node) => node.textContent?.trim() ?? ''),
    );
    expect(labels[0]).toBe('the answer');
    expect(labels[1]).toBe('pairs dropped');
    // Above the eight metric rows, which is the whole of "up front".
    expect(labels.indexOf('pairs dropped')).toBeLessThan(labels.indexOf('average wait'));

    const button = await textOf('.remedy-button');
    expect(button, 'the remedy is still only a paragraph').toContain('Drop the load 10 %');

    // …and it writes the field, which is what makes it a control rather than a caption.
    const before = await page.inputValue('#batch-demand');
    await page.click('.remedy-button');
    await page.waitForFunction(
      (previous: string) => (document.querySelector('#batch-demand') as HTMLInputElement).value !== previous,
      before,
      { timeout: 60_000 },
    );
    expect(Number(await page.inputValue('#batch-demand'))).toBeCloseTo(Number(before) * 0.9, 5);
    await page.fill('#batch-replications', '50');
    await page.fill('#batch-demand', '');
  }, 180_000);
});
