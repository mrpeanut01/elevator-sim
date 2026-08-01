/**
 * The vocabulary of a stored experiment: what goes on disk, what comes back, and what a
 * comparison is allowed to claim.
 *
 * docs/03-traffic-and-statistics.md § Part 5 is the governing paragraph:
 *
 * > Persist **per-run records, not aggregates**, with the seed attached, so any run can be
 * > replayed exactly and results re-analyzed without re-simulating.
 *
 * Everything here follows from taking that literally.
 *
 * ## What is stored, and what is deliberately not
 *
 * A {@link StoredRunRecord} is an **envelope around a `RunRecord`**, not a replacement for it.
 * `core`'s `RunRecord` already carries the per-passenger detail and the seed (CLAUDE.md
 * invariant 5) and already has its own schema version; what it does *not* carry is enough of the
 * *configuration* to rebuild the `SimulationConfig` that produced it. A record whose building,
 * dispatcher profile, traffic profile, demand template and run knobs are only implicit is not
 * replayable — it is replayable-looking, which is worse, because somebody will replay it against
 * whatever the defaults happen to be that month and compare the answer to the old one.
 *
 * So the envelope stores:
 *
 * - **identity** — experiment id, experiment seed, replication index, candidate id;
 * - **configuration** — {@link StoredRunConfig}, everything `runSimulation` needs except the
 *   contents of `data/`, which is referenced by id and versioned by the repository;
 * - **the dataset** — the whole `RunRecord`, per passenger, unaggregated;
 * - **the derivation** — {@link StoredRunConfig.summarize}, the summary options actually applied,
 *   so re-analysis reproduces the original headline numbers rather than merely similar ones.
 *
 * And it stores **no statistics at all**. AWT, WT95, saturation and every other headline is a
 * pure function of `(record, summarizeOptions)`, so storing one would be a second source of
 * truth that can drift from the first — see the same argument in `core/metrics/types.ts`. The
 * one concession is {@link StoredRunRecord.summaryFingerprint}, a digest rather than a value: it
 * cannot be read as a number, and its only use is to detect that a later build derives something
 * different from the same data. That is drift *detection*, which is the opposite of drift.
 *
 * ## No wall clock, on purpose
 *
 * There is no `writtenAt` field. `core` is forbidden a clock (invariant 3) and this package is
 * not, but a timestamp would make two records produced from the same seed and the same config
 * differ, and "byte-identical from the same inputs" is exactly the property the round-trip and
 * replay tests assert. Provenance that varies belongs in {@link StoredRunRecord.metadata}, where
 * a caller opts into it knowingly.
 *
 * ## What a comparison may claim
 *
 * The reporting half of this module exists to make one specific failure impossible: reporting a
 * rank order the statistics do not support. CLAUDE.md § Statistical discipline and
 * docs/03-traffic-and-statistics.md § Part 4 give the rules, and the types encode them rather
 * than leaving them to the caller's discretion:
 *
 * - a mean is never reported without an interval — {@link MetricEstimate} carries a
 *   {@link MeanEstimate} or is suppressed, and there is no third shape;
 * - a difference whose paired interval contains zero is `'indistinguishable'`, never ranked
 *   ({@link ComparisonVerdict});
 * - a saturated configuration is `'invalid'` and its wait statistics are suppressed;
 * - the replication count and whether the sequential stopping rule converged travel with every
 *   estimate ({@link ConvergenceReport}), because 10 replications and 200 are different claims.
 */

import type {
  BatchSizeCurve,
  CredentialAssignment,
  DayVariationConfig,
  DemandLevel,
  DemandTemplateId,
  DirectionalSplit,
  EligibilityStageConfig,
  InterfloorWeighting,
  ResolvedNormalization,
  PassengerMassOverride,
  PercentileMethod,
  ReportWindow,
  ResolvedDemandTemplate,
  RunRecord,
  SelectionStageConfig,
  SaturationThresholds,
  SimulationResult,
  TimeoutPolicy,
  TrafficModelVersion,
} from '@elevator-sim/core';

/* -------------------------------------------------------------------------- *
 * Errors and versioning
 * -------------------------------------------------------------------------- */

