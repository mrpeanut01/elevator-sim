/**
 * **The lobby, as words and as one small machine** — the elevator hall a cold launch opens on.
 *
 * The player stands in front of the building drawn in section: a shaft, a car, and six landings,
 * each a way to play. Pointing at a landing sends the car to it, and pressing one steps out onto
 * that floor. `lobbyScreen.ts` is the mount, on the split the rest of `everyday/` keeps so the copy
 * is sweepable and the machine is testable in the node tier.
 *
 * ## What this replaced, and why
 *
 * [§ D1445](../../../../DECISIONS.md) built the lobby to `docs/design/design_handoff_lobby_intro/`:
 * press CALL, wait for the car, pick a floor on the panel, wait for the doors or a six-second
 * countdown, ride floor by floor, then press *Step out*. Read off that build's own timings table
 * (420 ms a floor, a 450 ms chime, a 1 150 ms door and a 150 ms settle), the shortest route from a
 * cold launch to Scenario was four presses and about ten seconds of motion nobody could skip: five
 * floors down and a door, a door, then eight floors up and a door. The product owner
 * ruled on 2026-11-11 ([§ D1627](../../../../DECISIONS.md)) that motion supports a selection and
 * never gates one. So the machine below has no phases to wait through: it holds which landing the
 * car is pointed at and whether the Engineer key is turned, and a press is the whole act.
 *
 * ## Where the floors come from
 *
 * `floors.ts`, which the left tray's shaft reads too, so the hall and the tray are the same
 * building at two sizes. The three mode floors read `modes.ts#EVERYDAY_MODES` through it, title,
 * blurb and session shape alike, which is the handoff's own request that the lobby and the menu
 * cards never disagree.
 *
 * Pure. No DOM, no timers, no audio; the mount owns all three and asks this module what to draw.
 */

import { GAME_FLOORS, gameFloorOf, type GameFloor, type GameFloorKey } from './floors.js';

/* -------------------------------------------------------------------------- *
 * Motion — decoration only
 * -------------------------------------------------------------------------- */

export interface LobbyTimings {
  /** The car's glide between two landings, whatever the distance. */
  readonly glideMs: number;
  /** The doors opening on the hall when the lobby mounts. */
  readonly doorMs: number;
}

/**
 * How long the lobby's motion runs. **None of it is waited for**: a press goes where it goes on the
 * same frame, and these only say how long the picture takes to catch up. `lobbyModel.test.ts` holds
 * the glide under a third of a second so that stays true of the picture too.
 */
export const LOBBY_TIMINGS = Object.freeze({
  full: Object.freeze({ glideMs: 240, doorMs: 520 }),
  reduced: Object.freeze({ glideMs: 0, doorMs: 0 }),
});

export function lobbyTimingsFor(reducedMotion: boolean): LobbyTimings {
  return reducedMotion ? LOBBY_TIMINGS.reduced : LOBBY_TIMINGS.full;
}

/* -------------------------------------------------------------------------- *
 * The machine
 * -------------------------------------------------------------------------- */

export interface LobbyState {
  /** The landing the car stands at: the one last pointed at, or the lobby. */
  readonly car: GameFloorKey;
  /** Whether a landing has been pointed at yet. Until one has, the display is the welcome. */
  readonly pointed: boolean;
  /** The Engineer key: with it turned, a press opens the floor in the Engineer view. */
  readonly keyOn: boolean;
}

/** Cold launch: the car at the lobby, its doors opening, nothing pointed at. */
export const LOBBY_INITIAL: LobbyState = Object.freeze({ car: 'L' as const, pointed: false, keyOn: false });

/** Point at a landing (hover or focus): the car goes there and the display describes it. */
export function lobbyPoint(state: LobbyState, key: GameFloorKey): LobbyState {
  return state.car === key && state.pointed ? state : { ...state, car: key, pointed: true };
}

/** Turn the Engineer key, either way. */
export function lobbyTurnKey(state: LobbyState): LobbyState {
  return { ...state, keyOn: !state.keyOn };
}

/** What a press on a landing does: where to step out, and in which view. */
export interface LobbyPress {
  readonly floor: GameFloor;
  readonly engineer: boolean;
}

/** Press a landing. Total: every landing opens, and the press never waits on the car. */
export function lobbyPress(state: LobbyState, key: GameFloorKey): LobbyPress {
  return { floor: gameFloorOf(key), engineer: state.keyOn };
}

/* -------------------------------------------------------------------------- *
 * The words
 * -------------------------------------------------------------------------- */

/** Every fixed string the lobby draws that is not a floor's. */
export const LOBBY_COPY = Object.freeze({
  kicker: 'EVERYDAY MODE',
  building: 'ELEVATOR SIM',
  welcomeKicker: 'WELCOME',
  welcomeTitle: 'Choose a floor',
  welcomeBody: 'Every floor is a way to play. Press one and you are there.',
  firstVisit: 'First time here? The lobby, floor L, has a two-screen walkthrough.',
  engineerKey: 'ENGINEER KEY',
  casual: 'CASUAL',
  engineer: 'ENGINEER',
  engineerNote: 'Floors open in the Engineer view, at its own menu',
  whatThisIs: 'What this is',
  /** The hall's accessible name, so the region says what it is to somebody not looking. */
  regionLabel: 'The lobby',
  directoryLabel: 'Floors',
});

/** One landing, as the hall draws it. */
export interface LobbyLanding {
  readonly key: GameFloorKey;
  readonly name: string;
  readonly body: string;
  /** The amber line, or empty. */
  readonly status: string;
  /** The rooms on the floor, named so the player knows what is behind the door. */
  readonly rooms: string;
  /** Whether the car is standing here. */
  readonly here: boolean;
}

export interface LobbyView {
  readonly car: GameFloorKey;
  readonly landings: readonly LobbyLanding[];
  /** The display beside the shaft. */
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  readonly status: string;
  readonly keyOn: boolean;
  /** What the key does while it is turned, or empty. */
  readonly keyNote: string;
}

/** Everything the hall draws, from the state. One composer, so the mount and the tests agree. */
export function lobbyViewOf(state: LobbyState, input: { readonly firstVisit?: boolean | undefined } = {}): LobbyView {
  const at = state.pointed ? gameFloorOf(state.car) : undefined;
  const welcomeBody =
    input.firstVisit === true ? `${LOBBY_COPY.welcomeBody} ${LOBBY_COPY.firstVisit}` : LOBBY_COPY.welcomeBody;
  return {
    car: state.car,
    landings: GAME_FLOORS.map((floor) => ({
      key: floor.key,
      name: floor.name,
      body: floor.body,
      status: floor.status,
      rooms: floor.rooms.map((room) => room.label).join(' · '),
      here: floor.key === state.car,
    })),
    kicker: at === undefined ? LOBBY_COPY.welcomeKicker : `FLOOR ${at.key} · ${at.group}`,
    title: at?.name ?? LOBBY_COPY.welcomeTitle,
    body: at?.body ?? welcomeBody,
    status: at?.status ?? '',
    keyOn: state.keyOn,
    keyNote: state.keyOn ? LOBBY_COPY.engineerNote : '',
  };
}
