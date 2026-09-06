/**
 * **The deadband sweep and the rate sweep, as entry points** — `docs/05-roadmap.md`'s Phase 5
 * verdict quotes both and shipped neither: *"driven through `runBenchmarkCase` by hand, so they are
 * recorded rather than reproducible in one call"*. GitHub issue #178 item 6, § D513.
 *
 * ## What the two sweeps ask
 *
 * `predictive-balanced` ships `idle.repositionThresholdS: 8`, taken from `docs/06`'s worked example,
 * and at that deadband its `predicted-demand` parking is inert on Garden Apartments (the
 * pre-positioning study, `prepositioning.ts`). Two questions follow, and the verdict answered both
 * by hand:
 *
 * 1. **{@link runDeadbandSweep}** — at which deadband does the arm start to move, and is there an
 *    interior optimum? Eight treatments, `predicted-demand` at 8, 6, 5, 4, 3, 2, 1 and 0 seconds,
 *    each paired against `stay` under common random numbers on `garden-residential`. Every cell is
 *    a paired-t interval, so this study **publishes intervals** and `regeneratePins.ts` is its
 *    non-test caller; `deadbandSweep.test.ts` compares the pins against a fresh run.
 * 2. **{@link runRateSweep}** — is the inertness at the authored deadband a sparsity problem? The
 *    same pairing at 2, 4, 8 and 16 % of population per five minutes. Each rate is a paired-t
 *    interval like the deadband rows, **and** a count beside it — how many of `n` paired
 *    differences are exactly zero — because the verdict quotes both (*"300/300 bit-identical at
 *    4 %"*). It publishes intervals, so it is pinned under `rate-sweep` and `regeneratePins.ts` is
 *    its non-test caller too. *Inert at every rate* means no rate comes back BETTER or WORSE: at
 *    n = 300 only 4 % is IDENTICAL, and the other three are 297 to 299 of 300 exactly zero with
 *    intervals containing zero — which is what the verdict's own table says, and what a first
 *    draft of this module got wrong by defining inert as *every rate IDENTICAL*.
 *
 * Both are the pre-positioning study's own arms and vocabulary — `parkingVariant`, `parkingArmId`,
 * `CONTROL_STRATEGY` — so the deadband the sweep varies is the field the study isolates.
 */

import { benchmarkCase, GARDEN_RESIDENTIAL_2PCT, type BenchmarkCase } from './arms.js';
import { CONTROL_STRATEGY, PREPOSITIONING_PROFILE, parkingArmId, parkingVariant } from './prepositioning.js';
import { runBenchmarkCase, type CaseResult } from './suite.js';
import type { CellComparison } from './verdict.js';
import type { ExperimentResources } from '../runner/types.js';
import { loadResources, withProfiles } from '../validation/harness.js';

/** The deadbands the verdict swept, in the order it quotes them. */
export const DEADBAND_SWEEP_THRESHOLDS_S: readonly number[] = Object.freeze([8, 6, 5, 4, 3, 2, 1, 0]);

/** The rates the verdict swept at the authored deadband, per cent of population per five minutes. */
export const RATE_SWEEP_RATES: readonly number[] = Object.freeze([2, 4, 8, 16]);

/** The replication budget both sweeps were published at. */
export const SWEEP_REPLICATIONS = 300;

/** The parking strategy the deadband is a parameter of. */
export const SWEPT_STRATEGY = 'predicted-demand' as const;

export interface SweepOptions {
  readonly replications?: number | undefined;
  readonly resources?: ExperimentResources | undefined;
  readonly seed?: number | string | undefined;
}

export interface DeadbandSweepRow {
  readonly thresholdS: number;
  readonly armId: string;
  /** `predicted-demand` at this deadband against `stay`, on AWT, paired-t at 95 %. */
  readonly awt: CellComparison;
}

export interface DeadbandSweep {
  readonly caseId: string;
  readonly replications: number;
  readonly baselineArmId: string;
  readonly result: CaseResult;
  readonly rows: readonly DeadbandSweepRow[];
  /** The deadband with the lowest paired mean — the verdict's *"interior optimum at 2 s"*. */
  readonly optimumThresholdS: number;
}