/**
 * A stored result that cannot be trusted: a bad envelope, a missing seed, a schema version this
 * build does not read, or a replay that did not reproduce its own record.
 *
 * Thrown rather than returned, for the reason `MetricsError` is: a result set that silently
 * absorbs a contradiction still produces numbers, and they look exactly like good ones.
 */
export class ReportsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportsError';
  }
}

/**
 * Format version of the {@link StoredRunRecord} envelope.
 *
 * Independent of `core`'s `METRICS_SCHEMA_VERSION`, which versions the `RunRecord` *inside* the
 * envelope. Two versions rather than one because the two shapes change for different reasons —
 * a new metric field is a `core` change, a new replay knob is an `experiments` change — and a
 * reader has to be able to say which of the two it cannot understand. Both are checked on the
 * way in, and a mismatch on either is refused rather than guessed at.
 */
export const REPORTS_SCHEMA_VERSION = 1;

/* -------------------------------------------------------------------------- *
 * Stored configuration
 * -------------------------------------------------------------------------- */

/** The `SimulationDemandOptions` a run was driven with, as stored. Every field is JSON. */
export interface StoredDemandOptions {
  readonly demandLevel?: DemandLevel | undefined;
  readonly arrivalRatePctPop5min?: number | undefined;
  readonly directionalSplit?: DirectionalSplit | undefined;
  readonly batchSharesDestination?: boolean | undefined;
  readonly entranceWeights?: Readonly<Record<string, number>> | undefined;
  readonly interfloorWeighting?: InterfloorWeighting | undefined;
  readonly credentialAssignment?: CredentialAssignment | undefined;
  readonly maxLegs?: number | undefined;
  readonly peakWindowS?: number | undefined;
  readonly baselineFraction?: number | undefined;
  /**
   * How much of a mix-varying template's authored arc the run kept.
   *
   * **Found missing by wave 13's T3 while adding the two fields below.** § D162 condition 5 makes
   * `0` the flat-mix negative control every mix-varying result must be measured against, and
   * `TRAFFIC_DEFAULTS.mixAmplitude` is `1` — so a stored control that lost this field would rebuild
   * at the full authored arc, the control carrying its treatment's mix.
   *
   * **Latent rather than realised**: `createStoredRun` has no non-test caller, so no shipped study
   * has been stored through this path and no published figure is in question. It is recorded as the
   * more serious of the three omissions all the same, because it predates the branch that found it
   * and sits under a published negative control.
   */
  readonly mixAmplitude?: number | undefined;
  /**
   * The group-size curve and the body-mass block, docs/14 §§ 2.1-2.2.
   *
   * These joined the list the moment they became reachable from `runSimulation`, and the reason is
   * the one `dispatcherOptionsOf` records beside `selection`: a field this projection drops is a
   * field the record does not carry, and a record that stores an override as nothing **replays as
   * the default**. For a group-size curve that is a different crowd; for a mass block it is a
   * different population in the same crowd. Either way it is an invariant-5 violation — the run
   * cannot be reproduced from its own record — and it is silent, because the replay succeeds.
   *
   * Both are plain JSON: `BatchSizeCurve` is a string, an optional number and an optional number
   * array; `PassengerMassOverride` is a string and four numbers.
   */
  readonly batchSize?: BatchSizeCurve | undefined;
  readonly passengerMass?: PassengerMassOverride | undefined;
  /**
   * The day this run was made a particular one, docs/14 § 2.3.
   *
   * Here for {@link batchSize}'s reason, and it is the sharpest instance of it yet: the block is
   * what the `dayVariation` stream is *drawn against*, so a record that lost it replays at
   * `demandFactor: 1` with the stream never consumed — a different number of people, arriving at
   * different times, reported as a faithful reproduction. The **configuration** is stored and not
   * the drawn factor: the draw is a function of the seed and the block, so storing the block is
   * what makes it reproducible, and storing the outcome instead would let the two disagree.
   */
  readonly dayVariation?: DayVariationConfig | undefined;
}

/**
 * Weight and constraint overrides applied on top of the named dispatcher profile.
 *
 * Stored because a Phase 7 optimizer's whole output is a weight vector, and a run reproduced
 * from the profile id alone would silently be the *un-tuned* run. Mirrors
 * `DispatchPolicyOptions`.
 */
