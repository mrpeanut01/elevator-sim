/**
 * Shared fixtures for the `sim/` tests.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`, so a helper
 * named this way is imported by tests but never collected as a suite of its own — and cannot
 * silently become one by acquiring an `it()` block.
 *
 * The real `data/` directory is loaded once per test file rather than mocked. Phase 2's whole
 * claim is that the simulator runs the buildings the project actually ships; a fixture building
 * would prove that a fixture building runs.
 */

import { fileURLToPath } from 'node:url';

import { loadConfig } from '../config/loader.js';
import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';

import type { SimulationResult } from './types.js';

/** The repository's `data/` directory. */
export const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

export const load = (): Promise<LoadedConfig> => loadConfig(DATA_DIR);

/** Every building the project ships, in load order. */
export const BUILDING_IDS = [
  'garden-apartments',
  'midtown-office',
  'mixed-use-high-rise',
  'secure-tower',
  'vertical-city',
] as const;

/**
 * A profile with `dispatch.callType` overridden.
 *
 * Used to reach the access-restricted landings of Secure Tower, Mixed-Use High-Rise and
 * Vertical City: under `up-down-buttons` a landing call carries no credential, so
 * `Car.estimateCost` reports `accessDenied` for every car in the bank and the call is
 * unassignable. Moving authorization to call time is a **config change and nothing else**,
 * which is the point (CLAUDE.md invariant 7).
 */
export function withCallType(
  profile: DispatcherProfile,
  callType: 'up-down-buttons' | 'destination-entry' | 'mobile-credential',
): DispatcherProfile {
  return { ...profile, dispatch: { ...profile.dispatch, callType } };
}

/** A profile with a parking strategy overridden. */
export function withParking(
  profile: DispatcherProfile,
  parkingStrategy: 'stay' | 'lobby' | 'zone-center' | 'predicted-demand',
): DispatcherProfile {
  return { ...profile, idle: { ...profile.idle, parkingStrategy } };
}

/**
 * A deliberately tiny building: three floors, **one** car, one small bank.
 *
 * The capacity test needs a landing queue that provably exceeds one carload, and needs the
 * overflow to be attributable to capacity rather than to allocation. With a single car there
 * is no allocation: whatever is left on the landing was left there because the car was full.
 */
export function tinyBuilding(config: LoadedConfig, ratedLoadLb = 1000): ResolvedBuilding {
  const authored = {
    id: 'one-car-walkup',
    name: 'One-car walkup',
    type: 'residential',
    trafficProfile: 'residential',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: '2', index: 2, heightM: 3, population: 60 },
      { id: '3', index: 3, heightM: 6, population: 60 },
    ],
    totalPopulation: 120,
    banks: [
      {
        id: 'main',
        servesFloors: ['G', '2', '3'],
        cars: [{ id: 'A', spec: 'hydraulic', ratedSpeedMps: 0.63, ratedLoadLb, doorType: 'sideOpening' }],
      },
    ],
    accessZones: [],
  };
  return resolveBuilding(parseBuilding(authored, 'one-car-walkup.json'), config.elevatorSpecs, {
    file: 'one-car-walkup.json',
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

/**
 * A structural fingerprint of a run.
 *
 * Everything a caller could act on, and nothing that is merely an object identity: two runs
 * that agree here agree on every recorded event, every derived statistic and every unfinished
 * journey. `JSON.stringify` is the comparison rather than a deep-equal because it also pins
 * **key order**, which catches a record assembled by iterating a differently-ordered map.
 */
export function fingerprint(result: SimulationResult): string {
  return JSON.stringify({
    status: result.status,
    seed: result.seed,
    endedAt: result.endedAt,
    events: result.events,
    record: result.record,
    summary: result.summary,
    conservation: result.conservation,
    undelivered: result.undelivered,
    warnings: result.warnings,
  });
}

/** Just the passenger population, for checking that the elevators cannot perturb it. */
export function traceFingerprint(result: SimulationResult): string {
  return JSON.stringify(result.trace.passengers);
}
