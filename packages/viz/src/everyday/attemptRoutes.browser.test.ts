/**
 * **The attempt's routes, before it begins and at its held call** — wave AO, lane AO-1 (the
 * integration follow-up), on the shipped bundle.
 *
 * ## The holes this file reproduces
 *
 * 1. **Rehearsal before the attempt.** § D1218 begins the attempt at *Start the day*, and § D1360
 *    holds every other door only while an attempt stands. Before it begins, the Dispatcher
 *    workshop's *Run a day with this* played the scored day's shared crowd, so each driver could be
 *    tried on the very crowd the day is scored on, and *Start the day* pressed with the answer known.
 * 2. **The drawing board's reload.** *Run a day in it* went through `applyBuildingSpec`, which stood
 *    the player's own week on the sandbox contract; a reload then opened the week on Garden
 *    Apartments, the fault § D1368 fixed for the tuner.
 * 3. **The reach past a held call.** The stage noted how far it had shown the attempt from the frame
 *    it drew, before the call's stop put the playhead back on the call second, so at a fast chip
 *    the attempt's reach stood a few seconds past an unanswered call and the Engineer transport,
 *    held at that reach (§ D1239), showed those seconds of the call's unanswered branch.
 *
 * ## What the cases hold
 *
 * 1. Before *Start the day*, the workshop's run is a sandbox day on a practice crowd: the stage says
 *    so, the crowd is not the day's, *‹ Brief* finds the brief as it was with *Start the day* still
 *    up, and *Start the day* then plays the day's own crowd with no practice line.
 * 2. A designed day runs, and after a reload the week is on its own tower and day, with nothing
 *    filed and no sandbox week stored.
 * 3. Stopped at a call at the fastest chip but one, the attempt's stored reach and the Engineer
 *    playhead scrubbed to its end are both at or before the call's second.
 *
 * Crown Hotel on 2026-10-03, `attemptIsFinal.browser.test.ts`'s and `dayCalls.browser.test.ts`'s
 * day: an ordinary day, so its call is § D1138's.
 *
 * Gate: without `ELEVATOR_SIM_CHROMIUM` every case here skips and the file reports a pass, which is
 * why the tier is run with it set and the case count is what is read. Port 5971, moving if taken.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  enterEngineerStage,
  leaveTutorialIfOffered,
  openEverydayDoor,
  openPage,
  returnToEverydayMode,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { ATTEMPT_KEY } from '../persist/attempt.js';
import { SESSION_KEY } from '../persist/types.js';
import { PRACTICE_DAY_SENTENCES } from '../shift/scoredCrowd.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  site = await startShippedSite({ preview: { port: 5971, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const DATE = '2026-10-03';
const DATE_CROWD = '20261003';
const TOWER = 'c7';

async function textOf(page: Page, selector: string): Promise<string> {
  const text = await page.textContent(selector).catch(() => null);
  return (text ?? '').replace(/\s+/gu, ' ').trim();
}

async function load(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
}

/** Menu → Scenario → door, Crown Hotel selected, then the door's primary onto the brief; the brief's text. */
async function toCrownsBrief(page: Page): Promise<string> {
  await leaveTutorialIfOffered(page);
  await openEverydayDoor(page);
  const row = `.everyday-door-tower[data-contract="${TOWER}"]`;
  if ((await page.locator(`${row}[data-selected="true"]`).count()) === 0) await page.click(row);
  await page.waitForSelector(`${row}[data-selected="true"]`, { timeout: 30_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  return textOf(page, '.everyday-brief');
}

/** The brief's leave button onto the modes, then a rail row by its words. */
async function railTo(page: Page, words: string, screen: string): Promise<void> {
  await page.locator('.everyday-bar-leave').click();
  const leave = page.locator('.everyday-bar-confirm-leave');
  if (await leave.isVisible().catch(() => false)) await leave.click();
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
  await page.click(`.everyday-rail button:has-text("${words}")`);
  await page.waitForSelector(screen, { timeout: 15_000 });
}

/** The stage with a run on it, at its opening. */
async function stageWithARun(page: Page): Promise<void> {
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('.everyday-stage-failed')?.style.display === 'flex' ||
      document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display === '',
    undefined,
    { timeout: 120_000 },
  );
  expect(await page.evaluate(() => document.querySelector<HTMLElement>('.everyday-stage-failed')?.style.display ?? 'none')).not.toBe(
    'flex',
  );
}

/**
 * The crowd the state stands on, as the address carries it (`dev/main.ts#deepLinkSearchOf` writes
 * `seed` from the state after every change); the Engineer seed field is written only when typed in.
 */
async function crowdOnScreen(page: Page): Promise<string> {
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get('seed') !== null, undefined, { timeout: 15_000 });
  return page.evaluate(() => new URL(window.location.href).searchParams.get('seed') ?? '');
}