export interface StoredDispatcherOptions {
  readonly eligibility?: EligibilityStageConfig | undefined;
  readonly normalization?: Partial<ResolvedNormalization> | undefined;
  /** Term id to weight. Replaces the profile's weight for that term only. */
  readonly weights?: Readonly<Record<string, number>> | undefined;
  /** Replaces the profile's hard-constraint set entirely when present. */
  readonly hardConstraints?: readonly string[] | undefined;
  /**
   * The weight-set selection stage the run overrode, field by field.
   *
   * Six scalars, so it round-trips exactly. The *arms* it selects among do not appear here and
   * are not stored: for a shipped run they are derived from `data/dispatcher-profiles.json`, which
   * a replay re-reads the same way it re-reads the profile itself, and for a study that handed in
   * a derived library `createStoredRun` refuses rather than storing a configuration it cannot
   * reconstruct.
   */
  readonly selection?: SelectionStageConfig | undefined;
}

/** The runner's own tunables (`SIM_PARAMETERS`), as stored. Omitted fields took their defaults. */
export interface StoredSimOptions {
  readonly transferWalkS?: number | undefined;
  readonly dispatchRetryS?: number | undefined;
  readonly drainGraceS?: number | undefined;
  readonly queueSampleCount?: number | undefined;
  readonly doorObstructionProbability?: number | undefined;
  readonly maxEvents?: number | undefined;
  readonly onTimeout?: TimeoutPolicy | undefined;
}

/**
 * The summary options a run's headline numbers were derived with.
 *
 * This is the field that makes "re-analysis reproduces the original summary exactly" a checkable
 * claim rather than an aspiration. Two of these matter more than they look:
 *
 * - **`window`** is stored as a fully resolved {@link ReportWindow}, never as `'peak-5min'`. The
 *   derived selections depend on the record's arrival distribution, and re-deriving one is a
 *   different operation from replaying one.
 * - **`terminalFloorIds`** decides the achieved interval, and `Simulation` supplies the
 *   building's entrance floors by default. A re-analysis that omitted it would let
 *   `achievedIntervalOf` *infer* a terminal from the busiest landing — usually the same answer,
 *   which is precisely why the difference would go unnoticed until it did not.
 */
export interface StoredSummarizeOptions {
  readonly window?: ReportWindow | undefined;
  readonly longWaitThresholdS?: number | undefined;
  readonly percentileMethod?: PercentileMethod | undefined;
  readonly waitHistogramBinSeconds?: number | undefined;
  readonly loadFactorEdges?: readonly number[] | undefined;
  readonly designLoadFactor?: number | undefined;
  readonly carIds?: readonly string[] | undefined;
  readonly saturation?: Partial<SaturationThresholds> | undefined;
  readonly queueSampleCount?: number | undefined;
  readonly maxUnservedFraction?: number | undefined;
  readonly maxWaitHorizonS?: number | undefined;
  readonly terminalFloorIds?: readonly string[] | undefined;
  readonly departureGapS?: number | undefined;
}

/**
 * Everything needed to rebuild the `SimulationConfig` that produced a stored run, except the
 * contents of `data/`.
 *
 * Reference data is stored **by id**, not by value. A `ResolvedBuilding` is a few hundred
 * kilobytes of expanded floors and resolved cars, and inlining it into every one of twenty
 * thousand records would dwarf the passenger detail those records exist for. The ids are
 * resolved against a `LoadedConfig` at replay time and the version of `data/` is the
 * repository's business — which is a real limitation, stated here rather than discovered later:
 * editing `data/` invalidates stored results, exactly as editing the simulator does.
 */
