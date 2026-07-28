import { describe, expect, it } from 'vitest';

import { resolveCar } from '../../config/resolveCar.js';
import type { ElevatorSpecs, LoadSensorConfig, ResolvedCar } from '../../config/types.js';
import { ModelError } from '../types.js';

import {
  LOAD_SENSOR_DEFAULTS,
  LOAD_SENSOR_PARAMETERS,
  LoadSensor,
  loadFactorOf,
  resolveLoadSensor,
  totalMassKg,
  type WeighedOccupant,
} from './loadSensor.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 *
 * The reference values from docs/02-elevator-reference.md, mirrored in
 * data/elevator-specs.json. Stated here rather than read off disk so the sensor tests need
 * no filesystem; `resolveCar` is used rather than a hand-built ResolvedCar so the seam
 * between config resolution and the load sensor is exercised too.
 *
 * A 3,000 lb car is 1,350 kg and 20 persons — the "Office / high-rise" standard size.
 * -------------------------------------------------------------------------- */

const REFERENCE_SPECS: ElevatorSpecs = {
  version: 1,
  units: { mass: 'kg' },
  conventions: {
    personsPerRatedLoadUS: 'ratedLoadLb / 150',
    personsPerRatedLoadEN81: 'ratedLoadKg / 75',
    designLoadFactor: 0.8,
  },
  classes: [
    {
      id: 'gearless-traction',
      name: 'Gearless traction',
      ratedSpeedMps: { min: 2.5, max: 7.0, typical: 4.0 },
      maxRiseM: 600,
      maxFloors: 60,
      acceleration: { typical: 1.0, max: 1.2 },
      jerk: { typical: 1.4, max: 1.6 },
      capacityLbRange: [3000, 4000],
      application: 'High-rise local',
    },
  ],
  codeMinimumSpeedByRise: [],
  capacities: [
    { ratedLoadLb: 2500, ratedLoadKg: 1150, personsUS: 16, use: 'Office standard' },
    { ratedLoadLb: 3000, ratedLoadKg: 1350, personsUS: 20, use: 'Office / high-rise' },
  ],
  doors: {
    centerOpening: { openS: 1.8, closeS: 3.0 },
    sideOpening: { openS: 2.5, closeS: 4.0 },
    dwellCarCallS: { min: 2, max: 4, typical: 3 },
    dwellHallCallS: { min: 4, max: 7, typical: 5 },
  },
  timing: {
    motorStartDelayS: 0.5,
    levelingSettleS: { min: 0.5, max: 1.0, typical: 0.7 },
    passengerTransferS: { office: 1.2, residential: 1.75, hotel: 1.5 },
  },
  loadSensor: { hallCallBypassThreshold: 0.8, overloadAlarmThreshold: 1.1 },
  realWorldAnchors: [],
};

/** 3,000 lb / 1,350 kg / 20 persons. */
const CAR: ResolvedCar = resolveCar({ id: 'A', spec: 'gearless-traction', ratedLoadLb: 3000 }, REFERENCE_SPECS);

const SPEC_THRESHOLDS: LoadSensorConfig = REFERENCE_SPECS.loadSensor;

function sensor(overrides?: Parameters<typeof resolveLoadSensor>[3]): LoadSensor {
  return new LoadSensor(resolveLoadSensor(CAR, SPEC_THRESHOLDS, undefined, overrides));
}

/** A person of a given mass. Real passengers satisfy this by having `id` and `massKg`. */
function person(id: string, massKg: number): WeighedOccupant {
  return { id, massKg };
}

/* -------------------------------------------------------------------------- *
 * Resolution
 * -------------------------------------------------------------------------- */

