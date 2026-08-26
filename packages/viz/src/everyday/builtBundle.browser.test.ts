/**
 * **The tier's one case that drives the artifact players actually load** — GitHub issue #281.
 *
 * ## Why this file exists
 *
 * Every other file in this tier starts `createServer` — Vite's **dev** server, serving modules from
 * source. The thing a player loads is `dist-web/`, produced by `npm run build:web` and served as
 * static files. They are different artifacts, and a real defect has already lived in the gap.
 *
 * The Everyday shell did not reset scroll on navigation. At `375×667` — the shortest viewport
 * `docs/31-support-matrix.md` § 1 tier 2 drives — the menu's third and fourth tiles are below the
 * fold, so a player scrolls to reach one, taps it, and arrives on the new screen still scrolled.
 * Measured on the deployed preview: offset **300** carried through, with the incoming heading
 * **272 px above the top of the viewport**.
 *
 * **Two cases were written to pin the fix and both were deleted for asserting nothing.** Removing
 * either half of `shell.ts#go`'s reset leaves the whole browser tier green against `vite dev`, on
 * the `rush` tile and the `fixit` tile alike. The tier could not express the claim, because the
 * claim is not true of the artifact it drives.
 *
 * The cause is `dev/dom.ts#reconcile`: it drops every child before inserting, so `scrollHeight`
 * collapses while the container is empty and the browser clamps `scrollTop` to `0` on the way
 * through. **That clamp is real and it is not reliable** — it depends on the incoming screen being
 * shorter than the offset, which `fixit` is not — so it saves the dev server and does not save the
 * bundle.
 *
 * That is [`RISKS.md`](../../../../RISKS.md) **R26** one level up from where R26 has been recorded
 * before: not a fixture standing in for a run, but a whole **build** standing in for the shipped
 * one.
 *
 * ## What this file is not
 *
 * It is **not** a second copy of the tier. `vite dev` is the right thing to drive for almost
 * everything — it is fast, it maps to source, and a bundle-only tier would be slow enough that
 * nobody ran it. This file exists so that the four claim families in
 * {@link BUILT_ARTIFACT_CLAIMS} have **somewhere** to be asserted against the shipped artifact.
 *
 * ## What this file does NOT do, and it is the half a reader must not assume
 *
 * **It does not make the scroll defect bite.** GitHub issue #281's third criterion asks for a case
 * that fails when either half of `shell.ts#go`'s reset is removed. Mutation-tested here: deleting
 * the `.everyday-screen` reset and re-running this file leaves it **3 of 3 green**. So this file
 * closes #281's first two criteria and **not** that one, and #281 stays open on it.
 *
 * The reason is measured rather than guessed. At `375×667`, driving the locally-served bundle:
 *
 * | measurement | value |
 * |---|---|
 * | document overflow on the menu | **0** — the document does not scroll at all |
 * | `.everyday-screen` overflow on the menu | **335 px** |
 * | offset after tapping a tile, reset removed | **0** |
 *
 * `dev/dom.ts#reconcile`'s incidental clamp covers the removal here: the container empties, the
 * browser clamps `scrollTop`, and the offset is gone before the reset would have run. The clamp is
 * exactly what `shell.ts#go`'s own docstring says is *real and not reliable* — and locally it
 * happens to hold for all four destinations.
 *
 * **The defect was measured on the deployed build, not on a local one**, and that build is
 * unreachable from this container: the PR's own preview answers `curl` with status `000`, which is
 * the gap GitHub issue #123 is about. So the artifact this file serves is the right *kind* of
 * artifact and is still not the one the defect was found on — a narrower version of the very gap
 * #281 names, and it should be recorded rather than closed over.
 *
 * What the second case below therefore is: a **regression guard on the built bundle** for the
 * effect a player experiences, honestly labelled. It is not a pin on the mechanism.
 *
 * ## The cost, measured rather than assumed
 *
 * One build and one server, in `beforeAll`, for the whole file — a build per case is not viable.
 * Measured on a quiet machine: a cold `dist-web/` build is **4 152 ms**, and this whole file —
 * build, preview server, three cases, a browser — is **6.34 s**. That is cheap enough that the
 * per-file shape needs no defending.
 *
 * It also does not land in the always-on path at all: `viz-browser` is opted into by name and
 * gated on {@link HAS_BROWSER}, so `npm test` on a machine without a browser never pays it.
 *
 * ## Both scrollers, and why neither alone is the answer
 *
 * Which element holds the offset depends on the viewport. At `375×667` the **document does not
 * scroll at all** and the overflow lives on `.everyday-screen`; on CI's Chromium the document
 * *does* overflow, which is why the tier once saw `window.scrollY === 76` there and `0` locally.
 * Every measurement here sums the two, which is what `shell.ts#go` resets and what the tier's own
 * helper has always summed.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BUILT_ARTIFACT_CLAIMS,
  CHROMIUM,
  HAS_BROWSER,
  SKIP_REASON,
  openPage,
  startBuiltSite,
  type BuiltSite,
} from '../dev/browserTier.test-helper.js';

/** The shortest viewport `docs/31-support-matrix.md` § 1 tier 2 supports. */
const SHORTEST_SUPPORTED = { width: 375, height: 667 } as const;

