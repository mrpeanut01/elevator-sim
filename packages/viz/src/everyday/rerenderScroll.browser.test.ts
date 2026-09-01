/**
 * **An in-screen toggle may not move the scroll offset** — GitHub issue #298,
 * [§ D388](../../../../DECISIONS.md).
 *
 * ## What the defect was, measured on the artifact players load
 *
 * Every `everyday/` screen redraws itself by emptying its own root and rebuilding it. Driven
 * against a `vite build` + `vite preview` of `dist-web/`, pressing one bench checkbox took the
 * screen region from `1 518` to `86` — **1 432 px gone** — and left the control the player had just
 * pressed **1 303 px** below the finger that pressed it. Whatever the rebuild put at the old offset
 * is what their next press lands on.
 *
 * ## Three things about this file that are not obvious, and each one decides whether it measures
 *
 * **1. It must press with a pointer.** A synthetic `element.click()` focuses nothing, and without a
 * focus teardown the container empties and refills inside one task with no layout forced in
 * between — so the browser has no collapsed `scrollHeight` to clamp against. Measured on the
 * bundle at six offsets across two screens, `element.click()` loses **0 px every time**, before the
 * fix as well as after. A case written that way would have been green on the defect. See
 * `shell.ts#keepScrollAcrossRerender` for the traced sequence.
 *
 * **2. It must drive the built bundle.** [`RISKS.md`](../../../../RISKS.md) R26 and GitHub issue
 * **#281** are the standing reason. This clause used to add that *"`vite dev` and `dist-web/` lay
 * out differently enough that a scroll claim about one is not a claim about the other"*, which was
 * #281's own stated mechanism and is **refuted on this host** (§ D426): driven side by side at
 * `375×667`, the two artifacts agree on every box, both scrollers and the inline stylesheet's
 * digest. What survives is the weaker and sufficient reason — a case that asserts a **layout** and
 * an **overflow**, two of `browserTier.test-helper.ts`'s four `BUILT_ARTIFACT_CLAIMS` families,
 * should be made about the artifact players receive rather than about one that agrees with it
 * today on one browser at one viewport. The reporter measured this defect on both and they agreed,
 * so the *finding* never depended on #281 either way.
 *
 * **3. The desktop viewport is not a control, and the issue thought it was.** #298 reports
 * `1280×800` as a **0 px** row and explains the defect's seven-wave survival by *"at 1280×800 both
 * screens fit"*. Measured on the bundle, they do not: the bench screen overflows `.everyday-screen`
 * by **623 px** at that viewport and the fix-it screen by **1 071 px**, and a checkbox pressed at
 * offset 400 lost the whole **400 px**. The row is `0` because the measurement started at the top,
 * not because the defect is absent. So the second case below drives the desktop viewport as a
 * *second instance of the defect* rather than as a negative control — a control that cannot fail is
 * the thing this repository keeps finding in its own suite.
 *
 * ## The cost, and why the file is shaped per-file
 *
 * One preview server in `beforeAll`, over the `dist-web/` that `vitest.config.ts`'s `globalSetup`
 * built **once for the whole tier** — § D425 moved the build there, so this file no longer pays for
 * one and neither do the other 28. The tier is opted into by name and gated on {@link HAS_BROWSER},
 * and the global setup skips the build when there is no browser, so `npm test` on a machine without
 * one never pays it.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  SKIP_REASON,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

/** The shortest viewport `docs/31-support-matrix.md` § 1 tier 2 supports. */
const SHORTEST_SUPPORTED = { width: 375, height: 667 } as const;

/** The viewport the issue reported as a 0 px row, and which is not one. */
const DESKTOP = { width: 1280, height: 800 } as const;

/**
 * How far a control may travel under a stationary finger and still count as *not moved*.
 *
 * Not zero, and the reason is the bench screen rather than a tolerance for slop: ticking a checkbox
 * removes the *No tests ticked* refusal above the list, so **129 px** of real content leaves the
 * page and everything below it legitimately rises. That is the screen answering, and it is what the
 * player asked for. What the player did not ask for is the **1 303 px** the defect added on top of
 * it. The gap between the two is three orders of the same magnitude, so the bound separates them
 * without being tuned to either.
 */
const STATIONARY_PX = 200;

let browser: Browser;
let site: ShippedSite;

