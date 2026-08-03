import { describe, expect, it } from 'vitest';

import type { PassengerMassConfig } from '../config/types.js';
import { StreamSet } from '../random/index.js';

import {
  Passenger,
  PassengerFactory,
  drawPassengerMass,
  type PassengerInit,
} from './passenger.js';
import { ModelError, type FloorTopology } from './types.js';

/** The shipped distribution, from data/traffic-profiles.json. */
const MASS: PassengerMassConfig = {
  distribution: 'normal',
  meanKg: 75,
  stdDevKg: 15,
  minKg: 20,
};

/** A two-floor stand-in for a building. `Building` satisfies `FloorTopology` for real. */
function topology(
  indices: Readonly<Record<string, number>>,
  transferFloors: readonly string[] = [],
): FloorTopology {
  const transfers = new Set(transferFloors);
  return {
    floorIndexOf: (floorId) => indices[floorId],
    isTransferFloor: (floorId) => transfers.has(floorId),
  };
}

const TOWER = topology({ G: 0, '12': 12, '31': 31, '45': 45 }, ['G', '31']);

function makePassenger(overrides: Partial<PassengerInit> = {}): Passenger {
  return new Passenger({
    id: 'p1',
    journeyId: 'j1',
    originFloorId: 'G',
    originFloorIndex: 0,
    destinationFloorId: '12',
    destinationFloorIndex: 12,
    massKg: 75,
    arrivedAt: 0,
    ...overrides,
  });
}

