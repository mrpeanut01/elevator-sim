/**
 * **Rope class, rope mass, and the one travel ceiling in this project that refuses** — GitHub issue
 * **#433**, under the product owner's rulings of 2026-09-10 and 2026-09-11, and `DECISIONS.md`
 * § D583.
 *
 * > *"Its genuinely missing half — rope class and rope mass — with the new rope travel ceiling
 * > binding, so a bank whose single run exceeds its rope's ceiling is refused."*
 *
 * ## What each block pins
 *
 * | block | acceptance criterion |
 * |---|---|
 * | the schema, declared and derived from `data/` in both directions | #433 AC1, CLAUDE.md invariants 7 and 8 |
 * | the ceiling, proved by a configuration that breaches it | #433 AC2, and AC3 as the owner amended it on 2026-09-11 |
 * | no shipped bank declares a rope, and none would be refused if one did | AC3's amendment — *"no shipped building is refused"*, measured rather than asserted |
 * | the runs: the rope moves energy and moves no leg | AC5 — *move the control and require the run to change* |
 *
 * ## The one criterion this file does **not** hold, said here rather than left to be discovered
 *
 * #433's AC5 as written says *"compared on the legs"*, and under this build no leg can move: rope
 * mass reaches `MetricsRecorder.sampleTravel` and nothing a dispatcher, a car or
 * `Car.estimateCost()` reads. That is the owner's *staged* ruling of 2026-09-11 — stage 1 is
 * *"rope class data, schema and the binding ceiling, where no shipped figure moves"* and rope mass
 * *in motion* is stage 2, which moves every energy pin in the project. So the block below requires
 * the run to change on `workKJ` and `workPerServedLegKJ` and requires **every leg of the two runs to
 * be identical**, compared whole — § D539's shape, and the argument is in § D583.
 */

import { describe, expect, it } from 'vitest';

