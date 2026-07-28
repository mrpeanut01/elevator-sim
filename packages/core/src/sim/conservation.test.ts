/**
 * The invariant the rest of this package is worthless without: **no passenger is ever lost.**
 *
 * A generated journey ends in exactly one of two states. Either it reached the floor it asked
 * for, or it is named — with its leg, its position and why — in
 * `SimulationResult.undelivered`. There is no third state, and there is no rounding.
 *
 * This is checked across every building the project ships, every dispatcher it ships, and many
 * seeds, because the failure it guards against is invisible to every other metric. A car that
 * silently drops the people it could not fit reports a *lower* average waiting time for it;
 * a hall call extinguished with a queue still on the landing reports a *higher* handling
 * capacity. The statistics improve as the bug worsens, which is exactly the "confident
 * nonsense" CLAUDE.md § Statistical discipline exists to prevent.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';

import { BUILDING_IDS, load, withCallType } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import { UNDELIVERED_REASONS, type SimulationConfig, type SimulationResult } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

const SEEDS = [1, 7, 20260726, 999_983, 4_294_967_291] as const;

function request(
  buildingId: string,
  profileId: string,
  seed: number,
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
    seed,
    // A saturated or access-blocked configuration is a legitimate thing to *measure*; it is
    // never a licence to lose anybody, which is the whole point of running it here.
    onTimeout: 'report',
    ...overrides,
  };
}

/**
 * Everything that must hold about a finished run, whatever happened during it.
 *
 * Re-derived from the record rather than trusting `result.conservation`, so a bug in the audit
 * itself cannot make the audit pass.
 */
function assertConserved(result: SimulationResult): void {
  const generated = result.trace.passengerCount;

  expect(result.conservation.generated).toBe(generated);
  expect(result.conservation.delivered + result.conservation.undelivered).toBe(generated);
  expect(result.conservation.undelivered).toBe(result.undelivered.length);
  expect(result.conservation.balanced).toBe(true);

  // Every leg that was materialized reached the metrics layer. A leg that exists in the model
  // but not in the record is invisible to every statistic while still looking delivered.
  expect(result.conservation.legsRecorded).toBe(result.conservation.legsCreated);
  expect(result.record.passengers).toHaveLength(result.conservation.legsCreated);
  expect(result.conservation.legsCreated).toBe(generated + result.conservation.transfers);

  // Recount independently: one delivered journey per trace record whose last leg alighted at
  // the declared final destination.
  const planned = new Map(result.trace.passengers.map((record) => [record.journeyId, record]));
  const legsByJourney = new Map<string, typeof result.record.passengers>();
  for (const leg of result.record.passengers) {
    const legs = legsByJourney.get(leg.journeyId) ?? [];
    legsByJourney.set(leg.journeyId, [...legs, leg]);
  }
  expect(legsByJourney.size).toBe(generated);

  let delivered = 0;
  for (const [journeyId, record] of planned) {
    const legs = [...(legsByJourney.get(journeyId) ?? [])].sort((a, b) => a.legIndex - b.legIndex);
    expect(legs.length).toBeGreaterThan(0);
    expect(legs.length).toBeLessThanOrEqual(record.legs.length);

    const last = legs[legs.length - 1];
    if (last === undefined) continue;
    if (last.alightedAt !== undefined && last.isFinalLeg) {
      // Delivered — and delivered to the floor the trace asked for, never another one.
      expect(last.destinationFloorId).toBe(record.finalDestinationFloorId);
      delivered += 1;
    }
  }
  expect(delivered).toBe(result.conservation.delivered);

  // The undelivered are named, and named consistently with the record.
  const legIds = new Set(result.record.passengers.map((leg) => leg.passengerId));
  for (const journey of result.undelivered) {
    expect(UNDELIVERED_REASONS).toContain(journey.reason);
    expect(legIds.has(journey.legId)).toBe(true);
    expect(planned.has(journey.journeyId)).toBe(true);
    expect(journey.destinationFloorId).not.toBe('');
    if (journey.reason === 'waiting') expect(journey.boardedAt).toBeUndefined();
    if (journey.reason === 'riding') expect(journey.boardedAt).toBeDefined();
  }

  // A completed run has nobody left over, by definition of the status.
  if (result.status === 'completed') {
    expect(result.undelivered).toEqual([]);
    expect(result.conservation.delivered).toBe(generated);
  }
}

/* -------------------------------------------------------------------------- *
 * Every building, many seeds
 * -------------------------------------------------------------------------- */

