/**
 * The Phase 5 benchmark itself: run every arm against the baseline on one building under common
 * random numbers, and report a verdict per (arm, metric) cell.
 *
 * One `runExperiment` call per case, with the baseline and all eight arms as dispatcher arms of the
 * *same* experiment. That is not an optimization — it is the whole of the pairing. `crn.ts` derives a
 * replication's seed from `(experimentSeed, replicationIndex)` and nothing else, so replication `i`
 * of every arm sees a byte-identical passenger population, and {@link CaseResult.crnAligned} audits
 * that after the fact against the runner's own trace digests rather than trusting the design.
 *
 * ## Expect CRN to buy much less here than the literature promises, and know why per building
 *
 * Phase 3 measured the regime dependence: 99.7 % variance reduction between near-neighbour weight
 * vectors, **43.8 % (1.8×)** between structurally different dispatchers. Every comparison in this
 * module is the second kind. Measured on these three cases, the baseline-to-arm correlation is
 *
 * | case | rho (`eta` vs `nearest-car`, AWT) |
 * |---|---|
 * | Midtown Office up-peak | ~0.61 |
 * | Secure Tower up-peak | ~0.59 |
 * | Garden Apartments, full run | **~0.94** |
 *
 * Garden is the outlier and the reason is structural rather than statistical: two cars over six
 * floors leaves the dispatcher very little to disagree about, so the two arms' runs stay coupled.
 * CRN is worth far more there — which is what makes a 1.3 s effect resolvable on Garden and not on
 * Midtown, at comparable budgets. Reported rather than assumed, in {@link CellComparison.comparison}.
 *
 * ## Saturation is checked per cell, before any interval is quoted
 *
 * {@link CaseResult.unquotableArms} lists arms whose AWT was invalidated, and every cell involving
 * one is `UNQUOTABLE` rather than a number. docs/03-traffic-and-statistics.md § Part 3, and
 * `CLAUDE.md` § Statistical discipline: "If a configuration saturates, flag it and suppress the AWT
 * interval." A cell that cannot be quoted is reported as such and takes no part in the verdict count.
 */

import type { DispatcherProfile } from '@elevator-sim/core';

import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources, ExperimentResult, TrafficArmSpec } from '../runner/types.js';
import {
  digestsOf,
  cellOf,
  runGateExperiment,
  samplesOf,
  loadResources,
  withProfiles,
} from '../validation/harness.js';

import {
  ARM_PROFILES,
  BASELINE_PROFILE,
  BENCHMARK_CASES,
  BENCHMARK_METRICS,
  type BenchmarkCase,
} from './arms.js';
import { compareCell, type CellComparison, type CellVerdict } from './verdict.js';

/**
 * The benchmark's master seed.
 *
 * Fixed, and distinct from the Phase 3 gate's `GATE_SEED` so that a Phase 5 result is not measured
 * on the exact passenger populations Phase 3 chose its operating point against. Same value for every
 * case, because a case is a different building and therefore a different trace equivalence class
 * anyway.
 */
export const BENCHMARK_SEED = 20_260_726;

/** One arm's row: every metric's cell, plus whether its own AWT survived. */
export interface ArmResult {
  readonly armId: string;
  readonly profileId: string;
  /** `false` when this arm saturated, was censored, or had an empty window. */
  readonly quotable: boolean;
  readonly quotabilityReason: string | undefined;
  readonly saturatedCount: number;
  /** Mean of each metric over the finite samples. `NaN` where there were none. */
  readonly means: Readonly<Record<string, number>>;
  readonly cells: readonly CellComparison[];
  /** The cell for one metric. */
  readonly cell: (metric: ReplicationMetric) => CellComparison;
}

/** One case's whole table. */
export interface CaseResult {
  readonly caseId: string;
  readonly label: string;
  readonly building: string;
  readonly replications: number;
  readonly admissibleReplications: number | undefined;
  readonly baselineId: string;
  readonly baselineQuotable: boolean;
  readonly baselineQuotabilityReason: string | undefined;
  readonly baselineSaturatedCount: number;
  readonly baselineMeans: Readonly<Record<string, number>>;
  readonly arms: readonly ArmResult[];
  /** Arms with no quotable AWT. Their cells are all `UNQUOTABLE`. */
  readonly unquotableArms: readonly string[];
  /** Whether every arm's replication `i` really saw the baseline's replication `i` population. */
  readonly crnAligned: boolean;
  /** Arms that produced bit-identical runs to each other, as equivalence classes. */
  readonly identityClasses: readonly (readonly string[])[];
  readonly experiment: ExperimentResult;
}

