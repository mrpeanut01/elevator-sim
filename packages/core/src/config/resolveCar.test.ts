/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseElevatorSpecs } from './parse.js';
import { findElevatorSpec, personsAtRatedLoad, resolveCar } from './resolveCar.js';
import { ConfigError, ISSUE_CODES } from './schema.js';
import type { CarConfig, ElevatorSpecs } from './types.js';

/** The real reference data: resolution must work against what ships, not a fixture. */
const SPECS_FILE = fileURLToPath(new URL('../../../../data/elevator-specs.json', import.meta.url));

let specs: ElevatorSpecs;

beforeAll(async () => {
  specs = parseElevatorSpecs(JSON.parse(await readFile(SPECS_FILE, 'utf8')), SPECS_FILE);
});

function expectConfigError(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected the call to throw a ConfigError');
}

describe('resolveCar', () => {
  it('inherits every class default when the car declares only a spec', () => {
    const resolved = resolveCar({ id: 'A', spec: 'gearless-traction' }, specs);
    const spec = findElevatorSpec(specs, 'gearless-traction');

    expect(spec).toBeDefined();
    expect(resolved.ratedSpeedMps).toBe(spec?.ratedSpeedMps.typical);
    expect(resolved.acceleration).toBe(spec?.acceleration.typical);
    expect(resolved.jerk).toBe(spec?.jerk.typical);
    // Conservative default: the low end of the class capacity range, never the high end.
    expect(resolved.ratedLoadLb).toBe(spec?.capacityLbRange[0]);
    expect(resolved.doorType).toBe('centerOpening');
    expect(resolved.doorOpenS).toBe(specs.doors.centerOpening.openS);
    expect(resolved.doorCloseS).toBe(specs.doors.centerOpening.closeS);
    expect(resolved.dwellCarCallS).toBe(specs.doors.dwellCarCallS.typical);
    expect(resolved.dwellHallCallS).toBe(specs.doors.dwellHallCallS.typical);
    expect(resolved.motorStartDelayS).toBe(specs.timing.motorStartDelayS);
    expect(resolved.levelingSettleS).toBe(specs.timing.levelingSettleS.typical);
  });

  it('lets explicit car fields override the class defaults', () => {
    const car: CarConfig = {
      id: 'A',
      spec: 'geared-traction',
      ratedSpeedMps: 1.9,
      ratedLoadLb: 3000,
      doorType: 'sideOpening',
      acceleration: 0.85,
      jerk: 1.1,
      doorOpenS: 2.2,
      doorCloseS: 3.4,
      dwellCarCallS: 2.5,
      dwellHallCallS: 6,
      motorStartDelayS: 0.35,
      levelingSettleS: 0.9,
    };

    const resolved = resolveCar(car, specs);

    expect(resolved).toMatchObject({
      id: 'A',
      spec: 'geared-traction',
      ratedSpeedMps: 1.9,
      ratedLoadLb: 3000,
      doorType: 'sideOpening',
      acceleration: 0.85,
      jerk: 1.1,
      doorOpenS: 2.2,
      doorCloseS: 3.4,
      dwellCarCallS: 2.5,
      dwellHallCallS: 6,
      motorStartDelayS: 0.35,
      levelingSettleS: 0.9,
    });
    // Nothing inherited leaks through when the car is fully specified.
    const spec = findElevatorSpec(specs, 'geared-traction');
    expect(resolved.ratedSpeedMps).not.toBe(spec?.ratedSpeedMps.typical);
  });

  it('resolves the two shipped car definitions the way the buildings intend', () => {
    const office = resolveCar(
      { id: 'A', spec: 'geared-traction', ratedSpeedMps: 2.5, ratedLoadLb: 2500, doorType: 'centerOpening' },
      specs,
    );
    const residential = resolveCar(
      { id: 'A', spec: 'hydraulic', ratedSpeedMps: 0.63, ratedLoadLb: 1600, doorType: 'sideOpening' },
      specs,
    );

    expect(office).toMatchObject({
      ratedSpeedMps: 2.5,
      acceleration: 1.0,
      jerk: 1.4,
      ratedLoadLb: 2500,
      ratedLoadKg: 1150,
      capacityPersons: 16,
      designCapacityPersons: 12,
      doorOpenS: 1.8,
      doorCloseS: 3.0,
    });
    expect(residential).toMatchObject({
      ratedSpeedMps: 0.63,
      acceleration: 0.6,
      jerk: 0.8,
      ratedLoadLb: 1600,
      ratedLoadKg: 730,
      capacityPersons: 10,
      designCapacityPersons: 8,
      doorOpenS: 2.5,
      doorCloseS: 4.0,
    });
  });

  describe('capacity', () => {
    it('matches the shipped capacity table for every standard car size', () => {
      const divisor = 150;
      for (const entry of specs.capacities) {
        expect(personsAtRatedLoad(entry.ratedLoadLb, divisor)).toBe(entry.personsUS);
      }
    });

    it('takes the nominal metric size from the capacity table rather than converting', () => {
      const resolved = resolveCar({ id: 'A', spec: 'gearless-traction', ratedLoadLb: 3000 }, specs);

      // 3000 lb converts to 1361 kg but the standard car is a 1350 kg car.
      expect(resolved.ratedLoadKg).toBe(1350);
    });

    it('converts exactly for a non-standard rated load', () => {
      const resolved = resolveCar({ id: 'A', spec: 'mrl-gearless-low', ratedLoadLb: 2000 }, specs);

      expect(specs.capacities.some((entry) => entry.ratedLoadLb === 2000)).toBe(false);
      expect(resolved.ratedLoadKg).toBe(Math.round(2000 * 0.45359237));
    });

    it('fills to the design load factor, not to 100% of rated capacity', () => {
      const resolved = resolveCar({ id: 'A', spec: 'gearless-traction', ratedLoadLb: 4000 }, specs);

      expect(specs.conventions.designLoadFactor).toBe(0.8);
      expect(resolved.capacityPersons).toBe(26);
      expect(resolved.designCapacityPersons).toBe(20);
      expect(resolved.designCapacityPersons).toBeLessThan(resolved.capacityPersons);
      expect(resolved.designLoadFactor).toBe(0.8);
    });

    it('reads the persons-per-load divisor from the conventions, not from a constant', () => {
      const patched: ElevatorSpecs = {
        ...specs,
        conventions: { ...specs.conventions, personsPerRatedLoadUS: 'ratedLoadLb / 75' },
      };

      const resolved = resolveCar({ id: 'A', spec: 'geared-traction', ratedLoadLb: 3000 }, patched);

      expect(resolved.capacityPersons).toBe(40);
    });
  });

  describe('diagnostics', () => {
    it('names the file, the path and the known classes for an unknown spec', () => {
      const error = expectConfigError(() =>
        resolveCar({ id: 'C', spec: 'geared-tration' }, specs, {
          file: '/data/buildings/midtown-office.json',
          path: 'banks[0].cars[2]',
        }),
      );

      expect(error.issues).toHaveLength(1);
      expect(error.issues[0]).toMatchObject({
        file: '/data/buildings/midtown-office.json',
        path: 'banks[0].cars[2].spec',
        code: ISSUE_CODES.unknownSpec,
      });
      expect(error.message).toContain('unknown elevator class "geared-tration"');
      expect(error.message).toContain('geared-traction');
      expect(error.message).toContain('hydraulic');
      expect(error.message).toContain('/data/buildings/midtown-office.json');
    });

    it('reports a door type with no timings in the specs file', () => {
      const patched = {
        ...specs,
        doors: { ...specs.doors, sideOpening: undefined },
      } as unknown as ElevatorSpecs;

      const error = expectConfigError(() =>
        resolveCar({ id: 'A', spec: 'hydraulic', doorType: 'sideOpening' }, patched),
      );

      expect(error.issues[0]?.code).toBe(ISSUE_CODES.unknownDoorType);
      expect(error.message).toContain('doors.sideOpening');
    });

    it('reports an unreadable persons-per-load convention', () => {
      const patched: ElevatorSpecs = {
        ...specs,
        conventions: { ...specs.conventions, personsPerRatedLoadUS: 'about fifteen people' },
      };

      const error = expectConfigError(() => resolveCar({ id: 'A', spec: 'hydraulic' }, patched));

      expect(error.issues[0]?.code).toBe(ISSUE_CODES.invalidConvention);
      expect(error.message).toContain('ratedLoadLb / 150');
    });
  });

  it('is pure: it mutates neither the car nor the specs', () => {
    const car: CarConfig = { id: 'A', spec: 'gearless-traction', ratedSpeedMps: 4 };
    const carSnapshot = structuredClone(car);
    const specsSnapshot = structuredClone(specs);

    const first = resolveCar(car, specs);
    const second = resolveCar(car, specs);

    expect(car).toEqual(carSnapshot);
    expect(specs).toEqual(specsSnapshot);
    expect(second).toEqual(first);
  });
});
