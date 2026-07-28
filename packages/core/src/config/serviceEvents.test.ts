/// <reference types="node" />

/**
 * The config half of service mode: `CarConfig.mode` and `BuildingConfig.serviceEvents`.
 *
 * Both exist to close one gap. `Car` has had a private `#mode`, a `setMode()` that releases the
 * work the new mode cannot do, `CarInit.mode`, four `SERVICE_MODES`, and an `estimateCost` whose
 * **first** check answers `'serviceMode'` — and no path from any authorable configuration to any
 * of it. `INELIGIBILITY_REASONS.serviceMode` was unreachable from `data/`, and two Phase 8
 * adversarial cases ("all cars out of service", "mid-run mode changes") could only be approximated
 * by proxying the dispatcher's *view* of the cars, which tests the dispatcher's reaction rather
 * than the car.
 *
 * So the assertions here are about the **path**, not about elevator behaviour: that the strict
 * schema `loadConfig` uses accepts the field, that a bad value is refused, that the schedule's car
 * references are resolved and located, and that a nonsense reference is a `ConfigError` with a path
 * rather than an event the runner silently skips. `sim/serviceMode.test.ts` takes it from there and
 * runs it.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { SERVICE_MODES } from '../model/types.js';

import { parseBuilding, parseElevatorSpecs, resolveBuilding } from './parse.js';
import { resolveCar } from './resolveCar.js';
import { ConfigError, ISSUE_CODES, carConfigSchema, serviceEventSchema } from './schema.js';
import type { ElevatorSpecs } from './types.js';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SPECS_FILE = join(REPO_ROOT, 'data', 'elevator-specs.json');

/** Two banks, two cars each, so an ambiguous car id is expressible. */
function twoBankTower(serviceEvents?: unknown): Record<string, unknown> {
  return {
    id: 'service-tower',
    name: 'Service Tower',
    type: 'office',
    trafficProfile: 'office',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: '2', index: 2, heightM: 4, population: 40 },
      { id: '3', index: 3, heightM: 8, population: 40 },
    ],
    banks: [
      {
        id: 'low',
        servesFloors: ['G', '2', '3'],
        cars: [
          { id: 'A', spec: 'geared-traction' },
          { id: 'B', spec: 'geared-traction' },
        ],
      },
      {
        id: 'high',
        servesFloors: ['G', '2', '3'],
        cars: [
          { id: 'A', spec: 'geared-traction' },
          { id: 'C', spec: 'geared-traction' },
        ],
      },
    ],
    ...(serviceEvents === undefined ? {} : { serviceEvents }),
  };
}

describe('CarConfig.mode is authorable, and is the only non-hardware field on a car', () => {
  it('accepts every declared service mode through the strict car schema', () => {
    for (const mode of SERVICE_MODES) {
      const parsed = carConfigSchema.safeParse({ id: 'A', spec: 'geared-traction', mode });
      expect(parsed.success, mode).toBe(true);
    }
  });

  it('refuses a mode that is not one of the four', () => {
    // The strict-object rule, applied to the value rather than the key: a misspelled mode that
    // parsed as `undefined` would run the car in service and quietly not test what it says.
    const parsed = carConfigSchema.safeParse({
      id: 'A',
      spec: 'geared-traction',
      mode: 'out-of-order',
    });
    expect(parsed.success).toBe(false);
  });

  it('is absent-means-in-service, resolved once on the ResolvedCar', async () => {
    const specs = parseElevatorSpecs(
      JSON.parse(await readFile(SPECS_FILE, 'utf8')),
      SPECS_FILE,
    ) as ElevatorSpecs;

    expect(resolveCar({ id: 'A', spec: 'geared-traction' }, specs).mode).toBe('in-service');
    expect(
      resolveCar({ id: 'A', spec: 'geared-traction', mode: 'fire-recall' }, specs).mode,
    ).toBe('fire-recall');
  });
});

