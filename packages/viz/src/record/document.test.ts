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

import { DATA_DIR, fixtureConfig, timedOutConfig } from '../fixtures.test-helper.js';
import { VIZ_SCHEMA_VERSION, type VizRecording } from '../contract/types.js';
import { recordRun } from './recordRun.js';
import {
  readRecordingDocument,
  recordingFingerprint,
  verifyReplay,
  writeRecordingDocument,
} from './document.js';
import { frameSequence, serializeFrames } from '../frame/sequence.js';

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

describe('writeRecordingDocument — TP-10, Save and Load finally meet', () => {
  /*
   * Driven red 2026-07-30 (§ D198): Save downloaded `{recording, frames}` and the shipped Load
   * refused exactly that document — "the document has no numeric schemaVersion" — so the product
   * could not reload the file it saved. The writer and the reader had never met. The reader is
   * the contract (its refusals are pinned here and swept by the honesty corpus), so the writer
   * moved to the reader; nothing below loosens a refusal.
   */
  it('round-trips: what Save writes, Load reads back as the identical recording', () => {
    const result = readRecordingDocument(writeRecordingDocument(recording));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `toEqual`, not `toStrictEqual`: JSON serialisation drops keys whose value is `undefined`
    // (`VizFloor.label?`), and the contract's optional fields make absent and undefined the same
    // claim — which `toEqual` is the comparison for. The fingerprint seals content equality.
    expect(result.recording).toEqual(recording);
    expect(recordingFingerprint(result.recording)).toBe(recordingFingerprint(recording));
  }, 120_000);

  it('still refuses the wrapper the old Save produced — the defect, pinned', () => {
    // The exact document the shipped saveRecording built, frames and all. If this ever starts
    // reading, the reader has been loosened toward a shape the contract never declared.
    const wrapper = JSON.stringify({
      recording,
      frames: serializeFrames(frameSequence(recording)),
    });
    const result = readRecordingDocument(wrapper);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('shape');
    expect(result.failure.message).toContain('schemaVersion');
  }, 120_000);

  it('a reloaded document re-derives the same frames the saved run played', () => {
    // Why the frames are not in the file: they are a pure derivation of the recording, and this
    // is the assertion that carrying a copy would only have duplicated.
    const result = readRecordingDocument(writeRecordingDocument(recording));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(serializeFrames(frameSequence(result.recording))).toBe(
      serializeFrames(frameSequence(recording)),
    );
  }, 240_000);
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
    /*
     * The documents a viewer most needs to load are the ones a run cannot complete.
     *
     * `timedOutConfig` rather than `breadthConfig(config, 'vertical-city')` — `DECISIONS.md` § D260.
     * The old fixture timed out because § D254's pickup access check refused every landing call
     * raised inside an access zone, so the queue was never collected; `vertical-city` now completes
     * at 100 % delivery on every seed tried, and so does `mixed-use-high-rise`. The timeout has to
     * come from demand instead, and it does: 80 % of population per five minutes leaves 606–732
     * journeys in the system when the drain deadline fires, on all three seeds measured.
     */
    const timedOut = recordRun(timedOutConfig(config)).recording;
    expect(timedOut.status).toBe('timed-out');
    expect(timedOut.summary.undelivered).toBeGreaterThan(0);
    const result = readRecordingDocument(JSON.stringify(timedOut));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(recordingFingerprint(result.recording)).toBe(recordingFingerprint(timedOut));
  }, 300_000);
});
