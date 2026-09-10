/**
 * **Every mode, completed with the keyboard alone** — GitHub issue **#404**, `docs/36` § 5.2.
 *
 * ## What was missing, verified before anything here was written
 *
 * #239's third acceptance criterion is one line — *every mode is completable using the keyboard
 * alone* — and nothing in the tree decided it. `dev/keyboard.browser.test.ts` drives the **Engineer**
 * transport's focus order and says so in its own docstring; on the Everyday side, across the
 * twenty-six `everyday/*.browser.test.ts` files that stood before this one, the only key presses at
 * all were two `Escape`s (`fixitScreen`, `smallScreen`) and a `Control+Enter` (`autoFile`), none of
 * which completes anything. Focus order was checked;
 * **completion** was not, and a mode is not completable because its controls are in a sensible
 * order. Every other journey in this tier — `rush.browser.test.ts`, `campaignJourney.browser.test.ts`,
 * `dailyLoop.browser.test.ts` — reaches its result with `locator.click()`.
 *
 * ## What a journey is, and where the definition comes from
 *
 * `docs/36` § 5.2 wrote it down before anybody could drive one, and this file is written against it
 * clause by clause. A journey names four things:
 *
 * 1. **The start state** — a screen key from `screens.ts#SCREEN_NAMES` plus a context from
 *    `types.ts#RUN_CONTEXTS`. Every journey below starts at `menu` / `daily`, which is where a cold
 *    load lands (§ 3.5 forbids an entry screen that survives a reload), and the tile is what sets
 *    the context.
 * 2. **The acts, as keystrokes and nothing else.** No `page.click`, no `locator.click`, no
 *    `element.focus()`, no helper that reaches into the shell. That is not left to discipline:
 *    {@link it}'s last case reads **this file's own source** and fails on any of those verbs, so a
 *    later edit that reaches for a pointer to get past a stuck step fails instead of passing
 *    quietly. § 5.2 puts it sharply — *"if the journey needs a helper the player does not have, the
 *    journey has proved the opposite of what it set out to."*
 * 3. **The end state, as an observable the mode itself defines.** Not *the screen changed*: a
 *    scored day carries a verdict line and goal rows, a career day moves the record the desk
 *    prints, and a rush lands on its own result sheet with an outcome on it.
 * 4. **What the player can read at every step** — `AX-1` and `AX-16` arriving *inside* the journey.
 *    Every control a journey presses is required to have a non-empty accessible name at the moment
 *    it is pressed, recorded by {@link pressFocused} rather than asserted at the end, so a screen
 *    that is navigable and mute fails here rather than passing half a clause.
 *
 * ## The mode list is derived, because this document has already gone stale once
 *
 * § 5.2 said *"the modes are `everyday/modes.ts#EVERYDAY_MODES`: Today's tower, Campaign, Endless
 * rush, Fix a building"* — four names, transcribed. `modes.ts` holds **three**: Scenario, Career,
 * Rush, since the product owner's 2026-09-06 re-declaration (`docs/38`, `docs/39`,
 * [§ D525](../../../../DECISIONS.md)–[§ D527](../../../../DECISIONS.md)). The document was corrected
 * on this commit, and the mechanism is what stops it happening again: {@link JOURNEYS} is keyed by
 * `EverydayMode['pick']` and the first case asserts its key set **equals** the picks of
 * `EVERYDAY_MODES` in both directions, so a fourth mode is a failing case rather than a silent gap.
 * That is the discipline `honesty/surfaces.ts` applies to `RUN_CONTEXTS` and
 * `accessibilitySweep.browser.test.ts` applies to `EVERYDAY_SCREENS_BUILT`, for the same reason.
 *
 * ## What #404 had to build, not just measure
 *
 * All three modes turned out to be *reachable* by keyboard: every control on every step is a real
 * `<button>` or `<select>`, so <kbd>Enter</kbd> on a focused tile fires its handler. What was
 * missing was `AX-15` — the way past the chrome. Measured on the shipped bundle before the change,
 * by pressing <kbd>Tab</kbd> and reading `document.activeElement`: the rail's eight rows come first
 * in DOM order on **every** screen, the first control inside the screen region sat nine presses
 * deep, and a mode tile took ten to twelve. There was exactly one skip link in the product and it
 * is in the Engineer markup targeting `#stage` — `inert` while Everyday Mode has the page, so not
 * even a tab stop. `shell.ts` now draws `types.ts#SHELL_SKIP_LABEL` as the first focusable element
 * of the Everyday root and makes the screen region a `main` with an id and `tabindex="0"`; the
 * fourth case below is the before-and-after, driven.
 *
 * That second half also closed `accessibilitySweep.browser.test.ts`'s registered
 * `scrollable-region-focusable` finding, whose recorded reason was a precondition on **this file**
 * existing. The entry is deleted there, by its own ghost check.
 *
 * ## Cost, stated rather than glossed
 *
 * **3.9 s for six cases on a quiet box, and 34.6 s of the same six under load** — both measured on
 * this host on 2026-09-10, and the pair is given because only the pair says anything.
 * `vitest.config.ts`'s governing condition is *under load*, and the second figure is this file run
 * beside a full `--project viz-browser` sweep. Quiet, the cases are 1.13 s (Scenario), 0.89 s
 * (Career), 0.78 s (Rush), 1.12 s (`AX-15`) and two that need no page at all.
 *
 * That is far cheaper than it looks like it should be, and the reason is worth saying rather than
 * leaving as a surprise: two of the three journeys **do** wait a real shift out on
 * `dev/shiftRunner.ts`'s worker, and `garden-apartments` at the shipped duration simulates in well
 * under a second. What the journeys wait for is a label — *Close the day* appears exactly when there
 * is a recording to close — so no case here spins a timer.
 *
 * **No case here carries a timeout annotation at all, and that is a decision rather than an
 * omission.** Two of the three journeys simulate, and the tier's habit is to annotate a simulating
 * browser case at 300 000 ms — `campaignJourney.browser.test.ts` does. But `testCost.test.ts` holds
 * the above-ceiling population as a ratchet that may only fall, on GitHub issue #344's fourth
 * criterion: *a case may not be annotated upward to satisfy a budget*. Against the `viz-browser`
 * project's own 120 000 ms the slowest case here has **106× headroom** quiet, and the load figure
 * above is an 8.8× amplification of the whole file — which puts that same case near 10 s, still
 * twelve times under the ceiling. Raising a ratchet for that would be exactly what the criterion
 * forbids, so the ceiling is left to do its job. The `beforeAll` hook keeps the tier's shared
 * 120 000 ms, because a Vite build and a browser launch are not this file's cost.
 *
 * Gate and pattern are `shell.browser.test.ts`'s; the artifact is `dist-web/` through
 * `startShippedSite`, like the rest of the tier (§ D425).
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

import { EVERYDAY_MODES } from './modes.js';
import type { EverydayMode } from './types.js';
import { EVERYDAY_SCREEN_REGION_ID, SHELL_SKIP_LABEL } from './types.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5240, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/* ========================================================================== *
 * The keyboard, and nothing but the keyboard
 * ========================================================================== */

