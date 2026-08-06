/**
 * **Phase 6b, the C→D contrast: what the landing panel costs, measured.**
 *
 * ```ts
 * console.log(formatDispatchContrast(await runDestinationDispatchStudy()));
 * ```
 *
 * `docs/09-destination-dispatch-contract.md` § 2.3 names six arms and says *"A→B and C→D are the
 * two contrasts that carry the interesting claims"*. A→C is measured in `destinationDisclosure.ts`.
 * **C→D is this module**, and it was the one thing Phase 6b shipped without: `packages/core`'s
 * `the root DECISIONS.md` records the mechanism verified — every leg promised, zero wrong-car boardings,
 * broken promises counted — and the *effect* unmeasured, with `sd(ΔTTD)` unknown and therefore the
 * contract's `n = 150` unjustified for arm D.
 *
 * ## The two arms differ in exactly one authored field
 *
 * Arm D is the **shipped** `destination-panel` out of `data/dispatcher-profiles.json`. Arm C is
 * that profile with `dispatch.passengerAssignment` removed and nothing else touched — same
 * weights, same `mobile-credential` call type, same credential. So every number below isolates the
 * *passenger model* and not the weight vector, which is the discrimination
 * `destinationDisclosure.ts` cannot make (its arms differ in a weight) and the reason this is a
 * separate study rather than a fifth row there.
 *
 * ## The result
 *
 * **The gate is TTD** and AWT and WT95 are reported beside it with explicit verdicts —
 * `DECISIONS.md` § D27, and here it is forced rather than chosen: `core`'s own
 * `comparabilityOf('destination-dispatch')` lists AWT and WT95 among the nine metrics whose
 * *construct* changes between the two models, so they are reported as costs rather than as the
 * ranking. Measured at seed 20260726, n = 150 under common random numbers, D − C:
 *
 * | operating point | ΔTTD | ΔAWT | ΔWT95 | Δride | bit-identical |
 * |---|---|---|---|---|---|
 * | **Midtown interfloor-mix 1.5 %** (the contract's primary point) | `+0.11 [−0.04, +0.25]` INDIST. | `−0.01 [−0.10, +0.08]` INDIST. | `+0.15 [−0.33, +0.64]` INDIST. | `+0.12 [−0.01, +0.25]` INDIST. | 27 / 150 |
 * | Secure Tower interfloor-mix 1.5 % | `−0.04 [−0.14, +0.06]` INDIST. | `−0.06 [−0.11, −0.00]` **see below** | `−0.22 [−0.45, +0.01]` INDIST. | `+0.02 [−0.05, +0.08]` INDIST. | 41 / 150 |
 * | **Midtown interfloor-mix 4.5 %** — where the promise binds | `+5.94 [+4.42, +7.46]` **WORSE** | `+6.96 [+5.55, +8.38]` **WORSE** | `+37.34 [+29.37, +45.32]` **WORSE** | `−1.02 [−1.63, −0.41]` **BETTER** | 0 / 150 |
 *
 * **Secure Tower's ΔAWT is marked *see below* rather than given a verdict, and § D268 is why.**
 * [§ D265](../../../../DECISIONS.md)'s credential gap changed this building's population, and the
 * interval moved: it used to contain zero comfortably and now excludes it, by **six ten-thousandths
 * of a second**. (The superseded pair is in § D268, and is deliberately not reprinted here — an
 * interval literal in this directory is a claim needing a pin, and a *withdrawn* number has none.) That is not a result and it is not reported as one: the cell
 * carries `admissibleReplications: 0` ([§ D261](../../../../DECISIONS.md)), the effect is a
 * twentieth of a second on a building whose AWT is tens of seconds, and an interval that clears zero
 * at the fourth decimal after a population change is exactly the shape `CLAUDE.md`'s opening warning
 * is about. It is re-pinned because the code produces it, and it is a number rather than a finding.
 *
 * Three things worth reading off it that a headline cannot say.
 *
 * **T16's "trajectory-identical" does not survive 150 replications, and that is the finding that
 * unblocks the budget.** At the primary point the two arms are bit-identical on **27 of 150**
 * replications, not on all of them: `sd(ΔTTD) = 0.908 s`. So the contrast is measurable, the
 * contract's `n = 150` puts its half-width at **±0.15 s** — better than the ±0.43 s the contract
 * designed for and inside its stated headroom for an sd up to ~3.4 s — and **n = 150 is justified
 * for arm D**. The single-seed reading that produced "identical" is what a single seed is for.
 *
 * **At the primary point the panel costs nothing and buys nothing, and the reason is mechanical.**
 * 96 passengers over 1800 s rarely fill a car, so the write-once promise almost never binds: the
 * liveness census counts **4** broken promises in a whole run. A constraint that is not exercised
 * has no effect to measure, and reporting the zero *with* the count of times the constraint bit is
 * the difference between "no effect" and "not exercised".
 *
 * **Where the promise does bind, it is expensive, and the mechanism is visible in the sign split.**
 * At 4.5 % of population per 5 minutes the cars fill, the panel may not change its mind
 * (`DECISIONS.md` § D29), and passengers left behind wait for *their* car rather than the next one:
 * TTD is 5.94 s worse and WT95 37 s worse, while in-car time is **1.02 s better**. Destination
 * grouping still does what it is for; the landing is where it is paid for, and at this load it is
 * paid for many times over. That is the "documented cost of the approach" as a measurement rather
 * than as an assumption — the same discipline § 2.3 applies to A→B.
 *
 * ## What this module refuses to do
 *
 * **It does not raise the rate until the effect is significant and stop there.** 4.5 % is the
 * highest rate at which *both* arms still return a valid AWT on all 150 replications, censused in
 * `destinationDispatchContrast.test.ts`; above it the point would be a saturated arm with its
 * statistics suppressed, which is a capacity finding and not a contrast. The two rates are
 * reported together, and the honest summary is that the sign of the C→D effect depends on whether
 * the constraint binds.
 *
 * **It does not report AWT as the ranking.** See above: `core` says it is not comparable across the
 * two models. It is reported because § D27 says a cost hidden is a cost claimed.
 */

