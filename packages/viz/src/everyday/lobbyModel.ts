/**
 * **The lobby, as words and as one small machine** — the game's front door and its main menu, which
 * are one screen ([§ D1628](../../../../DECISIONS.md)).
 *
 * The player stands in front of the building drawn in section: a shaft, a car, and six landings,
 * each a way to play. Pointing at a landing sends the car to it, and pressing one steps out onto
 * that floor. `lobbyScreen.ts` is the mount, on the split the rest of `everyday/` keeps so the copy
 * is sweepable and the machine is testable in the node tier.
 *
 * ## How it came to be one screen
 *
 * [§ D1445](../../../../DECISIONS.md) built a lobby in front of the menu, to
 * `docs/design/design_handoff_lobby_intro/`: press CALL, wait for the car, pick a floor on the
 * panel, wait for the doors or a six-second countdown, ride floor by floor, then press *Step out*.
 * Read off that build's own timings table (420 ms a floor, a 450 ms chime, a 1 150 ms door and a
 * 150 ms settle), the shortest route from a cold launch to Scenario was four presses and about ten
 * seconds of motion nobody could skip. [§ D1627](../../../../DECISIONS.md) made a landing one press
 * and ruled that motion supports a selection and never gates one, which left two screens doing one
 * job: a hall that picked a mode, and a menu of three tiles that picked a mode. The product owner
 * then asked for them to be one (§ D1628). This is that screen. It is the shell's root, it is drawn
 * inside the shell with the tray beside it, and the three mode tiles are its three top landings.
 *
 * ## Where the floors come from
 *
 * `floors.ts`, which the left tray's shaft reads too, so the hall and the tray are the same
 * building at two sizes. The three mode floors read `modes.ts#EVERYDAY_MODES` through it, title,
 * blurb and session shape alike, so a landing cannot name a mode differently from anything else.
 *
 * Pure. No DOM, no timers, no audio; the mount owns all three and asks this module what to draw.
 */

import { GAME_FLOORS, gameFloorOf, type GameFloor, type GameFloorKey, type GameFloorRoom } from './floors.js';

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
}

/** Cold launch: the car at the lobby, its doors opening, nothing pointed at. */
export const LOBBY_INITIAL: LobbyState = Object.freeze({ car: 'L' as const, pointed: false });

/** Point at a landing (hover or focus): the car goes there and the display describes it. */
export function lobbyPoint(state: LobbyState, key: GameFloorKey): LobbyState {
  return state.car === key && state.pointed ? state : { ...state, car: key, pointed: true };
}

/**
 * Press a landing: the floor to step out onto. Total over the floors that open, and the press never
 * waits on the car. The lobby's own landing does not open, because the player is standing on it.
 */
export function lobbyPress(key: Exclude<GameFloorKey, 'L'>): GameFloor {
  return gameFloorOf(key);
}

/* -------------------------------------------------------------------------- *
 * The words
 * -------------------------------------------------------------------------- */

/** Every fixed string the lobby draws that is not a floor's. */
export const LOBBY_COPY = Object.freeze({
  kicker: 'THE LOBBY',
  building: 'Elevator Sim',
  welcomeKicker: 'WELCOME',
  welcomeTitle: 'Choose a floor',
  welcomeBody: 'Every floor is a way to play. Press one and you are there.',
  firstVisit: 'First time here? The walkthrough is two short screens.',
  /** The first visit's own button, beside the sentence above. */
  walkthrough: 'Start with the walkthrough',
  /** The lobby's landing, where a press would go nowhere. */
  here: 'YOU ARE HERE',
  directoryLabel: 'Floors',
});

/** One landing, as the hall draws it. */
export interface LobbyLanding {
  readonly key: GameFloorKey;
  readonly name: string;
  readonly body: string;
  /** The amber line, or empty. */
  readonly status: string;
  /** The rooms on the floor, each one press away. */
  readonly rooms: readonly GameFloorRoom[];
  /** Whether the car is standing here. */
  readonly here: boolean;
  /** Whether the landing is a press. Every one is but the lobby's own. */
  readonly opens: boolean;
}

export interface LobbyView {
  readonly car: GameFloorKey;
  readonly landings: readonly LobbyLanding[];
  /** The display beside the shaft. */
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  readonly status: string;
  /** Whether to offer the walkthrough by name: a first visit, as the host says. */
  readonly offerWalkthrough: boolean;
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
      rooms: floor.rooms,
      here: floor.key === state.car,
      opens: floor.key !== 'L',
    })),
    kicker: at === undefined ? LOBBY_COPY.welcomeKicker : `FLOOR ${at.key} · ${at.group}`,
    title: at?.name ?? LOBBY_COPY.welcomeTitle,
    body: at?.body ?? welcomeBody,
    status: at?.status ?? '',
    offerWalkthrough: input.firstVisit === true,
  };
}
