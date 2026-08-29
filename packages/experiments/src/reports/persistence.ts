/**
 * Writing experiment results, and reading them back.
 *
 * ```ts
 * const stored = createStoredRun({
 *   experimentId: 'up-peak-dispatcher-sweep',
 *   experimentSeed: 20260726n,
 *   replication: 7,
 *   candidateId: 'collective',
 *   config,                       // the SimulationConfig that was run
 *   result,                       // what runSimulation returned
 * });
 *
 * await appendRunToFile('out/up-peak.ndjson', stored);   // one line per replication
 * const set = await readRunSetFile('out/up-peak.ndjson');
 * ```
 *
 * ## The format, and why newline-delimited
 *
 * One JSON object per line, no header, no enclosing array. Three properties follow from that and
 * all three matter at sweep scale:
 *
 * - **Appendable.** A replication is written the moment it finishes; nothing has to be rewritten,
 *   so a 20 000-run sweep does not hold its own results in memory or rewrite a growing array
 *   20 000 times.
 * - **Truncation-tolerant.** A crash costs the partial last line and nothing else. An enclosing
 *   array would cost the whole file, which is the same as costing the whole sweep.
 * - **Splittable.** The set can be cut anywhere and processed on separate machines, because every
 *   line is a complete, self-describing, seed-bearing record.
 *
 * `serializeStoredRun` is compact by default. A single Midtown Office replication is ~300 kB of
 * per-passenger detail as it is; pretty-printing a sweep would add megabytes of whitespace per
 * candidate.
 *
 * ## What is validated, and by whom
 *
 * The envelope is validated here, strictly (see `./schema.ts`): unknown keys are refused, the
 * schema version must match, and the seed must be a decimal-integer string. The `RunRecord` inside
 * is validated by `core`'s own `parseRunRecord`, which owns that schema and is zod-backed.
 *
 * One cross-check is this module's alone and is the reason it is here rather than in `core`:
 * `config.seed` and `record.seed` must agree. Two different seeds on one record is not a cosmetic
 * inconsistency — it means the configuration on the envelope did not produce the dataset beside
 * it, and the replay would compare a run against somebody else's numbers.
 *
 * No wall clock is read anywhere in this file. See `./types.ts` § "No wall clock, on purpose".
 */

/// <reference types="node" />
// Explicit because this package does not declare `@types/node` itself and the compiler therefore
// does not include it automatically: without this directive `node:fs/promises` resolves to
// nothing and every function below fails to type-check. Stated here, in the only file in the
// module that touches a Node built-in, rather than in the shared tsconfig — the rest of `reports/`
// is environment-free and should stay compilable for a browser target.

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { PATIENCE_DISTRIBUTIONS, type PatienceConfig } from '@elevator-sim/core';
import {
  CREDENTIAL_ASSIGNMENTS,
  DEMAND_LEVELS,
  INTERFLOOR_WEIGHTINGS,
  METRICS_SCHEMA_VERSION,
  PERCENTILE_METHODS,
  TIMEOUT_POLICIES,
  TRAFFIC_DEFAULTS,
  TRAFFIC_MODEL_VERSIONS,
  WEIGHT_SET_POLICIES,
  normalizeSeed,
  parseRunRecord,
  summarizeRun,
  type DirectionalSplit,
  type ResolvedBuilding,
  type ResolvedDemandTemplate,
  type RunRecord,
  type RunSummary,
  type SimulationConfig,
  type SimulationResult,
  type SummarizeOptions,
} from '@elevator-sim/core';

