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
  updateChallenge,
  updateFreePlay,
  updateSettings,
} from './menu.js';
import type { ChallengeBoardPage, ChallengeView } from './challenge.js';
import {
  FREE_PLAY_DURATIONS_S,
  MENU_SCREENS,
  PLAYBACK_SPEEDS,
  type CatalogueEntry,
  type ChallengeSelection,
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
  /**
   * Open a week with no assignment — the *endless mode* `c5` and `c8` promise in their rewards and
   * nothing implemented. `menu/enterEndless.ts` is the decision; this member is what makes the
   * shell's switch fail to compile until something performs it.
   */
  | { readonly kind: 'start-endless' }
  | { readonly kind: 'open-board'; readonly configHash: string }
  | { readonly kind: 'account-form'; readonly patch: Record<string, string> }
  | { readonly kind: 'account-submit' }
  | { readonly kind: 'account-mode'; readonly register: boolean }
  | { readonly kind: 'sign-out' }
  /** Post the run on screen to the leaderboard. The member with no handler until this wave. */
  | { readonly kind: 'submit-score' }
  /* ---------------------------------------------------------------- challenge */
  /**
   * The one axis a challenge leaves open. Everything else about the run is the server's.
   *
   * A `field` and a value, like the other two setters — see the note on `set-free-play` for why a
   * prepared patch would be the answer to a question the player has not asked yet.
   */
  | { readonly kind: 'set-challenge'; readonly field: keyof ChallengeSelection; readonly value: string }
  /** Simulate every seed the challenge names, in the order it names them. */
  | { readonly kind: 'run-challenge' }
  /** Post the whole seed set. Never a partial one — see `challengeSubmissionOf`. */
  | { readonly kind: 'post-challenge' };

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
  /**
   * Everything the challenge screen needs, and **nothing it could decide with**.
   *
   * § D218 § 3 is the rule this shape enforces: *the client never decides which challenge is
   * current*. So there is no clock here, no window arithmetic and no `state` this module computes —
   * `view.state`, `view.opensInMs` and `view.closesInMs` are the server's answers, carried. A
   * countdown built by differencing two clocks would be that decision arriving one subtraction
   * later.
   */
  readonly challenge?: ChallengeScreenInput | undefined;
  /**
   * The reader's disclosure level — `mode/types.ts`'s `ViewMode`, taken as a string so this module
   * does not depend on the disclosure layer to draw a menu.
   *
   * Needed for exactly one row, and the reason is `docs/16` S7. `mode/disclosure.ts`'s `BASIC_HIDES`
   * already withholds the energy figures from a Basic reader — a disclosure decision, because R11's
   * axis *may* be shown and is never required to be. So a Basic reader who flipped *Show the energy
   * axis* would see nothing move: a control offered and unable to be honoured, which is the state
   * this whole directory exists to end.
   *
   * S7's answer is that such a control is **not offered**, rather than offered and refused. Defaults
   * to `advanced`, so a caller that does not care gets the whole settings screen.
   */
  readonly viewMode?: 'basic' | 'advanced' | undefined;
}

/** What the shell knows about this week's challenge, and how far the player has got with it. */
export interface ChallengeScreenInput {
  /** The server's answer, or `undefined` before it has answered — or when there is no server. */
  readonly view?: ChallengeView | undefined;
  /** Loading, or the server's own refusal, carried unrewritten. */
  readonly notice?: string | undefined;
  /** How many of the challenge's seeds this browser has simulated. Never a fraction of one. */
  readonly runsDone: number;
  /** Why the seed set cannot be posted, when it cannot. `runIdentity`'s idiom, one layer over. */
  readonly postRefusal?: string | undefined;
  readonly board?: ChallengeBoardPage | undefined;
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
    case 'challenge':
      return 'This week’s challenge';
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
      return {
        ...empty,
        rows: settingsRows(input.state.settings, input.viewMode ?? 'advanced'),
        notices: [SETTINGS_NOTE],
      };
    case 'campaign':
      return { ...empty, rows: campaignRows(), notices: [CAMPAIGN_NOTE] };
    case 'leaderboard':
      return leaderboardBody(input);
    case 'challenge':
      return challengeBody(input);
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
    to('main.campaign', 'Campaign', 'A week on one building — it grows, and the bar rises', 'campaign'),
    to('main.free-play', 'Free play', 'Any building, any dispatcher, any traffic', 'free-play'),
    to(
      'main.challenge',
      'This week’s challenge',
      'Everyone on the same seeds — the dispatcher is what varies',
      'challenge',
    ),
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

function settingsRows(settings: Settings, viewMode: 'basic' | 'advanced'): readonly MenuAffordance[] {
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
    /*
     * Absent in Basic — S7, and see {@link MenuViewInput.viewMode}. Basic withholds the energy
     * figures already, so this row could not be honoured there, and a control that cannot be
     * honoured is not offered.
     */
    ...(viewMode === 'basic'
      ? []
      : [toggle('settings.energy-axis', 'Show the energy axis', 'showEnergyAxis', settings.showEnergyAxis)]),
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
  'bars rise. Clean shifts bank toward clearing the scenario. The Lab tab is a different thing — ' +
  'it judges a dispatcher over a batch of replications rather than over a day.';

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
    {
      id: 'campaign.endless',
      label: 'Keep going',
      detail: 'The same week with no assignment: it grows, nothing is banked, nothing clears',
      kind: 'commit',
      /*
       * `between-games`, because it starts one. It sits on this screen rather than on `main` because
       * it is the contract week minus its contract, and offering it as a peer of Campaign would put
       * two rows on the root that differ in one field a player cannot see from there.
       */
      scope: 'between-games',
      enabled: true,
      intent: { kind: 'start-endless' },
    },
  ]);
}

