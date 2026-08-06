/**
 * Replay — docs/05-roadmap.md § Phase 3 acceptance: "Any stored run replays to identical results
 * from its seed."
 *
 * End to end against the real simulator and the real `data/` directory, because the criterion is
 * about the real simulator. A mocked one would only demonstrate that the mock is deterministic.
 *
 * Note what these tests are *jointly* checking. Identity depends on the simulator being
 * deterministic (CLAUDE.md invariants 2, 3, 4) **and** on the stored configuration being complete:
 * every knob that changes the outcome has to be in the record, or the replay runs a subtly different
 * experiment. The `transferWalkS`/`queueSampleCount` case below is the one that fails when a knob is
 * forgotten, and it is here for that reason rather than for coverage.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { runSimulation, type LoadedConfig } from '@elevator-sim/core';

import { load, runOne, simulationConfig, storedRun } from './fixtures.test-helper.js';
import { createStoredRun, parseStoredRun, runRecordFingerprint, serializeStoredRun } from './persistence.js';
import {
  assertIdenticalReplay,
  replaySimulationConfig,
  replaySourcesFrom,
  replayStoredRun,
  type ReplaySources,
} from './replay.js';
import { ReportsError } from './types.js';

let config: LoadedConfig;
let sources: ReplaySources;

beforeAll(async () => {
  config = await load();
  sources = replaySourcesFrom(config);
});

/* -------------------------------------------------------------------------- *
 * The acceptance criterion
 * -------------------------------------------------------------------------- */

