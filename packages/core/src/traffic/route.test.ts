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

  it('needs five legs to cross between a lower-anchored and an upper-anchored zone', () => {
    // Zone 3 hangs off sky lobby level 26 (lower deck) and zone 4 off level 27 (upper deck),
    // so an occupant of 40 reaching 34 goes all the way down and back up. This is geometry,
    // not a bug, and it is why the generator's default maxLegs is 6 rather than 3.
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    expect(planner.legCount('40', '34')).toBe(5);
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

  it('rejects a route longer than the leg budget', () => {
    const planner = RoutePlanner.forBuilding(building('vertical-city'));
    expect(() => planner.requireRoute('40', '34', 4)).toThrow(/needs 5 elevator legs/);
    expect(planner.requireRoute('40', '34', 6)).toHaveLength(6);
  });

  it('is stable: the same query returns the same route every time', () => {
    const planner = RoutePlanner.forBuilding(building('mixed-use-high-rise'));
    const first = planner.route('45', '20');
    for (let i = 0; i < 5; i += 1) expect(planner.route('45', '20')).toEqual(first);
  });
});
