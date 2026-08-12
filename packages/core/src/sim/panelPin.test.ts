/**
 * **The landing panel may not pin an unbounded queue to one car** — and a run with nobody to
 * carry anybody has to say so.
 *
 * Three defects the UI readiness audit found in `sim/simulation.ts`, each measured on a shipped
 * building through the real `runSimulation`:
 *
 * 1. **The pin.** `#tellThePanel` promised *every* unpromised waiter at a call to `carIds[0]` with
 *    no capacity bound, and `#candidateCars` then restricted every later decision for that call to
 *    the already-promised cars. A rider who walked up to a busy landing an hour later inherited
 *    other people's pin, because a call is only extinguished when its landing empties and
 *    `reassignmentPolicy: 'never'` — every shipped profile — will not revisit an allocation in
 *    between. Measured on Vertical City: 81 riders at the median promised to one car holding 13 to
 *    20, while four of its seven siblings stood idle and empty.
 * 2. **The timeout diagnosis named a remedy that provably does nothing.** `#timeoutDiagnosis`
 *    branched on `#deadlineTruncations > 0`, and that counter includes dispatch *retry ticks*: a
 *    run with every car withdrawn reported *"the drain deadline cut 1 pieces of work: raise
 *    sim.drainGraceS"* about a run whose last recorded event was 3 600 s before that deadline.
 * 3. **A zero-fleet run emitted no warning at all.** `timed-out`, nobody delivered, and
 *    `result.warnings` empty — the viewer draws one row per warning, so the player got a red word
 *    and no cause.
 *
 * **§ D29 is not weakened and is asserted here in both directions.** The write-once promise is
 * about the passenger the panel has *already answered*: they keep their car, `brokenPromises` still
 * counts every time a full car leaves them, and `wrongCarBoardings` is still zero. What changed is
 * what happens to somebody the panel has told **nothing** — a rider D29 says nothing about — and
 * the test below that would catch a re-offer of a promised passenger is
 * `every boarded leg boarded the car it was promised`, asserted on the same runs.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import type { Car } from '../model/car/index.js';

import { load } from './fixtures.test-helper.js';
import { Simulation, runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

function buildingOf(id: string): ResolvedBuilding {
  const building = config.buildingsById.get(id);
  if (building === undefined) throw new Error(`missing building fixture "${id}"`);
  return building;
}

function profileOf(id: string): DispatcherProfile {
  const profile = config.dispatcherProfilesById.get(id);
  if (profile === undefined) throw new Error(`missing dispatcher fixture "${id}"`);
  return profile;
}

function configFor(
  buildingId: string,
  dispatcherId: string,
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  return {
    building: buildingOf(buildingId),
    dispatcherProfile: profileOf(dispatcherId),
    trafficProfiles: config.trafficProfiles,
    dispatcherProfiles: config.dispatcherProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 20_260_810,
    demandTemplate: 'rise-and-fall',
    onTimeout: 'report',
    ...overrides,
  } as SimulationConfig;
}

/** Every car of the building, keyed by the id the record uses. */
function carsOf(simulation: Simulation): ReadonlyMap<string, Car> {
  const cars = new Map<string, Car>();
  for (const bank of simulation.building.banks) for (const car of bank.cars) cars.set(car.id, car);
  return cars;
}

/**
 * The largest mass promised to one car's deck and not yet aboard it, at any instant of the run,
 * **reconstructed from the leg records** rather than from the runner's own bookkeeping.
 *
 * A promise is outstanding on `[assignedAt, boardedAt)`. Sweeping those two columns in time order
 * gives the outstanding load per car exactly, and it is per **deck** for the same reason the
 * runner's bound is: a deck is a room with its own doorway, and the leg's origin floor says which
 * one it will be standing at.
 *
 * @returns the peak outstanding mass and head count per `carId#deck`.
 */
