/// <reference types="node" />

/**
 * Route planning over the shipped buildings.
 *
 * `config/buildingConnectivity.test.ts` proves the data *can* be routed. This proves the
 * generator's planner actually routes it the same way, because the two are independent
 * implementations of the same rule and a divergence would show up as demand quietly
 * attributed to the wrong bank — or as a journey whose time-to-destination omits a leg.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';

import { RoutePlanner, legDestinations, routeTopologyOf } from './route.js';
import { TrafficError } from './types.js';

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(REAL_DATA_DIR);
});

const building = (id: string): ResolvedBuilding => {
  const found = config.buildingsById.get(id);
  if (found === undefined) throw new Error(`no building "${id}"`);
  return found;
};

describe('single-bank buildings', () => {
  it('routes every trip in one leg', () => {
    const b = building('midtown-office');
    const planner = RoutePlanner.forBuilding(b);
    for (const from of b.floors) {
      for (const to of b.floors) {
        if (from.id === to.id) continue;
        expect(planner.legCount(from.id, to.id), `${from.id} -> ${to.id}`).toBe(1);
      }
    }
  });
});

describe('mixed-use-high-rise: the sky lobby and the ground lobby', () => {
  it('routes a resident on 45 to office floor 20 in three legs, through 31 and G', () => {
    const planner = RoutePlanner.forBuilding(building('mixed-use-high-rise'));
    expect(planner.route('45', '20')).toEqual(['45', '31', 'G', '20']);
  });

  it('routes an office floor to the sky lobby amenity level in two legs', () => {
    const planner = RoutePlanner.forBuilding(building('mixed-use-high-rise'));
    expect(planner.route('18', '31')).toEqual(['18', 'G', '31']);
  });

  it('keeps a trip inside one bank to a single leg', () => {
    const planner = RoutePlanner.forBuilding(building('mixed-use-high-rise'));
    expect(planner.route('18', '25')).toEqual(['18', '25']);
    expect(planner.route('40', '55')).toEqual(['40', '55']);
  });

  it('only ever changes bank on a declared transfer floor', () => {
    const b = building('mixed-use-high-rise');
    const planner = RoutePlanner.forBuilding(b);
    const transfers = new Set(b.transferFloors.map((floor) => floor.id));
    for (const from of b.floors) {
      for (const to of b.floors) {
        if (from.id === to.id) continue;
        const route = planner.route(from.id, to.id);
        expect(route, `${from.id} -> ${to.id}`).toBeDefined();
        for (const intermediate of (route ?? []).slice(1, -1)) {
          expect(transfers.has(intermediate), `${route?.join(' -> ')} stops at ${intermediate}`).toBe(
            true,
          );
        }
      }
    }
  });
});

describe('vertical-city: double-deck routing', () => {
  it('keeps a leg boarded on a lower-deck floor on the lower deck', () => {
    const topology = routeTopologyOf(building('vertical-city'));
    const shuttle = topology.banks.find((bank) => bank.id === 'shuttle');
    expect(shuttle).toBeDefined();
    expect([...legDestinations(shuttle!, 'G')].sort()).toEqual(['26', '51', '76', 'G'].sort());
    expect([...legDestinations(shuttle!, '2')].sort()).toEqual(['2', '27', '52', '77'].sort());
  });

  it('reaches an upper-deck zone from the street in three legs', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    expect(planner.route('G', '45')).toEqual(['G', '2', '27', '45']);
  });

  it('serves both low zones from the street entrance in one leg', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    expect(planner.legCount('G', '10')).toBe(1);
    expect(planner.legCount('G', '20')).toBe(1);
  });

  it('crosses between a lower- and an upper-anchored zone at its own sky lobby', () => {
    // Zone 3 hangs off sky lobby level 26 (lower deck) and zone 4 off level 27 (upper deck), so
    // an occupant of 40 reaching 34 has to change levels somewhere. **Where** has moved twice and
    // the count has come down each time:
    //
    // | configuration | legs | route |
    // |---|---|---|
    // | no transport mode at all (`d7e8571`) | 5 | 40 → 27 → 2 → G → 26 → 34 |
    // | ground escalator only (`DECISIONS.md` § D147 § 6, § D167) | 4 | the `2 → G` step became a hop |
    // | ground **and** sky-lobby escalators | **2** | 40 → 27 ⇢ 26 → 34, crossing at sky lobby A |
    //
    // The shuttle is out of this journey entirely now: a cross-lobby interfloor passenger no
    // longer rides 105 m down and 105 m back up to change decks.
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    expect(planner.legCount('40', '34')).toBe(2);
    const plan = planner.plan('40', '34');
    expect(plan?.transportHopCount).toBe(1);
    expect(plan?.floors).toEqual(['40', '27', '26', '34']);
    expect(plan?.segments[1]).toMatchObject({ kind: 'transport', modeId: 'sky-lobby-a-escalator' });
  });
});

describe('planner contract', () => {
  it('reaches every populated floor from every entrance of every shipped building', () => {
    const broken: string[] = [];
    for (const b of config.buildings) {
      const planner = RoutePlanner.forBuilding(b);
      const populated = b.floors.filter((floor) => floor.population > 0);
      for (const entrance of b.entranceFloors) {
        for (const floor of populated) {
          if (planner.route(entrance.id, floor.id) === undefined) {
            broken.push(`${b.id}: ${entrance.id} -> ${floor.id}`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('returns a contiguous route beginning at the origin and ending at the destination', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    const route = planner.route('80', '60');
    expect(route?.[0]).toBe('80');
    expect(route?.at(-1)).toBe('60');
    expect(new Set(route).size).toBe(route?.length);
  });

  it('treats a trip to the same floor as zero legs', () => {
    const planner = RoutePlanner.forBuilding(building('midtown-office'));
    expect(planner.route('12', '12')).toEqual(['12']);
    expect(planner.legCount('12', '12')).toBe(0);
  });

  it('returns undefined for an unknown floor rather than inventing a route', () => {
    const planner = RoutePlanner.forBuilding(building('midtown-office'));
    expect(planner.route('12', '999')).toBeUndefined();
    expect(planner.route('999', '12')).toBeUndefined();
  });

  it('throws an actionable error when asked to require an impossible route', () => {
    const planner = RoutePlanner.forBuilding(building('midtown-office'));
    expect(() => planner.requireRoute('12', '999', 4)).toThrow(/No chain of banks connects/);
    expect(() => planner.requireRoute('40', '34', 4)).toThrow(TrafficError);
  });

  it('rejects a route longer than the leg budget, counting lift legs and not hops', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    /*
     * **The longest route this building still needs is three lift legs**, and this test moved to
     * one because its old subject stopped being over any budget worth testing. `40 → 34` was four
     * lift legs and is now two, since sky lobby A gained an escalator — so a bound of three no
     * longer refuses anything and the guard would have passed while asserting nothing.
     *
     * `30 → 60` is zone 3 to zone 5: zone-3 local to 26, shuttle 26 → 51, zone-5 local to 60.
     * Three lift legs and no hop, because both levels of sky lobby B are served by the same
     * local and the escalator there is never on a shortest path (`transportRoute.test.ts`).
     */
    expect(planner.legCount('30', '60')).toBe(3);
    expect(() => planner.requireRoute('30', '60', 2)).toThrow(/needs 3 elevator legs/);
    expect(planner.requireRoute('30', '60', 3)).toHaveLength(4);
  });

  it('is stable: the same query returns the same route every time', () => {
    const planner = RoutePlanner.forBuilding(building('mixed-use-high-rise'));
    const first = planner.route('45', '20');
    for (let i = 0; i < 5; i += 1) expect(planner.route('45', '20')).toEqual(first);
  });
});
