/// <reference types="node" />

/**
 * Connectivity acceptance tests for the shipped building configurations, and for the loader
 * check that now holds every *other* building to the same properties.
 *
 * `loader.test.ts` proves the shipped data *validates*. This file proves it *routes*: that
 * every passenger the demand generator can create has a declared chain of elevator legs to
 * their destination, and that every floor where such a chain changes banks is flagged
 * `isTransferFloor` so the legs join into one journey.
 *
 * This is the failure mode the schema cannot catch. A building whose banks do not connect
 * loads cleanly and then silently drops or mis-attributes demand at run time, which shows
 * up as a plausible-looking time-to-destination that is quietly wrong — exactly the
 * "confident nonsense" CLAUDE.md names as the most likely way this project fails.
 *
 * ## The model used to live here, and that was the defect
 *
 * Every function this file used to define — the topology, the deck-aware leg expansion, the
 * breadth-first search — is now `./buildingConnectivity.ts`, imported below rather than
 * restated. A check bound to `REAL_DATA_DIR` covers the eight files on disk and **nothing a UI
 * creates**, and the new viewer authors buildings at run time. Measured on a purpose-built
 * tower before the move: a populated floor no bank served, an orphaned bank, and
 * `isTransferFloor` stripped from both lobby levels were each accepted by `loadConfig` in
 * silence, with no error and no warning, at up to 160 of 324 ordered pairs unroutable.
 *
 * Nothing here is elevator-specific policy: it is graph reachability over
 * `servesFloors`, restricted by `servesFloorPairs` (a double-deck leg cannot change deck
 * mid-ride) and by `isTransferFloor` (a journey cannot change bank anywhere else).
 *
 * ## It models the **lifts alone**, and that is now a deliberate narrowing
 *
 * `traffic/route.ts` gained a second kind of edge — a declared `transportModes` entry, an
 * escalator or a stair — and this model does not have it. That is on purpose and it makes this
 * check *stronger*, not stale: the property asserted here is that the shipped buildings connect
 * **without leaning on a non-lift connection**, so an escalator can never be what rescues a
 * zoning mistake. `vertical-city` still routes `G → 27` on two lift legs by this model even
 * though the real planner now sends it up the escalator and one shuttle.
 *
 * The narrowing is only safe while the two models are related, so {@link RoutePlanner} is asked
 * directly, once, at the bottom of this file: whatever this model can reach, the real planner
 * must reach in **no more lift legs**. Without that assertion the "guard whose meaning eroded
 * when something else moved into its filtered region" shape would apply exactly — a mirror that
 * stopped mirroring, still green. That tie is *stronger* now than when it was written, because
 * the mirror it holds is shipped code rather than a copy in a test file.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { RoutePlanner } from '../traffic/route.js';

import {
  MAX_LEGS_FROM_ENTRANCE,
  type ConnectivityTopology as Topology,
  connectivityDiagnostics,
  connectivityTopologyOf as topologyOf,
  deckAwareDestinations as legDestinations,
  legCountsFrom as legsFrom,
  measureConnectivity,
  populatedFloorIds as populatedFloorsOf,
} from './buildingConnectivity.js';
import { loadConfig } from './loader.js';
import { parseBuilding, resolveBuilding } from './parse.js';
import { ConfigError, ISSUE_CODES, WARNING_CODES } from './schema.js';
import type { BuildingConfig, ElevatorSpecs, LoadedConfig, ResolvedBuilding } from './types.js';

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

/** A `ResolvedBank`-shaped view for the hand-built topologies below. */
interface Bank {
  readonly id: string;
  readonly servesFloors: readonly string[];
  readonly servesFloorPairs?: readonly (readonly [string, string])[] | undefined;
}

const populatedFloors = (building: ResolvedBuilding): readonly string[] =>
  populatedFloorsOf(building);

