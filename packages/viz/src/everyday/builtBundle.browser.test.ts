/**
 * **The tier drives the artifact players load, and this file is what says so** — GitHub issue #281,
 * [`DECISIONS.md`](../../../../DECISIONS.md) § D425.
 *
 * ## Why this file exists
 *
 * Until wave I, 32 of the tier's 33 files started `createServer` — Vite's **dev** server, serving
 * modules from source. The thing a player loads is `dist-web/`, produced by `npm run build:web` and
 * served as static files. They are different artifacts, and a real defect had already lived in the
 * gap: the Everyday shell did not reset scroll on navigation, **two cases were written to pin the
 * fix and both were deleted for asserting nothing**, and the tier stayed green either way.
 *
 * 29 files serve the built bundle now. This one is the file that keeps that true — it asserts what
 * the served artifact **is**, so that every other file's green result means what it appears to mean.
 * `browserTier.test.ts` asserts the same thing statically, from the tier's sources; this file
 * asserts it from the wire, which is the half a static check cannot do.
 *
 * That is [`RISKS.md`](../../../../RISKS.md) **R26** one level up from where R26 is usually
 * recorded: not a fixture standing in for a run, but a whole **build** standing in for the shipped
 * one.
 *
 * ## The scroll defect: what reproduced, and what did not
 *
 * The reported defect — measured on the **deployed** preview at `375×667`, scripted — was an offset
 * of **300** carried through a navigation, with the incoming heading **272 px above** the top of the
 * viewport. Issue #281's third acceptance criterion asks for a case that fails when either half of
 * `shell.ts#go`'s reset is removed.
 *
 * **It does not reproduce here, and wave I measured *why* rather than only *that*.** Both artifacts
 * were driven side by side, in one script, at `375×667`, with and without the region reset:
 *
 * | | `vite dev` | `dist-web` |
 * |---|---|---|
 * | document overflow on the menu | 0 | 0 |
 * | `.everyday-screen` overflow on the menu | 335 px | 335 px |
 * | `.everyday-screen` overflow on the **incoming** fixit screen | 8 772 px | 8 772 px |
 * | offset after tapping the fourth tile | 0 | 0 |
 * | the same, with `screenEl.scrollTop = 0` deleted | **0** | **0** |
 *
 * Every tile box, the rail, the bar and the inline stylesheet's SHA-256 are identical between the
 * two as well. **So the local dev server and the local bundle are not laid out differently at all**,
 * and the mechanism recorded for this defect — that `reconcile`'s clamp *"depends on the incoming
 * screen being shorter than the offset"* — is refuted on this Chromium: instrumented, `scrollTop`
 * reads **0 the moment the container is emptied**, before any layout is forced and regardless of
 * what is about to be inserted. `fixit` is 8 772 px of overflow and is clamped exactly like the
 * short screens are.
 *
 * What follows from that is worth stating plainly, because it is a correction rather than a
 * repetition: **whatever makes the defect appear on the deployed build and not here is not the
 * dev-server-versus-bundle difference.** It is unmeasured, and this file may not name a replacement
 * cause — that would be `CLAUDE.md`'s stated-mechanism defect with new wording. The deployed build
 * is unreachable from this container (`curl` → status `000`, GitHub issue **#123**), so the one
 * measurement that could settle it cannot be taken here.
 *
 * The case below is therefore a **regression guard on the shipped artifact for the effect a player
 * experiences**, and it is labelled as that. It is not a pin on the mechanism, and #281's third
 * criterion is still open.
 *
 * ## What the gap turned out actually to be
 *
 * Not layout. The measured difference between the two artifacts is the **asset surface**, and it is
 * large. `vite.config.ts` points `publicDir` at the repository's `data/`, so the dev server answers
 * for every file in it; on build, `copyPublicDir` is `false` and only `WEB_DATA_FILES` plus
 * `__buildings.json` are emitted. Measured on both servers:
 *
 * | request | `vite dev` | `dist-web` |
 * |---|---|---|
 * | `/elevator-specs.json` | 200 `application/json` | 200 `application/json` |
 * | `/buildings/midtown-office.json` | **200 `application/json`** | the SPA fallback, `text/html` |
 * | the buildings README — `data/buildings/README.md` on disk, requested at /buildings/README.md because `publicDir` is `data/` | **200 `text/markdown`** | the SPA fallback |
 *
 * A viewer that started fetching a seventh document would therefore work on every machine in this
 * repository and fail in production — and `dev/data.ts#fetchJson` would report it as *"did not parse
 * as JSON"* rather than as a missing file, because the fallback answers **200** with an HTML body.
 * The third case below pins that difference from the wire, and it is the assertion that fails first
 * if any part of this tier ever goes back to a dev server.
 *
 * ## One red this file produced, and it was this file's rather than the product's
 *
 * On 2026-09-01 `suite (linux)` failed here — *"the fixit screen drew no heading to measure:
 * expected null not to be null"* — on a commit whose whole diff was one unrelated file, while the
 * same file passed twice on this container. **The case was already unreliable when it was written**
 * (`97ac411`, 2026-08-26) and wave I did not make it so: it waited for `.everyday-fixit`, which
 * `go` draws immediately, and then measured. `fixitScreen.ts#render` puts
 * `.everyday-fixit-loading` in that container until `/fixit-cases.json` resolves, and in that state
 * there is **no `h1` at all**. The window is a network fetch, which a loaded runner widens.
 *
 * That state was reproduced here rather than inferred: an unsettled probe against the **dev**
 * server read heading `null` and incoming overflow `0`, which is the loading screen exactly. The
 * fix is to wait for the loaded screen, not to sleep — and the offset is now asserted at both
 * moments, because they are different claims.
 *
 * ## The cost, measured rather than assumed
 *
 * One build for the **whole tier**, in `vitest.config.ts`'s `globalSetup`, and one `preview` server
 * per file. A build per file was measured and rejected: 4.5 s × 32 is about 150 s onto a 269 s
 * tier. The gate below reads the global setup's own figure through `inject`, so the day a build
 * becomes minutes the thing that notices is a failing test rather than a reader.
 *
 * It also does not land in the always-on path at all: `viz-browser` is opted into by name and gated
 * on {@link HAS_BROWSER}, and the global setup skips the build when there is no browser — so
 * `npm test` on a machine without one never pays it.
 *
 * ## Both scrollers, and why neither alone is the answer
 *
 * Which element holds the offset depends on the viewport. At `375×667` the **document does not
 * scroll at all** and the overflow lives on `.everyday-screen`; on CI's Chromium the document
 * *does* overflow, which is why the tier once saw `window.scrollY === 76` there and `0` locally.
 * Every measurement here sums the two, which is what `shell.ts#go` resets and what the tier's own
 * helper has always summed.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  BUILT_ARTIFACT_CLAIMS,
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openPage,
  SKIP_REASON,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

/** The shortest viewport `docs/31-support-matrix.md` § 1 tier 2 supports. */
const SHORTEST_SUPPORTED = { width: 375, height: 667 } as const;