async function storedWeek(page: Page): Promise<{ readonly contractId: string; readonly day: number; readonly filed: number; readonly ids: readonly string[] } | undefined> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const session = (JSON.parse(raw) as {
      session?: { week?: { contractId: string; day: number; history: unknown[] }; parkedWeeks?: { contractId: string }[] };
    }).session;
    if (session?.week === undefined) return undefined;
    return {
      contractId: session.week.contractId,
      day: session.week.day,
      filed: session.week.history.length,
      ids: [session.week.contractId, ...(session.parkedWeeks ?? []).map((week) => week.contractId)],
    };
  }, SESSION_KEY);
}

/** The Crown's stored attempt: its crowd, how far it was shown, and the instants of the calls it has recorded. */
async function storedAttempt(
  page: Page,
): Promise<{ readonly seed: string; readonly shownToS: number; readonly calls: readonly number[] } | undefined> {
  return page.evaluate(
    ({ key, tower }) => {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return undefined;
      const attempt = (JSON.parse(raw) as {
        attempts?: Record<string, { seed: string; shownToS: number; calls?: { records?: { atS: number }[] } | null }>;
      }).attempts?.[tower];
      if (attempt === undefined) return undefined;
      return { seed: attempt.seed, shownToS: attempt.shownToS, calls: (attempt.calls?.records ?? []).map((record) => record.atS) };
    },
    { key: ATTEMPT_KEY, tower: TOWER },
  );
}

/** The Engineer timeline after `key` (`Home` or `End`), in seconds of the day off its `hh:mm:ss` readout. */
async function engineerClockAfter(page: Page, key: 'Home' | 'End'): Promise<number> {
  await page.focus('#timeline');
  await page.keyboard.press(key);
  /* Two frames, so the reach the tick holds the playhead at is the one drawn. */
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const clock = (await page.getAttribute('#timeline', 'aria-valuetext')) ?? '';
  const [hours, minutes, seconds] = clock.split(':').map(Number);
  expect([hours, minutes, seconds].every((part) => Number.isInteger(part)), `the timeline read "${clock}"`).toBe(true);
  return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
}

