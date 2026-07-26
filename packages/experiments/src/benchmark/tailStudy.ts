/**
 * **Where do the tail terms actually earn their weights?** The study the main table cannot contain.
 *
 * The main comparison is measured at the highest load where **the baseline** still has a quotable
 * AWT. On Midtown Office that is 1 % of population per 5 minutes, and at 1 % under pure single-
 * entrance up-peak `fairness-first` is **bit-identical to `eta`** — 250 of 250 paired differences
 * exactly zero, at 1 %, at 2 % and at 3 %. Read alone, that says the `starvation` weight does nothing.
 *
 * It is the wrong conclusion, and this module is the measurement that corrects it. Two changes to the
 * traffic, both of which make the landing queues *contend*, and the term fires hard:
 *
 * ## Two entrances instead of one
 *
 * Midtown Office declares two entrance floors — `G` and `P1`, lobby and garage. The main table's arm
 * sends everything through `G` (`entranceWeights: { G: 1, P1: 0 }`) because that is the closed form's
 * own design point and the Phase 2 oracle was validated against it. Let both entrances fill, at the
 * building's own default weights, and two landings compete for the same bank. Measured at n = 250:
 *
 * | load | `fairness-first` − `eta`, AWT | WT95 | WT99 | % > 60 s | quotable? |
 * |---|---|---|---|---|---|
 * | 1 % | −0.01 [−0.05, +0.02] | −0.05 [−0.13, +0.02] | −0.03 [−0.09, +0.03] | 0.00, 250/250 identical | yes — nothing significant |
 * | 2 % | **−0.23 [−0.41, −0.05]** | **−1.58 [−2.48, −0.68]** | **−1.94 [−2.87, −1.02]** | **−0.49 [−0.76, −0.21]** | **yes — everything significant** |
 * | 3 % | — | — | — | — | **no**: `eta` saturates 2 replications in 250 |
 *
 * **The term does exactly what a fairness term is supposed to do, and the shape of the effect is the
 * evidence.** At 2 % the mean moves **1.16 %**, WT95 **3.83 %** and WT99 **4.24 %** — the tail moves
 * more than three times harder than the mean, and further out is harder still. A gate that reported
 * AWT alone would have called that
 * row a rounding error; it is a 1.6 s improvement in the wait a passenger actually complains about,
 * and it cuts the fraction waiting over a minute from 1.30 % to 0.81 %.
 *
 * ## And the window in which it can be said is one load step wide
 *
 * The 3 % row is blank, and that is a measurement rather than an omission. Swept at 250 replications
 * per cell:
 *
 * | load | `nearest-car` | `eta` | `fairness-first` | `capacity-aware` | `zoned-uppeak` |
 * |---|---|---|---|---|---|
 * | 1 % | 2 | 0 | 0 | 0 | 0 |
 * | 2 % | 29 | 0 | 0 | 0 | 0 |
 * | 2.25 % | 45 | 1 | 1 | 1 | 1 |
 * | 2.5 % | 52 | 3 | 2 | 1 | 2 |
 * | 2.75 % | 64 | 0 | 1 | 0 | 0 |
 * | 3 % | 108 | 2 | 0 | 0 | 2 |
 *
 * (saturated replications.) **There is no load above 2 % at which every arm is simultaneously
 * quotable.** The system passes from *the tail terms are inert* straight into *some arm's queues
 * diverge*, with a single load step of overlap. So the 2 % row is not one point among many that could
 * have been chosen — it is the only one there is, and the effect it shows is the largest this
 * apparatus can legitimately report for a tail term.
 *
 * `capacity-aware` falls in the gap. It is **INDISTINGUISHABLE** from `eta` at 2 % on every metric
 * (AWT `−0.16 [−0.44, +0.12]`, needing n ≈ 790; WT95 `−0.86 [−1.85, +0.14]`), and at 2.75 % — where it is quotable and
 * `fairness-first` is not — it is `−0.72 [−1.27, −0.17]` on AWT and `−2.29 [−4.10, −0.49]` on WT95,
 * both significant. Its `loadFactor` and `crowding` weights need cars near their bypass threshold to
 * have anything to price. That is a statement about when the term is *relevant*, and the honest
 * summary is: **indistinguishable from `eta` at every load where all arms are quotable together.**
 *
 * ## Why this cannot be part of the acceptance table
 *
 * **The baseline has no quotable AWT at any of these operating points.** Under two entrances
 * `nearest-car` saturates 2 replications in 250 at 1 %, 29 at 2 % and **108 at 3 %**; under one
 * entrance it saturates 19 in 250 at 2 % and 59 at 3 %. Any of those suppresses its mean under
 * docs/03-traffic-and-statistics.md § Part 3, so the roadmap's criterion — *beats `nearest-car` with a
 * paired-t interval excluding zero* — is not arguable here at all. Every comparison in this module is
 * therefore **against `eta`**, and is labelled as such rather than smuggled into the criterion.
 *
 * That is itself the finding worth recording, and it is the sharpest thing in this phase:
 *
 * > **The load at which the tail terms earn their weights is past the load at which the baseline
 * > stops being measurable.** `nearest-car` does not merely lose at 3 % — its queues diverge on 43 %
 * > of replications. So the acceptance criterion can only ever be argued in the regime where the
 * > interesting terms are inert, and the regime where they are not has no baseline to compare to.
 *
 * The right conclusion is about the criterion, not about the dispatchers: a Phase 6 criterion should
 * name `eta` as the thing to beat, because `eta` is quotable everywhere the terms actually work.
 */

