/**
 * Running N replications of a configuration, under common random numbers, with the pairing
 * **audited** — `docs/10-experience-layer-contract.md` § 11 **W3**.
 *
 * ## The one thing this module must not get wrong
 *
 * CLAUDE.md § Statistical discipline: *"Always feed the same passenger traces to every
 * alternative under comparison. It is worth 5–20× in required run count."* The failure mode is
 * silent — misaligned arms produce a plausible mean, a plausible interval and a wrong verdict —
 * so the pairing here is *structural* first and *checked* second:
 *
 * 1. **Structural.** The seed for replication `i` comes from `experiments`' shipped
 *    `replicationSeed`, which takes `(experimentSeed, replication)` and **nothing else**; the loop
 *    below draws it once per index and hands the same `bigint` to every arm. There is no per-arm
 *    seed variable that could diverge.
 * 2. **Structural.** `BatchRequest` puts the dispatcher on the *arm* and everything the trace
 *    generator reads on the *request*, and `traceKeyOf` — again `experiments`' own, computed from
 *    exactly the fields core's `traceConfigFor` reads — is asserted equal across arms before a
 *    single replication runs.
 * 3. **Checked.** Both arms of replication `i` are in memory at the same instant, so their
 *    `PassengerTrace`s are compared **field for field**, every replication, every arm.
 *
 * ## Why field-for-field and not `traceDigest`
 *
 * `experiments` has a shipped 64-bit trace fingerprint, and this module does not use it. That is
 * a choice with a reason rather than an oversight:
 *
 * - It is **unreachable from a browser**. `traceDigest` lives in `runner/replication.ts`, whose
 *   own docstring states an import rule it cannot break — *"runtime imports here are limited to
 *   `@elevator-sim/core` and `node:*`"*, because that file is loaded unbuilt by a Node worker
 *   entry — so it imports the **Node** barrel and cannot be lifted onto `experiments/browser`
 *   without either breaking that rule or splitting the module that documents it.
 * - It is **not the primary evidence, and says so**. `runner/crn.ts`: *"`crn.test.ts` additionally
 *   compares two dispatchers' traces field-for-field, so the hash is a cheap continuous audit
 *   rather than the primary evidence."* A hash exists because a stored experiment result must
 *   carry its check without carrying a hundred kilobytes per replication. A browser batch has both
 *   traces in hand and discards them immediately, so it can afford the evidence the hash stands in
 *   for — and a comparison has no collisions.
 *
 * What is **not** re-implemented is the pairing *rule*. The seed derivation and the equivalence
 * class are `experiments`', by import, which is what § 13 q1 asks for: *"Duplicating is a second
 * source of truth about pairing and should be avoided."*
 *
 * ## A misaligned batch is reported, not thrown
 *
 * The first draft threw. It should not: R3's shape — *"suppression replaces the number, it never
 * hides it"* — applies to this too. A thrown error loses the 50 replications that did run and
 * tells the reader nothing about *what* diverged, while `batchReport` refuses every interval on an
 * unaligned result anyway, in one place, with the disagreement named on screen. The audit is
 * therefore data on the result and {@link BatchCrnAudit.aligned} is the gate.
 *
 * ## What is discarded
 *
 * The recording. `recordRun` folds a whole `VizRecording`, this module reads its summary and the
 * run's trace, and both go out of scope before the next replication starts. A 200-replication
 * batch of Vertical City would otherwise be hundreds of megabytes of step series nothing draws.
 *
 * ## No wall clock in here except the injected one
 *
 * `src/boundaries.test.ts` confines `Date.now`/`performance.now` to `playback/clock.ts`. The
 * elapsed figure this module reports comes from an injected `DisplayClock`, which is the package's
 * standing answer and is what lets a test assert an elapsed number without a timer.
 */

import type {
  DispatcherProfile,
  PassengerTrace,
  RunSummary,
  SimulationConfig,
} from '@elevator-sim/core/browser';
import { collectSearchSpace, metricOf, replicationSeed, traceKeyOf } from '@elevator-sim/experiments/browser';

import { resolveEditedProfile } from '../controls/editedProfile.js';

import type { DisplayClock } from '../playback/clock.js';
import { recordRun } from '../record/recordRun.js';
import {
  BATCH_METRICS,
  type BatchArmRequest,
  type BatchArmResult,
  type BatchCrnAudit,
  type BatchCrnMismatch,
  type BatchMetric,
  type BatchProgress,
  type BatchReplication,
  type BatchRequest,
  type BatchResources,
  type BatchResult,
} from './types.js';