/** Options for {@link runBenchmarkCase}. Everything has a default drawn from `arms.ts`. */
export interface BenchmarkRunOptions {
  readonly seed?: number | string | undefined;
  readonly replications?: number | undefined;
  readonly baseline?: string | undefined;
  readonly arms?: readonly string[] | undefined;
  readonly metrics?: readonly ReplicationMetric[] | undefined;
  /** Extra derived profiles to register, for a study that needs a variant arm. */
  readonly extraProfiles?: readonly DispatcherProfile[] | undefined;
  readonly resources?: ExperimentResources | undefined;
  readonly confidence?: number | undefined;
}

/**
 * Run one case: baseline plus every arm, one experiment, CRN throughout.
 *
 * Every arm's cell is compared against the baseline's samples at the same replication index. No arm
 * is compared against another arm here — that is a different question and
 * {@link identityClassesOf} answers the only part of it this table needs.
 */
export async function runBenchmarkCase(
  spec: BenchmarkCase,
  options: BenchmarkRunOptions = {},
): Promise<CaseResult> {
  const baselineId = options.baseline ?? BASELINE_PROFILE;
  const armIds = options.arms ?? ARM_PROFILES;
  const metrics = options.metrics ?? BENCHMARK_METRICS;
  const replications = options.replications ?? spec.replications;
  const resources =
    options.resources ?? withProfiles(await loadResources(), options.extraProfiles ?? []);

  const experiment = await runGateExperiment({
    id: `phase5/${spec.id}`,
    seed: options.seed ?? BENCHMARK_SEED,
    building: spec.building,
    dispatchers: [baselineId, ...armIds],
    traffic: spec.traffic,
    replications,
    resources,
  });

  const baselineCell = cellOf(experiment, baselineId);
  const baselineDigests = digestsOf(experiment, baselineId);
  const baselineQuotable = baselineCell.aggregate.awtIsValid;

  let crnAligned = true;
  const arms: ArmResult[] = [];
  for (const armId of armIds) {
    const cell = cellOf(experiment, armId);
    const digests = digestsOf(experiment, armId);
    if (
      digests.length !== baselineDigests.length ||
      digests.some((digest, index) => digest !== baselineDigests[index])
    ) {
      crnAligned = false;
    }
    const quotable = baselineQuotable && cell.aggregate.awtIsValid;
    const cells = metrics.map((metric) =>
      compareCell({
        metric,
        armId,
        baselineId,
        candidate: samplesOf(experiment, armId, metric),
        baseline: samplesOf(experiment, baselineId, metric),
        quotable,
        ...(spec.admissibleReplications === undefined
          ? {}
          : { admissibleReplications: spec.admissibleReplications }),
        ...(options.confidence === undefined ? {} : { confidence: options.confidence }),
      }),
    );
    arms.push(
      Object.freeze({
        armId,
        profileId: cell.dispatcherProfileId,
        quotable: cell.aggregate.awtIsValid,
        quotabilityReason: cell.aggregate.awtInvalidReason,
        saturatedCount: cell.aggregate.saturatedCount,
        means: meansOf(experiment, armId, metrics),
        cells: Object.freeze(cells),
        cell: (metric: ReplicationMetric) => {
          const found = cells.find((entry) => entry.metric === metric);
          if (found === undefined) {
            throw new Error(`Metric "${metric}" was not measured for arm "${armId}".`);
          }
          return found;
        },
      }),
    );
  }

  return Object.freeze({
    caseId: spec.id,
    label: spec.label,
    building: spec.building,
    replications,
    admissibleReplications: spec.admissibleReplications,
    baselineId,
    baselineQuotable,
    baselineQuotabilityReason: baselineCell.aggregate.awtInvalidReason,
    baselineSaturatedCount: baselineCell.aggregate.saturatedCount,
    baselineMeans: meansOf(experiment, baselineId, metrics),
    arms: Object.freeze(arms),
    unquotableArms: Object.freeze(arms.filter((arm) => !arm.quotable).map((arm) => arm.armId)),
    crnAligned,
    identityClasses: identityClassesOf(experiment, [baselineId, ...armIds]),
    experiment,
  });
}

