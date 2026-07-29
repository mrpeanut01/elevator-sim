/**
 * The replication-batch contract — `docs/10-experience-layer-contract.md` § 11 **W3**.
 *
 * ## Why this type exists at all
 *
 * **R2**: *"a score is a property of a run, never of a dispatcher."* One replication cannot
 * support the sentence *"this dispatcher is better"*, and the viewer runs exactly one. The
 * measured reason is § 1's **M7**: Secure Tower under `collective`, twenty consecutive seeds,
 * **6 of 20** replications return a quotable AWT and **4 of 20** are diagnosed saturated — the
 * same configuration. A badge on one of those runs is a coin flip presented as a skill outcome.
 *
 * So the product either says *"in this run, X happened"* or it runs a batch. This file is the
 * shape of the second thing, and every field below exists to keep a specific rule keepable:
 *
 * | Field | Rule it serves |
 * |---|---|
 * | {@link BatchReplication.seed} | R7 / invariant 5 — every replication replays from its own seed, and the seed is a decimal **string** so 64 bits survive `postMessage` and a copy-paste |
 * | {@link BatchReplication.awtIsValid}, {@link BatchReplication.awtInvalidReason} | R3 / R9 — copied from the run's own summary, never recomputed here |
 * | {@link BatchReplication.metrics} | R13 — one number per named metric, `null` where the run measured nothing, so a hole can never be averaged as a zero |
 * | {@link BatchResult.crn} | CLAUDE.md § Statistical discipline — a paired-t interval is arithmetic on unrelated populations unless both arms saw the same passengers |
 *
 * ## `null`, not `NaN` — [`DECISIONS.md` § D154](../../../../DECISIONS.md)
 *
 * `core` says *"not measured"* with `NaN` so an absent measurement cannot arrive disguised as a
 * zero, and `runner/metrics.ts` passes that `NaN` through deliberately. A batch record crosses a
 * `postMessage` boundary and may be written to a file by a caller, and `JSON.stringify(NaN)` is
 * `null` — so a `number`-typed field holding `NaN` comes back as a `null` the type system says is
 * a number. The recording contract solved this at schema 5 by converting once, at the edge, and
 * this file uses the same convention for the same reason. The fact carried is identical: *not
 * measured*, never zero.
 *
 * ## What is deliberately **not** here
 *
 * A recording. A batch of 200 replications of Vertical City would be hundreds of megabytes of
 * `VizRecording`, and nothing in W3 needs one: a batch answers *"is the difference measurable"*,
 * and the picture is the single-run surface's job. Each replication is folded to its summary and
 * its recording is discarded before the next one starts.
 */

import type {
  DispatcherProfiles,
  ElevatorSpecs,
  ResolvedBuilding,
  ServiceLevelVerdict,
  SimulationStatus,
  TrafficProfiles,
} from '@elevator-sim/core/browser';
import type { ReplicationMetric } from '@elevator-sim/experiments/browser';

import type { EditedVector } from '../controls/editedProfile.js';

/* -------------------------------------------------------------------------- *
 * The metrics a batch compares
 * -------------------------------------------------------------------------- */

/**
 * The metrics the batch reports on, as ids of `runner/metrics.ts`'s shipped projection.
 *
 * **Ids of the shipped list, not a second list.** `REPLICATION_METRICS` is *"the single place
 * that says which scalar 'the AWT' is"*, and `report.test.ts` asserts every id here passes the
 * shipped `isReplicationMetric`, so this array cannot drift into naming a metric the projection
 * does not have.
 *
 * Eight rather than the projection's twenty-three, because every one of these is **drawn** by
 * `dev/main.ts`'s compare panel. A surface widened past its consumers is this repository's
 * signature defect; adding a ninth means adding a row that draws it.
 *
 * The three estimates are exactly the three fields **R1** names — *"it may not be computed from
 * `summary.meanWaitS`, `summary.wait95S`, or `summary.meanTimeToDestinationS` unless
 * `summary.awtIsValid` is `true`"* — so the gate below is the rule quoted, not a judgement.
 */
export const BATCH_METRICS = [
  'awtS',
  'wt95S',
  'ttdMeanS',
  'pctOverLongWait',
  'personsPer5Min',
  'unservedFraction',
  'energyKJ',
  'energyPerServedLegKJ',
] as const;