/* --------------------------------------------------------------- challenge */

/**
 * This week's challenge — the surface that makes the leaderboard's competitive axis the dispatcher.
 *
 * ## What this screen is allowed to say, and what it may not
 *
 * `docs/10` § 5.5 bans *"a leaderboard ranking dispatchers from single runs"*, and this screen
 * points straight at that ban: the whole design is that the dispatcher varies. § D218's answer is
 * that a challenge is scored over a **seed set** with its `n` shown, and that Compare remains the
 * only surface allowed to say one dispatcher beat another. Both halves arrive from the server in the
 * response body — `note` and `compare` — rather than being something this module is trusted to
 * remember, and they are rendered rather than paraphrased.
 *
 * ## The window is drawn and never computed
 *
 * § D218 § 3. Every sentence about when the challenge opens and closes comes from `view.state`,
 * `view.opensInMs`, `view.closesInMs` and `view.clockNote`, all of which the server measured on its
 * own clock. This module has no `Date`, and the shape it is handed gives it nothing to make one out
 * of — which is the point: a client that worked out which challenge was current would be a second
 * answer to a question the server has already answered.
 */
function challengeBody(input: MenuViewInput): Body {
  const challenge = input.challenge;
  const view = challenge?.view;

  if (view === undefined) {
    /*
     * No server, or no answer yet. A row is still offered — `docs/16` § 5 clause 6 is a screen that
     * offered nothing but Back — and it is the one row that is always honest here: go and read the
     * boards that do exist.
     */
    return {
      rows: Object.freeze([
        {
          id: 'challenge.leaderboard',
          label: 'Open the leaderboard',
          detail: 'The boards that do not need this week’s challenge',
          kind: 'navigate' as const,
          scope: 'presentation' as const,
          enabled: true,
          intent: { kind: 'navigate' as const, to: 'leaderboard' as const },
        },
      ]),
      notices: Object.freeze([
        challenge?.notice ??
          'This build was not compiled against a server, so there is no challenge to fetch. ' +
            'Everything else on this menu works without one.',
      ]),
      issues: Object.freeze([]),
    };
  }

  const seeds = view.seedCount;
  const ran = challenge?.runsDone ?? 0;
  const complete = ran >= seeds;
  const open = view.state === 'open';

  const rows: MenuAffordance[] = [
    {
      id: 'challenge.dispatcher',
      label: 'Dispatcher',
      /*
       * The only axis, and it is `between-games` for the same reason every Free Play axis is: it is
       * the run's identity, fixed when the attempt starts and hashed into what the score is a score
       * of. Changing it after running the seeds does not adjust a figure — it means the runs on this
       * browser are of a different configuration, which is why picking one resets the count.
       */
      kind: 'select',
      scope: 'between-games',
      enabled: true,
      options: input.catalogue.dispatchers,
      value: input.state.challenge.dispatcherProfileId,
      intent: {
        kind: 'set-challenge',
        field: 'dispatcherProfileId',
        value: input.state.challenge.dispatcherProfileId,
      },
    },
    {
      id: 'challenge.run',
      label: `Run all ${String(seeds)} seeds`,
      detail:
        ran === 0
          ? 'The same passengers everybody else gets'
          : `${String(ran)} of ${String(seeds)} run on this browser`,
      kind: 'commit',
      scope: 'between-games',
      enabled: true,
      intent: { kind: 'run-challenge' },
    },
    {
      id: 'challenge.post',
      label: 'Post the set',
      kind: 'commit',
      scope: 'between-games',
      enabled: open && complete && input.canPost && challenge?.postRefusal === undefined,
      ...postRefusalFor(input, view, ran, seeds),
      intent: { kind: 'post-challenge' },
    },
    {
      id: 'challenge.metric',
      label: 'Order the board on',
      // Presentation: it re-orders rows that are already published and changes no figure on any of
      // them. § D106 — the four metrics sit beside one another and are never combined.
      kind: 'select',
      scope: 'presentation',
      enabled: true,
      options: BOARD_METRIC_OPTIONS,
      value: input.state.challenge.metric,
      intent: { kind: 'set-challenge', field: 'metric', value: input.state.challenge.metric },
    },
  ];

  /*
   * The board's honesty obligations, carried from the body rather than composed here. `note` is
   * § D218 § 5 clause 2 — the count each row was computed over, the four metrics never blended, and
   * the statement that an order here is a fact about submissions. `compare.note` is clause 5.
   */
  const board = challenge?.board;
  const notices = [
    view.challenge.brief,
    windowLineFor(view),
    view.clockNote,
    ...(board === undefined ? [] : [board.note]),
    ...(board?.otherDataNote === undefined ? [] : [board.otherDataNote]),
    view.compare.note,
  ];

  return {
    rows: Object.freeze(rows),
    notices: Object.freeze(notices),
    issues: Object.freeze(challenge?.notice === undefined ? [] : [challenge.notice]),
  };
}