import {
  expectArray,
  expectBoolean,
  expectEnum,
  expectInteger,
  expectMetadata,
  expectNumber,
  expectNumberArray,
  expectNumberRecord,
  expectObject,
  expectSeed,
  expectString,
  expectStringArray,
  readOptional,
  rejectUnknownKeys,
  type Path,
} from './schema.js';
import {
  REPORTS_SCHEMA_VERSION,
  ReportsError,
  type StoredDemandOptions,
  type StoredDispatcherOptions,
  type StoredRunConfig,
  type StoredRunRecord,
  type StoredSimOptions,
  type StoredSummarizeOptions,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Building a stored record
 * -------------------------------------------------------------------------- */

export interface CreateStoredRunInput {
  readonly experimentId: string;
  /** The experiment's master seed. Accepted as a `bigint`, `number` or decimal string. */
  readonly experimentSeed: bigint | number | string;
  /** Index of this replication within its batch, from 0. */
  readonly replication: number;
  /** Which alternative under comparison this run belongs to. Defaults to the profile id. */
  readonly candidateId?: string | undefined;
  /** The configuration that was run. Read, never mutated. */
  readonly config: SimulationConfig;
  /** What `runSimulation` returned. */
  readonly result: SimulationResult;
  /**
   * The summary options that were passed to `runSimulation`, if any.
   *
   * **Merged on top of the reconstructed defaults**, in the same order `Simulation` applies them: the
   * window comes from `result.summary.window` (already fully resolved) and the terminals from the
   * building's entrances unless overridden here. So a caller who set only `longWaitThresholdS`
   * passes only `longWaitThresholdS` and does not have to know what else `Simulation` supplies —
   * which is exactly the knowledge that goes missing and produces an unreproducible record.
   */
  readonly summarize?: StoredSummarizeOptions | undefined;
  /** Digest of the summary, for drift detection. Defaults to the result's own summary. */
  readonly summaryFingerprint?: string | undefined;
  readonly metadata?: Readonly<Record<string, string | number | boolean>> | undefined;
  /**
   * Whether to check at write time that the stored summary options really do reproduce the run's
   * own summary. **Default `true`, and leaving it on is strongly advised.**
   *
   * Set `false` only to save the one `summarizeRun` call per replication on a record whose options
   * are already known to be right — see the note on {@link createStoredRun}.
   */
  readonly verifySummary?: boolean | undefined;
}

/**
 * Envelope a finished replication for storage.
 *
 * Everything the envelope needs is read off the `SimulationConfig` and the `SimulationResult`, so
 * a runner cannot store a configuration that differs from the one it ran — the two are not
 * separately supplied.
 *
 * ## Re-analysability is checked here, not hoped for
 *
 * By default the stored summary options are used to re-derive the summary immediately and the result
 * is compared against the run's own. "Re-analysis reproduces the original summary exactly" then
 * holds by construction for every record on disk, and the one case that would otherwise break it
 * fails at the point it can still be fixed: a caller who passed custom `summarize` options to
 * `runSimulation` and did not pass them here. Discovering that months later, from a result set that
 * re-analyses to slightly different numbers, is the expensive version of the same finding.
 *
 * @throws ReportsError if the result's seed and the config's do not agree, which would mean the
 *   caller paired a record with somebody else's configuration; or if the stored summary options do
 *   not reproduce the run's summary (unless {@link CreateStoredRunInput.verifySummary} is `false`).
 */
export function createStoredRun(input: CreateStoredRunInput): StoredRunRecord {
  const { config, result } = input;
  const seed = normalizeSeedText(config.seed, 'config.seed');
  if (seed !== result.record.seed) {
    throw new ReportsError(
      `Refusing to store run "${result.runId}": the configuration carries seed ${seed} and the record carries ${result.record.seed}. A record stored against a configuration that did not produce it cannot be replayed or compared (CLAUDE.md invariant 5)`,
    );
  }
  if (!Number.isInteger(input.replication) || input.replication < 0) {
    throw new ReportsError(
      `replication must be a non-negative integer; received ${input.replication}`,
    );
  }
  // A configuration this module cannot reconstruct must not be stored as though it could be.
  //
  // `dispatcherOptions.weightSets` is a hand-built weight-set library — the study half of § D141,
  // where the arms are a *permutation* of the shipped map rather than the shipped map itself. It
  // has no id and no reference into `data/`, so nothing a replay re-reads can rebuild it, and a
  // record that omitted it would replay a dispatcher with different arms and report the divergence
  // as a determinism failure. The shipped route needs none of this: a profile opts in through
  // `selection.policy`, and `SimulationConfig.dispatcherProfiles` derives the arms from the same
  // file the replay re-reads.
  if (config.dispatcherOptions?.weightSets !== undefined) {
    throw new ReportsError(
      `Refusing to store run "${result.runId}": its dispatcherOptions carry a hand-built weightSets library, which has no reference into data/ and therefore cannot be reconstructed on replay. A record that dropped it would replay a dispatcher with different weight-set arms and look like a determinism failure (CLAUDE.md invariant 5). Opt the profile into selection.policy and let SimulationConfig.dispatcherProfiles derive the arms, or do not persist this run.`,
    );
  }

  const summarize: StoredSummarizeOptions = Object.freeze({
    ...summarizeOptionsOf(result, config.building),
    ...definedEntriesOf(input.summarize ?? {}),
  });
  const sim = simOptionsOf(config);
  const storedConfig: StoredRunConfig = Object.freeze({
    seed,
    /*
     * Copied from the **record**, not from `config`, and that is the one place this function reads
     * the result instead of the configuration. Both fields are already normalized there — the
     * traffic seed to a decimal string by the `StreamSet` that produced it, the model version to
     * "present iff not v1" — so taking them from the record means the envelope cannot claim a
     * different simulator or a different crowd from the dataset sitting beside it. `parseStoredRun`
     * enforces that agreement on the way back in.
     */
    ...(result.record.trafficSeed === undefined
      ? {}
      : { trafficSeed: result.record.trafficSeed }),
    ...(result.record.trafficModel === undefined
      ? {}
      : { trafficModel: result.record.trafficModel }),
    buildingId: config.building.id,
    dispatcherProfileId: config.dispatcherProfile.id,
    trafficProfileId: config.building.trafficProfile,
    demandTemplate: demandTemplateOf(config),
    ...(config.durationS === undefined ? {} : { durationS: config.durationS }),
    ...(config.demand === undefined ? {} : { demand: demandOptionsOf(config.demand) }),
    ...(config.dispatcherOptions === undefined
      ? {}
      : { dispatcherOptions: dispatcherOptionsOf(config.dispatcherOptions) }),
    ...(sim === undefined ? {} : { sim }),
    summarize,
    runId: result.runId,
    usesElevatorSpecs: config.elevatorSpecs !== undefined,
  });

  const fingerprint = input.summaryFingerprint ?? summaryFingerprint(result.summary);
  if (input.verifySummary !== false) {
    assertReanalysable(result, storedConfig, fingerprint);
  }

  return Object.freeze({
    schemaVersion: REPORTS_SCHEMA_VERSION,
    experimentId: input.experimentId,
    experimentSeed: normalizeSeedText(input.experimentSeed, 'experimentSeed'),
    replication: input.replication,
    candidateId: input.candidateId ?? config.dispatcherProfile.id,
    config: storedConfig,
    record: result.record,
    summaryFingerprint: fingerprint,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
}

/**
 * Check that the options about to be stored really do reproduce this run's summary.
 *
 * The failure this catches is narrow and entirely silent otherwise: `summarizeOptionsOf` reconstructs
 * the *defaults* `Simulation` applies, so a run summarized with a non-default long-wait threshold, a
 * different percentile method or explicit terminals would be stored with options that produce a
 * plausible but different summary on re-analysis. Nothing downstream could notice — both numbers are
 * real, they just answer different questions.
 */
function assertReanalysable(
  result: SimulationResult,
  storedConfig: StoredRunConfig,
  fingerprint: string,
): void {
  const options: SummarizeOptions = storedConfig.summarize ?? {};
  const rederived = summaryFingerprint(summarizeRun(result.record, options));
  if (rederived === fingerprint) return;
  throw new ReportsError(
    `Refusing to store run "${result.runId}": the summary options being stored re-derive a different summary from the one the run reported (stored digest ${fingerprint}, re-derived ${rederived}). The record would not re-analyse to its own headline numbers. This almost always means custom summarize options were passed to runSimulation and not to createStoredRun — pass the same options as \`summarize\`. Set verifySummary: false only if a differing derivation is genuinely intended.`,
  );
}

/**
 * The summary options a finished run's headline numbers were derived with, reconstructed.
 *
 * Mirrors what `Simulation` does at the end of a run: the resolved window, and the building's
 * entrance floors as the terminals for the achieved interval. Any explicit `summarize` options the
 * caller passed to `runSimulation` must be supplied to `createStoredRun` instead — they are not
 * recoverable from the result, and this function does not pretend otherwise.
 */
export function summarizeOptionsOf(
  result: SimulationResult,
  building: ResolvedBuilding,
): StoredSummarizeOptions {
  const terminalFloorIds = building.entranceFloors.map((floor) => floor.id);
  return Object.freeze({
    window: result.summary.window,
    ...(terminalFloorIds.length === 0 ? {} : { terminalFloorIds: Object.freeze(terminalFloorIds) }),
  });
}

/* -------------------------------------------------------------------------- *
 * Canonical form and fingerprints
 * -------------------------------------------------------------------------- */

/**
 * JSON with object keys in sorted order and non-finite numbers named rather than nulled.
 *
 * Two independent needs meet here. Comparing a replayed record against a stored one has to be
 * insensitive to key *order* — which is a property of the writer, not of the run — so the
 * comparison is made on this form. And a `RunSummary` is full of legitimate `NaN`s ("nobody was
 * served, so there is no mean"), which `JSON.stringify` turns into `null`, silently equating "no
 * measurement" with "the number zero" the moment anything reads it back. Here they become
 * `"NaN"`, `"Infinity"` and `"-Infinity"`: unambiguous, and never mistakable for a value.
 *
 * Used for digests and comparisons only. The stored form is ordinary `JSON.stringify`, and
 * re-ordering its keys would make the stored bytes differ from the bytes every other writer of a
 * `RunRecord` produces — `core` has no serializer of its own to disagree with (§ D395).
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '"NaN"';
    if (value === Number.POSITIVE_INFINITY) return '"Infinity"';
    if (value === Number.NEGATIVE_INFINITY) return '"-Infinity"';
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return 'null';
}

/**
 * A 128-bit FNV-1a digest of a value's canonical JSON, as 32 hex characters.
 *
 * Not a cryptographic hash and not used as one: nothing here is defending against a forged run
 * record. It is a cheap, dependency-free identity for a few hundred kilobytes of per-passenger
 * detail, so that "this replay is identical" is decidable in one string comparison and storable in
 * a field. 128 bits keeps accidental collisions out of reach for sweeps of any size this project
 * will run.
 */
export function fingerprintOf(value: unknown): string {
  return fnv1a128(canonicalJson(value));
}

/** Canonical digest of a run's per-passenger dataset. The replay-identity check. */
export function runRecordFingerprint(record: RunRecord): string {
  return fingerprintOf(record);
}

/**
 * Canonical digest of a derived summary, for drift detection.
 *
 * Its whole purpose is to fail: if a later build derives different headline numbers from the same
 * stored data, the fingerprint stops matching and re-analysis says so. A stored *value* could not
 * do that job — it would simply be believed.
 */
export function summaryFingerprint(summary: RunSummary): string {
  return fingerprintOf(summary);
}

/** Digest of a whole stored record, envelope included. Identifies a line of a result set. */
export function storedRunFingerprint(stored: StoredRunRecord): string {
  return fingerprintOf(stored);
}

/* -------------------------------------------------------------------------- *
 * Serialization
 * -------------------------------------------------------------------------- */

export interface SerializeStoredRunOptions {
  /** Indentation for `JSON.stringify`. Omit for the compact form a sweep should store. */
  readonly space?: number | undefined;
}

/**
 * One stored record as JSON text.
 *
 * Never contains a newline in compact form, which is what makes {@link serializeRunSet} a valid
 * newline-delimited file: JSON escapes every control character inside strings, so no value can
 * introduce one.
 */
export function serializeStoredRun(
  stored: StoredRunRecord,
  options: SerializeStoredRunOptions = {},
): string {
  return JSON.stringify(stored, undefined, options.space);
}

/** A result set as newline-delimited JSON, one record per line, trailing newline included. */
export function serializeRunSet(records: readonly StoredRunRecord[]): string {
  if (records.length === 0) return '';
  return `${records.map((record) => serializeStoredRun(record)).join('\n')}\n`;
}

/* -------------------------------------------------------------------------- *
 * Parsing
 * -------------------------------------------------------------------------- */

/**
 * Parse and validate one stored record.
 *
 * Accepts JSON text or an already-parsed value, so a caller that read a file and a caller that
 * received a structured message share one validation path.
 *
 * @throws ReportsError on malformed JSON, an unknown envelope schema version, an unknown key, a
 *   missing or unparseable seed, or a disagreement between the envelope's seed and the record's.
 *   The inner `RunRecord` is validated by `core`, whose `MetricsError` is re-thrown as a
 *   `ReportsError` with the run named — an error that says only "seed must be a decimal integer"
 *   is unhelpful in a file of 20 000 lines.
 */
export function parseStoredRun(input: string | unknown): StoredRunRecord {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ReportsError(`Stored run is not valid JSON: ${detail}`);
    }
  }

  const root = expectObject(value, []);
  assertSchemaVersion(root);
  rejectUnknownKeys(root, [], [
    'schemaVersion',
    'experimentId',
    'experimentSeed',
    'replication',
    'candidateId',
    'config',
    'record',
    'summaryFingerprint',
    'metadata',
  ]);

  const experimentId = expectString(root['experimentId'], ['experimentId']);
  const experimentSeed = expectSeed(root['experimentSeed'], ['experimentSeed']);
  const replication = expectInteger(root['replication'], ['replication'], 0);
  const candidateId = expectString(root['candidateId'], ['candidateId']);
  const config = parseStoredRunConfig(root['config'], ['config']);
  const record = parseInnerRunRecord(root['record'], candidateId);

  if (config.seed !== record.seed) {
    throw new ReportsError(
      `Stored run "${record.runId}" carries seed ${config.seed} on its configuration and ${record.seed} on its record. One of the two did not produce the other, so the run is neither replayable nor comparable (CLAUDE.md invariant 5)`,
    );
  }
  /*
   * The same check for the other two halves of the run's identity, and it is a check rather than a
   * preference for one side. The envelope is what the replay rebuilds a `SimulationConfig` from and
   * the record is what the replay is compared against; if they disagree the replay runs one crowd
   * and grades it against another, and reports the mismatch as a determinism failure in `core`.
   * Both are written from the record by `createStoredRun`, so a disagreement means the file was
   * edited or assembled by hand.
   */
  if (config.trafficSeed !== record.trafficSeed) {
    throw new ReportsError(
      `Stored run "${record.runId}" carries traffic seed ${config.trafficSeed ?? '(none)'} on its configuration and ${record.trafficSeed ?? '(none)'} on its record. The demand streams were derived from one of the two, so a replay would run a different crowd through the same building and call the divergence a determinism failure (CLAUDE.md invariant 5)`,
    );
  }
  if (config.trafficModel !== record.trafficModel) {
    const named = (version: string | undefined): string =>
      version ?? `${TRAFFIC_DEFAULTS.trafficModel} (absent)`;
    throw new ReportsError(
      `Stored run "${record.runId}" was produced by traffic model ${named(record.trafficModel)} according to its record and ${named(config.trafficModel)} according to its configuration. Those are two different simulators, and a replay would rebuild the wrong one: the group-size draw moves to its own stream at v2, so the same seed yields a different trace rather than a different answer (CLAUDE.md invariant 5)`,
    );
  }

  const summaryFingerprintText = readOptional(root, 'summaryFingerprint', [], expectString);
  const metadata = readOptional(root, 'metadata', [], expectMetadata);

  return Object.freeze({
    schemaVersion: REPORTS_SCHEMA_VERSION,
    experimentId,
    experimentSeed,
    replication,
    candidateId,
    config,
    record,
    ...(summaryFingerprintText === undefined
      ? {}
      : { summaryFingerprint: summaryFingerprintText }),
    ...(metadata === undefined ? {} : { metadata }),
  });
}

/**
 * Parse a newline-delimited result set.
 *
 * Blank lines are skipped — a file that has been concatenated, or appended to after a crash, picks
 * up a stray one — and every other failure names the line number, because the alternative is
 * "invalid JSON" against a file of twenty thousand indistinguishable lines.
 */
export function parseRunSet(text: string): readonly StoredRunRecord[] {
  const out: StoredRunRecord[] = [];
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    try {
      out.push(parseStoredRun(line));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ReportsError(`Result set line ${index + 1}: ${detail}`);
    }
  }
  return Object.freeze(out);
}