describe('generated === delivered + explicitly undelivered', () => {
  for (const buildingId of BUILDING_IDS) {
    // An explicit budget rather than vitest's 5 s default: `vertical-city` is 3 400 journeys a
    // replication and five of them is ~4 s on a quiet machine, which is inside the default only
    // until the runner is busy — and it always is, with 116 other files in flight. A conservation
    // failure must mean passengers went missing, never that the laptop was loaded.
    it(`holds on ${buildingId} across ${SEEDS.length} seeds`, () => {
      for (const seed of SEEDS) {
        const result = runSimulation(request(buildingId, 'eta', seed));
        expect(result.buildingId).toBe(buildingId);
        expect(result.conservation.generated).toBeGreaterThan(0);
        assertConserved(result);
      }
    }, 60_000);
  }

  it('holds on every shipped dispatcher, on a building with two banks', () => {
    for (const profile of config.dispatcherProfiles.profiles) {
      const result = runSimulation(request('secure-tower', profile.id, 20260726));
      assertConserved(result);
    }
  });

  it('holds when every landing can be collected, on every building with transfers', () => {
    // With authorization at call time the access-restricted landings are servable, so these
    // runs finish rather than timing out — a much stronger test, because "everybody delivered"
    // leaves nowhere for a lost passenger to hide.
    for (const buildingId of ['mixed-use-high-rise', 'secure-tower', 'vertical-city']) {
      const profile = config.dispatcherProfilesById.get('eta');
      expect(profile).toBeDefined();
      if (profile === undefined) return;

      for (const seed of [11, 20260726]) {
        const result = runSimulation(
          request(buildingId, 'eta', seed, {
            dispatcherProfile: withCallType(profile, 'mobile-credential'),
          }),
        );
        assertConserved(result);
        expect(result.status).toBe('completed');
        expect(result.conservation.delivered).toBe(result.conservation.generated);
        expect(result.conservation.transfers).toBeGreaterThan(0);
      }
    }
  });

  it('holds under demand well past the building’s handling capacity', () => {
    // Saturation is a legitimate measurement and a common one during a sweep. It must not be
    // a licence to lose anybody: the queue diverges, the AWT interval is suppressed, and every
    // single passenger is still accounted for.
    const result = runSimulation(
      request('midtown-office', 'collective', 20260726, {
        demand: { arrivalRatePctPop5min: 20 },
        drainGraceS: 600,
      }),
    );

    assertConserved(result);
    expect(result.status).toBe('timed-out');
    expect(result.undelivered.length).toBeGreaterThan(0);
    expect(result.summary.saturation.verdict).not.toBe('stable');
    expect(result.summary.awtIsValid).toBe(false);
  });

  it('holds with door obstructions, which lengthen every stop', () => {
    for (const seed of SEEDS) {
      const result = runSimulation(
        request('garden-apartments', 'nearest-car', seed, { doorObstructionProbability: 0.4 }),
      );
      assertConserved(result);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Nothing leaves a landing except into a car that can serve it
 * -------------------------------------------------------------------------- */

describe('the only way off a landing is into a car that can carry you', () => {
  it('never boards anybody onto a bank that cannot reach their destination', () => {
    for (const buildingId of BUILDING_IDS) {
      const building = config.buildingsById.get(buildingId);
      expect(building).toBeDefined();
      if (building === undefined) continue;

      const served = new Map(
        building.banks.map((bank) => [bank.id, new Set(bank.servesFloors)] as const),
      );
      const restricted = new Map<string, Set<string>>();
      for (const zone of building.accessZones) {
        for (const floorId of zone.floors) {
          const groups = restricted.get(floorId) ?? new Set<string>();
          for (const group of zone.credentialGroups) groups.add(group);
          restricted.set(floorId, groups);
        }
      }

      const result = runSimulation(request(buildingId, 'eta', 20260726));
      let boardings = 0;

      for (const leg of result.record.passengers) {
        if (leg.bankId === undefined) continue;
        boardings += 1;
        const floors = served.get(leg.bankId);
        expect(floors?.has(leg.originFloorId)).toBe(true);
        expect(floors?.has(leg.destinationFloorId)).toBe(true);

        // Access zoning is checked separately from service zoning, and never merged into it.
        const permitted = restricted.get(leg.destinationFloorId);
        if (permitted !== undefined) {
          expect(leg.credentialGroup).toBeDefined();
          expect(permitted.has(leg.credentialGroup ?? '')).toBe(true);
        }
      }
      expect(boardings).toBeGreaterThan(0);
    }
  });
});
