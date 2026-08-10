/**
 * **The editor round trip, held to the building it opened.**
 *
 * `specFromBuilding` → `BuildingSpec` → `buildingFromSpec` is what `dev/state.ts` runs on boot for
 * whichever id the query string names, and what `dev/buildingEditor.ts` runs on every keystroke to
 * preview and on *save* to write the reader's building. `shippedBuildings.test.ts` already asserts
 * that the round trip **does not throw** and that the floor ids survive. This file asserts the
 * stronger claim the UI readiness audit found to be false: that the building which comes out is the
 * building that went in.
 *
 * It was not. Measured on the tree before this file existed, at `collective`, one seed, the same
 * template — `vertical-city` went in with 7 banks, 35 cars and 460 paired double-deck stops and came
 * out with 1 bank, 12 single-deck cars and none; `secure-tower` lost the only transfer floor it has,
 * so its two banks could no longer interchange; `mixed-use-high-rise`'s three banks — a 8 m/s
 * shuttle, an office local and a residential local — came back as one bank of 8 m/s cars. Nothing on
 * any surface said so, and `savedBuildingFrom` allocating a new id is the only reason it was not
 * also destructive on disk.
 *
 * ## The four claims, and why each is separate
 *
 * 1. **The hardware survives.** Compared on the *resolved* building, not on the document: bank ids
 *    and served floors, `servesFloorPairs`, car count, and per car the class, speed, rated load,
 *    per-deck load, deck separation, transfer time and door type. A document-level comparison would
 *    pass on a building whose cars resolve differently, and it is the resolved car that the physics
 *    consumes.
 * 2. **The fabric survives.** Floor ids, heights, populations, entrance flags, **transfer flags**
 *    and per-floor traffic profiles. Each of these changes the run: heights are the kinematics,
 *    populations are the demand, and a transfer flag is the only place `traffic/route.ts` lets a
 *    journey change lifts.
 * 3. **The run is the same run.** The legs — who boarded which car when — from a recorded run
 *    through the original and through the rebuilt building. This is `docs/05-roadmap.md`'s standing
 *    requirement pointed backwards: a control that was *not* moved must not change the run. A
 *    summary statistic is not enough; two visibly different buildings can produce the same mean.
 * 4. **What cannot survive is refused out loud.** For the parts the slider model genuinely cannot
 *    hold once the reader edits them, `validateSpec` must name them at the control. A visible
 *    refusal beats an invisible deletion; that is the whole lesson of the audit.
 *
 * The building list is read from `fixtures.test-helper.ts`, which `recordRun.test.ts` guards against
 * the directory in both directions — so a ninth building arrives inside this sweep rather than
 * beside it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  expandFloors,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type BuildingConfig,
  type DispatcherProfile,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type SimulationConfig,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';

import { BUILDING_IDS, DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import {
  BLANK_SPEC,
  buildingFromSpec,
  specFromBuilding,
  unreachableFloors,
  validateSpec,
  type BuildingSpec,
} from './buildingSpec.js';

const BUILDINGS_DIR = join(DATA_DIR, 'buildings');
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const SPECS: ElevatorSpecs = parseElevatorSpecs(read(join(DATA_DIR, 'elevator-specs.json')));
const TRAFFIC: TrafficProfiles = parseTrafficProfiles(read(join(DATA_DIR, 'traffic-profiles.json')));
const PROFILES = parseDispatcherProfiles(read(join(DATA_DIR, 'dispatcher-profiles.json')));

/**
 * `collective` rather than the viewer's default, because it is the dispatcher the audit measured
 * this defect with and the one whose decisions depend on the *whole* bank rather than on one car.
 */
const DISPATCHER = PROFILES.profiles.find((p) => p.id === 'collective') as DispatcherProfile;

const configOf = (id: string): BuildingConfig =>
  parseBuilding(read(join(BUILDINGS_DIR, `${id}.json`)));

const rebuiltOf = (config: BuildingConfig, id: string): BuildingConfig =>
  buildingFromSpec(specFromBuilding(config, id), { specs: SPECS });

const resolvedOf = (config: BuildingConfig): ResolvedBuilding =>
  resolveBuilding(parseBuilding(config as unknown), SPECS);