export interface StoredRunConfig {
  /**
   * The master seed of this replication, as a **decimal string**.
   *
   * CLAUDE.md invariant 5. A string because a 64-bit seed does not survive `JSON.stringify` as a
   * `bigint` and loses precision as a `number`. Cross-checked against `record.seed` on parse:
   * two different seeds on one record is an unreplayable record.
   */
  readonly seed: string;
  /**
   * The demand seed, as a decimal string — present only when the run was given one.
   *
   * The other half of invariant 5 on a run that separated the crowd from the machine. A replay
   * given only {@link seed} would rebuild the same building and drive it with a different crowd,
   * and the record it produced would diverge on every leg while looking like a determinism failure
   * in `core`.
   *
   * Absent, never equal to {@link seed}, when the run was given none — which records how the run
   * was authored rather than a difference in its trace. A traffic seed equal to the run seed
   * derives the same demand streams and produces the same legs; `random/streams.test.ts` asserts
   * that stream by stream, and it was measured end to end on garden-apartments. The field earns
   * its place on the case it exists for — a seed that *differs* from the run seed, where dropping
   * it replays a different crowd — and costs nothing on the case it does not.
   *
   * Mirrors `RunRecord.trafficSeed` and is cross-checked against it on parse.
   */
  readonly trafficSeed?: string | undefined;
  /**
   * Which traffic draw ordering produced the run — present only when it was not `v1`.
   *
   * Not a tunable: it names *which simulator* wrote the dataset. Stored because the replay has to
   * ask for it back — a stored `v2` run rebuilt without it re-runs under `v1`, which is a different
   * trace at the same seed rather than a slightly different answer.
   *
   * Absent at `v1` however it was reached, because a `v1` run is the run this repository produced
   * before the option existed. Mirrors `RunRecord.trafficModel` and is cross-checked against it on
   * parse: two statements about which simulator ran is one statement too many unless they agree.
   */
  readonly trafficModel?: TrafficModelVersion | undefined;
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  /**
   * The traffic profile id the building declares.
   *
   * Redundant with the building — `ResolvedBuilding.trafficProfile` names it — and stored anyway,
   * because a result set is regularly grouped and filtered by it long after the building configs
   * have moved on, and re-deriving it would mean loading `data/` to read a label.
   */
  readonly trafficProfileId: string;
  /** `'rise-and-fall'`/`'constant-iso'`, or the fully resolved template when one was supplied. */
  readonly demandTemplate: DemandTemplateId | ResolvedDemandTemplate;
  /** Demand horizon in seconds, when the run overrode the template's own duration. */
  readonly durationS?: number | undefined;
  readonly demand?: StoredDemandOptions | undefined;
  readonly dispatcherOptions?: StoredDispatcherOptions | undefined;
  readonly sim?: StoredSimOptions | undefined;
  /** The derivation applied to the record. See {@link StoredSummarizeOptions}. */
  readonly summarize?: StoredSummarizeOptions | undefined;
  /**
   * The run id, stored so a caller-supplied one survives replay.
   *
   * `Simulation` defaults it to `<buildingId>-<profileId>-<seed>`, which is deterministic, so
   * this is only load-bearing when the runner named its replications itself — which a sweep
   * does, to keep 20 000 records addressable.
   */
  readonly runId?: string | undefined;
  /** Whether `elevatorSpecs` was supplied. See `SimulationConfig.elevatorSpecs`. */
  readonly usesElevatorSpecs?: boolean | undefined;
}

/* -------------------------------------------------------------------------- *
 * The stored record
 * -------------------------------------------------------------------------- */

/**
 * One replication on disk: identity, configuration, and the per-passenger dataset.
 *
 * Self-describing by design — no file header, no shared preamble — so that a newline-delimited
 * set can be appended to as replications finish, truncated by a crash without corrupting the
 * lines that landed, and split across machines by cutting it anywhere. Every line carries its
 * own schema version and its own seed, which is what makes any single line replayable on its
 * own.
 */
export interface StoredRunRecord {
  /** {@link REPORTS_SCHEMA_VERSION}. Checked on parse; a mismatch is refused, never coerced. */
  readonly schemaVersion: number;
  /** The experiment this replication belongs to, e.g. `up-peak-dispatcher-sweep`. */
  readonly experimentId: string;
  /**
   * The experiment's master seed, as a decimal string.
   *
   * Distinct from {@link StoredRunConfig.seed}, which is *this replication's* seed. The
   * replication seeds of a batch are derived from this one, so recording it is what lets a whole
   * batch — not merely one run — be regenerated, and what lets two candidates be checked for
   * having genuinely shared their traces (common random numbers).
   */
  readonly experimentSeed: string;
  /** Index of this replication within its batch, from 0. */
  readonly replication: number;
  /**
   * Which alternative under comparison this run belongs to.
   *
   * Usually the dispatcher profile id, but not always: a sweep over weight vectors runs many
   * candidates against one profile id, and a candidate is whatever the comparison treats as one
   * thing. Kept separate from {@link StoredRunConfig.dispatcherProfileId} for that reason.
   */
  readonly candidateId: string;
  readonly config: StoredRunConfig;
  /** The seed-bearing per-passenger dataset, exactly as `core` produced it. */
  readonly record: RunRecord;
  /**
   * Digest of the `RunSummary` as first computed, for drift detection only.
   *
   * Not a statistic and not readable as one. See the module docstring: storing the summary itself
   * would create a second source of truth; storing a hash of it lets re-analysis assert that this
   * build still derives the same numbers from the same data, and say so loudly when it does not.
   */
  readonly summaryFingerprint?: string | undefined;
  /** Free-form provenance. The only place a wall-clock timestamp may legitimately appear. */
  readonly metadata?: Readonly<Record<string, string | number | boolean>> | undefined;
}

