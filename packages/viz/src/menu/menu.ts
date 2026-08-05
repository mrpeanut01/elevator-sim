/**
 * The menu as a pure state machine: navigation, settings and the Free Play selection.
 *
 * No `document`, no `window`, no clock. Everything here is a function from state and an action to
 * new state, which is what makes the shell testable at all — see `types.ts` for why that separation
 * is not stylistic.
 *
 * ## What this module refuses to do
 *
 * It does not resolve a selection into a `SimulationConfig`. Free Play names a building, a
 * dispatcher and a template **by id**, and turning those into a run is `dev/state.ts`'s job, which
 * already owns that translation for the campaign. Two places that both build a run config is how
 * the two paths drift apart, and a leaderboard that verifies by replay (§ D214 § 3) cannot survive
 * the client and the server disagreeing about what a selection meant.
 */

import {
  DEFAULT_SETTINGS,
  FREE_PLAY_DURATIONS_S,
  PLAYBACK_SPEEDS,
  ROOT_SCREEN,
  type ChallengeSelection,
  type FreePlaySelection,
  type MenuCatalogue,
  type MenuScreen,
  type MenuState,
  type SelectionIssue,
  type Settings,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Opening state
 * -------------------------------------------------------------------------- */

/**
 * The state a fresh player starts in, with Free Play pre-selected to something runnable.
 *
 * **Pre-selected from the catalogue's first entry rather than from a named default**, because a
 * named default is a sixth hard-coded list (§ D213) and would break the moment that building was
 * renamed. A catalogue with no buildings is a broken install, and {@link freePlayIssues} says so
 * rather than this function inventing an id that does not exist.
 *
 * *Runnable* is asserted against the real `data/` load in `menu.test.ts`, because it was not true:
 * the length was a fixed index into the ladder and the opening template's period is longer than
 * the rung it landed on. See {@link openingDurationS}.
 */
export function initialMenuState(catalogue: MenuCatalogue, seed = '20260804'): MenuState {
  const demandTemplateId = catalogue.demandTemplates[0]?.id ?? '';
  return Object.freeze({
    screen: ROOT_SCREEN,
    history: Object.freeze([]),
    settings: DEFAULT_SETTINGS,
    freePlay: Object.freeze({
      buildingId: catalogue.buildings[0]?.id ?? '',
      dispatcherProfileId: catalogue.dispatchers[0]?.id ?? '',
      demandTemplateId,
      // `null` is "this building's own profile", which is the honest default: the player has not
      // yet expressed a rate, and picking one for them would pin a number `data/` may change.
      arrivalRatePctPop5min: null,
      durationS: openingDurationS(catalogue, demandTemplateId),
      seed,
    }),
    challenge: Object.freeze({
      /*
       * The first shipped dispatcher, and **only** as an opening position. A challenge fixes
       * everything else; this is the axis the player competes on, so a default that looked like a
       * recommendation would be the product picking the answer.
       */
      dispatcherProfileId: catalogue.dispatchers[0]?.id ?? '',
      // The board's own default ordering. Named here rather than assumed by the panel, so a client
      // that never touched the control still sends a metric the server declares.
      metric: 'awtS',
    }),
  });
}

/**
 * The shortest offered length the opening template can actually be measured over.
 *
 * **Derived, not indexed** — § D213's rule, applied to a number rather than a list. The opening
 * length was `FREE_PLAY_DURATIONS_S[1]`, 15 minutes, while the first shipped template
 * (`rise-and-fall`) declares a 30-minute period; so {@link freePlayIssues} refused the state
 * {@link initialMenuState} had just built, and the first thing a new player met on the Free play
 * screen was a disabled *Start* under a refusal. An index cannot know that. This can, and stays
 * correct when a template's period changes or the ladder moves.
 *
 * The ladder is sorted rather than assumed ascending, so *shortest that fits* keeps meaning that
 * if the offered lengths are ever reordered.
 *
 * When no offered length is long enough the longest is returned and {@link freePlayIssues} still
 * refuses it — which is the honest answer, because that selection genuinely cannot be measured and
 * quietly inventing a length outside the ladder would refuse at Start instead, one screen later.
 */
function openingDurationS(catalogue: MenuCatalogue, demandTemplateId: string): number {
  const minimum =
    catalogue.demandTemplates.find((entry) => entry.id === demandTemplateId)?.minimumDurationS ?? 0;
  const offered = [...FREE_PLAY_DURATIONS_S].sort((left, right) => left - right);
  return offered.find((seconds) => seconds >= minimum) ?? offered.at(-1) ?? 900;
}

/* -------------------------------------------------------------------------- *
 * Navigation
 * -------------------------------------------------------------------------- */

/**
 * Go to a screen, remembering where we came from.
 *
 * Navigating to the screen already shown is a **no-op that returns the same object**, so a panel
 * re-rendering on every input event does not grow an unbounded history of itself. Navigating to
 * the root clears the stack rather than pushing onto it — "Main menu" is a way out, not a step
 * deeper.
 */
export function navigate(state: MenuState, screen: MenuScreen): MenuState {
  if (screen === state.screen) return state;
  if (screen === ROOT_SCREEN) {
    return Object.freeze({ ...state, screen, history: Object.freeze([]) });
  }
  return Object.freeze({
    ...state,
    screen,
    history: Object.freeze([...state.history, state.screen].filter((entry) => entry !== ROOT_SCREEN)),
  });
}

/**
 * Return to the previous screen, or to the root when there is none.
 *
 * Never fails and never leaves the player nowhere: an empty history means the root, which is also
 * what a freshly restored state has.
 */
export function back(state: MenuState): MenuState {
  const previous = state.history[state.history.length - 1];
  if (previous === undefined) {
    return state.screen === ROOT_SCREEN
      ? state
      : Object.freeze({ ...state, screen: ROOT_SCREEN, history: Object.freeze([]) });
  }
  return Object.freeze({
    ...state,
    screen: previous,
    history: Object.freeze(state.history.slice(0, -1)),
  });
}

/* -------------------------------------------------------------------------- *
 * Settings
 * -------------------------------------------------------------------------- */

/**
 * Apply a partial settings change, refusing values the UI does not offer.
 *
 * A playback speed outside {@link PLAYBACK_SPEEDS} is **dropped rather than clamped**: it can only
 * arrive from restored state written by another build, and silently substituting the nearest
 * offered value would present a preference the player never chose as though they had.
 */
export function updateSettings(state: MenuState, patch: Partial<Settings>): MenuState {
  const next: Settings = { ...state.settings, ...patch };
  const settings: Settings = Object.freeze({
    ...next,
    playbackSpeed: PLAYBACK_SPEEDS.includes(next.playbackSpeed)
      ? next.playbackSpeed
      : state.settings.playbackSpeed,
  });
  return Object.freeze({ ...state, settings });
}

/* -------------------------------------------------------------------------- *
 * Free play
 * -------------------------------------------------------------------------- */

/** Apply a partial change to the Free Play selection. Validation is {@link freePlayIssues}. */
export function updateFreePlay(state: MenuState, patch: Partial<FreePlaySelection>): MenuState {
  return Object.freeze({ ...state, freePlay: Object.freeze({ ...state.freePlay, ...patch }) });
}

/** The same, for the one axis a challenge leaves open. See {@link ChallengeSelection}. */
export function updateChallenge(state: MenuState, patch: Partial<ChallengeSelection>): MenuState {
  return Object.freeze({ ...state, challenge: Object.freeze({ ...state.challenge, ...patch }) });
}

/**
 * Arrival rates Free Play offers, as a fraction of population per five minutes.
 *
 * Spans the shipped buildings' own operating points — `garden-apartments` is quotable around 10 %
 * and `midtown-office` saturates near 2 % — so one ladder cannot be "reasonable" for every building
 * and this deliberately does not try. `null` (the building's own profile) is offered first and is
 * the safe choice; the rest are the player's to get wrong, which is the point of Free Play.
 */
export const FREE_PLAY_RATES: readonly (number | null)[] = Object.freeze([
  null,
  0.5,
  1,
  2,
  3,
  4,
  6,
  8,
  10,
  14,
]);

/**
 * Everything wrong with a selection, or an empty array.
 *
 * Returns **all** the problems rather than the first, because a player who fixes one and is then
 * told about the next has been made to guess how many there are.
 */
export function freePlayIssues(
  selection: FreePlaySelection,
  catalogue: MenuCatalogue,
): readonly SelectionIssue[] {
  const issues: SelectionIssue[] = [];
  const has = (entries: readonly { readonly id: string }[], id: string): boolean =>
    entries.some((entry) => entry.id === id);

  if (!has(catalogue.buildings, selection.buildingId)) {
    issues.push({
      field: 'buildingId',
      message:
        selection.buildingId === ''
          ? 'No building is selected, and none is loaded to select.'
          : `No building "${selection.buildingId}" is loaded. It may have been renamed or removed.`,
    });
  }
  if (!has(catalogue.dispatchers, selection.dispatcherProfileId)) {
    issues.push({
      field: 'dispatcherProfileId',
      message: `No dispatcher "${selection.dispatcherProfileId}" is loaded.`,
    });
  }
  if (!has(catalogue.demandTemplates, selection.demandTemplateId)) {
    issues.push({
      field: 'demandTemplateId',
      message: `No demand template "${selection.demandTemplateId}" is loaded.`,
    });
  }
  if (!FREE_PLAY_DURATIONS_S.includes(selection.durationS)) {
    issues.push({
      field: 'durationS',
      message: `A ${String(selection.durationS)} s run is not one of the offered lengths.`,
    });
  }
  /*
   * The one cross-field rule, and the reason it is here rather than discovered at Start.
   *
   * A demand template declares its own period. `constant-iso` is 120 minutes and discards 15 of
   * warm-up and 5 of cool-down; run it for 15 and the kernel throws *"leaves no measurement
   * window"* — correct, and said in a place a player cannot act on. Refused here, in words, with
   * both numbers in them.
   */
  const template = catalogue.demandTemplates.find((entry) => entry.id === selection.demandTemplateId);
  const minimum = template?.minimumDurationS;
  if (minimum !== undefined && selection.durationS < minimum) {
    issues.push({
      field: 'durationS',
      message:
        `${template?.name ?? selection.demandTemplateId} needs at least ` +
        `${String(Math.round(minimum / 60))} minutes — it discards a warm-up and a cool-down, and a ` +
        `${String(Math.round(selection.durationS / 60))}-minute run leaves nothing to measure.`,
    });
  }

  const rate = selection.arrivalRatePctPop5min;
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
    issues.push({
      field: 'arrivalRatePctPop5min',
      message: 'An arrival rate must be a positive percentage, or unset to use the building’s own.',
    });
  }
  // A seed is an identity and is replayed by the server (§ D214 § 3), so it has to survive a round
  // trip through JSON and a database exactly. Digits only, and bounded, which rules out both the
  // float that would lose precision and the 10 kB string that would be stored.
  if (!/^\d{1,20}$/u.test(selection.seed)) {
    issues.push({
      field: 'seed',
      message: 'A seed is 1–20 digits. It names a run rather than measuring one.',
    });
  }

  return Object.freeze(issues);
}

/** Whether a selection can be started. */
export function canStart(selection: FreePlaySelection, catalogue: MenuCatalogue): boolean {
  return freePlayIssues(selection, catalogue).length === 0;
}
