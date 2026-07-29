/// <reference types="node" />

/**
 * Connectivity acceptance tests for the shipped building configurations.
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
 * stopped mirroring, still green.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { RoutePlanner } from '../traffic/route.js';

import { loadConfig } from './loader.js';
import type { LoadedConfig, ResolvedBuilding } from './types.js';

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

/**
 * How many legs a passenger should ever need from a street entrance. Three covers a
 * double-deck supertall (position for the correct deck, shuttle, local); anything more
 * means a zone is anchored to a lobby level the entrance cannot reach directly, which is
 * a layout bug rather than a long trip.
 */
const MAX_LEGS_FROM_ENTRANCE = 3;

// ---------------------------------------------------------------------------
// Routing model
// ---------------------------------------------------------------------------

interface Bank {
  readonly id: string;
  readonly servesFloors: readonly string[];
  readonly servesFloorPairs?: readonly (readonly [string, string])[] | undefined;
}

interface Topology {
  readonly banks: readonly Bank[];
  /** Floors where a journey may change banks and keep its identity. */
  readonly transferFloors: ReadonlySet<string>;
}

function topologyOf(building: ResolvedBuilding): Topology {
  return {
    banks: building.banks,
    transferFloors: new Set(building.transferFloors.map((floor) => floor.id)),
  };
}

/**
 * Where one leg on `bank` boarded at `from` can put a passenger down.
 *
 * For a single-deck bank that is every floor it serves. For a double-deck bank the decks
 * travel together, so a passenger who boards the lower deck alights on a lower-deck floor:
 * boarding at `G` of the pair `["G", "2"]` reaches `26`, never `27`.
 */
function legDestinations(bank: Bank, from: string): readonly string[] {
  const pairs = bank.servesFloorPairs ?? [];
  if (pairs.length === 0) return bank.servesFloors;

  const lower = pairs.some((pair) => pair[0] === from);
  const upper = pairs.some((pair) => pair[1] === from);
  // A floor outside every pair is served by the car as a whole, so either deck will do.
  if (!lower && !upper) return bank.servesFloors;

  const paired = new Set(pairs.flatMap((pair) => [pair[0], pair[1]]));
  const reachable = new Set(bank.servesFloors.filter((floor) => !paired.has(floor)));
  for (const pair of pairs) {
    if (lower) reachable.add(pair[0]);
    if (upper) reachable.add(pair[1]);
  }
  return [...reachable];
}

/** Minimum number of legs from `origin` to every floor it can reach. */
function legsFrom(topology: Topology, origin: string): ReadonlyMap<string, number> {
  const legs = new Map<string, number>([[origin, 0]]);
  // The origin is boardable because the passenger starts there; anywhere else, a second
  // leg may only begin on a declared transfer floor.
  let frontier = [origin];
  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const next: string[] = [];
    for (const at of frontier) {
      for (const bank of topology.banks) {
        if (!bank.servesFloors.includes(at)) continue;
        for (const dest of legDestinations(bank, at)) {
          if (legs.has(dest)) continue;
          legs.set(dest, depth);
          if (topology.transferFloors.has(dest)) next.push(dest);
        }
      }
    }
    frontier = next;
  }
  return legs;
}

const populatedFloors = (building: ResolvedBuilding): readonly string[] =>
  building.floors.filter((floor) => floor.population > 0).map((floor) => floor.id);

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