/* -------------------------------------------------------------------------- *
 * Files
 * -------------------------------------------------------------------------- */

/** Write a whole result set, creating the directory if needed. Overwrites. */
export async function writeRunSetFile(
  path: string,
  records: readonly StoredRunRecord[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeRunSet(records), 'utf8');
}

/**
 * Append one replication to a result set.
 *
 * The write path a sweep should use: constant memory, and a crash costs at most the run that was
 * in flight. Each call is a single `appendFile`, so concurrent appends from replication workers
 * interleave whole lines rather than corrupting each other on any platform where a small append is
 * atomic — which is why the format has no header to keep consistent.
 */
export async function appendRunToFile(path: string, stored: StoredRunRecord): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${serializeStoredRun(stored)}\n`, 'utf8');
}

/** Read and validate a whole result set. */
export async function readRunSetFile(path: string): Promise<readonly StoredRunRecord[]> {
  const text = await readFile(path, 'utf8');
  try {
    return parseRunSet(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ReportsError(`${path}: ${detail}`);
  }
}

/* -------------------------------------------------------------------------- *
 * Envelope internals
 * -------------------------------------------------------------------------- */

function assertSchemaVersion(root: Record<string, unknown>): void {
  const version = root['schemaVersion'];
  if (version !== REPORTS_SCHEMA_VERSION) {
    throw new ReportsError(
      `Stored run declares schemaVersion ${JSON.stringify(version)}; this build reads version ${REPORTS_SCHEMA_VERSION}. Refusing to guess at the difference — a mis-parsed result produces plausible statistics from the wrong data. Re-run the experiment, or read it with the build that wrote it.`,
    );
  }
}

/**
 * Validate the inner `RunRecord` through `core`, and say which record failed.
 *
 * The version check is duplicated here deliberately: `parseRunRecord` reports the mismatch
 * perfectly well, but a result set is read in bulk and the useful message names the line's own
 * candidate as well as the two versions.
 */
function parseInnerRunRecord(value: unknown, candidateId: string): RunRecord {
  const object = expectObject(value, ['record']);
  const version = object['schemaVersion'];
  if (version !== METRICS_SCHEMA_VERSION) {
    throw new ReportsError(
      `record.schemaVersion: candidate "${candidateId}" was stored with run-record schema ${JSON.stringify(version)}; this build reads ${METRICS_SCHEMA_VERSION}. The envelope is readable but its dataset is not, and a partially understood record produces plausible statistics from the wrong data.`,
    );
  }
  try {
    return parseRunRecord(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ReportsError(`record: ${detail}`);
  }
}

function parseStoredRunConfig(value: unknown, path: Path): StoredRunConfig {
  const object = expectObject(value, path);
  rejectUnknownKeys(object, path, [
    'seed',
    'trafficSeed',
    'trafficModel',
    'buildingId',
    'dispatcherProfileId',
    'trafficProfileId',
    'demandTemplate',
    'durationS',
    'demand',
    'dispatcherOptions',
    'sim',
    'summarize',
    'runId',
    'usesElevatorSpecs',
  ]);

  return Object.freeze({
    seed: expectSeed(object['seed'], [...path, 'seed']),
    ...spread('trafficSeed', readOptional(object, 'trafficSeed', path, expectSeed)),
    ...spread(
      'trafficModel',
      readOptional(object, 'trafficModel', path, (value, at) =>
        expectEnum(value, at, TRAFFIC_MODEL_VERSIONS),
      ),
    ),
    buildingId: expectString(object['buildingId'], [...path, 'buildingId']),
    dispatcherProfileId: expectString(object['dispatcherProfileId'], [
      ...path,
      'dispatcherProfileId',
    ]),
    trafficProfileId: expectString(object['trafficProfileId'], [...path, 'trafficProfileId']),
    demandTemplate: parseDemandTemplate(object['demandTemplate'], [...path, 'demandTemplate']),
    ...spread('durationS', readOptional(object, 'durationS', path, expectNumber)),
    ...spread('demand', readOptional(object, 'demand', path, parseDemandOptions)),
    ...spread(
      'dispatcherOptions',
      readOptional(object, 'dispatcherOptions', path, parseDispatcherOptions),
    ),
    ...spread('sim', readOptional(object, 'sim', path, parseSimOptions)),
    ...spread('summarize', readOptional(object, 'summarize', path, parseSummarizeOptions)),
    ...spread('runId', readOptional(object, 'runId', path, expectString)),
    ...spread(
      'usesElevatorSpecs',
      readOptional(object, 'usesElevatorSpecs', path, expectBoolean),
    ),
  });
}

/** The three shares of a stored `DirectionalSplit`, wherever one is nested. */
function parseStoredSplit(value: unknown, path: Path): DirectionalSplit {
  const inner = expectObject(value, path);
  rejectUnknownKeys(inner, path, ['incoming', 'outgoing', 'interfloor']);
  return Object.freeze({
    incoming: expectNumber(inner['incoming'], [...path, 'incoming']),
    outgoing: expectNumber(inner['outgoing'], [...path, 'outgoing']),
    interfloor: expectNumber(inner['interfloor'], [...path, 'interfloor']),
  });
}

/**
 * A demand template: the id of a `demandTemplates` record, or a fully resolved template.
 *
 * The resolved form is validated field by field rather than waved through. It is the one part of a
 * stored configuration that is a *value* rather than a reference, so nothing downstream will catch
 * a malformed one — `generateTrace` takes a resolved template at its word, and a template with a
 * phase gap in it produces a plausible run against demand nobody asked for.
 *
 * ## The id is a string, and that is `DECISIONS.md` § D274 rather than a loosening
 *
 * It was `expectEnum(value, path, DEMAND_TEMPLATE_IDS)`, which asks *"is this one of the shapes this
 * build compiles?"* — and that has been the wrong question since `resolveDemandTemplate` started
 * looking the id up in the loaded catalogue first. Since § D273 it is also **answerable wrongly**: a
 * record may author its own phases and answer to an id no union contains, so an honest run of
 * `office-day` would have stored fine and failed to read back. A stored record has no catalogue to
 * check against — the `data/` it was measured from need not be on disk — so the id is echoed as
 * written and the check that it *resolves* happens at replay, where a catalogue exists and
 * `resolveDemandTemplate` throws by name.
 *
 * ## Four keys this used to drop, and one it used to reject outright
 *
 * The key list was written when a resolved template had nine fields. It has since grown
 * `startOfDayS` (§ D244), `meanDirectionalSplit` (§ D169) and `authoredPhaseList` (§ D273), and its
 * phases grew `startSplit`/`endSplit` — so a stored *resolved* `lunch-two-way` round-tripped with
 * its mix arc silently deleted, which replays a **different crowd** and is exactly the invariant-5
 * failure the comments beside `demandOptionsOf` are about; and a stored resolved `rise-and-fall`
 * was rejected outright, because `rejectUnknownKeys` had never heard of the hour. All five are
 * carried now, spread-or-omitted so a template without one still reads back without the key.
 */
function parseDemandTemplate(value: unknown, path: Path): string | ResolvedDemandTemplate {
  if (typeof value === 'string') return expectString(value, path);

  const object = expectObject(value, path);
  rejectUnknownKeys(object, path, [
    'id',
    'name',
    'recommended',
    'durationS',
    'phases',
    'reportWindowStartS',
    'reportWindowEndS',
    'peakIntensity',
    'intensityIntegralS',
    'meanDirectionalSplit',
    'startOfDayS',
    'authoredPhaseList',
  ]);

  const phases = expectArray(object['phases'], [...path, 'phases']).map((phase, index) => {
    const phasePath: Path = [...path, 'phases', index];
    const entry = expectObject(phase, phasePath);
    rejectUnknownKeys(entry, phasePath, [
      'startS',
      'endS',
      'startIntensity',
      'endIntensity',
      'startSplit',
      'endSplit',
    ]);
    return Object.freeze({
      startS: expectNumber(entry['startS'], [...phasePath, 'startS']),
      endS: expectNumber(entry['endS'], [...phasePath, 'endS']),
      startIntensity: expectNumber(entry['startIntensity'], [...phasePath, 'startIntensity']),
      endIntensity: expectNumber(entry['endIntensity'], [...phasePath, 'endIntensity']),
      ...spread(
        'startSplit',
        readOptional(entry, 'startSplit', phasePath, parseStoredSplit),
      ),
      ...spread('endSplit', readOptional(entry, 'endSplit', phasePath, parseStoredSplit)),
    });
  });

  return Object.freeze({
    id: expectString(object['id'], [...path, 'id']),
    name: expectString(object['name'], [...path, 'name']),
    recommended: expectBoolean(object['recommended'], [...path, 'recommended']),
    durationS: expectNumber(object['durationS'], [...path, 'durationS']),
    phases: Object.freeze(phases),
    reportWindowStartS: expectNumber(object['reportWindowStartS'], [
      ...path,
      'reportWindowStartS',
    ]),
    reportWindowEndS: expectNumber(object['reportWindowEndS'], [...path, 'reportWindowEndS']),
    peakIntensity: expectNumber(object['peakIntensity'], [...path, 'peakIntensity']),
    intensityIntegralS: expectNumber(object['intensityIntegralS'], [
      ...path,
      'intensityIntegralS',
    ]),
    ...spread(
      'meanDirectionalSplit',
      readOptional(object, 'meanDirectionalSplit', path, parseStoredSplit),
    ),
    ...spread('startOfDayS', readOptional(object, 'startOfDayS', path, expectNumber)),
    // `true` or absent, never `false` — the shape the field itself keeps, so a template that is not
    // a phase list reads back without the key rather than with one that says "no".
    ...(readOptional(object, 'authoredPhaseList', path, expectBoolean) === true
      ? { authoredPhaseList: true as const }
      : {}),
  });
}

function parseDemandOptions(value: unknown, path: Path): StoredDemandOptions {
  const object = expectObject(value, path);
  rejectUnknownKeys(object, path, [
    'demandLevel',
    'arrivalRatePctPop5min',
    'directionalSplit',
    'batchSharesDestination',
    'entranceWeights',
    'interfloorWeighting',
    'credentialAssignment',
    'credentialGap',
    'maxLegs',
    'peakWindowS',
    'baselineFraction',
    'mixAmplitude',
    'batchSize',
    'passengerMass',
    'dayVariation',
  ]);

  const batchSize = readOptional(object, 'batchSize', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, ['distribution', 'mean', 'weights']);
    return Object.freeze({
      distribution: expectString(inner['distribution'], [...entryPath, 'distribution']),
      ...spread('mean', readOptional(inner, 'mean', entryPath, expectNumber)),
      ...spread(
        'weights',
        readOptional(inner, 'weights', entryPath, expectNumberArray),
      ),
    });
  });

  const passengerMass = readOptional(object, 'passengerMass', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, [
      'distribution',
      'meanKg',
      'stdDevKg',
      'minKg',
      'maxKg',
    ]);
    // All five required on the way back in, exactly as the override type requires them on the way
    // out: a stored block missing a truncation bound would replay an unbounded population, which
    // is the failure docs/14 § 2.1 makes the bounds mandatory to prevent.
    return Object.freeze({
      distribution: expectString(inner['distribution'], [...entryPath, 'distribution']),
      meanKg: expectNumber(inner['meanKg'], [...entryPath, 'meanKg']),
      stdDevKg: expectNumber(inner['stdDevKg'], [...entryPath, 'stdDevKg']),
      minKg: expectNumber(inner['minKg'], [...entryPath, 'minKg']),
      maxKg: expectNumber(inner['maxKg'], [...entryPath, 'maxKg']),
    });
  });

  const dayVariation = readOptional(object, 'dayVariation', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, ['minDemandFactor', 'maxDemandFactor', 'peakShiftS']);
    // Both bounds required on the way back in, exactly as the override type requires them on the
    // way out: a stored block missing one would replay an unbounded multiplier, which docs/14
    // § 2.3 makes a refusal rather than a default. `peakShiftS` is genuinely optional, and its
    // absence means the peak keeps the template's own timing.
    return Object.freeze({
      minDemandFactor: expectNumber(inner['minDemandFactor'], [...entryPath, 'minDemandFactor']),
      maxDemandFactor: expectNumber(inner['maxDemandFactor'], [...entryPath, 'maxDemandFactor']),
      ...spread('peakShiftS', readOptional(inner, 'peakShiftS', entryPath, expectNumber)),
    });
  });

  // § D265. One required field, and `rejectUnknownKeys` beside it for `dayVariation`'s reason: a
  // stored block with a misspelt key would rebuild at the shipped share while the record said 0.
  const credentialGap = readOptional(object, 'credentialGap', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, ['wrongZoneShare']);
    return Object.freeze({
      wrongZoneShare: expectNumber(inner['wrongZoneShare'], [...entryPath, 'wrongZoneShare']),
    });
  });

  const split = readOptional(object, 'directionalSplit', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, ['incoming', 'outgoing', 'interfloor']);
    return Object.freeze({
      incoming: expectNumber(inner['incoming'], [...entryPath, 'incoming']),
      outgoing: expectNumber(inner['outgoing'], [...entryPath, 'outgoing']),
      interfloor: expectNumber(inner['interfloor'], [...entryPath, 'interfloor']),
    });
  });

  return Object.freeze({
    ...spread(
      'demandLevel',
      readOptional(object, 'demandLevel', path, (entry, entryPath) =>
        expectEnum(entry, entryPath, DEMAND_LEVELS),
      ),
    ),
    ...spread(
      'arrivalRatePctPop5min',
      readOptional(object, 'arrivalRatePctPop5min', path, expectNumber),
    ),
    ...spread('directionalSplit', split),
    ...spread(
      'batchSharesDestination',
      readOptional(object, 'batchSharesDestination', path, expectBoolean),
    ),
    ...spread(
      'entranceWeights',
      readOptional(object, 'entranceWeights', path, expectNumberRecord),
    ),
    ...spread(
      'interfloorWeighting',
      readOptional(object, 'interfloorWeighting', path, (entry, entryPath) =>
        expectEnum(entry, entryPath, INTERFLOOR_WEIGHTINGS),
      ),
    ),
    ...spread(
      'credentialAssignment',
      readOptional(object, 'credentialAssignment', path, (entry, entryPath) =>
        expectEnum(entry, entryPath, CREDENTIAL_ASSIGNMENTS),
      ),
    ),
    ...spread('credentialGap', credentialGap),
    ...spread('maxLegs', readOptional(object, 'maxLegs', path, expectNumber)),
    ...spread('peakWindowS', readOptional(object, 'peakWindowS', path, expectNumber)),
    ...spread('baselineFraction', readOptional(object, 'baselineFraction', path, expectNumber)),
    ...spread('mixAmplitude', readOptional(object, 'mixAmplitude', path, expectNumber)),
    ...spread('batchSize', batchSize),
    ...spread('passengerMass', passengerMass),
    ...spread('dayVariation', dayVariation),
  });
}

function parseDispatcherOptions(value: unknown, path: Path): StoredDispatcherOptions {
  const object = expectObject(value, path);
  rejectUnknownKeys(object, path, [
    'eligibility',
    'normalization',
    'weights',
    'hardConstraints',
    'selection',
  ]);

  const eligibility = readOptional(object, 'eligibility', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, [
      'allowOppositeDirectionPickup',
      'maxLoadFactorForAssignment',
    ]);
    return Object.freeze({
      ...spread(
        'allowOppositeDirectionPickup',
        readOptional(inner, 'allowOppositeDirectionPickup', entryPath, expectBoolean),
      ),
      ...spread(
        'maxLoadFactorForAssignment',
        readOptional(inner, 'maxLoadFactorForAssignment', entryPath, expectNumber),
      ),
    });
  });

  const normalization = readOptional(object, 'normalization', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, ['waitTimeS', 'distanceM']);
    return Object.freeze({
      ...spread('waitTimeS', readOptional(inner, 'waitTimeS', entryPath, expectNumber)),
      ...spread('distanceM', readOptional(inner, 'distanceM', entryPath, expectNumber)),
    });
  });

  const selection = readOptional(object, 'selection', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, [
      'policy',
      'hysteresisS',
      'observationWindowS',
      'lobbyArrivalRateGain',
      'interfloorRateGain',
      'downPeakRateGain',
      'switchMargin',
    ]);
    return Object.freeze({
      ...spread('policy', readOptional(inner, 'policy', entryPath, (raw, rawPath) =>
        expectEnum(raw, rawPath, WEIGHT_SET_POLICIES),
      )),
      ...spread('hysteresisS', readOptional(inner, 'hysteresisS', entryPath, expectNumber)),
      ...spread(
        'observationWindowS',
        readOptional(inner, 'observationWindowS', entryPath, expectNumber),
      ),
      ...spread(
        'lobbyArrivalRateGain',
        readOptional(inner, 'lobbyArrivalRateGain', entryPath, expectNumber),
      ),
      ...spread(
        'interfloorRateGain',
        readOptional(inner, 'interfloorRateGain', entryPath, expectNumber),
      ),
      ...spread(
        'downPeakRateGain',
        readOptional(inner, 'downPeakRateGain', entryPath, expectNumber),
      ),
      ...spread('switchMargin', readOptional(inner, 'switchMargin', entryPath, expectNumber)),
    });
  });

  return Object.freeze({
    ...spread('eligibility', eligibility),
    ...spread('normalization', normalization),
    ...spread('weights', readOptional(object, 'weights', path, expectNumberRecord)),
    ...spread(
      'hardConstraints',
      readOptional(object, 'hardConstraints', path, expectStringArray),
    ),
    ...spread('selection', selection),
  });
}

function parseSimOptions(value: unknown, path: Path): StoredSimOptions {
  const object = expectObject(value, path);
  rejectUnknownKeys(object, path, [
    'transferWalkS',
    'dispatchRetryS',
    'drainGraceS',
    'queueSampleCount',
    'doorObstructionProbability',
    'maxEvents',
    'onTimeout',
    'patience',
  ]);
  return Object.freeze({
    ...spread('transferWalkS', readOptional(object, 'transferWalkS', path, expectNumber)),
    ...spread('dispatchRetryS', readOptional(object, 'dispatchRetryS', path, expectNumber)),
    ...spread('drainGraceS', readOptional(object, 'drainGraceS', path, expectNumber)),
    ...spread('queueSampleCount', readOptional(object, 'queueSampleCount', path, expectNumber)),
    ...spread(
      'doorObstructionProbability',
      readOptional(object, 'doorObstructionProbability', path, expectNumber),
    ),
    ...spread('maxEvents', readOptional(object, 'maxEvents', path, expectNumber)),
    ...spread(
      'onTimeout',
      readOptional(object, 'onTimeout', path, (entry, entryPath) =>
        expectEnum(entry, entryPath, TIMEOUT_POLICIES),
      ),
    ),
    ...spread('patience', readOptional(object, 'patience', path, parsePatience)),
  });
}

/**
 * The patience block, when the run declared one.
 *
 * Carried because it changes **who is served**: riders who gave up in the stored run would be
 * carried in a replay that did not know about them, so the replay is a different run. That is not
 * hypothetical — it is what this omission did, and it surfaced only after `abandonedAt` was added
 * to `passengerRecordSchema`: the parse stopped throwing and the *replay* started disagreeing,
 * `endedAt` 1 820 s against 2 948 s on the same seed.
 *
 * `distribution` and `meanS` are required because {@link PatienceConfig} requires them and there is
 * deliberately no default patience — a defaulted one would put an unstated behaviour into a run
 * that never asked for it. `spreadS` and `minS` are optional in both directions.
 */
function parsePatience(value: unknown, path: Path): PatienceConfig {
  const object = expectObject(value, path);
  rejectUnknownKeys(object, path, ['distribution', 'meanS', 'spreadS', 'minS']);
  return Object.freeze({
    distribution: expectEnum(object['distribution'], [...path, 'distribution'], PATIENCE_DISTRIBUTIONS),
    meanS: expectNumber(object['meanS'], [...path, 'meanS']),
    ...spread('spreadS', readOptional(object, 'spreadS', path, expectNumber)),
    ...spread('minS', readOptional(object, 'minS', path, expectNumber)),
  });
}

function parseSummarizeOptions(value: unknown, path: Path): StoredSummarizeOptions {
  const object = expectObject(value, path);
  rejectUnknownKeys(object, path, [
    'window',
    'longWaitThresholdS',
    'percentileMethod',
    'waitHistogramBinSeconds',
    'loadFactorEdges',
    'designLoadFactor',
    'carIds',
    'saturation',
    'queueSampleCount',
    'maxUnservedFraction',
    'maxWaitHorizonS',
    'terminalFloorIds',
    'departureGapS',
  ]);

  const window = readOptional(object, 'window', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, ['id', 'startS', 'endS']);
    return Object.freeze({
      id: expectString(inner['id'], [...entryPath, 'id']),
      startS: expectNumber(inner['startS'], [...entryPath, 'startS']),
      endS: expectNumber(inner['endS'], [...entryPath, 'endS']),
    });
  });

  const saturation = readOptional(object, 'saturation', path, (entry, entryPath) => {
    const inner = expectObject(entry, entryPath);
    rejectUnknownKeys(inner, entryPath, [
      'minSamples',
      'minSlopePersonsPerMinute',
      'minProjectedGrowthPersons',
      'minGrowthToNoiseRatio',
      'minTStatistic',
    ]);
    return Object.freeze({
      ...spread('minSamples', readOptional(inner, 'minSamples', entryPath, expectNumber)),
      ...spread(
        'minSlopePersonsPerMinute',
        readOptional(inner, 'minSlopePersonsPerMinute', entryPath, expectNumber),
      ),
      ...spread(
        'minProjectedGrowthPersons',
        readOptional(inner, 'minProjectedGrowthPersons', entryPath, expectNumber),
      ),
      ...spread(
        'minGrowthToNoiseRatio',
        readOptional(inner, 'minGrowthToNoiseRatio', entryPath, expectNumber),
      ),
      ...spread('minTStatistic', readOptional(inner, 'minTStatistic', entryPath, expectNumber)),
    });
  });

  return Object.freeze({
    ...spread('window', window),
    ...spread(
      'longWaitThresholdS',
      readOptional(object, 'longWaitThresholdS', path, expectNumber),
    ),
    ...spread(
      'percentileMethod',
      readOptional(object, 'percentileMethod', path, (entry, entryPath) =>
        expectEnum(entry, entryPath, PERCENTILE_METHODS),
      ),
    ),
    ...spread(
      'waitHistogramBinSeconds',
      readOptional(object, 'waitHistogramBinSeconds', path, expectNumber),
    ),
    ...spread(
      'loadFactorEdges',
      readOptional(object, 'loadFactorEdges', path, expectNumberArray),
    ),
    ...spread('designLoadFactor', readOptional(object, 'designLoadFactor', path, expectNumber)),
    ...spread('carIds', readOptional(object, 'carIds', path, expectStringArray)),
    ...spread('saturation', saturation),
    ...spread('queueSampleCount', readOptional(object, 'queueSampleCount', path, expectNumber)),
    ...spread(
      'maxUnservedFraction',
      readOptional(object, 'maxUnservedFraction', path, expectNumber),
    ),
    ...spread('maxWaitHorizonS', readOptional(object, 'maxWaitHorizonS', path, expectNumber)),
    ...spread(
      'terminalFloorIds',
      readOptional(object, 'terminalFloorIds', path, expectStringArray),
    ),
    ...spread('departureGapS', readOptional(object, 'departureGapS', path, expectNumber)),
  });
}

/* -------------------------------------------------------------------------- *
 * Config projection
 * -------------------------------------------------------------------------- */

function demandTemplateOf(config: SimulationConfig): string | ResolvedDemandTemplate {
  const template = config.demandTemplate;
  if (template === undefined) return 'rise-and-fall';
  return template;
}

function demandOptionsOf(demand: NonNullable<SimulationConfig['demand']>): StoredDemandOptions {
  return Object.freeze({
    ...spread('demandLevel', demand.demandLevel),
    ...spread('arrivalRatePctPop5min', demand.arrivalRatePctPop5min),
    ...spread('directionalSplit', demand.directionalSplit),
    ...spread('batchSharesDestination', demand.batchSharesDestination),
    ...spread('entranceWeights', demand.entranceWeights),
    ...spread('interfloorWeighting', demand.interfloorWeighting),
    ...spread('credentialAssignment', demand.credentialAssignment),
    // § D265, for `mixAmplitude`'s reason one line down: 0 is a control arm, and a projection
    // that dropped it would replay the control at the shipped share.
    ...spread('credentialGap', demand.credentialGap),
    ...spread('maxLegs', demand.maxLegs),
    ...spread('peakWindowS', demand.peakWindowS),
    ...spread('baselineFraction', demand.baselineFraction),
    // Pre-existing, and the same defect class: live in `benchmark/lunchTwoWaySelection.ts` and
    // dropped here since it landed. See `StoredDemandOptions.mixAmplitude`.
    ...spread('mixAmplitude', demand.mixAmplitude),
    // docs/14 §§ 2.1-2.2, and they are here for the reason `dispatcherOptionsOf` records beside
    // `selection`: a hand-written projection that omits a reachable override stores the run as a
    // run without it, and the replay then succeeds against **a different crowd**. `demandKeyRound
    // Trip.test.ts` derives this list from `SimulationDemandOptions` itself so the next field
    // cannot be forgotten the same way.
    ...spread('batchSize', demand.batchSize),
    ...spread('passengerMass', demand.passengerMass),
    // docs/14 § 2.3, and the same argument once more: a record that dropped this replays at
    // demandFactor 1 with the `dayVariation` stream never consumed — a different crowd, reported
    // as the same run.
    ...spread('dayVariation', demand.dayVariation),
  });
}

