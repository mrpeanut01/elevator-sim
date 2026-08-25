/**
 * **Fix a building, played through the shipped page** — GAMEPLAY § 10, driven.
 *
 * ## Why the flow needs a browser
 *
 * The claim is that a *player* can reach this screen and get an answer out of it, and every step
 * of that is a fact about the page rather than a return value: the fourth mode tile opens rather
 * than refusing, the screen mounts in the shell's scroll region rather than as an overlay, a
 * repair toggles, the § 3.3 primary — which is the **shell's** button, not the screen's — runs the
 * pair, and the outcome card the engine worded appears under it. The pure half of all of that is
 * held in `fixitScreenModel.test.ts` without a document; what cannot be held there is that the
 * two halves are wired to each other, which is the seam this repository keeps finding broken
 * (§ D219: *move the control and require the run to change*).
 *
 * ## The one place this tier is slow, stated
 *
 * Pressing the primary runs a real pair of simulations on the main thread — `dev/fixitPanel.ts`'s
 * stated cost, carried over — so the outcome wait is generous. The disabled-and-relabelled
 * primary is asserted *because* of that: it is the only thing standing between a player and a
 * second press during a run.
 *
 * ## What is deliberately not asserted
 *
 * No metric, per § D220 § 4 and the shell suite's own rule. The outcome case reads *a verdict was
 * drawn* — a head, three rows and the basis line — and never what the run measured.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, openPage } from '../dev/browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — files in one project run concurrently.
    server: { port: 5197, strictPort: false },
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
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/**
 * Enter the screen the way a player does — the fourth mode tile — and wait for the case file.
 *
 * Through the tile rather than by calling `go`, which is the difference between testing the
 * product and testing a surface nobody can open: the tile is only enabled because `screens.ts`
 * registered the module, so a registry that regressed fails *here*, at the click.
 */
async function openFixit(page: Page): Promise<void> {
  await page.locator('.everyday-mode[data-screen="fixit"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('.everyday-fixit-case').length > 0,
    undefined,
    { timeout: 60_000 },
  );
}

/**
 * The index of the first repair row whose price matches `priced`, and which is not refused.
 *
 * **Selected by its priced cell rather than by `hasText`, and that is a fix rather than a
 * preference.** The first draft filtered rows with Playwright's `hasText: ' u'` — a
 * case-insensitive substring over the row's whole `textContent`, which the effect sentence
 * satisfies with any word beginning in `u`. It matched the *free* row, the spend line correctly
 * did not move, and the assertion failed for a reason that was nothing to do with the product.
 * `browserTier.test-helper.ts` records the same lesson about selecting a control by prose that
 * belongs to the player; this is that lesson inside one file.
 */
async function repairIndex(page: Page, priced: 'free' | 'costed'): Promise<number> {
  const index = await page.evaluate((want) => {
    const rows = [...document.querySelectorAll('.everyday-fixit-repair')];
    return rows.findIndex((row) => {
      if (row instanceof HTMLButtonElement && row.disabled) return false;
      const price = row.querySelector('.everyday-fixit-price')?.textContent ?? '';
      return want === 'free' ? /^free/.test(price) : /^\d+ u$/.test(price);
    });
  }, priced);
  expect(index, `no ${priced} repair on this case`).toBeGreaterThanOrEqual(0);
  return index;
}

/** One state the § 3.3 primary was in, as {@link recordPrimaryStates} caught it. */
interface PrimaryState {
  readonly label: string;
  readonly disabled: boolean;
}

/** Where the recorder parks its list. The test's own name; the product neither writes nor reads it. */
type RecordingWindow = Window & typeof globalThis & { __primaryStates?: PrimaryState[] };

