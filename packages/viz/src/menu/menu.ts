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

import { partIdOf } from './partsOfDay.js';
import {
  DEFAULT_SETTINGS,
  LONGEST_OFFERED_RUN_S,
  PLAYBACK_SPEEDS,
  ROOT_SCREEN,
  type ChallengeSelection,
  type FreePlaySelection,
  type MenuCatalogue,
  type MenuScreen,
  type DayPart,
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
  const opening = openingPart(catalogue, demandTemplateId);
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
      durationS: opening.durationS,
      windowStartS: opening.windowStartS,
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
 * Which parts of `demandTemplateId` this catalogue offers, or `[]` for an id it does not carry.
 *
 * The single answer to *what is offered*, read by the opening state, the validator and the panel —
 * § D213's rule applied to the control § D286 replaced two with. A panel that computed its own
 * option list would be a second answer, and the one nobody validated would be the one on screen.
 */
export function partsFor(catalogue: MenuCatalogue, demandTemplateId: string): readonly DayPart[] {
  return catalogue.demandTemplates.find((entry) => entry.id === demandTemplateId)?.parts ?? [];
}

/**
 * The part a fresh player opens on: the shortest one that fits inside {@link LONGEST_OFFERED_RUN_S}.
 *
 * **Derived, not indexed** — § D213's rule, and the reason the function it replaced existed. The
 * opening length used to be `FREE_PLAY_DURATIONS_S[1]`, fifteen minutes, while the first shipped
 * template declares a thirty-minute period; so {@link freePlayIssues} refused the state
 * {@link initialMenuState} had just built, and a new player's first sight of Free play was a
 * disabled *Start* under a refusal (GitHub issue #13). An index cannot know a period's length. This
 * can, and it stays correct when a record's hours move or a day profile lands.
 *
 * **Shortest rather than first** because the shortest is the smallest commitment, and on a day
 * profile it is a *peak* rather than the whole ten hours — which is the answer issue #78 asked for:
 * the first thing a player meets is a rush hour they can watch, not a working day they must sit
 * through. The whole period is last in the list and is still one press away.
 *
 * When nothing fits, the whole period is returned and {@link freePlayIssues} refuses it in words.
 * That is the honest answer: inventing a length outside what is offered would move the refusal to
 * Start, one screen later and with nothing to act on.
 */
function openingPart(
  catalogue: MenuCatalogue,
  demandTemplateId: string,
): { readonly durationS: number; readonly windowStartS: number | null } {
  const parts = partsFor(catalogue, demandTemplateId);
  const fits = [...parts]
    .sort((left, right) => left.durationS - right.durationS)
    .find((part) => part.durationS <= LONGEST_OFFERED_RUN_S);
  const chosen = fits ?? parts.at(-1);
  // A catalogue with no templates at all is a broken install, and `freePlayIssues` says so. The
  // fallback is the shipped recommended period rather than a round number, so the refusal a player
  // reads names a real length.
  return chosen ?? { durationS: 1800, windowStartS: null };
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
  /*
   * The one cross-field rule, and the reason it is here rather than discovered at Start.
   *
   * A part belongs to a template. Change the template and the parts change with it — a `lunch-two-way`
   * has no morning in it — so a selection that named a part of the template it used to have is
   * refused here, in words, rather than reaching `windowTemplate` and throwing *"does not fit inside
   * demand template"* in a place a player cannot act on.
   *
   * This replaced the `constant-iso` minimum-length rule, and it subsumes it: that template's only
   * offered part is its own 120 minutes, so the run that used to be refused for leaving no
   * measurement window is now one a player cannot select in the first place.
   */
  const template = catalogue.demandTemplates.find((entry) => entry.id === selection.demandTemplateId);
  const parts = partsFor(catalogue, selection.demandTemplateId);
  const selected = parts.find(
    (part) => part.id === partIdOf(selection.windowStartS, selection.durationS),
  );
  if (template !== undefined && selected === undefined) {
    issues.push({
      field: 'windowStartS',
      message:
        parts.length === 0
          ? `${template.name} declares no period this menu can run.`
          : `${template.name} does not have that part of the day. It offers ${parts
              .map((part) => part.label)
              .join(', ')}.`,
    });
  }
  if (selected !== undefined && selected.durationS > LONGEST_OFFERED_RUN_S) {
    issues.push({
      field: 'windowStartS',
      message:
        `${selected.label} is ${String(Math.round(selected.durationS / 60))} minutes of demand, ` +
        `longer than the ${String(Math.round(LONGEST_OFFERED_RUN_S / 60))} minutes a single run ` +
        'offers. Pick one of its busy parts instead.',
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