describe('drawPassengerMass', () => {
  it('draws a distribution, not a constant', () => {
    const rng = new StreamSet(20260725).passengerMass;
    const masses = Array.from({ length: 200 }, () => drawPassengerMass(rng, MASS));
    expect(new Set(masses).size).toBeGreaterThan(150);

    const mean = masses.reduce((sum, kg) => sum + kg, 0) / masses.length;
    expect(mean).toBeGreaterThan(70);
    expect(mean).toBeLessThan(80);
  });

  it('is reproducible from the master seed', () => {
    const a = Array.from({ length: 20 }, () =>
      drawPassengerMass(new StreamSet(7).passengerMass, MASS),
    );
    const b = Array.from({ length: 20 }, () =>
      drawPassengerMass(new StreamSet(7).passengerMass, MASS),
    );
    expect(a).toEqual(b);
  });

  it('clamps the tails into [minKg, maxKg]', () => {
    const bounded: PassengerMassConfig = { ...MASS, minKg: 45, maxKg: 110 };
    const rng = new StreamSet(99).passengerMass;
    for (let i = 0; i < 500; i += 1) {
      const kg = drawPassengerMass(rng, bounded);
      expect(kg).toBeGreaterThanOrEqual(45);
      expect(kg).toBeLessThanOrEqual(110);
    }
  });

  it('consumes exactly one draw whether or not the value is clamped', () => {
    // Rejection sampling would make the draw count depend on the values drawn, so two
    // configurations under common random numbers would fall out of step on this stream the
    // first time one of them happened to draw a 130 kg passenger. `allClamped` forces every
    // single draw outside the bounds; the generator must still advance at the same rate.
    const allClamped: PassengerMassConfig = { ...MASS, minKg: 500, maxKg: 501 };
    const clamping = new StreamSet(3).passengerMass;
    const reference = clamping.clone();

    for (let i = 0; i < 25; i += 1) {
      expect(drawPassengerMass(clamping, allClamped)).toBe(500);
      reference.normal(MASS.meanKg, MASS.stdDevKg);
    }
    expect(clamping.getState()).toEqual(reference.getState());
  });

  it('rejects a distribution it cannot sample', () => {
    // `lognormal` used to be this test's example and is now a supported family (docs/14 § 2.1),
    // so the example moved rather than the assertion: an unknown name must still be refused by
    // name instead of falling back to a normal nobody asked for.
    const rng = new StreamSet(1).passengerMass;
    expect(() => drawPassengerMass(rng, { ...MASS, distribution: 'weibull' })).toThrow(ModelError);
    expect(() => drawPassengerMass(rng, { ...MASS, distribution: 'weibull' })).toThrow(
      /Unsupported passenger mass distribution/,
    );
  });

  /**
   * **`lognormal` is a different population, and it costs the same number of draws.**
   *
   * The moments a caller supplies are the moments of the *mass* — "mean 75 kg, spread 15 kg" —
   * not of its logarithm, so the two families are directly comparable and the sample mean lands
   * where it was asked to. What differs is the shape: right-skewed, so the median sits strictly
   * below the mean and no draw is ever negative before clamping.
   *
   * The draw-count clause is the load-bearing one. A family that consumed a different number of
   * uniforms could not be compared against `normal` under common random numbers at all, which is
   * the same discipline `drawGeometricBatchSize` keeps for group size (`DECISIONS.md` § D203).
   */
  it('samples lognormal at the requested mass moments, on the same draw budget', () => {
    const lognormal: PassengerMassConfig = { ...MASS, distribution: 'lognormal' };
    const rng = new StreamSet(4242).passengerMass;
    const draws = Array.from({ length: 20_000 }, () => drawPassengerMass(rng, lognormal));

    const mean = draws.reduce((sum, kg) => sum + kg, 0) / draws.length;
    const variance =
      draws.reduce((sum, kg) => sum + (kg - mean) ** 2, 0) / (draws.length - 1);
    expect(mean).toBeCloseTo(MASS.meanKg, 0);
    expect(Math.sqrt(variance)).toBeCloseTo(MASS.stdDevKg, 0);

    // Right-skewed: more than half the population is lighter than the mean. A normal splits evenly,
    // so this is the clause that fails if the family name is stored and ignored.
    const lighter = draws.filter((kg) => kg < MASS.meanKg).length;
    expect(lighter).toBeGreaterThan(draws.length * 0.52);

    // One `rng.normal` per call, exactly as the normal branch takes one.
    const counted = new StreamSet(11).passengerMass;
    const reference = counted.clone();
    for (let i = 0; i < 25; i += 1) {
      drawPassengerMass(counted, lognormal);
      reference.normal(0, 1);
    }
    expect(counted.getState()).toEqual(reference.getState());
  });

  it('rejects an incoherent distribution', () => {
    const rng = new StreamSet(1).passengerMass;
    expect(() => drawPassengerMass(rng, { ...MASS, meanKg: 0 })).toThrow(ModelError);
    expect(() => drawPassengerMass(rng, { ...MASS, stdDevKg: -1 })).toThrow(ModelError);
    expect(() => drawPassengerMass(rng, { ...MASS, minKg: 0 })).toThrow(ModelError);
    expect(() => drawPassengerMass(rng, { ...MASS, minKg: 80, maxKg: 60 })).toThrow(ModelError);
  });
});

