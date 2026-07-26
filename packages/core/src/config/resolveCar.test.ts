/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseBuilding, parseElevatorSpecs } from './parse.js';
import {
  findElevatorSpec,
  findPassengerTransferS,
  personsAtRatedLoad,
  resolveCar,
} from './resolveCar.js';
import { ConfigError, ISSUE_CODES } from './schema.js';
import type { BuildingConfig, BuildingType, CarConfig, ElevatorSpecs } from './types.js';

/** The real reference data: resolution must work against what ships, not a fixture. */
const SPECS_FILE = fileURLToPath(new URL('../../../../data/elevator-specs.json', import.meta.url));
const BUILDINGS_DIR = fileURLToPath(new URL('../../../../data/buildings/', import.meta.url));

/** Every building the project ships. */
const BUILDING_FILES = [
  'garden-apartments.json',
  'midtown-office.json',
  'mixed-use-high-rise.json',
  'secure-tower.json',
  'vertical-city.json',
] as const;

let specs: ElevatorSpecs;
let buildings: readonly BuildingConfig[];

beforeAll(async () => {
  specs = parseElevatorSpecs(JSON.parse(await readFile(SPECS_FILE, 'utf8')), SPECS_FILE);
  buildings = await Promise.all(
    BUILDING_FILES.map(async (name) => {
      const file = `${BUILDINGS_DIR}${name}`;
      return parseBuilding(JSON.parse(await readFile(file, 'utf8')), file);
    }),
  );
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

  /* ------------------------------------------------------------------ *
   * Passenger transfer time
   *
   * REGRESSION. `tp` is a property of the building, not of the hardware: office 1.2 s,
   * hotel 1.5 s, residential 1.75 s (`elevator-specs.json → timing.passengerTransferS`,
   * ISO 4190-6). It used to be derived nowhere at all — `resolveCar` never read the table
   * and `Simulation` never passed it — so every car in every building fell through to
   * `CAR_DEFAULTS.passengerTransferS`, which *is* the office figure. Garden Apartments ran a
   * round trip ~5.6 % short and a handling capacity ~4 % optimistic, and Midtown Office
   * looked perfect throughout, because 1.2 s was correct there by coincidence. `2·P·tp` is
   * the term the round trip is most sensitive to, so the error is not a rounding detail.
   * ------------------------------------------------------------------ */
  describe('passenger transfer time', () => {
    it('reads the shipped table by building type, and has no row for mixed-use', () => {
      // The values live in data, not in code (CLAUDE.md invariant 7).
      expect(findPassengerTransferS(specs, 'office')).toBe(1.2);
      expect(findPassengerTransferS(specs, 'residential')).toBe(1.75);
      expect(findPassengerTransferS(specs, 'hotel')).toBe(1.5);
      // Deliberate: a mixed tower's banks serve populations that transfer at different
      // speeds, so there is no honest building-wide answer. `undefined` means "nobody has
      // said", never "assume office".
      expect(findPassengerTransferS(specs, 'mixed-use')).toBeUndefined();
    });

    it('derives it from the building type the car is being resolved for', () => {
      const car: CarConfig = { id: 'A', spec: 'hydraulic' };
      const forType = (type: BuildingType): number | undefined =>
        resolveCar(car, specs, { buildingType: type, buildingId: `a-${type}-building` })
          .passengerTransferS;

      expect(forType('office')).toBe(1.2);
      expect(forType('residential')).toBe(1.75);
      expect(forType('hotel')).toBe(1.5);
    });

    it('resolves every shipped building to the transfer time its type calls for', () => {
      const resolvedByBuilding = new Map<string, readonly (number | undefined)[]>();
      const refused: string[] = [];

      for (const building of buildings) {
        const cars = building.banks.flatMap((bank) => bank.cars);
        expect(cars.length).toBeGreaterThan(0);
        try {
          resolvedByBuilding.set(
            building.id,
            cars.map(
              (car) =>
                resolveCar(car, specs, {
                  buildingType: building.type,
                  buildingId: building.id,
                }).passengerTransferS,
            ),
          );
        } catch (error) {
          if (!(error instanceof ConfigError)) throw error;
          refused.push(building.id);
        }
      }

      // Residential: 1.75 s, which is what garden-apartments' own `notes` field asks for.
      expect(resolvedByBuilding.get('garden-apartments')).toEqual([1.75, 1.75]);
      // Office: 1.2 s. The value the whole repository used to run at, here on purpose.
      expect(new Set(resolvedByBuilding.get('midtown-office'))).toEqual(new Set([1.2]));
      expect(new Set(resolvedByBuilding.get('secure-tower'))).toEqual(new Set([1.2]));

      // Mixed-use: **satisfied per car, not refused.** The two mixed towers now declare
      // `passengerTransferS` on every car, which is the only correct way to answer for a building
      // whose banks serve populations that load at different speeds. This assertion used to read
      // `expect(refused).toEqual([...both towers])` — that was true of the data as authored then,
      // and the refusal path is still exercised: see the next test, and
      // `parse.test.ts` § 'refuses a mixed-use building whose cars declare none'.
      expect(refused).toEqual([]);
      // Office locals at 1.2 s, residential banks and the shuttles at 1.75 s.
      expect(new Set(resolvedByBuilding.get('mixed-use-high-rise'))).toEqual(new Set([1.2, 1.75]));
      // Plus the hotel zone at 1.5 s — three populations in one shaft group.
      expect(new Set(resolvedByBuilding.get('vertical-city'))).toEqual(new Set([1.2, 1.5, 1.75]));

      // And nothing anywhere in `data/` is left undetermined.
      for (const [id, values] of resolvedByBuilding) {
        for (const value of values) expect(typeof value, id).toBe('number');
      }
    });

    it('still refuses a mixed-use car that declares nothing, rather than defaulting', () => {
      // The path the assertion above used to cover. Kept as its own test so that authoring a
      // value into `data/` cannot quietly retire the guarantee: a mixed-use car with no stated
      // transfer time is an error, and specifically not the 1.2 s office figure.
      const mixed = buildings.find((building) => building.type === 'mixed-use');
      expect(mixed).toBeDefined();
      const car = mixed?.banks[0]?.cars[0];
      expect(car?.passengerTransferS).toBeDefined();

      const { passengerTransferS: _stated, ...silent } = car as CarConfig;
      let thrown: unknown;
      try {
        resolveCar(silent, specs, { buildingType: 'mixed-use', buildingId: mixed?.id });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ConfigError);
      expect((thrown as ConfigError).issues[0]?.code).toBe(ISSUE_CODES.missingPassengerTransfer);
      expect((thrown as ConfigError).issues[0]?.message).toContain('Refusing to default');
    });

    it('lets a car override the type default', () => {
      const resolved = resolveCar(
        { id: 'A', spec: 'hydraulic', passengerTransferS: 2 },
        specs,
        { buildingType: 'residential', buildingId: 'garden-apartments' },
      );

      expect(resolved.passengerTransferS).toBe(2);
      expect(resolved.passengerTransferS).not.toBe(findPassengerTransferS(specs, 'residential'));
    });

    it('takes the car override even for a type the table has no row for', () => {
      // The stated remedy for mixed-use has to actually work, or the error above is a wall.
      const resolved = resolveCar(
        { id: 'R1', spec: 'geared-traction', passengerTransferS: 1.75 },
        specs,
        { buildingType: 'mixed-use', buildingId: 'vertical-city' },
      );

      expect(resolved.passengerTransferS).toBe(1.75);
    });

    it('refuses a building type with no transfer time rather than defaulting to office', () => {
      const error = expectConfigError(() =>
        resolveCar({ id: 'S1', spec: 'gearless-traction' }, specs, {
          file: '/data/buildings/vertical-city.json',
          path: 'banks[0].cars[0]',
          buildingType: 'mixed-use',
          buildingId: 'vertical-city',
        }),
      );

      expect(error.issues).toHaveLength(1);
      expect(error.issues[0]).toMatchObject({
        file: '/data/buildings/vertical-city.json',
        path: 'banks[0].cars[0].passengerTransferS',
        code: ISSUE_CODES.missingPassengerTransfer,
      });
      // The message has to name the building and the type, or it is unactionable.
      expect(error.message).toContain('vertical-city');
      expect(error.message).toContain('mixed-use');
      expect(error.message).toContain('passengerTransferS');
    });

    it('refuses an unrecognised building type the same way', () => {
      // A type that is not in `BUILDING_TYPES` at all — a hand-built config, or a type added
      // to the buildings schema and not to the reference table. Silence here is how the
      // original defect survived; the cast is the point of the test.
      const error = expectConfigError(() =>
        resolveCar({ id: 'A', spec: 'hydraulic' }, specs, {
          buildingType: 'aquarium' as BuildingType,
          buildingId: 'the-aquarium',
        }),
      );

      expect(error.issues[0]?.code).toBe(ISSUE_CODES.missingPassengerTransfer);
      expect(error.message).toContain('aquarium');
      expect(error.message).toContain('the-aquarium');
    });

    it('leaves it absent, never 1.2, when no building type is supplied', () => {
      // `resolveCar` is reachable without a building (a fixture, a bare class lookup). The
      // one thing it must not do there is invent the office value for a residential car.
      const resolved = resolveCar({ id: 'A', spec: 'hydraulic' }, specs);

      expect(resolved.passengerTransferS).toBeUndefined();
      expect(Object.hasOwn(resolved, 'passengerTransferS')).toBe(false);
    });

    it('still carries a car override with no building type in play', () => {
      const resolved = resolveCar({ id: 'A', spec: 'hydraulic', passengerTransferS: 1.6 }, specs);
      expect(resolved.passengerTransferS).toBe(1.6);
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