/**
 * What is focused now, as `tag.class` plus its accessible name.
 *
 * The name is computed the way an assistive technology would take it for the controls this product
 * draws — `aria-label`, then `aria-labelledby`, then the rendered text — rather than by asking axe,
 * because this file's claim is about a **journey** and injecting a rule set per press would make
 * every case an axe run. `accessibilitySweep.browser.test.ts` is where the rule set lives; what is
 * needed here is § 5.2 clause 4's much narrower question: did the thing the player just pressed say
 * anything at all.
 */
async function focused(page: Page): Promise<{ selector: string; name: string }> {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (node === null || node === document.body) return { selector: 'body', name: '' };
    const element = node as HTMLElement;
    const labelledBy = element.getAttribute('aria-labelledby');
    const fromIds =
      labelledBy === null
        ? ''
        : labelledBy
            .split(/\s+/u)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ');
    const name = (
      element.getAttribute('aria-label') ??
      (fromIds === '' ? (element.textContent ?? '') : fromIds)
    )
      .replace(/\s+/gu, ' ')
      .trim();
    const cls = element.className === '' ? '' : `.${element.className.split(/\s+/u).join('.')}`;
    return { selector: `${element.tagName.toLowerCase()}${cls}`, name };
  });
}

/**
 * Press <kbd>Tab</kbd> until the focused element matches, then say how many presses it took.
 *
 * Throws rather than returning a sentinel, and the message carries where focus ended up: a journey
 * that cannot reach its next control has found the defect this file exists for, and the useful
 * output is *which* control and *what the player was looking at instead*.
 *
 * `Shift+Tab` is deliberately not offered. A control a player can only reach by tabbing backwards
 * past it first is reachable, and saying so would weaken the measurement in {@link JOURNEYS} that
 * the fourth case reads.
 */
