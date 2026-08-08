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
  it('latches the flag in closeMenu, which is the only way out of the overlay', async () => {
    /*
     * Three arms close the menu — **Start**, **Open the doors** and **Keep going** — and each is a
     * mode being entered. Latching in `closeMenu` rather than in the three arms is what makes the
     * set complete by construction: a fourth arm that closed the overlay without setting the flag
     * would be a fourth way into the product that could not score.
     */
    expect(await bodyOf('closeMenu')).toContain('playerHasChosen = true');
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
     */
    const body = await bodyOf('adopt');
    expect(body).toContain('autoplay:');
    expect(
      body,
      'adopt no longer gates autoplay on playerHasChosen, so boot’s run plays behind the menu',
    ).toContain('playerHasChosen &&');
  });

  it('is not a vacuous guard — the flag is declared above boot’s own sequence', async () => {
    /*
     * `main.test.ts` already enforces the general rule (`let` before the sequence, the TDZ guard
     * that has now been broken four times in this package). This asserts the specific binding,
     * because a `playerHasChosen` declared *below* `boot()`'s `runShift()` would throw on the line
     * that reads it and the last-resort handler would report *The viewer did not start* — which is
     * how the previous four presented.
     */
    const source = await mainSource();
    const declared = source.indexOf('let playerHasChosen');
    const sequence = source.indexOf('\n  restoreSession();');
    expect(declared).toBeGreaterThan(-1);
    expect(sequence).toBeGreaterThan(-1);
    expect(declared).toBeLessThan(sequence);
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
