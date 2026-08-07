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

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type ConsoleMessage } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The provisioned headless shell.
 *
 * Named rather than downloaded: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set in this environment and a
 * test that fetched a browser would be a test that fails behind a firewall for a reason unrelated to
 * the product.
 */
const CHROMIUM =
  process.env['ELEVATOR_SIM_CHROMIUM'] ??
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

/**
 * Whether this machine has one — and what happens when it does not.
 *
 * **Skipped, not failed.** A missing browser is not a defect in this repository, and a CI job that
 * went red on a machine without one would train its owner to ignore the tier. `ELEVATOR_SIM_CHROMIUM`
 * points it somewhere else.
 *
 * A silently-skipping tier reports nothing, though, which § D220 § 4 warns about in the same breath
 * as flake. Two things stop that here: the skip prints the path it looked for, and
 * `dev/main.test.ts` — which always runs — asserts that this project is still registered in
 * `vitest.config.ts`. So the tier can be *absent* on a given machine and cannot be *deleted*
 * without a node-tier failure saying so.
 */
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

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  /*
   * `resolvedUrls`, not `httpServer.address()`.
   *
   * The inline `server: { port: 0 }` above does not win: `vite.config.ts` pins
   * `{ port: 5174, strictPort: true }`, so the server serves where the **config** says and the
   * socket this test was reading reported something else. Every case then loaded
   * `ERR_CONNECTION_REFUSED` and failed — on any machine that has a Chromium, and before any of
   * the changes in this wave. It stayed invisible because the whole tier skips without
   * `ELEVATOR_SIM_CHROMIUM`, so the one condition that runs these cases is the one nobody has.
   *
   * `resolvedUrls` is Vite's own answer to *where am I actually serving*, which is the question,
   * and it stays right if the pinned port moves again.
   */
  const local = server.resolvedUrls?.local[0];
  if (local === undefined) {
    throw new Error('the dev server did not report a local URL');
  }
  origin = local.replace(/\/$/, '');
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** Everything the page said or threw, so a failure names the cause rather than the symptom. */
interface Loaded {
  readonly errors: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly painted: boolean;
  readonly distinctColours: number;
  readonly status: string;
}

async function load(): Promise<Loaded> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error: Error) => errors.push(`${error.name}: ${error.message}`));
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
  await page.close();
  return {
    errors,
    consoleErrors,
    painted: measured.painted,
    distinctColours: measured.distinct,
    status,
  };
}

describe.skipIf(!HAS_BROWSER)('the viewer boots', () => {
  let loaded: Loaded;

  beforeAll(async () => {
    loaded = await load();
  }, 120_000);

  it('throws nothing on the load path', () => {
    // The obvious assertion, and **not** the one that catches the defect this tier exists for —
    // see the next test. Kept because a throw that escapes `main()`'s handler would surface here
    // and nowhere else.
    expect(loaded.errors, 'the page threw while loading').toEqual([]);
  });

  it('draws the stage', () => {
    /*
     * § D220 § 5 clause 1, and **the assertion that does the work** — watched failing by putting
     * `stageTheme`'s declaration back below `boot()`'s sequence:
     *
     *     × draws the stage
     *       AssertionError: the stage canvas is one flat colour (1)
     *
     * The measurement that surprised me: *throws nothing on the load path* **still passed**. The
     * `ReferenceError` never reaches the page, because `main()`'s own last-resort handler catches
     * it and writes a sentence into `#status`. So a browser tier built around uncaught errors would
     * have been green over the same dead product the node suite was green over — the error handling
     * is *good*, and it is precisely what hides the failure from an error-shaped check.
     *
     * That is the argument for reading the bitmap rather than the console: the only thing a caught
     * boot failure cannot fake is a drawn frame.
     */
    expect(loaded.painted, `the stage canvas is one flat colour (${String(loaded.distinctColours)})`).toBe(true);
    expect(loaded.distinctColours).toBeGreaterThan(8);
  });

  it('does not report that it failed to start', () => {
    // `main()`'s last-resort handler prepends this. It is the sentence a reader saw instead of the
    // product, so it is asserted by its own words rather than only through the throw above.
    expect(loaded.status).not.toContain('The viewer did not start');
  });

  it('logs no console error', () => {
    // Weaker than the throw and worth keeping separate: a failed `fetch` of `data/` is reported here
    // and not as a page error, and it is the other way this page dies without an exception.
    expect(loaded.consoleErrors).toEqual([]);
  });
});