import {
  COUNTERWEIGHT_BALANCE_RATIO,
  DEFAULT_ENERGY_CONVENTION,
  outOfBalanceWorkJ,
  ropeInertiaWorkJ,
  type TravelReading,
} from '../metrics/types.js';
import { energyConventionOf, energyConventionDisclaimer } from '../metrics/comparability.js';
import { fingerprint, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import { parseBuilding, resolveBuilding } from './parse.js';
import { BANK_ROPE_TUNABLES, ConfigError, ISSUE_CODES, WARNING_CODES } from './schema.js';
import type {
  BuildingConfig,
  ElevatorSpecs,
  LoadedConfig,
  ResolvedBuilding,
} from './types.js';

const SEED = 20_260_915;

/** A shipped building with every bank's authored document extended by `fields`. § D539's helper. */
function variant(
  cfg: LoadedConfig,
  buildingId: string,
  fields: Readonly<Record<string, unknown>>,
  specs: ElevatorSpecs = cfg.elevatorSpecs,
): ResolvedBuilding {
  const shipped = cfg.buildingsById.get(buildingId);
  if (shipped === undefined) throw new Error(`no shipped building "${buildingId}"`);
  const authored = structuredClone(shipped.config) as BuildingConfig;
  const document = { ...authored, banks: authored.banks.map((bank) => ({ ...bank, ...fields })) };
  const file = `${buildingId}.json`;
  return resolveBuilding(parseBuilding(document, file), specs, { file });
}

/** The single travel of one resolved bank, derived the way `resolveBuilding` derives it. */
function travelM(building: ResolvedBuilding, bankIndex = 0): number {
  const bank = building.banks[bankIndex];
  if (bank === undefined) throw new Error('no such bank');
  const heights = bank.servesFloors.map((id) => building.floorsById.get(id)?.heightM ?? 0);
  return Math.max(...heights) - Math.min(...heights);
}

/* -------------------------------------------------------------------------- *
 * The schema
 * -------------------------------------------------------------------------- */

describe('the rope is data with a declared schema (invariants 7 and 8)', () => {
  it('declares one row whose values are derived from the data file rather than listed twice', async () => {
    const cfg = await load();
    const row = BANK_ROPE_TUNABLES.ropeClass;
    expect(row.type).toBe('enum');
    // The default is *absent*, and absent means the rope is not modelled. Asserted rather than
    // assumed, because "steel by default" is the owner's stage 2 and would move every energy pin.
    expect(row.default).toBeUndefined();
    expect(row.valuesFrom).toBe('elevator-specs.json#ropeClasses.classes[].id');

    // Both directions: the declared path names the shipped array, and every id in that array is a
    // value a bank may actually declare. A row whose `valuesFrom` had gone stale would fail here.
    const shipped = cfg.elevatorSpecs.ropeClasses?.classes ?? [];
    expect(shipped.length).toBeGreaterThan(1);
    for (const ropeClass of shipped) {
      const fitted = variant(cfg, 'garden-apartments', { ropeClass: ropeClass.id });
      expect(fitted.banks[0]?.ropeClassId).toBe(ropeClass.id);
    }
    expect(() => variant(cfg, 'garden-apartments', { ropeClass: 'hemp' })).toThrow(ConfigError);
  });

  it('gives every shipped class a positive mass, a positive ceiling and a distinct id', async () => {
    const cfg = await load();
    const shipped = cfg.elevatorSpecs.ropeClasses?.classes ?? [];
    const ids = new Set<string>();
    for (const ropeClass of shipped) {
      expect(ropeClass.massKgPerMOfTravel, ropeClass.id).toBeGreaterThan(0);
      expect(ropeClass.maxSingleTravelM, ropeClass.id).toBeGreaterThan(0);
      ids.add(ropeClass.id);
    }
    expect(ids.size).toBe(shipped.length);
    // The two the source names, and the direction it names them in: the carbon rope is the lighter
    // and reaches further. A file that ever transposed them would fail here rather than in a study.
    const steel = shipped.find((entry) => entry.id === 'steel');
    const carbon = shipped.find((entry) => entry.id === 'carbon-fibre');
    expect(steel?.massKgPerMOfTravel).toBeGreaterThan(carbon?.massKgPerMOfTravel ?? 0);
    expect(carbon?.maxSingleTravelM).toBeGreaterThan(steel?.maxSingleTravelM ?? 0);
  });

  it('resolves the rope mass as the class mass times this bank`s own travel', async () => {
    const cfg = await load();
    const steel = cfg.elevatorSpecs.ropeClasses?.classes.find((entry) => entry.id === 'steel');
    const fitted = variant(cfg, 'midtown-office', { ropeClass: 'steel' });
    const rise = travelM(fitted);
    expect(rise).toBeCloseTo(76.9, 3);
    expect(fitted.banks[0]?.ropeMassKg).toBeCloseTo((steel?.massKgPerMOfTravel ?? 0) * rise, 9);
    expect(energyConventionOf(fitted.banks[0]!).ropeMassKg).toBe(fitted.banks[0]?.ropeMassKg);
  });

  it('says so when a rope is declared and the data directory carries no library', async () => {
    const cfg = await load();
    const without: ElevatorSpecs = { ...cfg.elevatorSpecs, ropeClasses: undefined };
    const idle = variant(cfg, 'midtown-office', { ropeClass: 'steel' }, without);
    expect(idle.warnings.map((w) => w.code)).toContain(WARNING_CODES.ropeClassBuysNothing);
    expect(idle.banks[0]?.ropeMassKg).toBeUndefined();
    expect(energyConventionOf(idle.banks[0]!)).toBe(DEFAULT_ENERGY_CONVENTION);

    const working = variant(cfg, 'midtown-office', { ropeClass: 'steel' });
    expect(working.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.ropeClassBuysNothing);
  });
});

/* -------------------------------------------------------------------------- *
 * The ceiling
 * -------------------------------------------------------------------------- */

/**
 * A tower whose single hoistway runs `riseM` from the lobby, roped in `ropeClass`.
 *
 * Hand-built rather than derived from a shipped building, because the thing it has to demonstrate
 * does not exist in `data/buildings/`: the tallest shipped single travel is 452.0 m and steel
 * reaches 500 m, so no shipped configuration can breach the ceiling. That is the owner's
 * amendment of 2026-09-11 to this issue's third criterion — *"a test building whose run exceeds
 * its rope's ceiling is refused … no shipped building is refused"* — and this function is it.
 */
function tower(riseM: number, ropeClass: string | undefined, specs: ElevatorSpecs): ResolvedBuilding {
  const document = {
    id: 'rope-ceiling-proof',
    name: 'Rope ceiling proof',
    type: 'office',
    trafficProfile: 'office',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: 'SKY', index: 1, heightM: riseM, population: 100 },
    ],
    totalPopulation: 100,
    banks: [
      {
        id: 'shuttle',
        servesFloors: ['G', 'SKY'],
        ...(ropeClass === undefined ? {} : { ropeClass }),
        cars: [
          { id: 'A', spec: 'ultra-high-speed', ratedSpeedMps: 10, ratedLoadLb: 3500 },
          { id: 'B', spec: 'ultra-high-speed', ratedSpeedMps: 10, ratedLoadLb: 3500 },
        ],
      },
    ],
    accessZones: [],
  };
  const file = 'rope-ceiling-proof.json';
  return resolveBuilding(parseBuilding(document, file), specs, { file });
}

