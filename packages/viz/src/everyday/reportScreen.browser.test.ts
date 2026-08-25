/**
 * **The report's closing block and its lever hand-off, on a page** — GitHub issues #211 and #213.
 *
 * ## Why these two need a browser and `reportView.test.ts` does not
 *
 * `reportView.test.ts` decides what the screen *says*, over a real sheet. Two of the claims these
 * issues turn on are not claims about a value at all:
 *
 * - **#211** is about what a reader *sees before pressing anything*. The layering is only a fix if
 *   the folded text is genuinely folded and genuinely one press away, and neither of those is a
 *   property of a string — `<details>` is a rendering. So the block is measured twice on the page:
 *   `innerText` for what is drawn, `textContent` for what is present.
 * - **#213** is about where a button goes. The defect it closed was a *label describing a feature
 *   that does not exist*: `reportScreen.ts` rendered `Open the simulator's Building panel` and its
 *   handler called `context.go('stage')`, which since § D335 is the Everyday day stage. Nothing in
 *   a node tier could see that, because the label and the handler were both individually fine.
 *
 * ## The route is the player's own
 *
 * `enterEverydayStage` walks the § 3.3 primaries from the menu tile, the day is filed through the
 * host, and the report is opened from Your week's card — `dailyLoop.browser.test.ts`'s own path,
 * for its own reason: a tier that reached a screen by a route no player has is a tier that tests a
 * screen nobody can open.
 *
 * Pattern and gate are `shell.browser.test.ts`'s.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import { CHROMIUM, HAS_BROWSER, enterEverydayStage, openPage } from '../dev/browserTier.test-helper.js';
import { CASUAL_REACH_NOTE, CASUAL_SMALL_PRINT_LEAD } from '../mode/casualDay.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5209, strictPort: false },
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

/** A cold load, waited out to the point where the Engineer menu has been dismissed. */
async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** `dailyLoop.browser.test.ts`'s own two steps: wait for the player's run, then file it. */
async function fileTheDay(page: Page): Promise<void> {
  await page.evaluate(
    "import('/src/everyday/host.ts').then((module) => { window.__everydayHost = module.EVERYDAY_HOST; return true; })",
  );
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __everydayHost?: { current(): { runState(): { open: boolean } } | undefined };
        }
      ).__everydayHost
        ?.current()
        ?.runState().open === true,
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(
    "import('/src/everyday/host.ts').then((module) => { module.EVERYDAY_HOST.current()?.closeDay(); return true; })",
  );
}

/** Walk the loop to a filed sheet on § 6.5's screen. */
async function openTheReport(page: Page): Promise<void> {
  await enterEverydayStage(page);
  await fileTheDay(page);
  await page.locator('.everyday-rail button', { hasText: 'Your week' }).first().click();
  await page.waitForSelector('.everyday-week', { timeout: 15_000 });
  await page.locator('.everyday-week-card-open').click();
  await page.waitForSelector('.everyday-report', { timeout: 15_000 });
  // A filed sheet, not the empty one — otherwise there is no closing block and no lever to press.
  expect(await page.locator('.everyday-report-empty').count()).toBe(0);
}

const wordsIn = (text: string): number => text.split(/\s+/u).filter(Boolean).length;

/** Whitespace as the DOM gives it back, so a `contains` over real copy is not defeated by wrapping. */
const flat = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/**
 * The closing block's small print, read twice off the page.
 *
 * **Scoped to `.everyday-report-smallprint` rather than to the whole block**, and the scoping is the
 * measurement rather than tidiness: the block also carries its `This was one day` heading and § 6.5's
 * pointer at *Compare*, both of which are always drawn and neither of which is what issue #211 filed.
 * Measuring the element would have counted 56 words of other copy into the wall.
 *
 * `present` is every part in document order — handles and paragraphs alike carry the class, so this
 * is the whole block. `drawn` is the subset a reader sees: a part inside a closed `<details>` is
 * not one, which is the only fact about this fix that a node tier cannot check.
 */
async function smallPrint(page: Page): Promise<{ drawn: string; present: string }> {
  return page.evaluate(() => {
    const parts = [
      ...document.querySelectorAll<HTMLElement>(
        '.everyday-report-honesty .everyday-report-smallprint',
      ),
    ];
    const shown = (node: HTMLElement): boolean => {
      const fold = node.closest('details');
      return fold === null || fold.open || node.tagName === 'SUMMARY';
    };
    return {
      drawn: parts.filter(shown).map((node) => node.textContent ?? '').join(' '),
      present: parts.map((node) => node.textContent ?? '').join(' '),
    };
  });
}

