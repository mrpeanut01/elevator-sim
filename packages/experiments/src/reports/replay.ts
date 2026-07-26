/**
 * Replaying a stored run, and proving it came back identical.
 *
 * ```ts
 * const config = await loadConfig('data');
 * const outcome = replayStoredRun(stored, replaySourcesFrom(config));
 * outcome.identical;    // docs/05-roadmap.md § Phase 3 acceptance
 * outcome.differences;  // and what diverged, when it did not
 * ```
 *
 * ## Why this is an acceptance criterion and not a convenience
 *
 * docs/05-roadmap.md § Phase 3: "Any stored run replays to identical results from its seed." That
 * sentence is doing two jobs at once. It is a determinism check on the simulator — the property
 * CLAUDE.md invariants 2, 3 and 4 exist to protect — and it is a *completeness* check on the
 * stored configuration. The second is the one that fails in practice: a record that omits one
 * runner tunable still replays deterministically, just to a different answer, and the difference
 * is a few percent of AWT rather than an exception. So the check is made against the whole record,
 * canonically serialized, not against a headline number.
 *
 * ## What identity means
 *
 * Byte identity of `canonicalJson(record)`: every passenger's arrival, boarding, alighting, car and
 * bank; every load and queue sample; the seed; the window. Two runs can agree on AWT to fifteen
 * decimal places while disagreeing about which car served whom, and a comparison of dispatchers is
 * precisely a comparison of who served whom.
 *
 * Deliberately excluded from the comparison: nothing. The record is compared in full. Fields that
 * are *not* in the record — event counts, warnings — are not compared, because they are not stored
 * and a replay is only ever asked to reproduce what was stored.
 */

import {
  runSimulation,
  summarizeRun,
  type DispatcherProfile,
  type ElevatorSpecs,
  type LoadedConfig,
  type ResolvedBuilding,
  type SimulationConfig,
  type SimulationResult,
  type TrafficProfiles,
} from '@elevator-sim/core';

import { canonicalJson, runRecordFingerprint, summaryFingerprint } from './persistence.js';
import { summarizeOptionsFor } from './reanalyze.js';
import { ReportsError, type ReplayOutcome, type StoredRunRecord } from './types.js';

/* -------------------------------------------------------------------------- *
 * Sources
 * -------------------------------------------------------------------------- */

/**
 * The reference data a stored run's ids resolve against.
 *
 * Structural rather than a `LoadedConfig`, so a replay can be driven from a subset — one building
 * and one profile, which is what a focused re-check of a single record needs — without loading the
 * whole of `data/`. {@link replaySourcesFrom} adapts a `LoadedConfig`.
 */
export interface ReplaySources {
  readonly buildingsById: ReadonlyMap<string, ResolvedBuilding>;
  readonly dispatcherProfilesById: ReadonlyMap<string, DispatcherProfile>;
  readonly trafficProfiles: TrafficProfiles;
  /**
   * `data/elevator-specs.json`, for its `loadSensor` section.
   *
   * Required when the stored run used it ({@link StoredRunConfig.usesElevatorSpecs}), because
   * omitting it falls back to `LOAD_SENSOR_DEFAULTS` — the same numbers today, and a silent
   * divergence the day the reference data changes.
   */
  readonly elevatorSpecs?: ElevatorSpecs | undefined;
}

/** Adapt a `LoadedConfig` from `loadConfig()` into {@link ReplaySources}. */
export function replaySourcesFrom(config: LoadedConfig): ReplaySources {
  return Object.freeze({
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  });
}

/* -------------------------------------------------------------------------- *
 * Rebuilding the configuration
 * -------------------------------------------------------------------------- */

