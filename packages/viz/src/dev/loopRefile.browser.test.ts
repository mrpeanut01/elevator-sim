/**
 * **The loop chip re-arms the filing gate, so a day files itself again** — GitHub issue **#215**,
 * acceptance criterion 1, on the Engineer transport.
 *
 * ## Why this case exists when #215 is recorded as landed
 *
 * #215's report is a sheet reading *"attempt 4 at this day"* to a player who pressed *Run* once.
 * Two of its three criteria are closed and driven elsewhere: `everyday/stageScreen.browser.test.ts`
 * walks the navigation paths, and § D232 closed the cold-load path. **The counter still moves**, and
 * it moves through a control neither of those touches.
 *
 * The mechanism, traced end to end before a line of this was written:
 *
 * 1. `shift/week.ts#closeDay` increments `attempt` in exactly one place, and it is honest about
 *    what it counts — **closes**.
 * 2. `dev/main.ts#closeShift` gates the close on `filedRunId === recording.runId`.
 * 3. `dev/main.ts#adopt` clears that gate (`filedRunId = undefined`), because the ordinary reason to
 *    adopt is that a **new** run has arrived.
 * 4. The transport's loop chip calls `adopt(state.recording)` **with the run already on screen**,
 *    purely because `Playback` takes `loop` at construction and there is no other way to push the
 *    flag into a live transport. No run is executed, nothing is re-simulated, and the recording
 *    object is the identical one — and the gate opens anyway.
 * 5. `adopt` rebuilds the `Playback` from t = 0 with autoplay, so the same recording replays and
 *    `tick` files it a second time when the playhead runs out.
 *
 * A replay of one recording object is a weaker claim to an *attempt* than the bit-identical
 * re-simulation the stage-re-entry fix already rejected: there is not even a second run.
 *
 * ## The two halves, and why both are here
 *
 * A fix that simply stopped the counter would pass the first half and be wrong — `shift/week.ts`
 * carries a deliberate case asserting that a genuine re-close **does** count, and § D223 is explicit
 * that a player who re-runs a day has made a second attempt. So this case presses *Run this shift*
 * again at the end and requires the count to move. The first half is the defect; the second half is
 * the thing the fix must not break, driven on the product rather than argued.
 *
 * **The discriminator is not the run id.** `runId` is `building-profile-seed`, so re-running one
 * unchanged selection reproduces the *same* id — `shift/week.ts#closeDay`'s own docstring says so
 * and names issue #16 for it. A gate keyed on id equality would swallow the legitimate re-run and
 * make the negative control unreachable through the shell. What separates the two cases is that the
 * loop chip re-adopts a run **nothing simulated**, which the call site knows and `adopt` cannot.
 *
 * ## What it asserts, and what it deliberately does not
 *
 * § D220 § 4 forbids a browser case claiming anything about a metric. Nothing below reads a figure:
 * the three readings are *is there a run*, *is it filed*, and *what number is the week counting*,
 * all off the product's own façade.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import { CHROMIUM, HAS_BROWSER, enterEngineerStage, openPage } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own — `browserTier.test.ts` requires one per file and refuses a duplicate.
    // 5300 because 5215 — the number that said which issue this file is about — is `tabGate`'s.
    server: { port: 5300, strictPort: false },
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

/**
 * The Everyday data host, reached from inside the page.
 *
 * `everyday/stageScreen.browser.test.ts`'s idiom and deliberately a second copy rather than a shared
 * helper: the one place a helper could live is `browserTier.test-helper.ts`, which another lane owns
 * this wave. Named here so the next person moving it knows there are two.
 *
 * The façade is read rather than a rendered string, for the reason that case gives: the sheet that
 * prints the count is on another screen, and the claim is about the count itself.
 */
interface HostWindow {
  readonly __everydayHost?: {
    current():
      | {
          runState(): { readonly hasRun: boolean; readonly dayClosed: boolean };
          week(): { readonly attempt: number };
          closeDay(): void;
        }
      | undefined;
  };
}

/** A token this case parks on its document, so a page that was replaced under it says so. */
const ALIVE = '__loopRefileCaseAlive';

/** One reading of the façade, or `null` while the shell has published no host. */
interface HostFacts {
  readonly hasRun: boolean;
  readonly dayClosed: boolean;
  readonly attempt: number;
}

/**
 * Read the host, publishing the handle first if this document has not got one.
 *
 * The re-publish is not belt: `dev/main.ts` rewrites the address bar with `replaceState` on every
 * state change, and a handle parked on `window` by a single `evaluate` is one page-level surprise
 * away from being gone — which is a timeout with no facts in it, the least useful failure a browser
 * case can produce.
 */
async function hostFacts(page: Page): Promise<HostFacts | null> {
  try {
    await page.evaluate(
      "window.__everydayHost ? true : import('/src/everyday/host.ts').then((module) => { window.__everydayHost = module.EVERYDAY_HOST; return true; })",
    );
    return await page.evaluate(() => {
      const current = (window as unknown as HostWindow).__everydayHost?.current();
      if (current === undefined) return null;
      const run = current.runState();
      return { hasRun: run.hasRun, dayClosed: run.dayClosed, attempt: current.week().attempt };
    });
  } catch {
    /*
     * *Execution context was destroyed* — the dev server reloading the page under the poll. That is
     * a **missing** reading, not a false one, so it is reported as one and the caller polls again.
     */
    return null;
  }
}

/**
 * Poll {@link hostFacts} until `wanted` holds, and hand back the last reading either way.
 *
 * `page.waitForFunction` would report a bare `TimeoutError`. This case waits **for a defect** as
 * well as for a state, so both outcomes are ordinary results and the reading that was actually on
 * the page travels into the assertion message.
 */
