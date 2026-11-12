import { describe, expect, it } from 'vitest';

import { GAME_FLOORS, GAME_FLOOR_ORDER } from './floors.js';
import {
  LOBBY_COPY,
  LOBBY_INITIAL,
  LOBBY_TIMINGS,
  lobbyPoint,
  lobbyPress,
  lobbyTimingsFor,
  lobbyViewOf,
} from './lobbyModel.js';
import { EVERYDAY_MODES } from './modes.js';
import { isScreenBuilt } from './screens.js';

/**
 * The lobby's machine — § D1445 as redrawn by [§ D1627](../../../../DECISIONS.md) and made the
 * main menu by [§ D1628](../../../../DECISIONS.md).
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
    /* And the button for it is offered on a first visit only, where the sentence is. */
    expect(lobbyViewOf(LOBBY_INITIAL, { firstVisit: true }).offerWalkthrough).toBe(true);
    expect(lobbyViewOf(LOBBY_INITIAL, { firstVisit: false }).offerWalkthrough).toBe(false);
    expect(lobbyViewOf(LOBBY_INITIAL).offerWalkthrough).toBe(false);
    /* The walkthrough is also a room on the lobby's own floor, for anybody who comes back for it. */
    const lobby = GAME_FLOORS.find((floor) => floor.key === 'L');
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

  it('hands every room on a landing over as its own press', () => {
    const view = lobbyViewOf(LOBBY_INITIAL);
    for (const floor of GAME_FLOORS) {
      const landing = view.landings.find((candidate) => candidate.key === floor.key);
      expect(landing?.rooms).toEqual(floor.rooms);
    }
  });

  /*
   * § D1628: the lobby is the menu, so its own landing is where the player stands and is not a
   * press. Every other landing opens, the three on top being the three mode tiles.
   */
  it('opens every landing but its own, and the three on top are the modes', () => {
    const view = lobbyViewOf(LOBBY_INITIAL);
    expect(view.landings.filter((landing) => !landing.opens).map((landing) => landing.key)).toEqual(['L']);
    expect(view.landings.slice(0, 3).map((landing) => landing.name)).toEqual(EVERYDAY_MODES.map((mode) => mode.title));
  });

  /*
   * § D1627's rule in the model's own terms. The § D1445 machine refused a floor before CALL and
   * CLOSE with nothing chosen; this one has no state at all behind a press.
   */
  it('lets a press step out onto the floor pressed, with no state it depends on', () => {
    for (const floor of GAME_FLOORS) {
      if (floor.key === 'L') continue;
      const pressed = lobbyPress(floor.key);
      expect(pressed).toBe(floor);
      expect(isScreenBuilt(pressed.screen), `${floor.key} opens a built screen`).toBe(true);
      for (const room of pressed.rooms) expect(isScreenBuilt(room.screen), room.label).toBe(true);
    }
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
