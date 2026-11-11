import { describe, expect, it } from 'vitest';

import {
  ACTION_BAR_ROWS,
  TEST_SIMULATION_LEAVE,
  TEST_SIMULATION_NOTE,
  TEST_SIMULATION_PRIMARY,
  actionBarFor,
  testSimulationBarOf,
} from './actionBar.js';
import {
  GAME_FLOORS,
  GAME_FLOOR_ORDER,
  floorDirection,
  floorKeyOf,
  floorOfScreen,
  gameFloorOf,
} from './floors.js';
import { EVERYDAY_MODES } from './modes.js';
import { isScreenBuilt } from './screens.js';
import { EVERYDAY_SCREENS, MODE_PICKS, RUN_CONTEXTS, TEST_SIMULATION_LABEL } from './types.js';

/**
 * The building the game is laid out as — [§ D1627](../../../../DECISIONS.md).
 */
describe('the floors', () => {
  it('is one floor per key, top floor first', () => {
    expect(GAME_FLOORS.map((floor) => floor.key)).toEqual([...GAME_FLOOR_ORDER]);
    for (const key of GAME_FLOOR_ORDER) expect(gameFloorOf(key).key).toBe(key);
  });

  /* § D525's order, and § D1445's ruling that Scenario is the top floor. */
  it('gives every mode a floor above the lobby, Scenario on top, reading its menu tile', () => {
    const play = GAME_FLOORS.filter((floor) => floor.pick !== undefined);
    expect(play.map((floor) => floor.pick)).toEqual([...MODE_PICKS]);
    const lobbyIndex = GAME_FLOOR_ORDER.indexOf('L');
    for (const floor of play) {
      expect(GAME_FLOOR_ORDER.indexOf(floor.key)).toBeLessThan(lobbyIndex);
      const mode = EVERYDAY_MODES.find((candidate) => candidate.pick === floor.pick);
      expect(floor.name).toBe(mode?.title);
      expect(floor.body).toBe(mode?.blurb);
      expect(floor.status).toBe(mode?.unavailable ?? mode?.shape);
      expect(floor.screen).toBe(mode?.screen);
    }
  });

  it('opens a built screen from every floor and every room, and no room twice', () => {
    const rooms = GAME_FLOORS.flatMap((floor) => floor.rooms.map((room) => room.screen));
    expect(new Set(rooms).size).toBe(rooms.length);
    for (const floor of GAME_FLOORS) {
      expect(isScreenBuilt(floor.screen), floor.key).toBe(true);
      for (const room of floor.rooms) {
        expect(isScreenBuilt(room.screen), room.label).toBe(true);
        /* A room is on the floor the tray will put the car at when it opens. */
        expect(floorOfScreen({ screen: room.screen, ctx: 'daily' })).toBe(floor.key);
      }
      expect(floorOfScreen({ screen: floor.screen, ctx: floor.pick === 'campaign' ? 'campaign' : 'daily' })).toBe(floor.key);
    }
  });

  it('puts every screen on a floor in every context', () => {
    for (const screen of EVERYDAY_SCREENS) {
      for (const ctx of RUN_CONTEXTS) {
        expect(GAME_FLOOR_ORDER).toContain(floorOfScreen({ screen, ctx }));
        expect(GAME_FLOOR_ORDER).toContain(floorOfScreen({ screen, ctx }, true));
      }
    }
  });

  it('keeps a day on the floor of the flow it is played in', () => {
    for (const screen of ['door', 'brief', 'stage', 'report'] as const) {
      expect(floorOfScreen({ screen, ctx: 'daily' })).toBe('3');
      expect(floorOfScreen({ screen, ctx: 'campaign' })).toBe('2');
      expect(floorOfScreen({ screen, ctx: 'rush' })).toBe('1');
      expect(floorOfScreen({ screen, ctx: 'watch' })).toBe('M');
      expect(floorOfScreen({ screen, ctx: 'replay' })).toBe('M');
    }
  });

  /*
   * The decoupling § D1627 asks for, as the tray shows it: a run started from the design floor is a
   * test simulation and stays on B, and it never reads as a day of a mode.
   */
  it('keeps a test simulation on the design floor, through its stage and its report', () => {
    expect(floorOfScreen({ screen: 'stage', ctx: 'daily' }, true)).toBe('B');
    expect(floorOfScreen({ screen: 'report', ctx: 'daily' }, true)).toBe('B');
    /* The flag is about the stage; it moves nothing else, and no other flow. */
    expect(floorOfScreen({ screen: 'brief', ctx: 'daily' }, true)).toBe('3');
    expect(floorOfScreen({ screen: 'stage', ctx: 'campaign' }, true)).toBe('2');
    expect(floorOfScreen({ screen: 'stage', ctx: 'rush' }, true)).toBe('1');
  });

  it('calls the design floor’s run a test simulation on both of its benches, and nowhere above the lobby', () => {
    const primaryOf = (screen: string): readonly string[] =>
      ACTION_BAR_ROWS.filter((row) => row.screen === screen).flatMap((row) => row.primary.variants);
    expect(primaryOf('workshop')).toEqual([TEST_SIMULATION_LABEL]);
    expect(primaryOf('tuner')).toEqual([TEST_SIMULATION_LABEL]);
    expect(primaryOf('designer')).toEqual([TEST_SIMULATION_LABEL]);
    for (const row of ACTION_BAR_ROWS) {
      if (floorOfScreen({ screen: row.screen, ctx: row.ctx ?? 'daily' }) === 'B') continue;
      expect(row.primary.variants, row.screen).not.toContain(TEST_SIMULATION_LABEL);
    }
    expect(gameFloorOf('B').body).toContain('test simulation');
  });

  it('gives a test simulation a bar of its own: back to its bench, and no day’s timeline', () => {
    for (const screen of ['stage', 'report'] as const) {
      const daily = actionBarFor({ screen, ctx: 'daily' });
      expect(daily.timeline, 'the daily row is the one being replaced').toBeDefined();
      for (const origin of ['workshop', 'designer'] as const) {
        const tested = testSimulationBarOf(daily, origin);
        expect(tested.leave).toEqual({ label: TEST_SIMULATION_LEAVE, inert: false, screen: origin });
        expect(tested.back).toBeUndefined();
        expect(tested.timeline).toBeUndefined();
        /* The report's primary is the screen's own; the stage's is named for a test, which closes no day. */
        if (screen === 'stage') {
          expect(tested.primary.label).toBe(TEST_SIMULATION_PRIMARY);
          expect(tested.note).toBe(TEST_SIMULATION_NOTE);
        } else {
          expect(tested.primary).toBe(daily.primary);
        }
        expect(tested.screen).toBe(screen);
      }
    }
  });

  /* § D1629: the plates are the shortcuts, so there is no second list of keys to drift from them. */
  it('reads a floor’s own plate as its key, in either case, and nothing else', () => {
    for (const key of GAME_FLOOR_ORDER) {
      expect(floorKeyOf(key)).toBe(key);
      expect(floorKeyOf(key.toLowerCase())).toBe(key);
    }
    for (const other of ['4', 'x', 'Enter', ' ', 'Escape', 'ArrowUp']) expect(floorKeyOf(other)).toBeUndefined();
  });

  it('says which way a ride goes', () => {
    expect(floorDirection('L', '3')).toBe('up');
    expect(floorDirection('3', 'B')).toBe('down');
    expect(floorDirection('M', 'M')).toBeUndefined();
  });
});