import type { DispatcherProfile } from '@elevator-sim/core';

import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources, ExperimentResult, TrafficArmSpec } from '../runner/types.js';
import {
  cellOf,
  derivedProfile,
  digestsOf,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from '../validation/harness.js';

import { DESTINATION_DISPATCH_PROFILE, MIDTOWN_INTERFLOOR_MIX, SECURE_INTERFLOOR_MIX } from './arms.js';
import { BENCHMARK_SEED } from './suite.js';
import { compareCell, type CellComparison } from './verdict.js';

/* -------------------------------------------------------------------------- *
 * The arms — one authored field apart
 * -------------------------------------------------------------------------- */

/** Arm D: the shipped Level-1 profile, unmodified. */
export const DISPATCH_ARM = DESTINATION_DISPATCH_PROFILE;

/** Arm C: the same profile without the landing panel. */
export const DISCLOSURE_ARM = 'destination-panel-level0';

/**
 * Arm C, derived from arm D by **deleting one key**.
 *
 * Deletion rather than `passengerAssignment: 'none'`, and the difference is not cosmetic: `none`
 * is the resolved default, so the two produce the same `ResolvedDispatchStage`, but an authored
 * `'none'` would make arm C a profile that *declares* a passenger model and arm D a profile that
 * declares a different one — and `core`'s refusal of `panel` under `up-down-buttons` is checked at
 * policy construction on the authored value. Deleting the key leaves arm C exactly the profile a
 * Phase 6a author would have written, which is what "arm C" means.
 */
export function contrastProfiles(panel: DispatcherProfile): readonly DispatcherProfile[] {
  const dispatch = Object.fromEntries(
    Object.entries(panel.dispatch ?? {}).filter(([key]) => key !== 'passengerAssignment'),
  ) as DispatcherProfile['dispatch'];
  return Object.freeze([
    derivedProfile(panel, DISCLOSURE_ARM, {
      name: 'Destination disclosure — the shipped panel profile without its panel',
      dispatch,
    }),
  ]);
}

/**
 * The metrics, and what each is for.
 *
 * | metric | role |
 * |---|---|
 * | `ttdMeanS` | **the gate.** One of the ten `core` says keeps its definition across the two models |
 * | `awtS` | the cost, reported with a verdict (§ D27). **Not comparable** — see {@link DispatchPoint} |
 * | `wt95S` | the tail, same status as AWT |
 * | `rideMeanS` | the **mechanism check**: destination grouping is supposed to buy in-car time |
 */
export const CONTRAST_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'ttdMeanS',
  'awtS',
  'wt95S',
  'rideMeanS',
]);