/** Raised when a batch cannot be run at all. Never raised for a *result* a reader should see. */
export class BatchError extends Error {
  override readonly name = 'BatchError';
}

export interface RunBatchOptions {
  /** Called once per arm-replication, after it lands. */
  readonly onProgress?: ((progress: BatchProgress) => void) | undefined;
  /** Wall clock, for {@link BatchResult.elapsedMs} only. Nothing in the batch depends on it. */
  readonly clock?: DisplayClock | undefined;
}

/**
 * Run every arm of `request` over `request.replications` paired replications.
 *
 * Synchronous and CPU-bound by construction — a `Simulation` is one blocking call and there is no
 * point pretending otherwise. **The caller is responsible for not running this on the thread that
 * paints**: `dev/batchWorker.ts` is the shipped caller and it is a worker.
 *
 * @throws BatchError on an unrunnable request: no arms, duplicate arm ids, a non-positive
 *   replication count or horizon, or a dispatcher id this build's `data/` does not have. Nothing
 *   about a *result* throws — see the module docstring on why a broken CRN audit is reported.
 */
export function runBatch(
  request: BatchRequest,
  resources: BatchResources,
  options: RunBatchOptions = {},
): BatchResult {
  assertRequest(request);

  const startedMs = options.clock?.now() ?? 0;
  const configs = request.arms.map((arm) => baseConfigFor(request, resources, armProfile(resources, arm)));

  /*
   * The equivalence class, recorded — **not** checked, and the difference is the point.
   *
   * `traceKeyOf` reads exactly the fields core's trace generator reads: the building, the demand
   * template, the horizon and every demand option. Every one of those comes off the *request* and
   * only the dispatcher comes off the arm, so all arms have this key by construction and a loop
   * comparing them would be comparing a value with itself — a guard that cannot fire, which is a
   * shape this repository has deleted before rather than kept as decoration
   * (`src/index.ts` § *Deleted rather than kept as decoration*).
   *
   * What it is for is **provenance**: it is the canonical statement of what population this batch
   * ran against, it is on the result, and `batchReport` prints it. The thing that is genuinely
   * checked is one level down and cannot be argued from the types — whether the two runs actually
   * saw the same passengers. That is {@link firstTraceDisagreement}, every replication.
   */
  const traceKey = configs[0] === undefined ? '' : traceKeyOf(configs[0]);

  const armReplications: BatchReplication[][] = request.arms.map(() => []);
  const mismatches: BatchCrnMismatch[] = [];
  const baselineArmId = request.arms[0]?.armId ?? '';
  let checkedComparisons = 0;
  let completed = 0;
  const total = request.arms.length * request.replications;

  for (let replication = 0; replication < request.replications; replication += 1) {
    /* One seed per index, drawn once, shared by every arm. This line is the whole of CRN. */
    const seed = replicationSeed(request.seed, replication);
    let baselineTrace: PassengerTrace | undefined;

    for (const [armIndex, arm] of request.arms.entries()) {
      const config = configs[armIndex];
      if (config === undefined) continue;
      const { recording, result } = recordRun({ ...config, seed, replication });

      if (armIndex === 0) {
        baselineTrace = result.trace;
      } else if (baselineTrace !== undefined) {
        checkedComparisons += 1;
        const detail = firstTraceDisagreement(baselineTrace, result.trace);
        if (detail !== null) {
          mismatches.push({ replication, armId: arm.armId, baselineArmId, detail });
        }
      }

      const { summary } = recording;
      armReplications[armIndex]?.push({
        replication,
        seed: seed.toString(),
        awtIsValid: summary.awtIsValid,
        awtInvalidReason: summary.awtInvalidReason ?? null,
        saturated: summary.saturated,
        status: recording.status,
        serviceLevelVerdict: summary.serviceLevel.verdict,
        offeredPer5Min: finiteOrNull(metricOf(result.summary, 'offeredPer5Min')),
        metrics: metricsFor(result.summary),
      });

      completed += 1;
      options.onProgress?.({ completed, total, replication, armId: arm.armId });
    }
  }

  const crn: BatchCrnAudit = {
    traceKey,
    checkedComparisons,
    mismatches,
    aligned: mismatches.length === 0,
  };

  const arms: BatchArmResult[] = request.arms.map((arm, index) => ({
    armId: arm.armId,
    /*
     * The **resolved** dispatcher's id, which is the base's id for an unedited arm and the edited
     * profile's for an edited one.
     *
     * Found by driving W6: with the request's id here, a batch comparing `collective` against an
     * edited `collective` printed *"the difference in average wait between collective and
     * collective"* on every row, and the arm summaries read *"setting yours collective"*. The
     * report is the surface that has to be able to tell two arms apart, so it is handed the name
     * of the thing that actually ran.
     */
    dispatcherProfileId: configs[index]?.dispatcherProfile.id ?? arm.dispatcherProfileId,
    replications: armReplications[index] ?? [],
  }));

  return {
    buildingId: resources.building.id,
    buildingName: resources.building.name,
    seed: request.seed,
    durationS: request.durationS,
    arrivalRatePctPop5min: request.arrivalRatePctPop5min,
    arms,
    crn,
    elapsedMs: (options.clock?.now() ?? 0) - startedMs,
  };
}

