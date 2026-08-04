/**
 * What each menu screen offers, as data — the decision half of `dev/menuPanel.ts`.
 *
 * ## Why this exists when `menu.ts` already does
 *
 * `menu.ts` is the reducer: it answers *what does this state become*. It has never answered *what
 * does this screen offer*, and that question was being answered inside click handlers — five rows
 * built from a literal in `mainScreen`, a Start whose enabled-ness was recomputed inside its own
 * listener, a campaign row whose handler was the only statement anywhere of what picking Campaign
 * means.
 *
 * That is the defect § D214 § 2 created `menu/` to avoid, one layer over: *a decision made inside a
 * click handler needs a document, a canvas and a click to reach, so it cannot be tested and it
 * drifts.* It is also **why** `docs/16` § 5 clauses 2, 3 and 6 shipped — no test could reach the
 * decision, so no test could notice that Start did not start, that it left the week where it was, or
 * that the campaign row selected nothing.
 *
 * ## The intent union is the mechanism, not the tests
 *
 * {@link MenuIntent} is a **value**, not a closure. A closure is unwalkable and uncomparable; a
 * tagged value can be enumerated, compared, and replayed by `playthrough`, and — the half that
 * matters most — it makes the shell's handler an **exhaustive switch**.
 *
 * That is how {@link MenuIntent} `submit-score` earns its place. `menu/client.ts#submit` has existed
 * with **no non-test caller at all**, so the leaderboard could be read and never posted to and the
 * Account row's own subtitle described something no player could do. A test would have found that
 * eventually. A member of this union does better: the shell does not compile until something handles
 * it.
 *
 * ## Every affordance carries its scope
 *
 * {@link MenuAffordance.scope} is required — `docs/16` S1. A control that appears on a screen without
 * anybody having decided when it may move will not typecheck, which is the whole of why the field is
 * not optional.
 */

import type { ChangeScope } from '../scope/types.js';

