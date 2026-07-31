/**
 * Invariant 5 over the two traffic knobs — docs/14 § 1.1 (`trafficSeed`) and § 1.3
 * (`trafficModel`).
 *
 * "Every persisted run record carries its seed, so any run replays exactly." Both halves of that
 * sentence are load-bearing, and it is the second that fails first. `reports/replay.ts` says so in
 * its own docstring: *a record that omits one runner tunable still replays deterministically, just
 * to a different answer.* A traffic model version is the worst possible instance of that, because
 * it does not change a tunable inside the machine — it changes **which trace the crowd walks in
 * with**. A stored `v2` run replayed as `v1` is a different Tuesday at the same seed, and every
 * per-passenger figure derived from it is a figure about a run nobody stored.
 *
 * So these tests drive the real entry point and compare **on the legs**, per docs/05's standing
 * requirement, rather than on a window statistic that could agree by luck. Three directions, and
 * the middle one is the one that would have caught the defect:
 *
 * - the record and the envelope *say* which model and which traffic seed produced the run;
 * - a stored run replays to the same legs it stored, through JSON, from the stored form alone;
 * - a record that **lost** the field does not quietly replay as the default and call it identity.
 *
 * The third is not a wish for a better error message. A replay that silently substitutes `v1` for
 * a stored `v2` reports `identical: false` and looks like a determinism failure in the simulator —
 * so the negative test asserts the divergence is *visible*, which is what makes the positive test
 * worth anything.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '@elevator-sim/core';

import { load, runOne, storedRun } from './fixtures.test-helper.js';
import { parseStoredRun, serializeStoredRun } from './persistence.js';
import {
  assertIdenticalReplay,
  replaySimulationConfig,
  replaySourcesFrom,
  replayStoredRun,
  type ReplaySources,
} from './replay.js';
import { ReportsError, type StoredRunRecord } from './types.js';

let config: LoadedConfig;
let sources: ReplaySources;

beforeAll(async () => {
  config = await load();
  sources = replaySourcesFrom(config);
});

/** A stored run, through the serialized form and back, exactly as a result set is read. */
const roundTrip = (stored: StoredRunRecord): StoredRunRecord =>
  parseStoredRun(serializeStoredRun(stored));

/**
 * The same envelope with keys removed from its JSON — the record written by a build that did not
 * know about the field.
 *
 * Deleted from the parsed JSON rather than from the typed object, because that is the shape the
 * defect actually takes on disk: an older writer simply never emitted the key.
 */
function withoutKeys(
  stored: StoredRunRecord,
  keys: readonly string[],
  where: 'config' | 'record' | 'both' = 'both',
): StoredRunRecord {
  const raw = JSON.parse(serializeStoredRun(stored)) as {
    config: Record<string, unknown>;
    record: Record<string, unknown>;
  };
  for (const key of keys) {
    if (where !== 'record') delete raw.config[key];
    if (where !== 'config') delete raw.record[key];
  }
  return parseStoredRun(raw);
}

/* -------------------------------------------------------------------------- *
 * trafficModel
 * -------------------------------------------------------------------------- */

describe('a stored v2 run replays as a v2 run', () => {
  it('is a different run from v1 at the same seed, which is what gives the rest teeth', () => {
    const v1 = runOne(config, { seed: 20260731 });
    const v2 = runOne(config, { seed: 20260731, overrides: { trafficModel: 'v2' } });

    expect(v1.record.seed).toBe(v2.record.seed);
    expect(v2.record.passengers).not.toEqual(v1.record.passengers);
  });

  it('says on the record and on the envelope which model produced it', () => {
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficModel: 'v2' } }),
    );

    expect(stored.record.trafficModel).toBe('v2');
    expect(stored.config.trafficModel).toBe('v2');
  });

  it('rebuilds a configuration that names the model', () => {
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficModel: 'v2' } }),
    );

    expect(replaySimulationConfig(stored, sources).trafficModel).toBe('v2');
  });

  it('replays byte for byte after a trip through JSON, on the legs', () => {
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficModel: 'v2' } }),
    );
    const outcome = replayStoredRun(stored, sources);

    expect(outcome.differences).toEqual([]);
    expect(outcome.identical).toBe(true);
    expect(outcome.summaryMatches).toBe(true);
    // The legs, not the fingerprint. Two runs can agree on AWT and disagree about who was there.
    expect(outcome.result.record.passengers).toEqual(stored.record.passengers);
    expect(outcome.result.record.loadSamples).toEqual(stored.record.loadSamples);
    expect(outcome.result.record.queueSamples).toEqual(stored.record.queueSamples);
  });

  it('does not quietly replay as v1 when the stored form lost the field', () => {
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficModel: 'v2' } }),
    );
    const amnesiac = withoutKeys(stored, ['trafficModel']);

    expect(amnesiac.record.trafficModel).toBeUndefined();

    const outcome = replayStoredRun(amnesiac, sources);
    expect(outcome.identical).toBe(false);
    expect(outcome.differences.length).toBeGreaterThan(0);
    expect(outcome.result.record.passengers).not.toEqual(amnesiac.record.passengers);
    expect(() => assertIdenticalReplay(amnesiac, sources)).toThrow(ReportsError);
  });

  it('refuses an envelope whose model disagrees with its record', () => {
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficModel: 'v2' } }),
    );

    expect(() => withoutKeys(stored, ['trafficModel'], 'config')).toThrow(ReportsError);
    expect(() => withoutKeys(stored, ['trafficModel'], 'record')).toThrow(ReportsError);
  });
});

