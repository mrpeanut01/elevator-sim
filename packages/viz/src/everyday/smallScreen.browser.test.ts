/**
 * **The small-screen layout, driven rather than measured** — GitHub issue **#240**,
 * `docs/31-support-matrix.md` § 2.
 *
 * `everyday/viewportGates.browser.test.ts` is the gate: it renders the front door and the § 7 stage
 * at 360×800, 375×667 and 1280×800, and asks § 2's three clauses of each. It is a **static** reading
 * of an **arrival** state, and #240's layout does two things that reading cannot see.
 *
 * 1. **The rail is behind a toggle below `tokens.ts#EVERYDAY_RAIL_DRAWER_MAX_PX`.** Clause 3 is worded
 *    *"drawn but unreachable"*, so a closed drawer is outside it by construction — the eight rail
 *    rows are simply not drawn, and the gate correctly says nothing about them. A layout that
 *    passed § 2 by hiding controls behind a toggle nobody opened would be § D236's lockout wearing
 *    a gate, and the register in that file says so in as many words. **This file opens it**, and
 *    asks the same two clauses of the state the toggle produces.
 * 2. **A journey is not a render.** #240's fourth acceptance criterion is *"journey tests run at
 *    the minimum viewport as well as at desktop width"*, and the gate's own header cites it. The
 *    gate does walk the player's route into the stage — `enterEverydayStage`, deliberately rather
 *    than a helper that jumps it — but it stops there and measures. This file plays: it presses the
 *    four mode tiles at 360 px, crosses the daily flow, works the drawer, and comes back.
 *
 * ## The third criterion, and the building it is honestly measured against
 *
 * #240's third criterion is *"the stage remains legible at the minimum supported height, including
 * for the tallest shipped building"*. The tallest shipped building is **`vertical-city`, 100
 * floors** — eight authored floors and five `floorRanges` that expand to ninety-two more. It is not
 * § D527's 165-level reference tower: that building is **not in `data/buildings/`** (GitHub issue
 * #376, blocked), and a criterion cannot be met against a file that does not exist. What is
 * measured here is what ships; when #376 lands, this file's `TALLEST` is the one line that moves,
 * and it will move to a building 1.65× taller with the same question asked of it.
 *
 * **The mechanism this criterion needs was already built, by GitHub issue #324 and
 * [§ D505](../../../../DECISIONS.md)**, and that is worth saying because it is the reason this
 * criterion costs a measurement rather than a redesign. `stageScreenModel.ts#legibleFloorCount`
 * turns a canvas height into the number of floors it can label at `MIN_LABEL_PITCH_PX`, and
 * `#stageCameraChipsOf` draws the three camera positions **only** on a tower the whole of which
 * does not fit. A 100-floor tower in a 400 px canvas is 29 legible floors, so the chips are there,
 * and *legible* means a band the player can move rather than a hundred hairlines. This file asserts
 * both halves at the shortest viewport `docs/31` § 2 names: the chips are offered, and the canvas
 * still holds § 2's clause-2 floor.
 *
 * ## What this file deliberately does not do
 *
 * **No touch.** `docs/31` § 2 states tap-target sizing, gesture affordances, a touch-first control
 * layout and hover equivalents as a **refusal** — *"out of scope for launch, and stated as a
 * refusal rather than a backlog item"* — so there is no `hasTouch: true` context here and no
 * tap-target assertion. Building one would contradict the specification this issue is built to,
 * and § 2 names what would have to happen first: an enumeration of hover-dependent affordances,
 * a tap-target minimum in the stylesheet, and a browser-tier file driving a real journey under
 * emulated touch. This file is the third of those three with the emulation left off on purpose.
 *
 * **No register.** This file has no `OUTSTANDING`, because it found nothing to put in one. If it
 * ever needs one, `viewportGates.browser.test.ts` already holds the shape and the argument.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  enterEverydayStage,
  openEverydayDoor,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { legibleFloorCount } from './stageScreenModel.js';
import { EVERYDAY_RAIL_DRAWER_MAX_PX } from './tokens.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /* Its own port — `dev/browserTier.test.ts` requires every tier file's to be distinct, because
     `strictPort: false` makes a collision fail quietly rather than loudly. */
  site = await startShippedSite({ preview: { port: 5222, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** § 2's floor, and the width every case here drives unless it says otherwise. */
const PHONE = { width: 360, height: 800 } as const;

/**
 * The shortest viewport `docs/31` § 2 names — *"the minimum supported height"* in #240's third
 * criterion, read off the matrix rather than invented. 667 is the shorter of the two phone heights
 * the gate sweeps, so a canvas that holds at 667 holds at 800.
 */
const SHORTEST = { width: 375, height: 667 } as const;

/** The tallest building `data/buildings/` actually holds — see the header for why not § D527's. */
const TALLEST = 'vertical-city';

/** The tier-1 desktop row, so every claim below can be read as *at a phone width and not otherwise*. */
const DESKTOP = { width: 1280, height: 800 } as const;

async function coldLoad(
  viewport: { readonly width: number; readonly height: number },
  building = 'garden-apartments',
): Promise<Page> {
  const page = await openPage(browser, { viewport: { ...viewport } });
  await page.goto(`${origin}/?building=${building}&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForSelector('.everyday-bar-primary');
  /* One frame for the mount's first draw, the same settle the gate beside this file takes. */
  await page.waitForTimeout(600);
  return page;
}

/**
 * § 2's clauses 1 and 3 over whatever is on the screen now, in one page evaluation.
 *
 * **Deliberately the same question `viewportGates.browser.test.ts#MEASURE` asks, and deliberately
 * not the same function.** That one is a fifty-line instrument with a calibration case behind it,
 * a `sr-only` floor, a per-axis scroll pin and a register keyed on its output; importing it would
 * couple this file's cases to that file's register format and would mean a change to either
 * breaking both. What is shared is the *definition* — a box that clips horizontally, and a control
 * no gesture brings into the viewport from the state the player arrives in — and the two agree
 * where they overlap, which is the check worth having between two instruments rather than none.
 */
const CLAUSES = (): { readonly clipped: readonly string[]; readonly unreachable: readonly string[] } => {
  const shell = document.querySelector('.everyday-main')?.parentElement;
  if (shell === null || shell === undefined) throw new Error('the Everyday shell is not mounted');
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  /* `sr-only` is 1×1 by design and overflows enormously; a control a sighted player was never meant
     to see is not a control they cannot reach. The gate's own floor, for its own reason. */
  const MIN_DRAWN_PX = 8;
  const SLIVER_PX = 4;

  const drawn = (node: Element): boolean => {
    const box = node.getBoundingClientRect();
    return box.width >= MIN_DRAWN_PX && box.height >= MIN_DRAWN_PX;
  };
  const nameOf = (node: Element): string => {
    const own = node.className;
    if (typeof own === 'string' && own.trim() !== '') return own.trim().split(/\s+/u)[0] as string;
    return node.tagName.toLowerCase();
  };

  const clipped: string[] = [];
  for (const node of [shell, ...shell.querySelectorAll('*')]) {
    if (!drawn(node)) continue;
    const over = node.scrollWidth - node.clientWidth;
    if (over <= SLIVER_PX) continue;
    const style = getComputedStyle(node);
    if (!/hidden|clip/u.test(style.overflowX)) continue;
    /*
     * **A single-line label that ellipsises is truncated on purpose, and its overrun is not this
     * clause's subject** — the same shape of exclusion `viewportGates.browser.test.ts` makes for
     * `sr-only`, and made for the same reason: a box deliberately removed from the visual layout
     * is not a layout defect.
     *
     * It is here because this file found one and the finding was **not** about width. § 6.1's week
     * strip draws each day's tower name `white-space:nowrap; overflow:hidden; text-overflow:
     * ellipsis`, and *"Garden Apartments"* overruns its chip by **33 px at 360 px and 27 px at
     * 1280×800** — a six-pixel difference across a viewport three and a half times wider, because
     * what is being measured is a font against a chip rather than a shell against a screen.
     * Counting it would have made the desktop control red for a reason nothing about a phone
     * causes, which is the instrument reporting a design decision as a defect.
     *
     * Kept **narrow on purpose**: leaf boxes only, both properties, so a *container* that clips is
     * still a finding however its text is styled. The width half of that chip was real and was
     * fixed — `doorScreen.ts`'s week strip was seven fixed columns of 30 px at this width and is
     * an `auto-fit` grid now — and this exclusion is what is left after the width part was taken
     * out of it rather than instead of taking it out.
     */
    const ellipsised =
      style.textOverflow === 'ellipsis' &&
      /nowrap|pre$/u.test(style.whiteSpace) &&
      node.childElementCount === 0;
    if (ellipsised) continue;
    clipped.push(`${nameOf(node)} clips ${String(Math.round(over))} px`);
  }

  /* Pinned to zero rather than to wherever the box sits: a `hidden`/`clip` box cannot be scrolled
     by any gesture, so any offset it holds was put there by script. The gate's argument, kept. */
  const pinned: Element[] = [];
  for (const node of document.querySelectorAll('*')) {
    const style = getComputedStyle(node);
    if (/hidden|clip/u.test(style.overflowX)) node.scrollLeft = 0;
    if (/hidden|clip/u.test(style.overflowY)) node.scrollTop = 0;
    if (/hidden|clip/u.test(style.overflowX) || /hidden|clip/u.test(style.overflowY)) {
      pinned.push(node);
    }
  }
  const undoWhatNoGestureCouldDo = (): void => {
    for (const node of pinned) {
      const style = getComputedStyle(node);
      if (/hidden|clip/u.test(style.overflowX)) node.scrollLeft = 0;
      if (/hidden|clip/u.test(style.overflowY)) node.scrollTop = 0;
    }
  };
  const missBy = (box: DOMRect): number =>
    Math.max(0, box.right - vw, -box.left, box.bottom - vh, -box.top);

  const unreachable: string[] = [];
  for (const control of [...shell.querySelectorAll('button, a[href], input, select, textarea')]) {
    if (!drawn(control) || control.hasAttribute('hidden')) continue;
    if (missBy(control.getBoundingClientRect()) <= SLIVER_PX) continue;
    control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    undoWhatNoGestureCouldDo();
    if (missBy(control.getBoundingClientRect()) <= SLIVER_PX) continue;
    unreachable.push(nameOf(control));
  }
  undoWhatNoGestureCouldDo();
  return { clipped, unreachable };
};

/** `isVisible` on a selector that may not exist, which Playwright's own `isVisible` throws on. */
async function page$isVisible(page: Page, selector: string): Promise<boolean> {
  const found = page.locator(selector);
  return (await found.count()) > 0 && (await found.first().isVisible());
}

/* -------------------------------------------------------------------------- *
 * The drawer — the controls § 2's clause 3 cannot see, because they are not drawn
 * -------------------------------------------------------------------------- */

describe.skipIf(!HAS_BROWSER)('the rail is reachable at 360 px, and so is everything in it', () => {
  it('hides the rail behind a toggle, and the toggle opens it', async () => {
    const page = await coldLoad(PHONE);
    try {
      const toggle = page.locator('.everyday-rail-toggle');
      const rail = page.locator('.everyday-rail');

      expect(await toggle.isVisible(), 'the narrow header draws no toggle at 360 px').toBe(true);
      expect(
        await rail.isVisible(),
        'the rail is drawn as a column at 360 px, which is the 212 px against a 148 px screen ' +
          'region that #240 is open to fix',
      ).toBe(false);
      expect(await toggle.getAttribute('aria-expanded')).toBe('false');
      /* An `aria-controls` naming an id that is not in the document reads as a described
         relationship and describes nothing — the binding, resolved rather than compared. */
      const controls = await toggle.getAttribute('aria-controls');
      expect(controls, 'the toggle names no drawer').not.toBeNull();
      expect(
        await page.locator(`#${String(controls)}`).count(),
        `the toggle's aria-controls names "${String(controls)}", which resolves to nothing`,
      ).toBe(1);

      await toggle.click();
      await rail.waitFor({ state: 'visible' });
      expect(await toggle.getAttribute('aria-expanded')).toBe('true');

      /*
       * The whole point of the case: the state the toggle produces answers § 2's two width clauses
       * as well as the state it replaces. A drawer that opened onto a clipped rail would have moved
       * the defect behind a control rather than fixed it.
       */
      const open = await page.evaluate(CLAUSES);
      expect(open.clipped, 'the open drawer clips content horizontally').toEqual([]);
      expect(open.unreachable, 'the open drawer puts a control out of reach').toEqual([]);

      /* Every rail row, not just the drawer's own chrome — the eight the closed state hides. */
      expect(
        await page.locator('.everyday-rail button, .everyday-rail a[href]').count(),
        'the open drawer draws no rail rows, so this case is watching an empty box',
      ).toBeGreaterThan(4);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('closes on the scrim, on Escape, and on a row that navigates', async () => {
    const page = await coldLoad(PHONE);
    try {
      const toggle = page.locator('.everyday-rail-toggle');
      const rail = page.locator('.everyday-rail');

      /* Its own close. */
      await toggle.click();
      await rail.waitFor({ state: 'visible' });
      await page.locator('.everyday-rail-close').click();
      await rail.waitFor({ state: 'hidden' });

      /* The scrim, which is the gesture a player brings with them from every other drawer. */
      await toggle.click();
      await rail.waitFor({ state: 'visible' });
      await page.locator('.everyday-rail-scrim').click({ position: { x: 340, y: 400 } });
      await rail.waitFor({ state: 'hidden' });

      /* `Escape`, on § D188's precedent for the Engineer drawer — same gesture, same shell. */
      await toggle.click();
      await rail.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await rail.waitFor({ state: 'hidden' });

      /*
       * And a row that navigates, which is the one that is not a dismissal: a drawer left standing
       * over the screen it has just opened is clause 3 with the player's own press behind it.
       */
      await toggle.click();
      await page.locator('.everyday-rail button', { hasText: 'Settings' }).first().click();
      await rail.waitFor({ state: 'hidden' });
      expect(await page.locator('.everyday-screen').isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('changes shape at the width the token names, and one pixel either side of it', async () => {
    /*
     * **The constant asserted against the behaviour rather than against itself** — the shape
     * `dev/surfaces.test.ts` uses for `DRAWER_BREAKPOINT_PX` against `index.html`'s own rule, which
     * is the only kind of assertion a constant can usefully carry. A case that imported the number
     * and compared it to 720 would prove that a literal equals itself.
     *
     * Both sides, because a breakpoint asserted on one side is a breakpoint that could be anywhere
     * below it: at the token's own width the drawer is up (the query is `max-width`, so the edge is
     * inclusive), and one pixel above it the column is back.
     */
    const at = await coldLoad({ width: EVERYDAY_RAIL_DRAWER_MAX_PX, height: 800 });
    try {
      expect(
        await page$isVisible(at, '.everyday-rail-toggle'),
        `no toggle at ${String(EVERYDAY_RAIL_DRAWER_MAX_PX)} px, which the token says is inside the drawer's band`,
      ).toBe(true);
      expect(await page$isVisible(at, '.everyday-rail')).toBe(false);
    } finally {
      await at.close();
    }

    const above = await coldLoad({ width: EVERYDAY_RAIL_DRAWER_MAX_PX + 1, height: 800 });
    try {
      expect(
        await page$isVisible(above, '.everyday-rail'),
        `no rail column at ${String(EVERYDAY_RAIL_DRAWER_MAX_PX + 1)} px, one pixel above the token`,
      ).toBe(true);
      expect(await page$isVisible(above, '.everyday-rail-toggle')).toBe(false);
    } finally {
      await above.close();
    }
  }, 120_000);

  it('draws the rail as a column at 1280 px and no toggle with it', async () => {
    const page = await coldLoad(DESKTOP);
    try {
      expect(
        await page.locator('.everyday-rail').isVisible(),
        'the rail is not drawn as a column at 1280 px',
      ).toBe(true);
      expect(
        await page.locator('.everyday-rail-toggle').isVisible(),
        'the narrow header is drawn at a desktop width, so the breakpoint is not a breakpoint',
      ).toBe(false);
      expect(
        await page.locator('.everyday-rail-close').isVisible(),
        "the drawer's own dismiss is drawn beside a docked rail, where it dismisses nothing",
      ).toBe(false);
    } finally {
      await page.close();
    }
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * The journey — #240's fourth criterion
 * -------------------------------------------------------------------------- */

describe.skipIf(!HAS_BROWSER)('every mode opens at 360 px, and the daily loop crosses it', () => {
  it('presses all four mode tiles and reaches each screen', async () => {
    const page = await coldLoad(PHONE);
    try {
      const tiles = page.locator('.everyday-mode');
      const count = await tiles.count();
      expect(count, '§ 4 has four modes and the front door drew a different number').toBe(4);

      for (let index = 0; index < count; index += 1) {
        /* Back to the front door between presses, through the bar's own way out rather than a
           reload — a reload would be testing the boot path four times instead of the menu. */
        if (index > 0) {
          await page.locator('.everyday-rail-toggle').click();
          await page.locator('.everyday-rail-menu').click();
          await page.waitForSelector('.everyday-mode');
        }
        const tile = page.locator('.everyday-mode').nth(index);
        const name = (await tile.textContent())?.slice(0, 40) ?? '(no text)';
        expect(
          await tile.isVisible(),
          `mode tile ${String(index)} (${name}) is not visible at 360 px`,
        ).toBe(true);
        await tile.click();
        await page.waitForTimeout(400);
        expect(
          await page.locator('.everyday-mode').count(),
          `pressing mode tile ${String(index)} (${name}) at 360 px left the front door up`,
        ).toBe(0);
        const after = await page.evaluate(CLAUSES);
        expect(after.clipped, `the screen mode tile ${String(index)} opens clips at 360 px`).toEqual([]);
        expect(
          after.unreachable,
          `the screen mode tile ${String(index)} opens puts a control out of reach at 360 px`,
        ).toEqual([]);
      }
    } finally {
      await page.close();
    }
  }, 300_000);

  it('lays the front door and the brief out at 360 px, on the way through', async () => {
    const page = await coldLoad(PHONE);
    try {
      /*
       * The two screens the daily loop crosses and the gate never sees. `viewportGates` measures
       * the front **menu** and the stage; § 6.1's door and § 6.3's brief are between them, and both
       * were two-column layouts with a fixed track when this was written. The week strip on the
       * door was seven columns of 30 px at this width and is an `auto-fit` grid now, which is the
       * finding this case exists to keep.
       */
      await openEverydayDoor(page);
      const door = await page.evaluate(CLAUSES);
      expect(door.clipped, '§ 6.1 front door clips at 360 px').toEqual([]);
      expect(door.unreachable, '§ 6.1 front door puts a control out of reach at 360 px').toEqual([]);

      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      await page.waitForTimeout(500);
      const brief = await page.evaluate(CLAUSES);
      expect(brief.clipped, '§ 6.3 brief clips at 360 px').toEqual([]);
      expect(brief.unreachable, '§ 6.3 brief puts a control out of reach at 360 px').toEqual([]);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('plays the daily loop from the front door to a running stage at 360 px', async () => {
    const page = await coldLoad(PHONE);
    try {
      /* The player's own route — menu tile, front door, brief, stage — never a helper that jumps
         it, because a screen nobody can open at this width is half of what is being measured. */
      await enterEverydayStage(page);
      expect(await page.locator('.everyday-stage-canvas').isVisible()).toBe(true);

      /* The transport, worked rather than looked at: the run is what makes this a journey. */
      await page.locator('.everyday-stage-start').click();
      await page.waitForFunction(
        () => (document.querySelector('.everyday-stage-clock')?.textContent ?? '00:00') !== '00:00',
        undefined,
        { timeout: 60_000 },
      );

      const running = await page.evaluate(CLAUSES);
      expect(running.clipped, 'the running stage clips content at 360 px').toEqual([]);
      expect(running.unreachable, 'the running stage puts a control out of reach at 360 px').toEqual([]);

      /* Clause 2, on the screen the journey actually produced rather than on a cold render. */
      const share = await page.evaluate(() => {
        const canvas = document.querySelector('.everyday-stage-canvas');
        if (canvas === null) return 0;
        return (
          Math.round((canvas.getBoundingClientRect().height / document.documentElement.clientHeight) * 1_000) /
          10
        );
      });
      expect(share, 'the stage canvas is under § 2 clause 2 floor on a running day').toBeGreaterThanOrEqual(60);
    } finally {
      await page.close();
    }
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * #240's third criterion — the tallest building that ships, at the shortest height
 * -------------------------------------------------------------------------- */

describe.skipIf(!HAS_BROWSER)('the stage stays legible on the tallest shipped building', () => {
  it(`offers the camera on ${TALLEST} at ${String(SHORTEST.width)}×${String(SHORTEST.height)}`, async () => {
    const page = await coldLoad(SHORTEST, TALLEST);
    try {
      await enterEverydayStage(page);

      const canvasPx = await page.evaluate(
        () => document.querySelector('.everyday-stage-canvas')?.getBoundingClientRect().height ?? 0,
      );
      expect(canvasPx, 'the stage drew no canvas, so nothing below is measuring the stage').toBeGreaterThan(0);
      expect(
        Math.round((canvasPx / SHORTEST.height) * 1_000) / 10,
        'the canvas is under § 2 clause 2 floor on the tallest building at the shortest height',
      ).toBeGreaterThanOrEqual(60);

      /*
       * **The legibility claim, in the product's own units.** `legibleFloorCount` is what
       * `stageCameraChipsOf` consults, so asking it here is asking the same question the paint
       * asks rather than a second one that could drift from it. A hundred floors do not fit; the
       * three camera positions are how the player reads them, and their presence is the assertion.
       */
      const fits = legibleFloorCount(canvasPx);
      expect(
        fits,
        `a ${String(Math.round(canvasPx))} px canvas labels ${String(fits)} floors, which is enough for ` +
          "the whole of this tower — so the camera would be a control that writes nothing and this " +
          'case is measuring a building that is no longer the tallest',
      ).toBeLessThan(100);

      const chips = page.locator('.everyday-stage-camera');
      expect(
        await chips.count(),
        'no camera chip is drawn on a 100-floor tower whose whole height does not fit, so the ' +
          'player has one picture of a hundred hairlines and no way to move it — issue #324, § D505',
      ).toBe(3);
      for (let index = 0; index < 3; index += 1) {
        expect(await chips.nth(index).isVisible(), `camera chip ${String(index)} is drawn and invisible`).toBe(true);
      }

      const reading = await page.evaluate(CLAUSES);
      expect(reading.clipped, `${TALLEST} clips at ${String(SHORTEST.width)} px`).toEqual([]);
      expect(
        reading.unreachable,
        `${TALLEST} puts a control out of reach at ${String(SHORTEST.width)} px`,
      ).toEqual([]);

      /* The chips do something — a band that does not move is the refusal § D505 draws instead. */
      await chips.nth(1).click();
      await page.waitForTimeout(500);
      const afterCamera = await page.evaluate(CLAUSES);
      expect(afterCamera.unreachable, 'moving the camera puts a control out of reach').toEqual([]);
    } finally {
      await page.close();
    }
  }, 300_000);
});
