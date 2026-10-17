/**
 * **The lobby, as words and as one machine** — the elevator cold-open that picks a mode.
 *
 * The design is `docs/design/design_handoff_lobby_intro/`: the player stands in a lobby facing
 * closed doors, presses CALL, the car rides down and opens, and the car operating panel inside it is
 * the mode picker. Closing the doors rides to the chosen floor and steps out onto that floor's
 * screen. This module is the half of that which needs no document: the floor table, the door
 * machine, and every string the screen draws. `lobbyScreen.ts` is the mount, on the split the rest
 * of `everyday/` keeps so the copy is sweepable and the machine is testable in the node tier.
 *
 * ## The floor map is the handoff's, re-read under § D525
 *
 * The handoff numbers nine floors and names four of them after tiles that
 * [§ D525](../../../../DECISIONS.md) retired (*Today's tower*, *Campaign*, *Endless rush*, *Fix a
 * building*). The product owner ruled on 2026-10-13 that the panel follows the ruling in force:
 * Scenario on the top floor, then Career, then Rush, then today's scenario, which `docs/39` § 3's
 * rename map makes Scenario content. Fix-a-building cases stay inside the Scenario hub, exactly where
 * the menu already keeps them. Floors 4 to L are the handoff's. The owner also asked for the
 * two-screen tutorial ([§ D529](../../../../DECISIONS.md)) to sit on the panel, and it is the
 * basement, **B**, one stop under the lobby. [§ D1445](../../../../DECISIONS.md) records both.
 *
 * ## Where the words on the play floors come from
 *
 * The handoff asks that the panel's status lines *"come from the same live values the Everyday menu
 * cards use, so the two surfaces never disagree"*. So the three mode floors read
 * `modes.ts#EVERYDAY_MODES` and the today floor reads `scenarioModel.ts#SCENARIO_ENTRIES`, title,
 * blurb and session shape alike. Nothing on those four floors is typed here, which is also why the
 * kicker carries the floor's group rather than the handoff's `3 MIN` length tag: a minute literal in
 * a fourth place is how the shapes came to disagree with the ladder before (GitHub issue #559).
 *
 * Pure. No DOM, no timers, no audio; the mount owns all three and asks this module what to draw.
 */

import { EVERYDAY_MODES } from './modes.js';
import { SCENARIO_ENTRIES } from './scenarioModel.js';
import type { EverydayModePick, EverydayScreen } from './types.js';

/* -------------------------------------------------------------------------- *
 * The floors
 * -------------------------------------------------------------------------- */

/** The panel's stops, bottom to top. The indicator steps through them in this order. */
export const LOBBY_FLOOR_ORDER = ['B', 'L', '1', '2', '3', '4', '5', '6', '7', '8'] as const;

export type LobbyFloorKey = (typeof LOBBY_FLOOR_ORDER)[number];

/** The panel's four groups, top to bottom, as the left rail names the first three. */
export const LOBBY_GROUPS = ['PLAY', 'DESIGN', 'WORLD', 'LEARN'] as const;

export type LobbyGroup = (typeof LOBBY_GROUPS)[number];

/** One button on the panel and what the in-car display says about it. */
export interface LobbyFloor {
  readonly key: LobbyFloorKey;
  readonly group: LobbyGroup;
  /** The label beside the button and the display's title. */
  readonly name: string;
  /** The display's body. */
  readonly body: string;
  /** The display's amber line, or empty. */
  readonly status: string;
  /** Where *Step out* goes. Every one is a registered screen; `lobbyModel.test.ts` holds that. */
  readonly screen: EverydayScreen;
  /** The menu pick a mode floor stands for, so stepping out selects the same card the menu would. */
  readonly pick?: EverydayModePick | undefined;
}

