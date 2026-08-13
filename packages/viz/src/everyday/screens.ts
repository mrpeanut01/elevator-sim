/**
 * **The screen registry** — which of GAMEPLAY § 4's seventeen screens are actually built, decided
 * in one place and derived everywhere else.
 *
 * ## The shape a screen lane plugs into
 *
 * A screen is a module exporting an {@link EverydayScreenModule} — a key, a `mount` that draws
 * into the host element the shell hands it, and optionally a `bar()` that refines the § 3.3 row
 * `actionBar.ts` resolves (never a new bar shape: § 3.1 gives the shell sole ownership of the
 * footer). To register, the lane adds **one import and one table row** to {@link SCREEN_MODULES}
 * below, and deletes the screen's sentence from {@link UNBUILT_REASONS} — `screens.test.ts` fails
 * if either half is forgotten, in either direction.
 *
 * **Every § 4 key is registered as of this commit, so there is no screen left to plug in and
 * {@link UNBUILT_REASONS} is empty.** The instruction above is kept because it runs in reverse too:
 * a lane that *unregisters* a screen — or that adds a key to `EVERYDAY_SCREENS` ahead of the module
 * for it — owes the sentence back on the same commit, and the same test fails until it is there.
 *
 * The table is static — explicit imports, no runtime `register()` call — for two reasons this
 * repository has paid for separately. A self-registration side effect depends on somebody
 * importing the screen module, and an import whose only job is a side effect is exactly the kind
 * of caller the dead-code audit cannot distinguish from a barrel re-export. And a registry
 * mutated at import time makes {@link EVERYDAY_SCREENS_BUILT} a function of module load order,
 * which is the temporal-dead-zone class of defect the guide's § 18 notes killed the prototype
 * with, twice.
 *
 * ## What "built" means, and the one screen the shell owns
 *
 * `menu` appears in no table row and is built anyway: it is the shell's own front door (§ 3.5).
 * {@link EVERYDAY_SCREENS_BUILT} is therefore *shell-owned ∪ registered*, derived from this file
 * at load, never hand-written — it is the constant `types.ts` promised with a `{@link}` for a
 * wave before it existed, which made that docstring a claim about nothing: this repository's
 * signature defect, in a link.
 *
 * ## `stage` was the second shell-owned key, and it is not any more
 *
 * § D335 made it one: the stage was the *hand-off*, a route that uncovered the Engineer surface and
 * inset it beside the rail, so there was no module to register and the key was built by the shell
 * saying so. That was honest and it was not § 7 — the register said as much in its own first line.
 *
 * `everyday/stageScreen.ts` is now § 7's stage, so `stage` is an ordinary registered screen and
 * `SHELL_OWNED` is down to the menu alone. The consequence worth stating is that
 * {@link EverydayRoute} lost its `'handoff'` arm **entirely**: it had exactly one producer, this
 * file, and a route value nothing can return is the dead seam this repository keeps a count of. The
 * Engineer surface is unchanged and still boots and runs behind the shell.
 *
 * **Its door did not come back as a route, and must not.** § 3.2's *Switch to Engineer* hands the
 * whole page to the other shell and leaves this one mounted behind it — a mode switch rather than a
 * navigation — so it is `shell.ts#enterEngineer`, reached from the rail's footer, and there is no
 * key for it in `EVERYDAY_SCREENS` and no arm for it here. Reintroducing one would put back exactly
 * the value that was deleted for having nothing to return it.
 */

