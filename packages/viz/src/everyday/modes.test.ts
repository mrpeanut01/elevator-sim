/**
 * **The four tiles, and the claim each one makes about the tree behind it.**
 *
 * `modes.ts` is a table, so most of what could be asserted here would be re-typing it. What is
 * worth asserting is the part that can go *wrong*: whether the availability flags still describe
 * the repository they claim to describe, and whether a tile that refuses says why.
 *
 * The load-bearing case is the last one. `EVERYDAY_MODES` is authored prose about what exists, and
 * this repository's documented failure mode is exactly that — a sentence about a mechanism, or a
 * refusal, that stayed on the screen after the mechanism moved (`docs/05`'s standing requirement,
 * § D227). So *Endless rush is not built* is checked against the tree rather than believed.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { actionBarFor } from './actionBar.js';
import { EVERYDAY_MODES, isPlayable } from './modes.js';
import { rushBarModel, RUSH_PRIMARY_REFUSAL } from './rushScreenModel.js';
import { isScreenBuilt, routeFor, UNBUILT_REASONS } from './screens.js';
import { ENGINEER_SWAP_NOTE, EVERYDAY_SCREENS, MODE_PICKS } from './types.js';

const SRC = fileURLToPath(new URL('..', import.meta.url));

describe('the menu offers the four modes the design names', () => {
  it('lists all four, in the guide’s order, and none twice', () => {
    expect(EVERYDAY_MODES.map((mode) => mode.title)).toEqual([
      "Today's tower",
      'Campaign',
      'Endless rush',
      'Fix a building',
    ]);
  });

  it('opens each tile on a screen the inventory knows', () => {
    for (const mode of EVERYDAY_MODES) {
      expect(EVERYDAY_SCREENS, mode.title).toContain(mode.screen);
    }
  });

  it('gives every tile a blurb and a session shape', () => {
    // § 5's shape is what lets a player pick by how long they have, so an empty one is a tile that
    // silently drops the only thing distinguishing a 3-minute mode from a 5-minute one.
    for (const mode of EVERYDAY_MODES) {
      expect(mode.blurb.trim(), mode.title).not.toBe('');
      expect(mode.shape.trim(), mode.title).not.toBe('');
    }
  });

  it('carries § 18’s four picks, one each, in the picks’ own order', () => {
    // The § 3.3 menu primary follows the selected card by `modePick`, so a duplicated or missing
    // pick is a card the bar cannot name.
    expect(EVERYDAY_MODES.map((mode) => mode.pick)).toEqual([...MODE_PICKS]);
  });
});

describe('a tile either reaches the simulation or says it does not', () => {
  it('refuses in a sentence, never in a greyed-out tile with nothing on it', () => {
    for (const mode of EVERYDAY_MODES) {
      if (isPlayable(mode)) continue;
      expect(mode.unavailable?.trim().length, mode.title).toBeGreaterThan(10);
    }
  });

  it('leaves all four modes playable — the rush was the last tile to open', () => {
    /*
     * Stated as a fact about this build rather than as a design intent. When another mode's
     * Everyday screens land, this case fails — which is the point: the menu's refusals and the tree
     * move together or the failure is visible here rather than on a player's screen. Fix a
     * building's tile opened on the commit that registered `everyday/fixitScreen.ts`; the
     * campaign's on the one that registered all three of `everyday/campaignScreens.ts`'s; the
     * rush's on the one that registered `everyday/rushScreen.ts`.
     *
     * **The list is now every tile, and the case is kept rather than deleted for exactly that
     * reason.** A four-of-four list looks vacuous and is the opposite: `isPlayable` is derived from
     * the screen registry, so this fails the moment a screen is unregistered and its tile starts
     * refusing again — which is the direction that has no other check.
     *
     * *Playable* here means the tile's entry screens are registered and nothing more. The rush's
     * § 3.3 primary is inert over an engine that does not exist, which is a fact about that control
     * and is asserted in `rushScreenModel.test.ts` and in the case below, rather than smuggled into
     * this list.
     */
    const playable = EVERYDAY_MODES.filter(isPlayable).map((mode) => mode.title);
    expect(playable).toEqual(["Today's tower", 'Campaign', 'Endless rush', 'Fix a building']);
    // And the pair, the other way: nothing refuses, and nothing carries a sentence it cannot mean.
    expect(EVERYDAY_MODES.filter((mode) => mode.unavailable !== undefined)).toEqual([]);
  });

  it('derives every tile’s availability from the screen registry, both ways', () => {
    /*
     * The standing requirement, pointed at the tiles: a tile opens exactly when the screens its
     * flow enters through are registered. The campaign needs all three of § 8's screens — a
     * campaign whose desk dead-ends mid-flow is worse than a refused tile — and the other three
     * modes need their own entry screen. A lane that registers a screen flips its tile on the
     * same commit, and this case is what fails when the sentence and the registry disagree.
     */
    const gates = {
      /*
       * Today's tower gates on the whole of § 6's loop rather than on its entry screen alone —
       * set up, watch, read, and see the week. § 6's claim is that this mode is a *loop*, and a
       * mode whose report dead-ends is the shape the campaign row below refuses.
       */
      door: ['door', 'brief', 'stage', 'report', 'week'],
      towers: ['towers', 'building', 'contract'],
      rush: ['rush'],
      fixit: ['fixit'],
    } as const;
    for (const mode of EVERYDAY_MODES) {
      const needed = gates[mode.screen as keyof typeof gates];
      expect(needed, mode.title).toBeDefined();
      expect(isPlayable(mode), mode.title).toBe(needed.every(isScreenBuilt));
    }
  });

  it('opens Today’s tower on § 6.1’s front door, now that the loop’s four screens exist', () => {
    /*
     * This case used to assert the opposite — *straight to the stage, because the door is not
     * built* — and it was right when the door and the brief were unbuilt: a tile that routed
     * through two empty screens was worse than one that skipped them. Both are registered now, so
     * the skip is the stale thing and the guide's own route is the live one. The case is inverted
     * rather than deleted, because *which screen the front tile opens* is exactly the fact a
     * future lane might quietly change back.
     */
    expect(EVERYDAY_MODES[0]?.screen).toBe('door');
    // And the day the tile opens is a day, not a hand-off: the whole loop is registered.
    for (const screen of ['door', 'brief', 'stage', 'report', 'week'] as const) {
      expect(isScreenBuilt(screen), screen).toBe(true);
    }
  });
});