function modeFloor(key: LobbyFloorKey, pick: EverydayModePick): LobbyFloor {
  const mode = EVERYDAY_MODES.find((candidate) => candidate.pick === pick);
  if (mode === undefined) throw new Error(`no menu tile carries the pick ${pick}`);
  return Object.freeze({
    key,
    group: 'PLAY' as const,
    name: mode.title,
    body: mode.blurb,
    status: mode.unavailable ?? mode.shape,
    screen: mode.screen,
    pick,
  });
}

function todayFloor(key: LobbyFloorKey): LobbyFloor {
  const entry = SCENARIO_ENTRIES.find((candidate) => candidate.id === 'today');
  if (entry === undefined) throw new Error('the Scenario hub has no today entry');
  return Object.freeze({
    key,
    group: 'PLAY' as const,
    name: entry.title,
    body: entry.blurb,
    status: entry.shape,
    screen: entry.screen,
    pick: 'scenario' as const,
  });
}

/**
 * The panel, top floor first — the order the buttons are drawn in.
 *
 * The four floors below the play group carry the handoff's own descriptions, verbatim. The
 * basement's words are this module's: the handoff has no tutorial floor, and the sentence says what
 * `tutorialScreens.ts` does in the order it does it.
 */
export const LOBBY_FLOORS: readonly LobbyFloor[] = Object.freeze([
  modeFloor('8', 'scenario'),
  modeFloor('7', 'campaign'),
  modeFloor('6', 'rush'),
  todayFloor('5'),
  Object.freeze({
    key: '4' as const,
    group: 'DESIGN' as const,
    name: 'Dispatcher workshop',
    body: 'Build a dispatcher from its weights, name it, and take it into any mode.',
    status: '',
    screen: 'workshop' as const,
  }),
  Object.freeze({
    key: '3' as const,
    group: 'DESIGN' as const,
    name: 'Test bench',
    body: 'Run two dispatchers on the same crowd and see where they part ways.',
    status: '',
    screen: 'bench' as const,
  }),
  Object.freeze({
    key: '2' as const,
    group: 'DESIGN' as const,
    name: 'Design a building',
    body: 'Set the floors, the cars and the crowd for a building of your own.',
    status: '',
    screen: 'designer' as const,
  }),
  Object.freeze({
    key: '1' as const,
    group: 'WORLD' as const,
    name: 'Your week',
    body: 'The last seven days: what you ran, where you placed, and your streak.',
    status: '',
    screen: 'week' as const,
  }),
  Object.freeze({
    key: 'L' as const,
    group: 'WORLD' as const,
    name: 'Boards & ladder',
    body: "Today's board and the season ladder. Watch anyone's run from here.",
    status: '',
    screen: 'board' as const,
  }),
  Object.freeze({
    key: 'B' as const,
    group: 'LEARN' as const,
    name: 'How this works',
    body:
      'Two short screens. Change one thing and watch the building answer, then watch one come ' +
      'apart and see how it could have been saved.',
    status: '',
    screen: 'tutorial' as const,
  }),
]);

/** The floor for a key. Total: every key in the order has exactly one floor. */
export function lobbyFloorOf(key: LobbyFloorKey): LobbyFloor {
  const floor = LOBBY_FLOORS.find((candidate) => candidate.key === key);
  if (floor === undefined) throw new Error(`no floor ${key}`);
  return floor;
}

/* -------------------------------------------------------------------------- *
 * Timings — the handoff's table, and its reduced-motion column
 * -------------------------------------------------------------------------- */

export interface LobbyTimings {
  /** One indicator step. */
  readonly stepMs: number;
  /** The chime to the doors starting to move. */
  readonly chimeToDoorsMs: number;
  /** Door travel. */
  readonly doorMs: number;
}

export const LOBBY_TIMINGS = Object.freeze({
  full: Object.freeze({ stepMs: 420, chimeToDoorsMs: 450, doorMs: 1150 }),
  reduced: Object.freeze({ stepMs: 90, chimeToDoorsMs: 30, doorMs: 1 }),
  /** CLOSE to the car moving: door travel plus this. */
  closeSettleMs: 150,
  /** The auto-close countdown, in whole seconds. Zero would turn it off. */
  autoCloseS: 6,
  /** How long a pressed control stays lit. */
  pressedMs: 260,
  /** How long a warning stays on the display. */
  warningMs: 2200,
});