/** Every case in {@link BENCHMARK_CASES}, serially, sharing one loaded `data/` directory. */
export async function runBenchmark(
  options: BenchmarkRunOptions = {},
): Promise<readonly CaseResult[]> {
  const resources =
    options.resources ?? withProfiles(await loadResources(), options.extraProfiles ?? []);
  const results: CaseResult[] = [];
  for (const spec of BENCHMARK_CASES) {
    results.push(await runBenchmarkCase(spec, { ...options, resources }));
  }
  return Object.freeze(results);
}

/* -------------------------------------------------------------------------- *
 * Bit-identity between arms
 * -------------------------------------------------------------------------- */

/**
 * The metrics an identity class is decided on.
 *
 * Wider than {@link BENCHMARK_METRICS} on purpose: two arms could coincide on wait statistics while
 * differing in how far the cars drove, and calling those identical would be wrong. `intervalS` and
 * `meanLoadFactor` are about the cars rather than the passengers, so a claim of identity that
 * survives all six is a claim about the *run*, not about one projection of it.
 */
const IDENTITY_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'ttdMeanS',
  'pctOverLongWait',
  'intervalS',
  'meanLoadFactor',
  'meanQueueLength',
]);

/**
 * Partition arms into classes whose per-replication metric vectors are *exactly* equal.
 *
 * A class with more than one member is the `IDENTICAL` finding at whole-dispatcher scale: two
 * profiles that differ in their JSON and not in a single simulated second. Under CRN with a
 * deterministic simulator that is a statement about the dispatchers, not about the sample.
 *
 * `NaN` is treated as equal to `NaN` here, which is right: a metric that is absent in the same
 * replication of both arms for the same reason is not a difference between them.
 */
export function identityClassesOf(
  result: ExperimentResult,
  armIds: readonly string[],
): readonly (readonly string[])[] {
  const classes = new Map<string, string[]>();
  for (const armId of armIds) {
    const key = IDENTITY_METRICS.map((metric) =>
      samplesOf(result, armId, metric)
        .map((value) => (Number.isNaN(value) ? 'NaN' : value.toPrecision(17)))
        .join(','),
    ).join('|');
    const bucket = classes.get(key);
    if (bucket === undefined) classes.set(key, [armId]);
    else bucket.push(armId);
  }
  return Object.freeze([...classes.values()].map((members) => Object.freeze(members)));
}

/* -------------------------------------------------------------------------- *
 * Reading a table
 * -------------------------------------------------------------------------- */

function meansOf(
  result: ExperimentResult,
  armId: string,
  metrics: readonly ReplicationMetric[],
): Readonly<Record<string, number>> {
  const cell = cellOf(result, armId);
  const out: Record<string, number> = {};
  for (const metric of metrics) {
    out[metric] = cell.aggregate.metrics[metric].statistic?.mean ?? Number.NaN;
  }
  return Object.freeze(out);
}

/** The arm row of this id. @throws Error when the case has none. */
export function armOf(result: CaseResult, armId: string): ArmResult {
  const found = result.arms.find((arm) => arm.armId === armId);
  if (found === undefined) {
    throw new Error(
      `Case "${result.caseId}" has no arm "${armId}". Arms: ${result.arms.map((arm) => arm.armId).join(', ')}.`,
    );
  }
  return found;
}

/** Arms whose verdict on this metric is one of `wanted`. */
export function armsWithVerdict(
  result: CaseResult,
  metric: ReplicationMetric,
  ...wanted: readonly CellVerdict[]
): readonly string[] {
  const set = new Set<CellVerdict>(wanted);
  return Object.freeze(
    result.arms.filter((arm) => set.has(arm.cell(metric).verdict)).map((arm) => arm.armId),
  );
}

/** A verdict tally over one metric, for the report's summary line. */
export function verdictCounts(
  result: CaseResult,
  metric: ReplicationMetric,
): Readonly<Record<CellVerdict, number>> {
  const counts: Record<string, number> = {
    BETTER: 0,
    WORSE: 0,
    INDISTINGUISHABLE: 0,
    IDENTICAL: 0,
    UNQUOTABLE: 0,
  };
  for (const arm of result.arms) {
    const verdict = arm.cell(metric).verdict;
    counts[verdict] = (counts[verdict] ?? 0) + 1;
  }
  return Object.freeze(counts as Record<CellVerdict, number>);
}