/**
 * The four the server declares, and no fifth.
 *
 * Written out because they are a **wire vocabulary** rather than a catalogue: `/api/challenge-board`
 * 400s `no-such-metric` on anything else, so a fifth invented here would be a control that always
 * fails. The names are the player's, the ids are the server's.
 */
const BOARD_METRIC_OPTIONS: readonly CatalogueEntry[] = Object.freeze([
  { id: 'awtS', name: 'Average wait' },
  { id: 'wt95S', name: '95th-percentile wait' },
  { id: 'ttdMeanS', name: 'Mean time to destination' },
  { id: 'pctOverLongWait', name: 'Share waiting over a minute' },
]);

/**
 * When the window opens or closes, in the server's own measurement of *how long from now*.
 *
 * Rounded to whole hours and never to a date. A date would be rendered in the reader's timezone from
 * a timestamp, which is the client doing clock arithmetic about a window it does not own — and a
 * player two timezones away would read a different sentence about the same instant.
 */
function windowLineFor(view: ChallengeView): string {
  const hours = (ms: number): string => {
    const whole = Math.max(0, Math.round(ms / 3_600_000));
    return whole === 1 ? '1 hour' : `${String(whole)} hours`;
  };
  switch (view.state) {
    case 'open':
      return view.closesInMs === null
        ? 'Open now.'
        : `Open now — about ${hours(view.closesInMs)} left to post.`;
    case 'upcoming':
      return view.opensInMs === null
        ? 'Not open yet.'
        : `Opens in about ${hours(view.opensInMs)}. You can run it now; you cannot post it yet.`;
    case 'closed':
      return 'Closed. The board stays readable, and nothing further can be posted to it.';
  }
}

/**
 * Why the set cannot be posted — one reason at a time, in the order a player would hit them.
 *
 * Four distinct refusals and never a collapsed one. *Nobody is signed in* is about the player;
 * *the window is shut* is about the challenge; *you have run three of five* is about this browser;
 * and the server's own refusal is about the submission. Showing one sentence for all four would tell
 * a signed-in player to sign in, which is the failure `leaderboardBody` already argues about.
 */
function postRefusalFor(
  input: MenuViewInput,
  view: ChallengeView,
  ran: number,
  seeds: number,
): { readonly disabledWhy?: string } {
  const supplied = input.challenge?.postRefusal;
  if (supplied !== undefined) return { disabledWhy: supplied };
  if (view.state !== 'open') return { disabledWhy: windowLineFor(view) };
  if (ran < seeds) {
    return {
      disabledWhy:
        `A challenge is scored over all ${String(seeds)} seeds, and this browser has run ` +
        `${String(ran)}. Run the set — a partial one is not a smaller score, it is a different ` +
        'question.',
    };
  }
  if (!input.canPost) return { disabledWhy: input.postingRefusal ?? 'Sign in to post a score.' };
  return {};
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
    case 'set-challenge':
      return updateChallenge(state, { [intent.field]: intent.value });
    case 'reopen':
    case 'start':
    case 'open-campaign':
    case 'start-endless':
    case 'open-board':
    case 'account-form':
    case 'account-submit':
    case 'account-mode':
    case 'sign-out':
    case 'submit-score':
    case 'run-challenge':
    case 'post-challenge':
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
