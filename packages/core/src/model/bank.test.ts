/// <reference types="node" />

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import type { LoadedConfig, ResolvedBank, ResolvedBuilding, ResolvedCar } from '../config/types.js';

import { Bank } from './bank.js';
import { ModelError } from './types.js';

/** The data that ships in this repository, not a fixture: banks are built from real config. */
const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(REAL_DATA_DIR);
});

function building(id: string): ResolvedBuilding {
  const resolved = config.buildingsById.get(id);
  if (resolved === undefined) throw new Error(`test fixture missing building "${id}"`);
  return resolved;
}

function bankConfig(buildingId: string, bankId: string): ResolvedBank {
  const resolved = building(buildingId).banks.find((bank) => bank.id === bankId);
  if (resolved === undefined) throw new Error(`test fixture missing bank "${bankId}"`);
  return resolved;
}

function bank(buildingId: string, bankId: string): Bank<ResolvedCar> {
  return Bank.fromConfig(bankConfig(buildingId, bankId));
}

describe('Bank.fromConfig', () => {
  it('carries the bank across from its resolved config', () => {
    const low = bank('secure-tower', 'low');
    const config_ = bankConfig('secure-tower', 'low');

    expect(low.id).toBe('low');
    expect(low.name).toBe('Low bank');
    expect(low.carCount).toBe(3);
    expect(low.cars.map((car) => car.id)).toEqual(['A', 'B', 'C']);
    expect([...low.servesFloors]).toEqual([...config_.servesFloors]);
    expect(low.carSpecs).toEqual(low.cars);
  });

  it('finds a car by id in O(1), and only its own', () => {
    const low = bank('secure-tower', 'low');
    expect(low.carById('B')?.id).toBe('B');
    expect(low.carSpecById('B')?.ratedSpeedMps).toBe(4);
    // D belongs to the high bank.
    expect(low.carById('D')).toBeUndefined();
  });

  it('resolves car hardware, so the bank knows what it is made of', () => {
    const shuttle = bank('mixed-use-high-rise', 'shuttle');
    const first = shuttle.carSpecs[0];
    expect(first?.ratedSpeedMps).toBe(8);
    expect(first?.ratedLoadLb).toBe(4000);
    // The 80% rule: design capacity is below rated capacity, never equal to it.
    expect(first?.designCapacityPersons).toBeLessThan(first?.capacityPersons ?? 0);
  });

  it('rejects a car list that does not correspond to its specs', () => {
    const config_ = bankConfig('secure-tower', 'low');
    expect(
      () =>
        new Bank({
          id: config_.id,
          servesFloors: config_.servesFloors,
          cars: [{ id: 'A' }],
          carSpecs: config_.cars,
        }),
    ).toThrow(ModelError);
  });
});

describe('service zoning lookup', () => {
  it('answers membership in O(1) for the floors the shafts open onto', () => {
    const low = bank('secure-tower', 'low');
    const high = bank('secure-tower', 'high');

    for (const floorId of ['G', '2', '9', '15']) {
      expect(low.servesFloor(floorId)).toBe(true);
    }
    // The low shaft simply does not go there. No credential or dispatcher setting changes it.
    for (const floorId of ['16', '23', '30']) {
      expect(low.servesFloor(floorId)).toBe(false);
      expect(high.servesFloor(floorId)).toBe(true);
    }
    expect(high.servesFloor('2')).toBe(false);
    expect(low.servesFloor('nonexistent')).toBe(false);
  });

  it('agrees with the declared list, including the shared lobby', () => {
    const low = bank('secure-tower', 'low');
    const high = bank('secure-tower', 'high');
    expect(low.servesFloors.every((floorId) => low.servesFloor(floorId))).toBe(true);
    // G is the only floor both banks reach — which is why it is a transfer floor.
    const shared = low.servesFloors.filter((floorId) => high.servesFloor(floorId));
    expect(shared).toEqual(['G']);
  });

  it('is a snapshot: mutating the input array cannot re-zone a bank', () => {
    const servesFloors = ['G', '2', '3'];
    const built = new Bank({ id: 'x', servesFloors, cars: [], carSpecs: [] });
    servesFloors.push('30');
    expect(built.servesFloor('30')).toBe(false);
    expect(built.servesFloors).toEqual(['G', '2', '3']);
  });
});

