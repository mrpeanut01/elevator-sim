/**
 * End-to-end behaviour of the run loop.
 *
 * These tests are deliberately blunt about the one thing that matters: **nobody may be lost**.
 * A discrete-event elevator simulation that deletes a passenger reports a *better* average
 * waiting time for it, because the passengers a bug deletes are systematically the ones who
 * waited longest — so a suite that only checked "AWT looks plausible" would grade the bug as an
 * improvement. Every test here either counts people or checks where they ended up.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig } from '../config/types.js';
import { buildJourneys } from '../metrics/summarize.js';
import { Car } from '../model/car/index.js';
import type { PassengerRecord } from '../metrics/types.js';

import {
  BUILDING_IDS,
  load,
  tinyBuilding,
  withCallType,
  withParking,
} from './fixtures.test-helper.js';
import { Simulation, runSimulation } from './simulation.js';
import {
  SIMULATION_STATUSES,
  SIM_DEFAULTS,
  SIM_PARAMETERS,
  SimulationError,
  UNDELIVERED_REASONS,
  type SimulationConfig,
  type SimulationResult,
} from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

/** The shared shape of a run request; each test names only what it cares about. */
function baseConfig(
  buildingId: string,
  profileId: string,
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  if (dispatcherProfile === undefined) throw new Error(`no profile "${profileId}"`);
  return {
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 20260726,
    ...overrides,
  };
}

/** Legs, grouped by the journey they belong to, in leg order. */
function legsByJourney(records: readonly PassengerRecord[]): Map<string, PassengerRecord[]> {
  const byJourney = new Map<string, PassengerRecord[]>();
  for (const record of records) {
    const legs = byJourney.get(record.journeyId);
    if (legs === undefined) byJourney.set(record.journeyId, [record]);
    else legs.push(record);
  }
  for (const legs of byJourney.values()) legs.sort((a, b) => a.legIndex - b.legIndex);
  return byJourney;
}

/* -------------------------------------------------------------------------- *
 * Garden Apartments, end to end
 * -------------------------------------------------------------------------- */

describe('Garden Apartments, end to end', () => {
  it('delivers everybody, loses nobody, and produces a plausible wait', () => {
    const result = runSimulation(baseConfig('garden-apartments', 'nearest-car'));

    expect(result.status).toBe('completed');
    expect(result.undelivered).toEqual([]);
    expect(result.conservation.balanced).toBe(true);
    expect(result.conservation.generated).toBeGreaterThan(0);
    expect(result.conservation.delivered).toBe(result.conservation.generated);
    expect(result.conservation.legsCreated).toBe(result.conservation.legsRecorded);
    expect(result.conservation.legsAlighted).toBe(result.conservation.legsCreated);

    // Residential targets are 40–70 s average wait against a 50–90 s interval
    // (docs/03-traffic-and-statistics.md § Part 1). Six floors, two cars and a 3–7 % arrival
    // rate is a comfortable system, so the honest expectation is "well inside the target and
    // not zero" rather than a pinned number that a jerk-limit change would break.
    expect(result.summary.waiting.meanS).toBeGreaterThan(0);
    expect(result.summary.waiting.meanS).toBeLessThan(70);
    expect(result.summary.waiting.p95S).toBeGreaterThanOrEqual(result.summary.waiting.meanS);
    expect(result.summary.saturation.verdict).toBe('stable');
    expect(result.summary.awtIsValid).toBe(true);
  });

  it('records one leg per passenger, each with a wait, a ride and a car', () => {
    const result = runSimulation(baseConfig('garden-apartments', 'nearest-car'));

    expect(result.record.passengers).toHaveLength(result.conservation.generated);
    for (const leg of result.record.passengers) {
      expect(leg.boardedAt).toBeDefined();
      expect(leg.alightedAt).toBeDefined();
      expect(leg.carId).toBeDefined();
      expect(leg.bankId).toBe('main');
      expect(leg.boardedAt ?? -1).toBeGreaterThanOrEqual(leg.arrivedAt);
      expect(leg.alightedAt ?? -1).toBeGreaterThanOrEqual(leg.boardedAt ?? -1);
      expect(leg.isFinalLeg).toBe(true);
    }
  });

  it('carries the seed on the record, so the run replays from it (invariant 5)', () => {
    const result = runSimulation(baseConfig('garden-apartments', 'nearest-car'));
    expect(result.record.seed).toBe('20260726');
    expect(result.seed).toBe(result.record.seed);
    expect(result.trace.seed).toBe(result.record.seed);
  });
});

/* -------------------------------------------------------------------------- *
 * Midtown Office, up-peak
 * -------------------------------------------------------------------------- */