/** Floor ids the given origin cannot reach at all. */
function unreachableFrom(
  building: ResolvedBuilding,
  origin: string,
  targets: readonly string[],
): string[] {
  const legs = legsFrom(topologyOf(building), origin);
  return targets.filter((id) => !legs.has(id));
}

// ---------------------------------------------------------------------------

describe('shipped buildings are routable', () => {
  let config: LoadedConfig;
  const byId = new Map<string, ResolvedBuilding>();

  beforeAll(async () => {
    config = await loadConfig(REAL_DATA_DIR);
    for (const building of config.buildings) byId.set(building.id, building);
  });

  const building = (id: string): ResolvedBuilding => {
    const found = byId.get(id);
    if (found === undefined) throw new Error(`no building "${id}" in ${REAL_DATA_DIR}`);
    return found;
  };

  it('reaches every populated floor from every entrance', () => {
    const broken: string[] = [];
    for (const b of config.buildings) {
      const targets = populatedFloors(b);
      for (const entrance of b.entranceFloors) {
        for (const id of unreachableFrom(b, entrance.id, targets)) {
          broken.push(`${b.id}: ${entrance.id} -> ${id}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('needs no more than three legs from an entrance to any populated floor', () => {
    const tooFar: string[] = [];
    for (const b of config.buildings) {
      for (const entrance of b.entranceFloors) {
        const legs = legsFrom(topologyOf(b), entrance.id);
        for (const id of populatedFloors(b)) {
          const count = legs.get(id) ?? Number.POSITIVE_INFINITY;
          if (count > MAX_LEGS_FROM_ENTRANCE) tooFar.push(`${b.id}: ${entrance.id} -> ${id} (${count} legs)`);
        }
      }
    }
    expect(tooFar).toEqual([]);
  });

  it('routes every interfloor journey, not just journeys through an entrance', () => {
    const broken: string[] = [];
    for (const b of config.buildings) {
      const targets = populatedFloors(b);
      for (const origin of targets) {
        for (const id of unreachableFrom(b, origin, targets)) {
          broken.push(`${b.id}: ${origin} -> ${id}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('flags every floor served by more than one bank as a transfer floor', () => {
    const missing: string[] = [];
    for (const b of config.buildings) {
      const bankCount = new Map<string, number>();
      for (const bank of b.banks) {
        for (const id of bank.servesFloors) bankCount.set(id, (bankCount.get(id) ?? 0) + 1);
      }
      const transfers = new Set(b.transferFloors.map((floor) => floor.id));
      for (const [id, count] of bankCount) {
        if (count > 1 && !transfers.has(id)) missing.push(`${b.id}: ${id} (served by ${count} banks)`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('declares the ground lobby of every multi-bank building as a transfer floor', () => {
    // Entrance floors are NOT implicitly transfer-capable: `isTransferFloor` is a distinct
    // concept, so a ground lobby that joins two banks has to say so.
    for (const id of ['secure-tower', 'mixed-use-high-rise', 'vertical-city']) {
      const ground = building(id).floorsById.get('G');
      expect(ground?.isEntrance, `${id}: G should be the street entrance`).toBe(true);
      expect(ground?.isTransferFloor, `${id}: G joins two banks and must be a transfer floor`).toBe(
        true,
      );
    }
  });
});

describe('mixed-use-high-rise: the ground lobby is load-bearing', () => {
  let b: ResolvedBuilding;

  beforeAll(async () => {
    const config = await loadConfig(REAL_DATA_DIR);
    b = config.buildings.find((x) => x.id === 'mixed-use-high-rise') as ResolvedBuilding;
  });

  it('routes a resident on 45 to office floor 20 in three legs, transferring at 31 and G', () => {
    expect(legsFrom(topologyOf(b), '45').get('20')).toBe(3);
  });

  it('routes an office floor to the sky lobby amenity level in two legs', () => {
    // Floor 31 carries 260 occupants and no bank serves both it and the office floors, so
    // 18 -> 31 is office-local 18 -> G then shuttle G -> 31.
    expect(legsFrom(topologyOf(b), '18').get('31')).toBe(2);
  });

  it('loses that journey entirely if G is not a transfer floor', () => {
    // The regression: with `isTransferFloor` absent from G the leg arriving there ends the
    // journey, so the office-standard interfloor share between the two halves of the
    // building either vanishes or reappears as a phantom arrival.
    const withoutGround: Topology = {
      banks: b.banks,
      transferFloors: new Set(
        b.transferFloors.map((floor) => floor.id).filter((id) => id !== 'G'),
      ),
    };
    expect(legsFrom(withoutGround, '45').has('20')).toBe(false);
    // The sky lobby's own 260 occupants lose their office trips for the same reason.
    expect(legsFrom(withoutGround, '18').has('31')).toBe(false);
    expect(legsFrom(withoutGround, '31').has('18')).toBe(false);
    // Single-leg journeys are unaffected, which is why this fails silently rather than loudly.
    expect(legsFrom(withoutGround, '18').get('25')).toBe(1);
  });
});

describe('vertical-city: double-deck routing', () => {
  let b: ResolvedBuilding;

  beforeAll(async () => {
    const config = await loadConfig(REAL_DATA_DIR);
    b = config.buildings.find((x) => x.id === 'vertical-city') as ResolvedBuilding;
  });

  it('has exactly one entrance, so incoming demand needs no undeclared split', () => {
    // Both ground lobby levels used to be entrances with nothing in the data to weight the
    // split between them, which silently decided how much traffic started on the wrong
    // side of the deck pairing.
    expect(b.entranceFloors.map((floor) => floor.id)).toEqual(['G']);
    expect(b.floorsById.get('2')?.isTransferFloor).toBe(true);
  });

  it('serves both zone 1 and zone 2 from the street entrance in one leg', () => {
    const legs = legsFrom(topologyOf(b), 'G');
    expect(legs.get('10')).toBe(1);
    expect(legs.get('20')).toBe(1);
  });

  it('reaches an upper-deck zone by way of the upper lobby level', () => {
    // Zone 4 is anchored to 27, which only the upper deck serves, and the upper deck
    // boards at floor 2: position (G -> 2), shuttle (2 -> 27), local (27 -> 45).
    expect(legsFrom(topologyOf(b), 'G').get('45')).toBe(3);
  });

  it('keeps the lower deck away from the upper lobby levels', () => {
    // A leg boarded at G is on the lower deck for its whole ride: 26/51/76, never 27/52/77.
    const shuttle = b.banks.find((bank) => bank.id === 'shuttle') as Bank;
    expect([...legDestinations(shuttle, 'G')].sort()).toEqual(['26', '51', '76', 'G'].sort());
    expect([...legDestinations(shuttle, '2')].sort()).toEqual(['2', '27', '52', '77'].sort());
  });

  it('strands zone 2 behind a four-leg detour if the low locals stop at one lobby level', () => {
    // The regression. Before the fix zone-1-local served G but not 2, and zone-2-local
    // served 2 but not G, so an arrival at G bound for floor 20 had to ride the lower deck
    // 211 m up to sky lobby B, cross to 52 on a hotel local, and come back down on the
    // upper deck. Graph-reachable, operationally nonsense, and far outside the three-leg
    // bound the whole set is held to.
    const anchored: Topology = {
      transferFloors: new Set(b.transferFloors.map((floor) => floor.id)),
      banks: b.banks.map((bank) => {
        if (bank.id === 'zone-1-local') {
          return { ...bank, servesFloors: bank.servesFloors.filter((id) => id !== '2') };
        }
        if (bank.id === 'zone-2-local') {
          return { ...bank, servesFloors: bank.servesFloors.filter((id) => id !== 'G') };
        }
        return bank;
      }),
    };
    expect(legsFrom(anchored, 'G').get('20')).toBeGreaterThan(MAX_LEGS_FROM_ENTRANCE);
  });

  it('rates each shuttle deck against the class band, not the whole-car load', () => {
    // `ratedLoadLb` is the sum of both decks. Dividing it by 150 gives 26 persons per deck
    // and doubles shuttle handling capacity; the per-deck rating gives 13, inside the
    // [12, 14] the ultra-high-speed class declares.
    const shuttle = b.banks.find((bank) => bank.id === 'shuttle');
    expect(shuttle?.cars).toHaveLength(8);
    for (const car of shuttle?.cars ?? []) {
      expect(car.doubleDeck).toBe(true);
      expect(car.ratedLoadLbPerDeck).toBe(2000);
      expect(car.ratedLoadLb).toBe(2 * (car.ratedLoadLbPerDeck ?? 0));
      expect(car.capacityPersonsPerDeck).toBe(13);
    }
  });
});

/**
 * The tie between this file's lift-only model and the planner the product actually runs.
 *
 * Two claims, and the second is the one that keeps this file honest: every pair this model can
 * reach, the real planner reaches too, in **no more lift legs**. A transport edge can only ever
 * remove lift legs, never add one and never disconnect a pair — so if that ever stopped holding,
 * the model above would still be green while describing a building the simulator no longer routes
 * that way.
 */
describe('the lift-only model is a conservative view of the planner that actually runs', () => {
  let config: LoadedConfig;

  beforeAll(async () => {
    config = await loadConfig(REAL_DATA_DIR);
  });

  it('never claims a pair the planner cannot route, or fewer legs than it needs', () => {
    const problems: string[] = [];
    for (const b of config.buildings) {
      const planner = RoutePlanner.forBuilding(b);
      const model = topologyOf(b);
      const targets = [...b.entranceFloors.map((floor) => floor.id), ...populatedFloors(b)];
      for (const origin of targets) {
        const legs = legsFrom(model, origin);
        for (const [destination, modelLegs] of legs) {
          if (destination === origin) continue;
          const actual = planner.legCount(origin, destination);
          if (actual === undefined) {
            problems.push(`${b.id}: ${origin} -> ${destination} unreachable for the planner`);
          } else if (actual > modelLegs) {
            problems.push(
              `${b.id}: ${origin} -> ${destination} costs the planner ${String(actual)} lift legs but the lift-only model says ${String(modelLegs)}`,
            );
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('and vertical-city is a case where it is strictly cheaper, so the check is not vacuous', () => {
    const b = config.buildingsById.get('vertical-city');
    if (b === undefined) throw new Error('no vertical-city');
    const planner = RoutePlanner.forBuilding(b);
    expect(legsFrom(topologyOf(b), 'G').get('40')).toBe(3);
    expect(planner.legCount('G', '40')).toBe(2);
    // The widest gap the escalators open, and the one that matters most: a cross-lobby interfloor
    // journey. The lift-only model rides 105 m down to the ground lobby and back; the planner
    // crosses at sky lobby A. Pinned so the gap cannot quietly close back up.
    expect(legsFrom(topologyOf(b), '40').get('34')).toBe(5);
    expect(planner.legCount('40', '34')).toBe(2);
  });
});

/* -------------------------------------------------------------------------- *
 * The loader check — the half of this file that is not about the shipped data
 * -------------------------------------------------------------------------- */

/**
 * A two-zone tower with a two-level lobby, authored correct.
 *
 * Small enough to state in one screen, structured enough to break in the three ways a building
 * editor breaks a building: orphan a floor, orphan a bank, unflag a transfer floor.
 * `totalPopulation` is kept honest in every mutation so the existing `population-mismatch`
 * warning cannot be what raises the alarm.
 */
const PROBE: BuildingConfig = {
  id: 'connectivity-probe',
  name: 'Connectivity Probe Tower',
  type: 'office',
  trafficProfile: 'office-standard',
  totalPopulation: 1080,
  floors: [
    { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true, isTransferFloor: true },
    { id: 'M', index: 1, heightM: 4.5, population: 0, isTransferFloor: true },
  ],
  floorRanges: [
    { fromIndex: 2, toIndex: 11, startHeightM: 9, floorToFloorM: 3.8, populationPerFloor: 60 },
    { fromIndex: 12, toIndex: 19, startHeightM: 47.2, floorToFloorM: 3.8, populationPerFloor: 60 },
  ],
  banks: [
    {
      id: 'low',
      servesFloors: ['G', 'M', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
      cars: [
        { id: 'L1', spec: 'gearless-traction' },
        { id: 'L2', spec: 'gearless-traction' },
      ],
    },
    {
      id: 'high',
      servesFloors: ['G', 'M', '12', '13', '14', '15', '16', '17', '18', '19'],
      cars: [
        { id: 'H1', spec: 'gearless-traction' },
        { id: 'H2', spec: 'gearless-traction' },
      ],
    },
  ],
};

const clone = (building: BuildingConfig): BuildingConfig =>
  JSON.parse(JSON.stringify(building)) as BuildingConfig;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

describe('the loader refuses to accept an unroutable building in silence', () => {
  let specs: ElevatorSpecs;

  beforeAll(async () => {
    specs = (await loadConfig(REAL_DATA_DIR)).elevatorSpecs;
  });

  const resolve = (building: BuildingConfig): ResolvedBuilding =>
    resolveBuilding(parseBuilding(building), specs);

  const codes = (building: BuildingConfig): readonly string[] =>
    resolve(building).warnings.map((warning) => warning.code);

  it('says nothing about the probe as authored', () => {
    expect(codes(PROBE)).toEqual([]);
    const measured = measureConnectivity(resolve(PROBE));
    expect(measured.pairsConsidered).toBe(324);
    expect(measured.pairsRoutable).toBe(324);
  });

  it('warns when a populated floor is served by no bank', () => {
    // Before this check existed: accepted, zero warnings, 37 of 361 ordered pairs unroutable.
    const edited = clone(PROBE) as Mutable<BuildingConfig>;
    edited.floors = [
      ...(edited.floors ?? []),
      { id: '20', index: 20, heightM: 77.8, population: 60 },
    ];
    edited.totalPopulation = 1140;

    const resolved = resolve(edited);
    expect(resolved.warnings.map((warning) => warning.code)).toEqual([
      WARNING_CODES.unreachableFromEntrance,
      WARNING_CODES.unroutableInterfloor,
    ]);
    // The population cross-check is silent, so the connectivity warning is doing the work.
    expect(resolved.warnings.map((warning) => warning.code)).not.toContain(
      WARNING_CODES.populationMismatch,
    );
    const stranded = resolved.warnings.find(
      (warning) => warning.code === WARNING_CODES.unreachableFromEntrance,
    );
    expect(stranded?.message).toContain('"G" -> "20"');
    expect(measureConnectivity(resolved).pairsConsidered).toBe(361);
    expect(measureConnectivity(resolved).pairsRoutable).toBe(324);
  });

  it('warns when a whole bank is disconnected from the rest of the building', () => {
    // Before: accepted, zero warnings, 74 of 400 ordered pairs unroutable.
    const edited = clone(PROBE) as Mutable<BuildingConfig>;
    edited.floors = [
      ...(edited.floors ?? []),
      { id: 'X1', index: 21, heightM: 81.6, population: 60 },
      { id: 'X2', index: 22, heightM: 85.4, population: 60 },
    ];
    edited.totalPopulation = 1200;
    edited.banks = [
      ...edited.banks,
      { id: 'orphan', servesFloors: ['X1', 'X2'], cars: [{ id: 'O1', spec: 'gearless-traction' }] },
    ];

    const resolved = resolve(edited);
    expect(resolved.warnings.map((warning) => warning.code)).toEqual([
      WARNING_CODES.unreachableFromEntrance,
      WARNING_CODES.unroutableInterfloor,
    ]);
    expect(measureConnectivity(resolved).pairsConsidered).toBe(400);
    expect(measureConnectivity(resolved).pairsRoutable).toBe(326);
  });

  it('warns when the lobby levels lose isTransferFloor', () => {
    // Before: accepted, zero warnings, 160 of 324 ordered pairs unroutable — the mutation that
    // took 72 % of a bigger tower's pairs out and produced not one diagnostic.
    //
    // Only the interfloor code fires, and that is the model being precise rather than lenient:
    // G is in both banks' `servesFloors`, so every populated floor is still one leg from the
    // street. What breaks is `4 -> 15`, which needed to change banks at a floor that no longer
    // says a journey may.
    const edited = clone(PROBE) as Mutable<BuildingConfig>;
    edited.floors = (edited.floors ?? []).map((floor) => {
      const { isTransferFloor: _dropped, ...rest } = floor;
      return rest;
    });

    const resolved = resolve(edited);
    expect(resolved.warnings.map((warning) => warning.code)).toEqual([
      WARNING_CODES.unroutableInterfloor,
    ]);
    const measured = measureConnectivity(resolved);
    expect(measured.pairsConsidered).toBe(324);
    expect(measured.pairsConsidered - measured.pairsRoutable).toBe(160);
  });

  it('warns when a bank stops serving the sky lobby its zone hangs off', () => {
    // `vertical-city`'s `zone-3-local` minus floor 26 — the single most likely edit a player
    // makes in a bank editor. Measured before this check: `loadConfig` clean, the run clean, and
    // `generated` down from 1 833 to 1 570 with nothing said until the trace was already built.
    const edited = clone(PROBE) as Mutable<BuildingConfig>;
    edited.banks = edited.banks.map((bank) =>
      bank.id === 'high'
        ? { ...bank, servesFloors: bank.servesFloors.filter((id) => id !== 'G' && id !== 'M') }
        : bank,
    );

    const resolved = resolve(edited);
    const stranded = resolved.warnings.find(
      (warning) => warning.code === WARNING_CODES.unreachableFromEntrance,
    );
    expect(stranded).toBeDefined();
    expect(stranded?.message).toContain('8 populated floors');
  });

  it('rejects — does not warn about — a building that can serve nobody', () => {
    // The one hard refusal. Both banks keep their floors and lose the lobby, so no journey the
    // generator would draw is servable at all and the run would create no legs.
    const edited = clone(PROBE) as Mutable<BuildingConfig>;
    edited.floors = [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true, isTransferFloor: true },
      { id: 'M', index: 1, heightM: 4.5, population: 0, isTransferFloor: true },
    ];
    edited.floorRanges = [
      { fromIndex: 2, toIndex: 11, startHeightM: 9, floorToFloorM: 3.8, populationPerFloor: 60 },
    ];
    edited.totalPopulation = 600;
    edited.banks = [
      {
        id: 'lobby-only',
        servesFloors: ['G', 'M'],
        cars: [{ id: 'C1', spec: 'gearless-traction' }],
      },
    ];

    let thrown: unknown;
    try {
      resolve(edited);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    const issues = (thrown as ConfigError).issues;
    expect(issues.map((issue) => issue.code)).toEqual([ISSUE_CODES.disconnectedBuilding]);
    expect(issues[0]?.message).toContain('no journey');
  });

  it('warns about a transfer chain longer than a supertall needs', () => {
    // Reachable, so not an error; four legs from the street, so not a building anybody meant.
    // Four banks in a chain, each meeting the next at one transfer floor.
    const chained: BuildingConfig = {
      id: 'chain-probe',
      name: 'Chain Probe',
      type: 'office',
      trafficProfile: 'office-standard',
      floors: [
        { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true, isTransferFloor: true },
        { id: 'A', index: 1, heightM: 4, population: 10, isTransferFloor: true },
        { id: 'B', index: 2, heightM: 8, population: 10, isTransferFloor: true },
        { id: 'C', index: 3, heightM: 12, population: 10, isTransferFloor: true },
        { id: 'D', index: 4, heightM: 16, population: 10 },
      ],
      banks: [
        { id: 'b1', servesFloors: ['G', 'A'], cars: [{ id: 'c1', spec: 'gearless-traction' }] },
        { id: 'b2', servesFloors: ['A', 'B'], cars: [{ id: 'c2', spec: 'gearless-traction' }] },
        { id: 'b3', servesFloors: ['B', 'C'], cars: [{ id: 'c3', spec: 'gearless-traction' }] },
        { id: 'b4', servesFloors: ['C', 'D'], cars: [{ id: 'c4', spec: 'gearless-traction' }] },
      ],
    };

    const resolved = resolve(chained);
    expect(resolved.warnings.map((warning) => warning.code)).toContain(
      WARNING_CODES.excessiveTransferChain,
    );
    const chain = resolved.warnings.find(
      (warning) => warning.code === WARNING_CODES.excessiveTransferChain,
    );
    expect(chain?.message).toContain('"G" -> "D" (4 legs)');
    // Nothing is unroutable here, so neither of the other two codes may fire.
    expect(resolved.warnings.map((warning) => warning.code)).not.toContain(
      WARNING_CODES.unreachableFromEntrance,
    );
  });

  it('is credential-blind, so secure-tower keeps every load-time verdict it had', async () => {
    // The decision this check would be wrong to reverse. `secure-tower` deliberately makes some
    // origin-destination pairs impossible *for a person*: its `facilities` group reaches four
    // tenant zones and not the executive floor. The shafts connect; the badge does not. Turning
    // that into a load-time diagnostic would fire on a shipped building for doing exactly what
    // it was authored to do — so the credential question stays in the generator's per-run
    // rejection census, where the rider exists.
    const config = await loadConfig(REAL_DATA_DIR);
    const tower = config.buildingsById.get('secure-tower');
    if (tower === undefined) throw new Error('no secure-tower');
    expect(tower.accessZones.length).toBeGreaterThan(0);
    expect(measureConnectivity(tower).pairsRoutable).toBe(measureConnectivity(tower).pairsConsidered);
    expect(tower.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it('leaves all eight shipped buildings loading clean', async () => {
    const config = await loadConfig(REAL_DATA_DIR);
    expect(config.buildings).toHaveLength(8);
    const connectivityCodes: readonly string[] = [
      WARNING_CODES.unreachableFromEntrance,
      WARNING_CODES.unroutableInterfloor,
      WARNING_CODES.excessiveTransferChain,
    ];
    const raised = config.buildings.flatMap((b) =>
      b.warnings.filter((warning) => connectivityCodes.includes(warning.code)).map((warning) => `${b.id}: ${warning.code}`),
    );
    expect(raised).toEqual([]);
  });

  it('reports diagnostics on the same object the demand generator will route over', () => {
    // The tie that stops this becoming a second opinion. `connectivityDiagnostics` is what
    // `resolveBuilding` calls; `measureConnectivity` is what it calls; both are exported so a
    // caller wanting the facts does not parse them back out of a message.
    const edited = clone(PROBE) as Mutable<BuildingConfig>;
    edited.floors = [
      ...(edited.floors ?? []),
      { id: '20', index: 20, heightM: 77.8, population: 60 },
    ];
    edited.totalPopulation = 1140;
    const resolved = resolve(edited);
    const direct = connectivityDiagnostics(resolved, { buildingId: resolved.id });
    expect(direct.issues).toEqual([]);
    expect(direct.warnings.map((warning) => warning.code)).toEqual(
      resolved.warnings.map((warning) => warning.code),
    );
  });
});
