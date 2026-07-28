/**
 * Shared fixtures for the `viz` tests.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`, so a helper
 * named this way is imported by tests but never collected as a suite of its own.
 *
 * The real `data/` directory is loaded rather than mocked, for the reason `core`'s own fixtures
 * give: the claim under test is that the viewer renders the buildings the project ships, and a
 * fixture building would prove that a fixture building renders.
 */

import { fileURLToPath } from 'node:url';

import {
  loadConfig,
  resolveDoorConfig,
  type DispatcherProfile,
  type DoorConfig,
  type LoadedConfig,
  type ResolvedBuilding,
  type SimulationConfig,
} from '@elevator-sim/core';

/**
 * Door timings for the synthetic buildings the unit tests draw.
 *
 * Built through `resolveDoorConfig` rather than written out as a literal, so a new field on
 * `DoorConfig` cannot leave the fixtures describing a door the physics module no longer
 * recognises — the fixture would simply pick up the default.
 */
export const FIXTURE_DOOR_CONFIG: DoorConfig = resolveDoorConfig({
  doorOpenS: 2,
  doorCloseS: 3,
  dwellCarCallS: 3,
  dwellHallCallS: 5,
});

/** The repository's `data/` directory. */
export const DATA_DIR = fileURLToPath(new URL('../../../data', import.meta.url));

export const loadResources = (): Promise<LoadedConfig> => loadConfig(DATA_DIR);

/**
 * The smallest shipped building, so a suite that runs several replications stays quick.
 *
 * Garden Apartments: a handful of floors and two cars, which is enough to exercise every part
 * of the contract (two shafts, both directions of landing call, doors, occupancy) without
 * paying for a tower.
 */
export const FIXTURE_BUILDING_ID = 'garden-apartments';
export const FIXTURE_DISPATCHER_ID = 'eta';

/** A short horizon. Long enough that cars move and queues form; short enough to run in a test. */
export const FIXTURE_DURATION_S = 600;

/** A fixed seed, so every assertion in the suite is about the same run. */
export const FIXTURE_SEED = 20_260_727n;

export interface FixtureOptions {
  readonly seed?: bigint;
  readonly buildingId?: string;
  readonly dispatcherId?: string;
  readonly durationS?: number;
}

export function requireBuilding(config: LoadedConfig, id: string): ResolvedBuilding {
  const building = config.buildingsById.get(id);
  if (building === undefined) {
    throw new Error(`fixture building "${id}" is missing from ${DATA_DIR}.`);
  }
  return building;
}

export function requireDispatcher(config: LoadedConfig, id: string): DispatcherProfile {
  const profile = config.dispatcherProfilesById.get(id);
  if (profile === undefined) {
    throw new Error(`fixture dispatcher "${id}" is missing from ${DATA_DIR}.`);
  }
  return profile;
}

/**
 * A complete `SimulationConfig` over the shipped data.
 *
 * Every field a run needs is here, so a caller can vary the seed alone and know that nothing
 * else moved — which is what the replay negative control depends on.
 */
export function fixtureConfig(config: LoadedConfig, options: FixtureOptions = {}): SimulationConfig {
  return {
    building: requireBuilding(config, options.buildingId ?? FIXTURE_BUILDING_ID),
    dispatcherProfile: requireDispatcher(config, options.dispatcherId ?? FIXTURE_DISPATCHER_ID),
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: options.seed ?? FIXTURE_SEED,
    durationS: options.durationS ?? FIXTURE_DURATION_S,
    runId: 'viz-fixture',
  };
}