import type { ActionBarModel } from './actionBar.js';
import { BENCH_SCREEN } from './benchScreen.js';
import { BOARD_SCREEN } from './boardScreen.js';
import { BRIEF_SCREEN } from './briefScreen.js';
import { BUILDING_SCREEN, CONTRACT_SCREEN, TOWERS_SCREEN } from './campaignScreens.js';
import { DESIGNER_SCREEN } from './designerScreen.js';
import { DOOR_SCREEN } from './doorScreen.js';
import { FIXIT_SCREEN } from './fixitScreen.js';
import type { EverydayHost } from './host.js';
import { REPORT_SCREEN } from './reportScreen.js';
import { RUSH_SCREEN } from './rushScreen.js';
import { SETTINGS_SCREEN } from './settingsScreen.js';
import { STAGE_SCREEN } from './stageScreen.js';
import { TUNER_SCREEN } from './tunerScreen.js';
import { WEEK_SCREEN } from './weekScreen.js';
import { WORKSHOP_SCREEN } from './workshopScreen.js';
import type { EverydayScreen, EverydayState, RunContext } from './types.js';
import { EVERYDAY_SCREENS } from './types.js';

/** What the shell hands a screen's `mount`, so a screen never reaches into the shell. */
export interface EverydayScreenContext {
  /** The flow this screen is serving — GAMEPLAY § 18's `ctx`. */
  readonly ctx: RunContext;
  /**
   * The data host — the only way a screen reaches the simulation machinery. Its docstring in
   * `host.ts` is the contract: what it reads, what it does, and what is deliberately absent.
   * No screen may import `dev/main` directly.
   */
  readonly host: EverydayHost;
  /** Navigate. The same navigation a rail row performs; there is no other way to move. */
  go(screen: EverydayScreen): void;
  /**
   * Declare that a run is open or closed on this screen. While `true` on the stage, the bar's
   * left button shows § 3.4's confirm strip instead of leaving; a `watch` context never warns
   * regardless. A screen that never calls this never warns, which is correct for every screen
   * that is not a stage.
   */
  setRunOpen(open: boolean): void;
}

/** What `mount` may hand back. `unmount` runs when the player navigates away. */
export interface EverydayScreenHandle {
  unmount?(): void;
}

/** One built screen, as the registry holds it. */
export interface EverydayScreenModule {
  readonly key: EverydayScreen;
  /** Draw into `host`. The shell clears the region first and calls `unmount` on the way out. */
  mount(host: HTMLElement, context: EverydayScreenContext): EverydayScreenHandle | undefined;
  /**
   * Refine the § 3.3 row for this screen's state — substitute a `⟨…⟩` cell, pick a variant, flip
   * a solved fix case's inversion. Start from `actionBarFor(state)` and return it edited; a row
   * built from scratch here is the per-screen footer § 3.1 forbids.
   */
  bar?(state: EverydayState): ActionBarModel;
}

/**
 * The registry. **Screen lanes: add your import above and your row here, and delete your key's
 * sentence from {@link UNBUILT_REASONS}.**
 */
const SCREEN_MODULES: Readonly<Partial<Record<EverydayScreen, EverydayScreenModule>>> =
  Object.freeze({
    // Written in `EVERYDAY_SCREENS`' own order, which is the order
    // {@link EVERYDAY_SCREENS_BUILT} derives anyway — the table is a filter over the inventory, so
    // a row's position here decides nothing and matching the inventory keeps the two readable
    // side by side.
    door: DOOR_SCREEN,
    brief: BRIEF_SCREEN,
    stage: STAGE_SCREEN,
    report: REPORT_SCREEN,
    towers: TOWERS_SCREEN,
    building: BUILDING_SCREEN,
    contract: CONTRACT_SCREEN,
    rush: RUSH_SCREEN,
    fixit: FIXIT_SCREEN,
    workshop: WORKSHOP_SCREEN,
    bench: BENCH_SCREEN,
    designer: DESIGNER_SCREEN,
    tuner: TUNER_SCREEN,
    week: WEEK_SCREEN,
    board: BOARD_SCREEN,
    settings: SETTINGS_SCREEN,
  });

/** The one screen the shell itself provides — see the module docstring. */
const SHELL_OWNED: readonly EverydayScreen[] = Object.freeze(['menu']);

/**
 * The honest subset of {@link EVERYDAY_SCREENS}: the keys a player can actually enter.
 *
 * Derived — shell-owned plus registered — so it moves on the commit that registers a screen and
 * on no other. `modes.ts` gates the four tiles on it and `rail.ts` gates its rows on it; nothing
 * else may assert availability.
 */