describe('Midtown Office under up-peak, end to end', () => {
  /**
   * Pure up-peak through the single lobby, at a rate inside the bank's handling capacity.
   *
   * `{ incoming: 1, outgoing: 0, interfloor: 0 }` through one entrance is the demand pattern
   * the closed-form round-trip-time calculation is derived under; `analyzeUpPeak` puts this
   * bank at 6.0 % of population per 5 minutes, so 5 % is loaded but not saturated. Running the
   * shipped 11–15 % office rate here would measure a building that is genuinely
   * under-elevatored, which says nothing about the loop.
   */
  const upPeak = (profileId: string, pct = 5): SimulationConfig =>
    baseConfig('midtown-office', profileId, {
      demand: {
        directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
        entranceWeights: { G: 1, P1: 0 },
        arrivalRatePctPop5min: pct,
      },
    });

  it('delivers everybody from the lobby', () => {
    const result = runSimulation(upPeak('collective'));

    expect(result.status).toBe('completed');
    expect(result.undelivered).toEqual([]);
    expect(result.conservation.balanced).toBe(true);
    expect(result.conservation.delivered).toBe(result.conservation.generated);
    expect(result.conservation.generated).toBeGreaterThan(200);

    // Pure up-peak: every journey starts at the lobby and goes up.
    for (const leg of result.record.passengers) {
      expect(leg.originFloorId).toBe('G');
      expect(leg.direction).toBe('up');
    }
  });

  it('spreads the work across the whole group rather than one car', () => {
    const simulation = new Simulation(upPeak('collective'));
    simulation.run();

    const stops = simulation.building.cars.map((car) => car.stopsServed);
    expect(stops).toHaveLength(4);
    for (const count of stops) expect(count).toBeGreaterThan(0);

    // A single car doing the lobby on its own is the classic failure of this loop — the
    // landing has one button, so if an allocation is never discharged the whole bank collapses
    // to one car and three quarters of the handling capacity disappears. Nothing here should
    // be doing more than three times its share.
    const busiest = Math.max(...stops);
    const total = stops.reduce((sum, count) => sum + count, 0);
    expect(busiest).toBeLessThan((3 * total) / stops.length);
  });

  it('fills cars towards the design load and never past the overload interlock', () => {
    const result = runSimulation(upPeak('collective'));
    const load = result.summary.loadFactor;

    // 80 % of rated, not 100 % (CLAUDE.md § modelling rules). Boarding stops the moment the
    // cell crosses design load, so a full car sits just above it — and never anywhere near the
    // 110 % interlock, which would hold the doors and stall the run.
    expect(load.maxLoadFactor).toBeGreaterThan(load.designLoadFactor);
    expect(load.maxLoadFactor).toBeLessThan(1.1);
    expect(load.carCount).toBe(4);
  });

  it('reports an interval and a handling capacity in the same units as the closed form', () => {
    const result = runSimulation(upPeak('collective'));

    expect(Number.isFinite(result.summary.achievedInterval.meanS)).toBe(true);
    expect(result.summary.achievedInterval.meanS).toBeGreaterThan(0);
    expect(result.summary.handlingCapacity.personsPer5Min).toBeGreaterThan(0);
    expect(result.summary.handlingCapacity.pctPopulationPer5Min ?? 0).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Nobody is delivered to a floor they did not ask for
 * -------------------------------------------------------------------------- */

describe('destinations', () => {
  it('never puts anybody out at a floor their journey did not plan', () => {
    // Checked against the *trace* rather than against the record's own fields, so a leg whose
    // destination had been rewritten mid-run would still be caught.
    const runs: SimulationResult[] = [
      runSimulation(baseConfig('garden-apartments', 'nearest-car')),
      runSimulation(baseConfig('midtown-office', 'eta')),
      runSimulation({
        ...baseConfig('mixed-use-high-rise', 'eta'),
        dispatcherProfile: withCallType(
          config.dispatcherProfilesById.get('eta') as DispatcherProfile,
          'mobile-credential',
        ),
      }),
    ];

    for (const result of runs) {
      const planned = new Map(result.trace.passengers.map((record) => [record.journeyId, record]));
      let checked = 0;

      for (const leg of result.record.passengers) {
        const record = planned.get(leg.journeyId);
        expect(record).toBeDefined();
        if (record === undefined) continue;

        const plan = record.legs[leg.legIndex];
        expect(plan).toBeDefined();
        expect(leg.originFloorId).toBe(plan?.originFloorId);
        expect(leg.destinationFloorId).toBe(plan?.destinationFloorId);
        expect(leg.finalDestinationFloorId).toBe(record.finalDestinationFloorId);

        if (leg.alightedAt !== undefined && leg.isFinalLeg) {
          expect(leg.destinationFloorId).toBe(record.finalDestinationFloorId);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('only lets a passenger board a car whose shaft reaches their destination', () => {
    const result = runSimulation({
      ...baseConfig('mixed-use-high-rise', 'eta'),
      dispatcherProfile: withCallType(
        config.dispatcherProfilesById.get('eta') as DispatcherProfile,
        'mobile-credential',
      ),
    });

    const building = config.buildingsById.get('mixed-use-high-rise');
    expect(building).toBeDefined();
    const servedByBank = new Map(
      (building?.banks ?? []).map((bank) => [bank.id, new Set(bank.servesFloors)]),
    );

    let boardings = 0;
    for (const leg of result.record.passengers) {
      if (leg.bankId === undefined) continue;
      boardings += 1;
      const served = servedByBank.get(leg.bankId);
      expect(served).toBeDefined();
      // The bank that carried this leg must reach both ends of it. Mixed-Use High-Rise's
      // ground lobby is shared by `shuttle` and `office-local`, and a passenger bound for the
      // sky lobby standing in the same queue as one bound for floor 20 is exactly the case
      // `Floor.takeWaiting`'s serve predicate exists for.
      expect(served?.has(leg.originFloorId)).toBe(true);
      expect(served?.has(leg.destinationFloorId)).toBe(true);
    }
    expect(boardings).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Capacity
 * -------------------------------------------------------------------------- */

describe('a car that fills up leaves people behind, and they are served later', () => {
  /** One car, three floors, a heavy landing. Whatever is left over was left by capacity. */
  const oneCar = (): SimulationConfig => ({
    building: tinyBuilding(config, 1000),
    dispatcherProfile: config.dispatcherProfilesById.get('collective') as DispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 4242,
    demand: {
      arrivalRatePctPop5min: 14,
      // Everyone in a batch shares a destination, so a single landing queue really is one
      // undifferentiated crowd rather than a mix the car could partly refuse for other reasons.
      batchSharesDestination: true,
    },
  });

  it('serves the overflow on a later trip instead of losing it', () => {
    const simulation = new Simulation(oneCar());
    const car = simulation.building.cars[0];
    expect(car).toBeDefined();
    const designCapacity = car === undefined ? 0 : car.loadSensor.designLoadKg;
    expect(designCapacity).toBeGreaterThan(0);

    const result = simulation.run();

    expect(result.conservation.balanced).toBe(true);
    expect(result.conservation.delivered).toBe(result.conservation.generated);
    expect(result.undelivered).toEqual([]);
    expect(result.conservation.generated).toBeGreaterThan(20);

    // The whole point: more people arrived at a landing than one carload, and the leftovers
    // waited rather than vanishing. Group the boardings at each origin into trips — a "trip" is
    // one car load — and require that some landing needed more than one.
    const byOrigin = new Map<string, number[]>();
    for (const leg of result.record.passengers) {
      if (leg.boardedAt === undefined) continue;
      const times = byOrigin.get(leg.originFloorId);
      if (times === undefined) byOrigin.set(leg.originFloorId, [leg.boardedAt]);
      else times.push(leg.boardedAt);
    }

    let multiTripLandings = 0;
    for (const times of byOrigin.values()) {
      times.sort((a, b) => a - b);
      const first = times[0] ?? 0;
      const last = times[times.length - 1] ?? 0;
      // A single car load boards over `count * transferTime` seconds — a handful of seconds.
      // A gap of a whole minute between the first and last boarding at one landing can only be
      // a second trip.
      if (last - first > 60) multiTripLandings += 1;
    }
    expect(multiTripLandings).toBeGreaterThan(0);
  });

  it('never overloads the car, and the load cell is what stops boarding', () => {
    const result = runSimulation(oneCar());
    const load = result.summary.loadFactor;

    expect(load.carCount).toBe(1);
    // Filled past design load (boarding stops on crossing it, so a full car sits just above),
    // and never at the 110 % interlock, which would hold the doors open and stall the car.
    expect(load.maxLoadFactor).toBeGreaterThan(load.designLoadFactor);
    expect(load.maxLoadFactor).toBeLessThan(1.1);
    expect(load.fractionOfTimeAtOrAboveDesignLoad).toBeGreaterThan(0);
  });

  it('hands a landing it could not finish back to the group', () => {
    // Same situation with a group rather than one car: the landing outlasts the first car's
    // design load, so the allocation is discharged and a *different* car collects the rest.
    // Without that hand-off the bank collapses to whichever car was allocated first.
    const result = runSimulation(
      baseConfig('midtown-office', 'collective', {
        demand: {
          directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
          entranceWeights: { G: 1, P1: 0 },
          arrivalRatePctPop5min: 5,
        },
      }),
    );

    const byBatch = new Map<string, Set<string>>();
    const batchOf = new Map(
      result.trace.passengers.map((record) => [record.journeyId, record.batchId]),
    );
    for (const leg of result.record.passengers) {
      if (leg.carId === undefined || leg.legIndex !== 0) continue;
      const batchId = batchOf.get(leg.journeyId);
      if (batchId === undefined) continue;
      const cars = byBatch.get(batchId) ?? new Set<string>();
      cars.add(leg.carId);
      byBatch.set(batchId, cars);
    }

    const split = [...byBatch.values()].filter((cars) => cars.size > 1).length;
    expect(split).toBeGreaterThan(0);
  });

  it('makes the overflow wait rather than the queue disappear', () => {
    const result = runSimulation(oneCar());

    const waits = result.record.passengers
      .map((leg) => (leg.boardedAt === undefined ? undefined : leg.boardedAt - leg.arrivedAt))
      .filter((wait): wait is number => wait !== undefined);

    expect(waits).toHaveLength(result.conservation.generated);
    expect(Math.max(...waits)).toBeGreaterThan(60);
    for (const wait of waits) expect(wait).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Sky-lobby transfers
 * -------------------------------------------------------------------------- */

describe('sky-lobby journeys', () => {
  it('completes both legs under one journey id, with TTD spanning the transfer', () => {
    const result = runSimulation({
      ...baseConfig('mixed-use-high-rise', 'eta'),
      dispatcherProfile: withCallType(
        config.dispatcherProfilesById.get('eta') as DispatcherProfile,
        'mobile-credential',
      ),
    });

    expect(result.conservation.transfers).toBeGreaterThan(0);
    expect(result.conservation.legsCreated).toBe(
      result.conservation.generated + result.conservation.transfers,
    );

    const byJourney = legsByJourney(result.record.passengers);
    const multiLeg = [...byJourney.values()].filter((legs) => legs.length > 1);
    expect(multiLeg.length).toBeGreaterThan(0);

    const transferFloors = new Set(
      (config.buildingsById.get('mixed-use-high-rise')?.floors ?? [])
        .filter((floor) => floor.isTransferFloor === true)
        .map((floor) => floor.id),
    );
    expect(transferFloors.size).toBeGreaterThan(0);

    let completed = 0;
    for (const legs of multiLeg) {
      const first = legs[0];
      if (first === undefined) continue;

      expect(first.legIndex).toBe(0);
      expect(first.journeyStartedAt).toBe(first.arrivedAt);

      for (const [index, leg] of legs.entries()) {
        // One identity, and one journey clock, across every leg — that is what makes
        // time-to-destination span the transfers instead of reporting the last hop.
        expect(leg.journeyId).toBe(first.journeyId);
        expect(leg.legIndex).toBe(index);
        expect(leg.journeyStartedAt).toBe(first.journeyStartedAt);
        expect(leg.finalDestinationFloorId).toBe(first.finalDestinationFloorId);

        const next = legs[index + 1];
        if (next === undefined) break;

        // The join really is a declared sky lobby, and the next leg starts where this one
        // ended — after a walk across it, never before the passenger got out.
        expect(leg.isFinalLeg).toBe(false);
        expect(leg.destinationFloorId).toBe(next.originFloorId);
        expect(transferFloors.has(leg.destinationFloorId)).toBe(true);
        if (leg.alightedAt !== undefined) {
          expect(next.arrivedAt).toBeGreaterThanOrEqual(leg.alightedAt);
          expect(next.arrivedAt - leg.alightedAt).toBeCloseTo(SIM_DEFAULTS.transferWalkS, 9);
        }
      }

      const last = legs[legs.length - 1];
      if (last?.alightedAt !== undefined) {
        expect(last.isFinalLeg).toBe(true);
        expect(last.destinationFloorId).toBe(last.finalDestinationFloorId);
        completed += 1;
      }
    }
    expect(completed).toBeGreaterThan(0);

    // The journey view agrees: TTD is measured from the first landing to the last alighting,
    // transfer and second wait included, and is strictly longer than the final leg alone.
    const journeys = buildJourneys(result.record.passengers).filter(
      (journey) => journey.legCount > 1 && journey.isComplete,
    );
    expect(journeys.length).toBeGreaterThan(0);
    for (const journey of journeys) {
      const legs = byJourney.get(journey.journeyId) ?? [];
      const first = legs[0];
      const last = legs[legs.length - 1];
      if (first === undefined || last?.alightedAt === undefined) continue;
      expect(journey.timeToDestinationSeconds).toBeCloseTo(last.alightedAt - first.arrivedAt, 9);
      expect(journey.timeToDestinationSeconds ?? 0).toBeGreaterThan(
        last.alightedAt - last.arrivedAt,
      );
      expect(journey.transferSeconds ?? 0).toBeGreaterThan(0);
    }
  });

  it('honours a longer walk across the lobby', () => {
    const walk = 45;
    const result = runSimulation({
      ...baseConfig('mixed-use-high-rise', 'eta', { transferWalkS: walk }),
      dispatcherProfile: withCallType(
        config.dispatcherProfilesById.get('eta') as DispatcherProfile,
        'mobile-credential',
      ),
    });

    const byJourney = legsByJourney(result.record.passengers);
    let checked = 0;
    for (const legs of byJourney.values()) {
      for (const [index, leg] of legs.entries()) {
        const next = legs[index + 1];
        if (next === undefined || leg.alightedAt === undefined) continue;
        expect(next.arrivedAt - leg.alightedAt).toBeCloseTo(walk, 9);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Determinism of the input streams
 * -------------------------------------------------------------------------- */

describe('stream discipline (CLAUDE.md invariant 2)', () => {
  it('draws nothing during the run, so the passenger population cannot be perturbed', () => {
    const simulation = new Simulation(baseConfig('midtown-office', 'collective'));
    const before = simulation.streams.snapshot();
    simulation.run();
    const after = simulation.streams.snapshot();

    // The trace is settled before a car moves. If the run drew from `arrivals`, `origins`,
    // `destinations` or `passengerMass`, two dispatchers fed the same seed would diverge into
    // different passenger populations and common random numbers would be worth nothing.
    expect(after).toEqual(before);
  });

  it('touches doorObstruction only when obstructions are being modelled', () => {
    const quiet = new Simulation(baseConfig('garden-apartments', 'nearest-car'));
    const quietBefore = quiet.streams.snapshot().streams.doorObstruction;
    quiet.run();
    expect(quiet.streams.snapshot().streams.doorObstruction).toEqual(quietBefore);

    const noisy = new Simulation(
      baseConfig('garden-apartments', 'nearest-car', { doorObstructionProbability: 0.3 }),
    );
    const noisyBefore = noisy.streams.snapshot().streams.doorObstruction;
    const result = noisy.run();
    expect(noisy.streams.snapshot().streams.doorObstruction).not.toEqual(noisyBefore);

    // Obstructions lengthen stops; they must not lose anybody.
    expect(result.conservation.balanced).toBe(true);
    expect(result.conservation.delivered).toBe(result.conservation.generated);
  });
});

/* -------------------------------------------------------------------------- *
 * The hard timeout
 * -------------------------------------------------------------------------- */

describe('the drain deadline is a reported failure, never a silent truncation', () => {
  it('throws by default, with the partial run attached and everybody accounted for', () => {
    let thrown: SimulationError | undefined;
    try {
      runSimulation(
        baseConfig('midtown-office', 'collective', {
          durationS: 600,
          // No room to drain: the trace stops at t=600 and so does the run.
          drainGraceS: 0,
          demand: { arrivalRatePctPop5min: 12 },
        }),
      );
    } catch (error) {
      thrown = error instanceof SimulationError ? error : undefined;
    }

    expect(thrown).toBeInstanceOf(SimulationError);
    const result = thrown?.result;
    expect(result).toBeDefined();
    if (result === undefined) return;

    expect(result.status).toBe('timed-out');
    expect(result.undelivered.length).toBeGreaterThan(0);
    // The books still balance: a timeout names the people it did not deliver.
    expect(result.conservation.balanced).toBe(true);
    expect(result.conservation.delivered + result.conservation.undelivered).toBe(
      result.conservation.generated,
    );
    for (const journey of result.undelivered) {
      expect(UNDELIVERED_REASONS).toContain(journey.reason);
      expect(journey.finalDestinationFloorId.length).toBeGreaterThan(0);
      // Somebody caught mid-ride is named with the car they are in, so the state is
      // reconstructable rather than merely counted.
      if (journey.reason === 'riding') {
        expect(journey.boardedAt).toBeDefined();
        expect(journey.carId).toBeDefined();
      } else {
        expect(journey.carId).toBeUndefined();
      }
    }
    expect(result.undelivered.some((journey) => journey.reason === 'riding')).toBe(true);
  });

  it('reports instead of throwing when asked to', () => {
    const result = runSimulation(
      baseConfig('midtown-office', 'collective', {
        durationS: 600,
        drainGraceS: 0,
        demand: { arrivalRatePctPop5min: 12 },
        onTimeout: 'report',
      }),
    );

    expect(result.status).toBe('timed-out');
    expect(SIMULATION_STATUSES).toContain(result.status);
    expect(result.undelivered.length).toBeGreaterThan(0);
    expect(result.conservation.balanced).toBe(true);
  });

  it('does not fire on a system that finishes on its own', () => {
    const result = runSimulation(baseConfig('garden-apartments', 'nearest-car'));
    expect(result.status).toBe('completed');
    expect(result.endedAt).toBeLessThanOrEqual(result.deadlineS);
  });

  it('blames the deadline only when the deadline is what stopped the run', () => {
    // A genuine drain timeout: demand outlasts the tail, work is refused because of the
    // deadline, and "raise sim.drainGraceS" is the right advice.
    let cut: SimulationError | undefined;
    try {
      runSimulation(
        baseConfig('midtown-office', 'collective', {
          durationS: 600,
          drainGraceS: 0,
          demand: { arrivalRatePctPop5min: 12 },
        }),
      );
    } catch (error) {
      cut = error instanceof SimulationError ? error : undefined;
    }
    expect(cut?.message).toMatch(/drain deadline \(t=600s = end of demand \+ sim\.drainGraceS\)/);
    expect(cut?.message).toMatch(/raise sim\.drainGraceS/);

    // Secure Tower under `up-down-buttons` stops for a completely different reason: the queue
    // runs dry with people still on access-restricted landings, thousands of seconds before the
    // deadline. Advising a longer drain tail there sends its owner to a knob that had nothing
    // to do with it — the exact misdirection this diagnosis exists to prevent.
    let dry: SimulationError | undefined;
    try {
      runSimulation(baseConfig('secure-tower', 'eta', { seed: 11 }));
    } catch (error) {
      dry = error instanceof SimulationError ? error : undefined;
    }
    expect(dry?.result?.status).toBe('timed-out');
    expect(dry?.message).toMatch(/never biting|ever biting/);
    expect(dry?.message).toMatch(/raising sim\.drainGraceS cannot help/);
    expect(dry?.result?.endedAt ?? 0).toBeLessThan((dry?.result?.deadlineS ?? 0) - 1000);
  });

  it('stops the door path at the deadline too, not just travel', () => {
    // `drainGraceS` is documented as a *hard* timeout. Gating only departures leaves a stopped
    // car free to keep cycling its doors — boarding, alighting and re-answering — for as long
    // as anything keeps handing it work, which is a run with a deadline written on it rather
    // than a run with a deadline. Nothing a passenger does may be recorded past it.
    const result = runSimulation(
      baseConfig('midtown-office', 'collective', {
        durationS: 600,
        drainGraceS: 0,
        demand: { arrivalRatePctPop5min: 12 },
        onTimeout: 'report',
      }),
    );

    expect(result.deadlineS).toBe(600);
    for (const leg of result.record.passengers) {
      expect(leg.arrivedAt).toBeLessThanOrEqual(result.deadlineS);
      if (leg.boardedAt !== undefined) expect(leg.boardedAt).toBeLessThanOrEqual(result.deadlineS);
      if (leg.alightedAt !== undefined) {
        expect(leg.alightedAt).toBeLessThanOrEqual(result.deadlineS);
      }
    }
    expect(result.endedAt).toBeLessThanOrEqual(result.deadlineS);
  });
});

/* -------------------------------------------------------------------------- *
 * A bug in a handler is a bug, not a measurement
 * -------------------------------------------------------------------------- */

describe('what comes out of a run that went wrong', () => {
  /**
   * The failure this guards against is the worst kind the module can produce: a plausible
   * result. Catching everything the kernel throws and calling it "event budget exhausted" turns
   * any internal bug — a `ModelError` from a car, one of this module's own routing
   * `SimulationError`s, a plain `TypeError` — into a `timed-out` run with balanced books, a
   * normal-looking AWT, and advice about `sim.drainGraceS`. A Phase 3 sweep tolerating
   * `timed-out` replications (which it must, to measure saturation) would fold that straight
   * into a mean.
   */
  it('lets a handler exception out unchanged instead of relabelling it a timeout', () => {
    const original = Car.prototype.board;
    let boardings = 0;
    // Injected late on purpose: after the last batch has arrived, so every journey has
    // materialized and the conservation audit has nothing to catch. The only signal that
    // anything went wrong is the exception itself.
    Car.prototype.board = function patched(this: Car, passenger, at, options) {
      boardings += 1;
      if (boardings === 300) {
        throw new TypeError("Cannot read properties of undefined (reading 'floorId')");
      }
      return original.call(this, passenger, at, options);
    };

    try {
      let thrown: unknown;
      try {
        runSimulation(
          baseConfig('midtown-office', 'collective', {
            demand: { arrivalRatePctPop5min: 5 },
            // Even the most permissive timeout policy must not turn a crash into a result.
            onTimeout: 'report',
          }),
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(TypeError);
      expect(thrown).not.toBeInstanceOf(SimulationError);
      expect((thrown as Error).message).toBe(
        "Cannot read properties of undefined (reading 'floorId')",
      );
      expect(boardings).toBe(300);
    } finally {
      Car.prototype.board = original;
    }
  });

  it('reports an exhausted event budget as aborted, and throws whatever onTimeout says', () => {
    let thrown: SimulationError | undefined;
    try {
      runSimulation(
        baseConfig('midtown-office', 'collective', {
          maxEvents: 500,
          demand: { arrivalRatePctPop5min: 5 },
          onTimeout: 'report',
        }),
      );
    } catch (error) {
      thrown = error instanceof SimulationError ? error : undefined;
    }

    expect(thrown).toBeInstanceOf(SimulationError);
    const result = thrown?.result;
    expect(result).toBeDefined();
    if (result === undefined) return;

    // A third status, not a variety of `timed-out`: the run did not saturate, it stopped.
    expect(result.status).toBe('aborted');
    expect(SIMULATION_STATUSES).toContain(result.status);
    expect(result.events).toBeGreaterThanOrEqual(500);

    // The message must not send anybody to the drain-tail knob, which cannot help here.
    expect(thrown?.message).toMatch(/event budget \(sim\.maxEvents=500\)/);
    expect(thrown?.message).toMatch(/not a saturated building/);
    expect(thrown?.message).not.toMatch(/raise sim\.drainGraceS/);
    expect(result.warnings.some((warning) => warning.includes('event budget exhausted'))).toBe(
      true,
    );
  });

  it('declares aborted alongside the other statuses', () => {
    expect([...SIMULATION_STATUSES]).toEqual(['completed', 'timed-out', 'aborted']);
  });
});

/* -------------------------------------------------------------------------- *
 * Liveness: an allocation nobody will answer
 * -------------------------------------------------------------------------- */

describe('a call the car it was given to will not answer', () => {
  /**
   * Stage 6 has four ways to decline, and the runner used to act on one of them. A
   * `direction-mismatch` — the car's committed route turned against the call after it was
   * allocated — left the call pinned to that car, and under `reassignmentPolicy: 'never'` (the
   * default for every shipped profile) the lifecycle then held it there forever: no other car
   * could be given the landing, the pinned car oscillated empty between its remaining
   * commitments, and the run reported `timed-out` with no diagnosis at all.
   *
   * `eligibility.allowOppositeDirectionPickup` is a declared tunable an optimizer is documented
   * to search, so this is a configuration Phase 7 will actually visit.
   */
  it('surrenders a direction-mismatched call instead of holding it', () => {
    // Seeds 121 and 162 stranded 2 and 4 passengers respectively before the fix, with an empty
    // warnings list; the rest are ordinary draws that must keep working.
    for (const seed of [121, 162, 20260726, 11, 7]) {
      const result = runSimulation(
        baseConfig('garden-apartments', 'eta', {
          seed,
          onTimeout: 'report',
          dispatcherOptions: { eligibility: { allowOppositeDirectionPickup: false } },
        }),
      );

      expect(result.status).toBe('completed');
      expect(result.undelivered).toEqual([]);
      expect(result.conservation.balanced).toBe(true);
      expect(result.conservation.delivered).toBe(result.conservation.generated);
    }
  });

  it('still delivers everybody with the tunable at its default', () => {
    // The paired half: turning the tunable back on must not be what makes the building work.
    for (const seed of [121, 162]) {
      const result = runSimulation(baseConfig('garden-apartments', 'eta', { seed }));
      expect(result.status).toBe('completed');
      expect(result.conservation.delivered).toBe(result.conservation.generated);
    }
  });

  /**
   * The other half of the same disagreement: stage 6 answering *yes* on behalf of a car the
   * load cell will not let load. `answer.allowBypassIfSoleEligibleCar` makes the only car
   * reaching a floor override its own bypass, so a full car would stop, board nobody, hand the
   * call back, be given it again by the group that has no other car, and stop again — 19,627
   * door cycles and t=226,236 s on a run whose deadline was 5,400 s, because the deadline gated
   * travel but not doors.
   */
  it('does not stop for a landing it cannot load from, and finishes', () => {
    const profile = config.dispatcherProfilesById.get('collective');
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    const simulation = new Simulation({
      // One car, one bank: whatever the car will not take, nobody else can.
      building: tinyBuilding(config),
      dispatcherProfile: {
        ...profile,
        answer: { ...profile.answer, allowBypassIfSoleEligibleCar: true },
      },
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 4242,
      demand: { arrivalRatePctPop5min: 14 },
      onTimeout: 'report',
    });
    const result = simulation.run();

    expect(result.status).toBe('completed');
    expect(result.conservation.delivered).toBe(result.conservation.generated);
    expect(result.conservation.generated).toBeGreaterThan(50);
    expect(result.endedAt).toBeLessThanOrEqual(result.deadlineS);

    // The livelock's signature is a stop count with no relation to the traffic. Eighty-eight
    // passengers cannot need thousands of stops, and each of the car's stops must move somebody.
    const stops = simulation.building.cars.map((car) => car.stopsServed);
    expect(stops).toHaveLength(1);
    expect(stops[0] ?? 0).toBeLessThan(result.conservation.generated * 2);
    expect(result.events).toBeLessThan(5_000);
  });

  it('names a call a car keeps refusing rather than reporting the run as merely slow', () => {
    const profile = config.dispatcherProfilesById.get('collective');
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    // One car against six times the traffic it can clear: the landing at the top stays lit, the
    // sole car keeps arriving full, and the run legitimately times out. What it must not do is
    // time out silently — `warnings` has to say which call and which car.
    const result = runSimulation({
      building: tinyBuilding(config),
      dispatcherProfile: {
        ...profile,
        answer: { ...profile.answer, allowBypassIfSoleEligibleCar: true },
      },
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 4242,
      demand: { arrivalRatePctPop5min: 60 },
      drainGraceS: 300,
      onTimeout: 'report',
    });

    expect(result.status).toBe('timed-out');
    expect(result.conservation.balanced).toBe(true);
    const refusals = result.warnings.filter((warning) => /refused \d+ times by car/.test(warning));
    expect(refusals.length).toBeGreaterThan(0);
    expect(refusals[0]).toMatch(/still had \d+ waiting when the run stopped/);

    // Ordinary saturation on a shipped building is not this, and must stay quiet: every car in
    // a four-car group refusing a call a few times each is overflow, which the run already
    // reports as undelivered passengers.
    const busy = runSimulation(
      baseConfig('midtown-office', 'eta', {
        demand: { arrivalRatePctPop5min: 20 },
        drainGraceS: 0,
        onTimeout: 'report',
      }),
    );
    expect(busy.status).toBe('timed-out');
    expect(busy.warnings.filter((warning) => /refused \d+ times by car/.test(warning))).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * Structural infeasibility is diagnosed, not retried
 * -------------------------------------------------------------------------- */

describe('a landing no car may collect', () => {
  /**
   * Secure Tower puts every floor above the lobby in an access zone. A conventional landing
   * call carries no credential — `costRequestFor` drops it under `up-down-buttons` — so
   * `Car.estimateCost` reports `accessDenied` for every car in the bank and the call can never
   * be allocated. The loop must say so rather than retrying it for the rest of the run, and the
   * passengers must be reported rather than lost.
   */
  it('names the call, keeps the passengers, and reports the run as failed', () => {
    const result = runSimulation(
      baseConfig('secure-tower', 'eta', { seed: 11, onTimeout: 'report' }),
    );

    expect(result.status).toBe('timed-out');
    expect(result.conservation.balanced).toBe(true);
    expect(result.undelivered.length).toBeGreaterThan(0);
    expect(result.undelivered.every((journey) => journey.reason === 'waiting')).toBe(true);

    const diagnosed = result.warnings.filter((warning) => warning.includes('accessDenied'));
    expect(diagnosed.length).toBeGreaterThan(0);
    expect(diagnosed[0]).toMatch(/never collected/);
  });

  it('is cured by moving authorization to call time — a config change and nothing else', () => {
    const profile = config.dispatcherProfilesById.get('eta');
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    const conventional = runSimulation(
      baseConfig('secure-tower', 'eta', { seed: 11, onTimeout: 'report' }),
    );
    const credentialed = runSimulation({
      ...baseConfig('secure-tower', 'eta', { seed: 11, onTimeout: 'report' }),
      dispatcherProfile: withCallType(profile, 'mobile-credential'),
    });

    // Identical passengers — the trace is a function of the seed alone — so this is a paired
    // comparison of two dispatchers, not of two buildings.
    expect(credentialed.trace.passengerCount).toBe(conventional.trace.passengerCount);
    expect(credentialed.status).toBe('completed');
    expect(credentialed.undelivered).toEqual([]);
    expect(credentialed.conservation.delivered).toBe(credentialed.conservation.generated);
    expect(credentialed.summary.waiting.meanS).toBeLessThan(conventional.summary.waiting.meanS);
  });
});

/* -------------------------------------------------------------------------- *
 * Every shipped profile drives the loop
 * -------------------------------------------------------------------------- */

describe('the loop is driven by config, never by a profile id (invariant 7)', () => {
  it('runs every dispatcher in data/dispatcher-profiles.json without losing anybody', () => {
    for (const profile of config.dispatcherProfiles.profiles) {
      const result = runSimulation(
        baseConfig('midtown-office', profile.id, {
          demand: { arrivalRatePctPop5min: 5 },
          onTimeout: 'report',
        }),
      );
      expect(result.conservation.balanced).toBe(true);
      expect(result.dispatcherProfileId).toBe(profile.id);
      expect(result.conservation.delivered + result.conservation.undelivered).toBe(
        result.conservation.generated,
      );
      expect(result.record.dispatcherProfileId).toBe(profile.id);
    }
  });

  it('honours a parking strategy supplied as data', () => {
    const profile = config.dispatcherProfilesById.get('collective');
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    const base: SimulationConfig = baseConfig('midtown-office', 'collective', {
      demand: {
        directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
        entranceWeights: { G: 1, P1: 0 },
        arrivalRatePctPop5min: 5,
      },
    });

    const staying = new Simulation({ ...base, dispatcherProfile: withParking(profile, 'stay') });
    const stayResult = staying.run();
    const parking = new Simulation({ ...base, dispatcherProfile: withParking(profile, 'lobby') });
    const parkResult = parking.run();

    // Same passengers, different idle policy: the cars that park at the lobby end there, and
    // the ones that stay do not. Both must still deliver everybody.
    expect(parkResult.trace.passengerCount).toBe(stayResult.trace.passengerCount);
    expect(stayResult.conservation.delivered).toBe(stayResult.conservation.generated);
    expect(parkResult.conservation.delivered).toBe(parkResult.conservation.generated);

    const parkedAtLobby = parking.building.cars.filter((car) => car.floorId === 'G').length;
    expect(parkedAtLobby).toBeGreaterThan(0);
    expect(parkResult.summary.waiting.meanS).toBeLessThan(stayResult.summary.waiting.meanS);
  });
});

/* -------------------------------------------------------------------------- *
 * Configuration surface
 * -------------------------------------------------------------------------- */

describe('configuration', () => {
  it('reports over the demand template’s own window by default', () => {
    const result = runSimulation(baseConfig('garden-apartments', 'nearest-car'));
    expect(result.reportWindow.startS).toBe(result.trace.reportWindowStartS);
    expect(result.reportWindow.endS).toBe(result.trace.reportWindowEndS);
    expect(result.reportWindow.id).toBe('peak-5min');
    expect(result.summary.window).toEqual(result.reportWindow);
  });

  it('re-windows on request without re-simulating', () => {
    const peak = runSimulation(baseConfig('garden-apartments', 'nearest-car'));
    const whole = runSimulation(
      baseConfig('garden-apartments', 'nearest-car', { reportWindow: 'full-run' }),
    );

    expect(whole.reportWindow.id).toBe('full-run');
    expect(whole.record.passengers).toEqual(peak.record.passengers);
    expect(whole.summary.counts.arrivals).toBeGreaterThanOrEqual(peak.summary.counts.arrivals);
  });

  it('takes the demand horizon from durationS', () => {
    const result = runSimulation(
      baseConfig('garden-apartments', 'nearest-car', { durationS: 900 }),
    );
    expect(result.trace.durationS).toBe(900);
    expect(result.demandEndedAt).toBe(900);
    for (const record of result.trace.passengers) {
      expect(record.arrivalTimeS).toBeLessThan(900);
    }
  });

  it('refuses a second run from the same Simulation', () => {
    const simulation = new Simulation(baseConfig('garden-apartments', 'nearest-car'));
    simulation.run();
    expect(() => simulation.run()).toThrow(SimulationError);
    expect(() => simulation.run()).toThrow(/already run/);
  });

  it('rejects nonsense tunables at construction rather than mid-run', () => {
    expect(() =>
      runSimulation(baseConfig('garden-apartments', 'nearest-car', { transferWalkS: -1 })),
    ).toThrow(/transferWalkS/);
    expect(() =>
      runSimulation(baseConfig('garden-apartments', 'nearest-car', { dispatchRetryS: 0 })),
    ).toThrow(/dispatchRetryS/);
    expect(() =>
      runSimulation(
        baseConfig('garden-apartments', 'nearest-car', { doorObstructionProbability: 1.5 }),
      ),
    ).toThrow(/doorObstructionProbability/);
    expect(() =>
      runSimulation(baseConfig('garden-apartments', 'nearest-car', { queueSampleCount: 2.5 })),
    ).toThrow(/queueSampleCount/);
  });

  it('declares every tunable it owns (CLAUDE.md invariant 8)', () => {
    const declared = new Set(SIM_PARAMETERS.map((parameter) => parameter.id));
    expect(declared.size).toBe(SIM_PARAMETERS.length);

    for (const parameter of SIM_PARAMETERS) {
      expect(parameter.id.startsWith('sim.')).toBe(true);
      expect(parameter.description.length).toBeGreaterThan(20);

      const key = parameter.id.slice('sim.'.length) as keyof typeof SIM_DEFAULTS;
      expect(Object.hasOwn(SIM_DEFAULTS, key)).toBe(true);
      expect(parameter.default).toBe(SIM_DEFAULTS[key]);

      if (parameter.range !== undefined) {
        const [min, max] = parameter.range;
        expect(min).toBeLessThan(max);
        expect(parameter.default).toBeGreaterThanOrEqual(min);
        expect(parameter.default).toBeLessThanOrEqual(max);
      }
      if (parameter.type === 'integer') {
        expect(Number.isInteger(parameter.default)).toBe(true);
      }
    }
  });

  it('samples the queue, so saturation detection has something to fit', () => {
    const result = runSimulation(
      baseConfig('garden-apartments', 'nearest-car', { queueSampleCount: 30 }),
    );
    // Thirty on the grid plus the closing sample.
    expect(result.record.queueSamples).toHaveLength(31);
    for (const sample of result.record.queueSamples) {
      expect(sample.waiting).toBeGreaterThanOrEqual(0);
      expect(sample.at).toBeGreaterThanOrEqual(0);
    }

    const none = runSimulation(
      baseConfig('garden-apartments', 'nearest-car', { queueSampleCount: 0 }),
    );
    expect(none.record.queueSamples).toEqual([]);
    // Saturation still has an answer: `metrics` reconstructs a series from arrival and boarding
    // times when a run carries no samples.
    expect(none.summary.saturation.verdict.length).toBeGreaterThan(0);
  });

  it('records the fleet roster and the population on the run record', () => {
    const result = runSimulation(baseConfig('midtown-office', 'eta'));
    expect(result.record.carIds).toHaveLength(4);
    expect(result.record.population).toBe(config.buildingsById.get('midtown-office')?.totalPopulation);
    expect(result.record.buildingId).toBe('midtown-office');
    expect(result.record.demandTemplateId).toBe(result.trace.template.id);
  });

  it('names every shipped building in its own run id by default', () => {
    for (const buildingId of BUILDING_IDS) {
      const result = runSimulation(
        baseConfig(buildingId, 'nearest-car', { durationS: 300, onTimeout: 'report' }),
      );
      expect(result.runId).toBe(`${buildingId}-nearest-car-20260726`);
      expect(result.record.runId).toBe(result.runId);
    }
  });
});
