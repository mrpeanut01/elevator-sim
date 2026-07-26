/**
 * The Phase 3 acceptance gate's apparatus.
 *
 * `docs/05-roadmap.md` § Phase 3 states four acceptance criteria, and every one of them is a
 * claim about *this* simulator driven by *this* runner rather than about a fixture:
 *
 * 1. a dispatcher compared against itself yields a paired-t interval containing zero;
 * 2. compared against a deliberately crippled variant, an interval excluding zero;
 * 3. common random numbers measurably reduce the variance of the difference;
 * 4. any stored run replays to identical results from its seed.
 *
 * This module owns the plumbing the four gate suites share — building arms, pulling paired
 * samples out of a finished result, the paired-t arithmetic, and the two ways of pairing two
 * dispatchers (CRN and independent). It contains no assertions and no thresholds; the suites
 * decide what a number means.
 *
 * ## Two rules this module is written to obey
 *
 * **Config only, never code.** A crippled dispatcher is a weight vector or a stage setting
 * (CLAUDE.md invariant 7). {@link derivedProfile} produces one by patching a loaded
 * `DispatcherProfile` and {@link withProfiles} registers it under a fresh id, which is what
 * `ExperimentResources` exists to allow. Nothing here branches on a profile id.
 *
 * **Nothing is tuned to pass.** Every threshold a suite applies is either the doc's
 * (`± 2 s` at 90 % for the stopping rule; 95 % for a published interval) or arithmetic
 * (`interval excludes zero`). The measured numbers are reported, not compared against a
 * tolerance chosen after seeing them.
 */

import { loadConfig } from '@elevator-sim/core';
import type { DispatcherProfile, LoadedConfig } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';

import { estimateMean, pairedDifferenceEstimate } from '../reports/statistics.js';
import type { MeanEstimate } from '../reports/types.js';
import { runExperiment } from '../runner/replicationRunner.js';
import { halfWidthStoppingRule } from '../runner/stopping.js';
import type { ReplicationMetric } from '../runner/metrics.js';
import type {
  CellResult,
  DispatcherArmSpec,
  ExperimentResources,
  ExperimentResult,
  ExperimentRunOptions,
  ExperimentSpec,
  StoppingRule,
  TrafficArmSpec,
} from '../runner/types.js';

/* -------------------------------------------------------------------------- *
 * Resources
 * -------------------------------------------------------------------------- */

/** The repository's `data/` directory. The gate runs against the real reference data. */
export const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let cached: LoadedConfig | undefined;

/** `loadConfig(DATA_DIR)`, once per process. */
export async function loadResources(): Promise<LoadedConfig> {
  cached ??= await loadConfig(DATA_DIR);
  return cached;
}

/**
 * A dispatcher profile patched into a variant, under a new id.
 *
 * Data, not code: the result is a `DispatcherProfile` of exactly the shape `loadConfig` produces,
 * and the simulator cannot tell it from one that was authored in
 * `data/dispatcher-profiles.json`. `weights` is *merged* (so a variant can zero one term and
 * leave the rest), everything else is replaced wholesale.
 */
export function derivedProfile(
  base: DispatcherProfile,
  id: string,
  patch: Partial<Omit<DispatcherProfile, 'id'>> & {
    readonly weights?: Readonly<Record<string, number>> | undefined;
  },
): DispatcherProfile {
  const { weights, ...rest } = patch;
  return Object.freeze({
    ...base,
    ...rest,
    id,
    name: patch.name ?? `${base.name} (${id})`,
    weights: Object.freeze({ ...base.weights, ...(weights ?? {}) }),
  }) as DispatcherProfile;
}

/** A `LoadedConfig` with extra dispatcher profiles registered, for a variant arm to reference. */
export function withProfiles(
  config: LoadedConfig,
  extra: readonly DispatcherProfile[],
): ExperimentResources {
  const dispatcherProfilesById = new Map(config.dispatcherProfilesById);
  for (const profile of extra) dispatcherProfilesById.set(profile.id, profile);
  return Object.freeze({
    buildingsById: config.buildingsById,
    dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  });
}