describe('Passenger', () => {
  it('derives its direction from floor indices', () => {
    expect(makePassenger().direction).toBe('up');
    expect(
      makePassenger({
        originFloorId: '12',
        originFloorIndex: 12,
        destinationFloorId: 'G',
        destinationFloorIndex: 0,
      }).direction,
    ).toBe('down');
  });

  it('refuses to travel from a floor to itself', () => {
    expect(() =>
      makePassenger({ destinationFloorId: 'G', destinationFloorIndex: 0 }),
    ).toThrow(ModelError);
  });

  it('refuses a mass that no load sensor could measure', () => {
    expect(() => makePassenger({ massKg: 0 })).toThrow(ModelError);
    expect(() => makePassenger({ massKg: Number.NaN })).toThrow(ModelError);
  });

  it('starts a single-leg journey as its own final leg', () => {
    const passenger = makePassenger();
    expect(passenger.legIndex).toBe(0);
    expect(passenger.isFinalLeg).toBe(true);
    expect(passenger.journeyOriginFloorId).toBe('G');
    expect(passenger.journeyStartedAt).toBe(0);
    expect(passenger.finalDestinationFloorId).toBe('12');
  });

  it('records wait, ride and leg times from kernel timestamps', () => {
    const passenger = makePassenger({ arrivedAt: 10 });
    expect(passenger.isWaiting).toBe(true);
    expect(passenger.waitTimeS).toBeUndefined();

    passenger.board(34);
    expect(passenger.isRiding).toBe(true);
    expect(passenger.waitTimeS).toBe(24);
    expect(passenger.rideTimeS).toBeUndefined();

    passenger.alight(70);
    expect(passenger.hasAlighted).toBe(true);
    expect(passenger.rideTimeS).toBe(36);
    expect(passenger.legTimeS).toBe(60);
    expect(passenger.timeToDestinationS).toBe(60);
  });

  it('writes each timestamp once and never backwards', () => {
    const passenger = makePassenger({ arrivedAt: 10 });
    expect(() => passenger.alight(20)).toThrow(/never boarded/);
    expect(() => passenger.board(9)).toThrow(/never runs backwards/);

    passenger.board(20);
    expect(() => passenger.board(21)).toThrow(/cannot board again/);
    expect(() => passenger.alight(19)).toThrow(/never runs backwards/);

    passenger.alight(40);
    expect(() => passenger.alight(41)).toThrow(/cannot alight again/);
  });
});

describe('sky-lobby journeys', () => {
  function factory(): PassengerFactory {
    return new PassengerFactory({
      streams: new StreamSet(20260725),
      massConfig: MASS,
      topology: TOWER,
    });
  }

  it('keeps one journey identity across a transfer', () => {
    const passengers = factory();
    const leg1 = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '31',
      finalDestinationFloorId: '45',
      arrivedAt: 0,
      credentialGroup: 'resident',
    });

    expect(leg1.isFinalLeg).toBe(false);
    leg1.board(20);
    leg1.alight(45);
    // Not home yet: reporting the shuttle leg as a completed journey would flatter every
    // sky-lobby building.
    expect(leg1.timeToDestinationS).toBeUndefined();

    const leg2 = passengers.transfer(leg1, { destinationFloorId: '45', arrivedAt: 60 });

    expect(leg2.journeyId).toBe(leg1.journeyId);
    expect(leg2.id).not.toBe(leg1.id);
    expect(leg2.legIndex).toBe(1);
    expect(leg2.originFloorId).toBe('31');
    expect(leg2.journeyOriginFloorId).toBe('G');
    expect(leg2.journeyStartedAt).toBe(0);
    expect(leg2.isFinalLeg).toBe(true);
    // Same person: same mass and the same credential ride the second leg.
    expect(leg2.massKg).toBe(leg1.massKg);
    expect(leg2.credentialGroup).toBe('resident');
  });

  it('measures time to destination across both legs, including the transfer', () => {
    const passengers = factory();
    const leg1 = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '31',
      finalDestinationFloorId: '45',
      arrivedAt: 100,
    });
    leg1.board(130);
    leg1.alight(160);

    const leg2 = passengers.transfer(leg1, { destinationFloorId: '45', arrivedAt: 175 });
    leg2.board(215);
    leg2.alight(260);

    expect(leg1.legTimeS).toBe(60);
    expect(leg2.waitTimeS).toBe(40); // its own wait, not the first leg's
    expect(leg2.legTimeS).toBe(85);
    // 260 - 100: both waits, both rides, and the 15 s walk across the sky lobby.
    expect(leg2.timeToDestinationS).toBe(160);
    expect(leg2.timeToDestinationS).toBeGreaterThan((leg1.legTimeS ?? 0) + (leg2.legTimeS ?? 0));
  });

  it('survives two transfers', () => {
    // 45 -> 20 in a sky-lobby tower: residential-local down to the sky lobby, shuttle to the
    // ground lobby, office-local back up.
    const passengers = new PassengerFactory({
      streams: new StreamSet(11),
      massConfig: MASS,
      topology: TOWER,
    });
    const leg1 = passengers.arrive({
      originFloorId: '45',
      destinationFloorId: '31',
      finalDestinationFloorId: '12',
      arrivedAt: 0,
    });
    leg1.board(10);
    leg1.alight(30);
    const leg2 = passengers.transfer(leg1, { destinationFloorId: 'G', arrivedAt: 40 });
    leg2.board(50);
    leg2.alight(80);
    const leg3 = passengers.transfer(leg2, { destinationFloorId: '12', arrivedAt: 90 });
    leg3.board(100);
    leg3.alight(140);

    expect([leg1.legIndex, leg2.legIndex, leg3.legIndex]).toEqual([0, 1, 2]);
    expect(new Set([leg1.journeyId, leg2.journeyId, leg3.journeyId]).size).toBe(1);
    expect(new Set([leg1.id, leg2.id, leg3.id]).size).toBe(3);
    expect(leg3.timeToDestinationS).toBe(140);
    expect(passengers.journeyCount).toBe(1);
    expect(passengers.passengerCount).toBe(3);
  });

  it('refuses to transfer anywhere but a declared sky lobby', () => {
    const passengers = factory();
    const passenger = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '12',
      finalDestinationFloorId: '45',
      arrivedAt: 0,
    });
    passenger.board(5);
    passenger.alight(30);

    expect(() => passengers.transfer(passenger, { destinationFloorId: '45', arrivedAt: 40 })).toThrow(
      /not flagged isTransferFloor/,
    );
  });

  it('refuses to transfer a passenger who is still in the car', () => {
    const passengers = factory();
    const passenger = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '31',
      finalDestinationFloorId: '45',
      arrivedAt: 0,
    });
    passenger.board(5);
    expect(() => passengers.transfer(passenger, { destinationFloorId: '45', arrivedAt: 40 })).toThrow(
      /has not alighted/,
    );
  });

  it('refuses a next leg for a journey that has arrived', () => {
    const passengers = factory();
    const passenger = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '31',
      arrivedAt: 0,
    });
    passenger.board(5);
    passenger.alight(30);
    expect(() => passengers.transfer(passenger, { destinationFloorId: '45', arrivedAt: 40 })).toThrow(
      /already reached its final destination/,
    );
  });
});