describe('resolveLoadSensor', () => {
  it('takes the thresholds from data/elevator-specs.json', () => {
    const config = resolveLoadSensor(CAR, SPEC_THRESHOLDS);

    expect(config.ratedLoadKg).toBe(1350);
    expect(config.capacityPersons).toBe(20);
    expect(config.bypassLoadThreshold).toBe(0.8);
    expect(config.overloadThreshold).toBe(1.1);
    expect(config.designLoadFactor).toBe(0.8);
  });

  it('falls back to the documented defaults when the specs file supplies none', () => {
    const config = resolveLoadSensor(CAR);

    expect(config.bypassLoadThreshold).toBe(LOAD_SENSOR_DEFAULTS.bypassLoadThreshold);
    expect(config.overloadThreshold).toBe(LOAD_SENSOR_DEFAULTS.overloadThreshold);
    expect(config.nominalPassengerMassKg).toBe(LOAD_SENSOR_DEFAULTS.nominalPassengerMassKg);
  });

  it('lets a dispatcher profile retune both thresholds, and an override beat the profile', () => {
    const fromProfile = resolveLoadSensor(CAR, SPEC_THRESHOLDS, {
      bypassLoadThreshold: 0.7,
      overloadThreshold: 1.05,
    });
    expect(fromProfile.bypassLoadThreshold).toBe(0.7);
    expect(fromProfile.overloadThreshold).toBe(1.05);

    const overridden = resolveLoadSensor(
      CAR,
      SPEC_THRESHOLDS,
      { bypassLoadThreshold: 0.7 },
      { bypassLoadThreshold: 0.9 },
    );
    expect(overridden.bypassLoadThreshold).toBe(0.9);
  });

  it('rejects an overload threshold below the bypass threshold', () => {
    expect(() =>
      resolveLoadSensor(CAR, SPEC_THRESHOLDS, { bypassLoadThreshold: 0.9, overloadThreshold: 0.85 }),
    ).toThrow(ModelError);
  });

  it('rejects a bypass threshold above rated load, and a non-positive rated load', () => {
    expect(() => resolveLoadSensor(CAR, SPEC_THRESHOLDS, { bypassLoadThreshold: 1.4 })).toThrow(
      /fraction of rated load/,
    );
    expect(() => resolveLoadSensor({ ...CAR, ratedLoadKg: 0 })).toThrow(/positive ratedLoadKg/);
  });

  it('keeps design load and the bypass threshold as two separate knobs', () => {
    // Both default to 0.8 and they are not the same thing: design load is the traffic-analysis
    // fill assumption, bypass is a control decision. Moving one must not move the other.
    const config = resolveLoadSensor(CAR, SPEC_THRESHOLDS, { bypassLoadThreshold: 0.65 });

    expect(config.bypassLoadThreshold).toBe(0.65);
    expect(config.designLoadFactor).toBe(0.8);
  });
});

/* -------------------------------------------------------------------------- *
 * It sums masses, it does not count people
 * -------------------------------------------------------------------------- */

