/**
 * En-route diversion on **every shipped building**, and on the one geometry that normalises.
 *
 * `DECISIONS.md` § D205 measured the repair on Midtown Office down-peak, which is where the defect
 * was reported and where the effect is largest. That is a statistical claim about one building; it
 * is not evidence that the *mechanism* is sound on the others, and two of its steps are geometry
 * rather than arithmetic:
 *
 * - `Car.divertFrontier` walks `stopFloorsOf(shaft)` — the shaft's **route nodes**, which on a
 *   double-deck shaft are stop positions rather than floors;
 * - `Car.divertTo` normalises its target through `stopFloorFor`, so "divert to 27" on a paired
 *   shaft means "stop at 26 and open the upper deck onto 27".
 *
 * Both were written against `vertical-city`'s `shuttle` bank — the only shipped bank declaring
 * `servesFloorPairs` — and neither had ever been exercised there. A deck-normalisation bug would
 * not have thrown; it would have diverted a car to a position it cannot stand at, and the
 * conservation audit would have been the first thing to notice.
 *
 * So this suite asks the blunt questions rather than statistical ones: does it run, does everybody
 * still arrive, and does the mechanism actually fire — including on the paired shaft.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig } from '../config/types.js';
import { Car } from '../model/car/index.js';

import { BUILDING_IDS, load, withCallType } from './fixtures.test-helper.js';
import { Simulation } from './simulation.js';
import type { SimulationResult } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

/** Buildings whose access-restricted landings need a credential-carrying call to be servable. */
const NEEDS_CREDENTIAL = new Set(['mixed-use-high-rise', 'secure-tower', 'vertical-city']);

/**
 * Outgoing-dominant with real interfloor, at a rate every building delivers in full.
 *
 * Down-dominant because that is the traffic the defect lives in — a car descending past a landing
 * that also wants to descend. Garden Apartments is run harder because at 2 % it generates two
 * passengers, and a run with two passengers cannot show a mechanism firing or failing to.
 */
function simulationFor(
  buildingId: string,
  profileId: string,
  reportWindow?: 'full-run',
): Simulation {
  const building = config.buildingsById.get(buildingId);
  const base = config.dispatcherProfilesById.get(profileId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  if (base === undefined) throw new Error(`no profile "${profileId}"`);
  const dispatcherProfile: DispatcherProfile = NEEDS_CREDENTIAL.has(buildingId)
    ? withCallType(base, 'mobile-credential')
    : base;
  return new Simulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 20260802,
    onTimeout: 'report',
    demand: {
      directionalSplit: { incoming: 0.15, outgoing: 0.55, interfloor: 0.3 },
      arrivalRatePctPop5min: buildingId === 'garden-apartments' ? 12 : 2,
    },
    ...(reportWindow === undefined ? {} : { reportWindow }),
  });
}

function runOn(buildingId: string, profileId: string): SimulationResult {
  return simulationFor(buildingId, profileId).run();
}

describe('the diverting profile runs every shipped building without losing anybody', () => {
  for (const buildingId of BUILDING_IDS) {
    it(`${buildingId}: conserves every passenger, and the books balance`, () => {
      const result = runOn(buildingId, 'collective-enroute');

      // The audit is the assertion that matters. A diversion that sent a car to a position it
      // cannot stand at, or that lost the stop it was diverted for, shows up here first — a
      // simulation that deletes a passenger reports a *better* AWT for it.
      expect(result.conservation.balanced, buildingId).toBe(true);
      expect(result.conservation.delivered, buildingId).toBe(result.conservation.generated);
      expect(result.conservation.generated, buildingId).toBeGreaterThan(20);
      expect(result.undelivered, buildingId).toEqual([]);
    });
  }

  it('fires on most of them, and never on the profile that forbids it', () => {
    const fired: string[] = [];
    for (const buildingId of BUILDING_IDS) {
      // The control. `collective` differs from `collective-enroute` in one authored field, so a
      // non-zero count here would mean the setting is not the thing doing it.
      expect(runOn(buildingId, 'collective').stageActivity.diversions, buildingId).toBe(0);
      if (runOn(buildingId, 'collective-enroute').stageActivity.diversions > 0) {
        fired.push(buildingId);
      }
    }
    // Not "on all five": whether a car is ever mid-flight past a same-direction landing is a
    // property of the building's geometry and traffic, and a floor that says "most" is the honest
    // claim. A drop to zero everywhere would mean the switch had come unwired.
    expect(fired.length, `fired on ${fired.join(', ')}`).toBeGreaterThanOrEqual(4);
  });
});

