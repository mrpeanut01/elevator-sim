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

import { passengerTransferSecondsFor } from '../analytical/upPeak.js';
import { parseBuilding, resolveBuilding } from '../config/parse.js';
import { findPassengerTransferS } from '../config/resolveCar.js';
import { ConfigError, ISSUE_CODES } from '../config/schema.js';
import type { BuildingConfig, DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import {
  FALLBACK_DEPARTURE_GAP_S,
  buildJourneys,
  departureGapBracket,
  summarizeRun,
} from '../metrics/summarize.js';
import { CAR_DEFAULTS, Car } from '../model/car/index.js';
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
  }, 60_000);

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
  }, 60_000);

  it('carries the seed on the record, so the run replays from it (invariant 5)', () => {
    const result = runSimulation(baseConfig('garden-apartments', 'nearest-car'));
    expect(result.record.seed).toBe('20260726');
    expect(result.seed).toBe(result.record.seed);
    expect(result.trace.seed).toBe(result.record.seed);
  }, 60_000);
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
  }, 60_000);

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
  }, 60_000);

  it('fills cars towards the design load and never past the overload interlock', () => {
    const result = runSimulation(upPeak('collective'));
    const load = result.summary.loadFactor;

    // 80 % of rated, not 100 % (CLAUDE.md § modelling rules). Boarding stops the moment the
    // cell crosses design load, so a full car sits just above it — and never anywhere near the
    // 110 % interlock, which would hold the doors and stall the run.
    expect(load.maxLoadFactor).toBeGreaterThan(load.designLoadFactor);
    expect(load.maxLoadFactor).toBeLessThan(1.1);
    expect(load.carCount).toBe(4);
  }, 60_000);

  it('reports an interval and a handling capacity in the same units as the closed form', () => {
    const result = runSimulation(upPeak('collective'));

    expect(Number.isFinite(result.summary.achievedInterval.meanS)).toBe(true);
    expect(result.summary.achievedInterval.meanS).toBeGreaterThan(0);
    expect(result.summary.handlingCapacity.personsPer5Min).toBeGreaterThan(0);
    expect(result.summary.handlingCapacity.pctPopulationPer5Min ?? 0).toBeGreaterThan(0);
  }, 60_000);
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
  }, 60_000);

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
  }, 60_000);
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
  }, 60_000);

  it('never overloads the car, and the load cell is what stops boarding', () => {
    const result = runSimulation(oneCar());
    const load = result.summary.loadFactor;

    expect(load.carCount).toBe(1);
    // Filled past design load (boarding stops on crossing it, so a full car sits just above),
    // and never at the 110 % interlock, which would hold the doors open and stall the car.
    expect(load.maxLoadFactor).toBeGreaterThan(load.designLoadFactor);
    expect(load.maxLoadFactor).toBeLessThan(1.1);
    expect(load.fractionOfTimeAtOrAboveDesignLoad).toBeGreaterThan(0);
  }, 60_000);

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
  }, 60_000);

  it('makes the overflow wait rather than the queue disappear', () => {
    const result = runSimulation(oneCar());

    const waits = result.record.passengers
      .map((leg) => (leg.boardedAt === undefined ? undefined : leg.boardedAt - leg.arrivedAt))
      .filter((wait): wait is number => wait !== undefined);

    expect(waits).toHaveLength(result.conservation.generated);
    expect(Math.max(...waits)).toBeGreaterThan(60);
    for (const wait of waits) expect(wait).toBeGreaterThanOrEqual(0);
  }, 60_000);
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
  }, 60_000);

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
  }, 60_000);
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
  }, 60_000);

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
  }, 60_000);
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
  }, 60_000);

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
  }, 60_000);

  it('does not fire on a system that finishes on its own', () => {
    const result = runSimulation(baseConfig('garden-apartments', 'nearest-car'));
    expect(result.status).toBe('completed');
    expect(result.endedAt).toBeLessThanOrEqual(result.deadlineS);
  }, 60_000);

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

    // Secure Tower stops for a completely different reason: the queue runs dry with people still
    // on landings the system will not serve, thousands of seconds before the deadline. Advising a
    // longer drain tail there sends its owner to a knob that had nothing to do with it — the exact
    // misdirection this diagnosis exists to prevent.
    //
    // **The case used to be bare `up-down-buttons`, and that was the § D254 defect.** Every
    // landing call on a zoned floor was refused because the *pickup* was restricted, which is not
    // a question a lift asks; that arm now delivers 420 of 420. The live case is a bare
    // `destination-entry` kiosk, which is the genuine article: the kiosk has nothing to identify
    // anybody with, so the group is asked "may an unbadged passenger reach floor 27?" and answers
    // `destinationAccessDenied` for every car. Same diagnosis, real access control behind it.
    const profile = config.dispatcherProfilesById.get('eta');
    expect(profile).toBeDefined();
    if (profile === undefined) return;
    let dry: SimulationError | undefined;
    try {
      runSimulation({
        ...baseConfig('secure-tower', 'eta', { seed: 11 }),
        dispatcherProfile: withCallType(profile, 'destination-entry'),
      });
    } catch (error) {
      dry = error instanceof SimulationError ? error : undefined;
    }
    expect(dry?.result?.status).toBe('timed-out');
    expect(dry?.message).toMatch(/never biting|ever biting/);
    expect(dry?.message).toMatch(/raising sim\.drainGraceS cannot help/);
    expect(dry?.result?.endedAt ?? 0).toBeLessThan((dry?.result?.deadlineS ?? 0) - 1000);
  }, 60_000);

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
  }, 60_000);

  /**
   * The travel path, gated on where a move **lands** rather than on where it is commanded.
   *
   * GitHub issue #305, [§ D398](../../../../DECISIONS.md). `#depart` used to compare the
   * *command* instant against the deadline and then schedule `motion.arrivesAt` unconditionally,
   * so a car commanded a second inside the deadline with a thirty-second flight put an arrival on
   * the queue thirty seconds past the run's own hard timeout — and `runUntilEmpty` fired it,
   * which completed the move, took a travel sample past the run's end and stepped the car into
   * fresh dispatch work.
   *
   * ## Why the assertion is a travel sample and not `endedAt`
   *
   * `endedAt` is `max(recorder.lastEventAt, demand horizon)` and `MetricsRecorder.sampleTravel`
   * deliberately does not advance `lastEventAt` — so a late arrival that only moved a car left
   * `endedAt` untouched, and the defect was invisible to the obvious check. Swept over three
   * shipped buildings, four dispatchers, four drain tails and two demand levels, **not one of the
   * 96 cells reported `endedAt` past its deadline** while nearly every timed-out one carried
   * travel samples past it. `endedAt` is asserted below as well because it is the shape the fuzz
   * campaign caught (`fuzz-1000130`, a 2 096-passenger destination-panel run whose late arrival
   * *also* registered an assignment, which is observed); the sample is what makes this test able
   * to see the mechanism at all.
   *
   * ## The second assertion is about the fix that was not chosen
   *
   * Gating {@link Simulation.scheduleArrival} instead — letting the car depart and dropping its
   * arrival — would leave a car in flight forever, and would break the one-to-one pairing of
   * commanded moves to travel samples that `benchmark/energyLiveness.test.ts` checks against the
   * fleet's own odometers. That suite only ever runs a *completed* Garden Apartments run; the
   * pairing is asserted here on runs the deadline actually cut, which is the case that would
   * break.
   */
  it('cuts a move that would land past the deadline, not merely one commanded past it', () => {
    // Two families, because the mechanism is not specific to either: a conventional collective
    // arm and a destination-panel arm on a sky-lobby tower — the shape `fuzz-1000130` was found
    // in. Both must be `timed-out`, or the deadline never bit and the cell proves nothing.
    const cells = [
      { buildingId: 'midtown-office', profileId: 'collective', drainGraceS: 60, rate: 20 },
      { buildingId: 'vertical-city', profileId: 'destination-panel', drainGraceS: 0, rate: 12 },
    ] as const;

    for (const cell of cells) {
      const where = `${cell.buildingId}/${cell.profileId}`;
      const simulation = new Simulation(
        baseConfig(cell.buildingId, cell.profileId, {
          durationS: 600,
          drainGraceS: cell.drainGraceS,
          demand: { arrivalRatePctPop5min: cell.rate },
          reportWindow: 'full-run',
          onTimeout: 'report',
        }),
      );
      const result = simulation.run();

      expect(result.status, `${where} drained on its own; the deadline never bit`).toBe(
        'timed-out',
      );
      const samples = result.record.travelSamples ?? [];
      expect(samples.length, `${where} moved no car at all`).toBeGreaterThan(0);

      // The defect, in the only place it is reliably visible: a completed move recorded after the
      // run's own hard deadline. Reported as the overshoots rather than as a count, so a
      // regression says how far past it went.
      const late = samples
        .filter((sample) => sample.at > result.deadlineS)
        .map((sample) => `${sample.carId} +${(sample.at - result.deadlineS).toFixed(3)}s`);
      expect(late, `${where}: arrivals completed past the run's hard deadline`).toEqual([]);

      // The shape `fuzz-1000130` reported. Weaker than the line above — it only fails when the
      // late arrival happens to do something the recorder observes — and kept because it is the
      // property the deep campaign asserts.
      expect(result.endedAt, where).toBeLessThanOrEqual(result.deadlineS);

      // Nothing is half-committed: a refused departure is not commanded at all, so the fleet's
      // own departure counters still match the travel samples one for one. `simulation.building`
      // is the counter `metrics/` never touches.
      const departures = simulation.building.cars.reduce((total, car) => total + car.departures, 0);
      expect(samples.length, `${where}: a commanded move produced no travel sample`).toBe(
        departures,
      );
    }
  }, 120_000);
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
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);

  it('still delivers everybody with the tunable at its default', () => {
    // The paired half: turning the tunable back on must not be what makes the building work.
    for (const seed of [121, 162]) {
      const result = runSimulation(baseConfig('garden-apartments', 'eta', { seed }));
      expect(result.status).toBe('completed');
      expect(result.conservation.delivered).toBe(result.conservation.generated);
    }
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Structural infeasibility is diagnosed, not retried
 * -------------------------------------------------------------------------- */

/**
 * **This block used to assert the defect § D254 removed, and it is the reason the defect
 * survived four phases.** It read: Secure Tower under `eta` is `timed-out` with passengers
 * stranded, every car answering `accessDenied`, and the failure "cured" by a credential. Every
 * one of those assertions passed, and all of them were describing a simulator that refused to
 * collect people from the floor they were standing on.
 *
 * What replaces it is the opposite claim, asserted on the legs rather than on a window
 * statistic: an access-zoned building under bare up/down buttons delivers everybody.
 */
/** Floor id to the credential groups permitted there — the building's own zones, indexed. */
function permittedGroupsByFloorOf(building: {
  readonly accessZones?: readonly { readonly floors: readonly string[]; readonly credentialGroups: readonly string[] }[];
}): ReadonlyMap<string, readonly string[]> {
  const byFloor = new Map<string, string[]>();
  for (const zone of building.accessZones ?? []) {
    for (const floorId of zone.floors) {
      byFloor.set(floorId, [...(byFloor.get(floorId) ?? []), ...zone.credentialGroups]);
    }
  }
  return byFloor;
}

describe('an access-zoned building is serviceable by a conventional dispatcher', () => {
  /** Every shipped building that declares a non-empty `accessZones`, with its conventional arms. */
  const ZONED: readonly (readonly [string, string, number, number])[] = [
    ['secure-tower', 'eta', 11, 420],
    ['secure-tower', 'collective', 424242, 473],
    ['mixed-use-high-rise', 'collective', 424242, 725],
    ['mixed-use-high-rise', 'nearest-car', 424242, 725],
    ['vertical-city', 'eta', 424242, 1976],
  ];

  /*
   * **Re-pointed by § D265, and not weakened.** The credential gap gives a declared share of
   * in-building journeys the badge their own floor implies rather than the one their destination
   * needs, so a handful of riders on each of these buildings are genuinely turned away. § D254's
   * finding is about the *lifts*, and it is asserted here exactly as before: `undelivered` is
   * still empty, the status is still `completed`, and nothing is refused as structurally
   * unservable. What is added is that the shortfall is **named** — every one of the missing legs
   * carries `refusedAt`, and every one of them really is carrying a credential the floor they
   * were going to does not permit. A version of this that simply relaxed the equality would let a
   * lost passenger hide in the difference.
   */
  it.each(ZONED)(
    '%s under %s at seed %d carries all %d legs the credentials allow, on bare up/down buttons',
    (buildingId, profileId, seed, expected) => {
      const building = config.buildingsById.get(buildingId);
      if (building === undefined) throw new Error(`no building "${buildingId}"`);
      const result = runSimulation(
        baseConfig(buildingId, profileId, { seed, onTimeout: 'report' }),
      );

      // The legs, not the wait. A window statistic can be flattered by the passengers a
      // dispatcher never collected; `undelivered` cannot.
      expect(result.undelivered).toEqual([]);
      expect(result.conservation.generated).toBe(expected);
      const refused = result.conservation.accessRefused ?? 0;
      expect(result.conservation.delivered + refused).toBe(expected);
      expect(result.conservation.balanced).toBe(true);
      expect(result.status).toBe('completed');

      // The shortfall is a credential and nothing else, checked per person rather than as a
      // total: each refused leg is one whose own credential cannot reach the floor it was going
      // to, which is the only reason this model ever refuses anybody at a landing.
      const permitted = permittedGroupsByFloorOf(building);
      const refusedLegs = result.record.passengers.filter((leg) => leg.refusedAt !== undefined);
      expect(refusedLegs.length).toBe(refused);
      expect(refused).toBeGreaterThan(0);
      for (const leg of refusedLegs) {
        const groups = permitted.get(leg.destinationFloorId);
        expect(groups, `${leg.passengerId} was refused for an unrestricted floor`).toBeDefined();
        expect(
          leg.credentialGroup === undefined || !(groups ?? []).includes(leg.credentialGroup),
          `${leg.passengerId} holds ${String(leg.credentialGroup)}, which reaches ${leg.destinationFloorId}`,
        ).toBe(true);
      }

      // And nothing was refused as structurally unservable, which is the mechanism rather than
      // the symptom.
      expect(result.warnings.filter((warning) => /never collected/.test(warning))).toEqual([]);
    },
    120_000,
  );

  /**
   * The counterpart, and the assertion a careless fix breaks: the credential model is intact.
   *
   * A bare `destination-entry` kiosk has nothing to identify anybody with, so it asks *"may an
   * unbadged passenger reach floor 27?"* and every car answers `destinationAccessDenied`. That
   * refusal is real access control and must survive — it is the one thing on this building that
   * a credential genuinely buys, and it is now the only live producer of a structural refusal.
   */
  it('still refuses an unauthorised destination, and still says so', () => {
    const profile = config.dispatcherProfilesById.get('eta');
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    const bareKiosk = runSimulation({
      ...baseConfig('secure-tower', 'eta', { seed: 11, onTimeout: 'report' }),
      dispatcherProfile: withCallType(profile, 'destination-entry'),
    });

    // Nobody's badge reached the kiosk, so the zoned floors are refused rather than served.
    expect(bareKiosk.stageActivity.kioskRefusedLegs).toBeGreaterThan(0);
    expect(bareKiosk.undelivered.length).toBeGreaterThan(0);
    expect(bareKiosk.conservation.balanced).toBe(true);
    // The refusal is reported as access control, not as slowness.
    expect(
      bareKiosk.warnings.some((warning) => warning.includes('refused by the destination kiosk')),
      'the run does not name the kiosk refusal',
    ).toBe(true);

    // And the same building, same seed, same trace, with a credential on the call: everybody
    // travels. So the refusal is a property of what the call discloses, not of the fabric — which
    // is the claim the pickup check was destroying by refusing both arms' landings equally.
    const credentialled = runSimulation({
      ...baseConfig('secure-tower', 'eta', { seed: 11, onTimeout: 'report' }),
      dispatcherProfile: withCallType(profile, 'mobile-credential'),
    });
    expect(credentialled.stageActivity.kioskRefusedLegs).toBe(0);
    expect(credentialled.undelivered).toEqual([]);
  }, 60_000);

  /**
   * **The measured size of what the credential now buys, and it is nothing at all.**
   *
   * Before § D254 this comparison was the difference between 420 of 420 delivered and a
   * timed-out run; the repository built H-ACCESS-1 on it and stated in seven places that
   * conventional dispatch cannot serve an access-controlled building at any budget. With the
   * pickup check gone the two runs are *identical* — same status, same legs, same wait to the
   * last significant figure — because `eta` weights `rideTime` at 0, so a disclosed destination
   * changes no score, and the credential now has nothing left to authorize that the runner was
   * not already authorizing per passenger.
   *
   * Asserted rather than narrated, because it is the finding that withdrew a published result.
   */
  it('is not changed at all by moving authorization to call time, under a profile that cannot price a destination', () => {
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

    expect(credentialed.trace.passengerCount).toBe(conventional.trace.passengerCount);
    expect(credentialed.status).toBe(conventional.status);
    expect(credentialed.conservation.delivered).toBe(conventional.conservation.delivered);
    expect(credentialed.summary.waiting.meanS).toBe(conventional.summary.waiting.meanS);
    expect(credentialed.summary.timeToDestination.meanS).toBe(
      conventional.summary.timeToDestination.meanS,
    );
    // Both serve the whole building, which is the half of H-ACCESS-1 that was never true.
    expect(conventional.undelivered).toEqual([]);
    expect(credentialed.undelivered).toEqual([]);
  }, 60_000);
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
  }, 60_000);

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
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * The building's passenger transfer time reaches the cars
 *
 * REGRESSION, and the reason this section is end-to-end rather than a resolver unit test.
 * `tp` is a property of the *building* — office 1.2 s, hotel 1.5 s, residential 1.75 s
 * (`elevator-specs.json → timing.passengerTransferS`, ISO 4190-6) — and the wiring used to
 * stop one step short of the only object that spends it. `Car.passengerTransferS` existed and
 * `CarInit` accepted it, but `resolveCar` never derived it and this constructor never passed
 * it, so every car in every building ran at `CAR_DEFAULTS.passengerTransferS` = 1.2 s.
 *
 * Measured on Garden Apartments (residential, so 1.75 s): the simulated round trip came out
 * 119.0 s where 125.8 s is correct, ~5.4 % short, and handling capacity correspondingly
 * optimistic. Midtown Office was unaffected *because 1.2 s is the office value*, which is
 * exactly why checking the ResolvedCar — or checking only the named acceptance building —
 * would have shipped it. So these tests read the number off constructed `Car`s and then
 * prove it is actually charged at a stop.
 * -------------------------------------------------------------------------- */

describe('passenger transfer time reaches the car it is charged on', () => {
  /** Every `Car` the runner builds for a building, constructed but never run. */
  const carsFor = (buildingId: string): readonly Car[] =>
    new Simulation(baseConfig(buildingId, 'nearest-car')).building.cars;

  /** Garden Apartments with `passengerTransferS` stated on every car. */
  function gardenWithTransfer(passengerTransferS: number) {
    const base = config.buildingsById.get('garden-apartments');
    if (base === undefined) throw new Error('no garden-apartments');
    const authored = {
      ...base.config,
      banks: base.config.banks.map((bank) => ({
        ...bank,
        cars: bank.cars.map((car) => ({ ...car, passengerTransferS })),
      })),
    };
    return resolveBuilding(
      parseBuilding(structuredClone(authored), 'garden-variant.json'),
      config.elevatorSpecs,
      {
        file: 'garden-variant.json',
        trafficProfileIds: new Set(config.trafficProfiles.profiles.map((p) => p.id)),
      },
    );
  }

  it('gives every Garden Apartments car the residential value, not the office default', () => {
    const table = config.elevatorSpecs.timing.passengerTransferS;
    const cars = carsFor('garden-apartments');

    expect(cars.length).toBe(2);
    for (const car of cars) {
      // The building's own `notes` field asks for exactly this.
      expect(car.passengerTransferS).toBe(1.75);
      expect(car.passengerTransferS).toBe(table.residential);
      // The defect, stated so it cannot come back quietly.
      expect(car.passengerTransferS).not.toBe(CAR_DEFAULTS.passengerTransferS);
      expect(car.passengerTransferS).not.toBe(table.office);
    }
  });

  it('gives every shipped building the transfer time its type calls for', () => {
    const table = config.elevatorSpecs.timing.passengerTransferS;
    const byBuilding = new Map(
      BUILDING_IDS.map((id) => [id, [...new Set(carsFor(id).map((car) => car.passengerTransferS))]]),
    );

    expect(byBuilding.get('garden-apartments')).toEqual([table.residential]);
    expect(byBuilding.get('midtown-office')).toEqual([table.office]);
    expect(byBuilding.get('secure-tower')).toEqual([table.office]);
    // `mixed-use` has no row in the table on purpose: a mixed tower's banks serve populations
    // that transfer at different speeds, so there is no honest building-wide answer. Those two
    // buildings therefore declare `passengerTransferS` **per car**, and the values that come back
    // are several — which is the observable difference between "resolved per bank" and the single
    // silent 1.2 s default that used to apply to all 51 of these cars.
    expect(byBuilding.get('mixed-use-high-rise')?.slice().sort()).toEqual([
      table.office,
      table.residential,
    ]);
    expect(byBuilding.get('vertical-city')?.slice().sort()).toEqual([
      table.office,
      table.hotel,
      table.residential,
    ]);
    // And no shipped car falls back to the code default any more. The default still exists for a
    // hand-built `ResolvedCar`; nothing in `data/` reaches it.
    for (const [id, values] of byBuilding) {
      expect(values.length, id).toBeGreaterThan(0);
      for (const value of values) expect(Number.isFinite(value), id).toBe(true);
    }
  });

  it('gives each mixed-use bank the transfer time of the population it serves', () => {
    // The per-bank detail, because the point of authoring these is that they differ *within* a
    // building. An office-local bank at the residential value would overstate its round trip; a
    // residential bank at the office value understates it, which is the original defect.
    const table = config.elevatorSpecs.timing.passengerTransferS;
    const byBank = (buildingId: string): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const car of carsFor(buildingId)) out[car.bankId] = car.passengerTransferS;
      return out;
    };

    expect(byBank('mixed-use-high-rise')).toEqual({
      // Feeds floors 32–60, so residents are aboard every trip; the slower value is also the
      // conservative one, and understating `tp` is the optimistic direction.
      shuttle: table.residential,
      'office-local': table.office,
      'residential-local': table.residential,
    });
    expect(byBank('vertical-city')).toEqual({
      shuttle: table.residential,
      'zone-1-local': table.office,
      'zone-2-local': table.office,
      'zone-3-local': table.office,
      'zone-4-local': table.office,
      'zone-5-local': table.hotel,
      'zone-6-local': table.residential,
    });
  });

  it('reads the same table the closed-form oracle reads', () => {
    // Two readers of one datum. If they ever disagree, the simulator and its own oracle are
    // measuring different buildings, and the Phase 2 acceptance comparison is meaningless.
    for (const type of ['office', 'residential', 'hotel', 'mixed-use'] as const) {
      expect(findPassengerTransferS(config.elevatorSpecs, type)).toBe(
        passengerTransferSecondsFor(config.elevatorSpecs, type),
      );
    }
  });

  /** `vertical-city`'s authored config with `passengerTransferS` removed from every car. */
  function verticalCityWithoutTransfer(): BuildingConfig {
    const base = config.buildingsById.get('vertical-city');
    if (base === undefined) throw new Error('no vertical-city');
    return parseBuilding(
      structuredClone({
        ...base.config,
        banks: base.config.banks.map((bank) => ({
          ...bank,
          cars: bank.cars.map(({ passengerTransferS: _drop, ...car }) => car),
        })),
      }),
      'vertical-city-stripped.json',
    );
  }

  it('refuses the config outright when a mixed-use car states no transfer time', () => {
    // The strongest form of the guarantee, and the one that closes the config layer: a mixed-use
    // building whose cars do not declare `tp` is not loadable at all. Before `resolveBuilding`
    // passed the building type down, this resolved happily with the field absent and the answer
    // existed only inside `Simulation`.
    let thrown: unknown;
    try {
      resolveBuilding(verticalCityWithoutTransfer(), config.elevatorSpecs, {
        file: 'vertical-city-stripped.json',
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    const issues = (thrown as ConfigError).issues;
    // One per car, all of them located, rather than the first one.
    expect(issues).toHaveLength(35);
    for (const issue of issues) {
      expect(issue.code).toBe(ISSUE_CODES.missingPassengerTransfer);
      expect(issue.path).toMatch(/^banks\[\d+]\.cars\[\d+]\.passengerTransferS$/);
    }
    expect(issues[0]?.message).toContain('mixed-use');
  });

  it('says out loud when a hand-built car reaches the runner with no transfer time', () => {
    // The remaining reachable path, now that the loader refuses: a `ResolvedBuilding` assembled
    // without the config layer — which is what a fixture is. `Simulation` must still be loud here
    // rather than spend a silent 1.2 s, because that silence *was* the defect.
    const base = config.buildingsById.get('vertical-city');
    if (base === undefined) throw new Error('no vertical-city');
    const building: ResolvedBuilding = {
      ...base,
      banks: base.banks.map((bank) => ({
        ...bank,
        cars: bank.cars.map(({ passengerTransferS: _drop, ...car }) => car),
      })),
    };

    const result = new Simulation({
      ...baseConfig('vertical-city', 'nearest-car', { durationS: 300, onTimeout: 'report' }),
      building,
    }).run();

    const said = result.warnings.filter((warning) =>
      warning.includes('passenger transfer time is undetermined'),
    );
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('vertical-city');
    expect(said[0]).toContain('mixed-use');
    // Naming the fallback is the point: a silent 1.2 s is what caused the defect.
    expect(said[0]).toContain(String(CAR_DEFAULTS.passengerTransferS));
  }, 60_000);

  it('is silent on every shipped building, because every one of them answers', () => {
    for (const id of BUILDING_IDS) {
      const result = runSimulation(
        baseConfig(id, 'nearest-car', { durationS: 300, onTimeout: 'report' }),
      );
      expect(
        result.warnings.filter((warning) => warning.includes('passenger transfer time')),
        id,
      ).toEqual([]);
    }
  }, 120_000);

  it('lets a car state its own value, which beats the type default', () => {
    const cars = new Simulation({
      ...baseConfig('garden-apartments', 'nearest-car'),
      building: gardenWithTransfer(1.2),
    }).building.cars;

    for (const car of cars) expect(car.passengerTransferS).toBe(1.2);
  }, 60_000);

  it('charges it at every stop: the same trace costs more at 1.75 s than at 1.2 s', () => {
    // The value being *present* on the car proves nothing about it being spent. Two runs of
    // the same seed differ in one number, so the passenger population is identical (common
    // random numbers) and every second of difference is door dwell.
    //
    // Run under up-peak at the group's handling capacity, not at the residential 3–7 % rate.
    // The dwell granted at a stop is `max(policy dwell, transfer)`, and with one or two
    // passengers aboard the 5 s hall-call dwell covers the transfer entirely — `tp` is real
    // but latent. It binds when cars leave the lobby loaded, which is also the operating point
    // the round-trip-time oracle describes.
    const upPeak = {
      demand: {
        directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
        arrivalRatePctPop5min: 45,
        peakWindowS: 900,
      },
    } as const;
    const asBuilt = new Simulation({
      ...baseConfig('garden-apartments', 'collective', upPeak),
      building: gardenWithTransfer(1.2),
    }).run();
    const asSpecified = runSimulation(baseConfig('garden-apartments', 'collective', upPeak));

    expect(asSpecified.trace.passengers).toEqual(asBuilt.trace.passengers);
    expect(asSpecified.conservation.delivered).toBe(asBuilt.conservation.delivered);

    const rideS = (result: SimulationResult): number => {
      const rides = result.record.passengers.flatMap((leg) =>
        leg.boardedAt === undefined || leg.alightedAt === undefined
          ? []
          : [leg.alightedAt - leg.boardedAt],
      );
      expect(rides.length).toBeGreaterThan(0);
      return rides.reduce((sum, ride) => sum + ride, 0) / rides.length;
    };

    // Measured: 59.8 s mean ride at 1.75 s against 54.6 s at 1.2 s, on identical passengers.
    // Loaded cars at 0.55 s more per passenger per direction cost seconds per stop, which is
    // the whole point — it is not a rounding difference, and it is systematically optimistic
    // in the direction CLAUDE.md § Statistical discipline singles out.
    expect(rideS(asSpecified)).toBeGreaterThan(rideS(asBuilt) + 3);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * The departure-clustering threshold, on the path that actually reports numbers
 *
 * REGRESSION, and the reason these assertions are on `summary` rather than on
 * `departureGapBracket`. The bracket derivation was written, documented and unit-tested, and
 * `MetricsRecorder` was constructed **without** `carTimings`, so `record.carTimings` was
 * `undefined` on all five shipped buildings and every achieved interval the project could report
 * came back `departureGapBasis: 'fallback'` with `departureGapS: 26.5`. Functionally the shipped
 * constant had gone from 10 s to 26.5 s and the derivation ran only in tests — the difference
 * between the defect being fixed and the defect being re-parameterised.
 *
 * `metrics/interval.test.ts` proves 26.5 s is not a general answer: five of the fourteen shipped
 * banks are at or above their own reopen bound at it. So "inside four hand-checked brackets" is
 * the whole of what a constant buys, and that is not what the interval's correctness may rest on.
 * -------------------------------------------------------------------------- */

describe('the achieved interval derives its threshold from the cars that ran', () => {
  const upPeak = {
    demand: {
      directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
      arrivalRatePctPop5min: 20,
      peakWindowS: 900,
    },
    onTimeout: 'report',
  } as const;

  it('reports a DERIVED basis on both Phase 2 buildings, and on the secure tower', () => {
    for (const id of ['midtown-office', 'garden-apartments', 'secure-tower'] as const) {
      const result = runSimulation(baseConfig(id, 'collective', upPeak));
      const interval = result.summary.achievedInterval;

      // The wiring, asserted where it is observable. If `MetricsRecorder` loses `carTimings`
      // again, this is the assertion that fails.
      expect(result.record.carTimings, id).toBeDefined();
      expect(interval.departureGapBasis, id).toBe('derived');
      expect(interval.departureGapS, id).not.toBe(FALLBACK_DEPARTURE_GAP_S);

      // And it is the bracket midpoint of the record's own timings, not any other number.
      const bracket = departureGapBracket(result.record.carTimings!);
      expect(interval.departureGapS, id).toBeCloseTo(bracket.gapS, 9);
      expect(bracket.basis, id).toBe('bracket-midpoint');
      expect(interval.departureGapS, id).toBeGreaterThan(bracket.maxReopenS);
      expect(interval.departureGapS, id).toBeLessThan(bracket.minRoundTripS as number);
    }
  }, 120_000);

  it('lands where the fallback also landed, which is what makes the fallback defensible', () => {
    // The derived threshold and 26.5 s are both inside these buildings' brackets, so they must
    // return the *same* interval. This is the check that says the wiring did not silently change
    // the answer — it changed what the answer rests on. A run where these differ means the
    // constant was outside the bracket, which is the defect this whole mechanism replaced.
    for (const id of ['midtown-office', 'garden-apartments'] as const) {
      const result = runSimulation(baseConfig(id, 'collective', upPeak));
      const derived = result.summary.achievedInterval;
      // The *same* terminal set the run summarized with — Midtown declares two entrances, so
      // taking `terminalFloorId` (which is undefined for two) and letting the busiest floor be
      // inferred would compare two different populations of boardings and prove nothing.
      const building = config.buildingsById.get(id);
      if (building === undefined) throw new Error(`no ${id}`);
      const terminalFloorIds = building.entranceFloors.map((floor) => floor.id);
      const atFallback = summarizeRun(result.record, {
        window: result.reportWindow,
        terminalFloorIds,
        departureGapS: FALLBACK_DEPARTURE_GAP_S,
      }).achievedInterval;

      expect(atFallback.departureGapBasis, id).toBe('explicit');
      expect(atFallback.boardingCount, id).toBe(derived.boardingCount);
      expect(derived.departureCount, id).toBe(atFallback.departureCount);
      expect(derived.meanS, id).toBeCloseTo(atFallback.meanS, 9);
    }
  }, 120_000);

  it('reports NO interval on the mixed-use towers, and says why in warnings', () => {
    // Their ground lobbies are served by two banks whose duty cycles differ by more than the
    // bracket can span: a shuttle holds its doors 39.8 s for a 20-person load at 1.75 s while an
    // office-local car beside it completes a whole round trip in 31.3 s. There is no threshold that
    // separates a reopen from a return there, so the honest output is no number at all — not the
    // fallback, which lies outside every bracket on these buildings.
    for (const id of ['mixed-use-high-rise', 'vertical-city'] as const) {
      const result = runSimulation(baseConfig(id, 'collective', upPeak));
      const interval = result.summary.achievedInterval;

      // The timings are present — this is a verdict reached *from* them, not their absence.
      expect(result.record.carTimings, id).toBeDefined();
      expect(interval.departureGapBasis, id).toBe('unmeasurable');
      expect(Number.isNaN(interval.departureGapS), id).toBe(true);
      expect(Number.isNaN(interval.meanS), id).toBe(true);
      expect(interval.departureCount, id).toBe(0);
      // Explicitly not the fallback dressed up as a measurement.
      expect(interval.departureGapS, id).not.toBe(FALLBACK_DEPARTURE_GAP_S);

      const said = result.warnings.filter((warning) =>
        warning.includes('achieved interval cannot be measured'),
      );
      expect(said, id).toHaveLength(1);
      expect(said[0], id).toContain(id);
      // The two numbers that make the bracket empty, so the warning is diagnosable on its own.
      expect(said[0], id).toMatch(/39\.80 s|32\.80 s/);
    }
  }, 120_000);

  it('derives the timings from the cars, including a per-car transfer override', () => {
    // `fullLoadTransferS` is `designCapacityPersons · passengerTransferS`, so the two fixes meet
    // here: if `passengerTransferS` stopped reaching the car, this bound would drop and the
    // threshold would move back towards the value that under-counted departures.
    const result = runSimulation(baseConfig('garden-apartments', 'collective', upPeak));
    const timings = result.record.carTimings;
    expect(timings).toBeDefined();

    const cars = new Simulation(baseConfig('garden-apartments', 'collective')).building.cars;
    const worstTransferS = Math.max(
      ...cars.map((car) => car.spec.designCapacityPersons * car.passengerTransferS),
    );
    expect(timings?.fullLoadTransferS).toBeCloseTo(worstTransferS, 9);
    // 8 persons x 1.75 s residential. At the office 1.2 s it would be 9.6 s, below the 5 s hall
    // dwell's own contribution and a materially smaller reopen bound.
    expect(timings?.fullLoadTransferS).toBeCloseTo(14, 9);

    // Jerk-limited, never rise / ratedSpeed: a 3.0 m hop at 0.63 m/s "rated" is 4.76 s on paper
    // and 6.56 s in the physics, and the naive figure would shrink the bracket from above.
    const naiveS = 3.0 / 0.63;
    expect(timings?.nearestFloorFlightS).toBeGreaterThan(naiveS);
    expect(timings?.nearestFloorFlightS).toBeCloseTo(6.5619, 3);
  }, 60_000);
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
  }, 60_000);

  it('re-windows on request without re-simulating', () => {
    const peak = runSimulation(baseConfig('garden-apartments', 'nearest-car'));
    const whole = runSimulation(
      baseConfig('garden-apartments', 'nearest-car', { reportWindow: 'full-run' }),
    );

    expect(whole.reportWindow.id).toBe('full-run');
    expect(whole.record.passengers).toEqual(peak.record.passengers);
    expect(whole.summary.counts.arrivals).toBeGreaterThanOrEqual(peak.summary.counts.arrivals);
  }, 60_000);

  it('takes the demand horizon from durationS', () => {
    const result = runSimulation(
      baseConfig('garden-apartments', 'nearest-car', { durationS: 900 }),
    );
    expect(result.trace.durationS).toBe(900);
    expect(result.demandEndedAt).toBe(900);
    for (const record of result.trace.passengers) {
      expect(record.arrivalTimeS).toBeLessThan(900);
    }
  }, 60_000);

  it('refuses a second run from the same Simulation', () => {
    const simulation = new Simulation(baseConfig('garden-apartments', 'nearest-car'));
    simulation.run();
    expect(() => simulation.run()).toThrow(SimulationError);
    expect(() => simulation.run()).toThrow(/already run/);
  }, 60_000);

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
  }, 60_000);

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

  it('declares no log scale over a range a log-uniform draw is undefined on', () => {
    /*
     * The rule `experiments`' `tuning/space/collect.ts` enforces from the other side, restated
     * here so `core` fails on its own declaration rather than only when something tries to
     * collect it. Two rows broke it until T75 — `sim.drainGraceS` and `sim.queueSampleCount`,
     * both `log` over a range starting at 0 — and the whole of `SIM_PARAMETERS` was therefore
     * uncollectable, which is what blocked the viewer's generated form (DECISIONS.md § D134).
     *
     * Zero is a *named mode* in both ranges, not a slack bound: `queueSampleCount: 0` is the
     * documented fallback to the reconstructed series and `drainGraceS: 0` is a deadline at the
     * demand horizon. So the fix was the scale and the bound stayed, and this guard is written
     * to red either way round — raise a log row's minimum to 0 and it fails.
     */
    const logRows = SIM_PARAMETERS.filter((parameter) => parameter.scale === 'log');
    // Not vacuous: `sim.dispatchRetryS` is a live log dimension over [0.5, 60].
    expect(logRows.length).toBeGreaterThan(0);
    for (const parameter of logRows) {
      expect(parameter.range?.[0] ?? 0, `${parameter.id} declares a log scale`).toBeGreaterThan(0);
    }
    // …and every bounded row declares one of the two scales a sampler implements.
    for (const parameter of SIM_PARAMETERS) {
      if (parameter.range === undefined) continue;
      expect(['linear', 'log'], parameter.id).toContain(parameter.scale);
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
  }, 60_000);

  it('records the fleet roster and the population on the run record', () => {
    const result = runSimulation(baseConfig('midtown-office', 'eta'));
    expect(result.record.carIds).toHaveLength(4);
    expect(result.record.population).toBe(config.buildingsById.get('midtown-office')?.totalPopulation);
    expect(result.record.buildingId).toBe('midtown-office');
    expect(result.record.demandTemplateId).toBe(result.trace.template.id);
  }, 60_000);

  it('names every shipped building in its own run id by default', () => {
    for (const buildingId of BUILDING_IDS) {
      const result = runSimulation(
        baseConfig(buildingId, 'nearest-car', { durationS: 300, onTimeout: 'report' }),
      );
      expect(result.runId).toBe(`${buildingId}-nearest-car-20260726`);
      expect(result.record.runId).toBe(result.runId);
    }
  }, 60_000);
});