/** Human labels, for the printed table only. Feeds no decision. */
export const CONTRAST_METRIC_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ttdMeanS: 'TTD (s)',
  awtS: 'AWT (s)',
  wt95S: 'WT95 (s)',
  rideMeanS: 'ride (s)',
});

/* -------------------------------------------------------------------------- *
 * The operating points
 * -------------------------------------------------------------------------- */

/**
 * Midtown Office interfloor-mix at 4.5 % of population per 5 minutes.
 *
 * The same pattern as {@link MIDTOWN_INTERFLOOR_MIX} at three times the rate — the *only* thing
 * changed, so the two rows are a rate sweep and not two different experiments. 4.5 % because it is
 * the highest rate at which both arms return a valid AWT on every one of 150 replications; the
 * census is in the test rather than in this comment.
 */
export const MIDTOWN_INTERFLOOR_BINDING: TrafficArmSpec = Object.freeze({
  ...MIDTOWN_INTERFLOOR_MIX,
  id: 'interfloor-mix-4.5pct',
  demand: Object.freeze({ ...MIDTOWN_INTERFLOOR_MIX.demand, arrivalRatePctPop5min: 4.5 }),
});

/** One (building, operating point, budget) the C→D contrast is measured at. */
export interface DispatchPoint {
  readonly id: string;
  readonly label: string;
  readonly building: string;
  readonly traffic: TrafficArmSpec;
  readonly replications: number;
  /** Stated **before** the run: does the write-once promise bind at this load? */
  readonly prediction: string;
}

export const DISPATCH_POINTS: readonly DispatchPoint[] = Object.freeze([
  Object.freeze({
    id: 'midtown-interfloor-mix',
    label: 'Midtown Office, interfloor-mix 1.5 %, full run',
    building: 'midtown-office',
    traffic: MIDTOWN_INTERFLOOR_MIX,
    replications: 150,
    prediction:
      'The contract’s primary point. Near zero, because 96 passengers over 1800 s rarely fill a car and the write-once promise therefore almost never binds — the liveness census counts 4 broken promises in a whole run. Reported with that count beside it so "no effect" is not read as "not wired".',
  }),
  Object.freeze({
    id: 'secure-interfloor-mix',
    label: 'Secure Tower, interfloor-mix 1.5 %, full run',
    building: 'secure-tower',
    traffic: SECURE_INTERFLOOR_MIX,
    replications: 150,
    prediction:
      'Near zero for the same reason, on the access-controlled building. Carried because both arms carry the credential, so this row isolates the panel from the authorization the panel also performs (T16-D2) — a difference here would be the passenger model and not the access check.',
  }),
  Object.freeze({
    id: 'midtown-interfloor-binding',
    label: 'Midtown Office, interfloor-mix 4.5 %, full run',
    building: 'midtown-office',
    traffic: MIDTOWN_INTERFLOOR_BINDING,
    replications: 150,
    prediction:
      'Worse on TTD, and worse on AWT by more. At three times the rate the cars fill, and a passenger the panel promised a full car waits for THAT car rather than the next one (D29, write-once). If the constraint costs anything at all, it costs it here.',
  }),
]);

/* -------------------------------------------------------------------------- *
 * The study
 * -------------------------------------------------------------------------- */

/** One operating point's answer. */
export interface DispatchPointResult {
  readonly id: string;
  readonly label: string;
  readonly building: string;
  readonly prediction: string;
  readonly replications: number;
  /** `false` when either arm lost its AWT. Every cell is then `UNQUOTABLE`. */
  readonly quotable: boolean;
  readonly quotabilityReason: string | undefined;
  readonly saturatedC: number;
  readonly saturatedD: number;
  /** `D − C`, one cell per metric, in {@link CONTRAST_METRICS} order. */
  readonly cells: readonly CellComparison[];
  /** Replications on which the two arms produced an identical value for every metric. */
  readonly bitIdentical: number;
  /** Whether replication `i` of both arms saw the same passenger population. */
  readonly crnAligned: boolean;
  readonly experiment: ExperimentResult;
  /** The cell for one metric. @throws Error when it was not measured. */
  readonly cell: (metric: ReplicationMetric) => CellComparison;
}