export type BatchMetric = (typeof BATCH_METRICS)[number];

/**
 * Compile-time proof that every {@link BatchMetric} is a `ReplicationMetric`.
 *
 * A `satisfies` on the array would be checked by `tsc` and invisible to a reader; this is the same
 * check with a name. `report.test.ts` asserts the runtime half through the shipped
 * `isReplicationMetric`, because a type alias cannot fail at run time and the shipped list can.
 */
export type BatchMetricIsAReplicationMetric = BatchMetric extends ReplicationMetric ? true : never;

/**
 * What kind of claim a metric is, and therefore what may be done with it.
 *
 * - `estimate` — a mean or a percentile over the reporting window. **R1**: unusable on a run whose
 *   `awtIsValid` is `false`, on any of its four grounds.
 * - `observation` — a fact about the run that happened. Never suppressed, which is § 1's finding
 *   that *"the honest rule is also the only one that ships"*: an observation-based comparison is
 *   available on all 60 shipped cells and an estimate-based one on 14 (**M1**).
 * - `axis` — an observation that may be **shown** and must never be **ordered**. **R11**, and it
 *   is not fastidiousness: `nearest-car` is on the Pareto front at six of eight matrix cells
 *   *because it carries fewer people*, so an arm ranked by energy ranks the worst dispatcher
 *   first. A row of this class reports its interval and refuses to name a winner.
 */
export type BatchMetricClass = 'estimate' | 'observation' | 'axis';

/**
 * Every metric's class, **total by construction**.
 *
 * `Record<BatchMetric, …>` rather than a partial map with a default: a ninth metric added to
 * {@link BATCH_METRICS} without a class here is a compile error, which is the only way this stays
 * a decision somebody made rather than a decision somebody forgot.
 */
export const BATCH_METRIC_CLASS: Readonly<Record<BatchMetric, BatchMetricClass>> = {
  awtS: 'estimate',
  wt95S: 'estimate',
  ttdMeanS: 'estimate',
  pctOverLongWait: 'observation',
  personsPer5Min: 'observation',
  unservedFraction: 'observation',
  energyKJ: 'axis',
  energyPerServedLegKJ: 'axis',
};

/** How a metric is written for a reader, and which direction of the axis is the good one. */
export interface BatchMetricPresentation {
  /** The reader's name for the quantity. Never the id. */
  readonly label: string;
  /** Rendered after the number, with the leading space already in it, or `''`. */
  readonly unit: string;
  /** Decimal places for the value and both bounds. */
  readonly places: number;
  /**
   * `true` when less is better, `false` when more is, `null` when the question is not admissible.
   *
   * `null` is R11's class: an energy row has no better end. It is a `null` rather than an absent
   * key so that a reader of this table sees the refusal.
   */
  readonly lowerIsBetter: boolean | null;
}

/** Presentation for every metric, total for the same reason {@link BATCH_METRIC_CLASS} is. */
export const BATCH_METRIC_PRESENTATION: Readonly<
  Record<BatchMetric, BatchMetricPresentation>
> = {
  awtS: { label: 'average wait', unit: ' s', places: 2, lowerIsBetter: true },
  wt95S: { label: '95th-percentile wait', unit: ' s', places: 2, lowerIsBetter: true },
  ttdMeanS: { label: 'door-to-door time', unit: ' s', places: 2, lowerIsBetter: true },
  pctOverLongWait: {
    label: 'rides over the long-wait threshold',
    unit: ' %',
    places: 2,
    lowerIsBetter: true,
  },
  personsPer5Min: { label: 'people carried per 5 min', unit: '', places: 2, lowerIsBetter: false },
  unservedFraction: {
    label: 'rides that arrived and never boarded',
    unit: '',
    places: 4,
    lowerIsBetter: true,
  },
  energyKJ: { label: 'drive work (proxy)', unit: ' kJ', places: 1, lowerIsBetter: null },
  energyPerServedLegKJ: {
    label: 'drive work per ride delivered',
    unit: ' kJ',
    places: 3,
    lowerIsBetter: null,
  },
};

/* -------------------------------------------------------------------------- *
 * The request
 * -------------------------------------------------------------------------- */