async function tabTo(page: Page, selector: string, limit = 40): Promise<number> {
  const seen: string[] = [];
  for (let presses = 1; presses <= limit; presses += 1) {
    await page.keyboard.press('Tab');
    const here = await focused(page);
    seen.push(here.selector);
    if (await page.evaluate((sel) => document.activeElement?.matches(sel) === true, selector)) {
      return presses;
    }
  }
  throw new Error(
    `no keyboard path to ${selector} in ${String(limit)} presses of Tab. ` +
      `Focus visited: ${seen.join(' → ')}`,
  );
}

/**
 * <kbd>Tab</kbd> until focus is on an **element** rather than on `body`, and say what it landed on.
 *
 * *The first tab stop* has to be measured this way rather than by counting to one: a freshly loaded
 * Chromium page reports `document.body` as `activeElement`, and the first press moves the focus
 * navigation starting point into the document before it settles on anything. Asserting *press one
 * lands on the skip link* would then be asserting a fact about the driver.
 */
async function firstFocusable(page: Page, limit = 5): Promise<{ selector: string; name: string }> {
  for (let presses = 1; presses <= limit; presses += 1) {
    await page.keyboard.press('Tab');
    const here = await focused(page);
    if (here.selector !== 'body') return here;
  }
  throw new Error(`${String(limit)} presses of Tab reached no focusable element at all`);
}

/**
 * Reach a control by <kbd>Tab</kbd> and activate it with <kbd>Enter</kbd> — and assert, at the
 * moment of the press, that it has a name.
 *
 * That assertion is § 5.2's fourth clause and it lives **here** rather than in a sweep at the end
 * for the reason § 5.2 gives: *"a mode completable by a sighted keyboard user and opaque to a
 * non-visual one has passed half a clause."* A journey that navigates through an unnamed control has
 * not proved the mode is completable without sight, so it fails on the step rather than at the end.
 */
async function pressFocused(page: Page, selector: string): Promise<number> {
  const presses = await tabTo(page, selector);
  const here = await focused(page);
  expect(
    here.name,
    `${selector} carries no accessible name, so a player who does not point cannot know what they ` +
      'are about to press — `docs/36` § 5.2 clause 4, AX-1 and AX-16.',
  ).not.toBe('');
  await page.keyboard.press('Enter');
  return presses;
}

/** A cold load, settled: the Engineer menu dismissed, the Everyday shell drawn. */
async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForSelector('.everyday-tutorial, .everyday-mode[data-screen]', {
    timeout: 30_000,
  });
  return page;
}

/**
 * § D529's two-screen tutorial stands in front of the front door on a first session, and it is left
 * by the bar's own leave row — by keyboard, like everything else here.
 *
 * The tier's shared `leaveTutorialIfOffered` clicks, so it may not be used from this file.
 */
async function leaveTutorial(page: Page): Promise<void> {
  if ((await page.locator('.everyday-tutorial').count()) === 0) return;
  await pressFocused(page, '.everyday-bar-leave');
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
}

/** § 3.3's primary, waited out by its own label rather than by a timer, then pressed. */
async function pressPrimaryWhenItReads(page: Page, label: string): Promise<void> {
  await page.waitForFunction(
    (want) => document.querySelector('.everyday-bar-primary')?.textContent === want,
    label,
    { timeout: 120_000 },
  );
  await pressFocused(page, '.everyday-bar-primary');
}

/* ========================================================================== *
 * The journeys — one per shipped mode, keyed by the pick the tile commits to
 * ========================================================================== */

/**
 * What a completed journey hands back: what the mode's **own** result said, as strings the case
 * that owns the mode then asserts on.
 *
 * A record rather than a shape per mode, because the three results have nothing in common — a day
 * report, a desk's month card and a rush sheet — and inventing a common shape would mean deciding
 * here what each mode's result *is*, which is the mode's business and § 5.2 clause 3's whole point.
 */