describe.skipIf(!HAS_BROWSER)('an in-screen toggle keeps the scroll offset (issue #298)', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: CHROMIUM });
    site = await startShippedSite({ preview: { port: 5298, strictPort: false } });
  }, 300_000);

  afterAll(async () => {
    // The browser first, then the site. `httpServer.close()` waits for open connections, and a
    // live page holds a keep-alive socket — closing the site first hung this hook for the full
    // 120 s with every case passing. `startShippedSite` also force-closes, so this ordering is the
    // discipline rather than the only defence.
    await browser?.close();
    await site?.close();
  });

  /** The offset a player is actually looking through — both scrollers, summed, as `shell.ts#go`. */
  const offsetOf = async (page: Page): Promise<number> =>
    page.evaluate(
      () =>
        window.scrollY + (document.querySelector<HTMLElement>('.everyday-screen')?.scrollTop ?? 0),
    );

  /** Where the region can scroll to at all — the non-vacuity figure every case below asserts. */
  const overflowOf = async (page: Page): Promise<number> =>
    page.evaluate(() => {
      const region = document.querySelector<HTMLElement>('.everyday-screen');
      return region === null ? 0 : region.scrollHeight - region.clientHeight;
    });

  async function openBench(viewport: { width: number; height: number }): Promise<Page> {
    const page = await openPage(browser, { viewport });
    await page.goto(site.origin, { waitUntil: 'load' });
    await page.waitForSelector('.everyday-screen', { timeout: 30_000 });
    /*
     * The rail rather than a tile: the bench has no mode tile, and the rail's rows are outside the
     * screen region — which matters, because a press *inside* the region is what arms the keeper.
     * Reaching the screen the player's own way is the difference between testing the product and
     * testing a surface nobody can open.
     */
    await page.locator('.everyday-rail button', { hasText: 'Test bench' }).first().click();
    await page.waitForSelector('.everyday-bench-test input', { timeout: 30_000 });
    return page;
  }

  /**
   * Scroll the region, press the first checkbox with a **pointer**, and require both halves.
   *
   * The offset is the mechanism and the control's travel is what the player experiences; a future
   * layout could satisfy one and not the other, so neither stands in for the other. The control is
   * required to be **on screen before the press**, because Playwright scrolls a control into view
   * before clicking it and a target above the fold would have this case measuring that scroll
   * instead of the defect.
   */
  async function pressCheckboxAt(page: Page, offset: number): Promise<void> {
    expect(
      await overflowOf(page),
      'the bench screen does not overflow its region at this viewport, so there is no offset to ' +
        'lose and this case can observe nothing',
    ).toBeGreaterThan(offset);

    await page.evaluate((to) => {
      const region = document.querySelector<HTMLElement>('.everyday-screen');
      if (region !== null) region.scrollTop = to;
    }, offset);

    const box = page.locator('.everyday-bench-test input').first();
    const before = await offsetOf(page);
    expect(before, 'the region did not take the scroll, so there is nothing to preserve').toBe(
      offset,
    );
    const yBefore = await box.evaluate((node) => node.getBoundingClientRect().top);
    const fold = page.viewportSize()?.height ?? 0;
    expect(
      yBefore,
      'the checkbox is above the top of the viewport before the press, so Playwright would scroll ' +
        'it into view and this case would measure its own scroll rather than the re-render',
    ).toBeGreaterThanOrEqual(0);
    expect(
      yBefore,
      'the checkbox is below the fold before the press — same problem, other end. Both bounds are ' +
        'asserted because a layout change would move the control one way or the other, and either ' +
        'would turn this case into a measurement of Playwright’s scroll-into-view.',
    ).toBeLessThan(fold);

    await box.click();

    expect(
      await offsetOf(page),
      'the screen re-rendered and the scroll offset moved. `shell.ts#keepScrollAcrossRerender` is ' +
        'what holds it; this is GitHub issue #298, which cost 1 432 px on this screen at 375×667.',
    ).toBe(before);

    const yAfter = await page
      .locator('.everyday-bench-test input')
      .first()
      .evaluate((node) => node.getBoundingClientRect().top);
    expect(
      Math.abs(yAfter - yBefore),
      `the control the player pressed moved ${String(Math.round(yAfter - yBefore))} px under a ` +
        'stationary finger. Whatever the re-render put at the old offset is what their next press ' +
        'lands on.',
    ).toBeLessThan(STATIONARY_PX);
  }

  it('keeps the offset when a bench checkbox is pressed at 375×667', async () => {
    const page = await openBench(SHORTEST_SUPPORTED);
    await pressCheckboxAt(page, 1518);
    await page.close();
  }, 120_000);

  it('keeps it at 1280×800 too, where the screen also overflows', async () => {
    const page = await openBench(DESKTOP);
    await pressCheckboxAt(page, 400);
    await page.close();
  }, 120_000);

  it('still lands the incoming screen at the top when a tile is tapped', async () => {
    /*
     * **The keeper's own blast radius, and the tile has to be `rush`.**
     *
     * A menu tile is *inside* the screen region, so the press that navigates arms the keeper, and
     * without `shell.ts#go`'s disarm the keeper's microtask would restore the offset the navigation
     * had just cleared — GitHub issue #281's defect, reintroduced by #298's fix, one line apart from
     * happening.
     *
     * `builtBundle.browser.test.ts` asserts the same reset through the **`fixit`** tile, and it was
     * chosen there because it is the screen tall enough that `dev/dom.ts#reconcile`'s incidental
     * clamp does not save it. It does not catch this: mutation-tested by deleting the disarm and
     * driving all four tiles, `fixit` lands at **0** anyway, because its mount is asynchronous and
     * the screen is a single *loading* line at the instant the keeper restores — so the restore
     * clamps to zero for a reason that has nothing to do with the disarm. Under the same mutation
     * `rush` lands at **300** and `towers` at **300**, and `door` at **183**. `rush` mounts
     * synchronously and tall (3 100 px of overflow at this viewport), and it is the tile
     * `shell.ts#go`'s own docstring uses to describe the defect, so it is the one asserted here.
     */
    const page = await openPage(browser, { viewport: SHORTEST_SUPPORTED });
    await page.goto(site.origin, { waitUntil: 'load' });
    await page.waitForSelector('[data-screen="rush"]', { timeout: 30_000 });

    await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>('.everyday-screen');
      if (region !== null) region.scrollTop = 300;
      window.scrollTo(0, 300);
    });
    expect(
      await offsetOf(page),
      'the menu did not scroll, so this case cannot observe a reset',
    ).toBeGreaterThan(0);

    await page.locator('[data-screen="rush"]').first().click();
    await page.waitForSelector('.everyday-rush', { timeout: 30_000 });

    expect(
      await offsetOf(page),
      'the new screen opened at the offset the menu was left at — issue #281’s defect, back ' +
        'through the scroll keeper. `shell.ts#go` clears the keeper’s arming with the offset it ' +
        'resets, and that is the line this case holds.',
    ).toBe(0);
    await page.close();
  }, 120_000);
});

/* The tier prints why it skipped, from a project that always runs — see `dev/browserTier.test.ts`. */
if (!HAS_BROWSER) console.log(SKIP_REASON);