/** One arm of a comparison: a name the reader chose, and the profile it runs. */
export interface BatchArmRequest {
  /** Stable within one request. The reader sees {@link dispatcherProfileId}. */
  readonly armId: string;
  readonly dispatcherProfileId: string;
  /**
   * A **live edit** of that profile's weight vector, or absent to run the shipped profile as-is.
   *
   * `docs/10` § 11 **W6**, closing [§ D161](../../../../DECISIONS.md)'s known limitation: *"the
   * player's move is a shipped profile, not a live weight editor."*
   *
   * It is a *point of the declared search space*, not a profile document, and that is CLAUDE.md
   * invariant 7 kept rather than bent: `controls/editedProfile.ts` decodes it through the same
   * `candidateProfile` an optimizer's winner goes through and parses the result with
   * `parseDispatcherProfiles`. A patch that does not parse never becomes an arm.
   *
   * On the arm rather than on the request, for the reason {@link BatchRequest} gives: the
   * dispatcher is the one field the passenger trace is **not** a function of, so two arms may
   * differ here and only here without breaking CRN. {@link dispatcherProfileId} stays the id of
   * the **base**, so a report that names the arm names something `data/` contains.
   */
  readonly edit?: EditedVector | undefined;
}

/**
 * What to run.
 *
 * Everything that is **not** the dispatcher is shared by every arm, and that is the whole of CRN:
 * `runner/crn.ts`'s `traceKeyOf` computes the trace-equivalence class from exactly the
 * fields core's trace generator reads, and the dispatcher is not one of them. Putting the
 * dispatcher on the arm and everything else on the request makes a misaligned batch unexpressible
 * rather than merely unlikely.
 */
export interface BatchRequest {
  readonly buildingId: string;
  /** Master seed as a decimal string, so 64 bits survive JSON and a paste. */
  readonly seed: string;
  readonly durationS: number;
  /** CLAUDE.md § Statistical discipline: *"Budget 50–200 replications per configuration."* */
  readonly replications: number;
  readonly arms: readonly BatchArmRequest[];
  /**
   * Demand override, `%` of population arriving per 5 minutes, or `null` for the profile's own.
   *
   * On the request rather than on an arm, because it is one of the fields the trace **is** a
   * function of: two arms at different demand levels are two populations and the paired interval
   * between them is arithmetic on unrelated runs. It is here because W3's own acceptance clause
   * names Midtown Office, and at Midtown's shipped demand **0 of 50** replications return a
   * quotable AWT under either `collective` or `eta` — measured, § D158. Without a demand control
   * the estimate half of the batch is unreachable from the viewer on that building.
   */
  readonly arrivalRatePctPop5min: number | null;
}

/** The resolved objects a batch needs. Assembled by the caller; never fetched here. */
export interface BatchResources {
  readonly building: ResolvedBuilding;
  /**
   * The whole of `data/dispatcher-profiles.json`, **not** a map of its profiles.
   *
   * It was `dispatcherProfilesById` until T75. The map was enough to *name* an arm's profile and
   * not enough to *run* one that opts into a weight-set selector, because a selector chooses among
   * other profiles' weight vectors and reads the file-level `patternSwitching` block — see
   * `SimulationConfig.dispatcherProfiles`. Every caller built the map from this object anyway, so
   * the map was a projection carried instead of the thing, and `runBatch` derives it where it
   * needs it. One source of truth for *"what are this build's dispatchers"*.
   */
  readonly dispatcherProfiles: DispatcherProfiles;
  readonly trafficProfiles: TrafficProfiles;
  readonly elevatorSpecs: ElevatorSpecs;
}

/* -------------------------------------------------------------------------- *
 * The result
 * -------------------------------------------------------------------------- */

