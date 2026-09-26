/**
 * **One standing count on a stopped frame, and every car that is out named** — wave AJ, the post-AI
 * panel's seat D (D7) and seat B (defects 4 and 5), on the shipped bundle.
 *
 * ## What one case walks
 *
 * St Jude's pinned day (`c8`), from the front door with no address parameter, as the date deals it
 * or as the picker opens it. The brief headlines it as a day the stage will call rather than *an
 * ordinary day*. At the fastest rung the stage stops at the call, and on that frame:
 *
 * - the header's *standing right now*, the race strip's *N standing now* and the screen reader's
 *   *N legs waiting* are one number. The panel read 10, 6 and 7: the strip was answered at the last
 *   four-minute grid line and the live region at the last write its two-second limit allowed;
 * - the card names cars D and E, both booked out 08:37–08:46, where it named only car D.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5761, `strictPort: false`
 * so a busy one moves rather than fails.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openEverydayDoor,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { wrinkleNameOf } from '../shift/bookedOut.js';
import { SHIFT_EVENTS } from '../shift/events.js';

const CALL_DAY_NAME = wrinkleNameOf(SHIFT_EVENTS.ordinary, true);

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5761, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const PRESS_DAY = 'c8';

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

describe.skipIf(!HAS_BROWSER)('a stopped frame carries one standing count — wave AJ', () => {
  it('names the call day, stops with one count on every surface, and names both cars out', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await leaveTutorialIfOffered(page);
      await openEverydayDoor(page);
      const row = `.everyday-door-pressday[data-contract="${PRESS_DAY}"]`;
      if ((await page.locator(`${row}[data-standing="true"]`).count()) === 0) await page.click(row);
      await page.waitForSelector(`${row}[data-standing="true"]`, { timeout: 30_000 });

      /* ---- the brief: a day the stage will call is not headlined an ordinary day ---- */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      const brief = await textOf(page, '.everyday-brief');
      expect(brief).toContain(CALL_DAY_NAME);
      expect(brief).not.toContain('An ordinary day');

      /* ---- the stage, to the call at the fastest rung ---- */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
      await page.waitForFunction(
        () => {
          const primary = document.querySelector('.everyday-bar-primary')?.textContent ?? '';
          const start = document.querySelector<HTMLElement>('.everyday-stage-start');
          return primary.includes('Close the day') && start?.style.display === '';
        },
        undefined,
        { timeout: 240_000 },
      );
      await page.locator('.everyday-stage-speed', { hasText: '600×' }).click();
      await page.locator('.everyday-stage-start').click();
      await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 60_000 });
      /*
       * The live region is held to one write in two seconds (`stageScreen.ts#STAGE_ANNOUNCE_MS`), and
       * the stopped frame is said when that lifts — so give it the limit and a little over, and read
       * whatever is there then. Waited on rather than slept, so a quick box does not pay the whole of it.
       */
      await page
        .waitForFunction(
          () => {
            const header = [...document.querySelectorAll('.everyday-stage-figure')]
              .find((box) => (box.textContent ?? '').toLowerCase().includes('standing right now'))
              ?.querySelector('.everyday-stage-figure-value')?.textContent?.trim();
            const said = /(\d+) legs waiting/u.exec(document.querySelector('.everyday-stage-description')?.textContent ?? '')?.[1];
            return header !== undefined && said === header;
          },
          undefined,
          { timeout: 4_000 },
        )
        .catch(() => undefined);

      const card = await textOf(page, '.everyday-stage-call');
      expect(card).toContain('Cars D and E are out of passenger service');

      const counts = await page.evaluate(() => {
        const header = [...document.querySelectorAll('.everyday-stage-figure')]
          .find((box) => (box.textContent ?? '').toLowerCase().includes('standing right now'))
          ?.querySelector('.everyday-stage-figure-value')?.textContent;
        const strip = document.querySelector('.everyday-stage-verdict')?.textContent ?? '';
        const said = document.querySelector('.everyday-stage-description')?.textContent ?? '';
        const label = document.querySelector('.everyday-stage-canvas')?.getAttribute('aria-label') ?? '';
        return {
          header: header?.trim() ?? '',
          strip: /(\d+) standing now/u.exec(strip)?.[1] ?? strip,
          said: /(\d+) legs waiting/u.exec(said)?.[1] ?? said,
          label: /(\d+) legs waiting/u.exec(label)?.[1] ?? label,
        };
      });
      expect(counts.header, 'the header has a standing count').toMatch(/^\d+$/u);
      expect(counts.strip, 'the race strip').toBe(counts.header);
      expect(counts.said, 'the screen reader’s live region').toBe(counts.header);
      expect(counts.label, 'the canvas’s accessible name').toBe(counts.header);

      /*
       * **And the report's press row, which reads the stamp's instant** — § D1153, the post-AJ
       * panel's seat D (H10): the stopped frame read 12 and the press row *11 people standing*,
       * because at a fast rung the frame the stage stopped on was seconds past the call second the
       * answer is stamped at. No pair in `honesty/agreement.ts` could see it: the standing pairs
       * read both of their sides at one playhead, and this is two instants.
       */
      await page.locator('.everyday-stage-call-answer[data-answer="park-cars-lobby"]').click();
      await page.waitForFunction(
        () => {
          const line = document.querySelector('.everyday-stage-intervene-refusal')?.textContent ?? '';
          const stamp = document.querySelector('.everyday-stage-stamp')?.textContent ?? '';
          return !line.includes('recomputing') && stamp !== '';
        },
        undefined,
        { timeout: 240_000 },
      );
      /*
       * Skipped until the day runs out: since § D1204 the pinned day asks on after its call, and a
       * skip with a later card up skips that call, pressing nothing, so the press row stays this one.
       */
      await page.waitForFunction(
        () => {
          const skip = document.querySelector<HTMLButtonElement>('.everyday-stage-skip');
          if (skip === null || skip.disabled) return true;
          skip.click();
          return false;
        },
        undefined,
        { timeout: 120_000, polling: 500 },
      );
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-report', { timeout: 60_000 });
      const report = await textOf(page, '.everyday-report');
      const pressRow = /parked the cars in the lobby, with (\d+) (?:person|people) standing at the landings/u.exec(report);
      expect(pressRow, 'the report has no press row').not.toBeNull();
      expect(pressRow?.[1], 'the report’s press row and the frame the stage stopped on').toBe(counts.header);
    } finally {
      await page.close();
    }
  });
});