/* -------------------------------------------------------------------------- *
 * trafficSeed
 * -------------------------------------------------------------------------- */

describe('a stored run with a traffic seed replays with that crowd', () => {
  const TRAFFIC_SEED = 991_237n;

  it('is a different crowd from the same run seed alone', () => {
    const plain = runOne(config, { seed: 20260731 });
    const seeded = runOne(config, {
      seed: 20260731,
      overrides: { trafficSeed: TRAFFIC_SEED },
    });

    expect(seeded.record.passengers).not.toEqual(plain.record.passengers);
  });

  it('says on the record and on the envelope which crowd it drew', () => {
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficSeed: TRAFFIC_SEED } }),
    );

    expect(stored.record.trafficSeed).toBe(TRAFFIC_SEED.toString());
    expect(stored.config.trafficSeed).toBe(TRAFFIC_SEED.toString());
    // A decimal string, for the reason `seed` is one: 64-bit values do not survive JSON as
    // anything else, and `Number()` loses them silently above 2^53.
    expect(replaySimulationConfig(stored, sources).trafficSeed).toBe(TRAFFIC_SEED);
  });

  it('replays byte for byte after a trip through JSON, on the legs', () => {
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficSeed: TRAFFIC_SEED } }),
    );
    const outcome = replayStoredRun(stored, sources);

    expect(outcome.differences).toEqual([]);
    expect(outcome.identical).toBe(true);
    expect(outcome.result.record.passengers).toEqual(stored.record.passengers);
  });

  it('survives a traffic seed above 2^53, which is where a number would lose it', () => {
    const wide = 18_446_744_073_709_551_557n;
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficSeed: wide } }),
    );

    expect(stored.record.trafficSeed).toBe(wide.toString());
    expect(assertIdenticalReplay(stored, sources).record.trafficSeed).toBe(wide.toString());
  });

  it('does not quietly replay off the run seed when the stored form lost the field', () => {
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficSeed: TRAFFIC_SEED } }),
    );
    const amnesiac = withoutKeys(stored, ['trafficSeed']);

    const outcome = replayStoredRun(amnesiac, sources);
    expect(outcome.identical).toBe(false);
    expect(outcome.result.record.passengers).not.toEqual(amnesiac.record.passengers);
  });

  it('refuses an envelope whose traffic seed disagrees with its record', () => {
    const stored = roundTrip(
      storedRun(config, { seed: 20260731, overrides: { trafficSeed: TRAFFIC_SEED } }),
    );

    expect(() => withoutKeys(stored, ['trafficSeed'], 'config')).toThrow(ReportsError);
    expect(() => withoutKeys(stored, ['trafficSeed'], 'record')).toThrow(ReportsError);
  });
});

/* -------------------------------------------------------------------------- *
 * The default path, which must not move
 * -------------------------------------------------------------------------- */

describe('a run at the pre-flag defaults is byte-identical to one written before them', () => {
  it('emits neither key, at v1 however it was reached', () => {
    for (const overrides of [undefined, { trafficModel: 'v1' as const }]) {
      const stored = roundTrip(
        storedRun(config, { seed: 20260731, ...(overrides === undefined ? {} : { overrides }) }),
      );
      const raw = JSON.parse(serializeStoredRun(stored)) as {
        config: Record<string, unknown>;
        record: Record<string, unknown>;
      };

      expect(Object.keys(raw.record)).not.toContain('trafficModel');
      expect(Object.keys(raw.record)).not.toContain('trafficSeed');
      expect(Object.keys(raw.config)).not.toContain('trafficModel');
      expect(Object.keys(raw.config)).not.toContain('trafficSeed');
      expect(replayStoredRun(stored, sources).identical).toBe(true);
    }
  });
});