describe.skipIf(!HAS_BROWSER)('§ 6.5’s closing block is layered on the page — issue #211', () => {
  it('draws a short lead and folds the rest, with every word still in the document', async () => {
    const page = await coldLoad();
    try {
      await openTheReport(page);

      /*
       * **Two measurements of the same parts, and the pair is the whole claim.** `drawn` is what a
       * reader meets — the wall the issue filed. `present` is what is in the document, which is
       * what *no claim is deleted; every one remains reachable* means.
       */
      const { drawn, present } = await smallPrint(page);

      expect(wordsIn(present)).toBeGreaterThan(300);
      expect(wordsIn(drawn)).toBeLessThan(wordsIn(present) / 3);

      // Both mode wings are present whole. These are `mode/casualDay.ts`'s own constants, imported
      // rather than retyped: a copy of the text here would pass against a screen that had lost it.
      expect(flat(present)).toContain(flat(CASUAL_SMALL_PRINT_LEAD));
      expect(flat(present)).toContain(flat(CASUAL_REACH_NOTE));

      // And the refusal is the part that is *not* folded — the one claim that may not be a click away.
      expect(flat(drawn)).toContain('This is one replication of one day on one seed.');
      expect(flat(drawn)).toContain('50 or more paired runs');
    } finally {
      await page.close();
    }
  }, 180_000);

  it('is one press from the whole paragraph, and the press is the disclosure’s own', async () => {
    const page = await coldLoad();
    try {
      await openTheReport(page);
      const folds = page.locator(
        '.everyday-report-honesty details.everyday-report-smallprint-more',
      );
      const count = await folds.count();
      expect(count).toBeGreaterThan(0);

      const before = await smallPrint(page);
      for (let index = 0; index < count; index += 1) {
        await folds.nth(index).locator('summary').click();
      }
      const after = await smallPrint(page);

      // Opened, the drawn text **is** the whole block — nothing was moved out of the screen to make
      // the lead short, and `present` is unchanged by the presses, which is what makes that
      // comparison worth anything.
      expect(wordsIn(after.drawn)).toBeGreaterThan(wordsIn(before.drawn));
      expect(after.present).toBe(before.present);
      expect(after.drawn).toBe(after.present);
    } finally {
      await page.close();
    }
  }, 180_000);
});

describe.skipIf(!HAS_BROWSER)('the report’s lever opens what it names — issue #213', () => {
  it('hands the page to the Engineer surface with the panel the label named', async () => {
    const page = await coldLoad();
    try {
      await openTheReport(page);
      const go = page.locator('.everyday-report-lever-go').first();
      expect(await go.count()).toBe(1);
      const label = flat((await go.textContent()) ?? '');
      expect(label).toMatch(/^Open the simulator’s .+ panel$/u);

      /*
       * The state before the press, so the assertion after it is a *change*. § D335 made `stage`
       * the Everyday day stage, and the handler that used to hand off still called it — a button
       * whose label named a panel and whose press navigated inside this shell.
       */
      const before = await page.evaluate(() => ({
        everyday: document.querySelector<HTMLElement>('.everyday')?.style.visibility,
        panel: document.getElementById('panel-building')?.hidden,
      }));
      expect(before).toEqual({ everyday: '', panel: true });

      await go.click();
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('.shell')?.inert === false &&
          document.querySelector<HTMLElement>('.everyday')?.style.visibility === 'hidden' &&
          document.getElementById('panel-building')?.hidden === false,
        undefined,
        { timeout: 15_000 },
      );
      expect(await page.getAttribute('#tab-building', 'aria-selected')).toBe('true');
      // The label read this button's own words; pressing it selected this button's own panel.
      expect(label).toContain(flat((await page.textContent('#tab-building')) ?? ''));
    } finally {
      await page.close();
    }
  }, 180_000);

  it('leaves the loop standing behind it, so the way back lands on the sheet', async () => {
    const page = await coldLoad();
    try {
      await openTheReport(page);
      await page.locator('.everyday-report-lever-go').first().click();
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday')?.style.visibility === 'hidden',
        undefined,
        { timeout: 15_000 },
      );
      // Covered, never unmounted — `shell.ts#setEverydayCovered` uses `visibility` for exactly this
      // reason, and the sheet is still in the document while the other world has the page.
      expect(await page.locator('.everyday-report').count()).toBe(1);

      await page.locator('#back-to-everyday').click();
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.everyday')?.style.visibility === '',
        undefined,
        { timeout: 15_000 },
      );
      // § 6.5's screen, not the front door: the return lands on the screen the player left.
      expect(await page.locator('.everyday-report-figures .everyday-figure').count()).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  }, 180_000);

  it('gives the dispatcher levers no button at all, and says why on the card', async () => {
    const page = await coldLoad();
    try {
      await openTheReport(page);
      /*
       * `LEVER_SURFACES` names two of the four **by argued decision** (`dev/reportPanel.ts:231-237`):
       * a card that navigated to the dispatcher editor would be this sheet recommending a dispatch
       * strategy off one replication — `docs/10` R2 and CLAUDE.md's paired-interval rule. #213's
       * own criterion, taken literally, would have shipped that. So the count is asserted from
       * both ends: every card that routes, and every card that refuses, adds up to the cards drawn.
       */
      const cards = await page.locator('.everyday-report-lever').count();
      const buttons = await page.locator('.everyday-report-lever-go').count();
      const refusals = await page.locator('.everyday-report-lever-note').count();
      expect(cards).toBeGreaterThan(0);
      expect(buttons + refusals).toBe(cards);
      expect(refusals).toBeGreaterThan(0);
      expect(flat((await page.locator('.everyday-report-lever-note').first().textContent()) ?? '')).toContain(
        'one day is not evidence',
      );
    } finally {
      await page.close();
    }
  }, 180_000);
});
