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

/* -------------------------------------------------------------------------- *
 * The two seams issues #112 and #113 are about, read the same way
 * -------------------------------------------------------------------------- */

/**
 * One object-literal member's block, from a named property to the literal's own close.
 *
 * {@link bodyOf} finds `function name(`, and `MountContext.update` is neither a `function` nor a
 * top-level declaration — it is a method on the one object every panel is handed. The whole of what
 * a panel may do to the world goes through it, which is exactly why the persistence hook belongs
 * there and why this is the block worth reading.
 */
/**
 * `main.ts` with its comments blanked — `boundaries.test.ts`'s method, for its reason.
 *
 * Needed by exactly one assertion below, and needed *because* of what this repository does with a
 * removed identifier: it explains it. `boardsInFlight`'s own docstring names `boardsRequested` to say
 * what it replaced and why, so a raw-text search for the latch finds the sentence describing its
 * absence. Blanking rather than deleting keeps every offset where it was.
 */
async function mainCode(): Promise<string> {
  return (await mainSource())
    .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
    .replace(/\/\/[^\n]*/gu, (line) => ' '.repeat(line.length));
}

async function contextBlock(): Promise<string> {
  const source = await mainSource();
  const start = source.indexOf('const context: MountContext = {');
  expect(start, 'main.ts no longer builds a MountContext').toBeGreaterThan(-1);
  const end = source.indexOf('\n  };', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('issue #113 § 2 — the library is written the moment it changes', () => {
  /*
   * The reported symptom is *four dispatchers saved, one survived a reload*, and the cause is a
   * `when` rather than a `where`: `saveSessionNow` had two callers and neither was a save button.
   * The one that survived was filed through *Save it and run it*, which ran a shift, which closed a
   * day, which wrote the session.
   *
   * `persist.test.ts` owns the predicate and its derived cover over the envelope's shelves. What
   * only a text guard can reach is that `dev/main.ts` **asks** it, because the choke point is inside
   * `boot()` and `boot()` needs a document, a canvas and a click. This file's own header is candid
   * about that trade: weak evidence about behaviour, strong evidence about a line having been
   * deleted, which is the failure mode this fix actually has.
   */
  it('asks the predicate at the one choke point every panel writes through', async () => {
    const block = await contextBlock();
    expect(block).toContain('patchTouchesLibrary(patch)');
    expect(block).toContain('saveSessionNow()');
  });

  it('imports the predicate rather than restating which fields the library is made of', async () => {
    // A hand-written `patch.savedDispatchers !== undefined ||…` here would be a second answer to
    // *what the library is*, and the first one to go stale when a fifth shelf lands.
    const source = await mainSource();
    expect(source).toContain('patchTouchesLibrary');
    expect(source).not.toMatch(/patch\.saved[A-Z]/u);
  });

  it('writes the one library change that does not go through a patch', async () => {
    // The JSON editor hands back a whole `BuildingConfig`, so `adoptEditedBuilding` assigns
    // `state` directly and the choke point never sees it.
    expect(await bodyOf('adoptEditedBuilding')).toContain('saveSessionNow()');
  });
});

describe('issue #112 — a board is re-read, and the screen is not latched shut', () => {
  it('keeps no one-shot latch: the flag is in-flight and it is cleared', async () => {
    /*
     * The latch was set on the first fetch and **never cleared**, so the arrival trigger was dead
     * after the first visit and *"No scores have been posted yet."* — true once — was permanent. Its
     * absence is asserted by name, over comment-blanked source, because the name is precisely what a
     * revert puts back and precisely what the replacement's docstring has to be free to mention.
     */
    const code = await mainCode();
    expect(code).not.toContain('boardsRequested');
    expect(code).not.toContain('challengeRequested');

    const body = await bodyOf('loadBoards');
    expect(body).toContain('boardsInFlight');
    // Set *and* cleared. A flag that is only ever set is the latch again under a better name.
    expect(body).toContain('boardsInFlight = true');
    expect(body).toContain('boardsInFlight = false');
    // Cleared in a `finally`, so a client that throws does not wedge the screen for the session.
    expect(body).toMatch(/finally\s*\{[^}]*boardsInFlight = false/u);
  });

  it('re-reads the board after the server accepts a run', async () => {
    /*
     * `submitScore` ended in a notice and a `drawMenu()`. So the server created an entry, answered
     * 201, and the screen went on drawing the board list it fetched on arrival — which on a fresh
     * deployment is the sentence saying nothing has been posted. The one action the surface exists
     * for returned success and the screen said the opposite.
     */
    const body = await bodyOf('submitScore');
    expect(body).toContain('loadBoards()');
    expect(body).toMatch(/if \(result\.ok\) void loadBoards\(\)/u);
  });

  it('re-reads the challenge board after the server accepts a set, which it already did', async () => {
    // The half that was already right, pinned so the two posting paths cannot drift apart.
    expect(await bodyOf('postChallenge')).toContain('loadChallengeBoard()');
  });

  it('starts a fetch on arrival, and never from inside a render', async () => {
    // The reason the latch existed at all. Arrival is a transition, so it fires once per visit; a
    // fetch started from a render would fetch again on every state change its own response caused.
    const source = await mainSource();
    expect(source).toContain('if (arrived) void loadBoards();');
    expect(await bodyOf('drawMenu')).not.toContain('loadBoards');
  });
});

/* -------------------------------------------------------------------------- *
 * The between-day beat — GitHub issue #91
 * -------------------------------------------------------------------------- */

describe('issue #91 — the beat is built where the day closes, and nowhere else', () => {
  /*
   * Text guards, in this file's own idiom and with its own caveat: weak evidence about behaviour,
   * strong evidence about a line having been deleted. What they protect is a *cost* property that
   * no unit test can see — `tomorrowFactsOf` resolves a building document, and the shell redraws at
   * 60 Hz during playback, so the difference between calling it once per closed day and once per
   * frame is the difference between a feature and a stall.
   *
   * The behaviour itself is asserted where it can be: `shift/tomorrow.test.ts` drives the briefing
   * and requires its population to equal the one the next run actually resolves to, and
   * `dev/reportPanel.test.ts` pins which sheets carry it.
   */
  it('resolves tomorrow exactly once, from the day-closing path', async () => {
    const source = await mainSource();
    expect(
      (source.match(/tomorrowFactsOf\(/g) ?? []).length,
      'tomorrowFactsOf is called more than once — a second call is either a second answer to ' +
        'what tomorrow holds, or a document resolve on the render path',
    ).toBe(1);
    // And it is inside `briefingFor`, which `closeShift` is the only caller of.
    const body = await bodyOf('briefingFor');
    expect(body).toContain('tomorrowFactsOf(resources,');
  });

  it('carries the sheet’s own verdict rather than re-deriving one', async () => {
    /*
     * *Carried from the Day report rather than recomputed.* The beat's streak sentence is keyed on
     * the verdict, and two computations of one judgement is the defect issue #53 closed — it put
     * *"A day it could handle"* over *"Shift missed"* on one screen.
     */
    const body = await bodyOf('closeShift');
    expect(body).toContain('report.verdict');
    expect(body, 'the beat must not re-derive the verdict from allMet').not.toMatch(
      /verdict:\s*[^,]*allMet/u,
    );
  });

  it('clears the beat wherever it clears the sheet', async () => {
    /*
     * Both are accounts of a **closed** day, so they live and die together. A beat left standing
     * after `runShift` would put yesterday's overnight reveal under today's date, which is § D223's
     * stale-sheet defect one field over — and the two clear sites are the two the report already
     * had.
     */
    const source = await mainSource();
    const sheetCleared = (source.match(/report:\s*undefined/g) ?? []).length;
    const beatCleared = (source.match(/tomorrow:\s*undefined/g) ?? []).length;
    expect(beatCleared, 'every place the sheet is cleared clears the beat too').toBe(sheetCleared);
  });
});

/* -------------------------------------------------------------------------- *
 * Issue #136 — a run read off disk is not a day of this week
 * -------------------------------------------------------------------------- */

describe('issue #136 — a loaded recording banks nothing', () => {
  /*
   * ## The seam
   *
   * `loadRecordingFile` puts a `VizRecording` read off disk on screen and `adopt` arms the filing
   * gate behind it, so the transport reaching `endedAt` calls `closeShift` exactly as it would for
   * a run this shell had just simulated. Every day-level fact `closeShift` uses comes from `state`
   * — the day number, the contract, the calendar period and so the event, `ShiftPlan`'s three axes
   * — and `closedWeekOf` then writes the streak, the clean-run count and the cleared contract.
   *
   * The decision, the three options it was chosen from and the evidence for choosing it are
   * `shift/banking.ts`'s docstring; the behaviour is driven in `shift/banking.test.ts` against two
   * real recordings on two shipped buildings, one of them round-tripped through the shipped document
   * format. What is left is the wiring, which lives inside `boot()` and is read here as text — this
   * file's own pattern, and its own caveat: weak evidence about behaviour, strong evidence about a
   * line having been deleted.
   */
  it('asks before it writes, and asks in closeShift rather than at one caller of it', async () => {
    const body = await bodyOf('closeShift');
    expect(
      body,
      'closeShift no longer consults shift/banking.ts, so a recording loaded from a file can bank ' +
        'a day against the shell’s last simulated plan',
    ).toContain('bankingRefusalFor(recording, simulatedRecording)');

    /*
     * **Before** anything is written, and the ordering is the assertion rather than the presence.
     * `filedRunId` latching first would mark the loaded run as filed and turn every later press
     * into the first line's silent early return; `closedWeekOf` running first would bank the day
     * this refusal exists to stop.
     */
    const asked = body.indexOf('const cannotBank');
    expect(asked).toBeGreaterThan(-1);
    for (const written of ['filedRunId = recording.runId', 'closedWeekOf(state', 'outcomeOf({']) {
      const at = body.indexOf(written);
      expect(at, `closeShift does not reach ${written}`).toBeGreaterThan(-1);
      expect(at, `${written} runs before the day is refused`).toBeGreaterThan(asked);
    }
  });

  it('holds the run it simulated, and writes it in exactly one place', async () => {
    /*
     * One writer. A second — in `adopt`, say, which is the tempting place because every recording
     * passes through it — would set it for loaded recordings too and make the whole gate inert: a
     * control that writes nothing while looking exactly like one that does, which is the defect this
     * repository has shipped eleven times.
     *
     * Over `mainCode()` rather than `mainSource()`, so the prose explaining the binding does not
     * count as a second writer.
     *
     * **The writer is `applyShift`, not `runShift`, and that is the UI readiness audit's B3 rather
     * than a weakening.** `runShift` no longer simulates: it builds the plan, hands it to
     * `dev/shiftRunner.ts` and returns, and `applyShift` is the half that runs when the worker
     * answers. The property this case is about is unchanged and is the one that matters — **one**
     * writer, on the path a simulated run takes and on no other — and the count above is what
     * enforces it. Naming the function it lives in is the part that had to move.
     */
    const code = await mainCode();
    const writes = [...code.matchAll(/simulatedRecording\s*=[^=]/g)];
    expect(writes, 'simulatedRecording is written somewhere other than applyShift').toHaveLength(1);
    expect(await bodyOf('applyShift')).toContain('simulatedRecording = recording');
    // And `runShift` still owns getting there: the only route into `applyShift` is the run it
    // starts, so a second entry point would be a second way for a recording to be called simulated.
    expect(await bodyOf('runShift')).toContain('applyShift(recording, startOfDayS, plan.withheld)');
  });

  it('clears the run’s own hour on load, so the docstring that says it does is true', async () => {
    /*
     * `runStartOfDayS`'s docstring says it is `undefined` *"for a recording restored from a file,
     * where the clock falls back to the shipped `DAY_START_S`"*. Nothing cleared it, and `boot()`
     * simulates a shift before the player can press anything, so a loaded recording was drawn on
     * the **previous** run's clock in all four places that read it. A refusal pinned by a sentence
     * rather than by a line is § D227, and this was one.
     */
    expect(await bodyOf('loadRecordingFile')).toContain('runStartOfDayS = undefined');
  });
});