export function lobbyTimingsFor(reducedMotion: boolean): LobbyTimings {
  return reducedMotion ? LOBBY_TIMINGS.reduced : LOBBY_TIMINGS.full;
}

/* -------------------------------------------------------------------------- *
 * The machine
 * -------------------------------------------------------------------------- */

/** `idle → arriving → open ⇄ closing → travel → arrived → (closing → travel → open)`. */
export type LobbyPhase = 'idle' | 'arriving' | 'open' | 'closing' | 'travel' | 'arrived';

export type LobbyDirection = 'up' | 'down';

export interface LobbyState {
  readonly phase: LobbyPhase;
  /** The floor the indicators show. */
  readonly car: LobbyFloorKey;
  readonly dir?: LobbyDirection | undefined;
  readonly sel?: LobbyFloorKey | undefined;
  readonly held: boolean;
  /** Whole seconds left on the auto-close. */
  readonly count: number;
  /** The Engineer key. */
  readonly keyOn: boolean;
  readonly lantern: boolean;
  /** A transient warning, or empty. */
  readonly flash: string;
  /**
   * Each departure's id. A pending departure proceeds only while its id is still current and the
   * phase is still `closing`; OPEN and HOLD cancel one by moving this on.
   */
  readonly closeId: number;
  /** Where the current ride is going once the doors have shut: the selection, or back to L. */
  readonly bound?: LobbyFloorKey | undefined;
  /** Whether that ride is *Back to the lobby*, which reopens onto the panel with the choice cleared. */
  readonly back: boolean;
}

/** Cold launch: doors closed, the car on 6, CALL lit. */
export const LOBBY_INITIAL: LobbyState = Object.freeze({
  phase: 'idle' as const,
  car: '6' as const,
  held: false,
  count: 0,
  keyOn: false,
  lantern: false,
  flash: '',
  closeId: 0,
  back: false,
});

/** The handoff's warnings, verbatim. */
export const LOBBY_WARNINGS = Object.freeze({
  callFirst: 'Call the car first',
  chooseFirst: 'Choose a floor first',
  holdNeedsOpen: 'Hold works while the doors are open',
});

/**
 * What the mount has to do after a press, beyond drawing the new state.
 *
 * - `ride` — step the indicator toward `to`, then chime, light the lantern and open.
 * - `depart` — wait for the doors, then ride, if `closeId` is still current.
 * - `none` — nothing; the new state is the whole answer.
 */
export type LobbyEffect =
  | { readonly kind: 'none' }
  | { readonly kind: 'ride'; readonly to: LobbyFloorKey }
  | { readonly kind: 'depart'; readonly closeId: number };

export interface LobbyStep {
  readonly state: LobbyState;
  readonly effect: LobbyEffect;
  /** Whether the press made the panel's click. A warning is a press too. */
  readonly click: boolean;
}

const NONE: LobbyEffect = Object.freeze({ kind: 'none' as const });

function warn(state: LobbyState, flash: string): LobbyStep {
  return { state: { ...state, flash }, effect: NONE, click: true };
}

/** CALL on the hall plate. Only from idle; the car rides down to L. */
export function lobbyCall(state: LobbyState): LobbyStep {
  if (state.phase !== 'idle') return { state, effect: NONE, click: false };
  return {
    state: { ...state, phase: 'arriving', flash: '', bound: 'L' },
    effect: { kind: 'ride', to: 'L' },
    click: true,
  };
}

/** A floor button. Sets the choice and restarts the countdown, while the doors are open or closing. */
export function lobbyPick(state: LobbyState, key: LobbyFloorKey): LobbyStep {
  if (state.phase === 'idle') return warn(state, LOBBY_WARNINGS.callFirst);
  if (state.phase !== 'open' && state.phase !== 'closing') return { state, effect: NONE, click: false };
  return { state: { ...state, sel: key, count: LOBBY_TIMINGS.autoCloseS }, effect: NONE, click: true };
}

