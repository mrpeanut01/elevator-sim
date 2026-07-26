/**
 * Stage 7 in isolation: **does pre-positioning move AWT on Garden Apartments?**
 *
 * docs/05-roadmap.md § Phase 5's second acceptance criterion is *"pre-positioning shows measurable
 * AWT improvement on Garden Apartments, where parking policy dominates."* This module measures that
 * sentence, and it measures it the only way that isolates the mechanism: **one profile, one field
 * changed**.
 *
 * ```
 * treatment = predictive-balanced                                  (idle.parkingStrategy = predicted-demand)
 * control   = predictive-balanced with idle.parkingStrategy = stay  (everything else byte-identical)
 * ```
 *
 * Comparing `predictive-balanced` against `nearest-car` instead would measure eleven weights, four
 * stage-5 settings, an adaptive dwell policy and the parking strategy all at once, and would attribute
 * the sum to pre-positioning. {@link derivedProfile} makes the one-field variant *data* rather than
 * code (CLAUDE.md invariant 7), which is the only reason the isolation is possible at all.
 *
 * ## The result, and it is a zero rather than a small number
 *
 * **`predicted-demand` and `stay` produce bit-identical runs.** Measured on Garden Apartments at
 * n = 500 under CRN: every one of 500 paired differences is exactly `0`, on every metric, `rho = 1`,
 * interval `[0, 0]`. Not a gain below the resolution limit — *no effect*, of the kind
 * docs/05-roadmap.md § Phase 7 documents for a sub-threshold weight perturbation.
 *
 * The cause is not statistical and is not in this module. `Simulation.#park` builds its
 * `RepositionContext` from `{ entranceFloorIds }` alone — no `demandForecast` — and
 * `lifecycle.parkingCandidates` answers `no-forecast` for `predicted-demand` when none is supplied,
 * which is a **refusal to move**, identical in every observable way to `stay`. So the profile's
 * `idle.predictorHorizonS`, `idle.repositionThresholdS` and `idle.repositionEnergyWeight` are all
 * inert in a real run, and the forecast the `dispatch/predictor` module produces reaches nothing.
 * `core/dispatch/policies/index.ts` names this as gap 4 and states the fix; both files belong to
 * `core`, not here. This module's contribution is the empirical form of the claim: **the criterion is
 * not met, and the measured effect of turning predictive pre-positioning on is exactly zero.**
 *
 * ## Stage 7 is not broken — that is the sharper finding
 *
 * The obvious reading of a zero is "repositioning does nothing on this building". It is wrong, and
 * distinguishing the two is why {@link PARKING_STRATEGIES} runs all four rather than just the two the
 * criterion needs. On the same building, same budget, same pairing:
 *
 * | strategy vs `stay` | AWT difference, 95 % paired-t | verdict |
 * |---|---|---|
 * | `predicted-demand` | `0.00 [0.00, 0.00]` | IDENTICAL — no forecast is ever supplied |
 * | `zone-center` | `0.00 [0.00, 0.00]` | IDENTICAL — no zone partition is supplied either (gap 5); the shaft median is inside its own deadband |
 * | `lobby` | **`+2.16 [+1.54, +2.77]`** | **WORSE**, and far above the resolution limit |
 *
 * So the reposition arithmetic runs, moves cars, and changes AWT by 13 % of the baseline when a
 * strategy actually names a target. Parking policy **does** dominate on Garden Apartments, exactly as
 * the roadmap says. What is missing is the forecast, not the mechanism — and the one parking policy
 * that is fully wired makes this building **worse**, because a residential tower's demand originates
 * upstairs and a car held at the lobby has to climb to every call. `stay` — leaving the car where it
 * last served somebody — beats `lobby` decisively and is what `DISPATCH_DEFAULTS` already does.
 *
 * That is a finding about elevator dispatch and not only about this simulator: the up-peak intuition
 * that motivates lobby parking is a fact about offices at 08:30, and applying it to a sparse
 * residential building costs 2.2 s of mean wait.
 */

import { PARKING_STRATEGIES } from '@elevator-sim/core';
import type { DispatcherProfile, ParkingStrategy } from '@elevator-sim/core';

import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources } from '../runner/types.js';
import { derivedProfile, loadResources, withProfiles } from '../validation/harness.js';

import { BENCHMARK_METRICS, benchmarkCase, type BenchmarkCase } from './arms.js';
import { runBenchmarkCase, type CaseResult } from './suite.js';

/**
 * The profile whose stage 7 is under study.
 *
 * `predictive-balanced` because it is the only shipped profile that declares
 * `idle.parkingStrategy: predicted-demand` — it *is* the pre-positioning dispatcher, and a study of
 * pre-positioning that used any other profile would be studying a strategy nobody configured.
 */
export const PREPOSITIONING_PROFILE = 'predictive-balanced';

/** The control: the same profile that refuses to move an idle car. */
export const CONTROL_STRATEGY: ParkingStrategy = 'stay';

