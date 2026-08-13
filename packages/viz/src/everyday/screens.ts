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
 * The table is static — explicit imports, no runtime `register()` call — for two reasons this
 * repository has paid for separately. A self-registration side effect depends on somebody
 * importing the screen module, and an import whose only job is a side effect is exactly the kind
 * of caller the dead-code audit cannot distinguish from a barrel re-export. And a registry
 * mutated at import time makes {@link EVERYDAY_SCREENS_BUILT} a function of module load order,
 * which is the temporal-dead-zone class of defect the guide's § 18 notes killed the prototype
 * with, twice.
 *
 * ## What "built" means, and the two screens the shell owns
 *
 * `menu` and `stage` appear in no table row and are built anyway: the menu is the shell's own
 * front door, and the stage is the hand-off that uncovers the Engineer surface (§ D335 — still
 * the Engineer stage with Casual copy, named in `EVERYDAY_SHELL_ABSENCES`, not § 7's stage).
 * {@link EVERYDAY_SCREENS_BUILT} is therefore *shell-owned ∪ registered*, derived from this file
 * at load, never hand-written — it is the constant `types.ts` promised with a `{@link}` for a
 * wave before it existed, which made that docstring a claim about nothing: this repository's
 * signature defect, in a link.
 */

import type { ActionBarModel } from './actionBar.js';
import { DESIGNER_SCREEN } from './designerScreen.js';
import { FIXIT_SCREEN } from './fixitScreen.js';
import type { EverydayHost } from './host.js';
import { RUSH_SCREEN } from './rushScreen.js';
import { SETTINGS_SCREEN } from './settingsScreen.js';
import { TUNER_SCREEN } from './tunerScreen.js';
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
    designer: DESIGNER_SCREEN,
    fixit: FIXIT_SCREEN,
    rush: RUSH_SCREEN,
    settings: SETTINGS_SCREEN,
    tuner: TUNER_SCREEN,
  });

/** The two screens the shell itself provides — see the module docstring. */
const SHELL_OWNED: readonly EverydayScreen[] = Object.freeze(['menu', 'stage']);

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
export type EverydayRoute = 'menu' | 'handoff' | 'screen' | 'refusal';

/**
 * `menu` draws the shell's own front door; `stage` uncovers the Engineer surface; a registered
 * key mounts its module; everything else draws {@link unbuiltReasonFor}'s sentence — the honest
 * refusal, a sentence a player reads, never a blank screen.
 */
export function routeFor(screen: EverydayScreen): EverydayRoute {
  if (screen === 'menu') return 'menu';
  if (screen === 'stage') return 'handoff';
  return SCREEN_MODULES[screen] !== undefined ? 'screen' : 'refusal';
}

/**
 * Why each unbuilt screen does not open — one sentence per key, read by the rail's row captions,
 * the router's refusal screen, and the honesty sweep, so every surface refuses in the same words.
 *
 * Keyed **exactly** over the unbuilt, non-shell-owned keys: `screens.test.ts` fails on a key that
 * gained a module and kept its sentence (§ D227's defect — a refusal telling the player not to
 * touch a thing that works) and on an unbuilt key with no sentence (a control that silently does
 * nothing). The wording follows `modes.ts`'s rule: where the thing behind the screen exists, the
 * refusal is about the screen, never about the thing.
 */
export const UNBUILT_REASONS: Readonly<Partial<Record<EverydayScreen, string>>> = Object.freeze({
  door: "the front door screen is not built — Today's tower opens the day directly",
  brief: 'the brief screen is not built — the day starts without it',
  report: 'the report screen is not built — the Engineer stage draws its own report',
  towers: 'the campaign runs, but its Everyday screens are not built yet',
  building: 'the campaign runs, but its Everyday screens are not built yet',
  contract: 'the campaign runs, but its Everyday screens are not built yet',
  workshop: 'the workshop screen is not built — the levers live on the stage for now',
  bench: 'the bench screen is not built — its suite runs from the Engineer shell',
  week: 'the week screen is not built',
  board: 'needs a server to post and rank runs, and this build has none',
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