type Completion = Readonly<Record<string, string>>;

type ModePick = EverydayMode['pick'];

/**
 * One journey per mode. The key is the tile's `pick`, and the first case asserts this record's keys
 * equal `EVERYDAY_MODES`'s picks in both directions.
 *
 * Each entry drives the mode from the front door to its own result and returns what that result
 * says. Nothing here reads a metric — § D220 § 4 — and nothing pins which *mark* a run earns:
 * `campaignJourney.browser.test.ts` states the reason, which is that a verdict pinned in a browser
 * is a fact about the simulator asserted through the wrong instrument.
 */
const JOURNEYS: Readonly<Record<ModePick, (page: Page) => Promise<Completion>>> = Object.freeze({
  /*
   * **Scenario** — § D525's first tile and § 2.1's *"the only mode a first-time player should
   * meet"*. Its hub offers today's scenario and the fix cases; this journey takes today's, because
   * that is the entry whose end state § 5.2 already defines (*a scored day*) and the one that runs
   * a real shift rather than reading an authored case.
   *
   * Menu tile → the hub → *Today's scenario* → the front door → the brief → the stage → the report.
   */
  scenario: async (page) => {
    await pressFocused(page, '.everyday-mode[data-screen="scenario"]');
    await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
    await pressFocused(page, '.everyday-scenario-entry[data-entry="today"]');
    await page.waitForSelector('.everyday-door', { timeout: 15_000 });
    await pressPrimaryWhenItReads(page, 'Set up today');
    await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
    await pressPrimaryWhenItReads(page, 'Start the day');
    await page.waitForSelector('.everyday-stage-canvas', { timeout: 60_000 });
    await pressPrimaryWhenItReads(page, 'Close the day');
    await page.waitForSelector('.everyday-report-title', { timeout: 60_000 });
    return page.evaluate(() => ({
      title: document.querySelector('.everyday-report-title')?.textContent ?? '',
      verdict: document.querySelector('.everyday-report-verdict')?.textContent ?? '',
      goals: String(document.querySelectorAll('.everyday-report-goal').length),
    }));
  },

  /*
   * **Career** — the campaign as built, and its own result is a *judged* day rather than a screen.
   *
   * Menu tile → the triage board → *Look in* → the building's desk → the contract sheet → *Lock it
   * in and run day N* → the stage → *Close the day* → the report, and then back to the desk, which
   * is where the record a player reads actually moves.
   *
   * The desk's month card is read before and after for that reason: reaching the report proves the
   * screen changed, and only the desk proves the day was **judged**. Which mark it got is the run's
   * business — `campaignJourney.browser.test.ts` § "what it deliberately does not" — so what is
   * asserted is that exactly one of cleared and missed moved.
   */
  campaign: async (page) => {
    await pressFocused(page, '.everyday-mode[data-screen="towers"]');
    await page.waitForSelector('.everyday-towers', { timeout: 15_000 });
    await pressFocused(page, '.everyday-towers-open');
    await page.waitForSelector('.everyday-building', { timeout: 15_000 });
    const before = (await page.textContent('.everyday-building-month')) ?? '';
    await pressFocused(page, '.everyday-building-to-contract');
    await page.waitForSelector('.everyday-contract', { timeout: 15_000 });
    await pressPrimaryWhenItReads(page, 'Lock it in and run day 1');
    await page.waitForSelector('.everyday-stage-canvas', { timeout: 60_000 });
    await pressPrimaryWhenItReads(page, 'Close the day');
    await page.waitForSelector('.everyday-report', { timeout: 60_000 });
    /* The report's own way back to the desk — § 8's progression step, and a keyboard press. */
    await pressFocused(page, '.everyday-bar-primary');
    await page.waitForSelector('.everyday-building', { timeout: 30_000 });
    return { before, after: (await page.textContent('.everyday-building-month')) ?? '' };
  },

  /*
   * **Rush** — one climbing day, ended by hand on its own result sheet.
   *
   * Menu tile → the setup screen → *Start the rush* → the stage in the `rush` context → *End the
   * rush* → `.everyday-rush-result`. It is ended at the first wave rather than played to the
   * overflow, which is exactly what `rush.browser.test.ts` does with a pointer and for the same
   * reason: the mode's own result screen is the observable § 5.2 asks for, and both of its outcomes
   * draw it. The `stopped` outcome is the one a hand-ended run produces and it is asserted as such,
   * so a build that lost the early exit fails here rather than hanging until the ceiling.
   */
  rush: async (page) => {
    await pressFocused(page, '.everyday-mode[data-screen="rush"]');
    await page.waitForSelector('.everyday-rush-driving', { timeout: 15_000 });
    await pressPrimaryWhenItReads(page, 'Start the rush');
    await page.waitForFunction(
      () => /^WAVE \d+$/u.test(document.querySelector('.everyday-stage-phase')?.textContent ?? ''),
      undefined,
      { timeout: 60_000 },
    );
    await pressPrimaryWhenItReads(page, 'End the rush');
    await page.waitForSelector('.everyday-rush-result', { timeout: 15_000 });
    return page.evaluate(() => ({
      outcome: document.querySelector<HTMLElement>('.everyday-rush-result')?.dataset['outcome'] ?? '',
      head: document.querySelector('.everyday-rush-result-head')?.textContent ?? '',
    }));
  },
});

