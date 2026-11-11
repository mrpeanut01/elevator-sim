/**
 * **The building the game is laid out as** — one floor directory, read by the left tray's shaft
 * (`rail.ts`), the lobby (`lobbyModel.ts`) and the shell's floor-change motion (`shell.ts`).
 *
 * The product owner's direction of 2026-11-11, recorded as [§ D1627](../../../../DECISIONS.md):
 * every way to play is a floor, the tray is a shaft with a car standing at the floor the player is
 * on, and changing floors is one press with motion laid over it rather than a ride to sit through.
 * So this module is the map and nothing else. It answers two questions, *what are the floors* and
 * *which floor is this screen on*, and every surface that draws the building asks it rather than
 * keeping a list of its own.
 *
 * ## The floors, and why they are these six
 *
 * The three modes of [§ D525](../../../../DECISIONS.md) are the three numbered floors, Scenario on
 * top, then Career, then Rush, which is the order § D1445 already ruled for the lobby's panel. Under
 * them sit the three places that are not a mode: the records a player keeps (their week and the
 * boards), the lobby (the front desk every mode is entered from) and, below ground, the design
 * floor. § D1445's panel gave each of ten screens a button of its own; six floors with rooms on
 * them is what lets the tray draw the whole building at once and still reach every room in one
 * press.
 *
 * ## The design floor is below the lobby on purpose
 *
 * A building drawn there, or a dispatcher built there, is *tried* there: a test simulation that
 * files nothing (`types.ts#TEST_SIMULATION_LABEL`). To be played, a building has to exist and be
 * entered from one of the three floors above the lobby. {@link floorOfScreen} is where that reads
 * on the tray: a test simulation's stage keeps the car on **B**, so the tray never shows a test as
 * a day of Scenario.
 *
 * Pure. The mode floors read `modes.ts#EVERYDAY_MODES`, so a floor and its menu tile cannot name
 * the same mode two ways.
 */

import { EVERYDAY_MODES } from './modes.js';
import type { EverydayModePick, EverydayScreen, EverydayState } from './types.js';

/** The stops, top floor first: the order the shaft is drawn in. */
export const GAME_FLOOR_ORDER = ['3', '2', '1', 'M', 'L', 'B'] as const;

export type GameFloorKey = (typeof GAME_FLOOR_ORDER)[number];

/** A room on a floor: a screen the tray reaches in one press. */
export interface GameFloorRoom {
  readonly screen: EverydayScreen;
  readonly label: string;
}

export interface GameFloor {
  readonly key: GameFloorKey;
  /** The floor's name, on the tray and on the lobby's directory. */
  readonly name: string;
  /** What kind of floor it is, for the lobby's kicker. */
  readonly group: 'PLAY' | 'RECORDS' | 'LOBBY' | 'DESIGN';
  /** One sentence on what happens here. */
  readonly body: string;
  /** The amber line under it, or empty. A mode floor carries its tile's session shape. */
  readonly status: string;
  /** Where pressing the floor goes. */
  readonly screen: EverydayScreen;
  /** The menu pick a mode floor stands for, so pressing it commits exactly as the tile does. */
  readonly pick?: EverydayModePick | undefined;
  /** The rooms that are always on the floor. Career's rooms depend on the career; `rail.ts` adds them. */
  readonly rooms: readonly GameFloorRoom[];
}

function modeFloor(key: GameFloorKey, pick: EverydayModePick): GameFloor {
  const mode = EVERYDAY_MODES.find((candidate) => candidate.pick === pick);
  if (mode === undefined) throw new Error(`no menu tile carries the pick ${pick}`);
  return Object.freeze({
    key,
    name: mode.title,
    group: 'PLAY' as const,
    body: mode.blurb,
    status: mode.unavailable ?? mode.shape,
    screen: mode.screen,
    pick,
    rooms: Object.freeze([]),
  });
}

/** The building, top floor first. */
export const GAME_FLOORS: readonly GameFloor[] = Object.freeze([
  modeFloor('3', 'scenario'),
  modeFloor('2', 'campaign'),
  modeFloor('1', 'rush'),
  Object.freeze({
    key: 'M' as const,
    name: 'Records',
    group: 'RECORDS' as const,
    body: "Your last seven days, today's board and the season ladder. Watch anyone's run from here.",
    status: '',
    screen: 'week' as const,
    rooms: Object.freeze([
      Object.freeze({ screen: 'week' as const, label: 'Your week' }),
      Object.freeze({ screen: 'board' as const, label: 'Boards & ladder' }),
    ]),
  }),
  Object.freeze({
    key: 'L' as const,
    name: 'Lobby',
    group: 'LOBBY' as const,
    body: 'The front desk, and the main menu. Every floor starts here, with the walkthrough and what this game is.',
    status: '',
    screen: 'menu' as const,
    rooms: Object.freeze([
      Object.freeze({ screen: 'tutorial' as const, label: 'How this works' }),
      Object.freeze({ screen: 'landing' as const, label: 'What this is' }),
    ]),
  }),
  Object.freeze({
    key: 'B' as const,
    name: 'Design',
    group: 'DESIGN' as const,
    body:
      'Build a dispatcher, draw a building, and try either in a test simulation. Nothing down here ' +
      'is scored: a building is played on the floors above the lobby.',
    status: '',
    screen: 'workshop' as const,
    rooms: Object.freeze([
      Object.freeze({ screen: 'workshop' as const, label: 'Dispatcher workshop' }),
      Object.freeze({ screen: 'bench' as const, label: 'Test bench' }),
      Object.freeze({ screen: 'designer' as const, label: 'Design a building' }),
    ]),
  }),
]);

/** The floor for a key. Total: every key in the order has exactly one floor. */
export function gameFloorOf(key: GameFloorKey): GameFloor {
  const floor = GAME_FLOORS.find((candidate) => candidate.key === key);
  if (floor === undefined) throw new Error(`no floor ${key}`);
  return floor;
}

/**
 * Which floor a screen is on.
 *
 * Most screens have one floor. The four a day is played through (`door`, `brief`, `stage`,
 * `report`) are one component per flow, so their floor is the flow's: a career day is on 2, a rush
 * on 1, a watched run and a replayed day on M where both are started, and everything else on 3.
 * `test` is the one input that is not on the state: whether a test simulation is standing, which
 * only the host knows. With it, the stage and its report stay on **B**.
 */
export function floorOfScreen(state: EverydayState, test = false): GameFloorKey {
  switch (state.screen) {
    case 'menu':
    case 'landing':
    case 'tutorial':
    case 'collapse':
    case 'settings':
      return 'L';
    case 'scenario':
    case 'fixit':
      return '3';
    case 'towers':
    case 'building':
    case 'contract':
      return '2';
    case 'rush':
      return '1';
    case 'week':
    case 'board':
      return 'M';
    case 'workshop':
    case 'bench':
    case 'designer':
    case 'tuner':
      return 'B';
    case 'door':
    case 'brief':
    case 'stage':
    case 'report':
      if (state.ctx === 'campaign') return '2';
      if (state.ctx === 'rush') return '1';
      if (state.ctx === 'watch' || state.ctx === 'replay') return 'M';
      return test && (state.screen === 'stage' || state.screen === 'report') ? 'B' : '3';
  }
}

/** Whether a ride from one floor to another goes up, down, or nowhere. */
export function floorDirection(from: GameFloorKey, to: GameFloorKey): 'up' | 'down' | undefined {
  const a = GAME_FLOOR_ORDER.indexOf(from);
  const b = GAME_FLOOR_ORDER.indexOf(to);
  if (a === b) return undefined;
  return b < a ? 'up' : 'down';
}