describe('the availability flags describe this tree, not a remembered one', () => {
  it('opens Endless rush onto its setup screen, and keeps the refusal about the missing engine', () => {
    /*
     * The direction this case used to run in was *the tile refuses, and there is still no rush
     * module*. § 9.1's setup screen landed, so the tile opens — and the half that was true stays
     * true and is asserted here rather than deleted: there is still no rush engine on disk, which
     * is why `rushScreenModel.ts` marks the § 3.3 primary inert and publishes a register of what
     * is missing. A tile that opened onto a screen with a live *Start the rush* over nothing would
     * be the silently-does-nothing control this file exists to catch.
     */
    const rush = EVERYDAY_MODES.find((mode) => mode.screen === 'rush');
    expect(rush?.unavailable).toBeUndefined();
    expect(existsSync(`${SRC}everyday/rushScreen.ts`)).toBe(true);
    expect(existsSync(`${SRC}rush`), 'a rush engine exists but the primary still refuses').toBe(
      false,
    );
    expect(RUSH_PRIMARY_REFUSAL).toMatch(/not built/);
    /* The refusal is *on the control*, which is what this file's own rule says — so the assertion
       is that the primary carries that sentence, not merely that it is dead (issue #262). */
    expect(rushBarModel(actionBarFor({ screen: 'rush', ctx: 'rush' })).primary.inert).toBe(
      RUSH_PRIMARY_REFUSAL,
    );
  });

  it('opens the campaign, now that all three of § 8’s screens exist beside its economy', () => {
    /*
     * § D227's rule in the direction a landed screen needs, and this tile is the one that carried
     * the refusal longest: the engine was in the tree and exercised while its Everyday screens were
     * not, so the sentence had to be about the *screen* rather than about the thing. All three are
     * registered now — the triage list, the desk and the contract sheet — so the refusal is gone,
     * and keeping it would be a control telling a player not to touch a thing that works.
     *
     * Asserted against disk in both halves: the engine directory, the § 8 economy the screens are
     * drawn from, and the module that mounts them.
     */
    expect(existsSync(`${SRC}campaign`)).toBe(true);
    expect(existsSync(`${SRC}campaign/economy.ts`)).toBe(true);
    expect(existsSync(`${SRC}everyday/campaignScreens.ts`)).toBe(true);
    const mode = EVERYDAY_MODES.find((candidate) => candidate.screen === 'towers');
    expect(mode?.unavailable).toBeUndefined();
  });

  it('opens Fix a building, now that its screen exists beside its engine', () => {
    /*
     * § D227's rule in the direction a landed screen needs: a refusal kept over a working screen
     * is a control telling the player not to touch a thing that works. The engine directory and
     * the screen module are both asserted on disk, and the tile is asserted open.
     */
    expect(existsSync(`${SRC}fixit`)).toBe(true);
    expect(existsSync(`${SRC}everyday/fixitScreen.ts`)).toBe(true);
    const mode = EVERYDAY_MODES.find((candidate) => candidate.screen === 'fixit');
    expect(mode?.unavailable).toBeUndefined();
  });
});

