/**
 * Determinism, and the three separate things it means.
 *
 * docs/01-architecture.md § Determinism separates them because they are routinely conflated:
 *
 * | Kind | What this file asserts |
 * |---|---|
 * | **Stochastic model** — arrivals are random | different seeds produce genuinely different runs |
 * | **Reproducible input streams** — same seed, same passengers | the trace is a function of `(seed, config)` and of nothing the elevators do |
 * | **Deterministic execution** — no races | the same seed replays bit for bit, twenty times over |
 *
 * The second is the one with teeth. Common random numbers are worth 5–20x in required
 * replications (docs/03-traffic-and-statistics.md § Part 4), and they survive only if two
 * *different* dispatchers fed the same seed see the identical passenger population. A run that
 * drew a single number from `arrivals` would break that silently: the two runs would still each
 * be reproducible, and the comparison between them would quietly lose most of its power.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig } from '../config/types.js';

import { fingerprint, load, traceFingerprint, withCallType } from './fixtures.test-helper.js';
import { Simulation, runSimulation } from './simulation.js';
import type { SimulationConfig } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

function run(
  buildingId: string,
  profileId: string,
  seed: number,
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  if (dispatcherProfile === undefined) throw new Error(`no profile "${profileId}"`);
  return {
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    onTimeout: 'report',
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- *
 * Same seed, same run
 * -------------------------------------------------------------------------- */

describe('the same seed and config replay exactly', () => {
  // Twenty full replications of a 21-floor building, in one test: roughly 3 s of arithmetic on a
  // quiet machine and comfortably past vitest's 5 s default whenever the runner is saturated,
  // which it is — this file runs alongside 116 others. An explicit budget rather than the default
  // so a red here means *nondeterminism*, which is what the test is for, and never "the laptop was
  // busy". Nothing about the assertion is relaxed.
  it('is bit-identical across twenty runs of Midtown Office', () => {
    const expected = fingerprint(runSimulation(run('midtown-office', 'collective', 20260726)));
    for (let replication = 0; replication < 19; replication += 1) {
      expect(fingerprint(runSimulation(run('midtown-office', 'collective', 20260726)))).toBe(
        expected,
      );
    }
  }, 60_000);

  it('is bit-identical on a multi-bank building with sky-lobby transfers', () => {
    const profile = config.dispatcherProfilesById.get('eta');
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    const request = run('mixed-use-high-rise', 'eta', 7, {
      dispatcherProfile: withCallType(profile, 'mobile-credential'),
    });
    const expected = fingerprint(runSimulation(request));
    for (let replication = 0; replication < 4; replication += 1) {
      expect(fingerprint(runSimulation(request))).toBe(expected);
    }
  }, 60_000);

  it('is bit-identical when door obstructions are drawn from the stream', () => {
    const request = run('garden-apartments', 'nearest-car', 99, {
      doorObstructionProbability: 0.25,
    });
    const expected = fingerprint(runSimulation(request));
    for (let replication = 0; replication < 4; replication += 1) {
      expect(fingerprint(runSimulation(request))).toBe(expected);
    }
  }, 60_000);

  it('does not depend on how many simulations the process has already run', () => {
    // Ids are allocated from per-run counters, never module-level ones. A shared counter would
    // make a passenger's id depend on process history and two identical replications would
    // produce different records.
    const first = fingerprint(runSimulation(run('garden-apartments', 'nearest-car', 5)));
    runSimulation(run('midtown-office', 'eta', 6));
    runSimulation(run('secure-tower', 'collective', 7));
    const second = fingerprint(runSimulation(run('garden-apartments', 'nearest-car', 5)));
    expect(second).toBe(first);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Different seeds, different runs
 * -------------------------------------------------------------------------- */

describe('the model is genuinely stochastic', () => {
  it('produces different passengers and different results from different seeds', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const results = seeds.map((seed) => runSimulation(run('midtown-office', 'collective', seed)));

    const traces = new Set(results.map(traceFingerprint));
    expect(traces.size).toBe(seeds.length);

    const runs = new Set(results.map(fingerprint));
    expect(runs.size).toBe(seeds.length);

    // Individual-run AWT varies by a factor of nearly two even at a thousand replications
    // (Peters & Abbi). Distinct means is the weak form of that, and it is what makes a single
    // run an arbitrary scenario rather than an answer.
    const means = new Set(results.map((result) => result.summary.waiting.meanS));
    expect(means.size).toBeGreaterThan(1);
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * Common random numbers
 * -------------------------------------------------------------------------- */

describe('common random numbers survive a change of dispatcher', () => {
  it('gives every dispatcher the identical passenger population for a seed', () => {
    const baseline = runSimulation(run('midtown-office', 'nearest-car', 31337));
    const expected = traceFingerprint(baseline);

    for (const profile of config.dispatcherProfiles.profiles) {
      const result = runSimulation(run('midtown-office', profile.id, 31337));
      // Same people, same arrival times, same masses, same destinations — however differently
      // the cars behaved. This is the paired-comparison precondition.
      expect(traceFingerprint(result)).toBe(expected);
      expect(result.trace.passengerCount).toBe(baseline.trace.passengerCount);
      expect(result.record.seed).toBe(baseline.record.seed);
    }
  }, 120_000);

  it('gives the identical population to a profile that behaves completely differently', () => {
    const profile = config.dispatcherProfilesById.get('eta');
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    const conventional = runSimulation(run('secure-tower', 'eta', 11));
    const credentialed = runSimulation(
      run('secure-tower', 'eta', 11, {
        dispatcherProfile: withCallType(profile, 'mobile-credential'),
      }),
    );

    // One of these delivers everybody and the other cannot collect half the building, so their
    // event sequences share almost nothing. The passengers are still the same passengers.
    expect(traceFingerprint(credentialed)).toBe(traceFingerprint(conventional));
    expect(fingerprint(credentialed)).not.toBe(fingerprint(conventional));
  }, 60_000);

  it('leaves the input streams exactly where trace generation left them', () => {
    const profile = config.dispatcherProfilesById.get('predictive-balanced');
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    for (const dispatcherProfile of [
      config.dispatcherProfilesById.get('nearest-car') as DispatcherProfile,
      profile,
    ]) {
      const simulation = new Simulation(run('midtown-office', 'eta', 4242, { dispatcherProfile }));
      const before = simulation.streams.snapshot();
      simulation.run();
      expect(simulation.streams.snapshot()).toEqual(before);
    }
  }, 60_000);
});
