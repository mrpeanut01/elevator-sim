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
 * that chooses a mode. It is **not** the seventeen screens. Screens that have no implementation
 * behind them say so on the menu rather than dead-ending, because the handoff's definition of done
 * is explicit that *no control silently does nothing*, and a mode tile that opens an empty screen
 * is exactly that.
 */

/**
 * The screen keys from GAMEPLAY § 4's inventory.
 *
 * **Seventeen keys, although the guide's own heading says "Sixteen screens".** Count its § 4
 * table: `menu door brief stage report towers building contract rush fixit workshop bench
 * designer tuner week board settings` is seventeen rows. The table is the contract and the
 * heading is a miscount, so this array follows the table and says so rather than repeating the
 * guide's number — a docstring that asserted "sixteen" over a seventeen-entry array would be this
 * repository's signature defect in one line.
 *
 * The full inventory is named here rather than only the screens that are built, because a key
 * that is missing from the type is a screen nobody can even route to.
 * `screens.ts`'s {@link EVERYDAY_SCREENS_BUILT} is the honest subset — derived from the screen
 * registry, never hand-written — and the menu and the rail read *that*. So the type carries the
 * design and the runtime carries the truth, and the two cannot be confused.
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
 * The run contexts, as a value — so a sweep or a test can iterate them rather than restating them.
 *
 * `honesty/surfaces.ts`'s `EVERYDAY_MENU` adapter drives the rail's subline over every screen in
 * every context, and a hand-written `['daily', 'campaign', 'rush']` there went quietly stale the
 * day `watch` landed. Deriving the loop from this array is what makes a new context a new set of
 * swept strings rather than a silent gap.
 */
export const RUN_CONTEXTS = ['daily', 'campaign', 'rush', 'watch'] as const;

/**
 * Which flow the stage and the report are serving — GAMEPLAY § 18's `ctx` line.
 *
 * The stage is **one component with a run context**, never four copies; the guide says so in the
 * paragraph under the inventory table and it is the reason this is a parameter rather than four
 * screen keys. `watch` is § 18's fourth value: the stage replaying somebody else's posted run,
 * which is why § 3.3 gives it its own bar row (`⤺ Stop watching`, no timeline) and § 3.4 exempts
 * it from the leave warning — there is nothing of yours to lose.
 */
export type RunContext = (typeof RUN_CONTEXTS)[number];

/**
 * The menu's selection before commitment — GAMEPLAY § 18's `modePick` line.
 *
 * Not a screen key: `today` opens `door` in the full design (and the stage directly in this
 * build), and the pick exists so the § 3.3 menu row's primary can follow the selected card
 * (*Play today's tower* / *Play the campaign* / …) before anything is entered.
 */
export const MODE_PICKS = ['today', 'campaign', 'rush', 'fixit'] as const;

export type EverydayModePick = (typeof MODE_PICKS)[number];

/** A mode as the menu offers it. */
export interface EverydayMode {
  /** The screen the tile opens when it is available. */
  readonly screen: EverydayScreen;
  /** § 18's `modePick` value for this tile, so the § 3.3 menu primary can follow the card. */
  readonly pick: EverydayModePick;
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

/**
 * The shell's whole state. Deliberately small: the screen, the flow, the menu's pick, nothing else.
 *
 * There is no visited-screen history in it, and that is § 3.3's rule rather than an omission: the
 * bar's `‹ back` appears **only where there is a linear parent** (brief → door, stage → brief,
 * report → stage, building → all buildings, contract → all buildings), so the back target is a
 * fact about the screen, held in `actionBar.ts`'s table, not a stack this state would have to
 * maintain. An earlier draft carried a `history` array for a free-form back; § 3.3 forbids that
 * control, so the field went with it rather than surviving as a written-never-read binding.
 */
export interface EverydayState {
  readonly screen: EverydayScreen;
  readonly ctx: RunContext;
  /**
   * The menu's selected card, before commitment — GAMEPLAY § 18.
   *
   * Optional because only the menu screen reads it; `actionBar.ts` defaults an absent pick to
   * `today`, which is the card the menu highlights first.
   */
  readonly modePick?: EverydayModePick | undefined;
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
