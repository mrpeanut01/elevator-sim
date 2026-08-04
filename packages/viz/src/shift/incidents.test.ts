/**
 * `BuildingConfig.serviceEvents` reaches a run — the assertion the seam never had.
 *
 * The field has existed since Phase 0 with a resolver, four dedicated issue codes and a seam test in
 * `core`, and **no shipped building declared one**. So the question this file has to answer is not
 * *"does the type compile"* but *"does a car actually stop answering calls at `atS` and start again
 * later"*, and the only honest way to ask that is to run the simulation and look at the legs.
 *
 * Three assertions carry it, and the third is the one that makes the first two mean anything:
 *
 * 1. an incident changes the legs at all — § D177's rule, so the seam is not inert;
 * 2. the derated car serves **nobody** inside its window and somebody after it — which is the claim
 *    the mechanic actually makes, and the one a mere "the legs differ" would pass without;
 * 3. **no incident is byte-identical to the run that predates this module** — the negative control
 *    every field added to a run config owes, and the thing that would fail if `withIncidents`
 *    silently rewrote a building it was handed nothing for.
 */

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';

import { SHIFT_EVENTS, shiftRunPatch, baseDemandOf } from './events.js';
import { carsToDerate, serviceEventsFor, withIncidents, type Incident } from './incidents.js';

/** Midtown Office: four cars in one bank, 1 710 people. A building where losing a car matters. */
const busy = (): ViewerState => ({ ...baseState(), buildingId: 'midtown-office', shiftLengthS: 1800 });

function runOf(state: ViewerState): ReturnType<typeof recordRun> {
  const plan = shiftRunConfigOf(RESOURCES, state);
  return recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  });
}

const legsOf = (state: ViewerState): string =>
  JSON.stringify(
    runOf(state).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );

/* -------------------------------------------------------------------------- *
 * The car choice
 * -------------------------------------------------------------------------- */

describe('choosing which car stands down', () => {
  const building = {
    banks: [
      { id: 'main', cars: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }] },
      { id: 'shuttle', cars: [{ id: 'A' }, { id: 'B' }] },
    ],
  };

  it('never takes the last car in a bank', () => {
    // A bank with no in-service car is a set of floors nobody can reach, which is a different
    // scenario rather than a busier one. Asking for six from a building of six must therefore fall
    // short by two — one per bank — rather than emptying either.
    const choice = carsToDerate(building, 6);
    expect(choice.held.length).toBe(4);
    expect(choice.shortfall).toBe(2);
    expect(choice.held.filter((car) => car.bankId === 'main').length).toBe(3);
    expect(choice.held.filter((car) => car.bankId === 'shuttle').length).toBe(1);
  });

  it('is deterministic, and prefers the larger bank', () => {
    // Deterministic because a random draw outside the injected StreamSet breaks common random
    // numbers (invariant 2), and because two shifts of the same day that held different cars would
    // not be comparable with each other.
    expect(carsToDerate(building, 1)).toEqual(carsToDerate(building, 1));
    expect(carsToDerate(building, 1).held).toEqual([{ bankId: 'main', carId: 'D' }]);
  });

  it('asks for nothing and gets nothing', () => {
    expect(carsToDerate(building, 0)).toEqual({ held: [], shortfall: 0 });
  });
});

/* -------------------------------------------------------------------------- *
 * The service events
 * -------------------------------------------------------------------------- */

describe('an incident is two service events', () => {
  const car = { bankId: 'main', carId: 'D' };

  it('goes out and comes back', () => {
    const events = serviceEventsFor([{ kind: 'maintenance', car, fromFraction: 0.25, toFraction: 0.75 }], 1800);
    expect(events).toEqual([
      { atS: 450, carId: 'D', bankId: 'main', mode: 'out-of-service' },
      { atS: 1350, carId: 'D', bankId: 'main', mode: 'in-service' },
    ]);
  });

  it('emits one event when it does not come back', () => {
    // A return scheduled past the horizon is a promise the run cannot keep, and `core` would carry
    // it as a resolved event that never fires — which reads, to anyone inspecting the building, as a
    // car that returns.
    const events = serviceEventsFor([{ kind: 'modernisation', car, fromFraction: 0.5, toFraction: 1 }], 1800);
    expect(events.length).toBe(1);
    expect(events[0]?.mode).toBe('out-of-service');
  });

  it('refuses a window that closes before it opens', () => {
    const events = serviceEventsFor([{ kind: 'breakdown', car, fromFraction: 0.5, toFraction: 0.5 }], 1800);
    expect(events.map((event) => event.mode)).toEqual(['out-of-service']);
  });

  it('leaves a building alone when there is nothing to add', () => {
    // Identity, not a copy: `withIncidents` returning a fresh object would make every run's building
    // document a new value, and the building document is digested into a leaderboard board.
    const config = RESOURCES.entries[0]?.config;
    expect(config).toBeDefined();
    if (config === undefined) return;
    expect(withIncidents(config, [], 1800)).toBe(config);
  });

  it('appends to what the building already declares, rather than replacing it', () => {
    const config = RESOURCES.entries[0]?.config;
    if (config === undefined) return;
    const authored = { ...config, serviceEvents: [{ atS: 10, carId: 'A', mode: 'independent' as const }] };
    const incident: Incident = { kind: 'breakdown', car: { bankId: 'main', carId: 'B' }, fromFraction: 0.1, toFraction: 0.2 };
    const result = withIncidents(authored, [incident], 1800);
    expect(result.serviceEvents?.length).toBe(3);
    expect(result.serviceEvents?.[0]).toEqual({ atS: 10, carId: 'A', mode: 'independent' });
  });
});

