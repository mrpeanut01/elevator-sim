/**
 * **Shafts cost floor area** — GitHub issue **#429**, `DECISIONS.md` § D601.
 *
 * > *"Lift shafts eat the floor area the building is built to sell … today, adding a car is a pure
 * > win. The price schedule charges units for it once and nothing charges it again, so the
 * > interesting half of every equipment decision is missing."*
 *
 * ## What each block pins
 *
 * | block | acceptance criterion |
 * |---|---|
 * | the footprint table, declared and derived from `data/` in both directions | #429 AC1, CLAUDE.md invariants 7 and 8 |
 * | every shipped building authored, and what each one's core share comes out at | #429 AC2 |
 * | **the run**: moving the area declaration alone moves no leg | #429 AC4, first half |
 * | **the run**: adding a shaft moves the published lettable area, by exactly footprint × span | #429 AC4, second half as far as it reaches — see below |
 * | the ceiling, proved by a configuration that breaches it, and reached by none that ships | the refusal, and the difference between a ceiling and a sentence about one |
 *
 * ## The two criteria this file does **not** hold, said here rather than left to be discovered
 *
 * **#429 AC3 — *"the price schedule charges area, and the Career income model reads it"* — is not
 * built, deliberately, and the reason is the product owner's own on the issue.** The ruling this
 * needs *"is not should shafts cost area — it is that making area a cost introduces a second budget
 * axis and a Career income term, and neither is in `docs/38`. That reshapes the economy rather than
 * adding a price, which is why it should not be built on an engineering judgement."* Nothing here
 * charges a unit, and `data/price-schedule.json` is untouched. § D552's magnitude seam could
 * express *per m²* tomorrow, and § D601 § 5 works out what the two shapes would cost so the ruling
 * arrives with arithmetic attached rather than without.
 *
 * **The ceiling does not bind on anything that ships, and that is measured rather than hoped.**
 * The nearest approach in `data/buildings/` is 26.6 % of one plate. So `core-exceeds-floor-plate`
 * is a *correctness guard* — a floor with more hole than floor is refused — and it is **not** the
 * trade-off the issue is about. What a shaft costs is the lettable area it removes on every level
 * it passes, forever, and that is what the *run* block below measures: a fifth car at
 * `midtown-office` takes 142.8 m² out of the building permanently, and every leg of that
 * comparison is not the point — the point is that the figure moves and cannot be avoided.
 */

import { describe, expect, it } from 'vitest';

