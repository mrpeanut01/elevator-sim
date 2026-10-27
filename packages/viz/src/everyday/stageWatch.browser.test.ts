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
      expect(during.status, 'the pair arrived after the counter stopped').toMatch(/^(Running|Met on the stage)/u);
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

  /*
   * Wave AQ lane AQ-1, the playtest's P1 and its second stage finding. At 1280 × 800 the press
   * changed only its own label, because the pair and the verdict were drawn below the fold; and after
   * a miss the pair took itself away a few seconds after the verdict.
   */
  it('brings the pair into view at 1280 × 800 as it starts, then the verdict, and keeps the pair up beside it', async () => {
    const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await leaveTutorialIfOffered(page);
      await openStageOne(page);
      /* The stage's own setting, which cannot beat itself: a miss. */
      await page.locator('.everyday-bar-primary').click();

      const inView = (selector: string): Promise<boolean> =>
        page.evaluate((query) => {
          const node = document.querySelector(query);
          if (node === null) return false;
          const box = node.getBoundingClientRect();
          const bar = document.querySelector('.everyday-bar')?.getBoundingClientRect().top ?? window.innerHeight;
          return box.top >= 0 && box.top < Math.min(window.innerHeight, bar) - 40;
        }, selector);

      await page.waitForFunction(
        () => document.querySelectorAll('.everyday-stage-play-watch-canvas').length === 2,
        undefined,
        { timeout: 60_000 },
      );
      await expect.poll(() => inView('.everyday-stage-play-watch-canvas'), { timeout: 10_000 }).toBe(true);

      await page.waitForSelector('.everyday-stage-play-verdict', { timeout: 70_000 });
      await expect.poll(() => inView('.everyday-stage-play-verdict-head'), { timeout: 10_000 }).toBe(true);
      expect(await page.getAttribute('.everyday-stage-play-verdict', 'data-cleared')).toBe('no');

      /* The old pair ended inside ten seconds of the verdict and took itself away. */
      await page.waitForTimeout(12_000);
      expect(await page.locator('.everyday-stage-play-watch').count(), 'the pair left the verdict on its own').toBe(1);
      expect(await pairPainting(page)).toBe(true);
    } finally {
      await page.close();
    }
  }, 120_000);
  /*
   * Wave AR lane AR-3, GitHub issue #633: the pair stopped for about 4 s on stage 1 while the fifty
   * crowds ran, and for 4.8 s on the held-back crowds. The batch was on its worker all along; the page
   * redrew on every progress message and each redraw asked the one check of every route on every
   * stage again. Measured before the fix: a 3.8 s stall on this case, 4.7 s on the stage's own setting.
   */
  it('keeps the painting thread free while the fifty crowds run, so the pair keeps playing', async () => {
    const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await leaveTutorialIfOffered(page);
      await openStageOne(page);
      await page.selectOption('.everyday-stage-play-setting-select', 'zoned-uppeak');
      await page.evaluate(() => {
        const w = window as unknown as { __ticks: number[] };
        w.__ticks = [];
        /* The playtest's own instrument: a 50 ms timer, which a busy painting thread starves. */
        window.setInterval(() => w.__ticks.push(performance.now()), 50);
      });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-play-verdict', { timeout: 110_000 });
      const longest = await page.evaluate(() => {
        const ticks = (window as unknown as { __ticks: number[] }).__ticks;
        let gap = 0;
        for (let index = 1; index < ticks.length; index += 1) gap = Math.max(gap, (ticks[index] ?? 0) - (ticks[index - 1] ?? 0));
        return gap;
      });
      expect(longest, 'the page did not answer for this long while the stage ran').toBeLessThan(1_000);
    } finally {
      await page.close();
    }
  }, 120_000);

  /*
   * Ruling R10, § D1622, amendment 4: a press that changes both the standing order and the parking is
   * split after its verdict. The block is drawn last, below the held-back crowds' sentence; a pending
   * line holds its place while Run stays live; ruling R11's contrast (§ D1625) is the block's last line;
   * and an edit takes the block away, the contrast with it. A mutation observer
   * installed before the press records what the page drew, so a pending state shorter than a poll is
   * still seen.
   */
  it('draws the split of a two-change press last, keeps Run live while it runs, and drops it on an edit', async () => {
    const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await leaveTutorialIfOffered(page);
      await openStageOne(page);
      /* X1's press: Minimum estimated wait with forecast parking. */
      await page.selectOption('.everyday-stage-play-setting-select', 'eta');
      await page.selectOption('.everyday-stage-play-parking-select', 'predicted-demand');
      await page.evaluate(() => {
        const marks = { pending: 0, pendingRunDisabled: 0, splitBeforeVerdict: 0 };
        (window as unknown as { __splitMarks: typeof marks }).__splitMarks = marks;
        new MutationObserver(() => {
          const split = document.querySelector('.everyday-stage-play-split');
          if (split === null) return;
          if (split.closest('.everyday-stage-play-verdict') === null) marks.splitBeforeVerdict += 1;
          if (split.getAttribute('data-state') !== 'pending') return;
          marks.pending += 1;
          if (document.querySelector<HTMLButtonElement>('.everyday-bar-primary')?.disabled === true) marks.pendingRunDisabled += 1;
        }).observe(document.body, { childList: true, subtree: true, attributes: true });
      });
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-play-split[data-state="drawn"]', { timeout: 110_000 });

      const marks = await page.evaluate(
        () => (window as unknown as { __splitMarks: { pending: number; pendingRunDisabled: number; splitBeforeVerdict: number } }).__splitMarks,
      );
      expect(marks.pending, 'the pending line never held the split’s place').toBeGreaterThan(0);
      expect(marks.pendingRunDisabled, 'Run was greyed while the split ran').toBe(0);
      expect(marks.splitBeforeVerdict).toBe(0);
      expect(await page.locator('.everyday-bar-primary').isDisabled()).toBe(false);

      /* Last in the card, after the held-back crowds' sentence, never between the two crowds' sentences. */
      const card = await page.evaluate(() =>
        [...(document.querySelector('.everyday-stage-play-verdict')?.children ?? [])].map((node) => node.className),
      );
      expect(card[card.length - 1]).toBe('everyday-stage-play-split');
      expect(card.indexOf('everyday-stage-play-holdout')).toBeGreaterThan(-1);
      expect(card.indexOf('everyday-stage-play-holdout')).toBeLessThan(card.indexOf('everyday-stage-play-split'));
      const block = (await page.textContent('.everyday-stage-play-split')) ?? '';
      expect(block).toContain('Your setting differs from the building’s own in two ways');
      expect(block).not.toMatch(/\bpress/iu);
      expect(block).toContain('Changing the standing order to Minimum estimated wait, with forecast parking kept: ');
      expect(block).toContain('Changing to forecast parking, with the standing order kept at Minimum estimated wait: ');
      expect(await page.locator('.everyday-stage-play-split-line').count()).toBe(4);
      /* § D1625: the two changes set against each other, the block's last line. */
      const blockChildren = await page.evaluate(() =>
        [...(document.querySelector('.everyday-stage-play-split')?.children ?? [])].map((node) => node.className),
      );
      expect(blockChildren[blockChildren.length - 1]).toBe('everyday-stage-play-split-contrast');
      expect(blockChildren.filter((name) => name === 'everyday-stage-play-split-contrast')).toHaveLength(1);
      expect((await page.textContent('.everyday-stage-play-split-contrast')) ?? '').toMatch(
        /^Making the change to forecast parking instead of the change to Minimum estimated wait, on the same 50 crowds: average wait /u,
      );

      /* An edit drops the batch and the block, the contrast with it, and the verdict goes stale. */
      await page.selectOption('.everyday-stage-play-parking-select', 'zone-center');
      expect(await page.locator('.everyday-stage-play-split').count()).toBe(0);
      expect(await page.locator('.everyday-stage-play-split-contrast').count()).toBe(0);
      expect(await page.locator('.everyday-stage-play-stale').count()).toBe(1);
      /* Back to the pressed settings: the verdict is current again, and the dropped split stays dropped. */
      await page.selectOption('.everyday-stage-play-parking-select', 'predicted-demand');
      expect(await page.locator('.everyday-stage-play-stale').count()).toBe(0);
      expect(await page.locator('.everyday-stage-play-split').count()).toBe(0);
    } finally {
      await page.close();
    }
  }, 120_000);

  /*
   * Wave AR lane AR-3, GitHub issue #633: on stage 3, Min-wait with lobby parking after Min-wait as it
   * stands, *your change moved no count* was drawn below the fold.
   */
  it('brings the moved-no-count line into view with the verdict', async () => {
    const page = await openPage(browser, { viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await leaveTutorialIfOffered(page);
      const stage = 'stage-3-overwhelmed';
      await page.locator('.everyday-mode[data-screen="scenario"]').click();
      await page.waitForSelector(`.everyday-scenario-path-card[data-stage="${stage}"]`, { timeout: 30_000 });
      await page.locator(`.everyday-scenario-path-card[data-stage="${stage}"] .everyday-scenario-path-head`).click();
      await page.waitForSelector('.everyday-stage-play-setting-select', { timeout: 60_000 });
      await page.selectOption('.everyday-stage-play-setting-select', 'eta');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-play-verdict', { timeout: 110_000 });
      await page.selectOption('.everyday-stage-play-parking-select', 'lobby');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-play-same-counts', { timeout: 110_000 });
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const line = document.querySelector('.everyday-stage-play-same-counts')?.getBoundingClientRect();
              const bar = document.querySelector('.everyday-bar')?.getBoundingClientRect().top ?? window.innerHeight;
              return line !== undefined && line.top >= 0 && line.bottom <= Math.min(window.innerHeight, bar);
            }),
          { timeout: 10_000 },
        )
        .toBe(true);
    } finally {
      await page.close();
    }
  }, 120_000);
});