export interface DispatchContrastStudy {
  readonly seed: number;
  readonly points: readonly DispatchPointResult[];
  /** The gate metric, named once so a reader does not have to infer it from the table. */
  readonly gateMetric: ReplicationMetric;
  /** `n` the observed spread says each point's ΔTTD needs for a ±0.5 s half-width. */
  readonly budget: readonly BudgetRow[];
}

/** What one point's spread says about the budget it was spent at. */
export interface BudgetRow {
  readonly pointId: string;
  readonly sdOfDifference: number;
  readonly halfWidth: number;
  readonly effect: number;
  /** `n` for a ±0.5 s half-width at 95 %, from the observed spread. */
  readonly replicationsForHalfWidth: number;
}

const Z_95 = 1.959_963_984_540_054;

/** `n` for a target half-width at 95 %, from an observed spread. */
export function replicationsForHalfWidth(sdOfDifference: number, halfWidth: number): number {
  if (!Number.isFinite(sdOfDifference) || halfWidth <= 0) return Number.NaN;
  return Math.max(1, Math.ceil(((Z_95 * sdOfDifference) / halfWidth) ** 2));
}

export interface DispatchContrastOptions {
  readonly seed?: number | undefined;
  readonly replications?: number | undefined;
  readonly points?: readonly DispatchPoint[] | undefined;
  readonly resources?: ExperimentResources | undefined;
}

/**
 * Run the C→D contrast at every point, under common random numbers.
 *
 * One `runGateExperiment` per point with both arms in it, which is the whole of the pairing: the
 * trace is a pure function of `(seed, building, traffic)` and identical between the two arms, so
 * `crnAligned` is verified against the runner's own digests rather than assumed.
 */
