/**
 * The load path, and the schema version's first real reader.
 *
 * `DECISIONS.md` D16 deleted `isSupportedRecording` because it compared a recording's version
 * with the constant compiled into the same bundle and therefore could not fail. The tests below
 * are the ones that could not have been written then: every one of them constructs a document
 * this build did **not** produce, which is the only situation the check was ever for.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, breadthConfig, fixtureConfig } from '../fixtures.test-helper.js';
import { VIZ_SCHEMA_VERSION, type VizRecording } from '../contract/types.js';
import { recordRun } from './recordRun.js';
import { readRecordingDocument, recordingFingerprint, verifyReplay } from './document.js';

let config: LoadedConfig;
let recording: VizRecording;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  recording = recordRun(fixtureConfig(config)).recording;
}, 120_000);

describe('readRecordingDocument — PB-07', () => {
  it('accepts a recording this build produced', () => {
    const result = readRecordingDocument(JSON.stringify(recording));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recording.seed).toBe(recording.seed);
    expect(result.recording.legs.length).toBe(recording.legs.length);
  }, 120_000);

  it('refuses a newer schema by name rather than crashing or drawing it — PB-15', () => {
    const newer = { ...recording, schemaVersion: VIZ_SCHEMA_VERSION + 1 };
    const result = readRecordingDocument(JSON.stringify(newer));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('version');
    expect(result.failure.message).toContain('newer viewer');
    expect(result.failure.message).toContain(String(VIZ_SCHEMA_VERSION + 1));
    expect(result.failure.message).toContain(String(VIZ_SCHEMA_VERSION));
  }, 120_000);

  it('refuses an older schema too, because version 2 has no `legs`', () => {
    // The concrete reason the check is not decorative any more: a wave-1 recording is a valid
    // JSON document with a `progress` fold and no `legs`, and the overlay would silently report
    // an empty window on it.
    const { legs, ...withoutLegs } = recording;
    void legs;
    const older = { ...withoutLegs, schemaVersion: 2 };
    const result = readRecordingDocument(JSON.stringify(older));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('version');
    expect(result.failure.message).toContain('older viewer');
  }, 120_000);

  it('reports a truncated document with its position — PB-17', () => {
    const text = JSON.stringify(recording);
    const result = readRecordingDocument(text.slice(0, Math.floor(text.length / 2)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('parse');
    if (result.failure.kind !== 'parse') return;
    // V8 reports a position; a different engine might not, and the shape allows for that.
    expect(result.failure.position ?? 0).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('refuses a well-formed document that is not a recording', () => {
    for (const text of ['[]', '"hello"', '{"schemaVersion":"three"}', '{}']) {
      const result = readRecordingDocument(text);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.failure.kind).toBe('shape');
    }
  });

  it('names every field it is missing rather than the first', () => {
    const result = readRecordingDocument(
      JSON.stringify({ schemaVersion: VIZ_SCHEMA_VERSION, runId: 'x' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.message).toContain('seed');
    expect(result.failure.message).toContain('legs');
    expect(result.failure.message).toContain('summary');
  });
});

describe('verifyReplay — PB-16', () => {
  it('matches when the same seed reproduces the recording', () => {
    const fresh = recordRun(fixtureConfig(config)).recording;
    const verdict = verifyReplay(recording, fresh);
    expect(verdict.matches).toBe(true);
    expect(verdict.message).toContain(recording.seed);
  }, 240_000);

  it('reports a mismatch naming both fingerprints — the negative control', () => {
    // A different seed is a different run; the verdict must say so rather than accept it.
    const other = recordRun(fixtureConfig(config, { seed: 987_654_321n })).recording;
    const verdict = verifyReplay(recording, other);
    expect(verdict.matches).toBe(false);
    expect(verdict.message).toContain(verdict.storedFingerprint);
    expect(verdict.message).toContain(verdict.freshFingerprint);
    expect(verdict.message).toContain('still on screen');
  }, 240_000);

  it('fingerprints content, not run identity', () => {
    // Two recordings of the same run differ in `runId` and in nothing that makes a picture.
    const again = recordRun(fixtureConfig(config)).recording;
    expect(recordingFingerprint(again)).toBe(recordingFingerprint(recording));
    const relabelled: VizRecording = { ...recording, runId: 'a-different-run-id' };
    expect(recordingFingerprint(relabelled)).toBe(recordingFingerprint(recording));
  }, 240_000);

  it('notices a recording whose cars start somewhere else', () => {
    // The defect the phase's raised criterion exists for, reduced to a fingerprint: a start
    // position change must move the fingerprint, or the check would not see the one defect this
    // package has actually shipped.
    const shafts = recording.shafts.map((shaft, index) =>
      index === 0 ? { ...shaft, startHeightM: shaft.startHeightM + 77 } : shaft,
    );
    expect(recordingFingerprint({ ...recording, shafts })).not.toBe(
      recordingFingerprint(recording),
    );
  }, 120_000);

  it('round-trips through a file for a building that times out', () => {
    // The buildings a viewer most needs to load are the ones a run cannot complete.
    const timedOut = recordRun(breadthConfig(config, 'vertical-city')).recording;
    expect(timedOut.status).toBe('timed-out');
    const result = readRecordingDocument(JSON.stringify(timedOut));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(recordingFingerprint(result.recording)).toBe(recordingFingerprint(timedOut));
  }, 300_000);
});
