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

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openPage,
  openScenarioEntry,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import {
  BLOCKED_FRAME_GAP_MS,
  frameDisabled,
  frameLabels,
  frameReading,
  paintedBusyFrame,
  recordFrames,
} from '../dev/mainThreadFrames.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  // A port of its own, `strictPort: false` — files in one project run concurrently.
  site = await startShippedSite({ preview: { port: 5651, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A cold load, waited out to the point where the Engineer menu has been dismissed. */
async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments`, { waitUntil: 'load' });
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
  await openScenarioEntry(page, 'fix-a-building');
  await page.waitForFunction(
    () => document.querySelectorAll('.everyday-fixit-case').length > 0,
    undefined,
    { timeout: 60_000 },
  );
  /*
   * And wait for the first case's four figures.
   *
   * Since GitHub issue #165 the as-built run those figures are measurements of happens on a
   * worker, so a case-rail row existing no longer means the screen has its numbers — it means the
   * case file loaded. This walk is *open the screen and let it settle*, so the honest latch is the
   * last thing the open produces. The screen's own busy state is asserted by the cases that watch
   * a **second** case being opened, where the transient is the subject rather than the wait.
   */
  /*
   * GitHub issue #348: the case opens on the as-built run **played**, and the four figures are
   * stated only once it has been watched or skipped. This walk skips it, so the cases below start
   * where they always did — on the figures. The case that is *about* the stage is the one that
   * does not skip.
   */
  await skipTheOpeningRun(page);
}

/**
 * Press past a case's opening run and land on its four figures — the player's own control.
 *
 * GitHub issue #348 opens **every** case on its as-built run played, and states the four figures
 * only once that run has been watched or skipped. The sight is offered **once per case**, which
 * `fixitScreen.ts#CaseSession.asBuiltSeen` says in terms — so a case opened *second* opens on a
 * sight of its own, and a driver that merely waited for its figures would be waiting out a whole
 * simulated morning.
 *
 * **How long that wait is now, and why this is a helper rather than a longer budget.**
 * [§ D641](../../../../DECISIONS.md) moved `stageScreenModel.ts#DEFAULT_STAGE_SIM_PER_REAL_S` from
 * `30×` to `4×` — § D525 clause 4's watching rung. These cases are authored on a 1 800 s morning,
 * so the opening block that took **60 s** to play through now takes **450 s**. The two cases below
 * that open a second case used to sit through it inside this tier's 120 s budget and cannot any
 * more: both timed out on the shipped bundle, and a probe of the same walk found the block still up
 * and the grid still empty at 60 s, which is the shape of a run playing rather than a run stuck.
 *
 * Raising the budget would buy a tier that spends fifteen minutes watching a run no player watches,
 * and would hide the next real stall behind it. Pressing *Skip to the figures* is what a player
 * does, it is what {@link openFixit} has done for the first case since #348 landed, and it leaves
 * both cases asserting exactly what they asserted before — the busy state on a painted frame, and a
 * figure grid that never draws a partial reading.
 */
async function skipTheOpeningRun(page: Page): Promise<void> {
  await page.waitForSelector('.everyday-fixit-skip', { timeout: 120_000 });
  await page.click('.everyday-fixit-skip');
  await page.waitForFunction(
    () => document.querySelectorAll('.everyday-fixit-figure').length === 4,
    undefined,
    { timeout: 120_000 },
  );
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

/**
 * What the pair block and the verdict beside it read, in one evaluate.
 *
 * One round trip rather than five, and — more to the point — **one instant**: the claim these cases
 * make is that the sight and the verdict are on the page *together*, and reading them in separate
 * evaluates would be reading them at two moments and asserting about neither.
 */
async function pairAndVerdict(page: Page): Promise<{
  readonly text: string;
  readonly pairs: number;
  readonly outcomes: number;
  readonly asBuiltStages: number;
  readonly fixedTags: number;
  readonly primaryLabel: string;
}> {
  return page.evaluate(() => ({
    text: document.querySelector('.everyday-fixit-pair')?.textContent ?? '',
    pairs: document.querySelectorAll('.everyday-fixit-pair').length,
    outcomes: document.querySelectorAll('.everyday-fixit-outcome').length,
    asBuiltStages: document.querySelectorAll('.everyday-fixit-stage').length,
    fixedTags: [...document.querySelectorAll('.everyday-fixit-tag')].filter(
      (tag) => tag.textContent === 'FIXED',
    ).length,
    primaryLabel: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
  }));
}

describe.skipIf(!HAS_BROWSER)('the fourth mode tile opens § 10’s screen', () => {
  /**
   * **PM-FB1, GitHub issue #348 — the as-built run plays before the four figures are stated.** Three
   * claims: the stage is up and painting before any figure exists; the skip lands on exactly four
   * figures rather than on nothing; and a case re-opened later opens on the figures, because the
   * sight was seen once. The figures being read from the same recording the stage played is
   * `fixitScreen.ts`'s construction — one `session.asBuilt` — and a run count would be the test of
   * it if the screen could run twice; the worker is asked once per case and the timeline asserts
   * that in the *keeps painting* case below.
   */
  it('plays the as-built run on a stage before the figures, and Skip lands on the figures', async () => {
    const page = await coldLoad();
    try {
      await openScenarioEntry(page, 'fix-a-building');
      await page.waitForSelector('.everyday-fixit-stage-canvas', { timeout: 120_000 });
      // Painting, and no figure yet: the problem arrives as a sight before it is a number.
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector<HTMLCanvasElement>('.everyday-fixit-stage-canvas');
          return canvas !== null && canvas.width > 0 && canvas.height > 0;
        },
        undefined,
        { timeout: 30_000 },
      );
      expect(await page.locator('.everyday-fixit-figure').count()).toBe(0);
      expect(await page.textContent('.everyday-fixit-stage')).toContain('WATCH IT AS IT STANDS');
      await page.click('.everyday-fixit-skip');
      await page.waitForFunction(
        () => document.querySelectorAll('.everyday-fixit-figure').length === 4,
        undefined,
        { timeout: 30_000 },
      );
      expect(await page.locator('.everyday-fixit-stage').count()).toBe(0);
      // Away and back: the figures, not the stage — seen once is seen.
      await page.click('.everyday-rail-menu');
      await leaveTutorialIfOffered(page);
      await page.waitForSelector('.everyday-mode[data-screen="scenario"]');
      await openScenarioEntry(page, 'fix-a-building');
      await page.waitForFunction(
        () => document.querySelectorAll('.everyday-fixit-figure').length === 4,
        undefined,
        { timeout: 30_000 },
      );
      expect(await page.locator('.everyday-fixit-stage').count()).toBe(0);
    } finally {
      await page.close();
    }
  });

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
          held: document.querySelectorAll('.everyday-fixit-case-held').length,
          repairs: document.querySelectorAll('.everyday-fixit-repair').length,
        };
      });
      expect(screen.insideRegion).toBe(true);
      expect(screen.mainShown).toBe('grid');
      // Derived, never asserted: however many cases the file ships, the rail's line counts the
      // rows it drew. Three today, eighteen when the catalogue lands.
      expect(screen.cases).toBeGreaterThan(0);
      /* Out of the cases offered — a held case is drawn and is not one the player can fix (§ D1020). */
      expect(screen.count).toBe(`0/${String(screen.cases - screen.held)} fixed`);
      expect(screen.complaint).toContain('THE COMPLAINT');
      // § 10.1 item 3's four figures and the diagnosis, which § D706 clause 5 keeps; the menu is gone.
      expect(screen.figures).toBe(4);
      expect(screen.diagnosis).toContain('THE DIAGNOSIS');
      expect(screen.repairs).toBe(0);
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

  /**
   * **The menu retired, and the held cases are drawn rather than dropped** — [§ D1020](../../../../DECISIONS.md).
   *
   * No repair row and no standing extra is drawn: the editor is the only way to change the building.
   * A held case is in the rail with its reason, disabled — a row that vanished would be the list
   * shrinking quietly, and one that opened would be a letter nobody can answer honestly.
   */
  it('draws no repair menu, and draws each held case with its reason and no way in', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);
      const drawn = await page.evaluate(() => ({
        repairs: document.querySelectorAll('.everyday-fixit-repair').length,
        extras: document.querySelectorAll('.everyday-fixit-extra').length,
        held: [...document.querySelectorAll<HTMLButtonElement>('.everyday-fixit-case-held')].map((row) => ({
          disabled: row.disabled,
          tag: row.querySelector('.everyday-fixit-tag')?.textContent ?? '',
          reason: row.querySelector('.everyday-fixit-held-reason')?.textContent ?? '',
        })),
        active: document.querySelector('.everyday-fixit-case[aria-current="true"]')?.className ?? '',
      }));
      expect(drawn.repairs).toBe(0);
      expect(drawn.extras).toBe(0);
      expect(drawn.held.length).toBeGreaterThan(0);
      for (const row of drawn.held) {
        expect(row.disabled).toBe(true);
        expect(row.tag).toBe('HELD');
        expect(row.reason).toMatch(/^Held back\./);
      }
      /* The screen never opens on a held case. */
      expect(drawn.active).not.toContain('held');
    } finally {
      await page.close();
    }
  });

  /**
   * **§ D1000's five families and § D1001's tenancy row, on the shipped bundle.** The legs are
   * proved in `fixit/families.test.ts`; what only this tier can show is that the shared mount is on
   * the screen a player opens, that its presses reach the order the Run button spends, and that the
   * tenancy row is drawn on a case with no movable crowd — with its sentence, and nothing to press.
   */
  it('draws the dials, the door hold, the banks and the tenancy row, and a door press moves the spend', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);
      const drawn = await page.evaluate(() => ({
        groups: document.querySelectorAll('.everyday-fixit-dial-group').length,
        dials: document.querySelectorAll('.everyday-fixit-dial select').length,
        door: document.querySelectorAll('.everyday-fixit-door select').length,
        cars: document.querySelectorAll('.everyday-fixit-car select').length,
        tenancy: document.querySelectorAll('.everyday-fixit-tenancy').length,
        none: document.querySelector('.everyday-fixit-tenancy-none')?.textContent ?? '',
        committed: document.querySelector('.everyday-fixit-committed')?.textContent ?? '',
      }));
      expect(drawn.groups).toBe(3);
      expect(drawn.dials).toBeGreaterThan(10);
      /* The target and both sides of the door. */
      expect(drawn.door).toBe(3);
      expect(drawn.cars).toBeGreaterThan(0);
      expect(drawn.tenancy).toBe(1);
      /* The case the screen opens on authors no tenancy, so the row says so and offers nothing. */
      expect(drawn.none.length).toBeGreaterThan(0);
      expect(await page.locator('.everyday-fixit-tenancy select').count()).toBe(0);

      const hall = page.locator('.everyday-fixit-door-hall select');
      await hall.selectOption({ index: 1 });
      await page.waitForFunction(
        (before) => (document.querySelector('.everyday-fixit-committed')?.textContent ?? '') !== before,
        drawn.committed,
        { timeout: 15_000 },
      );
      const committed = await page.evaluate(
        () => document.querySelector('.everyday-fixit-committed')?.textContent ?? '',
      );
      expect(committed).not.toBe(drawn.committed);
    } finally {
      await page.close();
    }
  });

  it('runs the day from the bar’s primary, holds it inert meanwhile, and draws the outcome', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);

      // Nothing changed, which the letter's morning cannot clear: the gate's own verdict, drawn at
      // once, with no mornings run behind it (§ D1020). What it measured is not asserted.
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
      /* A gate that did not clear: no checking state was ever drawn. */
      expect(states.some((state) => /more mornings/.test(state.label))).toBe(false);
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
      /* Out of the cases offered: a held case's row is drawn and is not in the total (§ D1020). */
      expect(outcome.count).toBe(
        `${String(solved ? 1 : 0)}/${String(outcome.tags.filter((tag) => tag !== 'HELD').length)} fixed`,
      );
    } finally {
      await page.close();
    }
  });

  /**
   * **[§ D644](../../../../DECISIONS.md) — the run the player's own change produced is watched.**
   *
   * Until that entry `primary`'s `onDone` bound `([before, after])`, kept `before` and let `after`
   * go out of scope: the day the player bought was simulated, measured and never drawn. Four claims,
   * and the last two are the ones the node tier cannot make:
   *
   * 1. a pair block is up after a press, with **two** canvases, both sized and painting;
   * 2. the block publishes **no figure** — the card under it is the surface allowed to say what the
   *    pair measured, and a second place for one measurement is how a measurement goes stale;
   * 3. the verdict is **not withheld** behind the sight, on **both** branches of the run's own
   *    answer. `session.fixed` badges the rail, `keepSolved` writes the profile and
   *    `bankScenarioClear` files the chime in the statement that lands the run, so a card that
   *    lagged them would be `docs/20` defect 16 — *two verdicts about one case on one screen* —
   *    rebuilt on purpose. The badge and the card are asserted to **agree**, not to read any
   *    particular way (§ D220 § 4);
   * 4. a second press replaces the pair rather than leaving the first press's picture over the
   *    second press's verdict.
   *
   * The first press selects nothing, which is the *did not clear* branch by construction: with no
   * change the two configurations are the same building and the complaint cannot have moved. The
   * second changes where idle cars wait, through the editor — the menu retired on § D1020's commit —
   * and it is asserted to agree with its badge whichever way the fifty mornings go.
   */
  it('plays the pair after a press, on both branches, without withholding the verdict', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);

      /* ---- branch one: nothing bought, so nothing can have been fixed ---- */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-fixit-pair', { timeout: 120_000 });
      await page.waitForFunction(
        () => {
          const canvases = [
            ...document.querySelectorAll<HTMLCanvasElement>('.everyday-fixit-pair-canvas'),
          ];
          return canvases.length === 2 && canvases.every((c) => c.width > 0 && c.height > 0);
        },
        undefined,
        { timeout: 30_000 },
      );

      const unchanged = await pairAndVerdict(page);
      expect(unchanged.text).toContain('WATCH WHAT YOU CHANGED');
      expect(unchanged.text).toContain('As it stands');
      expect(unchanged.text).toContain('With your change');
      // The opening block is gone and this one is not it: the two are addressable apart.
      expect(unchanged.asBuiltStages).toBe(0);
      // Nothing is withheld — the card is on the page beside the sight rather than behind it.
      expect(unchanged.outcomes).toBe(1);
      // No figure anywhere in the block's own words.
      expect(unchanged.text).not.toMatch(/\d/);
      // Nothing bought: the badge cannot read FIXED, and the card and the badge say one thing.
      expect(unchanged.fixedTags).toBe(0);
      expect(unchanged.primaryLabel).toBe('Run it again');

      /* ---- branch two: a change through the editor, and a second press over the first ---- */
      await page.click('.everyday-fixit-pair-skip');
      await page.waitForFunction(
        () => document.querySelectorAll('.everyday-fixit-pair').length === 0,
        undefined,
        { timeout: 30_000 },
      );
      // Skip takes the sight away and leaves the verdict, which is where the press says it goes.
      expect(await page.locator('.everyday-fixit-outcome').count()).toBe(1);

      await page.locator('.everyday-fixit-parking-select').selectOption('stay');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-fixit-pair', { timeout: 120_000 });
      /* A clearing press draws the checking state first; the verdict is the one after it. */
      await page.waitForFunction(
        () => !/more mornings/.test(document.querySelector('.everyday-bar-primary')?.textContent ?? ''),
        undefined,
        { timeout: 240_000 },
      );
      await page.waitForFunction(
        () => {
          const canvases = [
            ...document.querySelectorAll<HTMLCanvasElement>('.everyday-fixit-pair-canvas'),
          ];
          return canvases.length === 2 && canvases.every((c) => c.width > 0 && c.height > 0);
        },
        undefined,
        { timeout: 30_000 },
      );

      const repaired = await pairAndVerdict(page);
      // One block, not two: the second press replaced the first press's picture.
      expect(repaired.pairs).toBe(1);
      expect(repaired.outcomes).toBe(1);
      expect(repaired.text).not.toMatch(/\d/);
      /*
       * The badge agrees with the § 3.3 primary, whichever way this run went — a passed case reads
       * `Next building` and wears FIXED, one that did not reads `Run it again` and does not. What
       * the run measured is not asserted; that the two surfaces say one thing is.
       */
      const solved = repaired.primaryLabel === 'Next building';
      expect(solved || repaired.primaryLabel === 'Run it again').toBe(true);
      expect(repaired.fixedTags).toBe(solved ? 1 : 0);
    } finally {
      await page.close();
    }
  });

  /**
   * **A noise route clears the letter's morning, and the fifty mornings take it away** —
   * [§ D1020](../../../../DECISIONS.md), GitHub issue #602, on the shipped bundle.
   *
   * *Every letter says nine o'clock* is an outpatients' complaint, and under the single pair a
   * three-metre raise of the roof cleared it — the playtest's *slot machine*. The route is taken
   * because `theAnswerIsNotPrinted.test.ts#NOT_REPLICATED` pins it as one that clears the letter's
   * morning and does not hold, so this case asserts the product's side of a measured fact rather
   * than hoping a route misbehaves. Four claims: the press draws the checking state first, disabled
   * and named; it ends; the verdict is `cleared-once`, saying it cleared on this morning only, with
   * the fifty-morning row beside the letter's three; and no FIXED badge, because nothing was banked.
   */
  it('draws cleared-once for a roof raise on the appointment letters, after checking it on forty-nine more mornings', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);
      await page.locator('.everyday-fixit-case', { hasText: 'Every letter says nine' }).click();
      await skipTheOpeningRun(page);
      const up = page.locator('.everyday-fixit-stepper-elevation .everyday-fixit-step-up');
      for (let metre = 0; metre < 3; metre += 1) await up.click();
      expect(await page.locator('.everyday-fixit-stepper-elevation .everyday-fixit-readout').textContent()).toContain('3');

      await recordPrimaryStates(page);
      await page.locator('.everyday-bar-primary').click();
      await page.waitForFunction(
        () => (document.querySelector('.everyday-fixit-outcome-head')?.textContent ?? '').includes('did not hold'),
        undefined,
        { timeout: 300_000 },
      );
      const states = await primaryStates(page);
      const checkingAt = states.findIndex((state) => /more mornings/.test(state.label));
      expect(checkingAt, `the primary never said it was checking: ${JSON.stringify(states)}`).toBeGreaterThanOrEqual(0);
      expect(states[checkingAt]?.disabled).toBe(true);
      expect(checkingAt).toBeLessThan(states.length - 1);

      const verdict = await page.evaluate(() => ({
        head: document.querySelector('.everyday-fixit-outcome-head')?.textContent ?? '',
        card: document.querySelector('.everyday-fixit-outcome')?.textContent ?? '',
        rows: document.querySelectorAll('.everyday-fixit-outcome-row').length,
        fixedTags: [...document.querySelectorAll('.everyday-fixit-tag')].filter((tag) => tag.textContent === 'FIXED').length,
        primary: document.querySelector('.everyday-bar-primary')?.textContent ?? '',
      }));
      expect(verdict.head).toBe('It cleared on the letter’s morning, and it did not hold on the others.');
      expect(verdict.card).toContain('cleared on this morning only');
      expect(verdict.card).toContain('forty-nine more mornings');
      expect(verdict.rows).toBe(4);
      expect(verdict.fixedTags).toBe(0);
      expect(verdict.primary).toBe('Run it again');
    } finally {
      await page.close();
    }
  });

  it('keeps painting through the pair, and through opening a case — GitHub issue #165', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);

      /*
       * Issue #165's acceptance on the surface it called the most exposed, and it is asserted
       * about the **page**: while the runs happen, the browser goes on rendering frames.
       *
       * Both halves are driven, because they failed differently. The press had a busy state and a
       * frozen page behind it — measured on the base commit in the shipped artifact, the longest
       * stretch with no rendered frame was **947 ms over 13 frames**. Opening a case had no busy
       * state at all: it ran inside `mainColumn`, so a player clicking a rail row got a screen that
       * simply stopped — **128 ms** there, on the case the rail happens to offer second.
       *
       * § D220 § 4 still holds. Nothing here reads a figure of a run; a frame gap is a fact about
       * the browser's frame delivery.
       */
      await recordFrames(page, '.everyday-bar-primary');
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-fixit-outcome', { timeout: 120_000 });

      /*
       * A **painted** frame carrying the busy primary — the assertion that needs no threshold, and
       * the one the sibling case above could not make. That case reads a `MutationObserver`
       * recording and says so in its own docstring: an observer reports DOM *writes*, so it passes
       * against a screen whose runs are on the main thread. This is the other instrument.
       */
      const busyAt = await paintedBusyFrame(page, /Running the day/);
      expect(
        busyAt,
        `no rendered frame carried the busy label: ${JSON.stringify(await frameLabels(page))}`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        await frameDisabled(page, busyAt),
        'the § 3.3 primary was relabelled but stayed pressable',
      ).toBe(true);

      const press = await frameReading(page);
      // Both halves: a sampler that never started reports a longest gap of zero, which reads
      // exactly like a page that never stuttered.
      expect(press.frames, 'the frame sampler recorded nothing').toBeGreaterThan(10);
      expect(
        press.longestGapMs,
        `the page stopped painting for ${press.longestGapMs.toFixed(0)} ms over ${String(press.frames)} frames — a run is back on the main thread`,
      ).toBeLessThan(BLOCKED_FRAME_GAP_MS);

      // And opening a second case, which takes an as-built run of its own.
      await recordFrames(page, '.everyday-fixit-measuring');
      await page.locator('.everyday-fixit-case').nth(1).click();
      /* The second case opens on a sight of its own — see {@link skipTheOpeningRun}. The sampler
         runs across the skip, so the window this reads is still the one the open produced. */
      await skipTheOpeningRun(page);
      /*
       * The busy state the open run never had, on a painted frame. Before the move this ran inside
       * `mainColumn`, so a player clicking a rail row got a screen that simply stopped and there
       * was no state to draw — nothing could have painted one.
       */
      const measuringAt = await paintedBusyFrame(page, /Measuring the building/);
      expect(
        measuringAt,
        `no rendered frame said the case was being measured: ${JSON.stringify(await frameLabels(page))}`,
      ).toBeGreaterThanOrEqual(0);

      const open = await frameReading(page);
      /*
       * A lower floor than the press's, because the window is shorter: one small run rather than a
       * pair, so the sampler gets a handful of frames rather than a hundred and fifty. The floor
       * exists only to make the gap below meaningful — a reading of nought or one frame has no gap
       * in it — and the weight on this half is carried by the painted measuring frame above, which
       * needs no threshold at all.
       */
      expect(open.frames, 'the frame sampler recorded nothing on the open').toBeGreaterThan(2);
      expect(
        open.longestGapMs,
        `opening a case stopped the page for ${open.longestGapMs.toFixed(0)} ms over ${String(open.frames)} frames`,
      ).toBeLessThan(BLOCKED_FRAME_GAP_MS);
    } finally {
      await page.close();
    }
  });

  it('never draws a blank figure while a case’s as-built run is out', async () => {
    const page = await coldLoad();
    try {
      await openFixit(page);
      /*
       * The complement of the painted-frame assertion above: the grid goes from *nothing, with a
       * sentence in place of the figures* to *four figures*, and never through a partial state. A
       * card with no reading in it is worse than a named absence — this repository's rule about a
       * figure a surface does not have, applied to a transient.
       *
       * A `MutationObserver` rather than a frame sampler, deliberately: this is a claim about what
       * the screen ever *wrote*, and a frame loop would miss an intermediate state that existed
       * between two frames. The two instruments answer different questions and the case above
       * holds the one about paint.
       */
      await page.evaluate(() => {
        const seen: string[] = [];
        const sample = (): void => {
          const grid = document.querySelector('.everyday-fixit-figures');
          if (grid === null) return;
          const measuring = grid.querySelector('.everyday-fixit-measuring');
          const shape = `${String(grid.querySelectorAll('.everyday-fixit-figure').length)}:${measuring === null ? '-' : 'measuring'}`;
          if (seen.at(-1) !== shape) seen.push(shape);
        };
        sample();
        (window as unknown as { __figureShapes?: string[] }).__figureShapes = seen;
        new MutationObserver(sample).observe(document.documentElement, {
          subtree: true,
          childList: true,
          characterData: true,
        });
      });
      await page.locator('.everyday-fixit-case').nth(1).click();
      /*
       * The second case opens on a sight of its own — see {@link skipTheOpeningRun}. The observer
       * is watching the whole document across the skip, so the states this case is about are all
       * still recorded: the grid says *measuring*, then draws nothing while the run is watched,
       * then draws four. What it must never write is one, two or three.
       */
      await skipTheOpeningRun(page);
      const shapes = await page.evaluate(
        () => (window as unknown as { __figureShapes?: string[] }).__figureShapes ?? [],
      );
      expect(shapes, 'the grid never announced it was measuring').toContain('0:measuring');
      // It ended: a measuring state that is the last one seen is a grid left saying so.
      expect(shapes.at(-1) ?? '').toBe('4:-');
      // And no partial grid was ever written.
      expect(shapes.filter((shape) => /^[1-3]:/.test(shape))).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it('leaves through the bar’s left button, and nothing but the editor and the primary is clickable', async () => {
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
      /*
       * `floor-chip` joins from § D1000: the rezone's floor toggles are **the editor** — the
       * clause's own second word — and they offer a floor to serve, not a cause to pick, which the
       * direct check below holds.
       */
      /* `repair` and `extra` left this list with the menu — § D1020. */
      const allowed = /everyday-fixit-(case|step-up|step-down|budget-buy|floor-chip)/;
      expect(controls.filter((className) => !allowed.test(className))).toEqual([]);

      /*
       * **`budget-buy` is on that list from wave AF, and the clause it joins is a proxy rather
       * than a whitelist.** § 20.9's subject is *Delete the dead quiz* — `fixGuess` and the
       * rendered candidate list — and its check was written when the quiz was the only thing that
       * could have been clickable besides the three it names. GitHub issue #579's budget rung is a
       * purchase, not a candidate, so it breaks the check's letter and not its intent.
       *
       * Rather than widen a proxy and leave the clause inferred, the clause's **own** content is
       * asserted directly below: no control on this screen offers a diagnosis to pick. That is
       * stronger than the allowlist, because a future quiz named `everyday-fixit-repair-guess`
       * would pass the regex above and fail this.
       */
      const quizLike = await page.evaluate(() => {
        const root = document.querySelector('.everyday-fixit');
        return [...(root?.querySelectorAll('button, input, select') ?? [])]
          .map((node) => `${node.className} ${node.getAttribute('name') ?? ''}`)
          .filter((face) => /guess|candidate|which-|cause-pick|diagnos/iu.test(face));
      });
      expect(quizLike, 'a control offering the diagnosis to pick is back on the fix screen').toEqual(
        [],
      );

      // And the way out is the bar's, not an Escape and not a close button on the screen.
      await page.keyboard.press('Escape');
      expect(await page.locator('.everyday-fixit').count()).toBe(1);
      await page.locator('.everyday-bar-leave').click();
      await page.waitForFunction(
        () => document.querySelectorAll('.everyday-mode').length === 3,
        undefined,
        { timeout: 15_000 },
      );
      expect(await page.locator('.everyday-fixit').count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
