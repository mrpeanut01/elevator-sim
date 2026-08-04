/**
 * The shape of the menu, free play and settings — data only, so the reducer beside it can be tested
 * without a document.
 *
 * `DECISIONS.md` § D214 § 2 is the reason this is a separate file from the panel that draws it: a
 * decision made inside a click handler needs a document, a canvas and a click to reach, so it
 * cannot be tested and it drifts. `dev/runConfig.ts` was that defect once already.
 */

/* -------------------------------------------------------------------------- *
 * Screens
 * -------------------------------------------------------------------------- */

/**
 * Every screen the shell can show.
 *
 * `main` is the root and is the only screen with no parent. The other five are reachable from it and
 * return to it, which is what {@link MenuState.history} records — a stack rather than a parent
 * pointer, because Free Play can be entered from the main menu *and* from a leaderboard row
 * ("play this board's configuration"), and those two entries go back to different places.
 */
export const MENU_SCREENS = [
  'main',
  'campaign',
  'free-play',
  'settings',
  'leaderboard',
  'account',
] as const;

export type MenuScreen = (typeof MENU_SCREENS)[number];

/** The root. Named rather than assumed, so `back` from an empty history has somewhere to go. */
export const ROOT_SCREEN: MenuScreen = 'main';

/* -------------------------------------------------------------------------- *
 * Settings
 * -------------------------------------------------------------------------- */

/**
 * Player preferences. **Presentation only** — nothing here may change what a run computes.
 *
 * That restriction is the whole reason this type is small and this comment exists. A setting that
 * altered the simulation would make two players' scores incomparable while both looked valid, and
 * the leaderboard (§ D214 § 3) verifies a submission by **replaying its seed** — a presentation
 * setting cannot affect that replay, and a simulation setting silently would.
 *
 * Anything that changes a run belongs in {@link FreePlaySelection}, which is part of the submitted
 * configuration and is hashed into the board's identity.
 */
export interface Settings {
  /** Suppress the 60 Hz stage animation. The run is unchanged; only the drawing is. */
  readonly reduceMotion: boolean;
  /**
   * Show the energy proxy beside the wait figures.
   *
   * Off by default, and it shows energy **beside** AWT and WT95 rather than folded into a grade —
   * `DECISIONS.md` § D106: a dispatcher that drives less carries fewer people, so a configuration
   * that spends less by serving fewer people has not saved anything.
   */
  readonly showEnergyAxis: boolean;
  /** Playback rate for the viewer, as a multiple of simulated time. Drawing only. */
  readonly playbackSpeed: number;
  readonly theme: 'system' | 'dark' | 'light';
}

/** The defaults a fresh player gets. */
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  reduceMotion: false,
  showEnergyAxis: false,
  playbackSpeed: 1,
  theme: 'system',
});

/** Playback speeds the UI offers. Declared, so the panel and the validator agree. */
export const PLAYBACK_SPEEDS: readonly number[] = Object.freeze([0.5, 1, 2, 4, 8]);

/* -------------------------------------------------------------------------- *
 * Free play
 * -------------------------------------------------------------------------- */

/**
 * What the player picked, and everything a run needs to be reproduced from it.
 *
 * **Every field here is part of the run's identity**, because § D214 § 4 hashes this — together with
 * the resolved data it names — into the board a score belongs to. A field added here that changes
 * the simulation and is *not* hashed would let two different runs share a board, which is the
 * "recorded case loses its subject" defect § D205 and § D213 both paid for.
 *
 * `arrivalRatePctPop5min` is `null` for *"whatever this building's own traffic profile says"*, which
 * is a different selection from any particular number and has to survive as one: resolving it to a
 * number at selection time would silently pin a rate that `data/` is free to change.
 */
export interface FreePlaySelection {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
  /** Decimal digits. A string because a seed is an identity, not a quantity to do arithmetic on. */
  readonly seed: string;
}

/** Run lengths Free Play offers, seconds. 15 minutes is the shipped studies' own horizon. */
export const FREE_PLAY_DURATIONS_S: readonly number[] = Object.freeze([300, 900, 1800, 3600]);

/* -------------------------------------------------------------------------- *
 * The catalogue — what there is to choose from
 * -------------------------------------------------------------------------- */

/**
 * One selectable thing, with enough to draw a row for it.
 *
 * Deliberately **not** the resolved config object. The menu needs an id and a label; handing it a
 * `ResolvedBuilding` would let a panel reach into the simulation model and start rendering
 * derived facts that no test covers.
 */
export interface CatalogueEntry {
  readonly id: string;
  readonly name: string;
  /** A short line the panel may show under the name. Never required to be present. */
  readonly detail?: string | undefined;
}

/**
 * Everything Free Play can offer, derived from `data/` rather than listed.
 *
 * § D213 is why this is derived. Five separate hard-coded lists in this repository had to be widened
 * by hand when three buildings landed, and two of them were guards that could no longer see what
 * they were guarding. A menu built from a literal would be the sixth.
 */
export interface MenuCatalogue {
  readonly buildings: readonly CatalogueEntry[];
  readonly dispatchers: readonly CatalogueEntry[];
  readonly demandTemplates: readonly CatalogueEntry[];
}

/* -------------------------------------------------------------------------- *
 * The whole of it
 * -------------------------------------------------------------------------- */

export interface MenuState {
  readonly screen: MenuScreen;
  /** Screens to return through, root-most first. Never contains {@link MenuScreen} `main`. */
  readonly history: readonly MenuScreen[];
  readonly settings: Settings;
  readonly freePlay: FreePlaySelection;
}

/** A reason a selection cannot be started, in words a player can act on. */
export interface SelectionIssue {
  readonly field: keyof FreePlaySelection;
  readonly message: string;
}