/* -------------------------------------------------------------------------- *
 * Traffic arms
 * -------------------------------------------------------------------------- */

/** The building every gate suite runs on. docs/05-roadmap.md § Phase 3's own worked example. */
export const GATE_BUILDING = 'midtown-office';

/**
 * The gate's master seed, and the replication count every comparison is measured at.
 *
 * 100 sits in the middle of docs/03-traffic-and-statistics.md's 50–200 budget, and being *fixed*
 * rather than adaptive is what makes a measured variance a variance over a known `n`. The
 * sequential stopping rule is exercised separately, in `sequentialStopping.test.ts`.
 */
export const GATE_SEED = 20_260_726;
export const GATE_REPLICATIONS = 100;

/**
 * Midtown Office under the closed form's operating conditions: all traffic incoming through the
 * main entrance, 900 s horizon, peak 5 minutes reported.
 *
 * ## Why this arm, and why 1 % of population per 5 minutes
 *
 * The arm because it is where dispatchers separate — ~15.7 s AWT under `eta` against ~23.1 s under
 * `nearest-car` — and because it is the configuration the Phase 2 closed-form oracle was validated
 * against.
 *
 * The **rate** because of a constraint the roadmap does not mention and the gate cannot argue with:
 * a cell's AWT interval is suppressed if *any* replication saturated (`CellAggregate.awtIsValid`,
 * following docs/03-traffic-and-statistics.md § Part 3), and at n = 100 that is a demanding test.
 * `operatingPoint.test.ts` measures the census: at 2 % this building's `eta` already saturates one
 * replication in a hundred and at 4 % it is two, so every criterion here would have to be argued
 * from a statistic the project's own rules forbid quoting. At 1 % both `eta` and `nearest-car`
 * come back 0/100 saturated with a valid AWT, so the gate measures what it claims to measure.
 * That is an *operating point*, not a loosened tolerance: nothing about the criteria changes, and
 * the census that justifies the choice is part of the suite.
 */
export const MIDTOWN_UP_PEAK: TrafficArmSpec = Object.freeze({
  id: 'up-peak',
  durationS: 900,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
    entranceWeights: Object.freeze({ G: 1, P1: 0 }),
    arrivalRatePctPop5min: 1,
    peakWindowS: 300,
  }),
});

/** The same arm at an arbitrary rate, for the saturation census. */
export function midtownUpPeakAt(arrivalRatePctPop5min: number): TrafficArmSpec {
  return Object.freeze({
    ...MIDTOWN_UP_PEAK,
    id: `up-peak-${arrivalRatePctPop5min}`,
    demand: Object.freeze({ ...MIDTOWN_UP_PEAK.demand, arrivalRatePctPop5min }),
  });
}

/** Garden Apartments, the cheap second building, for the census's cross-check. */
export function gardenAt(arrivalRatePctPop5min: number): TrafficArmSpec {
  return Object.freeze({
    id: `healthy-${arrivalRatePctPop5min}`,
    durationS: 900,
    demand: Object.freeze({ arrivalRatePctPop5min, peakWindowS: 300 }),
  });
}

/* -------------------------------------------------------------------------- *
 * Running
 * -------------------------------------------------------------------------- */

/** The production stopping rule: the doc's half-width arithmetic, from `reports/statistics`. */
export const productionStoppingRule: StoppingRule = halfWidthStoppingRule((samples, { confidence }) =>
  estimateMean(samples, { confidence }),
);

export interface GateRunInput {
  readonly id: string;
  readonly seed: number | string;
  readonly building: string;
  readonly dispatchers: readonly (string | DispatcherArmSpec)[];
  readonly traffic: TrafficArmSpec;
  /** Fixed replication budget. The gate fixes it so a measured variance is over a known `n`. */
  readonly replications: number;
  readonly resources: ExperimentResources;
  /** Omitted by default: a fixed budget is what a variance measurement needs. */
  readonly stoppingRule?: StoppingRule | undefined;
  readonly replicationOverrides?: ExperimentSpec['replication'] | undefined;
}

