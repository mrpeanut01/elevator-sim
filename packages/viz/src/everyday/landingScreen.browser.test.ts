/**
 * **The landing page through the shipped boot** — GitHub issue #244.
 *
 * Four claims, and the third is the one this file exists for.
 *
 * 1. **A visitor who has played nothing lands here**, not on the mode picker and not on the
 *    walkthrough. That is the whole of the issue's complaint — *"the game currently begins at the
 *    game"* — and it is a fact about `everyday/shell.ts`'s first-arrival offer rather than about
 *    this screen, so it is asserted from a cold context and never by calling anything.
 * 2. **One way in, and it goes where it says.** The page draws exactly one control that starts
 *    play, and pressing it reaches the two-screen walkthrough the ruling puts before Scenario.
 * 3. **The block is a run, and it moves.** The canvas paints something other than its own ground,
 *    and what it paints changes between two moments. That is the machine-decidable half of *shows
 *    the game in motion*; whether the result is compelling is a person's call and no case here
 *    claims to have made it.
 * 4. **The way past it is live.** The shell's leave row reaches the mode picker, so the one button
 *    is not a trap for somebody who already knows what they came for.
 *
 * The artifact is `dist-web/` and never a dev server — GitHub issue #281, § D425 — because the run
 * this page plays crosses a worker, and a worker is exactly the sort of thing a bundler can get
 * wrong in a way only the built output shows.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5241, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A cold page — a fresh context is a first visit, which is the state this screen is about. */
async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/**
 * A cheap fingerprint of what the canvas is currently showing, plus how many distinct values are
 * in it.
 *
 * The count is the control the difference alone does not give: two samples of a canvas that was
 * never painted are identical *and* uniform, and only the second of those tells the two apart from
 * a run that has legitimately stalled on one frame.
 */
async function canvasSample(page: Page): Promise<{ fingerprint: string; distinct: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.everyday-landing-canvas');
    if (canvas === null) return { fingerprint: 'no-canvas', distinct: 0 };
    const ctx = canvas.getContext('2d');
    if (ctx === null) return { fingerprint: 'no-context', distinct: 0 };
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0;
    const seen = new Set<number>();
    /* Every 401st pixel — coprime with 4 so the stride walks all four channels. */
    for (let at = 0; at < data.length; at += 401) {
      const value = data[at] ?? 0;
      hash = (hash * 31 + value) % 2_147_483_647;
      if (seen.size < 64) seen.add(value);
    }
    return { fingerprint: String(hash), distinct: seen.size };
  });
}

describe.skipIf(!HAS_BROWSER)('the landing page — GitHub issue #244', () => {
  it('is what a visitor who has played nothing arrives at', async () => {
    const page = await coldLoad();
    try {
      await page.waitForSelector('.everyday-landing', { timeout: 30_000 });
      /*
       * The mode picker is not drawn *underneath* it — the shell mounts one screen at a time, so a
       * tile in the page would mean the landing page had been mounted over the front door rather
       * than instead of it.
       */
      expect(await page.locator('.everyday-mode[data-screen]').count()).toBe(0);
      expect(await page.locator('.everyday-tutorial').count()).toBe(0);
      const headline = await page.locator('.everyday-landing-headline').textContent();
      expect(headline?.trim().length ?? 0).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('draws exactly one way in, and it opens what its label says', async () => {
    const page = await coldLoad();
    try {
      await page.waitForSelector('.everyday-landing', { timeout: 30_000 });
      /*
       * Counted over the page rather than over the model: the model's own test holds the shape, and
       * this holds the thing a visitor can actually press. A screen that grew a second button
       * would pass there and fail here.
       */
      expect(await page.locator('.everyday-landing-cta').count()).toBe(1);
      await page.locator('.everyday-landing-cta').click();
      await page.waitForSelector('.everyday-tutorial', { timeout: 30_000 });
    } finally {
      await page.close();
    }
  }, 120_000);

  it('plays a run on a canvas, and what it draws changes', async () => {
    const page = await coldLoad();
    try {
      await page.waitForSelector('.everyday-landing', { timeout: 30_000 });
      /*
       * The run crosses a worker, so the block opens in its pending arm and the canvas arrives
       * with the recording. Waited for by the canvas rather than by a sleep — the wait is the
       * assertion that the run landed at all.
       */
      await page.waitForSelector('.everyday-landing-canvas', { timeout: 60_000 });
      /* And a frame has actually been painted into it before anything is sampled. */
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector<HTMLCanvasElement>('.everyday-landing-canvas');
          return canvas !== null && canvas.width > 0 && canvas.height > 0;
        },
        undefined,
        { timeout: 30_000 },
      );

      const first = await canvasSample(page);
      /*
       * **The control, and it is not ceremony.** A canvas that was created and never drawn into is
       * uniformly transparent: two samples of it are identical, so a difference test alone would
       * report *nothing moved* for both a stalled run and a missing one. Requiring more than one
       * distinct value first separates them — this fails on the canvas being there and empty,
       * which is the state the whole block would silently degrade to.
       */
      expect(
        first.distinct,
        'the canvas holds one value everywhere, so nothing has been drawn into it. The block is ' +
          'present and empty, which is the failure the difference test below cannot tell from a ' +
          'run that has stopped.',
      ).toBeGreaterThan(1);

      /*
       * **Waited for rather than counted, and the first version of this case counted.**
       *
       * It sampled, let thirty animation frames pass, and sampled again — and it failed about one
       * run in three. The cause was measured rather than guessed: at this seed the first passenger
       * arrives 4.7 simulated seconds in, and a headless shell's animation frames are not
       * vsync-paced, so thirty of them can be thirty milliseconds of wall clock and a third of a
       * simulated second. Both samples landed in the empty lobby before anybody turned up, and the
       * canvas was correctly identical.
       *
       * Two things came out of that. The block now loops a window that starts after the lobby
       * fills, which is a better page as well as a steadier test; and this waits for the change
       * with a timeout instead of assuming a frame budget buys one. A frozen transport times out
       * here, which is the failure the case is for, and a slow machine does not.
       */
      const changed = await page
        .waitForFunction(
          (before: string) => {
            const canvas = document.querySelector<HTMLCanvasElement>('.everyday-landing-canvas');
            const ctx = canvas?.getContext('2d') ?? null;
            if (canvas === null || ctx === null) return false;
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let hash = 0;
            for (let at = 0; at < data.length; at += 401) {
              hash = (hash * 31 + (data[at] ?? 0)) % 2_147_483_647;
            }
            return String(hash) !== before;
          },
          first.fingerprint,
          { timeout: 20_000 },
        )
        .then(
          () => true,
          () => false,
        );

      expect(
        changed,
        'twenty seconds later the canvas is drawing exactly what it drew before. The block is a ' +
          'transport over a recording, so a still picture here means the playhead is not moving — ' +
          'which is the whole of what this page claims to be showing.',
      ).toBe(true);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('leaves a way past it to the mode picker', async () => {
    const page = await coldLoad();
    try {
      await page.waitForSelector('.everyday-landing', { timeout: 30_000 });
      await page.locator('.everyday-bar-leave').click();
      await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 30_000 });
      /* Three tiles, Scenario first — the front door this page sits in front of rather than replaces. */
      expect(await page.locator('.everyday-mode[data-screen]').count()).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  }, 120_000);
});