async function baseProfile() {
  const config = await loadResources();
  const base = config.dispatcherProfilesById.get(PREPOSITIONING_PROFILE);
  if (base === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no profile "${PREPOSITIONING_PROFILE}"; the sweeps have nothing to vary.`);
  }
  return { config, base };
}

/** The deadband sweep — eight treatments against `stay`, paired, on Garden Apartments. */
export async function runDeadbandSweep(options: SweepOptions = {}): Promise<DeadbandSweep> {
  const spec = benchmarkCase('garden-residential');
  const { config, base } = await baseProfile();
  const variants = [
    parkingVariant(base, CONTROL_STRATEGY),
    ...DEADBAND_SWEEP_THRESHOLDS_S.map((thresholdS) => parkingVariant(base, SWEPT_STRATEGY, thresholdS)),
  ];
  const resources = options.resources ?? withProfiles(config, variants);
  const baselineArmId = parkingArmId(CONTROL_STRATEGY);
  const arms = DEADBAND_SWEEP_THRESHOLDS_S.map((thresholdS) => parkingArmId(SWEPT_STRATEGY, thresholdS));
  const result = await runBenchmarkCase(spec, {
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    replications: options.replications ?? SWEEP_REPLICATIONS,
    baseline: baselineArmId,
    arms,
    metrics: ['awtS'],
    resources,
  });
  const rows = DEADBAND_SWEEP_THRESHOLDS_S.map((thresholdS): DeadbandSweepRow => {
    const armId = parkingArmId(SWEPT_STRATEGY, thresholdS);
    const arm = result.arms.find((entry) => entry.armId === armId);
    if (arm === undefined) throw new Error(`the sweep ran no arm "${armId}"`);
    return { thresholdS, armId, awt: arm.cell('awtS') };
  });
  const optimum = rows.reduce((best, row) => (row.awt.estimate.mean < best.awt.estimate.mean ? row : best), rows[0]!);
  return Object.freeze({
    caseId: spec.id,
    replications: result.replications,
    baselineArmId,
    result,
    rows: Object.freeze(rows),
    optimumThresholdS: optimum.thresholdS,
  });
}

export interface RateSweepRow {
  readonly ratePctPop5min: number;
  readonly caseId: string;
  readonly armId: string;
  readonly replications: number;
  /** `predicted-demand` at the authored deadband against `stay`, on AWT, paired-t at 95 %. */
  readonly awt: CellComparison;
  /** Paired differences that were exactly `0` — `300/300` is the verdict's *bit-identical*. */
  readonly exactZeroCount: number;
}

export interface RateSweep {
  readonly thresholdS: number;
  readonly rows: readonly RateSweepRow[];
  /**
   * `true` when no rate comes back BETTER or WORSE — the verdict's *"not a sparsity problem"*. Not
   * *every rate IDENTICAL*: the verdict's own table has three rates with intervals containing zero
   * and a handful of non-zero replications, and only one at exactly 300/300.
   */
  readonly inertAtEveryRate: boolean;
}

/** The Garden case at another rate — the same building, window and duration, one field moved. */
function gardenAt(ratePctPop5min: number): BenchmarkCase {
  const spec = benchmarkCase('garden-residential');
  const demand = GARDEN_RESIDENTIAL_2PCT.demand;
  if (demand === undefined) throw new Error('garden-residential declares no demand to move the rate of');
  if (ratePctPop5min === demand.arrivalRatePctPop5min) return spec;
  return Object.freeze({
    ...spec,
    id: `${spec.id}-${String(ratePctPop5min)}pct`,
    label: `${spec.label}, at ${String(ratePctPop5min)} %`,
    traffic: Object.freeze({
      ...GARDEN_RESIDENTIAL_2PCT,
      id: `residential-${String(ratePctPop5min)}pct-fullrun`,
      demand: Object.freeze({ ...demand, arrivalRatePctPop5min: ratePctPop5min }),
    }),
  });
}

/** The rate sweep — `predicted-demand` at the authored deadband against `stay`, at four rates. */
export async function runRateSweep(options: SweepOptions = {}): Promise<RateSweep> {
  const { config, base } = await baseProfile();
  const thresholdS = base.idle?.repositionThresholdS ?? 8;
  const variants = [parkingVariant(base, CONTROL_STRATEGY), parkingVariant(base, SWEPT_STRATEGY)];
  const resources = options.resources ?? withProfiles(config, variants);
  const rows: RateSweepRow[] = [];
  for (const ratePctPop5min of RATE_SWEEP_RATES) {
    const spec = gardenAt(ratePctPop5min);
    const result = await runBenchmarkCase(spec, {
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      replications: options.replications ?? SWEEP_REPLICATIONS,
      baseline: parkingArmId(CONTROL_STRATEGY),
      arms: [parkingArmId(SWEPT_STRATEGY)],
      metrics: ['awtS'],
      resources,
    });
    const arm = result.arms[0];
    const cell = arm?.cell('awtS');
    if (arm === undefined || cell === undefined) {
      throw new Error(`the rate sweep ran no arm at ${String(ratePctPop5min)} %`);
    }
    rows.push({
      ratePctPop5min,
      caseId: spec.id,
      armId: arm.armId,
      replications: result.replications,
      awt: cell,
      exactZeroCount: cell.comparison.exactZeroCount,
    });
  }
  return Object.freeze({
    thresholdS,
    rows: Object.freeze(rows),
    inertAtEveryRate: rows.every((row) => row.awt.verdict === 'IDENTICAL' || row.awt.verdict === 'INDISTINGUISHABLE'),
  });
}