/**
 * How far the menu is scrolled before the tile is tapped.
 *
 * `300` is the figure the deployed preview was measured at, kept rather than rounded so the case
 * and the finding quote the same number. It is comfortably inside the menu's own overflow at this
 * viewport — measured at 335 px — and the case asserts that it actually took effect rather than
 * trusting it, because a scroll that silently did nothing would make this whole file vacuous.
 */
const SCROLLED_TO = 300;

/**
 * A document the **dev server** serves out of `publicDir` and the **bundle** does not emit.
 *
 * `data/buildings/` is deliberately not in the bundle: the viewer never fetches a building by name
 * — HTTP has no directory listing — so `vite.config.ts` assembles `/__buildings.json` instead and
 * leaves the directory out. That decision is what makes this path a usable probe: it is a real file
 * on disk under `publicDir`, so a dev server answers it with JSON, and the shipped artifact cannot.
 */
const DEV_ONLY_DOCUMENT = '/buildings/midtown-office.json';

/** A document the bundle **does** emit, so the probe above cannot pass by the server being broken. */
const SHIPPED_DOCUMENT = '/elevator-specs.json';

/* -------------------------------------------------------------------------- *
 * `charter S9`'s bundle budget, B2 — GitHub issue #238, `docs/31` § 3
 * -------------------------------------------------------------------------- */

