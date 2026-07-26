/// <reference types="node" />

/**
 * Shared fixtures for the `reports/` tests.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`, so a helper named
 * this way is imported by tests and never collected as a suite — and cannot silently become one by
 * acquiring an `it()` block. Same convention as `core/src/sim/fixtures.test-helper.ts`.
 *
 * ## Two kinds of fixture, deliberately kept apart
 *
 * - **Real runs.** `runOne` drives the actual simulator against the real `data/` directory.
 *   Persistence, replay and re-analysis are claims about real records, and a hand-built record
 *   would prove that a hand-built record round-trips. Garden Apartments is the default because it
 *   is the cheapest building that produces a valid, non-saturated peak: ~30 legs and about a
 *   millisecond, so a test can afford a dozen replications.
 * - **Synthetic observations.** `observation` builds one `ReplicationObservation` from literals.
 *   The statistical claims — indistinguishability, suppression, convergence — have to be checked
 *   against numbers whose answers are known in advance, which a simulation cannot provide.
 */

import { fileURLToPath } from 'node:url';

import {
  loadConfig,
  runSimulation,
  type LoadedConfig,
  type SimulationConfig,
  type SimulationResult,
} from '@elevator-sim/core';

import { createStoredRun } from './persistence.js';
import type { ReplicationObservation, StoredRunRecord } from './types.js';

/** The repository's `data/` directory. */
export const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

export const load = (): Promise<LoadedConfig> => loadConfig(DATA_DIR);

/** The cheapest building that yields a valid, non-saturated peak. */
export const FAST_BUILDING_ID = 'garden-apartments';

export interface RunRequest {
  readonly buildingId?: string | undefined;
  readonly profileId?: string | undefined;
  readonly seed: number | bigint;
  readonly overrides?: Partial<SimulationConfig> | undefined;
}

/** A `SimulationConfig` against the real reference data. */
export function simulationConfig(config: LoadedConfig, request: RunRequest): SimulationConfig {
  const buildingId = request.buildingId ?? FAST_BUILDING_ID;
  const profileId = request.profileId ?? 'collective';
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  if (dispatcherProfile === undefined) throw new Error(`no dispatcher profile "${profileId}"`);
  return {
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: request.seed,
    // `report` rather than the default `throw`: a saturated fixture is a legitimate measurement
    // here, and the tests that use one are about how it is *reported*.
    onTimeout: 'report',
    ...request.overrides,
  };
}

export function runOne(config: LoadedConfig, request: RunRequest): SimulationResult {
  return runSimulation(simulationConfig(config, request));
}

export interface StoredRunRequest extends RunRequest {
  readonly experimentId?: string | undefined;
  readonly experimentSeed?: bigint | number | string | undefined;
  readonly replication?: number | undefined;
  readonly candidateId?: string | undefined;
}

/** Run, and envelope the result for storage. */
export function storedRun(config: LoadedConfig, request: StoredRunRequest): StoredRunRecord {
  const simConfig = simulationConfig(config, request);
  const result = runSimulation(simConfig);
  return createStoredRun({
    experimentId: request.experimentId ?? 'reports-fixture',
    experimentSeed: request.experimentSeed ?? 20260726,
    replication: request.replication ?? 0,
    ...(request.candidateId === undefined ? {} : { candidateId: request.candidateId }),
    config: simConfig,
    result,
  });
}

/* -------------------------------------------------------------------------- *
 * Synthetic observations
 * -------------------------------------------------------------------------- */

/**
 * One replication's headline numbers, from literals.
 *
 * Defaults describe an unremarkable valid replication; every field is overridable, including the
 * validity flags, so a test can construct the exact situation it is about.
 */
export function observation(
  seed: string | number,
  overrides: Partial<ReplicationObservation> = {},
): ReplicationObservation {
  const seedText = String(seed);
  return {
    runId: `run-${seedText}`,
    seed: seedText,
    windowSeconds: 300,
    arrivals: 120,
    served: 120,
    unserved: 0,
    awtS: 10,
    wt95S: 20,
    pctOverLongWait: 1,
    ttdS: 45,
    achievedIntervalS: 25,
    personsPer5Min: 60,
    saturated: false,
    awtIsValid: true,
    ...overrides,
  };
}

/**
 * A run of observations whose AWT values are given, one per replication.
 *
 * Seeds are `1..n` unless `seeds` says otherwise, so two series built the same way are paired by
 * construction — which is what a common-random-numbers comparison needs.
 */
export function observations(
  awtValues: readonly number[],
  overrides: Partial<ReplicationObservation> = {},
  seeds?: readonly (string | number)[],
): readonly ReplicationObservation[] {
  return awtValues.map((awtS, index) =>
    observation(seeds?.[index] ?? index + 1, { awtS, ...overrides }),
  );
}
