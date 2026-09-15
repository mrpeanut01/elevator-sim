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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../config/loader.js';
import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { CallType, DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';

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
 * A shipped building re-authored with `landingCallType` declared on the named floors — GitHub
 * issue #437 stage 1, `DECISIONS.md` § D553.
 *
 * Re-authored through `parseBuilding` and `resolveBuilding` exactly as `loadConfig` calls them,
 * with the shipped file path, so even `ResolvedBuilding.source` is the shipped one and a building
 * that declares nothing comes back byte-identical to the shipped one
 * (`sim/landingPanels.test.ts` AC1 holds that). The alternative — mutating a `ResolvedBuilding` —
 * would build a configuration no loader would accept and prove nothing about the shipped path.
 *
 * Moved here from `sim/landingPanels.test.ts`, where it was a file-local helper, when a second,
 * third and fourth suite needed it (GitHub issue #534). Kept as one copy on the rule
 * `fuzz/generate.ts` states for the generator: a helper restated per file is a helper that drifts
 * per file.
 *
 * @throws Error if `declared` names a floor the building's file does not author explicitly.
 */
export function reauthoredWithLandings(
  config: LoadedConfig,
  buildingId: string,
  declared: Readonly<Record<string, CallType>> = {},
): ResolvedBuilding {
  const file = join(DATA_DIR, 'buildings', `${buildingId}.json`);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { floors?: Record<string, unknown>[] };
  const seen = new Set<string>();
  const floors = (raw.floors ?? []).map((floor) => {
    const id = String(floor['id']);
    const landingCallType = declared[id];
    if (landingCallType === undefined) return floor;
    seen.add(id);
    return { ...floor, landingCallType };
  });
  const missing = Object.keys(declared).filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(`${buildingId} authors no explicit floor ${missing.join(', ')}`);
  }
  return resolveBuilding(parseBuilding({ ...raw, floors }, file), config.elevatorSpecs, {
    file,
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

/**
 * A shipped building re-authored with one `landingCallType` on **every** landing it authors.
 *
 * Both halves of the authored geometry are stamped, and that is the whole reason this is a second
 * function rather than an argument to {@link reauthoredWithLandings}: four of the nine shipped
 * buildings author some of their floors as a `floorRanges` entry, and `expandFloors` copies a
 * range's `landingCallType` to every floor it expands to (`DECISIONS.md` § D553 clause 1). A helper
 * that stamped only `floors[]` would silently leave twenty-five landings undeclared on
 * `mixed-use-high-rise` and call the result *"every landing"*.
 *
 * Used to measure § D553 clause 7's identity claim — declaring the dispatcher's own call type on
 * every landing changes nothing, byte for byte — over whole buildings rather than one.
 */
export function reauthoredWithLandingCallTypeEverywhere(
  config: LoadedConfig,
  buildingId: string,
  landingCallType: CallType,
): ResolvedBuilding {
  const file = join(DATA_DIR, 'buildings', `${buildingId}.json`);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    floors?: Record<string, unknown>[];
    floorRanges?: Record<string, unknown>[];
  };
  const stamp = (entries: Record<string, unknown>[] | undefined): Record<string, unknown>[] | undefined =>
    entries?.map((entry) => ({ ...entry, landingCallType }));
  const floorRanges = stamp(raw.floorRanges);
  const authored = {
    ...raw,
    floors: stamp(raw.floors) ?? [],
    ...(floorRanges === undefined ? {} : { floorRanges }),
  };
  return resolveBuilding(parseBuilding(authored, file), config.elevatorSpecs, {
    file,
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
