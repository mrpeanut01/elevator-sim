/**
 * **The viewer boots** — the first test in this repository that executes the shell.
 *
 * `DECISIONS.md` § D220 is the criterion, dated before this file. The one-line version of why it
 * exists: `dev/main.ts` ends with `if (typeof document !== 'undefined') void main();`, and under
 * vitest there is no `document` — so **`main()` had never once run** in this project's history.
 * Every other test of the viewer imports the module for its pure exports and stops there.
 *
 * That gap stopped being theoretical on 2026-08-05. `boot()`'s own sequence assigned `stageTheme`,
 * whose `let` sat ~500 lines below it, so the page threw
 * `Cannot access 'stageTheme' before initialization` on boot's **second statement** and drew
 * nothing. **2 100 tests were green over a dead product.** Fourth occurrence of that mistake in this
 * package; none of the four was caught by a test.
 *
 * ## What this file is allowed to claim, and what it is not
 *
 * It claims **the page exists and drew**. It does not claim anything about a *figure*: § D220 § 4
 * forbids a browser test asserting a metric, a mean, or any number the honesty search and the
 * replay harness already own — a screenshot is not evidence about a simulator, and a browser tier
 * that grew into one would be slower, flakier, and less able to say why it failed.
 *
 * There is no screenshot here for the same reason. A pixel diff fails on a font hint and is repaired
 * by re-baselining, which is a control that trains its owner to override it.
 *
 * ## Why Vite rather than a built bundle
 *
 * `vite.config.ts` is the harness: it serves the repository's `data/` at the web root and answers
 * `/__buildings.json` with a manifest, because HTTP has no directory listing. A test that served
 * `dist/` would have to reproduce both, and a second answer to *where does `data/` come from* is
 * exactly the shape of thing this repository keeps finding in its own tree.
 */

import { chromium, type Browser, type ConsoleMessage } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The gate, from the one module that owns it — GitHub issue #142.
 *
 * It used to be declared here and copied into five sibling files, each carrying a docstring saying
 * it was *"kept identical"*. They were, and nothing checked. It now lives in
 * `browserTier.test-helper.ts`, whose header carries the whole argument: the browser is **named**
 * rather than downloaded (§ D220), a missing one **skips** rather than fails, and the skip is no
 * longer allowed to be silent — `browserTier.test.ts`, in the always-on `viz` project, derives which
 * registered project is wholly gated by asking which project's every file imports that module, and
 * turns an unexpectedly gated tier in CI into a red run.
 */