describe('the double-deck shaft, which is the only geometry that normalises', () => {
  it('diverts a paired car, and vertical-city still balances', () => {
    // Counted through `divertTo` itself rather than through `stageActivity`, because the question
    // is not "did a diversion happen in this building" — `vertical-city` has single-deck banks too
    // — but "did one happen on a car whose stop positions are floor *pairs*". Without this the
    // deck-normalisation branch could be dead and every other assertion here would still pass.
    let deck = 0;
    let single = 0;
    const original = Car.prototype.divertTo;
    Car.prototype.divertTo = function (this: Car, floorId: string, at?: number) {
      if (this.isDoubleDeck) deck += 1;
      else single += 1;
      return (original as (this: Car, f: string, a?: number) => ReturnType<typeof original>).call(
        this,
        floorId,
        at,
      );
    } as typeof Car.prototype.divertTo;

    let result: SimulationResult;
    try {
      result = runOn('vertical-city', 'collective-enroute');
    } finally {
      Car.prototype.divertTo = original;
    }

    expect(deck, 'no diversion reached a double-deck car; the deck branch is unexercised').toBeGreaterThan(0);
    expect(single).toBeGreaterThan(0);
    expect(result.conservation.balanced).toBe(true);
    expect(result.conservation.delivered).toBe(result.conservation.generated);
  });
});

/* -------------------------------------------------------------------------- *
 * The energy axis, which a shortened run could falsify without failing
 * -------------------------------------------------------------------------- */

describe('a diverted run is charged for the distance it actually drove', () => {
  for (const buildingId of BUILDING_IDS) {
    it(`${buildingId}: the energy proxy matches the fleet's own odometers`, () => {
      // `Simulation.#depart` schedules one arrival and `#scheduleArrival` takes the travel sample
      // when it fires — so a diversion, which **cancels that arrival and schedules another**, is
      // the one operation that could make the two disagree. Two ways to be wrong and neither
      // throws: sample the original hop and charge the fleet for distance nobody drove, or fire
      // both arrivals and charge it twice.
      //
      // The odometer is the independent witness. `Car.completeArrival` adds
      // `motion.profile.distanceM` for whichever motion actually completed, and the recorder sums
      // the samples it was handed; they agree only if exactly one arrival fired per departure and
      // it carried the diverted profile.
      // **Over the whole run, not the default peak window.** The first draft of this compared
      // `summary.energy.distanceM` against the odometer under the default `peak-5min` window and
      // reported a threefold mismatch on every building — which the *control* immediately
      // explained: `collective`, which diverts nothing, showed the same ratio. The two quantities
      // were measuring different spans, not disagreeing. Kept as a note because the failure looked
      // exactly like the bug this test is for.
      const simulation = simulationFor(buildingId, 'collective-enroute', 'full-run');
      const result = simulation.run();

      const odometer = simulation.building.cars.reduce(
        (total, car) => total + car.distanceTravelledM,
        0,
      );
      expect(result.summary.energy.measured, buildingId).toBe(true);
      expect(result.summary.energy.distanceM, buildingId).toBeCloseTo(odometer, 6);
      expect(odometer, buildingId).toBeGreaterThan(0);
      expect(result.stageActivity.diversions, buildingId).toBeGreaterThanOrEqual(0);
    });
  }
});