async function untilHost(
  page: Page,
  wanted: (facts: HostFacts) => boolean,
  timeoutMs: number,
): Promise<{ readonly held: boolean; readonly last: HostFacts | null }> {
  const deadline = Date.now() + timeoutMs;
  let last: HostFacts | null = null;
  for (;;) {
    last = await hostFacts(page);
    if (last !== null && wanted(last)) return { held: true, last };
    if (Date.now() >= deadline) return { held: false, last };
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
}

/** File the day through the façade — one deterministic step, the call `tick` makes at a run's end. */
async function fileTheDay(page: Page): Promise<void> {
  await page.evaluate(
    "import('/src/everyday/host.ts').then((module) => { module.EVERYDAY_HOST.current()?.closeDay(); return true; })",
  );
}

/**
 * Press *Run this shift* and wait for the runner to go quiet.
 *
 * The label is the transition, read where it lives: `onRunning` writes `Cancel this run` while the
 * worker holds a run and `Run this shift` when it does not, so waiting on the second is waiting on
 * the runner rather than on a clock. The first wait is allowed to miss — a run that lands before the
 * poll sees the label is a run that landed, not a failure — and the second is the one that counts.
 */
async function pressRun(page: Page): Promise<void> {
  await page.locator('#run').click();
  await page
    .waitForFunction(() => document.querySelector('#run')?.textContent === 'Cancel this run', undefined, {
      timeout: 10_000,
    })
    .catch(() => undefined);
  await page.waitForFunction(
    () => document.querySelector('#run')?.textContent === 'Run this shift',
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(500);
}

/** A loaded page on the Engineer surface, with a run the player asked for filed as attempt 1. */
async function pageWithAFiledDay(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1400, height: 950 } });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  /*
   * The page opens on Everyday Mode; this is the player's own way across (§ D338). Boot's `Resume`
   * dismissed the Engineer menu without entering a mode, so `playerHasChosen` is still false here —
   * issue #117's split — and the press below is what latches it.
   */
  await enterEngineerStage(page);
  await pressRun(page);
  await fileTheDay(page);

  const filed = await untilHost(page, (facts) => facts.dayClosed, 60_000);
  expect(filed.last, 'the day never filed, so nothing below is about a filed day').toEqual({
    hasRun: true,
    dayClosed: true,
    attempt: 1,
  });
  await page.evaluate(`window.${ALIVE} = true`);
  return page;
}

describe.skipIf(!HAS_BROWSER)('the transport loop chip and the filing gate — GitHub issue #215', () => {
  it('does not re-arm the filing gate, and a genuine re-run still does', async () => {
    const page = await pageWithAFiledDay();

    /* --- the defect: one press of a chip that executes no run ---------------- */

    /* Filing a day opens the Day report tab, which hides the Run panel the transport lives in. */
    await page.locator('#tab-run').first().click();
    expect(await page.locator('#loop').getAttribute('aria-pressed')).toBe('false');
    await page.locator('#loop').click();
    /* The chip did what the player asked, whatever else it did — otherwise the case below could
       pass over a control that had simply stopped working. */
    expect(await page.locator('#loop').getAttribute('aria-pressed')).toBe('true');

    /*
     * The wait for the defect, and it is meant to run out. `dayClosed` going false is the gate
     * re-arming, which happens **synchronously inside the click handler** — so pre-fix this returns
     * on its first reading rather than at the deadline. `attempt` is polled beside it because the
     * two break one step apart: the re-armed gate is what lets a second close count, and asserting
     * both says which half is wrong when this goes red.
     */
    const reArmed = await untilHost(page, (facts) => !facts.dayClosed || facts.attempt >= 2, 12_000);
    expect(
      await page.evaluate(`window.${ALIVE} === true`),
      'the page reloaded under this case — the reading below is from a different sitting',
    ).toBe(true);
    expect(
      reArmed.last,
      'toggling the loop chip re-armed the filing gate over a run nothing executed',
    ).toEqual({ hasRun: true, dayClosed: true, attempt: 1 });
    expect(reArmed.held).toBe(false);

    /*
     * And the close that the re-armed gate would have let through. Pre-fix this books attempt 2
     * with nobody having run anything; post-fix `closeShift` returns on its first line. It is the
     * same press § 3.4 makes pressable again — the issue's *"attempt 4"* is this, four times.
     */
    await fileTheDay(page);
    await page.waitForTimeout(1_000);
    expect(
      await hostFacts(page),
      'a close behind the loop chip counted an attempt at a day nobody re-ran',
    ).toEqual({ hasRun: true, dayClosed: true, attempt: 1 });

    /* --- the negative control, on the product -------------------------------- */

    /*
     * A player who re-runs the day **has** made a second attempt (§ D223, and `week.test.ts` pins
     * it). The re-run reproduces the same `runId` — it is `building-profile-seed` — so this is the
     * case a gate keyed on identifiers would swallow, and it is here to make that impossible to
     * ship. The press must re-arm: a fix that latched the gate for good would read green above and
     * be a different defect.
     */
    await pressRun(page);
    const reRun = await untilHost(page, (facts) => !facts.dayClosed, 30_000);
    expect(reRun.last, 'pressing Run again did not re-arm the filing gate').toEqual({
      hasRun: true,
      dayClosed: false,
      attempt: 1,
    });

    await fileTheDay(page);
    const counted = await untilHost(page, (facts) => facts.attempt >= 2, 30_000);
    expect(counted.last, 'a genuine re-run and re-close did not count as a second attempt').toEqual({
      hasRun: true,
      dayClosed: true,
      attempt: 2,
    });

    await page.close();
  }, 300_000);
});