/** CLOSE, and the auto-close's own departure. Needs a choice; with none it says so. */
export function lobbyClose(state: LobbyState): LobbyStep {
  if (state.phase !== 'open') return { state, effect: NONE, click: true };
  if (state.sel === undefined) return warn(state, LOBBY_WARNINGS.chooseFirst);
  const closeId = state.closeId + 1;
  return {
    state: { ...state, phase: 'closing', lantern: false, held: false, closeId, bound: state.sel },
    effect: { kind: 'depart', closeId },
    click: true,
  };
}

/** OPEN. Idle calls the car; closing reopens and cancels the departure; open restarts the count. */
export function lobbyOpen(state: LobbyState): LobbyStep {
  if (state.phase === 'idle') return lobbyCall(state);
  if (state.phase === 'closing') {
    return {
      state: {
        ...state,
        phase: reopenPhase(state),
        back: false,
        lantern: true,
        closeId: state.closeId + 1,
        count: LOBBY_TIMINGS.autoCloseS,
      },
      effect: NONE,
      click: true,
    };
  }
  if (state.phase === 'open') {
    return { state: { ...state, count: LOBBY_TIMINGS.autoCloseS }, effect: NONE, click: true };
  }
  return { state, effect: NONE, click: true };
}

/**
 * The phase OPEN returns a closing car to. A car closing on the way back from an arrival is still
 * standing at the floor it arrived at, so it reopens onto that arrival rather than onto the panel.
 */
function reopenPhase(state: LobbyState): LobbyPhase {
  return state.back ? 'arrived' : 'open';
}

/** HOLD. Toggles; while closing it reopens and holds. Outside open and closing it says so. */
export function lobbyHold(state: LobbyState): LobbyStep {
  if (state.phase !== 'open' && state.phase !== 'closing') return warn(state, LOBBY_WARNINGS.holdNeedsOpen);
  if (state.phase === 'closing') {
    const phase = reopenPhase(state);
    return {
      state: {
        ...state,
        phase,
        back: false,
        lantern: true,
        closeId: state.closeId + 1,
        held: phase === 'open',
        count: LOBBY_TIMINGS.autoCloseS,
      },
      effect: NONE,
      click: true,
    };
  }
  return {
    state: { ...state, held: !state.held, count: LOBBY_TIMINGS.autoCloseS },
    effect: NONE,
    click: true,
  };
}

/** The key switch. */
export function lobbyTurnKey(state: LobbyState): LobbyStep {
  return { state: { ...state, keyOn: !state.keyOn }, effect: NONE, click: true };
}

/**
 * One second of the auto-close. Counts only while open, chosen and not held; at the last second it
 * closes, exactly as CLOSE would.
 */
export function lobbyTick(state: LobbyState): LobbyStep {
  if (state.phase !== 'open' || state.sel === undefined || state.held || LOBBY_TIMINGS.autoCloseS <= 0) {
    return { state, effect: NONE, click: false };
  }
  if (state.count <= 1) return { ...lobbyClose(state), click: false };
  return { state: { ...state, count: state.count - 1 }, effect: NONE, click: false };
}

/** *Back to the lobby*, from an arrival: close, ride to L, reopen with the choice cleared. */
export function lobbyRideBack(state: LobbyState): LobbyStep {
  if (state.phase !== 'arrived') return { state, effect: NONE, click: false };
  const closeId = state.closeId + 1;
  return {
    state: { ...state, phase: 'closing', lantern: false, held: false, closeId, bound: 'L', back: true },
    effect: { kind: 'depart', closeId },
    click: true,
  };
}

/** Whether a departure scheduled under `closeId` may still leave. */
export function lobbyDepartureStands(state: LobbyState, closeId: number): boolean {
  return state.phase === 'closing' && state.closeId === closeId;
}