describe('PassengerFactory', () => {
  function factory(seed: number): PassengerFactory {
    return new PassengerFactory({
      streams: new StreamSet(seed),
      massConfig: MASS,
      topology: TOWER,
    });
  }

  it('draws every mass from the passengerMass stream', () => {
    const streams = new StreamSet(4242);
    const expected = streams.passengerMass.clone();
    const passengers = new PassengerFactory({ streams, massConfig: MASS, topology: TOWER });

    for (let i = 0; i < 10; i += 1) {
      const passenger = passengers.arrive({
        originFloorId: 'G',
        destinationFloorId: '12',
        arrivedAt: i,
      });
      expect(passenger.massKg).toBe(drawPassengerMass(expected, MASS));
    }
  });

  it('perturbs no other stream', () => {
    // The independence guarantee that makes common random numbers work: whatever the model
    // does with mass, the arrival trace is untouched.
    const streams = new StreamSet(2024);
    const passengers = new PassengerFactory({ streams, massConfig: MASS, topology: TOWER });
    for (let i = 0; i < 50; i += 1) {
      passengers.arrive({ originFloorId: 'G', destinationFloorId: '12', arrivedAt: i });
    }

    const fresh = new StreamSet(2024);
    for (const name of ['arrivals', 'origins', 'destinations', 'doorObstruction', 'policyNoise'] as const) {
      expect(streams[name].nextUint32()).toBe(fresh[name].nextUint32());
    }
  });

  it('allocates ids deterministically from its own counter, not a module global', () => {
    const first = factory(1);
    const second = factory(1);
    const ids = (passengers: PassengerFactory): string[] =>
      Array.from({ length: 3 }, (_, i) =>
        passengers.arrive({ originFloorId: 'G', destinationFloorId: '12', arrivedAt: i }).id,
      );

    expect(ids(first)).toEqual(['p1', 'p2', 'p3']);
    // A module-level counter would make the second factory's ids depend on the first's.
    expect(ids(second)).toEqual(['p1', 'p2', 'p3']);
  });

  it('gives each arrival its own journey id', () => {
    const passengers = factory(5);
    const a = passengers.arrive({ originFloorId: 'G', destinationFloorId: '12', arrivedAt: 0 });
    const b = passengers.arrive({ originFloorId: 'G', destinationFloorId: '12', arrivedAt: 0 });
    expect(a.journeyId).not.toBe(b.journeyId);
    expect(passengers.journeyCount).toBe(2);
  });

  it('resolves floor indices through the building and rejects unknown floors', () => {
    const passengers = factory(6);
    const passenger = passengers.arrive({
      originFloorId: 'G',
      destinationFloorId: '31',
      arrivedAt: 0,
    });
    expect(passenger.originFloorIndex).toBe(0);
    expect(passenger.destinationFloorIndex).toBe(31);

    expect(() =>
      passengers.arrive({ originFloorId: 'B2', destinationFloorId: '12', arrivedAt: 0 }),
    ).toThrow(/Unknown origin floor "B2"/);
    expect(() =>
      passengers.arrive({ originFloorId: 'G', destinationFloorId: '99', arrivedAt: 0 }),
    ).toThrow(/Unknown destination floor "99"/);
  });
});