/**
 * Rebuild the `SimulationConfig` that produced a stored run.
 *
 * Every field comes from the record; nothing is defaulted here that was not defaulted there. Two
 * details are worth stating because getting either wrong produces a replay that is *nearly*
 * identical:
 *
 * - **`reportWindow` is passed as the resolved window** the run was summarized over, not as
 *   `'peak-5min'`. Re-deriving a derived selection is a different operation from replaying one.
 * - **`seed` is passed as a `bigint`.** The stored form is a decimal string precisely because a
 *   64-bit seed does not survive `JSON.stringify` as anything else, and `Number(seed)` would lose
 *   precision above 2^53 — for the seeds a sweep generates, silently.
 *
 * @throws ReportsError if a building or dispatcher profile id is not present in the sources, or if
 *   the run used `elevatorSpecs` and none were supplied. Replaying against a *substitute* building
 *   is worse than not replaying: the run would succeed and mean nothing.
 */
export function replaySimulationConfig(
  stored: StoredRunRecord,
  sources: ReplaySources,
): SimulationConfig {
  const { config } = stored;
  const building = sources.buildingsById.get(config.buildingId);
  if (building === undefined) {
    throw new ReportsError(
      `Cannot replay run "${config.runId ?? stored.record.runId}": building "${config.buildingId}" is not in the supplied config. Available: ${[...sources.buildingsById.keys()].join(', ') || '(none)'}`,
    );
  }
  const dispatcherProfile = sources.dispatcherProfilesById.get(config.dispatcherProfileId);
  if (dispatcherProfile === undefined) {
    throw new ReportsError(
      `Cannot replay run "${config.runId ?? stored.record.runId}": dispatcher profile "${config.dispatcherProfileId}" is not in the supplied config. Available: ${[...sources.dispatcherProfilesById.keys()].join(', ') || '(none)'}`,
    );
  }
  if (config.usesElevatorSpecs === true && sources.elevatorSpecs === undefined) {
    throw new ReportsError(
      `Cannot replay run "${config.runId ?? stored.record.runId}": it was run with data/elevator-specs.json and none was supplied. Without it the load sensor falls back to LOAD_SENSOR_DEFAULTS, which is a different configuration even when the numbers happen to agree today.`,
    );
  }
  if (building.trafficProfile !== config.trafficProfileId) {
    throw new ReportsError(
      `Cannot replay run "${config.runId ?? stored.record.runId}": it was stored against traffic profile "${config.trafficProfileId}", but building "${config.buildingId}" now declares "${building.trafficProfile}". data/ has changed under the stored result; re-run the experiment rather than comparing across it.`,
    );
  }

  const sim = config.sim ?? {};
  const summarizeRest = summarizeWithoutWindow(stored);

  return Object.freeze({
    building,
    dispatcherProfile,
    trafficProfiles: sources.trafficProfiles,
    ...(config.usesElevatorSpecs === true && sources.elevatorSpecs !== undefined
      ? { elevatorSpecs: sources.elevatorSpecs }
      : {}),
    seed: BigInt(config.seed),
    demandTemplate: config.demandTemplate,
    ...(config.durationS === undefined ? {} : { durationS: config.durationS }),
    ...(config.summarize?.window === undefined ? {} : { reportWindow: config.summarize.window }),
    ...(config.demand === undefined ? {} : { demand: config.demand }),
    ...(config.dispatcherOptions === undefined
      ? {}
      : { dispatcherOptions: config.dispatcherOptions }),
    ...(config.runId === undefined ? {} : { runId: config.runId }),
    // From the *record*, not the envelope. `StoredRunRecord.replication` is always present — it is
    // the index within the batch — but `SimulationConfig.replication` is optional and is copied
    // into the record only when it was supplied. Passing the envelope's index to a run that was
    // originally given none would add a field the stored record does not have, and the replay
    // would differ for a reason that has nothing to do with the simulation.
    ...(stored.record.replication === undefined
      ? {}
      : { replication: stored.record.replication }),
    ...(stored.record.metadata === undefined ? {} : { metadata: stored.record.metadata }),
    ...(summarizeRest === undefined ? {} : { summarize: summarizeRest }),
    ...(sim.transferWalkS === undefined ? {} : { transferWalkS: sim.transferWalkS }),
    ...(sim.dispatchRetryS === undefined ? {} : { dispatchRetryS: sim.dispatchRetryS }),
    ...(sim.drainGraceS === undefined ? {} : { drainGraceS: sim.drainGraceS }),
    ...(sim.queueSampleCount === undefined ? {} : { queueSampleCount: sim.queueSampleCount }),
    ...(sim.doorObstructionProbability === undefined
      ? {}
      : { doorObstructionProbability: sim.doorObstructionProbability }),
    ...(sim.maxEvents === undefined ? {} : { maxEvents: sim.maxEvents }),
    // A stored run that timed out is a legitimate measurement of a saturated configuration, and
    // it was stored, so it was not thrown at the time. Replaying it under the default `throw`
    // would turn reading the archive into an error — so the stored policy is honoured, and
    // `report` is the default here rather than in `core`.
    onTimeout: sim.onTimeout ?? 'report',
  });
}

