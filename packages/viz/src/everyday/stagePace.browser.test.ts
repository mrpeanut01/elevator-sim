/**
 * **A scored day's stage is fast while nobody has waited a minute and at the player's speed while
 * somebody has, on the shipped bundle** — [§ D1169](../../../../DECISIONS.md), which replaced
 * GitHub issue #592's § D991 rule on every scored day.
 *
 * `stagePace.test.ts` plays a whole day through the real `Playback` over a manual clock and measures
 * the duration. This is the half a unit test cannot reach: that the **stage** — the mounted screen a
 * player uses — asks the rule, moves the transport, lights the chip it is actually at and says why;
 * that a chip pressed while somebody is waiting is the rung every later wait plays at; that one
 * pressed while fast holds until somebody next waits; and that a slice is paced by the same rule,
 * where § D991 left it at one rung.
 *
 * The rung is read off the lit chip, whose label **is** its multiplier (§ D354), and off the note
 * the pace rule writes — both of which are the transport's own state, not a wall-clock reading
 * taken on a shared box. The day's crowd is the date's, so any ordinary call the day raises on the
 * way is answered *leave them* inside the polling predicate, which keeps the transport moving
 * without steering the run.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openEverydayDoor,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /* Its own port — `dev/browserTier.test.ts` requires every tier file's to be distinct. */
  site = await startShippedSite({ preview: { port: 5641, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** Open Today's scenario on `contractId`, start the day, and wait for the stage to be playing. */
async function playDayOn(
  contractId: string,
  viewport: { readonly width: number; readonly height: number } = { width: 1440, height: 900 },
): Promise<Page> {
  const page = await openPage(browser, { viewport });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await openEverydayDoor(page);
  /* The first visit's consent ask sits over the top of every screen until it is answered. */
  if ((await page.locator('.everyday-consent-no').count()) > 0) await page.locator('.everyday-consent-no').click();
  /*
   * The tower may already be the week standing: since § D1178 a newcomer's first week is Midtown, and
   * the door draws the week you are playing as a selected, disabled row. Press it only when it is not.
   */
  const tower = page.locator(`.everyday-door-tower[data-contract="${contractId}"]`);
  if ((await tower.getAttribute('data-selected')) !== 'true') await tower.click();
  await page.waitForSelector(`.everyday-door-tower[data-contract="${contractId}"][data-selected="true"]`, {
    timeout: 30_000,
  });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.everyday-stage-start')?.checkVisibility() === true,
    undefined,
    { timeout: 240_000 },
  );
  await page.locator('.everyday-stage-start').click();
  return page;
}

/** The chip the transport is lit at. */
async function litChip(page: Page): Promise<string> {
  return (await page.textContent('.everyday-stage-speed[aria-pressed="true"]')) ?? '';
}

async function paceNote(page: Page): Promise<string> {
  return (await page.textContent('.everyday-stage-pace')) ?? '';
}

/**
 * Wait until the pace note starts with `prefix`, answering any ordinary call card on the way with
 * *leave them* so a call's stop cannot hold the day where the note never changes.
 */
async function untilNote(page: Page, prefix: string, timeout: number): Promise<void> {
  await page.waitForFunction(
    (wanted) => {
      const leave = document.querySelector<HTMLButtonElement>(
        '.everyday-stage-call:not([hidden]) .everyday-stage-call-answer[data-answer="leave"]',
      );
      leave?.click();
      return (document.querySelector('.everyday-stage-pace')?.textContent ?? '').startsWith(wanted);
    },
    prefix,
    { timeout, polling: 100 },
  );
}

/**
 * **The transport is in a pace state, read off its chip and its one line** — wave AO, lane AO-4.
 * Since the transport's line says one thing at a time (`stagePace.ts#stageStatusOf`), the pace note
 * is not drawn while a skip speaks for the stage: the beat before a skip says the stage is fast and
 * why, and a skip's line stands while the stage stays where it landed. So *fast* is the lit `30×`
 * with either the pace note or the beat, and *watching* is the player's lit rung with either the
 * pace note or the line of the skip that landed on the wait.
 */
async function untilPace(page: Page, state: 'fast' | 'watching', rung: string, timeout: number): Promise<void> {
  await page.waitForFunction(
    ([wanted, chip]) => {
      const leave = document.querySelector<HTMLButtonElement>(
        '.everyday-stage-call:not([hidden]) .everyday-stage-call-answer[data-answer="leave"]',
      );
      leave?.click();
      const lit = document.querySelector('.everyday-stage-speed[aria-pressed="true"]')?.textContent ?? '';
      const pace = document.querySelector('.everyday-stage-pace')?.textContent ?? '';
      const skip = document.querySelector('.everyday-stage-skip-line')?.textContent ?? '';
      if (lit !== chip) return false;
      return wanted === 'fast'
        ? /* the landings clear, not § D1525's played-on line, which stands while somebody still waits */
          pace.startsWith(`fast-forwarding at ${chip}: nobody`) || skip.startsWith('nobody on a landing has waited a minute: skipping ahead')
        : pace.startsWith(`slowed to your speed, ${chip}`) || skip.startsWith('skipped ');
    },
    [state, rung] as const,
    { timeout, polling: 100 },
  );
}

describe.skipIf(!HAS_BROWSER)('§ D1169 — a scored day is paced by the tutorial’s rule on the stage a player uses', () => {
  it('is fast while nobody has waited a minute, at the player’s speed while somebody has, and keeps a chip', async () => {
    const page = await playDayOn('c2');
    try {
      /* 08:00, the quiet head: nobody on a landing has waited a minute, so the transport is fast. */
      await untilPace(page, 'fast', '30×', 30_000);
      expect(await litChip(page)).toBe('30×');
      expect(['', 'fast-forwarding at 30×: nobody on a landing has waited a minute']).toContain(await paceNote(page));

      /* Somebody passes a minute: the player's rung, and the line says why. */
      await untilPace(page, 'watching', '4×', 240_000);
      expect(await litChip(page)).toBe('4×');
      expect(['', 'slowed to your speed, 4×, for a wait on a landing of over a minute']).toContain(await paceNote(page));

      /* A chip pressed while somebody waits is the rung that wait plays at, and stays the player's rung. */
      await page.click('.everyday-stage-speed:text-is("8×")');
      await untilNote(page, 'slowed to your speed, 8×', 15_000);
      expect(await litChip(page)).toBe('8×');

      /* When the landings clear, fast again: the chip did not pin the rest of the day. */
      await untilPace(page, 'fast', '30×', 240_000);
      expect(await litChip(page)).toBe('30×');

      /* A chip pressed while fast holds until somebody next waits a minute, and says so. */
      await page.click('.everyday-stage-speed:text-is("1×")');
      await untilNote(page, 'your speed, 1×', 15_000);
      expect(await paceNote(page)).toBe('your speed, 1×, until somebody on a landing has waited a minute');
      expect(await litChip(page)).toBe('1×');
    } finally {
      await page.close();
    }
  }, 300_000);

  /*
   * § D1212 on the stage a player uses, widened by § D1266 to anywhere in the day: while nobody has
   * waited a minute, the stage shows a beat's note, then seeks and leaves one line saying what it
   * skipped. A pause during the beat stops it, and so does a chip. The day is the date's crowd, so the
   * times are read off the line rather than written here.
   */
  it('skips the quiet with a line saying what it skipped, and a pause or a chip stops a skip that is coming', async () => {
    const page = await playDayOn('c2');
    try {
      const skipLine = async (): Promise<string> => (await page.textContent('.everyday-stage-skip-line')) ?? '';
      const clock = async (): Promise<string> => (await page.textContent('.everyday-stage-clock')) ?? '';
      /* `other`: a line standing already (an earlier skip's) does not count as the one awaited. */
      const untilSkipLine = async (prefix: string, timeout: number, other?: string): Promise<void> => {
        await page.waitForFunction(
          ([wanted, stale]) => {
            const leave = document.querySelector<HTMLButtonElement>(
              '.everyday-stage-call:not([hidden]) .everyday-stage-call-answer[data-answer="leave"]',
            );
            leave?.click();
            const now = document.querySelector('.everyday-stage-skip-line')?.textContent ?? '';
            return now.startsWith(wanted) && now !== stale;
          },
          [prefix, other ?? null] as const,
          { timeout, polling: 50 },
        );
      };
      const BEAT = 'nobody on a landing has waited a minute: skipping ahead';

      /*
       * Since § D1266 the first beat can come before the first peak, and a skip may already have
       * left its line by the time somebody waits. `30×` is pressed while somebody waits, which
       * § D1169 makes the rung every wait plays at and leaves the skip alone, so the next beat comes
       * sooner.
       */
      await untilPace(page, 'watching', '4×', 240_000);
      await page.click('.everyday-stage-speed:text-is("30×")');
      /* A pause stops a coming skip where it stands: the beat's note goes, and no seek follows. */
      await untilSkipLine(BEAT, 480_000);
      await page.click('.everyday-stage-play');
      const standing = await skipLine();
      expect(standing).not.toContain('skipping ahead');
      const pausedAt = await clock();
      await page.waitForTimeout(3_000);
      expect(await clock(), 'the skip went ahead under a pause').toBe(pausedAt);

      /*
       * Play again: a fresh beat, and then the seek, and the line it leaves. Since § D1266 an earlier
       * skip's line may be standing at the pause, so the line awaited is a new one.
       */
      await page.click('.everyday-stage-play');
      await untilSkipLine('skipped ', 30_000, standing);
      const line = await skipLine();
      expect(line).toMatch(/^skipped \d\d:\d\d–\d\d:\d\d: nobody on a landing waited a minute$/u);
      /* It skipped from where the stage stood, to where it now stands. */
      expect(line.slice('skipped '.length, 'skipped '.length + 5) >= pausedAt).toBe(true);

      /*
       * The next beat, stopped by a chip: the player's speed until somebody waits, and no skip.
       * Since wave AO, lane AO-4 the transport's line says one thing at a time
       * (`stagePace.ts#stageStatusOf`): the chip moved the stage out of the state the last skip
       * landed in, so that skip's line has gone and the pace note speaks alone.
       */
      await untilSkipLine(BEAT, 480_000);
      await page.click('.everyday-stage-speed:text-is("30×")');
      await untilNote(page, 'your speed, 30×', 5_000);
      expect(await skipLine(), 'the chip did not stop the skip, or two lines spoke at once').toBe('');
      /*
       * For as long as the chip stands, no beat and no skip. It stands until somebody next waits a
       * minute (§ D1169), after which the next quiet stretch may be skipped again, so the line is
       * read only while the note still says the speed is the player's.
       */
      for (let read = 0; read < 25; read += 1) {
        const [note, now] = await page.evaluate(() => [
          document.querySelector('.everyday-stage-pace')?.textContent ?? '',
          document.querySelector('.everyday-stage-skip-line')?.textContent ?? '',
        ]);
        if (!note.startsWith('your speed')) break;
        expect(now, 'a skip came while the chip stood').toBe('');
        await page.waitForTimeout(100);
      }
      /* The line that skip left was the one read above, and it named the stretch it passed over. */
      expect(line).toMatch(/^skipped /u);
    } finally {
      await page.close();
    }
  }, 900_000);

  it('paces a contract that plays a slice by the same rule, where § D991 left it at one rung', async () => {
    /* Crown Hotel's crowd has no authored day in `data/`, so Today's scenario plays its slice. */
    const page = await playDayOn('c7');
    try {
      await untilNote(page, 'fast-forwarding at 30×', 30_000);
      expect(await litChip(page)).toBe('30×');
    } finally {
      await page.close();
    }
  }, 300_000);

  /*
   * Wave AQ, lane AQ-2 (§ D1508), the playtest at 1280×800: the canvas started below the goals and
   * showed floors 20 down to about 6, so the lobby's queue, *Floor G stacked 16 deep* at 08:43, was
   * never on screen. Red before: wave AO's rule left a canvas that was mostly in view where it was.
   */
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    it(`keeps the lobby rows in view when the day starts playing, at ${String(viewport.width)}×${String(viewport.height)}`, async () => {
      const page = await playDayOn('c2', viewport);
      try {
        /* The scroll is made on the frame after the press; wait for it rather than reading at once. */
        await page.waitForFunction(
          () => {
            const canvas = document.querySelector('.everyday-stage-canvas')?.getBoundingClientRect();
            const region = document.querySelector('.everyday-screen')?.getBoundingClientRect();
            const bar = document.querySelector('.everyday-bar')?.getBoundingClientRect();
            if (canvas === undefined || region === undefined || canvas.height === 0) return false;
            const bottom = Math.min(region.bottom, bar?.top ?? innerHeight, innerHeight);
            /*
             * Within a floor row of the bottom: the pace and skip lines above the canvas are written
             * on the frames after the scroll and can push it down by about one line of text.
             */
            return canvas.bottom <= bottom + 24 && canvas.bottom > region.top;
          },
          undefined,
          { timeout: 10_000, polling: 100 },
        );
      } finally {
        await page.close();
      }
    }, 120_000);
  }

  /*
   * Wave AR, lane AR-2 (§ D1527), the re-play at 1280×800: § D1508 scrolled the page to the lobby once
   * the day played, which took the clock, *standing right now* and *away inside a minute* off the top.
   * The header now stays at the top of the page while the building scrolls under it. Red before: the
   * clock's box sat above the page's visible top once the scroll was made.
   */
  it('keeps the clock, the live readouts and the lobby rows in view together after Play, at 1280×800', async () => {
    const page = await playDayOn('c2', { width: 1280, height: 800 });
    try {
      const inView = () =>
        page.evaluate(() => {
          const region = document.querySelector('.everyday-screen')?.getBoundingClientRect();
          const bar = document.querySelector('.everyday-bar')?.getBoundingClientRect();
          const canvas = document.querySelector('.everyday-stage-canvas')?.getBoundingClientRect();
          if (region === undefined || canvas === undefined || canvas.height === 0) return undefined;
          const top = Math.max(region.top, 0);
          const bottom = Math.min(region.bottom, bar?.top ?? innerHeight, innerHeight);
          /* Seen means inside the page's visible band and the topmost thing at its centre. */
          const seen = (node: Element | null | undefined): boolean => {
            if (node === null || node === undefined) return false;
            const box = node.getBoundingClientRect();
            if (!(box.height > 0 && box.top >= top - 1 && box.bottom <= bottom + 1)) return false;
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return hit !== null && (hit === node || node.contains(hit));
          };
          const figures = [...document.querySelectorAll('.everyday-stage-header .everyday-stage-figure')];
          const labelled = (label: string) => figures.find((figure) => (figure.textContent ?? '').toLowerCase().includes(label));
          return {
            clock: seen(document.querySelector('.everyday-stage-clock')),
            standing: seen(labelled('standing right now')),
            away: seen(labelled('away inside a minute')),
            /* Within a floor row of the bottom, as the § D1508 case reads it. */
            lobby: canvas.bottom <= bottom + 24 && canvas.bottom > top,
          };
        });
      /* The scroll is made on the frame after the press, and the clock is drawn on frames after it. */
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('.everyday-stage-canvas')?.getBoundingClientRect();
          const bar = document.querySelector('.everyday-bar')?.getBoundingClientRect();
          return canvas !== undefined && canvas.height > 0 && canvas.bottom <= (bar?.top ?? innerHeight) + 24;
        },
        undefined,
        { timeout: 10_000, polling: 100 },
      );
      expect(await inView()).toEqual({ clock: true, standing: true, away: true, lobby: true });
      /* And still so a few seconds into the day, once the lines above the building have been written. */
      await page.waitForTimeout(3_000);
      expect(await inView()).toEqual({ clock: true, standing: true, away: true, lobby: true });
    } finally {
      await page.close();
    }
  }, 120_000);

  /*
   * Wave AR, lane AR-2 (§ D1531): at Midtown's 10:40 call the card said *2 people are standing* while
   * the live region still said *0 legs waiting*, the sentence written at 09:46 as a skip began, held
   * there by the two-second limit. Red before: the region read 0 beside the card's 2.
   */
  it('never leaves the live region saying another count beside the call card', async () => {
    const page = await playDayOn('c2', { width: 1280, height: 800 });
    try {
      const read = () =>
        page.evaluate(() => {
          const facts = [...document.querySelectorAll('.everyday-stage-call-fact')].map((node) => node.textContent ?? '');
          const present = facts.find((fact) => /standing|Nobody is standing/u.test(fact)) ?? '';
          const card = /^Nobody/u.test(present) ? 0 : /^One person/u.test(present) ? 1 : Number(/^(\d+) people/u.exec(present)?.[1] ?? NaN);
          const said = document.querySelector('.everyday-stage-description')?.textContent ?? '';
          const legs = / (\d+) legs? waiting/u.exec(said)?.[1];
          return { card, said, legs: legs === undefined ? undefined : Number(legs) };
        });
      /* The first poll at which the card is up, within 50 ms of its appearing. */
      await page.waitForFunction(() => document.querySelector('.everyday-stage-call:not([hidden]) .everyday-stage-call-fact') !== null, undefined, {
        timeout: 100_000,
        polling: 50,
      });
      const first = await read();
      expect(Number.isFinite(first.card)).toBe(true);
      expect(first.said === '' || first.legs === first.card, JSON.stringify(first)).toBe(true);
      /* And once the limit has lifted, the call's own frame is said. */
      await page.waitForFunction(
        (want) => new RegExp(` ${String(want)} legs? waiting`, 'u').test(document.querySelector('.everyday-stage-description')?.textContent ?? ''),
        first.card,
        { timeout: 5_000, polling: 100 },
      );
    } finally {
      await page.close();
    }
  }, 120_000);
});