/**
 * Start recording every state the § 3.3 primary passes through, from **before** the press.
 *
 * ## Why a recording and not a `waitForFunction`
 *
 * The busy state this case is about — disabled, relabelled `Running the day…` — is real and lasts
 * for the whole of the run. It was still missed intermittently under load, and the reason is about
 * the driver rather than about the product: `fixitScreen.ts#primary` writes the relabel
 * synchronously in the click handler's own task and then defers the pair past a paint, so from the
 * page's point of view the sequence is *click task* → paint → *one task that blocks the main thread
 * for seconds*. A `waitForFunction` issued **after** the click has to be installed by an evaluate
 * on that same main thread; if the round trip lands after the blocking task has started, the
 * evaluate queues behind it and first runs when the run is over and the label has been put back.
 * The window is not short — it is **unreachable**, because the only thread that could look at it is
 * the one doing the work.
 *
 * So the observer is installed before the press, and it is a `MutationObserver` whose callback is a
 * microtask: it is delivered at the end of the click handler's own task, before the frame that
 * schedules the run. Nothing is weakened — the same two facts are asserted, disabled and relabelled,
 * on a state the page genuinely passed through — and the assertion stops depending on when a remote
 * poll happens to get a turn.
 *
 * It watches the document rather than the button, because the button does not survive:
 * `shell.ts#drawBar` calls `bar.replaceChildren()` and builds a fresh `.everyday-bar-primary` on
 * every refresh, so an observer bound to the element would be watching a detached node from the
 * first redraw onward — which is this same defect wearing a different hat.
 */
async function recordPrimaryStates(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: PrimaryState[] = [];
    const sample = (): void => {
      const button = document.querySelector<HTMLButtonElement>('.everyday-bar-primary');
      if (button === null) return;
      const last = seen.at(-1);
      const label = button.textContent ?? '';
      if (last?.label === label && last.disabled === button.disabled) return;
      seen.push({ label, disabled: button.disabled });
    };
    sample();
    (window as RecordingWindow).__primaryStates = seen;
    new MutationObserver(sample).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
}

/** What the recorder caught, in order. */
async function primaryStates(page: Page): Promise<readonly PrimaryState[]> {
  return page.evaluate(() => (window as RecordingWindow).__primaryStates ?? []);
}

