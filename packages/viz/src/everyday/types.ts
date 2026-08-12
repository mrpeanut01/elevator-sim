/**
 * **The Everyday Mode shell's own vocabulary** — GAMEPLAY § 3 and § 4.
 *
 * ## Why this module exists at all
 *
 * `docs/design/design_handoff_casual_mode/BUILD_PLAN.md` § 0 has a table headed *"What already
 * exists"*, and two of its rows say the menus and the shell chrome are already in the tree, at
 * `packages/viz/src/menu/` and `packages/viz/src/dev/`. Both rows point at the **Engineer** shell:
 * an eight-screen menu (`MENU_SCREENS` — `main`, `campaign`, `free-play`, `settings`,
 * `leaderboard`, `challenge`, `commissioning`, `account`) and a tabbed developer surface.
 *
 * The handoff specifies something else: a 212 px rail, a pinned action bar, **one screen at a
 * time**, and a menu whose four entries are the four modes (§ 4). Because the plan recorded the
 * requirement as already met, no slice ever owned it — so every Everyday feature that shipped
 * (levers, interventions, the ghost, the four-goal day, Fix-a-building, the bench) landed *inside
 * the Engineer shell*, and the product a player meets is still the developer tool.
 *
 * That is this repository's signature defect one level up from code: not a behaviour with no
 * caller, but **a requirement whose "already exists" row named a different thing**. It is also not
 * in `docs/18`'s register of honest absences, which names the server halves, the gauntlet, two rule
 * actions and fifteen Fix-a-building cases — and not the shell.
 *
 * ## What this module is, and what it deliberately is not
 *
 * It is the shell and the front door: the rail, the action bar, the screen region, and the menu
 * that chooses a mode. It is **not** the sixteen screens. Screens that have no implementation
 * behind them say so on the menu rather than dead-ending, because the handoff's definition of done
 * is explicit that *no control silently does nothing*, and a mode tile that opens an empty screen
 * is exactly that.
 */

/**
 * The screen keys from GAMEPLAY § 4's inventory.
 *
 * The full sixteen are named here rather than only the ones that are built, because the inventory
 * is the contract and a key that is missing from the type is a screen nobody can even route to.
 * {@link EVERYDAY_SCREENS_BUILT} is the honest subset, and the menu reads *that* — so the type
 * carries the design and the runtime carries the truth, and the two cannot be confused.
 */
export const EVERYDAY_SCREENS = [
  'menu',
  'door',
  'brief',
  'stage',
  'report',
  'towers',
  'building',
  'contract',
  'rush',
  'fixit',
  'workshop',
  'bench',
  'designer',
  'tuner',
  'week',
  'board',
  'settings',
] as const;

export type EverydayScreen = (typeof EVERYDAY_SCREENS)[number];

/**
 * Which flow the stage and the report are serving — GAMEPLAY § 4.
 *
 * The stage is **one component with a run context**, never three copies; the guide says so in the
 * paragraph under the inventory table and it is the reason this is a parameter rather than three
 * screen keys.
 */
export type RunContext = 'daily' | 'campaign' | 'rush';

/** A mode as the menu offers it. */
export interface EverydayMode {
  /** The screen the tile opens when it is available. */
  readonly screen: EverydayScreen;
  readonly title: string;
  /** One line under the title — what the loop is. */
  readonly blurb: string;
  /** § 5's session shape, shown so a player can pick by how long they have. */
  readonly shape: string;
  /**
   * `undefined` when the mode opens, or the reason it does not.
   *
   * **A string here is a refusal a player reads, not a disabled tile with no explanation.** The
   * handoff's definition of done requires every control to reach the simulation *or say it does
   * not*; a greyed tile says neither.
   */
  readonly unavailable?: string | undefined;
}

/** The shell's whole state. Deliberately small: the screen, the flow, and nothing else. */
export interface EverydayState {
  readonly screen: EverydayScreen;
  readonly ctx: RunContext;
  /**
   * Screens visited, root-most first, for the action bar's `‹ back`.
   *
   * Never contains `menu`: the menu is the root and *leaving a mode* clears the stack rather than
   * pushing onto it, which is the same rule `menu/menu.ts#navigate` already applies to the
   * Engineer menu and is restated here rather than imported so the two shells do not share a
   * mutable idea of history.
   */
  readonly history: readonly EverydayScreen[];
}

/** The root, named rather than assumed — GAMEPLAY § 3.5. */
export const EVERYDAY_ROOT: EverydayScreen = 'menu';

/**
 * The class on the Everyday shell's own root element.
 *
 * It is a shared constant rather than a literal in one file because **two shells write `inert` on
 * `document.body`'s children and each has to be able to recognise the other's root**.
 * `dev/main.ts#shellBehindMenu` hands `menuPanel.ts#coverShell` every body child that is not its own
 * overlay, so with nothing to exclude it took the Everyday shell out of the page the moment the
 * Engineer menu opened behind it — the front door, unclickable, with no error anywhere.
 *
 * Declared here, in the module with no DOM imports, so `dev/main.ts` can exclude it without
 * depending on the shell itself.
 */
export const EVERYDAY_ROOT_CLASS = 'everyday';