export async function runDestinationDispatchStudy(
  options: DispatchContrastOptions = {},
): Promise<DispatchContrastStudy> {
  const seed = options.seed ?? BENCHMARK_SEED;
  const points = options.points ?? DISPATCH_POINTS;
  const base = options.resources ?? withProfiles(await loadResources(), []);
  const panel = base.dispatcherProfilesById.get(DISPATCH_ARM);
  if (panel === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no profile "${DISPATCH_ARM}".`);
  }
  // Registered on top of whatever the caller supplied rather than re-loading `data/`: a caller
  // that passed resources did so to control them, and `withProfiles` only takes a `LoadedConfig`.
  const dispatcherProfilesById = new Map(base.dispatcherProfilesById);
  for (const profile of contrastProfiles(panel)) dispatcherProfilesById.set(profile.id, profile);
  const resources: ExperimentResources = Object.freeze({ ...base, dispatcherProfilesById });

  const results: DispatchPointResult[] = [];
  const budget: BudgetRow[] = [];
  for (const point of points) {
    const replications = options.replications ?? point.replications;
    const experiment = await runGateExperiment({
      id: `phase6b/${point.id}`,
      seed,
      building: point.building,
      dispatchers: [DISCLOSURE_ARM, DISPATCH_ARM],
      traffic: point.traffic,
      replications,
      resources,
    });

    const cellC = cellOf(experiment, DISCLOSURE_ARM);
    const cellD = cellOf(experiment, DISPATCH_ARM);
    const quotable = cellC.aggregate.awtIsValid && cellD.aggregate.awtIsValid;
    const cells = CONTRAST_METRICS.map((metric) =>
      compareCell({
        metric,
        armId: DISPATCH_ARM,
        baselineId: DISCLOSURE_ARM,
        candidate: samplesOf(experiment, DISPATCH_ARM, metric),
        baseline: samplesOf(experiment, DISCLOSURE_ARM, metric),
        quotable,
      }),
    );

    const digestsC = digestsOf(experiment, DISCLOSURE_ARM);
    const digestsD = digestsOf(experiment, DISPATCH_ARM);
    const crnAligned =
      digestsC.length === digestsD.length &&
      digestsC.every((digest, index) => digest === digestsD[index]);

    // A replication is bit-identical when every reported metric's paired difference is exactly
    // zero. Not a tolerance: `IDENTICAL` is a claim about the two runs having been the same run.
    let bitIdentical = 0;
    for (let index = 0; index < replications; index += 1) {
      const same = CONTRAST_METRICS.every((metric) => {
        const c = samplesOf(experiment, DISCLOSURE_ARM, metric)[index];
        const d = samplesOf(experiment, DISPATCH_ARM, metric)[index];
        return c !== undefined && d !== undefined && c === d;
      });
      if (same) bitIdentical += 1;
    }

    const gate = cells.find((cell) => cell.metric === 'ttdMeanS');
    if (gate !== undefined) {
      budget.push(
        Object.freeze({
          pointId: point.id,
          sdOfDifference: gate.sdOfDifference,
          halfWidth: (gate.estimate.upper - gate.estimate.lower) / 2,
          effect: gate.estimate.mean,
          replicationsForHalfWidth: replicationsForHalfWidth(gate.sdOfDifference, 0.5),
        }),
      );
    }

    results.push(
      Object.freeze({
        id: point.id,
        label: point.label,
        building: point.building,
        prediction: point.prediction,
        replications,
        quotable,
        quotabilityReason: quotable
          ? undefined
          : (cellD.aggregate.awtInvalidReason ?? cellC.aggregate.awtInvalidReason),
        saturatedC: cellC.aggregate.saturatedCount,
        saturatedD: cellD.aggregate.saturatedCount,
        cells: Object.freeze(cells),
        bitIdentical,
        crnAligned,
        experiment,
        cell: (metric: ReplicationMetric) => {
          const found = cells.find((entry) => entry.metric === metric);
          if (found === undefined) {
            throw new Error(`Metric "${metric}" was not measured at "${point.id}".`);
          }
          return found;
        },
      }),
    );
  }

  return Object.freeze({
    seed,
    points: Object.freeze(results),
    gateMetric: 'ttdMeanS',
    budget: Object.freeze(budget),
  });
}

/** One point's row, or `undefined`. */
export function dispatchPoint(
  study: DispatchContrastStudy,
  id: string,
): DispatchPointResult | undefined {
  return study.points.find((point) => point.id === id);
}

/** The study as the console table the suite prints. Feeds no decision. */
export function formatDispatchContrast(study: DispatchContrastStudy): string {
  const lines: string[] = [
    `Phase 6b — the C→D contrast (D − C), seed ${String(study.seed)}, gate ${study.gateMetric}`,
  ];
  for (const point of study.points) {
    lines.push(
      `  ${point.label}  n=${String(point.replications)}  ` +
        `bit-identical ${String(point.bitIdentical)}/${String(point.replications)}  ` +
        `CRN ${point.crnAligned ? 'aligned' : 'MISALIGNED'}  ` +
        `saturated C=${String(point.saturatedC)} D=${String(point.saturatedD)}` +
        (point.quotable ? '' : `  UNQUOTABLE: ${point.quotabilityReason ?? 'no valid AWT'}`),
    );
    for (const cell of point.cells) {
      const { estimate } = cell;
      lines.push(
        `    ${(CONTRAST_METRIC_LABELS[cell.metric] ?? cell.metric).padEnd(10)} ` +
          `${estimate.mean.toFixed(3)} [${estimate.lower.toFixed(3)}, ${estimate.upper.toFixed(3)}]  ` +
          `${cell.verdict}  sd=${cell.sdOfDifference.toFixed(3)}`,
      );
    }
  }
  for (const row of study.budget) {
    lines.push(
      `  budget ${row.pointId}: sd(ΔTTD)=${row.sdOfDifference.toFixed(3)} s, ` +
        `half-width ${row.halfWidth.toFixed(3)} s, ` +
        `n for ±0.5 s = ${String(row.replicationsForHalfWidth)}`,
    );
  }
  return lines.join('\n');
}