/* -------------------------------------------------------------------------- *
 * Replay
 * -------------------------------------------------------------------------- */

/**
 * The result of replaying a stored run and comparing the outcome against what was stored.
 *
 * docs/05-roadmap.md § Phase 3 acceptance: "Any stored run replays to identical results from its
 * seed." {@link identical} is that criterion, decided by comparing canonical serializations of
 * the whole record rather than a headline number — two runs can agree on AWT to fifteen decimal
 * places and disagree about which car served whom.
 */
export interface ReplayOutcome {
  readonly identical: boolean;
  /** The replayed run, whatever the verdict. Present so a failure can be inspected. */
  readonly result: SimulationResult;
  /** Canonical digest of the stored record. */
  readonly storedFingerprint: string;
  /** Canonical digest of the replayed record. */
  readonly replayedFingerprint: string;
  /**
   * Human-readable, first-difference-first list of what diverged. Empty iff {@link identical}.
   *
   * Truncated to a readable number of entries: a replay that diverges in the first passenger
   * diverges in all of them, and printing four thousand lines hides the one that matters.
   */
  readonly differences: readonly string[];
  /** Whether the re-derived summary still matches {@link StoredRunRecord.summaryFingerprint}. */
  readonly summaryMatches?: boolean | undefined;
}

/* -------------------------------------------------------------------------- *
 * Per-replication observations
 * -------------------------------------------------------------------------- */

/**
 * One replication's headline numbers, flattened.
 *
 * The unit of independence in every statistic this module computes
 * (docs/03-traffic-and-statistics.md § Part 3: observations *within* a run are correlated, so the
 * replication is the only thing a confidence interval may be taken over).
 *
 * A projection of `RunSummary` rather than the thing itself, for two reasons. It is what a
 * comparison actually needs, so a sweep can hold 20 000 of these in memory while the records
 * stay on disk; and it makes the statistical layer testable with plain object literals instead of
 * a full simulation, which matters because the statistics are the part that must not be wrong.
 *
 * `NaN` is a legitimate value here — "nobody was served, so there is no mean" — and is never
 * silently replaced by zero. {@link awtIsValid} is the flag that decides whether the wait numbers
 * may be used at all.
 */
export interface ReplicationObservation {
  readonly runId: string;
  /**
   * This replication's seed, as a decimal string. **The common-random-numbers pairing key.**
   *
   * Two candidates are paired replication-by-replication on equal seeds, because equal seeds are
   * what "the same passenger traces fed to every alternative" means operationally. Pairing on
   * replication index instead would pair two runs that saw different passengers and quietly
   * discard the variance reduction the whole method exists for.
   */
  readonly seed: string;
  readonly replication?: number | undefined;
  readonly buildingId?: string | undefined;
  readonly dispatcherProfileId?: string | undefined;
  readonly windowSeconds: number;
  /** Legs whose arrival fell in the reporting window. */
  readonly arrivals: number;
  readonly served: number;
  readonly unserved: number;
  /** **AWT**, seconds. `NaN` when nobody was served. */
  readonly awtS: number;
  /** **WT95**, seconds. */
  readonly wt95S: number;
  /** Percentage of served legs waiting longer than the long-wait threshold. */
  readonly pctOverLongWait: number;
  /** **TTD**, seconds, per journey across every leg and transfer. */
  readonly ttdS: number;
  /** Achieved interval, seconds — the spacing of departures from the terminal. */
  readonly achievedIntervalS: number;
  /** Achieved handling capacity, persons per 5 minutes. */
  readonly personsPer5Min: number;
  readonly saturated: boolean;
  /** `RunSummary.awtIsValid`. `false` suppresses every wait statistic for this replication. */
  readonly awtIsValid: boolean;
  readonly awtInvalidReason?: string | undefined;
}