import {
  CHROMIUM,
  HAS_BROWSER,
  enterEngineerStage,
  openPage,
  reopenEngineerMenu,
  startShippedSite,
  type ShippedSite,
} from './browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  // The note below predates that and still holds, with one number changed: a **preview**
  // server's own default is 4173, not 5173, and it inherits `strictPort` from `server` just
  // as the note describes. Measured by resolving vite.config.ts and reading it back.
  /*
   * A port of this file's own, and `strictPort: false` so it moves rather than throws.
   *
   * **This is the file the other three notes about this trap cite by name, and it is the one
   * that was never fixed.** `compareLab`, `noteContrast` and `stageHeight` each took a numbered
   * port after being bitten, and each explains the trap by pointing here — so the tier converged
   * on the right pattern everywhere except at the site the pattern was learned from. It stayed
   * green in CI because CI's runner has nothing else on 5173; it goes red on any developer
   * machine where something does, which is how it was finally caught.
   *
   * **The mechanism, measured rather than reasoned — and all three sibling notes state it
   * wrongly.** They say the inline port loses to `vite.config.ts`'s pinned `5174`. It does not.
   * Resolving this exact config and reading it back reports `server.port = 0` and
   * `strictPort = true`: the **inline port wins** and what is inherited from the config file is
   * `strictPort`. Vite then maps `port: 0` to its own built-in default — **5173**, not the
   * config's 5174 — and `strictPort: true` turns a busy 5173 into a throw instead of a step to
   * the next free port. So the failure was never *"served somewhere else than we read"*; it is
   * *"refused to serve at all"*, and `Port 5173 is already in use` is the whole of it.
   *
   * That correction matters beyond tidiness: a reader who believes the config's port wins will
   * conclude that pinning a different port here changes nothing, and leave `port: 0` in place.
   * `port: 0` does not mean *an ephemeral port* to Vite, and no amount of inline config makes it
   * mean that while `strictPort` is inherited.
   *
   * 5189 sits immediately below the 5190-block the rest of the tier occupies, because this file
   * is the tier's first and belongs at the head of it. **Recorded here rather than in
   * `DECISIONS.md`, under § D405**: stating the measured mechanism here and leaving the three
   * sibling notes to be corrected where they sit is a choice about four files in one tier.
   */
  site = await startShippedSite({ preview: { port: 5189, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/**
 * Everything the page said, so a failure names the cause rather than the symptom.
 *
 * **What it no longer carries is what the page *threw*.** This file held the tier's first
 * page-error collector and one of only three; `openPage` and `browserTier.test-helper.ts`'s hooks
 * now watch every page of every file, on the same channel and the same window, and
 * `browserTier.test.ts` forbids a file declaring a second — GitHub issue #268. The console stays
 * here, because it is a different channel and only this file reads it.
 */
interface Loaded {
  readonly consoleErrors: readonly string[];
  readonly painted: boolean;
  readonly distinctColours: number;
  readonly status: string;
  /**
   * What the opening menu says about the shift behind it — GitHub issue #97.
   *
   * The overlay is up on load, so this is read off the same first paint every other member here is
   * read off. `Resume`'s label and its refusal are `menu/screens.ts`'s; what this tier adds is
   * whether the paint a **player** meets agrees with the run that is actually on the board, which
   * is a fact about `boot()`'s call order and reachable from nowhere else.
   */
  readonly resume: { readonly disabled: boolean; readonly detail: string };
  /**
   * The first line the Parameters tab draws — the UI readiness audit's **B4**, read off the page.
   *
   * That tab drew **114 live controls over 12 schemas** and bound none of them, and the fact was
   * declared in `docs/10-experience-layer-contract.md` — *in a document, not on the screen*, which
   * is precisely what CLAUDE.md's standing requirement is about. So the repair has to be checked
   * where the reader is, and this tier is the only one that can: `mountParameterForm` needs a
   * `document` and `parameterForm.test.ts` says so about itself in terms.
   *
   * Read by `textContent` off a `hidden` panel, which is honest about what it proves — the node is
   * on the page, put there by the shipped mount, at boot and with no tab pressed. It proves nothing
   * about styling, exactly as this file's header says of everything else here.
   */
  readonly parameterNote: string;
}

async function load(): Promise<Loaded> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  const consoleErrors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(origin, { waitUntil: 'load' });
  // The stage is drawn from a `requestAnimationFrame` loop, so the first frame is not on `load`.
  await page.waitForFunction(
    () => document.querySelector('canvas')?.width !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  // The page opens on Everyday Mode now; this is the player's way to the Engineer surface.
  await enterEngineerStage(page);
  await page.waitForTimeout(1_500);

  /*
   * *Drew* is read off the bitmap rather than off a flag the page could set while broken. Counting
   * distinct colours is the cheapest honest form of it: a blank canvas is one colour, and a stage
   * with a building, its shafts and its cars on it is many. No claim is made about *which* colours,
   * which would be the screenshot test § D220 § 4 refuses.
   */
  const measured = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const context = canvas?.getContext('2d');
    if (canvas === null || context === null || context === undefined) {
      return { painted: false, distinct: 0 };
    }
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
      if (seen.size > 64) break;
    }
    return { painted: seen.size > 1, distinct: seen.size };
  });

  const status = (await page.locator('#status').first().textContent()) ?? '';
  /*
   * Read off the overlay the load left up — and this comment used to describe a mechanism the code
   * below does not use, which GitHub issue #142 found while converting the rest of the tier onto
   * that very mechanism. It said the row was located *"by the attribute the panel writes …
   * `data-menu-control`"*. It never was: the two lines below match on `textContent`.
   *
   * The correction is not to switch the code, because the attribute **cannot** answer this
   * question. `menuPanel.ts` deliberately drops `data-menu-control` from a row it has refused — a
   * disabled button must not be in the Tab ring — and the whole point of this reading is the
   * refused state, `hasRun === false` on a cold load. Selecting by the attribute would find nothing
   * and the assertion below would be about an absent row.
   *
   * So the text match stays, with the reason stated, and it is the one place in this tier where the
   * words are the handle. `menu/screens.test.ts` holds every id the rest of the tier presses; this
   * row is not among them, and that is deliberate rather than an omission.
   */
  const resume = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.menu-overlay button')];
    const row = rows.find((node) => node.textContent?.startsWith('Resume') === true);
    return {
      disabled: row?.hasAttribute('disabled') ?? true,
      detail: row?.querySelector('.menu-row-detail')?.textContent ?? '',
    };
  });
  const parameterNote = await page.evaluate(
    () => document.querySelector('#param-form p')?.textContent ?? '',
  );
  await page.close();
  return {
    consoleErrors,
    painted: measured.painted,
    distinctColours: measured.distinct,
    status,
    resume,
    parameterNote,
  };
}