/* -------------------------------------------------------------------------- *
 * The premise a comment in `sim/simulation.ts` depends on
 * -------------------------------------------------------------------------- */

/**
 * **`PassengerFactory.arrive` has no caller, and that fact is load-bearing elsewhere.**
 *
 * `sim/simulation.ts` hands the factory `config.trafficProfiles.passengerMass` — the *reference*
 * block — rather than the run's `demand.passengerMass` override, and the comment there says why:
 * nothing reaches `arrive`, so resolving the override would have been an untested behaviour
 * guarding a path that does not exist. That is only true while the premise holds.
 *
 * A comment cannot fail. This repository has just spent two commits repairing sentences that went
 * stale exactly this way — `crn.ts`'s *"mirrors `traceConfigFor` exactly"* and `patternSpec.ts`'s
 * *"`SimulationDemandOptions` has no batch-size field"* were both true when written. So the premise
 * is asserted rather than asserted-about: the moment somebody wires `arrive` into a shipped path,
 * this reds and points at the argument that then has to change.
 *
 * Comments and docstrings are blanked before scanning, because both surviving mentions of
 * `.arrive(` in the tree are inside docstrings — `PassengerFactory`'s own usage example here, and
 * a `bank.arrive(...)` line in `kernel/types.ts` illustrating `kernel.schedule`.
 */
describe('PassengerFactory.arrive', () => {
  it('has no caller in any shipped path, which is what lets simulation.ts use the reference block', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const packagesDir = fileURLToPath(new URL('../../..', import.meta.url));
    const blankComments = (text: string): string =>
      text
        // Preserve line numbers so the reported location is the real one.
        .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, '');

    const sources: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith('.ts') && !full.includes('.test.')) sources.push(full);
      }
    };
    walk(packagesDir);
    // Guard against a vacuous pass if the walk ever stops finding anything.
    expect(sources.length).toBeGreaterThan(100);

    const callers: string[] = [];
    for (const file of sources) {
      blankComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          if (/\.arrive\s*\(/.test(line)) {
            callers.push(`${file.slice(packagesDir.length)}:${index + 1}`);
          }
        });
    }

    expect(
      callers,
      'PassengerFactory.arrive gained a caller. sim/simulation.ts hands the factory the REFERENCE mass block on the premise that nothing reaches it; that argument must now become `config.demand?.passengerMass ?? config.trafficProfiles.passengerMass` and be tested on the legs (docs/14 § 2.1).',
    ).toEqual([]);
  });
});