/** Every fact about the lifts that a resolved building carries and a run consumes. */
const hardwareOf = (building: ResolvedBuilding): unknown =>
  building.banks.map((bank) => ({
    id: bank.id,
    servesFloors: [...bank.servesFloors],
    servesFloorPairs: bank.servesFloorPairs?.map((pair) => [...pair]) ?? null,
    cars: bank.cars.map((car) => ({
      id: car.id,
      spec: car.spec,
      ratedSpeedMps: car.ratedSpeedMps,
      ratedLoadLb: car.ratedLoadLb,
      doubleDeck: car.doubleDeck,
      deckSeparationM: car.deckSeparationM ?? null,
      ratedLoadLbPerDeck: car.ratedLoadLbPerDeck ?? null,
      passengerTransferS: car.passengerTransferS ?? null,
      doorType: car.doorType,
    })),
  }));

/** Every fact about the fabric that a run consumes. */
const fabricOf = (building: ResolvedBuilding): unknown =>
  building.floors.map((floor) => ({
    id: floor.id,
    heightM: floor.heightM,
    population: floor.population,
    isEntrance: floor.isEntrance === true,
    isTransferFloor: floor.isTransferFloor === true,
    trafficProfile: floor.trafficProfile ?? null,
  }));

function runConfig(building: ResolvedBuilding): SimulationConfig {
  return {
    building,
    dispatcherProfile: DISPATCHER,
    trafficProfiles: TRAFFIC,
    elevatorSpecs: SPECS,
    dispatcherProfiles: PROFILES,
    seed: 20_260_810n,
    durationS: 600,
    onTimeout: 'report',
    runId: 'round-trip',
  };
}

/**
 * The legs of one run — who boarded, which car, when, and where they got off.
 *
 * Legs rather than a window statistic, for `docs/05-roadmap.md`'s reason: the peak-five-minute mean
 * of two visibly different buildings can agree, and has.
 */
const legsOf = (building: ResolvedBuilding): string =>
  JSON.stringify(
    recordRun(runConfig(building), { recordDecisions: false }).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
      leg.originFloorId,
      leg.destinationFloorId,
    ]),
  );

/** Paired double-deck stops, the sharpest single number in the audit's table. */
const pairedStopCount = (building: ResolvedBuilding): number =>
  building.banks.reduce((total, bank) => total + (bank.servesFloorPairs?.length ?? 0), 0);

describe.each(BUILDING_IDS)('%s survives the editor round trip', (id) => {
  const config = configOf(id);
  const authored = resolvedOf(config);
  const rebuilt = resolvedOf(rebuiltOf(config, id));

  it('keeps every bank, every car and every deck', () => {
    expect(rebuilt.banks.length, `${id}: bank count`).toBe(authored.banks.length);
    expect(
      rebuilt.banks.reduce((n, bank) => n + bank.cars.length, 0),
      `${id}: car count`,
    ).toBe(authored.banks.reduce((n, bank) => n + bank.cars.length, 0));
    expect(pairedStopCount(rebuilt), `${id}: paired double-deck stops`).toBe(
      pairedStopCount(authored),
    );
    expect(hardwareOf(rebuilt), `${id}: lifts`).toStrictEqual(hardwareOf(authored));
  });

  it('keeps every floor, its height, its people and its transfer flag', () => {
    expect(fabricOf(rebuilt), `${id}: fabric`).toStrictEqual(fabricOf(authored));
    expect(
      rebuilt.transferFloors.map((floor) => floor.id),
      `${id}: transfer floors`,
    ).toStrictEqual(authored.transferFloors.map((floor) => floor.id));
    expect(rebuilt.totalPopulation, `${id}: population`).toBe(authored.totalPopulation);
  });

  it('keeps the parts of the document no control here edits', () => {
    const source = config;
    const written = rebuiltOf(config, id);
    expect(written.notes, `${id}: notes`).toStrictEqual(source.notes);
    expect(written.serviceEvents ?? [], `${id}: serviceEvents`).toStrictEqual(
      source.serviceEvents ?? [],
    );
    expect(written.accessZones ?? [], `${id}: accessZones`).toStrictEqual(source.accessZones ?? []);
    // The floor labels are what the elevation prints beside each row.
    const labels = (building: BuildingConfig): unknown =>
      expandFloors(building).map((floor) => [floor.id, floor.label ?? null]);
    expect(labels(written), `${id}: floor labels`).toStrictEqual(labels(source));
  });

  it('produces the same legs as the building it was read from', () => {
    const before = legsOf(authored);
    /*
     * A run with no legs would make the comparison below pass over nothing, which is the shape of a
     * check that cannot fail. The threshold is deliberately low — the claim is *this run carried
     * people*, not *this many* — since the eight buildings differ by two orders of magnitude in
     * size and pinning a count here would be pinning traffic generation in a round-trip test.
     * `garden-apartments` is the floor: two cars, six floors, 15 legs in this window.
     */
    expect(JSON.parse(before).length, `${id}: legs recorded`).toBeGreaterThan(10);
    expect(legsOf(rebuilt), `${id}: legs`).toBe(before);
  }, 300_000);
});