import { fingerprint, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import { shaftFootprintM2 } from './floorArea.js';
import { parseBuilding, resolveBuilding } from './parse.js';
import { ConfigError, FLOOR_AREA_TUNABLES, ISSUE_CODES, WARNING_CODES } from './schema.js';
import type {
  BuildingConfig,
  ElevatorSpecs,
  LoadedConfig,
  ResolvedBuilding,
} from './types.js';

const SEED = 20_260_915;

/** A shipped building re-resolved from its authored document, with `fields` merged over the top. */
function variant(
  cfg: LoadedConfig,
  buildingId: string,
  fields: Readonly<Record<string, unknown>>,
  specs: ElevatorSpecs = cfg.elevatorSpecs,
): ResolvedBuilding {
  const shipped = cfg.buildingsById.get(buildingId);
  if (shipped === undefined) throw new Error(`no shipped building "${buildingId}"`);
  const document = { ...structuredClone(shipped.config), ...fields } as BuildingConfig;
  const file = `${buildingId}.json`;
  return resolveBuilding(parseBuilding(document, file), specs, { file });
}

/* -------------------------------------------------------------------------- *
 * The data and its schema
 * -------------------------------------------------------------------------- */

describe('the footprint is data with a declared schema (invariants 7 and 8)', () => {
  it('declares the plate row with a type, a unit, a range and an absent default', () => {
    const row = FLOOR_AREA_TUNABLES.grossAreaM2;
    expect(row.type).toBe('number');
    expect(row.unit).toContain('m²');
    expect(row.min).toBeGreaterThan(0);
    expect(row.max).toBeGreaterThan(row.min);
    // Absent means area is not modelled — not a guessed plate. A default here would put an
    // invented figure on every hand-built `ResolvedBuilding` in the tree.
    expect(row.default).toBeUndefined();
    expect(row.source).toContain('CHOSEN');
  });

  it('ships a band table contiguous from zero to an open top, rising with load', async () => {
    const cfg = await load();
    const table = cfg.elevatorSpecs.shaftFootprint;
    expect(table).toBeDefined();
    const bands = table?.bands ?? [];
    expect(bands.length).toBeGreaterThan(1);
    expect(bands[0]?.ratedLoadLbRange[0]).toBe(0);
    expect(bands[bands.length - 1]?.ratedLoadLbRange[1]).toBeNull();
    bands.forEach((band, index) => {
      expect(band.plateAreaM2).toBeGreaterThan(0);
      if (index === 0) return;
      expect(band.ratedLoadLbRange[0]).toBe(bands[index - 1]?.ratedLoadLbRange[1]);
      expect(band.plateAreaM2).toBeGreaterThanOrEqual(bands[index - 1]?.plateAreaM2 ?? 0);
    });
    // The block says which figures are chosen and which cited, and says what it does not measure.
    expect(table?.source).toContain('doi:10.3390/buildings5031070');
    expect(table?.$comment).toContain('CHOSEN');
    expect(table?.$comment).toContain('hoistway alone');
  });

  /**
   * **Every catalogue capacity sits inside a band rather than on an edge**, in both directions.
   *
   * The boundaries are 2000, 3000 and 4000 lb and the table's own `capacities` rows are 1000,
   * 1600, 2500, 3000, 3500 and 4000. 3000 and 4000 *are* boundaries, so this also pins which side
   * of the edge they fall on: `ratedLoadLbRange` is `[from, to)`, so a 3000 lb car is high-rise
   * rather than office standard. A file that flipped that would change every supertall's core.
   */
  it('gives every capacity in the catalogue exactly one band', async () => {
    const cfg = await load();
    const table = cfg.elevatorSpecs.shaftFootprint;
    if (table === undefined) throw new Error('no shaftFootprint block');
    for (const capacity of cfg.elevatorSpecs.capacities) {
      const matching = table.bands.filter(
        (band) =>
          capacity.ratedLoadLb >= band.ratedLoadLbRange[0] &&
          (band.ratedLoadLbRange[1] === null || capacity.ratedLoadLb < band.ratedLoadLbRange[1]),
      );
      expect(matching.length, String(capacity.ratedLoadLb)).toBe(1);
    }
    expect(shaftFootprintM2({ ratedLoadLb: 2500 }, table)).toBe(6.8);
    expect(shaftFootprintM2({ ratedLoadLb: 3000 }, table)).toBe(8);
    expect(shaftFootprintM2({ ratedLoadLb: 4000 }, table)).toBe(9.5);
  });

  /**
   * **A double-deck car is one shaft, charged at one deck's load.**
   *
   * The source's own double-deck arithmetic is the reason: 24 single-deck cars becoming 13
   * double-deckers *"reduc[es] the required core by no less than 11 hoistways"*, which is
   * 24 − 13 and only works if a double-deck car occupies one hole. A model that charged both
   * decks would delete the entire reason double-deck exists.
   */
  it('charges a double-deck car one hoistway at its per-deck load', async () => {
    const cfg = await load();
    const table = cfg.elevatorSpecs.shaftFootprint;
    if (table === undefined) throw new Error('no shaftFootprint block');
    const single = shaftFootprintM2({ ratedLoadLb: 2500 }, table);
    const deck = shaftFootprintM2({ ratedLoadLb: 5000, ratedLoadLbPerDeck: 2500 }, table);
    expect(deck).toBe(single);
    expect(deck).toBeLessThan(shaftFootprintM2({ ratedLoadLb: 5000 }, table));
  });

  it('says so when a plate is declared and the data directory carries no footprint table', async () => {
    const cfg = await load();
    const without: ElevatorSpecs = { ...cfg.elevatorSpecs, shaftFootprint: undefined };
    const idle = variant(cfg, 'midtown-office', {}, without);
    expect(idle.warnings.map((w) => w.code)).toContain(WARNING_CODES.floorAreaBuysNothing);
    expect(idle.area).toBeUndefined();

    const working = variant(cfg, 'midtown-office', {});
    expect(working.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.floorAreaBuysNothing);
    expect(working.area).toBeDefined();
  });

  /**
   * **A partial declaration publishes nothing rather than a partial sum**, and warns.
   *
   * A gross area summed over some of a building's floors reads as a figure for all of them, which
   * is the one failure mode a published quantity must not have.
   */
  it('withholds the building totals when only some floors resolve a plate', async () => {
    const cfg = await load();
    const shipped = cfg.buildingsById.get('midtown-office');
    if (shipped === undefined) throw new Error('no midtown-office');
    const authored = structuredClone(shipped.config) as BuildingConfig;
    const partial = {
      ...authored,
      grossAreaPerFloorM2: undefined,
      floors: (authored.floors ?? []).map((floor, index) =>
        index === 0 ? { ...floor, grossAreaM2: 1400 } : floor,
      ),
    } as unknown as BuildingConfig;
    const resolved = resolveBuilding(parseBuilding(partial, 'partial.json'), cfg.elevatorSpecs, {
      file: 'partial.json',
    });
    expect(resolved.area).toBeUndefined();
    expect(resolved.warnings.map((w) => w.code)).toContain(WARNING_CODES.partialFloorArea);
  });
});

/* -------------------------------------------------------------------------- *
 * What ships
 * -------------------------------------------------------------------------- */

describe('every shipped building is authored, and its core is measured rather than asserted', () => {
  it('resolves a plate on every floor of every shipped building', async () => {
    const cfg = await load();
    let buildings = 0;
    for (const building of cfg.buildingsById.values()) {
      buildings += 1;
      expect(building.area, building.id).toBeDefined();
      expect(building.area?.byFloor.length, building.id).toBe(building.floors.length);
      expect(building.warnings.map((w) => w.code), building.id).not.toContain(
        WARNING_CODES.partialFloorArea,
      );
      for (const floor of building.floors) {
        expect(floor.grossAreaM2, `${building.id}/${floor.id}`).toBeGreaterThan(0);
      }
    }
    expect(buildings).toBeGreaterThanOrEqual(14);
  });

  /**
   * **The tall buildings are the core-heavy ones**, which is Al-Kodmany's whole qualitative claim
   * (*"in high-rises elevators occupy more space than any other services"*) arriving as a
   * measurement of this model rather than as a quotation.
   *
   * The figures are **pinned** rather than bounded, because a plate or a footprint that moved
   * without anybody noticing is exactly how a published number goes stale.
   */
  it('reads single figures on the low-rises and the mid-teens on the supertalls', async () => {
    const cfg = await load();
    const share = (id: string): number => {
      const building = cfg.buildingsById.get(id);
      if (building?.area === undefined) throw new Error(`no area for ${id}`);
      return Math.round(building.area.coreShare * 1000) / 10;
    };
    expect(share('garden-apartments')).toBe(1.4);
    expect(share('midtown-office')).toBe(1.9);
    expect(share('harbour-point')).toBe(2.5);
    expect(share('st-jude-hospital')).toBe(2.3);
    expect(share('crown-hotel')).toBe(3.2);
    expect(share('ashgate')).toBe(3.0);
    expect(share('secure-tower')).toBe(5.1);
    expect(share('chancery-house')).toBe(6.4);
    expect(share('vertical-city')).toBe(7.3);
    expect(share('mixed-use-high-rise')).toBe(7.5);
    expect(share('ctf-class-reference')).toBe(7.9);
    // #429 AC2: the Burj-class reference reports a core share for a supertall tower. It is
    // **hoistway only** — no lobby, no machine room, no riser — so it is expected to come out well
    // under the source's 40 % for elevators and escalators including all of that. See
    // `elevator-specs.json#shaftFootprint.$comment`, which states the difference rather than
    // leaving a reader to find it by comparison.
    expect(share('burj-class-reference')).toBe(13.1);
    expect(share('shanghai-class-reference')).toBe(13.3);
    expect(share('merdeka-class-reference')).toBe(16.6);
  });

  /**
   * **How close the ceiling comes, over every floor of every building rather than at a maximum.**
   *
   * This is the honest half of the feature: the refusal is real and nothing that ships is near it.
   * A later wave that priced area, or that let a player buy shafts without bound, would move this
   * figure, which is why it is pinned rather than asserted to be "comfortable".
   */
  it('comes no closer to the plate than 26.6 % on any shipped floor', async () => {
    const cfg = await load();
    let worst = 0;
    let where = '';
    for (const building of cfg.buildingsById.values()) {
      for (const floor of building.area?.byFloor ?? []) {
        const share = floor.coreM2 / floor.grossM2;
        expect(floor.lettableM2, `${building.id}/${floor.floorId}`).toBeGreaterThan(0);
        if (share <= worst) continue;
        worst = share;
        where = `${building.id}/${floor.floorId}`;
      }
      expect(building.warnings.map((w) => w.code), building.id).not.toContain(
        ISSUE_CODES.coreExceedsFloorPlate,
      );
    }
    expect(where).toBe('merdeka-class-reference/57');
    expect(Math.round(worst * 1000) / 10).toBe(26.6);
  });

  /**
   * **A shaft is charged over its bank's whole span, not its served set** — the one modelling
   * claim in `floorArea.ts`, asserted on a shipped building that can tell the two apart.
   *
   * `burj-class-reference`'s `local-zone3` serves 123–162 and nothing below. If the core were
   * summed over served floors only, floor 130 would carry zone 3's shafts and floor 100 would not
   * carry them either — which is true here. What separates the two models is the *shuttle*: it
   * serves G, 43, 76 and 123 and opens at no floor between, and under a served-set model floor 50
   * would carry no shuttle at all. It does.
   */
  it('charges an express shaft to the floors it passes and does not open onto', async () => {
    const cfg = await load();
    const burj = cfg.buildingsById.get('burj-class-reference');
    const table = cfg.elevatorSpecs.shaftFootprint;
    if (burj?.area === undefined || table === undefined) throw new Error('no burj area');
    const shuttle = burj.banks.find((bank) => bank.id === 'shuttle');
    if (shuttle === undefined) throw new Error('no shuttle bank');
    expect(shuttle.servesFloors).not.toContain('50');
    const shuttleCore = shuttle.cars.reduce(
      (sum, car) => sum + shaftFootprintM2(car, table),
      0,
    );
    const at = (id: string): number =>
      burj.area?.byFloor.find((floor) => floor.floorId === id)?.coreM2 ?? 0;
    expect(at('50')).toBeGreaterThanOrEqual(shuttleCore);
    // And above the shuttle's own top the charge stops: 130 is outside its span entirely.
    expect(at('130')).toBeLessThan(shuttleCore);
  });
});

/* -------------------------------------------------------------------------- *
 * The ceiling
 * -------------------------------------------------------------------------- */

/**
 * A two-level building whose one bank holds `cars` cars on a plate of `plateM2`.
 *
 * Hand-built rather than derived from a shipped building, because the thing it has to demonstrate
 * does not exist in `data/buildings/` — § D583's `tower()` for its reason, and this is the same
 * shape. A shipped building comes no nearer the ceiling than 26.6 % of one plate.
 */
function plate(plateM2: number, cars: number, specs: ElevatorSpecs): ResolvedBuilding {
  const document = {
    id: 'core-ceiling-proof',
    name: 'Core ceiling proof',
    type: 'office',
    trafficProfile: 'office',
    grossAreaPerFloorM2: plateM2,
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: '1', index: 1, heightM: 4, population: 100 },
    ],
    totalPopulation: 100,
    banks: [
      {
        id: 'main',
        servesFloors: ['G', '1'],
        cars: Array.from({ length: cars }, (_unused, index) => ({
          id: `C${String(index)}`,
          spec: 'geared-traction',
          ratedSpeedMps: 2.5,
          ratedLoadLb: 2500,
        })),
      },
    ],
    accessZones: [],
  };
  const file = 'core-ceiling-proof.json';
  return resolveBuilding(parseBuilding(document, file), specs, { file });
}