function peakOutstandingPromises(
  result: SimulationResult,
  cars: ReadonlyMap<string, Car>,
): ReadonlyMap<string, { massKg: number; people: number }> {
  type Delta = { at: number; key: string; massKg: number; people: number };
  const deltas: Delta[] = [];
  for (const leg of result.record.passengers) {
    const carId = leg.assignedCarId;
    if (carId === undefined || leg.assignedAt === undefined) continue;
    const car = cars.get(carId);
    if (car === undefined) continue;
    const key =
      car.deckDesignLoadKg === undefined
        ? car.id
        : `${car.id}#${car.deckFor(leg.originFloorId)}`;
    deltas.push({ at: leg.assignedAt, key, massKg: leg.massKg, people: 1 });
    if (leg.boardedAt !== undefined) {
      deltas.push({ at: leg.boardedAt, key, massKg: -leg.massKg, people: -1 });
    }
  }
  // Discharges before charges at the same instant would understate the peak, so charges are
  // applied first: `#boardFrom` takes the promise off the books in the same statement pair that
  // puts the rider in the car, and a tie here must not be allowed to hide an overshoot.
  deltas.sort((a, b) => a.at - b.at || b.people - a.people);

  const live = new Map<string, { massKg: number; people: number }>();
  const peak = new Map<string, { massKg: number; people: number }>();
  for (const delta of deltas) {
    const now = live.get(delta.key) ?? { massKg: 0, people: 0 };
    now.massKg += delta.massKg;
    now.people += delta.people;
    live.set(delta.key, now);
    const best = peak.get(delta.key) ?? { massKg: 0, people: 0 };
    peak.set(delta.key, {
      massKg: Math.max(best.massKg, now.massKg),
      people: Math.max(best.people, now.people),
    });
  }
  return peak;
}

/* -------------------------------------------------------------------------- *
 * 1. The pin
 * -------------------------------------------------------------------------- */