describe('the travel ceiling binds, and a configuration proves it', () => {
  it('refuses a hoistway that runs further than its rope can hang, by code and by message', async () => {
    const cfg = await load();
    const specs = cfg.elevatorSpecs;
    const steel = specs.ropeClasses?.classes.find((entry) => entry.id === 'steel');
    const ceiling = steel?.maxSingleTravelM ?? 0;
    expect(ceiling).toBeGreaterThan(0);

    let raised: ConfigError | undefined;
    try {
      tower(ceiling + 120, 'steel', specs);
    } catch (error) {
      raised = error as ConfigError;
    }
    expect(raised).toBeInstanceOf(ConfigError);
    expect(raised?.issues.map((issue) => issue.code)).toContain(
      ISSUE_CODES.ropeTravelExceedsClass,
    );
    const issue = raised?.issues.find((entry) => entry.code === ISSUE_CODES.ropeTravelExceedsClass);
    // The message names the shaft, the travel and the rope, because a refusal a player cannot act
    // on is a refusal that will be read as a bug.
    expect(issue?.path).toContain('ropeClass');
    expect(issue?.message).toContain('shuttle');
    expect(issue?.message).toContain('steel');
    expect(issue?.message).toContain(String(ceiling));
  });

  it('accepts the same shaft at the ceiling exactly, and on a rope that reaches further', async () => {
    const cfg = await load();
    const specs = cfg.elevatorSpecs;
    const steel = specs.ropeClasses?.classes.find((entry) => entry.id === 'steel');
    const carbon = specs.ropeClasses?.classes.find((entry) => entry.id === 'carbon-fibre');
    const ceiling = steel?.maxSingleTravelM ?? 0;

    // At the ceiling exactly the rope still hangs: the comparison is `>`, not `>=`, and a boundary
    // that quietly moved to `>=` would fail here rather than in somebody's building.
    expect(() => tower(ceiling, 'steel', specs)).not.toThrow();
    expect(() => tower(ceiling + 120, 'carbon-fibre', specs)).not.toThrow();
    // And the carbon rope has a ceiling of its own — the constraint is a ladder, not an escape.
    expect(() => tower((carbon?.maxSingleTravelM ?? 0) + 1, 'carbon-fibre', specs)).toThrow(
      ConfigError,
    );
  });

  it('is the ONLY hard ceiling: the class rise envelope is still advisory', async () => {
    const cfg = await load();
    // `midtown-office` is 76.9 m against geared traction's 76 m and loads. The owner re-asked and
    // reversed the proposal to harden that on 2026-09-10; this asserts the reversal is still true,
    // because a lane that hardened it would red seventeen benchmark studies.
    const shipped = cfg.buildingsById.get('midtown-office');
    expect(shipped?.warnings.map((w) => w.code)).toContain(WARNING_CODES.riseExceedsClass);
  });
});