function dispatcherOptionsOf(
  options: NonNullable<SimulationConfig['dispatcherOptions']>,
): StoredDispatcherOptions {
  return Object.freeze({
    ...spread('eligibility', options.eligibility),
    ...spread('normalization', options.normalization),
    ...spread('weights', options.weights),
    ...spread('hardConstraints', options.hardConstraints),
    // `selection` joined this list when T53 made the weight-set selector reachable from a shipped
    // run. It was dropped silently before that, which was invisible while nothing could turn the
    // selector on and an invariant-5 violation the moment something could: a record that stored a
    // `selection` override as nothing replays as the default, `off`, and replays a **different
    // dispatcher** without saying so. Six scalars round-trip exactly; the *library* those scalars
    // select among does not, which is why {@link createStoredRun} refuses a `weightSets` override
    // rather than storing half of one.
    ...spread('selection', options.selection),
  });
}

/**
 * The runner tunables the config overrode, or `undefined` when it overrode none.
 *
 * Only overrides are stored. Recording the resolved defaults instead would freeze this build's
 * `SIM_DEFAULTS` into every record and make a later change to a default invisible on replay —
 * which sounds like a feature and is not: the replay would then differ from a fresh run of the
 * same experiment for a reason nothing in the file mentions.
 */
function simOptionsOf(config: SimulationConfig): StoredSimOptions | undefined {
  const sim: StoredSimOptions = Object.freeze({
    ...spread('transferWalkS', config.transferWalkS),
    ...spread('dispatchRetryS', config.dispatchRetryS),
    ...spread('drainGraceS', config.drainGraceS),
    ...spread('queueSampleCount', config.queueSampleCount),
    ...spread('doorObstructionProbability', config.doorObstructionProbability),
    ...spread('maxEvents', config.maxEvents),
    ...spread('onTimeout', config.onTimeout),
    ...spread('patience', config.patience),
  });
  return Object.keys(sim).length === 0 ? undefined : sim;
}

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

