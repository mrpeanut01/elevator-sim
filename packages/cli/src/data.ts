/**
 * Finding, loading and resolving `data/`.
 *
 * Every lookup failure here becomes a {@link UsageError} that lists what *is* available, because
 * the whole point of the CLI is discovery: a typo should teach you the vocabulary rather than
 * print a stack.
 */

import { fileURLToPath } from 'node:url';

import {
  ConfigError,
  formatConfigIssues,
  loadConfig,
  type DispatcherProfile,
  type LoadedConfig,
  type ResolvedBuilding,
  type TrafficProfile,
} from '@elevator-sim/core';

import { UsageError, didYouMean } from './errors.js';

/**
 * `<repo>/data`, resolved relative to this module.
 *
 * Three directories up from `packages/cli/{src,dist}/` is the repository root under both the
 * compiled layout and the source layout vitest runs against, so the default works without a
 * build step and without an environment variable.
 */
export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../../../data', import.meta.url));

/** `--data`, then `ELEVATOR_SIM_DATA`, then the repository's own `data/`. */
export function resolveDataDir(
  flag: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return flag ?? env['ELEVATOR_SIM_DATA'] ?? DEFAULT_DATA_DIR;
}

/** Load and validate a data directory, turning a `ConfigError` into a readable usage error. */
export async function loadData(dataDir: string): Promise<LoadedConfig> {
  try {
    return await loadConfig(dataDir);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new UsageError(
        `could not load the data directory "${dataDir}".`,
        formatConfigIssues(error.issues).split('\n'),
      );
    }
    throw new UsageError(
      `could not read the data directory "${dataDir}": ${error instanceof Error ? error.message : String(error)}`,
      ['pass --data <dir> to point at a different one'],
    );
  }
}

function pick<T>(
  id: string,
  index: ReadonlyMap<string, T>,
  what: string,
  flag: string,
): T {
  const found = index.get(id);
  if (found !== undefined) return found;
  const known = [...index.keys()];
  const suggestion = didYouMean(id, known);
  throw new UsageError(`no ${what} with id "${id}" (${flag}).`, [
    `available: ${known.join(', ')}`,
    ...(suggestion === undefined ? [] : [`did you mean "${suggestion}"?`]),
    'run `elevator-sim list` to see everything with its details',
  ]);
}

export function requireBuilding(config: LoadedConfig, id: string): ResolvedBuilding {
  return pick(id, config.buildingsById, 'building', '--building');
}

export function requireDispatcher(
  config: LoadedConfig,
  id: string,
  flag: string,
): DispatcherProfile {
  return pick(id, config.dispatcherProfilesById, 'dispatcher profile', flag);
}

export function requireTrafficProfile(config: LoadedConfig, id: string): TrafficProfile {
  return pick(id, config.trafficProfilesById, 'traffic profile', '--traffic');
}

/**
 * The building, with its traffic profile swapped.
 *
 * The demand generator reads `ResolvedBuilding.trafficProfile` (and any per-floor override), so
 * `--traffic` is expressed as a derived building rather than as a simulation option. Per-floor
 * overrides are deliberately left alone: in a mixed-use tower the residential floors are
 * residential whatever the building-level profile says, and flattening that would silently
 * change what is being simulated.
 */
export function withTrafficProfile(
  building: ResolvedBuilding,
  trafficProfileId: string,
): ResolvedBuilding {
  if (building.trafficProfile === trafficProfileId) return building;
  return {
    ...building,
    trafficProfile: trafficProfileId,
    config: { ...building.config, trafficProfile: trafficProfileId },
  };
}

/**
 * A seed for a run the user did not pin.
 *
 * Wall-clock entropy is allowed in this package and forbidden in `core/`. The seed is *always*
 * printed (CLAUDE.md invariant 5 expressed in the UI), so an interesting accidental run can be
 * replayed exactly by pasting it back with `--seed`.
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Total cars across every bank. */
export function carCount(building: ResolvedBuilding): number {
  return building.banks.reduce((total, bank) => total + bank.cars.length, 0);
}