describe('BuildingConfig.serviceEvents resolves against the banks, or refuses to', () => {
  let specs: ElevatorSpecs;

  beforeAll(async () => {
    specs = parseElevatorSpecs(JSON.parse(await readFile(SPECS_FILE, 'utf8')), SPECS_FILE);
  });

  const resolve = (serviceEvents?: unknown) =>
    resolveBuilding(parseBuilding(twoBankTower(serviceEvents), 'service-tower.json'), specs, {
      file: 'service-tower.json',
    });

  const expectError = (serviceEvents: unknown): ConfigError => {
    try {
      resolve(serviceEvents);
    } catch (error) {
      if (error instanceof ConfigError) return error;
      throw error;
    }
    throw new Error('expected resolveBuilding to throw a ConfigError');
  };

  it('leaves the schedule empty when the building authors none', () => {
    expect(resolve().serviceEvents).toEqual([]);
  });

  it('locates an unambiguous car id without being told its bank', () => {
    const resolved = resolve([{ atS: 600, carId: 'C', mode: 'out-of-service' }]);
    expect(resolved.serviceEvents).toEqual([
      { atS: 600, bankId: 'high', carId: 'C', mode: 'out-of-service' },
    ]);
  });

  it('takes the bank when one is given, and distinguishes two cars with the same id', () => {
    const resolved = resolve([
      { atS: 60, carId: 'A', bankId: 'low', mode: 'fire-recall' },
      { atS: 90, carId: 'A', bankId: 'high', mode: 'independent' },
    ]);
    expect(resolved.serviceEvents).toEqual([
      { atS: 60, bankId: 'low', carId: 'A', mode: 'fire-recall' },
      { atS: 90, bankId: 'high', carId: 'A', mode: 'independent' },
    ]);
  });

  it('preserves authored order rather than sorting, because the kernel is the ordering authority', () => {
    // Two entries at the same instant. The queue's total order is `(time, sequence)` and the
    // sequence follows the order the runner schedules them in, which is this order (CLAUDE.md
    // invariant 4). A sort here would be a second authority saying the same thing.
    const resolved = resolve([
      { atS: 300, carId: 'B', mode: 'out-of-service' },
      { atS: 100, carId: 'C', mode: 'out-of-service' },
      { atS: 300, carId: 'B', mode: 'in-service' },
    ]);
    expect(resolved.serviceEvents?.map((event) => [event.atS, event.carId, event.mode])).toEqual([
      [300, 'B', 'out-of-service'],
      [100, 'C', 'out-of-service'],
      [300, 'B', 'in-service'],
    ]);
  });

  it('refuses a car this building does not have, with a path and the known cars', () => {
    const error = expectError([{ atS: 10, carId: 'Z', mode: 'out-of-service' }]);
    expect(error.issues.map((issue) => issue.code)).toEqual([
      ISSUE_CODES.unknownServiceEventCar,
    ]);
    expect(error.issues[0]?.path).toBe('serviceEvents[0].carId');
    expect(error.issues[0]?.file).toBe('service-tower.json');
    expect(error.message).toContain('low/A, low/B, high/A, high/C');
  });

  it('refuses a car id that exists in two banks and says which two', () => {
    const error = expectError([{ atS: 10, carId: 'A', mode: 'out-of-service' }]);
    expect(error.issues.map((issue) => issue.code)).toEqual([
      ISSUE_CODES.unknownServiceEventCar,
    ]);
    expect(error.message).toContain('exists in 2 banks (low, high)');
  });

  it('refuses a bank that does not hold the named car, and says so', () => {
    const error = expectError([{ atS: 10, carId: 'C', bankId: 'low', mode: 'in-service' }]);
    expect(error.message).toContain('in bank "low", which that bank does not declare');
  });

  it('reports every bad entry at once, not just the first', () => {
    const error = expectError([
      { atS: 10, carId: 'Z', mode: 'out-of-service' },
      { atS: 20, carId: 'A', mode: 'out-of-service' },
    ]);
    expect(error.issues.map((issue) => issue.path)).toEqual([
      'serviceEvents[0].carId',
      'serviceEvents[1].carId',
    ]);
  });

  it('refuses a negative or non-finite time at the schema, before any car is looked up', () => {
    for (const atS of [-1, Number.POSITIVE_INFINITY, Number.NaN]) {
      const parsed = serviceEventSchema.safeParse({ atS, carId: 'A', mode: 'in-service' });
      expect(parsed.success, String(atS)).toBe(false);
    }
  });

  it('refuses an unknown key, so a misspelled field is never silently dropped', () => {
    expect(
      serviceEventSchema.safeParse({ at: 10, carId: 'A', mode: 'in-service' }).success,
    ).toBe(false);
    expect(
      serviceEventSchema.safeParse({ atS: 10, car: 'A', mode: 'in-service' }).success,
    ).toBe(false);
  });

  it('survives a JSON round trip unchanged, which is what makes a stored run replay it', () => {
    // The whole argument for authoring the schedule as building data rather than as a
    // `SimulationConfig` hook: the persisted run envelope records `buildingId` and the replay
    // re-reads the building from `data/`, so a schedule that survives JSON survives a replay.
    // A function could not.
    const authored = twoBankTower([
      { atS: 600, carId: 'B', mode: 'out-of-service' },
      { atS: 900, carId: 'B', mode: 'in-service' },
    ]);
    const roundTripped = JSON.parse(JSON.stringify(authored)) as unknown;
    expect(resolveBuilding(parseBuilding(roundTripped, 'x.json'), specs).serviceEvents).toEqual(
      resolveBuilding(parseBuilding(authored, 'x.json'), specs).serviceEvents,
    );
  });
});