export const EVERYDAY_SCREENS_BUILT: readonly EverydayScreen[] = Object.freeze(
  EVERYDAY_SCREENS.filter((key) => SHELL_OWNED.includes(key) || SCREEN_MODULES[key] !== undefined),
);

/** Whether a player can enter this screen in this build. */
export function isScreenBuilt(screen: EverydayScreen): boolean {
  return EVERYDAY_SCREENS_BUILT.includes(screen);
}

/** The registered module for a key, or `undefined` for the shell-owned and the unbuilt. */
export function screenModuleFor(screen: EverydayScreen): EverydayScreenModule | undefined {
  return SCREEN_MODULES[screen];
}

/** How the shell routes a key. One decision, taken here so it can be tested without a document. */
export type EverydayRoute = 'menu' | 'screen' | 'refusal';

/**
 * `menu` draws the shell's own front door; a registered key mounts its module; everything else
 * draws {@link unbuiltReasonFor}'s sentence — the honest refusal, a sentence a player reads, never
 * a blank screen.
 *
 * There were three arms until § 7's stage landed. See the module docstring for why the fourth —
 * `'handoff'`, which uncovered the Engineer surface — was removed rather than left returning for
 * nothing.
 *
 * **`'refusal'` returns for no key on this build, and it stays.** The two cases look alike and are
 * not: `'handoff'` had one producer and that producer was deleted, so nothing could ever return it
 * again; this arm's producer is the branch below, whose condition is over the *registry*, and it
 * returns the moment a key has no module — which is the same commit {@link UNBUILT_REASONS} stops
 * being empty on. A route with a live producer and no input today is not a dead seam;
 * `screens.test.ts` asserts that pair rather than the shorter list of what happens to be produced.
 */
export function routeFor(screen: EverydayScreen): EverydayRoute {
  if (screen === 'menu') return 'menu';
  return SCREEN_MODULES[screen] !== undefined ? 'screen' : 'refusal';
}

/**
 * Why each unbuilt screen does not open — one sentence per key, read by the rail's row captions,
 * the router's refusal screen, and the honesty sweep, so every surface refuses in the same words.
 *
 * ## It is empty, and empty is a measurement rather than an oversight
 *
 * Every one of § 4's seventeen keys is built: sixteen are registered above and `menu` is the
 * shell's own. There is no unbuilt, non-shell-owned key left for this table to be keyed over, so it
 * is keyed over nothing — which is the correct value of a table whose contents are *the screens that
 * do not open*, on a build where they all do.
 *
 * **The constant stays, and so does every rule below it.** A screen that leaves the registry — an
 * unregistered row, a module deleted, a key added to `EVERYDAY_SCREENS` ahead of its screen — must
 * put its sentence back here on the same commit, and `screens.test.ts` is what fails if it does not.
 * Deleting the table would take that check with it and leave the next lane to reinvent it, which is
 * the opposite of what an empty register is for.
 *
 * Keyed **exactly** over the unbuilt, non-shell-owned keys: `screens.test.ts` fails on a key that
 * gained a module and kept its sentence (§ D227's defect — a refusal telling the player not to
 * touch a thing that works) and on an unbuilt key with no sentence (a control that silently does
 * nothing). Both halves still run over an empty table; the first is what emptied it. The wording
 * follows `modes.ts`'s rule: where the thing behind the screen exists, the refusal is about the
 * screen, never about the thing.
 *
 * ## Read it, and let a missing key throw — never `?? 'a sentence of your own'`
 *
 * A caller that reads a key from this table and supplies its own fallback has written § D227's
 * defect with a delay fuse: the day the key's screen is registered, the key disappears from here
 * **and the fallback silently takes over**, so the surface goes on refusing a screen that now
 * opens, and the test above cannot see it because the table itself is correct. The whole point of
 * this table being keyed exactly is that its absences are load-bearing.
 *
 * So a surface that offers a route to another screen asks {@link isScreenBuilt} first and calls
 * {@link unbuiltReasonFor} only in the arm where that is `false` — which throws on a built key,
 * loudly, at the one moment a fallback would have gone quiet.
 */