/**
 * `{ key: value }`, or `{}` when the value is absent.
 *
 * Under `exactOptionalPropertyTypes` an optional property may be omitted but not set to
 * `undefined`, so every optional field in this module is built by spreading one of these.
 */
function spread<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/**
 * The object's entries whose value is not `undefined`.
 *
 * Spreading an options object that mentions a key with an explicit `undefined` would *erase* the
 * reconstructed default underneath it, which is the opposite of what an override means.
 */
function definedEntriesOf<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as Partial<T>;
}

/**
 * A 128-bit digest of a string, as 32 lowercase hex characters.
 *
 * Four independent FNV-1a-style lanes over the same byte stream, each with a distinct odd
 * multiplier, finished with an xorshift-multiply avalanche. Not a cryptographic hash and not used
 * as one — nothing here defends against a forged run record — but four lanes rather than one
 * matters even for accidental collisions: a single 32-bit lane collides with roughly 5% probability
 * somewhere across a 20 000-run sweep, which is the scale this project works at.
 *
 * `Math.imul` throughout rather than `BigInt`, because the input is the canonical serialization of a
 * whole run record — hundreds of kilobytes per replication.
 *
 * The byte stream is the string's UTF-16 code units, low byte then high byte. Stable across engines
 * and platforms, which is what a stored fingerprint has to be; it is not UTF-8 and does not need to
 * be, because nothing outside this module reproduces the digest independently.
 */