/* -------------------------------------------------------------------------- *
 * The seam — does it reach a run?
 * -------------------------------------------------------------------------- */

describe('the incident reaches the simulation', () => {
  /** The `move-in` day. `eventFor`'s schedule puts it on day 3, and its effect is the derate. */
  const moveInDay = (): ViewerState => {
    const state = busy();
    return { ...state, week: { ...state.week, day: 3, dayIdx: 3 } };
  };

  it('is the day the schedule says it is', () => {
    // Derived rather than assumed: if `eventFor`'s arithmetic moves, this test should say so rather
    // than silently start asserting the derate against an ordinary day.
    const state = moveInDay();
    expect(SHIFT_EVENTS['move-in'].effect.derate).not.toBeNull();
    const patch = shiftRunPatch({
      event: SHIFT_EVENTS['move-in'],
      building: shiftRunConfigOf(RESOURCES, state).building,
      base: baseDemandOf(RESOURCES.trafficProfiles.profiles[1] ?? RESOURCES.trafficProfiles.profiles[0]!),
    });
    expect(patch.incidents.length).toBe(1);
    expect(patch.withheld).toEqual([]);
  });

  it('changes the legs — the seam is not inert', () => {
    const withDerate = moveInDay();
    const ordinary: ViewerState = { ...withDerate, week: { ...withDerate.week, day: 1, dayIdx: 1 } };
    expect(legsOf(withDerate)).not.toBe(legsOf(ordinary));
  });

  it('stands the car down inside its window and puts it back after', () => {
    /*
     * The assertion that makes the one above mean something. "The legs differ" is also true of a run
     * whose *demand* moved, and day 3 differs from day 1 by tenant growth too — so without this, a
     * derate that reached nothing at all would still pass.
     *
     * The window is the first two thirds of the shift, so the derated car must board nobody before
     * `2/3 × 1800 = 1200 s` and must board somebody after it.
     */
    const plan = shiftRunConfigOf(RESOURCES, moveInDay());
    const events = plan.building.serviceEvents ?? [];
    expect(events.length, 'the grown building carries the incident').toBe(2);

    const out = events.find((event) => event.mode === 'out-of-service');
    const back = events.find((event) => event.mode === 'in-service');
    expect(out?.atS).toBe(0);
    expect(back?.atS).toBe(1200);

    const derated = `${out?.bankId ?? ''}-${out?.carId ?? ''}`;
    const legs = runOf(moveInDay()).recording.legs.filter((leg) => leg.carId === derated);
    const inWindow = legs.filter((leg) => (leg.boardedAt ?? Number.POSITIVE_INFINITY) < 1200);
    const afterWindow = legs.filter((leg) => (leg.boardedAt ?? -1) >= 1200);

    expect(inWindow.length, `${derated} boarded somebody while it was out of service`).toBe(0);
    expect(afterWindow.length, `${derated} never came back`).toBeGreaterThan(0);
  });

  it('leaves a day with no incident byte-identical to one built before this module', () => {
    /*
     * The negative control. `withIncidents` returns its input unchanged when there is nothing to
     * add, and `shiftRunConfigOf` then skips the second parse and resolve entirely — so an ordinary
     * day must produce exactly the run it produced before incidents existed.
     *
     * If this ever fails, every figure measured on a day without an incident has quietly moved.
     */
    const ordinary = busy();
    expect(SHIFT_EVENTS.ordinary.effect.derate).toBeNull();
    const plan = shiftRunConfigOf(RESOURCES, ordinary);
    expect(plan.building.serviceEvents ?? []).toEqual([]);
    expect(plan.config.building).toBe(plan.building);
  });
});
