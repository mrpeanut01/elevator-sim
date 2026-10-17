/**
 * **A stage's press plays one of its crowds under both settings** — GitHub issue #626 item 4,
 * [§ D1496](../../../../DECISIONS.md), on the built bundle.
 *
 * The playtest's finding: *Run the stage* showed a counter and text and nothing to watch, on the mode
 * `docs/38` § 2.3 says plays live. The ruling plays § D644's pair over replication 0 of the stage's
 * tuning crowds while the batch runs, and keeps the verdict free of it. Three claims, each one the
 * node tier cannot make:
 *
 * 1. both canvases are sized and **painting** while the counter still runs, so the sight arrives
 *    during the wait rather than after it;
 * 2. the verdict is drawn **while the pair is still on the page** (§ D644 ruling 2), recorded by a
 *    mutation observer installed before the press, so the order is the page's and not the poll's;
 * 3. the block's own words carry **no digit** (§ D644 ruling 4), and its skip takes the sight away
 *    and leaves the verdict.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { STAGE_PLAY_COPY } from './stagePlay.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 6016, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const STAGE = 'stage-1-first-call';

async function openStageOne(page: Page): Promise<void> {
  await page.locator('.everyday-mode[data-screen="scenario"]').click();
  await page.waitForSelector(`.everyday-scenario-path-card[data-stage="${STAGE}"]`, { timeout: 30_000 });
  await page.locator(`.everyday-scenario-path-card[data-stage="${STAGE}"] .everyday-scenario-path-head`).click();
  await page.waitForSelector('.everyday-stage-play-setting-select', { timeout: 60_000 });
}

/** Whether both of the pair's canvases are laid out and carry more than one colour. */
function pairPainting(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.everyday-stage-play-watch-canvas')];
    if (canvases.length !== 2) return false;
    return canvases.every((canvas) => {
      if (canvas.width === 0 || canvas.height === 0) return false;
      const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (pixels === undefined) return false;
      const seen = new Set<number>();
      for (let index = 0; index < pixels.length && seen.size < 3; index += 4 * 97) {
        seen.add(((pixels[index] ?? 0) << 16) | ((pixels[index + 1] ?? 0) << 8) | (pixels[index + 2] ?? 0));
      }
      return seen.size >= 2;
    });
  });
}

describe.skipIf(!HAS_BROWSER)('a stage press plays one of its crowds, and the verdict does not wait for it', () => {
  it('paints the pair while the counter runs, draws the verdict with the pair still up, and says no figure on it', async () => {
    const page = await openPage(browser, { viewport: { width: 1400, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await leaveTutorialIfOffered(page);
      await openStageOne(page);
      expect(await page.locator('.everyday-stage-play-watch').count(), 'a pair before any press').toBe(0);

      await page.selectOption('.everyday-stage-play-setting-select', 'zoned-uppeak');
      /* The order of the verdict and the pair's end, as the page saw them. */
      await page.evaluate(() => {
        const marks: Record<string, number> = {};
        (window as unknown as { __watchMarks: Record<string, number> }).__watchMarks = marks;
        let tick = 0;
        new MutationObserver(() => {
          tick += 1;
          const pair = document.querySelector('.everyday-stage-play-watch') !== null;
          if (pair && marks['pairUp'] === undefined) marks['pairUp'] = tick;
          if (!pair && marks['pairUp'] !== undefined && marks['pairGone'] === undefined) marks['pairGone'] = tick;
          if (document.querySelector('.everyday-stage-play-verdict') !== null && marks['verdict'] === undefined) {
            marks['verdict'] = tick;
          }
        }).observe(document.body, { childList: true, subtree: true });
      });
      await page.locator('.everyday-bar-primary').click();

      /* 1. Painting while the counter still counts. */
      await page.waitForFunction(
        () => document.querySelectorAll('.everyday-stage-play-watch-canvas').length === 2,
        undefined,
        { timeout: 60_000 },
      );
      await expect.poll(() => pairPainting(page), { timeout: 30_000 }).toBe(true);
      const during = await page.evaluate(() => ({
        status: document.querySelector('.everyday-stage-play-status')?.textContent ?? '',
        verdicts: document.querySelectorAll('.everyday-stage-play-verdict').length,
        order: [...document.querySelectorAll('.everyday-stage-play-watch, .everyday-stage-play-status')].map(
          (node) => node.className,
        ),
        text: document.querySelector('.everyday-stage-play-watch')?.textContent ?? '',
      }));
      expect(during.status, 'the pair arrived after the counter stopped').toMatch(/^(Running|Every goal met)/u);
      expect(during.verdicts).toBe(0);
      /* Reading order: the pair, then the counter under it. */
      expect(during.order).toEqual(['everyday-stage-play-watch', 'everyday-stage-play-status']);

      /* 3. The block's words: one crowd of many, both settings, and no figure. */
      expect(during.text.toLowerCase()).toContain(STAGE_PLAY_COPY.watchEyebrow.toLowerCase());
      expect(during.text).toContain(STAGE_PLAY_COPY.watchNote);
      expect(during.text).toContain(STAGE_PLAY_COPY.watchBaselineCaption);
      expect(during.text).toContain(STAGE_PLAY_COPY.watchCandidateCaption);
      expect(during.text).not.toMatch(/\d/u);

      /* 2. The verdict lands with the pair still on the page. */
      await page.waitForSelector('.everyday-stage-play-verdict', { timeout: 110_000 });
      const marks = await page.evaluate(
        () => (window as unknown as { __watchMarks: Record<string, number> }).__watchMarks,
      );
      expect(marks['pairUp']).toBeDefined();
      expect(marks['pairGone'], 'the pair ended before the verdict was drawn, so the order was not shown').toBeUndefined();
      expect(await page.locator('.everyday-stage-play-watch').count()).toBe(1);
      expect(await pairPainting(page)).toBe(true);
      expect((await page.textContent('.everyday-stage-play-watch')) ?? '').not.toMatch(/\d/u);

      /* The skip takes the sight away and leaves the verdict. */
      await page.click('.everyday-stage-play-watch-skip');
      await page.waitForFunction(() => document.querySelector('.everyday-stage-play-watch') === null, undefined, {
        timeout: 15_000,
      });
      expect(await page.locator('.everyday-stage-play-verdict').count()).toBe(1);
    } finally {
      await page.close();
    }
  }, 120_000);
});