describe.skipIf(!HAS_BROWSER)('every mode is completable with the keyboard alone — issue #404', () => {
  it('has a journey for every mode `modes.ts` ships, and none for a mode it does not', () => {
    /*
     * Both directions, on `accessibilitySweep.browser.test.ts`'s route-set precedent. A fourth mode
     * is a failing case here; a mode that leaves `EVERYDAY_MODES` is one too. This is the assertion
     * that would have caught `docs/36` § 5.2 transcribing four mode names that are now three.
     */
    expect(Object.keys(JOURNEYS).sort()).toEqual([...EVERYDAY_MODES].map((m) => m.pick).sort());
  });

  it('reaches the day report of Scenario’s own scenario, scored, on key presses alone', async () => {
    const page = await coldLoad();
    try {
      await leaveTutorial(page);
      const done = await JOURNEYS.scenario(page);
      /*
       * A *scored* day rather than a screen that changed: § 6's report draws a verdict line and one
       * row per goal, and `shift/goals.ts#goalsForDay` returns five. Asserted as *more than none*
       * rather than as five, because the count is that module's business and a literal here would
       * be a second copy of it.
       */
      expect(done['title'] ?? '').toMatch(/day \d+/u);
      expect(done['verdict'] ?? '').not.toBe('');
      expect(Number(done['goals'] ?? '0')).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  });

  it('runs and files a Career day, and the record the desk prints moves, on key presses alone', async () => {
    const page = await coldLoad();
    try {
      await leaveTutorial(page);
      const done = await JOURNEYS.campaign(page);
      const marks = (text: string): { day: number; marked: number } => {
        const day = /day (\d+)/u.exec(text)?.[1];
        const cleared = /(\d+)\s*cleared/u.exec(text)?.[1];
        const missed = /(\d+)\s*missed/u.exec(text)?.[1];
        if (day === undefined || cleared === undefined || missed === undefined) {
          throw new Error(`the desk's month card did not draw its three figures: ${text}`);
        }
        return { day: Number(day), marked: Number(cleared) + Number(missed) };
      };
      const before = marks(done['before'] ?? '');
      const after = marks(done['after'] ?? '');
      expect(before).toEqual({ day: 1, marked: 0 });
      /* Judged, and which mark is the run's business — `campaignJourney.browser.test.ts`'s rule. */
      expect(after).toEqual({ day: 2, marked: 1 });
    } finally {
      await page.close();
    }
  });

  it('starts and ends a Rush on its own result sheet, on key presses alone', async () => {
    const page = await coldLoad();
    try {
      await leaveTutorial(page);
      const done = await JOURNEYS.rush(page);
      expect(done['outcome'] ?? '').toBe('stopped');
      expect(done['head'] ?? '').toMatch(/^You stopped at wave \d+/u);
    } finally {
      await page.close();
    }
  });

  /**
   * `AX-15`, driven — the way past the rail, and what it was worth.
   *
   * Two claims, and both are measurements rather than assertions that an element exists:
   *
   * - The skip link is the **first** tab stop of the Everyday root, which is what `UX.md` KB-01 asks
   *   of a skip link and the only property that makes one useful.
   * - One press of <kbd>Enter</kbd> on it puts focus **inside** the screen region, so the rail's
   *   eight rows are skipped rather than merely skippable. The number of presses it saves is
   *   measured here rather than quoted from a docstring: the run reports how deep the first control
   *   inside the region sits when a player tabs past the chrome, and requires the skip route to be
   *   shorter.
   */
  it('puts a skip link first and lands focus in the screen region — AX-15', async () => {
    /*
     * **Both arms run on a cold load, and neither leaves the tutorial first.** That is not
     * convenience: pressing anything moves Chromium's *sequential focus navigation starting point*
     * to wherever the pressed control was, and a control the shell has since redrawn away leaves
     * the next <kbd>Tab</kbd> resuming from the middle of the document. Measured — the same
     * assertion read 2 rather than 1 for exactly that reason. A cold page has no starting point, so
     * `first tab stop` means what it says. § D529's tutorial is up on a first session and the skip
     * link is shell chrome drawn on every screen, so the claim is the same claim.
     */
    const page = await coldLoad();
    try {
      const first = await firstFocusable(page);
      expect(
        first.selector,
        'the skip link is not the first tab stop, so it is not a skip link — `UX.md` KB-01',
      ).toContain('everyday-skip');
      expect(first.name).toBe(SHELL_SKIP_LABEL);

      /*
       * And it is **visible** while it has focus. A skip link is hidden until focused by design —
       * this one the `.sr-only` way, a 1 px clipped box, because a full-size box parked at
       * `left:-9999px` is a control outside the page and `viewportGates.browser.test.ts` says so in
       * six cases. Hidden is only half of it: a sighted keyboard player has to be able to see where
       * focus went, which is `AX-11`'s subject and is the half a `width:1px` box gets wrong if the
       * focus handler is ever dropped. Measured on the box rather than on the style, so it holds
       * however the swap is implemented.
       */
      const shown = await page.evaluate(() => {
        const box = document.activeElement?.getBoundingClientRect();
        return box === undefined
          ? { w: 0, h: 0, onScreen: false }
          : {
              w: box.width,
              h: box.height,
              onScreen:
                box.left >= 0 &&
                box.top >= 0 &&
                box.right <= window.innerWidth &&
                box.bottom <= window.innerHeight,
            };
      });
      expect(
        shown,
        'the skip link does not become visible when it takes focus, so a sighted keyboard player ' +
          'cannot see where focus went — `docs/36` `AX-11`',
      ).toMatchObject({ onScreen: true });
      expect(shown.w).toBeGreaterThan(40);
      expect(shown.h).toBeGreaterThan(12);

      await page.keyboard.press('Enter');
      expect(
        await page.evaluate((id) => document.activeElement?.id === id, EVERYDAY_SCREEN_REGION_ID),
        'Enter on the skip link did not move focus to the screen region',
      ).toBe(true);

      /*
       * And it actually skips something. One press from the region is inside the screen; the same
       * control the long way round is behind the whole rail, and the two are compared rather than
       * either being asserted against a number — a rail that grows or loses a row should not make
       * this case red, and a rail that stops being traversed first should.
       */
      /*
       * **Exactly one `main` is exposed, and no rule in the gate would say so.** The screen region
       * became a `main` on the same commit as the skip link, and the document already held one —
       * `index.html`'s `<main class="stagecol">` on the Engineer surface. Two `main` elements is
       * `landmark-one-main`, which axe classifies `best-practice`, so it is outside
       * `accessibilitySweep.browser.test.ts`'s WCAG tag set by that file's own § 2 item 2. What
       * makes the pair correct is that the world without the page is covered — `inert` on the
       * Engineer side, `inert` and `aria-hidden` on the Everyday one — and that is a property of
       * `shell.ts`'s cover rather than of the markup, so it is asserted here, on the page, rather
       * than argued in a docstring. Both closures are checked because the two sides are written by
       * two different functions and only one of them writes both attributes.
       */
      /*
       * **Read once the reading has settled, and settled is not the same as correct.**
       *
       * This was a single `evaluate` and it was **flaky — one failure in three local runs, and one
       * on CI**. The Engineer root's cover is written during `dev/main.ts`'s boot, so a read that
       * lands before it sees two exposed `main` elements and reports a defect the page does not
       * have a moment later. `coldLoad` waits for the overlay and for a screen, and neither of
       * those is the cover.
       *
       * The wait is for **two consecutive readings to agree across a frame**, never for
       * `exposed === 1`. That distinction is the whole of it: waiting for the value would make a
       * product that genuinely exposes two landmarks time out instead of failing, which is the
       * least useful way for this case to go red — the same rule the § 7.4 race case states one
       * file over. A page that really exposes two settles at two, and the assertion below fails
       * with the number.
       */
      const readLandmarks = async (): Promise<{ total: number; exposed: number }> =>
        page.evaluate(() => {
          const all = [...document.querySelectorAll('main, [role="main"]')];
          return {
            total: all.length,
            exposed: all.filter(
              (node) =>
                node.closest('[inert]') === null && node.closest('[aria-hidden="true"]') === null,
            ).length,
          };
        });

      let landmarks = await readLandmarks();
      for (let settle = 0; settle < 60; settle += 1) {
        await page.evaluate(
          async () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                resolve();
              });
            }),
        );
        const again = await readLandmarks();
        if (again.total === landmarks.total && again.exposed === landmarks.exposed) break;
        landmarks = again;
      }
      expect(landmarks.total).toBeGreaterThan(1);
      expect(
        landmarks.exposed,
        'the document exposes more than one `main` landmark, so a reader who navigates by landmark ' +
          'is offered two and neither is the page',
      ).toBe(1);

      const fromRegion = await tabTo(page, `#${EVERYDAY_SCREEN_REGION_ID} button`);
      expect(fromRegion).toBe(1);

      const longWay = await coldLoad();
      try {
        const withoutSkip = await tabTo(longWay, `#${EVERYDAY_SCREEN_REGION_ID} button`);
        expect(
          withoutSkip,
          'nothing sits between the top of the document and the screen region any more, so this ' +
            'measurement — and the skip link — would mean nothing',
        ).toBeGreaterThan(1 + fromRegion);
      } finally {
        await longWay.close();
      }
    } finally {
      await page.close();
    }
  });

  /**
   * The clause `docs/36` § 5.2 puts second, mechanised against this file's own source.
   *
   * *"The acts, as keystrokes and nothing else. No `page.click`, no direct focus call, no helper
   * that reaches into the shell."* A journey that quietly acquired a `locator.click()` to get past a
   * step that stopped working would still be green and would have stopped proving anything, which is
   * the exact shape `CLAUDE.md` records for a helper going stale and leaving this tier red in 25
   * cases while the product worked.
   *
   * It reads the file rather than trusting a review, on `browserTier.test.ts`'s precedent — that
   * guard derives which project is the gated tier by grepping this tier's own sources. The tier's
   * shared `leaveTutorialIfOffered` and `openScenarioEntry` helpers both click, which is why this
   * file has its own {@link leaveTutorial} and inlines the hub's two presses rather than importing
   * them.
   */
  it('drives nothing but the keyboard, checked against its own source', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL(import.meta.url), 'utf8');
    /*
     * **Comments are stripped first, and the verbs are assembled rather than written.** Both are
     * necessary or the guard fires on itself: this file discusses the verbs it forbids in prose all
     * the way down, and a literal `'.' + 'click' + '('` in the list below would be a match inside
     * the list. Assembling them also means the scan can never drift from the names.
     */
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/[^\n]*/gu, ' ');
    const forbidden = [
      ...['click', 'dblclick', 'tap', 'hover', 'selectOption', 'fill', 'dispatchEvent'].map(
        (verb) => `.${verb}(`,
      ),
      ...['mouse', 'touchscreen'].map((device) => `page.${device}`),
    ];
    expect(
      forbidden.filter((verb) => code.includes(verb)),
      'a journey that reaches for a pointer has proved the opposite of what it set out to — ' +
        '`docs/36` § 5.2 clause 2',
    ).toEqual([]);
    /*
     * And the guard is not vacuous, asserted two ways. The verbs it looks for are the ones this
     * tier really uses — `rush.browser.test.ts` reaches the same rush result with the first of
     * them — and the stripper still leaves this file's own code behind, so a scan of an
     * accidentally-empty string cannot pass.
     */
    expect(forbidden).toContain(`.${'click'}(`);
    expect(code).toContain('keyboard');
  });
});
