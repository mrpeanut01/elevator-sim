import { describe, expect, it } from 'vitest';

import {
  LOBBY_FLOORS,
  LOBBY_FLOOR_ORDER,
  LOBBY_INITIAL,
  LOBBY_TIMINGS,
  LOBBY_WARNINGS,
  lobbyArrived,
  lobbyCall,
  lobbyClose,
  lobbyDepart,
  lobbyDepartureStands,
  lobbyDirectionTo,
  lobbyFloorOf,
  lobbyHold,
  lobbyOpen,
  lobbyPick,
  lobbyRideBack,
  lobbyStepToward,
  lobbyTick,
  lobbyTimingsFor,
  lobbyTurnKey,
  lobbyViewOf,
  type LobbyFloorKey,
  type LobbyState,
} from './lobbyModel.js';
import { EVERYDAY_MODES } from './modes.js';
import { SCENARIO_ENTRIES } from './scenarioModel.js';
import { isScreenBuilt } from './screens.js';

/** Ride the car to wherever the state is bound, the way the mount's timers do, and arrive. */
function rideOut(state: LobbyState, to: LobbyFloorKey): LobbyState {
  let next = state;
  for (let guard = 0; guard < LOBBY_FLOOR_ORDER.length && next.car !== to; guard += 1) {
    next = lobbyStepToward(next, to);
  }
  return lobbyArrived(next);
}

/** CALL and ride down: the doors open on L. */
function called(): LobbyState {
  const step = lobbyCall(LOBBY_INITIAL);
  expect(step.effect).toEqual({ kind: 'ride', to: 'L' });
  return rideOut(step.state, 'L');
}

describe('the floor map', () => {
  it('has one floor per stop, and every floor opens a registered screen', () => {
    expect(LOBBY_FLOORS.map((floor) => floor.key).sort()).toEqual([...LOBBY_FLOOR_ORDER].sort());
    for (const floor of LOBBY_FLOORS) expect(isScreenBuilt(floor.screen), floor.key).toBe(true);
  });

  it('puts § D525\'s three modes on the top floors, Scenario first, in the menu tiles\' own words', () => {
    const play = LOBBY_FLOORS.filter((floor) => floor.group === 'PLAY');
    expect(play.map((floor) => floor.key)).toEqual(['8', '7', '6', '5']);
    for (const [index, mode] of EVERYDAY_MODES.entries()) {
      const floor = play[index];
      expect(floor?.name).toBe(mode.title);
      expect(floor?.body).toBe(mode.blurb);
      expect(floor?.screen).toBe(mode.screen);
      expect(floor?.status).toBe(mode.unavailable ?? mode.shape);
    }
  });

  it('makes floor 5 the Scenario hub\'s today row, word for word', () => {
    const today = SCENARIO_ENTRIES.find((entry) => entry.id === 'today');
    const five = lobbyFloorOf('5');
    expect(five.name).toBe(today?.title);
    expect(five.body).toBe(today?.blurb);
    expect(five.screen).toBe('door');
  });

  it('keeps the retired tile names off the panel', () => {
    const names = LOBBY_FLOORS.map((floor) => floor.name);
    for (const retired of ["Today's tower", 'Campaign', 'Endless rush', 'Fix a building']) {
      expect(names).not.toContain(retired);
    }
  });

  it('puts the tutorial in the basement, under the lobby', () => {
    const basement = lobbyFloorOf('B');
    expect(basement.screen).toBe('tutorial');
    expect(LOBBY_FLOOR_ORDER.indexOf('B')).toBeLessThan(LOBBY_FLOOR_ORDER.indexOf('L'));
  });
});