/* -------------------------------------------------------------------------- *
 * Replaying
 * -------------------------------------------------------------------------- */

export interface ReplayOptions {
  /** How many differences to list before truncating. Default 12. */
  readonly maxDifferences?: number | undefined;
}

/**
 * Re-run a stored replication and compare the result against what was stored.
 *
 * Never throws on divergence: a failed replay is a *finding*, and the caller usually wants the
 * replayed result in hand to diff it. {@link assertIdenticalReplay} is the assertion form for
 * tests and for a runner that must stop.
 */
export function replayStoredRun(
  stored: StoredRunRecord,
  sources: ReplaySources,
  options: ReplayOptions = {},
): ReplayOutcome {
  const result = runSimulation(replaySimulationConfig(stored, sources));
  const storedFingerprint = runRecordFingerprint(stored.record);
  const replayedFingerprint = runRecordFingerprint(result.record);
  const identical = storedFingerprint === replayedFingerprint;

  const differences = identical
    ? Object.freeze([])
    : Object.freeze(
        diffRecords(stored, result, options.maxDifferences ?? DEFAULT_MAX_DIFFERENCES),
      );

  const summaryMatches =
    stored.summaryFingerprint === undefined
      ? undefined
      : summaryFingerprint(
          summarizeRun(result.record, summarizeOptionsFor(stored)),
        ) === stored.summaryFingerprint;

  return Object.freeze({
    identical,
    result,
    storedFingerprint,
    replayedFingerprint,
    differences,
    ...(summaryMatches === undefined ? {} : { summaryMatches }),
  });
}

/**
 * Replay and insist on identity.
 *
 * @throws ReportsError naming the first differences found. The message is long on purpose: this
 *   failure means either the simulator lost determinism or the stored configuration is incomplete,
 *   and the two are distinguished by *which* fields moved.
 */
export function assertIdenticalReplay(
  stored: StoredRunRecord,
  sources: ReplaySources,
  options: ReplayOptions = {},
): SimulationResult {
  const outcome = replayStoredRun(stored, sources, options);
  if (!outcome.identical) {
    throw new ReportsError(
      `Run "${stored.record.runId}" did not replay identically from seed ${stored.config.seed}.\n` +
        `  stored   ${outcome.storedFingerprint}\n` +
        `  replayed ${outcome.replayedFingerprint}\n` +
        `${outcome.differences.map((line) => `  - ${line}`).join('\n')}\n` +
        'Either the simulator has lost determinism (CLAUDE.md invariants 2, 3, 4) or the stored ' +
        'configuration is missing something the run depended on. Which fields moved says which.',
    );
  }
  if (outcome.summaryMatches === false) {
    throw new ReportsError(
      `Run "${stored.record.runId}" replayed to an identical record but a different summary. The dataset is intact, so this is a change in the derivation — a metrics default, a percentile method, a saturation threshold — and every stored headline number for this experiment is now on a different footing from a freshly computed one.`,
    );
  }
  return outcome.result;
}