/* -------------------------------------------------------------------------- *
 * Metrics
 * -------------------------------------------------------------------------- */

/** Which direction is an improvement. There is no metric for which this is a matter of taste. */
export type MetricDirection = 'lower-is-better' | 'higher-is-better';

/**
 * A reportable metric, declared as data.
 *
 * CLAUDE.md invariant 7 applied to reporting: adding "% of passengers waiting over 90 s" to every
 * report is a table entry, not a new branch in the formatter, and nothing downstream reads a
 * metric id to decide how to behave.
 */
export interface MetricSpec {
  readonly id: string;
  readonly label: string;
  /** SI unit for display, or `''` for a dimensionless quantity. */
  readonly unit: string;
  readonly direction: MetricDirection;
  /** Decimal places for display. */
  readonly precision: number;
  /**
   * Whether saturation invalidates this metric.
   *
   * `true` for every waiting-time metric: docs/03-traffic-and-statistics.md is explicit that a
   * diverging queue makes AWT "not remotely normal" and that the interval must be suppressed.
   *
   * `false` for throughput and interval. A saturated system's *achieved* handling capacity is a
   * real measurement — it is the ceiling the demand exceeded, and suppressing it would hide the
   * evidence of why the configuration failed. The candidate is still flagged saturated, so no
   * reader can mistake the one for a clean bill of health.
   */
  readonly invalidatedBySaturation: boolean;
  /** How to read this metric off one replication. */
  readonly valueOf: (observation: ReplicationObservation) => number;
}

/* -------------------------------------------------------------------------- *
 * Interval estimates
 * -------------------------------------------------------------------------- */

/**
 * Which quantile family produced an interval's half-width.
 *
 * **Nothing in this package produces `'z'` any more.** Every estimator here is Student-t at
 * `n - 1`, at every `n` — on the published path and in the sequential stopping rule alike (see
 * `statistics.ts` § "One quantile" and DECISIONS.md § D7). `'z'` is retained in the union for two
 * reasons: a *stored* `RunSet` written before 2026-07 carries `method: 'z'` and must still parse
 * and replay, and `formatMeanEstimate` keeps a `normal(z)` arm so that a hand-built or future
 * normal-approximation estimate announces itself instead of hiding behind a `t`-shaped label.
 * Narrowing this to `'t'` would break the first and silence the second.
 */
export type IntervalMethod = 't' | 'z';

/**
 * A mean and the interval around it, never one without the other.
 *
 * docs/03-traffic-and-statistics.md § Part 4, "Use a paired-t interval", prescribes the method:
 * Student-t at `n - 1` degrees of freedom, with no `n` in the choice of family. Both are recorded
 * on the estimate ({@link method}, {@link degreesOfFreedom}) so a half-width can be re-derived by
 * hand. The `n > 25` normal approximation § Part 3 **used to** prescribe for loop control is not
 * what any estimator in this package uses, and since 2026-07-27 is not what that section says
 * either; conflating the two was review finding #14.
 *
 * Also from that section, and the reason AWT is treated as normal at all: Peters & Abbi rejected
 * Cox's lognormal interval because at 1000 runs it put a 5 s mean between 0.7 s and 36.1 s. The
 * normal approximation for the *mean* is the defensible, standard answer.
 */
export interface MeanEstimate {
  /** Replications the estimate is over. */
  readonly n: number;
  readonly mean: number;
  /** Sample standard deviation across replications (`n - 1`). `NaN` for `n < 2`. */
  readonly stdDev: number;
  /** `stdDev / sqrt(n)` — the precision of {@link mean}, not the spread of the runs. */
  readonly standardError: number;
  /** Two-sided confidence level as a fraction, e.g. `0.95`. */
  readonly confidence: number;
  readonly method: IntervalMethod;
  /** `n - 1`. `NaN` only for `n < 2`, or on a stored estimate that predates the t-always fix. */
  readonly degreesOfFreedom: number;
  /** `quantile * standardError`. `NaN` for `n < 2`: one run has no measurable spread. */
  readonly halfWidth: number;
  readonly lower: number;
  readonly upper: number;
  /** Smallest and largest replication values, for judging whether a mean is a fair summary. */
  readonly min: number;
  readonly max: number;
}