/**
 * Run one experiment at a fixed replication budget, serially, without retaining records.
 *
 * Serial and `keepRecords: false` are both about the gate itself rather than about the result:
 * `parallel.test.ts` already pins that the executor cannot move a number, and 200 replications
 * of retained records is gigabytes for data no comparison reads.
 */
export async function runGateExperiment(input: GateRunInput): Promise<ExperimentResult> {
  const spec: ExperimentSpec = {
    id: input.id,
    seed: input.seed,
    buildings: [input.building],
    dispatchers: input.dispatchers,
    traffic: [input.traffic],
    replication: {
      minReplications: input.replications,
      maxReplications: input.replications,
      checkEvery: Math.max(1, Math.min(8, input.replications)),
      ...(input.replicationOverrides ?? {}),
    },
    parallel: { mode: 'serial' },
  };
  const options: ExperimentRunOptions = {
    keepRecords: false,
    ...(input.stoppingRule === undefined ? {} : { stoppingRule: input.stoppingRule }),
  };
  return await runExperiment(spec, input.resources, options);
}

/* -------------------------------------------------------------------------- *
 * Reading samples out of a result
 * -------------------------------------------------------------------------- */

/** The cell whose dispatcher arm has this id. @throws Error when there is not exactly one. */
export function cellOf(result: ExperimentResult, dispatcherArmId: string): CellResult {
  const matches = result.cells.filter((cell) => cell.dispatcherArmId === dispatcherArmId);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one cell for dispatcher arm "${dispatcherArmId}" in experiment "${result.experimentId}"; found ${matches.length} (${result.cells.map((cell) => cell.dispatcherArmId).join(', ')}).`,
    );
  }
  return matches[0] as CellResult;
}

/**
 * One metric's per-replication values for an arm, **in replication-index order**.
 *
 * Index order is the whole of the pairing: `a[i] - b[i]` is only a paired difference because
 * index `i` names the same passenger population on both sides.
 */
export function samplesOf(
  result: ExperimentResult,
  dispatcherArmId: string,
  metric: ReplicationMetric,
): readonly number[] {
  return cellOf(result, dispatcherArmId).aggregate.metrics[metric].samples;
}

/** The per-replication trace digests for an arm, in index order. The CRN audit trail. */
export function digestsOf(result: ExperimentResult, dispatcherArmId: string): readonly string[] {
  return cellOf(result, dispatcherArmId).replications.map((record) => record.traceDigest);
}

/* -------------------------------------------------------------------------- *
 * Paired analysis
 * -------------------------------------------------------------------------- */

/** A paired comparison of two arms on one metric, with everything a report needs to quote it. */
export interface PairedComparison {
  readonly metric: ReplicationMetric;
  readonly n: number;
  readonly candidate: readonly number[];
  readonly baseline: readonly number[];
  readonly differences: readonly number[];
  /** `candidate - baseline`, paired-t. Negative mean means the candidate waits less. */
  readonly estimate: MeanEstimate;
  /** `true` when the interval excludes zero: a significant difference. */
  readonly significant: boolean;
  /** Variance of the paired differences, `n - 1` denominator. */
  readonly varianceOfDifference: number;
  readonly candidateMean: number;
  readonly baselineMean: number;
  readonly varianceCandidate: number;
  readonly varianceBaseline: number;
  /** `Cov(candidate, baseline) / sqrt(Var·Var)`. The quantity CRN is supposed to drive positive. */
  readonly correlation: number;
  /** Largest `|difference|` seen. Zero for an exactly-identical pair of arms. */
  readonly maxAbsDifference: number;
  /** Paired differences that were exactly `0`. */
  readonly exactZeroCount: number;
}

function varianceOf(values: readonly number[]): number {
  if (values.length < 2) return Number.NaN;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  let sum = 0;
  for (const value of values) sum += (value - mean) ** 2;
  return sum / (values.length - 1);
}

function covarianceOf(a: readonly number[], b: readonly number[]): number {
  if (a.length < 2 || a.length !== b.length) return Number.NaN;
  const meanA = a.reduce((total, value) => total + value, 0) / a.length;
  const meanB = b.reduce((total, value) => total + value, 0) / b.length;
  let sum = 0;
  for (const [index, value] of a.entries()) sum += (value - meanA) * ((b[index] as number) - meanB);
  return sum / (a.length - 1);
}

/**
 * The paired-t comparison of two equal-length sample series.
 *
 * The **only** method CLAUDE.md § Statistical discipline permits for declaring one alternative
 * better than another. Confidence defaults to 95 %, the level a published interval is quoted at
 * (the doc's 90 % belongs to the *stopping rule*, which is a different decision).
 *
 * @throws Error on unequal lengths, or on a non-finite sample. Both mean the pairs are not pairs.
 */
export function comparePaired(
  metric: ReplicationMetric,
  candidate: readonly number[],
  baseline: readonly number[],
  confidence = 0.95,
): PairedComparison {
  if (candidate.length !== baseline.length) {
    throw new Error(
      `comparePaired: ${candidate.length} candidate values against ${baseline.length} baseline values. A paired interval requires one pair per replication.`,
    );
  }
  const differences = candidate.map((value, index) => value - (baseline[index] as number));
  const estimate = pairedDifferenceEstimate(candidate, baseline, { confidence });
  const varianceCandidate = varianceOf(candidate);
  const varianceBaseline = varianceOf(baseline);
  const covariance = covarianceOf(candidate, baseline);
  return Object.freeze({
    metric,
    n: candidate.length,
    candidate: Object.freeze([...candidate]),
    baseline: Object.freeze([...baseline]),
    differences: Object.freeze(differences),
    estimate,
    significant: intervalExcludesZero(estimate),
    varianceOfDifference: varianceOf(differences),
    candidateMean: candidate.reduce((total, value) => total + value, 0) / candidate.length,
    baselineMean: baseline.reduce((total, value) => total + value, 0) / baseline.length,
    varianceCandidate,
    varianceBaseline,
    correlation: covariance / Math.sqrt(varianceCandidate * varianceBaseline),
    maxAbsDifference: differences.reduce((worst, value) => Math.max(worst, Math.abs(value)), 0),
    exactZeroCount: differences.filter((value) => value === 0).length,
  });
}

/**
 * Whether an interval excludes zero.
 *
 * A `NaN` half-width — one replication, or a degenerate sample the estimator declined to
 * bound — is **not** significance. `reports/types.ts` `intervalContainsZero` answers the
 * complementary question with the opposite `NaN` convention, and a gate must not be able to
 * report "significant" from an interval that does not exist.
 */
export function intervalExcludesZero(estimate: MeanEstimate): boolean {
  if (!Number.isFinite(estimate.lower) || !Number.isFinite(estimate.upper)) return false;
  return estimate.lower > 0 || estimate.upper < 0;
}

/* -------------------------------------------------------------------------- *
 * The two ways of pairing two dispatchers
 * -------------------------------------------------------------------------- */

/** One arm of the CRN efficiency study: how the two dispatchers' replications were paired. */
export interface CrnStudyArm {
  readonly label: 'crn' | 'independent';
  readonly comparison: PairedComparison;
}

/** What the CRN efficiency study measured. */
export interface CrnStudy {
  readonly metric: ReplicationMetric;
  readonly n: number;
  readonly crn: PairedComparison;
  readonly independent: PairedComparison;
  /** `1 - Var_crn/Var_independent`, as a fraction. The headline claim in docs/03 § Part 4. */
  readonly varianceReduction: number;
  /** `Var_independent/Var_crn`: replications the independent design needs per CRN replication. */
  readonly replicationFactor: number;
  /** Half-width ratio, which is what a reader of the interval actually feels. */
  readonly halfWidthRatio: number;
  /** Whether the runner's own digest audit says the CRN arm really shared its traces. */
  readonly crnAligned: boolean;
}

export interface CrnStudyInput {
  readonly id: string;
  readonly building: string;
  readonly traffic: TrafficArmSpec;
  readonly candidate: string | DispatcherArmSpec;
  readonly baseline: string | DispatcherArmSpec;
  readonly candidateArmId: string;
  readonly baselineArmId: string;
  readonly replications: number;
  readonly resources: ExperimentResources;
  readonly metric?: ReplicationMetric | undefined;
  /** Seed for the CRN arm and for the independent arm's *candidate*. */
  readonly seedA: number | string;
  /** Seed for the independent arm's *baseline*. Must differ from {@link seedA}. */
  readonly seedB: number | string;
}

/**
 * Measure what common random numbers are worth on one real comparison.
 *
 * Two designs of the same comparison, at the same replication count and on the same building and
 * traffic:
 *
 * - **CRN.** One experiment, two dispatcher arms. Replication `i` of both arms is driven by
 *   `replicationSeed(seedA, i)`, so both see byte-identical passenger populations.
 * - **Independent.** Two experiments, seeds `seedA` and `seedB`. Replication `i` of the candidate
 *   and replication `i` of the baseline are unrelated runs; pairing them by index is arbitrary,
 *   which is precisely what makes it the independent-sampling control.
 *
 * The independent arm's candidate deliberately reuses `seedA`, so the *only* difference between
 * the two designs is which populations the baseline saw. Giving both arms fresh seeds would also
 * work and would add a second source of difference for no gain.
 */
export async function measureCrnBenefit(input: CrnStudyInput): Promise<CrnStudy> {
  const metric = input.metric ?? 'awtS';
  const paired = await runGateExperiment({
    id: `${input.id}/crn`,
    seed: input.seedA,
    building: input.building,
    dispatchers: [input.candidate, input.baseline],
    traffic: input.traffic,
    replications: input.replications,
    resources: input.resources,
  });
  const independentBaseline = await runGateExperiment({
    id: `${input.id}/independent-baseline`,
    seed: input.seedB,
    building: input.building,
    dispatchers: [input.baseline],
    traffic: input.traffic,
    replications: input.replications,
    resources: input.resources,
  });

  const crn = comparePaired(
    metric,
    samplesOf(paired, input.candidateArmId, metric),
    samplesOf(paired, input.baselineArmId, metric),
  );
  const independent = comparePaired(
    metric,
    samplesOf(paired, input.candidateArmId, metric),
    samplesOf(independentBaseline, input.baselineArmId, metric),
  );

  const crnDigests = digestsOf(paired, input.candidateArmId);
  const baselineDigests = digestsOf(paired, input.baselineArmId);
  const crnAligned =
    crnDigests.length === baselineDigests.length &&
    crnDigests.every((digest, index) => digest === baselineDigests[index]);

  return Object.freeze({
    metric,
    n: input.replications,
    crn,
    independent,
    varianceReduction: 1 - crn.varianceOfDifference / independent.varianceOfDifference,
    replicationFactor: independent.varianceOfDifference / crn.varianceOfDifference,
    halfWidthRatio: crn.estimate.halfWidth / independent.estimate.halfWidth,
    crnAligned,
  });
}

/* -------------------------------------------------------------------------- *
 * Formatting, for the suites' console output
 * -------------------------------------------------------------------------- */

/** `-1.234 s [-1.500, -0.968] (n = 100, t, 95 %)` — an interval nobody can mistake for a mean. */
export function formatEstimate(estimate: MeanEstimate, unit = 's'): string {
  const round = (value: number): string => (Number.isFinite(value) ? value.toFixed(4) : 'n/a');
  return `${round(estimate.mean)} ${unit} [${round(estimate.lower)}, ${round(estimate.upper)}] (n = ${estimate.n}, ${estimate.method}, ${(estimate.confidence * 100).toFixed(0)} %)`;
}
