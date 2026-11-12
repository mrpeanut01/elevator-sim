/**
 * **The sector boundary's loader path** — `ShaftConfig.sectorBoundaryFloorId`, `docs/11` § 3.2's
 * regime R1. `sim/twinShaftSector.test.ts` runs a hand-resolved building and is the test that the
 * regime is live; this one is the test that an **authored** document reaches it, and that a
 * boundary nobody can honour is refused where it is written rather than guessed about at run time.
 */

import { describe, expect, it } from 'vitest';

import { sectorHeightRangeM } from '../model/car/separation.js';
import { shaftsForBank } from '../model/car/types.js';
import { BUILDING_IDS, load } from '../sim/fixtures.test-helper.js';

import { parseBuilding, resolveBuilding } from './parse.js';
import { ConfigError, ISSUE_CODES } from './schema.js';
import type { BuildingConfig, LoadedConfig, ResolvedBuilding } from './types.js';

const BUILDING = 'midtown-office';

/** `midtown-office` re-authored with its first two cars in one hoistway. */
function authored(cfg: LoadedConfig, twin: Record<string, unknown>, single: Record<string, unknown> = {}): ResolvedBuilding {
  const shipped = cfg.buildingsById.get(BUILDING);
  if (shipped === undefined) throw new Error(`no shipped building "${BUILDING}"`);
  const document = structuredClone(shipped.config) as BuildingConfig;
  const bank = document.banks[0];
  if (bank === undefined) throw new Error('no bank');
  const [lower, upper, ...rest] = bank.cars.map((car) => car.id);
  const shafts = [
    { id: 'twin', carIds: [lower, upper], standingClearanceM: 3.5, emergencyDecelerationMps2: 4, ...twin },
    ...rest.map((carId, index) => ({ id: `solo-${carId}`, carIds: [carId], ...(index === 0 ? single : {}) })),
  ];
  const file = `${BUILDING}.json`;
  return resolveBuilding(
    parseBuilding({ ...document, banks: document.banks.map((b, i) => (i === 0 ? { ...b, shafts } : b)) }, file),
    cfg.elevatorSpecs,
    { file },
  );
}

function issuesOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigError) {
      return error.issues.map((issue) => issue.code).filter((code): code is string => code !== undefined);
    }
    throw error;
  }
  return [];
}

describe('a sector boundary is data, and reaches the shaft a car is built in', () => {
  it('resolves onto the shaft and onto the model, and is absent when not declared', async () => {
    const cfg = await load();
    const sectored = authored(cfg, { sectorBoundaryFloorId: '10' });
    const bank = sectored.banks[0]!;
    expect(bank.shafts[0]?.sectorBoundaryFloorId).toBe('10');
    expect(shaftsForBank(sectored, bank.id)[0]?.sectorBoundaryFloorId).toBe('10');

    const free = authored(cfg, {});
    expect(free.banks[0]?.shafts[0]).not.toHaveProperty('sectorBoundaryFloorId');
    expect(shaftsForBank(free, free.banks[0]!.id)[0]).not.toHaveProperty('sectorBoundaryFloorId');
  }, 120_000);

  it('is declared by no shipped building', async () => {
    const cfg = await load();
    for (const id of BUILDING_IDS) {
      const building = cfg.buildingsById.get(id) as ResolvedBuilding;
      for (const bank of building.banks) {
        for (const shaft of bank.shafts) expect(shaft).not.toHaveProperty('sectorBoundaryFloorId');
      }
    }
  }, 120_000);

  it('refuses a boundary nobody can honour, by located issue', async () => {
    const cfg = await load();
    // On a hoistway with one car in it.
    expect(issuesOf(() => authored(cfg, {}, { sectorBoundaryFloorId: '10' }))).toEqual([
      ISSUE_CODES.twinSectorInvalid,
    ]);
    // On a floor the bank does not serve.
    expect(issuesOf(() => authored(cfg, { sectorBoundaryFloorId: 'no-such-floor' }))).toEqual([
      ISSUE_CODES.twinSectorInvalid,
    ]);
    // At the top landing: nothing lies a required gap above it, so the upper car has no sector.
    expect(issuesOf(() => authored(cfg, { sectorBoundaryFloorId: '20' }))).toEqual([
      ISSUE_CODES.twinSectorInvalid,
    ]);
    // One below the top is the highest boundary that leaves the upper car a floor.
    expect(issuesOf(() => authored(cfg, { sectorBoundaryFloorId: '19' }))).toEqual([]);
  }, 120_000);
});

describe('the two sectors are disjoint by at least the required gap', () => {
  const separation = { standingClearanceM: 4, bufferM: 2, emergencyDecelerationMps2: 3 };
  const span = { lowestHeightM: 0, highestHeightM: 80 };

  it('ends the lower sector at the boundary and starts the upper one a full gap above it', () => {
    const lower = sectorHeightRangeM('lower', 40, separation, span);
    const upper = sectorHeightRangeM('upper', 40, separation, span);
    expect(lower).toEqual([0, 40]);
    expect(upper).toEqual([46, 80]);
    // Any stop in one against any stop in the other holds the clearance, which is the whole of
    // R1's argument: no pair of commitments the two cars can hold conflicts.
    expect(upper[0] - lower[1]).toBeGreaterThanOrEqual(separation.standingClearanceM + separation.bufferM);
  });
});
