import { describe, expect, it } from 'vitest';

import { GAME_FLOORS, GAME_FLOOR_ORDER } from './floors.js';
import {
  LOBBY_COPY,
  LOBBY_INITIAL,
  LOBBY_TIMINGS,
  lobbyPoint,
  lobbyPress,
  lobbyTimingsFor,
  lobbyTurnKey,
  lobbyViewOf,
} from './lobbyModel.js';
import { isScreenBuilt } from './screens.js';

/**
 * The lobby's machine — § D1445 as redrawn by [§ D1627](../../../../DECISIONS.md).
 *
 * The machine is small on purpose, and what these cases hold is the reason: a press is the whole
 * trip from any state, and nothing the model owns can be waited on.
 */
describe('the lobby', () => {
  it('opens with the car at the lobby and the welcome on the display', () => {
    const view = lobbyViewOf(LOBBY_INITIAL);
    expect(view.car).toBe('L');
    expect(view.kicker).toBe(LOBBY_COPY.welcomeKicker);
    expect(view.title).toBe(LOBBY_COPY.welcomeTitle);
    expect(view.body).toBe(LOBBY_COPY.welcomeBody);
    expect(view.status).toBe('');
    expect(view.landings.map((landing) => landing.key)).toEqual([...GAME_FLOOR_ORDER]);
    expect(view.landings.filter((landing) => landing.here).map((landing) => landing.key)).toEqual(['L']);
  });

  it('tells a first visit where the walkthrough is, and only a first visit', () => {
    expect(lobbyViewOf(LOBBY_INITIAL, { firstVisit: true }).body).toContain(LOBBY_COPY.firstVisit);
    expect(lobbyViewOf(LOBBY_INITIAL, { firstVisit: false }).body).not.toContain(LOBBY_COPY.firstVisit);
    expect(lobbyViewOf(LOBBY_INITIAL).body).not.toContain(LOBBY_COPY.firstVisit);
    /* And the sentence is true: the walkthrough is a room on the floor it names. */
    const lobby = GAME_FLOORS.find((floor) => floor.key === 'L');
    expect(LOBBY_COPY.firstVisit).toContain('floor L');
    expect(lobby?.rooms.map((room) => room.screen)).toContain('tutorial');
  });

  it('points the car at a landing and describes that floor, for every landing', () => {
    for (const floor of GAME_FLOORS) {
      const view = lobbyViewOf(lobbyPoint(LOBBY_INITIAL, floor.key));
      expect(view.car).toBe(floor.key);
      expect(view.title).toBe(floor.name);
      expect(view.body).toBe(floor.body);
      expect(view.status).toBe(floor.status);
      expect(view.kicker).toBe(`FLOOR ${floor.key} · ${floor.group}`);
      expect(view.landings.filter((landing) => landing.here).map((landing) => landing.key)).toEqual([floor.key]);
    }
  });

  it('describes the lobby itself once it has been pointed at, rather than the welcome', () => {
    const view = lobbyViewOf(lobbyPoint(LOBBY_INITIAL, 'L'));
    expect(view.title).toBe('Lobby');
    expect(view.kicker).not.toBe(LOBBY_COPY.welcomeKicker);
  });

  it('answers the same state for a landing already pointed at, so the mount can skip the glide', () => {
    const pointed = lobbyPoint(LOBBY_INITIAL, '2');
    expect(lobbyPoint(pointed, '2')).toBe(pointed);
    expect(lobbyPoint(pointed, '1')).not.toBe(pointed);
  });

  it('names every room on a landing, so the player knows what is behind the door', () => {
    const view = lobbyViewOf(LOBBY_INITIAL);
    for (const floor of GAME_FLOORS) {
      const landing = view.landings.find((candidate) => candidate.key === floor.key);
      for (const room of floor.rooms) expect(landing?.rooms).toContain(room.label);
      if (floor.rooms.length === 0) expect(landing?.rooms).toBe('');
    }
  });

  /*
   * § D1627's rule in the model's own terms. The § D1445 machine refused a floor before CALL and
   * CLOSE with nothing chosen; this one has no state a press is refused in.
   */
  it('lets a press step out from any state, onto the floor pressed, with no state it is refused in', () => {
    const states = [
      LOBBY_INITIAL,
      lobbyTurnKey(LOBBY_INITIAL),
      ...GAME_FLOOR_ORDER.map((key) => lobbyPoint(LOBBY_INITIAL, key)),
    ];
    for (const state of states) {
      for (const floor of GAME_FLOORS) {
        const press = lobbyPress(state, floor.key);
        expect(press.floor).toBe(floor);
        expect(press.engineer).toBe(state.keyOn);
        expect(isScreenBuilt(press.floor.screen), `${floor.key} opens a built screen`).toBe(true);
      }
    }
  });

  it('turns the Engineer key both ways, and says what it does only while it is turned', () => {
    const on = lobbyTurnKey(LOBBY_INITIAL);
    expect(lobbyViewOf(on).keyOn).toBe(true);
    expect(lobbyViewOf(on).keyNote).toBe(LOBBY_COPY.engineerNote);
    const off = lobbyTurnKey(on);
    expect(lobbyViewOf(off).keyOn).toBe(false);
    expect(lobbyViewOf(off).keyNote).toBe('');
    /* The key does not move the car or forget the landing. */
    expect(lobbyTurnKey(lobbyPoint(LOBBY_INITIAL, '3')).car).toBe('3');
  });

  /*
   * The motion budget. Nothing waits on these, and they are still held short: the § D1445 table
   * ran 420 ms a floor and 1 150 ms a door, about ten seconds from a cold launch to Scenario.
   */
  it('keeps the whole of its motion under a second, and draws none with reduced motion', () => {
    expect(LOBBY_TIMINGS.full.glideMs).toBeLessThanOrEqual(300);
    expect(LOBBY_TIMINGS.full.glideMs + LOBBY_TIMINGS.full.doorMs).toBeLessThan(1000);
    expect(lobbyTimingsFor(true)).toEqual({ glideMs: 0, doorMs: 0 });
    expect(lobbyTimingsFor(false)).toBe(LOBBY_TIMINGS.full);
  });
});