/**
 * How far the menu is scrolled before the tile is tapped.
 *
 * `300` is the figure the deployed preview was measured at, kept rather than rounded so the case
 * and the finding quote the same number. It is comfortably inside the menu's own overflow at this
 * viewport — measured at 366 px — and the case asserts that it actually took effect rather than
 * trusting it, because a scroll that silently did nothing would make this whole file vacuous.
 */
const SCROLLED_TO = 300;

let browser: Browser;
let site: BuiltSite;
let buildAndServeMs = 0;

describe.skipIf(!HAS_BROWSER)('the built bundle, not the dev server (issue #281)', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: CHROMIUM });
    const startedAt = process.hrtime.bigint();
    site = await startBuiltSite({ preview: { port: 5299, strictPort: false } });
    buildAndServeMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
  }, 300_000);

  afterAll(async () => {
    await site?.close();
    await browser?.close();
  });

  /** The scroll offset a player is actually looking through — both scrollers, summed. */
  const offsetOf = async (page: Page): Promise<number> =>
    page.evaluate(
      () =>
        window.scrollY + (document.querySelector<HTMLElement>('.everyday-screen')?.scrollTop ?? 0),
    );

  it('serves the built bundle rather than source modules, or this file proves nothing', async () => {
    const page = await openPage(browser, { viewport: SHORTEST_SUPPORTED });
    await page.goto(site.origin, { waitUntil: 'load' });
    await page.waitForSelector('.everyday-screen', { timeout: 30_000 });
    await page.waitForSelector('[data-screen="fixit"]', { timeout: 30_000 });

    /*
     * The liveness guard this file cannot do without. If `preview` fell back to serving source —
     * or if the build silently emitted nothing and the server answered an index that loads
     * modules — every assertion below would be a claim about `vite dev` wearing this file's name,
     * which is the exact defect the file exists to close.
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

  it('keeps the incoming screen at the top when a tile is tapped from a scrolled menu', async () => {
    const page = await openPage(browser, { viewport: SHORTEST_SUPPORTED });
    await page.goto(site.origin, { waitUntil: 'load' });
    await page.waitForSelector('.everyday-screen', { timeout: 30_000 });
    await page.waitForSelector('[data-screen="fixit"]', { timeout: 30_000 });

    /*
     * **The fourth tile, and it has to be the fourth.** `fixit` is the one screen tall enough that
     * `reconcile`'s incidental clamp does not save it — the third tile was measured clamping on
     * some layouts, which is why the deleted cases passed. Its key is `fixit` from
     * `everyday/modes.ts`, read off the tile's own `data-screen` rather than its label, so a copy
     * change cannot silently point this case at a different screen.
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

    await page.locator('[data-screen="fixit"]').first().click();
    await page.waitForSelector('.everyday-fixit', { timeout: 30_000 });

    expect(
      await offsetOf(page),
      'the new screen opened at the offset the menu was left at — `shell.ts#go` did not reset ' +
        'both scrollers. This is the defect GitHub issue #281 exists for, and it reproduces on ' +
        'the built bundle while the dev server clamps it away.',
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
     * before this lands in the always-on path. One build plus one server is seconds; the ceiling
     * below is generous against the measurement on this host and exists to catch the day a build
     * becomes minutes — at which point this file stops being viable per-file and the answer has to
     * change. A number in a comment would not notice.
     */
    expect(
      buildAndServeMs,
      `building and serving dist-web took ${String(buildAndServeMs)} ms. Measured at 4 152 ms cold ` +
        'on a quiet developer machine; the ceiling is generous against a slower CI runner and ' +
        'exists to catch the day a build becomes minutes — at which point the per-file shape stops ' +
        'being viable and the tier needs one build shared across files, which startBuiltSite ' +
        'deliberately does not do. A number in a comment would not notice.',
    ).toBeLessThan(120_000);
  });
});

/* The tier prints why it skipped, from a project that always runs — see `dev/browserTier.test.ts`. */
if (!HAS_BROWSER) console.log(SKIP_REASON);