/** One replication of one arm, folded to what a batch can say something about. */
export interface BatchReplication {
  readonly replication: number;
  /** This replication's master seed, decimal. `replicationSeed(request.seed, replication)`. */
  readonly seed: string;
  /** Copied from the run's own summary — R9. Never recomputed from anything here. */
  readonly awtIsValid: boolean;
  /** The summary's own words, or `null` when it had none. R3 shows the reason, never a blank. */
  readonly awtInvalidReason: string | null;
  readonly saturated: boolean;
  readonly status: SimulationStatus;
  readonly serviceLevelVerdict: ServiceLevelVerdict;
  /**
   * Demand offered over the window, persons per 5 minutes — a field, deliberately **not** a
   * {@link BatchMetric}.
   *
   * `answer-the-demand` (`docs/10` § 5.2) is `personsPer5Min >= offeredPer5Min`, so a goal
   * evaluator needs both halves of § 3.5's paired bar and the batch only carried the carried
   * half. The offered half is a property of the **trace**, not of the dispatcher: every arm of a
   * batch sees the same passengers by construction (that is the whole of CRN), so a comparison
   * row on it would be a paired difference of a value with itself — the shape § D158 § 3 records
   * *deleting* rather than keeping as decoration. It is a fact about the replication, like
   * {@link seed}, and it is stored where the other such facts are.
   *
   * `null` where the run measured nothing, by the same `NaN` → `null` rule as {@link metrics}.
   */
  readonly offeredPer5Min: number | null;
  /** `null` where the run measured nothing — see the module docstring on `NaN` versus `null`. */
  readonly metrics: Readonly<Record<BatchMetric, number | null>>;
}

export interface BatchArmResult {
  readonly armId: string;
  readonly dispatcherProfileId: string;
  readonly replications: readonly BatchReplication[];
}

/** One replication index at which two arms did **not** see the same passengers. */
export interface BatchCrnMismatch {
  readonly replication: number;
  readonly armId: string;
  readonly baselineArmId: string;
  /** The first disagreement found, named. A count would say nothing about what broke. */
  readonly detail: string;
}

/**
 * Whether the batch actually delivered common random numbers, checked rather than assumed.
 *
 * The rule is `runner/crn.ts`'s and is not restated here: the seed comes from the shipped
 * `replicationSeed` and the equivalence class from the shipped `traceKeyOf`. What this
 * records is the **audit** — `crn.ts`'s own docstring calls the digest *"a cheap continuous audit
 * rather than the primary evidence"* and names the primary evidence as comparing two dispatchers'
 * traces field for field. In a browser the traces of both arms of one replication are in memory at
 * the same instant, so the primary evidence is what is available and it is what is checked.
 */
export interface BatchCrnAudit {
  /** `traceKeyOf` over the shared simulation config. One value, or the batch would not have run. */
  readonly traceKey: string;
  /** Arm-to-baseline trace comparisons actually performed: `(arms − 1) × replications`. */
  readonly checkedComparisons: number;
  readonly mismatches: readonly BatchCrnMismatch[];
  readonly aligned: boolean;
}

export interface BatchResult {
  readonly buildingId: string;
  readonly buildingName: string;
  readonly seed: string;
  readonly durationS: number;
  readonly arrivalRatePctPop5min: number | null;
  readonly arms: readonly BatchArmResult[];
  readonly crn: BatchCrnAudit;
  /** Wall-clock milliseconds the batch took, from the injected clock. Diagnostic only. */
  readonly elapsedMs: number;
}

/* -------------------------------------------------------------------------- *
 * Progress
 * -------------------------------------------------------------------------- */

/**
 * One step of the batch, reported as it happens.
 *
 * W3: *"a worker plus a progress indicator covers it; the main thread must not block."* The
 * measured worst case is Vertical City at 196 ms per replication — a 50-replication two-arm batch
 * is twenty seconds of silence without this.
 */
export interface BatchProgress {
  /** Arm-replications finished. */
  readonly completed: number;
  /** `arms.length × replications`. */
  readonly total: number;
  readonly replication: number;
  readonly armId: string;
}

/* -------------------------------------------------------------------------- *
 * The worker protocol
 * -------------------------------------------------------------------------- */

/** Sent to the worker. One per batch; a second request needs a second worker. */
export interface BatchWorkerRequest {
  readonly kind: 'run';
  readonly request: BatchRequest;
}

/** Sent back, zero or more times, then exactly one of `done` or `failed`. */
export type BatchWorkerMessage =
  | { readonly kind: 'progress'; readonly progress: BatchProgress }
  | { readonly kind: 'done'; readonly result: BatchResult }
  | { readonly kind: 'failed'; readonly message: string };