/* -------------------------------------------------------------------------- *
 * What ships
 * -------------------------------------------------------------------------- */

describe('no shipped building declares a rope, and none would be refused if it did', () => {
  it('leaves both resolved rope fields off every bank of every shipped building', async () => {
    const cfg = await load();
    let banks = 0;
    for (const building of cfg.buildingsById.values()) {
      for (const bank of building.banks) {
        banks += 1;
        expect('ropeClassId' in bank, `${building.id}/${bank.id}`).toBe(false);
        expect('ropeMassKg' in bank, `${building.id}/${bank.id}`).toBe(false);
        expect(energyConventionOf(bank).ropeMassKg).toBe(0);
      }
      const codes = building.warnings.map((w) => w.code);
      expect(codes, building.id).not.toContain(WARNING_CODES.ropeClassBuysNothing);
    }
    expect(banks).toBeGreaterThan(20);
  });

  /**
   * **The difference between a disclaimer and a defect, measured.**
   *
   * The ceiling refuses nothing that ships today because nothing declares a rope. The question that
   * matters for the owner's stage 2 — *"every bank carries a rope class, steel by default"* — is
   * whether it would refuse anything *then*, and that is a fact about the shipped geometry rather
   * than about this feature. It does not: the tallest shipped single hoistway is
   * `burj-class-reference/observation` at 452.0 m, inside steel's 500 m.
   */
  it('measures the tallest shipped single travel against steel, rather than asserting it', async () => {
    const cfg = await load();
    const steel = cfg.elevatorSpecs.ropeClasses?.classes.find((entry) => entry.id === 'steel');
    let tallest = { id: '', riseM: 0 };
    for (const building of cfg.buildingsById.values()) {
      building.banks.forEach((bank, index) => {
        const rise = travelM(building, index);
        if (rise > tallest.riseM) tallest = { id: `${building.id}/${bank.id}`, riseM: rise };
      });
    }
    expect(tallest.id).toBe('burj-class-reference/observation');
    expect(tallest.riseM).toBeCloseTo(452.0, 1);
    expect(tallest.riseM).toBeLessThan(steel?.maxSingleTravelM ?? 0);

    // And every shipped bank, one by one, so the claim is about the set rather than its maximum.
    for (const building of cfg.buildingsById.values()) {
      building.banks.forEach((_bank, index) => {
        expect(travelM(building, index)).toBeLessThanOrEqual(steel?.maxSingleTravelM ?? 0);
      });
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The proxy
 * -------------------------------------------------------------------------- */

describe('the rope term is exactly zero where no rope is declared', () => {
  const readings = (): TravelReading[] => {
    const out: TravelReading[] = [];
    for (const ratedLoadKg of [454, 1587.573, 2000]) {
      for (const share of [0, 0.3333, 0.5, 0.8, 1.1]) {
        for (const distanceM of [0.3, 4.1, 76.9, 307.5]) {
          for (const direction of ['up', 'down'] as const) {
            for (const peakSpeedMps of [undefined, 0.63, 10]) {
              out.push({
                loadKg: share * ratedLoadKg + 0.07,
                ratedLoadKg,
                distanceM,
                direction,
                ...(peakSpeedMps === undefined ? {} : { peakSpeedMps }),
              });
            }
          }
        }
      }
    }
    return out;
  };

  it('adds nothing to the default convention, bit for bit', () => {
    for (const reading of readings()) {
      expect(ropeInertiaWorkJ(reading)).toBe(0);
      const summed = outOfBalanceWorkJ(reading) + ropeInertiaWorkJ(reading);
      expect(Object.is(summed, outOfBalanceWorkJ(reading))).toBe(true);
    }
  });

  it('charges the accelerating half whole and the braking half at one minus the recovery', () => {
    const reading: TravelReading = {
      loadKg: 500,
      ratedLoadKg: 1000,
      distanceM: 40,
      direction: 'up',
      peakSpeedMps: 4,
    };
    const plain = {
      counterweightBalanceRatio: COUNTERWEIGHT_BALANCE_RATIO,
      regenerativeRecoveryFraction: 0,
      ropeMassKg: 3000,
    };
    // m·v² without regeneration: ½mv² to get it moving and ½mv² burned stopping it.
    expect(ropeInertiaWorkJ(reading, plain)).toBeCloseTo(3000 * 16, 9);
    const regen = { ...plain, regenerativeRecoveryFraction: 0.6 };
    expect(ropeInertiaWorkJ(reading, regen)).toBeCloseTo(0.5 * 3000 * 16 * (1 + 0.4), 9);
    // Direction cannot change it: a rope has to be got moving and stopped whichever way it goes.
    expect(ropeInertiaWorkJ({ ...reading, direction: 'down' }, plain)).toBe(
      ropeInertiaWorkJ(reading, plain),
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The runs
 * -------------------------------------------------------------------------- */

describe('the runs: the rope moves energy, and moves no leg', () => {
  const run = (cfg: LoadedConfig, building: ResolvedBuilding) =>
    runSimulation({
      building,
      dispatcherProfile: cfg.dispatcherProfilesById.get('collective')!,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    });

  /** Every leg whole, and every move's geometry and load — everything but the joules. */
  const legs = (result: ReturnType<typeof run>): string =>
    JSON.stringify({
      passengers: result.record.passengers,
      moves: (result.record.travelSamples ?? []).map((move) => [
        move.at,
        move.carId,
        move.distanceM,
        move.direction,
        move.loadKg,
        move.ratedLoadKg,
      ]),
    });

  it('runs byte-identically when no rope is declared, against the building as shipped', async () => {
    const cfg = await load();
    const shipped = cfg.buildingsById.get('midtown-office') as ResolvedBuilding;
    const explicit = variant(cfg, 'midtown-office', {});
    expect(fingerprint(run(cfg, explicit))).toBe(fingerprint(run(cfg, shipped)));
  }, 120_000);

  it('moves the control and the run changes: steel costs more than carbon, and no leg moves', async () => {
    const cfg = await load();
    const shipped = run(cfg, cfg.buildingsById.get('midtown-office') as ResolvedBuilding);
    const steel = run(cfg, variant(cfg, 'midtown-office', { ropeClass: 'steel' }));
    const carbon = run(cfg, variant(cfg, 'midtown-office', { ropeClass: 'carbon-fibre' }));

    // AC5, in the form the owner's staged ruling leaves available: every leg of the three runs is
    // identical, compared whole, and the energy figures are not.
    expect(legs(steel)).toBe(legs(shipped));
    expect(legs(carbon)).toBe(legs(shipped));
    expect(steel.summary.energy.distanceM).toBe(shipped.summary.energy.distanceM);
    expect(steel.summary.energy.starts).toBe(shipped.summary.energy.starts);

    expect(steel.summary.energy.workKJ).toBeGreaterThan(carbon.summary.energy.workKJ);
    expect(carbon.summary.energy.workKJ).toBeGreaterThan(shipped.summary.energy.workKJ);
    expect(steel.summary.energy.workPerServedLegKJ).toBeGreaterThan(
      carbon.summary.energy.workPerServedLegKJ,
    );

    // The record says what priced a move, so a reader can redo the sum without the building.
    const ropedMove = steel.record.travelSamples?.[0];
    expect(ropedMove?.ropeMassKg).toBeGreaterThan(0);
    expect(shipped.record.travelSamples?.[0]).not.toHaveProperty('ropeMassKg');

    // And the run says so where a reader of it will meet it, naming the class and the mass.
    const disclaimer = energyConventionDisclaimer(
      variant(cfg, 'midtown-office', { ropeClass: 'steel' }),
    );
    expect(disclaimer).toContain('steel');
    expect(disclaimer).toContain('energyPerServedLegKJ');
    expect(steel.warnings.some((warning) => warning.includes('steel'))).toBe(true);
  }, 240_000);
});