describe('the plate ceiling binds, and a configuration proves it', () => {
  it('refuses a floor whose hoistways take more plan area than it has, by code and by message', async () => {
    const cfg = await load();
    const specs = cfg.elevatorSpecs;
    // Ten 2500 lb shafts is 68 m² of hoistway. A 60 m² floor cannot hold them.
    let raised: ConfigError | undefined;
    try {
      plate(60, 10, specs);
    } catch (error) {
      raised = error as ConfigError;
    }
    expect(raised).toBeInstanceOf(ConfigError);
    expect(raised?.issues.map((issue) => issue.code)).toContain(
      ISSUE_CODES.coreExceedsFloorPlate,
    );
    const issue = raised?.issues.find(
      (entry) => entry.code === ISSUE_CODES.coreExceedsFloorPlate,
    );
    // The message names the floor, both figures and what to do, because a refusal a player cannot
    // act on will be read as a bug.
    expect(issue?.path).toContain('grossAreaM2');
    expect(issue?.message).toContain('68');
    expect(issue?.message).toContain('60');
    expect(issue?.message).toContain('shaft');
  });

  it('accepts a floor that is entirely core, and refuses the square metre past it', async () => {
    const cfg = await load();
    const specs = cfg.elevatorSpecs;
    // Strictly greater, never equal: a level that is all hoistway is degenerate but buildable, and
    // refusing it would be this project choosing an architectural taste over an impossibility.
    expect(() => plate(68, 10, specs)).not.toThrow();
    expect(() => plate(67.9, 10, specs)).toThrow(ConfigError);
    const exact = plate(68, 10, specs);
    expect(exact.area?.byFloor[0]?.lettableM2).toBe(0);
  });

  /**
   * **The ceiling is reachable by adding shafts, which is the whole trade-off in one assertion.**
   *
   * On the same plate, the ninth car fits and the tenth does not. That is *more shafts is not
   * monotonically better* expressed as a refusal — and the honest caveat is the one at the head of
   * this file: no building in `data/buildings/` is anywhere near this, so on the shipped set the
   * cost of a shaft is the lettable area it removes rather than a shaft that cannot be built.
   */
  it('lets a building buy shafts until one does not fit', async () => {
    const cfg = await load();
    const specs = cfg.elevatorSpecs;
    expect(() => plate(65, 9, specs)).not.toThrow();
    expect(() => plate(65, 10, specs)).toThrow(ConfigError);
  });
});