describe.skipIf(!HAS_BROWSER)('the attempt’s routes, before it begins and at its held call — wave AO', () => {
  it('the workshop’s run before Start the day is a sandbox day on a practice crowd, and the day is untouched', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      const brief = await toCrownsBrief(page);
      expect(await textOf(page, '.everyday-bar-primary')).toBe('Start the day');

      await railTo(page, 'Dispatcher workshop', '.everyday-workshop');
      expect(await page.locator('.everyday-bar-primary').isDisabled(), 'the workshop refused before any attempt').toBe(false);
      await page.locator('.everyday-bar-primary').click();
      await stageWithARun(page);
      /*
       * The line is `practiceGroundOf`'s `'practiceCrowd'`, which it answers only where the run's crowd
       * is exactly the practice crowd the shell dealt (`shift/scoredCrowd.test.ts`); a sandbox day is a
       * mode week, so the address keeps the week's crowd and is not read here.
       */
      expect(await textOf(page, '.everyday-stage-practice'), 'the run was not labelled a practice crowd').toBe(
        PRACTICE_DAY_SENTENCES.practiceCrowd,
      );
      expect(await storedAttempt(page), 'the workshop’s run began the day’s attempt').toBeUndefined();

      await page.locator('.everyday-bar-back').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      expect(await textOf(page, '.everyday-brief'), 'the brief after the practice run is not the brief before it').toBe(brief);
      expect(await textOf(page, '.everyday-bar-primary'), 'the practice run began the attempt').toBe('Start the day');

      await page.locator('.everyday-bar-primary').click();
      await stageWithARun(page);
      expect(await crowdOnScreen(page), 'Start the day did not play the day’s own crowd').toBe(DATE_CROWD);
      expect((await storedAttempt(page))?.seed, 'the attempt did not begin on the day’s own crowd').toBe(DATE_CROWD);
      expect(await textOf(page, '.everyday-stage-practice')).toBe('');
      expect((await storedWeek(page))?.filed).toBe(0);
    } finally {
      await page.close();
    }
  });

  it('a designed day runs, and after a reload the week is on its own tower and day', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      const brief = await toCrownsBrief(page);
      await railTo(page, 'Design a building', '.everyday-designer');
      await page.locator('.everyday-bar-primary').click();
      await stageWithARun(page);

      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      const stored = await storedWeek(page);
      expect(stored?.contractId, 'the reload found the week off its own tower').toBe(TOWER);
      expect(stored?.day).toBe(1);
      expect(stored?.filed).toBe(0);
      expect(stored?.ids.filter((id) => id.startsWith('sandbox')), 'a sandbox week reached the saved session').toEqual([]);
      expect(await toCrownsBrief(page), 'the brief after the reload is not the brief before the designed day').toBe(brief);
    } finally {
      await page.close();
    }
  });

  it('stopped at a call, the attempt’s reach and the Engineer playhead are at or before the call’s second', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await load(page);
      await toCrownsBrief(page);
      await page.locator('.everyday-bar-primary').click();
      await stageWithARun(page);
      const opening = await storedAttempt(page);
      expect(opening, 'Start the day stored no attempt').toBeDefined();
      const startedAt = opening?.shownToS ?? 0;

      /* The fastest chip but one: a frame there is about four simulated seconds, past the call before the stop. */
      await page.locator('.everyday-stage-speed', { hasText: '240×' }).click();
      await page.locator('.everyday-stage-start').click();
      await page.waitForSelector('.everyday-stage-call:not([hidden])', { timeout: 120_000 });

      /* A tab that goes writes where the stage had reached (`dev/main.ts`'s `pagehide`), so the stored reach is the reach. */
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      const held = await storedAttempt(page);

      await enterEngineerStage(page);
      const engineerEnd = await engineerClockAfter(page, 'End');
      const engineerStart = await engineerClockAfter(page, 'Home');
      /* The Engineer clock is the day's clock, so its distance from the run's start is a simulated time. */
      const engineerAtS = startedAt + (engineerEnd - engineerStart);
      await returnToEverydayMode(page);

      await page.locator('.everyday-stage-call-answer[data-answer="leave"]').click();
      await page.waitForFunction(
        ({ key, tower }) => {
          const raw = window.localStorage.getItem(key);
          const attempt = raw === null ? undefined : (JSON.parse(raw) as { attempts?: Record<string, { calls?: { records?: unknown[] } | null }> }).attempts?.[tower];
          return (attempt?.calls?.records?.length ?? 0) > 0;
        },
        { key: ATTEMPT_KEY, tower: TOWER },
        { timeout: 30_000 },
      );
      const callAtS = (await storedAttempt(page))?.calls[0];
      expect(callAtS, 'the answered call was not recorded').toBeDefined();
      const call = callAtS ?? 0;
      expect(call, 'the day called at its very start, which tells nothing').toBeGreaterThan(startedAt + 60);

      expect(held?.shownToS, 'the attempt’s stored reach passed the held call').toBeLessThanOrEqual(call);
      expect(held?.shownToS, 'the attempt’s stored reach fell short of the stage’s own stop').toBeGreaterThanOrEqual(call - 1);
      expect(engineerAtS, 'the Engineer playhead showed past the held call').toBeLessThanOrEqual(call);
    } finally {
      await page.close();
    }
  });
});