describe('LoadSensor mass', () => {
  it('sums actual passenger masses rather than counting heads', () => {
    const cell = sensor();
    cell.add(person('p1', 62.5));
    cell.add(person('p2', 104.25));
    cell.add(person('p3', 78));

    expect(cell.occupants).toBe(3);
    expect(cell.massKg).toBeCloseTo(244.75, 10);
    // A head count times a nominal 75 kg would read 225 kg. It does not.
    expect(cell.massKg).not.toBeCloseTo(3 * 75, 6);
  });

  it('reads different loads for the same head count', () => {
    const light = sensor();
    const heavy = sensor();
    for (let i = 0; i < 12; i += 1) {
      light.add(person(`l${i}`, 55));
      heavy.add(person(`h${i}`, 105));
    }

    expect(light.occupants).toBe(heavy.occupants);
    expect(light.massKg).toBe(660);
    expect(heavy.massKg).toBe(1260);
    expect(light.isBypassingHallCalls).toBe(false);
    expect(heavy.isBypassingHallCalls).toBe(true);
  });

  it('reports loadFactor as massKg / ratedLoadKg', () => {
    const cell = sensor();
    cell.add(person('p1', 675));

    expect(cell.loadFactor).toBeCloseTo(0.5, 12);
    expect(cell.loadFactor).toBe(loadFactorOf(cell.massKg, 1350));
  });

  it('returns to exactly zero when everyone leaves, however many boarded first', () => {
    const cell = sensor();
    const people = Array.from({ length: 20 }, (_, i) => person(`p${i}`, 60 + i * 3.7));
    for (const p of people) cell.add(p);
    // Alight in a different order from boarding: the reading must not depend on history.
    for (const p of [...people].reverse()) cell.remove(p);

    expect(cell.massKg).toBe(0);
    expect(cell.occupants).toBe(0);
    expect(cell.loadFactor).toBe(0);
  });

  it('rejects a double board and an alight by someone who never boarded', () => {
    const cell = sensor();
    cell.add(person('p1', 80));

    expect(() => cell.add(person('p1', 80))).toThrow(ModelError);
    expect(() => cell.remove('p2')).toThrow(ModelError);
    expect(() => cell.add(person('p3', 0))).toThrow(/positive finite massKg/);
  });

  it('exposes who is aboard, in boarding order', () => {
    const cell = sensor();
    cell.add(person('a', 70));
    cell.add(person('b', 90));
    cell.remove('a');
    cell.add(person('c', 80));

    expect(cell.aboard().map((o) => o.id)).toEqual(['b', 'c']);
    expect(cell.massOf('b')).toBe(90);
    expect(cell.has('a')).toBe(false);
  });

  it('totalMassKg sums a group in the order given', () => {
    expect(totalMassKg([person('a', 70), person('b', 90.5)])).toBe(160.5);
    expect(totalMassKg([])).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * The two production thresholds
 * -------------------------------------------------------------------------- */

describe('hall-call bypass at 80% of rated load', () => {
  it('is off below the threshold and on at or above it', () => {
    const cell = sensor();
    const bypassAtKg = 1350 * 0.8; // 1080 kg

    cell.add(person('bulk', bypassAtKg - 1));
    expect(cell.loadFactor).toBeLessThan(0.8);
    expect(cell.isBypassingHallCalls).toBe(false);

    cell.add(person('one-more', 1));
    expect(cell.massKg).toBe(bypassAtKg);
    expect(cell.loadFactor).toBe(0.8);
    // At, not above: a car sitting exactly on the operator's declared threshold is full
    // enough, and `>` would make the behaviour depend on floating-point luck.
    expect(cell.isBypassingHallCalls).toBe(true);
  });

  it('does not imply overload — the car still starts and still serves its car calls', () => {
    const cell = sensor();
    cell.add(person('bulk', 1350 * 0.9));

    expect(cell.isBypassingHallCalls).toBe(true);
    expect(cell.isOverloaded).toBe(false);
    expect(cell.canStart).toBe(true);
  });

  it('clears again when enough mass steps out', () => {
    const cell = sensor();
    cell.add(person('a', 700));
    cell.add(person('b', 400));
    expect(cell.isBypassingHallCalls).toBe(true);

    cell.remove('b');
    expect(cell.isBypassingHallCalls).toBe(false);
  });

  it('moves with the tunable, not with a constant in the code', () => {
    const retuned = sensor({ bypassLoadThreshold: 0.6 });
    retuned.add(person('bulk', 1350 * 0.65));

    expect(retuned.isBypassingHallCalls).toBe(true);
    expect(sensor().bypassLoadThreshold).toBe(0.8);
  });
});

describe('overload alarm at 110% of rated load', () => {
  it('trips at or above the threshold and blocks starting', () => {
    const cell = sensor();
    const overloadAtKg = 1350 * 1.1; // 1485 kg

    cell.add(person('bulk', overloadAtKg - 0.5));
    expect(cell.isOverloaded).toBe(false);
    expect(cell.canStart).toBe(true);

    cell.add(person('last', 0.5));
    expect(cell.massKg).toBe(overloadAtKg);
    expect(cell.loadFactor).toBeCloseTo(1.1, 12);
    expect(cell.isOverloaded).toBe(true);
    expect(cell.canStart).toBe(false);
  });

  it('implies bypass, since the overload threshold is never below it', () => {
    const cell = sensor();
    cell.add(person('bulk', 1350 * 1.2));

    expect(cell.isOverloaded).toBe(true);
    expect(cell.isBypassingHallCalls).toBe(true);
  });

  it('clears when enough mass steps out', () => {
    const cell = sensor();
    cell.add(person('a', 1400));
    cell.add(person('b', 200));
    expect(cell.canStart).toBe(false);

    cell.remove('b');
    expect(cell.canStart).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Design load — 80% of RATED capacity, not 100%
 * -------------------------------------------------------------------------- */

describe('design load', () => {
  it('is 80% of rated capacity, in kilograms and in persons', () => {
    const cell = sensor();

    expect(cell.designLoadKg).toBeCloseTo(1080, 10);
    expect(cell.designCapacityPersons).toBe(16); // floor(20 * 0.8)
    expect(cell.designCapacityPersons).toBe(CAR.designCapacityPersons);
  });

  it('reports how much more can be taken on before design load, never negative', () => {
    const cell = sensor();
    cell.add(person('a', 800));
    expect(cell.remainingToDesignLoadKg).toBeCloseTo(280, 10);

    cell.add(person('b', 500));
    expect(cell.remainingToDesignLoadKg).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Snapshot and reset
 * -------------------------------------------------------------------------- */

describe('LoadSensor snapshot and reset', () => {
  it('snapshots the reading and both verdicts', () => {
    const cell = sensor();
    cell.add(person('a', 1100));
    const reading = cell.snapshot();

    expect(reading).toEqual({
      massKg: 1100,
      ratedLoadKg: 1350,
      loadFactor: 1100 / 1350,
      occupants: 1,
      bypassLoadThreshold: 0.8,
      overloadThreshold: 1.1,
      designLoadFactor: 0.8,
      isBypassingHallCalls: true,
      isOverloaded: false,
    });
    expect(Object.isFrozen(reading)).toBe(true);
  });

  it('empties completely on reset, so a replication starts from an empty car', () => {
    const cell = sensor();
    cell.add(person('a', 900));
    cell.reset();

    expect(cell.massKg).toBe(0);
    expect(cell.occupants).toBe(0);
    expect(cell.aboard()).toEqual([]);
    expect(cell.isBypassingHallCalls).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * Tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

describe('LOAD_SENSOR_PARAMETERS', () => {
  it('declares every tunable the resolver reads, with a type, a range and a default', () => {
    const ids = LOAD_SENSOR_PARAMETERS.map((parameter) => parameter.id);

    expect(ids).toContain('answer.bypassLoadThreshold');
    expect(ids).toContain('answer.overloadThreshold');
    expect(ids).toContain('car.designLoadFactor');
    expect(ids).toContain('car.nominalPassengerMassKg');
    expect(new Set(ids).size).toBe(ids.length);

    for (const parameter of LOAD_SENSOR_PARAMETERS) {
      expect(parameter.type).toBe('continuous');
      expect(parameter.range).toBeDefined();
      const [min, max] = parameter.range ?? [0, 0];
      expect(min).toBeLessThan(max);
      expect(parameter.default).toBeGreaterThanOrEqual(min);
      expect(parameter.default).toBeLessThanOrEqual(max);
      expect(parameter.description.length).toBeGreaterThan(20);
    }
  });

  it('quotes the runtime defaults rather than repeating the numbers', () => {
    const byId = new Map(LOAD_SENSOR_PARAMETERS.map((parameter) => [parameter.id, parameter]));

    expect(byId.get('answer.bypassLoadThreshold')?.default).toBe(
      LOAD_SENSOR_DEFAULTS.bypassLoadThreshold,
    );
    expect(byId.get('answer.overloadThreshold')?.default).toBe(
      LOAD_SENSOR_DEFAULTS.overloadThreshold,
    );
    // And the runtime defaults are the reference values from the specs file on disk.
    expect(LOAD_SENSOR_DEFAULTS.bypassLoadThreshold).toBe(
      REFERENCE_SPECS.loadSensor.hallCallBypassThreshold,
    );
    expect(LOAD_SENSOR_DEFAULTS.overloadThreshold).toBe(
      REFERENCE_SPECS.loadSensor.overloadAlarmThreshold,
    );
  });

  it('gives the overload threshold a range that can actually be crossed', () => {
    // The shape of finding #21, as an assertion on the schema rather than on a run.
    //
    // Boarding stops at the design load (`Simulation.#boardFrom`, CLAUDE.md § modelling rules:
    // cars fill to 80 % of rated, not 100 %), so the overload predicate can only reject a
    // candidate heavier than `(overloadThreshold - designLoadFactor) x rated`. Declared over
    // [1, 1.5] — as it was — that is at least `0.2 x rated`: 146 kg on the lightest shipped car
    // against a N(75, 15) mass distribution, i.e. 4.7 sigma, i.e. never. The whole declared
    // range was one bit-identical run on all five shipped buildings, and Phase 7 would have
    // spent 50-200 replications an evaluation resolving it.
    //
    // A range whose floor sits above the boarding cap is a dimension with no reachable effect,
    // whatever its default is. `sim/searchSpaceLiveness.test.ts` asserts the behavioural half.
    const overload = LOAD_SENSOR_PARAMETERS.find(
      (parameter) => parameter.id === 'answer.overloadThreshold',
    );
    const [min] = overload?.range ?? [Number.POSITIVE_INFINITY, 0];
    expect(
      min,
      'answer.overloadThreshold cannot bind above the design load factor, because boarding ' +
        'already stops there. A range starting above it is a flat search dimension',
    ).toBeLessThanOrEqual(LOAD_SENSOR_DEFAULTS.designLoadFactor);
    // The default stays EN 81's 110 %: widening the searchable interval must not move any
    // shipped run, and the physical device really does trip above rated load.
    expect(overload?.default).toBe(LOAD_SENSOR_DEFAULTS.overloadThreshold);
    expect(LOAD_SENSOR_DEFAULTS.overloadThreshold).toBeGreaterThan(1);
  });

  it('rejects a candidate that would cross a threshold set at the design load', () => {
    // The mechanism the range change exposes, at the level of the sensor: with the interlock at
    // the boarding cap, the last boarder — the one the cap deliberately lets cross by a person —
    // is the one the predicate stops. That is the whole of the dimension's one-sided effect.
    const strict = resolveLoadSensor(CAR, SPEC_THRESHOLDS, {
      bypassLoadThreshold: 0.8,
      overloadThreshold: LOAD_SENSOR_DEFAULTS.designLoadFactor,
    });
    expect(strict.overloadThreshold).toBe(LOAD_SENSOR_DEFAULTS.designLoadFactor);
    const permissive = resolveLoadSensor(CAR, SPEC_THRESHOLDS, {
      bypassLoadThreshold: 0.8,
      overloadThreshold: 1.5,
    });
    // Same car, same boarding cap: the strict interlock bites below the cap, the permissive one
    // a long way above it, and only the first is reachable while boarding stops at the cap.
    const sensor = new LoadSensor(strict);
    const ratedKg = sensor.ratedLoadKg;
    expect(strict.overloadThreshold * ratedKg).toBeLessThanOrEqual(sensor.designLoadKg);
    expect(permissive.overloadThreshold * ratedKg).toBeGreaterThan(sensor.designLoadKg);
  });
});