/** The doors have shut on a standing departure: the car starts to move. */
export function lobbyDepart(state: LobbyState): LobbyStep {
  const to = state.bound ?? 'L';
  return { state: { ...state, phase: 'travel' }, effect: { kind: 'ride', to }, click: false };
}

/** One indicator step toward `to`. Returns the state with the car moved and the direction lit. */
export function lobbyStepToward(state: LobbyState, to: LobbyFloorKey): LobbyState {
  const at = LOBBY_FLOOR_ORDER.indexOf(state.car);
  const target = LOBBY_FLOOR_ORDER.indexOf(to);
  if (at === target) return { ...state, dir: undefined };
  const next = LOBBY_FLOOR_ORDER[at + (target > at ? 1 : -1)] ?? to;
  return { ...state, car: next, dir: target > at ? 'up' : 'down' };
}

/** The direction a ride from where the car stands to `to` lights, before the first step. */
export function lobbyDirectionTo(state: LobbyState, to: LobbyFloorKey): LobbyDirection | undefined {
  const at = LOBBY_FLOOR_ORDER.indexOf(state.car);
  const target = LOBBY_FLOOR_ORDER.indexOf(to);
  if (at === target) return undefined;
  return target > at ? 'up' : 'down';
}

/** The car has stopped at the end of a ride and the doors have opened. */
export function lobbyArrived(state: LobbyState): LobbyState {
  const base = { ...state, dir: undefined, lantern: true, flash: '', bound: undefined, back: false };
  if (state.phase === 'arriving') return { ...base, phase: 'open', count: LOBBY_TIMINGS.autoCloseS };
  /* A ride back to L reopens onto the panel with the choice cleared. */
  if (state.back) return { ...base, phase: 'open', sel: undefined, held: false, count: LOBBY_TIMINGS.autoCloseS };
  return { ...base, phase: 'arrived' };
}

/** Clear a warning, if it is still the one that was raised. */
export function lobbyClearFlash(state: LobbyState, flash: string): LobbyState {
  return state.flash === flash ? { ...state, flash: '' } : state;
}

/* -------------------------------------------------------------------------- *
 * The words
 * -------------------------------------------------------------------------- */

/** Every fixed string the lobby draws that is not a floor's. */
export const LOBBY_COPY = Object.freeze({
  kicker: 'EVERYDAY MODE',
  building: 'ELEVATOR SIM',
  welcomeKicker: 'WELCOME ABOARD',
  welcomeTitle: 'Choose a floor',
  welcomeBody: 'Every floor is a way to play. Pick one on the panel, then close the doors.',
  firstVisit: 'First time here? B, under the lobby, is a two-screen walkthrough.',
  held: 'DOORS HELD',
  selectFloor: 'SELECT FLOOR',
  engineerKey: 'ENGINEER KEY',
  call: 'CALL',
  open: 'OPEN',
  close: 'CLOSE',
  hold: 'HOLD',
  casual: 'CASUAL',
  engineer: 'ENGINEER',
  stepOut: 'Step out →',
  backToLobby: 'Back to the lobby',
  engineerNote: 'Opens the Engineer view, at its own menu',
  mainMenu: 'Main menu',
  whatThisIs: 'What this is',
  /** The car's accessible name, so the region says what it is to somebody not looking. */
  regionLabel: 'The lobby',
  panelLabel: 'Car operating panel',
});

export interface LobbyView {
  /** The hall and car indicators. */
  readonly car: LobbyFloorKey;
  readonly upLit: boolean;
  readonly downLit: boolean;
  readonly dirGlyph: string;
  /** The panel LCD's right-hand words. */
  readonly lcdLine: string;
  readonly doorsOpen: boolean;
  readonly arrived: boolean;
  readonly held: boolean;
  /** The in-car display. */
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  readonly status: string;
  readonly statusLine: string;
  readonly statusIsWarning: boolean;
  /** The countdown bar, 0 to 1. */
  readonly countFraction: number;
  /** The hint under the doors. */
  readonly hint: string;
  readonly lantern: boolean;
  readonly callState: 'idle' | 'arriving' | 'spent';
  readonly closeLit: boolean;
  /** The arrival view, while arrived. */
  readonly arrivalFloor: string;
  readonly arrivalName: string;
  readonly arrivalBody: string;
  readonly arrivalNote: string;
}