import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources, TrafficArmSpec } from '../runner/types.js';
import {
  cellOf,
  comparePaired,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
  type PairedComparison,
} from '../validation/harness.js';

import { BENCHMARK_SEED } from './suite.js';
import { classify, type CellVerdict } from './verdict.js';

/**
 * The reference the tail study compares against.
 *
 * `eta` and not `nearest-car`, because the baseline's queues diverge at every load in this study and
 * a saturated arm has no mean to subtract. Stated in the type name so a result from this module cannot
 * be mistaken for a result about the acceptance criterion.
 */
export const TAIL_REFERENCE = 'eta';

/** The arms whose signature terms are tail terms or contention terms. */
export const TAIL_ARMS: readonly string[] = Object.freeze([
  'fairness-first',
  'capacity-aware',
  'zoned-uppeak',
]);

/**
 * The metrics a tail claim is made on.
 *
 * `wt99S` joins the four the main table reports, because the whole hypothesis is that a fairness term
 * acts further out in the distribution than the mean, and the 99th percentile is where that is most
 * visible. Ordered from mean outwards, so a reader sees the effect grow down the column.
 */
export const TAIL_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'wt99S',
  'pctOverLongWait',
  'maxWaitS',
]);

/** Loads the study sweeps, as a percentage of population per 5 minutes. */
export const TAIL_LOADS: readonly number[] = Object.freeze([1, 2, 3]);

/**
 * Midtown Office up-peak with **both** entrances filling, at the building's own default weights.
 *
 * The one deliberate difference from the main table's arm, and the reason the study exists: two
 * landings competing for one bank is what gives a car a committed hall call for a new call to push
 * back, which is the only situation in which `starvation` is non-zero.
 */
export function twoEntranceUpPeak(arrivalRatePctPop5min: number): TrafficArmSpec {
  return Object.freeze({
    id: `two-entrance-up-peak-${arrivalRatePctPop5min}`,
    durationS: 900,
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
      arrivalRatePctPop5min,
      peakWindowS: 300,
    }),
  });
}

/** One (arm, metric) comparison against {@link TAIL_REFERENCE} at one load. */
export interface TailCell {
  readonly armId: string;
  readonly metric: ReplicationMetric;
  readonly loadPctPop5min: number;
  readonly verdict: CellVerdict;
  readonly comparison: PairedComparison;
  /** `mean / referenceMean`. The quantity the tail hypothesis is about. */
  readonly relativeEffect: number;
}

/** One load's worth of the study. */
export interface TailRow {
  readonly loadPctPop5min: number;
  readonly cells: readonly TailCell[];
  /** Saturated replications per arm, including the acceptance baseline. */
  readonly saturatedByArm: Readonly<Record<string, number>>;
  /** Arms with no quotable AWT at this load. */
  readonly unquotableArms: readonly string[];
  /** `true` when `nearest-car` had no quotable AWT — i.e. the criterion is unarguable here. */
  readonly baselineUnquotable: boolean;
}

export interface TailStudy {
  readonly building: string;
  readonly replications: number;
  readonly referenceId: string;
  readonly rows: readonly TailRow[];
  /** The cell for one (load, arm, metric). @throws Error when it was not measured. */
  readonly cell: (load: number, armId: string, metric: ReplicationMetric) => TailCell;
}

export interface TailStudyOptions {
  readonly replications?: number | undefined;
  readonly loads?: readonly number[] | undefined;
  readonly arms?: readonly string[] | undefined;
  readonly metrics?: readonly ReplicationMetric[] | undefined;
  readonly resources?: ExperimentResources | undefined;
  readonly seed?: number | string | undefined;
  readonly building?: string | undefined;
}

/**
 * Sweep the load and measure every tail arm against `eta`.
 *
 * `nearest-car` is run in every experiment even though nothing is compared against it, because its
 * saturation count at each load is the evidence for why it *cannot* be compared against — and a
 * study that omitted it would be asserting that rather than measuring it.
 */