/* -------------------------------------------------------------------------- *
 * Diffing
 * -------------------------------------------------------------------------- */

const DEFAULT_MAX_DIFFERENCES = 12;

/**
 * Where two records diverge, most-structural-first.
 *
 * Ordered deliberately: scalars, then counts, then the first differing element of each collection.
 * A replay that diverges at the first passenger diverges at all of them, so printing the whole
 * list would bury the one line that identifies the cause.
 */
function diffRecords(
  stored: StoredRunRecord,
  replayed: SimulationResult,
  limit: number,
): string[] {
  const differences: string[] = [];
  const left = stored.record;
  const right = replayed.record;

  const scalar = (
    label: string,
    a: string | number | boolean | undefined,
    b: string | number | boolean | undefined,
  ): void => {
    if (a !== b) differences.push(`${label}: stored ${String(a)}, replayed ${String(b)}`);
  };

  scalar('runId', left.runId, right.runId);
  scalar('seed', left.seed, right.seed);
  scalar('buildingId', left.buildingId, right.buildingId);
  scalar('dispatcherProfileId', left.dispatcherProfileId, right.dispatcherProfileId);
  scalar('demandTemplateId', left.demandTemplateId, right.demandTemplateId);
  scalar('startedAt', left.startedAt, right.startedAt);
  scalar('endedAt', left.endedAt, right.endedAt);
  scalar('passengers.length', left.passengers.length, right.passengers.length);
  scalar('loadSamples.length', left.loadSamples.length, right.loadSamples.length);
  scalar('queueSamples.length', left.queueSamples.length, right.queueSamples.length);

  if (canonicalJson(left.reportWindow) !== canonicalJson(right.reportWindow)) {
    differences.push(
      `reportWindow: stored ${canonicalJson(left.reportWindow)}, replayed ${canonicalJson(right.reportWindow)}`,
    );
  }

  const collections: readonly [string, readonly unknown[], readonly unknown[]][] = [
    ['passengers', left.passengers, right.passengers],
    ['loadSamples', left.loadSamples, right.loadSamples],
    ['queueSamples', left.queueSamples, right.queueSamples],
  ];
  for (const [label, a, b] of collections) {
    const shared = Math.min(a.length, b.length);
    for (let index = 0; index < shared; index += 1) {
      if (differences.length >= limit) return truncate(differences, limit);
      const one = canonicalJson(a[index]);
      const two = canonicalJson(b[index]);
      if (one !== two) {
        differences.push(`${label}[${index}]: stored ${one}, replayed ${two}`);
        break;
      }
    }
  }

  if (differences.length === 0) {
    // The fingerprints differed, so something did; if it was not any of the above it is a field
    // this diff does not know about, and saying so beats reporting "identical" beside a mismatch.
    differences.push(
      'the records differ in a field this diff does not inspect; compare canonicalJson(record) directly',
    );
  }
  return truncate(differences, limit);
}

function truncate(differences: string[], limit: number): string[] {
  if (differences.length <= limit) return differences;
  const kept = differences.slice(0, limit);
  kept.push(`… and ${differences.length - limit} more`);
  return kept;
}

/**
 * The stored summary options minus the window, which travels as `SimulationConfig.reportWindow`.
 *
 * `SimulationConfig.summarize` is `Omit<SummarizeOptions, 'window'>` for exactly this reason: the
 * window is a first-class field of the run, not a formatting preference, and passing it twice is a
 * way for the two copies to disagree.
 */
function summarizeWithoutWindow(
  stored: StoredRunRecord,
): Omit<NonNullable<SimulationConfig['summarize']>, 'window'> | undefined {
  const summarize = stored.config.summarize;
  if (summarize === undefined) return undefined;
  const { window: _window, ...rest } = summarize;
  return Object.keys(rest).length === 0 ? undefined : rest;
}