/** Where `npm run build:web` puts the artifact players receive — `vite.config.ts` owns the name. */
const DIST_WEB = fileURLToPath(new URL('../../dist-web', import.meta.url));

/**
 * **B2, in kilobytes of gzip.**
 *
 * `docs/31` § 3 gives 1 200 and then says, in bold, not to adopt it: *"Set it to the measured value
 * plus 25 % on the first run and tighten it, rather than adopting this figure unmeasured."*
 * Measured on `3404649`, 2026-09-07: **930.0 kB**. Plus 25 % is 1 162.5, so the budget is **1 160**
 * — tighter than the unmeasured ceiling, which is the direction that document asked for.
 *
 * Tighten it when the bundle shrinks. Raising it is a visible edit a reviewer can refuse, which is
 * the mechanism `docs/31` asks for in place of a vendor metric whose definition can move underneath
 * the number.
 */
const BUNDLE_BUDGET_KB = 1_160;

/** One shipped file and what it costs on the wire. */
interface ShippedFile {
  readonly path: string;
  readonly rawBytes: number;
  readonly gzipBytes: number;
}

/**
 * Every file the build emits, gzipped, source maps excluded.
 *
 * `docs/31` defines B2 as *"total transferred bytes for the first load"* and then asks for
 * something the wire cannot quite give: *"B2 is exact and deterministic. Bytes do not vary with
 * runner load."* Collecting responses until interactive is truer to *first load* and is **not**
 * deterministic — which reference documents and which worker have been fetched by that instant is a
 * race, and a budget that moves under load is the flaky gate that section spends four paragraphs
 * warning about, and which `BLOCKED_FRAME_GAP_MS` became (issue #335).
 *
 * So this is a strict **superset** of any first load: it counts both workers and all nine reference
 * documents, some of which boot never fetches. A superset can only fail early, never late — it
 * cannot let a regression through — and it is exactly deterministic, which is what B2 was
 * specified for.
 */
function shippedFiles(dir: string = DIST_WEB): readonly ShippedFile[] {
  const out: ShippedFile[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...shippedFiles(full));
      continue;
    }
    /* Excluded by `docs/31`'s own words, and never served to a player. */
    if (entry.endsWith('.map')) continue;
    const raw = readFileSync(full);
    out.push({
      path: relative(DIST_WEB, full),
      rawBytes: raw.byteLength,
      /* Level 9: the CDN compresses, and a budget must not be beaten by a weaker setting. */
      gzipBytes: gzipSync(raw, { level: 9 }).byteLength,
    });
  }
  return out;
}

let browser: Browser;
let site: ShippedSite;
let serveMs = 0;