describe('the door machine', () => {
  it('starts with the doors shut and the car on 6', () => {
    const view = lobbyViewOf(LOBBY_INITIAL);
    expect(view.car).toBe('6');
    expect(view.doorsOpen).toBe(false);
    expect(view.callState).toBe('idle');
    expect(view.hint).toBe('Press CALL');
  });

  it('steps the indicator down from 6 to L with the down arrow lit, then opens', () => {
    let state = lobbyCall(LOBBY_INITIAL).state;
    expect(lobbyDirectionTo(state, 'L')).toBe('down');
    const seen: string[] = [];
    while (state.car !== 'L') {
      state = lobbyStepToward(state, 'L');
      seen.push(state.car);
      expect(lobbyViewOf(state).downLit).toBe(true);
    }
    expect(seen).toEqual(['5', '4', '3', '2', '1', 'L']);
    state = lobbyArrived(state);
    expect(state.phase).toBe('open');
    expect(lobbyViewOf(state).lantern).toBe(true);
    expect(lobbyViewOf(state).hint).toBe('Choose a floor');
  });

  it('refuses a floor before the car is called, and CLOSE with nothing chosen', () => {
    expect(lobbyPick(LOBBY_INITIAL, '8').state.flash).toBe(LOBBY_WARNINGS.callFirst);
    const open = called();
    const refused = lobbyClose(open);
    expect(refused.state.phase).toBe('open');
    expect(refused.state.flash).toBe(LOBBY_WARNINGS.chooseFirst);
    expect(lobbyViewOf(refused.state).statusIsWarning).toBe(true);
  });

  it('counts down from the pick and closes on its own at the last second', () => {
    let state = lobbyPick(called(), '8').state;
    expect(state.count).toBe(LOBBY_TIMINGS.autoCloseS);
    expect(lobbyViewOf(state).statusLine).toBe(`Doors close in ${String(LOBBY_TIMINGS.autoCloseS)}`);
    for (let second = LOBBY_TIMINGS.autoCloseS; second > 1; second -= 1) state = lobbyTick(state).state;
    const last = lobbyTick(state);
    expect(last.state.phase).toBe('closing');
    expect(last.effect.kind).toBe('depart');
  });

  it('cancels a departure with OPEN, as a real car does', () => {
    const closing = lobbyClose(lobbyPick(called(), '7').state);
    if (closing.effect.kind !== 'depart') throw new Error('expected a departure');
    const reopened = lobbyOpen(closing.state).state;
    expect(reopened.phase).toBe('open');
    expect(lobbyDepartureStands(reopened, closing.effect.closeId)).toBe(false);
  });

  it('holds the doors with HOLD, stops the count, and HOLD while closing reopens and holds', () => {
    const picked = lobbyPick(called(), '6').state;
    const held = lobbyHold(picked).state;
    expect(held.held).toBe(true);
    expect(lobbyTick(held).state).toEqual(held);
    expect(lobbyViewOf(held).countFraction).toBe(1);
    expect(lobbyHold(LOBBY_INITIAL).state.flash).toBe(LOBBY_WARNINGS.holdNeedsOpen);
    const closing = lobbyClose(picked).state;
    const caught = lobbyHold(closing).state;
    expect(caught.phase).toBe('open');
    expect(caught.held).toBe(true);
  });

  it('rides up to the chosen floor and arrives on it', () => {
    const closing = lobbyClose(lobbyPick(called(), '8').state);
    if (closing.effect.kind !== 'depart') throw new Error('expected a departure');
    expect(lobbyDepartureStands(closing.state, closing.effect.closeId)).toBe(true);
    const travel = lobbyDepart(closing.state);
    expect(travel.effect).toEqual({ kind: 'ride', to: '8' });
    const moving = lobbyStepToward(travel.state, '8');
    expect(lobbyViewOf(moving).statusLine).toBe('Going up');
    expect(lobbyViewOf(moving).hint).toBe('To 8 · Scenario');
    const arrived = rideOut(travel.state, '8');
    expect(arrived.phase).toBe('arrived');
    expect(lobbyViewOf(arrived).arrivalName).toBe('Scenario');
  });

  it('rides down to the basement and says so', () => {
    const travel = lobbyDepart(lobbyClose(lobbyPick(called(), 'B').state).state);
    const moving = lobbyStepToward(travel.state, 'B');
    expect(moving.car).toBe('B');
    expect(lobbyViewOf(moving).statusLine).toBe('Going down');
    expect(lobbyArrived(moving).phase).toBe('arrived');
  });

  it('rides back to L with the choice cleared, and OPEN on the way reopens onto the arrival', () => {
    const arrived = rideOut(lobbyDepart(lobbyClose(lobbyPick(called(), '4').state).state).state, '4');
    const back = lobbyRideBack(arrived);
    expect(lobbyOpen(back.state).state.phase).toBe('arrived');
    const home = rideOut(lobbyDepart(back.state).state, 'L');
    expect(home.phase).toBe('open');
    expect(home.sel).toBeUndefined();
  });

  it('turns the key, and the arrival says where it will step out', () => {
    const keyed = lobbyTurnKey(called()).state;
    expect(lobbyViewOf(keyed).lcdLine).toBe('ENGINEER KEY');
    const arrived = rideOut(lobbyDepart(lobbyClose(lobbyPick(keyed, '3').state).state).state, '3');
    expect(lobbyViewOf(arrived).arrivalNote).not.toBe('');
  });

  it('tells a first visit where the walkthrough is, and nobody else', () => {
    const open = called();
    expect(lobbyViewOf(open, { firstVisit: true }).body).toContain('B, under the lobby');
    expect(lobbyViewOf(open, { firstVisit: false }).body).not.toContain('B, under the lobby');
  });

  it('moves instantly under reduced motion', () => {
    expect(lobbyTimingsFor(true).doorMs).toBeLessThan(10);
    expect(lobbyTimingsFor(false).doorMs).toBe(1150);
  });
});