/* -------------------------------------------------------------------------- *
 * The runs
 * -------------------------------------------------------------------------- */

describe('the runs: area moves no leg, and a shaft moves the area', () => {
  const run = (cfg: LoadedConfig, building: ResolvedBuilding) =>
    runSimulation({
      building,
      dispatcherProfile: cfg.dispatcherProfilesById.get('collective')!,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    });

  /**
   * **#429 AC4, first half: changing a building's area declaration alone changes no leg.**
   *
   * Three arms — as shipped, with the plate doubled, and with the declaration removed entirely —
   * and all three fingerprint identically. Nothing in `sim/`, `dispatch/` or `model/` reads the
   * area, and this asserts that on a run rather than on the import graph.
   */
  it('runs byte-identically at any plate, and with no plate at all', async () => {
    const cfg = await load();
    const shipped = cfg.buildingsById.get('midtown-office') as ResolvedBuilding;
    const doubled = variant(cfg, 'midtown-office', { grossAreaPerFloorM2: 2800 });
    const unauthored = variant(cfg, 'midtown-office', { grossAreaPerFloorM2: undefined });

    expect(doubled.area?.grossM2).toBe((shipped.area?.grossM2 ?? 0) * 2);
    expect(unauthored.area).toBeUndefined();

    const base = fingerprint(run(cfg, shipped));
    expect(fingerprint(run(cfg, doubled))).toBe(base);
    expect(fingerprint(run(cfg, unauthored))).toBe(base);
  }, 120_000);

  /**
   * **What a shaft costs, measured** — and it is the quantity the control moves rather than a leg.
   *
   * A fifth car in `midtown-office`'s only bank is 6.8 m² of hoistway on each of the twenty-one
   * floors the bank spans: **142.8 m² of lettable area, gone, on every floor, forever**. The
   * building's gross area does not move, because a shaft does not make a building bigger — which
   * is the entire economic fact the issue is about.
   *
   * The legs *do* move here, and deliberately: a fifth car changes the dispatch. The claim is not
   * that they don't; it is that the area is charged whether they improve or not, so a player who
   * buys a shaft that helps and a player who buys one that does not pay the same 142.8 m².
   */
  it('charges a fifth car 142.8 m² of lettable area, on a gross area that does not move', async () => {
    const cfg = await load();
    const shipped = cfg.buildingsById.get('midtown-office');
    if (shipped?.area === undefined) throw new Error('no midtown-office area');
    const authored = structuredClone(shipped.config) as BuildingConfig;
    const bank = authored.banks[0];
    if (bank === undefined) throw new Error('no bank');
    const fifth = {
      ...authored,
      banks: [{ ...bank, cars: [...bank.cars, { ...bank.cars[0]!, id: 'E' }] }],
    } as BuildingConfig;
    const grown = resolveBuilding(parseBuilding(fifth, 'fifth.json'), cfg.elevatorSpecs, {
      file: 'fifth.json',
    });
    if (grown.area === undefined) throw new Error('no area on the grown building');

    expect(grown.area.grossM2).toBe(shipped.area.grossM2);
    expect(grown.area.coreM2 - shipped.area.coreM2).toBeCloseTo(142.8, 6);
    expect(shipped.area.lettableM2 - grown.area.lettableM2).toBeCloseTo(142.8, 6);
    // Per floor, everywhere the bank runs, which is every floor of this building.
    for (const floor of grown.area.byFloor) {
      const before = shipped.area.byFloor.find((entry) => entry.floorId === floor.floorId);
      expect(before?.coreM2, floor.floorId).toBeCloseTo(floor.coreM2 - 6.8, 6);
    }
    // And the run really is a different run, so nobody can read the area move as an inert field.
    const grownRun = run(cfg, grown);
    expect(fingerprint(grownRun)).not.toBe(fingerprint(run(cfg, shipped)));
  }, 120_000);
});