describe.skipIf(!HAS_BROWSER)('the built bundle, not the dev server (issue #281)', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: CHROMIUM });
    const startedAt = process.hrtime.bigint();
    site = await startShippedSite({ preview: { port: 5299, strictPort: false } });
    serveMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
  }, 300_000);

  afterAll(async () => {
    // The browser first, then the site. `httpServer.close()` waits for open connections, and a
    // live page holds a keep-alive socket — closing the site first hung this hook for the full
    // 120 s with every case passing. `startShippedSite` also force-closes, so this ordering is the
    // discipline rather than the only defence.
    await browser?.close();
    await site?.close();
  });

  /** The scroll offset a player is actually looking through — both scrollers, summed. */
  const offsetOf = async (page: Page): Promise<number> =>
    page.evaluate(
      () =>
        window.scrollY + (document.querySelector<HTMLElement>('.everyday-screen')?.scrollTop ?? 0),
    );

  it('serves the built bundle rather than source modules, or this tier proves nothing', async () => {
    const page = await openPage(browser, { viewport: SHORTEST_SUPPORTED });
    await page.goto(site.origin, { waitUntil: 'load' });
    await page.waitForSelector('.everyday-screen', { timeout: 30_000 });
    /* The menu has rendered when its tiles have — Scenario's, since § D525 retired fixit's. */
    await leaveTutorialIfOffered(page);
    await page.waitForSelector('[data-screen="scenario"]', { timeout: 30_000 });

    /*
     * The liveness guard neither this file nor the other 28 can do without. If `preview` fell back
     * to serving source — or if the build silently emitted nothing and the server answered an index
     * that loads modules — every assertion in the tier would be a claim about `vite dev` wearing a
     * different name, which is the exact defect #281 is about.
     *
     * A dev server serves the entry as `/src/…` module scripts and injects its own client; a built
     * bundle serves hashed assets and no client. Both halves are asserted, because either alone
     * could be true of the wrong artifact.
     */
    const html = await page.content();
    expect(html, 'the served page loads source modules — this is a dev server').not.toMatch(
      /src="\/(?:src|@vite)\//u,
    );
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src') ?? ''),
      ),
      'no hashed bundle asset was served, so this is not the built artifact',
    ).toEqual(expect.arrayContaining([expect.stringMatching(/assets\/.*-[A-Za-z0-9_-]{6,}\.js/u)]));
  });

  it('has the bundle’s asset surface and not the dev server’s publicDir', async () => {
    /*
     * **The difference between the two artifacts that actually bites, asserted from the wire.**
     *
     * The dev server serves the whole of `data/` out of `publicDir`; the bundle emits
     * `WEB_DATA_FILES` and `__buildings.json` and nothing else. So a document that exists on disk
     * under `data/` and is not on that list is served by one artifact and not the other, and that
     * is a class of defect a dev-server tier cannot see: it works on every machine here and 404s in
     * production.
     *
     * Both directions, because either alone is satisfiable by the wrong thing. A shipped document
     * must arrive as JSON — otherwise this case would pass against a server that answers nothing —
     * and the dev-only one must **not**, which is what says the tree being served is the built one.
     *
     * `fetchJson`'s own docstring is why the second half checks the content type rather than the
     * status: Vite's SPA fallback answers a missing document with `index.html` and a **200**, so a
     * status assertion would pass on the artifact this case exists to rule out.
     */
    const shipped = await fetch(`${site.origin}${SHIPPED_DOCUMENT}`);
    expect(
      shipped.headers.get('content-type') ?? '',
      `${SHIPPED_DOCUMENT} is one of vite.config.ts's WEB_DATA_FILES and the served tree does not ` +
        'have it as JSON. Either the build emitted nothing or this server is not serving dist-web.',
    ).toContain('application/json');

    const devOnly = await fetch(`${site.origin}${DEV_ONLY_DOCUMENT}`);
    expect(
      devOnly.headers.get('content-type') ?? '',
      `${DEV_ONLY_DOCUMENT} came back as JSON. That file is in the repository's data/ directory ` +
        'and NOT in the bundle — it is reachable only through `publicDir`, which is a dev-server ' +
        'facility — so this is a `vite dev` server wearing this tier\'s name. GitHub issue #281.',
    ).not.toContain('application/json');
  });

  it('keeps the incoming screen at the top when a tile is tapped from a scrolled menu', async () => {
    const page = await openPage(browser, { viewport: SHORTEST_SUPPORTED });
    await page.goto(site.origin, { waitUntil: 'load' });
    await page.waitForSelector('.everyday-screen', { timeout: 30_000 });
    /* The menu has rendered when its tiles have — Scenario's, since § D525 retired fixit's. */
    await leaveTutorialIfOffered(page);
    await page.waitForSelector('[data-screen="scenario"]', { timeout: 30_000 });

    /*
     * **The fourth tile, and it is the fourth for a measured reason that turned out not to be the
     * reason it was chosen for.** `fixit` was picked as the one screen tall enough that
     * `reconcile`'s incidental clamp would not save it. Measured, its incoming overflow **is** the
     * largest — 8 772 px against the menu's 335 — and the clamp saves it anyway, because on this
     * Chromium the clamp fires when the container is emptied rather than when the new content
     * proves shorter. The tile is kept because it is the one the deployed measurement used and the
     * two should quote the same navigation. Its key is read off `data-screen` rather than the
     * label, so a copy change cannot silently point this case at another screen.
     *
     * **The navigation gained a step with § D525 (GitHub issue #364), and the case kept the
     * destination rather than the route.** `fixit` is no longer a tile — it is an entry in the
     * Scenario hub — so reaching it is now two presses. The scroll is applied and asserted before
     * **each** of them, which tests `shell.ts#go`'s reset twice rather than once and still lands on
     * the same tall incoming screen the deployed measurement used.
     */
    await page.evaluate((to) => {
      const region = document.querySelector<HTMLElement>('.everyday-screen');
      if (region !== null) region.scrollTop = to;
      window.scrollTo(0, to);
    }, SCROLLED_TO);

    // Non-vacuity: if the menu did not actually scroll, the navigation below has nothing to reset
    // and a green result would mean nothing.
    expect(
      await offsetOf(page),
      'the menu did not scroll, so this case cannot observe a reset',
    ).toBeGreaterThan(0);

    await page.locator('[data-screen="scenario"]').first().click();
    await page.waitForSelector('.everyday-scenario', { timeout: 30_000 });
    expect(
      await offsetOf(page),
      'the hub opened at the offset the menu was left at — `shell.ts#go` did not reset both ' +
        'scrollers on the first of the two presses',
    ).toBe(0);

    /* Scroll again, so the second press is also made from a scrolled surface. */
    await page.evaluate((to) => {
      const region = document.querySelector<HTMLElement>('.everyday-screen');
      if (region !== null) region.scrollTop = to;
      window.scrollTo(0, to);
    }, SCROLLED_TO);

    await page.locator('.everyday-scenario-entry[data-entry="fix-a-building"]').click();
    await page.waitForSelector('.everyday-fixit', { timeout: 30_000 });

    expect(
      await offsetOf(page),
      'the new screen opened at the offset the menu was left at — `shell.ts#go` did not reset ' +
        'both scrollers. This is the effect GitHub issue #281 reported from the deployed build. ' +
        'Read the header before concluding this case pins the mechanism: it does not, because ' +
        'deleting either half of the reset leaves it green here.',
    ).toBe(0);

    /*
     * **Wait for the case file, and do not measure the loading state** — the fix for a red this
     * case produced on a GitHub Linux runner while passing twice on this container.
     *
     * `.everyday-fixit` exists the instant `go` draws, and `fixitScreen.ts#render` puts
     * `.everyday-fixit-loading` in it until `/fixit-cases.json` resolves. In that state there is no
     * `h1` at all, so `headingTop` is `null` and the assertion below reads *"the fixit screen drew
     * no heading to measure"* — which is true of a screen that is still loading and says nothing
     * about the product. The same state was reproduced here, on the **dev** server, by an
     * unsettled probe: heading `null`, incoming overflow `0`.
     *
     * **The case was unreliable when it was written**, not made so by wave I: the runner red was on
     * `97ac411`'s original file, and the window is a network fetch, which a loaded runner widens.
     * Waiting for the loaded screen is the fix rather than a timeout — a sleep would trade this red
     * for a slower one.
     *
     * The offset is asserted **twice on purpose**: above, at the instant of the navigation, which is
     * what `go` resets; and again below, after the screen has grown to its full 8 772 px of
     * overflow, which is what the player is left looking at. A future keeper that restored an
     * offset on the data-driven re-render would satisfy the first and fail the second.
     */
    await page.waitForFunction(
      () => document.querySelector('.everyday-fixit h1, .everyday-fixit h2') !== null,
      undefined,
      { timeout: 60_000 },
    );

    expect(
      await offsetOf(page),
      'the fixit screen scrolled away from the top when its case file arrived — the navigation ' +
        'reset held and something after it did not',
    ).toBe(0);

    /*
     * The player-facing half of the same fact. An offset of zero is the mechanism; a heading inside
     * the viewport is what the player gets, and it is asserted separately because a future layout
     * could satisfy one and not the other.
     */
    const headingTop = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('.everyday-fixit h1, .everyday-fixit h2');
      return heading === null ? null : heading.getBoundingClientRect().top;
    });
    expect(headingTop, 'the fixit screen drew no heading to measure').not.toBeNull();
    expect(
      headingTop as number,
      'the incoming screen’s heading is above the top of the viewport',
    ).toBeGreaterThanOrEqual(0);
  });

  it('names the claims that need this file, and costs what it says it costs', () => {
    /*
     * Two figures a reader would otherwise have to trust, asserted instead.
     *
     * The claim families are exported from the tier helper rather than written here, so the list a
     * reader meets in `browserTier.test-helper.ts` and the list this file is about cannot drift
     * apart — which is the `RISKS.md` R38 shape this repository keeps recording.
     */
    expect(BUILT_ARTIFACT_CLAIMS.length, 'the claim families went missing').toBeGreaterThanOrEqual(
      4,
    );
    expect(BUILT_ARTIFACT_CLAIMS.join(' | ')).toMatch(/layout/u);
    expect(BUILT_ARTIFACT_CLAIMS.join(' | ')).toMatch(/overflow/u);
    expect(BUILT_ARTIFACT_CLAIMS.join(' | ')).toMatch(/geometry/u);
    expect(BUILT_ARTIFACT_CLAIMS.join(' | ')).toMatch(/scroll state/u);

    /*
     * **The cost gate, and it is a gate rather than a note.** #281 asks for the cost to be measured
     * before this lands in the always-on path, and wave I moved what there is to measure: the build
     * happens **once for the whole tier**, in `vitest.config.ts`'s `globalSetup`, so the figure that
     * matters is that one and not this file's share of it. It arrives through `inject`, which is
     * how a global setup hands a measurement to a case.
     *
     * The ceiling is generous against 4 152 ms cold on a quiet machine and exists to catch the day
     * a build becomes minutes — at which point the shape has to change again, because a once-per-run
     * build is only affordable while it is seconds. A number in a comment would not notice.
     */
    const buildMs = inject('shippedBuildMs');
    expect(
      buildMs,
      'the viz-browser global setup did not report a build time, so either it did not run or it ' +
        'skipped the build — and this file is then serving whatever `dist-web/` happened to be on ' +
        'disk. See vitest.config.ts and browserTierSite.test-helper.ts#setup.',
    ).toBeGreaterThan(0);
    expect(
      buildMs,
      `building dist-web took ${String(buildMs)} ms for the whole tier. Measured at 4 152 ms cold ` +
        'on a quiet developer machine; the ceiling is generous against a slower CI runner.',
    ).toBeLessThan(120_000);

    /*
     * And the per-file half, which is the number that decides whether *every* file can afford this.
     * Serving is a socket, not a build — if this ever approaches the build figure, `preview()` has
     * started doing work it is not supposed to do and 29 files are each paying for it.
     */
    expect(
      serveMs,
      `starting the preview server took ${String(serveMs)} ms. It serves an already-built ` +
        'directory and should cost a socket; 29 files each pay this, so a build hiding in here ' +
        'would multiply.',
    ).toBeLessThan(30_000);
  });

  /* ------------------------------------------------------------------------ *
   * `charter S9`'s B2 — GitHub issue #238
   * ------------------------------------------------------------------------ */

  /**
   * **The bundle budget, and which of the three this is.**
   *
   * `docs/22` § 4 states `charter S9` — *cold load to interactive under 3 s on a mid-range laptop*
   * — with the instrument *"CI budget, failing the build"*, and records that the instrument does
   * not exist. `docs/31` § 3 specifies three budgets so that it can. These cases are **B2 and only
   * B2**, and saying which is not a hedge: that document is explicit that the other two cannot be
   * plain assertions here.
   *
   * - **B1** (time to interactive ≤ 3 000 ms) *"gates only on a rolling comparison, never on a
   *   single run … a single-run wall clock on a shared VM is a coin flip"*. It needs run history
   *   this repository does not keep.
   * - **B3** (main-thread block ≤ 800 ms) needs a CPU-throttle factor *"calibrated against a real
   *   mid-range laptop once, and that calibration recorded with its date and machine"*. There is no
   *   such machine here, and issue **#335** is the live record of what a wall-clock gate does
   *   without one — `BLOCKED_FRAME_GAP_MS` red at 404.9 ms on a runner against 41 ms and 39 ms on
   *   one host. It reproduced while this was being written, at **10 433 ms**, on a machine running
   *   two vitest projects at once. The gate was right about the machine and says nothing about the
   *   product, which is the whole of #335.
   *
   * So **`charter S9` stays partially instrumented**, and this file does not let the verdict read
   * otherwise: `docs/22` § 6 forbids meeting a criterion by weakening it.
   *
   * **Here rather than in a file of its own**, because this file's header already claims the job —
   * *"it asserts what the served artifact **is**"* — and a byte budget is exactly that. A new
   * `*.browser.test.ts` that opened no page was written first and `dev/browserTier.test.ts`
   * refused it in three different ways: every file in this tier launches Chromium, names a port,
   * and serves the shipped bundle. The guard was right and the file was in the wrong place.
   */
  it(`ships no more than ${String(BUNDLE_BUDGET_KB)} kB gzipped — charter S9 B2`, () => {
    const files = [...shippedFiles()].sort((a, b) => b.gzipBytes - a.gzipBytes);

    /*
     * The control, and not ceremony: this reads a directory, and a directory that was not built
     * reads as zero bytes and passes a budget gloriously. That is issue #281 one level down — a
     * tier that served an empty site and stayed green.
     */
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((file) => file.path === 'index.html')).toBe(true);
    expect(files.some((file) => file.path.endsWith('.js'))).toBe(true);

    const totalKb = files.reduce((sum, file) => sum + file.gzipBytes, 0) / 1000;

    /*
     * The table goes in the failure message rather than to `console.log`, because vitest 4
     * intercepts the latter — the trap that made `honesty/measure.corpus.test.ts` necessary. A
     * failure reading only *1 240 > 1 160* sends the next reader off to reproduce a measurement
     * this run already has in hand.
     */
    const table = files
      .map(
        (file) =>
          `  ${file.path.padEnd(40)}${(file.gzipBytes / 1000).toFixed(1).padStart(8)} kB gzip` +
          `${(file.rawBytes / 1000).toFixed(1).padStart(10)} kB raw`,
      )
      .join('\n');

    expect(
      totalKb,
      `the shipped bundle is ${totalKb.toFixed(1)} kB gzipped against a ` +
        `${String(BUNDLE_BUDGET_KB)} kB budget (charter S9 B2, docs/31 § 3). What is in it:\n` +
        `${table}\n` +
        'If this is a dependency that arrived by accident, that is what B2 is for. If it is work ' +
        'the product needs, raising the number is the visible edit docs/31 asks for — and docs/22 ' +
        '§ 6 refuses meeting the budget by cutting a figure the run produced.',
    ).toBeLessThanOrEqual(BUNDLE_BUDGET_KB);

    /*
     * **A ceiling with headroom, not a line the tree sits on.** A gate whose measurement equals its
     * budget is red on the next commit whatever that commit does, and then gets an exemption —
     * which `ci.yml`'s own words call *"where this class of problem goes to be forgotten"*. At
     * 930 kB against 1 160 there is room; this goes red while there is still some.
     */
    expect(
      totalKb,
      `the bundle is inside its budget and has grown into the last tenth of it (${totalKb.toFixed(
        1,
      )} of ${String(BUNDLE_BUDGET_KB)} kB). Look at the growth rather than at the number.`,
    ).toBeLessThanOrEqual(BUNDLE_BUDGET_KB * 0.9);
  });
});

/* The tier prints why it skipped, from a project that always runs — see `dev/browserTier.test.ts`. */
if (!HAS_BROWSER) console.log(SKIP_REASON);