describe.skipIf(!HAS_BROWSER)('the fourth mode tile opens § 10’s screen', () => {
  it('draws the case rail, the complaint, the figures and the diagnosis inside the shell', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);
      const screen = await page.evaluate(() => {
        const region = document.querySelector<HTMLElement>('.everyday-screen');
        const root = document.querySelector<HTMLElement>('.everyday-fixit');
        return {
          // A screen, not an overlay: it lives inside the shell's scroll region, and the shell's
          // main column is still laid out (the stage hand-off is what hides that).
          insideRegion: region !== null && root !== null && region.contains(root),
          mainShown: document.querySelector<HTMLElement>('.everyday-main')?.style.display,
          cases: document.querySelectorAll('.everyday-fixit-case').length,
          count: document.querySelector('.everyday-fixit-count')?.textContent ?? '',
          complaint: document.querySelector('.everyday-fixit-complaint')?.textContent ?? '',
          figures: document.querySelectorAll('.everyday-fixit-figure').length,
          diagnosis: document.querySelector('.everyday-fixit-diagnosis')?.textContent ?? '',
          repairs: document.querySelectorAll('.everyday-fixit-repair').length,
          extras: document.querySelectorAll('.everyday-fixit-extra').length,
        };
      });
      expect(screen.insideRegion).toBe(true);
      expect(screen.mainShown).toBe('grid');
      // Derived, never asserted: however many cases the file ships, the rail's line counts the
      // rows it drew. Three today, eighteen when the catalogue lands.
      expect(screen.cases).toBeGreaterThan(0);
      expect(screen.count).toBe(`0/${String(screen.cases)} fixed`);
      expect(screen.complaint).toContain('THE COMPLAINT');
      // § 10.1 item 3's four figures, and § 10.6 rule 3's four repairs beside the five extras.
      expect(screen.figures).toBe(4);
      expect(screen.diagnosis).toContain('THE DIAGNOSIS');
      expect(screen.repairs).toBe(4);
      expect(screen.extras).toBe(5);
    } finally {
      await page.close();
    }
  });

  it('draws § 3.3’s fixit row: the building is what is left, and the primary is Run the day', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);
      const bar = await page.evaluate(() => ({
        leave: document.querySelector('.everyday-bar-leave')?.textContent ?? '',
        primary: (() => {
          const button = document.querySelector<HTMLButtonElement>('.everyday-bar-primary');
          return button === null
            ? null
            : { label: button.textContent ?? '', disabled: button.disabled };
        })(),
        note: document.querySelector('.everyday-bar-note')?.textContent ?? '',
        // The screen owns no footer of its own — § 3.1, and the way out is the bar's left button.
        ownPrimaries: document.querySelectorAll('.everyday-fixit .everyday-bar-primary').length,
      }));
      expect(bar.leave).toBe('⤺ Leave this building');
      expect(bar.primary).toEqual({ label: 'Run the day', disabled: false });
      // The ⟨what the run will measure⟩ cell, substituted — and never leaked as a placeholder.
      expect(bar.note).not.toContain('⟨');
      expect(bar.note).toContain('scores the whole building');
      expect(bar.ownPrimaries).toBe(0);
    } finally {
      await page.close();
    }
  });

  it('toggles a repair, says so in the platform’s word and in a visible mark, and moves the spend', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);
      const before = await page.evaluate(() => ({
        pressed: document.querySelector('.everyday-fixit-repair')?.getAttribute('aria-pressed'),
        state: document.querySelector('.everyday-fixit-repair .everyday-fixit-state')?.textContent ?? '',
        committed: document.querySelector('.everyday-fixit-committed')?.textContent ?? '',
      }));
      expect(before.pressed).toBe('false');

      /*
       * A **priced** repair rather than the first: the diagnosed fix is free in every shipped
       * case, so pressing it would move `aria-pressed` and leave the spend line identical — a test
       * that would pass on a screen whose budget arithmetic was disconnected. This is § D219's
       * rule (*move the control and require the run to change*) at the cheapest place to apply it,
       * and it caught its own first draft: see {@link repairIndex}.
       */
      await page.locator('.everyday-fixit-repair').nth(await repairIndex(page, 'costed')).click();

      const after = await page.evaluate(() => ({
        pressedCount: [...document.querySelectorAll('.everyday-fixit-repair')].filter(
          (row) => row.getAttribute('aria-pressed') === 'true',
        ).length,
        marks: [...document.querySelectorAll('.everyday-fixit-repair .everyday-fixit-state')]
          .map((node) => node.textContent ?? '')
          .filter((text) => text.includes('✓')).length,
        committed: document.querySelector('.everyday-fixit-committed')?.textContent ?? '',
      }));
      expect(after.pressedCount).toBe(1);
      // Not `aria-pressed` alone — a sighted reader gets the tick, and a colour change was both.
      expect(after.marks).toBe(1);
      expect(after.committed).not.toBe(before.committed);
    } finally {
      await page.close();
    }
  });

  it('shows an unaffordable repair, dimmed and inert, saying what it is short by', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);
      /*
       * § 10.2: the new shaft is listed at its real 34 u, *"permanently out of reach and labelled
       * beyond a repair budget"*. It has to be visible and unaffordable rather than absent — a
       * player must be able to see why more shafts is not the answer — and the refusal has to say
       * the number, which is the engine's sentence rather than this screen's.
       */
      const shaft = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.everyday-fixit-repair')];
        const refused = rows.find((row) => row instanceof HTMLButtonElement && row.disabled);
        return refused instanceof HTMLButtonElement
          ? {
              disabled: refused.disabled,
              pressed: refused.getAttribute('aria-pressed'),
              dimmed: refused.style.opacity,
              text: refused.textContent ?? '',
            }
          : null;
      });
      expect(shaft?.disabled).toBe(true);
      expect(shaft?.pressed).toBe('false');
      expect(Number(shaft?.dimmed)).toBeLessThan(1);
      expect(shaft?.text).toMatch(/short by \d+ u/);
      expect(shaft?.text).toContain('beyond a repair budget');
    } finally {
      await page.close();
    }
  });

  it('runs the day from the bar’s primary, holds it inert meanwhile, and draws the outcome', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);

      // The diagnosed fix is free and is the one the case was authored to be solved by; the
      // screen does not label it (§ 10.2 — *nothing labels itself*), and this test does not need
      // it to, because it asserts that a verdict was drawn rather than which verdict.
      await page.locator('.everyday-fixit-repair').nth(await repairIndex(page, 'free')).click();
      await recordPrimaryStates(page);
      await page.locator('.everyday-bar-primary').click();

      await page.waitForSelector('.everyday-fixit-outcome', { timeout: 120_000 });

      /*
       * A state the primary genuinely passed through, disabled and named, between the press and the
       * outcome below. Read off {@link recordPrimaryStates}'s recording rather than polled for —
       * see its docstring for why a poll issued after the press cannot see a state that only exists
       * while the main thread is busy.
       *
       * **It is not the assertion that the defer works, and an earlier draft of this comment said
       * it was.** A `MutationObserver` reports DOM *writes*, and the relabel is written in the click
       * handler whether or not the defer puts a paint after it — so this case passes against a
       * screen with the `requestAnimationFrame` wrapper removed, which was measured rather than
       * reasoned about (`dev/fixit.browser.test.ts#sampleRunFrames` records the run and the probe
       * that does discriminate the two: 0 painted frames carrying the busy label against 1). What
       * this asserts is that the busy state exists and ends, which is the regression worth holding
       * here; the defer's evidence lives with the probe.
       */
      const states = await primaryStates(page);
      const busyAt = states.findIndex((state) => /Running the day/.test(state.label));
      expect(
        busyAt,
        `the § 3.3 primary never went busy: ${JSON.stringify(states)}`,
      ).toBeGreaterThanOrEqual(0);
      expect(states[busyAt]?.disabled, 'the primary was relabelled but stayed pressable').toBe(true);
      // And it came back: a busy state that is the last one recorded is a button left inert.
      expect(busyAt, 'the primary was still busy when the outcome was drawn').toBeLessThan(
        states.length - 1,
      );
      const outcome = await page.evaluate(() => ({
        head: document.querySelector('.everyday-fixit-outcome-head')?.textContent ?? '',
        rows: document.querySelectorAll('.everyday-fixit-outcome-row').length,
        basis: document.querySelector('.everyday-fixit-outcome')?.textContent ?? '',
        primary: (() => {
          const button = document.querySelector<HTMLButtonElement>('.everyday-bar-primary');
          return button === null
            ? null
            : { label: button.textContent ?? '', disabled: button.disabled };
        })(),
        tags: [...document.querySelectorAll('.everyday-fixit-tag')].map((n) => n.textContent ?? ''),
        count: document.querySelector('.everyday-fixit-count')?.textContent ?? '',
      }));

      // A verdict was drawn, with § 10.4's three rows and the basis line under it. What it
      // measured is deliberately not asserted — § D220 § 4.
      expect(outcome.head.trim()).not.toBe('');
      expect(outcome.rows).toBe(3);
      expect(outcome.basis).toContain('one run before, one run after');
      expect(outcome.primary?.disabled).toBe(false);

      /*
       * The § 3.3 primary has moved off `Run the day`, and which way it moved is the run's answer
       * rather than this test's: a passed case reads `Next building` and wears FIXED, a case that
       * did not clear reads `Run it again` and stays OPEN. Asserting one of those would be
       * asserting what the run measured, which this tier does not do — so the pair is asserted
       * as a pair, and the badge is asserted to agree with the label.
       */
      const solved = outcome.primary?.label === 'Next building';
      expect(solved || outcome.primary?.label === 'Run it again').toBe(true);
      expect(outcome.tags.filter((tag) => tag === 'FIXED')).toHaveLength(solved ? 1 : 0);
      expect(outcome.count).toBe(
        `${String(solved ? 1 : 0)}/${String(outcome.tags.length)} fixed`,
      );
    } finally {
      await page.close();
    }
  });

  it('leaves through the bar’s left button, and nothing but the repairs, the editor and the primary is clickable', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);
      /*
       * § 20.9's check, verbatim: *"nothing on the fix screen is clickable except repairs, the
       * editor, and the primary."* The dead diagnosis quiz is what that clause deleted, so the
       * assertion is over the screen's own buttons — the case rail (navigation), the repair and
       * extra toggles, and the two machinery steppers' four buttons. No candidate list, no
       * pick-the-cause row.
       */
      const controls = await page.evaluate(() => {
        const root = document.querySelector('.everyday-fixit');
        const classesOf = (node: Element): string => node.className;
        return [...(root?.querySelectorAll('button') ?? [])].map(classesOf);
      });
      const allowed = /everyday-fixit-(case|repair|extra|step-up|step-down)/;
      expect(controls.filter((className) => !allowed.test(className))).toEqual([]);

      // And the way out is the bar's, not an Escape and not a close button on the screen.
      await page.keyboard.press('Escape');
      expect(await page.locator('.everyday-fixit').count()).toBe(1);
      await page.locator('.everyday-bar-leave').click();
      await page.waitForFunction(
        () => document.querySelectorAll('.everyday-mode').length === 4,
        undefined,
        { timeout: 15_000 },
      );
      expect(await page.locator('.everyday-fixit').count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
