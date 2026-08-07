/**
 * **Access zoning, asserted on the legs a run actually flew.**
 *
 * [§ D254](../../../../DECISIONS.md) moved the credential question off the hall call's *pickup*
 * floor and onto the destination, which is where a lift asks it. That change has two halves, and a
 * careless version of it gets the first right and the second catastrophically wrong:
 *
 * 1. **Everybody is collected.** A conventional landing call carries no credential by
 *    construction, so applying access zoning to the pickup made every access-zoned building
 *    unserviceable by every one of the eleven `up-down-buttons` dispatchers.
 * 2. **Nobody unauthorised travels.** Opening the pickup must not open the journey. Deleting one
 *    access check while believing the other still covers the case would be worse than the defect
 *    it replaces: the defect stranded people visibly and loudly, whereas a hole here is a run that
 *    looks perfect and quietly walks an unbadged visitor onto floor 45.
 *
 * `estimateCost.test.ts` asserts both on a hand-built shaft, which is where the reasons live. This
 * file asserts them **end to end on every shipped building that declares `accessZones`**, over the
 * legs of real runs, because the second half is not a property of `estimateCost` at all — the
 * runner owns it, in `#bankCanCarry` at the landing and `#carCanCarry` at the doorway — and a test
 * that only asked `estimateCost` would have agreed with a simulator that had no enforcement left.
 *
 * The census is deliberately large and deliberately over the *record* rather than over a summary:
 * a statistic cannot tell you which floor somebody got out at.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { CredentialGroup } from '../model/types.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationResult } from './types.js';

import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';

/** Every shipped building that declares a non-empty `accessZones`. */
const ZONED_BUILDING_IDS = [
  'mixed-use-high-rise',
  'secure-tower',
  'vertical-city',
  'st-jude-hospital',
  'crown-hotel',
] as const;

/** Conventional profiles — the ones whose landing calls carry no credential at all. */
const CONVENTIONAL = ['collective', 'nearest-car', 'eta'] as const;

const SEEDS = [424242, 11] as const;

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
}, 60_000);

/** Floor id to the union of credential groups permitted there, or absent when unrestricted. */
function permittedByFloor(
  building: ResolvedBuilding,
): ReadonlyMap<string, ReadonlySet<CredentialGroup>> {
  const byFloor = new Map<string, Set<CredentialGroup>>();
  for (const zone of building.accessZones ?? []) {
    for (const floorId of zone.floors) {
      const groups = byFloor.get(floorId) ?? new Set<CredentialGroup>();
      for (const group of zone.credentialGroups) groups.add(group);
      byFloor.set(floorId, groups);
    }
  }
  return byFloor;
}

function run(building: ResolvedBuilding, profileId: string, seed: number): SimulationResult {
  const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
  if (dispatcherProfile === undefined) throw new Error(`no profile "${profileId}"`);
  return runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    onTimeout: 'report',
  });
}

describe('a credential governs where you may go, and only that', () => {
  it('delivers every leg of every access-zoned building on bare up/down buttons', () => {
    const stranded: string[] = [];
    for (const buildingId of ZONED_BUILDING_IDS) {
      const building = config.buildingsById.get(buildingId);
      expect(building, buildingId).toBeDefined();
      if (building === undefined) continue;
      // The building really is zoned — otherwise this suite would pass by describing nothing.
      expect(permittedByFloor(building).size, `${buildingId} declares no restricted floor`)
        .toBeGreaterThan(0);

      for (const profileId of CONVENTIONAL) {
        for (const seed of SEEDS) {
          const result = run(building, profileId, seed);
          const where = `${buildingId}|${profileId}|${seed}`;
          if (result.undelivered.length > 0) {
            stranded.push(
              `${where}: ${String(result.undelivered.length)} undelivered, ` +
                `${String(result.conservation.delivered)}/${String(result.conservation.generated)} delivered`,
            );
          }
          expect(result.conservation.balanced, where).toBe(true);
        }
      }
    }
    // Asserted as one list rather than per cell so a partial regression names every cell it broke.
    expect(stranded.join('\n'), stranded.join('\n')).toBe('');
  }, 300_000);

  it('never carries anybody to a floor their credential may not reach', () => {
    let legsExamined = 0;
    let deliveriesToRestrictedFloors = 0;
    const unauthorised: string[] = [];

    for (const buildingId of ZONED_BUILDING_IDS) {
      const building = config.buildingsById.get(buildingId);
      if (building === undefined) continue;
      const permitted = permittedByFloor(building);

      for (const profileId of CONVENTIONAL) {
        for (const seed of SEEDS) {
          const result = run(building, profileId, seed);
          for (const record of result.record.passengers) {
            // A leg the passenger actually rode to its end.
            if (record.alightedAt === undefined) continue;
            legsExamined += 1;
            const allowed = permitted.get(record.destinationFloorId);
            if (allowed === undefined) continue; // unrestricted floor, no question asked
            deliveriesToRestrictedFloors += 1;
            if (record.credentialGroup === undefined || !allowed.has(record.credentialGroup)) {
              unauthorised.push(
                `${buildingId}|${profileId}|${seed}: ${record.passengerId} alighted at ` +
                  `${record.destinationFloorId} carrying ${record.credentialGroup ?? '(no credential)'}`,
              );
            }
          }
        }
      }
    }

    // The census has to be big enough to mean something, and it has to contain the case: a run in
    // which nobody ever alights on a restricted floor would satisfy the assertion below vacuously.
    expect(legsExamined).toBeGreaterThan(20_000);
    expect(deliveriesToRestrictedFloors).toBeGreaterThan(5_000);
    expect(unauthorised.join('\n'), unauthorised.join('\n')).toBe('');
  }, 300_000);
});