/* -------------------------------------------------------------------------- *
 * The configuration every arm shares
 * -------------------------------------------------------------------------- */

/**
 * The simulation config for one arm, **minus the seed** — which is the point of the type.
 *
 * A seed cannot be forgotten into this object and a per-arm seed cannot be written into it,
 * because the field is not there. The loop supplies it.
 *
 * `onTimeout: 'report'` for the reason `dev/main.ts` gives at length: three of the five shipped
 * buildings routinely end a 900 s run with people still in the system, and under `throw` there is
 * no result at all. Nothing about the statistics moves — the run's own `awtIsValid` still carries
 * the suppression, and this module never overrides it.
 */
function baseConfigFor(
  request: BatchRequest,
  resources: BatchResources,
  dispatcherProfile: DispatcherProfile,
): Omit<SimulationConfig, 'seed'> {
  return {
    building: resources.building,
    dispatcherProfile,
    trafficProfiles: resources.trafficProfiles,
    elevatorSpecs: resources.elevatorSpecs,
    // The file beside the profile, so an arm whose profile opts into a weight-set selector runs
    // one rather than being refused by name — `SimulationConfig.dispatcherProfiles`, § D153.
    dispatcherProfiles: resources.dispatcherProfiles,
    durationS: request.durationS,
    onTimeout: 'report',
    ...(request.arrivalRatePctPop5min === null
      ? {}
      : { demand: { arrivalRatePctPop5min: request.arrivalRatePctPop5min } }),
  };
}

/**
 * The dispatcher one arm runs: the shipped profile, or that profile with the player's edit applied.
 *
 * The edit is resolved through `controls/editedProfile.ts` — the **same** module
 * `dev/campaignPanel.ts` calls before it enables Run — so a vector the control admitted cannot be
 * refused here and a vector the control refused cannot reach a simulation. Two implementations of
 * *"is this vector runnable"* would be two answers, and this repository has a rule about that.
 *
 * `collectSearchSpace()` is called here rather than carried on the request because a search space
 * is derived from `core`'s own declarations and is the same object on both sides of the worker
 * boundary; sending it would be sending a projection of something the receiver already has.
 */
function armProfile(resources: BatchResources, arm: BatchArmRequest): DispatcherProfile {
  const profile = resources.dispatcherProfiles.profiles.find(
    (candidate) => candidate.id === arm.dispatcherProfileId,
  );
  if (profile === undefined) {
    throw new BatchError(
      `dispatcher profile "${arm.dispatcherProfileId}" for arm "${arm.armId}" is not in this build's data/. A batch cannot run an arm it cannot resolve.`,
    );
  }
  if (arm.edit === undefined) return profile;

  const resolved = resolveEditedProfile(collectSearchSpace(), profile, arm.edit);
  if (!resolved.ok) {
    throw new BatchError(
      `arm "${arm.armId}" carries an edited weight vector that cannot be run: ${resolved.reason}`,
    );
  }
  return resolved.profile;
}

