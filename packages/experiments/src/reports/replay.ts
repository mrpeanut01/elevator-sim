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
  type DispatcherProfiles,
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
  /**
   * The whole of `data/dispatcher-profiles.json`, for its file-level `patternSwitching` block.
   *
   * Required to replay a run whose profile opted into `selection.policy`: the weight-set library
   * is **derived from data** rather than stored, exactly as the profile itself is, so a replay
   * that omits this reconstructs a dispatcher with no arms and `resolveWeightSets` refuses it by
   * name. That refusal is the design — a replay that quietly ran the profile's own weights instead
   * would succeed and mean nothing, which is the argument {@link ReplaySources.elevatorSpecs}
   * makes about `LOAD_SENSOR_DEFAULTS`.
   */
  readonly dispatcherProfiles?: DispatcherProfiles | undefined;
}

/** Adapt a `LoadedConfig` from `loadConfig()` into {@link ReplaySources}. */
export function replaySourcesFrom(config: LoadedConfig): ReplaySources {
  return Object.freeze({
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  });
}

/* -------------------------------------------------------------------------- *
 * Rebuilding the configuration
 * -------------------------------------------------------------------------- */

/**
 * Rebuild the `SimulationConfig` that produced a stored run.
 *
 * Every field comes from the record; nothing is defaulted here that was not defaulted there. Three
 * details are worth stating because getting any of them wrong produces a replay that is *nearly*
 * identical:
 *
 * - **`reportWindow` is passed as the resolved window** the run was summarized over, not as
 *   `'peak-5min'`. Re-deriving a derived selection is a different operation from replaying one.
 * - **`seed` is passed as a `bigint`.** The stored form is a decimal string precisely because a
 *   64-bit seed does not survive `JSON.stringify` as anything else, and `Number(seed)` would lose
 *   precision above 2^53 — for the seeds a sweep generates, silently.
 * - **`trafficSeed` and `trafficModel` are restored, and are absent rather than defaulted.** They
 *   are inputs to the *trace* rather than to the machine, so dropping either does not shade the
 *   answer, it replaces the passengers: a stored `v2` run rebuilt without its model version
 *   re-runs under `v1` and comes back with 49 legs down to 23, and a run rebuilt without a traffic
 *   seed that differed from its run seed meets a different crowd. (A traffic seed *equal* to the
 *   run seed is the one case where losing it costs nothing — it derives the same streams — which
 *   is why that field is stored as provenance and this one is stored as correctness.) Both are
 *   measured in `trafficModelReplay.test.ts`. This is the function's own named failure mode
 *   arriving in the field, and it is why the enumeration above is a liability as well as a design:
 *   a field added to `StoredRunConfig` and not added here is invisible.
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
    // Unconditional, and not gated on a stored flag, because the library is *derived* from this
    // file rather than stored beside the run: passing it reconstructs what the original run
    // derived, and under `selection.policy: 'off'` — every shipped profile — nothing reads it.
    ...(sources.dispatcherProfiles === undefined
      ? {}
      : { dispatcherProfiles: sources.dispatcherProfiles }),
    seed: BigInt(config.seed),
    /*
     * The rest of invariant 5. Both are spread-or-omitted rather than passed as `undefined`, so
     * that a run stored at the pre-flag defaults rebuilds the configuration this repository has
     * always built — `SimulationConfig` distinguishes absent from present exactly as the record
     * does, and a default literal here would be a config the original run did not have.
     *
     * `BigInt`, not `Number`, for the reason `seed` is: a demand seed is a 64-bit value and
     * `Number()` loses it silently above 2^53. A `v2` record rebuilt without `trafficModel` would
     * replay under `v1` — a different trace at the same seed, 49 legs down to 23 on the fixture —
     * which is the failure this module's docstring names and this line closes.
     */
    ...(config.trafficSeed === undefined ? {} : { trafficSeed: BigInt(config.trafficSeed) }),
    ...(config.trafficModel === undefined ? {} : { trafficModel: config.trafficModel }),
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
    /*
     * Patience, and it is the one field here that changes **who is served** rather than how fast.
     *
     * Every other line in this block tunes the machinery. This one decides whether a rider is still
     * standing there, so a replay that dropped it would carry the people who gave up — a different
     * run, reported as a failure to reproduce. That is exactly what it was: `endedAt` 1 800 s
     * stored against 1 884 s replayed, with a second occupant in the first car on the same seed.
     *
     * It had to be added in **three** places, and the order they were found in is the point: the
     * record schema refused `abandonedAt` outright, so nothing ever reached this far; fixing that
     * made the parse succeed and the *replay* disagree; and fixing the stored config made the
     * disagreement smaller rather than gone, because this rebuild never read the field. Invariant 5
     * is only satisfied at the last of the three.
     */
    ...(sim.patience === undefined ? {} : { patience: sim.patience }),
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
  /*
   * `trafficSeed` and `trafficModel` are deliberately **not** compared here, and the reason is that
   * they cannot differ at this call site. The replayed record's values come from
   * `replaySimulationConfig(stored.config)`, `createStoredRun` copies both fields from the record
   * into the envelope, and `parseStoredRun` refuses an envelope that disagrees with its record — so
   * `left` and `right` agree on both by construction, through every path that builds a
   * `StoredRunRecord`.
   *
   * They were added here once and removed after measurement: on the case they were supposed to
   * explain — a record that *lost* its model version — both sides are absent and the diff correctly
   * reports `passengers.length: stored 49, replayed 23`. The cause is not visible in the record
   * pair, because a record that no longer says which simulator made it does not say so on either
   * side. A line that cannot fire, under a comment claiming it names the cause, is worse than the
   * silence it replaced.
   */
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
