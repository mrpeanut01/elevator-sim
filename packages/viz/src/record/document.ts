/**
 * Reading a recording that came from somewhere else — `UX.md` `PB-07`, `PB-15`, `PB-16`, `PB-17`.
 *
 * ## Why this is the file that finally reads `VIZ_SCHEMA_VERSION`
 *
 * Wave 1 deleted `isSupportedRecording` (`DECISIONS.md` D16) because it compared a recording's
 * `schemaVersion` with the constant compiled into the same bundle, and in the shipped path the
 * only producer of a recording was `recordRun` from that same bundle. The comparison could not
 * fail. Keeping it would have made a tautology look like a check.
 *
 * D16 also said where the check *does* belong: the load path, where a recording arrives from a
 * file somebody saved from a different build and the versions genuinely can differ. That path is
 * this module, and {@link readRecordingDocument} is the non-test caller
 * `VIZ_SCHEMA_VERSION` has been waiting for since version 1.
 *
 * ## Everything here is a value, not an exception
 *
 * A viewer's four failure rows (`PB-15` newer schema, `PB-16` seed mismatch, `PB-17` truncated
 * JSON, and a well-formed document of the wrong shape) all end in a message on screen and a
 * previous run still playing. Throwing would make the *caller* responsible for turning four
 * kinds of failure into four different sentences, which is how three of them end up sharing one.
 */

import { VIZ_SCHEMA_VERSION, type VizRecording } from '../contract/types.js';

/** Why a document could not be used. */
export type RecordingLoadFailure =
  /** The bytes are not JSON. Carries the position when the engine reported one — `PB-17`. */
  | { readonly kind: 'parse'; readonly message: string; readonly position: number | undefined }
  /** Valid JSON, but not a recording. */
  | { readonly kind: 'shape'; readonly message: string }
  /** A recording from a build this viewer cannot read — `PB-15`. */
  | {
      readonly kind: 'version';
      readonly message: string;
      readonly found: number;
      readonly supported: number;
    };

export type RecordingLoad =
  | { readonly ok: true; readonly recording: VizRecording }
  | { readonly ok: false; readonly failure: RecordingLoadFailure };

/** Fields without which nothing downstream can draw anything. */
const REQUIRED_KEYS = [
  'schemaVersion',
  'runId',
  'seed',
  'buildingId',
  'startedAt',
  'endedAt',
  'floors',
  'shafts',
  'landings',
  'legs',
  'progress',
  'summary',
] as const;

/**
 * `JSON.parse`'s position, when the engine gave one.
 *
 * V8 says `... in JSON at position 4213`; other engines word it differently, so a miss returns
 * `undefined` and the caller shows the raw message rather than inventing an offset.
 */
function parsePosition(message: string): number | undefined {
  const match = /position (\d+)/.exec(message);
  if (match?.[1] === undefined) return undefined;
  return Number(match[1]);
}

/** Parse and check one saved recording. Never throws. */
export function readRecordingDocument(text: string): RecordingLoad {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      failure: { kind: 'parse', message, position: parsePosition(message) },
    };
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, failure: { kind: 'shape', message: 'the document is not a JSON object.' } };
  }

  const record = data as Record<string, unknown>;
  const version = record['schemaVersion'];
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return {
      ok: false,
      failure: {
        kind: 'shape',
        message: 'the document has no numeric "schemaVersion", so it is not a viz recording.',
      },
    };
  }
  if (version > VIZ_SCHEMA_VERSION) {
    return {
      ok: false,
      failure: {
        kind: 'version',
        found: version,
        supported: VIZ_SCHEMA_VERSION,
        message:
          `this recording was made by a newer viewer (schema ${String(version)}); ` +
          `this build reads schema ${String(VIZ_SCHEMA_VERSION)}. Update the viewer, or re-record from the seed.`,
      },
    };
  }
  if (version < VIZ_SCHEMA_VERSION) {
    return {
      ok: false,
      failure: {
        kind: 'version',
        found: version,
        supported: VIZ_SCHEMA_VERSION,
        message:
          `this recording was made by an older viewer (schema ${String(version)}); ` +
          `this build reads schema ${String(VIZ_SCHEMA_VERSION)}. Re-record it from its seed rather than drawing it — ` +
          'the fields this viewer needs were not in that shape.',
      },
    };
  }

  const missing = REQUIRED_KEYS.filter((key) => !(key in record));
  if (missing.length > 0) {
    return {
      ok: false,
      failure: {
        kind: 'shape',
        message: `the document claims schema ${String(version)} but is missing ${missing.join(', ')}.`,
      },
    };
  }

  return { ok: true, recording: record as unknown as VizRecording };
}

/* -------------------------------------------------------------------------- *
 * PB-16 — a seed that does not reproduce its recording
 * -------------------------------------------------------------------------- */

/**
 * A short, stable fingerprint of a recording's *content*.
 *
 * Deliberately not a hash of the whole JSON: `runId` is per-run identity rather than content,
 * and two recordings of the same run made a second apart would differ on it and on nothing that
 * matters. What is fingerprinted is what the picture is made of.
 *
 * The digest is FNV-1a over the serialised projection — small, dependency-free and sufficient
 * for "these two are not the same run", which is the only claim it is ever used to make.
 */
export function recordingFingerprint(recording: VizRecording): string {
  const projection = JSON.stringify({
    seed: recording.seed,
    buildingId: recording.buildingId,
    dispatcherProfileId: recording.dispatcherProfileId,
    startedAt: recording.startedAt,
    endedAt: recording.endedAt,
    status: recording.status,
    shafts: recording.shafts.map((shaft) => ({
      carId: shaft.carId,
      start: shaft.startHeightM,
      motions: shaft.motions.length,
      doorMarks: shaft.doorMarks.length,
    })),
    legs: recording.legs.length,
    summary: recording.summary,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < projection.length; i += 1) {
    hash ^= projection.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export interface ReplayVerdict {
  readonly matches: boolean;
  readonly storedFingerprint: string;
  readonly freshFingerprint: string;
  readonly message: string;
}

/**
 * Did re-running the stored seed reproduce the stored recording? — `PB-16`.
 *
 * The row's requirement is the second half: *must not silently show the new run*. So the verdict
 * names **both** fingerprints and the caller is expected to keep the stored recording on screen;
 * a mismatch is evidence about the build, not a reason to quietly swap in whatever came out.
 */
export function verifyReplay(stored: VizRecording, fresh: VizRecording): ReplayVerdict {
  const storedFingerprint = recordingFingerprint(stored);
  const freshFingerprint = recordingFingerprint(fresh);
  const matches = storedFingerprint === freshFingerprint;
  return {
    matches,
    storedFingerprint,
    freshFingerprint,
    message: matches
      ? `seed ${stored.seed} reproduces this recording (fingerprint ${storedFingerprint}).`
      : `seed ${stored.seed} did NOT reproduce this recording: stored ${storedFingerprint}, re-run ${freshFingerprint}. ` +
        'The stored recording is still on screen; the re-run has been discarded.',
  };
}