/**
 * **The sentences no runtime can reach** — issue #217's AC3 and AC4, § D350.
 *
 * Every tile is playable, so `unlessBuilt` returns `undefined` on all four rows and **not one
 * refusal literal in `modes.ts` is ever evaluated**. That is why this block reads the file as text
 * instead of asserting over `EVERYDAY_MODES`: a string on a branch that does not run cannot be
 * inspected through the module's exports, and the suite above — which asserts exactly that the
 * branch does not run — is therefore blind to what the branch *says*.
 *
 * The blindness had already cost something when this block was written. `modes.ts`' Fix-a-building
 * row carried *"the three cases run, but their Everyday screen is not built yet"* beside a comment
 * repeating the same three, for every wave after the fifteen other cases were authored and after
 * the screen was registered — while the table's own docstring said **eighteen** further up.
 * The file contradicted itself and every check in the repository passed, because availability is
 * derived (so the tile was correctly open) and the contradiction lived in prose nothing read.
 *
 * **This is § D227's class with the sting drawn, and the distinction is worth keeping.** A stale
 * refusal a *player* can read tells them not to touch a control that works. A stale refusal on a
 * dead branch misleads only a reader of the file — about whether a screen exists, which is the
 * one question this file is the authority on. #217 reported it as the former; it was the latter,
 * and `ISSUE_VERIFICATION_FINDINGS.md` § AA is where that correction was made.
 *
 * So the three cases below are the honesty this file can no longer supply by hand: the spelled
 * count is checked against `data/`, the refusal literals are checked for carrying a count at all,
 * and the unreachability that makes both necessary is itself pinned rather than assumed.
 */