describe('a stored run replays to an identical result', () => {
  it('replays byte for byte after a trip through JSON', () => {
    const stored = parseStoredRun(serializeStoredRun(storedRun(config, { seed: 20260726 })));
    const outcome = replayStoredRun(stored, sources);

    expect(outcome.identical).toBe(true);
    expect(outcome.differences).toEqual([]);
    expect(outcome.replayedFingerprint).toBe(outcome.storedFingerprint);
    expect(outcome.summaryMatches).toBe(true);
    // Not just the fingerprint: the whole per-passenger dataset.
    expect(outcome.result.record.passengers).toEqual(stored.record.passengers);
    expect(outcome.result.record.loadSamples).toEqual(stored.record.loadSamples);
    expect(outcome.result.record.queueSamples).toEqual(stored.record.queueSamples);
    expect(outcome.result.runId).toBe(stored.record.runId);
  });

  it('replays a 64-bit seed that only survives as a decimal string', () => {
    const seed = 18_446_744_073_709_551_557n; // < 2^64, far above 2^53
    const stored = parseStoredRun(serializeStoredRun(storedRun(config, { seed })));
    expect(stored.config.seed).toBe(seed.toString());
    expect(assertIdenticalReplay(stored, sources).record.seed).toBe(seed.toString());
  });

  it('replays every shipped building it can run, not just the cheap one', () => {
    // Midtown Office is the acceptance building and saturates at its own default demand, which is
    // exactly the kind of run whose *replayability* matters most: it is the run somebody will want
    // to re-examine.
    for (const buildingId of ['garden-apartments', 'midtown-office']) {
      const stored = parseStoredRun(
        serializeStoredRun(storedRun(config, { seed: 31, buildingId })),
      );
      const outcome = replayStoredRun(stored, sources);
      expect(outcome.identical, `${buildingId} did not replay identically`).toBe(true);
    }
  });

  it('replays a run whose runner tunables were overridden', () => {
    // The case that catches an incomplete stored configuration. If `transferWalkS` or
    // `queueSampleCount` were not persisted, this run would replay deterministically to a
    // *different* record.
    const stored = parseStoredRun(
      serializeStoredRun(
        storedRun(config, {
          seed: 55,
          buildingId: 'mixed-use-high-rise',
          profileId: 'eta',
          overrides: {
            transferWalkS: 25,
            queueSampleCount: 17,
            dispatchRetryS: 3,
            doorObstructionProbability: 0.25,
          },
        }),
      ),
    );
    expect(stored.config.sim?.transferWalkS).toBe(25);
    expect(stored.config.sim?.doorObstructionProbability).toBe(0.25);
    expect(replayStoredRun(stored, sources).identical).toBe(true);
  });

  it('replays a run whose dispatcher weights were overridden', () => {
    // A tuned weight vector is the whole output of Phase 7. A record that stored only the profile
    // id would replay the *un-tuned* dispatcher and agree with nothing.
    const stored = parseStoredRun(
      serializeStoredRun(
        storedRun(config, {
          seed: 56,
          overrides: {
            dispatcherOptions: {
              weights: { waitTime: 0.25, distanceTravelled: 0.75 },
              eligibility: { allowOppositeDirectionPickup: true },
              normalization: { waitTimeS: 45 },
            },
          },
        }),
      ),
    );
    expect(stored.config.dispatcherOptions?.weights).toEqual({
      waitTime: 0.25,
      distanceTravelled: 0.75,
    });
    expect(replayStoredRun(stored, sources).identical).toBe(true);
  });

  it('replays a run whose demand options were overridden', () => {
    const stored = parseStoredRun(
      serializeStoredRun(
        storedRun(config, {
          seed: 57,
          buildingId: 'midtown-office',
          overrides: {
            durationS: 600,
            demand: {
              arrivalRatePctPop5min: 8,
              directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
              entranceWeights: { G: 1, P1: 0 },
              batchSharesDestination: true,
            },
          },
        }),
      ),
    );
    expect(stored.config.durationS).toBe(600);
    expect(stored.config.demand?.arrivalRatePctPop5min).toBe(8);
    expect(replayStoredRun(stored, sources).identical).toBe(true);
  });

  it('replays a caller-supplied run id and metadata', () => {
    const simConfig = simulationConfig(config, {
      seed: 58,
      overrides: { runId: 'sweep-0007', metadata: { candidate: 'w-0.25', round: 3 } },
    });
    const stored = parseStoredRun(
      serializeStoredRun(
        createStoredRun({
          experimentId: 'weights',
          experimentSeed: 9,
          replication: 7,
          config: simConfig,
          result: runSimulation(simConfig),
        }),
      ),
    );
    expect(stored.config.runId).toBe('sweep-0007');
    expect(stored.record.metadata).toEqual({ candidate: 'w-0.25', round: 3 });
    const replayed = assertIdenticalReplay(stored, sources);
    expect(replayed.runId).toBe('sweep-0007');
    expect(replayed.record.metadata).toEqual({ candidate: 'w-0.25', round: 3 });
  }, 60_000);

  it('stores and replays a run whose riders gave up', () => {
    /*
     * Invariant 5 for the one feature that had never been round-tripped.
     *
     * `passengerRecordSchema` is a `strictObject` and did not declare `abandonedAt`, while the
     * recorder has emitted it for every abandoning leg since patience shipped. So **any** run
     * declaring `patience` threw `Unrecognized key: "abandonedAt"` on parse and could not be stored
     * or replayed. Nothing caught it because no shipped configuration declares patience, so no
     * golden run and no case in this file had ever written one — the gap was in the fixtures, not
     * in the assertions.
     *
     * The configuration is chosen to make riders actually leave rather than to be quick: at the
     * fast fixture building nobody waits long enough, and a case that abandons nobody would pass
     * against the very schema that refuses this key. `abandoned > 0` is asserted first for exactly
     * that reason — it is the non-vacuity guard, not decoration.
     */
    const stored = parseStoredRun(
      serializeStoredRun(
        storedRun(config, {
          seed: 20260726,
          buildingId: 'midtown-office',
          overrides: {
            durationS: 1800,
            demand: { arrivalRatePctPop5min: 6 },
            patience: { meanS: 120, distribution: 'exponential' as const },
          },
        }),
      ),
    );

    const abandoned = stored.record.passengers.filter((leg) => leg.abandonedAt !== undefined);
    expect(abandoned.length).toBeGreaterThan(0);
    // The value survives, not merely the key: a schema that stripped it would still parse.
    for (const leg of abandoned) expect(leg.abandonedAt).toBeGreaterThan(0);

    expect(assertIdenticalReplay(stored, sources).record.passengers).toEqual(
      stored.record.passengers,
    );
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Divergence is reported, not hidden
 * -------------------------------------------------------------------------- */

describe('a replay that does not reproduce its record says so', () => {
  it('reports the difference rather than throwing', () => {
    const stored = storedRun(config, { seed: 61 });
    const first = stored.record.passengers[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    // A record that claims a passenger boarded one second earlier than they did. The simulator is
    // fine; the *record* is not, and the replay has to notice.
    const tampered = {
      ...stored,
      record: {
        ...stored.record,
        passengers: [
          { ...first, boardedAt: (first.boardedAt ?? 0) + 1 },
          ...stored.record.passengers.slice(1),
        ],
      },
    };

    const outcome = replayStoredRun(tampered, sources);
    expect(outcome.identical).toBe(false);
    expect(outcome.differences.length).toBeGreaterThan(0);
    expect(outcome.differences[0]).toMatch(/passengers\[0\]/);

    // And the two checks are independent, which is the point of having both. The tamper hit the
    // *dataset*, so the record comparison catches it; the stored summary digest was computed from
    // the untampered summary and still matches what the replay derives, because the derivation has
    // not changed. A digest mismatch means something else entirely — see `reanalyze.test.ts`.
    expect(outcome.summaryMatches).toBe(true);
  });

  it('throws from the assertion form, naming the seed and the fingerprints', () => {
    const stored = storedRun(config, { seed: 62 });
    const tampered = {
      ...stored,
      record: { ...stored.record, endedAt: stored.record.endedAt + 10 },
    };
    expect(() => assertIdenticalReplay(tampered, sources)).toThrow(ReportsError);
    expect(() => assertIdenticalReplay(tampered, sources)).toThrow(
      /did not replay identically from seed 62/,
    );
    expect(() => assertIdenticalReplay(tampered, sources)).toThrow(/endedAt: stored/);
  });

  it('truncates a wholesale divergence to a readable list', () => {
    const stored = storedRun(config, { seed: 63 });
    const tampered = {
      ...stored,
      record: {
        ...stored.record,
        passengers: stored.record.passengers.map((passenger) => ({
          ...passenger,
          arrivedAt: passenger.arrivedAt + 1,
        })),
      },
    };
    const outcome = replayStoredRun(tampered, sources, { maxDifferences: 3 });
    expect(outcome.identical).toBe(false);
    expect(outcome.differences.length).toBeLessThanOrEqual(4); // 3 plus the "… and N more" line
  });
});

/* -------------------------------------------------------------------------- *
 * Refusing to replay against the wrong thing
 * -------------------------------------------------------------------------- */

describe('replay refuses a substitute configuration', () => {
  it('refuses a missing building rather than picking one', () => {
    const stored = storedRun(config, { seed: 71 });
    const withoutBuildings: ReplaySources = {
      buildingsById: new Map(),
      dispatcherProfilesById: sources.dispatcherProfilesById,
      trafficProfiles: sources.trafficProfiles,
    };
    expect(() => replaySimulationConfig(stored, withoutBuildings)).toThrow(
      /building "garden-apartments" is not in the supplied config/,
    );
  });

  it('refuses a missing dispatcher profile', () => {
    const stored = storedRun(config, { seed: 72 });
    const withoutProfiles: ReplaySources = {
      buildingsById: sources.buildingsById,
      dispatcherProfilesById: new Map(),
      trafficProfiles: sources.trafficProfiles,
    };
    expect(() => replaySimulationConfig(stored, withoutProfiles)).toThrow(
      /dispatcher profile "collective" is not in the supplied config/,
    );
  });

  it('refuses to silently fall back to the default load sensor', () => {
    const stored = storedRun(config, { seed: 73 });
    expect(stored.config.usesElevatorSpecs).toBe(true);
    const withoutSpecs: ReplaySources = {
      buildingsById: sources.buildingsById,
      dispatcherProfilesById: sources.dispatcherProfilesById,
      trafficProfiles: sources.trafficProfiles,
    };
    expect(() => replaySimulationConfig(stored, withoutSpecs)).toThrow(
      /LOAD_SENSOR_DEFAULTS, which is a different configuration/,
    );
  });

  it('refuses a building whose traffic profile has changed under the stored result', () => {
    const stored = storedRun(config, { seed: 74 });
    const building = config.buildingsById.get('garden-apartments');
    expect(building).toBeDefined();
    if (building === undefined) return;

    const edited: ReplaySources = {
      ...sources,
      buildingsById: new Map([
        ['garden-apartments', { ...building, trafficProfile: 'office-standard' }],
      ]),
    };
    expect(() => replaySimulationConfig(stored, edited)).toThrow(
      /data\/ has changed under the stored result/,
    );
  });

  it('honours a stored timeout policy so reading an archive is not an error', () => {
    // A saturated run is a legitimate stored measurement. Replaying it under core's default
    // `throw` would make the archive unreadable.
    const stored = storedRun(config, {
      seed: 75,
      buildingId: 'midtown-office',
    });
    expect(stored.config.sim?.onTimeout).toBe('report');
    expect(replaySimulationConfig(stored, sources).onTimeout).toBe('report');
  });

  it('reproduces a record whose replication index was never supplied', () => {
    // `SimulationConfig.replication` is optional; the envelope's index is not. Passing the
    // envelope's index to a run that had none would add a field the stored record lacks.
    const simConfig = simulationConfig(config, { seed: 76 });
    const stored = createStoredRun({
      experimentId: 'no-replication-index',
      experimentSeed: 1,
      replication: 4,
      config: simConfig,
      result: runSimulation(simConfig),
    });
    expect(stored.record.replication).toBeUndefined();
    expect(replaySimulationConfig(stored, sources).replication).toBeUndefined();
    expect(replayStoredRun(stored, sources).identical).toBe(true);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Determinism, independently of persistence
 * -------------------------------------------------------------------------- */

describe('the fingerprint is a faithful identity', () => {
  it('agrees for two runs of the same config and disagrees across seeds', () => {
    const one = runOne(config, { seed: 81 });
    const two = runOne(config, { seed: 81 });
    const other = runOne(config, { seed: 82 });
    expect(runRecordFingerprint(two.record)).toBe(runRecordFingerprint(one.record));
    expect(runRecordFingerprint(other.record)).not.toBe(runRecordFingerprint(one.record));
  });
});