export const UNBUILT_REASONS: Readonly<Partial<Record<EverydayScreen, string>>> = Object.freeze({
  /*
   * **Empty, as of the merge that registered § 9.1's rush setup, § 13's drawing board and § 3.3's
   * tuner.** Every sentence this table has ever held has left it, and every one left because its
   * screen landed rather than because anybody tidied. The deletions are recorded here rather than
   * in a commit message, because a register whose emptying is invisible is a register a reader
   * cannot audit:
   *
   * - `week` and `board` left with the daily loop beside § 14's screen — `board`'s
   *   *"needs a server to post and rank runs"* was true of the daily half and false of the ladder,
   *   which is measured on this device and now opens;
   * - `towers`, `building` and `contract` left together with § 8's campaign, all three sharing
   *   *"the campaign runs, but its Everyday screens are not built yet"* — the honest form, naming
   *   the missing screen rather than the working engine behind it;
   * - `door`, `brief`, `report` and `stage`'s hand-off left with § 6's loop and § 7's stage;
   * - `workshop` (*"the levers live on the stage for now"*) and `bench` (*"its suite runs from the
   *   Engineer shell"*) left with § 11's and § 12's screens, both mechanisms still exactly where
   *   those sentences said they were — what expired was the clause *for now*;
   * - `rush`, `designer` and `tuner` left on this merge. `rush`'s sentence did **not** simply
   *   disappear: the setup screen opens and the climbing stream behind it does not exist, so the
   *   refusal moved one level in, onto the § 3.3 primary that cannot act
   *   (`rushScreenModel.ts#RUSH_PRIMARY_REFUSAL`). That is this table's own wording rule followed to
   *   its end — where the screen exists and the thing behind it does not, the refusal belongs on the
   *   control, not on the door.
   *
   * `tuner`'s is the one to read twice. It said *"the brief and the report both point at it, and
   * there is nothing behind the door yet"* — and the brief's *Take it to the sandbox* card was
   * reading this key with a `?? 'the tuner screen is not built'` fallback, which is the exact defect
   * the section above forbids. Deleting the key would have armed it: the card would have gone on
   * refusing a screen that opens, and no test in this file could have seen it, because the table
   * would have been correct. The card navigates now (`briefView.ts#lockedForScore`).
   */
});

/**
 * The refusal sentence for an unbuilt key. Asking about a built key is a caller bug and throws,
 * because a refusal drawn over a working screen is the exact defect {@link UNBUILT_REASONS}'s
 * keying exists to prevent.
 */
export function unbuiltReasonFor(screen: EverydayScreen): string {
  const reason = UNBUILT_REASONS[screen];
  if (reason === undefined) {
    throw new Error(`${screen} is built — there is no refusal to draw for it`);
  }
  return reason;
}

/**
 * § 4's name column, keyed — what a screen is called when a heading needs it. The board's entry
 * is the inventory's own slashed pair, because the two boards are one screen and a heading that
 * picked one tab would be the rail's two-entries defect in a title.
 */
export const SCREEN_NAMES: Readonly<Record<EverydayScreen, string>> = Object.freeze({
  menu: 'Main menu',
  door: 'Front door',
  brief: 'The brief',
  stage: 'The day',
  report: 'How it went',
  towers: 'All buildings',
  building: 'Building desk',
  contract: 'Contract & works',
  rush: 'Endless rush',
  fixit: 'Fix a building',
  workshop: 'Dispatcher workshop',
  bench: 'Test bench',
  designer: 'Design a building',
  tuner: 'Tune the tower',
  week: 'Your week',
  board: "Today's board / Dispatcher ladder",
  settings: 'Settings',
});