describe('what the slider model cannot hold is refused at the control', () => {
  /*
   * The other half of the fix, and the half the audit says matters most: a loss that *is* forced —
   * because the reader moved a control that re-deals the shafts — has to be said out loud before it
   * happens. `dev/buildingEditor.ts` sets `validateSpec(...)` under the elevation on every edit, so
   * this is a sentence a reader is actually shown.
   */
  const tower = specFromBuilding(configOf('vertical-city'), 'vertical-city');

  it('says nothing while nothing has been re-dealt', () => {
    expect(validateSpec(tower, undefined).join(' ')).not.toMatch(/no longer|replaced|instead of/i);
  });

  it('names the authored banks and decks when the car count is moved', () => {
    const said = validateSpec({ ...tower, cars: 6 }, undefined).join(' ');
    expect(said).toMatch(/bank/i);
    expect(said).toMatch(/double-deck|deck/i);
  });

  it('names the authored cars when the class, speed or load control is moved', () => {
    const said = validateSpec({ ...tower, ratedSpeedMps: 1.6 }, undefined).join(' ');
    expect(said).toMatch(/every car|all 35|35 cars/i);
  });

  it('stays quiet when re-dealing a building the sliders can rebuild exactly', () => {
    /*
     * `midtown-office` is one bank of four identical cars over a contiguous run of floors, which is
     * precisely what the band model produces. A warning here would be a warning about nothing, and a
     * warning about nothing is how a reader learns to skip the one that matters.
     */
    const midtown = specFromBuilding(configOf('midtown-office'), 'midtown-office');
    expect(validateSpec({ ...midtown, cars: 6 }, undefined).join(' ')).not.toMatch(/authored with/i);
  });

  it('speaks on a single-bank building whose service car is a different machine', () => {
    /*
     * `crown-hotel` has one bank and would pass a bank count test, and it still loses something: its
     * fifth car is a 4 000 lb side-opening geared service lift among four 3 000 lb centre-opening
     * gearless ones. The gate is *what the rebuild would produce*, not *how many banks there are*.
     */
    const crown = specFromBuilding(configOf('crown-hotel'), 'crown-hotel');
    expect(validateSpec({ ...crown, cars: 6 }, undefined).join(' ')).toMatch(/authored with/i);
  });

  it('names the authored floors when the pitch or the occupancy control is moved', () => {
    expect(validateSpec({ ...tower, floorHeightM: 3 }, undefined).join(' ')).toMatch(
      /evenly pitched/i,
    );
    expect(validateSpec({ ...tower, occupancyPct: 40 }, undefined).join(' ')).toMatch(
      /per-floor populations/i,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * S4's viz-side site — an unknown building type
 * -------------------------------------------------------------------------- */

describe('an unknown building type is refused rather than given the office figure', () => {
  /*
   * `transferSecondsFor` ended `return TRANSFER_S_BY_TYPE[type] ?? 1.2` — the **office** transfer
   * time, written onto every car of any building type the reference table does not cover, with no
   * signal. That is the fall-through `config/resolveCar.ts#findPassengerTransferS` exists to make
   * impossible, reintroduced one package over; its own docstring names the bug in as many words.
   * `2·P·tp` is the term the round-trip time is most sensitive to.
   *
   * `BUILDING_TYPES` is closed today, so this is reached only by casting — which is the point: S4 is
   * about a UI that adds a type, and the check has to exist before the type does.
   */
  const unknown = { ...BLANK_SPEC, type: 'datacentre' as unknown as BuildingSpec['type'] };

  it('throws, naming the type and the file to fix', () => {
    expect(() => buildingFromSpec(unknown, { specs: SPECS })).toThrow(/datacentre/);
    expect(() => buildingFromSpec(unknown, { specs: SPECS })).toThrow(/elevator-specs\.json/);
  });

  it('still writes nothing for a type the reference table covers', () => {
    const office = buildingFromSpec({ ...BLANK_SPEC, type: 'office' }, { specs: SPECS });
    for (const car of office.banks.flatMap((bank) => bank.cars)) {
      expect(car.passengerTransferS).toBeUndefined();
    }
  });

  it('writes the reference table’s figure for mixed-use when it has one, and the stopgap when it does not', () => {
    /*
     * **Written against the table rather than against `1.5`, and that is not a weakened assertion.**
     * The claim worth holding is *the car carries the figure the repository declares for its own
     * building type, and never the office one* — `1.5` is only today's answer, and the reference
     * table is being opened so that a type can be priced in `data/` instead of in code. An
     * assertion pinned to the literal would go red on the commit that adds the row and would be
     * read as a regression, which is how a correct fix gets reverted.
     */
    const table = SPECS.timing.passengerTransferS as unknown as Record<string, unknown>;
    const declared = table['mixed-use'];
    const mixed = buildingFromSpec({ ...BLANK_SPEC, type: 'mixed-use' }, { specs: SPECS });
    for (const car of mixed.banks.flatMap((bank) => bank.cars)) {
      // Absent means the table covers it and the resolver will read it — the office value is the
      // one answer that is wrong in both arms.
      expect(car.passengerTransferS).toBe(typeof declared === 'number' ? undefined : 1.5);
      expect(car.passengerTransferS).not.toBe(table['office']);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * S4's third site — the reachability search's own blind spots
 * -------------------------------------------------------------------------- */

describe('the reachability search sees every way into the building', () => {
  it('starts at every entrance, not only at the lobby', () => {
    /*
     * `unreachableFloors` rooted its search at floor 0 and nowhere else, so a floor reachable only
     * from a **second** entrance was reported stranded. `midtown-office` flags its car park `P1`, so
     * this is a shape the shipped data already has; the building below is the smallest one that
     * separates the two roots — one bank off the car park, one off the lobby, nothing joining them.
     */
    const config = parseBuilding({
      id: 'two-doors',
      name: 'Two doors',
      type: 'office',
      trafficProfile: 'office-standard',
      floors: [
        { id: 'P1', index: -1, heightM: -3.6, population: 0, isEntrance: true },
        { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
        { id: '2', index: 1, heightM: 3.6, population: 40 },
        { id: '3', index: 2, heightM: 7.2, population: 40 },
        { id: '4', index: 3, heightM: 10.8, population: 40 },
        { id: '5', index: 4, heightM: 14.4, population: 40 },
      ],
      banks: [
        {
          id: 'car-park',
          servesFloors: ['P1', '2', '3'],
          cars: [{ id: 'A', spec: 'geared-traction', ratedSpeedMps: 2.5, ratedLoadLb: 2500 }],
        },
        {
          id: 'lobby',
          servesFloors: ['G', '4', '5'],
          cars: [{ id: 'B', spec: 'geared-traction', ratedSpeedMps: 2.5, ratedLoadLb: 2500 }],
        },
      ],
    } as unknown);
    const spec = specFromBuilding(config, 'two-doors');
    expect(unreachableFloors(spec)).toStrictEqual([]);
  });

  it('sees a transfer level at the lobby, which is where three shipped buildings put theirs', () => {
    /*
     * The transfer set was `skyFloors.filter(floor > 0)`. `secure-tower`'s only transfer floor is
     * `G`, and it is the floor its low and high banks interchange at — so the search was asked
     * whether a 30-storey building was routable while being unable to see the one place a journey
     * may change lifts in it. That flag now rides in the carry and this reads it.
     */
    const spec = specFromBuilding(configOf('secure-tower'), 'secure-tower');
    expect(spec.carried?.floors[0]?.isTransferFloor, 'G carries its transfer flag').toBe(true);
    expect(unreachableFloors(spec)).toStrictEqual([]);
  });
});