export async function runTailStudy(options: TailStudyOptions = {}): Promise<TailStudy> {
  const building = options.building ?? 'midtown-office';
  const replications = options.replications ?? 250;
  const arms = options.arms ?? TAIL_ARMS;
  const metrics = options.metrics ?? TAIL_METRICS;
  const resources = options.resources ?? withProfiles(await loadResources(), []);
  const dispatchers = ['nearest-car', TAIL_REFERENCE, ...arms];

  const rows: TailRow[] = [];
  for (const load of options.loads ?? TAIL_LOADS) {
    const experiment = await runGateExperiment({
      id: `phase5/tail/${building}/${load}`,
      seed: options.seed ?? BENCHMARK_SEED,
      building,
      dispatchers,
      traffic: twoEntranceUpPeak(load),
      replications,
      resources,
    });

    const saturatedByArm: Record<string, number> = {};
    const unquotable: string[] = [];
    for (const armId of dispatchers) {
      const cell = cellOf(experiment, armId);
      saturatedByArm[armId] = cell.aggregate.saturatedCount;
      if (!cell.aggregate.awtIsValid) unquotable.push(armId);
    }

    const referenceQuotable = cellOf(experiment, TAIL_REFERENCE).aggregate.awtIsValid;
    const cells: TailCell[] = [];
    for (const armId of arms) {
      const quotable = referenceQuotable && cellOf(experiment, armId).aggregate.awtIsValid;
      for (const metric of metrics) {
        const comparison = comparePaired(
          metric,
          samplesOf(experiment, armId, metric),
          samplesOf(experiment, TAIL_REFERENCE, metric),
        );
        cells.push(
          Object.freeze({
            armId,
            metric,
            loadPctPop5min: load,
            verdict: classify(comparison, quotable),
            comparison,
            relativeEffect:
              comparison.baselineMean === 0
                ? Number.NaN
                : comparison.estimate.mean / comparison.baselineMean,
          }),
        );
      }
    }

    rows.push(
      Object.freeze({
        loadPctPop5min: load,
        cells: Object.freeze(cells),
        saturatedByArm: Object.freeze(saturatedByArm),
        unquotableArms: Object.freeze(unquotable),
        baselineUnquotable: unquotable.includes('nearest-car'),
      }),
    );
  }

  return Object.freeze({
    building,
    replications,
    referenceId: TAIL_REFERENCE,
    rows: Object.freeze(rows),
    cell: (load: number, armId: string, metric: ReplicationMetric): TailCell => {
      const found = rows
        .find((row) => row.loadPctPop5min === load)
        ?.cells.find((entry) => entry.armId === armId && entry.metric === metric);
      if (found === undefined) {
        throw new Error(`Tail study has no cell for load ${load} %, arm "${armId}", metric "${metric}".`);
      }
      return found;
    },
  });
}

/** The study as a markdown block, one table per arm, loads as rows. */
export function formatTailStudy(study: TailStudy): string {
  const lines: string[] = [
    `### Tail terms against \`${study.referenceId}\` — ${study.building}, two-entrance up-peak, n = ${study.replications}`,
    '',
    '> Compared against `eta`, **not** the acceptance baseline: `nearest-car` has no quotable AWT at any',
    '> load below, so the roadmap criterion is unarguable here. Saturated replications per arm are in the',
    '> last table.',
  ];
  const armIds = [...new Set(study.rows.flatMap((row) => row.cells.map((cell) => cell.armId)))];
  const metrics = [...new Set(study.rows.flatMap((row) => row.cells.map((cell) => cell.metric)))];
  for (const armId of armIds) {
    lines.push('', `**\`${armId}\` − \`${study.referenceId}\`**`, '');
    lines.push(`| load | ${metrics.join(' | ')} |`);
    lines.push(`|---|${metrics.map(() => '---').join('|')}|`);
    for (const row of study.rows) {
      const cells = metrics.map((metric) => {
        const cell = row.cells.find((entry) => entry.armId === armId && entry.metric === metric);
        if (cell === undefined) return '—';
        const { estimate } = cell.comparison;
        const mark = cell.verdict === 'BETTER' || cell.verdict === 'WORSE' ? '**' : '';
        return `${mark}${estimate.mean.toFixed(3)} [${estimate.lower.toFixed(3)}, ${estimate.upper.toFixed(3)}]${mark}`;
      });
      lines.push(`| ${row.loadPctPop5min} % | ${cells.join(' | ')} |`);
    }
  }
  lines.push('', '**Saturated replications by arm**', '');
  const allArms = Object.keys(study.rows[0]?.saturatedByArm ?? {});
  lines.push(`| load | ${allArms.join(' | ')} |`);
  lines.push(`|---|${allArms.map(() => '---').join('|')}|`);
  for (const row of study.rows) {
    lines.push(
      `| ${row.loadPctPop5min} % | ${allArms
        .map((armId) => {
          const count = row.saturatedByArm[armId] ?? 0;
          return row.unquotableArms.includes(armId) ? `**${count}**` : `${count}`;
        })
        .join(' | ')} |`,
    );
  }
  return lines.join('\n');
}