describe('the landing panel promises no car more than that car can hold', () => {
  it('never leaves more mass promised to a deck than that deck is designed for', () => {
    /*
     * The audit's headline measurement, as an assertion. Against the unfixed runner this fails on
     * the first shipped building it reaches: `#tellThePanel` had no bound at all, so the peak is
     * whatever the landing grew to — measured at 81 riders on a car whose deck holds 13 to 20.
     *
     * The bound crosses by exactly one person, deliberately and for the same reason `#boardFrom`
     * does (the load cell trips *after* somebody steps in), so the ceiling asserted here is the
     * design load plus the heaviest rider in the run.
     */
    for (const buildingId of ['vertical-city', 'midtown-office', 'mixed-use-high-rise']) {
      const simulation = new Simulation(configFor(buildingId, 'destination-panel'));
      const cars = carsOf(simulation);
      const result = simulation.run();
      const heaviestKg = Math.max(...result.record.passengers.map((leg) => leg.massKg));
      expect(heaviestKg, buildingId).toBeGreaterThan(0);

      const peak = peakOutstandingPromises(result, cars);
      expect(peak.size, `${buildingId}: nobody was promised anything`).toBeGreaterThan(0);
      for (const [key, seen] of peak) {
        const carId = key.split('#')[0] ?? key;
        const car = cars.get(carId);
        if (car === undefined) continue;
        const ceilingKg = (car.deckDesignLoadKg ?? car.loadSensor.designLoadKg) + heaviestKg;
        expect(
          seen.massKg,
          `${buildingId}: ${key} was promised ${seen.massKg.toFixed(1)} kg (${seen.people} riders) against a ceiling of ${ceilingKg.toFixed(1)} kg`,
        ).toBeLessThanOrEqual(ceilingKg);
      }
    }
  }, 300_000);

  it('clears every landing on Vertical City that the pin used to leave standing', () => {
    /*
     * The end-to-end consequence, on the four seeds the audit reports. Against the unfixed runner
     * three of these four are `timed-out` with 40, 60 and 109 journeys still in the system;
     * `collective` clears the identical trace at every one of them.
     */
    for (const seed of [20_260_810, 20_260_811, 20_260_812, 20_270_000]) {
      const result = runSimulation(configFor('vertical-city', 'destination-panel', { seed }));
      expect(result.status, `seed ${seed}`).toBe('completed');
      expect(result.conservation.undelivered, `seed ${seed}`).toBe(0);
      expect(result.conservation.wrongCarBoardings, `seed ${seed}`).toBe(0);
      // The books, on the same run: no journey may be invented or lost by any of this.
      const audit = result.conservation;
      expect(
        audit.delivered + audit.undelivered + (audit.abandoned ?? 0) + (audit.accessRefused ?? 0),
        `seed ${seed}`,
      ).toBe(audit.generated);
    }
  }, 300_000);

  it('delivers the whole of Midtown when two of its four cars are recalled mid-run', () => {
    /*
     * The audit's standalone case: no double-deck car anywhere, so the pin is shown to be a defect
     * of the panel rather than of the deck model. Against the unfixed runner this run is
     * `timed-out` with 185 of 719 journeys in the system, while eleven of the thirteen shipped
     * dispatchers deliver 719 of 719 on the identical trace.
     */
    const withdrawn: ResolvedBuilding = {
      ...buildingOf('midtown-office'),
      serviceEvents: buildingOf('midtown-office')
        .banks[0]!.cars.slice(0, 2)
        .map((car) => ({
          atS: 900,
          bankId: 'main',
          carId: car.id,
          mode: 'out-of-service' as const,
        })),
    };
    const result = runSimulation(
      configFor('midtown-office', 'destination-panel', { building: withdrawn }),
    );
    expect(result.status).toBe('completed');
    expect(result.conservation.undelivered).toBe(0);
    expect(result.conservation.delivered).toBe(result.conservation.generated);
    expect(result.conservation.wrongCarBoardings).toBe(0);
  }, 300_000);

  it('keeps § D29: the promise still stands, is still paid for, and still binds the boarding', () => {
    /*
     * The guard on the fix. A change that recovered the deferral advantage by quietly re-offering
     * promised passengers would clear every assertion above and fail these: the promise would stop
     * costing anything (`brokenPromises` collapsing to zero) and riders would board cars nobody
     * promised them.
     */
    const result = runSimulation(configFor('vertical-city', 'destination-panel'));
    expect(
      result.conservation.brokenPromises,
      'no promise was ever broken, so the panel is no longer committing at the landing',
    ).toBeGreaterThan(0);
    expect(result.conservation.wrongCarBoardings).toBe(0);
    for (const leg of result.record.passengers) {
      if (leg.carId === undefined) continue;
      expect(leg.carId, `${leg.passengerId} boarded a car nobody promised them`).toBe(
        leg.assignedCarId,
      );
    }
  }, 300_000);

  it('does not hand a new arrival the pin the people in front of them are holding', () => {
    /*
     * **The mechanism itself, on the legs.** Everything above measures the *consequence*; this
     * measures the change. A rider is counted here when they were promised a car at an instant
     * when somebody else at the same origin-destination pair was already promised a *different*
     * one and had not yet boarded — which is precisely the decision `#candidateCars` used to make
     * impossible, because a landing holding one promise was scored over that car's snapshot alone
     * and no other car could be returned.
     *
     * Against the unfixed runner this count is **exactly zero** on this run, and it has to be:
     * Vertical City declares no `serviceEvents`, so `promisesRevoked` is zero and there is no
     * other path by which a landing's promises can name two cars at once. It is the test that
     * would go red again the moment the restriction came back.
     */
    const result = runSimulation(configFor('vertical-city', 'destination-panel'));
    expect(result.conservation.promisesRevoked).toBe(0);

    const promised = result.record.passengers
      .filter((leg) => leg.assignedCarId !== undefined && leg.assignedAt !== undefined)
      .sort((a, b) => (a.assignedAt as number) - (b.assignedAt as number));
    let offeredElsewhere = 0;
    for (const leg of promised) {
      const at = leg.assignedAt as number;
      for (const other of promised) {
        if (other === leg) continue;
        const since = other.assignedAt as number;
        if (since > at) break;
        if (other.boardedAt !== undefined && other.boardedAt <= at) continue;
        if (other.originFloorId !== leg.originFloorId) continue;
        if (other.destinationFloorId !== leg.destinationFloorId) continue;
        if (other.assignedCarId === leg.assignedCarId) continue;
        offeredElsewhere += 1;
        break;
      }
    }
    expect(
      offeredElsewhere,
      'every promise at a landing named the car the outstanding promises there already named — ' +
        'the new arrival inherited the pin',
    ).toBeGreaterThan(0);
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * 2 and 3. A fleet that cannot answer says so, and is not sent to the wrong knob
 * -------------------------------------------------------------------------- */

/** Every car of the building withdrawn before the first arrival. */
function fleetless(buildingId: string): ResolvedBuilding {
  const building = buildingOf(buildingId);
  return {
    ...building,
    serviceEvents: building.banks.flatMap((bank) =>
      bank.cars.map((car) => ({
        atS: 0,
        bankId: bank.id,
        carId: car.id,
        mode: 'out-of-service' as const,
      })),
    ),
  };
}

describe('a bank with no car in group control', () => {
  it('says so in the run record, naming the bank and the queue', () => {
    // Against the unfixed runner `warnings` is empty on both of these: no car is priced and no
    // call is refused, so every other diagnostic in `#diagnoseStuckCalls` has nothing to report.
    for (const buildingId of ['garden-apartments', 'midtown-office']) {
      const result = runSimulation(
        configFor(buildingId, 'collective', { building: fleetless(buildingId) }),
      );
      expect(result.status, buildingId).toBe('timed-out');
      expect(result.conservation.delivered, buildingId).toBe(0);
      const named = (result.record.warnings ?? []).filter(
        (line) => line.includes('bank "main"') && line.includes('group control'),
      );
      expect(named.length, `${buildingId}: warnings were ${JSON.stringify(result.record.warnings)}`).toBe(1);
      expect(named[0]).toMatch(/rider\(s\) eligible and waiting/);
    }
  }, 300_000);

  it('is quiet on every run whose fleet is in service', () => {
    // The other direction, so the warning cannot become decoration: no shipped building declares
    // `serviceEvents` or a car `mode`, and none of them may acquire this line.
    for (const buildingId of ['garden-apartments', 'midtown-office', 'vertical-city']) {
      const result = runSimulation(configFor(buildingId, 'collective'));
      const named = (result.record.warnings ?? []).filter((line) =>
        line.includes('group control'),
      );
      expect(named, buildingId).toEqual([]);
    }
  }, 300_000);

  it('does not send its owner to sim.drainGraceS, and the knob is measured rather than argued', () => {
    /*
     * Against the unfixed runner the message reads *"The drain deadline (t=5400s …) cut 1 pieces
     * of work: raise sim.drainGraceS or lower demand"* — for a run whose last recorded event was
     * at t=1800 s. The refutation is measured in the same test rather than asserted: the run is
     * repeated at twenty times the grace period and returns the same figures, so the knob the old
     * message named is shown to do nothing on the case that named it.
     */
    const building = fleetless('garden-apartments');
    let message = '';
    try {
      runSimulation(
        configFor('garden-apartments', 'collective', { building, onTimeout: 'throw' }),
      );
      throw new Error('a run that delivered nobody did not throw under onTimeout: throw');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/short of the drain deadline \(t=5400s\) and without it ever biting/);
    expect(message).toContain('dispatch retries that fell past it');
    expect(message).toContain('raising sim.drainGraceS cannot help');
    expect(message).not.toMatch(/raise sim\.drainGraceS or lower demand/);

    const plain = runSimulation(configFor('garden-apartments', 'collective', { building }));
    const generous = runSimulation(
      configFor('garden-apartments', 'collective', { building, drainGraceS: 36_000 }),
    );
    expect(generous.status).toBe(plain.status);
    expect(generous.conservation.delivered).toBe(plain.conservation.delivered);
    expect(generous.conservation.undelivered).toBe(plain.conservation.undelivered);
  }, 300_000);

  it('still names the deadline on a run the deadline really did stop', () => {
    /*
     * The branch's other arm, so the new test is not one that always answers the same way. A run
     * given a demand horizon it cannot drain within its grace period reaches its deadline, and its
     * diagnosis must say so and name the knob that would help.
     */
    let message = '';
    try {
      runSimulation(
        configFor('midtown-office', 'nearest-car', {
          durationS: 3600,
          drainGraceS: 0,
          demand: { arrivalRatePctPop5min: 18 },
          onTimeout: 'throw',
        }),
      );
      throw new Error('the saturating run delivered everybody');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/raise sim\.drainGraceS or lower demand/);
    expect(message).not.toContain('ever biting');
  }, 300_000);
});