describe.skipIf(!HAS_BROWSER)('the viewer boots', () => {
  let loaded: Loaded;

  beforeAll(async () => {
    loaded = await load();
  }, 120_000);

  it('draws the stage', () => {
    /*
     * § D220 § 5 clause 1, and **the assertion that does the work** — watched failing by putting
     * `stageTheme`'s declaration back below `boot()`'s sequence:
     *
     *     × draws the stage
     *       AssertionError: the stage canvas is one flat colour (1)
     *
     * The measurement that surprised me: *throws nothing on the load path* — this file's own
     * page-error case, which stood here until GitHub issue #268 replaced it with a gate over the
     * whole tier — **still passed**. The `ReferenceError` never reaches the page, because `main()`'s
     * own last-resort handler catches it and writes a sentence into `#status`. So a browser tier
     * built around uncaught errors would have been green over the same dead product the node suite
     * was green over — the error handling is *good*, and it is precisely what hides the failure from
     * an error-shaped check.
     *
     * **That measurement is now the tier-wide gate's caveat**, and it is written out in full where
     * that gate lives (`browserTier.test-helper.ts`) rather than only here, because a caveat one
     * file away from the check it qualifies is a caveat nobody meets. The gate adds real signal and
     * is not a health check: a page that fails quietly by design passes it.
     *
     * That is the argument for reading the bitmap rather than the console: the only thing a caught
     * boot failure cannot fake is a drawn frame.
     */
    expect(loaded.painted, `the stage canvas is one flat colour (${String(loaded.distinctColours)})`).toBe(true);
    expect(loaded.distinctColours).toBeGreaterThan(8);
  });

  it('does not report that it failed to start', () => {
    // `main()`'s last-resort handler prepends this. It is the sentence a reader saw instead of the
    // product, so it is asserted by its own words rather than only through a throw — which, as the
    // case above records, that handler is precisely what stops from ever arriving.
    expect(loaded.status).not.toContain('The viewer did not start');
  });

  it('logs no console error', () => {
    // Weaker than the throw and worth keeping separate: a failed `fetch` of `data/` is reported here
    // and not as a page error, and it is the other way this page dies without an exception. The
    // tier's shared gate (GitHub issue #268) reads `pageerror` only, so this channel stays here.
    expect(loaded.consoleErrors).toEqual([]);
  });

  it('opens the menu over the shift it just ran, rather than over a stale paint — issue #97', () => {
    /*
     * **The first menu a player ever sees was painted before the first shift existed, and nothing
     * repainted it.**
     *
     * `boot()` calls `drawMenu()` some two hundred lines above its own `runShift()`, and
     * `runState().hasRun` is `state.recording !== undefined` — undefined until `runShift` assigns
     * it. Neither `renderAll` nor `runShift` calls `drawMenu`, and every other `drawMenu` in
     * `dev/main.ts` hangs off an intent arm, which boot presses none of. So *Resume* sat refused
     * under *"There is no shift on screen to go back to yet"* over a shift that had been simulated,
     * drawn and paused behind the overlay — the sentence issue #97's reporter quoted, produced by a
     * stale paint rather than by a stale fact.
     *
     * **Only this tier can see it.** The defect is entirely in `boot()`'s call order: the pure
     * layer is correct at every input (`screens.test.ts` drives both arms of `hasRun`), the panel
     * is correct given the host, and the host is correct when asked. What was wrong is *when* it
     * was asked, and nothing below a booted page has a `boot()` to observe.
     *
     * Watched failing by deleting the `drawMenu()` after `runShift()`:
     *
     *     × opens the menu over the shift it just ran, rather than over a stale paint
     *       AssertionError: Resume is refused over a shift that has already run: expected true to be false
     */
    expect(
      loaded.resume.disabled,
      'Resume is refused over a shift that has already run, so the opening menu is a stale paint',
    ).toBe(false);
    expect(
      loaded.resume.detail,
      'the refusal for a cold shell is on screen over a warm one',
    ).not.toContain('no shift on screen');
  });

  it('says on the Parameters tab itself that its controls do not reach the run — B4', () => {
    /*
     * **The screen, not the document.** `docs/10-experience-layer-contract.md` § 11 declared this
     * honestly — *"not yet routed into the Run button"* — and a player reading a tab full of live
     * sliders, over a status line reading *"41 dimensions, 41 live — authorable as a dispatcher
     * profile"*, has no way to reach that sentence. `mountParameterForm` now draws it as the first
     * child of the form, and this is the only tier that can watch it arrive.
     *
     * The form opens on `<dispatcher search space>`, which is one of the sources that is **not**
     * applied, so this is the note a cold load actually shows. `parameterForm.test.ts` holds the
     * other eleven sources and the applied one; what is added here is that the mount puts the node
     * on the page at all.
     *
     * Watched failing by deleting the two `applied` lines from `parameterForm.ts#draw`:
     *
     *     × says on the Parameters tab itself that its controls do not reach the run — B4
     *       AssertionError: expected '' to contain 'NOT APPLIED'
     */
    expect(
      loaded.parameterNote,
      'the Parameters tab draws no note about whether its controls reach a run',
    ).toContain('NOT APPLIED');
    expect(loaded.parameterNote).toContain('Run this shift');
    expect(loaded.parameterNote).toContain('PATIENCE_PARAMETERS');
  });
});