/**
 * All four values of `idle.parkingStrategy`, taken from core's own declaration.
 *
 * The criterion needs only `predicted-demand` against `stay`. The other two are here because a zero
 * has two explanations — "the forecast never arrives" and "repositioning cannot matter on six
 * floors" — and only a strategy that *does* move cars can tell them apart. `lobby` is that strategy.
 *
 * Re-exported from `PARKING_STRATEGIES` rather than re-listed: the study must cover whatever the
 * categorical actually admits, so a fifth strategy added to core appears here without an edit, and
 * `prepositioning.test.ts` asserts the coverage rather than the length.
 */
export const STUDIED_PARKING_STRATEGIES: readonly ParkingStrategy[] = PARKING_STRATEGIES;

/** Arm id for the variant that forces `strategy`. Never parsed; only ever compared. */
export function parkingArmId(strategy: ParkingStrategy): string {
  return `park-${strategy}`;
}

/**
 * `predictive-balanced` with `idle.parkingStrategy` replaced and **nothing else touched**.
 *
 * The rest of `idle` is carried across verbatim, including `predictorHorizonS`,
 * `repositionThresholdS` and `repositionEnergyWeight`. Dropping them would make the control differ
 * from the treatment in four fields instead of one, and the interval would no longer be an interval
 * on the parking strategy.
 */
export function parkingVariant(
  base: DispatcherProfile,
  strategy: ParkingStrategy,
): DispatcherProfile {
  return derivedProfile(base, parkingArmId(strategy), {
    name: `${base.name} (parking: ${strategy})`,
    idle: { ...base.idle, parkingStrategy: strategy },
  });
}

/** What the pre-positioning study measured. */
export interface PrepositioningStudy {
  readonly caseId: string;
  readonly building: string;
  readonly replications: number;
  /** Every strategy compared against {@link CONTROL_STRATEGY}, which is the study's baseline. */
  readonly result: CaseResult;
  /** The strategy the roadmap's criterion is about. */
  readonly treatmentArmId: string;
  /** `true` when `predicted-demand` moved *nothing* — every paired difference exactly zero. */
  readonly predictedDemandIsInert: boolean;
  /** Strategies whose AWT differed from `stay` with an interval excluding zero. */
  readonly strategiesThatMoveAwt: readonly string[];
  /** `true` when the criterion — a measurable AWT *improvement* — is satisfied. */
  readonly criterionMet: boolean;
}

export interface PrepositioningOptions {
  readonly caseId?: string | undefined;
  readonly replications?: number | undefined;
  readonly metrics?: readonly ReplicationMetric[] | undefined;
  readonly resources?: ExperimentResources | undefined;
  readonly seed?: number | string | undefined;
}

/**
 * Run the isolation: four one-field variants of one profile, `stay` as the baseline, CRN throughout.
 *
 * The baseline is `stay` rather than `nearest-car` deliberately. The question is not whether
 * `predictive-balanced` beats the shipped baseline — the main table answers that — it is whether
 * *pre-positioning* is worth anything, and only a control that differs in the parking strategy alone
 * can answer it.
 */
export async function runPrepositioningStudy(
  options: PrepositioningOptions = {},
): Promise<PrepositioningStudy> {
  const spec: BenchmarkCase = benchmarkCase(options.caseId ?? 'garden-residential');
  const config = await loadResources();
  const base = config.dispatcherProfilesById.get(PREPOSITIONING_PROFILE);
  if (base === undefined) {
    throw new Error(
      `data/dispatcher-profiles.json has no profile "${PREPOSITIONING_PROFILE}"; the pre-positioning study has nothing to isolate.`,
    );
  }
  const variants = STUDIED_PARKING_STRATEGIES.map((strategy) => parkingVariant(base, strategy));
  const resources = options.resources ?? withProfiles(config, variants);

  const treatmentArmId = parkingArmId('predicted-demand');
  const result = await runBenchmarkCase(spec, {
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.replications === undefined ? {} : { replications: options.replications }),
    baseline: parkingArmId(CONTROL_STRATEGY),
    arms: STUDIED_PARKING_STRATEGIES.filter((strategy) => strategy !== CONTROL_STRATEGY).map(
      parkingArmId,
    ),
    metrics: options.metrics ?? BENCHMARK_METRICS,
    resources,
  });

  const treatment = result.arms.find((arm) => arm.armId === treatmentArmId);
  const treatmentAwt = treatment?.cell('awtS');
  const movers = result.arms
    .filter((arm) => {
      const verdict = arm.cell('awtS').verdict;
      return verdict === 'BETTER' || verdict === 'WORSE';
    })
    .map((arm) => arm.armId);

  return Object.freeze({
    caseId: spec.id,
    building: spec.building,
    replications: result.replications,
    result,
    treatmentArmId,
    predictedDemandIsInert: treatmentAwt?.verdict === 'IDENTICAL',
    strategiesThatMoveAwt: Object.freeze(movers),
    criterionMet: treatmentAwt?.verdict === 'BETTER',
  });
}