import {
  FREE_PLAY_RATES,
  back,
  canStart,
  freePlayIssues,
  navigate,
  updateFreePlay,
  updateSettings,
} from './menu.js';
import {
  FREE_PLAY_DURATIONS_S,
  MENU_SCREENS,
  PLAYBACK_SPEEDS,
  type CatalogueEntry,
  type FreePlaySelection,
  type MenuCatalogue,
  type MenuScreen,
  type MenuState,
  type Settings,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Intents
 * -------------------------------------------------------------------------- */

/**
 * Everything a player can ask the menu to do.
 *
 * Deliberately flat and deliberately total. Two members name things that reach outside the menu
 * entirely — {@link MenuIntent} `start` and `submit-score` — and they are here rather than in the
 * panel because *"what did the player ask for"* and *"who does it"* are different questions, and
 * only the first one is testable without a browser.
 */
export type MenuIntent =
  | { readonly kind: 'navigate'; readonly to: MenuScreen }
  | { readonly kind: 'back' }
  /** Re-open the menu over a running game. `docs/16` § 5 clause 5: nothing could, before. */
  | { readonly kind: 'reopen' }
  /*
   * A **field and a value**, never a prepared patch and never a closure.
   *
   * A closure cannot be walked, compared or replayed, and a prepared patch is already the answer to
   * a question the player has not asked yet — a select's affordance is built before anybody picks an
   * option. Naming the field lets the panel and `playthrough` both build the intent from whichever
   * option was chosen, and lets {@link applyIntent} stay the one place that parses a string into a
   * rate, a duration or a speed.
   */
  | { readonly kind: 'set-free-play'; readonly field: keyof FreePlaySelection; readonly value: string }
  | { readonly kind: 'set-setting'; readonly field: keyof Settings; readonly value: string }
  /** Commit the Free Play selection. The shell resets the week and runs it. */
  | { readonly kind: 'start' }
  | { readonly kind: 'open-campaign' }
  | { readonly kind: 'open-board'; readonly configHash: string }
  | { readonly kind: 'account-form'; readonly patch: Record<string, string> }
  | { readonly kind: 'account-submit' }
  | { readonly kind: 'account-mode'; readonly register: boolean }
  | { readonly kind: 'sign-out' }
  /** Post the run on screen to the leaderboard. The member with no handler until this wave. */
  | { readonly kind: 'submit-score' };

/* -------------------------------------------------------------------------- *
 * Affordances
 * -------------------------------------------------------------------------- */

export type AffordanceKind = 'navigate' | 'select' | 'toggle' | 'text' | 'commit' | 'back';

/** One thing on a screen a player can act on. */
export interface MenuAffordance {
  /** Stable, and unique within a screen. `free-play.building`, `main.campaign`. */
  readonly id: string;
  readonly label: string;
  readonly detail?: string | undefined;
  readonly kind: AffordanceKind;
  /** `docs/16` S1. Required, so a control nobody scoped will not compile. */
  readonly scope: ChangeScope;
  readonly enabled: boolean;
  /**
   * Why it is disabled, when it is.
   *
   * Disabled **and explained**, always. A Start that refuses in silence moves an explainable error
   * to the one moment with no words for it — `menuPanel.ts` has said so since it landed, and this
   * field is that rule made structural rather than remembered.
   */
  readonly disabledWhy?: string | undefined;
  readonly options?: readonly CatalogueEntry[] | undefined;
  readonly value?: string | undefined;
  readonly intent: MenuIntent;
}

/** One screen, as everything a renderer needs and nothing it could decide with. */
export interface MenuScreenView {
  readonly screen: MenuScreen;
  readonly title: string;
  /** Sentences shown above the rows. Never a refusal — those are {@link issues}. */
  readonly notices: readonly string[];
  /** Everything wrong with the current selection, in words a player can act on. */
  readonly issues: readonly string[];
  readonly rows: readonly MenuAffordance[];
}

/** What `screenOf` needs from the shell to answer for every screen. */
export interface MenuViewInput {
  readonly state: MenuState;
  readonly catalogue: MenuCatalogue;
  /** Whether somebody is signed in and may post. Decided by `account.ts`, not here. */
  readonly canPost: boolean;
  /** Why posting is refused, when it is — the server's own wording, carried unrewritten. */
  readonly postingRefusal?: string | undefined;
  /** Whether a finished run is on screen at all. */
  readonly hasRun: boolean;
  /**
   * Why the run on screen may not be ranked — `scope/runIdentity.ts`'s reasons, joined.
   *
   * Supplied rather than computed, because deciding it needs a `ViewerState` and the loaded
   * resources, and this module has neither. One derivation, two consumers (`docs/16` S5): the same
   * predicate `provenanceLineOf` asks.
   */
  readonly rankingRefusal?: string | undefined;
  readonly boards?: readonly { readonly configHash: string; readonly entries: number }[] | undefined;
}

/* -------------------------------------------------------------------------- *
 * Titles
 * -------------------------------------------------------------------------- */

export function titleOf(screen: MenuScreen): string {
  switch (screen) {
    case 'main':
      return 'Elevator Sim';
    case 'campaign':
      return 'Campaign';
    case 'free-play':
      return 'Free play';
    case 'settings':
      return 'Settings';
    case 'leaderboard':
      return 'Leaderboard';
    case 'account':
      return 'Account';
  }
}

/* -------------------------------------------------------------------------- *
 * The screens
 * -------------------------------------------------------------------------- */

const BACK: MenuAffordance = Object.freeze({
  id: 'back',
  label: 'Back',
  kind: 'back' as const,
  scope: 'presentation' as const,
  enabled: true,
  intent: { kind: 'back' as const },
});

/**
 * What this screen offers, given the state.
 *
 * Total over {@link MENU_SCREENS} — an exhaustive switch, so a seventh screen is a compile error
 * rather than a screen that silently renders a placeholder. `campaign` **was** that placeholder, and
 * it is `docs/16` § 5 clause 6.
 */
export function screenOf(input: MenuViewInput): MenuScreenView {
  const screen = input.state.screen;
  const view = bodyOf(input, screen);
  return Object.freeze({
    screen,
    title: titleOf(screen),
    notices: view.notices,
    issues: view.issues,
    rows: screen === 'main' ? view.rows : Object.freeze([...view.rows, BACK]),
  });
}

interface Body {
  readonly rows: readonly MenuAffordance[];
  readonly notices: readonly string[];
  readonly issues: readonly string[];
}

const empty = { notices: Object.freeze([]), issues: Object.freeze([]) };

function bodyOf(input: MenuViewInput, screen: MenuScreen): Body {
  switch (screen) {
    case 'main':
      return { ...empty, rows: mainRows() };
    case 'free-play':
      return freePlayBody(input);
    case 'settings':
      return { ...empty, rows: settingsRows(input.state.settings), notices: [SETTINGS_NOTE] };
    case 'campaign':
      return { ...empty, rows: campaignRows(), notices: [CAMPAIGN_NOTE] };
    case 'leaderboard':
      return leaderboardBody(input);
    case 'account':
      return { ...empty, rows: accountRows(input) };
  }
}

/* ------------------------------------------------------------------- main */

function mainRows(): readonly MenuAffordance[] {
  const to = (
    id: string,
    label: string,
    detail: string,
    target: MenuScreen,
  ): MenuAffordance => ({
    id,
    label,
    detail,
    kind: 'navigate',
    scope: 'presentation',
    enabled: true,
    intent: { kind: 'navigate', to: target },
  });
  return Object.freeze([
    to('main.campaign', 'Campaign', 'The scenarios in order, each teaching one thing', 'campaign'),
    to('main.free-play', 'Free play', 'Any building, any dispatcher, any traffic', 'free-play'),
    to('main.leaderboard', 'Leaderboard', 'Verified scores, by configuration', 'leaderboard'),
    to('main.account', 'Account', 'Sign in to post a score', 'account'),
    to('main.settings', 'Settings', 'Presentation only — nothing here changes a run', 'settings'),
  ]);
}

/* -------------------------------------------------------------- free play */

const RATE_OPTIONS: readonly CatalogueEntry[] = Object.freeze(
  FREE_PLAY_RATES.map((rate) => ({
    id: String(rate),
    name: rate === null ? 'This building’s own profile' : `${String(rate)} % of population / 5 min`,
  })),
);

const DURATION_OPTIONS: readonly CatalogueEntry[] = Object.freeze(
  FREE_PLAY_DURATIONS_S.map((seconds) => ({
    id: String(seconds),
    name: `${String(Math.round(seconds / 60))} minutes`,
  })),
);

function freePlayBody(input: MenuViewInput): Body {
  const selection = input.state.freePlay;
  const issues = freePlayIssues(selection, input.catalogue);
  const ready = canStart(selection, input.catalogue);

  const select = (
    id: string,
    label: string,
    field: keyof FreePlaySelection,
    value: string,
    options: readonly CatalogueEntry[],
  ): MenuAffordance => ({
    id,
    label,
    kind: 'select',
    // Every Free Play axis is the run's own identity: fixed when a game starts, hashed into the
    // board a score belongs to. `docs/16` § 3.
    scope: 'between-games',
    enabled: true,
    options,
    value,
    intent: { kind: 'set-free-play', field, value },
  });

  const rows: MenuAffordance[] = [
    select('free-play.building', 'Building', 'buildingId', selection.buildingId, input.catalogue.buildings),
    select(
      'free-play.dispatcher',
      'Dispatcher',
      'dispatcherProfileId',
      selection.dispatcherProfileId,
      input.catalogue.dispatchers,
    ),
    select(
      'free-play.template',
      'Traffic shape',
      'demandTemplateId',
      selection.demandTemplateId,
      input.catalogue.demandTemplates,
    ),
    select(
      'free-play.rate',
      'Arrival rate',
      'arrivalRatePctPop5min',
      String(selection.arrivalRatePctPop5min),
      RATE_OPTIONS,
    ),
    select('free-play.duration', 'Run length', 'durationS', String(selection.durationS), DURATION_OPTIONS),
    {
      id: 'free-play.seed',
      label: 'Seed',
      kind: 'text',
      scope: 'between-games',
      enabled: true,
      value: selection.seed,
      intent: { kind: 'set-free-play', field: 'seed', value: selection.seed },
    },
    {
      id: 'free-play.start',
      label: 'Start',
      kind: 'commit',
      scope: 'between-games',
      enabled: ready,
      ...(ready ? {} : { disabledWhy: issues.map((issue) => issue.message).join(' ') }),
      intent: { kind: 'start' },
    },
  ];

  return {
    rows: Object.freeze(rows),
    notices: Object.freeze([FREE_PLAY_NOTE]),
    issues: Object.freeze(issues.map((issue) => issue.message)),
  };
}

/**
 * Said on the screen rather than only in a decision.
 *
 * Free play is one run. It has no week, so it has no growth and no scheduled event — and before
 * `docs/16` § 5 clause 3 was fixed it silently had both, on whatever day the campaign happened to
 * be sitting on. A sentence that describes what the run is costs nothing and is the difference
 * between a player who trusts the figure and one who should not have.
 */
const FREE_PLAY_NOTE =
  'One run, on day one: the building as it ships, with no tenant growth and nothing scheduled ' +
  'against it. That is what makes it the run a leaderboard can replay.';

/* ---------------------------------------------------------------- settings */

const SETTINGS_NOTE =
  'These change how the simulation is drawn, never what it computes — so they cannot move a score ' +
  'or make two runs incomparable.';

function settingsRows(settings: Settings): readonly MenuAffordance[] {
  const toggle = (id: string, label: string, field: keyof Settings, value: boolean): MenuAffordance => ({
    id,
    label,
    kind: 'toggle',
    scope: 'presentation',
    enabled: true,
    value: value ? 'on' : 'off',
    // The value carried is the one a press would produce, so a walk can press it without knowing
    // that a toggle inverts.
    intent: { kind: 'set-setting', field, value: value ? 'off' : 'on' },
  });
  return Object.freeze([
    toggle('settings.reduce-motion', 'Reduce motion', 'reduceMotion', settings.reduceMotion),
    toggle('settings.energy-axis', 'Show the energy axis', 'showEnergyAxis', settings.showEnergyAxis),
    {
      id: 'settings.playback-speed',
      label: 'Playback speed',
      kind: 'select',
      scope: 'presentation',
      enabled: true,
      value: String(settings.playbackSpeed),
      options: PLAYBACK_SPEEDS.map((speed) => ({ id: String(speed), name: `${String(speed)}×` })),
      intent: { kind: 'set-setting', field: 'playbackSpeed', value: String(settings.playbackSpeed) },
    },
    {
      id: 'settings.theme',
      label: 'Theme',
      kind: 'select',
      scope: 'presentation',
      enabled: true,
      value: settings.theme,
      options: (['system', 'dark', 'light'] as const).map((id) => ({ id, name: id })),
      intent: { kind: 'set-setting', field: 'theme', value: settings.theme },
    },
  ]);
}

/* ---------------------------------------------------------------- campaign */

/**
 * The campaign screen's own words, and the disambiguation they exist to make.
 *
 * `docs/16` § 5 clause 6: this screen rendered a placeholder reading *"the campaign surface is open
 * behind this menu"*, and the row that reached it called `closeMenu()` and selected nothing. Two
 * unrelated surfaces are also called Campaign — the contract week in `shift/` and the batch-judged
 * stages in `campaign/` — so the screen says which one this is instead of leaving a player to find
 * out by pressing it.
 */
const CAMPAIGN_NOTE =
  'A week on one building: each day the tenants grow, something is booked against you, and the ' +
  'bars rise. Clean shifts bank toward clearing the scenario.';

function campaignRows(): readonly MenuAffordance[] {
  return Object.freeze([
    {
      id: 'campaign.open',
      label: 'Open the doors',
      detail: 'Take the current scenario and start the week',
      kind: 'commit',
      scope: 'between-games',
      enabled: true,
      intent: { kind: 'open-campaign' },
    },
  ]);
}

/* ------------------------------------------------------------- leaderboard */

function leaderboardBody(input: MenuViewInput): Body {
  const boards = input.boards ?? [];
  const rows: MenuAffordance[] = boards.map((board) => ({
    id: `leaderboard.${board.configHash}`,
    label: `${board.configHash.slice(0, 8)}…`,
    detail: `${String(board.entries)} posted`,
    kind: 'navigate' as const,
    scope: 'presentation' as const,
    enabled: true,
    intent: { kind: 'open-board' as const, configHash: board.configHash },
  }));

  /*
   * Posting is refused for two entirely different reasons and they are never collapsed.
   *
   * *Nobody is signed in* is about the player. *This run cannot be ranked* is about the run — day 2,
   * a held car, a moved lever — and it is `scope/runIdentity.ts`'s answer, the same one
   * `provenanceLineOf` gives (`docs/16` S5). Showing one sentence for both would tell a signed-in
   * player to sign in.
   */
  const refusal = !input.hasRun
    ? 'There is no finished run to post yet.'
    : (input.rankingRefusal ?? input.postingRefusal);

  rows.push({
    id: 'leaderboard.submit',
    label: 'Post this run',
    kind: 'commit',
    // The submission *is* the run's identity, and nothing outside it may travel with the score.
    scope: 'between-games',
    enabled: input.canPost && input.hasRun && input.rankingRefusal === undefined,
    ...(refusal === undefined ? {} : { disabledWhy: refusal }),
    intent: { kind: 'submit-score' },
  });

  return {
    rows: Object.freeze(rows),
    notices: Object.freeze([LEADERBOARD_NOTE]),
    issues: Object.freeze([]),
  };
}

/**
 * What a board actually is, said where a player reads it.
 *
 * A board is keyed by a digest over the building, the dispatcher, the template, the rate, the
 * duration and the loaded `data/` — **everything except the seed**. So the entries on one board are
 * the same configuration played on different seeds, and picking a different dispatcher does not beat
 * anybody: it moves you to a different board.
 *
 * That is worth saying plainly rather than letting the word *leaderboard* imply a skill ranking it
 * is not. `docs/10` § 5.5 bans *"a leaderboard ranking dispatchers from single runs"*, and the
 * honest way to keep both the board and the ban is to describe the board correctly.
 */
const LEADERBOARD_NOTE =
  'Each board is one configuration across seeds, ranked on the named metric alone. A different ' +
  'dispatcher is a different board rather than a better score.';

/* ------------------------------------------------------------------ account */

function accountRows(input: MenuViewInput): readonly MenuAffordance[] {
  if (input.canPost) {
    return Object.freeze([
      {
        id: 'account.sign-out',
        label: 'Sign out',
        kind: 'commit' as const,
        scope: 'presentation' as const,
        enabled: true,
        intent: { kind: 'sign-out' as const },
      },
    ]);
  }
  return Object.freeze([
    {
      id: 'account.submit',
      label: 'Sign in',
      kind: 'commit' as const,
      scope: 'presentation' as const,
      enabled: true,
      ...(input.postingRefusal === undefined ? {} : { disabledWhy: input.postingRefusal }),
      intent: { kind: 'account-submit' as const },
    },
  ]);
}

/* -------------------------------------------------------------------------- *
 * Applying an intent — the pure half
 * -------------------------------------------------------------------------- */

/**
 * The part of an intent the menu can answer on its own.
 *
 * Navigation and the two setters. Everything else — `start`, `open-campaign`, `submit-score`, the
 * account calls — needs the shell, and is returned unchanged so the shell's switch is the only place
 * that decides what those mean. A reducer that quietly handled half of `start` would be the drift
 * this module exists to stop.
 *
 * **The string parsing lives here and only here.** A select hands back the option's id, and turning
 * `"null"` into *the building's own profile*, `"1800"` into a duration and `"on"` into `true` is one
 * decision each. Spread across the panel it would be three copies, and the one that matters —
 * `null` meaning a real selection rather than a missing one — has already been argued for twice in
 * this directory.
 */
export function applyIntent(state: MenuState, intent: MenuIntent): MenuState {
  switch (intent.kind) {
    case 'navigate':
      return navigate(state, intent.to);
    case 'back':
      return back(state);
    case 'set-free-play':
      return updateFreePlay(state, freePlayPatch(intent.field, intent.value));
    case 'set-setting':
      return updateSettings(state, settingsPatch(intent.field, intent.value));
    case 'reopen':
    case 'start':
    case 'open-campaign':
    case 'open-board':
    case 'account-form':
    case 'account-submit':
    case 'account-mode':
    case 'sign-out':
    case 'submit-score':
      // Not the menu's to answer. Returned unchanged rather than thrown: a render path that threw
      // on an intent it did not own would turn a mis-wired button into a blank screen.
      return state;
  }
}

function freePlayPatch(field: keyof FreePlaySelection, value: string): Partial<FreePlaySelection> {
  switch (field) {
    case 'buildingId':
      return { buildingId: value };
    case 'dispatcherProfileId':
      return { dispatcherProfileId: value };
    case 'demandTemplateId':
      return { demandTemplateId: value };
    case 'arrivalRatePctPop5min':
      // `"null"` is *this building's own profile*, which is a distinct selection and has to survive
      // as one — resolving it to a number here would pin a rate `data/` is free to change.
      return { arrivalRatePctPop5min: value === 'null' ? null : Number(value) };
    case 'durationS':
      return { durationS: Number(value) };
    case 'seed':
      // Not parsed. A seed is an identity rather than a quantity, and `freePlayIssues` is what says
      // so in words when it is not digits.
      return { seed: value };
  }
}

function settingsPatch(field: keyof Settings, value: string): Partial<Settings> {
  switch (field) {
    case 'reduceMotion':
      return { reduceMotion: value === 'on' };
    case 'showEnergyAxis':
      return { showEnergyAxis: value === 'on' };
    case 'playbackSpeed':
      return { playbackSpeed: Number(value) };
    case 'theme':
      return { theme: value === 'dark' || value === 'light' ? value : 'system' };
  }
}