describe('modes.ts’ prose is checked against the tree, not against a reader’s diligence', () => {
  const MODES_SOURCE = readFileSync(`${SRC}everyday/modes.ts`, 'utf8');

  /**
   * The authored cases, straight from the shipped file. `fixit/cases.test.ts` is what proves all
   * of these parse, run and reproduce their quoted figures; this suite only needs how many there
   * are, so it counts the authored entries rather than standing up the whole parser and its four
   * `data/` dependencies to learn a length.
   */
  const AUTHORED_CASE_COUNT = (
    JSON.parse(readFileSync(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as {
      readonly cases: readonly unknown[];
    }
  ).cases.length;

  /**
   * How the docstring is entitled to spell it. Deliberately a small table that throws rather than
   * a general number-to-words routine: if a nineteenth case is authored, somebody should have to
   * come here, and a helper that silently spelled any integer would let the docstring and `data/`
   * drift apart in the one direction this suite exists to close.
   */
  const NUMERALS: Readonly<Record<number, string>> = Object.freeze({
    15: 'fifteen',
    16: 'sixteen',
    17: 'seventeen',
    18: 'eighteen',
    19: 'nineteen',
    20: 'twenty',
  });

  it('spells the Fix-a-building count the way data/fixit-cases.json counts it', () => {
    const spelled = NUMERALS[AUTHORED_CASE_COUNT];
    expect(
      spelled,
      `${AUTHORED_CASE_COUNT} authored cases and no spelling for it — add one to NUMERALS`,
    ).toBeDefined();
    expect(
      MODES_SOURCE,
      `the docstring must spell it "${spelled ?? '?'}" — ` +
        `data/fixit-cases.json holds ${AUTHORED_CASE_COUNT}`,
    ).toContain(`ships all **${spelled ?? '?'}** § 10.5 cases`);
  });

  it('keeps every refusal literal free of a count, because no test can read one at runtime', () => {
    /*
     * The rule the Fix-a-building row now states: a refusal sentence names the screen that is
     * missing and never the things behind it, so it carries no number. A count inside a refusal is
     * a second copy of a figure — and the worst possible place for one, since the branch never
     * evaluates and no assertion over the module's exports can see it go wrong.
     *
     * Read from source for that reason. The literals are matched off the `unlessBuilt(` calls
     * themselves rather than off a hand-kept list, so a fifth tile is covered on the commit that
     * adds it.
     */
    const literals = [...MODES_SOURCE.matchAll(/unlessBuilt\(\s*'([^']*)'/g)].map(
      (match) => match[1] ?? '',
    );
    expect(literals, 'one refusal literal per tile').toHaveLength(EVERYDAY_MODES.length);
    const WORDS = [
      'one|two|three|four|five|six|seven|eight|nine|ten',
      'eleven|twelve|thirteen|fourteen|fifteen',
      'sixteen|seventeen|eighteen|nineteen|twenty',
    ].join('|');
    const counting = new RegExp(String.raw`\b(\d+|${WORDS})\b`, 'i');
    for (const literal of literals) {
      expect(literal, `"${literal}" carries a count a stale build would keep`).not.toMatch(
        counting,
      );
    }
  });

  /**
   * Where the rush comment says its three sentences are drawn, checked against the import graph.
   *
   * **This case exists because the comment it checks was wrong, in the paragraph arguing against
   * being wrong** — GitHub issue #293. The rush tile's comment says *"a refusal that describes a
   * build two waves old is § D227's defect with a longer fuse"*, and then claimed what the rush
   * lacks is named *on the screen itself (`rushScreenModel.ts#RUSH_ABSENCES`)*. The register left
   * that screen on the merge that closed issue #207 and has been drawn on the Settings
   * build-information panel since.
   *
   * That ordering is the whole lesson. A reader who arrives to check the claim has just been told
   * by the same paragraph that such claims expire — which is the strongest possible reason to
   * assume this one had been kept current, and the reason it survived two waves.
   *
   * ## What it checks, and why it is a table rather than a phrase
   *
   * The comment now names a module per sentence, and this pairs each of them with the constant it
   * is named for and asks the import graph. Not the prose: the comment **quotes** the wording it
   * replaced, so any pattern loose enough to catch *on the screen itself* would fire on the
   * correction that records it. `rushScreenModel.test.ts` makes the same argument at more length
   * over the same import graph, and this is the half that lives where `modes.ts`' own claim does —
   * a claim is checked next to where it is written, or nobody finds the check.
   *
   * The `RUSH_ABSENCES` row is the regression itself: a lane that draws the register back onto the
   * rush screen makes `rushScreen.ts` import it, and this fails until the sentence above is
   * revisited. That is § D227 in the direction that bites after a lane lands.
   */
  const RUSH_CLAIMS: readonly { readonly symbol: string; readonly drawnBy: string }[] =
    Object.freeze([
      { symbol: 'RUSH_ABSENCES', drawnBy: 'buildNotes.ts' },
      /* In-file: `rushBarModel` substitutes it into the § 3.3 bar the shell draws — issue #262. */
      { symbol: 'RUSH_PRIMARY_REFUSAL', drawnBy: 'rushScreenModel.ts' },
      { symbol: 'RUSH_BESTS_FIXTURE_NOTE', drawnBy: 'rushScreen.ts' },
    ]);

  it('names, for each rush sentence, a module that really draws it — § D227, issue #293', () => {
    const wrong: string[] = [];
    for (const { symbol, drawnBy } of RUSH_CLAIMS) {
      expect(MODES_SOURCE, `the rush comment no longer names ${drawnBy}`).toContain(drawnBy);
      /*
       * Derived per claim rather than listed: the modules that import the constant from the rush
       * model. An in-file renderer imports nothing, so its row asserts the empty set — which is
       * also what makes a future move *onto* a screen fail here rather than pass silently.
       */
      const importers = readdirSync(SRC + 'everyday')
        .filter(
          (file) =>
            file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'rushScreenModel.ts',
        )
        .filter((file) => {
          const block = /import\s*\{([^}]*)\}\s*from\s*'\.\/rushScreenModel\.js'/u.exec(
            readFileSync(`${SRC}everyday/${file}`, 'utf8'),
          );
          return (block?.[1] ?? '')
            .split(',')
            .map((entry) => entry.trim().split(/\s+as\s+/u)[0]?.trim())
            .includes(symbol);
        });
      const drawn = drawnBy === 'rushScreenModel.ts' ? [] : [drawnBy];
      if (importers.sort().join() !== drawn.join()) {
        wrong.push(`${symbol}: named ${drawnBy}, imported by ${importers.join(', ') || 'nothing'}`);
      }
    }
    expect(
      wrong,
      'the rush tile’s comment names a module that does not draw the constant it is named for. ' +
        'GitHub issue #293: the claim that licensed printing unmeasured names outlived the ' +
        'disclosure it pointed at, in the comment that names that exact failure mode.',
    ).toEqual([]);
  });

  it('confirms the refusals are unreachable, from both ends', () => {
    /*
     * Both halves of the reason this block reads text. From the tiles: nothing carries a sentence.
     * From the registry: `UNBUILT_REASONS` is keyed over nothing, so no screen key anywhere in the
     * shell has a refusal to draw either. If either flips, the literals above become live copy and
     * the case above stops being the only thing checking them — which is the good direction.
     */
    expect(EVERYDAY_MODES.filter((mode) => mode.unavailable !== undefined)).toEqual([]);
    expect(Object.keys(UNBUILT_REASONS)).toEqual([]);
    expect(isScreenBuilt('fixit')).toBe(true);
  });
});

/**
 * **The Today's-tower row's third clause, pinned by the three things that make it true.**
 *
 * GitHub issue **#261**. That row said the mode was *"the one the shell's stage hands off to"* —
 * true of § D335, where `stage` was a **route** that uncovered the Engineer surface, and false from
 * § D338 onward. It is the *third* clause of this one docstring to go stale the same way: the
 * Campaign and Fix-a-building rows both claimed their Everyday screens were what their tile *waited
 * on*, and both tiles opened. Those two were corrected in § D351; this one had a second site
 * (`everyday/boot.ts`) and was filed rather than guessed at.
 *
 * A fourth correction is the thing to prevent, so the replacement is not pinned by a fourth
 * sentence. Each of its three claims is asserted against the code that makes it true, and the
 * retired wording is barred from both files by name:
 *
 * 1. **The tile opens the front door.** `EVERYDAY_MODES[0].screen === 'door'`.
 * 2. **The stage is a screen, not a hand-off.** `routeFor('stage')` is `'screen'`, and over § 4's
 *    whole inventory only the arms `EverydayRoute` still has are produced — the `'handoff'` arm was
 *    removed outright, so a reintroduced one fails here whichever key returns it.
 * 3. **The door is § 3.2's footer row.** The shell exposes `enterEngineer`, `types.ts` carries the
 *    row's own note, and no tile routes to `stage`.
 *
 * The last clause is a text check because text is the layer that drifted: the code was already
 * right on the commit the sentence became wrong, which is exactly why nothing caught it.
 */
describe('the Today’s-tower row describes § D338’s door, not § D335’s hand-off', () => {
  const MODES_TEXT = readFileSync(`${SRC}everyday/modes.ts`, 'utf8');
  const BOOT_TEXT = readFileSync(`${SRC}everyday/boot.ts`, 'utf8');

  it('opens the tile on § 6.1’s front door and routes the stage as a screen', () => {
    expect(EVERYDAY_MODES[0]?.title).toBe("Today's tower");
    expect(EVERYDAY_MODES[0]?.screen).toBe('door');
    expect(routeFor('stage')).toBe('screen');
  });

  it('leaves no route arm a hand-off could come back through', () => {
    /*
     * Derived over the whole inventory rather than spot-checked on `stage`. The length assertion is
     * the non-vacuity guard: an empty inventory would satisfy the membership check silently, which
     * is the shape this suite's own § M30-style notes keep warning about.
     */
    expect(EVERYDAY_SCREENS.length).toBeGreaterThan(1);
    expect([...new Set(EVERYDAY_SCREENS.map(routeFor))].sort()).toEqual(['menu', 'screen']);
  });

  it('puts the door on § 3.2’s footer row, which is neither the tile nor the stage', () => {
    /*
     * The half of the claim that says what *does* cross over. `enterEngineer` is read off the
     * shell's own type surface, so this fails if the row is removed rather than only if a sentence
     * is reworded.
     */
    expect(readFileSync(`${SRC}everyday/shell.ts`, 'utf8')).toContain('enterEngineer(): void;');
    expect(ENGINEER_SWAP_NOTE.length).toBeGreaterThan(0);
    expect(EVERYDAY_MODES.map((mode) => mode.screen)).not.toContain('stage');
  });

  /**
   * A retirement marker: the words that turn *"the stage hands off to X"* from a claim into a
   * history. Deliberately narrow, and **narrowed by a false negative rather than by taste** — the
   * first draft accepted a bare `no longer`, and the original sentence passed it, because the
   * Campaign row two lines below says the tile *"no longer waits on anything"* about something else
   * entirely. A marker general enough to describe any correction will sooner or later sit near the
   * claim it was supposed to retire. Every word here names *this* retirement.
   */
  const RETIREMENT = /§ D338|§ D335|retired|used to read|was true of|any more|went on calling/u;

  /**
   * Every `hands off` in `text`, with the 300 characters either side of it.
   *
   * 300 rather than `documentation.test.ts`'s 400 for the same reason the marker list is narrow: a
   * docstring in this directory fits about four lines of prose in 300 characters, and the retirement
   * has to be in the same breath as the claim to be read as qualifying it.
   */
  function claimWindows(text: string): readonly string[] {
    return [...text.matchAll(/hands off/gu)].map((match) =>
      text.slice(Math.max(0, (match.index ?? 0) - 300), (match.index ?? 0) + 300),
    );
  }

  it('lets no “hands off” stand in either file without its retirement beside it', () => {
    /*
     * **Shaped after `experiments/validation/documentation.test.ts`**, which holds the withdrawn
     * access-control mechanism to a refutation within 400 characters, and for the same reason: a
     * flat ban on the phrase would forbid *quoting* the retired sentence, and this repository's
     * habit — the one that makes a correction legible a year later — is to quote what was wrong
     * rather than delete it. So the phrase is allowed; an *unaccompanied* phrase is not.
     *
     * Both files are covered because both carried it, from opposite ends: `modes.ts` named the
     * **mode** the stage handed off to and `boot.ts` named the **surface**. Neither was narrowly
     * true of some residual hand-off — `EverydayRoute` has no arm that could produce one, which is
     * the case two rows up.
     */
    for (const [name, text] of [
      ['modes.ts', MODES_TEXT],
      ['boot.ts', BOOT_TEXT],
    ] as const) {
      for (const [index, window] of claimWindows(text).entries()) {
        expect(window, `${name}: "hands off" #${String(index + 1)} stands as a live claim`).toMatch(
          RETIREMENT,
        );
      }
      /*
       * Non-vacuous in the direction that matters, and it runs **after** the loop so that a file
       * carrying the original sentence fails on the claim rather than on this: a file that stopped
       * explaining the retired hand-off entirely would otherwise satisfy an emptied loop silently.
       */
      expect(text, `${name} no longer explains the retired hand-off`).toMatch(/hand-off/u);
    }
  });

  it('negative control: an unaccompanied “hands off” is what this catches', () => {
    /*
     * Applied to text rather than to a file, because the guard above must be shown to fail on the
     * sentence that was actually there — not merely to pass on the one that replaced it.
     */
    const asItWas =
      " * This is the mode Casual play is currently *about*, and the one the shell's stage hands " +
      'off to.';
    expect(claimWindows(asItWas)).toHaveLength(1);
    expect(claimWindows(asItWas)[0]).not.toMatch(RETIREMENT);
    expect(claimWindows(`${asItWas} § D338 retired it.`)[0]).toMatch(RETIREMENT);
    /*
     * And the false negative that narrowed the marker list, kept as a case so it cannot come back:
     * the Campaign row's own unrelated *"no longer waits on anything"* is not a retirement of this.
     */
    expect(claimWindows(`${asItWas} It no longer waits on anything.`)[0]).not.toMatch(RETIREMENT);
  });
});
