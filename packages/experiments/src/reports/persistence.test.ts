/// <reference types="node" />

/**
 * Persistence: the round trip, the seed, and every way a stored result is refused.
 *
 * Driven by real records from the real simulator against the real `data/` directory. A hand-built
 * record would demonstrate that a hand-built record round-trips, which is not the claim; the claim
 * is that thousands of per-passenger entries, `undefined`-valued optional fields and a 64-bit seed
 * survive `JSON.stringify` and come back unchanged.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { METRICS_SCHEMA_VERSION, runSeed, type LoadedConfig } from '@elevator-sim/core';

import { load, runOne, simulationConfig, storedRun } from './fixtures.test-helper.js';
import {
  appendRunToFile,
  canonicalJson,
  createStoredRun,
  parseRunSet,
  parseStoredRun,
  readRunSetFile,
  runRecordFingerprint,
  serializeRunSet,
  serializeStoredRun,
  storedRunFingerprint,
  summarizeOptionsOf,
  summaryFingerprint,
  writeRunSetFile,
} from './persistence.js';
import { REPORTS_SCHEMA_VERSION, ReportsError, type StoredRunRecord } from './types.js';

let config: LoadedConfig;
let directory: string;

beforeAll(async () => {
  config = await load();
  directory = await mkdtemp(join(tmpdir(), 'elevator-reports-'));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- *
 * The round trip
 * -------------------------------------------------------------------------- */