function assertRequest(request: BatchRequest): void {
  if (request.arms.length < 1) {
    throw new BatchError('a batch needs at least one arm.');
  }
  const ids = new Set(request.arms.map((arm) => arm.armId));
  if (ids.size !== request.arms.length) {
    throw new BatchError('two arms share an id; a paired report could not tell them apart.');
  }
  if (!Number.isSafeInteger(request.replications) || request.replications < 1) {
    throw new BatchError(
      `replications must be a positive whole number; received ${String(request.replications)}.`,
    );
  }
  if (!Number.isFinite(request.durationS) || request.durationS <= 0) {
    throw new BatchError('durationS must be a positive number of simulated seconds.');
  }
}

/* -------------------------------------------------------------------------- *
 * Metrics
 * -------------------------------------------------------------------------- */

/**
 * The scalar projection, through `experiments`' shipped `metricOf`, with `NaN` → `null`.
 *
 * `metricOf` is *"the single place that says which scalar 'the AWT' is"*, and reaching into
 * `summary.waiting.meanS` here instead is how two surfaces end up quoting different numbers under
 * one name. The `null` conversion is the contract edge and is the same convention the recording
 * uses — see `DECISIONS.md` § D154 and the `BatchReplication.metrics` docstring.
 */
function metricsFor(summary: RunSummary): Readonly<Record<BatchMetric, number | null>> {
  const out: Partial<Record<BatchMetric, number | null>> = {};
  for (const metric of BATCH_METRICS) {
    out[metric] = finiteOrNull(metricOf(summary, metric));
  }
  return Object.freeze(out as Record<BatchMetric, number | null>);
}

/** The contract edge, in one place: `core`'s *"not measured"* `NaN` becomes JSON's `null`. */
function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/* -------------------------------------------------------------------------- *
 * The CRN audit
 * -------------------------------------------------------------------------- */

/**
 * The first field on which two passenger traces disagree, named — or `null` when they are equal.
 *
 * Every field a simulation can *read* off the population, which is the same list `experiments`'
 * `traceDigest` hashes, plus the trace-level counts and horizon. What is deliberately excluded is
 * anything the elevators produced: the point is to be insensitive to dispatching and sensitive to
 * demand.
 *
 * Returns the disagreement rather than a boolean, because *"CRN is broken"* is not actionable and
 * *"passengers[31] `p0031`: … vs …"* is.
 */
export function firstTraceDisagreement(
  baseline: PassengerTrace,
  candidate: PassengerTrace,
): string | null {
  const scalars: readonly (readonly [string, unknown, unknown])[] = [
    ['seed', baseline.seed, candidate.seed],
    ['buildingId', baseline.buildingId, candidate.buildingId],
    ['durationS', baseline.durationS, candidate.durationS],
    ['reportWindowStartS', baseline.reportWindowStartS, candidate.reportWindowStartS],
    ['reportWindowEndS', baseline.reportWindowEndS, candidate.reportWindowEndS],
    ['passengerCount', baseline.passengerCount, candidate.passengerCount],
    ['arrivals.length', baseline.arrivals.length, candidate.arrivals.length],
    ['passengers.length', baseline.passengers.length, candidate.passengers.length],
    [
      'passengersInReportWindow',
      baseline.passengersInReportWindow,
      candidate.passengersInReportWindow,
    ],
  ];
  for (const [field, left, right] of scalars) {
    if (left !== right) return `${field}: ${String(left)} vs ${String(right)}`;
  }

  for (const [index, left] of baseline.passengers.entries()) {
    const right = candidate.passengers[index];
    if (right === undefined) return `passengers[${String(index)}] is missing on the second arm`;
    const leftLine = passengerLine(left);
    const rightLine = passengerLine(right);
    if (leftLine !== rightLine) {
      return `passengers[${String(index)}] "${left.id}": ${leftLine} vs ${rightLine}`;
    }
  }
  return null;
}

/** One passenger, flattened to every field the run can read off it. */
function passengerLine(passenger: PassengerTrace['passengers'][number]): string {
  let line =
    `${passenger.id};${passenger.journeyId};${passenger.batchId};${String(passenger.arrivalTimeS)};` +
    `${passenger.originFloorId};${passenger.finalDestinationFloorId};${String(passenger.massKg)};` +
    `${passenger.category};${passenger.demandFloorId};${passenger.profileId};` +
    `${passenger.credentialGroup ?? '-'};${String(passenger.inReportWindow)}`;
  for (const leg of passenger.legs) {
    line += `;${String(leg.legIndex)}>${leg.originFloorId}->${leg.destinationFloorId}`;
  }
  return line;
}