function fnv1a128(text: string): string {
  const primes = [0x01000193, 0x85ebca77, 0xc2b2ae3d, 0x27d4eb2f] as const;
  let h0 = 0x811c9dc5;
  let h1 = 0x9dc5811c;
  let h2 = 0xcbf29ce4;
  let h3 = 0x84222325;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const low = code & 0xff;
    const high = code >>> 8;
    h0 = Math.imul(h0 ^ low, primes[0]);
    h1 = Math.imul(h1 ^ low, primes[1]);
    h2 = Math.imul(h2 ^ low, primes[2]);
    h3 = Math.imul(h3 ^ low, primes[3]);
    h0 = Math.imul(h0 ^ high, primes[0]);
    h1 = Math.imul(h1 ^ high, primes[1]);
    h2 = Math.imul(h2 ^ high, primes[2]);
    h3 = Math.imul(h3 ^ high, primes[3]);
  }

  // Length in the mix, so a truncated input cannot collide with its own prefix.
  h0 ^= text.length;
  h1 ^= text.length;
  h2 ^= text.length;
  h3 ^= text.length;

  return [avalanche(h0), avalanche(h1), avalanche(h2), avalanche(h3)]
    .map((lane) => lane.toString(16).padStart(8, '0'))
    .join('');
}

/** Murmur3's finalizer: spreads every input bit across every output bit. */
function avalanche(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * A seed as a decimal string, whatever form it arrived in. Invariant 5's storage form.
 *
 * Delegates to `core`'s `normalizeSeed` for the numeric forms rather than reimplementing the
 * conversion, because the *identity* of a seed is `StreamSet`'s definition of it: a negative
 * `number` and its unsigned 64-bit image are the same seed and must therefore produce the same
 * stored string, or `config.seed` and `record.seed` would disagree for a run that is perfectly
 * well formed.
 */
function normalizeSeedText(seed: bigint | number | string, label: string): string {
  if (typeof seed === 'string') {
    if (!/^\d+$/.test(seed)) {
      throw new ReportsError(
        `${label} must be a non-negative decimal integer string; received "${seed}"`,
      );
    }
    return seed;
  }
  try {
    return normalizeSeed(seed).toString();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ReportsError(`${label} is not a usable seed: ${detail}`);
  }
}