describe('a stored run survives JSON exactly', () => {
  it('round-trips record → JSON → record with an identical fingerprint', () => {
    const stored = storedRun(config, { seed: 20260726, replication: 3 });
    const text = serializeStoredRun(stored);
    const parsed = parseStoredRun(text);

    // Canonical form rather than raw text, so the assertion is about *content* and cannot be
    // satisfied or broken by key ordering.
    expect(canonicalJson(parsed)).toBe(canonicalJson(stored));
    expect(storedRunFingerprint(parsed)).toBe(storedRunFingerprint(stored));
    expect(runRecordFingerprint(parsed.record)).toBe(runRecordFingerprint(stored.record));

    // And the serialization is a fixed point: re-serializing the parsed record reproduces the
    // bytes. This is the property a newline-delimited set relies on when it is appended to.
    expect(serializeStoredRun(parsed)).toBe(text);
  });

  it('keeps every per-passenger record, not an aggregate', () => {
    const stored = storedRun(config, { seed: 4242 });
    const parsed = parseStoredRun(serializeStoredRun(stored));

    expect(parsed.record.passengers.length).toBe(stored.record.passengers.length);
    expect(parsed.record.passengers.length).toBeGreaterThan(10);
    expect(parsed.record.passengers).toEqual(stored.record.passengers);
    expect(parsed.record.loadSamples).toEqual(stored.record.loadSamples);
    expect(parsed.record.queueSamples).toEqual(stored.record.queueSamples);
  });

  it('keeps the seed intact and usable as a bigint (CLAUDE.md invariant 5)', () => {
    // Larger than 2^53, so a seed carried as a JSON number would come back wrong. This is why the
    // storage form is a decimal string.
    const seed = 9_007_199_254_740_997n;
    const stored = storedRun(config, { seed });
    const parsed = parseStoredRun(serializeStoredRun(stored));

    expect(parsed.config.seed).toBe(seed.toString());
    expect(parsed.record.seed).toBe(seed.toString());
    expect(runSeed(parsed.record)).toBe(seed);
    expect(BigInt(parsed.config.seed)).toBe(seed);
  });

  it('carries the configuration needed to reproduce the run', () => {
    const stored = storedRun(config, {
      seed: 11,
      buildingId: 'garden-apartments',
      profileId: 'nearest-car',
      candidateId: 'nearest-car@default',
      experimentId: 'up-peak-sweep',
      experimentSeed: 777,
      replication: 5,
    });

    expect(stored.schemaVersion).toBe(REPORTS_SCHEMA_VERSION);
    expect(stored.record.schemaVersion).toBe(METRICS_SCHEMA_VERSION);
    expect(stored.experimentId).toBe('up-peak-sweep');
    expect(stored.experimentSeed).toBe('777');
    expect(stored.replication).toBe(5);
    expect(stored.candidateId).toBe('nearest-car@default');
    expect(stored.config.buildingId).toBe('garden-apartments');
    expect(stored.config.dispatcherProfileId).toBe('nearest-car');
    expect(stored.config.trafficProfileId).toBe('residential');
    expect(stored.config.demandTemplate).toBe('rise-and-fall');
    expect(stored.config.usesElevatorSpecs).toBe(true);
    expect(stored.config.runId).toBe(stored.record.runId);
    // The derivation travels too, so re-analysis can reproduce rather than approximate.
    expect(stored.config.summarize?.window).toEqual(stored.record.reportWindow);
    expect(stored.config.summarize?.terminalFloorIds).toEqual(['G']);
  });

  it('stores no derived statistics, only a digest of them', () => {
    const stored = storedRun(config, { seed: 5 });
    const text = serializeStoredRun(stored);

    // A summary would be a second source of truth that can drift from the data beside it.
    expect(text).not.toContain('awtIsValid');
    expect(text).not.toContain('meanS');
    expect(stored.summaryFingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it('stores runner tunables only when they were overridden', () => {
    const plain = storedRun(config, { seed: 6 });
    expect(plain.config.sim).toBeDefined();
    // The fixture sets `onTimeout: 'report'` and nothing else.
    expect(plain.config.sim).toEqual({ onTimeout: 'report' });

    const tuned = storedRun(config, {
      seed: 6,
      overrides: { transferWalkS: 12, queueSampleCount: 30 },
    });
    expect(tuned.config.sim?.transferWalkS).toBe(12);
    expect(tuned.config.sim?.queueSampleCount).toBe(30);
    expect(tuned.config.sim?.drainGraceS).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * Schema versioning
 * -------------------------------------------------------------------------- */

describe('schema versions are present and enforced', () => {
  it('rejects an envelope from a different writer, naming both versions', () => {
    const stored = storedRun(config, { seed: 7 });
    const tampered = { ...stored, schemaVersion: REPORTS_SCHEMA_VERSION + 1 };

    expect(() => parseStoredRun(JSON.stringify(tampered))).toThrow(ReportsError);
    expect(() => parseStoredRun(JSON.stringify(tampered))).toThrow(
      new RegExp(
        `declares schemaVersion ${REPORTS_SCHEMA_VERSION + 1}.*reads version ${REPORTS_SCHEMA_VERSION}`,
      ),
    );
  });

  it('rejects a missing envelope version rather than assuming the current one', () => {
    const stored = storedRun(config, { seed: 8 });
    const { schemaVersion: _dropped, ...withoutVersion } = stored;
    expect(() => parseStoredRun(JSON.stringify(withoutVersion))).toThrow(/schemaVersion/);
  });

  it('rejects a run record from a different metrics version, and says which candidate', () => {
    const stored = storedRun(config, { seed: 9, candidateId: 'collective' });
    const tampered = {
      ...stored,
      record: { ...stored.record, schemaVersion: METRICS_SCHEMA_VERSION + 1 },
    };
    expect(() => parseStoredRun(JSON.stringify(tampered))).toThrow(
      /record\.schemaVersion: candidate "collective"/,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Refusals
 * -------------------------------------------------------------------------- */

describe('a result that cannot be trusted is refused, not loaded', () => {
  it('rejects a record whose seed is not a decimal integer string', () => {
    const stored = storedRun(config, { seed: 10 });
    const tampered = {
      ...stored,
      config: { ...stored.config, seed: '0x2a' },
      record: { ...stored.record, seed: '0x2a' },
    };
    expect(() => parseStoredRun(JSON.stringify(tampered))).toThrow(/CLAUDE.md invariant 5/);
  });

  it('rejects a configuration and a record that disagree about the seed', () => {
    const stored = storedRun(config, { seed: 11 });
    const tampered = { ...stored, config: { ...stored.config, seed: '12' } };
    expect(() => parseStoredRun(JSON.stringify(tampered))).toThrow(
      /did not produce the other, so the run is neither replayable nor comparable/,
    );
  });

  it('refuses to store a result against a configuration that did not produce it', () => {
    const one = simulationConfig(config, { seed: 100 });
    const other = runOne(config, { seed: 200 });
    expect(() =>
      createStoredRun({
        experimentId: 'mismatch',
        experimentSeed: 1,
        replication: 0,
        config: one,
        result: other,
      }),
    ).toThrow(/carries seed 100 and the record carries 200/);
  });

  it('rejects an unrecognized key rather than dropping it', () => {
    const stored = storedRun(config, { seed: 12 });
    const tampered = { ...stored, config: { ...stored.config, drainGraceS: 60 } };
    expect(() => parseStoredRun(JSON.stringify(tampered))).toThrow(
      /config: unrecognized key "drainGraceS"/,
    );
  });

  it('rejects a malformed replay knob', () => {
    const stored = storedRun(config, { seed: 13 });
    const tampered = {
      ...stored,
      config: { ...stored.config, sim: { transferWalkS: 'ten' } },
    };
    expect(() => parseStoredRun(JSON.stringify(tampered))).toThrow(
      /config\.sim\.transferWalkS: expected a finite number/,
    );
  });

  it('rejects a negative replication index', () => {
    const stored = storedRun(config, { seed: 14 });
    expect(() => parseStoredRun(JSON.stringify({ ...stored, replication: -1 }))).toThrow(
      /replication: expected an integer >= 0/,
    );
  });

  it('rejects malformed JSON and non-object payloads with a usable message', () => {
    expect(() => parseStoredRun('{ not json')).toThrow(/not valid JSON/);
    expect(() => parseStoredRun('[]')).toThrow(/expected an object/);
  });
});

/* -------------------------------------------------------------------------- *
 * Result sets
 * -------------------------------------------------------------------------- */

describe('newline-delimited result sets', () => {
  it('round-trips a set of replications', () => {
    const records = [0, 1, 2].map((replication) =>
      storedRun(config, { seed: 1000 + replication, replication }),
    );
    const text = serializeRunSet(records);
    expect(text.split('\n').filter((line) => line !== '').length).toBe(3);

    const parsed = parseRunSet(text);
    expect(parsed.length).toBe(3);
    expect(parsed.map((record) => record.config.seed)).toEqual(['1000', '1001', '1002']);
    expect(parsed.map((record) => canonicalJson(record))).toEqual(
      records.map((record) => canonicalJson(record)),
    );
  });

  it('tolerates blank lines and names the line that fails', () => {
    const records = [storedRun(config, { seed: 1 }), storedRun(config, { seed: 2 })];
    const text = `${serializeStoredRun(records[0] as StoredRunRecord)}\n\n${serializeStoredRun(records[1] as StoredRunRecord)}\n`;
    expect(parseRunSet(text).length).toBe(2);

    const broken = `${serializeStoredRun(records[0] as StoredRunRecord)}\n{"schemaVersion":1}\n`;
    expect(() => parseRunSet(broken)).toThrow(/Result set line 2:/);
  });

  it('writes, appends and reads a file, one self-describing line per replication', async () => {
    const path = join(directory, 'sweep.ndjson');
    const first = [0, 1].map((replication) =>
      storedRun(config, { seed: 2000 + replication, replication }),
    );
    await writeRunSetFile(path, first);
    await appendRunToFile(path, storedRun(config, { seed: 2002, replication: 2 }));

    const read = await readRunSetFile(path);
    expect(read.length).toBe(3);
    expect(read.map((record) => record.replication)).toEqual([0, 1, 2]);

    // Every line stands alone: parseable, seed-bearing, replayable on its own.
    const lines = (await readFile(path, 'utf8')).split('\n').filter((line) => line !== '');
    expect(lines.length).toBe(3);
    for (const line of lines) {
      const single = parseStoredRun(line);
      expect(single.config.seed).toMatch(/^\d+$/);
      expect(single.schemaVersion).toBe(REPORTS_SCHEMA_VERSION);
    }
  });

  it('reports an empty set as empty text rather than an empty array literal', () => {
    expect(serializeRunSet([])).toBe('');
    expect(parseRunSet('')).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * Canonical form and digests
 * -------------------------------------------------------------------------- */

describe('canonical form', () => {
  it('is insensitive to key order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: [1, { d: 4, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":4}]}');
  });

  it('names non-finite numbers instead of turning them into null', () => {
    // A RunSummary is full of legitimate NaNs — "nobody was served, so there is no mean" — and
    // JSON.stringify would equate every one of them with the number zero on the way back.
    expect(canonicalJson({ awt: Number.NaN })).toBe('{"awt":"NaN"}');
    expect(canonicalJson({ awt: Number.POSITIVE_INFINITY })).toBe('{"awt":"Infinity"}');
    expect(JSON.stringify({ awt: Number.NaN })).toBe('{"awt":null}');
  });

  it('distinguishes summaries that differ only in an absent measurement', () => {
    expect(summaryFingerprint({ waiting: { meanS: Number.NaN } } as never)).not.toBe(
      summaryFingerprint({ waiting: { meanS: 0 } } as never),
    );
  });

  it('produces a 128-bit digest that changes when any field does', () => {
    const stored = storedRun(config, { seed: 3000 });
    const digest = runRecordFingerprint(stored.record);
    expect(digest).toMatch(/^[0-9a-f]{32}$/);

    const first = stored.record.passengers[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    // A nanosecond on one passenger's arrival, out of thousands of fields.
    const nudged = {
      ...stored.record,
      passengers: [
        { ...first, arrivedAt: first.arrivedAt + 1e-9 },
        ...stored.record.passengers.slice(1),
      ],
    };
    expect(runRecordFingerprint(nudged)).not.toBe(digest);
  });
});

describe('summarizeOptionsOf', () => {
  it('reconstructs the window and terminals a run was summarized with', () => {
    const result = runOne(config, { seed: 4000, buildingId: 'midtown-office' });
    const building = config.buildingsById.get('midtown-office');
    expect(building).toBeDefined();
    if (building === undefined) return;

    const options = summarizeOptionsOf(result, building);
    expect(options.window).toEqual(result.summary.window);
    // Both entrances, in floor order — the same list `Simulation` passes itself.
    expect(options.terminalFloorIds).toEqual(['P1', 'G']);
  });
});