/** Whether {@link MeanEstimate.lower} and {@link MeanEstimate.upper} straddle zero. */
export function intervalContainsZero(estimate: MeanEstimate): boolean {
  if (!Number.isFinite(estimate.lower) || !Number.isFinite(estimate.upper)) return false;
  return estimate.lower <= 0 && estimate.upper >= 0;
}

/**
 * One metric of one candidate: an interval, or an explicit refusal to report one.
 *
 * The two states are exclusive by construction — {@link estimate} is present iff
 * {@link suppressed} is `false` — so there is no way to render a bare mean by forgetting a
 * branch.
 */
export interface MetricEstimate {
  readonly metricId: string;
  readonly label: string;
  readonly unit: string;
  readonly direction: MetricDirection;
  readonly precision: number;
  readonly suppressed: boolean;
  /** Present iff {@link suppressed} is `false`. */
  readonly estimate?: MeanEstimate | undefined;
  /** Why the estimate is suppressed. Present iff {@link suppressed} is `true`. */
  readonly suppressedReason?: string | undefined;
  /**
   * Replications excluded from {@link estimate} because they were statistically invalid.
   *
   * Always reported, because dropping them is **selection on the outcome variable**: the runs
   * whose queues diverged are exactly the runs with the longest waits (see
   * `core/metrics/types.ts` § SaturationThresholds). A non-zero count is a caveat on the number
   * beside it, not an accounting detail.
   */
  readonly excludedReplications: number;
}

/* -------------------------------------------------------------------------- *
 * Convergence
 * -------------------------------------------------------------------------- */

/**
 * Whether the sequential stopping rule was satisfied, or the replication cap was.
 *
 * These are different claims and reporting them as one is how a sweep comes to believe a number
 * it has not earned. `'converged'` means the half-width fell inside the acceptable range;
 * `'hit-cap'` means it did not and the budget ran out, which makes the interval wider than the
 * experiment asked for and the comparison correspondingly weaker.
 */
export type ConvergenceStatus = 'converged' | 'hit-cap' | 'in-progress' | 'not-assessed';

export interface ConvergenceReport {
  readonly status: ConvergenceStatus;
  /** The metric the stopping rule was assessed on. Usually AWT. */
  readonly metricId: string;
  readonly replications: number;
  /** The budget, when one was set. */
  readonly replicationCap?: number | undefined;
  /** The acceptable half-width the rule was aiming at, in the metric's own unit. */
  readonly targetHalfWidth?: number | undefined;
  /** The half-width actually achieved. `NaN` when fewer than two replications. */
  readonly achievedHalfWidth: number;
  readonly confidence: number;
  /**
   * Which quantile family produced {@link achievedHalfWidth} — **absent when there is none.**
   *
   * Optional, and that is the point. This field was required, so a report whose headline metric
   * was suppressed still *named* a family for an interval that does not exist: `achievedHalfWidth`
   * `NaN` beside `method: 't'` reads as "a t-interval, of unknown width" rather than "no interval".
   * C5 fixed the case where that label was *wrong*; open item `C33` is the case where it was merely
   * unearned. An absent interval has no family and now says so.
   *
   * Widening a required field to optional is not a weakened claim here — it is a stricter one. The
   * only construction site, `compare.ts`'s `convergenceOf`, is narrowed to the published family in
   * the *presence* case by `PublishedConvergenceReport`, so `'z'` remains unwritable; what changed
   * is that the absence case can no longer borrow a label. `ConvergenceReport` is not persisted —
   * `persistence.ts` stores `StoredRunRecord`s, never reports — so no stored shape moves.
   */
  readonly method?: IntervalMethod | undefined;
}

/* -------------------------------------------------------------------------- *
 * Candidate reports
 * -------------------------------------------------------------------------- */

/**
 * Everything a report may say about one alternative, on its own.
 *
 * Note what is *not* here: any comparison. A candidate report cannot rank anything, because
 * ranking from two candidates' own intervals is the documented error
 * (docs/03-traffic-and-statistics.md: "two overlapping confidence intervals do **not** imply no
 * significant difference"). Ranking lives in {@link CandidateComparison}, which only exists in
 * paired form.
 */