/** Everything the screen draws, from the state. One composer, so the mount and the tests agree. */
export function lobbyViewOf(state: LobbyState, input: { readonly firstVisit?: boolean | undefined } = {}): LobbyView {
  const sel = state.sel === undefined ? undefined : lobbyFloorOf(state.sel);
  const doorsOpen = state.phase === 'open' || state.phase === 'arrived';
  const countdown = state.phase === 'open' && sel !== undefined && !state.held && LOBBY_TIMINGS.autoCloseS > 0;

  let statusLine = '';
  let statusIsWarning = false;
  if (state.flash !== '' && state.phase !== 'idle') {
    statusLine = state.flash;
    statusIsWarning = true;
  } else if (state.phase === 'closing') statusLine = 'Doors closing';
  else if (state.phase === 'travel') statusLine = state.dir === 'down' ? 'Going down' : 'Going up';
  else if (state.phase === 'open' && state.held) statusLine = 'Held until you press Close or Hold';
  else if (countdown) statusLine = `Doors close in ${String(state.count)}`;
  else if (state.phase === 'open' && sel !== undefined) statusLine = 'Press Close to go';
  else if (state.phase === 'open') statusLine = 'Doors open';

  const keyHint = state.keyOn ? ' · engineer view' : '';
  let hint = '';
  if (state.flash !== '' && state.phase === 'idle') hint = state.flash;
  else if (state.phase === 'idle') hint = 'Press CALL';
  else if (state.phase === 'arriving') hint = 'Car on its way';
  else if (state.phase === 'open' && sel === undefined) hint = 'Choose a floor';
  else if (state.phase === 'open') hint = (state.held ? 'Doors held. Press Close when ready' : 'Press Close to go now') + keyHint;
  else if (state.phase === 'travel' && state.bound !== undefined) {
    const to = lobbyFloorOf(state.bound);
    hint = state.back ? LOBBY_COPY.backToLobby : `To ${to.key} · ${to.name}`;
  }

  const welcomeBody =
    input.firstVisit === true ? `${LOBBY_COPY.welcomeBody} ${LOBBY_COPY.firstVisit}` : LOBBY_COPY.welcomeBody;

  return {
    car: state.car,
    upLit: state.dir === 'up',
    downLit: state.dir === 'down',
    dirGlyph: state.dir === 'up' ? '▲' : state.dir === 'down' ? '▼' : '',
    lcdLine: sel !== undefined ? sel.name.toUpperCase() : state.keyOn ? LOBBY_COPY.engineerKey : LOBBY_COPY.selectFloor,
    doorsOpen,
    arrived: state.phase === 'arrived',
    held: state.held,
    kicker: sel !== undefined ? `FLOOR ${sel.key} · ${sel.group}` : LOBBY_COPY.welcomeKicker,
    title: sel?.name ?? LOBBY_COPY.welcomeTitle,
    body: sel?.body ?? welcomeBody,
    status: sel?.status ?? '',
    statusLine,
    statusIsWarning,
    countFraction: countdown ? state.count / LOBBY_TIMINGS.autoCloseS : state.held ? 1 : 0,
    hint,
    lantern: state.lantern,
    callState: state.phase === 'idle' ? 'idle' : state.phase === 'arriving' ? 'arriving' : 'spent',
    closeLit: state.phase === 'closing',
    arrivalFloor: sel === undefined ? '' : `FLOOR ${sel.key}`,
    arrivalName: sel?.name ?? '',
    arrivalBody: sel?.body ?? '',
    arrivalNote: state.keyOn ? LOBBY_COPY.engineerNote : '',
  };
}
