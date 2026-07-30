/**
 * The run builder, and the three state transitions that had defects in them.
 *
 * `shiftRunConfigOf` is the single answer to *what is the simulator being asked for*, which is why
 * it is a function and not a click handler: everything below needs a `BrowserResources` and a
 * `ViewerState` and nothing below needs a document.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { specFromBuilding } from '../authoring/buildingSpec.js';
import { recordRun } from '../record/recordRun.js';
import { contractForBuilding } from '../shift/contracts.js';

import type { BrowserResources } from './data.js';
import { initialState, shiftRunConfigOf, withBuilding, type ViewerState } from './state.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const BUILDING_IDS = [
  'garden-apartments',
  'midtown-office',
  'secure-tower',
  'mixed-use-high-rise',
  'vertical-city',
] as const;

function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = BUILDING_IDS.map((id) => {
    const config = parseBuilding(read(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

const resources = resourcesOf();
const base = (): ViewerState => initialState(resources, 20260730n);

describe('the run builder', () => {
  it('builds a runnable configuration for every shipped building', () => {
    for (const buildingId of BUILDING_IDS) {
      const plan = shiftRunConfigOf(resources, { ...base(), buildingId, shiftLengthS: 300 });
      expect(() => recordRun(plan.config, { recordDecisions: false })).not.toThrow();
    }
  }, 300_000);

  it('grows the building with the day, and the growth reaches the simulation', () => {
    /*
     * The whole point of putting growth in `BuildingConfig` rather than in a caption. A day-20
     * shift must move more people than a day-1 shift on the same building and the same seed —
     * otherwise the tenants moved in on the header and nowhere else.
     */
    const day1 = shiftRunConfigOf(resources, { ...base(), shiftLengthS: 300 });
    const later = base();
    const day20 = shiftRunConfigOf(resources, {
      ...later,
      shiftLengthS: 300,
      week: { ...later.week, day: 20 },
    });
    const population = (plan: typeof day1): number =>
      plan.building.floors.reduce((total, floor) => total + floor.population, 0);
    expect(population(day20)).toBeGreaterThan(population(day1));
  });

  it('hands the run no demand override under the building’s own demand', () => {
    // The comparable case: every published figure was measured with the building's own profile,
    // so *the building's own demand* must be expressed by overriding nothing.
    const plan = shiftRunConfigOf(resources, { ...base(), pattern: 'building' });
    expect(plan.config.demand).toStrictEqual({});
  });

  it('carries the day’s event into the run and says what it withheld', () => {
    const state = base();
    const plan = shiftRunConfigOf(resources, state);
    expect(plan.event.id).toBeDefined();
    // `withheld` is a list, never a thrown error and never silence.
    expect(Array.isArray(plan.withheld)).toBe(true);
  });
});

describe('withBuilding', () => {
  it('takes the scenario the building belongs to', () => {
    /*
     * Picking Midtown Office while the week sat on Scenario 1 produced a sheet headed *Midtown
     * Office* and footed *Scenario 1 — Learn the ropes*, banking a Garden Apartments shift against
     * a run that never touched it.
     */
    const next = withBuilding(base(), resources, 'midtown-office');
    expect(next.week.contractId).toBe(contractForBuilding('midtown-office')?.id);
    expect(next.buildingId).toBe('midtown-office');
  });

  it('leaves the week alone for a building the reader drew', () => {
    const state = base();
    const drawn: ViewerState = {
      ...state,
      savedBuildings: [
        { id: 'bld-1', config: { ...parseBuilding(read('buildings/garden-apartments.json')), id: 'bld-1' } },
      ],
    };
    const next = withBuilding(drawn, resources, 'bld-1');
    expect(next.week.contractId).toBe(state.week.contractId);
  });

  it('re-seeds the editor’s working copy while it is untouched', () => {
    const next = withBuilding(base(), resources, 'secure-tower');
    expect(next.editingBuildingId).toBe('secure-tower');
    expect(next.buildingSpec.name).toBe('Secure Tower');
  });

  it('keeps an edited working copy, because losing it is worse than showing the wrong one', () => {
    const state = base();
    const edited: ViewerState = {
      ...state,
      buildingSpec: { ...state.buildingSpec, floors: state.buildingSpec.floors + 7 },
    };
    const next = withBuilding(edited, resources, 'secure-tower');
    expect(next.buildingId).toBe('secure-tower');
    expect(next.editingBuildingId).toBe(state.editingBuildingId);
    expect(next.buildingSpec).toStrictEqual(edited.buildingSpec);
  });

  it('is pure — the state it is handed is never written to', () => {
    const state = Object.freeze(base());
    expect(() => withBuilding(state, resources, 'vertical-city')).not.toThrow();
    expect(state.buildingId).not.toBe('vertical-city');
  });
});

describe('the initial state', () => {
  it('opens on collective rather than nearest-car — § D134', () => {
    /*
     * Not cosmetic. `nearest-car` is on the Pareto front at six of eight matrix cells *because it
     * is best on energy and worst on wait*, so opening on it shows a reader the weakest shipped
     * dispatcher and calls it the default.
     */
    expect(base().dispatcherId).toBe('collective');
  });

  it('opens on the first scenario’s building, with its week open', () => {
    const state = base();
    expect(state.buildingId).toBe('garden-apartments');
    expect(state.week.contractId).toBe(contractForBuilding('garden-apartments')?.id);
  });

  it('seeds the building editor from the building it opens on', () => {
    const state = base();
    const config = resources.entries.find((entry) => entry.config.id === state.buildingId)?.config;
    expect(config).toBeDefined();
    if (config === undefined) return;
    expect(state.buildingSpec).toStrictEqual(specFromBuilding(config, state.buildingId));
  });
});