export interface CandidateReport {
  readonly candidateId: string;
  readonly label?: string | undefined;
  readonly buildingId?: string | undefined;
  readonly dispatcherProfileId?: string | undefined;
  /** Replications stored for this candidate. */
  readonly replications: number;
  /** Of those, how many carried usable wait statistics (`awtIsValid`). */
  readonly usableReplications: number;
  /** Of those, how many were flagged saturated. */
  readonly saturatedReplications: number;
  /** Of those, how many were invalid for any reason — saturation, censoring or emptiness. */
  readonly invalidReplications: number;
  /**
   * Whether this candidate's wait statistics may be reported at all.
   *
   * `false` marks the configuration **statistically invalid**, which is a stronger statement
   * than "noisy": it means no interval will be printed and no comparison involving it will be
   * ranked, however large the apparent difference.
   */
  readonly statisticallyValid: boolean;
  readonly invalidReason?: string | undefined;
  readonly metrics: readonly MetricEstimate[];
  readonly convergence: ConvergenceReport;
  /** The replication seeds, in stored order. The pairing keys for a CRN comparison. */
  readonly seeds: readonly string[];
  /** Caveats that must be printed with the numbers, not filed away. */
  readonly warnings: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * Comparisons
 * -------------------------------------------------------------------------- */

/**
 * What a paired comparison is allowed to conclude.
 *
 * - `'better'` / `'worse'` — the paired-t interval on the differences **excludes zero**. The only
 *   two verdicts that may be phrased as a rank order.
 * - `'indistinguishable'` — the interval **contains zero**. Stated explicitly, with the noise
 *   floor, because "no difference detected" and "the difference is smaller than we can measure"
 *   are the same fact and neither is a tie in the candidates' favour.
 * - `'invalid'` — one side is saturated, the replications are not paired, or there are too few
 *   pairs to form an interval. No comparison is reported, in either direction.
 */
export type ComparisonVerdict = 'better' | 'worse' | 'indistinguishable' | 'invalid';

/** One metric, compared pairwise between a candidate and the baseline. */
export interface MetricComparison {
  readonly metricId: string;
  readonly label: string;
  readonly unit: string;
  readonly direction: MetricDirection;
  readonly precision: number;
  /** Pairs the difference was computed over. */
  readonly pairs: number;
  /**
   * `candidate - baseline`, in the metric's own unit. Sign is raw; {@link direction} decides
   * whether a negative number is an improvement.
   */
  readonly meanDifference: number;
  /** The paired-t interval on the differences. Absent when the comparison is not supportable. */
  readonly estimate?: MeanEstimate | undefined;
  /**
   * The half-width of {@link estimate} — the smallest difference this comparison could have
   * detected. A difference below it is indistinguishable from zero, by definition.
   */
  readonly noiseFloor: number;
  readonly verdict: ComparisonVerdict;
  /** Why the verdict is what it is. Always present for `'invalid'` and `'indistinguishable'`. */
  readonly reason?: string | undefined;
}

/** One candidate against the baseline, over every metric. */
export interface CandidateComparison {
  readonly baselineId: string;
  readonly candidateId: string;
  /** Seeds present on both sides, in baseline order. The paired sample. */
  readonly pairedSeeds: readonly string[];
  /**
   * Whether every replication on both sides was paired.
   *
   * `false` means the comparison threw away runs to form pairs, so it is weaker than its
   * replication count suggests and the variance reduction CRN exists for was partly lost
   * (docs/03-traffic-and-statistics.md § Part 4: 5–20× fewer runs for equal confidence).
   */
  readonly crn: boolean;
  readonly valid: boolean;
  readonly invalidReason?: string | undefined;
  readonly metrics: readonly MetricComparison[];
  readonly warnings: readonly string[];
}

/** A candidate set, its baseline, and every paired comparison between them. */
export interface ComparisonReport {
  readonly title: string;
  readonly confidence: number;
  readonly baseline: CandidateReport;
  /** Candidates other than the baseline, in the order supplied. Never sorted by result. */
  readonly candidates: readonly CandidateReport[];
  readonly comparisons: readonly CandidateComparison[];
  /** Report-level caveats: replication budget, CRN coverage, saturated candidates. */
  readonly notes: readonly string[];
}