describe('double-deck pairing', () => {
  it('pairs Vertical City’s shuttle floors, lower deck first', () => {
    const shuttle = bank('vertical-city', 'shuttle');

    expect(shuttle.isDoubleDeck).toBe(true);
    expect(shuttle.servesFloorPairs).toEqual([
      { lowerFloorId: 'G', upperFloorId: '2' },
      { lowerFloorId: '26', upperFloorId: '27' },
      { lowerFloorId: '51', upperFloorId: '52' },
      { lowerFloorId: '76', upperFloorId: '77' },
    ]);
  });

  it('knows which deck opens on a floor and what the other deck reaches', () => {
    const shuttle = bank('vertical-city', 'shuttle');

    expect(shuttle.deckAt('G')).toBe('lower');
    expect(shuttle.deckAt('2')).toBe('upper');
    expect(shuttle.deckAt('26')).toBe('lower');
    expect(shuttle.deckAt('27')).toBe('upper');

    // `pairedFloorOf` and `servesFloorPair` were deleted in Phase 6 for having no non-test
    // caller; `deckAssignmentFor` carries the same two facts and does have one.
    expect(shuttle.deckAssignmentFor('26')?.pairedFloorId).toBe('27');
    expect(shuttle.deckAssignmentFor('27')?.pairedFloorId).toBe('26');

    const assignment = shuttle.deckAssignmentFor('51');
    expect(assignment?.deck).toBe('lower');
    expect(assignment?.pairedFloorId).toBe('52');
    expect(assignment?.pair).toEqual({ lowerFloorId: '51', upperFloorId: '52' });
  });

  it('is ordered: a pair is not its own reverse', () => {
    const shuttle = bank('vertical-city', 'shuttle');
    expect(shuttle.deckAt('26')).toBe('lower');
    expect(shuttle.deckAt('27')).toBe('upper');
    expect(shuttle.deckAssignmentFor('26')?.pair).toEqual({
      lowerFloorId: '26',
      upperFloorId: '27',
    });
    // Reversed, the same two floors are not a pair: the assignment for the *upper* floor names
    // itself as upper, so a caller asking "is [27, 26] a stop" reads `deck === 'upper'` and stops.
    expect(shuttle.deckAssignmentFor('27')?.deck).toBe('upper');
  });

  it('keeps servesFloors as the flattened union of the pairs', () => {
    const shuttle = bank('vertical-city', 'shuttle');
    for (const pair of shuttle.servesFloorPairs) {
      expect(shuttle.servesFloor(pair.lowerFloorId)).toBe(true);
      expect(shuttle.servesFloor(pair.upperFloorId)).toBe(true);
    }
    expect(shuttle.servesFloors).toHaveLength(shuttle.servesFloorPairs.length * 2);
  });

  it('leaves single-deck banks unpaired rather than inventing pairs', () => {
    const local = bank('vertical-city', 'zone-1-local');
    expect(local.isDoubleDeck).toBe(false);
    expect(local.servesFloorPairs).toEqual([]);
    expect(local.deckAt('G')).toBeUndefined();
    expect(local.deckAssignmentFor('G')).toBeUndefined();
    // It still serves the same ground-lobby levels the shuttle does — that is a shared stop,
    // not a deck pairing.
    expect(local.servesFloor('G')).toBe(true);
    expect(local.servesFloor('2')).toBe(true);
  });

  it('leaves every other building single-deck', () => {
    const doubleDeckBanks = config.buildings.flatMap((resolved) =>
      resolved.banks
        .map((configured) => Bank.fromConfig(configured))
        .filter((built) => built.isDoubleDeck)
        .map((built) => `${resolved.id}/${built.id}`),
    );
    expect(doubleDeckBanks).toEqual(['vertical-city/shuttle']);
  });
});
