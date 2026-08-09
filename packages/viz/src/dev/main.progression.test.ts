/**
 * The three seams where a run becomes somebody's progress — §§ D231–D233.
 *
 * Two kinds of assertion here, and the split is `main.test.ts`'s own: the decisions that were
 * extracted into pure functions are called directly, and the wiring that necessarily lives inside
 * `boot()` — which no Node test can call, because it needs a document, a canvas and a click — is
 * read off `main.ts` **as text**. That is the pattern the legend's 60 Hz guards already use, and it
 * is the only control available for a closure this size; a text guard is weak evidence about
 * behaviour and strong evidence about a line having been deleted, which is the failure mode these
 * three fixes actually have.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { reportOpensItself } from './main.js';

/** `main.ts` as text. The wiring is inside `boot()`, which no Node test can call. */
async function mainSource(): Promise<string> {
  return readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
}

/** One nested function's body, from its declaration to the first close at its own indent. */
async function bodyOf(name: string): Promise<string> {
  const source = await mainSource();
  const start = source.indexOf(`function ${name}(`);
  expect(start, `main.ts has no ${name}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n  }', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/* -------------------------------------------------------------------------- *
 * § D232 — the game does not play itself
 * -------------------------------------------------------------------------- */

describe('issue #39 — nothing runs itself or counts before the player has chosen', () => {
  it('latches both flags in closeMenu, which is the only way out of the overlay', async () => {
    /*
     * Five arms close the menu — **Start**, **Open the doors**, **Keep going**, the commissioning
     * commit and **Resume**. Latching in `closeMenu` rather than in the five arms is what makes the
     * set complete by construction: a sixth arm that closed the overlay without setting a flag
     * would be a sixth way into the product that could not score.
     *
     * That property survives the issue #117 split, and this case is how: the latches are still both
     * here, and the *distinction* is a **required parameter** with no default, so a sixth arm
     * cannot forget to answer it — `shift/report.ts`'s own `ReportSubject` rule.
     */
    const body = await bodyOf('closeMenu');
    expect(body).toContain('menuHasBeenDismissed = true');
    expect(body).toContain("if (exit === 'entered-a-mode') playerHasChosen = true");
    expect(
      body,
      'closeMenu takes no exit argument, so a new way out of the overlay can no longer be made ' +
        'to say whether it is a mode being entered — which is issue #117 back',
    ).toContain("exit: 'entered-a-mode' | 'changed-their-mind'");
  });

  it('refuses to file a day while the menu has never been dismissed', async () => {
    const body = await bodyOf('closeShift');
    expect(
      body,
      'closeShift no longer guards on playerHasChosen, so a cold load can bank a clean day and ' +
        'clear a contract behind the menu overlay',
    ).toContain('if (!playerHasChosen) return;');
  });

  it('hands the transport autoplay:false until then, so the cold-load footer says paused', async () => {
    /*
     * The other half of #39, and the visible one: the play-tester read `running · 0 arrived,
     * 0 carried` on a page they had not touched. The recording is still made and still drawn — the
     * stage shows the building at 06:00 — it simply does not start moving on its own.
     *
     * Gated on `menuHasBeenDismissed` since issue #117, which is § D232's own rule unchanged: a
     * player who pressed **Resume** has left the menu on purpose and a run they re-roll should
     * play. What moved is the *filing* gate above, not this one.
     */
    const body = await bodyOf('adopt');
    expect(body).toContain('autoplay:');
    expect(
      body,
      'adopt no longer gates autoplay on the overlay having been dismissed, so boot’s run plays ' +
        'behind the menu',
    ).toContain('menuHasBeenDismissed &&');
  });

  it('is not a vacuous guard — both flags are declared above boot’s own sequence', async () => {
    /*
     * `main.test.ts` already enforces the general rule (`let` before the sequence, the TDZ guard
     * that has now been broken four times in this package). This asserts the specific bindings,
     * because a `playerHasChosen` declared *below* `boot()`'s `runShift()` would throw on the line
     * that reads it and the last-resort handler would report *The viewer did not start* — which is
     * how the previous four presented.
     */
    const source = await mainSource();
    const sequence = source.indexOf('\n  restoreSession();');
    expect(sequence).toBeGreaterThan(-1);
    for (const flag of ['let playerHasChosen', 'let menuHasBeenDismissed']) {
      const declared = source.indexOf(flag);
      expect(declared, flag).toBeGreaterThan(-1);
      expect(declared, flag).toBeLessThan(sequence);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Issue #117 — a change of mind is not a choice
 * -------------------------------------------------------------------------- */

describe('issue #117 — pressing Resume does not let boot’s own run count', () => {
  /*
   * ## What was reported
   *
   * *"WHAT MOVED SINCE THE RUN BEFORE THIS ONE compares against a phantom run, so a real
   * improvement reads as a catastrophe."* The baseline was a run the player never started:
   * `was Garden Apartments · Energy aware · seed 212586776783610 · carried 39`, against a 621-rider
   * Chancery House day.
   *
   * ## The seam
   *
   * `boot()` runs a full shift under the menu overlay — on the restored session's building,
   * dispatcher and seed, which is where a phantom's *identity* comes from. § D232 stopped that run
   * counting with one flag, and `closeMenu` latched that flag on **all** its arms, including the
   * one whose own docstring says *"Resume itself starts nothing."* So Escape, then play, and boot's
   * recording filed as a real day and rotated into the Day report's `was` column.
   *
   * The flag was answering two questions: *may this run play?* (yes — the player left the menu on
   * purpose) and *may this run count?* (no — they entered no mode). They are now two flags, and
   * this suite holds the arm that told them apart.
   */
  it('the close arm says it is a change of mind, and it is the only arm that does', async () => {
    const source = await mainSource();
    const dispatch = source.slice(source.indexOf('function dispatchMenu('));
    const changedTheirMind = [...dispatch.matchAll(/closeMenu\('changed-their-mind'\)/g)];
    const enteredAMode = [...dispatch.matchAll(/closeMenu\('entered-a-mode'\)/g)];
    expect(changedTheirMind, 'exactly one way out of the menu is not a mode being entered').toHaveLength(1);
    expect(enteredAMode.length, 'the other ways out still enter a mode').toBeGreaterThanOrEqual(3);
    // And it is the `close` arm — the one **Resume** and Escape press (issue #40), not another.
    const closeArm = dispatch.slice(
      dispatch.indexOf("case 'close':"),
      dispatch.indexOf("case 'open-campaign':"),
    );
    expect(closeArm).toContain("closeMenu('changed-their-mind')");
  });

  it('leaves no unqualified closeMenu() anywhere — the distinction cannot be skipped', async () => {
    /*
     * A text guard for a property the compiler already holds (`exit` is required), and it is here
     * for the case the compiler cannot see: somebody re-widening the parameter with a default. The
     * comments come out first, because this file's prose quotes the shipped form it replaced.
     */
    const source = (await mainSource()).replaceAll(/\/\*[\s\S]*?\*\//g, '');
    expect(source).not.toMatch(/closeMenu\(\s*\)/);
    expect(source, 'a default on `exit` is the one-flag bug with an extra step').not.toMatch(
      /exit\s*:\s*'entered-a-mode'\s*\|\s*'changed-their-mind'\s*=/,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * § D232 — a navigation is not a progression event
 * -------------------------------------------------------------------------- */

describe('issue #39 / § D223 — opening the Day report tab files only a day that has run out', () => {
  it('guards the openTab arm on the playhead', async () => {
    /*
     * § D223 named this and could not reach it from its own lane: `openTab` was an unguarded
     * `closeShift()` on the report tab at **any** playhead, so merely navigating to the sheet
     * incremented `week.attempt` and could bank a clean shift and clear a contract on a run nobody
     * had watched.
     *
     * Read off the arm rather than off the file, because the prose above the arm quotes the shipped
     * form it replaced — a whole-file `not.toContain` would be asserting against a docstring.
     */
    const source = await mainSource();
    const start = source.indexOf('openTab(tab) {');
    expect(start, 'main.ts’s MountContext has no openTab').toBeGreaterThan(-1);
    const arm = source
      .slice(start, source.indexOf('\n    },', start))
      // The prose above the arm quotes the shipped form it replaced, so the comments come out
      // before the code is read. A guard that asserted against a docstring would pass the day
      // somebody deleted the line and kept the paragraph.
      .replaceAll(/\/\*[\s\S]*?\*\//g, '');
    expect(arm).toContain("if (tab === 'report' && playheadHasRunOut()) closeShift();");
    expect(
      arm.replace("if (tab === 'report' && playheadHasRunOut()) closeShift();", ''),
      'the unguarded form is back — a navigation is filing days again',
    ).not.toContain('closeShift()');
  });

  it('asks reportPanel’s own predicate rather than deriving a second one', async () => {
    /*
     * One answer to *has this day been played out*. `runProgressOf` is what decides whether the
     * sheet may be a whole-day account (§ D223); a second copy here would let the tab bank a day
     * the sheet on it is simultaneously declining to report, which is § D223's two-answers screen
     * one layer down.
     */
    const source = await mainSource();
    expect(source).toContain("import { mountReport, runProgressOf } from './reportPanel.js';");
    expect(await bodyOf('playheadHasRunOut')).toContain("runProgressOf(viewAt()).kind === 'played-out'");
  });
});

/* -------------------------------------------------------------------------- *
 * § D233 — the report does not move the page out from under the reader
 * -------------------------------------------------------------------------- */

describe('issue #67 — a finished run opens the sheet only over a reader who is not busy', () => {
  it('still opens it for a reader watching the run, which is the handoff’s own behaviour', () => {
    expect(reportOpensItself({ tab: 'run', focusIsInAControl: false })).toBe(true);
  });

  it('does not override a tab the reader has just clicked', () => {
    // The issue's step 4: a click on **Dispatcher** with a ×60 run about to end was overridden a
    // moment later, and the tab had to be clicked twice.
    expect(reportOpensItself({ tab: 'dispatcher', focusIsInAControl: false })).toBe(false);
    expect(reportOpensItself({ tab: 'scenarios', focusIsInAControl: false })).toBe(false);
    expect(reportOpensItself({ tab: 'building', focusIsInAControl: false })).toBe(false);
  });

  it('does not unmount a control the reader is typing in', () => {
    // The issue's step 3: the Seed textbox was unmounted mid-word, the characters went nowhere,
    // and there was no error and nothing to undo.
    expect(reportOpensItself({ tab: 'run', focusIsInAControl: true })).toBe(false);
  });

  it('reads focus through a DOM helper the decision itself never touches', async () => {
    // The split every panel in `dev/` keeps: the decision is pure and testable, the `document`
    // read is three `instanceof`s next to it.
    const body = await bodyOf('focusIsInAControl');
    expect(body).toContain('document.activeElement');
    expect(body).toContain('HTMLInputElement');
    expect(body).toContain('HTMLSelectElement');
    expect(await bodyOf('closeShift')).toContain('reportOpensItself({');
  });
});
